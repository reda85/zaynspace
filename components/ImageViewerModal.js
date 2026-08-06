import { Calendar, Check, Maximize2, Pencil, X } from 'lucide-react-native';
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
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

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

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
 *   date              — string | Date (ISO). Optional; hidden if absent.
 *   onSaveDescription — (newDescription: string) => Promise<void> | void
 *                       If omitted, edit button is hidden.
 */
export default function ImageViewerModal({ visible, onClose, imageUrl, userName, description, date, onSaveDescription }) {
  const insets = useSafeAreaInsets();

  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // ── Zoom / pan shared values ─────────────────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
  };

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(savedScale.value * e.scale, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(setIsZoomed)(scale.value > 1.01);
      }
    });

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onUpdate((e) => {
      // Only move the image around when it's zoomed in
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(setIsZoomed)(true);
      }
    });

  const composedGesture = Gesture.Race(
    doubleTap,
    Gesture.Simultaneous(pinch, pan)
  );

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

  // Reset when modal closes (or image changes)
  useEffect(() => {
    if (!visible) {
      setIsEditing(false);
      setEditedDescription(description || '');
      setKeyboardOffset(0);
    }
    // Always reset zoom on open/close/image change
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUrl]);

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
  const dateLabel = formatDate(date);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <GestureHandlerRootView style={styles.container}>

        {/* Top controls */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={onClose}
        >
          <View style={styles.topCircle}>
            <X size={24} color="#fff" />
          </View>
        </TouchableOpacity>

        {isZoomed && (
          <TouchableOpacity
            style={[styles.resetButton, { top: insets.top + 16 }]}
            onPress={resetZoom}
          >
            <View style={styles.resetPill}>
              <Maximize2 size={15} color="#fff" />
              <Text style={styles.resetText}>Réinitialiser</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Full-screen zoomable image */}
        <View style={styles.imageContainer}>
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.animatedWrap, animatedImageStyle]}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Info panel — marginBottom shifts it above the keyboard */}
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
              <View style={styles.userTextCol}>
                <Text style={styles.userName} numberOfLines={1}>{userName || 'Utilisateur'}</Text>
                {dateLabel && (
                  <View style={styles.dateRow}>
                    <Calendar size={12} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.dateText}>{dateLabel}</Text>
                  </View>
                )}
              </View>
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
      </GestureHandlerRootView>
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
  resetButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  topCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  resetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  resetText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
  },

  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  animatedWrap: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },

  infoPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingTop: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // ── User row ──────────────────────────────────────────────────────────────
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  userTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 17,
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  dateText: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255,255,255,0.5)',
  },

  // ── Edit controls ─────────────────────────────────────────────────────────
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActionBtnSave: {
    backgroundColor: '#2563eb',
  },

  // ── Description — read mode ───────────────────────────────────────────────
  descriptionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
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