// Adresse du backend (rapports, import de plans, notifications).
// Un seul endroit : EXPO_PUBLIC_API_URL permet de viser un autre environnement.
const fromEnv = process.env.EXPO_PUBLIC_API_URL;
export const BACKEND_URL = (fromEnv && !fromEnv.includes('localhost')
  ? fromEnv
  : 'https://zaynbackend-production.up.railway.app').replace(/\/+$/, '');
