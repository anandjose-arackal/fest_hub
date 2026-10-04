"use client";

import { useEffect, useState } from "react";
import { theme } from "./feast-shared";

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
    <div className="rounded-2xl pb-2.5 pt-3 text-center" style={{ background: theme.surface3, border: `1px solid ${theme.line}` }}>
      <div className="fp-num text-[32px] sm:text-[38px]">{String(value).padStart(2, "0")}</div>
      <div className="fp-cap mt-1.5 text-[9.5px]" style={{ color: theme.sub }}>{label}</div>
    </div>
  );
}

// Feast Portal dashboard: countdown to the soonest upcoming feast's start
// date. `start_date` is a plain `date` column (no time-of-day, same caveat as
// isRegistrationClosed in feast-details.tsx) so this counts down to that
// date's UTC midnight. Once the target passes, the component unmounts itself
// (returns null) rather than freezing at 00:00:00:00.
export function MissionCountdown({ startDate, feastName }: { startDate: string | null; feastName?: string }) {
  const target = startDate ? new Date(startDate).getTime() : null;
  const [left, setLeft] = useState<Remaining | null>(() => (target ? timeLeft(target) : null));

  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(timeLeft(target));
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => { cancelAnimationFrame(first); clearInterval(id); };
  }, [target]);

  if (!target || !left) return null;
  const dateLabel = new Date(target).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <section
      aria-label={feastName ? `${feastName} countdown` : "Countdown"}
      className="relative mt-6 overflow-hidden rounded-3xl px-4 pb-4 pt-[18px]"
      style={{ ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}`, boxShadow: theme.shadow }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--fp-cyan) 22%, transparent), transparent 70%)" }} />
      <div className="relative flex items-center gap-2.5">
        <span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: theme.surface3, color: "var(--fp-link)", border: `1px solid ${theme.line2}` }}>Up next</span>
        <span className="text-[12px] font-bold" style={{ color: theme.sub }}>{dateLabel}</span>
      </div>
      <h2 className="relative m-0 mt-2.5 text-[21px] font-extrabold leading-[1.3]">
        {feastName ? <span className="fp-ml">{feastName}</span> : "The next fest"}{" "}
        <span className="font-bold" style={{ color: theme.sub }}>starts in</span>
      </h2>
      <div className="relative mt-3.5 grid grid-cols-4 gap-2 sm:gap-3" role="timer" aria-live="off">
        <Unit value={left.days} label="Days" />
        <Unit value={left.hours} label="Hours" />
        <Unit value={left.minutes} label="Min" />
        <Unit value={left.seconds} label="Sec" />
      </div>
    </section>
  );
}
