/* use client */
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { ZoomContainer, Zoomable, useZoomValue } from 'react-native-zoom-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_SIZE = 512;

export default function UltraSmoothTiledViewer({ plan }) {
  const { scale, translateX, translateY } = useZoomValue();

  const maxLevel = useMemo(() => Math.ceil(Math.log2(Math.max(plan.width, plan.height))), [plan]);
  
  // The persistent blurry background
  const baseLevel = Math.max(0, maxLevel - 5); 

  // 1. Calculate the Fractional Zoom
  // Example: If log2(scale) is 1.4, currentLevel is 1, nextLevel is 2, progress is 0.4
  const zoomProgress = useDerivedValue(() => {
    const continuousZoom = Math.log2(scale.value || 1);
    const floorZoom = Math.floor(continuousZoom);
    return {
      current: Math.min(maxLevel, maxLevel + floorZoom),
      next: Math.min(maxLevel, maxLevel + floorZoom + 1),
      percent: continuousZoom - floorZoom // 0 to 1
    };
  });

  const renderLayer = (level, animatedOpacity = 1) => {
    const levelScale = Math.pow(2, maxLevel - level);
    const scaledTileSize = TILE_SIZE * levelScale;

    // Viewport Culling
    const minX = (-translateX.value - scaledTileSize) / scale.value;
    const maxX = (-translateX.value + SCREEN_WIDTH + scaledTileSize) / scale.value;
    const minY = (-translateY.value - scaledTileSize) / scale.value;
    const maxY = (-translateY.value + SCREEN_HEIGHT + scaledTileSize) / scale.value;

    const startCol = Math.max(0, Math.floor(minX / scaledTileSize));
    const endCol = Math.min(Math.ceil(plan.width / scaledTileSize) - 1, Math.ceil(maxX / scaledTileSize));
    const startRow = Math.max(0, Math.floor(minY / scaledTileSize));
    const endRow = Math.min(Math.ceil(plan.height / scaledTileSize) - 1, Math.ceil(maxY / scaledTileSize));

    const tiles = [];
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        tiles.push(
          <TileImage 
            key={`${level}-${c}-${r}`}
            uri={`${SUPABASE_URL}/${plan.tiles_path}_files/${level}/${c}_${r}.png`}
            left={c * scaledTileSize}
            top={r * scaledTileSize}
            size={scaledTileSize}
            opacity={animatedOpacity}
          />
        );
      }
    }
    return tiles;
  };

  return (
    <View style={styles.container}>
      <ZoomContainer>
        <Zoomable>
          <View style={{ width: plan.width, height: plan.height }}>
            {/* LAYER 0: The Base (Always there) */}
            {renderLayer(baseLevel, 0.4)}

            {/* LAYER 1: The Current Level (Fades out as you zoom in deeper) */}
            <LayerContainer opacity={useDerivedValue(() => 1 - zoomProgress.value.percent)}>
              {renderLayer(zoomProgress.value.current)}
            </LayerContainer>

            {/* LAYER 2: The Next Level (Fades in as you zoom in deeper) */}
            <LayerContainer opacity={useDerivedValue(() => zoomProgress.value.percent)}>
              {renderLayer(zoomProgress.value.next)}
            </LayerContainer>
          </View>
        </Zoomable>
      </ZoomContainer>
    </View>
  );
}

// Helper component to animate whole tile groups
const LayerContainer = ({ children, opacity }) => {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    ...StyleSheet.absoluteFillObject
  }));
  return <Animated.View style={style} pointerEvents="none">{children}</Animated.View>;
};

const TileImage = React.memo(({ uri, left, top, size, opacity }) => (
  <Image
    source={{ uri }}
    style={{
      position: 'absolute',
      left, top,
      width: size,
      height: size,
    }}
    cachePolicy="disk"
  />
));

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }
});