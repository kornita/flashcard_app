// firebase/firestore.js
// Enhanced version with user authentication integration

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// Helper function to get current user ID
const getCurrentUserId = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to perform this action');
  }
  return user.uid;
};

// Helper function to check if user is authenticated
const requireAuth = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in first.');
  }
  return user;
};

// ========== TOPIC FUNCTIONS WITH USER AUTH ==========

/**
 * Create a new topic for the current user
 */
export const createTopic = async (topicData) => {
  try {
    console.log('Creating topic:', topicData);
    
    const userId = getCurrentUserId();
    
    const docRef = await addDoc(collection(db, 'topics'), {
      name: topicData.name,
      description: topicData.description || '',
      cardCount: 0,
      userId: userId, // Link to current user
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('Topic created with ID:', docRef.id, 'for user:', userId);
    return docRef.id;
  } catch (error) {
    console.error('Error creating topic:', error);
    throw new Error('Failed to create topic: ' + error.message);
  }
};

/**
 * Get all topics for the current user
 */
export const getTopics = async () => {
  try {
    console.log('Fetching topics for current user...');
    
    const userId = getCurrentUserId();
    
    // Simple query without orderBy to avoid index requirement
    const q = query(
      collection(db, 'topics'),
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const topics = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort in JavaScript instead of Firestore to avoid index requirement
    topics.sort((a, b) => {
      const aTime = a.updatedAt?.toDate?.() || new Date(0);
      const bTime = b.updatedAt?.toDate?.() || new Date(0);
      return bTime - aTime; // Descending order (newest first)
    });
    
    console.log(`Retrieved ${topics.length} topics for user ${userId}`);
    return topics;
  } catch (error) {
    console.error('Error getting topics:', error);
    
    // More specific error handling
    if (error.message.includes('requires an index')) {
      console.log('Index required error - trying simpler query...');
      
      try {
        // Even simpler fallback - just get all topics for user
        const simpleQuery = query(
          collection(db, 'topics'),
          where('userId', '==', userId)
        );
        
        const fallbackSnapshot = await getDocs(simpleQuery);
        const fallbackTopics = fallbackSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`Fallback successful: ${fallbackTopics.length} topics retrieved`);
        return fallbackTopics;
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        throw new Error('Unable to load topics. Please try again.');
      }
    }
    
    // For other errors, provide more helpful messages
    if (error.message.includes('User must be authenticated')) {
      throw new Error('Please sign in to view your topics.');
    }
    
    if (error.message.includes('permission-denied')) {
      throw new Error('Access denied. Please check your account permissions.');
    }
    
    // Generic fallback
    throw new Error('Failed to load topics. Please check your internet connection and try again.');
  }
};

/**
 * Get a single topic by ID (with user ownership check)
 */
export const getTopic = async (topicId) => {
  try {
    const userId = getCurrentUserId();
    
    const docRef = doc(db, 'topics', topicId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const topicData = docSnap.data();
      
      // Check if user owns this topic
      if (topicData.userId !== userId) {
        throw new Error('Access denied: This topic belongs to another user');
      }
      
      return {
        id: docSnap.id,
        ...topicData
      };
    } else {
      throw new Error('Topic not found');
    }
  } catch (error) {
    console.error('Error getting topic:', error);
    throw new Error('Failed to load topic: ' + error.message);
  }
};

/**
 * Update a topic (with user ownership check)
 */
export const updateTopic = async (topicId, updateData) => {
  try {
    console.log('Updating topic:', topicId, updateData);
    
    const userId = getCurrentUserId();
    
    // First check if user owns this topic
    const topic = await getTopic(topicId);
    
    const docRef = doc(db, 'topics', topicId);
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: serverTimestamp()
      // Don't allow changing userId
    });
    
    console.log('Topic updated successfully');
  } catch (error) {
    console.error('Error updating topic:', error);
    throw new Error('Failed to update topic: ' + error.message);
  }
};

/**
 * Delete a topic and all its cards (with user ownership check)
 */
export const deleteTopic = async (topicId) => {
  try {
    console.log('Deleting topic:', topicId);
    
    const userId = getCurrentUserId();
    
    // First check if user owns this topic
    const topic = await getTopic(topicId);
    
    const batch = writeBatch(db);
    
    // Get all cards in this topic for this user
    const cardsQuery = query(
      collection(db, 'cards'),
      where('topicId', '==', topicId),
      where('userId', '==', userId)
    );
    
    let cardsSnapshot;
    try {
      cardsSnapshot = await getDocs(cardsQuery);
    } catch (error) {
      console.log('No cards found with topicId, proceeding with topic deletion');
      cardsSnapshot = { docs: [] };
    }
    
    console.log(`Found ${cardsSnapshot.docs.length} cards to delete with topic`);
    
    // Delete all cards in this topic
    cardsSnapshot.docs.forEach((cardDoc) => {
      batch.delete(cardDoc.ref);
    });
    
    // Delete the topic
    const topicRef = doc(db, 'topics', topicId);
    batch.delete(topicRef);
    
    await batch.commit();
    console.log('Topic and associated cards deleted successfully');
  } catch (error) {
    console.error('Error deleting topic:', error);
    throw new Error('Failed to delete topic: ' + error.message);
  }
};

// ========== ENHANCED CARD FUNCTIONS WITH USER AUTH ==========

/**
 * Add a new card to a deck for the current user
 */
export const addCard = async (vocabulary, definition, sentence, imageUrl) => {
  try {
    console.log("Adding card with data:", {vocabulary, definition, sentence, imageUrl });
    
    const userId = getCurrentUserId();
    
    const docRef = await addDoc(collection(db, 'cards'), {
      vocabulary,
      definition,
      sentence,
      imageUrl,
      userId: userId, // Link to current user
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Card added with ID: ', docRef.id, 'for user:', userId);
    return docRef.id;
  } catch (error) {
    console.error('Error in addCard function: ', error);
    throw error;
  }
};

/**
 * Enhanced add card function with topic support and user authentication
 */
export const addCardWithTopic = async (vocabulary, definition, sentence, imageUrl, topicId) => {
  try {
    console.log("Adding card with topic:", {vocabulary, definition, sentence, imageUrl, topicId });
    
    const userId = getCurrentUserId();
    
    // Verify user owns the topic
    if (topicId) {
      await getTopic(topicId); // This will throw if user doesn't own the topic
    }
    
    const batch = writeBatch(db);
    
    // Add the card with topicId and userId
    const cardRef = doc(collection(db, 'cards'));
    
    // Create card data object, only include topicId if it exists
    const cardData = {
      vocabulary,
      definition,
      sentence,
      imageUrl,
      userId: userId, // Link to current user
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Only add topicId if it's defined and not null
    if (topicId && topicId !== undefined && topicId !== null) {
      cardData.topicId = topicId;
    }
    
    batch.set(cardRef, cardData);
    
    // Update the topic's card count only if topicId exists
    if (topicId && topicId !== undefined && topicId !== null) {
      const topicRef = doc(db, 'topics', topicId);
      batch.update(topicRef, {
        cardCount: increment(1),
        updatedAt: serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log('Card with topic added with ID: ', cardRef.id, 'for user:', userId);
    return cardRef.id;
  } catch (error) {
    console.error('Error in addCardWithTopic function: ', error);
    throw error;
  }
};

const addCardToCollection = async (challenge) => {
  try {
    let topicId = topics.find(t => t.name === challenge.card.topicName)?.id;
    
    // Only pass topicId if it exists, otherwise pass null
    const finalTopicId = topicId || null;

    await addCardWithTopic(
      challenge.card.vocabulary,
      challenge.card.definition,
      challenge.card.sentence || '',
      challenge.card.imageUrl || '',
      finalTopicId  // Pass null instead of undefined
    );

    console.log('Card added to collection');
  } catch (error) {
    console.error('Error adding card to collection:', error);
    throw error;
  }
};

/**
 * Update getCards to use new shared card system
 * Keep backward compatibility
 */
export const getCards = async (topicId = null) => {
  try {
    const userId = getCurrentUserId();
    
    // Try new shared cards system first
    try {
      const sharedCards = await getUserCards(topicId);
      if (sharedCards.length > 0) {
        return sharedCards;
      }
    } catch (error) {
      console.log('No shared cards found, trying legacy system');
    }

    // Fallback to legacy system
    let q;
    if (topicId) {
      q = query(
        collection(db, 'cards'),
        where('topicId', '==', topicId)
      );
    } else {
      q = query(
        collection(db, 'cards'),
        where('userId', '==', userId)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const cards = [];
    querySnapshot.forEach((docSnap) => {
      cards.push({ id: docSnap.id, ...docSnap.data() });
    });
    
    console.log(`Retrieved ${cards.length} cards (legacy) for user ${userId}`);
    return cards;
  } catch (error) {
    console.error('Error getting cards:', error);
    throw error;
  }
};

/**
 * Get user's cards (with shared card data)
 */
export const getUserCards = async (topicId = null) => {
  try {
    const userId = getCurrentUserId();
    console.log('Getting cards for user:', userId, 'topicId:', topicId);

    // Get user's card references
    const userCardsRef = collection(db, 'users', userId, 'myCards');
    let q = userCardsRef;

    if (topicId) {
      q = query(userCardsRef, where('topicId', '==', topicId));
    }

    const userCardsSnap = await getDocs(q);
    
    if (userCardsSnap.empty) {
      console.log('No cards found for user');
      return [];
    }

    // Get all shared card IDs
    const sharedCardIds = userCardsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Fetch shared card data
    const cardsPromises = sharedCardIds.map(async (userCard) => {
      try {
        const sharedCardRef = doc(db, 'sharedCards', userCard.sharedCardId);
        const sharedCardSnap = await getDoc(sharedCardRef);
        
        if (sharedCardSnap.exists()) {
          return {
            id: userCard.id, // User's card reference ID
            sharedCardId: userCard.sharedCardId,
            topicId: userCard.topicId,
            addedAt: userCard.addedAt,
            ...sharedCardSnap.data()
          };
        }
        return null;
      } catch (error) {
        console.error('Error fetching shared card:', error);
        return null;
      }
    });

    const cards = (await Promise.all(cardsPromises)).filter(card => card !== null);
    console.log(`Retrieved ${cards.length} cards for user`);
    return cards;
  } catch (error) {
    console.error('Error getting user cards:', error);
    return [];
  }
};

/**
 * Add a shared card to user's collection (card can be owned by multiple users)
 */
export const addSharedCardFromChallenge = async (challengeData) => {
  try {
    const cardsRef = collection(db, 'sharedCards');
    
    console.log('🔍 Checking if card already exists for this recipient...');
    
    // Check if this exact card already exists for this recipient
    const q = query(
      cardsRef,
      where('vocabulary', '==', challengeData.card.vocabulary),
      where('definition', '==', challengeData.card.definition),
      where('recipientId', '==', challengeData.recipientId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      console.log('✅ Card already exists for this recipient, skipping creation');
      return snapshot.docs[0].id;
    }

    console.log('📝 Creating new shared card with recipientId:', challengeData.recipientId);

    const newCard = {
      vocabulary: challengeData.card.vocabulary,
      definition: challengeData.card.definition,
      sentence: challengeData.card.sentence || '',
      imageUrl: challengeData.card.imageUrl || '',
      pronunciation: challengeData.card.pronunciation || '',
      topicId: challengeData.card.topicId || '',
      addedFrom: challengeData.addedFrom || 'challenge',
      senderId: challengeData.senderId,
      recipientId: challengeData.recipientId, // ← CRITICAL: This must be set!
      createdAt: serverTimestamp(),
      lastAddedAt: serverTimestamp(),
    };

    const docRef = await addDoc(cardsRef, newCard);
    console.log('✅ Created new shared card:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error in addSharedCardFromChallenge:', error);
    throw error;
  }
};


/**
 * Keep legacy updateCard for backward compatibility
 */
export const updateCard = async (cardId, updatedData) => {
  try {
    const userId = getCurrentUserId();
    
    // Try new system first
    try {
      await updateSharedCard(cardId, updatedData);
      return;
    } catch (error) {
      console.log('Not a shared card, trying legacy update');
    }

    // Fallback to legacy update
    const cardRef = doc(db, 'cards', cardId);
    const cardSnap = await getDoc(cardRef);
    
    if (!cardSnap.exists()) {
      throw new Error('Card not found');
    }
    
    const cardData = cardSnap.data();
    if (cardData.userId !== userId) {
      throw new Error('Access denied: This card belongs to another user');
    }
    
    await updateDoc(cardRef, {
      ...updatedData,
      updatedAt: new Date()
    });
    
    console.log('Card updated successfully (legacy)');
  } catch (error) {
    console.error('Error updating card:', error);
    throw error;
  }
};

/**
 * Update card in shared system
 */

export const updateSharedCard = async (sharedCardId, updatedData) => {
  try {
    const userId = getCurrentUserId();
    console.log('✏️ Updating shared card:', sharedCardId);

    // Try to get the shared card by direct doc ID
    let sharedCardRef = doc(db, 'sharedCards', sharedCardId);
    let sharedCardSnap = await getDoc(sharedCardRef);

    // 🔍 If not found by doc ID, try to query by the field "sharedCardId"
    if (!sharedCardSnap.exists()) {
      console.warn(`⚠️ No sharedCards doc found by ID ${sharedCardId}. Trying by field...`);
      const sharedCardsQuery = query(
        collection(db, 'sharedCards'),
        where('sharedCardId', '==', sharedCardId)
      );
      const sharedCardsSnap = await getDocs(sharedCardsQuery);

     if (sharedCardsSnap.empty) {
        console.log('ℹ️ Not a shared card, skipping shared update and falling back.');
        return; // ✅ Stop here — not a shared card, don't throw an error
      }

      const foundDoc = sharedCardsSnap.docs[0];
      console.log('✅ Found shared card by field sharedCardId');

      await updateDoc(foundDoc.ref, {
        ...updatedData,
        updatedAt: serverTimestamp(),
        lastEditedBy: userId,
        lastEditedAt: serverTimestamp(),
      });

      console.log('✅ Shared card updated successfully via field match');
      return;
    }

    // --- Step 4: If doc exists, verify recipient
    const cardData = sharedCardSnap.data();
    if (cardData.recipientId !== userId) {
      throw new Error('You can only edit cards shared with you');
    }

    // --- Step 5: Update normally
    await updateDoc(sharedCardRef, {
      ...updatedData,
      updatedAt: serverTimestamp(),
      lastEditedBy: userId,
      lastEditedAt: serverTimestamp(),
    });

    console.log('✅ Shared card updated successfully');
  } catch (error) {
    console.error('❌ Error updating shared card:', error);
    throw error;
  }
};

/**
 * Keep legacy deleteCard for backward compatibility
 */
export const deleteCard = async (cardId) => {
  try {
    const userId = getCurrentUserId();
    
    // Try new system first
    try {
      await removeCardFromCollection(cardId);
      return;
    } catch (error) {
      console.log('Not a shared card, trying legacy delete');
    }

    // Fallback to legacy delete
    const cardRef = doc(db, 'cards', cardId);
    const cardSnap = await getDoc(cardRef);
    
    if (!cardSnap.exists()) {
      throw new Error('Card not found');
    }
    
    const cardData = cardSnap.data();
    
    if (cardData.userId !== userId) {
      throw new Error('Access denied: This card belongs to another user');
    }
    
    const batch = writeBatch(db);
    batch.delete(cardRef);
    
    if (cardData.topicId) {
      const topicRef = doc(db, 'topics', cardData.topicId);
      batch.update(topicRef, {
        cardCount: increment(-1),
        updatedAt: serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log('Card deleted successfully (legacy)');
  } catch (error) {
    console.error('Error deleting card:', error);
    throw error;
  }
};

/* * Delete a shared card (remove from recipient's view)
 * This removes the card from sharedCards collection
 * Only the recipient can delete their copy
 */
export const deleteSharedCard = async (sharedCardId) => {
  try {
    const userId = getCurrentUserId();
    console.log('🗑️ Deleting shared card:', sharedCardId, 'for user:', userId);

    const sharedCardRef = doc(db, 'sharedCards', sharedCardId);
    const sharedCardSnap = await getDoc(sharedCardRef);

    if (!sharedCardSnap.exists()) {
      console.warn(`⚠️ No sharedCards doc found by ID ${sharedCardId}. Skipping shared delete.`);
      return; // ✅ Don't throw — just exit silently
    }

    const cardData = sharedCardSnap.data();

    // Verify user is the recipient (but allow creator as well)
    if (cardData.recipientId !== userId && cardData.sharedBy !== userId) {
      throw new Error('You can only delete cards shared with you or created by you');
    }

    await deleteDoc(sharedCardRef);
    console.log('✅ Shared card deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting shared card:', error);
    // Don't rethrow — prevent duplicate error handling
  }
};

/**
 * Delete card from user's collection (doesn't delete shared card)
 */
export const removeCardFromCollection = async (cardId) => {
  try {
    const userId = getCurrentUserId();
    console.log('🗑️ Removing card from user collection:', cardId);

    const batch = writeBatch(db);

    // 1️⃣ Check if the card exists in user's personal cards
    const userCardRef = doc(db, 'users', userId, 'myCards', cardId);
    const userCardSnap = await getDoc(userCardRef);

    let cardData = null;

    if (userCardSnap.exists()) {
      cardData = userCardSnap.data();
      batch.delete(userCardRef);
      console.log('✅ Removed from user myCards');
    } else {
      console.warn('⚠️ Card not found in user collection, checking main cards...');
    }

    // 2️⃣ Fallback: Try the main "cards" collection
    const mainCardRef = doc(db, 'cards', cardId);
    const mainCardSnap = await getDoc(mainCardRef);

    if (!cardData && mainCardSnap.exists()) {
      cardData = mainCardSnap.data();
      if (cardData.userId === userId) {
        batch.delete(mainCardRef);
        console.log('✅ Removed from main cards');
      }
    }

    if (!cardData) {
      console.warn(`⚠️ Card with ID ${cardId} not found in any collection. Skipping delete.`);
      return;
    }

    // 3️⃣ Handle shared card count (if applicable)
    if (cardData.sharedCardId) {
      const sharedCardRef = doc(db, 'sharedCards', cardData.sharedCardId);
      const sharedCardSnap = await getDoc(sharedCardRef);
      if (sharedCardSnap.exists()) {
        batch.update(sharedCardRef, { userCount: increment(-1) });
        console.log('📉 Decremented shared card user count');
      } else {
        console.warn(`⚠️ Shared card not found for ID ${cardData.sharedCardId}`);
      }
    }

    // 4️⃣ Update topic card count (if applicable)
    if (cardData.topicId) {
      const topicRef = doc(db, 'topics', cardData.topicId);
      const topicSnap = await getDoc(topicRef);
      if (topicSnap.exists()) {
        batch.update(topicRef, {
          cardCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
        console.log('🧮 Updated topic card count');
      } else {
        console.warn(`⚠️ Topic not found for ID ${cardData.topicId}`);
      }
    }

    // 5️⃣ Commit all operations
    await batch.commit();
    console.log('✅ Card removed successfully from all relevant collections');
  } catch (error) {
    console.error('❌ Error removing card from collection:', error);
    throw error;
  }
};


/**
 * Move existing card to a topic (with user ownership checks)
 */
export const moveCardToTopic = async (cardId, newTopicId) => {
  try {
    console.log('Moving card to topic:', cardId, newTopicId);
    
    const userId = getCurrentUserId();
    
    // Get the current card data and verify ownership
    const cardRef = doc(db, 'cards', cardId);
    const cardSnap = await getDoc(cardRef);
    
    if (!cardSnap.exists()) {
      throw new Error('Card not found');
    }
    
    const cardData = cardSnap.data();
    
    // Check card ownership
    if (cardData.userId !== userId) {
      throw new Error('Access denied: This card belongs to another user');
    }
    
    // Verify user owns the new topic
    if (newTopicId) {
      await getTopic(newTopicId); // This will throw if user doesn't own the topic
    }
    
    const oldTopicId = cardData.topicId;
    
    if (oldTopicId === newTopicId) {
      console.log('Card is already in this topic');
      return;
    }
    
    const batch = writeBatch(db);
    
    // Update the card's topicId
    batch.update(cardRef, {
      topicId: newTopicId,
      updatedAt: new Date()
    });
    
    // Update topic counts
    if (oldTopicId) {
      const oldTopicRef = doc(db, 'topics', oldTopicId);
      batch.update(oldTopicRef, {
        cardCount: increment(-1),
        updatedAt: serverTimestamp()
      });
    }
    
    if (newTopicId) {
      const newTopicRef = doc(db, 'topics', newTopicId);
      batch.update(newTopicRef, {
        cardCount: increment(1),
        updatedAt: serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log('Card moved to new topic successfully');
  } catch (error) {
    console.error('Error moving card:', error);
    throw error;
  }
};

// ========== FRIENDS MANAGEMENT FUNCTIONS ==========

/**
 * Get all friends for the current user
 * @returns {Promise<Array>} Array of friend objects
 */

/**
 * Get all accepted friend requests for the current user (without duplicates)
 * @returns {Promise<Array>} Array of friend objects
 */
export const getFriends = async () => {
  try {
    const userId = getCurrentUserId();
    console.log('🔍 Fetching friends for user:', userId);
    
    if (!userId) {
      console.error('❌ No user ID found!');
      return [];
    }
    
    const friendsRef = collection(db, 'friendRequests');
    
    const sentQuery = query(
      friendsRef,
      where('fromUserId', '==', userId),
      where('status', '==', 'accepted')
    );
    
    const receivedQuery = query(
      friendsRef,
      where('toUserId', '==', userId),
      where('status', '==', 'accepted')
    );
    
    const [sentSnapshot, receivedSnapshot] = await Promise.all([
      getDocs(sentQuery),
      getDocs(receivedQuery)
    ]);
    
    console.log('📤 Sent accepted requests:', sentSnapshot.size);
    console.log('📥 Received accepted requests:', receivedSnapshot.size);
    
    // LOG EVERY DOCUMENT TO SEE THE ACTUAL STATUS
    console.log('=== ALL SENT DOCUMENTS ===');
    sentSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id}`);
      console.log(`  To: ${data.toDisplayName} (${data.toEmail})`);
      console.log(`  Status: "${data.status}"`);
      console.log(`  Raw data:`, JSON.stringify(data, null, 2));
    });
    
    console.log('=== ALL RECEIVED DOCUMENTS ===');
    receivedSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id}`);
      console.log(`  From: ${data.fromDisplayName} (${data.fromEmail})`);
      console.log(`  Status: "${data.status}"`);
      console.log(`  Raw data:`, JSON.stringify(data, null, 2));
    });
    
    const friendsMap = new Map();
    
    sentSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.toUserId && !friendsMap.has(data.toUserId)) {
        friendsMap.set(data.toUserId, {
          id: doc.id,
          friendId: data.toUserId,
          name: data.toDisplayName || data.toEmail || 'Unknown User',
          email: data.toEmail || '',
          avatar: data.toPhotoURL || '',
          isOnline: false,
          status: 'offline',
          addedAt: data.acceptedAt || data.createdAt
        });
      }
    });
    
    receivedSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.fromUserId && !friendsMap.has(data.fromUserId)) {
        friendsMap.set(data.fromUserId, {
          id: doc.id,
          friendId: data.fromUserId,
          name: data.fromDisplayName || data.fromEmail || 'Unknown User',
          email: data.fromEmail || '',
          avatar: data.fromPhotoURL || '',
          isOnline: false,
          status: 'offline',
          addedAt: data.acceptedAt || data.createdAt
        });
      }
    });
    
    const friendsList = Array.from(friendsMap.values());
    console.log('✅ Final friends list:', friendsList.length);
    
    return friendsList;
  } catch (error) {
    console.error('❌ Error fetching friends:', error);
    return [];
  }
};

/**
 * Add a friend by email
 * @param {string} email - Email of friend to add
 * @returns {Promise<Object>} Added friend data
 */
export const addFriend = async (email) => {
  try {
    const userId = getCurrentUserId();
    const normalizedEmail = email.toLowerCase().trim();
    
    console.log('Adding friend by email:', normalizedEmail);

    // Find user by email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('User not found with this email');
    }
    
    const friendDoc = querySnapshot.docs[0];
    const friendId = friendDoc.id;
    const friendData = friendDoc.data();
    
    if (friendId === userId) {
      throw new Error('Cannot add yourself as a friend');
    }
    
    // Check if already friends
    const existingFriendQuery = query(
      collection(db, 'users', userId, 'friends'),
      where('friendId', '==', friendId)
    );
    const existingFriend = await getDocs(existingFriendQuery);
    
    if (!existingFriend.empty) {
      throw new Error('Already friends with this user');
    }
    
    // Add to current user's friends subcollection
    const friendsRef = collection(db, 'users', userId, 'friends');
    const newFriendRef = await addDoc(friendsRef, {
      friendId: friendId,
      addedAt: serverTimestamp(),
      status: 'accepted'
    });
    
    // Add current user to friend's friends subcollection (mutual friendship)
    const friendFriendsRef = collection(db, 'users', friendId, 'friends');
    await addDoc(friendFriendsRef, {
      friendId: userId,
      addedAt: serverTimestamp(),
      status: 'accepted'
    });
    
    console.log('Friend added successfully');
    
    return {
      id: newFriendRef.id,
      friendId: friendId,
      name: friendData.displayName || friendData.name || friendData.email,
      email: friendData.email
    };
  } catch (error) {
    console.error('Error adding friend:', error);
    throw error;
  }
};

/**
 * Remove a friend by deleting the friendRequest document
 * @param {string} friendId - ID of the friend user to remove
 * @returns {Promise<void>}
 */
export const removeFriend = async (friendId) => {
  try {
    const currentUserId = getCurrentUserId();
    console.log("🗑️ Removing friend - currentUserId:", currentUserId, "friendId:", friendId);

    const friendRequestsRef = collection(db, "friendRequests");

    // Query friendRequests where current user is sender and friend is receiver
    const sentQuery = query(
      friendRequestsRef, 
      where("fromUserId", "==", currentUserId), 
      where("toUserId", "==", friendId)
    );
    const sentSnap = await getDocs(sentQuery);
    console.log(`📤 Found ${sentSnap.size} sent request(s) to delete`);

    // Query friendRequests where friend is sender and current user is receiver
    const receivedQuery = query(
      friendRequestsRef, 
      where("fromUserId", "==", friendId), 
      where("toUserId", "==", currentUserId)
    );
    const receivedSnap = await getDocs(receivedQuery);
    console.log(`📥 Found ${receivedSnap.size} received request(s) to delete`);

    // Combine all found documents
    const allRequests = [...sentSnap.docs, ...receivedSnap.docs];
    console.log(`📋 Total friend request(s) to delete: ${allRequests.length}`);

    if (allRequests.length === 0) {
      console.log('⚠️ No friend requests found to delete');
      throw new Error('Friend request not found');
    }

    // Delete all friend request documents
    const deletePromises = allRequests.map(async (requestDoc) => {
      try {
        await deleteDoc(doc(db, "friendRequests", requestDoc.id));
        console.log(`✅ Deleted friendRequest document: ${requestDoc.id}`);
      } catch (error) {
        console.error(`❌ Error deleting document ${requestDoc.id}:`, error);
        throw error;
      }
    });

    await Promise.all(deletePromises);

    console.log("✅ Friend removed successfully - all friendRequest documents deleted");
  } catch (error) {
    console.error("❌ Error removing friend:", error);
    throw error;
  }
};
// ========== CHALLENGE FUNCTIONS ==========

/**
 * Send a vocabulary challenge to friends
 * @param {Object} challengeData - Challenge data including card info and recipients
 * @returns {Promise<string>} Challenge ID
 */
export const sendChallenge = async (challengeData) => {
  try {
    const userId = getCurrentUserId();
    console.log('Sending challenge:', challengeData);

    // Get sender info
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const senderName = userData.displayName || userData.name || userData.email || 'Someone';

    // Create challenge document
    const challengesRef = collection(db, 'challenges');
    const challengeDoc = await addDoc(challengesRef, {
      senderId: userId,
      senderName: senderName,
      card: {
        id: challengeData.cardId,
        vocabulary: challengeData.vocabulary,
        definition: challengeData.definition,
        sentence: challengeData.sentence || '',
        imageUrl: challengeData.imageUrl || '',
        pronunciation: challengeData.pronunciation || '',
        topicId: challengeData.topicId || '', // Ensure topicId is saved
        createdAt: serverTimestamp(),
      },
      recipients: challengeData.recipientIds.map(id => ({
        userId: id,
        status: 'pending',
        score: null,
        completedAt: null,
        notified: true
      })),
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      status: 'active'
    });

    console.log('Challenge created with ID:', challengeDoc.id);
    return challengeDoc.id;
  } catch (error) {
    console.error('Error sending challenge:', error);
    throw error;
  }
};

/**
 * Get pending challenges for current user
 * @returns {Promise<Array>} Array of pending challenges
 */
export const getPendingChallenges = async () => {
  try {
    const userId = getCurrentUserId();
    console.log('Fetching pending challenges for user:', userId);

    const challengesRef = collection(db, 'challenges');
    const querySnapshot = await getDocs(challengesRef);
    
    const challenges = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Check if current user is in recipients with pending status
      const userRecipient = data.recipients?.find(r => r.userId === userId && r.status === 'pending');
      
      if (userRecipient) {
        challenges.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    console.log(`Found ${challenges.length} pending challenges`);
    return challenges;
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
};

/**
 * Complete a challenge with user's answer
 * @param {string} challengeId - Challenge ID
 * @param {string} userAnswer - User's answer
 * @returns {Promise<Object>} Result with score and correct answer
 */
export const completeChallenge = async (challengeId, userAnswer) => {
  try {
    const userId = getCurrentUserId();
    console.log('Completing challenge:', challengeId);

    const challengeRef = doc(db, 'challenges', challengeId);
    const challengeSnap = await getDoc(challengeRef);
    
    if (!challengeSnap.exists()) {
      throw new Error('Challenge not found');
    }
    
    const challengeData = challengeSnap.data();
    
    // 🔧 FIX: Compare with vocabulary, not definition!
    const correctAnswer = challengeData.card.vocabulary;
    
    // Simple scoring logic
    const isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    const score = isCorrect ? 100 : 0;
    
    console.log('🔍 Checking answer:', {
      userAnswer: userAnswer.toLowerCase().trim(),
      correctAnswer: correctAnswer.toLowerCase().trim(),
      isCorrect,
      score
    });
    
    // Update challenge with user's completion
    const currentTime = new Date();
    const recipients = challengeData.recipients.map(recipient => {
      if (recipient.userId === userId) {
        return {
          ...recipient,
          status: 'completed',
          score: score,
          userAnswer: userAnswer,
          completedAt: currentTime
        };
      }
      return recipient;
    });
    
    await updateDoc(challengeRef, { 
      recipients,
      updatedAt: serverTimestamp()
    });
    
    // 🆕 ADD: Create a completed challenge document
    // This is what your HomeScreen reads to calculate today's XP
    const completedChallengeRef = doc(collection(db, 'users', userId, 'completedChallenges'));
    
    // Build card object without undefined values
    const cardData = {
      vocabulary: challengeData.card.vocabulary,
      definition: challengeData.card.definition,
    };
    
    // Only add optional fields if they exist
    if (challengeData.card.imageUrl) {
      cardData.imageUrl = challengeData.card.imageUrl;
    }
    if (challengeData.card.topicName) {
      cardData.topicName = challengeData.card.topicName;
    }
    if (challengeData.card.sentence) {
      cardData.sentence = challengeData.card.sentence;
    }
    if (challengeData.card.pronunciation) {
      cardData.pronunciation = challengeData.card.pronunciation;
    }
    
    await setDoc(completedChallengeRef, {
      id: completedChallengeRef.id,
      challengeId: challengeId,
      senderName: challengeData.senderName,
      senderId: challengeData.senderId,
      card: cardData,
      userAnswer: userAnswer,
      userScore: score, // 🎯 This is the field your HomeScreen reads!
      isCorrect: isCorrect,
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    
    console.log('✅ Completed challenge document created with score:', score);
    
    // ❌ REMOVED: Automatic card adding
    // Card will ONLY be added when user explicitly clicks "Add Card & Get XP" 
    // in the reward modal, which calls handleAddCardAndXP() → addCardToCollection() → addSharedCardFromChallenge()
    
    // Remove from user's pending challenges
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      await updateDoc(userRef, {
        pendingChallenges: arrayRemove(challengeId),
        completedChallenges: arrayUnion(challengeId)
      });
    }
    
    console.log('✅ Challenge completed successfully (card NOT auto-added)');
    
    return {
      isCorrect,
      score,
      correctAnswer
    };
  } catch (error) {
    console.error('Error completing challenge:', error);
    throw error;
  }
};

// ========== UTILITY FUNCTIONS WITH USER AUTH ==========

/**
 * Check if topics collection exists for current user
 */
export const checkTopicsExist = async () => {
  try {
    const userId = getCurrentUserId();
    
    const q = query(
      collection(db, 'topics'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    return {
      exists: !snapshot.empty,
      count: snapshot.size
    };
  } catch (error) {
    console.error('Error checking topics:', error);
    return { exists: false, count: 0 };
  }
};

/**
 * Get statistics about topics and cards for current user
 */
export const getStats = async () => {
  try {
    const userId = getCurrentUserId();
    
    const [topics, cards] = await Promise.all([
      getTopics(),
      getCards()
    ]);
    
    const totalCards = topics.reduce((sum, topic) => sum + (topic.cardCount || 0), 0);
    
    return {
      totalTopics: topics.length,
      totalCards: totalCards,
      cardsInDatabase: cards.length,
      topics: topics,
      userId: userId
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return {
      totalTopics: 0,
      totalCards: 0,
      cardsInDatabase: 0,
      topics: [],
      userId: null
    };
  }
};

/**
 * Create sample topic for current user
 */
export const createSampleTopic = async () => {
  try {
    const userId = getCurrentUserId();
    
    const sampleTopic = {
      name: "General",
      description: "General vocabulary cards"
    };
    
    const topicId = await createTopic(sampleTopic);
    console.log('Sample topic created:', topicId, 'for user:', userId);
    return topicId;
  } catch (error) {
    console.error('Error creating sample topic:', error);
    throw error;
  }
};

/**
 * Migration helper: Add userId to existing cards and topics
 */
export const migrateUserData = async () => {
  try {
    const user = requireAuth();
    const userId = user.uid;
    
    console.log('Starting user data migration for user:', userId);
    
    // Get all cards and topics without userId
    const [cardsSnapshot, topicsSnapshot] = await Promise.all([
      getDocs(collection(db, 'cards')),
      getDocs(collection(db, 'topics'))
    ]);
    
    const batch = writeBatch(db);
    let migratedCards = 0;
    let migratedTopics = 0;
    
    // Migrate cards
    cardsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.userId) {
        batch.update(doc.ref, {
          userId: userId,
          updatedAt: new Date()
        });
        migratedCards++;
      }
    });
    
    // Migrate topics
    topicsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.userId) {
        batch.update(doc.ref, {
          userId: userId,
          updatedAt: serverTimestamp()
        });
        migratedTopics++;
      }
    });
    
    if (migratedCards > 0 || migratedTopics > 0) {
      await batch.commit();
    }
    
    console.log(`Migration completed! ${migratedCards} cards and ${migratedTopics} topics migrated.`);
    
    return {
      success: true,
      migratedCards,
      migratedTopics,
      userId
    };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

/**
 * Get shared cards where current user is the recipient
 * This queries sharedCards collection directly by recipientId
 */
export const getSharedCardsForRecipient = async () => {
  try {
    const userId = getCurrentUserId();
    console.log('Fetching shared cards for recipient:', userId);

    // Query sharedCards where recipientId matches current user
    const sharedCardsRef = collection(db, 'sharedCards');
    const q = query(sharedCardsRef, where('recipientId', '==', userId));
    const sharedCardsSnapshot = await getDocs(q);

    console.log(`Found ${sharedCardsSnapshot.docs.length} shared cards for recipient ${userId}`);

    // Map to array with id
    const sharedCards = sharedCardsSnapshot.docs.map(doc => ({
      id: doc.id,
      sharedCardId: doc.id, // Use document ID as sharedCardId
      ...doc.data(),
      isShared: true
    }));

    // Deduplicate by sharedCardId (in case there are duplicates)
    const uniqueCardsMap = new Map();
    sharedCards.forEach(card => {
      if (!uniqueCardsMap.has(card.sharedCardId)) {
        uniqueCardsMap.set(card.sharedCardId, card);
      }
    });

    const uniqueCards = Array.from(uniqueCardsMap.values());
    console.log(`Returning ${uniqueCards.length} unique shared cards for recipient`);
    
    return uniqueCards;
  } catch (error) {
    console.error('Error fetching shared cards for recipient:', error);
    throw error;
  }
};

/**
 * Reject a challenge
 */
export const rejectChallenge = async (challengeId) => {
  try {
    const userId = getCurrentUserId();
    console.log('Rejecting challenge:', challengeId);

    const challengeRef = doc(db, 'challenges', challengeId);
    const challengeSnap = await getDoc(challengeRef);
    
    if (!challengeSnap.exists()) {
      throw new Error('Challenge not found');
    }
    
    const challengeData = challengeSnap.data();
    
    // Update challenge with user's rejection
    // Use a regular Date object instead of serverTimestamp() in the array
    const currentTime = new Date();
    const recipients = challengeData.recipients.map(recipient => {
      if (recipient.userId === userId) {
        return {
          ...recipient,
          status: 'rejected',
          completedAt: currentTime  // Use Date object instead of serverTimestamp()
        };
      }
      return recipient;
    });
    
    await updateDoc(challengeRef, { 
      recipients,
      updatedAt: serverTimestamp()  // serverTimestamp() is OK at the top level
    });
    
    console.log('Challenge rejected successfully');
  } catch (error) {
    console.error('Error rejecting challenge:', error);
    throw error;
  }
};

/**
 * Add XP to user
 */
export const addUserXP = async (xpAmount) => {
  try {
    const userId = getCurrentUserId();
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      await updateDoc(userRef, {
        totalXP: increment(xpAmount),
        updatedAt: serverTimestamp()
      });
    } else {
      // Create user document if doesn't exist
      const currentUser = auth.currentUser;
      await setDoc(userRef, {
        email: currentUser?.email || '',
        displayName: currentUser?.displayName || '',
        totalXP: xpAmount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    console.log(`Added ${xpAmount} XP to user`);
  } catch (error) {
    console.error('Error adding XP:', error);
    throw error;
  }
};

/**
 * Get user's total XP
 */
export const getUserXP = async () => {
  try {
    const userId = getCurrentUserId();
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data().totalXP || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting user XP:', error);
    return 0;
  }
};

/**
 * Get completed challenges (for activity feed)
 */
export const getCompletedChallenges = async () => {
  try {
    const userId = getCurrentUserId();
    console.log('Fetching completed challenges for user:', userId);

    const challengesRef = collection(db, 'challenges');
    const querySnapshot = await getDocs(challengesRef);
    
    const challenges = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Check if current user completed this challenge
      const userRecipient = data.recipients?.find(r => r.userId === userId && r.status === 'completed');
      
      if (userRecipient) {
        challenges.push({
          id: doc.id,
          ...data,
          userScore: userRecipient.score,
          completedAt: userRecipient.completedAt
        });
      }
    });
    
    // Sort by completion date (newest first)
    challenges.sort((a, b) => {
      const aTime = a.completedAt?.toDate?.() || new Date(0);
      const bTime = b.completedAt?.toDate?.() || new Date(0);
      return bTime - aTime;
    });
    
    console.log(`Found ${challenges.length} completed challenges`);
    return challenges;
  } catch (error) {
    console.error('Error fetching completed challenges:', error);
    return [];
  }
};
  
  /**
 * Get cards for display - handles both user topics and shared cards
 * Returns deduplicated cards
 */
export const getCardsForDisplay = async (topicId = null, isShared = false, friendId = null) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('getCardsForDisplay called with:', { topicId, isShared, friendId });

    if (isShared && friendId) {
      // Get shared cards from specific friend
      const myCardsRef = collection(db, 'users', userId, 'myCards');
      const myCardsSnapshot = await getDocs(myCardsRef);
      
      const sharedCardPromises = myCardsSnapshot.docs.map(async (cardDoc) => {
        const cardData = cardDoc.data();
        
        // Filter by friend
        if (cardData.senderId === friendId || cardData.senderId === friendId) {
          const sharedCardRef = doc(db, 'sharedCards', cardData.sharedCardId);
          const sharedCardSnap = await getDoc(sharedCardRef);
          
          if (sharedCardSnap.exists()) {
            return {
              id: cardDoc.id,
              sharedCardId: cardData.sharedCardId,
              ...sharedCardSnap.data(),
              addedFrom: cardData.addedFrom,
              isShared: true
            };
          }
        }
        return null;
      });

      const cards = (await Promise.all(sharedCardPromises)).filter(card => card !== null);
      
      // Deduplicate by sharedCardId
      const uniqueCardsMap = new Map();
      cards.forEach(card => {
        if (card && !uniqueCardsMap.has(card.sharedCardId)) {
          uniqueCardsMap.set(card.sharedCardId, card);
        }
      });
      
      const uniqueCards = Array.from(uniqueCardsMap.values());
      console.log(`Returning ${uniqueCards.length} unique shared cards from friend`);
      return uniqueCards;
      
    } else if (topicId) {
      // Get user's own cards from specific topic
      // First try shared cards system
      const myCardsRef = collection(db, 'users', userId, 'myCards');
      const q = query(myCardsRef, where('topicId', '==', topicId));
      const myCardsSnapshot = await getDocs(q);
      
      if (!myCardsSnapshot.empty) {
        const sharedCardPromises = myCardsSnapshot.docs.map(async (cardDoc) => {
          const cardData = cardDoc.data();
          const sharedCardRef = doc(db, 'sharedCards', cardData.sharedCardId);
          const sharedCardSnap = await getDoc(sharedCardRef);
          
          if (sharedCardSnap.exists()) {
            return {
              id: cardDoc.id,
              sharedCardId: cardData.sharedCardId,
              ...sharedCardSnap.data(),
              topicId: cardData.topicId,
              addedFrom: cardData.addedFrom,
              isShared: false
            };
          }
          return null;
        });

        const cards = (await Promise.all(sharedCardPromises)).filter(card => card !== null);
        
        // Deduplicate by sharedCardId
        const uniqueCardsMap = new Map();
        cards.forEach(card => {
          if (card && !uniqueCardsMap.has(card.sharedCardId)) {
            uniqueCardsMap.set(card.sharedCardId, card);
          }
        });
        
        const uniqueCards = Array.from(uniqueCardsMap.values());
        console.log(`Returning ${uniqueCards.length} unique cards for topic ${topicId}`);
        return uniqueCards;
      }
      
      // Fallback to legacy cards system
      const cardsRef = collection(db, 'cards');
      const legacyQuery = query(
        cardsRef,
        where('userId', '==', userId),
        where('topicId', '==', topicId)
      );
      const legacySnapshot = await getDocs(legacyQuery);
      const legacyCards = legacySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isShared: false
      }));
      
      console.log(`Returning ${legacyCards.length} legacy cards for topic ${topicId}`);
      return legacyCards;
      
    } else {
      // Get all user cards (no topic filter)
      const myCardsRef = collection(db, 'users', userId, 'myCards');
      const myCardsSnapshot = await getDocs(myCardsRef);
      
      if (!myCardsSnapshot.empty) {
        const sharedCardPromises = myCardsSnapshot.docs.map(async (cardDoc) => {
          const cardData = cardDoc.data();
          const sharedCardRef = doc(db, 'sharedCards', cardData.sharedCardId);
          const sharedCardSnap = await getDoc(sharedCardRef);
          
          if (sharedCardSnap.exists()) {
            return {
              id: cardDoc.id,
              sharedCardId: cardData.sharedCardId,
              ...sharedCardSnap.data(),
              topicId: cardData.topicId,
              addedFrom: cardData.addedFrom,
              isShared: false
            };
          }
          return null;
        });

        const cards = (await Promise.all(sharedCardPromises)).filter(card => card !== null);
        
        // Deduplicate by sharedCardId
        const uniqueCardsMap = new Map();
        cards.forEach(card => {
          if (card && !uniqueCardsMap.has(card.sharedCardId)) {
            uniqueCardsMap.set(card.sharedCardId, card);
          }
        });
        
        const uniqueCards = Array.from(uniqueCardsMap.values());
        console.log(`Returning ${uniqueCards.length} total unique cards`);
        return uniqueCards;
      }
      
      // Fallback to legacy system
      const cardsRef = collection(db, 'cards');
      const legacyQuery = query(cardsRef, where('userId', '==', userId));
      const legacySnapshot = await getDocs(legacyQuery);
      const legacyCards = legacySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isShared: false
      }));
      
      console.log(`Returning ${legacyCards.length} total legacy cards`);
      return legacyCards;
    }
  } catch (error) {
    console.error('Error in getCardsForDisplay:', error);
    throw error;
  }
};

