"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/competition-categories";
import { fetchAll } from "@/lib/fetch-all";
import { venueFor } from "@/lib/venue-config";
import { MAIN, buildingName, stagePlacement, stageRoomText, type VenuePlan } from "@/lib/venue-plan";

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
  /** "main" or an annex id (e.g. "hall"); null = not on the venue plan. */
  building: string | null;
  /** Annex name (e.g. "Parish Hall"); null for the main building. */
  buildingName: string | null;
  /** Floor of the main building (0 = ground); null for annexes and unplaced stages. */
  floor: number | null;
  /** Where along its building (0 = left end, 100 = right end), from the venue plan. */
  mapPosition: number | null;
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

/** Where a stage sits on the venue map: main-building floor, or another building on the campus. */
export interface StagePlace {
  /** "main" or an annex id (e.g. "hall"); null = not on the venue plan. */
  building: string | null;
  /** Annex name (e.g. "Parish Hall"); null for the main building. */
  buildingName: string | null;
  floor: number | null;
  mapPosition: number | null;
}

export function placeOf(plan: VenuePlan | null, stage: number): StagePlace {
  const p = stagePlacement(plan, stage);
  if (!plan || !p) return { building: null, buildingName: null, floor: null, mapPosition: null };
  const annex = p.building !== MAIN;
  return { building: p.building, buildingName: annex ? buildingName(plan, p.building) : null, floor: annex ? null : p.floor, mapPosition: p.position };
}

function deriveStage(key: string, number: number, title: string, venue: string | null, place: StagePlace, items: StageCompetition[]): CompetitionStage {
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
    ...place,
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
  // Same object per slug (module-level JSON), so it's a stable dependency.
  const plan = venueFor(slug);

  const load = useCallback(async (silent: boolean) => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      // The fest's own staged items, then other fests' items on a stage with
      // the same number (e.g. Hrudaya Lilli's Speech on the arts fest's
      // Stage 3), which join that stage's schedule. Both are paged: PostgREST
      // silently cuts a response at 1000 rows. The category slug is embedded
      // rather than read separately on every tick.
      const cols = "id, stage_id, scheduled_time, comp_status, progress_pct, display_order, feast:feasts!inner(slug, name), stage:stages!inner(id, number, title, venue), competition:competitions(name, gender, competition_category:competition_categories(slug))";
      const ownRes = await fetchAll((from, to) =>
        supabase.from("feast_competitions").select(cols).eq("feast.slug", slug).not("stage_id", "is", null).order("display_order").order("id").range(from, to));
      if (ownRes.error) { console.error("[useCompetitionStages]", ownRes.error); setLoading(false); return; }

      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
      const stageKey = (s: { number: number; title: string }) => `${s.number}|${s.title.trim().toLowerCase()}`;
      const own = ownRes.data;
      const ownStageIds = new Map<string, string>();
      for (const fc of own) { const st = one(fc.stage); if (st) ownStageIds.set(stageKey(st), st.id); }
      const numbers = [...new Set(own.map((fc) => one(fc.stage)?.number).filter((n): n is number => n != null))];
      const guestRes = numbers.length
        ? await fetchAll((from, to) =>
            supabase.from("feast_competitions").select(cols).neq("feast.slug", slug).in("stage.number", numbers).not("stage_id", "is", null).order("display_order").order("id").range(from, to))
        : { data: [] as typeof own, error: null };
      if (guestRes.error) console.error("[useCompetitionStages] guests", guestRes.error);
      const guests = guestRes.data.filter((fc) => { const st = one(fc.stage); return st && ownStageIds.has(stageKey(st)); });

      const groups = new Map<string, { number: number; title: string; venue: string | null; place: StagePlace; items: StageCompetition[] }>();
      for (const fc of [...own, ...guests]) {
        const guestFeast = one(fc.feast)?.slug !== slug ? one(fc.feast)?.name ?? null : null;
        const rawStage = one(fc.stage);
        // A guest item files under the host fest's stage of the same number and title.
        const stage = rawStage && guestFeast ? { ...rawStage, id: ownStageIds.get(stageKey(rawStage))! } : rawStage;
        if (!stage) continue;
        const comp = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
        const cat = Array.isArray(comp?.competition_category) ? comp?.competition_category[0] : comp?.competition_category;
        const categorySlug = cat?.slug ?? null;
        // A guest fest's item is named with its fest, e.g. "ഹൃദയ ലില്ലി പ്രസംഗം".
        const compName = guestFeast ? `${guestFeast} ${comp?.name ?? ""}`.trim() : comp?.name ?? "Competition";
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
        if (!groups.has(stage.id)) {
          // Building, floor, position and rooms come from the venue plan (src/config/venue.json).
          groups.set(stage.id, { number: stage.number, title: stage.title, venue: stage.venue ?? stageRoomText(plan, stage.number), place: placeOf(plan, stage.number), items: [] });
        }
        groups.get(stage.id)!.items.push(item);
      }

      const built = [...groups.entries()]
        .map(([key, g]) => deriveStage(key, g.number, g.title, g.venue, g.place, g.items))
        .sort((a, b) => a.stageNumber - b.stageNumber);

      setStages(built);
    } finally {
      setLoading(false);
    }
  }, [slug, plan]);

  useEffect(() => {
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

  return { stages, plan, loading, totalCount, completedCount, overallPct, runningItems, upNext };
}
