// Distingue « pas de réseau / serveur momentanément indisponible » (on réessaiera)
// d'un refus du serveur (réessayer ne changera rien).
export function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message ?? err ?? '');
  if (err.name === 'AuthRetryableFetchError' || err.name === 'AbortError') return true;

  const status = Number(err.status ?? err.statusCode);
  if (Number.isFinite(status) && status > 0) {
    // 408 délai dépassé, 429 trop de requêtes, 5xx serveur : transitoire.
    return status === 408 || status === 429 || status >= 500;
  }
  // Erreur PostgREST / Postgres : réponse du serveur. Quelques codes désignent
  // pourtant un incident passager (base injoignable, délai dépassé, jeton à
  // renouveler, ressources saturées) : on réessaiera.
  const code = err.code ? String(err.code) : '';
  if (/^(PGRST00[0-3]|PGRST30[1-3]|57014|57P0[1-3]|40001|40P01)$/.test(code) || /^(08|53)[0-9A-Z]{3}$/.test(code)) return true;
  if (/^(PGRST\d+|[0-9A-Z]{5})$/.test(code)) return false;

  return /network request failed|failed to fetch|network error|networkerror|timed? ?out|aborted|offline|ENOTFOUND|ECONN|EAI_AGAIN|socket|connection (lost|reset|closed)|load failed/i.test(msg);
}

export class OfflineError extends Error {
  constructor(message = 'Hors ligne') {
    super(message);
    this.name = 'OfflineError';
    this.offline = true;
  }
}
