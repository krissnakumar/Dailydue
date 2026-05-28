import { Platform } from 'react-native';

let NotificationsModule: any = null;
let isExpoGo = false;

try {
  const Constants = require('expo-constants').default;
  isExpoGo = Constants?.appOwnership === 'expo';
} catch {
  isExpoGo = false;
}

try {
  // Expo Go on Android (SDK 53+) does not support remote push notifications.
  if (!(Platform.OS === 'android' && isExpoGo)) {
    NotificationsModule = require('expo-notifications');
    if (NotificationsModule) {
      NotificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  }
} catch (e) {
  console.warn('[Native Notifications] Failed to import expo-notifications module:', e);
}

export const nativeNotifications = {
  isAvailable: () => !!NotificationsModule,
  scheduleNotification: async (
    title: string,
    body: string,
    triggerSeconds: number = 1,
    data?: Record<string, any>
  ) => {
    if (!NotificationsModule) {
      console.log('[Native Notifications Mock] Notification Scheduled:', { title, body, data });
      return null;
    }
    try {
      return await NotificationsModule.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data: data || {},
        },
        trigger: {
          seconds: triggerSeconds,
        },
      });
    } catch (err) {
      console.warn('[Native Notifications] scheduleNotification failed:', err);
      return null;
    }
  },
  requestPermissions: async () => {
    if (!NotificationsModule) return { status: 'denied' };
    try {
      const { status } = await NotificationsModule.requestPermissionsAsync();
      return { status };
    } catch (err) {
      console.warn('[Native Notifications] requestPermissions failed:', err);
      return { status: 'denied' };
    }
  },
  cancelScheduledByTag: async (tag: string) => {
    if (!NotificationsModule) return;
    try {
      const items = await NotificationsModule.getAllScheduledNotificationsAsync();
      const targets = (items || []).filter((item: any) => item?.content?.data?.tag === tag);
      await Promise.all(targets.map((item: any) => NotificationsModule.cancelScheduledNotificationAsync(item.identifier)));
    } catch (err) {
      console.warn('[Native Notifications] cancelScheduledByTag failed:', err);
    }
  },
};
export default nativeNotifications;
