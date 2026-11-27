// 0.6 場景小道具：13 種採集物（可採／採過／大株）、營火、營地小物。全部用程式生成（幾何＋頂點色），不用外部素材
// 做法參考：風格化低面數道具「先決定鏡頭距離、輪廓要尖銳清楚、顏色單純飽和、用頂點色分部位」；採集物把「能採的部分」做成最顯眼的顏色放在最高處，採過就只剩底座
import * as THREE from './three.bundle.js';
import { W, Hgt } from './world.js';

const TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rng = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const _c0 = new THREE.Color(), _c1 = new THREE.Color(), _m4 = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/* ============================== 幾何組合器 ============================== */
// 把許多小零件併成一個幾何：每個頂點帶顏色與 aPW＝(部位, 隨風擺動的量, 自發光)
// 部位：0 永遠顯示（底座）｜1 可採的部分（採過就收起來）｜2 採過才出現（短莖、缺口、碎屑）｜3 大株才出現的亮點
class Builder {
  constructor() { this.P = []; this.N = []; this.C = []; this.A = []; this.part = 0; this.sway = 0; this.glow = 0; }
  set(part, sway = 0, glow = 0) { this.part = part; this.sway = sway; this.glow = glow; return this; }
  // o：at 位置｜rot [x,y,z]（先繞 Y 轉向、再俯仰、再側滾）｜sc 縮放｜col 顏色或 [下, 上]（依高度漸層）｜gy 漸層的高度範圍｜flat 平面著色｜round 法線由中心往外（低面數的球才圓）｜jit 每個面的明暗差｜sway、glow 個別指定
  add(geo, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal, sc = o.sc == null ? [1, 1, 1] : typeof o.sc === 'number' ? [o.sc, o.sc, o.sc] : o.sc, at = o.at || [0, 0, 0], r = o.rot || [0, 0, 0];
    _m4.compose(_v.set(at[0], at[1], at[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), _s.set(sc[0], sc[1], sc[2])); _n3.getNormalMatrix(_m4);
    const cnt = p.count, V = new Float32Array(cnt * 3), NN = new Float32Array(cnt * 3); let y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < cnt; i++) {
      _a.fromBufferAttribute(p, i); if (o.round) _b.copy(_a).normalize(); else if (n) _b.fromBufferAttribute(n, i); else _b.set(0, 1, 0);
      _a.applyMatrix4(_m4); _b.applyMatrix3(_n3).normalize(); _a.toArray(V, i * 3); _b.toArray(NN, i * 3); y0 = Math.min(y0, _a.y); y1 = Math.max(y1, _a.y);
    }
    if (o.flat) for (let i = 0; i < cnt; i += 3) { _a.set(V[i * 3 + 3] - V[i * 3], V[i * 3 + 4] - V[i * 3 + 1], V[i * 3 + 5] - V[i * 3 + 2]); _b.set(V[i * 3 + 6] - V[i * 3], V[i * 3 + 7] - V[i * 3 + 1], V[i * 3 + 8] - V[i * 3 + 2]); _a.cross(_b).normalize(); for (let k = 0; k < 3; k++) _a.toArray(NN, (i + k) * 3); }
    const col = Array.isArray(o.col) ? o.col : [o.col == null ? 0xffffff : o.col, o.col == null ? 0xffffff : o.col]; _c0.set(col[0]); _c1.set(col[1]);
    const gy = o.gy || [y0, y1], dy = Math.max(1e-5, gy[1] - gy[0]), sway = o.sway != null ? o.sway : this.sway, glow = o.glow != null ? o.glow : this.glow, part = o.part != null ? o.part : this.part, rj = o.jit ? rng(cnt * 31 + this.P.length) : null;
    for (let i = 0; i < cnt; i++) {
      const y = V[i * 3 + 1], t = clamp((y - gy[0]) / dy, 0, 1), j = rj ? 1 + (rj() - 0.5) * 2 * o.jit : 1, jj = rj && o.flat ? (i % 3 === 0 ? (this._j = j) : this._j) : j;
      this.P.push(V[i * 3], y, V[i * 3 + 2]); this.N.push(NN[i * 3], NN[i * 3 + 1], NN[i * 3 + 2]);
      this.C.push(lerp(_c0.r, _c1.r, t) * jj, lerp(_c0.g, _c1.g, t) * jj, lerp(_c0.b, _c1.b, t) * jj); this.A.push(part, sway * Math.max(0, y), glow);
    }
    return this;
  }
  // 亮點（六角星）：位置屬性放中心、法線屬性放「離中心的偏移」，著色器裡依時間縮放 → 一閃一閃
  star(x, y, z, size, col = 0xfff2b0, glow = 3) {
    _c0.set(col); const put = v => { this.P.push(x, y, z); this.N.push(v[0] * size, v[1] * size * 1.25, v[2] * size); this.C.push(_c0.r, _c0.g, _c0.b); this.A.push(3, 0, glow); }, w = 0.15;
    for (let ax = 0; ax < 3; ax++) { const e = k => { const v = [0, 0, 0]; v[ax] = k; return v; }, ring = [0, 1, 2].map(i => { const a = i / 3 * TAU, v = [0, 0, 0]; v[(ax + 1) % 3] = Math.cos(a) * w; v[(ax + 2) % 3] = Math.sin(a) * w; return v; });
      for (let i = 0; i < 3; i++) { const a = ring[i], b = ring[(i + 1) % 3]; put(e(1)); put(a); put(b); put(e(-1)); put(b); put(a); } }
    return this;
  }
  // ao：靠近地面的地方壓暗一點（假的環境遮蔽，東西才像長在地上）
  build(ao = 0.66) {
    const g = new THREE.BufferGeometry(), C = this.C, P = this.P, A = this.A;
    if (ao < 1) for (let i = 0; i < P.length / 3; i++) { if (A[i * 3] > 2.5) continue; const k = lerp(ao, 1, sstep(0, 0.32, P[i * 3 + 1])); C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aPW', new THREE.Float32BufferAttribute(A, 3));
    g.computeBoundingSphere(); g.userData.tris = P.length / 9; return g;
  }
}
// 一片葉子：從原點沿 +Z 長出去；len 長、w 半寬、lift 起始仰角（弧度）、droop 到葉尖總共往下彎多少、seg 節數、crease 兩側翹起的程度、prof 寬度輪廓
function leafGeo(len, w, lift, droop, seg = 3, crease = 0.3, prof) {
  const pos = [], idx = [], pf = prof || (t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85) * 0.92 + 0.08 * (1 - t)); let y = 0, z = 0;
  for (let i = 0; i <= seg; i++) { const t = i / seg, wd = i === seg ? 0 : w * pf(t); pos.push(-wd, y + wd * crease, z, 0, y, z, wd, y + wd * crease, z); const ang = lift - droop * (t + 0.5 / seg); y += Math.sin(ang) * len / seg; z += Math.cos(ang) * len / seg; }
  for (let i = 0; i < seg; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// 不規則的石塊：把十二面體的頂點推亂一點
function rockGeo(seed, amt = 0.22, kind = 12) {
  const g = kind === 20 ? new THREE.IcosahedronGeometry(1, 0) : kind === 8 ? new THREE.OctahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0), p = g.attributes.position, r = rng(seed), map = new Map();
  for (let i = 0; i < p.count; i++) { const k = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join(','); let d = map.get(k); if (!d) { d = [1 + (r() - 0.5) * 2 * amt, 1 + (r() - 0.5) * 2 * amt, 1 + (r() - 0.5) * 2 * amt]; map.set(k, d); } p.setXYZ(i, p.getX(i) * d[0], p.getY(i) * d[1], p.getZ(i) * d[2]); }
  return g;
}
const ico = (r = 1, d = 0) => new THREE.IcosahedronGeometry(r, d), octa = (r = 1) => new THREE.OctahedronGeometry(r, 0), cyl = (rt, rb, h, n = 5, open = false) => { const g = new THREE.CylinderGeometry(rt, rb, h, n, 1, open); g.translate(0, h / 2, 0); return g; };
const lathe = (pts, n = 8) => new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), n);
// 一根莖：從 a 到 b 的細柱（三到五邊）
function stalk(B, a, b, r0, r1, col, n = 3, o = {}) { const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.acos(clamp(d.y / len, -1, 1)); return B.add(cyl(r1, r0, len, n, true), Object.assign({ at: a, rot: [pitch, yaw, 0], col }, o)); }

/* ============================== 13 種採集物 ============================== */
// 每種回傳一個幾何（原點在地面、約 1 公尺高，角色身高 2.4）。配色原則：草地是偏黃的亮綠，所以能採的部分用草地沒有的顏色（紅、金、白、青、橘），葉子用偏藍的綠
const KIND = {
  // 止血草：一叢往上展開的翠綠葉片，中間抽出三枝紅色花苞
  herb_bleed(B, r) {
    B.set(0, 0.05); for (let i = 0; i < 3; i++) B.add(leafGeo(0.34, 0.07, 0.45, 0.9, 2), { rot: [0, i / 3 * TAU + 0.5, 0], col: [0x1f6a3a, 0x3fa050] });
    B.set(1, 0.07); for (let i = 0; i < 6; i++) { const L = 0.6 + r() * 0.2; B.add(leafGeo(L, 0.17, 1.05 + r() * 0.12, 0.85 + r() * 0.25, 3, 0.42), { rot: [0, i / 6 * TAU + r() * 0.4, 0], col: [0x0f7a40, 0x7fe890], gy: [0, 0.7] }); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.9, h = [1.0, 0.86, 0.93][i], tx = Math.sin(a) * 0.13, tz = Math.cos(a) * 0.13; stalk(B, [tx * 0.3, 0.1, tz * 0.3], [tx, h, tz], 0.016, 0.012, [0x2f8a4a, 0x9a4a30]);
      B.add(ico(0.08), { at: [tx, h + 0.04, tz], sc: [1, 1.4, 1], round: true, col: [0xb81a12, 0xff5038] }); B.add(octa(0.05), { at: [tx + 0.065, h - 0.03, tz + 0.02], round: true, col: 0xe8341e }); }
    B.set(2, 0); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.3; stalk(B, [Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03], [Math.sin(a) * 0.09, 0.15 + r() * 0.08, Math.cos(a) * 0.09], 0.026, 0.022, [0x2f7a40, 0xd8f0b0], 3); }
    B.star(0.1, 1.2, 0.05, 0.1).star(-0.24, 0.8, 0.16, 0.07).star(0.2, 0.62, -0.2, 0.06);
  },
  // 野莓：圓圓的深綠矮叢，表面點綴成串的莓果
  berry(B, r) {
    B.set(0, 0.03); const lobes = [[0, 0.42, 0, 0.44, 0.92], [0.3, 0.3, 0.1, 0.3, 0.9], [-0.28, 0.32, -0.06, 0.32, 0.9], [0.02, 0.3, -0.3, 0.28, 0.9], [-0.05, 0.28, 0.3, 0.27, 0.9]];
    for (const [x, y, z, s, k] of lobes) B.add(ico(1), { at: [x, y, z], sc: [s * 1.08, s * k, s * 1.08], rot: [r() * 3, r() * 6, 0], round: true, col: [0x1d5a2c, 0x4e9a3e], gy: [0, 0.85] });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4; B.add(leafGeo(0.22, 0.08, 0.5, 0.5, 2), { at: [Math.sin(a) * 0.36, 0.5 + r() * 0.24, Math.cos(a) * 0.36], rot: [0, a, 0], col: [0x2f7a34, 0x6cb84a] }); }
    B.set(1, 0.03); const spots = [[0.1, 0.84, 0.16], [-0.2, 0.74, 0.2], [0.34, 0.6, 0.3], [0.44, 0.52, -0.06], [-0.44, 0.56, 0.02], [-0.16, 0.8, -0.2], [0.2, 0.66, -0.36], [-0.3, 0.5, 0.38], [0.06, 0.5, 0.52]];
    for (const [x, y, z] of spots) { B.add(octa(0.085), { at: [x, y, z], round: true, col: [0x9c0f3a, 0xff3f72] }); B.add(octa(0.06), { at: [x + 0.075, y - 0.045, z + 0.03], round: true, col: [0xa81040, 0xf03a6a] }); }
    B.set(2, 0.03); for (const [x, y, z] of spots.slice(0, 3)) B.add(octa(0.035), { at: [x, y - 0.02, z], round: true, col: 0x9fd070 });
    B.star(0.0, 1.08, 0.1, 0.1).star(0.42, 0.8, 0.2, 0.07).star(-0.4, 0.78, -0.1, 0.06);
  },
  // 麥穗：一束金黃的麥稈，飽滿的穗往外垂
  wheat(B, r) {
    B.set(0, 0.05); for (let i = 0; i < 2; i++) B.add(leafGeo(0.4, 0.035, 0.7, 0.9, 2), { rot: [0, i * 2.6 + 0.4, 0], col: [0x7a8a2e, 0xc9c05a] });
    B.set(1, 0.09); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r() * 0.5, lean = 0.05 + r() * 0.13, h = 0.98 + r() * 0.26, bx = Math.sin(a) * 0.04, bz = Math.cos(a) * 0.04, tx = bx + Math.sin(a) * lean * h, tz = bz + Math.cos(a) * lean * h;
      stalk(B, [bx, 0, bz], [tx, h, tz], 0.017, 0.012, [0xa8902e, 0xe8c85a]);
      B.add(lathe([[0, 0], [0.064, 0.1], [0.045, 0.25], [0, 0.35]], 4), { at: [tx, h - 0.02, tz], rot: [0.5 + r() * 0.35, a, 0], col: [0xd9a62e, 0xffe27a] });
      B.add(leafGeo(0.14, 0.012, 0.9, 0.1, 1, 0), { at: [tx + Math.sin(a) * 0.12, h + 0.2, tz + Math.cos(a) * 0.12], rot: [0, a, 0], col: 0xfff0a0 }); }
    B.add(leafGeo(0.62, 0.04, 1.2, 1.5, 3), { rot: [0, 1.1, 0], col: [0x8a8a2e, 0xdccf6a] }); B.add(leafGeo(0.55, 0.04, 1.15, 1.6, 3), { rot: [0, 4.0, 0], col: [0x8a8a2e, 0xdccf6a] });
    B.set(2, 0.02); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, d = 0.03 + r() * 0.05; stalk(B, [Math.sin(a) * d, 0, Math.cos(a) * d], [Math.sin(a) * d * 2.2, 0.16 + r() * 0.14, Math.cos(a) * d * 2.2], 0.02, 0.017, [0x8a7a3a, 0xf0e2a8]); }
    B.star(0.05, 1.42, 0, 0.1).star(-0.3, 1.1, 0.14, 0.07).star(0.28, 1.0, -0.18, 0.06);
  },
  // 水芹：水邊一叢圓圓的嫩綠葉子，頂上開白色小花
  cress(B, r) {
    const pad = (x, y, z, s, a, tilt, c) => { stalk(B, [x * 0.25, 0, z * 0.25], [x, y, z], 0.014, 0.011, [0x3a8a3a, 0x7ac85a]); B.add(new THREE.ConeGeometry(s, s * 0.24, 7, 1, true), { at: [x, y, z], rot: [Math.PI + tilt, a, 0], col: c || [0x2f9a2c, 0x9cec58], gy: [y - 0.06, y + 0.08] }); };
    B.set(0, 0.04); pad(0.2, 0.14, 0.1, 0.1, 0.5, 0.3, [0x2f8030, 0x70c050]); pad(-0.16, 0.12, -0.14, 0.09, 3.6, 0.3, [0x2f8030, 0x70c050]);
    B.set(1, 0.06); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + r() * 0.5, d = 0.1 + r() * 0.22, h = 0.3 + r() * 0.3; pad(Math.sin(a) * d, h, Math.cos(a) * d, 0.12 + r() * 0.045, a, 0.25 + r() * 0.3); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.6, d = 0.09, h = 0.66 + i * 0.06; stalk(B, [0, 0.2, 0], [Math.sin(a) * d, h, Math.cos(a) * d], 0.012, 0.01, [0x3a8a3a, 0x9ad870]); B.add(new THREE.ConeGeometry(0.095, 0.04, 5, 1, true), { at: [Math.sin(a) * d, h, Math.cos(a) * d], rot: [Math.PI, a, 0], col: 0xffffff }); B.add(octa(0.03), { at: [Math.sin(a) * d, h + 0.02, Math.cos(a) * d], round: true, col: 0xffd84a }); }
    B.set(2, 0.02); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.2; stalk(B, [0, 0, 0], [Math.sin(a) * 0.08, 0.12 + r() * 0.06, Math.cos(a) * 0.08], 0.02, 0.017, [0x3a8a3a, 0xd0f0a8]); }
    B.star(0.02, 1.0, 0, 0.09).star(0.3, 0.6, 0.12, 0.065).star(-0.26, 0.56, -0.15, 0.06);
  },
  // 樹蔭菇：三朵胖胖的菇，橘褐色的傘、米色的柄
  mushroom(B, r) {
    const cap = (x, y, z, s, n, tilt, yaw) => { B.add(lathe([[0, 0.62], [0.5, 0.54], [0.9, 0.28], [1.0, 0.0], [0.34, 0.04]], n), { at: [x, y, z], sc: s, rot: [tilt, yaw, 0], col: [0x9a4a22, 0xf2a052], gy: [y - 0.1 * s, y + 0.62 * s] }); };
    const stem = (x, z, h, s, part) => B.add(cyl(0.21 * s, 0.3 * s, h, 6, true), { at: [x, 0, z], col: [0xcdb894, 0xfff4dc], part });
    B.set(0, 0); stem(-0.3, 0.2, 0.1, 0.34); B.add(ico(0.085), { at: [-0.3, 0.13, 0.2], sc: [1, 0.75, 1], round: true, col: [0xb8642e, 0xe89a52] });
    B.set(1, 0.015); stem(0, 0, 0.42, 0.42); cap(0, 0.4, 0, 0.36, 8, 0.1, 0.4); stem(0.33, 0.12, 0.26, 0.34); cap(0.33, 0.25, 0.12, 0.25, 7, -0.16, 1.2); stem(-0.14, -0.28, 0.17, 0.28); cap(-0.14, 0.16, -0.28, 0.19, 6, 0.2, 3);
    for (const [a, d, s] of [[0.5, 0.2, 0.05], [2.4, 0.16, 0.042], [4.3, 0.22, 0.045], [5.6, 0.07, 0.036]]) B.add(octa(1), { at: [Math.sin(a) * d, 0.61 - d * d * 1.1, Math.cos(a) * d], sc: [s, s * 0.35, s], round: true, col: 0xfff0d2 });
    B.set(2, 0); B.add(cyl(0.085, 0.12, 0.13, 5), { col: [0xcdb894, 0xfff8e6] }); B.add(cyl(0.065, 0.09, 0.09, 5), { at: [0.33, 0, 0.12], col: [0xcdb894, 0xfff8e6] }); B.add(cyl(0.05, 0.07, 0.07, 5), { at: [-0.14, 0, -0.28], col: [0xcdb894, 0xfff8e6] });
    B.star(0.0, 0.86, 0, 0.09).star(0.4, 0.52, 0.2, 0.065).star(-0.3, 0.44, -0.3, 0.06);
  },
  // 低語苔：潭邊石頭上一團團青綠色的苔，冒出細細的孢子莖，夜裡發青光
  moss(B, r) {
    B.set(0, 0); B.add(rockGeo(7, 0.2), { at: [0, 0.14, 0], sc: [0.5, 0.27, 0.4], flat: true, jit: 0.07, col: [0x5d605c, 0x979a90] }); B.add(rockGeo(9, 0.2), { at: [0.36, 0.08, 0.14], sc: [0.24, 0.15, 0.2], flat: true, jit: 0.07, col: [0x5d605c, 0x8a8d84] });
    for (const [x, z, s] of [[-0.2, 0.1, 0.16], [0.14, -0.14, 0.13], [0.2, 0.16, 0.1]]) B.add(octa(1), { at: [x, 0.33, z], sc: [s, 0.035, s], round: true, col: 0x2a6f5e });
    B.set(1, 0, -0.5); const cush = [[-0.16, 0.36, 0.06, 0.2], [0.14, 0.38, -0.08, 0.18], [0.02, 0.4, 0.14, 0.15], [-0.04, 0.37, -0.2, 0.13], [0.38, 0.2, 0.14, 0.12]];
    for (const [x, y, z, s] of cush) B.add(ico(1), { at: [x, y, z], sc: [s, s * 0.62, s], rot: [0, r() * 6, 0], round: true, col: [0x16806c, 0x62e0ba], gy: [y - s * 0.4, y + s * 0.6] });
    B.set(1, 0.05, -3.2); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r(), d = 0.06 + r() * 0.2, x = Math.sin(a) * d, z = Math.cos(a) * d, h = 0.6 + r() * 0.2; stalk(B, [x, 0.4, z], [x * 1.25, h, z * 1.25], 0.011, 0.008, [0x3fae96, 0x9ff5e6], 3, { glow: -1.2 }); B.add(octa(0.04), { at: [x * 1.25, h + 0.02, z * 1.25], sc: [1, 1.3, 1], round: true, col: 0xb8fff0 }); }
    B.star(0.0, 1.0, 0, 0.09, 0xc8fff4).star(0.34, 0.6, 0.2, 0.065, 0xc8fff4).star(-0.32, 0.55, -0.1, 0.06, 0xc8fff4);
  },
  // 熊徑蔘：一根莖撐開一圈掌狀的金綠大葉，中央一簇紅果；根頭露出土面
  ginseng(B, r) {
    B.set(0, 0.03); for (let i = 0; i < 2; i++) B.add(leafGeo(0.22, 0.06, 0.4, 0.7, 2), { rot: [0, i * 3 + 1, 0], col: [0x4a7a2a, 0x8ab040] });
    B.set(1, 0.045); B.add(lathe([[0, 0.26], [0.1, 0.22], [0.12, 0.1], [0.08, 0]], 6), { col: [0xb88a4e, 0xf8e0b2] }); for (const a of [0.6, 2.8, 4.6]) B.add(new THREE.ConeGeometry(0.035, 0.24, 4, 1, true), { at: [Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14], rot: [1.9, a, 0], col: [0xc9a066, 0xf0d6a4] });
    stalk(B, [0, 0.22, 0], [0.02, 0.8, 0], 0.03, 0.022, [0x8a8a3a, 0xa9bc48], 4);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, hx = 0.02 + Math.sin(a) * 0.12, hz = Math.cos(a) * 0.12; stalk(B, [0.02, 0.8, 0], [hx, 0.86, hz], 0.014, 0.012, 0xa9bc48);
      for (const [da, L, w] of [[0, 0.46, 0.12], [0.7, 0.34, 0.095], [-0.7, 0.34, 0.095]]) B.add(leafGeo(L, w, 0.2, 0.7, 2, 0.35), { at: [hx, 0.86, hz], rot: [0, a + da, 0], col: [0x6f9a1a, 0xe8d83a], gy: [0.72, 0.94] }); }
    stalk(B, [0.02, 0.8, 0], [0.02, 1.04, 0], 0.014, 0.012, 0xa9bc48); B.add(ico(0.075), { at: [0.02, 1.1, 0], round: true, col: [0xc01818, 0xff5038] }); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; B.add(octa(0.06), { at: [0.02 + Math.sin(a) * 0.085, 1.045, Math.cos(a) * 0.085], round: true, col: [0xb01414, 0xf04028] }); }
    B.set(2, 0); B.add(new THREE.TorusGeometry(0.15, 0.06, 4, 7), { at: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], sc: [1, 1, 0.8], flat: true, jit: 0.1, col: [0x4a3320, 0x7a5a38] }); stalk(B, [0.03, 0, 0], [0.06, 0.12, 0.02], 0.02, 0.016, [0x7a7a3a, 0xd8e0a0], 4);
    B.star(0.02, 1.34, 0, 0.1).star(0.42, 1.0, 0.14, 0.07).star(-0.4, 0.96, -0.12, 0.06);
  },
  // 鐵礦石：暖灰岩塊上一顆顆突出的鐵灰色礦塊，周圍滲出鏽紅的礦脈（正面朝 +Z，可以靠在岩壁上）
  ore_iron(B, r) {
    const rock = [0x77695c, 0xc0b09e];
    B.set(0, 0); B.add(rockGeo(3, 0.2), { at: [0, 0.46, -0.1], sc: [0.62, 0.6, 0.42], rot: [-0.12, 0.3, 0], flat: true, jit: 0.06, col: rock }); B.add(rockGeo(5, 0.22, 20), { at: [0.5, 0.26, 0.02], sc: [0.34, 0.32, 0.3], rot: [0, 1.2, 0.1], flat: true, jit: 0.06, col: rock, gy: [0, 1] }); B.add(rockGeo(8, 0.22, 20), { at: [-0.5, 0.2, 0.06], sc: [0.28, 0.24, 0.26], rot: [0, 2.2, 0], flat: true, jit: 0.06, col: rock, gy: [0, 1] });
    const nug = [[-0.22, 0.66, 0.3, 0.17], [0.16, 0.5, 0.36, 0.2], [0.06, 0.88, 0.2, 0.14], [-0.3, 0.34, 0.34, 0.14], [0.5, 0.42, 0.22, 0.15], [-0.52, 0.34, 0.24, 0.11]];
    nug.forEach(([x, y, z, s], i) => B.add(rockGeo(70 + i, 0.2, 8), { at: [x, y - s * 0.2, z - s * 0.42], sc: [s * 1.35, s * 1.25, s * 0.5], rot: [0, 0, i], flat: true, jit: 0.1, col: [0x8a3210, 0xc8602a] }));      // 礦塊周圍的鏽色（採掉以後還留著，變成缺口的邊）
    B.set(1, 0, 0.04); nug.forEach(([x, y, z, s], i) => B.add(rockGeo(20 + i, 0.3, 20), { at: [x, y, z], sc: [s, s * 0.9, s * 0.8], rot: [r() * 3, r() * 3, 0], flat: true, jit: 0.2, col: [0x2c3140, 0x9aa2b8] }));
    B.set(2, 0); nug.forEach(([x, y, z, s], i) => B.add(rockGeo(40 + i, 0.25, 8), { at: [x, y, z - s * 0.42], sc: [s * 0.8, s * 0.7, s * 0.5], flat: true, jit: 0.1, col: [0x241c18, 0x3c2a22] }));
    for (const [x, z, s] of [[0.1, 0.62, 0.07], [-0.24, 0.56, 0.055], [0.4, 0.5, 0.05], [-0.02, 0.76, 0.04]]) B.add(rockGeo(60 + x * 10, 0.3, 8), { at: [x, s * 0.6, z], sc: s, flat: true, jit: 0.15, col: [0x3a3c48, 0x8a8e9c] });
    B.star(0.0, 1.28, 0.1, 0.1, 0xeaf2ff).star(0.5, 0.86, 0.3, 0.07, 0xeaf2ff).star(-0.46, 0.7, 0.3, 0.06, 0xeaf2ff);
    for (let i = 0; i < B.P.length; i++) B.P[i] *= 1.35;      // 礦脈要比人的腰高，才像岩壁上的一塊
  },
  // 岩鹽：淺色岩座上一簇帶粉紅的白色方柱結晶
  salt(B, r) {
    B.set(0, 0); B.add(rockGeo(11, 0.2), { at: [0, 0.14, 0], sc: [0.56, 0.24, 0.44], flat: true, jit: 0.06, col: [0x9c8c7c, 0xd9cdc0] }); B.add(rockGeo(13, 0.2, 20), { at: [-0.42, 0.1, 0.16], sc: [0.24, 0.16, 0.2], flat: true, jit: 0.06, col: [0x9c8c7c, 0xcfc2b4] });
    for (const [x, z, s] of [[0.2, 0.24, 0.12], [-0.14, 0.2, 0.1]]) B.add(octa(1), { at: [x, 0.3, z], sc: [s, 0.03, s], round: true, col: 0xf4eeee });
    const xt = (x, z, h, w, tilt, yaw, part) => { B.add(cyl(w * 0.8, w, h, 4, true), { at: [x, 0.24, z], rot: [tilt, yaw, 0], flat: true, jit: 0.05, col: [0xeab4bc, 0xffffff], part }); const tx = x + Math.sin(yaw) * Math.sin(tilt) * h, tz = z + Math.cos(yaw) * Math.sin(tilt) * h, ty = 0.24 + Math.cos(tilt) * h; B.add(new THREE.ConeGeometry(w * 0.8, w * 1.0, 4, 1, true), { at: [tx + Math.sin(yaw) * Math.sin(tilt) * w * 0.5, ty + Math.cos(tilt) * w * 0.5, tz + Math.cos(yaw) * Math.sin(tilt) * w * 0.5], rot: [tilt, yaw, 0], flat: true, jit: 0.05, col: [0xfff4f4, 0xffffff], part }); };
    const xs = [[0, -0.04, 0.62, 0.15, 0.06, 0.4], [0.24, 0.04, 0.44, 0.12, 0.42, 1.4], [-0.22, 0.02, 0.4, 0.115, 0.4, 4.6], [0.06, 0.2, 0.3, 0.1, 0.5, 0.2], [-0.06, -0.24, 0.34, 0.1, 0.45, 3.2], [0.36, -0.16, 0.24, 0.085, 0.7, 2.2]];
    B.set(1, 0, 0.06); for (const [x, z, h, w, tilt, yaw] of xs) xt(x, z, h, w, tilt, yaw, 1);
    B.set(2, 0); for (const [x, z, h, w, tilt, yaw] of xs.slice(0, 3)) B.add(cyl(w * 0.7, w, 0.09 + w * 0.3, 4), { at: [x, 0.24, z], rot: [tilt * 0.6, yaw, 0.2], flat: true, jit: 0.05, col: [0xdca8b0, 0xf8ecec] });
    for (const [x, z] of [[0.3, 0.5], [-0.2, 0.52], [0.52, 0.3]]) B.add(octa(0.05), { at: [x, 0.03, z], sc: [1, 0.6, 1], flat: true, col: 0xf6f0f0 });
    B.star(0.0, 1.16, 0, 0.1, 0xffffff).star(0.4, 0.7, 0.2, 0.07, 0xffffff).star(-0.36, 0.66, 0.1, 0.06, 0xffffff);
    for (let i = 0; i < B.P.length; i++) B.P[i] *= 1.3;
  },
  // 舊鐵件：半埋在土裡的齒輪、一截粗鐵鍊與彎掉的鐵條，深鐵色帶鏽斑
  scrap(B, r) {
    const rust = [0x5c2c18, 0xa85a30], iron = [0x30323a, 0x7a7e8a];
    B.set(0, 0); B.add(new THREE.BoxGeometry(0.46, 0.05, 0.3), { at: [-0.3, 0.04, -0.2], rot: [0.3, 0.5, 0.1], flat: true, jit: 0.08, col: rust }); B.add(new THREE.TorusGeometry(0.1, 0.035, 4, 5), { at: [0.4, 0.015, -0.2], rot: [1.35, 0, 0.4], flat: true, col: iron });
    B.set(1, 0); { const at = [-0.06, 0.3, -0.1], rot = [1.15, 0.5, 0.0];      // 齒輪：半截埋在土裡斜插著
      B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 8), { at, rot, flat: true, jit: 0.1, col: iron, gy: [0, 0.6] }); for (let i = 0; i < 4; i++) { const g = new THREE.BoxGeometry(0.78, 0.085, 0.13); g.rotateY(i * Math.PI / 4); B.add(g, { at, rot, flat: true, jit: 0.1, col: i % 2 ? rust : iron, gy: [0, 0.6] }); }
      B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6), { at, rot, flat: true, col: rust }); }
    B.add(new THREE.BoxGeometry(0.075, 0.9, 0.075), { at: [0.36, 0.38, -0.02], rot: [0.25, 0.3, -0.42], flat: true, jit: 0.08, col: iron }); B.add(new THREE.BoxGeometry(0.075, 0.3, 0.075), { at: [0.6, 0.78, -0.06], rot: [0.25, 0.3, -1.5], flat: true, jit: 0.08, col: rust });
    for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(0.11, 0.04, 4, 6), { at: [-0.34 + i * 0.2, 0.1 + (i === 1 ? 0.05 : 0), 0.36 - i * 0.04], rot: [i % 2 ? 0.25 : 1.35, 0.25 * i, 0.2], sc: [1.3, 1, 1], flat: true, jit: 0.1, col: i === 1 ? rust : iron });
    B.star(0.0, 0.98, 0, 0.09).star(0.5, 0.5, 0.3, 0.065).star(-0.46, 0.6, 0.1, 0.06);
    for (let i = 0; i < B.P.length; i++) B.P[i] *= 1.15;      // 整體放大一點
  },
  // 霜薄荷：一節一節對生的冰綠葉子往上疊成小塔，葉尖帶霜白，頂端淡紫花穗
  mint(B, r) {
    B.set(0, 0.03); for (let i = 0; i < 3; i++) B.add(leafGeo(0.2, 0.08, 0.3, 0.5, 2), { rot: [0, i / 3 * TAU, 0], col: [0x2a9a80, 0x8fe0c8] });
    const st = (x, z, h, tiers, lean, a) => { const tx = x + Math.sin(a) * lean, tz = z + Math.cos(a) * lean; stalk(B, [x, 0, z], [tx, h, tz], 0.022, 0.015, [0x2f9a80, 0xa8ecd8]);
      for (let k = 0; k < tiers; k++) { const t = (k + 0.8) / (tiers + 0.5), y = h * t, L = lerp(0.3, 0.17, t); for (const s of [0, Math.PI]) B.add(leafGeo(L, L * 0.5, 0.5, 0.5, 2, 0.4), { at: [lerp(x, tx, t), y, lerp(z, tz, t)], rot: [0, a + k * 1.57 + s, 0], col: [0x1fae90, 0xf4fffc], gy: [y - 0.02, y + 0.13] }); }
      B.add(octa(1), { at: [tx, h + 0.09, tz], sc: [0.05, 0.12, 0.05], col: [0x8a74e0, 0xf0e8ff] }); };
    B.set(1, 0.05); st(0, 0, 0.9, 3, 0.03, 0); st(0.19, 0.08, 0.68, 2, 0.12, 1.1); st(-0.17, 0.1, 0.74, 2, 0.12, 5.2); st(0.02, -0.21, 0.6, 2, 0.12, 3.1); st(0.06, 0.22, 0.5, 2, 0.12, 0.2);
    B.set(2, 0.02); for (const [x, z, a] of [[0, 0, 0], [0.19, 0.08, 1.1], [-0.17, 0.1, 5.2], [0.02, -0.21, 3.1]]) { stalk(B, [x, 0, z], [x, 0.14, z], 0.022, 0.019, [0x2f9a80, 0xe0fff4], 3); B.add(leafGeo(0.12, 0.05, 0.3, 0.4, 2), { at: [x, 0.07, z], rot: [0, a, 0], col: [0x38a88e, 0xc8f4e6] }); }
    B.star(0.02, 1.3, 0, 0.1, 0xe8fffa).star(0.36, 0.86, 0.12, 0.07, 0xe8fffa).star(-0.32, 0.9, 0.1, 0.06, 0xe8fffa);
  },
  // 野蜂蜜：老樹樁上的金黃蜂巢，蜜往下滴，幾隻蜜蜂繞著
  honey(B, r) {
    B.set(0, 0); B.add(cyl(0.29, 0.36, 0.62, 7), { flat: false, col: [0x4a2f1c, 0x805a38] }); B.add(new THREE.CircleGeometry(0.25, 7), { at: [0, 0.625, 0], rot: [-Math.PI / 2, 0, 0], col: 0xd2ac74 }); B.add(new THREE.CircleGeometry(0.12, 7), { at: [0.02, 0.632, 0.01], rot: [-Math.PI / 2, 0, 0], col: 0xb88e58 });
    for (const a of [0.4, 2.5, 4.4]) B.add(new THREE.ConeGeometry(0.15, 0.5, 4, 1, true), { at: [Math.sin(a) * 0.36, 0.1, Math.cos(a) * 0.36], rot: [1.25, a, 0], flat: true, col: [0x4a2f1c, 0x6f4c2e] });
    B.add(ico(1), { at: [-0.2, 0.62, -0.12], sc: [0.14, 0.05, 0.12], round: true, col: 0x4f9c3c });
    B.set(1, 0); const prof = [[0.1, 0], [0.21, 0.08], [0.18, 0.13], [0.265, 0.2], [0.225, 0.26], [0.27, 0.34], [0.22, 0.41], [0.2, 0.48], [0.1, 0.57], [0, 0.6]];
    { const g = lathe(prof, 7).toNonIndexed(), base = B.P.length / 3; B.add(g, { at: [0.04, 0.63, 0.02], rot: [0.1, 0.3, 0], col: [0xd28a14, 0xffd65a] });
      for (let i = base; i < B.P.length / 3; i++) { const y = (B.P[i * 3 + 1] - 0.63) / 0.6, groove = [0.22, 0.42, 0.66].some(q => Math.abs(y - q) < 0.035) ? 0.62 : 1; B.C[i * 3] *= groove; B.C[i * 3 + 1] *= groove * groove; B.C[i * 3 + 2] *= groove; } }
    B.add(new THREE.CircleGeometry(0.065, 6), { at: [0.1, 0.86, 0.275], rot: [-0.1, 0.25, 0], sc: [1, 1.2, 1], col: 0x2a1604 });
    for (const [x, y, z, s] of [[0.2, 0.55, 0.26, 0.055], [0.22, 0.4, 0.27, 0.04], [-0.12, 0.58, 0.28, 0.045]]) B.add(octa(1), { at: [x, y, z], sc: [s, s * 1.7, s], round: true, col: [0xf09a10, 0xffc83a], glow: 0.25 });
    for (const [x, y, z] of [[0.42, 1.0, 0.2], [-0.3, 1.12, 0.1], [0.1, 1.32, -0.2], [-0.2, 0.8, 0.4]]) B.add(octa(0.045), { at: [x, y, z], sc: [1.5, 1, 1], round: true, col: [0x3a2408, 0xffc21e], gy: [y - 0.02, y + 0.03], sway: 0.5 });
    B.set(2, 0); B.add(lathe([[0.1, 0], [0.2, 0.08], [0.16, 0.12], [0.1, 0.1]], 7), { at: [0.04, 0.63, 0.02], col: [0x7a5a2a, 0xb89a5a] }); B.add(new THREE.CircleGeometry(0.07, 6), { at: [-0.14, 0.645, 0.1], rot: [-Math.PI / 2, 0, 0], col: 0xc9a04a });
    B.star(0.04, 1.42, 0, 0.1).star(0.42, 0.9, 0.2, 0.07).star(-0.36, 0.8, 0.16, 0.06);
  },
  // 鳥蛋：蘆葦叢裡的樹枝巢，三顆淡青色的蛋
  egg(B, r) {
    B.set(0, 0.05); for (let i = 0; i < 4; i++) { const a = 2.2 + i * 0.62 + r() * 0.2; B.add(leafGeo(0.95 + r() * 0.4, 0.04, 1.36, 0.5 + r() * 0.3, 3), { at: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], rot: [0, a, 0], col: [0x5f7a30, 0xc4cf72] }); }
    stalk(B, [-0.1, 0, -0.34], [-0.16, 1.12, -0.42], 0.016, 0.012, [0x6a7a34, 0xa8a85a]); B.add(cyl(0.04, 0.04, 0.22, 5), { at: [-0.16, 1.02, -0.42], rot: [-0.07, 0, 0.05], col: [0x5a3418, 0x8a5a30], sway: 0.05 });
    B.set(0, 0); B.add(ico(1), { at: [0, 0.06, 0], sc: [0.4, 0.14, 0.4], round: true, col: [0x5a4a26, 0x8a7a3e] });
    B.add(new THREE.TorusGeometry(0.27, 0.1, 5, 9), { at: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], sc: [1, 1, 0.85], flat: true, jit: 0.2, col: [0x5a3c20, 0xb08a52] }); B.add(new THREE.CircleGeometry(0.24, 7), { at: [0, 0.17, 0], rot: [-Math.PI / 2, 0, 0], col: 0x3f2c18 });
    for (const [a, L] of [[0.3, 0.3], [2.0, 0.26], [3.5, 0.3], [5.1, 0.24]]) stalk(B, [Math.sin(a) * 0.28, 0.24, Math.cos(a) * 0.28], [Math.sin(a + 0.5) * (0.3 + L * 0.5), 0.3, Math.cos(a + 0.5) * (0.3 + L * 0.5)], 0.016, 0.012, [0x7a5a34, 0xc8a46a]);
    B.set(1, 0); for (const [x, z, a] of [[0.1, 0.08, 0.2], [-0.11, 0.05, -0.25], [0.0, -0.12, 0.1]]) B.add(ico(0.115), { at: [x, 0.31, z], sc: [1, 1.32, 1], rot: [a, 0, a], round: true, col: [0x9ed8cc, 0xffffff], gy: [0.2, 0.46] });
    B.set(2, 0); B.add(leafGeo(0.2, 0.04, 0.2, 0.2, 2), { at: [-0.05, 0.2, 0.02], rot: [0, 0.8, 0], col: 0xffffff });
    B.star(0.0, 0.78, 0, 0.09, 0xf4fffa).star(0.36, 0.5, 0.14, 0.065, 0xf4fffa).star(-0.3, 0.52, 0.2, 0.06, 0xf4fffa);
  }
};
export const GATHER_KINDS = Object.keys(KIND);
// 每種的參考尺寸：h 高度（公尺）、r 佔地半徑、wall 要靠著岩壁擺（正面朝 +Z）、tool 需要礦鎬
export const GATHER_INFO = { herb_bleed: { h: 1.05, r: 0.45 }, berry: { h: 0.95, r: 0.6 }, wheat: { h: 1.3, r: 0.4 }, cress: { h: 0.75, r: 0.4 }, mushroom: { h: 0.6, r: 0.5 }, moss: { h: 0.8, r: 0.55 }, ginseng: { h: 1.1, r: 0.45 }, ore_iron: { h: 1.5, r: 1.1, wall: true, tool: true }, salt: { h: 1.25, r: 0.85, wall: true, tool: true }, scrap: { h: 0.95, r: 0.7 }, mint: { h: 0.95, r: 0.35 }, honey: { h: 1.25, r: 0.5 }, egg: { h: 1.3, r: 0.5 } };
const geoCache = new Map();
function gatherGeo(kind) { let g = geoCache.get(kind); if (!g) { const B = new Builder(); (KIND[kind] || KIND.herb_bleed)(B, rng(kind.length * 977 + kind.charCodeAt(0) * 131)); g = B.build(); geoCache.set(kind, g); } return g; }

/* ---------- 材質：一份給所有採集物共用 ---------- */
const U = { uGTime: { value: 0 }, uGNight: { value: 0 } };
const VERT_HEAD = `#include <common>
attribute vec3 aPW; uniform float uGTime; uniform float uGNight; varying float vGGlow;
#ifdef USE_INSTANCING
attribute float aSt;
#endif`;
const VERT_BODY = `
vec3 transformed = vec3(position);
{
  float gSt = 0.0; vec2 gW = modelMatrix[3].xz;
  #ifdef USE_INSTANCING
  gSt = aSt; gW = (modelMatrix * instanceMatrix)[3].xz;
  #endif
  float gPart = aPW.x, gPicked = step(0.5, gSt) * step(gSt, 1.5), gBig = step(1.5, gSt), gShow = 1.0;
  if (gPart > 2.5) { float tw = 0.5 + 0.5 * sin(uGTime * 3.1 + position.y * 23.0 + gW.x * 1.7 + gW.y); transformed = position + normal * gBig * (0.2 + 0.8 * tw * tw * tw); }
  else {
    if (gPart > 1.5) gShow = gPicked; else if (gPart > 0.5) gShow = 1.0 - gPicked;
    float gWind = sin(uGTime * 1.6 + gW.x * 0.33 + gW.y * 0.27) * 0.6 + sin(uGTime * 2.7 + gW.x * 0.9 - gW.y * 0.4) * 0.3;
    transformed.x += aPW.y * gWind * 0.9; transformed.z += aPW.y * gWind * 0.55;
    transformed *= gShow;
  }
  vGGlow = aPW.z >= 0.0 ? aPW.z : -aPW.z * (0.06 + 0.94 * uGNight);
  if (gPart > 0.5 && gPart < 1.5) vGGlow += gBig * (0.16 + 0.1 * sin(uGTime * 2.4 + gW.x));
}`;
function tick() { U.uGTime.value = W.time; U.uGNight.value = W.night || 0; }
let gMat = null, gDepth = null;
function gatherMats() {
  if (gMat) return [gMat, gDepth];
  gMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  gMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_HEAD).replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGGlow;'); };
  gMat.customProgramCacheKey = () => 'gather06';
  gDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  gDepth.onBeforeCompile = sh => { Object.assign(sh.uniforms, U); sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_HEAD).replace('#include <begin_vertex>', VERT_BODY); };
  gDepth.customProgramCacheKey = () => 'gather06d';
  return [gMat, gDepth];
}

/* ---------- 一整片 ---------- */
// points：[{ x, z, y（可省，預設取地面高度）, rot（面向，可省＝隨機；岩壁上的敲點請給）, s（大小倍率，可省）, tilt（往後仰的弧度，可省） }]
// 回傳 { kind, mesh, n, setState(i, 0 可採｜1 採過｜2 大株), state(i), setAll(st), at(i) → {x,y,z}, dispose() }
// 一片＝一個 InstancedMesh＝一次繪製（加一次陰影）；切換狀態只改一個浮點數，不重建任何東西
export const BIG_SCALE = 1.32;
export function makeGatherPatch(kind, points, opt = {}) {
  const base = gatherGeo(kind), n = points.length, [mat, dep] = gatherMats(), g = new THREE.BufferGeometry(), hgt = opt.hgt || Hgt, st = new Float32Array(n);
  for (const k of ['position', 'normal', 'color', 'aPW']) g.setAttribute(k, base.attributes[k]);
  const aSt = new THREE.InstancedBufferAttribute(st, 1); aSt.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aSt', aSt);
  const mesh = new THREE.InstancedMesh(g, mat, n), wall = GATHER_INFO[kind] && GATHER_INFO[kind].wall, d = new THREE.Object3D(), mats = [];
  let cx = 0, cz = 0, cy = 0; const P = points.map(p => { const y = p.y != null ? p.y : hgt(p.x, p.z); cx += p.x / n; cz += p.z / n; cy += y / n; return { x: p.x, y, z: p.z, rot: p.rot, s: p.s, tilt: p.tilt }; });
  mesh.position.set(cx, cy, cz);
  P.forEach((p, i) => { const h = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1, h2 = (h * 7.13) % 1; p.rot = p.rot != null ? p.rot : h * TAU; p.s = (p.s || 1) * (opt.exact ? 1 : wall ? 0.92 + h2 * 0.2 : 0.86 + h2 * 0.3);
    d.position.set(p.x - cx, p.y - cy - (wall ? 0.04 : 0.02), p.z - cz); d.rotation.set(-(p.tilt || 0), p.rot, 0, 'YXZ'); d.scale.setScalar(p.s); d.updateMatrix(); mats.push(d.matrix.clone()); mesh.setMatrixAt(i, d.matrix); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 1.6; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = dep; mesh.onBeforeRender = tick; mesh.name = 'gather:' + kind;
  const big = new THREE.Matrix4().makeScale(BIG_SCALE, BIG_SCALE, BIG_SCALE), tmp = new THREE.Matrix4();
  const api = { kind, mesh, n, tris: base.userData.tris,
    setState(i, s) { if (i < 0 || i >= n || st[i] === s) return; const was = st[i]; st[i] = s; aSt.needsUpdate = true; if ((was === 2) !== (s === 2)) { mesh.setMatrixAt(i, s === 2 ? tmp.multiplyMatrices(mats[i], big) : mats[i]); mesh.instanceMatrix.needsUpdate = true; } },
    state: i => st[i], setAll(s) { for (let i = 0; i < n; i++) api.setState(i, s); }, at: i => P[i],
    dispose() { if (mesh.parent) mesh.parent.remove(mesh); mesh.dispose(); g.dispose(); } };
  return api;
}
// 單獨一株（預覽、任務展示用）。picked：採過的樣子；big：大株。回傳 Object3D，原點在地面
export function makeGatherMesh(kind, picked = false, big = false) { const p = makeGatherPatch(kind, [{ x: 0, y: 0, z: 0, rot: 0 }], { exact: true }); p.setState(0, picked ? 1 : big ? 2 : 0); p.mesh.userData.patch = p; return p.mesh; }
export const gatherTris = kind => gatherGeo(kind).userData.tris;

/* ============================== 營火與營地小物 ============================== */
let pMat = null;
const propMat = () => pMat || (pMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
const meshOf = (B, ao = 0.72) => { const g = B.build(ao); g.deleteAttribute('aPW'); const m = new THREE.Mesh(g, propMat()); m.castShadow = true; m.receiveShadow = true; return m; };
const WOOD = [0x4a2f1c, 0x80583a], CUT = 0xd8b27c, IRON = [0x26282e, 0x5c606a], STONE = [0x5e5c58, 0x9c9a94];
// 一截木頭：從 a 到 b，樹皮色，兩端是淺色的切面
function logPiece(B, a, b, r, n = 6, col = WOOD, o = {}) { stalk(B, a, b, r, r * 0.92, col, n, Object.assign({ jit: 0.05 }, o)); const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.acos(clamp(d.y / len, -1, 1));
  B.add(new THREE.CircleGeometry(r * 0.92, n), { at: b, rot: [pitch - Math.PI / 2, yaw, 0], col: o.end || CUT }); B.add(new THREE.CircleGeometry(r, n), { at: a, rot: [pitch + Math.PI / 2, yaw, 0], col: o.end || CUT }); }
function seatStump(B, x, z, r = 0.3, h = 0.44) { B.add(cyl(r * 0.94, r * 1.08, h, 8, true), { at: [x, 0, z], col: WOOD, jit: 0.04 }); B.add(new THREE.CircleGeometry(r * 0.94, 8), { at: [x, h, z], rot: [-Math.PI / 2, 0, 0], col: CUT }); B.add(new THREE.CircleGeometry(r * 0.5, 8), { at: [x + 0.02, h + 0.004, z], rot: [-Math.PI / 2, 0, 0], col: 0xb88e58 }); B.add(new THREE.CircleGeometry(r * 0.18, 6), { at: [x + 0.03, h + 0.008, z], rot: [-Math.PI / 2, 0, 0], col: 0x8a6238 }); }
function seatLog(B, x, z, yaw, len = 1.5, r = 0.27) { const dx = Math.cos(yaw) * len / 2, dz = -Math.sin(yaw) * len / 2; logPiece(B, [x - dx, r * 0.86, z - dz], [x + dx, r * 0.86, z + dz], r, 8); B.add(cyl(0.05, 0.06, 0.2, 4, true), { at: [x + dx * 0.3, r * 1.6, z + dz * 0.3], rot: [0.5, yaw, 0], col: WOOD }); }
// 鍋架：三腳架吊著一口鐵鍋（鍋底離地 0.62，下面可以生火）
function potStand(B, stew = true) {
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; stalk(B, [Math.sin(a) * 0.86, 0, Math.cos(a) * 0.86], [Math.sin(a) * -0.05, 1.95, Math.cos(a) * -0.05], 0.045, 0.035, [0x5a3a22, 0x8a6240], 5, { jit: 0.05 }); }
  B.add(new THREE.TorusGeometry(0.075, 0.03, 4, 7), { at: [0, 1.78, 0], rot: [Math.PI / 2, 0, 0], col: 0xc9a56c }); stalk(B, [0, 1.76, 0], [0, 1.28, 0], 0.014, 0.014, IRON, 4);
  B.add(new THREE.TorusGeometry(0.34, 0.022, 4, 10, Math.PI), { at: [0, 0.98, 0], rot: [0, 0.5, 0], col: IRON });
  B.add(lathe([[0, 0.62], [0.2, 0.64], [0.33, 0.74], [0.37, 0.9], [0.33, 1.0], [0.36, 1.04]], 10), { col: [0x22242a, 0x565a64], gy: [0.6, 1.05] }); B.add(new THREE.TorusGeometry(0.355, 0.028, 4, 12), { at: [0, 1.04, 0], rot: [Math.PI / 2, 0, 0], col: 0x6a6e78 });
  if (stew) { B.add(new THREE.CircleGeometry(0.33, 10), { at: [0, 1.0, 0], rot: [-Math.PI / 2, 0, 0], col: 0xb8642e }); for (const [x, z, c] of [[0.1, 0.08, 0x8f3d22], [-0.12, 0.02, 0x8f3d22], [0.0, -0.14, 0x6cc24a], [-0.06, 0.16, 0xe08a44], [0.17, -0.08, 0xfff0d2]]) B.add(octa(0.055), { at: [x, 1.01, z], sc: [1, 0.6, 1], round: true, col: c }); }
}
/* ---------- 火焰：三層套疊的火舌（外紅、中橘、內黃白），一個網格、一次繪製、不透明（用丟棄像素做出分岔的火舌，不必排序） ---------- */
// 外面兩層只畫背面（翻轉三角形），所以從任何角度都看得到裡面那一層；頂點依高度左右擺、往上跑的鼓縮；片段用往上流的雜訊把火舌頂端吃出缺口
function flameGeo() {
  const prof = [[0, 0], [0.24, 0.04], [0.36, 0.17], [0.35, 0.36], [0.25, 0.58], [0.13, 0.8], [0.04, 0.96], [0, 1.06]], P = [], A = [];
  // 每條火舌：[x, z, 大小, 節奏偏移]；每條三層（外、中只畫背面；最裡面畫正面）
  for (const [ox, oz, k, ph] of [[0, 0, 1, 0], [0.2, 0.1, 0.56, 0.37], [-0.17, -0.13, 0.64, 0.71], [-0.05, 0.2, 0.45, 0.53]]) for (const [s, y0, L, inv] of [[1, 0, 0, true], [0.7, 0.03, 1, true], [0.44, 0.05, 2, false]]) { if (k < 1 && L === 2) continue; const g = lathe(prof, k < 1 ? 6 : 9).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) for (const j of inv ? [i, i + 2, i + 1] : [i, i + 1, i + 2]) { P.push(ox + p.getX(j) * s * k, (y0 + p.getY(j) * (0.62 + 0.38 * s)) * k, oz + p.getZ(j) * s * k); A.push(L + ph, p.getY(j) / 1.06); } }
  { const g = ico(1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { P.push(p.getX(i) * 0.4, 0.06 + p.getY(i) * 0.09, p.getZ(i) * 0.4); A.push(3, 0); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aLH', new THREE.Float32BufferAttribute(A, 2)); g.computeBoundingSphere(); g.boundingSphere.radius *= 1.5; g.userData.tris = P.length / 9; return g;
}
const FLAME_V = `attribute vec2 aLH; uniform float uT; uniform float uSeed; uniform float uH; varying float vH; varying float vL; varying vec3 vP;
void main() { float L = floor(aLH.x + 0.001), ph = fract(aLH.x + 0.001) * 17.0, h = aLH.y; vec3 p = position;
  if (L < 2.5) { float t = uT * (1.0 + L * 0.3 + ph * 0.02) + L * 1.7 + uSeed + ph, sw = h * h;
    p.x += (sin(t * 5.3 + p.y * 4.0) * 0.075 + sin(t * 9.7 + p.y * 7.0) * 0.035) * sw * 1.5; p.z += (cos(t * 4.6 + p.y * 3.4) * 0.075 + sin(t * 8.3 + p.y * 6.1) * 0.035) * sw * 1.5;
    p.xz *= 1.0 + sin(p.y * 8.0 - t * 7.0) * 0.09 * (1.0 - h) * step(0.05, h); p.y *= uH * (1.0 + (sin(t * 6.1) * 0.09 + sin(t * 13.0) * 0.045) * h); p.xz *= mix(1.0, uH, 0.5); }
  vH = h; vL = L; vP = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const FLAME_F = `uniform float uT; uniform float uSeed; uniform float uLow; uniform float uK; uniform float uDay; varying float vH; varying float vL; varying vec3 vP;
float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ns(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float x0 = mod(i.x, 7.0), x1 = mod(i.x + 1.0, 7.0); return mix(mix(hs(vec2(x0, i.y)), hs(vec2(x1, i.y)), f.x), mix(hs(vec2(x0, i.y + 1.0)), hs(vec2(x1, i.y + 1.0)), f.x), f.y); }
void main() { vec3 c;
  if (vL > 2.5) c = mix(vec3(2.3, 0.62, 0.1), vec3(1.9, 0.46, 0.07), uDay) * (0.72 + 0.28 * sin(uT * 3.0 + vP.x * 9.0 + vP.z * 7.0));
  else { if (uLow < 0.5) { float n = ns(vec2((atan(vP.z, vP.x) / 6.2831853 + 0.5) * 7.0 + vL * 2.3, vP.y * 3.4 - uT * (2.4 + vL * 0.5) + uSeed)); if (n < smoothstep(0.3, 1.0, vH) * 0.98 - 0.03) discard; }
    // 白天（uDay＝1）整體壓暗、把藍綠收掉：白天的天空與地面都亮，火心太亮會被色調映射壓成白色，看起來不像火
    float hf = smoothstep(0.15, 0.95, vH);
    c = vL < 0.5 ? mix(mix(vec3(2.6, 0.6, 0.07), vec3(1.5, 0.15, 0.03), hf), mix(vec3(1.75, 0.36, 0.045), vec3(1.1, 0.11, 0.025), hf), uDay)
      : vL < 1.5 ? mix(mix(vec3(3.2, 1.5, 0.24), vec3(2.9, 0.8, 0.1), smoothstep(0.3, 1.0, vH)), mix(vec3(2.05, 0.82, 0.09), vec3(1.8, 0.44, 0.055), smoothstep(0.3, 1.0, vH)), uDay)
      : mix(mix(vec3(3.3, 2.7, 1.3), vec3(3.2, 2.1, 0.6), smoothstep(0.2, 1.0, vH)), mix(vec3(2.0, 1.28, 0.22), vec3(1.9, 0.9, 0.12), smoothstep(0.2, 1.0, vH)), uDay); }
  gl_FragColor = vec4(c * uK, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const EMBER_V = `attribute vec2 aSeed; uniform float uT; uniform float uPx; uniform float uH; varying float vA;
void main() { float t = fract(uT * (0.3 + aSeed.x * 0.28) + aSeed.y); vec3 p = position + vec3(sin(t * 9.0 + aSeed.y * 40.0) * 0.14 * t + (aSeed.x - 0.5) * 0.7 * t, 0.25 + t * (1.3 + aSeed.x * 1.1) * (0.5 + 0.5 * uH), cos(t * 7.0 + aSeed.x * 30.0) * 0.14 * t + (aSeed.y - 0.5) * 0.5 * t);
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (0.025 + 0.035 * (1.0 - t)) * uPx / -mv.z; gl_Position = projectionMatrix * mv; }`;
const EMBER_F = `varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vec3(3.0, 1.3, 0.3) * vA * (1.0 - r * 3.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// 全世界共用一盞營火的點光源：誰離鏡頭最近就掛在誰身上（點光源越多，整個畫面每個像素都要多算一盞；營地有好幾處，不能一處一盞）
const camp = { light: null, holder: null, d2: 1e9, frame: -1 };
let fGeo = null, eGeo = null, glowGeo = null;
// 營火：石圈、木柴、會動的火焰、火星、地上的暖光、木樁與倒木座位。原點在火堆中心的地面
// opt：pot 上面架鍋｜seats 要不要座位（預設要）｜lit 一開始有沒有點著（預設有）
// 回傳 THREE.Group；g.userData：seats [{ x, z, y 座面高度, face 面向火的方向 }]（區域座標）、radius 碰撞半徑、setLit(開關)、setPot(開關)、lit
export function makeCampfire(opt = {}) {
  const g = new THREE.Group(), B = new Builder(), r = rng(opt.seed || 7), seats = [];
  B.add(new THREE.CircleGeometry(0.62, 10), { at: [0, 0.012, 0], rot: [-Math.PI / 2, 0, 0], col: 0x2a2420 }); B.add(new THREE.CircleGeometry(0.34, 8), { at: [0.03, 0.02, 0.02], rot: [-Math.PI / 2, 0, 0], col: 0x6a665e });
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + r() * 0.2, s = 0.15 + r() * 0.09; B.add(rockGeo(100 + i, 0.24, 20), { at: [Math.sin(a) * 0.66, s * 0.5, Math.cos(a) * 0.66], sc: [s * 1.15, s * 0.8, s], rot: [0, a + r(), 0], flat: true, jit: 0.07, col: STONE, gy: [0, 0.22] }); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; logPiece(B, [Math.sin(a) * 0.44, 0.05, Math.cos(a) * 0.44], [Math.sin(a) * -0.07, 0.52, Math.cos(a) * -0.07], 0.07, 6, [0x5a3a22, 0x1c1410], { end: 0x2a1c14 }); }
  logPiece(B, [-0.5, 0.07, 0.2], [0.34, 0.07, -0.42], 0.065, 6, [0x4a2f1c, 0x6a4a2e]);
  if (opt.seats !== false) { const S = [[2.05, 0.75, 0], [2.05, 2.6, 0], [2.15, 4.55, 1]];
    for (const [d, a, bench] of S) { const x = Math.sin(a) * d, z = Math.cos(a) * d; if (bench) { seatLog(B, x, z, a); for (const k of [-0.42, 0.42]) seats.push({ x: x + Math.cos(a) * k, z: z - Math.sin(a) * k, y: 0.5, face: a + Math.PI }); } else { seatStump(B, x, z); seats.push({ x, z, y: 0.44, face: a + Math.PI }); } } }
  const base = meshOf(B); g.add(base);
  const pot = new Builder(); potStand(pot); const potM = meshOf(pot, 1); potM.visible = !!opt.pot; g.add(potM);
  const U = { uT: { value: 0 }, uSeed: { value: (opt.seed || 7) * 1.37 }, uH: { value: 1 }, uLow: { value: 0 }, uK: { value: 1 }, uDay: { value: 0 }, uPx: { value: 1200 } };
  const flame = new THREE.Mesh(fGeo || (fGeo = flameGeo()), new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLAME_V, fragmentShader: FLAME_F })); flame.position.y = 0.06; g.add(flame);
  if (!eGeo) { const N = 12, p = new Float32Array(N * 3), s = new Float32Array(N * 2), rr = rng(5); for (let i = 0; i < N; i++) { p[i * 3] = (rr() - 0.5) * 0.3; p[i * 3 + 2] = (rr() - 0.5) * 0.3; s[i * 2] = rr(); s[i * 2 + 1] = rr(); } eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); eGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 2)); eGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 2.4); }
  const embers = new THREE.Points(eGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: EMBER_V, fragmentShader: EMBER_F, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); g.add(embers);
  if (!glowGeo) { glowGeo = new THREE.RingGeometry(0.001, 3.6, 20, 5); glowGeo.rotateX(-Math.PI / 2); const p = glowGeo.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = Math.pow(1 - clamp(Math.hypot(p.getX(i), p.getZ(i)) / 3.6, 0, 1), 2.4); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; } glowGeo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); glow.position.y = 0.05; glow.renderOrder = 1; g.add(glow);
  const ud = g.userData; ud.seats = seats; ud.radius = 0.85; ud.lit = opt.lit !== false; ud.k = ud.lit ? 1 : 0; ud.pot = !!opt.pot;
  ud.setLit = on => { ud.lit = !!on; }; ud.setPot = on => { ud.pot = !!on; potM.visible = ud.pot; };
  let last = -1;
  flame.onBeforeRender = (renderer, scene, camera, geo, mat) => {
    if (mat !== flame.material) { geo.setDrawRange(0, 0); return; }      // 後製算環境遮蔽的那一道：火焰不是實體，不畫
    const t = W.time, dt = last < 0 ? 0 : Math.min(0.1, t - last); last = t; ud.k = clamp(ud.k + (ud.lit ? dt * 1.6 : -dt * 2.5), 0, 1);
    const night = W.night || 0, low = W.quality === 'low', fl = 1 + Math.sin(t * 9.3 + U.uSeed.value) * 0.1 + Math.sin(t * 23.1 + U.uSeed.value * 2) * 0.07;
    U.uT.value = t; U.uDay.value = 1 - night; U.uLow.value = low ? 1 : 0; U.uH.value = (ud.pot ? 0.6 : 1) * (0.25 + 0.75 * ud.k); U.uK.value = 0.35 + 0.65 * ud.k; U.uPx.value = renderer.getDrawingBufferSize(_v2).y / (2 * Math.tan(camera.fov * Math.PI / 360));
    embers.visible = W.quality === 'high' && ud.k > 0.5; const gk = (0.1 + 0.42 * night) * fl * ud.k; glow.material.color.setRGB(gk, gk * 0.42, gk * 0.1);
    // 點光源：最近的營火拿走
    if (!camp.light) { camp.light = new THREE.PointLight(new THREE.Color().setRGB(1, 0.6, 0.3, THREE.SRGBColorSpace), 0, 16, 1.7); camp.light.position.set(0, 0.95, 0); }
    const fr = renderer.info.render.frame, d2 = _v.setFromMatrixPosition(g.matrixWorld).distanceToSquared(camera.position);
    if (camp.holder === g) { camp.d2 = d2; camp.frame = fr; } else if (!camp.holder || fr - camp.frame > 2 || d2 < camp.d2 * 0.8) { camp.holder = g; camp.d2 = d2; camp.frame = fr; g.add(camp.light); }
    if (camp.holder === g) { camp.light.visible = !low; camp.light.intensity = (5 + 38 * night) * fl * ud.k; }
  };
  flame.onAfterRender = (r, sc, c, geo) => { geo.setDrawRange(0, Infinity); }; glow.onBeforeRender = (r, sc, c, geo, mat) => { if (mat !== glow.material) geo.setDrawRange(0, 0); }; glow.onAfterRender = flame.onAfterRender;
  g.name = 'campfire'; return g;
}
const _v2 = new THREE.Vector2();
// 營地小物。name：potstand 鍋架與鐵鍋｜pickaxe 礦鎬（握柄在原點、沿 +Y，鎬頭在上；掛到右手骨頭就能拿）｜mortar 藥缽與杵｜rack 整備架｜stump 木樁座位｜logseat 倒木座位｜campfire 營火
export function makeProp(name, opt = {}) {
  if (name === 'campfire') return makeCampfire(opt);
  const B = new Builder(); let ao = 0.72;
  if (name === 'potstand') potStand(B, opt.stew !== false);
  else if (name === 'stump') seatStump(B, 0, 0);
  else if (name === 'logseat') seatLog(B, 0, 0, 0);
  else if (name === 'pickaxe') { ao = 1;
    B.add(cyl(0.032, 0.04, 1.04, 6), { at: [0, -0.27, 0], col: [0x6a4528, 0x9a7044], jit: 0.04 }); for (let i = 0; i < 3; i++) B.add(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 6), { at: [0, -0.12 + i * 0.09, 0], col: 0xc9a56c });
    B.add(new THREE.BoxGeometry(0.15, 0.15, 0.12), { at: [0, 0.74, 0], flat: true, col: IRON, gy: [0.5, 0.82] });
    for (const s of [-1, 1]) { const seg = [[0.07, 0.75, 0.12, 0.062], [0.2, 0.735, 0.3, 0.052], [0.33, 0.69, 0.52, 0.04], [0.45, 0.615, 0.74, 0.012]];      // 每一節：離中心多遠、高度、往下彎的角度、粗細
      for (let i = 0; i < seg.length - 1; i++) { const a = seg[i], b = seg[i + 1]; stalk(B, [s * a[0], a[1], 0], [s * b[0], b[1], 0], a[3], b[3], [0x565c68, 0xd0d8e2], 4, { flat: true, jit: 0.06, gy: [0.55, 0.8], sc: [1, 1, 1] }); } } }
  else if (name === 'mortar') {
    B.add(lathe([[0, 0], [0.16, 0], [0.24, 0.07], [0.27, 0.2], [0.24, 0.215], [0.2, 0.11], [0, 0.07]], 10), { col: [0x6a6c70, 0xb0b2b4], gy: [0, 0.22] }); B.add(new THREE.CircleGeometry(0.2, 10), { at: [0, 0.13, 0], rot: [-Math.PI / 2, 0, 0], col: 0x4fae5a }); B.add(ico(0.06), { at: [0.05, 0.14, 0.03], sc: [1, 0.5, 1], round: true, col: 0x7fe08a });
    stalk(B, [-0.04, 0.12, 0], [0.2, 0.42, 0.06], 0.04, 0.03, [0x8a8c90, 0xc8cacc], 6); B.add(ico(0.045), { at: [-0.04, 0.12, 0], round: true, col: 0x8a8c90 }); B.add(ico(0.036), { at: [0.2, 0.42, 0.06], round: true, col: 0xd0d2d4 });
    for (let i = 0; i < 3; i++) B.add(leafGeo(0.3, 0.07, 0.25, 0.4, 2), { at: [0.36, 0.01, -0.06], rot: [0, 0.6 + i * 0.5, 0], col: [0x157a44, 0x7fe08a] }); B.add(ico(0.045), { at: [0.5, 0.06, 0.16], sc: [1, 1.3, 1], round: true, col: 0xe8341e }); B.add(ico(0.04), { at: [0.56, 0.05, 0.04], sc: [1, 1.3, 1], round: true, col: 0xd52a18 });
    B.add(lathe([[0, 0], [0.07, 0], [0.085, 0.09], [0.03, 0.15], [0.03, 0.2], [0, 0.2]], 7), { at: [-0.36, 0, 0.1], col: [0xc2261e, 0xf0d8d0] }); B.add(cyl(0.032, 0.032, 0.05, 6), { at: [-0.36, 0.2, 0.1], col: 0xb07c44 }); }
  else if (name === 'rack') {      // 布蘿娜的整備架：木架上掛著皮條、獠牙與鐵箍，腳邊一座磨刀石
    for (const s of [-1, 1]) { stalk(B, [s * 0.8, 0, 0.16], [s * 0.74, 1.56, 0], 0.05, 0.045, [0x5a3a22, 0x8a6240], 5, { jit: 0.05 }); stalk(B, [s * 0.8, 0, -0.2], [s * 0.74, 1.3, 0], 0.04, 0.035, [0x5a3a22, 0x8a6240], 5, { jit: 0.05 }); }
    logPiece(B, [-0.92, 1.5, 0], [0.92, 1.5, 0], 0.045, 6, [0x6a4528, 0x9a7044]);
    for (const [x, L, c] of [[-0.52, 0.62, 0xc9a56c], [-0.38, 0.5, 0xb8894e], [-0.24, 0.7, 0xd9b98a]]) B.add(new THREE.BoxGeometry(0.075, L, 0.014), { at: [x, 1.46 - L / 2, 0.01], rot: [0.06, 0, 0], col: [c, 0xe8d4a8], gy: [0.8, 1.5] });
    for (const [x, L] of [[0.02, 0.2], [0.16, 0.28]]) { stalk(B, [x, 1.46, 0], [x, 1.46 - L, 0], 0.008, 0.008, 0x8a5a36, 3); B.add(new THREE.ConeGeometry(0.045, 0.22, 5), { at: [x + 0.02, 1.36 - L, 0], rot: [0, 0, Math.PI + 0.25], col: [0xd8cdb0, 0xfff8e6] }); }
    B.add(new THREE.TorusGeometry(0.15, 0.024, 4, 10), { at: [0.52, 1.3, 0], flat: true, col: IRON }); B.add(new THREE.TorusGeometry(0.1, 0.02, 4, 8), { at: [0.52, 1.02, 0.01], flat: true, col: [0x5c2c18, 0xa85a30] });
    B.add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), { at: [0.3, 0.4, 0.5], rot: [0, 0, Math.PI / 2], col: [0x8a8c8e, 0xc4c6c8], jit: 0.03 }); for (const s of [-1, 1]) stalk(B, [0.3 + s * 0.14, 0, 0.5], [0.3 + s * 0.09, 0.42, 0.5], 0.04, 0.035, [0x5a3a22, 0x8a6240], 4); stalk(B, [0.1, 0.4, 0.5], [0.5, 0.4, 0.5], 0.02, 0.02, IRON, 4);
    B.add(cyl(0.17, 0.14, 0.26, 8, true), { at: [-0.5, 0, 0.5], col: [0x5a3a22, 0x8a6240], jit: 0.05 }); B.add(new THREE.CircleGeometry(0.16, 8), { at: [-0.5, 0.21, 0.5], rot: [-Math.PI / 2, 0, 0], col: 0x4f8fb8 }); B.add(new THREE.TorusGeometry(0.165, 0.014, 3, 8), { at: [-0.5, 0.2, 0.5], rot: [Math.PI / 2, 0, 0], col: IRON }); }
  else return null;
  const m = meshOf(B, ao); m.name = 'prop:' + name; return m;
}
export const PROP_NAMES = ['campfire', 'potstand', 'pickaxe', 'mortar', 'rack', 'stump', 'logseat'];
