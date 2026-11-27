/* 凍結引擎：wolf（2026-11-27 13:16，主引擎 0460276b）。審核：11-25 灰狼第三四代 v25～v28 結案（用 11-26 23:16 的引擎快照）
   這個檔不要手改；要改請在主引擎改好、整套重錄重審，通過後重新凍結。 */
/* 登界 四足動作引擎（第二代）。
   2026-11-25 13:10 起這個檔就是原始碼（img3d/lab/engine/rig.js）：直接改這裡，然後跑 img3d/eng/bld.sh 做語法檢查並複製到測試版 js/lynxrig.js。
   先前的產生器 img3d/lab/py/build_rig.py（從 lab.js＋legik.js＋gait2.js＋skinfix.js＋ragdoll.js 組出 v16）停用，只留作紀錄。
   測試版專用：網址帶 ?tiger=20（夜鉤猞）、?wolf=20（灰狼）時，走路／小跑／奔跑／待機／招式／受擊／倒地都由這裡驅動。 */
import * as THREE from '../three.bundle.js';
import { GLTFLoader, SkeletonUtils } from '../three.bundle.js';
import { fixMeshyMaterials, setFlash, setFade } from '../meshyfx.js';
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
const KHON = !(typeof location !== 'undefined' && /[?&]kh=0/.test(location.search));
const STEPCL = (typeof location !== 'undefined' && /[?&]scl=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 0.6;
const MVTH = (typeof location !== 'undefined' && /[?&]mvth=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 0.09;      /* 身體在動時，腳離站位超過腿長的幾成就跨步（原本 0.19：收招時被遊戲往前帶，腳會落後很多才跨，看起來整隻縮成一團） */
const LEGC = (typeof location !== 'undefined' && /[?&]legc=1/.test(location.search));
const RGB = (typeof location !== 'undefined' && /[?&]rgb=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 0.0035;
const RGTW = !(typeof location !== 'undefined' && /[?&]rgtw=0/.test(location.search));
const ACCT = (typeof location !== 'undefined' && /[?&]acct=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 0.6;
const RAMAX = (typeof location !== 'undefined' && /[?&]ram=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 1.6;
const ACCG = !(typeof location !== 'undefined' && /[?&]accg=0/.test(location.search));
const OMNI = !(typeof location !== 'undefined' && /[?&]omni=0/.test(location.search));
const NOGB = !(typeof location !== 'undefined' && /[?&]nogb=0/.test(location.search));
const RPLIM = !(typeof location !== 'undefined' && /[?&]rplim=0/.test(location.search));
const QK3 = !(typeof location !== 'undefined' && /[?&]qk3=0/.test(location.search));
const VYR = (() => { const m = typeof location !== 'undefined' && /[?&]vyr=([\d.]+)/.exec(location.search); return m ? +m[1] : 120; })();
const RESW = !(typeof location !== 'undefined' && /[?&]resw=0/.test(location.search));
const VYWY = !(typeof location !== 'undefined' && /[?&]vywy=0/.test(location.search)), HKM = (() => { const m = typeof location !== 'undefined' && /[?&]hkm=([\d.]+)/.exec(location.search); return m ? +m[1] : 30; })();
const VYS = (() => { const m = typeof location !== 'undefined' && /[?&]vys=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.4; })();      /* 視覺轉身的速度門檻（×小跑速度）：慢慢橫走也轉身（四足橫著走腳搆不到，會被拖到前腳收進胸口） */
const FARL = !(typeof location !== 'undefined' && /[?&]farl=0/.test(location.search));      /* 踩著的腳被拖到超過門檻 1.5 倍：不管空中已有幾隻都抬（否則身體會沉下去、前腳收進胸口） */
const LCAP = (() => { const m = typeof location !== 'undefined' && /[?&]lcap=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.025; })();
const VYSM = !(typeof location !== 'undefined' && /[?&]vysm=0/.test(location.search));
const HOP = !(typeof location !== 'undefined' && /[?&]hop=0/.test(location.search));
const QKT = (() => { const m = typeof location !== 'undefined' && /[?&]qkt=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.18; })(), QKH = (() => { const m = typeof location !== 'undefined' && /[?&]qkh=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.4; })();      /* 從招式接過來的腳：0.15 秒放下、抬低（不在胸口下收著） */
const TDRP = !(typeof location !== 'undefined' && /[?&]tdrp=0/.test(location.search));
const VYAW = !(typeof location !== 'undefined' && /[?&]vyaw=0/.test(location.search));
const FRSK = !(typeof location !== 'undefined' && /[?&]frsk=0/.test(location.search));
const K1ON = (typeof location !== 'undefined' && /[?&]k1=1/.test(location.search)), FPSEP = !(typeof location !== 'undefined' && /[?&]fps=0/.test(location.search));
const BENDON = !(typeof location !== 'undefined' && /[?&]bend=0/.test(location.search));
const INR = { bend: 0, y: 0, pitch: 0, roll: 0, look: 0, k: 1, on: true, yaw: 0, vw: new THREE.Vector3(), wy: 0, ok: false, tele: false, P: { w: 13, z: 0.42, gp: 60, gy: 0.3, maxP: 11, maxY: 0.06, kr: 1.9, maxR: 11, kl: 9, maxL: 20, tr: 7, kb: 28, maxB: 10 },
  s: { on: false, first: true, p: new THREE.Vector3(), yaw: 0, vf: 0, P: 0, Pv: 0, Y: 0, Yv: 0, R: 0, L: 0 } };
const _ip = new THREE.Vector3(), _is = new THREE.Vector3(), _if = new THREE.Vector3();
function inertia(dt, k) { const s = INR.s, C = INR.P; stage.getWorldPosition(_ip); stage.getWorldScale(_is); const sW = _is.x || 1; _if.set(0, 0, 1).applyQuaternion(_sq); _if.y = 0; _if.normalize(); const yaw = Math.atan2(_if.x, _if.z); INR.yaw = yaw;
  if (!INR.on || !s.on || dt <= 0 || _ip.distanceTo(s.p) > 1.5 * sW) { INR.tele = s.on && dt > 0 && INR.on; s.on = true; s.first = true; s.p.copy(_ip); s.yaw = yaw; s.va = null; s.P = s.Pv = s.Y = s.Yv = s.R = s.L = s.B = 0; INR.bend = 0; INR.y = INR.pitch = INR.roll = INR.look = 0; INR.dz = 0; INR.vf = 0; INR.vw.set(0, 0, 0); INR.wy = 0; INR.ok = false; return; }
  INR.vw.set((_ip.x - s.p.x) / dt, 0, (_ip.z - s.p.z) / dt); INR.ok = true; const vf = ((_ip.x - s.p.x) * _if.x + (_ip.z - s.p.z) * _if.z) / dt / sW; s.p.copy(_ip); const va = typeof ctl !== 'undefined' && ctl.vy ? ctl.vy.a : 0; let dy = yaw - s.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; s.yaw = yaw; const dva = va - (s.va == null ? va : s.va); s.va = va;      /* 視覺轉身（vyaw）不算進「轉頭甩脖子」的慣性：只有邏輯朝向真的在轉才甩（否則身體轉回出招方向時頭會甩一下） */ const wy = dy / dt; INR.wy = wy;
  INR.vf = vf; INR.sW = sW; INR.dt = dt; { const va = Math.hypot(INR.vw.x, INR.vw.z) / sW; INR.vS = (INR.vS || 0) + (va - (INR.vS || 0)) * (1 - Math.exp(-dt / (va > (INR.vS || 0) ? 0.22 : 0.08))); }      /* 平滑過的實際速度（加速時慢慢跟上、減速時很快跟上） */ INR.dz = clamp(vf * dt, -0.5, 0.5);      /* 這一格實際往前走了多少（stage 尺度），給腳掌的「釘在地上」用 */
  if (s.first) { s.vf = vf; s.first = false; } const dv = Math.max(-5, Math.min(5, vf - s.vf)); s.vf = vf;
  s.Pv += dv * C.gp; s.Yv -= Math.abs(dv) * C.gy;                    /* 速度突然改變＝一次衝擊 */
  const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n; for (let i = 0; i < n; i++) { s.Pv += (-C.w * C.w * s.P - 2 * C.z * C.w * s.Pv) * h; s.P += s.Pv * h; s.Yv += (-C.w * C.w * s.Y - 2 * C.z * C.w * s.Yv) * h; s.Y += s.Yv * h; }
  const e = 1 - Math.exp(-dt * C.tr), cl = (x, m) => Math.max(-m, Math.min(m, x)); s.R += (cl(vf * wy * C.kr, C.maxR) - s.R) * e; s.L += (cl((VYWY ? wy - dva / dt : wy) * C.kl, C.maxL) - s.L) * e; s.B = (s.B || 0) + (cl(wy * C.kb / Math.max(0.6, Math.abs(vf)), C.maxB * (0.5 + 0.5 * sm(0.3, 1.5, Math.abs(vf)))) - (s.B || 0)) * (1 - Math.exp(-dt * 5));      /* 原地轉身只彎一半 */      /* 轉彎時脊椎往彎內彎（曲率＝角速度÷速度），比頭慢半拍 */
  INR.k = k; INR.pitch = cl(s.P, C.maxP) * k; INR.y = cl(s.Y, C.maxY) * k; INR.roll = -s.R * k;      /* 往彎內傾 */ INR.look = s.L * k; INR.bend = (s.B || 0) * k * (BENDON ? 1 : 0); }
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
  /* 腿：從腿根一路到腳尖。有些骨架腿多一節（猛虎前腳多一個腕關節、後腳在飛節和腳掌之間多一節）：腿根、第二、第三節照舊，腳掌固定取「腳尖的上一節」、腳尖取最後一節，中間多出來的那節當成和上一節連在一起（不單獨彎） */
  const legC0 = b => { const a = chain(b, 99); return a.length <= 5 || !LEGC ? a.slice(0, 5) : [a[0], a[1], a[2], a[a.length - 2], a[a.length - 1]]; };
  /* 腿只有四節（野牛前腳：肩胛→前臂→腕→蹄，少了腳掌那一節）：在蹄的正下方地面補一個不帶皮膚的「蹄尖」點，讓蹄那節當腳掌用 */
  const gY = (() => { const bx = new THREE.Box3().setFromObject(model); return model.worldToLocal(V(0, bx.min.y, 0)).y; })();
  const legC = b => { const a = legC0(b); if (a.length !== 4) return a; const last = a[3], w = new THREE.Vector3(); last.getWorldPosition(w); const lw = model.worldToLocal(w.clone()), tw = model.localToWorld(V(lw.x, gY, lw.z + 0.25 * Math.max(0, lw.y - gY)));
    const tip = new THREE.Bone(); tip.name = last.name + '_tip4'; last.add(tip); tip.position.copy(last.worldToLocal(tw)); tip.updateMatrixWorld(true); a.push(tip); return a; };
  return { hips: N(hips), root: N(rtB), chest: N(chest), head: N(head), spine: N(sp[0]), spine3: N(sp.length > 1 ? sp[sp.length - 2] : sp[0]), neck: N(nk[0]), neck2: N(nk[1] || nk[0]),
    jaw: N(head && kids(head).find(o => /^jaw/.test(nm(o)))), earL: N(eL), earR: N(eR), tail: tailC.slice(0, Math.max(1, tailC.length - 1)).map(N),
    LF: legC(cL).map(N), RF: legC(cR).map(N), LH: legC(rL).map(N), RH: legC(rR).map(N) }; })();
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
function skinMinY(pts, nx = 0, nz = 0) { if (!pts.length) return 1e9; let C = pts._c;      /* nx、nz 不是 0 時量的是「沿 (nx,1,nz) 方向的最低點」（斜坡用） */
  if (!C) { C = pts._c = { bones: [], rows: null, P: [] }; const id = new Map();
    for (const s of pts) { const g = s.m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = s.m.skeleton; _vv.fromBufferAttribute(g.attributes.position, s.i).applyMatrix4(s.m.bindMatrix); const e = { x: _vv.x, y: _vv.y, z: _vv.z, w: [] };
      for (let k = 0; k < 4; k++) { const wt = SW.getComponent(s.i, k); if (!wt) continue; const bi = SI.getComponent(s.i, k), key = s.m.uuid + ':' + bi; if (!id.has(key)) { id.set(key, C.bones.length); C.bones.push({ m: s.m, b: sk.bones[bi], inv: sk.boneInverses[bi] }); } e.w.push(id.get(key), wt); } C.P.push(e); }
    C.rows = new Float64Array(C.bones.length * 4); }
  const R = C.rows; let lastM = null;
  for (let i = 0; i < C.bones.length; i++) { const B0 = C.bones[i]; if (B0.m !== lastM) { lastM = B0.m; _mA.copy(stage.matrixWorld).invert().multiply(B0.m.matrixWorld).multiply(B0.m.bindMatrixInverse); }
    const e = _mB.multiplyMatrices(_mA, B0.b.matrixWorld).multiply(B0.inv).elements; R[i * 4] = e[1] + nx * e[0] + nz * e[2]; R[i * 4 + 1] = e[5] + nx * e[4] + nz * e[6]; R[i * 4 + 2] = e[9] + nx * e[8] + nz * e[10]; R[i * 4 + 3] = e[13] + nx * e[12] + nz * e[14]; }
  let mn = 1e9, at = -1; for (let j = 0; j < C.P.length; j++) { const p = C.P[j]; let y = 0; for (let k = 0; k < p.w.length; k += 2) { const o = p.w[k] * 4; y += p.w[k + 1] * (R[o] * p.x + R[o + 1] * p.y + R[o + 2] * p.z + R[o + 3]); } if (y < mn) { mn = y; at = j; } }
  skinMinY.at = at; return mn; }
const soleMin = L => skinMinY(L.sole);
const soleMinS = (L, sl, sr = 0) => { const { fwd, right } = axes(), h = wp(L.h), nx = sl * fwd.x + sr * right.x, nz = sl * fwd.z + sr * right.z; return skinMinY(L.sole, -nx, -nz) + nx * h.x + nz * h.z; };      /* 腳底最低點相對於「通過掌根、前後坡度 sl 的斜面」的高度 */
/* heelW＝腳平貼地面時掌根該在的位置（高度用 HY 當「站在地上」的基準，實際會換成這隻腳自己的高度）；pitch＝腳掌俯仰（0＝站姿，負＝腳尖朝下）；
   flex＝遠端關節額外彎曲（弧度，正＝多彎）；o.pp＝繞趾關節抬腳跟的角度（推蹬）；o.toe＝腳趾跟著腳掌轉的比例（0＝腳趾保持貼地）。 */
function solveLeg(L, heelW, pitch = 0, flex = 0, w = 1, o = {}) {
  const g = o.g || 0;      /* 這隻腳底下的地面高度（第四代；平地＝0） */
  const flex0 = flex;      /* 呼叫的人要求的額外彎曲（下面會再加上著地修正；重解時要傳原本的值） */
  const { right } = axes(), rq = root.quaternion, pre = w < 1 ? L.ch.map(b => b.quaternion.clone()) : null, preP = w < 1 ? L.s.position.clone() : null;
  for (const b of L.ch) b.quaternion.copy(rest.get(b).q); L.s.position.copy(rest.get(L.s).p); L.s.updateMatrixWorld(true);
  const tg = heelW.clone(); tg.y += L.hy - HY + (o.up || 0); if (!o.ng) L.grm = 0;
  if (o.pp) { const k0 = L.ht0.clone().applyQuaternion(rq), d = k0.clone().applyAxisAngle(right, o.pp).sub(k0); if (o.yw) d.applyAxisAngle(CT.Y, o.yw); tg.add(d); }
  let sw = wp(L.s), su = 0, sx = 0;
  if (L.sl) { const { fwd } = axes(); sx = L.sl.x * Math.tanh(0.4 * (tg.clone().sub(sw).dot(fwd) - L.rz0) / L.sl.x); sw.addScaledVector(fwd, sx); su = slingY(L, sw, tg, flex); sw.y += su;
    L.s.position.copy(S2B(L.s.parent, sw.clone())); L.s.updateMatrixWorld(true); }
  const dv = tg.clone().sub(sw); let d = dv.length(); const d1 = d;
  /* 踩在地上的腿：最下面那一節（看得到的小腿／前臂）跟著整條腿像鐘擺一樣擺，不因為上面折疊而歪掉——蹲低時腳掌仍在那一節的正下方（狗貓蹲伏的樣子）。
     做法：先當作那一節的方向已知，上面兩節用兩節連桿的封閉解算出該折多少，換算成「遠端額外彎曲」加進去；擺盪中的腿逐漸換回兩個關節一起折。 */
  { const kS = 1 - sm(0.004, 0.06, heelW.y - HY - g); if (kS > 1e-3 && d1 > 1e-4) { const bq = GQ(L.s.parent, Q()).multiply(L.qp0i).invert(), dB = dv.clone().applyQuaternion(bq), ax0 = L.P0[3].clone().sub(L.P0[0]);
      const al = _lean(dB) - _lean(ax0), wB = dB.clone().sub(L.V0[2].clone().applyAxisAngle(LEGX, al)), p2 = v => Math.hypot(v.y, v.z), l1 = p2(L.V0[0]), l2 = p2(L.V0[1]), D = clamp(p2(wB), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);      /* 都用側面投影算，站姿時才會剛好等於站姿 */
      const mE = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1)), be = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
      const lean2 = _lean(wB) - L.sE * be + L.sE * mE, ph = mE - L.mE0, mW = L.sW * (_lean(L.V0[2]) + al - lean2), fS = mW - L.mW0 - ph; flex += kS * clamp(fS, -1.2, 1.2); } }
  const dm = legLen(L, L.phiLo, flex), dn = legLen(L, L.phiHi, flex), ds = Math.min(dm - 1e-3, Math.max(0.965 * dm, flex ? legLen(L, 0, flex) : L.d0));      /* 軟性上限從站姿長度之後才開始，站姿一定解得回來 */
  if (SOFT && d > ds) d = ds + (dm - ds) * (1 - Math.exp(-(d - ds) / (dm - ds)));
  if (o.gr && d < d1 - 1e-5) { const hl = Math.hypot(dv.x, dv.z), nh = Math.sqrt(Math.max(1e-8, d * d - dv.y * dv.y)); if (hl > 1e-5 && nh < hl) { const k = nh / hl; tg.x = sw.x + dv.x * k; tg.z = sw.z + dv.z * k; dv.x *= k; dv.z *= k; L.grm = hl - nh; } }      /* o.gr（踩在地上的腳）：搆不到時腳留在地面上、沿地面讓回來，不要被拉離地 */
  if (d < dn) {      /* 目標太近、腿折不到那麼短：不要順著方向把腳頂過頭（會頂進地面），改成保持目標的高度、沿前後方向讓出去 */
    const { fwd } = axes(), up = V(0, 1, 0), vy = dv.dot(up), vz = dv.dot(fwd), vx = dv.clone().addScaledVector(up, -vy).addScaledVector(fwd, -vz), r2 = dn * dn - vy * vy - vx.lengthSq();
    if (r2 > 0) { const R = Math.sqrt(r2), sg = clamp(vz / (0.6 * R), -1, 1), H = sw.y - L.hy - 0.004 - g, m2 = H > 1e-3 ? vy * vy * dn * dn / (H * H) - vy * vy - vx.lengthSq() : r2, nb = R * sg * (1.5 - 0.5 * sg * sg), nz = (vz < 0 ? -1 : 1) * Math.min(R, Math.sqrt(nb * nb + Math.max(0, m2)));      /* m2＞0＝腿根太低，腳直接從正下方過會頂進地面：這時才保留最小的前後讓位 */      /* 腳從腿根正下方掠過時前後連續地換邊（原本一過中線就整隻腳跳到另一邊）；中間那一小段腿折不到那麼短，腳會略低一點通過 */ dv.addScaledVector(fwd, nz - vz); tg.addScaledVector(fwd, nz - vz); d = dv.length(); } }
  d = clamp(d, Math.min(dn, dm) + 1e-4, dm - 1e-4);
  let lo = L.phiLo, hi = L.phiHi; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (legLen(L, m, flex) > d) lo = m; else hi = m; }
  const phi = (lo + hi) / 2, a = legAng(L, phi, flex).slice(), ax = LEGX.clone().applyQuaternion(GQ(L.s.parent, Q()).multiply(L.qp0i));
  rotW(L.e, ax, a[0]); rotW(L.w, ax, a[1]);
  if (d1 > 1e-6) {      /* 腿軸：先繞彎曲軸（身體的左右軸）轉到位，剩下的側向差再用最小旋轉補；這樣大角度擺動（接近反向）也不會跳軸 */
    const hp = wp(L.h).sub(sw), pa = hp.clone().addScaledVector(ax, -hp.dot(ax)), pb = dv.clone().addScaledVector(ax, -dv.dot(ax));
    if (pa.lengthSq() > 1e-8 && pb.lengthSq() > 1e-8) rotW(L.s, ax, Math.atan2(pa.clone().cross(pb).dot(ax), pa.dot(pb)));
    aim(L.s, L.h, tg); }
  setPaw(L, pitch + (o.sp || 0), pitch * (o.toe == null ? 1 : o.toe) + (o.sp || 0), right); if (o.yw) rotW(L.h, CT.Y, o.yw);      /* o.yw：腳掌繞垂直軸多轉的角度（踩著的腳掌朝向留在世界上，身體轉、腳掌不跟著擰） */
  /* 自我閃避：擺盪收腿時，腳掌／遠端那一節如果貼進自己最上面那一節（大腿、肩胛）的肉裡，就把「額外彎曲」退回一些（那是多餘的自由度，本來就可以讓）。有鬆弛、沒變好不接受。 */
  if (!o.sf && flex0 > 0 && heelW.y - HY - g > 0.004) { let pen = selfPen(L);
    if (pen > 1e-4) { const o2 = Object.assign({}, o, { sf: 1, ng: 9, avd: 1 }); let f2 = flex0, step = Math.min(0.5, 0.7 * pen / Math.max(0.05, L.l3));
      for (let i = 0; i < 4 && pen > 1e-4 && step > 0.01 && f2 > -0.3; i++) { const f3 = Math.max(-0.3, f2 - step); solveLeg(L, heelW, pitch, f3, w, o2); const p2 = selfPen(L); if (p2 < pen) { f2 = f3; pen = p2; step = Math.min(0.5, 0.7 * pen / Math.max(0.05, L.l3)); } else step *= 0.5; }
      return solveLeg(L, heelW, pitch, f2, w, Object.assign({}, o, { sf: 1 })); } }
  /* 閃避（o.av＝別條腿的膠囊）：擺盪中的腿如果會撞進別條腿，就把這隻腳的目標順著前後方向挪開再解。
     每一步只挪「穿入深度」的一部分（鬆弛），而且挪完穿入量沒有變小就不接受、改用一半的步長（不會越修越糟、也不會來回震盪）；著地的腳不挪。 */
  if (o.av && !o.avd && heelW.y - HY - g > 0.004) { let pen = legPen(L, o.av);
    if (pen > 1e-4) { const k = sm(0.004, 0.05, heelW.y - HY - g), dir = axes().fwd.multiplyScalar(L.kind === 'F' ? 1 : -1), o2 = Object.assign({}, o, { avd: 1, ng: 9 }); let sh = 0, step = 1.05 * pen * k;
      for (let i = 0; i < 4 && pen > 1e-4 && step > 5e-4; i++) { const s2 = Math.min(0.18, sh + step); solveLeg(L, heelW.clone().addScaledVector(dir, s2), pitch, flex0, w, o2); const p2 = legPen(L, o.av);
        if (p2 < pen) { sh = s2; pen = p2; step = 1.05 * pen * k; } else step *= 0.5; }
      return solveLeg(L, heelW.clone().addScaledVector(dir, sh), pitch, flex0, w, Object.assign({}, o, { avd: 1 })); } }
  if (pre) { L.ch.forEach((b, i) => { const q = b.quaternion.clone(); b.quaternion.copy(pre[i]).slerp(q, w); }); const p1 = L.s.position.clone(); L.s.position.copy(preP).lerp(p1, w); L.s.updateMatrixWorld(true); }
  if ((o.ng || 0) < 2 && L.sole.length && heelW.y - HY - g < 0.2) { const mn = (o.sl || o.sr ? soleMinS(L, o.sl || 0, o.sr || 0) : soleMin(L)) - g;      /* 離地不高時才需要量；最多修兩輪 */ const lift = heelW.y - HY - g, cl = lift > 0.004 ? (o.clk ? o.clk * lift : Math.min(0.1 * (L.tipF + L.tipB), 0.5 * lift)) : 0;      /* 擺盪中的腳：整個腳底（含爪尖）最低點至少離地「抬腳高度的一半、最多腳掌長度的一成」，爪尖不會貼著地拖 */ if (mn < cl - 0.002) return solveLeg(L, heelW, pitch, flex0, w, Object.assign({}, o, { up: (o.up || 0) + cl - mn, ng: (o.ng || 0) + 1 })); }
  else if (o.ng === 2 && !o.fl2 && L.sole.length && heelW.y - HY - g < 0.2) { const mn = (o.sl || o.sr ? soleMinS(L, o.sl || 0, o.sr || 0) : soleMin(L)) - g; if (mn < -0.003) return solveLeg(L, heelW, 0.25 * pitch, 0.5 * flex0, w, Object.assign({}, o, { up: (o.up || 0) - mn, fl2: 1 })); }      /* 抬高兩輪還是穿地（腿根太低、腿已經折到底）：最後一招是把腳掌放平再解一次 */
  L.dbg = { r: +(d1 / dm).toFixed(3), phi: +(phi / D2R).toFixed(1), fl: +(flex / D2R).toFixed(1), pi: +(pitch / D2R).toFixed(1), up: +(o.up || 0).toFixed(4),  sx: +sx.toFixed(4), su: +su.toFixed(4), err: +wp(L.h).distanceTo(tg).toFixed(4) };
}
// 尾巴：逐節延遲的擺動＋下垂
const TAIL = RB.tail.map(B).filter(Boolean);
const tailSpring = { yaw: TAIL.map(() => 0), v: TAIL.map(() => 0) };
const TAILR = (() => { if (TAIL.length < 2) return { al: 1.4, S: 1 }; const a = wp(TAIL[0]), b = wp(TAIL[TAIL.length - 1]); let S = 0; TAIL.forEach((_, i) => S += 0.5 + 0.5 * i / TAIL.length); return { al: Math.max(0.08, 75 * D2R - Math.atan2(a.y - b.y, Math.hypot(b.z - a.z, b.x - a.x))), S }; })();
const TL0 = OPT.tdl || 62, TUP = OPT.tup == null ? null : OPT.tup; let TLIM = TL0;      /* TLIM＝尾巴往下垂的上限；TUP＝往上翹的上限（每種生物可設，猛虎尾巴長，收招時會翹成一根直棍） */
function tailClamp() { if (TAIL.length < 2) return; const { fwd, right } = axes(), last = TAIL[TAIL.length - 1], A = () => { const d = wp(last).sub(wp(TAIL[0])); return Math.atan2(-d.y, -d.dot(fwd)) / D2R; };      /* 尾巴根到尖的連線在側面的角度：0＝水平朝後、90＝直直往下、超過 90＝往前伸到肚子底下 */
  let ang = A(); if (ang < -90) ang += 360; ctl.tA = Math.round(ang);
  if (TUP != null) { root.updateMatrixWorld(true); for (let i = 1; i < TAIL.length; i++) { const b = TAIL[i], c = i + 1 < TAIL.length ? TAIL[i + 1] : b.children.find(x => x.isBone); if (!c) continue; const p0 = wp(b), d = wp(c).sub(p0), hz = Math.hypot(d.x, d.z); if (hz < 1e-6) continue; const up = Math.atan2(d.y, hz) / D2R, lim = TUP + 10; if (up > lim) { const ax = V(d.z, 0, -d.x).normalize(); rotW(b, ax, (up - lim) * D2R); root.updateMatrixWorld(true); } } }      /* 每一節都限制往上翹的角度（只限制根到尖的連線不夠：尾巴會彎成 S 形、尖端翹成直棍） */
  if (TUP != null && ang < -TUP && ang > -90) { const ex = (ang + TUP) * D2R, q0 = TAIL[0].quaternion.clone(); rotW(TAIL[0], right, ex); let a2 = A(); if (Math.abs(a2 + TUP) > Math.abs(ang + TUP) - 1) { TAIL[0].quaternion.copy(q0); rotW(TAIL[0], right, -ex); } return; }      /* 往上翹超過上限（尾巴長的生物收招時會翹成直棍）：從根部轉回 */
  if (ang <= TLIM) return; const ex = (ang - TLIM) * D2R, q0 = TAIL[0].quaternion.clone(); rotW(TAIL[0], right, ex); let a2 = A(); if (a2 < -90) a2 += 360; if (Math.abs(a2 - TLIM) > Math.abs(ang - TLIM) - 1) { TAIL[0].quaternion.copy(q0); rotW(TAIL[0], right, -ex); } }      /* 超過上限就把整條尾巴從根部轉回上限（往後抬），騰空時各招式會把上限調小 */
function tail(sway, droop, dt, bodyYawRate = 0) {
  const { up, right } = axes(); if (droop < 0 && OPT.tupK != null) droop *= OPT.tupK;      /* 尾巴往上抬的量每種生物可縮（猛虎尾巴長，照預設會翹成直棍） */ if (droop > 0) { const ch = 0.5 * TAILR.S * droop, al = TAILR.al, k0 = 0.7 * al; if (ch > k0) droop *= (k0 + 0.3 * al * (1 - Math.exp(-(ch - k0) / (0.3 * al)))) / ch; }      /* 尾巴整體最多垂到水平線下 75°（依這副骨架站姿的尾巴角度換算），不會被壓成直直往下 */
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
function poseBody({ y = 0, pitch = 0, roll = 0, yaw = 0, chest = 0, neckP = 0, neckY = 0, jaw = 0, ears = 0 }) { if (OPT.neckK != null) neckP *= OPT.neckK;      /* 脖子俯仰每種生物可縮（猛虎脖子粗、頭大，照夜鉤猞的角度會像仰頭看天、埋頭貼地） */
  const { fwd, right, up } = axes(); root.position.y = y + INR.y;
  if (WS.on && LEGS[0].c) { if (!WS.ax) { WS.ax = 0.06 * Math.abs(LF.anchor.x - RF.anchor.x); WS.az = 0.02 * Math.abs(LF.anchor.z - LEGS.find(L => L.kind === 'H').anchor.z); } let tx = 0, tz = 0; for (const L of LEGS) if (L.c.air && L.c.stp) { tx -= Math.sign(L.anchor.x) * WS.ax; tz -= (L.kind === 'F' ? 1 : -1) * WS.az; }      /* 第三代：站著跨步時重心先移到撐著的那一側（抬左腳→身體往右靠），用阻尼彈簧追，不會跳 */
    const dt = INR.dt || 0.0167, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { WS.vx += ((tx - WS.x) * WS.w * WS.w - 2 * 0.9 * WS.w * WS.vx) * h; WS.x += WS.vx * h; WS.vz += ((tz - WS.z) * WS.w * WS.w - 2 * 0.9 * WS.w * WS.vz) * h; WS.z += WS.vz * h; }
    root.position.x += WS.x; root.position.z += WS.z; }
  root.updateMatrixWorld(true);
  rotW(HEAD.hips, right, (pitch + INR.pitch) * D2R); rotW(HEAD.hips, fwd, (roll + INR.roll) * D2R); rotW(HEAD.hips, up, (yaw - 0.4 * INR.bend) * D2R); if (INR.bend && HEAD.spine) rotW(HEAD.spine, up, INR.bend * D2R); rotW(HEAD.chest, right, chest * D2R);      /* 脊椎側彎：骨盆往外 4 成、胸往內 6 成 */
  rotW(HEAD.neck, right, neckP * D2R); rotW(HEAD.neck, up, (neckY + INR.look) * D2R + (INR.hk || 0)); if (HEAD.jaw) rotW(HEAD.jaw, right, -jaw * D2R);
  if (HEAD.earL) { rotW(HEAD.earL, fwd, ears * D2R); rotW(HEAD.earR, fwd, -ears * D2R); }
  bodyReachApply(); bodyFloor();
}
/* 蹲多低由骨架自己決定：(1) 每條腿從最上面的關節到「遠端那一節上端」的距離，不能短於上面兩節折到關節上限時的長度（否則遠端那一節只能躺平，看起來像趴著）；
   (2) 軀幹外皮最低點至少離地 2.5 公分。不夠就把整個身體抬高到剛好夠（連續，不會跳）。 */
let TORSOG = null; const BF = { up: 0, mn: 0, need: 0, m: (typeof location !== 'undefined' && /[?&]bfm=([-\d.]+)/.test(location.search)) ? +RegExp.$1 : 6, on: !(typeof location !== 'undefined' && /[?&]bf=0/.test(location.search)) };
function torsoPts() { if (TORSOG) return TORSOG; const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const v = V(), A = [], under = (b, r) => { for (let o = b; o && o.isBone; o = o.parent) if (o === r) return true; return false; };
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones, skip = bs.map(b => LEGS.some(L => under(b, L.s)) || (TAIL[0] && under(b, TAIL[0])) || (HEAD.head && under(b, HEAD.head)));
    for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; if (skip[SI.getComponent(i, k)]) continue; m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())); A.push({ m, i, y: p.y, z: p.z }); } }
  if (!A.length) return (TORSOG = []); let z0 = 1e9, z1 = -1e9; for (const a of A) { z0 = Math.min(z0, a.z); z1 = Math.max(z1, a.z); } const N = 16, bins = new Array(N).fill(null);
  for (const a of A) { const k = Math.min(N - 1, Math.floor((a.z - z0) / Math.max(1e-6, z1 - z0) * N)); if (!bins[k] || a.y < bins[k].y) bins[k] = a; } return (TORSOG = bins.filter(Boolean)); }
/* 軀幹下緣在某個前後位置的高度（用上一格算好的外皮位置，每格只算一次）：空中的前腳目標如果比它高，代表腳會埋進胸口的毛裡，就壓到它下面 */
const _TB = { n: -1, P: [] };
function torsoBottomAt(p) { const T = torsoPts(); if (!T.length) return null; if (_TB.n !== ctl.fc) { _TB.n = ctl.fc; _TB.P = T.map(s => { const v = V(); s.m.getVertexPosition(s.i, v); return stage.worldToLocal(s.m.localToWorld(v)); }); }
  const fwd = axes().fwd, z = p.dot(fwd); let y = null, wsum = 0; for (const q of _TB.P) { const w = 1 - Math.abs(q.dot(fwd) - z) / 0.12; if (w <= 0) continue; y = (y || 0) + w * q.y; wsum += w; } return wsum > 0.2 ? [y / wsum, sm(0.2, 0.8, wsum)] : null; }
/* 第三代：身體跟著腳（搆不到就沉身）。踩在世界上的腳如果離腿根太遠、腿會被拉直，就把那一端的身體放低到剛好搆得到——
   像被往後推時壓低身體撐住，而不是腳在地上被拖著滑。前後分開算（前腳搆不到→前半身低、後腳搆不到→後半身低），進得快、退得慢，不會跳。 */
const WS = { x: 0, z: 0, vx: 0, vz: 0, w: 2 * Math.PI * 3.5, ax: 0, az: 0, on: !(typeof location !== 'undefined' && /[?&]ws=0/.test(location.search)) };
const BR = { f: 0, h: 0, cap: (typeof location !== 'undefined' && /[?&]brc=([\d.]+)/.test(location.search)) ? +RegExp.$1 : 0.09, on: !(typeof location !== 'undefined' && /[?&]br=0/.test(location.search)), k: null };
function bodyReach() { if (!BR.on || !LEGS[0].c) return; const dt = INR.dt || 0.0167; let nF = 0, nH = 0;
  if (!BR.k) { const yy = k => { let a = 0, n = 0; for (const L of LEGS) if (L.kind === k) { a += wp(L.s).y; n++; } return a / Math.max(1, n); }, q0 = HEAD.hips.quaternion.clone(), f0 = yy('F'), h0 = yy('H'); rotW(HEAD.hips, axes().right, 0.05); const aF = (f0 - yy('F')) / 0.05, aH = (h0 - yy('H')) / 0.05; HEAD.hips.quaternion.copy(q0); HEAD.hips.updateMatrixWorld(true); BR.k = { aF, aH, ok: Math.abs(aF - aH) > 0.05 }; }
  for (const L of LEGS) { const c = L.c; if (!c.ok) continue; let wA = 1; if (c.air) { if (!GND || c.key || c.stp || !c.Wl || !(c.u > 0.5)) continue; wA = sm(0.5, 0.95, c.u); }      /* 地形上：快落地的擺盪腳先算進來（用它要落的那一點），身體提早就位，落地那一格不會搆不到 */ if (L.rLim == null) L.rLim = Math.max(L.d0, 0.97 * L.dMax, L.P0[0].distanceTo(L.P0[3]));
    const S = wp(L.s), a = c.air ? stage.worldToLocal(c.Wl.clone()) : ctLocal(L), gF = c.air ? c.gl || 0 : c.g || 0, r2 = (S.x - a.x) ** 2 + (S.z - a.z) ** 2, h = Math.sqrt(Math.max(L.rLim * L.rLim - r2, 0.36 * L.rLim * L.rLim)), need = wA * (S.y + (GND ? TG.kb * (L.kind === 'F' ? TG.gf : TG.gh) - gF : 0) - L.hy - h);      /* 這時身體姿勢剛設好、還沒套修正，量到的就是「不修正會差多少」 */
    if (L.kind === 'F') nF = Math.max(nF, need); else nH = Math.max(nH, need); }
  return [nF, nH]; }
function bodyReachApply(terrOnly) { if (terrOnly && !GND) return; const r = bodyReach(); if (!r) return; if (GND) { let gf = 0, gh = 0, nf = 0, nh = 0; for (const L of LEGS) { const g = gAt(toWorld(V(L.anchor.x, 0, L.anchor.z))); if (L.kind === 'F') { gf += g; nf++; } else { gh += g; nh++; } } const e = TG.snap ? 1 : 1 - Math.exp(-(INR.dt || 0.0167) / 0.1); TG.snap = false; TG.gf += (gf / Math.max(1, nf) - TG.gf) * e; TG.gh += (gh / Math.max(1, nh) - TG.gh) * e; }      /* 第四代：前後兩端的身體高度跟著「站位正下方」的地面走（不用腳的平均，否則會隨步伐相位上下晃） */
  const dt = INR.dt || 0.0167, ap = (x, t) => t > x ? Math.min(t, x + 4 * dt) : Math.max(t, x - 1.0 * dt); const cp = terrOnly ? Math.min(BR.cap, LCAP) : BR.cap; BR.f = ap(BR.f, Math.min(cp, r[0])); BR.h = ap(BR.h, Math.min(cp, r[1]));      /* 走跑時「搆不到就沉身」最多沉一點點：腳搆不到就該抬腳換步，不是整隻趴下去（猛虎橫退時前半身沉 9 公分＝縮成一團） */
  const dF = BR.f - TG.kb * TG.gf, dH = BR.h - TG.kb * TG.gh; if (Math.abs(dF) < 1e-5 && Math.abs(dH) < 1e-5) return; const K = BR.k; let ph = K.ok ? clamp((dF - dH) / (K.aF - K.aH), -0.3, 0.3) : 0, y0 = K.ok ? dH - K.aH * ph : Math.max(dF, dH);
  root.position.y -= y0; root.updateMatrixWorld(true); if (ph) rotW(HEAD.hips, axes().right, ph); }
function bodyFloor() { if (!BF.on) return; const p2 = v => Math.hypot(v.y, v.z); let need = 0;
  for (const L of LEGS) { if (L.cDm == null) { const l1 = p2(L.V0[0]), l2 = p2(L.V0[1]); L.cDm = Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - L.maxE - BF.m * D2R))); L.cW = L.P0[2].clone().sub(L.P0[3]); }
    const s = wp(L.s), wT = toWorld(V(L.anchor.x, 0, L.anchor.z)); wT.y = L.P0[3].y; wT.add(L.cW.clone().applyQuaternion(root.quaternion)); const dy = s.y - wT.y, dz = s.clone().sub(wT).dot(axes().fwd), r2 = L.cDm * L.cDm - dz * dz; if (r2 > 0) need = Math.max(need, Math.sqrt(r2) - dy); }
  const T = torsoPts(); let mn = 1; if (T.length) { mn = skinMinY(T); need = Math.max(need, 0.025 - mn); }
  BF.mn = mn; BF.need = need; BF.up = Math.max(0, need); if (BF.up > 1e-5) { root.position.y += BF.up; root.updateMatrixWorld(true); } }
// 腳：planted＝固定在世界座標（第一次著地時記下），否則跟身體走
/* ================= 第三代：接觸層（2026-11-25 下午）=================
   第二代的腳是「跟著身體算」的：步態、招式都把落腳點寫成相對身體的位置，身體速度和預設不一樣時（起步、急停、轉彎、被推、落地）腳就在地上滑。
   第三代把順序反過來：每隻腳記的是「踩在世界上的哪一點」（L.c.W）。踩著的腳不動，身體從上面過去；要換位置只能抬起來跨一步。
   所有模式（走跑、待機、招式、受擊）共用同一份接觸狀態，換模式時腳不用重新猜位置。
   - 走跑：步態時鐘只決定「什麼時候抬腳」；抬腳時依身體實際的速度與轉向，預測落地那一刻身體會在哪，腳就落在那底下（Raibert 式落腳）。等速時軌跡和第二代完全相同。
   - 站定與招式：腳離站位太遠才跨步；離最遠的先跨，對角的兩隻可以一起跨，其餘一次一隻。
   - 招式裡照關鍵格飛的腳（飛撲、揮掌）：離地時先留在原地往上抬、再被身體帶走；落地前對準預測的落地點。 */
/* ================= 第四代：地形（2026-11-25 下午）=================
   遊戲給一個「這個世界座標的地面多高」的函式（OPT.ground 或 rig.setGround）。沒給＝平地，行為和第三代完全一樣。
   有給：每隻腳踩在它自己那一點的地面高度上（不是整隻生物共用一個平面）；擺盪時從離地點的高度走到落地點的高度、途中不低於腳下的地面；
   腳掌順著那一點的前後坡度；身體高度與前後傾斜跟著四隻腳的平均高度走。所有「離地多高」的判斷（防穿地、抬腳淨空、蹲低）都改成相對於那隻腳底下的地面。 */
let GND = OPT.ground || null; const TG = { snap: true, sW: 1, up: 1, gf: 0, gh: 0, e: 0.08, ps: (typeof location !== 'undefined' && /[?&]tps=([-\d.]+)/.test(location.search)) ? +RegExp.$1 : 1, kb: (typeof location !== 'undefined' && /[?&]tkb=([-\d.]+)/.test(location.search)) ? +RegExp.$1 : 1 };
function tgSync() { if (!GND && typeof window !== 'undefined' && window.__rigGround) GND = window.__rigGround; if (!GND) return; const ws = V(); stage.getWorldScale(ws); TG.sW = ws.x || 1; TG.up = Math.max(0.7, V(0, 1, 0).transformDirection(stage.matrixWorld).y); }
function gAt(p) { if (!GND) return 0; const w = stage.localToWorld(V(p.x, 0, p.z)), h = GND(w.x, w.z); if (!(h === h)) return 0; const d = (h - w.y) / (TG.sW * TG.up), ad = Math.abs(d); return ad < 0.3 ? d : d * (1 - sm(0.3, 0.45, ad)); }      /* 落差太大（橋邊、崖邊，超過肩高的四成）就不去踩，當作平地 */      /* 這一點的地面，比生物腳下的基準平面高多少（生物自己的尺度） */
function gSl(p, side) { if (!GND) return 0; const A = axes(), fwd = side ? A.right : A.fwd, e = TG.e; return clamp((gAt(V(p.x + fwd.x * e, 0, p.z + fwd.z * e)) - gAt(V(p.x - fwd.x * e, 0, p.z - fwd.z * e))) / (2 * e), -0.7, 0.7); }      /* 這一點沿身體前後方向的坡度 */
function ctGnd(L, p, wS = 1) { const c = L.c; if (!GND) { c.g = 0; c.sp = 0; c.sl = 0; c.sr = 0; return 0; } c.g = gAt(p); c.sl = gSl(p); c.sr = gSl(p, 1); const t = Math.atan(c.sl) * wS * TG.ps; c.sp = appr(c.sp || 0, t, 5 * (INR.dt || 0.0167)); return c.g; }      /* 記下這隻腳底下的地面高度與腳掌該順的坡度（腳掌角度每秒最多轉 290 度，不跳） */
const CT = { Z0: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0), O: new THREE.Vector3(), DIAG: { LF: 'RH', RH: 'LF', RF: 'LH', LH: 'RF' }, ORD: { LF: 0, RH: 1, RF: 2, LH: 3 } };
for (const L of LEGS) L.c = { W: new THREE.Vector3(), W0: new THREE.Vector3(), kW: new THREE.Vector3(), ok: false, air: false, key: false, stp: false, u: 0, su: 0, cyc: -1e9, h: 0, y0: 0, n: 0, dur: 0.2, lift: 0.04, d: 0, p0: 0, lp: 0, kt: 0, kTb: 0.1, yw: 0, tw0: 0, lpt: 0, lfl: 0, lpp: 0, dp: 0, dfl: 0, dpp: 0, fr: false };
const ctTw = c => { let d = c.yw - INR.yaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return d; }, appr = (x, t, m) => x + clamp(t - x, -m, m);      /* ctTw：踩下去之後身體轉了多少（腳掌要反向補回來） */
const ctLocal = L => stage.worldToLocal(L.c.W.clone());                                    /* 接觸點換成這隻生物自己的座標（y＝那一點的地面高度） */
const ctProj = p => stage.localToWorld(V(p.x, 0, p.z));                                    /* 自己座標裡的一點 → 世界上的地面點 */
const ctVel = () => { stage.getWorldPosition(CT.O); return stage.worldToLocal(CT.O.clone().add(INR.vw)); };      /* 身體這一格在世界上的速度，換成自己座標的向量（每秒） */
function ctPlant(L, p) { const c = L.c; c.W.copy(ctProj(p)); c.air = c.key = c.stp = false; c.ok = true; c.h = 0; c.n = 0; c.yw = INR.yaw; }
function ctReset() { for (const L of LEGS) ctPlant(L, V(L.anchor.x, 0, L.anchor.z)); TG.snap = true; }
/* 擺盪時在世界上「起點 → 落點」走了幾成：兩端速度都是零（離地、著地那一刻腳相對地面不動）；等速時換回身體座標就是原本的擺盪曲線 */
function ctSwingS(u, duty) { const m = -(1 - duty) / duty, u2 = u * u, u3 = u2 * u, H = (2 * u3 - 3 * u2 + 1) * -0.5 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * 0.5 + (u3 - u2) * m; return clamp((-m * u + H + 0.5) / (1 - m), 0, 1); }
/* 招式照關鍵格飛的腳。p＝這一格關鍵格給的掌根位置（自己座標）；回傳修正後的位置。
   離地：前 kTb 秒水平位置從「釘在原地」平順交給關鍵格（先抬、再被帶走）。落地前（landIn 秒內著地、land＝落地時相對身體的落點）：對準預測的世界落點。 */
function ctAir(L, p, { landIn = null, land = null } = {}) { const c = L.c, dt = INR.dt || 0.0167; if (!c.ok) ctPlant(L, p);
  if (!c.key) { const a = ctLocal(L); c.kTb = c.air ? 0 : clamp(0.05 + 0.3 * Math.hypot(a.x - p.x, a.z - p.z), 0.05, 0.2); c.key = true; c.kt = 0; c.kW.copy(c.W); }
  c.air = true; c.stp = false; c.kt += dt; const q = p.clone();
  if (c.kTb > 0 && c.kt < c.kTb) { const a = stage.worldToLocal(c.kW.clone()), w = sm(0, 1, c.kt / c.kTb); q.x = lerp(a.x, q.x, w); q.z = lerp(a.z, q.z, w);
    const S = wp(L.s), v = V(q.x - S.x, q.y + L.hy - HY - S.y, q.z - S.z), d = v.length(), lim = 0.95 * L.dMax; if (d > lim) { v.multiplyScalar(lim / d); q.set(S.x + v.x, S.y + v.y - L.hy + HY, S.z + v.z); }
    q.y = Math.max(q.y, HY + Math.min(0.04, 0.6 * Math.hypot(q.x - a.x, q.z - a.z))); }      /* 腳一旦在地面上移動就得先抬起來（不貼地平移） */      /* 離地後腳慢慢跟上身體；腿被拉到底時，腳順著腿的方向被帶離地面（蹬直後自然離地），不是貼著地被拖走 */
  if (land && landIn != null && landIn < 0.16) { const vl = ctVel(), t = Math.max(0, landIn), w = 1 - sm(0.02, 0.16, t); q.x = lerp(q.x, land.x + vl.x * t, w); q.z = lerp(q.z, land.z + vl.z * t, w); }
  c.W.copy(ctProj(q)); c.h = Math.max(0, q.y - HY); if (GND) { q.y += ctGnd(L, q, 0); c.gl = c.g; } return q; }
function ctStepStart(L, home, tw = 0, urgent = false, dHint = 0) { const c = L.c; c.und = false; const a = ctLocal(L), d = Math.max(dHint, Math.hypot(a.x - home.x, a.z - home.z));      /* dHint：被推開時「預計會差多少」（現在還沒差那麼遠，但這一步實際要跨那麼遠，抬腳高度照它算） */ c.air = true; c.stp = true; c.su = 0; c.W0.copy(c.W); c.y0 = c.h; c.d = d; c.tw0 = tw; c.dur = Math.min(0.12 + 0.2 * Math.min(0.4, d), urgent ? 0.11 : 1);
  c.lift = Math.max(0, Math.max((0.035 + 0.1 * Math.min(0.4, d)) * Math.min(1, d / 0.06), Math.abs(tw) > 0.3 ? 0.03 : 0) - 0.6 * c.h); }      /* 已經抬著的腳（走跑中途改成跨步）也要有弧度，不然後半段會貼著地面滑過去 */
/* 站定與招式裡「踩在地上」的腳（planted）：釘在世界上；離站位（anchor＋off）太遠就跨一步回去。planted=false＝照關鍵格飛（off 是相對站位的位移）。 */
function footC(L, st0, { off = [0, 0, 0], planted = true, pitch = 0, slant = 0, landIn = null, land = null, hold = false, mth = MVTH } = {}) {      /* hold＝這隻腳正在蹬地，不准跨步（由招式自己決定何時離地） */
  const fx = L.kind === 'F' ? -slant : slant, c = L.c, dt = INR.dt || 0.0167;
  if (!c.ok) ctPlant(L, V(L.anchor.x, 0, L.anchor.z));
  if (!planted) { const p = ctAir(L, toWorld(V(L.anchor.x + off[0], HY + off[1], L.anchor.z + off[2])), { landIn, land }); c.lpt = pitch; c.lfl = fx; c.lpp = 0; solveLeg(L, p, pitch, fx, 1, GND ? { g: c.g, sl: c.sl, sr: c.sr } : {}); return; }
  const home = V(L.anchor.x + off[0], 0, L.anchor.z + off[2]);
  if (c.key) { c.key = false; c.air = false; c.n = 0; c.h = 0; c.yw = INR.yaw; }                          /* 照關鍵格飛的腳著地：釘在它落下的地方 */
  if (c.air && !c.stp) ctStepStart(L, home);                                               /* 走跑中抬著的腳換到站定／招式：從現在的位置直接跨到站位 */
  let p, hgt = 0, sp = 0, yw = 0;
  if (!c.air) { p = ctLocal(L); const tw = ctTw(c), vl = INR.ok ? ctVel() : CT.Z0, d = Math.max(Math.hypot(p.x - home.x, p.z - home.z), Math.hypot(p.x - home.x - 0.1 * vl.x, p.z - home.z - 0.1 * vl.z)),      /* 也看「0.1 秒後會差多少」：被推開時不等腳被拖遠才跨 */ mv = INR.ok && (INR.vw.lengthSq() > 1e-4 || Math.abs(INR.wy) > 0.05), th = (mv ? mth : 0.04) * L.d0; c.n = d / L.d0 + 0.2 * Math.max(0, Math.abs(tw) - 0.2); yw = clamp(tw, -0.7, 0.7);
    if (hold) { /* 不跨 */ } else if (d > th || Math.abs(tw) > 0.45) { let go = true, nA = 0; const far = d > 0.3 * L.d0, urgent = d > 0.42 * L.d0 || L.grm > 0.004 || (L.dbg && L.dbg.err > 0.01);      /* urgent＝腿已經搆不到落腳點：不排隊，馬上抬（被擊退時會連跳幾步） */
      for (const o of LEGS) { if (o === L) continue; const oc = o.c, dg = o.id === CT.DIAG[L.id]; if (oc.air) { nA++; if (!dg && !far) go = false; continue; }
        if (!dg && (oc.n > c.n + 1e-3 || (Math.abs(oc.n - c.n) <= 1e-3 && oc.n * o.d0 > th && CT.ORD[o.id] < CT.ORD[L.id]))) go = false; }
      if (urgent ? nA < 3 : (go && nA < 2)) ctStepStart(L, home, tw, urgent, d); }
    else if (L.grm > 0.004 || (L.dbg && L.dbg.err > 0.01)) { let nA = 0; for (const o of LEGS) if (o !== L && o.c.air) nA++; if (nA < 3) { const sp0 = wp(L.s); ctStepStart(L, V(sp0.x + L.P0[3].x - L.P0[0].x, 0, sp0.z + L.P0[3].z - L.P0[0].z), tw, true); c.und = true; } } }      /* 身體姿勢把腿根帶離落腳點太遠（被打歪、往前頂）：這隻腳馬上跨到腿根正下方 */
  if (c.air) { if (c.und) { const sp0 = wp(L.s); home.set(sp0.x + L.P0[3].x - L.P0[0].x, 0, sp0.z + L.P0[3].z - L.P0[0].z); }
    const suP = c.su; c.su = Math.min(1, c.su + dt / c.dur); const e = sm(0, 1, c.su), a = stage.worldToLocal(c.W0.clone()), trem = (1 - c.su) * c.dur, vl = ctVel(), hz = V(home.x, 0, home.z).applyAxisAngle(CT.Y, (INR.ok ? INR.wy : 0) * trem); p = V(lerp(a.x, hz.x + vl.x * trem, e), 0, lerp(a.z, hz.z + vl.z * trem, e));      /* 跨步的落點＝「落地那一刻」站位在世界上的位置（身體還在動也不會落地後被拖著走） */ sp = c.lift > 0 ? Math.sin(Math.PI * c.su) : 0; hgt = c.y0 * (1 - e) + c.lift * sp; yw = clamp(c.tw0, -0.7, 0.7) * (1 - e);
    if (c.su >= 1 && suP > 0.8) { const q = ctLocal(L); p.x = q.x; p.z = q.z; }      /* 落地那一格：腳已經幾乎到位，就踩在上一格的位置（這一格身體忽然被推也不會帶著腳滑） */
    c.W.copy(ctProj(p)); c.h = hgt; p.y = ctLocal(L).y; if (c.su >= 1) { c.air = c.stp = c.und = false; c.n = 0; c.h = 0; c.yw = INR.yaw; } }
  if (GND) { p.y = ctGnd(L, p, c.air ? sm(0.6, 1, c.su) : 1); c.gl = c.g; } p.y += HY + hgt; const m = 7 * dt; c.lpt = appr(c.lpt, pitch - 0.3 * sp, m); c.lfl = appr(c.lfl, fx + 0.3 * sp, m); c.lpp = appr(c.lpp, 0, m);      /* 腳掌角度不跳：從上一格的角度以每秒 400 度以內轉到新目標 */
  const o = { yw, gr: !c.air, g: GND ? c.g : 0, sp: GND ? c.sp : 0, sl: GND ? c.sl : 0, sr: GND ? c.sr : 0 }; if (c.air && c.stp && STEPCL) { const S = wp(L.s), k = STEPCL * sm(0.55, 0.8, Math.hypot(p.x - S.x, p.y + L.hy - HY - S.y, p.z - S.z) / L.dMax); if (k > 0.05) o.clk = k; }      /* 腿已經折得很短（落地蹲著）就不硬抬，免得前臂折進上臂 */      /* 站著跨步：整片腳底（含爪尖）至少離地「抬腳高度的六成」，不然腳尖垂著、看起來像貼地拖過去 */ if (Math.abs(c.lpp) > 1e-3) { o.pp = c.lpp; o.toe = 0; } else if (sp > 0) o.toe = 1;
  L.fin = { n: ctl.fc, p: p.clone(), a: [c.lpt, c.lfl], o };
  solveLeg(L, p, c.lpt, c.lfl, 1, o);
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
function reachLeg(L, P, { droop = 0, paw = null, air = 0 } = {}, _r = 0) { const q = P.clone();
  if (paw != null) { q.y += L.hy - HY; const yb = torsoBottomAt(q), m = 0.3 * L.pw; if (yb && q.y > yb[0] - m) q.y = lerp(q.y, yb[0] - m, yb[1] * Math.min(1, 3 * air)); headClear(q, 1.2 * L.pw); q.y -= L.hy - HY; }
  { const S = wp(L.s), ex = Math.hypot(q.x - S.x, q.y + L.hy - HY - S.y, q.z - S.z) / L.dMax; var dE = droop * sm(0.5, 0.75, ex); }      /* 腿已經折得很短（起跳前蹲著）就不再額外彎，免得前臂折進上臂裡 */
  if (L.c) { L.c.lpt = 0; L.c.lfl = 0.8 * dE * D2R; L.c.lpp = 0; }      /* 落地交給接觸層時，腳掌角度從這裡的值接上（不從很久以前的舊值慢慢轉） */
  const g = GND && L.c ? L.c.g || 0 : 0; solveLeg(L, q, 0, 0.8 * dE * D2R, 1, GND && L.c ? { g, sl: L.c.sl, sr: L.c.sr } : {});
  if (paw != null && air > 1e-3) { const { right } = axes(), q0 = L.h.quaternion.clone(), hw = wp(L.h), md = hw.clone().sub(wp(L.w)).normalize(), td = md.applyAxisAngle(right, paw * D2R); aim(L.h, L.t, hw.addScaledVector(td, L.l4)); const q1 = L.h.quaternion.clone(); L.h.quaternion.copy(q0).slerp(q1, Math.min(1, 3 * air)); L.h.updateMatrixWorld(true);
    if (_r < 4 && q.y - HY - g < 0.25) { const mn = soleMin(L) - g; if (mn < -0.002) { const P2 = P.clone(); P2.y -= 1.25 * mn; return reachLeg(L, P2, { droop, paw, air }, _r + 1); } } } }      /* 腳掌轉向後爪尖如果低於地面，整隻腳抬高再解（最多兩次） */
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
function solveArm(L, paw0, { droop = 0, paw = null, out = 0.3, upP = 0, fl = 0 } = {}, _g = 0) { const pawW = paw0.clone(); pawW.y += L.hy - HY; L.s.position.copy(rest.get(L.s).p); L.s.updateMatrixWorld(true);      /* 高度基準換成這隻腳自己的；空中的腳不伸進頭裡；肩胛先回原位（重解時才不會重複滑動） */
  const { fwd, right, up } = axes(), side = right.clone().multiplyScalar(-L.side);
  if (SCAP) { const sw0 = wp(L.s), rel = pawW.clone().sub(sw0), sl = Math.max(-SCAP, Math.min(SCAP, 0.3 * rel.dot(fwd))), so = Math.max(-0.03, Math.min(0.03, 0.2 * rel.dot(side)));
    L.s.position.copy(S2B(L.s.parent, sw0.addScaledVector(fwd, sl).addScaledVector(side, so))); L.s.updateMatrixWorld(true); }
  const sw = wp(L.s), n = pawW.clone().sub(sw).normalize(), m = n.clone().applyAxisAngle(right, (OPT.dr0 ? -1 : L.sW) * droop * D2R), wT = pawW.clone().addScaledVector(m, -L.l3);
  const pole = fwd.clone().multiplyScalar(-L.sE).addScaledVector(side, out).addScaledVector(up, upP);
  const eT = twoBone(sw, wT, L.l1, L.l2, pole); aim(L.s, L.e, eT); aim(L.e, L.w, wT); aim(L.w, L.h, pawW);
  const g = GND && L.c ? L.c.g || 0 : 0, spG = GND && L.c ? L.c.sp || 0 : 0;
  if (paw == null) setPaw(L, spG, spG, right); else { const hw = wp(L.h), md = hw.clone().sub(wp(L.w)).normalize(), td = md.applyAxisAngle(right, paw * D2R); aim(L.h, L.t, hw.addScaledVector(td, L.l4));
    if (fl > 1e-3) { const qh = L.h.quaternion.clone(), qt = L.t.quaternion.clone(); setPaw(L, 0, 0, right); L.h.quaternion.copy(qh.slerp(L.h.quaternion.clone(), fl)); L.t.quaternion.copy(qt.slerp(L.t.quaternion.clone(), fl)); L.h.updateMatrixWorld(true); } }      /* fl：收招落地前把腳掌慢慢放平（「掌朝下 90 度」只對腳掌短的骨架剛好是平的；腳掌長的骨架落地那一格會翻一下） */      /* 沒指定腳掌角度＝撐在地上的腳：腳底平貼（站姿朝向） */
  if (_g < 4 && pawW.y - HY - g < 0.2) { const mn = soleMin(L) - g; if (mn < -0.002) { const p2 = paw0.clone(); p2.y -= 1.25 * mn; return solveArm(L, p2, { droop, paw, out, upP, fl }, _g + 1); } }
}
const LF = LEGS.find(L => L.id === 'LF'), RF = LEGS.find(L => L.id === 'RF');

// ---- 撲咬 ----
modes.Dpounce = { init() { SOFT = true; SCAP = 0.045; this.T = 2.0; this.D = 1.75; this.sp = { neck: new Spr(320, 20), chest: new Spr(380, 26), tail: new Spr(120, 12), ear: new Spr(600, 13) }; this.pin = {};
    this.zk = [[0, 0], [0.30, -0.10, 's'], [0.42, 0, 'q'], [1.2, 0, 's']]; this.G = {}; },
  step(dt) { const tr = this.tIn; if (this.fresh || !this.G.LF) { this.fresh = false; this.lk = 0; this.tlE = 0; this.exH = null; this.aE = {}; this.exP = {}; this.trP = null; this.F0 = {}; root.position.set(0, 0, 0); this.base = 0; resetPose(); root.updateMatrixWorld(true); root.updateMatrixWorld(true);
      for (const L of [LF, RF]) { const g = toWorld(V(L.anchor.x, 0, L.anchor.z)); g.y = HY; this.G[L.id] = g; } for (const k in this.sp) this.sp[k].reset(); }
    const t = tr, D = 0; resetPose();
    const z = kf(this.zk, t); let y;
    if (t < 0.42) y = kf([[0, 0], [0.30, -0.17, 's'], [0.42, 0.10, 'q']], t); else if (t < 0.66) { const u = (t - 0.42) / 0.24; y = (0.10 + 0.96 * u - 1.12 * u * u) * (this.yk || 1); } else y = kf([[0.66, -0.06], [0.72, -0.09, 'o'], [0.95, 0, 's']], t);      /* 落地緩衝：蹲得淺一點、起身快一點（原本落地後一直蹲著） */
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
    /* 蹬地：出招時遊戲把整隻往前推，後腳釘在世界上（接觸層）；腿伸到可達長度的 84% 就離地，不會被拉成一直線 */
    const rate = this.trP != null && dt > 0 ? (tr - this.trP) / dt : 0; this.trP = tr; this.lk = (this.lk || 0) + Math.max(0, INR.dz || 0);
    if (!hAir && t < tl && !this.tlE) { let ex = 0; for (const L of LEGS) if (L.kind === 'H') { const pp = ctLocal(L); pp.y = L.hy; ex = Math.max(ex, wp(L.s).distanceTo(pp) / L.dMax); } const de = this.exH != null && dt > 0 ? Math.max(0, ex - this.exH) / dt : 0; this.exH = ex; if (ex + 0.012 * de > 0.84 && this.lk > 0.02) this.tlE = t; }      /* 後腳蹬到底才離地（只多看不到一格，避免下一格被拉直） */
    TLIM = TL0 - 17 * sm(tl - 0.14, tl, t) * (1 - sm(tdn - 0.02, tdn + 0.12, t));
    for (const L of LEGS) if (L.kind === 'H') footC(L, this, { off: hAir ? hOff : [0, 0, 0], planted: !hAir, pitch: hAir ? -0.5 * Math.sin(Math.PI * (t - tl) / (tdn - tl)) : 0, slant: hAir ? kf([[tl, -0.25], [0.52, -0.9, 's'], [tdn, 0.1, 's']], t) : 0,
      landIn: hAir && rate > 0 ? (tdn - t) / rate : null, land: V(L.anchor.x, 0, L.anchor.z), hold: t > 0.2 && t < tl });      /* 蓄力前段還可以把腳站回站位（走著走著直接出招時，腳原本停在步伐中途的位置） */
    // 前腳：先收到胸前、再往前伸、掌張開，落地後肘自然吸震（左腳稍微領先，不要完全對稱）
    const { fwd, right, up } = axes();
    for (const L of [LF, RF]) { const lag = L.side > 0 ? 0 : 0.03, a1 = 0.66 + lag * 0.4; let a0 = this.aE[L.id] || 0.35 + lag;
      if (!this.aE[L.id] && t <= a0 && t > 0.2 && this.lk > 0.02) { const pp = ctLocal(L); pp.y = L.hy; const ex = wp(L.s).distanceTo(pp) / L.dMax, e0 = this.exP[L.id], de = e0 != null && dt > 0 ? Math.max(0, ex - e0) / dt : 0; this.exP[L.id] = ex; if (ex + 0.05 * de > 0.82) a0 = this.aE[L.id] = t - 1e-4; }      /* 前腳也照接觸來：身體已經往前衝、腿快被拉直就提早離地，不等時間表 */
      if (t <= a0 || t >= a1) { footC(L, this, { hold: t <= a0 && t > 0.2 }); if (t <= a0) this.F0[L.id] = L.c.W.clone(); }      /* 踩地的時候：釘在世界上（起跳前被往前推不滑；落地後身體從腳上方過去，再小跨步回站位） */
      else { const a = (t - a0) / (a1 - a0), S = wp(L.s), side = right.clone().multiplyScalar(-L.side), tau = rate > 0 ? (a1 - t) / rate : 0, vl = ctVel();
        const G0 = stage.worldToLocal((this.F0[L.id] || L.c.W).clone()); G0.y = HY; const G1 = V(L.anchor.x + vl.x * tau, HY, L.anchor.z + vl.z * tau);      /* 起點＝離地的那一點（留在世界上）；終點＝落地那一刻身體底下的站位 */
        const tuck = S.clone().addScaledVector(fwd, 0.06).addScaledVector(up, -0.40).addScaledVector(side, 0.02), reach = S.clone().addScaledVector(fwd, 0.46).addScaledVector(up, OPT.pReachUp == null ? -0.20 : OPT.pReachUp).addScaledVector(side, 0.05);
        const P = ctAir(L, crom([G0, tuck, reach, G1], kf([[0, 0], [0.32, 1, 's'], [0.72, 2, 's'], [1, 3, 'q']], a)));      /* 離地那一段改成慢起（原本第一格就衝出 60%，像瞬移） */
        reachLeg(L, P, { droop: kf([[0, 0], [0.32, 38, 's'], [0.72, -8, 's'], [1, 0, 'q']], a), paw: kf([[0, 90], [0.32, 55, 's'], [0.72, 30, 's'], [1, 90, 'q']], a), air: Math.sin(Math.PI * a) }); } }
    const td = this.sp.tail.step(kf([[0, 0.15], [0.30, 0.45, 's'], [0.5, -0.18, 'q'], [0.70, -0.05], [0.8, 0.25, 'o'], [1.3, 0.15, 's']], t - 0.08), dt);
    tail(i => (t < 0.32 ? Math.sin(st.t * 26) * 0.07 * sm(0.05, 0.25, t) : 0) * (1 + i * 0.3), td, dt);
  } };

// ---- 揮掌（左前腳，靠鏡頭那隻） ----
modes.Dswipe = { init() { SOFT = true; SCAP = 0.045; this.T = 1.7; this.sp = { neck: new Spr(320, 20), yaw: new Spr(420, 24), roll: new Spr(380, 24), tail: new Spr(110, 11), ear: new Spr(600, 13) }; this.pin = {}; this.G = null; },
  step(dt) { const tr = this.tIn; if (this.fresh || !this.G) { this.fresh = false; this.GW = null; root.position.set(0, 0, 0); this.base = 0; resetPose(); root.updateMatrixWorld(true); root.updateMatrixWorld(true);
      const g = toWorld(V(LF.anchor.x, 0, LF.anchor.z)); g.y = HY; this.G = g; for (const k in this.sp) this.sp[k].reset(); }
    const TH = 0.36, t = tr; resetPose();
    // 身體：後腳、骨盆先動，胸、頭依序跟上；蓄力往反方向擰，出招急轉
    root.position.x = kf([[0, 0], [0.22, -0.045, 's'], [TH, 0.03, 'q'], [0.55, 0.02, 'o'], [1.0, 0, 's']], t);
    root.position.z = this.base + kf([[0, 0], [0.22, -0.07, 's'], [TH, 0.08, 'q'], [0.50, 0.08, 'o'], [0.9, 0, 's']], t);      /* 揮完不要一直往前壓著（腳在後面、身體在前面＝縮成一團） */
    const y = kf([[0, 0], [0.22, -0.06, 's'], [0.29, -0.01, 's'], [TH, -0.07, 'q'], [0.42, -0.08, 'o'], [0.85, 0, 's']], t);
    const yawK = [[0, 0], [0.22, 17, 's'], [TH, -15, 'q'], [0.46, -19, 'o'], [1.05, 0, 's']], rollK = [[0, 0], [0.22, 6, 's'], [TH, -8, 'q'], [0.46, -10, 'o'], [1.05, 0, 's']];
    const cy = this.sp.yaw.step(kf(yawK, t - 0.02), dt), hy = kf(yawK, t + 0.03) * 0.35, cr = this.sp.roll.step(kf(rollK, t - 0.02), dt);
    const neckP = this.sp.neck.step(kf([[0, 0], [0.22, 8, 's'], [TH, -9, 'q'], [0.6, -3, 's'], [1.05, 0, 's']], t - 0.05), dt);
    poseBody({ y: y * (OPT.swBy || 1), pitch: kf([[0, 0], [0.22, 5, 's'], [TH, -6, 'q'], [0.46, -8, 'o'], [1.05, 0, 's']], t) * (OPT.swBy || 1) - (OPT.swHp || 0) * sm(0.3, 0.5, t) * (1 - sm(0.8, 1.05, t)), yaw: hy, roll: cr * 0.35, neckP: neckP + (OPT.swNk || 0) * sm(0.25, 0.45, t) * (1 - sm(0.85, 1.1, t)), neckY: -(cy * 0.75 + hy),
      jaw: kf([[0, 0], [0.15, 16, 's'], [0.7, 16], [1.05, 0, 's']], t), ears: this.sp.ear.step(kf([[0, 0], [0.15, -28, 's'], [TH, -36, 'q'], [0.42, -18, 'o'], [0.8, -26, 's'], [1.1, 0, 's']], t - 0.06), dt) });
    if (tr > TH && tr < TH + 0.05) { root.position.x += Math.sin(tr * 200) * 0.006; root.updateMatrixWorld(true); }
    const { fwd, right, up } = axes(); rotW(HEAD.chest, up, cy * D2R); rotW(HEAD.chest, fwd, cr * 0.65 * D2R); rotW(HEAD.neck, fwd, kf([[0, 0], [0.22, 4, 's'], [TH, 10, 'q'], [0.7, 4, 's'], [1.05, 0, 's']], t - 0.05) * D2R);
    for (const L of LEGS) if (L !== LF) { if (L === RF) { if (!RF.c.ok) ctPlant(RF, V(RF.anchor.x, 0, RF.anchor.z)); if (RF.c.air) footC(RF, this, {}); else { const pr = ctLocal(RF), dH = Math.hypot(pr.x - RF.anchor.x, pr.z - RF.anchor.z), twR = ctTw(RF.c); if (dH > 0.08 * RF.d0 || Math.abs(twR) > 0.45) { ctStepStart(RF, V(RF.anchor.x, 0, RF.anchor.z), twR, true, dH); footC(RF, this, {}); }      /* 支撐腳離站位太遠（出招前停在步伐中途、或蓄力時被遊戲轉向）：先跨回站位 */ else { RF.c.lpt = RF.c.lfl = RF.c.lpp = 0; if (GND) pr.y = ctGnd(RF, pr); pr.y += HY; solveArm(RF, pr, { out: 0.45 }); } } }      /* 支撐的右前腳：釘在世界上 */ else footC(L, this, {}); }
    // 攻擊掌：沿弧線走（往外抬 → 頂點停一下 → 由外往內往下急掃 → 扣下 → 收回），不從臉中間穿過
    const o = Math.sign(LF.anchor.x) || 1, A = LF.anchor, pts = [[0, 0, 0], [0.12 * o, 0.20, 0.04], [0.26 * o, 0.46, 0.14], [0.20 * o, 0.52, 0.34], [-0.10 * o, 0.20, 0.46], [-0.19 * o, 0.05, 0.32], [0, 0, 0]];
    if (!LF.c.ok) ctPlant(LF, V(A.x, 0, A.z)); if (!this.GW) this.GW = LF.c.W.clone(); const tw0 = stage.worldToLocal(this.GW.clone()); if (GND) tw0.y = 0; tw0.y += HY; const loc0 = V(A.x, HY, A.z),      /* 起點與收回點＝出招前踩的那一點（留在世界上） */ P = pts.map((p, i) => (i === 0 || i === 6) ? null : toWorld(V(loc0.x + p[0] * (p[0] * o > 0 ? (OPT.swXo || 1) : (OPT.swXi == null ? 1 : OPT.swXi)), loc0.y + p[1] * (i >= 4 ? (OPT.swYr || 1) : (OPT.swY || 1)), loc0.z + p[2] * (i <= 3 ? (OPT.swZ || 1) : (OPT.swZr || 1))))); P[0] = tw0; P[6] = loc0;      /* 收回時落在站位（出招前如果腳停在別處，不要收回到那個舊位置） */
    const sidx = kf([[0, 0], [0.13, 1, 's'], [0.22, 2, 'o'], [TH, 4, 'q'], [0.50, 5, 'o'], [0.95, 6, 's']], t), pw = crom(P.map(p => ({ x: p.x, y: p.y, z: p.z })), sidx);
    // 臉頰安全區：掌進到頭附近就往外推
    const hc = wp(HEAD.head).addScaledVector(fwd, 0.10), dv = pw.clone().sub(hc), R = OPT.faceR || 0.34; if (dv.length() < R) pw.copy(hc).addScaledVector(dv.normalize(), R);
    pw.y = Math.max(HY, pw.y); LF.c.key = true; LF.c.air = true; LF.c.stp = false; LF.c.lpt = LF.c.lfl = LF.c.lpp = 0; LF.c.W.copy(ctProj(pw)); LF.c.h = pw.y - HY; if (GND) pw.y += ctGnd(LF, pw, 0);
    solveArm(LF, pw, { droop: kf([[0, 0], [1, 30, 's'], [2, 40, 's'], [3, -5, 'q'], [4, 8, 'l'], [5, 26, 'o'], [6, 0, 's']], sidx) * (sidx > 3 ? lerp(1, OPT.swDr == null ? 1 : OPT.swDr, sm(3, 4, sidx) * (1 - sm(5, 6, sidx))) : 1), paw: 90 - (90 - kf([[0, 90], [1, 70, 's'], [2, 42, 's'], [3, 28, 'q'], [4, 60, 'l'], [5, 84, 'o'], [6, 90, 's']], sidx)) * (sidx < 2.6 ? (OPT.swPw || 1) : 1),
      out: kf([[0, 0.45], [2, 1.0, 's'], [4, 0.8], [6, 0.45, 's']], sidx), upP: kf([[0, 0], [2, 0.35, 's'], [4, 0.15], [6, 0, 's']], sidx), fl: sm(5.2, 6, sidx) });
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
  for (const L of LEGS) { const [a, b] = R[L.id]; span = Math.min(span, b - a); cz[L.id] = clamp((a + b) / 2, -0.15, 0.15); } const S = Math.min(G.S, span * 0.92) * ((OPT.strK || {})[n] || QN('strk' + n[0], 1)); FIT[n] = { S, cz, v: S / (G.duty * G.T), st: straddle(n, G, S, cz, R) }; }
modes.Cidle.init(); modes.Dpounce.init(); modes.Dswipe.init(); SCAP = 0.06;
const OFFS = { walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, trot: { LH: 0, LF: 0.5, RH: 0.5, RF: 1.0 }, gallop: { LH: 0, LF: 0.42, RH: 0.08, RF: 0.52 } };
const NUM = ['T', 'duty', 'crouch', 'liftF', 'liftH', 'bob', 'pitchA', 'roll', 'yaw', 'flex', 'headK'];
const PROF = Object.assign({ warnY: -0.21, warnP: -10 }, OPT.prof || {});
const ctl = { mode: '', ph: 0, still: 0, bl: 1, fromQ: bones.map(b => b.quaternion.clone()), fromP: bones.map(b => b.position.clone()), lastQ: bones.map(b => b.quaternion.clone()), lastP: bones.map(b => b.position.clone()), fromR: V(), lastR: V(), fromRq: Q(), lastRq: Q(), pin: {}, blDur: 0.16, fl: -1, flWait: 6 + 14 * Math.random() };
function loco(v, dt) { const vt = FIT.trot.v, vw = FIT.walk.v, vg = FIT.gallop.v; if (ACCG && INR.ok) { const cap = Math.max(vw, 1.25 * (INR.vS || 0) + 0.2 * vt); ctl.vG = ctl.locoFresh || ctl.vG == null ? Math.min(v, cap) : Math.min(v, cap, ctl.vG + vg / ACCT * dt); v = ctl.vG; if (NOGB && ctl.gd) v = Math.min(v, lerp(vt * 1.1, 1e9, sm(0.45, 0.85, ctl.gd[1]))); }      /* 不是朝前跑（面向玩家往後退、橫著繞）就不進奔跑：奔跑有四腳騰空期，倒退或橫移時騰空看起來就是整隻縮成一團；改用小跑的腳步（永遠有腳踩地）、步頻加快 */      /* 步態跟著「實際已經跑多快」走：剛起步不直接進奔跑（奔跑有四腳騰空期，起步就騰空看起來像整隻縮起來），先走→小跑→再奔跑 */ let a = 'walk', b = 'trot', u = sm(vw * 1.1, vt * 0.9, v); if (v > vt) { a = 'trot'; b = 'gallop'; u = sm(vt * 1.15, Math.max(vt * 1.5, vg * 0.75), v); }
  const G = {}, A = GAITS[a], Bg = GAITS[b]; for (const k of NUM) G[k] = lerp(A[k], Bg[k], u); const wG = b === 'gallop' ? u : 0, S0 = lerp(FIT[a].S, FIT[b].S, u);
  for (const L of LEGS) L.cz = lerp(FIT[a].cz[L.id], FIT[b].cz[L.id], u);
  const vn = S0 / (G.duty * G.T), r = v / vn, cad = r < 1 ? Math.max(0.55, Math.sqrt(r)) : Math.min(OPT.cadMax || 1.7, r), Sx = S0 * Math.min(OPT.sxMax || 1.3, r / cad)      /* 短腿的生物（野豬）跑快時靠腳踩得更快，不靠把步子拉長（拉長會超出腿長，像要跌倒） */, amp = sm(0, 0.6, r);
  G.liftF *= Math.max(0.25, amp); G.liftH *= Math.max(0.25, amp);
  if (ctl.locoFresh) { ctl.locoFresh = false; let best = 0, bs = -1e9;      /* 剛開始走跑：挑一個起步相位，讓站著的腳從原地自然接上（不滑、不被拖過頭） */
    for (let i = 0; i < 48; i++) { const x = i / 48; let s = 0; const up = [];      /* 分數越高越好 */
      for (const L of LEGS) { const p = ((x + lerp(OFFS[a][L.id], OFFS[b][L.id], u)) % 1 + 1) % 1; if (p < G.duty) { const e = Math.max(0, 0.5 - p / G.duty); s -= 4 * e * e; if (L.kind === 'H') s += 0.25; } else up.push(L); }      /* 站著的腳在站位＝「撐到一半」的位置：相位太早的腳之後會被拖過頭，扣分；後腳在撐，加分 */
      if (up.length === 2 && CT.DIAG[up[0].id] !== up[1].id) s -= 3; else if (up.length > 2) s -= 3 + 3 * (up.length - 2);      /* 第一步同時抬的腳：一隻、或一組對角（像小跑起步）最穩 */
      if (s > bs) { bs = s; best = x; } }
    ctl.ph = Math.floor(ctl.ph) + 1 + best; for (const L of LEGS) { const pr = ctl.ph + lerp(OFFS[a][L.id], OFFS[b][L.id], u), cy = Math.floor(pr), p = pr - cy; L.c.cyc = FRSK && p >= G.duty && (p - G.duty) / (1 - G.duty) > 0.3 ? cy : -1e9; L.c.fr = true; } }      /* 起步那一刻，照時鐘「這一步已經擺了三成以上」的腳不再補抬（補抬會晚抬、慢放，跟下一隻疊成三隻腳同時懸空），等下一輪 */
  const ra = INR.ok ? clamp(Math.max(INR.vf, Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1)) / Math.max(v, 1e-3), 0, RAMAX) : 1,      /* 步伐進度跟著「實際移動多少」走，不管往哪個方向：遊戲裡常常身體還沒轉過去就被往側面、甚至往後帶，只看往前的速度會讓步伐停住、四腳懸空 */ dph = dt * cad / G.T * ra; ctl.ph += dph; const ph = ctl.ph;      /* 步態時鐘跟著實際走過的距離轉（被擋住、被推快都不會踩空） */ resetPose(); root.position.set(0, 0, 0); const { fwd, right, up } = axes(), c = 2 * Math.PI * ph;
  const bob = lerp(G.bob * (0.5 + 0.5 * Math.cos(2 * c)), G.bob * (0.5 + 0.5 * Math.sin(c)), wG) * amp; root.position.y = bob - G.bob * 0.6 * amp - G.crouch + INR.y; root.updateMatrixWorld(true);
  const pitch = G.pitchA * D2R * Math.sin(c) * amp, roll = G.roll * D2R * Math.sin(c) * amp, yaw = G.yaw * D2R * Math.sin(c) * amp, fl = G.flex * D2R * Math.sin(c + 0.4) * amp;
  rotW(HEAD.hips, right, pitch + INR.pitch * D2R); rotW(HEAD.hips, fwd, roll + INR.roll * D2R); rotW(HEAD.hips, up, yaw * 0.5 - 0.4 * INR.bend * D2R); if (INR.bend && HEAD.spine) rotW(HEAD.spine, up, INR.bend * D2R); bodyReachApply(true);      /* 第三代：轉彎時脊椎側彎；第四代：身體高度與前後傾斜跟著地形（走跑時只跟地形，不做「搆不到就沉身」） */
  if (Math.abs(fl) > 1e-4) { rotW(HEAD.spine, right, -fl); rotW(HEAD.chest, right, fl * 1.2); }
  rotW(HEAD.chest, up, -yaw); rotW(HEAD.neck, right, -pitch * G.headK - fl * 0.8 + G.crouch * 0.6); rotW(HEAD.neck, up, yaw * 0.5 + INR.look * D2R + (INR.hk || 0));
  /* 第三代：步態時鐘只決定什麼時候抬腳。踩著的腳釘在世界上（身體從上面過去）；抬起的腳飛向「落地那一刻身體會在的位置」底下的落腳點。
     等速直走時和第二代的軌跡完全相同；差別在起步、變速、轉彎、被推：腳不再被身體拖著滑。先解後腿，再解前腿（前腿擺盪時要閃開同一側後腿）。 */
  const vl = ctVel(), nomSw = 1 - G.duty; let nAir = 0; for (const L of LEGS) if (L.c.air) nAir++;
  /* 步伐方向＝身體「實際」移動的方向（身體座標），不是永遠朝前。遊戲裡生物常在還沒轉過去時就被往側面、往後帶；步伐如果只會往前踏，腳一落地就被反方向拖走、馬上又得抬起來，四隻腳就一直懸在半空（看起來縮成一團）。直直往前走時方向就是正前方，和原本完全相同。 */
  { const sp = Math.hypot(vl.x, vl.z), gd = ctl.gd || (ctl.gd = [0, 1]), w = OMNI ? sm(0.12, 0.5, sp) : 0, tx = w * (sp > 1e-6 ? vl.x / sp : 0), tz = (1 - w) + w * (sp > 1e-6 ? vl.z / sp : 1), e = ctl.locoFresh0 ? 1 : 1 - Math.exp(-dt / 0.07); gd[0] += (tx - gd[0]) * e; gd[1] += (tz - gd[1]) * e; const n = Math.hypot(gd[0], gd[1]); if (n > 1e-3) { gd[0] /= n; gd[1] /= n; } else { gd[0] = 0; gd[1] = 1; } }
  const gdx = ctl.gd[0], gdz = ctl.gd[1], maxAir = v < vt * 1.15 ? 2 : 4;      /* 走路、小跑最多兩隻腳同時離地（奔跑才允許騰空） */
  for (const L of [LEGS[2], LEGS[3], LEGS[0], LEGS[1]]) { const cc = L.c, pr = ph + lerp(OFFS[a][L.id], OFFS[b][L.id], u), cyc = Math.floor(pr), p = pr - cyc, stn = p < G.duty, sd = lerp(FIT[a].st[L.kind], FIT[b].st[L.kind], u) * Math.min(1, r);
    const hx = L.ga.x + L.side * sd, hz = L.ga.z + (L.cz || 0), PE = (L.kind === 'F' ? 34 : 22) * D2R; let tw, f;
    if (!cc.ok) ctPlant(L, V(L.anchor.x, 0, L.anchor.z));
    if ((cc.key || cc.stp) && HOP && cc.h < 0.025) { const q = ctLocal(L); if (Math.hypot(q.x - hx, q.z - hz) < 0.35 * Sx + 0.03) { ctPlant(L, V(q.x, 0, q.z)); cc.tL = st.t; } }      /* 從招式／補步接過來、腳其實已經快貼地又在站位附近：直接踩下，不再整步擺盪（否則起步時三隻腳一起在空中 0.2 秒，像跳一下） */
    if (cc.key || cc.stp) { cc.key = cc.stp = false; cc.air = true; cc.u = 0; cc.W0.copy(cc.W); cc.y0 = cc.h; cc.p0 = -PE; cc.cyc = cyc; cc.fr = true; cc.tw0 = 0; cc.k1 = 1; cc.kh = QKH; cc.qk = true; cc.why = 'K'; }      /* 接過來的這一步是「把腳放回去」：抬低、少收、快放（原本照整步的弧度收腿，三隻腳一起收著半秒，看起來前半身縮在胸口下） */      /* 從招式或補步接過來、還在空中的腳：從現在的位置開始一次擺盪 */
    if (!cc.air) { const q = ctLocal(L), dz = (q.x - hx) * gdx + (q.z - hz) * gdz, lim = 0.5 * Sx + Math.max(0.04, 0.12 * Sx), over = dz < -lim || dz > lim || Math.abs((q.x - hx) * gdz - (q.z - hz) * gdx) > 0.16; cc.dz = [+dz.toFixed(3), +lim.toFixed(3), +((q.x - hx) * gdz - (q.z - hz) * gdx).toFixed(3), +gdx.toFixed(2), +gdz.toFixed(2), nAir, stn ? 1 : 0, cc.cyc === cyc ? 1 : 0];
      if ((!stn && (cc.cyc !== cyc || (RESW && wG < 0.5 && Math.abs(dz) > 0.55 * lim && st.t - (cc.tL || 0) > 0.18 && nAir < 2 && !LEGS.some(M => M !== L && M.side === L.side && M.c.air)))) || (over && (nAir < 2 || (FARL && wG < 0.5 && st.t - (cc.tL || 0) > 0.18 && Math.hypot(dz, (q.x - hx) * gdz - (q.z - hz) * gdx) > 1.5 * lim))) || (dz < 0 && (L.grm > 0.002 || (cc.rp != null && cc.rp2 != null && cc.rp + Math.max(0, cc.rp - cc.rp2) > 0.966 && (!RPLIM || gdz > 0.7 || (nAir < 2 && dz < -0.03)))))) {      /* 提早抬腳最多讓兩隻腳同時在空中（遊戲裡從停住猛加速時，四隻會一起被拉直、一起抬，看起來整隻縮成一團） */ cc.why = (!stn && cc.cyc !== cyc) ? 'S' : over ? 'O' : 'R'; cc.air = true;      /* 第三個條件：腿已經伸到底、或照這一格的速度下一格會伸到底（轉彎外側的後腳）就馬上抬 */ cc.u = 0; cc.W0.copy(cc.W); cc.y0 = 0; cc.cyc = cyc; cc.qk = false; cc.p0 = cc.lp; cc.tw0 = clamp(ctTw(cc), -0.6, 0.6); cc.k1 = K1ON ? clamp(0.3 + 0.7 * (0.5 * Sx - dz) / Math.max(1e-3, Sx), 0.62, 1) : 1; cc.kh = KHON ? clamp(0.25 + 0.75 * (0.5 * Sx - dz) / Math.max(1e-3, Sx), 0.55, 1) : 1; nAir++; } }      /* kh：這一步比穩態短（起步第一步只有半步）就抬低一點、少收一點 */      /* k1：這一步要走的距離比穩態短（起步的第一步從站位出發，只有半步）就擺快一點，不會收著腿等很久 */      /* 輪到它抬腳，或被身體拉得太遠（提早抬） */
    if (cc.air) { const du = Math.max(dph / nomSw, dt / (cc.qk ? 0.22 : (QK3 && nAir >= 3 && wG < 0.5) ? QKT : 0.5)) / (cc.k1 || 1), uR = cc.u + du; cc.u = Math.min(1, uR); const trem = (1 - uR) * dt / du,      /* 著地發生在這一格中間時 trem 是負的：落點照「著地那一刻」算，不會在最後一格往前跳 */ th = (INR.ok ? INR.wy : 0) * trem; if (cc.u < 0.65 || !cc.hF || du >= cc.u) cc.hF = [hx + 0.5 * Sx * gdx, hz + 0.5 * Sx * gdz]; const lp = V(cc.hF[0], 0, cc.hF[1]);      /* 擺盪後段不再跟著步態切換改站位（快落地時落點忽然換位置，腳會貼著地面滑過去） */
      if (Math.abs(th) > 1e-4) lp.applyAxisAngle(CT.Y, th); lp.x += vl.x * trem; lp.z += vl.z * trem;      /* 落地那一刻身體的位置與朝向（照現在的速度、轉向推算） */
      { let sh = 0, sx = 0; if (FPSEP) for (const o of LEGS) { if (o === L || o.c.air || o.side !== L.side || o.c.spg > 0.5) continue; const a = ctLocal(o), need = 0.5 * (L.pw + o.pw) - Math.abs(lp.x - a.x); if (need <= 0) continue; const lo = a.z - o.tipB - L.tipF - 0.01, hi = a.z + o.tipF + L.tipB + 0.01; if (lp.z > lo && lp.z < hi) { if (need <= 0.07) sx = (lp.x >= a.x ? 1 : -1) * need; else sh = (lp.z - lo < hi - lp.z ? lo : hi) - lp.z; } }
        if (cc.u < 0.7) { cc.lz = appr(cc.u < 0.05 ? 0 : cc.lz || 0, sh, 1.5 * dt); cc.lx = appr(cc.u < 0.05 ? 0 : cc.lx || 0, sx, 1.0 * dt); } lp.z += cc.lz || 0; lp.x += cc.lx || 0; }      /* 落點不踩在同側另一隻「還會踩一陣子」的腳上（起步、變速時後腳會追上前腳的腳印）：先往旁邊讓（最多 7 公分），不夠才前後讓一個腳掌；讓的量慢慢變、落地前不再改 */
      const Wl = ctProj(lp); cc.Wl = (cc.Wl || V()).copy(Wl); const pos = cc.W0.clone().lerp(Wl, ctSwingS(cc.u, G.duty)), k0 = 1 - sm(0, 0.3, cc.u); f = footPlan(L, G.duty + cc.u * nomSw * 0.99999, G, Sx); if (cc.kh < 1) { f.y = HY + (f.y - HY) * cc.kh; f.flex *= cc.kh; } if (L.kind === 'F' && OPT.swF) { f.flex *= OPT.swF; f.pitch *= OPT.swP == null ? 1 : OPT.swP; f.pp *= OPT.swP == null ? 1 : OPT.swP; }      /* 每種生物可調前腳擺盪時的收腿量與腳掌翻折（猛虎腿多一節，照預設會把腳掌翻到胸口下、肉墊朝外） */
      f.pitch += (cc.p0 + PE) * k0; f.pp += (cc.p0 + PE) * k0; cc.h = (f.y - HY) + cc.y0 * (1 - sm(0, 0.5, cc.u)); cc.W.copy(pos); tw = stage.worldToLocal(pos.clone()); tw.x = lerp(tw.x, cc.hF[0], 0.85 * gdz * gdz * Math.sin(Math.PI * cc.u) ** 2);      /* 轉彎時：擺盪中段（腿收起來的時候）腳回到自己那一側的軌道上，不會掃進肚子或別條腿；離地與落地兩端仍是世界上的點（不滑） */ if (GND) { const g0 = gAt(stage.worldToLocal(cc.W0.clone())), gl = gAt(lp), gc = ctGnd(L, tw, sm(0.6, 1, cc.u)); tw.y = Math.max(lerp(g0, gl, ctSwingS(cc.u, G.duty)), gc); cc.gl = gl; }      /* 第四代：從離地點的地面高度走到落地點的地面高度，途中不低於腳下的地面 */ tw.y += HY + cc.h;
      f.yw = cc.tw0 * k0; if (cc.u >= 1) { cc.air = false; cc.W.copy(Wl); cc.h = 0; cc.lp = 0; cc.yw = INR.yaw; cc.jl = true; cc.tL = st.t; nAir--; } }
    else { cc.spg = stn ? p / G.duty : 1; tw = ctLocal(L); if (GND) { tw.y = ctGnd(L, tw); cc.gl = cc.g; } tw.y += HY; f = footPlan(L, stn && cc.cyc !== cyc ? p : 0, G, Sx);      /* 這一輪已經（提早）擺過的腳，踩著時不做推蹬的抬腳跟 */ cc.lp = f.pitch; cc.h = 0; f.yw = clamp(ctTw(cc), -0.6, 0.6); }
    if (cc.fr) { cc.fr = false; cc.dp = cc.lpt - f.pitch; cc.dfl = cc.lfl - f.flex; cc.dpp = cc.lpp - f.pp; } { const m = 7 * dt; cc.dp = appr(cc.dp, 0, m); cc.dfl = appr(cc.dfl, 0, m); cc.dpp = appr(cc.dpp, 0, m); f.pitch += cc.dp; f.flex += cc.dfl; f.pp += cc.dpp; cc.lpt = f.pitch; cc.lfl = f.flex; cc.lpp = f.pp; }      /* 從別的動作接過來：腳掌角度從原本的角度平順接上 */
    const H = L.kind === 'F' ? LEGS.find(o => o.kind === 'H' && o.side === L.side) : null;
    const gO = GND ? cc.g : 0, spO = GND ? cc.sp : 0; L.fin = { n: ctl.fc, p: tw.clone(), a: [f.pitch, f.flex], o: { pp: f.pp, toe: f.toe, yw: f.yw, gr: !cc.air, g: gO, sp: spO, sl: GND ? cc.sl : 0, sr: GND ? cc.sr : 0 } };
    solveLeg(L, tw, f.pitch, f.flex, 1, { pp: f.pp, toe: f.toe, yw: f.yw, gr: !cc.air, g: gO, sp: spO, sl: GND ? cc.sl : 0, sr: GND ? cc.sr : 0, av: H ? legCaps(H) : null });
    if (cc.jl) { cc.jl = false; cc.rp = cc.rp2 = null; if (L.grm > 0.002) { const hp = wp(L.h); cc.W.copy(ctProj(hp)); } }
    if (!cc.air && L.dbg) { cc.rp2 = cc.rp; cc.rp = L.dbg.r; } else cc.rp = cc.rp2 = null; }      /* 記下這條腿伸了幾成（解腿時量的，含肩胛滑動）：下一格會伸過頭就先抬腳，不等被拖 */      /* 剛落地那一格如果腿搆不到預定落點：就釘在腳實際踩到的地方（不要下一格再滑過去） */
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
  if (OPT.rg) Object.assign(P, OPT.rg); { const q = typeof location !== 'undefined' ? location.search : ''; for (const k of ['flex1', 'flex2', 'abd', 'add', 'rollOver', 'rollC', 'rollA']) { const m = new RegExp('[?&]rg' + k + '=([\\d.]+)').exec(q); if (m) P[k] = +m[1]; } }      /* 倒地參數每種生物可改（OPT.rg）；網址 rgflex1= 等可試 */
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
        const d = tmp.copy(X[j]).multiplyScalar(2).sub(X[a]).sub(X[c]).multiplyScalar(0.5).dot(tmp2) * sign; if (d < 0) X[j].addScaledVector(tmp2, sign * (RGTW && S.t > 0.25 ? Math.min(-d * 0.5, RGB) : -d * 0.5)); };      /* 關節彎錯邊就推回來；倒下 0.25 秒後每次最多推一小段（身體翻滾時「哪邊才對」會換邊，不設上限的話關節會在一格內整個翻到另一邊） */
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
  function start(o) { prevH.clear(); root.updateMatrixWorld(true); const cur = [wp(LEGS[2].s), wp(LEGS[3].s), wp(LEGS[0].s), wp(LEGS[1].s)], b = basis(cur);
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
  function setDir(bone, dRest, dCur, hRef) { const z0 = dRest.clone().normalize(), z1 = dCur.clone().normalize(), h0 = B0.X.clone().addScaledVector(z0, -B0.X.dot(z0)).normalize(); let h1 = hRef.clone().addScaledVector(z1, -hRef.dot(z1)); const l2 = h1.lengthSq(), ph = RGTW && prevH.get(bone), php = ph ? ph.clone().addScaledVector(z1, -ph.dot(z1)) : null, pok = php && php.lengthSq() > 1e-4;
    if (!RGTW) { if (l2 < 0.02 && prevH.has(bone)) { const p0 = prevH.get(bone); h1 = p0.clone().addScaledVector(z1, -p0.dot(z1)); } if (h1.lengthSq() < 1e-6) h1.set(1, 0, 0); h1.normalize(); }
    else { if (pok) php.normalize(); if (l2 < 1e-6) h1 = pok ? php.clone() : V(1, 0, 0); else { h1.normalize(); if (pok) { h1 = php.clone().lerp(h1, sm(0.02, 0.35, l2)); if (h1.lengthSq() < 1e-6) h1.copy(php); h1.normalize(); const ang = php.angleTo(h1); if (ang > 0.3) h1 = php.clone().lerp(h1, 0.3 / ang).normalize(); } } }
    /* 扭轉參考軸：骨頭快要和參考軸平行時（腿壓在身體底下、橫著躺），參考方向會很敏感、一格就翻面——這時多相信上一格的方向，而且每格最多轉 17 度 */
    prevH.set(bone, h1.clone());
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
/* 倒地後尾巴受重力垂到地上（原本尾巴跟著骨盆整根翹在空中，猛虎尾巴長最明顯）。每節記一個「往下垂的角度」，每格依那一節末端離地多高慢慢加減；倒地姿勢每格會重設，所以不會累積 */
function tailDrop(dt, fresh) { if (TAIL.length < 2) return; ctl.tdK = fresh ? 0 : Math.min(1, (ctl.tdK || 0) + dt / 0.7); const k = sm(0, 1, ctl.tdK); if (k <= 0) return; root.updateMatrixWorld(true);
  const pb = wp(TAIL[0]), fh = wp(HEAD.neck).sub(pb); fh.y = 0; if (fh.lengthSq() < 1e-8) return; fh.normalize().negate();      /* 尾巴往身體後方攤平在地上（倒地姿勢每格會重設，所以每格從頭算；k 讓它在 0.7 秒內慢慢落下） */
  for (let i = 0; i < TAIL.length; i++) { const b = TAIL[i], c = i + 1 < TAIL.length ? TAIL[i + 1] : b.children.find(x => x.isBone); if (!c) continue; const p0 = wp(b), d = wp(c).sub(p0), L = d.length(); if (L < 1e-5) continue; d.divideScalar(L);
    const ty = clamp((gAt(p0) + 0.06 - p0.y) / L, -0.98, 0.98), t = fh.clone().multiplyScalar(Math.sqrt(1 - ty * ty)).add(V(0, ty, 0)).normalize(), ax = d.clone().cross(t), sn = ax.length(); if (sn < 1e-6) continue;
    rotW(b, ax.divideScalar(sn), Math.atan2(sn, d.dot(t)) * k); root.updateMatrixWorld(true); } }
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
    if (TAIL.length > 1) { const pb = wp(TAIL[0]), pt = wp(TAIL[TAIL.length - 1]), tip = pt.clone().add(pt.clone().sub(pb).multiplyScalar(0.15)); follow(F.tail, world(tip), dt); const a = bend(pb, tip, lag(F.tail, sW), F.tail.gain * wm * (OPT.tailK || 1), 0.7);
      if (a) { const ax = _ax.clone(), n = TAIL.length; let sw = 0; for (let i = 0; i < n; i++) sw += 0.4 + i / n; TAIL.forEach((b, i) => rotW(b, ax, a * (0.4 + i / n) / sw * 1.6)); } }
    root.updateMatrixWorld(true); }
  return { apply, reset, F, S }; })();
function plantAll(o = {}) { for (const L of LEGS) footC(L, ctl, o); }
/* ---------- 現成動畫片段（Meshy 動畫庫）：只拿來做引擎做不出來的專屬動作（例如嚎叫），走跑招式不用它 ---------- */
const CL = {}; for (const c of OPT.clips || []) { const T = []; for (const tr of c.tracks) { const i = tr.name.lastIndexOf('.'), b = B(tr.name.slice(0, i)), prop = tr.name.slice(i + 1); if (b && b.isBone && (prop === 'quaternion' || prop === 'position')) T.push({ b, prop, it: tr.createInterpolant() }); } CL[c.name] = { dur: c.duration, T }; }
function clipPose(c, t) { resetPose(); for (const k of c.T) { const v = k.it.evaluate(Math.min(c.dur, Math.max(0, t))); if (k.prop === 'quaternion') k.b.quaternion.fromArray(v); else k.b.position.fromArray(v); } root.updateMatrixWorld(true); }
/* 嚎叫（待機時偶爾來一次）：先低頭吸氣 → 後坐、仰頭、張嘴長嚎（帶一點顫動和左右晃）→ 收回 */
function howl(t, dt) { resetPose(); const up = kf([[0, 0], [0.45, -0.28, 's'], [1.05, 1, 's'], [2.9, 1], [3.5, 0.06, 's'], [3.8, 0, 's']], t), u = Math.max(0, up), vib = sm(0.85, 1, up) * Math.sin(t * 31), { right } = axes();
  poseBody({ y: -0.045 * u - 0.03 * Math.max(0, -up) * 3.5, pitch: 7 * up, chest: 7 * up, neckP: 30 * up + 0.9 * vib, neckY: 5 * Math.sin(t * 1.4) * u, jaw: 26 * sm(0.55, 1, up) + 1.6 * vib, ears: -34 * u });
  if (HEAD.neck2 && HEAD.neck2 !== HEAD.neck) rotW(HEAD.neck2, right, 15 * up * D2R); rotW(HEAD.head, right, 17 * up * D2R);
  for (const L of LEGS) footC(L, modes.Cidle, {}); tail(i => Math.sin(t * 1.6 - i * 0.6) * 0.10, lerp(0.15, 0.42, u), dt); }
/* 照關鍵格倒地（不用物理）：腿短、骨架少一節的生物，物理倒地會把腳甩來甩去。先腿軟跪下（腳釘地）→ 往一側翻倒躺平、四腳自然伸出去 → 落地小彈一下。每次都一樣、不會亂甩 */
function kdead(t, dt, hitSide) { const side = (t < 0.03 || !ctl.kdS) ? (ctl.kdS = (hitSide || 1) >= 0 ? 1 : -1) : ctl.kdS;
  if (!ctl.kdW) { root.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(model), inv = root.matrixWorld.clone().invert(); let x0 = 1e9, x1 = -1e9; for (const cx of [bx.min.x, bx.max.x]) for (const cz of [bx.min.z, bx.max.z]) { const v = V(cx, bx.min.y + 0.5 * (bx.max.y - bx.min.y), cz).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); } ctl.kdW = clamp(0.5 * (x1 - x0) * 0.62, 0.15, 0.6); }
  const H = HREF * 0.92, W = ctl.kdW, ph = t < 0.38 ? 0 : 1; if (ctl.kdP !== ph) { if (ctl.kdP != null) startBlend(0.22); ctl.kdP = ph; }
  resetPose();
  if (ph === 0) { const k = sm(0, 0.38, t); poseBody({ y: -0.28 * H * k, pitch: -9 * k, roll: 6 * side * k, neckP: -16 * k, ears: -30 * k }); plantAll(); tail(() => 0, 0.2, dt); return; }
  const u = t - 0.38, th = side * D2R * (kf([[0, 8], [0.45, 90, 'i'], [0.6, 82, 'o'], [0.8, 87, 's']], u)), yc = lerp(H * 0.72, W, sm(0, 0.45, u)), c = Math.cos(th), sn = Math.sin(th);
  root.quaternion.setFromAxisAngle(V(0, 0, 1), th); root.position.set(H * sn, yc - H * c, 0);      /* 繞身體中心翻：身體中心從原本高度落到「半個身寬」高 */
  const { right, fwd } = axes(); rotW(HEAD.neck, right, -10 * D2R); rotW(HEAD.neck, fwd, side * 12 * sm(0.2, 0.6, u) * D2R);      /* 頭垂下、貼向地面 */
  const dr = sm(0.15, 0.55, u); for (const L of LEGS) { const up = Math.sign(L.anchor.x) === side; if (up) rotW(L.s, V(0, 0, 1), -side * 58 * dr * D2R);      /* 上面那兩隻腳不會橫著翹在空中：垂下來搭在下面兩隻腳上 */
    rotW(L.s, right, (L.kind === 'F' ? 12 : -10) * D2R); rotW(L.e, right, (L.kind === 'F' ? -14 : 16) * D2R); } }      /* 腿微彎，像放鬆了 */
function startBlend(dur) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.bl = 0; ctl.blDur = dur; }
const KP = [0, 0.30, 0.69, 1.2], KS = [0, 0.22, 0.41, 1.05];
/* o：{ st 狀態（0 待機 1 追 2 蓄力 3 出招 4 收招 5 受擊 6 倒地 7 逃 8 警戒）, stT 狀態經過秒數, anim, wind, strike, recover, speed（已換算成本模型的公尺／秒）, dt } */
const _vq = new THREE.Quaternion(), _vf = new THREE.Vector3();
/* 視覺朝向與邏輯朝向分開：遊戲裡怪物常「面向玩家、身體卻橫著繞圈跑」。四足動物橫著跑不了那麼快（腳橫向搆不到），所以繞圈時讓身體轉向跑的方向（最多 75 度）、頭頸看回玩家；一出招就轉回邏輯朝向。判定完全不受影響（只轉外觀）。 */
function vyaw(o, dt) { const Y = ctl.vy || (ctl.vy = { a: 0, on: false, t: 0, on0: 0, tg: 0 }); let tgt = 0; const chase = (o.st | 0) === 1;
  if (VYAW && INR.ok && chase && stage.parent && dt > 0) { stage.parent.getWorldQuaternion(_vq); _vf.set(0, 0, 1).applyQuaternion(_vq); const fy = Math.atan2(_vf.x, _vf.z), sp = Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1), vt = FIT.trot.v;
    let ang = Math.atan2(INR.vw.x, INR.vw.z) - fy; ang = Math.atan2(Math.sin(ang), Math.cos(ang)); const aa = Math.abs(ang) / D2R, inC = aa > 60 && aa < 150 && sp > VYS * vt, outC = aa < 30 || sp < 0.65 * VYS * vt;
    if (!Y.on) { Y.t = inC ? Y.t + dt : 0; if (Y.t > 0.15) { Y.on = true; Y.t = 0; Y.on0 = st.t; } } else { Y.t = outC ? Y.t + dt : 0; if (Y.t > 0.25 && st.t - Y.on0 > 0.5) { Y.on = false; Y.t = 0; } }      /* 進：持續 0.15 秒；出：持續 0.25 秒且至少轉過去 0.5 秒（不會來回甩） */
    if (Y.on) tgt = aa > 150 ? Math.sign(Y.tg || ang) * 85 * D2R : clamp(ang, -85 * D2R, 85 * D2R); }
  else { Y.on = false; Y.t = 0; }
  if (VYSM && chase) { Y.tg += (tgt - Y.tg) * (1 - Math.exp(-dt / 0.2)); tgt = Y.tg; } else Y.tg = tgt;      /* 移動方向穩定約 0.2 秒才轉過去 */
  const rate = (chase ? VYR : 260) * D2R * dt; Y.a += clamp(tgt - Y.a, -rate, rate); stage.rotation.y = Y.a; { const h = clamp(-Y.a, -HKM * D2R, HKM * D2R), hr = 160 * D2R * dt; INR.hk = (INR.hk || 0) + clamp(h - (INR.hk || 0), -hr, hr); } }      /* 頭頸轉回看玩家：上限 30 度、每秒最多 160 度（不跟著身體一格跳） */
function update(o) { const dt = Math.min(0.05, Math.max(0, o.dt || 0)); st.t += dt; vyaw(o, dt); syncStage(); tgSync(); SOFT = true;
  let mode; const atk = o.st >= 2 && o.st <= 4;
  if (o.st === 6) mode = 'dead'; else if (o.st === 5) mode = 'stag'; else if (atk) mode = /kick/.test(o.anim || '') ? 'kick' : (OPT.tusk && /spin/.test(o.anim || '')) ? 'tusk' : /swipe|slam|spin/.test(o.anim || '') ? 'swipe' : (o.anim === 'bite' && o.shape === 'cone') ? 'snap' : (OPT.chg && o.anim === 'charge') ? 'ram' : ((o.anim === 'bite' && o.shape === 'line') || o.anim === 'charge') ? 'dash' : 'pounce'; else if (o.st === 8) mode = 'warn';
  else { ctl.still = o.speed < 0.08 ? ctl.still + dt : 0; mode = ctl.still > 0 ? 'idle' : 'loco'; }
  ctl.fc = (ctl.fc || 0) + 1; stage.updateWorldMatrix(true, false); if (!ctl.pm) ctl.pm = stage.matrixWorld.clone(); inertia(dt, mode === 'dead' ? 0 : (mode === 'pounce' || mode === 'swipe' || mode === 'dash' || mode === 'kick' || mode === 'tusk' || mode === 'ram') ? 0.4 : 1); if (INR.tele) { INR.tele = false; ctReset(); }      /* 被瞬間搬走（重生、傳送）：四隻腳重新站好 */
  if (mode !== 'dead') ctl.spd = o.speed || 0;      /* 倒地時沿用死前的移動速度 */
  if (mode !== ctl.mode) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.deadFresh = mode === 'dead'; ctl.bl = ctl.mode ? 0 : 1; ctl.blDur = ctl.fl >= 0 ? 0.25 : 0.16; ctl.fl = -1; ctl.dph = null; if (ctl.mode === 'dead') ctReset(); if (mode === 'loco') ctl.locoFresh = true;
    if (mode === 'pounce') modes.Dpounce.fresh = true; if (mode === 'swipe') modes.Dswipe.fresh = true; ctl.mode = mode; }
  root.quaternion.identity(); root.position.x = 0; root.position.z = 0;
  if (mode !== 'loco') ctl.vg = null;
  if (mode === 'loco') { SCAP = 0.06; const v1 = o.speed || 0; ctl.vg = ctl.vg == null ? v1 : ctl.vg + clamp(v1 - ctl.vg, -14 * dt, 14 * dt); loco(ctl.vg, dt); }
  else if (mode === 'idle') { SCAP = 0; const HW = OPT.howl ? 3.8 : 0;
    if (HW && ctl.fl < 0) { ctl.flWait -= dt; if (o.howl || ctl.flWait <= 0) { ctl.fl = 0; startBlend(0.3); } }
    if (HW && ctl.fl >= 0) { ctl.fl += dt; if (ctl.fl >= HW) { ctl.fl = -1; ctl.flWait = 22 + 25 * Math.random(); startBlend(0.3); modes.Cidle.step(dt); } else howl(ctl.fl, dt); }
    else modes.Cidle.step(dt); }
  else if (mode === 'dash') { const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.34, o.recover || 0.75][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 撲咬（衝刺咬）：後坐蓄力 → 貼地全速衝出去、脖子伸直、張嘴，衝到底咬合 → 煞住、甩頭。和飛撲不同：四腳不離地騰空 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'dash') startBlend(0.13); ctl.dph = i; if (i === 1) ctl.locoFresh = true; }      /* 衝出去的第一步：步態從「兩隻後腳正踩著」的相位開始（由走跑的起步規則挑） */
    if (i === 1) { SCAP = 0.06; const y0 = INR.y, p0 = INR.pitch; INR.y += -0.075; INR.pitch += -5; loco(Math.max(o.speed || 0, FIT.gallop.v * 0.85), dt); INR.y = y0; INR.pitch = p0;
      rotW(HEAD.neck, right, 9 * D2R); if (HEAD.jaw) rotW(HEAD.jaw, right, -kf([[0, 14], [0.25, 36, 'o'], [0.7, 36], [0.9, 0, 'i'], [1, 0]], u) * D2R); }
    else { SCAP = 0.045; resetPose(); const T = i === 0 ? u : 2 + u;
      root.position.z = kf([[0, 0], [1, -0.16, 's'], [2, 0.10], [2.3, 0.14, 'o'], [3, 0, 's']], T);
      poseBody({ y: kf([[0, 0], [1, -0.12, 's'], [2, -0.10], [2.55, 0, 's']], T), pitch: kf([[0, 0], [1, 7, 's'], [2, -7], [2.3, -9, 'o'], [3, 0, 's']], T), chest: kf([[0, 0], [1, 5, 's'], [2, -4], [3, 0, 's']], T),
        neckP: kf([[0, 0], [1, -14, 's'], [2, 12], [2.5, 6, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [2, 0], [2.25, -15, 'o'], [2.6, 10, 's'], [3, 0, 's']], T),
        jaw: kf([[0, 0], [0.6, 6, 's'], [1, 14, 's'], [2, 0], [2.3, 5, 's'], [3, 0, 's']], T), ears: kf([[0, 0], [0.7, -30, 's'], [2.5, -30], [3, 0, 's']], T) });
      plantAll(); tail(k => Math.sin(st.t * 8 - k * 0.7) * 0.10, kf([[0, 0.1], [1, 0.32, 's'], [2, -0.1], [3, 0.1, 's']], T), dt); } }
  else if (mode === 'ram') { const i = o.st - 2, dur = [o.wind || 0.78, o.strike || 0.6, o.recover || 1.05][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 野豬衝撞：低頭、一隻前蹄往後刨地三下（每刨一下身體跟著往後頓）→ 頭壓低、獠牙朝前，用正常奔跑步伐全速衝 → 跑著慢下來、甩頭噴氣 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'ram') startBlend(i === 1 ? 0.12 : 0.2); ctl.dph = i; if (i >= 1) ctl.locoFresh = true; }
    if (i === 0) { SCAP = 0.045; resetPose(); const ph = (u * 3) % 1, dr = ph < 0.55, w = sm(0, 0.15, u) * (1 - sm(0.9, 1, u)), dk = dr ? Math.sin(Math.PI * ph / 0.55) : 0;
      const oz = dr ? 0.10 - 0.26 * ph / 0.55 : -0.16 + 0.26 * sm(0, 1, (ph - 0.55) / 0.45), oy = dr ? 0.012 : 0.012 + 0.11 * Math.sin(Math.PI * (ph - 0.55) / 0.45);      /* 貼地往後刨、抬起來往前收 */
      root.position.z = -0.03 * w - 0.025 * dk * w;
      poseBody({ y: -0.03 * w, pitch: -5 * w, chest: -2 * w, neckP: (-8 - 4 * dk) * w, ears: -30 * w });
      const hw = sm(0, 0.15, u); rotW(HEAD.neck, right, -CHN * hw * D2R); rotW(HEAD.head, right, -CHH * hw * D2R);      /* 頭一路壓低接到衝刺，中間不抬 */      /* right 軸正角＝抬頭，所以壓低用負角 */
      for (const L of LEGS) footC(L, ctl, L.id === 'RF' && w > 0.05 && u < 0.9 ? { planted: false, off: [0, oy * w, oz * w] } : {});
      tail(k => Math.sin(st.t * 6 - k * 0.7) * 0.10, 0.25, dt); }
    else { SCAP = 0.06; const v = i === 1 ? Math.max(o.speed || 0, FIT.gallop.v * 0.9) : (o.speed || 0), p0 = INR.pitch; if (i === 1) { INR.pitch += -4; ctl.vG = v; } loco(v, dt); INR.pitch = p0;      /* 衝出去時腳步直接跟上身體的速度（不照平常的加速上限慢慢加，否則腳跟不上身體、被拖到後面再大步往前抓，像要跌倒） */
      const hk = i === 1 ? 1 : 1 - sm(0, 0.5, u); rotW(HEAD.neck, right, -CHN * hk * D2R); rotW(HEAD.head, right, -CHH * hk * D2R);      /* 衝的時候頭一直壓低 */
      if (i === 2) { const sn = sm(0.35, 0.55, u) * (1 - sm(0.8, 1, u)); rotW(HEAD.neck, right, 14 * sn * D2R); rotW(HEAD.neck, axes().up, 14 * sn * Math.sin((u - 0.35) * 40) * D2R); } } }      /* 收招：抬頭甩兩下噴氣 */
  else if (mode === 'kick') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.4, o.strike || 0.2, o.recover || 0.5][i], T = i + clamp((o.stT || 0) / dur, 0, 1);
    /* 後蹬：重心移到前腳、低頭 → 臀部高高抬起、兩隻後腳往後上方踢出去 → 落地站回。前腳釘地 */
    root.position.z = kf([[0, 0], [1, 0.10, 's'], [1.5, 0.14, 'o'], [2.3, 0.06, 's'], [3, 0, 's']], T);
    poseBody({ y: kf([[0, 0], [1, -0.06, 's'], [1.5, 0.06, 'o'], [2.4, 0, 's']], T), pitch: kf([[0, 0], [1, -6, 's'], [1.5, -KKP, 'o'], [2.1, -KKP * 0.55, 's'], [2.8, 0, 's']], T), chest: kf([[0, 0], [1, -4, 's'], [1.5, -8, 'o'], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -6, 's'], [1.5, 10, 'o'], [2.4, 2, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [1, 10, 's'], [2, 10], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    const kk = kf([[0, 0], [0.9, 0], [1.45, 1, 'o'], [1.9, 0.8, 's'], [2.4, 0, 's']], T);
    for (const L of LEGS) footC(L, ctl, L.kind === 'H' && kk > 0.02 ? { planted: false, off: [0, KKU * kk, -KKB * kk] } : {});
    tail(k => Math.sin(st.t * 9 - k * 0.7) * 0.12, kf([[0, 0.1], [1.45, 0.5, 'o'], [3, 0.1, 's']], T), dt); }
  else if (mode === 'tusk') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.5, o.strike || 0.3, o.recover || 0.6][i], T = i + clamp((o.stT || 0) / dur, 0, 1), { right, up } = axes();
    /* 甩牙旋身：以後腳為軸，整隻往一側扭身蓄力 → 前半身騰起、往另一側猛甩（整個身體轉過去、頭再甩過頭，獠牙劃過一大圈）→ 前腳落地 → 再小跳轉回來 */
    const th = kf([[0, 0], [1, -TKY * 0.35, 's'], [1.55, TKY, 'o'], [2.15, TKY * 0.9, 's'], [2.75, 0, 's'], [3, 0]], T) * D2R, hz = LEGS.filter(L => L.kind === 'H').reduce((a, L) => a + L.anchor.z, 0) / 2;
    root.quaternion.setFromAxisAngle(V(0, 1, 0), th); root.position.x = -hz * Math.sin(th); root.position.z = hz - hz * Math.cos(th);      /* 繞後腳中心轉 */
    poseBody({ y: kf([[0, 0], [1, -0.06, 's'], [1.35, 0.03, 'o'], [1.7, -0.04, 's'], [3, 0, 's']], T), roll: kf([[0, 0], [1, 5, 's'], [1.55, -10, 'o'], [3, 0, 's']], T), chest: kf([[0, 0], [1, 4, 's'], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -18, 's'], [1.45, -8, 'o'], [1.7, -14, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [1, -28, 's'], [1.5, 40, 'o'], [2.1, 15, 's'], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    rotW(HEAD.head, right, kf([[0, 0], [1, -8, 's'], [1.45, 12, 'o'], [2, 0, 's']], T) * D2R);      /* 甩到底時獠牙往上挑 */
    const hp = Math.max(kf([[0, 0], [0.95, 0], [1.25, 1, 'o'], [1.6, 0, 'i'], [3, 0]], T), kf([[0, 0], [2.15, 0], [2.4, 1, 'o'], [2.75, 0, 'i'], [3, 0]], T));      /* 甩出去跳一次、轉回來再跳一次 */
    for (const L of LEGS) footC(L, ctl, L.kind === 'F' && hp > 0.02 ? { planted: false, off: [0, 0.17 * hp, 0] } : {});      /* 落點跟著轉過去的身體（腳的目標是身體座標） */
    tail(k => Math.sin(st.t * 9 - k * 0.7) * 0.15, 0.3, dt); }
  else if (mode === 'snap') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.42, o.strike || 0.18, o.recover || 0.55][i], T = i + clamp((o.stT || 0) / dur, 0, 1);
    /* 啃咬：重心往後收、頭縮起 → 整個身體往前頂、脖子伸出去、張大嘴咬合 → 甩一下頭收回。四腳釘在地上 */
    root.position.z = kf([[0, 0], [1, -0.12, 's'], [1.45, 0.26, 'o'], [2, 0.22, 's'], [3, 0, 's']], T);
    poseBody({ y: kf([[0, 0], [1, -0.06, 's'], [1.45, -0.09, 'o'], [1.9, -0.04, 's'], [2.55, 0, 's']], T), pitch: kf([[0, 0], [1, 5, 's'], [1.45, -6, 'o'], [1.9, -2, 's'], [2.55, 0, 's']], T),      /* 收招：咬完就起身（原本整段收招都蹲著，看起來縮成一團） */ chest: kf([[0, 0], [1, 4, 's'], [1.45, -6, 'o'], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -16, 's'], [1.45, 12, 'o'], [1.8, 10, 's'], [2.6, 0, 's']], T), neckY: kf([[0, 0], [1.5, 0], [1.8, -14, 'o'], [2.25, 9, 's'], [3, 0, 's']], T),
      jaw: kf([[0, 0], [0.5, 8, 's'], [1, 20, 's'], [1.3, 38, 'o'], [1.5, 0, 'i'], [2, 3], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    plantAll(i === 1 ? { mth: 0.19 } : {});      /* 咬下去那一下身體往前頂、四腳釘地（已驗收的樣子），不提早跨步 */ tail(i => Math.sin(st.t * 9 - i * 0.7) * 0.10, kf([[0, 0.1], [1, 0.3, 's'], [1.45, -0.15, 'o'], [3, 0.1, 's']], T), dt); }
  else if (mode === 'pounce' || mode === 'swipe') { SCAP = 0.045; const K = mode === 'pounce' ? KP : KS, i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.3, o.recover || 0.6][i], M = mode === 'pounce' ? modes.Dpounce : modes.Dswipe;
    M.yk = (o.low || o.shape === 'line') ? 0.35 : 1; M.tIn = K[i] + clamp((o.stT || 0) / dur, 0, 1) * (K[i + 1] - K[i]); M.step(dt); }
  else if (mode === 'dead' && OPT.kd) { kdead(o.stT || 0, dt, o.hitSide); if (TDRP) tailDrop(dt, (o.stT || 0) < dt * 1.5); }
  else if (mode === 'dead') { dead(o.stT || 0, dt, { hitSide: o.hitSide, speed: Math.max(o.speed || 0, ctl.spd || 0) }); if (TDRP) tailDrop(dt, (o.stT || 0) < dt * 1.5); }
  else if (mode === 'stag') { resetPose(); const tt = o.stT || 0, k = Math.exp(-tt * 2.6) * sm(0, 0.05, tt); root.position.z = -0.24 * k; root.position.x = 0.07 * k; poseBody({ y: -0.20 * k, pitch: 15 * k, roll: 15 * k, yaw: 12 * k, chest: -8 * k, neckP: -24 * k, neckY: -38 * k * (OPT.stagNY || 1), jaw: 22 * k, ears: -36 * k }); plantAll(); tail(i => 0.25 * k * (1 + i * 0.2), 0.2, dt); }
  else { resetPose(); const t = st.t, br = Math.sin(t * 3.1); root.position.z = -0.08 * sm(0, 0.3, o.stT == null ? 1 : o.stT); poseBody({ y: PROF.warnY + 0.012 * br, pitch: PROF.warnP, chest: -4, yaw: 2.5 * Math.sin(t * 1.7), neckP: 13, neckY: 5 * Math.sin(t * 1.7 + 1), jaw: 15 + 4 * br, ears: -30 }); plantAll(); tail(i => Math.sin(t * 5 - i * 0.7) * 0.22, 0.25, dt); }
  /* 換動作時的銜接：0.16 秒內從上一個姿勢滑到新姿勢 */
  if (ctl.bl < 1) { ctl.bl = Math.min(1, ctl.bl + dt / ctl.blDur); const w = ctl.bl * ctl.bl * (3 - 2 * ctl.bl);
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; _q.copy(b.quaternion); b.quaternion.copy(ctl.fromQ[i]).slerp(_q, w); _v.copy(b.position); b.position.copy(ctl.fromP[i]).lerp(_v, w); }
    _v.copy(root.position); root.position.copy(ctl.fromR).lerp(_v, w); _q.copy(root.quaternion); root.quaternion.copy(ctl.fromRq).slerp(_q, w); }
  /* 動作切換的過渡是把骨頭角度慢慢轉過去，中途腳可能沉進地面：過渡期間每隻腳量一次腳底，低於地面就把掌根原地往上抬（腳掌朝向不變），抬的力道隨穿入深度連續增加 */
  if (ctl.bl < 1 && mode !== 'dead') { root.updateMatrixWorld(true); for (const L of LEGS) if (L.fin && L.fin.n === ctl.fc) solveLeg(L, L.fin.p, L.fin.a[0], L.fin.a[1], 1, L.fin.o);      /* 接觸層管的腳：姿勢混合完再照目標解一次，換動作的過渡期間腳不會被身體拖著走 */ for (const L of LEGS) { const g = GND ? L.c.g || 0 : 0, mn = soleMin(L) - g; if (mn > -0.002) continue; const qh = GQ(L.h, Q()).clone(), qt = GQ(L.t, Q()).clone(), hw = wp(L.h); hw.y += -mn + HY - L.hy;
      solveLeg(L, hw, 0, 0, sm(0.002, 0.012, -mn), { ng: 9, sf: 1, avd: 1, g }); setW(L.h, qh); setW(L.t, qt); } }
  for (let i = 0; i < bones.length; i++) { ctl.lastQ[i].copy(bones[i].quaternion); ctl.lastP[i].copy(bones[i].position); } ctl.lastR.copy(root.position); ctl.lastRq.copy(root.quaternion);
  root.updateMatrixWorld(true);
  if (mode === 'dead') SEC.reset(); else { SEC.apply(dt, mode); root.updateMatrixWorld(true); tailClamp(); tailGround(); tailClamp(); } TLIM = TL0;
  ctl.pm.copy(stage.matrixWorld); ctl.pmOk = true; }      /* 嚎叫時晃動層照常作用 */
const _q = Q(), _v = V();
return { stage, root, model, update, FIT, RG, SEC, INR, RB, SIZE, LEGS, CL, ctl, BF, T: { BR, TG, gAt, setGround: f => { GND = f; }, soleG: L => { let mn = 1e9, mx = -1e9; const v = V(); for (const q of L.sole) { q.m.getVertexPosition(q.i, v); q.m.localToWorld(v); const d = GND ? (v.y - GND(v.x, v.z)) / TG.sW : stage.worldToLocal(v.clone()).y; if (d < mn) mn = d; if (d > mx) mx = d; } return [mn, mx]; },      /* 測試用：腳底每一點離真正地面多高（最低、最高） */ solveLeg, legLen, legAng, footPlan, resetPose, HY, GAITS, toWorld, soleMin, skinMinY, torsoPts, wp, axes, modes }, get mode() { return ctl.mode; } };
}
/* ---------- 掛進遊戲（測試版專用）----------
   網址加 ?tiger=20：猛虎換成夜鉤猞；?wolf=20：灰狼換成 Meshy 灰狼；?meshy=1：全部都換。不加參數完全不受影響。
   每種生物一份設定：模型檔、專屬動作、姿勢微調、材質飽和度。 */
const QN = (k, d) => { const m = typeof location !== 'undefined' && new RegExp('[?&]' + k + '=(-?[\\d.]+)').exec(location.search); return m ? +m[1] : d; };      /* 網址數字參數（調參用） */
const CHN = QN('chn', 20), CHH = QN('chh', 10), KKP = QN('kkp', 26), KKU = QN('kku', 0.36), KKB = QN('kkb', 0.24), TKY = QN('tky', 55);      /* 野豬：衝撞低頭角度、頭再壓、後蹬俯角／抬高／往後、甩牙扭身角度 */
const TLM = (() => { const m = typeof location !== 'undefined' && /[?&]tlim=([\d.]+)/.exec(location.search); return m ? +m[1] : 30; })();
const TUK = (() => { const m = typeof location !== 'undefined' && /[?&]tupk=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.1; })();
const SWF = (() => { const m = typeof location !== 'undefined' && /[?&]swf=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.7; })(), SWP = (() => { const m = typeof location !== 'undefined' && /[?&]swp=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.6; })();
let SPEC = { tiger: { glb: 'lynx_rig_2k', opt: {}, fx: { sat: 1.25, gam: 0.9 }, size: 1.3, tex: { map: 'lynx_scar_base.jpg', nrm: 'lynx_scar_normal.jpg' } },      /* 夜鉤猞：原配色不動，體型放大 1.3 倍＋舊爪痕疤（底色與法線貼圖） */
  wolf: { glb: 'wolf_rig_2k', opt: { howl: true }, fx: { sat: 0.95, gain: 1.2, gam: 0.68 } },
  boar: { glb: 'boar_rig_2k', opt: { chg: true, tusk: true, strK: { walk: 0.85, trot: 0.85 }, cadMax: 2.6, sxMax: 1.0, kd: true }, fx: { sat: 1.3, gain: 1.8, gam: 0.75, tint: [1.1, 0.95, 0.84] } } };      /* 11-26 野豬（Meshy 新模型，37 骨、無下顎骨）；?boar=20 開 */
export const FROZEN = { tag: 'wolf@0460276b', spec: SPEC['wolf'] };
