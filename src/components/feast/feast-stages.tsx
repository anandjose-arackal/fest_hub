"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, Clock, CheckCircle2, Circle } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useCompetitionStages, type CompetitionStage, type StageCompetition, type RunState, type RunningItem } from "@/hooks/use-competition-stages";
import { FeastTabs, FeastTopBar, SectionTitle, StatusPill, theme } from "./feast-shared";

const anek: React.CSSProperties = { fontFamily: "var(--font-anek), sans-serif", fontWeight: 600 };
const anekBold: React.CSSProperties = { fontFamily: "var(--font-anek), sans-serif", fontWeight: 700 };

const RUN_STATE_STYLE: Record<RunState, { label: string; bg: string; color: string }> = {
  upcoming: { label: "Upcoming", bg: "rgba(156,163,175,0.18)", color: "#6B7280" },
  running: { label: "Live", bg: "rgba(251,146,60,0.18)", color: "#D97706" },
  completed: { label: "Completed", bg: "rgba(34,197,94,0.18)", color: "#16A34A" },
};

function ProgressBar({ pct, state }: { pct: number; state: RunState }) {
  const fill = state === "completed" ? "#16A34A" : state === "running" ? "linear-gradient(90deg,#F59E0B,#FBBF24)" : "rgba(var(--fp-primary-rgb),0.25)";
  return <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(var(--fp-primary-rgb),0.1)" }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: fill }} /></div>;
}

function ItemStatusIcon({ status, color }: { status: RunState; color: string }) {
  if (status === "completed") return <CheckCircle2 className="h-[17px] w-[17px]" style={{ color: "#16A34A" }} />;
  if (status === "running") return (
    <span className="relative flex h-[11px] w-[11px] shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#D97706" }} />
      <span className="relative inline-flex h-[11px] w-[11px] rounded-full" style={{ background: "#D97706" }} />
    </span>
  );
  return <Circle className="h-4 w-4" style={{ color }} />;
}

function StageBadge({ number, status }: { number: number; status: RunState }) {
  const bg = status === "completed" ? "linear-gradient(135deg,#16A34A,#22C55E)" : status === "running" ? "linear-gradient(135deg,#F59E0B,#FBBF24)" : "linear-gradient(135deg,rgba(var(--fp-primary-rgb),0.55),rgba(var(--fp-primary-rgb),0.4))";
  const glow = status === "completed" ? "rgba(22,163,74,0.4)" : status === "running" ? "rgba(245,158,11,0.5)" : "rgba(var(--fp-primary-rgb),0.35)";
  return (
    <div className="relative shrink-0">
      {status === "running" && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: "#F59E0B", opacity: 0.35 }} />}
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full" style={{ background: bg, boxShadow: `0 6px 16px ${glow}` }}>
        {status === "completed" ? <CheckCircle2 className="h-[22px] w-[22px] text-white" /> : <span className="text-[19px] font-black text-white">{number}</span>}
      </div>
    </div>
  );
}

function RunningCard({ item }: { item: RunningItem }) {
  const { stage, competition } = item;
  return (
    <div className="mb-2.5 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(251,191,36,0.08))", border: "1.5px solid rgba(245,158,11,0.4)" }}>
      <div className="mb-3 flex items-center gap-3">
        <StageBadge number={stage.stageNumber} status="running" />
        <div className="min-w-0 flex-1">
          <StatusPill label="LIVE NOW" color="#D97706" />
          <p className="mt-1 truncate text-[19px] leading-tight" style={{ color: "#92400E", ...anekBold }}>Stage {stage.stageNumber} · {stage.title}</p>
        </div>
      </div>
      <p className="mb-1 text-2xl leading-tight" style={{ color: theme.text, ...anekBold }}>{competition.label}</p>
      <p className="mb-3 text-xs" style={{ color: theme.sub, ...anek }}>Stage: {stage.completedCount} of {stage.totalCount} competitions completed</p>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide" style={{ color: theme.faint, ...anekBold }}>Participants Completed</span>
        <span className="text-[12.5px]" style={{ color: "#D97706", ...anekBold }}>{competition.itemProgressPct != null ? `${competition.itemProgressPct}%` : "—"}</span>
      </div>
      <ProgressBar pct={competition.itemProgressPct ?? 0} state="running" />
    </div>
  );
}

function LiveNowPanel({ runningItems, upNext, allDone }: { runningItems: RunningItem[]; upNext: RunningItem | null; allDone: boolean }) {
  if (runningItems.length > 0) return <div className="mb-5">{runningItems.map((item) => <RunningCard key={item.competition.id} item={item} />)}</div>;
  if (allDone) return <div className="mb-5 rounded-2xl p-5 text-center" style={{ background: "rgba(34,197,94,0.1)", border: "1.5px solid rgba(34,197,94,0.35)" }}><p className="text-[17px]" style={{ color: "#16A34A", ...anekBold }}>🎉 All competitions completed!</p></div>;
  return (
    <div className="mb-5 rounded-2xl p-4" style={{ background: "rgba(var(--fp-primary-rgb),0.06)", border: `1px solid ${theme.hairline}` }}>
      <p className="mb-1 text-sm" style={{ color: theme.sub, ...anek }}>No competition is currently running.</p>
      {upNext && (
        <>
          <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider" style={{ color: theme.faint, ...anekBold }}>Up Next</p>
          <p className="text-[16px]" style={{ color: theme.text, ...anekBold }}>Stage {upNext.stage.stageNumber} · {upNext.stage.title} — {upNext.competition.label}</p>
        </>
      )}
    </div>
  );
}

function OverallProgress({ completed, total, pct }: { completed: number; total: number; pct: number }) {
  if (total === 0) return null;
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: theme.faint, ...anekBold }}>Overall Progress</span>
        <span className="text-[12.5px]" style={{ color: theme.sub, ...anek }}>{completed} / {total} completed · {pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(var(--fp-primary-rgb),0.1)" }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--fp-primary),var(--fp-primary-light))" }} /></div>
    </div>
  );
}

function CompetitionRow({ comp, last }: { comp: StageCompetition; last: boolean }) {
  const style = RUN_STATE_STYLE[comp.status];
  const showAttendance = comp.status === "running" && comp.itemProgressPct != null;
  return (
    <div className="py-2.5" style={{ borderBottom: last ? "none" : "1px solid rgba(var(--fp-primary-rgb),0.06)" }}>
      <div className="flex items-center gap-2.5">
        <ItemStatusIcon status={comp.status} color={comp.categoryColor} />
        <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: theme.text, ...anek }}>{comp.label}</span>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: style.bg, color: style.color, ...anekBold }}>{comp.status === "running" ? "NOW RUNNING" : style.label.toUpperCase()}</span>
      </div>
      {showAttendance && (
        <div className="mt-1.5 flex items-center gap-2 pl-[26px]">
          <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(217,119,6,0.15)" }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${comp.itemProgressPct}%`, background: "#F59E0B" }} /></div>
          <span className="shrink-0 text-[10.5px]" style={{ color: "#D97706", ...anekBold }}>{comp.itemProgressPct}% attended</span>
        </div>
      )}
    </div>
  );
}

function StageCard({ stage, expanded, onToggle }: { stage: CompetitionStage; expanded: boolean; onToggle: () => void }) {
  const style = RUN_STATE_STYLE[stage.status];
  const pillLabel = stage.hasPartialProgress ? "In Progress" : style.label;
  const accent = stage.status === "completed" ? "#16A34A" : stage.status === "running" ? "#D97706" : "var(--fp-faint)";
  return (
    <div className="relative mb-3 overflow-hidden rounded-[18px]" style={{ background: stage.status === "running" ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.52)", border: stage.status === "running" ? "1.5px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.7)" }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <button onClick={onToggle} className="w-full pb-3.5 pl-4 pr-3.5 pt-3.5 text-left">
        <div className="mb-2.5 flex items-center gap-3">
          <StageBadge number={stage.stageNumber} status={stage.status} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: theme.faint, ...anekBold }}>Stage {stage.stageNumber}</p>
            <p className="truncate text-xl leading-tight" style={{ color: theme.text, ...anekBold }}>{stage.title}</p>
          </div>
          <div className="mt-0.5 flex shrink-0 items-center gap-2 self-start">
            <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: style.bg, color: style.color, ...anekBold }}>{pillLabel}</span>
            <ChevronDown className="h-4 w-4 transition-transform" style={{ color: theme.faint, transform: expanded ? "rotate(180deg)" : undefined }} />
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className="text-[13px]" style={{ color: theme.sub, ...anek }}>{stage.completedCount} / {stage.totalCount} completed</span>
          {stage.scheduledTime && <span className="inline-flex items-center gap-1 text-[13px]" style={{ color: theme.sub, ...anek }}><Clock className="h-3 w-3" style={{ color: theme.faint }} />Scheduled {stage.scheduledTime}</span>}
        </div>
        <ProgressBar pct={stage.progressPct} state={stage.status} />
        {stage.runningCompetition && (
          <div className="mt-2 flex items-center gap-1.5">
            <ItemStatusIcon status="running" color={accent} />
            <span className="text-sm" style={{ color: "#92400E", ...anekBold }}>{stage.runningCompetition.label} — Now Running</span>
          </div>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-0.5" style={{ borderTop: "1px solid rgba(var(--fp-primary-rgb),0.06)" }}>
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
    <div>
      <FeastTopBar title="Competition Stages" onBack={() => router.push(`/feast/${slug}`)} />
      <p className="-mt-2 mb-4 text-[12.5px]" style={{ color: theme.faint }}>Live competition schedule &amp; progress</p>

      <FeastTabs feasts={feasts} active={slug} onPick={(s) => router.push(`/feast/${s}/stages`)} loading={feastsLoading} />

      {loading && stages.length === 0 ? (
        <div className="flex items-center justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>
      ) : stages.length === 0 ? (
        <div className="rounded-2xl px-4 py-16 text-center" style={{ background: "rgba(var(--fp-primary-rgb),0.05)", border: `1px dashed ${theme.hairline}` }}>
          <p className="text-sm" style={{ color: theme.sub, ...anek }}>Stage schedule hasn&rsquo;t been published yet.</p>
          <p className="mt-1 text-[12.5px]" style={{ color: theme.faint }}>Check back closer to the event.</p>
        </div>
      ) : (
        <>
          <LiveNowPanel runningItems={runningItems} upNext={upNext} allDone={allDone} />
          <OverallProgress completed={completedCount} total={totalCount} pct={overallPct} />
          <SectionTitle right={<span className="text-xs" style={{ color: theme.faint }}>{stages.length} stages</span>}>All Stages</SectionTitle>
          <div>{stages.map((stage) => <StageCard key={stage.key} stage={stage} expanded={expanded.has(stage.key)} onToggle={() => toggle(stage.key)} />)}</div>
        </>
      )}
    </div>
  );
}
