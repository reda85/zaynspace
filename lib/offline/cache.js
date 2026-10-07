import { isNetworkError, OfflineError } from './errors';

/**
 * Lectures avec repli sur la dernière copie enregistrée sur l'appareil.
 *
 * `run` renvoie le résultat d'une requête Supabase ({ data, error }).
 *  - en ligne et réussite  → la réponse est enregistrée puis renvoyée ;
 *  - hors ligne / coupure  → la dernière copie est renvoyée (fromCache: true,
 *                            cachedAt: date de la copie) ; sans copie, l'erreur
 *                            porte toujours `offline: true` ;
 *  - refus du serveur      → l'erreur est renvoyée telle quelle, sans repli.
 */
export function createCache({ storage, isOnline, now = () => Date.now() }) {
  // Chaque copie est enregistrée avec sa date : { t, v }.
  async function readEntry(key) {
    const entry = await storage.get(key);
    if (entry && typeof entry === 'object' && 't' in entry && 'v' in entry) return entry;
    return null;
  }

  async function read(key) {
    return (await readEntry(key))?.v ?? null;
  }

  function write(key, value) {
    return storage.set(key, { t: now(), v: value });
  }

  async function fromCache(key) {
    const entry = await readEntry(key);
    if (!entry || entry.v === null || entry.v === undefined) {
      return { data: null, error: new OfflineError('Données non disponibles hors ligne'), fromCache: true, cachedAt: null };
    }
    return { data: entry.v, error: null, fromCache: true, cachedAt: entry.t };
  }

  async function cachedSelect(key, run) {
    if (!isOnline()) return fromCache(key);
    let result;
    try {
      result = await run();
    } catch (err) {
      if (isNetworkError(err)) return fromCache(key);
      throw err;
    }
    const { data, error } = result ?? {};
    if (error) {
      if (isNetworkError(error)) return fromCache(key);
      return { ...result, fromCache: false, cachedAt: null };
    }
    if (data !== null && data !== undefined) {
      try { await write(key, data); } catch { /* cache best-effort */ }
    }
    return { ...result, fromCache: false, cachedAt: null };
  }

  return { cachedSelect, read, readEntry, write };
}
