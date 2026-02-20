/**
 * features/documents/hooks/useDocumentManager.js
 */
import { useCallback, useEffect, useState } from 'react';
import { documentService, folderService } from '../lib/supabase';

// ── useFolders ────────────────────────────────────────────────
export function useFolders(projectId) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await folderService.listByProject(projectId);
      setFolders(data);
    } catch (e) {
      console.error('[useFolders]', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createFolder = useCallback(async (name, parentId = null) => {
    if (!projectId) return;
    const f = await folderService.create({ project_id: projectId, parent_id: parentId, name });
    setFolders((prev) => [...prev, f]);
    return f;
  }, [projectId]);

  const renameFolder = useCallback(async (id, name) => {
    const f = await folderService.rename(id, name);
    setFolders((prev) => prev.map((x) => (x.id === id ? f : x)));
  }, []);

  const deleteFolder = useCallback(async (id) => {
    await folderService.remove(id);
    setFolders((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const tree = folderService.buildTree(folders);

  return { folders, tree, loading, refresh, createFolder, renameFolder, deleteFolder };
}

// ── useDocuments ──────────────────────────────────────────────
export function useDocuments(projectId, folderId) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await documentService.listByProject(projectId, folderId);
      setDocuments(data);
    } catch (e) {
      console.error('[useDocuments]', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, folderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const setUploadProgress = (fileName, update) => {
    setUploads((prev) => {
      const idx = prev.findIndex((u) => u.fileName === fileName);
      if (idx === -1) return [...prev, { fileName, progress: 0, status: 'uploading', ...update }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...update };
      return next;
    });
  };

  const uploadDocument = useCallback(async ({ fileUri, fileName, mimeType, description, changeNotes }) => {
    if (!projectId) return;
    setUploadProgress(fileName, { status: 'uploading', progress: 0 });
    try {
      const doc = await documentService.create({
        fileUri, fileName, mimeType, description, changeNotes,
        projectId,
        folderId,
        onProgress: (pct) => setUploadProgress(fileName, { progress: pct }),
      });
      setUploadProgress(fileName, { status: 'done', progress: 100 });
      setDocuments((prev) => [doc, ...prev]);
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.fileName !== fileName)), 2000);
      return doc;
    } catch (e) {
      setUploadProgress(fileName, { status: 'error', error: e.message });
      throw e;
    }
  }, [projectId, folderId]);

  const uploadNewVersion = useCallback(async (documentId, { fileUri, fileName, mimeType, changeNotes }) => {
    setUploadProgress(fileName, { status: 'uploading', progress: 0 });
    try {
      const version = await documentService.uploadNewVersion({
        documentId, fileUri, fileName, mimeType, changeNotes,
        onProgress: (pct) => setUploadProgress(fileName, { progress: pct }),
      });
      setUploadProgress(fileName, { status: 'done', progress: 100 });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId
            ? { ...d, current_version: version, current_version_id: version.id }
            : d,
        ),
      );
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.fileName !== fileName)), 2000);
      return version;
    } catch (e) {
      setUploadProgress(fileName, { status: 'error', error: e.message });
      throw e;
    }
  }, []);

  const deleteDocument = useCallback(async (id) => {
    await documentService.remove(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { documents, loading, uploads, refresh, uploadDocument, uploadNewVersion, deleteDocument };
}