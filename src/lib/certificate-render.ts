import { PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { CertificateField, CertificateFieldType, CertificateRosterRow, CertificateTemplate } from "@/types";

// Shared by the /admin/certificates designer canvas and the printed output
// (both here and any other print entry point, e.g. the per-competition
// button on /admin/results) so the two stay pixel-for-pixel WYSIWYG.
export function alignTx(align: CertificateField["text_align"]): string {
  return align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
}

// font_size_pt is a print size — 1pt = 25.4/72 mm. Every renderer that
// works in px (designer canvas, PDF rasterizer) scales through this so a
// "paragraph" field wraps at the same words everywhere.
export const MM_PER_PT = 25.4 / 72;

export const PARAGRAPH_DEFAULT_LINE_HEIGHT = 1.4;

// The {placeholders} a "paragraph" field's text can carry. Each one renders
// exactly like the standalone field of the same source type, so wording
// ("First with A Grade", Title Casing, …) stays identical either way.
export const PARAGRAPH_TOKENS: { token: string; label: string; source: CertificateFieldType }[] = [
  { token: "name", label: "Name", source: "name" },
  { token: "house", label: "House", source: "house_name" },
  { token: "name_house", label: "Name + House", source: "name_house" },
  { token: "shakha", label: "Shakha", source: "shakha" },
  { token: "meghala", label: "Meghala", source: "meghala" },
  { token: "shakha_meghala", label: "Shakha - Meghala", source: "shakha_meghala" },
  { token: "place", label: "Place", source: "place" },
  { token: "grade", label: "Grade", source: "grade_text" },
  { token: "place_grade", label: "Place with Grade", source: "place_grade" },
  { token: "place_grade_short", label: "Place & Grade", source: "place_grade_short" },
  { token: "competition", label: "Competition", source: "competition" },
  { token: "competition_en", label: "Competition (EN)", source: "competition_en" },
];

export const PARAGRAPH_DEFAULT_TEXT =
  "This certificate is proudly presented to {name} of {shakha} in recognition of securing {place_grade} in {competition}.";

export interface ParagraphSegment {
  text: string;
  /** True for a filled-in {placeholder}, false for the admin's literal wording. */
  data: boolean;
}

/** Splits a paragraph template into literal text and filled-in placeholders. Unknown {tokens} stay as typed, so a typo is visible on the canvas. */
export function paragraphSegments(text: string, valueFor: (source: CertificateFieldType) => string): ParagraphSegment[] {
  const segments: ParagraphSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const token = PARAGRAPH_TOKENS.find((t) => t.token === m[1]);
    if (!token) continue;
    if (m.index > last) segments.push({ text: text.slice(last, m.index), data: false });
    segments.push({ text: valueFor(token.source), data: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), data: false });
  return segments;
}

/** Inline HTML for a paragraph's segments (escaped) — shared by the print HTML and the PDF rasterizer. */
export function paragraphInnerHtml(field: CertificateField, segments: ParagraphSegment[]): string {
  return segments
    // font-family:inherit — the print HTML's `* { font-family: Arial }` reset would otherwise hit this span directly.
    .map((s) => (s.data && field.bold_data ? `<span style="font-weight:700;font-family:inherit">${escHtml(s.text)}</span>` : escHtml(s.text)))
    .join("");
}

// The wrapping box itself: centered on (x_mm, y_mm) like every other field,
// width_mm wide, growing up and down as a longer name/competition adds a
// line. pre-line keeps the admin's own line breaks but collapses the double
// space an empty placeholder (e.g. no house name) would leave behind.
export function paragraphBoxStyle(field: CertificateField): string {
  return `width:${field.width_mm ?? 150}mm;white-space:pre-line;overflow-wrap:break-word;text-align:${field.text_align};line-height:${field.line_height ?? PARAGRAPH_DEFAULT_LINE_HEIGHT};transform:translate(-50%, -50%) rotate(${field.rotation_deg}deg);font-size:${field.font_size_pt}pt;color:${field.color};font-family:${field.font_family};`;
}

// Certificate-only wording — spelled out ("First"/"Second"/"Third") rather
// than result-calculator.ts's positionLabel ("1st"/"2nd"/"3rd"), which stays
// as-is for /admin/results' listing and print sheet. Certificates read like
// a formal document; those other screens are compact data tables.
function certificatePositionLabel(pos: number | null): string {
  if (pos === 1) return "First";
  if (pos === 2) return "Second";
  if (pos === 3) return "Third";
  return "";
}

// A handful of certificate-appropriate Google Fonts, "Dancing Script" (a
// genuinely curly + bold script) leading the list per the brief. "Custom"
// lets an admin type any other Google Fonts family name.
export interface FontPreset {
  label: string;
  fontFamily: string;
  googleFont: string | null;
  // Groups the selector: Latin display/script faces vs. fonts with full
  // Malayalam script coverage (names, house names, competition names).
  group: "English" | "Malayalam";
}

export const FONT_PRESETS: FontPreset[] = [
  { label: "Arial (Default)", fontFamily: "Arial, Helvetica, sans-serif", googleFont: null, group: "English" },
  { label: "Dancing Script — Curly Bold", fontFamily: "'Dancing Script', cursive", googleFont: "Dancing+Script:wght@700", group: "English" },
  { label: "Berkshire Swash — Curly Bold", fontFamily: "'Berkshire Swash', cursive", googleFont: "Berkshire+Swash", group: "English" },
  { label: "Pacifico — Bold Script", fontFamily: "'Pacifico', cursive", googleFont: "Pacifico", group: "English" },
  { label: "Great Vibes — Elegant Script", fontFamily: "'Great Vibes', cursive", googleFont: "Great+Vibes", group: "English" },
  { label: "Playfair Display — Elegant Serif", fontFamily: "'Playfair Display', serif", googleFont: "Playfair+Display:wght@700", group: "English" },
  { label: "Cinzel — Classic Engraved", fontFamily: "'Cinzel', serif", googleFont: "Cinzel:wght@700", group: "English" },
  // Malayalam — every Google Fonts family with Malayalam script support.
  { label: "Noto Sans Malayalam — Clean Sans", fontFamily: "'Noto Sans Malayalam', sans-serif", googleFont: "Noto+Sans+Malayalam:wght@400;700", group: "Malayalam" },
  { label: "Noto Serif Malayalam — Book Serif", fontFamily: "'Noto Serif Malayalam', serif", googleFont: "Noto+Serif+Malayalam:wght@400;700", group: "Malayalam" },
  { label: "Anek Malayalam — Modern Sans", fontFamily: "'Anek Malayalam', sans-serif", googleFont: "Anek+Malayalam:wght@400;700", group: "Malayalam" },
  { label: "Baloo Chettan 2 — Rounded Bold", fontFamily: "'Baloo Chettan 2', sans-serif", googleFont: "Baloo+Chettan+2:wght@400;700", group: "Malayalam" },
  { label: "Manjari — Soft Rounded", fontFamily: "'Manjari', sans-serif", googleFont: "Manjari:wght@400;700", group: "Malayalam" },
  { label: "Gayathri — Light Sans", fontFamily: "'Gayathri', sans-serif", googleFont: "Gayathri:wght@400;700", group: "Malayalam" },
  { label: "Chilanka — Handwritten", fontFamily: "'Chilanka', cursive", googleFont: "Chilanka", group: "Malayalam" },
  { label: "Arima — Display Serif", fontFamily: "'Arima', serif", googleFont: "Arima:wght@400;700", group: "Malayalam" },
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

// Participants are often registered in ALL-CAPS or all-lowercase — certificates read better Title Cased.
function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export function fieldContentForRow(field: CertificateField, row: CertificateRosterRow): string {
  if (field.type === "name") return toTitleCase(row.name);
  if (field.type === "house_name") return toTitleCase(row.houseName);
  // Combined convenience field — "Name House" when a house name is set, otherwise just the name.
  if (field.type === "name_house") return row.houseName ? `${toTitleCase(row.name)} ${toTitleCase(row.houseName)}` : toTitleCase(row.name);
  if (field.type === "place") return certificatePositionLabel(row.place);
  // Place and grade in one line — "First with A Grade" / "First & A". Either
  // part alone when the row only has one (an unplaced grade, or a place with
  // no grade).
  if (field.type === "place_grade" || field.type === "place_grade_short") {
    const place = certificatePositionLabel(row.place);
    const grade = row.grade ?? "";
    if (place && grade) return field.type === "place_grade" ? `${place} with ${grade} Grade` : `${place} & ${grade}`;
    if (place) return place;
    if (grade) return field.type === "place_grade" ? `${grade} Grade` : grade;
    return "";
  }
  if (field.type === "shakha") return row.shakhaName;
  if (field.type === "meghala") return row.meghalaName;
  // "Shakha - Meghala" — just the shakha when it isn't placed in a meghala.
  if (field.type === "shakha_meghala") return [row.shakhaName, row.meghalaName].filter(Boolean).join(" - ");
  if (field.type === "competition") return row.competitionLabel;
  if (field.type === "competition_en") return row.competitionLabelEn;
  if (field.type === "grade_text") return row.grade ?? "";
  if (field.type === "custom_text") return field.text ?? "";
  if (field.type === "paragraph") return paragraphSegmentsForRow(field, row).map((s) => s.text).join("");
  return row.grade === field.gradeValue ? "✓" : ""; // grade_tick
}

export function paragraphSegmentsForRow(field: CertificateField, row: CertificateRosterRow): ParagraphSegment[] {
  return paragraphSegments(field.text ?? "", (source) => fieldContentForRow({ ...field, type: source }, row));
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
  if (field.type === "paragraph") {
    const segments = paragraphSegmentsForRow(field, row);
    if (!segments.some((s) => s.text.trim())) return "";
    return `<div style="position:absolute;left:${field.x_mm}mm;top:${field.y_mm}mm;"><div style="${paragraphBoxStyle(field)}">${paragraphInnerHtml(field, segments)}</div></div>`;
  }
  const content = fieldContentForRow(field, row);
  if (!content) return "";
  const tx = alignTx(field.text_align);
  return `<div style="position:absolute;left:${field.x_mm}mm;top:${field.y_mm}mm;"><div style="display:inline-block;white-space:nowrap;transform:translate(${tx}, -50%) rotate(${field.rotation_deg}deg);font-size:${field.font_size_pt}pt;color:${field.color};font-family:${field.font_family};">${escHtml(content)}</div></div>`;
}

// The background image is only ever a design-time aid by default — most
// orgs print onto paper that already has the certificate graphics
// pre-printed (by a print shop, in bulk), then feed it back through an
// office printer for just the variable text, so printing the background
// image too would print it a second time on top of that pre-printed stock.
// includeBackground opts into printing it anyway, for orgs that print the
// whole thing (background + fields) on plain paper in one pass.
export function buildCertificateHtml(template: CertificateTemplate, rows: CertificateRosterRow[], includeBackground = false): string {
  const bgHtml =
    includeBackground && template.background_image_url
      ? `<img class="bg" src="${template.background_image_url}" alt="" />`
      : "";
  const sheets = rows
    .map(
      (row) => `<div class="sheet">
    ${bgHtml}
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
    .sheet .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  </style></head><body>${PRINT_FALLBACK_BUTTON}${sheets}</body></html>`;
}
