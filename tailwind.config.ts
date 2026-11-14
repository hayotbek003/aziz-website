import type { Config } from "tailwindcss";
import containerQueries from "@tailwindcss/container-queries";

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Цвета витрины магазина (задаются темой магазина через CSS-переменные)
        sp: v("--c-primary"),
        sp2: v("--c-primary2"),
        sbg: v("--c-bg"),
        ssf: v("--c-surface"),
        sink: v("--c-text"),
        smu: v("--c-muted"),
        // Цвета платформы AZIZ (кабинет, админка, лендинг)
        gold: { DEFAULT: "#F5A524", 50: "#FFF8E6", 200: "#FFD98A", 300: "#FFC857", 400: "#F5A524", 500: "#E08A00", 600: "#B86E00" },
        ink: { 950: "#050506", 900: "#0B0B0E", 850: "#101015", 800: "#15151B", 700: "#1D1D25", 600: "#2A2A35", 500: "#3A3A47", 400: "#6B6B7B", 300: "#9A9AAA", 200: "#C8C8D2", 100: "#EDEDF2" },
      },
      fontFamily: {
        body: "var(--font-body)",
        head: "var(--font-head)",
        ui: "var(--f-manrope)",
        brand: "var(--f-unbounded)",
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        fadein: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { float: "float 5s ease-in-out infinite", fadein: "fadein .35s ease-out both" },
    },
  },
  plugins: [containerQueries],
} satisfies Config;
