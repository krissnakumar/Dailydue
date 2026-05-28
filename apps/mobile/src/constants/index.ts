/**
 * Global Constants - Fiado Mobile Control
 */

export const STORAGE_KEYS = {
  CUSTOMERS: 'dailydue_mobile_clientes',
  SYNC_QUEUE: 'dailydue_mobile_sync_queue',
  QUICK_ITEMS: 'dailydue_mobile_quick_items',
  AUTH_SESSION: 'dailydue_mobile_auth_session',
  BUSINESS_CONFIG: 'dailydue_mobile_business_config',
};

export const INITIAL_QUICK_ITEMS = [
  { name: 'French Bread', price: 5.00, count: 12, lastUsed: new Date().toISOString() },
  { name: 'Whole Milk', price: 6.50, count: 8, lastUsed: new Date().toISOString() },
  { name: 'Coffee Packet', price: 14.00, count: 5, lastUsed: new Date().toISOString() },
  { name: 'Canned Beer', price: 5.50, count: 20, lastUsed: new Date().toISOString() },
  { name: 'Coca-Cola 2L', price: 10.00, count: 15, lastUsed: new Date().toISOString() },
  { name: 'Lunch Box / Meal', price: 25.00, count: 9, lastUsed: new Date().toISOString() }
];

export const INITIAL_CUSTOMERS = [
  {
    id: 'cust_1',
    business_id: 'biz_production_br_01',
    full_name: 'Sarah Connor (Neighbor)',
    phone: '15550199001',
    total_debt: 115.00,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    history: [
      { id: 'hist_1', description: 'Lunch Box / Meal', amount: 25.00, created_at: new Date().toISOString(), type: 'debt', created_by: 'Owner' },
      { id: 'hist_2', description: 'Eggs and Cooking Oil', amount: 32.00, created_at: new Date(Date.now() - 2 * 86400000).toISOString(), type: 'debt', created_by: 'Owner' },
      { id: 'hist_3', description: 'Laundry Detergent', amount: 58.00, created_at: new Date(Date.now() - 5 * 86400000).toISOString(), type: 'debt', created_by: 'Cashier' }
    ]
  },
  {
    id: 'cust_2',
    business_id: 'biz_production_br_01',
    full_name: 'John Doe (Contractor)',
    phone: '15550199002',
    total_debt: 48.50,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    history: [
      { id: 'hist_4', description: 'Bread and Ham', amount: 12.50, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'debt', created_by: 'Cashier' },
      { id: 'hist_5', description: 'Coca-Cola and Charcoal', amount: 36.00, created_at: new Date(Date.now() - 3 * 86400000).toISOString(), type: 'debt', created_by: 'Owner' }
    ]
  },
  {
    id: 'cust_3',
    business_id: 'biz_production_br_01',
    full_name: 'Lucas (Mechanic)',
    phone: '15550199003',
    total_debt: 0.00,
    created_at: new Date().toISOString(),
    history: [
      { id: 'hist_6', description: 'Coffee and Pastry', amount: 22.00, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'debt', created_by: 'Owner' },
      { id: 'hist_7', description: 'Payment Received', amount: 22.00, created_at: new Date().toISOString(), type: 'payment', created_by: 'Owner' }
    ]
  }
];
