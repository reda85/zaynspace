// Éléments communs aux écrans de placement sur un plan (PinPlacementScreen,
// ImagePinPlacementScreen) : fond quadrillé, barre flottante du haut, marqueurs
// (position actuelle / nouvelle position) et panneau du bas.
import { Image as ExpoImage } from 'expo-image';
import { Camera, Check, Eye, Hand, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated as RNAnimated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { C, F } from '../../constants/theme';

export function GridBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <Pattern id="grille-placement" width={20} height={20} patternUnits="userSpaceOnUse">
          <Path d="M 20 0 L 0 0 0 20" fill="none" stroke={C.filet} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#grille-placement)" />
    </Svg>
  );
}

// Pastille à gauche du titre : icône de catégorie dans la couleur du statut,
// ou miniature de la photo.
export function Leading({ color, icon, photoUri, size = 26 }) {
  if (photoUri) {
    return <ExpoImage source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: 8 }} contentFit="cover" />;
  }
  return (
    <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      {icon ?? <Camera size={size * 0.55} color={C.blanc} strokeWidth={2.2} />}
    </View>
  );
}

export function PlacementTopBar({ onClose, title, subtitle, leading, hint }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onClose} style={styles.square} accessibilityLabel="Fermer">
          <X size={20} color={C.encre} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.titleCard}>
          {leading}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>
      </View>
      {hint ? (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Marqueur posé sur le plan. La pointe (petit point) est exactement sur la
// position ; le marqueur garde la même taille quel que soit le zoom.
// `ghost` : ancienne position, en pointillés, pendant un déplacement.
export function PlacementMarker({ x, y, color, icon, photoUri, ghost, label, inverseScaleStyle, pulse }) {
  const anim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = RNAnimated.loop(RNAnimated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, anim]);

  const photo = !!photoUri && !ghost;
  const size = photo ? 44 : 38;

  return (
    <Animated.View style={[styles.anchor, { left: x, top: y }, inverseScaleStyle]} pointerEvents="none">
      {pulse && (
        <RNAnimated.View
          style={[styles.pulse, {
            backgroundColor: color,
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
          }]}
        />
      )}
      {ghost ? (
        <>
          <View style={[styles.ghost, { borderColor: color }]}>{icon}</View>
          <View style={[styles.ghostDot, { backgroundColor: color }]} />
        </>
      ) : (
        <>
          <View
            style={[
              styles.body,
              { width: size, height: size, top: -size - 10, left: -size / 2 },
              photo
                ? { borderRadius: 13, backgroundColor: C.blanc, borderColor: color }
                : { borderRadius: size / 2, backgroundColor: color, borderColor: C.blanc },
            ]}
          >
            {photo ? (
              <ExpoImage source={{ uri: photoUri }} style={{ width: 34, height: 34, borderRadius: 9 }} contentFit="cover" />
            ) : icon}
          </View>
          <View style={[styles.tip, { borderTopColor: photo ? color : C.blanc }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
        </>
      )}
      {label ? (
        <View style={[styles.label, ghost ? styles.labelGhost : styles.labelSolid]}>
          <Text style={[styles.labelText, { color: ghost ? C.mine : C.blanc }]} numberOfLines={1}>{label}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

export function PlacementSheet({ children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.handle} />
      {children}
    </View>
  );
}

export function SheetMessage({ icon, title, text }) {
  return (
    <View style={styles.message}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.msgTitle}>{title}</Text>
        {text ? <Text style={styles.msgText}>{text}</Text> : null}
      </View>
    </View>
  );
}

export const HintIcon = () => (
  <View style={[styles.round, styles.msgIcon, { backgroundColor: C.tiragePale }]}>
    <Hand size={22} color={C.tirage} strokeWidth={1.9} />
  </View>
);

export const ReadOnlyIcon = () => (
  <View style={[styles.round, styles.msgIcon, { backgroundColor: C.survol }]}>
    <Eye size={20} color={C.mine} strokeWidth={1.9} />
  </View>
);

export function ConfirmButtons({ onCancel, onConfirm, saving }) {
  return (
    <View style={styles.buttons}>
      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onCancel} disabled={saving}>
        <Text style={styles.btnSecondaryText}>Annuler</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.7 }]} onPress={onConfirm} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color={C.blanc} /> : <Check size={18} color={C.blanc} strokeWidth={2.4} />}
        <Text style={styles.btnPrimaryText}>{saving ? 'Enregistrement…' : 'Confirmer'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function RemoveButton({ onPress, label = 'Retirer du plan' }) {
  return (
    <TouchableOpacity style={styles.remove} onPress={onPress}>
      <Trash2 size={16} color={C.alerte} strokeWidth={2} />
      <Text style={styles.removeText}>{label}</Text>
    </TouchableOpacity>
  );
}

const shadow = {
  shadowColor: '#1C1C1A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
};

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, zIndex: 20, elevation: 10 },
  topRow: { flexDirection: 'row', gap: 8 },
  square: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: C.blanc,
    borderWidth: 1, borderColor: C.filet, alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  titleCard: {
    flex: 1, minWidth: 0, height: 48, borderRadius: 14, backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, ...shadow,
  },
  title: { fontFamily: F.semibold, fontSize: 15, color: C.encre },
  subtitle: { fontFamily: F.regular, fontSize: 12, color: C.mineClair },
  hintWrap: { alignItems: 'center', marginTop: 8 },
  hint: {
    fontFamily: F.medium, fontSize: 12, color: C.mine, backgroundColor: C.blanc, overflow: 'hidden',
    borderWidth: 1, borderColor: C.filet, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
  },

  anchor: { position: 'absolute', width: 0, height: 0, zIndex: 10 },
  pulse: { position: 'absolute', left: -28, top: -28, width: 56, height: 56, borderRadius: 28 },
  body: {
    position: 'absolute', borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C1A', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  tip: {
    position: 'absolute', left: -6, top: -13, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  dot: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: C.blanc },
  ghost: {
    position: 'absolute', left: -17, top: -46, width: 34, height: 34, borderRadius: 17,
    borderWidth: 2, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  ghostDot: { position: 'absolute', left: -3, top: -3, width: 6, height: 6, borderRadius: 3, opacity: 0.6 },
  label: { position: 'absolute', left: 24, top: -46, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  labelSolid: { backgroundColor: C.encre, borderColor: C.encre },
  labelGhost: { backgroundColor: C.blanc, borderColor: C.filet },
  labelText: { fontFamily: F.semibold, fontSize: 11 },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 12,
    backgroundColor: C.blanc, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, gap: 14,
    shadowColor: '#1C1C1A', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -6 },
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.filetFort, alignSelf: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  msgIcon: { width: 44, height: 44, borderRadius: 22 },
  msgTitle: { fontFamily: F.semibold, fontSize: 16, color: C.encre },
  msgText: { fontFamily: F.regular, fontSize: 13, color: C.mine, marginTop: 2, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSecondary: { backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filetFort },
  btnSecondaryText: { fontFamily: F.semibold, fontSize: 15, color: C.encre },
  btnPrimary: { backgroundColor: C.encre },
  btnPrimaryText: { fontFamily: F.semibold, fontSize: 15, color: C.blanc },
  remove: {
    height: 46, borderRadius: 14, borderWidth: 1, borderColor: C.alerteClair, backgroundColor: C.alertePale,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  removeText: { fontFamily: F.semibold, fontSize: 14, color: C.alerte },
});
