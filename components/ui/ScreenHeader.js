// En-tête commun des onglets : grand titre à gauche, un compteur en dessous,
// des boutons ronds à droite. Remplace l'en-tête centré de la navigation.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../constants/theme';

export function ScreenHeader({ title, subtitle, left, right, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }, style]}>
      {left}
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.actions}>{right}</View> : null}
    </View>
  );
}

// Bouton rond de l'en-tête. `dark` pour l'action principale (fond encre).
export function HeaderButton({ onPress, dark, label, children, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.btn,
        dark ? styles.btnDark : styles.btnLight,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
      ]}
    >
      {children}
    </Pressable>
  );
}

// Bouton texte de l'en-tête (ex. « Modifier » / « Terminé » sur Plans).
export function HeaderTextButton({ onPress, label, active }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.textBtn, active && styles.textBtnActive, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.textBtnLabel, active && { color: C.blanc }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.papier,
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.semibold, fontSize: 28, letterSpacing: -0.6, color: C.encre, lineHeight: 32 },
  subtitle: { fontFamily: F.regular, fontSize: 13, color: C.mineClair, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btnLight: { backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet },
  btnDark: { backgroundColor: C.encre },
  textBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center',
    backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet,
  },
  textBtnActive: { backgroundColor: C.encre, borderColor: C.encre },
  textBtnLabel: { fontFamily: F.medium, fontSize: 14, color: C.encre },
});
