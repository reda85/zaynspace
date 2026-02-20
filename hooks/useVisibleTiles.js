// hooks/useVisibleTiles.js
import { useMemo } from 'react';

export const useVisibleTiles = (pdfInfo, viewport, zoomLevel, tileSize = 512) => {
  return useMemo(() => {
    if (!pdfInfo) return [];
    
    const BUFFER = 1; // Charger 1 tile de plus autour du viewport
    
    // Calculer les dimensions à ce niveau de zoom
    const scale = Math.pow(2, zoomLevel);
    const scaledWidth = pdfInfo.width / scale;
    const scaledHeight = pdfInfo.height / scale;
    
    // Calculer les indices de tiles visibles
    const startX = Math.max(0, Math.floor(viewport.x / tileSize) - BUFFER);
    const startY = Math.max(0, Math.floor(viewport.y / tileSize) - BUFFER);
    const endX = Math.min(
      Math.ceil(scaledWidth / tileSize),
      Math.ceil((viewport.x + viewport.width) / tileSize) + BUFFER
    );
    const endY = Math.min(
      Math.ceil(scaledHeight / tileSize),
      Math.ceil((viewport.y + viewport.height) / tileSize) + BUFFER
    );
    
    const tiles = [];
    const centerX = (viewport.x + viewport.width / 2) / tileSize;
    const centerY = (viewport.y + viewport.height / 2) / tileSize;
    
    // Générer la liste des tiles
    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        // Calculer la distance au centre pour la priorité
        const distance = Math.sqrt(
          Math.pow(tx - centerX, 2) + 
          Math.pow(ty - centerY, 2)
        );
        
        tiles.push({
          x: tx,
          y: ty,
          z: zoomLevel,
          key: `${zoomLevel}-${tx}-${ty}`,
          priority: distance < 2 ? 'high' : 'normal',
          distance
        });
      }
    }
    
    // Trier par distance (les tiles les plus proches en premier)
    return tiles.sort((a, b) => a.distance - b.distance);
  }, [
    pdfInfo, 
    Math.floor(viewport.x / tileSize), 
    Math.floor(viewport.y / tileSize), 
    zoomLevel,
    tileSize
  ]);
};