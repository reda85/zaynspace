import Slider from "@react-native-community/slider";
import { useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { ArrowRight, Image as ImageIcon, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { selectedPinAtom } from "../store/atoms";

// ✅ UPDATED IMPORTS - Gesture API v3
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useSharedValue,
} from "react-native-reanimated";

const AnimatedCameraView = Animated.createAnimatedComponent(CameraView);

export default function CameraModal() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { myuri, myname, myplanid, returnToPinId } = route.params;
  const [pin] = useAtom(selectedPinAtom);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [maxZoom, setMaxZoom] = useState(1);

  // 🌍 GEOLOCATION STATE
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const locationSubscription = useRef(null);

  /* 🔹 ZOOM STATE (0 → maxZoom) */
  const zoom = useSharedValue(0);
  const savedZoom = useSharedValue(0);

  /* 🌍 START LOCATION TRACKING */
  useEffect(() => {
    const startLocationTracking = async () => {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');

      if (status !== 'granted') {
        console.warn('Location permission denied');
        return;
      }

      // Start watching position
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,  // update every 5m
          timeInterval: 3000,   // or every 3s
        },
        (location) => {
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      );
    };

    startLocationTracking();

    // Cleanup on unmount
    return () => {
      locationSubscription.current?.remove();
    };
  }, []);

  /* 🔹 Read device max zoom once camera is ready */
  const onCameraReady = async () => {
    try {
      const camera = cameraRef.current;
      if (camera?.getAvailableCameraZoomRatiosAsync) {
        const ratios = await camera.getAvailableCameraZoomRatiosAsync();
        setMaxZoom(ratios[ratios.length - 1] ?? 1);
      } else {
        setMaxZoom(1);
      }
    } catch {
      setMaxZoom(1);
    }
  };

  /* 🔹 Native zoom binding */
  const animatedCameraProps = useAnimatedProps(() => ({
    zoom: Math.min(Math.max(zoom.value, 0), maxZoom),
  }));

  /* ✅ UPDATED: Pinch zoom with new Gesture API */
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedZoom.value = zoom.value;
    })
    .onUpdate((event) => {
      // Calculate new zoom based on scale
      const newZoom = savedZoom.value + (event.scale - 1) * 0.5;
      zoom.value = Math.min(Math.max(newZoom, 0), maxZoom);
    });

  /* ✅ UPDATED: Double-tap reset with new Gesture API */
  const handleDoubleTap = () => {
    zoom.value = 0;
    savedZoom.value = 0;
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(handleDoubleTap)();
    });

  // ✅ Combine gestures
  const composedGesture = Gesture.Race(
    doubleTapGesture,
    pinchGesture
  );

  if (!permission) return null;
  if (!permission.granted)
    return (
      <View style={styles.center}>
        <Text style={{ color: "white", textAlign: "center" }}>
          We need your permission to access the camera
        </Text>
        <Pressable onPress={requestPermission} style={styles.btn}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedPhotos((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          // Gallery photos won't have location from camera, use current location
          latitude: currentLocation?.latitude,
          longitude: currentLocation?.longitude,
        })),
      ]);
    }
  };

  const takePicture = async () => {
    const photo = await cameraRef.current?.takePictureAsync();
    if (photo?.uri) {
      setSelectedPhotos((prev) => [
        ...prev,
        {
          uri: photo.uri,
          latitude: currentLocation?.latitude,
          longitude: currentLocation?.longitude,
        },
      ]);
    }
  };

  const goToDrawings = () => {
    if (!selectedPhotos.length) return;
    
    console.log('🚀 Navigating to DrawingScreen with photos:', selectedPhotos);
    
    navigation.navigate("DrawingScreen", {
      photos: JSON.stringify(selectedPhotos), // ✅ Serialize photo objects
      myuri,
      myname,
      myplanid,
      returnToPinId,
    });
  };

  return (
    <View style={styles.container}>
      {/* ✅ UPDATED: GestureDetector wrapper */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={{ flex: 1 }}>
          <AnimatedCameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="picture"
            animatedProps={animatedCameraProps}
            onCameraReady={onCameraReady}
          >
            {/* Top bar */}
            <View style={[styles.topBar, { top: 40 + insets.top }]}>
              <Pressable onPress={() => navigation.goBack()} style={styles.cancelBtn}>
                <X size={32} color="white" />
              </Pressable>
            </View>

            {/* 🌍 LOCATION INDICATOR */}
            {locationPermission && (
              <View style={[styles.locationBadge, { top: 40 + insets.top, right: 20 }]}>
                <Text style={styles.locationText}>
                  {currentLocation
                    ? `📍 ${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`
                    : '📍 Locating...'}
                </Text>
              </View>
            )}

            {/* Thumbnails */}
            {selectedPhotos.length > 0 && (
              <View style={[styles.thumbnailContainer, { top: 100 + insets.top }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedPhotos.map((photo, i) => (
                    <Image key={i} source={{ uri: photo.uri }} style={styles.thumbnail} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Zoom slider */}
            <View style={styles.zoomSlider}>
              <Slider
                minimumValue={0}
                maximumValue={maxZoom}
                value={zoom.value}
                onValueChange={(v) => {
                  zoom.value = v;
                  savedZoom.value = v;
                }}
                minimumTrackTintColor="#fff"
                maximumTrackTintColor="rgba(255,255,255,0.4)"
                thumbTintColor="#fff"
              />
            </View>

            {/* Bottom bar */}
            <View style={[styles.bottomBar, { bottom: 40 + insets.bottom }]}>
              <Pressable onPress={pickImageFromGallery}>
                <ImageIcon size={36} color="white" />
              </Pressable>

              <Pressable onPress={takePicture} style={styles.shutterBtn}>
                <View style={styles.shutterInner} />
              </Pressable>

              <Pressable onPress={goToDrawings}>
                <ArrowRight size={36} color={selectedPhotos.length ? "white" : "gray"} />
              </Pressable>
            </View>
          </AnimatedCameraView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  camera: { flex: 1 },
  topBar: { position: "absolute", left: 20 },
  cancelBtn: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    padding: 5,
  },
  // 🌍 NEW: Location badge
  locationBadge: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  locationText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
  },
  thumbnailContainer: {
    position: "absolute",
    left: 20,
    right: 20,
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 2,
    borderColor: "white",
  },
  zoomSlider: {
    position: "absolute",
    right: 10,
    top: "35%",
    width: 150,
    transform: [{ rotate: "-90deg" }],
  },
  bottomBar: {
    position: "absolute",
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    backgroundColor: "white",
    borderRadius: 30,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  btn: { backgroundColor: "#007bff", padding: 10, borderRadius: 5 },
  btnText: { color: "white" },
});