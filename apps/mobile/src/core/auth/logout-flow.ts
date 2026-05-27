import { Alert, Platform } from 'react-native';
import { Router } from 'expo-router';
import { supabase } from '@dailydue/api';
import { useDailyDueStore } from '../../store';
import i18n from '../i18n';

async function executeLogout(router: Router) {
  const { user, backupOfflineUserData, setUser, resetDemoData } = useDailyDueStore.getState();

  try {
    if (user?.id && user.id !== 'usr_offline') {
      await backupOfflineUserData();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('[Logout]', i18n.t('logout.error'), error);
  } finally {
    setUser(null);
    resetDemoData();
    router.replace('/(auth)/login');
  }
}

async function performSyncAndLogout(router: Router) {
  try {
    await useDailyDueStore.getState().flushSyncQueue();
  } catch (err) {
    console.warn('[Logout]', i18n.t('logout.syncFailure'), err);
  }

  const remainingCount = useDailyDueStore.getState().syncQueue.length;
  if (remainingCount > 0) {
    if (Platform.OS === 'web') {
      if (
        window.confirm(
          i18n.t('logout.pendingChangesWeb', { count: remainingCount })
        )
      ) {
        await executeLogout(router);
      }
    } else {
      Alert.alert(
        i18n.t('logout.unsavedDataTitle'),
        i18n.t('logout.unsavedDataDesc', { count: remainingCount }),
        [
          { text: i18n.t('logout.cancel'), style: 'cancel' },
          {
            text: i18n.t('logout.trySyncAgain'),
            onPress: () => {
              void performSyncAndLogout(router);
            },
          },
          {
            text: i18n.t('logout.loseDataAndExit'),
            style: 'destructive',
            onPress: () => {
              void executeLogout(router);
            },
          },
        ]
      );
    }
    return;
  }

  await executeLogout(router);
}

/** Prompts the user to sync pending changes (if any) and then logs out. */
export function promptLogout(router: Router) {
  const pendingCount = useDailyDueStore.getState().syncQueue.length;

  if (pendingCount > 0) {
    if (Platform.OS === 'web') {
      if (
        window.confirm(
          i18n.t('logout.pendingChangesWebConfirm', { count: pendingCount })
        )
      ) {
        void performSyncAndLogout(router);
      } else {
        void executeLogout(router);
      }
    } else {
      Alert.alert(
        i18n.t('logout.syncBeforeExitTitle'),
        i18n.t('logout.syncBeforeExitDesc', { count: pendingCount }),
        [
          {
            text: i18n.t('logout.syncAndExit'),
            onPress: () => {
              void performSyncAndLogout(router);
            },
          },
          {
            text: i18n.t('logout.exitWithoutSaving'),
            style: 'destructive',
            onPress: () => {
              void executeLogout(router);
            },
          },
          { text: i18n.t('logout.cancel'), style: 'cancel' },
        ]
      );
    }
    return;
  }

  void executeLogout(router);
}
