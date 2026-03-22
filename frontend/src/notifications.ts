import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((module) => {
        module.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
        return module;
      })
      .catch((error) => {
        console.log('expo-notifications unavailable in this environment:', error);
        return null;
      });
  }

  return notificationsModulePromise;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    console.log('expo-notifications is unavailable. Use a development build instead of Expo Go.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permission not granted for push notifications');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    return tokenData.data;
  } catch (e) {
    console.log('Error getting push token:', e);
    return null;
  }
}

export function addNotificationListener(
  callback: (notification: any) => void
) {
  return getNotificationsModule().then((Notifications) =>
    Notifications ? Notifications.addNotificationReceivedListener(callback) : null
  );
}

export function addNotificationResponseListener(
  callback: (response: any) => void
) {
  return getNotificationsModule().then((Notifications) =>
    Notifications ? Notifications.addNotificationResponseReceivedListener(callback) : null
  );
}
