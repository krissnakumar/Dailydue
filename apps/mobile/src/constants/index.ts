/**
 * Constantes Globais - Controle de Fiado Mobile
 */

export const STORAGE_KEYS = {
  CUSTOMERS: 'controle_fiado_mobile_clientes',
  SYNC_QUEUE: 'controle_fiado_mobile_sync_queue',
  QUICK_ITEMS: 'controle_fiado_mobile_quick_items',
  AUTH_SESSION: 'controle_fiado_mobile_auth_session',
  BUSINESS_CONFIG: 'controle_fiado_mobile_business_config',
};

export const INITIAL_QUICK_ITEMS = [
  { name: 'Pão Francês', price: 5.00, count: 12, lastUsed: new Date().toISOString() },
  { name: 'Leite Integral', price: 6.50, count: 8, lastUsed: new Date().toISOString() },
  { name: 'Café Pacote', price: 14.00, count: 5, lastUsed: new Date().toISOString() },
  { name: 'Cerveja Lata', price: 5.50, count: 20, lastUsed: new Date().toISOString() },
  { name: 'Coca-Cola 2L', price: 10.00, count: 15, lastUsed: new Date().toISOString() },
  { name: 'Marmitex / Almoço', price: 25.00, count: 9, lastUsed: new Date().toISOString() }
];

export const INITIAL_CUSTOMERS = [
  {
    id: 'cust_1',
    business_id: 'biz_production_br_01',
    full_name: 'Dona Cidinha (Vizinha)',
    phone: '5511999999999',
    total_debt: 115.00,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    history: [
      { id: 'hist_1', description: 'Almoço / Marmitex', amount: 25.00, created_at: new Date().toISOString(), type: 'debt', created_by: 'Dono' },
      { id: 'hist_2', description: 'Cartela de Ovos e Óleo', amount: 32.00, created_at: new Date(Date.now() - 2 * 86400000).toISOString(), type: 'debt', created_by: 'Dono' },
      { id: 'hist_3', description: 'Sabão em pó e Amaciante', amount: 58.00, created_at: new Date(Date.now() - 5 * 86400000).toISOString(), type: 'debt', created_by: 'Caixa' }
    ]
  },
  {
    id: 'cust_2',
    business_id: 'biz_production_br_01',
    full_name: 'Seu Antônio (Pedreiro)',
    phone: '5511988888888',
    total_debt: 48.50,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    history: [
      { id: 'hist_4', description: 'Pão francês e Mortadela', amount: 12.50, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'debt', created_by: 'Caixa' },
      { id: 'hist_5', description: 'Coca-Cola 2L e Carvão', amount: 36.00, created_at: new Date(Date.now() - 3 * 86400000).toISOString(), type: 'debt', created_by: 'Dono' }
    ]
  },
  {
    id: 'cust_3',
    business_id: 'biz_production_br_01',
    full_name: 'Lucas da Oficina',
    phone: '5511977777777',
    total_debt: 0.00,
    created_at: new Date().toISOString(),
    history: [
      { id: 'hist_6', description: 'Café e Pão de Queijo', amount: 22.00, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'debt', created_by: 'Dono' },
      { id: 'hist_7', description: 'Pagamento Recebido', amount: 22.00, created_at: new Date().toISOString(), type: 'payment', created_by: 'Dono' }
    ]
  }
];
