/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ice: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        cream: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          accent: '#ea580c',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(8, 47, 73, 0.08)',
        glow: '0 0 0 4px rgba(14, 165, 233, 0.25)',
      },
      animation: {
        'pulse-mic': 'pulseMic 1.6s ease-in-out infinite',
        'float-in': 'floatIn 0.4s ease-out',
      },
      keyframes: {
        pulseMic: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(14,165,233,0.5)' },
          '50%': { boxShadow: '0 0 0 12px rgba(14,165,233,0)' },
        },
        floatIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
