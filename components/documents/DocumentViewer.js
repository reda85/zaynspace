/**
 * components/documents/DocumentViewer.js
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { documentService } from '../../lib/supabase';
import { Colors, FileIcon, formatBytes, formatDate } from './UIComponents';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function DocumentViewer({ document, visible, onClose, onUploadVersion, onVersionRestored }) {
  const [tab, setTab] = useState('preview');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [docWithVersions, setDocWithVersions] = useState(document);
  // Which version is being previewed (defaults to current)
  const [previewVersion, setPreviewVersion] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setTab('preview');
    setPreviewVersion(null);
    loadPreview(document.current_version);
    loadVersions();
  }, [visible, document.id]);

  async function loadPreview(version) {
    const v = version ?? document.current_version;
    if (!v) return;
    setLoadingUrl(true);
    try {
      const url = await documentService.getDownloadUrl(v.storage_path);
      setPreviewUrl(url);
    } catch (e) {
      console.error('Preview error', e);
    } finally {
      setLoadingUrl(false);
    }
  }

  async function loadVersions() {
    try {
      const full = await documentService.getWithVersions(document.id);
      setDocWithVersions(full);
    } catch (e) {
      console.error('Versions error', e);
    }
  }

  async function handleRestore(version) {
    setRestoringId(version.id);
    try {
      await documentService.restoreVersion(document.id, version.id);
      // Refresh versions list to reflect new current
      const full = await documentService.getWithVersions(document.id);
      setDocWithVersions(full);
      onVersionRestored?.(document.id, version.id);
    } catch (e) {
      console.error('Restore error', e);
    } finally {
      setRestoringId(null);
    }
  }

  function handlePreviewVersion(version) {
    setPreviewVersion(version);
    setTab('preview');
    loadPreview(version);
  }

  const activeVersionId = previewVersion?.id ?? document.current_version_id;
  const isPDF = document.mime_type === 'application/pdf';
  const isImage = document.mime_type.startsWith('image/');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color={Colors.textSub} />
          </TouchableOpacity>

          <View style={styles.headerMid}>
            <Text style={styles.headerName} numberOfLines={1}>{document.name}</Text>
            <Text style={styles.headerMeta}>
              v{document.current_version?.version_number ?? 1} · {formatBytes(document.current_version?.file_size)}
            </Text>
          </View>

          <TouchableOpacity style={styles.versionBtn} onPress={onUploadVersion}>
            <Feather name="upload-cloud" size={14} color={Colors.primary} />
            <Text style={styles.versionBtnText}>Version</Text>
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={styles.tabRow}>
          {[
            { id: 'preview',  label: previewVersion ? `Aperçu v${previewVersion.version_number}` : 'Aperçu' },
            { id: 'versions', label: `Versions (${docWithVersions.versions?.length ?? 1})` },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tab, tab === t.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'preview'
          ? <PreviewPanel previewUrl={previewUrl} loading={loadingUrl} isPDF={isPDF} isImage={isImage} mimeType={document.mime_type} documentName={document.name} />
          : <VersionsPanel
              versions={docWithVersions.versions ?? []}
              currentVersionId={docWithVersions.current_version_id ?? document.current_version_id}
              restoringId={restoringId}
              onPreview={handlePreviewVersion}
              onRestore={handleRestore}
            />
        }
      </View>
    </Modal>
  );
}

// ── PreviewPanel ──────────────────────────────────────────────
function PreviewPanel({ previewUrl, loading, isPDF, isImage, mimeType, documentName }) {
  if (loading || !previewUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    );
  }

  if (isImage) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.imageContainer}>
        <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
      </ScrollView>
    );
  }

  if (isPDF) {
    const url = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewUrl)}`;
    return (
      <WebView
        source={{ uri: url }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      />
    );
  }

  return (
    <View style={styles.officeContainer}>
      <FileIcon mimeType={mimeType} size={64} />
      <Text style={styles.officeTitle}>{documentName}</Text>
      <Text style={styles.officeSubtitle}>Aperçu non disponible pour ce type de fichier.</Text>
      <TouchableOpacity style={styles.openBtn} onPress={() => Linking.openURL(previewUrl)}>
        <Feather name="external-link" size={16} color="#fff" />
        <Text style={styles.openBtnText}>Ouvrir dans le navigateur</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── VersionsPanel ─────────────────────────────────────────────
function VersionsPanel({ versions, currentVersionId, restoringId, onPreview, onRestore }) {
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
  const isCurrent = (v) => v.id === currentVersionId;
  const isRestoring = (v) => restoringId === v.id;

  return (
    <ScrollView contentContainerStyle={styles.versionsList}>
      {sorted.map((v, i) => (
        <View key={v.id} style={styles.versionRow}>
          {/* Timeline */}
          <View style={styles.timeline}>
            <View style={[styles.dot, isCurrent(v) && styles.dotActive]} />
            {i < sorted.length - 1 && <View style={styles.line} />}
          </View>

          {/* Card */}
          <View style={[styles.versionCard, isCurrent(v) && styles.versionCardActive]}>
            {/* Header row */}
            <View style={styles.versionCardHeader}>
              <Text style={styles.versionNumber}>v{v.version_number}</Text>
              {isCurrent(v) && (
                <View style={styles.currentTag}>
                  <Text style={styles.currentTagText}>Actuelle</Text>
                </View>
              )}
              <Text style={styles.versionDate}>{formatDate(v.created_at)}</Text>
            </View>

            {v.change_notes
              ? <Text style={styles.versionNotes}>{v.change_notes}</Text>
              : null}
            <Text style={styles.versionSize}>{formatBytes(v.file_size)}</Text>

            {/* Actions */}
            <View style={styles.versionActions}>
              {/* Preview this version */}
              <TouchableOpacity
                style={styles.versionActionBtn}
                onPress={() => onPreview(v)}
              >
                <Feather name="eye" size={13} color={Colors.primary} />
                <Text style={styles.versionActionText}>Aperçu</Text>
              </TouchableOpacity>

              {/* Restore — only for non-current versions */}
              {!isCurrent(v) && (
                <TouchableOpacity
                  style={[styles.versionActionBtn, styles.versionRestoreBtn]}
                  onPress={() => onRestore(v)}
                  disabled={!!restoringId}
                >
                  {isRestoring(v) ? (
                    <ActivityIndicator size={12} color={Colors.primary} />
                  ) : (
                    <Feather name="rotate-ccw" size={13} color={Colors.primary} />
                  )}
                  <Text style={styles.versionActionText}>
                    {isRestoring(v) ? 'Restauration…' : 'Restaurer'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 12,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
  },
  headerMid: { flex: 1 },
  headerName: { color: Colors.text, fontSize: 16, fontFamily: 'Outfit_700Bold' },
  headerMeta: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  versionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryMid,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  versionBtnText: { color: Colors.primary, fontSize: 13, fontFamily: 'Outfit_600SemiBold' },

  // Tabs — sortItem style
  tabRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 8, backgroundColor: Colors.bg,
  },
  tabActive: {
    backgroundColor: Colors.primaryMid,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  tabText: { color: Colors.textMuted, fontSize: 14, fontFamily: 'Outfit_400Regular' },
  tabTextActive: { color: Colors.primary, fontFamily: 'Outfit_600SemiBold' },

  // Preview states
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textMuted, fontSize: 14, fontFamily: 'Outfit_400Regular' },
  imageContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  previewImage: { width: SCREEN_W - 32, height: SCREEN_H * 0.65 },
  officeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  officeTitle: { color: Colors.text, fontSize: 18, fontFamily: 'Outfit_700Bold', textAlign: 'center' },
  officeSubtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: 'Outfit_400Regular', textAlign: 'center' },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  openBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },

  // Versions
  versionsList: { padding: 16, paddingBottom: 40 },
  versionRow: { flexDirection: 'row', marginBottom: 4 },
  timeline: { width: 28, alignItems: 'center' },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.border, marginTop: 6,
  },
  dotActive: { backgroundColor: Colors.primary },
  line: { flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 4 },
  versionCard: {
    flex: 1, marginLeft: 10, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
  },
  versionCardActive: {
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryLight,
  },
  versionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  versionNumber: { color: Colors.text, fontSize: 15, fontFamily: 'Outfit_700Bold' },
  currentTag: {
    backgroundColor: Colors.primaryMid, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  currentTagText: { color: Colors.primary, fontSize: 10, fontFamily: 'Outfit_600SemiBold' },
  versionDate: { color: Colors.textDim, fontSize: 12, fontFamily: 'Outfit_400Regular', marginLeft: 'auto' },
  versionNotes: { color: Colors.textSub, fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 18, marginBottom: 6 },
  versionSize: { color: Colors.textDim, fontSize: 12, fontFamily: 'Outfit_400Regular' },

  versionActions: {
    flexDirection: 'row', gap: 8, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  versionActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: Colors.primaryMid, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  versionRestoreBtn: {
    backgroundColor: Colors.primaryLight,
  },
  versionActionText: {
    color: Colors.primary, fontSize: 12, fontFamily: 'Outfit_600SemiBold',
  },
});