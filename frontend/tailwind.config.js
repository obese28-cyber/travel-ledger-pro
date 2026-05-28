/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind which files to scan for class names.
  // If a class isn't used in these files, it won't appear in the final CSS.
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  // 'class' strategy: dark mode is toggled by adding class="dark" to <html>.
  // This lets users switch manually. Future: persist preference in localStorage.
  darkMode: 'class',

  theme: {
    extend: {
      // Brand colors — consistent with the app identity
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
      },
      // Sidebar width token used across layout components
      spacing: {
        sidebar: '256px',
      },
    },
  },
  plugins: [],
}
