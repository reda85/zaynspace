import { BACKEND_URL } from './backendUrl';
import { supabase } from './supabase';

export { BACKEND_URL };

// En-tête d'authentification pour le backend (Railway) et les routes /api du site.
// Ces routes exigent le jeton de session Supabase de l'utilisateur connecté.
export async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ...extra };
  return { ...extra, Authorization: `Bearer ${session.access_token}` };
}

/** Appel au backend avec le jeton de l'utilisateur. `path` commence par « / ». */
export async function backendFetch(path, init = {}) {
  const headers = await authHeaders(init.headers ?? {});
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorMessage(response) {
  const text = await response.text().catch(() => '');
  try {
    return JSON.parse(text).error || text;
  } catch {
    return text;
  }
}

/**
 * Demande un rapport au backend et renvoie { downloadUrl, fileName, fileSize }.
 *
 * La génération tourne en arrière-plan côté serveur : on reçoit un identifiant
 * de travail, puis on interroge son état. Une requête unique de plusieurs
 * minutes ne tenait pas sur un réseau mobile.
 *
 * Reste compatible avec un backend plus ancien, qui répond directement avec le
 * lien : `fallbackGet` est l'adresse GET à utiliser s'il ne connaît pas le POST.
 */
export async function requestReport(path, body, { fallbackGet = null, onStatus, timeoutMs = 15 * 60 * 1000 } = {}) {
  let response = await backendFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, async: true }),
  });
  if (response.status === 404 && fallbackGet) {
    response = await backendFetch(fallbackGet, { headers: { Accept: 'application/json' } });
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${String(await errorMessage(response)).slice(0, 200)}`);
  }

  let payload = await response.json();
  if (payload.downloadUrl) return payload;            // réponse directe
  if (!payload.jobId) throw new Error('Réponse inattendue du serveur');

  const deadline = Date.now() + timeoutMs;
  let failures = 0;
  while (Date.now() < deadline) {
    await sleep(3000);
    let poll;
    try {
      poll = await backendFetch(`/api/report/jobs/${payload.jobId}`, { headers: { Accept: 'application/json' } });
    } catch (err) {
      // Coupure passagère : le rapport continue côté serveur, on réessaie.
      if (++failures > 20) throw err;
      continue;
    }
    if (poll.status === 404) throw new Error('Le rapport a été interrompu côté serveur. Relancez la génération.');
    if (!poll.ok) {
      if (++failures > 20) throw new Error(`${poll.status} ${String(await errorMessage(poll)).slice(0, 200)}`);
      continue;
    }
    failures = 0;
    payload = await poll.json();
    onStatus?.(payload.status);
    if (payload.status === 'done') return payload;
    if (payload.status === 'failed') throw new Error(payload.error || 'La génération du rapport a échoué');
  }
  throw new Error('La génération du rapport prend trop de temps. Réessayez avec moins d\'éléments.');
}
