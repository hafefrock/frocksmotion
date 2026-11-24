import "@fontsource-variable/manrope";
import "@fontsource-variable/syne";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/caveat";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/bebas-neue";
import type { FontId } from "./types";

export const FONTS: { id: FontId; label: string; family: string; weight: number }[] = [
  { id: "manrope", label: "Manrope", family: "'Manrope Variable', system-ui, sans-serif", weight: 800 },
  { id: "syne", label: "Syne", family: "'Syne Variable', sans-serif", weight: 800 },
  { id: "playfair", label: "Playfair", family: "'Playfair Display Variable', serif", weight: 700 },
  { id: "bebas", label: "Bebas", family: "'Bebas Neue', sans-serif", weight: 400 },
  { id: "caveat", label: "Caveat", family: "'Caveat Variable', cursive", weight: 700 },
  { id: "mono", label: "Mono", family: "'JetBrains Mono Variable', monospace", weight: 700 },
];

export const fontOf = (id?: FontId) => FONTS.find((f) => f.id === id) ?? FONTS[0];

// Pastikan semua font sudah termuat (penting saat render video, supaya huruf tidak jatuh ke font cadangan)
export const loadAllFonts = () =>
  Promise.all(FONTS.map((f) => document.fonts.load(`${f.weight} 64px ${f.family.split(",")[0]}`)));
