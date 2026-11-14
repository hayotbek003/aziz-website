import type { CSSProperties } from "react";
import type { Theme } from "./types";
import { mediaUrl } from "./format";

export const FONTS: { key: string; name: string; varName: string }[] = [
  { key: "inter", name: "Inter", varName: "--f-inter" },
  { key: "manrope", name: "Manrope", varName: "--f-manrope" },
  { key: "montserrat", name: "Montserrat", varName: "--f-montserrat" },
  { key: "rubik", name: "Rubik", varName: "--f-rubik" },
  { key: "nunito", name: "Nunito", varName: "--f-nunito" },
  { key: "unbounded", name: "Unbounded", varName: "--f-unbounded" },
  { key: "russo", name: "Russo One", varName: "--f-russo" },
  { key: "oswald", name: "Oswald", varName: "--f-oswald" },
  { key: "exo2", name: "Exo 2", varName: "--f-exo2" },
  { key: "comfortaa", name: "Comfortaa", varName: "--f-comfortaa" },
  { key: "playfair", name: "Playfair Display", varName: "--f-playfair" },
  { key: "lora", name: "Lora", varName: "--f-lora" },
];

export function fontVar(key: string) {
  const f = FONTS.find((x) => x.key === key) || FONTS[0];
  return `var(${f.varName}), system-ui, sans-serif`;
}

export function hexToRgb(hex: string): string {
  let h = (hex || "#000000").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "0 0 0";
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).split(" ").map((x) => Number(x) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** CSS-переменные темы магазина. Применяются к корню витрины — магазины не влияют друг на друга. */
export function themeStyle(t: Theme): CSSProperties {
  const isLight = luminance(t.bg) > 0.5;
  const vars: Record<string, string> = {
    "--c-primary": hexToRgb(t.primary),
    "--c-primary2": hexToRgb(t.primary2),
    "--c-bg": hexToRgb(t.bg),
    "--c-surface": hexToRgb(t.surface),
    "--c-text": hexToRgb(t.text),
    "--c-muted": hexToRgb(t.muted),
    "--c-on-primary": luminance(t.primary) > 0.45 ? "17 17 17" : "255 255 255",
    "--r": `${Math.max(0, Math.min(32, t.radius))}px`,
    "--font-body": fontVar(t.font),
    "--font-head": fontVar(t.headingFont),
    "--glow-alpha": isLight ? "0.10" : "0.22",
  };
  let background = t.bg;
  if (t.bgStyle === "gradient") {
    background = `linear-gradient(180deg, ${t.bg} 0%, ${t.surface} 55%, ${t.bg} 100%)`;
  } else if (t.bgStyle === "glow") {
    background = `radial-gradient(900px 500px at 85% -10%, rgb(${hexToRgb(t.primary)} / var(--glow-alpha)), transparent 60%), radial-gradient(700px 400px at -10% 30%, rgb(${hexToRgb(t.primary2)} / 0.08), transparent 60%), ${t.bg}`;
  } else if (t.bgStyle === "image" && t.bgImage) {
    background = `linear-gradient(rgb(${hexToRgb(t.bg)} / 0.82), rgb(${hexToRgb(t.bg)} / 0.92)), url("${mediaUrl(t.bgImage)}") center/cover fixed, ${t.bg}`;
  }
  return { ...(vars as CSSProperties), background, color: t.text };
}
