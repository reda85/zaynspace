import { Check, Pencil, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.split(' ').filter(part => part.length > 0);
  if (parts.length === 0) return '??';
  const firstInitial = parts[0][0].toUpperCase();
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
  return `${firstInitial}${lastInitial}`;
};

const Avatar = ({ name }) => {
  const initials = getInitials(name);
  const hash = initials.charCodeAt(0) + initials.charCodeAt(initials.length - 1);
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688'];
  const colorIndex = hash % colors.length;

  return (
    <View style={[styles.avatarContainer, { backgroundColor: colors[colorIndex] }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
};

/**
 * ImageViewerModal
 *
 * Props:
 *   visible           — bool
 *   onClose           — () => void
 *   imageUrl          — string
 *   userName          — string
 *   description       — string
 *   onSaveDescription — (newDescription: string) => Promise<void> | void
 *                       If omitted, edit button is hidden.
 */
export default function ImageViewerModal({ visible, onClose, imageUrl, userName, description, onSaveDescription }) {
  const insets = useSafeAreaInsets();

  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // ── Keyboard listeners — push info panel up without KAV ──────────────────
  useEffect(() => {
    if (!visible) return;

    const show = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      (e) => setKeyboardOffset(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setKeyboardOffset(0)
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  // Sync local state when prop changes
  useEffect(() => {
    setEditedDescription(description || '');
  }, [description]);

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setIsEditing(false);
      setEditedDescription(description || '');
      setKeyboardOffset(0);
    }
  }, [visible]);

  const handleStartEdit = () => {
    setEditedDescription(description || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedDescription(description || '');
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const handleSave = async () => {
    if (!onSaveDescription) return;
    setIsSaving(true);
    try {
      await onSaveDescription(editedDescription.trim());
      setIsEditing(false);
      Keyboard.dismiss();
    } catch (e) {
      console.error('Failed to save description:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const canEdit = !!onSaveDescription;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <View style={styles.container}>

        {/* Close Button */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={onClose}
        >
          <View style={styles.closeButtonCircle}>
            <X size={24} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Full-screen Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/*
         * Info panel — marginBottom shifts it above the keyboard.
         * Same pattern as PinTagEditor / ReportOptionsModal.
         * Works on both iOS and Android without KAV or manifest changes.
         */}
        <View style={[
          styles.infoPanel,
          {
            paddingBottom: insets.bottom + 16,
            marginBottom: keyboardOffset,
          }
        ]}>

          {/* User row + edit button */}
          <View style={styles.userRow}>
            <View style={styles.userInfo}>
              <Avatar name={userName} />
              <Text style={styles.userName}>{userName}</Text>
            </View>

            {canEdit && !isEditing && (
              <TouchableOpacity
                onPress={handleStartEdit}
                style={styles.editButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Pencil size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}

            {canEdit && isEditing && (
              <View style={styles.editActions}>
                <TouchableOpacity
                  onPress={handleCancelEdit}
                  style={styles.editActionBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.editActionBtn, styles.editActionBtnSave]}
                  disabled={isSaving}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Check size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Description — read or edit mode */}
          {isEditing ? (
            <View style={styles.descriptionEditContainer}>
              <TextInput
                style={styles.descriptionInput}
                value={editedDescription}
                onChangeText={setEditedDescription}
                placeholder="Ajouter une description..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                multiline
                autoFocus
                textAlignVertical="top"
              />
            </View>
          ) : (description || editedDescription) ? (
            <View style={styles.descriptionContainer}>
              <Text style={styles.description}>{editedDescription || description}</Text>
            </View>
          ) : canEdit ? (
            <TouchableOpacity onPress={handleStartEdit} style={styles.emptyDescriptionButton}>
              <Pencil size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emptyDescriptionText}>Ajouter une description...</Text>
            </TouchableOpacity>
          ) : null}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.7,
  },
  infoPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingTop: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // ── User row ──────────────────────────────────────────────────────────────
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  userName: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
  },

  // ── Edit controls ─────────────────────────────────────────────────────────
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActionBtnSave: {
    backgroundColor: '#2563eb',
  },

  // ── Description — read mode ───────────────────────────────────────────────
  descriptionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    color: '#fff',
    lineHeight: 22,
  },

  // ── Description — edit mode ───────────────────────────────────────────────
  descriptionEditContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    padding: 12,
    minHeight: 80,
  },
  descriptionInput: {
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    color: '#fff',
    lineHeight: 22,
    minHeight: 60,
  },

  // ── Empty description prompt ──────────────────────────────────────────────
  emptyDescriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  emptyDescriptionText: {
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255,255,255,0.4)',
  },
});