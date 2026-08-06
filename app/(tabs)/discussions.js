// app/(tabs)/discussions.js
// Add a new tab entry:  <Tabs.Screen name="discussions" options={{ title: 'Discussions', ... }} />
// in your app/(tabs)/_layout.js

import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { MessageSquare, MessageSquarePlus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import CreateGroupModal from '../../components/discussions/CreateGroupModal';
import { supabase } from '../../lib/supabase';
import { fetchGroups, getUnreadCount } from '../../services/discussionsService';
import { loggedInUserAtom, selectedProjectAtom } from '../../store/atoms';
import { discussionGroupsAtom, discussionLastMsgAtom, discussionUnreadAtom } from '../../store/discussionsAtoms';

export default function DiscussionsScreen() {
  const navigation   = useNavigation();
  const isFocused    = useIsFocused();
  const [project]    = useAtom(selectedProjectAtom);
  const [user]       = useAtom(loggedInUserAtom);
  const [groups, setGroups]   = useAtom(discussionGroupsAtom);
  const [unread, setUnread]   = useAtom(discussionUnreadAtom);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [lastMessages, setLastMessages] = useAtom(discussionLastMsgAtom);
  const channelsRef = useRef([]);

  const refreshUnread = useCallback(async (groupList) => {
    const counts = {};
    await Promise.all((groupList ?? []).map(async g => {
      counts[g.id] = await getUnreadCount(g.id);
    }));
    setUnread(counts);
  }, []);

  const load = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const data = await fetchGroups(project.id);
      setGroups(data);
      // Init last messages from fetched data
      const msgs = {};
      data.forEach(g => {
        const arr = g.discussions_messages ?? [];
        if (arr.length > 0) msgs[g.id] = arr[arr.length - 1];
      });
      setLastMessages(msgs);
      await refreshUnread(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [project?.id, refreshUnread]);

  // Subscribe to new messages for ALL groups so badge updates in real time
  const subscribeToAllGroups = useCallback((groupList) => {
    // Unsubscribe old channels first
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    groupList.forEach(group => {
      const ch = supabase
        .channel(`unread:${group.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'discussions_messages',
            filter: `group_id=eq.${group.id}`,
          },
          (payload) => {
            const myAuthId = user?.auth_id ?? user?.id;
            setLastMessages(prev => ({
              ...prev,
              [group.id]: { content: payload.new.content, created_at: payload.new.created_at },
            }));
            if (payload.new.user_id !== myAuthId) {
              setUnread(prev => ({
                ...prev,
                [group.id]: (prev[group.id] ?? 0) + 1,
              }));
            }
          }
        )
        .subscribe();
      channelsRef.current.push(ch);
    });
  }, [user]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  // Subscribe whenever groups change
  useEffect(() => {
    if (groups.length > 0) subscribeToAllGroups(groups);
    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [groups.length, subscribeToAllGroups]);

  // ── Header ────────────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: 'Discussions',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: 'black' },
      headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <View style={styles.headerBtnWhite}>
            <Feather name="arrow-left" size={20} color="#000" />
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowCreate(true)} style={{ marginRight: 16 }}>
          <View style={styles.headerBtn}>
            <MessageSquarePlus size={20} color="#FFF" />
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onGroupCreated = useCallback((newGroup) => {
    setGroups(prev => [newGroup, ...prev]);
    setShowCreate(false);
  }, []);

  // ── Item renderer ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    const count = unread[item.id] ?? 0;
    const lastMsg = lastMessages[item.id] ?? item.discussions_messages?.[item.discussions_messages.length - 1];
    const memberCount = item.discussions_members?.length ?? 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('discussions/chat', { groupId: item.id, groupName: item.name })
        }
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor(item.id) }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          {lastMsg ? (
            <Text style={styles.cardSub} numberOfLines={1}>
              {lastMsg.content ?? 'Pièce jointe'}
            </Text>
          ) : (
            <Text style={[styles.cardSub, { color: '#9CA3AF' }]}>Aucun message</Text>
          )}
          <View style={styles.memberRow}>
            <Users size={12} color="#9CA3AF" />
            <Text style={styles.memberText}>{memberCount} membre{memberCount !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Unread badge */}
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}

        <Feather name="chevron-right" size={18} color="#D1D5DB" />
      </TouchableOpacity>
    );
  }, [unread, lastMessages, navigation]);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#6D28D9" style={{ marginTop: 40 }} />
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <MessageSquare size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Aucune discussion</Text>
          <Text style={styles.emptySub}>Créez un groupe pour commencer</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.emptyBtnText}>Créer un groupe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          extraData={{ unread, lastMessages }}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={load}
          refreshing={loading}
        />
      )}

      <CreateGroupModal
        visible={showCreate}
        projectId={project?.id}
        onClose={() => setShowCreate(false)}
        onCreated={onGroupCreated}
      />
    </View>
  );
}

// consistent color per group id
const COLORS = ['#7C3AED','#DB2777','#0891B2','#059669','#D97706','#DC2626','#4F46E5'];
const avatarColor = (id) => COLORS[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  headerBtn: {
    backgroundColor: 'black',
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
  },
  headerBtnWhite: {
    backgroundColor: '#FFF',
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
  },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: '#FFF', fontSize: 18, fontFamily: 'Outfit_700Bold' },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#111827', marginBottom: 2 },
  cardSub:   { fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberText:{ fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#9CA3AF' },
  badge: {
    backgroundColor: '#6D28D9',
    borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6, marginRight: 8,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontFamily: 'Outfit_700Bold' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: '#111827', marginTop: 16 },
  emptySub:   { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 6, textAlign: 'center' },
  emptyBtn:   { marginTop: 24, backgroundColor: '#6D28D9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  emptyBtnText:{ color: '#FFF', fontFamily: 'Outfit_600SemiBold', fontSize: 15 },
});