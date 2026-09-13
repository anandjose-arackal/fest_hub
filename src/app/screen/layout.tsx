import type { Metadata } from "next";
import { Oswald, Rajdhani, Barlow } from "next/font/google";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fest Hub — Big Screen Display",
  robots: { index: false, follow: false },
};

// Root layout already declares --font-anek (Anek_Malayalam) via
// src/app/layout.tsx — /screen relies on that ambient variable, so unlike
// the source app's warning, nothing extra needs loading here beyond its
// own Oswald/Rajdhani/Barlow set.
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${oswald.variable} ${rajdhani.variable} ${barlow.variable}`} style={{ position: "fixed", inset: 0 }}>
      {children}
    </div>
  );
}
