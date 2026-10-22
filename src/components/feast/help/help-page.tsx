"use client";

import { useEffect, useState } from "react";
import { HELP_GUIDES, HELP_HEADER, type Lang } from "./help-content";
import { HelpScene } from "./help-illustrations";
import { AngelMark } from "../angel/angel-mark";
import { OPEN_ANGEL_EVENT } from "../angel/angel-events";

// /help — the Fest Portal's guides. One section per task, each step with a
// drawn screen (help-illustrations.tsx) showing what to tap. Sections are
// anchored (/help#register) so Angel and links can jump straight to one.

const LANG_KEY = "fp-help-lang";

export function HelpPage() {
  const [lang, setLang] = useState<Lang>("en");
  const header = HELP_HEADER[lang];

  // The saved language is read after the first paint (the server render has
  // no localStorage), the same way the search page restores recent queries.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(LANG_KEY);
        if (saved === "ml" || saved === "en") setLang(saved);
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function chooseLang(l: Lang) {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
  }

  return (
    <div className="pb-10 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h1 className="fp-disp m-0 text-[44px] sm:text-[56px]">{header.title}</h1>
          <p className="m-0 mt-2 max-w-[56ch] text-[14px] font-semibold leading-relaxed" style={{ color: "var(--fp-sub)" }}>{header.subtitle}</p>
        </div>
        <div className="inline-flex rounded-full p-1" role="group" aria-label="Language" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line-2)" }}>
          {(["en", "ml"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => chooseLang(l)}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
              style={lang === l ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)" } : { color: "var(--fp-sub)" }}
            >
              {l === "en" ? "EN" : "മലയാളം"}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-6 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Index — chips on phones, a sticky list beside the guides on desktop */}
        <nav aria-label={header.index} className="lg:sticky lg:top-6">
          <p className="m-0 mb-2 px-1 text-[12px] font-extrabold" style={{ color: "var(--fp-meta)" }}>{header.index}</p>
          <ul className="fp-scroll m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 lg:flex-col lg:overflow-visible">
            {HELP_GUIDES.map((g) => {
              const Icon = g.icon;
              return (
                <li key={g.id} className="shrink-0">
                  <a
                    href={`#${g.id}`}
                    className="fp-ml flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-bold lg:rounded-[14px] lg:whitespace-normal"
                    style={{ background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)", color: "var(--fp-ink)" }}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--fp-primary-light)" }} aria-hidden="true" />
                    {g.title[lang]}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-5 flex flex-col gap-5 lg:mt-0">
          {HELP_GUIDES.map((g) => {
            const Icon = g.icon;
            return (
              <section
                key={g.id}
                id={g.id}
                aria-labelledby={`${g.id}-title`}
                className="fp-glass-edge scroll-mt-6 rounded-[24px] p-4 sm:p-6"
                style={{ background: "var(--fp-panel-bg, var(--fp-surface))", border: "1px solid var(--fp-panel-line, var(--fp-line-2))", boxShadow: "var(--fp-card-glow, none)" }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={`${g.id}-title`} className="fp-ml m-0 text-[21px] font-extrabold leading-tight sm:text-[24px]">{g.title[lang]}</h2>
                    <p className="m-0 mt-1 text-[13px] font-semibold" style={{ color: "var(--fp-sub)" }}>{g.summary[lang]}</p>
                  </div>
                </div>

                <ol className="m-0 mt-5 flex list-none flex-col gap-6 p-0">
                  {g.steps.map((s, i) => (
                    <li key={i} className={s.scene ? "flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_210px] md:items-center md:gap-8" : ""}>
                      <div className="flex gap-3">
                        <span className="fp-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px]" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line-2)", color: "var(--fp-gold-ink)" }}>{i + 1}</span>
                        <p className="fp-ml m-0 pt-1 text-[15px] font-semibold leading-relaxed" style={{ maxWidth: "62ch" }}>{s[lang]}</p>
                      </div>
                      {s.scene && <HelpScene id={s.scene} />}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}

          <section className="flex flex-wrap items-center gap-4 rounded-[24px] p-5" style={{ background: "var(--fp-surface-3)", border: "1px dashed var(--fp-line-2)" }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>
              <AngelMark size={30} />
            </span>
            <p className="m-0 min-w-0 flex-1 text-[14px] font-semibold" style={{ color: "var(--fp-sub)", minWidth: "200px" }}>{header.askAngelHint}</p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_ANGEL_EVENT))}
              className="rounded-full px-5 py-2.5 text-[14px] font-extrabold"
              style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}
            >
              {header.askAngel}
            </button>
          </section>
        </div>
      </div>

      <style>{`
        .help-tap-ring { border: 2px solid var(--fp-gold); box-shadow: 0 0 0 0 rgba(245, 197, 66, .55); animation: helpTap 1.6s ease-out infinite; }
        .help-tap-dot { background: var(--fp-gold); box-shadow: 0 0 0 3px rgba(0, 0, 0, .25), 0 0 12px rgba(245, 197, 66, .8); }
        @keyframes helpTap { 0% { box-shadow: 0 0 0 0 rgba(245, 197, 66, .55); } 70% { box-shadow: 0 0 0 8px rgba(245, 197, 66, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 197, 66, 0); } }
        @media (prefers-reduced-motion: reduce) { .help-tap-ring { animation: none; } }
      `}</style>
    </div>
  );
}
