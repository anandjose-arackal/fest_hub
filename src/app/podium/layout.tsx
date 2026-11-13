import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fest Hub — Podium Screen",
  robots: { index: false, follow: false },
};

export default function PodiumLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ position: "fixed", inset: 0 }}>{children}</div>;
}
