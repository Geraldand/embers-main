/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        panel: {
          base: '#222639',
          content: '#2d3143',
          active: '#9c81d8',
          inactive: '#3d4051',
        }
      },
    },
  },
  plugins: [],
}