// Pilotage du chantier : lots, réunions et planning (mêmes tables que l'app web).
// Lectures copiées en local (consultables hors ligne) ; écritures en ligne seulement.
import { cachedSelect } from './offline';
import { supabase } from './supabase';

// ── Dates ─────────────────────────────────────────────────────────────────────

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 12 janv. », avec l'année si elle diffère de l'année en cours. */
export function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

/** « Jeudi 12 novembre 2026 ». */
export function fmtLongDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

export const fmtShortDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export function fmtPeriod(start, end) {
  if (!start && !end) return null;
  if (start && end) return `${fmtDate(start)} → ${fmtDate(end)}`;
  return start ? `À partir du ${fmtDate(start)}` : `Jusqu’au ${fmtDate(end)}`;
}

const DAY = 86400000;
export const toDay = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const daysBetween = (a, b) => toDay(b) - toDay(a);

// ── Lots ──────────────────────────────────────────────────────────────────────

/** Créé avec chaque projet pour les réserves sans lot : ce n'est pas un lot de travaux. */
export const isDefaultLot = (lot) => lot?.icon === 'unassigned';

export function isLotLate(lot, today = todayISO()) {
  return Boolean(lot.date_fin_prevue && lot.date_fin_prevue < today && !lot.date_fin_reelle && (lot.avancement ?? 0) < 100);
}

export async function fetchLots(projectId) {
  const { data, error, cachedAt } = await cachedSelect(`lots-${projectId}`, () => supabase
    .from('categories')
    .select('*, entreprises(id,name,corps_etat,contact_name,phone,email)')
    .eq('project_id', projectId)
    .order('order'));
  return { lots: (data ?? []).filter((l) => !isDefaultLot(l)), error, cachedAt };
}

/** Réserves par lot : ouvertes, échues, levées (dernier statut du projet = levée). */
export async function fetchLotStats(projectId) {
  const [{ data: pins }, { data: statuses }] = await Promise.all([
    cachedSelect(`lot-pins-${projectId}`, () => supabase
      .from('pdf_pins')
      .select('id,category_id,status_id,due_date,isArchived')
      .eq('project_id', projectId)
      .is('deleted_at', null)),
    cachedSelect(`statuses-${projectId}`, () => supabase
      .from('Status').select('*').eq('project_id', projectId).order('order')),
  ]);
  const ordered = [...(statuses ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const finalId = ordered[ordered.length - 1]?.id;
  const today = todayISO();
  const out = {};
  for (const p of pins ?? []) {
    if (p.isArchived) continue;
    const s = (out[p.category_id ?? 'none'] ??= { total: 0, open: 0, closed: 0, overdue: 0 });
    s.total++;
    if (p.status_id && p.status_id === finalId) s.closed++;
    else {
      s.open++;
      if (p.due_date && p.due_date.slice(0, 10) < today) s.overdue++;
    }
  }
  return out;
}

export async function fetchEntreprises(organizationId) {
  if (!organizationId) return [];
  const { data } = await cachedSelect(`entreprises-${organizationId}`, () => supabase
    .from('entreprises')
    .select('id,name,corps_etat,contact_name,phone,email')
    .eq('organization_id', organizationId));
  return (data ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

// ── Réunions ──────────────────────────────────────────────────────────────────

export async function fetchMeetings(projectId) {
  const { data, error, cachedAt } = await cachedSelect(`meetings-${projectId}`, () => supabase
    .from('meetings')
    .select('id,numero,date,heure,lieu,objet,statut,diffusee_at,prochaine_date,prochaine_heure')
    .eq('project_id', projectId)
    .order('numero', { ascending: false }));
  return { meetings: data ?? [], error, cachedAt };
}

export async function fetchMeeting(meetingId) {
  const { data, error } = await cachedSelect(`meeting-${meetingId}`, () => supabase
    .from('meetings')
    .select('*, meeting_attendees(*), meeting_lot_progress(*)')
    .eq('id', meetingId)
    .single());
  if (data) data.meeting_attendees = [...(data.meeting_attendees ?? [])].sort((a, b) => a.ordre - b.ordre);
  return { meeting: data, error };
}

const POINT_COLUMNS = `*,
  ouverture:meetings!meeting_points_meeting_id_fkey(id,numero,date),
  cloture:meetings!meeting_points_clos_meeting_id_fkey(id,numero,date),
  meeting_point_suivis(meeting_id,texte)`;

export async function fetchProjectPoints(projectId) {
  const { data } = await cachedSelect(`meeting-points-${projectId}`, () => supabase
    .from('meeting_points')
    .select(POINT_COLUMNS)
    .eq('project_id', projectId)
    .order('numero'));
  return data ?? [];
}

/** Avancement constaté à la réunion précédente, par lot. */
export async function fetchPreviousProgress(projectId, numero) {
  if (!numero || numero <= 1) return {};
  const { data } = await cachedSelect(`meeting-prev-${projectId}-${numero}`, () => supabase
    .from('meetings')
    .select('numero, meeting_lot_progress(lot_id, avancement)')
    .eq('project_id', projectId)
    .lt('numero', numero)
    .order('numero', { ascending: false })
    .limit(1));
  return Object.fromEntries((data?.[0]?.meeting_lot_progress ?? []).map((p) => [p.lot_id, p.avancement]));
}

const check = ({ error, data }) => {
  if (error) throw error;
  return data;
};

export const createMeeting = async (projectId) => check(await supabase.rpc('creer_reunion', { p_project_id: projectId }));
export const diffuseMeeting = async (meetingId) => check(await supabase.rpc('diffuser_reunion', { p_meeting_id: meetingId }));
export const updateMeeting = async (id, fields) => check(await supabase.from('meetings').update(fields).eq('id', id));
export const updateAttendee = async (id, fields) => check(await supabase.from('meeting_attendees').update(fields).eq('id', id));
export const saveProgress = async (meetingId, lotId, fields) => check(await supabase
  .from('meeting_lot_progress')
  .upsert({ meeting_id: meetingId, lot_id: lotId, ...fields }, { onConflict: 'meeting_id,lot_id' }));
export const createPoint = async (fields) => check(await supabase.from('meeting_points').insert([fields]).select(POINT_COLUMNS).single());
export const updatePoint = async (id, fields) => check(await supabase.from('meeting_points').update(fields).eq('id', id).select(POINT_COLUMNS).single());
export async function saveSuivi(pointId, meetingId, texte) {
  const clean = texte?.trim();
  const q = supabase.from('meeting_point_suivis');
  return check(clean
    ? await q.upsert({ point_id: pointId, meeting_id: meetingId, texte: clean }, { onConflict: 'point_id,meeting_id' })
    : await q.delete().eq('point_id', pointId).eq('meeting_id', meetingId));
}

/** Points à l'ordre du jour de la réunion : ouverts à cette date, ou soldés ce jour-là. */
export function pointsForMeeting(points, meeting) {
  return points
    .filter((p) => p.ouverture?.numero <= meeting.numero && (!p.cloture || p.cloture.numero >= meeting.numero))
    .map((p) => ({
      ...p,
      etat: p.cloture?.numero === meeting.numero ? 'solde' : p.ouverture?.id === meeting.id ? 'nouveau' : 'en_cours',
      suivi: p.meeting_point_suivis?.find((s) => s.meeting_id === meeting.id)?.texte ?? '',
    }));
}

export const POINT_TYPES = { action: 'Action', decision: 'Décision', information: 'Information' };
export const ETATS = { nouveau: 'Nouveau', en_cours: 'En cours', solde: 'Soldé' };
export const PRESENCES = { present: 'Présent', absent: 'Absent', excuse: 'Excusé' };

// ── Planning ──────────────────────────────────────────────────────────────────
// Tâches planifiées = tâches de l'application (pdf_pins) avec une date de début,
// leur fin étant l'échéance ; jalons = planning_tasks. Forme commune :
// { id, kind: 'pin' | 'jalon', type, libelle, lot_id, sous_lot_id, date_debut, date_fin, avancement, done, pin_number }
// Les tâches d'un lot peuvent être rangées dans ses sous-lots (sous_lots).

/** Échéance (timestamptz) → jour local, comme dans la liste des tâches. */
export function dueToDay(due) {
  if (!due) return null;
  const d = new Date(due);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchPlanning(projectId) {
  const pinsQuery = (cols) => () => supabase
    .from('pdf_pins')
    .select(cols)
    .eq('project_id', projectId)
    .not('date_debut', 'is', null)
    .is('deleted_at', null)
    .order('date_debut');
  const PIN_COLS = 'id,name,category_id,status_id,date_debut,due_date,avancement,pin_number,isArchived';
  let [pinsRes, jalonsRes, statusRes, sousLotsRes] = await Promise.all([
    cachedSelect(`planning-pins-${projectId}`, pinsQuery(`${PIN_COLS},sous_lot_id`)),
    cachedSelect(`planning-${projectId}`, () => supabase
      .from('planning_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('date_debut')),
    cachedSelect(`statuses-${projectId}`, () => supabase
      .from('Status').select('*').eq('project_id', projectId).order('order')),
    cachedSelect(`sous-lots-${projectId}`, () => supabase
      .from('sous_lots').select('id,lot_id,name,sort_order').eq('project_id', projectId).order('sort_order').order('created_at')),
  ]);
  // Base sans sous-lots (migration non appliquée) : planning sans ce niveau.
  if (pinsRes.error && /sous_lot/i.test(pinsRes.error.message ?? '')) {
    pinsRes = await cachedSelect(`planning-pins-${projectId}`, pinsQuery(PIN_COLS));
  }
  const statuses = [...(statusRes.data ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const finalId = statuses[statuses.length - 1]?.id ?? null;
  const pins = (pinsRes.data ?? []).filter((p) => !p.isArchived).map((p) => {
    const done = Boolean(finalId && p.status_id === finalId);
    const fin = dueToDay(p.due_date);
    return {
      id: p.id,
      kind: 'pin',
      type: 'tache',
      libelle: p.name || 'Tâche sans nom',
      lot_id: p.category_id,
      sous_lot_id: p.sous_lot_id ?? null,
      date_debut: p.date_debut,
      date_fin: fin && fin >= p.date_debut ? fin : p.date_debut,
      avancement: done ? 100 : p.avancement ?? 0,
      done,
      pin_number: p.pin_number,
    };
  });
  const jalons = (jalonsRes.data ?? []).map((j) => ({ ...j, kind: 'jalon', done: j.avancement >= 100 }));
  return {
    tasks: [...jalons, ...pins].sort((a, b) => a.date_debut.localeCompare(b.date_debut)),
    sousLots: sousLotsRes.error ? [] : sousLotsRes.data ?? [],
    finalStatusId: finalId,
    error: pinsRes.error ?? jalonsRes.error,
  };
}

/** Avancement d'un élément du planning ; une tâche à 100 % prend le statut final (levée). */
export async function setPlanningProgress(item, avancement, finalStatusId) {
  if (item.kind === 'jalon') {
    return check(await supabase.from('planning_tasks').update({ avancement }).eq('id', item.id));
  }
  const fields = { avancement, updated_at: new Date().toISOString() };
  if (avancement >= 100 && finalStatusId) fields.status_id = finalStatusId;
  return check(await supabase.from('pdf_pins').update(fields).eq('id', item.id));
}

export const isTaskLate = (t, today = todayISO()) => t.date_fin < today && (t.avancement ?? 0) < 100;
