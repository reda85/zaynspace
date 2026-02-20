import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const PIN_SIZE = 26;
const PREVIEW_HEIGHT = 130;

/**
 * PlanMiniSnapshot
 *
 * Displays a full-plan PNG with an overlaid pin marker at (x, y).
 * The image fills the preview area; the pin is positioned using
 * percentage-based absolute positioning.
 *
 * Props:
 *  - pngUrl   : string  — FULL public URL of the plan PNG
 *  - x        : number  — relative x coordinate (0–1)
 *  - y        : number  — relative y coordinate (0–1)
 *  - pinColor : string  — css color for the pin marker
 */
export default function PlanMiniSnapshot({ pngUrl, x, y, pinColor = '#2563eb' }) {
    const [imageError, setImageError] = useState(false);

    if (!pngUrl || x == null || y == null) {
        return (
            <View style={styles.container}>
                <Text style={styles.fallbackText}>Aperçu indisponible</Text>
            </View>
        );
    }

    if (imageError) {
        return (
            <View style={styles.container}>
                <Text style={styles.fallbackText}>Impossible de charger le plan</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Full plan image */}
            <Image
                source={{ uri: pngUrl }}
                style={styles.image}
                resizeMode="contain"
                onError={(e) => {
                    console.warn('[PlanMiniSnapshot] Image load error:', e.nativeEvent.error, 'url:', pngUrl);
                    setImageError(true);
                }}
                onLoad={() => console.log('[PlanMiniSnapshot] Image loaded OK:', pngUrl)}
            />

            {/* Pin marker at (x%, y%) */}
            <View
                pointerEvents="none"
                style={[
                    styles.pinContainer,
                    {
                        left: `${x * 100}%`,
                        top: `${y * 100}%`,
                    },
                ]}
            >
                {/* Shadow ring */}
                <View style={[styles.pinRing, { borderColor: pinColor }]} />
                {/* Teardrop body */}
                <View style={[styles.pinBody, { backgroundColor: pinColor }]}>
                    <View style={styles.pinInner} />
                </View>
            </View>

            {/* Bottom hint */}
            <View style={styles.labelBar} pointerEvents="none">
                <Text style={styles.labelText}>Appuyer pour voir sur le plan</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: PREVIEW_HEIGHT,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#e5e7eb',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    pinContainer: {
        position: 'absolute',
        // Offset so the tip of the teardrop points at the coordinate
        marginLeft: -(PIN_SIZE / 2),
        marginTop: -PIN_SIZE,
        alignItems: 'center',
    },
    pinRing: {
        position: 'absolute',
        width: PIN_SIZE * 1.7,
        height: PIN_SIZE * 1.7,
        borderRadius: 999,
        borderWidth: 1.5,
        opacity: 0.35,
        top: -PIN_SIZE * 0.35,
        alignSelf: 'center',
    },
    pinBody: {
        width: PIN_SIZE,
        height: PIN_SIZE,
        borderRadius: PIN_SIZE / 2,
        borderBottomRightRadius: 2,
        transform: [{ rotate: '45deg' }],
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
        elevation: 5,
    },
    pinInner: {
        width: PIN_SIZE * 0.38,
        height: PIN_SIZE * 0.38,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.85)',
    },
    labelBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.28)',
        paddingVertical: 5,
        alignItems: 'center',
    },
    labelText: {
        color: '#fff',
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
    },
    fallbackText: {
        color: '#9ca3af',
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        textAlign: 'center',
        marginTop: 45,
    },
});