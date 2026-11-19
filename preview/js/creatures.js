// 怪物：模型與動作（全部由程式生成）。由 actors.js 轉出，遊戲其他部分仍從 actors.js 取用
// 兩套建模做法共用同一副四足骨架與同一套動作（腿用兩節 IK 踩在地上，身體怎麼蹲、怎麼立，腳都跟得上）：
//   舊（0.4c，SPEC）：身體、頭、腿、尾巴都是「沿路徑放樣的截面環」，稜角塊面、頂點色。五種都已換成新的，這一套只剩備援（species() 找不到 SOFT 才會用到），等確認後可整段移除。
//   新（0.5，SOFT）：圓潤的軟膠玩具質感 —— 雕過的橢球與圓管、平滑法線、花紋畫在貼圖上，整隻一個 SkinnedMesh。
//     五種一般怪與三隻菁英都是這一套：猛虎＋潛行虎・影牙、灰狼＋頭狼・霜背、野鹿、野豬、棕熊＋巨熊・老疤（野鹿、野豬沒有菁英造型，見 NO_ELITE）。
//     各物種在 SOFT.<物種> 區塊裡；物種專用的動作微調用 S 的參數開關（S.pose、S.howl、S.ram、S.rearK…），共用動作不寫物種判斷。
// 每種怪（含菁英）共用一份幾何與貼圖。體型由 core.js 的 MON[種類].size 決定（模型本身是 size=1 的比例）。
import * as THREE from './three.bundle.js';
import { TAU, clamp, lerp, damp, angDiff, easeOut, easeInOut, smooth, vnoise, MON } from './core.js';
import { W, Hgt } from './world.js';
import { beastFinish08 } from './beastfx08.js';
import { getBoar08, getModel08, VISK08 } from './model08_boar.js';
import { bearThreat08 } from './bearthreat08.js';      /* 熊的威嚇動作（人立 A／四足 B）*/
import { anim08 } from './anim08.js';      /* 新模型的額外動作 */
import { legQ, legU, RUN } from './gait08.js';      /* 四條腿的步法相位（側向四拍／對角／橫向奔馳），新舊模型共用 */

const ST = { IDLE: 0, CHASE: 1, WIND: 2, STRIKE: 3, RECOVER: 4, STAGGER: 5, DEAD: 6, FLEE: 7, WARN: 8 };
const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, hyp = Math.hypot;

/* ============================== 幾何工具 ============================== */
const COL = new THREE.Color();
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = hyp(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mid3 = (a, b, t = 0.5) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// 蒙皮權重：數字（單一骨頭）或 [骨頭, 權重, 骨頭, 權重…]
const skMix = (a, b, t) => {
  const m = new Map(), put = (s, w) => { if (typeof s === 'number') m.set(s, (m.get(s) || 0) + w); else for (let i = 0; i < s.length; i += 2) m.set(s[i], (m.get(s[i]) || 0) + s[i + 1] * w); };
  put(a, 1 - t); put(b, t); const out = []; for (const [k, w] of m) if (w > 0.002) out.push(k, w); return out;
};
class Geo {
  constructor() { this.p = []; this.c = []; this.si = []; this.sw = []; }
  // 三角形；o 是內側參考點，面一律朝離開它的方向
  tri(a, b, c, col, o) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-13) return;
    if (nx * ((a[0] + b[0] + c[0]) / 3 - o[0]) + ny * ((a[1] + b[1] + c[1]) / 3 - o[1]) + nz * ((a[2] + b[2] + c[2]) / 3 - o[2]) < 0) { const t = b; b = c; c = t; }
    COL.setHex(col);
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]); this.c.push(COL.r, COL.g, COL.b); const s = v[3];
      if (s == null || typeof s === 'number') { this.si.push(s || 0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
      else { let t = 0; for (let i = 1; i < s.length; i += 2) t += s[i]; for (let i = 0; i < 4; i++) { this.si.push(s[i * 2] || 0); this.sw.push((s[i * 2 + 1] || 0) / t); } }
    }
  }
  get tris() { return this.p.length / 9; }
  build(skinned) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (skinned) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4)); }
    g.computeVertexNormals(); return g;
  }
}
// 截面：p 中心、w 半寬、hu／hd 上下半高、e 方圓程度（1 橢圓，越小越方）、wt／wb 上下寬度比、sk 蒙皮
const K = (y, z, w, hu, hd, sk, o) => Object.assign({ p: [0, y, z], w, hu, hd, sk }, o);
const crom = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
// 在關鍵截面之間取樣（us 以關鍵截面的序號為單位），讓輪廓平順、也方便插入條紋
function resample(keys, us) {
  const n = keys.length;
  return us.map(u => {
    const i = clamp(Math.floor(u), 0, n - 2), t = u - i, k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
    const f = (g, mn) => { const v = crom(g(k0), g(k1), g(k2), g(k3), t), lo = Math.min(g(k1), g(k2)), hi = Math.max(g(k1), g(k2)), pad = (hi - lo) * 0.12 + mn; return clamp(v, lo - pad, hi + pad); };
    return { p: [f(k => k.p[0], 0.01), f(k => k.p[1], 0.01), f(k => k.p[2], 0.01)], w: f(k => k.w, 0), hu: f(k => k.hu, 0), hd: f(k => k.hd, 0), e: f(k => k.e || 1, 0), wt: f(k => k.wt ?? 1, 0), wb: f(k => k.wb ?? 1, 0), sk: skMix(k1.sk, k2.sk, t), u };
  });
}
const uAtZ = (keys, z) => { for (let i = 0; i < keys.length - 1; i++) { const a = keys[i].p[2], b = keys[i + 1].p[2]; if ((z - a) * (z - b) <= 0 && a !== b) return i + (z - a) / (b - a); } return z < keys[0].p[2] ? 0 : keys.length - 1; };
// 放樣：路徑在前後／上下的平面內，截面左右對稱。paint(i, k, side, j, u) 回傳顏色或 [上半三角, 下半三角]
// k：這一面在截面上的高度，0 是正上方、N/2 是正下方；side：+1 左、-1 右、0 正上或正下
function loft(g, st, o = {}) {
  const N = o.n || 8, off = o.off ?? 0.5, rings = [], n = st.length;
  for (let i = 0; i < n; i++) {
    const s = st[i], a = st[Math.max(0, i - 1)].p, b = st[Math.min(n - 1, i + 1)].p;
    let ty = b[1] - a[1], tz = b[2] - a[2]; if (s.t) { ty = s.t[0]; tz = s.t[1]; }
    const l = hyp(ty, tz) || 1, uy = tz / l, uz = -ty / l, e = s.e || 1, r = [];
    for (let j = 0; j < N; j++) {
      const an = (j + off) / N * TAU, sn = sin(an), cs = cos(an);
      const X = Math.sign(sn) * Math.pow(abs(sn), e) * s.w * lerp(s.wb ?? 1, s.wt ?? 1, (cs + 1) / 2), Y = Math.sign(cs) * Math.pow(abs(cs), e) * (cs >= 0 ? s.hu : s.hd);
      r.push([s.p[0] + X, s.p[1] + uy * Y, s.p[2] + uz * Y, s.sk]);
    }
    rings.push(r);
  }
  for (let i = 0; i < n - 1; i++) {
    const oc = mid3(st[i].p, st[i + 1].p), u = st[i].u != null ? (st[i].u + st[i + 1].u) / 2 : i + 0.5;
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N, a = rings[i][j], b = rings[i][j2], c = rings[i + 1][j2], d = rings[i + 1][j];
      let am = ((j + 0.5 + off) / N) % 1; if (am > 0.9999) am = 0; const f = am > 0.5 ? 1 - am : am, k = Math.round(f * N * 2) / 2, side = am < 0.001 || abs(am - 0.5) < 0.001 ? 0 : am < 0.5 ? 1 : -1;
      const col = o.paint(i, k, side, j, u), cu = Array.isArray(col) ? col[0] : col, cl = Array.isArray(col) ? col[1] : col;
      if (side >= 0) { g.tri(a, c, d, cu, oc); g.tri(a, b, c, cl, oc); } else { g.tri(b, c, d, cu, oc); g.tri(a, b, d, cl, oc); }
    }
  }
  const cap = (i, col, ref) => { const c = [st[i].p[0], st[i].p[1], st[i].p[2], st[i].sk]; for (let j = 0; j < N; j++) g.tri(c, rings[i][j], rings[i][(j + 1) % N], col, ref); };
  if (o.capA != null) cap(0, o.capA, st[1].p); if (o.capB != null) cap(n - 1, o.capB, st[n - 2].p);
  return { rings, st, N };
}
// 放樣表面第 i 段第 j 面：中心、法線、往前、往上
function facet(L, i, j) {
  const N = L.N, a = L.rings[i][j], b = L.rings[i][(j + 1) % N], c = L.rings[i + 1][(j + 1) % N], d = L.rings[i + 1][j];
  const ctr = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
  let n = norm3(cross3(sub3(c, a), sub3(d, b))); if (dot3(n, sub3(ctr, mid3(L.st[i].p, L.st[i + 1].p))) < 0) n = [-n[0], -n[1], -n[2]];
  return { c: ctr, n, f: norm3(sub3(mid3(c, d), mid3(a, b))), u: norm3(j < N / 2 - 0.5 ? sub3(mid3(a, d), mid3(b, c)) : sub3(mid3(b, c), mid3(a, d))) };
}
// 管狀物（任意方向的折線）：角、牙、耳朵、鬃毛。rad 每點一個半徑或 [寬, 厚]；col 可為函式 (段, 面)
function tube(g, pts, rad, N, col, sk, o = {}) {
  const rings = [], n = pts.length; let e1 = null;
  for (let i = 0; i < n; i++) {
    const t = norm3(sub3(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    if (!e1) { e1 = o.side || cross3(t, o.ref || [0, 0, 1]); if (hyp(...cross3(t, e1)) < 0.01) e1 = cross3(t, [1, 0, 0]); }
    e1 = norm3(add3(e1, t, -dot3(e1, t))); const e2 = cross3(t, e1), r = rad[i], r1 = r[0] ?? r, r2 = r[1] ?? r, s = o.per ? sk[i] : sk, ring = [];
    for (let j = 0; j < N; j++) { const an = (j + (o.off || 0)) / N * TAU, cx = cos(an) * r1, sy = sin(an) * r2; ring.push([pts[i][0] + e1[0] * cx + e2[0] * sy, pts[i][1] + e1[1] * cx + e2[1] * sy, pts[i][2] + e1[2] * cx + e2[2] * sy, s]); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) { const oc = mid3(pts[i], pts[i + 1]); for (let j = 0; j < N; j++) { const j2 = (j + 1) % N, c = typeof col === 'function' ? col(i, j) : col; g.tri(rings[i][j], rings[i][j2], rings[i + 1][j2], c, oc); g.tri(rings[i][j], rings[i + 1][j2], rings[i + 1][j], c, oc); } }
  const cap = (i, c, ref) => { const ctr = [pts[i][0], pts[i][1], pts[i][2], rings[i][0][3]]; for (let j = 0; j < N; j++) g.tri(ctr, rings[i][j], rings[i][(j + 1) % N], c, ref); };
  if (o.capA != null) cap(0, o.capA, pts[1]); if (o.capB != null) cap(n - 1, o.capB, pts[n - 2]);
  return rings;
}
// 貼在表面上的平面多邊形。pts：[往前, 往上]
function plate(g, c, n, fw, up, pts, col, sk, lift = 0.004) {
  n = norm3(n); const e1 = norm3(add3(fw, n, -dot3(fw, n))); let e2 = add3(up, n, -dot3(up, n)); e2 = norm3(add3(e2, e1, -dot3(e2, e1)));
  const o = add3(c, n, lift), ref = add3(c, n, -1), v = pts.map(q => [o[0] + e1[0] * q[0] + e2[0] * q[1], o[1] + e1[1] * q[0] + e2[1] * q[1], o[2] + e1[2] * q[0] + e2[2] * q[1], sk]);
  for (let i = 1; i < v.length - 1; i++) g.tri(v[0], v[i], v[i + 1], col, ref);
}
const poly = (n, rx, ry = rx, rot = 0) => Array.from({ length: n }, (_, i) => [cos(i / n * TAU + rot) * rx, sin(i / n * TAU + rot) * ry]);
const scl = (pts, s, dx = 0, dy = 0) => pts.map(q => [q[0] * s + dx, q[1] * s + dy]);

/* ============================== 骨架編號 ============================== */
const B = { body: 0, pelvis: 1, chest: 2, neck: 3, head: 4, jaw: 5, earL: 6, earR: 7, mane: 8, leg: 9, tail: 21 };

/* ============================== 通用四足建模 ============================== */
// D：某一種怪的尺寸與配色。回傳共用的幾何、骨架定義、腿的 IK 資料
function buildAnimal(D) {
  const g = new Geo(), gh = new Geo(), ge = new Geo(), P = D.pal, BN = [], bone = (name, parent, p) => BN.push({ name, parent, p }) - 1;
  const hc = cos(D.hpitch), hs = sin(D.hpitch), hb = D.head, HS = D.hs || 1, LT_ = D.legT || 1;
  // 頭部座標（以頭骨為原點、鼻子朝前的水平座標）→ 建模座標。頭上的東西先照原尺寸做在 gh／ge，最後整個放大 HS 倍
  const Hd = (x, y, z) => [x, hb[0] + y * hc - z * hs, hb[1] + y * hs + z * hc], Hs = q => [q[0] * HS, hb[0] + (q[1] - hb[0]) * HS, hb[1] + (q[2] - hb[1]) * HS];
  bone('body', -1, [0, D.body[0], D.body[1]]); bone('pelvis', 0, [0, D.pelvis[0], D.pelvis[1]]); bone('chest', 0, [0, D.chest[0], D.chest[1]]); bone('neck', 2, [0, D.neck[0], D.neck[1]]);
  bone('head', 3, [0, hb[0], hb[1]]); bone('jaw', 4, Hs(Hd(0, D.jawB[0], D.jawB[1]))); bone('earL', 4, Hs(Hd(D.earB[0], D.earB[1], D.earB[2]))); bone('earR', 4, Hs(Hd(-D.earB[0], D.earB[1], D.earB[2]))); bone('mane', 2, [0, D.maneB[0], D.maneB[1]]);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const J = i < 2 ? D.fl : D.rl, s = i % 2 ? -1 : 1, mx = p => [p[0] * s, p[1], p[2]], j0 = mx(J.j0), j1 = mx(J.j1), j2 = mx(J.j2), pad = mx(J.pad), par = i < 2 ? B.chest : B.pelvis;
    const b0 = bone('leg' + i + 'a', par, j0); bone('leg' + i + 'b', b0, j1); bone('leg' + i + 'c', b0 + 1, j2);
    legs.push({ j0, j1, j2, pad, par, rest: sub3(pad, BN[par].p), a: hyp(...sub3(j1, j0)), b: hyp(...sub3(j2, j1)), r1: new THREE.Vector3(...norm3(sub3(j1, j0))), r2: new THREE.Vector3(...norm3(sub3(j2, j1))), f0: new THREE.Vector3(...sub3(pad, j2)) });
  }
  D.tail.forEach((k, i) => { if (i < D.tailN) bone('tail' + i, i ? B.tail + i - 1 : B.pelvis, [0, k[0], k[1]]); });
  const mane2 = bone('mane2', B.neck, [0, D.neck[0] + 0.25, D.neck[1] + 0.1]);
  // 軀幹（臀 → 頸）
  const trunk = resample(D.trunk, D.trunkU || D.trunk.map((_, i) => i)), LT = loft(g, trunk, { n: D.trunkN || 8, paint: D.paintTrunk, capA: D.rumpCol ?? P.side });
  // 頭與下顎
  const HK = (k, sk) => Object.assign({}, k, { p: Hd(0, k.p[1], k.p[2]), sk });
  const LH = loft(gh, D.headK.map(k => HK(k, B.head)), { n: 8, paint: D.paintHead, capA: P.side, capB: D.noseCol ?? P.nose });
  const LJ = loft(gh, D.jawK.map(k => HK(k, B.jaw)), { n: 6, paint: D.paintJaw || ((i, k) => k < 1 ? P.mouth : P.chin ?? P.light), capA: P.mouth, capB: P.chin ?? P.light });
  // 四條腿
  for (let i = 0; i < 4; i++) {
    const front = i < 2, J = front ? D.fl : D.rl, s = i % 2 ? -1 : 1, b0 = B.leg + i * 3, lg = legs[i];
    const skOf = c => c === 'a' ? b0 : c === 'ab' ? [b0, 0.5, b0 + 1, 0.5] : c === 'b' ? b0 + 1 : c === 'bc' ? [b0 + 1, 0.5, b0 + 2, 0.5] : b0 + 2;
    const stn = J.prof.map((q, n) => ({ p: [q[0][0] * s, q[0][1], q[0][2]], w: q[1] * (n ? LT_ : 1), hu: q[2] * (n ? LT_ : 1), hd: q[3] * (n ? LT_ : 1), sk: skOf(q[4]), e: q[5] || 1 }));
    loft(g, stn, { n: 6, paint: (a, k, sd, j) => D.paintLeg(front, a, k, sd * s, stn.length - 1), capB: J.hoof ? P.hoof : undefined });
    if (J.paw) paw(g, lg.pad, J.paw, b0 + 2, D.pawCol ? D.pawCol(front) : P.paw, J.claw ? P.claw : null);
  }
  // 尾巴
  const tk = D.tail.map((k, i) => ({ p: [0, k[0], k[1]], w: k[2], hu: k[3] ?? k[2], hd: k[3] ?? k[2], sk: B.tail + Math.min(i, D.tailN - 1) }));
  const ts = resample(tk, D.tailU || tk.map((_, i) => i)); ts.forEach(s => { const i = Math.min(Math.floor(s.u), D.tailN - 1), t = clamp(s.u - i, 0, 1); s.sk = i >= D.tailN - 1 ? B.tail + D.tailN - 1 : skMix(B.tail + i, B.tail + i + 1, t); });
  loft(g, ts, { n: 6, paint: D.paintTail, capB: D.tailTip ?? P.dark });
  // 各種怪自己的細節（耳朵、眼睛、牙、鬃毛、花紋…）
  const topAt = z => { for (let i = 0; i < trunk.length - 1; i++) { const a = trunk[i], b = trunk[i + 1]; if (z >= a.p[2] && z <= b.p[2]) { const t = (z - a.p[2]) / (b.p[2] - a.p[2] || 1); return lerp(a.p[1] + a.hu * 0.92, b.p[1] + b.hu * 0.92, t); } } return trunk[trunk.length - 1].p[1]; };
  const eyeC = [];
  const ctx = { g, gh, ge, P, Hd, LT, LH, LJ, trunk, topAt, legs, D, eyeC, mane2 };
  D.extra(ctx);
  // 眼睛另成一個網格（不受光、可以發亮、可以眨），掛在頭骨上
  for (const q of [gh, ge]) for (let i = 0; i < q.p.length; i += 3) { q.p[i] *= HS; q.p[i + 1] = hb[0] + (q.p[i + 1] - hb[0]) * HS; q.p[i + 2] = hb[1] + (q.p[i + 2] - hb[1]) * HS; }
  g.p.push(...gh.p); g.c.push(...gh.c); g.si.push(...gh.si); g.sw.push(...gh.sw);
  const ey = eyeC.length ? eyeC.reduce((s, c) => s + Hs(c)[1], 0) / eyeC.length : hb[0];
  const eyeGeo = ge.build(false); eyeGeo.translate(0, -ey, -hb[1]);
  const geo = g.build(true);
  return { geo, eyeGeo, eyeY: ey - hb[0], bones: BN, legs, mane2, inv: BN.map(b => new THREE.Matrix4().makeTranslation(-b.p[0], -b.p[1], -b.p[2])), tris: g.tris + ge.tris, S: D.S, D };
}
// 腳掌：W 半寬、L 長、H 高
function paw(g, pad, [Wd, L, H], sk, col, claw) {
  const k = (dy, dz, w, hu, hd) => ({ p: [pad[0], pad[1] + dy, pad[2] + dz], w, hu, hd, sk, e: 0.75 });
  loft(g, [k(H * 0.5, -L * 0.36, Wd * 0.6, H * 0.4, H * 0.42), k(H * 0.5, -L * 0.1, Wd * 0.96, H * 0.55, H * 0.5), k(H * 0.44, L * 0.3, Wd, H * 0.46, H * 0.44), k(H * 0.34, L * 0.56, Wd * 0.82, H * 0.3, H * 0.34), k(H * 0.26, L * 0.64, Wd * 0.45, H * 0.12, H * 0.22)], { n: 6, paint: () => col, capA: col, capB: col });
  if (claw) for (const c of [-0.55, 0, 0.55]) tube(g, [[pad[0] + c * Wd, pad[1] + H * 0.36, pad[2] + L * 0.48], [pad[0] + c * Wd * 1.12, pad[1] + H * 0.03, pad[2] + L * 0.76]], [Wd * 0.24, 0], 4, claw, sk);
}
// 尖耳（四面錐）與圓耳（厚片）
function ears(c, base, tip, r, colOut, colIn, o = {}) {
  for (const s of [1, -1]) {
    const b = c.Hd(base[0] * s, base[1], base[2]), t = c.Hd(tip[0] * s, tip[1], tip[2]), sk = s > 0 ? B.earL : B.earR, side = norm3(sub3(c.Hd(s, 0, o.yaw ?? 0.25), c.Hd(0, 0, 0)));
    const h = o.round ? 3 : 2, col = (i, j) => (s > 0 ? j >= h : j < h) ? colIn : colOut;      // 朝前的那幾面是耳朵內側
    if (o.round) { const q = o.torn && s < 0 ? 0.6 : 1, t2 = mid3(b, t, q); tube(c.gh, [b, mid3(b, t2, 0.4), mid3(b, t2, 0.78), t2], [[r[0] * 0.8, r[1]], [r[0], r[1]], [r[0] * 0.86, r[1] * 0.9], [r[0] * (q < 1 ? 0.8 : 0.5), r[1] * 0.7]], 6, col, sk, { side, capB: q < 1 ? colIn : colOut, off: 0.5 }); }
    else if (o.leaf) { const m = mid3(b, t, 0.5); tube(c.gh, [b, m, t], [[r[0] * 0.55, r[1]], [r[0], r[1]], 0], 4, col, sk, { side }); }
    else if (!(o.torn && s < 0)) tube(c.gh, [b, t], [[r[0], r[1]], 0], 4, col, sk, { side });
    else { const m = mid3(b, t, 0.52); tube(c.gh, [b, m], [[r[0], r[1]], [r[0] * 0.6, r[1] * 0.7]], 4, col, sk, { side, capB: colIn }); }      // 缺了一截的耳朵
  }
}
// 眼睛：放在頭部放樣的第 i 段第 j 面與它的鏡射面上。o.shape 外形、o.iris 虹膜色、o.pupil 瞳孔外形
function eyes(c, i, j, o) {
  [j, c.LH.N - 2 - j].forEach((jj, n) => {
    const F = facet(c.LH, i, jj), ctr = add3(add3(F.c, F.f, o.df || 0), F.u, o.du || 0), q = o.per ? Object.assign({}, o, o.per(n)) : o;
    c.eyeC.push(ctr);
    plate(c.gh, ctr, F.n, F.f, F.u, scl(q.shape, q.rim || 1.35), q.rimCol ?? 0x15110f, B.head, 0.005);
    plate(c.ge, ctr, F.n, F.f, F.u, q.shape, q.iris, 0, 0.011);
    if (q.pupil) plate(c.ge, ctr, F.n, F.f, F.u, q.pupil, q.pupilCol ?? 0x0b0908, 0, 0.016);
    if (q.hl) plate(c.ge, ctr, F.n, F.f, F.u, q.hl, 0xffffff, 0, 0.021);
    if (q.brow) plate(c.gh, ctr, F.n, F.f, F.u, q.brow, q.browCol, B.head, 0.026);
  });
}
// 背上一排鬃毛／冰刺：底部跟著身體、尖端跟著 mane 骨頭（可以豎起來）
function crest(c, zs, h, r, col, o = {}) {
  zs.forEach((z, n) => {
    let st = c.trunk[0]; for (const s of c.trunk) if (abs(s.p[2] - z) < abs(st.p[2] - z)) st = s;
    let dom = st.sk, dw = 0; if (typeof dom !== 'number') { for (let i = 0; i < st.sk.length; i += 2) if (st.sk[i + 1] > dw) { dw = st.sk[i + 1]; dom = st.sk[i]; } }
    const y = c.topAt(z) - 0.02, hh = typeof h === 'function' ? h(n, z) : h, lean = o.lean ?? -0.45, tip = dom === B.chest ? B.mane : dom === B.neck || dom === B.head ? c.mane2 : dom;
    tube(c.g, [[0, y, z], [0, y + hh, z + hh * lean]], [[r, r * (o.thick ?? 1.5)], 0], 4, col, [st.sk, tip], { side: [1, 0, 0], per: true });
  });
}
// 在軀幹第 i 段第 j 面（與鏡射面）貼一塊花紋
function mark(c, L, i, j, pts, col, sk, o = {}) {
  (j === L.N - 1 ? [j] : o.one != null ? [o.one ? L.N - 2 - j : j] : [j, L.N - 2 - j]).forEach(jj => { const F = facet(L, i, jj); plate(L === c.LH ? c.gh : c.g, add3(add3(F.c, F.f, o.df || 0), F.u, o.du || 0), F.n, F.f, F.u, pts, col, sk, o.lift ?? 0.006); });
}
const leaf = [[-0.05, 0], [-0.02, 0.026], [0.03, 0.02], [0.052, -0.006], [0.02, -0.024], [-0.026, -0.02]];      // 斜吊的杏仁眼（前低後高）
const slash = (l, w) => [[-l, -w * 0.4], [-l * 0.3, w], [l, w * 0.3], [l * 0.4, -w]];                           // 傷疤

/* ============================== 五種怪 ============================== */
const SPEC = {};

/* ---------- 灰狼：精瘦、長腿、尖耳、蓬尾、長吻 ---------- */
SPEC.wolf = elite => {
  const P = elite
    ? { back: 0xeaf4ff, side: 0x4c6078, under: 0x7289a2, light: 0xdfeaf4, dark: 0x27323f, nose: 0x14181d, mouth: 0x7a2d38, tooth: 0xf6fbff, earIn: 0xb9c6d6, paw: 0xe6eff8, hackle: 0xbfe6ff, claw: 0xdfeaf4, scar: 0xb04a52 }
    : { back: 0x555d67, side: 0x808a94, under: 0xa9b1b9, light: 0xd8dce0, dark: 0x343a41, nose: 0x191b1f, mouth: 0x8a3038, tooth: 0xf5f0e4, earIn: 0xc7a79d, paw: 0xc3c9cf, hackle: 0x3b4149 };
  const D = {
    pal: P, hs: 1.3, legT: 1.5, hpitch: 0.14, body: [0.88, 0], pelvis: [0.9, -0.38], chest: [0.88, 0.27], neck: [1.0, 0.66], head: [1.24, 0.91], jawB: [-0.045, 0.15], earB: [0.11, 0.17, -0.03], maneB: [1.1, 0.36],
    trunk: [K(0.93, -0.66, 0.05, 0.05, 0.05, 1), K(0.91, -0.58, 0.18, 0.16, 0.18, 1), K(0.89, -0.4, 0.245, 0.2, 0.23, 1), K(0.88, -0.13, 0.2, 0.17, 0.19, [1, 0.5, 2, 0.5]), K(0.86, 0.13, 0.245, 0.22, 0.28, 2),
      K(0.87, 0.38, 0.265, 0.26, 0.32, 2), K(0.93, 0.57, 0.23, 0.235, 0.28, 2), K(1.03, 0.71, 0.19, 0.2, 0.22, [2, 0.5, 3, 0.5]), K(1.15, 0.83, 0.165, 0.17, 0.18, 3), K(1.25, 0.93, 0.13, 0.14, 0.14, [3, 0.4, 4, 0.6])],
    paintTrunk: (i, k, s, j, u) => u > 6 ? (k >= 3 ? P.light : k >= 2 ? P.under : k >= 1 ? P.side : P.back) : k <= 1 ? P.back : k <= 2 ? P.side : k <= 3 ? P.under : P.light,
    headK: [K(0.05, -0.12, 0.12, 0.12, 0.11), K(0.07, -0.01, 0.2, 0.17, 0.16), K(0.06, 0.12, 0.195, 0.14, 0.155), K(0.02, 0.225, 0.105, 0.088, 0.07), K(0, 0.36, 0.08, 0.068, 0.034), K(-0.01, 0.47, 0.06, 0.052, 0.026), K(0.006, 0.485, 0.042, 0.038, 0.03), K(0.004, 0.52, 0.028, 0.026, 0.022)],
    paintHead: (i, k) => i >= 5 ? P.nose : i >= 3 ? (k >= 3.5 ? P.mouth : k >= 2 ? P.light : P.side) : k < 1 ? P.back : k < 2 ? (i === 2 ? P.under : P.side) : i === 0 && k < 3 ? P.side : P.light,
    jawK: [K(-0.05, 0.16, 0.088, 0.022, 0.055), K(-0.047, 0.33, 0.07, 0.018, 0.04), K(-0.04, 0.45, 0.048, 0.014, 0.028)],
    fl: { j0: [0.18, 0.8, 0.42], j1: [0.185, 0.57, 0.33], j2: [0.185, 0.16, 0.38], pad: [0.185, 0, 0.42], paw: [0.088, 0.25, 0.1],
      prof: [[[0.15, 0.93, 0.42], 0.08, 0.12, 0.12, 'a'], [[0.18, 0.8, 0.42], 0.085, 0.115, 0.12, 'a'], [[0.183, 0.66, 0.365], 0.072, 0.088, 0.092, 'a'], [[0.185, 0.57, 0.33], 0.058, 0.066, 0.072, 'ab'], [[0.185, 0.36, 0.355], 0.047, 0.05, 0.05, 'b'], [[0.185, 0.16, 0.38], 0.043, 0.045, 0.045, 'bc'], [[0.185, 0.05, 0.39], 0.045, 0.046, 0.042, 'c']] },
    rl: { j0: [0.175, 0.86, -0.42], j1: [0.19, 0.57, -0.27], j2: [0.19, 0.3, -0.52], pad: [0.19, 0, -0.45], paw: [0.084, 0.24, 0.095],
      prof: [[[0.14, 0.98, -0.42], 0.09, 0.13, 0.13, 'a'], [[0.175, 0.86, -0.42], 0.095, 0.14, 0.14, 'a'], [[0.183, 0.7, -0.34], 0.085, 0.112, 0.118, 'a'], [[0.19, 0.57, -0.27], 0.062, 0.07, 0.08, 'ab'], [[0.19, 0.43, -0.4], 0.046, 0.05, 0.055, 'b'], [[0.19, 0.3, -0.52], 0.039, 0.042, 0.047, 'bc'], [[0.19, 0.16, -0.485], 0.036, 0.038, 0.04, 'c'], [[0.19, 0.05, -0.47], 0.042, 0.042, 0.04, 'c']] },
    paintLeg: (front, i, k) => i < 2 ? (k >= 2 && !front ? P.under : P.side) : i < 4 ? P.under : P.paw,
    tail: [[0.95, -0.6, 0.075], [0.86, -0.8, 0.13], [0.71, -0.99, 0.145], [0.58, -1.14, 0.11], [0.5, -1.24, 0.035]], tailN: 3, tailU: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4],
    paintTail: (i, k) => i >= 5 ? P.dark : k <= 1 ? P.back : k <= 2 ? P.side : P.under, tailTip: P.dark,
    S: { k: 1.2, run: 5.5, stride: 0.72, lift: 0.15, bob: 0.05, cad: 1, graze: 0.45, grazeN: 0.7, grazeH: 0.25, earBack: 1.0, jawMax: 0.6, maneUp: 0.12, wag: 2.2, wagAmp: 0.22, halfW: 0.25, tailRun: 0.75, low: 0.22, howl: 1 },
    extra(c) {
      ears(c, [0.115, 0.15, -0.03], [0.185, 0.385, -0.09], [0.11, 0.05], P.dark, P.earIn);
      // 臉頰的毛
      for (const s of [1, -1]) { tube(c.gh, [c.Hd(0.16 * s, -0.01, 0.03), c.Hd(0.31 * s, -0.09, -0.14)], [[0.08, 0.055], 0], 4, P.light, B.head, { side: [0, 1, 0] }); tube(c.gh, [c.Hd(0.14 * s, -0.09, 0.05), c.Hd(0.25 * s, -0.2, -0.08)], [[0.07, 0.05], 0], 4, P.light, B.head, { side: [0, 1, 0] }); }
      // 牙
      for (const s of [1, -1]) { tube(c.gh, [c.Hd(0.052 * s, -0.02, 0.42), c.Hd(0.054 * s, -0.085, 0.43)], [elite ? 0.02 : 0.016, 0], 4, P.tooth, B.head); tube(c.gh, [c.Hd(0.042 * s, -0.035, 0.39), c.Hd(0.043 * s, 0.01, 0.4)], [0.012, 0], 4, P.tooth, B.jaw); }
      eyes(c, 2, 0, { shape: scl(leaf, 0.95), iris: elite ? 0x8fe0ff : 0xffc21f, pupil: poly(4, 0.012, 0.022), hl: scl(poly(4, 0.008), 1, 0.014, 0.011), df: 0.004, du: -0.004, rim: 1.38,
        per: elite ? n => n === 1 ? { iris: 0xe8f6ff, pupil: null } : {} : null });
      // 頸背的鬃毛（平常貼著，威嚇時豎起）
      if (!elite) crest(c, [0.78, 0.64, 0.5, 0.36, 0.2], n => [0.05, 0.06, 0.065, 0.06, 0.05][n], 0.05, P.hackle, { thick: 2.4, lean: -1.2 });
      else {
        // 霜背：整條背脊結著冰刺，右眼一道舊疤
        crest(c, [0.82, 0.68, 0.53, 0.38, 0.22, 0.04, -0.14, -0.32, -0.48], n => [0.14, 0.2, 0.24, 0.22, 0.19, 0.16, 0.15, 0.13, 0.1][n], 0.05, P.hackle, { lean: -0.5, thick: 1.3 });
        const F = facet(c.LH, 2, 6); plate(c.gh, add3(F.c, F.u, 0.0), F.n, F.f, F.u, [[-0.1, 0.05], [-0.088, 0.066], [0.1, -0.06], [0.088, -0.074]], P.scar, B.head, 0.03);
        for (const s of [1, -1]) tube(c.gh, [c.Hd(0.2 * s, 0.02, -0.02), c.Hd(0.36 * s, 0.0, -0.16)], [[0.07, 0.05], 0], 4, P.hackle, B.head, { side: [0, 1, 0] });
      }
    }
  };
  return D;
};

/* ---------- 野豬：前高後低的楔形、大頭、獠牙、鬃毛、短腿 ---------- */
SPEC.boar = () => {
  const P = { back: 0x56382a, side: 0x7b5338, under: 0x8a6044, light: 0x9a7052, dark: 0x3a281d, nose: 0xc48d80, mouth: 0x7a2d30, tooth: 0xf2ead8, earIn: 0x9c6f5c, hoof: 0x211813, hackle: 0x2a1d16, face: 0x684530, snout: 0x9b725c, leg: 0x543a28 };
  return {
    pal: P, hs: 1.08, legT: 1.35, hpitch: 0.36, body: [0.74, 0], pelvis: [0.72, -0.38], chest: [0.78, 0.3], neck: [0.78, 0.56], head: [0.77, 0.72], jawB: [-0.08, 0.26], earB: [0.19, 0.2, -0.02], maneB: [1.15, 0.3],
    trunk: [K(0.73, -0.69, 0.07, 0.07, 0.07, 1), K(0.72, -0.61, 0.25, 0.21, 0.23, 1), K(0.71, -0.38, 0.315, 0.25, 0.28, 1), K(0.72, -0.06, 0.34, 0.285, 0.3, [1, 0.5, 2, 0.5]), K(0.75, 0.22, 0.35, 0.345, 0.33, 2),
      K(0.79, 0.45, 0.33, 0.395, 0.35, 2), K(0.78, 0.64, 0.295, 0.335, 0.3, [2, 0.6, 3, 0.4]), K(0.76, 0.82, 0.25, 0.27, 0.25, [3, 0.5, 4, 0.5])],
    trunkU: [0, 1, 1.5, 2, 3, 4, 5, 6, 7],
    paintTrunk: (i, k) => k < 1 ? P.back : k <= 1 ? P.back : k <= 2 ? P.side : k <= 3 ? P.under : P.light, rumpCol: P.side,
    headK: [K(0, -0.1, 0.21, 0.22, 0.2), K(0.02, 0.06, 0.29, 0.265, 0.25), K(0, 0.24, 0.275, 0.215, 0.235), K(-0.02, 0.42, 0.18, 0.14, 0.1), K(-0.03, 0.6, 0.135, 0.105, 0.05), K(-0.03, 0.74, 0.125, 0.1, 0.045), K(-0.03, 0.765, 0.118, 0.094, 0.05)],
    paintHead: (i, k) => i >= 5 ? P.nose : i >= 3 ? (k >= 2.5 ? P.mouth : k < 1 ? P.face : P.snout) : k < 1 ? P.back : k <= 2 ? P.face : P.side, noseCol: P.nose,
    jawK: [K(-0.105, 0.3, 0.15, 0.035, 0.09), K(-0.115, 0.52, 0.118, 0.028, 0.06), K(-0.11, 0.7, 0.092, 0.022, 0.04)], paintJaw: (i, k) => k < 1 ? P.mouth : P.snout,
    fl: { j0: [0.215, 0.58, 0.44], j1: [0.22, 0.42, 0.39], j2: [0.22, 0.17, 0.43], pad: [0.22, 0, 0.45], hoof: 1,
      prof: [[[0.18, 0.72, 0.44], 0.1, 0.13, 0.13, 'a'], [[0.215, 0.58, 0.44], 0.115, 0.135, 0.135, 'a'], [[0.218, 0.5, 0.415], 0.095, 0.105, 0.105, 'a'], [[0.22, 0.42, 0.39], 0.074, 0.078, 0.078, 'ab'], [[0.22, 0.29, 0.41], 0.058, 0.058, 0.058, 'b'], [[0.22, 0.17, 0.43], 0.052, 0.052, 0.052, 'bc'], [[0.22, 0.08, 0.445], 0.056, 0.062, 0.05, 'c'], [[0.22, 0, 0.455], 0.068, 0.08, 0.056, 'c', 0.8]] },
    rl: { j0: [0.205, 0.6, -0.42], j1: [0.215, 0.42, -0.32], j2: [0.215, 0.23, -0.5], pad: [0.215, 0, -0.46], hoof: 1,
      prof: [[[0.17, 0.74, -0.42], 0.11, 0.15, 0.15, 'a'], [[0.205, 0.6, -0.42], 0.135, 0.175, 0.175, 'a'], [[0.21, 0.5, -0.365], 0.115, 0.135, 0.135, 'a'], [[0.215, 0.42, -0.32], 0.078, 0.084, 0.088, 'ab'], [[0.215, 0.32, -0.415], 0.058, 0.058, 0.062, 'b'], [[0.215, 0.23, -0.5], 0.05, 0.05, 0.052, 'bc'], [[0.215, 0.08, -0.47], 0.054, 0.058, 0.05, 'c'], [[0.215, 0, -0.455], 0.066, 0.076, 0.056, 'c', 0.8]] },
    paintLeg: (front, i, k, s, n) => i >= n - 1 ? P.hoof : i < 2 ? P.side : P.leg,
    tail: [[0.86, -0.66, 0.035], [0.76, -0.78, 0.028], [0.62, -0.83, 0.024], [0.52, -0.84, 0.05], [0.44, -0.83, 0.012]], tailN: 2,
    paintTail: i => i >= 2 ? P.hackle : P.side, tailTip: P.hackle,
    S: { k: 1.3, run: 4.15, stride: 0.5, lift: 0.1, bob: 0.04, cad: 1.3, graze: 1, grazeN: 0.3, grazeH: 0.3, earBack: 0.7, jawMax: 0.42, maneUp: 0.1, wag: 6, wagAmp: 0.5, halfW: 0.33, tailRun: 1.5, low: 0.1, chew: 1 },
    extra(c) {
      ears(c, [0.19, 0.19, -0.02], [0.33, 0.4, -0.1], [0.085, 0.04], P.dark, P.earIn, { yaw: 0.6 });
      // 獠牙：下顎往上彎的一對大牙，上顎一對小的
      for (const s of [1, -1]) {
        tube(c.gh, [c.Hd(0.1 * s, -0.1, 0.57), c.Hd(0.165 * s, 0.0, 0.62), c.Hd(0.185 * s, 0.125, 0.585)], [0.036, 0.028, 0], 5, P.tooth, B.jaw, { capA: P.tooth });
        tube(c.gh, [c.Hd(0.1 * s, -0.045, 0.55), c.Hd(0.155 * s, 0.01, 0.585)], [0.024, 0], 4, P.tooth, B.head);
      }
      // 鼻孔
      { const o = c.Hd(0, -0.03, 0.765), n = norm3(sub3(c.Hd(0, 0, 1), c.Hd(0, 0, 0))), up = norm3(sub3(c.Hd(0, 1, 0), c.Hd(0, 0, 0))); for (const s of [1, -1]) plate(c.gh, add3(o, [0.04 * s, 0, 0]), n, [1, 0, 0], up, poly(4, 0.014, 0.024), 0x4a2a28, B.head, 0.004); }
      eyes(c, 2, 0, { shape: poly(6, 0.026, 0.022), iris: 0x3a2014, pupil: poly(6, 0.018, 0.016), hl: scl(poly(4, 0.007), 1, 0.008, 0.008), df: 0.02, du: -0.01, rim: 1.5, rimCol: 0x241812 });
      crest(c, [0.8, 0.66, 0.52, 0.38, 0.24, 0.1, -0.05, -0.2], n => [0.13, 0.17, 0.19, 0.18, 0.16, 0.13, 0.1, 0.07][n], 0.045, P.hackle, { lean: -0.55 });
      // 頭頂到兩耳之間的一撮毛
      tube(c.gh, [c.Hd(0, 0.24, 0.02), c.Hd(0, 0.37, -0.08)], [[0.06, 0.08], 0], 4, P.hackle, B.head, { side: [1, 0, 0] });
    }
  };
};

/* ---------- 棕熊：龐大、肩峰、圓耳、短吻、大掌 ---------- */
SPEC.bear = elite => {
  const P = elite
    ? { back: 0x3b2a20, side: 0x4d382a, under: 0x5a4333, light: 0x6b5241, dark: 0x2a1e17, nose: 0x15100d, mouth: 0x7a2a2e, tooth: 0xf0e6d2, earIn: 0x7a6252, paw: 0x35261c, claw: 0xe9dfca, muzzle: 0xa39484, leg: 0x3a2a1f, scar: 0xd7a79b, hump: 0x66564c }
    : { back: 0x5a3a25, side: 0x714b30, under: 0x7d573a, light: 0x8b6444, dark: 0x452d1d, nose: 0x1c1410, mouth: 0x8a3034, tooth: 0xf3ead8, earIn: 0x9a7350, paw: 0x4a301f, claw: 0xe6dcc6, muzzle: 0xc49c6e, leg: 0x55371f, hump: 0x8f643f };
  return {
    pal: P, hs: 1.22, hpitch: 0.26, body: [0.94, 0], pelvis: [0.93, -0.5], chest: [0.98, 0.34], neck: [1.0, 0.66], head: [1.0, 0.88], jawB: [-0.09, 0.26], earB: [0.25, 0.26, 0.0], maneB: [1.4, 0.4],
    trunk: [K(0.96, -0.91, 0.12, 0.12, 0.12, 1), K(0.95, -0.81, 0.37, 0.31, 0.35, 1), K(0.93, -0.52, 0.465, 0.37, 0.43, 1), K(0.91, -0.12, 0.485, 0.38, 0.43, [1, 0.5, 2, 0.5]), K(0.94, 0.22, 0.485, 0.435, 0.44, 2),
      K(0.99, 0.5, 0.465, 0.5, 0.44, 2), K(1.0, 0.76, 0.375, 0.395, 0.37, [2, 0.5, 3, 0.5]), K(0.98, 0.96, 0.3, 0.3, 0.3, [3, 0.4, 4, 0.6])],
    trunkU: [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 7],
    paintTrunk: (i, k, s, j, u) => k <= 1 ? (u > 3.6 && u < 6.4 ? P.hump : P.back) : k <= 2 ? P.side : k <= 3 ? P.under : P.light, rumpCol: P.side,
    headK: [K(0.02, -0.12, 0.24, 0.24, 0.22), K(0.05, 0.06, 0.355, 0.315, 0.29), K(0.03, 0.26, 0.34, 0.26, 0.28), K(-0.03, 0.41, 0.2, 0.15, 0.07), K(-0.05, 0.52, 0.172, 0.125, 0.035, 0, { e: 0.8 }), K(-0.055, 0.585, 0.145, 0.105, 0.03, 0, { e: 0.8 }), K(-0.02, 0.6, 0.082, 0.06, 0.05), K(-0.022, 0.645, 0.056, 0.042, 0.036)],
    paintHead: (i, k) => i >= 5 ? P.nose : i >= 3 ? (k >= 3.5 ? P.mouth : P.muzzle) : k < 1 ? P.back : k <= 2 ? P.side : P.under,
    jawK: [K(-0.115, 0.28, 0.2, 0.03, 0.09, 0, { e: 0.8 }), K(-0.12, 0.46, 0.178, 0.03, 0.07, 0, { e: 0.8 }), K(-0.115, 0.578, 0.146, 0.028, 0.05, 0, { e: 0.8 })], paintJaw: (i, k) => k < 1 ? P.mouth : P.muzzle,
    fl: { j0: [0.3, 0.88, 0.5], j1: [0.31, 0.6, 0.42], j2: [0.31, 0.18, 0.47], pad: [0.31, 0, 0.52], paw: [0.155, 0.36, 0.15], claw: 1,
      prof: [[[0.25, 1.06, 0.5], 0.16, 0.21, 0.21, 'a'], [[0.3, 0.88, 0.5], 0.185, 0.225, 0.225, 'a'], [[0.306, 0.72, 0.455], 0.165, 0.185, 0.185, 'a'], [[0.31, 0.6, 0.42], 0.14, 0.15, 0.155, 'ab'], [[0.31, 0.39, 0.445], 0.125, 0.13, 0.13, 'b'], [[0.31, 0.18, 0.47], 0.118, 0.122, 0.122, 'bc'], [[0.31, 0.07, 0.48], 0.122, 0.122, 0.112, 'c']] },
    rl: { j0: [0.29, 0.9, -0.52], j1: [0.31, 0.58, -0.38], j2: [0.31, 0.25, -0.6], pad: [0.31, 0, -0.52], paw: [0.16, 0.42, 0.14], claw: 1,
      prof: [[[0.23, 1.06, -0.52], 0.17, 0.22, 0.22, 'a'], [[0.29, 0.9, -0.52], 0.205, 0.255, 0.255, 'a'], [[0.3, 0.73, -0.445], 0.19, 0.205, 0.205, 'a'], [[0.31, 0.58, -0.38], 0.15, 0.155, 0.165, 'ab'], [[0.31, 0.41, -0.49], 0.125, 0.13, 0.135, 'b'], [[0.31, 0.25, -0.6], 0.112, 0.115, 0.122, 'bc'], [[0.31, 0.07, -0.57], 0.118, 0.118, 0.112, 'c']] },
    paintLeg: (front, i) => i < 2 ? P.side : P.leg, pawCol: () => P.paw,
    tail: [[1.02, -0.87, 0.1], [1.0, -0.99, 0.085], [0.97, -1.06, 0.03]], tailN: 1, paintTail: () => P.back, tailTip: P.back,
    S: { k: 1.15, run: 2.7, stride: 0.78, lift: 0.17, bob: 0.06, cad: 0.85, graze: 0.7, grazeN: 0.4, grazeH: 0.3, earBack: 0.5, jawMax: 0.62, maneUp: 0, wag: 1, wagAmp: 0.1, halfW: 0.46, tailRun: 0, low: 0.12 },
    extra(c) {
      ears(c, [0.25, 0.23, 0.0], [0.335, 0.43, -0.02], [0.15, 0.045], P.back, P.earIn, { round: 1, torn: elite, yaw: 0.15 });
      for (const s of [1, -1]) { tube(c.gh, [c.Hd(0.095 * s, -0.07, 0.535), c.Hd(0.098 * s, -0.15, 0.545)], [0.026, 0], 4, P.tooth, B.head); tube(c.gh, [c.Hd(0.08 * s, -0.095, 0.5), c.Hd(0.082 * s, -0.035, 0.51)], [0.02, 0], 4, P.tooth, B.jaw); }
      eyes(c, 2, 0, { shape: poly(6, 0.032, 0.027), iris: 0x3d2416, pupil: poly(6, 0.022, 0.02), hl: scl(poly(4, 0.009), 1, 0.01, 0.01), df: 0.035, du: -0.03, rim: 1.45, rimCol: 0x2a1c14,
        per: elite ? n => n === 0 ? { iris: 0xdfe6ea, pupil: null, hl: null } : {} : null });
      if (elite) {
        // 老疤：左眼瞎了、臉上肩上腰上都是爪痕，肩峰還插著兩支斷箭
        const F = facet(c.LH, 2, 0); plate(c.gh, add3(F.c, F.f, 0.02), F.n, F.f, F.u, [[-0.13, 0.06], [-0.1, 0.085], [0.13, -0.07], [0.1, -0.09]], P.scar, B.head, 0.03);
        plate(c.gh, add3(F.c, F.f, -0.04), F.n, F.f, F.u, [[-0.1, 0.02], [-0.08, 0.04], [0.06, -0.075], [0.04, -0.09]], P.scar, B.head, 0.03);
        for (const [i, j, one, df, du] of [[5, 1, 1, 0, 0.02], [3, 1, 0, 0.02, 0], [6, 0, 0, 0, 0], [2, 0, 1, 0.03, 0]]) for (const o of [-0.075, 0, 0.075]) mark(c, c.LT, i, j, [[-0.03 + o, 0.15], [0.005 + o, 0.16], [0.05 + o, -0.13], [0.02 + o, -0.15]], P.scar, c.trunk[i].sk, { one, df, du, lift: 0.012 });
        for (const i of [3, 6]) for (const o of [-0.09, 0, 0.09]) mark(c, c.LT, i, 7, [[-0.13, o - 0.1], [-0.105, o - 0.115], [0.13, o + 0.09], [0.105, o + 0.11]], P.scar, c.trunk[i].sk, { lift: 0.012 });
        for (const [x, z, lx, lz] of [[0.14, 0.52, 0.35, -0.3], [-0.1, 0.3, -0.25, -0.45]]) {
          const b0 = [x, c.topAt(z) - 0.08, z], d = norm3([lx, 1, lz]), t = add3(b0, d, 0.46), sd = norm3(cross3(d, [0, 0, 1])), s2 = cross3(d, sd);
          tube(c.g, [b0, t], [0.022, 0.022], 4, 0x7a5a3a, B.chest, { capB: 0x5a4028 });
          tube(c.g, [add3(b0, d, 0.31), add3(b0, d, 0.44)], [[0.075, 0.008], [0.05, 0.008]], 4, 0xb23a2e, B.chest, { side: sd, capA: 0xb23a2e, capB: 0xb23a2e });
          tube(c.g, [add3(b0, d, 0.31), add3(b0, d, 0.44)], [[0.075, 0.008], [0.05, 0.008]], 4, 0xb23a2e, B.chest, { side: s2, capA: 0xb23a2e, capB: 0xb23a2e });
        }
      }
    }
  };
};

/* ---------- 猛虎：大頭寬臉、粗壯短身、背上一道道粗黑紋、厚掌、帶環紋的粗尾巴 ---------- */
SPEC.tiger = elite => {
  const P = elite
    ? { back: 0x1b1a28, side: 0x272639, under: 0x36354e, light: 0x4d4b68, dark: 0x9a6cff, nose: 0x4a3560, mouth: 0x5a2248, tooth: 0xf4f0ff, earIn: 0x4d4b68, paw: 0x36354e, stripe: 0x9a6cff, cheek: 0x5d5b7c, spot: 0xcbb0ff, brow: 0x6f6c92 }
    : { back: 0xdf7718, side: 0xee8d27, under: 0xf6c27c, light: 0xfbf2e2, dark: 0x231812, nose: 0xe38f88, mouth: 0x8a2c34, tooth: 0xf6f0e2, earIn: 0xfbf2e2, paw: 0xfbf2e2, stripe: 0x231812, cheek: 0xfbf2e2, spot: 0xfbf2e2, brow: 0xfbf2e2 };
  const keys = [K(0.8, -0.8, 0.07, 0.07, 0.07, 1), K(0.79, -0.72, 0.24, 0.2, 0.22, 1), K(0.77, -0.5, 0.31, 0.24, 0.28, 1), K(0.75, -0.18, 0.3, 0.235, 0.27, [1, 0.5, 2, 0.5]), K(0.76, 0.14, 0.32, 0.26, 0.3, 2),
    K(0.79, 0.42, 0.335, 0.29, 0.31, 2), K(0.84, 0.62, 0.285, 0.26, 0.27, 2), K(0.91, 0.78, 0.245, 0.23, 0.22, [2, 0.5, 3, 0.5]), K(0.98, 0.9, 0.2, 0.2, 0.18, [3, 0.4, 4, 0.6])];
  // 條紋：在軀幹上插入一道道窄環，從背上看是橫過背脊的粗黑紋，往兩側收尖
  const sz = [-0.58, -0.36, -0.14, 0.08, 0.3, 0.5, 0.68], hw = 0.05, us = [0, 1];
  sz.forEach(z => { us.push(uAtZ(keys, z - hw), uAtZ(keys, z + hw)); }); us.push(7.35, 8);
  const band = u => sz.findIndex(z => u > uAtZ(keys, z - hw) && u < uAtZ(keys, z + hw));
  const FB = [2, 5, 7], RB = [2, 5, 8];      // 腿上黑紋所在的段
  return {
    pal: P, hs: 1.3, legT: 1.12, hpitch: 0.12, body: [0.78, 0], pelvis: [0.78, -0.46], chest: [0.79, 0.32], neck: [0.88, 0.7], head: [0.98, 0.88], jawB: [-0.065, 0.17], earB: [0.2, 0.2, -0.02], maneB: [1.05, 0.45],
    trunk: keys, trunkU: us,
    paintTrunk: (i, k, s, j, u) => { const b = band(u), base = k <= 1 ? P.back : k <= 2 ? P.side : k <= 3 ? P.under : P.light; if (b < 0) return base; const long = b % 2 === 0; return k <= (long ? 2 : 1) ? P.stripe : k <= (long ? 3 : 2) ? [P.stripe, base] : base; },
    rumpCol: P.side,
    headK: [K(0.03, -0.11, 0.19, 0.18, 0.17), K(0.06, 0.02, 0.29, 0.235, 0.21, 0, { e: 0.9 }), K(0.04, 0.17, 0.295, 0.2, 0.215, 0, { e: 0.9 }), K(-0.01, 0.29, 0.17, 0.12, 0.075), K(-0.03, 0.385, 0.15, 0.1, 0.04, 0, { e: 0.8 }), K(-0.035, 0.44, 0.122, 0.085, 0.035, 0, { e: 0.8 }), K(-0.005, 0.45, 0.062, 0.046, 0.04), K(-0.007, 0.478, 0.042, 0.03, 0.028)],
    paintHead: (i, k) => i >= 6 ? P.nose : i === 5 ? (k <= 1 ? P.nose : P.light) : i >= 3 ? (k >= 3.5 ? P.mouth : k < 1 && i === 3 ? P.side : P.light) : k < 1 ? P.back : k <= 1 ? P.side : k <= 2 ? (i === 0 ? P.side : P.cheek) : P.light,
    jawK: [K(-0.085, 0.2, 0.16, 0.03, 0.075, 0, { e: 0.8 }), K(-0.09, 0.35, 0.145, 0.025, 0.05, 0, { e: 0.8 }), K(-0.085, 0.435, 0.11, 0.02, 0.035, 0, { e: 0.8 })],
    fl: { j0: [0.23, 0.72, 0.44], j1: [0.24, 0.5, 0.37], j2: [0.24, 0.16, 0.41], pad: [0.24, 0, 0.45], paw: [0.125, 0.3, 0.12],
      prof: [[[0.19, 0.88, 0.44], 0.11, 0.15, 0.15, 'a'], [[0.23, 0.72, 0.44], 0.135, 0.165, 0.165, 'a'], [[0.236, 0.62, 0.405], 0.12, 0.135, 0.135, 'a'], [[0.238, 0.57, 0.39], 0.112, 0.122, 0.125, 'a'], [[0.24, 0.5, 0.37], 0.1, 0.105, 0.11, 'ab'],
        [[0.24, 0.41, 0.38], 0.092, 0.095, 0.095, 'b'], [[0.24, 0.355, 0.387], 0.09, 0.09, 0.09, 'b'], [[0.24, 0.27, 0.397], 0.086, 0.086, 0.086, 'b'], [[0.24, 0.215, 0.403], 0.084, 0.084, 0.084, 'b'], [[0.24, 0.16, 0.41], 0.082, 0.082, 0.082, 'bc'], [[0.24, 0.06, 0.42], 0.085, 0.082, 0.078, 'c']] },
    rl: { j0: [0.22, 0.74, -0.5], j1: [0.24, 0.5, -0.36], j2: [0.24, 0.27, -0.58], pad: [0.24, 0, -0.5], paw: [0.115, 0.27, 0.11],
      prof: [[[0.18, 0.9, -0.5], 0.11, 0.15, 0.15, 'a'], [[0.22, 0.74, -0.5], 0.145, 0.2, 0.2, 'a'], [[0.228, 0.66, -0.455], 0.135, 0.17, 0.175, 'a'], [[0.232, 0.6, -0.42], 0.125, 0.15, 0.155, 'a'], [[0.24, 0.5, -0.36], 0.1, 0.105, 0.115, 'ab'],
        [[0.24, 0.42, -0.435], 0.082, 0.084, 0.09, 'b'], [[0.24, 0.37, -0.485], 0.075, 0.077, 0.083, 'b'], [[0.24, 0.27, -0.58], 0.068, 0.07, 0.075, 'bc'], [[0.24, 0.19, -0.555], 0.064, 0.066, 0.066, 'c'], [[0.24, 0.14, -0.54], 0.064, 0.066, 0.064, 'c'], [[0.24, 0.06, -0.52], 0.07, 0.07, 0.066, 'c']] },
    paintLeg: (front, i, k, s, n) => (front ? FB : RB).includes(i) && s >= 0 ? P.stripe : i >= n - 1 ? P.under : s < 0 ? P.under : P.side,
    tail: [[0.86, -0.76, 0.085], [0.74, -0.98, 0.08], [0.62, -1.22, 0.076], [0.6, -1.46, 0.072], [0.7, -1.66, 0.072], [0.84, -1.74, 0.03]], tailN: 5, tailU: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    paintTail: (i, k) => i >= 8 || i % 2 === 1 ? P.stripe : k >= 2 ? P.under : P.side, tailTip: P.stripe,
    S: { k: 1.3, run: 4.9, stride: 0.7, lift: 0.14, bob: 0.05, cad: 1, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.9, jawMax: 0.68, maneUp: 0, wag: 1.2, wagAmp: 0.3, halfW: 0.32, tailRun: 0.35, low: 0.2 },
    extra(c) {
      const ax = (x, y, z) => sub3(c.Hd(x, y, z), c.Hd(0, 0, 0));
      ears(c, [0.2, 0.19, -0.02], [0.265, 0.36, -0.04], [0.11, 0.042], P.stripe, P.earIn, { round: 1, yaw: 0.2 });
      for (const s of [1, -1]) {
        // 耳背的斑、兩頰的短毛、牙
        plate(c.gh, c.Hd(0.235 * s, 0.285, -0.035), ax(0, 0.12, -1), ax(1, 0, 0), ax(0, 1, 0), poly(5, 0.045, 0.05, PI / 2), P.spot, s > 0 ? B.earL : B.earR, 0.046);
        tube(c.gh, [c.Hd(0.25 * s, -0.08, 0.1), c.Hd(0.305 * s, -0.135, 0.06), c.Hd(0.345 * s, -0.19, 0.02)], [[0.085, 0.06], [0.06, 0.04], [0.02, 0.015]], 5, P.cheek, B.head, { side: [0, 1, 0], capB: P.cheek });
        const fl = elite ? 0.2 : 0.09;
        tube(c.gh, [c.Hd(0.088 * s, -0.05, 0.405), c.Hd(0.092 * s, -0.05 - fl, 0.415)], [elite ? 0.027 : 0.023, 0], 4, P.tooth, B.head);
        tube(c.gh, [c.Hd(0.068 * s, -0.075, 0.385), c.Hd(0.07 * s, -0.02, 0.395)], [0.015, 0], 4, P.tooth, B.jaw);
      }
      // 額頭的「王」字紋、後腦與臉頰的黑紋
      const bar = (f0, hw2, t = 0.013) => [[f0 - t, -hw2], [f0 + t, -hw2], [f0 + t, hw2], [f0 - t, hw2]];
      mark(c, c.LH, 1, 7, bar(-0.045, 0.085), P.stripe, B.head); mark(c, c.LH, 1, 7, bar(0, 0.07), P.stripe, B.head); mark(c, c.LH, 1, 7, bar(0.045, 0.05), P.stripe, B.head);
      mark(c, c.LH, 1, 7, [[-0.05, -0.012], [0.055, -0.012], [0.055, 0.012], [-0.05, 0.012]], P.stripe, B.head, { lift: 0.008 });
      mark(c, c.LH, 0, 7, bar(0.01, 0.075, 0.016), P.stripe, B.head);
      mark(c, c.LH, 1, 0, [[-0.05, 0.05], [-0.02, 0.055], [-0.005, -0.06], [-0.03, -0.06]], P.stripe, B.head);
      mark(c, c.LH, 1, 1, [[-0.03, 0.07], [0, 0.075], [0.03, -0.05], [0.008, -0.055]], P.stripe, B.head);
      mark(c, c.LH, 2, 1, [[-0.05, 0.06], [-0.022, 0.065], [0.012, -0.04], [-0.01, -0.045]], P.stripe, B.head);
      eyes(c, 2, 0, { shape: scl(leaf, 1.12), iris: elite ? 0xdcc0ff : 0xf4d228, pupil: poly(6, 0.018, 0.023), hl: scl(poly(4, 0.009), 1, 0.016, 0.012), df: -0.005, du: -0.012, rim: 1.36, rimCol: elite ? 0x0c0b12 : 0x1a120e,
        brow: scl(poly(4, 0.036, 0.016), 1, 0.005, 0.06), browCol: P.brow });
    }
  };
};

/* ---------- 鹿：細長的腿、挺直的頸、大耳、分叉的角、梅花斑 ---------- */
SPEC.deer = () => {
  const P = { back: 0x96633a, side: 0xb8804c, under: 0xd3a877, light: 0xf2e6cc, dark: 0x5f4028, nose: 0x241b16, mouth: 0x8a3a3a, earIn: 0xeccdb4, hoof: 0x271e18, leg: 0xa27242, antler: 0xe4d6b0, spot: 0xf6ecd6, chin: 0xf2e6cc };
  return {
    pal: P, hs: 1.25, legT: 1.45, hpitch: 0.2, body: [1.02, 0], pelvis: [1.03, -0.36], chest: [1.03, 0.28], neck: [1.12, 0.52], head: [1.69, 0.8], jawB: [-0.05, 0.12], earB: [0.115, 0.12, -0.03], maneB: [1.3, 0.4],
    trunk: [K(1.08, -0.65, 0.06, 0.06, 0.06, 1), K(1.06, -0.57, 0.19, 0.17, 0.19, 1), K(1.04, -0.38, 0.23, 0.2, 0.23, 1), K(1.01, -0.06, 0.215, 0.19, 0.22, [1, 0.5, 2, 0.5]), K(1.01, 0.22, 0.225, 0.21, 0.25, 2),
      K(1.04, 0.42, 0.21, 0.22, 0.26, 2), K(1.15, 0.57, 0.155, 0.17, 0.2, [2, 0.6, 3, 0.4]), K(1.36, 0.68, 0.112, 0.12, 0.135, 3), K(1.58, 0.77, 0.097, 0.1, 0.11, 3), K(1.7, 0.815, 0.085, 0.09, 0.09, [3, 0.4, 4, 0.6])],
    paintTrunk: (i, k, s, j, u) => u > 6 ? (k >= 3 ? P.light : k >= 1 ? P.side : P.back) : u < 1 ? P.light : k < 1 ? P.dark : k <= 1 ? P.back : k <= 2 ? P.side : k <= 3 ? P.under : P.light, rumpCol: P.light,
    headK: [K(0.03, -0.09, 0.09, 0.095, 0.09), K(0.055, 0.02, 0.135, 0.12, 0.115), K(0.04, 0.14, 0.125, 0.1, 0.105), K(0, 0.28, 0.082, 0.068, 0.045), K(-0.03, 0.4, 0.064, 0.052, 0.03), K(-0.02, 0.415, 0.046, 0.04, 0.034), K(-0.022, 0.445, 0.03, 0.026, 0.024)],
    paintHead: (i, k) => i >= 4 ? P.nose : i >= 3 ? (k >= 2.5 ? P.light : P.side) : k < 1 ? P.back : k <= 2 ? P.side : P.light,
    jawK: [K(-0.07, 0.14, 0.075, 0.02, 0.045), K(-0.076, 0.28, 0.058, 0.016, 0.03), K(-0.07, 0.39, 0.042, 0.012, 0.022)],
    fl: { j0: [0.145, 0.98, 0.4], j1: [0.15, 0.76, 0.33], j2: [0.15, 0.39, 0.37], pad: [0.15, 0, 0.39], hoof: 1,
      prof: [[[0.12, 1.09, 0.4], 0.075, 0.11, 0.11, 'a'], [[0.145, 0.98, 0.4], 0.088, 0.125, 0.125, 'a'], [[0.148, 0.86, 0.36], 0.072, 0.092, 0.092, 'a'], [[0.15, 0.76, 0.33], 0.054, 0.062, 0.064, 'ab'], [[0.15, 0.57, 0.35], 0.04, 0.042, 0.042, 'b'], [[0.15, 0.39, 0.37], 0.042, 0.044, 0.044, 'bc'], [[0.15, 0.2, 0.38], 0.031, 0.033, 0.033, 'c'], [[0.15, 0.08, 0.386], 0.037, 0.043, 0.037, 'c'], [[0.15, 0, 0.398], 0.045, 0.058, 0.042, 'c', 0.8]] },
    rl: { j0: [0.145, 1.0, -0.4], j1: [0.155, 0.76, -0.27], j2: [0.155, 0.45, -0.5], pad: [0.155, 0, -0.44], hoof: 1,
      prof: [[[0.12, 1.11, -0.4], 0.08, 0.12, 0.12, 'a'], [[0.145, 1.0, -0.4], 0.104, 0.155, 0.155, 'a'], [[0.15, 0.87, -0.33], 0.088, 0.118, 0.122, 'a'], [[0.155, 0.76, -0.27], 0.06, 0.067, 0.072, 'ab'], [[0.155, 0.6, -0.385], 0.042, 0.046, 0.05, 'b'], [[0.155, 0.45, -0.5], 0.038, 0.041, 0.046, 'bc'], [[0.155, 0.23, -0.468], 0.031, 0.033, 0.035, 'c'], [[0.155, 0.08, -0.45], 0.037, 0.042, 0.037, 'c'], [[0.155, 0, -0.438], 0.045, 0.056, 0.042, 'c', 0.8]] },
    paintLeg: (front, i, k, s, n) => i >= n - 1 ? P.hoof : i < 2 ? (k >= 2 ? P.under : P.side) : i < 3 ? P.under : P.leg,
    tail: [[1.11, -0.63, 0.05, 0.035], [1.0, -0.74, 0.06, 0.035], [0.9, -0.79, 0.015, 0.012]], tailN: 2, paintTail: (i, k) => k <= 1 ? P.back : P.light, tailTip: P.light,
    S: { k: 1.3, run: 5.4, stride: 0.88, lift: 0.2, bob: 0.085, cad: 1, graze: 1, grazeN: 1.45, grazeH: 0.35, earBack: 0.9, jawMax: 0.32, maneUp: 0, wag: 3.5, wagAmp: 0.35, halfW: 0.22, tailRun: 0.9, low: 0, flag: 1, chew: 1 },
    extra(c) {
      ears(c, [0.115, 0.11, -0.03], [0.36, 0.24, -0.12], [0.075, 0.022], P.side, P.earIn, { leaf: 1, yaw: 0.9 });
      // 角：主幹往後上方彎，前面分兩叉、後面一叉
      for (const s of [1, -1]) {
        const m = [c.Hd(0.065 * s, 0.14, -0.01), c.Hd(0.13 * s, 0.35, -0.08), c.Hd(0.23 * s, 0.56, -0.13), c.Hd(0.25 * s, 0.76, -0.05)];
        tube(c.gh, m, [0.042, 0.035, 0.028, 0], 5, P.antler, B.head);
        tube(c.gh, [mid3(m[0], m[1], 0.5), c.Hd(0.1 * s, 0.34, 0.14)], [0.028, 0], 4, P.antler, B.head);
        tube(c.gh, [m[1], c.Hd(0.2 * s, 0.5, 0.1)], [0.028, 0], 4, P.antler, B.head);
        tube(c.gh, [m[2], c.Hd(0.36 * s, 0.68, 0.0)], [0.025, 0], 4, P.antler, B.head);
        tube(c.gh, [m[2], c.Hd(0.2 * s, 0.7, -0.26)], [0.025, 0], 4, P.antler, B.head);
      }
      eyes(c, 2, 1, { shape: scl(poly(6, 0.034, 0.03), 1), iris: 0x2a1a12, pupil: poly(6, 0.024, 0.022), hl: scl(poly(4, 0.009), 1, 0.012, 0.012), df: -0.02, du: 0.03, rim: 1.3, rimCol: 0x1a120e });
      // 梅花斑
      const dot = poly(4, 0.042, 0.036);
      for (const [i, j, df, du] of [[1, 0, 0, 0.02], [2, 0, -0.08, -0.02], [2, 0, 0.09, 0.03], [3, 0, -0.05, 0.02], [3, 0, 0.09, -0.03], [4, 0, 0.0, 0.01], [2, 1, 0.0, 0.06], [3, 1, 0.05, 0.07], [1, 1, 0.03, 0.05], [4, 1, -0.02, 0.08]]) mark(c, c.LT, i, j, dot, P.spot, c.trunk[i].sk, { df, du });
    }
  };
};

/* ============================== 圓潤建模（0.5 新做法：軟膠玩具質感） ============================== */
// 每個部位是一張 (nu+1)×(nv+1) 的網格：u 繞一圈（首尾重合）、v 從一端到另一端（兩端可以收成一點）。
// 形體用「雕刻」修（在某處把表面推出去或壓進去），法線平滑；顏色依表面的立體位置畫進一張共用貼圖，條紋邊緣乾淨。
// 整隻怪合成一個 SkinnedMesh：每個部位大致跟著一根骨頭（像公仔的關節），關節附近用權重平滑過渡。
class Part {
  constructor(name, nu, nv) { this.name = name; this.nu = nu; this.nv = nv; this.P = new Float32Array((nu + 1) * (nv + 1) * 3); this.N = null; this.sk = 0; this.tex = [16, 16]; this.col = [255, 0, 255]; this.paint = null; this.glow = 0; this.flat = false; }
  map(fn) { const P = this.P, p = [0, 0, 0]; for (let k = 0; k < P.length; k += 3) { p[0] = P[k]; p[1] = P[k + 1]; p[2] = P[k + 2]; fn(p); P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2]; } this.N = null; return this; }
}
// 橢球。極軸預設是前後（+z 那一端是 v=0），axis:'y' 則是上下；vmap 讓環往一端集中；vmax<1 只做前面一部分（開口在後）
function ball(name, nu, nv, r, o = {}) {
  const pt = new Part(name, nu, nv), P = pt.P, vm = o.vmap || (t => t), vmax = (o.vmax ?? 1) * PI, e = o.e || 1, pw = x => Math.sign(x) * Math.pow(abs(x), e), ay = o.axis === 'y'; let k = 0;
  const dir = (u, v) => { const th = vm(v) * vmax, ph = PI + u * TAU, st = sin(th), a = st * sin(ph), b = st * cos(ph), c = cos(th); return ay ? [a, c, b] : [a, b, c]; };
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const d = dir((i % nu) / nu, j / nv); P[k++] = pw(d[0]) * r[0]; P[k++] = pw(d[1]) * r[1]; P[k++] = pw(d[2]) * r[2]; }
  pt.dir = dir; return pt;
}
// 圓管：沿一串站點 { p, rx, ry, rd, e, wt, wb } 拉出平滑的管子。rx 是 e1 方向的半徑、ry／rd 是 e2 正負方向的半徑；
// e1 取 o.ref（預設 +x）垂直於路徑的分量、e2 = 路徑 × e1。capA／capB：兩端收成圓頭的長度（不給就開口）；seam：接縫所在的角度
function tubeP(name, nu, keys, o = {}) {
  const nk = keys.length, n = o.nv || nk, rows = [], capN = o.capN ?? 3, ref = o.ref || [1, 0, 0];
  for (let j = 0; j < n; j++) {
    const u = n > 1 ? j / (n - 1) * (nk - 1) : 0, i = clamp(Math.floor(u), 0, nk - 2), t = u - i, k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(nk - 1, i + 2)], f = g => crom(g(k0), g(k1), g(k2), g(k3), t);
    rows.push({ p: [f(k => k.p[0]), f(k => k.p[1]), f(k => k.p[2])], rx: f(k => k.rx), ry: f(k => k.ry), rd: f(k => k.rd ?? k.ry), e: f(k => k.e ?? 1), wt: f(k => k.wt ?? 1), wb: f(k => k.wb ?? 1), s: 1, t: u / (nk - 1) });
  }
  rows.forEach((r, j) => { r.tan = norm3(sub3(rows[Math.min(n - 1, j + 1)].p, rows[Math.max(0, j - 1)].p)); });
  const A = [], Z = [];
  if (o.capA) for (let c = capN; c >= 1; c--) { const a = c / capN * PI / 2, r = rows[0]; A.push(Object.assign({}, r, { p: add3(r.p, r.tan, -o.capA * sin(a)), s: c === capN ? 0 : cos(a) })); }
  if (o.capB) for (let c = 1; c <= capN; c++) { const a = c / capN * PI / 2, r = rows[n - 1]; Z.push(Object.assign({}, r, { p: add3(r.p, r.tan, o.capB * sin(a)), s: c === capN ? 0 : cos(a) })); }
  const all = [...A, ...rows, ...Z], pt = new Part(name, nu, all.length - 1), P = pt.P, seam = o.seam ?? -PI / 2; let k = 0;
  for (const r of all) {
    const t = r.tan, d = dot3(ref, t), e1 = norm3([ref[0] - t[0] * d, ref[1] - t[1] * d, ref[2] - t[2] * d]), e2 = cross3(t, e1);
    for (let i = 0; i <= nu; i++) {
      const ph = seam + (i % nu) / nu * TAU, cx = cos(ph), sy = sin(ph), X = Math.sign(cx) * Math.pow(abs(cx), r.e) * r.rx * lerp(r.wb, r.wt, (sy + 1) / 2) * r.s, Y = Math.sign(sy) * Math.pow(abs(sy), r.e) * (sy >= 0 ? r.ry : r.rd) * r.s;
      P[k++] = r.p[0] + e1[0] * X + e2[0] * Y; P[k++] = r.p[1] + e1[1] * X + e2[1] * Y; P[k++] = r.p[2] + e1[2] * X + e2[2] * Y;
    }
  }
  pt.rows = all; return pt;
}
// 擺放：先轉（歐拉角 YXZ，或直接給三個基底向量）再平移
function place(pt, c, rot) {
  let m = null;
  if (rot) m = Array.isArray(rot[0]) ? [rot[0][0], rot[0][1], rot[0][2], 0, rot[1][0], rot[1][1], rot[1][2], 0, rot[2][0], rot[2][1], rot[2][2]] : new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')).elements;
  return pt.map(p => { if (m) { const x = p[0], y = p[1], z = p[2]; p[0] = m[0] * x + m[4] * y + m[8] * z; p[1] = m[1] * x + m[5] * y + m[9] * z; p[2] = m[2] * x + m[6] * y + m[10] * z; } p[0] += c[0]; p[1] += c[1]; p[2] += c[2]; });
}
// 雕刻：在 c 周圍（半徑 r，可給三軸）把表面往 d 推，離中心越遠推得越少。sym：左右對稱各做一次
const fall = q => q >= 1 ? 0 : (1 - q) * (1 - q);
function push(pt, c, r, d, sym = true) {
  const rx = r[0] ?? r, ry = r[1] ?? r, rz = r[2] ?? r, two = sym && abs(c[0]) > 1e-6;
  return pt.map(p => {
    const dy = (p[1] - c[1]) / ry, dz = (p[2] - c[2]) / rz; let dx = (p[0] - c[0]) / rx, w = fall(dx * dx + dy * dy + dz * dz), ox = d[0] * w, oy = d[1] * w, oz = d[2] * w;
    if (two) { dx = (p[0] + c[0]) / rx; w = fall(dx * dx + dy * dy + dz * dz); ox -= d[0] * w; oy += d[1] * w; oz += d[2] * w; }
    p[0] += ox; p[1] += oy; p[2] += oz;
  });
}
// 左右鏡射出另一邊（共用同一塊貼圖）
function mirrorX(src, name) {
  const pt = new Part(name, src.nu, src.nv), nu = src.nu, Wd = nu + 1;
  for (let j = 0; j <= src.nv; j++) for (let i = 0; i <= nu; i++) { const a = (j * Wd + i) * 3, b = (j * Wd + nu - i) * 3; pt.P[a] = -src.P[b]; pt.P[a + 1] = src.P[b + 1]; pt.P[a + 2] = src.P[b + 2]; }
  pt.share = src; pt.uflip = true; pt.tex = src.tex; pt.glow = src.glow; pt.flat = src.flat; pt.rows = src.rows; return pt;
}
// 平滑法線（接縫與極點合併），並判斷三角形的繞向
function finish(pt) {
  const nu = pt.nu, nv = pt.nv, Wd = nu + 1, P = pt.P, N = pt.N = new Float32Array(P.length), nP = P.length / 3; let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < P.length; k += 3) { cx += P[k] / nP; cy += P[k + 1] / nP; cz += P[k + 2] / nP; }
  const acc = (a, b, c) => {
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; } vol += (P[a] - cx) * nx + (P[a + 1] - cy) * ny + (P[a + 2] - cz) * nz;
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = (j * Wd + i) * 3, b = a + 3, d = a + Wd * 3, c = d + 3; acc(a, b, c); acc(a, c, d); }
  pt.pole = [];
  for (let j = 0; j <= nv; j++) {
    const a = j * Wd * 3, b = a + nu * 3, pole = pt.pole[j] = abs(P[a] - P[a + 3]) + abs(P[a + 1] - P[a + 4]) + abs(P[a + 2] - P[a + 5]) < 1e-7;
    if (pole) { let x = 0, y = 0, z = 0; for (let i = 0; i < nu; i++) { x += N[a + i * 3]; y += N[a + i * 3 + 1]; z += N[a + i * 3 + 2]; } for (let i = 0; i <= nu; i++) { N[a + i * 3] = x; N[a + i * 3 + 1] = y; N[a + i * 3 + 2] = z; } }
    else for (let k = 0; k < 3; k++) N[a + k] = N[b + k] = N[a + k] + N[b + k];
  }
  pt.flip = vol < 0; const s = pt.flip ? -1 : 1;
  for (let k = 0; k < N.length; k += 3) { const l = s / (hyp(N[k], N[k + 1], N[k + 2]) || 1); N[k] *= l; N[k + 1] *= l; N[k + 2] *= l; }
  return pt;
}
// 接合處：把 a 靠近 b 表面的頂點法線往 b 的法線帶（b 那邊也一樣），接縫的明暗就連起來了，看起來像同一塊捏出來的
function blendN(a, b, h, both = true) {
  if (!a.N) finish(a); if (!b.N) finish(b);
  const go = (A, Bq) => { const P = A.P, N = A.N, Q = Bq.P, M = Bq.N, out = new Float32Array(N);
    for (let i = 0; i < P.length; i += 3) { let bd = h * h, bj = -1; for (let j = 0; j < Q.length; j += 3) { const dx = P[i] - Q[j], dy = P[i + 1] - Q[j + 1], dz = P[i + 2] - Q[j + 2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bj = j; } }
      if (bj < 0) continue; const w = 0.5 * smooth(h, h * 0.15, Math.sqrt(bd)); let x = N[i] + (M[bj] - N[i]) * w, y = N[i + 1] + (M[bj + 1] - N[i + 1]) * w, z = N[i + 2] + (M[bj + 2] - N[i + 2]) * w; const l = hyp(x, y, z) || 1; out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l; }
    return out; };
  const na = go(a, b), nb = both ? go(b, a) : null; a.N = na; if (nb) b.N = nb;
}
// 從 o 往 d 射出去，打在這個部位表面的哪裡（用來把眼睛、鼻子、毛簇放在雕過的表面上）
function surf(pt, o, d) {
  if (!pt.N) finish(pt);
  const nu = pt.nu, nv = pt.nv, Wd = nu + 1, P = pt.P; let bt = 1e9, bn = null;
  const hit = (a, b, c) => {
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], h = cross3(d, e2), det = dot3(e1, h); if (abs(det) < 1e-14) return;
    const f = 1 / det, s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]], u = f * dot3(s, h); if (u < -1e-5 || u > 1.00001) return;
    const q = cross3(s, e1), v = f * dot3(d, q); if (v < -1e-5 || u + v > 1.00001) return;
    const t = f * dot3(e2, q); if (t > 1e-6 && t < bt) { bt = t; bn = cross3(e1, e2); }
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = (j * Wd + i) * 3, b = a + 3, dd = a + Wd * 3, c = dd + 3; hit(a, b, c); hit(a, c, dd); }
  if (!bn) return null; const n = norm3(bn), s = pt.flip ? -1 : 1; return { p: add3(o, d, bt), n: [n[0] * s, n[1] * s, n[2] * s] };
}
// 扁的圓錐（兩頰的毛簇、背上豎起的毛）：底在 base、尖在 tip，side 是底面寬的方向、hw 半寬、th 半厚、belly 中段的飽滿程度
function spike(name, base, tip, side, hw, th, nu = 5, belly = 0.72) {
  const t = norm3(sub3(tip, base)), pt = tubeP(name, nu, [{ p: base, rx: th, ry: hw }, { p: mid3(base, tip, 0.45), rx: th * belly, ry: hw * belly * 0.92 }, { p: tip, rx: 0.003, ry: 0.003 }], { ref: cross3(side, t), capB: 0.003, capN: 1 });
  return pt;
}
// 一撮往後掃的毛（火焰狀；截面的邊數 o.nu 請用偶數，寬的兩端才會各有一條稜）：底在 base、尖在 tip，中途先往 o.up（預設正上方）鼓起再掃向尖端。side 是寬的方向、hw 半寬、th 半厚；o.bow 鼓起的程度、o.pr 四段的粗細比例（預設由粗到尖）
function tuft(name, base, tip, side, hw, th, o = {}) {
  const d = sub3(tip, base), L = hyp(d[0], d[1], d[2]), t = norm3(d), ctl = add3(mid3(base, tip, 0.4), o.up || [0, 1, 0], (o.bow ?? 0.3) * L), q = s => mid3(mid3(base, ctl, s), mid3(ctl, tip, s), s), pr = o.pr || [1, 0.8, 0.42, 0.03];
  return tubeP(name, o.nu ?? 6, [0, 0.3, 0.64, 1].map((s, i) => ({ p: q(s), rx: th * pr[i], ry: hw * pr[i] })), { ref: cross3(side, t), capB: 0.003, capN: 1 });
}
// 平滑的圓錐（牙、爪）
const cone = (name, nu, a, m, b, r, ref = [0, 0, 1]) => tubeP(name, nu, [{ p: a, rx: r, ry: r }, { p: m, rx: r * 0.62, ry: r * 0.62 }, { p: b, rx: r * 0.1, ry: r * 0.1 }], { capB: r * 0.12, capN: 1, ref });
// 彎的尖角（長牙、獠牙、爪、角的分枝）：沿 pts 這串點拉一根由粗到細的管子。r0 根部半徑；
// o.flat 把截面壓扁成刀狀（寬的方向是 o.ref，預設前後）、o.tip 尖端半徑的比例、o.pw 收尖的曲線（>1 先粗後急收）、o.nv 沿長度的段數、o.capA 根部收圓
const horn = (name, nu, pts, r0, o = {}) => { const n = pts.length - 1, tip = o.tip ?? 0.1, pw = o.pw ?? 1;
  return tubeP(name, nu, pts.map((p, i) => { const r = r0 * (tip + (1 - tip) * Math.pow(1 - i / n, pw)); return { p, rx: r, ry: r * (o.flat ?? 1) }; }), { nv: o.nv || pts.length, capA: o.capA, capB: r0 * tip, capN: 1, ref: o.ref || [0, 0, 1] }); };
// 一排可以豎起的毛簇（鬃毛、背脊的毛）：排在 host 這個部位的背上。zs 前後位置、hs 高度（陣列或 (i, z) => 高度）。
// 底部跟著 host 的蒙皮、尖端跟著 o.bone（預設 mane 骨：動作裡的 T.mane 配合 S.maneUp／S.maneK 會把它抬高、撐大）；o.follow 尖端跟骨頭的比重（陣列或數字，0 = 完全跟身體）
// o.hw 前後半寬、o.th 左右半厚、o.lean 往後倒的程度、o.bow 中段鼓起的程度、o.out 往外側倒的程度（配合 o.x 做左右兩排）、o.sink 底部埋進身體多深、o.col 顏色（或 o.paint）、o.x 偏離中線。回傳做出來的部位
function ridge(add, host, zs, hs, o = {}) {
  return zs.map((z, i) => {
    const h = surf(host, [o.x || 0, 9, z], [0, -1, 0]), hh = typeof hs === 'function' ? hs(i, z) : hs[i], f = Array.isArray(o.follow) ? o.follow[i] : o.follow ?? 1, bone = o.bone ?? B.mane, lean = o.lean ?? 1.1, hw = typeof o.hw === 'function' ? o.hw(i) : o.hw ?? 0.13;
    const s = tuft((o.name || 'rg') + i, add3(h.p, [0, -(o.sink ?? 0.07), hh * 0.2]), add3(h.p, [hh * (o.out || 0), hh, -hh * lean]), o.out ? norm3([-(o.out), 0, 1]) : [0, 0, 1], hw, o.th ?? 0.05, { nu: o.nu ?? 4, bow: o.bow }), base = typeof host.sk === 'function' ? host.sk(h.p) : host.sk;
    s.sk = (q, ii, j, pt) => skMix(base, bone, f * clamp(j / (pt.nv - 1), 0, 1) ** 0.7); if (o.paint) { s.paint = o.paint; s.tex = o.tex || [16, 32]; } else s.col = o.col; return add(s);
  });
}
// 上色用的小工具（顏色是 0–255 的 sRGB）
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const cov = (sd, aa = 0.006) => clamp(0.5 - sd / aa, 0, 1);                         // sd：到邊緣的距離（負的在裡面）→ 覆蓋率，邊緣柔一個像素左右
const ink = (c, k, col) => { if (k > 0) { c[0] += (col[0] - c[0]) * k; c[1] += (col[1] - c[1]) * k; c[2] += (col[2] - c[2]) * k; } };
const put = (c, col) => { c[0] = col[0]; c[1] = col[1]; c[2] = col[2]; };
const h2 = (a, b) => Math.sqrt(a * a + b * b);                                       // 上色時每個像素都要算，不用 Math.hypot（慢）
// 一道往一端收尖的條紋：沿 a 方向從 0 到 len，半寬從 w 收到 0；b 是橫向位置
const wedge = (a, b, len, w, pw = 0.8, bk = 0) => a > len || a < -bk ? 1 : abs(b) - w * (a < 0 ? Math.pow(1 + a / bk, 0.6) : Math.pow(1 - a / len, pw));
// 用一組球近似周圍的部位，估算凹處的陰影（烘進貼圖，讓接合的地方有軟膠玩具的厚度）
function occl(p, n, balls, skip) {
  let o = 0;
  for (const s of balls) { if (s.id === skip) continue; const dx = s.c[0] - p[0], dy = s.c[1] - p[1], dz = s.c[2] - p[2], d2 = dx * dx + dy * dy + dz * dz, r2 = s.r * s.r; if (d2 < r2 * 0.36 || d2 > r2 * 16) continue; const d = Math.sqrt(d2), cs = (dx * n[0] + dy * n[1] + dz * n[2]) / d; if (cs > 0) o += cs * Math.min(1, r2 / d2) * (s.k || 1); }
  return o;
}
/* ============================== 野鹿臉（參考圖貼圖）============================== */
/* 臉面網格：把「野鹿-B正面臉」裁出的臉盤（448×500 畫布）從正前方往 -z 射線投影到頭／吻部／下巴表面，往外推一點點做成貼合曲面的網格，綁頭骨。
   平常（閉嘴瞪人）與生氣（張嘴）兩張圖在 shader 裡依 uDim 切換；生氣時虹膜（深色像素）染成紅光。s＝每像素幾公尺、ye＝眼線高度（頭座標）。 */
const DEER_FACE = { CW: 448, CH: 500, cx: 224, ey: 205, s: 0.0017, ye: -0.03, NX: 32, NY: 36, eyes: [110, 205, 336, 205] };
function deerFaceGrid(parts, HC, names, sc = 1) {
  const F = Object.assign({}, DEER_FACE, { s: DEER_FACE.s * sc }), NX = F.NX, NY = F.NY, W = NX + 1, nvx = W * (NY + 1), cand = (names || ['head', 'snout', 'jaw', 'nose']).map(n => parts.find(p => p.name === n)).filter(Boolean);
  const X = new Float32Array(nvx), Yv = new Float32Array(nvx), Z = new Float32Array(nvx).fill(NaN), uv = new Float32Array(nvx * 2);
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, px = i / NX * F.CW, py = j / NY * F.CH; X[k] = HC[0] + (px - F.cx) * F.s; Yv[k] = HC[1] + F.ye + (F.ey - py) * F.s; uv[k * 2] = i / NX; uv[k * 2 + 1] = 1 - j / NY;
    for (const pt of cand) { const h = surf(pt, [X[k], Yv[k], HC[2] + 1.2], [0, 0, -1]); if (h && !(Z[k] >= h.p[2])) Z[k] = h.p[2]; }
  }
  for (let i = 0; i <= NX; i++) { let a = -1, b = -1; for (let j = 0; j <= NY; j++) if (!isNaN(Z[j * W + i])) { if (a < 0) a = j; b = j; }
    if (a < 0) continue; for (let j = 0; j <= NY; j++) { const k = j * W + i; if (!isNaN(Z[k])) continue; const r = j < a ? a : b; Z[k] = Z[r * W + i]; Yv[k] = Yv[r * W + i]; } }      /* 頭殼外（下巴以下、頭頂以上）的格子收攏到最後一個打到的那一列：面積為零，不會懸成一片 */
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const k = j * W + i; if (!isNaN(Z[k])) continue; for (let d = 1; d <= NX; d++) { const l = i - d >= 0 ? Z[k - d] : NaN, r = i + d <= NX ? Z[k + d] : NaN, v = !isNaN(l) ? l : r; if (!isNaN(v)) { Z[k] = v - 0.9 * d * F.CW / NX * F.s; break; } } if (isNaN(Z[k])) Z[k] = HC[2]; }
  const Z0 = Float32Array.from(Z); for (let pass = 0; pass < 2; pass++) { const Z2 = Float32Array.from(Z); for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) { let t = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += Z[(j + b) * W + i + a]; Z2[j * W + i] = Math.max(t / 9, Z0[j * W + i]); } Z.set(Z2); }
  const Zn = Float32Array.from(Z); for (let pass = 0; pass < 3; pass++) { const Z2 = Float32Array.from(Zn); for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) { let t = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += Zn[(j + b) * W + i + a]; Z2[j * W + i] = t / 9; } Zn.set(Z2); }      /* 法線用更平滑的一份 */
  const pos = new Float32Array(nvx * 3), nor = new Float32Array(nvx * 3), off = 0.01;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, kl = j * W + Math.max(0, i - 1), kr = j * W + Math.min(NX, i + 1), ku = Math.max(0, j - 1) * W + i, kd = Math.min(NY, j + 1) * W + i;
    const tx = [X[kr] - X[kl], Yv[kr] - Yv[kl], Zn[kr] - Zn[kl]], ty = [X[kd] - X[ku], Yv[kd] - Yv[ku], Zn[kd] - Zn[ku]], n = norm3(cross3(ty, tx)), nl = norm3([n[0] * 0.7, n[1] * 0.7 + 0.28, n[2] * 0.7 + 0.12]);      /* 光照用的法線往上、往前偏一點（下巴底下才不會灰）*/
    nor[k * 3] = nl[0]; nor[k * 3 + 1] = nl[1]; nor[k * 3 + 2] = nl[2]; pos[k * 3] = X[k] + n[0] * off; pos[k * 3 + 1] = Yv[k] + n[1] * off; pos[k * 3 + 2] = Z[k] + n[2] * off;
  }
  const idx = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  return { pos, nor, uv, idx, eyes: F.eyes, cw: F.CW, ch: F.CH };
}
const faceTex = {};
const faceTexture = name => { let t = faceTex[name]; if (!t) { t = faceTex[name] = new THREE.TextureLoader().load('assets/face/' + name); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; } return t; };
/* 臉面材質：和身體共用 glow／dim／fade／rim 這幾個 uniform 物件（animCreature 只改 mats[0]，臉跟著）。uDim（＝0.95×發光程度）大於 0.12 起從閉嘴圖漸變成生氣圖；
   虹膜（眼睛位置周圍的深色像素）生氣時染成紅色。 */
function faceShader(sh) {
  const U = this.userData; sh.uniforms.uGlow = U.glow; sh.uniforms.uDim = U.dim; sh.uniforms.uFade = U.fade; sh.uniforms.uRim = U.rim; sh.uniforms.mapB = { value: U.mapB }; sh.uniforms.uEyes = { value: U.eyes }; sh.uniforms.uCan = { value: U.can }; sh.uniforms.uLift = { value: 0.06 };
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nuniform sampler2D mapB;\nuniform vec4 uEyes;\nuniform vec2 uCan;\nuniform float uLift;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', `vec4 tA = texture2D(map, vMapUv), tB = texture2D(mapB, vMapUv), tM = mix(tA, tB, smoothstep(0.08, 0.2, uDim));
  vec2 tp = vec2(vMapUv.x * uCan.x, (1.0 - vMapUv.y) * uCan.y); float eyeM = max(1.0 - smoothstep(30.0, 46.0, distance(tp, uEyes.xy)), 1.0 - smoothstep(30.0, 46.0, distance(tp, uEyes.zw)));
  float luma = dot(tM.rgb, vec3(0.3, 0.59, 0.11)), irisK = eyeM * smoothstep(0.1, 0.6, uDim) * (1.0 - smoothstep(0.2, 0.34, luma)), rr = luma * 3.2 + 0.05;
  tM.rgb = mix(tM.rgb, vec3(1.0, 0.1, 0.05) * rr, irisK); diffuseColor *= tM;`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * (irisK * 0.5) + diffuseColor.rgb * uLift;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
function attachFace(m, F, mat, mesh) {
  let g = F.geo; if (!g) { g = F.geo = new THREE.BufferGeometry(); const n = F.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = B.head; sw[i * 4] = 1; }
    g.setAttribute('position', new THREE.BufferAttribute(F.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(F.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(F.uv, 2)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setIndex(F.idx); }
  const tA = faceTexture(F.tex[0]), tB = faceTexture(F.tex[1]), fm = new THREE.MeshStandardMaterial({ map: tA, roughness: 0.82, metalness: 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  fm.emissive = mat.emissive; Object.assign(fm.userData, { glow: mat.userData.glow, dim: mat.userData.dim, fade: mat.userData.fade, rim: mat.userData.rim, mapB: tB, eyes: new THREE.Vector4(F.eyes[0], F.eyes[1], F.eyes[2], F.eyes[3]), can: new THREE.Vector2(F.cw, F.ch) });
  fm.onBeforeCompile = faceShader; fm.customProgramCacheKey = () => 'deerface';
  const fmesh = new THREE.SkinnedMesh(g, fm); fmesh.frustumCulled = false; fmesh.castShadow = false; fmesh.receiveShadow = false; fmesh.renderOrder = 1; fmesh.bind(mesh.skeleton, new THREE.Matrix4());
  fmesh.onBeforeRender = () => { fm.opacity = tA.image && tB.image ? mat.opacity : 0; };
  m.root.add(fmesh); m.face = fmesh; return fmesh;
}
// 把所有部位合成一份幾何＋一張貼圖。D：{ parts, bones, legs, tailN, mane2, S, X, bg, ao, aoTint }；defer：貼圖先不畫（之後用回傳物件的 paint 分批畫）
// D.ao(p, n, 部位) → 0–1：凹處要壓暗多少。只在每個部位的網格頂點上算、上色時內插（陰影本來就是緩和的變化，逐像素算很慢）；
// 有 paint 且不發光的部位才會套用，個別部位設 pt.ao = false 可以跳過
function buildSoft(D, defer) {
  const parts = D.parts, AW = D.texW || 1024, pad = 3;
  for (const pt of parts) if (!pt.N) finish(pt);
  for (const pt of parts) if (pt.blend) blendN(pt, pt.blend[0], pt.blend[1], pt.blend[2] !== false);
  // 貼圖配置：由高到矮，用天際線排法（每一塊放在放得下的最低處），小塊會塞進大塊旁邊的空位
  const own = parts.filter(p => !p.share).sort((a, b) => b.tex[1] - a.tex[1] || b.tex[0] - a.tex[0]); let sky = [[0, AW, 0]], used = 0;
  for (const pt of own) {
    const w = pt.tex[0] + pad * 2, h = pt.tex[1] + pad * 2; let bx = -1, by = 1e9;
    for (let i = 0; i < sky.length; i++) { const x = sky[i][0]; if (x + w > AW) break; let y = 0, left = w; for (let j = i; j < sky.length && left > 0; j++) { y = Math.max(y, sky[j][2]); left -= sky[j][1]; } if (y < by) { by = y; bx = x; } }
    if (bx < 0) throw new Error('貼圖放不下：' + pt.name);
    pt.rect = [bx + pad, by + pad, pt.tex[0], pt.tex[1]]; used = Math.max(used, by + h);
    const ns = []; for (const g of sky) { const a = g[0], b = g[0] + g[1]; if (b <= bx || a >= bx + w) ns.push(g); else { if (a < bx) ns.push([a, bx - a, g[2]]); if (b > bx + w) ns.push([bx + w, b - bx - w, g[2]]); } } ns.push([bx, w, by + h]); sky = ns.sort((a, b) => a[0] - b[0]);
  }
  let AH = 64; while (AH < used) AH *= 2;
  const px = new Uint8Array(AW * AH * 4), c = [0, 0, 0], p = [0, 0, 0], n = [0, 0, 0], bg = D.bg || [128, 128, 128];
  for (let i = 0; i < px.length; i += 4) { px[i] = bg[0]; px[i + 1] = bg[1]; px[i + 2] = bg[2]; px[i + 3] = 255; }
  // 上色可以分批做（paint(毫秒)：做到超過時間就先停，下次接著做；不給時間就一口氣做完）。一個物種的貼圖要一兩百毫秒，
  // 一次做完畫面會頓一下，所以預先建立時分成很多小段，真的要用了（makeCreature）才把剩下的一次補完
  const aoF = D.ao, aoT = D.aoTint || [0.9, 1, 0.95], tex = new THREE.DataTexture(px, AW, AH, THREE.RGBAFormat); let pi = 0, row = -pad, A = null;
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  const rows = (pt, y0, y1) => {
    const [rx, ry, w, h] = pt.rect, nu = pt.nu, nv = pt.nv, Wd = nu + 1, P = pt.P, N = pt.N, fn = pt.paint;
    for (let ty = y0; ty < y1; ty++) {
      const v = clamp(ty / (h - 1), 0, 1), fj = v * nv, j0 = Math.min(nv - 1, Math.floor(fj)), tj = fj - j0;
      for (let tx = -pad; tx < w + pad; tx++) {
        const u = clamp(tx / (w - 1), 0, 1);
        if (fn) {
          const fi = u * nu, i0 = Math.min(nu - 1, Math.floor(fi)), ti = fi - i0, a = (j0 * Wd + i0) * 3, b = a + 3, d = a + Wd * 3, e = d + 3, w0 = (1 - ti) * (1 - tj), w1 = ti * (1 - tj), w2 = (1 - ti) * tj, w3 = ti * tj;
          for (let k = 0; k < 3; k++) { p[k] = P[a + k] * w0 + P[b + k] * w1 + P[d + k] * w2 + P[e + k] * w3; n[k] = N[a + k] * w0 + N[b + k] * w1 + N[d + k] * w2 + N[e + k] * w3; }
          fn(c, p, n, u, v, pt);
          if (A) { const ia = a / 3, o = A[ia] * w0 + A[ia + 1] * w1 + A[ia + Wd] * w2 + A[ia + Wd + 1] * w3; c[0] *= 1 - o * aoT[0]; c[1] *= 1 - o * aoT[1]; c[2] *= 1 - o * aoT[2]; }
        } else put(c, pt.col);
        const o = ((ry + ty) * AW + rx + tx) * 4; px[o] = clamp(c[0], 0, 255); px[o + 1] = clamp(c[1], 0, 255); px[o + 2] = clamp(c[2], 0, 255);
      }
    }
  };
  const out = { painted: false };
  out.paint = ms => {
    const t0 = ms ? performance.now() : 0;
    while (pi < own.length) {
      const pt = own[pi], h = pt.rect[3] + pad;
      if (row === -pad) { A = null; if (aoF && pt.paint && !pt.glow && pt.ao !== false) { const P = pt.P, N = pt.N; A = new Float32Array(P.length / 3); for (let k = 0; k < A.length; k++) { p[0] = P[k * 3]; p[1] = P[k * 3 + 1]; p[2] = P[k * 3 + 2]; n[0] = N[k * 3]; n[1] = N[k * 3 + 1]; n[2] = N[k * 3 + 2]; A[k] = aoF(p, n, pt); } } }
      const y1 = Math.min(h, row + 8); rows(pt, row, y1); row = y1; if (row >= h) { pi++; row = -pad; }
      if (ms && performance.now() - t0 > ms) break;
    }
    if (pi >= own.length && !out.painted) { out.painted = true; tex.needsUpdate = true; } return out.painted;
  };
  if (!defer) out.paint();
  // 幾何
  const pos = [], nor = [], uv = [], si = [], sw = [], gl = [], idx = []; let tris = 0;
  const skin = s => { if (typeof s === 'number') { si.push(s, 0, 0, 0); sw.push(1, 0, 0, 0); return; } let t = 0; for (let i = 1; i < s.length && i < 8; i += 2) t += s[i]; for (let i = 0; i < 4; i++) { si.push(s[i * 2] || 0); sw.push((s[i * 2 + 1] || 0) / t); } };
  for (const pt of parts) {
    const src = pt.share || pt, [rx, ry, w, h] = src.rect, nu = pt.nu, nv = pt.nv, Wd = nu + 1, P = pt.P, N = pt.N, base = pos.length / 3;
    const vert = (i, j, fn) => { const k = (j * Wd + i) * 3, q = [P[k], P[k + 1], P[k + 2]]; pos.push(q[0], q[1], q[2]); if (fn) nor.push(fn[0], fn[1], fn[2]); else nor.push(N[k], N[k + 1], N[k + 2]);
      uv.push((rx + 0.5 + (pt.uflip ? nu - i : i) / nu * (w - 1)) / AW, (ry + 0.5 + j / nv * (h - 1)) / AH); skin(typeof pt.sk === 'function' ? pt.sk(q, i, j, pt) : pt.sk); gl.push(pt.glow); };
    if (!pt.flat) for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) vert(i, j);
    const tri = (a, b, c) => {
      if (pt.flip) { const t = b; b = c; c = t; }
      if (!pt.flat) { idx.push(base + a[1] * Wd + a[0], base + b[1] * Wd + b[0], base + c[1] * Wd + c[0]); tris++; return; }
      const ka = (a[1] * Wd + a[0]) * 3, kb = (b[1] * Wd + b[0]) * 3, kc = (c[1] * Wd + c[0]) * 3, fn = norm3(cross3([P[kb] - P[ka], P[kb + 1] - P[ka + 1], P[kb + 2] - P[ka + 2]], [P[kc] - P[ka], P[kc + 1] - P[ka + 1], P[kc + 2] - P[ka + 2]])), b0 = pos.length / 3;
      vert(a[0], a[1], fn); vert(b[0], b[1], fn); vert(c[0], c[1], fn); idx.push(b0, b0 + 1, b0 + 2); tris++;
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { if (!pt.pole[j]) tri([i, j], [i + 1, j], [i + 1, j + 1]); if (!pt.pole[j + 1]) tri([i, j], [i + 1, j + 1], [i, j + 1]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(gl, 1)); geo.setIndex(idx);
  // 骨頭：有些骨頭（眼睛、眉）帶著自己的朝向
  const BN = D.bones, one = new THREE.Vector3(1, 1, 1), Mw = BN.map(b => new THREE.Matrix4().compose(new THREE.Vector3(b.p[0], b.p[1], b.p[2]), b.q || new THREE.Quaternion(), one)), inv = Mw.map(m => m.clone().invert());
  BN.forEach((b, i) => { const L = b.parent < 0 ? Mw[i].clone() : inv[b.parent].clone().multiply(Mw[i]); b.lp = new THREE.Vector3(); b.lq = new THREE.Quaternion(); L.decompose(b.lp, b.lq, new THREE.Vector3()); });
  return Object.assign(out, { geo, tex, bones: BN, legs: D.legs, mane2: D.mane2, inv, tris, S: D.S, D, soft: true, X: D.X, AW, AH });
}
// 四足骨架（編號沿用上面的 B，動作程式共用）。J：{ body, pelvis, chest, neck, head, jaw, ear, mane, fl, rl, tail:[…], mane2 }
function softSkel(J) {
  const BN = [], bone = (name, parent, p, q) => BN.push({ name, parent, p, q }) - 1, legs = [];
  bone('body', -1, J.body); bone('pelvis', 0, J.pelvis); bone('chest', 0, J.chest); bone('neck', 2, J.neck); bone('head', 3, J.head); bone('jaw', 4, J.jaw);
  bone('earL', 4, J.ear); bone('earR', 4, [-J.ear[0], J.ear[1], J.ear[2]]); bone('mane', 2, J.mane);
  for (let i = 0; i < 4; i++) {
    const L = i < 2 ? J.fl : J.rl, s = i % 2 ? -1 : 1, mx = p => [p[0] * s, p[1], p[2]], j0 = mx(L.j0), j1 = mx(L.j1), j2 = mx(L.j2), pad = mx(L.pad), par = i < 2 ? B.chest : B.pelvis;
    const b0 = bone('leg' + i + 'a', par, j0); bone('leg' + i + 'b', b0, j1); bone('leg' + i + 'c', b0 + 1, j2);
    legs.push({ j0, j1, j2, pad, par, rest: sub3(pad, BN[par].p), a: hyp(...sub3(j1, j0)), b: hyp(...sub3(j2, j1)), r1: new THREE.Vector3(...norm3(sub3(j1, j0))), r2: new THREE.Vector3(...norm3(sub3(j2, j1))), f0: new THREE.Vector3(...sub3(pad, j2)) });
  }
  J.tail.forEach((p, i) => bone('tail' + i, i ? B.tail + i - 1 : B.pelvis, p));
  const mane2 = bone('mane2', B.neck, J.mane2);
  return { BN, bone, legs, mane2 };
}
// 腿的蒙皮：上段整個跟著大腿骨（像公仔的球形關節），膝與踝附近平滑過渡
const legSk = (b0, y1, y2, w = 0.07) => p => { const tc = smooth(y2 + w * 0.7, y2 - w * 0.7, p[1]); if (tc > 0.002) return [b0 + 1, 1 - tc, b0 + 2, tc]; const tb = smooth(y1 + w, y1 - w, p[1]); return [b0, 1 - tb, b0 + 1, tb]; };
const quatOf = (ex, ey, ez) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...ex), new THREE.Vector3(...ey), new THREE.Vector3(...ez)));

const SOFT = {};

/* ---------- 猛虎（圓潤版）：大頭、隆起的厚肩、粗壯的前腳、壓低的眉骨、細瞳孔、齜牙的嘴、背脊豎起的毛簇 ----------
   菁英「潛行虎・影牙」是同一副骨架的另一個造型：暗灰紫配黑紋、刀狀的長上犬齒、亮黃的眼睛、尖耳、更高的肩峰、一路到臀的背鬃 */
SOFT.tiger = elite => {
  const E = !!elite;
  const K = E
    ? { fur: rgb(0x65596f), furD: rgb(0x443a4f), furL: rgb(0x766a80), cream: rgb(0xa79ca9), creamD: rgb(0x7d7384), stripe: rgb(0x1b1722), nose: rgb(0x100d15), mouth: rgb(0x521626), tongue: rgb(0xb4566a), tooth: rgb(0xfff2d2), toothD: rgb(0xb9a98e), claw: rgb(0xe9e1d0), iris: rgb(0xffd61e), irisD: rgb(0xf29a08), pupil: rgb(0x0b0706), earIn: rgb(0x8f7d8c), paw: rgb(0xb8adb4), pawD: rgb(0x8d8290) }
    : { fur: rgb(0xdc7a1c), furD: rgb(0xa64d10), furL: rgb(0xe8923a), cream: rgb(0xf3dfba), creamD: rgb(0xd5b78f), stripe: rgb(0x26140d), nose: rgb(0x2e1810), mouth: rgb(0x601a24), tongue: rgb(0xc65c6a), tooth: rgb(0xfff4dc), toothD: rgb(0xd9c39c), claw: rgb(0x26150f), iris: rgb(0xffcf24), irisD: rgb(0xe07c0c), pupil: rgb(0x0e0705), earIn: rgb(0xe6c8a4), paw: rgb(0xf3dfba), pawD: rgb(0xd5b78f) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, E ? 0.72 : 0.75, 0.7], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.3, 0.64, 0.25], j1: [0.33, 0.38, 0.15], j2: [0.345, 0.13, 0.235], pad: [0.345, 0, 0.3] }, RJ = { j0: [0.27, 0.62, -0.44], j1: [0.3, 0.38, -0.34], j2: [0.31, 0.15, -0.48], pad: [0.31, 0, -0.4] };
  const TK = [[0.74, -0.6, 0.095], [0.68, -0.84, 0.098], [0.66, -1.04, 0.096], [0.74, -1.21, 0.093], [0.92, -1.28, 0.09], [1.08, -1.2, 0.088]];
  const sk = softSkel({ body: [0, 0.68, -0.08], pelvis: [0, 0.69, -0.36], chest: [0, 0.72, 0.12], neck: [0, 0.78, 0.36], head: [0, HC[1] - 0.02, 0.48], jaw: hd(0, -0.23, 0.02), ear: hd(0.33, 0.3, -0.07), mane: [0, 1.02, 0.1], fl: FJ, rl: RJ, tail: TK.slice(0, 5).map(k => [0, k[0], k[1]]), mane2: [0, 0.98, 0.32] });
  const BN = sk.BN, Lg = i => B.leg + i * 3;

  /* ----- 頭：寬而扁的大圓頭，兩頰鼓、吻部前突；眉骨比樣品更突、更低，眼窩更深，眉心擠出一團 ----- */
  const head = ball('head', 26, 16, [0.5, 0.43, 0.43], { vmap: t => Math.pow(t, 1.2) });
  push(head, [0.39, -0.14, 0.04], 0.39, [0.065, -0.02, 0]);                     // 兩頰往外鼓
  push(head, [0, 0.42, -0.02], [0.53, 0.21, 0.48], [0, -0.033, 0]);             // 頭頂壓平一點
  push(head, [0, -0.145, 0.43], [0.31, 0.21, 0.29], [0, 0, 0.082]);             // 吻部
  push(head, [0.09, -0.145, 0.51], 0.15, [0.014, 0, 0.07]);                      // 鬍鬚墊（左右各一團）
  push(head, [0.2, 0.135, 0.37], 0.19, [0.004, -0.02, E ? 0.074 : 0.066]);      // 眉骨
  push(head, [0, 0.09, 0.44], [0.13, 0.1, 0.14], [0, -0.01, 0.028]);            // 眉心
  push(head, [0.225, 0.015, 0.41], 0.115, [0, 0, -0.03]);                       // 眼窩
  push(head, [0, -0.335, 0.27], [0.2, 0.12, 0.2], [0, 0.085, -0.02]);           // 口腔（下顎蓋住的地方往裡凹）
  place(head, HC); finish(head); head.sk = B.head; head.tex = [512, 320]; add(head);
  // 眼睛的位置與朝向（貼在雕過的臉上，稍微朝外）
  const eh = surf(head, HC, norm3([0.222, 0.018, 0.4])), ez = norm3(add3(eh.n, [0.15, 0, 0.46])), ex = norm3(cross3([0, 1, 0], ez)), ey = cross3(ez, ex), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  const BT = Math.atan2(0.065, 0.19), JC = hd(0, -0.315, 0.26);                 // 眉的斜度（內低外高）；下顎中心
  const HBAR = [0.375, 0.085, 0.022, 0.08, 0.255, 0.135, 0.026, 0.12, 0.125, 0.18, 0.029, 0.15, -0.04, 0.2, 0.03, 0.16, -0.22, 0.22, 0.032, 0.16, -0.4, 0.22, 0.03, 0.14];      // 頭頂橫紋：位置、半長、半寬、往後掃的斜度
  const HCHK = [0.84, 0.09, 0.3, 0.038, -0.12, 0.9, -0.08, 0.3, 0.042, 0.1, 1.24, 0.17, 0.28, 0.038, -0.2, 1.28, -0.03, 0.32, 0.042, 0.1, 1.32, -0.22, 0.26, 0.036, 0.3];      // 兩頰與後腦的紋：起點、高度、長、半寬、斜度
  const cBT = cos(BT), sBT = sin(BT);
  head.paint = (c, p, n) => {
    const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x);
    put(c, K.fur); ink(c, 0.55 * smooth(0.1, 0.4, y), K.furD);
    // 淺色：吻部往兩頰
    const yb = -0.035 - 0.12 * smooth(0.09, 0.24, ax) - 0.04 * smooth(0.32, 0.56, ax);
    ink(c, cov(Math.max(y - yb, -0.2 - z), 0.005), K.cream); if (y < -0.24 && z > -0.2) ink(c, 0.35 * smooth(-0.24, -0.42, y) * smooth(-0.2, 0, z), K.creamD);
    // 眼睛周圍：眉上的淺色斑、眼眶的黑邊、內眼角往下的一道
    if (z > 0.1 && y > -0.25 && y < 0.3) { const dx = ax - EC[0], dy = p[1] - EC[1], dz = p[2] - EC[2], a = dx * ex[0] + dy * ex[1] + dz * ex[2], b = dx * ey[0] + dy * ey[1] + dz * ey[2];
      if (a * a + b * b < 0.06) { const a2 = (a - 0.012) * cBT + (b - 0.134) * sBT, b2 = -(a - 0.012) * sBT + (b - 0.134) * cBT;
        ink(c, (E ? 0.6 : 1) * cov((h2(a2 / 0.095, b2 / 0.026) - 1) * 0.026, 0.005), K.cream);
        ink(c, cov((h2(a / 0.112, b / 0.103) - 1) * 0.1, 0.005), K.stripe);
        ink(c, cov(wedge(-0.05 - b, a + 0.07 - 0.25 * (-0.05 - b), 0.14, 0.018, 0.9), 0.005), K.stripe); } }
    // 鼻樑上兩道皺紋（齜牙時擠出來的）
    if (z > 0.3 && ax < 0.1 && y > -0.02 && y < 0.14) { let k = 0; for (let i = 0; i < 2; i++) k = Math.max(k, cov(Math.max(abs(y - 0.03 - i * 0.04 - 0.5 * (ax - 0.02)) - 0.0075, 0.016 - ax, ax - 0.078 + i * 0.014), 0.004)); ink(c, 0.8 * k, K.stripe); }
    // 頭頂的「王」字：中間一道，橫著幾道往兩邊收尖
    if ((y > -0.1 || z < 0) && ax < 0.24) {
      const s = Math.atan2(z, y) * 0.42; let k = cov(Math.max(ax - 0.026 * smooth(0.52, 0.4, s), s - 0.52, -0.6 - s), 0.005);
      for (let i = 0; i < HBAR.length; i += 4) { const b = s - HBAR[i] + HBAR[i + 3] * ax; if (abs(b) < 0.04) k = Math.max(k, cov(wedge(ax, b, HBAR[i + 1], HBAR[i + 2], 0.7), 0.005)); }
      ink(c, k, K.stripe);
    }
    // 兩頰與後腦的黑紋：從外側往臉中間收尖
    if (ax > 0.2 && y > -0.32 && y < 0.3) { const lon = Math.atan2(ax, z) * 0.5; let k = 0;
      for (let i = 0; i < HCHK.length; i += 5) { const a = HCHK[i] - lon, b = y - HCHK[i + 1] - HCHK[i + 4] * a; if (abs(b) < 0.05) k = Math.max(k, cov(wedge(a, b, HCHK[i + 2], HCHK[i + 3], 0.75, 0.1), 0.006)); }
      ink(c, k, K.stripe); }
    // 嘴：鼻子下面的人中、黑色的唇、被下顎蓋住的口腔
    if (z > 0.3 && y < -0.09 && y > -0.24) ink(c, cov(ax - 0.007, 0.004), K.nose);
    if (n[1] < 0.35 && y < -0.17) { const e = (h2(x / 0.17, (z - 0.3) / 0.215) - 1) * 0.17; ink(c, cov(e - 0.014, 0.005), K.nose); ink(c, cov(e + 0.008), K.mouth); }
  };
  // 下顎：比樣品寬厚；黑唇、口腔、舌頭
  const jaw = ball('jaw', 14, 7, [0.185, 0.095, 0.2]); push(jaw, [0, 0.09, 0.0], [0.16, 0.09, 0.18], [0, -0.03, 0]); place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [128, 80]; add(jaw);
  jaw.paint = (c, p, n) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.cream); ink(c, 0.3 * smooth(0, -0.09, y), K.creamD);
    if (y > 0.015) { const e = (h2(x / 0.145, z / 0.165) - 1) * 0.145; ink(c, cov(e - 0.018), K.nose); ink(c, cov(e), K.mouth); ink(c, cov((h2(x / 0.075, (z - 0.01) / 0.11) - 1) * 0.075), K.tongue); } };
  // 鼻子：倒三角
  { const h = surf(head, HC, norm3([0, -0.03, 1])), nose = ball('nose', 10, 5, [0.078, 0.05, 0.04]); nose.map(p => { p[0] *= 1 + 0.4 * p[1] / 0.05; }); place(nose, add3(h.p, [0, 0.005, -0.012])); nose.sk = B.head; nose.col = K.nose; nose.tex = [16, 16]; add(nose); }
  // 牙：上犬齒露在嘴外（影牙的是刀狀的長牙，往後彎）；上下各一對小門牙、下犬齒，嘴微張時看得到
  { const lip = (x, z) => (surf(head, hd(x, -0.9, z), [0, 1, 0]) || { p: hd(x, -0.24, z) }).p, jt = (x, z) => (surf(jaw, [x, JC[1] + 0.6, JC[2] + z], [0, -1, 0]) || { p: [x, JC[1] + 0.06, JC[2] + z] }).p;
    const tp = (c, p, n, u, v) => { put(c, K.tooth); ink(c, 0.55 * smooth(0.4, 0, v), K.toothD); };
    const fl = E ? 0.31 : 0.18, b = lip(0.124, 0.43), fu = horn('fangL', 6, [add3(b, [0, 0.035, 0]), add3(b, [0.01, -fl * 0.38, 0.03]), add3(b, [0.012, -fl * 0.76, 0.026 - fl * 0.02]), add3(b, [0.004, -fl, -0.004 - fl * 0.12])], E ? 0.05 : 0.043, { flat: E ? 0.62 : 0.85, pw: E ? 0.7 : 0.85, nv: E ? 6 : 5 });
    fu.sk = B.head; fu.tex = [16, 48]; fu.paint = tp; add(fu); add(mirrorX(fu, 'fangR')).sk = B.head;
    const b2 = lip(0.045, 0.5), iu = cone('incL', 4, add3(b2, [0, 0.02, -0.005]), add3(b2, [0, -0.012, 0]), add3(b2, [0, -0.032, -0.004]), 0.026); iu.sk = B.head; iu.col = K.tooth; add(iu); add(mirrorX(iu, 'incR')).sk = B.head;
    const b3 = jt(0.108, 0.105), fd = cone('fangLd', 5, add3(b3, [0, -0.03, 0]), add3(b3, [0.002, 0.034, 0.006]), add3(b3, [0.002, 0.072, 0.004]), 0.033); fd.sk = B.jaw; fd.col = K.tooth; add(fd); add(mirrorX(fd, 'fangRd')).sk = B.jaw;
    const b4 = jt(0.042, 0.158), id = cone('incLd', 4, add3(b4, [0, -0.02, 0]), add3(b4, [0, 0.014, 0.002]), add3(b4, [0, 0.034, 0]), 0.025); id.sk = B.jaw; id.col = K.tooth; add(id); add(mirrorX(id, 'incRd')).sk = B.jaw; }
  // 耳朵：猛虎是厚厚的圓耳（比樣品小、往外後方倒）；影牙是尖耳。背面深色帶一塊淺斑
  { const er = E ? [0.15, 0.2, 0.07] : [0.15, 0.158, 0.07], ear = ball('earL', 12, 6, er); push(ear, [0, -0.01, 0.075], 0.12, [0, 0, -0.046], false); ear.map(p => { const t = Math.max(0, p[1] / er[1]); p[0] *= 1 - (E ? 0.66 * Math.pow(t, 1.3) : 0.22 * t); });
    place(ear, hd(E ? 0.36 : 0.375, E ? 0.365 : 0.345, -0.09), E ? [-0.28, 0.5, -0.4] : [-0.3, 0.55, -0.56]); ear.sk = B.earL; ear.tex = [96, 64];
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1] + 0.12); put(c, K.stripe); if (d[2] > 0) ink(c, cov((r - 0.62) * 0.15), K.earIn); else { ink(c, smooth(0.2, -0.75, d[1]) * 0.85, K.furD); ink(c, cov((h2(d[0], d[1] - 0.1) - 0.34) * 0.15), K.cream); } };
    add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 眼睛：扁扁的黃眼珠、細長的黑瞳孔，上面壓著一條粗黑的眉（比樣品粗、內側壓得更低）
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR), mir = p => [-p[0], p[1], p[2]];
  const X = {};
  { X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(0, -0.004, 0.014), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(0, -0.004, 0.014)), eqR);
    X.browL = sk.bone('browL', B.head, eloc(0.005, 0.06, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.005, 0.06, 0.014)), eqR);
    const ek = E ? 1.1 : 1, eye = ball('eyeL', 10, 3, [0.096 * ek, 0.088 * ek, 0.023], { vmax: 0.6 }); place(eye, eloc(0, 0, -0.007), [ex, ey, ez]); eye.sk = X.eyeL; eye.tex = [48, 32]; eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.iris); ink(c, smooth(0.4, 0.95, r) * 0.85, K.irisD); if (d[2] < 0.12 || d[1] * 0.088 > 0.06 + 0.36 * d[0] * 0.096) put(c, K.stripe); };      // 眉毛蓋住的上半是深色的眼皮
    add(eye); add(mirrorX(eye, 'eyeR')).sk = X.eyeR;
    const pup = ball('pupL', 8, 2, [E ? 0.022 : 0.019, 0.05, 0.007], { vmax: 0.5 }); place(pup, eloc(0, -0.004, 0.0135), [ex, ey, ez]); pup.sk = X.pupL; pup.col = K.pupil; add(pup); add(mirrorX(pup, 'pupR')).sk = X.pupR;
    const bk = E ? 1.16 : 1, br = tubeP('browL', 6, [{ p: [-0.112, 0.022, 0.014], rx: 0.026, ry: 0.034 * bk }, { p: [0.0, 0.068, 0.02], rx: 0.034, ry: 0.041 * bk }, { p: [0.122, 0.116, 0.004], rx: 0.018, ry: 0.017 * bk }], { ref: [0, 0, 1], capA: 0.024, capB: 0.02, capN: 1 }); place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = K.stripe; add(br); add(mirrorX(br, 'browR')).sk = X.browR; }
  // 兩頰的毛簇：三撮往後掃的尖毛，連在臉的輪廓上
  { const tf = (name, d, tip, side, hw, th, col) => { const h = surf(head, HC, norm3(d)), s = tuft(name, add3(h.p, norm3(d), -0.09), hd(...tip), side, hw, th, { up: [1, 0, 0.25], bow: 0.22, nu: 8, pr: [0.9, 1, 0.55, 0.03] }); s.sk = B.head; s.col = col; s.blend = [head, 0.1]; add(s); const m = add(mirrorX(s, name + 'R')); m.sk = B.head; m.blend = [head, 0.1]; };
    if (E) tf('chk0', [1, 0.16, -0.14], [0.6, 0.07, -0.4], [0.1, 1, 0], 0.1, 0.06, K.furD);
    tf('chk1', [1, -0.1, -0.02], E ? [0.68, -0.16, -0.33] : [0.66, -0.15, -0.28], [0.15, 1, 0], 0.125, 0.068, K.fur);
    tf('chk2', [1, -0.46, 0.0], E ? [0.63, -0.36, -0.3] : [0.61, -0.34, -0.26], [0.4, 1, 0], 0.12, 0.068, E ? K.creamD : K.cream); }

  /* ----- 身體：肩峰高過頭頂、背線往臀部斜下去，腰略收、臀圓 ----- */
  const hu = E ? 1.1 : 1;
  const body = tubeP('body', 20, [{ p: [0, 0.65, -0.56], rx: 0.27, ry: 0.26, rd: 0.22, wt: 0.88 }, { p: [0, 0.665, -0.38], rx: 0.385, ry: 0.345, rd: 0.3, wt: 0.86 }, { p: [0, 0.68, -0.14], rx: E ? 0.39 : 0.4, ry: 0.385, rd: 0.33, wt: 0.84 }, { p: [0, 0.7, 0.08], rx: 0.44 * (E ? 1.04 : 1), ry: 0.47 * hu, rd: 0.335, wt: 0.84 }, { p: [0, 0.72, 0.27], rx: 0.43 * (E ? 1.05 : 1), ry: 0.5 * hu, rd: 0.31, wt: 0.86 }, { p: [0, 0.74, 0.46], rx: 0.31, ry: 0.36, rd: 0.26 }], { nv: 11, capA: 0.13, capB: 0.12 });
  push(body, [0.27, 1.02, 0.2], 0.28, [0.04, 0.035, 0]);                        // 肩胛
  finish(body); body.tex = [448, 256]; add(body);
  body.sk = p => { const t = smooth(-0.36, 0.1, p[2]), nk = 0.5 * smooth(0.3, 0.55, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  // 背上往下收尖的紋（位置、半寬、長、斜度）；肚邊往上收尖的紋（位置、半寬、長）
  const TOP = E ? [-0.6, 0.06, 1.3, -0.04, -0.45, 0.05, 0.8, 0.03, -0.3, 0.066, 1.5, 0.04, -0.14, 0.052, 0.85, 0, 0.02, 0.07, 1.55, -0.02, 0.17, 0.054, 0.9, -0.04, 0.3, 0.07, 1.45, 0.03, 0.43, 0.05, 0.9, 0]
    : [-0.55, 0.064, 1.25, -0.04, -0.35, 0.068, 1.0, 0.04, -0.15, 0.072, 1.4, 0.0, 0.05, 0.068, 0.95, -0.04, 0.24, 0.074, 1.35, 0.03, 0.41, 0.056, 0.9, 0];
  const BOT = E ? [-0.52, 0.05, 0.8, -0.37, 0.05, 1.0, -0.22, 0.052, 0.8, -0.06, 0.05, 1.0, 0.1, 0.052, 0.8] : [-0.45, 0.054, 0.8, -0.25, 0.056, 0.85, -0.05, 0.054, 0.75, 0.145, 0.056, 0.8];
  body.paint = (c, p, n, u) => {
    const al = abs(u - 0.5) * TAU, z = p[2], ab = 2.12 - 0.65 * smooth(0.18, 0.45, z);
    put(c, K.fur); ink(c, 0.6 * smooth(1.15, 0.15, al), K.furD); ink(c, 0.5 * smooth(1.2, 2.0, al), K.furL);
    let k = 0;
    for (let i = 0; i < TOP.length; i += 4) { const b = z - TOP[i] - TOP[i + 3] * al; if (abs(b) < 0.09) k = Math.max(k, cov(wedge(al, b, TOP[i + 2], TOP[i + 1], 0.75), 0.008)); }
    for (let i = 0; i < BOT.length; i += 3) { const b = z - BOT[i]; if (abs(b) < 0.07) k = Math.max(k, cov(wedge(ab + 0.06 - al, b, BOT[i + 2], BOT[i + 1], 0.8), 0.008)); }
    ink(c, k, K.stripe);
    ink(c, cov((ab - al) * 0.33, 0.008), K.cream); ink(c, 0.3 * smooth(2.5, 3.1, al), K.creamD);
  };
  // 背脊的毛簇：從頸後到肩峰（影牙一路到臀），生氣時整排豎得更高
  ridge(add, body, E ? [0.37, 0.22, 0.05, -0.13, -0.31, -0.48] : [0.35, 0.19, 0.01, -0.18], E ? [0.15, 0.21, 0.2, 0.17, 0.14, 0.11] : [0.11, 0.16, 0.14, 0.1], { name: 'sp', col: K.stripe, hw: i => (E ? [0.11, 0.13, 0.13, 0.12, 0.11, 0.1] : [0.1, 0.125, 0.12, 0.1])[i], th: 0.06, lean: 0.95, bow: 0.16, follow: E ? [1, 1, 1, 0.7, 0.4, 0.25] : [1, 1, 1, 0.6] });
  for (const s of [1, -1]) ridge(add, body, E ? [0.3, 0.13] : [0.27], E ? [0.15, 0.14] : [0.115], { name: 'ss' + s, x: 0.17 * s, out: 0.7 * s, col: K.stripe, hw: 0.095, th: 0.055, lean: 0.95, bow: 0.16 });

  /* ----- 四條腿：前腳粗壯、站得開；腳掌大、爪子長 ----- */
  const legPaint = (bands, sock) => (c, p, n) => {
    const y = p[1], out = n[0]; put(c, K.fur); ink(c, 0.4 * smooth(0.2, -0.6, out), K.furL);
    let k = 0; const wk = smooth(-0.55, 0.5, out - 0.35 * n[2]); for (let i = 0; i < bands.length; i += 2) k = Math.max(k, cov(abs(y - bands[i] - 0.03 * n[2]) - bands[i + 1] * wk, 0.008)); ink(c, k, K.stripe);
    ink(c, cov(y - sock - 0.012 * sin(Math.atan2(n[2], n[0]) * 3), 0.008), K.paw);
  };
  const pawPaint = (pc, hw) => (c, p, n) => { const x = p[0] - pc[0], z = p[2] - pc[2]; put(c, K.paw); ink(c, 0.25 * smooth(0.04, 0, p[1]), K.pawD); if (z > 0.03 && p[1] > 0.03) ink(c, 0.75 * Math.max(cov(abs(x - hw * 0.34) - 0.008), cov(abs(x + hw * 0.34) - 0.008)), K.pawD); };
  const mkLeg = (name, keys, J, li, pawC, pawR, bands, sock, claw) => {
    const leg = tubeP(name, 12, keys, { nv: 6, capA: 0.13, capN: 2 }); leg.tex = [128, 128]; leg.paint = legPaint(bands, sock); leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.06); leg.blend = [body, 0.14]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.06); lr.blend = [body, 0.14];
    const paw = ball(name + 'paw', 10, 5, pawR); paw.map(p => { p[0] *= 1 + 0.14 * smooth(-0.3, 0.8, p[2] / pawR[2]); if (p[1] < -pawR[1] * 0.82) p[1] = -pawR[1] * 0.82; }); place(paw, pawC); paw.tex = [64, 48]; paw.paint = pawPaint(pawC, pawR[0]); paw.sk = Lg(li) + 2; add(paw); add(mirrorX(paw, name + 'pawR')).sk = Lg(li + 1) + 2;
    for (const o of [-0.62, 0, 0.62]) { const zf = pawC[2] + pawR[2] * (0.84 - 0.12 * abs(o)), x = pawC[0] + o * pawR[0], cl = horn(name + 'cl' + o, 4, [[x, 0.085, zf - 0.035], [x + o * 0.006, 0.07, zf + claw * 0.5], [x + o * 0.012, 0.012, zf + claw]], claw * 0.6, { ref: [1, 0, 0], tip: 0.12 }); cl.sk = Lg(li) + 2; cl.col = K.claw; cl.tex = [8, 8]; add(cl); add(mirrorX(cl, name + 'clR' + o)).sk = Lg(li + 1) + 2; }
  };
  const lf = E ? 1.07 : 1, sock = E ? 0.1 : 0.15;
  mkLeg('fl', [{ p: [0.27, 0.74, 0.25], rx: 0.185 * lf, ry: 0.215 * lf }, { p: [0.305, 0.56, 0.245], rx: 0.19 * lf, ry: 0.2 * lf }, { p: [0.33, 0.38, 0.19], rx: 0.172 * lf, ry: 0.178 * lf }, { p: [0.345, 0.2, 0.215], rx: 0.162 * lf, ry: 0.168 * lf, rd: 0.16 * lf }, { p: [0.345, 0.07, 0.245], rx: 0.17 * lf, ry: 0.176 * lf, rd: 0.164 * lf }], FJ, 0, [0.345, 0.102, 0.325], [0.2 * lf, 0.125, 0.235 * lf], [0.68, 0.036, 0.52, 0.036, 0.36, 0.032], sock, E ? 0.085 : 0.075);
  mkLeg('rl', [{ p: [0.25, 0.7, -0.44], rx: 0.195, ry: 0.23, rd: 0.215 }, { p: [0.28, 0.53, -0.4], rx: 0.19, ry: 0.215, rd: 0.185 }, { p: [0.295, 0.37, -0.365], rx: 0.158, ry: 0.168, rd: 0.152 }, { p: [0.31, 0.2, -0.445], rx: 0.142, ry: 0.148 }, { p: [0.31, 0.07, -0.43], rx: 0.148, ry: 0.153, rd: 0.138 }], RJ, 2, [0.31, 0.09, -0.365], [0.175, 0.11, 0.205], [0.72, 0.036, 0.56, 0.038, 0.42, 0.034, 0.29, 0.028], sock - 0.02, E ? 0.07 : 0.062);

  /* ----- 尾巴：粗、末端上勾，一圈一圈的黑環，尾端一截全黑 ----- */
  { const tail = tubeP('tail', 8, TK.map(k => ({ p: [0, k[0], k[1]], rx: k[2], ry: k[2] })), { nv: 12, capB: 0.085, capN: 2, seam: PI / 2 }); tail.tex = [48, 160];
    tail.sk = (p, i, j, pt) => { const s = pt.rows[j].t * 5, k = clamp(Math.round(s), 1, 4), w = smooth(k - 0.32, k + 0.32, s); return [B.tail + k - 1, 1 - w, B.tail + k, w]; };
    tail.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), t = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0); put(c, K.fur); ink(c, 0.35, n[1] < 0 ? K.furL : K.furD);
      let k = cov((E ? 0.78 : 0.86) - t, 0.02); for (let i = 0; i < 4; i++) k = Math.max(k, cov(abs(t - 0.2 - i * 0.175) - 0.036, 0.012)); ink(c, k, K.stripe); };
    tail.blend = [body, 0.12]; add(tail); }

  // 凹處的陰影：用幾顆球代表頭、身體、腿
  const AO = [{ id: 'head', c: HC, r: 0.47 }, { id: 'body', c: [0, 0.7, 0.2], r: 0.43 }, { id: 'body', c: [0, 0.67, -0.15], r: 0.38 }, { id: 'body', c: [0, 0.65, -0.42], r: 0.35 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.31 * s, 0.5, 0.24], r: 0.19 }, { id: 'rl', c: [0.28 * s, 0.52, -0.41], r: 0.2 });
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: 5, X, bg: K.fur, eyeCol: E ? [1.0, 0.72, 0.08] : [1.0, 0.6, 0.06],
    ao: (p, n, pt) => Math.min(0.45, occl(p, n, AO, pt.name.replace(/R$|paw$/, '')) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(0.45, 0.08, p[1])),
    S: { k: 1.365, run: 4.4, stride: 0.5, lift: 0.11, bob: 0.04, cad: 1.25, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.7, jawMax: 0.62, maneUp: 0.02, wag: 1.2, wagAmp: 0.3, halfW: 0.44, tailRun: 0.35, low: 0.1, u: 0.65, jump: 0.75, jaw0: 0.2, reach: 0.45, elastic: 1, maneK: 0.22,
      pose(T, q) {
        // 伏擊：遠遠地慢慢靠近時壓低身子、頭往前探、尾巴放低；迴身尾掃：尾巴甩直了掃出去
        if (q.st === ST.CHASE) { const r = q.sp / q.m.run, k = smooth(0.66, 0.5, r) * smooth(0.1, 0.3, r); T.by -= 0.1 * k; T.np += 0.1 * k; T.hp -= 0.12 * k; T.cp += 0.05 * k; T.tp -= 0.3 * k; T.tc -= 0.12 * k; T.eL = T.eR = Math.max(T.eL, k); }
        if (q.an === 'spin' && q.st === ST.STRIKE) { T.tp = 0.2; T.tc = -0.32; T.tw = -0.85 * q.sd; }
        // 低撲（直線的那一招）貼著地面竄出去，不像飛撲那樣高高躍起
        if (q.an === 'pounce' && q.st === ST.STRIKE && (q.v.M ? q.v.M.shape === 'line' : q.act.strike < 0.36)) { T.rigY *= 0.4; T.rigP *= 0.55; }
      } } };
};

/* ---------- 灰狼（0.8 照參考圖重做）：藍灰身體、奶油口吻與腳、兩頰一圈蓬毛、尖耳（耳尖黑）、額頭沒有角；背上是一層一層圓鈍往後順的毛鎖（不是尖刺）、又大又蓬的尾巴、四爪著地、爪子黑而清楚。
   臉：直接把參考圖的臉剪下來當貼圖（平常＝瞇眼閉嘴、生氣＝齜牙；見 wolfFaceGrid／attachWolfFace），所以頭上沒有程序化的眼睛、眉、牙列（上下犬齒留著當側面的輪廓）。
   菁英「頭狼・霜背」：背上一整片霜白長鬃（鎖更大更多）、尾端泛冰藍、眼角一道藍白疤（畫在臉貼圖上，疤旁那隻眼冰藍）。骨名、姿勢、size 都沒動。 ---------- */
SOFT.wolf = elite => {
  const K = elite
    ? { fur: rgb(0x7c8198), furD: rgb(0x5d6278), furL: rgb(0x9ca2ba), cream: rgb(0xe4e4ec), creamD: rgb(0xaeb2c4), dark: rgb(0x23252e), frost: rgb(0xdde2f1), frostD: rgb(0x98a5cb), ice: rgb(0xb9dafc), iceD: rgb(0x6f9ed8), nose: rgb(0x121318), mouth: rgb(0x5e1a28), tongue: rgb(0xb85868), tooth: rgb(0xfffaf0), claw: rgb(0x16171c), earIn: rgb(0xb7adb4), paw: rgb(0xe9e2dc), pawD: rgb(0xb7aea8) }
    : { fur: rgb(0x868aa1), furD: rgb(0x666a80), furL: rgb(0xa6aabe), cream: rgb(0xede4d2), creamD: rgb(0xc3b8a4), dark: rgb(0x2b2c34), nose: rgb(0x151419), mouth: rgb(0x6a1c26), tongue: rgb(0xc05a68), tooth: rgb(0xfff6e2), claw: rgb(0x16161b), earIn: rgb(0xd8c8ba), paw: rgb(0xf3e9d6), pawD: rgb(0xc9bda8) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.84, 0.74], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const zz = (s, f) => { const q = s * f - Math.floor(s * f); return abs(q - 0.5) * 2; };      // 鋸齒：毛色交界不畫成直線
  const FJ = { j0: [0.23, 0.58, 0.3], j1: [0.24, 0.36, 0.19], j2: [0.24, 0.12, 0.27], pad: [0.24, 0, 0.33] }, RJ = { j0: [0.22, 0.6, -0.36], j1: [0.24, 0.39, -0.23], j2: [0.24, 0.18, -0.43], pad: [0.24, 0, -0.35] };
  /* 尾巴：大而蓬、從臀部往後上方翹起（y,z,半徑） */
  const TK = [[0.77, -0.52, 0.13], [0.76, -0.74, 0.25], [0.74, -0.95, 0.32], [0.72, -1.13, 0.3], [0.72, -1.28, 0.2], [0.74, -1.38, 0.03]], TN = 4;
  const sk = softSkel({ body: [0, 0.67, -0.06], pelvis: [0, 0.69, -0.34], chest: [0, 0.69, 0.14], neck: [0, 0.78, 0.4], head: [0, 0.82, 0.56], jaw: hd(0, -0.17, 0.1), ear: hd(0.25, 0.25, -0.06), mane: [0, 0.97, 0.22], fl: FJ, rl: RJ, tail: TK.slice(0, TN).map(k => [0, k[0], k[1]]), mane2: [0, 1.02, 0.46] });
  const BN = sk.BN, Lg = i => B.leg + i * 3, mir = p => [-p[0], p[1], p[2]];
  /* 毛鎖：一組一塊共用貼圖（底深、尖淺） */
  const LGR = {}, LK = [];
  const lockPaint = (a, b, c2) => (c, p, n, u, v) => { put(c, a); ink(c, smooth(0.05, 0.6, v), b); ink(c, 0.8 * smooth(0.55, 1.0, v), c2); };
  const lockGrp = (pt, g, paintFn) => { if (!LGR[g]) { LGR[g] = pt; pt.tex = [16, 32]; pt.paint = paintFn; } LK.push([pt, g]); return pt; };
  /* 圓頭的毛鎖（花瓣狀）：底在 base、尖在 tip，先往上鼓再掃向尖端；末端用半橢圓收圓，不是尖的 */
  const mkLock = (name, base, tip, side, hw, th, g, paintFn, o = {}) => {
    const d = sub3(tip, base), L = hyp(d[0], d[1], d[2]), t = norm3(d), ctl = add3(add3(mid3(base, tip, 0.4), o.up || [0, 1, 0], (o.bow ?? 0.22) * L), side, (o.sw || 0) * hw), q = s => mid3(mid3(base, ctl, s), mid3(ctl, tip, s), s), pr = o.pr || [0.85, 1, 0.9, 0.42];
    return lockGrp(tubeP(name, o.nu ?? 10, [0, 0.33, 0.66, 1].map((s, i) => ({ p: q(s), rx: th * pr[i], ry: hw * pr[i] })), { ref: cross3(side, t), capB: o.cap ?? hw * 0.95, capN: 3 }), g, paintFn);
  };

  /* ----- 頭：寬而扁的圓頭；臉由貼圖負責，吻部是低一點、短一點、往前下方的一截 ----- */
  const head = ball('head', 26, 15, [0.4, 0.36, 0.4], { vmap: t => Math.pow(t, 1.15) });
  head.map(p => { p[0] *= 1 - 0.1 * smooth(0.0, 0.36, p[1]); });                 // 上窄下寬
  push(head, [0.3, -0.12, -0.02], 0.34, [0.07, -0.03, 0]);                       // 兩頰往外下鼓
  push(head, [0, 0.33, -0.04], [0.5, 0.2, 0.45], [0, -0.03, 0]);                 // 頭頂壓平
  push(head, [0, -0.1, 0.34], [0.26, 0.19, 0.22], [0, -0.03, 0.06]);             // 吻根
  place(head, HC); finish(head); head.sk = B.head; head.tex = [192, 128]; add(head);
  const eh = surf(head, HC, norm3([0.205, 0.03, 0.32])), ez = norm3(add3(eh.n, [0.1, 0, 0.5])), ex0 = norm3(cross3([0, 1, 0], ez)), ey0 = cross3(ez, ex0), cT = cos(0.2), sT = sin(0.2);
  const ex = [0, 1, 2].map(i => ex0[i] * cT + ey0[i] * sT), ey = [0, 1, 2].map(i => ey0[i] * cT - ex0[i] * sT), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR), X = {};
  /* 眼睛與眉的骨頭留著（動作程式會動它們），但眼、眉、瞳孔的網格拿掉了：眼睛在臉貼圖上 */
  X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(-0.006, -0.016, 0.012), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(-0.006, -0.016, 0.012)), eqR);
  X.browL = sk.bone('browL', B.head, eloc(0.005, 0.06, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.005, 0.06, 0.014)), eqR);
  // 臉的毛色（頭與吻部共用，座標以頭的中心為原點）：側面看得到的部分；正面被臉貼圖蓋住
  const Yb = ax => ax < 0.1 ? lerp(-0.08, -0.005, smooth(0, 0.1, ax)) : -0.005 - 0.25 * smooth(0.1, 0.45, ax);
  const face = (c, x, y, z) => {
    const ax = abs(x);
    put(c, K.fur); ink(c, 0.5 * smooth(0.06, 0.3, y), K.furD);
    ink(c, cov(Math.max(y - Yb(ax), -0.14 - 2.5 * Math.max(0, -0.1 - y) - z), 0.006), K.cream);
    if (y < -0.2) ink(c, 0.3 * smooth(-0.2, -0.36, y), K.creamD);
  };
  head.paint = (c, p, n) => {
    const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2];
    face(c, x, y, z);
    if (n[1] < -0.2 && y < -0.18 && z > 0.05) ink(c, cov((h2(x / 0.1, (z - 0.26) / 0.2) - 1) * 0.1 + 0.004), K.mouth);
  };
  // 吻部：短而低、往前下方；上面灰、側面與下面奶油色
  const snout = tubeP('snout', 12, [{ p: hd(0, -0.1, 0.18), rx: 0.2, ry: 0.15, rd: 0.12 }, { p: hd(0, -0.14, 0.34), rx: 0.15, ry: 0.105, rd: 0.09, e: 0.85 }, { p: hd(0, -0.16, 0.46), rx: 0.12, ry: 0.085, rd: 0.07, e: 0.85 }], { nv: 5, capB: 0.06, capN: 2 });
  snout.sk = B.head; snout.tex = [128, 80]; snout.blend = [head, 0.1]; add(snout);
  snout.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x); face(c, x, y, z);
    if (z > 0.44 && y < -0.1) ink(c, cov(ax - 0.006, 0.004), K.nose);
    if (n[1] < -0.6) ink(c, cov((h2(x / 0.12, (z - 0.33) / 0.2) - 1) * 0.1 + 0.004), K.mouth); };
  // 下顎：固定在頭上（張嘴由臉貼圖換成生氣圖），略微垂下
  const JC = hd(0, -0.27, 0.3), jaw = ball('jaw', 12, 7, [0.125, 0.07, 0.19]); push(jaw, [0, 0.07, 0], [0.12, 0.07, 0.18], [0, -0.02, 0]); jaw.map(p => { p[0] *= 1 - 0.2 * smooth(-0.05, 0.19, p[2]); });
  place(jaw, JC, [0.1, 0, 0]); jaw.sk = B.head; jaw.tex = [64, 48]; add(jaw);
  jaw.paint = (c, p, n) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.cream); ink(c, 0.3 * smooth(0, -0.06, y), K.creamD);
    if (y > 0.012) { put(c, K.nose); ink(c, cov((h2(x / 0.1, z / 0.165) - 1) * 0.08), K.mouth); ink(c, cov((h2(x / 0.062, (z - 0.02) / 0.13) - 1) * 0.05), K.tongue); } };
  // 鼻子（黑）
  { const nose = ball('nose', 10, 5, [0.075, 0.055, 0.06]); nose.map(p => { p[0] *= 1 + 0.3 * p[1] / 0.055; }); place(nose, hd(0, -0.135, 0.505)); nose.sk = B.head; nose.col = K.nose; nose.tex = [8, 8]; add(nose); }
  // 犬齒：上面一對露在嘴外、下面一對短的（側面的輪廓；正面被貼圖蓋住）
  { const fl = elite ? 0.12 : 0.1, T2 = (name, a, m, b, r, bone, nu = 4) => { const t = cone(name, nu, a, m, b, r); t.sk = bone; t.col = K.tooth; t.tex = [8, 8]; add(t); add(mirrorX(t, name + 'R')).sk = bone; };
    T2('fang', hd(0.094, -0.19, 0.4), hd(0.098, -0.19 - fl * 0.55, 0.408), hd(0.094, -0.19 - fl, 0.402), elite ? 0.036 : 0.032, B.head, 5);
    T2('fangd', hd(0.05, -0.27, 0.43), hd(0.052, -0.23, 0.434), hd(0.052, -0.195, 0.436), 0.022, B.head); }
  // 耳朵：高而尖，正面凹進去、裡面淺色，外緣與耳尖黑
  const mkEar = (name, base, tip, side, hw, th) => {
    const t = norm3(sub3(tip, base)), L = hyp(...sub3(tip, base)), at = f => add3(base, t, L * f);
    const ear = tubeP(name, 10, [{ p: at(0), rx: hw * 0.86, ry: th, rd: th * 0.5 }, { p: at(0.26), rx: hw, ry: th, rd: th * 0.2 }, { p: at(0.55), rx: hw * 0.74, ry: th * 0.8, rd: th * 0.1 }, { p: at(0.82), rx: hw * 0.36, ry: th * 0.55, rd: th * 0.1 }, { p: at(1), rx: 0.004, ry: 0.004 }], { ref: side, nv: 6, capB: 0.004, capN: 1, seam: PI / 2 });
    ear.tex = [64, 80];
    ear.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), h = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0), front = -cos(TAU * u), b = abs(sin(TAU * u));
      put(c, K.fur); ink(c, 0.9 * smooth(0.3, 0.8, h), K.dark); ink(c, 0.85 * smooth(0.5, 0.85, b) * smooth(0.0, 0.2, h), K.dark); if (front > 0.2) ink(c, cov(Math.max(b - 0.6 + 0.25 * h, 0.1 - h, h - 0.78) * 0.12, 0.012), K.earIn); };
    return ear;
  };
  { const eb = hd(0.25, 0.22, -0.06), et = hd(0.34, 0.62, -0.12), ear = add(mkEar('earL', eb, et, [0.93, -0.2, -0.3], 0.17, 0.058)); ear.sk = B.earL; add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 頭上與兩頰的毛鎖：頭頂中央一撮、兩頰三層（上灰、中下奶油）往外後方蓬開、下巴下面一圈
  { const gH = lockPaint(K.furD, K.fur, K.furL), gC = lockPaint(K.cream, K.cream, elite ? K.frost : rgb(0xf8f3ea));
    const hl = (name, d, tipR, side, hw, th, g, pf, o) => { const nd = norm3(d), h = surf(head, HC, nd); if (!h) return; const s = mkLock(name, add3(h.p, nd, -0.07), hd(...tipR), side, hw, th, g, pf, o); s.sk = B.head; add(s); if (abs(tipR[0]) > 1e-4) { const m2 = add(mirrorX(s, name + 'R')); m2.sk = B.head; } };
    hl('hc0', [0, 1, -0.5], [0, 0.42, -0.3], [1, 0, 0], 0.11, 0.05, 'gH', gH, { bow: 0.1 }); hl('hc1', [0.5, 1, -0.4], [0.15, 0.4, -0.3], [1, 0, 0], 0.09, 0.05, 'gH', gH, { bow: 0.1 }); hl('hc2', [1, 0.7, -0.35], [0.3, 0.3, -0.36], [0.3, 1, 0], 0.09, 0.05, 'gH', gH);
    hl('hc3', [0, 1, 0.25], [0, 0.4, -0.12], [1, 0, 0], 0.1, 0.045, 'gH', gH, { bow: 0.1 }); hl('hc4', [0.5, 1, 0.1], [0.2, 0.38, -0.14], [1, 0, 0], 0.09, 0.045, 'gH', gH, { bow: 0.1 });
    hl('ck0', [1, 0.1, -0.15], [0.38, 0.03, -0.26], [0.2, 1, 0], 0.1, 0.05, 'gH', gH); hl('ck1', [1, -0.25, -0.05], [0.37, -0.28, -0.14], [0.3, 1, 0], 0.11, 0.05, 'gC', gC); hl('ck2', [1, -0.55, 0.0], [0.28, -0.4, -0.06], [0.4, 1, 0], 0.1, 0.05, 'gC', gC);
    hl('cn0', [0, -1, 0.15], [0, -0.5, 0.02], [1, 0, 0], 0.15, 0.06, 'gC', gC, { bow: 0.1 }); hl('cn1', [0.5, -1, 0.1], [0.2, -0.47, -0.02], [1, 0, 0], 0.13, 0.06, 'gC', gC, { bow: 0.1 }); }

  /* ----- 身體：胸深、腰往上收、臀圓；前端往上接到頭後 ----- */
  const body = tubeP('body', 16, [{ p: [0, 0.68, -0.5], rx: 0.23, ry: 0.22, rd: 0.19 }, { p: [0, 0.68, -0.33], rx: 0.31, ry: 0.28, rd: 0.25, wt: 0.9 }, { p: [0, 0.68, -0.07], rx: 0.28, ry: 0.27, rd: 0.225, wt: 0.9 }, { p: [0, 0.67, 0.17], rx: 0.31, ry: 0.31, rd: 0.31, wt: 0.92 }, { p: [0, 0.7, 0.35], rx: 0.31, ry: 0.32, rd: 0.3 }, { p: [0, 0.78, 0.52], rx: 0.27, ry: 0.28, rd: 0.26 }], { nv: 10, capA: 0.17, capB: 0.2, capN: 3 });
  push(body, [0.23, 0.92, 0.25], 0.22, [0.03, 0.025, 0]);                           // 肩胛
  finish(body); body.tex = [320, 192]; add(body);
  body.sk = p => { const t = smooth(-0.3, 0.1, p[2]), nk = 0.6 * smooth(0.3, 0.56, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  body.paint = (c, p, n, u) => {
    const al = abs(u - 0.5) * TAU, z = p[2];
    put(c, K.fur); ink(c, 0.5 * smooth(1.3, 2.1, al), K.furL);
    if (elite) { const e = 1.14 + 0.5 * zz(z + 0.03, 3.6) - 0.25 * smooth(0.3, 0.55, z); ink(c, cov((al - e) * 0.25, 0.008), K.frost); ink(c, 0.55 * smooth(e - 0.5, e, al) * cov((al - e) * 0.25, 0.008), K.frostD); }
    const ab = lerp(2.3, 1.5, smooth(0.26, 0.56, z)) - 0.22 * zz(z + 0.07, 5);
    ink(c, cov((ab - al) * 0.25, 0.008), K.cream); ink(c, 0.3 * smooth(2.6, 3.1, al), K.creamD);
  };
  /* 背上的毛（第二輪）：少而大的幾團柔軟毛團（furBlob）由頸往後順、彼此重疊；底跟著身體、尖端跟著鬃毛的骨頭。霜背：更大、霜白、更蓬 */
  { const gB = elite ? lockPaint(K.frostD, K.frost, K.frost) : lockPaint(K.furD, K.fur, K.furL);
    const bb = (name, z, ang, L, hw, th, o = {}) => { const d = [sin(ang), cos(ang), 0], h = surf(body, [0, 0.7, z], d); if (!h) return; const wgt = body.sk(h.p), tb = z > 0.4 ? sk.mane2 : B.mane, kb = z > -0.1 ? 1 : 0.35, lf = o.lift ?? 0.1, P = (a, b2) => add3(add3(h.p, d, a), [0, 0, -L * b2]);
      const s = lockGrp(furBlob(name, [add3(h.p, d, -0.09), P(0.04 + lf * 0.6, 0.3), P(0.06 + lf, 0.68), add3(P(0.04 + lf, 1.0), [0, o.curl ?? 0.05, 0])], hw, th, { side: norm3(cross3(d, [0, 0, 1])) }), 'gB', gB);
      s.sk = (q, i, j, pt) => { const f = smooth(0.12, 0.8, pt.rows[j].t) * kb; return [wgt[0], wgt[1] * (1 - f), wgt[2], wgt[3] * (1 - f), wgt[4], wgt[5] * (1 - f), tb, f]; }; add(s); if (ang) add(mirrorX(s, name + 'R')).sk = s.sk; return s; };
    const G = elite ? 1.35 : 1.15, HW = elite ? 0.24 : 0.2, TH = elite ? 0.1 : 0.085, lf = elite ? 0.1 : 0.04;
    [[0.5, 0.5], [0.27, 0.56], [0.04, 0.56], [-0.18, 0.52], [-0.38, 0.46]].forEach(([z, l], i) => bb('bk' + i, z, 0, l * G, HW, TH, { lift: lf + 0.02 }));
    [[0.45, 0.46], [0.22, 0.52], [0.0, 0.52], [-0.22, 0.48], [-0.4, 0.42]].forEach(([z, l], i) => bb('bm' + i, z, 0.65, l * G, HW, TH, { lift: lf }));
    [[0.38, 0.4], [0.14, 0.46], [-0.1, 0.46], [-0.32, 0.4]].forEach(([z, l], i) => bb('bs' + i, z, 1.3, l * G, HW * 0.95, TH, { lift: lf * 0.6, curl: 0.02 }));
    if (elite) [[0.55, 0.42, 0], [0.54, 0.4, 0.6], [0.52, 0.34, 1.15]].forEach(([z, l, a], i) => bb('bn' + i, z, a, l, HW, TH, { lift: 0.14 })); }
  // 胸前的毛：一撮一撮往下垂（奶油色）
  { const ch = (name, x, y, tip, hw) => { const d = norm3([x, y, 0.8]), h = surf(body, [0, 0.72, 0.3], d); if (!h) return; const s = mkLock(name, add3(h.p, d, -0.07), tip, [1, 0, 0], hw, 0.06, 'gC2', lockPaint(K.creamD, K.cream, elite ? K.frost : K.cream), { bow: 0.1 }); s.sk = [B.chest, 0.5, B.neck, 0.5]; add(s); if (x) add(mirrorX(s, name + 'R')).sk = s.sk; };
    ch('ch0', 0, -0.6, [0, 0.36, 0.46], 0.12); ch('ch1', 0.5, -0.4, [0.24, 0.42, 0.4], 0.1); }

  /* ----- 四條腿：上段有肉；奶油色的腳掌與小腿、腳掌上四個趾、四根黑爪 ----- */
  const legPaint = sock => (c, p, n) => { put(c, K.fur); ink(c, 0.5 * smooth(0.2, -0.6, n[0]), K.furL); ink(c, cov(p[1] - sock - 0.045 * zz(Math.atan2(n[2], n[0]) / TAU + 0.1, 5), 0.008), K.paw); ink(c, 0.25 * smooth(sock, sock - 0.12, p[1]), K.pawD); };
  const pawPaint = (pc, hw) => (c, p, n) => { const x = p[0] - pc[0], z = p[2] - pc[2]; put(c, K.paw); ink(c, 0.25 * smooth(0.035, 0, p[1]), K.pawD); if (z > -0.03 && p[1] > 0.015) { let g = 0; for (const o of [-0.5, 0, 0.5]) g = Math.max(g, cov(abs(x - hw * o) - 0.006, 0.01)); ink(c, 0.85 * g * smooth(-0.03, 0.04, z), K.pawD); } };
  const mkLeg = (name, keys, J, li, pawC, pawR, sock, claw) => {
    const leg = tubeP(name, 10, keys, { nv: 6, capA: 0.1, capN: 2 }); leg.tex = [96, 112]; leg.paint = legPaint(sock); leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.06); leg.blend = [body, 0.12]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.06); lr.blend = [body, 0.12];
    const paw = ball(name + 'paw', 10, 6, pawR); paw.map(p => { p[0] *= 1 + 0.14 * smooth(-0.3, 0.8, p[2] / pawR[2]); if (p[1] < -pawR[1] * 0.8) p[1] = -pawR[1] * 0.8; }); place(paw, pawC); paw.tex = [56, 40]; paw.paint = pawPaint(pawC, pawR[0]); paw.sk = Lg(li) + 2; add(paw); add(mirrorX(paw, name + 'pawR')).sk = Lg(li + 1) + 2;
    for (const o of [-0.75, -0.25, 0.25, 0.75]) { const zf = pawC[2] + pawR[2] * (0.9 - 0.2 * abs(o)), x = pawC[0] + o * pawR[0] * 0.8, cl = cone(name + 'cl' + o, 4, [x, 0.052, zf - 0.03], [x + o * 0.004, 0.036, zf + claw * 0.5], [x + o * 0.01, 0.008, zf + claw], claw * 0.62, [1, 0, 0]); cl.sk = Lg(li) + 2; cl.col = K.claw; cl.tex = [8, 8]; add(cl); add(mirrorX(cl, name + 'clR' + o)).sk = Lg(li + 1) + 2; }
  };
  mkLeg('fl', [{ p: [0.22, 0.72, 0.3], rx: 0.17, ry: 0.2 }, { p: [0.235, 0.53, 0.29], rx: 0.165, ry: 0.185 }, { p: [0.24, 0.36, 0.24], rx: 0.14, ry: 0.15 }, { p: [0.24, 0.21, 0.262], rx: 0.12, ry: 0.125 }, { p: [0.24, 0.07, 0.278], rx: 0.105, ry: 0.112, rd: 0.105 }], FJ, 0, [0.24, 0.07, 0.34], [0.145, 0.085, 0.18], 0.3, 0.056);
  mkLeg('rl', [{ p: [0.21, 0.72, -0.36], rx: 0.18, ry: 0.22, rd: 0.2 }, { p: [0.23, 0.54, -0.31], rx: 0.175, ry: 0.21, rd: 0.17 }, { p: [0.24, 0.39, -0.27], rx: 0.14, ry: 0.15, rd: 0.12 }, { p: [0.24, 0.28, -0.37], rx: 0.11, ry: 0.115 }, { p: [0.24, 0.18, -0.44], rx: 0.1, ry: 0.105 }, { p: [0.24, 0.07, -0.42], rx: 0.094, ry: 0.098, rd: 0.09 }], RJ, 2, [0.24, 0.066, -0.365], [0.135, 0.082, 0.17], 0.24, 0.052);

  /* ----- 尾巴（第二輪）：粗尾管外面一圈圈柔軟毛團，由根部往後捲、尖端上翹；霜背末端泛冰藍 ----- */
  { const tail = tubeP('tail', 12, TK.map(k => ({ p: [0, k[0], k[1]], rx: k[2], ry: k[2] })), { nv: 11, capB: 0.012, capN: 1, seam: PI / 2 }); tail.tex = [64, 144];
    const tsk = t => { const s = t * (TK.length - 1), k = clamp(Math.round(s), 1, TN - 1), w = smooth(k - 0.32, k + 0.32, s); return [B.tail + k - 1, 1 - w, B.tail + k, w]; };
    tail.sk = (p, i, j, pt) => tsk(pt.rows[j].t);
    tail.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), t = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0);
      put(c, K.fur); ink(c, 0.4 * smooth(-0.1, -0.7, n[1]), K.furL); ink(c, 0.4 * smooth(0.2, 0.8, n[1]), K.furD); if (elite) { ink(c, 0.9 * smooth(0.45, 0.85, t), K.ice); ink(c, 0.5 * smooth(0.45, 0.2, t) * smooth(0.0, 0.6, n[1]), K.furD); } };
    tail.blend = [body, 0.1]; add(tail);
    const tb = (name, i, ang, L, hw, th, curl) => { const k = TK[i], k2 = TK[i + 1], c0 = [0, k[0], k[1]], ax = norm3([0, k2[0] - k[0], k2[1] - k[1]]), d = [sin(ang), cos(ang), 0], base = add3(c0, d, k[2] * 0.7), Q = (a, b2, up) => add3(add3(add3(base, ax, L * a), d, b2), [0, up, 0]);
      const g = 'tl' + i, pf = lockPaint(...(elite ? [[K.furD, K.fur, K.frostD], [K.fur, K.frostD, K.ice], [K.frostD, K.ice, K.ice], [K.ice, K.ice, K.ice]][i - 1] : [[K.furD, K.fur, K.furL], [K.fur, K.furL, K.furL], [K.fur, K.furL, K.furL], [K.fur, K.furL, K.furL]][i - 1]));
      const s = lockGrp(furBlob(name, [Q(0, -0.05, 0), Q(0.35, 0.1, 0.02), Q(0.7, 0.13, curl * 0.4), Q(1.0, 0.08, curl)], hw, th, { side: norm3(cross3(d, ax)) }), g, pf); s.sk = tsk(i / (TK.length - 1)); add(s); if (ang > 0.01 && ang < 3.1) add(mirrorX(s, name + 'R')).sk = s.sk; };
    [[1, 0.32, 0.17, 0.1], [2, 0.36, 0.19, 0.11], [3, 0.32, 0.17, 0.1]].forEach(([i, l, hw, th]) => { [0, 0.95, 1.9, 2.7, 3.1416].forEach((a, j) => tb('tl' + i + '_' + j, i, a + i * 0.25 * (j % 2 ? 1 : 0), l, hw, th, 0.1 + 0.04 * i)); });
  }
  for (const [pt, g] of LK) if (pt !== LGR[g]) pt.share = LGR[g];
  for (const pt of parts) if (pt.share && pt.share.share) pt.share = pt.share.share;

  // 凹處的陰影
  const AO = [{ id: 'head', c: HC, r: 0.4 }, { id: 'body', c: [0, 0.68, 0.26], r: 0.31 }, { id: 'body', c: [0, 0.68, -0.05], r: 0.26 }, { id: 'body', c: [0, 0.68, -0.36], r: 0.28 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.23 * s, 0.46, 0.28], r: 0.15 }, { id: 'rl', c: [0.23 * s, 0.48, -0.33], r: 0.17 });
  const aoId = { snout: 'head', jaw: 'head', flpaw: 'fl', rlpaw: 'rl' };
  for (const pt of parts) if (pt.paint && !pt.share && !LK.some(q => q[0] === pt)) { const f = pt.paint, id = aoId[pt.name] || pt.name, ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.45, occl(p, n, AO, id) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(0.5, 0.1, p[1])); c[0] *= 1 - o * 0.95; c[1] *= 1 - o * 0.95; c[2] *= 1 - o * 0.88; }; }
  const face2 = wolfFaceGrid(parts, HC, { cw: 576, ch: 510, s: 0.00168, ey: 248, ye: 0.03, eyes: [200, 248, 378, 248], tex: elite ? ['wolf_frost_calm.webp', 'wolf_frost_angry.webp'] : ['wolf_calm.webp', 'wolf_angry.webp'] });
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.fur, eyeCol: elite ? [0.5, 0.82, 1.0] : [1.0, 0.62, 0.08], face: face2,
    S: { k: 1.3, run: 5.5, stride: 0.52, lift: 0.11, bob: 0.036, cad: 1.15, graze: 0.45, grazeN: 0.9, grazeH: 0.25, earBack: 0.6, jawMax: 0.6, maneUp: 0.03, wag: 2.2, wagAmp: 0.22, halfW: 0.27, tailRun: 0.6, low: 0.22, howl: 0.5, u: 0.72, jump: 0.8, jaw0: 0.15, reach: 0.35, elastic: 1, maneK: 0.12 } };
};

/* ---------- 鹿（圓潤版，Q 版比例）：大頭寬臉鼓頰、短頸、精簡的身體、短而上粗下細的腿與分瓣的蹄（和猛虎、灰狼同一個頭身級距，只比灰狼略高挑）。
   野性與警戒靠這些表現：大而尖、分叉清楚的粗角（尖端象牙色）、豎起的大耳、深色背線與兩排白斑、白臀與受驚時豎起的白尾、挺胸抬頭的站姿。
   眼神是警覺不是凶：圓的深色大眼、外側露一點眼白、沒有眉；警戒或出招時深色的部分收窄、眼白露得多，逃跑時瞳孔放大、耳朵貼平。狂暴只是瞪大（眼白幾乎不發紅） ---------- */
SOFT.deer = elite => {
  /* 0.8 美術重做（照使用者的參考圖「野鹿 A 四面設定／B 正面臉／C 白冠」）：Q 版大圓頭＋短吻、白口吻白喉；暖橘褐身體、小白點、白腹白臀；
     身體比 0.7 長、腿細長有膝；對稱 Y 字大角（圓鈍、淺米褐，每邊 4 叉）；臉是參考圖剪下來的貼圖（deerFaceGrid；眼、眉、鼻、嘴都在圖上，生氣時換張嘴圖＋紅眼）。 */
  const K = { fur: rgb(0xc47a3e), furD: rgb(0x93552a), furL: rgb(0xd6925a), cream: rgb(0xffeadc), creamD: rgb(0xeed4c4), spot: rgb(0xfbf2e8), dark: rgb(0x3a2415), hoof: rgb(0x2a2220), nose: rgb(0x221a18), mouth: rgb(0x6a2428), tongue: rgb(0xc06a6a), antler: rgb(0xd9a972), antlerT: rgb(0xe6bf8c), iris: rgb(0x54300f), pupil: rgb(0x0e0805), white: rgb(0xf6f0e2), earIn: rgb(0xe9c4b4), antBase: rgb(0xbd8a58) };
  /* 菁英「白冠」：銀白色大角（樹冠形、分岔更多更寬）、頸與胸前一圈白色長鬃毛、頭頂白毛簇、臉上爪疤（在臉貼圖上）、小腿下段白色；毛色深一階 */
  const AX = elite ? 1.5 : 1, AY = elite ? 1.3 : 1, RK = elite ? 1.15 : 1.0, ap = v => AX === 1 ? v : [v[0] * AX, 0.2 + (v[1] - 0.2) * AY, v[2]];
  if (elite) Object.assign(K, { fur: rgb(0xb8703a), furD: rgb(0x84492a), furL: rgb(0xcc8650), antler: rgb(0xd9d6d2), antlerT: rgb(0xf4f2ee), antBase: rgb(0xb4aeaa) });
  const parts = [], add = pt => (parts.push(pt), pt), NK = elite ? 0.14 : 0, HZ = elite ? 0.06 : 0, HC = [0, 1.31 + NK, 0.63 + HZ], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z], mir = p => [-p[0], p[1], p[2]];
  // 腿：細長，兩節 IK（肘／膝在 j1、腕／飛節在 j2），再往下是一小截連著蹄
  const FJ = { j0: [0.17, 0.66, 0.3], j1: [0.172, 0.38, 0.27], j2: [0.172, 0.13, 0.31], pad: [0.172, 0, 0.33] }, RJ = { j0: [0.18, 0.74, -0.42], j1: [0.19, 0.46, -0.3], j2: [0.19, 0.17, -0.4], pad: [0.19, 0, -0.38] };
  const TK = [[0.95, -0.55, 0.1, 0.075], [1.0, -0.68, 0.15, 0.095], [1.06, -0.8, 0.125, 0.075], [1.09, -0.88, 0.04, 0.03]], TN = 2;
  const sk = softSkel({ body: [0, 0.78, -0.05], pelvis: [0, 0.8, -0.38], chest: [0, 0.78, 0.28], neck: [0, 0.96, 0.33], head: [0, 1.17 + NK, 0.55 + HZ], jaw: hd(0, -0.24, 0.12), ear: hd(0.25, 0.17, -0.06), mane: [0, 1.05, 0.3], fl: FJ, rl: RJ, tail: [[0, TK[0][0], TK[0][1]], [0, TK[1][0], TK[1][1]]], mane2: [0, 1.2 + NK, 0.46 + HZ] });
  const BN = sk.BN, Lg = i => B.leg + i * 3;

  /* ----- 頭：寬而圓的 Q 版大頭，上窄下寬、兩頰鼓；吻部短（臉貼圖蓋住眼睛到下巴） ----- */
  const head = ball('head', 40, 24, [0.34, 0.345, 0.33], { vmap: t => Math.pow(t, 1.15) });
  head.map(p => { p[0] *= 1 - 0.1 * smooth(0.0, 0.28, p[1]); });                 // 上窄下寬
  push(head, [0.25, -0.1, 0.02], 0.3, [0.06, -0.025, 0]);                        // 兩頰往外下鼓
  push(head, [0, 0.3, -0.02], [0.42, 0.17, 0.38], [0, -0.016, 0]);               // 頭頂略壓平
  push(head, [0, -0.09, 0.3], [0.2, 0.15, 0.17], [0, -0.01, 0.05]);              // 吻根
  push(head, [0, -0.25, 0.14], [0.24, 0.16, 0.24], [0, -0.05, 0.05]);            // 下巴往下、往前
  place(head, HC); finish(head); head.sk = B.head; head.tex = [448, 288]; add(head);
  const face = (c, x, y, z) => {
    const ax = abs(x);
    put(c, K.fur); ink(c, 0.3 * smooth(0.15, 0.3, y), K.furD);
    const yb = ax < 0.1 ? lerp(-0.1, -0.04, smooth(0.02, 0.1, ax)) : -0.04 - 0.2 * smooth(0.14, 0.36, ax);
    ink(c, cov(Math.max(y - yb, -0.1 - 2.5 * Math.max(0, -0.12 - y) - z), 0.006), K.cream);
    if (y < -0.2) ink(c, 0.3 * smooth(-0.2, -0.34, y), K.creamD);
  };
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2]; face(c, x, y, z); };
  // 吻部：短而圓
  const snout = tubeP('snout', 18, [{ p: hd(0, -0.12, 0.16), rx: 0.18, ry: 0.13, rd: 0.13 }, { p: hd(0, -0.13, 0.29), rx: 0.14, ry: 0.105, rd: 0.105 }, { p: hd(0, -0.135, 0.385), rx: 0.11, ry: 0.085, rd: 0.085, e: 0.9 }], { nv: 8, capB: 0.05, capN: 3 });
  snout.sk = B.head; snout.tex = [128, 80]; snout.blend = [head, 0.1]; add(snout);
  snout.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2]; face(c, x, y, z); };
  // 下顎：薄，收在吻部底下（固定在頭上，張嘴由臉貼圖換圖表現）
  const JC = hd(0, -0.27, 0.2), jaw = ball('jaw', 10, 6, [0.08, 0.04, 0.1]); push(jaw, [0, 0.04, 0], [0.085, 0.04, 0.1], [0, -0.01, 0]); jaw.map(p => { p[0] *= 1 - 0.22 * smooth(-0.05, 0.1, p[2]); });
  place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [64, 40]; add(jaw);
  jaw.paint = (c, p, n) => { put(c, K.cream); };
  // 鼻子：深色鼻頭（貼圖上也有鼻子，這顆墊在下面撐出鼻子的立體）
  { const nose = ball('nose', 10, 5, [0.056, 0.04, 0.036]); nose.map(p => { p[0] *= 1 + 0.3 * p[1] / 0.04; }); place(nose, hd(0, -0.1, 0.4)); nose.sk = B.head; nose.col = K.nose; nose.tex = [8, 8]; add(nose); }
  // 耳朵：大葉片耳，往兩側斜上張開，正面凹、裡面淺粉，耳尖深色
  { const base = hd(0.25, 0.17, -0.06), tip = hd(0.68, 0.38, -0.12), side = [0.5, -0.75, -0.3], hw = 0.2, th = 0.055, t = norm3(sub3(tip, base)), L = hyp(...sub3(tip, base)), at = f => add3(base, t, L * f);
    const ear = tubeP('earL', 14, [{ p: at(0), rx: hw * 0.45, ry: th, rd: th * 0.6 }, { p: at(0.24), rx: hw * 0.84, ry: th, rd: -th * 0.3 }, { p: at(0.5), rx: hw, ry: th * 0.85, rd: -th * 0.45 }, { p: at(0.78), rx: hw * 0.66, ry: th * 0.6, rd: -th * 0.2 }, { p: at(1), rx: 0.004, ry: 0.004 }], { ref: side, nv: 10, capB: 0.004, capN: 2, seam: PI / 2 });
    ear.tex = [64, 80]; ear.sk = B.earL;
    ear.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), h = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0), front = -cos(TAU * u), b = abs(sin(TAU * u));
      put(c, K.fur); ink(c, 0.3 * smooth(0.2, -0.6, front), K.furL); ink(c, 0.5 * smooth(0.8, 0.98, h), K.furD); if (front > 0.15) ink(c, cov(Math.max(b - 0.68 + 0.15 * h, 0.08 - h, h - 0.82) * 0.12, 0.012), K.earIn); };
    add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  /* 眼睛骨頭（共用動作會動到；眼睛本身是臉貼圖，這幾根骨頭上不掛任何東西） */
  const X = {};
  { const q = new THREE.Quaternion(); X.eyeL = sk.bone('eyeL', B.head, hd(0.18, 0, 0.3), q); X.eyeR = sk.bone('eyeR', B.head, hd(-0.18, 0, 0.3), q); X.pupL = sk.bone('pupL', X.eyeL, hd(0.18, 0, 0.3), q); X.pupR = sk.bone('pupR', X.eyeR, hd(-0.18, 0, 0.3), q); X.browL = sk.bone('browL', B.head, hd(0.18, 0.1, 0.3), q); X.browR = sk.bone('browR', B.head, hd(-0.18, 0.1, 0.3), q); }
  if (elite) { const HSC = 0.88; for (const pt of parts) if (/^(head|snout|jaw|nose|earL|earR)$/.test(pt.name)) { pt.map(p => { p[0] = HC[0] + (p[0] - HC[0]) * HSC; p[1] = HC[1] + (p[1] - HC[1]) * HSC; p[2] = HC[2] + (p[2] - HC[2]) * HSC; }); finish(pt); } }
  const FACE = deerFaceGrid(parts, HC, null, elite ? 0.88 : 1);
  /* 角：粗的主幹往外上方長成寬 V 形，圓鈍的尖；四個叉（內側前叉、中段外叉、頂端內叉、後叉），整根同一種淺米褐（菁英多三叉、更寬更高） */
  { const bk = [[0.15, 0.22, -0.02, 0.092], [0.26, 0.38, -0.1, 0.086], [0.38, 0.5, -0.22, 0.078], [0.5, 0.6, -0.36, 0.07], [0.62, 0.68, -0.48, 0.062], [0.7, 0.72, -0.56, 0.055]];
    const beam = tubeP('antL', 10, bk.map(k => ({ p: hd(...ap([k[0], k[1], k[2]])), rx: k[3] * RK, ry: k[3] * RK })), { nv: 14, capB: 0.05, capN: 4, ref: [0, 0, 1] });
    beam.sk = B.head; beam.tex = [16, 64]; beam.paint = (c, p, n, u, v) => { put(c, K.antler); ink(c, 0.5 * smooth(0.22, 0.0, v), K.antBase); ink(c, 0.55 * smooth(0.6, 1.0, v), K.antlerT); }; add(beam); add(mirrorX(beam, 'antR')).sk = B.head;
    let t0 = null;
    const tine = (name, a, m, b, r0, ref) => { const r = r0 * RK, q = s => hd(...ap([0, 1, 2].map(i => (1 - s) * (1 - s) * a[i] + 2 * s * (1 - s) * m[i] + s * s * b[i])));
      const t = tubeP(name, 9, [{ p: q(0), rx: r, ry: r }, { p: q(0.36), rx: r * 0.92, ry: r * 0.92 }, { p: q(0.7), rx: r * 0.8, ry: r * 0.8 }, { p: q(1), rx: r * 0.55, ry: r * 0.55 }], { nv: 8, capB: r * 0.95, capN: 5, ref });
      t.sk = B.head; if (!t0) { t0 = t; t.tex = [16, 32]; t.paint = (c, p, n, u, v) => { put(c, K.antler); ink(c, 0.55 * smooth(0.55, 1.0, v), K.antlerT); }; } else t.share = t0; add(t); const w = add(mirrorX(t, name + 'R')); w.sk = B.head; w.share = t0; };
    tine('tn1', [0.17, 0.3, 0.0], [0.16, 0.46, 0.08], [0.1, 0.62, 0.12], 0.062, [1, 0, 0]);
    tine('tn2', [0.36, 0.49, -0.22], [0.5, 0.56, -0.2], [0.62, 0.66, -0.14], 0.058, [0, 0, 1]);
    tine('tn3', [0.48, 0.59, -0.35], [0.42, 0.74, -0.3], [0.34, 0.9, -0.22], 0.06, [0, 0, 1]);
    tine('tn4', [0.3, 0.43, -0.16], [0.3, 0.56, -0.3], [0.27, 0.68, -0.44], 0.058, [1, 0, 0]);
    if (elite) { tine('tn5', [0.6, 0.67, -0.47], [0.72, 0.8, -0.5], [0.8, 0.95, -0.52], 0.04, [0, 0, 1]); tine('tn6', [0.42, 0.54, -0.3], [0.44, 0.7, -0.18], [0.42, 0.86, -0.1], 0.04, [1, 0, 0]); tine('tn7', [0.2, 0.34, -0.04], [0.26, 0.5, 0.14], [0.22, 0.64, 0.26], 0.04, [1, 0, 0]); } }

  // 胸前白毛的範圍（身體、頸、前腿共用，以模型座標判斷）：從喉下到兩條前腿之間，往下收成圓頭
  const bibK = (p, n) => p[2] < 0.2 ? 0 : cov(Math.max(abs(p[0]) - 0.17 * Math.sqrt(clamp((p[1] - 0.56) / 0.3, 0, 1)), (0.3 - n[2]) * 0.12), 0.008);
  /* ----- 身體：比 0.7 長，胸略深、腰收、臀圓 ----- */
  const body = tubeP('body', 26, [{ p: [0, 0.8, -0.56], rx: 0.2, ry: 0.2, rd: 0.18 }, { p: [0, 0.82, -0.38], rx: 0.26, ry: 0.24, rd: 0.22, wt: 0.9 }, { p: [0, 0.79, -0.1], rx: 0.235, ry: 0.22, rd: 0.2, wt: 0.9 }, { p: [0, 0.78, 0.2], rx: 0.25, ry: 0.235, rd: 0.24, wt: 0.92 }, { p: [0, 0.82, 0.4], rx: 0.215, ry: 0.22, rd: 0.22 }], { nv: 16, capA: 0.11, capB: 0.1, capN: 4 });
  finish(body); body.tex = [384, 224]; add(body);
  body.sk = p => { const t = smooth(-0.3, 0.12, p[2]), nk = 0.4 * smooth(0.28, 0.46, p[2]) * smooth(0.88, 1.05, p[1]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  const SPOT = []; for (let i = 0; i < 5; i++) SPOT.push(-0.4 + i * 0.19, 0.5 + 0.08 * (i % 2), 0.05); for (let i = 0; i < 4; i++) SPOT.push(-0.3 + i * 0.19, 0.98 - 0.08 * (i % 2), 0.042); for (let i = 0; i < 3; i++) SPOT.push(-0.36 + i * 0.22, 1.42, 0.034); SPOT.push(-0.5, 0.9, 0.034, -0.46, 0.3, 0.03);
  body.paint = (c, p, n, u) => {
    const al = abs(u - 0.5) * TAU, z = p[2];
    put(c, K.fur); ink(c, 0.5 * smooth(1.2, 2.0, al), K.furL); ink(c, 0.6 * smooth(0.3, 0.13, al), K.furD);
    let k = 0; for (let i = 0; i < SPOT.length; i += 3) { const dz = z - SPOT[i], da = (al - SPOT[i + 1]) * 0.26; if (abs(dz) < 0.07 && abs(da) < 0.07) k = Math.max(k, cov(h2(dz, da * 1.1) - SPOT[i + 2], 0.006)); } ink(c, k, K.spot);
    ink(c, cov((2.2 + 0.2 * smooth(0.05, 0.3, z) - al) * 0.23, 0.012), K.cream); ink(c, 0.3 * smooth(2.6, 3.1, al), K.creamD); ink(c, bibK(p, n), K.cream);
    if (z < -0.42) { const e = (n[2] + 0.66) * 0.22 + 0.5 * Math.max(0, p[1] - 1.0); ink(c, cov(e - 0.012, 0.008), K.furD); ink(c, cov(e, 0.008), K.cream); }      // 白臀，外圈一道深色
  };
  /* ----- 頸：細長微前傾，後頸接背線，喉下是白的 ----- */
  const neck = tubeP('neck', 18, [{ p: [0, 0.86, 0.3], rx: 0.2, ry: 0.21, rd: 0.22 }, { p: [0, 1.02 + NK * 0.5, 0.44 + HZ * 0.4], rx: 0.15, ry: 0.17, rd: 0.17 }, { p: [0, 1.2 + NK, 0.58 + HZ], rx: 0.13, ry: 0.15, rd: 0.15 }], { nv: 9, capB: 0.08, capN: 3 });
  neck.tex = [112, 96]; neck.blend = [body, 0.12]; add(neck);
  neck.sk = p => { const t = smooth(0.88, 1.06, p[1]), h = 0.5 * smooth(1.1 + NK, 1.26 + NK, p[1]); return [B.chest, 1 - t, B.neck, t * (1 - h), B.head, t * h]; };
  neck.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU; put(c, K.fur); ink(c, 0.6 * smooth(0.36, 0.16, al), K.furD); ink(c, 0.4 * smooth(1.6, 2.2, al), K.furL); ink(c, bibK(p, n), K.cream); };
  // 胸前鼓起來的一團白毛，往下收成圓頭；邊緣落在畫好的白色範圍裡面
  const bib = ball('bib', 18, 11, [0.14, 0.23, 0.095]); bib.map(p => { p[0] *= 1 - 0.5 * smooth(0.02, -0.26, p[1]); });
  place(bib, [0, 0.84, 0.47], [-0.3, 0, 0]); bib.tex = [64, 80]; bib.blend = [body, 0.09]; add(bib);
  bib.sk = p => { const t = 0.7 * smooth(0.85, 1.05, p[1]); return [B.chest, 1 - t, B.neck, t]; };
  bib.paint = (c, p, n) => { put(c, K.cream); ink(c, 0.3 * smooth(0.7, 0.55, p[1]), K.creamD); };

  /* ----- 四條腿：細長，上段有肉、往下收得很細，有膝，蹄分兩瓣、黑色、平貼地 ----- */
  const legPaint = (c, p, n) => { put(c, K.fur); ink(c, 0.6 * smooth(0.25, -0.5, n[0]) * smooth(0.4, 0.58, p[1]), K.cream); ink(c, 0.5 * smooth(0.4, 0.14, p[1]), K.furD); ink(c, bibK(p, n), K.cream);
    if (elite) ink(c, 0.96 * smooth(0.42, 0.34, p[1] - 0.06 * smooth(0.0, 1.0, n[2])), K.white); };      // 菁英：膝下白（參考圖 C）
  const mkLeg = (name, keys, J, li, hc) => {
    const leg = tubeP(name, 12, keys, { nv: 12, capA: 0.08, capN: 3 }); leg.tex = [64, 112]; leg.paint = legPaint; leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.05); leg.blend = [body, 0.1]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.05); lr.blend = [body, 0.1];
    /* 蹄：黑色兩瓣（中間一道縫），各自平貼地面、前端略圓尖 */
    for (const sx of [-1, 1]) { const hf = ball(name + 'hoof' + (sx > 0 ? 'a' : 'b'), 12, 8, [0.034, 0.062, 0.1]); hf.map(p => { const k = Math.max(0, p[1] / 0.062); p[0] *= 1 - 0.25 * k; p[2] *= 1 - 0.3 * k; p[2] += 0.022 * (1 - k); if (p[1] < -0.052) p[1] = -0.052; });
      place(hf, [hc[0] + sx * 0.037, hc[1], hc[2]], [0, sx * 0.1, 0]); hf.sk = Lg(li) + 2; hf.col = K.hoof; hf.tex = [8, 8]; add(hf); add(mirrorX(hf, name + 'hoof' + (sx > 0 ? 'a' : 'b') + 'R')).sk = Lg(li + 1) + 2; }
  };
  mkLeg('fl', [{ p: [0.17, 0.8, 0.3], rx: 0.14, ry: 0.165 }, { p: [0.172, 0.62, 0.29], rx: 0.115, ry: 0.13 }, { p: [0.172, 0.46, 0.277], rx: 0.085, ry: 0.092 }, { p: [0.172, 0.34, 0.278], rx: 0.06, ry: 0.065 }, { p: [0.172, 0.2, 0.295], rx: 0.053, ry: 0.058 }, { p: [0.172, 0.1, 0.312], rx: 0.062, ry: 0.066 }], FJ, 0, [0.172, 0.052, 0.34]);
  mkLeg('rl', [{ p: [0.178, 0.84, -0.4], rx: 0.15, ry: 0.18, rd: 0.16 }, { p: [0.185, 0.64, -0.35], rx: 0.13, ry: 0.155, rd: 0.135 }, { p: [0.19, 0.46, -0.3], rx: 0.092, ry: 0.1, rd: 0.09 }, { p: [0.19, 0.33, -0.345], rx: 0.062, ry: 0.068 }, { p: [0.19, 0.2, -0.395], rx: 0.053, ry: 0.058, rd: 0.064 }, { p: [0.19, 0.1, -0.39], rx: 0.062, ry: 0.066 }], RJ, 2, [0.19, 0.052, -0.37]);

  /* ----- 尾巴：短而翹的一撮，上面是毛色、底下與尾尖白（受驚、逃跑時整支豎起來，露出白的那面） ----- */
  { const tail = tubeP('tail', 8, TK.map(k => ({ p: [0, k[0], k[1]], rx: k[2], ry: k[3] })), { nv: 6, capB: 0.04, capN: 2, seam: PI / 2 }); tail.tex = [48, 64];
    tail.sk = (p, i, j, pt) => { const w = smooth(0.25, 0.6, pt.rows[j].t); return [B.tail, 1 - w, B.tail + 1, w]; };
    tail.paint = (c, p, n, u, v) => { const k = cov((abs(u - 0.5) - 0.2) * 0.3 + (v - 0.74) * 0.2, 0.01); put(c, K.white); ink(c, k, K.fur); ink(c, k * 0.8 * smooth(0.1, 0.02, abs(u - 0.5)), K.furD); }; tail.blend = [body, 0.08]; add(tail); }

  /* ----- 菁英「白冠」的白色長鬃毛（參考圖 C；第二輪改用 furBlob 柔軟毛團）：從兩頰、頸一圈、胸前往下垂、有流向的大羽狀毛（扁長、圓頭、彼此重疊），頭頂一撮往後上方 ----- */
  if (elite) {
    const nc = t => [0, 0.88 + (0.37 + NK) * t, 0.3 + (0.2 + HZ) * t], nr = t => 0.22 - 0.06 * t, pf = [0, -0.48, 0.88]; let mi = 0;
    const fb = (pts, hw, th, side, sk, mirror) => { const p = furBlob('mane' + mi++, pts, hw, th, { side, nu: 12, prof: t => 0.85 + 0.15 * Math.sin(PI * Math.min(1, t * 1.1)) - 0.48 * t * t }); p.sk = sk; p.col = K.white; p.tex = [8, 8]; add(p); if (mirror) { const m2 = add(mirrorX(p, 'mane' + mi++ + 'R')); m2.sk = sk; } };
    const dn = [0, -1, -0.28];      /* 往下垂（略往後） */
    for (const [t, L, rw, nth] of [[0.12, 0.5, 0.15, [90, 55, 18, -22]], [0.45, 0.44, 0.14, [72, 36, 0, -40]], [0.78, 0.36, 0.12, [90, 50, 10, -30]]]) nth.forEach((th, ii) => {
      const a = th * PI / 180, r = nr(t) + 0.02, c0 = nc(t), rad = [Math.cos(a), pf[1] * Math.sin(a), pf[2] * Math.sin(a)], bp = add3(c0, rad, r), Lj = L * (1 + 0.15 * Math.sin(ii * 2.1 + t * 7)), sd = norm3(cross3(rad, dn)), sw = 0.03 * Math.sin(ii * 3.3 + t * 5);
      fb([add3(bp, rad, -0.08), add3(add3(bp, rad, 0.05), dn, Lj * 0.35), add3(add3(add3(bp, rad, 0.09 + sw), dn, Lj * 0.72), sd, sw), add3(add3(bp, rad, 0.06), dn, Lj)], rw, 0.04, sd, t < 0.3 ? [B.chest, 0.6, B.neck, 0.4] : B.neck, th !== 90); });
    for (const [x, y, z, L] of [[0, 0.7, 0.52, 0.34], [0.14, 0.64, 0.5, 0.32], [0, 0.52, 0.54, 0.28]]) fb([[x, y + 0.04, z - 0.1], [x, y - L * 0.35, z + 0.03], [x, y - L * 0.7, z + 0.05], [x, y - L, z]], 0.14, 0.04, [1, 0, 0], B.chest, x > 0);
    for (const [x, y, z, L] of [[0.3, -0.1, -0.04, 0.34], [0.27, -0.3, 0.02, 0.28]]) fb([hd(x - 0.06, y + 0.04, z), hd(x + 0.02, y - L * 0.35, z - 0.05), hd(x + 0.05, y - L * 0.7, z - 0.1), hd(x + 0.02, y - L, z - 0.13)], 0.12, 0.04, [0.2, 0, 1], B.head, true);
    for (const [x, y, z] of [[0, 0.3, -0.02], [0.08, 0.28, -0.06]]) fb([hd(x, y - 0.04, z), hd(x, y + 0.1, z - 0.06), hd(x, y + 0.2, z - 0.16), hd(x, y + 0.24, z - 0.3)], 0.07, 0.05, [1, 0, 0], B.head, x > 0);
    for (const t of [0.9, 0.6, 0.3]) { const c = nc(t), r = nr(t); fb([[0, c[1] + r * 0.4, c[2] - r * 0.7], [0, c[1] + r * 0.4 + 0.03, c[2] - r * 0.9 - 0.1], [0, c[1] + r * 0.4 + 0.04, c[2] - r * 0.9 - 0.22], [0, c[1] + r * 0.4 + 0.01, c[2] - r * 0.9 - 0.34]], 0.08, 0.05, [1, 0, 0], B.neck, false); }
  }

  // 凹處的陰影
  const AO = [{ id: 'head', c: HC, r: 0.34 }, { id: 'body', c: [0, 0.8, 0.2], r: 0.26 }, { id: 'body', c: [0, 0.79, -0.08], r: 0.24 }, { id: 'body', c: [0, 0.8, -0.34], r: 0.27 }, { id: 'neck', c: [0, 1.06, 0.4], r: 0.19 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.17 * s, 0.7, 0.3], r: 0.13 }, { id: 'rl', c: [0.18 * s, 0.72, -0.38], r: 0.15 });
  const aoId = { snout: 'head', jaw: 'head', bib: 'body' };
  for (const pt of parts) if (pt.paint) { const f = pt.paint, id = aoId[pt.name] || pt.name, ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.42, occl(p, n, AO, id) * 0.36 + 0.18 * Math.max(0, -n[1]) * smooth(0.6, 0.15, p[1])); c[0] *= 1 - o * 0.85; c[1] *= 1 - o * 0.95; c[2] *= 1 - o; }; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.fur, eyeCol: [0.6, 0.42, 0.2], face: Object.assign(FACE, { tex: elite ? ['deerE_calm.webp', 'deerE_angry.webp'] : ['deer_calm.webp', 'deer_angry.webp'] }),
    S: { k: 1.3, run: 5.4, stride: 0.62, lift: 0.14, bob: 0.05, cad: 1.05, graze: 1, grazeN: 1.0, grazeH: -0.1, earBack: 0.7, jawMax: 0.32, maneUp: 0, wag: 3.5, wagAmp: 0.35, halfW: 0.28, tailRun: 0.9, low: 0, flag: 1, chew: 1, ram: 0.75, u: 0.7, jump: 0.9, elastic: 1, grazeT: 0.68 } };
};

/* ---------- 野豬（圓潤版）：前重後輕的楔形、肩峰高、大頭、粉紅豬鼻、往上彎的白獠牙、頭頂到背上一道會豎起來的深色鬃毛、深色的蹄 ---------- */
SOFT.boar = elite => {
  const K = { fur: rgb(0x8a5a30), furD: rgb(0x603a22), furL: rgb(0xa67440), mane: rgb(0x2a1a13), snout: rgb(0xd08a7c), snoutD: rgb(0x9c5c52), nostril: rgb(0x47201f), mouth: rgb(0x6a1f28), tongue: rgb(0xb85a66), tusk: rgb(0xfff3da), tuskD: rgb(0xc9ab7c),
    hoof: rgb(0x2b1c15), leg: rgb(0x61391f), eye: rgb(0xf6e7b8), eyeD: rgb(0xe0a23c), pupil: rgb(0x180a06), earIn: rgb(0x9c5f55), scar: rgb(0xc08c78) };
  /* 菁英「黑脊」：毛色深、背上一條全黑的長鬃脊（比平常高 4 成、多四撮）、獠牙放大 1.4 倍、臉頰一道爪疤 */
  if (elite) Object.assign(K, { fur: rgb(0x6c4426), furD: rgb(0x40261a), furL: rgb(0x8a5c34), mane: rgb(0x0d0807), leg: rgb(0x3e2616), eyeD: rgb(0xd8801c), tusk: rgb(0xf2e4c4), tuskD: rgb(0xa08456) });
  const TS = elite ? 1.4 : 1;
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.6, 0.62], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.25, 0.44, 0.2], j1: [0.265, 0.27, 0.125], j2: [0.27, 0.1, 0.19], pad: [0.27, 0, 0.235] }, RJ = { j0: [0.24, 0.44, -0.36], j1: [0.262, 0.28, -0.275], j2: [0.27, 0.12, -0.385], pad: [0.27, 0, -0.325] };
  const TK = [[0.7, -0.6, 0.036], [0.74, -0.71, 0.032], [0.7, -0.81, 0.03], [0.6, -0.86, 0.03]];
  const sk = softSkel({ body: [0, 0.52, -0.08], pelvis: [0, 0.54, -0.32], chest: [0, 0.58, 0.12], neck: [0, 0.6, 0.3], head: [0, 0.6, 0.42], jaw: hd(0, -0.25, 0.06), ear: hd(0.32, 0.3, -0.1), mane: [0, 0.42, 0.02], fl: FJ, rl: RJ, tail: TK.slice(0, 3).map(k => [0, k[0], k[1]]), mane2: [0, 0.9, 0.3] });
  const BN = sk.BN, Lg = i => B.leg + i * 3;
  // 區域小工具：沿折線拉一條漸細的圓管（獠牙、尾巴）
  const boarTube = (name, nu, pts, rad, o = {}) => tubeP(name, nu, pts.map((p, i) => ({ p, rx: rad[i], ry: rad[i] })), Object.assign({ nv: pts.length * 2 - 1 }, o));

  /* ----- 頭：下寬上窄的大頭，兩頰鼓，眉骨壓著小眼睛，前面接一截粗短的吻 ----- */
  const head = ball('head', 26, 15, [0.46, 0.42, 0.44], { vmap: t => Math.pow(t, 1.15) });
  push(head, [0.36, -0.17, 0.0], 0.38, [0.075, -0.03, 0]);                      // 兩頰往外、往下鼓
  push(head, [0, 0.42, -0.05], [0.5, 0.2, 0.5], [0, -0.03, 0]);                 // 頭頂壓平一點
  push(head, [0, -0.1, 0.42], [0.32, 0.26, 0.3], [0, 0, 0.09]);                 // 吻的根部
  push(head, [0.2, 0.17, 0.36], 0.18, [0.004, -0.014, 0.055]);                  // 眉骨
  push(head, [0.215, 0.05, 0.42], 0.1, [0, 0, -0.02]);                          // 眼窩
  push(head, [0, -0.38, 0.3], [0.2, 0.12, 0.22], [0, 0.08, -0.02]);             // 口腔
  place(head, HC); finish(head); head.sk = B.head; head.tex = [384, 256]; add(head);
  const eh = surf(head, HC, norm3([0.215, 0.05, 0.4])), ez = norm3(add3(eh.n, [0.12, 0, 0.5])), ex = norm3(cross3([0, 1, 0], ez)), ey = cross3(ez, ex), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  head.paint = (c, p, n) => {
    const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x);
    put(c, K.fur); ink(c, 0.6 * smooth(0.12, 0.4, y), K.furD); ink(c, 0.55 * smooth(-0.08, -0.32, y) * smooth(0.08, 0.36, ax), K.furL);
    ink(c, 0.55 * smooth(0.22, 0.44, z) * smooth(0.26, 0.1, ax) * smooth(-0.3, -0.12, y), K.furD);      // 鼻樑往吻部變深
    if (z > 0.05 && y > -0.22 && y < 0.36) { const dx = ax - EC[0], dy = p[1] - EC[1], dz = p[2] - EC[2], a = dx * ex[0] + dy * ex[1] + dz * ex[2], b = dx * ey[0] + dy * ey[1] + dz * ey[2];
      ink(c, 0.7 * smooth(1.25, 0.7, h2(a / 0.17, (b - 0.02) / 0.13)), K.furD);                           // 眼周的深色面罩
      ink(c, cov((h2(a / 0.1, b / 0.09) - 1) * 0.09, 0.005), K.mane); }                               // 眼眶黑邊
    if (n[1] < 0.1 && y < -0.26) ink(c, cov((h2(x / 0.15, (z - 0.34) / 0.2) - 1) * 0.15 + 0.004), K.mouth);
    if (elite && x > 0) { const a = (z - 0.1) * 0.9 + (y + 0.12) * 0.45, b = (z - 0.1) * 0.45 - (y + 0.12) * 0.9; ink(c, 0.9 * cov(wedge(a + 0.05, b, 0.2, 0.02, 0.7, 0.04), 0.012), K.scar); ink(c, 0.9 * cov(wedge(a - 0.04, b + 0.07, 0.15, 0.016, 0.7, 0.03), 0.012), K.scar); }
  };
  // 吻與豬鼻：粗短的圓筒，前端是一片粉紅色的圓盤，兩個鼻孔
  const SZ = HC[2] + 0.69, SY = HC[1] - 0.12;
  { const sn = tubeP('snout', 16, [{ p: hd(0, -0.1, 0.28), rx: 0.26, ry: 0.2, rd: 0.17 }, { p: hd(0, -0.112, 0.46), rx: 0.21, ry: 0.165, rd: 0.14 }, { p: hd(0, -0.12, 0.6), rx: 0.19, ry: 0.15, rd: 0.13 }, { p: hd(0, -0.12, 0.655), rx: 0.2, ry: 0.158, rd: 0.138 }], { nv: 6, capB: 0.035, capN: 2 });
    sn.sk = B.head; sn.tex = [160, 96]; sn.blend = [head, 0.09]; add(sn);
    sn.paint = (c, p, n) => { const x = p[0], y = p[1] - SY, z = p[2] - SZ, ax = abs(x);
      put(c, K.fur); ink(c, 0.55 * smooth(-0.1, 0.1, y), K.furD); ink(c, smooth(-0.3, -0.06, z) * 0.85, K.snoutD);
      for (const w of [-0.15, -0.23]) ink(c, 0.5 * cov(abs(z - w + 0.05 * ax) - 0.009, 0.006) * smooth(0, 0.08, y), K.furD);      // 吻上的皺摺
      if (z > -0.045 || n[2] > 0.55) { put(c, K.snout); ink(c, 0.45 * smooth(0.7, 1.05, h2(x / 0.2, y / 0.15)), K.snoutD); ink(c, cov((h2((ax - 0.066) / 0.03, (y - 0.004) / 0.046) - 1) * 0.03, 0.005), K.nostril); }
      else if (n[1] < -0.55 && z < -0.07) ink(c, cov((h2(x / 0.13, (z + 0.3) / 0.22) - 1) * 0.13, 0.01), K.mouth); };
  }
  // 下顎：小小的，藏在吻下面，張嘴才看得到
  const JC = hd(0, -0.285, 0.36);
  { const jaw = ball('jaw', 14, 8, [0.15, 0.075, 0.2]); push(jaw, [0, 0.075, 0.0], [0.13, 0.075, 0.18], [0, -0.025, 0]); place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [96, 64]; add(jaw);
    jaw.paint = (c, p) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.fur); ink(c, 0.5 * smooth(0.02, -0.075, y), K.furD); if (y > 0.015) { ink(c, cov((h2(x / 0.115, z / 0.165) - 1) * 0.115), K.mouth); ink(c, cov((h2(x / 0.065, (z - 0.02) / 0.115) - 1) * 0.065), K.tongue); } };
    const td = cone('toothL', 5, hd(0.062, -0.27, 0.49), hd(0.064, -0.23, 0.5), hd(0.064, -0.195, 0.502), 0.02); td.sk = B.jaw; td.col = K.tusk; add(td); add(mirrorX(td, 'toothR')).sk = B.jaw; }
  // 獠牙：從嘴角往外、往上彎的一對大牙（根部帶點黃）
  { const tk = boarTube('tuskL', 7, [[0.16, -0.25, 0.3], [0.28, -0.255, 0.41], [0.375, -0.19, 0.48], [0.415, -0.06, 0.5], [0.385, 0.075, 0.465]].map(k => hd(0.16 + (k[0] - 0.16) * TS, -0.25 + (k[1] + 0.25) * TS, 0.3 + (k[2] - 0.3) * TS)), [0.066, 0.066, 0.056, 0.038, 0.01].map(r => r * (elite ? 1.3 : 1)), { capB: 0.012, capN: 1, ref: [0, 0, 1] });
    tk.sk = B.head; tk.tex = [16, 48]; tk.paint = (c, p, n, u, v) => { put(c, K.tusk); ink(c, 0.7 * smooth(0.5, 0.12, v), K.tuskD); }; add(tk); add(mirrorX(tk, 'tuskR')).sk = B.head; }
  // 耳朵：尖的，往外張
  { const ear = ball('earL', 12, 6, [0.15, 0.22, 0.062]); push(ear, [0, -0.02, 0.07], 0.13, [0, 0, -0.045], false); ear.map(p => { p[0] *= 1 - 0.82 * Math.pow(Math.max(0, (p[1] + 0.06) / 0.26), 1.1); });
    place(ear, hd(0.34, 0.345, -0.1), [-0.25, 0.55, -0.74]); ear.sk = B.earL; ear.tex = [64, 64];
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.furD); if (d[2] > 0) ink(c, cov((h2(d[0] / 0.7, (d[1] + 0.1) / 0.8) - 1) * 0.12), K.earIn); else ink(c, 0.5 * smooth(0.3, 0.9, d[1]), K.mane); };
    add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 眼睛：小、淺色，上半被深色的眼皮壓住；瞳孔小
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR), mir = p => [-p[0], p[1], p[2]];
  const X = {};
  { X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(-0.014, -0.01, 0.012), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(-0.014, -0.01, 0.012)), eqR);
    X.browL = sk.bone('browL', B.head, eloc(0.004, 0.05, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.004, 0.05, 0.014)), eqR);
    const eye = ball('eyeL', 12, 4, [0.088, 0.078, 0.022], { vmax: 0.6 }); place(eye, eloc(0, 0, -0.007), [ex, ey, ez]); eye.sk = X.eyeL; eye.tex = [48, 32]; eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.eye); ink(c, smooth(0.4, 0.95, r) * 0.75, K.eyeD); if (d[2] < 0.12 || d[1] * 0.078 > 0.034 + 0.36 * d[0] * 0.088) put(c, K.mane); };
    add(eye); add(mirrorX(eye, 'eyeR')).sk = X.eyeR;
    const pup = ball('pupL', 8, 2, [0.03, 0.034, 0.007], { vmax: 0.5 }); place(pup, eloc(-0.014, -0.01, 0.0125), [ex, ey, ez]); pup.sk = X.pupL; pup.col = K.pupil; add(pup); add(mirrorX(pup, 'pupR')).sk = X.pupR;
    const br = tubeP('browL', 6, [{ p: [-0.095, 0.008, 0.012], rx: 0.022, ry: 0.026 }, { p: [0.0, 0.05, 0.016], rx: 0.032, ry: 0.036 }, { p: [0.105, 0.088, 0.004], rx: 0.022, ry: 0.024 }], { ref: [0, 0, 1], capA: 0.022, capB: 0.02, capN: 1 }); place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = K.mane; add(br); add(mirrorX(br, 'browR')).sk = X.browR; }
  // 兩頰的鬃毛簇
  { const tf = (name, d, tip, side, hw, th, col) => { const h = surf(head, HC, norm3(d)), s = spike(name, add3(h.p, norm3(d), -0.09), hd(...tip), side, hw, th, 6, 0.86); s.sk = B.head; s.col = col; s.blend = [head, 0.1]; add(s); const m = add(mirrorX(s, name + 'R')); m.sk = B.head; m.blend = [head, 0.1]; };
    tf('chk1', [1, -0.02, -0.12], [0.53, -0.04, -0.25], [0.1, 1, 0], 0.085, 0.04, K.fur); tf('chk2', [1, -0.4, -0.08], [0.54, -0.3, -0.21], [0.35, 1, 0], 0.085, 0.04, K.fur); }
  // 頭頂的鬃毛（跟著頭）
  [[0.17, 0, 0.13, 0.35, 0.1, 0.08], [0.15, 0.4, 0.1, 0.3, 0.085, 0.07], [0.15, -0.4, 0.1, 0.3, 0.085, 0.07], [0.0, 0, 0.18, 0.6, 0.12, 0.085], [-0.02, 0.36, 0.12, 0.6, 0.09, 0.07], [-0.02, -0.36, 0.12, 0.6, 0.09, 0.07], [-0.17, 0, 0.17, 0.8, 0.12, 0.08]].forEach(([z, lx, hh, ln, hw, th], i) => {
    const hq = hh * (elite ? 1.45 : 1), h = surf(head, [lx * 0.2, 3, HC[2] + z], [0, -1, 0]), s = spike('hm' + i, add3(h.p, [0, -0.06, 0.02]), add3(h.p, [lx * hq * 1.1, hq, -hq * ln]), [0, 0, 1], hw * (elite ? 1.2 : 1), th, 6, 0.85); s.sk = B.head; s.col = K.mane; add(s); });

  /* ----- 身體：肩峰最高，往後一路低下去，屁股小 ----- */
  const body = tubeP('body', 20, [{ p: [0, 0.5, -0.5], rx: 0.26, ry: 0.25, rd: 0.21, wt: 0.9 }, { p: [0, 0.52, -0.34], rx: 0.36, ry: 0.33, rd: 0.28, wt: 0.88 }, { p: [0, 0.55, -0.12], rx: 0.405, ry: 0.4, rd: 0.31, wt: 0.86 }, { p: [0, 0.58, 0.1], rx: 0.43, ry: 0.47, rd: 0.33, wt: 0.84 }, { p: [0, 0.6, 0.28], rx: 0.41, ry: 0.44, rd: 0.31, wt: 0.88 }, { p: [0, 0.6, 0.44], rx: 0.31, ry: 0.33, rd: 0.25 }], { nv: 11, capA: 0.13, capB: 0.12 });
  push(body, [0.27, 0.86, 0.14], 0.26, [0.03, 0.025, 0]);                       // 肩胛
  finish(body); body.tex = [320, 192]; add(body);
  body.sk = p => { const t = smooth(-0.34, 0.08, p[2]), nk = 0.5 * smooth(0.28, 0.52, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2];
    put(c, K.fur); ink(c, 0.6 * smooth(0.9, 0.1, al), K.furD); ink(c, 0.45 * smooth(1.5, 2.6, al), K.furL); ink(c, 0.3 * smooth(-0.2, -0.6, z), K.furD);
    if (elite) { ink(c, 0.95 * smooth(0.62, 0.22, al) * smooth(-0.58, -0.36, z), K.mane); ink(c, 0.5 * smooth(1.1, 0.5, al) * smooth(-0.1, -0.3, z), K.mane); }
    // 左肩一道舊傷
    if (p[0] > 0.1 && z > -0.1 && z < 0.4) { const a = (z - 0.12) * 0.8 + (p[1] - 0.8) * 0.6, b = -(z - 0.12) * 0.6 + (p[1] - 0.8) * 0.8; ink(c, 0.9 * cov(wedge(a + 0.12, b, 0.26, 0.024, 0.7, 0.05), 0.014), K.scar); ink(c, 0.9 * cov(wedge(a + 0.05, b + 0.075, 0.16, 0.018, 0.7, 0.04), 0.014), K.scar); } };
  // 背上的鬃毛：根部跟著身體、尖端跟著 mane 骨頭（被激怒時往外撐開、豎高）
  { const zs = elite ? [0.4, 0.31, 0.22, 0.12, 0.03, -0.06, -0.15, -0.23, -0.3] : [0.36, 0.2, 0.03, -0.14, -0.3], hs = elite ? [0.22, 0.27, 0.29, 0.3, 0.28, 0.25, 0.21, 0.17, 0.13] : [0.17, 0.2, 0.18, 0.14, 0.1];
    zs.forEach((z, i) => { const h = surf(body, [0, 3, z], [0, -1, 0]), b0 = add3(h.p, [0, -0.07, 0.03]), tip = add3(h.p, [0, hs[i], -hs[i] * 0.85]), ax = norm3(sub3(tip, b0)), ln = hyp(...sub3(tip, b0)), bw = body.sk(h.p), s = spike('mn' + i, b0, tip, [0, 0, 1], elite ? 0.14 : 0.12, elite ? 0.09 : 0.078, 6, 0.85);
      s.sk = p => { const t = smooth(0.25, 0.95, dot3(sub3(p, b0), ax) / ln); return [bw[0], bw[1] * (1 - t), bw[2], bw[3] * (1 - t), bw[4], bw[5] * (1 - t), B.mane, t]; }; s.col = K.mane; add(s); }); }

  /* ----- 四條腿：短而粗，前腳更壯；深色的蹄（前面一道分岔） ----- */
  const legPaint = (c, p, n) => { put(c, K.fur); ink(c, 0.35 * smooth(0.2, -0.6, n[0]), K.furL); ink(c, 0.8 * smooth(0.3, 0.16, p[1]), K.leg); };
  const mkLeg = (name, keys, J, li, hc, hr) => {
    const leg = tubeP(name, 12, keys, { nv: 6, capA: 0.13, capN: 2 }); leg.tex = [64, 80]; leg.paint = legPaint; leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.06); leg.blend = [body, 0.14]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.06); lr.blend = [body, 0.14];
    const hf = ball(name + 'hoof', 10, 6, hr); hf.map(p => { p[0] *= 1 + 0.12 * smooth(-0.3, 0.8, p[2] / hr[2]); if (p[1] < -hr[1] * 0.8) p[1] = -hr[1] * 0.8; p[2] -= 0.06 * fall(h2(p[0] / 0.035, 0) + Math.max(0, 0.6 - p[2] / hr[2])); }); place(hf, hc); hf.tex = [32, 24];
    hf.paint = (c, p, n) => { put(c, K.hoof); ink(c, 0.35 * smooth(0.02, 0.14, p[1]) * Math.max(0, n[1]), K.leg); }; hf.sk = Lg(li) + 2; add(hf); add(mirrorX(hf, name + 'hoofR')).sk = Lg(li + 1) + 2;
  };
  mkLeg('fl', [{ p: [0.23, 0.55, 0.2], rx: 0.155, ry: 0.175 }, { p: [0.255, 0.4, 0.19], rx: 0.155, ry: 0.165 }, { p: [0.265, 0.27, 0.155], rx: 0.135, ry: 0.14 }, { p: [0.27, 0.16, 0.175], rx: 0.118, ry: 0.122 }, { p: [0.27, 0.07, 0.2], rx: 0.112, ry: 0.118 }], FJ, 0, [0.27, 0.078, 0.225], [0.128, 0.094, 0.15]);
  mkLeg('rl', [{ p: [0.22, 0.53, -0.36], rx: 0.165, ry: 0.19, rd: 0.18 }, { p: [0.25, 0.4, -0.33], rx: 0.16, ry: 0.175, rd: 0.155 }, { p: [0.262, 0.28, -0.3], rx: 0.13, ry: 0.14, rd: 0.13 }, { p: [0.27, 0.17, -0.36], rx: 0.11, ry: 0.115 }, { p: [0.27, 0.07, -0.345], rx: 0.106, ry: 0.112 }], RJ, 2, [0.27, 0.074, -0.325], [0.12, 0.09, 0.14]);

  /* ----- 尾巴：細短，末端一撮深色的毛 ----- */
  { const tail = boarTube('tail', 7, TK.map(k => [0, k[0], k[1]]), TK.map(k => k[2]), { capB: 0.03, capN: 1, seam: PI / 2, nv: 7 }); tail.tex = [16, 48];
    tail.sk = (p, i, j, pt) => { const s = pt.rows[j].t * 3, k = clamp(Math.round(s), 1, 2), w = smooth(k - 0.32, k + 0.32, s); return [B.tail + k - 1, 1 - w, B.tail + k, w]; };
    tail.paint = (c, p, n, u, v) => { put(c, K.fur); ink(c, smooth(0.45, 0.75, v), K.mane); }; add(tail);
    const tf = spike('tailTuft', [0, 0.62, -0.85], [0, 0.44, -0.9], [0, 0, 1], 0.05, 0.045, 6, 1.5); tf.sk = B.tail + 2; tf.col = K.mane; add(tf); }

  // 凹處的陰影
  const AO = [{ id: 'head', c: HC, r: 0.46 }, { id: 'body', c: [0, 0.58, 0.16], r: 0.42 }, { id: 'body', c: [0, 0.55, -0.14], r: 0.38 }, { id: 'body', c: [0, 0.52, -0.38], r: 0.33 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.26 * s, 0.34, 0.19], r: 0.16 }, { id: 'rl', c: [0.25 * s, 0.36, -0.33], r: 0.17 });
  for (const pt of parts) if (pt.paint) { const f = pt.paint, id = pt.name.replace(/R$|hoof$/, ''), ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.45, occl(p, n, AO, id) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(0.45, 0.08, p[1])); c[0] *= 1 - o * 0.9; c[1] *= 1 - o; c[2] *= 1 - o * 0.95; }; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: 3, X, bg: K.fur, eyeCol: [1.0, 0.72, 0.3],
    S: { k: 1.36, run: 4.15, stride: 0.34, lift: 0.08, bob: 0.035, cad: 1.5, graze: 1, grazeN: 0.25, grazeH: 0.2, earBack: 0.7, jawMax: 0.5, maneUp: 0.03, wag: 6, wagAmp: 0.5, halfW: 0.42, tailRun: 1.2, low: 0.22, chew: 1, u: 0.6, jump: 0.7, jaw0: 0, reach: 0.3, elastic: 1, maneK: 0.14 } };
};

/* ---------- 棕熊（圓潤版）：最大的一般怪。高聳的肩峰、圓耳、淺色的短吻與肚子、粗腿厚掌與長爪；平常四腳走，威嚇與拍地時用後腳站起來。
   菁英「巨熊・老疤」：毛色更深、肩峰花白，左眼瞎了（一道疤劃過）、右頰與肩腰有爪痕、左肩插著兩支斷箭、嘴一直張著露牙 ---------- */
SOFT.bear = elite => {
  const K = elite
    ? { fur: rgb(0x5a3a2a), furD: rgb(0x3a251b), furL: rgb(0x6e4c36), hump: rgb(0x8a7462), belly: rgb(0xa07c54), muzzle: rgb(0xb08d62), muzzleD: rgb(0x80603f), nose: rgb(0x150e0b), mouth: rgb(0x6a1c26), tongue: rgb(0xb4525e), tooth: rgb(0xfff3da), claw: rgb(0xddd2ba), paw: rgb(0x47291c),
        eye: rgb(0xf6e3a8), eyeD: rgb(0xe09a2c), pupil: rgb(0x140806), earIn: rgb(0x7a573c), brow: rgb(0x1e130e), scar: rgb(0xd18e84), scarD: rgb(0x7a3a36), blind: rgb(0xc9cdd0), wood: rgb(0x9a7446), feather: rgb(0x7c2a22) }
    : { fur: rgb(0x6e4429), furD: rgb(0x4a2c1b), furL: rgb(0x855733), hump: rgb(0x5a3722), belly: rgb(0xb48c5c), muzzle: rgb(0xc09766), muzzleD: rgb(0x8c6842), nose: rgb(0x1a100c), mouth: rgb(0x6e1f2a), tongue: rgb(0xbe5a66), tooth: rgb(0xfff3da), claw: rgb(0xd9cdb4), paw: rgb(0x573524),
        eye: rgb(0xf6e7b8), eyeD: rgb(0xe0a23c), pupil: rgb(0x180a06), earIn: rgb(0x8f6843), brow: rgb(0x26170f), scar: rgb(0xc59080) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.77, 0.74], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.34, 0.6, 0.24], j1: [0.36, 0.36, 0.15], j2: [0.37, 0.13, 0.23], pad: [0.37, 0, 0.3] }, RJ = { j0: [0.33, 0.6, -0.46], j1: [0.36, 0.37, -0.36], j2: [0.37, 0.15, -0.48], pad: [0.37, 0, -0.4] };
  const sk = softSkel({ body: [0, 0.68, -0.1], pelvis: [0, 0.68, -0.42], chest: [0, 0.72, 0.14], neck: [0, 0.77, 0.38], head: [0, 0.77, 0.5], jaw: hd(0, -0.25, 0.1), ear: hd(0.36, 0.33, -0.06), mane: [0, 0.6, 0.1], fl: FJ, rl: RJ, tail: [[0, 0.8, -0.78]], mane2: [0, 1.1, 0.36] });
  const BN = sk.BN, Lg = i => B.leg + i * 3;

  /* ----- 頭：又大又圓，兩頰的毛讓臉更寬；眉骨厚，小眼睛躲在下面；前面一截淺色的短吻 ----- */
  const head = ball('head', 28, 16, [0.5, 0.45, 0.45], { vmap: t => Math.pow(t, 1.15) });
  push(head, [0.4, -0.16, 0.0], 0.4, [0.07, -0.03, 0]);                         // 兩頰
  push(head, [0, 0.45, -0.02], [0.55, 0.2, 0.5], [0, -0.025, 0]);               // 頭頂壓平一點
  push(head, [0, -0.12, 0.44], [0.34, 0.26, 0.3], [0, 0, 0.07]);                // 吻的根部
  push(head, [0.2, 0.19, 0.36], 0.19, [0.004, -0.014, 0.06]);                   // 眉骨
  push(head, [0.2, 0.07, 0.43], 0.1, [0, 0, -0.022]);                           // 眼窩
  push(head, [0, -0.4, 0.3], [0.2, 0.12, 0.22], [0, 0.08, -0.02]);              // 口腔
  place(head, HC); finish(head); head.sk = B.head; head.tex = elite ? [448, 288] : [384, 256]; add(head);
  const eh = surf(head, HC, norm3([0.2, 0.075, 0.4])), ez = norm3(add3(eh.n, [0.1, 0, 0.5])), ex = norm3(cross3([0, 1, 0], ez)), ey = cross3(ez, ex), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  head.paint = (c, p, n) => {
    const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x);
    put(c, K.fur); ink(c, 0.55 * smooth(0.14, 0.42, y), K.furD); ink(c, 0.5 * smooth(-0.1, -0.34, y) * smooth(0.1, 0.4, ax), K.furL);
    ink(c, 0.9 * smooth(0.3, 0.42, z) * smooth(0.3, 0.2, h2(x, (y + 0.12) * 1.25)), K.muzzle);                          // 吻根一圈淺色
    if (z > 0.05 && y > -0.22 && y < 0.38) { const dx = ax - EC[0], dy = p[1] - EC[1], dz = p[2] - EC[2], a = dx * ex[0] + dy * ex[1] + dz * ex[2], b = dx * ey[0] + dy * ey[1] + dz * ey[2];
      ink(c, 0.75 * smooth(1.25, 0.7, h2(a / 0.16, (b - 0.02) / 0.125)), K.furD);                                       // 眼周的深色
      ink(c, cov((h2(a / 0.09, b / 0.08) - 1) * 0.08, 0.005), K.brow);
      if (ax < 0.12 && y > 0.02 && y < 0.26) ink(c, 0.55 * cov(abs(ax - 0.035 - 0.22 * (y - 0.04)) - 0.009, 0.006) * smooth(0.02, 0.06, y) * smooth(0.26, 0.16, y), K.furD);
      if (elite && x > 0) { const s1 = a * 0.94 - b * 0.34, t1 = a * 0.34 + b * 0.94;                                   // 左眼的疤：從額頭斜劃到臉頰
        ink(c, cov(wedge(t1 + 0.26, s1 + 0.012, 0.56, 0.03, 0.55, 0.06) - 0.004, 0.006), K.scarD); ink(c, cov(wedge(t1 + 0.25, s1 + 0.012, 0.53, 0.022, 0.55, 0.05), 0.005), K.scar); } }
    if (elite && x < -0.12 && z > -0.1) { const u = x + 0.36, w = y + 0.1, s1 = u * 0.5 + w * 0.866, t1 = -u * 0.866 + w * 0.5;      // 右頰三道爪痕
      for (const o of [-0.065, 0, 0.065]) { ink(c, cov(wedge(s1 + 0.13, t1 + o, 0.26 - abs(o), 0.019, 0.6, 0.04) - 0.003, 0.006), K.scarD); ink(c, cov(wedge(s1 + 0.125, t1 + o, 0.245 - abs(o), 0.013, 0.6, 0.035), 0.005), K.scar); } }
    if (n[1] < 0.1 && y < -0.26) ink(c, cov((h2(x / 0.16, (z - 0.34) / 0.2) - 1) * 0.16 + 0.004), K.mouth);
  };
  // 吻：短而圓，淺色；鼻頭又黑又寬
  const MZ = HC[2] + 0.56, MY = HC[1] - 0.13;
  { const mz = tubeP('muzzle', 16, [{ p: hd(0, -0.1, 0.26), rx: 0.255, ry: 0.19, rd: 0.17 }, { p: hd(0, -0.12, 0.43), rx: 0.21, ry: 0.155, rd: 0.14 }, { p: hd(0, -0.13, 0.56), rx: 0.175, ry: 0.13, rd: 0.12 }], { nv: 5, capB: 0.09, capN: 3 });
    mz.sk = B.head; mz.tex = [128, 96]; mz.blend = [head, 0.09]; add(mz);
    mz.paint = (c, p, n) => { const x = p[0], y = p[1] - MY, z = p[2] - MZ, ax = abs(x);
      put(c, K.muzzle); ink(c, 0.4 * smooth(0, -0.12, y), K.muzzleD); ink(c, 0.5 * smooth(-0.2, -0.32, z), K.fur);
      for (const w of [-0.17, -0.25]) ink(c, 0.5 * cov(abs(z - w + 0.35 * ax) - 0.009, 0.006) * smooth(0.03, 0.09, y), K.muzzleD);      // 吻上的皺摺（齜牙）
      if (z > -0.06 && y < 0.02) { ink(c, cov(ax - 0.008, 0.004) * smooth(-0.11, -0.08, y), K.nose); }                  // 人中
      if (n[1] < -0.5 && z < 0.02) ink(c, cov((h2(x / 0.14, (z + 0.2) / 0.24) - 1) * 0.14, 0.01), K.mouth); };          // 底面是口腔
    const nose = ball('nose', 10, 5, [0.095, 0.062, 0.06]); nose.map(p => { p[0] *= 1 + 0.35 * p[1] / 0.062; }); place(nose, hd(0, -0.05, 0.615)); nose.sk = B.head; nose.col = K.nose; nose.tex = [16, 16]; add(nose); }
  // 下顎與牙：上面一對尖牙露在嘴外，下面一對短的
  const JC = hd(0, -0.295, 0.4);
  { const jaw = ball('jaw', 14, 8, [0.16, 0.08, 0.215]); push(jaw, [0, 0.08, 0.0], [0.14, 0.08, 0.19], [0, -0.028, 0]); place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [96, 64]; add(jaw);
    jaw.paint = (c, p) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.muzzle); ink(c, 0.5 * smooth(0.02, -0.08, y), K.muzzleD); if (y > 0.015) { ink(c, cov((h2(x / 0.125, z / 0.18) - 1) * 0.125), K.mouth); ink(c, cov((h2(x / 0.07, (z - 0.02) / 0.125) - 1) * 0.07), K.tongue); } };
    const fl = elite ? 0.15 : 0.12, fu = cone('fangL', 6, hd(0.105, -0.235, 0.6), hd(0.11, -0.235 - fl * 0.55, 0.615), hd(0.108, -0.235 - fl, 0.608), elite ? 0.04 : 0.035); fu.sk = B.head; fu.col = K.tooth; add(fu); add(mirrorX(fu, 'fangR')).sk = B.head;
    const fd = cone('fangLd', 5, hd(0.082, -0.3, 0.555), hd(0.084, -0.25, 0.565), hd(0.084, -0.2, 0.568), 0.026); fd.sk = B.jaw; fd.col = K.tooth; add(fd); add(mirrorX(fd, 'fangRd')).sk = B.jaw; }
  // 耳朵：小而圓、厚
  { const ear = ball('earL', 12, 6, [0.15, 0.15, 0.075]); push(ear, [0, -0.01, 0.08], 0.12, [0, 0, -0.05], false);
    place(ear, hd(0.375, 0.355, -0.06), [-0.15, 0.4, -0.5]); ear.sk = B.earL; ear.tex = [64, 48];
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.furD); if (d[2] > 0) ink(c, cov((h2(d[0], d[1] + 0.1) - 0.6) * 0.15), K.earIn); };
    add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 眼睛：小、淺色、上半被眼皮壓住。老疤的左眼是瞎的（灰白、沒有瞳孔、不會發亮）
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR), mir = p => [-p[0], p[1], p[2]];
  const X = {};
  { X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(-0.012, -0.008, 0.012), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(-0.012, -0.008, 0.012)), eqR);
    X.browL = sk.bone('browL', B.head, eloc(0.004, 0.048, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.004, 0.048, 0.014)), eqR);
    const ER = [0.08, 0.07, 0.022], eyePaint = sg => (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.eye); ink(c, smooth(0.4, 0.95, r) * 0.75, K.eyeD); if (d[2] < 0.12 || d[1] * ER[1] > 0.03 + 0.36 * sg * d[0] * ER[0]) put(c, K.brow); };
    const mkEye = (name, right) => { const e = ball(name, 12, 4, ER, { vmax: 0.6 }); place(e, right ? mir(eloc(0, 0, -0.007)) : eloc(0, 0, -0.007), right ? [exR, eyR, ezR] : [ex, ey, ez]); e.sk = right ? X.eyeR : X.eyeL; e.tex = [48, 32]; e.glow = 1; e.paint = eyePaint(right ? -1 : 1); return add(e); };
    const mkPup = (name, right) => { const q = ball(name, 8, 2, [0.028, 0.031, 0.007], { vmax: 0.5 }); place(q, right ? mir(eloc(-0.012, -0.008, 0.0125)) : eloc(-0.012, -0.008, 0.0125), right ? [exR, eyR, ezR] : [ex, ey, ez]); q.sk = right ? X.pupR : X.pupL; q.col = K.pupil; return add(q); };
    if (!elite) { const e = mkEye('eyeL', 0); add(mirrorX(e, 'eyeR')).sk = X.eyeR; const q = mkPup('pupL', 0); add(mirrorX(q, 'pupR')).sk = X.pupR; }
    else { mkEye('eyeR', 1); mkPup('pupR', 1); const e = ball('eyeL', 12, 4, ER, { vmax: 0.6 }); place(e, eloc(0, 0, -0.007), [ex, ey, ez]); e.sk = X.eyeL; e.tex = [48, 32];
      e.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), s1 = d[0] * 0.94 - d[1] * 0.3; put(c, K.blind); ink(c, 0.5 * smooth(0.2, 0.9, h2(d[0], d[1])), K.eyeD); if (d[2] < 0.12 || d[1] * ER[1] > 0.012 + 0.36 * d[0] * ER[0]) put(c, K.brow); ink(c, cov(abs(s1 + 0.05) - 0.2, 0.06), K.scar); }; add(e); }
    const br = tubeP('browL', 6, [{ p: [-0.09, 0.006, 0.012], rx: 0.024, ry: 0.028 }, { p: [0.0, 0.048, 0.016], rx: 0.034, ry: 0.038 }, { p: [0.1, 0.084, 0.004], rx: 0.024, ry: 0.026 }], { ref: [0, 0, 1], capA: 0.022, capB: 0.02, capN: 1 }); place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = K.brow; add(br); add(mirrorX(br, 'browR')).sk = X.browR; }
  // 兩頰的毛
  { const tf = (name, d, tip, side, hw, th, col) => { const h = surf(head, HC, norm3(d)), s = spike(name, add3(h.p, norm3(d), -0.09), hd(...tip), side, hw, th, 6, 0.86); s.sk = B.head; s.col = col; s.blend = [head, 0.1]; add(s); const m = add(mirrorX(s, name + 'R')); m.sk = B.head; m.blend = [head, 0.1]; };
    if (elite) { tf('chk1', [1, 0.02, -0.1], [0.575, 0.0, -0.26], [0.1, 1, 0], 0.1, 0.04, K.fur); tf('chk2', [1, -0.26, -0.08], [0.6, -0.22, -0.23], [0.25, 1, 0], 0.1, 0.04, K.fur); tf('chk3', [1, -0.55, -0.04], [0.55, -0.42, -0.18], [0.45, 1, 0], 0.1, 0.04, K.furL); } }

  /* ----- 身體：一大團。肩峰最高、最寬，往後略收；肚子與胸口是淺色的 ----- */
  const body = tubeP('body', 20, [{ p: [0, 0.6, -0.66], rx: 0.33, ry: 0.3, rd: 0.26, wt: 0.92 }, { p: [0, 0.64, -0.45], rx: 0.49, ry: 0.42, rd: 0.38, wt: 0.9 }, { p: [0, 0.68, -0.16], rx: 0.545, ry: 0.5, rd: 0.44, wt: 0.88 }, { p: [0, 0.73, 0.12], rx: 0.57, ry: 0.63, rd: 0.44, wt: 0.84 }, { p: [0, 0.76, 0.34], rx: 0.5, ry: 0.5, rd: 0.4, wt: 0.9 }, { p: [0, 0.78, 0.5], rx: 0.38, ry: 0.38, rd: 0.32 }], { nv: 12, capA: 0.16, capB: 0.14 });
  push(body, [0.36, 1.08, 0.16], 0.3, [0.04, 0.03, 0]);                         // 肩胛
  finish(body); body.tex = elite ? [448, 256] : [352, 208]; add(body);
  body.sk = p => { const t = smooth(-0.44, 0.1, p[2]), nk = 0.5 * smooth(0.34, 0.6, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  // 爪痕：三道平行的斜線，畫在身體側面（s 沿身體前後、t 沿表面往下）
  const claw3 = (c, s, t, len, k) => { for (const o of [-0.075, 0, 0.075]) { ink(c, k * cov(wedge(s + len / 2, t + o, len - 1.2 * abs(o), 0.024, 0.6, 0.05) - 0.004, 0.008), K.scarD); ink(c, k * cov(wedge(s + len / 2 - 0.006, t + o, len - 1.2 * abs(o) - 0.02, 0.016, 0.6, 0.045), 0.007), K.scar); } };
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2], x = p[0];
    put(c, K.fur); ink(c, 0.55 * smooth(0.9, 0.1, al), K.furD); ink(c, 0.35 * smooth(1.3, 2.2, al), K.furL); ink(c, 0.25 * smooth(-0.3, -0.75, z), K.furD);
    ink(c, (elite ? 0.75 : 0.5) * smooth(0.75, 0.15, al) * smooth(-0.2, 0.1, z) * smooth(0.6, 0.36, z), K.hump);                 // 肩峰（老疤是花白的）
    { const bw = 0.95 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 0.1) / 0.62, 2))) ; ink(c, cov((PI - al - bw) * 0.45, 0.02), K.belly); }      // 肚子到胸口的淺色
    if (elite) { const t = al * 0.55;
      if (x > 0 && z > -0.12 && z < 0.55) claw3(c, (z - 0.2) * 0.64 - (t - 0.6) * 0.77, (z - 0.2) * 0.77 + (t - 0.6) * 0.64, 0.42, 1);         // 左肩
      if (x < 0 && z < 0.1) claw3(c, (z + 0.3) * 0.5 - (t - 0.4) * 0.866, (z + 0.3) * 0.866 + (t - 0.4) * 0.5, 0.36, 1); }                // 右腰
    else if (x < 0 && z > -0.2 && z < 0.5) { const t = al * 0.55, a = (z - 0.16) * 0.7 - (t - 0.5) * 0.7, b = (z - 0.16) * 0.7 + (t - 0.5) * 0.7; ink(c, 0.85 * cov(wedge(a + 0.13, b, 0.28, 0.022, 0.7, 0.05), 0.012), K.scar); } };   // 一般款右肩一道舊傷
  // 肩峰到頸後的毛簇：根部跟著身體、尖端跟著 mane 骨頭（生氣時豎起）
  { const zs = [0.42, 0.27, 0.1, -0.08], xs = [0.075, -0.085, 0.07, -0.05], hs = [0.065, 0.1, 0.095, 0.065], tipC = elite ? K.hump : K.furD, baseC = K.fur;
    zs.forEach((z, i) => { const h = surf(body, [xs[i], 3, z], [0, -1, 0]), b0 = add3(h.p, [0, -0.08, 0.04]), tip = add3(h.p, [xs[i] * 0.9, hs[i], -hs[i] * 1.25]), ax = norm3(sub3(tip, b0)), ln = hyp(...sub3(tip, b0)), bw = body.sk(h.p), s = spike('mn' + i, b0, tip, [0, 0, 1], 0.15, 0.085, 6, 0.85);
      s.sk = p => { const t = smooth(0.25, 0.95, dot3(sub3(p, b0), ax) / ln); return [bw[0], bw[1] * (1 - t), bw[2], bw[3] * (1 - t), bw[4], bw[5] * (1 - t), B.mane, t]; };
      s.tex = [16, 32]; s.paint = (c, p, n, u, v) => { put(c, baseC); ink(c, smooth(0.25, 0.7, v), tipC); }; add(s); }); }
  // 尾巴：一顆短短的毛球
  { const tl = ball('tail', 10, 5, [0.11, 0.1, 0.11]); place(tl, [0, 0.8, -0.83]); tl.sk = B.tail; tl.col = K.furD; tl.tex = [16, 16]; tl.blend = [body, 0.1]; add(tl); }

  /* ----- 四條腿：像柱子一樣粗；厚掌、深色，露出一排淺色的長爪 ----- */
  const legPaint = (c, p, n) => { put(c, K.fur); ink(c, 0.35 * smooth(0.2, -0.6, n[0]), K.furL); ink(c, 0.85 * smooth(0.34, 0.16, p[1]), K.paw); };
  const mkLeg = (name, keys, J, li, pawC, pawR, claws, cl) => {
    const leg = tubeP(name, 12, keys, { nv: 6, capA: 0.16, capN: 2 }); leg.tex = [64, 96]; leg.paint = legPaint; leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.07); leg.blend = [body, 0.16]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.07); lr.blend = [body, 0.16];
    const paw = ball(name + 'paw', 10, 6, pawR); paw.map(p => { p[0] *= 1 + 0.16 * smooth(-0.3, 0.8, p[2] / pawR[2]); if (p[1] < -pawR[1] * 0.82) p[1] = -pawR[1] * 0.82; }); place(paw, pawC); paw.tex = [48, 32];
    paw.paint = (c, p, n) => { const x = p[0] - pawC[0], z = p[2] - pawC[2]; put(c, K.paw); ink(c, 0.3 * Math.max(0, n[1]) * smooth(0.1, 0.2, p[1]), K.furD); if (z > 0.04 && p[1] > 0.03) { let k = 0; for (let i = 1; i < claws.length; i++) k = Math.max(k, cov(abs(x - (claws[i - 1] + claws[i]) / 2 * pawR[0]) - 0.008)); ink(c, 0.6 * k, K.nose); } }; paw.sk = Lg(li) + 2; add(paw); add(mirrorX(paw, name + 'pawR')).sk = Lg(li + 1) + 2;
    for (const o of claws) { const zf = pawC[2] + pawR[2] * (0.9 - 0.14 * abs(o)), x = pawC[0] + o * pawR[0], c = cone(name + 'cl' + o, 4, [x, 0.1, zf - 0.04], [x + o * 0.008, 0.075, zf + cl * 0.55], [x + o * 0.016, 0.016, zf + cl], cl * 0.72, [1, 0, 0]); c.sk = Lg(li) + 2; c.col = K.claw; c.tex = [8, 8]; add(c); add(mirrorX(c, name + 'clR' + o)).sk = Lg(li + 1) + 2; }
  };
  mkLeg('fl', [{ p: [0.31, 0.76, 0.24], rx: 0.215, ry: 0.245 }, { p: [0.345, 0.56, 0.235], rx: 0.22, ry: 0.235 }, { p: [0.36, 0.37, 0.19], rx: 0.205, ry: 0.21 }, { p: [0.37, 0.2, 0.215], rx: 0.195, ry: 0.2 }, { p: [0.37, 0.08, 0.24], rx: 0.2, ry: 0.205 }], FJ, 0, [0.37, 0.118, 0.33], [0.24, 0.145, 0.28], [-0.72, -0.25, 0.25, 0.72], 0.066);
  mkLeg('rl', [{ p: [0.3, 0.74, -0.46], rx: 0.245, ry: 0.275, rd: 0.265 }, { p: [0.335, 0.56, -0.43], rx: 0.245, ry: 0.26, rd: 0.225 }, { p: [0.355, 0.37, -0.39], rx: 0.205, ry: 0.215, rd: 0.195 }, { p: [0.37, 0.21, -0.46], rx: 0.19, ry: 0.195 }, { p: [0.37, 0.08, -0.445], rx: 0.195, ry: 0.2, rd: 0.185 }], RJ, 2, [0.37, 0.112, -0.37], [0.225, 0.135, 0.27], [-0.64, 0, 0.64], 0.05);

  if (elite) {
    // 左肩上的兩支斷箭：一支還留著箭羽，一支折得只剩半截
    const arrow = (name, z, x, dir, len, vane) => { const h = surf(body, [x, 3, z], [0, -1, 0]), d = norm3(dir), a = add3(h.p, d, -0.06), b = add3(h.p, d, len), s1 = norm3(cross3(d, [0, 0, 1])), s2 = cross3(d, s1);
      const sh = tubeP(name, 5, [{ p: a, rx: 0.016, ry: 0.016 }, { p: b, rx: 0.016, ry: 0.016 }], { capB: 0.004, capN: 1, ref: s1 }); sh.sk = B.chest; sh.col = K.wood; sh.tex = [8, 8]; add(sh);
      if (vane) for (const [i, rf] of [[0, s1], [1, s2]]) { const f = tubeP(name + 'v' + i, 4, [{ p: add3(b, d, -0.19), rx: 0.004, ry: 0.016 }, { p: add3(b, d, -0.15), rx: 0.004, ry: 0.052 }, { p: add3(b, d, -0.05), rx: 0.004, ry: 0.046 }, { p: add3(b, d, -0.02), rx: 0.004, ry: 0.016 }], { ref: rf, nv: 4 }); f.sk = B.chest; f.col = K.feather; f.tex = [8, 8]; f.flat = true; add(f); } };
    arrow('arw0', 0.2, 0.24, [0.5, 1, -0.3], 0.42, 1); arrow('arw1', 0.02, 0.33, [0.75, 1, -0.55], 0.24, 0);
  }

  // 凹處的陰影
  const AO = [{ id: 'head', c: HC, r: 0.48 }, { id: 'body', c: [0, 0.72, 0.22], r: 0.52 }, { id: 'body', c: [0, 0.69, -0.16], r: 0.5 }, { id: 'body', c: [0, 0.65, -0.48], r: 0.44 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.35 * s, 0.44, 0.23], r: 0.22 }, { id: 'rl', c: [0.34 * s, 0.46, -0.43], r: 0.24 });
  for (const pt of parts) if (pt.paint) { const f = pt.paint, id = pt.name.replace(/R$|paw$/, ''), ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.42, occl(p, n, AO, id) * (id === 'body' ? 0.24 : 0.36) + (id === 'body' ? 0.06 : 0.18) * Math.max(0, -n[1]) * smooth(0.5, 0.1, p[1])); c[0] *= 1 - o * 0.9; c[1] *= 1 - o; c[2] *= 1 - o * 0.95; }; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: 1, X, bg: K.fur, eyeCol: [1.0, 0.7, 0.28],
    S: { k: 1.2, rearK: 1.2, run: 2.7, stride: 0.42, lift: 0.1, bob: 0.04, cad: 0.95, graze: 0.7, grazeN: 0.3, grazeH: 0.25, earBack: 0.5, jawMax: 0.62, maneUp: 0.02, wag: 1, wagAmp: 0.1, halfW: 0.56, tailRun: 0, low: 0.12, u: 0.55, jump: 0.6, jaw0: elite ? 0.4 : 0.1, reach: 0.3, elastic: 1, maneK: 0.12 } };
};

const cache = {}, NO_ELITE = {};      /* 沒有菁英造型的物種（0.8：野豬「黑脊」、野鹿「白冠」已做出來，名單留空；之後新增無菁英物種再填） */
// lazy：只建好幾何與骨架、貼圖留著分批畫（預先建立用）；一般呼叫會把還沒畫完的貼圖一次補完
/* 野豬新模型：骨架用模型檔的 joints（softSkel 決定骨名與順序），姿勢參數 S 沿用舊野豬（世界大小、判定都不變） */
function species08(type, el) { const K8 = type + (el ? '!#8' : '#8'), K0 = type + (el ? '!' : '');
  if (cache[K8]) return cache[K8]; if (cache[K8] === false) return null;
  const d = getModel08(type, el); if (!d || !SOFT[type]) return null;
  try {
    const old = cache[K0] || (cache[K0] = buildSoft(SOFT[type](el), true)), sk = softSkel(d.joints), BN = sk.BN, vk = VISK08[type + (el ? 'E' : '')] || 1;
    if (BN.length !== d.bones.length || BN.some((b, i) => b.name !== d.bones[i])) throw new Error('骨名對不上');
    const one = new THREE.Vector3(1, 1, 1), Mw = BN.map(b => new THREE.Matrix4().compose(new THREE.Vector3(b.p[0], b.p[1], b.p[2]), new THREE.Quaternion(), one)), inv = Mw.map(m => m.clone().invert());
    BN.forEach((b, i) => { const L = b.parent < 0 ? Mw[i].clone() : inv[b.parent].clone().multiply(Mw[i]); b.lp = new THREE.Vector3(); b.lq = new THREE.Quaternion(); L.decompose(b.lp, b.lq, new THREE.Vector3()); });
    return (cache[K8] = { geo: d.geo, tex: d.tex, bones: BN, legs: sk.legs, mane2: sk.mane2, inv, tris: d.meta.tris, S: vk !== 1 ? Object.assign({}, old.S, { k: old.S.k * vk }) : old.S, D: Object.assign({}, old.D, { face: null, tailN: d.joints.tail.length }), soft: true, X: {}, painted: true, v8: true });
  } catch (e) { console.warn('[model08] ' + type + ' 建骨架失敗，沿用舊模型：', e && e.message); cache[K8] = false; return null; }
}

const species = (type, elite, lazy) => { if (SOFT[type]) { const s8 = species08(type, !!elite); if (s8) return s8; } const k = type + (elite ? '!' : ''), sp = cache[k] || (cache[k] = SOFT[type] ? buildSoft(SOFT[type](elite), true) : buildAnimal(SPEC[type](elite))); if (!lazy && sp.paint && !sp.painted) sp.paint(); return sp; };
// 圓潤版第一次建立要畫貼圖（一個物種一兩百毫秒）：趁剛載入、還沒進場的空檔先建好。每次只做幾毫秒，不讓畫面頓住
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  const q = Object.keys(SOFT).flatMap(t => NO_ELITE[t] ? [[t, false]] : [[t, false], [t, true]]); let cur = null;
  const step = () => { let wait = 16; try { if (!cur) { const a = q.shift(); if (!a) return; cur = species(a[0], a[1], true); wait = 40; } else if (cur.painted || cur.paint(6)) { cur = null; wait = 60; } } catch (e) { console.warn('怪物預先建立失敗', e); cur = null; } setTimeout(step, wait); };
  setTimeout(step, 1800);
}

/* ============================== 產生一隻怪 ============================== */
const CH = ['bx', 'by', 'bz', 'bp', 'br', 'bw', 'rear', 'buck', 'pp', 'pw', 'cp', 'cw', 'cr', 'np', 'nw', 'nr', 'hp', 'hw', 'hr', 'jaw', 'eL', 'eR', 'eS', 'mane', 'tp', 'tc', 'tw', 'rigX', 'rigY', 'rigZ', 'rigP', 'rigW', 'rigR', 'eye', 'sq', 'ssz', 'ssy', 'brow', 'pup'];
const newPose = () => { const o = { L: new Float32Array(32) }; for (const k of CH) o[k] = 0; o.eye = 1; o.pup = 1; return o; };
// 圓潤版的材質：整隻一個材質。眼珠另外加一點自發光（aGlow 標出眼珠的頂點），預備出招或狂暴時發紅；
// 死亡淡出用畫面上的網點（跟角色貼近鏡頭時同一種做法）：不必排序，疊在裡面的部位也不會透出來
function softShader(sh) {
  sh.uniforms.uGlow = this.userData.glow; sh.uniforms.uDim = this.userData.dim; sh.uniforms.uFade = this.userData.fade; sh.uniforms.uRim = this.userData.rim;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nvarying float vGlow;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 1.0 - vGlow * uDim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * vGlow;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');      // uRim：受擊閃光的輪廓光（邊緣亮、中間保留明暗，身形不會被蓋掉）
}
const softKey = () => 'softcreature';
/* ============================== 柔軟毛團 furBlob（可重用）==============================
   用途：背毛、鬃毛、尾毛這種「一大團柔軟的毛」。一根沿曲線彎的淚滴形管子：兩端都收成圓頭（沒有尖角），平滑法線，段數夠（預設 14 邊 × pts×3 段）。
   用法：const p = furBlob(名字, [起點, …, 尾端], 半寬 hw, 半厚 th, { side: 寬度方向, nv, nu, capA, capB, prof })；回傳一個 Part（之後自己設 .sk／.tex／.paint 再 add）。
   - pts：至少 3 個點（Catmull-Rom 內插）。尾端點抬高＝上翹、壓低＝下垂；多團彼此重疊、起點埋進身體裡就長成大塊毛。
   - prof(t)：沿長度的粗細（預設根部飽滿、尾端約 0.5 的圓鈍頭）；side：毛團寬的方向（預設 +x）；th 小＝扁（瓦片）、th 接近 hw＝圓胖。 */
function furBlob(name, pts, hw, th, o = {}) {
  const n = pts.length, prof = o.prof || (t => 0.8 + 0.2 * Math.sin(PI * Math.min(1, t * 1.15)) - 0.28 * t * t), t0 = norm3(sub3(pts[1], pts[0])), ref = o.ref || cross3(o.side || [1, 0, 0], t0);
  const keys = pts.map((p, i) => { const r = prof(i / (n - 1)); return { p, rx: th * r, ry: hw * r }; });
  return tubeP(name, o.nu ?? 14, keys, { ref, nv: o.nv ?? n * 3, capA: o.capA ?? hw * 0.6, capB: o.capB ?? hw * 0.85, capN: 4 });
}
function wolfMat(mat) {      /* 狼的材質：暗部提亮（只影響狼） */
  mat.onBeforeCompile = softShader;
  mat.customProgramCacheKey = () => 'softwolf';
}

/* ============================== 灰狼臉（參考圖貼圖）============================== */
/* 做法同猩猩（beasts08.js 的 apeFaceGrid／attachFace）：把參考圖裁出來的臉（去掉耳朵與頭頂毛）正面投影到頭／吻／鼻／下巴的表面（從正前方往 -z 射線找最前面的點），
   再往外推一點點，做成貼合曲面的網格（SkinnedMesh、全部 100% 跟 head 骨）。s＝每像素的公尺數、ey＝眼睛所在的像素列、ye＝眼睛的高度（頭中心起算）。
   平常用閉嘴圖；威嚇／追擊／預備／出手／收招（m.st 1–4、8）或眼睛發光（dim）時換生氣圖（齜牙），眼睛黃色的部分染紅。 */
const wfTex = {};
const wfTexture = name => { let t = wfTex[name]; if (!t) { t = wfTex[name] = new THREE.TextureLoader().load('assets/face/' + name); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; } return t; };
function wolfFaceGrid(parts, HC, o) {
  const CW = o.cw, CH = o.ch, s = o.s, ex = CW / 2, NX = 36, NY = 34, W = NX + 1, nvx = W * (NY + 1), cand = ['head', 'snout', 'nose', 'jaw'].map(n => parts.find(p => p.name === n)).filter(Boolean);
  const X = new Float32Array(nvx), Yv = new Float32Array(nvx), Z = new Float32Array(nvx).fill(NaN), uv = new Float32Array(nvx * 2);
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, px = i / NX * CW, py = j / NY * CH; X[k] = HC[0] + (px - ex) * s; Yv[k] = HC[1] + o.ye + (o.ey - py) * s; uv[k * 2] = i / NX; uv[k * 2 + 1] = 1 - j / NY;
    for (const pt of cand) { const h = surf(pt, [X[k], Yv[k], HC[2] + 1.2], [0, 0, -1]); if (h && !(Z[k] >= h.p[2])) Z[k] = h.p[2]; }
  }
  /* 沒打到的格子（臉盤外、下巴以下、兩頰蓬毛）：同一欄往外延伸，z 隨距離往後退；整欄都沒打到的從隔壁欄借 */
  for (let i = 0; i <= NX; i++) { let a = -1, b = -1; for (let j = 0; j <= NY; j++) if (!isNaN(Z[j * W + i])) { if (a < 0) a = j; b = j; }
    if (a < 0) continue; for (let j = 0; j <= NY; j++) { const k = j * W + i; if (!isNaN(Z[k])) continue; const r = j < a ? a : b, d = abs(Yv[j * W + i] - Yv[r * W + i]); Z[k] = Z[r * W + i] - 0.5 * d; } }
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const k = j * W + i; if (!isNaN(Z[k])) continue; for (let d = 1; d <= NX; d++) { const l = i - d >= 0 ? Z[k - d] : NaN, r = i + d <= NX ? Z[k + d] : NaN; const v = !isNaN(l) ? l : r; if (!isNaN(v)) { Z[k] = v - 0.6 * d * CW / NX * s; break; } } if (isNaN(Z[k])) Z[k] = HC[2]; }
  const Z0 = Float32Array.from(Z); for (let pass = 0; pass < 2; pass++) { const Z2 = Float32Array.from(Z); for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) { let t = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += Z[(j + b) * W + i + a]; Z2[j * W + i] = Math.max(t / 9, Z0[j * W + i]); } Z.set(Z2); }
  const pos = new Float32Array(nvx * 3), nor = new Float32Array(nvx * 3), off = 0.012;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, kl = j * W + Math.max(0, i - 1), kr = j * W + Math.min(NX, i + 1), ku = Math.max(0, j - 1) * W + i, kd = Math.min(NY, j + 1) * W + i;
    const tx = [X[kr] - X[kl], Yv[kr] - Yv[kl], Z[kr] - Z[kl]], ty = [X[kd] - X[ku], Yv[kd] - Yv[ku], Z[kd] - Z[ku]], n = norm3(cross3(ty, tx));
    nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2]; pos[k * 3] = X[k] + n[0] * off; pos[k * 3 + 1] = Yv[k] + n[1] * off; pos[k * 3 + 2] = Z[k] + n[2] * off;
  }
  const idx = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  return { pos, nor, uv, idx, eyes: o.eyes, cw: CW, ch: CH, tex: o.tex };
}
function wolfFaceShader(sh) {
  const U = this.userData; sh.uniforms.uGlow = U.glow; sh.uniforms.uDim = U.dim; sh.uniforms.uFade = U.fade; sh.uniforms.uRim = U.rim; sh.uniforms.mapB = { value: U.mapB }; sh.uniforms.uEyes = { value: U.eyes }; sh.uniforms.uCan = { value: U.can }; sh.uniforms.uAng = U.ang;
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nuniform sampler2D mapB;\nuniform vec4 uEyes;\nuniform vec2 uCan;\nuniform float uAng;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', `vec4 tA = texture2D(map, vMapUv), tB = texture2D(mapB, vMapUv), tM = mix(tA, tB, uAng);
  vec2 tp = vec2(vMapUv.x * uCan.x, (1.0 - vMapUv.y) * uCan.y); float eyeM = max(1.0 - smoothstep(24.0, 42.0, distance(tp, uEyes.xy)), 1.0 - smoothstep(24.0, 42.0, distance(tp, uEyes.zw)));
  float yel = clamp((max(tM.r, tM.g) - tM.b - 0.16) * 3.2, 0.0, 1.0), irisK = eyeM * smoothstep(0.1, 0.6, uDim) * yel, rr = dot(tM.rgb, vec3(0.3, 0.59, 0.11)) * 1.5 + 0.06;
  tM.rgb = mix(tM.rgb, vec3(1.0, 0.1, 0.05) * rr, irisK); diffuseColor *= tM;`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * (irisK * 0.5) + diffuseColor.rgb * 0.06;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
function attachWolfFace(m, F, mat, mesh) {
  let g = F.geo; if (!g) { g = F.geo = new THREE.BufferGeometry(); const n = F.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = B.head; sw[i * 4] = 1; }
    g.setAttribute('position', new THREE.BufferAttribute(F.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(F.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(F.uv, 2)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setIndex(F.idx); }
  const tA = wfTexture(F.tex[0]), tB = wfTexture(F.tex[1]), fm = new THREE.MeshStandardMaterial({ map: tA, roughness: 0.82, metalness: 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), ang = { value: 0 };
  fm.emissive = mat.emissive; Object.assign(fm.userData, { glow: mat.userData.glow, dim: mat.userData.dim, fade: mat.userData.fade, rim: mat.userData.rim, ang, mapB: tB, eyes: new THREE.Vector4(F.eyes[0], F.eyes[1], F.eyes[2], F.eyes[3]), can: new THREE.Vector2(F.cw, F.ch) });
  fm.onBeforeCompile = wolfFaceShader; fm.customProgramCacheKey = () => 'wolfface';
  const fmesh = new THREE.SkinnedMesh(g, fm); fmesh.frustumCulled = false; fmesh.castShadow = false; fmesh.receiveShadow = false; fmesh.renderOrder = 1; fmesh.bind(mesh.skeleton, new THREE.Matrix4());
  fmesh.onBeforeRender = () => { fm.opacity = tA.image && tB.image ? mat.opacity : 0; const st = m.st, hunt = st >= 1 && st <= 4 || st === 8 ? 1 : 0, tgt = Math.max(hunt, smooth(0.12, 0.3, mat.userData.dim.value)); ang.value += (tgt - ang.value) * 0.3; if (m.snap) ang.value = tgt; };
  m.root.add(fmesh); m.face = fmesh; return fmesh;
}

export function makeCreature(type, size, elite) {
  if (!SPEC[type] && !SOFT[type]) type = 'boar';
  const sp = species(type, !!elite && !NO_ELITE[type]), S = sp.S;
  const root = new THREE.Group(), tilt = new THREE.Group(), rig = new THREE.Group(); root.add(tilt); tilt.add(rig); root.scale.setScalar(S.k * size);
  const bones = sp.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
  sp.bones.forEach((b, i) => { const pp = b.parent < 0 ? [0, 0, 0] : sp.bones[b.parent].p; (b.parent < 0 ? rig : bones[b.parent]).add(bones[i]); if (b.lp) { bones[i].position.copy(b.lp); bones[i].quaternion.copy(b.lq); } else bones[i].position.set(b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]); });
  let mat, eye = null, mEye = null;
  if (sp.soft) { mat = new THREE.MeshStandardMaterial({ map: sp.tex, roughness: 0.8, metalness: 0 }); mat.userData.glow = { value: new THREE.Color(0, 0, 0) }; mat.userData.dim = { value: 0 }; mat.userData.fade = { value: 1 }; mat.userData.rim = { value: new THREE.Color(0, 0, 0) }; mat.onBeforeCompile = softShader; mat.customProgramCacheKey = softKey; }
  else mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(sp.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, sp.inv), new THREE.Matrix4());
  const faceM = sp.D && sp.D.face;
  if (!sp.soft) { mEye = new THREE.MeshBasicMaterial({ vertexColors: true }); eye = new THREE.Mesh(sp.eyeGeo, mEye); eye.position.set(0, sp.eyeY, 0); bones[B.head].add(eye); }
  const m = { root, tilt, rig, bones, mesh, eye, mats: [mat], mEye, sp, S, type, elite: !!elite, phase: Math.random(), seed: Math.random() * 100, T: newPose(), C: newPose(), st: -1, lp: 0, side: 1, yaw: null, yv: 0, sl: [0, 0, 0], fading: false, snap: true,
    rest: bones.map(b => b.position.clone()), restQ: bones.map(b => b.quaternion.clone()), tailN: sp.D.tailN };
  if (faceM) attachFace(m, faceM, mat, mesh);
  if (sp.soft && type === 'wolf' && sp.D.face) { wolfMat(mat); attachWolfFace(m, sp.D.face, mat, mesh); }
  return beastFinish08(m);
}

/* ============================== 動作 ============================== */
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _eu = new THREE.Euler(), _qx = new THREE.Quaternion(), _p = new THREE.Vector3(), _pb = new THREE.Vector3(), _d = new THREE.Vector3(), _k = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _pole = new THREE.Vector3(), _a = new THREE.Vector3(), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
const _pq = {};      // 傳給 S.pose 的資訊（重複使用同一個物件）
const FL = 0, FR = 8, RL = 16, RR = 24;      // 腿在 L 陣列裡的起點；每條腿 8 格：落地偏移 x y z、跟身體的比重、跟身體時的偏移 x y z、腳掌俯仰
// 兩節 IK：讓四隻腳踩在目標上
function solveLegs(m) {
  const Bn = m.bones, L = m.C.L, body = Bn[B.body], U = m.S.u || 1, xa = m.xa && m.xa.w > 0.001 ? m.xa : null; body.updateMatrix();
  for (let h = 0; h < 2; h++) {
    const par = Bn[h ? B.pelvis : B.chest]; par.updateMatrix(); _m1.multiplyMatrices(body.matrix, par.matrix); _m2.copy(_m1).invert(); _qp.multiplyQuaternions(body.quaternion, par.quaternion); _qi.copy(_qp).invert();
    for (let s = 0; s < 2; s++) {
      const i = h * 2 + s, lg = m.sp.legs[i], o = i * 8, up = Bn[B.leg + i * 3], lo = Bn[B.leg + i * 3 + 1], ft = Bn[B.leg + i * 3 + 2], w = L[o + 3], sx = s ? -1 : 1;
      _p.set(lg.pad[0] + L[o] * sx * U, lg.pad[1] + L[o + 1] * U, lg.pad[2] + L[o + 2] * U).applyMatrix4(_m2);
      if (w > 0.001) { _pb.set(lg.rest[0] + L[o + 4] * sx * U, lg.rest[1] + L[o + 5] * U, lg.rest[2] + L[o + 6] * U); _p.lerp(_pb, w); }
      _qf.setFromAxisAngle(XA, L[o + 7]); _qg.multiplyQuaternions(_qi, _qf); if (w > 0.001) _qg.slerp(_qf, w);
      if (xa && h === 0) {      /* 前掌直接指定在身體座標（含朝向、單位同模型）：掌心點＝肩關節＋(外x 上y 前z)，掌的朝向＝繞 X 俯仰、繞 Z 內翻 */
        _pb.copy(up.position).applyMatrix4(_m1); _pb.x += sx * xa.x[s]; _pb.y += xa.y[s]; _pb.z += xa.z[s]; _pb.applyMatrix4(_m2); _p.lerp(_pb, xa.w);
        _eu.set(xa.p[s], 0, -sx * xa.r[s]); _qx.setFromEuler(_eu); _qx.premultiply(_qi); _qg.slerp(_qx, xa.w);
      }
      _a.copy(lg.f0).applyQuaternion(_qg); _p.sub(_a);
      _d.subVectors(_p, up.position); const a = lg.a, b = lg.b, d = clamp(_d.length(), abs(a - b) + 0.01, a + b - 0.003); _d.normalize();
      const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      _pole.set(0, -0.3, h ? 1 : -1); _pole.addScaledVector(_d, -_pole.dot(_d)); if (_pole.lengthSq() < 1e-6) _pole.set(1, 0, 0); _pole.normalize();
      _k.copy(_d).multiplyScalar(a * ca).addScaledVector(_pole, a * sa);
      _u1.copy(_k).normalize(); _u2.copy(_d).multiplyScalar(d).sub(_k).normalize();
      _q1.setFromUnitVectors(lg.r1, _u1); _q2.setFromUnitVectors(lg.r2, _u2);
      up.quaternion.copy(_q1); lo.quaternion.copy(_q1).invert().multiply(_q2); ft.quaternion.copy(_q2).invert().multiply(_qg);
    }
  }
}
const leg = (T, o, gx, gy, gz, fp = 0) => { T.L[o] += gx; T.L[o + 1] += gy; T.L[o + 2] += gz; T.L[o + 7] += fp; };
const air = (T, o, w, ax, ay, az, fp = 0) => { T.L[o + 3] = w; T.L[o + 4] = ax; T.L[o + 5] = ay; T.L[o + 6] = az; T.L[o + 7] += fp * w; };
// 步態：依速度在慢走（四拍）、小跑（對角）、奔跑（後腿前腿輪流）之間過渡
function gait(m, T, sp, dt, k = 1) {
  const S = m.S, g = clamp(sp / m.run, 0, 1.5), mv = smooth(0.04, 0.35, sp) * k, wW = 1 - smooth(0.3, 0.5, g), wG = smooth(0.62, 0.85, g), wT = 1 - wW - wG;
  const duty = 0.64 * wW + 0.5 * wT + 0.38 * wG, Lmax = S.stride * (0.62 * wW + 0.85 * wT + 1.05 * wG);
  let f = (0.95 + 1.45 * Math.min(g, 1)) * S.cad, Ls = sp * duty / f; if (Ls > Lmax) { f = sp * duty / Lmax; Ls = Lmax; }
  m.phase = (m.phase + dt * (m.sp.v8 && m.f8 > 0 ? m.f8 : Math.min(f, 4.2))) % 1;      /* 新模型：步頻由 gait08.js 依步幅上限推算（m.f8） */
  const ph = m.phase, lift = S.lift * (0.55 * wW + 0.85 * wT + 1.2 * wG), c2 = TAU * ph, iu = 1 / (S.u || 1), mdx = sin(m.md || 0), mdz = cos(m.md || 0), fpk = 0.4 + 0.6 * Math.max(0, mdz);      // m.md：移動方向（相對面向；π＝倒退）
  const Q = legQ(m, ph, wW, wT, wG, false);      /* 11-20：相位表搬到 gait08.js（走路改側向四拍、猴猿對角序列、鱷魚對角成對） */
  for (let i = 0; i < 4; i++) {
    const q = Q[i]; let z, y = 0, fp;
    if (q < duty) { const s = q / duty; z = Ls * (0.5 - s); fp = 0.4 * smooth(0.65, 1, s) - 0.1 * (1 - smooth(0, 0.2, s)); }
    else { const s = (q - duty) / (1 - duty); z = Ls * (-0.5 + s * s * (3 - 2 * s)); y = sin(PI * Math.pow(s, 0.8)) * lift; fp = lerp(0.75, -0.3, smooth(0.1, 0.9, s)); }
    const zz = (z * mv + (i < 2 ? 0.03 : -0.02) * wG * mv) * iu; leg(T, i * 8, zz * mdx, y * mv * iu, zz * mdz, fp * mv * fpk);
  }
  const gz = RUN.mode === 'trot' ? 0 : 1, wGg = wG * gz, wTT = wT + wG * (1 - gz);      /* 身體的奔跑項：橫向奔馳照舊（脊椎一伸一縮、一步一起伏），快速小跑改用小跑的一步兩彈 */
  // 身體：小跑一步彈兩下；奔跑整個身體前後擺、脊椎一伸一縮
  T.by += (mv * S.bob * (wW * 0.25 * cos(2 * c2) + wTT * 0.7 * cos(2 * c2 + 0.5) + wGg * 1.5 * sin(c2 - 0.9)) - mv * 0.02 * wGg) * iu; T.ssz += mv * wGg * 0.07 * sin(c2 - 0.5);
  T.bp += mv * (wGg * -0.11 * cos(c2 + 0.2) + wTT * 0.015 * sin(2 * c2)) + mv * wGg * 0.03; T.br -= mv * (wW * 0.03 + wTT * 0.022) * 0.5 * (legU(Q[0], duty) - legU(Q[1], duty) + legU(Q[2], duty) - legU(Q[3], duty));      /* 側傾：往「腳比較往前伸」的那一側壓低（伸得遠的那側髖要低才踩得到；11-20：由腳的位置算，不再用和腳錯 90 度的 sin；小跑時對角成對、左右抵銷＝幾乎不側傾）*/
  T.pp += mv * wGg * -0.2 * cos(c2 - 0.15); T.cp += mv * wGg * 0.1 * cos(c2 + 0.5); if (!m.sp.v8) { const tw = mv * (wW * 0.05 + wTT * 0.035); T.pw -= tw * (legU(Q[2], duty) - legU(Q[3], duty)); T.cw -= tw * (legU(Q[0], duty) - legU(Q[1], duty)); }      /* 脊椎扭轉：左邊的肩／髖往前，該段就往右轉，由腳的前後位置算（11-20；新模型由 anim08 疊加）*/
  T.np += mv * (wW * 0.07 * cos(2 * c2 + 0.6) + wTT * 0.03 * cos(2 * c2) + wGg * 0.08 * cos(c2 + 0.2)); T.hp += mv * wGg * 0.07 * cos(c2 + 0.4);
  T.tp += mv * (S.tailRun * (0.25 * wT + wG) + wGg * 0.12 * sin(c2 + 1)); T.tc -= mv * S.tailRun * 0.12 * wG;
  return { g, mv, wG };
}
// 受擊反應（只是畫面，每個人各自算）：(dx, dz) 是受力的方向（世界座標，從出手的人指向野獸），k 是力道（輕 0.4、重 0.85、暴擊 1.1；霸體中再打折）。
// 身體立刻被打歪一截（命中停頓的那幾幀就看得到挨打的姿勢），再像彈簧一樣回彈；頭甩出去、慢半拍回來；重的一擊晃頭；全身先壓扁再彈回；眼睛一瞬間閉上
export function hitCreature(m, dx, dz, k = 0.5, o = {}) {
  if (!m || !(k > 0)) return; const l = hyp(dx, dz) || 1, yaw = m.root.rotation.y, wx = dx / l, wz = dz / l, lx = wx * cos(yaw) - wz * sin(yaw), lz = wx * sin(yaw) + wz * cos(yaw), H = m.hit || (m.hit = { x: 0, z: 0, vx: 0, vz: 0, hp: 0, hw: 0, vhp: 0, vhw: 0, q: 0, vq: 0, sk: 0, skT: 0 });
  const a = Math.min(1.4, k);
  H.x = clamp(H.x * 0.5 + lx * 0.09 * a, -0.18, 0.18); H.z = clamp(H.z * 0.5 + lz * 0.13 * a, -0.22, 0.22); H.vx += lx * 1.6 * a; H.vz += lz * 2.2 * a;
  H.hp = clamp(H.hp * 0.5 + lz * 0.4 * a, -0.6, 0.6); H.hw = clamp(H.hw * 0.5 + lx * 0.45 * a, -0.7, 0.7); H.vhp += lz * 3 * a; H.vhw += lx * 3.5 * a;
  H.q = Math.max(H.q, 0.55 * a); H.vq += 3 * a; if (a >= 0.8) { H.sk = Math.max(H.sk, 0.18 * a); H.skT = 0; }
  if (m.C && !o.armor) m.C.eye = Math.min(m.C.eye, a >= 0.8 ? 0.06 : 0.35);
}
// 彈簧往回拉（w 頻率、z 阻尼）；畫面很慢時分段算才不會爆掉
function spr(H, p, v, w, z, dt) { for (let n = Math.ceil(dt / 0.012), h = dt / Math.max(1, n), i = 0; i < n; i++) { H[v] += (-w * w * H[p] - 2 * z * w * H[v]) * h; H[p] += H[v] * h; } }
const defAct = (type, D) => D ?{ anim: { charge: 'charge', lunge: 'bite', swipe: 'slam', pounce: 'pounce' }[D.atk] || D.atk || 'bite', wind: D.wind || 0.6, strike: D.dashT || 0.3, recover: D.recover || 0.6 } : { anim: 'kick', wind: 0.5, strike: 0.3, recover: 0.6 };

export function animCreature(m, v, dt, t) {
  const S = m.S, Bn = m.bones, st = v.st | 0, p = v.stT || 0, T = m.T, C = m.C, sc = m.root.scale.x, type = m.type, D = MON[v.type];
  const act = v.act || m.defAct || (m.defAct = defAct(v.type, D)), an = act.anim, flash = clamp(v.flash || 0, 0, 1);
  if (st !== m.st || p < m.lp - 0.02) { if (st === ST.STAGGER || st === ST.DEAD || st === ST.WIND) m.side = Math.random() < 0.5 ? -1 : 1; if (m.st === ST.DEAD || m.st < 0) m.snap = true; m.st = st; }
  m.lp = p; m.run = (D ? D.speed / sc : S.run) || S.run;
  for (const k of CH) T[k] = 0; T.L.fill(0); T.eye = 1; if (m.xa) m.xa.on = false;
  const sp = (v.speed || 0) / sc, E = m.elite, sd = m.side;
  let rate = 14, lrate = 30, glow = 0, eyeK = 1, calm = 0, tense = 0, pant = 0;
  // 轉向時身體跟著彎
  const yaw = m.root.rotation.y; if (m.yaw == null) m.yaw = yaw; if (dt > 0) m.yv = damp(m.yv, clamp(angDiff(m.yaw, yaw) / dt, -6, 6), 8, dt); m.yaw = yaw;
  // 實際移動的方向（相對面向）：倒退、繞圈橫移時步伐跟著反過來或往旁邊跨；bk 倒退的程度、sd2 橫移的程度（左右正負）
  if (v.x != null && dt > 0) { if (m.px == null || st !== m.pst && st === ST.DEAD) { m.px = v.x; m.pz = v.z; } const wx = (v.x - m.px) / dt, wz = (v.z - m.pz) / dt, kk = 1 - Math.exp(-8 * dt); m.px = v.x; m.pz = v.z;
    m.mvx = (m.mvx || 0) + (clamp(wx * cos(yaw) - wz * sin(yaw), -15, 15) - (m.mvx || 0)) * kk; m.mvz = (m.mvz || 0) + (clamp(wx * sin(yaw) + wz * cos(yaw), -15, 15) - (m.mvz || 0)) * kk; } m.pst = st;
  const mvl = hyp(m.mvx || 0, m.mvz || 0), mdk = smooth(0.4, 1.2, mvl); m.md = mvl > 0.25 ? Math.atan2(m.mvx, m.mvz) * mdk : (m.md || 0) * 0.9; const bk = smooth(-0.2, -0.75, cos(m.md)) * mdk, sd2 = sin(m.md) * mdk;
  const loco = st === ST.IDLE || st === ST.CHASE || st === ST.FLEE;
  if (st !== ST.DEAD) {
    if (loco || (st === ST.STRIKE && an === 'charge')) {
      const G = gait(m, T, st === ST.STRIKE ? Math.max(sp, m.run * 1.25) : sp, dt), tv = clamp(m.yv * 0.09, -0.45, 0.45) * G.mv;
      const hl = v.tf != null && v.f != null ? clamp(angDiff(v.f, v.tf), -0.7, 0.7) * G.mv : 0;      /* 11-20 F1b：頭先轉（朝向還沒轉到的那一截先由頭頸去看）；逃跑時轉彎側傾加大（往轉彎內側壓）*/
      T.cw += tv * 0.6; T.nw += tv * 0.5 + hl * 0.25; T.hw += tv * 0.5 + hl * 0.4; T.br -= tv * (st === ST.FLEE ? 0.5 : 0.35) * G.g; T.tw -= tv * 1.2; calm = st === ST.IDLE && !v.pose ? 1 - G.mv : 0;
      if (st === ST.CHASE) { T.np += S.low * 0.8; T.hp -= S.low * 0.5; T.eL = T.eR = 0.7; T.jaw += 0.12 + 0.06 * sin(t * 9 + m.seed); T.mane = 0.5; eyeK = 1.6; tense = 0.5;
        // 被打退後的走位（game.js 的 BACK）：倒退時壓低身子、頭低眼睛盯著、耳朵貼後、齜牙喘氣、尾巴放低；橫著繞圈時身體往圈內斜、頭轉向目標
        if (bk > 0.01) { const pn = sin(t * 15 + m.seed); T.by -= 0.09 * bk; T.bp -= 0.04 * bk; T.np += 0.3 * bk; T.hp -= 0.32 * bk; T.eL = T.eR = 0.7 + 0.3 * bk; T.jaw += (0.22 + 0.1 * pn) * bk; pant = 3 * pn * bk; T.tp -= 0.5 * bk; T.mane = 0.5 + 0.5 * bk; tense = 0.5 + 0.5 * bk; }
        const lk = clamp(v.look || 0, -1.1, 1.1); T.nw += lk * 0.45; T.hw += lk * 0.5; T.cw += lk * 0.15; T.br -= sd2 * 0.05 * G.mv; T.by -= abs(sd2) * 0.04 * G.mv; }
      if (st === ST.FLEE) {
        // 逃跑：耳朵貼平、夾尾巴（鹿是豎起白尾巴）、不時回頭看
        const look = smooth(0.72, 0.8, vnoise(t * 0.8 + m.seed, 4.4)) * (vnoise(t * 0.3, m.seed) > 0.5 ? 1 : -1);
        T.eL = T.eR = 1; T.np += S.low * 0.5 + 0.08; T.hw += look * 0.75; T.nw += look * 0.5; T.eye = 1.15; T.by += S.flag ? 0.03 * G.mv : -0.02;
        if (S.flag) { T.tp += 1.5 - S.tailRun * G.mv; T.by += G.mv * S.bob * 0.8 * sin(TAU * m.phase - 0.9); } else { T.tp -= 0.5 + S.tailRun * G.mv; T.tc -= 0.25; T.pp -= 0.06; }
      }
    }
    // 平常的小動作：呼吸、東張西望、低頭覓食、耳朵抽動、尾巴擺、眨眼
    const n1 = vnoise(t * 0.34 + m.seed, 1.7) - 0.5, n2 = vnoise(t * 0.27 + m.seed * 3.1, 5.2) - 0.5, br = sin(t * (1.5 + tense * 3) + m.seed);
    T.sq = br + pant; T.by += br * 0.006;
    if (calm > 0) {
      const gz = smooth(S.grazeT || 0.56, (S.grazeT || 0.56) + 0.1, vnoise(t * 0.1 + m.seed * 7.3, 9.1)) * calm * (S.graze > 0 ? 1 : 0);      /* S.grazeT：低頭吃草的門檻（越高越少低頭；野鹿 0.68，待機以抬頭為主）*/
      T.hw += n1 * 1.2 * calm * (1 - gz); T.nw += n1 * 0.5 * calm * (1 - gz); T.hp += n2 * 0.3 * calm; T.hr += n1 * n2 * 0.6 * calm;
      T.np += gz * S.grazeN * S.graze; T.hp += gz * S.grazeH; T.cp += gz * S.grazeN * 0.12; T.jaw += gz * (S.chew || 0) * Math.max(0, sin(t * 6.5)) * 0.25; T.hw += gz * sin(t * 1.3 + m.seed) * 0.12;
      T.bx += n2 * 0.03 * calm; T.br += n2 * 0.03 * calm; T.pw += n1 * 0.05 * calm;
      const yawn = smooth(0.82, 0.86, vnoise(t * 0.16 + m.seed * 1.9, 2.2)) * calm * (1 - gz); T.jaw += yawn * 0.8; T.hp -= yawn * 0.25; T.eye -= yawn * 0.7;
    }
    const fl = vnoise(t * 1.1 + m.seed * 2, 3.3), fr = vnoise(t * 1.1 + m.seed * 5, 8.3); T.eL += smooth(0.7, 0.75, fl) * sin(t * 34) * 0.35; T.eR += smooth(0.7, 0.75, fr) * sin(t * 34) * 0.35;
    T.tw += sin(t * S.wag + m.seed) * S.wagAmp * (loco ? 1 : 0.5); T.tc += sin(t * S.wag * 0.7 + m.seed * 2) * 0.05;
    if ((t * 0.29 + m.seed) % 1 < 0.035) T.eye = 0.08;
  }
  const hi = sin(p * 40);
  if (st === ST.WARN) {
    // 威嚇：還沒打，先告訴你「別過來」
    glow = 0.25; eyeK = 1.5; rate = 9;
    if (type === 'bear') rate = bearThreat08(m, T, t, p);      /* 11-20：原本的前掌用胸骨座標的 air()，加上網格的前後肢黏連，舉起來變兩塊長板；重做在 bearthreat08.js */
    else if (type === 'boar') { const q = (t * 1.5) % 2, o = q < 1 ? FL : FR, s = q % 1; T.np = 0.1; T.hp = 0.04 + 0.1 * Math.max(0, sin(t * 7)); T.bp = 0.07; T.bz = 0.03 * sin(t * 3); T.mane = 1; T.tp = 1.6; T.eL = T.eR = 0.8; leg(T, o, 0, sin(PI * s) * 0.13, 0.12 * cos(PI * s) - 0.04, 0.7 * sin(PI * s)); T.jaw = 0.15; T.hw = 0.1 * sin(t * 2.2); }
    else if (type === 'wolf') { const snap = smooth(0.8, 0.9, sin(t * 2.3)); T.by = -0.13; T.bp = 0.13; T.bz = -0.05; T.np = 0.42; T.hp = -0.3; T.jaw = 0.3 + 0.05 * sin(t * 31) + 0.45 * snap; T.eL = T.eR = 1; T.mane = 1; T.tp = 0.75; T.tw *= 0.2; T.bx = 0.04 * sin(t * 1.2); T.hw = 0.1 * sin(t * 1.2 + 1); T.hr = 0.08 * sin(t * 1.7); for (const o of [FL, FR]) leg(T, o, 0.05, 0, 0.06); for (const o of [RL, RR]) leg(T, o, 0.03, 0, -0.03); }
    else if (type === 'tiger') { const hiss = smooth(0.2, 0.6, sin(t * 2.0)), sw = smooth(0.75, 0.95, sin(t * 1.3 + 2)); T.by = -0.17; T.bz = -0.06; T.np = 0.3; T.hp = -0.2; T.jaw = 0.2 + 0.6 * hiss; T.eL = T.eR = 1; T.tw = 0.9 * sin(t * 5.5); T.tp = 0.25; T.tc = 0.12; T.pw = 0.05 * sin(t * 5.5); air(T, FR, sw, 0.02, 0.22, 0.2 + 0.12 * sin(t * 14), 0.6); T.cw = -0.12 * sw; }
    else { const stomp = (t * 0.8 + m.seed) % 1, s = clamp(stomp / 0.22, 0, 1); T.np = -0.2; T.hp = 0.12; T.eL = -0.25 + 0.2 * sin(t * 5); T.eR = -0.25 + 0.2 * sin(t * 5 + 2); T.tp = 1.5; T.bz = -0.04; T.hw = 0.1 * sin(t * 0.9); if (stomp < 0.22) leg(T, FL, 0, sin(PI * s) * 0.24, 0.05 * sin(PI * s), 0.8 * sin(PI * s)); T.eye = 1.15; }
  } else if (st === ST.WIND) {
    // 預備動作：每一招都要讓玩家看得懂
    const k = clamp(p / Math.max(0.05, act.wind || 0.6), 0, 1), e = easeOut(k), late = smooth(0.7, 1, k); glow = an === 'steal' ? 0.1 : 1; eyeK = an === 'steal' ? 1.25 : 2.2; rate = 16; T.eL = T.eR = 1; T.mane = 1;
    if (an === 'charge') { const q = (p * 3.2) % 1, pw = 1 - late; T.bz = -0.09 * e - 0.1 * late; T.by = -0.03 * e - 0.08 * late; T.bp = 0.11; T.np = 0.1; T.hp = 0.05; T.tp = 1.7; T.br = hi * 0.012; T.jaw = 0.12;
      leg(T, sd > 0 ? FL : FR, 0, Math.max(0, sin(TAU * q)) * 0.14 * pw, (0.13 * cos(TAU * q) - 0.03) * pw + 0.1 * late, 0.8 * Math.max(0, sin(TAU * q)) * pw); leg(T, sd > 0 ? FR : FL, 0, 0, 0.1 * late); leg(T, RL, 0.03, 0, -0.06 * late); leg(T, RR, 0.03, 0, -0.06 * late); if (S.ram) { T.np += S.ram * e; T.hp += S.ram * 0.4 * e; } }
    else if (an === 'bite') { T.ssy = 0.1 * e; T.by = -0.17 * e; T.bz = -0.13 * e; T.bp = 0.12 * e; T.np = 0.4 * e; T.hp = -0.3 * e; T.jaw = 0.3 + 0.04 * hi; T.tp = 0.7; T.tw = 0; T.bx = hi * 0.004; for (const o of [FL, FR]) leg(T, o, 0.04, 0, 0.1 * e); for (const o of [RL, RR]) leg(T, o, 0.02, 0, -0.02); T.pp = -0.1 * e; }
    else if (an === 'pounce') { T.ssy = 0.14 * e; T.by = -0.27 * e; T.bz = -0.16 * e; T.bp = 0.1 * e; T.pp = -0.18 * e; T.np = 0.34 * e; T.hp = -0.26 * e; T.jaw = 0.18; T.pw = sin(p * 17) * 0.13 * k; T.bx = sin(p * 17) * 0.012 * k; T.tw = sin(p * 10) * 0.7; T.tp = 0.5; T.tc = 0.15; for (const o of [FL, FR]) leg(T, o, 0.03, 0, 0.12 * e); for (const o of [RL, RR]) leg(T, o, 0.04, 0, 0.1 * e); }
    else if (an === 'swipe') { const o = sd > 0 ? FL : FR; T.rear = 0.5 * e; T.pp = 0.25 * e; T.cw = 0.42 * e * sd; T.bw = 0.12 * e * sd; T.hw = -0.3 * e * sd; T.np = 0.3 * e; T.jaw = 0.45 * e; T.by = -0.04 * e; air(T, o, e, 0.34, 0.6 + 0.14 * late, 0.0, -0.8); T.br = 0.06 * e * sd; }
    else if (an === 'slam') { const r = easeOut(clamp(k / 0.65, 0, 1)); T.rear = 1.0 * r + 0.14 * late; T.bz = -0.12 * r; T.pp = 0.5 * r; T.np = 0.45 * r; T.hp = 0.25 * r - 0.25 * late; T.jaw = 0.8 * r; T.bw = 0.05 * hi * (1 - late); for (const o of [FL, FR]) air(T, o, r, 0.14, 0.34 + 0.2 * late, 0.12 - 0.12 * late, -0.4 - 0.5 * late); }
    else if (an === 'spin') { T.rigW = -0.55 * e * sd; T.by = -0.14 * e; T.hw = -0.45 * e * sd; T.nw = -0.3 * e * sd; T.tw = 0.9 * e * sd; T.tp = 0.5; T.br = -0.08 * e * sd; T.jaw = 0.2; for (let i = 0; i < 4; i++) leg(T, i * 8, 0.04, 0, 0); }
    else if (an === 'roar') { T.np = 0.38 * e; T.hp = 0.25 * e; T.by = -0.05 * e; T.bz = -0.07 * e; T.sq = 2.5 * e; T.jaw = 0.05; for (const o of [FL, FR]) leg(T, o, 0.05 * e, 0, 0.05 * e); }
    else if (an === 'kick') { T.bz = 0.08 * e; T.bp = 0.12 * e; T.np = 0.15 * e; T.nw = 0.75 * e * sd; T.hw = 0.55 * e * sd; T.pp = -0.12 * e; T.tp = 0.9; for (const o of [RL, RR]) leg(T, o, 0, 0, 0.14 * e); T.by = -0.03 * e; }
  } else if (st === ST.STRIKE) {
    const s = clamp(p / Math.max(0.05, act.strike || 0.3), 0, 1), e = easeOut(s); glow = an === 'steal' ? 0.1 : 1; eyeK = an === 'steal' ? 1.25 : 2.4; rate = 34; lrate = 40; T.eL = T.eR = 1; T.mane = 1;
    if (an === 'charge') { T.np += 0.12 + (S.ram || 0); T.hp += 0.04 + (S.ram || 0) * 0.4; T.bp += 0.06; T.jaw = 0.1; T.tp += 0.6; }
    else if (an === 'bite') { const snap = s < 0.55 ? 1 : 0; T.ssz = 0.12 * sin(PI * s); T.bz = 0.24 * e; T.by = 0.1 * sin(PI * s); T.bp = lerp(-0.1, 0.12, s); T.np = 0.14; T.hp = -0.08 + 0.15 * s; T.jaw = snap; T.tp = 0.9; T.cp = -0.1 * snap;
      for (const o of [FL, FR]) air(T, o, 1 - smooth(0.55, 0.95, s), 0, 0.14, 0.26, -0.5); for (const o of [RL, RR]) leg(T, o, 0, 0, -0.26 * (1 - s * 0.6), 0.6 * (1 - s)); }
    else if (an === 'pounce') { const h = sin(PI * s), ld = smooth(0.62, 1, s); T.rigY = 0.95 * h * (S.jump || 1); T.rigP = lerp(-0.5, 0.42, s) * (0.4 + 0.6 * h); T.ssz = 0.2 * sin(PI * Math.min(1, s / 0.8)); T.ssy = 0.22 * smooth(0.86, 1, s); T.jaw = 0.85; T.np = -0.1; T.hp = -0.15; T.tp = 1.0; T.tc = -0.1; T.pp = -0.25 * ld; T.cp = -0.12 * (1 - ld);
      const rc = S.reach || 0; for (const o of [FL, FR]) air(T, o, 1, 0.05, 0.2 - 0.22 * ld + rc * 0.25 * (1 - ld), 0.34 - 0.06 * ld + rc * (1 - 0.6 * ld), -0.9 + 0.7 * ld); for (const o of [RL, RR]) air(T, o, 1, 0, 0.1 + 0.1 * ld, -0.4 + 0.5 * ld - rc * 0.5 * (1 - ld), 0.9 - 0.9 * ld); }
    else if (an === 'swipe') { const o = sd > 0 ? FL : FR; T.rear = 0.5 * (1 - e) + 0.05; T.pp = 0.25 * (1 - e); T.cw = lerp(0.42, -0.5, e) * sd; T.bw = lerp(0.12, -0.18, e) * sd; T.hw = 0.15 * e * sd; T.jaw = 0.7; T.bz = 0.12 * e; T.np = 0.15; air(T, o, 1, lerp(0.34, -0.42, e), lerp(0.7, 0.14, s), 0.2 + 0.4 * sin(PI * e), 0.3); T.br = lerp(0.06, -0.1, e) * sd; }
    else if (an === 'slam') { const d = clamp(s / 0.6, 0, 1), dd = d * d, hit = smooth(0.55, 0.65, s); T.ssy = 0.16 * hit * (1 - 0.6 * smooth(0.7, 1, s)); T.rear = lerp(1.14, -0.1, dd); T.bz = lerp(-0.12, 0.1, dd); T.pp = 0.5 * (1 - dd); T.np = 0.45 * (1 - dd) + 0.25 * hit; T.hp = 0.2 * hit; T.jaw = 0.8 * (1 - hit) + 0.2; T.by = -0.12 * hit * (1 - 0.5 * smooth(0.7, 1, s)) + 0.03 * hit * sin(p * 50) * (1 - s);
      for (const o of [FL, FR]) { air(T, o, 1 - hit, 0.14, 0.54 * (1 - dd), 0.1 + 0.25 * dd, -0.9 + 0.9 * dd); leg(T, o, 0.06 * hit, 0, 0.2 * hit); } }
    else if (an === 'spin') { T.rigW = lerp(-0.55, TAU, easeInOut(s)) * sd; T.by = -0.12; T.br = -0.2 * sin(PI * s) * sd; T.tp = 1.1; T.tc = -0.12; T.tw = -0.5 * sd; T.jaw = 0.6; T.hw = 0.4 * sd * (1 - s); T.nw = 0.2 * sd * (1 - s); for (let i = 0; i < 4; i++) leg(T, i * 8, 0.05, Math.max(0, sin(TAU * (s * 3 + i * 0.25))) * 0.1, 0); }
    else if (an === 'roar') { const r = smooth(0, 0.18, s), ho = S.howl || 0; T.np = -0.3 * r - 0.55 * ho * r; T.hp = -0.2 * r - 0.5 * ho * r; T.jaw = (ho ? 0.6 : 1) * r; T.bz = 0.05 * r; T.by = 0.02 * r; T.bx = sin(p * 55) * 0.008; T.hr = sin(p * 47) * 0.03 * (1 - ho); T.sq = -2; T.tp = 0.6; for (const o of [FL, FR]) leg(T, o, 0.07, 0, 0.08); T.pp = -0.06; }
    else if (an === 'kick') { const kk = sin(PI * clamp(s / 0.75, 0, 1)); T.buck = 0.5 * kk; T.np = -0.15 * kk; T.bz = 0.06; T.tp = 1.0; T.nw = 0.4 * sd * (1 - s); for (const o of [RL, RR]) air(T, o, smooth(0, 0.2, s) * (1 - smooth(0.75, 1, s)), 0.02, 0.22 * kk, -0.5 * kk + 0.1, 0.8 * kk); for (const o of [FL, FR]) leg(T, o, 0.02, 0, 0.05); }
  } else if (st === ST.RECOVER) {
    // 撲空（act.whiff，收招多 0.3 秒）：先往前栽——頭栽向地面、前腳一軟、屁股翹起、眼睛擠起來；接著甩頭回神、張嘴喘兩口，才回到收招的樣子
    const R0 = Math.max(0.05, act.recover || 0.6), wf = act.whiff ? 1 : 0, fa = wf * smooth(0, 0.11, p) * (1 - smooth(R0 * 0.38, R0 * 0.62, p)), fs = wf * smooth(R0 * 0.34, R0 * 0.46, p) * (1 - smooth(R0 * 0.7, R0 * 0.86, p)), fp2 = wf * smooth(R0 * 0.45, R0 * 0.6, p) * (1 - smooth(R0 * 0.88, R0, p));
    const r = clamp(p / R0, 0, 1), q = (1 - smooth(0, 0.55, r)) * (1 - fa), w = 1 - r; glow = 0.4 * w; rate = fa > 0.05 ? 18 : 11; T.eL = T.eR = 0.5 * w; T.sq = 2 * sin(t * 9); T.by += 0.012 * sin(t * 9);
    if (an === 'charge') { T.bp = -0.1 * q; T.pp = -0.22 * q; T.by -= 0.08 * q; T.hp = -0.25 * q + 0.15 * (1 - q) * w; T.hw = sin(p * 13) * 0.3 * (1 - q) * w; T.hr = sin(p * 13 + 1) * 0.15 * (1 - q) * w; for (const o of [FL, FR]) leg(T, o, 0.03 * q, 0, 0.2 * q, -0.3 * q); for (const o of [RL, RR]) leg(T, o, 0.04 * q, 0, 0.14 * q); T.tp = 0.8 * w; T.jaw = 0.25 * w; }
    else if (an === 'bite') { T.by -= 0.08 * q; T.np = 0.25 * q; T.hw = sin(p * 22) * 0.3 * q; T.hr = sin(p * 22 + 1) * 0.2 * q; T.jaw = 0.1 * q + 0.15 * w; T.bz = 0.1 * q; }
    else if (an === 'pounce') { T.ssy = 0.2 * q * cos(p * 13); T.by -= 0.22 * q; T.bp = 0.1 * q; T.np = 0.2 * q; T.jaw = 0.3 * w; T.tw = sin(p * 6) * 0.5; for (const o of [FL, FR]) leg(T, o, 0.04 * q, 0, 0.1 * q); }
    else if (an === 'swipe') { T.cw = -0.25 * q * sd; T.bw = -0.1 * q * sd; T.by -= 0.05 * q; T.jaw = 0.3 * w; leg(T, sd > 0 ? FL : FR, -0.1 * q, 0, 0.12 * q); }
    else if (an === 'slam') { T.by -= 0.12 * q; T.np = 0.3 * q; T.hp = 0.15 * q; T.bz = 0.08 * q; T.jaw = 0.25 * w; for (const o of [FL, FR]) leg(T, o, 0.07 * q, 0, 0.2 * q); }
    else if (an === 'spin') { T.by -= 0.08 * q; T.hw = sin(p * 9) * 0.25 * w; T.hr = sin(p * 9 + 1) * 0.12 * w; T.br = sin(p * 7) * 0.05 * w; T.jaw = 0.25 * w; }
    else if (an === 'roar') { T.jaw = 0.35 * q; T.np = 0.1 * q; }
    else if (an === 'kick') { T.by -= 0.05 * q; T.bp = 0.06 * q; for (const o of [RL, RR]) leg(T, o, 0.02, 0, 0.06 * q); }
    if (wf) { const lp = an === 'pounce' ? 1.35 : an === 'bite' ? 0.8 : 1, side = sd > 0 ? FL : FR, oth = sd > 0 ? FR : FL, hs = sin(p * 27);
      T.bp += 0.36 * fa * lp; T.by -= 0.11 * fa * lp; T.bz += 0.09 * fa; T.np += 0.42 * fa; T.hp += 0.3 * fa; T.jaw += 0.35 * fa; T.eye = 1 - 0.6 * fa; T.tp += 0.7 * fa; T.eL = T.eR = -0.35 * fa + 0.5 * w * (1 - fa); T.br += 0.07 * fa * sd; T.pp -= 0.12 * fa;
      leg(T, side, 0.05 * fa, 0, 0.2 * fa, -0.5 * fa); leg(T, oth, -0.02 * fa, 0, 0.07 * fa, 0.3 * fa); leg(T, sd > 0 ? RR : RL, 0, 0.07 * fa, -0.06 * fa, 0.4 * fa);      // 一隻前腳往前撐、另一隻一軟；一隻後腳被甩離地
      T.hw += hs * 0.42 * fs; T.hr += sin(p * 27 + 1) * 0.28 * fs; T.nw += hs * 0.16 * fs; T.eL += abs(hs) * 0.6 * fs; T.eR += abs(hs) * 0.6 * fs; T.eye -= 0.35 * fs; T.np += 0.12 * fs;      // 甩頭回神
      const pb = sin(t * 17 + m.seed); T.jaw += (0.32 + 0.14 * pb) * fp2; T.np += 0.14 * fp2; T.hp -= 0.08 * fp2; T.by += 0.015 * pb * fp2; T.tp -= 0.3 * fp2; T.sq += 3.5 * pb * fp2; }      // 喘
  } else if (st === ST.STAGGER) {
    // 受擊：整個身體被打歪、縮頭閉眼，再甩回來
    const e = Math.exp(-p * 5.5); rate = 30; T.ssy = 0.14 * e * cos(p * 22); T.bz = -0.13 * e; T.by = -0.07 * e; T.bp = -0.14 * e; T.br = (0.2 * sd + hi * 0.07) * e; T.bw = 0.18 * sd * e; T.np = -0.25 * e; T.hp = -0.3 * e; T.hw = -0.5 * sd * e; T.hr = 0.3 * sd * e; T.jaw = 0.5 * e; T.eL = T.eR = 1; T.tp = -0.3 * e; T.eye = p < 0.22 ? 0.1 : 1; T.sq = -2 * e;
    leg(T, sd > 0 ? FL : FR, 0.04, 0.1 * e * abs(sin(p * 16)), -0.1 * e); leg(T, sd > 0 ? RR : RL, 0.05, 0.06 * e * abs(sin(p * 16 + 1)), -0.12 * e); leg(T, sd > 0 ? FR : FL, 0.06 * e, 0, -0.04 * e); leg(T, sd > 0 ? RL : RR, 0.06 * e, 0, -0.05 * e);
  } else if (st === ST.DEAD) {
    // 倒下：腿一軟、側翻、彈一下，躺平
    const k = clamp(p / 0.55, 0, 1), f = k * k * (3 - 2 * k), fall = f * f, b = Math.max(0, sin((p - 0.5) * 9)) * Math.exp(-(p - 0.5) * 6) * (p > 0.5 ? 1 : 0), hgt = m.sp.bones[0].p[1];
    rate = 22; lrate = 22; T.ssy = 0.12 * b; T.rigR = sd * (PI / 2 - 0.06) * fall - sd * 0.1 * b; T.rigY = S.halfW * 0.95 * sin(PI / 2 * fall) + 0.07 * b; T.rigX = sd * hgt * 0.45 * fall; T.by = -0.16 * smooth(0, 0.5, k) * (1 - fall);
    T.np = 0.25 * f; T.nw = -0.2 * f * sd; T.hp = 0.15 * f; T.hr = -0.15 * sd * f; T.jaw = 0.3 * f; T.eye = 0.07; T.tp = -0.3 * f; T.eL = T.eR = 0.4; T.pp = -0.08 * f; T.cp = 0.05 * f;
    const up = sd > 0 ? [FL, RL] : [FR, RR], dn = sd > 0 ? [FR, RR] : [FL, RL];
    air(T, dn[0], f, -0.02, 0.1, 0.16, 0.5); air(T, dn[1], f, -0.02, 0.12, -0.1, 0.4); air(T, up[0], f, 0.02, 0.2, 0.05, 0.7); air(T, up[1], f, 0.02, 0.2, -0.02, 0.6);
  }
  // 眼神（圓潤版）：平常 → 警戒（眉壓低、瞳孔收細）→ 狂暴（眉壓到最低、瞳孔成一條線、眼睛發紅）
  const rage = v.enr && st !== ST.DEAD ? 1 : 0;
  if (m.sp.soft) {
    T.brow = st === ST.DEAD ? -0.3 : st === ST.FLEE ? -0.8 : st === ST.IDLE ? 0.25 * (1 - calm) : st === ST.WARN || st === ST.CHASE ? 0.7 : st === ST.STAGGER ? 0.4 : 1; T.pup = st === ST.FLEE ? 1.5 : st === ST.IDLE ? 1 - 0.3 * (1 - calm) : st === ST.WIND || st === ST.STRIKE ? 0.45 : 0.6;
    if (rage) { T.brow = Math.max(T.brow, 0.9) + 0.4; T.pup = 0.28; T.mane = 1; T.jaw = Math.max(T.jaw, 0.3 + 0.05 * sin(t * 23)); }
  }
  // 各物種自己的姿勢微調（S.pose，可有可無）：共用動作算完之後、平滑之前呼叫，直接改目標姿勢 T（平常的站姿、某一招的尾巴或頭…）
  if (S.pose) { _pq.m = m; _pq.v = v; _pq.st = st; _pq.p = p; _pq.t = t; _pq.an = an; _pq.act = act; _pq.sd = sd; _pq.sp = sp; _pq.calm = calm; _pq.rage = rage; S.pose(T, _pq); }
  // 往目標姿勢靠攏
  const snap = m.snap; m.snap = false;
  const kb = snap ? 1 : 1 - Math.exp(-rate * dt), kl = snap ? 1 : 1 - Math.exp(-lrate * dt);
  C.rigW -= TAU * Math.round((C.rigW - T.rigW) / TAU);
  for (const k of CH) C[k] += (T[k] - C[k]) * kb; for (let i = 0; i < 32; i++) C.L[i] += (T.L[i] - C.L[i]) * kl;
  // 受擊反應（hitCreature）：疊在姿勢上，不經過平滑，命中那一幀就到位
  const Hh = m.hit; let hx = 0, hz = 0, hq = 0, hn = 0, hh = 0, hy = 0;
  if (Hh) { spr(Hh, 'x', 'vx', 15, 0.38, dt); spr(Hh, 'z', 'vz', 15, 0.38, dt); spr(Hh, 'hp', 'vhp', 11, 0.3, dt); spr(Hh, 'hw', 'vhw', 11, 0.3, dt); spr(Hh, 'q', 'vq', 21, 0.3, dt);
    if (Hh.sk > 0) { Hh.skT += dt; Hh.sk = Math.max(0, Hh.sk - dt * 0.55); }
    hx = Hh.x; hz = Hh.z; hq = Hh.q; hn = Hh.hp; hh = Hh.hw + Hh.sk * sin(Hh.skT * 42); hy = -abs(Hh.z) * 0.3;
    if (abs(Hh.x) + abs(Hh.z) + abs(Hh.vx) * 0.05 + abs(Hh.vz) * 0.05 + abs(Hh.hp) + abs(Hh.hw) + abs(Hh.q) + Hh.sk < 0.004 || st === ST.DEAD) m.hit = null; }
  // 套到骨架上
  const R = m.rest, body = Bn[B.body], rear = C.rear * (S.rearK || 1), pit = C.bp - rear + C.buck + hz * 2.2, hp = m.sp.legs[2].j0, shp = m.sp.legs[0].j0, b0 = R[B.body];
  const U = S.u || 1; let dy = C.by * U, dz = C.bz * U;
  if (abs(rear) > 1e-4) { const cs = cos(-rear), sn = sin(-rear), ry = b0.y - hp[1], rz = b0.z - hp[2]; dy += ry * cs - rz * sn - ry; dz += ry * sn + rz * cs - rz; }
  if (abs(C.buck) > 1e-4) { const cs = cos(C.buck), sn = sin(C.buck), ry = b0.y - shp[1], rz = b0.z - shp[2]; dy += ry * cs - rz * sn - ry; dz += ry * sn + rz * cs - rz; }
  body.position.set(b0.x + (C.bx + hx) * U, b0.y + dy + hy * U, b0.z + dz + hz * U); body.rotation.set(pit, C.bw + hx * 0.6, C.br - hx * 1.6, 'YXZ');
  Bn[B.pelvis].rotation.set(C.pp, C.pw, 0); Bn[B.chest].rotation.set(C.cp, C.cw, C.cr); Bn[B.chest].scale.set(1 + C.sq * 0.012, 1 + C.sq * 0.008, 1);
  Bn[B.neck].rotation.set(C.np + hn * 0.6, C.nw + hh * 0.45, C.nr, 'YXZ'); Bn[B.head].rotation.set(C.hp + hn * 0.5, C.hw + hh * 0.6, C.hr - hh * 0.25, 'YXZ'); Bn[B.jaw].rotation.x = Math.max(S.jaw0 || 0, C.jaw) * S.jawMax;
  Bn[B.earL].rotation.set(-C.eL * S.earBack, 0, -C.eL * 0.25 - C.eS); Bn[B.earR].rotation.set(-C.eR * S.earBack, 0, C.eR * 0.25 + C.eS);
  for (const i of [B.mane, m.sp.mane2]) { Bn[i].position.y = R[i].y + C.mane * S.maneUp; Bn[i].position.z = R[i].z + C.mane * S.maneUp * 0.4; }
  if (S.maneK) Bn[B.mane].scale.setScalar(1 + C.mane * S.maneK);
  for (let i = 0; i < m.tailN; i++) Bn[B.tail + i].rotation.set((i ? 0 : C.tp) + C.tc * (i ? 1 : 0.3), C.tw * (i ? 0.55 : 0.5) * (1 + i * 0.25), 0);
  m.rig.position.set(C.rigX, C.rigY, C.rigZ); m.rig.rotation.set(C.rigP, C.rigW, C.rigR, 'YXZ');
  if (S.elastic) { const a = 1 + C.ssz * S.elastic, b = 1 - C.ssy * S.elastic, w = 1 / Math.sqrt(a * b); m.rig.scale.set(w, b * Math.sqrt(1 / a), a * Math.sqrt(1 / b)); }      // 擠壓與伸展（體積大致不變）
  else if (m.sqOn) m.rig.scale.set(1, 1, 1);
  if (hq) { const b = 1 - clamp(hq, -0.6, 0.8) * 0.16, w = 1 / Math.sqrt(Math.max(0.5, b)); m.rig.scale.x *= w; m.rig.scale.y *= b; m.rig.scale.z *= w; m.sqOn = true; }      // 挨打：先壓扁再彈回
  // 順著地形的坡度
  if (dt > 0 || snap) {
    const x = m.root.position.x, z = m.root.position.z, sy = sin(yaw), cy = cos(yaw), Lf = 0.9 * sc, Ws = 0.5 * sc, h0 = Hgt(x, z), hf = Hgt(x + sy * Lf, z + cy * Lf), hb = Hgt(x - sy * Lf, z - cy * Lf), hl = Hgt(x + cy * Ws, z - sy * Ws), hr = Hgt(x - cy * Ws, z + sy * Ws);
    const tx = clamp(-Math.atan2(hf - hb, 2 * Lf), -0.45, 0.45), tz = clamp(Math.atan2(hl - hr, 2 * Ws), -0.35, 0.35), ty = clamp(((hf + hb) / 2 - h0) / sc, -0.25, 0.25) * 0.6, ks = snap ? 1 : 1 - Math.exp(-7 * dt);
    m.sl[0] += (tx - m.sl[0]) * ks; m.sl[1] += (tz - m.sl[1]) * ks; m.sl[2] += (ty - m.sl[2]) * ks; m.tilt.rotation.set(m.sl[0], 0, m.sl[1]); m.tilt.position.y = m.sl[2];
  }
  if (m.sp.v8) anim08(m, v, dt, t, sp, calm);      /* 新模型的額外動作：脊椎蛇行、側傾、頭頸尾耳慢半拍、呼吸（舊模型不經過） */
  if (m.xa) { const X = m.xa, k = dt > 0 ? 1 - Math.exp(-(X.on ? X.k || 6 : 8) * dt) : 0; X.w += ((X.on ? 1 : 0) - X.w) * (snap ? 1 : k); if (!X.on && X.w < 0.003) X.w = 0; }      /* 前掌的「身體座標」目標（bearthreat08）：進出威嚇時淡入淡出 */
  solveLegs(m);
  // 眼睛、受擊閃白、死亡淡出
  const night = W.night || 0, base = (S.graze >= 0.7 && !E ? lerp(1, 0.5, night) : 1) * (E ? 1.9 : 1) * eyeK;
  const op = st === ST.DEAD ? 1 - clamp((p - 2.0) / 1.2, 0, 1) : 1, fading = op < 0.999, mat = m.mats[0];
  if (m.sp.soft) {
    const X = m.sp.X || {}, eo = clamp(C.eye, 0.06, 1.2), bw = C.brow, pu = clamp(C.pup, 0.2, 1.6), ec = m.sp.D.eyeCol || [1, 0.6, 0.06], G = mat.userData.glow.value, kk = st === ST.DEAD ? 0 : 0.16 + 0.5 * night + 0.22 * (eyeK - 1) + (E ? 0.3 : 0), rg = rage * (0.86 + 0.14 * sin(t * 7 + m.seed)), gl = Math.max(glow, rg);
    for (let s = 0; s < 2; s++) {
      const e = s ? X.eyeR : X.eyeL, pb = s ? X.pupR : X.pupL, br = s ? X.browR : X.browL, q = m.restQ[br];
      if (e != null) Bn[e].scale.set(1, eo, 1); if (pb != null) Bn[pb].scale.set(pu, 1 + 0.12 * (1 - pu), 1);
      if (br != null) { _a.set(0, -0.024 * bw, 0.003 * Math.max(0, bw)).applyQuaternion(q); Bn[br].position.copy(R[br]).add(_a); _q1.setFromAxisAngle(ZA, 0.2 * bw * (s ? -1 : 1)); Bn[br].quaternion.copy(q).multiply(_q1); }
    }
    G.setRGB(lerp(ec[0] * kk, 1.05, gl), lerp(ec[1] * kk, 0.04, gl), lerp(ec[2] * kk, 0.012, gl)); mat.userData.dim.value = 0.95 * gl;
    { const of = op * (m.camFade == null ? 1 : m.camFade); mat.userData.fade.value = of; mat.opacity = of; }      // camFade：main.js 在牠擋住鏡頭時調低
  } else {
    m.eye.scale.y = clamp(C.eye, 0.05, 1.2);
    if (st === ST.DEAD) m.mEye.color.setRGB(0.4, 0.4, 0.4); else m.mEye.color.setRGB(lerp(base, 3.2, glow), lerp(base, 0.55, glow), lerp(base, 0.4, glow));
    if (fading !== m.fading) { m.fading = fading; mat.transparent = m.mEye.transparent = fading; mat.needsUpdate = m.mEye.needsUpdate = true; }
    mat.opacity = m.mEye.opacity = op;
  }
  { const f2 = flash * flash, tn = v.ftone | 0, c = tn === 1 ? [0.5, 0.66, 0.95] : tn === 2 ? [1.0, 0.72, 0.3] : [0.95, 0.86, 0.74], R = mat.userData.rim, gold = tn === 2 && !!R, kb = gold ? f2 * f2 * 0.22 : f2 * 0.75, kr = f2 * (gold ? 1.8 : 0.8);
    mat.emissive.setRGB(kb * c[0], kb * c[1], kb * c[2]); if (R) R.value.setRGB(kr * c[0], kr * c[1], kr * c[2]); }      // 受擊閃光：整身平方衰減＋輪廓光；ftone 1 霸體（鋼藍）、2 暴擊／反擊／打斷（金：整身只淡淡一層、輪廓亮，挨打的姿勢看得清楚）
  m.root.visible = op > 0.01;
}
