// PdfViewerWithTiles.jsx
// COMPLETE FIXED VERSION - No jumping during pinch zoom, pins always sharp on iOS + Android

import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCameraPermissions } from "expo-camera";
import { Image } from 'expo-image';
import { router } from "expo-router";
import { useAtom } from "jotai";
import { CheckIcon, DropletsIcon, FireExtinguisherIcon, GripIcon, MapPinPlusIcon, PaintRoller, X, ZapIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import { useMemoryOptimization } from '../hooks/useMemoryOptimization';
import { supabase } from '../lib/supabase';
import { categoriesAtom, selectedPinAtom, statusesAtom } from "../store/atoms";
import MapPin from './MapPin';
import PdfViewerFilterOverlay from './PdfViewerFilterOverlay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_SIZE = 512;
const PIN_SIZE = 24;
const FLOATING_BUTTON_SIZE = 56;
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const USE_BACKEND = API_URL && !API_URL.includes('localhost');

const categoriesIcons = {
  unassigned: <CheckIcon color="white" size={24} />,
  zap: <ZapIcon color="white" size={24} />,
  droplets: <DropletsIcon color="white" size={24} />,
  paint: <PaintRoller color="white" size={24} />,
  carrelage: <GripIcon color="white" size={24} />,
  'fire-extinguisher': <FireExtinguisherIcon color="white" size={24} />,
};

// ─── Single animated pin ─────────────────────────────────────────────────────
// Each pin gets its own useAnimatedStyle driven by the shared values.
// This runs on the UI thread every frame — zero lag during pinch/pan.
const AnimatedPin = React.memo(({ pin, pdfWidth, pdfHeight, scale, translateX, translateY, onPress }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const screenX = pin.x * pdfWidth * scale.value + translateX.value - PIN_SIZE / 2;
    const screenY = pin.y * pdfHeight * scale.value + translateY.value - PIN_SIZE / 2;
    return {
      transform: [
        { translateX: screenX },
        { translateY: screenY },
      ],
    };
  });

  return (
    <Animated.View style={[styles.pinScreenWrapper, animatedStyle]} pointerEvents="box-none">
      <MapPin pin={pin} onPinPress={() => onPress(pin)} />
    </Animated.View>
  );
});

// ─── Tile Image ──────────────────────────────────────────────────────────────
const TileImage = React.memo(({ uri, left, top, width, height }) => (
  <Image
    source={{ uri }}
    style={{ position: 'absolute', left, top, width, height }}
    cachePolicy="memory-disk"
    transition={0}
    contentFit="cover"
    onError={() => {
      if (__DEV__) console.log(`❌ Failed to load tile: ${uri}`);
    }}
  />
));

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PdfViewerWithTiles({
  planId,
  pdfInfo,
  pins = [],
  onPinDrop,
  onPinPress,
  onPinUpdate,
  enablePinDrop = true,
  selectedProject,
  pdfName,
  plan_id,
  myuri,
  myname,
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();

  // Atoms
  const [categories] = useAtom(categoriesAtom);
  const [statuses] = useAtom(statusesAtom);
  const [selectedPin, setSelectedPin] = useAtom(selectedPinAtom);

  if (!pdfInfo || !pdfInfo.width) return null;

  // Pin state
  const [normalizedPins, setNormalizedPins] = useState([]);
  const [filteredPins, setFilteredPins] = useState([]);
  const [editingPin, setEditingPin] = useState(null);
  const [showFabActions, setShowFabActions] = useState(false);

  // Modal state
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [bottomSheetPin, setBottomSheetPin] = useState(null);
  const [projectNumber, setProjectNumber] = useState('');
  const [pinNumber, setPinNumber] = useState('');
  const lastTapRef = useRef(0);
  const DOUBLE_TAP_DELAY = 300;

  // FAB refs
  const buttonRef = useRef(null);
  const isDragging = useSharedValue(false);
  const buttonX = useSharedValue(0);
  const buttonY = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const pdfWrapperRef = useRef(null);

  // Minimum scale
  const minScale = useMemo(() => {
    const scaleToFitWidth = SCREEN_WIDTH / pdfInfo.width;
    const scaleToFitHeight = SCREEN_HEIGHT / pdfInfo.height;
    return Math.min(scaleToFitWidth, scaleToFitHeight) * 0.9;
  }, [pdfInfo.width, pdfInfo.height]);

  const initialScale = useMemo(() => minScale, [minScale]);

  const initialTranslate = useMemo(() => {
    const scaledWidth = pdfInfo.width * initialScale;
    const scaledHeight = pdfInfo.height * initialScale;
    return {
      x: (SCREEN_WIDTH - scaledWidth) / 2,
      y: (SCREEN_HEIGHT - scaledHeight) / 2,
    };
  }, [pdfInfo.width, pdfInfo.height, initialScale]);

  // ✅ These shared values drive BOTH the PDF container AND the pins
  const scale = useSharedValue(initialScale);
  const translateX = useSharedValue(initialTranslate.x);
  const translateY = useSharedValue(initialTranslate.y);

  // Saved values for PAN
  const panSavedTranslateX = useSharedValue(initialTranslate.x);
  const panSavedTranslateY = useSharedValue(initialTranslate.y);

  // Saved values for PINCH
  const pinchSavedScale = useSharedValue(initialScale);
  const pinchSavedTranslateX = useSharedValue(initialTranslate.x);
  const pinchSavedTranslateY = useSharedValue(initialTranslate.y);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);

  // Viewport state — only used for tile culling, updated on gesture end only
  const [viewport, setViewport] = useState({
    scale: initialScale,
    translateX: initialTranslate.x,
    translateY: initialTranslate.y,
  });

  const updateViewport = useCallback((newScale, newTranslateX, newTranslateY) => {
    setViewport({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY });
  }, []);

  useEffect(() => {
    updateViewport(initialScale, initialTranslate.x, initialTranslate.y);
  }, [initialScale, initialTranslate.x, initialTranslate.y, updateViewport]);

  useEffect(() => {
    setNormalizedPins(pins ?? []);
    setFilteredPins(pins ?? []);
  }, [pins]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setBottomSheetVisible(false);
      };
    }, [])
  );

  const maxLevel = useMemo(() => {
    const maxDimension = Math.max(pdfInfo.width, pdfInfo.height);
    return Math.ceil(Math.log2(maxDimension));
  }, [pdfInfo.width, pdfInfo.height]);

  const baseLevel = useMemo(() => Math.max(0, maxLevel - 6), [maxLevel]);

  const zoomLevels = useMemo(() => {
    const scaleRatio = viewport.scale / minScale;
    const continuousZoom = Math.log2(scaleRatio);
    const levelAtMinScale = maxLevel - 5;
    const currentLevel = Math.floor(continuousZoom) + levelAtMinScale;
    const percent = continuousZoom - Math.floor(continuousZoom);
    const shouldLoadNext = percent > 0.5;
    return {
      current: Math.min(maxLevel, Math.max(0, currentLevel)),
      next: shouldLoadNext ? Math.min(maxLevel, Math.max(0, currentLevel + 1)) : null,
      percent,
    };
  }, [viewport.scale, minScale, maxLevel]);

  const { clearCache } = useMemoryOptimization({
    clearOnBackground: true,
    enablePeriodicCleanup: false,
    diskCacheClearInterval: 60000,
  });

  const getTileUrl = useCallback((level, col, row) => {
    if (USE_BACKEND) {
      return `${API_URL}/api/tiles/${planId}/${level}/${col}_${row}.jpeg`;
    } else {
      const storagePath = `${pdfInfo.tilesPath}_files/${level}/${col}_${row}.jpeg`;
      const { data } = supabase.storage.from('project-plans').getPublicUrl(storagePath);
      return data.publicUrl;
    }
  }, [planId, pdfInfo.tilesPath]);

  const renderLayer = useCallback((level, isBaseLevel = false) => {
    const tileSize = TILE_SIZE;
    const levelScale = Math.pow(2, maxLevel - level);
    const levelWidth = Math.ceil(pdfInfo.width / levelScale);
    const levelHeight = Math.ceil(pdfInfo.height / levelScale);
    const maxCol = Math.ceil(levelWidth / TILE_SIZE) - 1;
    const maxRow = Math.ceil(levelHeight / TILE_SIZE) - 1;

    let startCol = 0, endCol = maxCol, startRow = 0, endRow = maxRow;

    if (!isBaseLevel) {
      const buffer = SCREEN_WIDTH * 0.5;
      const minX = Math.max(0, (-viewport.translateX - buffer) / viewport.scale);
      const maxX = (-viewport.translateX + SCREEN_WIDTH + buffer) / viewport.scale;
      const minY = Math.max(0, (-viewport.translateY - buffer) / viewport.scale);
      const maxY = (-viewport.translateY + SCREEN_HEIGHT + buffer) / viewport.scale;
      startCol = Math.max(0, Math.floor(minX / (tileSize * levelScale)));
      endCol = Math.min(maxCol, Math.ceil(maxX / (tileSize * levelScale)));
      startRow = Math.max(0, Math.floor(minY / (tileSize * levelScale)));
      endRow = Math.min(maxRow, Math.ceil(maxY / (tileSize * levelScale)));
    }

    const tiles = [];
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tileUri = getTileUrl(level, c, r);
        const tileWidthInLevel = Math.min(tileSize, levelWidth - (c * tileSize));
        const tileHeightInLevel = Math.min(tileSize, levelHeight - (r * tileSize));
        const width = tileWidthInLevel * levelScale;
        const height = tileHeightInLevel * levelScale;
        tiles.push(
          <TileImage
            key={`${level}-${c}-${r}`}
            uri={tileUri}
            left={c * tileSize * levelScale}
            top={r * tileSize * levelScale}
            width={width}
            height={height}
          />
        );
      }
    }
    return tiles;
  }, [pdfInfo.width, pdfInfo.height, maxLevel, viewport, getTileUrl]);

  // Pin callbacks
  const startCameraForPin = useCallback((pin) => {
    setSelectedPin(pin);
    setEditingPin(pin);
    router.push({
      pathname: "CameraScreen",
      params: { myuri, myname, myplanid: plan_id }
    });
  }, [myuri, myname, plan_id, setSelectedPin]);

  const handlePinDrop = useCallback((normX, normY) => {
    const newPin = {
      id: uuid.v4(),
      x: normX,
      y: normY,
      note: '',
      photoUris: [],
      category_id: categories[0]?.id || null,
      status_id: statuses[0]?.id || null,
      name: '',
      project_id: selectedProject?.id || null,
      pdf_name: pdfName || '',
      plan_id: plan_id || null,
      due_date: null,
    };
    setEditingPin(newPin);
    setNormalizedPins(prev => [...prev, newPin]);
    const cleanPin = Object.fromEntries(
      Object.entries(newPin).filter(([_, v]) => v !== '' || typeof v === 'string')
    );
    onPinUpdate?.(cleanPin);
    if (!permission?.granted) {
      requestPermission();
    } else {
      startCameraForPin(newPin);
    }
  }, [categories, statuses, selectedProject, pdfName, plan_id, permission, onPinUpdate, startCameraForPin, requestPermission]);

  const handlePinPress = useCallback(async (pin) => {
    const { data } = await supabase
      .from('pdf_pins')
      .select('*,projects(*),categories(*),Status(*)')
      .eq('id', pin.id)
      .single();
    if (data) {
      setProjectNumber(data.projects?.project_number || '');
      setPinNumber(data.pin_number || '');
      setBottomSheetPin(data);
    } else {
      setBottomSheetPin(pin);
    }
    setBottomSheetVisible(true);
  }, []);

  const handleNavigateToMetadata = useCallback(() => {
    setBottomSheetVisible(false);
    if (bottomSheetPin) {
      router.push({
        pathname: 'PinMetadataScreen',
        params: {
          pinId: bottomSheetPin.id,
          from: 'Pdf',
          myuri,
          myname,
          myplanid: plan_id,
          photoUris: JSON.stringify([])
        }
      });
    }
  }, [bottomSheetPin, myuri, myname, plan_id]);

  const handleStatusDoubleTap = useCallback(async () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (!bottomSheetPin || !statuses.length) return;
      const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
      const lastStatus = sortedStatuses[sortedStatuses.length - 1];
      if (lastStatus && bottomSheetPin.status_id !== lastStatus.id) {
        const { error } = await supabase
          .from('pdf_pins')
          .update({ status_id: lastStatus.id })
          .eq('id', bottomSheetPin.id);
        if (!error) {
          setBottomSheetPin({ ...bottomSheetPin, status_id: lastStatus.id, Status: lastStatus });
          setNormalizedPins(prev =>
            prev.map(p => p.id === bottomSheetPin.id ? { ...p, status_id: lastStatus.id } : p)
          );
          onPinUpdate?.({ ...bottomSheetPin, status_id: lastStatus.id });
        }
      }
    }
    lastTapRef.current = now;
  }, [bottomSheetPin, statuses, onPinUpdate]);

  const handleDropToPdf = useCallback(() => {
    if (!buttonRef.current || !pdfWrapperRef.current) return;
    pdfWrapperRef.current.measureInWindow((wrapperX, wrapperY) => {
      buttonRef.current.measureInWindow((bX, bY, bWidth, bHeight) => {
        const dropX = bX + bWidth / 2;
        const dropY = bY + bHeight / 2;
        const relativeX = dropX - wrapperX;
        const relativeY = dropY - wrapperY;
        const pdfX = relativeX - viewport.translateX;
        const pdfY = relativeY - viewport.translateY;
        const finalX = pdfX / viewport.scale;
        const finalY = pdfY / viewport.scale;
        const normX = finalX / pdfInfo.width;
        const normY = finalY / pdfInfo.height;
        if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
          handlePinDrop(normX, normY);
        } else {
          console.warn('⚠️ Drop outside PDF bounds:', { normX, normY });
        }
      });
    });
  }, [pdfInfo, viewport, handlePinDrop]);

  const handleConfirmDrop = useCallback(() => {
    handleDropToPdf();
    setShowFabActions(false);
    buttonX.value = withSpring(0);
    buttonY.value = withSpring(0);
  }, [handleDropToPdf]);

  const handleCancelDrop = useCallback(() => {
    setShowFabActions(false);
    buttonX.value = withSpring(0);
    buttonY.value = withSpring(0);
  }, []);

  // Gestures
  const buttonGesture = useMemo(() => Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      buttonScale.value = withSpring(1.2);
    })
    .onUpdate((e) => {
      buttonX.value = e.translationX;
      buttonY.value = e.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      buttonScale.value = withSpring(1);
      runOnJS(setShowFabActions)(true);
    }), []);

  const pinchGesture = Gesture.Pinch()
    .onStart((event) => {
      pinchSavedScale.value = scale.value;
      pinchSavedTranslateX.value = translateX.value;
      pinchSavedTranslateY.value = translateY.value;
      pinchStartFocalX.value = event.focalX;
      pinchStartFocalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const fx = pinchStartFocalX.value;
      const fy = pinchStartFocalY.value;
      const pdfX = (fx - pinchSavedTranslateX.value) / pinchSavedScale.value;
      const pdfY = (fy - pinchSavedTranslateY.value) / pinchSavedScale.value;
      scale.value = pinchSavedScale.value * event.scale;
      translateX.value = fx - (pdfX * scale.value);
      translateY.value = fy - (pdfY * scale.value);
    })
    .onEnd(() => {
      panSavedTranslateX.value = translateX.value;
      panSavedTranslateY.value = translateY.value;
      pinchSavedScale.value = scale.value;
      pinchSavedTranslateX.value = translateX.value;
      pinchSavedTranslateY.value = translateY.value;
      runOnJS(updateViewport)(scale.value, translateX.value, translateY.value);
    });

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .maxPointers(1)
    .onStart(() => {
      panSavedTranslateX.value = translateX.value;
      panSavedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = panSavedTranslateX.value + event.translationX;
      translateY.value = panSavedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      panSavedTranslateX.value = translateX.value;
      panSavedTranslateY.value = translateY.value;
      pinchSavedTranslateX.value = translateX.value;
      pinchSavedTranslateY.value = translateY.value;
      runOnJS(updateViewport)(scale.value, translateX.value, translateY.value);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      const tapX = event.x;
      const tapY = event.y;
      const pdfX = (tapX - translateX.value) / scale.value;
      const pdfY = (tapY - translateY.value) / scale.value;
      const newScale = scale.value > minScale * 1.5 ? minScale : 1.0;
      translateX.value = tapX - (pdfX * newScale);
      translateY.value = tapY - (pdfY * newScale);
      scale.value = newScale;
      panSavedTranslateX.value = translateX.value;
      panSavedTranslateY.value = translateY.value;
      pinchSavedScale.value = scale.value;
      pinchSavedTranslateX.value = translateX.value;
      pinchSavedTranslateY.value = translateY.value;
      runOnJS(updateViewport)(scale.value, translateX.value, translateY.value);
    });

  const simultaneousGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture.simultaneousWithExternalGesture(pinchGesture)
  );

  const composedGesture = Gesture.Race(doubleTapGesture, simultaneousGesture);

  const pdfContainerStyle = useAnimatedStyle(() => ({
    width: pdfInfo.width,
    height: pdfInfo.height,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    transformOrigin: 'top left',
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: buttonX.value },
      { translateY: buttonY.value },
      { scale: buttonScale.value }
    ],
    opacity: isDragging.value ? 0.8 : 1
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.modeIndicator}>
        <Text style={styles.modeText}>
          {USE_BACKEND ? '🌐 Backend' : '☁️ Supabase'}
        </Text>
      </View>

      <PdfViewerFilterOverlay
        pins={normalizedPins}
        onFilter={setFilteredPins}
        fabOffset={0}
      />

      <GestureDetector gesture={composedGesture}>
        <View ref={pdfWrapperRef} style={styles.gestureContainer}>
          <Animated.View style={[styles.pdfContainer, pdfContainerStyle]}>
            {/* Base layer */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {renderLayer(baseLevel, true)}
            </View>

            {/* Current zoom level */}
            {zoomLevels.current !== baseLevel && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: zoomLevels.next === null ? 1 : 1 - (zoomLevels.percent - 0.5) * 2 }
                ]}
                pointerEvents="none"
              >
                {renderLayer(zoomLevels.current, false)}
              </View>
            )}

            {/* Next zoom level */}
            {zoomLevels.next !== null && zoomLevels.next !== zoomLevels.current && zoomLevels.next !== baseLevel && (
              <View
                style={[StyleSheet.absoluteFill, { opacity: (zoomLevels.percent - 0.5) * 2 }]}
                pointerEvents="none"
              >
                {renderLayer(zoomLevels.next, false)}
              </View>
            )}

            {/* ✅ NO PINS INSIDE THE TRANSFORM */}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* ✅ Pins outside transform, each driven by shared values on the UI thread */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {filteredPins.map((pin) => (
          <AnimatedPin
            key={pin.id}
            pin={pin}
            pdfWidth={pdfInfo.width}
            pdfHeight={pdfInfo.height}
            scale={scale}
            translateX={translateX}
            translateY={translateY}
            onPress={handlePinPress}
          />
        ))}
      </View>

      {enablePinDrop && (
        <View style={[styles.buttonWrapper, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
          {showFabActions && (
            <Animated.View style={[styles.fabActionsContainer, buttonAnimatedStyle]} pointerEvents="box-none">
              <TouchableOpacity style={[styles.actionButton, styles.checkButton]} onPress={handleConfirmDrop}>
                <CheckIcon size={24} color="white" />
              </TouchableOpacity>
              <View style={{ width: FLOATING_BUTTON_SIZE }} />
              <TouchableOpacity style={[styles.actionButton, styles.closeButton]} onPress={handleCancelDrop}>
                <X size={24} color="white" />
              </TouchableOpacity>
            </Animated.View>
          )}

          <GestureDetector gesture={buttonGesture}>
            <Animated.View ref={buttonRef} style={[styles.floatingButton, buttonAnimatedStyle]}>
              <MapPinPlusIcon size={28} color="white" />
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      <Modal
        visible={bottomSheetVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBottomSheetVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBottomSheetVisible(false)}>
          <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.bottomSheetHeader}>
              <View style={styles.bottomSheetHandle} />
              <TouchableOpacity
                onPress={() => setBottomSheetVisible(false)}
                style={styles.closeModalButton}
                activeOpacity={0.7}
              >
                <X size={20} color="#111" />
              </TouchableOpacity>
            </View>

            {bottomSheetPin && (
              <Pressable style={styles.bottomSheetContent} onPress={handleNavigateToMetadata}>
                <View style={styles.statusRow}>
                  <TouchableOpacity
                    onPress={handleStatusDoubleTap}
                    activeOpacity={0.7}
                    style={[
                      styles.statusIconCircle,
                      {
                        backgroundColor: statuses.find(s => s.id === bottomSheetPin.status_id)?.color ||
                          bottomSheetPin.Status?.color || '#ccc'
                      },
                    ]}
                  >
                    {categoriesIcons[
                      categories.find(c => c.id === bottomSheetPin.category_id)?.icon ||
                      bottomSheetPin.categories?.icon ||
                      'unassigned'
                    ]}
                  </TouchableOpacity>

                  <View style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statuses.find(s => s.id === bottomSheetPin.status_id)?.color ||
                        bottomSheetPin.Status?.color || '#ccc'
                    }
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {statuses.find(s => s.id === bottomSheetPin.status_id)?.name ||
                        bottomSheetPin.Status?.name || 'N/A'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.idText}>ID : {projectNumber || 'N/A'} - {pinNumber || 'N/A'}</Text>
                <Text style={styles.pinName}>{bottomSheetPin.name || 'Sans titre'}</Text>
                {bottomSheetPin.note && (
                  <Text style={styles.pinNote}>{bottomSheetPin.note}</Text>
                )}
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#222' },
  gestureContainer: { flex: 1, overflow: 'hidden' },
  pdfContainer: { position: 'absolute', backgroundColor: 'white' },
  // Pins anchored at top-left, translateX/Y positions them in screen space
  pinScreenWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  modeIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
    zIndex: 1000,
  },
  modeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  buttonWrapper: { position: 'absolute', right: 0, bottom: 0, left: 0, top: 0, pointerEvents: 'box-none' },
  floatingButton: {
    position: 'absolute',
    right: 20,
    bottom: 180,
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    zIndex: 9999,
  },
  fabActionsContainer: {
    position: 'absolute',
    right: -40,
    bottom: 120,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  checkButton: { backgroundColor: '#10b981' },
  closeButton: { backgroundColor: '#ef4444' },
  closeModalButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 9999,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end'
  },
  bottomSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%'
  },
  bottomSheetHeader: {
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 20,
    position: 'relative'
  },
  bottomSheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
    marginBottom: 10
  },
  bottomSheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  statusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  statusBadge: {
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  statusBadgeText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular'
  },
  idText: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
    fontFamily: 'Outfit_400Regular'
  },
  pinName: {
    fontSize: 20,
    color: '#000',
    marginBottom: 8,
    fontFamily: 'Outfit_400Regular'
  },
  pinNote: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 24,
    marginBottom: 16,
    fontFamily: 'Outfit_400Regular'
  },
});