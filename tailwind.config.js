/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'primary': '#E6FF00',
        'background-light': '#F5F5F5',
        'background-dark': '#050505',
        'card-light': '#ffffff',
        'card-dark': '#1A1A1A',
        'text-main-light': '#050505',
        'text-main-dark': '#F5F5F5',
        'text-sub-light': '#1A1A1A',
        'text-sub-dark': '#111111',
      },
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
      },
      animation: {
        flame: 'flame 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
