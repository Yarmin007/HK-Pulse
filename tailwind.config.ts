import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Your Core Brand Identity
        primary: "#6D2158", // The HK Pulse Signature Maroon
        pulse: {
          maroon: "#6D2158",
          dark: "#5a1b49",
          light: "#902468",
          bg: "#FDFBFD",
        }
      },
      fontFamily: {
        antiqua: ["Book Antiqua", "Palatino Linotype", "Palatino", "serif"],
        faruma: ["Faruma", "sans-serif"], // For Maldivian text
      },
    },
  },
  plugins: [
    // @ts-ignore
    require("tailwindcss-animate")
  ],
};
export default config;