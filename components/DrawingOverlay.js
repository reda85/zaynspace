import { useNavigation, useRoute } from "@react-navigation/native";
import {
  Canvas,
  Path,
  Rect,
  Skia,
  Image as SkiaImage,
  Text as SkiaText,
  useCanvasRef,
  useFont,
  useImage,
} from "@shopify/react-native-skia";
import { encode } from "base64-arraybuffer";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useAtom } from "jotai";
import {
  ArrowRight,
  Pen,
  RotateCcw,
  Save,
  Slash,
  Text as TextIcon,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loggedInUserAtom, selectedPinAtom } from "../store/atoms";

global.Buffer = global.Buffer || Buffer;

const COLORS = ["red", "blue", "green", "black", "purple"];
const TOOLS = ["pen", "line", "arrow", "text"];
const FONT_SIZE = 24; 
const PADDING = 8; 
const CORNER_RADIUS = 4; 

export default function DrawingScreen() {
  const route = useRoute();
  const { photos = [], myuri, myname, myplanid } = route.params || {};
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  
  const [pin] = useAtom(selectedPinAtom);
  const [loggedInUser] = useAtom(loggedInUserAtom);

  const canvasRef = useCanvasRef();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Preload all images
  const images = photos.map((uri) => useImage(uri));
  const background = images[currentIndex];

  // Drawing state
  const currentPath = useSharedValue(null);
  const startPoint = useSharedValue(null);
  const toolValue = useSharedValue("pen");
  const colorValue = useSharedValue("red");

  // Paths per photo
  const [paths, setPaths] = useState(photos.map(() => []));

  // UI state
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("red");
  const [textInput, setTextInput] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 400 });
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);

  // LOADING BOLD FONT for live rendering
  const font = useFont(require("../assets/fonts/Roboto-Regular.ttf"), FONT_SIZE);

  // --- Handlers ---
  const handleToolChange = useCallback((newTool) => {
    setTool(newTool);
    toolValue.value = newTool;
    setToolPanelOpen(false);
  }, []);

  const handleColorChange = useCallback((newColor) => {
    setColor(newColor);
    colorValue.value = newColor;
    setToolPanelOpen(false);
  }, []);

  const addPath = useCallback(
    (element) => {
      setPaths((prev) => {
        const newPaths = [...prev];
        newPaths[currentIndex] = [...(newPaths[currentIndex] || []), element];
        return newPaths;
      });
    },
    [currentIndex]
  );

  const updatePaths = useCallback(() => setPaths((prev) => [...prev]), []);

  const setTextPos = useCallback((x, y) => {
    setTextPosition({ x, y });
    setAddingText(true);
  }, []);

  const pan = Gesture.Pan()
    .onBegin(({ x, y }) => {
      "worklet";
      const currentTool = toolValue.value;
      const currentColor = colorValue.value;

      if (currentTool === "pen") {
        const path = Skia.Path.Make();
        path.moveTo(x, y);
        const pathElement = { type: "path", path, color: currentColor };
        currentPath.value = pathElement;
        runOnJS(addPath)(pathElement);
      } else {
        startPoint.value = { x, y };
      }
    })
    .onUpdate(({ x, y }) => {
      "worklet";
      if (toolValue.value === "pen" && currentPath.value) {
        currentPath.value.path.lineTo(x, y);
        runOnJS(updatePaths)();
      }
    })
    .onEnd(({ x, y }) => {
      "worklet";
      const currentTool = toolValue.value;
      const currentColor = colorValue.value;

      if (currentTool === "line" || currentTool === "arrow") {
        const start = startPoint.value;
        if (!start) return;
        const path = Skia.Path.Make();
        path.moveTo(start.x, start.y);
        path.lineTo(x, y);

        if (currentTool === "arrow") {
          const angle = Math.atan2(y - start.y, x - start.x);
          const size = 20;
          path.moveTo(x, y);
          path.lineTo(x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5));
          path.moveTo(x, y);
          path.lineTo(x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5));
        }

        runOnJS(addPath)({ type: "path", path, color: currentColor });
      } else if (currentTool === "text") {
        runOnJS(setTextPos)(x, y);
      }
    });

  const handleUndo = () => {
    setPaths((prev) => {
      const newPaths = [...prev];
      newPaths[currentIndex] = (newPaths[currentIndex] || []).slice(0, -1);
      return newPaths;
    });
  };

  const handleClear = () => {
    setPaths((prev) => {
      const newPaths = [...prev];
      newPaths[currentIndex] = [];
      return newPaths;
    });
  };

  const handleConfirmText = () => {
    const pos = startPoint.value || textPosition;
    if (textInput && pos) {
      addPath({ type: "text", x: pos.x, y: pos.y, text: textInput, color });
    }
    setTextInput("");
    setAddingText(false);
  };

  const onLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  // --- Save all photos (QUALITY FIX APPLIED HERE) ---
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSavingProgress(0);

      const canvasWidth = canvasSize.width;
      const canvasHeight = canvasSize.height;
      
      const LexendBoldAsset = require("../assets/fonts/Roboto-Regular.ttf"); // Font asset reference

      for (let i = 0; i < photos.length; i++) {
        // Wait until image is loaded
        while (!images[i]) {
          await new Promise((r) => setTimeout(r, 50));
        }

        const img = images[i];
        if (!img) continue;
        
        // 1. DETERMINE HIGH RESOLUTION OUTPUT SIZE
        const imgWidth = img.width();
        const imgHeight = img.height();

        // 2. CREATE HIGH-RES CANVAS
        const tempCanvas = Skia.Surface.Make(imgWidth, imgHeight); // <-- Use original image dimensions
        if (!tempCanvas) continue;

        const canvas = tempCanvas.getCanvas();
        
        // 3. CALCULATE SCALING FACTORS (from low-res drawing space to high-res output space)
        // Since the image fills the viewport, use the ratio of the image's intrinsic size
        // to the viewport size where the drawings were made.
        const scaleX = imgWidth / canvasWidth;
        const scaleY = imgHeight / canvasHeight;


        // 4. DRAW BACKGROUND IMAGE (It naturally fills the high-res canvas)
        const srcRect = Skia.XYWHRect(0, 0, imgWidth, imgHeight);
        const dstRect = Skia.XYWHRect(0, 0, imgWidth, imgHeight);
        canvas.drawImageRect(img, srcRect, dstRect, Skia.Paint());

        // 5. DRAW SCALED PATHS and TEXT
        const photoPaths = paths[i] || [];
        photoPaths.forEach((item) => {
          if (item.type === "path") {
            const paint = Skia.Paint();
            paint.setColor(Skia.Color(item.color));
            paint.setStyle(1); // stroke
            paint.setStrokeWidth(3 * scaleX); // Scale stroke width too!
            
            // Create a new path by applying the scaling transformation
            const matrix = Skia.Matrix();
            matrix.scale(scaleX, scaleY);
            const scaledPath = item.path.copy();
            scaledPath.transform(matrix);

            canvas.drawPath(scaledPath, paint);

          } else if (item.type === "text" && LexendBoldAsset) {
            
            // --- SCALING TEXT PROPERTIES ---
            const scaledFontSize = FONT_SIZE * scaleX; 
            const scaledFont = Skia.Font.MakeFromManaged(LexendBoldAsset, scaledFontSize);
            if (!scaledFont) return;

            // Scale drawing coordinates
            const scaledX = item.x * scaleX;
            const scaledY = item.y * scaleY;
            const textWidth = scaledFont.getTextWidth(item.text);
            const textHeight = scaledFontSize;
            const scaledPadding = PADDING * scaleX;
            const scaledRadius = CORNER_RADIUS * scaleX;
            
            // 1. Draw the white background RRect (Rounded Rectangle)
            const bgPaint = Skia.Paint();
            bgPaint.setColor(Skia.Color("white"));
            bgPaint.setStyle(0); // fill
            
            const rect = Skia.RRectXY(
                Skia.XYWHRect(
                    scaledX - scaledPadding, 
                    scaledY - textHeight - scaledPadding / 2, 
                    textWidth + 2 * scaledPadding, 
                    textHeight + scaledPadding
                ),
                scaledRadius, // rx for rounded corners
                scaledRadius  // ry for rounded corners
            );
            canvas.drawRRect(rect, bgPaint);
            
            // 2. Draw the text (using the scaled bold font)
            const textPaint = Skia.Paint();
            textPaint.setColor(Skia.Color("black"));
            canvas.drawText(item.text, scaledX, scaledY, textPaint, scaledFont);
          }
        });

        const snapshot = tempCanvas.makeImageSnapshot();
        if (!snapshot) continue;

        const bytes = snapshot.encodeToBytes();
        const base64 = encode(bytes);
        const filename = `drawing_${Date.now()}_${i}.png`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(fileUri);

        // Upload to Supabase storage
        const fileBuffer = Buffer.from(base64, "base64");
        const uploadPath = `${pin?.project_id}/${filename}`;
        const { error: uploadError } = await supabase.storage.from("pinphotos").upload(uploadPath, fileBuffer, { contentType: "image/png" });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage.from("pinphotos").getPublicUrl(uploadPath);

        // Insert into pins_photos
        const { data: photoInsert, error: insertError } = await supabase
          .from("pins_photos")
          .insert([{
            pin_id: pin?.id,
            project_id: pin?.project_id,
            public_url: publicUrl,
            description,
            date: new Date().toISOString(),
          }])
          .select()
          .single();
        if (insertError) throw insertError;

        // Insert event
        await supabase.from("events").insert([{
          pin_id: pin?.id,
          category: "photo_upload",
          project_id: pin?.project_id,
          user_id: loggedInUser?.id,
          pin_photo_id: photoInsert.id,
          metadata: { pin_photo_id: photoInsert.id },
        }]);

        setSavingProgress(((i + 1) / photos.length) * 100);
      }

      navigation.navigate("PinMetadataScreen", { pinId: pin?.id, from:'Pdf', myuri: myuri, myname: myname, myplanid: myplanid });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Could not save drawings.");
    } finally {
      setIsSaving(false);
      setSavingProgress(0);
    }
  };

  // --- Render ---
  return (
    
    <View style={styles.container} onLayout={onLayout}>
      {/* Thumbnails avec safe area top - Improved */}
      <View style={[styles.thumbnailSection, { top: 10 + insets.top }]}>
        <FlatList
          data={photos}
          horizontal
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.thumbnailContent}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity 
              onPress={() => setCurrentIndex(index)} 
              style={[
                styles.thumbnailWrapper, 
                index === currentIndex && styles.thumbnailActive
              ]}
            >
              <Image source={{ uri: item }} style={styles.thumbnail} />
              {index === currentIndex && (
                <View style={styles.thumbnailBadge}>
                  <Text style={styles.thumbnailBadgeText}>{index + 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
        <View style={styles.photoCounter}>
          <Text style={styles.photoCounterText}>{currentIndex + 1}/{photos.length}</Text>
        </View>
      </View>

      {/* Drawing Canvas */}
      <GestureDetector gesture={pan}>
        <Canvas style={StyleSheet.absoluteFill} ref={canvasRef}>
          {background && <SkiaImage image={background} x={0} y={0} width={canvasSize.width} height={canvasSize.height} />}
          {(paths[currentIndex] || []).map((item, i) => {
            if (item.type === "path") return <Path key={i} path={item.path} color={item.color} style="stroke" strokeWidth={3} />;
            
            // APPLYING BOLD TEXT WITH WHITE BACKGROUND ON CANVAS (WITH ROUNDED CORNERS)
            if (item.type === "text" && font) {
              const textWidth = font.getTextWidth(item.text);
              const textHeight = FONT_SIZE; 
              
              return (
                <View key={`text-${i}`}>
                  {/* Draw White Background Rect with rounded corners */}
                  <Rect 
                    x={item.x - PADDING}
                    y={item.y - textHeight - PADDING / 2} // Align background to text baseline
                    width={textWidth + 2 * PADDING}
                    height={textHeight + PADDING}
                    color="white"
                    style="fill"
                    rx={CORNER_RADIUS} // Rounded corners
                    ry={CORNER_RADIUS} // Rounded corners
                  />
                  {/* Draw Text (using the bold font) */}
                  <SkiaText 
                    x={item.x} 
                    y={item.y} 
                    text={item.text} 
                    color={"black"} // Text should be black for contrast
                    font={font} 
                  />
                </View>
              );
            }
          })}
        </Canvas>
      </GestureDetector>

      {/* Tool Panel - Collapsible */}
      <View style={[styles.toolPanel, { top: 120 + insets.top }]}>
        {/* Collapsed State - Icon Button */}
        {!toolPanelOpen && (
          <TouchableOpacity 
            style={styles.toolPanelToggle}
            onPress={() => setToolPanelOpen(true)}
          >
            <View style={[styles.currentToolIndicator, { backgroundColor: color }]}>
              {tool === "pen" && <Pen color="white" size={18} />}
              {tool === "line" && <Slash color="white" size={18} />}
              {tool === "arrow" && <ArrowRight color="white" size={18} />}
              {tool === "text" && <TextIcon color="white" size={18} />}
            </View>
          </TouchableOpacity>
        )}

        {/* Expanded State - Full Panel */}
        {toolPanelOpen && (
          <View style={styles.toolPanelExpanded}>
            {/* Close Button */}
            <TouchableOpacity 
              style={styles.toolPanelClose}
              onPress={() => setToolPanelOpen(false)}
            >
              <X size={20} color="#999" />
            </TouchableOpacity>

            {/* Color Palette */}
            <View style={styles.paletteContainer}>
              <Text style={styles.toolLabel}>Couleur</Text>
              <View style={styles.palette}>
                {COLORS.map((c) => (
                  <TouchableOpacity 
                    key={c} 
                    style={[
                      styles.colorDot, 
                      { backgroundColor: c },
                      c === color && styles.colorDotActive
                    ]} 
                    onPress={() => handleColorChange(c)}
                  >
                    {c === color && <View style={styles.colorDotCheck} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Drawing Tools */}
            <View style={styles.toolsContainer}>
              <Text style={styles.toolLabel}>Outils</Text>
              <View style={styles.tools}>
                <TouchableOpacity 
                  style={[styles.toolButton, tool === "pen" && styles.activeToolButton]} 
                  onPress={() => handleToolChange("pen")}
                >
                  <Pen color={tool === "pen" ? "#fff" : "#ccc"} size={20} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toolButton, tool === "line" && styles.activeToolButton]} 
                  onPress={() => handleToolChange("line")}
                >
                  <Slash color={tool === "line" ? "#fff" : "#ccc"} size={20} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toolButton, tool === "arrow" && styles.activeToolButton]} 
                  onPress={() => handleToolChange("arrow")}
                >
                  <ArrowRight color={tool === "arrow" ? "#fff" : "#ccc"} size={20} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toolButton, tool === "text" && styles.activeToolButton]} 
                  onPress={() => handleToolChange("text")}
                >
                  <TextIcon color={tool === "text" ? "#fff" : "#ccc"} size={20} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Controls avec safe area bottom */}
      <View style={[styles.controls, { bottom: 80 + insets.bottom }]}>
        <TouchableOpacity onPress={handleUndo}><RotateCcw color="white" size={28} /></TouchableOpacity>
        <TouchableOpacity onPress={handleClear}><Trash2 color="white" size={28} /></TouchableOpacity>
        <TouchableOpacity onPress={handleSave}><Save color="white" size={28} /></TouchableOpacity>
      </View>

      {/* Text input avec safe area bottom */}
      {addingText && (
        <View style={[styles.textInputOverlay, { bottom: 140 + insets.bottom }]}>
          <TextInput style={styles.textInput} placeholder="Enter text" placeholderTextColor="#aaa" value={textInput} onChangeText={setTextInput} onSubmitEditing={handleConfirmText} autoFocus />
          <TouchableOpacity onPress={handleConfirmText}><Save color="white" size={28} /></TouchableOpacity>
        </View>
      )}

      {/* Description avec safe area bottom */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.descriptionWrapper}>
        <View style={[styles.descriptionContainer, { paddingBottom: 8 + insets.bottom }]}>
          <TextInput style={styles.descriptionInput} placeholder="Add a description..." placeholderTextColor="#ccc" value={description} onChangeText={setDescription} multiline />
        </View>
      </KeyboardAvoidingView>

      {/* Loader */}
      {isSaving && (
        <View style={styles.overlay}>
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color="#6D28D9" />
            <Text style={styles.loaderText}>Saving... {Math.round(savingProgress)}%</Text>
          </View>
        </View>
      )}
    </View>

  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  
  // Thumbnails - Improved
  thumbnailSection: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  thumbnailContent: {
    gap: 12,
    paddingRight: 80,
  },
  thumbnailWrapper: { 
    borderWidth: 3, 
    borderColor: "rgba(255,255,255,0.3)", 
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  thumbnailActive: { 
    borderColor: "#6D28D9",
    shadowColor: "#6D28D9",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  thumbnail: { 
    width: 70, 
    height: 70, 
  },
  thumbnailBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#6D28D9",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  photoCounter: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  photoCounterText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },

  // Tool Panel - Collapsible
  toolPanel: {
    position: "absolute",
    left: 16,
    zIndex: 20,
  },
  toolPanelToggle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  currentToolIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  toolPanelExpanded: {
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
  },
  toolPanelClose: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  toolLabel: {
    color: "#999",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  
  // Color Palette
  paletteContainer: {
    gap: 4,
  },
  palette: { 
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  colorDot: { 
    width: 40, 
    height: 40, 
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "white",
    transform: [{ scale: 1.1 }],
  },
  colorDotCheck: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.8)",
  },

  // Tools
  toolsContainer: {
    gap: 4,
  },
  tools: { 
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  toolButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  activeToolButton: { 
    backgroundColor: "#6D28D9",
    borderColor: "#6D28D9",
    transform: [{ scale: 1.05 }],
  },

  // Controls
  controls: { 
    flexDirection: "row", 
    position: "absolute", 
    left: 20, 
    right: 20, 
    justifyContent: "space-around", 
    backgroundColor: "rgba(0,0,0,0.85)", 
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  
  // Text Input
  textInputOverlay: { 
    position: "absolute", 
    left: 20, 
    right: 20, 
    backgroundColor: "rgba(0,0,0,0.9)", 
    padding: 16, 
    borderRadius: 16, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  textInput: { 
    color: "white", 
    borderBottomColor: "#6D28D9", 
    borderBottomWidth: 2, 
    flex: 1, 
    marginRight: 10,
    fontSize: 16,
    paddingVertical: 8,
  },
  
  // Description
  descriptionWrapper: { position: "absolute", bottom: 0, width: "100%" },
  descriptionContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "rgba(0,0,0,0.85)", 
    paddingHorizontal: 16, 
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  descriptionInput: { 
    flex: 1, 
    color: "white", 
    fontSize: 15, 
    paddingVertical: 8, 
    paddingHorizontal: 12,
  },
  
  // Loader
  overlay: { 
    position: "absolute", 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: "rgba(0,0,0,0.7)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  loaderBox: { 
    backgroundColor: "#fff", 
    padding: 24, 
    borderRadius: 16, 
    alignItems: "center",
    minWidth: 200,
  },
  loaderText: { 
    marginTop: 12, 
    fontSize: 16, 
    color: "#333", 
    fontWeight: "600" 
  },
});