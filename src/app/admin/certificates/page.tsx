"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ChangeEvent } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Award, Printer, Trash2, X,
  Upload, ImagePlus, Sparkles, FileImage, Type,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCertificateRoster, getCertificateTemplate, saveCertificateTemplate, uploadCertificateAsset } from "@/actions/certificates";
import { openPrintWindow } from "@/lib/print-export";
import { alignTx, buildCertificateHtml, customGoogleFontQuery, FONT_PRESETS, googleFontsHref } from "@/lib/certificate-render";
import type { CertificateField, CertificateFieldType, CertificateRosterRow, CertificateTemplate, Feast } from "@/types";

const A4 = { w: 210, h: 297 };
const LETTER = { w: 215.9, h: 279.4 };
const MAX_CANVAS_PX = 700;

const FIELD_LABELS: Record<CertificateFieldType, string> = {
  name: "Participant Name",
  place: "Place",
  shakha: "Shakha",
  competition: "Competition Name",
  grade_text: "Grade",
  grade_tick: "Grade tick",
  image: "Signature / Image",
};

const FIELD_TOOLBAR: { type: CertificateFieldType; label: string; emoji: string; color: string }[] = [
  { type: "name", label: "Name", emoji: "👤", color: "#2563EB" },
  { type: "place", label: "Place", emoji: "🥇", color: "#D97706" },
  { type: "shakha", label: "Shakha", emoji: "🏫", color: "#0D9488" },
  { type: "competition", label: "Competition", emoji: "🎭", color: "#7C3AED" },
  { type: "grade_text", label: "Grade", emoji: "🔤", color: "#16A34A" },
  { type: "grade_tick", label: "Grade Tick", emoji: "✅", color: "#DB2777" },
];

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
    font_family: FONT_PRESETS[0].fontFamily,
    google_font: FONT_PRESETS[0].googleFont,
    gradeValue,
  };
}

// Fields saved before Google Fonts support was added (font_family/
// google_font didn't exist yet) come back from the DB without those
// properties — back-fill them so every downstream read (canvas, properties
// panel, print HTML) can rely on font_family always being a string.
function normalizeTemplate(t: CertificateTemplate): CertificateTemplate {
  return {
    ...t,
    fields: t.fields.map((f) => ({
      ...f,
      font_family: f.font_family ?? FONT_PRESETS[0].fontFamily,
      google_font: f.google_font ?? FONT_PRESETS[0].googleFont,
    })),
  };
}

function newImageField(paperW: number, paperH: number, url: string, widthMm: number, heightMm: number): CertificateField {
  return {
    ...newField("image", paperW, paperH),
    image_url: url,
    width_mm: widthMm,
    height_mm: heightMm,
  };
}

function fieldPreviewContent(field: CertificateField): string {
  if (field.type === "name") return "Participant Name";
  if (field.type === "place") return "1st";
  if (field.type === "shakha") return "Shakha";
  if (field.type === "competition") return "Sub Junior Boys Elocution";
  if (field.type === "grade_text") return "A";
  return field.gradeValue ?? "✓"; // grade_tick
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(((reader.result as string) || "").split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: 200, height: 100 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// ─── Draggable/rotatable/resizable field chip ──────────────────────────────

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
  const resizeRef = useRef<{ startX: number; w0: number; h0: number } | null>(null);

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

  const onResizePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, w0: field.width_mm ?? 30, h0: field.height_mm ?? 30 };
  };
  const onResizePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const { startX, w0, h0 } = resizeRef.current;
    const dxMm = (e.clientX - startX) / pxPerMm;
    const scale = Math.max(0.15, (w0 + dxMm) / w0);
    onChange({ width_mm: w0 * scale, height_mm: h0 * scale });
  };
  const onResizePointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const outline = selected ? "1.5px dashed #6B46FF" : "1px dashed rgba(107,70,255,0.25)";

  if (field.type === "image") {
    const w = (field.width_mm ?? 30) * pxPerMm;
    const h = (field.height_mm ?? 30) * pxPerMm;
    return (
      <div style={{ position: "absolute", left: field.x_mm * pxPerMm, top: field.y_mm * pxPerMm }}>
        <div
          ref={innerRef}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
          style={{
            position: "relative", width: w, height: h,
            transform: `translate(-50%, -50%) rotate(${field.rotation_deg}deg)`,
            cursor: "grab", touchAction: "none", outline, borderRadius: 4,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={field.image_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }} />
          {selected && (
            <>
              <div
                onPointerDown={onRotatePointerDown}
                onPointerMove={onRotatePointerMove}
                onPointerUp={onRotatePointerUp}
                title="Drag to rotate — hold Shift to snap to 15°"
                style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: "#6B46FF", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)", cursor: "grab", touchAction: "none" }}
              />
              <div
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                title="Drag to resize"
                style={{ position: "absolute", bottom: -8, right: -8, width: 14, height: 14, borderRadius: 4, background: "#6B46FF", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)", cursor: "nwse-resize", touchAction: "none" }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Delete"
                style={{ position: "absolute", top: -22, right: -22, width: 18, height: 18, borderRadius: "50%", background: "#DC2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
              >
                <Trash2 style={{ width: 10, height: 10 }} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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
          fontFamily: field.font_family,
          color: field.color,
          cursor: "grab",
          padding: "2px 5px",
          userSelect: "none",
          touchAction: "none",
          borderRadius: 4,
          outline,
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

// ─── A friendly card wrapper used throughout the page ──────────────────────

function StepCard({ step, emoji, title, children }: { step: number; emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A16207] to-[#D97706] text-sm font-bold text-white">{step}</span>
        <h2 className="text-sm font-bold text-neutral-800 sm:text-base">{emoji} {title}</h2>
      </div>
      {children}
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
  const [bgUploading, setBgUploading] = useState(false);
  const [sigUploading, setSigUploading] = useState(false);

  const [roster, setRoster] = useState<CertificateRosterRow[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(MAX_CANVAS_PX);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);

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
      setTemplate(normalizeTemplate(data ?? emptyTemplate(feastId)));
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

  // Keeps one <link> in <head> up to date with whichever Google Fonts the
  // template's fields currently use, so the canvas preview renders the
  // actual chosen font (not just a fallback) — matches what the printed
  // output will look like.
  useEffect(() => {
    const href = template ? googleFontsHref(template.fields) : null;
    const id = "certificate-google-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!href) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [template]);

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

  async function handleBackgroundFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !template) return;
    setBgUploading(true);
    setError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const { url, error } = await uploadCertificateAsset(template.feast_id, file.name, base64, file.type);
      if (error || !url) { setError(error ?? "Upload failed."); return; }
      patchTemplate({ background_image_url: url });
    } finally {
      setBgUploading(false);
    }
  }

  async function handleSignatureFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !template) return;
    setSigUploading(true);
    setError(null);
    try {
      const [base64, size] = await Promise.all([readFileAsBase64(file), readImageSize(file)]);
      const { url, error } = await uploadCertificateAsset(template.feast_id, file.name, base64, file.type);
      if (error || !url) { setError(error ?? "Upload failed."); return; }
      const aspect = size.width / size.height || 1;
      const widthMm = 40;
      setTemplate((t) => {
        if (!t) return t;
        const f = newImageField(t.paper_width_mm, t.paper_height_mm, url, widthMm, widthMm / aspect);
        setSelectedFieldId(f.id);
        return { ...t, fields: [...t.fields, f] };
      });
    } finally {
      setSigUploading(false);
    }
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
  const selectedFieldPreset = selectedField ? FONT_PRESETS.find((p) => p.fontFamily === selectedField.font_family) : undefined;
  const selectedFieldCustomName = selectedField && !selectedFieldPreset ? (selectedField.font_family.match(/^'([^']*)'/)?.[1] ?? "") : "";
  const feastName = feasts.find((f) => f.id === feastId)?.name ?? "";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#A16207] to-[#D97706] text-white shadow-sm">
          <Award className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-800">Certificate Designer</h1>
          <p className="text-xs text-neutral-500">Design one certificate, print it for everyone 🎉</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 lg:hidden">
        📱 The designer works best on a tablet or bigger screen. You can still print your saved design below.
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">⚠️ {error}</p>}

      <StepCard step={1} emoji="📄" title="Pick a paper size">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5">
            <button onClick={() => patchTemplate({ paper_width_mm: A4.w, paper_height_mm: A4.h })} className="rounded-xl border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:border-[#D97706] hover:text-[#D97706]">A4</button>
            <button onClick={() => patchTemplate({ paper_width_mm: LETTER.w, paper_height_mm: LETTER.h })} className="rounded-xl border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:border-[#D97706] hover:text-[#D97706]">Letter</button>
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
      </StepCard>

      <StepCard step={2} emoji="🖼️" title="Add your certificate background">
        <div className="flex flex-wrap gap-2">
          <input ref={bgFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundFile} />
          <button
            onClick={() => bgFileInputRef.current?.click()}
            disabled={bgUploading}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#7C3AED,#A855F7)" }}
          >
            <Upload className="h-4 w-4" /> {bgUploading ? "Uploading…" : "Upload a Picture"}
          </button>
          <span className="flex items-center text-xs text-neutral-400">or</span>
        </div>
        <input
          className="input mt-2"
          placeholder="Paste an image URL instead — https://…/certificate-design.png"
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
              <p className="mt-1.5 text-[11px] text-amber-600">Heads up — this image's shape doesn't quite match your paper size, so it'll stretch a little to fill it.</p>
            )}
          </>
        )}
      </StepCard>

      <StepCard step={3} emoji="🏷️" title="Add fields — drag them onto your certificate">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {FIELD_TOOLBAR.map((f) => (
            <button
              key={f.type}
              onClick={() => addField(f.type)}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-2 py-3 text-center transition-transform hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: `${f.color}30` }}
            >
              <span className="text-2xl">{f.emoji}</span>
              <span className="text-[11px] font-bold" style={{ color: f.color }}>{f.label}</span>
            </button>
          ))}
          <input ref={sigFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureFile} />
          <button
            onClick={() => sigFileInputRef.current?.click()}
            disabled={sigUploading}
            className="flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
            style={{ borderColor: "#EA580C30", background: "#FFF7ED" }}
          >
            <span className="text-2xl">✍️</span>
            <span className="text-[11px] font-bold text-[#EA580C]">{sigUploading ? "Uploading…" : "Signature"}</span>
          </button>
        </div>
      </StepCard>

      <StepCard step={4} emoji="🎨" title="Arrange, style and print">
        <div className="lg:grid lg:grid-cols-[1fr_230px] lg:gap-4">
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
                border: "2px solid #e4e4e7",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {template.background_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={template.background_image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-300">
                  <FileImage className="h-10 w-10" />
                  <p className="text-xs font-medium">Add a background above to get started</p>
                </div>
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
            <p className="mt-2 text-[11px] text-neutral-400">💡 Tap a field to select it, drag to move, use the purple dot to spin it{template.fields.some((f) => f.type === "image") ? ", and the little square to resize a picture" : ""}.</p>
          </div>

          {/* Properties panel */}
          <div className="mt-4 lg:mt-0">
            {selectedField ? (
              <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                  <Sparkles className="h-3.5 w-3.5 text-[#A16207]" />
                  {FIELD_LABELS[selectedField.type]}{selectedField.gradeValue ? ` — ${selectedField.gradeValue}` : ""}
                </p>
                {selectedField.type === "image" ? (
                  <p className="text-[11px] text-neutral-400">Drag the picture to move it, the purple dot to rotate it, or the little square in the corner to resize it.</p>
                ) : (
                  <>
                    <div>
                      <label className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-neutral-500"><Type className="h-3 w-3" /> Font</label>
                      <select
                        className="input"
                        value={selectedFieldPreset ? selectedFieldPreset.fontFamily : "custom"}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            updateField(selectedField.id, { font_family: "'', sans-serif", google_font: null });
                          } else {
                            const preset = FONT_PRESETS.find((p) => p.fontFamily === e.target.value)!;
                            updateField(selectedField.id, { font_family: preset.fontFamily, google_font: preset.googleFont });
                          }
                        }}
                      >
                        {FONT_PRESETS.map((p) => (
                          <option key={p.fontFamily} value={p.fontFamily}>{p.label}</option>
                        ))}
                        <option value="custom">Custom Google Font…</option>
                      </select>
                      {!selectedFieldPreset && (
                        <input
                          className="input mt-1.5"
                          placeholder="Type a Google Fonts name, e.g. Open Sans"
                          value={selectedFieldCustomName}
                          onChange={(e) => {
                            const name = e.target.value;
                            updateField(selectedField.id, {
                              font_family: name ? `'${name}', sans-serif` : "'', sans-serif",
                              google_font: name ? customGoogleFontQuery(name) : null,
                            });
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Font size (pt)</label>
                      <input type="number" className="input" min={8} max={72} value={selectedField.font_size_pt} onChange={(e) => updateField(selectedField.id, { font_size_pt: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-neutral-500">Color</label>
                      <input type="color" className="h-9 w-full rounded-lg border border-neutral-300" value={selectedField.color} onChange={(e) => updateField(selectedField.id, { color: e.target.value })} />
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
                  </>
                )}
                <button onClick={() => removeField(selectedField.id)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100">
                  <Trash2 className="h-3.5 w-3.5" /> Delete this field
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-5 text-center">
                <ImagePlus className="h-6 w-6 text-neutral-300" />
                <p className="text-xs text-neutral-400">Tap a field on the certificate to style it, or add one from step 3 above.</p>
              </div>
            )}
          </div>
        </div>
      </StepCard>

      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl border-2 border-neutral-200 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 hover:border-neutral-300 disabled:opacity-50">
          {saving ? "Saving…" : "💾 Save My Design"}
        </button>
        {savedAt && <span className="text-xs font-bold text-green-600">Saved ✓</span>}
        <button
          onClick={handlePrintClick}
          disabled={rosterLoading || !template.background_image_url}
          className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#A16207,#D97706)" }}
        >
          <Printer className="h-4 w-4" /> {rosterLoading ? "Loading roster…" : "Print All Certificates!"}
        </button>
      </div>

      {confirmOpen && roster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">🖨️ Print Certificates?</h2>
              <button onClick={() => setConfirmOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {roster.length === 0
                ? `No published results found yet for ${feastName}.`
                : `This will print ${roster.length} certificate${roster.length === 1 ? "" : "s"} for ${feastName}, one per published result.`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 rounded-xl border-2 border-neutral-200 py-2 text-sm font-semibold">Cancel</button>
              <button
                onClick={confirmPrint}
                disabled={roster.length === 0}
                className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#A16207,#D97706)" }}
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.65rem; border: 2px solid #e4e4e7; padding: 0.55rem 0.8rem; font-size: 0.8125rem; }
        .input:focus { outline: none; border-color: #A16207; }
      `}</style>
    </div>
  );
}
