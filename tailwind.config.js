/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Mono"', 'monospace'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        neu: {
          bg: '#e0e5ec',
          dark: '#b8bec7',
          light: '#ffffff',
          accent: '#6c63ff',
          accent2: '#ff6584',
          text: '#3d4451',
          muted: '#8892a4',
        },
      },
      boxShadow: {
        neu: '6px 6px 12px #b8bec7, -6px -6px 12px #ffffff',
        'neu-sm': '3px 3px 6px #b8bec7, -3px -3px 6px #ffffff',
        'neu-inset': 'inset 4px 4px 8px #b8bec7, inset -4px -4px 8px #ffffff',
        'neu-inset-sm': 'inset 2px 2px 5px #b8bec7, inset -2px -2px 5px #ffffff',
        'neu-pressed': 'inset 6px 6px 12px #b8bec7, inset -6px -6px 12px #ffffff',
      },
    },
  },
  plugins: [],
}
