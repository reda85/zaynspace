// hooks/usePdfCoordinates.js
import { useCallback } from 'react';
import { Dimensions } from 'react-native';

const WINDOW = Dimensions.get('window');

export const usePdfCoordinates = (pdfInfo, scale, translateX, translateY) => {
  /**
   * Convertir coordonnées écran → coordonnées PDF normalisées (0-1)
   */
  const screenToPdfCoordinates = useCallback((screenX, screenY) => {
    if (!pdfInfo) return null;
    
    // Centre de l'écran
    const screenCenterX = WINDOW.width / 2;
    const screenCenterY = WINDOW.height / 2;
    
    // Transformations actuelles
    const currentScale = scale.value;
    const currentTranslateX = translateX.value;
    const currentTranslateY = translateY.value;
    
    // Position du coin supérieur gauche du PDF dans l'écran
    const pdfCenterOffsetX = (pdfInfo.width * currentScale) / 2;
    const pdfCenterOffsetY = (pdfInfo.height * currentScale) / 2;
    
    const pdfGlobalLeft = screenCenterX - pdfCenterOffsetX + currentTranslateX;
    const pdfGlobalTop = screenCenterY - pdfCenterOffsetY + currentTranslateY;
    
    // Position dans le PDF zoomé
    const pdfZoomedX = screenX - pdfGlobalLeft;
    const pdfZoomedY = screenY - pdfGlobalTop;
    
    // Position dans le PDF original (dé-zoomé)
    const pdfOriginalX = pdfZoomedX / currentScale;
    const pdfOriginalY = pdfZoomedY / currentScale;
    
    // Normaliser (0-1)
    const normalizedX = pdfOriginalX / pdfInfo.width;
    const normalizedY = pdfOriginalY / pdfInfo.height;
    
    // Vérifier les limites
    const isInBounds = 
      normalizedX >= 0 && normalizedX <= 1 &&
      normalizedY >= 0 && normalizedY <= 1;
    
    return {
      x: normalizedX,
      y: normalizedY,
      isInBounds,
      absolute: {
        x: pdfOriginalX,
        y: pdfOriginalY
      },
      debug: {
        screenX,
        screenY,
        pdfGlobalLeft,
        pdfGlobalTop,
        pdfZoomedX,
        pdfZoomedY,
        scale: currentScale
      }
    };
  }, [pdfInfo, scale, translateX, translateY]);
  
  /**
   * Convertir coordonnées PDF normalisées (0-1) → coordonnées écran
   */
  const pdfToScreenCoordinates = useCallback((normalizedX, normalizedY) => {
    if (!pdfInfo) return null;
    
    const screenCenterX = WINDOW.width / 2;
    const screenCenterY = WINDOW.height / 2;
    
    const currentScale = scale.value;
    const currentTranslateX = translateX.value;
    const currentTranslateY = translateY.value;
    
    // Position dans le PDF original
    const pdfOriginalX = normalizedX * pdfInfo.width;
    const pdfOriginalY = normalizedY * pdfInfo.height;
    
    // Position dans le PDF zoomé
    const pdfZoomedX = pdfOriginalX * currentScale;
    const pdfZoomedY = pdfOriginalY * currentScale;
    
    // Position du coin supérieur gauche du PDF
    const pdfCenterOffsetX = (pdfInfo.width * currentScale) / 2;
    const pdfCenterOffsetY = (pdfInfo.height * currentScale) / 2;
    
    const pdfGlobalLeft = screenCenterX - pdfCenterOffsetX + currentTranslateX;
    const pdfGlobalTop = screenCenterY - pdfCenterOffsetY + currentTranslateY;
    
    // Position écran finale
    const screenX = pdfGlobalLeft + pdfZoomedX;
    const screenY = pdfGlobalTop + pdfZoomedY;
    
    return { x: screenX, y: screenY };
  }, [pdfInfo, scale, translateX, translateY]);
  
  return { screenToPdfCoordinates, pdfToScreenCoordinates };
};