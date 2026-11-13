/* eslint-disable @next/next/no-img-element */
// "LED Backdrop 16:9" design (Sargaprabha 2026) as a live 1920×1080 idle
// scene: drifting clouds, twinkling halo, swaying bougainvillea, St. Thérèse
// statue, org name + emblems, fest title art and a date · venue pill.
// shortcut: emblem, arts logo, statue and title art are this deployment's
// fest assets under /public/podium; make them org_settings fields if another
// org needs this screen.

const CSS = `
@keyframes sbDrift{from{transform:translateX(0)}to{transform:translateX(-1920px)}}
@keyframes sbDrift2{from{transform:translateX(-1920px)}to{transform:translateX(0)}}
@keyframes sbTwinkle{0%,100%{opacity:.35;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
@keyframes sbSway{0%,100%{transform:rotate(0)}50%{transform:rotate(-1.4deg)}}
@keyframes sbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes sbOrbit{to{transform:rotate(360deg)}}
@keyframes sbStar{0%,100%{opacity:.25;transform:scale(.55) rotate(0)}50%{opacity:1;transform:scale(1.2) rotate(45deg)}}
@keyframes sbHalo{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes sbGlow{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes sbIn{from{opacity:0;transform:translateY(40px) scale(.96)}to{opacity:1;transform:none}}
@keyframes sbFade{from{opacity:0}to{opacity:1}}
@keyframes sbShine{0%,60%{background-position:-200% 0}100%{background-position:200% 0}}
.sb-gold{background:linear-gradient(180deg,#fff6c8 0%,#ffd75a 35%,#e8a317 65%,#fff0a0 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #7a4a00) drop-shadow(0 10px 18px rgba(0,0,0,.7))}
`;

// 17 lights on a 240° arc behind the statue (design: centre 187,424, r 130).
const DOTS = Array.from({ length: 17 }, (_, i) => {
  const a = ((210 - 15 * i) * Math.PI) / 180;
  return { x: Math.round((187 + 130 * Math.cos(a)) * 10) / 10, y: Math.round((424 + 130 * Math.sin(a)) * 10) / 10 };
});


/** Night sky with drifting clouds, warm glow and vignette; shared with the flag scene. */
export function SargaSky() {
  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(#070a14 0%, #140f17 55%, #1a0e08 100%)" }} />

      {/* clouds: two noise layers drifting opposite ways, faded toward the edges */}
      <div style={{ position: "absolute", inset: 0, WebkitMaskImage: "radial-gradient(ellipse 75% 75% at 62% 38%, #000 0%, rgba(0,0,0,.55) 70%, rgba(0,0,0,.15) 100%)", maskImage: "radial-gradient(ellipse 75% 75% at 62% 38%, #000 0%, rgba(0,0,0,.55) 70%, rgba(0,0,0,.15) 100%)" }}>
        <img src="/podium/backdrop-clouds.svg" alt="" style={{ position: "absolute", left: 0, top: 0, width: 3840, height: 1080, maxWidth: "none", animation: "sbDrift 70s ease-in-out infinite alternate" }} />
        <img src="/podium/backdrop-clouds.svg" alt="" style={{ position: "absolute", left: 0, top: 80, width: 3840, height: 1080, maxWidth: "none", opacity: 0.35, transform: "scaleY(-1)", animation: "sbDrift2 110s ease-in-out infinite alternate" }} />
      </div>
      <div style={{ position: "absolute", left: -260, top: 780, width: 1120, height: 600, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,179,71,.5), rgba(255,138,32,0))" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.75) 100%)" }} />
    </>
  );
}

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg aria-hidden width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f5c84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  );
}

export function SargaBackdrop({ title, date, venue }: { title: string; date: string | null; venue: string | null }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", animation: "sbFade 1.2s ease both" }}>
      <SargaSky />

      {/* statue with halo glow + twinkling ring */}
      <div style={{ position: "absolute", left: -30, bottom: 30, width: 420, height: 660, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(255,200,110,.42) 0%, rgba(255,210,120,0) 70%)", animation: "sbHalo 4s ease-in-out infinite" }} />
      <svg aria-hidden width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="sb-dot"><stop offset="0" stopColor="#fff6d0" /><stop offset=".3" stopColor="#ffcc55" stopOpacity=".9" /><stop offset="1" stopColor="#ff9a20" stopOpacity="0" /></radialGradient>
        </defs>
        {DOTS.map((p, i) => (
          <g key={i} style={{ transformBox: "fill-box", transformOrigin: "center", animation: `sbTwinkle 2.4s ease-in-out ${(i * 0.15).toFixed(2)}s infinite` }}>
            <circle cx={p.x} cy={p.y} r="15" fill="url(#sb-dot)" />
            <circle cx={p.x} cy={p.y} r="3.6" fill="#fffbe8" />
          </g>
        ))}
      </svg>
      {/* star crown circling St. Thérèse's head (head centre ≈ 185,392 on the stage) */}
      <div aria-hidden style={{ position: "absolute", left: 185 - 120, top: 392 - 120, width: 240, height: 240, animation: "sbOrbit 26s linear infinite" }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const size = i % 3 === 0 ? 46 : i % 3 === 1 ? 32 : 22;
          return (
            <svg key={i} width={size} height={size} viewBox="-10 -10 20 20" style={{ position: "absolute", left: Math.round(120 + 106 * Math.cos(a) - size / 2), top: Math.round(120 + 106 * Math.sin(a) - size / 2), overflow: "visible", filter: "drop-shadow(0 0 6px #ffd76a) drop-shadow(0 0 14px rgba(255,190,60,.8))", animation: `sbStar 2.2s ease-in-out ${((i * 0.37) % 2.2).toFixed(2)}s infinite` }}>
              <path d="M0-10C1 -2 2 -1 10 0C2 1 1 2 0 10C-1 2-2 1-10 0C-2-1-1-2 0-10Z" fill="#fff6c8" />
            </svg>
          );
        })}
      </div>
      <img src="/podium/backdrop-statue.webp" alt="" style={{ position: "absolute", left: 30, bottom: 0, height: 760, width: "auto", filter: "drop-shadow(0 16px 30px rgba(0,0,0,.75))", animation: "sbIn 1.4s cubic-bezier(.2,.8,.2,1) .2s both" }} />

      {/* bougainvillea down the right edge, swaying from its top corner */}
      <img src="/podium/backdrop-flowers.svg" alt="" style={{ position: "absolute", inset: 0, width: 1920, height: 1080, transformOrigin: "1920px 0", animation: "sbSway 7s ease-in-out infinite" }} />

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 66, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 48, animation: "sbIn 1.1s cubic-bezier(.2,.8,.2,1) .4s both" }}>
          <img src="/podium/backdrop-emblem.webp" alt="" style={{ width: 190, height: 190, borderRadius: "50%", boxShadow: "0 0 0 5px #f5c84c, 0 12px 30px rgba(0,0,0,.7)" }} />
          <h1 className="sb-gold fp-ml" style={{ margin: 0, fontSize: 104, fontWeight: 800, lineHeight: 1.15, letterSpacing: 1, textAlign: "center" }}>{title}</h1>
          <img src="/podium/backdrop-arts-logo.webp" alt="" style={{ width: 200, height: 203, objectFit: "contain", filter: "drop-shadow(0 10px 24px rgba(0,0,0,.7))" }} />
        </div>
        <div style={{ position: "relative", width: 960, marginTop: 18, animation: "sbIn 1.3s cubic-bezier(.2,.8,.2,1) .8s both" }}>
          <div style={{ animation: "sbFloat 6s ease-in-out 2s infinite" }}>
            <img src="/podium/title.webp" alt="പ്രേഷിത കലോത്സവം സർഗ്ഗപ്രഭ 2026" style={{ display: "block", width: 960, height: "auto", filter: "drop-shadow(0 18px 40px rgba(0,0,0,.8))", animation: "sbGlow 3s ease-in-out infinite" }} />
            {/* glint sweeping across the title art */}
            <div style={{ position: "absolute", inset: 0, WebkitMaskImage: "url(/podium/title.webp)", maskImage: "url(/podium/title.webp)", WebkitMaskSize: "100% 100%", maskSize: "100% 100%", background: "linear-gradient(105deg, transparent 40%, rgba(255,255,240,.75) 50%, transparent 60%) 0 0 / 200% 100%", mixBlendMode: "screen", animation: "sbShine 5s ease-in-out 2s infinite" }} />
          </div>
        </div>
        {(date || venue) && (
          <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 22, padding: "10px 48px", border: "2px solid rgba(245,200,76,.7)", borderRadius: 999, background: "rgba(14,10,14,.6)", animation: "sbIn 1s ease 1.3s both" }}>
            {date && (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <Icon d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>} />
                <span className="fp-ml" style={{ fontSize: 44, fontWeight: 800, color: "#ffe9a8", lineHeight: 1.3 }}>{date}</span>
              </div>
            )}
            {date && venue && <div style={{ width: 3, height: 44, background: "#f5c84c", opacity: 0.7 }} />}
            {venue && (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <Icon d={<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>} />
                <span className="fp-ml" style={{ fontSize: 44, fontWeight: 800, color: "#ffe9a8", lineHeight: 1.3 }}>{venue}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
