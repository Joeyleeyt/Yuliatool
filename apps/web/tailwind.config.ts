import type { Config } from 'tailwindcss';

/** rgb(var(--x) / <alpha>) helper so every token supports opacity modifiers. */
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--bg'),
        surface: {
          DEFAULT: withAlpha('--surface-1'),
          1: withAlpha('--surface-1'),
          2: withAlpha('--surface-2'),
          3: withAlpha('--surface-3'),
        },
        line: withAlpha('--border'),
        fg: {
          DEFAULT: withAlpha('--fg'),
          muted: withAlpha('--fg-muted'),
          subtle: withAlpha('--fg-subtle'),
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          soft: withAlpha('--accent-soft'),
          2: withAlpha('--accent-2'),
        },
        accent2: withAlpha('--accent-2'),
        success: withAlpha('--success'),
        warning: withAlpha('--warning'),
        danger: withAlpha('--danger'),
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'calc(var(--radius-xl) + 6px)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--glow-accent)',
      },
      backgroundImage: {
        'accent-radial': 'radial-gradient(60% 60% at 50% 0%, rgb(var(--accent) / 0.14) 0%, transparent 70%)',
        'accent2-radial': 'radial-gradient(50% 50% at 85% 10%, rgb(var(--accent-2) / 0.12) 0%, transparent 70%)',
        'accent-line': 'linear-gradient(90deg, transparent, rgb(var(--accent) / 0.5), transparent)',
        'editorial-glow':
          'radial-gradient(70% 55% at 50% -10%, rgb(var(--accent) / 0.10) 0%, transparent 60%), radial-gradient(45% 45% at 90% 0%, rgb(var(--accent-2) / 0.09) 0%, transparent 60%)',
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        float: 'float 6s ease-in-out infinite',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
