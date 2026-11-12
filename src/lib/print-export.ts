// Shared print/PDF-export pattern used across Participants, Participation,
// and Results admin pages: open a blank window, write a full HTML doc,
// auto-trigger print after a short delay, with a .noprint in-page fallback
// button for when the auto-print doesn't fire or the user wants to retry.
export function openPrintWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  // A page that paginates itself (PRINT_PAGINATE_SCRIPT) sets __printReady=false
  // while it works; print once it flips to true (or after 5s, whatever happens).
  const started = Date.now();
  const tick = () => {
    const ready = (w as Window & { __printReady?: boolean }).__printReady;
    if (ready === false && Date.now() - started < 5000) {
      setTimeout(tick, 100);
      return;
    }
    w.focus();
    w.print();
  };
  setTimeout(tick, 350);
  return true;
}

export const PRINT_FALLBACK_BUTTON = `
<button class="noprint" onclick="window.print()" style="position:fixed;top:12px;right:12px;z-index:999;padding:8px 14px;border-radius:8px;border:none;background:#6B46FF;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Print / Save as PDF</button>
<style>@media print { .noprint { display: none !important; } }</style>
`;

// Browsers print the page URL ("about:blank") and title in the page margins.
// `@page { margin: 0 }` removes that text but also the margins, so
// wrapPrintPages() puts them back as repeating spacer rows (a table's
// thead/tfoot repeat on every printed page). Put PRINT_PAGE_CSS last in the
// document's <style> and wrap the body content with wrapPrintPages().
export const PRINT_PAGE_CSS = `
@page { margin: 0; }
.pg { width: 100%; border-collapse: collapse; }
.pg > thead > tr > td, .pg > tfoot > tr > td { padding: 0; border: 0; background: none !important; }
.pg .sp { height: 12mm; }
.pg > tbody > tr { break-inside: auto !important; page-break-inside: auto !important; }
.pg > tbody > tr > td { padding: 0 8mm; border: 0; background: none !important; }
.page { break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.stagebox { flex-shrink: 0; text-align: center; padding: 6px 16px 8px; border-radius: 12px; background: #4C1D95; color: #fff; }
.stagebox span { display: block; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }
.stagebox b { display: block; font-size: 30px; font-weight: 800; line-height: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; background: #EDE9FE; color: #4C1D95; }
.chip.pagechip { background: #FDE68A; color: #78350F; }
.tbl { border: 1px solid #C4B5FD; border-radius: 8px; overflow: hidden; }
td.loc { min-width: 26mm; }
td.loc .l1 { font-weight: 600; }
td.loc .l2 { font-size: 10.5px; color: #6B7280; margin-top: 1px; }
`;

export function wrapPrintPages(html: string): string {
  return `<table class="pg"><thead><tr><td><div class="sp"></div></td></tr></thead><tfoot><tr><td><div class="sp"></div></td></tr></tfoot><tbody><tr><td>${html}</td></tr></tbody></table>`;
}

// Splits each .sheet (competition heading + table or team blocks) into real
// pages by measuring row heights, so every page of an item repeats the item's
// heading with a "Page k of n" chip. Page height is 270mm of content (the
// 12mm top/bottom spacers from wrapPrintPages make up the rest of an A4).
// Marks window.__printReady so openPrintWindow waits for it. Set
// data-per-page on <body> to start every item on a fresh page.
export const PRINT_PAGINATE_SCRIPT = `<script>
window.__printReady = false;
window.addEventListener("load", function () {
  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fonts.then(run).catch(function () {}).then(function () { window.__printReady = true; });
});
function run() {
  var holder = document.querySelector(".pg > tbody > tr > td");
  if (!holder) return;
  var sheets = [].slice.call(holder.children).filter(function (n) { return n.classList.contains("sheet"); });
  if (!sheets.length) return;
  document.body.style.width = "210mm";
  var perPage = document.body.hasAttribute("data-per-page");
  var probe = document.createElement("div");
  probe.style.cssText = "height:270mm;width:210mm;position:absolute;visibility:hidden";
  document.body.appendChild(probe);
  var PH = probe.getBoundingClientRect().height;
  var pageW = probe.getBoundingClientRect().width;
  probe.remove();
  // Content wider than the page (e.g. a long no-wrap name) makes the browser
  // shrink the whole printout to fit, so each page holds proportionally more.
  var docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docW > pageW) PH = PH * (docW / pageW);
  var GAP = 22;
  var outer = function (el) {
    var cs = getComputedStyle(el);
    return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  };
  var pages = [[]];
  var used = 0;
  var newPage = function () { pages.push([]); used = 0; };
  var cur = function () { return pages[pages.length - 1]; };
  sheets.forEach(function (sh) {
    var hdr = sh.querySelector(".hdr");
    var table = sh.querySelector(".tbl > table");
    var units = table ? [].slice.call(table.tBodies[0].rows) : [].slice.call(sh.querySelectorAll(".team-block"));
    if (perPage && cur().length) newPage();
    if (!hdr || !units.length) {
      var wh = outer(sh);
      if (used + wh > PH && cur().length) newPage();
      cur().push({ node: sh });
      used += wh + GAP;
      return;
    }
    var C = outer(hdr) + (table && table.tHead ? table.tHead.getBoundingClientRect().height : 0) + 4;
    var heights = units.map(outer);
    var total = C + heights.reduce(function (a, b) { return a + b; }, 0);
    if (cur().length && (used + C + heights[0] > PH || (used + total > PH && total <= PH))) newPage();
    var entry = { sheet: sh, hdr: hdr, table: table, units: [] };
    cur().push(entry);
    var group = { entries: [entry] };
    var chunkUsed = C;
    units.forEach(function (u, i) {
      if (used + chunkUsed + heights[i] > PH && entry.units.length) {
        newPage();
        entry = { sheet: sh, hdr: hdr, table: table, units: [] };
        group.entries.push(entry);
        cur().push(entry);
        chunkUsed = C;
      }
      entry.units.push(u);
      chunkUsed += heights[i];
    });
    entry.group = group;
    group.entries.forEach(function (e) { e.group = group; });
    used += chunkUsed + GAP;
  });
  var frag = document.createDocumentFragment();
  pages.forEach(function (p) {
    if (!p.length) return;
    var page = document.createElement("div");
    page.className = "page";
    p.forEach(function (e) {
      if (e.node) { page.appendChild(e.node); return; }
      var n = e.group.entries.length;
      var k = e.group.entries.indexOf(e) + 1;
      var sec = e.sheet.cloneNode(false);
      var h = e.hdr.cloneNode(true);
      if (n > 1) {
        var chip = document.createElement("span");
        chip.className = "chip pagechip";
        chip.textContent = "Page " + k + " of " + n;
        (h.querySelector(".chips") || h.firstElementChild || h).appendChild(chip);
      }
      sec.appendChild(h);
      if (e.table) {
        var wrap = e.sheet.querySelector(".tbl").cloneNode(false);
        var t = e.table.cloneNode(false);
        if (e.table.tHead) t.appendChild(e.table.tHead.cloneNode(true));
        var tb = document.createElement("tbody");
        e.units.forEach(function (r) { tb.appendChild(r.cloneNode(true)); });
        t.appendChild(tb);
        wrap.appendChild(t);
        sec.appendChild(wrap);
      } else {
        e.units.forEach(function (b) { sec.appendChild(b.cloneNode(true)); });
      }
      page.appendChild(sec);
    });
    frag.appendChild(page);
  });
  holder.innerHTML = "";
  holder.appendChild(frag);
}
</script>`;

export function escHtml(v: string | null | undefined): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
