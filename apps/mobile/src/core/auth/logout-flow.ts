import { Alert, Platform } from 'react-native';
import { Router } from 'expo-router';
import { supabase } from '@dailydue/api';
import { useDailyDueStore } from '../../store';

async function executeLogout(router: Router) {
  const { user, backupOfflineUserData, setUser, resetDemoData } = useDailyDueStore.getState();

  try {
    if (user?.id && user.id !== 'usr_offline') {
      await backupOfflineUserData();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('[Logout] Erro ao desconectar', error);
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
    console.warn('[Logout] Falha na sincronização final:', err);
  }

  const remainingCount = useDailyDueStore.getState().syncQueue.length;
  if (remainingCount > 0) {
    if (Platform.OS === 'web') {
      if (
        window.confirm(
          `Atenção: Você ainda possui ${remainingCount} alterações pendentes de sincronização (talvez esteja offline). Se você sair agora, essas alterações serão perdidas. Deseja sair mesmo assim?`
        )
      ) {
        await executeLogout(router);
      }
    } else {
      Alert.alert(
        'Dados não salvos!',
        `Você ainda possui ${remainingCount} alterações pendentes que não foram salvas na nuvem. Se sair agora, elas serão perdidas.\n\nDeseja sair mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Tentar Sincronizar Novamente',
            onPress: () => {
              void performSyncAndLogout(router);
            },
          },
          {
            text: 'Sair e Perder Dados',
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
          `Você possui ${pendingCount} alterações pendentes de sincronização. Deseja tentar salvá-las antes de sair?`
        )
      ) {
        void performSyncAndLogout(router);
      } else {
        void executeLogout(router);
      }
    } else {
      Alert.alert(
        'Sincronizar antes de sair?',
        `Você possui ${pendingCount} alterações locais que ainda não foram salvas na nuvem. Deseja sincronizá-las antes de sair?`,
        [
          {
            text: 'Sincronizar e Sair',
            onPress: () => {
              void performSyncAndLogout(router);
            },
          },
          {
            text: 'Sair Sem Salvar',
            style: 'destructive',
            onPress: () => {
              void executeLogout(router);
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    }
    return;
  }

  void executeLogout(router);
}
