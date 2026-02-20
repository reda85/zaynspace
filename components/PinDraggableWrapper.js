// PinDraggableWrapper.js
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from "react-native-reanimated";
import MapPin from "./MapPin";

const PIN_SIZE = 24;
const PIN_SIZE_HALF = PIN_SIZE / 2;

export default function PinDraggableWrapper({ 
    pin, 
    pdfLayout, 
    scale, 
    draggedPinId, // The SharedValue object passed from PdfViewerWithPins
    panRef, 
    pinchRef, 
    onPinPress, 
    updatePinPosition 
}) {
    
    if (!pdfLayout) return null;

    const absX = pin.x * pdfLayout.width;
    const absY = pin.y * pdfLayout.height;

    const pinTransX = useSharedValue(0);
    const pinTransY = useSharedValue(0);
    const pinScale = useSharedValue(1);

    // --- Pin Drag Gesture ---
    const pinDragGesture = Gesture.Pan()
        .minDistance(5)
        .onStart(() => {
            // Accessing the SharedValue: .value
            draggedPinId.value = pin.id; 
            pinScale.value = withSpring(1.5);
            pinTransX.value = 0;
            pinTransY.value = 0;
        })
        .onUpdate((event) => {
            pinTransX.value = event.translationX / scale.value;
            pinTransY.value = event.translationY / scale.value;
        })
        .onEnd(() => {
            pinScale.value = withSpring(1);
            draggedPinId.value = null;

            const finalX = absX + pinTransX.value;
            const finalY = absY + pinTransY.value;

            const newNormX = Math.max(0, Math.min(1, finalX / pdfLayout.width));
            const newNormY = Math.max(0, Math.min(1, finalY / pdfLayout.height));

            pinTransX.value = 0;
            pinTransY.value = 0;
            
            runOnJS(updatePinPosition)(pin.id, newNormX, newNormY);
        });

    const pinStyle = useAnimatedStyle(() => ({
        left: absX,
        top: absY,
        // Using the SharedValue in an Animated context: .value
        zIndex: draggedPinId.value === pin.id ? 9999 : 10, 
        transform: [
            { translateX: pinTransX.value },
            { translateY: pinTransY.value },
            { scale: pinScale.value / scale.value },
        ],
    }));

    // The GestureDetector wrapper ensures a single child
    return (
        <GestureDetector 
            key={pin.id} 
            gesture={pinDragGesture.simultaneousWithExternalGesture(panRef, pinchRef)}
        >
            <Animated.View style={[styles.pinContainer, pinStyle]}>
                <MapPin 
                    pin={pin} 
                    onPinPress={() => onPinPress(pin)} 
                />
            </Animated.View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    pinContainer: { 
        position: "absolute", 
        zIndex: 10, 
        alignItems: "center", 
        justifyContent: "center", 
        width: PIN_SIZE, 
        height: PIN_SIZE, 
        marginLeft: -PIN_SIZE_HALF, 
        marginTop: -PIN_SIZE_HALF 
    },
});