"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, CheckCircle2, Zap, Radio } from "lucide-react";
import { getRecentActivity, type ActivityItem, type ActivityType } from "@/actions/activity";
import { getOverallLeaderboard, type LeaderboardRow } from "@/actions/results";
import { useShakhas } from "@/hooks/use-feast";
import { GlassPanel, theme } from "./feast-shared";

const ACTIVITY_POLL_MS = 120_000;

const TYPE_CONFIG: Record<ActivityType, { icon: typeof Trophy; label: string; color: string; bg: string }> = {
  published: { icon: Trophy, label: "Results published", color: "#B45309", bg: "#FDE68A" },
  completed: { icon: CheckCircle2, label: "Competition completed", color: "#15803D", bg: "#BBF7D0" },
  started: { icon: Zap, label: "Competition started", color: "#B91C1C", bg: "#FECACA" },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function genderWord(g: string | null) {
  if (g === "boy") return "Boys";
  if (g === "girl") return "Girls";
  return null;
}

export function LiveActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => getRecentActivity(8).then((data) => { if (!cancelled) { setItems(data); setLoaded(true); } });
    load();
    const id = setInterval(load, ACTIVITY_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loaded && items.length === 0) return null;

  return (
    <GlassPanel strong className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#EF4444" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#EF4444" }} />
          </span>
          <p className="text-sm font-semibold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>Live Updates</p>
        </div>
        <Radio className="h-3.5 w-3.5" style={{ color: theme.faint }} />
      </div>
      <div className="max-h-[340px] divide-y overflow-y-auto" style={{ borderColor: theme.hairline }}>
        {!loaded ? (
          <div className="px-4 py-6 text-center text-xs" style={{ color: theme.faint }}>Loading…</div>
        ) : (
          items.map((item, i) => {
            const cfg = TYPE_CONFIG[item.type];
            const Icon = cfg.icon;
            const gw = genderWord(item.gender);
            return (
              <Link
                key={item.id}
                href={item.type === "published" ? `/results?feast=${item.feastSlug}` : `/feast/${item.feastSlug}/stages`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02]"
                style={{ borderColor: theme.hairline, animation: i === 0 ? "feastPulseIn .5s ease" : undefined }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: cfg.bg }}>
                  <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: theme.text }}>
                    {item.categoryName ? `${item.categoryName}${gw ? ` ${gw}` : ""} ` : ""}
                    <span style={{ fontFamily: "var(--font-anek), sans-serif" }}>{item.competitionName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: cfg.color }}>{cfg.label}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10.5px]" style={{ color: theme.faint }}>{relativeTime(item.at)}</span>
              </Link>
            );
          })
        )}
      </div>
      <style jsx>{`
        @keyframes feastPulseIn {
          from { background-color: rgba(var(--fp-primary-rgb), 0.08); }
          to { background-color: transparent; }
        }
      `}</style>
    </GlassPanel>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];
const MEDAL_COLOR = ["#F5C542", "#9CA3AF", "#E0936A"];

export function TopShakhasWidget() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { shakhas } = useShakhas();

  useEffect(() => {
    getOverallLeaderboard().then(({ data }) => { setRows((data ?? []).slice(0, 3)); setLoaded(true); });
  }, []);

  const shakhaColor = (name: string) => shakhas.find((s) => s.name === name)?.color ?? theme.lavender;
  const hasResults = rows.some((r) => r.points > 0);

  if (loaded && !hasResults) return null;

  return (
    <GlassPanel strong className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>Top Shakhas</p>
        <Link href="/rankings" className="text-xs font-semibold" style={{ color: theme.purple }}>See all →</Link>
      </div>
      {!loaded ? (
        <p className="text-xs" style={{ color: theme.faint }}>Loading…</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.shakhaId} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: `${MEDAL_COLOR[i]}14` }}>
              <span className="text-lg">{MEDAL[i]}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: shakhaColor(r.name) }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.text }}>{r.name}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: MEDAL_COLOR[i] }}>{r.points} pts</span>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
