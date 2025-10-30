import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

// Get current user ID
const getCurrentUserId = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User must be authenticated");
  }
  return user.uid;
};

// Interface for Challenge
export interface Challenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  cardIds: string[];
  status: "pending" | "accepted" | "rejected" | "completed";
  points: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  score?: number;
}

/**
 * Send a challenge to a friend
 */
export const sendChallenge = async (
  friendId: string,
  friendName: string,
  friendEmail: string,
  cardIds: string[]
) => {
  try {
    const userId = getCurrentUserId();
    const user = auth.currentUser;

    if (!user) {
      throw new Error("User must be authenticated");
    }

    if (cardIds.length === 0) {
      throw new Error("At least one card must be selected");
    }

    // Calculate points based on number of cards
    const points = cardIds.length * 50;

    const challengeData = {
      fromUserId: userId,
      fromUserName: user.displayName || user.email?.split("@")[0] || "Unknown",
      fromUserEmail: user.email || "",
      toUserId: friendId,
      toUserName: friendName,
      toUserEmail: friendEmail,
      cardIds,
      status: "pending",
      points,
      createdAt: new Date().toISOString(),
    };

    const challengesRef = collection(db, "challenges");
    const docRef = await addDoc(challengesRef, challengeData);

    console.log("✅ Challenge sent successfully:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error sending challenge:", error);
    throw error;
  }
};

/**
 * Accept a challenge
 */
export const acceptChallenge = async (challengeId: string) => {
  try {
    const userId = getCurrentUserId();
    const challengeRef = doc(db, "challenges", challengeId);

    const challengeDoc = await getDoc(challengeRef);
    if (!challengeDoc.exists()) throw new Error("Challenge not found");

    const data = challengeDoc.data();
    if (data.toUserId !== userId)
      throw new Error("You are not authorized to accept this challenge");

    if (data.status !== "pending")
      throw new Error("Challenge is no longer pending");

    await updateDoc(challengeRef, {
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    console.log("✅ Challenge accepted:", challengeId);
  } catch (error) {
    console.error("❌ Error accepting challenge:", error);
    throw error;
  }
};

/**
 * Reject a challenge
 */
export const rejectChallenge = async (challengeId: string) => {
  try {
    const userId = getCurrentUserId();
    const challengeRef = doc(db, "challenges", challengeId);

    const challengeDoc = await getDoc(challengeRef);
    if (!challengeDoc.exists()) throw new Error("Challenge not found");

    const data = challengeDoc.data();
    if (data.toUserId !== userId)
      throw new Error("You are not authorized to reject this challenge");

    if (data.status !== "pending")
      throw new Error("Challenge is no longer pending");

    await updateDoc(challengeRef, {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    });

    console.log("✅ Challenge rejected:", challengeId);
  } catch (error) {
    console.error("❌ Error rejecting challenge:", error);
    throw error;
  }
};

/**
 * Complete a challenge
 */
export const completeChallenge = async (
  challengeId: string,
  score: number
) => {
  try {
    const userId = getCurrentUserId();
    const challengeRef = doc(db, "challenges", challengeId);

    const challengeDoc = await getDoc(challengeRef);
    if (!challengeDoc.exists()) throw new Error("Challenge not found");

    const data = challengeDoc.data();
    if (data.toUserId !== userId)
      throw new Error("You are not authorized to complete this challenge");

    if (data.status !== "accepted")
      throw new Error("Challenge must be accepted first");

    await updateDoc(challengeRef, {
      status: "completed",
      completedAt: new Date().toISOString(),
      score,
    });

    console.log("✅ Challenge completed:", challengeId, "Score:", score);
    return score;
  } catch (error) {
    console.error("❌ Error completing challenge:", error);
    throw error;
  }
};

/**
 * Delete a challenge (only sender can delete)
 */
export const deleteChallenge = async (challengeId: string) => {
  try {
    const userId = getCurrentUserId();
    const challengeRef = doc(db, "challenges", challengeId);

    const challengeDoc = await getDoc(challengeRef);
    if (!challengeDoc.exists()) throw new Error("Challenge not found");

    const data = challengeDoc.data();
    if (data.fromUserId !== userId)
      throw new Error("You are not authorized to delete this challenge");

    await deleteDoc(challengeRef);
    console.log("✅ Challenge deleted:", challengeId);
  } catch (error) {
    console.error("❌ Error deleting challenge:", error);
    throw error;
  }
};

/**
 * Get a specific challenge
 */
export const getChallenge = async (
  challengeId: string
): Promise<Challenge | null> => {
  try {
    const challengeRef = doc(db, "challenges", challengeId);
    const challengeDoc = await getDoc(challengeRef);

    if (!challengeDoc.exists()) return null;

    return { id: challengeDoc.id, ...challengeDoc.data() } as Challenge;
  } catch (error) {
    console.error("❌ Error fetching challenge:", error);
    throw error;
  }
};

/**
 * Get challenges received by current user (pending)
 */
export const getReceivedChallenges = async (): Promise<Challenge[]> => {
  try {
    const userId = getCurrentUserId();
    const challengesRef = collection(db, "challenges");

    const q = query(
      challengesRef,
      where("toUserId", "==", userId),
      where("status", "==", "pending")
    );

    const snapshot = await getDocs(q);
    const challenges = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Challenge)
    );

    console.log("✅ Received challenges loaded:", challenges.length);
    return challenges;
  } catch (error) {
    console.error("❌ Error fetching received challenges:", error);
    throw error;
  }
};

/**
 * Get challenges sent by current user
 */
export const getSentChallenges = async (): Promise<Challenge[]> => {
  try {
    const userId = getCurrentUserId();
    const challengesRef = collection(db, "challenges");

    const q = query(challengesRef, where("fromUserId", "==", userId));
    const snapshot = await getDocs(q);

    const challenges = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Challenge)
    );

    console.log("✅ Sent challenges loaded:", challenges.length);
    return challenges;
  } catch (error) {
    console.error("❌ Error fetching sent challenges:", error);
    throw error;
  }
};

/**
 * Get all active (accepted but not completed) challenges
 */
export const getActiveChallenges = async (): Promise<Challenge[]> => {
  try {
    const userId = getCurrentUserId();
    const challengesRef = collection(db, "challenges");

    const q = query(
      challengesRef,
      where("toUserId", "==", userId),
      where("status", "==", "accepted")
    );

    const snapshot = await getDocs(q);
    const challenges = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Challenge)
    );

    console.log("✅ Active challenges loaded:", challenges.length);
    return challenges;
  } catch (error) {
    console.error("❌ Error fetching active challenges:", error);
    throw error;
  }
};

/**
 * Get challenge notifications for the current user
 * Notifications include:
 * - Pending challenges received
 * - Accepted challenges sent
 * - Rejected challenges sent
 * - Completed challenges sent or received
 */
export const getChallengeNotifications = async (): Promise<Challenge[]> => {
  try {
    const userId = getCurrentUserId();
    const challengesRef = collection(db, "challenges");

    // Pending challenges received (need action)
    const pendingReceivedQ = query(
      challengesRef,
      where("toUserId", "==", userId),
      where("status", "==", "pending")
    );

    // Status updates on challenges sent by the user (accepted/rejected/completed)
    const sentUpdatesQ = query(
      challengesRef,
      where("fromUserId", "==", userId),
      where("status", "in", ["accepted", "rejected", "completed"])
    );

    const [pendingSnap, sentSnap] = await Promise.all([
      getDocs(pendingReceivedQ),
      getDocs(sentUpdatesQ),
    ]);

    const notifications: Challenge[] = [
      ...pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)),
      ...sentSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)),
    ];

    console.log("✅ Challenge notifications loaded:", notifications.length);
    return notifications;
  } catch (error) {
    console.error("❌ Error fetching challenge notifications:", error);
    throw error;
  }
};


/**
 * Get completed challenges (both sent and received)
 */
export const getCompletedChallenges = async (): Promise<Challenge[]> => {
  try {
    const userId = getCurrentUserId();
    const challengesRef = collection(db, "challenges");

    const receivedQ = query(
      challengesRef,
      where("toUserId", "==", userId),
      where("status", "==", "completed")
    );
    const sentQ = query(
      challengesRef,
      where("fromUserId", "==", userId),
      where("status", "==", "completed")
    );

    const [receivedSnap, sentSnap] = await Promise.all([
      getDocs(receivedQ),
      getDocs(sentQ),
    ]);

    const challenges = [
      ...receivedSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)),
      ...sentSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)),
    ];

    console.log("✅ Completed challenges loaded:", challenges.length);
    return challenges;
  } catch (error) {
    console.error("❌ Error fetching completed challenges:", error);
    throw error;
  }
};
