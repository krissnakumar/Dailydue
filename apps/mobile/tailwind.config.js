/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#059669',
          light: '#10b981',
          dark: '#047857',
          brand: '#064e3b',
        },
        accent: {
          DEFAULT: '#ea580c',
          light: '#f97316',
        },
        surface: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
          input: '#f1f5f9',
          border: '#e2e8f0',
        },
        status: {
          success: '#10b981',
          successBg: '#d1fae5',
          warning: '#f59e0b',
          warningBg: '#fef9c3',
          danger: '#ef4444',
          dangerBg: '#fee2e2',
        },
        whatsapp: '#25d366',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
