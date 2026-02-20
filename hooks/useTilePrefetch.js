// hooks/useTilePrefetch.js
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TILE_SIZE = 512;
const MAX_PREFETCH_CACHE = 100;
const PREFETCH_RADIUS = 1; // Nombre de tiles à précharger autour du centre

/**
 * Hook pour précharger intelligemment les tiles
 * Précharge les tiles du niveau de zoom suivant pour une transition fluide
 */
export const useTilePrefetch = (planId, viewport, zoomLevel, pdfInfo, enabled = true) => {
  const prefetchedRef = useRef(new Set());
  const prefetchQueueRef = useRef([]);
  const isPrefetchingRef = useRef(false);

  // Fonction pour construire l'URL d'une tile
  const getTileUrl = useCallback((z, x, y) => {
    return `${API_URL}/api/tiles/${planId}/${z}/${x}_${y}.png`;
  }, [planId]);

  // Fonction pour précharger une tile
  const prefetchTile = useCallback(async (z, x, y) => {
    const key = `${z}-${x}-${y}`;
    
    if (prefetchedRef.current.has(key)) {
      return; // Déjà préchargé
    }

    try {
      const tileUrl = getTileUrl(z, x, y);
      await Image.prefetch(tileUrl, {
        cachePolicy: 'memory-disk',
      });
      
      prefetchedRef.current.add(key);
      console.log(`✅ Prefetched tile: ${key}`);
    } catch (error) {
      // Ignorer silencieusement les erreurs de préchargement
      // (tiles hors limites ou problèmes réseau)
    }
  }, [getTileUrl]);

  // Traiter la queue de préchargement
  const processPrefetchQueue = useCallback(async () => {
    if (isPrefetchingRef.current || prefetchQueueRef.current.length === 0) {
      return;
    }

    isPrefetchingRef.current = true;

    // Précharger par batch de 4 pour ne pas surcharger
    const batch = prefetchQueueRef.current.splice(0, 4);
    
    await Promise.all(
      batch.map(({ z, x, y }) => prefetchTile(z, x, y))
    );

    isPrefetchingRef.current = false;

    // Continuer avec le reste de la queue
    if (prefetchQueueRef.current.length > 0) {
      setTimeout(processPrefetchQueue, 100);
    }
  }, [prefetchTile]);

  // Calculer les tiles à précharger
  useEffect(() => {
    if (!enabled || !pdfInfo || !viewport) return;

    const nextZoomLevel = Math.min(zoomLevel + 1, pdfInfo.maxZoom);
    
    // Pas de préchargement si on est déjà au zoom max
    if (nextZoomLevel === zoomLevel) return;

    // Calculer le centre du viewport
    const scale = Math.pow(2, zoomLevel);
    const centerX = Math.floor((viewport.x + viewport.width / 2) / (TILE_SIZE / scale));
    const centerY = Math.floor((viewport.y + viewport.height / 2) / (TILE_SIZE / scale));

    // Construire la liste des tiles à précharger
    const tilesToPrefetch = [];
    
    for (let dx = -PREFETCH_RADIUS; dx <= PREFETCH_RADIUS; dx++) {
      for (let dy = -PREFETCH_RADIUS; dy <= PREFETCH_RADIUS; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        // Vérifier que la tile est dans les limites
        const maxTiles = Math.pow(2, nextZoomLevel);
        if (x >= 0 && x < maxTiles && y >= 0 && y < maxTiles) {
          tilesToPrefetch.push({ z: nextZoomLevel, x, y });
        }
      }
    }

    // Ajouter à la queue de préchargement
    prefetchQueueRef.current = tilesToPrefetch;
    processPrefetchQueue();

    // Nettoyer le cache si trop grand
    if (prefetchedRef.current.size > MAX_PREFETCH_CACHE) {
      console.log('🧹 Clearing prefetch cache (size limit reached)');
      prefetchedRef.current.clear();
    }
  }, [planId, viewport, zoomLevel, pdfInfo, enabled, processPrefetchQueue]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      prefetchQueueRef.current = [];
      prefetchedRef.current.clear();
    };
  }, []);

  return {
    clearPrefetchCache: useCallback(() => {
      prefetchedRef.current.clear();
      prefetchQueueRef.current = [];
      console.log('🧹 Prefetch cache cleared');
    }, []),
  };
};