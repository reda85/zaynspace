// hooks/useMemoryOptimization.js
import { Image } from 'expo-image';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

export const useMemoryOptimization = (options = {}) => {
  const {
    clearOnBackground = true,
    diskCacheClearInterval = 30 * 60 * 1000, // 30 minutes par défaut
    enablePeriodicCleanup = true,
  } = options;

  // Nettoyer quand l'app passe en arrière-plan
  useEffect(() => {
    if (!clearOnBackground) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        console.log('🧹 Clearing memory cache (app backgrounded)');
        Image.clearMemoryCache();
      } else if (nextAppState === 'active') {
        console.log('✅ App returned to foreground');
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [clearOnBackground]);
  
  // Nettoyer le cache disque périodiquement
  useEffect(() => {
    if (!enablePeriodicCleanup) return;

    const interval = setInterval(() => {
      Image.clearDiskCache().then(() => {
        console.log('🧹 Disk cache cleared (periodic cleanup)');
      });
    }, diskCacheClearInterval);
    
    return () => clearInterval(interval);
  }, [diskCacheClearInterval, enablePeriodicCleanup]);

  // Fonction manuelle de nettoyage (utilisable par les composants)
  const clearCache = useCallback(async () => {
    console.log('🧹 Manual cache clear triggered');
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
    console.log('✅ Cache cleared');
  }, []);

  return { clearCache };
};