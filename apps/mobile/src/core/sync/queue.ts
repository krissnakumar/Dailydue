import { useFiadoStore } from '../../store';

export const syncQueue = {
  getQueue: () => {
    return useFiadoStore.getState().syncQueue;
  },
  push: (item: any) => {
    useFiadoStore.setState((state) => ({
      syncQueue: [...state.syncQueue, item],
    }));
  },
  clear: () => {
    useFiadoStore.setState({ syncQueue: [] });
  },
};
export default syncQueue;
