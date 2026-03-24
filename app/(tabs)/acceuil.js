import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { CameraIcon, Clock, MapPin, MapPinnedIcon, MessageSquare, Pencil } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { categoriesAtom, loggedInUserAtom, membersAtom, pinsAtom, plansAtom, selectedProjectAtom, statusesAtom } from '../../store/atoms';

import { fetchGroups, getUnreadCount } from '../../services/discussionsService';
import { discussionUnreadAtom } from '../../store/discussionsAtoms';

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
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
        { width, height, borderRadius, backgroundColor: '#E5E7EB', opacity: anim },
        style,
      ]}
    />
  );
}

function CardsSkeleton() {
  return (
    <View style={styles.cardsRow}>
      {[0, 1].map(i => (
        <View key={i} style={[styles.statsCard, i === 0 ? styles.cardLeft : styles.cardRight]}>
          <SkeletonBox width={44} height={44} borderRadius={22} style={{ marginBottom: 10 }} />
          <SkeletonBox width={40} height={28} borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox width={50} height={12} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

function EventsSkeleton() {
  return (
    <View style={styles.timelineCard}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[styles.eventItem, { gap: 10 }]}>
          <SkeletonBox width={42} height={42} borderRadius={21} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="85%" height={13} borderRadius={4} />
            <SkeletonBox width="45%" height={11} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AcceuilScreen() {
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom);
  const [plans, setPlans] = useAtom(plansAtom);
  const [pins, setPins] = useAtom(pinsAtom);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useAtom(categoriesAtom);
  const [statuses, setStatuses] = useAtom(statusesAtom);
  const [members, setMembers] = useAtom(membersAtom);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [unread, setUnread] = useAtom(discussionUnreadAtom);
  const hasUnread = useMemo(() => Object.values(unread).some(n => n > 0), [unread]);
  const navigation = useNavigation();
  const router = useRouter();
  const [user] = useAtom(loggedInUserAtom);

  const [loadingData, setLoadingData] = useState(false);

  const openSheet = () => {
    setSheetVisible(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setSheetVisible(false);
    });
  };

  function getUserInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function categorymap(category) {
    switch (category) {
      case 'creation': return 'a créé un pin';
      case 'photo_upload': return 'a ajouté une photo';
      default: return 'a effectué une mise à jour';
    }
  }

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, []);

  useEffect(() => {
    if (!user?.id || !user?.organization_id) return;

    const fetchProjectsAndInit = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', user.organization_id)
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) return;

      try {
        const lastProjectId = await AsyncStorage.getItem('last_project_id');
        if (lastProjectId) {
          const savedProject = data.find((p) => String(p.id) === lastProjectId);
          setSelectedProject(savedProject ?? data[0]);
        } else {
          setSelectedProject(data[0]);
        }
      } catch (e) {
        await AsyncStorage.removeItem('last_project_id');
        setSelectedProject(data[0]);
      }
    };

    fetchProjectsAndInit();
  }, [user]);

  useEffect(() => {
    if (selectedProject?.id) {
      AsyncStorage.setItem('last_project_id', String(selectedProject.id)).catch(console.error);
    }
  }, [selectedProject]);

  useEffect(() => {
    setPins([]);
    setPlans([]);
    setEvents([]);
    setLoadingData(true);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject?.id || !user?.id) return;

    const fetchAllData = async () => {
      try {
        const { data: plansData } = await supabase
          .from('plans').select('*').is('deleted_at', null).eq('project_id', selectedProject.id);
        if (plansData) setPlans(plansData);

        if (user.role === 'guest') {
          const { data: pinsData } = await supabase
            .from('pdf_pins').select('*,Status(*),categories(*),projects(*),pin_tags(tag_id, tags(*))')
            .is('deleted_at', null)
            .eq('project_id', selectedProject.id).eq('assigned_to', user.id);
          if (pinsData) setPins(pinsData);
        } else {
          const { data: pinsData } = await supabase
            .from('pdf_pins').select('*,Status(*),categories(*),projects(*),pin_tags(tag_id, tags(*))')
            .is('deleted_at', null)
            .eq('project_id', selectedProject.id);
          if (pinsData) setPins(pinsData);
        }

        const { data: eventsData } = await supabase
          .from('events').select('*,pdf_pins(*),members(*)')
          .eq('project_id', selectedProject.id)
          .order('created_at', { ascending: false }).limit(10);
        if (eventsData) setEvents(eventsData);

        const { data: statusData } = await supabase
          .from('Status').select('*').eq('project_id', selectedProject.id).order('order');
        if (statusData) setStatuses(statusData);

        const { data: catData } = await supabase
          .from('categories').select('*').eq('project_id', selectedProject.id).order('order');
        if (catData) setCategories(catData);

        const { data: membersProjectsData } = await supabase
          .from('members_projects')
          .select(`*, projects(*), members(*)`)
          .eq('project_id', selectedProject.id);

        const memberIds = membersProjectsData?.map(mp => mp.members.id) ?? [];

        const { data: rolesData } = await supabase
          .from('members_organizations')
          .select('member_id, role')
          .eq('organization_id', user.organization_id)
          .in('member_id', memberIds);

        const rolesMap = Object.fromEntries(
          rolesData?.map(r => [r.member_id, r.role]) ?? []
        );

        const membersData = membersProjectsData?.map(mp => ({
          ...mp.members,
          role: rolesMap[mp.members.id] ?? null,
          members_projects: mp,
          projects: mp.projects,
        })) ?? [];

        if (membersData) {
          console.log("Members data:", membersData);
          setMembers(membersData);
        }

        try {
          const groups = await fetchGroups(selectedProject.id);
          const counts = {};
          await Promise.all(groups.map(async g => {
            counts[g.id] = await getUnreadCount(g.id);
          }));
          setUnread(counts);
        } catch (e) {
          // Silently ignore
        }
      } finally {
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, [selectedProject?.id, user]);

  const categoryOptions = [
    { label: 'Tous', value: 'all', color: '#1E293B' },
    { label: 'Créations', value: 'creation', color: '#3B82F6' },
    { label: 'Photos', value: 'photo_upload', color: '#10B981' },
    { label: 'Mises à jour', value: 'modification', color: '#F59E0B' },
  ];

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16, fontFamily: 'Outfit_500Medium', color: '#6B7280' }}>
            Chargement...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ✅ Header: left side shrinks, right side never wraps */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.projectName} numberOfLines={1} ellipsizeMode="tail">
            {selectedProject?.name || 'Aucun projet'}
          </Text>
          <TouchableOpacity onPress={() => router.push('/select-project')} style={styles.changeProjectButton}>
            <Text style={styles.changeProjectText}>Changer de projet</Text>
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/discussions')} style={styles.messageButton}>
            <MessageSquare size={22} color="#1E293B" />
            {hasUnread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.avatar}>
            <Text style={styles.avatarText}>{getUserInitials(user?.name)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Cards */}
      {loadingData ? <CardsSkeleton /> : (
        <View style={styles.cardsRow}>
          <View style={[styles.statsCard, styles.cardLeft]}>
            <View style={styles.statsIcon}>
              <MapPinnedIcon size={22} color="#111827" />
            </View>
            <Text style={styles.statsValue}>{plans?.length || 0}</Text>
            <Text style={styles.statsLabel}>PLANS</Text>
          </View>

          <View style={[styles.statsCard, styles.cardRight]}>
            <View style={styles.statsIcon}>
              <MapPin size={22} color="#111827" />
            </View>
            <Text style={styles.statsValue}>{pins?.length || 0}</Text>
            <Text style={styles.statsLabel}>PINS</Text>
          </View>
        </View>
      )}

      {/* Events Header */}
      <View style={styles.eventsHeader}>
        <Text style={styles.sectionTitle}>Derniers événements</Text>
        {!loadingData && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              { backgroundColor: categoryOptions.find(c => c.value === selectedCategory)?.color || '#6D28D9' },
            ]}
            onPress={openSheet}
          >
            <Text style={styles.filterText}>
              {categoryOptions.find(c => c.value === selectedCategory)?.label || 'Filtrer'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Events list */}
      {loadingData ? <EventsSkeleton /> : (
        <View style={styles.timelineCard}>
          <FlatList
            data={selectedCategory === 'all' ? events : events.filter(e => e.category === selectedCategory)}
            keyExtractor={item => item.id?.toString()}
            renderItem={({ item }) => {
              let icon, bgColor;
              switch (item.category) {
                case 'creation':
                  icon = <MapPin size={10} color="#FFFFFF" />;
                  bgColor = '#3B82F6';
                  break;
                case 'photo_upload':
                  icon = <CameraIcon size={10} color="#FFFFFF" />;
                  bgColor = '#10B981';
                  break;
                case 'modification':
                  icon = <Pencil size={10} color="#FFFFFF" />;
                  bgColor = '#F59E0B';
                  break;
                default:
                  icon = <Clock size={10} color="#FFFFFF" />;
                  bgColor = '#F59E0B';
                  break;
              }

              return (
                <View style={styles.eventItem}>
                  <View style={styles.eventAvatarWrapper}>
                    <View style={styles.eventAvatar}>
                      <Text style={styles.eventAvatarText}>
                        {getUserInitials(item.members?.name)}
                      </Text>
                    </View>
                    <View style={[styles.eventBadge, { backgroundColor: bgColor }]}>
                      {icon}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>
                      <Text style={styles.eventMember}>{item.members?.name}</Text>{' '}
                      {categorymap(item.category)} - #{item.pdf_pins?.pin_number} ({item.pdf_pins?.name || 'Sans nom'})
                    </Text>
                    <Text style={styles.eventTime}>
                      {new Date(item.created_at).toLocaleString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
                      })}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.noEvents}>Aucun événement récent</Text>}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Bottom Sheet Backdrop */}
      {sheetVisible && (
        <Animated.View style={[styles.sheetBackdrop, { opacity: sheetAnim }]}>
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>
      )}

      {/* Bottom Sheet */}
      {sheetVisible && (
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{
                translateY: sheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Filtrer les événements</Text>

          {categoryOptions.map(cat => {
            const isSelected = selectedCategory === cat.value;
            return (
              <Pressable
                key={cat.value}
                style={[styles.sheetItem, isSelected && styles.sheetItemSelected]}
                onPress={() => {
                  setSelectedCategory(cat.value);
                  closeSheet();
                }}
              >
                <View style={[styles.sheetDot, { backgroundColor: cat.color }]} />
                <Text style={[styles.sheetItemText, isSelected && { color: cat.color, fontFamily: 'Outfit_700Bold' }]}>
                  {cat.label}
                </Text>
                {isSelected && (
                  <View style={[styles.sheetCheckmark, { backgroundColor: cat.color }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Outfit_700Bold' }}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          <View style={{ height: 16 }} />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', paddingHorizontal: 16, paddingTop: 8 },

  // ✅ Header fix: left shrinks, right stays fixed
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,          // takes all remaining space
    minWidth: 0,      // allows text to shrink below its natural width
    marginRight: 12,  // keeps gap between text and icons
  },

  projectName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#1E293B',
    // numberOfLines + ellipsizeMode handled inline
  },
  changeProjectButton: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  changeProjectText: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: '#6B7280', marginRight: 4 },
  arrow: { fontSize: 14, color: '#6B7280' },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,   // ✅ never shrinks — icons always visible
  },

  messageButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: 'white', fontFamily: 'Outfit_700Bold', fontSize: 16 },
  cardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statsCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardLeft: { marginRight: 6 },
  cardRight: { marginLeft: 6 },
  statsIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statsValue: { fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#111827' },
  statsLabel: { marginTop: 2, fontFamily: 'Outfit_500Medium', fontSize: 12, letterSpacing: 1.2, color: '#6B7280' },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 8 },
  sectionTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: '#1E293B' },
  filterButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999 },
  filterText: { color: '#fff', fontFamily: 'Outfit_600SemiBold', fontSize: 12 },
  timelineCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  eventItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  eventAvatarWrapper: {
    width: 42, height: 42, marginRight: 10, position: 'relative',
  },
  eventAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#6B7280', alignItems: 'center', justifyContent: 'center',
  },
  eventAvatarText: {
    color: '#FFFFFF', fontFamily: 'Outfit_700Bold', fontSize: 18,
  },
  eventBadge: {
    position: 'absolute', top: -1, right: -3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#6B7280',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  eventTitle: { fontFamily: 'Outfit_500Medium', fontSize: 15, color: '#374151', lineHeight: 20 },
  eventMember: { fontFamily: 'Outfit_700Bold', color: '#1E293B' },
  eventTime: { fontFamily: 'Outfit_500Medium', fontSize: 13, color: '#6B7280', marginTop: 2 },
  noEvents: { textAlign: 'center', fontFamily: 'Outfit_500Medium', color: '#9CA3AF', marginTop: 20 },
  unreadDot: {
    position: 'absolute', top: 8, right: 8,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#6D28D9', borderWidth: 1.5, borderColor: '#F5F7FA',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
    zIndex: 10,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    zIndex: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 20,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Outfit_700Bold', fontSize: 15, color: '#1E293B', marginBottom: 12,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  sheetItemSelected: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: -20, paddingHorizontal: 20,
  },
  sheetDot: { width: 10, height: 10, borderRadius: 5 },
  sheetItemText: {
    flex: 1, fontFamily: 'Outfit_500Medium', fontSize: 15, color: '#374151',
  },
  sheetCheckmark: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});