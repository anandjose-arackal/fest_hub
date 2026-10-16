"use client";

import { useEffect, useState } from "react";
import { getDescendantShakhaIds } from "@/lib/org-hierarchy";
import type { Diocese, HierarchyLevel, Meghala, Shakha } from "@/types";

export interface PickerHierarchy {
  dioceses: Diocese[];
  meghalas: Meghala[];
  shakhas: Shakha[];
  hierarchyLevel: HierarchyLevel;
}

interface HierarchyPickerProps {
  value: string; // always a leaf shakha id
  onChange: (shakhaId: string) => void;
  hierarchy: PickerHierarchy;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  /** Leaf <select>'s empty-value option text — e.g. "All Shakhas" for a filter vs. the "Select Shakha…" default for a required form field. */
  emptyLabel?: string;
}

// Cascading Diocese -> Meghala -> Shakha picker that always resolves to a
// leaf shakha id, for every free-pick shakha <select> in admin (create/edit
// participant & team, list filters). At hierarchyLevel === "shakha" this
// renders as the exact same single <select> every one of those call sites
// already had before this component existed — a 'shakha'-level org (the
// default) sees zero markup/behavior change wherever this replaces one.
export function HierarchyPicker({ value, onChange, hierarchy, required, className, disabled, emptyLabel }: HierarchyPickerProps) {
  const { dioceses, meghalas, shakhas, hierarchyLevel } = hierarchy;
  const cls = className ?? "input";
  const leafEmptyLabel = emptyLabel ?? "Select Shakha…";

  const [dioceseId, setDioceseId] = useState("");
  const [meghalaId, setMeghalaId] = useState("");

  // Re-derive the diocese/meghala ancestry whenever `value` changes from
  // outside (e.g. opening the edit form for a different row) — this
  // component only controls the leaf shakha id, so the intermediate
  // selections have to be reconstructed from it.
  useEffect(() => {
    // Picking a meghala/diocese clears the leaf (onChange("")) — don't let
    // that echo back here and wipe out the meghala/diocese just picked.
    if (!value) return;
    const sh = shakhas.find((s) => s.id === value);
    const mg = sh?.meghala_id ? meghalas.find((m) => m.id === sh.meghala_id) : undefined;
    setMeghalaId(sh?.meghala_id ?? "");
    setDioceseId(mg?.diocese_id ?? "");
  }, [value, shakhas, meghalas]);

  if (hierarchyLevel === "shakha") {
    return (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} required={required}>
        <option value="">{leafEmptyLabel}</option>
        {shakhas.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  }

  const availableMeghalas = hierarchyLevel === "diocese" ? meghalas.filter((m) => m.diocese_id === dioceseId) : meghalas;
  const availableShakhas = meghalaId ? shakhas.filter((s) => s.meghala_id === meghalaId) : [];

  return (
    <div className="space-y-2">
      {hierarchyLevel === "diocese" && (
        <select
          className={cls}
          value={dioceseId}
          onChange={(e) => {
            setDioceseId(e.target.value);
            setMeghalaId("");
            onChange("");
          }}
          disabled={disabled}
          required={required}
        >
          <option value="">Select Diocese…</option>
          {dioceses.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      <select
        className={cls}
        value={meghalaId}
        onChange={(e) => {
          setMeghalaId(e.target.value);
          onChange("");
        }}
        disabled={disabled || (hierarchyLevel === "diocese" && !dioceseId)}
        required={required}
      >
        <option value="">Select Meghala…</option>
        {availableMeghalas.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <select
        className={cls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !meghalaId}
        required={required}
      >
        <option value="">{leafEmptyLabel}</option>
        {availableShakhas.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

// ─── List filter ────────────────────────────────────────────────────────────

/** A list filter's selection — each tier optional, "" meaning "all". */
export interface HierarchyFilterValue {
  dioceseId: string;
  meghalaId: string;
  shakhaId: string;
}

export const EMPTY_HIERARCHY_FILTER: HierarchyFilterValue = { dioceseId: "", meghalaId: "", shakhaId: "" };

/** The shakha ids a filter selection covers (its deepest picked tier and everything beneath it), or null when nothing is picked. */
export function filterShakhaIds(value: HierarchyFilterValue, hierarchy: PickerHierarchy): Set<string> | null {
  if (value.shakhaId) return new Set([value.shakhaId]);
  if (value.meghalaId) return new Set(getDescendantShakhaIds({ level: "meghala", id: value.meghalaId, name: "" }, hierarchy));
  if (value.dioceseId) return new Set(getDescendantShakhaIds({ level: "diocese", id: value.dioceseId, name: "" }, hierarchy));
  return null;
}

// Diocese -> Meghala -> Shakha selects for admin list filters. Unlike
// HierarchyPicker (a form field that must land on one leaf shakha), every
// tier here is a filter in its own right: picking a meghala lists all of its
// shakhas' rows straight away, and the shakha select only narrows further.
// At hierarchyLevel === "shakha" it's the same single "All Shakhas" select.
export function HierarchyFilter({
  value, onChange, hierarchy, className,
}: {
  value: HierarchyFilterValue;
  onChange: (value: HierarchyFilterValue) => void;
  hierarchy: PickerHierarchy;
  className?: string;
}) {
  const { dioceses, meghalas, shakhas, hierarchyLevel } = hierarchy;
  const cls = className ?? "input";

  const availableMeghalas = value.dioceseId ? meghalas.filter((m) => m.diocese_id === value.dioceseId) : meghalas;
  const meghalaScope = value.meghalaId ? null : filterShakhaIds({ ...value, shakhaId: "" }, hierarchy);
  const availableShakhas =
    hierarchyLevel === "shakha" ? shakhas
    : value.meghalaId ? shakhas.filter((s) => s.meghala_id === value.meghalaId)
    : meghalaScope ? shakhas.filter((s) => meghalaScope.has(s.id))
    : shakhas;

  return (
    <>
      {hierarchyLevel === "diocese" && (
        <select className={cls} value={value.dioceseId} onChange={(e) => onChange({ dioceseId: e.target.value, meghalaId: "", shakhaId: "" })}>
          <option value="">All Dioceses</option>
          {dioceses.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      {hierarchyLevel !== "shakha" && (
        <select className={cls} value={value.meghalaId} onChange={(e) => onChange({ ...value, meghalaId: e.target.value, shakhaId: "" })}>
          <option value="">All Meghalas</option>
          {availableMeghalas.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}
      <select className={cls} value={value.shakhaId} onChange={(e) => onChange({ ...value, shakhaId: e.target.value })}>
        <option value="">All Shakhas</option>
        {availableShakhas.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </>
  );
}
