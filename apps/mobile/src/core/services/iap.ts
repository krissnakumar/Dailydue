export function useIAP() {
  return {
    connected: false,
    subscriptions: [],
    fetchProducts: async () => {},
    requestPurchase: async () => {
      throw new Error('IAP_UNSUPPORTED_ON_THIS_PLATFORM');
    },
    finishTransaction: async () => {},
    restorePurchases: async () => {},
    getAvailablePurchases: async () => [],
  };
}
