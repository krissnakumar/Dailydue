import { Platform } from 'react-native';

let NotificationsModule: any = null;

try {
  NotificationsModule = require('expo-notifications');
} catch (e) {
  console.warn('[Native Notifications] Failed to import expo-notifications module:', e);
}

export const nativeNotifications = {
  isAvailable: () => !!NotificationsModule,
  scheduleNotification: async (title: string, body: string, triggerSeconds: number = 1) => {
    if (!NotificationsModule) {
      console.log('[Native Notifications Mock] Notification Scheduled:', { title, body });
      return null;
    }
    try {
      return await NotificationsModule.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
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
  }
};
export default nativeNotifications;
