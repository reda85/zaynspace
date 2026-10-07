// Listes de référence d'un projet (statuts, catégories, membres avec leur rôle).
// Mêmes clés de copie locale que l'écran d'accueil : hors ligne, on retrouve
// ce qu'il a déjà chargé.
import { cachedSelect } from './offline';
import { supabase } from './supabase';

export async function fetchProjectLists(projectId, organizationId) {
  if (!projectId) return { statuses: null, categories: null, members: null };

  const [statusRes, categoryRes, memberRes] = await Promise.all([
    cachedSelect(`statuses-${projectId}`, () => supabase
      .from('Status').select('*').eq('project_id', projectId).order('order')),
    cachedSelect(`categories-${projectId}`, () => supabase
      .from('categories').select('*').eq('project_id', projectId).order('order')),
    cachedSelect(`members-${projectId}`, () => supabase
      .from('members_projects').select('*, projects(*), members(*)').eq('project_id', projectId)),
  ]);

  let members = null;
  const rows = (memberRes.data ?? []).filter((mp) => mp.members);
  if (memberRes.data) {
    let roles = {};
    if (organizationId && rows.length > 0) {
      const { data: rolesData } = await cachedSelect(`roles-${organizationId}-${projectId}`, () => supabase
        .from('members_organizations').select('member_id, role')
        .eq('organization_id', organizationId)
        .in('member_id', rows.map((mp) => mp.members.id)));
      roles = Object.fromEntries((rolesData ?? []).map((r) => [r.member_id, r.role]));
    }
    members = rows.map((mp) => ({
      ...mp.members,
      role: roles[mp.members.id] ?? null,
      members_projects: mp,
      projects: mp.projects,
    }));
  }

  return { statuses: statusRes.data ?? null, categories: categoryRes.data ?? null, members };
}

/** Rôles qui ne peuvent que consulter (et, pour un invité, changer le statut). */
export const isReadOnlyRole = (role) => ['guest', 'Invités', 'observateur', 'observer'].includes(role);
