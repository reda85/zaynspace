import * as FileSystem from 'expo-file-system/legacy';
import { dirSize, ensureDir, fileStorage, OFFLINE_DIR } from './storage';

// Tuiles des plans enregistrées sur l'appareil.
//   offline/tiles/<planId>/<niveau>_<colonne>_<ligne>.jpeg
const TILE_SIZE = 512;
const MANIFEST_KEY = 'offline-plans'; // { [planId]: { complete, tiles, total, savedAt, name } }

const planDir = (planId) => `${OFFLINE_DIR()}tiles/${planId}/`;
const tileName = (level, col, row) => `${level}_${col}_${row}.jpeg`;

// Tuiles présentes, par plan, tenues en mémoire pour que l'afficheur puisse
// choisir « fichier local ou réseau » sans attendre.
const present = new Map();

export async function loadPlanTiles(planId) {
  if (!planId) return new Set();
  try {
    const names = await FileSystem.readDirectoryAsync(planDir(planId));
    const set = new Set(names.filter((n) => n.endsWith('.jpeg')));
    present.set(planId, set);
    return set;
  } catch {
    present.set(planId, new Set());
    return present.get(planId);
  }
}

/** URI du fichier local de la tuile, ou null si elle n'est pas enregistrée. */
export function localTileUri(planId, level, col, row) {
  const set = present.get(planId);
  const name = tileName(level, col, row);
  return set && set.has(name) ? `${planDir(planId)}${name}` : null;
}

/** Même pyramide que l'afficheur : du niveau de base (max − 6) à la pleine résolution. */
export function planTileList({ width, height }) {
  const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
  const baseLevel = Math.max(0, maxLevel - 6);
  const tiles = [];
  for (let level = baseLevel; level <= maxLevel; level++) {
    const scale = Math.pow(2, maxLevel - level);
    const cols = Math.ceil(Math.ceil(width / scale) / TILE_SIZE);
    const rows = Math.ceil(Math.ceil(height / scale) / TILE_SIZE);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) tiles.push({ level, col, row });
    }
  }
  return tiles;
}

export async function getOfflinePlans() {
  return (await fileStorage.get(MANIFEST_KEY)) ?? {};
}

async function updateManifest(planId, entry) {
  const manifest = await getOfflinePlans();
  if (entry === null) delete manifest[planId];
  else manifest[planId] = { ...(manifest[planId] ?? {}), ...entry };
  await fileStorage.set(MANIFEST_KEY, manifest);
  return manifest;
}

const active = new Map(); // planId → { cancelled }

/**
 * Télécharge toutes les tuiles d'un plan. Reprend là où un téléchargement
 * précédent s'est arrêté. `urlFor(level, col, row)` donne l'adresse distante.
 */
export async function downloadPlan(plan, urlFor, onProgress) {
  const { id: planId, width, height, name } = plan;
  if (active.has(planId)) return { complete: false, busy: true };
  const job = { cancelled: false };
  active.set(planId, job);
  try {
    await ensureDir(planDir(planId));
    const have = await loadPlanTiles(planId);
    const all = planTileList({ width, height });
    const missing = all.filter((t) => !have.has(tileName(t.level, t.col, t.row)));
    let done = all.length - missing.length;
    let failed = 0;
    onProgress?.(done, all.length);

    let cursor = 0;
    const worker = async () => {
      while (!job.cancelled) {
        const t = missing[cursor++];
        if (!t) return;
        const name_ = tileName(t.level, t.col, t.row);
        const target = `${planDir(planId)}${name_}`;
        try {
          const res = await FileSystem.downloadAsync(urlFor(t.level, t.col, t.row), `${target}.part`);
          if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
          await FileSystem.moveAsync({ from: `${target}.part`, to: target });
          have.add(name_);
          done++;
        } catch {
          failed++;
          await FileSystem.deleteAsync(`${target}.part`, { idempotent: true }).catch(() => {});
        }
        onProgress?.(done, all.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    const complete = !job.cancelled && failed === 0 && done === all.length;
    await updateManifest(planId, { complete, tiles: done, total: all.length, savedAt: Date.now(), name: name ?? null });
    return { complete, tiles: done, total: all.length, failed, cancelled: job.cancelled };
  } finally {
    active.delete(planId);
  }
}

export function cancelDownload(planId) {
  const job = active.get(planId);
  if (job) job.cancelled = true;
}

export async function removeOfflinePlan(planId) {
  cancelDownload(planId);
  present.delete(planId);
  await FileSystem.deleteAsync(planDir(planId), { idempotent: true });
  return updateManifest(planId, null);
}

/** Oublie les tuiles connues en mémoire (après un vidage des données). */
export function resetTileIndex() {
  present.clear();
}

export const tilesSize = () => dirSize(`${OFFLINE_DIR()}tiles/`);
