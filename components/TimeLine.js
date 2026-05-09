import dayjs from 'dayjs';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import ImageViewerModal from './ImageViewerModal';

const FIELD_LABELS = {
  name: 'le nom',
  note: 'la note',
  status_id: 'le statut',
  category_id: 'la catégorie',
  assigned_to: "l'assigné",
  due_date: "la date d'échéance",
  x: 'la position X',
  y: 'la position Y',
  tags: 'les tags',
  isArchived: "l'archivage",
  plan_id: 'le plan',
  pdf_name: 'le nom du PDF',
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.split(' ').filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  const first = parts[0][0].toUpperCase();
  const last = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
  return `${first}${last}`;
};

const Avatar = ({ name }) => {
  const initials = getInitials(name);
  const hash = initials.charCodeAt(0) + initials.charCodeAt(initials.length - 1);
  const colors = ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#00bcd4','#009688'];
  return (
    <View style={[styles.avatarContainer, { backgroundColor: colors[hash % colors.length] }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
};

const ModificationDiff = ({ metadata }) => {
  const [expandedFields, setExpandedFields] = useState({});
  if (!metadata || typeof metadata !== 'object') return null;
  const changes = Object.entries(metadata);
  if (changes.length === 0) return null;

  const toggle = (field) =>
    setExpandedFields((prev) => ({ ...prev, [field]: !prev[field] }));

  const formatVal = (val) =>
    val === null || val === undefined || val === '' ? (
      <Text style={styles.diffEmpty}>vide</Text>
    ) : (
      <Text style={styles.diffValue}>"{val}"</Text>
    );

  return (
    <View style={styles.diffBox}>
      {changes.map(([field, { old: oldVal, new: newVal }]) => (
        <View key={field} style={styles.diffRow}>
          <Text style={styles.diffText}>
            A modifié {FIELD_LABELS[field] || field} → {formatVal(newVal)}
          </Text>
          <TouchableOpacity onPress={() => toggle(field)}>
            <Text style={styles.diffToggle}>
              {expandedFields[field] ? '▲ Masquer' : '▼ Valeur précédente'}
            </Text>
          </TouchableOpacity>
          {expandedFields[field] && (
            <View style={styles.diffOldBox}>
              <Text style={styles.diffOldLabel}>Avant : </Text>
              <Text style={styles.diffOldValue}>{oldVal ?? 'vide'}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

export default function Timeline({ events = [], comments = [], showAllEvents = false }) {
  const [selectedImage, setSelectedImage] = useState(null);

  // All items sorted by date ascending
  const allItems = [
    ...events.map((e) => ({ ...e, type: 'event' })),
    ...comments.map((c) => ({ ...c, type: 'comment' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // When showAllEvents is false, hide modification events
  const displayedItems = showAllEvents
    ? allItems
    : allItems.filter((item) => !(item.type === 'event' && item.category === 'modification'));

  const handleImagePress = (photo, userName) =>
    setSelectedImage({
        id: photo.id,           // ← add this
        imageUrl: photo.public_url,
        userName,
        description: photo.description || '',
    });

  const renderItem = (item) => {
    const timestamp = dayjs(item.created_at).format('MMM D, YYYY h:mm A');
    const userName = item?.members?.name || item?.username || 'Utilisateur inconnu';
    const isComment = item.type === 'comment';
    const isModification = item.category === 'modification';

    return (
      <View key={`${item.type}-${item.id}`} style={styles.item}>
        <View style={styles.header}>
          <Avatar name={userName} />
          <View style={styles.textStack}>
            <View style={styles.titleStack}>
              <Text style={styles.user}>{userName}</Text>
              <Text style={styles.title}>
                {isComment
                  ? 'a commenté'
                  : item.category === 'photo_upload'
                  ? 'a ajouté une photo'
                  : item.event}
              </Text>
            </View>
            <Text style={styles.timestamp}>{timestamp}</Text>
          </View>
        </View>

        {isModification && <ModificationDiff metadata={item.metadata} />}

        {isComment && item.comment && (
          <View style={styles.commentBox}>
            <Text style={styles.commentText}>{item.comment}</Text>
          </View>
        )}

        {!isComment && item.pins_photos?.public_url && (
          <TouchableOpacity
            style={styles.imageWrapper}
            onPress={() => handleImagePress(item.pins_photos, userName)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: item.pins_photos.public_url }}
              style={styles.image}
              resizeMode="cover"
            />
            {item.pins_photos.description ? (
              <View style={styles.overlay}>
                <Text style={styles.overlayText} numberOfLines={2}>
                  {item.pins_photos.description}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.list}>
      {displayedItems.length === 0 ? (
        <Text style={styles.noUpdateText}>Aucune mise à jour</Text>
      ) : (
        displayedItems.map(renderItem)
      )}

      {selectedImage && (
        <ImageViewerModal
          visible={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          imageUrl={selectedImage.imageUrl}
          userName={selectedImage.userName}
          description={selectedImage.description}
          onSaveDescription={async (newDesc) => {
    const { error } = await supabase
        .from('pins_photos')
        .update({ description: newDesc })
        .eq('id', selectedImage.id);
    if (!error) {
        // Update local state so the modal and overlay reflect the new description immediately
        setSelectedImage(prev => ({ ...prev, description: newDesc }));
    }
}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginHorizontal: -20,
    paddingTop: 10,
  },
  noUpdateText: { paddingHorizontal: 20, color: '#666', paddingBottom: 20 },
  item: { marginBottom: 16, paddingHorizontal: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  avatarContainer: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: 'white', fontSize: 16, fontFamily: 'Outfit_700Bold' },
  textStack: { flex: 1 },
  titleStack: { flexDirection: 'row', flex: 1, alignItems: 'baseline' },
  user: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginRight: 5 },
  title: { fontSize: 16, fontFamily: 'Outfit_400Regular', color: '#333', flexShrink: 1 },
  timestamp: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#666', marginTop: 1 },

  diffBox: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    padding: 10, marginTop: 6, gap: 8,
  },
  diffRow: { gap: 2 },
  diffText: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#1E40AF' },
  diffValue: { fontFamily: 'Outfit_700Bold', color: '#1E40AF' },
  diffEmpty: { fontFamily: 'Outfit_400Regular', fontStyle: 'italic', color: '#6B7280' },
  diffToggle: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 2 },
  diffOldBox: {
    flexDirection: 'row', backgroundColor: '#F3F4F6',
    borderRadius: 4, padding: 6, marginTop: 4,
  },
  diffOldLabel: { fontSize: 12, fontFamily: 'Outfit_700Bold', color: '#6B7280' },
  diffOldValue: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#6B7280', flexShrink: 1 },

  commentBox: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, marginTop: 8 },
  commentText: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#374151', lineHeight: 20 },

  imageWrapper: {
    position: 'relative', width: '100%', height: 300,
    borderRadius: 8, overflow: 'hidden', backgroundColor: '#eee', marginTop: 8,
  },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute', bottom: 0, width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6,
  },
  overlayText: { color: '#fff', fontSize: 14, fontFamily: 'Outfit_400Regular' },
});