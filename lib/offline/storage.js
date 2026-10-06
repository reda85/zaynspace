import * as FileSystem from 'expo-file-system/legacy';

// Petit stockage clé → JSON, un fichier par clé, dans le dossier de l'application
// (conservé par le système, contrairement au cache). Les chemins sont toujours
// recalculés à partir de documentDirectory : sur iOS ce dossier change de nom à
// chaque mise à jour de l'application.
export const OFFLINE_DIR = () => `${FileSystem.documentDirectory}offline/`;
const DATA_DIR = () => `${OFFLINE_DIR()}data/`;

const fileFor = (key) => `${DATA_DIR()}${String(key).replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;

let ready = null;
export function ensureDir(dir) {
  return FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
}
function ensureReady() {
  if (!ready) ready = ensureDir(DATA_DIR());
  return ready;
}

// Écritures en série par clé : deux enregistrements rapprochés ne se croisent pas.
const chains = new Map();
function serial(key, task) {
  const next = (chains.get(key) ?? Promise.resolve()).then(task, task);
  chains.set(key, next.catch(() => {}));
  return next;
}

export const fileStorage = {
  async get(key) {
    await ensureReady();
    try {
      const text = await FileSystem.readAsStringAsync(fileFor(key));
      return JSON.parse(text);
    } catch {
      // Fichier absent ou illisible. Si l'application a été arrêtée en plein
      // remplacement, la nouvelle version complète est encore dans le fichier temporaire.
      try {
        const text = await FileSystem.readAsStringAsync(`${fileFor(key)}.tmp`);
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
  },

  set(key, value) {
    return serial(key, async () => {
      await ensureReady();
      const target = fileFor(key);
      const tmp = `${target}.tmp`;
      // Écriture dans un fichier temporaire puis remplacement : une coupure en
      // cours d'écriture ne laisse pas un fichier tronqué.
      await FileSystem.writeAsStringAsync(tmp, JSON.stringify(value));
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: tmp, to: target });
    });
  },

  remove(key) {
    return serial(key, () => FileSystem.deleteAsync(fileFor(key), { idempotent: true }));
  },
};

/** Supprime les copies locales dont la clé ne commence par aucun des préfixes à garder. */
export async function removeDataExcept(keepPrefixes) {
  await ensureReady();
  let names = [];
  try { names = await FileSystem.readDirectoryAsync(DATA_DIR()); } catch { return; }
  await Promise.all(names
    .filter((n) => !keepPrefixes.some((p) => n.startsWith(p)))
    .map((n) => FileSystem.deleteAsync(`${DATA_DIR()}${n}`, { idempotent: true }).catch(() => {})));
}

/** Supprime toutes les données hors ligne (déconnexion, bouton « vider »). */
export async function wipeOfflineDir() {
  ready = null;
  await FileSystem.deleteAsync(OFFLINE_DIR(), { idempotent: true });
}

/** Taille en octets d'un dossier (récursif). */
export async function dirSize(dir) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return 0;
    if (!info.isDirectory) return info.size ?? 0;
    const names = await FileSystem.readDirectoryAsync(dir);
    const sizes = await Promise.all(names.map((n) => dirSize(`${dir.endsWith('/') ? dir : `${dir}/`}${n}`)));
    return sizes.reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}
