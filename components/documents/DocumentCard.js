/**
 * components/documents/DocumentCard.js
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FileIcon, formatBytes, formatDate } from './UIComponents';

// ── DocumentCard ──────────────────────────────────────────────
// Grouped cards use same pattern as TaskListItem sections:
// first card = top radius, last card = bottom radius, middle = no shadow
export function DocumentCard({ document, onPress, onUploadVersion, onDelete, isFirst, isLast }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const version = document.current_version;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={() => setMenuOpen(true)}
      activeOpacity={0.7}
      style={[
        styles.card,
        isFirst  && styles.cardTopRadius,
        isLast   && styles.cardBottomRadius,
        !isFirst && styles.cardNoShadow,
        !isLast  && styles.cardBorderBottom,
      ]}
    >
      <FileIcon mimeType={document.mime_type} size={42} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{document.name}</Text>
        {document.description
          ? <Text style={styles.desc} numberOfLines={1}>{document.description}</Text>
          : null}
        <Text style={styles.meta}>
          {formatBytes(version?.file_size)} · {formatDate(document.updated_at)}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{version?.version_number ?? 1}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setMenuOpen(v => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-vertical" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={styles.contextMenu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { setMenuOpen(false); onUploadVersion(document); }}
          >
            <Feather name="upload-cloud" size={16} color={Colors.primary} />
            <Text style={styles.menuItemText}>Nouvelle version</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuOpen(false);
              Alert.alert(
                'Supprimer le document',
                `Supprimer "${document.name}" et toutes ses versions ?`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(document.id) },
                ],
              );
            }}
          >
            <Feather name="trash-2" size={16} color={Colors.error} />
            <Text style={[styles.menuItemText, { color: Colors.error }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── FolderCard ────────────────────────────────────────────────
export function FolderCard({ folder, onPress, onRename, onDelete, isFirst, isLast }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRename = () => {
    setMenuOpen(false);
    Alert.prompt(
      'Renommer le dossier', '',
      (name) => { if (name?.trim()) onRename(folder.id, name.trim()); },
      'plain-text', folder.name,
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={() => setMenuOpen(true)}
      activeOpacity={0.7}
      style={[
        styles.card,
        isFirst  && styles.cardTopRadius,
        isLast   && styles.cardBottomRadius,
        !isFirst && styles.cardNoShadow,
        !isLast  && styles.cardBorderBottom,
      ]}
    >
      <View style={styles.folderIconWrap}>
        <Feather name="folder" size={22} color={Colors.primary} />
      </View>
      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
      <TouchableOpacity
        onPress={() => setMenuOpen(v => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="more-vertical" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {menuOpen && (
        <View style={styles.contextMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={handleRename}>
            <Feather name="edit-2" size={16} color={Colors.primary} />
            <Text style={styles.menuItemText}>Renommer</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuOpen(false);
              Alert.alert(
                'Supprimer le dossier',
                `Supprimer "${folder.name}" ? Les documents seront déplacés à la racine.`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(folder.id) },
                ],
              );
            }}
          >
            <Feather name="trash-2" size={16} color={Colors.error} />
            <Text style={[styles.menuItemText, { color: Colors.error }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Card — same shadow/grouping pattern as listCardWrapper in TasksScreen
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 2, height: 2 },
    shadowRadius: 6,
    elevation: 0,
    overflow: 'visible',
    marginBottom: 1,
  },
  cardTopRadius:    { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardBottomRadius: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, marginBottom: 16 },
  cardNoShadow:     { shadowOpacity: 0, elevation: 0 },
  cardBorderBottom: { borderBottomWidth: 1, borderBottomColor: Colors.border },

  body: { flex: 1, gap: 3 },
  name: { color: Colors.text, fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  desc: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Outfit_400Regular' },
  meta: { color: Colors.textDim, fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2 },

  right: { alignItems: 'flex-end', gap: 8 },
  versionBadge: {
    backgroundColor: Colors.primaryMid,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  versionText: { color: Colors.primary, fontSize: 11, fontFamily: 'Outfit_600SemiBold' },

  // Context menu — same style as your sort/filter bottom sheet items
  contextMenu: {
    position: 'absolute', right: 40, top: 10, zIndex: 100,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    minWidth: 200, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  menuItemText: { color: Colors.text, fontSize: 14, fontFamily: 'Outfit_400Regular' },
  menuDivider: { height: 1, backgroundColor: Colors.border },

  folderIconWrap: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: Colors.primaryMid,
    alignItems: 'center', justifyContent: 'center',
  },
  folderName: { flex: 1, color: Colors.text, fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
});