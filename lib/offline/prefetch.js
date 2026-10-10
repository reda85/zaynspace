// Préparation du mode hors ligne : tant que le réseau est là, on enregistre sur
// l'appareil ce qu'il faut pour changer d'organisation et de projet sans réseau
// (listes d'organisations et de projets, rôle dans chaque organisation) et les
// données de l'accueil de chaque projet (plans, pins, statuts, catégories,
// membres, activité).
//
// Les clés et les requêtes sont exactement celles des écrans qui les relisent
// (select-project.js, AuthGate.js, lib/fetchRoleForOrg.js, (tabs)/acceuil.js,
// lib/projectLists.js) : une copie faite ici est retrouvée telle quelle hors ligne.
import { supabase } from '../supabase';
import { cachedSelect, isOnline } from './index';

const MIN_INTERVAL_MS = 30 * 60 * 1000;
let lastRun = { userId: null, at: 0 };
let running = null;

const isGuestRole = (role) => ['guest', 'Invités'].includes(role);

async function prefetchProject(project, user, role) {
  const pid = project.id;
  const guest = isGuestRole(role);

  await cachedSelect(`plans-${pid}`, () => supabase
    .from('plans').select('*').is('deleted_at', null).eq('status', 'ready')
    .eq('project_id', pid));

  await cachedSelect(`pins-home-${pid}${guest ? `-${user.id}` : ''}`, () => {
    let query = supabase
      .from('pdf_pins').select('*,Status(*),categories(*),projects(*),pin_tags(tag_id, tags(*))')
      .is('deleted_at', null)
      .eq('project_id', pid);
    if (guest) query = query.eq('assigned_to', user.id);
    return query;
  });

  await cachedSelect(`events-${pid}`, () => supabase
    .from('events').select('*,pdf_pins(*),members(*)')
    .eq('project_id', pid)
    .order('created_at', { ascending: false }).limit(10));

  await cachedSelect(`statuses-${pid}`, () => supabase
    .from('Status').select('*').eq('project_id', pid).order('order'));

  await cachedSelect(`categories-${pid}`, () => supabase
    .from('categories').select('*').eq('project_id', pid).order('order'));

  const { data: membersProjects } = await cachedSelect(`members-${pid}`, () => supabase
    .from('members_projects')
    .select(`*, projects(*), members(*)`)
    .eq('project_id', pid));

  const memberIds = (membersProjects ?? []).map((mp) => mp.members?.id).filter(Boolean);
  if (memberIds.length > 0 && project.organization_id) {
    await cachedSelect(`roles-${project.organization_id}-${pid}`, () => supabase
      .from('members_organizations')
      .select('member_id, role')
      .eq('organization_id', project.organization_id)
      .in('member_id', memberIds));
  }
}

async function run(user) {
  // Organisations du membre (sélecteur d'organisation).
  const { data: orgRows } = await cachedSelect(`orgs-${user.id}`, () => supabase
    .from('members_organizations')
    .select('organization_id, organizations(id, name)')
    .eq('member_id', user.id));
  const orgs = (orgRows ?? []).map((row) => row.organizations).filter(Boolean);

  // Rôle et fiche de chaque organisation (changement d'organisation, démarrage).
  const roles = {};
  for (const org of orgs) {
    const { data } = await cachedSelect(`role-${user.id}-${org.id}`, () => supabase
      .from('members_organizations')
      .select('role')
      .eq('member_id', user.id)
      .eq('organization_id', org.id)
      .maybeSingle());
    roles[org.id] = data?.role ?? null;
    await cachedSelect(`org-${org.id}`, () => supabase
      .from('organizations')
      .select('id, name')
      .eq('id', org.id)
      .single());
  }

  // Projets du membre, toutes organisations confondues.
  const { data: memberProjects } = await cachedSelect(`my-project-ids-${user.id}`, () => supabase
    .from('members_projects')
    .select('project_id')
    .eq('member_id', user.id));
  const projectIds = (memberProjects ?? []).map((mp) => mp.project_id);

  await cachedSelect(`home-projects-${user.id}`, () => supabase
    .from('members_projects')
    .select('projects(*)')
    .eq('member_id', user.id));

  if (projectIds.length === 0) return;

  const projects = [];
  for (const org of orgs) {
    const { data } = await cachedSelect(`projects-${org.id}-${user.id}`, () => supabase
      .from('projects')
      .select('*')
      .eq('organization_id', org.id)
      .in('id', projectIds)
      .order('created_at', { ascending: false }));
    projects.push(...(data ?? []));
  }

  // Données de l'accueil de chaque projet. Le projet ouvert a déjà été chargé
  // par l'écran ; les autres le sont l'un après l'autre, sans hâte.
  for (const project of projects) {
    if (!isOnline()) return;
    try {
      await prefetchProject(project, user, roles[project.organization_id] ?? user.role);
    } catch (e) {
      console.warn('[offline] prefetch project failed:', project.id, e?.message);
    }
  }
}

/**
 * Lance la préparation si le réseau est là et qu'elle n'a pas été faite
 * récemment pour ce membre. Ne lève jamais d'erreur.
 */
export function prefetchForOffline(user, { force = false } = {}) {
  if (!user?.id || !isOnline()) return Promise.resolve();
  if (running) return running;
  const fresh = lastRun.userId === user.id && Date.now() - lastRun.at < MIN_INTERVAL_MS;
  if (fresh && !force) return Promise.resolve();

  lastRun = { userId: user.id, at: Date.now() };
  running = run(user)
    .catch((e) => console.warn('[offline] prefetch failed:', e?.message))
    .finally(() => { running = null; });
  return running;
}
