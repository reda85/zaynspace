/**
 * components/documents/UIComponents.js
 */
import { StyleSheet, Text, View } from 'react-native';

// ── Design tokens ─────────────────────────────────────────────
export const Colors = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceInput: '#F9FAFB',
  border: '#E5E7EB',
  primary: '#111827',          // était #6D28D9 (violet) → noir
  primaryLight: '#F3F4F6',     // était #F3E8FF (violet clair) → gris clair
  primaryMid: '#F3F4F6',       // était #EDE9FE → gris clair
  primaryBorder: '#D1D5DB',    // était #C4B5FD → gris
  success: '#10B981',
  successLight: '#D1FAE5',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  text: '#111827',
  textSub: '#374151',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  pdf: '#EF4444',
  image: '#8B5CF6',
  office: '#3B82F6',
  unknown: '#6B7280',
};
// ── Helpers ───────────────────────────────────────────────────
export function fileTypeFromMime(mime) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (
    mime.includes('word') || mime.includes('excel') ||
    mime.includes('spreadsheet') || mime.includes('presentation') ||
    mime.includes('powerpoint') || mime.includes('officedocument')
  ) return 'office';
  return 'unknown';
}

export function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── FileIcon ──────────────────────────────────────────────────
export function FileIcon({ mimeType, size = 40 }) {
  const type = fileTypeFromMime(mimeType);
  const map = {
    pdf:     { label: 'PDF', color: Colors.pdf,     bg: '#FEE2E2' },
    image:   { label: 'IMG', color: Colors.image,   bg: '#EDE9FE' },
    office:  { label: 'DOC', color: Colors.office,  bg: '#DBEAFE' },
    unknown: { label: 'FIC', color: Colors.unknown, bg: '#F3F4F6' },
  };
  const { label, color, bg } = map[type];
  return (
    <View style={[styles.fileIcon, { width: size, height: size, backgroundColor: bg, borderRadius: size * 0.2 }]}>
      <Text style={[styles.fileIconLabel, { color, fontSize: size * 0.26 }]}>{label}</Text>
    </View>
  );
}

// ── UploadProgressBar ─────────────────────────────────────────
export function UploadProgressBar({ upload }) {
  const color =
    upload.status === 'error' ? Colors.error :
    upload.status === 'done'  ? Colors.success :
    Colors.primary;
  return (
    <View style={styles.uploadRow}>
      <View style={styles.uploadInfo}>
        <Text style={styles.uploadFileName} numberOfLines={1}>{upload.fileName}</Text>
        <Text style={[styles.uploadStatus, { color }]}>
          {upload.status === 'error' ? `Erreur : ${upload.error}` :
           upload.status === 'done'  ? '✓ Terminé' :
           `Upload… ${upload.progress}%`}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${upload.progress}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── SectionHeader — même style que groupDateText de TasksScreen ──
export function SectionHeader({ title, count }) {
  return (
    <View style={styles.sectionHeaderWrapper}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fileIcon: { alignItems: 'center', justifyContent: 'center' },
  fileIconLabel: { fontFamily: 'Outfit_700Bold', letterSpacing: 0.5 },

  uploadRow: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    marginVertical: 4, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
  },
  uploadInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  uploadFileName: { color: Colors.text, fontSize: 13, fontFamily: 'Outfit_600SemiBold', flex: 1, marginRight: 8 },
  uploadStatus: { fontSize: 12, fontFamily: 'Outfit_500Medium' },
  progressTrack: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: Colors.text, fontSize: 17, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
  emptySubtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: 'Outfit_400Regular', textAlign: 'center', lineHeight: 20 },

  sectionHeaderWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: 6, paddingTop: 16, backgroundColor: Colors.bg,
  },
  sectionTitle: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Outfit_600SemiBold', textTransform: 'uppercase' },
  countBadge: { backgroundColor: 'black', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { color: 'white', fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
});