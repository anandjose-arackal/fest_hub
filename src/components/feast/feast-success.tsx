"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Check, UserPlus, ArrowRight } from "lucide-react";
import { GlassPanel, GlowBtn, theme, CATEGORY_COLORS, CATEGORY_LABELS } from "./feast-shared";

interface ConfettiPiece {
  left: number; delay: number; duration: number; color: string; size: number; rotation: number; round: boolean;
}

const CONFETTI_COLORS = ["#F5C542", "#A855F7", "#EC4899", "#34D3EE", "#7C3AED", "#fff"];

function useConfetti(): ConfettiPiece[] {
  const ref = useRef<ConfettiPiece[] | null>(null);
  if (!ref.current) {
    ref.current = Array.from({ length: 44 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.8 + Math.random() * 1.6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 7,
      rotation: Math.random() * 360,
      round: Math.random() > 0.5,
    }));
  }
  return ref.current;
}

export function FeastSuccess({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const confetti = useConfetti();

  const result = useMemo(() => {
    const regNo = params.get("regNo");
    if (!regNo) return null;
    return {
      regNo,
      name: params.get("name") ?? "—",
      houseName: params.get("houseName") ?? "",
      shakha: params.get("shakha") ?? "—",
      dob: params.get("dob") ?? "—",
      gender: params.get("gender") ?? "",
      category: params.get("category") ?? "",
      phone: params.get("phone") ?? "",
      comps: (params.get("comps") ?? "").split("|").filter(Boolean),
    };
  }, [params]);

  const r = result ?? { regNo: "REG-0000", name: "—", houseName: "", shakha: "—", dob: "—", gender: "", category: "", phone: "", comps: [] };

  return (
    <div className="relative overflow-hidden pt-6">
      {confetti.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            transform: `rotate(${p.rotation}deg)`,
            animation: `feastConfetti ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes feastConfetti { 0% { transform: translateY(-30px) rotate(0); opacity: 1; } 100% { transform: translateY(620px) rotate(620deg); opacity: 0; } }`}</style>

      <div className="flex flex-col items-center pt-6 text-center">
        <div
          className="flex h-[84px] w-[84px] items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #34D3AE, #16A34A)", boxShadow: "0 14px 38px rgba(34,197,94,0.5)" }}
        >
          <Check className="h-[42px] w-[42px] text-white" strokeWidth={3} />
        </div>
        <h1 className="mt-4 text-2xl font-bold" style={{ color: theme.text }}>You&apos;re registered!</h1>
        <p className="mt-1 text-sm" style={{ color: theme.sub }}>Registration number <strong>{r.regNo}</strong></p>
      </div>

      <GlassPanel strong className="mt-6 p-[18px]">
        {[
          ["Participant", r.name], ["House Name", r.houseName || "—"], ["Shakha", r.shakha], ["Date of Birth", r.dob],
          ["Gender", r.gender ? r.gender.charAt(0).toUpperCase() + r.gender.slice(1) : "—"],
          ["Category", CATEGORY_LABELS[r.category] || "—"],
          ...(r.phone ? [["Phone", r.phone]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.hairline}` }}>
            <span className="text-[12.5px]" style={{ color: theme.faint }}>{k}</span>
            <span className="text-[13.5px] font-semibold" style={{ color: k === "Category" ? CATEGORY_COLORS[r.category] || theme.text : theme.text }}>{v}</span>
          </div>
        ))}
        <div className="mt-3">
          <p className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Your competitions ({r.comps.length})</p>
          <div className="flex flex-wrap gap-[7px]">
            {r.comps.map((name) => (
              <span key={name} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: `${theme.purple}2e`, border: `1px solid ${theme.purple}55` }}>{name}</span>
            ))}
          </div>
        </div>
      </GlassPanel>

      <div className="mt-4 flex gap-2">
        <GlowBtn variant="ghost" size="lg" className="flex-1" icon={UserPlus} onClick={() => router.push(`/feast/${slug}/register`)}>Register another</GlowBtn>
        <GlowBtn variant="primary" size="lg" className="flex-1" trailingIcon={ArrowRight} onClick={() => router.push(`/feast/${slug}`)}>Done</GlowBtn>
      </div>
    </div>
  );
}
