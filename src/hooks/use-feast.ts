"use client";

import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Stage } from "@/types";

// Multi-org: no hardcoded per-slug visual config (the source app had a
// literature-feast-2026/arts-feast-2026 special case) — icon/tint/accent
// are derived purely from feast.type, which every org shares.
const FEAST_TYPE_CONFIG: Record<string, { icon: string; tint: [string, string]; accent: string }> = {
  literature: { icon: "PenTool", tint: ["#6B46FF", "#A855F7"], accent: "#A855F7" },
  arts: { icon: "Palette", tint: ["#A855F7", "#EC4899"], accent: "#EC4899" },
  sports: { icon: "Zap", tint: ["#16A34A", "#22D3EE"], accent: "#22D3EE" },
  general: { icon: "Sparkles", tint: ["#F59E0B", "#EC4899"], accent: "#F59E0B" },
};

function feastVisual(type: string) {
  return FEAST_TYPE_CONFIG[type] ?? FEAST_TYPE_CONFIG.general;
}

const COMP_ICON_MAP: Record<string, string> = {
  writing: "PenTool", speech: "Mic", quiz: "Sparkles",
  art: "Image", music: "Mic", dance: "Sparkles", drama: "Film",
};

function compIcon(category: string | null): string {
  return COMP_ICON_MAP[category ?? ""] ?? "⭐";
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (e && e.getTime() !== s.getTime()) {
    return `${s.toLocaleDateString("en-US", opts)}–${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
}

function daysLeft(end: string | null): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function statusLabel(status: string): string {
  switch (status) {
    case "registration_open": return "Registration Open";
    case "ongoing": return "Ongoing";
    case "completed": return "Completed";
    default: return "Upcoming";
  }
}

export interface FeastCompetitionUI {
  id: string;
  name: string;
  cat: "Individual" | "Team";
  time: string;
  venue: string;
  filled: number;
  cap: number;
  icon: string;
  gender: string | null;
  competitionCategorySlug: string | null;
  stage: Stage | null;
  scheduledTime: string | null;
  compStatus: "upcoming" | "progressing" | "completed" | "published";
  progressPct: number | null;
  info: string | null;
  maxPerShakha: number;
  maxTeamSize?: number;
}

export interface FeastUI {
  id: string;
  slug: string;
  name: string;
  year: string;
  icon: string;
  tint: [string, string];
  accent: string;
  status: string;
  date: string;
  venue: string;
  blurb: string;
  registrations: number;
  eventCount?: number;
  daysLeft: number;
  competitions: FeastCompetitionUI[];
  registrationEditDeadline: string | null;
}

export interface ShakhaOption {
  id: string;
  name: string;
  color: string;
}

// ── useFeasts ────────────────────────────────────────────────────────────
export interface UseFeastsOptions {
  pollIntervalMs?: number;
}

export function useFeasts(options?: UseFeastsOptions) {
  const pollIntervalMs = options?.pollIntervalMs ?? null;
  const [feasts, setFeasts] = useState<FeastUI[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("feasts")
        .select("*")
        .neq("status", "draft")
        .order("start_date");

      if (error) console.error("[useFeasts]", error.message);
      if (cancelled || !data?.length) { setLoading(false); return; }

      const feastIds = data.map((r) => r.id);
      const { data: countRows, error: countErr } = await supabase.rpc("get_feast_counts", { p_feast_ids: feastIds });
      if (countErr) console.error("[useFeasts] counts", countErr.message);

      const eventCountMap: Record<string, number> = {};
      const regCountMap: Record<string, number> = {};
      for (const r of countRows ?? []) {
        eventCountMap[r.feast_id as string] = Number(r.event_count) || 0;
        regCountMap[r.feast_id as string] = Number(r.registration_count) || 0;
      }
      const feastsWithComps = new Set(Object.keys(eventCountMap));

      const mapped: FeastUI[] = data
        .filter((row) => feastsWithComps.has(row.id))
        .map((row) => {
          const cfg = feastVisual(row.type);
          return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            year: row.year,
            icon: cfg.icon,
            tint: cfg.tint,
            accent: cfg.accent,
            status: statusLabel(row.status),
            date: formatDateRange(row.start_date, row.end_date),
            venue: row.venue ?? "",
            blurb: row.description ?? "",
            registrations: regCountMap[row.id] ?? 0,
            eventCount: eventCountMap[row.id] ?? 0,
            daysLeft: daysLeft(row.end_date),
            competitions: [],
            registrationEditDeadline: row.registration_edit_deadline,
          };
        });

      if (!cancelled) setFeasts(mapped);
      setLoading(false);
    };

    load().catch(() => setLoading(false));
    const interval = pollIntervalMs
      ? setInterval(() => { load().catch((e) => console.error("[useFeasts] poll", e)); }, pollIntervalMs)
      : null;

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [pollIntervalMs]);

  return { feasts, loading };
}

// ── useFeast (single feast + competitions) ───────────────────────────────
export function useFeast(slug: string) {
  const [feast, setFeast] = useState<FeastUI | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const { data: feastRow, error: feastErr } = await supabase
        .from("feasts").select("*").eq("slug", slug).maybeSingle();
      if (feastErr) console.error("[useFeast]", feastErr.message);
      if (cancelled || !feastRow) { setLoading(false); return; }

      const [{ data: fcs }, { count: regsCount }, { data: catRows }, { data: stageRows }] = await Promise.all([
        supabase
          .from("feast_competitions")
          .select(
            "id, time_slot, venue, max_slots, stage_id, scheduled_time, comp_status, progress_pct, info, competition:competitions(name, type, category, gender, competition_category_id, icon, max_per_shakha, max_team_size)"
          )
          .eq("feast_id", feastRow.id)
          .order("display_order"),
        supabase.from("participants").select("id", { count: "exact", head: true }).eq("feast_id", feastRow.id),
        supabase.from("competition_categories").select("id, slug"),
        supabase.from("stages").select("*").eq("feast_id", feastRow.id),
      ]);

      const catSlugMap: Record<string, string> = {};
      for (const cat of catRows ?? []) catSlugMap[cat.id] = cat.slug;
      const stageMap: Record<string, Stage> = {};
      for (const s of stageRows ?? []) stageMap[s.id] = s as Stage;

      let filledMap: Record<string, number> = {};
      if (fcs?.length) {
        const { data: regRows } = await supabase
          .from("participant_registrations")
          .select("feast_competition_id")
          .in("feast_competition_id", fcs.map((f) => f.id));
        if (regRows) {
          for (const r of regRows) filledMap[r.feast_competition_id] = (filledMap[r.feast_competition_id] ?? 0) + 1;
        }
      }

      const cfg = feastVisual(feastRow.type);
      const comps: FeastCompetitionUI[] = (fcs ?? []).map((fc) => {
        const c = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
        return {
          id: fc.id,
          name: c?.name ?? "Competition",
          cat: c?.type === "group" ? "Team" : "Individual",
          time: fc.time_slot ?? "",
          venue: fc.venue ?? "",
          filled: filledMap[fc.id] ?? 0,
          cap: fc.max_slots ?? 0,
          icon: c?.icon || compIcon(c?.category ?? null),
          gender: c?.gender ?? null,
          competitionCategorySlug: c?.competition_category_id ? (catSlugMap[c.competition_category_id] ?? null) : null,
          stage: fc.stage_id ? (stageMap[fc.stage_id] ?? null) : null,
          scheduledTime: fc.scheduled_time,
          compStatus: (fc.comp_status ?? "upcoming") as FeastCompetitionUI["compStatus"],
          progressPct: fc.progress_pct,
          info: fc.info,
          maxPerShakha: c?.max_per_shakha ?? 2,
          maxTeamSize: c?.max_team_size ?? undefined,
        };
      });

      if (!cancelled) {
        setFeast({
          id: feastRow.id,
          slug: feastRow.slug,
          name: feastRow.name,
          year: feastRow.year,
          icon: cfg.icon,
          tint: cfg.tint,
          accent: cfg.accent,
          status: statusLabel(feastRow.status),
          date: formatDateRange(feastRow.start_date, feastRow.end_date),
          venue: feastRow.venue ?? "",
          blurb: feastRow.description ?? "",
          registrations: regsCount ?? 0,
          daysLeft: daysLeft(feastRow.end_date),
          competitions: comps,
          registrationEditDeadline: feastRow.registration_edit_deadline,
        });
      }
      setLoading(false);
    })().catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, [slug]);

  return { feast, loading };
}

// ── useShakhas ───────────────────────────────────────────────────────────
export function useShakhas() {
  const [shakhas, setShakhas] = useState<ShakhaOption[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase.from("shakhas").select("*").order("name").then(({ data }) => {
      if (!cancelled && data) setShakhas(data.map((s) => ({ id: s.id, name: s.name, color: s.color })));
    });
    return () => { cancelled = true; };
  }, []);

  return { shakhas };
}

// ── useFeastId ───────────────────────────────────────────────────────────
export function useFeastId(slug: string) {
  const [feastId, setFeastId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.from("feasts").select("id").eq("slug", slug).single().then(({ data }) => {
      if (data) setFeastId(data.id);
    });
  }, [slug]);

  return feastId;
}
