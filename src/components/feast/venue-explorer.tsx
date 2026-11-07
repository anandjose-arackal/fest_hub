"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ChevronsUp, DoorOpen, Footprints, MapPin } from "lucide-react";
import type { CompetitionStage, RunState } from "@/hooks/use-competition-stages";
import { floorName } from "@/lib/venue-floors";
import { MAIN, buildingsOf, routeSteps, type RouteStep, type VenuePlan } from "@/lib/venue-plan";
import { theme } from "./feast-shared";
import { VenueMap } from "./venue-map";
import { FloorPlan } from "./floor-plan";

// The venue campus map with its floor plans. Picking a stage plays two beats
// back to back: the map glides in to the stage's building and highlights its
// floor (or the hall), then FLOOR_BEAT_MS later that floor's plan comes up
// with the stage's room lit and the way to it drawn. The tabs browse plans
// without a stage selected.
//
// Wide screens stack the map above the plan. Phones show one panel: the
// building, then — flying into the glowing floor — that floor's plan in its
// place, with a "Building" chip to go back.

const FLOOR_BEAT_MS = 700;
const PHONE_FLOOR_BEAT_MS = 1200; // phones hold the building half a second longer before flying into the floor
const STATUS: Record<RunState, string> = { running: "#F59E0B", completed: "#16A34A", upcoming: "var(--fp-primary, #6D28D9)" };
const STEP_ICON: Record<RouteStep["kind"], typeof MapPin> = { building: DoorOpen, floor: ChevronsUp, room: MapPin, helper: Footprints };
const EASE = [0.22, 1, 0.36, 1] as const;
const PLAN_IN_S = 0.9; // the plan's fly-in; its route waits for it
const BUILDING_OUT_S = 0.75;

interface View { building: string; floor: number }
const same = (a: View, b: View) => a.building === b.building && a.floor === b.floor;

const PHONE = "(max-width: 639px)";
function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

export function VenueExplorer({ plan, stages, selectedKey, onSelect }: { plan: VenuePlan; stages: CompetitionStage[]; selectedKey: string | null; onSelect: (stageKey: string) => void }) {
  const reduce = !!useReducedMotion();
  const phone = useIsPhone();
  const planRef = useRef<HTMLDivElement>(null);
  const viewOf = (s: CompetitionStage): View | null =>
    s.building == null ? null : { building: s.building, floor: s.building === MAIN ? s.floor ?? 0 : 0 };
  const selected = stages.find((s) => s.key === selectedKey && s.building != null) ?? null;
  const selectedView = selected ? viewOf(selected) : null;
  const live = stages.find((s) => s.status === "running" && s.building != null);
  const tabs: (View & { label: string })[] = buildingsOf(plan).flatMap((b) =>
    b.building === MAIN
      ? b.floors.map((f) => ({ building: MAIN, floor: f.floor, label: floorName(f.floor) }))
      : [{ building: b.building, floor: b.floors[0]?.floor ?? 0, label: b.name }],
  );

  // Beat 1 starts whenever the selection changes (a pin or a stage card); a
  // tab overrides the view until the next selection. On a phone the panel
  // shows the building through beat 1 and the plan from beat 2.
  const [seenKey, setSeenKey] = useState(selectedKey);
  const [beat, setBeat] = useState<1 | 2>(2);
  const [tab, setTab] = useState<View | null>(null);
  const [planView, setPlanView] = useState<View>(selectedView ?? (live && viewOf(live)) ?? tabs.find((t) => t.floor > 0) ?? tabs[0]);
  const [phoneView, setPhoneView] = useState<"building" | "plan">("building");
  const [zoomedOut, setZoomedOut] = useState(false);
  if (seenKey !== selectedKey) {
    setSeenKey(selectedKey);
    setTab(null);
    setZoomedOut(false);
    if (selected) { setBeat(1); setPhoneView("building"); }
  }

  useEffect(() => {
    if (beat !== 1 || !selectedView) return;
    const id = setTimeout(() => { setPlanView(selectedView); setBeat(2); setPhoneView("plan"); }, reduce ? 0 : phone ? PHONE_FLOOR_BEAT_MS : FLOOR_BEAT_MS);
    return () => clearTimeout(id);
    // selectedView is rebuilt each render; its building/floor are what matter.
  }, [beat, selectedView?.building, selectedView?.floor, reduce, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the action on screen: on a phone the panel as beat 1 starts (picks
  // come from the buttons below it), elsewhere the plan as beat 2 starts.
  useEffect(() => {
    if (!selected || beat !== (phone ? 1 : 2)) return;
    const el = planRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: phone ? "start" : "center" });
  }, [beat, seenKey, selected, reduce, phone]);

  const focus = zoomedOut ? null : tab ?? selectedView;
  const planStage = beat === 2 && selected && selectedView && same(selectedView, planView) ? selected.stageNumber : null;
  const steps = planStage != null ? routeSteps(plan, planStage, floorName) : [];
  const pickable = stages.filter((s) => s.building != null).sort((a, b) => a.stageNumber - b.stageNumber);

  function openTab(t: View) {
    setTab(t);
    setPlanView(t);
    setBeat(2);
    setZoomedOut(false);
    setPhoneView("plan");
  }
  function backToBuilding() {
    setZoomedOut(true);
    setPhoneView("building");
  }

  const map = (
    <VenueMap
      stages={stages}
      facilities={plan.groundLabels}
      minFloors={plan.floors.length}
      venueName={plan.name}
      focusFloor={focus?.building === MAIN ? focus.floor : null}
      focusBuilding={focus && focus.building !== MAIN ? focus.building : null}
      zoomable
      labels={false}
      selectedKey={selectedKey}
      onSelect={onSelect}
      className="mx-auto max-w-[1000px]"
    />
  );

  const picker = (
    <>
      {/* The pins are small on a phone: every stage is also a button here. */}
      <p className="fp-cap m-0 mt-4 px-1 text-[10.5px]" style={{ color: theme.goldInk }}>Find a stage</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {pickable.map((s) => {
          const on = s.key === selectedKey;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(s.key)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors"
              style={on ? { background: "var(--fp-chip-on, var(--fp-primary))", color: "var(--fp-chip-on-fg, #fff)" } : { background: theme.surface2, color: theme.text, border: `1px solid ${theme.line}` }}
            >
              <span className="fp-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-white" style={{ background: STATUS[s.status], boxShadow: on ? "0 0 0 2px #fff" : undefined }}>{s.stageNumber}</span>
              <span className="fp-ml min-w-0 truncate text-[12.5px] font-extrabold">{s.title}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  const floorTabs = (
    <div role="tablist" aria-label="Floor plans" className="mt-4 flex flex-wrap justify-center gap-1.5">
      {tabs.map((t) => {
        const on = (!phone || phoneView === "plan") && same(t, planView);
        return (
          <button
            key={`${t.building}-${t.floor}`}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => openTab(t)}
            className="h-9 rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors"
            style={on ? { background: "var(--fp-chip-on, var(--fp-primary))", color: "var(--fp-chip-on-fg, #fff)" } : { background: theme.surface2, color: theme.sub, border: `1px solid ${theme.line}` }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const directions = steps.length > 0 && selected && (!phone || phoneView === "plan") && (
    <section aria-label={`Directions to Stage ${selected.stageNumber}`} className="mt-3 rounded-2xl p-3.5" style={{ background: theme.surface2, border: `1px solid ${theme.line}` }}>
      <p className="m-0 text-[14px] font-extrabold" style={{ color: theme.text }}>How to get to Stage {selected.stageNumber} · <span className="fp-ml">{selected.title}</span></p>
      <ol className="m-0 mt-2.5 list-none space-y-2 p-0">
        {steps.map((st, i) => {
          const Icon = STEP_ICON[st.kind];
          return (
            <motion.li
              key={`${selected.key}-${i}`}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : (phone ? PLAN_IN_S : 0) + 0.25 + i * 0.3, duration: 0.3 }}
              className="flex items-center gap-2.5"
            >
              <span className="fp-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px]" style={st.kind === "helper" ? { background: "#FFF1C2", color: "#7A5A00" } : { background: "var(--fp-chip-on, var(--fp-primary))", color: "var(--fp-chip-on-fg, #fff)" }}>
                {st.kind === "helper" ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              {st.kind !== "helper" && <Icon className="h-4 w-4 shrink-0" style={{ color: theme.goldInk }} aria-hidden="true" />}
              <span className="text-[13.5px] font-bold" style={{ color: st.kind === "helper" ? theme.sub : theme.text }}>{st.text}</span>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );

  if (!phone) {
    return (
      <div>
        {map}
        {picker}
        {floorTabs}
        <div ref={planRef} className="mt-3 scroll-mt-24 scroll-mb-28 rounded-2xl p-2 sm:p-3" style={{ background: "#FFF8EE", border: `1px solid ${theme.line}` }} aria-live="polite">
          <FloorPlan plan={plan} building={planView.building} floor={planView.floor} stage={planStage} stages={stages} />
        </div>
        {directions}
      </div>
    );
  }

  // Phone: one panel. The building zooms in past the glowing floor and fades;
  // the plan rises in tilted back and settles flat — and back again.
  const floors = plan.floors.length;
  const origin = focus && focus.building === MAIN ? `50% ${Math.round(28 + ((floors - 1 - focus.floor) / Math.max(1, floors - 1)) * 34)}%` : "62% 55%";
  const flyOut = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3, filter: "blur(6px)" };
  const planAway = reduce ? { opacity: 0 } : { opacity: 0, rotateX: 42, scale: 0.86, y: 36 };
  return (
    <div>
      <motion.div
        ref={planRef}
        layout
        transition={{ layout: { duration: reduce ? 0 : PLAN_IN_S, ease: EASE } }}
        className="relative scroll-mt-20 overflow-hidden rounded-2xl"
        style={{ perspective: 900, background: phoneView === "plan" ? "#FFF8EE" : "transparent", transition: "background .4s" }}
        aria-live="polite"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {phoneView === "building" ? (
            <motion.div
              key="building"
              initial={flyOut}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={flyOut}
              transition={{ duration: reduce ? 0.2 : BUILDING_OUT_S, ease: EASE }}
              style={{ transformOrigin: origin }}
            >
              {map}
            </motion.div>
          ) : (
            <motion.div
              key={`plan-${planView.building}-${planView.floor}`}
              initial={planAway}
              animate={{ opacity: 1, rotateX: 0, scale: 1, y: 0 }}
              exit={planAway}
              transition={{ duration: reduce ? 0.2 : PLAN_IN_S, ease: EASE }}
              className="p-2 pt-11"
              style={{ transformOrigin: "50% 100%" }}
            >
              <button
                type="button"
                onClick={backToBuilding}
                className="absolute left-2 top-2 z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-extrabold"
                style={{ background: "#FFFFFF", color: "#1F1F24", border: "1px solid rgba(0,0,0,.12)", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Building
              </button>
              <span className="absolute right-3 top-3.5 z-10 text-[12px] font-extrabold" style={{ color: "#7A4A12" }}>
                {tabs.find((t) => same(t, planView))?.label}
              </span>
              <FloorPlan plan={plan} building={planView.building} floor={planView.floor} stage={planStage} stages={stages} animateIn={false} routeDelay={reduce ? 0 : PLAN_IN_S} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {directions}
      {picker}
      {floorTabs}
    </div>
  );
}
