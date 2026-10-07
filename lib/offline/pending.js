// Superpose aux données lues (serveur ou copie locale) les modifications faites
// sur l'appareil, pour que l'écran montre toujours ce que l'utilisateur a saisi :
//  - `ops`    : opérations en attente d'envoi (toujours appliquées) ;
//  - `recent` : opérations déjà envoyées, appliquées seulement à une copie
//               locale plus ancienne qu'elles (sinon la copie les contient déjà).

function toLocalPatch(patch, current, resolveMember) {
  const out = { ...patch };
  // La colonne assigned_to contient un identifiant ; les écrans attendent
  // l'objet membre (requêtes « assigned_to(*) ») et lisent aussi assigned_to_id.
  if ('assigned_to' in out && (out.assigned_to === null || typeof out.assigned_to !== 'object')) {
    const id = out.assigned_to;
    out.assigned_to_id = id;
    const known = current?.assigned_to && typeof current.assigned_to === 'object' ? current.assigned_to : null;
    if (id === null || id === undefined) out.assigned_to = null;
    else if (known?.id === id) out.assigned_to = known;
    else out.assigned_to = resolveMember?.(id) ?? { id };
  }
  return out;
}

/**
 * @param pins   pins lus
 * @param ops    opérations de la file d'attente
 * @param scope  { projectId?, planId?, assignedTo? } : périmètre de la liste affichée
 * @param extra  { recent?, cachedAt?, resolveMember? }
 */
export function overlayPins(pins, ops, scope = {}, extra = {}) {
  const list = Array.isArray(pins) ? pins.slice() : [];
  const { recent, cachedAt, resolveMember } = extra;
  const applicable = [];
  // Opérations déjà envoyées : uniquement si la copie affichée leur est antérieure.
  if (cachedAt && Array.isArray(recent)) {
    for (const op of recent) if (op.sentAt > cachedAt) applicable.push({ ...op, _sent: true });
  }
  if (Array.isArray(ops)) applicable.push(...ops);
  if (applicable.length === 0) return list;

  const index = new Map(list.map((p, i) => [p.id, i]));
  const assigneeId = (row) => (row.assigned_to && typeof row.assigned_to === 'object' ? row.assigned_to.id : row.assigned_to);

  for (const op of applicable) {
    const flags = op._sent ? {} : { _pending: true, _failed: op.status === 'failed' };
    if (op.type === 'pin.insert') {
      const row = op.payload?.row;
      if (!row?.id || index.has(row.id) || row.deleted_at) continue;
      if (scope.projectId && row.project_id !== scope.projectId) continue;
      if (scope.planId && row.plan_id !== scope.planId) continue;
      if (scope.assignedTo && assigneeId(row) !== scope.assignedTo) continue;
      index.set(row.id, list.length);
      list.push({ ...toLocalPatch(row, null, resolveMember), ...flags });
    } else if (op.type === 'pin.update') {
      const i = index.get(op.payload?.id);
      if (i === undefined) continue;
      const patch = toLocalPatch(op.payload.patch ?? {}, list[i], resolveMember);
      if (patch.deleted_at) {
        list[i] = null;
        index.delete(op.payload.id);
        continue;
      }
      list[i] = { ...list[i], ...patch, ...flags };
    }
  }
  return list.filter(Boolean);
}

/** Photos prises hors ligne pour un pin, pas encore envoyées. */
export function pendingPhotosForPin(ops, pinId, toUri = (payload) => payload.fileUri) {
  if (!Array.isArray(ops) || !pinId) return [];
  return ops
    .filter((op) => op.type === 'photo.upload' && op.payload?.pin_id === pinId)
    .map((op) => ({
      id: op.payload.id,
      uri: toUri(op.payload),
      description: op.payload.description ?? null,
      failed: op.status === 'failed',
      error: op.lastError,
    }));
}

export function countPending(ops) {
  const list = Array.isArray(ops) ? ops : [];
  return {
    pending: list.filter((o) => o.status === 'pending').length,
    failed: list.filter((o) => o.status === 'failed').length,
  };
}

/** Ajoute une opération envoyée à l'historique récent (borné en taille et en âge). */
export function rememberSent(recent, op, now, { max = 300, maxAgeMs = 7 * 24 * 3600 * 1000 } = {}) {
  if (op.type !== 'pin.insert' && op.type !== 'pin.update') return recent;
  const kept = (Array.isArray(recent) ? recent : []).filter((r) => now - r.sentAt < maxAgeMs);
  kept.push({ type: op.type, payload: op.payload, sentAt: now });
  return kept.slice(-max);
}

/**
 * Pins d'un plan à partir des copies locales, quand le réseau manque.
 *
 * La liste d'un plan n'est enregistrée que lorsqu'on ouvre ce plan en ligne ;
 * les listes du projet (accueil, tâches) contiennent, elles, les pins de tous
 * les plans. On prend donc la copie la plus récente parmi les trois pour savoir
 * quels pins existent, et on garde de la copie du plan les détails (événements,
 * photos) que les listes du projet n'ont pas.
 *
 * @param planEntry       { t, v } copie de la liste du plan, ou null
 * @param projectEntries  [{ t, v }] copies des listes du projet
 * @returns { pins, cachedAt } ou null si aucune copie n'existe
 */
export function pinsForPlanFromCaches(planId, planEntry, projectEntries = []) {
  const candidates = [];
  if (Array.isArray(planEntry?.v)) candidates.push({ t: planEntry.t, pins: planEntry.v, fromPlan: true });
  for (const entry of projectEntries) {
    if (!Array.isArray(entry?.v)) continue;
    candidates.push({ t: entry.t, pins: entry.v.filter((p) => p.plan_id === planId && !p.deleted_at), fromPlan: false });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t);
  const newest = candidates[0];
  if (newest.fromPlan) return { pins: newest.pins, cachedAt: newest.t };
  const detailed = new Map((Array.isArray(planEntry?.v) ? planEntry.v : []).map((p) => [p.id, p]));
  return {
    pins: newest.pins.map((p) => (detailed.has(p.id) ? { ...detailed.get(p.id), ...p } : p)),
    cachedAt: newest.t,
  };
}

/**
 * Où en sont des photos mises en file (repérées par leur identifiant) :
 * `sent` ont quitté la file, `waiting` attendent encore, `refused` ont été
 * refusées par le serveur et restent visibles dans les envois en attente.
 */
export function photoQueueState(ops, photoIds) {
  const wanted = new Set(photoIds);
  let waiting = 0;
  let refused = 0;
  for (const op of ops || []) {
    if (op.type !== 'photo.upload' || !wanted.has(op.payload?.id)) continue;
    if (op.status === 'failed') refused += 1;
    else waiting += 1;
  }
  return { sent: Math.max(0, wanted.size - waiting - refused), waiting, refused };
}
