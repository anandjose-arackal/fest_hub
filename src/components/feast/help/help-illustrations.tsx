"use client";

import { Camera, Check, ChevronRight, Church, ClipboardList, ImagePlus, Layers, Pencil, Search, Send, Trophy, Users } from "lucide-react";
import { Medal } from "../feast-ui";
import { WhatsAppIcon } from "../whatsapp-icon";
import { AngelMark } from "../angel/angel-mark";

// Drawn screens for /help — simplified phone mock-ups of the real portal,
// built from the same --fp-* tokens so they repaint with the org's theme.
// The control to press is wrapped in <Tap>: a pulsing ring with a marker.
// Real labels on the controls people look for; plain bars stand in for prose.

export type SceneId =
  | "home-fests" | "fest-actions" | "register-details" | "register-events" | "register-review" | "register-photo"
  | "my-regs" | "edit-remove" | "latest-result" | "results-list" | "poster-share" | "search" | "rankings" | "angel";

const GLASS: React.CSSProperties = {
  background: "var(--fp-panel-bg, var(--fp-surface))",
  border: "1px solid var(--fp-line-2)",
  borderRadius: 12,
};

function Phone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="help-phone m-0 mx-auto w-[210px] shrink-0" aria-label={`Illustration: ${title}`}>
      <div
        className="relative overflow-hidden rounded-[30px] p-2"
        style={{ background: "#0A0718", boxShadow: "0 18px 40px rgba(0,0,0,.35), inset 0 0 0 1.5px rgba(255,255,255,.12)" }}
      >
        <div aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-[14px] w-[70px] -translate-x-1/2 rounded-full" style={{ background: "#0A0718" }} />
        <div className="relative flex h-[340px] flex-col gap-2 overflow-hidden rounded-[24px] px-3 pb-3 pt-6" style={{ background: "var(--fp-page-bg)", color: "var(--fp-ink)" }}>
          {children}
        </div>
      </div>
    </figure>
  );
}

function Bar({ w = "70%", strong }: { w?: string; strong?: boolean }) {
  return <span aria-hidden="true" className="block h-[6px] rounded-full" style={{ width: w, background: strong ? "var(--fp-sub)" : "var(--fp-line-2)" }} />;
}

function Label({ children, size = 10, weight = 800, color }: { children: React.ReactNode; size?: number; weight?: number; color?: string }) {
  return <span className="fp-ml block leading-tight" style={{ fontSize: size, fontWeight: weight, color: color ?? "var(--fp-ink)" }}>{children}</span>;
}

function Btn({ children, variant = "primary", full }: { children: React.ReactNode; variant?: "primary" | "gold" | "ghost" | "whatsapp" | "danger"; full?: boolean }) {
  const style: React.CSSProperties =
    variant === "primary" ? { background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }
      : variant === "gold" ? { background: "var(--fp-cta-gold)", color: "var(--fp-cta-gold-fg)" }
        : variant === "whatsapp" ? { background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff" }
          : variant === "danger" ? { background: "rgba(220,38,38,.14)", color: "#F87171", border: "1px solid rgba(220,38,38,.35)" }
            : { background: "var(--fp-surface-3)", color: "var(--fp-ink)", border: "1px solid var(--fp-line-2)" };
  return (
    <span className={`inline-flex h-7 items-center justify-center gap-1 rounded-[9px] px-2.5 text-[10px] font-extrabold ${full ? "w-full" : ""}`} style={style}>
      {children}
    </span>
  );
}

// The thing to press: a pulsing ring and a small pointer marker.
function Tap({ children, block }: { children: React.ReactNode; block?: boolean }) {
  return (
    <span className={`help-tap relative ${block ? "block" : "inline-block"}`}>
      {children}
      <span aria-hidden="true" className="help-tap-ring pointer-events-none absolute -inset-[4px] rounded-[12px]" />
      <span aria-hidden="true" className="help-tap-dot pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 rounded-full" />
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <span className="flex flex-col gap-1">
      <Label size={8} weight={700} color="var(--fp-sub)">{label}</Label>
      <span className="flex h-6 items-center rounded-[8px] px-2 text-[9.5px] font-bold" style={{ background: "var(--fp-input)", border: "1px solid var(--fp-line-2)" }}>
        {value ?? <Bar w="55%" />}
      </span>
    </span>
  );
}

function Steps({ at }: { at: number }) {
  const labels = ["Details", "Events", "Photo", "Review"];
  return (
    <span className="flex items-center gap-1">
      {labels.map((l, i) => (
        <span key={l} className="flex flex-1 flex-col items-center gap-0.5">
          <span className="h-[5px] w-full rounded-full" style={{ background: i <= at ? "var(--fp-btn)" : "var(--fp-track)" }} />
          <Label size={7} weight={700} color={i === at ? "var(--fp-ink)" : "var(--fp-meta)"}>{l}</Label>
        </span>
      ))}
    </span>
  );
}

function FestCardMock({ tap }: { tap?: boolean }) {
  const card = (
    <span className="flex overflow-hidden" style={{ ...GLASS, borderRadius: 14 }}>
      <span className="flex w-9 flex-col items-center justify-between py-2" style={{ background: "linear-gradient(180deg,#A855F7,#EC4899)" }}>
        <Trophy className="h-3.5 w-3.5 text-white" />
        <Label size={7} color="#fff">2026</Label>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="flex items-center justify-between">
          <span className="rounded-full px-1.5 py-0.5 text-[7px] font-extrabold" style={{ background: "var(--fp-live-bg)", color: "var(--fp-live)" }}>● Ongoing</span>
          <ChevronRight className="h-3 w-3" />
        </span>
        <Label size={11}>കലാ മത്സരം</Label>
        <span className="h-1 rounded-full" style={{ background: "linear-gradient(90deg,#A855F7,#EC4899)", width: "80%" }} />
        <span className="flex gap-2"><Bar w="35%" /><Bar w="25%" /></span>
      </span>
    </span>
  );
  return tap ? <Tap block>{card}</Tap> : card;
}

function AwardRows({ tapWhatsApp }: { tapWhatsApp?: boolean }) {
  const rows: { pos: 1 | 2 | 3; name: string; bg: string }[] = [
    { pos: 1, name: "Siji Varghese", bg: "linear-gradient(120deg,#FFF5D6,#FCE29B)" },
    { pos: 2, name: "Shellymol M C", bg: "linear-gradient(120deg,#F2F7FC,#C2D0E2)" },
    { pos: 3, name: "Sheeba Francis", bg: "linear-gradient(120deg,#FDEDE1,#F4D0B4)" },
  ];
  return (
    <span className="flex flex-col gap-1.5 rounded-[12px] p-1.5" style={{ background: "var(--fp-award-bg)" }}>
      {rows.map((r) => (
        <span key={r.pos} className="flex items-center gap-1.5 rounded-[9px] px-1.5 py-1.5" style={{ background: r.bg, color: "#1E1B4B" }}>
          <Medal pos={r.pos} size={16} />
          <span className="flex flex-1 flex-col"><Label size={8.5} color="#1E1B4B">{r.name}</Label><Label size={7} weight={700} color="#4B31B3">Shakha</Label></span>
          {r.pos === 1 && tapWhatsApp ? (
            <Tap><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white" style={{ color: "#1FAF55" }}><WhatsAppIcon size={11} /></span></Tap>
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white" style={{ color: "#1FAF55" }}><WhatsAppIcon size={11} /></span>
          )}
          <span className="flex h-5 w-5 items-center justify-center rounded-[6px] text-[9px] font-black" style={{ background: "#4B31B3", color: "#FFE08A" }}>A</span>
        </span>
      ))}
    </span>
  );
}

const SCENES: Record<SceneId, { title: string; render: () => React.ReactNode }> = {
  "home-fests": {
    title: "Home — Active Fests",
    render: () => (
      <>
        <Label size={8} weight={700} color="var(--fp-gold-ink)">Fest Portal</Label>
        <Label size={14} color="#FFD66B">രൂപത കലാരവം</Label>
        <span className="mt-1"><Label size={12}>Active Fests</Label></span>
        <FestCardMock tap />
        <FestCardMock />
      </>
    ),
  },
  "fest-actions": {
    title: "Fest page — Register now and My regs",
    render: () => (
      <>
        <Label size={12}>കലാ മത്സരം 2026</Label>
        <Bar w="60%" />
        <span className="mt-1 flex flex-col gap-1.5">
          <Btn variant="ghost" full>Login to register</Btn>
          <Tap block><Btn variant="gold" full><Users className="h-3 w-3" />Register now</Btn></Tap>
        </span>
        <span className="grid grid-cols-3 gap-1.5">
          <span className="flex h-12 flex-col items-center justify-center gap-0.5" style={GLASS}><Layers className="h-3.5 w-3.5" /><Label size={8}>Stages</Label></span>
          <span className="flex h-12 flex-col items-center justify-center gap-0.5" style={GLASS}><Trophy className="h-3.5 w-3.5" /><Label size={8}>Results</Label></span>
          <Tap block><span className="flex h-12 flex-col items-center justify-center gap-0.5" style={GLASS}><ClipboardList className="h-3.5 w-3.5" /><Label size={8}>My regs</Label></span></Tap>
        </span>
        <span className="mt-auto flex flex-col gap-1"><Bar w="80%" /><Bar w="60%" /></span>
      </>
    ),
  },
  "register-details": {
    title: "Register — details",
    render: () => (
      <>
        <Steps at={0} />
        <span className="flex flex-col gap-2 p-2" style={GLASS}>
          <Field label="Full Name" value="Ann Maria Joy" />
          <Field label="House Name" />
          <Field label="Date of Birth" value="14 / 06 / 2010" />
          <span className="self-start rounded-full px-2 py-0.5 text-[8px] font-extrabold" style={{ background: "var(--fp-cat-j)", color: "var(--fp-on-cat)" }}>Junior</span>
          <span className="grid grid-cols-2 gap-1"><Btn variant="ghost">Boy</Btn><Btn>Girl</Btn></span>
        </span>
        <span className="mt-auto"><Tap block><Btn full>Continue</Btn></Tap></span>
      </>
    ),
  },
  "register-events": {
    title: "Register — pick events",
    render: () => (
      <>
        <Steps at={1} />
        {["പ്രസംഗം", "ലളിതഗാനം", "കഥാപ്രസംഗം"].map((n, i) => (
          <span key={n} className="flex items-center gap-2 p-2" style={{ ...GLASS, opacity: i === 2 ? 0.45 : 1 }}>
            <Label size={10}>{n}</Label>
            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-[5px]" style={i === 0 ? { background: "var(--fp-btn)", color: "var(--fp-btn-fg)" } : { border: "1px solid var(--fp-line-2)" }}>
              {i === 0 && <Check className="h-3 w-3" />}
            </span>
          </span>
        ))}
        <Label size={8} weight={700} color="var(--fp-sub)">Up to 2 items. Full items are locked.</Label>
        <span className="mt-auto"><Tap block><Btn full>Continue</Btn></Tap></span>
      </>
    ),
  },
  "register-photo": {
    title: "Register — photo",
    render: () => (
      <>
        <Steps at={2} />
        <span className="flex flex-col items-center gap-2 p-3" style={GLASS}>
          <span className="h-24 w-[72px] rounded-[12px]" style={{ border: "2px dashed var(--fp-line-2)", background: "var(--fp-surface-3)" }} />
          <span className="flex gap-1.5">
            <Tap><Btn><Camera className="h-3 w-3" />Take photo</Btn></Tap>
            <Btn variant="ghost"><ImagePlus className="h-3 w-3" />Choose photo</Btn>
          </span>
        </span>
        <span className="mt-auto"><Btn variant="ghost" full>Skip for now</Btn></span>
      </>
    ),
  },
  "register-review": {
    title: "Register — review and confirm",
    render: () => (
      <>
        <Steps at={3} />
        <span className="flex flex-col gap-2 p-2.5" style={GLASS}>
          {["Name", "House Name", "Date of Birth", "Category"].map((k) => (
            <span key={k} className="flex items-center justify-between"><Label size={8} weight={700} color="var(--fp-sub)">{k}</Label><Bar w="40%" strong /></span>
          ))}
          <span className="flex gap-1"><span className="rounded-full px-1.5 py-0.5 text-[7.5px] font-bold" style={{ background: "var(--fp-surface-3)" }}>പ്രസംഗം</span></span>
        </span>
        <span className="mt-auto"><Tap block><Btn variant="gold" full>Confirm Registration</Btn></Tap></span>
      </>
    ),
  },
  "my-regs": {
    title: "My regs",
    render: () => (
      <>
        <span className="flex items-center justify-between"><Label size={12}>My regs</Label><Tap><Btn variant="ghost">Download</Btn></Tap></span>
        {["പ്രസംഗം · Junior", "ലളിതഗാനം · Senior"].map((g, gi) => (
          <span key={g} className="flex flex-col gap-1.5 p-2" style={GLASS}>
            <Label size={9}>{g}</Label>
            {[0, 1].map((r) => (
              <span key={r} className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full" style={{ background: "var(--fp-surface-3)" }} />
                <span className="flex flex-1 flex-col gap-0.5"><Bar w="60%" strong /><Bar w="40%" /></span>
                {gi === 0 && r === 0 ? <Tap><Pencil className="h-3.5 w-3.5" /></Tap> : <Pencil className="h-3.5 w-3.5 opacity-60" />}
              </span>
            ))}
          </span>
        ))}
      </>
    ),
  },
  "edit-remove": {
    title: "Edit registration",
    render: () => (
      <>
        <Label size={12}>Edit · കലാ മത്സരം</Label>
        <span className="flex flex-col gap-2 p-2" style={GLASS}>
          <Field label="Full Name" value="Ann Maria Joy" />
          <Field label="House Name" />
        </span>
        <Btn full>Save Changes</Btn>
        <span className="mt-auto flex flex-col gap-1.5">
          <Tap block><Btn variant="danger" full>Remove Registration</Btn></Tap>
          <span className="grid grid-cols-2 gap-1"><Btn variant="ghost">Cancel</Btn><Btn variant="danger">Yes, Delete</Btn></span>
        </span>
      </>
    ),
  },
  "latest-result": {
    title: "Home — Latest Result",
    render: () => (
      <>
        <Label size={12}>Latest Result</Label>
        <span className="flex flex-col gap-1.5 rounded-[14px] p-2" style={{ background: "var(--fp-award-bg)", color: "#1E1B4B" }}>
          <Label size={11} color="#1E1B4B">പ്രസംഗം</Label>
          <span className="flex gap-1"><span className="rounded-full px-1.5 py-0.5 text-[7px] font-bold" style={{ background: "rgba(255,255,255,.7)", color: "#4B31B3" }}>Elder · Girls</span></span>
          <AwardRows tapWhatsApp />
        </span>
      </>
    ),
  },
  "results-list": {
    title: "Results page",
    render: () => (
      <>
        <Label size={13}>Fest Results</Label>
        <span className="flex gap-1">{["Sub Jr", "Junior", "Senior", "Elder"].map((c, i) => (
          <span key={c} className="rounded-[7px] px-1.5 py-1 text-[7.5px] font-extrabold" style={i === 1 ? { background: "var(--fp-cat-j)", color: "var(--fp-on-cat)" } : { background: "var(--fp-surface-3)" }}>{c}</span>
        ))}</span>
        <Tap block>
          <span className="flex items-center gap-1.5 p-2" style={GLASS}>
            <span className="flex flex-1 flex-col gap-1"><Label size={10}>പ്രസംഗം</Label><Label size={7.5} weight={700} color="var(--fp-gold-ink)">Results out</Label></span>
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Tap>
        {["ലളിതഗാനം", "കഥാപ്രസംഗം"].map((n) => (
          <span key={n} className="flex items-center gap-1.5 p-2" style={GLASS}>
            <span className="flex flex-1 flex-col gap-1"><Label size={10}>{n}</Label><Bar w="40%" /></span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </span>
        ))}
      </>
    ),
  },
  "poster-share": {
    title: "Winner poster — share",
    render: () => (
      <>
        <Label size={11}>Share Your Result</Label>
        <span className="mx-auto flex h-[210px] w-[150px] flex-col items-center gap-1.5 rounded-[8px] p-2" style={{ background: "linear-gradient(170deg,#FFF8EC,#F3E2C6)", color: "#7A1730" }}>
          <Label size={8} color="#7A1730">ചെറുപുഷ്പ മിഷൻലീഗ്</Label>
          <Label size={10} color="#7A1730">രൂപത കലാമത്സരം</Label>
          <span className="h-[90px] w-[70px] rounded-[6px] bg-white" style={{ boxShadow: "0 2px 6px rgba(0,0,0,.2)" }} />
          <Medal pos={1} size={18} />
          <Label size={8} color="#7A1730">SIJI VARGHESE</Label>
        </span>
        <span className="mt-auto flex flex-col gap-1.5">
          <Tap block><Btn variant="whatsapp" full><WhatsAppIcon size={11} />Share on WhatsApp</Btn></Tap>
          <span className="grid grid-cols-2 gap-1"><Btn variant="ghost">Add Photo</Btn><Btn variant="ghost">Download</Btn></span>
        </span>
      </>
    ),
  },
  search: {
    title: "Search",
    render: () => (
      <>
        <Label size={13}>Search</Label>
        <Tap block>
          <span className="flex h-8 items-center gap-1.5 rounded-[10px] px-2" style={{ background: "var(--fp-input)", border: "1px solid var(--fp-line-2)" }}>
            <Search className="h-3.5 w-3.5" /><Label size={9.5} weight={700}>Siji</Label>
          </span>
        </Tap>
        {[0, 1].map((i) => (
          <span key={i} className="flex flex-col gap-1 p-2" style={GLASS}>
            <span className="flex items-center justify-between"><Label size={10}>{i === 0 ? "Siji Varghese" : "Siji Thomas"}</Label><span className="fp-num text-[8px]">F14{i}5</span></span>
            <span className="flex items-center gap-1"><Church className="h-2.5 w-2.5" /><Bar w="45%" /></span>
            <span className="flex items-center gap-1"><Label size={8} weight={700}>പ്രസംഗം</Label>{i === 0 && <Medal pos={1} size={12} />}</span>
          </span>
        ))}
      </>
    ),
  },
  rankings: {
    title: "Rankings",
    render: () => (
      <>
        <Label size={13}>Leaderboard</Label>
        <Tap block>
          <span className="grid grid-cols-2 gap-1 rounded-full p-0.5" style={{ background: "var(--fp-surface-3)" }}>
            <span className="rounded-full py-1 text-center text-[8px] font-extrabold" style={{ background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)" }}>Shakha</span>
            <span className="py-1 text-center text-[8px] font-extrabold">Meghala</span>
          </span>
        </Tap>
        {([[1, "Kottiyoor", 210], [2, "Kallody", 193], [3, "Chungakkunnu", 178]] as const).map(([p, n, pts]) => (
          <span key={n} className="flex items-center gap-1.5 p-2" style={GLASS}>
            <Medal pos={p} size={16} /><Label size={10}>{n}</Label>
            <span className="fp-num ml-auto text-[12px]" style={{ color: "var(--fp-gold-ink)" }}>{pts}</span>
          </span>
        ))}
      </>
    ),
  },
  angel: {
    title: "Angel assistant",
    render: () => (
      <>
        <span className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}><AngelMark size={16} /></span>
          <Label size={11}>Angel</Label>
        </span>
        <span className="self-end rounded-[12px] rounded-br-[4px] px-2 py-1.5 text-[9px] font-bold" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>top meghala</span>
        <span className="flex flex-col gap-1 rounded-[12px] rounded-bl-[4px] p-2" style={{ background: "var(--fp-surface-3)", border: "1px solid var(--fp-line)" }}>
          <Label size={8.5} weight={700}>Top meghalas in all fests:</Label>
          {([[1, "Chungakkunnu", 644], [2, "Manimooly", 623]] as const).map(([p, n, pts]) => (
            <span key={n} className="flex items-center gap-1"><Medal pos={p} size={12} /><Label size={8.5}>{n}</Label><span className="fp-num ml-auto text-[9px]">{pts}</span></span>
          ))}
        </span>
        <span className="mt-auto flex items-center gap-1">
          <span className="flex h-7 flex-1 items-center rounded-[9px] px-2 text-[8.5px] font-bold" style={{ background: "var(--fp-input)", border: "1px solid var(--fp-line-2)", color: "var(--fp-meta)" }}>Name, reg no, shakha…</span>
          <Tap><span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}><Send className="h-3 w-3" /></span></Tap>
        </span>
      </>
    ),
  },
};

export function HelpScene({ id }: { id: SceneId }) {
  const scene = SCENES[id];
  return <Phone title={scene.title}>{scene.render()}</Phone>;
}
