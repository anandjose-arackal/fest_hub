// The CML flag — 3:2, three equal horizontal bands: yellow / red / yellow —
// waving on a pole. Built from vertical slices that bob on a staggered sine
// (more toward the fly end), each with a light/shade layer in step with its
// wave, so it needs no image asset.
const SLICES = 96;
const YELLOW = "#FFDD1F";
const RED = "#E63A1E";
const PERIOD_S = 2.2;

export function CmlFlag({ width }: { width: number }) {
  const height = Math.round((width * 2) / 3);
  const sw = width / SLICES;
  const pole = Math.max(10, Math.round(width * 0.03));
  return (
    <div style={{ position: "relative", width: width + pole, height: height * 1.9, flex: "none" }} aria-label="CML flag" role="img">
      <style>{`@keyframes cmlWave{0%,100%{transform:translateY(calc(var(--a) * -1))}50%{transform:translateY(var(--a))}}@keyframes cmlShade{0%,100%{opacity:.22}50%{opacity:0}}`}</style>
      <div style={{ position: "absolute", left: 0, top: 0, width: pole, height: "100%", borderRadius: pole, background: "linear-gradient(90deg,#6b4a12,#f5d27a 45%,#8a5d14)" }} />
      <div style={{ position: "absolute", left: -pole * 0.4, top: -pole * 1.2, width: pole * 1.8, height: pole * 1.8, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#fff6c4,#d9a521 60%,#7a5208)" }} />
      <div style={{ position: "absolute", left: pole, top: pole * 0.6, width, height, display: "flex", filter: "drop-shadow(0 24px 30px rgba(0,0,0,.35))" }}>
        {Array.from({ length: SLICES }, (_, i) => {
          const delay = `${(-i * 0.03).toFixed(2)}s`;
          return (
            <div
              key={i}
              style={{
                ["--a" as string]: `${(height * 0.045 * (i / SLICES)).toFixed(1)}px`,
                width: sw + 1.5, marginRight: -1.5, height, flex: "none", position: "relative",
                background: `linear-gradient(${YELLOW} 0 33.34%, ${RED} 33.34% 66.67%, ${YELLOW} 66.67%)`,
                animation: `cmlWave ${PERIOD_S}s ease-in-out ${delay} infinite`,
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: "#000", animation: `cmlShade ${PERIOD_S}s ease-in-out ${delay} infinite` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
