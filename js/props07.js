// 0.7 美術小道具：釣竿三階、浮標、9 種魚＋3 尾主、水花、捕獸夾、絆索鈴、紅布樁、爪痕樹、骨堆、委託板、繪圖桌。全部用程式生成，不用外部素材
// 介面（照 BRIEF-0.7-w1）：makeProp07(name, opt) → THREE.Object3D｜has07(name)｜PROP07_NAMES｜makeProp07Inst(name, points) 多處擺放用（一種一個 InstancedMesh＝一次繪製）
// 魚和野獸同一套「軟膠玩具」做法（雕過的橢球與圓管、平滑法線、花紋逐像素畫在貼圖上）：下面的建模工具照抄 creatures.js（0.5），名字與用法都一樣，
// 0.8 新野獸進遊戲時可以把 beasts07.js 的物種直接搬進 creatures.js 的 SOFT。小道具（陷阱、木樁、板子）沿用 props06 的「幾何＋頂點色、全部共用一個材質」
import * as THREE from './three.bundle.js';

const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, hyp = Math.hypot;

/* ============================== 軟膠建模工具（照抄 creatures.js） ============================== */
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
const crom = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
const B = { body: 0, pelvis: 1, chest: 2, neck: 3, head: 4, jaw: 5, earL: 6, earR: 7, mane: 8, leg: 9, tail: 21 };
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
export const KIT = { Part, ball, tubeP, place, push, mirrorX, finish, blendN, surf, spike, tuft, cone, horn, ridge, rgb, cov, ink, put, h2, wedge, occl, buildSoft, softSkel, legSk, quatOf, skMix, B, add3, sub3, cross3, dot3, norm3, mid3, crom, fall, TAU, clamp, lerp, smooth };

/* ============================== 魚：9 種＋3 尾主 ============================== */
// 參考：鯽（背青褐、體側金、腹銀白、圓鱗）、鱸（青綠帶深色直斑、紅腹鰭、背鰭有硬棘）、鯉（金銅大鱗、兩對觸鬚、厚唇）、鯰（扁寬的頭、長觸鬚、小眼、斑駁）、
// 鱒（背深、體側一條粉紅帶、細黑點）、泥鰍（細長圓筒、口鬚）。Q 版：頭大、眼大、身體短胖；有脾氣（眉壓低、嘴角往下），掠食的魚露小牙。
// 模型：頭朝 +z、背朝 +y、全長約 1（makeProp07 會依 FISH_LEN 縮放成遊戲裡的公尺）。兩根骨頭：0 身體、1 尾柄（擺尾用）。
const FK = {};      // 物種定義
const fh = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// 身體的站點：z 前後、top／bot 背與腹的半高、w 半寬、y 中心高
const fkeys = rows => rows.map(([z, top, bot, w, y = 0, e = 1]) => ({ p: [0, y, z], rx: w, ry: top, rd: bot, e }));
// 一片鰭：從 base 沿 out 長出去 len；截面是扁的橢圓（nrm 是鰭面的法線、th 半厚），ws 每一站的半寬、sw 往 along 方向掃的量（每一站）
function finPart(name, base, out, nrm, len, ws, sw, th = 0.008, along = null) {
  out = norm3(out); nrm = norm3(sub3(nrm, out.map(v => v * dot3(nrm, out)))); const al = along ? norm3(along) : cross3(out, nrm), n = ws.length;
  const keys = ws.map((w, i) => { const t = i / (n - 1); return { p: add3(add3(base, out, len * t), al, sw[i] || 0), rx: th * (1 - 0.6 * t), ry: Math.max(0.002, w) }; });
  const pt = tubeP(name, 8, keys, { ref: nrm, nv: Math.max(5, n * 2 - 1), capB: th, capN: 1 }); pt.fin = { base, out, al, len }; return pt;
}
// 魚鱗：在 (s 沿身體, a 繞身體) 上一格一格的半月形，回傳 0–1（鱗片後緣的深色）
const scaleK = (s, a, ns, na) => { const i = Math.floor(s * ns), sh = (i & 1) * 0.5, j = Math.floor(a * na + sh), fu = s * ns - i, fv = a * na + sh - j, d = h2((fu - 0.15) * 1.2, fv - 0.5); return smooth(0.42, 0.56, d) * smooth(0.75, 0.6, d) * smooth(0.0, 0.5, fu); };
const FISH_JOINTS = [0.67, 0.5, 0.33, 0.17, 0.03, -0.1];      // 骨節位置（占 zT…zH 全長的比例；負的在尾端之外＝尾鰭中段）
function buildFish(id, defer = false) {
  const D = FK[id](), K = D.K, parts = [], add = pt => (parts.push(pt), pt);
  const body = tubeP('body', 22, fkeys(D.keys), { nv: 16, capA: D.capA ?? 0.03, capB: D.capB ?? 0.07, capN: 3, seam: -PI / 2 });
  if (D.sculpt) D.sculpt(body); finish(body); body.tex = [320, 160]; add(body);
  const zs = D.keys.map(k => k[0]), zT = zs[0], zH = zs[zs.length - 1] + (D.capB ?? 0.07), LEN = zH - zT;
  const ycAt = z => { let i = 0; while (i < D.keys.length - 2 && D.keys[i + 1][0] < z) i++; const a = D.keys[i], b = D.keys[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4] || 0, b[4] || 0, t)]; };
  body.sk = p => { const t = smooth(0.0, -0.3, p[2]); return [0, 1 - t, 1, t]; };
  // 身體花紋：s＝從尾到頭 0–1、a＝繞身體（0 背、0.5 腹）、side＝側面的高度（-1 腹…1 背）
  body.paint = (c, p, n) => { const s = (p[2] - zT) / LEN, k = ycAt(p[2]), yc = k[3], side = clamp((p[1] - yc) / Math.max(0.01, p[1] > yc ? k[0] : k[1]), -1, 1), a = Math.atan2(abs(p[0]), p[1] - yc) / PI;
    put(c, K.side); ink(c, smooth(0.15, 0.75, side) * 0.9, K.back); ink(c, smooth(-0.2, -0.75, side), K.belly);
    D.paint && D.paint(c, p, n, s, a, side, k);
    if (D.lateral !== false) ink(c, 0.32 * cov(abs(side - 0.08 - 0.06 * Math.sin(s * 3)) - 0.012, 0.01) * smooth(0.08, 0.2, s) * smooth(0.8, 0.7, s) * (0.6 + 0.4 * cov(abs(((s * 60) % 1) - 0.5) - 0.25, 0.1)), K.back);      // 側線
    ink(c, 0.16 * smooth(0.25, 0.45, side) * smooth(0.75, 0.5, side) * smooth(0.1, 0.3, s), [255, 255, 255]);      // 濕亮的高光帶
    ink(c, 0.22 * smooth(-0.55, -0.95, side) * smooth(0.6, 0.3, s), [40, 30, 20]);      // 肚子下緣的陰影
    // 鰓蓋：眼睛後面一道弧線，前面亮一點（頭的立體感）
    const gz = D.gill ?? 0.22, gd = p[2] - gz - 0.05 * (side * side);
    if (abs(side) < 0.85) { ink(c, 0.55 * cov(abs(gd) - 0.006, 0.006), K.gill || K.back); if (gd > 0) ink(c, 0.12 * smooth(0, 0.05, gd), [255, 255, 255]); }
    // 嘴：頭的前下方一道往下彎的線（生氣的嘴角）
    const mz = zH - p[2], my = p[1] - (yc + (D.mouthY ?? -0.02));
    if (mz < 0.12) { const curve = my + 0.18 * mz * mz / 0.01 * 0.012 + (D.frown ?? 0.02) * smooth(0.03, 0.11, mz); ink(c, cov(abs(curve) - 0.006 * smooth(0.12, 0.02, mz), 0.004) * smooth(0.12, 0.08, mz), K.mouth || [40, 20, 20]); if (curve < 0 && mz < 0.035) ink(c, 0.6, K.lip || K.belly); }
  };
  // 尾鰭：從尾柄往後張開，尾端開叉（fork）
  const tf = D.tail || { len: 0.3, ws: [0.05, 0.12, 0.19, 0.23], fork: 0.09 }, tb = [0, ycAt(zT + 0.02)[3], zT + 0.03];
  { const t = add(finPart('tail', tb, [0, 0, -1], [1, 0, 0], tf.len, tf.ws, tf.sw || [], tf.th || 0.012));
    if (tf.fork) t.map(p => { const k = smooth(tb[2] - tf.len * 0.35, tb[2] - tf.len, p[2]); p[2] += tf.fork * k * Math.max(0, 1 - abs(p[1] - tb[1]) / (tf.ws[tf.ws.length - 1] * 0.9)) ** 1.4; });
    t.sk = 1; t.tex = [96, 96]; add(t); }
  // 背鰭、臀鰭、腹鰭、胸鰭
  const fins = D.fins || {};
  const topAt = z => { const k = ycAt(z); return [0, k[3] + k[0] - 0.012, z]; }, botAt = z => { const k = ycAt(z); return [0, k[3] - k[1] + 0.012, z]; };
  if (fins.dorsal) for (const f of [].concat(fins.dorsal)) { const b = topAt(f.z), d = add(finPart(f.name || 'dorsal' + f.z, b, [0, 1, -(f.lean ?? 0.6)], [1, 0, 0], f.len, f.ws, f.sw || [], f.th || 0.01, [0, 0, 1])); if (f.crown) { const F = d.fin; d.map(p => { const q = sub3(p, F.base), t = dot3(q, F.out) / F.len, w = q[2] - F.out[2] * dot3(q, F.out), tri = abs(((w * f.crown + 0.5) % 1 + 1) % 1 - 0.5) * 2; const e = f.len * (f.crownH ?? 0.55) * (1 - tri) ** 1.6 * smooth(0.35, 1, t); p[0] += F.out[0] * e; p[1] += F.out[1] * e; p[2] += F.out[2] * e; }); } d.sk = f.z < -0.05 ? [0, 0.5, 1, 0.5] : 0; d.tex = [96, 64]; d.spines = f.spines; }
  if (fins.anal) { const f = fins.anal, b = botAt(f.z), d = add(finPart('anal', b, [0, -1, -(f.lean ?? 0.9)], [1, 0, 0], f.len, f.ws, f.sw || [], 0.009, [0, 0, 1])); d.sk = [0, 0.5, 1, 0.5]; d.tex = [64, 48]; }
  const pairFin = (name, f, at, out) => { const pt = finPart(name, at, out, f.nrm || [0, 1, 0.3], f.len, f.ws, f.sw || [], 0.008, f.along); pt.sk = 0; pt.tex = [64, 48]; add(pt); add(mirrorX(pt, name + 'R')).sk = 0; };
  if (fins.pelvic) { const f = fins.pelvic, k = ycAt(f.z); pairFin('pelvic', Object.assign({ nrm: [1, 0.2, 0] }, f), [k[2] * 0.45, k[3] - k[1] * 0.8, f.z], [0.25, -1, -0.8]); }
  if (fins.pect) { const f = fins.pect, k = ycAt(f.z); pairFin('pect', f, [k[2] * 0.85, k[3] - k[1] * 0.35, f.z], f.out || [1, -0.35, -0.9]); }
  for (const pt of parts) if (pt.fin && !pt.paint) { const F = pt.fin, fc = pt.name === 'tail' ? (K.tail || K.fin) : K.fin; pt.paint = (c, p) => { const q = sub3(p, F.base), t = clamp(dot3(q, F.out) / F.len, 0, 1), w = dot3(q, F.al);
      put(c, fc[0]); ink(c, smooth(0.15, 0.95, t), fc[1]); ink(c, 0.4 * cov(abs(sin(w * (D.rays || 70))) - 0.22, 0.25) * smooth(0.05, 0.3, t) * smooth(1.0, 0.75, t), fc[2] || K.back);
      ink(c, 0.35 * smooth(0.2, 0.0, t), fc[2] || K.back); ink(c, 0.3 * smooth(0.82, 1.0, t), [255, 250, 240]);
      if (pt.spines) ink(c, 0.75 * cov(abs(sin(w * 24)) - 0.18, 0.12) * smooth(0.1, 0.4, t), K.spine || [40, 30, 20]);
      D.finPaint && D.finPaint(c, pt.name, t, w); }; }
  // 眼睛：大而圓的眼珠（Q 版），外圈一環金色或銀色，大瞳孔、兩點反光；上面一道壓低的眉
  const eyeZ = zH - (D.eyeBack ?? 0.13), ek = ycAt(eyeZ), eo = [0, ek[3] + (D.eyeUp ?? 0.03), eyeZ], eh = surf(body, eo, norm3([1, D.eyeTilt ?? 0.15, 0.05])) || { p: [ek[2], eo[1], eyeZ], n: [1, 0, 0] };
  const ez = norm3(add3(eh.n, [0, 0.05, 0.22])), ex = norm3(cross3([0, 1, 0], ez)), ey = cross3(ez, ex), ER = D.eyeR ?? 0.065, EC = add3(eh.p, ez, -ER * 0.12);
  { const eye = ball('eyeL', 14, 5, [ER, ER, ER * 0.42], { vmax: 0.62 }); place(eye, EC, [ex, ey, ez]); eye.sk = 0; eye.tex = [48, 32]; if (D.eyeGlow) eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.eye || [236, 190, 60]); ink(c, smooth(0.62, 0.86, r), K.eyeD || [150, 100, 30]); ink(c, cov(r - (D.pupil ?? 0.52), 0.05), K.pupil || [14, 10, 12]);
      ink(c, cov(h2(d[0] + 0.2, d[1] - 0.24) - 0.13, 0.04), [255, 255, 255]); ink(c, 0.85 * cov(h2(d[0] - 0.18, d[1] + 0.2) - 0.06, 0.04), [255, 255, 255]); if (D.lid && d[1] > D.lid) put(c, K.lidC || K.back); };
    add(eye); add(mirrorX(eye, 'eyeR')).sk = 0;
    if (D.brow !== false) { const bw = ER * 1.2, br = tubeP('browL', 6, [{ p: [-bw, ER * 0.62, ER * 0.18], rx: ER * 0.16, ry: ER * 0.2 }, { p: [0, ER * (0.98 + (D.browUp ?? 0)), ER * 0.22], rx: ER * 0.22, ry: ER * 0.26 }, { p: [bw * 1.05, ER * (1.15 + (D.browUp ?? 0)), 0], rx: ER * 0.14, ry: ER * 0.16 }], { ref: [0, 0, 1], capA: ER * 0.2, capB: ER * 0.18, capN: 1 });
      // 眉：內側（靠吻）低、外側高 → 皺眉。眼睛座標的 +x 朝後，所以吻那一端是 -x
      place(br, EC, [ex, ey, ez]); br.sk = 0; br.col = K.brow || K.back; br.tex = [8, 8]; add(br); add(mirrorX(br, 'browR')).sk = 0; } }
  if (D.extra) D.extra({ add, body, ycAt, zH, zT, K, EC, ER, ex, ey, ez, finPart });
  // 骨架：沿脊椎 6 節（0 頭與肩、1–3 軀幹、4 尾柄、5 尾鰭）。每個頂點（身體、鰭、眼睛、觸鬚、所有附件）依自己的 z 在相鄰兩節之間線性混合，
  // 所以背鰭、臀鰭、腹鰭自動跟著它所在的那一節；z 在第 0 節前面的（頭、眼、嘴、胸鰭根）完全不動。
  const J = FISH_JOINTS.map(f => zT + LEN * f);
  const skinZ = q => { const z = q[2]; if (z >= J[0]) return 0; for (let i = 0; i < J.length - 1; i++) if (z >= J[i + 1]) { const u = (J[i] - z) / (J[i] - J[i + 1]); return [i, 1 - u, i + 1, u]; } return J.length - 1; };
  for (const pt of parts) pt.sk = skinZ;
  return Object.assign(buildSoft({ parts, bones: J.map((z, i) => ({ name: i ? 'spine' + i : 'body', parent: i - 1, p: [0, 0, z] })), bg: K.side, texW: 512 }, defer), { len: LEN, zT, zH, D, J, ycAt });
}
// 身上的小亮點、瘤、斑（從身體表面長出來的小球）。list：[[z, side 高度 -1…1, 半徑], …]
const dots = (o, name, list, col, glow = 0, flat = 0.35) => list.forEach(([z, sd, r], i) => { const k = o.ycAt(z), y = k[3] + sd * (sd > 0 ? k[0] : k[1]) * 0.8, h = surf(o.body, [0, y, z], [1, 0, 0]); if (!h) return; const b = ball(name + i, 8, 4, [r, r, r * flat]); const ez = h.n, ex = norm3(cross3([0, 1, 0], ez)), ey = cross3(ez, ex); place(b, add3(h.p, ez, -r * flat * 0.3), [ex, ey, ez]); b.sk = z < -0.1 ? [0, 0.5, 1, 0.5] : 0; b.col = col; b.tex = [8, 8]; b.glow = glow; o.add(b); o.add(mirrorX(b, name + 'R' + i)).sk = b.sk; });
// 觸鬚：從嘴角拉出去的細管（pts 是左邊那根的折線）
const barbel = (o, name, pts, r0, col) => { const b = horn(name, 5, pts, r0, { tip: 0.25, pw: 0.8, nv: pts.length * 2 }); b.sk = 0; b.col = col; b.tex = [8, 8]; o.add(b); o.add(mirrorX(b, name + 'R')).sk = 0; };
const teeth = (o, list, col = [255, 248, 230]) => list.forEach(([x, y, z, l, r], i) => { const t = cone('tooth' + i, 4, [x, y, z], [x, y - l * 0.5, z + 0.002], [x, y - l, z], r); t.sk = 0; t.col = col; t.tex = [8, 8]; o.add(t); o.add(mirrorX(t, 'toothR' + i)).sk = 0; });
const TROUT = [[-0.42, 0.048, 0.044, 0.032], [-0.28, 0.092, 0.085, 0.055], [-0.1, 0.152, 0.138, 0.083], [0.08, 0.178, 0.152, 0.094], [0.24, 0.168, 0.142, 0.096], [0.36, 0.13, 0.112, 0.084], [0.44, 0.082, 0.074, 0.062, -0.008]];
const CARP = [[-0.42, 0.055, 0.05, 0.035], [-0.28, 0.1, 0.09, 0.06], [-0.1, 0.165, 0.14, 0.09], [0.08, 0.19, 0.155, 0.102], [0.24, 0.172, 0.145, 0.102], [0.36, 0.135, 0.118, 0.09], [0.44, 0.088, 0.078, 0.067, -0.012]];
const CATF = [[-0.42, 0.05, 0.04, 0.03], [-0.25, 0.1, 0.08, 0.06], [-0.05, 0.13, 0.11, 0.1], [0.12, 0.13, 0.11, 0.14], [0.28, 0.112, 0.1, 0.165], [0.38, 0.08, 0.075, 0.15, -0.01, 0.9]];
const troutFins = (K, big = 1) => ({ dorsal: [{ z: 0.06, len: 0.11 * big, ws: [0.07, 0.06, 0.04, 0.012], sw: [0, -0.02, -0.04, -0.06], lean: 0.5 }, { name: 'adipose', z: -0.27, len: 0.035, ws: [0.025, 0.018, 0.005], sw: [0, -0.01, -0.02], lean: 0.8 }],
  anal: { z: -0.18, len: 0.08, ws: [0.05, 0.04, 0.012], sw: [0, -0.02, -0.04] }, pelvic: { z: -0.02, len: 0.07, ws: [0.028, 0.026, 0.01] }, pect: { z: 0.24, len: 0.1, ws: [0.03, 0.035, 0.012], sw: [0, -0.01, -0.02] } });
const carpFins = (long = 1) => ({ dorsal: { z: 0.06, len: 0.075, ws: [0.17 * long, 0.16 * long, 0.13 * long, 0.05], sw: [0, -0.03, -0.06, -0.1], lean: 0.6 }, anal: { z: -0.2, len: 0.08, ws: [0.04, 0.035, 0.012], sw: [0, -0.02, -0.04] }, pelvic: { z: 0.0, len: 0.08, ws: [0.03, 0.03, 0.012] }, pect: { z: 0.26, len: 0.1, ws: [0.03, 0.036, 0.014], sw: [0, -0.01, -0.02] } });

FK.fish_crucian = () => ({ K: { back: fh(0x55603a), side: fh(0xc9a54c), belly: fh(0xf3e8c6), fin: [fh(0xb8763a), fh(0xe2a456), fh(0x7a4a22)], gill: fh(0x8a6a2c), brow: fh(0x3c3a22), mouth: fh(0x4a2a18), lip: fh(0xe8c890) },
  keys: [[-0.4, 0.045, 0.045, 0.03], [-0.28, 0.095, 0.088, 0.052], [-0.12, 0.18, 0.155, 0.088], [0.04, 0.215, 0.175, 0.1], [0.2, 0.2, 0.165, 0.105], [0.32, 0.155, 0.135, 0.096], [0.41, 0.098, 0.088, 0.073, -0.01]], capB: 0.06, eyeR: 0.07, eyeBack: 0.12, gill: 0.25,
  tail: { len: 0.26, ws: [0.05, 0.11, 0.17, 0.2], fork: 0.07 }, fins: carpFins(0.8), rays: 80,
  paint: (c, p, n, s, a, side) => { ink(c, 0.42 * scaleK(s, a, 11, 9) * smooth(-0.6, 0.2, side), fh(0x7a5a24)); ink(c, 0.25 * smooth(0.2, 0.0, abs(side - 0.1)), fh(0xf6dc80)); } });
FK.fish_startrout = () => ({ K: { back: fh(0x1d3a56), side: fh(0x8aa8c0), belly: fh(0xeef2f0), fin: [fh(0x3a5570), fh(0x8aa0b8), fh(0x1a2a3a)], tail: [fh(0x2c4660), fh(0x6a86a0), fh(0x14202e)], gill: fh(0x2a4058), brow: fh(0x10202e), mouth: fh(0x101820), eye: fh(0xe8e0a0), eyeD: fh(0x8a8040) },
  keys: TROUT, eyeR: 0.07, eyeBack: 0.11, gill: 0.29, tail: { len: 0.3, ws: [0.04, 0.1, 0.16, 0.19], fork: 0.06 }, fins: troutFins(), eyeGlow: 1,
  paint: (c, p, n, s, a, side) => { ink(c, 0.75 * smooth(0.28, 0.08, abs(side - 0.02)) * smooth(0.1, 0.25, s), fh(0xd6789a)); ink(c, 0.6 * cov(h2(((s * 31) % 1) - 0.5, ((side * 9 + s * 7) % 1) - 0.5) - 0.12, 0.08) * smooth(0.0, 0.5, side), fh(0x0c1a28)); },
  extra: o => dots(o, 'star', [[0.3, 0.55, 0.014], [0.2, 0.75, 0.016], [0.12, 0.4, 0.012], [0.02, 0.7, 0.017], [-0.06, 0.45, 0.013], [-0.14, 0.72, 0.014], [-0.22, 0.4, 0.011], [-0.3, 0.6, 0.011], [0.25, 0.25, 0.01], [-0.02, 0.2, 0.011], [0.08, 0.95, 0.012], [-0.18, 0.9, 0.011]], fh(0xfff3a0), 1) });
FK.fish_catfish = () => ({ K: { back: fh(0x343c22), side: fh(0x66713a), belly: fh(0xcfc49c), fin: [fh(0x3e4426), fh(0x6a6e3a), fh(0x22261a)], gill: fh(0x2a3018), brow: fh(0x1e2214), mouth: fh(0x1a1a10), lip: fh(0xa8a070), eye: fh(0xd8c040) },
  keys: CATF, capB: 0.05, eyeR: 0.05, eyeBack: 0.1, eyeUp: 0.055, eyeTilt: 0.6, gill: 0.24, mouthY: -0.005, frown: 0.012, tail: { len: 0.2, ws: [0.05, 0.09, 0.11, 0.11], fork: 0.0 },
  fins: { dorsal: { z: 0.12, len: 0.08, ws: [0.04, 0.035, 0.01], sw: [0, -0.02, -0.04], lean: 0.7 }, anal: { z: -0.16, len: 0.045, ws: [0.16, 0.15, 0.11], sw: [-0.01, -0.02, -0.04], lean: 0.25 }, pect: { z: 0.24, len: 0.11, ws: [0.032, 0.04, 0.016], sw: [0, -0.01, -0.03], out: [1, -0.2, -0.6] }, pelvic: { z: -0.05, len: 0.06, ws: [0.025, 0.024, 0.01] } },
  paint: (c, p, n, s, a, side) => { const m = Math.sin(p[2] * 61 + Math.sin(p[1] * 47) * 2) * Math.sin(p[1] * 53 + p[2] * 13 + Math.sin(p[0] * 30)); ink(c, 0.5 * smooth(0.2, 0.6, m) * smooth(-0.3, 0.2, side), fh(0x1e2414)); ink(c, 0.35 * smooth(0.3, 0.7, -m) * smooth(-0.1, 0.4, side), fh(0x8a9a48)); },
  extra: o => { const H = [0, o.ycAt(0.38)[3], o.zH]; barbel(o, 'bar1', [[0.12, H[1] + 0.0, H[2] - 0.03], [0.22, H[1] - 0.01, H[2] - 0.05], [0.29, H[1] - 0.09, H[2] - 0.07], [0.31, H[1] - 0.19, H[2] - 0.04]], 0.013, fh(0x2a2e1a)); barbel(o, 'bar2', [[0.05, H[1] - 0.06, H[2] - 0.05], [0.09, H[1] - 0.14, H[2] - 0.08], [0.12, H[1] - 0.2, H[2] - 0.14]], 0.007, fh(0xa8a070));
    teeth(o, [[0.09, H[1] - 0.008, H[2] - 0.03, 0.02, 0.008], [0.05, H[1] - 0.006, H[2] - 0.012, 0.016, 0.007]]); } });
FK.fish_loach = () => ({ K: { back: fh(0x5a4228), side: fh(0x97784a), belly: fh(0xe0d0a6), fin: [fh(0x7a5e38), fh(0xb89a62), fh(0x4a3418)], gill: fh(0x4a3418), brow: fh(0x2e2010), mouth: fh(0x2a1a0e), eye: fh(0xe8d878) },
  keys: [[-0.42, 0.05, 0.046, 0.04], [-0.2, 0.082, 0.074, 0.068], [0.0, 0.094, 0.086, 0.08], [0.2, 0.096, 0.088, 0.082], [0.34, 0.088, 0.08, 0.078], [0.42, 0.066, 0.058, 0.06, -0.004]], capB: 0.055, capA: 0.03, eyeR: 0.052, eyeBack: 0.075, eyeUp: 0.02, gill: 0.33, frown: 0.01,
  tail: { len: 0.13, ws: [0.045, 0.075, 0.085, 0.07], fork: 0 }, fins: { dorsal: { z: -0.05, len: 0.06, ws: [0.04, 0.035, 0.012], sw: [0, -0.015, -0.03], lean: 0.6 }, pect: { z: 0.3, len: 0.06, ws: [0.02, 0.024, 0.01] }, pelvic: { z: -0.08, len: 0.04, ws: [0.018, 0.016, 0.008] } },
  paint: (c, p, n, s, a, side) => { ink(c, 0.6 * cov(abs(side - 0.05) - 0.08, 0.06), fh(0x3a2a14)); ink(c, 0.45 * cov(h2(((s * 26) % 1) - 0.5, ((side * 5 + s * 3) % 1) - 0.5) - 0.18, 0.1) * smooth(0.1, 0.6, side), fh(0x3a2a14)); },
  extra: o => { dots(o, 'glow', [[0.3, 0.1, 0.012], [0.2, 0.05, 0.013], [0.1, 0.12, 0.013], [0.0, 0.04, 0.013], [-0.1, 0.1, 0.012], [-0.2, 0.05, 0.012], [-0.3, 0.08, 0.01], [0.15, -0.5, 0.009], [-0.05, -0.5, 0.009], [-0.25, -0.45, 0.008]], fh(0xd6ff5a), 1.4);
    const H = [0, o.ycAt(0.4)[3], o.zH]; barbel(o, 'bar1', [[0.03, H[1] - 0.025, H[2] - 0.012], [0.06, H[1] - 0.05, H[2] - 0.0], [0.09, H[1] - 0.08, H[2] - 0.02]], 0.006, fh(0x8a6a40)); barbel(o, 'bar2', [[0.035, H[1] - 0.03, H[2] - 0.03], [0.07, H[1] - 0.065, H[2] - 0.04], [0.09, H[1] - 0.095, H[2] - 0.07]], 0.005, fh(0x8a6a40)); } });
FK.fish_perch = () => ({ K: { back: fh(0x34502a), side: fh(0xa8b84c), belly: fh(0xf0ead0), fin: [fh(0x8a8a50), fh(0xbab070), fh(0x3a4020)], gill: fh(0x40582a), brow: fh(0x1e2c14), mouth: fh(0x24301a), spine: fh(0x2a2a18), eye: fh(0xf2a020), eyeD: fh(0xa04a10) },
  keys: [[-0.42, 0.05, 0.045, 0.03], [-0.28, 0.095, 0.085, 0.055], [-0.1, 0.17, 0.14, 0.085], [0.06, 0.212, 0.15, 0.095], [0.22, 0.185, 0.14, 0.095], [0.34, 0.13, 0.11, 0.08], [0.43, 0.08, 0.07, 0.06, -0.006]], eyeR: 0.066, eyeBack: 0.12, gill: 0.26, frown: 0.026,
  tail: { len: 0.25, ws: [0.045, 0.1, 0.15, 0.17], fork: 0.05 }, rays: 60,
  fins: { dorsal: [{ name: 'spiny', z: 0.14, len: 0.13, ws: [0.1, 0.1, 0.08, 0.03], sw: [-0.03, -0.05, -0.07, -0.1], lean: 0.25, spines: true, th: 0.009 }, { name: 'soft', z: -0.1, len: 0.09, ws: [0.07, 0.065, 0.045, 0.01], sw: [0, -0.02, -0.04, -0.06], lean: 0.5 }],
    anal: { z: -0.17, len: 0.08, ws: [0.045, 0.04, 0.012], sw: [0, -0.02, -0.04] }, pelvic: { z: 0.06, len: 0.08, ws: [0.03, 0.03, 0.012] }, pect: { z: 0.25, len: 0.09, ws: [0.028, 0.032, 0.012], sw: [0, -0.01, -0.02] } },
  finPaint: (c, name, t) => { if (name.startsWith('pelvic') || name === 'anal') { put(c, fh(0xe8562a)); ink(c, 0.4 * smooth(0.3, 1, t), fh(0xffa040)); } if (name === 'spiny') ink(c, 0.6 * smooth(0.45, 0.8, t), fh(0x1a1a10)); },
  paint: (c, p, n, s, a, side) => { const b = (s * 6.2 + 0.3) % 1; ink(c, 0.82 * cov(abs(b - 0.5) - 0.13 - 0.06 * (1 - side), 0.04) * smooth(-0.55, 0.0, side) * smooth(0.06, 0.18, s) * smooth(0.82, 0.72, s), fh(0x22301a)); } ,
  extra: o => { const H = [0, o.ycAt(0.4)[3], o.zH]; teeth(o, [[0.05, H[1] - 0.012, H[2] - 0.022, 0.022, 0.008], [0.08, H[1] - 0.012, H[2] - 0.045, 0.018, 0.007]]); } });
FK.fish_carp = () => ({ K: { back: fh(0x6a4a1e), side: fh(0xd9a23c), belly: fh(0xf4e2b2), fin: [fh(0xb45a26), fh(0xe6803e), fh(0x6a2a10)], tail: [fh(0xb8602a), fh(0xee8a44), fh(0x6a2a10)], gill: fh(0x8a5a1c), brow: fh(0x4a2e10), mouth: fh(0x4a2a12), lip: fh(0xf0c890), eye: fh(0xf6c030) },
  keys: CARP, eyeR: 0.062, eyeBack: 0.125, gill: 0.27, mouthY: -0.04, frown: 0.018, tail: { len: 0.28, ws: [0.05, 0.11, 0.17, 0.2], fork: 0.07 }, fins: carpFins(1.1),
  paint: (c, p, n, s, a, side) => { const k = scaleK(s, a, 8, 7); ink(c, 0.6 * k * smooth(-0.7, 0.3, side), fh(0x8a5418)); ink(c, 0.22 * smooth(0.6, 0.0, abs(side)), fh(0xffe08a)); },
  extra: o => { const H = [0, o.ycAt(0.4)[3], o.zH]; barbel(o, 'bar1', [[0.05, H[1] - 0.05, H[2] - 0.02], [0.08, H[1] - 0.085, H[2] - 0.0], [0.1, H[1] - 0.12, H[2] - 0.02]], 0.008, fh(0xd89a50)); barbel(o, 'bar2', [[0.07, H[1] - 0.045, H[2] - 0.05], [0.1, H[1] - 0.08, H[2] - 0.06], [0.12, H[1] - 0.1, H[2] - 0.09]], 0.006, fh(0xd89a50));
    const lip = tubeP('lip', 10, [{ p: [0, H[1] - 0.042, H[2] - 0.03], rx: 0.036, ry: 0.024 }, { p: [0, H[1] - 0.042, H[2] - 0.004], rx: 0.036, ry: 0.025 }], { ref: [1, 0, 0], capB: 0.01, capN: 2 }); lip.sk = 0; lip.col = fh(0xd89a58); lip.tex = [8, 8]; o.add(lip); } });
FK.fish_falltrout = () => ({ K: { back: fh(0x2c4a38), side: fh(0xbcc6a8), belly: fh(0xf6f0e0), fin: [fh(0x6a7a58), fh(0xb8a888), fh(0x2a3020)], tail: [fh(0x4a5a40), fh(0x9aa080), fh(0x1a2016)], gill: fh(0x3a5040), brow: fh(0x182a1e), mouth: fh(0x1a2418), eye: fh(0xf0d060) },
  keys: TROUT.map(k => [k[0], k[1] * 1.06, k[2] * 1.05, k[3], k[4]]), eyeR: 0.07, eyeBack: 0.11, gill: 0.29, tail: { len: 0.3, ws: [0.04, 0.1, 0.16, 0.19], fork: 0.05 }, fins: troutFins(K => 0, 1.1),
  paint: (c, p, n, s, a, side) => { ink(c, 0.85 * smooth(0.32, 0.1, abs(side + 0.02)) * smooth(0.06, 0.22, s), fh(0xe0587a)); const w = Math.sin(p[2] * 40 + Math.sin(p[1] * 36) * 1.6); ink(c, 0.55 * cov(abs(w) - 0.18, 0.08) * smooth(0.3, 0.75, side), fh(0xd8e0c0));
    ink(c, 0.8 * cov(h2(((s * 34 + side * 3) % 1) - 0.5, ((side * 8) % 1) - 0.5) - 0.11, 0.07) * smooth(-0.2, 0.2, side) * smooth(0.85, 0.5, side), fh(0x16201a)); },
  finPaint: (c, name, t, w) => { if (name === 'tail' || name.startsWith('dorsal')) ink(c, 0.6 * cov(h2(((t * 5) % 1) - 0.5, ((w * 30) % 1) - 0.5) - 0.14, 0.08), fh(0x1a2016)); } });
FK.fish_stonecarp = () => ({ K: { back: fh(0x45484a), side: fh(0x8c8e8a), belly: fh(0xd2cec2), fin: [fh(0x55585a), fh(0x8c8c88), fh(0x2c2e30)], gill: fh(0x3a3c3e), brow: fh(0x222426), mouth: fh(0x222224), lip: fh(0xb0aca0), eye: fh(0xe0b040), eyeD: fh(0x8a5a10) },
  keys: CARP.map(k => [k[0], k[1] * 1.04, k[2] * 1.02, k[3] * 1.12, k[4]]), eyeR: 0.058, eyeBack: 0.125, gill: 0.27, mouthY: -0.04, frown: 0.03, tail: { len: 0.26, ws: [0.055, 0.11, 0.16, 0.19], fork: 0.06 }, fins: carpFins(1.0),
  sculpt: b => { for (let i = 0; i < 9; i++) push(b, [0.06 + (i % 3) * 0.035, 0.2 + Math.floor(i / 3) * 0.02 - 0.08, 0.22 + Math.floor(i / 3) * 0.06], 0.03, [0.006, 0.006, 0]); },
  paint: (c, p, n, s, a, side) => { const k = scaleK(s, a, 7, 6); ink(c, 0.55 * k, fh(0x2c2e30)); const g = Math.sin(p[0] * 210 + p[1] * 170) * Math.sin(p[2] * 190 - p[1] * 120) * Math.sin(p[0] * 90 + p[2] * 140); ink(c, 0.35 * smooth(0.25, 0.5, g), fh(0x2a2c2e)); ink(c, 0.3 * smooth(0.25, 0.5, -g), fh(0xc8c8c0)); } });
FK.fish_frosttrout = () => ({ K: { back: fh(0x355a7e), side: fh(0xc6dcec), belly: fh(0xfafcff), fin: [fh(0x8aaecc), fh(0xeef8ff), fh(0x2a4a6a)], tail: [fh(0x6a92b8), fh(0xf0f8ff), fh(0x24405c)], gill: fh(0x3a6084), brow: fh(0x1a3048), mouth: fh(0x1a2a3a), eye: fh(0xc8f0ff), eyeD: fh(0x3a8ad0) },
  keys: TROUT.map(k => [k[0], k[1] * 1.08, k[2] * 1.06, k[3] * 1.05, k[4]]), eyeR: 0.07, eyeBack: 0.11, gill: 0.29, tail: { len: 0.31, ws: [0.04, 0.11, 0.17, 0.2], fork: 0.07 }, fins: troutFins(0, 1.15),
  paint: (c, p, n, s, a, side) => { ink(c, 0.35 * smooth(0.3, 0.05, abs(side)), fh(0x9ad0f0)); ink(c, 0.7 * cov(h2(((s * 28 + side * 2) % 1) - 0.5, ((side * 7) % 1) - 0.5) - 0.1, 0.07) * smooth(0.0, 0.4, side), fh(0x2a4a70)); const f = Math.sin(p[2] * 70 + Math.sin(p[1] * 60) * 2) * Math.sin(p[1] * 80); ink(c, 0.35 * smooth(0.5, 0.8, f) * smooth(0.4, 0.9, side), fh(0xffffff)); } });
// ---- 三尾主：比一般魚大三倍，造型要一眼認得出「這不是普通的魚」 ----
// 老鬍子（長灣，夜）：巨大的老鯰魚。四根垂到胸前的白色長鬚像老人的鬍子、嘴角掛著一枚生鏽的斷鉤和一截舊線、背上青苔和舊疤、眉骨很重
FK.fish_boss_beard = () => ({ K: { back: fh(0x26241e), side: fh(0x4a4536), belly: fh(0xa89c80), fin: [fh(0x2c2a22), fh(0x4e483a), fh(0x18160f)], gill: fh(0x1a1812), brow: fh(0xcfc6b0), mouth: fh(0x140f0a), lip: fh(0x7a6e58), eye: fh(0xffb020), eyeD: fh(0xc04010) },
  keys: CATF.map(k => [k[0], k[1] * 1.12, k[2] * 1.05, k[3] * 1.05, k[4], k[5]]), capB: 0.05, eyeR: 0.052, eyeBack: 0.1, eyeUp: 0.06, eyeTilt: 0.6, gill: 0.24, mouthY: -0.005, frown: 0.02, browUp: 0.1, pupil: 0.36, eyeGlow: 1,
  tail: { len: 0.22, ws: [0.05, 0.1, 0.125, 0.125], fork: 0.02 }, fins: { dorsal: { z: 0.12, len: 0.09, ws: [0.045, 0.04, 0.012], sw: [0, -0.02, -0.04], lean: 0.7 }, anal: { z: -0.16, len: 0.05, ws: [0.16, 0.15, 0.11], sw: [-0.01, -0.02, -0.04], lean: 0.25 }, pect: { z: 0.24, len: 0.12, ws: [0.034, 0.042, 0.016], sw: [0, -0.01, -0.03], out: [1, -0.2, -0.6] }, pelvic: { z: -0.05, len: 0.06, ws: [0.025, 0.024, 0.01] } },
  paint: (c, p, n, s, a, side) => { const m = Math.sin(p[2] * 41 + Math.sin(p[1] * 37) * 2) * Math.sin(p[1] * 43 + p[2] * 11); ink(c, 0.45 * smooth(0.3, 0.7, m) * smooth(0.1, 0.6, side), fh(0x4e6a2a)); ink(c, 0.4 * smooth(0.3, 0.7, -m), fh(0x14120c));
    if (p[0] > 0) for (const [z0, y0, ang, l] of [[0.05, 0.08, 0.5, 0.09], [-0.05, 0.05, 0.6, 0.07], [0.0, -0.02, 0.45, 0.06]]) { const dz = p[2] - z0, dy = p[1] - y0, u = dz * Math.cos(ang) + dy * Math.sin(ang), v = -dz * Math.sin(ang) + dy * Math.cos(ang); ink(c, 0.8 * cov(wedge(u + l / 2, v, l, 0.008, 0.8, 0.02), 0.004), fh(0xb8aa90)); } },
  extra: o => { const H = [0, o.ycAt(0.38)[3], o.zH], W = fh(0xe8e0cc);
    barbel(o, 'bar1', [[0.13, H[1] + 0.0, H[2] - 0.035], [0.25, H[1] + 0.01, H[2] - 0.09], [0.31, H[1] - 0.05, H[2] - 0.2], [0.3, H[1] - 0.13, H[2] - 0.32], [0.33, H[1] - 0.16, H[2] - 0.46], [0.37, H[1] - 0.13, H[2] - 0.56]], 0.02, W);
    barbel(o, 'bar2', [[0.09, H[1] - 0.04, H[2] - 0.025], [0.16, H[1] - 0.09, H[2] - 0.05], [0.19, H[1] - 0.17, H[2] - 0.13], [0.2, H[1] - 0.22, H[2] - 0.24], [0.24, H[1] - 0.22, H[2] - 0.33]], 0.014, W);
    barbel(o, 'bar3', [[0.045, H[1] - 0.075, H[2] - 0.06], [0.06, H[1] - 0.13, H[2] - 0.1], [0.09, H[1] - 0.16, H[2] - 0.2], [0.13, H[1] - 0.15, H[2] - 0.3]], 0.011, W);
    teeth(o, [[0.1, H[1] - 0.008, H[2] - 0.035, 0.026, 0.009], [0.07, H[1] - 0.008, H[2] - 0.018, 0.022, 0.008], [0.035, H[1] - 0.006, H[2] - 0.006, 0.02, 0.007]]);
    // 嘴角的斷鉤與舊線（只在左邊）
    const hk = horn('hook', 5, [[0.15, H[1] - 0.02, H[2] - 0.06], [0.19, H[1] - 0.06, H[2] - 0.08], [0.2, H[1] - 0.1, H[2] - 0.06], [0.18, H[1] - 0.11, H[2] - 0.03], [0.16, H[1] - 0.09, H[2] - 0.02]], 0.008, { tip: 0.4 }); hk.sk = 0; hk.col = fh(0x8a4a26); hk.tex = [8, 8]; o.add(hk);
    const ln = horn('line', 4, [[0.16, H[1] - 0.02, H[2] - 0.06], [0.22, H[1] + 0.05, H[2] - 0.18], [0.24, H[1] + 0.02, H[2] - 0.34], [0.26, H[1] - 0.06, H[2] - 0.46]], 0.0035, { tip: 0.8 }); ln.sk = 0; ln.col = fh(0xd8d0b8); ln.tex = [8, 8]; o.add(ln);
    dots(o, 'wart', [[0.28, 0.6, 0.016], [0.22, 0.85, 0.014], [0.32, 0.3, 0.012], [0.14, 0.7, 0.012], [0.05, 0.9, 0.014]], fh(0x5a5440), 0, 0.6); } });
// 鏡王（鏡池，清晨）：巨大的鏡鯉。身上一排排鏡子般的大鱗片（亮銀、反光帶藍），背上一道金色的高背鰭像王冠；神氣、瞪人
FK.fish_boss_mirror = () => ({ K: { back: fh(0x9a7420), side: fh(0xc4b48a), belly: fh(0xf6eedc), fin: [fh(0xd8a030), fh(0xffe080), fh(0x8a5a10)], tail: [fh(0xd09028), fh(0xffe28a), fh(0x7a4a10)], gill: fh(0x8a6a1c), brow: fh(0x4a3008), mouth: fh(0x4a2a10), lip: fh(0xf0d0a0), eye: fh(0xff5a3a), eyeD: fh(0x9a1a10) },
  keys: CARP.map(k => [k[0], k[1] * 1.2, k[2] * 1.1, k[3] * 1.1, k[4]]), eyeR: 0.064, eyeBack: 0.125, gill: 0.27, mouthY: -0.045, frown: 0.03, pupil: 0.4, metal: 0.12, rough: 0.34, eyeGlow: 0.6,
  tail: { len: 0.3, ws: [0.05, 0.12, 0.19, 0.23], fork: 0.09 },
  fins: { dorsal: { z: -0.12, len: 0.05, ws: [0.06, 0.05, 0.015], sw: [0, -0.015, -0.03], lean: 0.6 }, anal: { z: -0.2, len: 0.09, ws: [0.045, 0.04, 0.012], sw: [0, -0.02, -0.04] }, pelvic: { z: 0.0, len: 0.09, ws: [0.034, 0.034, 0.012] }, pect: { z: 0.26, len: 0.11, ws: [0.034, 0.04, 0.014], sw: [0, -0.01, -0.02] } },
  sculpt: b => { b.map(p => { if (p[1] > 0.1 && p[2] > -0.1 && p[2] < 0.3) p[1] += 0.012 * Math.sin((p[2] + 0.1) / 0.4 * PI); }); },
  // 王冠背鰭：鰭的上緣做成一個個尖
  finPaint: (c, name, t) => { if (name.startsWith('dorsal')) { put(c, fh(0xe0a020)); ink(c, smooth(0.3, 1.0, t), fh(0xfff0a0)); } },
  paint: (c, p, n, s, a, side) => { const ns = 5.5, na = 4.2, i = Math.floor(s * ns), sh = (i & 1) * 0.5, j = Math.floor(a * na + sh), fu = s * ns - i, fv = a * na + sh - j, inS = Math.max(abs(fu - 0.5) * 1.05, abs(fv - 0.5)) * 0.6 + h2(fu - 0.5, fv - 0.5) * 0.5;
    if (abs(side) < 0.86 && s > 0.1 && s < 0.8 && ((i * 7 + j * 3) % 5) !== 1) { const m = cov(inS - 0.4, 0.02), g = clamp(0.5 + (fu - fv) * 0.9, 0, 1); ink(c, m, [lerp(170, 255, g), lerp(182, 255, g), lerp(200, 255, g)]); ink(c, m * 0.9 * cov(abs(fu + fv - 0.85 - 0.1 * Math.sin(i + j)) - 0.05, 0.03), [255, 255, 255]); ink(c, 0.9 * cov(abs(inS - 0.41) - 0.018, 0.012), fh(0x5a4210)); } } ,
  extra: o => { const GOLD = fh(0xf2c030); const zs = [0.24, 0.16, 0.08, 0.0, -0.08], hs = [0.11, 0.15, 0.21, 0.15, 0.11];
    zs.forEach((z, i) => { const k = o.ycAt(z), b = [0, k[3] + k[0] - 0.03, z], sp = spike("crown" + i, b, add3(b, [0, hs[i], -0.02], 1), [0, 0, 1], 0.05, 0.018, 4, 0.75); sp.sk = 0; sp.col = GOLD; sp.tex = [8, 8]; sp.flat = true; o.add(sp); const gem = ball('gem' + i, 6, 3, [0.02, 0.02, 0.02]); place(gem, add3(b, [0, hs[i] + 0.006, -0.022], 1)); gem.sk = 0; gem.col = i === 2 ? fh(0xff3a3a) : fh(0xfff4c0); gem.tex = [8, 8]; gem.glow = 0.4; o.add(gem); });
    const band = tubeP('band', 6, zs.map(z => { const k = o.ycAt(z); return { p: [0, k[3] + k[0] - 0.012, z], rx: 0.03, ry: 0.016 }; }), { ref: [1, 0, 0], capA: 0.01, capB: 0.01, capN: 1 }); band.sk = 0; band.col = fh(0xd8a020); band.tex = [8, 8]; o.add(band);
    const H = [0, o.ycAt(0.4)[3], o.zH]; barbel(o, 'bar1', [[0.05, H[1] - 0.055, H[2] - 0.02], [0.09, H[1] - 0.095, H[2] - 0.0], [0.11, H[1] - 0.14, H[2] - 0.03]], 0.009, fh(0xe8b050));
    const lip = tubeP('lip', 10, [{ p: [0, H[1] - 0.05, H[2] - 0.025], rx: 0.05, ry: 0.034 }, { p: [0, H[1] - 0.05, H[2] + 0.006], rx: 0.05, ry: 0.036 }], { ref: [1, 0, 0], capB: 0.014, capN: 2 }); lip.sk = 0; lip.col = fh(0xf0c890); lip.tex = [8, 8]; o.add(lip); } });
// 霜鰭（霜泉，夜）：巨大的霜鱒。背鰭、尾鰭、胸鰭的邊緣長滿冰晶（會發一點冷光），身上霜花紋，眼睛發青光
FK.fish_boss_frost = () => ({ K: { back: fh(0x1c3456), side: fh(0x8eb4d4), belly: fh(0xf4faff), fin: [fh(0x6a9ac4), fh(0xdff2ff), fh(0x1a3050)], tail: [fh(0x5a8ab8), fh(0xe8f6ff), fh(0x14284a)], gill: fh(0x24426a), brow: fh(0x0e1c30), mouth: fh(0x0e1a2a), eye: fh(0xb8ffff), eyeD: fh(0x18a0e0), pupil: fh(0x06223a) },
  keys: TROUT.map(k => [k[0], k[1] * 1.12, k[2] * 1.08, k[3] * 1.08, k[4]]), eyeR: 0.06, eyeBack: 0.11, gill: 0.29, frown: 0.03, pupil: 0.34, eyeGlow: 1.5, tail: { len: 0.32, ws: [0.04, 0.12, 0.19, 0.23], fork: 0.1 }, fins: troutFins(0, 1.3),
  paint: (c, p, n, s, a, side) => { const f = Math.sin(p[2] * 50 + Math.sin(p[1] * 44) * 2.4) * Math.sin(p[1] * 64 + p[2] * 20); ink(c, 0.55 * smooth(0.6, 0.85, abs(f)) * smooth(-0.1, 0.5, side) * smooth(0.95, 0.6, side), fh(0xe8f6ff)); ink(c, 0.5 * smooth(0.25, 0.0, abs(side + 0.05)), fh(0x7ad0ff)); },
  extra: o => { const ice = fh(0xd8f6ff), shard = (name, base, dir, l, r) => { const t = cone(name, 4, base, add3(base, dir, l * 0.5), add3(base, dir, l), r, [1, 0, 0]); t.sk = base[2] < -0.2 ? 1 : 0; t.col = ice; t.tex = [8, 8]; t.glow = 0.5; t.flat = true; o.add(t); return t; };
    [[0.24, 0.07, 0.022, -0.25], [0.16, 0.12, 0.028, -0.35], [0.08, 0.15, 0.03, -0.45], [0.0, 0.13, 0.027, -0.55], [-0.08, 0.1, 0.022, -0.65], [-0.15, 0.07, 0.018, -0.75]].forEach(([z, l, r, lean], i) => { const k = o.ycAt(z), sd = i % 2 ? 0.018 : -0.018; shard('ice' + i, [sd, k[3] + k[0] - 0.02, z], norm3([sd * 4, 1, lean]), l, r); });
    [[0.14, 0.09], [0.0, 0.11], [-0.14, 0.09]].forEach(([dy, l], i) => shard('icet' + i, [0, o.ycAt(o.zT)[3] + dy * 1.7, o.zT - 0.27], norm3([0, dy * 2.5, -1]), l, 0.02));
    [[0.02, 0.07], [-0.05, 0.06]].forEach(([dy, l], i) => { const k = o.ycAt(0.2), b = [k[2] * 0.9, k[3] + dy, 0.19]; const t = shard('iceg' + i, b, norm3([0.5, dy * 2, -1]), l, 0.016); o.add(mirrorX(t, 'icegR' + i)).sk = 0; });
    dots(o, 'frost', [[0.3, 0.5, 0.012], [0.18, 0.7, 0.014], [0.06, 0.55, 0.013], [-0.06, 0.7, 0.012], [-0.18, 0.5, 0.011], [0.12, 0.25, 0.01], [-0.02, 0.3, 0.01]], fh(0xc8f4ff), 0.9); } });

export const FISH_IDS = ['fish_crucian', 'fish_startrout', 'fish_catfish', 'fish_loach', 'fish_perch', 'fish_carp', 'fish_falltrout', 'fish_stonecarp', 'fish_frosttrout'];
export const FISH_BOSS_IDS = ['fish_boss_beard', 'fish_boss_mirror', 'fish_boss_frost'];
// 遊戲裡的全長（公尺；角色身高約 2.4）。Q 版放大：真的鯽魚 20 公分，這裡 0.42，抱在手上看得清楚
export const FISH_LEN = { fish_crucian: 0.42, fish_startrout: 0.56, fish_catfish: 0.8, fish_loach: 0.34, fish_perch: 0.52, fish_carp: 0.78, fish_falltrout: 0.66, fish_stonecarp: 0.84, fish_frosttrout: 0.76, fish_boss_beard: 1.9, fish_boss_mirror: 1.55, fish_boss_frost: 1.7 };
const fishCache = {};
function fishShader(sh) {
  sh.uniforms.uGlowK = this.userData.glowK;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
  sh.fragmentShader = 'uniform float uGlowK;\nvarying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlowK;');
}
function fishBase(id) {
  let sp = fishCache[id]; if (sp) return sp;
  sp = fishCache[id] = buildFish(id, true);
  const mat = new THREE.MeshStandardMaterial({ map: sp.tex, roughness: sp.D.rough ?? 0.5, metalness: sp.D.metal ?? 0.04 }); mat.userData.glowK = { value: 0.55 }; mat.onBeforeCompile = fishShader; mat.customProgramCacheKey = () => 'fish07';
  sp.mat = mat; return sp;
}
function fishSpecies(id) { const sp = fishBase(id); if (!sp.painted) sp.paint(); return sp; }
// 預先建立：第一次建一種魚（幾何＋畫貼圖）在這台機器上要 0.1–0.7 秒，釣到才建會頓一下。進遊戲後呼叫一次 preload07()，
// 趁空檔每次只做幾毫秒（和 creatures.js 預先建立怪物同一種做法）。list 不給就是 12 種魚加上釣竿、浮標、陷阱等小道具
export function preload07(list = null, msPerStep = 6) {
  const q = (list || [...FISH_IDS, ...FISH_BOSS_IDS, ...Object.keys(STATIC).filter(n => n !== 'board' && n !== 'draw_table')]).slice(); let cur = null;
  const step = () => { let wait = 40; try { if (!cur) { const id = q.shift(); if (!id) return; if (FISH_LEN[id]) { cur = fishBase(id); if (cur.painted) cur = null; } else if (STATIC[id]) staticGeo(id); wait = 60; } else if (cur.paint(msPerStep)) { cur = null; wait = 60; } } catch (e) { console.warn('props07 預先建立失敗', e); cur = null; } setTimeout(step, wait); };
  if (typeof setTimeout === 'function') setTimeout(step, 500);
}
// 一尾魚：Group（原點在魚身中心，頭朝 +z）。userData.flap(t, k)：擺尾（k 0–1 掙扎的力道）；userData.setNight(n)：夜光（0–1）
function makeFish(id, opt = {}) {
  const sp = fishSpecies(id), L = (opt.len || FISH_LEN[id] || 0.5) / sp.len, root = new THREE.Group(), bones = sp.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
  sp.bones.forEach((b, i) => { const pp = b.parent < 0 ? [0, 0, 0] : sp.bones[b.parent].p; (b.parent < 0 ? root : bones[b.parent]).add(bones[i]); bones[i].position.set(b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]); });
  const mat = opt.ownMat ? sp.mat.clone() : sp.mat, mesh = new THREE.SkinnedMesh(sp.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh); mesh.bind(new THREE.Skeleton(bones, sp.inv), new THREE.Matrix4());
  root.scale.setScalar(L); root.name = 'prop:' + id;
  // 擺動：從頭往尾傳的身體波。每一節的「絕對偏轉角」＝振幅（頭 ≈ 0、往尾平方增加）× sin(相位 − 節數 × 延遲)，骨頭的區域旋轉是相鄰兩節的差。
  // k（0–1）越大：頻率越高、振幅越大，並疊上一個慢的 C 形彎（整條身體像弓一樣彎過去再彈回來）＝掙扎。相位用累加的（k 隨時間變也不會跳）
  const nb = bones.length; let ph = 0, ph2 = Math.random() * 6, last = null; const th = new Float32Array(nb);
  root.userData.flap = (t, k = 0.3) => {
    const dt = last === null || t < last || t - last > 0.5 ? 1 / 60 : t - last; last = t; k = clamp(k, 0, 1);
    ph += dt * (7 + k * 9); ph2 += dt * (2.4 + k * 3.2); const big = smooth(0.5, 0.95, k);      // k ≥ 0.7（舉魚、拉上岸的掙扎）幅度明顯加大：尾端側擺約體長 25–30%、中段也彎成 C／S；k 小（水裡游）維持細緻
    for (let i = 0; i < nb; i++) { const s = i / (nb - 1), env = 0.06 + 0.94 * Math.pow(s, 1.6);
      th[i] = (0.12 + 0.5 * k + 0.75 * big) * env * Math.sin(ph - i * 0.95) * (0.9 + 0.1 * Math.sin(ph2 * 1.7)) + (k * 0.6 + 0.7 * big) * Math.sin(ph2) * Math.pow(s, 1.15); }
    for (let i = 0; i < nb; i++) bones[i].rotation.y = i ? th[i] - th[i - 1] : th[0] * 0.25;
  };
  // 身體上某一點目前（彎曲之後）的位置：z 沿身體、y 高度；回傳魚的區域座標（模型單位，要乘 root.scale）。舉魚時手要跟著魚走，用這個算抓點
  const Mc = bones.map(() => new THREE.Matrix4()), Jv = sp.J.map(z => new THREE.Vector3(0, 0, z)), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
  root.userData.point = (z, y = 0, out = new THREE.Vector3()) => {
    for (let i = 0; i < nb; i++) { bones[i].updateMatrix(); if (i) Mc[i].multiplyMatrices(Mc[i - 1], bones[i].matrix); else Mc[0].copy(bones[0].matrix); }
    const J = sp.J; let i0 = nb - 1, u = 0; if (z >= J[0]) { i0 = 0; } else for (let i = 0; i < nb - 1; i++) if (z >= J[i + 1]) { i0 = i; u = (J[i] - z) / (J[i] - J[i + 1]); break; }
    _p.set(0, y, z).sub(Jv[i0]).applyMatrix4(Mc[i0]); if (u > 0) { _p2.set(0, y, z).sub(Jv[i0 + 1]).applyMatrix4(Mc[i0 + 1]); _p.lerp(_p2, u); } return out.copy(_p);
  };
  root.userData.prof = z => sp.ycAt(z);      // [背的半高, 腹的半高, 半寬, 中心高]（模型單位）
  root.userData.zT = sp.zT; root.userData.zH = sp.zH; root.userData.mlen = sp.len;
  root.userData.setNight = n => { mat.userData.glowK.value = 0.35 + 0.9 * n; };
  root.userData.tris = sp.tris; root.userData.len = opt.len || FISH_LEN[id]; root.userData.L = root.userData.len;      // L：fish07.js 暫代魚用的長度欄位，掛在線上時用來算魚心離竿尖多遠
  return root;
}

/* ============================== 場景小道具（幾何＋頂點色，照抄 props06 的組合器） ============================== */
const sstep = smooth;
const rng = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const _c0 = new THREE.Color(), _c1 = new THREE.Color(), _m4 = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
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
let sMat = null;
const staticMat = () => sMat || (sMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, side: THREE.DoubleSide }));
const geoCache07 = new Map();
const WOOD = [0x4a2f1c, 0x80583a], WOODL = [0x6a4a2c, 0xa07850], IRON = [0x2a2c32, 0x5e626c], RUST = [0x5a2e1a, 0x9a5630], BRASS = [0x8a6420, 0xf0c050], BONE = [0xb8ad94, 0xf2ead6], SOIL = [0x3e2c1c, 0x5c4228];
function logPiece(B, a, b, r, n = 6, col = WOOD, o = {}) { stalk(B, a, b, r, r * 0.92, col, n, Object.assign({ jit: 0.05 }, o)); const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.acos(clamp(d.y / len, -1, 1));
  B.add(new THREE.CircleGeometry(r * 0.92, n), { at: b, rot: [pitch - Math.PI / 2, yaw, 0], col: o.end || 0xd8b27c }); B.add(new THREE.CircleGeometry(r, n), { at: a, rot: [pitch + Math.PI / 2, yaw, 0], col: o.end || 0xd8b27c }); }
// 翻過的土：一圈不規則、微微隆起的深色土（陷阱附近看得出來的痕跡）。0.7b：9 顆 20 面的小土塊改成 4 顆 8 面
function soilRing(B, r, seed) { const R = rng(seed), g = new THREE.CircleGeometry(r, 14), p = g.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.8 + R() * 0.26; p.setXY(i, p.getX(i) * k, p.getY(i) * k); } B.add(g, { at: [0, 0.014, 0], rot: [-Math.PI / 2, 0, 0], col: 0x8c6a46, jit: 0.06 });      // d8-art：翻過的土比草地淺、偏暖（鐵顎是深色，才分得出來）
  const g2 = new THREE.CircleGeometry(r * 1.18, 12), p2 = g2.attributes.position; for (let i = 1; i < p2.count; i++) { const k = 0.74 + R() * 0.38; p2.setXY(i, p2.getX(i) * k, p2.getY(i) * k); } B.add(g2, { at: [0, 0.007, 0], rot: [-Math.PI / 2, 0, 0], col: 0x5e4428, flat: true });      // 邊緣碎開的一圈
  for (let i = 0; i < 7; i++) { const a = (i + 0.15 + R() * 0.7) / 7 * TAU, d = r * (0.86 + R() * 0.2); B.add(octa(0.09 + R() * 0.04), { at: [Math.cos(a) * d, 0.02, Math.sin(a) * d], sc: [1.3, 0.55, 0.9], rot: [0, a + R() * 0.6, 0], col: [0x4e3820, 0x7a5a38], flat: true, jit: 0.12 }); } }      // 「土翻過一圈」：外緣一圈翻起來的土塊
// 一顆齒：底是一個菱形（寬 2w、厚 2th）、尖在 tip（4 個三角形）。b 底中心、e 寬的方向、n 厚的方向
function toothGeo(b, tip, e, n, w, th) {
  const p = [add3(b, e, w), add3(b, n, th), add3(b, e, -w), add3(b, n, -th)], pos = []; for (let i = 0; i < 4; i++) pos.push(...tip, ...p[i], ...p[(i + 1) % 4]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
const TOOTH = [0xa4aab4, 0xffffff], JAWC = [0x1e1b1c, 0x46403e], JAWC2 = [0x262022, 0x524846];      // d8-art：鐵顎改深鐵色（在淺色翻土上是深的輪廓），齒更亮
// 捕獸夾：兩片帶齒的半圓鐵顎（張開時微微翹起、夾住時豎起咬合）、中間的踏板、彈簧、一截鍊子和固定樁；周圍一圈翻過的土。
// 0.7b：齒改成每片 5–6 顆、長 0.14、顏色比鐵顎亮、齒尖最亮；三角形砍半；張開的有兩點鐵光（部位 4，夜裡亮、一閃一閃）。
// 鐵顎繞 X 軸（兩端的鉸鏈）轉：張開時離地 0.2 弧度（翹一點才看得到齒的輪廓），夾住時兩片豎直、各偏 0.02 公尺，齒錯開相互咬合
function trapJaw(B, closed) {
  soilRing(B, 0.78, 7);      // d8-art：翻土 0.5 → 0.78 公尺（草地壓草的半徑跟著它，見 world.js grassPress07）
  const R = 0.36, HY = 0.06, beta = closed ? PI / 2 + 0.36 : 0.2, glints = [];      // d8-art：夾上時兩片鐵顎從兩側斜著合起來（像「人」字帳篷、頂上齒交錯），從上面和側面都看得出「合上了」
  for (const s of [1, -1]) {
    const a = s * (PI / 2 - beta), ca = cos(a), sa = sin(a), zo = closed ? s * 0.125 : 0, rx = v => [v[0], v[1] * ca - v[2] * sa, v[1] * sa + v[2] * ca], wp = v => { const q = rx(v); return [q[0], q[1] + HY, q[2] + zo]; };
    B.add(new THREE.TorusGeometry(R, 0.038, 3, 8, PI), { at: [0, HY, zo], rot: [a, 0, 0], col: s > 0 ? JAWC : JAWC2, flat: true, jit: 0.12 });
    const n = s > 0 ? 6 : 5, tt = closed ? 0.5 : 0.75;
    for (let i = 0; i < n; i++) {
      const th = (s > 0 ? (i + 0.5) / 6 : (i + 1) / 6) * PI, c = cos(th), sn = sin(th), r0 = R - 0.012;
      const lb = [r0 * c, r0 * sn, 0], dir = [-c * cos(tt), -sn * cos(tt), -s * sin(tt)], TL = 0.185, tip = [lb[0] + dir[0] * TL, lb[1] + dir[1] * TL, lb[2] + dir[2] * TL];
      B.add(toothGeo(wp(lb), wp(tip), rx([-sn, c, 0]), rx([0, 0, 1]), 0.042, 0.016), { col: TOOTH, flat: true, jit: 0.05, part: 5, glow: -0.3 });      // d8-art：齒長 0.15→0.185、寬 0.034→0.042；部位 5＝夜裡淡淡反月光（只在角色附近，不閃）
      if (!closed && ((s > 0 && (i === 1 || i === 4)) || (s < 0 && i === 2))) glints.push(wp(tip));
    }
  }
  B.add(new THREE.TorusGeometry(R + 0.02, 0.032, 3, 9), { at: [0, 0.035, 0], rot: [Math.PI / 2, 0, 0], col: [0x1e1c1e, 0x40393a], flat: true, jit: 0.1 });      // 底座的鐵環
  B.add(new THREE.CylinderGeometry(0.12, 0.13, 0.025, 7), { at: [0, closed ? 0.03 : 0.05, 0], col: [0x6a5238, 0x9a7a54], jit: 0.08 });      // 踏板
  for (const s of [-1, 1]) { B.add(new THREE.TorusGeometry(0.07, 0.022, 3, 6), { at: [s * (R + 0.12), 0.05, 0], rot: [Math.PI / 2, 0, 0], col: RUST, flat: true }); stalk(B, [s * (R + 0.02), 0.04, 0], [s * (R + 0.08), 0.05, 0], 0.025, 0.025, RUST, 3); }      // 兩側的彈簧
  for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(0.04, 0.011, 3, 4), { at: [0.1 + i * 0.08, 0.025, R + 0.1 + i * 0.08], rot: [Math.PI / 2, i % 2 ? Math.PI / 2 : 0, i % 2 ? Math.PI / 2 : 0], col: RUST, flat: true });      // 鍊子（3 節）
  stalk(B, [0.33, -0.1, R + 0.32], [0.33, 0.09, R + 0.3], 0.03, 0.035, IRON, 5); B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 6), { at: [0.33, 0.09, R + 0.3], col: IRON });
  B.set(4, 0, -3.4); for (const g of glints) B.add(octa(0.05), { at: [g[0], g[1] + 0.014, g[2]], col: 0xf4f8ff, flat: true }); B.set(0, 0, 0);      // d8-art：鐵光 2→3 點、0.034→0.05、glow −2.5→−3.4（只在角色 9 公尺內亮，見 swayMat 的 uMe）      // 鐵光：白天淡淡一點、夜裡亮，一閃一閃（著色器依部位 4 乘上脈動）
}
// 絆索鈴：路兩邊各一根短木樁，中間拉一條細繩（離地 0.3），掛三個黃銅小鈴；len＝繩長（4–6 公尺），繩沿 X 軸。0.7b：中間那個鈴頂有一點銅光（部位 4）；鈴裡的小鈴舌拿掉（看不到，省 60 面）
function tripBell(B, len) {
  const L = len / 2;
  for (const s of [-1, 1]) { stalk(B, [s * L, -0.05, 0], [s * L * 1.01, 0.48, 0.02], 0.045, 0.035, WOOD, 5, { jit: 0.08 }); B.add(octa(0.07), { at: [s * L, 0.02, 0], sc: [1.6, 0.4, 1.6], col: SOIL, flat: true }); }
  const sag = 0.06, Y = 0.32, n = 10; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, y = t => Y - sag * 4 * t * (1 - t); stalk(B, [-L + len * t0, y(t0), 0.015], [-L + len * t1, y(t1), 0.015], 0.014, 0.014, [0xe8dcc0, 0xfffaea], 3); }      // d8-art：繩子 0.01→0.014、亮一點（草沿著繩子壓低，見 world.js grassPress07）
  for (const t of [0.3, 0.5, 0.7]) { const x = -L + len * t, y = Y - sag * 4 * t * (1 - t); stalk(B, [x, y, 0.015], [x, y - 0.06, 0.015], 0.005, 0.005, [0xd8cdb0, 0xfff6dc], 3);
    B.add(lathe([[0.0, 0.0], [0.07, 0.006], [0.075, 0.04], [0.055, 0.095], [0.016, 0.12], [0, 0.123]], 8), { at: [x, y - 0.18, 0.015], col: BRASS, gy: [y - 0.18, y - 0.06] });
    if (t === 0.5) { B.set(4, 0, -2.2); B.add(octa(0.022), { at: [x + 0.012, y - 0.075, 0.03], col: 0xfff2c0, flat: true }); B.set(0, 0, 0); } }
}
// 絆索斷繩（絆到之後換成這個）：兩根樁還立著，繩子從樁頂垂下來斷成兩截、斷頭散開（毛邊）躺在路面上，三個鈴掉在地上（一個側倒）。繩長 len 同 trap_bell
function tripBellCut(B, len) {
  const L = len / 2, R = rng(Math.round(len * 10) + 11), CORD = [0xd8cdb0, 0xfff6dc];
  for (const s of [-1, 1]) { stalk(B, [s * L, -0.05, 0], [s * L * 1.01, 0.48, 0.02], 0.045, 0.035, WOOD, 5, { jit: 0.08 }); B.add(octa(0.07), { at: [s * L, 0.02, 0], sc: [1.6, 0.4, 1.6], col: SOIL, flat: true });
    // 繩子：從樁上的結垂下來，再貼著地面往中間躺（有點彎），盡頭散開
    const pts = [[s * L, 0.32, 0.015], [s * (L - 0.1), 0.18, 0.03], [s * (L - 0.28), 0.04, 0.07]], gx0 = L - 0.28, gx1 = 0.22 + (s > 0 ? 0.12 : 0), m = 5;
    for (let i = 1; i <= m; i++) { const q = i / m, x = lerp(gx0, gx1, q); pts.push([s * x, 0.014 + (i === m ? 0.02 : 0), (R() - 0.5) * 0.16 * (1 - q * 0.3) + (s > 0 ? -0.06 : 0.1) * q]); }
    for (let i = 0; i < pts.length - 1; i++) stalk(B, pts[i], pts[i + 1], 0.011, 0.011, CORD, 3);
    const e = pts[pts.length - 1]; for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.55 + (s > 0 ? 0.2 : -0.2), l = 0.07 + R() * 0.05; stalk(B, e, [e[0] - s * Math.cos(a) * l, 0.012 + k * 0.004, e[2] + Math.sin(a) * l], 0.006, 0.002, CORD, 3); }      // 毛邊
  }
  const bell = (x, z, tilt, yaw, side) => { B.add(lathe([[0.0, 0.0], [0.07, 0.006], [0.075, 0.04], [0.055, 0.095], [0.016, 0.12], [0, 0.123]], 8), { at: [x, side ? 0.072 : 0, z], rot: [0, yaw, side ? 1.45 : tilt], col: BRASS, gy: side ? [0, 0.16] : [0, 0.12] });
    stalk(B, [x, side ? 0.03 : 0.12, z + 0.02], [x + 0.06, 0.012, z + 0.1], 0.005, 0.005, CORD, 3); };      // 鈴＋一小截鈴繩
  bell(-0.2 * len, 0.2, 0.14, 0.4, false); bell(0.03, -0.2, 0, 2.2, true); bell(0.2 * len, 0.12, -0.12, 1.0, false);
}
// 紅布樁：一根削尖的木樁，上面綁著一條破舊的紅布（風會吹動布尾）。lean：歪的角度；fallen：倒在地上
function redStake(B, lean = 0, fallen = false) {
  const H = 1.15, tilt = fallen ? 1.45 : lean, top = [Math.sin(tilt) * H, Math.cos(tilt) * H, 0], at = t => [top[0] * t, top[1] * t + (fallen ? 0.06 : 0), 0];
  stalk(B, at(0), at(1), 0.05, 0.042, [0x5a3a22, 0x8e6a44], 5, { jit: 0.08 }); B.add(new THREE.ConeGeometry(0.042, 0.08, 5), { at: at(1.02), rot: [0, 0, -tilt], col: 0xc8a070 });
  if (!fallen) B.add(ico(0.07), { at: [0, 0.01, 0], sc: [1.8, 0.4, 1.8], round: true, col: SOIL });
  const kn = at(0.82); B.add(new THREE.TorusGeometry(0.055, 0.02, 4, 8), { at: kn, rot: [Math.PI / 2, 0, -tilt], col: [0x8a1a14, 0xc8281e] });
  // 布尾：兩條破布從結往下風處飄（sway 讓它被風吹動）
  const cloth = (len, w, dz, droop) => { const g = leafGeo(len, w, -0.1, droop, 4, 0.05, t => (1 - t * 0.55) * (0.85 + 0.15 * Math.sin(t * 17))); B.add(g, { at: kn, rot: [0, Math.PI / 2 + dz, 0], col: [0xa01e16, 0xd8402c], sway: fallen ? 0 : 0.25 }); };
  cloth(0.6, 0.1, 0.2, 0.8); cloth(0.46, 0.08, -0.35, 1.0);
}
// 爪痕樹：一棵被抓過的活松樹（0.7b）。和世界裡 KayKit 的 tree_single_A／B 同風格：五邊形的錐形樹冠一層一層疊（5 層，最下面一層墊底）、平面著色、
// 顏色取自世界的樹（樹冠 #007450 一帶、頂部 #009057、樹幹 #af6d50）、樹冠底離地 3.5 公尺、樹高約 8.6 公尺。樹幹在 1–2.3 公尺高處有兩組、各三道深而長、露出淺色木頭的爪痕（正反兩面），
// 一根被扯斷的樹枝斷在樹幹上、一根掛在最下層樹冠上晃著、一根掉在地上，樹根處有翻起的土與碎樹皮。seed 改樹冠層的轉向、爪痕的面與斜向
function gashGeo(L, w) { const p = [[0, L / 2], [w / 2, L * 0.28], [w / 2, -L * 0.3], [0, -L / 2], [-w / 2, -L * 0.3], [-w / 2, L * 0.28]], pos = []; for (let i = 1; i < 5; i++) pos.push(p[0][0], p[0][1], 0, p[i][0], p[i][1], 0, p[i + 1][0], p[i + 1][1], 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; }
function jitterXZ(g, seed, amt) { const p = g.attributes.position, r = rng(seed), map = new Map(); for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); let d = map.get(k); if (!d) { d = 1 + (r() - 0.5) * 2 * amt; map.set(k, d); } if (Math.hypot(p.getX(i), p.getZ(i)) > 1e-4) p.setXYZ(i, p.getX(i) * d, p.getY(i), p.getZ(i) * d); } return g; }
function clawTree(B, seed = 3) {
  const R = rng(seed * 7919 + 13), psi0 = R() * TAU, kA = Math.floor(R() * 5), roll = (R() < 0.5 ? -1 : 1) * 0.09, TH = 4.4, r0 = 0.44, r1 = 0.27, rAt = y => lerp(r0, r1, clamp(y / TH, 0, 1));
  B.add(cyl(r1, r0, TH + 0.05, 5, true), { at: [0, -0.05, 0], rot: [0, psi0, 0], col: [0xb07252, 0xcc8c64], flat: true, jit: 0.06 });      // 樹幹（五邊形，下粗上細）
  const tiers = [[3.5, 2.6, 1.3, 1.5, 0x005a44, 0x007a52], [4.5, 2.1, 1.0, 1.5, 0x006048, 0x008055], [5.5, 1.6, 0.7, 1.4, 0x00674c, 0x008a58], [6.5, 1.15, 0.4, 1.3, 0x00704e, 0x00985c], [7.4, 0.72, 0.0, 1.25, 0x007a52, 0x00a65c]];
  tiers.forEach(([y, rb, rt, h, c0, c1], i) => { const yaw = R() * TAU / 5; B.add(jitterXZ(cyl(rt, rb, h, 5, true), seed * 31 + i, 0.07), { at: [0, y, 0], rot: [0, yaw, 0], col: [c0, c1], flat: true, jit: 0.05 });
    B.add(jitterXZ(new THREE.CircleGeometry(rb, 5), seed * 17 + i, 0.07), { at: [0, y, 0], rot: [Math.PI / 2, yaw, 0], col: c0, flat: true, jit: 0.04 }); });      // 每層的底（抬頭看得到）
  // 爪痕：每組三道，貼在樹幹的一個面上（面中心角 ψ），先一道深色的凹槽、上面一道淺色的木頭
  const claw = (k, sgn) => { const psi = psi0 + TAU * (k + 0.5) / 5, tap = Math.atan((r0 - r1) / TH), y0 = k === kA ? 1.8 : 1.62, ap = y => rAt(y) * cos(PI / 5);
    [[-0.11, 1.25, 0.01], [0, 1.45, 0.0], [0.11, 1.1, -0.02]].forEach(([u, L, dy]) => { const yc = y0 + dy, d = ap(yc) + 0.014, c = [Math.sin(psi) * d + Math.cos(psi) * u, yc, Math.cos(psi) * d - Math.sin(psi) * u];
      B.add(gashGeo(L * 1.1, 0.1), { at: c, rot: [-tap, psi, roll * sgn], col: 0x3a2014, flat: true });
      B.add(gashGeo(L * 0.98, 0.07), { at: [c[0] + Math.sin(psi) * 0.008, c[1], c[2] + Math.cos(psi) * 0.008], rot: [-tap, psi, roll * sgn], col: [0xf0d8a0, 0xffeec8], flat: true, glow: 0.35 }); }); };
  claw(kA, 1); claw((kA + 2) % 5, -1);
  // 被扯斷的樹枝：樹幹上斷在 3 公尺高的一截（斷口淺色、帶木刺）
  { const psi = psi0 + TAU * (kA + 3.5) / 5, d = rAt(3.0) * 0.8, p0 = [Math.sin(psi) * d, 3.0, Math.cos(psi) * d], p1 = [Math.sin(psi) * (d + 0.55), 3.12, Math.cos(psi) * (d + 0.55)]; stalk(B, p0, p1, 0.075, 0.05, [0x7a4a30, 0x9a6444], 4, { flat: true });
    B.add(new THREE.CircleGeometry(0.052, 4), { at: p1, rot: [Math.PI / 2 - 0.1, psi + Math.PI / 2, 0], col: 0xe8cc98, flat: true });
    for (let k = 0; k < 2; k++) { const a = (k - 0.5) * 0.7; B.add(new THREE.ConeGeometry(0.018, 0.16, 3, 1, true), { at: [p1[0] + Math.sin(psi) * 0.07, p1[1] + 0.02 + k * 0.03, p1[2] + Math.cos(psi) * 0.07 + (k - 0.5) * 0.04], rot: [-1.2, psi + a, 0], col: 0xe8cc98, flat: true }); } }
  // 樹幹上 2 公尺高處的另一截短斷枝（斷口淺色、沒有葉子）
  { const psi = psi0 + TAU * (kA + 1.5) / 5, d = rAt(2.0) * 0.8, p0 = [Math.sin(psi) * d, 2.0, Math.cos(psi) * d], p1 = [Math.sin(psi) * (d + 0.38), 2.06, Math.cos(psi) * (d + 0.38)]; stalk(B, p0, p1, 0.06, 0.042, [0x7a4a30, 0x9a6444], 4, { flat: true });
    B.add(new THREE.CircleGeometry(0.044, 4), { at: p1, rot: [Math.PI / 2 - 0.05, psi + Math.PI / 2, 0], col: 0xe8cc98, flat: true }); }
  // 掉在地上的斷枝＋針葉
  { const a = psi0 + TAU * (kA + 2.2) / 5, x = Math.sin(a) * 1.35, z = Math.cos(a) * 1.35, q = [x + Math.cos(a) * 0.55, 0.06, z - Math.sin(a) * 0.55], w = [x - Math.cos(a) * 0.55, 0.05, z + Math.sin(a) * 0.55]; stalk(B, w, q, 0.045, 0.03, [0x6a4026, 0x8a5a38], 4, { flat: true });
    B.add(cyl(0.0, 0.26, 0.55, 4, true), { at: [q[0], 0.0, q[2]], rot: [Math.PI / 2 - 0.05, Math.atan2(q[0] - w[0], q[2] - w[2]), 0], col: [0x2a6a3a, 0x00704e], flat: true, jit: 0.08 }); }
  // 樹根（五條粗根）、翻起的土、碎樹皮
  for (let i = 0; i < 5; i++) { const a = psi0 + TAU * i / 5 + R() * 0.5, l = 0.62 + R() * 0.25; stalk(B, [Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3], [Math.sin(a) * l, -0.03, Math.cos(a) * l], 0.12, 0.04, [0x7a4a30, 0x94603f], 4, { flat: true }); }
  for (let i = 0; i < 4; i++) { const a = psi0 + TAU * (kA + 0.5 + i * 0.5) / 5, d = 0.55 + R() * 0.3; B.add(octa(0.1 + R() * 0.05), { at: [Math.sin(a) * d, 0.02, Math.cos(a) * d], sc: [1, 0.45, 1], rot: [0, R() * 3, 0], col: SOIL, flat: true, jit: 0.1 }); }
  for (let i = 0; i < 5; i++) { const a = psi0 + TAU * (kA + 0.2 + i * 0.28) / 5, d = 0.5 + R() * 0.5; B.add(octa(0.05 + R() * 0.03), { at: [Math.sin(a) * d, 0.02, Math.cos(a) * d], sc: [1.5, 0.3, 0.8], rot: [0, R() * 3, 0], col: i % 2 ? 0xe2c48c : 0x8a5a3c, flat: true }); }
}
// 骨堆：一顆鹿或牛的頭骨、幾根肋骨、長骨、一截斷角，散在一圈壓平的草上
function bonePile(B, seed = 5) {
  const R = rng(seed); B.add(new THREE.CircleGeometry(0.75, 10), { at: [0, 0.01, 0], rot: [-Math.PI / 2, 0, 0], col: 0x6a6a3a });
  // 頭骨：圓頂、長吻、兩個眼窩
  B.add(ico(0.16, 1), { at: [0.1, 0.13, 0.05], sc: [1, 0.85, 1.15], round: true, col: BONE }); B.add(new THREE.CylinderGeometry(0.06, 0.1, 0.24, 7), { at: [0.1, 0.09, 0.26], rot: [Math.PI / 2 - 0.25, 0, 0], col: BONE });
  for (const s of [-1, 1]) { B.add(ico(0.045), { at: [0.1 + s * 0.08, 0.16, 0.15], round: true, col: 0x2a2018 }); stalk(B, [0.1 + s * 0.1, 0.24, 0.02], [0.1 + s * 0.28, 0.36, -0.08], 0.03, 0.01, BONE, 4); }
  B.add(ico(0.03), { at: [0.1, 0.06, 0.38], round: true, col: 0x2a2018 });
  // 肋骨：一排彎彎的細骨
  for (let i = 0; i < 5; i++) B.add(new THREE.TorusGeometry(0.22, 0.016, 3, 8, Math.PI * 0.8), { at: [-0.32 + i * 0.07, 0.02, -0.18], rot: [0.15, Math.PI / 2, 0], col: BONE });
  // 長骨與碎骨
  for (let i = 0; i < 4; i++) { const a = R() * TAU, d = 0.3 + R() * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d, l = 0.25 + R() * 0.2, b = R() * TAU; const p0 = [x - Math.cos(b) * l / 2, 0.03, z - Math.sin(b) * l / 2], p1 = [x + Math.cos(b) * l / 2, 0.03, z + Math.sin(b) * l / 2];
    stalk(B, p0, p1, 0.022, 0.022, BONE, 5); B.add(ico(0.035), { at: p0, round: true, col: BONE }); B.add(ico(0.035), { at: p1, round: true, col: BONE }); }
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 0.2 + R() * 0.5; B.add(octa(0.03 + R() * 0.02), { at: [Math.cos(a) * d, 0.02, Math.sin(a) * d], sc: [1.4, 0.6, 0.8], rot: [0, R() * 3, 0], col: BONE, flat: true }); }
}
// 委託板：兩根柱子、一塊木板、上面一個小屋頂（掛著一盞小燈）；三張卡的位置在 userData.cardSlots（板子正面、高度約 1.6）
function boardGeo(B) {
  for (const s of [-1, 1]) { stalk(B, [s * 0.95, 0, 0], [s * 0.95, 2.55, 0], 0.08, 0.07, WOOD, 6, { jit: 0.05 }); B.add(ico(0.1), { at: [s * 0.95, 0.02, 0], sc: [1.5, 0.4, 1.5], round: true, col: SOIL }); }
  B.add(new THREE.BoxGeometry(1.95, 1.2, 0.08), { at: [0, 1.65, 0.02], col: [0x7a5432, 0x9a7046], jit: 0.04 });
  for (let i = 0; i < 5; i++) B.add(new THREE.BoxGeometry(1.94, 0.006, 0.084), { at: [0, 1.1 + i * 0.24, 0.022], col: 0x4a3020 });      // 木板的接縫
  for (const [w, h, y] of [[2.05, 0.08, 2.27], [2.05, 0.08, 1.03]]) B.add(new THREE.BoxGeometry(w, h, 0.12), { at: [0, y, 0.03], col: WOOD });
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(1.25, 0.06, 0.6), { at: [s * 0.55, 2.62, 0.08], rot: [0, 0, s * -0.42], col: [0x6a2a1e, 0x9a3c26] });      // 小屋頂（紅瓦色）
  B.add(new THREE.BoxGeometry(0.1, 0.1, 0.6), { at: [0, 2.86, 0.08], col: 0x5a2418 });
  B.add(new THREE.BoxGeometry(1.5, 0.22, 0.04), { at: [0, 2.38, 0.11], col: [0xc9a56c, 0xe8d0a0] });      // 招牌底（字由介面或貼圖另外處理）
  stalk(B, [0.75, 2.5, 0.3], [0.75, 2.3, 0.3], 0.008, 0.008, IRON, 3); B.add(lathe([[0, 0], [0.07, 0.01], [0.08, 0.1], [0.05, 0.16], [0, 0.17]], 6), { at: [0.75, 2.12, 0.3], col: [0xffd27a, 0xfff0c0], glow: -1.2 });      // 小燈（夜裡亮）
}
const CARD_SLOTS = [[-0.6, 1.66, 0.075], [0, 1.7, 0.075], [0.6, 1.64, 0.075]];
function cardsGeo(B, n) { const tints = [0xf4ead0, 0xeee4c4, 0xf6eed8]; for (let i = 0; i < Math.min(3, n); i++) { const [x, y, z] = CARD_SLOTS[i], r = (i - 1) * 0.06;
    B.add(new THREE.PlaneGeometry(0.46, 0.62), { at: [x, y, z], rot: [0, 0, r], col: tints[i] }); for (let k = 0; k < 4; k++) B.add(new THREE.PlaneGeometry(0.3 - (k === 3 ? 0.12 : 0), 0.02), { at: [x - 0.02, y + 0.12 - k * 0.07, z + 0.003], rot: [0, 0, r], col: 0x6a5a48 });
    B.add(new THREE.CircleGeometry(0.045, 8), { at: [x, y - 0.18, z + 0.003], rot: [0, 0, r], col: [0xb02a20, 0xd84030][0] }); B.add(ico(0.025), { at: [x + Math.sin(-r) * 0.27, y + 0.27, z + 0.01], round: true, col: 0xb8b8c0 }); } }
// 繪圖桌：一張大木桌、桌上攤開一張羊皮紙地圖（畫在貼圖上）、墨水瓶與羽毛筆、尺、一盞油燈（要桌子、墨和光）
function drawTable(B) {
  B.add(new THREE.BoxGeometry(1.8, 0.09, 1.05), { at: [0, 0.92, 0], col: [0x6a4628, 0x8a6038], jit: 0.04 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stalk(B, [sx * 0.78, 0, sz * 0.42], [sx * 0.76, 0.88, sz * 0.4], 0.055, 0.05, WOOD, 6);
  for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(1.5, 0.05, 0.05), { at: [0, 0.25, sz * 0.41], col: WOOD });
  B.add(lathe([[0, 0], [0.06, 0], [0.065, 0.05], [0.035, 0.09], [0.035, 0.11], [0, 0.11]], 8), { at: [0.62, 0.965, -0.3], col: [0x1a2030, 0x3a4a6a] });      // 墨水瓶
  stalk(B, [0.62, 1.02, -0.3], [0.78, 1.32, -0.42], 0.008, 0.004, [0xe8e0d0, 0xffffff], 3); B.add(leafGeo(0.24, 0.035, 1.0, 0.05, 2, 0.05), { at: [0.66, 1.08, -0.33], rot: [0, -0.7, 0], col: [0xf0ece4, 0xffffff] });      // 羽毛筆
  B.add(new THREE.BoxGeometry(0.5, 0.012, 0.05), { at: [-0.1, 0.972, 0.38], rot: [0, 0.2, 0], col: [0xc9a56c, 0xe0c08a] });      // 尺
  B.add(lathe([[0, 0], [0.08, 0], [0.08, 0.03], [0.05, 0.05], [0.06, 0.16], [0.03, 0.2], [0, 0.21]], 8), { at: [-0.68, 0.965, -0.32], col: [0x5a4a30, 0x8a7448] }); B.add(ico(0.045), { at: [-0.68, 1.09, -0.32], sc: [1, 1.5, 1], round: true, col: 0xffc860, glow: -2.0 });      // 油燈
  B.add(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 6), { at: [-0.45, 0.99, -0.38], rot: [0, 0, Math.PI / 2], col: [0xd8c8a0, 0xf0e2c0] });      // 捲起來的空白地圖
  stalk(B, [-1.1, 0, 0.1], [-1.1, 0.45, 0.1], 0.18, 0.17, WOOD, 7); B.add(new THREE.CircleGeometry(0.18, 7), { at: [-1.1, 0.45, 0.1], rot: [-Math.PI / 2, 0, 0], col: 0xd8b27c });      // 旁邊的凳子
}
let signTex = null;
function signText(txt) { if (!signTex) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 76; const g = cv.getContext('2d'); g.fillStyle = '#d8b880'; g.fillRect(0, 0, 512, 76); g.strokeStyle = '#6a4424'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 66);
    g.fillStyle = '#4a2a14'; g.font = 'bold 50px "Noto Serif CJK TC", "Noto Sans CJK TC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, 40); signTex = new THREE.CanvasTexture(cv); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 4; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.22), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 })); m.position.set(0, 2.38, 0.132); m.name = 'sign'; return m; }
let mapTex = null;
function mapSheet() {      // 桌上的羊皮紙地圖：褐墨畫的海岸線、路（虛線）、三個地標、羅盤
  if (!mapTex) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 360; const g = cv.getContext('2d'); g.fillStyle = '#e8d6aa'; g.fillRect(0, 0, 512, 360); const gr = g.createRadialGradient(256, 180, 80, 256, 180, 320); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,80,30,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 360);
    g.strokeStyle = '#6a4424'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 300); g.bezierCurveTo(120, 240, 90, 160, 200, 140); g.bezierCurveTo(300, 120, 280, 60, 400, 50); g.stroke();
    g.fillStyle = 'rgba(70,110,140,0.35)'; g.beginPath(); g.ellipse(360, 230, 60, 38, 0.3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(60, 60); g.quadraticCurveTo(240, 200, 470, 300); g.stroke(); g.setLineDash([]);
    for (const [x, y] of [[150, 90], [300, 170], [430, 120]]) { g.beginPath(); g.moveTo(x - 10, y + 8); g.lineTo(x, y - 12); g.lineTo(x + 10, y + 8); g.closePath(); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(100 + i * 18, 250 + (i % 2) * 6); g.lineTo(108 + i * 18, 238); g.lineTo(116 + i * 18, 250 + (i % 2) * 6); g.stroke(); }
    g.lineWidth = 2; g.beginPath(); g.arc(450, 300, 28, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(450, 266); g.lineTo(456, 300); g.lineTo(450, 334); g.lineTo(444, 300); g.closePath(); g.fillStyle = '#6a4424'; g.fill();
    g.strokeStyle = '#b02a20'; g.lineWidth = 4; for (const [x, y] of [[220, 230], [330, 90]]) { g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8); g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8); g.stroke(); }      // 陷阱的 ✕
    mapTex = new THREE.CanvasTexture(cv); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 4; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.9 })); m.rotation.x = -Math.PI / 2; m.rotation.z = 0.08; m.position.set(0.02, 0.968, 0.02); m.receiveShadow = true; m.name = 'mapSheet'; return m;
}
// ---- 釣竿三階：握柄在原點、沿 +Y，竿尖在 userData.tip（掛線用）。竹竿（竹節）｜鰾膠竿（深色木、琥珀色膠纏、木捲線器）｜霜鋼竿（鋼藍竿身、白色纏線、鋼捲線器、一顆霜晶） ----
function rodGeo(B, tier) {
  const L = tier === 1 ? 2.5 : tier === 2 ? 2.6 : 2.75, segs = 6, r0 = tier === 3 ? 0.03 : 0.034, r1 = 0.009;
  const col = tier === 1 ? [0x9aa040, 0xd8d070] : tier === 2 ? [0x4a2c18, 0x7a4a28] : [0x3a5068, 0x9ab8d0];
  B.add(cyl(0.04, 0.045, 0.42, 8), { at: [0, -0.3, 0], col: tier === 1 ? [0x8a6a40, 0xb08a58] : tier === 2 ? [0x2a1a10, 0x4a3020] : [0x2a2c34, 0x4a4e58], jit: 0.05 });      // 握把
  B.add(ico(0.05), { at: [0, -0.32, 0], round: true, col: tier === 3 ? 0xd0d8e0 : 0x6a4a2a });
  for (let i = 0; i < segs; i++) { const t0 = i / segs, t1 = (i + 1) / segs; stalk(B, [0, 0.1 + t0 * L, 0], [0, 0.1 + t1 * L, 0], lerp(r0, r1, t0), lerp(r0, r1, t1), col, 6, { gy: [0.1, 0.1 + L] });
    const y = 0.1 + t1 * L, r = lerp(r0, r1, t1) * 1.35;
    if (tier === 1) B.add(new THREE.CylinderGeometry(r, r, 0.018, 6), { at: [0, y, 0], col: 0x7a7a28 });      // 竹節
    else { B.add(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.05, 6), { at: [0, y - 0.03, 0], col: tier === 2 ? [0xd88a20, 0xffc050] : [0xe8f2ff, 0xffffff] }); if (i < segs - 1) B.add(new THREE.TorusGeometry(0.018 - i * 0.002, 0.004, 3, 8), { at: [0, y, 0.025 - i * 0.002], rot: [0, 0, 0], col: tier === 2 ? 0xc0a070 : 0xd8e4f0 }); } }      // 膠纏／白纏線＋導線環
  if (tier === 1) { B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), { at: [0, -0.02, 0], col: [0xc8b090, 0xe8d8b8] }); for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(0.05, 0.006, 3, 10), { at: [0, -0.07 + i * 0.05, 0], rot: [Math.PI / 2, 0, 0], col: 0x8a4a2a }); }      // 竹竿：纏布
  else { const rc = tier === 2 ? [0x6a4a2a, 0xa07040] : [0x5a6878, 0xc8d8e8]; B.add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12), { at: [0.07, 0.12, 0], rot: [0, 0, Math.PI / 2], col: rc }); B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 10), { at: [0.07, 0.12, 0], rot: [0, 0, Math.PI / 2], col: tier === 2 ? 0xe8d8b8 : 0xf0f6ff }); stalk(B, [0.1, 0.12, 0], [0.13, 0.17, 0.05], 0.01, 0.01, rc, 4); B.add(ico(0.02), { at: [0.13, 0.17, 0.05], round: true, col: rc[0] }); stalk(B, [0.02, 0.12, 0], [0, 0.12, 0], 0.012, 0.012, rc, 4); }
  if (tier === 3) B.add(octa(0.04), { at: [0, 0.32, 0.03], sc: [0.7, 1.4, 0.7], col: [0x9ad8ff, 0xeaffff], glow: 0.8, flat: true });
  return [0, 0.1 + L, 0];
}
// ---- 浮標：上紅下白的圓浮標，上面一根細長的天線；原點在吃水線 ----
function bobberGeo(B) { B.add(ico(0.075, 2), { at: [0, 0.0, 0], round: true, col: [0xf4f0e8, 0xffffff], gy: [-0.08, 0.0] }); B.add(new THREE.SphereGeometry(0.0755, 16, 8, 0, TAU, 0, Math.PI / 2), { at: [0, 0.0, 0], col: [0xd8281e, 0xff4a30] });
  B.add(new THREE.TorusGeometry(0.074, 0.008, 4, 16), { at: [0, 0, 0], rot: [Math.PI / 2, 0, 0], col: 0x2a2020 }); stalk(B, [0, 0.07, 0], [0, 0.24, 0], 0.01, 0.007, [0xd8281e, 0xfff4b0], 4); B.add(ico(0.016), { at: [0, 0.245, 0], round: true, col: 0xfff060, glow: 0.4 }); stalk(B, [0, -0.07, 0], [0, -0.13, 0], 0.008, 0.006, [0x8a6a40, 0xa08050], 3); }
const STATIC = {
  rod_1: B => rodGeo(B, 1), rod_2: B => rodGeo(B, 2), rod_3: B => rodGeo(B, 3), bobber: bobberGeo,
  trap_jaw: B => trapJaw(B, false), trap_jaw_closed: B => trapJaw(B, true), trap_bell: (B, o) => tripBell(B, o.len || 5), trap_bell_cut: (B, o) => tripBellCut(B, o.len || 5), stake_red: (B, o) => redStake(B, o.lean || 0, !!o.fallen), stake_red_fallen: B => redStake(B, 0, true),
  claw_tree: (B, o) => clawTree(B, o.seed || 3), bone_pile: (B, o) => bonePile(B, o.seed || 5), board: boardGeo, draw_table: drawTable,
};
const NO_AO = { rod_1: 1, rod_2: 1, rod_3: 1, bobber: 1 };
function staticGeo(name, opt = {}) { const key = name + JSON.stringify(opt); let g = geoCache07.get(key); if (!g) { const B = new Builder(); const tip = STATIC[name](B, opt); g = B.build(NO_AO[name] ? 1 : 0.7); if (tip) g.userData.tip = tip; geoCache07.set(key, g); } return g; }
// 風吹布尾、夜裡亮燈：和 props06 一樣用 aPW（部位、擺動、自發光）。這裡只用擺動與自發光
const U7 = { uT: { value: 0 }, uNight: { value: 0 }, uMe: { value: new THREE.Vector3(0, 0, 0) } };
function propTick() { U7.uT.value = performance.now() / 1000; }
const swayMat = (() => { let m = null; return () => { if (m) return m; m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U7); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aPW; uniform float uT; uniform float uNight; uniform vec3 uMe; varying float vG;').replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
  { vec2 w = modelMatrix[3].xz;
  #ifdef USE_INSTANCING
  w = (modelMatrix * instanceMatrix)[3].xz;
  #endif
  float wd = sin(uT * 2.3 + w.x * 0.4 + w.y * 0.3) * 0.6 + sin(uT * 4.1 + w.x) * 0.3; transformed.x += aPW.y * wd * 0.5; transformed.z += aPW.y * wd * 0.3; vG = aPW.z >= 0.0 ? aPW.z : -aPW.z * (0.08 + 0.92 * uNight);
  if (aPW.x > 3.5 && aPW.x < 4.5) vG *= 0.4 + 0.6 * pow(max(0.0, sin(uT * 2.3 + w.x * 1.7 + w.y + position.x * 9.0)), 6.0);
  if (aPW.x > 3.5 && uMe.z > 0.0) vG *= 1.0 - smoothstep(uMe.z - 1.5, uMe.z, distance(w, uMe.xy)); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vG;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vG;'); };
  m.customProgramCacheKey = () => 'props07'; return m; }; })();
export function setNight07(n) { U7.uNight.value = clamp(n, 0, 1); }
// d8-art：鐵光只在角色附近亮（x、z＝角色位置，r＝這個距離以外不亮；traps07 每幀給）
export function setMe07(x, z, r) { U7.uMe.value.set(x, z, r); }
function makeStatic(name, opt = {}) {
  const g = staticGeo(name, opt), m = new THREE.Mesh(g, swayMat()); m.castShadow = name !== 'bobber'; m.receiveShadow = true; m.onBeforeRender = propTick; m.name = 'prop:' + name; m.userData.tris = g.userData.tris; if (name === 'trap_jaw' || name === 'trap_bell') m.userData.glint = true;      // 模型自己有一閃一閃的鐵光（部位 4）：traps07 不用再另外建一個 glint
  if (g.userData.tip) m.userData.tip = new THREE.Vector3(...g.userData.tip);
  if (name === 'board') { const grp = new THREE.Group(); grp.add(m); let cm = null; grp.userData.cardSlots = CARD_SLOTS.map(p => new THREE.Vector3(...p));
    grp.userData.setCards = n => { if (cm) { grp.remove(cm); } if (n > 0) { cm = new THREE.Mesh(staticGeoFn('cards' + n, B => cardsGeo(B, n)), swayMat()); cm.receiveShadow = true; cm.name = 'cards'; grp.add(cm); } else cm = null; };
    grp.userData.setCards(opt.cards ?? 3); grp.add(signText(opt.title || '委　託')); grp.name = 'prop:board'; return grp; }
  if (name === 'draw_table') { const grp = new THREE.Group(); grp.add(m, mapSheet()); grp.name = 'prop:draw_table'; return grp; }
  if (name === 'board') {}
  return m;
}
function staticGeoFn(key, fn) { let g = geoCache07.get(key); if (!g) { const B = new Builder(); fn(B); g = B.build(1); geoCache07.set(key, g); } return g; }
// 多處擺放：points [{ x, y, z, rot, s }]（y 要自己給地面高度）→ 一個 InstancedMesh（一次繪製＋一次陰影）。回傳 { mesh, setVisible(i, v), dispose() }
export function makeProp07Inst(name, points, opt = {}) {
  if (!STATIC[name]) return null; const g = staticGeo(name, opt), n = points.length, mesh = new THREE.InstancedMesh(g, swayMat(), n), d = new THREE.Object3D(), mats = [], zero = new THREE.Matrix4().makeScale(0, 0, 0);
  points.forEach((p, i) => { d.position.set(p.x, p.y || 0, p.z); d.rotation.set(0, p.rot ?? (Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1) * TAU, 0); d.scale.setScalar(p.s || 1); d.updateMatrix(); mats.push(d.matrix.clone()); mesh.setMatrixAt(i, d.matrix); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; mesh.onBeforeRender = propTick; mesh.name = 'props07:' + name;
  return { mesh, n, tris: g.userData.tris, setVisible(i, v) { mesh.setMatrixAt(i, v ? mats[i] : zero); mesh.instanceMatrix.needsUpdate = true; }, dispose() { if (mesh.parent) mesh.parent.remove(mesh); mesh.dispose(); } };
}

/* ============================== 水花與舉魚 ============================== */
// 水花：一圈往外擴的水紋＋一頂往上噴再落下的水珠（水珠是一個 InstancedMesh）。size：0.5 浮標點水、1 魚上鉤、1.6 拉上岸、2.5 主
// userData.update(秒) → 還在播回 true；播完回 false（呼叫的人負責拿掉）。全部共用兩個材質，播放時 2 次繪製
let spMat = null, spGeo = null, dropGeo = null;
function makeSplash(opt = {}) {
  const size = opt.size || 1, g = new THREE.Group(); g.name = 'prop:splash';
  if (!spMat) { spMat = new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.8, depthWrite: false }); spGeo = new THREE.RingGeometry(0.8, 1, 32); spGeo.rotateX(-Math.PI / 2); dropGeo = new THREE.IcosahedronGeometry(1, 1); }
  const mR = spMat.clone(), ring = new THREE.Mesh(spGeo, mR), ring2 = new THREE.Mesh(spGeo, mR); ring.position.y = ring2.position.y = 0.02; g.add(ring, ring2);
  const N = Math.round(10 + 8 * size), mD = spMat.clone(), drops = new THREE.InstancedMesh(dropGeo, mD, N), R = rng(Math.floor(size * 100 + 7)), D = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < N; i++) { const a = i / N * TAU + R() * 0.4, sp = (0.6 + R() * 0.8) * size, up = (1.6 + R() * 1.6) * Math.sqrt(size); D.push([Math.cos(a) * sp, up, Math.sin(a) * sp, (0.03 + R() * 0.035) * Math.sqrt(size)]); }
  drops.frustumCulled = false; g.add(drops); const dur = 0.75 + 0.25 * size;
  g.userData.update = t => { const k = clamp(t / dur, 0, 1);
    ring.scale.setScalar(0.15 * size + 0.9 * size * Math.sqrt(k)); ring2.scale.setScalar(0.05 * size + 0.55 * size * Math.sqrt(k)); mR.opacity = 0.75 * (1 - k);
    for (let i = 0; i < N; i++) { const d = D[i], tt = t * 1.0, y = d[1] * tt - 4.9 * tt * tt; pos.set(d[0] * tt * 0.8, Math.max(-0.05, y), d[2] * tt * 0.8); const s = y < 0 ? 0 : d[3] * (1 - k * 0.5); sc.set(s, s * 1.4, s); m4.compose(pos, q, sc); drops.setMatrixAt(i, m4); }
    drops.instanceMatrix.needsUpdate = true; mD.opacity = 0.9 * (1 - k * k); return k < 1; };
  g.userData.update(0); g.userData.dispose = () => { mR.dispose(); mD.dispose(); drops.dispose(); }; return g;
}
// 舉魚姿勢：釣上岸時角色把魚舉起來給大家看（約 2.4 秒）。兩隻手都抓著魚——
//   一般魚：「展示漁獲」。魚橫舉在頭的高度、偏右前方（從背後鏡頭看得到魚在頭的右邊、從正面看得到整條魚和臉），右手抓尾柄、左手托在魚肚下；小魚兩手靠近、大魚兩手張開
//   主：雙手舉過頭頂，兩手分開、各托在魚肚下的一點（像舉獎盃）
// 做法：魚掛在胸口骨頭（avatar.bones.chest）的底下，位置用「胸口座標」算；兩手的抓點也是胸口座標，寫進 avatar.grip，
// 由 actors.js 的 Avatar.update 在動作播完之後做兩節手臂 IK（所以不管 Fish.update 和 avatar.update 誰先跑都對）。每一幀：魚先擺一下（flap），
// 再用「彎曲之後」的尾柄與魚肚位置決定魚的擺法，抓點跟著魚走。結束時 dispose 一定要呼叫：關掉手臂覆蓋、把魚拿掉、武器放回
// 用法：const h = holdFish07(me.avatar, 'fish_carp'); 每幀 h.update(dt)，回 false 時 h.dispose()
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export function holdFish07(avatar, id, opt = {}) {
  const chest = avatar && avatar.bones && avatar.bones.chest; if (!chest || !avatar.gripT || !avatar.armDim || !MAKERS[id]) return null;
  const f = makeFish(id, opt), U = f.userData, boss = id.startsWith('fish_boss'), dur = opt.dur ?? (boss ? 3.0 : 2.4), pivot = new THREE.Group(), s0 = f.scale.x, ML = U.mlen, zT = U.zT, zH = U.zH;
  pivot.add(f); chest.add(pivot); let t = 0;
  const grip = avatar.grip = { l: { p: V3(0, 0, 0), back: V3(0, -1, 0) }, r: { p: V3(0, 0, 0), back: V3(0, 1, 0) }, lean: 0, head: 0 };
  // 手上原本的武器先藏起來，結束後放回
  const hid = []; for (const m of avatar.weap || []) if (m && m.visible) { m.visible = false; hid.push(m); }
  const Up = V3(0, 1, 0), hd = V3(), dz = V3(), bx = V3(), by = V3(), bz = V3(), pt = V3(), pb = V3(), qS = new THREE.Quaternion(), mB = new THREE.Matrix4(), A = V3(), B2 = V3();
  const place = (R, anchor, local) => { pivot.quaternion.setFromRotationMatrix(R); pivot.position.copy(anchor).sub(local.clone().applyQuaternion(pivot.quaternion)); };
  return { obj: pivot, fish: f, update(dt) {
    t += dt; const k = Math.max(0, 1 - t / dur), ease = Math.min(1, t / 0.22), gs = avatar.group.scale.x || 1;
    f.userData.flap(t, (boss ? 1 : 0.9) * (0.3 + 0.7 * k)); f.scale.setScalar(s0 / gs); const s = f.scale.x, sw = Math.sin(t * 9) * k;
    // 抓點在魚上的位置（模型座標）：尾柄、魚肚（胸鰭後面）、主：魚肚上相隔的兩點
    const zt = zT + 0.03, zb = zT + 0.7 * ML, zb1 = zT + 0.7 * ML, zb2 = zT + 0.3 * ML;
    if (!boss) {
      // 基底：頭朝角色左（+x）略往上，背朝上並微微翻向外面（讓鏡頭看到側面與一點背）。擺動：整條魚繞尾柄那隻手左右甩
      hd.set(1, 0.14 + 0.1 * sw, 0.1 + 0.2 * sw).normalize(); by.set(0, Math.cos(0.3), Math.sin(0.3)); by.addScaledVector(hd, -by.dot(hd)).normalize(); bx.crossVectors(by, hd);
      mB.makeBasis(bx, by, hd); const small = clamp(1 - (s * ML) / 0.9, 0, 1);
      A.set(-0.6 + 0.12 * small, 0.3, 0.55);      // 右手（尾柄）
      pivot.quaternion.setFromRotationMatrix(mB); const tp = U.point(zt, U.prof(zt)[3], pt).multiplyScalar(s); pivot.position.copy(A).sub(tp.applyQuaternion(pivot.quaternion));
      grip.r.p.copy(A); grip.r.back.set(0, 1, 0.1);
      const pr = U.prof(zb), bp = U.point(zb, pr[3] - pr[1] * (0.92 + 0.5 * small), pb).multiplyScalar(s).applyQuaternion(pivot.quaternion).add(pivot.position);      // 魚肚底下
      grip.l.p.copy(bp); grip.l.back.set(0.5, -0.8, 0.1); grip.lean = 0; grip.head = 0; grip.yaw = -0.75;
    } else {
      // 主：舉過頭頂。魚橫著（頭朝左），兩手在魚肚下相隔的兩點；魚的中心在頭頂上方
      hd.set(1, 0.08 + 0.1 * sw, 0.12 * sw).normalize(); by.set(0, 1, 0.12); by.addScaledVector(hd, -by.dot(hd)).normalize(); bx.crossVectors(by, hd); mB.makeBasis(bx, by, hd);
      pivot.quaternion.setFromRotationMatrix(mB);
      const g1 = U.point(zb1, U.prof(zb1)[3] - U.prof(zb1)[1] * 0.9, pt).multiplyScalar(s).applyQuaternion(pivot.quaternion), g2 = U.point(zb2, U.prof(zb2)[3] - U.prof(zb2)[1] * 0.9, pb).multiplyScalar(s).applyQuaternion(pivot.quaternion);
      // 兩個抓點的中點放在 (0, 高, 前) ；手的間距由魚大小決定，但不超過手臂撐得開的寬度
      B2.copy(g1).add(g2).multiplyScalar(0.5); pivot.position.set(0, 0.8 + 0.03 * k, 0.2).sub(B2);
      grip.l.p.copy(g1).add(pivot.position); grip.r.p.copy(g2).add(pivot.position); grip.l.back.set(0.7, -0.5, 0); grip.r.back.set(-0.7, -0.5, 0); grip.lean = -0.18; grip.head = -0.3;
    }
    pivot.scale.setScalar(0.35 + 0.65 * ease); return t < dur; },
    dispose() { if (avatar.grip === grip) avatar.grip = null; chest.remove(pivot); for (const m of hid) m.visible = true; } };
}

/* ============================== 對外介面 ============================== */
const MAKERS = {};
for (const id of [...FISH_IDS, ...FISH_BOSS_IDS]) MAKERS[id] = opt => makeFish(id, opt);
for (const id of Object.keys(STATIC)) MAKERS[id] = opt => makeStatic(id, opt);
MAKERS.splash = opt => makeSplash(opt);
export function makeProp07(name, opt = {}) { const f = MAKERS[name]; if (!f) return null; const o = f(opt); if (o && !o.name) o.name = 'prop:' + name; return o; }
export const has07 = name => !!MAKERS[name];
export const PROP07_NAMES = () => Object.keys(MAKERS);
