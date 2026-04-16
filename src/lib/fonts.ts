import { Syne, Outfit, JetBrains_Mono } from "next/font/google";

export const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
