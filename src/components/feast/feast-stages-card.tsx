"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useCompetitionStages } from "@/hooks/use-competition-stages";
import { theme } from "./feast-shared";
import { VenueMap } from "./venue-map";
import { STAGE_VIEWS, type StageView } from "./feast-stages";

// Homepage entry to a fest's stages: three illustrated tiles, one per view of
// the stage page — On stage now, the venue map (the isometric campus itself)
// and the schedule. Phones: the map tile runs full width on top, the other
// two share a row below; wider screens: one row, map in the middle.

/** A stage: red curtains, a spotlight on a performer, and a live dot when something is on. */
function StageArt({ live }: { live: boolean }) {
  return (
    <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="sa-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B1B5A" /><stop offset="1" stopColor="#1E1033" /></linearGradient>
        <linearGradient id="sa-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FDE68A" stopOpacity=".85" /><stop offset="1" stopColor="#FDE68A" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="160" height="100" fill="url(#sa-bg)" />
      <path d="M80 4 L52 78 L108 78 Z" fill="url(#sa-beam)" />
      <path d="M18 80 L142 80 L156 98 L4 98 Z" fill="#C8763A" />
      <path d="M18 80 L142 80 L144 84 L16 84 Z" fill="#E0A060" />
      <circle cx="80" cy="50" r="7" fill="#FFF3D6" />
      <path d="M70 80 Q72 60 80 58 Q88 60 90 80 Z" fill="#FFF3D6" />
      <path d="M86 62 L100 48" stroke="#FFF3D6" strokeWidth="4" strokeLinecap="round" />
      <path d="M0 0 H44 Q36 30 40 82 Q20 76 0 84 Z" fill="#C0392B" />
      <path d="M160 0 H116 Q124 30 120 82 Q140 76 160 84 Z" fill="#C0392B" />
      <path d="M0 0 H160 V12 Q80 22 0 12 Z" fill="#A93226" />
      {[10, 22, 34, 126, 138, 150].map((x) => <path key={x} d={`M${x} 14 Q${x + 3} 45 ${x - 1} 78`} stroke="#8E2A20" strokeWidth="2" fill="none" opacity=".6" />)}
      {live && (
        <g>
          <circle cx="146" cy="24" r="9" fill="#F59E0B" opacity=".35"><animate attributeName="r" values="6;12;6" dur="1.6s" repeatCount="indefinite" /></circle>
          <circle cx="146" cy="24" r="5.5" fill="#F59E0B" />
        </g>
      )}
    </svg>
  );
}

/** A clipboard with a numbered running order and a clock for the start time. */
function ScheduleArt() {
  const rows = [["#16A34A", 1], ["#F59E0B", 2], ["#8B5CF6", 3], ["#8B5CF6", 4]] as const;
  return (
    <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden="true">
      <rect width="160" height="100" fill="#FFF4E2" />
      <circle cx="18" cy="86" r="30" fill="#FDE3BF" />
      <rect x="40" y="10" width="78" height="86" rx="8" fill="#B5652E" />
      <rect x="46" y="18" width="66" height="74" rx="4" fill="#FFFFFF" />
      <rect x="64" y="5" width="30" height="12" rx="4" fill="#7A7A82" />
      {rows.map(([c, n], i) => (
        <g key={n} transform={`translate(52 ${27 + i * 16})`}>
          <circle cx="5" cy="4" r="5" fill={c} />
          <text x="5" y="6.6" textAnchor="middle" fontSize="7" fontWeight="900" fill="#fff">{n}</text>
          <rect x="14" y="1" width={i === 1 ? 38 : 30 + (i % 2) * 8} height="6" rx="3" fill={i === 1 ? "#FCD34D" : "#E7DED3"} />
        </g>
      ))}
      <circle cx="128" cy="30" r="17" fill="#FFFFFF" stroke="var(--fp-primary, #6D28D9)" strokeWidth="4" />
      <path d="M128 30 V20 M128 30 L135 34" stroke="#2B2118" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Tile({ href, view, sub, art, className }: { href: string; view: StageView; sub: string; art: ReactNode; className?: string }) {
  const v = STAGE_VIEWS.find((x) => x.id === view)!;
  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden rounded-2xl outline-none transition-transform active:scale-[0.98] focus-visible:[box-shadow:0_0_0_3px_var(--fp-primary-light)] ${className ?? ""}`}
      style={{ background: theme.surface, border: `1px solid ${theme.line}`, color: theme.text }}
    >
      <div className="h-28 w-full overflow-hidden">{art}</div>
      <div className="px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold leading-tight">
          <v.icon className="h-4 w-4 shrink-0" style={{ color: theme.goldInk }} aria-hidden="true" />{v.label}
        </span>
        <span className="fp-ml mt-0.5 block truncate text-[11.5px] font-semibold" style={{ color: theme.sub }}>{sub}</span>
      </div>
    </Link>
  );
}

export function StagesSummaryCard({ slug, name }: { slug: string; name: string }) {
  const { stages, plan, totalCount, completedCount, runningItems, upNext } = useCompetitionStages(slug);
  const empty = stages.length === 0;
  const live = runningItems.length;
  const href = (v: StageView) => `/feast/${slug}/stages?view=${v}`;
  const nowSub = empty ? "Schedule coming soon" : live > 0 ? `${live} live · ${runningItems[0].competition.label}` : upNext ? `Up next · ${upNext.competition.label}` : "All done for the day";

  return (
    <section
      aria-label={`Stages for ${name}${live ? `, ${live} live now` : ""}`}
      className="fp-fade-up mt-3.5 overflow-hidden rounded-[24px] p-3.5 sm:p-4"
      style={{ ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}`, color: theme.text }}
    >
      <div className="mb-3 flex items-center gap-3 px-0.5">
        <span aria-hidden="true" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--fp-note-bg)", color: theme.goldInk }}>
          <MapPin className="h-[17px] w-[17px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">Stages</span>
          <span className="fp-ml mt-0.5 block truncate text-[12.5px] font-semibold" style={{ color: theme.sub }}>{name}</span>
        </span>
        {live > 0 ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: "var(--fp-live-bg)", color: "var(--fp-live)", border: "1px solid var(--fp-live-line)" }}>
            <span className="fp-livedot h-[7px] w-[7px]" />{live} live
          </span>
        ) : !empty && (
          <span className="shrink-0 text-[12.5px] font-bold" style={{ color: theme.sub }}>
            <span className="fp-num text-[15px]" style={{ color: theme.text }}>{completedCount}</span>/{totalCount} done
          </span>
        )}
      </div>

      <div className={`grid grid-cols-2 gap-2.5 ${plan ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)]" : ""}`}>
        <Tile href={href("now")} view="now" sub={nowSub} art={<StageArt live={live > 0} />} />
        {plan && (
          <Tile
            href={href("map")}
            view="map"
            sub={empty ? plan.name : `${stages.length} stages · ${plan.name}`}
            className="order-first col-span-2 sm:order-none sm:col-span-1"
            art={
              <div className="flex h-full items-center justify-center" style={{ background: "linear-gradient(180deg, #CFE8F7, #EAF5EC)" }}>
                <VenueMap stages={stages} facilities={plan.groundLabels} minFloors={plan.floors.length} venueName={plan.name} labels={false} legend={false} className="w-full px-1" />
              </div>
            }
          />
        )}
        <Tile href={href("schedule")} view="schedule" sub={empty ? "Not published yet" : `${totalCount} items · ${stages.length} stages`} art={<ScheduleArt />} />
      </div>
    </section>
  );
}
