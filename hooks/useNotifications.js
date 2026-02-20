import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
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

      const deviceId = getDeviceId();

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

      // Foreground notifications
      notificationListener = Notifications.addNotificationReceivedListener(notification => {
        const { title, body } = notification.request.content;
        Alert.alert(title ?? 'Notification', body ?? '');
      });

      // Notification tap
      responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
      });
    };

    init();

    // On logout (session cleared) — remove this device's token so the
    // backend stops sending to it
    return () => {
      notificationListener?.remove();
      responseListener?.remove();

      const deviceId = getDeviceId();
      supabase
        .from('user_fcm_tokens')
        .delete()
        .match({ user_id: session.user.id, device_id: deviceId })
        .then(() => console.log('Push token removed on session end'))
        .catch(err => console.warn('Could not remove push token:', err));
    };
  }, [session?.user?.id]);
}

// ─────────────────────────────────────────────────────────────────────────────

async function requestPermission() {
  if (!Device.isDevice) {
    Alert.alert('Must use physical device for Push Notifications');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    Alert.alert('Failed to get push token for push notification!');
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

// Synchronous — Device fields are already resolved at import time
function getDeviceId() {
  const deviceName = Device.deviceName || 'unknown';
  const osVersion  = Device.osVersion  || 'unknown';
  const modelName  = Device.modelName  || 'unknown';
  return `${Platform.OS}-${deviceName}-${modelName}-${osVersion}`.replace(/\s+/g, '-');
}