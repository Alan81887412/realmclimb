/* 0.8 大擴建 X0b（玩法／地形）：新地形。A 圈九區（半徑 345–545）、北境三塊（霜林、北緣稜線、關前高地）、兩個隘口、關前古道與門前空地、舊邊界山降低與開口。
   這個檔不 import 任何東西（core.js、world.js 都從這裡拿），所以沒有循環匯入的問題；雜訊函式照抄 core.js（同一套數字，結果一模一樣）。
   座標：x 向東、z 向南；方位 a＝atan2(x, −z)（度，0＝北、90＝東）；AP(a, r)＝(r·sin a, −r·cos a)。
   給 core.js：landN（新地的高度，不含水域；水域在 core.js 的 LAKES 最後面）、nw08（新地的比重：半徑 330 以內一律 0，舊世界一個位元都不動）、edge08（到可走邊界的距離）、wall08（崖、石脊、石柱：> 0.4 不能走）、zone08。
   給 world.js：ground08（地面種類與顏色）、rock08。給 X1／X5：LAND08（各地標的座標與形狀）、tallGrass08（林緣的高草叢）。 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = t => t * t * (3 - 2 * t); const u = s(xf), v = s(yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1 + 3) * 0.28 + vnoise(x * 4.3 + 1, y * 4.3 + 9) * 0.12;
const D2R = Math.PI / 180;
export const AP = (a, r) => [r * Math.sin(a * D2R), -r * Math.cos(a * D2R)];
export const azOf = (x, z) => Math.atan2(x, -z) / D2R;
const adiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

/* ---------- 範圍 ---------- */
export const RING08 = { r0: 345, RA: 545, band: [545, 555], SQ: 594, seam: [333, 342, 358], rimR: 586, highR: 622, sect: 72 };
/* 舊世界的保護：半徑 333 以內新地的比重一律 0（計畫 T2-10③：半徑 330 內高度差 < 0.01 m；這裡是位元相同，連法線、草也不變）。
   一般地方從 342 到 358 慢慢換成新地（舊世界可走到 341，整圈都不動）；只有北、東四條入口通道（從舊空地出發穿過舊山）從 333 開始換 */
const S0 = 333, S1 = 342, S2 = 358;

/* ---------- 區域（照計畫 T1 的方位） ---------- */
const ZB = [-160, -120, -70, -38, -12, 28, 62, 118, 160];
const ZN = ['southlake', 'edgewood', 'giantwood', 'marshwood', 'floodpen', 'backhill', 'orecliff', 'saltflat', 'redslope', 'southlake'];
function zoneIdx(a) { for (let i = 0; i < ZB.length; i++) if (a < ZB[i]) return i; return ZB.length; }
/* 區界不是筆直的放射線：分區用的方位加彎（約 80 m 一個彎，最多 ±11 度）和小抖動（±3 度）；高度在交界前後各 7 度、地面各 9 度（約 50–85 m）漸層過渡 */
export function azW(x, z) { let a = Math.atan2(x, -z) * 180 / Math.PI + (fbm(x * 0.0085 + 61, z * 0.0085 + 23) - 0.5) * 22 + (vnoise(x * 0.028 + 5, z * 0.028 + 77) - 0.5) * 6; if (a > 180) a -= 360; if (a < -180) a += 360; return a; }

/* ---------- 地標（初值，X1 可以照這些座標放東西） ---------- */
const P = (a, r, ...rest) => [...AP(a, r), ...rest];
/* 入口通道：從舊世界的空地穿過舊邊界山（北、東兩面的山）進到 A 圈。[x, z, 地面高]；第一點在舊空地裡（高度＝舊地面），w＝半寬。
   只能從舊世界可走到半徑 333 以外的地方開（333 以內一個位元都不能動）：霜泉空地的北緣、採石場的東緣。
   舊飼育場北邊試過：獸欄的圍欄、舊石頭和半徑 331–333 的山腳把路堵死（要動到 333 以內才打得開），所以淹水獸場從沼林、後山兩側進去。
   南、西兩面的舊邊界整圈降成丘，不用通道；白鹽臺東邊不開（紅土荒坡從河灣草場直接進去） */
export const ENTRY08 = [
  { id: 'e_rail', name: '霜泉北口（運鐵道）', to: 'orecliff', w: 7, pts: [[141, -299, 5.2], [150, -322, 7.0], [195, -340, 8.8]] },
  { id: 'e_quarry', name: '採石場東口', to: 'saltflat', w: 8, pts: [[312, -118, -1.5], [340, -126, -0.6], [372, -136, 0.6], [400, -140, 1.0]] }
];
/* 運鐵道（礦脈斷崖）：接在 e_rail 後面沿崖往上爬，到斷掉的棧橋（AP(45,512)–AP(45,552)，橋是美術 X5） */
export const RAIL08 = { w: 4.2, pts: [[195, -340, 8.8], P(37, 405, 9.6), P(40, 445, 10.6), P(43, 482, 14.2), P(45, 508, 17.2)], trestle: [AP(45, 512), AP(45, 552)] };
/* 窄岩架：二階（+10）沿著崖面爬到三階（+17），寬約 4 m，外側掉下去是二階（不會摔死，只是要繞路） */
export const LEDGE08 = { w: 2.0, pts: [P(58, 440, 10.4), P(55, 452, 12.2), P(51.5, 461, 14.6), P(48.5, 470, 17.0)] };
export const RAMP08 = [{ id: 'ore12', w: 5, pts: [P(50, 396, 4.2), P(50, 433, 10.3)] }];      /* 礦脈斷崖：一階 → 二階的坡道 */
/* 北境的兩個隘口（唯一入口）：主＝後山正北 → 北緣稜線；次＝淹水獸場旁的冰瀑 → 霜林。高度在載入時照兩頭的地面算 */
export const PASS08 = [{ id: 'pass_main', name: '北隘口', w: 6.2, a: 0, r: [506, 568] }, { id: 'pass_ice', name: '冰瀑隘口', w: 6.2, a: -28.5, r: [500, 568] }];
/* 關前古道：高地 → 門前空地（[x, z, 半寬, 地面高, 兩側崖高]）。①鐵道終點 24→12 m、②峽口 8–9 m、③石像列柱 12–18 m */
export const OLDROAD08 = [[428, -428, 12, 27.0, 6], [452, -460, 6, 26.6, 16], [469, -469, 5.1, 26.2, 22], [490, -479, 5.0, 25.8, 24], [506, -520, 5.0, 25.2, 22], [539, -539, 9, 24.6, 18]];
export const GATE08 = { door: [580, -580], plaza: [556, -556, 28], y: 24.6, apron: 9 };
/* 南湖：大湖（水面 −2.6，最深約 2.3 m）、南岸最裡面的鱷灘（沙洲後面的淺水潟湖，最深 ≤ 0.72 m） */
export const LAKES08 = [
  { id: 'southlake', name: '南湖', pts: [[-110, 470, 16, 'bay'], [-74, 462, 30, 'bay'], [-28, 468, 36, 'bay'], [18, 472, 34, 'bay'], [62, 468, 27, 'bay'], [98, 474, 15, 'bay']], deep: 2.6, sl: 12, out: 18, rough: 1, wob: 2.4 },
  { id: 'croclagoon', name: '鱷灘', pts: [[-16, 521, 7, 'bay'], [0, 526, 9.5, 'bay'], [16, 521, 7, 'bay']], deep: 1.02, sl: 5, out: 10, rough: 0.6, wob: 1.0 },
  { id: 'mire', name: '沼林淺水', pts: [P(-63, 400, 18, -0.95), P(-58, 428, 26, -0.95), P(-52, 452, 25, -0.95), P(-47, 470, 18, -0.95)], deep: 1.2, sl: 6, out: 10, rough: 1, wob: 2.4, islets: 0.85 },
  { id: 'crocpond', name: '鱷潭', pts: [P(-50, 515, 13, -0.9)], deep: 1.03, sl: 6, out: 11, rough: 0.6, wob: 1.2 },
  { id: 'floodpool', name: '淹水獸欄', pts: [P(-32, 392, 12, -1.0), P(-26, 402, 15, -1.0), P(-20, 418, 11, -1.0)], deep: 0.95, sl: 5, out: 9, rough: 1, wob: 1.6, islets: 0.6 },
  { id: 'meltlake', name: '雪融湖', pts: [P(-8, 512, 15, null)], deep: 2.4, sl: 9, out: 12, rough: 0.8, wob: 1.6 },
  { id: 'saltspring', name: '鹽泉', pts: [P(84, 468, 7, null)], deep: 1.4, sl: 5, out: 8, rough: 0.5 },
  { id: 'saltspring2', name: '鹽泉（小）', pts: [P(97, 432, 4.5, null)], deep: 1.0, sl: 4, out: 6, rough: 0.4 },
  { id: 'icepond', name: '霜林冰潭', pts: [P(-60, 665, 12, null)], deep: 2.2, sl: 8, out: 11, rough: 0.7, wob: 1.2 }
];
/* 淹水獸場的獸坑（碗狀凹地，坡度 ≤ 0.5，進得去出得來）：[x, z, 半徑, 深]；第一個是最深的坑（大蟒蛇） */
export const PITS08 = [P(-25, 445, 13, 4.2), P(-33, 432, 8, 2.4), P(-16, 470, 9, 2.6)];
/* 紅土荒坡：乾河溝（折線；溝底寬 6 m、深 2.6 m）、石柱林（[x, z, 半徑, 高]） */
export const GULLY08 = [[124, 0], [149, 2.2]].map(([a0, ph]) => { const o = []; for (let r = 366; r <= 532; r += 6) o.push(AP(a0 + 3.2 * Math.sin(r * 0.045 + ph) + 1.2 * Math.sin(r * 0.11 + ph * 2), r)); return o; });
export const PILLAR08 = (() => { const o = [], c = AP(137, 458); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; o.length < 14 && i < 600; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 58, x = c[0] + Math.sin(a) * d, z = c[1] - Math.cos(a) * d, R = 2.3 + rnd() * 1.8; if (o.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + R + 7)) continue; o.push([+x.toFixed(1), +z.toFixed(1), +R.toFixed(1), +(9 + rnd() * 8).toFixed(1)]); }
  return o; })();
/* 舊邊界山留下的幾段石脊（區與區之間的地標，不能走）：[方位, 內半徑, 外半徑, 半寬 m, 高] */
export const RIDGE08 = [[-160, 338, 372, 4.5, 9], [-121, 340, 384, 4.5, 10], [-96, 344, 366, 3.5, 7], [-70, 338, 376, 4.5, 10], [160, 338, 370, 4.5, 8]];

/* ---------- 小工具 ---------- */
function segT(x, z, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; return clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); }
/* 折線：回傳最近一段的距離、沿線位置（0–1 換成第幾段＋段內比例）。Q 是暫存 */
const Q = { d: 0, i: 0, t: 0 };
function poly(x, z, pts) { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], t = segT(x, z, a[0], a[1], b[0], b[1]), d = Math.hypot(x - a[0] - (b[0] - a[0]) * t, z - a[1] - (b[1] - a[1]) * t); if (d < best) { best = d; Q.i = i; Q.t = t; } } Q.d = best; return best; }
const bbOf = (pts, pad) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0 - pad, x1 + pad, z0 - pad, z1 + pad]; };
const inBB = (b, x, z) => x > b[0] && x < b[1] && z > b[2] && z < b[3];
const ENT_BB = ENTRY08.map(e => bbOf(e.pts, e.w + 12)), RAIL_BB = bbOf(RAIL08.pts, 14), LEDGE_BB = bbOf(LEDGE08.pts, 10), RAMP_BB = RAMP08.map(q => bbOf(q.pts, 12)), ROAD_BB = bbOf(OLDROAD08, 60);
const GUL_BB = GULLY08.map(g => bbOf(g, 12));

/* ---------- 新地的比重（core.js 的 landHeight 用它把舊地形換成新地形） ---------- */
/* 入口通道：回傳通道的「挖開」比重（0–1），順便把通道地面高放進 Q.h */
function entryCarve(x, z) {
  let k = 0;
  for (let e = 0; e < ENTRY08.length; e++) { if (!inBB(ENT_BB[e], x, z)) continue; const E = ENTRY08[e], d = poly(x, z, E.pts); const m = smooth(E.w + 7, E.w + 0.5, d); if (m > k) { k = m; const a = E.pts[Q.i], b = E.pts[Q.i + 1]; Q.h = lerp(a[2], b[2], Q.t); Q.e = e; } }
  return k;
}
export function nw08(x, z) {
  const r = Math.hypot(x, z); if (r < S0) return 0;
  let w = smooth(S1, S2, r); if (w >= 1) return 1;
  const k = entryCarve(x, z); if (k > 0) w = Math.max(w, k * smooth(S0, S0 + 3, r));
  return w;
}

/* ---------- 可走範圍 ---------- */
/* 「世界」的外框（正的在裡面）：A 圓 ∪ 北境（方位 ±72 度、可走方框 594、稜線外緣 586、關前高地外緣 622）∪ 古道 ∪ 門前空地 */
const rimLim = a => a < 0 ? lerp(1e4, RING08.rimR, smooth(-23, -15, a)) : lerp(RING08.rimR, RING08.highR, smooth(15, 23, a));
function roadSd(x, z) {      /* 古道：半寬 − 離中線距離；門前空地與門口那一小段也算。附近沒有古道回傳 −1e9（Q.rh、Q.rw 給預設值） */
  if (!inBB(ROAD_BB, x, z)) { Q.rh = 27; Q.rw = 12; return -1e9; }
  const d = poly(x, z, OLDROAD08), a = OLDROAD08[Q.i], b = OLDROAD08[Q.i + 1]; Q.rh = lerp(a[3], b[3], Q.t); Q.rw = lerp(a[4], b[4], Q.t); const s1 = lerp(a[2], b[2], Q.t) - d;
  const G = GATE08, s2 = G.plaza[2] - Math.hypot(x - G.plaza[0], z - G.plaza[1]), s3 = G.apron - poly(x, z, [[G.plaza[0], G.plaza[1]], [G.door[0] - 3, G.door[1] + 3]]);
  if (Math.max(s2, s3) > s1 - 2) { Q.rh = lerp(Q.rh, G.y, smooth(s1 - 2, s1 + 2, Math.max(s2, s3))); Q.rw = Math.max(Q.rw, 20); }
  return Math.max(s1, s2, s3);
}
export function outerSd(x, z) {
  const r = Math.hypot(x, z), a = azOf(x, z), wob = (vnoise(x * 0.025 + 40, z * 0.025 + 40) - 0.5) * 9, dA = RING08.RA - r + (r > 480 ? wob : 0);      /* 外緣帶一點彎，山腳才不會是一條直線或正圓 */
  let dN = Math.min((RING08.sect - Math.abs(a)) * D2R * r, RING08.SQ - Math.abs(x) + wob, RING08.SQ - Math.abs(z) + wob, rimLim(a) - r + wob * 0.5);
  if (r < RING08.band[0] - 30) dN = -1e9;
  return Math.max(dA, dN, x > 380 && z < -380 ? roadSd(x, z) : -1e9);
}
function passSd(x, z) { let s = -1e9; for (const p of PASS08) { const A = AP(p.a, p.r[0]), B = AP(p.a, p.r[1]); s = Math.max(s, p.w - poly(x, z, [A, B])); } return s; }
/* 到可走邊界的距離（正的在裡面）：世界外框，再扣掉北境下面那一圈 10 m 的崖帶（545–555，只有兩個隘口過得去） */
export function edge08(x, z) {
  const r = Math.hypot(x, z), U = outerSd(x, z); if (r < RING08.band[0] - 12) return U;
  const a = azOf(x, z); if (Math.abs(a) > RING08.sect + 2) return U;
  const dBand = Math.max(RING08.band[0] - r, r - RING08.band[1]);
  return Math.min(U, Math.max(dBand, passSd(x, z)));
}

/* ---------- 高度 ---------- */
const nA = (x, z) => fbm(x * 0.018 + 71, z * 0.018 + 13) - 0.5, nB = (x, z) => vnoise(x * 0.07 + 5, z * 0.07 + 9) - 0.5;
/* 礦脈斷崖的三階：u 是帶一點彎的半徑；一階 +4（< 415）、二階 +10、三階 +17（> 465） */
const terU = (x, z, r) => r + (vnoise(x * 0.014 + 3, z * 0.014 + 8) - 0.5) * 12;
const oreW = a => smooth(21, 35, a) * smooth(69, 55, a);      /* 礦脈斷崖的比重（和高度的區界混合一樣寬） */
const TER = [[415, 6], [465, 7]];
function terrace(x, z, r) { const u = terU(x, z, r); let h = 4; for (const [c, dh] of TER) h += dh * smooth(c - 1.8, c + 1.8, u); return h; }
function terCliff(x, z, r) { const u = terU(x, z, r); let k = 0; for (const [c] of TER) k = Math.max(k, smooth(3.2, 0.6, Math.abs(u - c))); return k * oreW(azW(x, z)); }
function zoneBody(i, x, z, r) {
  const n = nA(x, z), m = nB(x, z), L = fbm(x * 0.007 + 11, z * 0.007 + 3) - 0.5, K = smooth(0.6, 0.86, vnoise(x * 0.022 + 9, z * 0.022 + 4));      /* L：大起伏（約 140 m 一個波）；K：零星的小丘 */
  const M = fbm(x * 0.024 + 31, z * 0.024 + 57) - 0.5;      /* M：中尺度起伏（約 40 m 一個波） */
  switch (ZN[i]) {
    case 'southlake': return -1.6 + n * 1.4 + m * 0.4 + L * 2.0 + M * 1.6 - 1.4 * smooth(175, 70, Math.hypot((x + 5) / 1.5, z - 472)) + smooth(532, 548, r) * 2;      /* 南湖周邊微微下凹 */
    case 'edgewood': return 0.6 + n * 2.4 + m * 0.5 + L * 5 + K * 2.6 + M * 3.6 + smooth(360, 540, r) * 2.5;      /* 林緣：緩丘 */
    case 'giantwood': return 1.4 + n * 2.0 + m * 0.6 + L * 4.5 + K * 3.2 + M * 3.4;
    case 'marshwood': return -0.5 + n * 0.9 + m * 0.4 + L * 1.0 + M * 0.9;
    case 'floodpen': return -0.6 + n * 1.2 + m * 0.3 + L * 1.5 + M * 1.2 + smooth(470, 532, r) * 6;
    case 'backhill': return 6.5 + n * 3 + m * 0.6 + L * 6 + K * 3 + M * 2.6 + smooth(420, 530, r) * 3;
    case 'orecliff': return terrace(x, z, r) + n * 0.8 + L * 1.5 + M * 0.8;
    case 'saltflat': return 1.0 + n * 0.5 + m * 0.15 + L * 0.8 + M * 0.5 - 1.3 * smooth(0.55, 0.72, vnoise(x * 0.02 + 3, z * 0.02 + 41));      /* 鹽原：平，但有一塊塊淺窪 */
    case 'redslope': return 2.5 + n * 3.4 + m * 0.8 + L * 5 + K * 2.4 + M * 1.8 + 4.2 * smooth(0.54, 0.63, vnoise(x * 0.016 + 8, z * 0.016 + 2));      /* 紅土：小台地（乾溝另外挖） */
  }
  return 0;
}
const ZW = 7;      /* 相鄰兩區的高度在交界前後 7 度內混合（用彎過的方位 azW） */
function ringBody(x, z, r, a0) {
  const a = azW(x, z), i = zoneIdx(a), lo = i === 0 ? -180 : ZB[i - 1], hi = i === ZB.length ? 180 : ZB[i], dl = a - lo, du = hi - a, h0 = zoneBody(i, x, z, r);
  if (dl < ZW && i > 0) return lerp(zoneBody(i - 1, x, z, r), h0, smooth(-ZW, ZW, dl));
  if (du < ZW && i < ZB.length) return lerp(zoneBody(i + 1, x, z, r), h0, smooth(-ZW, ZW, du));
  return h0;
}
/* 舊邊界山：西、南兩面降成起伏的丘；北、東兩面（舊的峽谷與獸欄山）照樣是山，只在四條入口通道打開；獸欄後牆（方位 −18～18）照舊、還加厚 */
const seamArc = a => smooth(-41, -35, a) * smooth(150, 145, a);      /* 東南：舊峽谷的山到方位 148 左右，以南是河灣草場，直接通紅土荒坡 */
function seamWall(x, z, r, a) { const back = smooth(-25, -16, a) * smooth(25, 16, a), ro = 368 + 16 * back; return seamArc(a) * smooth(S1 - 2, S1 + 3, r) * smooth(ro + 6, ro - 4, r); }
function seamHill(x, z, r) { return smooth(337, 347, r) * smooth(378, 356, r) * (1.4 + 2.2 * vnoise(x * 0.04 + 31, z * 0.04 + 7)); }
function ridgeMask(x, z, r, a) { let k = 0; Q.rq = RIDGE08[0]; for (const q of RIDGE08) { if (Math.abs(adiff(a, q[0])) > 12) continue; const A = AP(q[0], q[1]), B = AP(q[0] + (vnoise(q[0], 3) - 0.5) * 3, q[2]), d = poly(x, z, [A, B]) + (vnoise(x * 0.11 + q[0], z * 0.11) - 0.5) * 2.4, m = smooth(q[3] + 2.5, q[3] - 1.5, d) * smooth(q[1] - 2, q[1] + 6, r) * smooth(q[2] + 2, q[2] - 6, r); if (m > k) { k = m; Q.rq = q; } } return k; }
/* 北境：霜林（雪松林的高地 +20 上下）、北緣稜線（脊線 +26、兩側往下）、關前高地（+26～+28） */
function northBody(x, z, r, a) {
  const n = nA(x + 300, z), m = nB(x, z);
  const L = fbm(x * 0.009 + 2, z * 0.009 + 17) - 0.5, K = smooth(0.58, 0.85, vnoise(x * 0.03 + 4, z * 0.03 + 1));
  const frost = 20 + n * 6 + m * 1.5 + L * 7 + K * 3.5 + smooth(560, 640, r) * 2;
  const rc = 570, rim = 26.2 - Math.min(Math.pow((r - rc) / 15, 2) * 6, 9) + m * 0.8;
  const high = 26.5 + n * 3 + m * 0.8 + L * 3 + K * 1.5;
  if (a < -14) return a < -22 ? frost : lerp(frost, rim, smooth(-22, -14, a));
  if (a > 14) return a > 22 ? high : lerp(rim, high, smooth(14, 22, a));
  return rim;
}
/* 隘口坡道的兩頭高度（第一次用時照兩頭的地面算好） */
let passH = null;
function passPrep() { passH = PASS08.map(p => { const A = AP(p.a, p.r[0]), B = AP(p.a, p.r[1]); return [baseH(A[0], A[1], false), baseH(B[0], B[1], false)]; }); }
/* 不含隘口的高度 */
function baseH(x, z, carvePass) {
  const r = Math.hypot(x, z), a = azOf(x, z);
  let h = ringBody(x, z, r, a);
  /* 舊邊界：丘、石脊、北東的山 */
  if (r < 392) {
    h += seamHill(x, z, r) * (1 - seamArc(a));
    const sw = seamWall(x, z, r, a); if (sw > 0) { const ec = entryCarve(x, z); h = lerp(h, 17 + fbm(x * 0.03 + 50, z * 0.03) * 10 + nB(x, z) * 1.8, sw * (1 - ec)); if (ec > 0) h = lerp(h, Q.h, ec); }
    else { const ec = entryCarve(x, z); if (ec > 0) h = lerp(h, Q.h, ec); }
    const rk = ridgeMask(x, z, r, a); if (rk > 0) h += rk * (Q.rq[4] + 3 * vnoise(x * 0.07 + 12, z * 0.07 + 40));
  }
  /* 礦脈斷崖：運鐵道、窄岩架、坡道 */
  if (a > 20 && a < 70 && r < 545) {
    for (const [L, bb] of [[RAIL08, RAIL_BB], [LEDGE08, LEDGE_BB], ...RAMP08.map((q, i) => [q, RAMP_BB[i]])]) { if (!inBB(bb, x, z)) continue; const d = poly(x, z, L.pts), p0 = L.pts[Q.i], p1 = L.pts[Q.i + 1], fl = lerp(p0[2], p1[2], Q.t), k = smooth(L.w + 3.5, L.w, d); if (k > 0) h = lerp(h, fl, k); }
  }
  /* 淹水獸場的獸坑 */
  if (a > -40 && a < -10) for (const p of PITS08) { const d = Math.hypot(x - p[0], z - p[1]); if (d < p[2]) h -= p[3] * smooth(p[2], p[2] * 0.25, d); }
  /* 紅土荒坡：乾河溝、石柱 */
  if (a > 112 && a < 166) {
    for (let g = 0; g < GULLY08.length; g++) { if (!inBB(GUL_BB[g], x, z)) continue; const d = poly(x, z, GULLY08[g]) + (vnoise(x * 0.09 + g * 7, z * 0.09) - 0.5) * 2.4; if (d < 8) h -= 2.6 * smooth(8, 3, d); }
    for (const p of PILLAR08) { const d = Math.hypot(x - p[0], z - p[1]); if (d < p[2] + 2.2) { const top = p[3] + (vnoise(x * 0.4 + p[0], z * 0.4) - 0.5) * 1.2; h += top * smooth(p[2] + 1.0, p[2] - 0.6, d) + 0.9 * smooth(p[2] + 2.2, p[2] + 0.4, d); } }
  }
  /* 北境：A 圈外緣 545 起 10 m 內升到北境的高度（崖），兩側 ±72 度以外照外圍的山 */
  if (r > RING08.band[0] - 6 && Math.abs(a) < RING08.sect + 6) { const hn = northBody(x, z, r, a); h = lerp(h, hn, smooth(RING08.band[0] - 1, RING08.band[1] - 1, r) * smooth(RING08.sect + 5, RING08.sect - 1, Math.abs(a))); }
  /* 隘口：沿坡道從 A 圈這頭直直升到北境那頭（坡度 ≤ 0.42） */
  if (carvePass !== false && r > 480 && r < 600) { if (!passH) passPrep(); for (let k = 0; k < PASS08.length; k++) { const p = PASS08[k]; if (Math.abs(adiff(a, p.a)) > 4) continue; const A = AP(p.a, p.r[0]), B = AP(p.a, p.r[1]), d = poly(x, z, [A, B]), m = smooth(p.w + 4.5, p.w - 0.5, d); if (m > 0) h = lerp(h, lerp(passH[k][0], passH[k][1], Q.t), m); } }
  return h;
}
/* 外圍的山（世界外框以外）：從邊界往外 24 m 內升高 16–30 m；頂上積雪由 world.js 照高度畫 */
export function landN(x, z) {
  let h = baseH(x, z, true);
  const U = outerSd(x, z);
  if (U < 4) h += smooth(4, -1, U) * 1.2 + smooth(0, -24, U) * (15 + fbm(x * 0.03 + 9, z * 0.03 + 30) * 15 + nB(x, z) * 2);
  /* 關前古道：關前高地外緣（約 612）以外，古道兩側是直上直下的崖（崖高照 OLDROAD08 的第五欄），古道與門前空地的地面是平的 */
  if (x > 370 && z < -370) { const s = roadSd(x, z); if (s > -28) { const rf = Q.rh, wallH = rf + Q.rw + 2 + fbm(x * 0.05 + 3, z * 0.05 + 70) * 4, out = smooth(RING08.highR - 12, RING08.highR + 2, Math.hypot(x, z));
    h = lerp(h, Math.max(h, wallH), smooth(-28, -12, s) * out); h = lerp(h, rf, smooth(-2.6, 0.4, s)); } }
  return h;
}

/* ---------- 不能走的地方（> 0.4） ---------- */
export function wall08(x, z) {
  const r = Math.hypot(x, z), a = azOf(x, z); let k = 0;
  if (r < 392) { const sw = seamWall(x, z, r, a); if (sw > 0) k = sw * (1 - smooth(ENTRY08[0].w + 2.5, ENTRY08[0].w, entryD(x, z))); k = Math.max(k, smooth(0.35, 0.6, ridgeMask(x, z, r, a))); }
  if (a > 24 && a < 66 && r > 395 && r < 548) { const c = terCliff(x, z, r); if (c > 0) k = Math.max(k, c * (1 - pathK(x, z))); }
  if (a > 112 && a < 166) for (const p of PILLAR08) { const d = Math.hypot(x - p[0], z - p[1]); if (d < p[2] + 1) k = Math.max(k, smooth(p[2] + 0.6, p[2] - 0.4, d)); }
  return k;
}
function entryD(x, z) { let b = 1e9; for (let e = 0; e < ENTRY08.length; e++) if (inBB(ENT_BB[e], x, z)) b = Math.min(b, poly(x, z, ENTRY08[e].pts) - (ENTRY08[e].w - ENTRY08[0].w)); return b; }
function pathK(x, z) { let k = 0; for (const [L, bb] of [[RAIL08, RAIL_BB], [LEDGE08, LEDGE_BB], ...RAMP08.map((q, i) => [q, RAMP_BB[i]])]) if (inBB(bb, x, z)) k = Math.max(k, smooth(L.w + 1.6, L.w, poly(x, z, L.pts))); return k; }
/* 岩質（0–1）：崖、山、石脊、石柱、古道兩側（可爬坡度用岩質的 0.87；地面上岩石的紋理） */
export function rock08(x, z, h) {
  const U = outerSd(x, z), r = Math.hypot(x, z), a = azOf(x, z);
  let k = smooth(0, -6, U);
  if (r < 392) k = Math.max(k, seamWall(x, z, r, a) * (1 - smooth(6, 2, entryD(x, z) - 6)), smooth(0.1, 0.5, ridgeMask(x, z, r, a)));
  if (a > 24 && a < 66 && r < 548) k = Math.max(k, terCliff(x, z, r) * (1 - pathK(x, z)) * 0.9);
  if (Math.abs(a) < RING08.sect + 4 && r > RING08.band[0] - 2 && r < RING08.band[1] + 2) k = Math.max(k, smooth(-1, 2, -passSd(x, z)) * smooth(RING08.band[0] - 2, RING08.band[0] + 1, r) * smooth(RING08.band[1] + 2, RING08.band[1] - 1, r));
  if (a > 112 && a < 166) for (const p of PILLAR08) { const d = Math.hypot(x - p[0], z - p[1]); if (d < p[2] + 1.5) k = Math.max(k, smooth(p[2] + 1.5, p[2] - 0.2, d)); }
  return k;
}

/* ---------- 區域 ---------- */
export function zone08(x, z) {
  const r = Math.hypot(x, z), a = azOf(x, z);
  if (x > 370 && z < -370 && roadSd(x, z) > -3) return 'oldroad';
  if (r > RING08.RA + 10 && a > -RING08.sect && a < RING08.sect) return a < -18 ? 'frostwood' : a < 18 ? 'northrim' : 'gatehigh';
  return ZN[zoneIdx(azW(x, z))];
}
/* 林緣獵場的高草叢（0–1；> 0.5 算在草叢裡）：給 X3／X5（躲進草裡、草會動）與地面顏色 */
export function tallGrass08(x, z) { const a = azOf(x, z), r = Math.hypot(x, z); if (a > -112 || a < -168 || r < 350 || r > 545) return 0; return smooth(0.56, 0.66, vnoise(x * 0.035 + 17, z * 0.035 + 41)) * smooth(-166, -158, a) * smooth(-114, -122, a) * smooth(352, 366, r); }

/* ---------- 地面（world.js 用） ---------- */
/* 回傳 o：c 頂點色（和 world.js 的色票同一套，線性值，可以大於 1）、rock 岩質、dens 草的密度（負＝不長）、mc 小地圖色（照 maps07 的分類用同樣的顏色）、blade 草色（sRGB）、short 草矮多少 */
const PAL = { lush: [0.95, 1.35, 0.55], dry: [1.55, 1.5, 0.7], deep: [0.7, 1.1, 0.5], forest: [0.55, 0.92, 0.5], moss: [0.42, 0.78, 0.46], dark: [0.36, 0.62, 0.38], sand: [1.9, 1.42, 0.9], mesa: [1.7, 1.0, 0.6], red: [1.75, 0.82, 0.5], redD: [1.3, 0.62, 0.42], ash: [0.6, 0.54, 0.5], mount: [0.82, 0.8, 0.8], snow: [2.3, 2.35, 2.5], snowG: [2.0, 2.1, 2.25], pave: [1.22, 1.1, 0.94], road: [1.4, 1.02, 0.68], mud: [0.74, 0.66, 0.42], salt: [4.3, 4.2, 4.05], saltD: [3.1, 2.95, 2.7], shore: [1.5, 1.28, 0.92], frost: [1.9, 2.1, 2.3], rail: [0.9, 0.76, 0.62], stoneG: [1.05, 1.0, 0.95] };
const MCx = { meadow: [112, 154, 76], meadowDry: [150, 152, 84], forest: [62, 104, 62], sand: [201, 164, 110], mesa: [140, 104, 74], ash: [92, 84, 82], mount: [124, 122, 122], pave: [186, 174, 152], road: [196, 168, 122], salt: [226, 222, 212], red: [178, 112, 78], snow: [228, 232, 236], mud: [128, 116, 84], tall: [132, 150, 70] };
const BL = { meadow: [0.33, 0.52, 0.2], dry: [0.76, 0.7, 0.33], forest: [0.2, 0.4, 0.2], dark: [0.16, 0.32, 0.18], red: [0.72, 0.56, 0.3], ash: [0.44, 0.4, 0.3], snow: [0.62, 0.68, 0.62], tall: [0.5, 0.6, 0.24], salt: [0.8, 0.78, 0.6] };
const mixc = (o, c, t) => { o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t; };
function zoneGround(z, x, zz, h, o, n1, n2) {
  const c = o.c, b = o.blade;
  const set = (cc, bb) => { c[0] = cc[0]; c[1] = cc[1]; c[2] = cc[2]; b[0] = bb[0]; b[1] = bb[1]; b[2] = bb[2]; };
  switch (z) {
    case 'southlake': set(PAL.lush, BL.meadow); mixc(c, PAL.deep, n2 * 0.5); o.dens = 1; o.mc = MCx.meadow; break;
    case 'edgewood': { const fo = smooth(0.42, 0.6, fbm(x * 0.012 + 3, zz * 0.012 + 11)); set(PAL.lush, BL.meadow); mixc(c, PAL.dry, smooth(0.45, 0.8, n1) * 0.8 * (1 - fo)); mixc(c, PAL.forest, fo * 0.9); mixc(b, BL.forest, fo * 0.8);      /* 混合區：草原×森林，一塊塊交錯 */ const tg = tallGrass08(x, zz); mixc(c, [1.25, 1.3, 0.55], tg * 0.7); mixc(b, BL.tall, tg); o.dens = 1; o.short = -0.6 * tg; o.mc = tg > 0.5 ? MCx.tall : n1 > 0.62 ? MCx.meadowDry : MCx.meadow; break; }
    case 'giantwood': set(PAL.dark, BL.dark); mixc(c, PAL.moss, n2 * 0.6); o.dens = 0.6; o.short = 1; o.mc = MCx.forest; break;
    case 'marshwood': { const fl = smooth(0.4, 0.62, fbm(x * 0.014 + 7, zz * 0.014 + 5)); set(PAL.forest, BL.forest); mixc(c, PAL.moss, n2 * 0.4); mixc(c, PAL.mud, fl * 0.75); mixc(c, PAL.ash, fl * 0.2); o.dens = 0.75 - fl * 0.45; o.short = 1; o.rock = fl * 0.3; o.mc = fl > 0.6 ? MCx.mud : MCx.forest; break; }      /* 混合區：森林×淹水獸欄 */
    case 'floodpen': set(PAL.ash, BL.ash); mixc(c, PAL.mud, 0.45 + n2 * 0.3); mixc(c, PAL.deep, smooth(0.55, 0.85, n1) * 0.5); o.dens = 0.35; o.rock = 0.4; o.mc = MCx.ash; break;
    case 'backhill': { const sn = smooth(10, 14, h) * smooth(0.35, 0.6, n2); set(PAL.deep, BL.forest); mixc(c, PAL.ash, 0.35 + n2 * 0.25); mixc(c, PAL.snowG, sn * 0.8); o.dens = 0.55 - sn * 0.4; o.rock = 0.25 + sn * 0.5; o.mc = MCx.meadowDry; break; }
    case 'orecliff': { const lr = smooth(0.4, 0.6, fbm(x * 0.013 + 9, zz * 0.013 + 2)); set(PAL.mesa, BL.ash); mixc(c, PAL.sand, (1 - lr) * 0.3); mixc(c, PAL.ash, lr * 0.75 + n2 * 0.15); o.dens = 0.15; o.rock = 0.8; o.mc = lr > 0.5 ? MCx.ash : MCx.mesa; break; }      /* 混合區：獸欄（灰）×峽谷（紅） */
    case 'saltflat': set(PAL.dry, BL.dry); { const s = smooth(0.38, 0.62, fbm(x * 0.012 + 4, zz * 0.012 + 9)); mixc(c, PAL.salt, s * 0.9); mixc(c, PAL.saltD, s * smooth(0.45, 0.8, vnoise(x * 0.33 + 4, zz * 0.33 + 77)) * 0.5); o.dens = 1 - s; o.rock = s * 0.8; o.mc = s > 0.5 ? MCx.salt : MCx.meadowDry; mixc(b, BL.salt, s); } break;
    case 'redslope': set(PAL.dry, BL.red); { const s = smooth(0.38, 0.6, fbm(x * 0.013 + 1, zz * 0.013 + 8) * 0.8 + n2 * 0.25);      /* 混合區：峽谷（紅土）×草原（乾草） */ mixc(c, PAL.red, 0.55 + s * 0.4); mixc(c, PAL.redD, smooth(0.6, 0.9, n2) * 0.4); o.dens = 0.7 - s * 0.5; o.rock = 0.3 + s * 0.3; o.mc = s > 0.4 ? MCx.red : MCx.meadowDry; } break;
    case 'frostwood': set(PAL.snowG, [0.8, 0.84, 0.82]); mixc(c, PAL.forest, smooth(0.62, 0.85, n2) * 0.3); o.dens = 0.12; o.short = 1; o.rock = 0.85; o.mc = MCx.snow; break;
    case 'northrim': set(PAL.mount, BL.ash); mixc(c, PAL.snowG, 0.55 + n2 * 0.3); o.dens = 0.1; o.rock = 0.85; o.mc = MCx.snow; break;
    case 'gatehigh': set(PAL.ash, BL.ash); mixc(c, PAL.mount, 0.4 + n2 * 0.3); mixc(c, PAL.snowG, smooth(0.5, 0.8, n1) * 0.45); o.dens = 0.18; o.rock = 0.75; o.mc = MCx.ash; break;
    case 'oldroad': set(PAL.pave, BL.ash); mixc(c, PAL.ash, 0.35 + n2 * 0.2); o.dens = -1; o.rock = 0.8; o.mc = MCx.pave; break;
  }
}
const GO = { c: [0, 0, 0], blade: [0, 0, 0], rock: 0, cliff: 0, dens: 1, mc: null, short: 0, zone: '' };
/* wd：水深（waterLevel − 地面，負的是高出水面多少）。o 是共用的暫存，呼叫端要自己複製 */
export function ground08(x, z, h, wd) {
  const o = GO, r = Math.hypot(x, z), a = azOf(x, z), n1 = fbm(x * 0.03 + 20, z * 0.03 + 4), n2 = vnoise(x * 0.09 + 3, z * 0.09 + 8);
  o.rock = 0; o.dens = 1; o.short = 0;
  /* 快速路：可走範圍外 10 m 以上＝外圍的山（只要岩石色與積雪；省掉一半以上的地面計算） */
  { const U = outerSd(x, z); if (U < -10) { const cc = PAL.mount.slice(); mixc(cc, PAL.snow, smooth(29, 34, h)); o.c[0] = cc[0]; o.c[1] = cc[1]; o.c[2] = cc[2]; o.blade[0] = BL.ash[0]; o.blade[1] = BL.ash[1]; o.blade[2] = BL.ash[2]; o.rock = 1; o.cliff = 1; o.dens = 0; o.short = 0; o.zone = ''; o.mc = h > 33 ? MCx.snow : MCx.mount; return o; } }
  /* 區域的底色（相鄰兩區在交界前後 7 度內漸層；北境照 zone08） */
  const zn = zone08(x, z); o.zone = zn; zoneGround(zn, x, z, h, o, n1, n2);
  if (zn !== 'oldroad' && !(r > RING08.RA + 10 && Math.abs(a) < RING08.sect)) {
    const aw = azW(x, z), i = zoneIdx(aw), lo = i === 0 ? -180 : ZB[i - 1], hi = i === ZB.length ? 180 : ZB[i], dl = aw - lo, du = hi - aw, j = dl < du ? i - 1 : i + 1, d = Math.min(dl, du);
    if (d < 9 && j >= 0 && j < ZN.length && ZN[j] !== zn) { const keep = { c: o.c.slice(), b: o.blade.slice(), rock: o.rock, dens: o.dens, short: o.short, mc: o.mc }; zoneGround(ZN[j], x, z, h, o, n1, n2); const t = smooth(-9, 9, d); for (let k = 0; k < 3; k++) { o.c[k] = lerp(o.c[k], keep.c[k], t); o.blade[k] = lerp(o.blade[k], keep.b[k], t); } o.rock = lerp(o.rock, keep.rock, t); o.dens = lerp(o.dens, keep.dens, t); o.short = lerp(o.short, keep.short, t); if (t > 0.5) o.mc = keep.mc; }
  }
  /* 鱷灘的沙洲、南湖岸邊的沙 */
  if (r > 430 && Math.abs(a) > 150) { const e = Math.hypot(x / 54, (z - 519) / 24) + (n2 - 0.5) * 0.16; if (e < 1.1) { const k = smooth(1.05, 0.8, e); mixc(o.c, PAL.sand, k * 0.92); o.dens *= 1 - k; o.rock = Math.max(o.rock, k * 0.85); if (k > 0.5) o.mc = MCx.sand; } }
  /* 鱷潭、沼林的泥灘 */
  if (a > -72 && a < -36 && wd > -1.2) { const k = smooth(-1.2, -0.2, wd); mixc(o.c, PAL.mud, k * 0.8); o.dens *= 1 - k * 0.7; if (k > 0.5) o.mc = MCx.mud; }
  /* 舊邊界的石脊、北東的山、崖、石柱、外圍的山：岩石色，高處積雪 */
  const rk = rock08(x, z, h); o.cliff = rk;
  if (rk > 0) { const col = a > 20 && a < 160 && r < 560 ? (a > 112 ? PAL.red : PAL.mesa) : PAL.mount, cc = col.slice(); if (a > 20 && a < 160 && r < 560) { const band = 0.8 + 0.25 * Math.sin(h * 1.3 + n2 * 2.5); cc[0] *= band; cc[1] *= band; cc[2] *= band; } mixc(cc, PAL.snow, smooth(29, 34, h)); mixc(o.c, cc, rk); o.rock = Math.max(o.rock, rk); o.dens *= 1 - rk; if (rk > 0.4) o.mc = a > 20 && a < 160 && r < 560 ? MCx.mesa : MCx.mount; }
  if (h > 31 && rk < 0.4) { const k = smooth(31, 36, h); mixc(o.c, PAL.snow, k); if (k > 0.5) o.mc = MCx.snow; }
  /* 路面：入口通道、運鐵道、隘口、古道與空地 */
  let road = 0;
  { const ed = entryD(x, z); if (ed < 3.6) road = Math.max(road, 1 - smooth(1.6, 3.6, ed + (n2 - 0.5) * 1.6)); }
  if (a > 20 && a < 70) { if (inBB(RAIL_BB, x, z)) { const d = poly(x, z, RAIL08.pts); road = Math.max(road, (1 - smooth(1.2, 2.8, d)) * 0.9); } }
  if (r > 495 && r < 575) for (const p of PASS08) { if (Math.abs(adiff(a, p.a)) > 3) continue; const A = AP(p.a, p.r[0] - 4), B = AP(p.a, p.r[1] + 4), d = poly(x, z, [A, B]); road = Math.max(road, (1 - smooth(p.w - 2.5, p.w + 0.5, d + (n2 - 0.5) * 1.5)) * 0.85); }
  if (road > 0) { mixc(o.c, PAL.road, road * 0.85); o.rock = Math.max(o.rock, road * 0.7); o.dens *= 1 - road; if (road > 0.5) o.mc = MCx.road; }
  if (zn === 'oldroad') { const pv = smooth(-1.5, 1.2, roadSd(x, z)); mixc(o.c, PAL.pave, pv * 0.6); if (pv > 0.5) o.mc = MCx.pave; }
  /* 水邊與水下 */
  if (wd > -0.7) { const k = smooth(-0.7, -0.05, wd); mixc(o.c, PAL.shore, k * 0.6); mixc(o.c, [0.36, 0.56, 0.58], smooth(0.25, 1.9, wd)); o.rock = Math.max(o.rock, k * 0.6); o.dens = wd > -0.14 ? -1 : o.dens * (1 - smooth(-0.55, -0.14, wd)); if (wd > 0.05) o.mc = [84, 148, 184]; }
  return o;
}

/* ---------- 給 X1／X5 的地點表（初值，可以照地形微調） ---------- */
export const LAND08 = {
  ring: RING08, entries: ENTRY08, rail: RAIL08, ledge: LEDGE08, ramps: RAMP08, passes: PASS08, oldroad: OLDROAD08, gate: GATE08, lakes: LAKES08.map(l => ({ id: l.id, name: l.name })), pits: PITS08, gullies: GULLY08, pillars: PILLAR08, ridges: RIDGE08,
  spots: { crocBeach: [0, 524], crocPond: AP(-50, 515), meltLake: AP(-8, 512), icePond: AP(-60, 665), saltSpring: AP(84, 468), pillarWood: AP(137, 458), vista: AP(12, 572), ferry: AP(166, 490), towers: [AP(-150, 505)], plaza: [556, -556] }
};
