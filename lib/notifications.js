// Notifications du membre connecté (table notifications, remplie par la base)
// et ouverture de l'élément concerné, comme sur le web.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { atom, getDefaultStore } from 'jotai';
import { selectedOrganizationAtom, selectedProjectAtom } from '../store/atoms';
import { supabase } from './supabase';

/** Incrémenté à chaque push reçu : les écrans rechargent le nombre de non lues. */
export const notificationsTickAtom = atom(0);
export const unreadNotificationsAtom = atom(0);

export async function fetchNotifications({ limit = 80 } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,kind,title,body,pin_id,project_id,target,created_at,read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchUnreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Recharge la pastille (sans erreur bloquante : table absente, hors ligne…). */
export async function refreshUnreadCount() {
  try {
    const count = await fetchUnreadCount();
    getDefaultStore().set(unreadNotificationsAtom, count);
    return count;
  } catch {
    return null;
  }
}

export async function markNotificationsRead(ids) {
  if (!ids?.length) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}

/** Sélectionne le projet de la notification s'il n'est pas déjà ouvert. */
async function ensureProject(projectId) {
  if (!projectId) return;
  const store = getDefaultStore();
  if (store.get(selectedProjectAtom)?.id === projectId) return;
  const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (!project) return;
  store.set(selectedProjectAtom, project);
  await AsyncStorage.setItem('last_project_id', String(project.id));
  const org = store.get(selectedOrganizationAtom);
  if (project.organization_id && org?.id !== project.organization_id) {
    const { data: organization } = await supabase.from('organizations').select('*').eq('id', project.organization_id).maybeSingle();
    if (organization) store.set(selectedOrganizationAtom, organization);
  }
}

/**
 * Ouvre l'élément d'une notification (ligne de la table ou données d'un push) :
 * élément → fiche, compte rendu → réunion, document → Documents, rapport → Chantier.
 */
export async function openNotificationTarget(n) {
  const pinId = n.pin_id ?? n.pinId;
  const projectId = n.project_id ?? n.projectId;
  const target = n.target ?? {};
  const meetingId = target.meetingId ?? n.meetingId;
  const documentId = target.documentId ?? n.documentId;
  const reportId = target.reportId ?? n.reportId;

  if (pinId) {
    router.push({ pathname: '/PinMetadataScreen', params: { pinId: String(pinId), from: 'Notification' } });
    return;
  }
  await ensureProject(projectId);
  if (meetingId) router.push({ pathname: '/chantier/reunion', params: { id: String(meetingId) } });
  else if (documentId) router.push('/(tabs)/documents');
  else if (reportId) router.push({ pathname: '/(tabs)/chantier', params: { view: 'rapports' } });
  else router.push('/notifications');
}

export const relativeTime = (iso) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `aujourd'hui à ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `hier à ${time}`;
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${time}`;
};
