"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { AlignCenter, AlignLeft, AlignRight, Award, Plus, Printer, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCertificateRoster, getCertificateTemplate, saveCertificateTemplate } from "@/actions/certificates";
import { positionLabel } from "@/lib/result-calculator";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { CertificateField, CertificateFieldType, CertificateRosterRow, CertificateTemplate, Feast } from "@/types";

const A4 = { w: 210, h: 297 };
const LETTER = { w: 215.9, h: 279.4 };
const MAX_CANVAS_PX = 700;

const FIELD_LABELS: Record<CertificateFieldType, string> = {
  name: "Participant Name",
  place: "Place",
  shakha: "Shakha",
  grade_text: "Grade",
  grade_tick: "Grade tick",
};

function emptyTemplate(feastId: string): CertificateTemplate {
  return { feast_id: feastId, paper_width_mm: A4.w, paper_height_mm: A4.h, background_image_url: "", fields: [] };
}

function newField(type: CertificateFieldType, paperW: number, paperH: number, gradeValue?: "A" | "B" | "C"): CertificateField {
  return {
    id: crypto.randomUUID(),
    type,
    x_mm: paperW / 2,
    y_mm: paperH / 2,
    rotation_deg: 0,
    font_size_pt: 16,
    color: "#111827",
    text_align: "center",
    gradeValue,
  };
}

// Shared by the on-screen chip and the print HTML so the designer stays WYSIWYG.
function alignTx(align: CertificateField["text_align"]): string {
  return align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
}

function fieldPreviewContent(field: CertificateField): string {
  if (field.type === "name") return "Participant Name";
  if (field.type === "place") return "1st";
  if (field.type === "shakha") return "Shakha";
  if (field.type === "grade_text") return "A";
  return field.gradeValue ?? "✓"; // grade_tick
}

function fieldContentForRow(field: CertificateField, row: CertificateRosterRow): string {
  if (field.type === "name") return row.name;
  if (field.type === "place") return row.place ? positionLabel(row.place) : "";
  if (field.type === "shakha") return row.shakhaName;
  if (field.type === "grade_text") return row.grade ?? "";
  return row.grade === field.gradeValue ? "✓" : ""; // grade_tick
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFieldHtml(field: CertificateField, row: CertificateRosterRow): string {
  const content = fieldContentForRow(field, row);
  if (!content) return "";
  const tx = alignTx(field.text_align);
  return `<div style="position:absolute;left:${field.x_mm}mm;top:${field.y_mm}mm;"><div style="display:inline-block;white-space:nowrap;transform:translate(${tx}, -50%) rotate(${field.rotation_deg}deg);font-size:${field.font_size_pt}pt;color:${field.color};">${escHtml(content)}</div></div>`;
}

function buildCertificateHtml(template: CertificateTemplate, rows: CertificateRosterRow[]): string {
  const sheets = rows
    .map(
      (row) => `<div class="sheet">
    <img src="${template.background_image_url}" alt="" />
    ${template.fields.map((f) => renderFieldHtml(f, row)).join("")}
  </div>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificates</title><style>
    @page { size: ${template.paper_width_mm}mm ${template.paper_height_mm}mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { position: relative; width: ${template.paper_width_mm}mm; height: ${template.paper_height_mm}mm; overflow: hidden; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .sheet > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  </style></head><body>${PRINT_FALLBACK_BUTTON}${sheets}</body></html>`;
}

// ─── Draggable/rotatable field chip ─────────────────────────────────────────

function FieldChip({
  field, pxPerMm, selected, onSelect, onChange, onDelete,
}: {
  field: CertificateField;
  pxPerMm: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CertificateField>) => void;
  onDelete: () => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; x0: number; y0: number } | null>(null);
  const rotateRef = useRef<{ cx: number; cy: number; angle0: number; rot0: number } | null>(null);

  const onBodyPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, x0: field.x_mm, y0: field.y_mm };
  };
  const onBodyPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dxMm = (e.clientX - dragRef.current.startX) / pxPerMm;
    const dyMm = (e.clientY - dragRef.current.startY) / pxPerMm;
    onChange({ x_mm: dragRef.current.x0 + dxMm, y_mm: dragRef.current.y0 + dyMm });
  };
  const onBodyPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onRotatePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = innerRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    rotateRef.current = { cx, cy, angle0: Math.atan2(e.clientY - cy, e.clientX - cx), rot0: field.rotation_deg };
  };
  const onRotatePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!rotateRef.current) return;
    const { cx, cy, angle0, rot0 } = rotateRef.current;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const deltaDeg = (angle - angle0) * (180 / Math.PI);
    let raw = (rot0 + deltaDeg + 360) % 360;
    if (e.shiftKey) raw = Math.round(raw / 15) * 15;
    onChange({ rotation_deg: raw });
  };
  const onRotatePointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    rotateRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const tx = alignTx(field.text_align);

  return (
    <div style={{ position: "absolute", left: field.x_mm * pxPerMm, top: field.y_mm * pxPerMm }}>
      <div
        ref={innerRef}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        style={{
          position: "relative",
          display: "inline-block",
          whiteSpace: "nowrap",
          transform: `translate(${tx}, -50%) rotate(${field.rotation_deg}deg)`,
          fontSize: field.font_size_pt,
          color: field.color,
          cursor: "grab",
          padding: "2px 5px",
          userSelect: "none",
          touchAction: "none",
          borderRadius: 4,
          outline: selected ? "1.5px dashed #6B46FF" : "1px dashed rgba(107,70,255,0.25)",
        }}
      >
        {fieldPreviewContent(field)}
        {selected && (
          <>
            <div
              onPointerDown={onRotatePointerDown}
              onPointerMove={onRotatePointerMove}
              onPointerUp={onRotatePointerUp}
              title="Drag to rotate — hold Shift to snap to 15°"
              style={{
                position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
                width: 14, height: 14, borderRadius: "50%", background: "#6B46FF",
                border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)", cursor: "grab", touchAction: "none",
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Delete field"
              style={{
                position: "absolute", top: -22, right: -22, width: 18, height: 18, borderRadius: "50%",
                background: "#DC2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: "pointer",
              }}
            >
              <Trash2 style={{ width: 10, height: 10 }} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function CertificatesPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bgMismatch, setBgMismatch] = useState(false);

  const [roster, setRoster] = useState<CertificateRosterRow[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(MAX_CANVAS_PX);

  useEffect(() => {
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!feastId) return;
    setLoading(true);
    setSelectedFieldId(null);
    setRoster(null);
    getCertificateTemplate(feastId).then(({ data, error }) => {
      if (error) console.error("[certificates]", error);
      setTemplate(data ?? emptyTemplate(feastId));
      setLoading(false);
    });
  }, [feastId]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidthPx(Math.min(w, MAX_CANVAS_PX));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading || !template) return <p className="text-sm text-neutral-500">Loading…</p>;

  const pxPerMm = containerWidthPx / template.paper_width_mm;
  const canvasHeightPx = template.paper_height_mm * pxPerMm;

  function patchTemplate(patch: Partial<CertificateTemplate>) {
    setTemplate((t) => (t ? { ...t, ...patch } : t));
  }

  function updateField(id: string, patch: Partial<CertificateField>) {
    setTemplate((t) => (t ? { ...t, fields: t.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : t));
  }

  function removeField(id: string) {
    setTemplate((t) => (t ? { ...t, fields: t.fields.filter((f) => f.id !== id) } : t));
    setSelectedFieldId((s) => (s === id ? null : s));
  }

  function addField(type: CertificateFieldType) {
    setTemplate((t) => {
      if (!t) return t;
      const cx = t.paper_width_mm / 2;
      const cy = t.paper_height_mm / 2;
      if (type === "grade_tick") {
        const grades: ("A" | "B" | "C")[] = ["A", "B", "C"];
        const fields = grades.map((g, i) => ({ ...newField("grade_tick", t.paper_width_mm, t.paper_height_mm, g), x_mm: cx + (i - 1) * 15 }));
        setSelectedFieldId(fields[fields.length - 1].id);
        return { ...t, fields: [...t.fields, ...fields] };
      }
      const f = newField(type, t.paper_width_mm, t.paper_height_mm);
      setSelectedFieldId(f.id);
      return { ...t, fields: [...t.fields, f] };
    });
  }

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    setError(null);
    const { error } = await saveCertificateTemplate({
      feastId: template.feast_id,
      paperWidthMm: template.paper_width_mm,
      paperHeightMm: template.paper_height_mm,
      backgroundImageUrl: template.background_image_url,
      fields: template.fields,
    });
    setSaving(false);
    if (error) { setError(error); return; }
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  async function handlePrintClick() {
    if (!template) return;
    setRosterLoading(true);
    setError(null);
    const { data, error } = await getCertificateRoster(template.feast_id);
    setRosterLoading(false);
    if (error) { setError(error); return; }
    setRoster(data ?? []);
    setConfirmOpen(true);
  }

  function confirmPrint() {
    if (!template || !roster) return;
    openPrintWindow(buildCertificateHtml(template, roster));
    setConfirmOpen(false);
  }

  const selectedField = template.fields.find((f) => f.id === selectedFieldId) ?? null;
  const feastName = feasts.find((f) => f.id === feastId)?.name ?? "";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#A16207] to-[#D97706] text-white">
          <Award className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-neutral-800">Certificates</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 lg:hidden">
        The certificate designer works best on a tablet or larger screen. You can still print the currently saved template below.
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Paper size */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1.5">
          <button onClick={() => patchTemplate({ paper_width_mm: A4.w, paper_height_mm: A4.h })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50">A4</button>
          <button onClick={() => patchTemplate({ paper_width_mm: LETTER.w, paper_height_mm: LETTER.h })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50">Letter</button>
        </div>
        <div className="flex items-end gap-1.5">
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Width (mm)</label>
            <input type="number" className="input w-24" value={template.paper_width_mm} onChange={(e) => patchTemplate({ paper_width_mm: Number(e.target.value) })} />
          </div>
          <span className="pb-1.5 text-neutral-400">×</span>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Height (mm)</label>
            <input type="number" className="input w-24" value={template.paper_height_mm} onChange={(e) => patchTemplate({ paper_height_mm: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      {/* Background */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Background image URL</label>
        <input
          className="input"
          placeholder="https://…/certificate-design.png"
          value={template.background_image_url}
          onChange={(e) => patchTemplate({ background_image_url: e.target.value })}
        />
        {template.background_image_url && (
          <>
            <img
              src={template.background_image_url}
              alt=""
              className="hidden"
              onLoad={(e) => {
                const img = e.currentTarget;
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const paperRatio = template.paper_width_mm / template.paper_height_mm;
                setBgMismatch(Math.abs(imgRatio - paperRatio) / paperRatio > 0.02);
              }}
              onError={() => setBgMismatch(false)}
            />
            {bgMismatch && (
              <p className="mt-1 text-[11px] text-amber-600">Image aspect ratio doesn&apos;t match the paper size — it will stretch to fill.</p>
            )}
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["name", "place", "shakha", "grade_text", "grade_tick"] as CertificateFieldType[]).map((t) => (
          <button key={t} onClick={() => addField(t)} className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-neutral-50">
            <Plus className="h-3 w-3" /> {FIELD_LABELS[t]}{t === "grade_tick" ? " (A/B/C)" : ""}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-4">
        {/* Canvas */}
        <div ref={wrapperRef} className="min-w-0">
          <div
            onClick={() => setSelectedFieldId(null)}
            style={{
              position: "relative",
              width: containerWidthPx,
              height: canvasHeightPx,
              maxWidth: "100%",
              background: "#f4f4f5",
              border: "1px solid #d4d4d8",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {template.background_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={template.background_image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
            )}
            {template.fields.map((f) => (
              <FieldChip
                key={f.id}
                field={f}
                pxPerMm={pxPerMm}
                selected={f.id === selectedFieldId}
                onSelect={() => setSelectedFieldId(f.id)}
                onChange={(patch) => updateField(f.id, patch)}
                onDelete={() => removeField(f.id)}
              />
            ))}
          </div>
        </div>

        {/* Properties panel */}
        <div className="mt-4 lg:mt-0">
          {selectedField ? (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold text-neutral-700">
                {FIELD_LABELS[selectedField.type]}{selectedField.gradeValue ? ` — ${selectedField.gradeValue}` : ""}
              </p>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Font size (pt)</label>
                <input type="number" className="input" min={8} max={72} value={selectedField.font_size_pt} onChange={(e) => updateField(selectedField.id, { font_size_pt: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Color</label>
                <input type="color" className="h-8 w-full rounded border border-neutral-300" value={selectedField.color} onChange={(e) => updateField(selectedField.id, { color: e.target.value })} />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Align</label>
                <div className="flex gap-1">
                  {([{ v: "left", Icon: AlignLeft }, { v: "center", Icon: AlignCenter }, { v: "right", Icon: AlignRight }] as const).map(({ v, Icon }) => (
                    <button
                      key={v}
                      onClick={() => updateField(selectedField.id, { text_align: v })}
                      className={`flex-1 rounded-lg border px-2 py-1.5 ${selectedField.text_align === v ? "border-[#6B46FF] bg-[#6B46FF]/10" : "border-neutral-300"}`}
                    >
                      <Icon className="mx-auto h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => removeField(selectedField.id)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete field
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-neutral-200 p-3 text-xs text-neutral-400">Select a field on the canvas to edit its style, or add one from the toolbar above.</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save Template"}
        </button>
        {savedAt && <span className="text-xs font-medium text-green-600">Saved ✓</span>}
        <button
          onClick={handlePrintClick}
          disabled={rosterLoading || !template.background_image_url}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#A16207,#D97706)" }}
        >
          <Printer className="h-4 w-4" /> {rosterLoading ? "Loading roster…" : "Print Certificates"}
        </button>
      </div>

      {confirmOpen && roster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Print Certificates?</h2>
              <button onClick={() => setConfirmOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {roster.length === 0
                ? `No published results found yet for ${feastName}.`
                : `This will print ${roster.length} certificate${roster.length === 1 ? "" : "s"} for ${feastName}, one per published result.`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm">Cancel</button>
              <button
                onClick={confirmPrint}
                disabled={roster.length === 0}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#A16207,#D97706)" }}
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}
