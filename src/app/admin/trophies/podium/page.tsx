"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ListOrdered, MonitorPlay, X } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { getScreenData, type ScreenCompetitionResult } from "@/actions/results";
import { setPodiumDisplay, type PodiumCommand } from "@/actions/handover";
import { readPodiumPick } from "@/lib/podium";
import { theme } from "@/components/feast/feast-shared";
import { ActionButton, BUTTON_CLASS, Card, HandoverPanel, PageHeading, buttonStyle } from "@/components/admin/handover-ui";

// Operator remote for the LED screen behind the winner podium (/podium):
// pick the item being awarded and the screen switches to its winners.
type OnScreen = { mode: "item" | "standings"; fcId: string | null; feastSlug: string | null };
export default function PodiumControlPage() {
  const { feasts, loading: feastsLoading } = useFeasts();
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ slug: string; list: ScreenCompetitionResult[] } | null>(null);
  const [current, setCurrent] = useState<OnScreen>({ mode: "item", fcId: null, feastSlug: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Open on the fest the screen is already showing, else the live one.
  useEffect(() => {
    readPodiumPick().then((p) => {
      if (!p) return;
      setCurrent({ mode: p.mode, fcId: p.fcId, feastSlug: p.feastSlug });
      if (p.feastSlug) setSlug((s) => s ?? p.feastSlug);
    });
  }, []);
  const activeSlug = slug ?? feasts.find((f) => f.status !== "Completed")?.slug ?? feasts[0]?.slug ?? null;

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    getScreenData(activeSlug).then((r) => {
      if (cancelled) return;
      setLoaded({ slug: activeSlug, list: r.data?.competitions ?? [] });
      if (r.error) setError(r.error);
    });
    return () => { cancelled = true; };
  }, [activeSlug]);
  const items = loaded?.slug === activeSlug ? loaded.list : null;

  async function run(key: string, cmd: PodiumCommand, next: OnScreen) {
    setBusy(key);
    setError(null);
    const r = await setPodiumDisplay(cmd);
    setBusy(null);
    if (r.error) setError(r.error);
    else setCurrent(next);
  }
  const show = (fcId: string | null) =>
    run(fcId ?? "clear", { mode: "item", feastCompetitionId: fcId }, { mode: "item", fcId, feastSlug: fcId ? activeSlug : null });
  const activeFeast = feasts.find((f) => f.slug === activeSlug);
  const showStandings = () =>
    activeFeast && run("standings", { mode: "standings", feastId: activeFeast.id }, { mode: "standings", fcId: null, feastSlug: activeFeast.slug });
  const standingsOn = current.mode === "standings" && current.feastSlug === activeSlug;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((c) => !q || `${c.competitionName} ${c.competitionNameEn ?? ""} ${c.categoryName}`.toLowerCase().includes(q));
  }, [items, query]);
  const onScreen = items?.find((c) => c.competitionId === current.fcId) ?? null;
  const onScreenLabel =
    current.mode === "standings"
      ? `Top 3 standings · ${feasts.find((f) => f.slug === current.feastSlug)?.name ?? "fest"}`
      : onScreen ? `${onScreen.competitionName} · ${onScreen.categoryName}` : current.fcId ? "Item from another fest" : "Flag backdrop + badge animation";

  return (
    <HandoverPanel>
      <PageHeading
        icon={<MonitorPlay className="h-5 w-5" />}
        title="Podium Screen"
        sub="Show an item's winners or the top-3 standings on the LED screen behind the podium"
        right={
          <a href="/podium" target="_blank" rel="noreferrer" className={BUTTON_CLASS} style={buttonStyle("ghost")}>
            <ExternalLink className="h-4 w-4" /> Open screen
          </a>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.sub }}>On screen now</p>
          <p className="fp-ml truncate text-[16px] font-extrabold" style={{ color: theme.text }}>
            {onScreenLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton tone={standingsOn ? "ghost" : "primary"} onClick={showStandings} disabled={!activeFeast || standingsOn} busy={busy === "standings"} title="Top 3 diocese / meghala / shakha of the selected fest">
            <ListOrdered className="h-4 w-4" /> {standingsOn ? "Showing standings" : "Standings"}
          </ActionButton>
          <ActionButton tone="ghost" onClick={() => show(null)} disabled={current.mode === "item" && !current.fcId} busy={busy === "clear"}>
            <X className="h-4 w-4" /> Clear screen
          </ActionButton>
        </div>
      </Card>

      {error && <p className="mb-3 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>{error}</p>}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={activeSlug ?? ""}
          onChange={(e) => setSlug(e.target.value)}
          disabled={feastsLoading}
          className="min-h-[42px] rounded-xl px-3 text-[14px] font-bold sm:w-72"
          style={{ background: theme.surface, color: theme.text, border: `1px solid ${theme.line2}` }}
        >
          {feasts.map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items"
          className="min-h-[42px] flex-1 rounded-xl px-3 text-[14px] font-semibold"
          style={{ background: theme.surface, color: theme.text, border: `1px solid ${theme.line2}` }}
        />
      </div>

      {items === null ? (
        <p className="py-8 text-center text-[13px] font-semibold" style={{ color: theme.sub }}>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-[13px] font-semibold" style={{ color: theme.sub }}>No published results{query ? " match" : " in this fest yet"}.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const live = current.mode === "item" && c.competitionId === current.fcId;
            const winners = [1, 2, 3].map((p) => c.positions.filter((x) => x.place === p).map((x) => x.name).join(", ")).filter(Boolean);
            return (
              <li key={c.competitionId}>
                <Card className="flex h-full items-center gap-3 p-3" style={live ? { outline: "2px solid var(--fp-btn)" } : undefined}>
                  <div className="min-w-0 flex-1">
                    <p className="fp-ml truncate text-[15px] font-extrabold" style={{ color: theme.text }}>{c.competitionName}</p>
                    <p className="truncate text-[12px] font-bold" style={{ color: theme.sub }}>
                      {[c.categoryName, c.gender === "girl" ? "Girls" : c.gender === "boy" ? "Boys" : null].filter(Boolean).join(" · ")}
                    </p>
                    <p className="fp-ml truncate text-[12px]" style={{ color: theme.faint }}>{winners.join(" / ") || "No placed winners"}</p>
                  </div>
                  <ActionButton tone={live ? "ghost" : "primary"} onClick={() => show(c.competitionId)} disabled={live} busy={busy === c.competitionId}>
                    {live ? "Showing" : "Show"}
                  </ActionButton>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </HandoverPanel>
  );
}
