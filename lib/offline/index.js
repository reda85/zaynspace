import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { atom, getDefaultStore } from 'jotai';
import { AppState } from 'react-native';

import { membersAtom } from '../../store/atoms';
import { supabase } from '../supabase';
import { createCache } from './cache';
import { isNetworkError } from './errors';
import { isOnline, onNetworkChange } from './network';
import { createOutbox } from './outbox';
import { countPending, overlayPins, pendingPhotosForPin, pinsForPlanFromCaches, rememberSent } from './pending';
import { dirSize, ensureDir, fileStorage, OFFLINE_DIR, removeDataExcept, wipeOfflineDir } from './storage';
import { resetTileIndex } from './tiles';

export { isNetworkError, OfflineError } from './errors';
export { isOnline, setOnline } from './network';
export * from './tiles';

// ── Lectures avec repli local ────────────────────────────────────────────────
const cache = createCache({ storage: fileStorage, isOnline });
export const cachedSelect = cache.cachedSelect;
export const readCache = cache.read;
export const writeCache = cache.write;

/**
 * Pins d'un plan depuis les copies locales (liste du plan + listes du projet).
 * `suffix` : suffixe de clé des listes d'un invité (« -<id du membre> »), sinon ''.
 */
export async function cachedPlanPins(planId, projectId, suffix = '') {
  const [planEntry, tasksEntry, homeEntry] = await Promise.all([
    cache.readEntry(`pins-plan-${planId}${suffix}`),
    projectId ? cache.readEntry(`pins-tasks-${projectId}${suffix}`) : null,
    projectId ? cache.readEntry(`pins-home-${projectId}${suffix}`) : null,
  ]);
  return pinsForPlanFromCaches(planId, planEntry, [tasksEntry, homeEntry]);
}

// ── Photos en attente ────────────────────────────────────────────────────────
// Seul le nom du fichier est enregistré dans la file : le dossier de
// l'application change de chemin à chaque mise à jour sur iOS.
export const PHOTO_DIR = () => `${OFFLINE_DIR()}photos/`;
export const photoUri = (file) => `${PHOTO_DIR()}${file}`;

/** Enregistre une image (base64) dans le dossier des photos en attente. */
export async function savePendingPhotoFile(file, base64) {
  await ensureDir(PHOTO_DIR());
  await FileSystem.writeAsStringAsync(photoUri(file), base64, { encoding: 'base64' });
  return file;
}

const alreadyExists = (error) => /exist|duplicate/i.test(error?.message || '') || String(error?.statusCode) === '409';

// ── Envoi des opérations en attente ──────────────────────────────────────────
const PIN_COLUMNS = [
  'id', 'x', 'y', 'name', 'note', 'category_id', 'status_id', 'project_id', 'plan_id', 'pdf_name',
  'due_date', 'assigned_to', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at',
];
const pick = (source, keys) => Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));

const handlers = {
  // Création d'un pin. L'identifiant est généré sur l'appareil : renvoyer la
  // même création deux fois ne crée pas de doublon.
  'pin.insert': async ({ row }) => {
    const clean = pick(row, PIN_COLUMNS);
    const { error } = await supabase.from('pdf_pins').upsert([clean], { onConflict: 'id' });
    if (error) throw error;
  },

  // Modification : uniquement les champs changés. Le dernier envoi l'emporte, champ par champ.
  'pin.update': async ({ id, patch }) => {
    const clean = pick(patch, PIN_COLUMNS.filter((c) => c !== 'id'));
    if (Object.keys(clean).length === 0) return;
    const { data, error } = await supabase.from('pdf_pins').update(clean).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Pin introuvable ou modification refusée');
  },

  // Photo : fichier, miniature (facultative), puis ligne pins_photos.
  'photo.upload': async (p) => {
    const info = await FileSystem.getInfoAsync(photoUri(p.file));
    if (!info.exists) throw new Error('Fichier photo introuvable sur l\'appareil');

    const base64 = await FileSystem.readAsStringAsync(photoUri(p.file), { encoding: 'base64' });
    const uploadPath = `${p.project_id}/${p.file}`;
    const { error: uploadError } = await supabase.storage
      .from('pinphotos')
      .upload(uploadPath, decode(base64), { contentType: 'image/jpeg' });
    if (uploadError && !alreadyExists(uploadError)) throw uploadError;

    let thumbUrl = null;
    if (p.thumbFile) {
      try {
        const thumbInfo = await FileSystem.getInfoAsync(photoUri(p.thumbFile));
        if (thumbInfo.exists) {
          const thumb64 = await FileSystem.readAsStringAsync(photoUri(p.thumbFile), { encoding: 'base64' });
          const thumbPath = `${p.project_id}/${p.thumbFile}`;
          const { error: thumbError } = await supabase.storage
            .from('pinphotos')
            .upload(thumbPath, decode(thumb64), { contentType: 'image/jpeg' });
          if (!thumbError || alreadyExists(thumbError)) {
            thumbUrl = supabase.storage.from('pinphotos').getPublicUrl(thumbPath).data.publicUrl;
          }
        }
      } catch {
        // miniature non bloquante : l'application retombe sur l'image complète
      }
    }

    const publicUrl = supabase.storage.from('pinphotos').getPublicUrl(uploadPath).data.publicUrl;
    // Identifiant généré sur l'appareil : un second envoi ne crée pas de doublon.
    const { error: insertError } = await supabase.from('pins_photos').upsert([{
      id: p.id,
      pin_id: p.pin_id,
      project_id: p.project_id,
      public_url: publicUrl,
      thumb_url: thumbUrl,
      description: p.description ?? null,
      date: p.date,
      sender_id: p.sender_id ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      plan_id: p.plan_id ?? null,
      plan_x: p.plan_x ?? null,
      plan_y: p.plan_y ?? null,
    }], { onConflict: 'id' });
    if (insertError) throw insertError;

    await FileSystem.deleteAsync(photoUri(p.file), { idempotent: true }).catch(() => {});
    if (p.thumbFile) await FileSystem.deleteAsync(photoUri(p.thumbFile), { idempotent: true }).catch(() => {});
  },
};

// Modifications de pins déjà envoyées : réappliquées à une copie locale plus
// ancienne qu'elles, pour qu'une lecture hors ligne ne « perde » pas un
// changement que le serveur a bien reçu.
const RECENT_KEY = 'recent-writes';
let recent = [];
function recordSent(op) {
  recent = rememberSent(recent, op, Date.now());
  fileStorage.set(RECENT_KEY, recent).catch(() => {});
}

export const outbox = createOutbox({ storage: fileStorage, handlers, isOnline, onSent: recordSent });

// ── État exposé aux écrans ───────────────────────────────────────────────────
const store = getDefaultStore();
/** Opérations en attente ou refusées. */
export const outboxOpsAtom = atom([]);
/** Augmente après chaque envoi réussi : les listes se rechargent. */
export const syncTickAtom = atom(0);
export const outboxCountAtom = atom((get) => countPending(get(outboxOpsAtom)));

outbox.subscribe((ops) => store.set(outboxOpsAtom, ops));

export const getOutboxOps = () => store.get(outboxOpsAtom);
const resolveMember = (id) => (store.get(membersAtom) ?? []).find((m) => m.id === id) ?? null;
/**
 * Complète une liste de pins avec les modifications faites sur l'appareil.
 * `cachedAt` : date de la copie locale quand la liste en provient (résultat de cachedSelect).
 */
export const withPendingPins = (pins, scope, cachedAt = null) =>
  overlayPins(pins, getOutboxOps(), scope, { recent, cachedAt, resolveMember });
export const pendingPhotos = (pinId) => pendingPhotosForPin(getOutboxOps(), pinId, (p) => photoUri(p.file));

/** Envoie la file d'attente si le réseau est là. Sans effet sinon. */
export async function syncNow() {
  if (!isOnline()) return 0;
  try {
    const sent = await outbox.flush();
    if (sent > 0) store.set(syncTickAtom, (n) => n + 1);
    return sent;
  } catch (err) {
    console.warn('[offline] sync failed:', err?.message);
    return 0;
  }
}

/** Met une opération en file et tente l'envoi tout de suite si possible. */
export async function queue(type, payload) {
  await outbox.enqueue(type, payload);
  syncNow();
}

/**
 * Exécute `run` maintenant ; si le réseau manque, met l'opération en file.
 * Renvoie { queued: boolean }. Un refus du serveur est relancé tel quel.
 */
export async function runOrQueue(type, payload, run) {
  // Tant que des opérations attendent, tout passe par la file pour garder l'ordre.
  const waiting = getOutboxOps().some((o) => o.status === 'pending');
  if (isOnline() && !waiting) {
    try {
      await run();
      recordSent({ type, payload });
      return { queued: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await queue(type, payload);
  return { queued: true };
}

let started = false;
/** À appeler une fois au démarrage : charge la file et l'envoie au retour du réseau. */
export function startSync() {
  if (started) return;
  started = true;
  fileStorage.get(RECENT_KEY).then((stored) => { if (Array.isArray(stored)) recent = stored.concat(recent); }).catch(() => {});
  outbox.list().then((ops) => { store.set(outboxOpsAtom, ops); syncNow(); });
  onNetworkChange((online) => { if (online) syncNow(); });
  AppState.addEventListener('change', (state) => { if (state === 'active') syncNow(); });
  // Réseau annoncé mais instable : on retente régulièrement tant qu'il reste des envois.
  setInterval(() => {
    if (isOnline() && getOutboxOps().some((o) => o.status === 'pending')) syncNow();
  }, 30000);
}

// ── Entretien ────────────────────────────────────────────────────────────────
export async function offlineUsage() {
  return { total: await dirSize(OFFLINE_DIR()), tiles: await dirSize(`${OFFLINE_DIR()}tiles/`) };
}

/**
 * Efface les copies locales (plans, listes de pins). Le profil, la file
 * d'attente et les photos non envoyées sont conservés, sauf si `includePending`
 * est vrai (déconnexion, changement de compte) : alors tout est supprimé.
 */
export async function clearOfflineData({ includePending = false } = {}) {
  resetTileIndex();
  if (includePending) {
    recent = [];
    await outbox.clear();
    await wipeOfflineDir();
    return;
  }
  await FileSystem.deleteAsync(`${OFFLINE_DIR()}tiles/`, { idempotent: true });
  // Le profil reste : sans lui, l'application ne peut pas s'ouvrir hors ligne.
  await removeDataExcept(['outbox', RECENT_KEY, 'member-', 'org-', 'role-']);
}
