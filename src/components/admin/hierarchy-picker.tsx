"use client";

import { useEffect, useState } from "react";
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
