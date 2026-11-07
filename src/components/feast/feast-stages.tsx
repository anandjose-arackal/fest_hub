"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock, CheckCircle2, MapPin, Radio, MapIcon, ListOrdered } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useCompetitionStages, type CompetitionStage, type StageCompetition, type RunState } from "@/hooks/use-competition-stages";
import { FeastTopBar, mix, theme } from "./feast-shared";
import { Chip, Eyebrow } from "./feast-ui";
import { hasVenueMap } from "./venue-map";
import { VenueExplorer } from "./venue-explorer";
import { floorName, groupByFloor } from "@/lib/venue-floors";

const AMBER = "#F59E0B";

const RUN_STATE_STYLE: Record<RunState, { label: string; bg: string; color: string }> = {
  upcoming: { label: "Upcoming", bg: "var(--fp-muted-bg)", color: "var(--fp-muted-fg)" },
  running: { label: "Live", bg: "var(--fp-warn-bg)", color: "var(--fp-warn)" },
  completed: { label: "Completed", bg: "var(--fp-ok-bg)", color: "var(--fp-ok)" },
};

function Bar({ pct, fill, height = 7, track = "var(--fp-track)" }: { pct: number; fill: string; height?: number; track?: string }) {
  return (
    <div className="overflow-hidden rounded-full" style={{ height, background: track }}>
      <div className="fp-grow h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: fill }} />
    </div>
  );
}

function stageFill(state: RunState) {
  return state === "completed" ? "var(--fp-ok)" : state === "running" ? `linear-gradient(90deg, ${AMBER}, #FBBF24)` : mix("var(--fp-primary)", 30);
}

function ItemStatusIcon({ status, color }: { status: RunState; color: string }) {
  if (status === "completed") return <CheckCircle2 className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--fp-ok)" }} aria-label="Completed" />;
  if (status === "running") return <span className="fp-livedot mx-[3.5px] h-[11px] w-[11px]" style={{ background: AMBER }} aria-label="Running" />;
  return <span aria-label="Upcoming" className="mx-px h-4 w-4 shrink-0 rounded-full" style={{ border: `2px solid ${color}` }} />;
}

function StageBadge({ number, status, size = 46 }: { number: number; status: RunState; size?: number }) {
  const bg = status === "completed" ? "linear-gradient(135deg, #16A34A, #22C55E)" : status === "running" ? `linear-gradient(135deg, ${AMBER}, #FBBF24)` : "linear-gradient(135deg, var(--fp-primary), var(--fp-primary-light))";
  const glow = status === "completed" ? "rgba(22,163,74,0.35)" : status === "running" ? "rgba(245,158,11,0.5)" : "rgba(var(--fp-primary-rgb),0.3)";
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {status === "running" && <span aria-hidden="true" className="fp-livedot absolute inset-0" style={{ background: "rgba(245,158,11,.35)" }} />}
      <span className="fp-num relative flex h-full w-full items-center justify-center rounded-full text-white" style={{ background: bg, boxShadow: `0 6px 16px ${glow}`, fontSize: Math.round(size * 0.46), opacity: status === "upcoming" ? 0.75 : 1 }}>
        {status === "completed" ? <CheckCircle2 className="h-[22px] w-[22px]" aria-label="Completed" /> : number}
      </span>
    </span>
  );
}

function OverallProgress({ completed, total, pct }: { completed: number; total: number; pct: number }) {
  if (total === 0) return null;
  return (
    <section className="mt-[18px] px-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="fp-cap text-[10.5px]" style={{ color: theme.sub }}>Overall progress</span>
        <span className="text-[12.5px] font-bold" style={{ color: theme.sub }}>
          <span className="fp-num text-[15px]" style={{ color: theme.text }}>{completed}</span> / {total} completed · {pct}%
        </span>
      </div>
      <Bar pct={pct} fill="linear-gradient(90deg, var(--fp-primary), var(--fp-accent) 70%, var(--fp-gold))" height={10} />
    </section>
  );
}

function CompetitionRow({ comp, n, last }: { comp: StageCompetition; n: number; last: boolean }) {
  const style = RUN_STATE_STYLE[comp.status];
  const showAttendance = comp.status === "running" && comp.itemProgressPct != null;
  return (
    <div className="py-2.5" style={{ borderBottom: last ? "none" : `1px solid ${theme.line}` }}>
      <div className="flex items-center gap-2.5">
        <span className="fp-num w-5 shrink-0 text-right text-[13px]" style={{ color: theme.faint }}>{n}</span>
        <ItemStatusIcon status={comp.status} color={comp.categoryColor} />
        <span className="fp-ml min-w-0 flex-1 text-[14.5px] font-bold" style={{ color: comp.status === "completed" ? theme.sub : theme.text }}>{comp.label}</span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-extrabold" style={{ background: style.bg, color: style.color }}>{comp.status === "running" ? "On stage" : style.label}</span>
      </div>
      {showAttendance && (
        <div className="ml-14 mt-2 flex items-center gap-2">
          <div className="flex-1"><Bar pct={comp.itemProgressPct ?? 0} fill={AMBER} height={4} track={mix(AMBER, 18)} /></div>
          <span className="shrink-0 text-[11px] font-extrabold" style={{ color: "var(--fp-warn)" }}>{comp.itemProgressPct}% attended</span>
        </div>
      )}
    </div>
  );
}

function StageHead({ stage, where, size }: { stage: CompetitionStage; where: string | null; size: number }) {
  return (
    <>
      <StageBadge number={stage.stageNumber} status={stage.status} size={size} />
      <span className="min-w-0 flex-1">
        <span className="fp-ml block truncate text-[19px] font-extrabold leading-[1.2]" style={{ color: theme.text }}>{stage.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] font-semibold" style={{ color: theme.sub }}>Stage {stage.stageNumber}{where ? ` · ${where}` : ""}{stage.venue ? ` · ${stage.venue}` : ""}</span>
      </span>
    </>
  );
}

// "On stage now": one card per stage, saying what is on it now, what is next, or that it is done.
function NowCard({ stage, where, accent, delay, onShowOnMap }: { stage: CompetitionStage; where: string | null; accent: string; delay: number; onShowOnMap?: () => void }) {
  const running = stage.runningCompetition;
  const next = stage.nextCompetition;
  const done = stage.status === "completed";
  const tag = running ? "On stage now" : done ? null : next ? (stage.completedCount === 0 && stage.scheduledTime ? `Starts ${stage.scheduledTime}` : "Up next") : null;
  const text = running ? running.label : done ? "Done for the day" : next?.label ?? "Nothing scheduled";
  return (
    <div className="fp-fade-up overflow-hidden rounded-[22px]" style={{ animationDelay: `${delay}s`, background: theme.surface2, border: `1px solid ${running ? mix(AMBER, 45) : theme.line}`, borderTop: `4px solid ${running ? AMBER : accent}`, boxShadow: running ? "0 10px 24px rgba(245,158,11,.14)" : undefined }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <StageHead stage={stage} where={where} size={48} />
          <span className="shrink-0 whitespace-nowrap text-[13px] font-bold" style={{ color: theme.sub }}>
            <span className="fp-num text-[15px]" style={{ color: theme.text }}>{stage.completedCount}</span> of {stage.totalCount} done
          </span>
        </div>
        <div className="mt-3 rounded-2xl px-3.5 py-3" style={{ background: running ? "var(--fp-warn-bg)" : "var(--fp-muted-bg)" }}>
          {tag && (
            <p className="fp-cap m-0 flex items-center gap-1.5 text-[10px]" style={{ color: running ? "var(--fp-warn)" : theme.goldInk }}>
              {running && <span className="fp-livedot h-[7px] w-[7px]" style={{ background: AMBER }} />}{tag}
            </p>
          )}
          <p className={`fp-ml m-0 text-[16px] font-extrabold ${tag ? "mt-1" : ""}`} style={{ color: done ? theme.sub : theme.text }}>{text}</p>
          {running?.itemProgressPct != null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1"><Bar pct={running.itemProgressPct} fill={AMBER} height={5} track={mix(AMBER, 18)} /></div>
              <span className="shrink-0 text-[11.5px] font-extrabold" style={{ color: "var(--fp-warn)" }}>{running.itemProgressPct}% attended</span>
            </div>
          )}
        </div>
        <div className="mt-3"><Bar pct={stage.progressPct} fill={stageFill(stage.status)} height={6} /></div>
        {onShowOnMap && (
          <button type="button" onClick={onShowOnMap} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-extrabold" style={{ background: "var(--fp-note-bg)", color: theme.goldInk }}>
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />Show on venue map
          </button>
        )}
      </div>
    </div>
  );
}

// Schedule: every item on the stage in running order. Only the first item of
// a stage has a set time, so the start time sits on the stage, not on items.
function ScheduleCard({ stage, where, accent }: { stage: CompetitionStage; where: string | null; accent: string }) {
  return (
    <section className="overflow-hidden rounded-[22px]" style={{ background: theme.surface2, border: `1px solid ${theme.line}`, borderTop: `4px solid ${accent}` }}>
      <div className="flex items-center gap-3 px-4 pb-2.5 pt-3.5" style={{ borderBottom: `1px solid ${theme.line}` }}>
        <StageHead stage={stage} where={where} size={40} />
        {stage.scheduledTime && (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: "var(--fp-note-bg)", color: theme.goldInk }}>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />Starts {stage.scheduledTime}
          </span>
        )}
      </div>
      <ol className="m-0 list-none px-4 pb-1">
        {stage.competitions.map((c, i) => <li key={c.id}><CompetitionRow comp={c} n={i + 1} last={i === stage.competitions.length - 1} /></li>)}
      </ol>
    </section>
  );
}

export type StageView = "now" | "map" | "schedule";
export const STAGE_VIEWS: { id: StageView; label: string; tab: string; icon: typeof Radio }[] = [
  { id: "now", label: "On stage now", tab: "On stage", icon: Radio },
  { id: "map", label: "Venue map", tab: "Venue map", icon: MapIcon },
  { id: "schedule", label: "Schedule", tab: "Schedule", icon: ListOrdered },
];
const GROUP_DOTS = ["#8B5CF6", "#2563EB", "#DB2777", "#0891B2", "#EA580C", "#16A34A"];

export function FeastStages({ slug, initialView = "now" }: { slug: string; initialView?: StageView }) {
  const router = useRouter();
  const { feasts, loading: feastsLoading } = useFeasts();
  const { stages, plan, loading, totalCount, completedCount, overallPct } = useCompetitionStages(slug);
  const [view, setViewState] = useState<StageView>(initialView);
  const [filter, setFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const withMap = !!plan && hasVenueMap(stages);
  const views = STAGE_VIEWS.filter((v) => v.id !== "map" || withMap);
  const shown = views.some((v) => v.id === view) ? view : "now";
  // The view lives in the URL (?view=) so the dashboard can link straight to it.
  function setView(v: StageView) {
    setViewState(v);
    router.replace(`/feast/${slug}/stages?view=${v}`, { scroll: false });
  }
  function showOnMap(key: string) {
    setSelectedKey(key);
    setView("map");
  }

  // Floor / building filter for the "now" and schedule views (single day: no day tabs).
  const groups = (withMap ? groupByFloor(stages) : []).map((g, i) => ({
    key: g.floor != null ? `f${g.floor}` : g.stages[0]?.building ?? "other",
    label: g.floor != null ? floorName(g.floor) : g.stages[0]?.buildingName ?? "Other venues",
    dot: GROUP_DOTS[i % GROUP_DOTS.length],
    stages: g.stages,
  }));
  const visible = filter === "all" ? groups : groups.filter((g) => g.key === filter);
  const flat = (withMap ? visible.flatMap((g) => g.stages.map((s) => ({ stage: s, group: g }))) : stages.map((s) => ({ stage: s, group: null })))
    .sort((a, b) => a.stage.stageNumber - b.stage.stageNumber);

  return (
    <div className="pb-6">
      <FeastTopBar title="Competition stages" onBack={() => router.push(`/feast/${slug}`)} />

      <section className="px-1 pt-1">
        <Eyebrow>Live schedule</Eyebrow>
        <h1 className="fp-disp m-0 mt-2.5 text-[min(13vw,54px)] xl:text-[72px]">
          Competition <span className="fp-hl-text">Stages</span>
        </h1>
      </section>

      {feasts.length > 1 && (
        <div className="fp-scroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-1">
          {feastsLoading && feasts.length === 0 ? null : feasts.map((f) => (
            <Chip key={f.slug} ml on={f.slug === slug} onClick={() => router.push(`/feast/${f.slug}/stages?view=${shown}`)}>{f.name}</Chip>
          ))}
        </div>
      )}

      {loading && stages.length === 0 ? (
        <div className="flex items-center justify-center pt-24" role="status" aria-label="Loading stages"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>
      ) : stages.length === 0 ? (
        <div className="mt-6 rounded-[20px] px-4 py-16 text-center" style={{ border: `1.5px dashed ${theme.line2}` }}>
          <p className="m-0 text-[15px] font-extrabold" style={{ color: theme.text }}>Stage schedule hasn&rsquo;t been published yet.</p>
          <p className="m-0 mt-1.5 text-[13px] font-semibold" style={{ color: theme.sub }}>Check back closer to the event.</p>
        </div>
      ) : (
        <>
          <OverallProgress completed={completedCount} total={totalCount} pct={overallPct} />

          <div role="tablist" aria-label="Stage views" className="mt-5 grid gap-1 rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))`, background: theme.surface, border: `1px solid ${theme.line}` }}>
            {views.map(({ id, tab: label, icon: Icon }) => {
              const on = id === shown;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setView(id)}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-extrabold transition-colors"
                  style={on ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg, #fff)" } : { color: theme.sub }}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          {shown !== "map" && groups.length > 1 && (
            <div className="mt-3.5 flex flex-wrap gap-2 px-0.5">
              <Chip on={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
              {groups.map((g) => <Chip key={g.key} dot={g.dot} on={filter === g.key} onClick={() => setFilter(g.key)}>{g.label}</Chip>)}
            </div>
          )}

          {shown === "now" && (
            <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
              {flat.map(({ stage, group }, i) => (
                <NowCard key={stage.key} stage={stage} where={group?.label ?? null} accent={group?.dot ?? "var(--fp-primary)"} delay={Math.min(i, 8) * 0.04} onShowOnMap={withMap && stage.building != null ? () => showOnMap(stage.key) : undefined} />
              ))}
            </div>
          )}

          {shown === "map" && withMap && (
            <div className="mt-4 rounded-3xl p-3 sm:p-5" style={{ background: theme.surface, border: `1px solid ${theme.line}` }}>
              <VenueExplorer plan={plan!} stages={stages} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
          )}

          {shown === "schedule" && (
            <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
              {flat.map(({ stage, group }) => <ScheduleCard key={stage.key} stage={stage} where={group?.label ?? null} accent={group?.dot ?? "var(--fp-primary)"} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
