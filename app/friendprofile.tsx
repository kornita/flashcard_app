import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '.././firebase/firebaseConfig';

interface UserStats {
  totalXP: number;
  cardsCreated: number;
  lastActivityDate: string;
}

export default function FriendProfileScreen() {
  const params = useLocalSearchParams();
  const { userId, displayName, email } = params as {
    userId: string;
    displayName: string;
    email: string;
  };

  const [stats, setStats] = useState<UserStats>({
    totalXP: 0,
    cardsCreated: 0,
    lastActivityDate: '',
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [isFriend, setIsFriend] = useState(false);

  useEffect(() => {
    if (userId) {
      loadFriendStats(userId);
      checkFriendship(userId);
    }
  }, [userId]);

  // Check if the user is your friend
  const checkFriendship = async (friendUserId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const friends = userData.friends || [];
        setIsFriend(friends.includes(friendUserId));
      }
    } catch (error) {
      console.error('Error checking friendship:', error);
    }
  };


const loadFriendStats = async (friendUserId: string) => {
  setLoadingStats(true);
  try {
    // 1️⃣ Get friend document
    const friendRef = doc(db, 'users', friendUserId);
    const friendSnap = await getDoc(friendRef);

    let totalXP = 0;
    let lastActivityDate = '';
    if (friendSnap.exists()) {
      const data = friendSnap.data();
      totalXP = typeof data.totalXP === 'number' ? data.totalXP : 0;
      lastActivityDate = data.updatedAt ? data.updatedAt.toDate().toISOString() : '';
    }

    // 2️⃣ Get friend topics
    const topicsQuery = query(collection(db, 'topics'), where('userId', '==', friendUserId));
    const topicsSnap = await getDocs(topicsQuery);
    const myTopicsList = topicsSnap.docs.map(doc => doc.data());

    // 3️⃣ Get shared cards
    const sharedCardsQuery = query(collection(db, 'sharedCards'), where('recipientId', '==', friendUserId));
    const sharedCardsSnap = await getDocs(sharedCardsQuery);
    const sharedCardsList = sharedCardsSnap.docs.map(doc => doc.data());

    // 4️⃣ Calculate totals
    const userCardsCount = myTopicsList.reduce((sum, topic) => sum + (topic.cardCount || 0), 0);
    const uniqueSharedCardsCount = sharedCardsList.length;
    const totalUniqueCards = userCardsCount + uniqueSharedCardsCount;

        console.log('Topics cards:', userCardsCount);
        console.log('Shared cards:', uniqueSharedCardsCount);
        console.log('Total cards:', totalUniqueCards);

    // 5️⃣ Set stats
    setStats({
      totalXP,
      cardsCreated: totalUniqueCards,
      lastActivityDate,
    });
  } catch (error: any) {
    console.error('Error loading friend stats:', error);
    Alert.alert('Error', `Unable to load statistics: ${error.message}`);
  } finally {
    setLoadingStats(false);
  }
};


  const getUserInitials = () => {
    if (displayName) {
      const words = displayName.split(' ');
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      return displayName.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return '👤';
  };

  if (!userId || !displayName) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="account-alert" size={64} color="#ccc" />
          <Text style={styles.errorText}>User not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${displayName}'s Profile`,
          headerBackTitle: 'Back',
          headerTitleAlign: 'center', // ✅ add this
          headerTintColor: '#333',
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '600',
          },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginLeft: 5,
            }}
          >
            <Text style={{
              fontSize: 16,
              color: '#007AFF',
              fontWeight: '500',
            }}>
              ← Back
            </Text>
          </TouchableOpacity>
        ),
        }}
      />

      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

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
              <Text style={styles.headerName}>{displayName}</Text>
              <Text style={styles.headerEmail}>{email}</Text>

              {isFriend && (
                <View style={styles.friendBadge}>
                  <MaterialCommunityIcons name="account-heart" size={16} color="#fff" />
                  <Text style={styles.friendBadgeText}>Friend</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistics</Text>
            {loadingStats ? (
              <View style={styles.statsContainer}>
                <ActivityIndicator size="large" color="#FFC107" />
              </View>
            ) : (
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.totalXP}</Text>
                  <Text style={styles.statLabel}>Total XP</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.cardsCreated}</Text>
                  <Text style={styles.statLabel}>Total Cards</Text>
                </View>
              </View>
            )}
          </View>

          {stats.lastActivityDate && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <View style={styles.infoCard}>
                <View style={styles.activityRow}>
                  <MaterialCommunityIcons name="calendar-clock" size={24} color="#FFC107" />
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityLabel}>Last Active</Text>
                    <Text style={styles.activityValue}>
                      {new Date(stats.lastActivityDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </>
  );
}

// Your styles remain unchanged


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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerGradient: {
    paddingTop: 40,
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
    marginBottom: 12,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
  },
  friendBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
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
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
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
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  activityInfo: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  activityValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 20,
  },
});