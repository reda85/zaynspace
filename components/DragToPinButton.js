import { Text } from 'react-native';

import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedGestureHandler,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

 const DragToPinButton = ({ onDrop }) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.offsetX = translateX.value;
      ctx.offsetY = translateY.value;
    },
    onActive: (event, ctx) => {
      translateX.value = ctx.offsetX + event.translationX;
      translateY.value = ctx.offsetY + event.translationY;
    },
    onEnd: (event) => {
      runOnJS(onDrop)({
        x: translateX.value + 20, // center adjustment
        y: translateY.value + 20,
      });
      // Reset position
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 100,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'dodgerblue',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
          },
          animatedStyle,
        ]}
      >
        <Text style={{ color: 'white', fontSize: 24 }}>+</Text>
      </Animated.View>
    </PanGestureHandler>
  );
};
export default DragToPinButton;
