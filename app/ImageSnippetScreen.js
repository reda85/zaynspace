// ImageSnippetScreen.jsx
// Capture snippets from tiled images (same infrastructure as ImagePinPlacementScreen)

import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Scissors } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { supabase } from '../lib/supabase';

const WINDOW = Dimensions.get('window');
const TILE_SIZE = 512;
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const USE_BACKEND = API_URL && !API_URL.includes('localhost');

export default function ImageSnippetScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { myuri, myname, myplanid, pinId, returnToPinId, pdfInfo: pdfInfoParam } = params;

    const imageWrapperRef = useRef(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isLoadingImage, setIsLoadingImage] = useState(true);

    // Parse pdfInfo (contains width, height, tilesPath)
    const pdfInfo = useMemo(() => {
        console.log('🔍 ImageSnippetScreen pdfInfoParam:', pdfInfoParam);
        
        if (!pdfInfoParam) {
            console.error('❌ pdfInfo parameter is missing');
            return null;
        }

        try {
            const parsed = JSON.parse(pdfInfoParam);
            console.log('✅ pdfInfo parsed:', parsed);
            
            if (!parsed.width || !parsed.height || !parsed.tilesPath) {
                console.error('❌ pdfInfo missing required fields:', parsed);
                return null;
            }
            
            return parsed;
        } catch (e) {
            console.error('❌ Failed to parse pdfInfo:', e);
            return null;
        }
    }, [pdfInfoParam]);

    if (!pdfInfo || !pdfInfo.width || !pdfInfo.height) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Image info manquante</Text>
                    <Text style={styles.errorSubtext}>
                        pdfInfo: {pdfInfoParam ? 'fourni mais invalide' : 'non fourni'}
                    </Text>
                    <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Text style={styles.backButtonText}>Retour</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Calculate minimum scale to fit screen
    const minScale = useMemo(() => {
        const scaleToFitWidth = WINDOW.width / pdfInfo.width;
        const scaleToFitHeight = WINDOW.height / pdfInfo.height;
        return Math.min(scaleToFitWidth, scaleToFitHeight) * 0.9;
    }, [pdfInfo.width, pdfInfo.height]);

    const initialScale = useMemo(() => minScale, [minScale]);

    // Center the image
    const initialTranslate = useMemo(() => {
        const scaledWidth = pdfInfo.width * initialScale;
        const scaledHeight = pdfInfo.height * initialScale;
        return {
            x: (WINDOW.width - scaledWidth) / 2,
            y: (WINDOW.height - scaledHeight) / 2,
        };
    }, [pdfInfo.width, pdfInfo.height, initialScale]);

    // Animation values
    const scale = useSharedValue(initialScale);
    const translateX = useSharedValue(initialTranslate.x);
    const translateY = useSharedValue(initialTranslate.y);

    const panSavedTranslateX = useSharedValue(initialTranslate.x);
    const panSavedTranslateY = useSharedValue(initialTranslate.y);

    const pinchSavedScale = useSharedValue(initialScale);
    const pinchSavedTranslateX = useSharedValue(initialTranslate.x);
    const pinchSavedTranslateY = useSharedValue(initialTranslate.y);
    const pinchStartFocalX = useSharedValue(0);
    const pinchStartFocalY = useSharedValue(0);

    const [viewport, setViewport] = useState({
        scale: initialScale,
        translateX: initialTranslate.x,
        translateY: initialTranslate.y,
    });

    const updateViewport = useCallback((newScale, newTranslateX, newTranslateY) => {
        setViewport({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY });
    }, []);

    useEffect(() => {
        updateViewport(initialScale, initialTranslate.x, initialTranslate.y);
        setIsLoadingImage(false);
    }, [initialScale, initialTranslate.x, initialTranslate.y, updateViewport]);

    // Calculate zoom levels and tiles
    const maxLevel = useMemo(() => {
        const maxDimension = Math.max(pdfInfo.width, pdfInfo.height);
        return Math.ceil(Math.log2(maxDimension));
    }, [pdfInfo.width, pdfInfo.height]);

    const baseLevel = useMemo(() => Math.max(0, maxLevel - 6), [maxLevel]);

    const zoomLevels = useMemo(() => {
        const scaleRatio = viewport.scale / minScale;
        const continuousZoom = Math.log2(scaleRatio);
        const levelAtMinScale = maxLevel - 5;
        const currentLevel = Math.floor(continuousZoom) + levelAtMinScale;
        const percent = continuousZoom - Math.floor(continuousZoom);
        
        const shouldLoadNext = percent > 0.5;
        
        return {
            current: Math.min(maxLevel, Math.max(0, currentLevel)),
            next: shouldLoadNext ? Math.min(maxLevel, Math.max(0, currentLevel + 1)) : null,
            percent,
        };
    }, [viewport.scale, minScale, maxLevel]);

    const getTileUrl = useCallback((level, col, row) => {
        if (USE_BACKEND) {
            return `${API_URL}/api/tiles/${myplanid}/${level}/${col}_${row}.jpeg`;
        } else {
            const storagePath = `${pdfInfo.tilesPath}_files/${level}/${col}_${row}.jpeg`;
            const { data } = supabase.storage.from('project-plans').getPublicUrl(storagePath);
            return data.publicUrl;
        }
    }, [myplanid, pdfInfo.tilesPath]);

    const renderLayer = useCallback((level, isBaseLevel = false) => {
        const tileSize = TILE_SIZE;
        const levelScale = Math.pow(2, maxLevel - level);
        const levelWidth = Math.ceil(pdfInfo.width / levelScale);
        const levelHeight = Math.ceil(pdfInfo.height / levelScale);
        const maxCol = Math.ceil(levelWidth / TILE_SIZE) - 1;
        const maxRow = Math.ceil(levelHeight / TILE_SIZE) - 1;

        let startCol = 0, endCol = maxCol, startRow = 0, endRow = maxRow;

        if (!isBaseLevel) {
            const buffer = WINDOW.width * 0.5;
            const minX = Math.max(0, (-viewport.translateX - buffer) / viewport.scale);
            const maxX = (-viewport.translateX + WINDOW.width + buffer) / viewport.scale;
            const minY = Math.max(0, (-viewport.translateY - buffer) / viewport.scale);
            const maxY = (-viewport.translateY + WINDOW.height + buffer) / viewport.scale;

            startCol = Math.max(0, Math.floor(minX / (tileSize * levelScale)));
            endCol = Math.min(maxCol, Math.ceil(maxX / (tileSize * levelScale)));
            startRow = Math.max(0, Math.floor(minY / (tileSize * levelScale)));
            endRow = Math.min(maxRow, Math.ceil(maxY / (tileSize * levelScale)));
        }

        const tiles = [];
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const tileUri = getTileUrl(level, c, r);
                const tileWidthInLevel = Math.min(tileSize, levelWidth - (c * tileSize));
                const tileHeightInLevel = Math.min(tileSize, levelHeight - (r * tileSize));
                const width = tileWidthInLevel * levelScale;
                const height = tileHeightInLevel * levelScale;

                tiles.push(
                    <TileImage
                        key={`${level}-${c}-${r}`}
                        uri={tileUri}
                        left={c * tileSize * levelScale}
                        top={r * tileSize * levelScale}
                        width={width}
                        height={height}
                    />
                );
            }
        }
        return tiles;
    }, [pdfInfo.width, pdfInfo.height, maxLevel, viewport, getTileUrl]);

    const handleClose = () => {
        if (returnToPinId) {
            router.back();
        } else {
            router.navigate({
                pathname: '/plans/MainScreen',
                params: {
                    myuri,
                    myname,
                    myplanid,
                    refresh: Date.now(),
                },
            });
        }
    };

    const handleResetZoom = () => {
        scale.value = withSpring(initialScale);
        translateX.value = withSpring(initialTranslate.x);
        translateY.value = withSpring(initialTranslate.y);
        
        panSavedTranslateX.value = initialTranslate.x;
        panSavedTranslateY.value = initialTranslate.y;
        pinchSavedScale.value = initialScale;
        pinchSavedTranslateX.value = initialTranslate.x;
        pinchSavedTranslateY.value = initialTranslate.y;
        
        updateViewport(initialScale, initialTranslate.x, initialTranslate.y);
    };

   const handleCaptureSnapshot = async () => {
    if (!imageWrapperRef.current) {
        Alert.alert('Erreur', 'Vue image non disponible');
        return;
    }

    setIsCapturing(true);

    try {
        // Step 1: Capture to temp file
        const tmpUri = await captureRef(imageWrapperRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
        });

        console.log('📸 Captured:', tmpUri);

        // Step 2: Copy to permanent location Skia can access
        const filename = `snippet_${Date.now()}.png`;
        const permanentUri = `${FileSystem.documentDirectory}${filename}`;
        
        await FileSystem.copyAsync({
            from: tmpUri,
            to: permanentUri
        });

        console.log('✅ Copied to:', permanentUri);

        // Step 3: Navigate with permanent URI
        router.push({
            pathname: '/DrawingScreen',
            params: {
                photos: JSON.stringify([permanentUri]),  // ✅ Use this
                pinId: pinId || returnToPinId,
                myuri,
                myname,
                myplanid,
                returnToPinId,
                from: 'snippet',
            },
        });
    } catch (error) {
        console.error('❌ Error:', error);
        Alert.alert('Erreur', 'Impossible de capturer le snippet');
    } finally {
        setIsCapturing(false);
    }
};

    // PINCH GESTURE
    const pinchGesture = Gesture.Pinch()
        .onStart((event) => {
            pinchSavedScale.value = scale.value;
            pinchSavedTranslateX.value = translateX.value;
            pinchSavedTranslateY.value = translateY.value;
            pinchStartFocalX.value = event.focalX;
            pinchStartFocalY.value = event.focalY;
        })
        .onUpdate((event) => {
            const fx = pinchStartFocalX.value;
            const fy = pinchStartFocalY.value;
            
            const imageX = (fx - pinchSavedTranslateX.value) / pinchSavedScale.value;
            const imageY = (fy - pinchSavedTranslateY.value) / pinchSavedScale.value;
            
            scale.value = Math.max(minScale, Math.min(5.0, pinchSavedScale.value * event.scale));
            
            translateX.value = fx - (imageX * scale.value);
            translateY.value = fy - (imageY * scale.value);
        })
        .onEnd(() => {
            panSavedTranslateX.value = translateX.value;
            panSavedTranslateY.value = translateY.value;
            pinchSavedScale.value = scale.value;
            pinchSavedTranslateX.value = translateX.value;
            pinchSavedTranslateY.value = translateY.value;
            runOnJS(updateViewport)(scale.value, translateX.value, translateY.value);
        });

    // PAN GESTURE
    const panGesture = Gesture.Pan()
        .minDistance(10)
        .maxPointers(1)
        .onStart(() => {
            panSavedTranslateX.value = translateX.value;
            panSavedTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
            translateX.value = panSavedTranslateX.value + event.translationX;
            translateY.value = panSavedTranslateY.value + event.translationY;
        })
        .onEnd(() => {
            panSavedTranslateX.value = translateX.value;
            panSavedTranslateY.value = translateY.value;
            pinchSavedTranslateX.value = translateX.value;
            pinchSavedTranslateY.value = translateY.value;
            runOnJS(updateViewport)(scale.value, translateX.value, translateY.value);
        });

    // DOUBLE TAP GESTURE
    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            runOnJS(handleResetZoom)();
        });

    const simultaneousGesture = Gesture.Simultaneous(
        pinchGesture,
        panGesture.simultaneousWithExternalGesture(pinchGesture)
    );

    const composedGesture = Gesture.Race(doubleTapGesture, simultaneousGesture);

    const imageContainerStyle = useAnimatedStyle(() => ({
        width: pdfInfo.width,
        height: pdfInfo.height,
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
        transformOrigin: 'top left',
    }));

    return (
        <GestureHandlerRootView style={styles.container}>
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: 'Snippet de l\'image',
                        headerStyle: {
                            backgroundColor: '#fff',
                        },
                        headerTitleStyle: {
                            color: '#000',
                            fontFamily: 'Outfit_600SemiBold',
                            fontSize: 18,
                        },
                        headerLeft: () => (
                            <TouchableOpacity
                                onPress={handleClose}
                                style={{ padding: 8 }}
                            >
                                <ArrowLeft size={20} color="#000" />
                            </TouchableOpacity>
                        ),
                        headerRight: () => (
                            <TouchableOpacity
                                onPress={handleResetZoom}
                                style={{
                                    marginRight: 12,
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                }}
                            >
                                <Text
                                    style={{
                                        color: 'darkmagenta',
                                        fontFamily: 'Outfit_500Medium',
                                        fontSize: 14,
                                    }}
                                >
                                    Réinitialiser
                                </Text>
                            </TouchableOpacity>
                        ),
                    }}
                />

                {/* Instructions */}
                <View style={styles.instructionsContainer}>
                    <Text style={styles.instructionsText}>
                        Pincez pour zoomer • Glissez pour déplacer • Double-tap pour réinitialiser
                    </Text>
                </View>

                {/* Image Viewer with Tiles */}
                <View style={styles.imageContainer} ref={imageWrapperRef} collapsable={false}>
                    {isLoadingImage ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#ec4899" />
                            <Text style={styles.loadingText}>Chargement de l'image...</Text>
                        </View>
                    ) : (
                        <GestureDetector gesture={composedGesture}>
                            <View style={styles.gestureContainer}>
                                <Animated.View style={[styles.animatedContainer, imageContainerStyle]}>
                                    {/* Base layer */}
                                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                        {renderLayer(baseLevel, true)}
                                    </View>
                                    
                                    {/* Current zoom level */}
                                    {zoomLevels.current !== baseLevel && (
                                        <View 
                                            style={[
                                                StyleSheet.absoluteFill,
                                                { opacity: zoomLevels.next === null ? 1 : 1 - (zoomLevels.percent - 0.5) * 2 }
                                            ]} 
                                            pointerEvents="none"
                                        >
                                            {renderLayer(zoomLevels.current, false)}
                                        </View>
                                    )}
                                    
                                    {/* Next zoom level */}
                                    {zoomLevels.next !== null && zoomLevels.next !== zoomLevels.current && zoomLevels.next !== baseLevel && (
                                        <View 
                                            style={[
                                                StyleSheet.absoluteFill, 
                                                { opacity: (zoomLevels.percent - 0.5) * 2 }
                                            ]} 
                                            pointerEvents="none"
                                        >
                                            {renderLayer(zoomLevels.next, false)}
                                        </View>
                                    )}
                                </Animated.View>
                            </View>
                        </GestureDetector>
                    )}
                </View>

                {/* Capture Button */}
                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={[
                            styles.captureButton,
                            isCapturing && styles.captureButtonDisabled
                        ]}
                        onPress={handleCaptureSnapshot}
                        disabled={isCapturing}
                    >
                        <Scissors size={24} color="#fff" />
                        <Text style={styles.captureButtonText}>
                            {isCapturing ? 'Capture en cours...' : 'Capturer le snippet'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

// Memoized tile component
const TileImage = React.memo(({ uri, left, top, width, height }) => (
    <ExpoImage
        source={{ uri }}
        style={{ position: 'absolute', left, top, width, height }}
        cachePolicy="memory-disk"
        transition={0}
        contentFit="cover"
        onError={() => {
            if (__DEV__) console.log(`❌ Failed to load tile: ${uri}`);
        }}
    />
));

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1f2937',
    },
    instructionsContainer: {
        backgroundColor: '#374151',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    instructionsText: {
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        color: '#d1d5db',
        textAlign: 'center',
    },
    imageContainer: {
        flex: 1,
        backgroundColor: '#1f2937',
        overflow: 'hidden',
    },
    gestureContainer: {
        flex: 1,
        overflow: 'hidden',
    },
    animatedContainer: {
        position: 'absolute',
        backgroundColor: 'white',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f2937',
        gap: 16,
    },
    loadingText: {
        color: '#d1d5db',
        fontSize: 16,
        fontFamily: 'Outfit_500Medium',
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f2937',
        padding: 20,
        gap: 12,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        fontFamily: 'Outfit_600SemiBold',
        textAlign: 'center',
    },
    errorSubtext: {
        color: '#9ca3af',
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        textAlign: 'center',
    },
    backButton: {
        backgroundColor: '#374151',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 8,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: 'Outfit_500Medium',
    },
    bottomBar: {
        backgroundColor: '#111827',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#374151',
    },
    captureButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ec4899',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        gap: 8,
    },
    captureButtonDisabled: {
        backgroundColor: '#9ca3af',
        opacity: 0.7,
    },
    captureButtonText: {
        fontSize: 16,
        fontFamily: 'Outfit_600SemiBold',
        color: '#fff',
    },
});