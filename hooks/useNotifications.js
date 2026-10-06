import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications(session) {
  useEffect(() => {
    if (!session?.user) return;

    let notificationListener;
    let responseListener;

    const init = async () => {
      const permission = await requestPermission();
      if (!permission) return;

      const expoPushToken = await registerForPushNotificationsAsync();
      if (!expoPushToken) return;

      const deviceId = await getDeviceId();

      // Un même appareil ne garde qu'une ligne : les anciennes (identifiant
      // d'appareil dérivé de la version d'OS) provoquaient des envois en double.
      await supabase
        .from('user_fcm_tokens')
        .delete()
        .eq('user_id', session.user.id)
        .eq('fcm_token', expoPushToken)
        .neq('device_id', deviceId);

      await supabase.from('user_fcm_tokens').upsert(
        {
          user_id: session.user.id,
          fcm_token: expoPushToken,
          device_id: deviceId,
          device_type: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' }
      );

      // Application ouverte : la bannière système s'affiche déjà
      // (setNotificationHandler), pas de fenêtre bloquante en plus.

      // Appui sur une notification : ouvrir l'élément concerné.
      responseListener = Notifications.addNotificationResponseReceivedListener(openFromNotification);

      // Application lancée par un appui sur une notification.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && last.notification.request.identifier !== lastHandledId) {
        // Laisse la navigation se monter, et ne rejoue pas cet appui au prochain lancement.
        setTimeout(() => openFromNotification(last), 400);
        Notifications.clearLastNotificationResponseAsync?.();
      }
    };

    init();

    // On logout (session cleared) — remove this device's token so the
    // backend stops sending to it
    return () => {
      notificationListener?.remove();
      responseListener?.remove();
      // Le jeton de cet appareil est supprimé par removePushToken(), appelé
      // avant la déconnexion : ici la session n'existe déjà plus.
    };
  }, [session?.user?.id]);
}

// ─────────────────────────────────────────────────────────────────────────────

async function requestPermission() {
  if (!Device.isDevice) {
    console.warn('Push notifications need a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    // Refus de l'utilisateur : pas d'alerte à chaque lancement.
    console.warn('Push notification permission not granted');
    return false;
  }

  return true;
}

async function registerForPushNotificationsAsync() {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      throw new Error('Project ID not found in app.json (extra.eas.projectId)');
    }

    // Android channel must be created before getting the token
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data; // "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

// Identifiant d'appareil stable, généré une fois et conservé. L'ancien était
// dérivé du nom et de la version d'OS : chaque mise à jour créait un doublon.
const DEVICE_ID_KEY = '@push/device_id';
async function getDeviceId() {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const created = `${Platform.OS}-${Crypto.randomUUID()}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    const modelName = Device.modelName || 'unknown';
    return `${Platform.OS}-${modelName}`.replace(/\s+/g, '-');
  }
}

// À appeler AVANT supabase.auth.signOut() : retire le jeton de cet appareil
// pour que le backend cesse de lui envoyer les notifications du compte.
export async function removePushToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const deviceId = await getDeviceId();
    await supabase
      .from('user_fcm_tokens')
      .delete()
      .match({ user_id: session.user.id, device_id: deviceId });
  } catch (err) {
    console.warn('Could not remove push token:', err?.message);
  }
}

let lastHandledId = null;
function openFromNotification(response) {
  try {
    lastHandledId = response?.notification?.request?.identifier ?? null;
    const data = response?.notification?.request?.content?.data ?? {};
    if (data.type === 'pin_assigned' && data.pinId) {
      router.push({ pathname: '/PinMetadataScreen', params: { pinId: String(data.pinId), from: 'Notification' } });
    } else if (data.type === 'discussion_message' && data.groupId) {
      router.push({
        pathname: '/discussions/chat',
        params: { groupId: String(data.groupId), groupName: response.notification.request.content.title ?? '' },
      });
    }
  } catch (err) {
    console.warn('Could not open notification target:', err?.message);
  }
}
