import { verifyGooglePlaySubscription } from '@controle-fiado/api';
import { extractPurchaseToken } from '../validators/receipt.validator';

export const billingService = {
  verifyAndRefresh: async (purchase: any, premiumSubId: string, androidPackageName: string): Promise<boolean> => {
    if (!premiumSubId || purchase?.productId !== premiumSubId) return false;

    const purchaseToken = extractPurchaseToken(purchase);
    if (!purchaseToken) {
      throw new Error('RECEIPT_TOKEN_NOT_FOUND');
    }

    const result = await verifyGooglePlaySubscription({
      packageName: androidPackageName,
      productId: premiumSubId,
      purchaseToken,
    });

    return Boolean(result?.is_premium);
  },
};
export default billingService;
