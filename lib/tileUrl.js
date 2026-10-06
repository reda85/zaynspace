import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const USE_BACKEND = API_URL && !API_URL.includes('localhost');

/** Adresse distante d'une tuile de plan (backend si configuré, sinon stockage). */
export function remoteTileUrl({ planId, tilesPath }, level, col, row) {
  if (USE_BACKEND) return `${API_URL}/api/tiles/${planId}/${level}/${col}_${row}.jpeg`;
  const storagePath = `${tilesPath}_files/${level}/${col}_${row}.jpeg`;
  return supabase.storage.from('project-plans').getPublicUrl(storagePath).data.publicUrl;
}
