import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../../firebase/firebaseConfig';
import { getCompletedChallenges, getPendingChallenges, getUserXP } from '../../firebase/firestore';

interface Challenge {
  id: string;
  senderName: string;
  card: {
    vocabulary: string;
    definition: string;
    imageUrl?: string;
    topicName: string;
  };
  createdAt: any;
}

interface CompletedChallenge {
  id: string;
  senderName: string;
  card: {
    vocabulary: string;
  };
  userScore: number;
  completedAt: any;
}

export async function registerPushToken() {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  const uid = auth.currentUser?.uid;
  if (uid) {
    await setDoc(doc(db, 'users', uid), { expoPushToken: token }, { merge: true });
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [completedChallenges, setCompletedChallenges] = useState<CompletedChallenge[]>([]);
  const [allCompletedChallenges, setAllCompletedChallenges] = useState<CompletedChallenge[]>([]);
  const [userXP, setUserXP] = useState(0);

  useEffect(() => {
    // Auth listener
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Optionally register push token here after login
      if (currentUser) {
        registerPushToken(); // call your function from step 2
      }
    });

    // Notification received listener
    const receivedListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Notification tapped listener
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      // e.g., navigate to challenge screen
    });

    return () => {
      unsubscribeAuth();
      receivedListener.remove();
      responseListener.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setUser(auth.currentUser);
      setRefreshKey(prev => prev + 1);
      
      if (auth.currentUser) {
        loadChallenges();
        loadCompletedChallenges();
        loadUserXP();
      }
    }, [])
  );

// Add this helper function after getTimeAgo function
// Get today's completed challenges - now using allCompletedChallenges
  const getTodaysChallenges = () => {
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();
    
    console.log('🔍 Filtering for today:', todayYear, todayMonth + 1, todayDate);
    console.log('📊 Total completed challenges available:', allCompletedChallenges.length);
    
    const filtered = allCompletedChallenges.filter((challenge) => {
      if (!challenge.completedAt) {
        console.log('⚠️ Challenge has no completedAt:', challenge);
        return false;
      }
      
      let completedDate;
      try {
        completedDate = challenge.completedAt.toDate ? 
          challenge.completedAt.toDate() : 
          new Date(challenge.completedAt);
      } catch (error) {
        console.log('❌ Error parsing date:', error, challenge.completedAt);
        return false;
      }
      
      const challengeYear = completedDate.getFullYear();
      const challengeMonth = completedDate.getMonth();
      const challengeDate = completedDate.getDate();
      
      const isToday = (
        challengeYear === todayYear &&
        challengeMonth === todayMonth &&
        challengeDate === todayDate
      );
      
      if (isToday) {
        console.log('✅ Found today challenge:', challenge.card.vocabulary, 'Score:', challenge.userScore);
      }
      
      return isToday;
    });

    console.log('🎯 Total today challenges:', filtered.length);
    return filtered;
  };

  const getTodayTotalXP = (todaysChallenges: CompletedChallenge[]) => {
    const total = todaysChallenges.reduce((total, challenge) => {
      const score = Number(challenge.userScore) || 0;
      console.log('➕ Adding XP:', score, 'from', challenge.card.vocabulary);
      return total + score;
    }, 0);
    
    console.log('💰 Today Total XP:', total);
    return total;
  };

  const loadChallenges = async () => {
    try {
      setLoadingChallenges(true);
      const pendingChallenges = await getPendingChallenges();
      setChallenges(pendingChallenges);
      console.log('📥 Loaded pending challenges:', pendingChallenges.length);
    } catch (error) {
      console.error('❌ Error loading challenges:', error);
    } finally {
      setLoadingChallenges(false);
    }
  };

  const loadCompletedChallenges = async () => {
    try {
      const completed = await getCompletedChallenges();
      console.log('📥 Loaded completed challenges from Firebase:', completed.length);
      setAllCompletedChallenges(completed); // Store ALL challenges for XP calculation
      setCompletedChallenges(completed.slice(0, 3)); // Show only latest 3 in UI
    } catch (error) {
      console.error('❌ Error loading completed challenges:', error);
    }
  };


  const loadUserXP = async () => {
    try {
      const xp = await getUserXP();
      setUserXP(xp);
    } catch (error) {
      console.error('Error loading user XP:', error);
    }
  };

  const getUserDisplayName = () => {
    if (user?.displayName) {
      // Split by spaces and return only the first part
      return user.displayName.trim().split(' ')[0];
    } else if (user?.email) {
      // Use the part before @ and capitalize first letter (optional)
      const namePart = user.email.split('@')[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    return 'User';
  };

  const getUserInitials = () => {
    const name = getUserDisplayName();
    if (name === 'User') return '👤';
    
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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

  const handleSignIn = () => {
    router.push('/login');
  };

  const handleTakeChallenge = () => {
    router.push('/challenge');
  };

  const handleCreateNewCard = () => {
    router.push('/(tabs)/create');
  };

  const handleReviewCards = () => {
    router.push('/(tabs)/review');
  };

  const getSenderNames = () => {
    const senders = [...new Set(challenges.map(c => c.senderName))];
    if (senders.length === 0) return '';
    if (senders.length === 1) return senders[0];
    if (senders.length === 2) return senders.join(' & ');
    return `${senders.slice(0, -1).join(', ')} & ${senders[senders.length - 1]}`;
  };

    // Helper function to get unique topics across all challenges
  const getUniqueTopics = () => {
    const topics = challenges.flatMap(c => 
      Array.isArray(c.card)
        ? c.card.map(card => card.topicName).filter(Boolean)
        : c.card?.topicName ? [c.card.topicName] : []
    );
    return [...new Set(topics)].join(', ');
  };


  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Recently';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  // Calculate today's stats using useMemo to recalculate when allCompletedChallenges changes
  const todaysChallenges = useMemo(() => {
    console.log('🔄 Recalculating todaysChallenges, allCompletedChallenges.length:', allCompletedChallenges.length);
    return getTodaysChallenges();
  }, [allCompletedChallenges]);

  const todayTotalXP = useMemo(() => {
    console.log('🔄 Recalculating todayTotalXP, todaysChallenges.length:', todaysChallenges.length);
    return getTodayTotalXP(todaysChallenges);
  }, [todaysChallenges]);

  console.log('📱 Render - Today challenges count:', todaysChallenges.length, 'Total XP:', todayTotalXP);


  return (
    <View style={styles.container} key={refreshKey}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />

      {/* Greeting Section with XP */}
      <View style={styles.greetingSection}>
        <View>
          <Text style={styles.greetingTitle}>
            {user ? `Hallo, ${getUserDisplayName()}` : 'Welcome!'}
          </Text>
          <Text style={styles.greetingSubtitle}>Ready to learn today?</Text>
          {user && (
            <View style={styles.xpContainer}>
              <Text style={styles.xpBadgeSmall}>⭐ {userXP} XP</Text>
            </View>
          )}
        </View>
        
        <View style={styles.profileContainer}>
          {user ? (
            <TouchableOpacity onPress={handleSignOut} style={styles.profileTouchable}>
              <MaterialCommunityIcons name="logout" size={24} color="#df2b2bff" style={styles.signOutText}/>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSignIn} style={styles.signInButton}>
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
      >
        {/* Friend Challenges Section */}
        {user && !loadingChallenges && challenges.length > 0 && (
          <View style={styles.challengeCard}>
            <LinearGradient
              colors={['#FFC107', '#4CAF50']}
              style={styles.challengeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.challengeContent}>
                <View style={styles.xpBadge}>
                  <Text style={styles.xpText}>+{challenges.length * 10} XP</Text>
                </View>
                
                <View style={styles.challengeInfo}>
                  <Text style={styles.challengeTitle}>
                    {challenges.length === 1 ? 'Friend Challenge!' : 'Friend Challenges!'}
                  </Text>
                  <Text style={styles.challengeDescription}>
                    {challenges.length === 1 
                      ? 'Test your knowledge with 1 new flashcard from your friend!'
                      : `Test your knowledge with ${challenges.length} new flashcards from your friends!`
                    }
                  </Text>
                  
                  <Text style={styles.cardsFrom}>
                    {challenges.length === 1 ? 'Card From' : 'Cards From'}
                  </Text>
                  <Text style={styles.friendNames}>{getSenderNames()}</Text>

                  <View style={styles.xpTC}>
                    <TouchableOpacity 
                      style={styles.takeChallengeButton}
                      onPress={handleTakeChallenge}
                    >
                      <Text style={styles.takeChallengeText}>
                        {challenges.length === 1 ? 'Take Challenge' : `Take ${challenges.length} Challenges`}
                      </Text>
                      <Text style={styles.takeChallengeIcon}>🎯</Text>
                    </TouchableOpacity>
                  </View>

                </View>

              </View>
            </LinearGradient>
          </View>
        )}

        {user && loadingChallenges && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#FFC107" />
            <Text style={styles.loadingText}>Loading challenges...</Text>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <View style={styles.actionsRow}>

            <TouchableOpacity 
              style={styles.cardButton}
              onPress={handleCreateNewCard}
            >            
            <LinearGradient
              colors={['#FFC107', '#4CAF50']}
              style={[styles.challengeGradient, { borderRadius: 12 }]} // 👈 add radius here
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons name="plus-circle" size={32} color="#fff" style={styles.actionIcon}/>
              <Text style={styles.actionText}>Add Card</Text>
            </LinearGradient></TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cardButton}
              onPress={handleReviewCards}
            >
            <LinearGradient
              colors={['#FFC107', '#4CAF50']}
              style={[styles.challengeGradient, { borderRadius: 12 }]} // 👈 add radius here
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons name="cards" size={32} color="#fff" style={styles.actionIcon}/>
              <Text style={styles.actionText}>My Cards</Text>
            </LinearGradient></TouchableOpacity>
          </View>
        </View>

        {/* Recent Activity */}
        {user && completedChallenges.length > 0 && (
          <View style={styles.recentActivityCard}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            
            {/* Today's Summary */}
            {todaysChallenges.length > 0 && (
              <View style={styles.todaySummary}>
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryTitle}>
                    Today's Progress 🎉
                  </Text>
                  <Text style={styles.summaryText}>
                    Completed {todaysChallenges.length} challenge{todaysChallenges.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={styles.totalXPBadge}>
                  <Text style={styles.totalXPText}>+{todayTotalXP} XP</Text>
                </View>
              </View>
            )}

            {completedChallenges.map((challenge, index) => (
              <View key={challenge.id} style={styles.activityItem}>
                <View style={styles.activityIcon}>
                  <Text style={styles.activityIconText}>✅</Text>
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>
                    {challenge.card.vocabulary}
                  </Text>
                  <Text style={styles.activityTime}>
                    {getTimeAgo(challenge.completedAt)}
                  </Text>
                  <Text style={styles.activitySubtitle}>
                    From {challenge.senderName}
                  </Text>
                </View>
                <View style={styles.activityScoreContainer}>
                  <Text style={styles.activityScore}>
                    +{challenge.userScore} XP
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}



        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 75,
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  greetingSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  greetingSubtitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '400',
    marginBottom: 8,
  },
  xpContainer: {
    marginTop: 4,
  },
  xpBadgeSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  profileContainer: {
    alignItems: 'center',
  },
  profileTouchable: {
    alignItems: 'center',
    padding: 5,
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  signOutText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  signInButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  signInText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  challengeCard: {
    marginHorizontal: 20,
    marginBottom: 7,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  challengeGradient: {
    padding: 20,
  },
  challengeContent: {
    position: 'relative',
  },
  xpBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  xpTC: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },

  xpText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  challengeInfo: {
    marginBottom: 5,
  },
  challengeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  challengeDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 12,
    lineHeight: 20,
  },
  cardsFrom: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  friendNames: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  topicsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  topicsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  topicsText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  takeChallengeButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  takeChallengeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  takeChallengeIcon: {
    fontSize: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  quickActionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 5,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',   
    gap: 5,
    justifyContent: 'center',
  },
  cardButton: {
    borderColor: '#fff',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderStyle: 'dashed',
    width: '48%',
    borderRadius: 12,
    justifyContent: 'center',
    gap: 8,
  },
  actionIcon: {
    textAlign: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  recentActivityCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityIconText: {
    fontSize: 18,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  activityScoreContainer: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activityScore: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  bottomSpacer: {
    height: 20,
  },
  todaySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  summaryContent: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  totalXPBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  totalXPText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});