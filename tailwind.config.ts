import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        line: v("line"),
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), mute: v("ink-mute") },
        brand: { DEFAULT: v("brand"), strong: v("brand-strong"), soft: v("brand-soft") },
        nav: { DEFAULT: v("nav"), hover: v("nav-hover"), line: v("nav-line"), ink: v("nav-ink") },
        ok: { DEFAULT: v("ok"), soft: v("ok-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        bad: { DEFAULT: v("bad"), soft: v("bad-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
        human: { DEFAULT: v("human"), soft: v("human-soft") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px" },
      boxShadow: { card: "0 1px 0 rgb(var(--line) / 0.6)", pop: "0 12px 32px -8px rgb(15 23 42 / 0.25)" },
    },
  },
  plugins: [],
};
export default config;
