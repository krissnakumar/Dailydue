import { attemptBackgroundSync } from '../sync/SyncEngine';
import { useDailyDueStore } from '../../store';

export const syncService = {
  triggerSync: async () => {
    const state = useDailyDueStore.getState;
    const set = useDailyDueStore.setState;
    return attemptBackgroundSync(state, set);
  },
};
export default syncService;
