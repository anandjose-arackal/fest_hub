"use client";

import { useEffect, useState } from "react";
import { theme } from "./feast-shared";

const FLOWER_EMOJI = ["🌸", "🌺", "🌼", "🌷", "🌹", "💐", "🏵️"];

interface Petal {
  id: number;
  emoji: string;
  left: number;
  duration: number;
  size: number;
  drift: number;
  rotate: number;
}

let petalSeq = 0;

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function timeLeft(targetMs: number): Remaining | null {
  const ms = targetMs - Date.now();
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl px-2 py-2.5" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.75)" }}>
      <span className="text-[22px] font-bold leading-none tabular-nums sm:text-[26px]" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: theme.sub }}>{label}</span>
    </div>
  );
}

// Feast Portal dashboard: countdown to the soonest active feast's start date
// (feasts are already ordered by start_date — see useFeasts's query — so
// callers just pass feasts[0]). Flower petals drift down every couple
// seconds as a small decorative flourish. `start_date` is a plain `date`
// column (no time-of-day, same caveat as isRegistrationClosed in
// feast-details.tsx) so this counts down to that date's UTC midnight.
// Once the target passes, the component unmounts itself (returns null)
// rather than freezing at 00:00:00:00.
export function MissionCountdown({ startDate, feastName }: { startDate: string | null; feastName?: string }) {
  const target = startDate ? new Date(startDate).getTime() : null;
  const [left, setLeft] = useState<Remaining | null>(() => (target ? timeLeft(target) : null));
  const [petals, setPetals] = useState<Petal[]>([]);

  useEffect(() => {
    if (!target) return;
    setLeft(timeLeft(target));
    const id = setInterval(() => setLeft(timeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const petal: Petal = {
        id: petalSeq++,
        emoji: FLOWER_EMOJI[Math.floor(Math.random() * FLOWER_EMOJI.length)],
        left: 6 + Math.random() * 88,
        duration: 4 + Math.random() * 2.5,
        size: 14 + Math.random() * 10,
        drift: (Math.random() - 0.5) * 40,
        rotate: (Math.random() - 0.5) * 240,
      };
      setPetals((prev) => [...prev.slice(-7), petal]);
      setTimeout(() => setPetals((prev) => prev.filter((p) => p.id !== petal.id)), petal.duration * 1000 + 150);
    }, 2000);
    return () => clearInterval(id);
  }, [target]);

  if (!target || !left) return null;

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-[22px] p-4"
      style={{ background: "linear-gradient(135deg, rgba(107,70,255,0.10), rgba(236,72,153,0.10) 55%, rgba(245,197,66,0.14))", border: "1px solid rgba(107,70,255,0.14)" }}
    >
      <p className="relative flex items-center gap-2 text-[19px] font-extrabold leading-tight sm:text-[24px]" style={{ fontFamily: "var(--font-anek), sans-serif" }}>
        <span className="inline-block" style={{ fontSize: "1.15em", animation: "rocket-bounce 1.6s ease-in-out infinite" }}>🚀</span>
        <span
          style={{
            background: "linear-gradient(100deg, #6B46FF, #EC4899, #F5C542)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {feastName ? `${feastName} Starts In` : "Next Mission Starts In"}
        </span>
      </p>
      <div className="relative mt-3 flex gap-2 sm:gap-3">
        <Unit value={left.days} label="Days" />
        <Unit value={left.hours} label="Hours" />
        <Unit value={left.minutes} label="Min" />
        <Unit value={left.seconds} label="Sec" />
      </div>

      {petals.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none absolute select-none"
          style={{
            left: `${p.left}%`,
            top: "-10%",
            fontSize: p.size,
            animation: `feast-petal-fall ${p.duration}s ease-in forwards`,
            "--petal-drift": `${p.drift}px`,
            "--petal-rotate": `${p.rotate}deg`,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}

      <style jsx>{`
        @keyframes feast-petal-fall {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate(var(--petal-drift), 160px) rotate(var(--petal-rotate)); opacity: 0; }
        }
        @keyframes rocket-bounce {
          0%, 100% { transform: translateY(0) rotate(-8deg); }
          50% { transform: translateY(-4px) rotate(4deg); }
        }
      `}</style>
    </div>
  );
}
