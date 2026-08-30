import { Cormorant_Garamond, Great_Vibes, Noto_Sans_Malayalam, Oswald } from "next/font/google";
import localFont from "next/font/local";

export const posterSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-poster-serif",
  display: "swap",
});

export const posterScript = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-poster-script",
  display: "swap",
});

export const posterMalayalam = Noto_Sans_Malayalam({
  subsets: ["latin", "malayalam"],
  weight: ["500", "700", "800"],
  variable: "--font-poster-malayalam",
  display: "swap",
});

export const posterLabel = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poster-oswald",
  display: "swap",
});

// Custom Malayalam display font supplied for the poster title.
export const posterTitle = localFont({
  src: [
    { path: "./poster/FN-Nayana-Regular.ttf", weight: "400", style: "normal" },
    { path: "./poster/FN-Nayana-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-poster-title",
  display: "swap",
});

export const POSTER_FONT_CLASS = `${posterSerif.variable} ${posterScript.variable} ${posterMalayalam.variable} ${posterLabel.variable} ${posterTitle.variable}`;
