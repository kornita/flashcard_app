import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { addSharedCardFromChallenge, addUserXP, completeChallenge, getPendingChallenges, getTopics, rejectChallenge } from './firebase/firestore';

interface Challenge {
  id: string;
  senderName: string;
  senderId: string;
  card: {
    id: string;
    vocabulary: string;
    definition: string;
    sentence: string;
    imageUrl?: string;
    pronunciation?: string;
    topicName: string;
  };
  createdAt: any;
  recipients: Array<{
    userId: string;
    status: string;
  }>;
}

interface Topic {
  id: string;
  name: string;
  description?: string;
  cardCount: number;
}

export default function ChallengeScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flipAnimation] = useState(new Animated.Value(0));
  const [topics, setTopics] = useState<Topic[]>([]);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    loadChallenges();
    loadTopics();
  }, []);

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const pendingChallenges = await getPendingChallenges();
      setChallenges(pendingChallenges);
      console.log('Loaded challenges:', pendingChallenges);
    } catch (error) {
      console.error('Error loading challenges:', error);
      Alert.alert('Error', 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  const loadTopics = async () => {
    try {
      const fetchedTopics = await getTopics();
      const typedTopics: Topic[] = fetchedTopics.map((topic: any) => ({
        id: topic.id,
        name: topic.name || 'Untitled Topic',
        description: topic.description || '',
        cardCount: topic.cardCount || 0,
      }));
      setTopics(typedTopics);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const handleRejectChallenge = () => {
    Alert.alert(
      'Reject Challenge?',
      'Are you sure you want to reject this challenge? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setRejecting(true);
              const currentChallenge = challenges[currentChallengeIndex];
              await rejectChallenge(currentChallenge.id);
              
              // Remove from local state
              const updatedChallenges = challenges.filter((_, index) => index !== currentChallengeIndex);
              setChallenges(updatedChallenges);
              
              if (updatedChallenges.length === 0) {
                Alert.alert('All Done!', 'No more challenges available.', [
                  { text: 'OK', onPress: () => router.replace('/(tabs)') }
                ]);
              } else if (currentChallengeIndex >= updatedChallenges.length) {
                setCurrentChallengeIndex(0);
              }
              
              setRejecting(false);
            } catch (error) {
              console.error('Error rejecting challenge:', error);
              setRejecting(false);
              Alert.alert('Error', 'Failed to reject challenge');
            }
          }
        }
      ]
    );
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) {
      Alert.alert('Empty Answer', 'Please enter your answer');
      return;
    }

    const currentChallenge = challenges[currentChallengeIndex];
    const correctAnswer = currentChallenge.card.vocabulary;
    const isAnswerCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();

    setIsCorrect(isAnswerCorrect);
    setShowResult(true);

    // Flip animation
    Animated.timing(flipAnimation, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    try {
      setSubmitting(true);
  
      // Calculate score based on correctness
      const score = isAnswerCorrect ? 100 : 0;
      
      console.log('🎯 Submitting challenge:', currentChallenge.id);
      console.log('✅ Is correct:', isAnswerCorrect);
      console.log('💰 Score:', score);
      
      // ✅ GOOD: ONLY call completeChallenge when answer is CORRECT
      if (isAnswerCorrect) {
        await completeChallenge(currentChallenge.id, userAnswer.trim());
        setShowRewardModal(true);
      } else {
        // Wrong answer - challenge stays pending
        console.log('❌ Answer is incorrect, challenge stays pending');
      }
      
      console.log('✅ Challenge completed and saved with score:', score);
      
      // If correct, show reward modal
      if (isAnswerCorrect) {
        setShowRewardModal(true);
      }
    } catch (error) {
      console.error('Error submitting challenge:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCardAndXP = async () => {
    try {
      const currentChallenge = challenges[currentChallengeIndex];

      // Add card to collection
      await addCardToCollection(currentChallenge);

      // Add XP
      await addUserXP(100);

      setShowRewardModal(false);
      Alert.alert('Success!', 'Card added and +100 XP earned! 🎉');
    } catch (error) {
      console.error('Error adding card and XP:', error);
      Alert.alert('Error', 'Failed to add card or XP');
    }
  };

  const handleXPOnly = async () => {
    try {
      // Only add XP
      await addUserXP(100);
      
      setShowRewardModal(false);
      Alert.alert('Success!', '+100 XP earned! 🎉');
    } catch (error) {
      console.error('Error adding XP:', error);
      Alert.alert('Error', 'Failed to add XP');
    }
  };

const addCardToCollection = async (challenge: Challenge) => {
  try {
    // Ensure there is a recipient (first one)
    const recipientId = challenge.recipients?.[0]?.userId;
    if (!recipientId) throw new Error('Recipient not found');

    // Pass the full challenge object + recipientId
    await addSharedCardFromChallenge ({
      card: currentChallenge.card,
      senderId: currentChallenge.senderId,
      recipientId: recipientId,
      addedFrom: 'challenge'
    });

    console.log('Card added to collection successfully');
  } catch (error) {
    console.error('Error adding card to collection:', error);
    throw error;
  }
};



  const handleTryAgain = () => {
    setUserAnswer('');
    setShowResult(false);
    flipAnimation.setValue(0);
  };

  const handleNextChallenge = () => {
    setShowRewardModal(false); // hide modal if visible
    if (currentChallengeIndex < challenges.length - 1) {
      setCurrentChallengeIndex(currentChallengeIndex + 1);
      setUserAnswer('');
      setShowResult(false);
      setIsCorrect(false);
      flipAnimation.setValue(0);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handlePreviousChallenge = () => {
    if (currentChallengeIndex > 0) {
      setCurrentChallengeIndex(currentChallengeIndex - 1);
      setUserAnswer('');
      setShowResult(false);
      setIsCorrect(false);
      flipAnimation.setValue(0);
    }
  };

  const handleBackPress = () => {
    Alert.alert(
      'Leave Challenge?',
      'Are you sure you want to leave? Your progress will not be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() }
      ]
    );
  };

  const frontAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: ['180deg', '360deg'],
        }),
      },
    ],
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Challenge',
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={styles.loadingContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading challenges...</Text>
        </View>
      </>
    );
  }

  if (challenges.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Challenge',
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={styles.emptyContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyText}>No Challenges Available</Text>
          <Text style={styles.emptySubtext}>
            You don't have any pending challenges right now.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const currentChallenge = challenges[currentChallengeIndex];
  const progressPercentage = ((currentChallengeIndex + 1) / challenges.length) * 100;
  const frontZIndex = showResult ? 0 : 2;
  const backZIndex = showResult ? 2 : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Friend Challenge',
          headerBackTitle: 'Back',
          headerShown: true,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '600',
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={handleBackPress}
              style={{ marginLeft: 5 }}
            >
              <Text style={{ fontSize: 16, color: '#007AFF', fontWeight: '500' }}>
                ← Back
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

        {/* Challenge Info Header with Reject Button */}
        <View style={styles.challengeHeader}>
          <View style={styles.challengeHeaderContent}>
            <View style={styles.challengeHeaderLeft}>
              <Text style={styles.challengeFromText}>Challenge from</Text>
              <Text style={styles.senderName}>{currentChallenge.senderName}</Text>
              <Text style={styles.topicBadge}>📚 {currentChallenge.card.topicName}</Text>
            </View>
            <TouchableOpacity 
              style={styles.rejectButton}
              onPress={handleRejectChallenge}
              disabled={rejecting}
            >
              <FontAwesome name="times-circle" size={20} color="#FF3B30" />
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            Challenge {currentChallengeIndex + 1} of {challenges.length}
          </Text>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercentage}%` }
                ]}
              />
            </View>
          </View>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardContainer}>
            {/* Front of Card */}
            <Animated.View
              pointerEvents={showResult ? 'none' : 'auto'}
              style={[
                styles.card,
                styles.cardFront,
                frontAnimatedStyle,
                { zIndex: frontZIndex }
              ]}
            >
              <Text style={styles.questionTitle}>What's this word?</Text>

              <View style={styles.iconContainer}>
                {currentChallenge.card.imageUrl && currentChallenge.card.imageUrl.trim() !== '' ? (
                  <Image
                    source={{ uri: currentChallenge.card.imageUrl }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholderIcon}>
                    <MaterialIcons name="image-not-supported" size={48} color="#999" />
                    <Text style={styles.placeholderText}>No image available</Text>
                  </View>
                )}
              </View>

              <View style={styles.definitionSection}>
                <Text style={styles.sectionLabel}>Definition</Text>
                <Text style={styles.definitionText}>{currentChallenge.card.definition}</Text>
              </View>

              <View style={styles.answerSection}>
                <Text style={styles.answerLabel}>Your Answer:</Text>
                <TextInput
                  style={styles.answerInput}
                  placeholder="Type the vocabulary word..."
                  placeholderTextColor="#999"
                  value={userAnswer}
                  onChangeText={setUserAnswer}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!showResult}
                />
              </View>

              {!showResult && (
                <TouchableOpacity
                  style={[styles.submitButton, (!userAnswer.trim() || submitting) && styles.submitButtonDisabled]}
                  onPress={handleSubmitAnswer}
                  disabled={!userAnswer.trim() || submitting}
                >
                  <LinearGradient
                    colors={(!userAnswer.trim() || submitting) ? ['#ccc', '#999'] : ['#FFC107', '#4CAF50']}
                    style={styles.submitGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.submitButtonText}>
                      {submitting ? 'Submitting...' : 'Submit Answer'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <View style={styles.navigationContainer}>
                <TouchableOpacity
                  onPress={handlePreviousChallenge}
                  style={[styles.navButton, currentChallengeIndex === 0 && styles.navButtonDisabled]}
                  disabled={currentChallengeIndex === 0}
                >
                  <Text style={[styles.navIcon, currentChallengeIndex === 0 && styles.navIconDisabled]}>←</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleNextChallenge}
                  style={[styles.navButton, currentChallengeIndex === challenges.length - 1 && styles.navButtonDisabled]}
                  disabled={currentChallengeIndex === challenges.length - 1}
                >
                  <Text style={[styles.navIcon, currentChallengeIndex === challenges.length - 1 && styles.navIconDisabled]}>→</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Back of Card - Result */}
            <Animated.View
              pointerEvents={showResult ? 'auto' : 'none'}
              style={[
                styles.card,
                styles.cardBack,
                backAnimatedStyle,
                { zIndex: backZIndex }
              ]}
            >
              {isCorrect ? (
                <>
                  <View style={styles.resultIconContainer}>
                    <Text style={styles.resultIconCorrect}>✓</Text>
                  </View>
                  <Text style={styles.resultTitle}>Correct! 🎉</Text>
                  <Text style={styles.resultSubtitle}>Amazing job!</Text>
                  
                  <View style={styles.correctAnswerBox}>
                    <Text style={styles.correctAnswerLabel}>The answer is:</Text>
                    <Text style={styles.correctAnswerText}>{currentChallenge.card.vocabulary}</Text>
                    {currentChallenge.card.pronunciation && (
                      <Text style={styles.pronunciationText}>{currentChallenge.card.pronunciation}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.nextButton}
                    onPress={handleNextChallenge}
                  >
                    <LinearGradient
                      colors={['#4CAF50', '#45a049']}
                      style={styles.nextGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={styles.nextButtonText}>
                        {currentChallengeIndex < challenges.length - 1 ? 'Next Challenge' : 'Finish'}
                      </Text>
                      <FontAwesome name="arrow-right" size={16} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.resultIconContainer}>
                    <Text style={styles.resultIconWrong}>✕</Text>
                  </View>
                  <Text style={styles.resultTitle}>Not Quite!</Text>
                  <Text style={styles.resultSubtitle}>Don't give up!</Text>

                  <View style={styles.wrongAnswerBox}>
                    <Text style={styles.wrongAnswerLabel}>Your answer:</Text>
                    <Text style={styles.wrongAnswerText}>{userAnswer}</Text>
                  </View>

                  <View style={styles.correctAnswerBox}>
                    <Text style={styles.correctAnswerLabel}>The correct answer is:</Text>
                    <Text style={styles.correctAnswerText}>{currentChallenge.card.vocabulary}</Text>
                    {currentChallenge.card.pronunciation && (
                      <Text style={styles.pronunciationText}>{currentChallenge.card.pronunciation}</Text>
                    )}
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={styles.tryAgainButton}
                      onPress={handleTryAgain}
                    >
                      <LinearGradient
                        colors={['#FFA726', '#FF7043']}
                        style={styles.tryAgainGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <FontAwesome name="refresh" size={14} color="#fff" />
                        <Text style={styles.tryAgainButtonText}>Try Again</Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={handleNextChallenge}
                    >
                      <LinearGradient
                        colors={['#999', '#666']}
                        style={styles.skipGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.skipButtonText}>
                          {currentChallengeIndex < challenges.length - 1 ? 'Skip' : 'Finish'}
                        </Text>
                        <FontAwesome name="arrow-right" size={14} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Animated.View>
          </View>
        </ScrollView>

        {/* Reward Modal */}
        <Modal
          visible={showRewardModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowRewardModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.rewardModalContainer}>
              <Text style={styles.rewardModalTitle}>🎉 Congratulations!</Text>
              <Text style={styles.rewardModalSubtitle}>You earned 100 XP!</Text>
              <View style={styles.rewardOptionsContainer}>
                <Text style={styles.rewardOptionsTitle}>What would you like to do?</Text>
      
                <TouchableOpacity
                  style={styles.rewardOption}
                  onPress={handleAddCardAndXP} // only called when user taps this button
                  >
                  <LinearGradient
                    colors={['#4CAF50', '#45a049']}
                    style={styles.rewardOptionGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <FontAwesome name="star" size={20} color="#fff" />
                    <Text style={styles.rewardOptionText}>Add Card & Get XP</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rewardOption}
                  onPress={handleXPOnly} // only XP, no card added
                  >
                    <LinearGradient
                      colors={['#FFC107', '#FF9800']}
                      style={styles.rewardOptionGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <FontAwesome name="star" size={20} color="#fff" />
                      <Text style={styles.rewardOptionText}>Get XP Only</Text>
                    </LinearGradient>
                </TouchableOpacity>

              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  challengeHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  challengeHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  challengeHeaderLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  challengeFromText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  topicBadge: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  rejectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
  progressSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '500',
  },
  progressBarContainer: {
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '80%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFC107',
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    justifyContent: 'space-between',
  },
  cardBack: {
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: '100%',
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 150,
    height: 150,
    borderRadius: 8,
  },
  placeholderIcon: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  definitionSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  definitionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  answerSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  answerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  answerInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  navigationContainer: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    transform: [{ translateY: -22 }],
    pointerEvents: 'box-none',
    zIndex: 1000,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 1001,
  },
  navButtonDisabled: {
    backgroundColor: '#f0f0f0',
    opacity: 0.5,
  },
  navIcon: {
    fontSize: 20,
    color: '#333',
    fontWeight: '600',
  },
  navIconDisabled: {
    color: '#999',
  },
  resultIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultIconCorrect: {
    fontSize: 48,
    color: '#4CAF50',
    fontWeight: '700',
  },
  resultIconWrong: {
    fontSize: 48,
    color: '#FF5252',
    fontWeight: '700',
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  correctAnswerBox: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  correctAnswerLabel: {
    fontSize: 13,
    color: '#2E7D32',
    marginBottom: 8,
    fontWeight: '600',
  },
  correctAnswerText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 4,
  },
  pronunciationText: {
    fontSize: 14,
    color: '#2E7D32',
    fontStyle: 'italic',
  },
  wrongAnswerBox: {
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF9A9A',
  },
  wrongAnswerLabel: {
    fontSize: 13,
    color: '#C62828',
    marginBottom: 8,
    fontWeight: '600',
  },
  wrongAnswerText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#B71C1C',
  },
  nextButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  nextGradient: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  tryAgainButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tryAgainGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tryAgainButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  skipButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  skipGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rewardModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  rewardModalTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  rewardModalSubtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  rewardOptionsContainer: {
    width: '100%',
  },
  rewardOptionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  rewardOption: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  rewardOptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rewardOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});