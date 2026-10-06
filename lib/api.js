import { supabase } from './supabase';

// En-tête d'authentification pour le backend (Railway) et les routes /api du site.
// Ces routes exigent le jeton de session Supabase de l'utilisateur connecté.
export async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ...extra };
  return { ...extra, Authorization: `Bearer ${session.access_token}` };
}
