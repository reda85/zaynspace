import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Get Expo push token and save to backend
export async function registerFCMToken(userId) {
  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Permission not granted');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = token.data;
    
    console.log('Expo Push Token:', expoPushToken);

    // Get device info
    const deviceId = await getDeviceId();
    const deviceType = Platform.OS;

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Save to Supabase
    await saveFCMTokenToSupabase(userId, expoPushToken, deviceId, deviceType);

    return { token: expoPushToken };
  } catch (error) {
    console.error('Error registering push token:', error);
    return null;
  }
}

// Save push token to Supabase
export async function saveFCMTokenToSupabase(userId, fcmToken, deviceId, deviceType) {
  try {
    const { data, error } = await supabase
      .from('user_fcm_tokens')
      .upsert(
        {
          user_id: userId,
          fcm_token: fcmToken,
          device_id: deviceId,
          device_type: deviceType,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,device_id',
        }
      );

    if (error) throw error;
    console.log('Push token saved to Supabase');
    return data;
  } catch (error) {
    console.error('Error saving push token to Supabase:', error);
    throw error;
  }
}

// Delete push token (on logout)
export async function deleteFCMToken(userId, deviceId) {
  try {
    // Delete from Supabase
    const { error } = await supabase
      .from('user_fcm_tokens')
      .delete()
      .match({ user_id: userId, device_id: deviceId });

    if (error) throw error;
    console.log('Push token deleted');
  } catch (error) {
    console.error('Error deleting push token:', error);
  }
}

// Get all tokens for a user
export async function getUserFCMTokens(userId) {
  try {
    const { data, error } = await supabase
      .from('user_fcm_tokens')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user push tokens:', error);
    return [];
  }
}

async function getDeviceId() {
  const deviceName = Device.deviceName || 'unknown';
  const osVersion = Device.osVersion || 'unknown';
  const modelName = Device.modelName || 'unknown';
  
  return `${Platform.OS}-${deviceName}-${modelName}-${osVersion}`.replace(/\s/g, '-');
}