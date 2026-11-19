/* 0.8（art-tree）：五種樹的模型（照參考圖 樹-五種.png）：松樹、杉樹、闊葉橡樹、白樺、枯樹。
   全部程式生成、頂點色（沒有貼圖）、一種樹一個原型；每種有兩個變體（同拓樸、不同亂數種子），變體用「position2／normal2 ＋ 每棵一個 aVar」在頂點著色器裡混合，
   所以一個格子一種樹仍然只畫一次（不因為變體多一次繪製）。
   座標單位：模型單位（s＝1 時的樹，地面 y＝0、樹幹中心在 x＝z＝0）。世界裡的實際大小：scale＝s（6–10 m 級），樹幹底部到樹冠底的那一段在著色器裡拉長（aLift，同舊樹）：
   aPart＝0（樹幹與枝）在 y < yb 的部分拉長加粗；aPart＝1（樹冠）整個往上平移 aLift。
   給 world.js：buildTreeProtos(false) → { oak, pine, fir, birch, dead }（各有 parts、tree{yb,thk,H,R,rf,y0}、morph、inject、depth）；SP＝種類編號。 */
import * as THREE from './three.bundle.js';

export const SP = { pine: 0, fir: 1, oak: 2, birch: 3, dead: 4 };
export const SP_NAMES = ['pine', 'fir', 'oak', 'birch', 'dead'];

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cl = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth01 = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/* ---------- 累積器：頂點（位置、顏色、部位）、三角形（用「裡面的點」決定正反面）、平滑法線 ---------- */
class Acc {
  constructor() { this.P = []; this.C = []; this.A = []; this.I = []; }
  v(x, y, z, c, part) { this.P.push(x, y, z); this.C.push(c[0], c[1], c[2]); this.A.push(part); return this.P.length / 3 - 1; }
  tri(a, b, c, ref) {
    const P = this.P, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (ax + P[b * 3] + P[c * 3]) / 3 - ref[0], cy = (ay + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - ref[1], cz = (az + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - ref[2];
    if (nx * cx + ny * cy + nz * cz >= 0) this.I.push(a, b, c); else this.I.push(a, c, b);
  }
  normals() {
    const P = this.P, N = new Float32Array(P.length);
    for (let k = 0; k < this.I.length; k += 3) {
      const a = this.I[k], b = this.I[k + 1], c = this.I[k + 2];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { N[i * 3] += nx; N[i * 3 + 1] += ny; N[i * 3 + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }
}

/* ---------- 圖元 ---------- */
/* 管：沿折線 pts（[x,y,z]）走、每一圈半徑 rad[i]、sides 邊；ridge＝樹皮的粗糙程度（每個頂點的半徑亂數）；lobe[i]＝這圈的根部張開（3 個大瓣）
   col(i, j, n) 給頂點色；頂端收成一個點（tip 預設 true） */
function tube(A, rnd, pts, rad, sides, o) {
  const n = pts.length, rings = [], part = o.part || 0, ridge = o.ridge == null ? 0.14 : o.ridge, ph = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n - 1, i + 1)];
    let tx = q1[0] - q0[0], ty = q1[1] - q0[1], tz = q1[2] - q0[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let rx = Math.abs(tz) < 0.9 ? 0 : 1, ry = 0, rz = Math.abs(tz) < 0.9 ? 1 : 0;
    let ux = ry * tz - rz * ty, uy = rz * tx - rx * tz, uz = rx * ty - ry * tx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const a = j / sides * 6.2832 + (o.twist || 0) * i, lb = o.lobe && o.lobe[i] ? 1 + o.lobe[i] * Math.pow(0.5 + 0.5 * Math.cos(3 * a + ph), 1.6) : 1;
      const r = rad[i] * lb * (1 + ridge * (rnd() - 0.5) * 2 + (o.groove ? (j % 2 ? -o.groove : o.groove) : 0));
      ring.push(A.v(p[0] + (ux * Math.cos(a) + vx * Math.sin(a)) * r, p[1] + (uy * Math.cos(a) + vy * Math.sin(a)) * r, p[2] + (uz * Math.cos(a) + vz * Math.sin(a)) * r, o.col(i, j, n), part));
    }
    rings.push(ring);
  }
  const ref = (i) => pts[i];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const j2 = (j + 1) % sides, a = rings[i][j], b = rings[i][j2], c = rings[i + 1][j], d = rings[i + 1][j2], r0 = ref(i), r1 = ref(i + 1), rf = [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2, (r0[2] + r1[2]) / 2];
    A.tri(a, b, c, rf); A.tri(b, d, c, rf);
  }
  if (o.tip !== false) { const e = pts[n - 1], t = A.v(e[0] + (e[0] - pts[n - 2][0]) * 0.3, e[1] + (e[1] - pts[n - 2][1]) * 0.3, e[2] + (e[2] - pts[n - 2][2]) * 0.3, o.col(n - 1, 0, n), part); for (let j = 0; j < sides; j++) A.tri(rings[n - 1][j], rings[n - 1][(j + 1) % sides], t, pts[n - 1]); }
  return rings;
}

/* 球（二十面體細分一次：42 個頂點、80 個面），每個頂點亂數凹凸；顏色由下往上：bot→mid→top，再乘上整體的高度明暗（呼叫端後處理） */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map(), out = []; const m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid.has(k)) return mid.get(k); const p = V[a].map((x, i) => x + V[b][i]), l = Math.hypot(...p); V.push(p.map(x => x / l)); mid.set(k, V.length - 1); return V.length - 1; };
  for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return { V, F: out, V0: V.slice(0, 12), F0: F };
})();
function blob(A, rnd, c, rx, ry, rz, o) {
  const part = o.part == null ? 1 : o.part, amp = o.amp == null ? 0.16 : o.amp, ids = [], ph = rnd() * 6.28, VV = o.lo ? ICO.V0 : ICO.V, FF = o.lo ? ICO.F0 : ICO.F;
  for (const d of VV) {
    const k = 1 + amp * (rnd() - 0.5) * 2 + (o.lobes ? o.lobes * Math.sin(d[0] * 3.1 + ph) * Math.sin(d[2] * 2.7 - ph) : 0), t = d[1] * 0.5 + 0.5;
    let col = t < 0.5 ? mix3(o.bot, o.mid, smooth01(0, 0.5, t)) : mix3(o.mid, o.top, smooth01(0.5, 1, t));
    col = mul3(col, 1 + (rnd() - 0.5) * 0.1);
    ids.push(A.v(c[0] + d[0] * rx * k, c[1] + d[1] * ry * k, c[2] + d[2] * rz * k, col, part));
  }
  for (const [a, b, d] of FF) A.tri(ids[a], ids[b], ids[d], c);
}

/* 針葉樹的一層：往下垂、邊緣鋸齒、不規則的裙擺。M 個葉瓣（外緣 2M 個點：偶數是瓣尖往下垂，奇數是凹口）。
   yTop＝這層頂（靠樹幹）的高度，drop＝外緣比頂低多少，R＝半徑，col＝{top, mid, edge, under} */
function skirt(A, rnd, o) {
  const { M, yTop, drop, R, cx = 0, cz = 0, col } = o, rot = rnd() * 6.28, top = o.spire != null, ref = [cx, yTop - drop * 0.5 - 0.25, cz];
  const inner = [], mid = [], edge = [], under = [], core = A.v(cx, yTop - drop * 0.25, cz, col.under, 1);
  const hi = M, ho = 2 * M;
  for (let i = 0; i < hi; i++) { const a = rot + i / hi * 6.2832 + (rnd() - 0.5) * 0.3, r = R * (top ? 0.01 : 0.14 + 0.05 * rnd()); inner.push(A.v(cx + Math.sin(a) * r, yTop + (top ? o.spire : 0) + 0.015 * rnd(), cz + Math.cos(a) * r, col.top, 1)); }
  for (let i = 0; i < ho; i++) {
    const a = rot + i / ho * 6.2832 + (rnd() - 0.5) * 0.18, tip = i % 2 === 0, jr = 1 + (rnd() - 0.5) * 0.34, r = R * (tip ? 1.0 * jr : 0.82 * (1 + (rnd() - 0.5) * 0.2));
    const yE = yTop - drop - (tip ? o.droop * (0.7 + 0.6 * rnd()) : -o.droop * 0.35), rm = r * 0.55, ym = yTop - drop * 0.42 + 0.03 * rnd();
    mid.push(A.v(cx + Math.sin(a) * rm, ym, cz + Math.cos(a) * rm, mix3(col.top, col.mid, 0.6), 1));
    edge.push(A.v(cx + Math.sin(a) * r, yE, cz + Math.cos(a) * r, tip ? col.edge : mix3(col.edge, col.under, 0.5), 1));
    under.push(A.v(cx + Math.sin(a) * r * 0.98, yE - 0.002, cz + Math.cos(a) * r * 0.98, col.under, 1));
  }
  if (o.noMid) {      /* 低面數：頂圈直接接外緣（沒有中圈） */
    for (let i = 0; i < hi; i++) { const a = inner[i], b = inner[(i + 1) % hi]; A.tri(a, edge[2 * i], edge[2 * i + 1], ref); A.tri(a, edge[2 * i + 1], b, ref); A.tri(b, edge[2 * i + 1], edge[(2 * i + 2) % ho], ref); }
  } else {
  /* 頂 → 中 → 緣：頂圈 M 點對中圈 2M 點 */
  for (let i = 0; i < hi; i++) { const a = inner[i], b = inner[(i + 1) % hi], m0 = mid[2 * i], m1 = mid[2 * i + 1], m2 = mid[(2 * i + 2) % ho]; A.tri(a, m0, m1, ref); A.tri(a, m1, b, ref); A.tri(b, m1, m2, ref); }
  for (let i = 0; i < ho; i++) { const j = (i + 1) % ho; A.tri(mid[i], edge[i], mid[j], ref); A.tri(mid[j], edge[i], edge[j], ref); }
  }
  const refUp = [cx, yTop + 0.5, cz];
  for (let i = 0; i < ho; i++) A.tri(under[i], under[(i + 1) % ho], core, refUp);
}

/* ---------- 顏色 ---------- */
const COL = {
  pine: { top: hex(0x78c456), mid: hex(0x4f9d42), edge: hex(0x3b8638), under: hex(0x3a7c42) },
  fir: { top: hex(0x4aa864), mid: hex(0x2f8650), edge: hex(0x247243), under: hex(0x2a6a47) },
  oak: { top: hex(0xa2d24e), mid: hex(0x6fb43c), bot: hex(0x3b7a2e) },
  birch: { top: hex(0xd4de58), mid: hex(0xaecb40), bot: hex(0x6c9a2c) },
  bark: hex(0x8a6a50), barkD: hex(0x57402f), barkL: hex(0xaa8a6c),
  birchW: hex(0xece3d0), birchB: hex(0x2a2522), birchBr: hex(0xa08868),
  dead: hex(0xa59588), deadD: hex(0x6c5f58), deadL: hex(0xcfc3b6)
};

/* 樹幹顏色：底部略深、縱向的粗細條紋深淺交替 */
const barkCol = (base, dark, light, rnd) => (i, j, n) => { const t = i / (n - 1), s = (j % 2) ? 0.72 : 1.0; return mul3(mix3(base, (j % 3 === 0) ? light : dark, 0.18 + 0.2 * rnd()), s * (0.9 + 0.1 * t)); };

/* ---------- 各種樹（每個函式回傳累積器；seed 不同＝變體，拓樸相同） ---------- */
function mkPine(seed) {
  const rnd = mulberry(seed), A = new Acc(), bk = barkCol(COL.bark, COL.barkD, COL.barkL, rnd);
  /* 樹幹：根部張開、往上收，一直到樹冠頂。yb＝0.20（拉長邊界） */
  const pts = [[0, -0.03, 0], [0.002, 0.02, 0], [0, 0.07, 0.004], [0, 0.20, 0], [0.004, 0.45, 0.006], [0.0, 0.75, 0], [0, 1.05, 0], [0, 1.28, 0]], rad = [0.075, 0.062, 0.056, 0.052, 0.045, 0.034, 0.022, 0.008];
  tube(A, rnd, pts, rad, 9, { col: bk, lobe: [0.6, 0.35, 0.06, 0, 0, 0, 0, 0], part: 0, ridge: 0.14, groove: 0.1 });
  const R = [0.56, 0.49, 0.40, 0.30, 0.2], yT = [0.64, 0.79, 0.93, 1.06, 1.17], dr = [0.36, 0.33, 0.29, 0.25, 0.2];
  for (let k = 0; k < 5; k++) {
    const c = COL.pine, sh = 1.0 - k * 0.0, f = mul3;
    skirt(A, rnd, { M: 6, yTop: yT[k] + (rnd() - 0.5) * 0.03, drop: dr[k], R: R[k] * (0.92 + 0.16 * rnd()), droop: 0.09, cx: (rnd() - 0.5) * 0.04, cz: (rnd() - 0.5) * 0.04, spire: k === 4 ? 0.2 : undefined, col: { top: f(c.top, sh), mid: f(c.mid, sh), edge: f(c.edge, sh), under: f(c.under, sh) } });
  }
  return A;
}
function mkFir(seed) {
  const rnd = mulberry(seed), A = new Acc(), bk = barkCol(COL.bark, COL.barkD, COL.barkL, rnd);
  const pts = [[0, -0.03, 0], [0.002, 0.02, 0], [0, 0.07, 0.004], [0, 0.20, 0], [0.003, 0.5, 0.004], [0, 0.85, 0], [0, 1.15, 0], [0, 1.36, 0]], rad = [0.068, 0.056, 0.05, 0.046, 0.038, 0.03, 0.018, 0.007];
  tube(A, rnd, pts, rad, 9, { col: bk, lobe: [0.6, 0.35, 0.06, 0, 0, 0, 0, 0], part: 0, ridge: 0.14, groove: 0.1 });
  const R = [0.40, 0.355, 0.30, 0.24, 0.18, 0.115], yT = [0.55, 0.68, 0.81, 0.93, 1.05, 1.16], dr = [0.31, 0.28, 0.25, 0.22, 0.19, 0.16];
  for (let k = 0; k < 6; k++) {
    const c = COL.fir;
    skirt(A, rnd, { M: 7, yTop: yT[k] + (rnd() - 0.5) * 0.025, drop: dr[k], R: R[k] * (0.92 + 0.16 * rnd()), droop: 0.09, cx: (rnd() - 0.5) * 0.03, cz: (rnd() - 0.5) * 0.03, spire: k === 5 ? 0.2 : undefined, col: c });
  }
  return A;
}
function mkOak(seed) {
  const rnd = mulberry(seed), A = new Acc(), bk = barkCol(COL.bark, COL.barkD, COL.barkL, rnd), j = () => (rnd() - 0.5);
  /* 樹幹：根部張開，到 y＝0.28 分叉成三枝（各通到一團大葉簇的下面）；yb＝0.28 */
  const lean = [j() * 0.04, j() * 0.04];
  tube(A, rnd, [[0, -0.03, 0], [0.004, 0.03, 0.004], [lean[0] * 0.4, 0.12, lean[1] * 0.4], [lean[0], 0.21, lean[1]], [lean[0] * 1.1, 0.30, lean[1] * 1.1]], [0.082, 0.066, 0.056, 0.05, 0.046], 9, { col: bk, lobe: [0.6, 0.35, 0.08, 0, 0], part: 0, ridge: 0.17, groove: 0.1 });
  const base = [lean[0] * 1.1, 0.30, lean[1] * 1.1], BR = [[-0.24, 0.62, 0.05], [0.2, 0.68, -0.12], [0.0, 0.8, 0.2], [0.02, 0.9, -0.1]];
  for (let b = 0; b < BR.length; b++) {
    const e = BR[b], jj = [j() * 0.05, j() * 0.05];
    tube(A, rnd, [base, [base[0] + (e[0] - base[0]) * 0.4 + jj[0], 0.45 + b * 0.02, base[2] + (e[2] - base[2]) * 0.4 + jj[1]], [e[0] + jj[0], e[1], e[2] + jj[1]]], [0.055 - b * 0.004, 0.04, 0.026], 6, { col: bk, part: 0, ridge: 0.12 });
  }
  /* 樹冠：幾團大葉簇（每團是凹凸的球），由下往上顏色漸亮 */
  const B = [[-0.29, 0.66, 0.02, 0.24], [0.27, 0.7, -0.1, 0.25], [0.04, 0.62, 0.28, 0.22], [-0.06, 0.64, -0.28, 0.21], [-0.2, 0.9, -0.14, 0.24], [0.2, 0.95, 0.12, 0.24], [0.0, 1.1, 0.0, 0.26],
    [-0.35, 0.82, 0.2, 0.13, 1], [0.36, 0.84, 0.14, 0.13, 1], [0.18, 0.7, 0.27, 0.12, 1], [-0.28, 0.72, -0.22, 0.12, 1], [0.3, 1.02, -0.12, 0.13, 1], [-0.22, 1.05, 0.12, 0.13, 1]];
  const c = COL.oak, y0 = 0.4, y1 = 1.3;
  for (const [x, y, z, r, lo] of B) {
    const rr = r * (0.94 + 0.12 * rnd()), p = [x + j() * 0.05, y + j() * 0.04, z + j() * 0.05];
    const n0 = A.P.length / 3;
    blob(A, rnd, p, rr * 1.12, rr * 0.9, rr * 1.12, { top: c.top, mid: c.mid, bot: c.bot, amp: lo ? 0.1 : 0.13, lobes: lo ? 0 : 0.1, lo: !!lo });
    for (let i = n0; i < A.P.length / 3; i++) { const t = smooth01(y0, y1, A.P[i * 3 + 1]), k = 0.72 + 0.4 * t; A.C[i * 3] *= k; A.C[i * 3 + 1] *= k; A.C[i * 3 + 2] *= k; }
  }
  return A;
}
function mkBirch(seed) {
  const rnd = mulberry(seed), A = new Acc(), j = () => (rnd() - 0.5), W = COL.birchW, B = COL.birchB;
  /* 白樺：白幹、黑斑（一圈裡幾個頂點是黑的）、細枝、黃綠小葉團；yb＝0.26。下半段（會被拉長、玩家看得到的那一段）的圈多一點，黑斑才看得到 */
  const ys = [-0.03, 0.02, 0.06, 0.10, 0.14, 0.18, 0.22, 0.26, 0.42, 0.58, 0.74, 0.9, 1.06, 1.2, 1.31], n = ys.length, pts = [], rad = [], dark = [];
  for (let i = 0; i < n; i++) { const t = (ys[i] + 0.03) / 1.34; pts.push([Math.sin(t * 2.4 + seed) * 0.014 * t, ys[i], Math.cos(t * 2.0) * 0.01 * t]); rad.push(i === 0 ? 0.058 : i === 1 ? 0.046 : 0.04 * (1 - t * 0.7)); dark.push(rnd() < (i < 8 ? 0.5 : 0.3) && i > 1 && i < 12 ? [Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 3)] : null); }
  tube(A, rnd, pts, rad, 8, { part: 0, ridge: 0.05, lobe: [0.3, 0.2, 0.05], col: (i, jx) => { const d = dark[i] || dark[i - 1]; let dk = 0; if (d) { const dj = (jx - d[0] + 8) % 8; dk = dj < d[1] ? 1 : 0; } if (i === 0) dk = Math.max(dk, 0.5); return mix3(mul3(W, 0.93 + 0.07 * (jx % 2)), B, dk * 0.92); } });
  const c = COL.birch, y0 = 0.45, y1 = 1.4, topY = 1.31;
  /* x、y、z、半徑（模型單位）、lo＝小團 */
  const L = [[-0.3, 0.62, 0.04, 0.17], [0.3, 0.68, -0.06, 0.16], [-0.06, 0.8, 0.26, 0.19], [0.22, 0.96, 0.1, 0.17], [-0.2, 1.06, -0.14, 0.17], [0.0, 1.2, 0.0, 0.2],
    [-0.38, 0.48, -0.1, 0.09, 1], [0.1, 0.5, 0.26, 0.09, 1], [0.38, 0.84, 0.06, 0.09, 1], [-0.36, 0.86, 0.06, 0.09, 1], [0.0, 0.7, -0.26, 0.09, 1]];
  for (let b = 0; b < L.length; b++) {
    const [x, y, z, r, lo] = L[b], sy = Math.min(topY, y * 0.62 + 0.02), k = (sy + 0.03) / 1.34 * (n - 1), q = pts[Math.min(n - 1, 8 + Math.floor((sy - 0.26) / 1.05 * 6.99))] || pts[n - 1];
    const mid = [q[0] + (x - q[0]) * 0.5 + j() * 0.03, q[1] + (y - 0.08 - q[1]) * 0.5, q[2] + (z - q[2]) * 0.5 + j() * 0.03];
    tube(A, rnd, [q, mid, [x * 0.97, y - 0.06, z * 0.97]], [0.016, 0.011, 0.007], 4, { part: 0, ridge: 0.1, col: () => COL.birchBr });
    const n0 = A.P.length / 3;
    blob(A, rnd, [x + j() * 0.03, y, z + j() * 0.03], r * 1.2, r * 1.0, r * 1.2, { top: c.top, mid: c.mid, bot: c.bot, amp: lo ? 0.1 : 0.17, lobes: lo ? 0 : 0.12, lo: !!lo });
    for (let i = n0; i < A.P.length / 3; i++) { const t = smooth01(y0, y1, A.P[i * 3 + 1]), kk = 0.82 + 0.3 * t; A.C[i * 3] *= kk; A.C[i * 3 + 1] *= kk; A.C[i * 3 + 2] *= kk; }
  }
  return A;
}
function mkDead(seed) {
  const rnd = mulberry(seed), A = new Acc(), j = () => (rnd() - 0.5);
  const col = (i, jx, n) => { const t = i / (n - 1), s = (jx % 2) ? 0.78 : 1.0, m = mix3(COL.dead, (jx % 3 === 0) ? COL.deadL : COL.deadD, 0.2 + 0.25 * rnd()); return mul3(m, s * (0.86 + 0.25 * t)); };
  /* 枯樹：灰白彎曲的主幹（微扭），往上分出幾根彎曲的粗枝，每根再分叉。yb＝0.30 */
  const tw = 0.06 + 0.04 * rnd(), tr = [[0, -0.03, 0], [0.004, 0.04, 0.004], [-0.02 * tw * 10, 0.14, 0.015], [-0.03, 0.30, 0.03 * 3], [0.0, 0.46, 0.05], [0.06, 0.62, 0.03], [0.08 + j() * 0.03, 0.8, -0.01], [0.04, 0.98, -0.04]];
  tube(A, rnd, tr, [0.125, 0.092, 0.072, 0.06, 0.05, 0.04, 0.03, 0.017], 8, { col, lobe: [0.65, 0.5, 0.18, 0, 0, 0, 0, 0], part: 0, ridge: 0.2, twist: 0.08 });
  const arm = (from, dir, len, r0, depth) => {
    const pts = [from]; let [x, y, z] = from, [dx, dy, dz] = dir; const n = 4;
    for (let i = 1; i <= n; i++) { const k = len / n; dx += j() * 0.5; dz += j() * 0.5; dy += 0.16; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; x += dx * k; y += dy * k; z += dz * k; pts.push([x, y, z]); }
    tube(A, rnd, pts, [r0, r0 * 0.78, r0 * 0.6, r0 * 0.42, r0 * 0.22], 6, { col, part: 0, ridge: 0.16 });
    if (depth > 0) { const q = pts[2], q2 = pts[3]; arm(q, [dx * 0.4 + (rnd() < 0.5 ? 1 : -1) * 0.7, 0.45, dz * 0.4 + j()], len * 0.55, r0 * 0.5, depth - 1); }
  };
  arm(tr[3], [-0.9, 0.25, 0.3], 0.5, 0.045, 1);
  arm(tr[4], [0.9, 0.3, 0.2], 0.55, 0.045, 1);
  arm(tr[5], [-0.4, 0.5, -0.8], 0.42, 0.036, 1);
  arm(tr[6], [0.8, 0.45, 0.0], 0.4, 0.03, 0);
  arm(tr[7], [-0.3, 0.9, 0.3], 0.3, 0.02, 0);
  return A;
}


/* ---------- 低面數版（預設；效能預算：同鏡頭三角形 ≤ +0.3M，舊樹平均約 135 個三角形／棵） ---------- */
function lowPine(seed, fir) {
  const rnd = mulberry(seed), A = new Acc(), bk = barkCol(COL.bark, COL.barkD, COL.barkL, rnd), c = fir ? COL.fir : COL.pine;
  const top = fir ? 1.36 : 1.28;
  tube(A, rnd, [[0, -0.03, 0], [0, 0.07, 0], [0, 0.20, 0], [0, 0.7, 0], [0, top, 0]], fir ? [0.068, 0.05, 0.046, 0.032, 0.007] : [0.075, 0.056, 0.052, 0.036, 0.008], 6, { col: bk, lobe: [0.6, 0.06, 0, 0, 0], part: 0, ridge: 0.14, groove: 0.1 });
  const R = fir ? [0.40, 0.34, 0.27, 0.2, 0.12] : [0.56, 0.46, 0.34, 0.2], yT = fir ? [0.55, 0.70, 0.85, 1.0, 1.14] : [0.64, 0.83, 1.0, 1.15], dr = fir ? [0.31, 0.27, 0.24, 0.2, 0.16] : [0.36, 0.31, 0.26, 0.2], n = R.length;
  for (let k = 0; k < n; k++) skirt(A, rnd, { M: 5, noMid: true, yTop: yT[k] + (rnd() - 0.5) * 0.03, drop: dr[k], R: R[k] * (0.92 + 0.16 * rnd()), droop: 0.09, cx: (rnd() - 0.5) * 0.03, cz: (rnd() - 0.5) * 0.03, spire: k === n - 1 ? 0.2 : undefined, col: c });
  return A;
}
function lowOak(seed) {
  const rnd = mulberry(seed), A = new Acc(), bk = barkCol(COL.bark, COL.barkD, COL.barkL, rnd), j = () => (rnd() - 0.5), lean = [j() * 0.04, j() * 0.04];
  tube(A, rnd, [[0, -0.03, 0], [0.004, 0.05, 0.004], [lean[0] * 0.5, 0.16, lean[1] * 0.5], [lean[0] * 1.1, 0.30, lean[1] * 1.1]], [0.082, 0.06, 0.052, 0.05], 6, { col: bk, lobe: [0.6, 0.1, 0, 0], part: 0, ridge: 0.14, groove: 0.1 });
  const base = [lean[0] * 1.1, 0.30, lean[1] * 1.1];
  for (const e of [[-0.22, 0.64, 0.05], [0.2, 0.68, -0.12], [0.02, 0.8, 0.2]]) tube(A, rnd, [base, [e[0], e[1], e[2]]], [0.05, 0.03], 4, { col: bk, part: 0, ridge: 0.1, tip: false });
  const B = [[-0.29, 0.66, 0.02, 0.29], [0.27, 0.7, -0.1, 0.3], [0.04, 0.62, 0.28, 0.27], [-0.06, 0.64, -0.28, 0.26], [-0.2, 0.9, -0.14, 0.29], [0.2, 0.95, 0.12, 0.29], [0.0, 1.1, 0.0, 0.31]];
  const c = COL.oak, y0 = 0.4, y1 = 1.3;
  for (const [x, y, z, r] of B) { const rr = r * (0.94 + 0.12 * rnd()), n0 = A.P.length / 3; blob(A, rnd, [x + j() * 0.05, y + j() * 0.04, z + j() * 0.05], rr * 1.1, rr * 0.92, rr * 1.1, { top: c.top, mid: c.mid, bot: c.bot, amp: 0.12, lo: true }); for (let i = n0; i < A.P.length / 3; i++) { const t = smooth01(y0, y1, A.P[i * 3 + 1]), k = 0.72 + 0.4 * t; A.C[i * 3] *= k; A.C[i * 3 + 1] *= k; A.C[i * 3 + 2] *= k; } }
  return A;
}
function lowBirch(seed) {
  const rnd = mulberry(seed), A = new Acc(), j = () => (rnd() - 0.5), W = COL.birchW, Bk = COL.birchB, c = COL.birch;
  const ys = [-0.03, 0.04, 0.12, 0.26, 0.6, 0.95, 1.31], n = ys.length, pts = [], rad = [], dark = [];
  for (let i = 0; i < n; i++) { const t = (ys[i] + 0.03) / 1.34; pts.push([Math.sin(t * 2.4 + seed) * 0.014 * t, ys[i], 0]); rad.push(i === 0 ? 0.058 : i === 1 ? 0.045 : 0.04 * (1 - t * 0.7)); dark.push(rnd() < 0.55 && i > 1 && i < 5 ? [Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 2)] : null); }
  tube(A, rnd, pts, rad, 6, { part: 0, ridge: 0.05, lobe: [0.3, 0.2], col: (i, jx) => { const d = dark[i] || dark[i - 1]; let dk = 0; if (d) dk = ((jx - d[0] + 6) % 6) < d[1] ? 1 : 0; return mix3(mul3(W, 0.93 + 0.07 * (jx % 2)), Bk, dk * 0.92); } });
  const L = [[-0.3, 0.62, 0.04, 0.2], [0.3, 0.68, -0.06, 0.19], [-0.08, 0.8, 0.26, 0.22], [0.22, 0.96, 0.1, 0.2], [0.0, 1.2, 0.0, 0.23]], y0 = 0.45, y1 = 1.4;
  for (const [x, y, z, r] of L) { const q = pts[Math.min(n - 1, 3 + Math.floor((y - 0.4) / 0.9 * 3))]; tube(A, rnd, [q, [x * 0.97, y - 0.06, z * 0.97]], [0.016, 0.008], 4, { part: 0, ridge: 0.1, col: () => COL.birchBr, tip: false }); const n0 = A.P.length / 3; blob(A, rnd, [x + j() * 0.03, y, z + j() * 0.03], r * 1.2, r * 1.0, r * 1.2, { top: c.top, mid: c.mid, bot: c.bot, amp: 0.14, lo: true }); for (let i = n0; i < A.P.length / 3; i++) { const t = smooth01(y0, y1, A.P[i * 3 + 1]), kk = 0.82 + 0.3 * t; A.C[i * 3] *= kk; A.C[i * 3 + 1] *= kk; A.C[i * 3 + 2] *= kk; } }
  return A;
}
function lowDead(seed) {
  const rnd = mulberry(seed), A = new Acc(), j = () => (rnd() - 0.5);
  const col = (i, jx, n) => { const t = i / (n - 1), s = (jx % 2) ? 0.78 : 1.0, m = mix3(COL.dead, (jx % 3 === 0) ? COL.deadL : COL.deadD, 0.2 + 0.25 * rnd()); return mul3(m, s * (0.9 + 0.1 * t)); };
  const tr = [[0, -0.03, 0], [0.004, 0.05, 0.004], [-0.03, 0.30, 0.09], [0.0, 0.46, 0.05], [0.08, 0.8, -0.01], [0.04, 0.98, -0.04]];
  tube(A, rnd, tr, [0.1, 0.07, 0.056, 0.048, 0.03, 0.016], 6, { col, lobe: [0.6, 0.15, 0, 0, 0, 0], part: 0, ridge: 0.2, twist: 0.08 });
  const arm = (from, dir, len, r0, sub) => { const pts = [from]; let [x, y, z] = from, [dx, dy, dz] = dir; for (let i = 1; i <= 2; i++) { const k = len / 2; dx += j() * 0.5; dz += j() * 0.5; dy += 0.2; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; x += dx * k; y += dy * k; z += dz * k; pts.push([x, y, z]); } tube(A, rnd, pts, [r0, r0 * 0.6, r0 * 0.25], 4, { col, part: 0, ridge: 0.14 }); if (sub) arm(pts[1], [dx * 0.4 + (rnd() < 0.5 ? 1 : -1) * 0.7, 0.45, dz * 0.4 + j()], len * 0.55, r0 * 0.5, false); };
  arm(tr[2], [-0.9, 0.25, 0.3], 0.5, 0.045, true); arm(tr[3], [0.9, 0.3, 0.2], 0.55, 0.045, false); arm(tr[4], [-0.4, 0.5, -0.8], 0.42, 0.036, false); arm(tr[4], [0.8, 0.45, 0.0], 0.4, 0.03, false);
  return A;
}

/* ---------- 打包成 BufferGeometry（含變體） ---------- */
function pack(A, B) {
  if (A.P.length !== B.P.length || A.I.length !== B.I.length) throw new Error('trees08：變體拓樸不同 ' + A.P.length + '/' + B.P.length);
  const g = new THREE.BufferGeometry(), N1 = A.normals(), N2 = B.normals();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(A.P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N1, 3));
  g.setAttribute('position2', new THREE.BufferAttribute(new Float32Array(B.P), 3));
  g.setAttribute('normal2', new THREE.BufferAttribute(N2, 3));
  const col = new Float32Array(A.C.length); for (let i = 0; i < col.length; i++) col[i] = (A.C[i] + B.C[i]) * 0.5;
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(A.A), 1));
  g.setIndex(new THREE.BufferAttribute(A.I.length > 65535 ? new Uint32Array(A.I) : new Uint16Array(A.I), 1));
  g.computeBoundingSphere(); return g;
}

/* ---------- 著色器：變體混合＋拉長（同舊樹的 aLift 規則）；陰影用同樣的深度材質 ---------- */
const VS_DECL = 'attribute vec3 position2; attribute vec3 normal2; attribute float aVar; attribute float aLift; uniform float uYb; uniform float uThk;';
const VS_BEGIN = 'vec3 transformed = mix(position, position2, aVar);\n'
  + 'if (aPart < 0.5) { if (transformed.y < uYb) { float tk = clamp(transformed.y, 0.0, uYb) / uYb, thk = 1.0 + uThk * clamp(aLift / uYb, 0.0, 2.0); transformed.xz *= mix(thk, 1.0, tk); transformed.y = transformed.y < 0.0 ? transformed.y : transformed.y * (uYb + aLift) / uYb; } else transformed.y += aLift; }\n'
  + 'else transformed.y += aLift;';
const patchVS = (sh, proto, fade) => {
  sh.uniforms.uYb = { value: proto.tree.yb }; sh.uniforms.uThk = { value: 0.16 };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; ' + VS_DECL + (fade ? ' attribute vec2 aFade; varying float vFade;' : ''))
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, normal2, aVar));')
    .replace('#include <begin_vertex>', VS_BEGIN + (fade ? '\nvFade = mix(aFade.y, aFade.x, aPart);' : ''));
};
export function treeInject(m, proto) {
  const c = m.clone(); c.onBeforeCompile = sh => {
    patchVS(sh, proto, true);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade > 0.02) { float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (dn < vFade * 0.88) discard; }');
  }; c.customProgramCacheKey = () => 'tree08'; return c;
}
export function treeDepth(proto) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.onBeforeCompile = sh => patchVS(sh, proto, false); m.customProgramCacheKey = () => 'tree08d'; return m;
}

/* ---------- 對外 ---------- */
/* tree 欄位：yb＝拉長邊界（模型單位）；H＝模型總高；R＝樹冠最大半徑（模型單位）；rf＝樹冠外形（0 錐形、1 圓球，鏡頭遮擋淡出用）；y0＝樹冠底（模型單位，淡出用） */
const DEF = {
  pine: { mk: s => lowPine(s, false), hi: mkPine, ys: 1.3, yb: 0.20, H: 1.34 * 1.3 - 0.06, R: 0.50, rf: 0.2, y0: 0.3, seeds: [1101, 2207] },
  fir: { mk: s => lowPine(s, true), hi: mkFir, ys: 1.3, yb: 0.20, H: 1.40 * 1.3 - 0.06, R: 0.355, rf: 0.0, y0: 0.3, seeds: [3301, 4409] },
  oak: { mk: lowOak, hi: mkOak, yb: 0.28, H: 1.30, R: 0.46, rf: 1.0, y0: 0.40, seeds: [5501, 6607] },
  birch: { mk: lowBirch, hi: mkBirch, yb: 0.26, H: 1.36, R: 0.38, rf: 0.8, y0: 0.42, seeds: [7701, 8803] },
  dead: { mk: lowDead, hi: mkDead, yb: 0.30, H: 1.02, R: 0.3, rf: 0.0, y0: 0.5, seeds: [9901, 11003] }
};
export function buildTreeProtos(detail) {
  const out = {}, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  for (const k of SP_NAMES) {
    const d = DEF[k], mk = detail ? d.hi : d.mk, A = mk(d.seeds[0]), B = mk(d.seeds[1]); for (const Q of [A, B]) for (let i = 1; i < Q.P.length; i += 3) if (Q.P[i] > d.yb) Q.P[i] = d.yb + (Q.P[i] - d.yb) * (d.ys || 1); const g = pack(A, B);
    out[k] = { parts: [{ g, mat }], aspect: d.H / (d.R * 2), tree: { yb: d.yb, H: d.H, R: d.R, rf: d.rf, y0: d.y0 }, morph: true, inject: treeInject, depth: () => treeDepth(out[k]), sp: SP[k], tris: g.index.count / 3 };
  }
  return out;
}
