// components/Tile.jsx
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const Tile = memo(({ planId, tilesPath, x, y, z, priority, tileSize = 512 }) => {
  // Format DeepZoom : {tilesPath}_files/{z}/{x}_{y}.png
  const tileUrl = `${API_URL}/api/tiles/${planId}/${z}/${x}_${y}.png`;
  
  return (
    <Image
      source={{ uri: tileUrl }}
      style={[
        styles.tile,
        {
          left: x * tileSize,
          top: y * tileSize,
          width: tileSize,
          height: tileSize,
        }
      ]}
      cachePolicy="memory-disk"
      priority={priority}
      transition={100}
      contentFit="cover"
      recyclingKey={`${planId}-${z}-${x}-${y}`}
    />
  );
}, (prevProps, nextProps) => {
  // Optimisation : ne re-render que si les props changent
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.z === nextProps.z &&
    prevProps.planId === nextProps.planId
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
  },
});

export default Tile;