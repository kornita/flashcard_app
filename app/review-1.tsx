import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { getCards } from './firebase/firestore';

interface Card {
  id: string;
  vocabulary: string;
  pronunciation?: string;
  definition: string;
  sentence: string;
  imageUrl?: string;
  createdAt?: any;
}

export default function Review1Screen() {
  const [currentCard, setCurrentCard] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [flipAnimation] = useState(new Animated.Value(0));
  const [loading, setLoading] = useState(true);
  
  // Get parameters from navigation
  const { newCardId } = useLocalSearchParams<{ newCardId?: string }>();


  // Load cards on component mount
  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      setLoading(true);
      const fetchedCards = await getCards();
      setCards(fetchedCards);
      setTotalCards(fetchedCards.length);
    } catch (error) {
      console.error('Error loading cards:', error);
      Alert.alert('Error', 'Failed to load cards from database');
    } finally {
      setLoading(false);
    }
  };

  const handleStarPress = () => {
    setIsStarred(!isStarred);
  };

  const handleBackPress = () => {
    router.back();
  };

  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    
    Animated.timing(flipAnimation, {
      toValue,
      duration: 600,
      useNativeDriver: true,
    }).start();
    
    setIsFlipped(!isFlipped);
  };

  const handlePreviousCard = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
      setIsFlipped(false);
      setIsStarred(false);
      flipAnimation.setValue(0);
    }
  };

  const handleNextCard = () => {
    if (currentCard < totalCards - 1) {
      setCurrentCard(currentCard + 1);
      setIsFlipped(false);
      setIsStarred(false);
      flipAnimation.setValue(0);
    }
  };

  const progressPercentage = totalCards > 0 ? ((currentCard + 1) / totalCards) * 100 : 0;

  // Front card rotation
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

  // Back card rotation
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
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your cards...</Text>
      </View>
    );
  }

  if (totalCards === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <Text style={styles.emptyText}>No cards found</Text>
        <Text style={styles.emptySubtext}>Create some vocabulary cards first!</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentCardData = cards[currentCard];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Detail Card {currentCard + 1}</Text>
        
        <View style={styles.headerMain}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Vocabulary Cards</Text>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareIcon}>⤴</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Title */}
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>My Collection</Text>
      </View>

      <View style={{ height: 20 }} />
      
      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>{currentCard + 1} out of {totalCards}</Text>
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

      <View style={{ height: 50 }} />

      {/* Flip Card Container */}
      <View style={styles.cardContainer}>
        <TouchableOpacity onPress={handleFlip} style={styles.cardTouchable}>
          {/* Front of Card */}
          <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
            <TouchableOpacity onPress={handleStarPress} style={styles.starContainer}>
              <Text style={[styles.starIcon, isStarred && styles.starIconFilled]}>★</Text>
            </TouchableOpacity>
            
            <View style={styles.iconContainer}>
              {currentCardData.imageUrl ? (
                <Image 
                  source={{ uri: currentCardData.imageUrl }} 
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.placeholderIcon}>
                  <Text style={styles.placeholderText}>📚</Text>
                </View>
              )}
            </View>
            
            <Text style={styles.wordTitle}>{currentCardData.vocabulary}</Text>
            {currentCardData.pronunciation && (
              <Text style={styles.pronunciation}>{currentCardData.pronunciation}</Text>
            )}
            
            <TouchableOpacity style={styles.tapButton}>
              <Text style={styles.tapButtonText}>Tap to see the definition</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Back of Card */}
          <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
            <TouchableOpacity onPress={handleStarPress} style={styles.starContainer}>
              <Text style={[styles.starIcon, isStarred && styles.starIconFilled]}>★</Text>
            </TouchableOpacity>
            
            <Text style={styles.wordTitleBack}>{currentCardData.vocabulary}</Text>
            {currentCardData.pronunciation && (
              <Text style={styles.pronunciationBack}>{currentCardData.pronunciation}</Text>
            )}
            
            <View style={styles.definitionSection}>
              <Text style={styles.sectionLabel}>Definition</Text>
              <Text style={styles.definitionText}>{currentCardData.definition}</Text>
            </View>

            {currentCardData.sentence && (
              <>
                <View style={styles.sentenceSection}>
                  <Text style={styles.sectionLabel}>Sentence</Text>
                </View>
                <Text style={styles.sentenceText}>{currentCardData.sentence}</Text>
              </>
            )}
            
            {currentCardData.imageUrl && (
              <TouchableOpacity style={styles.pictureButton}>
                <Text style={styles.pictureButtonText}>Tap to see the picture</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity 
          onPress={handlePreviousCard} 
          style={[styles.navButton, currentCard === 0 && styles.navButtonDisabled]}
          disabled={currentCard === 0}
        >
          <Text style={[styles.navIcon, currentCard === 0 && styles.navIconDisabled]}>←</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.moreButton}>
          <Text style={styles.moreIcon}>⋯</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={handleNextCard} 
          style={[styles.navButton, currentCard === totalCards - 1 && styles.navButtonDisabled]}
          disabled={currentCard === totalCards - 1}
        >
          <Text style={[styles.navIcon, currentCard === totalCards - 1 && styles.navIconDisabled]}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>Swipe left/right to navigate</Text>
      </View>
    </View>
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
  emptyText: {
    fontSize: 18,
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
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  header: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#999',
    fontWeight: '400',
    marginBottom: 10,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 5,
  },
  backIcon: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  shareButton: {
    padding: 5,
  },
  shareIcon: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: '400',
  },
  categoryHeader: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  categoryTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  progressSection: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
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
    backgroundColor: '#FFA726',
    borderRadius: 4,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 35,
    justifyContent: 'center',
    marginBottom: 60,
  },
  cardTouchable: {
    height: 350,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
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
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  starContainer: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
    padding: 5,
  },
  starIcon: {
    fontSize: 24,
    color: '#ddd',
  },
  starIconFilled: {
    color: '#FFD700',
  },
  iconContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  cardImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  placeholderIcon: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  placeholderText: {
    fontSize: 48,
  },
  wordTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  pronunciation: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  wordTitleBack: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 20,
  },
  pronunciationBack: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  tapButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  tapButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  definitionSection: {
    width: '100%',
    marginBottom: 20,
  },
  sentenceSection: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  definitionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  sentenceText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    width: '100%',
    marginBottom: 30,
  },
  pictureButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
  },
  pictureButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 50,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  navButtonDisabled: {
    backgroundColor: '#f0f0f0',
  },
  navIcon: {
    fontSize: 20,
    color: '#333',
    fontWeight: '600',
  },
  navIconDisabled: {
    color: '#999',
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  moreIcon: {
    fontSize: 20,
    color: '#333',
    fontWeight: '600',
  },
  instructionsContainer: {
    paddingBottom: 100,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});