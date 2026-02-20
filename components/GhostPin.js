// components/GhostPin.jsx
import { MapPinPlusIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const AnimatedView = Animated.createAnimatedComponent(View);

const GhostPin = memo(({ position, visible, isValid = true }) => {
  if (!visible || !position) return null;
  
  // Animation de pulsation
  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{
        scale: withRepeat(
          withSequence(
            withTiming(1, { duration: 500 }),
            withTiming(1.2, { duration: 500 })
          ),
          -1,
          true
        )
      }]
    };
  });
  
  return (
    <AnimatedView
      style={[
        styles.ghostPin,
        {
          left: position.x - 12,
          top: position.y - 24,
        },
        pulseStyle
      ]}
    >
      {/* Cercle de fond */}
      <View style={[
        styles.circle,
        { 
          backgroundColor: isValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          borderColor: isValid ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
        }
      ]} />
      
      {/* Icône du pin */}
      <MapPinPlusIcon 
        size={24} 
        color={isValid ? '#10b981' : '#ef4444'} 
      />
      
      {/* Indicateur de validité */}
      {!isValid && (
        <View style={styles.invalidIndicator}>
          <Text style={styles.invalidText}>✗</Text>
        </View>
      )}
    </AnimatedView>
  );
});

const styles = StyleSheet.create({
  ghostPin: {
    position: 'absolute',
    width: 24,
    height: 24,
    zIndex: 9998,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  invalidIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invalidText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default GhostPin;