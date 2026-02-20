/**
 * screens/documents.js
 *
 * Lit le projet actif directement depuis selectedProjectAtom,
 * exactement comme TasksScreen et les autres onglets.
 */
import { Feather } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { ArrowDownNarrowWideIcon, FileText, FolderOpen, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View
} from 'react-native';
import { DocumentCard, FolderCard } from '../../components/documents/DocumentCard';
import { DocumentViewer } from '../../components/documents/DocumentViewer';
import { Colors, SectionHeader, UploadProgressBar } from '../../components/documents/UIComponents';
import { UploadSheet } from '../../components/documents/UploadSheet';
import { useDocuments, useFolders } from '../../hooks/useDocumentManager';
import { selectedProjectAtom } from '../../store/atoms';

// ─── Champs de tri ────────────────────────────────────────────
const SORT_FIELDS = [
  { key: 'name',       label: 'Nom',              isDate: false },
  { key: 'updated_at', label: 'Date de mise à jour', isDate: true },
  { key: 'created_at', label: 'Date de création',  isDate: true },
  { key: 'mime_type',  label: 'Type de fichier',   isDate: false },
];

function getSorted(docs, field, dir) {
  return [...docs].sort((a, b) => {
    const f = SORT_FIELDS.find(s => s.key === field);
    let va, vb;
    if (f?.isDate) {
      va = a[field] ? new Date(a[field]).getTime() : 0;
      vb = b[field] ? new Date(b[field]).getTime() : 0;
    } else {
      va = (a[field] || '').toLowerCase();
      vb = (b[field] || '').toLowerCase();
    }
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    const cmp = va > vb ? 1 : va < vb ? -1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
}

export default function DocumentManager() {
  const [project] = useAtom(selectedProjectAtom);
  const projectId = project?.id;
  const navigation = useNavigation();

  const handleOpenSortSheet = useCallback(() => setShowSortSheet(true), []);

  useEffect(() => {
    navigation.setOptions({
      title: 'Documents',
      headerTitleAlign: 'center',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <View style={{
            backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.1,
            shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
          }}>
            <Feather name="arrow-left" size={20} color="#000" />
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 16 }}>
          <TouchableOpacity onPress={handleOpenSortSheet}>
            <View style={{
              backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.1,
              shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
            }}>
              <ArrowDownNarrowWideIcon size={20} color="#000" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setUploadMode('new'); setShowUpload(true); }}>
            <View style={{
              backgroundColor: '#6D28D9', width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.1,
              shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
            }}>
              <Plus size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>
      ),
      headerTitleStyle: {
        fontFamily: 'Outfit_700Bold',
        fontSize: 24,
        color: 'black',
      },
    });
  }, [navigation, handleOpenSortSheet]);
  const [currentFolderId, setCurrentFolderId]     = useState(null);
  const [breadcrumbs, setBreadcrumbs]             = useState([]);
  const [search, setSearch]                       = useState('');

  const [viewerDoc, setViewerDoc]                 = useState(null);
  const [versionTarget, setVersionTarget]         = useState(null);
  const [uploadMode, setUploadMode]               = useState('new');
  const [showUpload, setShowUpload]               = useState(false);

  const [sortField, setSortField]                 = useState('name');
  const [sortDir, setSortDir]                     = useState('asc');
  const [showSortSheet, setShowSortSheet]         = useState(false);

  const [showNewFolder, setShowNewFolder]         = useState(false);
  const [newFolderName, setNewFolderName]         = useState('');

  const { folders, createFolder, renameFolder, deleteFolder } = useFolders(projectId);
  // Current folder documents
  const {
    documents, loading, uploads,
    refresh, uploadDocument, uploadNewVersion, deleteDocument,
  } = useDocuments(projectId, currentFolderId);

  // All project documents — for global search across all folders
  const { documents: allDocuments } = useDocuments(projectId, undefined);

  const subfolders = folders.filter(f => (f.parent_id ?? null) === currentFolderId);

  const filteredDocs = getSorted(
    search
      ? allDocuments.filter(d =>
          d.name?.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase())
        )
      : documents,
    sortField,
    sortDir,
  );

  const openFolder = useCallback((folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const goToBreadcrumb = useCallback((id) => {
    if (id === null) {
      setBreadcrumbs([]);
      setCurrentFolderId(null);
    } else {
      setBreadcrumbs(prev => {
        const idx = prev.findIndex(b => b.id === id);
        return prev.slice(0, idx + 1);
      });
      setCurrentFolderId(id);
    }
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName(''); setShowNewFolder(false);
  };

  const handleUpload = async (params) => {
    if (uploadMode === 'new') await uploadDocument(params);
    else if (versionTarget) await uploadNewVersion(versionTarget.id, params);
  };

  const openVersionUpload = (doc) => {
    setVersionTarget(doc); setUploadMode('version'); setShowUpload(true);
  };

  // ── Sort bottom sheet (identique à SortBottomSheet de TasksScreen) ──
  const SortSheet = () => (
    <Modal
      animationType="slide" transparent visible={showSortSheet}
      onRequestClose={() => setShowSortSheet(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Trier les documents par…</Text>
            <TouchableOpacity onPress={() => setShowSortSheet(false)}>
              <Feather name="x" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {SORT_FIELDS.map(field => (
              <View key={field.key} style={{ marginBottom: 10 }}>
                <Text style={styles.sortFieldTitle}>{field.label}</Text>
                {[
                  { dir: 'asc',  label: field.isDate ? 'Du plus ancien au plus récent' : 'A → Z' },
                  { dir: 'desc', label: field.isDate ? 'Du plus récent au plus ancien' : 'Z → A' },
                ].map(opt => {
                  const isActive = sortField === field.key && sortDir === opt.dir;
                  return (
                    <TouchableOpacity
                      key={opt.dir}
                      style={[styles.sortItem, isActive && styles.sortItemActive]}
                      onPress={() => { setSortField(field.key); setSortDir(opt.dir); setShowSortSheet(false); }}
                    >
                      <Text style={styles.sortText}>{opt.label}</Text>
                      {isActive && <Feather name="check" size={18} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (!projectId) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <FolderOpen size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Aucun projet actif</Text>
          <Text style={styles.emptySub}>Sélectionnez un projet pour voir ses documents.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search bar — identique à TasksScreen */}
      <View style={styles.searchBar}>
        <Feather name="search" size={20} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un document"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={18} color={Colors.textDim} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.breadcrumbBar}
          contentContainerStyle={styles.breadcrumbContent}
        >
          <TouchableOpacity onPress={() => goToBreadcrumb(null)}>
            <Text style={styles.breadcrumbItem}>Documents</Text>
          </TouchableOpacity>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.id}>
              <Text style={styles.breadcrumbSep}> › </Text>
              <TouchableOpacity onPress={() => goToBreadcrumb(b.id)}>
                <Text style={[styles.breadcrumbItem, i === breadcrumbs.length - 1 && styles.breadcrumbActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          {uploads.map(u => <UploadProgressBar key={u.fileName} upload={u} />)}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.primary} />}
        >
          {/* Dossiers */}
          {!search && (
            <>
              <View style={styles.sectionRow}>
                <SectionHeader title="Dossiers" count={subfolders.length} />
                <TouchableOpacity onPress={() => setShowNewFolder(v => !v)}>
                  <Text style={styles.newFolderLink}>+ Nouveau</Text>
                </TouchableOpacity>
              </View>

              {showNewFolder && (
                <View style={styles.inlineInput}>
                  <TextInput
                    style={styles.inlineTextInput}
                    value={newFolderName}
                    onChangeText={setNewFolderName}
                    placeholder="Nom du dossier…"
                    placeholderTextColor="#999"
                    autoFocus
                    onSubmitEditing={handleCreateFolder}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.inlineSubmit} onPress={handleCreateFolder}>
                    <Text style={styles.inlineSubmitText}>Créer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowNewFolder(false)}>
                    <Text style={styles.inlineCancel}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Folder group — same shadow/radius pattern as task sections */}
              {subfolders.length > 0 && subfolders.map((f, i) => (
                <FolderCard
                  key={f.id} folder={f}
                  isFirst={i === 0} isLast={i === subfolders.length - 1}
                  onPress={() => openFolder(f)}
                  onRename={renameFolder} onDelete={deleteFolder}
                />
              ))}

              {subfolders.length === 0 && !showNewFolder && (
                <Text style={styles.emptyHint}>Aucun dossier</Text>
              )}

              <View style={styles.sectionRow}>
                <SectionHeader title="Documents" count={filteredDocs.length} />
              </View>
            </>
          )}

          {/* Documents group */}
          {filteredDocs.length === 0 ? (
            <View style={styles.empty}>
              <FileText size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>{search ? 'Aucun résultat' : 'Aucun document'}</Text>
              <Text style={styles.emptySub}>
                {search ? `Aucun document ne correspond à "${search}"` : 'Uploadez votre premier document pour ce projet'}
              </Text>
              {!search && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setUploadMode('new'); setShowUpload(true); }}>
                  <Text style={styles.emptyBtnText}>Ajouter un document</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredDocs.map((doc, i) => (
              <DocumentCard
                key={doc.id} document={doc}
                isFirst={i === 0} isLast={i === filteredDocs.length - 1}
                onPress={() => setViewerDoc(doc)}
                onUploadVersion={openVersionUpload}
                onDelete={deleteDocument}
              />
            ))
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Viewer modal */}
      {viewerDoc && (
        <DocumentViewer
          document={viewerDoc} visible={!!viewerDoc}
          onClose={() => setViewerDoc(null)}
          onUploadVersion={() => { const d = viewerDoc; setViewerDoc(null); openVersionUpload(d); }}
          onVersionRestored={() => refresh()}
        />
      )}

      {/* Upload sheet */}
      <UploadSheet
        visible={showUpload} mode={uploadMode}
        documentName={versionTarget?.name}
        onClose={() => { setShowUpload(false); setVersionTarget(null); }}
        onSubmit={handleUpload}
      />

      <SortSheet />


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 16 },

  // Search bar — identique à TasksScreen
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 8,
    paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: {
    flex: 1, paddingVertical: 10,
    fontFamily: 'Outfit_400Regular', color: Colors.text,
  },

  // Breadcrumb
  breadcrumbBar: { maxHeight: 36, marginBottom: 6 },
  breadcrumbContent: { alignItems: 'center' },
  breadcrumbItem: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  breadcrumbActive: { color: Colors.text },
  breadcrumbSep: { color: Colors.textDim, fontSize: 13 },

  scrollContent: { paddingBottom: 24 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  newFolderLink: { color: Colors.primary, fontSize: 13, fontFamily: 'Outfit_600SemiBold', paddingVertical: 16 },
  // Empty states — identiques à DiscussionsScreen
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: '#111827', marginTop: 16 },
  emptySub: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 24, backgroundColor: '#6D28D9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  emptyBtnText: { color: '#FFF', fontFamily: 'Outfit_600SemiBold', fontSize: 15 },

  emptyHint: { color: '#6B7280', fontSize: 16, fontFamily: 'Outfit_600SemiBold', textAlign: 'center', paddingVertical: 16 },

  // Inline folder creation
  inlineInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 8,
    padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  inlineTextInput: {
    flex: 1, color: Colors.text, fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    backgroundColor: Colors.bg, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  inlineSubmit: { backgroundColor: Colors.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  inlineSubmitText: { color: '#fff', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },
  inlineCancel: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Outfit_400Regular' },

  // Sort bottom sheet — identique à bottomSheet de TasksScreen
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20,
    maxHeight: '70%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sheetTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },
  sortFieldTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginTop: 15, marginBottom: 5 },
  sortItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: '#f9fafb', marginTop: 5,
  },
  sortItemActive: { backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd' },
  sortText: { fontSize: 15, color: '#333', fontFamily: 'Outfit_400Regular', marginLeft: 5 },


});