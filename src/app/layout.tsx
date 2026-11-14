import type { Metadata, Viewport } from "next";
import Script from "next/script";
import {
  Comfortaa, Exo_2, Inter, Lora, Manrope, Montserrat, Nunito, Oswald, Playfair_Display, Rubik, Russo_One, Unbounded,
} from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--f-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--f-manrope", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin", "cyrillic"], variable: "--f-montserrat", display: "swap", preload: false });
const rubik = Rubik({ subsets: ["latin", "cyrillic"], variable: "--f-rubik", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin", "cyrillic"], variable: "--f-nunito", display: "swap", preload: false });
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--f-unbounded", display: "swap" });
const russo = Russo_One({ subsets: ["latin", "cyrillic"], weight: "400", variable: "--f-russo", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin", "cyrillic"], variable: "--f-oswald", display: "swap", preload: false });
const exo2 = Exo_2({ subsets: ["latin", "cyrillic"], variable: "--f-exo2", display: "swap", preload: false });
const comfortaa = Comfortaa({ subsets: ["latin", "cyrillic"], variable: "--f-comfortaa", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin", "cyrillic"], variable: "--f-playfair", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin", "cyrillic"], variable: "--f-lora", display: "swap", preload: false });

const fontVars = [inter, manrope, montserrat, rubik, nunito, unbounded, russo, oswald, exo2, comfortaa, playfair, lora]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "AZIZ Website — интернет-магазин в Telegram",
  description: "Платформа для создания интернет-магазинов в Telegram: 10 шаблонов, управление через бота, 7 дней бесплатно.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#07070A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={fontVars} suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-dvh bg-ink-950 font-ui text-ink-100 antialiased">{children}</body>
    </html>
  );
}
