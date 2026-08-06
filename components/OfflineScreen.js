// components/OfflineScreen.tsx
import NetInfo from '@react-native-community/netinfo';
import { useAtomValue } from 'jotai';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOnlineAtom } from '../store/atoms';

export function OfflineScreen() {
  const isOnline = useAtomValue(isOnlineAtom);
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {/* Drop in your icon lib here if you have one, e.g. lucide-react-native <WifiOff /> */}
        <View style={styles.iconCircle}>
          <Text style={styles.iconGlyph}>!</Text>
        </View>
        <Text style={styles.title}>Vous êtes hors ligne</Text>
        <Text style={styles.subtitle}>
          Vérifiez votre connexion. ZaynSpace se reconnectera automatiquement.
        </Text>
        <Pressable style={styles.button} onPress={() => NetInfo.refresh()}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#060810',
    zIndex: 9999,
    elevation: 9999, // Android stacking
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 1, borderColor: '#262626',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  iconGlyph: { color: '#fff', fontSize: 28, fontFamily: 'Outfit' },
  title: { color: '#fff', fontSize: 22, fontFamily: 'Outfit' },
  subtitle: { color: '#a3a3a3', fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: 'Outfit' },
  button: {
    marginTop: 16, backgroundColor: '#fff',
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10,
  },
  buttonText: { color: '#060810', fontSize: 15, fontFamily: 'Outfit' },
});