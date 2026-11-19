/* 0.8 大擴建 X5a（美術）：新地場景・南半（南湖濕原、林緣獵場、紅土荒坡、鹽原）。
   這個檔只有一個進入點 buildProps08b(ctx)（world.js 在 buildPlaces06 後呼叫，見 patches/world.js-x5a-patch.py）：
   樹用舊世界同一套（樹形、著色器、淡出、碰撞，由 ctx.plantTrees 交給 world.js 的實例化樹）；其餘（灌木、蘆葦、高草、花叢）各做一個原型、每個分格一個 InstancedMesh；
   石頭、石柱、倒木、枯樹、渡口、獵臺、營地布置、鹽門與鹽泉併成每格兩個靜態網格（岩石材質＝和舊石頭同一張三向貼圖；其餘＝和 0.6 地標同一種平塗頂點色）。
   所有顏色走頂點色、光照與霧用 three 標準材質（和舊世界同一套光）。碰撞只給大物件（樹、大石、石柱、獵臺腳、木樁、鹽拱腳），小草、小石、花不加。
   座標：x 向東、z 向南；AP(a, r)＝(r·sin a, −r·cos a)（a＝方位，0 北、90 東）。不動半徑 333 以內任何東西（所有物件的半徑都 ≥ 342）。
   注意：整個檔只用 斜線星號 這種註解（補丁與遊戲檔的慣例），沒有行尾雙斜線註解。 */
import * as THREE from './three.bundle.js';
import { AP, azOf, tallGrass08, PILLAR08, GULLY08, ENTRY08, zone08, edge08 } from './land08.js';

const TAU = Math.PI * 2, PI = Math.PI, hyp = Math.hypot, sin = Math.sin, cos = Math.cos;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = t => t * t * (3 - 2 * t); const u = s(xf), v = s(yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1 + 3) * 0.28 + vnoise(x * 4.3 + 1, y * 4.3 + 9) * 0.12;
let R = mulberry(8081);      /* 目前的亂數（每個原型、每一段擺放各自換種子，結果固定） */

/* ---------- 色票（sRGB 輸入，轉成線性；和 world.js 的 C6 同一套轉法） ---------- */
const col = (r, g, b) => { const k = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); return [k.r, k.g, k.b]; };
const PC = {
  wood: col(0.42, 0.29, 0.18), woodD: col(0.3, 0.2, 0.13), plank: col(0.62, 0.46, 0.29), plankW: col(0.55, 0.5, 0.42), pale: col(0.74, 0.6, 0.42), bark: col(0.33, 0.25, 0.18), barkL: col(0.48, 0.4, 0.31), dead: col(0.6, 0.56, 0.5), deadD: col(0.42, 0.38, 0.34), cut: col(0.72, 0.56, 0.36),
  canvas: col(0.84, 0.78, 0.62), canvasG: col(0.5, 0.56, 0.4), thatch: col(0.74, 0.62, 0.33), thatchD: col(0.56, 0.46, 0.25), hay: col(0.86, 0.72, 0.36), rope: col(0.62, 0.52, 0.36), iron: col(0.22, 0.22, 0.25), rust: col(0.45, 0.26, 0.16), bone: col(0.9, 0.87, 0.78), red: col(0.66, 0.14, 0.11),
  moss: col(0.36, 0.52, 0.26), mossD: col(0.26, 0.4, 0.2), stone: col(0.58, 0.56, 0.53), stoneL: col(0.78, 0.75, 0.69), stoneD: col(0.4, 0.39, 0.38), mud: col(0.5, 0.42, 0.3),
  salt: col(0.97, 0.96, 0.93), saltB: col(0.84, 0.9, 0.96), saltD: col(0.8, 0.78, 0.72), saltPink: col(0.95, 0.84, 0.8),
  clay: col(0.66, 0.36, 0.22), clayD: col(0.5, 0.26, 0.17), brick: col(0.62, 0.3, 0.2), ash: col(0.3, 0.28, 0.27), soot: col(0.14, 0.12, 0.11),
  leaf: col(0.27, 0.5, 0.2), leafL: col(0.4, 0.62, 0.25), leafD: col(0.18, 0.36, 0.16), leafY: col(0.5, 0.6, 0.24), reed: col(0.5, 0.6, 0.28), reedD: col(0.36, 0.46, 0.22), reedL: col(0.66, 0.7, 0.36), cat: col(0.4, 0.26, 0.15),
  stalk: col(0.78, 0.68, 0.36), stalkD: col(0.58, 0.5, 0.26), stalkG: col(0.55, 0.62, 0.28), seed: col(0.82, 0.62, 0.28), thorn: col(0.56, 0.5, 0.3), thornD: col(0.38, 0.34, 0.2), sage: col(0.5, 0.58, 0.46), sageD: col(0.36, 0.44, 0.36), stem: col(0.45, 0.62, 0.28),
  rr: [col(0.6, 0.26, 0.17), col(0.76, 0.4, 0.21), col(0.48, 0.2, 0.15), col(0.82, 0.62, 0.38), col(0.7, 0.5, 0.34), col(0.45, 0.24, 0.22)], rrCap: col(0.84, 0.7, 0.5), rrDust: col(0.7, 0.42, 0.28),
  grey: [col(0.58, 0.56, 0.52), col(0.66, 0.63, 0.58), col(0.5, 0.49, 0.47)], sandst: [col(0.78, 0.66, 0.46), col(0.7, 0.58, 0.4), col(0.84, 0.74, 0.54)]
};

/* ---------- 頂點累積器與基本形 ---------- */
const mkAcc = () => ({ p: [], n: [], c: [] });
const UG = {};
function unit(k) {
  if (UG[k]) return UG[k];
  if (k === 'roof') { const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [.5, 0, .5], D = [-.5, 0, .5], E = [-.5, 1, 0], F = [.5, 1, 0], g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([A, F, B, A, E, F, D, C, F, D, F, E, A, D, E, B, F, C].flat(), 3)); return UG[k] = g; }
  return UG[k] = k === 'box' ? new THREE.BoxGeometry(1, 1, 1) : k === 'cyl' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8) : k === 'cyl6' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 6) : k === 'cyl5' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 5) : k === 'tap' ? new THREE.CylinderGeometry(0.3, 0.5, 1, 6) : k === 'cone' ? new THREE.ConeGeometry(0.5, 1, 6) : k === 'cone8' ? new THREE.ConeGeometry(0.5, 1, 8) : k === 'spike' ? new THREE.ConeGeometry(0.5, 1, 4) : k === 'spike3' ? new THREE.ConeGeometry(0.5, 1, 3) : k === 'hex' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true) : k === 'cyl3' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 3) : k === 'octa' ? new THREE.OctahedronGeometry(0.5, 0) : k === 'dode' ? new THREE.DodecahedronGeometry(0.5, 0) : k === 'ico1' ? new THREE.IcosahedronGeometry(0.5, 1) : new THREE.IcosahedronGeometry(0.5, 0);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _n3 = new THREE.Matrix3();
const _V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
/* 把一個幾何（單位大小）用矩陣 m 轉過去，每個三角形一個平面法線、一個顏色（顏色 col × k × 面抖動） */
function put(A, g, m, c, k = 1, jit = 0.06) {
  const ps = g.attributes.position, ix = g.index ? g.index.array : null, n = ix ? ix.length : ps.count;
  for (let i = 0; i < n; i += 3) {
    for (let j = 0; j < 3; j++) _V[j].fromBufferAttribute(ps, ix ? ix[i + j] : i + j).applyMatrix4(m);
    _a.subVectors(_V[1], _V[0]); _b.subVectors(_V[2], _V[0]); _a.cross(_b); const l = _a.length(); if (l < 1e-9) continue; _a.multiplyScalar(1 / l);
    const f = k * (1 + (R() - 0.5) * 2 * jit);
    for (let j = 0; j < 3; j++) { A.p.push(_V[j].x, _V[j].y, _V[j].z); A.n.push(_a.x, _a.y, _a.z); A.c.push(c[0] * f, c[1] * f, c[2] * f); }
  }
}
function prim(A, kind, x, y, z, sx, sy, sz, c, ry = 0, rx = 0, rz = 0, k = 1, jit = 0.05) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); put(A, unit(kind), _m, c, k, jit); }
const box = (A, x, y, z, sx, sy, sz, c, ry, rx, rz, k) => prim(A, 'box', x, y, z, sx, sy, sz, c, ry, rx, rz, k);
/* 兩點之間的一根料（w、h 是斷面；kind 可換圓木） */
function beam(A, x1, y1, z1, x2, y2, z2, w, h, c, kind = 'box', k = 1) { _v.set(x2 - x1, y2 - y1, z2 - z1); const L = _v.length(); if (L < 1e-4) return; _q.setFromUnitVectors(_UP, _v.multiplyScalar(1 / L)); _m.compose(_p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), _q, _s.set(w, L, h)); put(A, unit(kind), _m, c, k, 0.05); }
/* 單面三角（雙面材質用，葉片） */
function tri(A, a, b, c3, c, k = 1) { _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c3[0] - a[0], c3[1] - a[1], c3[2] - a[2]); _a.cross(_b); const l = _a.length(); if (l < 1e-12) return; _a.multiplyScalar(1 / l); for (const q of [a, b, c3]) { A.p.push(q[0], q[1], q[2]); A.n.push(_a.x, _a.y, _a.z); A.c.push(c[0] * k, c[1] * k, c[2] * k); } }
function quad(A, a, b, c3, d, c, k = 1) { tri(A, a, b, c3, c, k); tri(A, a, c3, d, c, k); }
/* 有凹凸的球／石頭：icosahedron 的頂點按位置雜訊位移（同位置同位移，不會裂縫），下面壓平。col＝顏色，o：d 細分、rough 凹凸、flat 壓平下限（−1…0）、low 底部變暗倍數、yaw、tilt */
function blob(A, x, y, z, rx, ry, rz, c, o = {}) {
  const g = unit(o.d === 0 ? 'ico0' : 'ico1'), ps = g.attributes.position, n = ps.count, ix = g.index ? g.index.array : null, rough = o.rough ?? 0.22, flat = o.flat ?? -0.6, low = o.low ?? 0.7, seed = (o.seed ?? R() * 1000) | 0, yaw = o.yaw ?? R() * TAU, tilt = o.tilt || 0;
  const V = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let px = ps.getX(i) * 2, py = ps.getY(i) * 2, pz = ps.getZ(i) * 2;
    const hh = hash2(Math.round(px * 83) + seed, Math.round(py * 83) + Math.round(pz * 57)), d = 1 + (hh - 0.5) * 2 * rough;
    px *= d; py = Math.max(py * d, flat); pz *= d; V[i * 3] = px * rx; V[i * 3 + 1] = py * ry; V[i * 3 + 2] = pz * rz;
  }
  _e.set(tilt, yaw, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
  const cnt = ix ? ix.length : n;
  for (let i = 0; i < cnt; i += 3) {
    for (let j = 0; j < 3; j++) { const vi = ix ? ix[i + j] : i + j; _V[j].set(V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]).applyMatrix4(_m); }
    _a.subVectors(_V[1], _V[0]); _b.subVectors(_V[2], _V[0]); _a.cross(_b); const l = _a.length(); if (l < 1e-9) continue; _a.multiplyScalar(1 / l);
    const yc = ((_V[0].y + _V[1].y + _V[2].y) / 3 - (y - ry * 0.55)) / (ry * 1.5), f = (1 + (R() - 0.5) * 2 * 0.06) * lerp(low, 1, clamp(yc, 0, 1));
    for (let j = 0; j < 3; j++) { A.p.push(_V[j].x, _V[j].y, _V[j].z); A.n.push(_a.x, _a.y, _a.z); A.c.push(c[0] * f, c[1] * f, c[2] * f); }
  }
}
/* 原型（累積器）→ 擺到世界：矩陣 ＝ 位置、繞 y 轉、各軸縮放、tint 乘色；寫進目標累積器 */
function emit(T, P, x, y, z, ry, sx, sy, sz, tint, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); _n3.getNormalMatrix(_m);
  const n = P.p.length / 3, t0 = tint ? tint[0] : 1, t1 = tint ? tint[1] : 1, t2 = tint ? tint[2] : 1;
  for (let i = 0; i < n; i++) {
    _v.set(P.p[i * 3], P.p[i * 3 + 1], P.p[i * 3 + 2]).applyMatrix4(_m); T.p.push(_v.x, _v.y, _v.z);
    _v.set(P.n[i * 3], P.n[i * 3 + 1], P.n[i * 3 + 2]).applyMatrix3(_n3).normalize(); T.n.push(_v.x, _v.y, _v.z);
    T.c.push(P.c[i * 3] * t0, P.c[i * 3 + 1] * t1, P.c[i * 3 + 2] * t2);
  }
}
function toGeo(A, sway) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
  if (sway) { const s = new Float32Array(A.p.length / 3), k = new Float32Array(A.p.length / 3).fill(1); for (let i = 0; i < s.length; i++) s[i] = sway(A.p[i * 3], A.p[i * 3 + 1], A.p[i * 3 + 2], i); g.setAttribute('aS', new THREE.BufferAttribute(s, 1)); if (A.k) { for (let i = 0; i < k.length; i++) k[i] = A.k[i]; } g.setAttribute('aK', new THREE.BufferAttribute(k, 1)); }
  g.computeBoundingSphere(); g.userData.tris = A.p.length / 9; return g;
}

/* ---------- 原型：灌木、蘆葦、高草、花叢、棘叢、枯樹、石頭 ---------- */
function protoBush(seed, o = {}) {
  R = mulberry(seed); const A = mkAcc(), nb = 5 + (R() * 2 | 0), base = o.base || PC.leaf, top = o.top || PC.leafL, mid = o.mid || PC.leafY, cs = [base, top, mid, base, top];
  for (let i = 0; i < nb; i++) { const a = i / nb * TAU + R() * 0.8, d = i ? 0.45 + R() * 0.4 : 0, rr = (i ? 0.42 : 0.62) + R() * 0.26, y = rr * 0.38 + (i % 2) * 0.12;
    blob(A, cos(a) * d, y, sin(a) * d, rr * 1.1, rr * 0.95, rr * 1.1, cs[i % cs.length], { d: 0, rough: 0.12, flat: -0.35, low: 0.55, seed: seed + i * 13, jit: 0.1 }); }
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 0.55 + R() * 0.55; beam(A, cos(a) * d * 0.7, 0.35, sin(a) * d * 0.7, cos(a) * d * 1.15, 0.95 + R() * 0.3, sin(a) * d * 1.15, 0.16, 0.16, i % 2 ? top : mid, 'spike3'); }
  if (o.berries) for (let i = 0; i < 8; i++) { const a = R() * TAU, d = 0.5 + R() * 0.6, y = 0.45 + R() * 0.55; prim(A, 'octa', cos(a) * d, y, sin(a) * d, 0.15, 0.15, 0.15, o.berries, R() * 3, 0, 0, 1, 0.1); }
  return A;
}
/* 蘆葦／高草：一叢細葉片（每片 3 個三角形，雙面），略彎；tips＝穗（香蒲的棕色穗、高草的種子穗） */
function protoReed(seed, o = {}) {
  R = mulberry(seed); const A = mkAcc(), n = o.n || 11, H = o.h || 2.2, lo = o.lo || PC.reedD, hi = o.hi || PC.reedL;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * (o.spread || 0.5), bx = cos(a) * d, bz = sin(a) * d, h = H * (0.62 + R() * 0.55), la = R() * TAU, lean = (0.12 + R() * 0.3) * h * (o.lean || 1), w = (o.w || 0.11) * (0.8 + R() * 0.5);
    const tx = cos(la), tz = sin(la), px = -tz, pz = tx;
    const m1 = [bx + tx * lean * 0.18, h * 0.55, bz + tz * lean * 0.18], tp = [bx + tx * lean, h, bz + tz * lean];
    tri(A, [bx - px * w, 0, bz - pz * w], [bx + px * w, 0, bz + pz * w], [m1[0] - px * w * 0.7, m1[1], m1[2] - pz * w * 0.7], lo, 0.9);
    tri(A, [bx + px * w, 0, bz + pz * w], [m1[0] + px * w * 0.7, m1[1], m1[2] + pz * w * 0.7], [m1[0] - px * w * 0.7, m1[1], m1[2] - pz * w * 0.7], lo, 1.0);
    tri(A, [m1[0] - px * w * 0.7, m1[1], m1[2] - pz * w * 0.7], [m1[0] + px * w * 0.7, m1[1], m1[2] + pz * w * 0.7], tp, hi, 1.0);
    if (o.tip && i % (o.tipEvery || 3) === 0) { const th = o.tipH || 0.36; prim(A, o.tipKind || 'cyl5', tp[0], tp[1] - th * 0.1, tp[2], 0.07, th, 0.07, o.tip, 0, 0, 0, 1, 0.1); }
  }
  return A;
}
function protoFlower(seed, o = {}) {
  R = mulberry(seed); const A = mkAcc(), K = [], n = o.n || 5;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * 0.4, bx = cos(a) * d, bz = sin(a) * d, h = (o.h || 0.55) * (0.7 + R() * 0.6), w = 0.025, la = R() * TAU, lean = 0.08 * h, tx = bx + cos(la) * lean, tz = bz + sin(la) * lean;
    const n0 = A.p.length / 3; tri(A, [bx - w, 0, bz], [bx + w, 0, bz], [tx, h, tz], PC.stem, 1);
    const n1 = A.p.length / 3; for (let j = n0; j < n1; j++) K[j] = 0;
    const n2 = A.p.length / 3; prim(A, 'octa', tx, h, tz, 0.17 * (o.size || 1), 0.1, 0.17 * (o.size || 1), [1, 1, 1], R() * 3, 0.25, 0, 1, 0.05); const n3 = A.p.length / 3; for (let j = n2; j < n3; j++) K[j] = 1;
  }
  A.k = K; return A;
}
function protoThorn(seed, o = {}) {
  R = mulberry(seed); const A = mkAcc(), n = o.n || 8;
  for (let i = 0; i < n; i++) { const a = R() * TAU, out = 0.1 + R() * 0.55, h = (o.h || 0.9) * (0.55 + R() * 0.6), lean = 0.35 + R() * 0.55; beam(A, cos(a) * 0.08, 0.05, sin(a) * 0.08, cos(a) * (out + lean * 0.4), h, sin(a) * (out + lean * 0.4), 0.13 + R() * 0.05, 0.13, i % 3 ? (o.c1 || PC.thorn) : (o.c2 || PC.thornD), 'spike'); }
  blob(A, 0, 0.18, 0, 0.45, 0.3, 0.45, o.c2 || PC.thornD, { d: 0, rough: 0.3, flat: -0.2, low: 0.6 });
  return A;
}
/* 倒木／枯樹：原型（站在原點、沿 +x 躺或站直） */
function protoLog(seed, L, r, o = {}) {
  R = mulberry(seed); const A = mkAcc(), nb = 2 + (R() * 3 | 0);
  prim(A, 'cyl6', 0, r, 0, r * 2, L, r * 2, o.c || PC.bark, 0, 0, PI / 2, 1, 0.06);
  prim(A, 'cyl6', L / 2 + 0.01, r, 0, r * 1.75, 0.04, r * 1.75, PC.cut, 0, 0, PI / 2, 1, 0.04); prim(A, 'cyl6', -L / 2 - 0.01, r, 0, r * 1.75, 0.04, r * 1.75, PC.cut, 0, 0, PI / 2, 1, 0.04);
  for (let i = 0; i < nb; i++) { const t = (R() - 0.5) * L * 0.8, side = R() < 0.5 ? -1 : 1, bl = 0.5 + R() * 0.8; beam(A, t, r * 1.6, side * r * 0.6, t + 0.3, r * 1.6 + bl * 0.5, side * (r * 0.6 + bl * 0.8), r * 0.55, r * 0.55, PC.barkL, 'cyl6'); }
  if (o.moss) for (let i = 0; i < 3; i++) blob(A, (R() - 0.5) * L * 0.6, r * 1.8, (R() - 0.5) * r * 0.8, r * 1.3, r * 0.35, r * 1.0, i % 2 ? PC.moss : PC.mossD, { d: 0, rough: 0.2, flat: -0.2, low: 0.8 });
  return A;
}
function protoSnag(seed, H, o = {}) {
  R = mulberry(seed); const A = mkAcc(), c0 = o.c || PC.dead, r0 = o.r || 0.34;
  prim(A, 'tap', 0, H * 0.5, 0, r0 * 2, H, r0 * 2, c0, 0, 0, 0, 1, 0.07); prim(A, 'cone', 0, H + 0.2, 0, r0 * 0.9, 0.9, r0 * 0.9, PC.deadD, 0, 0, 0, 1, 0.05);
  const nb = 3 + (R() * 3 | 0); for (let i = 0; i < nb; i++) { const a = R() * TAU, y0 = H * (0.35 + R() * 0.5), len = 0.9 + R() * 1.7 * (H / 5), up = 0.4 + R() * 0.9; beam(A, 0, y0, 0, cos(a) * len, y0 + up, sin(a) * len, r0 * 0.7, r0 * 0.7, c0, 'cyl6');
    if (R() < 0.7) beam(A, cos(a) * len * 0.6, y0 + up * 0.55, sin(a) * len * 0.6, cos(a + 0.7) * len * 1.05, y0 + up + 0.7, sin(a + 0.7) * len * 1.05, r0 * 0.4, r0 * 0.4, c0, 'cyl6'); }
  if (o.root) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + R(); beam(A, 0, 0.3, 0, cos(a) * 1.0, 0.0, sin(a) * 1.0, r0 * 0.8, r0 * 0.8, PC.deadD, 'cyl6'); }
  return A;
}
/* 石頭原型：圓、扁、尖、一塊塊的疊石 */
function protoRock(seed, kind, c) {
  R = mulberry(seed); const A = mkAcc();
  if (kind === 'round') blob(A, 0, 0.5, 0, 1.0, 0.8, 1.0, c, { d: 1, rough: 0.18, flat: -0.45, low: 0.62, seed });
  else if (kind === 'lump') blob(A, 0, 0.5, 0, 1.0, 0.75, 0.85, c, { d: 0, rough: 0.32, flat: -0.4, low: 0.6, seed });
  else if (kind === 'slab') { blob(A, 0, 0.3, 0, 1.2, 0.34, 0.95, c, { d: 1, rough: 0.12, flat: -0.35, low: 0.7, seed }); }
  else if (kind === 'tall') { blob(A, 0, 0.9, 0, 0.62, 1.15, 0.58, c, { d: 0, rough: 0.28, flat: -0.6, low: 0.58, seed }); blob(A, 0.45, 0.3, 0.15, 0.55, 0.45, 0.5, c, { d: 0, rough: 0.28, flat: -0.4, low: 0.6, seed: seed + 5 }); }
  else if (kind === 'cluster') { for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(), d = i ? 0.8 : 0, s = i ? 0.45 + R() * 0.25 : 0.85; blob(A, cos(a) * d, s * 0.4, sin(a) * d, s, s * 0.8, s, c, { d: 0, rough: 0.28, flat: -0.4, low: 0.6, seed: seed + i * 7 }); } }
  return A;
}

/* ---------- 環境（buildProps08b 設定） ---------- */
let X = null;      /* ctx */
const G = (x, z) => X.Hgt(x, z);
const WL = (x, z) => X.waterLevel ? X.waterLevel(x, z) : -2.6;
const rot2 = (x, z, rot, lx, lz) => [x + lx * cos(rot) + lz * sin(rot), z - lx * sin(rot) + lz * cos(rot)];      /* 局部座標（x 向「前」、z 向右）→ 世界；和 rotation.y 同方向 */

/* 把三角形的法線翻成朝向 ref（外側參考向量）：單面材質時繞向要對 */
function triO(A, a, b, c3, c, k, ref) {
  _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c3[0] - a[0], c3[1] - a[1], c3[2] - a[2]); _a.cross(_b);
  if (_a.x * ref[0] + _a.y * ref[1] + _a.z * ref[2] < 0) { const t = b; b = c3; c3 = t; }
  tri(A, a, b, c3, c, k);
}

/* ---------- 層理岩柱（紅岩、水平層理、不規則）：蓋住地形上那根像樹樁的柱子 ----------
   o：R0 腰最細的半徑（地形柱半徑 + 1.12，不能比這個細，不然地形會露出來）、yb 底（比周圍最低的地面再埋 0.7）、yt 頂、n 邊數、cap 頂部加寬 0–1、pal 色票、seed */
function pillar(T, x, z, o) {
  R = mulberry(o.seed || 1); const n = o.n || 12, yb = o.yb, yt = o.yt, R0 = o.R0, pal = o.pal || PC.rr, cap = o.cap || 0;
  const capT = cap ? Math.min(1.3, 0.45 + 0.22 * R0) : 0, yS = yt - capT, HS = Math.max(1.5, yS - yb), nY = Math.max(5, Math.round(HS / 0.75));
  const fk = [], phi = R() * TAU, ell = 0.08 + R() * 0.18, waist = R() < 0.55, topB = 0.12 + R() * 0.5, la = R() * TAU, mag = R() * 0.09 * HS, sd = R() * 90;
  for (let k = 0; k < n; k++) fk.push(R() * 0.14 + (k % 3 === 0 ? 0.08 : 0));
  /* 層理：一條條厚薄不一的顏色帶，硬層微凸、軟層微凹（只差幾公分），不是一片片盤子 */
  const bands = []; { let yy = yb, last = -1; while (yy < yt + 1) { const th = 0.2 + R() * 1.0, q = R(); let ci = q < 0.8 ? (R() * 3) | 0 : q < 0.92 ? 4 : 3; ci = Math.min(ci, pal.length - 1); if (ci === last && R() < 0.7) ci = (ci + 1) % Math.min(3, pal.length); last = ci; const j = 0.92 + R() * 0.16, pc0 = pal[ci], mx = ci >= 3 ? 0.5 : 0, pm = pal[1], pc = [pc0[0] * (1 - mx) + pm[0] * mx, pc0[1] * (1 - mx) + pm[1] * mx, pc0[2] * (1 - mx) + pm[2] * mx]; yy += th; bands.push({ y1: yy, c: [pc[0] * j, pc[1] * j, pc[2] * j], hard: ci >= 3 ? 0.9 : R() * 0.7 }); } }
  const bandAt = y => { for (const q of bands) if (y < q.y1) return q; return bands[bands.length - 1]; };
  const rings = [];
  for (let j = 0; j <= nY; j++) {
    const t = j / nY, y = yb + HS * t, flare = 0.55 * Math.pow(smooth(0.3, 0, t), 1.5), tb = topB * smooth(0.4, 0.97, t) * (waist ? 1.25 : 0.7), bd = bandAt(y + 0.01), mod = 0.95 + 0.07 * bd.hard;
    const cx = x + cos(la) * mag * Math.pow(t, 1.6), cz = z + sin(la) * mag * Math.pow(t, 1.6), P = [];
    for (let k = 0; k < n; k++) { const ang = k / n * TAU, el = 1 + ell * (0.5 + 0.5 * cos(2 * (ang - phi))), nz = 1 + (vnoise(k * 1.7 + sd, y * 0.42 + sd) - 0.5) * 0.14;
      let rr = R0 * (1.02 + flare + tb) * mod * el * nz * (1 + fk[k]); if (t < 0.6) rr = Math.max(rr, R0 * 1.0); P.push([cx + cos(ang) * rr, y, cz + sin(ang) * rr]); }
    rings.push({ P, c: bd.c, cx, cz, y });
  }
  for (let j = 0; j < nY; j++) { const A = rings[j], B = rings[j + 1], dust = lerp(0.72, 1.0, smooth(0, 0.45, j / nY));
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, ax = (A.P[k][0] + A.P[k2][0]) / 2 - A.cx, az = (A.P[k][2] + A.P[k2][2]) / 2 - A.cz, sh = dust * (0.92 + 0.14 * hash2(k * 7 + j, j * 3 + (o.seed | 0)));
      triO(T, A.P[k], A.P[k2], B.P[k2], A.c, sh, [ax, 0, az]); triO(T, A.P[k], B.P[k2], B.P[k], A.c, sh, [ax, 0, az]); } }
  const top = rings[nY];
  if (cap) {
    const bw = bandAt(yS).c, cB = [], cM = [], cT = [], ro = 1.12 + 0.28 * cap, cc = o.capCol || PC.rrCap; const tc = [top.cx, 0, top.cz];
    for (let k = 0; k < n; k++) { const ang = k / n * TAU, nz = 1 + (hash2(k * 5 + 1, sd | 0) - 0.5) * 0.3, rb = R0 * (1.02 + topB * (waist ? 1.25 : 0.7)) * ro * nz * (1 + fk[k]), c0 = top.P[k];
      cB.push([top.cx + cos(ang) * rb, yS + 0.05, top.cz + sin(ang) * rb]); cM.push([top.cx + cos(ang) * rb * 1.04, yS + capT * 0.55, top.cz + sin(ang) * rb * 1.04]); cT.push([top.cx + cos(ang) * rb * 0.8, yt + (hash2(k * 3 + 7, sd | 0) - 0.5) * 0.5, top.cz + sin(ang) * rb * 0.8]); }
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, ax = cB[k][0] - top.cx, az = cB[k][2] - top.cz;
      triO(T, top.P[k], top.P[k2], cB[k2], bw, 0.7, [ax * 0.5, -1, az * 0.5]); triO(T, top.P[k], cB[k2], cB[k], bw, 0.7, [ax * 0.5, -1, az * 0.5]);
      triO(T, cB[k], cB[k2], cM[k2], cc, 0.82, [ax, 0, az]); triO(T, cB[k], cM[k2], cM[k], cc, 0.82, [ax, 0, az]);
      triO(T, cM[k], cM[k2], cT[k2], cc, 1.0, [ax, 0.3, az]); triO(T, cM[k], cT[k2], cT[k], cc, 1.0, [ax, 0.3, az]);
      triO(T, [top.cx, yt + 0.12 + R() * 0.2, top.cz], cT[k], cT[k2], cc, 1.1, [0, 1, 0]); }
  } else {
    const ap = [top.cx, top.y + 0.3 + R() * 0.7, top.cz]; for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; triO(T, ap, top.P[k], top.P[k2], top.c, 1.1, [0, 1, 0]); }
  }
}
/* 一堆碎石（石柱腳、溝邊）：x、z 中心，r 散開的半徑，n 個，大小 s0–s1 */
function rubble(T, x, z, r, n, s0, s1, pal, tintOn) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, d = r * (0.35 + 0.65 * Math.sqrt(R())), px = x + cos(a) * d, pz = z + sin(a) * d, s = s0 + (s1 - s0) * Math.pow(R(), 1.6), c = pal[(R() * pal.length) | 0];
    if (X.blockedAt(px, pz) || X.waterDepth(px, pz) > -0.3) continue;
    const A = mkAcc(); blob(A, 0, 0, 0, s, s * 0.7, s * 0.9, c, { d: 0, rough: 0.3, flat: -0.35, low: 0.62 }); emit(T, A, px, G(px, pz) - s * 0.12, pz, 0, 1, 1, 1, null); }
}

/* ---------- 木柵、獵人的東西 ---------- */
const post = (T, x, z, h, w, c, kind = 'box', lean = 0, ry = 0, y0 = null) => prim(T, kind, x, (y0 == null ? G(x, z) : y0) + h / 2 - 0.3, z, w, h + 0.3, w, c, ry, lean, lean * 0.6);
function stakeFence(T, pts, o = {}) {
  const h = o.h || 1.3, brk = o.broken || 0.25, c = o.c || PC.wood, posts = [];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = hyp(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.0)); for (let k = i ? 1 : 0; k <= n; k++) posts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  posts.forEach(([x, z], i) => {
    if (R() > brk * 0.3) { const hh = h * (R() < brk ? 0.5 + R() * 0.4 : 1), ln = (R() - 0.5) * 0.3 * (1 + brk); post(T, x, z, hh, 0.2, c, 'cyl6', ln, R() * 3); prim(T, 'spike', x, G(x, z) + hh - 0.1, z, 0.22, 0.34, 0.22, PC.pale, 0, ln, ln * 0.6, 1, 0.05); }
    if (i === posts.length - 1) return; const [x2, z2] = posts[i + 1], r = R(); if (r < brk * 0.5) return;
    beam(T, x, G(x, z) + h * 0.8, z, x2, G(x2, z2) + h * 0.8 - (r < brk ? 0.35 : 0), z2, 0.1, 0.14, c, 'box'); if (R() > brk * 0.6) beam(T, x, G(x, z) + h * 0.42, z, x2, G(x2, z2) + h * 0.42, z2, 0.1, 0.14, c, 'box');
    if (o.collide !== false) X.addCollider((x + x2) / 2, (z + z2) / 2, hyp(x2 - x, z2 - z) * 0.42, 1.2);
  });
  return posts;
}
function bones(T, x, z, n = 6, big = false) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 1.2, px = x + cos(a) * d, pz = z + sin(a) * d, py = G(px, pz), L = 0.3 + R() * 0.45; if (X.waterDepth(px, pz) > -0.1) continue;
    prim(T, 'cyl5', px, py + 0.05, pz, 0.06, L, 0.06, PC.bone, R() * 3, 0, PI / 2 + (R() - 0.5) * 0.3, 1, 0.08); if (R() < 0.5) { prim(T, 'ico0', px + L * 0.5, py + 0.06, pz, 0.1, 0.09, 0.1, PC.bone, 0, 0, 0, 1, 0.08); prim(T, 'ico0', px - L * 0.5, py + 0.06, pz, 0.1, 0.09, 0.1, PC.bone, 0, 0, 0, 1, 0.08); } }
  if (big) { const py = G(x, z); prim(T, 'ico1', x, py + 0.22, z, 0.5, 0.38, 0.5, PC.bone, 0.6, 0, 0, 1, 0.05); prim(T, 'box', x + 0.2, py + 0.08, z + 0.18, 0.4, 0.14, 0.3, PC.bone, 0.6, 0, 0, 1, 0.05); for (const s of [-1, 1]) prim(T, 'ico0', x + 0.15 + s * 0.02, py + 0.3, z + 0.08 + s * 0.15, 0.13, 0.13, 0.13, PC.soot, 0.6, 0, 0, 1, 0.05); for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.55; beam(T, x - 0.6 + i * 0.26, py + 0.04, z - 0.5, x - 0.55 + i * 0.26, py + 0.28, z - 0.9 + Math.abs(a) * 0.1, 0.05, 0.05, PC.bone, 'cyl5'); } }
}
function notice(T, x, z, ry, text = 3) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry), wx = -sa, wz = -ca;      /* 局部 z 的反方向…板子沿局部 z（寬）：世界方向 (sin ry, cos ry) */
  const ex = sa, ez = ca;
  post(T, x - ex * 0.8, z - ez * 0.8, 2.3, 0.14, PC.woodD, 'box', 0.03, ry); post(T, x + ex * 0.8, z + ez * 0.8, 2.3, 0.14, PC.woodD, 'box', -0.02, ry);
  box(T, x, py + 1.75, z, 0.07, 1.0, 1.8, PC.plank, ry, 0, 0.0); box(T, x + ca * 0.045, py + 1.75 - 0.02, z - sa * 0.045, 0.02, 0.1, 1.45, PC.red, ry, 0, 0);
  for (let i = 0; i < text; i++) box(T, x + ca * 0.05, py + 1.62 - i * 0.2, z - sa * 0.05, 0.015, 0.06, 1.2 - i * 0.22 + R() * 0.12, PC.soot, ry, 0, 0);
  X.addCollider(x, z, 0.9, 2.2);
}
function hideRack(T, x, z, ry) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry), e = [sa, ca];
  for (const s of [-1, 1]) { beam(T, x + e[0] * s * 1.5 - ca * 0.5, py - 0.1, z + e[1] * s * 1.5 + sa * 0.5, x + e[0] * s * 1.3, py + 2.1, z + e[1] * s * 1.3, 0.14, 0.14, PC.wood, 'cyl6'); beam(T, x + e[0] * s * 1.5 + ca * 0.5, py - 0.1, z + e[1] * s * 1.5 - sa * 0.5, x + e[0] * s * 1.3, py + 2.1, z + e[1] * s * 1.3, 0.14, 0.14, PC.wood, 'cyl6'); }
  beam(T, x - e[0] * 1.45, py + 2.05, z - e[1] * 1.45, x + e[0] * 1.45, py + 2.05, z + e[1] * 1.45, 0.13, 0.13, PC.woodD, 'cyl6');
  const hides = [PC.mud, PC.barkL, col(0.6, 0.5, 0.36), col(0.45, 0.36, 0.28)];
  for (let i = 0; i < 3; i++) { const t = -0.8 + i * 0.8, hx = x + e[0] * t, hz = z + e[1] * t, hh = 0.9 + R() * 0.4; quad(T, [hx - e[0] * 0.3 - ca * 0.02, py + 2.0, hz - e[1] * 0.3 + sa * 0.02], [hx + e[0] * 0.3 - ca * 0.02, py + 2.0, hz + e[1] * 0.3 + sa * 0.02], [hx + e[0] * 0.3 * 0.7 - ca * 0.05, py + 2.0 - hh, hz + e[1] * 0.3 * 0.7 + sa * 0.05], [hx - e[0] * 0.3 * 0.7 - ca * 0.05, py + 2.0 - hh, hz - e[1] * 0.3 * 0.7 + sa * 0.05], hides[i % 4], 1); }
  X.addCollider(x, z, 1.3, 2.2);
}
/* 獵人的偽裝簾（藏在高草邊）：幾根斜插的樹枝、橫編的細枝、掛著葉子 */
function blind(T, x, z, ry) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry), e = [sa, ca];
  for (let i = 0; i < 6; i++) { const t = -1.5 + i * 0.6, bx = x + e[0] * t, bz = z + e[1] * t, lean = (R() - 0.5) * 0.3; beam(T, bx, py - 0.1, bz, bx + ca * 0.5 * (0.5 + lean), py + 1.5 + R() * 0.3, bz - sa * 0.5 * (0.5 + lean), 0.1, 0.1, PC.woodD, 'cyl6'); }
  for (const hy of [0.5, 0.95, 1.35]) beam(T, x - e[0] * 1.6, py + hy, z - e[1] * 1.6, x + e[0] * 1.6, py + hy + 0.1, z + e[1] * 1.6, 0.06, 0.06, PC.barkL, 'cyl6');
  for (let i = 0; i < 7; i++) { const t = -1.4 + i * 0.47, A = mkAcc(); blob(A, 0, 0, 0, 0.5, 0.3, 0.3, i % 2 ? PC.leafD : PC.leafY, { d: 0, rough: 0.3, flat: -0.3, low: 0.7 }); emit(T, A, x + e[0] * t + ca * 0.1, py + 0.6 + R() * 0.9, z + e[1] * t - sa * 0.1, ry, 1, 1, 1, null); }
  X.addCollider(x, z, 1.5, 1.6);
}

/* ---------- 帳篷、小屋、棚 ---------- */
function tent(T, x, z, ry, w = 2.7, L = 3.4, h = 2.1, c = PC.canvas) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry);
  prim(T, 'roof', x, py - 0.12, z, L, h, w, c, ry, 0, 0, 1, 0.06);      /* 脊線沿局部 x（長度 L） */
  const fx = x + ca * (L / 2), fz = z - sa * (L / 2);
  box(T, fx - ca * 0.02, py + h * 0.28, fz + sa * 0.02, 0.05, h * 0.52, w * 0.34, PC.soot, ry, 0, 0);
  for (const s of [-1, 1]) { const px = x + ca * (L / 2 + 0.55) + sa * s * (w / 2 + 0.5), pz = z - sa * (L / 2 + 0.55) + ca * s * (w / 2 + 0.5); prim(T, 'spike', px, G(px, pz) + 0.14, pz, 0.1, 0.34, 0.1, PC.pale, 0, 0.3 * s, 0, 1, 0.05); }
  X.addBox(x, z, L / 2, w / 2, ry, h * 0.9);
}
/* 木板小屋（有門洞）：w 寬、d 深、h 牆高；屋頂 'roof' 稜線沿 d 方向；wh＝屋頂色 */
function hut(T, x, z, ry, w, d, h, wall, roofc, o = {}) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry);
  prim(T, 'box', x, py + h / 2 - 0.1, z, d, h + 0.2, w, wall, ry, 0, 0, 1, 0.05);
  prim(T, 'roof', x, py + h - 0.02, z, d * 1.14, h * 0.55, w * 1.18, roofc, ry, 0, 0, 1, 0.07);
  const dx = x + ca * (d / 2 + 0.03), dz = z - sa * (d / 2 + 0.03);
  box(T, dx, py + 0.95, dz, 0.06, 1.8, 0.95, PC.soot, ry, 0, 0);
  box(T, dx + ca * 0.02, py + 1.95, dz - sa * 0.02, 0.1, 0.12, 1.15, PC.woodD, ry, 0, 0);
  for (const s of [-1, 1]) box(T, dx + ca * 0.02 + sa * s * 0.55, py + 1.0, dz - sa * 0.02 + ca * s * 0.55, 0.1, 2.0, 0.1, PC.woodD, ry, 0, 0);
  if (o.window) box(T, x - ca * 0.0 + sa * (w / 2 + 0.03), py + 1.4, z + ca * (w / 2 + 0.03), 0.8, 0.6, 0.06, PC.soot, ry, 0, 0);
  X.addBox(x, z, d / 2 + 0.1, w / 2 + 0.1, ry, h + 1);
}
function leanto(T, x, z, ry, w, d, c = PC.thatch) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry), e = [sa, ca];
  for (const s of [-1, 1]) { post(T, x - ca * d * 0.5 + e[0] * s * w / 2, z + sa * d * 0.5 + e[1] * s * w / 2, 2.7, 0.14, PC.wood, 'cyl6'); post(T, x + ca * d * 0.5 + e[0] * s * w / 2, z - sa * d * 0.5 + e[1] * s * w / 2, 1.7, 0.14, PC.wood, 'cyl6'); }
  const tilt = Math.atan2(1.0, d); const Bq = mkAcc(); prim(Bq, 'box', 0, 0, 0, d * 1.18, 0.16, w * 1.25, c, 0, 0, 0, 1, 0.08);
  emit(T, Bq, x, py + 2.2, z, ry, 1, 1, 1, null, 0, -tilt);
}
function woodpile(T, x, z, ry, L = 1.6, n = 4) {
  const py = G(x, z), ca = cos(ry), sa = sin(ry), r = 0.17;
  for (let lv = 0; lv < n; lv++) for (let i = 0; i < n - lv; i++) { const o = (i - (n - lv - 1) / 2) * r * 2.05, ox = sa * o, oz = ca * o, yy = py + r + lv * r * 1.75, j = (R() - 0.5) * 0.25;
    beam(T, x + ox - ca * L / 2 + ca * j, yy, z + oz + sa * L / 2 - sa * j, x + ox + ca * L / 2 + ca * j, yy, z + oz - sa * L / 2 - sa * j, r * 2, r * 2, R() < 0.3 ? PC.woodD : PC.bark, 'cyl6'); }
  X.addCollider(x, z, Math.max(L, n * r * 2) * 0.55, n * r * 1.75);
}
function crate(T, x, z, ry, s = 0.9, c = PC.plank) { const py = G(x, z); box(T, x, py + s / 2 - 0.04, z, s, s, s * 0.9, c, ry, 0, 0, 1); box(T, x, py + s / 2 - 0.04, z, s * 1.04, 0.08, s * 0.94, PC.woodD, ry); box(T, x, py + s - 0.06, z, s * 1.04, 0.08, s * 0.94, PC.woodD, ry); X.addCollider(x, z, s * 0.62, s); }
function barrel(T, x, z, s = 1, c = PC.wood) { const py = G(x, z); prim(T, 'cyl', x, py + 0.45 * s, z, 0.8 * s, 0.9 * s, 0.8 * s, c, R() * 3, 0, 0, 1, 0.05); for (const hy of [0.18, 0.72]) prim(T, 'cyl', x, py + hy * s, z, 0.84 * s, 0.07 * s, 0.84 * s, PC.iron, 0, 0, 0, 1, 0.03); X.addCollider(x, z, 0.45 * s, 0.9 * s); }
function sack(T, x, z, c = PC.canvas, s = 1) { const A = mkAcc(); blob(A, 0, 0, 0, 0.38 * s, 0.34 * s, 0.3 * s, c, { d: 0, rough: 0.16, flat: -0.3, low: 0.75 }); emit(T, A, x, G(x, z) + 0.02, z, R() * TAU, 1, 1, 1, null); }
/* 營火邊的長條座位不由我做（world.js 的 campSeats）；這裡只做地標與雜物 */

/* ---------- 渡口木棧（廢掉的）：一半在岸上、一半伸進湖裡，尾端塌掉 ---------- */
function pier(T, sx, sz, dx, dz, o = {}) {
  /* (sx,sz) 岸線上的點，(dx,dz) 單位向量指向水裡；從岸上 3 m 開始，總長 len */
  const len = o.len || 13, w = 2.5, ry = Math.atan2(-dz, dx), px = -dz, pz = dx, yd = Math.max(G(sx, sz) + 0.32, WL(sx + dx * 6, sz + dz * 6) + 0.55), u0 = -3.0;
  const at = (u, v) => [sx + dx * u + px * v, sz + dz * u + pz * v];
  for (const v of [-0.85, 0, 0.85]) { const u1 = u0 + len - (v === 0 ? 0 : 1.6 + R() * 1.4), [ax, az] = at(u0, v), [bx, bz] = at(u1, v); beam(T, ax, yd - 0.14, az, bx, yd - 0.14 - (v === 0 ? 0 : 0.18), bz, 0.2, 0.2, PC.woodD, 'box'); }
  for (let u = u0; u < u0 + len; u += 0.44) {
    const k = (u - u0) / len, wreck = smooth(0.62, 0.95, k), miss = 0.08 + wreck * 0.5; if (R() < miss) continue;
    const [qx, qz] = at(u + R() * 0.04, (R() - 0.5) * 0.08), tilt = wreck * (R() - 0.3) * 0.5, sink = wreck * R() * 0.25;
    prim(T, 'box', qx, yd - sink, qz, 0.38, 0.09, w * (0.96 + R() * 0.06), R() < 0.3 ? PC.plankW : PC.plank, ry + (R() - 0.5) * 0.05, 0, tilt * 0.5, 1, 0.08);
  }
  for (let u = u0 + 0.2; u < u0 + len - 0.5; u += 2.4) for (const v of [-1.18, 1.18]) {
    const k = (u - u0) / len, [qx, qz] = at(u, v), yb = Math.min(G(qx, qz), WL(qx, qz)) - 0.5, broken = R() < smooth(0.55, 0.95, k) * 0.7, top = broken ? yd - 0.25 - R() * 0.5 : yd + 0.62;
    prim(T, 'cyl6', qx, (yb + top) / 2, qz, 0.24, top - yb, 0.24, PC.wood, 0, broken ? (R() - 0.5) * 0.2 : 0, 0, 1, 0.07);
    if (!broken && R() < 0.6) { prim(T, 'cyl6', qx, yd + 0.66, qz, 0.28, 0.06, 0.28, PC.rope, 0, 0, 0, 1, 0.06); }
    if (u < u0 + 3.5) X.addCollider(qx, qz, 0.2, 1.2);
  }
  const [cx, cz] = at(u0 + len * 0.55, 0); if (G(cx, cz) < WL(cx, cz) - 0.2) X.addBox(cx, cz, len * 0.4, 1.3, ry, 1.2);
  const [ex, ez] = at(u0 + len + 0.2, 0.4); beam(T, ex, yd - 0.3, ez, ex + dx * 0.8, WL(ex, ez) + 0.05, ez + dz * 0.8, 0.12, 0.12, PC.rope, 'cyl6');
  return { y: yd, from: at(u0, 0), to: at(u0 + len, 0) };
}
function skiff(T, x, z, ry, upside = true) {
  const py = G(x, z);
  const A = mkAcc(); blob(A, 0, 0, 0, 1.9, 0.55, 0.78, PC.plank, { d: 1, rough: 0.05, flat: -0.05, low: 0.8, yaw: 0 }); blob(A, 0, 0, 0, 1.7, 0.5, 0.6, PC.plankW, { d: 0, rough: 0.03, flat: -0.05, low: 0.8, yaw: 0 });
  emit(T, A, x, py - 0.05, z, ry, 1, 1, 1, null);
  for (let i = -3; i <= 3; i++) { const t = i * 0.5, e = [sin(ry), cos(ry)], c = [cos(ry), -sin(ry)]; box(T, x + c[0] * t * 0.9 - e[0] * 0.0, py + 0.42 * (1 - Math.abs(t) * 0.25) + 0.06, z + c[1] * t * 0.9, 0.06, 0.04, 1.35 * (1 - Math.abs(t) * 0.28), PC.woodD, ry, 0, 0); }
  beam(T, x - cos(ry) * 1.8, py + 0.12, z + sin(ry) * 1.8, x + cos(ry) * 1.9, py + 0.3, z - sin(ry) * 1.9, 0.1, 0.1, PC.woodD, 'box');
  X.addCollider(x + cos(ry) * 0.7, z - sin(ry) * 0.7, 0.95, 0.9); X.addCollider(x - cos(ry) * 0.7, z + sin(ry) * 0.7, 0.95, 0.9);
}
function oar(T, x, z, ry) { const py = G(x, z); beam(T, x, py + 0.05, z, x + cos(ry) * 0.5, py + 1.5, z - sin(ry) * 0.5, 0.07, 0.07, PC.woodD, 'cyl6'); const tx = x + cos(ry) * 0.5, tz = z - sin(ry) * 0.5; box(T, tx - cos(ry) * 0.02, py + 1.5 - 0.15 + 0.1, tz, 0.3, 0.1, 0.3, PC.plank, ry); beam(T, x, py + 0.03, z, x - cos(ry) * 0.2, py + 0.15, z + sin(ry) * 0.2, 0.1, 0.14, PC.plank, 'box'); }
function bellPost(T, x, z, ry) {
  const py = G(x, z); post(T, x, z, 3.0, 0.2, PC.woodD, 'cyl6'); const c = cos(ry), s = -sin(ry);
  beam(T, x, py + 2.75, z, x + c * 1.1, py + 2.75, z + s * 1.1, 0.14, 0.14, PC.woodD, 'cyl6'); beam(T, x + c * 0.2, py + 2.2, z + s * 0.2, x + c * 0.9, py + 2.65, z + s * 0.9, 0.09, 0.09, PC.woodD, 'cyl6');
  beam(T, x + c * 0.9, py + 2.75, z + s * 0.9, x + c * 0.9, py + 2.35, z + s * 0.9, 0.025, 0.025, PC.rope, 'cyl5'); prim(T, 'tap', x + c * 0.9, py + 2.3, z + s * 0.9, 0.05, 0.08, 0.05, PC.iron, 0, 0, 0, 1, 0.05);
  X.addCollider(x, z, 0.35, 3);
}
function netRack(T, x, z, ry) {
  const py = G(x, z), e = [sin(ry), cos(ry)];
  for (const s of [-1, 1]) post(T, x + e[0] * s * 1.6, z + e[1] * s * 1.6, 2.4, 0.16, PC.wood, 'cyl6', s * 0.04);
  beam(T, x - e[0] * 1.6, py + 2.2, z - e[1] * 1.6, x + e[0] * 1.6, py + 2.2, z + e[1] * 1.6, 0.12, 0.12, PC.woodD, 'cyl6');
  for (let i = 0; i < 9; i++) { const t = -1.4 + i * 0.35, h = 1.1 + R() * 0.7; beam(T, x + e[0] * t, py + 2.15, z + e[1] * t, x + e[0] * t + (R() - 0.5) * 0.1, py + 2.15 - h, z + e[1] * t, 0.03, 0.03, PC.rope, 'cyl5'); }
  for (let i = 0; i < 5; i++) { const t = -1.2 + i * 0.6, hy = 2.15 - 0.5 - R() * 0.4; beam(T, x + e[0] * (t - 0.5), py + hy, z + e[1] * (t - 0.5), x + e[0] * (t + 0.5), py + hy - 0.05, z + e[1] * (t + 0.5), 0.02, 0.02, PC.rope, 'cyl5'); }
  X.addCollider(x + e[0] * 1.6, z + e[1] * 1.6, 0.2, 2.4); X.addCollider(x - e[0] * 1.6, z - e[1] * 1.6, 0.2, 2.4);
}

/* ---------- 獵臺（5 m 高的瞭望臺：四腳、斜撐、木板臺面、三面欄杆、茅草頂、靠一側的梯子） ---------- */
export const TOWER08 = { platform: 4.55, legs: 1.5, ladder: 'south', note: '臺面高於地面 4.55 m；臺面邊長 3.2 m；梯子在 +z（南）面；玩法要「站上去」可用 deck（臺面 hw=1.5）或爬梯觸發' };
function tower(T, x, z, rot, seed) {
  R = mulberry(seed); const py = G(x, z) - 0.15, c = cos(rot), s = sin(rot), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c], H = TOWER08.platform, L = TOWER08.legs;
  const legs = [[-L, -L], [L, -L], [L, L], [-L, L]];
  for (const [lx, lz] of legs) { const [bx, bz] = P(lx * 1.18, lz * 1.18), [tx, tz] = P(lx * 0.92, lz * 0.92); beam(T, bx, py - 0.25, bz, tx, py + H + 0.5, tz, 0.3, 0.3, PC.wood, 'cyl6'); X.addCollider(bx, bz, 0.42, H); }
  for (const hy of [1.5, 3.0]) for (let i = 0; i < 4; i++) { const a = legs[i], b = legs[(i + 1) % 4], k = 1.18 - 0.26 * (hy / H), [ax, az] = P(a[0] * k, a[1] * k), [bx, bz] = P(b[0] * k, b[1] * k); beam(T, ax, py + hy, az, bx, py + hy, bz, 0.14, 0.14, PC.woodD, 'cyl6');
    const k2 = 1.18 - 0.26 * ((hy + (hy < 2 ? -1.4 : 1.4)) / H), [cx2, cz2] = P(b[0] * (hy < 2 ? 1.18 : 1.0), b[1] * (hy < 2 ? 1.18 : 1.0)); if (hy < 2) beam(T, ax, py + 0.2, az, bx, py + 1.5 + 1.2, bz, 0.1, 0.1, PC.woodD, 'cyl6'); }
  for (let i = 0; i < 9; i++) { const lz = -L - 0.2 + i * 0.4, [ax, az] = P(-L - 0.35, lz), [bx, bz] = P(L + 0.35, lz); beam(T, ax, py + H, az, bx, py + H + (R() - 0.5) * 0.02, bz, 0.4, 0.14, R() < 0.3 ? PC.plankW : PC.plank, 'box'); }
  for (const lz of [-L + 0.1, L - 0.1]) { const [ax, az] = P(-L - 0.35, lz), [bx, bz] = P(L + 0.35, lz); beam(T, ax, py + H - 0.2, az, bx, py + H - 0.2, bz, 0.16, 0.18, PC.woodD, 'box'); }
  const rail = (a, b) => { const [ax, az] = P(a[0], a[1]), [bx, bz] = P(b[0], b[1]); for (const hy of [0.55, 1.05]) beam(T, ax, py + H + hy, az, bx, py + H + hy, bz, 0.09, 0.09, PC.wood, 'cyl6'); const n = Math.max(2, Math.round(hyp(bx - ax, bz - az) / 1.1)); for (let i = 0; i <= n; i++) { const t = i / n, qx = ax + (bx - ax) * t, qz = az + (bz - az) * t; beam(T, qx, py + H, qz, qx, py + H + 1.1, qz, 0.1, 0.1, PC.wood, 'cyl6'); } };
  rail([-L - 0.3, -L - 0.2], [L + 0.3, -L - 0.2]); rail([-L - 0.3, -L - 0.2], [-L - 0.3, L + 0.3]); rail([L + 0.3, -L - 0.2], [L + 0.3, L + 0.3]);
  rail([-L - 0.3, L + 0.3], [-0.5, L + 0.3]); rail([0.5, L + 0.3], [L + 0.3, L + 0.3]);
  const [nx, nz] = P(0, -L - 0.26); box(T, nx, py + H + 0.7, nz, 0.06, 0.34, 1.3, PC.plank, rot + PI / 2 * 0);
  for (const [lx, lz] of legs) { const [tx, tz] = P(lx * 0.8, lz * 0.8); beam(T, tx, py + H + 0.1, tz, tx * 0.97 + x * 0.03, py + H + 2.55, tz * 0.97 + z * 0.03, 0.12, 0.12, PC.wood, 'cyl6'); }
  const A = mkAcc(); prim(A, 'cone', 0, 0, 0, 5.2, 1.9, 5.2, PC.thatch, PI / 4, 0, 0, 1, 0.09); emit(T, A, x, py + H + 2.5, z, rot, 1, 1, 1, null);
  const A2 = mkAcc(); prim(A2, 'cone', 0, 0, 0, 3.4, 0.8, 3.4, PC.thatchD, PI / 4, 0, 0, 1, 0.09); emit(T, A2, x, py + H + 3.55, z, rot, 1, 1, 1, null);
  const [l0x, l0z] = P(0.35, L + 1.05), [l1x, l1z] = P(0.35, L + 0.35), [m0x, m0z] = P(-0.35, L + 1.05), [m1x, m1z] = P(-0.35, L + 0.35);
  beam(T, l0x, py - 0.1, l0z, l1x, py + H + 1.1, l1z, 0.1, 0.1, PC.wood, 'box'); beam(T, m0x, py - 0.1, m0z, m1x, py + H + 1.1, m1z, 0.1, 0.1, PC.wood, 'box');
  for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12, [ax, az] = P(-0.35, L + 1.05 - 0.7 * t), [bx, bz] = P(0.35, L + 1.05 - 0.7 * t); beam(T, ax, py - 0.1 + (H + 1.2) * t, az, bx, py - 0.1 + (H + 1.2) * t, bz, 0.06, 0.06, PC.pale, 'cyl6'); }
  for (let i = 0; i < 4; i++) { const [qx, qz] = P(L + 0.33, -L + 0.5 + i * 0.5 + R() * 0.2); box(T, qx, py + H + 0.45, qz, 0.03, 0.05 + R() * 0.04, 0.18 + R() * 0.14, PC.soot, rot, 0, 0); }
  const [bx, bz] = P(0, 2.9), [b2x, b2z] = P(-1.1, 3.0); box(T, bx, py + 0.2, bz, 0.7, 0.4, 0.5, PC.woodD, rot, 0, 0);
  return { x, z, rot, platformY: py + H + 0.09, ladder: P(0, L + 1.05) };
}

/* ---------- 營地布置（營火與座位由 world.js 的 campfire 做；這裡只放周邊的東西。火在 (x,z)，rot＝局部 +x 的朝向） ---------- */
const CAMP08 = {
  ferry: { name: '南湖渡口', a: 166, r: 490, rot: 0 },
  hunter: { name: '獵臺營', a: -140, r: 445, rot: 0.9 },
  kiln: { name: '紅土窯', a: 150, r: 514, rot: 3.0 },
  salt: { name: '鹽工小屋', a: 112, r: 500, rot: 1.0 }
};
export const CAMPS08 = Object.fromEntries(Object.entries(CAMP08).map(([k, v]) => [k, { id: k, name: v.name, x: AP(v.a, v.r)[0], z: AP(v.a, v.r)[1], rot: v.rot }]));
function camp(T, id, x, z, rot, seed) {
  R = mulberry(seed); const P = (lx, lz) => rot2(x, z, rot, lx, lz);
  const faceFire = (lx, lz) => { const [wx, wz] = P(lx, lz); return Math.atan2(-(z - wz), x - wx); };
  const ok = (lx, lz, pad = 1) => { const [wx, wz] = P(lx, lz); return !X.blockedAt(wx, wz) && X.waterDepth(wx, wz) < -0.45 && G(wx, wz) > -50; };
  const put1 = (lx, lz, fn) => { if (!ok(lx, lz)) return false; const [wx, wz] = P(lx, lz); fn(wx, wz, faceFire(lx, lz)); return true; };
  if (id === 'ferry') {
    put1(7.2, -5.4, (wx, wz, fa) => hut(T, wx, wz, fa, 3.3, 3.0, 2.1, PC.plank, PC.thatchD, { window: true }));
    put1(-6.0, -3.6, (wx, wz) => bellPost(T, wx, wz, rot + 2.4));
    put1(6.4, 5.2, (wx, wz, fa) => netRack(T, wx, wz, fa + PI / 2));
    put1(2.0, -8.6, (wx, wz) => { crate(T, wx, wz, R() * 3); crate(T, wx + 1.0, wz + 0.4, R() * 3, 0.75); barrel(T, wx - 0.9, wz + 0.2); });
    put1(-4.8, 7.4, (wx, wz) => { skiff(T, wx, wz, rot + 0.5); oar(T, wx + 2.6, wz - 0.6, 0.4); });
    put1(8.8, 0.8, (wx, wz) => { barrel(T, wx, wz); barrel(T, wx + 0.9, wz + 0.3, 0.9); sack(T, wx + 0.3, wz - 1.0); });
  } else if (id === 'hunter') {
    put1(6.4, -4.2, (wx, wz, fa) => tent(T, wx, wz, fa, 2.7, 3.4, 2.1, PC.canvas));
    put1(-5.6, -5.6, (wx, wz, fa) => tent(T, wx, wz, fa, 2.5, 3.1, 1.95, PC.canvasG));
    put1(5.6, 5.8, (wx, wz, fa) => hideRack(T, wx, wz, fa + PI / 2));
    put1(-6.4, 3.8, (wx, wz) => woodpile(T, wx, wz, rot + 0.4, 1.7, 4));
    put1(0.4, -8.2, (wx, wz) => { const py = G(wx, wz); box(T, wx, py + 0.85, wz, 1.6, 0.1, 0.8, PC.plank, rot, 0, 0); for (const sx of [-0.65, 0.65]) for (const sz of [-0.3, 0.3]) beam(T, wx + sx * cos(rot) + sz * sin(rot), py - 0.1, wz - sx * sin(rot) + sz * cos(rot), wx + sx * cos(rot) + sz * sin(rot), py + 0.82, wz - sx * sin(rot) + sz * cos(rot), 0.1, 0.1, PC.wood, 'cyl6'); box(T, wx - 0.3, py + 0.93, wz, 0.5, 0.03, 0.12, PC.iron, rot + 0.5, 0, 0); X.addCollider(wx, wz, 1.0, 1.0); });
    put1(-0.5, 8.0, (wx, wz) => { const py = G(wx, wz); post(T, wx, wz, 2.6, 0.18, PC.woodD, 'cyl6'); for (const s of [-1, 1]) { beam(T, wx, py + 2.3, wz, wx + s * 0.6 * cos(rot), py + 2.9, wz - s * 0.6 * sin(rot), 0.06, 0.06, PC.bone, 'cyl5'); beam(T, wx + s * 0.4 * cos(rot), py + 2.65, wz - s * 0.4 * sin(rot), wx + s * 0.9 * cos(rot), py + 3.0, wz - s * 0.9 * sin(rot), 0.045, 0.045, PC.bone, 'cyl5'); } X.addCollider(wx, wz, 0.3, 2.6); });
    put1(8.8, 1.6, (wx, wz) => stakeFence(T, [[wx, wz - 3], [wx + 0.5, wz], [wx, wz + 3]], { h: 1.2, broken: 0.2 }));
  } else if (id === 'kiln') {
    put1(7.0, -3.2, (wx, wz, fa) => { const py = G(wx, wz), A = mkAcc(); blob(A, 0, 0, 0, 2.6, 2.7, 2.6, PC.clay, { d: 1, rough: 0.05, flat: -0.02, low: 0.7, yaw: 0 }); emit(T, A, wx, py - 0.1, wz, 0, 1, 1, 1, null);
      const A2 = mkAcc(); prim(A2, 'box', 0.0, 0.0, 0.0, 0.1, 1.3, 1.2, PC.soot, 0, 0, 0, 1, 0.02); const dx = wx + cos(fa) * 2.45, dz = wz - sin(fa) * 2.45; emit(T, A2, dx, py + 0.65, dz, fa, 1, 1, 1, null);
      prim(T, 'cyl6', wx, py + 3.0, wz, 0.9, 1.1, 0.9, PC.clayD, 0, 0, 0, 1, 0.05); prim(T, 'cyl6', wx, py + 3.65, wz, 0.66, 0.2, 0.66, PC.soot, 0, 0, 0, 1, 0.03);
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; prim(T, 'box', wx + cos(a) * 2.35, py + 1.1, wz + sin(a) * 2.35, 0.14, 1.9, 0.5, PC.clayD, -a, 0, 0, 1, 0.05); }
      X.addCollider(wx, wz, 2.7, 3.2); });
    put1(-6.0, -4.4, (wx, wz, fa) => leanto(T, wx, wz, rot + 0.3, 3.4, 2.6));
    put1(-5.0, 5.0, (wx, wz) => { for (let i = 0; i < 7; i++) { const a = R() * TAU, d = 0.2 + R() * 1.1, qx = wx + cos(a) * d, qz = wz + sin(a) * d, py = G(qx, qz), hh = 0.4 + R() * 0.5; if (R() < 0.25) { prim(T, 'tap', qx, py + 0.15, qz, 0.5, 0.3, 0.5, PC.clayD, R() * 3, 0.1, 0.2, 1, 0.05); } else { prim(T, 'tap', qx, py + hh / 2, qz, 0.55, hh, 0.55, i % 2 ? PC.clay : PC.brick, 0, 0, 0, 1, 0.06); prim(T, 'cyl', qx, py + hh, qz, 0.62, 0.07, 0.62, PC.clayD, 0, 0, 0, 1, 0.05); } } X.addCollider(wx, wz, 1.5, 0.9); });
    put1(4.6, 5.6, (wx, wz) => { for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 4 - lv; i++) { const ox = (i - (3 - lv) / 2) * 0.62; box(T, wx + ox * cos(rot), G(wx, wz) + 0.14 + lv * 0.28, wz - ox * sin(rot), 0.58, 0.26, 0.4, lv % 2 ? PC.brick : PC.clay, rot + (R() - 0.5) * 0.1, 0, 0); } X.addCollider(wx, wz, 1.4, 1.1); });
    put1(-1.0, -8.8, (wx, wz) => { prim(T, 'cyl', wx, G(wx, wz) + 0.04, wz, 4.6, 0.1, 3.6, PC.clayD, 0, 0, 0, 1, 0.08); prim(T, 'cyl', wx, G(wx, wz) + 0.08, wz, 3.2, 0.06, 2.4, PC.mud, 0, 0, 0, 1, 0.1); });
    put1(8.6, 5.0, (wx, wz) => woodpile(T, wx, wz, rot + 1.2, 1.8, 5));
  } else if (id === 'salt') {
    put1(7.2, -4.8, (wx, wz, fa) => hut(T, wx, wz, fa, 3.8, 3.2, 2.2, PC.plank, PC.saltD, { window: true }));
    for (let i = 0; i < 3; i++) put1(-4.4, -5.8 + i * 2.2, (wx, wz) => { const py = G(wx, wz); prim(T, 'box', wx, py + 0.1, wz, 1.9, 0.2, 1.8, PC.woodD, rot, 0, 0, 1, 0.06); prim(T, 'box', wx, py + 0.18, wz, 1.6, 0.06, 1.5, PC.salt, rot, 0, 0, 1, 0.04); });
    put1(6.0, 3.4, (wx, wz) => { for (let i = 0; i < 6; i++) sack(T, wx + (i % 3) * 0.55 - 0.5, wz + ((i / 3) | 0) * 0.5, PC.salt, 1); for (let i = 0; i < 3; i++) sack(T, wx + 0.25 + i * 0.5 - 0.5, wz + 0.2, PC.saltD, 1); X.addCollider(wx, wz, 1.1, 0.8); });
    put1(2.0, 7.4, (wx, wz) => { const py = G(wx, wz), r2 = rot + 0.3, c = cos(r2), sn = -sin(r2), n = [sin(r2), cos(r2)]; box(T, wx, py + 0.78, wz, 2.2, 0.16, 1.2, PC.plank, r2);
      for (const sd of [-1, 1]) { prim(T, 'cyl', wx + n[0] * sd * 0.7, py + 0.45, wz + n[1] * sd * 0.7, 0.9, 0.12, 0.9, PC.woodD, r2, PI / 2, 0, 1, 0.06); prim(T, 'cyl6', wx + n[0] * sd * 0.7, py + 0.45, wz + n[1] * sd * 0.7, 0.16, 0.2, 0.16, PC.iron, r2, PI / 2, 0, 1, 0.03); }
      for (let i = 0; i < 4; i++) prim(T, 'box', wx + c * (-0.7 + i * 0.5), py + 1.0, wz + sn * (-0.7 + i * 0.5), 0.42, 0.3, 0.5, PC.salt, r2, 0, 0, 1, 0.05);
      beam(T, wx + c * 1.1, py + 0.75, wz + sn * 1.1, wx + c * 3.0, py + 0.12, wz + sn * 3.0, 0.12, 0.12, PC.wood, 'box'); X.addCollider(wx, wz, 1.3, 1.0); });
    put1(-6.4, 4.2, (wx, wz) => { barrel(T, wx, wz); barrel(T, wx + 1.0, wz + 0.4, 0.9, PC.woodD); const py = G(wx, wz); post(T, wx - 0.8, wz + 2.2, 2.6, 0.14, PC.woodD, 'cyl6'); prim(T, 'cyl', wx - 0.8, py + 2.45, wz + 2.2, 0.26, 0.3, 0.26, [2.2, 1.5, 0.7], 0, 0, 0, 1, 0.02); });
  }
  return { id, x, z, rot };
}

/* ---------- 鹽原：鹽門石拱、翻倒的鹽車、鹽結晶、鹽泉的白鹽臺 ---------- */
function saltArch(T, x, z, ry, span = 7.6) {
  R = mulberry(777); const py = G(x, z), c = cos(ry), s = -sin(ry), nz = [sin(ry), cos(ry)], half = span / 2, Hp = 2.6;
  const loc = (lx, ly, lz) => [x + c * lx + nz[0] * lz, py + ly, z + s * lx + nz[1] * lz];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i++) { const [px, py2, pz] = loc(0, i * 0.68 + 0.34, sd * (half + 0.1)); prim(T, 'box', px, py2 - 0.1, pz, 1.7 + R() * 0.15, 0.72, 1.55 + R() * 0.15, i % 2 ? PC.stoneL : PC.stone, ry + (R() - 0.5) * 0.08, 0, 0, 1, 0.07); }
    for (let i = 0; i < 5; i++) { const a = R() * TAU, [px, py2, pz] = loc((R() - 0.5) * 1.2, 0.1 + R() * 2.4, sd * (half + 0.1) + (R() - 0.5) * 1.2); prim(T, 'ico0', px, py2, pz, 0.5 + R() * 0.4, 0.25, 0.5 + R() * 0.4, PC.salt, R() * 3, 0, 0, 1, 0.04); }
    { const [qx, , qz] = loc(0, 0, sd * (half + 0.1)); X.addCollider(qx, qz, 1.05, 3.5); }
  }
  const N = 11;
  /* 拱圈：用旋轉的方塊（沿弧線），繞局部 x 轉 */
  for (let i = 0; i < N; i++) {
    const th = (i + 0.5) / N * PI, lz = -cos(th) * (half + 0.1), ly = Hp + sin(th) * (half * 0.78), [px, py2, pz] = loc(0, ly, lz), A = mkAcc();
    prim(A, 'box', 0, 0, 0, 1.35, 1.0, 1.0, i % 3 ? PC.stoneL : PC.stone, 0, 0, th - PI / 2, 1, 0.07); emit(T, A, px, py2, pz, ry, 1, 1, 1, null);
    if (R() < 0.8) { const B = mkAcc(); blob(B, 0, 0, 0, 0.6, 0.18, 0.55, PC.salt, { d: 0, rough: 0.2, flat: -0.2, low: 0.9 }); emit(T, B, px + (loc(0, 0, 1)[0] - x) * 0, py2 + 0.5, pz, ry, 1, 1, 1, null, (th - PI / 2) * 0, 0); }
    if (R() < 0.55) { const [qx, qy, qz] = loc(R() * 0.8 - 0.4, ly - 0.55, lz); prim(T, 'spike', qx, qy - 0.2, qz, 0.2, 0.55 + R() * 0.4, 0.2, PC.salt, 0, PI, 0, 1, 0.04); }
  }
  const [kx, ky, kz] = loc(0, Hp + half * 0.78 + 0.62, 0); prim(T, 'box', kx, ky - 0.15, kz, 1.4, 0.7, 1.2, PC.stoneL, ry, 0, 0, 1, 0.05); prim(T, 'ico0', kx, ky + 0.3, kz, 1.2, 0.3, 1.0, PC.salt, 0, 0, 0, 1, 0.04);
  const [rx, ry2, rz] = loc(0.5, Hp + half * 0.78 - 0.6, 0); prim(T, 'cyl', rx, ry2, rz, 0.5, 0.06, 0.5, PC.iron, ry, PI / 2, 0, 1, 0.03);
}
function saltCart(T, x, z, ry) {
  R = mulberry(4242); const py = G(x, z), c = cos(ry), s = -sin(ry), n = [sin(ry), cos(ry)];
  const A = mkAcc(); prim(A, 'box', 0, 0, 0, 2.7, 0.2, 1.5, PC.plank, 0, 0, 0, 1, 0.06); for (const sd of [-1, 1]) prim(A, 'box', 0, 0.38, sd * 0.72, 2.7, 0.62, 0.08, PC.wood, 0, 0, 0, 1, 0.06); prim(A, 'box', 1.32, 0.38, 0, 0.08, 0.62, 1.5, PC.wood, 0, 0, 0, 1, 0.06);
  emit(T, A, x, py + 0.78, z, ry, 1, 1, 1, null, 0.0, PI * 0.46);
  beam(T, x - c * 0.1, py + 0.5, z - s * 0.1, x - c * 3.1, py + 1.4, z - s * 3.1, 0.16, 0.16, PC.wood, 'cyl6'); beam(T, x - c * 0.1 + n[0] * 0.5, py + 0.5, z - s * 0.1 + n[1] * 0.5, x - c * 3.0 + n[0] * 0.7, py + 1.3, z - s * 3.0 + n[1] * 0.7, 0.16, 0.16, PC.wood, 'cyl6');
  const W = (wx, wz, tilt) => { const B = mkAcc(); prim(B, 'cyl', 0, 0, 0, 1.4, 0.12, 1.4, PC.woodD, 0, 0, 0, 1, 0.06); prim(B, 'cyl6', 0, 0, 0, 0.3, 0.2, 0.3, PC.iron, 0, 0, 0, 1, 0.03); for (let i = 0; i < 4; i++) prim(B, 'box', 0, 0, 0, 1.3, 0.08, 0.1, PC.wood, 0, i * PI / 4, 0, 1, 0.06); emit(T, B, wx, G(wx, wz) + 0.7, wz, ry, 1, 1, 1, null, PI / 2 + tilt, 0); };
  W(x + n[0] * 1.3, z + n[1] * 1.3, 0.1); W(x - n[0] * 1.5 + c * 2.8, z - n[1] * 1.5 + s * 2.8, -0.2);
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 1.2 + R() * 1.8, qx = x + n[0] * (-1.3) + cos(a) * d, qz = z + n[1] * (-1.3) + sin(a) * d; if (X.blockedAt(qx, qz)) continue; if (i < 3) sack(T, qx, qz, PC.salt, 1.05); else { const B = mkAcc(); blob(B, 0, 0, 0, 0.5, 0.35, 0.45, PC.salt, { d: 0, rough: 0.3, flat: -0.3, low: 0.85 }); emit(T, B, qx, G(qx, qz), qz, R() * 3, 1, 1, 1, null); } }
  const B = mkAcc(); blob(B, 0, 0, 0, 1.6, 0.5, 1.3, PC.salt, { d: 1, rough: 0.2, flat: -0.3, low: 0.9 }); emit(T, B, x - n[0] * 1.8, G(x, z) - 0.05, z - n[1] * 1.8, R() * 3, 1, 1, 1, null);
  X.addCollider(x, z, 1.5, 1.4); X.addCollider(x - c * 1.6, z - s * 1.6, 0.4, 1.0);
}
function protoSaltCrystal(seed) {
  R = mulberry(seed); const A = mkAcc(), n = 3 + (R() * 4 | 0);
  for (let i = 0; i < n; i++) { const a = R() * TAU, d = i ? 0.1 + R() * 0.35 : 0, h = (i ? 0.3 + R() * 0.55 : 0.85 + R() * 0.45), lean = (R() - 0.5) * 0.7, w = 0.1 + R() * 0.08, c = [PC.salt, PC.saltB, PC.salt, PC.saltPink][(R() * 4) | 0];
    const bx = cos(a) * d, bz = sin(a) * d, tx = bx + lean * h * 0.4, tz = bz + (R() - 0.5) * 0.4 * h; beam(A, bx, 0, bz, tx, h * 0.8, tz, w * 2, w * 2, c, 'cyl6'); beam(A, tx, h * 0.78, tz, tx + lean * 0.1, h * 1.08, tz, w * 1.4, w * 1.4, c, 'spike'); }
  blob(A, 0, 0.02, 0, 0.5, 0.14, 0.45, PC.salt, { d: 0, rough: 0.25, flat: -0.2, low: 0.9 });
  return A;
}
/* 鹽泉的白鹽臺：從泉水的岸線往外，一圈圈低矮的白色梯田（弧形堤、中間有缺口），岸邊長一圈鹽結晶 */
function springTerrace(T, cx, cz, crystals) {
  R = mulberry((cx * 7 + cz * 13) | 0); const nA = 36;
  for (let k = 0; k < nA; k++) {
    const a = k / nA * TAU + (R() - 0.5) * 0.05, dx = cos(a), dz = sin(a); let rs = -1;
    for (let r = 0; r < 24; r += 0.5) { if (X.waterDepth(cx + dx * r, cz + dz * r) < 0.02) { rs = r; break; } }
    if (rs < 0) continue;
    for (let lv = 0; lv < 3; lv++) {
      const d = rs + 1.0 + lv * 1.5 + R() * 0.4, px = cx + dx * d, pz = cz + dz * d; if (R() < 0.18 + lv * 0.12) continue;
      if (X.blockedAt(px, pz) || X.waterDepth(px, pz) > -0.25) continue;
      const hh = 0.2 + (2 - lv) * 0.09 + R() * 0.06, L = 2 * Math.PI * d / nA * 1.15, B = mkAcc();
      prim(B, 'box', 0, 0, 0, L, hh, 0.7 + R() * 0.25, lv % 2 ? PC.salt : PC.saltB, 0, 0, 0, 1, 0.06); emit(T, B, px, G(px, pz) + hh * 0.3, pz, -a + PI / 2, 1, 1, 1, null);
    }
    if (R() < 0.7) { const d = rs + 0.35, px = cx + dx * d, pz = cz + dz * d; if (!X.blockedAt(px, pz) && X.waterDepth(px, pz) < -0.1) crystals(px, pz, 0.8 + R() * 0.7); }
  }
}

/* ---------- 材質 ---------- */
function makeMats(ctx) {
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  rock.onBeforeCompile = sh => {
    sh.uniforms.uRockTex = { value: ctx.rockTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP; varying vec3 vRN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = mat3(modelMatrix) * normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRockTex; varying vec3 vRP; varying vec3 vRN;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec3 bw = pow(abs(normalize(vRN)), vec3(4.0)); bw /= bw.x + bw.y + bw.z; vec3 rt = texture2D(uRockTex, vRP.zy * 0.13).rgb * bw.x + texture2D(uRockTex, vRP.xz * 0.13).rgb * bw.y + texture2D(uRockTex, vRP.xy * 0.13).rgb * bw.z; diffuseColor.rgb *= mix(vec3(1.0), rt * 12.0, 0.55); }');
  };
  rock.customProgramCacheKey = () => 'rock08b';
  const U = { uT: { value: 0 } };
  const leafMat = mask => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = U.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aS; uniform float uT;' + (mask ? '\nattribute float aK;' : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);\n#else\nvec3 ip = vec3(0.0);\n#endif\nfloat ph = ip.x * 0.21 + ip.z * 0.17; float wv = sin(uT * 1.6 + ph) * 0.65 + sin(uT * 2.9 + ph * 1.7 + transformed.x * 2.0) * 0.35; transformed.x += aS * wv; transformed.z += aS * wv * 0.55;');
      if (mask) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', 'vColor = vec3(1.0);\n#ifdef USE_COLOR\nvColor *= color;\n#endif\n#ifdef USE_INSTANCING_COLOR\nvColor *= mix(vec3(1.0), instanceColor.xyz, aK);\n#endif');
    };
    m.customProgramCacheKey = () => mask ? 'leaf08bm' : 'leaf08b';
    return m;
  };
  return { flat, rock, leaf: leafMat(false), flower: leafMat(true), U };
}

/* ---------- 主程式 ---------- */
const GS = 4, GX0 = -464, GZ0 = -284, GW = 258, GH = 214, ZC = { southlake: 1, edgewood: 2, redslope: 3, saltflat: 4 };
const CELL = 720;      /* 分格邊長（公尺）：每格最多 2 個靜態網格＋幾個實例化網格 */

export function buildProps08b(ctx) {
  X = ctx; const t0 = typeof performance !== 'undefined' ? performance.now() : 0, OPT = Object.assign({ camps: true, sampleFires: false, density: 0.75 }, ctx.opt || {});
  /* X1 的正式營地座標（places08 的 CAMPS08）：id 對照 hunter→tower、salt→saltcabin；有給就覆蓋計畫座標 */
  const MAPID = { ferry: 'ferry', hunter: 'tower', kiln: 'kiln', salt: 'saltcabin' };
  if (ctx.camps08) for (const k of Object.keys(CAMPS08)) { const o = ctx.camps08.find(c => c.id === MAPID[k]); if (o) { CAMPS08[k].x = o.x; CAMPS08[k].z = o.z; } }
  const M = makeMats(ctx), stat = { trees: 0, bushes: 0, reeds: 0, stalks: 0, flowers: 0, thorns: 0, rocks: 0, logs: 0, snags: 0, pillars: 0, structures: [], colliders: 0, tris: { static: 0, inst: 0 }, meshes: { rock: 0, solid: 0, inst: 0 } };
  const addC = X.addCollider; let nCol = 0; X.addCollider = (x, z, r, h) => { nCol++; return addC(x, z, r, h); };
  const cells = new Map(), cellOf = (x, z) => { const k = Math.floor((x + 700) / CELL) * 64 + Math.floor((z + 500) / CELL); let c = cells.get(k); if (!c) cells.set(k, c = { rock: mkAcc(), pb: mkAcc(), solid: mkAcc(), inst: {}, id: k }); return c; };
  const trees = [], KEEP = [], DBG = [];

  /* 1. 格網預算：區域、擋、坡、離岸、離邊界 */
  const nCell = GW * GH, Z = new Uint8Array(nCell), BL = new Uint8Array(nCell), SL = new Float32Array(nCell), DW = new Float32Array(nCell), ED = new Float32Array(nCell);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, x = GX0 + i * GS + GS / 2, z = GZ0 + j * GS + GS / 2, r = hyp(x, z); if (r < 342 || r > 556) continue;
    const zc = ZC[zone08(x, z)]; if (!zc) continue; Z[k] = zc; BL[k] = X.blockedAt(x, z) ? 1 : 0; const sl = X.slopeAt(x, z); SL[k] = sl.s; DW[k] = X.lakeDist(x, z); ED[k] = edge08(x, z);
  }
  const cellIdx = (x, z) => { const i = Math.floor((x - GX0) / GS), j = Math.floor((z - GZ0) / GS); return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : j * GW + i; };
  const nearSeg = (x, z, pts) => { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], c = pts[i + 1], dx = c[0] - a[0], dz = c[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); b = Math.min(b, hyp(x - a[0] - dx * t, z - a[1] - dz * t)); } return b; };

  /* 2. 佔位（佔用的圓：[x, z, 對大物件的淨空, 對小物件的淨空]） */
  const occ = new Map(), ok = (ix, iz) => ix * 4096 + iz;
  const claim = (x, z, rc, rt) => { const k = ok(Math.floor(x / 6), Math.floor(z / 6)); let l = occ.get(k); if (!l) occ.set(k, l = []); l.push([x, z, rc, rt ?? rc]); };
  const free = (x, z, r, big) => { const cx = Math.floor(x / 6), cz = Math.floor(z / 6); for (let a = cx - 2; a <= cx + 2; a++) for (let b = cz - 2; b <= cz + 2; b++) { const l = occ.get(ok(a, b)); if (l) for (const q of l) if (hyp(q[0] - x, q[1] - z) < r + (big ? q[2] : q[3])) return false; } return true; };
  const kept = (x, z, pad) => { for (const q of KEEP) if (hyp(q[0] - x, q[1] - z) < q[2] + pad) return true; return false; };
  const crocArea = (x, z, pad) => hyp(x / (38 + pad), (z - 521) / (22 + pad)) < 1;
  const camps = OPT.camps ? Object.values(CAMPS08) : [];
  const FISH = AP(194, 490);
  for (const c of camps) KEEP.push([c.x, c.z, 15]);
  KEEP.push([FISH[0], FISH[1], 9]);
  const gullyD = (x, z) => { let b = 1e9; for (const g of GULLY08) b = Math.min(b, nearSeg(x, z, g)); return b; };
  const entryD = (x, z) => { let b = 1e9; for (const e of ENTRY08) b = Math.min(b, nearSeg(x, z, e.pts) - e.w); return b; };

  /* 3. 地標與結構 */
  const ferry = CAMPS08.ferry; let dockInfo = null;
  { const tx = -5 - ferry.x, tz = 470 - ferry.z, L = hyp(tx, tz), dx = tx / L, dz = tz / L; let sx = ferry.x, sz = ferry.z; for (let d = 0; d < 40; d += 0.5) { const px = ferry.x + dx * d, pz = ferry.z + dz * d; if (X.waterDepth(px, pz) > 0.02) break; sx = px; sz = pz; }
    const nx = -dz, nz = dx, sy = sx + nx * 1.5, szz = sz + nz * 1.5; const T = cellOf(sx, sz).solid; R = mulberry(3131); dockInfo = pier(T, sx, szz, dx, dz, { len: 13 }); dockInfo.shore = [sx, szz]; dockInfo.dir = [dx, dz];
    const px = -dz, pz = dx; KEEP.push([sx - dx * 1, szz - dz * 1, 9], [sx + dx * 6, szz + dz * 6, 8]);
    R = mulberry(3132); notice(T, sx - dx * 4.0 + px * 3.2, szz - dz * 4.0 + pz * 3.2, Math.atan2(-dz, dx) + 0.2, 3); bones(T, sx - dx * 3.4 + px * 4.6, szz - dz * 3.4 + pz * 4.6, 7, true);
    stat.structures.push('渡口木棧、告示、骨頭'); }

  /* 獵臺：在 AP(−150,505) 一帶找三塊最平的地，彼此約 40 m */
  const towers = [], flatScore = (x, z) => { if (X.blockedAt(x, z) || X.waterDepth(x, z) > -1 || hyp(x, z) < 346 || edge08(x, z) < 12) return 99; let m = 0; for (let a = 0; a < 8; a++) { const s = X.slopeAt(x + cos(a * PI / 4) * 3, z + sin(a * PI / 4) * 3).s; m = Math.max(m, s); } return m + tallGrass08(x, z) * 0.05; };
  { const c0 = AP(-150, 505); let best = null; for (let a = 0; a < 360; a += 15) for (let d = 0; d <= 26; d += 6) { const x = c0[0] + cos(a * D2R) * d, z = c0[1] + sin(a * D2R) * d, s = flatScore(x, z); if (!best || s < best[0]) best = [s, x, z]; } towers.push([best[1], best[2]]);
    for (let n = 1; n < 3; n++) { let b2 = null; for (let a = 0; a < 360; a += 10) { const x = towers[0][0] + cos(a * D2R) * 40, z = towers[0][1] + sin(a * D2R) * 40; if (n === 2 && Math.abs(hyp(x - towers[1][0], z - towers[1][1]) - 40) > 5) continue; const s = flatScore(x, z) + (n === 2 ? Math.abs(hyp(x - towers[1][0], z - towers[1][1]) - 40) * 0.01 : 0); if (!b2 || s < b2[0]) b2 = [s, x, z]; } towers.push([b2[1], b2[2]]); } }
  const towerInfo = towers.map((p, i) => { const rot = Math.atan2(-(p[1] - 300) * 0 + 0, 1) + (i - 1) * 0.9 + 0.35; KEEP.push([p[0], p[1], 7]); return tower(cellOf(p[0], p[1]).solid, p[0], p[1], rot, 6100 + i); });
  stat.structures.push('獵臺 ×3');
  R = mulberry(9001);
  /* 獵人的東西：臺子旁的拒馬、曬皮架、偽裝簾、骨頭 */
  { const cx = (towers[0][0] + towers[1][0] + towers[2][0]) / 3, cz = (towers[0][1] + towers[1][1] + towers[2][1]) / 3, T = () => cellOf(cx, cz).solid;
    const tryAt = (x, z, fn) => { if (X.blockedAt(x, z) || X.waterDepth(x, z) > -0.6 || kept(x, z, 3)) return; fn(x, z); };
    for (let i = 0; i < 3; i++) { const a = i * 2.2 + 0.7, x = cx + cos(a) * 24, z = cz + sin(a) * 24; tryAt(x, z, (px, pz) => { hideRack(T(), px, pz, a + PI / 2); claim(px, pz, 3, 2); KEEP.push([px, pz, 3]); }); }
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + 1.1, d = 34 + R() * 20, x = cx + cos(a) * d, z = cz + sin(a) * d; tryAt(x, z, (px, pz) => { blind(T(), px, pz, a + 1.5); claim(px, pz, 3, 2); KEEP.push([px, pz, 3]); }); }
    for (let i = 0; i < 3; i++) { const a = i * 2.3 + 0.2, x = cx + cos(a) * 15, z = cz + sin(a) * 15, b = a + 0.7; tryAt(x, z, (px, pz) => { stakeFence(T(), [[px, pz], [px + cos(b) * 5, pz + sin(b) * 5], [px + cos(b) * 9, pz + sin(b) * 9 - 1]], { h: 1.25, broken: 0.35 }); claim(px, pz, 4, 3); }); }
    for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 8 + R() * 40, x = cx + cos(a) * d, z = cz + sin(a) * d; tryAt(x, z, (px, pz) => { bones(T(), px, pz, 5, R() < 0.3); }); }
    stat.structures.push('獵人拒馬／曬皮架／偽裝簾'); }

  /* 營地布置 */
  const campInfo = {};
  for (const c of camps) { campInfo[c.id] = camp(cellOf(c.x, c.z).solid, c.id, c.x, c.z, c.rot, 5100 + c.id.length); claim(c.x, c.z, 14, 12); }
  if (camps.length) stat.structures.push('營地布置 ×' + camps.length);
  if (OPT.sampleFires && ctx.campfire) { for (const c of camps) ctx.campfire('x_' + c.id, c.name, c.x, c.z); if (ctx.fitCampfires) ctx.fitCampfires(); }
  /* 鹽門、鹽車（鹽原） */
  R = mulberry(5555);
  { const e = ENTRY08[1], pa = e.pts[e.pts.length - 2], pb = e.pts[e.pts.length - 1], ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]), ax = pb[0] + 4, az = pb[1] - 0.5; /* 採石場東口出口 */
    saltArch(cellOf(ax, az).solid, ax, az, -ang + PI / 2 * 0 + 0, 7.6); claim(ax, az, 8, 5); KEEP.push([ax, az, 8]);
    const cx = ax + 12, cz = az + 9; if (!X.blockedAt(cx, cz) && X.waterDepth(cx, cz) < -0.6) { saltCart(cellOf(cx, cz).solid, cx, cz, 0.7); claim(cx, cz, 4, 3.5); KEEP.push([cx, cz, 4]); }
    stat.structures.push('鹽門石拱、翻倒的鹽車'); }
  { const cA = AP(112, 500), cx = cA[0] + 38, cz = cA[1] - 30; if (!X.blockedAt(cx, cz) && X.waterDepth(cx, cz) < -0.6 && !kept(cx, cz, 4)) { saltCart(cellOf(cx, cz).solid, cx, cz, -1.1); claim(cx, cz, 4, 3.5); KEEP.push([cx, cz, 4]); } }
  const crystalP = [protoSaltCrystal(31), protoSaltCrystal(32), protoSaltCrystal(33), protoSaltCrystal(34)], crystalAt = (x, z, s) => { if (X.blockedAt(x, z) || X.waterDepth(x, z) > -0.15) return; const k = (R() * 4) | 0; emit(cellOf(x, z).pb, crystalP[k], x, G(x, z) - 0.04, z, R() * TAU, s, s * (0.9 + R() * 0.3), s, null, (R() - 0.5) * 0.15, (R() - 0.5) * 0.15); stat.crystals = (stat.crystals || 0) + 1; };
  for (const sp of [AP(84, 468), AP(97, 432)]) { springTerrace(cellOf(sp[0], sp[1]).pb, sp[0], sp[1], crystalAt); KEEP.push([sp[0], sp[1], 14]); claim(sp[0], sp[1], 12, 4); }
  stat.structures.push('鹽泉白鹽臺 ×2、鹽結晶');

  /* 4. 石柱林（蓋住地形的柱子）＋額外的細柱與風蝕石 */
  R = mulberry(2468);
  const pcen = AP(137, 458), rockT = (x, z) => cellOf(x, z).rock;
  PILLAR08.forEach((p, idx) => {
    const [px, pz, pr, ph] = p; let lo = 1e9, hi = -1e9; for (let a = 0; a < 12; a++) lo = Math.min(lo, G(px + cos(a * PI / 6) * (pr + 2.6), pz + sin(a * PI / 6) * (pr + 2.6)));
    for (let a = 0; a < 7; a++) hi = Math.max(hi, G(px + cos(a * 0.9) * pr * 0.4, pz + sin(a * 0.9) * pr * 0.4)); hi = Math.max(hi, G(px, pz));
    const cap = idx % 4 === 3 ? 0 : 0.3 + R() * 0.8, T = rockT(px, pz);
    pillar(T, px, pz, { R0: pr + 1.12, yb: lo - 0.9, yt: hi + 0.7 + R() * 0.8, n: pr > 3.4 ? 14 : 12, cap, seed: 100 + idx * 17, capCol: idx % 2 ? PC.rrCap : PC.sandst[1] });
    /* 一兩根貼著的細柱（兩三根連在一起）；底部直接埋進主柱 */
    for (let q = 0; q < (idx % 3 === 2 ? 1 : 2); q++) { const a = R() * TAU, rc = 0.7 + R() * 0.8, d = pr + 1.12 + rc * 0.7, qx = px + cos(a) * d, qz = pz + sin(a) * d; if (X.blockedAt(qx, qz) && hyp(qx - px, qz - pz) > pr + 1.3 + rc) continue; if (X.waterDepth(qx, qz) > -0.8 || gullyD(qx, qz) < 6) continue;
      let l2 = 1e9, h2 = -1e9; for (let b = 0; b < 8; b++) { const h = G(qx + cos(b * PI / 4) * rc, qz + sin(b * PI / 4) * rc); l2 = Math.min(l2, h); h2 = Math.max(h2, h); }
      pillar(T, qx, qz, { R0: rc, yb: l2 - 0.6, yt: Math.max(hi * 0.6 + lo * 0.4, h2) + 1.8 + R() * Math.max(2, (hi - lo) * 0.55), n: 9, cap: R() < 0.5 ? 0.5 : 0, seed: 700 + idx * 13 + q, capCol: PC.rrCap }); X.addCollider(qx, qz, rc * 1.05, 5); stat.pillars++; }
    rubble(cellOf(px, pz).pb, px, pz, pr + 5.0, 14, 0.35, 1.4, PC.rr, 0); X.addCollider(px, pz, pr + 1.15, hi - lo + 1); claim(px, pz, pr + 4.2, pr + 3.4); stat.pillars++;
  });
  /* 額外的細岩柱與風蝕石：不在地形的柱子上，自己站在地上，半徑 1.0–1.9、高 3.5–9 */
  { let n = 0; for (let g = 0; g < 500 && n < 16; g++) { const a = R() * TAU, d = Math.sqrt(R()) * 72, x = pcen[0] + cos(a) * d, z = pcen[1] + sin(a) * d, rr = 1.0 + R() * 0.9;
      if (X.blockedAt(x, z) || X.waterDepth(x, z) > -0.8 || X.slopeAt(x, z).s > 0.45 || gullyD(x, z) < 8 || !free(x, z, rr + 2.2, true) || zone08(x, z) !== 'redslope') continue;
      let lo = 1e9, hi = -1e9; for (let b = 0; b < 8; b++) { const h = G(x + cos(b * PI / 4) * rr, z + sin(b * PI / 4) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      pillar(rockT(x, z), x, z, { R0: rr, yb: lo - 0.7, yt: hi + 3.2 + R() * 5.2, n: 9, cap: R() < 0.55 ? 0.6 + R() * 0.5 : 0, seed: 400 + n * 11 }); rubble(cellOf(x, z).pb, x, z, rr + 2.2, 4, 0.25, 0.7, PC.rr, 0); X.addCollider(x, z, rr * 1.05, 6); claim(x, z, rr + 2.4, rr + 2); n++; stat.pillars++; } }
  /* 乾溝的岸：層理岩露頭、碎石，溝底只有小石頭 */
  GULLY08.forEach((g, gi) => { for (let i = 2; i < g.length - 1; i += 1) { if (R() > 0.34) continue; const side = R() < 0.5 ? -1 : 1, a = g[i], b = g[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = hyp(dx, dz) || 1, off = 6.2 + R() * 4.8, x = a[0] - dz / L * off * side, z = a[1] + dx / L * off * side;
      if (X.blockedAt(x, z) || X.waterDepth(x, z) > -0.8 || !free(x, z, 2.4, true) || zone08(x, z) !== 'redslope') continue; const rr = 1.1 + R() * 1.4, hh = 1.0 + R() * 1.7; let lo = 1e9, hi = -1e9; for (let b2 = 0; b2 < 8; b2++) { const h = G(x + cos(b2 * PI / 4) * rr, z + sin(b2 * PI / 4) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      pillar(rockT(x, z), x, z, { R0: rr, yb: lo - 0.5, yt: hi + hh, n: 9, cap: 0, seed: 900 + gi * 50 + i }); rubble(cellOf(x, z).pb, x, z, rr + 2.2, 5, 0.2, 0.6, PC.rr, 0); X.addCollider(x, z, rr * 1.02, 3); claim(x, z, rr + 1.5, rr + 1.2); stat.pillars++; } });
  stat.structures.push('石柱 ' + stat.pillars + ' 根（含地形柱 ' + PILLAR08.length + '）、乾溝岸邊露頭');

  /* 5. 原型 */
  const PB = [protoBush(11), protoBush(13, { berries: col(0.75, 0.15, 0.15) })];
  const PBd = [protoBush(15, { base: col(0.42, 0.5, 0.3), top: col(0.62, 0.62, 0.34), mid: col(0.5, 0.56, 0.32) })];
  const PRe = [protoReed(21, { tip: PC.cat, tipKind: 'cyl3', tipH: 0.34, h: 2.3, n: 12, tipEvery: 3 })];
  const PSt = [protoReed(23, { lo: PC.stalkD, hi: PC.stalk, h: 1.5, n: 9, spread: 0.55, w: 0.1, tip: PC.seed, tipKind: 'spike3', tipH: 0.26, tipEvery: 2, lean: 1.2 })];
  const PFl = [protoFlower(31, { n: 6, h: 0.5, size: 1.5 })];
  const PTh = [protoThorn(41, { n: 9, h: 1.0 })];
  const PRk = { round: [protoRock(51, 'round', PC.grey[0]), protoRock(52, 'round', PC.grey[1])], lump: [protoRock(53, 'lump', PC.grey[0]), protoRock(54, 'lump', PC.grey[2])], slab: [protoRock(55, 'slab', PC.grey[1]), protoRock(56, 'slab', PC.grey[0])], tall: [protoRock(57, 'tall', PC.grey[2]), protoRock(58, 'tall', PC.grey[0])], cluster: [protoRock(59, 'cluster', PC.grey[1])] };
  const PRr = { round: [protoRock(61, 'round', PC.rr[0]), protoRock(62, 'round', PC.rr[1])], lump: [protoRock(63, 'lump', PC.rr[2]), protoRock(64, 'lump', PC.rr[4])], slab: [protoRock(65, 'slab', PC.rr[1]), protoRock(66, 'slab', PC.rr[3])], tall: [protoRock(67, 'tall', PC.rr[0])], cluster: [protoRock(68, 'cluster', PC.rr[1])] };
  const PRs = { round: [protoRock(71, 'round', PC.salt)], lump: [protoRock(72, 'lump', PC.saltD)], slab: [protoRock(73, 'slab', PC.salt)], tall: [protoRock(74, 'tall', PC.saltB)], cluster: [protoRock(75, 'cluster', PC.saltD)] };
  const PLg = [protoLog(81, 5.2, 0.42, { moss: true }), protoLog(82, 3.6, 0.32, { moss: true }), protoLog(83, 6.6, 0.5, { moss: true })];
  const PSn = [protoSnag(91, 4.6), protoSnag(92, 6.2, { r: 0.4 }), protoSnag(93, 3.4, { r: 0.3, root: true })], PSnW = [protoSnag(94, 4.2, { c: PC.saltD }), protoSnag(95, 5.6, { c: PC.salt, r: 0.38 })];
  const protoTris = a => a.p.length / 9;
  const SC = 320, icells = new Map(), icellOf = (x, z) => { const k = Math.floor((x + 700) / SC) * 64 + Math.floor((z + 500) / SC); let c = icells.get(k); if (!c) icells.set(k, c = { inst: {} }); return c; };
  const instList = (c, key, proto) => { let l = c.inst[key]; if (!l) c.inst[key] = l = { proto, items: [] }; return l; };
  const inst = (key, proto, x, z, s, tint, ry, sink = 0.05) => { DBG.push([key, +x.toFixed(1), +z.toFixed(1), +s.toFixed(2)]); instList(icellOf(x, z), key, proto).items.push([x, G(x, z) - sink * s, z, ry ?? R() * TAU, s, tint]); };

  /* 6. 擺放工具 */
  const rate = (r) => r * OPT.density;
  const scatter = (zc, r, fn) => { for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; if (Z[k] !== zc || BL[k]) continue; const x0 = GX0 + i * GS, z0 = GZ0 + j * GS, m = fn(x0 + GS / 2, z0 + GS / 2, k); if (!m) continue; const e = rate(r) * m * GS * GS / 100, n = Math.floor(e) + (R() < e - Math.floor(e) ? 1 : 0); for (let q = 0; q < n; q++) fn(x0 + R() * GS, z0 + R() * GS, k, true); } };
  const common = (x, z, k, r, big, o = {}) => { const ci = cellIdx(x, z); if (ci < 0 || BL[ci]) return false; if (ED[ci] < (o.edge ?? 3)) return false; if (SL[ci] > (o.slope ?? 0.8)) return false; if (kept(x, z, r) || crocArea(x, z, o.crocPad ?? 6) || entryD(x, z) < (o.entry ?? 4)) return false; if (!o.wet && (X.waterDepth(x, z) > -0.55 || DW[ci] < (o.shore ?? 1.2))) return false; return free(x, z, r, big); };
  const tg = (x, z) => tallGrass08(x, z);
  const cellsOf = [[], [], [], [], []]; for (let k = 0; k < nCell; k++) if (Z[k] && !BL[k]) cellsOf[Z[k]].push(k);
  const treeTint = (rr, kind) => kind === 'lake' ? [0.86 + rr() * 0.16, 1.0 + rr() * 0.12, 0.66 + rr() * 0.16] : kind === 'forest' ? [0.72 + rr() * 0.2, 0.92 + rr() * 0.14, 0.8 + rr() * 0.15] : kind === 'dry' ? [1.15 + rr() * 0.2, 0.74 + rr() * 0.12, 0.42 + rr() * 0.1] : (rr() < 0.08 ? [1.5, 0.95, 0.5] : [0.95 + rr() * 0.15, 1.0, 0.9 + rr() * 0.15]);
  const addTree = (x, z, s, v, kind) => { DBG.push(['tree', +x.toFixed(1), +z.toFixed(1), +s.toFixed(1)]); trees.push({ x, z, s, v, rot: R() * TAU, tint: treeTint(R, kind), kind }); claim(x, z, 3.2, 1.0); stat.trees++; };
  const rockAt = (x, z, set, size, o = {}) => {
    DBG.push(['rock', +x.toFixed(1), +z.toFixed(1), +size.toFixed(2)]); const kinds = ['round', 'lump', 'slab', 'tall', 'cluster'], kd = o.kind || (size < 0.8 ? 'lump' : kinds[(R() * (size > 1.4 ? 4 : 5)) | 0]), arr = set[kd], P = arr[(R() * arr.length) | 0], s = size, c = cellOf(x, z).pb, t = o.tint || [0.92 + R() * 0.2, 0.92 + R() * 0.16, 0.92 + R() * 0.16];
    emit(c, P, x, G(x, z) - s * 0.1, z, R() * TAU, s * (0.9 + R() * 0.3), s * (0.8 + R() * 0.4), s * (0.9 + R() * 0.3), t, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12); stat.rocks++;
    if (s > 0.95) X.addCollider(x, z, s * 0.82, s * 1.3); claim(x, z, s * 0.9 + 0.3, s * 0.9);
  };
  const logAt = (x, z, ry, pi) => { DBG.push(['log', +x.toFixed(1), +z.toFixed(1), 1]); const P = PLg[pi % 3], c = cellOf(x, z).solid, L = pi % 3 === 0 ? 5.2 : pi % 3 === 1 ? 3.6 : 6.6, ex = cos(ry) * L / 2, ez = -sin(ry) * L / 2, y1 = G(x + ex, z + ez), y2 = G(x - ex, z - ez), tilt = Math.atan2(y1 - y2, L);
    emit(c, P, x, (y1 + y2) / 2 + 0.02, z, ry, 1, 1, 1, null, 0, tilt); for (let t = -L / 2 + 0.5; t <= L / 2 - 0.3; t += 1.2) X.addCollider(x + cos(ry) * t, z - sin(ry) * t, PLg.length ? 0.55 : 0.5, 0.7); claim(x, z, L * 0.5, 1.2); stat.logs++; };
  const snagAt = (x, z, set, s) => { DBG.push(['snag', +x.toFixed(1), +z.toFixed(1), s]); const P = set[(R() * set.length) | 0]; emit(cellOf(x, z).solid, P, x, G(x, z) - 0.15, z, R() * TAU, s, s, s, null, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08); X.addCollider(x, z, 0.4 * s, 4); claim(x, z, 2.4, 0.8); stat.snags++; };

  /* 7. 南湖濕原（zone 1） */
  R = mulberry(1001);
  /* 樹叢：先挑叢心（疏密不均、彼此隔開），再在叢心周圍成團種；叢邊再散幾棵單獨的，往外漸稀 */
  const grove = (zc, o) => { const Lc = cellsOf[zc], cs = [];
    for (let g = 0; g < o.tries; g++) { const k = Lc[(R() * Lc.length) | 0], x = GX0 + (k % GW) * GS + R() * GS, z = GZ0 + ((k / GW) | 0) * GS + R() * GS, m = o.dens(x, z, k); if (R() > m) continue; let ok = true; for (const c of cs) if (hyp(c[0] - x, c[1] - z) < o.sep * (0.7 + 0.5 * R())) { ok = false; break; } if (ok) cs.push([x, z, m]); }
    for (const [cx, cz, m] of cs) { const n = Math.round(o.n0 + m * o.n1 * (0.5 + R())), rad = o.r0 + Math.sqrt(n) * o.r1, ax = R() * TAU, el = 0.6 + R() * 0.5;
      for (let i = 0; i < n * 3 && n > 0; i++) { if (i >= n * 2.2) break; const a = R() * TAU, d = rad * Math.pow(R(), 0.65), px = cx + (cos(a) * d) * Math.cos(ax) - sin(a) * d * el * Math.sin(ax), pz = cz + cos(a) * d * Math.sin(ax) + sin(a) * d * el * Math.cos(ax); const ci = cellIdx(px, pz); if (ci < 0 || Z[ci] !== zc) continue; if (o.ok(px, pz, ci, false)) o.add(px, pz, m); }
      for (let q = 0; q < 3; q++) if (R() < 0.55) { const a = R() * TAU, d = rad * (1.2 + R() * 1.4), px = cx + cos(a) * d, pz = cz + sin(a) * d, ci = cellIdx(px, pz); if (ci >= 0 && Z[ci] === zc && o.ok(px, pz, ci, true)) o.add(px, pz, m * 0.5); } } };

  grove(1, { tries: 5000, sep: 30, n0: 2, n1: 7, r0: 3.5, r1: 2.3, dens: (x, z, k) => Math.pow(smooth(0.46, 0.68, fbm(x * 0.0075 + 11, z * 0.0075 + 4)), 1.2) * smooth(2, 8, DW[k]),
    ok: (x, z, k) => common(x, z, k, 3.0, true, { edge: 6, slope: 0.4, shore: 3.5, entry: 8 }), add: (x, z) => addTree(x, z, 5.6 + R() * 3, R() < 0.5 ? 0 : 1, 'lake') });
  scatter(1, 0.12, (x, z, k, real) => { const dw = DW[k], m = smooth(3, 8, dw) * smooth(40, 18, dw); if (!real) return m; if (!common(x, z, k, 3.0, true, { edge: 6, slope: 0.4, shore: 3.5, entry: 8 })) return 0; addTree(x, z, 5.6 + R() * 3, R() < 0.5 ? 0 : 1, 'lake'); return 1; });
  scatter(1, 1.3, (x, z, k, real) => { const th = smooth(0.46, 0.68, fbm(x * 0.03 + 3, z * 0.03 + 9)), m = (0.1 + 0.9 * th) * smooth(1.2, 5, DW[k]); if (!real) return m; if (!common(x, z, k, 0.9, false, { edge: 2, shore: 2 })) return 0; const s = 0.8 + R() * 0.7; inst('bush', PB[R() < 0.2 ? 1 : 0], x, z, s, [0.86 + R() * 0.2, 1.0 + R() * 0.12, 0.76 + R() * 0.2]); claim(x, z, 0.5, 0.8 * s); stat.bushes++; return 1; });
  /* 蘆葦帶：岸邊淺水到岸上 3 m；有缺口（走得下去）；渡口、釣點、鱷灘不放 */
  scatter(1, 34, (x, z, k, real) => { const dw = DW[k], belt = smooth(-4.2, -0.8, dw) * smooth(5, 1.6, dw); if (belt <= 0) return 0; const gap = smooth(0.32, 0.5, fbm(x * 0.035 + 17, z * 0.035 + 5)); const m = belt * gap; if (!real) return m; const ci = cellIdx(x, z); if (ci < 0 || BL[ci] || kept(x, z, 2) || crocArea(x, z, 3) || X.waterDepth(x, z) > 0.62 || ED[ci] < 2) return 0; if (!free(x, z, 0.45, false)) return 0; const s = 0.75 + R() * 0.7; inst('reed', PRe[0], x, z, s, [0.85 + R() * 0.3, 0.95 + R() * 0.1, 0.8 + R() * 0.2], undefined, 0.1); claim(x, z, 0.3, 0.5); stat.reeds++; return 1; });
  scatter(1, 2.6, (x, z, k, real) => { const f = smooth(0.55, 0.68, fbm(x * 0.045 + 7, z * 0.045 + 2)), m = f * smooth(2, 8, DW[k]); if (!real) return m; if (!common(x, z, k, 0.5, false, { edge: 2, shore: 2 })) return 0; const pc = fbm(Math.floor(x / 22) * 3.1, Math.floor(z / 22) * 2.3), tint = pc < 0.4 ? [1, 0.95, 0.35] : pc < 0.55 ? [1, 1, 1] : [0.85, 0.6, 1.0]; inst('flower', PFl[0], x, z, 0.9 + R() * 0.5, tint, undefined, 0.02); claim(x, z, 0.3, 0.45); stat.flowers++; return 1; });
  scatter(1, 0.45, (x, z, k, real) => { const m = 1; if (!real) return m; const dw = DW[k]; if (!common(x, z, k, 0.5, true, { edge: 2, shore: 0.6 })) return 0; const near = dw < 5; const s = near ? 0.25 + R() * 0.45 : 0.35 + Math.pow(R(), 2.4) * 1.5; rockAt(x, z, PRk, s, {}); return 1; });
  for (let i = 0; i < 6; i++) { for (let g = 0; g < 60; g++) { const a = R() * TAU, d = 350 + R() * 190, x = Math.sin(a) * d, z = Math.cos(a) * d; if (z < 330 || Math.abs(x) > 200) continue; const ci = cellIdx(x, z); if (ci < 0 || Z[ci] !== 1 || BL[ci] || DW[ci] < 1 || DW[ci] > 9 || !free(x, z, 3, true) || kept(x, z, 3) || crocArea(x, z, 8)) continue; logAt(x, z, R() * TAU, i); break; } }
  /* 湖岸漂木與鱷灘沙洲的骨頭（沙洲上、水外） */
  { const T = cellOf(0, 520).solid; R = mulberry(7007); for (const [bx, bz] of [[-20, 513], [14, 515], [-6, 512], [26, 517]]) { if (X.waterDepth(bx, bz) < -0.2 && !X.blockedAt(bx, bz)) bones(T, bx, bz, 4, R() < 0.5); } }

  /* 8. 林緣獵場（zone 2） */
  R = mulberry(2002);
  const forestK = (x, z) => smooth(0.42, 0.6, fbm(x * 0.012 + 3, z * 0.012 + 11));
  grove(2, { tries: 9000, sep: 34, n0: 3, n1: 10, r0: 4.5, r1: 2.1, dens: (x, z, k) => Math.pow(forestK(x, z), 1.1) * (1 - smooth(0.12, 0.5, tg(x, z))),
    ok: (x, z, k) => common(x, z, k, 3.2, true, { edge: 7, slope: 0.45, shore: 4, entry: 8 }) && tg(x, z) < 0.3, add: (x, z) => addTree(x, z, 6.4 + R() * 3.6, R() < 0.72 ? 0 : 1, 'forest') });
  scatter(2, 0.07, (x, z, k, real) => { const fo = forestK(x, z), t = tg(x, z), m = (1 - fo) * (1 - smooth(0.2, 0.6, t)); if (!real) return m; if (!common(x, z, k, 3.2, true, { edge: 7, slope: 0.4, shore: 4, entry: 8 })) return 0; addTree(x, z, 6.2 + R() * 3.6, R() < 0.45 ? 0 : 1, 'meadow'); return 1; });
  scatter(2, 1.6, (x, z, k, real) => { const fo = forestK(x, z), th = smooth(0.44, 0.68, fbm(x * 0.03 + 3, z * 0.03 + 9)), m = (0.1 + 0.9 * th) * (0.4 + fo) * (1 - tg(x, z) * 0.7); if (!real) return m; if (!common(x, z, k, 0.9, false, { edge: 2, shore: 2 })) return 0; const s = 0.75 + R() * 0.8; inst('bush', PB[R() < 0.2 ? 1 : 0], x, z, s, fo > 0.5 ? [0.72 + R() * 0.2, 0.95 + R() * 0.1, 0.72 + R() * 0.2] : [0.95 + R() * 0.2, 1.0 + R() * 0.12, 0.8 + R() * 0.2]); claim(x, z, 0.5, 0.8 * s); stat.bushes++; return 1; });
  scatter(2, 3.4, (x, z, k, real) => { const t = tg(x, z), m = smooth(0.25, 0.7, t) + 0.05; if (!real) return m; if (!common(x, z, k, 0.6, false, { edge: 2, shore: 2, slope: 1.2 })) return 0; const s = 0.85 + R() * 0.7; inst('stalk', PSt[0], x, z, s, [0.9 + R() * 0.2, 0.95 + R() * 0.1, 0.8 + R() * 0.2], undefined, 0.05); claim(x, z, 0.3, 0.55); stat.stalks++; return 1; });
  scatter(2, 3.0, (x, z, k, real) => { const f = smooth(0.54, 0.66, fbm(x * 0.045 + 27, z * 0.045 + 12)), m = f * (1 - forestK(x, z)) * (1 - smooth(0.2, 0.6, tg(x, z))); if (!real) return m; if (!common(x, z, k, 0.5, false, { edge: 2, shore: 2 })) return 0; const pc = fbm(Math.floor(x / 20) * 2.7, Math.floor(z / 20) * 3.3), tint = pc < 0.38 ? [1, 0.95, 0.3] : pc < 0.5 ? [1, 1, 1] : pc < 0.62 ? [1, 0.55, 0.6] : [0.85, 0.65, 1]; inst('flower', PFl[0], x, z, 0.9 + R() * 0.5, tint, undefined, 0.02); claim(x, z, 0.3, 0.45); stat.flowers++; return 1; });
  scatter(2, 0.3, (x, z, k, real) => { const m = 0.5 + forestK(x, z); if (!real) return m; if (!common(x, z, k, 0.6, true, { edge: 2, shore: 1.5 })) return 0; const big = R() < 0.12, s = big ? 1.3 + R() * 1.2 : 0.3 + Math.pow(R(), 2) * 0.9; rockAt(x, z, PRk, s, { tint: forestK(x, z) > 0.5 ? [0.85, 1.0, 0.82] : null }); return 1; });
  for (let i = 0; i < 14; i++) { for (let g = 0; g < 80; g++) { const a = R() * TAU, d = 350 + R() * 190, x = Math.sin(a) * d, z = Math.cos(a) * d, ci = cellIdx(x, z); if (ci < 0 || Z[ci] !== 2 || BL[ci] || SL[ci] > 0.35 || forestK(x, z) < 0.4 || !free(x, z, 3.2, true) || kept(x, z, 3) || tg(x, z) > 0.3 || X.waterDepth(x, z) > -0.8) continue; logAt(x, z, R() * TAU, i); break; } }
  for (let i = 0; i < 12; i++) { for (let g = 0; g < 80; g++) { const a = R() * TAU, d = 350 + R() * 190, x = Math.sin(a) * d, z = Math.cos(a) * d, ci = cellIdx(x, z); if (ci < 0 || Z[ci] !== 2 || BL[ci] || SL[ci] > 0.4 || !free(x, z, 1.5, true) || kept(x, z, 3) || X.waterDepth(x, z) > -0.8) continue; const T = cellOf(x, z).solid, py = G(x, z), r = 0.4 + R() * 0.3; prim(T, 'cyl6', x, py + 0.3, z, r * 2, 0.7, r * 2, PC.bark, 0, 0, 0, 1, 0.06); prim(T, 'cyl6', x, py + 0.66, z, r * 1.7, 0.05, r * 1.7, PC.cut, 0, 0, 0, 1, 0.04); X.addCollider(x, z, r, 0.7); claim(x, z, 1.2, 0.8); break; } }

  /* 9. 紅土荒坡（zone 3） */
  R = mulberry(3003);
  scatter(3, 0.5, (x, z, k, real) => { const f = fbm(x * 0.015 + 5, z * 0.015 + 8), m = smooth(0.5, 0.7, f) * smooth(10, 24, gullyD(x, z)); if (!real) return m; if (!common(x, z, k, 3.0, true, { edge: 7, slope: 0.4, shore: 3, entry: 8 }) || gullyD(x, z) < 8) return 0; addTree(x, z, 4.8 + R() * 2.8, R() < 0.8 ? 0 : 1, 'dry'); return 1; });
  scatter(3, 0.09, (x, z, k, real) => { const m = smooth(8, 20, gullyD(x, z)); if (!real) return m; if (!common(x, z, k, 2.2, true, { edge: 5, slope: 0.5, shore: 3 })) return 0; snagAt(x, z, PSn, 0.9 + R() * 0.5); return 1; });
  scatter(3, 1.3, (x, z, k, real) => { const th = smooth(0.42, 0.64, fbm(x * 0.03 + 13, z * 0.03 + 9)), m = 0.12 + 0.88 * th; if (!real) return m; if (!common(x, z, k, 0.8, false, { edge: 2, shore: 2 }) || gullyD(x, z) < 3.2) return 0; const s = 0.8 + R() * 0.8; if (R() < 0.58) inst('thorn', PTh[0], x, z, s, [0.95 + R() * 0.2, 0.95 + R() * 0.15, 0.85 + R() * 0.2], undefined, 0.02); else inst('bush', PBd[0], x, z, s, [0.95 + R() * 0.15, 0.95 + R() * 0.1, 0.9]); claim(x, z, 0.5, 0.8 * s); stat.thorns++; return 1; });
  scatter(3, 1.3, (x, z, k, real) => { const f = smooth(0.35, 0.62, fbm(x * 0.03 + 3, z * 0.03 + 21)), m = f * 0.9 + 0.1; if (!real) return m; if (!common(x, z, k, 0.6, false, { edge: 2, shore: 2, slope: 1.0 })) return 0; const s = 0.8 + R() * 0.7; inst('stalk', PSt[0], x, z, s, [1.05 + R() * 0.15, 0.85 + R() * 0.12, 0.7 + R() * 0.15], undefined, 0.05); claim(x, z, 0.3, 0.55); stat.stalks++; return 1; });
  scatter(3, 0.55, (x, z, k, real) => { const m = 0.6 + 0.4 * smooth(0.4, 0.7, fbm(x * 0.02, z * 0.02 + 6)); if (!real) return m; if (!common(x, z, k, 0.6, true, { edge: 2, shore: 1.5, slope: 1.2 })) return 0; const gd = gullyD(x, z), big = R() < 0.1 && gd > 7, s = big ? 1.3 + R() * 1.3 : gd < 6.5 ? 0.2 + R() * 0.35 : 0.3 + Math.pow(R(), 2.2) * 1.0; if (gd < 3.2 && s > 0.5) return 0; rockAt(x, z, PRr, s, { tint: [0.95 + R() * 0.15, 0.95 + R() * 0.1, 0.95 + R() * 0.1] }); return 1; });
  scatter(3, 1.5, (x, z, k, real) => { const f = smooth(0.56, 0.68, fbm(x * 0.045 + 37, z * 0.045 + 14)), m = f; if (!real) return m; if (!common(x, z, k, 0.5, false, { edge: 2, shore: 2 }) || gullyD(x, z) < 3.2) return 0; inst('flower', PFl[0], x, z, 0.9 + R() * 0.5, R() < 0.6 ? [1, 0.55, 0.2] : [1, 0.9, 0.3], undefined, 0.02); claim(x, z, 0.3, 0.45); stat.flowers++; return 1; });
  for (let i = 0; i < 6; i++) { for (let g = 0; g < 80; g++) { const a = R() * TAU, d = 350 + R() * 190, x = Math.sin(a) * d, z = Math.cos(a) * d, ci = cellIdx(x, z); if (ci < 0 || Z[ci] !== 3 || BL[ci] || SL[ci] > 0.4 || !free(x, z, 3.2, true) || kept(x, z, 3) || gullyD(x, z) < 6) continue; logAt(x, z, R() * TAU, i); break; } }

  /* 10. 鹽原（zone 4） */
  R = mulberry(4004);
  const saltK = (x, z) => smooth(0.38, 0.62, fbm(x * 0.012 + 4, z * 0.012 + 9));
  scatter(4, 1.1, (x, z, k, real) => { const s = saltK(x, z), m = smooth(0.3, 0.75, s); if (!real) return m; if (!common(x, z, k, 0.6, false, { edge: 2, shore: 1 }) || kept(x, z, 1)) return 0; crystalAt(x, z, 0.8 + R() * 1.1); claim(x, z, 0.7, 0.8); return 1; });
  scatter(4, 0.09, (x, z, k, real) => { const m = 1; if (!real) return m; if (!common(x, z, k, 2.0, true, { edge: 5, slope: 0.5, shore: 4 })) return 0; snagAt(x, z, PSnW, 0.9 + R() * 0.4); return 1; });
  scatter(4, 1.0, (x, z, k, real) => { const s = saltK(x, z), m = (1 - s) * 0.8 + 0.1; if (!real) return m; if (!common(x, z, k, 0.8, false, { edge: 2, shore: 2 })) return 0; const sc = 0.7 + R() * 0.7; inst('bush', PBd[0], x, z, sc, [0.9 + R() * 0.15, 1.0 + R() * 0.1, 0.9 + R() * 0.15]); claim(x, z, 0.5, 0.8 * sc); stat.bushes++; return 1; });
  scatter(4, 0.9, (x, z, k, real) => { const s = saltK(x, z), m = (1 - s) * 0.9; if (!real) return m; if (!common(x, z, k, 0.6, false, { edge: 2, shore: 2, slope: 1.0 })) return 0; const sc = 0.8 + R() * 0.6; inst('stalk', PSt[0], x, z, sc, [1.1 + R() * 0.1, 1.0 + R() * 0.1, 0.9 + R() * 0.1], undefined, 0.05); claim(x, z, 0.3, 0.55); stat.stalks++; return 1; });
  scatter(4, 0.28, (x, z, k, real) => { const m = 0.6 + saltK(x, z) * 0.4; if (!real) return m; if (!common(x, z, k, 0.6, true, { edge: 2, shore: 1.5, slope: 1.0 })) return 0; const big = R() < 0.1, s = big ? 1.3 + R() * 1.2 : 0.3 + Math.pow(R(), 2.2) * 0.9; rockAt(x, z, PRs, s, {}); return 1; });

  /* 10b. 小景：一塊大石頭＋幾顆碎石＋灌木＋一叢花，散在空曠處當視覺的點（不是整片鋪滿） */
  R = mulberry(6006);
  const vig = (zc, n, set, bushP, btint, ftints) => { let done = 0; const L = cellsOf[zc]; for (let g = 0; g < n * 60 && done < n; g++) { const k = L[(R() * L.length) | 0], x = GX0 + (k % GW) * GS + R() * GS, z = GZ0 + ((k / GW) | 0) * GS + R() * GS;
    if (!common(x, z, k, 3.0, true, { edge: 7, shore: 3, slope: 0.3 }) || tg(x, z) > 0.3 || (zc === 3 && gullyD(x, z) < 10)) continue; const s = 1.4 + R() * 1.0; rockAt(x, z, set, s, { kind: R() < 0.5 ? 'round' : 'lump' });
    for (let q = 0; q < 4; q++) { const a = R() * TAU, d = s * 0.9 + 0.8 + R() * 1.6, px = x + cos(a) * d, pz = z + sin(a) * d; if (common(px, pz, k, 0.4, true, { edge: 3, shore: 2, slope: 0.6 }) && (zc !== 3 || gullyD(px, pz) > 5)) rockAt(px, pz, set, 0.22 + R() * 0.3, {}); }
    for (let q = 0; q < 3; q++) { const a = R() * TAU, d = s * 0.8 + 1.2 + R() * 1.8, px = x + cos(a) * d, pz = z + sin(a) * d; if (common(px, pz, k, 0.9, false, { edge: 3, shore: 2, slope: 0.6 }) && (zc !== 3 || gullyD(px, pz) > 5)) { const sc = 0.9 + R() * 0.7; inst('bush', bushP, px, pz, sc, [btint[0] + R() * 0.15, btint[1] + R() * 0.1, btint[2] + R() * 0.15]); claim(px, pz, 0.5, 0.8 * sc); stat.bushes++; } }
    for (let q = 0; q < 5; q++) { const a = R() * TAU, d = 1.5 + R() * 3.6, px = x + cos(a) * d, pz = z + sin(a) * d; if (common(px, pz, k, 0.5, false, { edge: 3, shore: 2, slope: 0.6 }) && (zc !== 3 || gullyD(px, pz) > 5)) { inst('flower', PFl[0], px, pz, 0.9 + R() * 0.6, ftints[(R() * ftints.length) | 0], undefined, 0.02); claim(px, pz, 0.3, 0.45); stat.flowers++; } }
    done++; } };
  vig(1, 16, PRk, PB[0], [0.84, 0.98, 0.76], [[1, 0.95, 0.35], [1, 1, 1], [0.85, 0.6, 1]]);
  vig(2, 28, PRk, PB[0], [0.78, 0.96, 0.74], [[1, 0.95, 0.3], [1, 0.55, 0.6], [1, 1, 1], [0.85, 0.65, 1]]);
  vig(3, 24, PRr, PBd[0], [0.95, 0.92, 0.85], [[1, 0.55, 0.2], [1, 0.9, 0.3]]);
  vig(4, 14, PRs, PBd[0], [0.9, 1.0, 0.9], [[1, 1, 1], [1, 0.95, 0.5]]);
  /* 11. 邊界的收邊：貼著可走邊界的外 10 m 帶放石頭與灌木，遮住崖腳的生硬感 */
  R = mulberry(5005);
  for (const zc of [1, 2, 3, 4]) scatter(zc, 0.7, (x, z, k, real) => { const e = ED[k], m = smooth(16, 4, e) * smooth(0, 3, e); if (!real) return m; if (!common(x, z, k, 0.7, true, { edge: 1.5, shore: 1.5, slope: 1.3 })) return 0; if (R() < 0.55) { const s = 0.5 + Math.pow(R(), 1.8) * 2.0; rockAt(x, z, zc === 3 ? PRr : zc === 4 ? PRs : PRk, s, {}); } else { const s = 0.9 + R() * 0.7; inst('bush', zc === 3 || zc === 4 ? PBd[0] : PB[R() < 0.2 ? 1 : 0], x, z, s, [0.8 + R() * 0.3, 0.95 + R() * 0.1, 0.8 + R() * 0.2]); claim(x, z, 0.5, 0.8 * s); stat.bushes++; } return 1; });

  /* 12. 把累積的東西變成網格 */
  const protoOf = { bush: 0, reed: 1, stalk: 1, flower: 2, thorn: 3 };
  const swayFor = (amp, H) => (x, y, z) => amp * Math.pow(clamp(y / H, 0, 1), 1.5);
  const geoCache = new Map(), geoOf = (key, proto) => { let g = geoCache.get(key + proto.p.length + ':' + proto.p[0]); if (!g) { g = toGeo(proto, key === 'bush' ? swayFor(0.07, 1.4) : key === 'reed' ? swayFor(0.2, 2.2) : key === 'stalk' ? swayFor(0.17, 1.5) : key === 'flower' ? swayFor(0.1, 0.5) : swayFor(0.04, 1.0)); geoCache.set(key + proto.p.length + ':' + proto.p[0], g); } return g; };
  const meshes = [], dummy = new THREE.Object3D(), tmpc = new THREE.Color();
  const LIM = { bush: 260, reed: 220, stalk: 150, flower: 120, thorn: 190 };
  const reg = (mesh, detail, lim) => { mesh.updateMatrixWorld && mesh.updateMatrix(); const sp = mesh.geometry.boundingSphere; if (mesh.isInstancedMesh) { mesh.computeBoundingSphere(); } const bs = mesh.isInstancedMesh ? mesh.boundingSphere : sp; ctx.scene.add(mesh); ctx.cull(mesh, bs.center, bs.radius, detail, lim); meshes.push(mesh); };
  for (const c of cells.values()) {
    if (c.pb.p.length) { const g = toGeo(c.pb), m = new THREE.Mesh(g, M.rock); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'p08b-pebble'; reg(m, false); stat.tris.static += g.userData.tris; stat.meshes.rock++; }
    if (c.rock.p.length) { const g = toGeo(c.rock), m = new THREE.Mesh(g, M.rock); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'p08b-rock'; reg(m, false); stat.tris.static += g.userData.tris; stat.meshes.rock++; }
    if (c.solid.p.length) { const g = toGeo(c.solid), m = new THREE.Mesh(g, M.flat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'p08b-solid'; reg(m, false); stat.tris.static += g.userData.tris; stat.meshes.solid++; }
  }
  for (const c of icells.values()) {
    for (const key in c.inst) {
      const L = c.inst[key], byProto = new Map(); for (const it of L.items) { let l = byProto.get(L.proto) ; if (!l) byProto.set(L.proto, l = []); l.push(it); }
      for (const [proto, items] of byProto) {
        const g = geoOf(key, proto), mesh = new THREE.InstancedMesh(g, key === 'flower' ? M.flower : M.leaf, items.length);
        items.forEach((it, i) => { dummy.position.set(it[0], it[1], it[2]); dummy.rotation.set(0, it[3], 0); dummy.scale.setScalar(it[4]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); tmpc.setRGB(it[5][0], it[5][1], it[5][2]); mesh.setColorAt(i, tmpc); });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'p08b-' + key; mesh.onBeforeRender = () => { M.U.uT.value = performance.now() * 0.001; };
        reg(mesh, key !== 'bush', LIM[key]); stat.tris.inst += g.userData.tris * items.length; stat.meshes.inst++;
      }
    }
  }
  /* 13. 樹交給 world.js（同一套樹形、著色器、淡出、碰撞） */
  if (ctx.plantTrees && trees.length) ctx.plantTrees(trees);
  stat.colliders = nCol; X.addCollider = addC; stat.ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0; stat.cells = cells.size;
  const api = {
    stat, dbg: DBG, towers: towerInfo, camps: campInfo, dock: dockInfo, trees, TOWER08, CAMPS08, meshes,
    /* 給座標就能放營地周邊布置（X1 的營火座標定案後呼叫）：placeCamp('ferry'|'hunter'|'kiln'|'salt', x, z, rot) */
    placeCamp(id, x, z, rot = 0) { X = ctx; const A = { rock: mkAcc(), solid: mkAcc() }; const ac = X.addCollider; const info = camp(A.solid, id, x, z, rot, 5100 + id.length); const g = toGeo(A.solid), m = new THREE.Mesh(g, M.flat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'p08b-camp-' + id; ctx.scene.add(m); ctx.cull(m, g.boundingSphere.center, g.boundingSphere.radius, false); return { info, mesh: m }; }
  };
  return api;
}
const D2R = PI / 180;
