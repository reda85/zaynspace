import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export default function TestPanGesture() {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart((e, ctx) => {
      ctx.startX = translateX.value;
      ctx.startY = translateY.value;
    })
    .onUpdate((e, ctx) => {
      translateX.value = ctx.startX + e.translationX;
      translateY.value = ctx.startY + e.translationY;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.box, animatedStyle]}>
        <Text style={{ color: 'white' }}>Drag me</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 150,
    height: 150,
    backgroundColor: 'blue',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
