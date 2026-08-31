import { positionLabel } from "@/lib/result-calculator";
import { PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { CertificateField, CertificateRosterRow, CertificateTemplate } from "@/types";

// Shared by the /admin/certificates designer canvas and the printed output
// (both here and any other print entry point, e.g. the per-competition
// button on /admin/results) so the two stay pixel-for-pixel WYSIWYG.
export function alignTx(align: CertificateField["text_align"]): string {
  return align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
}

// A handful of certificate-appropriate Google Fonts, "Dancing Script" (a
// genuinely curly + bold script) leading the list per the brief. "Custom"
// lets an admin type any other Google Fonts family name.
export interface FontPreset {
  label: string;
  fontFamily: string;
  googleFont: string | null;
}

export const FONT_PRESETS: FontPreset[] = [
  { label: "Arial (Default)", fontFamily: "Arial, Helvetica, sans-serif", googleFont: null },
  { label: "Dancing Script — Curly Bold", fontFamily: "'Dancing Script', cursive", googleFont: "Dancing+Script:wght@700" },
  { label: "Berkshire Swash — Curly Bold", fontFamily: "'Berkshire Swash', cursive", googleFont: "Berkshire+Swash" },
  { label: "Pacifico — Bold Script", fontFamily: "'Pacifico', cursive", googleFont: "Pacifico" },
  { label: "Great Vibes — Elegant Script", fontFamily: "'Great Vibes', cursive", googleFont: "Great+Vibes" },
  { label: "Playfair Display — Elegant Serif", fontFamily: "'Playfair Display', serif", googleFont: "Playfair+Display:wght@700" },
  { label: "Cinzel — Classic Engraved", fontFamily: "'Cinzel', serif", googleFont: "Cinzel:wght@700" },
];

/** Turns a typed Google Fonts family name (e.g. "Open Sans") into a css2 API query segment. */
export function customGoogleFontQuery(name: string): string {
  return `${name.trim().replace(/\s+/g, "+")}:wght@400;700`;
}

/** One <link> href covering every distinct google_font a template's fields use, or null if none need loading. */
export function googleFontsHref(fields: CertificateField[]): string | null {
  const families = [...new Set(fields.map((f) => f.google_font).filter((g): g is string => !!g))];
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

export function fieldContentForRow(field: CertificateField, row: CertificateRosterRow): string {
  if (field.type === "name") return row.name;
  if (field.type === "house_name") return row.houseName;
  // Combined convenience field — "Name (House)" when a house name is set, otherwise just the name.
  if (field.type === "name_house") return row.houseName ? `${row.name} (${row.houseName})` : row.name;
  if (field.type === "place") return row.place ? positionLabel(row.place) : "";
  if (field.type === "shakha") return row.shakhaName;
  if (field.type === "competition") return row.competitionLabel;
  if (field.type === "grade_text") return row.grade ?? "";
  return row.grade === field.gradeValue ? "✓" : ""; // grade_tick
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFieldHtml(field: CertificateField, row: CertificateRosterRow): string {
  if (field.type === "image") {
    if (!field.image_url) return "";
    const w = field.width_mm ?? 30;
    const h = field.height_mm ?? 30;
    return `<div style="position:absolute;left:${field.x_mm}mm;top:${field.y_mm}mm;"><img src="${field.image_url}" alt="" style="display:block;width:${w}mm;height:${h}mm;transform:translate(-50%,-50%) rotate(${field.rotation_deg}deg);" /></div>`;
  }
  const content = fieldContentForRow(field, row);
  if (!content) return "";
  const tx = alignTx(field.text_align);
  return `<div style="position:absolute;left:${field.x_mm}mm;top:${field.y_mm}mm;"><div style="display:inline-block;white-space:nowrap;transform:translate(${tx}, -50%) rotate(${field.rotation_deg}deg);font-size:${field.font_size_pt}pt;color:${field.color};font-family:${field.font_family};">${escHtml(content)}</div></div>`;
}

// The background image is a design-time-only aid — the canvas shows it so
// an admin can align fields against the certificate's real graphics, but
// most orgs print onto paper that already has those graphics pre-printed
// (by a print shop, in bulk), then feed it back through an office printer
// for just the variable text. Printing the background image too would
// print it a second time on top of that pre-printed stock, so the print
// output deliberately omits it — only the field elements are printed.
export function buildCertificateHtml(template: CertificateTemplate, rows: CertificateRosterRow[]): string {
  const sheets = rows
    .map(
      (row) => `<div class="sheet">
    ${template.fields.map((f) => renderFieldHtml(f, row)).join("")}
  </div>`
    )
    .join("");

  const fontsHref = googleFontsHref(template.fields);
  const fontLinks = fontsHref
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${fontsHref}" rel="stylesheet">`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificates</title>${fontLinks}<style>
    @page { size: ${template.paper_width_mm}mm ${template.paper_height_mm}mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { position: relative; width: ${template.paper_width_mm}mm; height: ${template.paper_height_mm}mm; overflow: hidden; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
  </style></head><body>${PRINT_FALLBACK_BUTTON}${sheets}</body></html>`;
}
