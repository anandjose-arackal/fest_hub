"use client";

import type { PickerHierarchy } from "./hierarchy-picker";

interface ScopePickerProps {
  value: string;
  onChange: (id: string) => void;
  hierarchy: PickerHierarchy;
  className?: string;
  required?: boolean;
  emptyLabel?: string;
}

// Picks exactly one node at whichever single tier hierarchy.hierarchyLevel
// currently is (never a cascade) — used only for assigning an sa_admin's
// own scope (profiles.shakha_id / meghala_id / diocese_id), which is a
// different shape of problem than HierarchyPicker's leaf-shakha resolution:
// the admin's node IS the tier, not a path down to a shakha beneath it.
export function ScopePicker({ value, onChange, hierarchy, className, required, emptyLabel }: ScopePickerProps) {
  const { dioceses, meghalas, shakhas, hierarchyLevel } = hierarchy;
  const options =
    hierarchyLevel === "diocese" ? dioceses : hierarchyLevel === "meghala" ? meghalas : shakhas;
  const label = hierarchyLevel === "diocese" ? "Diocese" : hierarchyLevel === "meghala" ? "Meghala" : "Shakha";

  return (
    <select className={className ?? "input"} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{emptyLabel ?? `Select ${label}…`}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
