import { jsPDF } from "jspdf";
import { toJpeg } from "html-to-image";
import { alignTx, fieldContentForRow } from "./certificate-render";
import type { CertificateField, CertificateRosterRow, CertificateTemplate } from "@/types";

// Direct PDF generation, bypassing window.print()/the OS print dialog
// entirely. That dialog's paper-size + orientation controls vary wildly by
// browser and OS (some, like Windows' "Microsoft Print to PDF", don't even
// expose a landscape option or a custom size), so relying on an admin to set
// them correctly every time was fragile — the page always ends up sized and
// oriented exactly like template.paper_width_mm/paper_height_mm instead,
// no dialog involved. Each sheet is rasterized off-screen at high
// resolution via html-to-image (already a dependency, used by the poster
// generator) and dropped into a jsPDF page at that page's real mm size.

const PX_PER_MM = 6; // ~150 DPI equivalent — sharp enough for print
// JPEG, not PNG: a photo background at PNG's lossless encoding runs into the
// tens of MB *per certificate* (a 300-certificate roster would be
// multiple GB and would hang the browser tab generating it). JPEG at this
// quality is visually indistinguishable for a certificate and keeps a whole
// roster's PDF in the single-digit MB range.
const JPEG_QUALITY = 0.85;

function renderFieldNode(field: CertificateField, row: CertificateRosterRow, pxPerMm: number): HTMLDivElement | null {
  const anchor = document.createElement("div");
  anchor.style.position = "absolute";
  anchor.style.left = `${field.x_mm * pxPerMm}px`;
  anchor.style.top = `${field.y_mm * pxPerMm}px`;

  if (field.type === "image") {
    if (!field.image_url) return null;
    const w = (field.width_mm ?? 30) * pxPerMm;
    const h = (field.height_mm ?? 30) * pxPerMm;
    const img = document.createElement("img");
    img.src = field.image_url;
    img.crossOrigin = "anonymous";
    img.style.display = "block";
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate(-50%, -50%) rotate(${field.rotation_deg}deg)`;
    anchor.appendChild(img);
    return anchor;
  }

  const content = fieldContentForRow(field, row);
  if (!content) return null;
  const inner = document.createElement("div");
  inner.style.display = "inline-block";
  inner.style.whiteSpace = "nowrap";
  inner.style.transform = `translate(${alignTx(field.text_align)}, -50%) rotate(${field.rotation_deg}deg)`;
  inner.style.fontSize = `${field.font_size_pt * (pxPerMm * 25.4 / 72)}px`; // pt -> px at this render's effective DPI
  inner.style.color = field.color;
  inner.style.fontFamily = field.font_family;
  inner.textContent = content;
  anchor.appendChild(inner);
  return anchor;
}

// html-to-image's default font-embedding walks document.styleSheets and
// reads each one's .cssRules to inline @font-face declarations (as base64,
// so the isolated SVG it rasterizes from doesn't need a live network fetch)
// into the image it generates. Reading .cssRules on a cross-origin
// stylesheet the browser hasn't been told to fetch with CORS throws a
// SecurityError — exactly what the Google Fonts <link> in page.tsx is, even
// though Google's CSS endpoint itself sends Access-Control-Allow-Origin: *
// (fixed by that link's crossOrigin="anonymous", see page.tsx). Don't
// override this with a manually-fetched fontEmbedCSS string: that CSS still
// references the font files by their original https://fonts.gstatic.com
// url()s, and the SVG-to-canvas rasterization step doesn't reliably wait on
// those remote fetches — confirmed by direct reproduction, it silently
// falls back to a system font instead of erroring. Letting html-to-image do
// its own base64 embedding (now that crossOrigin unblocks it) is what
// actually produces the right font in the output.
//
// What IS still needed explicitly: forcing the browser to have the fonts
// loaded via the Font Loading API before rasterizing at all — otherwise
// html-to-image's cssRules scan can run before the @font-face this admin
// just picked has finished downloading, and again silently falls back.
async function ensureFontsLoaded(fields: CertificateField[]): Promise<void> {
  const families = [...new Set(fields.map((f) => f.font_family))];
  await Promise.all(families.map((family) => document.fonts.load(`16px ${family}`).catch(() => undefined)));
  await document.fonts.ready;
}

// The actual cause of blank/empty pages: setting an <img>'s src starts an
// async load, but html-to-image was being called immediately after — if the
// background photo (or a signature/image field) hadn't finished decoding
// yet, the capture came back completely blank (not just missing that one
// image — confirmed by direct reproduction). Every <img> in the sheet must
// finish loading (success or failure) before rasterizing.
function waitForImages(root: HTMLElement): Promise<void[]> {
  return Promise.all(
    Array.from(root.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) { resolve(); return; }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

async function rasterizeSheet(
  template: CertificateTemplate,
  row: CertificateRosterRow,
  includeBackground: boolean,
  pxPerMm: number
): Promise<string> {
  const w = template.paper_width_mm * pxPerMm;
  const h = template.paper_height_mm * pxPerMm;

  const sheet = document.createElement("div");
  sheet.style.position = "fixed";
  // Real viewport coordinates (0,0) with a negative z-index, NOT
  // left:-99999px or visibility:hidden — confirmed by direct testing that
  // both of those make the browser skip painting this element's <img>s
  // entirely (they load over the network, img.onload fires, but never get
  // decoded into a paintable layer), which is what produced silently blank
  // certificates with no error. z-index:-1 tucks it behind the page's own
  // opaque background (see layout.tsx's bg-[#FAFAFC]) instead, so the
  // browser still treats and paints it as a normal on-screen element.
  sheet.style.left = "0";
  sheet.style.top = "0";
  sheet.style.zIndex = "-1";
  sheet.style.width = `${w}px`;
  sheet.style.height = `${h}px`;
  sheet.style.overflow = "hidden";
  sheet.style.background = "#fff";
  sheet.style.fontFamily = "Arial, Helvetica, sans-serif";

  if (includeBackground && template.background_image_url) {
    const bg = document.createElement("img");
    bg.src = template.background_image_url;
    bg.crossOrigin = "anonymous";
    bg.style.position = "absolute";
    bg.style.inset = "0";
    bg.style.width = "100%";
    bg.style.height = "100%";
    bg.style.objectFit = "fill";
    sheet.appendChild(bg);
  }

  for (const field of template.fields) {
    const node = renderFieldNode(field, row, pxPerMm);
    if (node) sheet.appendChild(node);
  }

  document.body.appendChild(sheet);
  try {
    await ensureFontsLoaded(template.fields);
    await waitForImages(sheet);
    return await toJpeg(sheet, { width: w, height: h, pixelRatio: 1, backgroundColor: "#ffffff", quality: JPEG_QUALITY });
  } finally {
    sheet.remove();
  }
}

export async function downloadCertificatesPdf(
  template: CertificateTemplate,
  rows: CertificateRosterRow[],
  includeBackground: boolean,
  feastName: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const orientation = template.paper_width_mm >= template.paper_height_mm ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: [template.paper_width_mm, template.paper_height_mm], compress: true });

  for (let i = 0; i < rows.length; i++) {
    const dataUrl = await rasterizeSheet(template, rows[i], includeBackground, PX_PER_MM);
    if (i > 0) doc.addPage([template.paper_width_mm, template.paper_height_mm], orientation);
    doc.addImage(dataUrl, "JPEG", 0, 0, template.paper_width_mm, template.paper_height_mm);
    onProgress?.(i + 1, rows.length);
  }

  const safeName = feastName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "certificates";
  doc.save(`${safeName}-certificates.pdf`);
}
