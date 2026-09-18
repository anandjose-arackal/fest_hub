"use client";

import { useState } from "react";
import { X, ChevronDown, UserPlus, Trash2, ClipboardList, FileDown } from "lucide-react";

// Plain --fp-* var references, not feast-shared.tsx's `theme` object — this
// file is imported BY feast-shared.tsx (ProfileMenu opens HelpSheet), so
// importing `theme` back from there would create a cycle.
const theme = {
  text: "var(--fp-ink)",
  sub: "var(--fp-sub)",
  faint: "var(--fp-faint)",
  purple: "var(--fp-primary)",
  fillStrong: "rgba(var(--fp-primary-rgb), 0.10)",
  hairline: "rgba(var(--fp-primary-rgb), 0.12)",
};

type Lang = "en" | "ml";

interface HelpTopic {
  icon: typeof UserPlus;
  question: string;
  steps: string[];
}

// Quoted UI labels ("View Details", "Login to Register", "My Regs", …) are
// left in English in BOTH languages — the app's own buttons never localize,
// so a translated label here would send someone looking for text that
// doesn't exist on screen.
const HELP_TOPICS: Record<Lang, HelpTopic[]> = {
  en: [
    {
      icon: UserPlus,
      question: "How to Register",
      steps: [
        "On the Fest Portal home, find the fest card (e.g. \"കലാമത്സരം 2026\") and tap \"View Details\".",
        "If you're not signed in yet, tap \"Login to Register\" and sign in with your Shakha, Meghala or Diocese admin login (whichever level your org is set up for).",
        "Once signed in, tap \"Register Now\".",
        "Fill in the participant's name, house name, date of birth, gender and phone.",
        "Pick the Shakha (or search it, if your login covers more than one).",
        "Choose up to 2 individual competitions that match the category and gender.",
        "Review the details on the last step and tap \"Confirm Registration\".",
        "Save the registration number shown on the success screen — you'll need it to look the entry up later.",
      ],
    },
    {
      icon: ClipboardList,
      question: "How to See My Registrations",
      steps: [
        "Tap \"View Details\" on the fest card, then tap the \"My Regs\" tile.",
        "Sign in with your Shakha, Meghala or Diocese admin login if asked.",
        "Every registration for your Shakha is listed grouped by competition — tap a row to expand it.",
      ],
    },
    {
      icon: Trash2,
      question: "How to Delete a Registration",
      steps: [
        "Go to \"My Regs\" and find the participant.",
        "Tap the pencil (edit) icon next to their entry.",
        "On the edit page, tap \"Remove Registration\".",
        "Confirm by tapping \"Yes, Delete\" — this permanently removes the participant and their competition entries.",
      ],
    },
    {
      icon: FileDown,
      question: "How to Download PDF from My Registrations",
      steps: [
        "Go to \"My Regs\" for the fest.",
        "Tap the \"Download\" button at the top of the list.",
        "A printable registration sheet opens in a new tab.",
        "Use \"Print / Save as PDF\" and choose \"Save as PDF\" as the destination.",
      ],
    },
  ],
  ml: [
    {
      icon: UserPlus,
      question: "എങ്ങനെ രജിസ്റ്റർ ചെയ്യാം",
      steps: [
        "Fest Portal ഹോം പേജിൽ ഫെസ്റ്റ് കാർഡ് കണ്ടെത്തുക (ഉദാ. \"കലാമത്സരം 2026\") എന്നിട്ട് \"View Details\" ടാപ്പ് ചെയ്യുക.",
        "നിങ്ങൾ ഇതുവരെ സൈൻ ഇൻ ചെയ്തിട്ടില്ലെങ്കിൽ, \"Login to Register\" ടാപ്പ് ചെയ്ത് നിങ്ങളുടെ ശാഖ, മേഖല അല്ലെങ്കിൽ രൂപതാ അഡ്മിൻ ലോഗിൻ ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുക.",
        "സൈൻ ഇൻ ചെയ്ത ശേഷം \"Register Now\" ടാപ്പ് ചെയ്യുക.",
        "പങ്കാളിയുടെ പേര്, വീട്ടുപേര്, ജനനത്തീയതി, ലിംഗം, ഫോൺ നമ്പർ എന്നിവ പൂരിപ്പിക്കുക.",
        "ശാഖ തിരഞ്ഞെടുക്കുക (നിങ്ങളുടെ ലോഗിൻ ഒന്നിലധികം ശാഖകൾ ഉൾക്കൊള്ളുന്നെങ്കിൽ തിരയുക).",
        "പ്രായവിഭാഗത്തിനും ലിംഗത്തിനും യോജിക്കുന്ന പരമാവധി 2 വ്യക്തിഗത മത്സരങ്ങൾ തിരഞ്ഞെടുക്കുക.",
        "അവസാന ഘട്ടത്തിൽ വിവരങ്ങൾ പരിശോധിച്ച് \"Confirm Registration\" ടാപ്പ് ചെയ്യുക.",
        "വിജയ സ്ക്രീനിൽ കാണിക്കുന്ന രജിസ്ട്രേഷൻ നമ്പർ സേവ് ചെയ്യുക — പിന്നീട് എൻട്രി കണ്ടെത്താൻ ഇത് ആവശ്യമാണ്.",
      ],
    },
    {
      icon: ClipboardList,
      question: "എന്റെ രജിസ്ട്രേഷനുകൾ എങ്ങനെ കാണാം",
      steps: [
        "ഫെസ്റ്റ് കാർഡിൽ \"View Details\" ടാപ്പ് ചെയ്ത്, എന്നിട്ട് \"My Regs\" ടൈൽ ടാപ്പ് ചെയ്യുക.",
        "ചോദിച്ചാൽ നിങ്ങളുടെ ശാഖ, മേഖല അല്ലെങ്കിൽ രൂപതാ അഡ്മിൻ ലോഗിൻ ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുക.",
        "നിങ്ങളുടെ ശാഖയുടെ എല്ലാ രജിസ്ട്രേഷനുകളും മത്സരം അനുസരിച്ച് ഗ്രൂപ്പ് ചെയ്ത് പട്ടികപ്പെടുത്തിയിരിക്കുന്നു — വിശദാംശങ്ങൾക്ക് ഒരോ പട്ടികയും തുറന്നു കാണാം.",
      ],
    },
    {
      icon: Trash2,
      question: "ഒരു രജിസ്ട്രേഷൻ എങ്ങനെ ഡിലീറ്റ് ചെയ്യാം",
      steps: [
        "\"My Regs\" ലേക്ക് പോയി പങ്കാളിയെ കണ്ടെത്തുക.",
        "അവരുടെ എൻട്രിക്ക് അരികിലുള്ള പെൻസിൽ (എഡിറ്റ്) ഐക്കൺ ടാപ്പ് ചെയ്യുക.",
        "എഡിറ്റ് പേജിൽ \"Remove Registration\" ടാപ്പ് ചെയ്യുക.",
        "\"Yes, Delete\" ടാപ്പ് ചെയ്ത് സ്ഥിരീകരിക്കുക — ഇത് പങ്കാളിയെയും അവരുടെ മത്സര എൻട്രികളെയും സ്ഥിരമായി നീക്കം ചെയ്യും.",
      ],
    },
    {
      icon: FileDown,
      question: "എന്റെ രജിസ്ട്രേഷനുകളിൽ നിന്ന് PDF എങ്ങനെ ഡൗൺലോഡ് ചെയ്യാം",
      steps: [
        "ഫെസ്റ്റിന്റെ \"My Regs\" പേജിലേക്ക് പോകുക.",
        "പട്ടികയുടെ മുകളിലുള്ള \"Download\" ബട്ടൺ ടാപ്പ് ചെയ്യുക.",
        "പ്രിന്റ് ചെയ്യാവുന്ന ഒരു രജിസ്ട്രേഷൻ ഷീറ്റ് ഒരു പുതിയ ടാബിൽ തുറക്കും.",
        "\"Print / Save as PDF\" ഉപയോഗിച്ച് \"Save as PDF\" ഡെസ്റ്റിനേഷനായി തിരഞ്ഞെടുക്കുക.",
      ],
    },
  ],
};

const HEADER_TEXT: Record<Lang, { title: string; subtitle: string }> = {
  en: { title: "Help", subtitle: "Quick answers for the Fest Portal" },
  ml: { title: "സഹായം", subtitle: "Fest Portal-നെക്കുറിച്ചുള്ള പെട്ടെന്നുള്ള മറുപടികൾ" },
};

function TopicRow({ topic, open, onToggle }: { topic: HelpTopic; open: boolean; onToggle: () => void }) {
  const Icon = topic.icon;
  return (
    <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${theme.hairline}` }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
        style={{ background: open ? theme.fillStrong : "transparent" }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: theme.fillStrong }}>
          <Icon className="h-4 w-4" style={{ color: theme.purple }} />
        </span>
        <span className="flex-1 text-[13.5px] font-semibold" style={{ color: theme.text }}>{topic.question}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: theme.faint, transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && (
        <ol className="space-y-1.5 px-4 pb-3.5 pt-1">
          {topic.steps.map((step, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: theme.text }}>
              <span className="shrink-0 font-bold" style={{ color: theme.purple }}>{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const OPTIONS: { value: Lang; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "ml", label: "മലയാളം" },
  ];
  return (
    <div className="mb-4 inline-flex rounded-full p-1" style={{ background: theme.fillStrong }}>
      {OPTIONS.map((o) => {
        const active = lang === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
            style={active ? { background: theme.purple, color: "#fff" } : { color: theme.sub }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── HelpSheet — Fest Portal's "how do I…" reference, opened from
// ProfileMenu's Help entry (feast-shared.tsx). Same bottom-sheet shell as
// LoginSheet, just with an accordion of static how-to steps instead of a
// form — there's no CMS/DB-backed help content anywhere in this app, so this
// is plain hardcoded copy, same as every other static UI string. The
// English/Malayalam switch only swaps the explanatory prose — quoted UI
// labels inside each step stay in English in both languages, since that's
// what's actually printed on the buttons.
export function HelpSheet({ onClose }: { onClose: () => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [lang, setLang] = useState<Lang>("en");
  const header = HEADER_TEXT[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-6 sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>{header.title}</h2>
            <p className="text-sm" style={{ color: theme.sub }}>{header.subtitle}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: theme.fillStrong }}>
            <X className="h-4 w-4" style={{ color: theme.sub }} />
          </button>
        </div>

        <LangSwitch lang={lang} onChange={setLang} />

        <div className="space-y-2.5">
          {HELP_TOPICS[lang].map((topic, i) => (
            <TopicRow key={i} topic={topic} open={openIndex === i} onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))} />
          ))}
        </div>
      </div>
    </div>
  );
}
