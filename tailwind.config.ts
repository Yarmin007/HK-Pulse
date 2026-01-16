import type { Config } from "tailwindcss";

const config: Config = {
  // This is CRITICAL. It tells Tailwind to scan your src folder
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#6D2158", // Your Plum Color
      },
      fontFamily: {
        antiqua: ["Book Antiqua", "Palatino", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;