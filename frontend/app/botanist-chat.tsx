import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
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

export default function BotanistChatScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { plantId, plantName } = useLocalSearchParams<{ plantId: string; plantName: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Add welcome message
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your AI Botanist. I'm here to help you with your ${plantName || 'plant'}. Ask me anything about care, diseases, treatment, or general plant health!`,
      timestamp: new Date().toISOString(),
    }]);
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/${plantId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const history = await res.json();
        if (history.length > 0) {
          const historyMessages: Message[] = [];
          // Reverse so oldest first
          const sorted = [...history].reverse();
          for (const h of sorted) {
            historyMessages.push({
              id: `${h.id}-user`,
              role: 'user',
              content: h.user_message,
              timestamp: h.created_at,
            });
            historyMessages.push({
              id: `${h.id}-ai`,
              role: 'assistant',
              content: h.ai_response,
              timestamp: h.created_at,
            });
          }
          setMessages(prev => [prev[0], ...historyMessages]);
        }
      }
    } catch (e) {
      console.log('History load error:', e);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Build history from recent messages
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plant_id: plantId,
          message: userMsg,
          history: history,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        const aiMessage: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I had trouble responding. Please try again.',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Connection error. Please check your internet and try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

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
        <View style={{ width: 44 }} />
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

      {/* Quick Prompts (show only when few messages) */}
      {messages.length <= 1 && (
        <View style={styles.quickPrompts}>
          {quickPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quickPromptBtn}
              onPress={() => { setInput(prompt); }}
              testID={`quick-prompt-${i}`}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            testID="chat-input"
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your plant..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, maxWidth: 180 },
  messageList: { padding: Spacing.md, paddingBottom: Spacing.xs },
  msgRow: { flexDirection: 'row', marginBottom: Spacing.md, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end' },
  msgRowAssistant: { alignSelf: 'flex-start' },
  avatarWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs, marginTop: 2,
  },
  msgBubble: { borderRadius: Radius.lg, padding: Spacing.md, maxWidth: '100%' },
  userBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: Colors.paper,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
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
  quickPromptBtn: {
    backgroundColor: Colors.secondary, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  quickPromptText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border,
    gap: Spacing.sm,
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
});
