// components/CoordinateDebugOverlay.jsx
import { StyleSheet, Text, View } from 'react-native';

const CoordinateDebugOverlay = ({ 
  ghostPinPosition, 
  pdfCoords, 
  scale, 
  translateX, 
  translateY,
  zoomLevel 
}) => {
  if (!__DEV__ || !ghostPinPosition) return null;
  
  return (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugTitle}>🔍 Debug Info</Text>
      
      <Text style={styles.debugText}>
        Screen: ({ghostPinPosition.x.toFixed(0)}, {ghostPinPosition.y.toFixed(0)})
      </Text>
      
      {pdfCoords && (
        <>
          <Text style={styles.debugText}>
            PDF Norm: ({pdfCoords.x.toFixed(4)}, {pdfCoords.y.toFixed(4)})
          </Text>
          
          <Text style={styles.debugText}>
            PDF Abs: ({pdfCoords.absolute.x.toFixed(0)}, {pdfCoords.absolute.y.toFixed(0)})
          </Text>
          
          <Text style={[
            styles.debugText, 
            { color: pdfCoords.isInBounds ? '#10b981' : '#ef4444' }
          ]}>
            {pdfCoords.isInBounds ? '✓ In Bounds' : '✗ Out of Bounds'}
          </Text>
        </>
      )}
      
      <View style={styles.separator} />
      
      <Text style={styles.debugText}>
        Scale: {scale.toFixed(2)}x
      </Text>
      
      <Text style={styles.debugText}>
        Translate: ({translateX.toFixed(0)}, {translateY.toFixed(0)})
      </Text>
      
      <Text style={styles.debugText}>
        Zoom Level: {zoomLevel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  debugOverlay: {
    position: 'absolute',
    top: 60,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    padding: 12,
    borderRadius: 8,
    zIndex: 10000,
    minWidth: 200,
  },
  debugTitle: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  debugText: {
    color: 'white',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
});

export default CoordinateDebugOverlay;