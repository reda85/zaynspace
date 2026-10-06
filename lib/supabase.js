import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';


// Sans délai maximal, une requête sur un réseau de chantier instable peut rester
// bloquée plus d'une minute. Au-delà du délai, elle échoue comme une coupure
// réseau et la modification part en file d'attente.
const REQUEST_TIMEOUT_MS = 30000;      // lectures / écritures de données
const TRANSFER_TIMEOUT_MS = 600000;    // envoi et téléchargement de fichiers

function fetchWithTimeout(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  const limit = url.includes('/storage/v1/') ? TRANSFER_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), limit);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
export const STORAGE_BUCKET = 'documents';
// ── Helpers ───────────────────────────────────────────────────
function storagePath(userId, documentId, fileName) {
  return `${userId}/${documentId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}


function sanitizeFileName(name) {
  // replace accent combining chars (U+0300 to U+036F)
  const accentRe = new RegExp('[\u0300-\u036f]', 'g');
  const spaceRe = /[ ]+/g;
  const specialRe = /[^\w.\-]/g;
  return name
    .normalize('NFD')
    .replace(accentRe, '')
    .replace(spaceRe, '_')
    .replace(specialRe, '_');
}

async function getSHA256(uri) {
  const data = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
}

// ── Notification helper ───────────────────────────────────────
// ⚠️  Change to your Express server URL
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function notifyBackend(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`${API_BASE}/api/documents/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[notify] failed', err);
  }
}

// ── Folder service ────────────────────────────────────────────
export const folderService = {
  async listByProject(projectId) {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('project_id', projectId)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  async create({ project_id, parent_id = null, name }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('folders')
      .insert({ project_id, parent_id, name, created_by: user?.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async rename(id, name) {
    const { data, error } = await supabase
      .from('folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('folders').delete().eq('id', id);
    if (error) throw error;
  },

  buildTree(folders, parentId = null) {
    return folders
      .filter((f) => (f.parent_id ?? null) === parentId)
      .map((f) => ({ ...f, children: folderService.buildTree(folders, f.id) }));
  },
};

// ── Document service ──────────────────────────────────────────
export const documentService = {
  async listByProject(projectId, folderId) {
    let query = supabase
      .from('documents')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    if (folderId === null)           query = query.is('folder_id', null);
    else if (folderId !== undefined) query = query.eq('folder_id', folderId);

    const { data: docs, error } = await query;
    if (error) throw error;
    if (!docs?.length) return [];

    // Fetch current versions in one round-trip, join client-side
    // (avoids relying on FK constraint name which may not exist yet)
    const versionIds = docs.map(d => d.current_version_id).filter(Boolean);
    let versionsMap = {};
    if (versionIds.length) {
      const { data: versions } = await supabase
        .from('document_versions')
        .select('*')
        .in('id', versionIds);
      (versions ?? []).forEach(v => { versionsMap[v.id] = v; });
    }

    return docs.map(d => ({
      ...d,
      current_version: versionsMap[d.current_version_id] ?? null,
    }));
  },

  async getWithVersions(documentId) {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    if (error) throw error;

    const { data: versions } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    const allVersions = versions ?? [];
    const current = allVersions.find(v => v.id === doc.current_version_id) ?? allVersions[0] ?? null;

    return { ...doc, current_version: current, versions: allVersions };
  },

  async create({ fileUri, fileName, mimeType, projectId, folderId = null, description, changeNotes, onProgress }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Document row
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        project_id: projectId,
        folder_id: folderId,
        name: fileName,
        description: description ?? null,
        mime_type: mimeType,
        created_by: user.id,
      })
      .select()
      .single();
    if (docErr) throw docErr;

    // 2. Upload file
    const path = storagePath(user.id, doc.id, fileName);
    onProgress?.(10);

    const fileData = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });
    onProgress?.(40);

    const byteArray = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, byteArray, { contentType: mimeType, upsert: false });
    if (storageErr) throw storageErr;
    onProgress?.(75);

    // 3. Checksum + size
    const info = await FileSystem.getInfoAsync(fileUri, { size: true });
    const checksum = await getSHA256(fileUri);
    onProgress?.(85);

    // 4. Version row
    const { data: version, error: verErr } = await supabase
      .from('document_versions')
      .insert({
        document_id: doc.id,
        version_number: 1,
        storage_path: path,
        file_size: info?.size ?? null,
        checksum,
        change_notes: changeNotes ?? 'Initial upload',
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (verErr) throw verErr;

    // 5. Point to current version
    const { data: updated, error: updateErr } = await supabase
      .from('documents')
      .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    onProgress?.(100);

    // 🔔 Notify (non-blocking)
    notifyBackend({ event: 'document.uploaded', projectId, documentId: doc.id, documentName: fileName });

    return { ...updated, current_version: version };
  },

  async uploadNewVersion({ documentId, fileUri, fileName, mimeType, changeNotes, onProgress }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: latest, error: latestErr } = await supabase
      .from('document_versions')
      .select('version_number')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();
    if (latestErr) throw latestErr;

    const nextVersion = latest.version_number + 1;
    const path = storagePath(user.id, documentId, fileName);

    onProgress?.(10);
    const fileData = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });
    onProgress?.(40);

    const byteArray = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, byteArray, { contentType: mimeType, upsert: false });
    if (storageErr) throw storageErr;
    onProgress?.(75);

    const info = await FileSystem.getInfoAsync(fileUri, { size: true });
    const checksum = await getSHA256(fileUri);

    const { data: version, error: verErr } = await supabase
      .from('document_versions')
      .insert({
        document_id: documentId,
        version_number: nextVersion,
        storage_path: path,
        file_size: info?.size ?? null,
        checksum,
        change_notes: changeNotes ?? `Version ${nextVersion}`,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (verErr) throw verErr;

    const { data: docRow } = await supabase
      .from('documents')
      .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .select('project_id, name')
      .single();

    onProgress?.(100);

    if (docRow) {
      notifyBackend({
        event: 'document.versioned',
        projectId: docRow.project_id,
        documentId,
        documentName: docRow.name,
        versionNumber: nextVersion,
      });
    }

    return version;
  },

  async getDownloadUrl(path) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async move(documentId, folderId) {
    const { error } = await supabase
      .from('documents')
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('id', documentId);
    if (error) throw error;
  },

  async remove(documentId) {
    const { data: versions } = await supabase
      .from('document_versions')
      .select('storage_path')
      .eq('document_id', documentId);

    if (versions?.length) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(versions.map((v) => v.storage_path));
    }

    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) throw error;
  },

   async restoreVersion(documentId, versionId) {
    const { data, error } = await supabase
      .from('documents')
      .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};