import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { addCardWithTopic, getTopics } from '../firebase/firestore';
import { uploadImage } from '../firebase/storage';

interface Topic {
  id: string;
  name: string;
  description?: string;
  cardCount: number;
  createdAt: any;
  updatedAt: any;
}

// Helper function for debouncing
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function CreateScreen() {
  const params = useLocalSearchParams();
  const presetTopicId = params.topicId as string;
  const presetTopicName = params.topicName as string;

  // Existing state
  const [vocabulary, setVocabulary] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [definition, setDefinition] = useState('');
  const [sentence, setSentence] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-generated image state
  const [generatedImageUri, setGeneratedImageUri] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageSource, setImageSource] = useState<'manual' | 'generated' | null>(null);

  // Topic-related state
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState(presetTopicId || '');
  const [selectedTopicName, setSelectedTopicName] = useState(presetTopicName || '');
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [lastAddedWord, setLastAddedWord] = useState(''); 

  // NEW: Autocorrect state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCheckingSpelling, setIsCheckingSpelling] = useState(false);

  // Keep initial load
  useEffect(() => {
    loadTopics();
  }, []);

  // Add focus effect to reload topics when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('CreateScreen focused - reloading topics');
      loadTopics();
    }, [])
  );

  const loadTopics = async () => {
    try {
      setTopicsLoading(true);
      console.log('Loading topics...');
      
      const fetchedTopics = await getTopics();
      
      // Fix TypeScript errors by ensuring all required properties exist
      const typedTopics: Topic[] = fetchedTopics.map((topic: any) => ({
        id: topic.id,
        name: topic.name || 'Untitled Topic',        
        description: topic.description || '',
        cardCount: topic.cardCount || 0,             
        createdAt: topic.createdAt || new Date(),    
        updatedAt: topic.updatedAt || new Date()     
      }));
      
      console.log(`Loaded ${typedTopics.length} topics:`, typedTopics.map(t => t.name));
      setTopics(typedTopics);
      
      // Auto-select logic
      if (!presetTopicId && typedTopics.length === 1) {
        setSelectedTopicId(typedTopics[0].id);
        setSelectedTopicName(typedTopics[0].name);
      }
    } catch (error) {
      console.error('Error loading topics:', error);
      Alert.alert('Error', 'Failed to load topics');
    } finally {
      setTopicsLoading(false);
    }
  };

  // Function to update topic count locally
  const updateTopicCount = (topicId: string) => {
    setTopics(prevTopics => 
      prevTopics.map(topic => 
        topic.id === topicId 
          ? { ...topic, cardCount: topic.cardCount + 1 }
          : topic
      )
    );
  };

  // Function to reset form
  const resetForm = () => {
    setVocabulary('');
    setPronunciation('');
    setDefinition('');
    setSentence('');
    setSelectedImage(null);
    setGeneratedImageUri(null);
    setImageSource(null);
    setSuggestions([]);
    setShowSuggestions(false);
    // Keep topic selection intact
  };

  const handleTopicSelect = (topic: Topic) => {
    setSelectedTopicId(topic.id);
    setSelectedTopicName(topic.name);
    setShowTopicSelector(false);
  };

  const handleBackPress = () => {
    router.back();
  };

  // NEW: Autocorrect functions
  const getSpellingSuggestions = async (word: string) => {
    if (!word.trim() || word.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsCheckingSpelling(true);
    try {
      console.log('Checking spelling for:', word);
      
      // First, try the dictionary API to check if word exists
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      
      if (response.ok) {
        // Word is correct, no suggestions needed
        setSuggestions([]);
        setShowSuggestions(false);
        console.log('Word is correctly spelled');
        return;
      }
      
      // If word doesn't exist, get suggestions from a spell-check API
      // Using a free spell-check service
      const suggestionResponse = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(word.toLowerCase())}&max=5`);
      
      if (suggestionResponse.ok) {
        const suggestionData = await suggestionResponse.json();
        const suggestionWords = suggestionData.map((item: any) => item.word).slice(0, 5);
        
        if (suggestionWords.length > 0) {
          console.log('Found suggestions:', suggestionWords);
          setSuggestions(suggestionWords);
          setShowSuggestions(true);
        } else {
          // Fallback to common word corrections
          const fallbackSuggestions = getFallbackSuggestions(word);
          setSuggestions(fallbackSuggestions);
          setShowSuggestions(fallbackSuggestions.length > 0);
        }
      } else {
        // Use fallback suggestions
        const fallbackSuggestions = getFallbackSuggestions(word);
        setSuggestions(fallbackSuggestions);
        setShowSuggestions(fallbackSuggestions.length > 0);
      }
      
    } catch (error) {
      console.log('Spell check error:', error);
      // Use fallback suggestions on error
      const fallbackSuggestions = getFallbackSuggestions(word);
      setSuggestions(fallbackSuggestions);
      setShowSuggestions(fallbackSuggestions.length > 0);
    } finally {
      setIsCheckingSpelling(false);
    }
  };

  // Fallback suggestions for common misspellings
  const getFallbackSuggestions = (word: string): string[] => {
    const commonCorrections: { [key: string]: string[] } = {
      'helo': ['hello'],
      'helllo': ['hello'],
      'teh': ['the'],
      'recieve': ['receive'],
      'seperate': ['separate'],
      'definately': ['definitely'],
      'occured': ['occurred'],
      'begining': ['beginning'],
      'beleive': ['believe'],
      'freind': ['friend'],
      'wierd': ['weird'],
      'neccessary': ['necessary'],
      'accomodate': ['accommodate'],
      'embarass': ['embarrass'],
      'realy': ['really'],
      'tommorow': ['tomorrow'],
      'untill': ['until'],
      'writting': ['writing'],
      'comming': ['coming'],
      'runing': ['running'],
      'stoping': ['stopping'],
      'geting': ['getting'],
      'planing': ['planning'],
      'beginer': ['beginner'],
      'happyness': ['happiness'],
      'sucessful': ['successful'],
      'buisness': ['business'],
      'enviroment': ['environment'],
      'goverment': ['government'],
      'independant': ['independent'],
      'maintainence': ['maintenance'],
      'pronounciation': ['pronunciation'],
      'recomendation': ['recommendation']
    };
    
    const lowerWord = word.toLowerCase();
    return commonCorrections[lowerWord] || [];
  };

  // Add this function to handle suggestion selection
  const handleSuggestionSelect = (suggestion: string) => {
    setVocabulary(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    
    // Automatically get pronunciation for the corrected word
    setTimeout(() => {
      handlePronounce();
    }, 100);
  };

  // Add this debounced function to check spelling after user stops typing
  const debounceSpellCheck = useCallback(
    debounce((word: string) => {
      getSpellingSuggestions(word);
    }, 500),
    []
  );

  // Update the vocabulary input handler
  const handleVocabularyChange = (text: string) => {
    setVocabulary(text);
    
    // Clear previous suggestions when user is actively typing
    if (showSuggestions) {
      setShowSuggestions(false);
    }
    
    // Debounce spell check to avoid too many API calls
    debounceSpellCheck(text);
  };

  // Function to get phonetic pronunciation from text
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

  // Basic phonetic conversion as fallback
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
    if (!vocabulary.trim()) {
      Alert.alert('Error', 'Please enter a vocabulary word first');
      return;
    }

    console.log('Starting pronunciation for:', vocabulary);
    
    try {
      setIsPlaying(true);
      
      if (sound) {
        console.log('Stopping previous sound');
        await sound.unloadAsync();
      }

      console.log('Fetching phonetic pronunciation...');
      const phonetic = await getPhoneticPronunciation(vocabulary);
      console.log('Phonetic result:', phonetic);
      setPronunciation(phonetic);

      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=gtx&q=${encodeURIComponent(vocabulary)}`;
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
            console.log('Playbook finished');
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
        errorMessage = String(error.message);
      } else if (error) {
        errorMessage = String(error);
      }
      Alert.alert('Error', `Could not play pronunciation: ${errorMessage}`);
      setIsPlaying(false);
      
      const phonetic = await getPhoneticPronunciation(vocabulary);
      setPronunciation(phonetic);
    }
  };

  const handleGenerateDefinition = async () => {
    if (!vocabulary.trim()) {
      Alert.alert('Error', 'Please enter a vocabulary word first');
      return;
    }

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(vocabulary.toLowerCase())}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
          const meaning = data[0].meanings[0].definitions[0].definition;
          setDefinition(meaning);
          return;
        }
      }
    } catch (error) {
      console.log('Definition API error:', error);
    }
    
    // Fallback to sample definition
    setDefinition(`A sample definition for "${vocabulary}"`);
    console.log('Generate definition for:', vocabulary);
  };

  // Function to generate image automatically
  const handleGenerateImage = async () => {
    if (!vocabulary.trim()) {
      Alert.alert('Error', 'Please enter a vocabulary word first');
      return;
    }

    setIsGeneratingImage(true);
    try {
      console.log('Generating image for vocabulary:', vocabulary);
      
      // Using Pollinations AI (free image generation API)
      const prompt = encodeURIComponent(`A clear, simple illustration of ${vocabulary}, educational style, clean background, high quality`);
      const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&seed=${Math.floor(Math.random() * 1000000)}`;
      
      console.log('Generated image URL:', imageUrl);
      
      // Verify the image loads
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to generate image');
      }
      
      setGeneratedImageUri(imageUrl);
      setImageSource('generated');
      
      // Clear any manually selected image
      setSelectedImage(null);
      
      Alert.alert('Success', 'Image generated successfully!');
      
    } catch (error) {
      console.error('Image generation error:', error);
      Alert.alert('Error', 'Failed to generate image. Please try again or select an image manually.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSelectImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0]);
        setImageSource('manual');
        
        // Clear any generated image
        setGeneratedImageUri(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleSaveCard = async () => {
    // Validation
    if (!vocabulary.trim()) {
      Alert.alert('Error', 'Please enter a vocabulary word');
      return;
    }

    if (!definition.trim()) {
      Alert.alert('Error', 'Please provide a definition');
      return;
    }

    if (!selectedTopicId) {
      Alert.alert('Error', 'Please select a topic for this card');
      return;
    }

    setLoading(true);
    try {
      console.log('Starting save process...');
      
      let imageUrl = "";
      
      // Handle image upload (both manual and generated)
      if (selectedImage) {
        console.log('Uploading manually selected image...');
        imageUrl = await uploadImage(selectedImage.uri);
        console.log('Manual image uploaded successfully:', imageUrl);
      } else if (generatedImageUri && imageSource === 'generated') {
        console.log('Using generated image URL directly...');
        // For generated images, we use the URL directly since Pollinations images are publicly accessible
        imageUrl = generatedImageUri;
        console.log('Generated image URL set:', imageUrl);
      }

      console.log('Adding card to Firebase with topic...');
      const cardId = await addCardWithTopic(
        vocabulary.trim(),
        definition.trim(),
        sentence.trim(),
        imageUrl,
        selectedTopicId
      );
      console.log('Card added successfully with ID:', cardId);

      // Update the topic count locally
      updateTopicCount(selectedTopicId);
      
      // Store the last added word
      setLastAddedWord(vocabulary.trim());

      // Reset the form
      resetForm();

      // Show success alert and navigate to profile with the new card ID
      Alert.alert(
        'Success', 
        `Card "${vocabulary.trim()}" saved successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              console.log(`Successfully added word: ${vocabulary.trim()}`);
              // Navigate to profile with the new card ID as a parameter
              router.push({
                pathname: '/showcard',
                params: { newCardId: cardId }
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Save error:', error); 
      const errorMessage = error instanceof Error ? error.message : 'Failed to save card';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (topicsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ActivityIndicator size="large" color="#FFA726" />
        <Text style={styles.loadingText}>Loading topics...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>Create New Card</Text>
          <View style={styles.placeholder} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Card Container */}
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            
            {/* Topic Selection */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>1. Select Topic *</Text>
              <TouchableOpacity 
                style={styles.topicSelector}
                onPress={() => setShowTopicSelector(true)}
              >
                <Text style={[
                  styles.topicSelectorText, 
                  !selectedTopicName && styles.placeholderText
                ]}>
                  {selectedTopicName || 'Choose a topic for this card'}
                </Text>
                <Text style={styles.dropdownIcon}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>2. Name of vocabulary</Text>
            {/* Enhanced Vocabulary Input with Autocorrect */}
            <View style={styles.inputSection}>
              <TextInput
                style={styles.vocabularyInput}
                placeholder="Type a vocabulary word..."
                value={vocabulary}
                onChangeText={handleVocabularyChange}
                placeholderTextColor="#999"
                textAlign="left"
              />
              
              {/* Spell check indicator */}
              {isCheckingSpelling && (
                <View style={styles.spellCheckIndicator}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.spellCheckText}>Checking spelling...</Text>
                </View>
              )}
              
              {/* Spelling suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  <View style={styles.suggestionsHeader}>
                    <Text style={styles.suggestionsTitle}>Did you mean:</Text>
                    <TouchableOpacity 
                      onPress={() => setShowSuggestions(false)}
                      style={styles.dismissButton}
                    >
                      <Text style={styles.dismissText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.suggestionsList}>
                    {suggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => handleSuggestionSelect(suggestion)}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Pronunciation Section */}
            <View style={styles.actionSection}>
              <TouchableOpacity 
                style={[styles.actionButton, isPlaying && styles.actionButtonActive]}
                onPress={handlePronounce}
                disabled={isPlaying || loading}
              >
                <Text style={[styles.actionText, isPlaying && styles.actionTextActive]}>
                  {isPlaying ? 'Playing...' : '3. Tap here to pronounce'}
                </Text>
                <Text style={styles.speakerIcon}>🔊</Text>
              </TouchableOpacity>
            </View>
            {/* Pronunciation Input */}
            <View style={styles.inputSection}>
              <TextInput
                style={styles.textInputDis}
                placeholder="Hallo (eg. /həˈloʊ/)"
                value={pronunciation}
                onChangeText={setPronunciation}
                placeholderTextColor="#999"
                editable={false}
                textAlign="left"
              />
            </View>

            {/* Definition Input */}
            <View style={styles.inputSection}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={handleGenerateDefinition}
                disabled={loading}
              >
                <Text style={styles.actionText}>4. Tap here to generate definition</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.textInputDis, styles.multilineInput]}
                placeholder="Definition"
                value={definition}
                onChangeText={setDefinition}
                placeholderTextColor="#999"
                editable={false}
                textAlign="left"
                multiline={true}
              />
            </View>

            {/* Sentence Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>5. Create sentence</Text>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                placeholder="Type a sentence using this vocabulary..."
                value={sentence}
                onChangeText={setSentence}
                placeholderTextColor="#999"
                multiline={true}
              />
            </View>

            {/* Enhanced Image Upload Section */}
            <View style={styles.imageSection}>
              <Text style={styles.inputLabel}>6. Image for the word</Text>
              
              {/* Image Generation and Upload Buttons */}
              <View style={styles.imageButtonsContainer}>
                <TouchableOpacity 
                  style={[styles.imageActionButton, isGeneratingImage && styles.imageActionButtonActive]}
                  onPress={handleGenerateImage}
                  disabled={isGeneratingImage || loading}
                >
                  {isGeneratingImage ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Text style={styles.magicIcon}>✨</Text>
                  )}
                  <Text style={[styles.imageActionText, isGeneratingImage && styles.imageActionTextActive]}>
                    {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.orText}>or</Text>

                <TouchableOpacity 
                  style={styles.imageActionButton}
                  onPress={handleSelectImage}
                  disabled={loading}
                >
                  <Text style={styles.uploadIcon}>📁</Text>
                  <Text style={styles.imageActionText}>Select File</Text>
                </TouchableOpacity>
              </View>
              
              {/* Image Display Area */}
              <View style={styles.imageDisplayContainer}>
                {selectedImage || generatedImageUri ? (
                  <View style={styles.imageWrapper}>
                    <Image 
                      source={{ 
                        uri: selectedImage ? selectedImage.uri : generatedImageUri! 
                      }} 
                      style={styles.selectedImage} 
                    />
                    <View style={styles.imageSourceBadge}>
                      <Text style={styles.imageSourceText}>
                        {imageSource === 'generated' ? '✨ Generated' : '📁 Selected'}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.removeImageButton}
                      onPress={() => {
                        setSelectedImage(null);
                        setGeneratedImageUri(null);
                        setImageSource(null);
                      }}
                    >
                      <Text style={styles.removeImageText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.imageUploadButton}>
                    <MaterialIcons name="image-not-supported" size={16} color="#999" style={styles.imageIcon} />
                    <Text style={styles.imageUploadText}>
                      Generate an image or select from files
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity 
              style={[styles.saveButton, loading && styles.saveButtonDisabled]} 
              onPress={handleSaveCard}
              disabled={loading}
            >
              <LinearGradient
                colors={loading ? ['#ccc', '#999'] : ['#FFA726', '#FF7043']}
                style={styles.saveGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Card</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Topic Selector Modal */}
      <Modal
        visible={showTopicSelector}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTopicSelector(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTopicSelector(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Topic</Text>
            <View style={styles.modalPlaceholder} />
          </View>
          
          <FlatList
            data={topics}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.topicItem,
                  selectedTopicId === item.id && styles.selectedTopicItem
                ]}
                onPress={() => handleTopicSelect(item)}
              >
                <View style={styles.topicItemContent}>
                  <Text style={[
                    styles.topicItemName,
                    selectedTopicId === item.id && styles.selectedTopicText
                  ]}>
                    {item.name}
                  </Text>
                  <Text style={[
                    styles.topicItemCount,
                    selectedTopicId === item.id && styles.selectedTopicText
                  ]}>
                    {item.cardCount} cards
                  </Text>
                </View>
                {selectedTopicId === item.id && (
                  <Text style={styles.checkIcon}>✓</Text>
                )}
              </TouchableOpacity>
            )}
            style={styles.topicList}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 75,
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
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 10,
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
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    textAlign: 'left',
  },
  placeholder: {
    width: 34,
  },
  scrollView: {
    flex: 1,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  vocabularyInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  textInput: {
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
  },
  textInputDis: {
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#f9f6f6ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionSection: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  actionButtonActive: {
    backgroundColor: '#e3f2fd',
  },
  speakerIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  actionTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  
  // Topic Selector Styles
  topicSelector: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  topicSelectorText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  placeholderText: {
    color: '#999',
    fontWeight: '400',
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#999',
  },

  // NEW: Autocorrect Styles
  spellCheckIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  spellCheckText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  suggestionsContainer: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  dismissButton: {
    padding: 4,
  },
  dismissText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  suggestionItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },

  pronunciationSection: {
    marginBottom: 15,
  },
  pronunciationLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  pronunciationDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bee3f8',
    alignSelf: 'flex-start',
  },
  pronunciationText: {
    fontSize: 16,
    color: '#1e40af',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  imageSection: {
    marginBottom: 30,
  },
  
  // Enhanced Image Styles
  imageButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 15,
  },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 120,
    justifyContent: 'center',
  },
  imageActionButtonActive: {
    backgroundColor: '#e3f2fdff',
    borderColor: '#007AFF',
  },
  imageActionText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  imageActionTextActive: {
    color: '#1976d2',
    fontWeight: '500',
  },
  magicIcon: {
    fontSize: 12,
  },
  uploadIcon: {
    fontSize: 12,
  },
  orText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  imageDisplayContainer: {
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  imageUploadButton: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#fafafa',
    minHeight: 120,
    justifyContent: 'center',
    width: '100%',
  },
  imageIcon: {
    fontSize: 48,
    marginBottom: 8,
    opacity: 0.5,
  },
  imageUploadText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  imageSourceBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  imageSourceText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  
  saveButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeNavItem: {
    // Active state styling
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 4,
    opacity: 0.6,
  },
  navIconActive: {
    fontSize: 20,
    marginBottom: 4,
    color: '#007AFF',
  },
  navLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  navLabelActive: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },

  // Modal Styles for Topic Selection
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
  modalPlaceholder: {
    width: 50,
  },
  topicList: {
    flex: 1,
  },
  topicItem: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedTopicItem: {
    backgroundColor: '#007AFF',
  },
  topicItemContent: {
    flex: 1,
  },
  topicItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  topicItemCount: {
    fontSize: 14,
    color: '#666',
  },
  selectedTopicText: {
    color: '#fff',
  },
  checkIcon: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});