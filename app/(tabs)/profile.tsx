import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile,
  User
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';

interface UserStats {
  totalXP: number;
  cardsCreated: number;
  lastActivityDate: string;
}

interface Friend {
  userId: string;
  displayName: string;
  email: string;
  addedAt: string;
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  fromEmail: string;
  toUserId: string;
  toDisplayName: string;
  toEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

interface SearchUser {
  userId: string;
  displayName: string;
  email: string;
  isFriend: boolean;
  hasPendingRequest: boolean;
  requestSentByMe: boolean;
}

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [stats, setStats] = useState<UserStats>({
    totalXP: 0,
    cardsCreated: 0,
    lastActivityDate: '',
  });
  const [loadingStats, setLoadingStats] = useState(true);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showRemoveFriendsModal, setShowRemoveFriendsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // CRITICAL: Store unsubscribe functions and track if listeners are active
  const unsubscribeStatsRef = useRef<(() => void) | null>(null);
  const unsubscribeRequestsRef = useRef<(() => void) | null>(null);
  const unsubscribeSentRequestsRef = useRef<(() => void) | null>(null);
  const isCleaningUpRef = useRef(false); // NEW: Track cleanup state
  const isMountedRef = useRef(true); // NEW: Track if component is mounted
  const isSigningOutRef = useRef(false);


useEffect(() => {
    isMountedRef.current = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMountedRef.current) return;
      
      // If we're signing out, don't do anything
      if (isSigningOutRef.current) return;
      
      setUser(currentUser);
      if (currentUser) {
        setDisplayName(currentUser.displayName || '');
        setEmail(currentUser.email || '');
        
        await ensureUserDocument(currentUser);
        
        loadUserStats(currentUser.uid);
        loadFriendsData(currentUser.uid);
      } else {
        // Clean up when auth state becomes null (but not during our sign-out)
        if (!isSigningOutRef.current) {
          cleanupListeners();
        }
        setLoadingStats(false);
        setLoadingFriends(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      cleanupListeners();
    };
  }, []);

// Cleanup function - synchronous and immediate
  const cleanupListeners = () => {
    // Unsubscribe from stats listener
    if (unsubscribeStatsRef.current) {
      try {
        unsubscribeStatsRef.current();
      } catch (e) {
        // Ignore any errors during cleanup
      }
      unsubscribeStatsRef.current = null;
    }
    
    // Unsubscribe from requests listener
    if (unsubscribeRequestsRef.current) {
      try {
        unsubscribeRequestsRef.current();
      } catch (e) {
        // Ignore any errors during cleanup
      }
      unsubscribeRequestsRef.current = null;
    }
    
    // Unsubscribe from sent requests listener
    if (unsubscribeSentRequestsRef.current) {
      try {
        unsubscribeSentRequestsRef.current();
      } catch (e) {
        // Ignore any errors during cleanup
      }
      unsubscribeSentRequestsRef.current = null;
    }
  };

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (searchQuery.trim() && showSearchModal) {
      searchTimerRef.current = setTimeout(() => {
        searchUsers();
      }, 500);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, showSearchModal]);

  useFocusEffect(
    useCallback(() => {
      if (user?.uid && isMountedRef.current && !isSigningOutRef.current) {
        loadUserStats(user.uid);
        loadFriendsData(user.uid);
      }
    }, [user?.uid])
  );

  const ensureUserDocument = async (currentUser: User) => {
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      const displayNameToUse = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
      
      const userData = {
        email: currentUser.email || '',
        displayName: displayNameToUse,
        updatedAt: serverTimestamp(),
      };

      if (!userDoc.exists()) {
        await setDoc(userRef, {
          ...userData,
          friends: [],
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, userData);
      }
    } catch (error: any) {
      console.error('Error ensuring user document:', error);
    }
  };

 const loadUserStats = async (userId: string) => {
    if (!isMountedRef.current || isSigningOutRef.current) return;
    
    setLoadingStats(true);
    try {
      // Clean up previous listener
      if (unsubscribeStatsRef.current) {
        try {
          unsubscribeStatsRef.current();
        } catch (e) {}
        unsubscribeStatsRef.current = null;
      }

      const userStatsRef = doc(db, 'userStats', userId);
      let userStatsSnap = await getDoc(userStatsRef);

      if (!userStatsSnap.exists()) {
        await initializeUserStats(userId);
        userStatsSnap = await getDoc(userStatsRef);
      }

      let cardsCount = 0;
      
      try {
        const flashcardsQuery = query(
          collection(db, 'flashcards'),
          where('userId', '==', userId)
        );
        const flashcardsSnapshot = await getDocs(flashcardsQuery);
        cardsCount = flashcardsSnapshot.size;
      } catch (error) {
        console.error('Error querying flashcards:', error);
      }

      if (cardsCount === 0) {
        try {
          const cardsQuery = query(
            collection(db, 'cards'),
            where('userId', '==', userId)
          );
          const cardsSnapshot = await getDocs(cardsQuery);
          cardsCount = cardsSnapshot.size;
        } catch (error) {
          console.error('Error querying cards:', error);
        }
      }

      await updateDoc(userStatsRef, {
        cardsCreated: cardsCount,
      });

      if (userStatsSnap.exists()) {
        const data = userStatsSnap.data();
        if (isMountedRef.current && !isSigningOutRef.current) {
          setStats({
            totalXP: data.totalXP || 0,
            cardsCreated: cardsCount,
            lastActivityDate: data.lastActivityDate || '',
          });
        }
      }

      // CRITICAL: Store listener with BOTH success and error handlers
      unsubscribeStatsRef.current = onSnapshot(
        userStatsRef,
        (docSnap) => {
          // Don't update if signing out or unmounted
          if (!isMountedRef.current || isSigningOutRef.current) return;
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setStats({
              totalXP: data.totalXP || 0,
              cardsCreated: data.cardsCreated || 0,
              lastActivityDate: data.lastActivityDate || '',
            });
          }
        },
        () => {
          // Silent error handler - just ignore all errors
          // This prevents any errors from being logged
        }
      );

    } catch (error: any) {
      if (isMountedRef.current && !isSigningOutRef.current) {
        console.error('Error loading stats:', error);
        Alert.alert('Error', `Unable to load statistics: ${error.message}`);
      }
    } finally {
      if (isMountedRef.current && !isSigningOutRef.current) {
        setLoadingStats(false);
      }
    }
  };


  const initializeUserStats = async (userId: string) => {
    try {
      const userStatsRef = doc(db, 'userStats', userId);
      const today = new Date().toISOString().split('T')[0];
      
      await setDoc(userStatsRef, {
        totalXP: 0,
        cardsCreated: 0,
        lastActivityDate: today,
        createdAt: new Date().toISOString(),
      });

      if (isMountedRef.current && !isSigningOutRef.current) {
        setStats({
          totalXP: 0,
          cardsCreated: 0,
          lastActivityDate: today,
        });
      }
    } catch (error) {
      console.error('Error initializing stats:', error);
    }
  };

  const loadFriendsData = async (userId: string) => {
    if (!isMountedRef.current || isSigningOutRef.current) return;
    
    setLoadingFriends(true);
    try {
      // Clean up previous listeners
      if (unsubscribeRequestsRef.current) {
        try {
          unsubscribeRequestsRef.current();
        } catch (e) {}
        unsubscribeRequestsRef.current = null;
      }
      if (unsubscribeSentRequestsRef.current) {
        try {
          unsubscribeSentRequestsRef.current();
        } catch (e) {}
        unsubscribeSentRequestsRef.current = null;
      }

      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          email: auth.currentUser?.email || '',
          displayName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'User',
          friends: [],
          createdAt: serverTimestamp(),
        });
      }

      const userData = userDoc.exists() ? userDoc.data() : { friends: [] };
      const friendIds = userData.friends || [];
      
      const friendsData: Friend[] = [];
      for (const friendId of friendIds) {
        try {
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            const friendData = friendDoc.data();
            friendsData.push({
              userId: friendId,
              displayName: friendData.displayName || friendData.email || 'Unknown User',
              email: friendData.email || '',
              addedAt: friendData.addedAt || new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('Error fetching friend data:', error);
        }
      }
      
      if (isMountedRef.current && !isSigningOutRef.current) {
        setFriends(friendsData);
      }

      const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('toUserId', '==', userId),
        where('status', '==', 'pending')
      );
      
      // CRITICAL: Store listener with silent error handler
      unsubscribeRequestsRef.current = onSnapshot(
        requestsQuery,
        (snapshot) => {
          // Don't update if signing out or unmounted
          if (!isMountedRef.current || isSigningOutRef.current) return;
          
          const requests: FriendRequest[] = [];
          snapshot.forEach((doc) => {
            requests.push({
              id: doc.id,
              ...doc.data(),
            } as FriendRequest);
          });
          setFriendRequests(requests);
        },
        () => {
          // Silent error handler - just ignore all errors
        }
      );

      const sentQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', userId),
        where('status', '==', 'pending')
      );
      
      // CRITICAL: Store listener with silent error handler
      unsubscribeSentRequestsRef.current = onSnapshot(
        sentQuery,
        (snapshot) => {
          // Don't update if signing out or unmounted
          if (!isMountedRef.current || isSigningOutRef.current) return;
          
          const requests: FriendRequest[] = [];
          snapshot.forEach((doc) => {
            requests.push({
              id: doc.id,
              ...doc.data(),
            } as FriendRequest);
          });
          setSentRequests(requests);
        },
        () => {
          // Silent error handler - just ignore all errors
        }
      );

    } catch (error: any) {
      if (isMountedRef.current && !isSigningOutRef.current) {
        console.error('Error loading friends data:', error);
        Alert.alert('Error', `Unable to load friends: ${error.message}`);
      }
    } finally {
      if (isMountedRef.current && !isSigningOutRef.current) {
        setLoadingFriends(false);
      }
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to search');
      return;
    }

    setSearchLoading(true);
    
    try {
      const usersRef = collection(db, 'users');
      let snapshot;
      
      try {
        snapshot = await getDocs(usersRef);
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          Alert.alert(
            'Permission Denied',
            'You don\'t have permission to search users. Please check your Firestore security rules.'
          );
          setSearchLoading(false);
          return;
        }
        throw error;
      }
      
      if (snapshot.empty) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      
      const results: SearchUser[] = [];
      const lowerQuery = searchQuery.toLowerCase().trim();
      
      snapshot.forEach((docSnapshot) => {
        try {
          const userData = docSnapshot.data();
          const userId = docSnapshot.id;
          
          if (userId === user.uid) {
            return;
          }
          
          const displayName = (userData.displayName || '').toLowerCase();
          const email = (userData.email || '').toLowerCase();
          
          if (displayName.includes(lowerQuery) || email.includes(lowerQuery)) {
            const isFriend = friends.some(f => f.userId === userId);
            const sentRequest = sentRequests.find(r => r.toUserId === userId);
            const receivedRequest = friendRequests.find(r => r.fromUserId === userId);
            
            const hasPendingRequest = !!sentRequest || !!receivedRequest;
            const requestSentByMe = !!sentRequest;
            
            results.push({
              userId,
              displayName: userData.displayName || userData.email || 'Unknown User',
              email: userData.email || '',
              isFriend,
              hasPendingRequest,
              requestSentByMe,
            });
          }
        } catch (error) {
          console.error('Error processing user document:', error);
        }
      });
      
      setSearchResults(results);
    } catch (error: any) {
      console.error('Error searching users:', error);
      Alert.alert(
        'Search Error', 
        `Failed to search users: ${error.message}`
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const sendFriendRequest = async (toUserId: string, toDisplayName: string, toEmail: string) => {
    if (!user) return;

    try {
      const existingRequestQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', user.uid),
        where('toUserId', '==', toUserId),
        where('status', '==', 'pending')
      );
      
      const existingSnapshot = await getDocs(existingRequestQuery);
      
      if (!existingSnapshot.empty) {
        Alert.alert('Already Sent', 'You already sent a friend request to this user.');
        return;
      }
      
      const requestData = {
        fromUserId: user.uid,
        fromDisplayName: user.displayName || user.email || 'Unknown User',
        fromEmail: user.email || '',
        toUserId,
        toDisplayName,
        toEmail,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      
      await addDoc(collection(db, 'friendRequests'), requestData);
      
      Alert.alert('Success', `Friend request sent to ${toDisplayName}!`);
      
      await searchUsers();
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', `Failed to send friend request: ${error.message}`);
    }
  };

  const acceptFriendRequest = async (request: FriendRequest) => {
    if (!user) return;

    try {
      console.log('=== ACCEPT FRIEND REQUEST START ===');
      console.log('Current user ID:', user.uid);
      console.log('Request from:', request.fromUserId);
      console.log('Request from display name:', request.fromDisplayName);
      
      // STEP 1: Update friend request status
      console.log('📝 Updating friend request status...');
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });
      console.log('✅ Friend request status updated');

      // STEP 2: Add friend to current user's friends array
      console.log('👤 Adding friend to current user friends array...');
      const currentUserRef = doc(db, 'users', user.uid);
      await updateDoc(currentUserRef, {
        friends: arrayUnion(request.fromUserId),
      });
      console.log('✅ Added to current user friends array');

      // STEP 3: Add current user to friend's friends array
      console.log('👥 Adding current user to friend\'s friends array...');
      try {
        const friendUserRef = doc(db, 'users', request.fromUserId);
        await updateDoc(friendUserRef, {
          friends: arrayUnion(user.uid),
        });
        console.log('✅ Added to friend\'s friends array');
        console.log('🎉 Friend request accepted successfully!');
        
        Alert.alert('Success', `You are now friends with ${request.fromDisplayName}!`);
      } catch (friendUpdateError: any) {
        console.warn('⚠️ Could not update friend\'s friends array:', friendUpdateError.message);
        console.warn('⚠️ Error code:', friendUpdateError.code);
        console.warn('This requires proper Firestore security rules.');
        
        Alert.alert(
          'Partial Success', 
          `You added ${request.fromDisplayName} to your friends list, but couldn't update their list. They may need to accept separately.`
        );
      }
      
      await loadFriendsData(user.uid);
      
      console.log('=== ACCEPT FRIEND REQUEST END ===');
    } catch (error: any) {
      console.error('❌ Error accepting friend request:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      
      if (error.code === 'permission-denied') {
        Alert.alert(
          'Permission Error', 
          'Unable to complete friend request. Please make sure your Firestore security rules allow mutual friend updates.'
        );
      } else {
        Alert.alert('Error', `Failed to accept friend request: ${error.message}`);
      }
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'friendRequests', requestId), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
      });

      Alert.alert('Rejected', 'Friend request has been rejected');
    } catch (error: any) {
      console.error('Error rejecting friend request:', error);
      Alert.alert('Error', `Failed to reject friend request: ${error.message}`);
    }
  };

const removeFriend = async (friendId: string, friendName: string) => {
  if (!user) return;

  Alert.alert(
    'Remove Friend',
    `Are you sure you want to remove ${friendName} from your friends?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('=== REMOVE FRIEND START ===');
            console.log('Current user ID:', user.uid);
            console.log('Friend ID to remove:', friendId);
            console.log('Friend name:', friendName);

            // STEP 1: Delete from friendRequests collection
            const friendRequestsRef = collection(db, 'friendRequests');

            // Query 1: Where current user sent request to friend
            const sentQuery = query(
              friendRequestsRef,
              where('fromUserId', '==', user.uid),
              where('toUserId', '==', friendId)
            );

            // Query 2: Where friend sent request to current user
            const receivedQuery = query(
              friendRequestsRef,
              where('fromUserId', '==', friendId),
              where('toUserId', '==', user.uid)
            );

            console.log('📋 Querying friendRequests...');
            const [sentSnap, receivedSnap] = await Promise.all([
              getDocs(sentQuery),
              getDocs(receivedQuery),
            ]);

            console.log('📤 Sent requests found:', sentSnap.size);
            console.log('📥 Received requests found:', receivedSnap.size);

            // Combine all found documents
            const allRequests = [...sentSnap.docs, ...receivedSnap.docs];
            console.log('📋 Total friendRequest documents to delete:', allRequests.length);

            if (allRequests.length === 0) {
              console.warn('⚠️ No friend request found to delete');
            } else {
              // Delete all friend request documents
              const deletePromises = allRequests.map((requestDoc) => {
                console.log('🗑️ Deleting friendRequest document:', requestDoc.id);
                return deleteDoc(doc(db, 'friendRequests', requestDoc.id));
              });

              await Promise.all(deletePromises);
              console.log('✅ All friendRequest documents deleted');
            }

            // STEP 2: Remove from current user's friends array
            console.log('👤 Removing from current user friends array...');
            const currentUserRef = doc(db, 'users', user.uid);
            await updateDoc(currentUserRef, {
              friends: arrayRemove(friendId),
            });
            console.log('✅ Removed from current user friends array');

            // STEP 3: Try to remove from friend's friends array
            // Note: This requires proper Firestore security rules to work
            console.log('👥 Attempting to remove from friend\'s friends array...');
            try {
              const friendUserRef = doc(db, 'users', friendId);
              await updateDoc(friendUserRef, {
                friends: arrayRemove(user.uid),
              });
              console.log('✅ Removed from friend\'s friends array');
            } catch (friendUpdateError: any) {
              console.warn('⚠️ Could not update friend\'s friends array:', friendUpdateError.message);
              console.warn('This is expected if Firestore security rules don\'t allow it.');
              console.warn('The friend will need to remove you from their end, or you need to implement a Cloud Function.');
            }

            console.log('🎉 Friend removal complete!');

            Alert.alert(
              'Success', 
              `${friendName} has been removed from your friends list. They may need to remove you from their list separately.`
            );

            // Reload friends data
            await loadFriendsData(user.uid);

            console.log('=== REMOVE FRIEND END ===');
          } catch (error: any) {
            console.error('❌ Error removing friend:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error code:', error.code);
            
            if (error.code === 'permission-denied') {
              Alert.alert(
                'Permission Error', 
                'You can remove this friend from your list, but may not have permission to update their list. Please check your Firestore security rules.'
              );
            } else {
              Alert.alert('Error', `Failed to remove friend: ${error.message}`);
            }
          }
        },
      },
    ]
  );
};


  const viewProfile = (userId: string, displayName: string, email: string) => {
    router.push({
      pathname: '/friendprofile',
      params: { userId, displayName, email }
    });
  };

  const getUserInitials = () => {
    if (displayName) {
      const words = displayName.split(' ');
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return displayName.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return '👤';
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    if (!displayName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      await updateProfile(user, {
        displayName: displayName.trim(),
      });
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        updatedAt: serverTimestamp(),
      });
      
      await user.reload();
      
      Alert.alert('Success', 'Profile updated successfully!');
      setIsEditingName(false);
    } catch (error: any) {
      console.error('Update profile error:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      
      Alert.alert('Success', 'Password changed successfully!');
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Change password error:', error);
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Error', 'Current password is incorrect');
      } else {
        Alert.alert('Error', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      router.replace('/login');
    } catch (error: any) {
      console.error('Sign out error:', error);
    }
  };
  

  if (!user) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
        <View style={styles.notLoggedIn}>
          <Text style={styles.notLoggedInText}>Please sign in to view your profile</Text>
          <TouchableOpacity 
            style={styles.signInButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#FFC107', '#4CAF50']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getUserInitials()}</Text>
              </View>
            </View>
              {isEditingName ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.input}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <View style={styles.editButtons}>
                    <TouchableOpacity 
                      onPress={() => {
                        setDisplayName(user.displayName || '');
                        setIsEditingName(false);
                      }}
                      style={styles.cancelButton}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={handleUpdateProfile}
                      style={styles.saveButton}
                      disabled={loading}
                    >
                      <Text style={styles.saveButtonText}>
                        {loading ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.infoValueContainer}>
                  <Text style={styles.headerName}>{displayName || 'Not set'}   </Text>
                  <TouchableOpacity onPress={() => setIsEditingName(true)}>
                       <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

            <Text style={styles.headerEmail}>{email}</Text>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <View style={styles.friendActions}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowSearchModal(true)}
              >
                <MaterialCommunityIcons name="account-plus" size={24} color="#4CAF50" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowRemoveFriendsModal(true)}
              >
                <MaterialCommunityIcons name="account-minus" size={24} color="#FF3B30" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowFriendsModal(true)}
              >
                <MaterialCommunityIcons name="account-group" size={24} color="#FFC107" />
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.infoCard}>
            {loadingFriends ? (
              <ActivityIndicator size="small" color="#FFC107" />
            ) : (
              <>
                <View style={styles.friendsRow}>
                  <View style={styles.friendStat}>
                    <Text style={styles.friendCount}>{friends.length}</Text>
                    <Text style={styles.friendLabel}>Friends</Text>
                  </View>
                  <View style={styles.friendStat}>
                    <Text style={styles.friendCount}>{friendRequests.length}</Text>
                    <Text style={styles.friendLabel}>Requests</Text>
                  </View>
                </View>
                
                {friendRequests.length > 0 && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.requestsTitle}>Pending Requests</Text>
                    {friendRequests.slice(0, 2).map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <View style={styles.requestInfo}>
                          <Text style={styles.requestName}>{request.fromDisplayName}</Text>
                          <Text style={styles.requestEmail}>{request.fromEmail}</Text>
                        </View>
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={styles.acceptButton}
                            onPress={() => acceptFriendRequest(request)}
                          >
                            <MaterialCommunityIcons name="check" size={20} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectButton}
                            onPress={() => rejectFriendRequest(request.id)}
                          >
                            <MaterialCommunityIcons name="close" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    {friendRequests.length > 2 && (
                      <TouchableOpacity
                        style={styles.viewAllButton}
                        onPress={() => setShowFriendsModal(true)}
                      >
                        <Text style={styles.viewAllText}>View all requests</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <View style={styles.infoCard}>
            <TouchableOpacity 
              style={styles.actionRow}
              onPress={() => setIsChangingPassword(true)}
            >
              <View style={styles.actionLeft}>
                <MaterialCommunityIcons name="lock-reset" size={20} color="#666" />
                <Text style={styles.actionText}>Change Password</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <MaterialCommunityIcons name="logout" size={20} color="#FF3B30" />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={showFriendsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFriendsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Friends & Requests</Text>
              <TouchableOpacity onPress={() => setShowFriendsModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {friendRequests.length > 0 && (
                <>
                  <Text style={styles.modalSectionTitle}>Friend Requests ({friendRequests.length})</Text>
                  {friendRequests.map((request) => (
                    <View key={request.id} style={styles.modalItem}>
                      <View style={styles.modalItemInfo}>
                        <Text style={styles.modalItemName}>{request.fromDisplayName}</Text>
                        <Text style={styles.modalItemEmail}>{request.fromEmail}</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={styles.acceptButton}
                          onPress={() => acceptFriendRequest(request)}
                        >
                          <MaterialCommunityIcons name="check" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectButton}
                          onPress={() => rejectFriendRequest(request.id)}
                        >
                          <MaterialCommunityIcons name="close" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <Text style={styles.modalSectionTitle}>
                My Friends ({friends.length})
              </Text>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends yet. Start adding some!</Text>
              ) : (
                friends.map((friend) => (
                  <TouchableOpacity
                    key={friend.userId}
                    style={styles.modalItem}
                    onPress={() => {
                      setShowFriendsModal(false);
                      viewProfile(friend.userId, friend.displayName, friend.email);
                    }}
                  >
                    <View style={styles.modalItemInfo}>
                      <Text style={styles.modalItemName}>{friend.displayName}</Text>
                      <Text style={styles.modalItemEmail}>{friend.email}</Text>
                    </View>
                    <View style={styles.friendItemActions}>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#999" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRemoveFriendsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRemoveFriendsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Friends</Text>
              <TouchableOpacity onPress={() => setShowRemoveFriendsModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.removeHint}>
                Tap on a friend to view their profile, or tap the minus icon to remove them
              </Text>
              
              <ScrollView style={styles.removeFriendsList}>
                {loadingFriends ? (
                  <ActivityIndicator size="large" color="#FFC107" style={styles.searchLoader} />
                ) : friends.length === 0 ? (
                  <View style={styles.emptySearchContainer}>
                    <MaterialCommunityIcons name="account-group-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No friends to remove</Text>
                    <Text style={styles.emptySubtext}>
                      Add some friends first!
                    </Text>
                  </View>
                ) : (
                  friends.map((friend) => (
                    <View key={friend.userId} style={styles.removeFriendItemWrapper}>
                      <TouchableOpacity
                        style={styles.removeFriendItemClickable}
                        onPress={() => {
                          setShowRemoveFriendsModal(false);
                          viewProfile(friend.userId, friend.displayName, friend.email);
                        }}
                      >
                        <View style={styles.removeFriendInfo}>
                          <Text style={styles.removeFriendName}>{friend.displayName}</Text>
                          <Text style={styles.removeFriendEmail}>{friend.email}</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#999" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeFriendDeleteButton}
                        onPress={() => removeFriend(friend.userId, friend.displayName)}
                      >
                        <MaterialCommunityIcons name="account-minus-outline" size={24} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSearchModal(false);
          setSearchQuery('');
          setSearchResults([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Friends</Text>
              <TouchableOpacity onPress={() => {
                setShowSearchModal(false);
                setSearchQuery('');
                setSearchResults([]);
              }}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by username or email"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchLoading && (
                  <View style={styles.searchLoadingIndicator}>
                    <ActivityIndicator size="small" color="#FFC107" />
                  </View>
                )}
              </View>

              <Text style={styles.searchHint}>
                Start typing to search for users automatically
              </Text>

              <ScrollView style={styles.searchResults}>
                {searchLoading && !searchResults.length ? (
                  <ActivityIndicator size="large" color="#FFC107" style={styles.searchLoader} />
                ) : searchResults.length === 0 && searchQuery ? (
                  <View style={styles.emptySearchContainer}>
                    <MaterialCommunityIcons name="account-search" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No users found</Text>
                    <Text style={styles.emptySubtext}>
                      Try searching with a different name or email
                    </Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.emptySearchContainer}>
                    <MaterialCommunityIcons name="account-search" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>Search for friends</Text>
                    <Text style={styles.emptySubtext}>
                      Enter a username or email to find users
                    </Text>
                  </View>
                ) : (
                  searchResults.map((result) => (
                    <View key={result.userId} style={styles.searchResultItem}>
                      <View style={styles.modalItemInfo}>
                        <Text style={styles.modalItemName}>{result.displayName}</Text>
                        <Text style={styles.modalItemEmail}>{result.email}</Text>
                      </View>
                      {result.isFriend ? (
                        <View style={styles.friendBadge}>
                          <MaterialCommunityIcons name="check-circle" size={16} color="#4CAF50" />
                          <Text style={styles.friendBadgeText}>Friend</Text>
                        </View>
                      ) : result.hasPendingRequest && result.requestSentByMe ? (
                        <View style={styles.pendingBadge}>
                          <MaterialCommunityIcons name="clock-outline" size={16} color="#FFC107" />
                          <Text style={styles.pendingBadgeText}>Pending</Text>
                        </View>
                      ) : result.hasPendingRequest ? (
                        <TouchableOpacity
                          style={styles.respondButton}
                          onPress={() => {
                            setShowSearchModal(false);
                            setShowFriendsModal(true);
                          }}
                        >
                          <Text style={styles.respondButtonText}>Respond</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.addButton}
                          onPress={() => sendFriendRequest(result.userId, result.displayName, result.email)}
                        >
                          <MaterialCommunityIcons name="account-plus" size={20} color="#fff" />
                          <Text style={styles.addButtonText}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isChangingPassword}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsChangingPassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setIsChangingPassword(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity 
                style={styles.modalButton}
                onPress={handleChangePassword}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FFC107', '#4CAF50']}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.modalButtonText}>
                    {loading ? 'Changing...' : 'Change Password'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  notLoggedIn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notLoggedInText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#FFC107',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  profileHeader: {
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#4CAF50',
  },
  headerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  friendActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  
  infoValueContainer: {
    flexDirection: 'row',       // put text & icon side by side
    alignItems: 'center',      // vertically center items
    justifyContent: 'center', // horizontally align left
    width: '52%',               // make sure spacing works across the row
    marginTop: 6,                // optional spacing from above
  },

  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },

input: {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 8,
  paddingVertical: 8,
  paddingHorizontal: 12,
  fontSize: 16,
  backgroundColor: '#fff',
  width: '100%',
  marginBottom: 10, // space between input and buttons
},

editContainer: {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderRadius: 10,
  padding: 12,
  marginTop: 8,
  width: '100%',
  shadowColor: '#000',
  shadowOpacity: 0.1,
  shadowOffset: { width: 0, height: 1 },
  shadowRadius: 3,
  elevation: 2,
},

editButtons: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
},

cancelButton: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 8,
  backgroundColor: '#f0f0f0',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: '#e0e0e0',
},

cancelButtonText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#555',
},

saveButton: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 8,
  backgroundColor: '#4CAF50',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: '#4CAF50',
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowOffset: { width: 0, height: 1 },
  shadowRadius: 2,
  elevation: 1,
},

saveButtonText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#fff',
},
  friendsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  friendStat: {
    alignItems: 'center',
  },
  friendCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  friendLabel: {
    fontSize: 12,
    color: '#666',
  },
  requestsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  requestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  requestEmail: {
    fontSize: 12,
    color: '#666',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 8,
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    padding: 8,
    borderRadius: 8,
  },
  viewAllButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFC107',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    minHeight: 100,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFC107',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#f0f0f0',
    height: 40,
  },
  signOutButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  bottomSpacer: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalItemInfo: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalItemEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  friendItemActions: {
    padding: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
  },
  emptySearchContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  searchContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    paddingRight: 48,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  searchLoadingIndicator: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  searchHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  searchResults: {
    maxHeight: 400,
  },
  searchLoader: {
    marginVertical: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  friendBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFC107',
  },
  respondButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  respondButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  modalButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    padding: 16,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  removeHint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  removeFriendsList: {
    maxHeight: 450,
  },
  removeFriendItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  removeFriendItemClickable: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 8,
  },
  removeFriendInfo: {
    flex: 1,
  },
  removeFriendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  removeFriendEmail: {
    fontSize: 14,
    color: '#666',
  },
  removeFriendDeleteButton: {
    padding: 12,
    paddingRight: 16,
  },
});