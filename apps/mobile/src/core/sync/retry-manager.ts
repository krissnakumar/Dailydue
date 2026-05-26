import { attemptBackgroundSync } from './SyncEngine';
import { useFiadoStore } from '../../store';

export const retryManager = {
  triggerWithBackoff: async () => {
    return attemptBackgroundSync(useFiadoStore.getState, useFiadoStore.setState);
  },
};
export default retryManager;
