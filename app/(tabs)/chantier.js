// Onglet Chantier : pilotage du projet (lots, réunions de chantier, planning).
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import LotsView from '../../components/chantier/LotsView';
import PlanningView from '../../components/chantier/PlanningView';
import ReunionsView from '../../components/chantier/ReunionsView';
import { Segmented } from '../../components/chantier/ui';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { C, F } from '../../constants/theme';
import {
  createMeeting,
  fetchEntreprises,
  fetchLotStats,
  fetchLots,
  fetchMeetings,
  fetchPlanning,
  fetchProjectPoints,
  updatePlanningTask,
} from '../../lib/chantier';
import { isOnline } from '../../lib/offline';
import { isReadOnlyRole } from '../../lib/projectLists';
import { loggedInUserAtom, selectedProjectAtom } from '../../store/atoms';

const VIEWS = [
  { value: 'lots', label: 'Lots' },
  { value: 'reunions', label: 'Réunions' },
  { value: 'planning', label: 'Planning' },
];

export default function ChantierScreen() {
  const project = useAtomValue(selectedProjectAtom);
  const user = useAtomValue(loggedInUserAtom);
  const router = useRouter();
  const isFocused = useIsFocused();
  const canEdit = Boolean(user) && !isReadOnlyRole(user.role);

  const [view, setView] = useState('lots');
  const scroller = useRef(null);
  const changeView = (v) => {
    setView(v);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!project?.id) return;
    const orgId = project.organization_id ?? user?.organization_id;
    const [lotsRes, stats, meetingsRes, points, entreprises, planningRes] = await Promise.all([
      fetchLots(project.id),
      fetchLotStats(project.id).catch(() => ({})),
      fetchMeetings(project.id),
      fetchProjectPoints(project.id).catch(() => []),
      fetchEntreprises(orgId).catch(() => []),
      fetchPlanning(project.id),
    ]);
    setData({
      projectId: project.id,
      lots: lotsRes.lots,
      stats,
      meetings: meetingsRes.meetings,
      points,
      entreprises,
      tasks: planningRes.tasks,
      // Table absente (migration non appliquée) : on le dit plutôt que d'afficher un planning vide.
      planningUnavailable: Boolean(planningRes.error && !planningRes.error.offline && /planning_tasks|schema cache|does not exist/i.test(planningRes.error.message ?? '')),
      cachedAt: lotsRes.cachedAt,
    });
  }, [project?.id, project?.organization_id, user?.organization_id]);

  // Rechargé à chaque retour sur l'onglet (une réunion a pu être diffusée entre-temps).
  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const newMeeting = async () => {
    if (!isOnline()) return Alert.alert('Hors ligne', 'Une connexion est nécessaire pour créer une réunion.');
    setCreating(true);
    try {
      const id = await createMeeting(project.id);
      router.push({ pathname: '/chantier/reunion', params: { id } });
      load();
    } catch (err) {
      console.error('[chantier] création de réunion', err);
      Alert.alert('Réunion', "Impossible de créer la réunion.");
    } finally {
      setCreating(false);
    }
  };

  const setTaskProgress = async (task, avancement) => {
    if (!isOnline()) {
      Alert.alert('Hors ligne', 'Une connexion est nécessaire pour mettre à jour le planning.');
      return false;
    }
    try {
      await updatePlanningTask(task.id, { avancement });
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, avancement } : t)) }));
    } catch (err) {
      console.error('[chantier] avancement de tâche', err);
      Alert.alert('Planning', "L'avancement n'a pas pu être enregistré.");
      return false;
    }
  };

  const ready = data && data.projectId === project?.id;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Chantier" subtitle={project?.name} />
      <View style={styles.segWrap}>
        <Segmented value={view} options={VIEWS} onChange={changeView} />
      </View>
      {!project ? (
        <Text style={styles.hint}>Sélectionnez un projet depuis l&apos;accueil.</Text>
      ) : !ready ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.mine} />
      ) : (
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.mine} />}
        >
          {view === 'lots' && <LotsView lots={data.lots} stats={data.stats} />}
          {view === 'reunions' && (
            <ReunionsView
              meetings={data.meetings}
              points={data.points}
              lots={data.lots}
              entreprises={data.entreprises}
              canEdit={canEdit}
              creating={creating}
              onCreate={newMeeting}
            />
          )}
          {view === 'planning' && (
            <PlanningView
              lots={data.lots}
              tasks={data.tasks}
              unavailable={data.planningUnavailable}
              canEdit={canEdit}
              onTaskProgress={setTaskProgress}
            />
          )}
          {data.cachedAt ? (
            <Text style={styles.cached}>Hors ligne : données du {new Date(data.cachedAt).toLocaleString('fr-FR')}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.papier },
  segWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { fontFamily: F.regular, fontSize: 14, color: C.mineClair, textAlign: 'center', marginTop: 40 },
  cached: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, textAlign: 'center', marginTop: 16 },
});
