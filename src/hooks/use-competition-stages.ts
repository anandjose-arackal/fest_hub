"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/competition-categories";

export type RunState = "upcoming" | "running" | "completed";

export interface StageCompetition {
  id: string;
  label: string;
  compName: string;
  gender: string | null;
  categorySlug: string | null;
  categoryColor: string;
  status: RunState;
  scheduledTime: string | null;
  order: number;
  itemProgressPct: number | null;
}

export interface CompetitionStage {
  key: string;
  stageNumber: number;
  title: string;
  venue: string | null;
  scheduledTime: string | null;
  competitions: StageCompetition[];
  completedCount: number;
  totalCount: number;
  progressPct: number;
  status: RunState;
  hasPartialProgress: boolean;
  runningCompetition: StageCompetition | null;
  nextCompetition: StageCompetition | null;
}

export interface RunningItem {
  stage: CompetitionStage;
  competition: StageCompetition;
}

// Polling, not Supabase Realtime — matches the project's existing
// fetch-in-useEffect convention rather than introducing realtime for one
// screen.
const POLL_MS = 5 * 60 * 1000;

function mapRunState(s: string | null | undefined): RunState {
  if (s === "progressing") return "running";
  if (s === "completed" || s === "published") return "completed";
  return "upcoming";
}

function genderWord(g: string | null): string {
  if (g === "boy") return "Boys";
  if (g === "girl") return "Girls";
  return "";
}

function buildLabel(compName: string, gender: string | null, categorySlug: string | null): string {
  const cat = categorySlug ? CATEGORY_LABELS[categorySlug] ?? categorySlug : "";
  const gWord = genderWord(gender);
  if (cat && gWord) return `${cat} ${gWord} ${compName}`;
  if (cat) return `${cat} ${compName}`;
  return compName;
}

function deriveStage(key: string, number: number, title: string, venue: string | null, items: StageCompetition[]): CompetitionStage {
  for (const item of items) item.label = buildLabel(item.compName, item.gender, item.categorySlug);
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const completedCount = sorted.filter((c) => c.status === "completed").length;
  const totalCount = sorted.length;
  const runningCompetition = sorted.find((c) => c.status === "running") ?? null;
  const nextCompetition = sorted.find((c) => c.status === "upcoming") ?? null;

  // A stage is only "running" while one of its competitions actually is —
  // a low-registration competition can jump straight upcoming→completed
  // without passing through running, so hasPartialProgress below softens
  // that case to "In Progress" instead of a flatly wrong "Upcoming".
  const status: RunState = completedCount === totalCount && totalCount > 0 ? "completed" : runningCompetition ? "running" : "upcoming";
  const hasPartialProgress = status === "upcoming" && completedCount > 0;
  const scheduledTime = sorted.find((c) => c.scheduledTime)?.scheduledTime ?? null;

  return {
    key,
    stageNumber: number,
    title,
    venue,
    scheduledTime,
    competitions: sorted,
    completedCount,
    totalCount,
    progressPct: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    status,
    hasPartialProgress,
    runningCompetition,
    nextCompetition,
  };
}

export interface UseCompetitionStagesOptions {
  alwaysPoll?: boolean;
  intervalMs?: number;
}

export function useCompetitionStages(slug: string, options?: UseCompetitionStagesOptions) {
  const alwaysPoll = options?.alwaysPoll ?? false;
  const pollIntervalMs = options?.intervalMs ?? POLL_MS;
  const [stages, setStages] = useState<CompetitionStage[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const feastIdRef = useRef<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      let feastId = feastIdRef.current;
      if (!feastId) {
        const { data: feastRow } = await supabase.from("feasts").select("id").eq("slug", slug).maybeSingle();
        if (!feastRow) { setStages([]); setLoading(false); return; }
        feastId = feastRow.id;
        feastIdRef.current = feastId;
      }

      const [{ data: fcs, error: fcErr }, { data: catRows }] = await Promise.all([
        supabase
          .from("feast_competitions")
          .select("id, stage_id, scheduled_time, comp_status, progress_pct, display_order, stage:stages(id, number, title, venue), competition:competitions(name, gender, competition_category_id)")
          .eq("feast_id", feastId)
          .not("stage_id", "is", null)
          .order("display_order"),
        supabase.from("competition_categories").select("id, slug"),
      ]);
      if (fcErr) { console.error("[useCompetitionStages]", fcErr.message); setLoading(false); return; }

      const catSlugMap: Record<string, string> = {};
      for (const c of catRows ?? []) catSlugMap[c.id] = c.slug;

      const groups = new Map<string, { number: number; title: string; venue: string | null; items: StageCompetition[] }>();
      for (const fc of fcs ?? []) {
        const stage = Array.isArray(fc.stage) ? fc.stage[0] : fc.stage;
        if (!stage) continue;
        const comp = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
        const categorySlug = comp?.competition_category_id ? catSlugMap[comp.competition_category_id] ?? null : null;
        const compName = comp?.name ?? "Competition";
        const item: StageCompetition = {
          id: fc.id,
          label: compName,
          compName,
          gender: comp?.gender ?? null,
          categorySlug,
          categoryColor: categorySlug ? CATEGORY_COLORS[categorySlug] ?? "#A78BFA" : "#A78BFA",
          status: mapRunState(fc.comp_status),
          scheduledTime: fc.scheduled_time,
          order: fc.display_order ?? 0,
          itemProgressPct: fc.progress_pct,
        };
        if (!groups.has(stage.id)) groups.set(stage.id, { number: stage.number, title: stage.title, venue: stage.venue, items: [] });
        groups.get(stage.id)!.items.push(item);
      }

      const built = [...groups.entries()]
        .map(([key, g]) => deriveStage(key, g.number, g.title, g.venue, g.items))
        .sort((a, b) => a.stageNumber - b.stageNumber);

      setStages(built);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    feastIdRef.current = null;
    load(false);
    const interval = setInterval(() => {
      if (alwaysPoll || (document.visibilityState === "visible" && document.hasFocus())) load(true);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [load, alwaysPoll, pollIntervalMs]);

  const totalCount = stages.reduce((sum, s) => sum + s.totalCount, 0);
  const completedCount = stages.reduce((sum, s) => sum + s.completedCount, 0);
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const runningItems: RunningItem[] = [];
  for (const stage of stages) if (stage.runningCompetition) runningItems.push({ stage, competition: stage.runningCompetition });

  let upNext: RunningItem | null = null;
  if (runningItems.length === 0) {
    for (const stage of stages) {
      if (stage.status !== "completed" && stage.nextCompetition) {
        upNext = { stage, competition: stage.nextCompetition };
        break;
      }
    }
  }

  return { stages, loading, totalCount, completedCount, overallPct, runningItems, upNext };
}
