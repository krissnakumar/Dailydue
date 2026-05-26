import React, { createContext, useState } from 'react';
import { useFiadoStore } from '../../../store';
import { useIAP } from '../../../core/services/iap.native';
import { useNetworkStatus } from '../../../core/hooks/useNetworkStatus';
import { billingService } from '../services/billing.service';
import { tracker } from '../../../core/analytics/tracker';

interface BillingContextProps {
  loading: boolean;
  isOffline: boolean;
  connected: boolean;
  subscriptions: any[];
  fetchProducts: (skus: string[]) => Promise<void>;
  handleUpgrade: (premiumSubId: string, androidPackageName: string) => Promise<boolean>;
  handleRestore: (premiumSubId: string, androidPackageName: string) => Promise<boolean>;
}

export const BillingContext = createContext<BillingContextProps | undefined>(undefined);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const isOffline = useNetworkStatus();
  const { fetchSubscription } = useFiadoStore();

  const iap = useIAP({
    onPurchaseSuccess: async (purchase) => {
      console.log('[IAP] Purchase success callback:', purchase);
    },
    onPurchaseError: (err) => {
      console.warn('[IAP] Purchase error callback:', err);
      tracker.trackBillingFailure('unknown', err?.message || String(err));
    },
  });

  const fetchProducts = async (skus: string[]) => {
    if (iap.connected) {
      await iap.fetchProducts({ skus, type: 'subs' });
    }
  };

  const handleUpgrade = async (premiumSubId: string, androidPackageName: string): Promise<boolean> => {
    if (isOffline) {
      throw new Error('OFFLINE_MODE');
    }
    setLoading(true);
    try {
      if (!iap.connected) throw new Error('IAP_NOT_CONNECTED');
      const offerToken = iap.subscriptions?.[0]?.subscriptionOffers?.[0]?.offerTokenAndroid || '';
      await iap.requestPurchase({
        type: 'subs',
        request: {
          google: { skus: [premiumSubId], subscriptionOffers: [{ sku: premiumSubId, offerToken }] },
        },
      });
      return true;
    } catch (e: any) {
      console.error('[IAP] Upgrade failed:', e);
      tracker.trackBillingFailure(premiumSubId, e?.message || String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (premiumSubId: string, androidPackageName: string): Promise<boolean> => {
    setLoading(true);
    try {
      await iap.restorePurchases({ includeSuspendedAndroid: true });
      const purchases = await iap.getAvailablePurchases({ onlyIncludeActiveItemsAndroid: true });
      const prem = (purchases || []).find((p: any) => p?.productId === premiumSubId);
      if (prem) {
        const success = await billingService.verifyAndRefresh(prem, premiumSubId, androidPackageName);
        await fetchSubscription();
        return success;
      }
      await fetchSubscription();
      return false;
    } catch (e: any) {
      console.error('[IAP] Restore failed:', e);
      tracker.trackBillingFailure(premiumSubId, e?.message || String(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <BillingContext.Provider
      value={{
        loading,
        isOffline,
        connected: iap.connected,
        subscriptions: iap.subscriptions,
        fetchProducts,
        handleUpgrade,
        handleRestore,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};
