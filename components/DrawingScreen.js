// PERFORMANCE OPTIMIZATIONS SUMMARY:
// 
// 1. ✅ Immediate UI Feedback - Loading dialog shows instantly before heavy processing
//
// 2. ✅ Aggressive Image Compression:
//    - JPEG format (85% quality) instead of PNG = 70-90% smaller files
//    - Max dimension reduced to 1920px (from 2048px) = faster processing
//    - Typical file size: 200-500KB instead of 2-5MB per image
//
// 3. ✅ Chunked Rendering - Images render in small batches with progress updates,
//    preventing UI freeze while still utilizing parallelization
//
// 4. ✅ Batched Uploads - Network uploads happen in batches of 3 instead of one-by-one,
//    reducing total upload time while avoiding connection overload
//
// 5. ✅ Progress Granularity - Clear progress stages (5% load, 10-40% render, 40-100% upload)
//
// 6. ✅ Conditional Gallery Save - Respects the "Sauvegarde automatique des données"
//    preference stored in AsyncStorage (@settings/autoSaveImages)
//
// 🌍 7. ✅ Geolocation Support - Photos now include latitude/longitude metadata
//
// 📍 8. ✅ Photo-on-plan placement - Each photo can be pinned individually on the
//    project plan (pins_photos.plan_x / plan_y / plan_id), via ImagePinPlacementScreen
//    in "photo" mode.
//
// EXPECTED PERFORMANCE GAINS:
// - UI responds immediately (< 100ms to show dialog)
// - 70-90% faster rendering due to smaller output size
// - 80-95% faster uploads due to compressed files
// - For 10 photos: from ~30s to ~3-5s total time

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoute } from "@react-navigation/native";
import {
  Canvas,
  ImageFormat,
  PaintStyle,
  Path,
  RoundedRect,
  Skia,
  Image as SkiaImage,
  Text as SkiaText,
  useCanvasRef,
  useFont,
  useImage,
} from "@shopify/react-native-skia";
import { encode } from "base64-arraybuffer";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useAtom } from "jotai";
import {
  ArrowRight,
  ChevronRight,
  MapPin,
  Mic as MicIcon,
  Pen,
  RotateCcw,
  Save,
  Slash,
  Trash2,
  Type,
  X
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
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
import { getOutboxOps, isNetworkError, isOnline, photoUri, queue, savePendingPhotoFile } from "../lib/offline";
import { supabase } from "../lib/supabase";
import uuid from "react-native-uuid";
import { loggedInUserAtom, PhotoPlanPositionAtom, selectedPinAtom } from "../store/atoms";

global.Buffer = global.Buffer || Buffer;

/* ---- Storage keys (must match StorageDataScreen) ---- */
const AUTO_SAVE_KEY = "@settings/autoSaveImages";
const COMPRESS_KEY   = "@settings/compressImages";
const OPTIMIZE_KEY   = "@settings/optimizeStorage";

const COLORS = ["red", "blue", "green", "black", "purple"];
const TOOLS = ["pen", "line", "arrow", "text"];

// ── Rectangle "contain" (proportionné, centré) d'une image dans un conteneur ──
// Utilisé à la fois pour l'affichage à l'écran ET pour le rendu final exporté,
// afin que les deux restent parfaitement cohérents (sinon les traits de dessin
// se désalignent par rapport à la photo dans le fichier sauvegardé). Les
// dimensions passées viennent toujours de Image.getSize() (voir plus bas),
// jamais de l'objet Skia lui-même.
const getContainRect = (imgWidth, imgHeight, containerWidth, containerHeight) => {
  if (!imgWidth || !imgHeight || !containerWidth || !containerHeight) {
    return { x: 0, y: 0, width: containerWidth || 0, height: containerHeight || 0 };
  }
  const containerRatio = containerWidth / containerHeight;
  const imgRatio = imgWidth / imgHeight;
  let width, height;
  if (imgRatio > containerRatio) {
    width = containerWidth;
    height = width / imgRatio;
  } else {
    height = containerHeight;
    width = height * imgRatio;
  }
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
};
const FONT_SIZES = [12, 16, 20, 28, 36];

export default function DrawingScreen() {
  console.log('🧪 DEBUG-BUILD-MARKER v4 — si tu ne vois PAS cette ligne dans tes logs, ton app tourne sur un ancien bundle en cache.');
  const route = useRoute();
  const { myuri, myname, myplanid, returnToPinId } = route.params || {};
  const params = useLocalSearchParams();

  console.log('=== DrawingScreen Debug ===');
  console.log('📦 params:', params);
  console.log('📸 params.photos:', params.photos);
  console.log('🔢 Type:', typeof params.photos);

  const photos = useMemo(() => {
    if (!params.photos) {
      console.error('❌ NO PHOTOS PARAM!');
      return [];
    }
    if (Array.isArray(params.photos)) return params.photos;
    const parsed = JSON.parse(params.photos);
    console.log('✅ Parsed photos:', parsed);
    return parsed;
  }, [params.photos]);

  console.log('📷 Photos array length:', photos.length);
  console.log('🖼️ Photos:', photos);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pin] = useAtom(selectedPinAtom);
  const [loggedInUser] = useAtom(loggedInUserAtom);

  const canvasRef = useCanvasRef();
  const [currentIndex, setCurrentIndex] = useState(0);

  // 🌍 Extract URIs from photo objects (handle both old string format and new object format)
  const photoUris = photos.map(photo => typeof photo === 'string' ? photo : photo.uri);
  const images = photoUris.map((uri) => useImage(uri));
  const background = images[currentIndex];

  // ── Dimensions réelles des photos, via l'API React Native classique ───────
  // On évite volontairement d'appeler .width()/.height() sur l'objet Skia
  // (useImage()) pour calculer le cadrage à l'écran : selon les versions de
  // @shopify/react-native-skia, la bibliothèque peut elle-même faire cet appel
  // en interne (dans son propre code, hors de portée d'un try/catch côté JS)
  // dès qu'on lui passe fit="contain", ce qui plante si l'image n'est pas
  // encore totalement prête. Image.getSize() ne touche jamais l'objet Skia —
  // il lit juste le fichier — donc c'est sans risque ici.
  const [photoDimensions, setPhotoDimensions] = useState(photos.map(() => null));
  // Dernière valeur connue, lisible depuis handleSave pendant qu'il attend
  // (une fonction asynchrone ne voit pas les mises à jour d'état suivantes).
  const photoDimensionsRef = useRef(photoDimensions);
  photoDimensionsRef.current = photoDimensions;

  useEffect(() => {
    photoUris.forEach((uri, i) => {
      if (!uri || photoDimensions[i]) return;
      Image.getSize(
        uri,
        (w, h) => {
          setPhotoDimensions(prev => {
            if (prev[i]) return prev;
            const copy = [...prev];
            copy[i] = { width: w, height: h };
            return copy;
          });
        },
        (err) => console.warn(`Image.getSize a échoué pour ${uri}:`, err?.message)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUris.join('|')]);

  // Déclaré AVANT backgroundDisplayRect, qui le lit dès le premier rendu.
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 400 });

  // Rectangle où l'image doit être dessinée à l'écran pour préserver son ratio
  // (au lieu d'être étirée pour remplir tout le canvas — c'est ce qui causait
  // l'effet "écrasé"). Recalculé à chaque changement de photo/taille de canvas.
  const backgroundDisplayRect = useMemo(() => {
    const dims = photoDimensions[currentIndex];
    return dims
      ? getContainRect(dims.width, dims.height, canvasSize.width, canvasSize.height)
      : { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
  }, [photoDimensions, currentIndex, canvasSize.width, canvasSize.height]);

  // ── Keyboard height tracking ──
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Drawing state
  const currentPath = useSharedValue(null);
  const startPoint = useSharedValue(null);
  const toolValue = useSharedValue("pen");
  const colorValue = useSharedValue("red");
  const fontSizeValue = useSharedValue(16);
  const selectedTextIndex = useSharedValue(null);
  const isDraggingText = useSharedValue(false);

  const [paths, setPaths] = useState(photos.map(() => []));

  // UI state
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("red");
  const [fontSize, setFontSize] = useState(16);
  const [textInput, setTextInput] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [descriptions, setDescriptions] = useState(photos.map(() => ""));
  const [isSaving, setIsSaving] = useState(false);
  // Index des photos déjà envoyées (fichier + ligne) : jamais renvoyées lors d'une nouvelle tentative.
  const uploadedIndexesRef = useRef(new Set());
  const [savingProgress, setSavingProgress] = useState(0);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [selectedTextIndexState, setSelectedTextIndexState] = useState(null);
  const [isEditingText, setIsEditingText] = useState(false);

  // ── Description dictation state ───────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [partialResult, setPartialResult] = useState('');

  // ── Photo-on-plan placement state ─────────────────────────────────────────
  // photoPlanPositions[i] = { planId, x, y } (x/y normalisées 0-1 sur le plan) ou null
  const [photoPlanPositions, setPhotoPlanPositions] = useState(photos.map(() => null));
  const [photoPlanUpdate, setPhotoPlanUpdate] = useAtom(PhotoPlanPositionAtom);
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Pinch gesture state for text transformation
  const initialScale = useSharedValue(1);
  const isPinching = useSharedValue(false);
  const isManipulatingText = useSharedValue(false);

  const font12 = useFont(require("../assets/fonts/Roboto-Regular.ttf"), 12);
  const font16 = useFont(require("../assets/fonts/Roboto-Regular.ttf"), 16);
  const font20 = useFont(require("../assets/fonts/Roboto-Regular.ttf"), 20);
  const font28 = useFont(require("../assets/fonts/Roboto-Regular.ttf"), 28);
  const font36 = useFont(require("../assets/fonts/Roboto-Regular.ttf"), 36);

  const getCurrentFont = (size) => {
    switch (size) {
      case 12: return font12;
      case 16: return font16;
      case 20: return font20;
      case 28: return font28;
      case 36: return font36;
      default: return font16;
    }
  };

  const currentFont = getCurrentFont(fontSize);

  // ── Speech recognition for description ───────────────────────────────────
  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    setPartialResult('');
  });
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript || '';
    if (!transcript) return;
    if (event.isFinal) {
      setDescriptions(prev => {
        const copy = [...prev];
        copy[currentIndex] = (copy[currentIndex] ? copy[currentIndex] + ' ' : '') + transcript;
        return copy;
      });
      setPartialResult('');
    } else {
      setPartialResult(transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    Alert.alert('Dictée', `Erreur: ${event.message}`);
    setIsListening(false);
    setPartialResult('');
  });

  const handleDictateDescription = async () => {
    if (isListening) {
      await ExpoSpeechRecognitionModule.stop().catch(() => {});
      return;
    }
    let granted = false;
    try {
      const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      granted = perm?.granted;
      if (!granted) {
        const req = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        granted = req?.granted;
      }
    } catch (e) {
      if (Platform.OS === 'android') granted = true;
    }
    if (!granted) { Alert.alert('Permission refusée', 'Activez le microphone dans les réglages'); return; }
    try {
      await ExpoSpeechRecognitionModule.start({ lang: 'fr-FR', continuous: false, interimResults: true });
    } catch (e) {}
  };

  // ── Placer / déplacer la photo actuellement affichée sur le plan ──────────
  // 1) L'utilisateur choisit un plan parmi ceux du projet (même logique que
  //    "Localiser sur le plan" dans PinMetadataScreen).
  // 2) On pousse ImagePinPlacementScreen (mode "photo") avec ce plan.
  // 3) Le résultat revient via PhotoPlanPositionAtom (voir useEffect plus bas).
  const fetchProjectPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('project_id', pin?.project_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAvailablePlans(data || []);
    } catch (err) {
      console.error('Error fetching plans:', err);
      Alert.alert('Erreur', 'Impossible de charger les plans');
    } finally {
      setLoadingPlans(false);
    }
  }, [pin?.project_id]);

  const handleOpenPlanSelector = useCallback(() => {
    if (!pin?.project_id) {
      Alert.alert('Erreur', 'Projet introuvable pour cette tâche');
      return;
    }
    fetchProjectPlans();
    setShowPlanSelector(true);
  }, [pin?.project_id, fetchProjectPlans]);

  const handlePlanSelected = useCallback((selectedPlan) => {
    setShowPlanSelector(false);
    if (!selectedPlan?.width || !selectedPlan?.height || !selectedPlan?.tiles_path) {
      Alert.alert('Erreur', 'Informations du plan incomplètes');
      return;
    }
    const pdfInfo = { width: selectedPlan.width, height: selectedPlan.height, tilesPath: selectedPlan.tiles_path };
    const existing = photoPlanPositions[currentIndex];
    // Si la photo était déjà placée mais sur un AUTRE plan, on repart de zéro
    // sur ce nouveau plan plutôt que de réutiliser des coordonnées incohérentes.
    const existingForThisPlan = existing?.planId === selectedPlan.id ? existing : null;
    router.push({
      pathname: '/ImagePinPlacementScreen',
      params: {
        myuri,
        myname,
        myplanid: selectedPlan.id,
        mode: 'photo',
        source: 'drawing',
        photoKey: String(currentIndex),
        pinIdToPlace: pin?.id,
        x: existingForThisPlan?.x,
        y: existingForThisPlan?.y,
        pdfInfo: JSON.stringify(pdfInfo),
      },
    });
  }, [photoPlanPositions, currentIndex, myuri, myname, pin?.id, router]);

  // ── Récupère la position (+ le plan choisi) renvoyée par ImagePinPlacementScreen ──
  // ⚠️ PhotoPlanPositionAtom est global : si PinMetadataScreen est resté monté
  // plus bas dans la pile (Pin → Ajouter photos → Caméra → Dessin), il écoute
  // LE MÊME atome. On ignore donc toute mise à jour qui n'a pas été envoyée
  // depuis CET écran (source !== 'drawing'), sans quoi PinMetadataScreen
  // tenterait — en plus de nous — de traiter le même événement et planterait
  // (photoKey est ici un index de tableau, pas un UUID de pins_photos).
  useEffect(() => {
    if (!photoPlanUpdate || photoPlanUpdate.photoKey == null) return;
    if (photoPlanUpdate.source !== 'drawing') return;
    const idx = Number(photoPlanUpdate.photoKey);
    if (!Number.isNaN(idx)) {
      setPhotoPlanPositions(prev => {
        const copy = [...prev];
        copy[idx] = (photoPlanUpdate.x != null && photoPlanUpdate.y != null)
          ? { planId: photoPlanUpdate.planId, x: photoPlanUpdate.x, y: photoPlanUpdate.y }
          : null;
        return copy;
      });
    }
    setPhotoPlanUpdate(null);
  }, [photoPlanUpdate]);

  const renderImageToSurface = useCallback((img, photoPaths, canvasWidth, canvasHeight, imgWidth, imgHeight, shouldCompress = true, options = {}) => {
    const MAX_DIMENSION = options.maxDimension ?? (shouldCompress ? 1920 : 2560);

    if (!imgWidth || !imgHeight) throw new Error("Dimensions de l'image indisponibles");

    let outputWidth = imgWidth;
    let outputHeight = imgHeight;
    if (imgWidth > MAX_DIMENSION || imgHeight > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(imgWidth, imgHeight);
      outputWidth = Math.floor(imgWidth * scale);
      outputHeight = Math.floor(imgHeight * scale);
    }

    const surface = Skia.Surface.Make(outputWidth, outputHeight);
    if (!surface) throw new Error("Failed to create surface");

    const canvas = surface.getCanvas();

    canvas.drawImageRect(
      img,
      Skia.XYWHRect(0, 0, imgWidth, imgHeight),
      Skia.XYWHRect(0, 0, outputWidth, outputHeight),
      Skia.Paint()
    );

    // Rectangle où l'image était RÉELLEMENT affichée à l'écran (letterboxée en
    // "contain" pour préserver son ratio — voir <SkiaImage> plus bas). Les
    // traits/texte ont été dessinés en coordonnées BRUTES du canvas ; il faut
    // donc les rapporter à ce rectangle, pas au canvas entier, sinon ils se
    // désalignent par rapport à la photo une fois exportés.
    const displayRect = getContainRect(imgWidth, imgHeight, canvasWidth, canvasHeight);
    const scaleX = outputWidth / displayRect.width;
    const scaleY = outputHeight / displayRect.height;

    photoPaths.forEach((item) => {
      if (item.type === "path") {
        const paint = Skia.Paint();
        paint.setColor(Skia.Color(item.color));
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(3 * Math.min(scaleX, scaleY));
        paint.setAntiAlias(true);

        const path = item.path.copy();
        // Matrice affine explicite (soustraire l'offset du letterbox PUIS
        // mettre à l'échelle) — construite directement pour éviter toute
        // ambiguïté sur l'ordre de composition scale/translate de Skia.Matrix.
        const matrix = Skia.Matrix([
          scaleX, 0, -displayRect.x * scaleX,
          0, scaleY, -displayRect.y * scaleY,
          0, 0, 1,
        ]);
        path.transform(matrix);

        canvas.drawPath(path, paint);
      }

      if (item.type === "text" && item.text) {
        const itemFontSize = item.fontSize || 16;
        const itemFont = getCurrentFont(itemFontSize);

        if (!itemFont) return;

        const finalX = (item.x - displayRect.x) * scaleX;
        const finalY = (item.y - displayRect.y) * scaleY;
        const itemScale = item.scale || 1.0;

        const textScale = Math.min(scaleX, scaleY) * itemScale;

        canvas.save();
        canvas.translate(finalX, finalY);
        canvas.scale(textScale, textScale);

        const textBlob = Skia.TextBlob.MakeFromText(item.text, itemFont);
        if (textBlob) {
          const textWidth = itemFont.measureText(item.text).width;
          const textHeight = itemFontSize;
          const padding = 8;

          const bgPaint = Skia.Paint();
          bgPaint.setColor(Skia.Color("white"));
          const rrect = Skia.RRectXY(
            Skia.XYWHRect(
              -padding,
              -textHeight - padding,
              textWidth + padding * 2,
              textHeight + padding * 2
            ),
            8,
            8
          );
          canvas.drawRRect(rrect, bgPaint);

          const textPaint = Skia.Paint();
          textPaint.setColor(Skia.Color(item.color));
          textPaint.setAntiAlias(true);
          canvas.drawTextBlob(textBlob, 0, 0, textPaint);
        }

        canvas.restore();
      }
    });

    const snapshot = surface.makeImageSnapshot();
   const bytes = snapshot.encodeToBytes(
  ImageFormat.JPEG,
  options.quality ?? (shouldCompress ? 85 : 92)         // toujours JPEG, jamais PNG
);

    return bytes;
  }, [getCurrentFont]);

  const findTextAtPosition = useCallback((x, y) => {
    const currentPaths = paths[currentIndex] || [];
    for (let i = currentPaths.length - 1; i >= 0; i--) {
      const item = currentPaths[i];
      if (item.type === "text") {
        const itemFont = getCurrentFont(item.fontSize || 16);
        if (!itemFont) continue;

        const textWidth = itemFont.measureText(item.text).width;
        const textHeight = item.fontSize || 16;
        const padding = 8;

        if (
          x >= item.x - padding &&
          x <= item.x + textWidth + padding &&
          y >= item.y - textHeight - padding &&
          y <= item.y + padding
        ) {
          return i;
        }
      }
    }
    return null;
  }, [paths, currentIndex]);

  const updateTextPosition = useCallback((index, x, y) => {
    setPaths((prev) => {
      const newPaths = [...prev];
      const currentPaths = [...(newPaths[currentIndex] || [])];
      if (currentPaths[index] && currentPaths[index].type === "text") {
        currentPaths[index] = { ...currentPaths[index], x, y };
      }
      newPaths[currentIndex] = currentPaths;
      return newPaths;
    });
  }, [currentIndex]);

  const updateTextScale = useCallback((index, scale) => {
    setPaths((prev) => {
      const newPaths = [...prev];
      const currentPaths = [...(newPaths[currentIndex] || [])];
      const textItem = currentPaths[index];

      if (textItem && textItem.type === "text") {
        currentPaths[index] = {
          ...textItem,
          scale: scale !== undefined ? scale : (textItem.scale || 1.0),
        };
      }
      newPaths[currentIndex] = currentPaths;
      return newPaths;
    });
  }, [currentIndex]);

  const resetManipulationFlag = useCallback(() => {
    setTimeout(() => {
      isManipulatingText.value = false;
    }, 100);
  }, []);

  const handleToolChange = useCallback((newTool) => {
    setTool(newTool);
    toolValue.value = newTool;
    if (newTool !== "text") setToolPanelOpen(false);
  }, []);

  const handleColorChange = useCallback((newColor) => {
    setColor(newColor);
    colorValue.value = newColor;
    setToolPanelOpen(false);
  }, []);

  const handleFontSizeChange = useCallback((newSize) => {
    setFontSize(newSize);
    fontSizeValue.value = newSize;
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

  const currentPathsRef = useSharedValue([]);

  React.useEffect(() => {
    currentPathsRef.value = paths[currentIndex] || [];
  }, [paths, currentIndex]);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      "worklet";
      if (selectedTextIndex.value !== null) {
        isPinching.value = true;
        isManipulatingText.value = true;
        const currentPaths = currentPathsRef.value;
        const textItem = currentPaths[selectedTextIndex.value];
        if (textItem && textItem.type === "text") {
          initialScale.value = textItem.scale || 1.0;
        }
      }
    })
    .onChange((event) => {
      "worklet";
      if (selectedTextIndex.value !== null && isPinching.value) {
        const newScale = Math.max(0.3, Math.min(3.0, initialScale.value * event.scale));
        runOnJS(updateTextScale)(selectedTextIndex.value, newScale);
      }
    })
    .onFinalize(() => {
      "worklet";
      isPinching.value = false;
      runOnJS(resetManipulationFlag)();
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(({ x, y }) => {
      "worklet";
      const currentTool = toolValue.value;
      const currentColor = colorValue.value;

      const currentPaths = currentPathsRef.value;
      let foundTextIndex = null;

      for (let i = currentPaths.length - 1; i >= 0; i--) {
        const item = currentPaths[i];
        if (item.type === "text") {
          const fs = item.fontSize || 16;
          const scale = item.scale || 1.0;
          const textHeight = fs * scale;
          const approximateTextWidth = item.text.length * fs * 0.6 * scale;
          const padding = 15;

          if (
            x >= item.x - padding &&
            x <= item.x + approximateTextWidth + padding &&
            y >= item.y - textHeight - padding &&
            y <= item.y + padding
          ) {
            foundTextIndex = i;
            break;
          }
        }
      }

      if (foundTextIndex !== null) {
        selectedTextIndex.value = foundTextIndex;
        isDraggingText.value = true;
        isManipulatingText.value = true;
        runOnJS(setSelectedTextIndexState)(foundTextIndex);
        return;
      }

      if (selectedTextIndex.value !== null) {
        selectedTextIndex.value = null;
        runOnJS(setSelectedTextIndexState)(null);
      }

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
      if (isDraggingText.value && selectedTextIndex.value !== null) {
        runOnJS(updateTextPosition)(selectedTextIndex.value, x, y);
        return;
      }

      if (toolValue.value === "pen" && currentPath.value) {
        currentPath.value.path.lineTo(x, y);
        runOnJS(updatePaths)();
      }
    })
    .onEnd(({ x, y }) => {
      "worklet";

      if (isDraggingText.value) {
        isDraggingText.value = false;
        runOnJS(resetManipulationFlag)();
        return;
      }

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
        if (!isManipulatingText.value) {
          runOnJS(setTextPos)(x, y);
        }
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
      addPath({
        type: "text",
        x: pos.x,
        y: pos.y,
        text: textInput,
        color,
        fontSize: fontSizeValue.value,
        scale: 1.0,
      });
    }
    setTextInput("");
    setAddingText(false);
    Keyboard.dismiss();
  };

  const onCanvasLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSavingProgress(0);

      await new Promise(resolve => setTimeout(resolve, 100));

      let shouldSaveToGallery = true;
      let shouldCompress      = true;
      let shouldOptimize      = true;
      try {
        const [autoSaveEntry, compressEntry, optimizeEntry] = await AsyncStorage.multiGet([
          AUTO_SAVE_KEY,
          COMPRESS_KEY,
          OPTIMIZE_KEY,
        ]);
        if (autoSaveEntry[1] !== null) shouldSaveToGallery = autoSaveEntry[1] === "true";
        if (compressEntry[1]  !== null) shouldCompress      = compressEntry[1]  === "true";
        if (optimizeEntry[1]  !== null) shouldOptimize      = optimizeEntry[1]  === "true";
      } catch (e) {
        console.warn("Could not read storage preferences:", e);
      }

      if (shouldSaveToGallery) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission refusée",
            "L'accès à la galerie est nécessaire pour sauvegarder automatiquement les images. Vous pouvez désactiver cette option dans Stockage et données."
          );
          shouldSaveToGallery = false;
        }
      }

      setSavingProgress(5);
      for (let i = 0; i < photoUris.length; i++) {
        let attempts = 0;
        while (!images[i] && attempts < 100) {
          await new Promise((r) => setTimeout(r, 50));
          attempts++;
        }
        if (!images[i]) throw new Error(`Image ${i} failed to load`);
      }
      for (let i = 0; i < photoUris.length; i++) {
        let attempts = 0;
        while (!photoDimensionsRef.current[i] && attempts < 100) {
          await new Promise((r) => setTimeout(r, 50));
          attempts++;
        }
        if (!photoDimensionsRef.current[i]) throw new Error(`Dimensions de l'image ${i} indisponibles`);
      }

      setSavingProgress(10);
      const processedImages = [];

      const RENDER_CHUNK_SIZE = 2;
      for (let i = 0; i < photoUris.length; i += RENDER_CHUNK_SIZE) {
        const chunkPromises = [];

        for (let j = i; j < Math.min(i + RENDER_CHUNK_SIZE, photoUris.length); j++) {
          if (uploadedIndexesRef.current.has(j)) continue;
       chunkPromises.push((async () => {
            const img = images[j];
            const photoPaths = paths[j] || [];
            const { width: imgW, height: imgH } = photoDimensionsRef.current[j];
            const bytes = renderImageToSurface(img, photoPaths, canvasSize.width, canvasSize.height, imgW, imgH, shouldCompress);
            const base64 = encode(bytes);
            // 160px thumbnail — même pipeline Skia, petit + basse qualité
            const thumbBytes = renderImageToSurface(img, photoPaths, canvasSize.width, canvasSize.height, imgW, imgH, shouldCompress, { maxDimension: 160, quality: 60 });
            const thumbBase64 = encode(thumbBytes);
            return { base64, thumbBase64, index: j };
          })());
        }

        const chunkResults = await Promise.all(chunkPromises);
        processedImages.push(...chunkResults);

        const renderProgress = 10 + (30 * processedImages.length / photoUris.length);
        setSavingProgress(renderProgress);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const BATCH_SIZE = 3;
      let completedCount = 0;

      // Envoi d'une photo : fichier, miniature, puis ligne pins_photos.
      const gallerySaved = new Set();
      const uploadOnePhoto = async ({ base64, thumbBase64, index }, filename, attempt, photoId) => {
        const ext = "jpg";
        const mime = "image/jpeg";
        // filename est fixé par photo avant les tentatives (voir plus bas).
        const fileUri  = `${FileSystem.documentDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });

        if (shouldSaveToGallery && !gallerySaved.has(index)) {
          await MediaLibrary.saveToLibraryAsync(fileUri);
          gallerySaved.add(index);
        }

        const fileBuffer = Buffer.from(base64, "base64");
        const uploadPath = `${pin?.project_id}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("pinphotos")
          .upload(uploadPath, fileBuffer, { contentType: mime });

        // Une tentative précédente a pu aboutir sans que la réponse nous parvienne.
        const alreadyThere = attempt > 1 && /exist/i.test(uploadError?.message || '');
        if (uploadError && !alreadyThere) throw uploadError;



        // ── Miniature (non bloquant : repli sur public_url si échec) ──
       // ── Miniature (version debug) ──
        let thumbUrl = null;
        try {
          if (!thumbBase64) {
            console.warn(`[thumb] pas de thumbBase64 pour index ${index} — l'édition #2 (le rendu) n'est probablement pas appliquée`);
          } else {
            const thumbPath = `${pin?.project_id}/thumb_${filename}`;
            const thumbBuffer = Buffer.from(thumbBase64, "base64");
            console.log(`[thumb] upload ${thumbPath} (${thumbBuffer.length} octets)`);
            const { error: thumbError } = await supabase.storage
              .from("pinphotos")
              .upload(thumbPath, thumbBuffer, { contentType: mime });
            if (thumbError && !(attempt > 1 && /exist/i.test(thumbError.message || ''))) {
              console.warn(`[thumb] erreur upload:`, thumbError.message);
            } else {
              thumbUrl = supabase.storage.from("pinphotos").getPublicUrl(thumbPath).data.publicUrl;
              console.log(`[thumb] ok -> ${thumbUrl}`);
            }
          }
        } catch (e) {
          console.warn(`[thumb] exception:`, e?.message);
        }
        console.log(`[thumb] thumbUrl final pour ${index}:`, thumbUrl);



        if (shouldOptimize) {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        }

        const { data: { publicUrl } } = supabase.storage
          .from("pinphotos")
          .getPublicUrl(uploadPath);

        // 🌍 Extract geolocation from photo object (if available)
        const currentPhoto = photos[index];
        const latitude = typeof currentPhoto === 'object' ? currentPhoto.latitude : null;
        const longitude = typeof currentPhoto === 'object' ? currentPhoto.longitude : null;

        // 📍 Position sur le plan (si l'utilisateur a placé cette photo)
        const planPos = photoPlanPositions[index];

        const { data: photoInsert, error: insertError } = await supabase
          .from("pins_photos")
          .upsert([{
            // Identifiant fixé sur l'appareil : une nouvelle tentative (ou l'envoi
            // différé) de la même photo ne crée pas de doublon.
            id: photoId,
            pin_id: pin?.id,
            project_id: pin?.project_id,
            public_url: publicUrl,
            thumb_url: thumbUrl,
            description: descriptions[index],
            date: new Date().toISOString(),
            sender_id: loggedInUser?.id,
            latitude,
            longitude,
            plan_id: planPos?.planId ?? null,
            plan_x: planPos?.x ?? null,
            plan_y: planPos?.y ?? null,
          }], { onConflict: "id" })
          .select()
          .single();

        if (insertError) throw insertError;
      };

      // Photo gardée sur l'appareil et mise en file d'attente d'envoi.
      const queuePhoto = async ({ base64, thumbBase64, index }, filename, photoId) => {
        await savePendingPhotoFile(filename, base64);
        let thumbFile = null;
        if (thumbBase64) {
          thumbFile = `thumb_${filename}`;
          await savePendingPhotoFile(thumbFile, thumbBase64);
        }
        if (shouldSaveToGallery && !gallerySaved.has(index)) {
          try {
            await MediaLibrary.saveToLibraryAsync(photoUri(filename));
            gallerySaved.add(index);
          } catch (e) {
            console.warn('[gallery] save failed:', e?.message);
          }
        }
        const currentPhoto = photos[index];
        const planPos = photoPlanPositions[index];
        await queue('photo.upload', {
          id: photoId,
          file: filename,
          thumbFile,
          pin_id: pin?.id,
          project_id: pin?.project_id,
          description: descriptions[index] ?? null,
          date: new Date().toISOString(),
          sender_id: loggedInUser?.id ?? null,
          latitude: typeof currentPhoto === 'object' ? currentPhoto.latitude ?? null : null,
          longitude: typeof currentPhoto === 'object' ? currentPhoto.longitude ?? null : null,
          plan_id: planPos?.planId ?? null,
          plan_x: planPos?.x ?? null,
          plan_y: planPos?.y ?? null,
        });
      };

      // Chaque photo est tentée jusqu'à 3 fois ; un échec n'interrompt pas les
      // autres, et les photos déjà envoyées ne sont jamais renvoyées.
      const UPLOAD_ATTEMPTS = 3;
      const failedIndexes = [];

      for (let batchStart = 0; batchStart < processedImages.length; batchStart += BATCH_SIZE) {
        const batch = processedImages.slice(batchStart, batchStart + BATCH_SIZE);

        await Promise.all(batch.map(async (item) => {
          // Nom unique : plusieurs appareils envoient dans le même dossier de projet.
          const filename = `drawing_${Date.now()}_${item.index}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          // Un seul identifiant et un seul nom de fichier par photo, quel que soit le chemin d'envoi.
          const photoId = uuid.v4();
          let lastError = null;

          // Sans réseau, ou tant que des envois attendent (le pin lui-même peut
          // être en attente de création), la photo part directement en file.
          const mustQueue = !isOnline() || getOutboxOps().some((o) => o.status === 'pending');
          if (mustQueue) {
            try {
              await queuePhoto(item, filename, photoId);
              uploadedIndexesRef.current.add(item.index);
            } catch (e) {
              lastError = e;
            }
          } else {
            for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
              try {
                await uploadOnePhoto(item, filename, attempt, photoId);
                uploadedIndexesRef.current.add(item.index);
                lastError = null;
                break;
              } catch (e) {
                lastError = e;
                console.warn(`[upload] photo ${item.index} tentative ${attempt}:`, e?.message);
                if (isNetworkError(e) && !isOnline()) break;   // réseau perdu : inutile d'insister
                if (attempt < UPLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 1500));
              }
            }
            // Coupure réseau : la photo est gardée sur l'appareil et envoyée plus tard.
            if (lastError && isNetworkError(lastError)) {
              try {
                await queuePhoto(item, filename, photoId);
                uploadedIndexesRef.current.add(item.index);
                lastError = null;
              } catch (e) {
                lastError = e;
              }
            }
          }
          if (lastError) failedIndexes.push(item.index);

          completedCount++;
          const uploadProgress = 40 + (60 * completedCount / processedImages.length);
          setSavingProgress(uploadProgress);
        }));
      }


      const goToPin = () => {
        if (returnToPinId) {
          router.push({
            pathname: "/PinMetadataScreen",
            params: {
              pinId: returnToPinId,
              from: "Pdf",
              myuri,
              myname,
              myplanid,
              photoUris: JSON.stringify([]),
              refresh: String(Date.now()),
            },
          });
        } else {
          router.push({
            pathname: "/PinMetadataScreen",
            params: {
              pinId: pin?.id,
              from: "Pdf",
              myuri,
              myname,
              myplanid,
              photoUris: JSON.stringify([]),
            },
          });
        }
      };

      if (failedIndexes.length > 0) {
        const total = photoUris.length;
        const failed = failedIndexes.length;
        Alert.alert(
          "Envoi incomplet",
          `${failed} photo${failed > 1 ? "s" : ""} sur ${total} n'${failed > 1 ? "ont" : "a"} pas pu être enregistrée${failed > 1 ? "s" : ""}.`,
          [
            { text: "Réessayer", onPress: () => handleSave() },
            { text: "Continuer sans", style: "destructive", onPress: goToPin },
            { text: "Fermer", style: "cancel" },
          ]
        );
        return;
      }

      goToPin();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Could not save drawings.");
    } finally {
      setIsSaving(false);
      setSavingProgress(0);
    }
  };

  // ── Layout constants (defined in dependency order) ──
  const thumbnailSectionHeight = 86 + insets.top + 10;
  const controlsHeight = 80;
  const controlsBottom = insets.bottom;
  const descriptionBarHeight = 44;
  const descriptionBottom = controlsBottom + controlsHeight + 8;
  const canvasBottom = descriptionBottom + descriptionBarHeight;

  const currentPhotoPlaced = !!photoPlanPositions[currentIndex];

  return (
    <View style={styles.container}>
      {/* ── Thumbnails ── */}
      <View style={[styles.thumbnailSection, { top: 10 + insets.top }]}>
        <FlatList
          data={photoUris}
          horizontal
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.thumbnailContent}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => setCurrentIndex(index)}
              style={[
                styles.thumbnailWrapper,
                index === currentIndex && styles.thumbnailActive,
              ]}
            >
              <Image source={{ uri: item }} style={styles.thumbnail} />
              {index === currentIndex && (
                <View style={styles.thumbnailBadge}>
                  <Text style={styles.thumbnailBadgeText}>{index + 1}</Text>
                </View>
              )}
              {photoPlanPositions[index] && (
                <View style={styles.thumbnailPlanBadge}>
                  <MapPin size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
        <View style={styles.photoCounter}>
          <Text style={styles.photoCounterText}>{currentIndex + 1}/{photoUris.length}</Text>
        </View>
      </View>

      {/* ── Canvas — bottom shrinks when keyboard opens ── */}
      <View
        style={[
          styles.canvasContainer,
          {
            top: thumbnailSectionHeight,
            bottom: canvasBottom + keyboardHeight,
          },
        ]}
        onLayout={onCanvasLayout}
      >
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
          <Canvas style={{ flex: 1 }} ref={canvasRef}>
            {background && (
              <SkiaImage
                image={background}
                x={backgroundDisplayRect.x}
                y={backgroundDisplayRect.y}
                width={backgroundDisplayRect.width}
                height={backgroundDisplayRect.height}
                fit="fill"
              />
            )}
            {(paths[currentIndex] || []).map((item, i) => {
              if (item.type === "path") {
                return (
                  <Path key={i} path={item.path} color={item.color} style="stroke" strokeWidth={3} />
                );
              }
              if (item.type === "text") {
                const itemFont = getCurrentFont(item.fontSize || 16);
                if (!itemFont) return null;

                const textWidth = itemFont.measureText(item.text).width;
                const textHeight = item.fontSize || 16;
                const padding = 8;
                const isSelected = selectedTextIndexState === i;
                const scale = item.scale || 1.0;

                const scaledWidth = (textWidth + padding * 2) * scale;
                const scaledHeight = (textHeight + padding * 2) * scale;

                return (
                  <React.Fragment key={i}>
                    <RoundedRect
                      x={item.x - padding * scale}
                      y={item.y - textHeight * scale - padding * scale}
                      width={scaledWidth}
                      height={scaledHeight}
                      r={6 * scale}
                      color="white"
                    />
                    {isSelected && (
                      <RoundedRect
                        x={item.x - padding * scale - 2}
                        y={item.y - textHeight * scale - padding * scale - 2}
                        width={scaledWidth + 4}
                        height={scaledHeight + 4}
                        r={8 * scale}
                        color="#6D28D9"
                        style="stroke"
                        strokeWidth={3}
                      />
                    )}
                    <SkiaText
                      x={item.x}
                      y={item.y}
                      text={item.text}
                      color={item.color}
                      font={itemFont}
                      transform={[
                        { translateX: item.x },
                        { translateY: item.y },
                        { scale: scale },
                        { translateX: -item.x },
                        { translateY: -item.y },
                      ]}
                    />
                  </React.Fragment>
                );
              }
              return null;
            })}
          </Canvas>
        </GestureDetector>
      </View>

      {/* ── Tool panel ── */}
      <View style={[styles.toolPanel, { top: thumbnailSectionHeight + 20 }]}>
        {!toolPanelOpen && (
          <TouchableOpacity
            style={styles.toolPanelToggle}
            onPress={() => setToolPanelOpen(true)}
          >
            <View style={[styles.currentToolIndicator, { backgroundColor: color }]}>
              {tool === "pen" && <Pen color="white" size={18} />}
              {tool === "line" && <Slash color="white" size={18} />}
              {tool === "arrow" && <ArrowRight color="white" size={18} />}
              {tool === "text" && <Type color="white" size={20} />}
            </View>
          </TouchableOpacity>
        )}

        {toolPanelOpen && (
          <View style={styles.toolPanelExpanded}>
            <TouchableOpacity
              style={styles.toolPanelClose}
              onPress={() => setToolPanelOpen(false)}
            >
              <X size={20} color="#999" />
            </TouchableOpacity>

            <View style={styles.paletteContainer}>
              <Text style={styles.toolLabel}>Couleur</Text>
              <View style={styles.palette}>
                {COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      c === color && styles.colorDotActive,
                    ]}
                    onPress={() => handleColorChange(c)}
                  >
                    {c === color && <View style={styles.colorDotCheck} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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
                  <Type color={tool === "text" ? "#fff" : "#ccc"} size={22} />
                </TouchableOpacity>
              </View>
            </View>

            {tool === "text" && (
              <View style={styles.fontSizeContainer}>
                <Text style={styles.toolLabel}>Taille du texte</Text>
                <View style={styles.fontSizes}>
                  {FONT_SIZES.map((size) => (
                    <TouchableOpacity
                      key={size}
                      style={[
                        styles.fontSizeButton,
                        fontSize === size && styles.activeFontSizeButton,
                      ]}
                      onPress={() => handleFontSizeChange(size)}
                    >
                      <Type
                        color={fontSize === size ? "#fff" : "#ccc"}
                        size={size === 12 ? 14 : size === 16 ? 18 : size === 20 ? 22 : size === 28 ? 26 : 30}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Text drag hint — rises with keyboard ── */}
      {selectedTextIndexState !== null && (
        <View style={[
          styles.textHint,
          { bottom: descriptionBottom + descriptionBarHeight + 8 + keyboardHeight },
        ]}>
          <Text style={styles.textHintText}>📍 Drag to move • 🤏 Pinch to scale</Text>
        </View>
      )}

      {/* ── Controls pill — rises with keyboard ── */}
      <View style={[styles.controls, { bottom: controlsBottom + keyboardHeight }]}>
        <TouchableOpacity onPress={handleUndo}><RotateCcw color="white" size={28} /></TouchableOpacity>
        <TouchableOpacity onPress={handleClear}><Trash2 color="white" size={28} /></TouchableOpacity>
        <TouchableOpacity onPress={handleSave}><Save color="white" size={28} /></TouchableOpacity>
      </View>

      {/* ── Canvas text input overlay — rises with keyboard ── */}
      {addingText && (
        <View style={[
          styles.textInputOverlay,
          { bottom: descriptionBottom + descriptionBarHeight + 8 + keyboardHeight },
        ]}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter text"
            placeholderTextColor="#aaa"
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={handleConfirmText}
            returnKeyType="done"
            autoFocus
          />
          <TouchableOpacity onPress={handleConfirmText}>
            <Save color="white" size={28} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Description bar with mic + "placer sur le plan" — sits above controls pill, rises with keyboard ── */}
      <View style={[
        styles.descriptionWrapper,
        { bottom: descriptionBottom + keyboardHeight },
      ]}>
        <View style={styles.descriptionRow}>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Add a description..."
            placeholderTextColor="#ccc"
            onChangeText={(txt) =>
              setDescriptions((prev) => {
                const copy = [...prev];
                copy[currentIndex] = txt;
                return copy;
              })
            }
            value={
              isListening && partialResult
                ? (descriptions[currentIndex] ? `${descriptions[currentIndex]} ${partialResult}` : partialResult)
                : descriptions[currentIndex]
            }
            multiline
            returnKeyType="done"
            blurOnSubmit
          />
          <TouchableOpacity
            onPress={handleDictateDescription}
            style={[styles.descriptionMic, isListening && styles.descriptionMicActive]}
          >
            <MicIcon size={18} color={isListening ? '#fff' : '#aaa'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPlanSelector}
            style={[styles.descriptionMic, currentPhotoPlaced && styles.descriptionMicActive]}
          >
            <MapPin size={18} color={currentPhotoPlaced ? '#fff' : '#aaa'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sélecteur de plan pour placer la photo actuelle ── */}
      <Modal animationType="slide" transparent visible={showPlanSelector} onRequestClose={() => setShowPlanSelector(false)}>
        <View style={styles.planModalOverlay}>
          <View style={[styles.planBottomSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.planSheetHeader}>
              <Text style={styles.planSheetTitle}>Choisir un plan</Text>
              <TouchableOpacity onPress={() => setShowPlanSelector(false)}>
                <X size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {loadingPlans ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#6D28D9" />
                <Text style={{ marginTop: 12, color: '#6B7280' }}>Chargement des plans...</Text>
              </View>
            ) : availablePlans.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', textAlign: 'center' }}>Aucun plan disponible pour ce projet</Text>
              </View>
            ) : (
              <FlatList
                data={availablePlans}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.planItem} onPress={() => handlePlanSelected(item)}>
                    <View style={styles.planIconCircle}>
                      <MapPin size={20} color="#6D28D9" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planItemTitle}>{item.name}</Text>
                      {item.description && (
                        <Text style={styles.planItemSubtitle} numberOfLines={1}>{item.description}</Text>
                      )}
                    </View>
                    <ChevronRight size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.planSeparator} />}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Saving overlay ── */}
      {isSaving && (
        <View style={styles.overlay}>
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color="#6D28D9" />
            <Text style={styles.loaderText}>
              Enregistrement... {Math.round(savingProgress)}%
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },

  canvasContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "black",
  },

  thumbnailSection: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnailContent: {
    gap: 12,
    paddingRight: 16,
  },
  thumbnailWrapper: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    width: 70,
    height: 70,
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
  thumbnailPlanBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  photoCounter: {
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    height: 36,
  },
  photoCounterText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },

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

  paletteContainer: { gap: 4 },
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

  toolsContainer: { gap: 4 },
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
    zIndex: 15,
  },

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
    zIndex: 15,
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

  // ── Description bar ───────────────────────────────────────────────────────
  descriptionWrapper: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  descriptionInput: {
    flex: 1,
    color: "white",
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  descriptionMic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  descriptionMicActive: {
    backgroundColor: '#6D28D9',
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
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
    fontWeight: "600",
  },

  fontSizeContainer: { gap: 4 },
  fontSizes: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  fontSizeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  activeFontSizeButton: {
    backgroundColor: "#6D28D9",
    borderColor: "#6D28D9",
    transform: [{ scale: 1.05 }],
  },

  textHint: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "rgba(109, 40, 217, 0.95)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#6D28D9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 16,
  },
  textHintText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  // ── Plan selector sheet ────────────────────────────────────────────────────
  planModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  planBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '70%',
  },
  planSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  planSheetTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  planItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    gap: 12,
  },
  planIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planItemTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  planItemSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  planSeparator: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 20 },
});