import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
// Add this to the imports at the top
import { collection, doc, getDoc, getDocs, query, where, } from 'firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
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
import { auth, db } from './firebase/firebaseConfig';
import {
  deleteCard,
  deleteSharedCard,
  getFriends,
  getSharedCardsForRecipient,
  getTopics,
  sendChallenge,
  updateCard,
  updateSharedCard
} from './firebase/firestore';

interface Card {
  id: string;
  vocabulary: string;
  pronunciation?: string;
  definition: string;
  sentence: string;
  imageUrl?: string;
  topicId?: string;
  createdAt?: any;
  sharedCardId?: string; // ADD THIS LINE
}

interface Topic {
  id: string;
  name: string;
  description?: string;
  cardCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  source?: 'myTopics' | 'shared' | 'all'; // optional
}

interface Friend {
  id: string;
  friendId: string;  // Add this property
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline';
}

export default function ShowcardScreen() {
  const [searchText, setSearchText] = useState('');
  const [currentCard, setCurrentCard] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [flipAnimation] = useState(new Animated.Value(0));
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendSearchText, setFriendSearchText] = useState('');
  const [sendingChallenge, setSendingChallenge] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Update this line in your component (near the top)
  const { 
  newCardId, 
  topicId, 
  friendId, 
  topicName, 
  isShared, 
  sharedBy, 
  fromTab, 
  senderName  // ← ADD THIS
  } = useLocalSearchParams();
  

  const filteredCards = useMemo(() => {
    if (!searchText.trim()) {
      return allCards;
    }

    return allCards.filter(card =>
      card.vocabulary.toLowerCase().includes(searchText.toLowerCase().trim())
    );
  }, [allCards, searchText]);

  useEffect(() => {
    setCards(filteredCards);
    setTotalCards(filteredCards.length);

    if (filteredCards.length > 0 && currentCard >= filteredCards.length) {
      setCurrentCard(0);
      setIsFlipped(false);
      setIsStarred(false);
      flipAnimation.setValue(0);
    }

    if (filteredCards.length === 0) {
      setCurrentCard(0);
      setIsFlipped(false);
      setIsStarred(false);
      flipAnimation.setValue(0);
    }
  }, [filteredCards, currentCard]);


// Replace your loadCardsAndTopics function with this FIXED version:

const loadCardsAndTopics = useCallback(async () => {
  try {
    setLoading(true);
    const userId = auth.currentUser?.uid;

    if (!userId) throw new Error("User not authenticated");

    console.log("=== LOADING CARDS DEBUG ===");
    console.log("User ID:", userId);
    console.log("fromTab:", fromTab);
    console.log("isShared:", isShared);
    console.log("topicId:", topicId);
    

    // 1️⃣ Fetch topics
    const fetchedTopics = await getTopics();
    const typedTopics: Topic[] = fetchedTopics.map((topic: any) => ({
      id: topic.id,
      name: topic.name || "Untitled Topic",
      description: topic.description || "",
      cardCount: topic.cardCount || 0,
      createdAt: topic.createdAt || new Date(),
      updatedAt: topic.updatedAt || new Date(),
      source: "myTopics",
    }));

    let cardsToShow: Card[] = [];
    let currentTopicData: Topic | null = null;

    // -------------------------------------------------
    // 🆕 NEW CASE 0️⃣ — Viewing ALL Shared Cards (from Shared Tab)
    // -------------------------------------------------
    if (fromTab === 'shared' && !topicId && !sharedBy && !friendId) { 
      console.log("🔵 CASE 0: Loading ALL shared cards from Shared tab");

      // Get all shared cards where current user is recipient
      const sharedCards = await getSharedCardsForRecipient();
      
      cardsToShow = sharedCards.map((card: any) => ({
        id: card.id,
        sharedCardId: card.sharedCardId || card.id,
        vocabulary: card.vocabulary || "",
        pronunciation: card.pronunciation || "",
        definition: card.definition || "",
        sentence: card.sentence || "",
        imageUrl: card.imageUrl || "",
        topicId: card.topicId || "",
        createdAt: card.createdAt || new Date(),
      }));

      console.log(`✅ Found ${cardsToShow.length} shared cards for recipient`);

      // Set a generic "Shared Cards" topic
      currentTopicData = {
        id: 'shared-all',
        name: 'Shared Cards',
        description: 'All cards shared with you',
        cardCount: cardsToShow.length,
        source: 'shared'
      } as Topic;
    }
    // -------------------------------------------------
    // CASE 1️⃣ — Viewing Shared Cards from Specific Friend or Topic
    // -------------------------------------------------
    else if (isShared === "true" && (sharedBy || friendId || topicId)) {
      console.log("🟢 CASE 1: Loading shared cards from friend/topic");
      
      // Get all shared cards for recipient
      const allSharedCards = await getSharedCardsForRecipient();
      
      // Filter by friend if specified
      let filteredCards = allSharedCards;
      if (sharedBy || friendId) {
        const friendUserId = sharedBy || friendId;
        filteredCards = filteredCards.filter((card: any) => 
          card.senderId === friendUserId
        );
        console.log(`Filtered to ${filteredCards.length} cards from friend: ${friendUserId}`);
      }
      
      // Filter by topicId if specified (for specific vocabulary)
      if (topicId) {
        filteredCards = filteredCards.filter((card: any) => 
          card.id === topicId || card.sharedCardId === topicId
        );
        console.log(`Filtered to ${filteredCards.length} cards matching topicId: ${topicId}`);
      }

      cardsToShow = filteredCards.map((card: any) => ({
        id: card.id,
        sharedCardId: card.sharedCardId || card.id,
        vocabulary: card.vocabulary || "",
        pronunciation: card.pronunciation || "",
        definition: card.definition || "",
        sentence: card.sentence || "",
        imageUrl: card.imageUrl || "",
        topicId: card.topicId || "",
        createdAt: card.createdAt || new Date(),
      }));

      console.log(`✅ Found ${cardsToShow.length} shared cards after filtering`);

      
      let topicNameFromTopics = 'Shared Cards';
      const topicIdStr = Array.isArray(topicId) ? topicId[0] : topicId;


      if (topicIdStr) {
        const topicRef = doc(db, 'topics', topicIdStr); // topicIdStr is string
        const topicSnap = await getDoc(topicRef);

        if (topicSnap.exists()) {
          const data = topicSnap.data();
          topicNameFromTopics = data?.name || 'Shared Cards';
        } else {
          console.warn(`Topic not found in DB for topicId: ${topicIdStr}`);
        }
      }

      currentTopicData = {
        id: topicIdStr || 'shared-filtered',
        name: topicNameFromTopics,
        cardCount: cardsToShow.length,
        source: 'shared' // make sure your Topic type allows this
      };

      console.log("Current topic:", currentTopicData.name);

    }
    


    // -------------------------------------------------
    // CASE 2️⃣ — Viewing Own Topic
    // -------------------------------------------------
    else if (topicId && typeof topicId === "string" && fromTab !== 'shared') {
      console.log("🟡 CASE 2: Loading user-created cards for topic:", topicId);

      const cardsRef = collection(db, 'cards');
      const cardsQuery = query(
        cardsRef,
        where('userId', '==', userId),
        where('topicId', '==', topicId)
      );
      
      const cardsSnapshot = await getDocs(cardsQuery);
      
      cardsToShow = cardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Card));

      console.log(`✅ Found ${cardsToShow.length} user-created cards for topic: ${topicId}`);

      currentTopicData =
        typedTopics.find((t) => t.id === topicId) ||
        (topicId ? ({ id: topicId, name: topicName } as Topic) : null);
    }
    // -------------------------------------------------
    // CASE 3️⃣ — Viewing All Cards
    // -------------------------------------------------
    else {
      console.log('🟠 CASE 3: Loading all cards (My + Shared)');

      // Get user's created cards
      const cardsRef = collection(db, 'cards');
      const cardsQuery = query(
        cardsRef,
        where('userId', '==', userId)
      );
      
      const cardsSnapshot = await getDocs(cardsQuery);
      
      const userCreatedCards = cardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Card));

      console.log(`✅ Found ${userCreatedCards.length} user-created cards`);

      // Get all shared cards
      const allSharedCards = await getSharedCardsForRecipient();
      const sharedCardsFormatted = allSharedCards.map((card: any) => ({
        id: card.id,
        sharedCardId: card.sharedCardId || card.id,
        vocabulary: card.vocabulary || "",
        pronunciation: card.pronunciation || "",
        definition: card.definition || "",
        sentence: card.sentence || "",
        imageUrl: card.imageUrl || "",
        topicId: card.topicId || "",
        createdAt: card.createdAt || new Date(),
      }));
      
      console.log(`✅ Found ${sharedCardsFormatted.length} shared cards`);
      
      // Combine all cards
      cardsToShow = [...userCreatedCards, ...sharedCardsFormatted];
      
      console.log(`📊 Total: ${userCreatedCards.length} created + ${sharedCardsFormatted.length} shared = ${cardsToShow.length} cards`);
      
    }

    // ✅ Set states
    setAllCards(cardsToShow);
    setTopics(typedTopics);
    setCurrentTopic(currentTopicData);

    if (cardsToShow.length > 0) {
      setCurrentCard(0);
    }

    // ✅ Navigate to new card if needed
    if (newCardId) {
      const index = cardsToShow.findIndex((c: any) => c.id === newCardId);
      if (index !== -1) setCurrentCard(index);
    }

    console.log("=== LOADING COMPLETE ===");
    console.log("Total cards loaded:", cardsToShow.length);
    console.log("Current topic:", currentTopicData?.name);
    
  } catch (error) {
    console.error("❌ Error loading cards:", error);
    Alert.alert("Error", "Failed to load cards. Please try again.");
  } finally {
    setLoading(false);
  }
}, [topicId, friendId, isShared, sharedBy, topicName, fromTab]);


  // Load friends list - In real app, this would fetch from your backend/Firebase
  const loadFriends = useCallback(async () => {
    try {
      const friendsList = await getFriends();
      const formattedFriends: Friend[] = friendsList.map((friend: any) => ({
        id: friend.id,
        friendId: friend.friendId || friend.id, // Use friendId from the data, fallback to id
        name: friend.name || friend.displayName || 'Unknown',
        email: friend.email || '',
        avatar: friend.photoURL || friend.avatar,
        status: friend.isOnline ? 'online' : 'offline'
      }));
      setFriends(formattedFriends);
      console.log('Loaded friends:', formattedFriends);
    } catch (error) {
      console.error('Error loading friends:', error);
      Alert.alert('Error', 'Failed to load friends list');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCardsAndTopics();
      loadFriends();
    }, [loadCardsAndTopics, loadFriends])
  );

  useEffect(() => {
    return () => {
      if (sound) {
        console.log('Cleaning up sound on unmount');
        sound.unloadAsync().catch(err => console.log('Error cleaning up sound:', err));
      }
    };
  }, [sound]);

  const getTopicName = (topicId?: string) => {
    if (!topicId) return 'Unknown Topic';
    const topic = topics.find(t => t.id === topicId);
    return topic ? topic.name : 'Unknown Topic';
  };

  const getPhoneticPronunciation = async (text: string) => {
    try {
      console.log('Fetching pronunciation for:', text);
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text.toLowerCase())}`);

      if (!response.ok) {
        console.log('API response not ok:', response.status);
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      console.log('API response data:', data);

      if (data && Array.isArray(data) && data[0] && data[0].phonetics) {
        console.log('Found phonetics:', data[0].phonetics);
        for (const phonetic of data[0].phonetics) {
          if (phonetic.text && phonetic.text.trim()) {
            console.log('Found phonetic text:', phonetic.text);
            return phonetic.text;
          }
        }
      }

      console.log('No phonetic found in API, using fallback');
      return generateBasicPhonetic(text);
    } catch (error) {
      console.log('Dictionary API error:', error);
      return generateBasicPhonetic(text);
    }
  };

  const generateBasicPhonetic = (text: string): string => {
    const phoneticMap: { [key: string]: string } = {
      'hello': '/həˈloʊ/',
      'computer': '/kəmˈpjuːtər/',
      'phone': '/foʊn/',
      'book': '/bʊk/',
      'water': '/ˈwɔːtər/',
      'house': '/haʊs/',
      'car': '/kɑːr/',
      'tree': '/triː/',
      'apple': '/ˈæp.əl/',
      'dog': '/dɔːɡ/',
      'cat': '/kæt/',
      'world': '/wɜːrld/',
      'school': '/skuːl/',
      'student': '/ˈstuː.dənt/',
      'teacher': '/ˈtiː.tʃər/',
      'learn': '/lɜːrn/',
      'study': '/ˈstʌd.i/',
      'language': '/ˈlæŋ.ɡwɪdʒ/',
      'english': '/ˈɪŋ.ɡlɪʃ/',
      'television': '/ˈtelɪˌvɪʒən/',
      'good': '/ɡʊd/',
      'morning': '/ˈmɔːr.nɪŋ/',
      'night': '/naɪt/',
      'love': '/lʌv/',
      'beautiful': '/ˈbjuː.tɪ.fəl/',
      'friend': '/frend/',
      'family': '/ˈfæm.ə.li/',
      'happy': '/ˈhæp.i/',
      'smile': '/smaɪl/',
      'wonderful': '/ˈwʌn.dər.fəl/',
    };

    const phoneticResult = phoneticMap[text.toLowerCase()];
    if (phoneticResult) {
      console.log(`Using fallback phonetic for "${text}":`, phoneticResult);
      return phoneticResult;
    }

    console.log(`No phonetic found for "${text}", using generic format`);
    return `/${text.toLowerCase()}/`;
  };

  const handlePronounce = async () => {
    const currentCardData = cards[currentCard];
    if (!currentCardData?.vocabulary.trim()) {
      Alert.alert('Error', 'No vocabulary word to pronounce');
      return;
    }

    console.log('Starting pronunciation for:', currentCardData.vocabulary);

    try {
      setIsPlaying(true);

      if (sound) {
        console.log('Stopping previous sound');
        await sound.unloadAsync();
      }

      console.log('Fetching phonetic pronunciation...');
      const phonetic = await getPhoneticPronunciation(currentCardData.vocabulary);
      console.log('Phonetic result:', phonetic);

      if (!currentCardData.pronunciation) {
        const updatedCards = cards.map(card =>
          card.id === currentCardData.id
            ? { ...card, pronunciation: phonetic }
            : card
        );
        const updatedAllCards = allCards.map(card =>
          card.id === currentCardData.id
            ? { ...card, pronunciation: phonetic }
            : card
        );
        setCards(updatedCards);
        setAllCards(updatedAllCards);
      }

      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=gtx&q=${encodeURIComponent(currentCardData.vocabulary)}`;
      console.log('TTS URL:', ttsUrl);

      console.log('Setting up audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      console.log('Creating and playing sound...');
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: ttsUrl },
        { shouldPlay: true }
      );

      console.log('Sound created successfully');
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        console.log('Playback status:', status);

        if (status.isLoaded) {
          if (status.didJustFinish) {
            console.log('Playback finished');
            setIsPlaying(false);
          }
        } else {
          console.log('Playback error occurred');
          let errorMessage = 'Unknown playback error';
          if (status.error) {
            try {
              errorMessage = String(status.error);
            } catch {
              errorMessage = 'Failed to get error details';
            }
          }
          console.log('Error details:', errorMessage);
          setIsPlaying(false);
        }
      });

      setTimeout(() => {
        console.log('Timeout - stopping playback indicator');
        setIsPlaying(false);
      }, 5000);

    } catch (error) {
      console.log('Pronunciation error:', error);
      let errorMessage = 'Unknown error occurred';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String((error as any).message);
      } else if (error) {
        errorMessage = String(error);
      }
      Alert.alert('Error', `Could not play pronunciation: ${errorMessage}`);
      setIsPlaying(false);

      try {
        const phonetic = await getPhoneticPronunciation(currentCardData.vocabulary);
        if (!currentCardData.pronunciation) {
          const updatedCards = cards.map(card =>
            card.id === currentCardData.id
              ? { ...card, pronunciation: phonetic }
              : card
          );
          const updatedAllCards = allCards.map(card =>
            card.id === currentCardData.id
              ? { ...card, pronunciation: phonetic }
              : card
          );
          setCards(updatedCards);
          setAllCards(updatedAllCards);
        }
      } catch (phoneticError) {
        console.log('Could not get phonetic pronunciation:', phoneticError);
      }
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

  const handleMorePress = () => {
    setShowMoreMenu(!showMoreMenu);
  };

  const handleEditCard = () => {
    const cardToEdit = cards[currentCard];
    setEditingCard({ ...cardToEdit });
    setShowEditModal(true);
    setShowMoreMenu(false);
  };

  
  const handleDeleteCard = () => {
  if (!cards[currentCard]) return;

  const cardToDelete = cards[currentCard];
  
  // ✅ Detect if this is a shared card
  const isSharedCard = Boolean(
    cardToDelete.sharedCardId || 
    isShared === 'true' || 
    fromTab === 'shared'
  );

  Alert.alert(
    'Delete Card',
    isSharedCard 
      ? `Remove "${cardToDelete.vocabulary}" from your collection?`
      : `Are you sure you want to delete "${cardToDelete.vocabulary}"?`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('🗑️ Deleting card:', {
              isShared: isSharedCard,
              cardId: cardToDelete.id,
              sharedCardId: cardToDelete.sharedCardId,
            });

            if (isSharedCard) {
              // ✅ For shared cards: Use sharedCardId
              const cardId = cardToDelete.sharedCardId || cardToDelete.id;
              console.log('Deleting shared card with ID:', cardId);
              await deleteSharedCard(cardId);
              console.log('✅ Shared card deleted');
            } else {
              // ✅ For own cards: Use regular id
              console.log('Deleting own card with ID:', cardToDelete.id);
              await deleteCard(cardToDelete.id);
              console.log('✅ Own card deleted');
            }

            const updatedAllCards = allCards.filter(card => card.id !== cardToDelete.id);
            const updatedCards = cards.filter(card => card.id !== cardToDelete.id);

            setAllCards(updatedAllCards);
            setCards(updatedCards);
            setTotalCards(updatedCards.length);

            if (updatedCards.length === 0) {
              Alert.alert(
                'No Cards Remaining',
                currentTopic
                  ? `This topic "${currentTopic.name}" has no more cards. Returning to previous screen.`
                  : 'No cards remaining. Returning to previous screen.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
              return;
            } else if (currentCard >= updatedCards.length) {
              setCurrentCard(updatedCards.length - 1);
            }

            setIsFlipped(false);
            setIsStarred(false);
            flipAnimation.setValue(0);
            setShowMoreMenu(false);

            Alert.alert('Success', 'Card deleted successfully!');
          } catch (error: any) {
            console.error('❌ Error deleting card:', error);
            Alert.alert('Error', error.message || 'Failed to delete card');
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
  if (!editingCard) return;

  if (!editingCard.vocabulary.trim() || !editingCard.definition.trim()) {
    Alert.alert('Error', 'Vocabulary and definition are required');
    return;
  }

  try {
    // ✅ Detect if this is a shared card
    const isSharedCard = Boolean(
      editingCard.sharedCardId || 
      isShared === 'true' || 
      fromTab === 'shared'
    );
    
    const updateData = {
      vocabulary: editingCard.vocabulary.trim(),
      pronunciation: editingCard.pronunciation?.trim() || '',
      definition: editingCard.definition.trim(),
      sentence: editingCard.sentence?.trim() || '',
    };

    console.log('💾 Saving card:', {
      isShared: isSharedCard,
      cardId: editingCard.id,
      sharedCardId: editingCard.sharedCardId,
      fromTab: fromTab,
      isSharedParam: isShared,
    });

    if (isSharedCard) {
      const cardId =
        editingCard.sharedCardId ||
        editingCard.id;

      console.log('✏️ Updating shared card with ID:', cardId);
      await updateSharedCard(cardId, updateData);
      console.log('✅ Shared card updated successfully');
    } else {
      console.log('✏️ Updating own card with ID:', editingCard.id);
      await updateCard(editingCard.id, updateData);
      console.log('✅ Own card updated successfully');
    }

    // Update local state
    const updatedAllCards = allCards.map(card =>
      card.id === editingCard.id ? { ...card, ...updateData } : card
    );
    const updatedCards = cards.map(card =>
      card.id === editingCard.id ? { ...card, ...updateData } : card
    );

    setAllCards(updatedAllCards);
    setCards(updatedCards);

    setShowEditModal(false);
    setEditingCard(null);
    Alert.alert('Success', 'Card updated successfully!');
  } catch (error: any) {
    console.error('❌ Error updating card:', error);
    Alert.alert('Error', error.message || 'Failed to update card');
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingCard(null);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setCurrentCard(0);
    setIsFlipped(false);
    setIsStarred(false);
    flipAnimation.setValue(0);
  };

  const handleShareCard = () => {
    setShowFriendModal(true);
    setSelectedFriends([]);
    setFriendSearchText('');
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => {
      if (prev.includes(friendId)) {
        return prev.filter(id => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };
const sendChallengeToFriends = async () => {
  if (selectedFriends.length === 0) {
    Alert.alert('No Friends Selected', 'Please select at least one friend to send the challenge to.');
    return;
  }

  const cardToShare = cards[currentCard];
  if (!cardToShare) return;

  try {
    setSendingChallenge(true);

    const currentUser = auth.currentUser;
    const senderName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Someone';

    const challengeData = {
      cardId: cardToShare.id,
      vocabulary: cardToShare.vocabulary,
      definition: cardToShare.definition,
      sentence: cardToShare.sentence || '',
      imageUrl: cardToShare.imageUrl || '',
      pronunciation: cardToShare.pronunciation || '',
      topicId: cardToShare.topicId || '', // IMPORTANT: Include topicId
      topicName: currentTopic?.name || getTopicName(cardToShare.topicId) || 'General',
      senderName: senderName,
      recipientIds: selectedFriends,
    };

    console.log('Sending challenge with topicId:', challengeData.topicId); // Debug log

    const challengeId = await sendChallenge(challengeData);
    
    console.log('Challenge sent with ID:', challengeId);

    setSendingChallenge(false);
    setShowFriendModal(false);
    
    const friendNames = friends
      .filter(f => selectedFriends.includes(f.friendId))
      .map(f => f.name)
      .join(', ');

    Alert.alert(
      '🎉 Challenge Sent!',
      `Your vocabulary challenge has been sent to ${friendNames}. They will see it on their home screen!`,
      [{ text: 'Great!' }]
    );

    setSelectedFriends([]);
  } catch (error) {
    console.error('Error sending challenge:', error);
    setSendingChallenge(false);
    Alert.alert('Error', 'Failed to send challenge. Please try again.');
  }
};

  const filteredFriends = useMemo(() => {
    if (!friendSearchText.trim()) {
      return friends;
    }
    return friends.filter(friend =>
      friend.name.toLowerCase().includes(friendSearchText.toLowerCase()) ||
      friend.email.toLowerCase().includes(friendSearchText.toLowerCase())
    );
  }, [friends, friendSearchText]);

  const progressPercentage = totalCards > 0 ? ((currentCard + 1) / totalCards) * 100 : 0;

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

  const displayTopicName = (() => {
    if (isShared === 'true' && senderName) {
      const sender = Array.isArray(senderName) ? senderName[0] : senderName;
      const topicStr = currentTopic?.name || (Array.isArray(topicName) ? topicName[0] : topicName);
      return topicStr ? `${sender} - ${topicStr}` : `${sender}'s Cards`;
    }
    if (isShared === 'true' || fromTab === 'shared') {
      const topicStr = currentTopic?.name || (Array.isArray(topicName) ? topicName[0] : topicName);
      return topicStr ? topicStr : 'Cards';
    }
    return currentTopic?.name || topicName || 'Cards';
  })();

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: displayTopicName as string,
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={styles.loadingContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            Loading {currentTopic?.name || topicName || 'your cards'}...
          </Text>
        </View>
      </>
    );
  }

  if (totalCards === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: displayTopicName as string,
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={styles.emptyContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
          <Text style={styles.emptyText}>
            {searchText.trim() ? 'No matching cards found' : 'No cards found'}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchText.trim()
              ? `No cards match "${searchText}". Try a different search term.`
              : currentTopic
                ? `No cards found in "${currentTopic.name}" topic.`
                : 'Create some vocabulary cards first!'
            }
          </Text>
          {searchText.trim() ? (
            <TouchableOpacity style={styles.clearSearchButton} onPress={handleClearSearch}>
              <Text style={styles.clearSearchButtonText}>Clear Search</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  }

  const currentCardData = cards[currentCard];

  if (!currentCardData) {
    return (
      <>
        <Stack.Screen
          options={{
            title: displayTopicName as string,
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={styles.loadingContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading card data...</Text>
        </View>
      </>
    );
  }

  const frontZIndex = isFlipped ? 0 : 2;
  const backZIndex = isFlipped ? 2 : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My Flashcards',
          headerBackTitle: 'Back',
          headerShown: true,
          headerTitleStyle: {
            fontSize: 18,
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
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search your vocabulary..."
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.trim() ? (
              <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Category Title with Topic Name */}
        <View style={styles.categoryHeader}>
          <Text style={styles.topicName}>
            {searchText.trim() ? `Search Results` : displayTopicName}
          </Text>

          {searchText.trim() ? (
            <Text style={styles.topicDescription}>
              Found {totalCards} card{totalCards !== 1 ? 's' : ''} matching "{searchText}"
            </Text>
          ) : (
            currentTopic?.description && (
              <Text style={styles.topicDescription}>{currentTopic.description}</Text>
            )
          )}
        </View>

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

        {/* Flip Card Container */}
        <View style={styles.cardContainer}>
          <TouchableOpacity onPress={handleFlip} style={styles.cardTouchable} activeOpacity={1}>
            {/* Front of Card */}
            <Animated.View
              pointerEvents={isFlipped ? 'none' : 'auto'}
              style={[
                styles.card,
                styles.cardFront,
                frontAnimatedStyle,
                { zIndex: frontZIndex }
              ]}
            >
              <TouchableOpacity onPress={handleShareCard} style={styles.shareContainer}>
                <FontAwesome name="paper-plane" size={18} color="#007AFF" />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleStarPress} style={styles.starContainer}>
                <Text style={[styles.starIcon, isStarred && styles.starIconFilled]}>★</Text>
              </TouchableOpacity>

              <View style={styles.iconContainer}>
                {currentCardData?.imageUrl ? (
                  <Image
                    source={{ uri: currentCardData.imageUrl }}
                    style={styles.cardImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.placeholderIcon}>
                    <MaterialIcons name="image-not-supported" size={24} color="#999" style={styles.placeholderText} />
                  </View>
                )}
              </View>

              <View style={styles.vocabularyContainer}>
                <Text style={styles.wordTitle}>{currentCardData?.vocabulary || 'Loading...'}</Text>

                <TouchableOpacity
                  style={[styles.pronunciationButton, isPlaying && styles.pronunciationButtonActive]}
                  onPress={handlePronounce}
                  disabled={isPlaying}
                >
                  <Text style={styles.speakerIcon}>🔊</Text>
                  {currentCardData?.pronunciation && (
                    <Text style={styles.pronunciation}>{currentCardData.pronunciation}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.tapButton}>
                <Text style={styles.tapButtonText}>Tap to see the definition</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Back of Card */}
            <Animated.View
              pointerEvents={isFlipped ? 'auto' : 'none'}
              style={[
                styles.card,
                styles.cardBack,
                backAnimatedStyle,
                { zIndex: backZIndex }
              ]}
            >
              <TouchableOpacity onPress={handleShareCard} style={styles.shareContainer}>
                <FontAwesome name="paper-plane" size={18} color="#007AFF" />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleStarPress} style={styles.starContainer}>
                <Text style={[styles.starIcon, isStarred && styles.starIconFilled]}>★</Text>
              </TouchableOpacity>

              <Text style={styles.wordTitleBack}>{currentCardData?.vocabulary || 'Loading...'}</Text>
              {currentCardData?.pronunciation && (
                <Text style={styles.pronunciationBack}>{currentCardData.pronunciation}</Text>
              )}

              <View style={styles.definitionSection}>
                <Text style={styles.sectionLabel}>Definition</Text>
                <Text style={styles.definitionText}>{currentCardData?.definition || 'Loading...'}</Text>
              </View>

              {currentCardData?.sentence && (
                <>
                  <View style={styles.sentenceSection}>
                    <Text style={styles.sectionLabel}>Sentence</Text>
                  </View>
                  <Text style={styles.sentenceText}>{currentCardData.sentence}</Text> 
                </>
              )}
              <TouchableOpacity style={styles.pictureButton}>
                <Text style={styles.pictureButtonText}>Tap to see the picture</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>

          {/* Navigation - Now on sides of card */}
          <View style={styles.navigationSideContainer}>
            <TouchableOpacity
              onPress={handlePreviousCard}
              style={[styles.navButtonSide, styles.navButtonLeft, currentCard === 0 && styles.navButtonDisabled]}
              disabled={currentCard === 0}
            >
              <Text style={[styles.navIcon, currentCard === 0 && styles.navIconDisabled]}>←</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNextCard}
              style={[styles.navButtonSide, styles.navButtonRight, currentCard === totalCards - 1 && styles.navButtonDisabled]}
              disabled={currentCard === totalCards - 1}
            >
              <Text style={[styles.navIcon, currentCard === totalCards - 1 && styles.navIconDisabled]}>→</Text>
            </TouchableOpacity>
          </View>

          {/* More Menu */}
          <View style={styles.moreMenuRow}>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemFlex]} onPress={handleEditCard}>
              <LinearGradient
                colors={loading ? ['#ccc', '#999'] : ['#FFA726', '#FF7043']}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <FontAwesome name="edit" size={16} color="white" />
                <Text style={styles.menuText}>Edit</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger, styles.menuItemFlex]} onPress={handleDeleteCard}>
              <LinearGradient
                colors={loading ? ['#ccc', '#999'] : ['#FFA726', '#FF7043']}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <FontAwesome name="trash" size={16} color="white" />
                <Text style={[styles.menuText, styles.menuTextDanger]}>Delete</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.instructionsText}>Tap left/right to navigate</Text>
        </View>

        {/* Edit Modal */}
        <Modal
          visible={showEditModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCancelEdit}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCancelEdit}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Card</Text>
              <TouchableOpacity onPress={handleSaveEdit}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vocabulary *</Text>
                <TextInput
                  style={styles.textInput}
                  value={editingCard?.vocabulary}
                  onChangeText={(text) => setEditingCard(prev => prev ? { ...prev, vocabulary: text } : null)}
                  placeholder="Enter vocabulary word"
                  multiline={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Definition *</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={editingCard?.definition}
                  onChangeText={(text) => setEditingCard(prev => prev ? { ...prev, definition: text } : null)}
                  placeholder="Enter definition"
                  multiline={true}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Example Sentence</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={editingCard?.sentence}
                  onChangeText={(text) => setEditingCard(prev => prev ? { ...prev, sentence: text } : null)}
                  placeholder="Enter example sentence (optional)"
                  multiline={true}
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Friend Selection Modal */}
        <Modal
          visible={showFriendModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowFriendModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowFriendModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Challenge Friends</Text>
              <TouchableOpacity 
                onPress={sendChallengeToFriends}
                disabled={selectedFriends.length === 0 || sendingChallenge}
              >
                <Text style={[
                  styles.modalSaveText,
                  (selectedFriends.length === 0 || sendingChallenge) && styles.modalSaveTextDisabled
                ]}>
                  {sendingChallenge ? 'Sending...' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.challengeInfo}>
              <Text style={styles.challengeInfoTitle}>📚 Challenge Card:</Text>
              <Text style={styles.challengeInfoText}>"{currentCardData?.vocabulary}"</Text>
              <Text style={styles.challengeInfoSubtext}>
                Your friends will need to guess the correct definition!
              </Text>
            </View>

            {/* Friend Search */}
            <View style={styles.friendSearchContainer}>
              <Text style={styles.friendSearchIcon}>🔍</Text>
              <TextInput
                style={styles.friendSearchInput}
                placeholder="Search friends..."
                placeholderTextColor="#999"
                value={friendSearchText}
                onChangeText={setFriendSearchText}
              />
            </View>

            {/* Selected Count */}
            {selectedFriends.length > 0 && (
              <View style={styles.selectedCountContainer}>
                <Text style={styles.selectedCountText}>
                  {selectedFriends.length} friend{selectedFriends.length !== 1 ? 's' : ''} selected
                </Text>
              </View>
            )}

            {/* Friends List */}
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.friendId}
              contentContainerStyle={styles.friendsList}
              renderItem={({ item }) => {
                const isSelected = selectedFriends.includes(item.friendId);
                return (
                  <TouchableOpacity
                    style={[styles.friendItem, isSelected && styles.friendItemSelected]}
                    onPress={() => toggleFriendSelection(item.friendId)}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                      {item.status === 'online' && <View style={styles.onlineIndicator} />}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{item.name}</Text>
                      <Text style={styles.friendEmail}>{item.email}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <FontAwesome name="check" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyFriendsList}>
                  <Text style={styles.emptyFriendsText}>No friends found</Text>
                  <Text style={styles.emptyFriendsSubtext}>
                    {friendSearchText.trim() 
                      ? 'Try a different search term'
                      : 'Add friends to send challenges!'}
                  </Text>
                </View>
              }
            />
          </View>
        </Modal>

        {showMoreMenu && (
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setShowMoreMenu(false)}
          />
        )}
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
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  clearSearchButton: {
    padding: 5,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clearSearchButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  header: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
    fontWeight: '400',
    marginBottom: 10,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 10,
  },
  backIcon: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    textAlign: 'left',
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
    paddingTop: 0,
  },
  categoryTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  topicName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  topicDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  progressSection: {
    paddingHorizontal: 10,
    marginBottom: 60,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
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
    marginBottom: 120,
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
    paddingTop: 20,
    paddingLeft: 30,
    paddingRight: 30,
    paddingBottom: 20,
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
  },
  shareContainer: {
    position: 'absolute',
    top: 15,
    left: 15,
    zIndex: 10,
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  starButton: {
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  starIcon: {
    fontSize: 24,
    color: '#ddd',
  },
  starIconFilled: {
    color: '#FFD700',
  },
  iconContainer: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
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
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  placeholderText: {
    fontSize: 36,
  },
  vocabularyContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  wordTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  pronunciationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bee3f8',
  },
  pronunciationButtonActive: {
    backgroundColor: '#e0f2fe',
  },
  speakerIcon: {
    flex: 0,
    fontSize: 12,
  },
  wordTitleBack: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 20,
    textAlign: 'center',
  },
  pronunciation: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  pronunciationBack: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  tapButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  tapButtonText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  definitionSection: {
    width: '100%',
    marginBottom: 20,
    marginTop: 5,
  },
  sentenceSection: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 14,
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
    color: '#007AFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  navigationSideContainer: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    transform: [{ translateY: -22 }],
    pointerEvents: 'box-none',
  },
  navButtonSide: {
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
  },
  navButtonLeft: {
    marginLeft: 10,
  },
  navButtonRight: {
    marginRight: 10,
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
  moreMenuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    width: 200,
    alignSelf: 'center',
    paddingBottom: 0,
  },
  menuItemFlex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: '#fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    borderRadius: 16,
  },
  gradientButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
  },
  menuItemDanger: {
    backgroundColor: '#fff',
  },
  menuText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  menuTextDanger: {
    color: '#fff',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  instructionsContainer: {
    paddingBottom: 80,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 12,
    color: '#999',
    paddingTop: 20,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  modalSaveText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalSaveTextDisabled: {
    color: '#ccc',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 48,
  },
  textInputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 5,
    marginTop: 10,
    paddingVertical: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchIcon: {
    fontSize: 12,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  clearButton: {
    padding: 0,
  },
  clearIcon: {
    fontSize: 14,
    color: '#999',
  },
  challengeInfo: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  challengeInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 6,
  },
  challengeInfoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D47A1',
    marginBottom: 6,
  },
  challengeInfoSubtext: {
    fontSize: 12,
    color: '#1976D2',
    fontStyle: 'italic',
  },
  friendSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  friendSearchIcon: {
    fontSize: 12,
    marginRight: 10,
  },
  friendSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  selectedCountContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#A5D6A7',
  },
  selectedCountText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  friendsList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  friendItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  friendAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 12,
    color: '#666',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  emptyFriendsList: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyFriendsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  emptyFriendsSubtext: {
    fontSize: 13,
    color: '#999',
  },
});