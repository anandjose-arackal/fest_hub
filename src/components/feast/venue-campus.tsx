// Isometric drawing kit for the venue map (src/components/feast/venue-map.tsx)
// and the rest of the campus around the school, as in the venue photo: the
// church with its clock tower in the middle, the white hall with the red tile
// roof on the right, the paved plaza with its statue, the sand ground in
// front of the hall, the compound wall with its gates, and the road.
// Colours follow the photo, so they stay the same under every theme.

export const L = 1000; // school facade length
export const K = 0.2; // facade rise per unit of length
export const H = 96; // school floor height
export const WX = -130; // depth vector (front → back), x
export const WY = -84; // depth vector, y
export const PARAPET = 16;

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

// The rest of the campus sits past the school's right end, in a (along the
// facade) and b (depth) units like the school.
export const CHURCH = { a0: L + 430, a1: L + 600, b0: 0.6, b1: 1.8, z: 190, tower: 330 };
export const HALL = { a0: L + 700, a1: L + 1100, b0: 0.25, b1: 1.15, z: 100, ridge: 150 };
export const GROUNDS = { a0: -60, a1: L + 1170, front: -1.35, back: 2.1 };
export const GATE = { a0: L + 290, a1: L + 410 };

export type Pt = [number, number];
/** a: along the facade · b: depth (0 = school facade, 1 = its back wall, < 0 = in front) · z: height. */
export function pt(a: number, b: number, z: number): Pt {
  return [a + b * WX, -K * a + b * WY - z];
}
export function poly(...pts: Pt[]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
/** Flat patch of ground. */
export function patch(a0: number, a1: number, b0: number, b1: number, z = 0): string {
  return poly(pt(a0, b0, z), pt(a1, b0, z), pt(a1, b1, z), pt(a0, b1, z));
}

/** Axis-aligned box: front (b0), left (a0) and top faces — the ones this view sees. */
export function Box({ a0, a1, b0, b1, z0, z1, front, side, top }: { a0: number; a1: number; b0: number; b1: number; z0: number; z1: number; front: string; side: string; top: string }) {
  return (
    <g>
      <polygon points={poly(pt(a0, b0, z0), pt(a0, b1, z0), pt(a0, b1, z1), pt(a0, b0, z1))} fill={side} />
      <polygon points={poly(pt(a0, b0, z0), pt(a1, b0, z0), pt(a1, b0, z1), pt(a0, b0, z1))} fill={front} />
      <polygon points={poly(pt(a0, b0, z1), pt(a1, b0, z1), pt(a1, b1, z1), pt(a0, b1, z1))} fill={top} />
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
      <ellipse cx={0} cy={0} rx={26} ry={9} fill={C.lawnEdge} />
      <rect x={-5} y={-34} width={10} height={34} rx={3} fill={C.trunk} />
      <circle cx={0} cy={-58} r={32} fill={C.tree} />
      <circle cx={-12} cy={-68} r={17} fill={C.treeHi} />
    </g>
  );
}

export function Palm({ a, b, s = 1 }: { a: number; b: number; s?: number }) {
  const [x, y] = pt(a, b, 0);
  const fronds = [-150, -115, -80, -50, -15, 20];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C 4 -50, 14 -100, 10 -150" fill="none" stroke={C.palmTrunk} strokeWidth={8} strokeLinecap="round" />
      {fronds.map((r, i) => (
        <ellipse key={r} cx={10} cy={-150} rx={46} ry={9} fill={i % 2 ? C.palmHi : C.palm} transform={`rotate(${r} 10 -150) translate(36 0)`} />
      ))}
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
  return (
    <g>
      <polygon points={patch(a0, a1, front, back)} fill={C.lawn} />
      {/* Road and its kerb */}
      <polygon points={patch(a0, a1, front - 0.42, front - 0.06)} fill={C.road} />
      <polygon points={patch(a0, a1, front - 0.06, front)} fill={C.pillarSide} opacity={0.55} />
      {Array.from({ length: 12 }, (_, i) => {
        const s = a0 + 40 + i * 95;
        return <polygon key={i} points={patch(s, s + 50, front - 0.26, front - 0.22)} fill={C.roadLine} />;
      })}
      {/* Paved plaza in front of the school and up to the church steps */}
      <polygon points={patch(a0 + 30, HALL.a0 - 40, front, 0.05)} fill={C.paving} />
      <polygon points={patch(CHURCH.a0 - 110, HALL.a0 - 40, 0, CHURCH.b0)} fill={C.paving} />
      <polygon points={stripe(gateMid - 50, chMid - 45)} fill={C.pavingDark} opacity={0.75} />
      <polygon points={stripe(gateMid + 50, chMid + 45)} fill={C.pavingDark} opacity={0.75} />
      {/* Paving strip along the hall, sand ground in front of it */}
      <polygon points={patch(HALL.a0 - 40, a1 - 20, HALL.b0 - 0.35, HALL.b0)} fill={C.paving} />
      <polygon points={patch(HALL.a0 - 40, a1 - 20, front, HALL.b0 - 0.35)} fill={C.sand} />
      <polygon points={patch(HALL.a0 - 40, HALL.a0 - 30, front, HALL.b0 - 0.35)} fill={C.pavingDark} opacity={0.6} />
    </g>
  );
}

/** The church: yellow nave, red trim, lattice windows, clock tower with a cross, red steps. */
export function Church() {
  const { a0, a1, b0, b1, z, tower } = CHURCH;
  const mid = (a0 + a1) / 2;
  const tw = 36;
  const [cx, cy] = pt(mid, b0 - 0.06, tower - 52);
  const [crossX, crossY] = pt(mid, b0 + 0.1, tower + 18);
  return (
    <g>
      <Box a0={a0} a1={a1} b0={b0} b1={b1} z0={0} z1={z} front={C.church} side={C.churchSide} top={C.churchTop} />
      {/* Trim bands and the gable parapet */}
      {[z * 0.42, z - 10].map((h) => <polygon key={h} points={face(a0, a1, b0, h, h + 7)} fill={C.churchTrim} />)}
      <Box a0={a0 - 6} a1={a1 + 6} b0={b0 - 0.03} b1={b0 + 0.08} z0={z} z1={z + 14} front={C.churchTrim} side={C.trimSide} top={C.cap} />
      {/* Corner pinnacles */}
      {[a0 + 4, a1 - 22].map((a) => <Box key={a} a0={a} a1={a + 18} b0={b0 - 0.04} b1={b0 + 0.1} z0={z} z1={z + 46} front={C.church} side={C.churchSide} top={C.churchTrim} />)}
      {/* Lattice windows either side of the tower */}
      {[a0 + 20, a1 - 48].map((a) => (
        <g key={a}>
          <polygon points={face(a, a + 28, b0, 70, 160)} fill={C.churchTrim} />
          <polygon points={face(a + 4, a + 24, b0, 74, 156)} fill={C.lattice} />
        </g>
      ))}
      {/* Clock tower, standing a little proud of the front */}
      <Box a0={mid - tw} a1={mid + tw} b0={b0 - 0.08} b1={b0 + 0.3} z0={0} z1={tower} front={C.church} side={C.churchSide} top={C.churchTrim} />
      {[120, 200, tower - 90, tower - 14].map((h) => <polygon key={h} points={face(mid - tw, mid + tw, b0 - 0.08, h, h + 6)} fill={C.churchTrim} />)}
      <polygon points={face(mid - 10, mid + 10, b0 - 0.08, 130, 190)} fill={C.lattice} />
      <polygon points={face(mid - 18, mid + 18, b0 - 0.08, 0, 70)} fill={C.arch} />
      <circle cx={cx} cy={cy} r={17} fill="#FFFFFF" stroke={C.churchTrim} strokeWidth={4} />
      <path d={`M${cx} ${cy} L${cx} ${cy - 10} M${cx} ${cy} L${cx + 8} ${cy + 3}`} stroke={C.ink} strokeWidth={2.5} strokeLinecap="round" />
      <path d={`M${crossX} ${crossY} v-46 M${crossX - 14} ${crossY - 32} h28`} stroke="#B8862E" strokeWidth={6} strokeLinecap="round" />
      {/* Red steps and the low balustrade */}
      <Box a0={mid - 80} a1={mid + 80} b0={b0 - 0.32} b1={b0 - 0.08} z0={0} z1={10} front={C.trimSide} side={C.trimSide} top={C.trim} />
      <Box a0={mid - 64} a1={mid + 64} b0={b0 - 0.2} b1={b0 - 0.08} z0={10} z1={20} front={C.trimSide} side={C.trimSide} top={C.trim} />
      {[a0 - 30, mid + 80].map((a) => <Box key={a} a0={a} a1={a + (mid - 80 - (a0 - 30))} b0={b0 - 0.3} b1={b0 - 0.22} z0={0} z1={28} front={C.cap} side={C.fenceSide} top={C.pillar} />)}
    </g>
  );
}

/** The statue on its round flower bed in the plaza, in front of the church. */
export function Statue() {
  const mid = (CHURCH.a0 + CHURCH.a1) / 2;
  const [x, y] = pt(mid, 0.12, 0);
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={0} rx={56} ry={19} fill={C.lawnEdge} stroke="#F4EBDD" strokeWidth={5} />
      <ellipse cx={0} cy={-4} rx={40} ry={12} fill={C.lawn} />
      <rect x={-12} y={-34} width={24} height={30} fill="#F2EEE8" stroke="#D6D0C6" />
      <path d="M-9 -34 L-12 -78 Q0 -86 12 -78 L9 -34 Z" fill="#FFFFFF" stroke="#D6D0C6" />
      <circle cx={0} cy={-90} r={8} fill="#FFFFFF" stroke="#D6D0C6" />
    </g>
  );
}

/** The hall: white walls, an arcade of arches, a row of windows, a red hip roof. */
export function Hall() {
  const { a0, a1, b0, b1, z, ridge } = HALL;
  const arches = 7;
  const step = (a1 - a0) / arches;
  const mid = (b0 + b1) / 2;
  const eave = 16;
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
      {/* Hip roof: front slope and the left hip, overhanging the walls */}
      <polygon points={poly(pt(a0 - eave, b0 - 0.1, z), pt(a1 + eave, b0 - 0.1, z), pt(a1 - 70, mid, ridge), pt(a0 + 70, mid, ridge))} fill={C.tile} />
      <polygon points={poly(pt(a0 - eave, b0 - 0.1, z), pt(a0 + 70, mid, ridge), pt(a0 - eave, b1 + 0.1, z))} fill={C.tileSide} />
      <polygon points={poly(pt(a0 - eave, b0 - 0.1, z), pt(a1 + eave, b0 - 0.1, z), pt(a1 + eave, b0 - 0.1, z - 5), pt(a0 - eave, b0 - 0.1, z - 5))} fill={C.tileSide} />
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
