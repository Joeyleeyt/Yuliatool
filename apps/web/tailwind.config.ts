import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Soft-luxury house palette (see @yulia/core HOUSE_STYLE).
        champagne: '#f3e9d8',
        espresso: '#3b2f2a',
        blush: '#e8c9c1',
      },
    },
  },
  plugins: [],
};

export default config;
