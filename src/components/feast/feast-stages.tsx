"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, Clock, CheckCircle2, PartyPopper } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useCompetitionStages, type CompetitionStage, type StageCompetition, type RunState, type RunningItem } from "@/hooks/use-competition-stages";
import { FeastTopBar, mix, theme } from "./feast-shared";
import { Chip, Eyebrow } from "./feast-ui";

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

function RunningCard({ item }: { item: RunningItem }) {
  const { stage, competition } = item;
  return (
    <section
      className="relative overflow-hidden rounded-3xl p-4"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${AMBER} 18%, var(--fp-surface-2)), color-mix(in srgb, #FBBF24 8%, var(--fp-surface-2)))`,
        border: `1.5px solid ${mix(AMBER, 45)}`,
        boxShadow: "0 14px 30px rgba(245,158,11,.18)",
      }}
    >
      <div className="flex items-center gap-3">
        <StageBadge number={stage.stageNumber} status="running" size={52} />
        <span className="min-w-0 flex-1">
          <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-extrabold text-white" style={{ background: AMBER }}>Live now</span>
          <span className="fp-ml mt-1.5 block truncate text-[18px] font-extrabold" style={{ color: "var(--fp-warn)" }}>Stage {stage.stageNumber} · {stage.title}</span>
        </span>
      </div>
      <p className="fp-ml m-0 mt-3 text-[26px] font-extrabold leading-[1.2]" style={{ color: theme.text }}>{competition.label}</p>
      <p className="m-0 mb-3 mt-1 text-[12.5px] font-semibold" style={{ color: theme.sub }}>Stage: {stage.completedCount} of {stage.totalCount} competitions completed</p>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="fp-cap text-[10px]" style={{ color: theme.sub }}>Participants completed</span>
        <span className="fp-num text-[16px]" style={{ color: "var(--fp-warn)" }}>{competition.itemProgressPct != null ? `${competition.itemProgressPct}%` : "—"}</span>
      </div>
      <Bar pct={competition.itemProgressPct ?? 0} fill={`linear-gradient(90deg, ${AMBER}, #FBBF24)`} height={8} track={mix(AMBER, 18)} />
    </section>
  );
}

function LiveNowPanel({ runningItems, upNext, allDone }: { runningItems: RunningItem[]; upNext: RunningItem | null; allDone: boolean }) {
  if (runningItems.length > 0) return <div className="mt-[18px] flex flex-col gap-2.5 xl:grid xl:grid-cols-2">{runningItems.map((item) => <RunningCard key={item.competition.id} item={item} />)}</div>;
  if (allDone) {
    return (
      <div className="mt-[18px] flex items-center justify-center gap-2.5 rounded-3xl p-5" style={{ background: "var(--fp-ok-bg)", border: `1.5px solid ${mix("var(--fp-ok)", 35)}` }}>
        <PartyPopper className="h-5 w-5" style={{ color: "var(--fp-ok)" }} aria-hidden="true" />
        <p className="m-0 text-[17px] font-extrabold" style={{ color: "var(--fp-ok)" }}>All competitions completed!</p>
      </div>
    );
  }
  return (
    <div className="mt-[18px] rounded-3xl p-4" style={{ background: theme.surface, border: `1px solid ${theme.line}` }}>
      <p className="m-0 text-[14px] font-semibold" style={{ color: theme.sub }}>No competition is running right now.</p>
      {upNext && (
        <>
          <p className="fp-cap m-0 mt-3 text-[10px]" style={{ color: theme.goldInk }}>Up next</p>
          <p className="fp-ml m-0 mt-1 text-[16px] font-extrabold" style={{ color: theme.text }}>Stage {upNext.stage.stageNumber} · {upNext.stage.title} — {upNext.competition.label}</p>
        </>
      )}
    </div>
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

function CompetitionRow({ comp, last }: { comp: StageCompetition; last: boolean }) {
  const style = RUN_STATE_STYLE[comp.status];
  const showAttendance = comp.status === "running" && comp.itemProgressPct != null;
  return (
    <div className="py-2.5" style={{ borderBottom: last ? "none" : `1px solid ${theme.line}` }}>
      <div className="flex items-center gap-2.5">
        <ItemStatusIcon status={comp.status} color={comp.categoryColor} />
        <span className="fp-ml min-w-0 flex-1 text-[14.5px] font-bold" style={{ color: theme.text }}>{comp.label}</span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-extrabold" style={{ background: style.bg, color: style.color }}>{comp.status === "running" ? "Now running" : style.label}</span>
      </div>
      {showAttendance && (
        <div className="ml-7 mt-2 flex items-center gap-2">
          <div className="flex-1"><Bar pct={comp.itemProgressPct ?? 0} fill={AMBER} height={4} track={mix(AMBER, 18)} /></div>
          <span className="shrink-0 text-[11px] font-extrabold" style={{ color: "var(--fp-warn)" }}>{comp.itemProgressPct}% attended</span>
        </div>
      )}
    </div>
  );
}

function StageCard({ stage, expanded, onToggle, delay }: { stage: CompetitionStage; expanded: boolean; onToggle: () => void; delay: number }) {
  const style = RUN_STATE_STYLE[stage.status];
  const pillLabel = stage.hasPartialProgress ? "In progress" : style.label;
  const running = stage.status === "running";
  const panelId = `stage-${stage.key}`;
  return (
    <div
      className="fp-fade-up relative h-fit overflow-hidden rounded-[20px]"
      style={{
        animationDelay: `${delay}s`,
        background: running ? `color-mix(in srgb, ${AMBER} 7%, var(--fp-surface-2))` : theme.surface2,
        border: running ? `1.5px solid ${mix(AMBER, 40)}` : `1px solid ${theme.line}`,
        boxShadow: running ? "0 10px 24px rgba(245,158,11,.14)" : undefined,
      }}
    >
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} className="block w-full py-3.5 pl-4 pr-3.5 text-left" style={{ color: theme.text }}>
        <span className="flex items-center gap-3">
          <StageBadge number={stage.stageNumber} status={stage.status} />
          <span className="min-w-0 flex-1">
            <span className="fp-cap block text-[10px]" style={{ color: theme.faint }}>Stage {stage.stageNumber}</span>
            <span className="fp-ml mt-0.5 block truncate text-[19px] font-extrabold leading-[1.2]">{stage.title}</span>
          </span>
          <span className="inline-flex h-6 items-center self-start whitespace-nowrap rounded-full px-2.5 text-[11px] font-extrabold" style={{ background: style.bg, color: style.color }}>{pillLabel}</span>
          <ChevronDown className="h-[18px] w-[18px] shrink-0 self-start transition-transform duration-300" style={{ color: theme.faint, transform: expanded ? "rotate(180deg)" : undefined }} aria-hidden="true" />
        </span>
        <span className="mb-2 mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] font-semibold" style={{ color: theme.sub }}>
          <span><span className="fp-num text-[14px]" style={{ color: theme.text }}>{stage.completedCount}</span> / {stage.totalCount} completed</span>
          {stage.scheduledTime && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" style={{ color: theme.faint }} aria-hidden="true" />Scheduled {stage.scheduledTime}</span>}
        </span>
        <Bar pct={stage.progressPct} fill={stageFill(stage.status)} />
        {stage.runningCompetition && (
          <span className="mt-2.5 flex items-center gap-2 text-[13.5px] font-extrabold" style={{ color: "var(--fp-warn)" }}>
            <span className="fp-livedot h-[9px] w-[9px]" style={{ background: AMBER }} />
            <span className="fp-ml">{stage.runningCompetition.label}</span> — now running
          </span>
        )}
      </button>
      {expanded && (
        <div id={panelId} className="px-4 pb-2.5 pt-0.5" style={{ borderTop: `1px solid ${theme.line}` }}>
          {stage.competitions.map((c, i) => <CompetitionRow key={c.id} comp={c} last={i === stage.competitions.length - 1} />)}
        </div>
      )}
    </div>
  );
}

export function FeastStages({ slug }: { slug: string }) {
  const router = useRouter();
  const { feasts, loading: feastsLoading } = useFeasts();
  const { stages, loading, totalCount, completedCount, overallPct, runningItems, upNext } = useCompetitionStages(slug);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const autoExpandedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newlyLive = stages.filter((s) => s.status === "running" && !autoExpandedRef.current.has(s.key));
    if (newlyLive.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const s of newlyLive) { next.add(s.key); autoExpandedRef.current.add(s.key); }
      return next;
    });
  }, [stages]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const allDone = stages.length > 0 && stages.every((s) => s.status === "completed");

  return (
    <div className="pb-6">
      <FeastTopBar title="Competition stages" onBack={() => router.push(`/feast/${slug}`)} />

      <section className="px-1 pt-1">
        <Eyebrow>Live schedule</Eyebrow>
        <h1 className="fp-disp m-0 mt-2.5 text-[min(13vw,54px)] xl:text-[72px]">
          Competition <span className="fp-hl-text">Stages</span>
        </h1>
        <p className="m-0 mt-2.5 text-[14px] font-semibold" style={{ color: theme.sub }}>Live competition schedule &amp; progress</p>
      </section>

      {feasts.length > 1 && (
        <div className="fp-scroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-1">
          {feastsLoading && feasts.length === 0 ? null : feasts.map((f) => (
            <Chip key={f.slug} ml on={f.slug === slug} onClick={() => router.push(`/feast/${f.slug}/stages`)}>{f.name}</Chip>
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
          <LiveNowPanel runningItems={runningItems} upNext={upNext} allDone={allDone} />
          <OverallProgress completed={completedCount} total={totalCount} pct={overallPct} />
          <div className="flex items-end justify-between px-1 pb-3 pt-[26px]">
            <h2 className="fp-disp m-0 text-[32px]">All stages</h2>
            <span className="pb-[3px] text-[12.5px] font-bold" style={{ color: theme.faint }}>{stages.length} stages</span>
          </div>
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start">
            {stages.map((stage, i) => <StageCard key={stage.key} stage={stage} expanded={expanded.has(stage.key)} onToggle={() => toggle(stage.key)} delay={Math.min(i, 8) * 0.05} />)}
          </div>
        </>
      )}
    </div>
  );
}
