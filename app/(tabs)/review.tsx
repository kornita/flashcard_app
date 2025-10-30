import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebase/firebaseConfig";
import {
  createTopic,
  getSharedCardsForRecipient, // Add this new import
  getTopics,
  updateTopic
} from "../firebase/firestore";

// ---------------- Types ----------------
interface Topic {
  id: string;
  name: string;
  description?: string;
  email?: string; // ← ADD THIS
  cardCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  isShared?: boolean;
  sharedBy?: string;
  friendEmail?: string;
}

const formatDate = (timestamp: any): string => {
  if (!timestamp) return "Unknown";
  
  try {
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString();
    }
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleDateString();
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return "Unknown";
  }
};

// ---------------- Component ----------------
export default function ReviewScreen() {
  const [searchText, setSearchText] = useState("");
  const [myTopics, setMyTopics] = useState<Topic[]>([]);
  const [sharedTopics, setSharedTopics] = useState<Topic[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicDescription, setNewTopicDescription] = useState("");
  const [totalCards, setTotalCards] = useState(0);
  const [selectedTab, setSelectedTab] = useState<'my' | 'shared'>('my');
  const [userCardsCount, setUserCardsCount] = useState(0);
  const [loading, setLoading] = useState(true); // ✅ Add this at the top
  

  const cardColors = [
    "#f6dedeff",
    "#f8ebb4ff",
    "#d3f7cdff",
    "#E5E1FF",
    "#c7e2faff",
  ];

  // ---------------- Load Topics 
const loadTopics = useCallback(async () => {
  setLoading(true);
  try {
    const userId = auth.currentUser?.uid;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('=== LOADING TOPICS DEBUG ===');
    console.log('Current User ID:', userId);

    // 1️⃣ Get user's created topics
    const fetchedTopics = await getTopics();
    
    // 2️⃣ Get shared cards for recipient
    const sharedCards = await getSharedCardsForRecipient();
    
    console.log(`Found ${sharedCards.length} shared cards`);
    
    // 3️⃣ ✅ FETCH ONLY REFERENCED TOPICS FROM FIRESTORE TO CREATE MAP
    console.log('📚 Fetching referenced topics from Firestore...');
    
    // Get unique topicIds from shared cards
    const uniqueTopicIds = [...new Set(
      sharedCards
        .map((card: any) => card.topicId)
        .filter((id: string) => id) // Remove undefined/null
    )];
    
    console.log(`Found ${uniqueTopicIds.length} unique topic IDs to fetch`);
    
    // Create topicId → topicName map
    const topicIdToNameMap: { [key: string]: string } = {};
    
    // Fetch each referenced topic individually
    for (const topicId of uniqueTopicIds) {
      try {
        const topicRef = doc(db, 'topics', topicId);
        const topicSnap = await getDoc(topicRef);
        
        if (topicSnap.exists()) {
          const topicData = topicSnap.data();
          topicIdToNameMap[topicId] = topicData.name || 'Untitled';
          console.log(`  Topic: ${topicId} → ${topicData.name}`);
        } else {
          console.log(`  Topic ${topicId} not found`);
          topicIdToNameMap[topicId] = 'Unknown Topic';
        }
      } catch (error) {
        console.error(`  Error fetching topic ${topicId}:`, error);
        topicIdToNameMap[topicId] = 'Unknown Topic';
      }
    }
    
    console.log(`✅ Loaded ${Object.keys(topicIdToNameMap).length} topics into map`);

    // 4️⃣ Group shared cards by sender
    const groupedBySender = sharedCards.reduce((groups: any, card: any) => {
      const senderId = card.senderId || 'unknown';
      if (!groups[senderId]) {
        groups[senderId] = [];
      }
      groups[senderId].push(card);
      return groups;
    }, {});
    
    console.log('Grouped by sender:', Object.keys(groupedBySender).length, 'senders');
    
    // 5️⃣ ✅ CREATE SENDER GROUPS WITH REAL TOPIC NAMES
    const senderGroups = await Promise.all(
      Object.entries(groupedBySender).map(async ([senderId, cards]: [string, any]) => {
        // Get sender info from users collection
        let senderName = 'Unknown Sender';
        let senderEmail = '';
        
        try {
          const senderRef = doc(db, 'users', senderId);
          const senderSnap = await getDoc(senderRef);
          if (senderSnap.exists()) {
            const senderData = senderSnap.data();
            senderName = senderData.displayName || senderData.name || senderData.email?.split('@')[0] || 'Unknown';
            senderEmail = senderData.email || '';
          }
        } catch (error) {
          console.error('Error fetching sender info for:', senderId, error);
        }
        
        // ✅ AGGREGATE TOPIC NAMES USING THE MAP
        const topicSet = new Set<string>();
        
        console.log(`\n📋 Processing cards for ${senderName}:`);
        cards.forEach((card: any) => {
          console.log(`  Card: "${card.vocabulary}"`);
          console.log(`    topicId: ${card.topicId}`);
          
          if (card.topicId && topicIdToNameMap[card.topicId]) {
            const topicName = topicIdToNameMap[card.topicId];
            console.log(`    ✅ Found topic: ${topicName}`);
            topicSet.add(topicName);
          } else if (card.topicId) {
            console.log(`    ⚠️ topicId ${card.topicId} not found in map`);
            topicSet.add('Unknown Topic');
          } else {
            console.log(`    ⚠️ No topicId on this card`);
          }
        });
        
        // Create comma-separated topic list (max 3)
        const topicList = Array.from(topicSet).slice(0, 3);
        const topicDescription = topicList.length > 0 
          ? topicList.join(', ') + (topicSet.size > 3 ? '...' : '')
          : 'No topics';
        
        console.log(`✅ ${senderName} topics: ${topicDescription}\n`);
        
        return {
          id: senderId,
          name: senderName,
          email: senderEmail,
          description: topicDescription, // ✅ Real topic names here!
          cardCount: cards.length,
          cards: cards,
          isShared: true,
          sharedBy: senderId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      })
    );
    
    // Sort by card count (most cards first)
    senderGroups.sort((a, b) => b.cardCount - a.cardCount);
    
    console.log('=== SENDER GROUPS CREATED ===');
    senderGroups.forEach(group => {
      console.log(`${group.name}: ${group.cardCount} cards - Topics: ${group.description}`);
    });
    
    setSharedTopics(senderGroups);

    // 6️⃣ Create My Topics list
    const myTopicsList: Topic[] = fetchedTopics.map((topic: any) => ({
      id: topic.id,
      name: topic.name || "",
      description: topic.description || "",
      cardCount: topic.cardCount || 0,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      isShared: false,
    }));

    // 7️⃣ Calculate totals
    const userCardsCount = myTopicsList.reduce((sum, topic) => sum + (topic.cardCount || 0), 0);
    const uniqueSharedCardsCount = sharedCards.length;
    const totalUniqueCards = userCardsCount + uniqueSharedCardsCount;

    setMyTopics(myTopicsList);
    setUserCardsCount(userCardsCount);
    setTotalCards(totalUniqueCards);

    console.log('=== FINAL RESULTS ===');
    console.log('My topics cards:', userCardsCount);
    console.log('Shared groups:', senderGroups.length);
    console.log('Total shared cards:', uniqueSharedCardsCount);
    console.log('Total cards:', totalUniqueCards);

  } catch (error) {
    console.error("❌ Error loading topics:", error);
    Alert.alert(
      "Error Loading Topics",
      "Failed to load topics. Please try again.",
      [
        { text: "Retry", onPress: loadTopics },
        { text: "Cancel", style: "cancel" },
      ]
    );
  } finally { 
    setLoading(false); // ✅ always stop loading
  }
}, []);

  useFocusEffect(
    useCallback(() => {
      loadTopics();
    }, [loadTopics])
  );

  // ---------------- Handlers ----------------
  const handleAddTopic = () => {
    setNewTopicName("");
    setNewTopicDescription("");
    setShowAddModal(true);
  };

  const handleClearSearch = () => {
    setSearchText("");
  };

  const handleSaveNewTopic = async () => {
    if (!newTopicName.trim()) {
      Alert.alert("Error", "Topic name is required");
      return;
    }

    try {
      const topicData = {
        name: newTopicName.trim(),
        description: newTopicDescription.trim(),
      };

      const newTopicId = await createTopic(topicData);

      const newTopic: Topic = {
        id: newTopicId,
        name: topicData.name,
        description: topicData.description,
        cardCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        isShared: false,
      };

      setMyTopics((prev) => [newTopic, ...prev]);
      setShowAddModal(false);
      setNewTopicName("");
      setNewTopicDescription("");

      Alert.alert("Success", `Topic "${topicData.name}" created successfully!`);
    } catch (error) {
      console.error("Error creating topic:", error);
      Alert.alert("Error", "Failed to create topic. Please try again.");
    }
  };

  const handleEditTopic = (topic: Topic, event?: any) => {
    if (event) event.stopPropagation();
    
    if (topic.isShared) {
      Alert.alert("Cannot Edit", "Shared topics cannot be edited. You can only view them.");
      return;
    }
    
    setEditingTopic(topic);
    setNewTopicName(topic.name);
    setNewTopicDescription(topic.description || "");
    setShowEditModal(true);
  };

  const handleUpdateTopic = async () => {
    if (!editingTopic || !newTopicName.trim()) {
      Alert.alert("Error", "Topic name is required");
      return;
    }

    try {
      const updatedData = {
        name: newTopicName.trim(),
        description: newTopicDescription.trim(),
      };

      await updateTopic(editingTopic.id, updatedData);

      setMyTopics((prev) =>
        prev.map((topic) =>
          topic.id === editingTopic.id ? { ...topic, ...updatedData } : topic
        )
      );

      setShowEditModal(false);
      setEditingTopic(null);
      setNewTopicName("");
      setNewTopicDescription("");

      Alert.alert("Success", "Topic updated successfully!");
    } catch (error) {
      console.error("Error updating topic:", error);
      Alert.alert("Error", "Failed to update topic. Please try again.");
    }
  };

  
  const handleCategoryPress = (topic: Topic) => {
  if (topic.isShared) {
    // For shared sender groups - navigate with sender info
    router.push({
      pathname: "/showcard",
      params: { 
        isShared: 'true',
        sharedBy: topic.sharedBy || topic.id,
        senderName: topic.name,
        fromTab: 'shared',
      },
      });
    } else {
      // For user's own topics - navigate with topicId
      router.push({
        pathname: "/showcard",
        params: { 
          topicId: topic.id,
          topicName: topic.name,
        },
      });
    }
  };

    // Add a new handler for "All Cards" / Deck banner click
  const handleViewAllCards = () => {
    // CASE 3: View all cards (no topic filter, no friend filter)
    router.push({
      pathname: "/showcard",
      params: {
        // Don't pass topicId or sharedBy - this triggers Case 3
        topicName: 'All Cards',
        isShared: 'false'
      },
    });
  };

  const handleCategoryLongPress = (topic: Topic) => {
    const alertMessage = `${topic.cardCount} card${topic.cardCount !== 1 ? 's' : ''}${
      topic.description ? "\n\n" + topic.description : ""
    }${topic.friendEmail ? "\n\nEmail: " + topic.friendEmail : ""}`;

    if (!topic.isShared) {
      Alert.alert(
        topic.name,
        alertMessage,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Edit Topic", onPress: () => handleEditTopic(topic) },
        ]
      );
    } else {
      Alert.alert(
        topic.name,
        alertMessage,
        [{ text: "OK" }]
      );
    }
  };

  // ---------------- Filtered Data ----------------
  const currentTopics = selectedTab === 'my' ? myTopics : sharedTopics;
  
  const filteredTopics = currentTopics.filter(
    (topic) =>
      topic.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (topic.description &&
        topic.description.toLowerCase().includes(searchText.toLowerCase()))
  );

  // ---------------- Loading State ----------------
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ActivityIndicator size="large" color="#FFA726" />
        <Text style={styles.loadingText}>Loading your topics...</Text>
      </View>
    );
  }

  // ---------------- Render ----------------
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.titleSection}>
        <Text style={styles.mainTitle}>My Flashcards</Text>
      </View>

      <View style={styles.decksSection}>
        <TouchableOpacity onPress={handleViewAllCards}>
          <LinearGradient
            colors={["#FFC107", "#4CAF50"]}
            style={styles.decksBanner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.decksContent}>
              <View style={styles.decksInfo}>
                <MaterialIcons name="collections-bookmark" size={24} color="white" />
                <Text style={styles.decksTitle}>Your Decks</Text>
                <Text style={styles.decksSubtitle}>
                  {myTopics.length + sharedTopics.length} topics
                </Text>
              </View>

              <View style={styles.decksStats}>
                <Text style={styles.decksNumber}>{totalCards}</Text>
                <Text style={styles.decksLabel}>
                  Total{"\n"}Cards
                </Text>
              </View>

              <View style={styles.trophyContainer}>
                <Text style={styles.trophyIcon}>🏆</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        <View style={styles.tabContainer}>
      
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'my' && styles.tabActive]}
            onPress={() => setSelectedTab('my')}
          >
            <Text style={[styles.tabText, selectedTab === 'my' && styles.tabTextActive]}>
              My Topics ({userCardsCount || 0})
            </Text>
          </TouchableOpacity>
            <TouchableOpacity
          style={[styles.tab, selectedTab === 'shared' && styles.tabActive]}
          onPress={() => setSelectedTab('shared')}
        >
          <Text style={[styles.tabText, selectedTab === 'shared' && styles.tabTextActive]}>
            Shared (
            {sharedTopics.reduce(
              (sum, topic) => sum + (typeof topic.cardCount === 'number' ? topic.cardCount : 0),
              0
            )}
            )
          </Text>
        </TouchableOpacity>

        </View>

        <View style={styles.decksSectionTopic}>
          <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>

              <TextInput
                style={styles.searchInput}
                placeholder={`Search ${selectedTab === 'my' ? 'your' : 'shared'} topics...`}
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={setSearchText}
              />

              {searchText.trim() ? (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClearSearch}
                >
                  <Text style={styles.clearIcon}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.categoryGrid}>
            {filteredTopics.map((topic, index) => {
              const bgColor = cardColors[index % cardColors.length];
              return (
                <TouchableOpacity
                  key={topic.id}
                  style={[styles.categoryCard, { backgroundColor: bgColor }]}
                  onPress={() => handleCategoryPress(topic)}
                  onLongPress={() => handleCategoryLongPress(topic)}
                  delayLongPress={500}
                >
                  {/* Edit button - Only for own topics */}
                  {!topic.isShared && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => handleEditTopic(topic, e)}
                      >
                        <FontAwesome name="edit" size={16} color="#999" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Shared badge - For sender groups */}
                  {topic.isShared && (
                    <View style={styles.sharedBadge}>
                      <Text style={styles.sharedBadgeText}>👥</Text>
                    </View>
                  )}

                    <View style={styles.categoryContent}>
                      <Text style={styles.categoryName} numberOfLines={2}>
                        {topic.name}  {/* Sender name: "John Doe" */}
                      </Text>
                      <Text style={styles.categoryNumber}>
                        {topic.cardCount} card{topic.cardCount !== 1 ? 's' : ''}
                      </Text>
                      {topic.isShared && topic.description ? (
                        <Text style={styles.categoryDescription} numberOfLines={1}>
                          {topic.description}  {/* Topics: "Kitchen, Travel" */}
                        </Text>
                      ) : topic.description ? (
                        <Text style={styles.categoryDescription} numberOfLines={2}>
                          {topic.description}
                        </Text>
                      ) : null}
                    </View>
                </TouchableOpacity>
              );
            })}

            {/* Add Topic Button - Only in My tab */}
            {selectedTab === 'my' && (
              <TouchableOpacity style={styles.addTopicCard} onPress={handleAddTopic}>
                <Text style={styles.addTopicIcon}>＋</Text>
                <Text style={styles.addTopicText}>Add topic</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>

        {selectedTab === 'my' && myTopics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>No topics yet</Text>
            <Text style={styles.emptyText}>
              Create your first topic to start organizing your flashcards
            </Text>
            <TouchableOpacity
              style={styles.createFirstTopicButton}
              onPress={handleAddTopic}
            >
              <Text style={styles.createFirstTopicText}>Create First Topic</Text>
            </TouchableOpacity>
          </View>
        ) : selectedTab === 'shared' && sharedTopics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No shared cards</Text>
            <Text style={styles.emptyText}>
              Cards shared with you from friends will appear here
            </Text>
          </View>
        ) : filteredTopics.length === 0 && searchText ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No topics found</Text>
            <Text style={styles.emptyText}>
              Try a different search term{selectedTab === 'my' ? ' or create a new topic' : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Topic</Text>
            <TouchableOpacity onPress={handleSaveNewTopic}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Topic Name *</Text>
              <TextInput
                style={styles.textInput}
                value={newTopicName}
                onChangeText={setNewTopicName}
                placeholder="Enter topic name (e.g., Kitchen, Travel, Business)"
                autoFocus
                maxLength={50}
              />
              <Text style={styles.characterCount}>
                {newTopicName.length}/50
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={newTopicDescription}
                onChangeText={setNewTopicDescription}
                placeholder="Describe what this topic covers..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={200}
              />
              <Text style={styles.characterCount}>
                {newTopicDescription.length}/200
              </Text>
            </View>

            <View style={styles.exampleContainer}>
              <Text style={styles.exampleTitle}>Examples:</Text>
              <Text style={styles.exampleText}>
                • Kitchen - Cooking tools and ingredients
              </Text>
              <Text style={styles.exampleText}>
                • Travel - Transportation and accommodation
              </Text>
              <Text style={styles.exampleText}>
                • Business - Professional and workplace terms
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Topic</Text>
            <TouchableOpacity onPress={handleUpdateTopic}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Topic Name *</Text>
              <TextInput
                style={styles.textInput}
                value={newTopicName}
                onChangeText={setNewTopicName}
                placeholder="Enter topic name"
                maxLength={50}
              />
              <Text style={styles.characterCount}>
                {newTopicName.length}/50
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={newTopicDescription}
                onChangeText={setNewTopicDescription}
                placeholder="Describe what this topic covers..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={200}
              />
              <Text style={styles.characterCount}>
                {newTopicDescription.length}/200
              </Text>
            </View>

            {editingTopic && (
              <View style={styles.topicStatsContainer}>
                <Text style={styles.topicStatsTitle}>Topic Statistics</Text>
                <Text style={styles.topicStatsText}>
                  Cards: {editingTopic.cardCount}
                </Text>
                <Text style={styles.topicStatsText}>
                  Created:{" "}
                  {formatDate(editingTopic.createdAt) || "Unknown"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 75,
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  scrollView: {
    flex: 1
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
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333'
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFA726',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  addButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600'
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 10
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
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
    fontSize: 14,
    marginRight: 10
  },
  clearIcon: {
    fontSize: 14,
    color: '#999',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  clearButton: {
    padding: 0,
  },
  decksSection: {
    paddingHorizontal: 20,
    marginBottom: 5,
  },
  decksBanner: {
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  decksContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  decksInfo: {
    flex: 1,
  },
  decksTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff'
  },
  decksSubtitle: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    marginTop: 2
  },
  decksStats: {
    alignItems: 'center',
    marginRight: 15
  },
  decksNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff'
  },
  decksLabel: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.9
  },
  trophyContainer: {
    width: 35,
    height: 35,
    justifyContent: 'center',
    alignItems: 'center'
  },
  trophyIcon: {
    fontSize: 32
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    gap: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabActive: {
    backgroundColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  decksSectionTopic: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    justifyContent: 'center',
    marginBottom: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryGrid: {
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10
  },
  categoryCard: {
    width: '49%',
    borderRadius: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    padding: 15,
    minHeight: 100,
    position: 'relative',
  },
  cardActions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sharedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sharedBadgeText: {
    fontSize: 14,
  },
  categoryContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 20,
  },
  categoryName: {
    textAlign: 'center',
    marginTop: -5,
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 5,
    lineHeight: 20,
  },
  categoryNumber: {
    fontSize: 12,
    textAlign: 'center',
    color: '#555',
    fontWeight: '500',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 11,
    textAlign: 'center',
    color: '#666',
    lineHeight: 14,
    fontStyle: 'italic',
  },
  addTopicCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbc7c7ff',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    borderRadius: 16,
    padding: 15,
    position: 'relative',
  },
  addTopicIcon: {
    fontSize: 32,
    color: '#999',
    fontWeight: '300',
    marginBottom: 8
  },
  addTopicText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500'
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  createFirstTopicButton: {
    backgroundColor: '#FFA726',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createFirstTopicText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 100
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
  characterCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  exampleContainer: {
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    lineHeight: 18,
  },
  topicStatsContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  topicStatsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  topicStatsText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
});