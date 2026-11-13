"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

// Full-screen CML badge animation for the podium LED screen's idle breaks.
// Ported from ourcml.in's interactive badge (ourcml/badge/badge.js): the
// badge builds itself (ribbon → frills → shield → cross → medal), then each
// of its five parts is spotlit in turn with its meaning, then a finale.
// Authored on the 1920×1080 podium stage; plays once per mount (~BADGE_SHOW_MS).

const PARTS = [
  { id: "ribbon", color: "#e63a1e", name: "Red ribbon", ml: "ചുവന്ന റിബൺ", meaning: "Red indicates martyrdom for the Church.", meaningMl: "ചുവപ്പ് നിറം സഭയ്ക്കുവേണ്ടിയുള്ള രക്തസാക്ഷിത്വത്തെ സൂചിപ്പിക്കുന്നു." },
  { id: "frills", color: "#ffdd1f", name: "Yellow frills", ml: "മഞ്ഞ തൊങ്ങലുകൾ", meaning: "On the CML flag, yellow stands for peace and harmony.", meaningMl: "സി.എം.എൽ. പതാകയിൽ മഞ്ഞ നിറം സമാധാനത്തെയും ഐക്യത്തെയും സൂചിപ്പിക്കുന്നു." },
  { id: "shield", color: "#1e8c3a", name: "Green heart-shaped shield", ml: "ഹൃദയാകൃതിയിലുള്ള പച്ച പരിച", meaning: "The symbol of Faith and Hope.", meaningMl: "ഹൃദയാകൃതിയിലുള്ള പച്ച പരിച വിശ്വാസത്തിന്റെയും പ്രത്യാശയുടെയും പ്രതീകമാണ്." },
  { id: "cross", color: "#ffffff", name: "White cross", ml: "വെള്ള കുരിശ്", meaning: "It reminds us of the martyrs who witnessed for Christ.", meaningMl: "ക്രിസ്തുവിന് സാക്ഷ്യം വഹിച്ച രക്തസാക്ഷികളെ വെള്ള കുരിശ് നമ്മെ ഓർമ്മിപ്പിക്കുന്നു." },
  { id: "medal", color: "#e8b84a", name: "Medal of St. Little Flower", ml: "ചെറുപുഷ്പത്തിന്റെ മെഡൽ", meaning: "Our love and devotion to our Heavenly Patroness, St. Little Theresa, and her missionary spirit.", meaningMl: "നമ്മുടെ സ്വർഗീയ മധ്യസ്ഥയായ വിശുദ്ധ കൊച്ചുത്രേസ്യയോടുള്ള സ്നേഹവും ഭക്തിയും അവളുടെ പ്രേഷിതചൈതന്യവും." },
] as const;
const INTRO = { color: "#ffdd1f", name: "Five parts, one badge", ml: "അഞ്ച് ഭാഗങ്ങൾ, ഒരു ബാഡ്ജ്", meaning: "Love · Sacrifice · Service · Suffering", meaningMl: "സ്നേഹം · ത്യാഗം · സേവനം · സഹനം" };

const BUILD_S = 4.6;
const PART_S = 5;
export const BADGE_SHOW_MS = Math.round((BUILD_S + PARTS.length * PART_S + 5) * 1000);

const SHIELD_D = "M20 40 L120 100 L220 40 L220 220 C220 288 168 322 120 360 C72 322 20 288 20 220 Z";
const SCALLOPS = Array.from({ length: 7 }, (_, i) => { const w = 240 / 7; return `M${i * w} 454 A${w / 2} ${w / 2} 0 0 1 ${(i + 1) * w} 454 Z`; });
const STRANDS = Array.from({ length: 13 }, (_, i) => (i * 240) / 13);
const MEDAL_RAYS = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);
const CROSS_RAYS = Array.from({ length: 24 }, (_, i) => { const a = (i * Math.PI) / 12, b = a + 0.07; return `120,181 ${120 + 260 * Math.sin(a)},${181 - 260 * Math.cos(a)} ${120 + 260 * Math.sin(b)},${181 - 260 * Math.cos(b)}`; });

type Card = { color: string; name: string; ml: string; meaning: string; meaningMl: string };

export function BadgeShow() {
  const root = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<Card>(INTRO);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    // Track wall-clock time even on a slow frame rate, so the sequence ends
    // when the podium page switches scenes (BADGE_SHOW_MS).
    gsap.ticker.lagSmoothing(0);
    const ctx = gsap.context(() => {
      const strands = q(".bxs-strand-r");
      // Idle life: swaying fringe, shimmer down the ribbon, sheen on the shield.
      q(".bxs-strand").forEach((s, i) => gsap.to(s, { rotation: i % 2 ? 2.2 : -2.2, duration: 1.6 + (i % 4) * 0.25, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 0%", delay: i * 0.08 }));
      gsap.fromTo("#bxs-shimmer", { y: 0 }, { y: 640, duration: 2.6, repeat: -1, repeatDelay: 3, ease: "sine.inOut" });
      gsap.fromTo("#bxs-sheen", { x: 0 }, { x: 420, duration: 1.8, repeat: -1, repeatDelay: 4.5, ease: "power1.inOut", delay: 1.5 });
      gsap.to(".bxs-glow", { opacity: 0.85, scale: 1.08, duration: 3, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 50%" });

      const mute = (id: string | null) =>
        q(".bxs-part").forEach((n) => (id && n.getAttribute("data-part") !== id ? n.setAttribute("filter", "url(#bxs-mute)") : n.removeAttribute("filter")));
      const ANIM: Record<string, () => void> = {
        ribbon() {
          const layer = q("#bxs-cloth-layer")[0];
          layer.setAttribute("filter", "url(#bxs-cloth)");
          gsap.timeline({ onComplete: () => layer.removeAttribute("filter") })
            .fromTo("#bxs-clothDisp", { attr: { scale: 0 } }, { attr: { scale: 18 }, duration: 0.45, ease: "sine.out" })
            .to("#bxs-clothDisp", { attr: { scale: 0 }, duration: 1.15, ease: "sine.inOut" }, 0.45)
            .fromTo("#bxs-ribbonPulse", { opacity: 0 }, { opacity: 0.45, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0.1);
        },
        frills() {
          gsap.fromTo(".bxs-scallop", { scaleY: 1 }, { keyframes: { scaleY: [1, 1.6, 0.85, 1] }, duration: 0.7, stagger: 0.07, transformOrigin: "50% 100%", ease: "sine.inOut" });
          gsap.fromTo(strands, { rotation: 0 }, { keyframes: { rotation: [0, 16, -11, 6, 0] }, duration: 1.3, stagger: 0.045, transformOrigin: "50% 0%", ease: "sine.inOut" });
        },
        shield() {
          gsap.timeline()
            .fromTo("#bxs-shieldOutline", { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" })
            .fromTo("#bxs-shieldGlow", { opacity: 0 }, { opacity: 0.8, duration: 0.3 }, 0.2)
            .fromTo("#bxs-p-shield", { scale: 1 }, { keyframes: { scale: [1, 1.07, 1, 1.07, 1] }, duration: 1.1, transformOrigin: "50% 50%", ease: "power1.inOut" }, 0.5)
            .to("#bxs-shieldGlow", { opacity: 0, duration: 0.6 }, 1.6)
            .to("#bxs-shieldOutline", { opacity: 0, duration: 0.6 }, 1.8);
        },
        cross() {
          gsap.timeline()
            .fromTo("#bxs-crossRays", { opacity: 0, rotation: -8, svgOrigin: "120 181" }, { opacity: 1, rotation: 8, duration: 1.6, ease: "sine.inOut" })
            .fromTo("#bxs-sweepV", { y: 0, opacity: 1 }, { y: 420, duration: 0.9, ease: "power2.inOut" }, 0)
            .fromTo("#bxs-sweepH", { x: 0, opacity: 1 }, { x: 330, duration: 0.8, ease: "power2.inOut" }, 0.55)
            .to("#bxs-crossRays", { opacity: 0, duration: 0.7 }, 1.4);
        },
        medal() {
          gsap.timeline()
            .fromTo("#bxs-medalFace", { scaleX: 1 }, { keyframes: { scaleX: [1, 0, -1, 0, 1] }, duration: 1.2, ease: "sine.inOut", transformOrigin: "50% 50%" })
            .fromTo("#bxs-medalRays", { opacity: 1, scale: 0.7, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1.6, duration: 1.1, ease: "power2.out" }, 0.2)
            .fromTo("#bxs-medalHalo", { opacity: 0 }, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1, repeatDelay: 0.6 }, 0)
            .fromTo("#bxs-medalPos", { scale: 1 }, { scale: 1.15, duration: 0.5, yoyo: true, repeat: 1, repeatDelay: 0.4, ease: "back.out(2)", transformOrigin: "50% 50%" }, 0);
        },
      };

      const tl = gsap.timeline()
        .fromTo("#bxs-title", { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, 0)
        .fromTo("#bxs-ribbonBody", { scaleY: 0, svgOrigin: "120 0" }, { scaleY: 1, duration: 0.9, ease: "power3.out" }, 0.2)
        .fromTo(".bxs-scallop", { scale: 0, transformOrigin: "50% 100%" }, { scale: 1, duration: 0.45, stagger: 0.05, ease: "back.out(2.5)" }, 0.9)
        .fromTo(strands, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.6, stagger: 0.03, ease: "bounce.out" }, 1.1)
        .fromTo("#bxs-shieldOutline", { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 1.5)
        .fromTo("#bxs-shieldFill", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 2.0)
        .to("#bxs-shieldOutline", { opacity: 0, duration: 0.4 }, 2.4)
        .fromTo("#bxs-crossV", { scaleY: 0, svgOrigin: "120 0" }, { scaleY: 1, duration: 0.6, ease: "power2.out" }, 2.4)
        .fromTo("#bxs-crossH", { scaleX: 0, svgOrigin: "120 181" }, { scaleX: 1, duration: 0.5, ease: "power2.out" }, 2.75)
        .fromTo("#bxs-medalPos", { scale: 0, rotation: -200, transformOrigin: "50% 50%" }, { scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.6)" }, 3.1)
        .fromTo("#bxs-medalRays", { opacity: 1, scale: 0.7, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1.6, duration: 0.9, ease: "power2.out" }, 3.7)
        .fromTo("#bxs-card", { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, 3.6);

      PARTS.forEach((p, i) => {
        tl.call(() => {
          setCard(p);
          setStep(i);
          mute(p.id);
          ANIM[p.id]();
          gsap.fromTo("#bxs-card", { y: 24, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
        }, [], BUILD_S + i * PART_S);
      });
      tl.call(() => {
        setCard(INTRO);
        setStep(-1);
        mute(null);
        ANIM.medal();
        gsap.fromTo("#bxs-card", { y: 24, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
      }, [], BUILD_S + PARTS.length * PART_S);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(ellipse 70% 80% at 32% 50%, #5a0f08 0%, #2a0604 55%, #120201 100%)" }}>
      <div className="bxs-glow" style={{ position: "absolute", left: 140, top: 40, width: 1000, height: 1000, borderRadius: "50%", opacity: 0.5, background: "radial-gradient(circle, rgba(255,221,31,.35), rgba(255,221,31,0) 65%)" }} />
      <div id="bxs-title" style={{ position: "absolute", left: 0, right: 0, top: 44, textAlign: "center" }}>
        <span className="fp-disp" style={{ fontSize: 46, letterSpacing: ".3em", color: "#ffdd1f" }}>OUR BADGE</span>
        <span className="fp-ml" style={{ fontSize: 40, fontWeight: 800, color: "#fff3b0", marginLeft: 28 }}>നമ്മുടെ ബാഡ്ജ്</span>
      </div>

      <svg viewBox="-60 -40 360 640" style={{ position: "absolute", left: 230, top: 120, height: 920, width: 920 * 360 / 640, overflow: "visible" }} aria-label="CML badge">
        <defs>
          <linearGradient id="bxs-folds" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity=".22" /><stop offset=".12" stopColor="#fff" stopOpacity=".07" />
            <stop offset=".3" stopColor="#000" stopOpacity=".06" /><stop offset=".5" stopColor="#fff" stopOpacity=".1" />
            <stop offset=".72" stopColor="#000" stopOpacity=".08" /><stop offset=".88" stopColor="#fff" stopOpacity=".06" />
            <stop offset="1" stopColor="#000" stopOpacity=".25" />
          </linearGradient>
          <linearGradient id="bxs-shine" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bxs-shineX" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#9fdcff" stopOpacity="0" /><stop offset=".5" stopColor="#9fdcff" stopOpacity=".9" /><stop offset="1" stopColor="#9fdcff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bxs-shineY" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#9fdcff" stopOpacity="0" /><stop offset=".5" stopColor="#9fdcff" stopOpacity=".9" /><stop offset="1" stopColor="#9fdcff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="bxs-halo"><stop offset="0" stopColor="#fff6c4" stopOpacity=".9" /><stop offset="1" stopColor="#fff6c4" stopOpacity="0" /></radialGradient>
          <clipPath id="bxs-ribbonClip"><rect x="0" y="0" width="240" height="452" /></clipPath>
          <clipPath id="bxs-shieldClip"><path d={SHIELD_D} /></clipPath>
          <clipPath id="bxs-crossClip"><rect x="107" y="0" width="26" height="330" /><rect x="20" y="168" width="200" height="26" /></clipPath>
          <filter id="bxs-cloth" x="-10%" y="-5%" width="120%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves={2} seed={4} />
            <feDisplacementMap id="bxs-clothDisp" in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="bxs-mute" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values=".15" />
            <feComponentTransfer><feFuncR type="linear" slope=".45" /><feFuncG type="linear" slope=".45" /><feFuncB type="linear" slope=".5" /></feComponentTransfer>
          </filter>
          <filter id="bxs-glowF" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g id="bxs-cloth-layer">
          <g className="bxs-part" data-part="ribbon">
            <g id="bxs-ribbonBody">
              <rect x="0" y="0" width="240" height="452" fill="#e63a1e" />
              <rect x="0" y="0" width="240" height="452" fill="url(#bxs-folds)" />
              <rect id="bxs-ribbonPulse" x="0" y="0" width="240" height="452" fill="#ff8a5c" opacity="0" />
              <g clipPath="url(#bxs-ribbonClip)"><rect id="bxs-shimmer" x="0" y="-160" width="240" height="140" fill="url(#bxs-shine)" /></g>
            </g>
          </g>
          <g id="bxs-p-shield" className="bxs-part" data-part="shield">
            <path id="bxs-shieldGlow" d={SHIELD_D} fill="none" stroke="#7dff9c" strokeWidth="10" opacity="0" filter="url(#bxs-glowF)" />
            <path id="bxs-shieldFill" d={SHIELD_D} fill="#1e8c3a" />
            <g clipPath="url(#bxs-shieldClip)"><rect id="bxs-sheen" x="-120" y="20" width="50" height="360" fill="#fff" opacity=".13" transform="skewX(-18)" /></g>
            <path id="bxs-shieldOutline" pathLength={1} d={SHIELD_D} fill="none" stroke="#c8ffd6" strokeWidth="3" strokeDasharray="1" strokeDashoffset="1" />
          </g>
          <g className="bxs-part" data-part="cross">
            <g id="bxs-crossRays" clipPath="url(#bxs-shieldClip)" opacity="0">
              {CROSS_RAYS.map((pts, i) => <polygon key={i} points={pts} fill="#eafff0" opacity={0.35} />)}
            </g>
            <rect id="bxs-crossV" x="107" y="0" width="26" height="330" fill="#fff" />
            <rect id="bxs-crossH" x="20" y="168" width="200" height="26" fill="#fff" />
            <g clipPath="url(#bxs-crossClip)">
              <rect id="bxs-sweepV" x="100" y="-80" width="40" height="70" fill="url(#bxs-shineY)" opacity="0" />
              <rect id="bxs-sweepH" x="-80" y="160" width="70" height="40" fill="url(#bxs-shineX)" opacity="0" />
            </g>
          </g>
          <g className="bxs-part" data-part="frills">
            <g>
              {STRANDS.map((x, i) => (
                <g key={i} className="bxs-strand">
                  <rect className="bxs-strand-r" x={x + 3} y="478" width={240 / 13 - 6} height="92" rx="1.5" fill="#ffdd1f" stroke="#e2b80b" strokeWidth="0.8" />
                </g>
              ))}
            </g>
            <rect x="0" y="452" width="240" height="30" fill="#ffdd1f" />
            <g>{SCALLOPS.map((d, i) => <path key={i} className="bxs-scallop" d={d} fill="#ffdd1f" />)}</g>
          </g>
        </g>

        <g className="bxs-part" data-part="medal" transform="translate(120 181)">
          <g id="bxs-medalPos">
            <circle id="bxs-medalHalo" r="90" fill="url(#bxs-halo)" opacity="0" />
            <g id="bxs-medalRays" opacity="0">
              {MEDAL_RAYS.map((a, i) => <line key={i} x1={54 * Math.sin(a)} y1={-54 * Math.cos(a)} x2={76 * Math.sin(a)} y2={-76 * Math.cos(a)} stroke="#fff3b0" strokeWidth="2.5" strokeLinecap="round" />)}
            </g>
            <g id="bxs-medalFace">
              <image href="/badge/medal.webp" x="-58" y="-54" width="116" height="107" preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>
        </g>
      </svg>

      <div id="bxs-card" style={{ position: "absolute", left: 960, top: 300, width: 820, padding: "48px 56px", borderRadius: 36, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,221,31,.35)", backdropFilter: "blur(10px)", boxShadow: "0 30px 80px rgba(0,0,0,.45)", color: "#fff", opacity: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span style={{ width: 56, height: 56, flex: "none", borderRadius: 16, background: card.color, boxShadow: `0 0 34px ${card.color}` }} />
          <div style={{ minWidth: 0 }}>
            <div className="fp-disp" style={{ fontSize: 54, lineHeight: 1.05 }}>{card.name}</div>
            <div className="fp-ml" style={{ fontSize: 38, fontWeight: 800, color: "#ffdd1f", marginTop: 6 }}>{card.ml}</div>
          </div>
        </div>
        <p style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.35, marginTop: 30, color: "rgba(255,255,255,.92)" }}>{card.meaning}</p>
        <p className="fp-ml" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.5, marginTop: 14, color: "rgba(255,243,176,.9)" }}>{card.meaningMl}</p>
        <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
          {PARTS.map((p, i) => (
            <span key={p.id} style={{ height: 8, flex: 1, borderRadius: 9999, background: i === step ? p.color : "rgba(255,255,255,.18)", transition: "background .4s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
