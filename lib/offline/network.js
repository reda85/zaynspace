// État du réseau partagé hors de React (file d'attente, cache, client Supabase).
// Mis à jour par components/NetworkListener.
let online = true;
const listeners = new Set();

export const isOnline = () => online;

export function setOnline(value) {
  const next = Boolean(value);
  if (next === online) return;
  online = next;
  listeners.forEach((fn) => { try { fn(online); } catch { /* listener */ } });
}

export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
