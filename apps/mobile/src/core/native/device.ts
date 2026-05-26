import { Platform } from 'react-native';

let DeviceModule: any = null;

try {
  DeviceModule = require('expo-device');
} catch (e) {
  console.warn('[Native Device] Failed to import expo-device module:', e);
}

export const nativeDevice = {
  isAvailable: () => !!DeviceModule,
  getDeviceModelName: (): string => {
    if (!DeviceModule) return Platform.OS === 'android' ? 'Android Device' : Platform.OS === 'ios' ? 'iPhone/iPad' : 'Web Browser';
    try {
      return DeviceModule.modelName || 'Unknown Device';
    } catch {
      return 'Unknown Device';
    }
  },
  getOSName: (): string => {
    if (!DeviceModule) return Platform.OS;
    try {
      return DeviceModule.osName || Platform.OS;
    } catch {
      return Platform.OS;
    }
  },
  isDevice: (): boolean => {
    if (!DeviceModule) return false;
    try {
      return DeviceModule.isDevice || false;
    } catch {
      return false;
    }
  }
};
export default nativeDevice;
