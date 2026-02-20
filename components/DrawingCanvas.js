import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useCallback, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const DrawingCanvas = () => {
  const currentPath = useRef(null);
  const [paths, setPaths] = useState([]);

  const updatePaths = useCallback((newPath) => {
    setPaths((prevState) => [...prevState, newPath]);
  }, []);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(({ x, y }) => {
      currentPath.current = Skia.Path.Make();
      currentPath.current.moveTo(x, y);
      runOnJS(updatePaths)(currentPath.current);
    })
    .onUpdate(({ x, y }) => {
      if (currentPath.current) {
        currentPath.current.lineTo(x, y);
       
        setPaths((prev) => [...prev]);
      }
    });

  return (
  
      <GestureDetector gesture={panGesture}>
        <Canvas style={{ flex: 1 }}>
          {paths.map((path, index) => (
            <Path key={index} path={path} color="black" style="stroke" strokeWidth={4} />
          ))}
        </Canvas>
      </GestureDetector>
    
  );
};

export default DrawingCanvas;
