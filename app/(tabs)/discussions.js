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
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import CreateGroupModal from '../../components/discussions/CreateGroupModal';
import { supabase } from '../../lib/supabase';
import { fetchGroups, getUnreadCount } from '../../services/discussionsService';
import { loggedInUserAtom, selectedProjectAtom } from '../../store/atoms';
import { discussionGroupsAtom, discussionLastMsgAtom, discussionUnreadAtom } from '../../store/discussionsAtoms';
import { HeaderButton, ScreenHeader } from '../../components/ui/ScreenHeader';
import { C } from '../../constants/theme';


function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: '#E4E4E0', opacity: anim },
        style,
      ]}
    />
  );
}

function GroupCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBox width={46} height={46} borderRadius={23} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="50%" height={15} borderRadius={4} />
        <SkeletonBox width="70%" height={12} borderRadius={4} />
        <SkeletonBox width="35%" height={11} borderRadius={4} />
      </View>
    </View>
  );
}

function DiscussionsSkeleton() {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8 }}>
      {[0, 1, 2, 3, 4].map(i => <GroupCardSkeleton key={i} />)}
    </View>
  );
}
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
            <Text style={[styles.cardSub, { color: '#8A8A84' }]}>Aucun message</Text>
          )}
          <View style={styles.memberRow}>
            <Users size={12} color="#8A8A84" />
            <Text style={styles.memberText}>{memberCount} membre{memberCount !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Unread badge */}
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}

        <Feather name="chevron-right" size={18} color="#D3D3CE" />
      </TouchableOpacity>
    );
  }, [unread, lastMessages, navigation]);

  const totalUnread = Object.values(unread).reduce((n, c) => n + (Number(c) || 0), 0);
  const headerSubtitle = loading
    ? ' '
    : `${groups.length} groupe${groups.length > 1 ? 's' : ''}` +
      (totalUnread ? `, ${totalUnread} message${totalUnread > 1 ? 's' : ''} non lu${totalUnread > 1 ? 's' : ''}` : '');

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Discussions"
        subtitle={headerSubtitle}
        left={navigation.canGoBack() ? (
          <HeaderButton label="Retour" onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={C.encre} />
          </HeaderButton>
        ) : null}
        right={
          <HeaderButton label="Nouveau groupe" dark onPress={() => setShowCreate(true)}>
            <MessageSquarePlus size={20} color={C.blanc} strokeWidth={1.9} />
          </HeaderButton>
        }
      />
      {loading ? (
        <DiscussionsSkeleton />
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <MessageSquare size={64} color="#D3D3CE" />
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
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 16, paddingHorizontal: 16 }}
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
  container: { flex: 1, backgroundColor: '#F8F8F6' },

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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: '#FFF', fontSize: 18, fontFamily: 'Geist_700Bold' },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 16, fontFamily: 'Geist_600SemiBold', color: '#1C1C1A', marginBottom: 2 },
  cardSub:   { fontSize: 13, fontFamily: 'Geist_400Regular', color: '#5B5B56', marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberText:{ fontSize: 12, fontFamily: 'Geist_400Regular', color: '#8A8A84' },
  badge: {
    backgroundColor: '#2C4F91',
    borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6, marginRight: 8,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontFamily: 'Geist_700Bold' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1C1C1A', marginTop: 16 },
  emptySub:   { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#5B5B56', marginTop: 6, textAlign: 'center' },
  emptyBtn:   { marginTop: 24, backgroundColor: 'black', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  emptyBtnText:{ color: '#FFF', fontFamily: 'Geist_600SemiBold', fontSize: 15 },
});