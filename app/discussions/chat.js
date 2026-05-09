// app/discussions/chat.js
// Route: /discussions/chat?groupId=xxx&groupName=xxx
// Add to your root _layout.js: <Stack.Screen name="discussions/chat" options={{ headerShown: true }} />

import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { Link, Image as LucideImage, Paperclip, Send, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinkedPinItem from '../../components/discussions/LinkedPinItem';
import LinkedPlanItem from '../../components/discussions/LinkedPlanItem';
import LinkItemModal from '../../components/discussions/LinkItemModal';
import {
  deleteMessage,
  fetchMessages,
  markGroupRead,
  sendMessage,
  subscribeToMessages,
  unsubscribeFromMessages,
} from '../../services/discussionsService';
import { loggedInUserAtom } from '../../store/atoms';
import { discussionUnreadAtom } from '../../store/discussionsAtoms';

export default function ChatScreen() {
  const navigation               = useNavigation();
  const { groupId, groupName }   = useLocalSearchParams();
  const [user]                   = useAtom(loggedInUserAtom);
  const [, setUnread]            = useAtom(discussionUnreadAtom);
  const insets                   = useSafeAreaInsets();
  const [messages, setMessages]  = useState([]);
  const [loading, setLoading]    = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore]    = useState(true);
  const [input, setInput]        = useState('');
  const [sending, setSending]    = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // { uri, name, mimeType, preview }
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingLinked, setPendingLinked] = useState([]); // { item_type, item_id, label }
  const listRef  = useRef(null);
  const channelRef = useRef(null);

  // ── Header ────────────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: groupName ?? 'Discussion',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: 'black' },
      headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <View style={styles.headerBtn}>
            <Feather name="arrow-left" size={20} color="#000" />
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => navigation.navigate('discussions/members', { groupId, groupName })}
        >
          <View style={styles.headerBtn}>
            <Feather name="users" size={18} color="#000" />
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation, groupId, groupName]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchMessages(groupId, 50);
        if (mounted) {
          setMessages(data);
          setHasMore(data.length === 50);
          await markGroupRead(groupId);
          // Clear badge immediately in the groups list
          setUnread(prev => ({ ...prev, [groupId]: 0 }));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Real-time subscription
    channelRef.current = subscribeToMessages(groupId, (newMsg) => {
      setMessages(prev => {
        const exists = prev.find(m => m.id === newMsg.id);
        if (exists) {
          return prev.map(m => m.id === newMsg.id ? newMsg : m);
        }
        return [...prev, newMsg];
      });
      markGroupRead(groupId);
      setUnread(prev => ({ ...prev, [groupId]: 0 }));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });

    // Log subscription status so we can confirm realtime is working
    channelRef.current.on('system', {}, (status) => {
      console.log('💬 Realtime subscription status:', status);
    });

    return () => {
      mounted = false;
      unsubscribeFromMessages(channelRef.current);
    };
  }, [groupId]);

  // ── Load older messages ───────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]?.created_at;
      const older = await fetchMessages(groupId, 30, oldest);
      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length === 30);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages, groupId]);

  // ── Attachments ───────────────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setPendingFiles(prev => [...prev, {
        uri: a.uri,
        name: a.fileName ?? `photo_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        preview: a.uri,
      }]);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.type === 'success') {
      setPendingFiles(prev => [...prev, {
        uri: result.uri,
        name: result.name,
        mimeType: result.mimeType ?? 'application/octet-stream',
        size: result.size,
        preview: null,
      }]);
    }
  };

  const removePendingFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  const removePendingLinked = (idx) => setPendingLinked(prev => prev.filter((_, i) => i !== idx));

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if ((!input.trim() && pendingFiles.length === 0 && pendingLinked.length === 0) || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(groupId, input, pendingFiles, pendingLinked);
      setMessages(prev => [...prev, msg]);
      setInput('');
      setPendingFiles([]);
      setPendingLinked([]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (messageId) => {
    await deleteMessage(messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  // ── Render message ────────────────────────────────────────────────────────
  const renderMessage = ({ item }) => {
    const myAuthId = user?.auth_id ?? user?.id;
    const isOwn = item.user_id === myAuthId;
    const profile = item.members;
    const attachments = item.discussions_attachments ?? [];
    const linked = item.discussions_linked_items ?? [];

    if (item.is_deleted) {
      return (
        <View style={[styles.row, isOwn && styles.rowOwn]}>
          <View style={[styles.bubble, styles.bubbleDeleted]}>
            <Text style={styles.deletedText}><Feather name="slash" size={12} /> Message supprimé</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.row, isOwn && styles.rowOwn]}>
        {!isOwn && (
          <View style={[styles.avatarSmall, { backgroundColor: avatarColor(item.user_id ?? '') }]}>
            <Text style={styles.avatarSmallText}>{(profile?.name ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.bubbleWrapper}>
          {!isOwn && <Text style={styles.senderName}>{profile?.name ?? 'Inconnu'}</Text>}

          <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
            {/* Text */}
            {item.content && (
              <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.content}</Text>
            )}

            {/* Image attachments */}
            {attachments.filter(a => a.file_type === 'image').map(a => (
              <Image key={a.id} source={{ uri: a.file_url }} style={styles.attachImage} resizeMode="cover" />
            ))}

            {/* Document attachments */}
            {attachments.filter(a => a.file_type !== 'image').map(a => (
              <View key={a.id} style={styles.docRow}>
                <Feather name="file-text" size={16} color={isOwn ? '#DDD6FE' : '#6D28D9'} />
                <Text style={[styles.docName, isOwn && { color: '#EDE9FE' }]} numberOfLines={1}>{a.file_name}</Text>
              </View>
            ))}

            {/* Linked items */}
{linked.map((l, idx) => {
  const key = l.id || `${l.item_type}-${l.item_id}-${idx}`;
  
  if (l.item_type === 'pin') {
    return (
      <LinkedPinItem
        key={key}
        itemId={l.item_id}
        isOwn={isOwn}
        onPress={() => navigation.navigate('PinMetadataScreen', { pinId: l.item_id })}
      />
    );
  }
  
  if (l.item_type === 'plan') {
    return (
      <LinkedPlanItem
        key={key}
        itemId={l.item_id}
        isOwn={isOwn}
        onPress={() => navigation.navigate('plans/index', { planId: l.item_id })}
      />
    );
  }
  
  // Fallback for other types
  return (
    <TouchableOpacity 
      key={key}
      style={[styles.linkedRow, isOwn && styles.linkedRowOwn]}
      activeOpacity={0.7}
    >
      <Link size={13} color={isOwn ? '#DDD6FE' : '#6D28D9'} />
      <Text style={[styles.linkedText, isOwn && { color: '#EDE9FE' }]} numberOfLines={1}>
        {l.label ?? l.item_id}
      </Text>
    </TouchableOpacity>
  );
})}
 

            <Text style={[styles.time, isOwn && styles.timeOwn]}>
              {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {/* Delete (own messages only) */}
          {isOwn && (
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteTap}>
              <Trash2 size={12} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Root render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#6D28D9" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => i.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.1}
          ListHeaderComponent={loadingOlder
            ? <ActivityIndicator size="small" color="#6D28D9" style={{ marginVertical: 8 }} />
            : null}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Pending attachments preview */}
      {(pendingFiles.length > 0 || pendingLinked.length > 0) && (
        <View style={styles.pendingBar}>
          {pendingFiles.map((f, i) => (
            <View key={i} style={styles.pendingChip}>
              {f.preview
                ? <Image source={{ uri: f.preview }} style={styles.pendingThumb} />
                : <Feather name="file" size={16} color="#6D28D9" />}
              <Text style={styles.pendingName} numberOfLines={1}>{f.name}</Text>
              <TouchableOpacity onPress={() => removePendingFile(i)}>
                <X size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>
          ))}
          {pendingLinked.map((l, i) => (
            <View key={`l${i}`} style={styles.pendingChip}>
              <Link size={14} color="#6D28D9" />
              <Text style={styles.pendingName} numberOfLines={1}>{l.label ?? l.item_id}</Text>
              <TouchableOpacity onPress={() => removePendingLinked(i)}>
                <X size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Input bar - wrapped in KeyboardAvoidingView specifically for Android */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
            <LucideImage size={20} color="#6D28D9" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={pickDocument}>
            <Paperclip size={20} color="#6D28D9" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowLinkModal(true)}>
            <Link size={20} color="#6D28D9" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={2000}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() && pendingFiles.length === 0 && pendingLinked.length === 0) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={sending || (!input.trim() && pendingFiles.length === 0 && pendingLinked.length === 0)}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Send size={18} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <LinkItemModal
        visible={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onLink={(item) => {
          setPendingLinked(prev => [...prev, item]);
          setShowLinkModal(false);
        }}
      />
    </View>
  );
}

const COLORS = ['#7C3AED','#DB2777','#0891B2','#059669','#D97706','#DC2626','#4F46E5'];
const avatarColor = (id) => COLORS[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  list:      { padding: 16, paddingBottom: 8 },

  headerBtn: {
    backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
  },

  // Message rows
  row:    { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  rowOwn: { flexDirection: 'row-reverse' },

  avatarSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarSmallText: { color: '#FFF', fontSize: 12, fontFamily: 'Outfit_700Bold' },

  bubbleWrapper: { maxWidth: '75%' },
  senderName: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: '#6B7280', marginBottom: 3, marginLeft: 12 },

  bubble:        { padding: 12, borderRadius: 16, marginBottom: 2 },
  bubbleOwn:     { backgroundColor: '#6D28D9', borderBottomRightRadius: 4 },
  bubbleOther:   { backgroundColor: '#FFF', borderBottomLeftRadius: 4,
                   shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  bubbleDeleted: { backgroundColor: '#F3F4F6', paddingVertical: 8 },

  msgText:    { fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827', lineHeight: 20 },
  msgTextOwn: { color: '#FFF' },
  deletedText:{ fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#9CA3AF', fontStyle: 'italic' },

  time:    { fontSize: 10, fontFamily: 'Outfit_400Regular', color: '#9CA3AF', marginTop: 6, alignSelf: 'flex-end' },
  timeOwn: { color: '#C4B5FD' },

  attachImage: { width: 200, height: 200, borderRadius: 10, marginTop: 6 },

  docRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
             backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: 8 },
  docName: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#374151' },

  linkedRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                  backgroundColor: 'rgba(109,40,217,0.1)', borderRadius: 8, padding: 8 },
  linkedRowOwn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  linkedText:   { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6D28D9' },

  deleteTap: { alignSelf: 'flex-end', padding: 4, marginTop: 2 },

  // Pending bar
  pendingBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    padding: 10, backgroundColor: '#FFF',
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  pendingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3E8FF', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180,
  },
  pendingThumb: { width: 24, height: 24, borderRadius: 4 },
  pendingName:  { flex: 1, fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#6D28D9' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 10,
    backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6',
    gap: 6,
  },
  iconBtn: { padding: 8 },
  input: {
    flex: 1, backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827',
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6D28D9', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
});