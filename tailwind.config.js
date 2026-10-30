/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070f1e',
          900: '#0c1a30',
          850: '#112240',
          800: '#162b50',
          700: '#1f3a6e',
          600: '#2a4d91',
          500: '#3b66b8',
          100: '#e2eaf8',
          50: '#f0f5fd',
        },
        civic: {
          accent: '#2563eb',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#ef4444',
          purple: '#8b5cf6',
          teal: '#0d9488',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 4px 20px -2px rgba(12, 26, 48, 0.08)',
        'glow': '0 0 25px -5px rgba(37, 99, 235, 0.3)',
      }
    },
  },
  plugins: [],
}

