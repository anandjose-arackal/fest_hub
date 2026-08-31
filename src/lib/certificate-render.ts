import { positionLabel } from "@/lib/result-calculator";
import { PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { CertificateField, CertificateRosterRow, CertificateTemplate } from "@/types";

// Shared by the /admin/certificates designer canvas and the printed output
// (both here and any other print entry point, e.g. the per-competition
// button on /admin/results) so the two stay pixel-for-pixel WYSIWYG.
export function alignTx(align: CertificateField["text_align"]): string {
  return align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
}

export function fieldContentForRow(field: CertificateField, row: CertificateRosterRow): string {
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

export function buildCertificateHtml(template: CertificateTemplate, rows: CertificateRosterRow[]): string {
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
