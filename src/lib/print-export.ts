// Shared print/PDF-export pattern used across Participants, Participation,
// and Results admin pages: open a blank window, write a full HTML doc,
// auto-trigger print after a short delay, with a .noprint in-page fallback
// button for when the auto-print doesn't fire or the user wants to retry.
export function openPrintWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
  return true;
}

export const PRINT_FALLBACK_BUTTON = `
<button class="noprint" onclick="window.print()" style="position:fixed;top:12px;right:12px;z-index:999;padding:8px 14px;border-radius:8px;border:none;background:#6B46FF;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Print / Save as PDF</button>
<style>@media print { .noprint { display: none !important; } }</style>
`;
