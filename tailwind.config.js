import colors from 'tailwindcss/colors';

const withOpacityValue = (variable) => ({ opacityValue } = { opacityValue: undefined }) => {
  if (opacityValue !== undefined) {
    return `rgb(var(${variable}) / ${opacityValue})`;
  }
  return `rgb(var(${variable}))`;
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', 'theme-dark'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      primary: withOpacityValue('--color-accent'),
      white: withOpacityValue('--color-surface'),
      black: withOpacityValue('--color-text'),
      background: withOpacityValue('--color-bg'),
      'background-light': withOpacityValue('--color-bg'),
      surface: withOpacityValue('--color-surface'),
      'surface-2': withOpacityValue('--color-surface-2'),
      'card-light': withOpacityValue('--color-surface'),
      border: withOpacityValue('--color-border'),
      'text-main-light': withOpacityValue('--color-text'),
      'text-sub-light': withOpacityValue('--color-muted'),
      muted: withOpacityValue('--color-muted'),
      'muted-2': withOpacityValue('--color-muted-2'),
      overlay: withOpacityValue('--color-overlay'),
      gray: colors.gray,
      red: colors.red,
      amber: colors.amber,
      green: colors.green,
      stone: colors.stone,
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        display: ['Spline Sans', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '1rem',
        'lg': '1.5rem',
        'xl': '2rem',
      },
      keyframes: {
        flame: {
          '0%, 100%': { transform: 'rotate(-6deg) scale(1)' },
          '50%': { transform: 'rotate(6deg) scale(1.08)' },
        },
        'pulse-glow': {
          '0%, 100%': { 
            transform: 'translateX(-50%) scale(1)',
            boxShadow: '0 6px 28px rgba(249, 245, 6, 0.5), 0 0 0 0 rgba(249, 245, 6, 0.4)',
          },
          '50%': { 
            transform: 'translateX(-50%) scale(1.08)',
            boxShadow: '0 8px 36px rgba(249, 245, 6, 0.7), 0 0 0 8px rgba(249, 245, 6, 0.2)',
          },
        },
      },
      animation: {
        flame: 'flame 1.2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
