// PdfViewerWithTiles.jsx - Version fonctionnelle
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
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
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_SIZE = 512;
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const USE_BACKEND = API_URL && !API_URL.includes('localhost');

export default function PdfViewerWithTiles({ planId, pdfInfo }) {
  if (!pdfInfo || !pdfInfo.width) return null;

  const maxLevel = useMemo(() => {
    return Math.ceil(Math.log2(Math.max(pdfInfo.width, pdfInfo.height)));
  }, [pdfInfo.width, pdfInfo.height]);

  // ✅ Calculer le scale pour fit-to-screen
  const minScale = useMemo(() => {
    return Math.min(SCREEN_WIDTH / pdfInfo.width, SCREEN_HEIGHT / pdfInfo.height) * 0.95;
  }, [pdfInfo.width, pdfInfo.height]);

  // États pour le viewport
  const scale = useSharedValue(minScale);
  const translateX = useSharedValue((SCREEN_WIDTH - pdfInfo.width * minScale) / 2);
  const translateY = useSharedValue((SCREEN_HEIGHT - pdfInfo.height * minScale) / 2);
  const savedScale = useSharedValue(minScale);
  const savedTranslateX = useSharedValue((SCREEN_WIDTH - pdfInfo.width * minScale) / 2);
  const savedTranslateY = useSharedValue((SCREEN_HEIGHT - pdfInfo.height * minScale) / 2);

  // ✅ Calculer le niveau actuel et suivant pour le crossfade
  const [currentLevel, setCurrentLevel] = useState(maxLevel);
  const [nextLevel, setNextLevel] = useState(maxLevel);
  const [crossfadePercent, setCrossfadePercent] = useState(0);
  const lastUpdateTime = React.useRef(0);

  // ✅ Calculer le niveau basé sur le scale (throttled)
  const updateLevel = useCallback((newScale) => {
    // Throttle: ne mettre à jour que toutes les 100ms max
    const now = Date.now();
    if (now - lastUpdateTime.current < 100) {
      return;
    }
    lastUpdateTime.current = now;
    
    const zoomRatio = newScale / minScale;
    const levelOffset = Math.log2(zoomRatio);
    
    const baseLevelForMinScale = maxLevel - 5;
    const continuousLevel = baseLevelForMinScale + levelOffset;
    
    const current = Math.max(0, Math.min(maxLevel, Math.floor(continuousLevel)));
    const next = Math.max(0, Math.min(maxLevel, current + 1));
    const percent = continuousLevel - Math.floor(continuousLevel);
    
    setCurrentLevel(current);
    setNextLevel(next);
    setCrossfadePercent(percent);
  }, [minScale, maxLevel]);

  // Mettre à jour le niveau au montage
  useEffect(() => {
    updateLevel(minScale);
  }, [minScale, updateLevel]);

  // 🎨 Construire l'URL d'une tile
  const getTileUrl = useCallback((level, col, row) => {
    if (USE_BACKEND) {
      return `${API_URL}/api/tiles/${planId}/${level}/${col}_${row}.jpeg`;
    } else {
      const storagePath = `${pdfInfo.tilesPath}_files/${level}/${col}_${row}.jpeg`;
      const { data } = supabase.storage.from('project-plans').getPublicUrl(storagePath);
      return data.publicUrl;
    }
  }, [planId, pdfInfo.tilesPath]);

  // 🎨 Rendu d'un niveau spécifique
  const renderLevel = useCallback((level) => {
    const levelScale = Math.pow(2, maxLevel - level);
    const levelWidth = Math.ceil(pdfInfo.width / levelScale);
    const levelHeight = Math.ceil(pdfInfo.height / levelScale);
    const numCols = Math.ceil(levelWidth / TILE_SIZE);
    const numRows = Math.ceil(levelHeight / TILE_SIZE);

    const tiles = [];
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const left = (col * TILE_SIZE) * levelScale;
        const top = (row * TILE_SIZE) * levelScale;
        
        const tileWidthInLevel = Math.min(TILE_SIZE, levelWidth - (col * TILE_SIZE));
        const tileHeightInLevel = Math.min(TILE_SIZE, levelHeight - (row * TILE_SIZE));
        
        const width = tileWidthInLevel * levelScale;
        const height = tileHeightInLevel * levelScale;

        tiles.push(
          <TileImage
            key={`${level}-${col}-${row}`}
            uri={getTileUrl(level, col, row)}
            left={left}
            top={top}
            width={width}
            height={height}
          />
        );
      }
    }

    return tiles;
  }, [pdfInfo.width, pdfInfo.height, maxLevel, getTileUrl]);

// Composant tile mémorisé
const TileImage = React.memo(({ uri, left, top, width, height }) => (
  <Image
    source={{ uri }}
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
    }}
    cachePolicy="memory-disk"
    contentFit="cover"
  />
));

  // 🎨 Rendu avec crossfade entre 2 niveaux
  const renderTiles = useMemo(() => {
    return (
      <>
        {/* Current level - fade out */}
        <View style={[StyleSheet.absoluteFill, { opacity: 1 - crossfadePercent }]} pointerEvents="none">
          {renderLevel(currentLevel)}
        </View>
        
        {/* Next level - fade in */}
        <View style={[StyleSheet.absoluteFill, { opacity: crossfadePercent }]} pointerEvents="none">
          {renderLevel(nextLevel)}
        </View>
      </>
    );
  }, [currentLevel, nextLevel, crossfadePercent, renderLevel]);

  // 🎮 Gestes
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.max(minScale, Math.min(4, newScale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // ✅ Mettre à jour seulement à la fin du geste
      runOnJS(updateLevel)(scale.value);
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > minScale * 1.5) {
        // Reset to fit
        scale.value = withSpring(minScale);
        translateX.value = withSpring((SCREEN_WIDTH - pdfInfo.width * minScale) / 2);
        translateY.value = withSpring((SCREEN_HEIGHT - pdfInfo.height * minScale) / 2);
      } else {
        // Zoom to 1:1
        scale.value = withSpring(1);
        translateX.value = withSpring((SCREEN_WIDTH - pdfInfo.width) / 2);
        translateY.value = withSpring((SCREEN_HEIGHT - pdfInfo.height) / 2);
      }
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(updateLevel)(scale.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={Gesture.Race(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture))}>
        <Animated.View style={[styles.content, animatedStyle]}>
          <View style={{ width: pdfInfo.width, height: pdfInfo.height, backgroundColor: '#fff' }}>
            {renderTiles}
          </View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  content: {
    width: '100%',
    height: '100%',
  },
});