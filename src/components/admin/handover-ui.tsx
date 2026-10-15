"use client";

// Shared pieces for the /admin/trophies screens. The screens sit inside the
// admin shell but paint their content with the Feast Portal's theme tokens
// (--fp-*, via `theme` and the fp- utility classes), so medals, grade badges
// and winner rows look exactly like the public results listing — and follow
// the org's portal theme, dark themes included.

import { useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { theme, mix } from "@/components/feast/feast-shared";
import type { HandoverGroup, HandoverStamp } from "@/lib/handover";

export function HandoverPanel({ children }: { children: ReactNode }) {
  return (
    <div
      className="fp-shell -mx-4 min-h-[calc(100dvh-128px)] px-4 py-5 sm:mx-0 sm:rounded-3xl sm:px-6 md:min-h-[calc(100dvh-48px)]"
      style={{ background: theme.pageBg, color: theme.text, fontFamily: theme.ui }}
    >
      {children}
    </div>
  );
}

export function PageHeading({ icon, title, sub, right }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)" }}>
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl" style={{ color: theme.text }}>{title}</h1>
          {sub && <p className="truncate text-xs font-semibold" style={{ color: theme.sub }}>{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl ${className ?? ""}`} style={{ background: theme.surface, border: `1px solid ${theme.line}`, boxShadow: theme.shadow, ...style }}>
      {children}
    </div>
  );
}

// ── Status groups ──────────────────────────────────────────────────────

export const GROUP_STYLE: Record<HandoverGroup, { label: string; hint: string; accent: string; badgeBg: string; badgeFg: string }> = {
  ready: {
    label: "Ready",
    hint: "Published & printed — trophies still to give",
    accent: "#F59E0B",
    badgeBg: "var(--fp-warn-bg)",
    badgeFg: "var(--fp-warn)",
  },
  not_printed: {
    label: "Not printed",
    hint: "Published, but not printed — handover locked",
    accent: "#64748B",
    badgeBg: "var(--fp-muted-bg)",
    badgeFg: "var(--fp-muted-fg)",
  },
  done: {
    label: "All done",
    hint: "Every trophy for this item is given",
    accent: "#16A34A",
    badgeBg: "var(--fp-ok-bg)",
    badgeFg: "var(--fp-ok)",
  },
};

export function GroupBadge({ group, small }: { group: HandoverGroup; small?: boolean }) {
  const g = GROUP_STYLE[group];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-extrabold ${small ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]"}`}
      style={{ background: g.badgeBg, color: g.badgeFg }}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: g.accent }} />
      {g.label}
    </span>
  );
}

export function GroupLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] font-semibold" style={{ color: theme.sub }}>
      {(Object.keys(GROUP_STYLE) as HandoverGroup[]).map((g) => (
        <span key={g} className="inline-flex items-center gap-2">
          <span className="h-3.5 w-1.5 rounded-full" style={{ background: GROUP_STYLE[g].accent }} />
          <span>
            <span className="font-extrabold" style={{ color: theme.text }}>{GROUP_STYLE[g].label}</span>
            <span className="hidden sm:inline"> — {GROUP_STYLE[g].hint}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Stamps ─────────────────────────────────────────────────────────────

export function formatStampTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/** "Given 3:42 pm by Anu · collected by Joseph (98…)" */
export function StampLine({ stamp, verb = "Given" }: { stamp: HandoverStamp; verb?: string }) {
  return (
    <span className="text-[11.5px] font-semibold leading-snug" style={{ color: theme.sub }}>
      {verb} {formatStampTime(stamp.handedOverAt)}
      {stamp.handedOverByName && <> by {stamp.handedOverByName}</>}
      {stamp.receiverName && (
        <>
          {" · "}collected by <span className="font-extrabold" style={{ color: theme.text }}>{stamp.receiverName}</span>
          {stamp.receiverPhone && <> ({stamp.receiverPhone})</>}
        </>
      )}
    </span>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────

export const BUTTON_CLASS =
  "inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-extrabold transition-opacity disabled:cursor-not-allowed disabled:opacity-45";

export function buttonStyle(tone: "primary" | "ghost" | "danger"): React.CSSProperties {
  return tone === "primary"
    ? { background: "var(--fp-btn)", color: "var(--fp-btn-fg)", border: "1px solid transparent" }
    : tone === "danger"
      ? { background: "transparent", color: "#DC2626", border: `1px solid ${mix("#DC2626", 40)}` }
      : { background: theme.surface, color: theme.sub, border: `1px solid ${theme.line2}` };
}

export function ActionButton({
  children, onClick, disabled, title, tone = "primary", busy, className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "primary" | "ghost" | "danger";
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`${BUTTON_CLASS} ${className ?? ""}`}
      style={buttonStyle(tone)}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "var(--fp-scrim)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fp-shell relative w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl"
        style={{ background: "var(--fp-sheet)", color: theme.text, fontFamily: theme.ui, boxShadow: theme.shadow }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-extrabold leading-snug">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: theme.sub }}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { background: "var(--fp-input)", border: `1px solid ${theme.line2}`, color: theme.text };

export function TextField({ label, value, onChange, placeholder, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-extrabold" style={{ color: theme.sub }}>
        {label}{required && <span style={{ color: "#DC2626" }}> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={type === "tel" ? "tel" : undefined}
        className="h-11 w-full rounded-xl px-3 text-sm font-semibold outline-none"
        style={inputStyle}
      />
    </label>
  );
}

export interface MarkDialogResult {
  receiverName: string;
  receiverPhone: string;
  withCertificate: boolean;
}

/**
 * Mark-received dialog. `receiverRequired` (bulk certificate handover):
 * name + phone are mandatory. Otherwise they're optional — only filled when
 * someone other than the winner collects it. `certificateOption` shows the
 * "certificate handed over too" tick (trophies).
 */
export function MarkDialog({
  title, subtitle, receiverRequired, certificateOption, onCancel, onConfirm,
}: {
  title: string;
  subtitle?: ReactNode;
  receiverRequired?: boolean;
  certificateOption?: boolean;
  onCancel: () => void;
  onConfirm: (r: MarkDialogResult) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [withCertificate, setWithCertificate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = receiverRequired && (!name.trim() || !phone.trim());

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onConfirm({ receiverName: name, receiverPhone: phone, withCertificate });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={title} onClose={busy ? () => {} : onCancel}>
      {subtitle && <div className="mb-3 text-[13px] font-semibold" style={{ color: theme.sub }}>{subtitle}</div>}
      <div className="space-y-3">
        {!receiverRequired && (
          <p className="text-[12px] font-semibold" style={{ color: theme.sub }}>
            Collected by someone else? Add their name and phone (optional).
          </p>
        )}
        <TextField label="Receiver name" value={name} onChange={setName} placeholder={receiverRequired ? "Representative's name" : "Leave blank if the winner collected it"} required={receiverRequired} />
        <TextField label="Receiver phone" value={phone} onChange={setPhone} type="tel" placeholder="Phone number" required={receiverRequired} />
        {certificateOption && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={{ background: theme.surface3 }}>
            <input type="checkbox" checked={withCertificate} onChange={(e) => setWithCertificate(e.target.checked)} className="h-4 w-4" />
            Certificate handed over too
          </label>
        )}
        {error && <p className="text-[13px] font-bold" style={{ color: "#DC2626" }}>{error}</p>}
        <div className="flex gap-2 pt-1">
          <ActionButton tone="ghost" onClick={onCancel} disabled={busy} className="flex-1">Cancel</ActionButton>
          <ActionButton onClick={submit} busy={busy} disabled={missing} className="flex-1">Mark received</ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

/** Undo confirmation — the handover row is kept (stamped undone), not deleted. */
export function UndoDialog({ title, subtitle, onCancel, onConfirm }: {
  title: string;
  subtitle?: ReactNode;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onConfirm(reason);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={title} onClose={busy ? () => {} : onCancel}>
      {subtitle && <div className="mb-3 text-[13px] font-semibold" style={{ color: theme.sub }}>{subtitle}</div>}
      <div className="space-y-3">
        <p className="text-[12px] font-semibold" style={{ color: theme.sub }}>
          This marks it as not handed over again. The original record stays in the audit trail.
        </p>
        <TextField label="Reason (optional)" value={reason} onChange={setReason} placeholder="e.g. marked by mistake" />
        {error && <p className="text-[13px] font-bold" style={{ color: "#DC2626" }}>{error}</p>}
        <div className="flex gap-2 pt-1">
          <ActionButton tone="ghost" onClick={onCancel} disabled={busy} className="flex-1">Keep it</ActionButton>
          <ActionButton tone="danger" onClick={submit} busy={busy} className="flex-1">Undo handover</ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

// ── Selects ────────────────────────────────────────────────────────────

export function SelectField({ value, onChange, children, label, className }: {
  value: string; onChange: (v: string) => void; children: ReactNode; label: string; className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 min-w-0 rounded-xl px-3 text-[13px] font-bold outline-none ${className ?? ""}`}
      style={inputStyle}
    >
      {children}
    </select>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full min-w-0 rounded-xl px-3 text-[13px] font-semibold outline-none"
      style={inputStyle}
    />
  );
}
