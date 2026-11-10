// Isometric drawing kit for the venue map (src/components/feast/venue-map.tsx)
// and the rest of the campus around the school, as in the venue photo: the
// church with its clock tower in the middle, the white hall with the red tile
// roof on the right, the paved plaza with its statue, the sand ground in
// front of the hall, the compound wall with its gates, and the road.
// Colours follow the photo, so they stay the same under every theme.

// World frame, as the venue photo is taken: the road runs left→right along
// `a` at the front, `b` is depth (front → back, drawn up and to the right),
// so the visible faces are each building's front (towards the road) and its
// right-hand side. The church, the seminary (stage building) and the green rooms behind it face the road; the
// school stands on the left at 90° to them, its long facade running from the
// road towards the back and facing the plaza (see spt).
export const L = 1000; // school facade length (school frame units)
export const H = 96; // school floor height
export const WX = 130; // depth vector (front → back), x
export const WY = -84; // depth vector, y
export const PARAPET = 16;
/** School frame → world: facade length L spans this much depth, depth 1 spans SCHOOL_DEPTH along a. */
export const SCHOOL_SPAN = 4.2;
export const SCHOOL_DEPTH = 170;
/** Screen direction of the school facade (for slanting its roof sign). */
export const FACADE_SLOPE = WY / WX;

export const C = {
  lawn: "#86BF68", lawnEdge: "#6FA955", paving: "#D9A898", pavingDark: "#8E8586", sand: "#D9A066", sandEdge: "#C88C52",
  road: "#3E3E46", roadLine: "#F4F1EA",
  wall: "#F9E8CF", wallSide: "#EBCFA8", band: "#F39C4E", bandSide: "#DC8538", stair: "#BFDDF2",
  trim: "#D9443C", trimSide: "#B5352E", roof: "#CBC5BE", roofEdge: "#B3ACA4",
  glass: "#3B6C9A", glassHi: "#A6D3F2",
  porch: "#F6C945", porchSide: "#E0AC2A", porchTop: "#FBE39A", column: "#C8382F",
  church: "#F3D36C", churchSide: "#DDB548", churchTop: "#E8C55A", churchTrim: "#C4432F", lattice: "#FBF3E2",
  hall: "#F8F5EF", hallSide: "#E4DDD2", tile: "#C95A3B", tileSide: "#A8452C", arch: "#6E3B24",
  fence: "#F4E2C2", fenceSide: "#E2CCA6", pillar: "#D4583C", pillarSide: "#B4452E", cap: "#FBF2E2",
  palmTrunk: "#9B7650", palm: "#4E9A43", palmHi: "#6DB85A", tree: "#4FA34A", treeHi: "#7DC766", trunk: "#8B5A2B",
  ink: "#2B2118",
};

// World positions (school facade on the plane a = 0, its front end at b = 0).
// The paved plaza opens to the right of the school; the church closes it at
// the back, facing the road, with the statue in front of it; the parish hall
// is beside the church with the sand ground in front, the green rooms behind it.
// Church: facade (wings z high, tower to its cap) and a long nave behind it.
export const CHURCH = { a0: 370, a1: 680, b0: 3.0, b1: 4.8, z: 190, tower: 398 };
export const HALL = { a0: 740, a1: 1140, b0: 4.2, b1: 5.1, z: 100, ridge: 150 };
// Green rooms: a two-storey verandah building behind the seminary (HALL).
export const GREEN_ROOMS = { a0: 700, a1: 1200, b0: 5.6, b1: 6.4, z: 150, ridge: 205 };
export const GROUNDS = { a0: -300, a1: 1300, front: -0.55, back: 6.9 };
export const GATE = { a0: 380, a1: 500 };

export type Pt = [number, number];
/** World point: a along the road · b depth (0 = school's front end, < 0 = towards the road) · z height. */
export function pt(a: number, b: number, z: number): Pt {
  return [a + b * WX, b * WY - z];
}
/** School frame: t along its facade (0 = road end … L = back end) · d depth (0 = facade, 1 = back wall, < 0 = out on the plaza) · z. */
export function spt(t: number, d: number, z: number): Pt {
  return pt(-d * SCHOOL_DEPTH, (t / L) * SCHOOL_SPAN, z);
}
export function poly(...pts: Pt[]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
/** Flat patch of ground. */
export function patch(a0: number, a1: number, b0: number, b1: number, z = 0): string {
  return poly(pt(a0, b0, z), pt(a1, b0, z), pt(a1, b1, z), pt(a0, b1, z));
}

// Pattern space for ground textures: pattern x runs along a, pattern y along
// b (100 units per b), so tiles follow the same isometric grid.
const GROUND_SPACE = `matrix(1 0 ${WX / 100} ${WY / 100} 0 0)`;

/**
 * Shared gradients, textures and filters that give the flat shapes light and
 * material: sunlit-from-the-left shading on every face, glass reflections,
 * a brick grid on the plaza, grain on sand and grass, soft contact shadows.
 * Render once at the top of the map's <svg>.
 */
export function CampusDefs() {
  return (
    <defs>
      <linearGradient id="vc-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
        <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
        <stop offset="1" stopColor="#2B1A0E" stopOpacity={0.16} />
      </linearGradient>
      <linearGradient id="vc-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2B1A0E" stopOpacity={0.08} />
        <stop offset="1" stopColor="#2B1A0E" stopOpacity={0.24} />
      </linearGradient>
      <linearGradient id="vc-top" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="vc-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#B9DCF5" />
        <stop offset="0.45" stopColor="#5D8FBD" />
        <stop offset="1" stopColor="#2A4F78" />
      </linearGradient>
      <radialGradient id="vc-leaf" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#8FD178" />
        <stop offset="0.6" stopColor="#4C9A43" />
        <stop offset="1" stopColor="#2F6E2E" />
      </radialGradient>
      <linearGradient id="vc-road" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4A4A54" />
        <stop offset="1" stopColor="#33333B" />
      </linearGradient>
      <pattern id="vc-brick" patternUnits="userSpaceOnUse" width={36} height={18} patternTransform={GROUND_SPACE}>
        <path d="M0 0.5H36M0 9.5H36M0.5 0V9M18.5 9V18" stroke="#7A4B40" strokeOpacity={0.22} strokeWidth={1.4} fill="none" />
      </pattern>
      {/* Church lattice screens (front faces are upright rectangles on screen). */}
      <pattern id="vc-lattice" patternUnits="userSpaceOnUse" width={7} height={7}>
        <rect width={7} height={7} fill="#FBF3E2" />
        <path d="M3.5 0.6 L6.4 3.5 L3.5 6.4 L0.6 3.5 Z" fill="none" stroke="#B5352E" strokeWidth={0.9} />
        <circle cx={3.5} cy={3.5} r={0.8} fill="#B5352E" />
      </pattern>
      <pattern id="vc-tile" patternUnits="userSpaceOnUse" width={22} height={9} patternTransform={GROUND_SPACE}>
        <path d="M0 0.5H22M0.5 0V9" stroke="#6E2A18" strokeOpacity={0.35} strokeWidth={1.6} fill="none" />
      </pattern>
      <filter id="vc-grain" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} result="n" />
        <feColorMatrix in="n" type="saturate" values="0" result="g" />
        <feComponentTransfer in="g" result="g2">
          <feFuncR type="linear" slope={0.3} intercept={0.72} />
          <feFuncG type="linear" slope={0.3} intercept={0.72} />
          <feFuncB type="linear" slope={0.3} intercept={0.72} />
        </feComponentTransfer>
        <feBlend in="SourceGraphic" in2="g2" mode="multiply" result="b" />
        <feComposite in="b" in2="SourceGraphic" operator="in" />
      </filter>
      <filter id="vc-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={9} />
      </filter>
    </defs>
  );
}

/** Axis-aligned box: its front (b0), one end and top — the faces this view sees. */
export function Box({ a0, a1, b0, b1, z0, z1, front, side, top, p = pt, sideAt = "a1" }: { a0: number; a1: number; b0: number; b1: number; z0: number; z1: number; front: string; side: string; top: string; /** Projection (world `pt`, or the school frame `spt`). */ p?: (a: number, b: number, z: number) => Pt; /** Which end face shows: the right end in the world frame, the road end in the school frame. */ sideAt?: "a0" | "a1" }) {
  const sa = sideAt === "a0" ? a0 : a1;
  const sideF = poly(p(sa, b0, z0), p(sa, b1, z0), p(sa, b1, z1), p(sa, b0, z1));
  const frontF = poly(p(a0, b0, z0), p(a1, b0, z0), p(a1, b0, z1), p(a0, b0, z1));
  const topF = poly(p(a0, b0, z1), p(a1, b0, z1), p(a1, b1, z1), p(a0, b1, z1));
  return (
    <g>
      <polygon points={sideF} fill={side} />
      <polygon points={sideF} fill="url(#vc-side)" />
      <polygon points={frontF} fill={front} />
      <polygon points={frontF} fill="url(#vc-front)" />
      <polygon points={topF} fill={top} />
      <polygon points={topF} fill="url(#vc-top)" />
    </g>
  );
}

/** A rectangle drawn on a front face (constant b), from a0..a1 and z0..z1. */
function face(a0: number, a1: number, b: number, z0: number, z1: number): string {
  return poly(pt(a0, b, z0), pt(a1, b, z0), pt(a1, b, z1), pt(a0, b, z1));
}

export function Tree({ a, b, s = 1 }: { a: number; b: number; s?: number }) {
  const [x, y] = pt(a, b, 0);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={14} cy={2} rx={34} ry={10} fill="#1E2A12" opacity={0.28} />
      <rect x={-5} y={-34} width={10} height={34} rx={3} fill={C.trunk} />
      <circle cx={0} cy={-58} r={32} fill="url(#vc-leaf)" />
      <circle cx={-14} cy={-50} r={18} fill="url(#vc-leaf)" />
      <circle cx={14} cy={-74} r={16} fill="url(#vc-leaf)" />
    </g>
  );
}

export function Palm({ a, b, s = 1 }: { a: number; b: number; s?: number }) {
  const [x, y] = pt(a, b, 0);
  const fronds = [-150, -115, -80, -50, -15, 20];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={20} cy={2} rx={30} ry={8} fill="#1E2A12" opacity={0.25} />
      <path d="M0 0 C 4 -50, 14 -100, 10 -150" fill="none" stroke={C.palmTrunk} strokeWidth={8} strokeLinecap="round" />
      <path d="M0 0 C 4 -50, 14 -100, 10 -150" fill="none" stroke="#6B4F33" strokeWidth={8} strokeDasharray="2 9" strokeLinecap="butt" />
      {fronds.map((r, i) => (
        <g key={r} transform={`rotate(${r} 10 -150) translate(36 0)`}>
          <ellipse cx={10} cy={-150} rx={46} ry={9} fill={i % 2 ? C.palmHi : C.palm} />
          <path d={`M-34 -150 H54`} stroke="#2F6E2E" strokeOpacity={0.5} strokeWidth={1.5} />
        </g>
      ))}
      <circle cx={10} cy={-148} r={7} fill="#7A5A2E" />
    </g>
  );
}

/** Grass, plaza, sand ground and road — drawn first, under everything. */
export function Grounds() {
  const { a0, a1, front, back } = GROUNDS;
  const chMid = (CHURCH.a0 + CHURCH.a1) / 2;
  const gateMid = (GATE.a0 + GATE.a1) / 2;
  const stripe = (from: number, to: number) =>
    poly(pt(from - 7, front, 0), pt(from + 7, front, 0), pt(to + 7, CHURCH.b0 - 0.25, 0), pt(to - 7, CHURCH.b0 - 0.25, 0));
  // Soft contact shadow of a building, falling back-left (sun front-right).
  const shadow = (s0: number, s1: number, d0: number, d1: number, reach: number) => (
    <polygon points={poly(pt(s0, d0, 0), pt(s1, d0, 0), pt(s1 - reach, d1 + 0.25, 0), pt(s0 - reach, d1 + 0.25, 0))} fill="#24180C" opacity={0.3} filter="url(#vc-soft)" />
  );
  const roadDashes = Math.floor((a1 - a0 - 40) / 95);
  return (
    <g>
      <polygon points={patch(a0, a1, front, back)} fill={C.lawn} />
      <polygon points={patch(a0, a1, front, back)} fill={C.lawn} filter="url(#vc-grain)" />
      {/* Road and its kerb */}
      <polygon points={patch(a0, a1, front - 0.42, front - 0.06)} fill="url(#vc-road)" />
      <polygon points={patch(a0, a1, front - 0.06, front)} fill={C.pillarSide} opacity={0.55} />
      {Array.from({ length: roadDashes }, (_, i) => {
        const s = a0 + 40 + i * 95;
        return <polygon key={i} points={patch(s, s + 50, front - 0.26, front - 0.22)} fill={C.roadLine} />;
      })}
      {/* Paved plaza: along the school's facade from the road back to the
          church steps, plus a paving strip along the front of the hall */}
      {[
        patch(-40, HALL.a0 - 40, front, CHURCH.b0),
        patch(HALL.a0 - 40, a1 - 20, HALL.b0 - 0.35, HALL.b0),
      ].map((p) => (
        <g key={p}>
          <polygon points={p} fill={C.paving} />
          <polygon points={p} fill="url(#vc-brick)" />
        </g>
      ))}
      <polygon points={stripe(gateMid - 50, chMid - 45)} fill={C.pavingDark} opacity={0.75} />
      <polygon points={stripe(gateMid + 50, chMid + 45)} fill={C.pavingDark} opacity={0.75} />
      {/* Sand ground in front of the hall */}
      <polygon points={patch(HALL.a0 - 40, a1 - 20, front, HALL.b0 - 0.35)} fill={C.sand} filter="url(#vc-grain)" />
      <polygon points={patch(HALL.a0 - 40, HALL.a0 - 30, front, HALL.b0 - 0.35)} fill={C.pavingDark} opacity={0.6} />
      {/* Contact shadows */}
      {shadow(-SCHOOL_DEPTH, 0, 0, SCHOOL_SPAN, 60)}
      {shadow(CHURCH.a0, CHURCH.a1, CHURCH.b0, CHURCH.b1, 90)}
      {shadow(HALL.a0, HALL.a1, HALL.b0, HALL.b1, 60)}
      {shadow(GREEN_ROOMS.a0, GREEN_ROOMS.a1, GREEN_ROOMS.b0, GREEN_ROOMS.b1, 70)}
    </g>
  );
}

/** White lattice balustrade with red rails, on a front face. */
function Balustrade({ a0, a1, b, z, h = 16 }: { a0: number; a1: number; b: number; z: number; h?: number }) {
  return (
    <g>
      <polygon points={face(a0, a1, b, z, z + h)} fill="url(#vc-lattice)" />
      <polygon points={face(a0, a1, b, z + h - 3, z + h)} fill={C.churchTrim} />
      <polygon points={face(a0, a1, b, z, z + 2.5)} fill={C.churchTrim} />
      {[a0, a1 - 4].map((a) => <polygon key={a} points={face(a, a + 4, b, z, z + h)} fill={C.churchTrim} />)}
    </g>
  );
}

/** Tall lattice screen in a red frame, split into `cols` panels. */
function LatticeWindow({ a0, a1, b, z0, z1, cols }: { a0: number; a1: number; b: number; z0: number; z1: number; cols: number }) {
  const w = (a1 - a0 - 4) / cols;
  return (
    <g>
      <polygon points={face(a0, a1, b, z0, z1)} fill={C.churchTrim} />
      {Array.from({ length: cols }, (_, i) => (
        <polygon key={i} points={face(a0 + 2 + i * w + 1.2, a0 + 2 + (i + 1) * w - 1.2, b, z0 + 3, z1 - 3)} fill="url(#vc-lattice)" />
      ))}
    </g>
  );
}

/**
 * The church, facing the road (as in the close-up photo): a tall central
 * tower (lattice window, balustrade, red-framed clock stage, stepped cap and
 * gold cross) between two lower wings with lattice windows and side doors,
 * pinnacles with red domes at the corners, an arched main door, wide red
 * steps with two dark stripes and railed terraces. Behind the facade the nave
 * runs back under a long red tile roof.
 */
export function Church() {
  const { a0, a1, b0, b1, z, tower } = CHURCH;
  const mid = (a0 + a1) / 2;
  const tw = 52; // tower half-width
  const fb = b0 - 0.06; // tower front, a little proud of the wings
  const pin = 24; // corner pinnacle width
  const wingMid = (side: -1 | 1) => (side < 0 ? (a0 + pin + mid - tw) / 2 : (mid + tw + a1 - pin) / 2);
  // Nave behind the facade
  const n0 = a0 + 22, n1 = a1 - 22, nb0 = b0 + 0.2, nz = 150;
  const ridgeZ = nz + (n1 - n0) * 0.3;
  const [cx, cy] = pt(mid, fb, 349);
  const [crossX, crossY] = pt(mid, fb + 0.06, tower);
  const roofL = poly(pt(n0 - 8, nb0, nz), pt(mid, nb0, ridgeZ), pt(mid, b1, ridgeZ), pt(n0 - 8, b1, nz));
  const roofR = poly(pt(mid, nb0, ridgeZ), pt(n1 + 8, nb0, nz), pt(n1 + 8, b1, nz), pt(mid, b1, ridgeZ));
  const [rx0, ry0] = pt(mid, nb0, ridgeZ);
  const [rx1, ry1] = pt(mid, b1, ridgeZ);
  const door = { l: pt(mid - 19, fb, 64), r: pt(mid + 19, fb, 64), bl: pt(mid - 19, fb, 0), br: pt(mid + 19, fb, 0) };
  return (
    <g>
      {/* Nave: right wall with windows, long pitched tile roof */}
      <Box a0={n0} a1={n1} b0={nb0} b1={b1} z0={0} z1={nz} front={C.church} side={C.churchSide} top={C.churchTop} />
      {Array.from({ length: 6 }, (_, i) => {
        const b = nb0 + 0.25 + i * ((b1 - nb0 - 0.4) / 6);
        return <polygon key={i} points={poly(pt(n1, b, 60), pt(n1, b + 0.12, 60), pt(n1, b + 0.12, 120), pt(n1, b, 120))} fill={C.churchTrim} opacity={0.85} />;
      })}
      <polygon points={roofL} fill={C.tileSide} />
      <polygon points={roofR} fill={C.tile} />
      <polygon points={roofR} fill="url(#vc-side)" />
      {Array.from({ length: 5 }, (_, i) => {
        const f = (i + 1) / 6;
        const za = ridgeZ + (nz - ridgeZ) * f;
        const aa = mid + (n1 + 8 - mid) * f;
        const [x0, y0] = pt(aa, nb0, za);
        const [x1, y1] = pt(aa, b1, za);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#7E2E19" strokeOpacity={0.35} strokeWidth={1.6} />;
      })}
      <line x1={rx0} y1={ry0} x2={rx1} y2={ry1} stroke="#8E3420" strokeWidth={4} strokeLinecap="round" />

      {/* Facade wings */}
      <Box a0={a0} a1={a1} b0={b0} b1={b0 + 0.22} z0={0} z1={z} front={C.church} side={C.churchSide} top={C.churchTop} />
      {[z * 0.27, z - 12].map((h) => <polygon key={h} points={face(a0, a1, b0, h, h + 5)} fill={C.churchTrim} />)}
      {([-1, 1] as const).map((s) => {
        const m = wingMid(s);
        return (
          <g key={s}>
            <LatticeWindow a0={m - 21} a1={m + 21} b={b0} z0={62} z1={160} cols={3} />
            <polygon points={face(m - 11, m + 11, b0, 0, 46)} fill={C.arch} />
            <polygon points={face(m - 0.8, m + 0.8, b0, 2, 44)} fill="#3E2416" />
            <Balustrade a0={s < 0 ? a0 + pin : mid + tw} a1={s < 0 ? mid - tw : a1 - pin} b={b0} z={z} />
          </g>
        );
      })}
      {/* Corner pinnacles with red domes */}
      {[a0, a1 - pin].map((a) => {
        const [dx, dy] = pt(a + pin / 2, b0, 236);
        return (
          <g key={a}>
            <Box a0={a} a1={a + pin} b0={b0 - 0.04} b1={b0 + 0.14} z0={0} z1={226} front={C.church} side={C.churchSide} top={C.churchTrim} />
            <polygon points={face(a + pin / 2 - 2, a + pin / 2 + 2, b0 - 0.04, 40, 200)} fill={C.churchTrim} opacity={0.7} />
            {[100, 160, 216].map((h) => <polygon key={h} points={face(a - 3, a + pin + 3, b0 - 0.04, h, h + 5)} fill={C.churchTrim} />)}
            <circle cx={dx} cy={dy} r={9} fill={C.churchTrim} />
            <path d={`M${dx} ${dy - 9} v-8`} stroke={C.churchTrim} strokeWidth={3} strokeLinecap="round" />
          </g>
        );
      })}

      {/* Central tower */}
      <Box a0={mid - tw} a1={mid + tw} b0={fb} b1={b0 + 0.3} z0={0} z1={306} front={C.church} side={C.churchSide} top={C.churchTrim} />
      {[mid - tw, mid + tw - 12].map((a) => <polygon key={a} points={face(a, a + 12, fb, 0, 300)} fill="#E9C553" />)}
      {[96, 196].map((h) => <polygon key={h} points={face(mid - tw - 4, mid + tw + 4, fb, h, h + 6)} fill={C.churchTrim} />)}
      <LatticeWindow a0={mid - 16} a1={mid + 16} b={fb} z0={108} z1={290} cols={3} />
      {/* Arched main door with its fanlight */}
      <path d={`M${door.bl[0]} ${door.bl[1]} L${door.l[0]} ${door.l[1]} A19 19 0 0 1 ${door.r[0]} ${door.r[1]} L${door.br[0]} ${door.br[1]} Z`} fill={C.arch} stroke={C.churchTrim} strokeWidth={3} />
      <path d={`M${door.l[0]} ${door.l[1]} A19 19 0 0 1 ${door.r[0]} ${door.r[1]} Z`} fill="#3D5E7A" />
      <line x1={(door.l[0] + door.r[0]) / 2} y1={door.l[1] - 19} x2={(door.l[0] + door.r[0]) / 2} y2={door.bl[1]} stroke="#3E2416" strokeWidth={1.5} />
      {/* Cornice, balustrade, clock stage, stepped cap, cross */}
      <Box a0={mid - tw - 8} a1={mid + tw + 8} b0={fb - 0.03} b1={b0 + 0.33} z0={300} z1={310} front={C.churchTrim} side={C.trimSide} top={C.churchTrim} />
      <Balustrade a0={mid - 46} a1={mid + 46} b={fb} z={310} h={16} />
      <Box a0={mid - 32} a1={mid + 32} b0={fb + 0.02} b1={b0 + 0.25} z0={326} z1={372} front={C.churchTrim} side={C.trimSide} top={C.churchTrim} />
      <polygon points={face(mid - 25, mid + 25, fb + 0.02, 330, 368)} fill={C.church} />
      <circle cx={cx} cy={cy} r={15} fill="#FFFFFF" stroke="#3A2A1C" strokeWidth={2} />
      <path d={`M${cx} ${cy} L${cx} ${cy - 10} M${cx} ${cy} L${cx + 7} ${cy + 2}`} stroke={C.ink} strokeWidth={2} strokeLinecap="round" />
      <Box a0={mid - 38} a1={mid + 38} b0={fb} b1={b0 + 0.27} z0={372} z1={378} front={C.churchTrim} side={C.trimSide} top={C.churchTrim} />
      <Box a0={mid - 24} a1={mid + 24} b0={fb + 0.03} b1={b0 + 0.22} z0={378} z1={390} front={C.church} side={C.churchSide} top={C.churchTop} />
      <Box a0={mid - 12} a1={mid + 12} b0={fb + 0.05} b1={b0 + 0.18} z0={390} z1={398} front={C.church} side={C.churchSide} top={C.churchTop} />
      <path d={`M${crossX} ${crossY} v-44 M${crossX - 13} ${crossY - 30} h26`} stroke="#D4A537" strokeWidth={6} strokeLinecap="round" />

      {/* Wide red steps with two dark stripes, railed terraces either side */}
      {[0, 1, 2].map((i) => (
        <Box key={i} a0={a0 + 14 + i * 10} a1={a1 - 14 - i * 10} b0={b0 - 0.42 + i * 0.12} b1={b0 - 0.02} z0={i * 9} z1={(i + 1) * 9} front={C.trimSide} side={C.trimSide} top={C.trim} />
      ))}
      {[mid - 62, mid + 50].map((a) => <polygon key={a} points={poly(pt(a, b0 - 0.42, 9), pt(a + 12, b0 - 0.42, 9), pt(a + 12, b0 - 0.02, 27), pt(a, b0 - 0.02, 27))} fill="#2E2A2B" opacity={0.85} />)}
      {[a0 - 40, a1 - 6].map((a) => (
        <g key={a}>
          <Box a0={a} a1={a + 46} b0={b0 - 0.4} b1={b0 - 0.02} z0={0} z1={26} front={C.cap} side={C.fenceSide} top={C.fence} />
          <Balustrade a0={a} a1={a + 46} b={b0 - 0.4} z={26} h={22} />
        </g>
      ))}
    </g>
  );
}

/** St Joseph holding the Child, on a lettered plinth in a round hedge bed. */
export function Statue() {
  const mid = (CHURCH.a0 + CHURCH.a1) / 2;
  const [x, y] = pt(mid, CHURCH.b0 - 0.75, 0);
  const stone = "#F7F5F1";
  const line = "#CFC9BF";
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={10} cy={4} rx={60} ry={18} fill="#24180C" opacity={0.18} />
      <ellipse cx={0} cy={0} rx={56} ry={19} fill="#E9E4DA" />
      <ellipse cx={0} cy={-4} rx={50} ry={15} fill={C.lawnEdge} />
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={Math.cos(t) * 40} cy={-6 + Math.sin(t) * 11} r={8} fill={i % 2 ? C.lawn : "#5E9F4A"} />;
      })}
      <rect x={-14} y={-40} width={28} height={34} fill={stone} stroke={line} />
      <text x={0} y={-26} textAnchor="middle" fontSize={5.2} fontWeight={700} fill="#4A4038">ST. JOSEPH</text>
      <text x={0} y={-19} textAnchor="middle" fontSize={4.6} fontWeight={700} fill="#4A4038">PRAY FOR US</text>
      {/* Robed figure, the Child on his left arm, a lily staff on his right */}
      <path d="M-10 -40 L-13 -86 Q-12 -96 0 -98 Q12 -96 13 -86 L10 -40 Z" fill={stone} stroke={line} />
      <path d="M-3 -96 Q-4 -60 -6 -40 M4 -90 Q6 -64 5 -40" stroke={line} strokeWidth={1} fill="none" />
      <circle cx={0} cy={-105} r={7} fill={stone} stroke={line} />
      <ellipse cx={-9} cy={-86} rx={6} ry={9} fill={stone} stroke={line} />
      <circle cx={-9} cy={-97} r={4.5} fill={stone} stroke={line} />
      <path d="M12 -44 L16 -112" stroke={line} strokeWidth={1.6} />
      <circle cx={16.5} cy={-114} r={3.5} fill={stone} stroke={line} />
    </g>
  );
}

/** Red clay-tile hip roof (front slope + right hip) with tile courses and ribs. */
function HipRoof({ a0, a1, b0, b1, z, ridge, inset = 70 }: { a0: number; a1: number; b0: number; b1: number; z: number; ridge: number; inset?: number }) {
  const eave = 16;
  const mid = (b0 + b1) / 2;
  const e0 = pt(a0 - eave, b0 - 0.1, z), e1 = pt(a1 + eave, b0 - 0.1, z);
  const r0 = pt(a0 + inset, mid, ridge), r1 = pt(a1 - inset, mid, ridge);
  const lerp = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const courses = 6, ribs = Math.round((a1 - a0) / 26);
  return (
    <g>
      <polygon points={poly(e0, e1, r1, r0)} fill={C.tile} />
      {Array.from({ length: courses - 1 }, (_, i) => {
        const f = (i + 1) / courses;
        return <line key={`c${i}`} x1={lerp(e0, r0, f)[0]} y1={lerp(e0, r0, f)[1]} x2={lerp(e1, r1, f)[0]} y2={lerp(e1, r1, f)[1]} stroke={C.tileSide} strokeOpacity={0.55} strokeWidth={2} />;
      })}
      {Array.from({ length: ribs - 1 }, (_, i) => {
        const f = (i + 1) / ribs;
        const lo = lerp(e0, e1, f), hi = lerp(r0, r1, Math.min(1, Math.max(0, (f * (a1 - a0 + 2 * eave) - eave - inset) / (a1 - a0 - 2 * inset))));
        return <line key={`r${i}`} x1={lo[0]} y1={lo[1]} x2={hi[0]} y2={hi[1]} stroke="#7E2E19" strokeOpacity={0.18} strokeWidth={1.5} />;
      })}
      <polygon points={poly(e0, e1, r1, r0)} fill="url(#vc-front)" />
      <polygon points={poly(e1, r1, pt(a1 + eave, b1 + 0.1, z))} fill={C.tileSide} />
      <polygon points={poly(e1, r1, pt(a1 + eave, b1 + 0.1, z))} fill="url(#vc-side)" />
      <polygon points={poly(e0, e1, pt(a1 + eave, b0 - 0.1, z - 5), pt(a0 - eave, b0 - 0.1, z - 5))} fill={C.tileSide} />
      <line x1={r0[0]} y1={r0[1]} x2={r1[0]} y2={r1[1]} stroke="#8E3420" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/**
 * The green rooms behind the seminary: two storeys of cream walls with a
 * verandah of arches on each floor, timber shutters, and a red tile hip roof.
 */
export function GreenRooms() {
  const { a0, a1, b0, b1, z, ridge } = GREEN_ROOMS;
  const bays = 9;
  const step = (a1 - a0) / bays;
  const storey = z / 2;
  return (
    <g>
      <Box a0={a0} a1={a1} b0={b0} b1={b1} z0={0} z1={z} front="#F1E7D2" side="#DCCDB0" top="#DCCDB0" />
      <polygon points={face(a0, a1, b0, storey - 6, storey + 2)} fill="#C9B48E" />
      {[0, 1].map((s) =>
        Array.from({ length: bays }, (_, i) => {
          const a = a0 + i * step + step * 0.22;
          const w = step * 0.56;
          const zb = s * storey + 8, zt = zb + storey * 0.62;
          const [ax, ay] = pt(a, b0, zt);
          const [bx, by] = pt(a + w, b0, zt);
          return (
            <path key={`${s}-${i}`} d={`M${pt(a, b0, zb).join(" ")} L${ax} ${ay} Q${(ax + bx) / 2} ${(ay + by) / 2 - w * 0.5} ${bx} ${by} L${pt(a + w, b0, zb).join(" ")} Z`} fill={s ? "#5B3A24" : C.arch} />
          );
        }),
      )}
      <HipRoof a0={a0} a1={a1} b0={b0} b1={b1} z={z} ridge={ridge} inset={90} />
    </g>
  );
}

/** The hall: white walls, an arcade of arches, a row of windows, a red hip roof. */
export function Hall() {
  const { a0, a1, b0, b1, z, ridge } = HALL;
  const arches = 7;
  const step = (a1 - a0) / arches;
  return (
    <g>
      <Box a0={a0} a1={a1} b0={b0} b1={b1} z0={0} z1={z} front={C.hall} side={C.hallSide} top={C.hallSide} />
      <polygon points={face(a0, a1, b0, 0, 8)} fill={C.hallSide} />
      {Array.from({ length: arches }, (_, i) => {
        const a = a0 + i * step + step * 0.2;
        const w = step * 0.6;
        const [ax, ay] = pt(a, b0, 52);
        const [bx, by] = pt(a + w, b0, 52);
        return (
          <g key={i}>
            <path d={`M${pt(a, b0, 0).join(" ")} L${ax} ${ay} Q${(ax + bx) / 2} ${(ay + by) / 2 - w * 0.55} ${bx} ${by} L${pt(a + w, b0, 0).join(" ")} Z`} fill={C.arch} />
            <polygon points={face(a + w * 0.2, a + w * 0.8, b0, 70, 90)} fill={C.arch} opacity={0.85} />
          </g>
        );
      })}
      <HipRoof a0={a0} a1={a1} b0={b0} b1={b1} z={z} ridge={ridge} />
      {/* Hedge along the front */}
      {Array.from({ length: 14 }, (_, i) => {
        const [hx, hy] = pt(a0 + 12 + i * ((a1 - a0 - 24) / 13), b0 - 0.2, 0);
        return <ellipse key={i} cx={hx} cy={hy - 8} rx={15} ry={11} fill={i % 2 ? C.lawnEdge : C.lawn} />;
      })}
    </g>
  );
}

/** Compound wall along the road: cream panels, red pillars with caps, two black gates. */
export function CompoundWall() {
  const { a0, a1, front } = GROUNDS;
  const pillars: number[] = [];
  for (let a = a0 + 40; a < a1 - 20; a += 120) if (a < GATE.a0 - 10 || a > GATE.a1 + 10) pillars.push(a);
  pillars.push(GATE.a0 - 18, GATE.a1);
  const segs: [number, number][] = [[a0 + 40, GATE.a0 - 18], [GATE.a1 + 18, a1 - 20]];
  const gate = (a: number) => (
    <g key={`g${a}`}>
      {Array.from({ length: 5 }, (_, i) => <polygon key={i} points={poly(pt(a + i * 6, front, 0), pt(a + i * 6 + 2, front, 0), pt(a + i * 6 + 2, front, 40), pt(a + i * 6, front, 40))} fill="#1F1F24" />)}
    </g>
  );
  return (
    <g>
      {segs.map(([s0, s1]) => <Box key={s0} a0={s0} a1={s1} b0={front - 0.02} b1={front + 0.03} z0={0} z1={30} front={C.fence} side={C.fenceSide} top={C.pillar} />)}
      {gate(GATE.a0 + 2)}
      {gate(GATE.a1 - 28)}
      {pillars.sort((x, y) => x - y).map((a) => (
        <g key={a}>
          <Box a0={a} a1={a + 18} b0={front - 0.05} b1={front + 0.06} z0={0} z1={44} front={C.pillar} side={C.pillarSide} top={C.pillar} />
          <Box a0={a - 3} a1={a + 21} b0={front - 0.07} b1={front + 0.08} z0={44} z1={50} front={C.cap} side={C.fenceSide} top={C.cap} />
        </g>
      ))}
    </g>
  );
}
