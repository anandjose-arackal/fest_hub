"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, CheckCircle2, Zap } from "lucide-react";
import { getRecentActivity, type ActivityItem, type ActivityType } from "@/actions/activity";
import { getOverallLeaderboard, getOverallMeghalaLeaderboard, type LeaderboardRow } from "@/actions/results";
import { mix, theme } from "./feast-shared";
import { Medal, isMedalPos, toneStyle } from "./feast-ui";

const ACTIVITY_POLL_MS = 120_000;

const TYPE_CONFIG: Record<ActivityType, { icon: typeof Trophy; label: string; color: string }> = {
  published: { icon: Trophy, label: "Results published", color: "var(--fp-gold-ink)" },
  completed: { icon: CheckCircle2, label: "Competition completed", color: "var(--fp-ok)" },
  started: { icon: Zap, label: "Competition started", color: "var(--fp-live)" },
};

const panelStyle: React.CSSProperties = { ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}` };

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
    <section aria-label="Live updates" className="overflow-hidden rounded-3xl" style={panelStyle}>
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className="fp-livedot h-2 w-2" />
        <h2 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: theme.text }}>Live updates</h2>
        <span className="text-[11.5px] font-bold" style={{ color: theme.faint }}>Every 2 min</span>
      </div>
      <div className="fp-scroll max-h-[360px] overflow-y-auto">
        {!loaded ? (
          <div className="px-4 py-6 text-center text-xs" style={{ color: theme.faint, borderTop: `1px solid ${theme.line}` }}>Loading…</div>
        ) : (
          items.map((item) => {
            const cfg = TYPE_CONFIG[item.type];
            const Icon = cfg.icon;
            const gw = genderWord(item.gender);
            return (
              <Link
                key={item.id}
                href={item.type === "published" ? `/results?feast=${item.feastSlug}` : `/feast/${item.feastSlug}/stages`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02]"
                style={{ borderTop: `1px solid ${theme.line}`, color: theme.text }}
              >
                <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full" style={{ background: mix(cfg.color, 16), color: cfg.color }}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold leading-[1.35]">
                    {item.categoryName ? `${item.categoryName}${gw ? ` ${gw}` : ""} ` : ""}
                    <span className="fp-ml font-extrabold">{item.competitionName}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] font-extrabold" style={{ color: cfg.color }}>{cfg.label}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] font-bold" style={{ color: theme.faint }}>{relativeTime(item.at)}</span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}

const TIER_CONFIG = {
  shakha: { title: "Top shakhas", fetch: getOverallLeaderboard },
  meghala: { title: "Top meghalas", fetch: getOverallMeghalaLeaderboard },
} as const;

// Top-3 overall standings for one hierarchy tier. The meghala variant is only
// rendered when org_settings.hierarchy_level groups shakhas under meghalas.
export function TopRankingWidget({ tier = "shakha" }: { tier?: keyof typeof TIER_CONFIG }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const config = TIER_CONFIG[tier];

  useEffect(() => {
    config.fetch().then(({ data }) => {
      // "__unassigned__" buckets shakhas with no meghala — not a real contender.
      setRows((data ?? []).filter((r) => r.shakhaId !== "__unassigned__").slice(0, 3));
      setLoaded(true);
    });
  }, [config]);

  const hasResults = rows.some((r) => r.points > 0);

  if (loaded && !hasResults) return null;

  return (
    <section aria-label={config.title} className="rounded-3xl p-4" style={panelStyle}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-extrabold" style={{ color: theme.text }}>{config.title}</h2>
        <Link href={`/rankings?tier=${tier}&mode=overall`} className="inline-flex min-h-8 items-center text-[12.5px] font-extrabold" style={{ color: "var(--fp-link)" }}>See all →</Link>
      </div>
      {!loaded ? (
        <p className="text-xs" style={{ color: theme.faint }}>Loading…</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r, i) => {
            const pos = i + 1;
            return (
              <li key={r.shakhaId} className="flex items-center gap-3 rounded-[14px] px-3 py-2.5" style={isMedalPos(pos) ? toneStyle(pos) : undefined}>
                {isMedalPos(pos) && <Medal pos={pos} size={28} />}
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold" style={{ color: theme.text }}>{r.name}</span>
                <span className="fp-num text-[22px]">{r.points}</span>
                <span className="fp-cap text-[9px]" style={{ color: theme.faint }}>pts</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
