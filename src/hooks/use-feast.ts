"use client";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getOrgSettings } from "@/lib/org-settings";
import { fetchCached, invalidateCached, useCachedQuery } from "@/lib/client-cache";
import type { Stage, Diocese, Meghala, Shakha, HierarchyLevel, OrgSettings } from "@/types";

// Multi-org: no hardcoded per-slug visual config (the source app had a
// literature-feast-2026/arts-feast-2026 special case) — icon/tint/accent
// are derived purely from feast.type, which every org shares. These are
// "violet" (the default theme)'s colors specifically — kept exactly as
// launched, untouched by THEMED_TINT below.
const FEAST_TYPE_CONFIG: Record<string, { icon: string; tint: [string, string]; accent: string }> = {
  literature: { icon: "PenTool", tint: ["#6B46FF", "#A855F7"], accent: "#A855F7" },
  arts: { icon: "Palette", tint: ["#A855F7", "#EC4899"], accent: "#EC4899" },
  sports: { icon: "Zap", tint: ["#16A34A", "#22D3EE"], accent: "#22D3EE" },
  general: { icon: "Sparkles", tint: ["#F59E0B", "#EC4899"], accent: "#F59E0B" },
};

// literature/arts recolor per org_settings.theme so the "Active Fests"
// banners actually track the org's selected Fest Portal theme instead of
// always showing violet's purple/pink — sports/general keep their fixed,
// type-identity colors (green/cyan, amber/pink) regardless of theme, same
// as before. Plain hex, not CSS var references: callers all over feast-*.tsx
// append an alpha suffix directly onto these strings (e.g. `${f.accent}22`),
// which only produces valid CSS for a literal hex color. Values mirror each
// theme's own primary/primary-light/accent in globals.css. "violet" is
// deliberately absent — it falls through to FEAST_TYPE_CONFIG above,
// unchanged.
const THEMED_TINT: Record<string, { literature: [string, string]; arts: [string, string] }> = {
  amethyst: { literature: ["#605399", "#ADA1E6"], arts: ["#ADA1E6", "#D562BE"] },
  ocean: { literature: ["#172D9D", "#787CFE"], arts: ["#787CFE", "#FF6F91"] },
  sunset: { literature: ["#E8823D", "#FFC585"], arts: ["#FFC585", "#18C5C7"] },
  aurora: { literature: ["#5B6EE8", "#8DAFFC"], arts: ["#8DAFFC", "#F696D5"] },
  carnival: { literature: ["#9A6BC2", "#AF87CE"], arts: ["#AF87CE", "#EA1A7F"] },
  golden: { literature: ["#7357D8", "#A48EEE"], arts: ["#A48EEE", "#F5A524"] },
  plum: { literature: ["#593C8F", "#9A80D0"], arts: ["#9A80D0", "#3DAE82"] },
  midnight: { literature: ["#8B6FFF", "#B9A6FF"], arts: ["#B9A6FF", "#FF6FB0"] },
  emerald: { literature: ["#16D9A0", "#5EEAD4"], arts: ["#5EEAD4", "#FF7A5C"] },
  championship: { literature: ["#6B46FF", "#0EA5C4"], arts: ["#A855F7", "#EC4899"] },
  burgundy: { literature: ["#C2365A", "#F59E0B"], arts: ["#EA6B8A", "#FF8C6B"] },
};

function currentPortalTheme(): string {
  if (typeof document === "undefined") return "violet";
  return document.body.getAttribute("data-fp-theme") || "violet";
}

function feastVisual(type: string) {
  const base = FEAST_TYPE_CONFIG[type] ?? FEAST_TYPE_CONFIG.general;
  if (type !== "literature" && type !== "arts") return base;
  const override = THEMED_TINT[currentPortalTheme()]?.[type as "literature" | "arts"];
  if (!override) return base; // violet, or an unrecognized theme id
  return { ...base, tint: override, accent: override[1] };
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

// Results and Rankings only list fests that are under way or done — a fest
// still taking registrations (or a draft) has nothing to show there yet.
export function showsResults(feast: { status: string }): boolean {
  return feast.status === "Ongoing" || feast.status === "Completed";
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
  type: string;
  year: string;
  icon: string;
  tint: [string, string];
  accent: string;
  status: string;
  date: string;
  startDate: string | null;
  venue: string;
  blurb: string;
  registrations: number;
  eventCount?: number;
  daysLeft: number;
  competitions: FeastCompetitionUI[];
  registrationEditDeadline: string | null;
  registrationDeadline: string | null;
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

async function loadFeasts(): Promise<FeastUI[]> {
  const { data, error } = await supabase
    .from("feasts")
    .select("id, slug, name, type, year, status, start_date, end_date, venue, description, registration_edit_deadline, registration_deadline")
    .neq("status", "draft")
    .order("start_date");
  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const { data: countRows, error: countErr } = await supabase.rpc("get_feast_counts", { p_feast_ids: data.map((r) => r.id) });
  if (countErr) console.error("[useFeasts] counts", countErr.message);

  const eventCountMap: Record<string, number> = {};
  const regCountMap: Record<string, number> = {};
  for (const r of countRows ?? []) {
    eventCountMap[r.feast_id as string] = Number(r.event_count) || 0;
    regCountMap[r.feast_id as string] = Number(r.registration_count) || 0;
  }
  const feastsWithComps = new Set(Object.keys(eventCountMap));

  return data
    .filter((row) => feastsWithComps.has(row.id))
    .map((row) => {
      const cfg = feastVisual(row.type);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        type: row.type,
        year: row.year,
        icon: cfg.icon,
        tint: cfg.tint,
        accent: cfg.accent,
        status: statusLabel(row.status),
        date: formatDateRange(row.start_date, row.end_date),
        startDate: row.start_date,
        venue: row.venue ?? "",
        blurb: row.description ?? "",
        registrations: regCountMap[row.id] ?? 0,
        eventCount: eventCountMap[row.id] ?? 0,
        daysLeft: daysLeft(row.end_date),
        competitions: [],
        registrationEditDeadline: row.registration_edit_deadline,
        registrationDeadline: row.registration_deadline,
      };
    });
}

// Shared across every component on the page (the side nav and the page both
// list fests) and across page changes; refreshed in the background after 30s.
export function useFeasts(options?: UseFeastsOptions) {
  const { data, loading } = useCachedQuery(isSupabaseConfigured ? "fp:feasts" : null, loadFeasts, {
    staleMs: 30_000,
    pollMs: options?.pollIntervalMs ?? null,
  });
  return { feasts: data ?? EMPTY_FEASTS, loading };
}
const EMPTY_FEASTS: FeastUI[] = [];

// ── useFeast (single feast + competitions) ───────────────────────────────
// One parallel batch: the fest row, its competitions (with stage, category
// slug and an embedded registration count), and the participant count. This
// used to be three sequential round trips, the last of which downloaded
// every registration row just to count them per competition — and silently
// stopped at 1000 rows.
async function loadFeast(slug: string): Promise<FeastUI | null> {
  const [{ data: feastRow, error: feastErr }, { data: fcs, error: fcErr }, { count: regsCount }] = await Promise.all([
    supabase.from("feasts").select("*").eq("slug", slug).maybeSingle(),
    supabase
      .from("feast_competitions")
      .select(
        "id, time_slot, venue, max_slots, stage_id, scheduled_time, comp_status, progress_pct, info, feast:feasts!inner(slug), stage:stages(*), participant_registrations(count), competition:competitions(name, type, category, gender, icon, max_per_shakha, max_team_size, competition_category:competition_categories(slug))"
      )
      .eq("feast.slug", slug)
      .order("display_order"),
    supabase.from("participants").select("id, feast:feasts!inner(slug)", { count: "exact", head: true }).eq("feast.slug", slug),
  ]);
  if (feastErr) console.error("[useFeast]", feastErr.message);
  if (fcErr) console.error("[useFeast] competitions", fcErr.message);
  if (!feastRow) return null;

  const cfg = feastVisual(feastRow.type);
  const comps: FeastCompetitionUI[] = (fcs ?? []).map((fc) => {
    const c = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    const cat = Array.isArray(c?.competition_category) ? c?.competition_category[0] : c?.competition_category;
    const stage = Array.isArray(fc.stage) ? fc.stage[0] : fc.stage;
    const regCount = Array.isArray(fc.participant_registrations) ? fc.participant_registrations[0] : fc.participant_registrations;
    return {
      id: fc.id,
      name: c?.name ?? "Competition",
      cat: c?.type === "group" ? "Team" : "Individual",
      time: fc.time_slot ?? "",
      venue: fc.venue ?? "",
      filled: Number((regCount as { count?: number } | undefined)?.count ?? 0),
      cap: fc.max_slots ?? 0,
      icon: c?.icon || compIcon(c?.category ?? null),
      gender: c?.gender ?? null,
      competitionCategorySlug: cat?.slug ?? null,
      stage: (stage as Stage | null) ?? null,
      scheduledTime: fc.scheduled_time,
      compStatus: (fc.comp_status ?? "upcoming") as FeastCompetitionUI["compStatus"],
      progressPct: fc.progress_pct,
      info: fc.info,
      maxPerShakha: c?.max_per_shakha ?? 2,
      maxTeamSize: c?.max_team_size ?? undefined,
    };
  });

  return {
    id: feastRow.id,
    slug: feastRow.slug,
    name: feastRow.name,
    type: feastRow.type,
    year: feastRow.year,
    icon: cfg.icon,
    tint: cfg.tint,
    accent: cfg.accent,
    status: statusLabel(feastRow.status),
    date: formatDateRange(feastRow.start_date, feastRow.end_date),
    startDate: feastRow.start_date,
    venue: feastRow.venue ?? "",
    blurb: feastRow.description ?? "",
    registrations: regsCount ?? 0,
    daysLeft: daysLeft(feastRow.end_date),
    competitions: comps,
    registrationEditDeadline: feastRow.registration_edit_deadline,
    registrationDeadline: feastRow.registration_deadline,
  };
}

// Cached per slug: details → stages → results → back renders instantly, and
// the data refreshes in the background once it is 10s old.
export function useFeast(slug: string) {
  const { data, loading } = useCachedQuery(isSupabaseConfigured && slug ? `fp:feast:${slug}` : null, () => loadFeast(slug), {
    staleMs: 10_000,
  });
  return { feast: data ?? null, loading };
}

// ── useShakhas ───────────────────────────────────────────────────────────
async function loadShakhas(): Promise<ShakhaOption[]> {
  const { data, error } = await supabase.from("shakhas").select("id, name, color").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color }));
}

export function useShakhas() {
  const { data } = useCachedQuery(isSupabaseConfigured ? "fp:shakhas" : null, loadShakhas, { staleMs: 60_000 });
  return { shakhas: data ?? EMPTY_SHAKHAS };
}
const EMPTY_SHAKHAS: ShakhaOption[] = [];

// ── useOrgSettings — cached client read of the org_settings singleton ────
export function loadOrgSettingsCached() {
  return fetchCached("fp:org-settings", getOrgSettings, 60_000);
}

export function useOrgSettings(): OrgSettings | null {
  const { data } = useCachedQuery(isSupabaseConfigured ? "fp:org-settings" : null, getOrgSettings, { staleMs: 60_000 });
  return data ?? null;
}

// ── useOrgHierarchy — Diocese/Meghala/Shakha + the org's configured level ─
// One combined hook (not three separate ones) since every real consumer —
// cascading pickers, admin nav, the standings tier toggle — needs all four
// together; splitting them would just make every caller re-combine them.
// useShakhas() above stays untouched for its existing display-only
// (color/name lookup) consumers, which don't need any of this.
interface OrgHierarchyData {
  dioceses: Diocese[];
  meghalas: Meghala[];
  shakhas: Shakha[];
  hierarchyLevel: HierarchyLevel;
}

async function loadOrgHierarchy(): Promise<OrgHierarchyData> {
  const [d, m, s, org] = await Promise.all([
    supabase.from("dioceses").select("*").order("name"),
    supabase.from("meghalas").select("*").order("name"),
    supabase.from("shakhas").select("*").order("name"),
    loadOrgSettingsCached(),
  ]);
  return {
    dioceses: (d.data as Diocese[] | null) ?? [],
    meghalas: (m.data as Meghala[] | null) ?? [],
    shakhas: (s.data as Shakha[] | null) ?? [],
    hierarchyLevel: org.hierarchy_level,
  };
}

const EMPTY_HIERARCHY: OrgHierarchyData = { dioceses: [], meghalas: [], shakhas: [], hierarchyLevel: "shakha" };

// Short stale window: admin pickers read this too, right after admins edit
// shakhas/meghalas/dioceses (those pages also call invalidateOrgHierarchy).
export function useOrgHierarchy() {
  const { data, loading } = useCachedQuery(isSupabaseConfigured ? "fp:org-hierarchy" : null, loadOrgHierarchy, { staleMs: 15_000 });
  return { ...(data ?? EMPTY_HIERARCHY), loading };
}

export function invalidateOrgHierarchy() {
  invalidateCached("fp:org-hierarchy");
  invalidateCached("fp:shakhas");
}

// ── useFeastId ───────────────────────────────────────────────────────────
// Reads the id from the cached fest instead of a separate slug→id query.
export function useFeastId(slug: string) {
  return useFeast(slug).feast?.id ?? null;
}
