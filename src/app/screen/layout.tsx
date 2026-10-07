import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fest Hub — Big Screen Display",
  robots: { index: false, follow: false },
};

// /screen uses the Feast Portal's championship type (Archivo, Manrope, Anek
// Malayalam) and --fp-* theme tokens, all declared by the root layout — so
// unlike the source app nothing extra needs loading here.
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ position: "fixed", inset: 0 }}>{children}</div>;
}
