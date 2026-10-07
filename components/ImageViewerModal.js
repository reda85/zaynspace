import { Calendar, Check, MapPin, Maximize2, Pencil, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
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
import { supabase } from '../lib/supabase';

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
 *
 *   planId            — string | null. Plan sur lequel cette photo est
 *                        actuellement placée (colonne pins_photos.plan_id).
 *   planX, planY      — number | null. Position normalisée (0-1) sur ce plan
 *                        (pins_photos.plan_x / plan_y).
 *   onPlaceOnPlan     — () => void. Photo DÉJÀ placée : appelé quand
 *                        l'utilisateur touche la carte "Position sur le plan"
 *                        pour aller modifier sa position. Le PARENT gère la
 *                        navigation (pousser ImagePinPlacementScreen en mode
 *                        "photo"). Si omis, aucune section n'apparaît.
 *
 *   Photo PAS ENCORE placée — sélection du plan intégrée à CE modal (jamais un
 *   second <Modal> natif, pour éviter le conflit de présentation UIKit sur
 *   iOS) :
 *   onStartPlacement      — () => void. Appelé à l'ouverture du panneau de
 *                            sélection ; le parent doit alors charger la liste
 *                            des plans (ex: fetchProjectPlans()).
 *   availablePlans        — Array<{ id, name, width, height, tiles_path }>.
 *   loadingAvailablePlans — bool.
 *   onPlanChosen          — (plan) => void. Appelé une fois un plan choisi
 *                            dans la liste ; le parent gère la navigation.
 */
export default function ImageViewerModal({
  visible,
  onClose,
  imageUrl,
  userName,
  description,
  date,
  onSaveDescription,
  planId = null,
  planX = null,
  planY = null,
  onPlaceOnPlan,
  onStartPlacement,
  availablePlans = [],
  loadingAvailablePlans = false,
  onPlanChosen,
}) {
  const insets = useSafeAreaInsets();

  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // ── Position sur le plan ───────────────────────────────────────────────────
  const [planInfo, setPlanInfo] = useState(null); // { name, pngUrl } | null
  const [loadingPlanInfo, setLoadingPlanInfo] = useState(false);
  const hasPlanPosition = planId != null && planX != null && planY != null;

  // ── Sélecteur de plan INLINE (jamais un second <Modal>) ───────────────────
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) setPickerOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || !planId) {
      setPlanInfo(null);
      return;
    }
    let cancelled = false;
    setLoadingPlanInfo(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('name, png_url')
          .eq('id', planId)
          .single();
        if (error) throw error;
        let pngPublicUrl = null;
        if (data?.png_url) {
          const { data: urlData } = supabase.storage.from('project-plans').getPublicUrl(data.png_url);
          pngPublicUrl = urlData.publicUrl;
        }
        if (!cancelled) setPlanInfo({ name: data?.name || null, pngUrl: pngPublicUrl });
      } catch (e) {
        console.error('Failed to load plan info for photo:', e);
        if (!cancelled) setPlanInfo(null);
      } finally {
        if (!cancelled) setLoadingPlanInfo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, planId]);

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

  // ── Fermeture sûre avant une action de navigation ─────────────────────────
  // Ce Modal ne doit JAMAIS être fermé en même temps qu'un AUTRE Modal natif se
  // présente (deadlock UIKit sur iOS). On ferme donc CE modal une seule fois,
  // puis on attend sa fermeture réelle (InteractionManager + filet de sécurité
  // par délai) avant d'exécuter l'action fournie (typiquement : router.push
  // côté parent, jamais un second <Modal>).
  const pendingActionRef = useRef(null);

  const handleModalDismiss = () => {
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
    }
  };

  const closeThenRun = (action) => {
    pendingActionRef.current = action;
    onClose();
    const fire = () => {
      if (pendingActionRef.current === action) {
        pendingActionRef.current = null;
        action();
      }
    };
    InteractionManager.runAfterInteractions(fire);
    setTimeout(fire, 600);
  };

  // Photo déjà placée : toucher la carte → fermeture puis délégation au parent.
  const handleShowExistingPosition = () => {
    if (!onPlaceOnPlan) return;
    closeThenRun(() => onPlaceOnPlan());
  };

  // Photo pas encore placée : ouvre le panneau de sélection INLINE (pas de
  // fermeture du modal ici — on reste sur place).
  const handleOpenPicker = () => {
    onStartPlacement && onStartPlacement();
    setPickerOpen(true);
  };

  // Un plan est choisi dans la liste inline : on ferme le panneau, PUIS ce
  // modal (une seule fermeture), puis on délègue au parent.
  const handleChoosePlan = (plan) => {
    setPickerOpen(false);
    if (!onPlanChosen) return;
    closeThenRun(() => onPlanChosen(plan));
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={handleModalDismiss}
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

          {/* Position sur le plan — voir / modifier / placer */}
          {(onPlaceOnPlan || onStartPlacement) && (
            <View style={styles.planSection}>
              {hasPlanPosition ? (
                <TouchableOpacity style={styles.planCard} onPress={handleShowExistingPosition}>
                  <View style={styles.planThumbWrapper}>
                    {loadingPlanInfo ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : planInfo?.pngUrl ? (
                      <>
                        {/* Aperçu approximatif : resizeMode="cover" peut recadrer un
                            plan non carré, donc le point n'est qu'indicatif ici —
                            la position précise se règle dans l'écran de placement. */}
                        <Image
                          source={{ uri: planInfo.pngUrl }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                        <View
                          style={[
                            styles.planDot,
                            { left: `${planX * 100}%`, top: `${planY * 100}%` },
                          ]}
                        />
                      </>
                    ) : (
                      <MapPin size={20} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planCardTitle}>Position sur le plan</Text>
                    {planInfo?.name ? (
                      <Text style={styles.planCardSubtitle} numberOfLines={1}>{planInfo.name}</Text>
                    ) : (
                      <Text style={styles.planCardSubtitle}>Toucher pour modifier</Text>
                    )}
                  </View>
                  <Pencil size={16} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.placeOnPlanButton} onPress={handleOpenPicker}>
                  <MapPin size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.placeOnPlanText}>Placer sur le plan</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

        </View>

        {/* ── Sélecteur de plan INLINE — une simple View superposée dans CE
             même Modal, jamais un second <Modal> natif (c'est la cause du gel
             iOS observé quand deux Modals RN s'enchaînaient). ── */}
        {pickerOpen && (
          <View style={styles.pickerOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setPickerOpen(false)}
            />
            <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Choisir un plan</Text>
                <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              {loadingAvailablePlans ? (
                <ActivityIndicator size="large" color="#fff" style={{ marginVertical: 32 }} />
              ) : availablePlans.length === 0 ? (
                <Text style={styles.pickerEmptyText}>Aucun plan disponible pour ce projet</Text>
              ) : (
                <FlatList
                  data={availablePlans}
                  keyExtractor={(item) => item.id.toString()}
                  style={{ maxHeight: 320 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.pickerItem} onPress={() => handleChoosePlan(item)}>
                      <MapPin size={18} color="#fff" />
                      <Text style={styles.pickerItemText} numberOfLines={1}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
                />
              )}
            </View>
          </View>
        )}
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

  // ── Position sur le plan ───────────────────────────────────────────────────
  planSection: {
    marginTop: 14,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 12,
  },
  planThumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#fff',
  },
  planCardTitle: {
    fontSize: 14,
    fontFamily: 'Outfit_500Medium',
    color: '#fff',
  },
  planCardSubtitle: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  placeOnPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
  },
  placeOnPlanText: {
    fontSize: 14,
    fontFamily: 'Outfit_500Medium',
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Sélecteur de plan inline ───────────────────────────────────────────────
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  pickerSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: '#fff',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  pickerItemText: {
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    color: '#fff',
    flexShrink: 1,
  },
  pickerSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pickerEmptyText: {
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingVertical: 24,
  },
});