import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import { CheckIcon, X as CloseIcon, DropletsIcon, FireExtinguisherIcon, GripIcon, MapPin, PaintRoller, ZapIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { categoriesAtom, MetaPinAtom, pinsAtom, selectedPinAtom, statusesAtom } from '../store/atoms';

const WINDOW = Dimensions.get('window');
const TILE_SIZE = 512;
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const USE_BACKEND = API_URL && !API_URL.includes('localhost');

const getCategoryIconComponent = (iconName, color = 'white', size = 20) => {
    switch (iconName) {
        case 'zap': return <ZapIcon color={color} size={size} />;
        case 'droplets': return <DropletsIcon color={color} size={size} />;
        case 'paint': return <PaintRoller color={color} size={size} />;
        case 'carrelage': return <GripIcon color={color} size={size} />;
        case 'fire-extinguisher': return <FireExtinguisherIcon color={color} size={size} />;
        case 'unassigned':
        default: return <CheckIcon color={color} size={size} />;
    }
};

const AnimatedView = Animated.createAnimatedComponent(View);

export default function ImagePinPlacementScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const { 
        myuri, 
        myname, 
        myplanid, 
        pinIdToPlace, 
        x, 
        y, 
        userRole,
        pdfInfo: pdfInfoParam  // Using same param name as PdfViewerWithTiles
    } = params;

    const [pins, setPins] = useAtom(pinsAtom);
    const [selectedPin] = useAtom(selectedPinAtom);
    const [categories] = useAtom(categoriesAtom);
    const [statuses] = useAtom(statusesAtom);
   
    const pin = pins?.find(p => p.id === pinIdToPlace) || selectedPin;

    // Check if user can place pins
    const canPlacePin = userRole !== 'guest' && userRole !== 'observer';

    const [isLoadingImage, setIsLoadingImage] = useState(true);
    const [pendingCoordinates, setPendingCoordinates] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [imageContainerTop, setImageContainerTop] = useState(0);
    const [bottomBarHeight, setBottomBarHeight] = useState(0);
    const [metapin, setMetapin] = useAtom(MetaPinAtom);

    const imageWrapperRef = useRef(null);

    // Parse pdfInfo from params (same as PdfViewerWithTiles - contains width, height, tilesPath)
    const pdfInfo = useMemo(() => {
        console.log('🔍 pdfInfoParam received:', pdfInfoParam);
        
        if (!pdfInfoParam) {
            console.error('❌ pdfInfo parameter is missing');
            return null;
        }

        try {
            const parsed = JSON.parse(pdfInfoParam);
            console.log('✅ pdfInfo parsed successfully:', parsed);
            
            // Validate required fields
            if (!parsed.width || !parsed.height || !parsed.tilesPath) {
                console.error('❌ pdfInfo missing required fields:', {
                    hasWidth: !!parsed.width,
                    hasHeight: !!parsed.height,
                    hasTilesPath: !!parsed.tilesPath,
                    actual: parsed
                });
                return null;
            }
            
            return parsed;
        } catch (e) {
            console.error('❌ Failed to parse pdfInfo:', e);
            console.error('Raw pdfInfoParam:', pdfInfoParam);
            return null;
        }
    }, [pdfInfoParam]);

    console.log('📋 Component params:', {
        myuri,
        myname,
        myplanid,
        pinIdToPlace,
        pdfInfo,
        pdfInfoValid: !!(pdfInfo && pdfInfo.width && pdfInfo.height)
    });

    if (!pdfInfo || !pdfInfo.width || !pdfInfo.height) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Image info manquante</Text>
                    <Text style={styles.errorSubtext}>
                        pdfInfo: {pdfInfoParam ? 'fourni mais invalide' : 'non fourni'}
                    </Text>
                    {pdfInfoParam && (
                        <Text style={styles.errorDebug}>
                            Reçu: {pdfInfoParam.substring(0, 100)}...
                        </Text>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    // Calculate minimum scale
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

    // Separate saved values for PAN gesture
    const panSavedTranslateX = useSharedValue(initialTranslate.x);
    const panSavedTranslateY = useSharedValue(initialTranslate.y);

    // Separate saved values for PINCH gesture
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

    const hasExistingPin = pin?.x != null && pin?.y != null;
    const currentCategory = categories.find(c => c.id === pin?.category_id) || categories[0];
    const currentStatus = statuses.find(s => s.id === pin?.status_id) || statuses[0];
    const currentStatusColor = currentStatus?.color || '#2563eb';

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

    // Handle tap to place pin
    const handleImageTap = useCallback(() => {
        if (!canPlacePin) {
            Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions pour placer des pins');
            return;
        }
    }, [canPlacePin]);

    const handleTapOnImage = useCallback((event) => {
        if (!canPlacePin || !imageWrapperRef.current) return;
        
        // Safety check for pdfInfo
        if (!pdfInfo || !pdfInfo.width || !pdfInfo.height) {
            console.error('❌ Cannot place pin: pdfInfo is invalid');
            Alert.alert('Erreur', 'Informations du plan manquantes');
            return;
        }

        imageWrapperRef.current.measureInWindow((wrapperX, wrapperY) => {
            // With react-native-gesture-handler v2+ Gesture API, use absoluteX/absoluteY
            const tapX = event.absoluteX || event.x;
            const tapY = event.absoluteY || event.y;
            
            console.log('📍 Raw tap event:', { 
                absoluteX: event.absoluteX, 
                absoluteY: event.absoluteY, 
                x: event.x, 
                y: event.y 
            });
            
            const relativeX = tapX - wrapperX;
            const relativeY = tapY - wrapperY;
            
            const imageX = relativeX - viewport.translateX;
            const imageY = relativeY - viewport.translateY;
            
            const finalX = imageX / viewport.scale;
            const finalY = imageY / viewport.scale;
            
            const normX = finalX / pdfInfo.width;
            const normY = finalY / pdfInfo.height;
            
            console.log('Tap calculation:', {
                wrapper: { x: wrapperX, y: wrapperY },
                tap: { x: tapX, y: tapY },
                relative: { x: relativeX, y: relativeY },
                imageTransform: { x: viewport.translateX, y: viewport.translateY, scale: viewport.scale },
                imageSpace: { x: imageX, y: imageY },
                final: { x: finalX, y: finalY },
                normalized: { x: normX, y: normY },
                pdfInfo: { width: pdfInfo.width, height: pdfInfo.height }
            });
            
            if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
                setPendingCoordinates({ x: normX, y: normY });
            } else {
                console.log('Tap outside image bounds');
            }
        });
    }, [canPlacePin, viewport, pdfInfo]);

    const handleConfirmPlacement = async () => {
        if (!pendingCoordinates || !pin?.id || !canPlacePin) return;
        setIsSaving(true);

        try {
            const updateData = {
                x: pendingCoordinates.x,
                y: pendingCoordinates.y,
            };

            // Use pdf_name instead of image_name (matches your schema)
            if (!pin.pdf_name && myname) {
                updateData.pdf_name = myname;
            }
            
            if (!pin.plan_id && myplanid) {
                updateData.plan_id = myplanid;
            }

            console.log('Updating pin with:', updateData);

            // Use pdf_pins table (matches your schema)
            const { error } = await supabase
                .from('pdf_pins')
                .update(updateData)
                .eq('id', pin.id);

            if (error) throw error;

            setPins(prev =>
                prev.map(p => p.id === pin.id ? { ...p, ...updateData } : p)
            );

            setMetapin({ id: pin.id, x: updateData.x, y: updateData.y });
              
            router.back();
        } catch (err) {
            console.error('Error placing pin:', err);
            Alert.alert('Erreur', 'Impossible de placer le pin');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelPlacement = () => setPendingCoordinates(null);
    const handleClose = () => router.back();

    const handleRemoveFromPlan = () => {
        Alert.alert(
            'Retirer du plan',
            'Voulez-vous retirer cette tâche du plan ? Les coordonnées seront supprimées.',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Retirer',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const updateData = {
                                x: null,
                                y: null,
                                plan_id: null,
                                pdf_name: null,
                            };

                            console.log('Removing pin from plan:', updateData);

                            const { error } = await supabase
                                .from('pdf_pins')
                                .update(updateData)
                                .eq('id', pin.id);

                            if (error) throw error;

                            setPins(prev =>
                                prev.map(p => p.id === pin.id ? { ...p, ...updateData } : p)
                            );

                            setMetapin({ id: pin.id, x: null, y: null });
                            
                            Alert.alert('Succès', 'Tâche retirée du plan', [
                                {
                                    text: 'OK',
                                    onPress: () => router.back()
                                }
                            ]);
                        } catch (err) {
                            console.error('Error removing pin from plan:', err);
                            Alert.alert('Erreur', 'Impossible de retirer la tâche du plan');
                        }
                    },
                },
            ]
        );
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
            
            scale.value = pinchSavedScale.value * event.scale;
            
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

    // TAP GESTURE for placing pins
    const tapGesture = Gesture.Tap()
        .onEnd((event) => {
            runOnJS(handleTapOnImage)(event);
        });

    const simultaneousGesture = Gesture.Simultaneous(
        pinchGesture,
        panGesture.simultaneousWithExternalGesture(pinchGesture)
    );

    const composedGesture = Gesture.Race(tapGesture, simultaneousGesture);

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

    const pinAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 / scale.value }]
    }));

    // Render pins
    const renderPin = (coords, opacity) => {
        if (!coords) return null;

        const absX = coords.x * pdfInfo.width;
        const absY = coords.y * pdfInfo.height;

        return (
            <Animated.View
                key={coords === pendingCoordinates ? 'pending' : 'existing'}
                style={[
                    styles.pinContainer,
                    { left: absX, top: absY },
                    pinAnimatedStyle,
                ]}
                pointerEvents="none"
            >
                <View style={[styles.pinCircle, { backgroundColor: currentStatusColor, opacity }]}>
                    {getCategoryIconComponent(currentCategory.icon, 'white', 16)}
                </View>
            </Animated.View>
        );
    };

    const existingCoords = hasExistingPin && !pendingCoordinates ? { x: x, y: y } : null;

    return (
        <GestureHandlerRootView style={styles.container}>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleClose} style={styles.iconCircle}>
                        <CloseIcon size={20} color="#111" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={styles.headerTitle}>
                            {canPlacePin 
                                ? (hasExistingPin ? 'Déplacer le pin' : 'Placer le pin')
                                : 'Voir le pin'
                            }
                        </Text>
                        <Text style={styles.headerSubtitle}>{pin?.name || 'Sans nom'}</Text>
                    </View>
                    {/* Show remove button if pin is already placed and user can edit */}
                    {hasExistingPin && canPlacePin ? (
                        <TouchableOpacity onPress={handleRemoveFromPlan} style={[styles.iconCircle, styles.removeButton]}>
                            <Text style={styles.removeButtonText}>Retirer</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 40 }} />
                    )}
                </View>

                {/* Image Viewer with Tiles */}
                <View 
                    style={{ flex: 1, backgroundColor: '#000' }}
                    onLayout={(e) => {
                        e.target.measure((x, y, width, height, pageX, pageY) => {
                            console.log('Image Container Y position:', pageY);
                            setImageContainerTop(pageY);
                        });
                    }}
                >
                    {isLoadingImage ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#2563eb" />
                            <Text style={styles.loadingText}>Chargement de l'image...</Text>
                        </View>
                    ) : (
                        <GestureDetector gesture={composedGesture}>
                            <View ref={imageWrapperRef} style={styles.gestureContainer}>
                                <Animated.View style={[styles.imageContainer, imageContainerStyle]}>
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
                                    
                                    {/* Existing Pin */}
                                    {renderPin(existingCoords, 0.5)}
                                    
                                    {/* Pending Pin */}
                                    {renderPin(pendingCoordinates, 0.95)}
                                </Animated.View>
                            </View>
                        </GestureDetector>
                    )}
                </View>

                {/* Bottom Menu */}
                <View 
                    style={[styles.bottomMenu, { paddingBottom: insets.bottom + 12 }]}
                    onLayout={(e) => {
                        const height = e.nativeEvent.layout.height;
                        console.log('Bottom bar height:', height);
                        setBottomBarHeight(height);
                    }}
                >
                    <View style={styles.bottomMenuContent}>
                        {!canPlacePin ? (
                            <View style={styles.instructionSection}>
                                <View style={[styles.iconCircleLarge, { backgroundColor: '#6B7280' }]}>
                                    <MapPin size={24} color="#fff" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={styles.instructionTitle}>Mode visualisation</Text>
                                    <Text style={styles.instructionText}>Vous pouvez voir le pin mais pas le modifier</Text>
                                </View>
                            </View>
                        ) : pendingCoordinates ? (
                            <>
                                <View style={styles.buttonRow}>
                                    <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleCancelPlacement} disabled={isSaving}>
                                        <CloseIcon size={18} color="#374151" />
                                        <Text style={styles.buttonSecondaryText}>Annuler</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleConfirmPlacement} disabled={isSaving}>
                                        <CheckIcon size={18} color="#fff" />
                                        <Text style={styles.buttonPrimaryText}>{isSaving ? 'Enregistrement...' : 'Confirmer'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <View style={styles.instructionSection}>
                                <View style={[styles.iconCircleLarge, { backgroundColor: currentStatusColor }]}>
                                    <MapPin size={24} color="#fff" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={styles.instructionTitle}>{hasExistingPin ? 'Déplacer le pin' : 'Placer le pin'}</Text>
                                    <Text style={styles.instructionText}>
                                        {hasExistingPin ? 'Appuyez sur l\'image pour déplacer le pin' : 'Appuyez sur l\'image pour placer le pin'}
                                    </Text>
                                    {hasExistingPin && (
                                        <TouchableOpacity 
                                            style={styles.removeFromPlanButton}
                                            onPress={handleRemoveFromPlan}
                                        >
                                            <Text style={styles.removeFromPlanText}>Retirer du plan</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>
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

/**
 * USAGE FROM PINMETADATASCREEN:
 * 
 * This screen is called when user wants to place/move a pin's location on the plan.
 * 
 * Navigation from PinMetadataScreen:
 * 
 * const handlePlanSelected = (selectedPlan) => {
 *     setShowPlanSelector(false);
 *     
 *     router.push({
 *         pathname: '/PinPlacementScreen',  // or '/ImagePinPlacementScreen' for this component
 *         params: {
 *             myplanid: selectedPlan.id,
 *             pinIdToPlace: pin.id,
 *             x: pin.x,                      // Current coordinates (if already placed)
 *             y: pin.y,
 *             userRole: currentRole,         // User's role for permissions
 *             pdfInfo: JSON.stringify({      // Plan info from database
 *                 width: selectedPlan.width,
 *                 height: selectedPlan.height,
 *                 tilesPath: selectedPlan.tiles_path
 *             })
 *         }
 *     });
 * };
 * 
 * The pdfInfo is fetched from the 'plans' table and should contain:
 * {
 *   width: 3000,           // From plans.width
 *   height: 2000,          // From plans.height  
 *   tilesPath: 'path/to/tiles'  // From plans.tiles_path
 * }
 */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#222' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
    iconCircle: { backgroundColor: '#f3f4f6', borderRadius: 9999, padding: 8, justifyContent: 'center', alignItems: 'center' },
    removeButton: { backgroundColor: '#fee2e2', paddingHorizontal: 12 },
    removeButtonText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#dc2626' },
    headerTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: '#111' },
    headerSubtitle: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 2 },
    gestureContainer: { flex: 1, overflow: 'hidden' },
    imageContainer: { position: 'absolute', backgroundColor: 'white' },
    pinContainer: { position: 'absolute', zIndex: 10, alignItems: 'center', justifyContent: 'center', width: 36, height: 36, marginLeft: -18, marginTop: -18 },
    pinCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
    bottomMenu: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 12 },
    bottomMenuContent: { minHeight: 100 },
    buttonRow: { flexDirection: 'row', gap: 12 },
    button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
    buttonPrimary: { backgroundColor: '#2563eb' },
    buttonPrimaryText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
    buttonSecondary: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
    buttonSecondaryText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#374151' },
    instructionSection: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', borderRadius: 12 },
    iconCircleLarge: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    instructionTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#111' },
    instructionText: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 4 },
    removeFromPlanButton: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fee2e2', borderRadius: 6, alignSelf: 'flex-start' },
    removeFromPlanText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: '#dc2626' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', padding: 20 },
    errorText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#ef4444', marginBottom: 8 },
    errorSubtext: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginBottom: 8, textAlign: 'center' },
    errorDebug: { fontSize: 12, fontFamily: 'Courier', color: '#9CA3AF', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
    backButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#2563eb', borderRadius: 8 },
    backButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
    loadingText: { fontSize: 16, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 12 },
});