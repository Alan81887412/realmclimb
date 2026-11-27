/* 夜鉤猞（Meshy 48 骨骨架）動作控制：由 img3d/lab/py/build_rig.py 從實驗頁 lab.js 組出來，不要手改這個檔。
   測試版專用：網址帶 ?tiger=20 時，把猛虎換成夜鉤猞 Meshy 模型，走路／小跑／奔跑／待機／撲咬／揮掌／受擊／倒地都由這裡驅動。 */
import * as THREE from './three.bundle.js';
import { GLTFLoader, SkeletonUtils } from './three.bundle.js';
import { fixMeshyMaterials, setFlash, setFade } from './meshyfx.js';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t, D2R = Math.PI / 180, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function makeRig(model, OPT = {}) {
const stage = new THREE.Group(), root = new THREE.Group(), st = { t: 0 }; stage.add(root);      /* stage＝野獸腳下的座標（y=0 是地面）；以下說的「世界」都是 stage 座標 */
model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
model.scale.setScalar(1); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
{ const b = new THREE.Box3().setFromObject(model), s = b.getSize(V()); const k = 1.8 / s.z; model.scale.setScalar(k);
  model.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k); }
root.add(model); model.updateMatrixWorld(true);
const _sq = Q(), _m4 = new THREE.Matrix4(); let SQI = Q();
const syncStage = () => { stage.updateWorldMatrix(true, false); stage.getWorldQuaternion(_sq); SQI = _sq.clone().invert(); };
const GQ = (o, q) => { o.getWorldQuaternion(q); return q.premultiply(SQI); };
const wp = o => { const v = V(); o.getWorldPosition(v); return stage.worldToLocal(v); };
const toLocal = v => { root.updateMatrix(); return v.clone().applyMatrix4(_m4.copy(root.matrix).invert()); }, toWorld = v => { root.updateMatrix(); return v.clone().applyMatrix4(root.matrix); };
const S2B = (par, p) => par.worldToLocal(stage.localToWorld(p));      /* stage 座標 → 某根骨頭父層的座標 */
/* ---------- 慣性姿勢（所有招式共用）----------
   從這隻野獸在世界裡實際的移動算出來：急停→身體前傾下沉再彈回；起跑→後坐；轉彎→身體往彎內傾、頭先轉向彎內。
   只輸出「身體高度、俯仰、側傾、頭轉向」四個小修正，加在每個招式自己的姿勢上；腳的位置仍由各招式的 IK 決定，所以不會滑步。 */
const INR = { y: 0, pitch: 0, roll: 0, look: 0, k: 1, on: true, P: { w: 13, z: 0.42, gp: 60, gy: 0.3, maxP: 11, maxY: 0.06, kr: 1.9, maxR: 11, kl: 9, maxL: 20, tr: 7 },
  s: { on: false, first: true, p: new THREE.Vector3(), yaw: 0, vf: 0, P: 0, Pv: 0, Y: 0, Yv: 0, R: 0, L: 0 } };
const _ip = new THREE.Vector3(), _is = new THREE.Vector3(), _if = new THREE.Vector3();
function inertia(dt, k) { const s = INR.s, C = INR.P; stage.getWorldPosition(_ip); stage.getWorldScale(_is); const sW = _is.x || 1; _if.set(0, 0, 1).applyQuaternion(_sq); _if.y = 0; _if.normalize(); const yaw = Math.atan2(_if.x, _if.z);
  if (!INR.on || !s.on || dt <= 0 || _ip.distanceTo(s.p) > 1.5 * sW) { s.on = true; s.first = true; s.p.copy(_ip); s.yaw = yaw; s.P = s.Pv = s.Y = s.Yv = s.R = s.L = 0; INR.y = INR.pitch = INR.roll = INR.look = 0; return; }
  const vf = ((_ip.x - s.p.x) * _if.x + (_ip.z - s.p.z) * _if.z) / dt / sW; s.p.copy(_ip); let dy = yaw - s.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; s.yaw = yaw; const wy = dy / dt;
  if (s.first) { s.vf = vf; s.first = false; } const dv = Math.max(-5, Math.min(5, vf - s.vf)); s.vf = vf;
  s.Pv += dv * C.gp; s.Yv -= Math.abs(dv) * C.gy;                    /* 速度突然改變＝一次衝擊 */
  const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n; for (let i = 0; i < n; i++) { s.Pv += (-C.w * C.w * s.P - 2 * C.z * C.w * s.Pv) * h; s.P += s.Pv * h; s.Yv += (-C.w * C.w * s.Y - 2 * C.z * C.w * s.Yv) * h; s.Y += s.Yv * h; }
  const e = 1 - Math.exp(-dt * C.tr), cl = (x, m) => Math.max(-m, Math.min(m, x)); s.R += (cl(vf * wy * C.kr, C.maxR) - s.R) * e; s.L += (cl(wy * C.kl, C.maxL) - s.L) * e;
  INR.k = k; INR.pitch = cl(s.P, C.maxP) * k; INR.y = cl(s.Y, C.maxY) * k; INR.roll = -s.R * k;      /* 往彎內傾 */ INR.look = s.L * k; }
syncStage();
/* ---------- 骨頭對照（通用）：不靠骨頭名字，照骨架的上下層關係找出每個部位，任何 Meshy 四足骨架都適用 ---------- */
const B = n => n ? (model.getObjectByName(n) || model.getObjectByName(n.replace(/[.]/g, ''))) : null;
const RB = (() => { const all = []; model.traverse(o => { if (o.isBone) all.push(o); }); root.updateMatrixWorld(true);
  const nm = o => o.name.toLowerCase(), kids = o => o.children.filter(c => c.isBone), find = re => all.find(o => re.test(nm(o)));
  const chain = (b, n) => { const c = [b]; while (c.length < n) { const k = kids(c[c.length - 1]); if (!k.length) break; c.push(k[0]); } return c; };
  const path = (a, z) => { const p = []; for (let o = z; o && o !== a; o = o.parent) p.unshift(o); return p; };
  const X = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return model.worldToLocal(v).x; };
  const hips = find(/^hips/) || all[1], rtB = hips.parent && hips.parent.isBone ? hips.parent : null, head = find(/^head$/) || find(/^head/), clav = all.filter(o => /^clavicle/.test(nm(o)));
  const chest = clav.length ? clav[0].parent : find(/^chest/);
  const sp = path(hips, chest), nk = path(chest, head).slice(0, -1), tl = kids(hips).find(o => /tail/.test(nm(o))), rear = kids(hips).filter(o => /^rear/.test(nm(o)));
  const side = arr => { const s = arr.slice().sort((a, b) => X(b) - X(a)); return [s[0], s[s.length - 1]]; };
  const [cL, cR] = side(clav), [rL, rR] = side(rear), ears = head ? kids(head).filter(o => /^ear/.test(nm(o))) : [], [eL, eR] = ears.length >= 2 ? side(ears) : [null, null];
  const tailC = tl ? chain(tl, 99) : []; const N = o => o ? o.name : null;
  return { hips: N(hips), root: N(rtB), chest: N(chest), head: N(head), spine: N(sp[0]), spine3: N(sp.length > 1 ? sp[sp.length - 2] : sp[0]), neck: N(nk[0]), neck2: N(nk[1] || nk[0]),
    jaw: N(head && kids(head).find(o => /^jaw/.test(nm(o)))), earL: N(eL), earR: N(eR), tail: tailC.slice(0, Math.max(1, tailC.length - 1)).map(N),
    LF: chain(cL, 5).map(N), RF: chain(cR, 5).map(N), LH: chain(rL, 5).map(N), RH: chain(rR, 5).map(N) }; })();
/* 改造（選用）：不重新生成模型，直接改骨頭比例。tailLen＝尾巴長度倍率、earTuft＝耳朵上半（含耳簇）放大倍率、paw＝前掌放大倍率 */
if (OPT.morph) { const M = OPT.morph, ax = b => { const c = b.children.find(o => o.isBone); if (!c) return 'y'; const d = c.position; return Math.abs(d.x) > Math.abs(d.y) ? (Math.abs(d.x) > Math.abs(d.z) ? 'x' : 'z') : (Math.abs(d.y) > Math.abs(d.z) ? 'y' : 'z'); };
  if (M.tailLen && RB.tail.length) { const b = B(RB.tail[0]); b.scale[ax(b)] *= M.tailLen; }
  if (M.earTuft) for (const n of [RB.earL, RB.earR]) { const b = n && B(n), c = b && b.children.find(o => o.isBone); if (c) c.scale.multiplyScalar(M.earTuft); }
  if (M.paw) for (const n of [RB.LF[3], RB.RF[3]]) { const b = B(n); if (b) b.scale.multiplyScalar(M.paw); }
  root.updateMatrixWorld(true); }
/* 體型基準：把模型縮放到「肩關節與髖關節的平均高度＝HREF」。之後所有動作的公尺數都等於「相對腿長的比例」，換生物不用改數字（尾巴長短、鬃毛大小不影響）。 */
const HREF = 0.7435; { const hs = [RB.LF[0], RB.RF[0], RB.LH[0], RB.RH[0]].map(n => wp(B(n)).y), H = (hs[0] + hs[1] + hs[2] + hs[3]) / 4, f = HREF / H; model.scale.multiplyScalar(f); model.position.multiplyScalar(f); root.updateMatrixWorld(true); }
const SIZE = (() => { const b = new THREE.Box3().setFromObject(model), a = stage.worldToLocal(b.min.clone()), c = stage.worldToLocal(b.max.clone()); return { len: Math.abs(c.z - a.z), h: Math.abs(c.y - a.y) }; })();
const bones = []; model.traverse(o => { if (o.isBone) bones.push(o); });
const rest = new Map(bones.map(b => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
const resetPose = () => { for (const [b, r] of rest) { b.quaternion.copy(r.q); b.position.copy(r.p); } root.updateMatrixWorld(true); };
// ---------- IK 工具 ----------
function aim(bone, child, target, w = 1) {
  const s = wp(bone), e = wp(child); const cd = e.sub(s).normalize(), td = target.clone().sub(s);
  if (td.lengthSq() < 1e-10) return; td.normalize(); const d = Q().setFromUnitVectors(cd, td); if (w < 1) d.slerp(Q(), 1 - w);
  const wq = Q(); GQ(bone, wq); wq.premultiply(d); const pq = Q(); GQ(bone.parent, pq); bone.quaternion.copy(pq.invert().multiply(wq)); bone.updateMatrixWorld(true);
}
function rotW(bone, axis, ang) { if (!ang) return; const q = Q().setFromAxisAngle(axis, ang), wq = Q(); GQ(bone, wq); wq.premultiply(q); const pq = Q(); GQ(bone.parent, pq); bone.quaternion.copy(pq.invert().multiply(wq)); bone.updateMatrixWorld(true); }
let SOFT = false, SCAP = 0;
function twoBone(r, e, l1, l2, pole) {
  const dl = e.clone().sub(r); let d = dl.length(); const dir = dl.normalize(); const Lm = l1 + l2, ds = 0.965 * Lm;
  if (SOFT && d > ds) d = ds + (Lm - ds) * (1 - Math.exp(-(d - ds) / (Lm - ds)));
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), Lm - 1e-4);
  const x = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)); const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 1, 0); p.normalize(); return r.clone().addScaledVector(dir, x).addScaledVector(p, h);
}
const axes = () => { const q = root.quaternion.clone(); return { fwd: V(0, 0, 1).applyQuaternion(q), right: V(1, 0, 0).applyQuaternion(q).negate(), up: V(0, 1, 0) }; };
// 腿：s 肩／髖、e 肘／膝、w 腕／飛節、h 腳跟（腳掌根）、t 腳尖
const LEGS = [
  { id: 'LF', kind: 'F', side: 1, n: RB.LF },
  { id: 'RF', kind: 'F', side: -1, n: RB.RF },
  { id: 'LH', kind: 'H', side: 1, n: RB.LH },
  { id: 'RH', kind: 'H', side: -1, n: RB.RH }];
for (const L of LEGS) {
  [L.s, L.e, L.w, L.h, L.t] = L.n.map(B);
  const P = [L.s, L.e, L.w, L.h, L.t].map(b => toLocal(wp(b)));
  L.l1 = P[0].distanceTo(P[1]); L.l2 = P[1].distanceTo(P[2]); L.l3 = P[2].distanceTo(P[3]); L.l4 = P[3].distanceTo(P[4]);
  L.heel0 = P[3]; L.toe0 = P[4]; L.meta0 = P[2].clone().sub(P[3]);   // 腳跟往上到腕／飛節的向量（綁定姿勢）
  L.anchor = V(P[3].x, 0, P[3].z);
}
const HY = Math.max(0.01, LEGS.reduce((s, L) => s + L.heel0.y, 0) / 4);
// 腳的解算：heelW＝腳跟目標（世界），pitch＝腳掌俯仰（0＝平貼地面，負＝腳尖朝下），slant＝腕／飛節往前後傾的角度
function solveLeg(L, heelW, pitch = 0, slant = 0, w = 1) {
  const { fwd, right } = axes();
  const meta = L.meta0.clone().applyQuaternion(root.quaternion).applyAxisAngle(right, slant);
  const wT = heelW.clone().add(meta);
  const pole = (L.kind === 'F' ? fwd.clone().negate() : fwd.clone()).addScaledVector(right, -L.side * 0.12);
  if (L.kind === 'F' && SCAP) { const sw = wp(L.s), rel = wT.clone().sub(sw).dot(fwd); const sl = Math.max(-SCAP, Math.min(SCAP, 0.4 * rel));
    const np = sw.addScaledVector(fwd, sl).addScaledVector(V(0, 1, 0), -0.25 * Math.abs(sl)); L.s.position.copy(S2B(L.s.parent, np)); L.s.updateMatrixWorld(true); }
  L.dbg = { r: +(wp(L.s).distanceTo(wT) / (L.l1 + L.l2)).toFixed(3), sl: +(slant / D2R).toFixed(1), pi: +(pitch / D2R).toFixed(1) };
  const eT = twoBone(wp(L.s), wT, L.l1, L.l2, pole);
  aim(L.s, L.e, eT, w); aim(L.e, L.w, wT, w); aim(L.w, L.h, heelW, w);
  const td = fwd.clone().applyAxisAngle(right, pitch); aim(L.h, L.t, wp(L.h).addScaledVector(td, L.l4), w);
}
// 尾巴：逐節延遲的擺動＋下垂
const TAIL = RB.tail.map(B).filter(Boolean);
const tailSpring = { yaw: TAIL.map(() => 0), v: TAIL.map(() => 0) };
function tail(sway, droop, dt, bodyYawRate = 0) {
  const { up, right } = axes();
  TAIL.forEach((b, i) => { const k = i / TAIL.length;
    const tgt = sway(i) - bodyYawRate * 0.25 * (1 + k); const s = tailSpring; const acc = (tgt - s.yaw[i]) * 90 - s.v[i] * 14; s.v[i] += acc * dt; s.yaw[i] += s.v[i] * dt;
    rotW(b, right, droop * (0.5 + 0.5 * k)); rotW(b, up, s.yaw[i]); });
}
const HEAD = { neck: B(RB.neck), neck2: B(RB.neck2), head: B(RB.head), jaw: B(RB.jaw), earL: B(RB.earL), earR: B(RB.earR), hips: B(RB.hips), spine: B(RB.spine), spine3: B(RB.spine3), chest: B(RB.chest), rootB: B(RB.root) };
const modes = {};
const GAITS = {
  walk: { T: 1.15, duty: 0.70, off: { LH: 0.0, LF: 0.25, RH: 0.5, RF: 0.75 }, S: 0.85, crouch: 0.035, scap: 0.06, liftF: 0.15, liftH: 0.12, bob: 0.025, pitchA: 1.2, roll: 2.0, yaw: 2.5, flex: 0, headK: 0.7 },
  trot: { T: 0.66, duty: 0.46, off: { LF: 0.0, RH: 0.0, RF: 0.5, LH: 0.5 }, S: 1.15, crouch: 0.04, scap: 0.07, liftF: 0.2, liftH: 0.16, bob: 0.045, pitchA: 1.5, roll: 1.5, yaw: 1.5, flex: 0, headK: 0.8 },
  gallop: { T: 0.50, duty: 0.32, off: { LH: 0.0, RH: 0.08, LF: 0.42, RF: 0.52 }, S: 1.85, crouch: 0.06, scap: 0.08, liftF: 0.3, liftH: 0.22, bob: 0.10, pitchA: 6, roll: 1, yaw: 1, flex: 9, headK: 0.85 } };
// 一隻腳在步態循環 p（0~1）的計畫：著地期往後推、最後 28% 腳跟先離地（腳尖撐著），擺盪期收腳往前；所有量前後連續
function footPlan(L, p, G, Sx) { const F = L.kind === 'F', c = L.cz || 0, s0 = (F ? 6 : 5) * D2R, s1 = (F ? -18 : -24) * D2R, P = (F ? 34 : 22) * D2R;
  let dz, y, pitch, slant;
  if (p < G.duty) { const u = p / G.duty, pk = sm(0.72, 1, u), a = P * pk;
    dz = c + Sx * (0.5 - u) + L.l4 * (1 - Math.cos(a)); y = HY + L.l4 * Math.sin(a); pitch = -a; slant = lerp(s0, s1, u); }
  else { const u = (p - G.duty) / (1 - G.duty), e = u * u * (3 - 2 * u), lf = F ? G.liftF : G.liftH, k = 1 - sm(0, 0.45, u);
    // 擺盪期前後位置用 Hermite 曲線：起點與終點的速度都接上著地期（腳先順勢往後再甩到前面），不會有急轉
    const m = -(1 - G.duty) / G.duty, u2 = u * u, u3 = u2 * u, H = (2 * u3 - 3 * u2 + 1) * -0.5 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * 0.5 + (u3 - u2) * m;
    dz = c + Sx * H + L.l4 * (1 - Math.cos(P)) * (1 - e); y = HY + lf * Math.sin(Math.PI * Math.pow(u, F ? 0.9 : 0.8)) ** 2 + L.l4 * Math.sin(P) * k;
    const b2 = Math.sin(Math.PI * u) ** 2; pitch = -P * (1 - e) - (F ? 38 : 22) * D2R * b2; slant = lerp(s1, s0, e) + (F ? -30 : 55) * D2R * b2; }
  return { dz, y, pitch, slant }; }
// 依夜鉤猞的腿長，算出每隻腳伸得到的範圍，決定步幅與每隻腳的落點中心（腿不會被拉到打直）
function fitStride(G) { resetPose(); root.position.y = -G.crouch; root.updateMatrixWorld(true); const { fwd, right } = axes(); const out = {};
  for (const L of LEGS) { const sp = toLocal(wp(L.s)); const ok = [];
    for (let dz = -0.7; dz <= 0.7001; dz += 0.01) { const sl = lerp(L.kind === 'F' ? -18 : -24, L.kind === 'F' ? 6 : 5, (dz + 0.7) / 1.4) * D2R;
      const heel = V(L.anchor.x, HY + G.crouch, L.anchor.z + dz), meta = L.meta0.clone().applyAxisAngle(V(-1, 0, 0), sl), w = heel.add(meta);
      let s = sp.clone(); if (L.kind === 'F' && SCAP) s.z += Math.max(-SCAP, Math.min(SCAP, 0.4 * (w.z - sp.z)));
      if (s.distanceTo(w) <= 0.95 * (L.l1 + L.l2)) ok.push(dz); }
    out[L.id] = ok.length ? [ok[0], ok[ok.length - 1]] : [0, 0]; }
  resetPose(); root.position.y = 0; return out; }
const curve = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], e)) : lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
function poseBody({ y = 0, pitch = 0, roll = 0, yaw = 0, chest = 0, neckP = 0, neckY = 0, jaw = 0, ears = 0 }) {
  const { fwd, right, up } = axes(); root.position.y = y + INR.y; root.updateMatrixWorld(true);
  rotW(HEAD.hips, right, (pitch + INR.pitch) * D2R); rotW(HEAD.hips, fwd, (roll + INR.roll) * D2R); rotW(HEAD.hips, up, yaw * D2R); rotW(HEAD.chest, right, chest * D2R);
  rotW(HEAD.neck, right, neckP * D2R); rotW(HEAD.neck, up, (neckY + INR.look) * D2R); if (HEAD.jaw) rotW(HEAD.jaw, right, -jaw * D2R);
  if (HEAD.earL) { rotW(HEAD.earL, fwd, ears * D2R); rotW(HEAD.earR, fwd, -ears * D2R); }
}
// 腳：planted＝固定在世界座標（第一次著地時記下），否則跟身體走
function footC(L, st0, { off = [0, 0, 0], planted = true, pitch = 0, slant = 0 }) {
  if (planted) { if (!st0.pin[L.id]) st0.pin[L.id] = toWorld(V(L.anchor.x + off[0], HY, L.anchor.z + off[2])); const p = st0.pin[L.id].clone(); p.y = HY + off[1]; solveLeg(L, p, pitch, slant); }
  else { st0.pin[L.id] = null; solveLeg(L, toWorld(V(L.anchor.x + off[0], HY + off[1], L.anchor.z + off[2])), pitch, slant); }
}
modes.Cidle = { init() { this.pin = {}; },
  step(dt) { const t = st.t; resetPose(); root.updateMatrixWorld(true);
    const look = curve([[0, 0], [1.2, 0], [2.0, 22], [3.4, 22], [4.2, -18], [5.6, -18], [6.4, 0], [9, 0]], t % 8);
    const lookP = curve([[0, 0], [2.0, -4], [4.2, 3], [6.4, 0], [8, 0]], t % 8);
    const breath = Math.sin(t * 2 * Math.PI / 3.2);
    poseBody({ y: -0.01 + 0.006 * breath, chest: 1.2 * breath, neckY: look, neckP: lookP, ears: (t % 8 > 4.6 && t % 8 < 4.9) ? 18 : 0 });
    for (const L of LEGS) footC(L, this, {});
    tail(i => Math.sin(t * 1.3 - i * 0.6) * 0.18, 0.15, dt);
  } };
// ================= 第三版招式（和 ChatGPT 討論後）：腳掌走弧線軌跡＋IK、身體動力鏈錯開、出招急加速、命中停頓、彈簧餘韻 =================
const EASE = { s: u => u * u * (3 - 2 * u), i: u => u * u * u, q: u => u * u, o: u => 1 - (1 - u) ** 3, l: u => u };
const kf = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1, ez] = keys[i], e = EASE[ez || 's']((t - t0) / (t1 - t0));
  return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], e)) : lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
const crom = (P, sidx) => { const n = P.length - 1, i = Math.min(n - 1, Math.max(0, Math.floor(sidx))), u = Math.min(1, Math.max(0, sidx - i)); const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)], u2 = u * u, u3 = u2 * u;
  const f = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3); return V(f('x'), f('y'), f('z')); };
class Spr { constructor(k, c) { this.k = k; this.c = c; this.on = false; this.x = 0; this.v = 0; } reset() { this.on = false; }
  step(target, dt) { if (!this.on) { this.x = target; this.v = 0; this.on = true; return this.x; } const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; } return this.x; } }
const hitStop = (t, th, hs) => t < th ? t : t < th + hs ? th : t - hs;
// 前腳（整條）IK：目標是掌根的世界位置。droop＝垂腕角（度，正＝掌骨比前臂更往下垂）、paw＝腳掌相對掌骨的角度（90＝平貼地面）
function solveArm(L, pawW, { droop = 0, paw = 90, out = 0.3, upP = 0 } = {}) {
  const { fwd, right, up } = axes(), side = right.clone().multiplyScalar(-L.side);
  if (SCAP) { const sw0 = wp(L.s), rel = pawW.clone().sub(sw0), sl = Math.max(-SCAP, Math.min(SCAP, 0.3 * rel.dot(fwd))), so = Math.max(-0.03, Math.min(0.03, 0.2 * rel.dot(side)));
    L.s.position.copy(S2B(L.s.parent, sw0.addScaledVector(fwd, sl).addScaledVector(side, so))); L.s.updateMatrixWorld(true); }
  const sw = wp(L.s), n = pawW.clone().sub(sw).normalize(), m = n.clone().applyAxisAngle(right, -droop * D2R), wT = pawW.clone().addScaledVector(m, -L.l3);
  const pole = fwd.clone().negate().addScaledVector(side, out).addScaledVector(up, upP);
  const eT = twoBone(sw, wT, L.l1, L.l2, pole); aim(L.s, L.e, eT); aim(L.e, L.w, wT); aim(L.w, L.h, pawW);
  const hw = wp(L.h), md = hw.clone().sub(wp(L.w)).normalize(), td = md.applyAxisAngle(right, paw * D2R); aim(L.h, L.t, hw.addScaledVector(td, L.l4));
}
const LF = LEGS.find(L => L.id === 'LF'), RF = LEGS.find(L => L.id === 'RF');

// ---- 撲咬 ----
modes.Dpounce = { init() { SOFT = true; SCAP = 0.045; this.T = 2.0; this.D = 1.75; this.sp = { neck: new Spr(320, 20), chest: new Spr(380, 26), tail: new Spr(120, 12), ear: new Spr(600, 13) }; this.pin = {};
    this.zk = [[0, 0], [0.30, -0.10, 's'], [0.42, 0, 'q'], [1.2, 0, 's']]; this.G = {}; },
  step(dt) { const tr = this.tIn; if (this.fresh || !this.G.LF) { this.fresh = false; this.pin = {}; root.position.set(0, 0, 0); this.base = 0; resetPose(); root.updateMatrixWorld(true); root.updateMatrixWorld(true);
      for (const L of [LF, RF]) { const g = toWorld(V(L.anchor.x, 0, L.anchor.z)); g.y = HY; this.G[L.id] = g; } for (const k in this.sp) this.sp[k].reset(); }
    const t = tr, D = 0; resetPose();
    const z = kf(this.zk, t); let y;
    if (t < 0.42) y = kf([[0, 0], [0.30, -0.17, 's'], [0.42, 0.10, 'q']], t); else if (t < 0.66) { const u = (t - 0.42) / 0.24; y = (0.10 + 0.96 * u - 1.12 * u * u) * (this.yk || 1); } else y = kf([[0.66, -0.06], [0.72, -0.11, 'o'], [1.1, 0, 's']], t);
    root.position.z = this.base + z;
    const pitch = kf([[0, 0], [0.30, -6, 's'], [0.42, 15, 'q'], [0.54, 5, 'l'], [0.66, -7, 'l'], [0.72, -10, 'o'], [1.1, 0, 's']], t - 0.02);
    const chest = this.sp.chest.step(kf([[0, 0], [0.30, -7, 's'], [0.50, 9, 'q'], [0.66, 2, 's'], [0.72, -5, 'o'], [1.1, 0, 's']], t - 0.03), dt);
    const neckP = this.sp.neck.step(kf([[0, 0], [0.30, 17, 's'], [0.44, 4, 'q'], [0.60, 12, 's'], [0.66, 0, 'q'], [0.70, -17, 'o'], [0.88, -6, 's'], [1.15, 0, 's']], t - 0.05), dt);
    const jaw = kf([[0, 0], [0.28, 0], [0.42, 6, 's'], [0.60, 34, 's'], [0.665, 34], [0.70, 2, 'i'], [0.9, 9, 's'], [1.25, 0, 's']], t);
    poseBody({ y, pitch, chest, neckP, jaw, ears: this.sp.ear.step(kf([[0, 0], [0.2, -28, 's'], [0.42, -34, 'q'], [0.66, -20, 's'], [0.70, -36, 'o'], [0.9, -24, 's'], [1.3, 0, 's']], t - 0.08), dt), yaw: t < 0.31 ? Math.sin(st.t * 26) * 1.8 * sm(0.06, 0.24, t) : 0 });
    if (tr > 0.67 && tr < 0.74) { root.position.y += Math.sin(tr * 190) * 0.006; root.updateMatrixWorld(true); }
    // 後腳：蹬到最後才離地 → 往後拖 → 往前收 → 落在最終站位
    const tl = 0.40, tdn = 0.78, zl = kf(this.zk, tl), zd = kf(this.zk, tdn), hAir = t > tl && t < tdn;
    const hOff = hAir ? kf([[tl, [0, 0, -zl]], [0.52, [0, 0.20, -0.46], 's'], [0.66, [0, 0.16, -0.05], 's'], [tdn, [0, 0, D - zd], 'q']], t) : [0, 0, t >= tdn ? D - z : 0];
    for (const L of LEGS) if (L.kind === 'H') footC(L, this, { off: hOff, planted: !hAir, pitch: hAir ? -0.5 * Math.sin(Math.PI * (t - tl) / (tdn - tl)) : 0, slant: hAir ? kf([[tl, -0.25], [0.52, -0.9, 's'], [tdn, 0.1, 's']], t) : 0 });
    // 前腳：先收到胸前、再往前伸、掌張開，落地後肘自然吸震（左腳稍微領先，不要完全對稱）
    const { fwd, right, up } = axes();
    for (const L of [LF, RF]) { const lag = L.side > 0 ? 0 : 0.03, a0 = 0.35 + lag, a1 = 0.66 + lag * 0.4, G0 = this.G[L.id], G1 = G0.clone().addScaledVector(fwd, D);
      if (t <= a0) solveArm(L, G0, { out: 0.45 });
      else if (t >= a1) solveArm(L, G1, { out: 0.45 });
      else { const a = (t - a0) / (a1 - a0), S = wp(L.s), side = right.clone().multiplyScalar(-L.side);
        const tuck = S.clone().addScaledVector(fwd, 0.06).addScaledVector(up, -0.40).addScaledVector(side, 0.02), reach = S.clone().addScaledVector(fwd, 0.46).addScaledVector(up, -0.20).addScaledVector(side, 0.05);
        const P = crom([G0, tuck, reach, G1], kf([[0, 0], [0.26, 1, 'o'], [0.70, 2, 's'], [1, 3, 'q']], a));
        solveArm(L, P, { droop: kf([[0, 0], [0.26, 38, 'o'], [0.70, -8, 's'], [1, 0, 'q']], a), paw: kf([[0, 90], [0.26, 55, 'o'], [0.70, 30, 's'], [1, 90, 'q']], a), out: 0.35 }); } }
    const td = this.sp.tail.step(kf([[0, 0.15], [0.30, 0.45, 's'], [0.5, -0.18, 'q'], [0.70, -0.05], [0.8, 0.25, 'o'], [1.3, 0.15, 's']], t - 0.08), dt);
    tail(i => (t < 0.32 ? Math.sin(st.t * 26) * 0.07 * sm(0.05, 0.25, t) : 0) * (1 + i * 0.3), td, dt);
  } };

// ---- 揮掌（左前腳，靠鏡頭那隻） ----
modes.Dswipe = { init() { SOFT = true; SCAP = 0.045; this.T = 1.7; this.sp = { neck: new Spr(320, 20), yaw: new Spr(420, 24), roll: new Spr(380, 24), tail: new Spr(110, 11), ear: new Spr(600, 13) }; this.pin = {}; this.G = null; },
  step(dt) { const tr = this.tIn; if (this.fresh || !this.G) { this.fresh = false; this.pin = {}; this.pinR = null; root.position.set(0, 0, 0); this.base = 0; resetPose(); root.updateMatrixWorld(true); root.updateMatrixWorld(true);
      const g = toWorld(V(LF.anchor.x, 0, LF.anchor.z)); g.y = HY; this.G = g; for (const k in this.sp) this.sp[k].reset(); }
    const TH = 0.36, t = tr; resetPose();
    // 身體：後腳、骨盆先動，胸、頭依序跟上；蓄力往反方向擰，出招急轉
    root.position.x = kf([[0, 0], [0.22, -0.045, 's'], [TH, 0.03, 'q'], [0.55, 0.02, 'o'], [1.0, 0, 's']], t);
    root.position.z = this.base + kf([[0, 0], [0.22, -0.07, 's'], [TH, 0.10, 'q'], [0.50, 0.13, 'o'], [1.05, 0, 's']], t);
    const y = kf([[0, 0], [0.22, -0.06, 's'], [0.29, -0.01, 's'], [TH, -0.07, 'q'], [0.42, -0.10, 'o'], [1.05, 0, 's']], t);
    const yawK = [[0, 0], [0.22, 17, 's'], [TH, -15, 'q'], [0.46, -19, 'o'], [1.05, 0, 's']], rollK = [[0, 0], [0.22, 6, 's'], [TH, -8, 'q'], [0.46, -10, 'o'], [1.05, 0, 's']];
    const cy = this.sp.yaw.step(kf(yawK, t - 0.02), dt), hy = kf(yawK, t + 0.03) * 0.35, cr = this.sp.roll.step(kf(rollK, t - 0.02), dt);
    const neckP = this.sp.neck.step(kf([[0, 0], [0.22, 8, 's'], [TH, -9, 'q'], [0.6, -3, 's'], [1.05, 0, 's']], t - 0.05), dt);
    poseBody({ y, pitch: kf([[0, 0], [0.22, 5, 's'], [TH, -6, 'q'], [0.46, -8, 'o'], [1.05, 0, 's']], t), yaw: hy, roll: cr * 0.35, neckP, neckY: -(cy * 0.75 + hy),
      jaw: kf([[0, 0], [0.15, 16, 's'], [0.7, 16], [1.05, 0, 's']], t), ears: this.sp.ear.step(kf([[0, 0], [0.15, -28, 's'], [TH, -36, 'q'], [0.42, -18, 'o'], [0.8, -26, 's'], [1.1, 0, 's']], t - 0.06), dt) });
    if (tr > TH && tr < TH + 0.05) { root.position.x += Math.sin(tr * 200) * 0.006; root.updateMatrixWorld(true); }
    const { fwd, right, up } = axes(); rotW(HEAD.chest, up, cy * D2R); rotW(HEAD.chest, fwd, cr * 0.65 * D2R); rotW(HEAD.neck, fwd, kf([[0, 0], [0.22, 4, 's'], [TH, 10, 'q'], [0.7, 4, 's'], [1.05, 0, 's']], t - 0.05) * D2R);
    for (const L of LEGS) if (L !== LF) { if (L === RF) { if (!this.pinR) { this.pinR = toWorld(V(RF.anchor.x, 0, RF.anchor.z)); this.pinR.y = HY; } solveArm(RF, this.pinR, { out: 0.45 }); } else footC(L, this, {}); }
    // 攻擊掌：沿弧線走（往外抬 → 頂點停一下 → 由外往內往下急掃 → 扣下 → 收回），不從臉中間穿過
    const o = Math.sign(LF.anchor.x) || 1, A = LF.anchor, pts = [[0, 0, 0], [0.12 * o, 0.20, 0.04], [0.26 * o, 0.46, 0.14], [0.20 * o, 0.52, 0.34], [-0.10 * o, 0.20, 0.46], [-0.19 * o, 0.05, 0.32], [0, 0, 0]];
    const tw0 = this.G, loc0 = V(A.x, HY, A.z), P = pts.map((p, i) => (i === 0 || i === 6) ? null : toWorld(V(loc0.x + p[0], loc0.y + p[1], loc0.z + p[2]))); P[0] = tw0; P[6] = tw0;
    const sidx = kf([[0, 0], [0.13, 1, 's'], [0.22, 2, 'o'], [TH, 4, 'q'], [0.50, 5, 'o'], [0.95, 6, 's']], t), pw = crom(P.map(p => ({ x: p.x, y: p.y, z: p.z })), sidx);
    // 臉頰安全區：掌進到頭附近就往外推
    const hc = wp(HEAD.head).addScaledVector(fwd, 0.10), dv = pw.clone().sub(hc), R = 0.34; if (dv.length() < R) pw.copy(hc).addScaledVector(dv.normalize(), R);
    pw.y = Math.max(HY, pw.y);
    solveArm(LF, pw, { droop: kf([[0, 0], [1, 30, 's'], [2, 40, 's'], [3, -5, 'q'], [4, 8, 'l'], [5, 26, 'o'], [6, 0, 's']], sidx), paw: kf([[0, 90], [1, 70, 's'], [2, 42, 's'], [3, 28, 'q'], [4, 60, 'l'], [5, 84, 'o'], [6, 90, 's']], sidx),
      out: kf([[0, 0.45], [2, 1.0, 's'], [4, 0.8], [6, 0.45, 's']], sidx), upP: kf([[0, 0], [2, 0.35, 's'], [4, 0.15], [6, 0, 's']], sidx) });
    const tdp = this.sp.tail.step(kf([[0, 0.15], [0.22, 0.3, 's'], [TH, 0.0, 'q'], [1.0, 0.15, 's']], t - 0.08), dt);
    tail(i => kf([[0, 0], [0.22, -0.22, 's'], [TH, 0.30, 'q'], [0.6, 0.1, 'o'], [1.1, 0, 's']], t - 0.09) * (1 + i * 0.18), tdp, dt);
  } };


const SMOOTH_IT = 8, SPAT_R = (typeof location !== "undefined" && /[?&]spat=0/.test(location.search)) ? 0 : 0.06;
const SK = []; model.traverse(o => { if (o.isSkinnedMesh) SK.push(o); });
const FIXW = !(typeof location !== 'undefined' && /[?&]fixw=0/.test(location.search));
/* ---------- 蒙皮權重修正（通用，載入模型時自動做一次）----------
   Meshy 自動綁骨的權重不能直接用：頭附近的毛會被前腿扯、肩背整片跟著上臂轉、有些頂點掛在不會動的根骨上。
   做法：沿模型表面量距離，分出「頭」和「身體」；頭（含垂下來的頰毛、頸毛）整塊跟頭骨；
   頭和前腿之間一定隔一圈只跟胸骨的緩衝帶（頭的毛和腿的皮不能直接相鄰，不然腿一擺就撕開）；
   肩關節上方的皮還給胸骨；最後在交界帶把權重抹勻。尺寸都以腿長為單位，換生物不用改。 */
(() => { resetPose(); root.updateMatrixWorld(true);
  const sub = b => { const s = new Set(); if (b) b.traverse(o => { if (o.isBone) s.add(o.name); }); return s; };
  const headS = sub(HEAD.head), earS = new Set([...sub(HEAD.earL), ...sub(HEAD.earR)]), flS = new Set([...sub(LEGS[0].s), ...sub(LEGS[1].s)]);
  for (const m of SK) { if (m.geometry.userData.fix20) continue; m.geometry.userData.fix20 = 1;
    const g = m.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bn = m.skeleton.bones.map(b => b.name), N = P.count, idx = g.index.array;
    const isHeadB = bn.map(n => headS.has(n) && !earS.has(n)), isEar = bn.map(n => earS.has(n)), isFL = bn.map(n => flS.has(n)), isClav = bn.map(n => n === LEGS[0].s.name || n === LEGS[1].s.name);
    const iHead = bn.indexOf(HEAD.head.name), iHips = bn.indexOf(HEAD.hips.name), iRoot = HEAD.rootB ? bn.indexOf(HEAD.rootB.name) : -1, iChest = bn.indexOf(HEAD.chest.name);
    const shL = toLocal(wp(LEGS[0].s)), hdL = toLocal(wp(HEAD.head)), earY = HEAD.earL ? toLocal(wp(HEAD.earL)).y : 1e9, v = V(), L = [];
    for (let i = 0; i < N; i++) { m.getVertexPosition(i, v); L.push(toLocal(stage.worldToLocal(m.localToWorld(v.clone())))); }
    /* 焊接重複頂點（貼圖接縫會把同一點拆成好幾個） */
    const key = new Map(), wid = new Int32Array(N); let nw = 0; for (let i = 0; i < N; i++) { const k = Math.round(L[i].x * 2000) + ',' + Math.round(L[i].y * 2000) + ',' + Math.round(L[i].z * 2000); let w = key.get(k); if (w === undefined) { w = nw++; key.set(k, w); } wid[i] = w; }
    const WP = new Array(nw), rep = new Int32Array(nw).fill(-1); for (let i = 0; i < N; i++) { WP[wid[i]] = L[i]; if (rep[wid[i]] < 0) rep[wid[i]] = i; } const adj = Array.from({ length: nw }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const p = wid[idx[t + e]], q = wid[idx[t + (e + 1) % 3]]; if (p !== q) { const d = WP[p].distanceTo(WP[q]); adj[p].push(q, d); adj[q].push(p, d); } }
    /* 沿表面量距離（Dijkstra）。距離一定要用 Float64，Float32 的進位誤差會讓它無限重推 */
    const dij = seed => { const D = new Float64Array(nw).fill(1e9), H = []; const push = (d, n) => { H.push([d, n]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
      const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s2 = i; if (l < H.length && H[l][0] < H[s2][0]) s2 = l; if (r < H.length && H[r][0] < H[s2][0]) s2 = r; if (s2 === i) break; [H[s2], H[i]] = [H[i], H[s2]]; i = s2; } } return top; };
      for (let n = 0; n < nw; n++) if (seed(n)) { D[n] = 0; push(0, n); }
      while (H.length) { const [d, n] = pop(); if (d > D[n]) continue; const A = adj[n]; for (let k = 0; k < A.length; k += 2) { const nd = d + A[k + 1]; if (nd < D[A[k]]) { D[A[k]] = nd; push(nd, A[k]); } } } return D; };
    const YB = HREF - 0.3335, BL = 0.16;
    const dH = dij(n => WP[n].z > hdL.z + 0.08 && WP[n].y > hdL.y - 0.08), dB = dij(n => WP[n].z < shL.z - 0.10 || WP[n].y < YB);
    const tW = new Float64Array(nw); for (let n = 0; n < nw; n++) { let t = (dB[n] - dH[n]) / BL + 0.5; t = Math.min(1, Math.max(0, t)); tW[n] = dH[n] < 1e8 ? t * t * (3 - 2 * t) : 0; }
    const gH = dij(n => tW[n] > 0);                       /* 離「頭的範圍」多遠 */
    const toChest = (I, W, mv) => { if (mv <= 0) return; let k = I.indexOf(iChest); if (k < 0) { k = 0; for (let q = 1; q < 4; q++) if (W[q] < W[k]) k = q; mv += W[k]; I[k] = iChest; W[k] = 0; } W[k] += mv; };
    for (let i = 0; i < N; i++) { const w = wid[i], t = tW[w], I = [0, 1, 2, 3].map(k => SI.getComponent(i, k)), W = [0, 1, 2, 3].map(k => SW.getComponent(i, k));
      for (let k = 0; k < 4; k++) if (I[k] === iRoot && W[k] > 0) I[k] = iHips;      /* 掛在不會動的根骨上的頂點改跟骨盆 */
      if (FIXW) {
        /* 肩關節上方、前方的皮（肩背、頸根、前胸）不該整塊跟著上臂轉：把上臂權重的大部分還給胸骨 */
        { const p = L[i], fy = sm(shL.y - 0.10, shL.y + 0.07, p.y), fz = sm(shL.z + 0.05, shL.z + 0.16, p.z) * sm(shL.y - 0.24, shL.y - 0.12, p.y), f = Math.max(fy, fz) * 0.9;
          if (f > 0) { let mv = 0; for (let k = 0; k < 4; k++) if (isClav[I[k]]) { mv += W[k] * f; W[k] *= 1 - f; } toChest(I, W, mv); } }
        /* 頭的範圍旁邊留一圈緩衝帶：前腿骨的權重全部還給胸骨 */
        { const f = 1 - sm(0.06, 0.20, gH[w]); if (f > 0) { let mv = 0; for (let k = 0; k < 4; k++) if (isFL[I[k]]) { mv += W[k] * f; W[k] *= 1 - f; } toChest(I, W, mv); } }
        /* 頭的範圍（含垂下來的毛）：整塊跟頭骨 */
        if (t > 0) { let moved = 0; for (let k = 0; k < 4; k++) { const keep = isHeadB[I[k]] || (isEar[I[k]] && L[i].y > earY - 0.03); if (!keep) { moved += W[k] * t; W[k] *= 1 - t; } }
          if (moved > 0) { let k = I.indexOf(iHead); if (k < 0) { k = 0; for (let q = 1; q < 4; q++) if (W[q] < W[k]) k = q; W[k] = 0; I[k] = iHead; } W[k] += moved; } } }
      const sum = W[0] + W[1] + W[2] + W[3] || 1; for (let k = 0; k < 4; k++) { SI.setComponent(i, k, I[k]); SW.setComponent(i, k, W[k] / sum); } }
    /* 交界帶把權重抹勻（只動頭的邊緣到緩衝帶外一點的範圍） */
    if (FIXW && SMOOTH_IT > 0) { const band = []; for (let n = 0; n < nw; n++) if (gH[n] < 0.30 && tW[n] < 0.999) band.push(n);
      const get = n => { const i = rep[n], M = new Map(); for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) M.set(SI.getComponent(i, k), (M.get(SI.getComponent(i, k)) || 0) + w); } return M; };
      const Wm = new Map(); for (const n of band) { Wm.set(n, get(n)); const A = adj[n]; for (let k = 0; k < A.length; k += 2) if (!Wm.has(A[k])) Wm.set(A[k], get(A[k])); }
      const inB = new Uint8Array(nw); for (const n of band) inB[n] = 1;
      for (let it = 0; it < SMOOTH_IT; it++) { const nx = new Map(); for (const n of band) { const M = new Map(), A = adj[n], c = A.length / 2; if (!c) continue; for (const [b, w] of Wm.get(n)) M.set(b, w * 0.5); for (let k = 0; k < A.length; k += 2) for (const [b, w] of Wm.get(A[k])) M.set(b, (M.get(b) || 0) + w * 0.5 / c); nx.set(n, M); } for (const [n, M] of nx) Wm.set(n, M); }
      const out = new Map(); for (const n of band) { const e = [...Wm.get(n)].sort((a, b) => b[1] - a[1]).slice(0, 4), s = e.reduce((a, x) => a + x[1], 0) || 1; while (e.length < 4) e.push([e[0][0], 0]); out.set(n, e.map(x => [x[0], x[1] / s])); }
      for (let i = 0; i < N; i++) { const e = out.get(wid[i]); if (!e) continue; for (let k = 0; k < 4; k++) { SI.setComponent(i, k, e[k][0]); SW.setComponent(i, k, e[k][1]); } } }
    /* 空間抹勻：Meshy 的模型是一層層互相重疊的毛片（鬃毛、披毛、頰毛），沿表面看是分開的，空間上卻貼在一起。
       相鄰毛片的權重如果不一樣，身體一動縫就裂開、露出縫裡沒上色的地方。這裡讓空間上靠近的頂點權重趨於一致（頭的範圍不參與）。 */
    if (FIXW && SPAT_R > 0) { const Y0 = HREF * 0.50, Y1 = HREF * 0.60, reg = []; for (let n = 0; n < nw; n++) if (tW[n] <= 0 && WP[n].y > Y0) reg.push(n);
      const cs = SPAT_R, hk = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
      const getW = n => { const i = rep[n], M = new Map(); for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) M.set(SI.getComponent(i, k), (M.get(SI.getComponent(i, k)) || 0) + w); } return M; };
      let Wm = new Map(); for (const n of reg) Wm.set(n, getW(n));
      const grid = new Map(); for (const n of reg) { const p = WP[n], k = hk(Math.floor(p.x / cs), Math.floor(p.y / cs), Math.floor(p.z / cs)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(n); }
      for (let pass = 0; pass < 2; pass++) { const nx = new Map(); for (const n of reg) { const p = WP[n], cx = Math.floor(p.x / cs), cy = Math.floor(p.y / cs), cz = Math.floor(p.z / cs), M = new Map(); let tot = 0;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const a = grid.get(hk(cx + dx, cy + dy, cz + dz)); if (!a) continue; for (const q of a) { const d = p.distanceTo(WP[q]); if (d >= SPAT_R) continue; const f = 1 - d / SPAT_R; tot += f; for (const [b, w] of Wm.get(q)) M.set(b, (M.get(b) || 0) + w * f); } }
          if (tot > 0) { for (const [b, w] of M) M.set(b, w / tot); nx.set(n, M); } else nx.set(n, Wm.get(n)); } Wm = nx; }
      const out = new Map(); for (const n of reg) { const f = sm(Y0, Y1, WP[n].y), M = new Map(); for (const [b, w] of getW(n)) M.set(b, w * (1 - f)); for (const [b, w] of Wm.get(n)) M.set(b, (M.get(b) || 0) + w * f);
        const e = [...M].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = e.reduce((a, x) => a + x[1], 0) || 1; while (e.length < 4) e.push([e[0][0], 0]); out.set(n, e.map(x => [x[0], x[1] / sum])); }
      for (let i = 0; i < N; i++) { const e = out.get(wid[i]); if (!e) continue; for (let k = 0; k < 4; k++) { SI.setComponent(i, k, e[k][0]); SW.setComponent(i, k, e[k][1]); } } }
    SI.needsUpdate = true; SW.needsUpdate = true; } })();

/* ---------- 遊戲用控制器 ---------- */
SOFT = true; const FIT = {};
for (const n of ['walk', 'trot', 'gallop']) { const G = GAITS[n]; SCAP = G.scap; const R = fitStride(G); let span = Infinity; const cz = {};
  for (const L of LEGS) { const [a, b] = R[L.id]; span = Math.min(span, b - a); cz[L.id] = clamp((a + b) / 2, -0.15, 0.15); } const S = Math.min(G.S, span * 0.92); FIT[n] = { S, cz, v: S / (G.duty * G.T) }; }
modes.Cidle.init(); modes.Dpounce.init(); modes.Dswipe.init(); SCAP = 0.06;
const OFFS = { walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, trot: { LH: 0, LF: 0.5, RH: 0.5, RF: 1.0 }, gallop: { LH: 0, LF: 0.42, RH: 0.08, RF: 0.52 } };
const NUM = ['T', 'duty', 'crouch', 'liftF', 'liftH', 'bob', 'pitchA', 'roll', 'yaw', 'flex', 'headK'];
const PROF = Object.assign({ warnY: -0.21, warnP: -10 }, OPT.prof || {});
const ctl = { mode: '', ph: 0, still: 0, bl: 1, fromQ: bones.map(b => b.quaternion.clone()), fromP: bones.map(b => b.position.clone()), lastQ: bones.map(b => b.quaternion.clone()), lastP: bones.map(b => b.position.clone()), fromR: V(), lastR: V(), fromRq: Q(), lastRq: Q(), pin: {}, blDur: 0.16, fl: -1, flWait: 6 + 14 * Math.random() };
function loco(v, dt) { const vt = FIT.trot.v, vw = FIT.walk.v, vg = FIT.gallop.v; let a = 'walk', b = 'trot', u = sm(vw * 1.1, vt * 0.9, v); if (v > vt) { a = 'trot'; b = 'gallop'; u = sm(vt * 1.15, Math.max(vt * 1.5, vg * 0.75), v); }
  const G = {}, A = GAITS[a], Bg = GAITS[b]; for (const k of NUM) G[k] = lerp(A[k], Bg[k], u); const wG = b === 'gallop' ? u : 0, S0 = lerp(FIT[a].S, FIT[b].S, u);
  for (const L of LEGS) L.cz = lerp(FIT[a].cz[L.id], FIT[b].cz[L.id], u);
  const vn = S0 / (G.duty * G.T), r = v / vn, cad = r < 1 ? Math.max(0.55, Math.sqrt(r)) : Math.min(1.7, r), Sx = S0 * Math.min(1.3, r / cad), amp = sm(0, 0.6, r);
  G.liftF *= Math.max(0.25, amp); G.liftH *= Math.max(0.25, amp);
  ctl.ph += dt * cad / G.T; const ph = ctl.ph; resetPose(); root.position.set(0, 0, 0); const { fwd, right, up } = axes(), c = 2 * Math.PI * ph;
  const bob = lerp(G.bob * (0.5 + 0.5 * Math.cos(2 * c)), G.bob * (0.5 + 0.5 * Math.sin(c)), wG) * amp; root.position.y = bob - G.bob * 0.6 * amp - G.crouch + INR.y; root.updateMatrixWorld(true);
  const pitch = G.pitchA * D2R * Math.sin(c) * amp, roll = G.roll * D2R * Math.sin(c) * amp, yaw = G.yaw * D2R * Math.sin(c) * amp, fl = G.flex * D2R * Math.sin(c + 0.4) * amp;
  rotW(HEAD.hips, right, pitch + INR.pitch * D2R); rotW(HEAD.hips, fwd, roll + INR.roll * D2R); rotW(HEAD.hips, up, yaw * 0.5);
  if (Math.abs(fl) > 1e-4) { rotW(HEAD.spine, right, -fl); rotW(HEAD.chest, right, fl * 1.2); }
  rotW(HEAD.chest, up, -yaw); rotW(HEAD.neck, right, -pitch * G.headK - fl * 0.8 + G.crouch * 0.6); rotW(HEAD.neck, up, yaw * 0.5 + INR.look * D2R);
  for (const L of LEGS) { const p = ((ph + lerp(OFFS[a][L.id], OFFS[b][L.id], u)) % 1 + 1) % 1, f = footPlan(L, p, G, Sx); const tw = toWorld(V(L.anchor.x, 0, L.anchor.z + f.dz)); tw.y = f.y; solveLeg(L, tw, f.pitch, f.slant); }
  tail(i => Math.sin(c - i * 0.55) * lerp(0.10, 0.09, wG) * Math.max(0.3, amp), lerp(0.12, -0.04 + 0.10 * Math.sin(c + 1.2), wG), dt); }
/* ---------- 倒地（第四版：軀幹剛體＋肢體粒子，單向帶動）----------
   前幾版的問題：
   第二版只有骨頭長度的約束，關節沒有角度限制也沒有肌肉張力，所以像布偶一樣一瞬間攤平。
   第三版把軀幹和四肢全部放在同一組粒子裡互相推，腿一頂地板就把整個身體撬翻（實測 0.2 秒內滾了 270 度）。
   這一版的做法：
   1. 軀幹是一顆真正的剛體（位置、朝向、速度、角速度），外形用從模型量出來的球，受重力、地面反力、摩擦、滾動阻力。
   2. 四條腿的支撐力各自獨立、依序消失（倒下側先、前腳比後腳早），腿軟掉後還有阻力，所以是「撐不住慢慢垮」而不是自由落體。
   3. 四肢和頭頸是掛在軀幹上的粒子鏈：有關節角度限制、彎曲方向限制、會衰減但不歸零的肌肉張力、地面碰撞與摩擦。
      四肢只被軀幹帶著走，不會反過來撬動軀幹，所以不會爆開或亂翻。
   4. 四肢對軀幹的影響（腿攤在地上擋住翻滾、腿的重量把身體拉回側躺）用一個朝「側躺」的回正力矩代表。
   5. 把粒子反推回骨頭時連扭轉一起決定（用軀幹的左右軸當參考），頭不會扭成臉朝上。
   6. 受擊是打在命中點的衝量（同時改變速度與角速度）；著地瞬間胸、腰臀有外觀上的下沉回彈；胸先倒、腰臀慢一拍（脊椎扭轉）。
   7. 半空中死亡沒有腿的支撐，直接摔落；空中保留六成的回正力矩，讓牠落地時就是側身（這一項是為了好看，不是真實物理）。
   全部尺寸從骨架與模型量出來，換別的四足生物不用改這段。 */
const RG = (() => { resetPose(); root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
  /* 倒地參數（之後每種生物一份） */
  const G = 9.8, P = { sup: [0.0, 0.13, 0.07, 0.21], supDur: 0.30, supK: 160, supC: 14, resist: 2.0, cK: 5000, cC: 90, mu: 0.8, rollA: 13, airRoll: 0.6, rollOver: 14, rollC: 5, hitJ: 1.4, hitBack: 0.3, hitUp: 0.12, hitFwd: 0.18, hitHead: 1.6,
    flex1: 140, flex2: 125, abd: 28, add: 40, legK: 0.03, twistK: 7, twistMax: 12, sqK: 0.03, sqMax: 0.045, sqW: 14, legRes: [0.002, 0.001, 0.0005], headK: 0.08, headRes: 0.004, jointD: 0.03, headD: 0.05, swF: [50, 55], swH: [40, 70], fric: 0.93 };
  const SI = [2, 3, 0, 1], mid = (a, b) => a.clone().add(b).multiplyScalar(0.5), c4 = [wp(LEGS[2].s), wp(LEGS[3].s), wp(LEGS[0].s), wp(LEGS[1].s)], hm0 = mid(c4[0], c4[1]), sm0 = mid(c4[2], c4[3]), bw = Math.abs(c4[2].x - c4[3].x);
  /* 從模型量軀幹與頭的大小（同一個模型只量一次） */
  const g0 = SK[0] && SK[0].geometry; let MS = g0 && g0.userData.rgm;
  if (!MS && g0) { const m = SK[0], bn = m.skeleton.bones.map(b => b.name), SIa = g0.attributes.skinIndex, SWa = g0.attributes.skinWeight, v = V(), zm = (hm0.z + sm0.z) / 2, Fr = [], Re = [], Hd = [];
    const isT = bn.map(n => /^(hips|spine|chest)/.test(n)), isH = bn.map(n => /^(head|jaw)/.test(n)), isU = bn.map(n => LEGS.some(L => L.s.name === n)), Fr2 = [], Re2 = [];      /* isU：大腿、上臂（有些骨架軀幹後半的皮都算在大腿上） */
    for (let i = 0; i < g0.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SWa.getComponent(i, q) > SWa.getComponent(i, k)) k = q; const b = SIa.getComponent(i, k); if (isU[b]) { m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())); if (p.y > HREF * 0.62) (p.z >= zm ? Fr2 : Re2).push(p); continue; } if (!isT[b] && !isH[b]) continue;
      m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())); (isH[b] ? Hd : p.z >= zm ? Fr : Re).push(p); }
    const qt = (arr, f, a) => { if (!arr.length) return 0; const s = arr.map(f).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(a * (s.length - 1))))]; };
    const st = arr => { const hw = qt(arr, p => Math.abs(p.x), 0.95) || bw * 0.6, strip = arr.filter(p => Math.abs(p.x) < 0.6 * hw); return { hw, y0: qt(strip, p => p.y, 0.05), y1: qt(strip, p => p.y, 0.95) }; };
    let mF = st(Fr), mR = st(Re); if (mR.y1 - mR.y0 < 0.3) mR = st(Re.concat(Re2)); if (mF.y1 - mF.y0 < 0.3) mF = st(Fr.concat(Fr2));
    MS = { F: mF, R: mR, H: Hd.length ? { x: qt(Hd, p => Math.abs(p.x), 0.9), y0: qt(Hd, p => p.y, 0.08), y1: qt(Hd, p => p.y, 0.85), z0: qt(Hd, p => p.z, 0.05), z1: qt(Hd, p => p.z, 0.97) } : null }; g0.userData.rgm = MS; }
  const sph = (S0, z) => { const h = Math.max(0.1, S0.y1 - S0.y0), r = Math.min(S0.hw, h / 2) * 0.92, cy = (S0.y0 + S0.y1) / 2, oy = Math.max(0, h / 2 - r); return [V(0, cy + oy, z), V(0, cy - oy, z), r]; };
  const Fd = MS ? MS.F : { hw: bw * 0.6, y0: sm0.y - 0.25, y1: sm0.y + 0.2 }, Rd = MS ? MS.R : { hw: bw * 0.55, y0: hm0.y - 0.22, y1: hm0.y + 0.18 }, Md = { hw: (Fd.hw + Rd.hw) / 2, y0: (Fd.y0 + Rd.y0) / 2, y1: (Fd.y1 + Rd.y1) / 2 };
  const sF = sph(Fd, sm0.z), sM = sph(Md, (sm0.z + hm0.z) / 2), sR = sph(Rd, hm0.z), hJ0 = wp(HEAD.head), Hm = MS && MS.H;
  const hC0 = Hm ? V(0, (Hm.y0 + Hm.y1) / 2, (Hm.z0 + Hm.z1) / 2) : hJ0.clone().add(V(0, 0, 0.15)), hR = Hm ? Math.min(Hm.x, (Hm.y1 - Hm.y0) / 2) * 0.9 : 0.18, nz0 = Hm ? V(0, hC0.y - 0.04, Hm.z1 - 0.07) : hJ0.clone().add(V(0, -0.05, 0.3));
  /* 粒子：0-3 髖肩四角、4-9 軀幹碰撞球、10 頸根、11 頭關節、12 頭中心、13 鼻、14 起每條腿 3 個（肘／膝、腕／飛節、掌） */
  const R0 = [...c4, sF[0], sF[1], sM[0], sM[1], sR[0], sR[1], wp(HEAD.neck), hJ0, hC0, nz0]; for (const L of LEGS) R0.push(wp(L.e), wp(L.w), wp(L.h)); const N = R0.length, LB = 14;
  const rad = [0.04, 0.04, 0.04, 0.04, sF[2], sF[2], sM[2], sM[2], sR[2], sR[2], 0.07, 0.06, hR, 0.07]; for (let i = 0; i < 4; i++) rad.push(0.06, 0.05, Math.max(0.02, HY));
  const im = new Array(11).fill(0).concat([0.5, 0.22, 0.7]); for (let i = 0; i < 4; i++) im.push(0.8, 1.0, 1.2);      /* 0-10 是軀幹，由剛體決定位置（質量視為無限大） */
  const C = [], d0 = (i, j) => R0[i].distanceTo(R0[j]), eq = (i, j) => C.push([i, j, d0(i, j), d0(i, j)]), rng = (i, j, a, b) => C.push([i, j, d0(i, j) * a, d0(i, j) * b]);
  eq(10, 11); eq(11, 12); eq(12, 13); eq(11, 13); rng(12, 4, 0.72, 1.18); rng(12, 2, 0.7, 9); rng(12, 3, 0.7, 9); rng(13, 10, 0.85, 9); rng(13, 5, 0.6, 9);
  const lim = (l1, l2, fl) => Math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(fl * D2R));
  LEGS.forEach((L, li) => { const s = SI[li], e = LB + li * 3, w = e + 1, p = e + 2, o = SI[li ^ 1], F = L.kind === 'F'; eq(s, e); eq(e, w); eq(w, p);
    C.push([s, w, lim(L.l1, L.l2, P.flex1), lim(L.l1, L.l2, F ? 4 : 8)]); C.push([e, p, lim(L.l2, L.l3, P.flex2), lim(L.l2, L.l3, 3)]); rng(e, o, 0.8, 9); rng(w, o, 0.7, 9); rng(p, o, 0.5, 9); });
  for (const a of [0, 2]) for (const j of [1, 2]) C.push([LB + a * 3 + j, LB + (a + 1) * 3 + j, 0.09, 9]);                 /* 左右腳不互相穿過 */
  const X = R0.map(v => v.clone()), Vl = R0.map(() => V()), PV = R0.map(() => V()), tmp = V(), tmp2 = V();
  const basis = Pp => { const hm = mid(Pp[0], Pp[1]), smd = mid(Pp[2], Pp[3]), Xa = Pp[0].clone().sub(Pp[1]).add(Pp[2]).sub(Pp[3]).normalize(), Z = smd.sub(hm).normalize(), Y = Z.clone().cross(Xa).normalize(); Xa.copy(Y).cross(Z).normalize(); return { m: new THREE.Matrix4().makeBasis(Xa, Y, Z), hm, X: Xa, Y, Z }; };
  const B0 = basis(R0), M0t = B0.m.clone().transpose(), toL = (p, b, mt) => p.clone().sub(b.hm).applyMatrix4(mt), LR = R0.map(p => toL(p, B0, M0t));       /* 各粒子在軀幹座標裡的綁定位置 */
  const rotF = (v, deg) => v.clone().applyAxisAngle(B0.X, -deg * D2R), TR = LR.map(v => v.clone()), TS = LR.map(v => v.clone());
  /* 放鬆姿勢：肘膝微彎，正的角度＝往前轉。壓在下面的腿和疊在上面的腿前後錯開，不會疊成一條 */
  const relax = () => LEGS.forEach((L, li) => { const s = SI[li], e = LB + li * 3, F = L.kind === 'F', up = (Math.sign(R0[s].x) || 1) !== S.side, a = F ? [up ? -4 : 12, up ? 20 : 28, 10] : [up ? 20 : 8, up ? -20 : -14, 14]; const u1 = R0[e].clone().sub(R0[s]), u2 = R0[e + 1].clone().sub(R0[e]), u3 = R0[e + 2].clone().sub(R0[e + 1]);
    const pe = R0[s].clone().add(rotF(u1, a[0])), pw = pe.clone().add(rotF(u2, a[1])), pp = pw.clone().add(rotF(u3, a[2])); TR[e] = toL(pe, B0, M0t); TR[e + 1] = toL(pw, B0, M0t); TR[e + 2] = toL(pp, B0, M0t); });
  const hCl = HEAD.head.worldToLocal(stage.localToWorld(hC0.clone())), nzl = HEAD.head.worldToLocal(stage.localToWorld(nz0.clone()));
  const Q0s = new Map(); for (const b of bones) Q0s.set(b, GQ(b, Q()).clone());
  const S = { t: 0, still: 0, frozen: false, on: false, side: 1, air: false, rl: 0, tw: 0, sqA: 0, sqT: -1, landed: false, vy: 0, ts: 1 };
  /* ---- 軀幹剛體（質量當 1） ---- */
  const comL = V(); for (let i = 4; i < 10; i++) comL.add(LR[i]); comL.multiplyScalar(1 / 6); const LC = LR.map(p => p.clone().sub(comL));
  const dL = Math.abs(LR[4].z - LR[8].z) + sF[2] + sR[2], dW = 2 * Md.hw, dH = Math.max(0.2, Md.y1 - Md.y0), Ib = V((dL * dL + dH * dH) / 12 * 1.2, (dL * dL + dW * dW) / 12 * 1.2, (dW * dW + dH * dH) / 12 * 2);
  const zF = (LC[2].z + LC[3].z) / 2, zR = (LC[0].z + LC[1].z) / 2, wt = [zF / (zF - zR) / 2, zF / (zF - zR) / 2, -zR / (zF - zR) / 2, -zR / (zF - zR) / 2];
  const T = { c: V(), q: Q(), v: V(), w: V(), y0: [0, 0, 0, 0], tc: 0 }, _r = V(), _f = V(), _pv = V(), _tq = V(), _F = V(), _wb = V(), _qi = Q(), _dq = Q(), _up = V(), _ax = V(), _D = V();
  const supS = (k, t) => { const near = (Math.sign(R0[k].x) || 1) === S.side, a = P.sup[(k >= 2 ? 0 : 2) + (near ? 0 : 1)] * S.ts; return S.air ? 0 : 1 - sm(a, a + P.supDur * (0.5 + 0.5 * S.ts), t); };
  function torso(h, t) { _F.set(0, -G, 0); _tq.set(0, 0, 0); let tc = 0, sAll = 0;
    for (let k = 0; k < 4; k++) { const s = supS(k, t); sAll += s / 4; _r.copy(LC[k]).applyQuaternion(T.q); _pv.crossVectors(T.w, _r).add(T.v); const py = T.c.y + _r.y;
      let fy = s * (wt[k] * G + P.supK * (T.y0[k] - py) - P.supC * _pv.y); if (fy < 0) fy = 0; fy += (1 - s) * P.resist * Math.max(0, -_pv.y);     /* 腿軟了還是有阻力 */
      _f.set(-s * 2.5 * _pv.x, fy, -s * 2.5 * _pv.z); _F.add(_f); _tq.add(_pv.crossVectors(_r, _f)); }
    for (let i = 4; i < 11; i++) { _r.copy(LC[i]).applyQuaternion(T.q); const pen = rad[i] - (T.c.y + _r.y); if (pen <= 0) continue; tc++; _r.y -= rad[i]; _pv.crossVectors(T.w, _r).add(T.v);
      const fn = Math.max(0, P.cK * pen - P.cC * _pv.y), vt = Math.hypot(_pv.x, _pv.z), ft = vt > 1e-5 ? Math.min(P.mu * fn, 30 * vt) / vt : 0; _f.set(-ft * _pv.x, fn, -ft * _pv.z); _F.add(_f); _tq.add(_pv.crossVectors(_r, _f)); }
    T.v.addScaledVector(_F, h); _qi.copy(T.q).invert(); _wb.copy(T.w).applyQuaternion(_qi); _tq.applyQuaternion(_qi);
    /* 四肢的影響：支撐消失後，把身體帶向側躺（腿攤在地上擋住、腿的重量拉回） */
    _up.set(0, 1, 0).applyQuaternion(T.q); _ax.set(0, 0, 1).applyQuaternion(T.q); _D.set(_ax.z, 0, -_ax.x); const dl = _D.length(); if (dl > 0.2) { _D.multiplyScalar(S.side / dl); _pv.crossVectors(_up, _D); const e = _pv.dot(_ax); _tq.z += Ib.z * P.rollA * (1 - sAll) * (S.air ? P.airRoll : 1) * e; if (e * _wb.z < 0) _tq.z -= Ib.z * P.rollOver * (1 - sAll) * _wb.z; }      /* 翻過頭時加阻力，不會倒過去再翻回來 */
    const ix = Ib.x * _wb.x, iy = Ib.y * _wb.y, iz = Ib.z * _wb.z, wx = _wb.x, wy = _wb.y, wz = _wb.z;
    _wb.x += h * (_tq.x - (wy * iz - wz * iy)) / Ib.x; _wb.y += h * (_tq.y - (wz * ix - wx * iz)) / Ib.y; _wb.z += h * (_tq.z - (wx * iy - wy * ix)) / Ib.z;
    T.w.copy(_wb).applyQuaternion(T.q).multiplyScalar(Math.exp(-h * (0.4 + (tc ? P.rollC : 0) + (S.air ? 1.5 : 0)))); T.v.multiplyScalar(Math.exp(-h * 0.2));
    if (tc && !S.landed) { S.landed = true; S.air = false; S.sqA = Math.min(P.sqMax, P.sqK * Math.max(0, -S.vy)); S.sqT = 0; } S.vy = T.v.y; if (S.sqT >= 0) S.sqT += h;
    T.c.addScaledVector(T.v, h); const wl = T.w.length(); if (wl > 1e-8) { _dq.setFromAxisAngle(_ax.copy(T.w).multiplyScalar(1 / wl), wl * h); T.q.premultiply(_dq).normalize(); } T.tc = tc; }
  const roll = () => { _r.set(1, 0, 0).applyQuaternion(T.q); _up.set(0, 1, 0).applyQuaternion(T.q); return Math.atan2(-_r.y, _up.y); };
  const place = () => { for (let i = 0; i < 11; i++) X[i].copy(LC[i]).applyQuaternion(T.q).add(T.c); };
  const dist = (i, j, lo, hi) => { const w = im[i] + im[j]; if (!w) return; tmp.copy(X[j]).sub(X[i]); const d = tmp.length(); if (d < 1e-6) return; const tgt = d < lo ? lo : d > hi ? hi : d; if (tgt === d) return; const k = (d - tgt) / d / w; X[i].addScaledVector(tmp, k * im[i]); X[j].addScaledVector(tmp, -k * im[j]); };
  function solve(b) {
    for (const c of C) dist(c[0], c[1], c[2], c[3]);
    LEGS.forEach((L, li) => { const s = SI[li], e = LB + li * 3, w = e + 1, p = e + 2, F = L.kind === 'F';
      /* 關節只能往正確的方向彎：彎曲方向用「身體左右軸 × 腿的軸線」算，腿甩到任何角度都成立（肘朝後、膝朝前、飛節朝後） */
      const bend = (a, j, c, sign) => { tmp.copy(X[c]).sub(X[a]); const al = tmp.length(); if (al < 1e-5) return; tmp.multiplyScalar(1 / al); tmp2.crossVectors(b.X, tmp); const nl = tmp2.length(); if (nl < 0.2) return; tmp2.multiplyScalar(1 / nl);
        const d = tmp.copy(X[j]).multiplyScalar(2).sub(X[a]).sub(X[c]).multiplyScalar(0.5).dot(tmp2) * sign; if (d < 0) X[j].addScaledVector(tmp2, -d * sign * 0.5); };
      bend(s, e, w, F ? 1 : -1); bend(e, w, p, F ? -1 : 1);
      /* 肩、髖前後擺動有範圍（腿不會甩到頭旁邊或背上） */
      { tmp.copy(X[e]).sub(X[s]); const fz = tmp.dot(b.Z), dn = -tmp.dot(b.Y), a = Math.atan2(fz, dn), sw = F ? P.swF : P.swH, ac = clamp(a, -sw[0] * D2R, sw[1] * D2R);
        if (ac !== a) { const pl = Math.hypot(fz, dn); X[e].addScaledVector(b.Z, (Math.sin(ac) * pl - fz) * 0.6).addScaledVector(b.Y, -(Math.cos(ac) * pl - dn) * 0.6); } }
      /* 整條腿不能往背上翻 */
      for (const i of [w, p]) { tmp.copy(X[i]).sub(X[s]); const up = tmp.dot(b.Y), mx = 0.2 * tmp.length(); if (up > mx) X[i].addScaledVector(b.Y, -(up - mx) * 0.6); }
      /* 腿往外張、往內夾都有上限 */
      const sx = Math.sign(LR[s].x) || 1; for (const i of [e, w, p]) { tmp.copy(X[i]).sub(X[s]); const len = tmp.length(), lat = tmp.dot(b.X) * sx, hi = Math.sin(P.abd * D2R) * len, lo = -Math.sin(P.add * D2R) * len; if (lat > hi) X[i].addScaledVector(b.X, -(lat - hi) * sx * 0.7); else if (lat < lo) X[i].addScaledVector(b.X, -(lat - lo) * sx * 0.7); } });
    /* 小腿和腳掌不能穿進身體 */
    for (let i = LB; i < N; i++) { if ((i - LB) % 3 === 0) continue; for (let j = 4; j < 10; j++) { tmp.copy(X[i]).sub(X[j]); const d = tmp.length(), m = rad[j] * 0.9 + rad[i] * 0.5; if (d < m && d > 1e-5) X[i].addScaledVector(tmp, (m - d) / d); } }
    for (let i = 11; i < N; i++) if (X[i].y < rad[i]) X[i].y = rad[i]; }
  function start(o) { root.updateMatrixWorld(true); const cur = [wp(LEGS[2].s), wp(LEGS[3].s), wp(LEGS[0].s), wp(LEGS[1].s)], b = basis(cur);
    S.t = 0; S.still = 0; S.frozen = false; S.on = true; S.side = (o && o.hitSide) || (Math.random() < 0.5 ? -1 : 1); relax();
    T.q.setFromRotationMatrix(b.m); T.c.copy(comL).applyQuaternion(T.q).add(b.hm); place(); for (let k = 0; k < 4; k++) T.y0[k] = X[k].y;
    X[11].copy(wp(HEAD.head)); X[12].copy(stage.worldToLocal(HEAD.head.localToWorld(hCl.clone()))); X[13].copy(stage.worldToLocal(HEAD.head.localToWorld(nzl.clone())));
    LEGS.forEach((L, li) => { const e = LB + li * 3; X[e].copy(wp(L.e)); X[e + 1].copy(wp(L.w)); X[e + 2].copy(wp(L.h)); });
    S.air = Math.min(X[LB + 2].y, X[LB + 5].y, X[LB + 8].y, X[LB + 11].y) > 0.15; S.rl = roll(); S.tw = 0; for (let k = 0; k < 12; k++) solve(basis(X));                                     /* 先把小誤差消掉，再給速度 */
    const bb = basis(X), mt = bb.m.clone().transpose(); for (let i = 11; i < N; i++) TS[i] = toL(X[i], bb, mt);
    const sp = (o && o.speed) || 0; S.ts = 1 / (1 + 0.8 * sp);      /* 跑得越快，腿撐不住得越快 */
    _ax.set(0, 0, 1).applyQuaternion(T.q); T.v.set(0, 0, 0).addScaledVector(_ax, sp * 0.8); T.w.set(0, 0, 0); S.landed = false; S.sqT = -1; S.sqA = 0; S.vy = 0;
    /* 受擊：衝量打在命中點（倒下方向的另一側、肩膀高度），同時改變速度和角速度，不是只把整隻往旁邊推 */
    { const J = V(S.side * P.hitJ, 0, 0).addScaledVector(_ax, -P.hitBack), r = V(-S.side * Md.hw, P.hitUp, P.hitFwd).applyQuaternion(T.q); T.v.add(J); _qi.copy(T.q).invert(); const tb = r.cross(J).applyQuaternion(_qi); tb.set(tb.x / Ib.x, tb.y / Ib.y, tb.z / Ib.z); T.w.add(tb.applyQuaternion(T.q)); }
    for (let i = 0; i < N; i++) Vl[i].copy(T.v); for (const i of [11, 12, 13]) Vl[i].add(tmp.set(S.side * P.hitHead, 0.4, 0).addScaledVector(_ax, -0.5)); }
  function step(dt) { if (S.frozen) return; const n = Math.max(1, Math.ceil(dt * 180 - 1e-6)), h = dt / n; let vmax = 0;
    for (let q = 0; q < n; q++) { S.t += h; for (let i = 0; i < 11; i++) PV[i].copy(X[i]);
      torso(h / 2, S.t - h / 2); torso(h / 2, S.t); place(); for (let i = 0; i < 11; i++) Vl[i].copy(X[i]).sub(PV[i]).multiplyScalar(1 / h);
      for (let i = 11; i < N; i++) { const a = i < LB ? 10 : SI[((i - LB) / 3) | 0]; Vl[i].y -= G * h; Vl[i].lerp(Vl[a], i < LB ? P.headD : P.jointD); PV[i].copy(X[i]); X[i].addScaledVector(Vl[i], h); }
      const b = basis(X), wr = sm(0.3, 1.0, S.t), dec = sm(0.08, 0.7, S.t);
      /* 肌肉張力：把肢體拉向目標姿勢（一開始是倒下前的姿勢，慢慢變成放鬆姿勢），拉力衰減到殘留值 */
      for (let i = 11; i < N; i++) { const head = i < LB, j = head ? 0 : (i - LB) % 3, k = head ? lerp(P.headK, P.headRes, dec) : lerp(P.legK, P.legRes[j], dec);
        tmp2.copy(TS[i]).lerp(head ? LR[i] : TR[i], wr).applyMatrix4(b.m).add(b.hm); X[i].lerp(tmp2, k); }
      for (let it = 0; it < 6; it++) solve(b);
      for (let i = 11; i < N; i++) { Vl[i].copy(X[i]).sub(PV[i]).multiplyScalar(1 / h); if (X[i].y <= rad[i] + 1e-4) { const fr = lerp(P.fric, 0.6, sm(1.0, 1.6, S.t)); Vl[i].x *= fr; Vl[i].z *= fr; if (Vl[i].y < 0) Vl[i].y = 0; } const l = Vl[i].length(); if (l > 6) Vl[i].multiplyScalar(6 / l); } }
    { const r = roll(); let d = r - S.rl; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; S.rl += d * (1 - Math.exp(-dt * P.twistK)); S.tw = clamp(r - S.rl - Math.round((r - S.rl) / (2 * Math.PI)) * 2 * Math.PI, -P.twistMax * D2R, P.twistMax * D2R); }
    for (let i = 11; i < N; i++) vmax = Math.max(vmax, Vl[i].length()); vmax = Math.max(vmax, T.v.length(), T.w.length() * 0.3); S.still = vmax < 0.06 ? S.still + dt : 0; if ((S.still > 0.5 && S.t > 1.2) || S.t > 7) S.frozen = true; }
  /* 把骨頭轉到指定方向，扭轉用軀幹左右軸當參考（不會亂扭） */
  const _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _qa = Q(), _pq = Q(), prevH = new Map();
  function setDir(bone, dRest, dCur, hRef) { const z0 = dRest.clone().normalize(), z1 = dCur.clone().normalize(), h0 = B0.X.clone().addScaledVector(z0, -B0.X.dot(z0)).normalize(); let h1 = hRef.clone().addScaledVector(z1, -hRef.dot(z1));
    if (h1.lengthSq() < 0.02 && prevH.has(bone)) { const ph = prevH.get(bone); h1 = ph.clone().addScaledVector(z1, -ph.dot(z1)); } if (h1.lengthSq() < 1e-6) h1.set(1, 0, 0); h1.normalize(); prevH.set(bone, h1.clone());
    _ma.makeBasis(h0, z0.clone().cross(h0), z0).transpose(); _mb.makeBasis(h1, z1.clone().cross(h1), z1).multiply(_ma); _qa.setFromRotationMatrix(_mb).multiply(Q0s.get(bone));
    GQ(bone.parent, _pq); bone.quaternion.copy(_pq.invert().multiply(_qa)); bone.updateMatrixWorld(true); }
  const _m = new THREE.Matrix4(), dr = (i, j) => R0[j].clone().sub(R0[i]), dc = (i, j) => X[j].clone().sub(X[i]);
  function apply() { resetPose(); const b = basis(X); _m.multiplyMatrices(b.m, M0t); root.quaternion.setFromRotationMatrix(_m); if (S.tw) root.quaternion.multiply(_qa.setFromAxisAngle(B0.Z, S.tw)); root.position.copy(b.hm).sub(B0.hm.clone().applyQuaternion(root.quaternion)); root.updateMatrixWorld(true);
    if (S.sqT >= 0 && S.sqA > 1e-4) { const sq = d => S.sqA * Math.exp(-P.sqW * Math.max(0, S.sqT - d)) * Math.sin(P.sqW * Math.max(0, S.sqT - d)), hp = sq(0.03) * 0.5, cp = sq(0);
      root.position.y -= hp; root.updateMatrixWorld(true); if (HEAD.chest) { const a = S2B(HEAD.chest.parent, V()), c = S2B(HEAD.chest.parent, V(0, -(cp - hp), 0)); HEAD.chest.position.add(c.sub(a)); HEAD.chest.updateMatrixWorld(true); } }
    if (S.tw) for (const sb of [HEAD.spine, HEAD.spine3, HEAD.chest]) if (sb) rotW(sb, b.Z, -S.tw / 3);
    setDir(HEAD.neck, dr(10, 11), dc(10, 11), b.X); setDir(HEAD.head, dr(11, 13), dc(11, 13), b.X);
    LEGS.forEach((L, li) => { const s = SI[li], e = LB + li * 3; setDir(L.s, dr(s, e), dc(s, e), b.X); setDir(L.e, dr(e, e + 1), dc(e, e + 1), b.X); setDir(L.w, dr(e + 1, e + 2), dc(e + 1, e + 2), b.X); }); }
  return { start, step, apply, S, X, Vl, MS, rad, T, P }; })();
function dead(t, dt, o) { if (t < dt * 1.5 || !RG.S.on || ctl.deadFresh) { ctl.deadFresh = false; RG.start(o); } RG.step(dt); RG.apply(); const tt = RG.S.t, { right, fwd } = axes();
  if (HEAD.jaw) rotW(HEAD.jaw, right, -kf([[0, 0], [0.08, 18, 'o'], [0.4, 5, 's'], [1.0, 5], [1.5, 11, 's']], tt) * D2R); if (HEAD.earL) { const e = kf([[0, 0], [0.1, -28, 'o'], [1.2, -28], [1.8, -14, 's']], tt) * D2R; rotW(HEAD.earL, fwd, e); rotW(HEAD.earR, fwd, -e); }
  for (const L of LEGS) rotW(L.h, right, -18 * sm(0.5, 1.3, tt) * D2R);
  tail(i => 0.12 * Math.sin(tt * 9 - i * 0.6) * Math.exp(-tt * 2.2), kf([[0, 0.12], [0.15, -0.2, 'o'], [0.7, 0.1, 's'], [1.2, 0.4, 'q'], [1.8, 0.3, 's']], tt), dt); }
/* ---------- 次級晃動層（所有招式共用）----------
   頭頸、耳朵、尾巴各掛一個「跟隨點」：用彈簧跟著骨頭該在的位置，身體突然加速、急停、落地、被打時，跟隨點會慢一拍再彈回來，
   落後的量換成頸、耳、尾的小角度。等速移動時落後為零（阻尼作用在相對速度上），所以走路奔跑不會整個頭往後拖。
   不碰 root、不碰腳、不碰 IK 目標，所以不會造成滑步。倒地時由倒地的物理接手，這一層停用。 */
const SEC = (() => {
  const mk = (w, z, max, gain) => ({ w, z, max, gain, p: V(), v: V(), tp: V(), on: 0, d: V() });
  const F = { head: mk(27, 0.36, 0.13, 1.5), earL: mk(44, 0.24, 0.06, 1.6), earR: mk(44, 0.24, 0.06, 1.6), tail: mk(19, 0.28, 0.22, 1.3) };
  const W = { loco: 1, idle: 1, warn: 1, stag: 1, pounce: 0.6, swipe: 0.6, snap: 0.8, dash: 0.8 }, S = { on: true, k: 1 };
  const _t = V(), _tv = V(), _a = V(), _b = V(), _T = V(), _u = V(), _ax = V(), _ws = V();
  function follow(f, T, dt) {
    if (!f.on || T.distanceTo(f.tp) > 1.5) { f.p.copy(T); f.v.set(0, 0, 0); f.tp.copy(T); f.on = 1; f.d.set(0, 0, 0); return f.d; }
    _tv.copy(T).sub(f.tp).multiplyScalar(1 / dt); if (f.on === 1) { f.v.copy(_tv); f.p.copy(f.tp); f.on = 2; }
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 1; i <= n; i++) { _t.copy(f.tp).lerp(T, i / n); _a.copy(_t).sub(f.p).multiplyScalar(f.w * f.w); _b.copy(_tv).sub(f.v).multiplyScalar(2 * f.z * f.w); f.v.addScaledVector(_a.add(_b), h); f.p.addScaledVector(f.v, h); }
    f.tp.copy(T); f.d.copy(f.p).sub(T); return f.d; }
  /* 世界座標的落後量 → 本模型座標，並限制最大值 */
  const lag = (f, sW) => { const d = f.d.clone().applyQuaternion(SQI).multiplyScalar(1 / sW), l = d.length(); if (l > f.max) { d.multiplyScalar(f.max / l); f.d.multiplyScalar(f.max / l); f.p.copy(f.tp).add(f.d); } return d; };
  /* 讓 base→tip 這一段朝落後方向偏：回傳軸與角度 */
  const bend = (base, tip, d, gain, mx) => { _u.copy(tip).sub(base); const L = _u.length(); if (L < 1e-4) return 0; _u.multiplyScalar(1 / L); d.addScaledVector(_u, -d.dot(_u)); const dl = d.length(); if (dl < 1e-5) return 0; _ax.crossVectors(_u, d).normalize(); return Math.min(mx, gain * dl / L); };
  function reset() { for (const k in F) F[k].on = 0; }
  function apply(dt, mode) { if (!S.on || dt <= 0) { reset(); return; } const wm = (W[mode] == null ? 1 : W[mode]) * S.k; stage.getWorldScale(_ws); const sW = _ws.x || 1; root.updateMatrixWorld(true);
    const world = p => stage.localToWorld(_T.copy(p));
    /* 頭頸 */
    { const pn = wp(HEAD.neck), ph = wp(HEAD.head), tip = ph.clone().add(ph.clone().sub(pn).multiplyScalar(0.6)); follow(F.head, world(tip), dt); const a = bend(pn, tip, lag(F.head, sW), F.head.gain * wm, 0.38);
      if (a) { const ax = _ax.clone(); rotW(HEAD.neck, ax, a * 0.55); if (HEAD.neck2) rotW(HEAD.neck2, ax, a * 0.3); rotW(HEAD.head, ax, a * 0.15); } }
    /* 耳朵 */
    for (const [b, f] of [[HEAD.earL, F.earL], [HEAD.earR, F.earR]]) { if (!b) continue; const pe = wp(b), ph = wp(HEAD.head), tip = pe.clone().add(pe.clone().sub(ph).normalize().multiplyScalar(0.13)); follow(f, world(tip), dt); const a = bend(pe, tip, lag(f, sW), f.gain * wm, 0.5); if (a) rotW(b, _ax.clone(), a); }
    /* 尾巴 */
    if (TAIL.length > 1) { const pb = wp(TAIL[0]), pt = wp(TAIL[TAIL.length - 1]), tip = pt.clone().add(pt.clone().sub(pb).multiplyScalar(0.15)); follow(F.tail, world(tip), dt); const a = bend(pb, tip, lag(F.tail, sW), F.tail.gain * wm, 0.7);
      if (a) { const ax = _ax.clone(), n = TAIL.length; let sw = 0; for (let i = 0; i < n; i++) sw += 0.4 + i / n; TAIL.forEach((b, i) => rotW(b, ax, a * (0.4 + i / n) / sw * 1.6)); } }
    root.updateMatrixWorld(true); }
  return { apply, reset, F, S }; })();
function plantAll() { for (const L of LEGS) footC(L, ctl, {}); }
/* ---------- 現成動畫片段（Meshy 動畫庫）：只拿來做引擎做不出來的專屬動作（例如嚎叫），走跑招式不用它 ---------- */
const CL = {}; for (const c of OPT.clips || []) { const T = []; for (const tr of c.tracks) { const i = tr.name.lastIndexOf('.'), b = B(tr.name.slice(0, i)), prop = tr.name.slice(i + 1); if (b && b.isBone && (prop === 'quaternion' || prop === 'position')) T.push({ b, prop, it: tr.createInterpolant() }); } CL[c.name] = { dur: c.duration, T }; }
function clipPose(c, t) { resetPose(); for (const k of c.T) { const v = k.it.evaluate(Math.min(c.dur, Math.max(0, t))); if (k.prop === 'quaternion') k.b.quaternion.fromArray(v); else k.b.position.fromArray(v); } root.updateMatrixWorld(true); }
/* 嚎叫（待機時偶爾來一次）：先低頭吸氣 → 後坐、仰頭、張嘴長嚎（帶一點顫動和左右晃）→ 收回 */
function howl(t, dt) { resetPose(); const up = kf([[0, 0], [0.45, -0.28, 's'], [1.05, 1, 's'], [2.9, 1], [3.5, 0.06, 's'], [3.8, 0, 's']], t), u = Math.max(0, up), vib = sm(0.85, 1, up) * Math.sin(t * 31), { right } = axes();
  poseBody({ y: -0.045 * u - 0.03 * Math.max(0, -up) * 3.5, pitch: 7 * up, chest: 7 * up, neckP: 30 * up + 0.9 * vib, neckY: 5 * Math.sin(t * 1.4) * u, jaw: 26 * sm(0.55, 1, up) + 1.6 * vib, ears: -34 * u });
  if (HEAD.neck2 && HEAD.neck2 !== HEAD.neck) rotW(HEAD.neck2, right, 15 * up * D2R); rotW(HEAD.head, right, 17 * up * D2R);
  for (const L of LEGS) footC(L, modes.Cidle, {}); tail(i => Math.sin(t * 1.6 - i * 0.6) * 0.10, lerp(0.15, 0.42, u), dt); }
function startBlend(dur) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.bl = 0; ctl.blDur = dur; }
const KP = [0, 0.30, 0.69, 1.2], KS = [0, 0.22, 0.41, 1.05];
/* o：{ st 狀態（0 待機 1 追 2 蓄力 3 出招 4 收招 5 受擊 6 倒地 7 逃 8 警戒）, stT 狀態經過秒數, anim, wind, strike, recover, speed（已換算成本模型的公尺／秒）, dt } */
function update(o) { const dt = Math.min(0.05, Math.max(0, o.dt || 0)); st.t += dt; syncStage(); SOFT = true;
  let mode; const atk = o.st >= 2 && o.st <= 4;
  if (o.st === 6) mode = 'dead'; else if (o.st === 5) mode = 'stag'; else if (atk) mode = /swipe|slam|spin/.test(o.anim || '') ? 'swipe' : (o.anim === 'bite' && o.shape === 'cone') ? 'snap' : (o.anim === 'bite' && o.shape === 'line') ? 'dash' : 'pounce'; else if (o.st === 8) mode = 'warn';
  else { ctl.still = o.speed < 0.08 ? ctl.still + dt : 0; mode = ctl.still > 0.25 ? 'idle' : 'loco'; }
  inertia(dt, mode === 'dead' ? 0 : (mode === 'pounce' || mode === 'swipe' || mode === 'dash') ? 0.4 : 1);
  if (mode !== 'dead') ctl.spd = o.speed || 0;      /* 倒地時沿用死前的移動速度 */
  if (mode !== ctl.mode) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.deadFresh = mode === 'dead'; ctl.bl = ctl.mode ? 0 : 1; ctl.blDur = ctl.fl >= 0 ? 0.25 : 0.16; ctl.fl = -1; ctl.dph = null; ctl.pin = {}; modes.Cidle.pin = {};
    if (mode === 'pounce') modes.Dpounce.fresh = true; if (mode === 'swipe') modes.Dswipe.fresh = true; ctl.mode = mode; }
  root.quaternion.identity(); root.position.x = 0; root.position.z = 0;
  if (mode === 'loco') { SCAP = 0.06; loco(o.speed, dt); }
  else if (mode === 'idle') { SCAP = 0; const HW = OPT.howl ? 3.8 : 0;
    if (HW && ctl.fl < 0) { ctl.flWait -= dt; if (o.howl || ctl.flWait <= 0) { ctl.fl = 0; startBlend(0.3); } }
    if (HW && ctl.fl >= 0) { ctl.fl += dt; if (ctl.fl >= HW) { ctl.fl = -1; ctl.flWait = 22 + 25 * Math.random(); startBlend(0.3); modes.Cidle.step(dt); } else howl(ctl.fl, dt); }
    else modes.Cidle.step(dt); }
  else if (mode === 'dash') { const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.34, o.recover || 0.75][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 撲咬（衝刺咬）：後坐蓄力 → 貼地全速衝出去、脖子伸直、張嘴，衝到底咬合 → 煞住、甩頭。和飛撲不同：四腳不離地騰空 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'dash') startBlend(0.13); ctl.dph = i; ctl.pin = {}; }
    if (i === 1) { SCAP = 0.06; const y0 = INR.y, p0 = INR.pitch; INR.y += -0.075; INR.pitch += -5; loco(Math.max(o.speed || 0, FIT.gallop.v * 0.85), dt); INR.y = y0; INR.pitch = p0;
      rotW(HEAD.neck, right, 9 * D2R); if (HEAD.jaw) rotW(HEAD.jaw, right, -kf([[0, 14], [0.25, 36, 'o'], [0.7, 36], [0.9, 0, 'i'], [1, 0]], u) * D2R); }
    else { SCAP = 0.045; resetPose(); const T = i === 0 ? u : 2 + u;
      root.position.z = kf([[0, 0], [1, -0.16, 's'], [2, 0.10], [2.3, 0.14, 'o'], [3, 0, 's']], T);
      poseBody({ y: kf([[0, 0], [1, -0.12, 's'], [2, -0.11], [3, 0, 's']], T), pitch: kf([[0, 0], [1, 7, 's'], [2, -7], [2.3, -9, 'o'], [3, 0, 's']], T), chest: kf([[0, 0], [1, 5, 's'], [2, -4], [3, 0, 's']], T),
        neckP: kf([[0, 0], [1, -14, 's'], [2, 12], [2.5, 6, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [2, 0], [2.25, -15, 'o'], [2.6, 10, 's'], [3, 0, 's']], T),
        jaw: kf([[0, 0], [0.6, 6, 's'], [1, 14, 's'], [2, 0], [2.3, 5, 's'], [3, 0, 's']], T), ears: kf([[0, 0], [0.7, -30, 's'], [2.5, -30], [3, 0, 's']], T) });
      plantAll(); tail(k => Math.sin(st.t * 8 - k * 0.7) * 0.10, kf([[0, 0.1], [1, 0.32, 's'], [2, -0.1], [3, 0.1, 's']], T), dt); } }
  else if (mode === 'snap') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.42, o.strike || 0.18, o.recover || 0.55][i], T = i + clamp((o.stT || 0) / dur, 0, 1);
    /* 啃咬：重心往後收、頭縮起 → 整個身體往前頂、脖子伸出去、張大嘴咬合 → 甩一下頭收回。四腳釘在地上 */
    root.position.z = kf([[0, 0], [1, -0.12, 's'], [1.45, 0.26, 'o'], [2, 0.22, 's'], [3, 0, 's']], T);
    poseBody({ y: kf([[0, 0], [1, -0.06, 's'], [1.45, -0.09, 'o'], [2, -0.07, 's'], [3, 0, 's']], T), pitch: kf([[0, 0], [1, 5, 's'], [1.45, -6, 'o'], [2, -4, 's'], [3, 0, 's']], T), chest: kf([[0, 0], [1, 4, 's'], [1.45, -6, 'o'], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -16, 's'], [1.45, 12, 'o'], [1.8, 16, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [1.5, 0], [1.8, -14, 'o'], [2.25, 9, 's'], [3, 0, 's']], T),
      jaw: kf([[0, 0], [0.5, 8, 's'], [1, 20, 's'], [1.3, 38, 'o'], [1.5, 0, 'i'], [2, 3], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    plantAll(); tail(i => Math.sin(st.t * 9 - i * 0.7) * 0.10, kf([[0, 0.1], [1, 0.3, 's'], [1.45, -0.15, 'o'], [3, 0.1, 's']], T), dt); }
  else if (mode === 'pounce' || mode === 'swipe') { SCAP = 0.045; const K = mode === 'pounce' ? KP : KS, i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.3, o.recover || 0.6][i], M = mode === 'pounce' ? modes.Dpounce : modes.Dswipe;
    M.yk = (o.low || o.shape === 'line') ? 0.35 : 1; M.tIn = K[i] + clamp((o.stT || 0) / dur, 0, 1) * (K[i + 1] - K[i]); M.step(dt); }
  else if (mode === 'dead') { dead(o.stT || 0, dt, { hitSide: o.hitSide, speed: Math.max(o.speed || 0, ctl.spd || 0) }); }
  else if (mode === 'stag') { resetPose(); const tt = o.stT || 0, k = Math.exp(-tt * 2.6) * sm(0, 0.05, tt); root.position.z = -0.24 * k; root.position.x = 0.07 * k; poseBody({ y: -0.20 * k, pitch: 15 * k, roll: 15 * k, yaw: 12 * k, chest: -8 * k, neckP: -24 * k, neckY: -38 * k, jaw: 22 * k, ears: -36 * k }); plantAll(); tail(i => 0.25 * k * (1 + i * 0.2), 0.2, dt); }
  else { resetPose(); const t = st.t, br = Math.sin(t * 3.1); root.position.z = -0.08; poseBody({ y: PROF.warnY + 0.012 * br, pitch: PROF.warnP, chest: -4, yaw: 2.5 * Math.sin(t * 1.7), neckP: 13, neckY: 5 * Math.sin(t * 1.7 + 1), jaw: 15 + 4 * br, ears: -30 }); plantAll(); tail(i => Math.sin(t * 5 - i * 0.7) * 0.22, 0.25, dt); }
  /* 換動作時的銜接：0.16 秒內從上一個姿勢滑到新姿勢 */
  if (ctl.bl < 1) { ctl.bl = Math.min(1, ctl.bl + dt / ctl.blDur); const w = ctl.bl * ctl.bl * (3 - 2 * ctl.bl);
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; _q.copy(b.quaternion); b.quaternion.copy(ctl.fromQ[i]).slerp(_q, w); _v.copy(b.position); b.position.copy(ctl.fromP[i]).lerp(_v, w); }
    _v.copy(root.position); root.position.copy(ctl.fromR).lerp(_v, w); _q.copy(root.quaternion); root.quaternion.copy(ctl.fromRq).slerp(_q, w); }
  for (let i = 0; i < bones.length; i++) { ctl.lastQ[i].copy(bones[i].quaternion); ctl.lastP[i].copy(bones[i].position); } ctl.lastR.copy(root.position); ctl.lastRq.copy(root.quaternion);
  root.updateMatrixWorld(true);
  if (mode === 'dead') SEC.reset(); else SEC.apply(dt, mode); }      /* 嚎叫時晃動層照常作用 */
const _q = Q(), _v = V();
return { stage, root, model, update, FIT, RG, SEC, INR, RB, SIZE, LEGS, CL, ctl, get mode() { return ctl.mode; } };
}
/* ---------- 掛進遊戲（測試版專用）----------
   網址加 ?tiger=20：猛虎換成夜鉤猞；?wolf=20：灰狼換成 Meshy 灰狼；?meshy=1：全部都換。不加參數完全不受影響。
   每種生物一份設定：模型檔、專屬動作、姿勢微調、材質飽和度。 */
const SPEC = { tiger: { glb: 'lynx_rig_2k', opt: {}, fx: { sat: 1.25, gam: 0.9 } }, wolf: { glb: 'wolf_rig_2k', opt: { howl: true, prof: { warnY: -0.12, warnP: -5 } }, fx: { sat: 0.95, gain: 1.2, gam: 0.68 } } };
const QS0 = typeof location !== 'undefined' ? location.search : '', ON = {}; for (const k in SPEC) ON[k] = new RegExp('[?&](' + k + '=20|meshy=1)(&|$)').test(QS0);
export const LYNX20 = Object.values(ON).some(Boolean);
const proto = {}, bad = {};
for (const k in SPEC) if (ON[k]) new GLTFLoader().loadAsync('assets/meshy/' + SPEC[k].glb + '.glb').then(g => { proto[k] = g; }).catch(e => { bad[k] = true; console.warn('[lynx20] 載入失敗', k, e && e.message); });
export function lynx20(m, v, dt) {
  const ty = m.type, S = SPEC[ty]; if (!S || !ON[ty] || !proto[ty] || bad[ty]) return;
  let X = m.lx;
  if (!X) { try { X = m.lx = makeRig(SkeletonUtils.clone(proto[ty].scene), Object.assign({ clips: proto[ty].animations }, S.opt)); fixMeshyMaterials(X.stage, S.fx); } catch (e) { bad[ty] = true; console.warn('[lynx20] 建立失敗', ty, e && e.message, e && e.stack); return; }
    const g = m.mesh && m.mesh.geometry, par = m.tilt || m.root; let k = 1;
    /* 大小：和舊模型一樣高（舊模型的世界高度 ÷ 新模型的高度），尾巴長短不影響 */
    if (g) { if (!g.boundingBox) g.computeBoundingBox(); m.root.updateWorldMatrix(true, true); const a = new THREE.Vector3(), b = new THREE.Vector3(); m.mesh.getWorldScale(a); par.getWorldScale(b); k = (g.boundingBox.max.y - g.boundingBox.min.y) * (a.y / (b.y || 1)) / X.SIZE.h || 1; }
    X.k = clamp(k * (S.size || 1), 0.4, 3); X.stage.scale.setScalar(X.k); X.hide = []; m.root.traverse(o => { if (o.isMesh) X.hide.push(o); }); par.add(X.stage); }
  for (const o of X.hide) o.visible = false;
  const sc = m.root.scale.x || 1, act = v.act || m.defAct || {};
  try { X.update({ st: v.st | 0, stT: v.stT || 0, anim: act.anim, wind: act.wind, strike: act.strike, recover: act.recover, shape: v.M && v.M.shape, speed: (v.speed || 0) / sc / X.k, dt });
    setFlash(X.stage, clamp(v.flash || 0, 0, 1), v.ftone); setFade(X.stage, ((v.st | 0) === 6 ? 1 - clamp(((v.stT || 0) - 2.0) / 1.2, 0, 1) : 1) * (m.camFade == null ? 1 : m.camFade));
  } catch (e) { bad[ty] = true; for (const o of X.hide) o.visible = true; X.stage.visible = false; console.warn('[lynx20] 動作出錯，改回舊模型', ty, e && e.message, e && e.stack); }
}
if (typeof window !== 'undefined') window.__lynx20 = { on: LYNX20, ON, ready: () => Object.keys(ON).filter(k => ON[k]).every(k => proto[k]), bad: () => Object.keys(bad).length > 0 };
