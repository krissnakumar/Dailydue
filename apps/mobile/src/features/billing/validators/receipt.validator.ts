export function extractPurchaseToken(purchase: any): string | null {
  const direct = purchase?.purchaseToken || purchase?.transactionReceipt?.purchaseToken || purchase?.dataAndroid?.purchaseToken;
  if (direct) return String(direct);

  const receipt = purchase?.transactionReceipt || purchase?.dataAndroid;
  if (typeof receipt === 'string') {
    try {
      const parsed = JSON.parse(receipt);
      return parsed?.purchaseToken || parsed?.token || null;
    } catch {
      return null;
    }
  }

  return null;
}
