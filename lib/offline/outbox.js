import { isNetworkError } from './errors';

const STORAGE_KEY = 'outbox';

/**
 * File d'attente persistante des modifications faites sans réseau.
 *
 * Chaque opération : { id, type, payload, createdAt, attempts, status, lastError }
 *  - status 'pending' : sera (re)tentée dans l'ordre de création ;
 *  - status 'failed'  : refusée par le serveur, conservée pour être montrée.
 *
 * L'ordre est respecté : la création d'un pin part avant ses photos. Une
 * coupure réseau arrête l'envoi (on reprendra plus tard) ; un refus du serveur
 * met l'opération de côté et l'envoi continue.
 */
export function createOutbox({ storage, handlers, isOnline, now = () => Date.now(), makeId, onSent }) {
  let ops = null;          // chargé à la première utilisation
  let flushing = null;     // promesse de l'envoi en cours
  let inFlightId = null;
  const listeners = new Set();

  const nextId = makeId ?? (() => `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  async function load() {
    if (ops === null) {
      const stored = await storage.get(STORAGE_KEY);
      ops = Array.isArray(stored) ? stored : [];
    }
    return ops;
  }

  async function persist() {
    await storage.set(STORAGE_KEY, ops);
    const snapshot = ops.slice();
    listeners.forEach((fn) => { try { fn(snapshot); } catch { /* listener */ } });
  }

  // Fusionne une modification de pin dans une opération déjà en attente pour ce
  // pin, afin de n'envoyer qu'une requête et de garder le dernier état voulu.
  function coalesce(type, payload) {
    if (type !== 'pin.update') return false;
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.status !== 'pending' || op.id === inFlightId) continue;
      if (op.type === 'pin.update' && op.payload.id === payload.id) {
        op.payload = { ...op.payload, patch: { ...op.payload.patch, ...payload.patch } };
        return true;
      }
      if (op.type === 'pin.insert' && op.payload.row?.id === payload.id) {
        op.payload = { ...op.payload, row: { ...op.payload.row, ...payload.patch } };
        return true;
      }
    }
    return false;
  }

  async function enqueue(type, payload) {
    await load();
    if (!handlers[type]) throw new Error(`Type d'opération inconnu : ${type}`);
    if (!coalesce(type, payload)) {
      ops.push({ id: nextId(), type, payload, createdAt: now(), attempts: 0, status: 'pending', lastError: null });
    }
    await persist();
    return ops.slice();
  }

  async function run() {
    await load();
    let sent = 0;
    // La liste est relue à chaque tour : des opérations peuvent s'ajouter pendant l'envoi.
    for (;;) {
      if (!isOnline()) break;
      const op = ops.find((o) => o.status === 'pending');
      if (!op) break;
      inFlightId = op.id;
      try {
        await handlers[op.type](op.payload);
        ops = ops.filter((o) => o.id !== op.id);
        sent++;
        try { onSent?.(op); } catch { /* observateur */ }
      } catch (err) {
        op.attempts += 1;
        op.lastError = String(err?.message ?? err);
        if (isNetworkError(err)) {
          inFlightId = null;
          await persist();
          break;                      // réseau perdu : on garde l'ordre et on s'arrête
        }
        op.status = 'failed';         // refus du serveur : mise de côté
      }
      inFlightId = null;
      await persist();
    }
    return sent;
  }

  /** Envoie tout ce qui est en attente. Un seul envoi à la fois. */
  function flush() {
    if (!flushing) {
      flushing = run().finally(() => { flushing = null; });
    }
    return flushing;
  }

  async function list() {
    await load();
    return ops.slice();
  }

  async function retryFailed() {
    await load();
    ops.forEach((o) => { if (o.status === 'failed') { o.status = 'pending'; o.lastError = null; } });
    await persist();
    return flush();
  }

  async function discard(id) {
    await load();
    ops = ops.filter((o) => o.id !== id || o.id === inFlightId);
    await persist();
  }

  async function clear() {
    ops = [];
    await persist();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { enqueue, flush, list, retryFailed, discard, clear, subscribe, isFlushing: () => Boolean(flushing) };
}
