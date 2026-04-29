import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — forest green primary, warm clay accent, cream surface.
        forest: {
          50: "#f1f5f3",
          100: "#dce8e1",
          200: "#b8d1c4",
          300: "#8db5a1",
          400: "#5e9379",
          500: "#3f7a5d",
          600: "#1F4538",
          700: "#1a3a2f",
          800: "#152e25",
          900: "#0e1f19",
        },
        clay: {
          50: "#fbf3ed",
          100: "#f5e1d2",
          200: "#ecc3a4",
          300: "#dca174",
          400: "#c8814f",
          500: "#B5683E",
          600: "#965434",
          700: "#7a432c",
          800: "#5e3322",
          900: "#3f2217",
        },
        // Neutrals: warm-tinted greys (not blue-grey) so the cream surface looks intentional.
        sand: {
          50: "#fafaf6",
          100: "#f5f1ea",
          200: "#ebe4d4",
          300: "#dccfb5",
          400: "#c4b290",
          500: "#a89472",
          600: "#82704f",
          700: "#5e503a",
          800: "#3e352a",
          900: "#1f1b15",
        },
      },
      fontFamily: {
        serif: ['Georgia', '"Times New Roman"', "serif"],
        sans: ['"Inter"', "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.04)",
        cardHover: "0 4px 8px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)",
        elevated: "0 12px 24px -8px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.05)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
};

export default config;
