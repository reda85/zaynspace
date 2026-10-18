import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import { useAtom, useAtomValue } from 'jotai';
import { CameraIcon, ChevronDown, Clock, MapPin, MapPinnedIcon, MessageSquare, Pencil } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { cachedSelect, isOnline, syncTickAtom, withPendingPins } from '../../lib/offline';
import { onNetworkChange } from '../../lib/offline/network';
import { prefetchForOffline } from '../../lib/offline/prefetch';
import { categoriesAtom, loggedInUserAtom, membersAtom, pinsAtom, plansAtom, selectedOrganizationAtom, selectedProjectAtom, statusesAtom } from '../../store/atoms';
import { C, F } from '../../constants/theme';

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
        { width, height, borderRadius, backgroundColor: '#E4E4E0', opacity: anim },
        style,
      ]}
    />
  );
}

function CardsSkeleton() {
  return (
    <View style={styles.kpiGrid}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[styles.kpiCell, i % 2 === 0 && styles.kpiCellLeft, i < 2 && styles.kpiCellTop]}>
          <SkeletonBox width={80} height={11} borderRadius={4} style={{ marginBottom: 8 }} />
          <SkeletonBox width={44} height={24} borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox width={70} height={10} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

const DAY = 24 * 60 * 60 * 1000;

// Indicateurs de l'accueil, calculés sur les pins déjà chargés. Un pin est
// « levé » quand il a le dernier statut du projet (même règle que le web).
function computeOverview(pins, statuses) {
  const now = Date.now();
  const lastOrder = statuses?.length ? Math.max(...statuses.map((s) => s.order ?? 0)) : null;
  const isClosed = (p) => lastOrder != null && p.Status?.order === lastOrder;
  let total = 0, open = 0, overdue = 0, closed30 = 0;
  const late = [];
  for (const p of pins ?? []) {
    if (p.isArchived || p.deleted_at) continue;
    total++;
    if (isClosed(p)) {
      if (p.updated_at && now - Date.parse(p.updated_at) <= 30 * DAY) closed30++;
      continue;
    }
    open++;
    if (p.due_date && Date.parse(p.due_date) < now) {
      overdue++;
      late.push(p);
    }
  }
  late.sort((a, b) => Date.parse(a.due_date) - Date.parse(b.due_date));
  return { total, open, overdue, closed30, priorities: late.slice(0, 3) };
}

function daysLate(due) {
  const d = Math.max(1, Math.floor((Date.now() - Date.parse(due)) / DAY));
  return `${d} j de retard`;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
  const syncTick = useAtomValue(syncTickAtom);
  // La liste de pins est partagée avec l'écran du plan, qui y met les pins du
  // plan ouvert. L'accueil ne la remplace donc que lorsqu'il est affiché (ou au
  // changement de projet), et la recharge quand on y revient.
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const wasFocusedRef = useRef(isFocused);
  const [focusTick, setFocusTick] = useState(0);
  const lastLoadRef = useRef({ key: null, syncTick: null });
  useEffect(() => {
    if (isFocused && !wasFocusedRef.current) setFocusTick((n) => n + 1);
    wasFocusedRef.current = isFocused;
  }, [isFocused]);

  const [loadingData, setLoadingData] = useState(false);
  const selectedOrg = useAtomValue(selectedOrganizationAtom);
  const [photos7, setPhotos7] = useState(null);
  const overview = useMemo(() => computeOverview(pins, statuses), [pins, statuses]);

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

  // Prépare le mode hors ligne : copies locales des organisations, des projets
  // et des données de chaque projet, pour pouvoir en changer sans réseau.
  useEffect(() => {
    if (!user?.id) return;
    prefetchForOffline(user);
    return onNetworkChange((online) => { if (online) prefetchForOffline(user); });
  }, [user?.id]);

  const selectedProjectRef = useRef(selectedProject);
  selectedProjectRef.current = selectedProject;

  useEffect(() => {
    if (!user?.id || !user?.organization_id) return;

    const fetchProjectsAndInit = async () => {
      // AFTER
const { data: memberProjects, error } = await cachedSelect(`home-projects-${user.id}`, () => supabase
  .from('members_projects')
  .select('projects(*)')
  .eq('member_id', user.id));

// Seulement les projets de l'organisation active. Un projet déjà choisi dans
// cette organisation (par exemple par le sélecteur, qui vient de changer
// d'organisation) est gardé : sans cela, cet écran remettait l'ancien projet.
const data = memberProjects
  ?.map(mp => mp.projects)
  .filter((p) => p && p.organization_id === user.organization_id)
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (error || !data || data.length === 0) return;
      const current = selectedProjectRef.current;
      if (current && data.some((p) => p.id === current.id)) return;

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
    setPhotos7(null);
    setLoadingData(true);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject?.id || !user?.id) return;

    let cancelled = false;
    // `force` : changement de projet, la liste doit être remplacée quoi qu'il arrive.
    const loadHomePins = async (pid, force) => {
      const guest = user.role === 'guest';
      const { data: pinsData, error: pinsError, cachedAt } = await cachedSelect(`pins-home-${pid}${guest ? `-${user.id}` : ''}`, () => {
        let query = supabase
          .from('pdf_pins').select('*,Status(*),categories(*),projects(*),pin_tags(tag_id, tags(*))')
          .is('deleted_at', null)
          .eq('project_id', pid);
        if (guest) query = query.eq('assigned_to', user.id);
        return query;
      });
      // L'utilisateur a pu ouvrir un plan pendant la lecture : sa liste prime.
      if (cancelled || (!force && !isFocusedRef.current)) return;
      if (pinsData || pinsError?.offline) {
        setPins(withPendingPins(pinsData ?? [], guest ? { projectId: pid, assignedTo: user.id } : { projectId: pid }, cachedAt));
      }
    };

    const fetchAllData = async () => {
      try {
        const pid = selectedProject.id;
        const loadKey = `${pid}|${user.id}|${user.role}|${user.organization_id}`;
        const projectChanged = lastLoadRef.current.key !== loadKey;
        // Simple retour sur l'écran : seuls les pins sont relus.
        const pinsOnly = !projectChanged && lastLoadRef.current.syncTick === syncTick;
        const mayReplacePins = projectChanged || isFocusedRef.current;
        lastLoadRef.current = { key: loadKey, syncTick };
        if (pinsOnly) {
          if (mayReplacePins) await loadHomePins(pid, false);
          return;
        }
        const { data: plansData } = await cachedSelect(`plans-${pid}`, () => supabase
          .from('plans').select('*').is('deleted_at', null).eq('status', 'ready')
          .eq('project_id', selectedProject.id));
        if (plansData) setPlans(plansData);

        if (mayReplacePins) await loadHomePins(pid, projectChanged);

        const { data: eventsData } = await cachedSelect(`events-${pid}`, () => supabase
          .from('events').select('*,pdf_pins(*),members(*)')
          .eq('project_id', selectedProject.id)
          .order('created_at', { ascending: false }).limit(10));
        if (eventsData) setEvents(eventsData);

        // Photos des 7 derniers jours : seulement en ligne, l'indicateur
        // affiche un tiret sinon.
        if (isOnline()) {
          const { count, error: phErr } = await supabase
            .from('pins_photos')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', pid)
            .gte('created_at', new Date(Date.now() - 7 * DAY).toISOString());
          if (!cancelled) setPhotos7(phErr ? null : count ?? 0);
        } else if (!cancelled) {
          setPhotos7(null);
        }

        const { data: statusData } = await cachedSelect(`statuses-${pid}`, () => supabase
          .from('Status').select('*').eq('project_id', selectedProject.id).order('order'));
        if (statusData) setStatuses(statusData);

        const { data: catData } = await cachedSelect(`categories-${pid}`, () => supabase
          .from('categories').select('*').eq('project_id', selectedProject.id).order('order'));
        if (catData) setCategories(catData);

        const { data: membersProjectsData } = await cachedSelect(`members-${pid}`, () => supabase
          .from('members_projects')
          .select(`*, projects(*), members(*)`)
          .eq('project_id', selectedProject.id));

        const memberIds = membersProjectsData?.map(mp => mp.members.id) ?? [];

        const { data: rolesData } = await cachedSelect(`roles-${user.organization_id}-${pid}`, () => supabase
          .from('members_organizations')
          .select('member_id, role')
          .eq('organization_id', user.organization_id)
          .in('member_id', memberIds));

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
    return () => { cancelled = true; };
  }, [selectedProject?.id, user, syncTick, focusTick]);

  const categoryOptions = [
    { label: 'Tous', value: 'all', color: '#1C1C1A' },
    { label: 'Créations', value: 'creation', color: '#2C4F91' },
    { label: 'Photos', value: 'photo_upload', color: '#2F6B4A' },
    { label: 'Mises à jour', value: 'modification', color: '#B77400' },
  ];

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16, fontFamily: 'Geist_500Medium', color: '#5B5B56' }}>
            Chargement...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredEvents = selectedCategory === 'all' ? events : events.filter(e => e.category === selectedCategory);
  const pctClosed = overview.total ? Math.round((overview.closed30 / overview.total) * 100) : 0;

  const renderEvent = (item) => {
    let icon, bgColor;
    switch (item.category) {
      case 'creation':
        icon = <MapPin size={10} color="#FFFFFF" />;
        bgColor = C.tirage;
        break;
      case 'photo_upload':
        icon = <CameraIcon size={10} color="#FFFFFF" />;
        bgColor = C.valide;
        break;
      case 'modification':
        icon = <Pencil size={10} color="#FFFFFF" />;
        bgColor = '#B77400';
        break;
      default:
        icon = <Clock size={10} color="#FFFFFF" />;
        bgColor = '#B77400';
        break;
    }
    return (
      <View key={item.id} style={styles.eventItem}>
        <View style={styles.eventAvatarWrapper}>
          <View style={styles.eventAvatar}>
            <Text style={styles.eventAvatarText}>
              {getUserInitials(item.members?.name ? item.members?.name : item.username)}
            </Text>
          </View>
          <View style={[styles.eventBadge, { backgroundColor: bgColor }]}>
            {icon}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventTitle}>
            <Text style={styles.eventMember}>{item.members?.name}</Text>{' '}
            {categorymap(item.category)}{' '}
            <Text style={styles.eventPinNumber}>#{item.pdf_pins?.pin_number}</Text>{' '}
            <Text style={styles.eventPinName}>{item.pdf_pins?.name || 'Sans nom'}</Text>
          </Text>
          <Text style={styles.eventTime}>
            {new Date(item.created_at).toLocaleString('fr-FR', {
              hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Organisation / projet : un appui ouvre le sélecteur de projet */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.push('/select-project')}
            style={styles.projectButton}
            accessibilityRole="button"
            accessibilityLabel="Changer de projet"
          >
            <View style={styles.projectTile}>
              <Text style={styles.projectTileText}>{initials(selectedProject?.name)}</Text>
            </View>
            <View style={styles.projectTexts}>
              {selectedOrg?.name ? (
                <Text style={styles.orgName} numberOfLines={1}>{selectedOrg.name}</Text>
              ) : null}
              <View style={styles.projectRow}>
                <Text style={styles.projectName} numberOfLines={1} ellipsizeMode="tail">
                  {selectedProject?.name || 'Aucun projet'}
                </Text>
                <ChevronDown size={16} color={C.mineClair} strokeWidth={2} />
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/discussions')}
              style={styles.messageButton}
              accessibilityLabel="Discussions"
            >
              <MessageSquare size={20} color={C.encre} strokeWidth={1.8} />
              {hasUnread && <View style={styles.unreadDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.avatar}
              accessibilityLabel="Paramètres du compte"
            >
              <Text style={styles.avatarText}>{getUserInitials(user?.name)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Indicateurs */}
        {loadingData ? <CardsSkeleton /> : (
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCell, styles.kpiCellLeft, styles.kpiCellTop]}>
              <Text style={styles.kpiLabel}>Pins ouverts</Text>
              <Text style={styles.kpiValue}>{overview.open}</Text>
              <Text style={styles.kpiHint}>sur {overview.total} au total</Text>
            </View>
            <View style={[styles.kpiCell, styles.kpiCellTop]}>
              <Text style={styles.kpiLabel}>En retard</Text>
              <Text style={[styles.kpiValue, overview.overdue > 0 && { color: C.alerte }]}>{overview.overdue}</Text>
              <Text style={styles.kpiHint}>échéance dépassée</Text>
            </View>
            <View style={[styles.kpiCell, styles.kpiCellLeft]}>
              <Text style={styles.kpiLabel}>Levés en 30 jours</Text>
              <Text style={styles.kpiValue}>{overview.closed30}</Text>
              <View style={styles.kpiTrack}>
                <View style={[styles.kpiFill, { width: `${pctClosed}%` }]} />
              </View>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>Photos cette semaine</Text>
              <Text style={styles.kpiValue}>{photos7 ?? '–'}</Text>
              <Text style={styles.kpiHint}>7 derniers jours</Text>
            </View>
          </View>
        )}

        {/* Plans / Pins */}
        <View style={styles.cardsRow}>
          <TouchableOpacity style={styles.statsCard} onPress={() => router.push('/plans')} activeOpacity={0.7}>
            <View style={styles.statsIcon}>
              <MapPinnedIcon size={17} color={C.encre} strokeWidth={1.8} />
            </View>
            <Text style={styles.statsLabel}>Plans</Text>
            <Text style={styles.statsValue}>{plans?.length || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statsCard} onPress={() => router.push('/taches')} activeOpacity={0.7}>
            <View style={styles.statsIcon}>
              <MapPin size={17} color={C.encre} strokeWidth={1.8} />
            </View>
            <Text style={styles.statsLabel}>Pins</Text>
            <Text style={styles.statsValue}>{pins?.length || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* À traiter en priorité : pins ouverts dont l'échéance est la plus dépassée */}
        {!loadingData && overview.priorities.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>À traiter en priorité</Text>
              <TouchableOpacity onPress={() => router.push('/taches')} hitSlop={8}>
                <Text style={styles.sectionLink}>Tout voir</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.listCard}>
              {overview.priorities.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.prioRow, i < overview.priorities.length - 1 && styles.rowDivider]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('PinMetadataScreen', { pinId: p.id, from: 'Tasks', photoUris: JSON.stringify([]) })}
                >
                  <View style={[styles.prioNumber, { backgroundColor: p.Status?.color || C.mineClair }]}>
                    <Text style={styles.prioNumberText}>{p.pin_number}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.prioTitle} numberOfLines={1}>{p.name || 'Sans nom'}</Text>
                    <Text style={styles.prioMeta} numberOfLines={1}>
                      {[p.categories?.name, p.pdf_name || 'Non localisée'].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <View style={styles.lateBadge}>
                    <Text style={styles.lateBadgeText}>{daysLate(p.due_date)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Derniers événements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Derniers événements</Text>
            {!loadingData && (
              <TouchableOpacity style={styles.filterButton} onPress={openSheet}>
                <Text style={styles.filterText}>
                  {categoryOptions.find(c => c.value === selectedCategory)?.label || 'Filtrer'}
                </Text>
                <ChevronDown size={14} color={C.mine} strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </View>
          {loadingData ? <EventsSkeleton /> : (
            <View style={styles.listCard}>
              {filteredEvents.length === 0
                ? <Text style={styles.noEvents}>Aucun événement récent</Text>
                : filteredEvents.map(renderEvent)}
            </View>
          )}
        </View>
      </ScrollView>

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
                <Text style={[styles.sheetItemText, isSelected && { color: cat.color, fontFamily: 'Geist_700Bold' }]}>
                  {cat.label}
                </Text>
                {isSelected && (
                  <View style={[styles.sheetCheckmark, { backgroundColor: cat.color }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Geist_700Bold' }}>✓</Text>
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
  container: { flex: 1, backgroundColor: C.papier },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 14 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  projectButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectTile: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: C.encre,
    alignItems: 'center', justifyContent: 'center',
  },
  projectTileText: { color: C.blanc, fontFamily: F.semibold, fontSize: 14 },
  projectTexts: { flex: 1, minWidth: 0 },
  orgName: { fontFamily: F.regular, fontSize: 12, color: C.mineClair },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  projectName: { flexShrink: 1, fontFamily: F.semibold, fontSize: 17, letterSpacing: -0.2, color: C.encre },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  messageButton: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: C.blanc,
    borderWidth: 1, borderColor: C.filet, alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.encre, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.blanc, fontFamily: F.semibold, fontSize: 14 },
  unreadDot: {
    position: 'absolute', top: 9, right: 9,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: C.alerte, borderWidth: 2, borderColor: C.blanc,
  },

  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.blanc,
    borderRadius: 14, borderWidth: 1, borderColor: C.filet, overflow: 'hidden',
  },
  kpiCell: { width: '50%', paddingVertical: 12, paddingHorizontal: 16 },
  kpiCellLeft: { borderRightWidth: 1, borderRightColor: C.filet },
  kpiCellTop: { borderBottomWidth: 1, borderBottomColor: C.filet },
  kpiLabel: { fontFamily: F.regular, fontSize: 12, color: C.mine },
  kpiValue: { fontFamily: F.semibold, fontSize: 26, letterSpacing: -0.5, color: C.encre, marginTop: 2, fontVariant: ['tabular-nums'] },
  kpiHint: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 2 },
  kpiTrack: { height: 4, borderRadius: 2, backgroundColor: C.voile, overflow: 'hidden', marginTop: 8 },
  kpiFill: { height: 4, backgroundColor: C.tirage },

  cardsRow: { flexDirection: 'row', gap: 10 },
  statsCard: {
    flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12,
    backgroundColor: C.blanc, borderRadius: 14, borderWidth: 1, borderColor: C.filet,
  },
  statsIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center',
  },
  statsLabel: { flex: 1, fontFamily: F.regular, fontSize: 14, color: C.mine },
  statsValue: { fontFamily: F.semibold, fontSize: 17, color: C.encre, fontVariant: ['tabular-nums'] },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: F.semibold, fontSize: 16, color: C.encre },
  sectionLink: { fontFamily: F.medium, fontSize: 13, color: C.tirage },
  listCard: {
    backgroundColor: C.blanc, borderRadius: 14, borderWidth: 1, borderColor: C.filet, overflow: 'hidden',
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.voile },

  prioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, minHeight: 52 },
  prioNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  prioNumberText: { color: C.blanc, fontFamily: F.semibold, fontSize: 11 },
  prioTitle: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  prioMeta: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 1 },
  lateBadge: { backgroundColor: C.alertePale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  lateBadgeText: { fontFamily: F.semibold, fontSize: 12, color: C.alerte },

  filterButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingLeft: 12, paddingRight: 10,
    borderRadius: 16, borderWidth: 1, borderColor: C.filetFort, backgroundColor: C.blanc,
  },
  filterText: { fontFamily: F.medium, fontSize: 13, color: C.encre },

  timelineCard: {
    backgroundColor: C.blanc, borderRadius: 14, borderWidth: 1, borderColor: C.filet, overflow: 'hidden',
  },
  eventItem: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: C.voile,
  },
  eventAvatarWrapper: { width: 36, height: 36, position: 'relative' },
  eventAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center',
  },
  eventAvatarText: { color: C.encre, fontFamily: F.semibold, fontSize: 12 },
  eventBadge: {
    position: 'absolute', bottom: -3, right: -3,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.blanc,
  },
  eventTitle: { fontFamily: F.regular, fontSize: 14, color: C.mine, lineHeight: 20 },
  eventMember: { fontFamily: F.semibold, color: C.encre },
  eventPinNumber: { fontFamily: F.mono, fontSize: 12, color: C.encre },
  eventPinName: { color: C.encre },
  eventTime: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 3 },
  noEvents: { textAlign: 'center', fontFamily: F.regular, color: C.mineClair, paddingVertical: 20 },
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
    backgroundColor: '#E4E4E0', alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Geist_700Bold', fontSize: 15, color: '#1C1C1A', marginBottom: 12,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  sheetItemSelected: {
    backgroundColor: '#F8F8F6',
    marginHorizontal: -20, paddingHorizontal: 20,
  },
  sheetDot: { width: 10, height: 10, borderRadius: 5 },
  sheetItemText: {
    flex: 1, fontFamily: 'Geist_500Medium', fontSize: 15, color: '#33332F',
  },
  sheetCheckmark: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});