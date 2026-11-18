/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#262421",
          panel: "#302e2b",
          panelHover: "#3c3934",
          border: "#45423d",
          green: "#81b64c",
          greenHover: "#95cc5c",
          boardLight: "#eeeed2",
          boardDark: "#769656",
        },
      },
    },
  },
  plugins: [],
};
