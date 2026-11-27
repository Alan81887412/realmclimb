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
  if (!INR.on || !s.on || dt <= 0 || _ip.distanceTo(s.p) > 1.5 * sW) { s.on = true; s.first = true; s.p.copy(_ip); s.yaw = yaw; s.P = s.Pv = s.Y = s.Yv = s.R = s.L = 0; INR.y = INR.pitch = INR.roll = INR.look = 0; INR.dz = 0; INR.vf = 0; return; }
  const vf = ((_ip.x - s.p.x) * _if.x + (_ip.z - s.p.z) * _if.z) / dt / sW; s.p.copy(_ip); let dy = yaw - s.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; s.yaw = yaw; const wy = dy / dt;
  INR.vf = vf; INR.dt = dt; INR.dz = clamp(vf * dt, -0.5, 0.5);      /* 這一格實際往前走了多少（stage 尺度），給腳掌的「釘在地上」用 */
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
  if (M.seg) for (const [k, ids] of [['F', [RB.LF, RB.RF]], ['H', [RB.LH, RB.RH]]]) if (M.seg[k]) for (const ch of ids) M.seg[k].forEach((f, i) => { const b = B(ch[i + 1]); if (b && f) b.position.multiplyScalar(f); });      /* 測試用：改每一節腿骨的長度 */
  if (M.rot) { const X1 = new THREE.Vector3(1, 0, 0), rW = (b, ang) => { const q = new THREE.Quaternion().setFromAxisAngle(X1, ang * Math.PI / 180), wq = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(q), pq = b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true); };
    for (const [k, ids] of [['F', [RB.LF, RB.RF]], ['H', [RB.LH, RB.RH]]]) if (M.rot[k]) for (const ch of ids) M.rot[k].forEach((a, i) => { const b = B(ch[i]); if (b && a) rW(b, a); });      /* 測試用：改站姿（每節腿骨前後轉幾度），模擬站姿比較彎／比較直／彎向不同的骨架 */
    root.updateMatrixWorld(true); let mn = 1e9; const v = new THREE.Vector3(); model.traverse(o => { if (o.isSkinnedMesh) for (let i = 0; i < o.geometry.attributes.position.count; i += 3) { o.getVertexPosition(i, v); mn = Math.min(mn, o.localToWorld(v).y); } }); model.position.y -= mn; }
  root.updateMatrixWorld(true); }
/* 站平（通用）：站姿時前腳和後腳離地高度不一樣的模型（常見：前腳懸空一點點），整隻繞左右軸微微俯仰再上下移，讓四隻腳的腳底都剛好貼地。之後所有動作都以這個「站得平」的姿勢為基準。 */
{ const sk = [], fb = new Map(), low = { F: [], H: [] }, v = new THREE.Vector3(); model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); });
  for (const [k, ids] of [['F', [RB.LF, RB.RF]], ['H', [RB.LH, RB.RH]]]) for (const ch of ids) { const b = B(ch[3]); if (b) b.traverse(o => { if (o.isBone) fb.set(o, k); }); }
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, own = m.skeleton.bones.map(b => fb.get(b));
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const o = own[SI.getComponent(i, k)]; if (!o) continue; m.getVertexPosition(i, v); low[o].push(stage.worldToLocal(m.localToWorld(v.clone())).y); } }
  const q2 = a => { a.sort((x, y) => x - y); return a.length ? a[Math.floor(0.02 * (a.length - 1))] : 0; }, yF = q2(low.F), yH = q2(low.H);
  const zF = (wp(B(RB.LF[3])).z + wp(B(RB.RF[3])).z) / 2, zH = (wp(B(RB.LH[3])).z + wp(B(RB.RH[3])).z) / 2;
  if (low.F.length > 8 && low.H.length > 8 && zF - zH > 0.1 && (Math.abs(yF - yH) > 0.002 || Math.abs(yF + yH) > 0.004)) { const al = clamp(Math.atan2(yF - yH, zF - zH), -0.35, 0.35), X1 = new THREE.Vector3(1, 0, 0);
    model.position.applyAxisAngle(X1, al); model.rotateOnWorldAxis(X1, al); model.position.y -= yH * Math.cos(al) - zH * Math.sin(al); root.updateMatrixWorld(true); } }
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
/* ================= 通用腿解法（第二代，2026-11-25）=================
   原則：一切相對站姿，不假設骨頭的名字、比例或朝向。腿＝三節連桿（s→e→w→h）＋腳掌（h→t）＋腳趾（t 之後）。
   1. 腿長：兩個中間關節沿「站姿本來的彎向」一起折（縮放儀：近端節與遠端節的相對角度不變；Fischer & Blickhan 2006），一維求根，只在單調區間內解。
   2. 腿軸：整條腿以 s 為支點，在身體座標裡用最小旋轉從站姿腿軸轉到目標腿軸（扭轉量＝站姿值，不需要極向量）。
   3. 多餘的那一個自由度 flex：遠端關節額外彎曲（擺盪收腿用；正＝多彎）。
   4. 腳掌：pitch=0 就是站姿建模時的腳掌朝向；每隻腳用自己量到的腳底高度；腳趾可以不跟著腳掌轉（推蹬時貼地）。
   5. 最後一道檢查：腳底取樣點低於地面就把腳往上修正再解一次。
   目標在站姿位置、身體沒動時，解出來就是站姿本身。 */
const LEGX = V(-1, 0, 0), _lean = v => Math.atan2(v.z, -v.y), _la = V(), _lb = V();
const FOLD = 1;
const _ang = [0, 0];
function legAng(L, phi, f) { const ex = FOLD * 25 * D2R, mE = clamp(L.mE0 + phi, L.minE, L.maxE + ex), mW = clamp(L.mW0 + phi + f, L.minW, L.maxW + ex); _ang[0] = L.sE * (mE - L.mE0); _ang[1] = L.sW * (mW - L.mW0); return _ang; }
function legLen(L, phi, f) { const a = legAng(L, phi, f), v0 = L.V0[0], v1 = L.V0[1], v2 = L.V0[2], c1 = Math.cos(a[0]), s1 = Math.sin(a[0]), c2 = Math.cos(a[0] + a[1]), s2 = Math.sin(a[0] + a[1]);      /* 繞身體左右軸（-X）轉 a：y' = y·cos + z·sin，z' = -y·sin + z·cos */
  const x = v0.x + v1.x + v2.x, y = v0.y + v1.y * c1 + v1.z * s1 + v2.y * c2 + v2.z * s2, z = v0.z - v1.y * s1 + v1.z * c1 - v2.y * s2 + v2.z * c2; return Math.sqrt(x * x + y * y + z * z); }
for (const L of LEGS) {
  const P = [L.s, L.e, L.w, L.h, L.t].map(b => wp(b)); L.P0 = P; L.ch = [L.s, L.e, L.w, L.h, L.t];
  L.V0 = [P[1].clone().sub(P[0]), P[2].clone().sub(P[1]), P[3].clone().sub(P[2])];
  const bE = _lean(L.V0[1]) - _lean(L.V0[0]), bW = _lean(L.V0[2]) - _lean(L.V0[1]), TH = 5 * D2R;
  L.sE = Math.abs(bE) > TH ? Math.sign(bE) : (L.kind === 'F' ? 1 : -1); L.sW = Math.abs(bW) > TH ? Math.sign(bW) : -L.sE;      /* 彎向：站姿看得出來就照站姿，幾乎打直時用之字形 */
  L.mE0 = L.sE * bE; L.mW0 = L.sW * bW; L.maxE = Math.max(125 * D2R, L.mE0 + 30 * D2R); L.maxW = Math.max(125 * D2R, L.mW0 + 30 * D2R);      /* 折疊的硬上限（關節內角不小於 30°）。平常折多少由「不碰到自己的大腿」決定，見 solveLeg 的自我閃避 */
  L.minE = Math.min(L.mE0, Math.max(4 * D2R, 0.25 * L.mE0)); L.minW = Math.min(L.mW0, Math.max(2 * D2R, 0.25 * L.mW0));
  /* 單調區間：從站姿往兩邊找，腿長隨 φ 變短的範圍 */
  let lo = 0, hi = 0; const st = 1 * D2R; while (lo > -L.mE0 - L.mW0 && legLen(L, lo - st, 0) > legLen(L, lo, 0) + 1e-7) lo -= st; while (hi < 2.6 && legLen(L, hi + st, 0) < legLen(L, hi, 0) - 1e-7) hi += st;
  L.phiLo = lo; L.phiHi = hi; L.dMax = legLen(L, lo, 0); L.dMin = legLen(L, hi, 0); L.d0 = legLen(L, 0, 0);
  L.ht0 = P[3].clone().sub(P[4]);                                   /* 趾關節→掌根（推蹬時腳掌繞趾關節轉） */
  L.qh0 = GQ(L.h, Q()).clone(); L.qt0 = GQ(L.t, Q()).clone(); L.qp0i = GQ(L.s.parent, Q()).clone().invert();
  L.hy = L.heel0.y; L.sole = []; L.soleY = 0;
  /* 腿長→φ 的反查表（f=0），給肩帶求最佳分配時快速查 */
  { const N = 64; L.tb = new Float32Array(N + 1); for (let i = 0; i <= N; i++) L.tb[i] = legLen(L, lerp(L.phiLo, L.phiHi, i / N), 0); }
  /* 肩帶（只有前腿）：肩胛是靠肌肉掛在胸廓上的，支點 s 可以相對身體小幅滑動（前後 x、往上 u、往下 d；單位＝HREF 尺度）。後腿的髖關節固定在骨盆上，不滑。 */
  L.sl = L.kind === 'F' ? { x: 0.045, u: OPT.slu == null ? 0.022 : OPT.slu, d: 0.02 } : null;
  L.rz0 = P[3].z - P[0].z;      /* 站姿時腳在支點前方多少（肩帶的前後滑動以站姿為零點） */
}
const phiOf = (L, d) => { const T = L.tb, N = T.length - 1; if (d >= T[0]) return L.phiLo; if (d <= T[N]) return L.phiHi; let a = 0, b = N; while (b - a > 1) { const m = (a + b) >> 1; if (T[m] > d) a = m; else b = m; } return lerp(L.phiLo, L.phiHi, (a + (T[a] - d) / Math.max(1e-9, T[a] - T[b])) / N); };
const SL_PR = 18 * D2R, SL_UR = 0.035;      /* 肩帶與關節的分攤：多彎 18° 和 肩胛滑 3.5 公分 算一樣「費力」，取總費力最小的分配（腿越直越靠肩帶，腿本來就彎的多靠關節） */
function slingY(L, sw, tg, flex) { const S = L.sl, dx = tg.x - sw.x, dz = tg.z - sw.z, hy = sw.y - tg.y, off = flex ? L.d0 - legLen(L, 0, flex) : 0, dM = Math.max(L.d0, 0.975 * L.dMax);      /* 伸展上限不能比站姿本身還短（站姿就幾乎打直的腿） */
  const cost = u => { const d = Math.hypot(dx, hy + u, dz) + off, ph = phiOf(L, d), ov = Math.max(0, d - dM); return (ph / SL_PR) ** 2 + (u / SL_UR) ** 2 + (ov / 0.004) ** 2; };
  let a = -S.d, b = S.u; for (let i = 0; i < 16; i++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (cost(m1) < cost(m2)) b = m2; else a = m1; } return (a + b) / 2; }
/* 腳底量測：用骨頭權重挑出每隻腳「腳掌＋腳趾」的外皮頂點，取最低一層當腳底（2% 分位，去掉離群的爪尖），再沿前後取幾個取樣點 */
{ const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const v = V(), acc = new Map(LEGS.map(L => [L, []]));
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones;
    const own = bs.map(b => { for (const L of LEGS) for (let o = b; o && o.isBone; o = o.parent) if (o === L.h) return L; return null; });
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const bi = SI.getComponent(i, k), L = own[bi]; if (!L) continue;
      m.getVertexPosition(i, v); acc.get(L).push({ p: stage.worldToLocal(m.localToWorld(v.clone())), m, i }); } }
  /* 每一節腿的粗細（外皮到骨頭線的距離，取中位數）：之後前後腿互相閃避時當膠囊半徑 */
  { const seg = new Map(), d2s = (p, a, b) => { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
    for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones, own = bs.map(b => { for (const L of LEGS) for (let k = 0; k < 3; k++) if (L.ch[k] === b) return [L, k]; return null; });
      for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const o = own[SI.getComponent(i, k)]; if (!o) continue; m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())), key = o[0].id + o[1]; (seg.get(key) || seg.set(key, []).get(key)).push(d2s(p, o[0].P0[o[1]], o[0].P0[o[1] + 1])); } }
    for (const L of LEGS) L.rad = [0, 1, 2].map(k => { const a = (seg.get(L.id + k) || []).sort((x, y) => x - y); return a.length ? a[Math.floor(0.5 * (a.length - 1))] : 0.06; }); }
  for (const L of LEGS) { L.pw = 0.12; L.tipF = L.l4; L.tipB = 0.03; }
  for (const L of LEGS) { const A = acc.get(L); if (A.length < 8) continue;
    { const xs = A.map(a => a.p.x).sort((a, b) => a - b), zs = A.map(a => a.p.z).sort((a, b) => a - b), q = (a, f) => a[Math.floor(f * (a.length - 1))]; L.pw = q(xs, 0.97) - q(xs, 0.03); L.tipF = q(zs, 0.98) - L.heel0.z; L.tipB = L.heel0.z - q(zs, 0.02); } L.rad = L.rad.map(r => Math.min(r, 0.6 * L.pw)); const ys = A.map(a => a.p.y).sort((a, b) => a - b), y0 = ys[Math.floor(0.02 * (ys.length - 1))];
    L.soleY = y0; L.hy = L.heel0.y - y0;
    /* 腳底取樣點＝整隻腳側面輪廓的「下凸包」：不管腳掌怎麼俯仰，會先碰到地面的一定是這些點（含趾尖、爪尖、掌墊後緣） */
    const pts = A.filter(a => a.p.y >= y0 - 0.004).sort((a, b) => a.p.z - b.p.z || a.p.y - b.p.y), H = [], cr = (o, a, b) => (a.p.z - o.p.z) * (b.p.y - o.p.y) - (a.p.y - o.p.y) * (b.p.z - o.p.z);
    for (const q of pts) { while (H.length >= 2 && cr(H[H.length - 2], H[H.length - 1], q) <= 0) H.pop(); H.push(q); }
    const st = Math.max(1, Math.ceil(H.length / 48)); for (let i = 0; i < H.length; i += st) { const a = i + st >= H.length ? H[H.length - 1] : H[i]; L.sole.push({ m: a.m, i: a.i }); }
    /* 再加腳底最低那一層沿前後均勻取的點（關節附近的皮是幾根骨頭混合的，變形後最低點不一定在凸包上） */
    const low = pts.filter(a => a.p.y <= y0 + 0.015), n = Math.min(14, low.length); for (let i = 0; i < n; i++) { const a = low[Math.round(i * (low.length - 1) / Math.max(1, n - 1))]; L.sole.push({ m: a.m, i: a.i }); } } }
function setW(b, wq) { const pq = GQ(b.parent, Q()).invert(); b.quaternion.copy(pq.multiply(wq)); b.updateMatrixWorld(true); }
function setPaw(L, pitch, toeP, right) { const rq = root.quaternion; setW(L.h, Q().setFromAxisAngle(right, pitch).multiply(rq).multiply(L.qh0)); setW(L.t, Q().setFromAxisAngle(right, toeP).multiply(rq).multiply(L.qt0)); }
const _p2s = (p, a, b) => { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return p.distanceTo(a.addScaledVector(ab, t)); };
const legCaps = L => { const s = wp(L.s), e = wp(L.e), w = wp(L.w), h = wp(L.h), t = wp(L.t); return [{ a: s, b: e, r: L.rad[0] }, { a: e.clone(), b: w, r: L.rad[1] }, { a: w.clone(), b: h, r: L.rad[2] }, { a: h.clone(), b: t.add(t.clone().sub(h).multiplyScalar(0.6)), r: 0.4 * L.pw }]; };
function legPen(L, caps) { const e = wp(L.e), w = wp(L.w), h = wp(L.h), t = wp(L.t), pts = [[e.clone().lerp(w, 0.5), L.rad[1]], [w, L.rad[1]], [w.clone().lerp(h, 0.5), L.rad[2]], [h, L.rad[2]], [h.clone().lerp(t, 0.8), 0.4 * L.pw]]; let mx = 0;
  for (const c of caps) for (const [p, r] of pts) mx = Math.max(mx, 0.7 * (r + c.r) - _p2s(p, c.a.clone(), c.b)); return mx; }
function selfPen(L) { const s0 = wp(L.s), e = wp(L.e), w = wp(L.w), h = wp(L.h), t = wp(L.t), r = L.rad[2]; let mx = 0; for (const p of [w.clone().lerp(h, 0.6), h, h.clone().lerp(t, 0.5)]) mx = Math.max(mx, 0.6 * (r + L.rad[0]) - _p2s(p, s0.clone(), e)); return mx; }
/* 一組外皮取樣點的最低高度（stage 座標）。用真正的蒙皮位置（多根骨頭混合後）量，和畫面上看到的一致。
   為了省時間：第一次用時把每個點的綁定位置與骨頭權重記下來，之後每次只算「用到的那幾根骨頭」的蒙皮矩陣，而且只算 y 那一列。 */
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _vv = V();
function skinMinY(pts) { if (!pts.length) return 1e9; let C = pts._c;
  if (!C) { C = pts._c = { bones: [], rows: null, P: [] }; const id = new Map();
    for (const s of pts) { const g = s.m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = s.m.skeleton; _vv.fromBufferAttribute(g.attributes.position, s.i).applyMatrix4(s.m.bindMatrix); const e = { x: _vv.x, y: _vv.y, z: _vv.z, w: [] };
      for (let k = 0; k < 4; k++) { const wt = SW.getComponent(s.i, k); if (!wt) continue; const bi = SI.getComponent(s.i, k), key = s.m.uuid + ':' + bi; if (!id.has(key)) { id.set(key, C.bones.length); C.bones.push({ m: s.m, b: sk.bones[bi], inv: sk.boneInverses[bi] }); } e.w.push(id.get(key), wt); } C.P.push(e); }
    C.rows = new Float64Array(C.bones.length * 4); }
  const R = C.rows; let lastM = null;
  for (let i = 0; i < C.bones.length; i++) { const B0 = C.bones[i]; if (B0.m !== lastM) { lastM = B0.m; _mA.copy(stage.matrixWorld).invert().multiply(B0.m.matrixWorld).multiply(B0.m.bindMatrixInverse); }
    const e = _mB.multiplyMatrices(_mA, B0.b.matrixWorld).multiply(B0.inv).elements; R[i * 4] = e[1]; R[i * 4 + 1] = e[5]; R[i * 4 + 2] = e[9]; R[i * 4 + 3] = e[13]; }
  let mn = 1e9, at = -1; for (let j = 0; j < C.P.length; j++) { const p = C.P[j]; let y = 0; for (let k = 0; k < p.w.length; k += 2) { const o = p.w[k] * 4; y += p.w[k + 1] * (R[o] * p.x + R[o + 1] * p.y + R[o + 2] * p.z + R[o + 3]); } if (y < mn) { mn = y; at = j; } }
  skinMinY.at = at; return mn; }
const soleMin = L => skinMinY(L.sole);
/* heelW＝腳平貼地面時掌根該在的位置（高度用 HY 當「站在地上」的基準，實際會換成這隻腳自己的高度）；pitch＝腳掌俯仰（0＝站姿，負＝腳尖朝下）；
   flex＝遠端關節額外彎曲（弧度，正＝多彎）；o.pp＝繞趾關節抬腳跟的角度（推蹬）；o.toe＝腳趾跟著腳掌轉的比例（0＝腳趾保持貼地）。 */
function solveLeg(L, heelW, pitch = 0, flex = 0, w = 1, o = {}) {
  const flex0 = flex;      /* 呼叫的人要求的額外彎曲（下面會再加上著地修正；重解時要傳原本的值） */
  const { right } = axes(), rq = root.quaternion, pre = w < 1 ? L.ch.map(b => b.quaternion.clone()) : null, preP = w < 1 ? L.s.position.clone() : null;
  for (const b of L.ch) b.quaternion.copy(rest.get(b).q); L.s.position.copy(rest.get(L.s).p); L.s.updateMatrixWorld(true);
  const tg = heelW.clone(); tg.y += L.hy - HY + (o.up || 0);
  if (o.pp) { const k0 = L.ht0.clone().applyQuaternion(rq); tg.add(k0.clone().applyAxisAngle(right, o.pp)).sub(k0); }
  let sw = wp(L.s), su = 0, sx = 0;
  if (L.sl) { const { fwd } = axes(); sx = L.sl.x * Math.tanh(0.4 * (tg.clone().sub(sw).dot(fwd) - L.rz0) / L.sl.x); sw.addScaledVector(fwd, sx); su = slingY(L, sw, tg, flex); sw.y += su;
    L.s.position.copy(S2B(L.s.parent, sw.clone())); L.s.updateMatrixWorld(true); }
  const dv = tg.clone().sub(sw); let d = dv.length(); const d1 = d;
  /* 踩在地上的腿：最下面那一節（看得到的小腿／前臂）跟著整條腿像鐘擺一樣擺，不因為上面折疊而歪掉——蹲低時腳掌仍在那一節的正下方（狗貓蹲伏的樣子）。
     做法：先當作那一節的方向已知，上面兩節用兩節連桿的封閉解算出該折多少，換算成「遠端額外彎曲」加進去；擺盪中的腿逐漸換回兩個關節一起折。 */
  { const kS = 1 - sm(0.004, 0.06, heelW.y - HY); if (kS > 1e-3 && d1 > 1e-4) { const bq = GQ(L.s.parent, Q()).multiply(L.qp0i).invert(), dB = dv.clone().applyQuaternion(bq), ax0 = L.P0[3].clone().sub(L.P0[0]);
      const al = _lean(dB) - _lean(ax0), wB = dB.clone().sub(L.V0[2].clone().applyAxisAngle(LEGX, al)), p2 = v => Math.hypot(v.y, v.z), l1 = p2(L.V0[0]), l2 = p2(L.V0[1]), D = clamp(p2(wB), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);      /* 都用側面投影算，站姿時才會剛好等於站姿 */
      const mE = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1)), be = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
      const lean2 = _lean(wB) - L.sE * be + L.sE * mE, ph = mE - L.mE0, mW = L.sW * (_lean(L.V0[2]) + al - lean2), fS = mW - L.mW0 - ph; flex += kS * clamp(fS, -1.2, 1.2); } }
  const dm = legLen(L, L.phiLo, flex), dn = legLen(L, L.phiHi, flex), ds = Math.min(dm - 1e-3, Math.max(0.965 * dm, flex ? legLen(L, 0, flex) : L.d0));      /* 軟性上限從站姿長度之後才開始，站姿一定解得回來 */
  if (SOFT && d > ds) d = ds + (dm - ds) * (1 - Math.exp(-(d - ds) / (dm - ds)));
  if (d < dn) {      /* 目標太近、腿折不到那麼短：不要順著方向把腳頂過頭（會頂進地面），改成保持目標的高度、沿前後方向讓出去 */
    const { fwd } = axes(), up = V(0, 1, 0), vy = dv.dot(up), vz = dv.dot(fwd), vx = dv.clone().addScaledVector(up, -vy).addScaledVector(fwd, -vz), r2 = dn * dn - vy * vy - vx.lengthSq();
    if (r2 > 0) { const nz = (vz < 0 ? -1 : 1) * Math.sqrt(r2); dv.addScaledVector(fwd, nz - vz); tg.addScaledVector(fwd, nz - vz); d = dv.length(); } }
  d = clamp(d, Math.min(dn, dm) + 1e-4, dm - 1e-4);
  let lo = L.phiLo, hi = L.phiHi; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (legLen(L, m, flex) > d) lo = m; else hi = m; }
  const phi = (lo + hi) / 2, a = legAng(L, phi, flex).slice(), ax = LEGX.clone().applyQuaternion(GQ(L.s.parent, Q()).multiply(L.qp0i));
  rotW(L.e, ax, a[0]); rotW(L.w, ax, a[1]);
  if (d1 > 1e-6) {      /* 腿軸：先繞彎曲軸（身體的左右軸）轉到位，剩下的側向差再用最小旋轉補；這樣大角度擺動（接近反向）也不會跳軸 */
    const hp = wp(L.h).sub(sw), pa = hp.clone().addScaledVector(ax, -hp.dot(ax)), pb = dv.clone().addScaledVector(ax, -dv.dot(ax));
    if (pa.lengthSq() > 1e-8 && pb.lengthSq() > 1e-8) rotW(L.s, ax, Math.atan2(pa.clone().cross(pb).dot(ax), pa.dot(pb)));
    aim(L.s, L.h, tg); }
  setPaw(L, pitch, pitch * (o.toe == null ? 1 : o.toe), right);
  /* 自我閃避：擺盪收腿時，腳掌／遠端那一節如果貼進自己最上面那一節（大腿、肩胛）的肉裡，就把「額外彎曲」退回一些（那是多餘的自由度，本來就可以讓）。有鬆弛、沒變好不接受。 */
  if (!o.sf && flex0 > 0 && heelW.y - HY > 0.004) { let pen = selfPen(L);
    if (pen > 1e-4) { const o2 = Object.assign({}, o, { sf: 1, ng: 9, avd: 1 }); let f2 = flex0, step = Math.min(0.5, 0.7 * pen / Math.max(0.05, L.l3));
      for (let i = 0; i < 4 && pen > 1e-4 && step > 0.01 && f2 > -0.3; i++) { const f3 = Math.max(-0.3, f2 - step); solveLeg(L, heelW, pitch, f3, w, o2); const p2 = selfPen(L); if (p2 < pen) { f2 = f3; pen = p2; step = Math.min(0.5, 0.7 * pen / Math.max(0.05, L.l3)); } else step *= 0.5; }
      return solveLeg(L, heelW, pitch, f2, w, Object.assign({}, o, { sf: 1 })); } }
  /* 閃避（o.av＝別條腿的膠囊）：擺盪中的腿如果會撞進別條腿，就把這隻腳的目標順著前後方向挪開再解。
     每一步只挪「穿入深度」的一部分（鬆弛），而且挪完穿入量沒有變小就不接受、改用一半的步長（不會越修越糟、也不會來回震盪）；著地的腳不挪。 */
  if (o.av && !o.avd && heelW.y - HY > 0.004) { let pen = legPen(L, o.av);
    if (pen > 1e-4) { const k = sm(0.004, 0.05, heelW.y - HY), dir = axes().fwd.multiplyScalar(L.kind === 'F' ? 1 : -1), o2 = Object.assign({}, o, { avd: 1, ng: 9 }); let sh = 0, step = 1.05 * pen * k;
      for (let i = 0; i < 4 && pen > 1e-4 && step > 5e-4; i++) { const s2 = Math.min(0.18, sh + step); solveLeg(L, heelW.clone().addScaledVector(dir, s2), pitch, flex0, w, o2); const p2 = legPen(L, o.av);
        if (p2 < pen) { sh = s2; pen = p2; step = 1.05 * pen * k; } else step *= 0.5; }
      return solveLeg(L, heelW.clone().addScaledVector(dir, sh), pitch, flex0, w, Object.assign({}, o, { avd: 1 })); } }
  if (pre) { L.ch.forEach((b, i) => { const q = b.quaternion.clone(); b.quaternion.copy(pre[i]).slerp(q, w); }); const p1 = L.s.position.clone(); L.s.position.copy(preP).lerp(p1, w); L.s.updateMatrixWorld(true); }
  if ((o.ng || 0) < 2 && L.sole.length && heelW.y - HY < 0.2) { const mn = soleMin(L);      /* 離地不高時才需要量；最多修兩輪 */ const lift = heelW.y - HY, cl = lift > 0.004 ? Math.min(0.018, 0.5 * lift) : 0;      /* 擺盪中的腳：整個腳底（含爪尖）最低點至少離地「抬腳高度的一半、最多 1.8 公分」，爪尖不會貼著地拖 */ if (mn < cl - 0.002) return solveLeg(L, heelW, pitch, flex0, w, Object.assign({}, o, { up: (o.up || 0) + cl - mn, ng: (o.ng || 0) + 1 })); }
  L.dbg = { r: +(d1 / dm).toFixed(3), phi: +(phi / D2R).toFixed(1), fl: +(flex / D2R).toFixed(1), pi: +(pitch / D2R).toFixed(1), up: +(o.up || 0).toFixed(4),  sx: +sx.toFixed(4), su: +su.toFixed(4), err: +wp(L.h).distanceTo(tg).toFixed(4) };
}
// 尾巴：逐節延遲的擺動＋下垂
const TAIL = RB.tail.map(B).filter(Boolean);
const tailSpring = { yaw: TAIL.map(() => 0), v: TAIL.map(() => 0) };
const TAILR = (() => { if (TAIL.length < 2) return { al: 1.4, S: 1 }; const a = wp(TAIL[0]), b = wp(TAIL[TAIL.length - 1]); let S = 0; TAIL.forEach((_, i) => S += 0.5 + 0.5 * i / TAIL.length); return { al: Math.max(0.08, 75 * D2R - Math.atan2(a.y - b.y, Math.hypot(b.z - a.z, b.x - a.x))), S }; })();
function tail(sway, droop, dt, bodyYawRate = 0) {
  const { up, right } = axes(); if (droop > 0) { const ch = 0.5 * TAILR.S * droop, al = TAILR.al, k0 = 0.7 * al; if (ch > k0) droop *= (k0 + 0.3 * al * (1 - Math.exp(-(ch - k0) / (0.3 * al)))) / ch; }      /* 尾巴整體最多垂到水平線下 75°（依這副骨架站姿的尾巴角度換算），不會被壓成直直往下 */
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
// 一隻腳在步態循環 p（0~1）的計畫：著地期往後推、最後 28% 腳跟離地（繞趾關節滾、腳趾貼地），擺盪期收腿往前；所有量前後連續。
// 著地期腿怎麼擺不用寫：整條腿繞 s 像鐘擺一樣轉就是了（由 solveLeg 的幾何決定），這裡只給腳的位置、腳掌俯仰、擺盪期多收多少。
function footPlan(L, p, G, Sx) { const F = L.kind === 'F', c = L.cz || 0, P = (F ? 34 : 22) * D2R;
  let dz, y, pitch, flex, pp, toe;
  if (p < G.duty) { const u = p / G.duty, a = P * sm(0.72, 1, u); dz = c + Sx * (0.5 - u); y = HY; pitch = -a; pp = -a; flex = 0; toe = 0; }
  else { const u = (p - G.duty) / (1 - G.duty), e = u * u * (3 - 2 * u), lf = F ? G.liftF : G.liftH, k = 1 - sm(0, 0.45, u);
    // 擺盪期前後位置用 Hermite 曲線：起點與終點的速度都接上著地期（腳先順勢往後再甩到前面），不會有急轉
    const m = -(1 - G.duty) / G.duty, u2 = u * u, u3 = u2 * u, H = (2 * u3 - 3 * u2 + 1) * -0.5 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * 0.5 + (u3 - u2) * m;
    dz = c + Sx * H; y = HY + lf * Math.sin(Math.PI * Math.pow(u, F ? 0.9 : 0.8)) ** 2;
    const b2 = Math.sin(Math.PI * u) ** 2; pitch = -P * (1 - e) - (F ? 38 : 22) * D2R * b2; pp = -P * k; flex = (F ? 30 : 30) * D2R * b2; toe = sm(0, 0.15, u); }
  return { dz, y, pitch, flex, pp, toe }; }
// 步幅：以通過驗收的夜鉤猞為準（HREF 尺度，等於腿擺動的角度：走 ±17°、小跑 ±18°、奔跑 ±22°），再受「腿伸得到的範圍」限制（腿短的自動變小、不會被拉到打直）
GAITS.walk.S = 0.40; GAITS.trot.S = 0.435; GAITS.gallop.S = 0.545;
// 走跑時的落腳中心左右對稱（站姿左右腳不對稱的模型，走起來才不會一跛一跛）；站著不動時仍用各自的站姿位置
for (const L of LEGS) { const M = LEGS.find(o => o.kind === L.kind && o !== L); L.ga = V(L.side * (Math.abs(L.anchor.x) + Math.abs(M.anchor.x)) / 2, 0, (L.anchor.z + M.anchor.z) / 2); L.gs = V(L.side * (Math.abs(L.P0[0].x) + Math.abs(M.P0[0].x)) / 2, (L.P0[0].y + M.P0[0].y) / 2, (L.P0[0].z + M.P0[0].z) / 2); }
function fitStride(G) { const out = {};
  for (const L of LEGS) { const sp = L.gs, ok = [], S = L.sl;
    for (let dz = -0.7; dz <= 0.7001; dz += 0.01) { const rz = L.ga.z + dz - sp.z, ux = S ? S.x * Math.tanh(0.4 * (rz - L.rz0) / S.x) : 0, d = Math.hypot(sp.y - G.crouch - (S ? 0.5 * S.d : 0) - L.hy, rz - ux, L.ga.x - sp.x); if (d <= Math.max(L.d0, 0.975 * L.dMax) && d >= 1.03 * L.dMin) ok.push(dz); }
    out[L.id] = ok.length ? [ok[0], ok[ok.length - 1]] : [0, 0]; }
  return out; }
const curve = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], e)) : lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
function poseBody({ y = 0, pitch = 0, roll = 0, yaw = 0, chest = 0, neckP = 0, neckY = 0, jaw = 0, ears = 0 }) {
  const { fwd, right, up } = axes(); root.position.y = y + INR.y; root.updateMatrixWorld(true);
  rotW(HEAD.hips, right, (pitch + INR.pitch) * D2R); rotW(HEAD.hips, fwd, (roll + INR.roll) * D2R); rotW(HEAD.hips, up, yaw * D2R); rotW(HEAD.chest, right, chest * D2R);
  rotW(HEAD.neck, right, neckP * D2R); rotW(HEAD.neck, up, (neckY + INR.look) * D2R); if (HEAD.jaw) rotW(HEAD.jaw, right, -jaw * D2R);
  if (HEAD.earL) { rotW(HEAD.earL, fwd, ears * D2R); rotW(HEAD.earR, fwd, -ears * D2R); }
  bodyFloor();
}
/* 蹲多低由骨架自己決定：(1) 每條腿從最上面的關節到「遠端那一節上端」的距離，不能短於上面兩節折到關節上限時的長度（否則遠端那一節只能躺平，看起來像趴著）；
   (2) 軀幹外皮最低點至少離地 2.5 公分。不夠就把整個身體抬高到剛好夠（連續，不會跳）。 */
let TORSOG = null; const BF = { up: 0, mn: 0, need: 0, m: (typeof location !== 'undefined' && /[?&]bfm=([-\d.]+)/.test(location.search)) ? +RegExp.$1 : 6, on: !(typeof location !== 'undefined' && /[?&]bf=0/.test(location.search)) };
function torsoPts() { if (TORSOG) return TORSOG; const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const v = V(), A = [], under = (b, r) => { for (let o = b; o && o.isBone; o = o.parent) if (o === r) return true; return false; };
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones, skip = bs.map(b => LEGS.some(L => under(b, L.s)) || (TAIL[0] && under(b, TAIL[0])) || (HEAD.head && under(b, HEAD.head)));
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; if (skip[SI.getComponent(i, k)]) continue; m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())); A.push({ m, i, y: p.y, z: p.z }); } }
  if (!A.length) return (TORSOG = []); let z0 = 1e9, z1 = -1e9; for (const a of A) { z0 = Math.min(z0, a.z); z1 = Math.max(z1, a.z); } const N = 16, bins = new Array(N).fill(null);
  for (const a of A) { const k = Math.min(N - 1, Math.floor((a.z - z0) / Math.max(1e-6, z1 - z0) * N)); if (!bins[k] || a.y < bins[k].y) bins[k] = a; } return (TORSOG = bins.filter(Boolean)); }
function bodyFloor() { if (!BF.on) return; const p2 = v => Math.hypot(v.y, v.z); let need = 0;
  for (const L of LEGS) { if (L.cDm == null) { const l1 = p2(L.V0[0]), l2 = p2(L.V0[1]); L.cDm = Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - L.maxE - BF.m * D2R))); L.cW = L.P0[2].clone().sub(L.P0[3]); }
    const s = wp(L.s), wT = toWorld(V(L.anchor.x, 0, L.anchor.z)); wT.y = L.P0[3].y; wT.add(L.cW.clone().applyQuaternion(root.quaternion)); const dy = s.y - wT.y, dz = s.clone().sub(wT).dot(axes().fwd), r2 = L.cDm * L.cDm - dz * dz; if (r2 > 0) need = Math.max(need, Math.sqrt(r2) - dy); }
  const T = torsoPts(); let mn = 1; if (T.length) { mn = skinMinY(T); need = Math.max(need, 0.025 - mn); }
  BF.mn = mn; BF.need = need; BF.up = Math.max(0, need); if (BF.up > 1e-5) { root.position.y += BF.up; root.updateMatrixWorld(true); } }
// 腳：planted＝固定在世界座標（第一次著地時記下），否則跟身體走
const _FCR = { LF: 0, RH: 1, RF: 2, LH: 3 };
function footC(L, st0, { off = [0, 0, 0], planted = true, pitch = 0, slant = 0, lock = true }) {
  const fx = L.kind === 'F' ? -slant : slant;
  if (!planted) { st0.pin[L.id] = null; solveLeg(L, toWorld(V(L.anchor.x + off[0], HY + off[1], L.anchor.z + off[2])), pitch, fx); return; }
  if (!st0.pin[L.id]) st0.pin[L.id] = toWorld(V(L.anchor.x + off[0], HY, L.anchor.z + off[2])); const pn = st0.pin[L.id], p = pn.clone(); p.y = HY + off[1];
  if (lock && INR.on) { const dz = INR.dz || 0, dt = INR.dt || 0.0167, pins = st0.pin, th = Math.abs(dz) > 1e-4 ? 0.14 : 0.03; pn._d = (pn._d || 0) + dz;
    if (!pn._on && Math.abs(pn._d) > th) { let go = true; for (const id in pins) { const q = pins[id]; if (!q || q === pn) continue; if (q._on || (Math.abs(q._d || 0) > th && _FCR[id] < _FCR[L.id])) { go = false; break; } } if (go) { pn._on = 1; pn._p = 0; pn._d0 = pn._d; } }
    if (pn._on) { pn._p += dt / (0.12 + 0.2 * Math.min(0.4, Math.abs(pn._d0))); const u = Math.min(1, pn._p); p.addScaledVector(axes().fwd, -pn._d * (1 - sm(0, 1, u))); p.y += (0.035 + 0.1 * Math.min(0.4, Math.abs(pn._d0))) * Math.sin(Math.PI * u) * Math.min(1, Math.abs(pn._d0) / 0.06); if (u >= 1) { pn._on = 0; pn._d = 0; } }
    else if (pn._d) p.addScaledVector(axes().fwd, -pn._d); }
  if (pn._g) { L.tgN = ctl.fc; L.tgP = p.clone(); L.tgA = [pitch, fx]; L.tgO = null; }      /* 換招式時本來就踩在地上的腳：混合完再照這個目標重解一次（見 update 結尾），混合期間不會被身體拖著滑 */
  solveLeg(L, p, pitch, fx);
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
/* 伸前腳（空中或撐地都可以）：位置交給通用腿解法（依這副骨架站姿的彎法折，任何方向都連續），垂腕換成「遠端多彎一點」，腳掌角度照舊相對前臂給 */
function reachLeg(L, P, { droop = 0, paw = null, air = 0 } = {}) { const q = P.clone();
  if (paw != null) { q.y += L.hy - HY; headClear(q, 0.5 * L.pw); q.y -= L.hy - HY; }
  solveLeg(L, q, 0, 0.8 * droop * D2R, 1, {});
  if (paw != null && air > 1e-3) { const { right } = axes(), q0 = L.h.quaternion.clone(), hw = wp(L.h), md = hw.clone().sub(wp(L.w)).normalize(), td = md.applyAxisAngle(right, paw * D2R); aim(L.h, L.t, hw.addScaledVector(td, L.l4)); const q1 = L.h.quaternion.clone(); L.h.quaternion.copy(q0).slerp(q1, Math.min(1, 3 * air)); L.h.updateMatrixWorld(true); } }
/* 頭的外形：站姿量一次（頭骨自己的座標，不含耳朵），當成一顆橢球；空中的前腳目標點如果落在裡面，沿橢球中心往外推到表面（連續、不跳） */
let HBOX = null;
function headBox() { if (HBOX) return HBOX; const hb = HEAD.head; if (!hb) return (HBOX = { ok: false }); const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const v = V(), inv = hb.matrixWorld.clone().invert(), mn = V(1e9, 1e9, 1e9), mx = V(-1e9, -1e9, -1e9); let n = 0;
  const under = (b, r) => { for (let o = b; o && o.isBone; o = o.parent) if (o === r) return true; return false; };
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones, own = bs.map(b => under(b, hb) && !(HEAD.earL && under(b, HEAD.earL)) && !(HEAD.earR && under(b, HEAD.earR)));
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; if (!own[SI.getComponent(i, k)] || SW.getComponent(i, k) < 0.6) continue; m.getVertexPosition(i, v); m.localToWorld(v).applyMatrix4(inv); mn.min(v); mx.max(v); n++; } }
  const ws = V(); stage.getWorldScale(ws); const ks = V().setFromMatrixColumn(hb.matrixWorld, 0).length() / (ws.x || 1);
  return (HBOX = { ok: n > 20, c: mn.clone().add(mx).multiplyScalar(0.5), a: mx.clone().sub(mn).multiplyScalar(0.5), ks }); }
function headClear(p, r) { const H = headBox(); if (!H.ok) return; const hb = HEAD.head, q = hb.worldToLocal(stage.localToWorld(p.clone())).sub(H.c), m = r / H.ks, ax = H.a.x + m, ay = H.a.y + m, az = H.a.z + m;
  const d = Math.sqrt((q.x / ax) ** 2 + (q.y / ay) ** 2 + (q.z / az) ** 2); if (d >= 1 || d < 1e-4) return; q.multiplyScalar(1 / d).add(H.c); p.copy(stage.worldToLocal(hb.localToWorld(q))); }
headBox();
function solveArm(L, paw0, { droop = 0, paw = null, out = 0.3, upP = 0 } = {}, _g = 0) { const pawW = paw0.clone(); pawW.y += L.hy - HY; if (paw != null) headClear(pawW, 0.5 * L.pw); L.s.position.copy(rest.get(L.s).p); L.s.updateMatrixWorld(true);      /* 高度基準換成這隻腳自己的；空中的腳不伸進頭裡；肩胛先回原位（重解時才不會重複滑動） */
  const { fwd, right, up } = axes(), side = right.clone().multiplyScalar(-L.side);
  if (SCAP) { const sw0 = wp(L.s), rel = pawW.clone().sub(sw0), sl = Math.max(-SCAP, Math.min(SCAP, 0.3 * rel.dot(fwd))), so = Math.max(-0.03, Math.min(0.03, 0.2 * rel.dot(side)));
    L.s.position.copy(S2B(L.s.parent, sw0.addScaledVector(fwd, sl).addScaledVector(side, so))); L.s.updateMatrixWorld(true); }
  const sw = wp(L.s), n = pawW.clone().sub(sw).normalize(), m = n.clone().applyAxisAngle(right, (OPT.dr0 ? -1 : L.sW) * droop * D2R), wT = pawW.clone().addScaledVector(m, -L.l3);
  const _dS = wT.clone().sub(sw), _th = Math.atan2(_dS.dot(fwd), -_dS.dot(up)), pole = fwd.clone().multiplyScalar(-L.sE * Math.cos(_th)).addScaledVector(up, -L.sE * Math.sin(_th) + upP).addScaledVector(side, out);      /* 彎曲方向＝站姿的彎向跟著腿一起轉，任何伸展方向都連續 */
  const eT = twoBone(sw, wT, L.l1, L.l2, pole); aim(L.s, L.e, eT); aim(L.e, L.w, wT); aim(L.w, L.h, pawW);
  if (paw == null) setPaw(L, 0, 0, right); else { const hw = wp(L.h), md = hw.clone().sub(wp(L.w)).normalize(), td = md.applyAxisAngle(right, paw * D2R); aim(L.h, L.t, hw.addScaledVector(td, L.l4)); }      /* 沒指定腳掌角度＝撐在地上的腳：腳底平貼（站姿朝向） */
  if (_g < 2 && pawW.y - HY < 0.2) { const mn = soleMin(L); if (mn < -0.002) { const p2 = paw0.clone(); p2.y -= mn; return solveArm(L, p2, { droop, paw, out, upP }, _g + 1); } }
}
const LF = LEGS.find(L => L.id === 'LF'), RF = LEGS.find(L => L.id === 'RF');

// ---- 撲咬 ----
modes.Dpounce = { init() { SOFT = true; SCAP = 0.045; this.T = 2.0; this.D = 1.75; this.sp = { neck: new Spr(320, 20), chest: new Spr(380, 26), tail: new Spr(120, 12), ear: new Spr(600, 13) }; this.pin = {};
    this.zk = [[0, 0], [0.30, -0.10, 's'], [0.42, 0, 'q'], [1.2, 0, 's']]; this.G = {}; },
  step(dt) { const tr = this.tIn; if (this.fresh || !this.G.LF) { this.fresh = false; this.pin = {}; this.lk = 0; this.lf = {}; this.ld = {}; this.tlE = 0; root.position.set(0, 0, 0); this.base = 0; resetPose(); root.updateMatrixWorld(true); root.updateMatrixWorld(true);
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
    const tl = this.tlE || 0.40, tdn = 0.78, zl = kf(this.zk, tl), zd = kf(this.zk, tdn), hAir = t > tl && t < tdn;
    const hOff = hAir ? kf([[tl, [0, 0, -zl]], [0.52, [0, 0.20, -0.46], 's'], [0.66, [0, 0.16, -0.05], 's'], [tdn, [0, 0, D - zd], 'q']], t) : [0, 0, t >= tdn ? D - z : 0];
    /* 蹬地：出招時遊戲會把整隻往前推，後腳還踩在地上的那幾格把落腳點往後補回實際走掉的距離（腳釘在世界座標，腿被拉直後自然離地）；離地後這段偏移很快收掉 */
    if (!hAir && t < tl) { let ex = 0; for (const L of LEGS) if (L.kind === 'H' && this.pin[L.id]) { const pp = this.pin[L.id].clone(); pp.y = L.hy; ex = Math.max(ex, wp(L.s).distanceTo(pp) / L.dMax); } if (ex > 0.93 && (this.lk || 0) > 0.02 && !this.tlE) this.tlE = t; const d = this.tlE ? 0 : Math.max(0, Math.min(0.45 - (this.lk || 0), INR.dz || 0)); this.lk = (this.lk || 0) + d; for (const L of LEGS) if (L.kind === 'H' && this.pin[L.id]) this.pin[L.id].z -= d; }
    const hO2 = [hOff[0], hOff[1], hOff[2] - (hAir ? (this.lk || 0) * (1 - sm(tl, 0.52, t)) : 0)];      /* 離地後腳先被身體帶著走，再平順接回原本的收腳曲線 */
    /* 落地：腳著地後如果遊戲還在把整隻往前推，落腳點同樣往後補（腳釘在世界座標、身體從腳上方過去）；推完後四隻腳照對角順序各小跨一步回到站位（只有抬起來的那隻在動，不會滑） */
    const LD = this.ld || (this.ld = {}), dzp = Math.max(0, INR.dz || 0), land = (id, on, k) => { const s = LD[id] || (LD[id] = { d: 0, q: 0 }); if (!on) { s.d = 0; s.q = 0; s.pz = null; return [0, 0]; } if (dzp > 1e-4 && s.q <= 0) s.d = Math.min(0.3, s.d + dzp); else s.q += dt; const p = sm(0, 1, clamp((s.q - 0.05 - 0.09 * k) / 0.13, 0, 1)); return [s.d * (1 - p), 0.035 * Math.sin(Math.PI * p) * Math.min(1, s.d / 0.05)]; };
    this._land = land;
    for (const L of LEGS) if (L.kind === 'H') { const [bz, by] = land(L.id, !hAir && t >= tdn, L.side > 0 ? 3 : 1); if (!hAir && t >= tdn) { if (!this.pin[L.id]) this.pin[L.id] = toWorld(V(L.anchor.x + hO2[0], HY, L.anchor.z + hO2[2])); const s = LD[L.id]; if (s.pz == null) s.pz = this.pin[L.id].z; this.pin[L.id].z = s.pz - bz; s.by = by; } }
    for (const L of LEGS) if (L.kind === 'H') footC(L, this, { lock: false, off: [hO2[0], hAir || t < tdn ? hO2[1] : (LD[L.id].by || 0), hO2[2]], planted: !hAir, pitch: hAir ? -0.5 * Math.sin(Math.PI * (t - tl) / (tdn - tl)) : 0, slant: hAir ? kf([[tl, -0.25], [0.52, -0.9, 's'], [tdn, 0.1, 's']], t) : 0 });
    // 前腳：先收到胸前、再往前伸、掌張開，落地後肘自然吸震（左腳稍微領先，不要完全對稱）
    const { fwd, right, up } = axes();
    for (const L of [LF, RF]) { const lag = L.side > 0 ? 0 : 0.03, a0 = 0.35 + lag, a1 = 0.66 + lag * 0.4, Gs = this.G[L.id], G1 = Gs.clone().addScaledVector(fwd, D); this.lf = this.lf || {}; if (t <= a0) this.lf[L.id] = Math.min(0.3, (this.lf[L.id] || 0) + Math.max(0, INR.dz || 0)); const G0 = Gs.clone().addScaledVector(fwd, -(this.lf[L.id] || 0));
      if (t < a1) this._land(L.id, false, 0); if (t <= a0) reachLeg(L, G0);
      else if (t >= a1) { const [bz, by] = this._land(L.id, true, L.side > 0 ? 2 : 0); reachLeg(L, G1.clone().addScaledVector(fwd, -bz).addScaledVector(up, by)); }
      else { const a = (t - a0) / (a1 - a0), S = wp(L.s), side = right.clone().multiplyScalar(-L.side);
        const tuck = S.clone().addScaledVector(fwd, 0.06).addScaledVector(up, -0.40).addScaledVector(side, 0.02), reach = S.clone().addScaledVector(fwd, 0.46).addScaledVector(up, -0.20).addScaledVector(side, 0.05);
        const P = crom([G0, tuck, reach, G1], kf([[0, 0], [0.26, 1, 'o'], [0.70, 2, 's'], [1, 3, 'q']], a));
        reachLeg(L, P, { droop: kf([[0, 0], [0.26, 38, 'o'], [0.70, -8, 's'], [1, 0, 'q']], a), paw: kf([[0, 90], [0.26, 55, 'o'], [0.70, 30, 's'], [1, 90, 'q']], a), air: Math.sin(Math.PI * a) }); } }
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
const FIX2 = !(typeof location !== 'undefined' && /[?&]fix2=0/.test(location.search));
const FIX3 = !(typeof location !== 'undefined' && /[?&]fix3=0/.test(location.search));      /* fix3=0：關掉第三代新增的規則（肩膀與鬃毛交界；對照用） */      /* fix2=0：關掉第二代新增的規則（對照用） */
/* ---------- 蒙皮權重修正（通用，載入模型時自動做一次）----------
   Meshy 自動綁骨的權重不能直接用：頭附近的毛會被前腿扯、肩背整片跟著上臂轉、有些頂點掛在不會動的根骨上，
   肚子與側腹的皮被前後腿的骨頭遠遠地拉著（腿一擺，側腹就被前後兩邊扯開）。
   做法：沿模型表面量距離，分出「頭」和「身體」；頭（含垂下來的頰毛、頸毛）整塊跟頭骨；
   頭和前腿之間一定隔一圈只跟胸骨的緩衝帶（頭的毛和腿的皮不能直接相鄰，不然腿一擺就撕開）；
   肩關節上方的皮還給胸骨；腿骨只能影響自己附近的皮，離腿骨遠的（側腹、肚子、臀背）還給脊椎；
   最後把權重抹勻：沿表面抹一次，再照「空間上靠近」抹一次（重疊的毛片要一起動）。
   部位一律用骨架上下層關係（LEGS／HEAD）認，不看骨頭名字；尺寸都以腿長（HREF）為單位，換生物不用改。
   實作：先把貼圖接縫拆開的頂點焊起來，權重攤成「焊接點 × 骨頭」的表，全部在表上算，最後每點取最大的 4 根骨頭寫回去。 */
(() => { const __t0 = performance.now(); resetPose(); root.updateMatrixWorld(true);
  const PRM = Object.assign({
    legA: 1.0, legB: 3.4,          /* 腿骨的影響範圍＝這一節腿本身的粗細（從模型量）的倍數：離骨頭 legA×粗細 以內照舊，到 legB×粗細 歸零 */
    midA: 0, midB: 1.2,                        /* 腿骨的影響不過身體中線：中線上歸零，往外側漸增，到 midB×（腿骨離中線的距離）才照舊；只管「軀幹底」以上（腿本身不受影響） */
    wideH: 0.07, wideIt: 1, wide: 1, trunk: 1, compact: 1,
    wideG0: 0.06, wideG1: 0.20,      /* 第三代（肩膀與鬃毛交界）：軀幹的大範圍空間抹勻往頭的方向延伸到哪裡——沿表面離「頭的範圍」wideG0 以內不抹、wideG1 以外全抹（第二代是 0.20～0.40，肩膀前緣剛好被排除在外） */
    bufR0: 0.04, bufR1: 0, bufEnd: 0,      /* 第三代試過、預設關閉（bufR1=0）：緩衝帶往「空間上貼著它的皮」擴張。單獨用只修掉一半、斜前方反而變多；和上面那條一起用與只用上面那條差不多，所以不開 */      /* 軀幹的大範圍空間抹勻：格點大小、格點再抹幾次、強度 */
  }, (typeof globalThis !== 'undefined' && globalThis.__SKP) || {});
  const sub = b => { const s = new Set(); if (b) b.traverse(o => { if (o.isBone) s.add(o); }); return s; };
  const headS = sub(HEAD.head), earS = new Set([...sub(HEAD.earL), ...sub(HEAD.earR)]), flS = new Set([...sub(LEGS[0].s), ...sub(LEGS[1].s)]);
  const LOG = []; let __tl = __t0; const lap = k => { const t = performance.now(); LOG.push(k + ' ' + (t - __tl).toFixed(0)); __tl = t; };
  for (const m of SK) { if (m.geometry.userData.fix20) continue; m.geometry.userData.fix20 = 1;
    const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = m.skeleton.bones, NB = bones.length, N = g.attributes.position.count, idx = g.index.array;
    const bi = b => b ? bones.indexOf(b) : -1;
    const isHeadB = bones.map(b => headS.has(b) && !earS.has(b)), isEar = bones.map(b => earS.has(b)), isFL = bones.map(b => flS.has(b)), isClav = bones.map(b => b === LEGS[0].s || b === LEGS[1].s);
    const iHead = bi(HEAD.head), iHips = bi(HEAD.hips), iRoot = bi(HEAD.rootB), iChest = bi(HEAD.chest);
    const shL = toLocal(wp(LEGS[0].s)), hdL = toLocal(wp(HEAD.head)), earY = HEAD.earL ? toLocal(wp(HEAD.earL)).y : 1e9;
    /* ---- 站姿下每個頂點的位置（野獸自己的座標：y 上、z 前）。有變形目標的模型走慢路徑 ---- */
    const PX = new Float64Array(N), PY = new Float64Array(N), PZ = new Float64Array(N);
    if (g.morphAttributes && g.morphAttributes.position && g.morphAttributes.position.length) { const v = V(); for (let i = 0; i < N; i++) { m.getVertexPosition(i, v); const p = toLocal(stage.worldToLocal(m.localToWorld(v))); PX[i] = p.x; PY[i] = p.y; PZ[i] = p.z; } }
    else { root.updateMatrix(); const base = new THREE.Matrix4().copy(root.matrix).invert().multiply(new THREE.Matrix4().copy(stage.matrixWorld).invert()).multiply(m.matrixWorld).multiply(m.bindMatrixInverse), t = new THREE.Matrix4();
      const E = new Float64Array(NB * 12); bones.forEach((b, k) => { t.copy(base).multiply(b.matrixWorld).multiply(m.skeleton.boneInverses[k]).multiply(m.bindMatrix); const e = t.elements; E.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], k * 12); });
      const PA = g.attributes.position; for (let i = 0; i < N; i++) { const x = PA.getX(i), y = PA.getY(i), z = PA.getZ(i); let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w === 0) continue; const o = SI.getComponent(i, k) * 12; X += w * (E[o] * x + E[o + 1] * y + E[o + 2] * z + E[o + 3]); Y += w * (E[o + 4] * x + E[o + 5] * y + E[o + 6] * z + E[o + 7]); Z += w * (E[o + 8] * x + E[o + 9] * y + E[o + 10] * z + E[o + 11]); }
        PX[i] = X; PY[i] = Y; PZ[i] = Z; } }
    lap('pos');
    /* ---- 焊接重複頂點（貼圖接縫會把同一點拆成好幾個） ---- */
    const key = new Map(), wid = new Int32Array(N); let nw = 0;
    for (let i = 0; i < N; i++) { const k = ((Math.round(PX[i] * 2000) + 8192) * 16384 + (Math.round(PY[i] * 2000) + 8192)) * 16384 + (Math.round(PZ[i] * 2000) + 8192); let w = key.get(k); if (w === undefined) { w = nw++; key.set(k, w); } wid[i] = w; }
    const rep = new Int32Array(nw).fill(-1); for (let i = 0; i < N; i++) if (rep[wid[i]] < 0) rep[wid[i]] = i;
    const WX = new Float64Array(nw), WY = new Float64Array(nw), WZ = new Float64Array(nw); for (let n = 0; n < nw; n++) { const i = rep[n]; WX[n] = PX[i]; WY[n] = PY[i]; WZ[n] = PZ[i]; }
    lap('weld');
    /* 相鄰表（每個三角形的邊各記一次） */
    const deg = new Int32Array(nw + 1); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const p = wid[idx[t + e]], q = wid[idx[t + (e + 1) % 3]]; if (p !== q) { deg[p + 1]++; deg[q + 1]++; } }
    for (let n = 0; n < nw; n++) deg[n + 1] += deg[n]; const A0 = deg, AN = new Int32Array(A0[nw]), AD = new Float64Array(A0[nw]), fill = new Int32Array(nw);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const p = wid[idx[t + e]], q = wid[idx[t + (e + 1) % 3]]; if (p !== q) { const ex = WX[p] - WX[q], ey = WY[p] - WY[q], ez = WZ[p] - WZ[q], d = Math.sqrt(ex * ex + ey * ey + ez * ez); let o = A0[p] + fill[p]++; AN[o] = q; AD[o] = d; o = A0[q] + fill[q]++; AN[o] = p; AD[o] = d; } }
    lap('adj');
    /* 沿表面量距離（Dijkstra，二元堆積放在定型陣列裡） */
    const HD = new Float64Array(AN.length + nw + 1), HN = new Int32Array(AN.length + nw + 1);
    const dij = seed => { const D = new Float64Array(nw).fill(1e9); let hs = 0;
      const push = (d, n) => { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (HD[p] <= d) break; HD[i] = HD[p]; HN[i] = HN[p]; i = p; } HD[i] = d; HN[i] = n; };
      for (let n = 0; n < nw; n++) if (seed(n)) { D[n] = 0; push(0, n); }
      while (hs > 0) { const d = HD[0], n = HN[0]; hs--; if (hs > 0) { const ld = HD[hs], ln = HN[hs]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && HD[c + 1] < HD[c]) c++; if (HD[c] >= ld) break; HD[i] = HD[c]; HN[i] = HN[c]; i = c; } HD[i] = ld; HN[i] = ln; }
        if (d > D[n]) continue; for (let k = A0[n]; k < A0[n + 1]; k++) { const nd = d + AD[k], q = AN[k]; if (nd < D[q]) { D[q] = nd; push(nd, q); } } }
      return D; };
    /* ---- 權重表：焊接點 × 骨頭 ---- */
    const WT = new Float32Array(nw * NB);
    for (let n = 0; n < nw; n++) { const i = rep[n], o = n * NB; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) WT[o + SI.getComponent(i, k)] += w; } }
    if (iRoot >= 0 && iHips >= 0) for (let n = 0; n < nw; n++) { const o = n * NB; if (WT[o + iRoot] > 0) { WT[o + iHips] += WT[o + iRoot]; WT[o + iRoot] = 0; } }      /* 掛在不會動的根骨上的頂點改跟骨盆 */
    const norm = n => { const o = n * NB; let s = 0; for (let b = 0; b < NB; b++) s += WT[o + b]; if (s > 0 && s !== 1) for (let b = 0; b < NB; b++) WT[o + b] /= s; };
    lap('table');
    const touched = new Uint8Array(nw); let tW = new Float64Array(nw), gH = null;
    if (FIXW) {
      /* ---- 頭的範圍：離頭近、離身體遠（沿表面量） ---- */
      const YB = HREF - 0.3335, BL = 0.16;
      const dH = dij(n => WZ[n] > hdL.z + 0.08 && WY[n] > hdL.y - 0.08), dB = dij(n => WZ[n] < shL.z - 0.10 || WY[n] < YB);
      for (let n = 0; n < nw; n++) { let t = (dB[n] - dH[n]) / BL + 0.5; t = Math.min(1, Math.max(0, t)); tW[n] = dH[n] < 1e8 ? t * t * (3 - 2 * t) : 0; }
      gH = dij(n => tW[n] > 0);                       /* 離「頭的範圍」多遠 */
    lap('dij');
      /* ---- 軀幹主軸（骨盆→…→胸）：腿骨交還的權重照「在主軸上的前後位置」分給最近的兩節 ---- */
      const trunk = []; for (let b = HEAD.chest; b && b !== HEAD.hips; b = b.parent) trunk.unshift(b); trunk.unshift(HEAD.hips);
      const tJ = trunk.map(b => toLocal(wp(b))); tJ.push(toLocal(wp(HEAD.neck || HEAD.head))); const tI = trunk.map(bi);
      const tU = tJ[tJ.length - 1].clone().sub(tJ[0]).normalize(), tS = tJ.map(p => p.clone().sub(tJ[0]).dot(tU)); for (let k = 1; k < tS.length; k++) tS[k] = Math.max(tS[k], tS[k - 1] + 1e-4);
      const tC = trunk.map((b, k) => (tS[k] + tS[k + 1]) / 2);
      const tK = new Int32Array(2), tF = new Float64Array(2);      /* 這個位置該跟軀幹的哪兩節、各多少 */
      const trunkAt = n => { const s = (WX[n] - tJ[0].x) * tU.x + (WY[n] - tJ[0].y) * tU.y + (WZ[n] - tJ[0].z) * tU.z; let k = 0; while (k < tC.length - 1 && s > tC[k + 1]) k++;
        const u = k >= tC.length - 1 ? 0 : Math.min(1, Math.max(0, (s - tC[k]) / (tC[k + 1] - tC[k]))); tK[0] = tI[k]; tF[0] = 1 - u; tK[1] = tI[Math.min(k + 1, tI.length - 1)]; tF[1] = u; };
      /* 腿骨交還的份量：腿根附近的給「這條腿掛著的那一節軀幹」（前腿→胸、後腿→骨盆），離腿根遠的（肚子、側腹）照前後位置分 */
      const toTrunk = (n, mv, S) => { if (mv <= 0) return; const o = n * NB; if (S && S.pk >= 0) { const x = WX[n] - S.rx, y = WY[n] - S.ry, z = WZ[n] - S.rz; let u = S.rl2 > 0 ? (x * S.rdx + y * S.rdy + z * S.rdz) / S.rl2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = x - u * S.rdx, ey = y - u * S.rdy, ez = z - u * S.rdz, f = 1 - sm(0.20, 0.45, Math.sqrt(ex * ex + ey * ey + ez * ez)); if (f > 0) { WT[o + S.pk] += mv * f; mv *= 1 - f; if (mv <= 0) return; } }
        trunkAt(n); WT[o + tK[0]] += mv * tF[0]; if (tF[1] > 0) WT[o + tK[1]] += mv * tF[1]; };
      const isTrunk = new Uint8Array(NB); for (const k of tI) if (k >= 0) isTrunk[k] = 1;
      /* ---- 每條腿每根骨頭的線段（關節→下一個關節），用來量「離這根骨頭多遠」 ---- */
      const segs = []; if (FIX2) for (const L of LEGS) for (const b of sub(L.s)) { const k = bi(b); if (k < 0) continue; const a = toLocal(wp(b)), c = b.children.find(o => o.isBone), e = c ? toLocal(wp(c)) : a.clone(); { const r0 = toLocal(wp(L.s)), r1 = toLocal(wp(L.e)), pk = bi(L.s.parent); segs.push({ pk: pk >= 0 && isTrunk[pk] ? pk : -1, rx: r0.x, ry: r0.y, rz: r0.z, rdx: r1.x - r0.x, rdy: r1.y - r0.y, rdz: r1.z - r0.z, rl2: r1.distanceToSquared(r0), k, kind: L.kind, sd: L.side, xb: Math.abs(toLocal(wp(L.e)).x), ax: a.x, ay: a.y, az: a.z, dx: e.x - a.x, dy: e.y - a.y, dz: e.z - a.z, l2: e.distanceToSquared(a) }); } }
      /* 軀幹底的高度（中線附近最低的地方），前腿、後腿各量一次（各看腿根往身體中段那一側）：中線規則與大範圍抹勻只管這個高度以上 */
      const hipZ = toLocal(wp(LEGS[2].s)).z, shZ = toLocal(wp(LEGS[0].e)).z, yBk = { F: HREF * 0.6, H: HREF * 0.6 };
      if (FIX2) { const xm = 0.3 * Math.min(...LEGS.map(L => Math.abs(toLocal(wp(L.e)).x))), ysF = [], ysH = [];
        for (let n = 0; n < nw; n++) if (Math.abs(WX[n]) < xm) { const z = WZ[n]; if (z > shZ - 0.22 && z < shZ + 0.05) ysF.push(WY[n]); if (z > hipZ - 0.05 && z < hipZ + 0.22) ysH.push(WY[n]); }
        for (const [k, ys] of [['F', ysF], ['H', ysH]]) if (ys.length) { ys.sort((p, q) => p - q); yBk[k] = ys[Math.floor(ys.length * 0.03)]; }
        for (const S of segs) S.yB = yBk[S.kind]; }
      const yBat = z => yBk.H + (yBk.F - yBk.H) * Math.min(1, Math.max(0, (z - hipZ) / (shZ - hipZ))), MA = PRM.midA, MB = PRM.midB;
      const legSd = new Int8Array(NB), legXb = new Float32Array(NB); for (const S of segs) { legSd[S.k] = S.sd; legXb[S.k] = S.xb; }
      /* 每一節腿有多粗（從模型量）：只看骨頭「外側正旁邊」、而且原本就跟著這根骨頭的皮（那裡只有腿自己的皮，沒有軀幹），取離骨頭距離的中位數 */
      if (FIX2) { const cnt = segs.map(() => []); for (let n = 0; n < nw; n++) { const x = WX[n], y = WY[n], z = WZ[n]; for (let q = 0; q < segs.length; q++) { const S = segs[q]; if (S.l2 <= 0 || WT[n * NB + S.k] < 0.2) continue; const u = ((x - S.ax) * S.dx + (y - S.ay) * S.dy + (z - S.az) * S.dz) / S.l2; if (u < 0.15 || u > 0.85) continue;
            const ex = x - S.ax - u * S.dx, ey = y - S.ay - u * S.dy, ez = z - S.az - u * S.dz, d = Math.sqrt(ex * ex + ey * ey + ez * ez); if (d < 0.30 && S.sd * ex > 0.85 * d) cnt[q].push(d); } }
        segs.forEach((S, q) => { const a = cnt[q]; a.sort((p, r) => p - r); S.r = a.length >= 5 ? Math.min(0.14, Math.max(0.03, a[a.length >> 1])) : 0; });
        for (const S of segs) if (!S.r) { const o = segs.filter(T => T.r && T.sd === S.sd && T.kind === S.kind); S.r = o.length ? Math.min(...o.map(T => T.r)) : 0.06; }      /* 沒有長度的末端骨頭：用同一條腿最細的那一節 */
        LOG.push('legR ' + segs.map(S => bones[S.k].name + '=' + S.r.toFixed(3)).join(',')); }
      /* 一根腿骨在某個位置最多能佔多少：離骨頭越遠越少（照這一節腿的粗細）、越靠身體中線越少。
         只管「骨頭上離這個點最近的地方」高於軀幹底的情形——也就是腿還貼著身體的那一段；手肘、膝蓋以下已經離開身體的部分（含肘後、膝前突出的毛）不限。 */
      const LA = PRM.legA, LB = PRM.legB, legCap = (S, x, y, z) => { let u = S.l2 > 0 ? ((x - S.ax) * S.dx + (y - S.ay) * S.dy + (z - S.az) * S.dz) / S.l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u; const gate = sm(S.yB - 0.08, S.yB - 0.01, S.ay + u * S.dy); if (gate <= 0) return 1;
        const ex = x - S.ax - u * S.dx, ey = y - S.ay - u * S.dy, ez = z - S.az - u * S.dz, d = Math.sqrt(ex * ex + ey * ey + ez * ez); return 1 - (1 - (1 - sm(LA * S.r, LB * S.r, d)) * sm(MA * S.xb, MB * S.xb, S.sd * x)) * gate; };
      /* ---- 緩衝帶的強度（沿表面離頭的範圍 6 公分內＝1，20 公分外＝0）。
         第三代試驗（預設關閉，PRM.bufR1=0 時這段不執行，fBuf 就是原本的緩衝帶強度）：緩衝帶往「空間上」擴張。鬃毛是一片片蓋在肩膀上的毛片，沿表面量離頭很近（所以整片只跟胸骨），
         但被它蓋住的那層皮沿表面量離頭很遠（所以跟前腿）。前腿一擺，底下的皮往後滑、毛片留在原地，毛片根部的摺縫就被拉開、露出內層。
         做法：前腿骨有份的點，如果空間上貼著緩衝帶裡的毛（bufR0 以內），就拿到一樣的強度，往外到 bufR1 漸漸歸零——
         疊在一起的毛片和皮一起跟胸骨，前腿的過渡帶移到毛片蓋不到的單層皮上（單層皮只會被拉長，不會裂開）。 ---- */
      const fBuf = new Float32Array(nw); for (let n = 0; n < nw; n++) fBuf[n] = 1 - sm(0.06, 0.20, gH[n]);
      const flB = []; for (let b = 0; b < NB; b++) if (isFL[b]) flB.push(b);
      if (FIX3 && PRM.bufR1 > 0) { const R0 = PRM.bufR0, R1 = PRM.bufR1, R12 = R1 * R1, hk = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512), grid = new Map(), src = new Float32Array(fBuf);
        for (let n = 0; n < nw; n++) if (src[n] > 0) { const k = hk(Math.floor(WX[n] / R1), Math.floor(WY[n] / R1), Math.floor(WZ[n] / R1)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(n); }
        let nd = 0;
        for (let n = 0; n < nw; n++) { if (src[n] >= 1) continue; const o = n * NB; let has = false; for (let e = 0; e < flB.length; e++) if (WT[o + flB[e]] > 0) { has = true; break; } if (!has) continue;
          const x = WX[n], y = WY[n], z = WZ[n], cx = Math.floor(x / R1), cy = Math.floor(y / R1), cz = Math.floor(z / R1); let best = src[n];
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const a = grid.get(hk(cx + dx, cy + dy, cz + dz)); if (!a) continue; for (let i = 0; i < a.length; i++) { const q = a[i]; if (src[q] <= best) continue; const ex = x - WX[q], ey = y - WY[q], ez = z - WZ[q], d2 = ex * ex + ey * ey + ez * ez; if (d2 >= R12) continue; const v = src[q] * (1 - sm(R0, R1, Math.sqrt(d2))); if (v > best) best = v; } }
          if (best > src[n] + 0.01) { fBuf[n] = best; nd++; } }
        LOG.push('buf+ ' + nd); }
      for (let n = 0; n < nw; n++) { const o = n * NB, t = tW[n], x = WX[n], y = WY[n], z = WZ[n]; let ch = false;
        /* 腿骨只能影響自己附近的皮：離骨頭超過 R0 開始衰減，R1 以外歸零，交還給軀幹主軸（側腹、肚子、臀背不再被腿拉著走） */
        for (let q = 0; q < segs.length; q++) { const S = segs[q], w = WT[o + S.k]; if (w <= 0) continue; const keep = legCap(S, x, y, z); if (keep >= 1) continue; WT[o + S.k] = w * keep; toTrunk(n, w * (1 - keep), S); ch = true; }
        /* 肩關節上方、前方的皮（肩背、頸根、前胸）不該整塊跟著上臂轉：把上臂權重的大部分還給胸骨 */
        { const fy = sm(shL.y - 0.10, shL.y + 0.07, y), fz = sm(shL.z + 0.05, shL.z + 0.16, z) * sm(shL.y - 0.24, shL.y - 0.12, y), f = Math.max(fy, fz) * 0.9;
          if (f > 0) { let mv = 0; for (let b = 0; b < NB; b++) if (isClav[b] && WT[o + b] > 0) { mv += WT[o + b] * f; WT[o + b] *= 1 - f; } if (mv > 0) { WT[o + iChest] += mv; ch = true; } } }
        /* 頭的範圍旁邊留一圈緩衝帶：前腿骨的權重全部還給胸骨 */
        { const f = fBuf[n]; if (f > 0) { let mv = 0; for (let b = 0; b < NB; b++) if (isFL[b] && WT[o + b] > 0) { mv += WT[o + b] * f; WT[o + b] *= 1 - f; } if (mv > 0) { WT[o + iChest] += mv; ch = true; } } }
        /* 頭的範圍（含垂下來的毛）：整塊跟頭骨 */
        if (t > 0) { let mv = 0; for (let b = 0; b < NB; b++) { const w = WT[o + b]; if (w <= 0) continue; if (!(isHeadB[b] || (isEar[b] && y > earY - 0.03))) { mv += w * t; WT[o + b] = w * (1 - t); } } if (mv > 0) { WT[o + iHead] += mv; ch = true; } }
        if (ch) { touched[n] = 1; norm(n); } }
    lap('rules');
      /* ---- 交界帶把權重沿表面抹勻（只動頭的邊緣到緩衝帶外一點的範圍） ---- */
      if (SMOOTH_IT > 0) { const band = []; for (let n = 0; n < nw; n++) if (gH[n] < 0.30 && tW[n] < 0.999) band.push(n);
        /* 只算這一帶真的用到的骨頭（通常十來根），省時間 */
        const use = new Uint8Array(NB); for (const n of band) { const o = n * NB; for (let b = 0; b < NB; b++) if (WT[o + b] > 0) use[b] = 1; for (let k = A0[n]; k < A0[n + 1]; k++) { const oq = AN[k] * NB; for (let b = 0; b < NB; b++) if (WT[oq + b] > 0) use[b] = 1; } }
        const ub = []; for (let b = 0; b < NB; b++) if (use[b]) ub.push(b); const U = ub.length, nx = new Float32Array(band.length * U);
        for (let it = 0; it < SMOOTH_IT; it++) { for (let j = 0; j < band.length; j++) { const n = band[j], o = n * NB, c = A0[n + 1] - A0[n], oj = j * U; if (!c) { for (let e = 0; e < U; e++) nx[oj + e] = WT[o + ub[e]]; continue; }
            for (let e = 0; e < U; e++) nx[oj + e] = WT[o + ub[e]] * 0.5; const f = 0.5 / c; for (let k = A0[n]; k < A0[n + 1]; k++) { const oq = AN[k] * NB; for (let e = 0; e < U; e++) nx[oj + e] += WT[oq + ub[e]] * f; } }
          for (let j = 0; j < band.length; j++) { const o = band[j] * NB, oj = j * U; for (let e = 0; e < U; e++) WT[o + ub[e]] = nx[oj + e]; } }
        for (const n of band) touched[n] = 1; }
    lap('band');
      /* ---- 空間抹勻：Meshy 的模型是一層層互相重疊的毛片（鬃毛、披毛、頰毛），沿表面看是分開的，空間上卻貼在一起。
         相鄰毛片的權重如果不一樣，身體一動縫就裂開、露出縫裡沒上色的地方。這裡讓空間上靠近的頂點權重趨於一致（頭的範圍不參與）。 ---- */
      if (SPAT_R > 0) { const Y0 = HREF * 0.50, Y1 = HREF * 0.60, R = SPAT_R, reg = []; for (let n = 0; n < nw; n++) if (tW[n] <= 0 && WY[n] > Y0) reg.push(n);
        const M = reg.length, hk = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512), grid = new Map();
        for (let j = 0; j < M; j++) { const n = reg[j], k = hk(Math.floor(WX[n] / R), Math.floor(WY[n] / R), Math.floor(WZ[n] / R)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(j); }
        /* 鄰居表（半徑 R 內，權重 1−d/R），兩輪共用 */
        const n0 = new Int32Array(M + 1); let NQ = new Int32Array(M * 64), NF = new Float32Array(M * 64), nn = 0;
        for (let j = 0; j < M; j++) { const n = reg[j], x = WX[n], y = WY[n], z = WZ[n], cx = Math.floor(x / R), cy = Math.floor(y / R), cz = Math.floor(z / R);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const a = grid.get(hk(cx + dx, cy + dy, cz + dz)); if (!a) continue; for (let i = 0; i < a.length; i++) { const q = reg[a[i]], ex = x - WX[q], ey = y - WY[q], ez = z - WZ[q], d2 = ex * ex + ey * ey + ez * ez; if (d2 >= R * R) continue; const d = Math.sqrt(d2);
              if (nn >= NQ.length) { const a2 = new Int32Array(nn * 2); a2.set(NQ); NQ = a2; const f2 = new Float32Array(nn * 2); f2.set(NF); NF = f2; } NQ[nn] = a[i]; NF[nn++] = 1 - d / R; } }
          n0[j + 1] = nn; }
        /* 每點只記有值的骨頭（最多 KM 根），累加時才快 */
        const KM = 12; let cur = new Float32Array(M * NB), nxt = new Float32Array(M * NB); for (let j = 0; j < M; j++) cur.set(WT.subarray(reg[j] * NB, reg[j] * NB + NB), j * NB);
        const cb = new Int16Array(M * KM), cc = new Uint8Array(M);
        for (let pass = 0; pass < 2; pass++) { for (let j = 0; j < M; j++) { let c = 0; const oj = j * NB; for (let b = 0; b < NB && c < KM; b++) if (cur[oj + b] > 1e-4) cb[j * KM + c++] = b; cc[j] = c; }
          for (let j = 0; j < M; j++) { const oj = j * NB; let tot = 0; for (let k = n0[j]; k < n0[j + 1]; k++) { const q = NQ[k], f = NF[k], oq = q * NB, c = cc[q]; tot += f; for (let e = 0; e < c; e++) { const b = cb[q * KM + e]; nxt[oj + b] += cur[oq + b] * f; } }
            if (tot > 0) { const s = 1 / tot; for (let b = 0; b < NB; b++) nxt[oj + b] *= s; } else for (let b = 0; b < NB; b++) nxt[oj + b] = cur[oj + b]; }
          const t = cur; cur = nxt; nxt = t; nxt.fill(0); }
        for (let j = 0; j < M; j++) { const n = reg[j], o = n * NB, oj = j * NB, f = sm(Y0, Y1, WY[n]); for (let b = 0; b < NB; b++) WT[o + b] = WT[o + b] * (1 - f) + cur[oj + b] * f; touched[n] = 1; } }
      lap('spat');
      /* ---- 軀幹的大範圍空間抹勻（第二代新增）：側腹、肚子、臀背的皮是一片片互相疊著的毛片，Meshy 給的權重在毛片之間忽大忽小，
         腿一擺、脊椎一彎，毛片就各走各的，露出底下沒上色的內層。這裡把權重變成「空間位置的平滑函數」：
         把每個點的權重撒進立體格點、格點之間抹勻、再從格點讀回來，疊在一起的毛片就會拿到一樣的權重、一起動。
         頭的範圍與附近（靠表面距離判斷）、小腿以下不參與。 ---- */
      /* 第三代修改（肩膀與鬃毛交界的裂縫）：這一段原本只管離頭 20～40 公分（沿表面）以外的地方，肩膀前緣、垂在肩膀上的鬃毛剛好不在範圍內：
         那裡前腿骨的份量在 3 公分內從 0.15 跳到 0.55（緩衝帶是照「沿表面的距離」算的，毛片一折一折，換成空間距離就只剩幾公分）。
         第二代腿解法讓整條前腿繞肩胛骨頂端擺，這一帶的皮前後差 6 公分以上，比過渡帶還寬，三角形就整片翻面、露出背面。
         現在把範圍往頭的方向延伸到緩衝帶的外緣（wideG0～wideG1）：前腿的份量變成空間位置的平滑函數，過渡帶變寬、疊著的毛片一起動。頭的範圍本身（tW>0）仍然不參與。 */
      if (FIX2 && PRM.wide > 0) { const h = PRM.wideH, WG0 = FIX3 ? PRM.wideG0 : 0.20, WG1 = FIX3 ? PRM.wideG1 : 0.40; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
        for (let n = 0; n < nw; n++) { if (WX[n] < x0) x0 = WX[n]; if (WX[n] > x1) x1 = WX[n]; if (WY[n] < y0) y0 = WY[n]; if (WY[n] > y1) y1 = WY[n]; if (WZ[n] < z0) z0 = WZ[n]; if (WZ[n] > z1) z1 = WZ[n]; }
        const nx = Math.floor((x1 - x0) / h) + 2, ny = Math.floor((y1 - y0) / h) + 2, nz = Math.floor((z1 - z0) / h) + 2, NG = nx * ny * nz; let G = new Float32Array(NG * NB), GS = new Float32Array(NG);
        const cx = new Int32Array(nw), cf = new Float32Array(nw * 3);
        for (let n = 0; n < nw; n++) { const fx = (WX[n] - x0) / h, fy = (WY[n] - y0) / h, fz = (WZ[n] - z0) / h, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz); cx[n] = (ix * ny + iy) * nz + iz; cf[n * 3] = fx - ix; cf[n * 3 + 1] = fy - iy; cf[n * 3 + 2] = fz - iz; }
        const off = [0, 1, nz, nz + 1, ny * nz, ny * nz + 1, ny * nz + nz, ny * nz + nz + 1], c8 = new Float32Array(8);
        const corner = n => { const a = cf[n * 3], b = cf[n * 3 + 1], c = cf[n * 3 + 2]; c8[0] = (1 - a) * (1 - b) * (1 - c); c8[1] = (1 - a) * (1 - b) * c; c8[2] = (1 - a) * b * (1 - c); c8[3] = (1 - a) * b * c; c8[4] = a * (1 - b) * (1 - c); c8[5] = a * (1 - b) * c; c8[6] = a * b * (1 - c); c8[7] = a * b * c; };
        const nzb = new Int16Array(NB);
        for (let n = 0; n < nw; n++) { if (tW[n] > 0) continue; const o = n * NB; let c = 0; for (let b = 0; b < NB; b++) if (WT[o + b] > 1e-4) nzb[c++] = b; corner(n);
          for (let q = 0; q < 8; q++) { const g = cx[n] + off[q], f = c8[q]; if (f <= 0) continue; GS[g] += f; const og = g * NB; for (let e = 0; e < c; e++) G[og + nzb[e]] += f * WT[o + nzb[e]]; } }
        /* 格點之間再抹（每個軸 1-2-1），抹的是「權重總量」與「點數」，所以空格子不會把值拉低 */
        for (let it = 0; it < PRM.wideIt; it++) for (const st of [1, nz, ny * nz]) { const G2 = new Float32Array(NG * NB), S2 = new Float32Array(NG);
          for (let g = 0; g < NG; g++) { const lo = g - st >= 0 ? g - st : g, hi = g + st < NG ? g + st : g; S2[g] = 0.25 * GS[lo] + 0.5 * GS[g] + 0.25 * GS[hi]; if (S2[g] <= 0) continue; const og = g * NB, ol = lo * NB, oh = hi * NB; for (let b = 0; b < NB; b++) G2[og + b] = 0.25 * G[ol + b] + 0.5 * G[og + b] + 0.25 * G[oh + b]; }
          G = G2; GS = S2; }
        const acc = new Float32Array(NB);
        for (let n = 0; n < nw; n++) { if (tW[n] > 0) continue; const yb = yBat(WZ[n]), zf = PRM.wide * sm(WG0, WG1, gH[n]) * sm(yb - 0.10, yb, WY[n]); if (zf <= 0) continue; corner(n); acc.fill(0); let tot = 0;
          for (let q = 0; q < 8; q++) { const g = cx[n] + off[q], f = c8[q]; if (f <= 0 || GS[g] <= 0) continue; tot += f * GS[g]; const og = g * NB; for (let b = 0; b < NB; b++) acc[b] += f * G[og + b]; }
          if (tot <= 0) continue; const o = n * NB, s = zf / tot, x = WX[n]; let sum = 0;
          for (let b = 0; b < NB; b++) { const w0 = WT[o + b]; let w = w0 * (1 - zf) + acc[b] * s; if (legSd[b] !== 0 && w > w0) { const c = w * sm(MA * legXb[b], MB * legXb[b], legSd[b] * x); w = c > w0 ? c : w0; }      /* 抹勻不能讓腿骨的權重越過中線跑到另一側 */ WT[o + b] = w; sum += w; }
          if (sum > 0) for (let b = 0; b < NB; b++) WT[o + b] /= sum; touched[n] = 1; } }
      /* 抹勻會把腿骨的權重又往外暈開一點：最後再照「腿骨影響範圍」壓一次上限，超出的還給軀幹 */
      if (FIX2) for (let n = 0; n < nw; n++) { const o = n * NB; let mv = 0; for (let q = 0; q < segs.length; q++) { const S = segs[q], w = WT[o + S.k]; if (w <= 0) continue; const e = legCap(S, WX[n], WY[n], WZ[n]); if (w > e) { toTrunk(n, w - e, S); WT[o + S.k] = e; mv = 1; } } if (mv > 0) touched[n] = 1; }
      /* 第三代新增：兩段抹勻會把前腿骨的權重又暈回緩衝帶（和貼著它的皮）：照緩衝帶強度再壓一次上限，超出的還給胸骨 */
      if (FIX3 && PRM.bufEnd) for (let n = 0; n < nw; n++) { const f = fBuf[n]; if (f <= 0) continue; const o = n * NB; let S = 0; for (let e = 0; e < flB.length; e++) S += WT[o + flB[e]]; const al = 1 - f; if (S <= al + 1e-4) continue;
        const k = al / S; for (let e = 0; e < flB.length; e++) WT[o + flB[e]] *= k; WT[o + iChest] += S - al; touched[n] = 1; }
      /* ---- 軀幹各節之間怎麼分，只看「在身體前後的哪個位置」（第二代新增）：同一個橫切面上的皮（背、側腹的毛片、肚子底）拿到一樣的脊椎權重，
         脊椎前後彎的時候整圈一起動，毛片和底下的肚子不會錯開。腿、尾巴、頭的份量不動，只重新分配屬於軀幹骨頭的那一份。前腿根附近不動（那裡的皮要跟著前腿掛的那一節）。 ---- */
      if (FIX2 && PRM.trunk > 0) for (let n = 0; n < nw; n++) { if (tW[n] > 0) continue; const yb = yBat(WZ[n]), zf = PRM.trunk * sm(0.20, 0.40, gH[n]) * sm(yb - 0.10, yb, WY[n]) * (1 - sm(shZ - 0.30, shZ - 0.12, WZ[n])); if (zf <= 0) continue;
        const o = n * NB; let sT = 0; for (let q = 0; q < tI.length; q++) sT += WT[o + tI[q]]; if (sT <= 0) continue; for (let q = 0; q < tI.length; q++) WT[o + tI[q]] *= 1 - zf; trunkAt(n); WT[o + tK[0]] += sT * zf * tF[0]; WT[o + tK[1]] += sT * zf * tF[1]; touched[n] = 1; }
      /* ---- 軀幹的份量最多留兩節（第二代新增）：每個點最後只能留 4 根骨頭，抹勻之後軀幹常常佔掉 3～4 節，
         硬砍第 5 名可能砍到腿骨、讓隔壁兩個點錯開。這裡先把軀幹裡比較小的那幾節併進最大的兩節，把名額留給腿。 ---- */
      if (FIX2 && PRM.compact) for (let n = 0; n < nw; n++) { const o = n * NB; let c = 0, k0 = -1, k1 = -1, sT = 0; for (let q = 0; q < tI.length; q++) { const k = tI[q], w = WT[o + k]; if (w <= 0) continue; c++; sT += w; if (k0 < 0 || w > WT[o + k0]) { k1 = k0; k0 = k; } else if (k1 < 0 || w > WT[o + k1]) k1 = k; } if (c < 3) continue;
        const f = sT / (WT[o + k0] + WT[o + k1]), w0 = WT[o + k0] * f, w1 = WT[o + k1] * f; for (let q = 0; q < tI.length; q++) WT[o + tI[q]] = 0; WT[o + k0] = w0; WT[o + k1] = w1; touched[n] = 1; }
    }
    lap('wide');
    if (typeof location !== 'undefined' && /[?&]skd=1/.test(location.search)) globalThis.__SKD = { WX, WY, WZ, tW, gH, wid, WT, NB, HREF };      /* 除錯用（網址加 skd=1 才有） */
    /* ---- 寫回：每個焊接點取最大的 4 根骨頭，同一點拆出來的頂點寫一樣的值 ---- */
    const oI = new Int32Array(nw * 4), oW = new Float32Array(nw * 4);
    for (let n = 0; n < nw; n++) { const o = n * NB; let b0 = -1, b1 = -1, b2 = -1, b3 = -1, w0 = 0, w1 = 0, w2 = 0, w3 = 0;
      for (let b = 0; b < NB; b++) { const w = WT[o + b]; if (w <= w3) continue; if (w > w0) { b3 = b2; w3 = w2; b2 = b1; w2 = w1; b1 = b0; w1 = w0; b0 = b; w0 = w; } else if (w > w1) { b3 = b2; w3 = w2; b2 = b1; w2 = w1; b1 = b; w1 = w; } else if (w > w2) { b3 = b2; w3 = w2; b2 = b; w2 = w; } else { b3 = b; w3 = w; } }
      const s = w0 + w1 + w2 + w3 || 1, f = b0 < 0 ? 0 : b0; oI[n * 4] = f; oI[n * 4 + 1] = b1 < 0 ? f : b1; oI[n * 4 + 2] = b2 < 0 ? f : b2; oI[n * 4 + 3] = b3 < 0 ? f : b3; oW[n * 4] = w0 / s; oW[n * 4 + 1] = w1 / s; oW[n * 4 + 2] = w2 / s; oW[n * 4 + 3] = w3 / s; }
    for (let i = 0; i < N; i++) { const n = wid[i]; for (let k = 0; k < 4; k++) { SI.setComponent(i, k, oI[n * 4 + k]); SW.setComponent(i, k, oW[n * 4 + k]); } }
    SI.needsUpdate = true; SW.needsUpdate = true; lap('write'); }
  model.userData.skinfixLog = LOG.join(' | '); model.userData.skinfixMs = performance.now() - __t0; })();

/* ---------- 遊戲用控制器 ---------- */
SOFT = true; const FIT = {};
/* 左右錯開：把這個步態跑一圈，看同一側的前腳和後腳會不會在同一時間、同一高度擠到同一個位置（奔跑收腿時會）。會的話後腳往外、前腳往內錯開，像真的狗跑起來後腳跨在前腳外側。 */
function overlapZ(n, G, S, cz) { let ov = -1; const sv = LEGS.map(L => L.cz);      /* 同側前後腳「同時、同高」時在前後方向重疊多少公尺（負＝沒重疊） */
  for (const L of LEGS) L.cz = cz[L.id];
  for (const F of LEGS) { if (F.kind !== 'F') continue; const H = LEGS.find(o => o.kind === 'H' && o.side === F.side);
    for (let i = 0; i < 60; i++) { const ph = i / 60, pf = footPlan(F, (ph + OFFS0[n][F.id]) % 1, G, S), ph2 = footPlan(H, (ph + OFFS0[n][H.id]) % 1, G, S);
      if (Math.abs(pf.y - ph2.y) > 0.10) continue; ov = Math.max(ov, (H.ga.z + ph2.dz + H.tipF) - (F.ga.z + pf.dz - Math.max(F.tipB, 0.2 * F.pw)) + 0.04); } }      /* 腳掌後緣至少算 0.2 個掌寬（掌根那塊肉常常算在上一節骨頭上），再留 4 公分 */
  LEGS.forEach((L, i) => { L.cz = sv[i]; }); return ov; }
function straddle(n, G, S, cz, R) {
  /* 第一步：前後讓開——前腳的落腳中心往前、後腳往後，各讓一半（不超出腿伸得到的範圍） */
  let ov = overlapZ(n, G, S, cz);
  if (ov > 0) { for (const L of LEGS) { const [a, b] = R[L.id], lo = a + S / 2, hi = b - S / 2; if (lo <= hi) cz[L.id] = clamp(cz[L.id] + (L.kind === 'F' ? 0.5 : -0.5) * ov, Math.min(lo, cz[L.id]), Math.max(hi, cz[L.id])); } ov = overlapZ(n, G, S, cz); }
  /* 第二步：還是會擠在一起的話，後腳往外側跨（像真的狗跑起來後腳落在前腳外側） */
  const need = clamp(ov / 0.08, 0, 1), Ff = LEGS.filter(L => L.kind === 'F'), Hh = LEGS.filter(L => L.kind === 'H'), mean = (A, f) => A.reduce((s, L) => s + f(L), 0) / A.length;
  const ex = clamp(0.85 * 0.5 * (mean(Ff, L => L.pw) + mean(Hh, L => L.pw)) - (mean(Hh, L => Math.abs(L.ga.x)) - mean(Ff, L => Math.abs(L.ga.x))), 0, 0.17) * need;
  return { F: 0, H: ex, need, ov }; }
const OFFS0 = { walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, trot: { LH: 0, LF: 0.5, RH: 0.5, RF: 1.0 }, gallop: { LH: 0, LF: 0.42, RH: 0.08, RF: 0.52 } };
for (const n of ['walk', 'trot', 'gallop']) { const G = GAITS[n]; SCAP = G.scap; const R = fitStride(G); let span = Infinity; const cz = {};
  for (const L of LEGS) { const [a, b] = R[L.id]; span = Math.min(span, b - a); cz[L.id] = clamp((a + b) / 2, -0.15, 0.15); } const S = Math.min(G.S, span * 0.92); FIT[n] = { S, cz, v: S / (G.duty * G.T), st: straddle(n, G, S, cz, R) }; }
modes.Cidle.init(); modes.Dpounce.init(); modes.Dswipe.init(); SCAP = 0.06;
const OFFS = { walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, trot: { LH: 0, LF: 0.5, RH: 0.5, RF: 1.0 }, gallop: { LH: 0, LF: 0.42, RH: 0.08, RF: 0.52 } };
const NUM = ['T', 'duty', 'crouch', 'liftF', 'liftH', 'bob', 'pitchA', 'roll', 'yaw', 'flex', 'headK'];
const PROF = Object.assign({ warnY: -0.21, warnP: -10 }, OPT.prof || {});
const ctl = { mode: '', ph: 0, still: 0, bl: 1, fromQ: bones.map(b => b.quaternion.clone()), fromP: bones.map(b => b.position.clone()), lastQ: bones.map(b => b.quaternion.clone()), lastP: bones.map(b => b.position.clone()), fromR: V(), lastR: V(), fromRq: Q(), lastRq: Q(), pin: {}, blDur: 0.16, fl: -1, flWait: 6 + 14 * Math.random() };
/* 急停（奔跑／走路 → 站定）：踩在地上的腳留在原地，空中的腳直接落到站姿位置；站定後再一隻一隻補一小步收回站姿（一次只動一隻，偏最多的先動）。 */
/* 換招式／換階段時：還踩在地上的腳，落腳點從「現在踩的地方」開始（記成落後量），之後由 footC 一隻一隻跨回站位；不再直接改釘到站位讓腳滑過去 */
function pinsFromPose() { const P = {}, r0 = root.position.clone(), q0 = root.quaternion.clone(), cur = {}; root.position.copy(ctl.lastR); root.quaternion.copy(ctl.lastRq); root.updateMatrixWorld(true);      /* 現在踩的位置要用上一格的身體位置量；站位則是身體回到原點時的站位 */
  for (const L of LEGS) { const t = wp(L.t); L.curW = null; if (t.y > L.P0[4].y + 0.035) continue; cur[L.id] = wp(L.h); cur[L.id].y = HY; L.curW = stage.localToWorld(wp(L.h)); }
  root.position.set(0, r0.y, 0); root.quaternion.identity(); root.updateMatrixWorld(true); const fwd = axes().fwd;
  for (const L of LEGS) if (cur[L.id]) { const pin = toWorld(V(L.anchor.x, HY, L.anchor.z)), d = pin.clone().sub(cur[L.id]).dot(fwd); pin._d = Math.abs(d) > 0.004 ? d : 0; pin._g = 1; P[L.id] = pin; }
  root.position.copy(r0); root.quaternion.copy(q0); root.updateMatrixWorld(true); return P; }
function settleStart() { const q = []; for (const L of LEGS) { const t = wp(L.t); if (t.y > L.P0[4].y + 0.035) continue; const x = t.x + L.ht0.x, z = t.z + L.ht0.z, d = Math.hypot(x - L.anchor.x, z - L.anchor.z); if (d < 0.012) continue;
    modes.Cidle.pin[L.id] = V(x, HY, z); modes.Cidle.pin[L.id]._g = 1; q.push({ L, from: V(x, HY, z), d }); } q.sort((a, b) => b.d - a.d); ctl.set = q.length ? { q, cur: null, u: 0, wait: 0.1 } : null; }
function settleStep(dt) { const S = ctl.set; if (!S) return; if (!S.cur) { S.wait -= dt; if (S.wait > 0) return; if (!S.q.length) { ctl.set = null; return; } S.cur = S.q.shift(); S.u = 0; }
  const c = S.cur, L = c.L; S.u = Math.min(1, S.u + dt / (0.16 + 0.25 * Math.min(0.4, c.d))); const e = S.u * S.u * (3 - 2 * S.u), b = Math.sin(Math.PI * S.u), p = c.from.clone().lerp(V(L.anchor.x, HY, L.anchor.z), e);
  modes.Cidle.pin[L.id] = p.clone(); const tg = p.clone(); tg.y = HY + (0.03 + 0.12 * Math.min(0.4, c.d)) * b; solveLeg(L, tg, -0.3 * b, 0.3 * b, 1, { toe: 1 }); if (S.u >= 1) { S.cur = null; S.wait = 0.03; } }
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
  /* 先解後腿，再解前腿：前腿擺盪時要閃開同一側後腿的大腿與小腿 */
  for (const L of [LEGS[2], LEGS[3], LEGS[0], LEGS[1]]) { const p = ((ph + lerp(OFFS[a][L.id], OFFS[b][L.id], u)) % 1 + 1) % 1, f = footPlan(L, p, G, Sx), sd = lerp(FIT[a].st[L.kind], FIT[b].st[L.kind], u) * Math.min(1, r);
    let dA = 0; if (ctl.tgL && ctl.mode === 'dash' && L.cur0 != null) { const stn = p < G.duty; if (L.dO == null) L.dO = stn ? stage.worldToLocal(L.cur0.clone()).z - (INR.dz || 0) - toWorld(V(0, 0, L.ga.z + f.dz)).z : 0; if (!stn) L.dS = 1; else if (L.dS) L.dO = 0; dA = stn ? L.dO : L.dO * (1 - sm(0, 0.6, (p - G.duty) / (1 - G.duty))); }      /* 衝刺起步：原本踩著的後腳從現在的位置開始撐地，離地後才併回步態 */
    const tw = toWorld(V(L.ga.x + L.side * sd, 0, L.ga.z + f.dz + dA)); tw.y = f.y; const H = L.kind === 'F' ? LEGS.find(o => o.kind === 'H' && o.side === L.side) : null;
    if (ctl.tgL && ctl.mode === 'dash' && p < G.duty) { L.tgN = ctl.fc; L.tgP = tw.clone(); L.tgA = [f.pitch, f.flex]; L.tgO = { pp: f.pp, toe: f.toe }; }
    solveLeg(L, tw, f.pitch, f.flex, 1, { pp: f.pp, toe: f.toe, av: H ? legCaps(H) : null }); }
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
/* 尾巴不穿地（通用）：每一節尾巴在外皮上取幾個偏下方的點，姿勢擺好後從根部往尾端檢查，哪一節的皮低於地面就把那一節往上抬到剛好貼地。長尾巴、下垂的尾巴、蹲低的姿勢都適用。 */
const TAILG = (() => { const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const TB = RB.tail.map(B).filter(Boolean), all = []; if (!TB.length) return [];
  for (let o = TB[0]; o; o = o.children.find(c => c.isBone)) all.push(o); const by = new Map(all.map(b => [b, []])), v = V();
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones;
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const A = by.get(bs[SI.getComponent(i, k)]); if (!A) continue; m.getVertexPosition(i, v); A.push({ m, i, y: stage.worldToLocal(m.localToWorld(v.clone())).y, z: v.z }); } }
  return all.map(b => { const A = by.get(b).sort((p, q) => p.y - q.y), low = A.slice(0, Math.max(1, Math.ceil(A.length * 0.3))).sort((p, q) => p.z - q.z), n = Math.min(5, low.length), pts = []; for (let i = 0; i < n; i++) pts.push(low[Math.round(i * (low.length - 1) / Math.max(1, n - 1))]); return { b, pts }; }); })();
function tailGround() { if (!TAILG.length) return; const p = V(), up = V(0, 1, 0);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < TAILG.length; i++) { let mn = 1e9, lp = null;
    if (!TAILG[i].all) { TAILG[i].all = []; for (let j = i; j < TAILG.length; j++) for (const s of TAILG[j].pts) TAILG[i].all.push(s); }
    mn = skinMinY(TAILG[i].all); if (mn < 0.004) { const s = TAILG[i].all[skinMinY.at]; s.m.getVertexPosition(s.i, p); lp = stage.worldToLocal(s.m.localToWorld(p)).clone(); }
    if (mn >= 0.004 || !lp) break; const b = TAILG[i].b, j0 = wp(b), arm = lp.clone().sub(j0), h = Math.hypot(arm.x, arm.z); if (h < 0.03) continue;
    const ax = arm.clone().setY(0).normalize().cross(up); rotW(b, ax, Math.min(35 * D2R, (0.006 - mn) / h)); } }
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
  else { ctl.still = o.speed < 0.08 ? ctl.still + dt : 0; mode = ctl.still > 0 ? 'idle' : 'loco'; }
  ctl.fc = (ctl.fc || 0) + 1; inertia(dt, mode === 'dead' ? 0 : (mode === 'pounce' || mode === 'swipe' || mode === 'dash') ? 0.4 : 1);
  if (mode !== 'dead') ctl.spd = o.speed || 0;      /* 倒地時沿用死前的移動速度 */
  if (mode !== ctl.mode) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.deadFresh = mode === 'dead'; ctl.bl = ctl.mode ? 0 : 1; ctl.blDur = ctl.fl >= 0 ? 0.25 : 0.16; ctl.fl = -1; ctl.dph = null; ctl.pin = pinsFromPose(); modes.Cidle.pin = {};
    if (mode === 'pounce') modes.Dpounce.fresh = true; if (mode === 'swipe') modes.Dswipe.fresh = true; if (mode === 'idle' && ctl.mode && ctl.mode !== 'dead') settleStart(); else ctl.set = null; ctl.mode = mode; }
  root.quaternion.identity(); root.position.x = 0; root.position.z = 0;
  if (mode !== 'loco') ctl.vg = null;
  if (mode === 'loco') { SCAP = 0.06; const v1 = o.speed || 0; ctl.vg = ctl.vg == null ? v1 : ctl.vg + clamp(v1 - ctl.vg, -14 * dt, 14 * dt); loco(ctl.vg, dt); }
  else if (mode === 'idle') { SCAP = 0; const HW = OPT.howl ? 3.8 : 0;
    if (HW && ctl.fl < 0) { ctl.flWait -= dt; if (o.howl || ctl.flWait <= 0) { ctl.fl = 0; startBlend(0.3); } }
    if (HW && ctl.fl >= 0) { ctl.fl += dt; if (ctl.fl >= HW) { ctl.fl = -1; ctl.flWait = 22 + 25 * Math.random(); startBlend(0.3); modes.Cidle.step(dt); } else howl(ctl.fl, dt); }
    else { modes.Cidle.step(dt); settleStep(dt); } }
  else if (mode === 'dash') { const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.34, o.recover || 0.75][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 撲咬（衝刺咬）：後坐蓄力 → 貼地全速衝出去、脖子伸直、張嘴，衝到底咬合 → 煞住、甩頭。和飛撲不同：四腳不離地騰空 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'dash') startBlend(0.13); ctl.dph = i; ctl.pin = pinsFromPose(); ctl.tgL = i === 1; if (i === 1) for (const L of LEGS) { L.dO = null; L.dS = 0; L.cur0 = L.curW; } if (i === 1) ctl.ph = 0.5 * GAITS.gallop.duty - 0.5 * (OFFS.gallop.LH + OFFS.gallop.RH);      /* 衝出去的第一步：步態從「兩隻後腳正踩在站位上」那個相位開始，後腳才不會被拖著滑 */ }
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
  else { resetPose(); const t = st.t, br = Math.sin(t * 3.1); root.position.z = -0.08 * sm(0, 0.3, o.stT == null ? 1 : o.stT); poseBody({ y: PROF.warnY + 0.012 * br, pitch: PROF.warnP, chest: -4, yaw: 2.5 * Math.sin(t * 1.7), neckP: 13, neckY: 5 * Math.sin(t * 1.7 + 1), jaw: 15 + 4 * br, ears: -30 }); plantAll(); tail(i => Math.sin(t * 5 - i * 0.7) * 0.22, 0.25, dt); }
  /* 換動作時的銜接：0.16 秒內從上一個姿勢滑到新姿勢 */
  if (ctl.bl < 1) { ctl.bl = Math.min(1, ctl.bl + dt / ctl.blDur); const w = ctl.bl * ctl.bl * (3 - 2 * ctl.bl);
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; _q.copy(b.quaternion); b.quaternion.copy(ctl.fromQ[i]).slerp(_q, w); _v.copy(b.position); b.position.copy(ctl.fromP[i]).lerp(_v, w); }
    _v.copy(root.position); root.position.copy(ctl.fromR).lerp(_v, w); _q.copy(root.quaternion); root.quaternion.copy(ctl.fromRq).slerp(_q, w); }
  /* 動作切換的過渡是把骨頭角度慢慢轉過去，中途腳可能沉進地面：過渡期間每隻腳量一次腳底，低於地面就把掌根原地往上抬（腳掌朝向不變），抬的力道隨穿入深度連續增加 */
  if (ctl.bl < 1 && mode !== 'dead') { root.updateMatrixWorld(true); for (const L of LEGS) if (L.tgN === ctl.fc) solveLeg(L, L.tgP, L.tgA[0], L.tgA[1], 1, L.tgO || {}); for (const L of LEGS) { const mn = soleMin(L); if (mn > -0.002) continue; const qh = GQ(L.h, Q()).clone(), qt = GQ(L.t, Q()).clone(), hw = wp(L.h); hw.y += -mn + HY - L.hy;
      solveLeg(L, hw, 0, 0, sm(0.002, 0.012, -mn), { ng: 9, sf: 1, avd: 1 }); setW(L.h, qh); setW(L.t, qt); } }
  for (let i = 0; i < bones.length; i++) { ctl.lastQ[i].copy(bones[i].quaternion); ctl.lastP[i].copy(bones[i].position); } ctl.lastR.copy(root.position); ctl.lastRq.copy(root.quaternion);
  root.updateMatrixWorld(true);
  if (mode === 'dead') SEC.reset(); else { SEC.apply(dt, mode); tailGround(); } }      /* 嚎叫時晃動層照常作用 */
const _q = Q(), _v = V();
return { stage, root, model, update, FIT, RG, SEC, INR, RB, SIZE, LEGS, CL, ctl, BF, T: { solveLeg, legLen, legAng, footPlan, resetPose, HY, GAITS, toWorld }, get mode() { return ctl.mode; } };
}
/* ---------- 掛進遊戲（測試版專用）----------
   網址加 ?tiger=20：猛虎換成夜鉤猞；?wolf=20：灰狼換成 Meshy 灰狼；?meshy=1：全部都換。不加參數完全不受影響。
   每種生物一份設定：模型檔、專屬動作、姿勢微調、材質飽和度。 */
const SPEC = { tiger: { glb: 'lynx_rig_2k', opt: {}, fx: { sat: 1.25, gam: 0.9 }, size: 1.3, tex: { map: 'lynx_scar_base.jpg', nrm: 'lynx_scar_normal.jpg' } },      /* 夜鉤猞：原配色不動，體型放大 1.3 倍＋舊爪痕疤（底色與法線貼圖） */
  wolf: { glb: 'wolf_rig_2k', opt: { howl: true }, fx: { sat: 0.95, gain: 1.2, gam: 0.68 } } };
const QS0 = typeof location !== 'undefined' ? location.search : '', ON = {}; for (const k in SPEC) ON[k] = new RegExp('[?&](' + k + '=20|meshy=1)(&|$)').test(QS0);
export const LYNX20 = Object.values(ON).some(Boolean);
const proto = {}, bad = {};
const loadTex = async (g, T) => { if (!T) return; const TL = new THREE.TextureLoader(), ld = async (f, srgb) => { const t = await TL.loadAsync('assets/meshy/' + f); t.flipY = false; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const map = T.map && await ld(T.map, true), nrm = T.nrm && await ld(T.nrm, false); g.scene.traverse(o => { if (o.isMesh) { if (map) o.material.map = map; if (nrm) o.material.normalMap = nrm; o.material.needsUpdate = true; } }); };
for (const k in SPEC) if (ON[k]) new GLTFLoader().loadAsync('assets/meshy/' + SPEC[k].glb + '.glb').then(async g => { try { await loadTex(g, SPEC[k].tex); } catch (e) { console.warn('[lynx20] 貼圖載入失敗（用原貼圖）', k, e && e.message); } proto[k] = g; }).catch(e => { bad[k] = true; console.warn('[lynx20] 載入失敗', k, e && e.message); });
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
