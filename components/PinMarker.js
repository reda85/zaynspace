// components/PinMarker.jsx
import { MapPin } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

const PinMarker = memo(({ pin, pdfSize, pinAnimatedStyle, onPinPress }) => {
  // Convertir coordonnées normalisées (0-1) en pixels absolus
  const absX = pin.x * pdfSize.width;
  const absY = pin.y * pdfSize.height;
  
  // Couleur selon le statut
  const getPinColor = () => {
    if (pin.status_id === 'completed') return '#10b981';
    if (pin.status_id === 'in_progress') return '#f59e0b';
    if (pin.status_id === 'blocked') return '#ef4444';
    return '#3b82f6'; // default
  };
  
  return (
    <Animated.View
      style={[
        styles.pinContainer,
        {
          left: absX,
          top: absY,
        },
        pinAnimatedStyle
      ]}
    >
      <TouchableOpacity 
        onPress={() => onPinPress?.(pin)}
        activeOpacity={0.7}
      >
        <MapPin 
          size={24} 
          color={getPinColor()} 
          fill={getPinColor()}
        />
        
        {/* Badge de notification si non lu */}
        {pin.unread_count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pin.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.pin.id === nextProps.pin.id &&
    prevProps.pin.x === nextProps.pin.x &&
    prevProps.pin.y === nextProps.pin.y &&
    prevProps.pin.status_id === nextProps.pin.status_id &&
    prevProps.pin.unread_count === nextProps.pin.unread_count
  );
});

const styles = StyleSheet.create({
  pinContainer: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -24, // Ancrer le pin par la pointe
    zIndex: 100,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default PinMarker;