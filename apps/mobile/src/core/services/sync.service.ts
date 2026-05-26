import { attemptBackgroundSync } from '../sync/SyncEngine';
import { useFiadoStore } from '../../store';

export const syncService = {
  triggerSync: async () => {
    const state = useFiadoStore.getState;
    const set = useFiadoStore.setState;
    return attemptBackgroundSync(state, set);
  },
};
export default syncService;
