// Briques d'interface des écrans de pilotage (lots, réunions, planning).
import { useRouter } from 'expo-router';
import { CheckIcon, ChevronLeft } from 'lucide-react-native';
import { cloneElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../constants/theme';
import { categoriesIcons } from '../MapPin';

/** En-tête des écrans de détail : retour, titre, sous-titre, action à droite. */
export function DetailHeader({ title, subtitle, right }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.dh, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour" style={s.dhBack}>
        <ChevronLeft size={22} color={C.encre} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.dhTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.dhSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function LotIcon({ icon, size = 30 }) {
  const el = categoriesIcons[icon] ?? <CheckIcon />;
  return (
    <View style={[s.lotIcon, { width: size, height: size, borderRadius: size / 4 }]}>
      {cloneElement(el, { color: C.encre, size: Math.round(size * 0.53), strokeWidth: 1.8 })}
    </View>
  );
}

export function ProgressBar({ value = 0, late, height = 6, style, grow = true }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={[s.track, grow ? { flex: 1 } : { alignSelf: 'stretch' }, { height, borderRadius: height / 2 }, style]}>
      <View style={{ width: `${v}%`, height, borderRadius: height / 2, backgroundColor: late ? C.alerte : v >= 100 ? C.valide : C.tirage }} />
    </View>
  );
}

const BADGE = {
  neutre: [C.voile, C.mine],
  tirage: [C.tiragePale, C.tirage],
  alerte: [C.alertePale, C.alerte],
  valide: [C.validePale, C.valide],
};

export function Badge({ label, tone = 'neutre', style }) {
  const [bg, fg] = BADGE[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }, style]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, onPress }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

/** Choix exclusif en pastilles (onglets internes, présence, type de point…). */
export function Segmented({ value, options, onChange, small, style, disabled }) {
  return (
    <View style={[s.seg, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            onPress={() => !active && onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[s.segItem, small && s.segItemSmall, active && s.segActive]}
          >
            <Text style={[s.segText, small && { fontSize: 12 }, active && s.segTextActive]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, right, style }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Empty({ title, text, children }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function PrimaryButton({ label, onPress, icon, disabled, style, light }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.primary, light && s.primaryLight, pressed && { opacity: 0.8 }, disabled && { opacity: 0.45 }, style]}
    >
      {icon}
      <Text style={[s.primaryText, light && { color: C.encre }]}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  dh: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: C.papier, borderBottomWidth: 1, borderBottomColor: C.voile },
  dhBack: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet },
  dhTitle: { fontFamily: F.semibold, fontSize: 18, color: C.encre, letterSpacing: -0.3 },
  dhSub: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 1 },
  lotIcon: { backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center' },
  track: { backgroundColor: C.voile, overflow: 'hidden' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' },
  badgeText: { fontFamily: F.medium, fontSize: 11.5 },
  card: { backgroundColor: C.blanc, borderRadius: 14, borderWidth: 1, borderColor: C.filet, padding: 14 },
  seg: { flexDirection: 'row', backgroundColor: C.voile, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segItemSmall: { paddingVertical: 5, paddingHorizontal: 9, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  segActive: { backgroundColor: C.blanc, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.medium, fontSize: 14, color: C.mine },
  segTextActive: { color: C.encre, fontFamily: F.semibold },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontFamily: F.semibold, fontSize: 13, color: C.mine, textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: F.semibold, fontSize: 16, color: C.encre, marginBottom: 6, textAlign: 'center' },
  emptyText: { fontFamily: F.regular, fontSize: 14, color: C.mineClair, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.encre, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18 },
  primaryLight: { backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet },
  primaryText: { fontFamily: F.semibold, fontSize: 15, color: C.blanc },
});
