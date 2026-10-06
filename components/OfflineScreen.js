// components/OfflineScreen.js
// Hors ligne, l'application reste utilisable : plans et pins déjà chargés,
// création et modification de pins, photos. Ce composant n'affiche plus qu'une
// pastille d'état en haut de l'écran (hors ligne / envoi en attente / refus).
import { useAtomValue } from 'jotai';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { outbox, outboxCountAtom, outboxOpsAtom, syncNow } from '../lib/offline';
import { isOnlineAtom } from '../store/atoms';

const LABELS = {
  'pin.insert': 'Création de pin',
  'pin.update': 'Modification de pin',
  'photo.upload': 'Photo',
};

export function OfflineScreen() {
  const isOnline = useAtomValue(isOnlineAtom);
  const { pending, failed } = useAtomValue(outboxCountAtom);
  const ops = useAtomValue(outboxOpsAtom);
  const insets = useSafeAreaInsets();

  if (isOnline && pending === 0 && failed === 0) return null;

  let text;
  let tone = styles.offline;
  if (!isOnline) {
    text = pending > 0 ? `Hors ligne · ${pending} en attente` : 'Hors ligne';
  } else if (failed > 0) {
    text = `${failed} envoi${failed > 1 ? 's' : ''} refusé${failed > 1 ? 's' : ''}`;
    tone = styles.failed;
  } else {
    text = `Envoi en cours · ${pending}`;
    tone = styles.syncing;
  }

  const showDetails = () => {
    const lines = [];
    if (!isOnline) lines.push('Vos modifications sont enregistrées sur l\'appareil et seront envoyées au retour du réseau.');
    if (pending > 0) lines.push(`${pending} modification${pending > 1 ? 's' : ''} en attente d'envoi.`);
    const failedOps = ops.filter((o) => o.status === 'failed');
    if (failedOps.length > 0) {
      lines.push(`${failedOps.length} refusée${failedOps.length > 1 ? 's' : ''} par le serveur :`);
      failedOps.slice(0, 5).forEach((o) => lines.push(`• ${LABELS[o.type] ?? o.type} — ${o.lastError ?? 'erreur'}`));
    }
    // Trois boutons au plus : Android n'en affiche pas davantage.
    const buttons = [];
    if (failedOps.length > 0) {
      // « Réessayer » relance aussi l'envoi de ce qui est en attente.
      buttons.push({ text: 'Réessayer', onPress: () => { outbox.retryFailed(); } });
      buttons.push({
        text: 'Abandonner les refusées',
        style: 'destructive',
        onPress: async () => { for (const o of failedOps) await outbox.discard(o.id); },
      });
    } else if (isOnline && pending > 0) {
      buttons.push({ text: 'Envoyer maintenant', onPress: () => { syncNow(); } });
    }
    buttons.push({ text: 'Fermer', style: 'cancel' });
    Alert.alert(isOnline ? 'Synchronisation' : 'Mode hors ligne', lines.join('\n'), buttons);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { top: insets.top + 2 }]}>
      <Pressable onPress={showDetails} style={[styles.pill, tone]} hitSlop={8}>
        <View style={styles.dot} />
        <Text style={styles.text} numberOfLines={1}>{text}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  offline: { backgroundColor: '#111827' },
  syncing: { backgroundColor: '#374151' },
  failed: { backgroundColor: '#B91C1C' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FBBF24' },
  text: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Outfit_500Medium' },
});
