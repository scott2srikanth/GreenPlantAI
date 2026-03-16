import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AIModel {
  key: string;
  id: string;
  name: string;
  provider: string;
  tier: string;
  description: string;
  accessible: boolean;
  locked_reason: string | null;
}

export default function BotanistChatScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { plantId, plantName } = useLocalSearchParams<{ plantId: string; plantName: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [models, setModels] = useState<AIModel[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [remainingChats, setRemainingChats] = useState<number | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    setMessages([{
      id: 'welcome', role: 'assistant',
      content: `Hello! I'm your AI Botanist. I'm here to help you with your ${plantName || 'plant'}. Ask me anything about care, diseases, treatment, or general plant health!`,
      timestamp: new Date().toISOString(),
    }]);
    loadModels();
    loadChatHistory();
  }, []);

  const loadModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        setIsPremium(data.is_premium || false);
      }
    } catch (e) { console.log('Models load error:', e); }
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/${plantId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const history = await res.json();
        if (history.length > 0) {
          const historyMessages: Message[] = [];
          const sorted = [...history].reverse();
          for (const h of sorted) {
            historyMessages.push({ id: `${h.id}-user`, role: 'user', content: h.user_message, timestamp: h.created_at });
            historyMessages.push({ id: `${h.id}-ai`, role: 'assistant', content: h.ai_response, timestamp: h.created_at });
          }
          setMessages(prev => [prev[0], ...historyMessages]);
        }
      }
    } catch (e) { console.log('History load error:', e); }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`, role: 'user', content: userMsg, timestamp: new Date().toISOString(),
    }]);
    setLoading(true);

    try {
      const history = messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plant_id: plantId, message: userMsg, model: selectedModel, history }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`, role: 'assistant', content: data.response, timestamp: new Date().toISOString(),
        }]);
        if (data.remaining_chats !== undefined) setRemainingChats(data.remaining_chats);
      } else {
        const errData = await res.json().catch(() => ({ detail: 'Unknown error' }));
        if (res.status === 403) {
          Alert.alert('Premium Required', errData.detail || 'Upgrade to access this model', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/(tabs)/profile') },
          ]);
          setMessages(prev => [...prev, {
            id: `err-${Date.now()}`, role: 'assistant',
            content: 'This model requires a Premium subscription. You can upgrade from Profile > Premium Plan.',
            timestamp: new Date().toISOString(),
          }]);
        } else if (res.status === 429) {
          setMessages(prev => [...prev, {
            id: `err-${Date.now()}`, role: 'assistant',
            content: errData.detail || 'Daily chat limit reached. Upgrade to Premium for unlimited chats!',
            timestamp: new Date().toISOString(),
          }]);
        } else {
          setMessages(prev => [...prev, {
            id: `err-${Date.now()}`, role: 'assistant',
            content: errData.detail || 'Sorry, I had trouble responding. Please try again.',
            timestamp: new Date().toISOString(),
          }]);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Connection error. Please check your internet and try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally { setLoading(false); }
  };

  const currentModel = models.find(m => m.key === selectedModel);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={styles.avatarWrap}>
            <Ionicons name="leaf" size={16} color={Colors.primary} />
          </View>
        )}
        <View style={[styles.msgBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  const quickPrompts = [
    'How to treat yellow leaves?',
    'Best watering schedule?',
    'Common diseases?',
    'When to repot?',
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="chat-back-btn">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="leaf" size={16} color={Colors.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Botanist</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{plantName || 'Plant Care'}</Text>
          </View>
        </View>
        {/* Model Selector */}
        <TouchableOpacity
          style={styles.modelBtn}
          onPress={() => setShowModelPicker(true)}
          testID="model-selector-btn"
        >
          <Ionicons name="hardware-chip" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Model Badge & Remaining Chats */}
      <View style={styles.statusBar}>
        <TouchableOpacity style={styles.modelBadge} onPress={() => setShowModelPicker(true)}>
          <Ionicons name="hardware-chip" size={14} color={Colors.primary} />
          <Text style={styles.modelBadgeText}>{currentModel?.name || 'GPT-4o Mini'}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        {remainingChats !== null && (
          <View style={[styles.chatCountBadge, remainingChats <= 2 && { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.chatCountText, remainingChats <= 2 && { color: Colors.danger }]}>
              {remainingChats} chats left today
            </Text>
          </View>
        )}
        {!isPremium && (
          <TouchableOpacity
            style={styles.upgradeBadge}
            onPress={() => router.push('/(tabs)/profile')}
            testID="chat-upgrade-btn"
          >
            <Ionicons name="star" size={12} color="#E6B050" />
            <Text style={styles.upgradeText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        onLayout={() => flatListRef.current?.scrollToEnd()}
        ListFooterComponent={loading ? (
          <View style={styles.typingRow}>
            <View style={styles.avatarWrap}>
              <Ionicons name="leaf" size={16} color={Colors.primary} />
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.typingText}>Thinking...</Text>
            </View>
          </View>
        ) : null}
      />

      {/* Quick Prompts */}
      {messages.length <= 1 && (
        <View style={styles.quickPrompts}>
          {quickPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i} style={styles.quickPromptBtn}
              onPress={() => setInput(prompt)}
              testID={`quick-prompt-${i}`}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.inputContainer}>
          <TextInput
            testID="chat-input"
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your plant..."
            placeholderTextColor={Colors.textMuted}
            multiline maxLength={500}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            testID="chat-send-btn"
          >
            <Ionicons name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Model Picker Modal */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select AI Model</Text>
              <TouchableOpacity onPress={() => setShowModelPicker(false)} testID="close-model-picker">
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {models.map((model) => (
              <TouchableOpacity
                key={model.key}
                style={[
                  styles.modelOption,
                  selectedModel === model.key && styles.modelOptionSelected,
                  !model.accessible && styles.modelOptionLocked,
                ]}
                onPress={() => {
                  if (!model.accessible) {
                    Alert.alert('Premium Required', model.locked_reason || 'Upgrade to access this model', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Upgrade', onPress: () => { setShowModelPicker(false); router.push('/(tabs)/profile'); } },
                    ]);
                    return;
                  }
                  if (model.key === 'ollama-local') {
                    Alert.alert('Ollama', 'Local Ollama support requires setup. Coming soon!');
                    return;
                  }
                  setSelectedModel(model.key);
                  setShowModelPicker(false);
                }}
                testID={`model-option-${model.key}`}
              >
                <View style={styles.modelOptionLeft}>
                  <View style={[styles.modelDot, selectedModel === model.key && styles.modelDotActive]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.modelNameRow}>
                      <Text style={styles.modelName}>{model.name}</Text>
                      {model.tier === 'premium' && (
                        <View style={styles.premiumTag}>
                          <Ionicons name="star" size={10} color="#E6B050" />
                          <Text style={styles.premiumTagText}>PRO</Text>
                        </View>
                      )}
                      {!model.accessible && <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />}
                    </View>
                    <Text style={styles.modelProvider}>{model.provider}</Text>
                    <Text style={styles.modelDesc}>{model.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    backgroundColor: Colors.paper, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, maxWidth: 150 },
  modelBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, backgroundColor: Colors.paper, borderBottomWidth: 1,
    borderBottomColor: Colors.border, gap: Spacing.sm,
  },
  modelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.secondary, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  modelBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  chatCountBadge: {
    backgroundColor: Colors.subtle, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  chatCountText: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  upgradeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto',
    backgroundColor: '#FEF3C7', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  upgradeText: { fontSize: 11, fontWeight: '600', color: '#B45309' },
  messageList: { padding: Spacing.md, paddingBottom: Spacing.xs },
  msgRow: { flexDirection: 'row', marginBottom: Spacing.md, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end' },
  msgRowAssistant: { alignSelf: 'flex-start' },
  avatarWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs, marginTop: 2,
  },
  msgBubble: { borderRadius: Radius.lg, padding: Spacing.md, maxWidth: '100%' },
  userBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: Colors.paper, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  msgText: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
  userMsgText: { color: Colors.white },
  typingRow: { flexDirection: 'row', alignSelf: 'flex-start', marginBottom: Spacing.md },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.paper, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  typingText: { fontSize: 13, color: Colors.textMuted },
  quickPrompts: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  quickPromptBtn: { backgroundColor: Colors.secondary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  quickPromptText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.sm,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.subtle, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary, maxHeight: 100,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.paper, borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg, padding: Spacing.lg, maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modelOption: {
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  modelOptionSelected: { borderColor: Colors.primary, backgroundColor: '#F0F7F1' },
  modelOptionLocked: { opacity: 0.6 },
  modelOptionLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  modelDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, marginTop: 2,
  },
  modelDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  modelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  premiumTag: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1,
  },
  premiumTagText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  modelProvider: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  modelDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
