// Notifications : assignations, suivi de mes éléments, échéances, réunions,
// documents et rapports. Toucher une notification ouvre l'élément concerné.
import { useIsFocused } from '@react-navigation/native';
import { useSetAtom } from 'jotai';
import {
  AlarmClock, AlertTriangle, Bell, Camera, CheckCheck, CircleDot, FileBarChart2,
  FileText, MessageSquare, UserPlus, Users,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { DetailHeader, Empty, Segmented } from '../components/chantier/ui';
import { C, F } from '../constants/theme';
import {
  fetchNotifications, markAllNotificationsRead, markNotificationsRead, openNotificationTarget,
  refreshUnreadCount, relativeTime, unreadNotificationsAtom,
} from '../lib/notifications';
import { isOnline } from '../lib/offline';

const ICONS = {
  assigned: [UserPlus, C.tirage, C.tiragePale],
  status: [CircleDot, C.mine, C.voile],
  comment: [MessageSquare, C.mine, C.voile],
  photo: [Camera, C.mine, C.voile],
  due_soon: [AlarmClock, C.tirage, C.tiragePale],
  overdue: [AlertTriangle, C.alerte, C.alertePale],
  meeting: [Users, C.valide, C.validePale],
  document: [FileText, C.mine, C.voile],
  report: [FileBarChart2, C.mine, C.voile],
};

export default function NotificationsScreen() {
  const isFocused = useIsFocused();
  const setUnread = useSetAtom(unreadNotificationsAtom);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isOnline()) {
      setError('Une connexion est nécessaire pour afficher les notifications.');
      return;
    }
    try {
      setItems(await fetchNotifications());
      setError(null);
      refreshUnreadCount();
    } catch (err) {
      console.error('[notifications] chargement', err);
      setError('Impossible de charger les notifications.');
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const now = () => new Date().toISOString();

  const open = (n) => {
    if (!n.read_at) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: now() } : x)));
      setUnread((c) => Math.max(0, c - 1));
      markNotificationsRead([n.id]).catch(() => {});
    }
    openNotificationTarget(n);
  };

  const readAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at ?? now() })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } finally {
      refreshUnreadCount();
    }
  };

  const unread = (items ?? []).filter((n) => !n.read_at).length;
  const shown = (items ?? []).filter((n) => filter === 'all' || !n.read_at);

  return (
    <View style={styles.screen}>
      <DetailHeader
        title="Notifications"
        subtitle={items ? (unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu') : null}
        right={
          <Pressable
            onPress={readAll}
            disabled={!unread}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Tout marquer comme lu"
            style={({ pressed }) => [styles.readAll, (!unread || pressed) && { opacity: 0.4 }]}
          >
            <CheckCheck size={18} color={C.encre} />
          </Pressable>
        }
      />
      <View style={styles.segWrap}>
        <Segmented
          value={filter}
          options={[{ value: 'all', label: 'Toutes' }, { value: 'unread', label: unread ? `Non lues (${unread})` : 'Non lues' }]}
          onChange={setFilter}
        />
      </View>
      {error && !items ? (
        <Empty title="Notifications indisponibles" text={error} />
      ) : !items ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.mine} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.mine} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Bell size={28} color={C.filetFort} />
              <Text style={styles.emptyText}>{filter === 'unread' ? 'Tout est lu.' : 'Aucune notification pour l’instant.'}</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item: n }) => {
            const [Icon, fg, bg] = ICONS[n.kind] ?? ICONS.status;
            return (
              <Pressable
                onPress={() => open(n)}
                style={({ pressed }) => [styles.row, !n.read_at && styles.rowUnread, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <View style={[styles.icon, { backgroundColor: bg }]}><Icon size={17} color={fg} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.title, !n.read_at && styles.titleUnread]} numberOfLines={2}>{n.title}</Text>
                  {n.body ? <Text style={styles.body} numberOfLines={3}>{n.body}</Text> : null}
                  <Text style={styles.time}>{relativeTime(n.created_at)}</Text>
                </View>
                {!n.read_at && <View style={styles.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.papier },
  segWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  readAll: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet },
  list: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  rowUnread: { backgroundColor: C.blanc },
  sep: { height: 4 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.regular, fontSize: 14.5, color: C.mine },
  titleUnread: { fontFamily: F.medium, color: C.encre },
  body: { fontFamily: F.regular, fontSize: 13, color: C.mineClair, marginTop: 2, lineHeight: 18 },
  time: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.tirage, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontFamily: F.regular, fontSize: 14, color: C.mineClair },
});
