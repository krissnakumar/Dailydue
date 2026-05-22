/**
 * Theme & Tokens Preservando a Identidade Visual do Controle de Fiado
 */

export const theme = {
  colors: {
    primary: '#059669',
    primaryLight: '#10b981',
    primaryDark: '#047857',
    primaryBrand: '#064e3b',
    accent: '#ea580c',
    accentLight: '#f97316',
    payment: '#2563eb',
    whatsapp: '#25d366',
    
    // Fundos e Superfícies
    background: '#f8fafc',
    card: '#ffffff',
    textMain: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    inputBg: '#f1f5f9',

    // Cores de Status
    success: '#10b981',
    successBg: '#d1fae5',
    successText: '#065f46',
    warning: '#f59e0b',
    warningBg: '#fef9c3',
    warningText: '#854d0e',
    danger: '#ef4444',
    dangerBg: '#fee2e2',
    dangerText: '#991b1b',
    infoBg: '#e0f2fe',
    infoText: '#0369a1',
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 25,
      elevation: 6,
    },
    modal: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.12,
      shadowRadius: 30,
      elevation: 10,
    },
  },
};
