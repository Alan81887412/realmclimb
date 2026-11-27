/* 登界 四足動作引擎（第二代）。
   2026-11-25 13:10 起這個檔就是原始碼（img3d/lab/engine/rig.js）：直接改這裡，然後跑 img3d/eng/bld.sh 做語法檢查並複製到測試版 js/lynxrig.js。
   先前的產生器 img3d/lab/py/build_rig.py（從 lab.js＋legik.js＋gait2.js＋skinfix.js＋ragdoll.js 組出 v16）停用，只留作紀錄。
   測試版專用：網址帶 ?tiger=20（夜鉤猞）、?wolf=20（灰狼）時，走路／小跑／奔跑／待機／招式／受擊／倒地都由這裡驅動。 */
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
/* 11-27 OPT.elbIns（野鹿；要在任何量蒙皮外形之前做，否則別隻的骨架還沒補骨頭就去讀共用幾何）：這副骨架前腳是「肩胛（含上臂＋前臂，一整節）→腕→球節→蹄」，肘包在第一節裡不能彎；引擎把腕當肘、照肘的方向往前彎（審核發現，製作人退件的「腕往前彎」）。
   做法：在第一節沿著往腕的方向 u 處插一根肘骨，腕改接在肘下面（世界位置不變）；蒙皮：第一節的頂點照沿骨位置在肘上下 ±bl 漸變分給肘，只取離骨軸 r（以這節長度為單位）以內的（胸口、肩膀不動）。
   幾何是同一種生物共用的，只改一次；每一隻的骨架各自補上這根骨頭。 */
if (OPT.elbIns) { const E = OPT.elbIns, sk = [], clav = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); if (o.isBone && /^clavicle/i.test(o.name)) clav.push(o); }); model.updateMatrixWorld(true);
  for (const c of clav) { const ch = c.children.find(o => o.isBone); if (!ch || c.userData.elb) continue;
    const Bv = ch.position.clone(), el = new THREE.Bone(); el.name = c.name.replace(/clavicle/i, 'elbowIns'); el.position.copy(Bv).multiplyScalar(E.u); c.add(el); c.remove(ch); el.add(ch); ch.position.sub(el.position); c.userData.elb = el; el.updateMatrixWorld(true);
    for (const m of sk) { const S = m.skeleton, ci = S.bones.indexOf(c); if (ci < 0) continue;
      const Lm = new THREE.Matrix4().makeTranslation(el.position.x, el.position.y, el.position.z); if (!S.bones.includes(el)) { S.boneInverses = S.boneInverses.map(m2 => m2.clone()); S.bones = S.bones.slice(); S.bones.push(el);      /* 複製的骨架和原型共用 boneInverses 陣列，先換成自己的再加，否則下一隻建立時長度對不上、three 會把整副骨架的逆矩陣重設成單位矩陣（整隻拉長變形） */ S.boneInverses.push(Lm.clone().invert().multiply(S.boneInverses[ci])); S.boneMatrices = new Float32Array(S.bones.length * 16); if (S.boneTexture) { S.boneTexture.dispose(); S.boneTexture = null; } }
      const ni = S.bones.indexOf(el), G = m.geometry, done = G.userData.elbIns || (G.userData.elbIns = {}); if (done[c.name] != null) continue; done[c.name] = ni;
      const P = G.attributes.position, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight, M = S.boneInverses[ci].clone().multiply(m.bindMatrix), v = new THREE.Vector3(), L2 = Bv.lengthSq(), Lb = Math.sqrt(L2);
      for (let i = 0; i < P.count; i++) { let j = -1; for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === ci && SW.getComponent(i, k) > 0) j = k; if (j < 0) continue;
        v.fromBufferAttribute(P, i).applyMatrix4(M); const u = v.dot(Bv) / L2, uc = Math.min(1, Math.max(0, u)), rd = v.clone().addScaledVector(Bv, -uc).length() / Lb; if (rd > E.r) continue;
        const sh = sm(E.u - E.bl, E.u + E.bl, u); if (sh <= 0) continue; const w = SW.getComponent(i, j);
        if (sh >= 1) { SI.setComponent(i, j, ni); continue; }
        let f = -1, fw = 1e9; for (let k = 0; k < 4; k++) if (k !== j) { const wk = SW.getComponent(i, k); if (wk < fw) { fw = wk; f = k; } }
        SW.setComponent(i, j, w * (1 - sh) + fw); SI.setComponent(i, f, ni); SW.setComponent(i, f, w * sh); }      /* 最小的那個影響讓出來（權重併回第一節），總和不變 */
      SI.needsUpdate = true; SW.needsUpdate = true; } }
  model.updateMatrixWorld(true); }
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
const LEGC = (typeof location !== 'undefined' && /[?&]legc=1/.test(location.search)), FSK = (typeof location !== 'undefined' && /[?&]fsk=1/.test(location.search)) ? 1 : 0;
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
  if (OPT.kSm) { INR.kS = INR.kS == null ? k : INR.kS + clamp(k - INR.kS, -dt / 0.3, dt / 0.3); k = INR.kS; }      /* OPT.kSm（野鹿）：招式↔走跑切換時慣性權重 0.4↔1 不一格跳（一格跳會讓轉彎中的身體側彎、頭轉一格放大 2.5 倍） */
  INR.k = k; INR.pitch = cl(s.P, C.maxP) * k; INR.y = cl(s.Y, C.maxY) * k; if (OPT.crocM && OPT.crocM.iP != null && ctl.mode !== 'loco' && ctl.mode !== 'idle') { INR.pitch *= OPT.crocM.iP; INR.y *= OPT.crocM.iP; }      /* 11-27 C1 OPT.crocM.iP（鱷魚）：招式中急停的慣性前傾／下沉倍率（衝咬煞住時前傾頂到上限 4.4° 再一下彈回 +3.8°，五格內胸口抬 20 公分） */ INR.roll = -s.R * k;      /* 往彎內傾 */ INR.look = s.L * k * (OPT.inrK ? OPT.inrK.look : 1); INR.bend = (s.B || 0) * k * (BENDON ? 1 : 0) * (OPT.inrK ? OPT.inrK.bend : 1); }      /* OPT.inrK（水豚）：轉身時頭先轉、脊椎側彎的倍率（原地慢轉時頭和前半身先甩 30° 再轉回來） */
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
  const legC0 = (b, sk, kd) => { let a = chain(b, 99); if (sk && a.length >= 5 + sk) a = a.slice(sk); const PK = OPT.legPick && OPT.legPick[kd]; if (PK && PK.every(i => a.at(i))) return PK.map(i => a.at(i));      /* OPT.legPick（水豚）：骨鏈裡哪幾節當「根、第二、第三、腳掌、腳尖」（負數＝從末端數）；中間沒選到的節跟著上一節不單獨彎 */ return a.length <= 5 || !(LEGC || OPT.legc) ? a.slice(0, 5) : [a[0], a[1], a[2], a[a.length - 2], a[a.length - 1]]; };      /* OPT.legc：這種生物預設就用「根、第二、第三、腳尖上一節、腳尖」；OPT.fSkip：前腳從肩胛下一節開始（野牛：肩胛骨不當成腿的第一節，腿從肩關節算起，腕關節才彎得到） */
  /* 腿只有四節（野牛前腳：肩胛→前臂→腕→蹄，少了腳掌那一節）：在蹄的正下方地面補一個不帶皮膚的「蹄尖」點，讓蹄那節當腳掌用 */
  const gY = (() => { const bx = new THREE.Box3().setFromObject(model); return model.worldToLocal(V(0, bx.min.y, 0)).y; })();
  const legC = (b, sk, kd) => { const a = legC0(b, sk, kd); if (a.length !== 4) return a; const last = a[3], w = new THREE.Vector3(); last.getWorldPosition(w); const lw = model.worldToLocal(w.clone()), tw = model.localToWorld(V(lw.x, gY, lw.z + 0.25 * Math.max(0, lw.y - gY)));
    const tip = new THREE.Bone(); tip.name = last.name + '_tip4'; last.add(tip); tip.position.copy(last.worldToLocal(tw)); tip.updateMatrixWorld(true); a.push(tip); return a; };
  return { hips: N(hips), root: N(rtB), chest: N(chest), head: N(head), spine: N(sp[0]), spine3: N(sp.length > 1 ? sp[sp.length - 2] : sp[0]), neck: N(nk[0]), neck2: N(nk[1] || nk[0]),
    jaw: N(head && kids(head).find(o => /^jaw/.test(nm(o)))), earL: N(eL), earR: N(eR), tail: tailC.slice(0, Math.max(1, tailC.length - 1)).map(N),
    LF: legC(cL, OPT.fSkip || FSK, 'F').map(N), RF: legC(cR, OPT.fSkip || FSK, 'F').map(N), LH: legC(rL, 0, 'H').map(N), RH: legC(rR, 0, 'H').map(N) }; })();
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
/* 11-27 擺盪腿關節角速度上限（審核：牛、岩羊擺盪時肘一格跳 80～115°，是解算換了一個解）。只在最外層呼叫後處理：
   和上一格比，第二、三節（肘／腕或膝／飛節）的局部旋轉每秒最多轉 OPT.anat.rate 度（預設 900°/s；30fps 約 30°/格）；踩地的腳不限（會滑）。 */
let _slD = 0; const _qI = new THREE.Quaternion();
function solveLeg(L, heelW, pitch = 0, flex = 0, w = 1, o = {}) {
  /* 11-27 OPT.prS（野鹿）：走路時同一側前後腳不同時懸空（審核：順拐）；同側那隻快落地（u≥0.8）就可以抬。 */
  /* 11-27 OPT.rpF（野鹿）：走路時前腳「腿快伸到底就馬上抬」的門檻（預設 0.966）。野鹿前腳站著就伸到 0.99，一落到身體後面就被觸發，前腳每 18 格一步、後腳每 22 格，步法錯開、同側兩腳同時懸空。 */
  /* 11-27 OPT.limF（野鹿）：走路時前腳被拖到「離站位多遠才提早再踏」的門檻放寬（探針：前腳每 18 格踏一步、後腳每 22 格，前腳一直被提早觸發，步法亂掉、同側兩腳同時懸空）。 */
  /* 11-27 OPT.fSink（野鹿）：撐地前腳由「球節下沉」吸收長度變化（文獻：馬奔跑撐地時腕關節鎖直當支柱、球節背屈吸震，肘變化不大；GPT 討論：不要讓肘替身體軌跡買單）。
     肩到球節的距離比腿長 r 倍還短時，把球節往下、往後放（蹄尖釘在原地、繫部斜下去），上面的腿就不用折那麼多。最多下沉 繫部高度×max。 */
  if (OPT.fSink && L.kind === 'F' && !_slD && !o.fsk) { const g = o.g || 0, kA = 1 - sm(0.004, 0.06, heelW.y - HY - g);
    if (kA > 0.01 && L.hy > 1e-3) { const sw = wp(L.s), tg = heelW.clone(); tg.y += L.hy - HY; const d = sw.distanceTo(tg), thr = OPT.fSink.r * (L.dMax || 1);
      const want = d < thr ? Math.min(OPT.fSink.max * L.hy, (thr - d) * (OPT.fSink.k || 1.3)) * kA * (ctl.fsF === ctl.fc ? ctl.fsW : 0) : 0, dt0 = INR.dt || 0.0167; L.fsS = (L.fsS || 0) + clamp(want - (L.fsS || 0), -0.6 * dt0, 0.6 * dt0);      /* 每秒最多變化 0.6 m（一格約 2 公分），不跳 */
      const s2 = L.fsS; if (s2 > 1e-4) { const th = Math.acos(clamp((L.hy - s2) / L.hy, -1, 1)), { fwd } = axes(), h2 = heelW.clone().addScaledVector(fwd, -L.hy * Math.sin(th)); h2.y -= s2;
        return solveLeg(L, h2, pitch + FSG * th, flex, w, Object.assign({}, o, { fsk: 1 })); } } } else if (L.kind === 'F' && !_slD && !o.fsk) L.fsS = Math.max(0, (L.fsS || 0) - 0.6 * (INR.dt || 0.0167));
  _slD++; let r; try { r = solveLeg0(L, heelW, pitch, flex, w, o); } finally { _slD--; }
  const RT = OPT.anat && (OPT.anat.rate ?? 900);      /* 11-27 C1 OPT.crocM.pgU（鱷魚）：prG（同對腳不同時懸空）遇到腳已經被拉到腿長 98% 或落後超過步幅時照樣抬（原本等另一隻落地，撐地後腳被身體拖著橫滑 8 格、共 19 公分）。OPT.crocM.tSeg（鱷魚）：尾巴每一節往上翹的上限（度；預設 tup+10，鱷魚設 0＝每節都不往上翹，尾尖不會勾起來） */ if (_slD || !RT) return r;
  const g = o.g || 0, air = (OPT.swLo && L.c && L.c.air && (L.c.u || 0) < 0.5) ? 1 : sm(0.01, 0.05, heelW.y - HY - g), t = st.t      /* 11-27 OPT.swLo（野鹿、野牛）：擺盪前半段（剛抬腳、腳還貼地）也限速——原本只在腳離地 1～5 公分以上才限，抬腳那一格肘／腕一格折 40～50°（自檢量到） */, dl = t - (ctl.lqT ?? -9);      /* 和「上一格最後畫出來的姿勢」（ctl.lastQ）比：同一格解兩次、換招混合都算在內（岩羊成員查到：同一格第二次呼叫原本會跳過限速） */
  if (air > 0 && dl > 0 && dl < 0.1 && ctl.lastQ) { const ix = L._ix || (L._ix = [bones.indexOf(L.e), bones.indexOf(L.w), bones.indexOf(L.h)]), sw = L.c && L.c.air, cu = sw ? (L.c.u || 0) : 0, du = sw && L._uT === ctl.lqT && cu > (L._u0 ?? 9) ? (cu - L._u0) / dl : 0, cE = OPT.anat.cu ?? 1, tr = du > 0 ? Math.max(0, cE - cu) / du : 0;      /* 11-27 OPT.anat.cu（例 0.85）：落後的角度在擺盪 u＝cu 之前追完，最後一段完全照目標走（岩羊成員量到：限速讓落地前一格腳還在空中、下一格才砸到地） */
    const rlT = OPT.rlUp && OPT.rlUp[L.kind] && sw ? wp(L.h) : null, rlQ = rlT ? GQ(L.h, Q()) : null; if (!rlT) L._rlS = 0;      /* 11-27 M1 OPT.rlUp：限速前記下解算給的掌根位置、腳掌朝向 */
    (OPT.crocM && OPT.crocM.hR ? [L.e, L.w, L.h] : [L.e, L.w]).forEach((b, i) => { const q1 = ctl.lastQ[ix[i]];      /* 11-27 C1 OPT.crocM.hR（鱷魚）：腳掌（第三節）也限速（抬腳、落地那一格掌指一格翻 40～55°） */ if (!q1) return; const a = q1.angleTo(b.quaternion), mx = (OPT.anat.cu != null && sw && cu >= cE) ? a : Math.max(RT * D2R * dl, tr > 0 ? a * dl / Math.max(tr, dl) : 0); if (a > mx) b.quaternion.copy(q1.clone().slerp(b.quaternion, lerp(1, mx / a, air))); }); L.s.updateMatrixWorld(true); if (rlT) rlUp(L, rlT, rlQ, air); }      /* 限速對上一格最終姿勢（900°/s）；落後的角度攤在剩下的擺盪時間平均追回（剩餘時間＝(1−u)／u 的速度），不在某一格或落地那格一次補（審核：前蹄砸地；岩羊成員量到放寬倍率會把大跳移到擺盪後段） */
  if (L.c) { L._u0 = L.c.air ? (L.c.u || 0) : 9; L._uT = st.t; }
  return r; }
/* 11-27 M1 OPT.rlUp {H:1}（果脊猴）：擺盪腿被關節限速拖住時，腿比解算要的長，原本沿「髖→目標」方向瞄準，多出來的長度直接把腳壓向地面
   （疾跑擺盪只有約 5 格，後腳從拉到最長 r≈1.03 到折到髖正下方 r≈0.70 只有一格，膝要一格折 50° 以上，限速只給 30°：擺盪中段掌根要 14cm 只剩 4cm、趾尖 1cm＝貼地滑）。
   改成以髖為軸把整條腿往後轉，讓掌根回到解算要求的高度（腳稍微拖在後面，等膝追上就回到原軌跡），腳掌朝向維持解算的計畫。轉的方向在開始修正那一格決定（腳當時在髖的哪一側就留在那一側；擺盪前段一定是在後面＝腳拖在後面），之後固定到修正結束，不會在髖正下方前後跳。 */
function rlUp(L, hT, pq0, air) { const hs = wp(L.s), hh = wp(L.h), dy = (hT.y - hh.y) * air; if (dy < 0.002) { L._rlS = 0; return; }
  const ax = LEGX.clone().applyQuaternion(GQ(L.s.parent, Q()).multiply(L.qp0i)).normalize(), v = hh.clone().sub(hs), pa = v.clone().addScaledVector(ax, -v.dot(ax)),
    upP = V(0, 1, 0).addScaledVector(ax, -ax.y).normalize(), fw = upP.clone().cross(ax).normalize(), R = pa.length(), y0 = pa.dot(upP), f0 = pa.dot(fw), y1 = y0 + dy / Math.max(0.5, upP.y);
  if (y1 >= 0 || R < 1e-4) return;
  const tf = hT.clone().sub(hs).dot(fw), sg = L._rlS || (L._rlS = Math.sign(f0) || -Math.sign(tf) || 1), f1 = sg * Math.sqrt(Math.max(0, R * R - Math.max(y1, -R) ** 2)),
    pb = upP.clone().multiplyScalar(Math.max(y1, -R)).addScaledVector(fw, f1), ang = Math.atan2(pa.clone().cross(pb).dot(ax), pa.dot(pb));
  if (Math.abs(ang) > 1e-4) ctl.rlN = (ctl.rlN || 0) + 1;      /* 量測用：生效次數 */
  rotW(L.s, ax, ang); const pq = Q(); GQ(L.h.parent, pq); L.h.quaternion.copy(pq.invert().multiply(pq0)); L.h.updateMatrixWorld(true); }
function solveLeg0(L, heelW, pitch = 0, flex = 0, w = 1, o = {}) {
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
  /* 11-27 解剖限制（OPT.anat，GPT 討論 eng/gpt/11-27_偶蹄腿部IK限制.md）：限制放在解算裡，不是解完才剪。
     前腳腕：撐地時總屈曲（phi＋flex）夾在 [aWlo, aWhi]（接近鎖直），縮短改由肘吸收。後腳飛節：Δ飛節 = k·Δ膝 ＋ ε（互惠耦合），ε 撐地小、擺盪大。 */
  const AN = OPT.anat, kA = AN ? 1 - sm(0.004, 0.06, heelW.y - HY - g) : 0;
  const fx = !AN ? (() => flex) : L.kind === 'F'
    ? (m => { const lo = (AN.wLo ?? -5) * D2R, hi = lerp((AN.wSw ?? 70), (AN.wHi ?? 8), kA) * D2R; return lerp(flex, clamp(flex + m, lo, hi) - m, Math.max(kA, (AN.swW ?? 1), (o.anS || 0))); })
    : (m => { const k = AN.k ?? 0.7, e = lerp((AN.eSw ?? 12), (AN.eSt ?? 4), kA) * D2R; return Math.max(lerp(flex, (k - 1) * m + clamp(flex, -e, e), Math.max(kA, 0.6)), (AN.hLo ?? 2) * D2R - m); });      /* 飛節不往反方向折（總角度 ≥ hLo） */
  const pLo = AN && L.kind !== 'F' ? Math.max(L.phiLo, Math.min(L.phiHi - 0.05, (AN.sLo ?? -3) * D2R)) : L.phiLo;      /* 後膝不反折：膝角下限 sLo；伸不到的距離改由步幅／身體高度讓（GPT：寧可縮步，不反折關節） */
  const dm = legLen(L, pLo, fx(pLo)), dn = legLen(L, L.phiHi, fx(L.phiHi)), ds = Math.min(dm - 1e-3, Math.max(0.965 * dm, flex ? legLen(L, 0, fx(0)) : L.d0));      /* 軟性上限從站姿長度之後才開始，站姿一定解得回來 */
  if (AN && AN.eF != null && L.kind === 'F') { const pE = Math.min(L.phiHi, (AN.eF - (AN.eFm ?? 8)) * D2R),      /* eFm：提早 8° 就開始抬（GPT：回饋太晚，落地頭幾格會超限） */ dE = legLen(L, pE, fx(pE)); L.def = kA > 0.3 ? Math.max(0, dE - d1) * kA : 0; } else L.def = 0;      /* 11-27 撐地前腳的肘最多折 eF 度；要折更深才搆得到地面時，記下差多少（給 poseBody 把前半身抬高） */
  if (SOFT && d > ds) d = ds + (dm - ds) * (1 - Math.exp(-(d - ds) / (dm - ds)));
  if (o.gr && d < d1 - 1e-5) { const hl = Math.hypot(dv.x, dv.z), nh = Math.sqrt(Math.max(1e-8, d * d - dv.y * dv.y)); if (hl > 1e-5 && nh < hl) { const k = nh / hl; tg.x = sw.x + dv.x * k; tg.z = sw.z + dv.z * k; dv.x *= k; dv.z *= k; L.grm = hl - nh; } }      /* o.gr（踩在地上的腳）：搆不到時腳留在地面上、沿地面讓回來，不要被拉離地 */
  if (d < dn) {      /* 目標太近、腿折不到那麼短：不要順著方向把腳頂過頭（會頂進地面），改成保持目標的高度、沿前後方向讓出去 */
    const { fwd } = axes(), up = V(0, 1, 0), vy = dv.dot(up), vz = dv.dot(fwd), vx = dv.clone().addScaledVector(up, -vy).addScaledVector(fwd, -vz), r2 = dn * dn - vy * vy - vx.lengthSq();
    if (r2 > 0) { const R = Math.sqrt(r2), sg = clamp(vz / (0.6 * R), -1, 1), H = sw.y - L.hy - 0.004 - g, m2 = H > 1e-3 ? vy * vy * dn * dn / (H * H) - vy * vy - vx.lengthSq() : r2, nb = R * sg * (1.5 - 0.5 * sg * sg), nz = (vz < 0 ? -1 : 1) * Math.min(R, Math.sqrt(nb * nb + Math.max(0, m2)));      /* m2＞0＝腿根太低，腳直接從正下方過會頂進地面：這時才保留最小的前後讓位 */      /* 腳從腿根正下方掠過時前後連續地換邊（原本一過中線就整隻腳跳到另一邊）；中間那一小段腿折不到那麼短，腳會略低一點通過 */ dv.addScaledVector(fwd, nz - vz); tg.addScaledVector(fwd, nz - vz); d = dv.length(); } }
  d = clamp(d, Math.min(dn, dm) + 1e-4, dm - 1e-4);
  let lo = pLo, hi = L.phiHi; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (legLen(L, m, fx(m)) > d) lo = m; else hi = m; }
  const phi = (lo + hi) / 2, fxp = fx(phi), a = legAng(L, phi, fxp).slice(), ax = LEGX.clone().applyQuaternion(GQ(L.s.parent, Q()).multiply(L.qp0i));
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
  L.rr = d1 / dm; L.dbg = { df: +(L.def || 0).toFixed(4), fL: +(ctl.fLift || 0).toFixed(4), r: +(d1 / dm).toFixed(3), phi: +(phi / D2R).toFixed(1), fl: +(flex / D2R).toFixed(1), aE: +(a[0] * L.sE / D2R).toFixed(1), aW: +(a[1] * L.sW / D2R).toFixed(1), kA: +kA.toFixed(2), pi: +(pitch / D2R).toFixed(1), up: +(o.up || 0).toFixed(4),  sx: +sx.toFixed(4), su: +su.toFixed(4), err: +wp(L.h).distanceTo(tg).toFixed(4), dn: +(dn / dm).toFixed(3), hq: +(heelW.y - HY - g).toFixed(4) };      /* 11-27 M1 量測用（不影響行為）：dn＝腿折到最短時的長度比、hq＝要求的掌根離地高度 */
}
// 尾巴：逐節延遲的擺動＋下垂
const TAIL = RB.tail.map(B).filter(Boolean);
const tailSpring = { yaw: TAIL.map(() => 0), v: TAIL.map(() => 0) };
const TAILR = (() => { if (TAIL.length < 2) return { al: 1.4, S: 1 }; const a = wp(TAIL[0]), b = wp(TAIL[TAIL.length - 1]); let S = 0; TAIL.forEach((_, i) => S += 0.5 + 0.5 * i / TAIL.length); return { al: Math.max(0.08, 75 * D2R - Math.atan2(a.y - b.y, Math.hypot(b.z - a.z, b.x - a.x))), S }; })();
const TL0 = OPT.tdl || 62, TUP = OPT.tup == null ? null : OPT.tup; let TLIM = TL0;      /* TLIM＝尾巴往下垂的上限；TUP＝往上翹的上限（每種生物可設，猛虎尾巴長，收招時會翹成一根直棍） */
function tailClamp() { if (TAIL.length < 2) return; const { fwd, right } = axes(), last = TAIL[TAIL.length - 1], A = () => { const d = wp(last).sub(wp(TAIL[0])); return Math.atan2(-d.y, -d.dot(fwd)) / D2R; };      /* 尾巴根到尖的連線在側面的角度：0＝水平朝後、90＝直直往下、超過 90＝往前伸到肚子底下 */
  let ang = A(); if (ang < (OPT.tWrap ?? -90)) ang += 360; ctl.tA = Math.round(ang);      /* 11-27 Q1 OPT.tWrap（果脊猴）：根到尖往上翹過垂直（猴子尾巴捲在背上）不要當成「垂到肚子底下」；原本 -90 一過就換算成 270、被整條從根部轉回下垂上限，尾巴一格從朝天翻到拖地 */
  if (TUP != null) { root.updateMatrixWorld(true); for (let i = 1; i < TAIL.length; i++) { const b = TAIL[i], c = i + 1 < TAIL.length ? TAIL[i + 1] : b.children.find(x => x.isBone); if (!c) continue; const p0 = wp(b), d = wp(c).sub(p0), hz = Math.hypot(d.x, d.z); if (hz < 1e-6) continue; const up = Math.atan2(d.y, hz) / D2R, lim = OPT.crocM && OPT.crocM.tSeg != null && ctl.mode !== 'croll' ? OPT.crocM.tSeg : TUP + 10; if (up > lim) { const ax = V(d.z, 0, -d.x).normalize(); rotW(b, ax, (up - lim) * D2R); root.updateMatrixWorld(true); } } }      /* 每一節都限制往上翹的角度（只限制根到尖的連線不夠：尾巴會彎成 S 形、尖端翹成直棍） */
  if (TUP != null && ang < -TUP && ang > -90) { const ex = (ang + TUP) * D2R, q0 = TAIL[0].quaternion.clone(); rotW(TAIL[0], right, ex); let a2 = A(); if (Math.abs(a2 + TUP) > Math.abs(ang + TUP) - 1) { TAIL[0].quaternion.copy(q0); rotW(TAIL[0], right, -ex); } return; }      /* 往上翹超過上限（尾巴長的生物收招時會翹成直棍）：從根部轉回 */
  if (ang <= TLIM) return; const ex = (ang - TLIM) * D2R, q0 = TAIL[0].quaternion.clone(); rotW(TAIL[0], right, ex); let a2 = A(); if (a2 < (OPT.tWrap ?? -90)) a2 += 360; if (Math.abs(a2 - TLIM) > Math.abs(ang - TLIM) - 1) { TAIL[0].quaternion.copy(q0); rotW(TAIL[0], right, -ex); } }      /* 超過上限就把整條尾巴從根部轉回上限（往後抬），騰空時各招式會把上限調小 */
function tail(sway, droop, dt, bodyYawRate = 0) {
  const { up, right } = axes(); if (OPT.tdSm) { ctl.tdS = ctl.tdS == null || ctl.mode === 'dead' ? droop : ctl.tdS + clamp(droop - ctl.tdS, -OPT.tdSm * dt, OPT.tdSm * dt); droop = ctl.tdS; }      /* 11-27 Q1 OPT.tdSm（果脊猴）：尾巴上下（droop）每秒最多變這麼多（長尾巴的招式關鍵格一換就整條甩過去，一兩格從朝天變平伸） */ if ((OPT.tailUp != null || OPT.tailSw) && ctl.mode !== 'dead' && ctl.mode !== 'sit') { if (OPT.tailUp != null) droop += OPT.tailUp; if (OPT.tailSw) { const s0 = sway; sway = i => s0(i) * OPT.tailSw; } }      /* OPT.tailUp／tailSw（果脊猴）：尾巴整體翹高多少（負＝往上）、左右擺幅倍率；倒地、蹲坐不套用 */ if (droop < 0 && OPT.tupK != null) droop *= OPT.tupK; if (OPT.crocM && OPT.crocM.tl && ctl.mode !== 'dead' && ctl.mode !== 'loco' && ctl.mode !== 'idle') { const C = OPT.crocM.tl, s1 = sway; sway = i => clamp(s1(i), -C.sw, C.sw); droop = Math.min(droop, C.dM); }      /* 11-27 C1 OPT.crocM.tl {sw, dM}（鱷魚）：招式／被打／翻滾時尾巴每節左右擺最多 sw 弧度、往下壓最多 dM（尾巴 7 節，每節照預設擺 0.45 弧度會捲成鉤；往下壓進地面會被貼地修正把尾尖翹起來） */      /* 尾巴往上抬的量每種生物可縮（猛虎尾巴長，照預設會翹成直棍） */ if (droop > 0) { const ch = 0.5 * TAILR.S * droop, al = TAILR.al, k0 = 0.7 * al; if (ch > k0) droop *= (k0 + 0.3 * al * (1 - Math.exp(-(ch - k0) / (0.3 * al)))) / ch; }      /* 尾巴整體最多垂到水平線下 75°（依這副骨架站姿的尾巴角度換算），不會被壓成直直往下 */
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
function footPlan(L, p, G, Sx) { const F = L.kind === 'F', c = L.cz || 0, P = (F ? 34 : 22) * D2R * (OPT.pawK ?? 1);      /* 11-27 Q1 OPT.pawK（棕熊、蹠行）：推蹬時抬腳跟的角度倍率（配 swPit 擺盪倍率；貓狗的趾行步態會把熊掌整個翻成爪尖朝下） */
  let dz, y, pitch, flex, pp, toe;
  if (p < G.duty) { const u = p / G.duty, a = P * sm(0.72, 1, u); dz = c + Sx * (0.5 - u); y = HY; pitch = -a; pp = -a; flex = 0; toe = 0; }
  else { const u = (p - G.duty) / (1 - G.duty), e = u * u * (3 - 2 * u), lf = F ? G.liftF : G.liftH, k = 1 - sm(0, 0.45, u);
    // 擺盪期前後位置用 Hermite 曲線：起點與終點的速度都接上著地期（腳先順勢往後再甩到前面），不會有急轉
    const m = -(1 - G.duty) / G.duty, u2 = u * u, u3 = u2 * u, H = (2 * u3 - 3 * u2 + 1) * -0.5 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * 0.5 + (u3 - u2) * m;
    dz = c + Sx * H; y = HY + lf * (OPT.swQ ? swQy(u) : Math.sin(Math.PI * Math.pow(u, OPT.swSk ? OPT.swSk[F ? 0 : 1] : F ? 0.9 : 0.8)) ** 2);      /* 11-27 A1 OPT.swQ：見 swQy */      /* 11-27 Q1 OPT.swSk [前, 後]（岩羊、果脊猴）：抬腳高度曲線的偏斜指數，越小最高點越早、後半段慢慢放下（擺盪只有約 4 格時，落地前一格 u≈0.75 照對稱曲線還在一半高度，看起來像砸地） */
    const b2 = OPT.swQ ? swQy(u) : Math.sin(Math.PI * u) ** 2; pitch = (-P * (1 - e) - (F ? 38 : 22) * D2R * b2) * (OPT.swPit && OPT.swPit[L.kind] != null ? OPT.swPit[L.kind] : 1);      /* OPT.swPit（水豚）：擺盪時腳掌往下翻的角度倍率（半蹠行、後腳掌長，翻下去趾尖會拖地） */ pp = -P * k; flex = (F ? 30 : 30) * D2R * b2; toe = sm(0, 0.15, u); }
  return { dz, y, pitch, flex, pp, toe }; }
// 步幅：以通過驗收的夜鉤猞為準（HREF 尺度，等於腿擺動的角度：走 ±17°、小跑 ±18°、奔跑 ±22°），再受「腿伸得到的範圍」限制（腿短的自動變小、不會被拉到打直）
GAITS.walk.S = 0.40; GAITS.trot.S = 0.435; GAITS.gallop.S = 0.545;
// 走跑時的落腳中心左右對稱（站姿左右腳不對稱的模型，走起來才不會一跛一跛）；站著不動時仍用各自的站姿位置
for (const L of LEGS) { const M = LEGS.find(o => o.kind === L.kind && o !== L); L.ga = V(L.side * (Math.abs(L.anchor.x) + Math.abs(M.anchor.x)) / 2 * (OPT.trkW ? OPT.trkW[L.kind === 'F' ? 0 : 1] : 1), 0, (L.anchor.z + M.anchor.z) / 2);      /* 11-27 Q1 OPT.trkW [前, 後]（岩羊）：走跑時左右腳落點離中線的倍率（綁定姿勢兩前腳太靠攏，斜前方看擺盪的腳幾乎跟撐地的腳交叉） */ L.gs = V(L.side * (Math.abs(L.P0[0].x) + Math.abs(M.P0[0].x)) / 2, (L.P0[0].y + M.P0[0].y) / 2, (L.P0[0].z + M.P0[0].z) / 2); }
function fitStride(G) { const out = {};
  for (const L of LEGS) { const sp = L.gs, ok = [], S = L.sl;
    for (let dz = -0.7; dz <= 0.7001; dz += 0.01) { const rz = L.ga.z + dz - sp.z, ux = S ? S.x * Math.tanh(0.4 * (rz - L.rz0) / S.x) : 0, d = Math.hypot(sp.y - G.crouch - (S ? 0.5 * S.d : 0) - L.hy, rz - ux, L.ga.x - sp.x); if (d <= Math.max(L.d0, 0.975 * L.dMax) && d >= 1.03 * L.dMin) ok.push(dz); }
    out[L.id] = ok.length ? [ok[0], ok[ok.length - 1]] : [0, 0]; }
  return out; }
const curve = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], e)) : lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
/* 11-27 野鹿 gK 第二版 bob 0.45、crouch 0.15：奔跑時肩膀太低，撐地前腳一經過肩膀正下方肘就得一格折 40°（探針量到：落地 rr 0.97→下一格 0.85）；身體抬高約 3 公分 */
/* 11-27 第二版：抬升／放回速度 1.8→0.7 個體長／秒（審核：衝刺第 58→59 格重心一格跳 17px，就是這裡一格抬 4 公分） */
/* 11-27 撐地前腳的肘不夠折（OPT.anat.eF）：前半身抬高 fLift（寧可抬身體，不把肘壓到底；GPT 建議）。以後腳根為軸抬頭 θ，整個身體再上移「骨盆相對後腳根的下沉量」：後腳高度不變、肩膀抬高 fLift。
   poseBody（招式）與 loco（走跑）都用；每格只累積一次。 */
function fLift() { if (!(OPT.anat && OPT.anat.eF != null)) return { th: 0, dy: 0 }; const dt = INR.dt || 0.0167;
  if (ctl.mode === 'dead' || ctl.mode === 'kdead') { ctl.fLift = 0; return { th: 0, dy: 0 }; }      /* 倒地不抬（審核：倒地前整隻跳起 40px——摺起來的腿被當成要抬身體） */
  if (ctl.flT !== st.t) { ctl.flT = st.t; const de = Math.max(LF.def || 0, RF.def || 0);
    if (ctl.fBL == null) { const h = wp(HEAD.hips), f = wp(LF.s).add(wp(RF.s)).multiplyScalar(0.5), H2 = LEGS.filter(L => L.kind === 'H'), r = wp(H2[0].s).add(wp(H2[1].s)).multiplyScalar(0.5), fw = axes().fwd; ctl.fBL = f.clone().sub(r).dot(fw); ctl.hBL = h.clone().sub(r).dot(fw); }
    const Lt = Math.max(0.1, ctl.fBL); const ext = Math.max(...[LF, RF].map(L => (L.c && !L.c.air && L.rr) || 0)); ctl.fLift = de > 1e-4 ? Math.min(0.25 * Lt, (ctl.fLift || 0) + Math.min(de, 0.7 * Lt * dt)) : Math.max(0, (ctl.fLift || 0) - (ext > 0.96 ? 0.7 : 0.15) * Lt * dt); }      /* 撐地前腳已經快伸直（腿長 96%）就快速放回（審核：走路時前半身被抬著、兩前腳同時懸空） */      /* 審核：一格抬到位會跳一下；每秒最多抬 0.9 個體長（約 2～3 格到位） */
  const th = Math.atan((ctl.fLift || 0) / Math.max(0.1, ctl.fBL || 1)); return { th, dy: (ctl.hBL || 0) * Math.tan(th) }; }
function poseBody({ y = 0, pitch = 0, roll = 0, yaw = 0, chest = 0, neckP = 0, neckY = 0, jaw = 0, ears = 0 }) { if (OPT.neckK != null) neckP *= OPT.neckK;      /* 脖子俯仰每種生物可縮（猛虎脖子粗、頭大，照夜鉤猞的角度會像仰頭看天、埋頭貼地） */
  const { fwd, right, up } = axes(); root.position.y = y + INR.y + (OPT.crocM && OPT.crocM.yO ? OPT.crocM.yO[ctl.mode] || 0 : 0);      /* 11-27 C1 OPT.crocM.yO {模式: 公尺}（鱷魚）：招式／被打時身體高度往下修到跟走跑一樣（綁定姿勢是高姿站立，出招時整隻被抬高 8～15 公分） */
  { const FL = fLift(); pitch += FL.th / D2R; root.position.y += FL.dy; }
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
  const T = torsoPts(); let mn = 1; if (T.length) { mn = skinMinY(T); need = Math.max(need, (OPT.crocM && OPT.crocM.bfY != null ? OPT.crocM.bfY : 0.025) - mn); }      /* 11-27 C1 OPT.crocM.bfY（鱷魚）：肚皮最低點的下限（鱷魚走跑時肚皮本來就貼地，出招時照預設 2.5 公分把整隻撐高 8～17 公分） */
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
/* 11-27 A1 OPT.swQ（岩羊、果脊猴、箭豬、棕熊；取代 swSk／swHz）：擺盪軌跡「先抬到頂、移到落點上方、再放下」。水平進度用五次 smootherstep（smq：6u⁵−15u⁴+10u³，兩端速度、加速度都是 0）；
   高度 swQy：最高點在 u=pk（預設 0.42），之後 (1−t)²(1+2t+b·t²) 放下（頂點與落地斜率都是 0；b=−2.45 時 u=0.8 剩 15%、u=0.9 剩 3%，同 GPT 建議的 Bézier H／0.5H／0／0 的 16%／4%，但頂點不折角）；
   擺盪 u≥fz（預設 0.7）後落點固定在世界（不再跟著速度預測改）。依據：Seyfarth 2003 swing-leg retraction、Zeng 2019、GPT 11-27。收腿量、腳掌下翻跟著同一條高度曲線（落地前先放平）。 */
function swQy(u) { if (u <= 0 || u >= 1) return 0; const Q = OPT.swQ === true ? {} : OPT.swQ, pk = Q.pk ?? 0.42, b = Q.b ?? -2.45; if (u < pk) { const s = Math.sin(0.5 * Math.PI * u / pk); return s * s; } const t = (u - pk) / (1 - pk), w = 1 - t; return w * w * (1 + 2 * t + b * t * t); }
/* 11-27 A1 OPT.rmStop（岩羊）：衝撞收招時步態速度不超過身體實際速度（×1.15）。原本步態速度 0.7 秒才降到 0，身體約 0.25 秒就停住，停住後前蹄還在原地擺盪 0.5 秒（踮蹄尖刮地、兩前腳交叉）；改成身體停、腳步也跟著收 */
function rmCap(i, vT, x) { if (OPT.rmPl) ctl.rmI = i; if (!OPT.rmStop || i !== 2 || !INR.ok) return x; const ms = Math.max(INR.vf || 0, Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1)); return Math.max(vT, Math.min(x, 1.15 * ms)); }
function rmStill(i) { if (!OPT.rmStop || i !== 2 || !INR.ok) return false; const ms = Math.max(INR.vf || 0, Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1)), on = ctl.rmSt === ctl.fc - 1 || ctl.rmSt === ctl.fc; if (!on && !(ms < 0.12 * FIT.walk.v && (ctl.rv ?? 0) < 0.35 * FIT.walk.v)) return false; if (!on) startBlend(0.3); ctl.rmSt = ctl.fc; return true; }
const DBGL = typeof location !== 'undefined' && /[?&]dbgL=1(&|$)/.test(location.search);      /* 11-27 A3：網址加 &dbgL=1 時，每次讓腳離地都記一筆到 window.__dbgLift（只記錄，不改任何行為；查岩羊四腳同時起步用） */
function dbgL(L, tag, x) { if (!DBGL || typeof window === 'undefined') return; const s = (new Error().stack || '').split('\n').slice(2, 4).map(l => (l.match(/:(\d+):\d+\)?$/) || [])[1]).join('<'); (window.__dbgLift || (window.__dbgLift = [])).push([ctl.fc || 0, L.id, tag, s, ctl.mode, +(L.rr || 0).toFixed(3), +(L.grm || 0).toFixed(4), ctl.cuW ? 1 : 0, ctl.cuFT == null ? -1 : +ctl.cuFT.toFixed(3), ctl.cuSt, LEGS.filter(M => M !== L && M.c && M.c.air).map(M => M.id).join(''), +((L.c && L.c.h) || 0).toFixed(3), ...(x || [])]); }
function smq(u) { u = clamp(u, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); }
function ctSwingS(u, duty) { const m = -(1 - duty) / duty, u2 = u * u, u3 = u2 * u, H = (2 * u3 - 3 * u2 + 1) * -0.5 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * 0.5 + (u3 - u2) * m; return clamp((-m * u + H + 0.5) / (1 - m), 0, 1); }
/* 招式照關鍵格飛的腳。p＝這一格關鍵格給的掌根位置（自己座標）；回傳修正後的位置。
   離地：前 kTb 秒水平位置從「釘在原地」平順交給關鍵格（先抬、再被帶走）。落地前（landIn 秒內著地、land＝落地時相對身體的落點）：對準預測的世界落點。 */
function ctAir(L, p, { landIn = null, land = null } = {}) { const c = L.c, dt = INR.dt || 0.0167; if (!c.ok) ctPlant(L, p);
  if (!c.key) { const a = ctLocal(L); c.kTb = c.air ? 0 : clamp(0.05 + 0.3 * Math.hypot(a.x - p.x, a.z - p.z), 0.05, 0.2); c.key = true; c.kt = 0; c.kW.copy(c.W); }
  if (DBGL && !c.air) dbgL(L, 'ctAir'); c.air = true; c.stp = false; c.kt += dt; const q = p.clone();
  if (c.kTb > 0 && c.kt < c.kTb) { const a = stage.worldToLocal(c.kW.clone()), w = sm(0, 1, c.kt / c.kTb); q.x = lerp(a.x, q.x, w); q.z = lerp(a.z, q.z, w);
    const S = wp(L.s), v = V(q.x - S.x, q.y + L.hy - HY - S.y, q.z - S.z), d = v.length(), lim = 0.95 * L.dMax; if (d > lim) { v.multiplyScalar(lim / d); q.set(S.x + v.x, S.y + v.y - L.hy + HY, S.z + v.z); }
    q.y = Math.max(q.y, HY + Math.min(0.04, 0.6 * Math.hypot(q.x - a.x, q.z - a.z))); }      /* 腳一旦在地面上移動就得先抬起來（不貼地平移） */      /* 離地後腳慢慢跟上身體；腿被拉到底時，腳順著腿的方向被帶離地面（蹬直後自然離地），不是貼著地被拖走 */
  if (land && landIn != null && landIn < 0.16) { const vl = ctVel(), t = Math.max(0, landIn), w = 1 - sm(0.02, 0.16, t); q.x = lerp(q.x, land.x + vl.x * t, w); q.z = lerp(q.z, land.z + vl.z * t, w); }
  c.W.copy(ctProj(q)); c.h = Math.max(0, q.y - HY); if (GND) { q.y += ctGnd(L, q, 0); c.gl = c.g; } return q; }
function ctStepStart(L, home, tw = 0, urgent = false, dHint = 0) { const c = L.c; c.und = false; const a = ctLocal(L), d = Math.max(dHint, Math.hypot(a.x - home.x, a.z - home.z)); if (DBGL) dbgL(L, c.air ? 'stepA' : urgent ? 'stepU' : 'step', [+d.toFixed(3)]);      /* dHint：被推開時「預計會差多少」（現在還沒差那麼遠，但這一步實際要跨那麼遠，抬腳高度照它算） */ c.air = true; c.stp = true; c.su = 0; c.W0.copy(c.W); c.y0 = c.h; c.d = d; c.tw0 = tw; c.dur = Math.min(0.12 + 0.2 * Math.min(0.4, d), urgent ? 0.11 : 1) * (OPT.ctDur || 1);      /* 11-27 Q2 OPT.ctDur（水豚、猩猩、鱷魚）：站定／招式中的補步拉長（原本 0.11～0.2 秒＝3～6 格，抬腳那一格膝、踝一格折 35°） */
  c.lift = Math.max(0, Math.max((0.035 + 0.1 * Math.min(0.4, d)) * Math.min(1, d / 0.06), Math.abs(tw) > 0.3 ? 0.03 : 0) - 0.6 * c.h); }      /* 已經抬著的腳（走跑中途改成跨步）也要有弧度，不然後半段會貼著地面滑過去 */
/* 站定與招式裡「踩在地上」的腳（planted）：釘在世界上；離站位（anchor＋off）太遠就跨一步回去。planted=false＝照關鍵格飛（off 是相對站位的位移）。 */
function footC(L, st0, { off = [0, 0, 0], planted = true, pitch = 0, slant = 0, landIn = null, land = null, hold = false, mth = MVTH } = {}) {      /* hold＝這隻腳正在蹬地，不准跨步（由招式自己決定何時離地） */
  const fx = L.kind === 'F' ? -slant : slant, c = L.c, dt = INR.dt || 0.0167;
  if (!c.ok) ctPlant(L, V(L.anchor.x, 0, L.anchor.z));
  if (!planted) { const p = ctAir(L, toWorld(V(L.anchor.x + off[0], HY + off[1], L.anchor.z + off[2])), { landIn, land }); c.lpt = pitch; c.lfl = fx; c.lpp = 0; solveLeg(L, p, pitch, fx, 1, GND ? { g: c.g, sl: c.sl, sr: c.sr } : {}); return; }
  const home = V(L.anchor.x + off[0], 0, L.anchor.z + off[2]);
  if (c.key) { c.key = false; c.air = false; c.n = 0; c.h = 0; c.yw = INR.yaw; }                          /* 照關鍵格飛的腳著地：釘在它落下的地方 */
  if (c.air && !c.stp && OPT.rmPl && ctl.rmSt === ctl.fc && c.h < (OPT.rmPl.h ?? 0.035)) { c.air = false; c.h = 0; c.n = 0; c.yw = INR.yaw; }      /* 11-27 A2 OPT.rmPl（岩羊）：衝撞收招停住、換成站定跨步那一格，快著地的腳直接踩下（原本全部改成跨回站位：兩後腳剛好都抬著就一起跨 7 格＝後半身懸空） */
  else if (c.air && !c.stp) ctStepStart(L, home);                                               /* 走跑中抬著的腳換到站定／招式：從現在的位置直接跨到站位 */
  let p, hgt = 0, sp = 0, yw = 0;
  if (!c.air) { p = ctLocal(L); const tw = ctTw(c), vl = INR.ok ? ctVel() : CT.Z0, d = Math.max(Math.hypot(p.x - home.x, p.z - home.z), Math.hypot(p.x - home.x - 0.1 * vl.x, p.z - home.z - 0.1 * vl.z)),      /* 也看「0.1 秒後會差多少」：被推開時不等腳被拖遠才跨 */ mv = INR.ok && (INR.vw.lengthSq() > 1e-4 || Math.abs(INR.wy) > 0.05), th = (mv ? mth : 0.04) * L.d0; c.n = d / L.d0 + 0.2 * Math.max(0, Math.abs(tw) - 0.2); yw = clamp(tw, -0.7, 0.7);
    if (hold) { /* 不跨 */ } else if (d > th || Math.abs(tw) > (OPT.twStep || 0.45)) {      /* OPT.twStep（水豚）：撐地腳掌被身體轉身扭到幾弧度就跨一步（預設 0.45≈26°） */ let go = true, nA = 0; const far = d > 0.3 * L.d0, urgent = d > 0.42 * L.d0 || L.grm > 0.004 || (L.dbg && L.dbg.err > 0.01);      /* urgent＝腿已經搆不到落腳點：不排隊，馬上抬（被擊退時會連跳幾步） */
      for (const o of LEGS) { if (o === L) continue; const oc = o.c, dg = o.id === CT.DIAG[L.id]; if (oc.air) { nA++; if (!dg && !far) go = false; continue; }
        if (!dg && (oc.n > c.n + 1e-3 || (Math.abs(oc.n - c.n) <= 1e-3 && oc.n * o.d0 > th && CT.ORD[o.id] < CT.ORD[L.id]))) go = false; }
      if (OPT.prC && !urgent && LEGS.some(o => o !== L && o.kind === L.kind && o.c.air)) go = false;      /* 搆不到落腳點（urgent）的照樣跨，否則腳被拖到懸空（自檢：四腳懸空） */      /* 11-27 Q2 OPT.prC（水豚、猩猩、鱷魚）：同對腳（兩前／兩後）另一隻在空中就不跨，連「已經離太遠」也等它落地（審核：轉身時兩後腳同時懸空） */
      if (OPT.prU && urgent && d < OPT.prU * L.d0 && LEGS.some(o => o !== L && o.kind === L.kind && o.c.air)) { go = false; ctl.prUb = c.pw = st.t; } else if (OPT.prU && urgent) go = true;
      if (OPT.prU && go && LEGS.some(o => o !== L && o.kind === L.kind && !o.c.air && o.c.pw != null && st.t - o.c.pw < 0.1 && (c.pw == null || o.c.pw < c.pw - 1e-6) && (!urgent || d < OPT.prU * L.d0))) go = false;      /* 11-27 B1 OPT.prU：同對另一隻已經在等（被擋過）就讓它先跨，不要自己一落地又搶著再跨（審核前自檢：右後腳連跨三步、左後腳一直被拖直） */      /* 11-27 B1 OPT.prU（水豚）：搆不到落腳點的急步也等同對另一隻落地（除非已經被拖到 prU×站位距離）；審核：原地轉身兩後腳同時懸空 */
      const fP = !!(OPT.cuU && ctl.cuFT != null), rmP = (OPT.rmPl && ctl.rmSt === ctl.fc) || fP, rmB = rmP && urgent && d < (fP ? OPT.cuU.d ?? 0.6 : OPT.rmPl.d ?? 0.6) * L.d0 && LEGS.some(o => o !== L && o.c.air && (o.kind === L.kind || (fP && o.id !== CT.DIAG[L.id])));      /* 11-27 A3 OPT.cuU（岩羊）：逃跑狀態（被打後轉身逃跑那一瞬間還在站定）的急步：最多兩隻懸空、只准跟對角那隻一起抬（除非被拉到站位距離 d 倍）。原本遊戲一給逃跑速度，「0.1 秒後會差多少」三隻腳同一格判成急步一起抬，接著切走跑第四隻也抬＝四腳原地跳一下 */      /* 11-27 A2 OPT.rmPl：衝撞收招停住時，急步也要同對另一隻落地、最多兩隻懸空（除非已被拉到站位距離 d 倍）；原本急步最多三隻同時抬，54～58 格四腳離地 */
      if (rmP ? (urgent ? !rmB : go) && nA < 2 : OPT.prU ? (go && nA < (urgent ? 3 : 2)) : urgent ? nA < 3 : (go && nA < 2)) ctStepStart(L, home, tw, urgent, d); }
    else if (L.grm > 0.004 || (L.dbg && L.dbg.err > 0.01)) { let nA = 0; for (const o of LEGS) if (o !== L && o.c.air) nA++; if (OPT.prU && LEGS.some(o => o !== L && o.kind === L.kind && o.c.air)) { nA = 9; ctl.prUb = c.pw = st.t; } if (nA < 3) { const sp0 = wp(L.s); ctStepStart(L, V(sp0.x + L.P0[3].x - L.P0[0].x, 0, sp0.z + L.P0[3].z - L.P0[0].z), tw, true); c.und = true; } } }      /* 身體姿勢把腿根帶離落腳點太遠（被打歪、往前頂）：這隻腳馬上跨到腿根正下方 */
  if (c.air) { if (c.und) { const sp0 = wp(L.s); home.set(sp0.x + L.P0[3].x - L.P0[0].x, 0, sp0.z + L.P0[3].z - L.P0[0].z); }
    const suP = c.su; c.su = Math.min(1, c.su + dt / c.dur); const e = sm(0, 1, c.su), a = stage.worldToLocal(c.W0.clone()), trem = (1 - c.su) * c.dur, vl = ctVel(), hz = V(home.x, 0, home.z).applyAxisAngle(CT.Y, (INR.ok ? INR.wy : 0) * trem); p = V(lerp(a.x, hz.x + vl.x * trem, e), 0, lerp(a.z, hz.z + vl.z * trem, e));      /* 跨步的落點＝「落地那一刻」站位在世界上的位置（身體還在動也不會落地後被拖著走） */ sp = c.lift > 0 ? Math.sin(Math.PI * c.su) : 0; hgt = c.y0 * (1 - e) + c.lift * sp; yw = clamp(c.tw0, -0.7, 0.7) * (1 - e);
    if (c.su >= 1 && suP > 0.8) { const q = ctLocal(L); p.x = q.x; p.z = q.z; }      /* 落地那一格：腳已經幾乎到位，就踩在上一格的位置（這一格身體忽然被推也不會帶著腳滑） */
    c.W.copy(ctProj(p)); c.h = hgt; p.y = ctLocal(L).y; if (c.su >= 1) { c.air = c.stp = c.und = false; c.n = 0; c.h = 0; c.yw = INR.yaw; c.pw = null; } }
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
    pw.y = Math.max(HY, pw.y); if (DBGL && !LF.c.air) dbgL(LF, 'pnc'); LF.c.key = true; LF.c.air = true; LF.c.stp = false; LF.c.lpt = LF.c.lfl = LF.c.lpp = 0; LF.c.W.copy(ctProj(pw)); LF.c.h = pw.y - HY; if (GND) pw.y += ctGnd(LF, pw, 0);
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
const FSG = (typeof location !== 'undefined' && /[?&]fsg=-1(&|$)/.test(location.search)) ? -1 : 1;
const OFFS = { walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, trot: { LH: 0, LF: 0.5, RH: 0.5, RF: 1.0 }, gallop: { LH: 0, LF: 0.42, RH: 0.08, RF: 0.52 } };
const NUM = ['T', 'duty', 'crouch', 'liftF', 'liftH', 'bob', 'pitchA', 'roll', 'yaw', 'flex', 'headK'];
const PROF = Object.assign({ warnY: -0.21, warnP: -10 }, OPT.prof || {});
const ctl = { mode: '', ph: 0, still: 0, bl: 1, fromQ: bones.map(b => b.quaternion.clone()), fromP: bones.map(b => b.position.clone()), lastQ: bones.map(b => b.quaternion.clone()), lastP: bones.map(b => b.position.clone()), fromR: V(), lastR: V(), fromRq: Q(), lastRq: Q(), pin: {}, blDur: 0.16, fl: -1, flWait: 6 + 14 * Math.random() };
function loco(v, dt) { const vt = FIT.trot.v, vw = FIT.walk.v, vg = FIT.gallop.v; if (ACCG && INR.ok) { const cap = Math.max(vw, 1.25 * (INR.vS || 0) + 0.2 * vt); ctl.vG = ctl.locoFresh || ctl.vG == null ? Math.min(v, cap) : Math.min(v, cap, ctl.vG + vg / ACCT * dt); v = ctl.vG; if (NOGB && ctl.gd && !ctl.pbT) v = Math.min(v, lerp(vt * 1.1, 1e9, sm(0.45, 0.85, ctl.gd[1]))); }      /* 11-27 P1 ctl.pbT（箭豬倒衝 OPT.pbTr）：不套「倒退限小跑速度」，改由下面固定小跑步態、步頻／步幅照實際速度放大（原本步態速度被限在小跑 1.1 倍，身體每秒退 7～12 公尺，撐地腳被拖著滑＝溜冰、前腳被拉平貼地） */      /* 不是朝前跑（面向玩家往後退、橫著繞）就不進奔跑：奔跑有四腳騰空期，倒退或橫移時騰空看起來就是整隻縮成一團；改用小跑的腳步（永遠有腳踩地）、步頻加快 */      /* 步態跟著「實際已經跑多快」走：剛起步不直接進奔跑（奔跑有四腳騰空期，起步就騰空看起來像整隻縮起來），先走→小跑→再奔跑 */ let a = 'walk', b = 'trot', u = sm(vw * 1.1, vt * 0.9, v); if (ctl.pbT) { a = 'trot'; b = 'trot'; u = 0; } else if (v > vt) { a = 'trot'; b = 'gallop'; u = OPT.crocM && OPT.crocM.gT ? sm(vt * OPT.crocM.gT[0], vt * OPT.crocM.gT[1], v) : sm(vt * 1.15, Math.max(vt * 1.5, vg * 0.75), v); }      /* 11-27 C1 OPT.crocM.gT [起, 迄]（鱷魚）：小跑→奔跑的切換速度（小跑速度的倍數）；鱷魚閒晃 1.8 m/s 原本已經是奔跑步態（兩前腳、兩後腳同時騰空） */
  const G = {}, A = GAITS[a], Bg = GAITS[b]; for (const k of NUM) G[k] = lerp(A[k], Bg[k], u); if (OPT.gK) for (const k in OPT.gK) G[k] *= OPT.gK[k]; if (OPT.qWalk) { const QW = ctl.qWo = OPT.qWo || (OPT.qWo = { swQ: OPT.swQ, reachK: OPT.reachK }),      /* 原值存在物種 opt 上（同物種多隻共用同一個 opt，不能存在各自的 ctl） */ v1 = 0.5 * (vw + vt), v0 = lerp(vw, v1, 0.6); ctl.qW = ctl.qW ? v > v0 : v > v1; if (OPT.gK && OPT.gK.liftF) G.liftF *= lerp(1 / OPT.gK.liftF, 1, sm(vw, v1, v)); }      /* 11-27 A2 OPT.qWalk（岩羊）：走路速度（小跑以下）時擺盪回到通過審核時的樣子（不用 swQ、reachK、liftF 倍率；這三個是為了奔跑／衝撞加的，套到走路會讓前腳腕折太緊、步子變短）。每隻腳在抬腳那一刻決定用哪一套，擺盪中途不切換 */      /* OPT.gK（箭豬）：步態參數倍率（矮胖蹠行：身體左右晃大、上下起伏小） */ const wG = b === 'gallop' ? u : 0, S0 = lerp(FIT[a].S, FIT[b].S, u);
  for (const L of LEGS) L.cz = lerp(FIT[a].cz[L.id], FIT[b].cz[L.id], u);
  const kSw = OPT.wSx ? lerp(OPT.wSx, 1, clamp((v - vw) / Math.max(1e-6, vt - vw), 0, 1)) : 1;      /* 11-27 D1 OPT.wSx（野鹿）：走路時步子縮短 wSx 倍、步頻加快同樣倍數（速度不變）。探針：走路一步撐地掃過 1.0 公尺，後腳撐到後段伸過腿長 1.11 倍、蹄被拖著滑 2～6 公分／格 */
  const vn = S0 / (G.duty * G.T), r = v / vn, cad = (r < 1 ? Math.max(0.55, Math.sqrt(r)) : Math.min(OPT.cadMax || 1.7, r)) / kSw, Sx = S0 * Math.min(OPT.sxMax || 1.3, r / cad * (1 / kSw)) * kSw      /* 短腿的生物（野豬）跑快時靠腳踩得更快，不靠把步子拉長（拉長會超出腿長，像要跌倒） */, amp = sm(0, 0.6, r) * (OPT.rbStart && ctl.mode === 'ram' && ctl.dph >= 1 && ctl.bobK != null ? ctl.bobK : 1);
  G.liftF *= Math.max(0.25, amp); G.liftH *= Math.max(0.25, amp);
  if (ctl.locoFresh) { ctl.locoFresh = false; let best = 0, bs = -1e9;      /* 剛開始走跑：挑一個起步相位，讓站著的腳從原地自然接上（不滑、不被拖過頭） */
    for (let i = 0; i < 48; i++) { const x = i / 48; let s = 0; const up = [];      /* 分數越高越好 */
      for (const L of LEGS) { const p = ((x + lerp((OPT.offW && a === 'walk' ? OPT.offW : OFFS[a])[L.id], (OPT.offW && b === 'walk' ? OPT.offW : OFFS[b])[L.id], u)) % 1 + 1) % 1; if (p < G.duty) { const e = Math.max(0, 0.5 - p / G.duty); s -= 4 * e * e; if (L.kind === 'H') s += 0.25; } else up.push(L); }      /* 站著的腳在站位＝「撐到一半」的位置：相位太早的腳之後會被拖過頭，扣分；後腳在撐，加分 */
      if (up.length === 2 && CT.DIAG[up[0].id] !== up[1].id) s -= 3; else if (up.length > 2) s -= 3 + 3 * (up.length - 2);      /* 第一步同時抬的腳：一隻、或一組對角（像小跑起步）最穩 */
      if (s > bs) { bs = s; best = x; } }
    ctl.ph = Math.floor(ctl.ph) + 1 + best; for (const L of LEGS) { const pr = ctl.ph + lerp((OPT.offW && a === 'walk' ? OPT.offW : OFFS[a])[L.id], (OPT.offW && b === 'walk' ? OPT.offW : OFFS[b])[L.id], u), cy = Math.floor(pr), p = pr - cy; L.c.cyc = FRSK && p >= G.duty && (p - G.duty) / (1 - G.duty) > 0.3 ? cy : -1e9; L.c.fr = true; } }      /* 起步那一刻，照時鐘「這一步已經擺了三成以上」的腳不再補抬（補抬會晚抬、慢放，跟下一隻疊成三隻腳同時懸空），等下一輪 */
  const ra = INR.ok ? clamp(Math.max(INR.vf, Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1)) / Math.max(v, 1e-3), 0, RAMAX) : 1,      /* 步伐進度跟著「實際移動多少」走，不管往哪個方向：遊戲裡常常身體還沒轉過去就被往側面、甚至往後帶，只看往前的速度會讓步伐停住、四腳懸空 */ dph = dt * cad / G.T * ra; ctl.ph += dph; const ph = ctl.ph;      /* 步態時鐘跟著實際走過的距離轉（被擋住、被推快都不會踩空） */ resetPose(); root.position.set(0, 0, 0); const { fwd, right, up } = axes(), c = 2 * Math.PI * ph;
  const bob = lerp(G.bob * (0.5 + 0.5 * Math.cos(2 * c)), G.bob * (0.5 + 0.5 * Math.sin(c)), wG) * amp; root.position.y = bob - G.bob * 0.6 * amp - G.crouch + INR.y + (OPT.gY || 0) * wG - (OPT.wCr && a === 'walk' ? OPT.wCr * (1 - u) : 0); root.updateMatrixWorld(true);      /* 11-27 D1 OPT.wCr（野鹿）：走路時身體放低（公尺），後腳撐到後段不會伸過腿長被拖著滑（探針：右後蹄每格滑 4～9 公分、腿伸到 1.03～1.06 倍） */      /* 11-27 OPT.gY（野鹿）：奔跑時身體再抬高（公尺）。探針：30fps 下一次撐地只有約 3 格，落地那格腿伸直、下一格肩膀已在蹄正上方，肩膀太低時肘一格就折 45°；抬高讓中段只需折 20°上下 */
  const pitch = G.pitchA * D2R * Math.sin(c) * amp, roll = G.roll * D2R * Math.sin(c) * amp, yaw = G.yaw * D2R * Math.sin(c) * amp, fl = G.flex * D2R * Math.sin(c + 0.4) * amp;
  const FL = fLift();
  if (OPT.stB && wG > 0) { const sB = OPT.stB * wG * Math.max(0, ...LEGS.filter(L => L.kind === 'F').map(L => { const pr = ph + lerp((OPT.offW && a === 'walk' ? OPT.offW : OFFS[a])[L.id], (OPT.offW && b === 'walk' ? OPT.offW : OFFS[b])[L.id], u), p = pr - Math.floor(pr); return p < G.duty ? Math.sin(Math.PI * p / G.duty) ** 2 : 0; })), t2 = Math.atan(sB / Math.max(0.1, ctl.fBL || 1)); FL.th += t2; FL.dy += (ctl.hBL || 0) * Math.tan(t2); }      /* 11-27 OPT.stB（野鹿、野牛；GPT 討論＋文獻：奔跑撐地期前肢像撐竿，長度變化不該全給肘）：前腳撐地期間前半身照 sin²(π×撐地進度) 頂高 stB 公尺，落地、離地兩端不抬（蹄搆得到地），中段最高（肩膀在蹄正上方時肘不用折那麼多） */
  if (FL.dy) { root.position.y += FL.dy; root.updateMatrixWorld(true); }
  rotW(HEAD.hips, right, pitch + FL.th + INR.pitch * D2R); rotW(HEAD.hips, fwd, roll + INR.roll * D2R); rotW(HEAD.hips, up, yaw * 0.5 - 0.4 * INR.bend * D2R); if (INR.bend && HEAD.spine) rotW(HEAD.spine, up, INR.bend * D2R); bodyReachApply(true);      /* 第三代：轉彎時脊椎側彎；第四代：身體高度與前後傾斜跟著地形（走跑時只跟地形，不做「搆不到就沉身」） */
  if (Math.abs(fl) > 1e-4) { rotW(HEAD.spine, right, -fl); rotW(HEAD.chest, right, fl * 1.2); }
  rotW(HEAD.chest, up, -yaw); rotW(HEAD.neck, right, (n => OPT.nodK != null && n < 0 ? n * OPT.nodK : n)(-pitch * G.headK - fl * 0.8) + G.crouch * 0.6 - (OPT.nkDn || 0) * D2R);      /* 11-27 Q1 OPT.nodK（岩羊）：奔跑時頭往下點的那半拍只留這個比例（大角捲到肩頸上） */      /* OPT.nkDn（岩羊）：走跑時頭多壓幾度 */ rotW(HEAD.neck, up, yaw * 0.5 + (INR.look * D2R + (INR.hk || 0)) * (OPT.lookK != null ? OPT.lookK : 1));      /* OPT.lookK（岩羊）：轉彎、看人時頭甩的幅度倍率 */
  /* 第三代：步態時鐘只決定什麼時候抬腳。踩著的腳釘在世界上（身體從上面過去）；抬起的腳飛向「落地那一刻身體會在的位置」底下的落腳點。
     等速直走時和第二代的軌跡完全相同；差別在起步、變速、轉彎、被推：腳不再被身體拖著滑。先解後腿，再解前腿（前腿擺盪時要閃開同一側後腿）。 */
  const vl = ctVel(), nomSw = 1 - G.duty; let nAir = 0; for (const L of LEGS) if (L.c.air) nAir++;
  /* 步伐方向＝身體「實際」移動的方向（身體座標），不是永遠朝前。遊戲裡生物常在還沒轉過去時就被往側面、往後帶；步伐如果只會往前踏，腳一落地就被反方向拖走、馬上又得抬起來，四隻腳就一直懸在半空（看起來縮成一團）。直直往前走時方向就是正前方，和原本完全相同。 */
  { const sp = Math.hypot(vl.x, vl.z), gd = ctl.gd || (ctl.gd = [0, 1]), w = OMNI ? sm(0.12, 0.5, sp) : 0, tx = w * (sp > 1e-6 ? vl.x / sp : 0), tz = (1 - w) + w * (sp > 1e-6 ? vl.z / sp : 1), e = ctl.locoFresh0 ? 1 : 1 - Math.exp(-dt / 0.07); gd[0] += (tx - gd[0]) * e; gd[1] += (tz - gd[1]) * e; const n = Math.hypot(gd[0], gd[1]); if (n > 1e-3) { gd[0] /= n; gd[1] /= n; } else { gd[0] = 0; gd[1] = 1; } }
  ctl.fsW = sm(0.2, 0.8, wG); ctl.fsF = ctl.fc;      /* OPT.fSink 只在奔跑（gallop 權重）生效：走路、站著不動（已審過的段落）完全不變 */
  const gdx = ctl.gd[0], gdz = ctl.gd[1], maxAir = v < vt * 1.15 ? 2 : (OPT.rbStart && ctl.mode === 'ram' && ctl.dph >= 1 && ctl.bobK != null && ctl.bobK < 0.97) ? 3 : 4;      /* OPT.rbStart：衝刺起步的前 0.45 秒至少一隻腳踩地（第一步不四腳騰空） */      /* 走路、小跑最多兩隻腳同時離地（奔跑才允許騰空） */
  for (const L of [LEGS[2], LEGS[3], LEGS[0], LEGS[1]]) { if (!L.c.air) L.c.hxE = null; else if (L.c.hxE != null && L.c.hxE < 0.999) ctl.hxN = (ctl.hxN || 0) + 1;      /* 量測用：swQ.hx 生效次數 */ if (OPT.qWalk && ctl.qWo) { if (L.c.qS == null || !L.c.air) L.c.qS = !!ctl.qW; OPT.swQ = L.c.qS ? ctl.qWo.swQ : undefined; OPT.reachK = L.c.qS ? ctl.qWo.reachK : undefined; }      /* OPT.qWalk：這隻腳這一步用哪一套擺盪 */ const cc = L.c, pr = ph + lerp((OPT.offW && a === 'walk' ? OPT.offW : OFFS[a])[L.id], (OPT.offW && b === 'walk' ? OPT.offW : OFFS[b])[L.id], u), cyc = Math.floor(pr), p = pr - cyc, stn = p < G.duty, sd = lerp(FIT[a].st[L.kind], FIT[b].st[L.kind], u) * Math.min(1, r);
    const hx = L.ga.x + L.side * sd, hz = L.ga.z + (L.cz || 0), PE = (L.kind === 'F' ? 34 : 22) * D2R; let tw, f;
    if (!cc.ok) ctPlant(L, V(L.anchor.x, 0, L.anchor.z));
    if ((cc.key || cc.stp) && HOP && cc.h < 0.025) { const q = ctLocal(L); if (Math.hypot(q.x - hx, q.z - hz) < 0.35 * Sx + 0.03) { ctPlant(L, V(q.x, 0, q.z)); cc.tL = st.t; } }      /* 從招式／補步接過來、腳其實已經快貼地又在站位附近：直接踩下，不再整步擺盪（否則起步時三隻腳一起在空中 0.2 秒，像跳一下） */
    if ((cc.key || cc.stp) && OPT.cuT && ctl.cuW && cc.h < 0.08 && LEGS.some(M => M !== L && M.c.air && (M.kind === L.kind || LEGS.filter(N => N !== L && N.c.air).length >= 2))) { cc.key = cc.stp = false; cc.air = false; }      /* 11-27 A2 OPT.cuT：被打切到逃跑那一格，被打段的跨步旗標會讓三隻腳同一格一起重新起步（加上第四隻＝四腳騰空跳一下）。腳還在地上、同一對已有腳懸空或已有兩隻懸空，就先不抬 */
    if (cc.key || cc.stp) { if (DBGL) dbgL(L, (cc.air ? 'KA' : 'K') + (cc.key ? 'k' : 's')); cc.key = cc.stp = false; cc.air = true; cc.u = 0; cc.W0.copy(cc.W); cc.y0 = cc.h; cc.p0 = -PE; cc.cyc = cyc; cc.fr = true; cc.tw0 = 0; cc.k1 = 1; cc.kh = QKH; cc.qk = true; cc.why = 'K'; }      /* 接過來的這一步是「把腳放回去」：抬低、少收、快放（原本照整步的弧度收腿，三隻腳一起收著半秒，看起來前半身縮在胸口下） */      /* 從招式或補步接過來、還在空中的腳：從現在的位置開始一次擺盪 */
    if (!cc.air) { const q = ctLocal(L), dz = (q.x - hx) * gdx + (q.z - hz) * gdz, lim = (0.5 * Sx + Math.max(0.04, 0.12 * Sx)) * (L.kind === 'F' && OPT.limF && v < vt ? OPT.limF : 1), over = dz < -lim || dz > lim || Math.abs((q.x - hx) * gdz - (q.z - hz) * gdx) > 0.16 || (OPT.latC && Math.abs(q.x - hx) > (OPT.latC - 1) * Math.abs(hx) + 0.04);      /* OPT.latC（野鹿）：踩著的腳被橫向拖到離中線超過站姿寬×latC，就提早再踏一步（不讓腳一直撐在外側） */ if (OPT.cuT) cc.lxo = q.x - hx; cc.dz = [+dz.toFixed(3), +lim.toFixed(3), +((q.x - hx) * gdz - (q.z - hz) * gdx).toFixed(3), +gdx.toFixed(2), +gdz.toFixed(2), nAir, stn ? 1 : 0, cc.cyc === cyc ? 1 : 0];
      if ((!(OPT.prG && v < vt && !(OPT.crocM && OPT.crocM.pgU && ((L.rr || 0) > 0.98 || dz < -lim)) && LEGS.some(M => M !== L && M.kind === L.kind && M.c.air)) && !(OPT.prS && v < vt && LEGS.some(M => M !== L && M.side === L.side && M.c.air && (M.c.u || 0) < (typeof OPT.prS === 'number' ? OPT.prS : 0.8))) && !(OPT.cuT && ctl.cuW && !((L.rr || 0) > (OPT.cuT.rr ?? 0.98) || dz < -(OPT.cuT.dz ?? 1) * lim || L.grm > (OPT.cuT.gm ?? 0.002) || (OPT.cuT.lx != null && Math.abs(q.x - hx) > OPT.cuT.lx)) && LEGS.some(M => M !== L && M.c.air && (M.kind === L.kind || LEGS.filter(N => N !== L && N.c.air).length >= 2))) && !(OPT.rmPl && ctl.mode === 'ram' && ctl.rmI === 2 && ((INR.vS || 0) < 0.3 * vw || (OPT.rmPl.fw ? (!(dz < -lim || (dz < 0 && ((L.rr || 0) > (OPT.rmPl.rr ?? 0.98) || L.grm > (OPT.rmPl.gm ?? 0.002)))) && LEGS.some(M => M !== L && M.c.air && (M.kind === L.kind || LEGS.filter(N => N !== L && N.c.air).length >= 2))) || (dz >= 0 && LEGS.some(M => M !== L && M.c.air)) : !((L.rr || 0) > 0.98 || dz < -lim || L.grm > 0.002) && LEGS.some(M => M !== L && M.kind === L.kind && M.c.air))))      /* 11-27 A2 OPT.rmPl：（11-27 A3 rmPl.rr／gm：收招時落後的腳「腿伸直／搆不到地」例外門檻（原本 0.98／0.002，後腳伸長比 0.981 就不等同對另一隻）；rmPl.sw：收招時擺盪最長秒數（原本 0.5 秒，身體停下時步態時鐘幾乎不走，蹄懸在 20～36cm 高 12～15 格）。rmPl.fw：煞車時腳在身體前方＝撐著煞車，有別的腳在空中就不抬（一次只擺一隻，原本擺到一半步態時鐘停住，蹄懸在半空 0.4 秒）；腳在身體前方時，腿伸直／搆不到地也不算例外，同對另一隻在空中或已有兩隻懸空就等；只有落在身體後方被拖的腳照樣抬。原本收招前蹄撐在前方伸直，另一隻前蹄還沒落地就抬＝兩前腳一起懸空 5 格）衝撞收招身體快停住時步態不再起新步（原本起了兩前腳、接著切站定跨步就兩隻一起懸空 5 格）；收招期間同對另一隻在空中也不起步（腳被拉到腿長除外） */      /* 11-27 A3 OPT.cuT 加 rr／dz／gm：例外門檻可調（腿伸長比 >rr、落後 >dz×步幅、搆不到地 >gm 公尺才不等）。原本 0.98／1／0.002（搆不到地 4 毫米就算），轉身第 2 格前腳就用「搆不到地」例外抬起＝三、四隻同時懸空 */      /* 11-27 A2 OPT.cuT：逃跑轉身（外觀落後）時同一對不同時懸空、最多兩隻懸空；腳已被拉到腿長或落後超過步幅就照樣抬（否則被拖著滑：第 30～35 格右後腳每格被拖 7～26cm） */ || (OPT.ovL && (L.rr || 0) > 1.1 && dz < 0)) && ((!stn && !(OPT.anat && v < vt && LEGS.some(M => M !== L && M.kind === L.kind && M.c.air)) && (cc.cyc !== cyc || (RESW && wG < 0.5 && Math.abs(dz) > 0.55 * lim && st.t - (cc.tL || 0) > 0.18 && nAir < 2 && !LEGS.some(M => M !== L && M.side === L.side && M.c.air)))) || (OPT.anat && (wG > 0.3 || OPT.ovL) && (L.rr || 0) > (wG > 0.3 ? 1.01 : 1.03) && dz < 0 && nAir < maxAir)      /* OPT.ovL（野鹿）：不是奔跑也套用（腿被拉過 1.03 倍就抬；衝撞收招轉小跑時前腳拖到 1.25 倍） */ /* 11-27 審核（野鹿衝刺第 56 格）：撐地的腳被身體甩在後面、已經拉過腿長，就先抬起來，不硬拉著（否則下一格整條腿彈回） */ || (over && (nAir < 2 || (OPT.latC && L.kind === 'F' && nAir < 3 && Math.abs(q.x - hx) > 2 * ((OPT.latC - 1) * Math.abs(hx) + 0.04)) || (FARL && wG < 0.5 && st.t - (cc.tL || 0) > 0.18 && Math.hypot(dz, (q.x - hx) * gdz - (q.z - hz) * gdx) > 1.5 * lim))) || (dz < 0 && (L.grm > 0.002 || (cc.rp != null && cc.rp2 != null && cc.rp + Math.max(0, cc.rp - cc.rp2) > (OPT.rpF && L.kind === 'F' && v < vt ? OPT.rpF : 0.966) && (!RPLIM || gdz > 0.7 || (nAir < 2 && dz < -0.03))))))) {      /* 11-27 Q1 OPT.prG（棕熊）：同一對不同時離地也套到「被拖太遠提早抬」「腿伸到底馬上抬」兩條（原本只管照相位抬；原地轉身時兩後腳一起、兩前腳一起抬） */      /* 提早抬腳最多讓兩隻腳同時在空中（遊戲裡從停住猛加速時，四隻會一起被拉直、一起抬，看起來整隻縮成一團） */ cc.why = (!stn && cc.cyc !== cyc) ? 'S' : over ? 'O' : 'R'; if (DBGL) dbgL(L, 'loco' + cc.why, [+dz.toFixed(3), +lim.toFixed(3), stn ? 1 : 0, cc.cyc === cyc ? 1 : 0, over ? 1 : 0, nAir, +p.toFixed(3)]); cc.air = true;      /* 第三個條件：腿已經伸到底、或照這一格的速度下一格會伸到底（轉彎外側的後腳）就馬上抬 */ cc.u = 0; cc.W0.copy(cc.W); cc.y0 = 0; cc.cyc = cyc; cc.qk = false; cc.p0 = cc.lp; cc.tw0 = clamp(ctTw(cc), -0.6, 0.6); cc.k1 = K1ON ? clamp(0.3 + 0.7 * (0.5 * Sx - dz) / Math.max(1e-3, Sx), 0.62, 1) : 1; cc.kh = KHON ? clamp(0.25 + 0.75 * (0.5 * Sx - dz) / Math.max(1e-3, Sx), 0.55, 1) : 1; nAir++; } }      /* kh：這一步比穩態短（起步第一步只有半步）就抬低一點、少收一點 */      /* k1：這一步要走的距離比穩態短（起步的第一步從站位出發，只有半步）就擺快一點，不會收著腿等很久 */      /* 輪到它抬腳，或被身體拉得太遠（提早抬） */      /* 11-27 GPT＋審核：走路／小跑時同一對（兩前或兩後）不同時離地——原地轉身時四隻同時超過門檻，排成前一對、後一對輪流跳；照步態相位要抬的腳，等同對的另一隻落地才抬 */
    if (cc.air) { const du = Math.max(dph / nomSw, dt / (cc.qk ? 0.22 : (QK3 && nAir >= 3 && wG < 0.5) ? QKT : (OPT.rmPl && OPT.rmPl.sw && ctl.mode === 'ram' && ctl.rmI === 2) ? OPT.rmPl.sw : 0.5)) / (cc.k1 || 1), uR = cc.u + du; cc.u = Math.min(1, uR); const trem = (1 - uR) * dt / du,      /* 著地發生在這一格中間時 trem 是負的：落點照「著地那一刻」算，不會在最後一格往前跳 */ th = (INR.ok ? INR.wy : 0) * trem; if (cc.u < 0.65 || !cc.hF || du >= cc.u) { const lf = L.kind === 'F' && OPT.ldF != null ? lerp(0.5, OPT.ldF, wG) : 0.5; cc.hF = [hx + lf * Sx * gdx, hz + lf * Sx * gdz]; }      /* 11-27 OPT.ldF（野鹿）：奔跑時前蹄落點不要伸那麼前面（探針：落地那格腿伸直 rr 0.999，下一格肩膀一過去 rr 0.88、肘一格折 55°） */ const lp = V(cc.hF[0], 0, cc.hF[1]);      /* 擺盪後段不再跟著步態切換改站位（快落地時落點忽然換位置，腳會貼著地面滑過去） */
      if (Math.abs(th) > 1e-4) lp.applyAxisAngle(CT.Y, th); lp.x += vl.x * trem; lp.z += vl.z * trem;      /* 落地那一刻身體的位置與朝向（照現在的速度、轉向推算） */
      { let sh = 0, sx = 0; if (FPSEP) for (const o of LEGS) { if (o === L || o.c.air || o.side !== L.side || o.c.spg > 0.5) continue; const a = ctLocal(o), need = 0.5 * (L.pw + o.pw) - Math.abs(lp.x - a.x); if (need <= 0) continue; const lo = a.z - o.tipB - L.tipF - 0.01, hi = a.z + o.tipF + L.tipB + 0.01; if (lp.z > lo && lp.z < hi) { if (need <= 0.07) sx = (lp.x >= a.x ? 1 : -1) * need; else sh = (lp.z - lo < hi - lp.z ? lo : hi) - lp.z; } }
        if (cc.u < 0.7) { cc.lz = appr(cc.u < 0.05 ? 0 : cc.lz || 0, sh, 1.5 * dt); cc.lx = appr(cc.u < 0.05 ? 0 : cc.lx || 0, sx, 1.0 * dt); } lp.z += cc.lz || 0; lp.x += cc.lx || 0; }      /* 落點不踩在同側另一隻「還會踩一陣子」的腳上（起步、變速時後腳會追上前腳的腳印）：先往旁邊讓（最多 7 公分），不夠才前後讓一個腳掌；讓的量慢慢變、落地前不再改 */
      if (OPT.latC) { const ax = Math.abs(hx), sg = Math.sign(hx) || L.side; lp.x = sg * clamp(sg * lp.x, 0.6 * ax, OPT.latC * ax); }      /* OPT.latC：落點離身體中線不超過站姿寬×latC（轉身、橫移時腳不往外伸很遠，改成多踏幾步） */
      if (OPT.swQ && OPT.reachK) { const s0 = wp(L.s), tr = Math.max(0, trem), px = s0.x + vl.x * tr, pz = s0.z + vl.z * tr, dy = L.hy - s0.y, dmx = (L.dMax || 1) * OPT.reachK, hm = Math.sqrt(Math.max(1e-6, dmx * dmx - dy * dy)), h = Math.hypot(lp.x - px, lp.z - pz); if (h > hm) { lp.x = px + (lp.x - px) * hm / h; lp.z = pz + (lp.z - pz) * hm / h; } }      /* 11-27 A1 OPT.swQ＋reachK：搆不到就縮步改成對「落地那一刻的肩膀位置」量，整段擺盪同一個落點（原本對現在的肩膀量、擺盪後段一格格往回拉並累加，前蹄落地前往後縮 20～49px、下一格又往前補＝貼地滑） */ const Wl = ctProj(lp); if (OPT.swQ) { const fz = OPT.swQ.fz ?? 0.7; if (cc.u < fz || !cc.WlF || du >= cc.u) cc.WlF = (cc.WlF || V()).copy(Wl); else Wl.copy(cc.WlF); }      /* 11-27 A1 OPT.swQ：擺盪後段落點固定在世界 */ if (OPT.reachK) { if (!cc.rkO || cc.u < 0.05) cc.rkO = V(); Wl.add(cc.rkO); } cc.Wl = (cc.Wl || V()).copy(Wl); const pos = cc.W0.clone().lerp(Wl, OPT.swQ ? smq(OPT.swQ.hx ? Math.min(1, cc.u / (cc.hxE ??= lerp(OPT.swQ.hx, 1, wG))) : cc.u)      /* 11-27 M1 OPT.swQ.hx（果脊猴 0.8）：走路／小跑時水平進度在 u＝hx 就到位，最後一段只往下放（m01：落地前兩格趾尖離地 1～2.7cm 還在一格移 7～13cm）；疾跑（gallop 權重）不套用。每步抬腳時決定 */ : ctSwingS(OPT.swHz ? Math.pow(cc.u, OPT.swHz[L.kind === 'F' ? 0 : 1]) : cc.u, G.duty))      /* 11-27 Q1 OPT.swHz [前, 後]（岩羊、果脊猴）：擺盪的水平進度提早到位（配合 swSk 腳提早放低：腳先移到落點上方再往下放，不貼地往前滑） */, k0 = 1 - sm(0, 0.3, cc.u); f = footPlan(L, G.duty + cc.u * nomSw * 0.99999, G, Sx); if (cc.kh < 1) { f.y = HY + (f.y - HY) * cc.kh; f.flex *= cc.kh; } if (L.kind === 'F' && OPT.swF) { f.flex *= OPT.swF; f.pitch *= OPT.swP == null ? 1 : OPT.swP; f.pp *= OPT.swP == null ? 1 : OPT.swP; }      /* 每種生物可調前腳擺盪時的收腿量與腳掌翻折（猛虎腿多一節，照預設會把腳掌翻到胸口下、肉墊朝外） */
      if (OPT.swHmin && OPT.swQ) { const hm = OPT.swHmin * Math.hypot(Wl.x - cc.W0.x, Wl.z - cc.W0.z) / Math.max(1e-6, INR.sW || 1) * swQy(Math.min(1, cc.u)); if (f.y - HY < hm) f.y = HY + hm; }      /* 11-27 A2 OPT.swHmin（岩羊）：擺盪離地高度至少＝這一步水平距離×swHmin×抬腳曲線。衝撞收招減速時抬腳高度跟著速度縮到很小，步子卻還是奔跑的長步，前蹄貼著地面滑 10～16cm 才落地 */
      f.pitch += (cc.p0 + PE) * k0; f.pp += (cc.p0 + PE) * k0; cc.h = (f.y - HY) + cc.y0 * (1 - sm(0, 0.5, cc.u)); cc.W.copy(pos); tw = stage.worldToLocal(pos.clone()); tw.x = lerp(tw.x, cc.hF[0], 0.85 * gdz * gdz * Math.sin(Math.PI * cc.u) ** 2); if (OPT.latC) { const ax = Math.abs(hx), sg = Math.sign(hx) || L.side; tw.x = lerp(tw.x, sg * clamp(sg * tw.x, 0.6 * ax, OPT.latC * ax), Math.sin(Math.PI * cc.u) ** 2); }      /* OPT.latC：擺盪中的腳（身體在轉）也不往外甩出站姿寬×latC；離地、落地兩端不動 */      /* 轉彎時：擺盪中段（腿收起來的時候）腳回到自己那一側的軌道上，不會掃進肚子或別條腿；離地與落地兩端仍是世界上的點（不滑） */ if (GND) { const g0 = gAt(stage.worldToLocal(cc.W0.clone())), gl = gAt(lp), gc = ctGnd(L, tw, sm(0.6, 1, cc.u)); tw.y = Math.max(lerp(g0, gl, ctSwingS(cc.u, G.duty)), gc); cc.gl = gl; }      /* 第四代：從離地點的地面高度走到落地點的地面高度，途中不低於腳下的地面 */ tw.y += HY + cc.h;
      if (OPT.reachK && !OPT.swQ && cc.u > 0.6) { const s0 = wp(L.s), dy = (tw.y + L.hy - HY) - s0.y, hx = tw.x - s0.x, hz = tw.z - s0.z, h = Math.hypot(hx, hz), dmx = (L.dMax || 1) * OPT.reachK, hm = Math.sqrt(Math.max(1e-6, dmx * dmx - dy * dy));
        if (h > hm && h > 1e-6) { const k = (hm / h - 1) * sm(0.6, 0.85, Math.min(1, cc.u)), ddx = hx * k, ddz = hz * k; tw.x += ddx; tw.z += ddz; const w0 = stage.localToWorld(V(0, 0, 0)), wd = stage.localToWorld(V(ddx, 0, ddz)).sub(w0); wd.y = 0; cc.rkO.add(wd); Wl.add(wd); cc.W.add(wd); } }      /* 11-27 Q1＋GPT OPT.reachK（果脊猴）：擺盪後段落點超出腿可達長度（dMax×reachK）就沿水平往肩根拉回＝搆不到就縮步；落地點跟著一起拉回，不會落地那格跳 */
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
    { const pn = wp(HEAD.neck), ph = wp(HEAD.head), tip = ph.clone().add(ph.clone().sub(pn).multiplyScalar(0.6)); follow(F.head, world(tip), dt); const a = bend(pn, tip, lag(F.head, sW), F.head.gain * wm * (OPT.headSK == null ? 1 : OPT.headSK), 0.38);      /* OPT.headSK（水豚）：頭的慢半拍晃動倍率（脖子短的生物同樣的位移換算成角度很大，奔跑時頭會上下點 ±16°） */
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
/* 外皮取樣（OPT.kdG／hdF 用）：軀幹、頭（含角）、四條腿各一組，抽樣約 3000 點；量的是蒙皮後真正的位置 */
let KDP = null; function kdPts() { if (KDP) return KDP; const sk = []; model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); }); const own = new Map(), hb = new Set(), tb = new Set(); for (const L of LEGS) L.s.traverse(o => { if (o.isBone) own.set(o, L.id); }); if (HEAD.head) HEAD.head.traverse(o => { if (o.isBone) hb.add(o); }); if (TAIL[0]) TAIL[0].traverse(o => { if (o.isBone) tb.add(o); });
  KDP = { body: [], head: [], LF: [], RF: [], LH: [], RH: [] };
  for (const m of sk) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = m.skeleton.bones, n = g.attributes.position.count, stp = Math.max(1, Math.floor(n / 3000));
    for (let i = 0; i < n; i += stp) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const b = bs[SI.getComponent(i, k)]; if (tb.has(b)) continue; KDP[own.get(b) || (hb.has(b) ? 'head' : 'body')].push({ m, i }); } }
  return KDP; }
/* 把一節骨頭繞 axis 轉（每次 5°，最多 6 次，往「最低點變高」的方向），直到那組外皮點不低於 y0 */
function liftOff(bone, axis, pts, y0, n = 6, sg = 0, stp = 5) { if (!bone || !pts.length) return 0; let m0 = skinMinY(pts), tot = 0; for (let it = 0; it < n && m0 < y0; it++) { if (!sg) { rotW(bone, axis, stp * D2R); const a = skinMinY(pts); rotW(bone, axis, -2 * stp * D2R); const b = skinMinY(pts); rotW(bone, axis, stp * D2R); sg = a >= b ? 1 : -1; } rotW(bone, axis, sg * stp * D2R); const m1 = skinMinY(pts); if (m1 <= m0) { rotW(bone, axis, -sg * stp * D2R); break; } m0 = m1; tot += sg * stp; } return tot; }
/* 頭（含角）不埋進地面：最低點低於 y0 就把脖子往上抬（OPT.hdF；野牛頭本來就垂得低，低頭、後踢時角會碰地） */
function headFloor(y0) { if (!HEAD.head || !HEAD.neck) return; root.updateMatrixWorld(true); const r = axes().right; let a = (ctl.hdA || 0) * Math.exp(-(INR.dt || 0.0167) / 0.3); if (a > 0.05) rotW(HEAD.neck, r, a * D2R); else a = 0; a += liftOff(HEAD.neck, r, kdPts().head, y0, 14, 1, 1.5); ctl.hdA = a; }      /* 11-26 審查：抬頭用 1.5 度細步、放回時 0.3 秒慢慢放（原本 5 度一跳，奔跑時頭會一格抬一格壓） */
/* 倒地躺平後貼地（OPT.kdG）：軀幹最低點放到地面（不浮空、不陷進去）；腿、頭的外皮還低於地面就把那條腿／脖子往上收 */
function kdFit(k) { const P = kdPts(); root.updateMatrixWorld(true); root.position.y -= skinMinY(P.body) * k; root.updateMatrixWorld(true); const fw = V(0, 0, 1);
  for (const L of LEGS) { const upD = OPT.kdDrape && Math.sign(L.anchor.x) === ctl.kdS; liftOff(L.s, upD ? axes().right : fw, P[L.id], -0.01, 10); liftOff(L.e, axes().right, P[L.id], -0.01, 10); }      /* kdDrape：上側的腳穿地時往前後讓，不往外翻（往外翻就變成橫伸懸空） */ liftOff(HEAD.neck, fw, P.head, OPT.kdH != null ? OPT.kdH : -0.03, OPT.kdH != null ? 12 : 6); if (OPT.kdH != null) liftOff(HEAD.neck, axes().right, P.head, OPT.kdH, 8); }      /* OPT.kdH：躺平時頭（含角）最低點的下限（岩羊大捲角） */
/* 身體膨脹（OPT.porcM 箭豬豎刺／噴刺環）：整個軀幹（骨盆到胸）放大 s 倍、四肢頭尾維持原大小，皮上的刺跟著張開 */
let PUFF = null; function puff(s) { if (!PUFF) { const B0 = [HEAD.hips, HEAD.spine, HEAD.spine3, HEAD.chest].filter(Boolean), set = new Set(B0); PUFF = { b: HEAD.hips, kids: [] }; for (const b of B0) for (const c of b.children) if (c.isBone && !set.has(c)) PUFF.kids.push(c); }
  if (PUFF.s === s) return; PUFF.s = s; PUFF.b.scale.setScalar(s); for (const c of PUFF.kids) c.scale.setScalar(1 / s); PUFF.b.updateMatrixWorld(true); }
function kdead(t, dt, hitSide) { if (OPT.kdTs) t /= OPT.kdTs;      /* OPT.kdTs（水豚）：整段倒地放慢幾倍（先腿軟、跪下、再倒，不是 3 格就趴下） */ const side = (t < 0.03 || !ctl.kdS) ? (ctl.kdS = (hitSide || OPT.kdSd || 1) >= 0 ? 1 : -1) : ctl.kdS;      /* 11-27 B1 OPT.kdSd（水豚）：遊戲沒傳 hitSide 時倒向哪一側（-1＝右側著地、背朝右邊；預設 +1 左側著地肚子朝右，水豚白肚皮大片，看起來像翻肚） */
  if (!ctl.kdW) { root.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(model), inv = root.matrixWorld.clone().invert(); let x0 = 1e9, x1 = -1e9; for (const cx of [bx.min.x, bx.max.x]) for (const cz of [bx.min.z, bx.max.z]) { const v = V(cx, bx.min.y + 0.5 * (bx.max.y - bx.min.y), cz).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); } ctl.kdW = clamp(0.5 * (x1 - x0) * 0.62, 0.15, 0.6); }
  const H = HREF * 0.92, W = ctl.kdW, ph = t < 0.38 ? 0 : 1; if (ctl.kdP !== ph) { if (ctl.kdP != null) startBlend(0.22); ctl.kdP = ph; ctl.kdHQ = OPT.kdHF && ph === 1 ? LEGS.filter(L => L.kind === 'H').map(L => L.ch.map(b => (ctl.lastQ[bones.indexOf(b)] || b.quaternion).clone())) : null; }      /* 11-27 D1 OPT.kdHF（野鹿）：翻倒開始那一格記下後腳的姿勢 */
  resetPose();
  if (ph === 0 && OPT.kdTuck) { const k = sm(0, 0.38, t), { right } = axes(); if (t < 0.03 || ctl.kdF == null) { ctl.kdF = 0; ctl.kdY0 = ctl.fromR ? ctl.fromR.y : null; if (ctl.deadFresh || !ctl.kdQ0) { if (OPT.kdPl && ctl.deadFresh) for (const L of LEGS) if (L.c && L.c.ok && (L.c.air || L.c.key || L.c.stp)) ctPlant(L, ctLocal(L));      /* 11-27 D1 OPT.kdPl（野鹿）：倒下那一格還在空中的腳，直接釘在它現在的水平位置（由倒地開頭的銜接放下去），不再跨回站位（自檢：閒晃中倒下，第 6→7 格後蹄一格移 30 公分） */ ctl.deadFresh = false; ctl.kdYp = null; ctl.kdNR0 = !!OPT.kdNR; ctl.kdQ0 = OPT.kdNR ? LEGS.filter(L => L.kind === 'F').map(L => L.ch.map(b => (ctl.lastQ[bones.indexOf(b)] || b.quaternion).clone())) : null; } }      /* 11-27 B1 OPT.kdNR（水豚）：前腳從「倒下那一格的姿勢」開始折（原本從綁定姿勢的直腿開始折，身體會先被頂高 0.2、後腳搆不到地被帶離地面） */ let fk = Math.max(ctl.kdF, clamp(t / 0.38, 0, 1) * OPT.kdTuck);      /* 等速地折（先快後慢會在 0.17 秒內就跪下去，太快）；OPT.kdTuck（野鹿）：前腳腕關節往後折、收到胸下，身體跟著往下落到「膝蓋著地」的高度；後腳照舊釘地 */
    const r0 = root.position.clone(), q0 = root.quaternion.clone();      /* 11-27 審核（鹿倒地第 6→7 格往前跳 27px）：doT 會被二分搜尋呼叫好幾次，poseBody 對 root 的累加位移每呼叫一次就疊一次；每次都從同一個起點開始 */
    const doT = f => { root.position.copy(r0); root.quaternion.copy(q0); resetPose(); poseBody({ y: 0, pitch: -9 * k, roll: 6 * side * k, neckP: -16 * k, ears: -30 * k }); if (ctl.kdQ0) LEGS.filter(L => L.kind === 'F').forEach((L, i) => L.ch.forEach((b, j) => b.quaternion.copy(ctl.kdQ0[i][j])));
      for (const L of LEGS) if (L.kind === 'F') { if (OPT.elbIns) { rotW(L.s, right, 10 * f * D2R); rotW(L.e, right, 15 * f * D2R); rotW(L.w, right, -120 * f * D2R); rotW(L.h, right, -25 * f * D2R); } else { if (!ctl.kdQ0) rotW(L.s, right, 20 * f * D2R); rotW(L.e, right, -120 * f * D2R); rotW(L.w, right, -25 * f * D2R); } }      /* 11-27 B1 kdNR（水豚）：從倒下那一格的姿勢折時肩不往前擺（往前擺會把撐地那隻腳往下伸、身體被頂高） */      /* 插了肘骨的（野鹿）：第二節是肘、第三節才是腕 */
      root.updateMatrixWorld(true); { const P = kdPts(); root.position.y -= Math.min(skinMinY(P.LF), skinMinY(P.RF), OPT.kdTT ? skinMinY(P.body) : 1e9); root.updateMatrixWorld(true); } return root.position.y; };
    if (ctl.kdNR0) { ctl.kdNR0 = false; if (OPT.kdBl) startBlend(OPT.kdBl); }
    let y = doT(fk);
    const kdE = OPT.kdNR ? 0.002 : 0.01; if (OPT.anat && ctl.kdY0 != null && y > ctl.kdY0 + kdE && fk < 1) { let lo = fk, hi = 1; for (let n = 0; n < (OPT.kdNR ? 9 : 6); n++) { const m = (lo + hi) / 2; if (doT(m) > ctl.kdY0 + kdE) lo = m; else hi = m; } fk = OPT.kdNR ? hi : Math.min(hi, ctl.kdF + 2.5 * dt); y = doT(fk); if (OPT.kdNR && y > ctl.kdY0) { root.position.y = y = ctl.kdY0; root.updateMatrixWorld(true); } }      /* 11-27 B1 kdNR（水豚）：身體一點都不往上升（倒下那一格前腳彎著時，原本限速折腿會讓身體先升 7 公分）；換姿勢由 kdBl 的銜接攤開 */      /* 11-27 雲端錄影自檢：站著倒地時第 0→1 格一下跪到四成（畫面差 8.1）；往下折最多每秒 2.5（自然速度約 1.45／秒），寧可前幾格身體略高一點 */      /* 11-27 倒地不往上彈（審核：野鹿倒地前整隻跳起 55px）：從奔跑倒下時身體比站姿低，從伸直的腿開始折會先把身體頂回站姿高度；改成一開始就折到「不比倒下那一格高」的程度，之後只會越折越多 */
    if (OPT.kdNR) { const yp = ctl.kdYp, lim = (OPT.kdVy || 0.6) * H * dt; if (yp != null && y < yp - lim) { root.position.y = y = yp - lim; root.updateMatrixWorld(true); } ctl.kdYp = y; }      /* 11-27 B1 OPT.kdNR／kdVy（水豚）：跪下時身體往下落的速度上限（每秒 kdVy×身高；原本前腳折過某個角度、最低點換到腕上，身體 3 格掉 11 公分） */
    ctl.kdF = fk; ctl.kdY = y;
    if (OPT.kdG) headFloor(0.03); for (const L of LEGS) if (L.kind === 'H') footC(L, ctl, OPT.kdTT ? { hold: LEGS.some(M => M !== L && M.kind === 'H' && M.c && M.c.air) } : OPT.elbIns ? { hold: true } : {}); tail(() => 0, 0.2, dt); return; }      /* 11-27 野鹿（elbIns）也釘住後腳：自檢倒地第 5～11 格後腳一抬一放，畫面一格大一格小地抖 */      /* OPT.kdTT（水豚）：跪下時後腳釘著不跨（審核：倒地第 1～2 格兩後腳同時離地） */
  if (ph === 0) { const k = sm(0, 0.38, t); if (OPT.kdHold) INR.y = INR.pitch = INR.roll = 0;      /* OPT.kdSk（水豚）：腿軟下沉深度（身高倍數，預設 0.28）；水豚肚子圓、腿短，沉到 0.28 肚皮先碰地被 bodyFloor 往上頂，跪到一半又彈起 6 公分 */      /* 11-27 B1 kdHold（水豚）：倒地不吃慣性彈簧（走跑中倒下時急停的下沉彈簧，加上 kSm 慢慢退，身體跪到一半又往上彈 6 公分）；倒下那一格的差由換動作的銜接抹平 */ poseBody({ y: (OPT.kdHold && ctl.fromR ? Math.min(0, ctl.fromR.y) : 0) - (OPT.kdSk ?? 0.28) * H * k,      /* kdHold：從倒下那一格的身體高度往下沉（站姿本來就蹲低時，原本先回到 0 高度＝先升 3 公分） */ pitch: -9 * k, roll: 6 * side * k, neckP: -16 * k, ears: -30 * k }); if (OPT.kdG) headFloor(0.03); if (OPT.kdHold) { if (ctl.deadFresh || !ctl.kdOffs) { ctl.deadFresh = false; ctl.kdOffs = LEGS.map(L => { if (!L.c || !L.c.ok) return [0, 0, 0]; const q = ctLocal(L); if (L.c.air || L.c.key || L.c.stp) ctPlant(L, q); return [q.x - L.anchor.x, 0, q.z - L.anchor.z]; }); } LEGS.forEach((L, i) => footC(L, ctl, { hold: true, off: ctl.kdOffs[i] })); } else plantAll(); tail(() => 0, 0.2, dt); return; }      /* 11-27 B1 kdHold：走跑中倒下時，在空中的腳直接釘在它現在的水平位置、由倒地的姿勢銜接放下去（原本跨回站位，第 3～4 格前後腳交叉；改成原地補一步時最後一格掉 12 公分） */      /* 11-27 B1 OPT.kdHold（水豚）：腿軟下沉時四腳都釘著不跨（腿由解算自然彎；不像折腿版從綁定姿勢的直腿開始折會先把身體頂高、前掌插地） */
  const KR = OPT.kdRoll ? OPT.kdRoll / 0.45 : 1, u = t - 0.38, th = side * D2R * (OPT.kdRoll ? (OPT.kdNoB ? kf([[0, 8], [OPT.kdRoll, 85, 's'], [OPT.kdRoll + 0.4, 88, 's']], u) : kf([[0, 8], [OPT.kdRoll, 90, 's'], [OPT.kdRoll + 0.15, 84, 'o'], [OPT.kdRoll + 0.35, 88, 's']], u)) : kf([[0, 8], [0.45, 90, 'i'], [0.6, 82, 'o'], [0.8, 87, 's']], u)) * (OPT.kdAng ? OPT.kdAng / 90 : 1), yc = lerp(OPT.kdTuck && ctl.kdY != null ? ctl.kdY + H * Math.cos(8 * D2R) : H * 0.72, W, sm(0, 0.45 * KR, u))      /* kdTuck：翻倒從跪姿的高度開始（不先彈高再落下） */, c = Math.cos(th), sn = Math.sin(th);      /* OPT.kdRoll（野鹿）：從跪姿翻成側躺用幾秒（預設 0.45 秒、先慢後快，看起來像啪一下翻倒；野鹿改成約 0.5 秒均勻翻過去） */
  root.quaternion.setFromAxisAngle(V(0, 0, 1), th); root.position.set(H * sn, yc - H * c, 0);
  if (OPT.kdTuck && OPT.elbIns) { const pk = 1 - sm(0, 0.4 * KR, u); if (pk > 1e-3) root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 9 * pk * D2R)); }      /* 11-27 野鹿：跪姿的低頭前傾（9°）在翻倒前段慢慢放掉，不在換段那一格一下抬頭（審核：倒地第 12～16 格頭和整隻往上跳） */      /* 繞身體中心翻：身體中心從原本高度落到「半個身寬」高 */
  const { right, fwd } = axes(); rotW(HEAD.neck, right, -10 * D2R); if (OPT.kdTuck && OPT.elbIns) rotW(HEAD.neck, right, -6 * (1 - sm(0, 0.4 * KR, u)) * D2R); rotW(HEAD.neck, fwd, side * 12 * sm(0.2 * KR, 0.6 * KR, u) * D2R);      /* 頭垂下、貼向地面 */
  const dr = sm(0.15 * KR, 0.55 * KR, u); for (const L of LEGS) { const up = Math.sign(L.anchor.x) === side; if (up) rotW(L.s, V(0, 0, 1), -side * (OPT.kdU != null ? OPT.kdU : 58) * dr * D2R); if (up && L.kind === 'F' && OPT.kdFB) rotW(L.s, axes().right, (OPT.kdFB || 0) * dr * D2R);      /* 11-27 Q1 OPT.kdFB（果脊猴，手臂長）：倒地後上側前肢往身體後方收，不橫過臉 */      /* 上面那兩隻腳不會橫著翹在空中：垂下來搭在下面兩隻腳上 */
    rotW(L.s, right, (L.kind === 'F' ? 12 : -10) * D2R); rotW(L.e, right, (L.kind === 'F' ? -14 : 16) * D2R);
    if (OPT.kdFold) { const fk = OPT.kdFold * (1 - (1 - (OPT.kdFoldK || 0)) * sm(0.12 * KR, 0.6 * KR, u)), F = L.kind === 'F', TK = F && OPT.kdTuck; if (TK && OPT.elbIns) { rotW(L.s, right, 4 * fk * D2R); rotW(L.e, right, 12 * fk * D2R); rotW(L.w, right, -106 * fk * D2R); rotW(L.h, right, -25 * fk * D2R); } else { rotW(L.s, right, (TK ? 8 : F ? -10 : 45) * fk * D2R); rotW(L.e, right, (TK ? -106 : F ? 80 : -120) * fk * D2R); rotW(L.w, right, (TK ? -25 : F ? -150 : 100) * fk * D2R); } } }      /* 插了肘骨（野鹿）：跪姿的折法改折腕（第三節） */      /* kdTuck：翻倒開始時前腳接著跪姿的折法（扣掉上面放鬆的 +12／-14 度） */      /* OPT.kdFold（野鹿，腿長）：翻倒的前半段四腳先折起來（前腳腕關節往後折、後腳飛節折），身體落地後才慢慢伸開，長腳不會插進地裡 */
  if (OPT.kdTuck && OPT.elbIns) { const w = 1 - sm(0, 0.5 * KR, u); if (w > 0.01) { root.updateMatrixWorld(true); LEGS.filter(L => L.kind === 'H').forEach((L, j) => { const qf = L.ch.map(b => b.quaternion.clone()); if (ctl.kdHQ) L.ch.forEach((b, i) => b.quaternion.copy(ctl.kdHQ[j][i])); else footC(L, ctl, { hold: true }); L.ch.forEach((b, i) => b.quaternion.slerp(qf[i], 1 - w)); });      /* 11-27 D1 OPT.kdHF（野鹿）：翻倒時後腳不再硬釘在原本踩的點（身體翻走後腿搆不到，IK 解一格跳 20～30 公分、躺下時每格上下抖 3～5 公分＝審核「20～31 格後蹄往前下滑」）；改成從翻倒開始那一格的姿勢平順轉到折腿姿勢，蹄跟著身體一起翻 */ } }      /* 11-27 野鹿審核（倒地第 16～23 格一隻後腳往上抬 30px）：翻倒前段後腳先釘在地上，再慢慢換成折腿姿勢（不是一開始就繞髖往上甩） */
  if (OPT.kdPl) { const w = 1 - sm(0, OPT.kdPl * KR, u); if (w > 0.01) { root.updateMatrixWorld(true); for (const L of LEGS) { if (L.kind !== 'F') continue; const qf = L.ch.map(b => b.quaternion.clone()), pf = L.s.position.clone(); footC(L, ctl, { hold: true }); L.ch.forEach((b, i) => b.quaternion.slerp(qf[i], 1 - w)); L.s.position.lerp(pf, 1 - w); } root.updateMatrixWorld(true); } }      /* 肩帶滑動（L.s 的位置）也一起混合，不然 kdPl 結束那一格肩膀一下回原位、身體高度跳 1.4 公分 */      /* 11-27 B1 OPT.kdPl（水豚）：翻倒前段兩前腳先照「釘在地上」解（後腳不釘：走跑中倒下時後腳步幅大，釘著會被拉成直直平伸），再在 kdPl 秒內慢慢換成折腿姿勢（原本跪姿→翻倒換段那幾格，前掌從地上直接甩到折腿位置，途中插進地裡 13 公分） */
  if (OPT.kdDrape) { root.updateMatrixWorld(true); for (const L of LEGS) { if (Math.sign(L.anchor.x) !== side) continue; const s0 = wp(L.s), d0 = wp(L.h).sub(s0), len = d0.length(), dn = d0.clone().normalize().lerp(V(0, -1, 0), (typeof OPT.kdDrape === "number" ? OPT.kdDrape : OPT.kdDrape[L.kind] || 0) * dr).normalize(); aim(L.s, L.h, s0.addScaledVector(dn, len)); if (L.kind === "H" && OPT.kdDrape.He) { rotW(L.e, axes().right, -OPT.kdDrape.He * dr * D2R); rotW(L.w, axes().right, 0.9 * OPT.kdDrape.He * dr * D2R); }      /* kdDrape.He：上側後腳膝、飛節彎起來，搭在下面那隻腳上（伸直的話會被防穿地往外推成橫伸懸空） */ if (L.kind === "F" && OPT.kdDrape.Fe) { rotW(L.e, axes().right, -OPT.kdDrape.Fe * dr * D2R); rotW(L.w, axes().right, -0.5 * OPT.kdDrape.Fe * dr * D2R); } } }      /* kdDrape.Fe：上側前腳肘、腕放鬆微彎（掌收在胸前搭在下面那隻腳上，不是直直伸出去） */      /* OPT.kdDrape（水豚）：上側兩隻腳受重力往下垂、搭到地上（腿短身體圓，照預設會僵直平伸、前腳懸空像玩具）；穿地由下面的 kdFit 往上收 */
  if (OPT.kdTw) { const { right: rr } = axes(), e = sm(0.1, 0.3, u) * Math.exp(-1.2 * u); for (const L of LEGS) { const ph2 = L.kind === 'F' ? 0 : 1.7, a = OPT.kdTw * e * Math.sin(u * 9 + ph2 + (L.side > 0 ? 0 : 2.2)); rotW(L.e, rr, (L.kind === 'F' ? -1 : 1) * a * D2R); rotW(L.w, rr, (L.kind === 'F' ? 0.6 : -0.6) * a * D2R); } }      /* 11-27 Q2 OPT.kdTw（水豚）：倒下後四腳抽動幾下、慢慢停（審核：前腳 65 格角度完全不變，整條是僵的） */
  if (OPT.kdG) kdFit(Math.max(OPT.kdFit0 || 0, sm(0.1 * KR, 0.45 * KR, u)));
  if (OPT.kdTuck && OPT.elbIns) { const P = kdPts(); root.updateMatrixWorld(true); const m = Math.min(...['body', 'LF', 'RF', 'LH', 'RH'].map(k => skinMinY(P[k]))); if (m > 0) { root.position.y -= m; root.updateMatrixWorld(true); } }      /* OPT.kdNoB（野鹿，11-27 審核：躺平後第 39～42 格抽動）：翻倒到底不再回彈，順順地停在 88°。OPT.kdH -0.06：大鹿角躺平時允許壓進草地一點，頭不會為了讓角離地而整顆扶正（審核：鹿角一直直立） */
  /* 11-27 野鹿：翻倒時後腳折起來，整隻不能懸空——最低點一直貼地（審核：倒地前四腳全部離地、身體往上跳 55px） */ }      /* 腿微彎，像放鬆了 */      /* OPT.kdFit0（水豚）：翻倒途中軀幹最低點也一直貼著地（圓身體翻的時候不會先浮起來再落下） */
/* 猩猩招式（OPT.apeM）。四足（指節著地）站姿為基準；「立起」＝骨盆往後仰（後腳釘地、前腳離地交給手臂 IK），手的目標點都用胸口／肩膀當參考算（換體型不用改數字）。
   beat 捶胸：立起 → 兩手輪流快速捶胸、頭往上抬 → 放下。slam 雙拳砸地：立起、雙拳舉過頭 → 往前下猛砸到身前地面（身體跟著前傾）→ 撐起收回。
   grab 抓：壓低、雙臂往兩側張開 → 往前撲、雙手往中間合抱 → 收回。lift 舉起：立起、雙手舉過頭（抓著人）微微晃 → 往前甩出／放下 → 落回四足。
   rock 拔石：右手往前下伸到地面、抓起 → 舉到頭後方 → 過肩往前丟。swipe 拍擊：身體往右擰、右臂往外抬 → 由外往內橫掃 → 收回。 */
/* 11-27 B1 OPT.apeHo（猩猩）：手從「撐地（腳的解法）」換成「舉在空中（手臂解法）」或反過來的那一格，兩種解法的肘／腕角度差 40～60°，原本一格跳過去（自檢：雙拳砸地第 3～4、52、62 格）；換的時候從上一格的姿勢用 apeHo 秒平順轉過去 */
function apeHo(L, arm) { if (!OPT.apeHo) return; if (L.apeArm != null && L.apeArm !== arm) { L.hoQ = L.ch.map(b => (ctl.lastQ[bones.indexOf(b)] || b.quaternion).clone()); L.hoT = st.t; L.hoD = arm && OPT.apeHoA ? OPT.apeHoA : OPT.apeHo; L.hoH = L.apeHp && L.apeHf === ctl.fc - 1 ? L.apeHp.clone() : null; }      /* 11-27 G1 OPT.apeHoA（猩猩）：撐地→舉起的混合時間（兩種解法肘角差 50°，0.2 秒內轉完會一格 40°）；舉起→撐地維持 apeHo（收招時間短） */ L.apeArm = arm;
  if (L.hoT != null) { const u = (st.t - L.hoT) / (L.hoD || OPT.apeHo); if (u >= 1 || u < 0) L.hoT = null; else { const w = u * u * (3 - 2 * u), H0 = OPT.apeV2 && !arm ? wp(L.h) : null; L.ch.forEach((b, k) => { const q = b.quaternion.clone(); b.quaternion.copy(L.hoQ[k]).slerp(q, w); }); L.s.updateMatrixWorld(true); if (H0) apePin(L, L.hoH ? L.hoH.clone().lerp(H0, w) : H0); } } if (OPT.apeV2) { L.apeHp = wp(L.h); L.apeHf = ctl.fc; } }      /* 釘的位置從換解法前一格的手掌位置平順移到撐地點（手還沒碰到地就換的話不會一格掉下去） */
function apePin(L, T) { for (let it = 0; it < 4; it++) { aim(L.s, L.h, T); L.s.updateMatrixWorld(true); const S = wp(L.s), E = wp(L.e), H = wp(L.h), err = S.distanceTo(T) - S.distanceTo(H); if (Math.abs(err) < 0.002) break; const ax = E.clone().sub(S).cross(H.clone().sub(E)); if (ax.lengthSq() < 1e-8) break; ax.normalize(); const a0 = 0.02, d0 = S.distanceTo(H); rotW(L.e, ax, a0); L.s.updateMatrixWorld(true); const g = (S.distanceTo(wp(L.h)) - d0) / a0; rotW(L.e, ax, -a0); if (Math.abs(g) < 1e-4) break; rotW(L.e, ax, clamp(err / g, -0.25, 0.25)); L.s.updateMatrixWorld(true); } aim(L.s, L.h, T); L.s.updateMatrixWorld(true); }      /* 11-27 G1 V2：手臂解法→撐地解法混合中把手掌釘回撐地點：整條手臂繞肩轉向目標、肘彎多彎少補距離（原本混合中手在地上滑 2～3 公分／格） */      /* 11-27 G1 V2：手臂解法→撐地解法的混合中，兩種解法的手掌位置一樣但關節不同，混合出來的手會在地上滑 2～10 公分；混合後把手臂繞肩膀轉回去對準撐地點 */
function apeAct(o, dt) { const K = ctl.apeK, i = clamp(o.st - 2, 0, 2), dur = [o.wind || 0.6, o.strike || 0.3, o.recover || 0.8][i], T = i + clamp((o.stT || 0) / dur, 0, 1);
  const V2 = !!OPT.apeV2, W0 = o.wind || 0.6, S0 = o.strike || 0.3, R0 = o.recover || 0.8, tr = i === 0 ? (o.stT || 0) : i === 1 ? W0 + (o.stT || 0) : W0 + S0 + (o.stT || 0);      /* 11-27 G1 OPT.apeV2（猩猩）：tr＝招式開始後的實際秒數（預備／出招／收招三段的時間尺度差好幾倍，用 T 排的動作跨段時速度會突變） */
  if (V2) { if (ctl.apeF !== ctl.fc - 1) { for (const L of LEGS) { L.apeG = 0; L.apeT = null; } ctl.apeKp = null; } ctl.apeF = ctl.fc;
    if (K !== ctl.apeKp) { ctl.apeKs = st.t; ctl.apeKf = ctl.apeKp; ctl.apeR0 = ctl.apeRl || 0; ctl.apeZ0 = ctl.apeZl || 0; for (const L of LEGS) L.apeT0 = L.apeT ? L.apeT.clone() : null; ctl.apeKp = K; } }      /* 抓→舉起：同一個模式裡換招，記下換招當下的身體立起量、前移量、手的位置，舉起從這裡接（原本 3 格內整隻站直、手一格換位） */
  if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'ape') startBlend(0.1); ctl.dph = i; }
  resetPose(); SCAP = 0.045;
  const C = { beat: { r: [[0, 0], [1, 1, 's'], [2.0, 1], [3, 0, 's']], p: 62, nk: [[0, 0], [0.9, -4, 's'], [2.0, -4], [3, 0, 's']] },      /* 11-27 Q2 r4：站起用滿整段預備、放下用滿整段收招（審核：站起 3 格、手回地 2 格）；頭不往上仰 */
    slam: { r: V2 ? [[0, 0], [0.1, -0.06, 's'], [0.63, 1, 's'], [0.66, 1], [0.98, 0.2, 'l'], [1.45, -0.18, 'o'], [2.0, -0.12], [3, 0, 's']] : [[0, 0], [0.6, 1, 's'], [0.66, 1], [0.98, 0.2, 'l'], [1.45, -0.18, 'o'], [2.0, -0.12], [2.9, 0, 's']], p: 55,      /* 砸下改成等速、從預備 0.66 就開始（約 12 格）：原本緩入緩出集中在 2 格 */ nk: [[0, 0], [0.75, -8, 's'], [1.5, 6, 's'], [3, 0, 's']] },
    grab: { r: [[0, 0], [1, 0.25, 's'], [1.5, 0.05, 'q'], [2.4, 0.1], [3, 0, 's']], p: 30, nk: [[0, 0], [1, -6, 's'], [1.5, 6, 'q'], [3, 0, 's']] },
    lift: { r: V2 ? [[0, 0.2], [0.8, 1, 's'], [2.0, 1], [2.3, 0.4, 'q'], [2.62, 0.05, 's'], [3, 0, 's']] : [[0, 0.2], [0.8, 1, 's'], [2.0, 1], [2.35, 0.35, 'q'], [3, 0, 's']], p: 60, nk: [[0, 0], [1, -18, 's'], [2, -18], [3, 0, 's']] },
    rock: { r: V2 ? [[0, 0], [0.35, -0.1, 's'], [0.5, -0.1], [1.05, 0.6, 's'], [1.3, 0.65, 'q'], [2.2, 0.15, 's'], [3, 0, 's']] : [[0, 0], [0.4, -0.1, 's'], [0.6, -0.1], [1.0, 0.55, 's'], [1.25, 0.65, 'q'], [2.2, 0.15, 's'], [3, 0, 's']], p: V2 ? 34 : 50, nk: [[0, 0], [0.6, 8, 's'], [1.0, -12, 's'], [1.3, 4, 'q'], [3, 0, 's']] },
    swipe: { r: [[0, 0], [1, 0.25, 's'], [2, 0.12], [3, 0, 's']], p: 35, nk: [[0, 0], [3, 0]] } }[K] || { r: [[0, 0]], p: 0, nk: [[0, 0]] };
  const bL0 = W0 + S0 - 0.25, bL1 = W0 + S0 + R0 - 0.2, swA = W0 - 0.12, swB = W0 + 0.14, swU = V2 ? (u => u * u * u * (u * (6 * u - 15) + 10))(clamp((tr - swA) / (swB - swA), 0, 1)) : 0, eL = V2 && K === 'lift' && ctl.apeKf === 'grab' ? sm(0, 0.6, st.t - ctl.apeKs) : 1;      /* 捶胸 V2：0～0.1 秒先往下沉（預備）、0.1～0.62 秒站起（16 格）、出招最後 0.25 秒開始放下、0.55 秒放到地、最後 0.2 秒落地緩衝；拍擊 V2：橫掃照實際時間在出招前 0.12 秒到出招後 0.14 秒（8 格，五次平滑）；eL＝抓接舉起的銜接 */
  let r = V2 && K === 'beat' ? (tr < 0.1 ? -0.05 * EASE.s(tr / 0.1) : tr < 0.62 ? lerp(-0.05, 1, EASE.s((tr - 0.1) / 0.52)) : tr < bL0 ? 1 : lerp(1, 0, EASE.s(clamp((tr - bL0) / (bL1 - bL0), 0, 1)))) : kf(C.r, T);
  if (eL < 1) r = lerp(ctl.apeR0, r, eL); if (V2) ctl.apeRl = r;
  const pitch = C.p * r, yaw = K === 'swipe' ? (V2 ? (tr < swA ? 20 * EASE.s(clamp(tr / swA, 0, 1)) : tr < swB ? lerp(20, -24, swU) : lerp(-24, 0, EASE.s(clamp((tr - swB) / Math.max(0.1, S0 + R0 - 0.35), 0, 1)))) : kf([[0, 0], [1, 20, 's'], [1.5, -24, 'q'], [2.2, -18, 'o'], [3, 0, 's']], T)) : K === 'rock' ? kf([[0, 0], [1, 14, 's'], [1.55, -12, 's'], [3, 0, 's']], T) : 0;
  root.position.z = K === 'grab' ? kf(V2 ? [[0, 0], [0.85, -0.08, 's'], [1.6, 0.28, 's'], [2.3, 0.2, 's'], [3, 0, 's']] : [[0, 0], [1, -0.08, 's'], [1.5, 0.28, 'q'], [2.3, 0.2, 's'], [3, 0, 's']], T) : K === 'slam' ? kf([[0, 0], [0.66, -0.06, 's'], [1.45, 0.12, 'l'], [2.9, 0, 's']], T) : 0;
  if (eL < 1) root.position.z = lerp(ctl.apeZ0, root.position.z, eL); if (V2) ctl.apeZl = root.position.z;
  const lHold = V2 && K === 'lift' && T > 1 && T < 2.2 ? sm(1, 1.25, T) * (1 - sm(1.95, 2.2, T)) : 0;      /* 舉著人：身體使力上下、前後晃（審核：定格） */
  const bEnv = V2 && K === 'beat' ? sm(W0 + 0.05, W0 + 0.22, tr) * (1 - sm(bL0 - 0.12, bL0 + 0.02, tr)) : 1, yV2 = V2 && K === 'beat' ? -0.02 * sm(0, 0.1, tr) * (1 - sm(0.1, 0.35, tr)) - 0.025 * Math.sin(Math.PI * clamp((tr - bL1 + 0.04) / 0.24, 0, 1)) : V2 && K === 'slam' ? -0.03 * sm(0, 0.11, T) * (1 - sm(0.12, 0.4, T)) : 0;      /* 捶胸只在站穩後才捶、放下前停手；預備往下沉、落地後身體往下壓一下再回來 */
  const brV = V2 ? Math.sin(st.t * 2.4) : 0;      /* V2：整段都有呼吸（胸口起伏），收招最後幾格不會完全定格 */
  poseBody({ y: yV2 + 0.006 * brV + lHold * 0.015 * Math.sin(st.t * 5.3) + (K === 'grab' ? -0.06 * kf([[0, 0], [1, 1, 's'], [1.5, 0.4], [3, 0, 's']], T) : K === 'slam' && T > 0.9 && T < 2.4 ? -0.05 * sm(OPT.apeHo ? 0.9 : 1.2, OPT.apeHo ? 1.6 : 1.45, T) * (1 - sm(1.9, 2.4, T)) : 0), pitch: pitch + 0.8 * brV + lHold * 2.5 * Math.sin(st.t * 3.4), roll: lHold * 2 * Math.sin(st.t * 2.3), yaw: 0.4 * yaw, chest: 0.3 * pitch * 0 + (K === 'beat' && T > 1 && T < 2 ? 1.5 * Math.sin((T - 1) * 40) : 0), neckP: kf(C.nk, T) - (K === 'beat' ? 0.8 : 0.55) * pitch, jaw: K === 'beat' || K === 'slam' ? 14 * sm(0.5, 1, T) * (1 - sm(2, 2.6, T)) : 0 });      /* 立起時脖子往前補回大半，頭不會朝天 */
  if (K === 'slam' && T > 1.45 && T < 1.6) { root.position.y += Math.sin((T - 1.45) * 60) * 0.006 * (1 - (T - 1.45) / 0.15); root.updateMatrixWorld(true); }      /* 砸到地的震動放在拳頭著地之後（原本在揮下途中＝手臂抖） */
  if (OPT.apeLP) { const a = 1 - Math.exp(-dt / OPT.apeLP); if (ctl.apeLP && ctl.apeLP.f === ctl.fc - 1) { ctl.apeLP.p.lerp(root.position, a); ctl.apeLP.q.slerp(root.quaternion, a); root.position.copy(ctl.apeLP.p); root.quaternion.copy(ctl.apeLP.q); } else ctl.apeLP = { p: root.position.clone(), q: root.quaternion.clone() }; ctl.apeLP.f = ctl.fc; root.updateMatrixWorld(true); }      /* 11-27 B1 OPT.apeLP（猩猩）：身體位置／傾角跟目標差一點時間常數（秒）。招式的關鍵格跨預備→出招時時間尺度差 3.6 倍，身體一格往前下衝（自檢：雙拳砸地第 29→30 格畫面差 2.3 倍） */
  const { fwd, right, up } = axes(); if (yaw) rotW(HEAD.chest, up, 0.6 * yaw * D2R);
  if (K === 'slam' && T > 1.4 && T < 2.6) { const e = sm(1.4, 1.6, T) * (1 - sm(2.3, 2.6, T)); rotW(HEAD.chest, right, -3 * e * Math.sin(st.t * 6.5) * D2R); if (HEAD.neck) { rotW(HEAD.neck, up, 12 * e * Math.sin(st.t * 4.2) * D2R); rotW(HEAD.neck, right, 6 * e * Math.sin(st.t * 6.5 + 1) * D2R); } }      /* 砸完撐在地上：胸口喘、頭左右甩（審核：55～67 格完全定格） */
  const pairAir = L => LEGS.some(M => M !== L && M.kind === L.kind && M.c && M.c.air);      /* 同對腳另一隻在空中就先不跨（審核：兩後腳／兩前手同時離地） */
  if (OPT.apeHR) { root.updateMatrixWorld(true); let drop = 0; for (const L of LEGS) { if (!L.c || !L.c.ok || L.c.air || L.c.key) continue; const S = wp(L.s), g = ctLocal(L), lim = OPT.apeHR * L.dMax, h = Math.hypot(S.x - g.x, S.z - g.z); if (h >= lim) continue; drop = Math.max(drop, (S.y - g.y - L.hy) - Math.sqrt(lim * lim - h * h)); }
    if (V2) { const dp = ctl.apeDr != null && ctl.apeDf === ctl.fc - 1 ? ctl.apeDr : 0; drop = Math.min(drop, dp + 0.45 * dt); ctl.apeDr = Math.max(0, drop); ctl.apeDf = ctl.fc; }      /* 11-27 G1 V2：身體往下補的量每秒最多 1.2 公尺（舉起收招手一碰地，身體一格掉 29 公分） */ if (drop > 0) { root.position.y -= drop; root.updateMatrixWorld(true); } }      /* 11-27 B1 OPT.apeHR（猩猩）：站起來時髖不能高過後腳搆得到的高度（腿長×apeHR）；原本站直時兩後腿拉直、腳掌被拖著橫移 13～21 公分；撐地的那隻手（拔石）同樣算進來，原本胸口抬起時撐地的手被拖 30 公分 */
  for (const L of LEGS) if (L.kind === 'H') footC(L, ctl, { hold: Math.abs(r) > 0.3 || pairAir(L) || (V2 && (K === 'rock' || K === 'swipe') && T > 0.05 && T < 2.6) });      /* V2：拔石、拍擊身體會擰，後腳不要跟著碎步（審核：拔石 45～47 兩後腳一抬一放） */
  root.updateMatrixWorld(true); const Cp = wp(HEAD.chest), hd = wp(HEAD.head);
  for (const L of LEGS) { if (L.kind !== 'F') continue; const sd = right.clone().multiplyScalar(-L.side), Sh = wp(L.s), mine = L.side < 0;
    const arc = (a, b, u, sdK) => { const da = a.clone().sub(Sh), db = b.clone().sub(Sh), la = da.length(), lb = db.length(); if (la < 1e-4 || lb < 1e-4) return a.clone().lerp(b, u); const q = new THREE.Quaternion().setFromUnitVectors(da.normalize(), db.normalize()), d = da.clone().applyQuaternion(new THREE.Quaternion().slerp(q, u)), ln = lerp(la, lb, u), bl = Math.max(0, 0.82 * L.dMax - ln) * Math.sin(Math.PI * u); return Sh.clone().addScaledVector(d, ln + bl).addScaledVector(sd, sdK * Math.sin(Math.PI * u)); };      /* 11-27 G1 V2：手的路徑沿著以肩膀為圓心的弧（方向球面內插、距離線性），手臂伸展量平均分配到整段，不會在經過肩膀附近時一格折 40～70° */      /* mine＝右手（單手招式用右手） */
    let w = 0, tg = null, dr = 0, pw = null, out = 0.35;
    if (K === 'beat') { w = V2 ? clamp((r - 0.02) / 0.93, 0, 1) : sm(0.02, 0.95, r); const ph = (T - 1) * 7 * Math.PI + (mine ? Math.PI : 0), hit = T > 1 && T < 2.05 ? bEnv * Math.max(0, Math.sin(ph)) : 0; tg = Cp.clone().addScaledVector(fwd, 0.22 + 0.3 * hit + 0.08 * (1 - sm(0.8, 1, T))).addScaledVector(up, -0.26).addScaledVector(sd, 0.17); out = 0.7; pw = 40; }
    else if (K === 'slam' || K === 'lift') { w = K === 'slam' ? (T > (V2 ? 0.63 : 0.6) ? 1 : V2 ? clamp(r / 0.97, 0, 1) : sm(0.02, 0.95, r)) : V2 ? clamp((r - 0.1) / 0.4, 0, 1) : sm(0.1, 0.5, r);      /* 原本 T=1（換階段）那一格 w 從 0.6 跳到 1＝手一格換位 */ const top = hd.clone().addScaledVector(up, K === 'lift' ? 0.42 : 0.5).addScaledVector(fwd, K === 'lift' ? 0.18 : 0.16).addScaledVector(sd, K === 'lift' ? 0.08 : 0.17), mid = Cp.clone().addScaledVector(fwd, 0.75).addScaledVector(up, 0.25).addScaledVector(sd, 0.2), gnd = V(L.anchor.x * 0.6, HY, L.anchor.z + 0.38); gnd.applyQuaternion(root.quaternion).add(root.position); gnd.y = HY;
      if (K === 'lift' && T < 2.05) top.addScaledVector(sd, 0.03 * Math.sin(st.t * 9));
      tg = K === 'slam' ? (T <= 0.66 ? top : (u => { const a = top.clone().lerp(mid, u), b = mid.clone().lerp(gnd, u); return a.lerp(b, u); })(T < 0.98 ? 0.8 * clamp((T - 0.66) / 0.32, 0, 1) : 0.8 + 0.2 * EASE.o(clamp((T - 0.98) / 0.47, 0, 1))))      /* 預備段（0.9 秒）就砸下八成，出招段（0.25 秒＝3 格）只走最後兩成：同樣的 T 在出招段快 3.6 倍 */ : T < 2 ? top : top.clone().lerp(Cp.clone().addScaledVector(fwd, 0.6).addScaledVector(up, 0.1), sm(2, 2.3, T)); if (K === 'slam' && T > 1.45) { w = 1 - (V2 ? (mine ? sm(1.95, 2.3, T) : sm(2.38, 2.73, T)) : mine ? sm(2.05, 2.55, T) : sm(2.35, 2.85, T)); tg = gnd; }      /* 兩手一前一後收回 */ if (K === 'lift' && T > (V2 ? 2.15 : 2.3)) w = 1 - (V2 ? sm(2.25, 2.62, T) : sm(2.3, 2.9, T)); out = 0.5; pw = 70; }
    else if (K === 'grab') { w = sm(0.05, 0.6, T) * (1 - (V2 ? sm(2.05, 2.6, T) : sm(2.2, 2.9, T))); const wide = Cp.clone().addScaledVector(fwd, 0.25).addScaledVector(sd, 0.55).addScaledVector(up, -0.15), hug = Cp.clone().addScaledVector(fwd, 0.62).addScaledVector(sd, 0.1).addScaledVector(up, -0.12); tg = wide.lerp(hug, sm(1.05, 1.45, T)); out = 0.8; pw = 50; }
    else if (K === 'rock' && mine) { w = sm(0.05, 0.4, T) * (1 - sm(1.6, 2.3, T)); const g = V(L.anchor.x * 0.5, HY + 0.02, L.anchor.z + 0.5).applyQuaternion(root.quaternion).add(root.position), back = hd.clone().addScaledVector(up, 0.3).addScaledVector(fwd, -0.25).addScaledVector(sd, 0.15), thr = Cp.clone().addScaledVector(fwd, 0.7).addScaledVector(up, 0.25);
      g.y = HY + 0.02; if (V2) { const q5 = u => u * u * u * (u * (6 * u - 15) + 10), bk2 = back.clone().addScaledVector(up, 0.12).addScaledVector(sd, 0.1);      /* 舉到頭後方的點離肩膀遠一點（肘不用折到 120°） */
        const pk = Math.max(0.45, (L.apeG > 0 ? L.apeGt : tr) + 0.18); tg = tr < pk ? g : tr < W0 - 0.02 ? arc(g, bk2, EASE.s(clamp((tr - pk) / Math.max(0.2, W0 - 0.02 - pk), 0, 1)), 0.12)      /* 等另一隻前手落地才伸手的話，撿石頭那段往後挪（至少 0.24 秒），不擠成兩格 */ : arc(bk2, thr, q5(clamp((tr - W0 + 0.02) / 0.26, 0, 1)), 0.3);      /* 過肩那段往外側繞（手臂正朝上時解算會翻：第 31 格手一格掉 1 公尺） */ pw = lerp(90, 40, sm(0.42, 0.75, tr)); }      /* 11-27 G1 V2：撿起到舉到頭後方、過肩丟出都沿著以肩膀為圓心的弧線走（手臂保持伸展；原本直線內插經過肩膀，肘一格折 60°、掌角在 T=0.6 一格從 90° 換到 40°） */
      else { tg = T < 0.6 ? g : T < 1.05 ? g.clone().lerp(back, sm(0.6, 1.05, T)) : back.clone().lerp(thr, sm(1.05, 1.3, T)); pw = T < 0.6 ? 90 : 40; } out = V2 ? 0.5 + 1.1 * sm(0.55, 0.85, tr) * (1 - sm(W0 + 0.35, W0 + 0.7, tr)) : 0.5; }      /* V2：手臂過頭時肘的參考方向往外側（原本朝前，手經過正上方那一格肘的平面翻面、手掉 1 公尺） */
    else if (K === 'swipe' && mine) { w = sm(0.1, 0.7, T) * (1 - (V2 ? sm(2.05, 2.55, T) : sm(2.2, 2.9, T))); const o1 = V2 ? Sh.clone().addScaledVector(sd.clone().multiplyScalar(0.8).addScaledVector(fwd, 0.35).addScaledVector(up, 0.05).normalize(), 0.8 * L.dMax) : Cp.clone().addScaledVector(sd, 0.75).addScaledVector(fwd, 0.1).addScaledVector(up, -0.1), o2 = V2 ? Sh.clone().addScaledVector(fwd.clone().multiplyScalar(0.9).addScaledVector(sd, -0.35).addScaledVector(up, -0.3).normalize(), 0.8 * L.dMax) : Cp.clone().addScaledVector(fwd, 0.7).addScaledVector(sd, -0.25).addScaledVector(up, -0.2);      /* 11-27 G1 V2：拍擊的舉手點、掃到的點都放在離肩膀 0.8 倍臂長的地方（原本離肩太近，肘折到 159° 再一格甩直 70°）；橫掃時手臂伸著、繞肩膀轉 */ tg = V2 ? arc(o1, o2, swU, 0) : T < 1 ? o1 : o1.clone().lerp(o2, sm(1, 1.35, T)); out = 1.0; pw = 30; }
    if (K === 'rock' || K === 'swipe') { if (!mine) { footC(L, ctl, { hold: r > 0.3 || (T > 0.2 && T < 2.6) || pairAir(L) }); apeHo(L, false); continue; } }
    if (V2) { const oth = LEGS.find(M => M !== L && M.kind === 'F'); if (!(oth && oth.c.air && !oth.c.key)) { if (!(L.apeG > 0)) L.apeGt = tr; } if (!(oth && oth.c.air && !oth.c.key)) L.apeG = Math.min(1, (L.apeG || 0) + dt / 0.2); w *= L.apeG || 0; }      /* 11-27 G1 V2：剛從走路進招式時另一隻前手還在跨步，這隻先撐著、等它落地再抬（審核：兩前手同時懸空） */
    if (!tg || (w < 0.02 && (T < 0.5 || T > (V2 ? 1.9 : 2.5)))) { footC(L, ctl, { hold: pairAir(L) }); apeHo(L, false); L.apeT = null; continue; }      /* 收招最後手已經回到地上：交回接觸層（原本兩手都還標成「在空中」） */
    if (!L.c.key) footC(L, ctl, {}); const P0 = L.c.key ? V(L.anchor.x, 0, L.anchor.z).applyQuaternion(root.quaternion).add(V(root.position.x, HY, root.position.z)) : wp(L.h).add(V(0, HY - L.hy, 0)); const tgt = V2 ? arc(P0, tg, clamp(w, 0, 1), (K === 'slam' || K === 'lift' || K === 'beat') && T < 1 ? 0.25 : 0.08) : P0.lerp(tg, w);      /* 手離地以後，收回的目標＝站位（不再拿上一格手的投影當接觸點，否則手會一路被自己拖著、最後一格跳回地上） */ if (!V2 && (K === 'slam' || K === 'lift' || K === 'beat') && T < 1) tgt.addScaledVector(sd, 0.35 * Math.sin(Math.PI * clamp(w, 0, 1)));      /* 手從地上舉起時往身側繞一個弧，不從臉前直直穿過 */ if (V2 && K === 'slam' && T > 1.9) tgt.y += 0.07 * Math.sin(Math.PI * clamp(w, 0, 1));      /* V2：砸完收回時拳頭抬起來走回站位（不貼著地拖） */ if (eL < 1 && L.apeT0) tgt.copy(L.apeT0.clone().lerp(tgt, eL)); tgt.y = Math.max(HY, tgt.y); if (V2) L.apeT = tgt.clone();
    if (DBGL && !L.c.air) dbgL(L, 'arm'); L.c.key = true; L.c.air = true; L.c.stp = false; L.c.lpt = L.c.lfl = L.c.lpp = 0; L.c.W.copy(ctProj(tgt)); L.c.h = tgt.y - HY;
    solveArm(L, tgt, { droop: dr, paw: pw == null ? null : lerp(V2 ? 40 : 90, pw, clamp(w, 0, 1)), out, fl: 0 });      /* 11-27 G1 V2：手快回到地上時掌角接近撐地姿勢（約 40°）；原本 90° 指頭朝下，指尖碰地、手掌被抬高 30 公分，換回撐地那一格一格掉下去 */ apeHo(L, true); L.fin = null; }      /* 手在空中：換階段的過渡格不要再照地上的接觸點重解（原本那一格手會掉回地上） */
  if (K === 'beat' && T > 1 && T < 2.1) { const e = bEnv * Math.sin((T - 1) * 7 * Math.PI); rotW(HEAD.chest, axes().right, -2.5 * Math.abs(e) * D2R); if (HEAD.neck) { rotW(HEAD.neck, axes().up, 9 * Math.sin((T - 1) * 9) * D2R); rotW(HEAD.neck, axes().right, -6 * Math.abs(e) * D2R); } }      /* 捶胸：每捶一下胸口往前頂、頭左右甩 */
  if (K === 'rock' || ctl.rockM) { const RFl = LEGS.find(L => L.id === 'RF'); if (!ctl.rockM) { const g = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.95, flatShading: true })); g.castShadow = true; g.scale.set(1.15, 0.85, 1); ctl.rockM = g; stage.add(g); }
    const vis = K === 'rock' && ctl.mode === 'ape' && (V2 ? tr > 0.52 && tr < W0 + 0.1 : T > 0.72 && T < 1.22); ctl.rockM.visible = vis; if (vis) { root.updateMatrixWorld(true); const h = wp(RFl.h), t = wp(RFl.t); ctl.rockM.position.copy(h.lerp(t, 0.6)).add(V(0, 0.05, 0)); ctl.rockM.rotation.set(T * 3, T * 2, 0); } }      /* 拔石：撿起到丟出之間手上有一顆石頭（遊戲丟出去的石頭由遊戲自己畫） */
  if (OPT.hdF) headFloor(0.02); tail(() => 0, 0, dt); }
/* 鱷魚死亡翻滾（OPT.crocM，croc_roll：預備 0.4 → 翻 1.0 → 翻肚 1.2，遊戲裡翻肚那 1.2 秒受傷 +30%）：
   預備：身體往反方向擰、四腳收到身側、尾巴彎起；翻：繞身體長軸連翻一圈半（停在肚子朝上）；翻肚：肚子朝上躺一下、四腳在空中抽動，最後 0.45 秒翻回來趴好。
   每格把軀幹（含收起的腳）最低點放在地面上，身體不會陷進地裡或浮空；翻完回到走跑時四腳重新站好。 */
/* 11-27 C1 OPT.crocM.tuck（鱷魚）：翻滾時四腳像游泳一樣往後收、貼在身體兩側（每一節照身體座標的方向擺：往後、稍微往外、稍微往肚子那側），不會往兩側伸出去（翻到側面時一隻朝天一隻撐地、身體被腳撐起來、爪子從背上露出來）。tuck.F／tuck.H 可給四節的方向 [外, 上, 前]。 */
function crTuck(tk, kick) { const TK = OPT.crocM.tuck, q = root.quaternion, bx = V(1, 0, 0).applyQuaternion(q), by = V(0, 1, 0).applyQuaternion(q), bz = V(0, 0, 1).applyQuaternion(q), D = a => bx.clone().multiplyScalar(a[0]).addScaledVector(by, a[1]).addScaledVector(bz, a[2]).normalize();
  const DF = TK.F || [[0.55, -0.15, -0.8], [0.2, -0.1, -1], [0.1, -0.1, -1], [0.05, -0.05, -1]], DH = TK.H || [[0.6, -0.15, -0.75], [0.2, -0.1, -1], [0.1, -0.1, -1], [0, -0.05, -1]];
  LEGS.forEach((L, li) => { const sd = Math.sign(L.anchor.x) || L.side, A = L.kind === 'F' ? DF : DH, ch = [L.s, L.e, L.w, L.h, L.t];
    for (let j = 0; j < 4; j++) { const a = A[j], d0 = ctl.crD0 && ctl.crD0[li][j], d = D([sd * a[0], a[1] + (j === 1 ? 0.3 * kick : 0), a[2]]); root.updateMatrixWorld(true); if (d0) { const a0 = d0.clone().applyQuaternion(q), sV = (u, w, t) => u.clone().applyQuaternion(Q().slerp(Q().setFromUnitVectors(u, w), t)), M = D([sd * 0.3, 0.8, 0]), v = a0.angleTo(d) > 1.75 ? (tk < 0.5 ? sV(a0, M, tk * 2) : sV(M, d, tk * 2 - 1)) : sV(a0, d, tk); aim(ch[j], ch[j + 1], wp(ch[j]).add(v), 1); }      /* 方向用球面內插；前後幾乎相反的那一節（腳掌朝前→朝後）先往上翻再往後，直線內插會經過「朝正下方」把身體撐起來 */ else aim(ch[j], ch[j + 1], wp(ch[j]).add(d), tk); }
    L.c.ok = false; }); }
function croll(o, dt) { const i = clamp(o.st - 2, 0, 2), dur = [o.wind || 0.4, o.strike || 1.0, o.recover || 1.2][i], u = clamp((o.stT || 0) / dur, 0, 1), T = i + u, side = OPT.crocM.rs || 1;
  if (OPT.crocM.tuck && ctl.crF !== ctl.fc - 1) { for (let b = 0; b < bones.length; b++) bones[b].quaternion.copy(ctl.lastQ[b]); root.quaternion.copy(ctl.lastRq); root.updateMatrixWorld(true); const qi = root.quaternion.clone().invert(); ctl.crD0 = LEGS.map(L => { const c = [L.s, L.e, L.w, L.h, L.t].map(wp); return [0, 1, 2, 3].map(j => c[j + 1].clone().sub(c[j]).applyQuaternion(qi).normalize()); }); root.quaternion.identity(); root.updateMatrixWorld(true); } ctl.crF = ctl.fc;      /* 11-27 C1：翻滾開始那一格記下四腳（走跑時彎著、踩在地上）的各節方向，收腳從這個姿勢慢慢轉過去；原本從綁定姿勢（腳直直往下）開始收，第 2～4 格整隻被直腳撐高 40 公分 */
  if (ctl.crP !== i) { if (ctl.crP != null) startBlend(0.12); ctl.crP = i; }
  resetPose(); const { right, up } = axes(), P = kdPts();
  const ang = kf([[0, 0], [1, -14, 's'], [2, 540, 's'], [2.55, 540], [3, 720, 's']], T) * side, tk = OPT.crocM.tuck && OPT.crocM.tuck.hold ? kf([[0, 0], [0.7, 1, 's'], [3, 1]], T) : kf([[0, 0], [0.7, 1, 's'], [2.6, 1], [3, 0, 's']], T), kick = i === 2 && T < 2.6 ? Math.sin((T - 2) * 26) * sm(2, 2.1, T) * (1 - sm(2.45, 2.6, T)) : 0;
  root.quaternion.setFromAxisAngle(V(0, 0, 1), ang * D2R); root.position.set(0, 0, 0); root.updateMatrixWorld(true);
  const { fwd } = axes(); rotW(HEAD.hips, axes().up, -6 * Math.sin(T * 5) * sm(0.8, 1.2, T) * (1 - sm(2, 2.3, T)) * D2R); if (HEAD.neck) rotW(HEAD.neck, axes().up, 14 * Math.sin(T * 5 + 0.8) * sm(0.8, 1.2, T) * (1 - sm(2, 2.3, T)) * D2R);      /* 翻的時候頭和身體左右扭（咬住東西甩） */
  if (OPT.crocM.tuck) crTuck(tk, kick); else for (const L of LEGS) { const F = L.kind === 'F', sd = Math.sign(L.anchor.x) || L.side; const LT = OPT.crocM.lt || [70, -45, 10]; rotW(L.s, V(0, 1, 0).applyQuaternion(root.quaternion), sd * LT[0] * tk * D2R); rotW(L.s, axes().right, LT[1] * tk * D2R);      /* 身體的上方（翻滾中不是世界的上方） */ rotW(L.s, fwd, sd * (OPT.crocM.lt ? OPT.crocM.lt[2] : 10) * tk * D2R); L.c.ok = false;      /* 鱷魚的腳是往兩側張的：先繞垂直軸往後收、再往下貼身；翻滾時腳不算踩地（翻回來時重新站好） */ rotW(L.e, axes().right, (F ? 1 : -1) * 22 * kick * D2R); }      /* 四腳往後貼著身體（游泳時的收腳），翻肚時不會朝天豎著 */      /* 四腳往後（後腳往前）貼到身側，翻肚時抽動 */
  if (OPT.crocM.eLim != null && !OPT.crocM.tuck) { const qi = root.quaternion.clone().invert(), bf = p => p.sub(root.position).applyQuaternion(qi), ax = V(0, 0, 1).applyQuaternion(root.quaternion); for (let it = 0; it < 3; it++) { root.updateMatrixWorld(true); const hy = bf(wp(HEAD.hips)).y; for (const L of LEGS) { const s0 = bf(wp(L.s)), e0 = bf(wp(L.e)), ex = e0.y - hy - OPT.crocM.eLim; if (ex <= 0) continue; const r = Math.hypot(e0.x - s0.x, e0.y - s0.y); if (r < 1e-4) continue; rotW(L.s, ax, -Math.sign(e0.x - s0.x) * Math.asin(Math.min(1, ex / r))); } } }      /* 11-27 Q2 OPT.crocM.eLim：收腳後手肘／膝蓋高過髖（身體座標往背那一側）就繞身體長軸往肚子那側壓回來——翻肚時腳不會從背上穿出去 */
  root.updateMatrixWorld(true); let mn = skinMinY(P.body); for (const k of ['LF', 'RF', 'LH', 'RH', 'head']) mn = Math.min(mn, skinMinY(P[k])); root.position.y -= mn; root.updateMatrixWorld(true);
  tail(k => Math.sin(st.t * 5 - k * 0.6) * 0.25 * sm(0.5, 1.2, T) * (1 - sm(2.3, 2.8, T)) + side * 0.35 * tk * (1 - sm(1, 1.4, T)), -(OPT.tailUp || 0) - 0.02, dt); }      /* 抵掉 tailUp（翻過來時往「下」垂就變成往上翹） */
/* 角挑（OPT.hook，野牛 toss）：頭壓低、往一側偏、角尖朝前下 → 頸和前半身一起往上猛甩（前腳微離地、身體往前頂、頭從一側甩過中線）→ 收回。後腳釘地 */
/* 連頂（OPT.butt，岩羊 butt）：重心坐到後腳、前半身微微立起（前蹄離地）、下巴收、角尖朝前 → 後腳蹬、前半身往前下衝，頭往前下頂（前蹄落地）→ 收回。連兩下＝遊戲接著再出一次 */
/* 招式進度平滑（hook／butt 用）：打中時遊戲有命中停頓，出招段的 stT 走不完就直接跳進收招，進度會一格跳一大段（頭瞬移）。進度往前最多用 2.5 倍速追上；換新招（進度倒退）或上一格不是這個模式就直接用新值 */
/* 11-27 D1 OPT.cuR（野鹿）：命中停頓時遊戲畫面的野獸位置（v.x＝往模擬位置 tx 的 damp，用停頓後的 dt）幾乎不動，停頓結束一格追上（審核：衝撞 21→23 停兩格再前跳 1 公尺、逃跑 62～64 卡兩格再補）。
   外觀位置改成「同一個 damp 用真實時間算」：沒停頓時兩者完全相同（偏移 0）；停頓中照真實時間繼續往前；之後偏移跟遊戲畫面的追趕一起收掉。遊戲直接改 v.x 的部分（擊退、瞬移）照樣跟著。只動外觀，判定位置不變。 */
function cuR(a, dt) { const [vx, vz, tx, tz, k, gdt] = a, par = stage.parent; stage.position.set(0, 0, 0); if (!par) return; let C = ctl.cr;
  if (!C || !(dt > 0) || Math.hypot(C.x - vx, C.z - vz) > 3 || ctl.crF !== ctl.fc - 1) C = ctl.cr = { x: vx, z: vz, px: vx, pz: vz };
  else { const fR = 1 - Math.exp(-k * dt), fG = 1 - Math.exp(-k * clamp(gdt, 0, dt)), lg = Math.hypot(tx - C.px, tz - C.pz) < 2.5 ? 1 : 0;      /* 停頓項只在畫面位置落後模擬位置 2.5 公尺內時算（沒停頓時 fG＝fR，偏移只會每格縮小、不會累積） */ const fg = lg ? fG : fR; C.x += (vx - C.px) - (tx - C.px) * fg + (tx - C.x) * fR; C.z += (vz - C.pz) - (tz - C.pz) * fg + (tz - C.z) * fR; C.px = vx; C.pz = vz; }
  ctl.crF = ctl.fc; ctl.crL = Math.hypot(C.x - vx, C.z - vz); if (ctl.crL < 1e-5) return; par.updateWorldMatrix(true, false); const P = par.localToWorld(V(0, 0, 0)); stage.position.copy(par.worldToLocal(V(P.x + C.x - vx, P.y, P.z + C.z - vz))); }
/* 11-27 Q1 OPT.cuS（岩羊、果脊猴、箭豬、棕熊）：命中停頓後的追趕不要一格跳。遊戲挨打時整個畫面 dt 變 0.06 倍約 0.06 秒，但野獸的模擬位置照真實時間走，停頓一結束畫面位置一格追上去（衝撞時一格跳 1 公尺＝平常 1.8 倍）：
   身體被慣性一格掀起、踩著的腳被拖到身後。做法：偵測到停頓（dt 掉到平常的 0.35 倍以下）後 0.4 秒內，外觀位置（stage）最多照停頓前的速度×1.15 前進，多出來的距離之後慢慢追上（每秒最多多追 3 公尺）。只動外觀，判定位置不變；瞬移（差 3 公尺以上）直接跟上。 */
/* 11-27 P1 hsT（箭豬 OPT.porcM.hs）：招式進度 T 不受命中停頓影響。停頓那幾格（dt 掉到平常的 0.35 倍以下）照平常的 dt 往前走，其他格跟遊戲的 T 增量一樣前進，最多到 3（收招結束）。需要 OPT.cuS（ctl.cu.dA＝平常的 dt） */
function hsT(T, dur, dt) { const C = ctl.cu, H = ctl.hsT || (ctl.hsT = {}), D = Math.max(0.05, dur); if (H.fc !== ctl.fc - 1 || T < H.g - 0.5) { H.g = T; H.v = T; } else { const g = Math.max(0, T - H.g), dA = C && C.dA ? C.dA : dt, hs = (dt > 0 && dt < 0.35 * dA) || (dt > 0 && g < 0.35 * dt / D && T < 3); H.v = Math.min(3, T + 0.4, H.v + (hs ? Math.max(g, Math.max(dt, dA) / D) : g)); H.g = T; } H.fc = ctl.fc; return H.v; }      /* 停頓判定：dt 掉到平常 0.35 倍以下，或遊戲的 T 幾乎沒前進（dt 照常但 stT 卡住）；最多領先遊戲 0.4 */
function cuS(dt) { const C = ctl.cu || (ctl.cu = { W: null, Pp: null, dA: 1 / 60, win: 0, vr: 0 }), par = stage.parent; stage.position.set(0, 0, 0); if (!par) return; par.updateWorldMatrix(true, false); const P = par.localToWorld(V(0, 0, 0));
  if (!C.W) { C.W = P.clone(); C.Pp = P.clone(); return; } if (dt <= 0) { C.W.y = P.y; stage.position.copy(par.worldToLocal(C.W.clone())); return; }
  const hs = dt < 0.35 * C.dA, sp = Math.hypot(P.x - C.Pp.x, P.z - C.Pp.z) / dt; C.Pp0 = C.Pp.clone(); C.Pp.copy(P); if (!hs) C.dA += (dt - C.dA) * 0.1; if (hs) C.win = 0.4;
  if (!hs && C.win <= 0) { C.vr += (Math.min(sp, 60) - C.vr) * (1 - Math.exp(-dt / 0.05)); if (sp > 0.5) C.vd = { x: (P.x - C.Pp0.x) / (sp * dt), z: (P.z - C.Pp0.z) / (sp * dt) }; }
  const d = P.clone().sub(C.W); d.y = 0; const L = d.length(); const W0 = OPT.cuT ? C.W.clone() : null;
  if (OPT.cuT && !(L > 3) && !(C.win > 0) && ctl.vyW != null && ctl.cuSt === 7) { const T = OPT.cuT, fx = Math.sin(ctl.vyW), fz = Math.cos(ctl.vyW), a = d.x * fx + d.z * fz, lx = d.x - a * fx, lz = d.z - a * fz, ll = Math.hypot(lx, lz), ga = clamp(a, -(T.bk ?? 0.5) * dt, (Math.max(C.vr, sp) + (T.k ?? 2)) * dt), gl = Math.min(ll, (T.lat ?? 1.2) * dt), r = sm(1.6, 2.4, L);
    const cx = ga * fx + (ll > 1e-9 ? lx / ll * gl : 0), cz = ga * fz + (ll > 1e-9 ? lz / ll * gl : 0); d.x = lerp(cx, d.x, r); d.z = lerp(cz, d.z, r); }      /* 11-27 A2 OPT.cuT（岩羊）：被打後轉身逃跑，遊戲一格把朝向轉 180° 就全速往新方向跑，外觀身體還沒轉過來＝整隻往側面／後面平移，後腳被拖成外劈。改成外觀位置只沿著外觀面向前進（橫移每秒 lat 公尺、後退 bk 公尺），落後的距離等身體轉過來再每秒多追 k 公尺；落後超過 1.6 公尺開始放寬、2.4 公尺完全照遊戲（不會到 3 公尺瞬移）。只在逃跑狀態、只動外觀 */
  if (L > (OPT.pbL && ctl.mode === 'pback' ? OPT.pbL : 3)) { C.W.copy(P); C.win = 0; }      /* 11-27 P1 OPT.pbL（箭豬）：倒衝時外觀落後超過幾公尺才直接跟上（配 pbV） */
  else { if (C.win > 0 && C.vd && C.vr > 0.5) { const f = d.x * C.vd.x + d.z * C.vd.z, bk = 2.5 * dt; if (f < -bk) { d.x -= (f + bk) * C.vd.x; d.z -= (f + bk) * C.vd.z; } }      /* 擊退（撞到人被往後推）：停頓後這段時間往後最多每秒 2.5 公尺，不一格瞬移 */
    const mx = (C.win > 0 ? Math.max(C.vr * 1.15, 0.5) : Math.max(C.vr, sp) + 3) * dt, Ld = OPT.cuT ? Math.hypot(d.x, d.z) : L; const mxA = OPT.cuA != null && ctl.mode === 'ape' && (OPT.apeV2 || !(C.win > 0)) ? Math.min(mx, OPT.cuA * dt) : OPT.cuA2 != null && ctl.mode !== 'ape' && (ctl.cuL || 0) > 0.05 ? Math.min(mx, (Math.max(C.vr, sp) + OPT.cuA2) * dt) :       /* 11-27 G1：猩猩招式中命中停頓期間也照 cuA 限速（舉起丟人時遊戲把猩猩往前搬 0.8 公尺，手腳被拖 5～12 公分）；收招後落後的距離每秒最多多追 cuA2 公尺（讓步伐跟得上） */OPT.pbV && ctl.mode === 'pback' ? Math.min(mx, OPT.pbV * dt) : mx;      /* 11-27 P1 OPT.pbV（箭豬）：倒衝時外觀位置每秒最多退 pbV 公尺（遊戲 0.5 秒退 6 公尺＝每格 40 公分，短腿踩不過來、前腳被拖平貼地）；落後的距離在收招時照同樣速度退完（落後最多約 2 公尺） */ if (Ld > mxA) d.multiplyScalar(mxA / Math.max(Ld, 1e-9));      /* 11-27 B1 OPT.cuA（猩猩）：招式中外觀位置每秒最多移動 cuA 公尺（自檢：拔石第 45 格遊戲把猩猩一格搬 1 公尺，撐地的手、後腳被拖 75～93 公分）；落後的距離收招後照原本的規則追上 */      /* OPT.cuT：上限照限制過的位移量算（原本用整段落後距離，等於重複打折、落後追不回來） */ C.W.add(d); C.W.y = P.y; if (!hs && C.win > 0) C.win -= dt; if (OPT.pbV) { const vv = Math.hypot(d.x, d.z) / dt; C.vv = C.vv == null ? vv : C.vv + (vv - C.vv) * (1 - Math.exp(-dt / 0.06)); } }      /* OPT.pbV：外觀實際速度（倒衝步態用） */
  ctl.cuL = Math.hypot(C.W.x - P.x, C.W.z - P.z); if (OPT.cuT && W0) { const vv = Math.hypot(C.W.x - W0.x, C.W.z - W0.z) / dt; ctl.cuV = ctl.cuV == null ? vv : ctl.cuV + (vv - ctl.cuV) * (1 - Math.exp(-dt / 0.08)); } stage.position.copy(par.worldToLocal(C.W.clone())); }      /* OPT.cuT：外觀實際速度（給步態用） */
/* 11-27 N1 OPT.cuV {win, tc, c, k}（野牛）：命中停頓時遊戲把野獸位置停住約 2 格、停頓結束一格補回（頂撞 57～62 格每格位移 55、55、17、7、95、84 公分＝卡兩格再暴衝）。
   外觀位置（stage）在停頓期間和之後 win 秒內照停頓前的速度、方向繼續走，和遊戲位置的差每秒最多修正 c×速度（時間常數 tc 秒）；其他時候完全跟著遊戲位置（落後時每秒最多多追 k 公尺）。只動外觀，判定位置不變；差 3 公尺以上直接跟上。只在衝撞（ram）時啟動 */
function cuV(dt, hs) { const C = ctl.cv || (ctl.cv = { W: null, Pp: null, vr: 0, dx: 0, dz: 1, win: 0 }), par = stage.parent, Q = OPT.cuV === true ? {} : OPT.cuV; stage.position.set(0, 0, 0); if (!par) return; par.updateWorldMatrix(true, false); const P = par.localToWorld(V(0, 0, 0));
  if (!C.W) { C.W = P.clone(); C.Pp = P.clone(); return; } if (dt <= 0) { C.W.y = P.y; stage.position.copy(par.worldToLocal(C.W.clone())); return; }
  const mx = P.x - C.Pp.x, mz = P.z - C.Pp.z, sp = Math.hypot(mx, mz) / dt; C.Pp.copy(P);
  if (hs && ctl.mode === 'ram' && C.vr > 0.5) C.win = Q.win ?? 0.6; ctl.cvD = [+C.win.toFixed(2), +C.vr.toFixed(2), hs ? 1 : 0];
  if (C.win === 0) { C.vr += (Math.min(sp, 60) - C.vr) * (1 - Math.exp(-dt / 0.05)); if (sp > 0.3) { C.dx = mx / (sp * dt); C.dz = mz / (sp * dt); } }
  const L = Math.hypot(P.x - C.W.x, P.z - C.W.z);
  if (L > 3) { C.W.copy(P); C.win = 0; }
  else if (C.win !== 0) { if (hs) { C.W.x += C.dx * C.vr * dt; C.W.z += C.dz * C.vr * dt; } else { const ex = P.x - C.W.x, ez = P.z - C.W.z, al = ex * C.dx + ez * C.dz, lx = ex - al * C.dx, lz = ez - al * C.dz, tc = Q.tc ?? 0.12, gs = (mx * C.dx + mz * C.dz) / dt, vv = clamp(gs + al / tc, 0, (Q.c ?? 1.15) * C.vr), kl = 1 - Math.exp(-dt / tc); C.W.x += C.dx * vv * dt + lx * kl; C.W.z += C.dz * vv * dt + lz * kl; C.win -= dt; if (Math.hypot(P.x - C.W.x, P.z - C.W.z) < 0.01 || C.win < -2) C.win = 0; } }      /* 追到遊戲位置（差 <1 公分）才結束，不照時間硬切（硬切那格會倒退一下） */      /* 停頓中：照停頓前的速度往前；停頓後：沿前進方向的速度＝遊戲速度＋落後量/tc（不倒退、最多 c 倍停頓前速度），遊戲追上就結束 */
  else { const m = (Math.max(C.vr, sp) + (Q.k ?? 2)) * dt; if (L > m) { C.W.x += (P.x - C.W.x) * m / L; C.W.z += (P.z - C.W.z) * m / L; } else { C.W.x = P.x; C.W.z = P.z; } }
  C.W.y = P.y; stage.position.copy(par.worldToLocal(C.W.clone())); }
function smT(raw, dur, dt) { if (OPT.hsMin && !OPT.smTc) { if (dt > 0.004) ctl.dtN = ctl.dtN ? lerp(ctl.dtN, dt, 0.1) : dt; dt = Math.max(dt, OPT.hsMin * (ctl.dtN || dt)); }      /* 11-27 OPT.hsMin（野牛、野鹿）：遊戲命中停頓時送來的 dt 只剩 6%（探針：甩角第 25～26 格 dt＝0.0005），招式時間照至少 hsMin 倍正常速度走，不會整隻停一格 */
  const p = ctl.sT; ctl.sT = (p == null || raw < p - 0.5 || ctl.sTm !== ctl.fc - 1) ? raw : clamp(raw, Math.min(OPT.smTc ? Math.max(p, Math.ceil(raw - 1e-6)) : Math.floor(p) + 1, p + (OPT.hsMin ? (OPT.smTc ? 0.8 : 1) : 0.45) * dt / Math.max(0.05, dur)), p + 1.8 * dt / Math.max(0.05, dur));      /* 11-27 D1 OPT.smTc（野鹿）：保底前進不越過遊戲目前這一段的結尾（原本走到整數就能衝進下一段，遊戲還在預備＝後踢第 1～4 格跑到出招姿勢、第 5 格被拉回 1.0：整隻掉一格）；dt 用真實時間（hsR），不用舊的平均 dt（錄影／掉幀後平均 dt 偏大，保底速度變 3 倍） */      /* 11-26 審查：命中停頓時不卡格（至少 0.45 倍速前進，但不越過這一段），追趕最多 1.8 倍速 */ ctl.sTm = ctl.fc; return ctl.sT; }
/* 果脊猴（OPT.monk）三個招式。前腳當手用：planted:false＋off 讓那隻腳照關鍵格飛（off 是相對站位、地面高度）。 */
/* 伸手偷：身體壓低躡近 → 右前肢往前伸出去抓（頭跟著看）→ 抓到縮回、抱在胸前（前半身微微立起）→ 放下 */
function stealA(T, dt) { const cr = kf([[0, 0], [0.5, 1, 's'], [1.8, 1], [2.4, 0.3, 's'], [3, 0, 's']], T), rch = kf([[0, 0], [0.12, 0], [0.7, 1, 's'], [1.25, 1], [1.7, 0, 's'], [3, 0]], T), hold = kf([[0, 0], [1.25, 0], [1.75, 1, 's'], [2.3, 1], [3, 0, 's']], T),      /* 11-27 Q1 審查：蓄力前 15% 就伸、七成伸到最遠；手抬到胸口以上、掌心朝前；伸著的時候手在撈（不是定住 1 秒）；抱著的東西 0.7 秒慢慢放（原本 2 格收回） */
    fm = rch * sm(0.6, 0.8, T) * (1 - sm(1.2, 1.3, T)), wg = Math.sin(st.t * 9) * fm, wg2 = Math.sin(st.t * 6.3 + 1) * fm, hb = Math.sin(st.t * 7) * hold;
  root.position.z = 0.12 * rch - 0.05 * hold + 0.02 * wg;
  poseBody({ y: -0.07 * cr + 0.02 * hold + 0.05 * rch + 0.006 * hb, pitch: -4 * cr * (1 - hold) * (1 - rch) + 12 * rch * (1 - hold) + 12 * hold + 2 * wg2, roll: 3 * wg2, chest: 3 * rch, neckP: -6 * cr + 12 * rch - 4 * hold + 3 * wg, neckY: -10 * rch + 6 * hold + 8 * wg2 + 10 * Math.sin(st.t * 2.1) * hold, jaw: 6 * rch + 4 * fm });
  for (const L of LEGS) { const a = L.id === 'RF' ? rch + hold : 0; footC(L, ctl, a > 0.02 ? { planted: false, off: [-Math.sign(L.anchor.x) * (0.07 * hold + 0.04 * rch) + 0.03 * wg2, 0.62 * rch + 0.30 * hold * (1 - rch) + 0.05 * wg, 0.30 * rch + 0.03 * hold + 0.05 * wg2], pitch: 0.55 * rch + 0.3 * wg } : {}); }
  tail(k => Math.sin(st.t * 4 - k * 0.6) * 0.12, 0.1, dt); }
/* 扯披肩：雙前肢往前上伸、抓住（身體往前探）→ 後腳蹬住、整個往後坐猛扯（前半身立起、張嘴）→ 放手落回 */
function tugA(T, dt) { const rch = kf([[0, 0], [0.75, 1, 's'], [2.6, 1], [3, 0, 's']], T), pl = kf([[0, 0], [0.85, 0], [1.6, 1, 's'], [1.95, 0.45, 's'], [2.25, 1, 's'], [2.5, 0.5, 's'], [2.7, 0.75, 's'], [3, 0, 's']], T), sh = Math.sin(st.t * 13) * pl;      /* 11-27 Q1 審查：看得出在扯——兩手抓在人的肩膀高度、往後坐猛扯一下、再連扯兩下（頭甩、張嘴），最後放手；不再整段收招定住 */
  root.position.z = 0.10 * rch * (1 - pl) - 0.16 * pl;
  poseBody({ y: -0.04 * rch + 0.03 * pl, pitch: 8 * rch + 14 * pl, chest: 4 * pl, roll: 3 * sh, neckP: -6 * rch + 10 * pl, neckY: 10 * sh, jaw: 18 * pl, ears: 0 });
  for (const L of LEGS) footC(L, ctl, L.kind === 'F' && rch > 0.02 ? { planted: false, off: [-Math.sign(L.anchor.x) * 0.04 * rch, 0.44 * rch + 0.08 * pl, 0.30 * rch * (1 - pl) + 0.03 * pl], pitch: 0.5 * rch } : { hold: pl > 0.2 });
  tail(k => Math.sin(st.t * 9 - k * 0.6) * 0.15, -0.1 * pl, dt); }
/* 蹲坐（樹上待機）：後腿蹲下、屁股落低、前半身立起，前肢撐在身前；每 9 秒一輪小動作：左前肢抬起搔頭（頭往那邊歪）→ 張望左右 → 尾巴慢慢擺 */
function sitA(t, dt) { const k = sm(0, 0.7, t), P = t % 6, on = sm(0.6, 1.0, t), scr = kf([[0, 0], [0.8, 0], [1.3, 1, 's'], [2.0, 1], [2.5, 0, 's'], [6, 0]], P) * on      /* 11-27 M1：舉手／放下各 0.5 秒（原本 0.4 秒，手一格移 23 公分）、搔 0.7 秒 */, sc2 = scr * (0.5 + 0.5 * Math.sin(t * 13)),      /* 11-27 Q1 審查：6 秒一輪；搔頭換成靠鏡頭那一側的右手（左手在遠側看不到）；整段一直有呼吸、尾巴、頭小動作，不像凍住 */
    look = kf([[0, 0], [3.2, 0], [3.8, 30, 's'], [4.4, 30], [5.0, -26, 's'], [5.5, -26], [6, 0, 's']], P) * on, br = Math.sin(t * 2.6) * k;
  root.position.z = -0.08 * k;
  poseBody({ y: -0.32 * k + 0.006 * br, pitch: 34 * k + 1.2 * br, chest: 6 * k + 2 * br, neckP: -24 * k - 6 * scr + 3 * sc2 + 3 * Math.sin(t * 0.9) * k, neckY: look + 14 * scr + 5 * Math.sin(t * 0.7) * k, jaw: 3 * Math.max(0, Math.sin(t * 1.3)) * k, ears: 0 });
  if (HEAD.head) rotW(HEAD.head, axes().fwd, 10 * scr * D2R);
  const hP = HEAD.head ? wp(HEAD.head) : null, scO = Math.sin(t * 15), scO2 = Math.sin(t * 15 + 1.2);      /* 11-27 M1 審查（m04 手在臉前、鼻子高度，沒碰到頭）：搔頭的手照頭骨位置算（頭右上側），原本用站位＋固定偏移，目標離肩膀太近（伸長比 0.39＝折到底），手上不去 */
  for (const L of LEGS) { if (L.kind === 'F' && (L.id !== 'RF' || scr < 0.002 || !hP)) footC(L, ctl, k > 0.05 ? { planted: false, off: [-Math.sign(L.anchor.x) * 0.02 * k, 0.17 * k, -0.08 * k], pitch: 0.25 * k } : {});      /* 坐著時兩手搭在膝上 */
    else if (L.id === 'RF') { const sx = Math.sign(L.anchor.x), T = hP.clone().add(V(sx * 0.16, 0.10 + 0.018 * scO, -0.05 + 0.035 * scO2)), P = toLocal(T.clone().setY(T.y - L.hy + HY)), hm = [P.x - L.anchor.x, P.y - HY, P.z - L.anchor.z], r0 = [-sx * 0.02 * k, 0.17 * k, -0.08 * k], w = scr;      /* 手腕在頭側偏上（頭骨往外 16、往上 10、往後 5 公分），指頭朝上搭在頭頂側；前後來回搔 2.4Hz（±3.5 公分）、上下 ±1.8 公分 */
      footC(L, ctl, { planted: false, off: r0.map((x, n) => lerp(x, hm[n], w)), pitch: lerp(0.25 * k, 1.35 + 0.22 * scO, w) }); }      /* 從膝上到頭側用同一條權重連續過去（原本 scr＞0.02 才切換，切換那格手跳位置） */
    else footC(L, ctl, { off: [0, 0, 0.04 * k] }); }
  tail(i => Math.sin(st.t * 0.9 - i * 0.5) * 0.26 * (1 + 0.3 * i / 10), 0.12, dt); }
function buttA(T, dt) { const { right } = axes(), B0 = OPT.butt === true ? {} : OPT.butt, rp = B0.rear || 1;      /* 11-27 Q1 審查重排（岩羊）：後坐立起、兩前蹄一起收高離地 T0→0.5（前半身明顯立起）；頂點停一下；往前下撲頂 T0.6→1.45（前 0.4 加速走三成、後段等速，約 10 格、看得到的大動作約 6 格，命中在 1.4）；頂住到 2.0；收回到 3 */
  root.position.z = kf([[0, 0], [0.5, -0.10, 's'], [0.6, -0.11], [1.0, -0.029, 'q'], [1.45, 0.16, 'l'], [2.0, 0.12, 's'], [3, 0, 's']], T);
  poseBody({ y: kf([[0, 0], [0.5, 0.015 * rp, 's'], [0.6, 0.015 * rp], [1.0, 0.0105 * rp - 0.021, 'q'], [1.45, -0.07, 'l'], [2.0, -0.04, 's'], [3, 0, 's']], T), pitch: kf([[0, 0], [0.5, 12 * rp, 's'], [0.6, 12.5 * rp], [1.0, 8.75 * rp - 2.1, 'q'], [1.45, -7, 'l'], [2.0, -4, 's'], [3, 0, 's']], T), chest: kf([[0, 0], [0.5, 5, 's'], [1.0, 2, 'q'], [1.45, -5, 'l'], [2.0, -3, 's'], [3, 0, 's']], T),
    neckP: kf([[0, 0], [0.5, -8, 's'], [0.6, -9], [1.0, -12.9, 'q'], [1.45, -22, 'l'], [2.0, -18, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [0.6, 4, 's'], [1.5, -3, 's'], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
  if (HEAD.head) rotW(HEAD.head, right, kf([[0, 0], [0.5, -12, 's'], [0.6, -13], [1.0, -15.1, 'q'], [1.45, -20, 'l'], [2.0, -14, 's'], [3, 0, 's']], T) * D2R);
  const lf = kf([[0, 0], [0.45, 1, 's'], [0.7, 1], [1.3, 0, 'q'], [3, 0]], T);      /* 兩前蹄同一個時間抬、同一個時間落（撲下去時先落地再頂） */
  for (const L of LEGS) footC(L, ctl, L.kind === 'F' && lf > 0.02 ? { planted: false, off: [0, 0.16 * lf * rp, 0.03 * lf] } : {});
  tail(k => Math.sin(st.t * 9 - k * 0.7) * 0.12, kf([[0, 0.1], [1.35, 0.35, 'o'], [3, 0.1, 's']], T), dt); }
/* 11-27 Q1 棕熊（OPT.bearM）。人立拍地（bear_slam／scar_quake，anim 'slam'）：重心移到後腳、前半身立起（約 40°），兩前掌收在胸前 → 頂點停一下 → 整個前半身往前下砸，兩前掌同時拍地（命中 T≈1.9）→ 壓低頓住 → 起身 */
function bslamA(T, dt, du) { const { right } = axes(), B = OPT.bearM === true ? {} : OPT.bearM, up = B.up || 40;      /* 11-27 Q1 審查：下砸要加速（重力，'i' 曲線）、落地壓縮緩衝再回彈；身體以後腳為軸轉（臀部不前後移，後腳不被拖滑） */
  /* 11-27 R1 審查（砸下等速瞬停）：改用實際秒數排（原本用 T 排：預備 0.95 秒、出招 0.22 秒的時間尺度差 4 倍，二次方曲線在 T=1 速度突然變 4 倍，看起來還是 4 格等速砸下）。
     du＝[預備, 出招, 收招] 秒；命中 tI＝預備＋0.82×出招。立起 0→0.42 秒、頂點停住、tI−0.5 秒開始照重力（二次方，等加速度）落下約 15 格（每格位移 1:3:5:…，最後一格約 13%）；
     落地後再往下壓縮 0.1 秒（'o' 減速）→ 0.25 秒回彈 → 收招尾段起身。立起時身體不往上、往後抬（原本 y +0.065、z −0.055：後腳搆不到、被拖 10～20px，砸下時又彈回原位＝後掌滑） */
  const W = du ? du[0] : 0.95, S = du ? du[1] : 0.22, R = du ? du[2] : 0.95, t = T < 1 ? T * W : T < 2 ? W + (T - 1) * S : W + S + (T - 2) * R, tI = W + 0.82 * S, tF = Math.max(0.5, tI - 0.5), tT = Math.min(0.42, tF - 0.06), tE = W + S + R;
  root.position.z = kf([[0, 0], [tT, -0.015, 's'], [tF, -0.02], [tI, 0.03, 'q'], [tI + 0.1, 0.04, 'o'], [tI + 0.35, 0.03, 's'], [tE, 0, 's']], t);
  poseBody({ y: kf([[0, 0], [tT, 0.0, 's'], [tF, 0.0], [tI, -0.07, 'q'], [tI + 0.1, -0.10, 'o'], [tI + 0.35, -0.06, 's'], [tI + 0.6, -0.05, 's'], [tE, 0, 's']], t), pitch: kf([[0, 0], [tT, up, 's'], [tF, up + 2, 's'], [tI, -6, 'q'], [tI + 0.1, -10, 'o'], [tI + 0.35, -4, 's'], [tE, 0, 's']], t),
    chest: kf([[0, 0], [tT, 6, 's'], [tF, 6], [tI, -6, 'q'], [tI + 0.1, -9, 'o'], [tE, 0, 's']], t), neckP: kf([[0, 0], [tT, -up * 0.35, 's'], [tF, -up * 0.4, 's'], [tI, 4, 'q'], [tI + 0.1, -1, 'o'], [tI + 0.35, 2, 's'], [tE, 0, 's']], t),
    jaw: kf([[0, 0], [tT, 10, 's'], [tF, 22, 's'], [tI + 0.05, 30, 'o'], [tI + 0.45, 8, 's'], [tE, 0, 's']], t), ears: kf([[0, 0], [tT, -30, 's'], [tI + 0.6, -30], [tE, 0, 's']], t) });
  const lf = kf([[0, 0], [tT - 0.04, 1, 's'], [tF, 1, 's'], [tI - 0.01, 0, 'q'], [tE, 0]], t);      /* 兩前掌同時抬、同時拍（跟身體一起等加速落下） */
  for (const L of LEGS) footC(L, ctl, L.kind !== 'F' ? (t < tI + 0.05 ? { hold: true } : {}) : lf <= 0.02 ? (t < tI + 0.25 ? { hold: true } : {}) : { planted: false, off: [-Math.sign(L.anchor.x) * 0.03 * lf, (B.lift || 0.42) * lf, (B.back ?? -0.10) * lf], pitch: -0.5 * lf });      /* 11-27 R1：遊戲在出招／收招把熊往前搬約 1.3 公尺（撲砸），砸下後後腳（0.05 秒後）、前掌（0.25 秒後）改成會跨步，跟上身體，不再釘著被拖滑 30px */
  tail(k => Math.sin(st.t * 6 - k * 0.7) * 0.06, 0.2, dt); }
/* 咆哮（scar_roar，anim 'roar'）：前半身微微立起、頭往後仰吸氣、嘴慢慢張 → 前掌重重踩回地面、頭往前下伸、張大嘴吼（頭左右甩）→ 合嘴收回 */
function broarA(T, dt) { const { right } = axes(), sh = Math.sin(st.t * 22) * kf([[0, 0], [1.0, 0], [1.15, 1, 'o'], [2.2, 0.6], [2.7, 0, 's']], T);
  root.position.z = kf([[0, 0], [0.7, -0.03, 's'], [1.2, 0.05, 'q'], [2.2, 0.04, 's'], [3, 0, 's']], T);      /* 11-27 R1：立起時身體少往後（原本 −0.08＋y 0.03：後腳搆不到被拖 5px，前掌落地那格彈回 11px） */      /* 11-27 Q1：前掌踩回地面從蓄力 0.7 就開始往下（出招只有 0.3 秒，原本 1.4 格就砸下來） */
  poseBody({ y: kf([[0, 0], [0.7, 0.0, 's'], [1.2, -0.05, 'q'], [2.3, -0.03, 's'], [3, 0, 's']], T), pitch: kf([[0, 0], [0.7, 18, 's'], [1.06, -4, 's'], [2.3, -2, 's'], [3, 0, 's']], T), chest: kf([[0, 0], [0.7, 4, 's'], [1.2, -5, 'q'], [3, 0, 's']], T),
    neckP: kf([[0, 0], [0.7, 10, 's'], [1.2, -12, 'q'], [2.2, -8, 's'], [3, 0, 's']], T), neckY: 6 * sh, jaw: kf([[0, 0], [0.9, 12, 's'], [1.15, 42, 'o'], [2.2, 38], [2.7, 0, 's']], T), ears: kf([[0, 0], [0.8, -36, 's'], [2.4, -36], [3, 0, 's']], T) });
  if (HEAD.head) rotW(HEAD.head, right, kf([[0, 0], [0.7, 8, 's'], [1.2, -6, 'q'], [2.4, -4, 's'], [3, 0, 's']], T) * D2R);
  const lf = kf([[0, 0], [0.2, 0], [0.62, 1, 's'], [0.72, 1], [1.05, 0, 's'], [3, 0]], T);      /* 前掌踩回地面主要在蓄力尾段做（約 10 格），出招一開始就落地 */
  for (const L of LEGS) footC(L, ctl, L.kind === 'F' && lf > 0.02 ? { planted: false, off: [0, 0.16 * lf, -0.03 * lf] } : { hold: true });      /* 11-27 Q1 審查：咆哮時後腳釘住不碎步 */
  tail(k => Math.sin(st.t * 8 - k * 0.7) * 0.08, 0.2, dt); }
/* 11-27 R1 棕熊威嚇噴氣（OPT.bearM 才會呼叫）：審核「看不到噴氣」——鼻口前噴出幾團淡白色氣團（往前下方散開、變大、0.7 秒內淡掉）。氣團掛在 stage 的上一層（世界座標，不跟著頭轉），不影響骨架、外框量測 */
function bPuff(n, L) { const P = stage.parent; if (!P) return; if (!ctl.pf) ctl.pf = []; const { fwd, up, right } = axes(), h = HREF, j = L ? wp(L.h) : wp(HEAD.jaw);      /* L：跺地那隻前掌（掌邊揚起一圈土色塵） */
  for (let i = 0; i < n; i++) { let m = ctl.pf.find(q => !q.visible); if (!m) { if (ctl.pf.length >= 14) return; m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf0f2f4, transparent: true, opacity: 0, depthWrite: false })); m.renderOrder = 5; m.frustumCulled = false; P.add(m); ctl.pf.push(m); }
    if (L) { const an = (i / n) * 6.283 + 0.4, dx = Math.sin(an), dz = Math.cos(an), pl = j.clone().addScaledVector(right, dx * 0.08 * h).addScaledVector(fwd, dz * 0.08 * h); pl.y = 0.03 * h; const vl = pl.clone().addScaledVector(right, dx * 0.7 * h).addScaledVector(fwd, dz * 0.7 * h).addScaledVector(up, 0.22 * h); stage.updateMatrixWorld(true); const pw = stage.localToWorld(pl.clone()), vw = stage.localToWorld(vl).sub(pw); m.material.color.setHex(0x8a7356); m.visible = true; m.material.opacity = 0; Object.assign(m.userData, { t: 0, p: pw, v: vw, s: stage.getWorldScale(V()).x * h * 0.8, a: 0.45 }); continue; }
    m.material.color.setHex(0xf0f2f4);
    const sd = i % 2 ? 1 : -1, pl = j.clone().addScaledVector(fwd, 0.17 * h).addScaledVector(up, 0.03 * h).addScaledVector(right, sd * 0.035 * h), vl = pl.clone().addScaledVector(fwd, 1.0 * h).addScaledVector(up, -0.32 * h).addScaledVector(right, sd * 0.28 * h);
    stage.updateMatrixWorld(true); const pw = stage.localToWorld(pl.clone()), vw = stage.localToWorld(vl).sub(pw); m.visible = true; m.material.opacity = 0; Object.assign(m.userData, { t: -0.045 * Math.floor(i / 2), p: pw, v: vw, s: stage.getWorldScale(V()).x * h, a: 0.55 }); } }
function bPuffTick(dt) { const P = stage.parent; if (!P || !ctl.pf) return; P.updateMatrixWorld(true); const ps = P.getWorldScale(V()).x || 1;
  for (const m of ctl.pf) { if (!m.visible) continue; const U = m.userData; U.t += dt; if (U.t > 0.7) { m.visible = false; continue; } const u = Math.max(0, U.t) / 0.7; if (U.t > 0) U.p.addScaledVector(U.v, dt * (1 - 0.75 * u));
    m.position.copy(P.worldToLocal(U.p.clone())); m.scale.setScalar((0.045 + 0.16 * Math.sqrt(u)) * U.s / ps); m.material.opacity = U.t <= 0 ? 0 : (U.a || 0.55) * (1 - u) * (1 - u) * Math.min(1, U.t / 0.06); } }
/* 11-27 Q1 棕熊威嚇（OPT.bearM，st 8）：前半身壓低、頭低著左右擺、張嘴噴氣，每 2.4 秒一隻前掌抬起重重跺地（左右輪流），身體跟著頓一下 */
function bwarnA(t, dt) { const k = sm(0, 0.45, t), P = t % 1.4, sd = Math.floor(t / 1.4) % 2 ? 1 : -1, st0 = kf([[0, 0], [0.2, 0], [0.48, 1, 'o'], [0.56, 1], [0.78, 0, 'q'], [1.4, 0]], P)      /* 11-27 R1：跺下改二次方、拉長到 0.22 秒（原本三次方 0.16 秒，最後一格肘腕一格轉 41～58°） */, hit = kf([[0, 0], [0.78, 0], [0.86, 1, 's'], [1.2, 0, 's'], [1.4, 0]], P) * k, br = Math.sin(t * 4.2), sn = kf([[0, 0], [0.95, 0], [1.05, 1, 's'], [1.25, 0, 's'], [1.4, 0]], P) * k;      /* 11-27 Q1 審查：每 1.4 秒左右輪流跺一次（抬得快、落得重）；跺完噴一口氣（頭往上一頓、張嘴、胸口收）；頓一下拉長到約 3 格 */
  root.position.z = -0.08 * k + 0.03 * hit;
  poseBody({ y: -0.11 * k - 0.03 * hit + 0.008 * br * k, pitch: -7 * k + 2.5 * hit, chest: -4 * k + 2 * br * k - 4 * sn, neckP: -16 * k + 6 * hit + 8 * sn, neckY: 24 * Math.sin(t * 2.3) * k, jaw: (18 + 6 * Math.max(0, br)) * k + 10 * hit + 16 * sn, ears: -36 * k });
  { const P0 = ctl.pfP; ctl.pfP = P; if (P0 != null && P0 < 0.95 && P >= 0.95 && k > 0.5) bPuff(4); if (P0 != null && P0 < 0.78 && P >= 0.78 && k > 0.5) { const L = LEGS.find(M => M.kind === 'F' && Math.sign(M.anchor.x) === sd); if (L) bPuff(6, L); } }      /* 跺地落下那一格（P 0.78）掌邊揚塵 */      /* 11-27 R1：噴氣那一下（P 0.95）噴出氣團 */
  for (const L of LEGS) footC(L, ctl, L.kind === 'F' && Math.sign(L.anchor.x) === sd && st0 > 0.02 ? { planted: false, off: [0, 0.24 * st0 * k, 0.06 * st0 * k], pitch: -0.25 * st0 } : { hold: true });
  tail(i => Math.sin(t * 4 - i * 0.7) * 0.12, 0.25, dt); }
/* 11-27 野牛審核（甩角：角插進鬃毛、前腳亂踏）：OPT.hkUp 0.2（頭往上甩少一點）、hkY 0.8（改成多往側邊甩）、hkP 0.5（前半身抬一半）、hkF 0.35（前腳只離地約 4 公分） */
function hookA(T, dt, sd) {      /* 11-27 審核（甩角第 26 格頓一格）：原本頭、脖子、身體的最高點全在 T≈1.7～1.75 同時停住；改成身體、低頭先到（1.6）、側甩後到（1.9），動作有先後、不會整隻同時停一格 */ const { right, fwd } = axes();
  root.position.z = kf([[0, 0], [0.9, -0.06, 's'], [1.75, 0.12, 's'], [2.1, 0.07, 's'], [3, 0, 's']], T);
  poseBody({ y: kf([[0, 0], [0.9, -0.07, 's'], [1.7, 0.02, 's'], [2, 0, 's'], [3, 0, 's']], T), pitch: (OPT.hkP ?? 1) * kf([[0, 0], [0.9, -5, 's'], [1.62, 10, 's'], [2.1, 4, 's'], [3, 0, 's']], T), roll: sd * kf([[0, 0], [0.9, 4, 's'], [1.88, -5, 's'], [2.3, 0, 's']], T),
    chest: kf([[0, 0], [0.9, -3, 's'], [1.62, 7, 's'], [2.4, 0, 's']], T), neckP: kf([[0, 0], [0.9, -16, 's'], [1.58, 22 * (OPT.hkUp ?? 1), 's'], [2, 12 * (OPT.hkUp ?? 1), 's'], [3, 0, 's']], T), neckY: sd * (OPT.hkY ?? 1) * kf([[0, 0], [1, 20, 's'], [1.9, -8 * (OPT.hkR ?? 1), 's'], [2.3, -4 * (OPT.hkR ?? 1), 's'], [3, 0, 's']], T),
    jaw: kf([[0, 0], [0.9, 4, 's'], [1.7, 10, 's'], [2.2, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
  if (HEAD.head) { rotW(HEAD.head, right, kf([[0, 0], [0.9, -10, 's'], [1.58, 14 * (OPT.hkUp ?? 1), 's'], [2.2, 4, 's'], [3, 0, 's']], T) * D2R); rotW(HEAD.head, fwd, sd * (OPT.hkY ?? 1) * kf([[0, 0], [0.9, -16, 's'], [1.92, 10 * (OPT.hkR ?? 1), 's'], [2.4, 0, 's']], T) * D2R); } if (OPT.hkH && HEAD.head) rotW(HEAD.head, right, -OPT.hkH * kf([[0, 0], [1.3, 0], [1.85, 1, 's'], [2.5, 0, 's'], [3, 0]], T) * D2R);      /* 11-27 N1 OPT.hkH（野牛）：甩到最高點前後頭再往下收幾度（鼻尖朝下、角尖朝前），角尖離開背上的鬃毛（審核：29～30 格角尖貼鬃毛） */      /* 11-27 N1 OPT.hkR（野牛）：甩過中線後頭往另一側滾的量（審核：第 29～30 格角尖貼到鬃毛） */      /* 11-26 審查：甩上去從約 2 格拉長到約 4～5 格 */      /* 頭側轉：一支角尖朝前下 → 甩上去時轉回 */
  const lf = kf([[0, 0], [1.0, 0], [1.65, 1, 's'], [2.05, 0, 'i'], [3, 0]], T);
  for (const L of LEGS) footC(L, ctl, L.kind === 'F' && lf > 0.02 ? { planted: false, off: [0, 0.11 * (OPT.hkF ?? 1) * lf, 0.05 * (OPT.hkF ?? 1) * lf] } : {});
  tail(k => Math.sin(st.t * 9 - k * 0.7) * 0.12, kf([[0, 0.1], [1.3, 0.35, 'o'], [3, 0.1, 's']], T), dt); }
/* 撞暈（OPT.daze，野牛撞到岩石／樹）：撞上那一下頭往上彈、身體往後頓 → 四腳往外岔開站穩、頭繞小圈晃、身體慢慢左右晃 → 最後 0.35 秒收回站好 */
function dazeA(t, dt, D) { const { fwd } = axes(), on = sm(0.05, 0.45, t) * (1 - sm(D - 0.4, D, t)), ph = Math.max(0, t - 0.2) * 4.4, imp = kf([[0, 0], [0.07, 1, 'o'], [0.5, 0, 's']], t);
  root.position.z = -0.10 * imp;
  poseBody({ y: -0.045 * on - 0.03 * imp, pitch: 7 * imp + 1.5 * Math.sin(ph * 0.5) * on, roll: 7 * Math.sin(ph * 0.55) * on, yaw: 4 * Math.sin(ph * 0.4 + 1) * on, chest: -2 * on,
    neckP: 16 * imp + (-9 + 8 * Math.cos(ph)) * on, neckY: 19 * Math.sin(ph) * on, jaw: 8 * on + 10 * imp, ears: -24 * on });
  if (HEAD.head) rotW(HEAD.head, fwd, 9 * Math.sin(ph + 0.9) * on * D2R);
  const spr = sm(0.1, 0.45, t) * (1 - sm(D - 0.45, D - 0.1, t));
  for (const L of LEGS) footC(L, ctl, { off: [Math.sign(L.anchor.x) * 0.10 * spr, 0, (L.kind === 'F' ? 0.03 : -0.03) * spr] });      /* 四腳往外岔開 */
  tail(k => Math.sin(st.t * 3 - k * 0.7) * 0.18 * on, 0.25, dt); }
function startBlend(dur) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.bl = 0; ctl.blDur = dur; }
const KP = [0, 0.30, 0.69, 1.2], KS = [0, 0.22, 0.41, 1.05];
/* o：{ st 狀態（0 待機 1 追 2 蓄力 3 出招 4 收招 5 受擊 6 倒地 7 逃 8 警戒）, stT 狀態經過秒數, anim, wind, strike, recover, speed（已換算成本模型的公尺／秒）, dt } */
const _vq = new THREE.Quaternion(), _vf = new THREE.Vector3();
/* 視覺朝向與邏輯朝向分開：遊戲裡怪物常「面向玩家、身體卻橫著繞圈跑」。四足動物橫著跑不了那麼快（腳橫向搆不到），所以繞圈時讓身體轉向跑的方向（最多 75 度）、頭頸看回玩家；一出招就轉回邏輯朝向。判定完全不受影響（只轉外觀）。 */
/* 11-27 B1 OPT.tiltV（水豚）：身體順著坡度的傾斜改用「地形法線（世界座標，跟朝向無關）＋視覺朝向」自己算。遊戲舊模型的 tilt 群組照邏輯朝向算坡度（前後、左右兩個角），
   邏輯朝向一格轉 75～126° 時，那兩個角還是舊方向的值、0.14 秒才追上 → 身體在坡上一格歪向別的方向、四條腿的關節跟著跳（審核：轉身那一格整隻抖一下）。 */
const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _tY = new THREE.Vector3(0, 1, 0);
function tiltV(dt, wy) { const G = GND || (typeof window !== 'undefined' && window.__rigGround); if (!G || !stage.parent) return; const P = stage.parent.getWorldPosition(V()), ws = stage.getWorldScale(V()).x || 1, r = Math.max(0.15, 0.5 * Math.abs(LEGS[0].anchor.z - LEGS[2].anchor.z) * ws);
  const hx = (G(P.x + r, P.z) - G(P.x - r, P.z)) / (2 * r), hz = (G(P.x, P.z + r) - G(P.x, P.z - r)) / (2 * r); const n = V(-hx, 1, -hz).normalize(); if (n.y < Math.cos(0.45)) { const h = Math.hypot(n.x, n.z) || 1, s0 = Math.sin(0.45); n.set(n.x / h * s0, Math.cos(0.45), n.z / h * s0); }
  if (!ctl.tU || !(dt > 0)) ctl.tU = (ctl.tU || n.clone()); else ctl.tU.lerp(n, 1 - Math.exp(-7 * dt)).normalize();
  _tq.setFromUnitVectors(_tY, ctl.tU).multiply(_tq2.setFromAxisAngle(_tY, wy)); stage.parent.getWorldQuaternion(_tq2); stage.quaternion.copy(_tq2.invert().multiply(_tq)); }
function vyaw(o, dt) { const Y = ctl.vy || (ctl.vy = { a: 0, on: false, t: 0, on0: 0, tg: 0 }); let tgt = 0; const chase = (o.st | 0) === 1;
  if (VYAW && INR.ok && chase && stage.parent && dt > 0) { stage.parent.getWorldQuaternion(_vq); _vf.set(0, 0, 1).applyQuaternion(_vq); const fy = Math.atan2(_vf.x, _vf.z), sp = Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1), vt = FIT.trot.v;
    let ang = Math.atan2(INR.vw.x, INR.vw.z) - fy; ang = Math.atan2(Math.sin(ang), Math.cos(ang)); const aa = Math.abs(ang) / D2R, inC = aa > 60 && aa < 150 && sp > VYS * vt, outC = aa < 30 || sp < 0.65 * VYS * vt;
    if (!Y.on) { Y.t = inC ? Y.t + dt : 0; if (Y.t > 0.15) { Y.on = true; Y.t = 0; Y.on0 = st.t; } } else { Y.t = outC ? Y.t + dt : 0; if (Y.t > 0.25 && st.t - Y.on0 > 0.5) { Y.on = false; Y.t = 0; } }      /* 進：持續 0.15 秒；出：持續 0.25 秒且至少轉過去 0.5 秒（不會來回甩） */
    if (Y.on) tgt = aa > 150 ? Math.sign(Y.tg || ang) * 85 * D2R : clamp(ang, -85 * D2R, 85 * D2R); }
  else { Y.on = false; Y.t = 0; }
  if (VYSM && chase) { Y.tg += (tgt - Y.tg) * (1 - Math.exp(-dt / 0.2)); tgt = Y.tg; } else Y.tg = tgt;      /* 移動方向穩定約 0.2 秒才轉過去 */
  const rate = (chase ? VYR : 260) * D2R * dt; Y.a += clamp(tgt - Y.a, -rate, rate); stage.rotation.y = Y.a;
  if (OPT.vyMax && stage.parent) { stage.parent.getWorldQuaternion(_vq); _vf.set(0, 0, 1).applyQuaternion(_vq); const py = Math.atan2(_vf.x, _vf.z), tg = py + Y.a, s0 = o.st | 0;      /* OPT.vyMax（野鹿）：身體的視覺轉向每秒最多轉幾度（遊戲邏輯一格就轉 180°，畫面上腳要踏步換位才轉得過去）；受驚的前 0.16 秒身體先僵住不轉 */
    if (ctl.vyW == null || s0 === 6) ctl.vyW = ctl.vyT = tg; else if (dt > 0) { let e = tg - ctl.vyT; e -= Math.round(e / (2 * Math.PI)) * 2 * Math.PI; const cuB = OPT.cuT && s0 === 7 && (ctl.cuL || 0) > 0.1 ? (OPT.cuT.vy || 1) : 1; ctl.vyT += (s0 <= 1 || s0 === 7 ? clamp((1 - Math.exp(-dt / (0.25 / cuB))) * e, -OPT.vyMax * 1.2 * cuB * D2R * dt, OPT.vyMax * 1.2 * cuB * D2R * dt) : e); let d = ctl.vyT - ctl.vyW;      /* 11-27 A2 OPT.cuT.vy：逃跑轉身（外觀還落後遊戲位置）時轉速倍率 */      /* 遊戲偶爾送 dt＝0 的格（原本會一格轉到底）；逃跑路線左右擺時先平滑 0.12 秒 */ d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; const fz = OPT.startle && s0 === 7 && ((ctl.pst != null && ctl.pst !== 7 && (ctl.pst === 0 || ctl.pst === 1 || ctl.pst === 8)) || (ctl.stl != null && ctl.stl < 0.15)), fr = fz ? 0 : (OPT.anat ? 0.35 + 0.65 * LEGS.filter(L => L.c && !L.c.air).length / 4 : 1) * (s0 >= 2 && s0 <= 5 ? (OPT.vyAtk ?? 2) : 1) * OPT.vyMax * D2R * dt * (OPT.startle && s0 === 7 && ctl.stl != null ? 0.45 + 0.55 * sm(0.15, 0.32, ctl.stl) : 1) * cuB * (OPT.cuT && OPT.cuT.lw && s0 === 7 && ctl.cuW && LEGS.some(L => L.c && !L.c.air && Math.abs(L.c.lxo || 0) > OPT.cuT.lw) ? (OPT.cuT.lk ?? 0.3) : 1);      /* 11-27 A3 OPT.cuT.lw／lk（岩羊）：逃跑起跑窗口內，踩著的腳被轉身甩到站位外側超過 lw 公尺，轉速乘 lk（等腳踏過去再轉；原本後腳被甩到橫向 0.96 公尺＝外劈）。OPT.cuT.lx：橫向超過 lx 公尺的腳不受同對限制、照樣抬 */      /* 受驚轉身：轉速從 1/4 慢慢加到上限（腳先踏出去再轉快，前腳不會被一下子扭到外側） */ { let stp = clamp(d, -(OPT.prU && ctl.prUb != null && st.t - ctl.prUb < 0.06 ? 0.15 : 1) * fr, (OPT.prU && ctl.prUb != null && st.t - ctl.prUb < 0.06 ? 0.15 : 1) * fr); if (OPT.crocM && OPT.crocM.vyA) { const A = OPT.crocM.vyA * D2R, v0 = ctl.vyV || 0, wd = Math.sign(stp) * Math.min(Math.abs(stp) / dt, Math.sqrt(2 * A * Math.abs(d))), v1 = v0 + clamp(wd - v0, -A * dt, A * dt); stp = v1 * dt; ctl.vyV = v1; } ctl.vyW += stp; } }      /* 11-27 C1 OPT.crocM.vyA（鱷魚，度/秒²）：身體轉向的角加速度上限——轉身慢慢起轉、快到時慢慢停（原本一開始就用最高轉速、到了一格停住，看起來像急轉） */      /* 11-27 B1 OPT.prU：有腳搆不到、又在等同對另一隻落地時，身體先幾乎停轉（不把踩著的腳拖著走） */
    let a = ctl.vyW - py; a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI; stage.rotation.y = a; if (OPT.tiltV) tiltV(dt, ctl.vyW); } { const h = clamp(-Y.a, -HKM * D2R, HKM * D2R), hr = 160 * D2R * dt; INR.hk = (INR.hk || 0) + clamp(h - (INR.hk || 0), -hr, hr); } }      /* 頭頸轉回看玩家：上限 30 度、每秒最多 160 度（不跟著身體一格跳） */
function update(o) { const dt = Math.min(0.05, Math.max(0, o.dt || 0)); st.t += dt; if (OPT.cuR && o.cuR) cuR(o.cuR, dt); if (OPT.cuS) { if (OPT.cuT) { ctl.cuFT = (o.st | 0) === 7 ? (ctl.cuSt === 7 ? (ctl.cuFT || 0) + dt : 0) : null; ctl.cuSt = o.st | 0; ctl.cuW = ctl.cuFT != null && (ctl.cuFT < 0.6 || (ctl.cuL || 0) > 0.1); } cuS(dt); } else if (OPT.cuV) cuV(dt, !!o.hs);      /* 11-27 N1 OPT.cuV（野牛）：命中停頓時外觀位置照停頓前的速度繼續走（見 cuV） */      /* 11-27 A3：原本叫 ctl.flT，跟 fLift()（OPT.anat.eF）每格寫入的 ctl.flT＝st.t 撞名，flT 永遠 ≥0.6、起跑窗口 cuW 只剩外觀落後 >0.1 公尺時才開，被打切逃跑那一格 cuW=0，同對限制、先踩下都沒生效（四腳同格起步的主因之一）；改名 cuFT */      /* OPT.cuT：逃跑開始後的時間 flT；cuW＝起跑／轉身窗口（0.6 秒內或外觀還落後） */ vyaw(o, dt); syncStage(); tgSync(); SOFT = true; if (OPT.porcM) puff(1);
  let mode; const atk = o.st >= 2 && o.st <= 4;
  if (o.st === 6) mode = 'dead'; else if (o.st === 5) mode = 'stag'; else if (atk && OPT.idleA && o.anim === OPT.idleA) mode = 'idle'; else if (atk && OPT.apeM && /^(beat|slam|grab|rock|swipe)$/.test(o.anim || '')) { mode = 'ape'; ctl.apeK = o.anim === 'grab' && o.shape === 'circle' ? 'lift' : o.anim; }      /* OPT.apeM（猩猩）：捶胸、雙拳砸地、抓、舉起、拔石丟、拍擊 */ else if (atk && OPT.crocM && o.anim === 'bite' && o.shape === 'circle') { ctl.still = (o.speed || 0) < 0.08 ? ctl.still + dt : 0; mode = ctl.still > 0 ? 'idle' : 'loco'; }      /* OPT.crocM（鱷魚）：croc_st 是「狀態招式」（潛伏、滑入水、咬住拖行，收招 3600 秒），照移動速度走跑／待機，不是出招 */ else if (atk && OPT.crocM && o.anim === 'roll') mode = 'croll'; else if (atk && OPT.crocM && o.anim === 'lunge') mode = 'dash'; else if (atk) mode = (OPT.bearM && o.anim === 'slam') ? 'bslam' : (OPT.bearM && o.anim === 'roar') ? 'broar' : (OPT.porcM && o.anim === 'quill') ? 'quill' : (OPT.porcM && o.anim === 'burst') ? 'burst' : (OPT.porcM && o.anim === 'back') ? 'pback' : (OPT.monk && o.anim === 'steal') ? 'steal' : (OPT.monk && o.anim === 'tug') ? 'tug' : (OPT.monk && o.anim === 'sit') ? 'sit' : (OPT.butt && o.anim === 'butt') ? 'butt' : (OPT.hook && o.anim === 'toss') ? 'hook' : (OPT.daze && o.anim === 'daze') ? 'daze' : /kick/.test(o.anim || '') ? 'kick' : (OPT.tusk && /spin/.test(o.anim || '')) ? 'tusk' : /swipe|slam|spin/.test(o.anim || '') ? 'swipe' : (o.anim === 'bite' && o.shape === 'cone') ? 'snap' : (OPT.chg && (o.anim === 'charge' || (OPT.chgA && o.anim === OPT.chgA))) ? 'ram' : ((o.anim === 'bite' && o.shape === 'line') || o.anim === 'charge') ? 'dash' : 'pounce'; else if (o.st === 8) mode = 'warn';
  else { ctl.still = o.speed < 0.08 ? ctl.still + dt : 0; mode = ctl.still > 0 ? 'idle' : 'loco'; }
  ctl.fc = (ctl.fc || 0) + 1; stage.updateWorldMatrix(true, false); if (!ctl.pm) ctl.pm = stage.matrixWorld.clone(); inertia(dt, mode === 'dead' ? 0 : (OPT.rbStart && mode === 'ram') ? 0.12 : (mode === 'pounce' || mode === 'swipe' || mode === 'dash' || mode === 'kick' || mode === 'tusk' || mode === 'ram' || mode === 'hook' || mode === 'daze' || mode === 'butt' || mode === 'quill' || mode === 'burst' || mode === 'pback' || mode === 'steal' || mode === 'tug' || mode === 'sit' || mode === 'bslam' || mode === 'broar') ? 0.4 : 1); if (INR.tele) { INR.tele = false; ctReset(); }      /* 被瞬間搬走（重生、傳送）：四隻腳重新站好 */
  if (mode !== 'dead') ctl.spd = o.speed || 0;      /* 倒地時沿用死前的移動速度 */
  if (mode !== ctl.mode) { for (let i = 0; i < bones.length; i++) { ctl.fromQ[i].copy(ctl.lastQ[i]); ctl.fromP[i].copy(ctl.lastP[i]); } ctl.fromR.copy(ctl.lastR); ctl.fromRq.copy(ctl.lastRq); ctl.deadFresh = mode === 'dead'; if (OPT.stagX && OPT.stagBk && ctl.mode === 'stag' && mode !== 'dead' && (o.st | 0) === 7 && ctl.cu && ctl.cu.W && stage.parent) { stage.updateMatrixWorld(true); const w0 = stage.localToWorld(V(0, 0, 0)), dW = stage.localToWorld(V(ctl.lastR.x, 0, ctl.lastR.z)).sub(w0); dW.y = 0; ctl.cu.W.add(dW); stage.position.copy(stage.parent.worldToLocal(ctl.cu.W.clone())); stage.updateMatrixWorld(true); if (INR.s && INR.s.p) INR.s.p.add(dW); ctl.fromR.x -= ctl.lastR.x; ctl.fromR.z -= ctl.lastR.z; { const P0 = stage.parent.localToWorld(V(0, 0, 0)); ctl.cuL = Math.hypot(ctl.cu.W.x - P0.x, ctl.cu.W.z - P0.z); } }      /* 11-27 A3 OPT.stagX（岩羊）：被打往後退（stagBk）是把身體在 stage 裡往後推 0.42 公尺、站位跟著往後；一切到逃跑，身體位移和站位一格歸零＝四隻腳同一格全部「落後站位 0.3～0.6 公尺」，站定的急步、走跑的「被拖太遠」都判成要抬（對角／同對限制對落後的腳不管用）＝四腳同格起步原地跳一下。改成切換那一格把這段後退量交給外觀位置（stage 往後移、身體在 stage 裡歸零，畫面上身體和腳都不動），之後由 cuT 的追趕規則慢慢追回遊戲位置 */ ctl.bl = ctl.mode ? 0 : 1; ctl.blDur = ctl.fl >= 0 ? 0.25 : (OPT.apeV2 && ctl.mode === 'ape' ? 0.4 : OPT.anat && ctl.mode === 'stag' ? 0.45 : 0.16);      /* 11-27 G1 OPT.apeV2：猩猩收招接回待機／走跑混合 0.4 秒（收招最後的姿勢身體低 5 公分，0.16 秒內彈回） */ if (OPT.crocM && OPT.crocM.rBl && ctl.mode === 'croll') ctl.blDur = OPT.crocM.rBl;      /* 11-27 C1 OPT.crocM.rBl（鱷魚）：翻滾完接走跑，收著的腳慢慢放下來站好 */      /* 踉蹌接回走跑：解剖物種混合拉長（審核：回正最後幾格突然加速） */ ctl.fl = -1; ctl.dph = null; if (ctl.mode === 'dead' || ctl.mode === 'croll') ctReset(); if (mode === 'loco') { if (OPT.ramV2 && ctl.mode === 'ram') ctl.vg = ctl.rv; else ctl.locoFresh = true; } if (OPT.cuT && mode === 'loco' && ctl.mode === 'stag') for (const L of LEGS) { const c = L.c; if (c.h < 0.07 || (c.air && (c.su || 0) > 0.85)) { c.air = false; c.key = c.stp = false; c.h = 0; } }      /* 11-27 A2 OPT.cuT：被打接逃跑，被打段還在跨步（快著地）的腳先踩下，讓起步相位照常挑（原本三隻帶著跨步旗標同一格重新起步＋第四隻＝四腳同時跳起） */      /* ramV2：收招接走跑時步伐接著走（不重挑起步相位、四腳不一格換位），速度從收招的速度接上 */
    if (mode === 'pounce') modes.Dpounce.fresh = true; if (mode === 'swipe') modes.Dswipe.fresh = true; ctl.mode = mode; }
  root.quaternion.identity(); root.position.x = 0; root.position.z = 0;
  if (mode !== 'loco' && !(OPT.ramV2 && mode === 'ram')) ctl.vg = null;
  if (OPT.startle) { if (o.st === 7 && ctl.pst != null && (ctl.pst === 0 || ctl.pst === 1 || ctl.pst === 8)) { ctl.stl = 0; ctl.stY = INR.yaw; } else if (ctl.stl != null) ctl.stl += dt; if (o.st !== 7) ctl.stl = null; ctl.pst = o.st; }
  if (mode === 'loco') { SCAP = 0.06; const v1 = OPT.cuT && o.st === 7 && ctl.cuV != null ? Math.min(o.speed || 0, ctl.cuV) + Math.max(0, (ctl.cuV || 0) - (o.speed || 0)) : o.speed || 0;      /* 11-27 A2 OPT.cuT：轉身落後／追趕時步態照外觀實際速度（原地轉身時踏小步，追趕時步子跟上，不讓腳被拖在後面） */ ctl.vg = ctl.vg == null ? v1 : ctl.vg + clamp(v1 - ctl.vg, -14 * dt, 14 * dt); loco(ctl.vg, dt);
    if (OPT.startle && ctl.stl != null && ctl.stl < 0.8) { const t = ctl.stl, a = kf([[0, 0], [0.12, 1, 'o'], [0.38, 1], [0.78, 0, 's']], t), hold = 1 - sm(0.28, 0.48, t), { right, up, fwd } = axes(); let dy = ctl.stY - INR.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;      /* OPT.startle（野鹿）：受驚那一下猛抬頭、耳朵豎起、尾巴翹起；頭先僵住盯著原本的方向（身體已經在轉），0.3 秒後才甩過來跟著跑 */
      rotW(HEAD.neck, up, clamp(dy, -75 * D2R, 75 * D2R) * hold * 0.6); if (HEAD.neck2 && HEAD.neck2 !== HEAD.neck) rotW(HEAD.neck2, up, clamp(dy, -75 * D2R, 75 * D2R) * hold * 0.4);
      rotW(HEAD.neck, right, (OPT.stlN ?? 19) * a * D2R); rotW(HEAD.head, right, (OPT.stlN ?? 19) / 19 * 8 * a * D2R);      /* OPT.stlN（野鹿 8）：受驚抬頭量（審核：鼻尖朝天） */ if (HEAD.earL) { rotW(HEAD.earL, fwd, 36 * a * D2R); rotW(HEAD.earR, fwd, -36 * a * D2R); } if (TAIL[0]) rotW(TAIL[0], right, -45 * a * D2R); } }
  else if (mode === 'idle') { SCAP = 0; const HW = OPT.howl ? 3.8 : 0;
    if (HW && ctl.fl < 0) { ctl.flWait -= dt; if (o.howl || ctl.flWait <= 0) { ctl.fl = 0; startBlend(0.3); } }
    if (HW && ctl.fl >= 0) { ctl.fl += dt; if (ctl.fl >= HW) { ctl.fl = -1; ctl.flWait = 22 + 25 * Math.random(); startBlend(0.3); modes.Cidle.step(dt); } else howl(ctl.fl, dt); }
    else modes.Cidle.step(dt); }
  else if (mode === 'dash') { const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.34, o.recover || 0.75][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 撲咬（衝刺咬）：後坐蓄力 → 貼地全速衝出去、脖子伸直、張嘴，衝到底咬合 → 煞住、甩頭。和飛撲不同：四腳不離地騰空 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'dash') startBlend(OPT.crocM && OPT.crocM.dBl || 0.13); ctl.dph = i; if (i === 1) ctl.locoFresh = true; }      /* 衝出去的第一步：步態從「兩隻後腳正踩著」的相位開始（由走跑的起步規則挑） */
    if (i === 1) { SCAP = 0.06; const y0 = INR.y, p0 = INR.pitch; INR.y += (OPT.crocM && OPT.crocM.dsY != null ? OPT.crocM.dsY : -0.075); INR.pitch += (OPT.crocM && OPT.crocM.dsP != null ? OPT.crocM.dsP : -5);      /* 11-27 C1 OPT.crocM.dsY／dsP（鱷魚）：衝出去時身體下沉、前傾的量（前傾 5° 讓長身體的尾巴根翹起、尾巴拱成橋） */ loco(OPT.crocM ? FIT.trot.v : Math.max(o.speed || 0, FIT.gallop.v * 0.85), dt); INR.y = y0; INR.pitch = p0;      /* 鱷魚衝咬：用快步的步伐（全速奔跑的步頻在 30fps 下四腳一起騰空、關節一格折 50°以上） */
      rotW(HEAD.neck, right, 9 * D2R); if (HEAD.jaw) rotW(HEAD.jaw, right, -kf([[0, 14], [0.25, 36, 'o'], [0.7, 36], [0.9, 0, 'i'], [1, 0]], u) * D2R); }
    else { SCAP = 0.045; resetPose(); const T = i === 0 ? u : 2 + u;
      root.position.z = kf([[0, 0], [1, -0.16, 's'], [2, 0.10], [2.3, 0.14, 'o'], [3, 0, 's']], T) * (OPT.crocM && OPT.crocM.dZ != null ? OPT.crocM.dZ : 1);
      poseBody({ y: OPT.crocM ? kf([[0, 0], [1, -0.05, 's'], [2, -0.05], [3, -0.02, 's']], T) : kf([[0, 0], [1, -0.12, 's'], [2, -0.10], [2.55, 0, 's']], T), pitch: OPT.crocM ? kf([[0, 0], [1, 3, 's'], [2, -2], [2.3, -3, 'o'], [3, 0, 's']], T) : kf([[0, 0], [1, 7, 's'], [2, -7], [2.3, -9, 'o'], [3, 0, 's']], T), chest: kf([[0, 0], [1, 5, 's'], [2, -4], [3, 0, 's']], T) * (OPT.crocM && OPT.crocM.dCh != null ? OPT.crocM.dCh : 1),
        neckP: kf([[0, 0], [1, -14, 's'], [2, 12], [2.5, 6, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [2, 0], [2.25, -15, 'o'], [2.6, 10, 's'], [3, 0, 's']], T),
        jaw: kf([[0, 0], [0.6, 6, 's'], [1, 14, 's'], [2, 0], [2.3, 5, 's'], [3, 0, 's']], T), ears: kf([[0, 0], [0.7, -30, 's'], [2.5, -30], [3, 0, 's']], T) });
      plantAll(); tail(k => Math.sin(st.t * 8 - k * 0.7) * (OPT.crocM ? 0.05 : 0.10), OPT.crocM ? kf([[0, 0.0], [1, -0.02, 's'], [2, -0.02], [3, 0.0, 's']], T) : kf([[0, 0.1], [1, 0.32, 's'], [2, -0.1], [3, 0.1, 's']], T), dt); } }      /* 11-27 Q2 鱷魚（OPT.crocM）：身體長、腳短——收招不抬屁股（俯仰 ±3°）、身體不升回站高；尾巴不往下壓（壓到地會讓尾尖往上捲）也不往上翹（收招變直棍浮空） */
  else if (mode === 'ram') { const i = o.st - 2, dur = [o.wind || 0.78, o.strike || 0.6, o.recover || 1.05][i], u = clamp((o.stT || 0) / dur, 0, 1), { right } = axes();
    /* 野豬衝撞：低頭、一隻前蹄往後刨地三下（每刨一下身體跟著往後頓）→ 頭壓低、獠牙朝前，用正常奔跑步伐全速衝 → 跑著慢下來、甩頭噴氣 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'ram') startBlend(OPT.ramV2 ? (i === 1 ? 0.2 : 0.25) : (i === 1 ? 0.12 : 0.2)); ctl.dph = i; if (OPT.ramV2 ? i === 1 : i >= 1) ctl.locoFresh = true; if (i === 1) ctl.rv = null; }      /* OPT.ramV2（野鹿、野牛；野豬不開，維持已驗收的行為）：蓄力接衝刺的過渡 0.12→0.2 秒；衝刺接收招不再重挑起步相位（重挑會讓四腳一格跳到新位置），步伐接著跑 */
    if (i === 0 && OPT.noPaw) { SCAP = 0.045; resetPose(); const w = sm(0, 0.8, u), sh = Math.sin(u * Math.PI * 4) * sm(0.15, 0.35, u) * (1 - sm(0.7, 0.95, u)), { up, fwd } = axes();      /* OPT.noPaw（野鹿）：不刨地。重心往後坐、低頭把角對準前方，角左右晃兩下示威，然後衝 */
      const w2 = OPT.chRock ? sm(0, 1, u) : 0, rk = OPT.chRock ? Math.sin(u * Math.PI * 3) * sm(0.1, 0.35, u) * (1 - sm(0.85, 1, u)) : 0;      /* 11-27 Q1 OPT.chRock（棕熊）：衝之前越蹲越低、身體前後晃著蓄力（原本 0.8 之後完全靜止、下一格突然起跑） */
      root.position.z = -0.07 * w - 0.05 * w2 + (OPT.chRock || 0) * 0.03 * rk; poseBody({ y: -0.035 * w - 0.05 * w2 + 0.01 * rk, pitch: -3 * w - 2 * w2, chest: -3 * w, ears: -34 * w });
      rotW(HEAD.neck, right, -(OPT.chN != null ? OPT.chN : CHN) * w * D2R); rotW(HEAD.head, right, -(OPT.chH != null ? OPT.chH : CHH) * w * D2R); rotW(HEAD.neck, up, 9 * sh * D2R); rotW(HEAD.head, fwd, 7 * sh * D2R);
      plantAll(); tail(k => Math.sin(st.t * 6 - k * 0.7) * 0.10, 0.25, dt); ctl.ryW = root.position.y; ctl.ryLp = null; }
    else if (i === 0) { SCAP = 0.045; resetPose(); const ph = (u * 3) % 1, dr = ph < 0.55, w = sm(0, 0.15, u) * (1 - sm(0.9, 1, u)) * (OPT.rgT ? 1 - (ctl.rmT = (ctl.rmT || 0) + ((Math.abs(INR.wy || 0) > 0.9 ? 1 : 0) - (ctl.rmT || 0)) * (1 - Math.exp(-(INR.dt || 0.0167) / 0.1))) : 1), dk = dr ? Math.sin(Math.PI * ph / 0.55) : 0;
      const oz = dr ? 0.10 - 0.26 * ph / 0.55 : -0.16 + 0.26 * sm(0, 1, (ph - 0.55) / 0.45), oy = dr ? 0.012 : 0.012 + 0.11 * Math.sin(Math.PI * (ph - 0.55) / 0.45);      /* 貼地往後刨、抬起來往前收 */
      root.position.z = -0.03 * w - 0.025 * dk * w;
      poseBody({ y: -0.03 * w, pitch: -5 * (OPT.rmHold ? sm(0, 0.15, u) : w), chest: -2 * w, neckP: -8 * (OPT.rmHold ? sm(0, 0.15, u) : w) - 4 * dk * w, ears: -30 * w });      /* OPT.rmHold（野牛）：蓄力尾段頭和前傾不先收回（原本收回＝衝之前頭先抬一下），衝刺段接著壓低 */
      const hw = sm(0, 0.15, u); rotW(HEAD.neck, right, -(OPT.chN != null ? OPT.chN : CHN) * hw * D2R); rotW(HEAD.head, right, -(OPT.chH != null ? OPT.chH : CHH) * hw * D2R);      /* 頭一路壓低接到衝刺，中間不抬 */      /* right 軸正角＝抬頭，所以壓低用負角 */
      for (const L of LEGS) footC(L, ctl, L.id === 'RF' && w > 0.05 && u < 0.9 ? { planted: false, off: [0, oy * w * (OPT.scrK || 1), oz * w * (OPT.scrK || 1)] } : {});
      tail(k => Math.sin(st.t * 6 - k * 0.7) * 0.10, 0.25, dt); ctl.ryW = root.position.y; ctl.ryLp = null; }
    else if (rmStill(i)) { SCAP = 0.045; resetPose(); const hk = 1 - sm(0, OPT.rmHk || 0.85, u); if (OPT.rmHold) rotW(HEAD.neck, right, -(OPT.rmHold === true ? 8 : OPT.rmHold) * hk * D2R); rotW(HEAD.neck, right, -(OPT.chN != null ? OPT.chN : CHN) * hk * D2R); rotW(HEAD.head, right, -(OPT.chH != null ? OPT.chH : CHH) * hk * D2R);
      if (OPT.noPaw) { const hp0 = 1 - sm(0.1, 0.75, u), hp = OPT.flkS ? (ctl.fkH = (ctl.fkH || 0) + clamp(hp0 - (ctl.fkH || 0), -(INR.dt || 0.0167) / 0.35, (INR.dt || 0.0167) / 0.2)) : hp0; rotW(HEAD.neck, right, 16 * hp * (OPT.flkA || 1) * D2R); rotW(HEAD.head, right, 10 * hp * (OPT.flkA || 1) * D2R); }
      plantAll(); tail(k => Math.sin(st.t * 6 - k * 0.7) * 0.10, 0.25, dt); ctl.ryW = root.position.y; ctl.ryLp = null; }      /* 11-27 A1 OPT.rmStop：收招時身體停住了就改用站定的跨步規則（抬著的腳直接跨回站位、站著的腳不動），不再用速度接近 0 的步態原地慢慢擺（腳抬很低、拖 0.5 秒＝刮地碎步） */
    else { SCAP = 0.06; const vT = i === 1 ? Math.max(o.speed || 0, FIT.gallop.v * 0.9) : (o.speed || 0), v = ctl.rv = rmCap(i, vT, !OPT.ramV2 || ctl.rv == null ? vT : (OPT.rbStart && i === 1 ? Math.min(Math.max(vT, ctl.rv - FIT.gallop.v / 0.7 * dt), ctl.rv + FIT.gallop.v / 0.6 * dt) : Math.max(vT, ctl.rv - FIT.gallop.v / 0.7 * dt))      /* OPT.rbStart：命中停頓結束時遊戲速度一格暴增（補回停頓的距離），步態速度最多 0.6 秒加一個奔跑速度，不一格蹦起 */), p0 = INR.pitch;      /* OPT.ramV2：收招時遊戲速度一格掉到 0，步態會一格從奔跑換成走（身體高度、腳位一格跳）；改成 0.45 秒內慢慢降下來 */ if (i === 1) { INR.pitch += -4; if (OPT.noPaw) INR.pitch = Math.min(INR.pitch, 1); ctl.vG = v; ctl.bobK = 0.3 + 0.7 * sm(0, 0.45, o.stT || 0); } else if (i === 2) ctl.bobK = 0.35 + 0.65 * sm(0.1, 0.5, o.stT || 0);      /* 收招開始也一樣：遊戲速度突然掉，步態起伏先壓小（不會一格騰空跳起） */      /* ctl.bobK：OPT.rbStart 用 */      /* 野鹿：起衝時不讓起跑慣性把頭和前半身往上掀（看起來像衝之前先抬頭），角一直對準前方 */ const yo = OPT.ramV2 && i === 1 && ctl.ryW != null && ctl.ryLp != null ? (ctl.ryW - ctl.ryLp) * (1 - sm(0, 0.35, o.stT || 0)) : 0; INR.y += yo; const RG = OPT.rmG, rg0 = RG ? [OPT.cadMax, OPT.sxMax, OPT.gK, OPT.stB, OPT.gY, OPT.swF, OPT.ldF, OPT.swQ] : null; if (RG) { OPT.cadMax = RG.cad ?? OPT.cadMax; OPT.sxMax = RG.sx ?? OPT.sxMax; OPT.gK = Object.assign({}, OPT.gK, { liftF: ((OPT.gK && OPT.gK.liftF) || 1) * (RG.lf ?? 1), liftH: ((OPT.gK && OPT.gK.liftH) || 1) * (RG.lh ?? 1) }); OPT.stB = RG.sb ?? OPT.stB; OPT.gY = RG.gy ?? OPT.gY; OPT.swF = RG.sf ?? OPT.swF; OPT.ldF = RG.ld ?? OPT.ldF; OPT.swQ = RG.sq ?? OPT.swQ; } loco(v, dt); if (RG) [OPT.cadMax, OPT.sxMax, OPT.gK, OPT.stB, OPT.gY, OPT.swF, OPT.ldF, OPT.swQ] = rg0;      /* rmG.ld：衝撞時前蹄落點（覆蓋 ldF）；rmG.sq：衝撞時擺盪用 swQ（smootherstep＋提早放低） */ INR.y -= yo;      /* 11-27 N1 OPT.rmG {cad, sx, lf, lh, sb, gy, sf}（野牛）：衝撞（頂撞）時的奔跑另用一組參數——步頻上限 cad、步幅上限 sx、前／後腳抬腳高度倍率 lf／lh、前腳撐地頂高 sb、身體抬高 gy、前腳擺盪收腿倍率 sf。衝撞速度是一般奔跑的 2.4 倍，步頻 2.5 倍時一步只有 6 格：撐地 2 格（肘一格折 58°）、擺盪 4 格（前腳一格甩 70～85°）；一般奔跑不受影響 */ if (i === 1) ctl.ryLp = root.position.y - yo; INR.pitch = p0;      /* OPT.ramV2：衝出去的前 0.35 秒身體高度從蓄力時的高度慢慢接到奔跑的起伏（原本一格就沉下去／彈起來） */      /* 衝出去時腳步直接跟上身體的速度（不照平常的加速上限慢慢加，否則腳跟不上身體、被拖到後面再大步往前抓，像要跌倒） */
      const hk = i === 1 ? 1 : 1 - sm(0, OPT.rmHk || (OPT.ramV2 ? 0.85 : 0.5), u);      /* 11-27 D1 OPT.rmHk（野鹿）：收招抬頭用滿整段（審核：32→33 頭一格抬起） */ if (OPT.rmHold) rotW(HEAD.neck, right, -(OPT.rmHold === true ? 8 : OPT.rmHold) * hk * D2R);      /* OPT.rmHold 給數字＝衝刺時頭再多壓幾度（岩羊：奔跑步態會把頭抬回來，接不上蓄力時的低頭） */ rotW(HEAD.neck, right, -(OPT.chN != null ? OPT.chN : CHN) * hk * D2R); rotW(HEAD.head, right, -(OPT.chH != null ? OPT.chH : CHH) * hk * D2R);      /* 衝的時候頭一直壓低 */
      if (OPT.noPaw) { const hp0 = i === 1 ? sm(OPT.flk != null ? OPT.flk : 0.3, 0.95, u) : 1 - sm(0.1, 0.75, u), hp = OPT.flkS ? (ctl.fkH = (i === 1 && (o.stT || 0) < 0.04) ? 0 : (ctl.fkH || 0) + clamp(hp0 - (ctl.fkH || 0), -dt / 0.35, dt / 0.2)) : hp0;      /* OPT.flkS（岩羊）：頂的動作照時間走（往上至少 0.2 秒、放下至少 0.35 秒），命中停頓後遊戲時間追趕時不會兩格就甩上去 */      /* OPT.flk（岩羊）：衝刺進度到多少才開始用角往上頂（之前一路低頭） */ rotW(HEAD.neck, right, 16 * hp * (OPT.flkA || 1) * D2R); rotW(HEAD.head, right, 10 * hp * (OPT.flkA || 1) * D2R); }      /* OPT.flkA：頂的幅度倍率 */      /* 野鹿：衝到底時角往上一挑（頂），收招時放下來 */
      if (i === 2 && !OPT.noPaw) { const sn = sm(0.35, 0.55, u) * (1 - sm(0.8, 1, u)); rotW(HEAD.neck, right, 14 * sn * D2R); rotW(HEAD.neck, axes().up, 14 * sn * Math.sin((u - 0.35) * 40) * D2R); } } }      /* 收招：抬頭甩兩下噴氣 */
  else if (mode === 'quill') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 2.2, o.recover || 0.8][i], T = i + clamp((o.stT || 0) / dur, 0, 1), { right, up } = axes();
    /* 箭豬豎刺（OPT.porcM）：蹲低、縮頭、背拱起、整身微微膨脹（刺張開）→ 撐著時全身細細發抖、尾巴左右快甩 → 收回 */
    const k = kf([[0, 0], [1, 1, 's'], [2, 1], [2.75, 0, 's'], [3, 0]], T), sv = sm(0.75, 1.0, T) * (1 - sm(1.9, 2.3, T)) * k, tr = 0.6 * Math.sin(st.t * 26) * sv;      /* 11-27 Q1 審查：顫抖改成約 4Hz 小幅平滑正弦（原本 47 rad/s 在 30fps 下每格跳一次像閃爍），前後淡入淡出不一格停 */
    puff(1 + 0.2 * k + 0.01 * tr);      /* 11-27 Q1 審查：刺要整個豎起來（膨脹 1.1→1.2） */
    poseBody({ y: -0.09 * k, pitch: -3 * k + 0.6 * tr, roll: 0.8 * tr, chest: -12 * k, neckP: -15 * k, ears: -30 * k });
    if (HEAD.spine) rotW(HEAD.spine, right, 13 * k * D2R); if (HEAD.head) rotW(HEAD.head, right, -5 * k * D2R);      /* 頭只微收，不埋進胸口 */      /* 背中段往上拱、頭往胸口收 */
    plantAll(OPT.qHold ? { hold: true } : {}); tail(j => Math.sin(st.t * 13 - j * 0.6) * 0.55 * k, -0.35 * k, dt); }      /* 11-27 Q1 OPT.qHold（箭豬）：豎刺時身體膨脹，腳不重新踏步（原本後腳會挪、小跳） */
  else if (mode === 'burst') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.9, o.strike || 0.25, o.recover || 0.9][i], T = OPT.porcM.hs ? hsT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt) : i + clamp((o.stT || 0) / dur, 0, 1), { right } = axes();      /* 11-27 P1 OPT.porcM.hs：噴刺環打中人時遊戲命中停頓（整個遊戲 dt 變 0.06 倍約 2 格），招式進度停住＝炸開抬頭到一半突停（審核 p04 28→31）；停頓期間招式動作照平常速度繼續，之後跟遊戲同步前進（最後提早約 2 格到收招姿勢） */
    /* 噴刺環（OPT.porcM）：蓄力縮成一團（越縮越抖）→ 猛一抖全身往外炸（身體瞬間膨脹、彈起）→ 抖兩下慢慢收回 */
    const c = kf([[0, 0], [0.85, 1, 's'], [1, 1], [1.75, 0, 's'], [3, 0]], T), ex = kf([[0, 0], [1, 0], [1.75, 1, 's'], [2.15, 0.6, 's'], [2.65, 0.15, 's'], [3, 0, 's']], T)      /* 11-27 Q1 審查：炸開拉長約 5～6 格，不是 3 格衝頂又頓住 */, sh = Math.sin(st.t * 24) * (sm(0.3, 1, T) * (1 - sm(1, 1.1, T)) * 0.5 + sm(1, 1.1, T) * (1 - sm(1.6, 2.5, T)) * 1.1);      /* 11-27 Q1：抖動約 4Hz（52 rad/s 在 30fps 下像閃爍） */
    puff(1 - 0.05 * c + 0.30 * ex + 0.01 * sh);      /* 11-27 Q1 審查：炸開那幾格刺要往四周張（0.2→0.34），背不再拱成一塊 */
    const hd = kf([[0, 0], [0.85, 1, 's'], [1.1, 1], [2.3, 0, 's'], [3, 0]], T);      /* 11-27 Q1 審查：頭抬回來拉長到約 9 格（原本跟著炸開 2 格就從鼻子朝地跳成抬頭）；蓄力時頭不壓到前腳上 */
    poseBody({ y: -0.12 * c + (OPT.porcM.bY ?? 0.035) * ex, pitch: -2 * c + 3 * ex + 0.8 * sh, roll: 1.2 * sh, chest: -14 * c + 4 * ex, neckP: -14 * hd + 4 * ex, ears: -30 * (c + ex) });
    if (HEAD.spine) rotW(HEAD.spine, right, (5 * c - 9 * ex) * D2R); if (HEAD.head) rotW(HEAD.head, right, (-8 * hd + 3 * ex) * D2R);      /* 炸開時背中段往下壓（膨脹在背中段偏前會鼓起尖峰） */
    plantAll(OPT.porcM.bH ? { hold: true } : {}); tail(j => Math.sin(st.t * 15 - j * 0.6) * 0.3 * ex, 0.45 * c - 0.5 * ex, dt); }      /* 11-27 P1 OPT.porcM.bY／bH（箭豬）：炸開時身體不往上彈（bY，預設 +0.035 公尺）、四腳釘住不重新踏步（bH）。原本炸開那幾格後腳伸到 1.06 倍腿長搆不到地，兩後腳一起原地小跳、之後一直碎步 */
  else if (mode === 'pback') { const i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.5, o.recover || 0.9][i], u = clamp((o.stT || 0) / dur, 0, 1), T = i + u, { right, up } = axes(), sd = OPT.porcM.bs || 1;
    /* 倒衝（OPT.porcM）：轉頭看後方、尾巴豎起 → 倒退快衝（腳步照實際往後的移動踩）、屁股和尾巴的刺朝後頂 → 煞住、頭轉回來 */
    if (ctl.dph !== i) { if (ctl.dph != null && ctl.mode === 'pback') startBlend(0.2); ctl.dph = i; if (i === 1) ctl.locoFresh = true; }
    const lk = kf([[0, 0], [0.6, 1, 's'], [2.3, 1], [3, 0, 's']], T), tu = kf([[0, 0], [0.7, 1, 's'], [2.4, 1], [3, 0, 's']], T);
    if (i === 0) { SCAP = 0.045; resetPose(); const KW = OPT.porcM.kW || {}; root.position.z = (KW.z ?? 0.05) * lk; poseBody({ y: (KW.y ?? -0.04) * lk, pitch: (KW.p ?? -6) * lk, chest: -4 * lk, neckP: 10 * lk, ears: -30 * lk }); plantAll(KW.hold ? { hold: true } : {}); }      /* 11-27 P1 OPT.porcM.kW {z, y, p, hold}（箭豬）：倒衝預備時身體前移、下沉、前傾量；hold＝四腳釘住。原本前傾 6° 加前移 5 公分把後腳拉到 1.05 倍腿長，兩後腳一起原地小跳 15 格 */      /* 抬臀減半、頭抬起（原本頭壓到地上、前腳平貼） */      /* 11-27 Q1 審查：預備時重心壓到前腳、屁股抬高對準後方（看得出要用屁股撞） */
    else { SCAP = 0.06; const p0 = INR.pitch, c0 = OPT.cadMax, s0 = OPT.sxMax; if (OPT.pbCad) { OPT.cadMax = OPT.pbCad[0]; OPT.sxMax = OPT.pbCad[1]; if (INR.ok) { INR.vS = Math.hypot(INR.vw.x, INR.vw.z) / Math.max(1e-6, INR.sW || 1); ctl.vG = OPT.pbV ? ((ctl.cu && ctl.cu.vv) || 0) : (o.speed || 0); } }      /* 倒衝是瞬間全速：步態不走「慢慢加速」的上限（原本前 7 格腳幾乎不動） */ INR.pitch += (OPT.porcM.kP ?? -6) * tu; ctl.pbT = !!OPT.pbTr; loco(OPT.pbV ? ((ctl.cu && ctl.cu.vv) || 0) : (o.speed || 0), dt); ctl.pbT = false;      /* OPT.pbV：步態速度用外觀實際速度（收招時外觀還在退，腳要繼續踩） */ OPT.cadMax = c0; OPT.sxMax = s0; if (HEAD.neck) rotW(HEAD.neck, axes().right, 10 * tu * D2R); INR.pitch = p0;      /* 11-27 Q1 OPT.pbCad [步頻上限, 步幅上限]（箭豬）：倒衝 0.5 秒退 6 公尺，平常的步頻上限 1.5 腳幾乎不動像溜冰；倒衝時放寬成碎步快跑 */ root.position.z += (i === 1 ? -0.07 : -0.07 * (1 - sm(0, 0.6, u))) * tu; }      /* 倒衝時屁股抬高、身體往後倒著衝（外觀往後多帶一點，看得出屁股朝前） */      /* 倒衝時屁股抬高、刺朝後 */
    puff(1 + 0.09 * tu); rotW(HEAD.neck, up, sd * 75 * lk * D2R); if (HEAD.head) rotW(HEAD.head, up, sd * 30 * lk * D2R);      /* 頭轉向後方看 */
    tail(j => Math.sin(st.t * (i === 1 ? 16 : 9) - j * 0.6) * 0.5 * tu, -0.8 * tu, dt); }
  else if (mode === 'kick') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.4, o.strike || 0.2, o.recover || 0.5][i], T = OPT.anat ? smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt) : i + clamp((o.stT || 0) / dur, 0, 1);      /* 階段交界時間平滑（審核：收腿一格掉 54px） */
    /* 後蹬：重心移到前腳、低頭 → 臀部高高抬起、兩隻後腳往後上方踢出去 → 落地站回。前腳釘地 */
    const kP = kf(OPT.kk && OPT.kk.pc ? OPT.kk.pc : [[0, 0], [1, -6, 's'], [1.5, -(OPT.kk ? OPT.kk.p : KKP), 'o'], [2.1, -(OPT.kk ? OPT.kk.p : KKP) * 0.55, 's'], [2.8, 0, 's']], T);      /* 11-27 D1 OPT.kk.pc（野鹿）：臀部抬起的關鍵格。原本預備結束才在出招第一格用 ease-out 抬起（時間修正後第 5→6 格身體一格抬 20 公分、前肘一格 35°→5°）；改成預備後段就開始、平順抬到頂 */
    if (OPT.anat && ctl.kBL == null) { const hz = toLocal(wp(HEAD.hips)).z, fz = LEGS.filter(L => L.kind === 'F').reduce((a, L) => a + toLocal(wp(L.s)).z, 0) / 2; ctl.kBL = Math.max(0, fz - hz); }
    const kY = OPT.anat ? ctl.kBL * Math.sin(-kP * D2R) * 0.9 : 0;      /* 11-27 解剖：骨盆是轉軸，低頭時前半身會整個沉下去、把撐地前腳壓折；改成肩膀高度不動、臀部抬高（真的動物後蹬是後腳離地、前腳打直撐住） */
    root.position.z = kf([[0, 0], [1, 0.10, 's'], [1.5, 0.14, 'o'], [2.3, 0.06, 's'], [3, 0, 's']], T) * (OPT.anat ? 0.35 : 1);
    poseBody({ y: kf(OPT.kk && OPT.kk.yc ? OPT.kk.yc : [[0, 0], [1, -0.06, 's'], [1.5, 0.06, 'o'], [2.4, 0, 's']], T) * (OPT.anat ? (OPT.kk && OPT.kk.cr != null ? OPT.kk.cr : 0.3) : 1) + kY,      /* OPT.kk.cr（野鹿）：預備時後半身下蹲的倍率（審核：沒有預備動作，2～3 格就踢出去） */ pitch: kP, chest: kf([[0, 0], [1, -4, 's'], [1.5, -8, 'o'], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -6, 's'], [1.5, 10, 'o'], [2.4, 2, 's'], [3, 0, 's']], T), neckY: kf([[0, 0], [1, 10, 's'], [2, 10], [3, 0, 's']], T), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    if (OPT.kk && OPT.kk.nk) rotW(HEAD.neck, axes().right, OPT.kk.nk * kf([[0, 0], [1, 0.4, 's'], [1.5, 1, 'o'], [2.4, 0.3, 's'], [3, 0, 's']], T) * D2R);      /* 臀部抬高時頭跟著往下，抬頭補回來（角不撞地） */
    const k0 = OPT.kk && OPT.kk.k0 != null ? OPT.kk.k0 : 0.9, kk = kf([[0, 0], [k0, 0], [1.45, 1, 'o'], [1.9, 0.8, 's'], [2.4, 0, 's']], T);      /* OPT.kk.k0：後腳從預備的哪個時間點開始收起往後踢（越早越看得到蓄勢） */
    for (const L of LEGS) footC(L, ctl, L.kind === 'H' && kk > 0.02 ? { planted: false, off: [0, (OPT.kk ? OPT.kk.u : KKU) * kk, -(OPT.kk ? OPT.kk.b : KKB) * kk] } : {});
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
  else if (mode === 'snap') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.42, o.strike || 0.18, o.recover || 0.55][i], T0 = i + clamp((o.stT || 0) / dur, 0, 1), T = OPT.snapLd ? kf(OPT.snapLd, T0) : T0, EO = OPT.crocM && OPT.crocM.snS ? 's' : 'o';      /* 11-27 C1 OPT.crocM.snS（鱷魚）：往前咬、甩頭改成慢進慢出（原本先快後慢，出招第一格就跳一大段） */      /* 11-27 Q1 OPT.snapLd（果脊猴）：時間重排。猴咬出招只有 0.2 秒，往前咬那一下（T1→1.45 先快後慢）一格就做掉七成；改成蓄力最後四分之一就開始往前、出招前半段做完 */
    /* 啃咬：重心往後收、頭縮起 → 整個身體往前頂、脖子伸出去、張大嘴咬合 → 甩一下頭收回。四腳釘在地上 */
    const SK = OPT.snapK || {}; root.position.z = kf([[0, 0], [1, -0.12, 's'], [1.45, 0.26, EO], [2, 0.22, 's'], [3, 0, 's']], T) * (SK.z || 1);      /* 11-27 Q1 OPT.snapK（果脊猴）：預備往後收、往前頂的幅度倍率 z，張嘴倍率 jaw（猴子下顎小，原本的角度看不出張嘴） */
    poseBody({ y: kf([[0, 0], [1, -0.06, 's'], [1.45, -0.09, EO], [1.9, -0.04, 's'], [2.55, 0, 's']], T) * (OPT.snapY == null ? 1 : OPT.snapY), pitch: kf([[0, 0], [1, 5, 's'], [1.45, -6, EO], [1.9, -2, 's'], [2.55, 0, 's']], T) * (OPT.snapY == null ? 1 : OPT.snapY),      /* OPT.snapY（鱷魚）：咬的時候身體下沉、前傾的倍率（身體本來就貼地，再沉吻部會插進地裡） */      /* 收招：咬完就起身（原本整段收招都蹲著，看起來縮成一團） */ chest: kf([[0, 0], [1, 4, 's'], [1.45, -6, EO], [3, 0, 's']], T),
      neckP: kf([[0, 0], [1, -16, 's'], [1.45, 12, EO], [1.8, 10, 's'], [2.6, 0, 's']], T) * (OPT.snapNk == null ? 1 : OPT.snapNk), neckY: kf([[0, 0], [1.5, 0], [1.8, -14, EO], [2.25, 9, 's'], [3, 0, 's']], T) * (OPT.snapNY == null ? 1 : OPT.snapNY),      /* OPT.snapNk／snapNY（鱷魚）：咬的時候頭俯仰／甩頭的倍率（吻部長，往下點會插進地裡；鱷魚咬是頭往側邊猛甩） */
      jaw: kf([[0, 0], [0.5, 8, 's'], [1, 20, 's'], [1.3, 38, 'o'], [1.5, 0, 'i'], [2, 3], [3, 0, 's']], T) * (SK.jaw || 1), ears: kf([[0, 0], [0.8, -30, 's'], [2.4, -30], [3, 0, 's']], T) });
    plantAll(i === 1 ? { mth: 0.19 } : {});      /* 咬下去那一下身體往前頂、四腳釘地（已驗收的樣子），不提早跨步 */ tail(i => Math.sin(st.t * 9 - i * 0.7) * 0.10, kf([[0, 0.1], [1, 0.3, 's'], [1.45, -0.15, EO], [3, 0.1, 's']], T), dt); }
  else if (mode === 'pounce' || mode === 'swipe') { SCAP = 0.045; const K = mode === 'pounce' ? KP : KS, i = o.st - 2, dur = [o.wind || 0.6, o.strike || 0.3, o.recover || 0.6][i], M = mode === 'pounce' ? modes.Dpounce : modes.Dswipe;
    M.yk = (o.low || o.shape === 'line') ? 0.35 : 1; M.tIn = K[i] + clamp((o.stT || 0) / dur, 0, 1) * (K[i + 1] - K[i]); M.step(dt); }
  else if (mode === 'bslam') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.95, o.strike || 0.22, o.recover || 0.95][i]; bslamA(smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt), dt, [o.wind || 0.95, o.strike || 0.22, o.recover || 0.95]); }
  else if (mode === 'broar') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 1.2, o.strike || 0.3, o.recover || 0.7][i]; broarA(smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt), dt); }
  else if (mode === 'steal') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.8, o.strike || 0.6, o.recover || 0.6][i]; stealA(smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt), dt); }
  else if (mode === 'tug') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.55, o.strike || 0.25, o.recover || 0.7][i]; tugA(smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt), dt); }
  else if (mode === 'sit') { SCAP = 0.03; resetPose(); sitA((o.st === 4 ? 0.2 : o.st === 3 ? 0.1 : 0) + (o.stT || 0), dt); }
  else if (mode === 'butt') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.5, o.strike || 0.25, o.recover || 0.5][i], T = smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt); buttA(T, dt); }
  else if (mode === 'hook') { SCAP = 0.045; resetPose(); const i = o.st - 2, dur = [o.wind || 0.72, o.strike || 0.25, o.recover || 0.75][i], T = smT(i + clamp((o.stT || 0) / dur, 0, 1), dur, dt); if (ctl.dph !== i) { if (i === 0) ctl.hkS = -(ctl.hkS || -1); ctl.dph = i; } let Th = T; if (i === 0 && (o.stT || 0) < 0.03) ctl.hkT = 0; if (ctl.hkT != null && ctl.hkTf === ctl.fc - 1) Th = Math.max(Th, ctl.hkT + 0.6 * dt / 0.72); Th = Math.min(Th, 3); ctl.hkT = Th; ctl.hkTf = ctl.fc;      /* 11-27 探針：遊戲的蓄力比設定長一格，蓄力最後一格停在 T=1（頓一格）；甩角的時間至少以 0.6 倍速往前走，可以先跨進甩頭段 */
    hookA(Th + 0.08 * Math.sin(Math.PI * clamp((Th - 0.85) / 0.3, 0, 1)), dt, ctl.hkS || 1); }      /* 11-27 審核（甩角第 25→26 格頓一格）：蓄力→甩頭交界 T≈0.9～1.0 好幾條關鍵格同時停在節點上（速度為 0），時間在這段加快帶過去（仍單調） */
  else if (mode === 'daze') { SCAP = 0.045; resetPose(); dazeA(o.st === 4 ? (o.stT || 0) : 0, dt, o.recover || 2.6); }
  else if (mode === 'croll') croll(o, dt);
  else if (mode === 'ape') apeAct(o, dt);
  else if (mode === 'dead' && OPT.kd) { const an0 = OPT.anat; if (an0 && OPT.kdAn) OPT.anat = Object.assign({}, an0, OPT.kdAn); kdead(o.stT || 0, dt, o.hitSide); OPT.anat = an0;      /* 11-27 Q1 OPT.kdAn（岩羊）：倒地跪下時解剖限制換成這組（偶蹄類跪下是腕關節整個折起來跪在腕上；撐地鎖直腕的規則會讓腕不折、改由肘折，胸口沉到兩前腳中間，最後腕才一格折下去）。後腳的規則照舊 */ if (TDRP) tailDrop(dt, (o.stT || 0) < dt * 1.5); }
  else if (mode === 'dead') { dead(o.stT || 0, dt, { hitSide: o.hitSide, speed: Math.max(o.speed || 0, ctl.spd || 0) }); if (TDRP) tailDrop(dt, (o.stT || 0) < dt * 1.5); }
  else if (mode === 'stag') { resetPose(); const tt = o.stT || 0, k = Math.exp(-tt * (OPT.stagD || 2.6)) * sm(0, OPT.crocM && OPT.crocM.sgR || 0.05, tt);      /* OPT.stagD（水豚）：受擊姿勢回復的速度（預設 2.6，越小被打退的樣子撐越久） */ root.position.z = OPT.stagBk ? -OPT.stagBk.a * (0.35 * sm(0, 0.08, tt) + 0.65 * sm(0.06, OPT.stagBk.t, tt)) : -0.24 * k * (OPT.stagZ || 1);      /* 11-27 A1 OPT.stagBk {a, t}（岩羊）：被打往後退＝先頓一下（0.08 秒退 35%）再踉蹌往後退到 a（t 秒內），身體慢慢退、腳照跨步規則一步步往後踩；原本 0.05 秒整段推完，腳跟不上、前腳被拉成往前外攤 */ root.position.x = 0.07 * k * (OPT.stagZ || 1); const al = OPT.stagAl ? (1 - k) * sm(0.15, 0.5, tt) * (OPT.stagAlK || 1) : 0, br = Math.sin(tt * 2 * Math.PI / 1.1);      /* OPT.stagAl（水豚）：踉蹌後段喘氣（胸口起伏快）、頭左右看、耳朵豎起，不是整段靜止 */
    const AL = OPT.stagAl === true ? 1 : OPT.stagAl || 0;      /* stagAl 給數字＝後段喘氣／張望／換腳的幅度倍率 */
    poseBody({ y: -0.20 * k * (OPT.stagY || 1) + 0.02 * br * al * AL, pitch: 15 * k * (OPT.stagP == null ? 1 : OPT.stagP), roll: 15 * k * (OPT.stagR || OPT.stagZ || 1) + 5 * al * AL * Math.sin(tt * 1.9), yaw: 12 * k * (OPT.crocM && OPT.crocM.sgY != null ? OPT.crocM.sgY : 1), chest: -8 * k + 4.5 * br * al * AL, neckP: -24 * k * (OPT.stagN || 1) + 7 * al * AL * (0.6 + 0.4 * Math.sin(tt * 3.1)), neckY: -38 * k * (OPT.stagNY || 1) + 28 * al * AL * Math.sin(tt * 2.3), jaw: 22 * k, ears: -36 * k + 14 * al });      /* OPT.stagR（水豚）：受擊側歪倍率 */      /* OPT.stagZ（水豚）：受擊被推退、側傾的倍率（腿短，推退 0.24 前腳會往前外攤）。OPT.stagY／stagN（水豚）：受擊下沉、低頭的倍率（腿短，下沉 0.2 前腳會往外攤；低頭太多額頭的皮被擠成一團） */ plantAll(OPT.stagH ? { hold: true } : OPT.stagBk ? { off: [root.position.x, 0, root.position.z] } : {}); tail(i => 0.25 * k * (1 + i * 0.2), 0.2, dt); }      /* 11-27 A1 OPT.stagBk：站位跟著身體往後退（腳一步步往後踩到身體底下，不是留在原地被拉長） */      /* 11-27 Q1 OPT.stagH（棕熊、箭豬）：被打時腳釘住不碎步、不被拖著滑 */
  else if (OPT.bearM) { resetPose(); bwarnA(o.stT == null ? st.t : o.stT, dt); }
  else { resetPose(); const t = st.t, br = Math.sin(t * 3.1), WM = OPT.wnM ? 1 : 0, sn = WM ? kf([[0, 0], [1.5, 0], [1.7, 1, 's'], [2.0, 0, 's'], [2.6, 0]], t % 2.6) : 0; root.position.z = -0.08 * sm(0, 0.3, o.stT == null ? 1 : o.stT); poseBody({ y: PROF.warnY + 0.012 * br, pitch: PROF.warnP, chest: -4 - 2 * sn, yaw: 2.5 * Math.sin(t * 1.7), neckP: 13 + WM * (3 * Math.sin(t * 0.9) - 8 * sn), neckY: 5 * Math.sin(t * 1.7 + 1) + WM * 7 * Math.sin(t * 1.1), jaw: 15 + 4 * br + 8 * sn, ears: -30 + WM * 9 * Math.sin(t * 2.3) }); plantAll(); tail(i => Math.sin(t * (WM ? 3.4 : 5) - i * 0.7) * (WM ? 0.36 : 0.22), 0.25 + WM * 0.12 * Math.sin(t * 0.8), dt); }      /* 11-27 N1 OPT.wnM（野牛）：警告時頭和尾巴一直有慢慢的微動（審核：27～63 格幾乎定格）——頭左右慢慢擺 7°、上下 3°，每 2.6 秒低頭噴一口氣（頭往下一點、張嘴）；尾巴甩幅加大、上下慢慢起伏；耳朵前後動 */
  if (OPT.hdF && mode !== 'dead') headFloor(typeof OPT.hdF === 'number' ? OPT.hdF : 0.02);      /* OPT.hdF 給數字＝頭的最低點至少離地多高 */
  /* 換動作時的銜接：0.16 秒內從上一個姿勢滑到新姿勢 */
  if (ctl.bl < 1) { ctl.bl = Math.min(1, ctl.bl + dt / ctl.blDur); const w = ctl.bl * ctl.bl * (3 - 2 * ctl.bl);
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; _q.copy(b.quaternion); b.quaternion.copy(ctl.fromQ[i]).slerp(_q, w); _v.copy(b.position); b.position.copy(ctl.fromP[i]).lerp(_v, w); }
    _v.copy(root.position); root.position.copy(ctl.fromR).lerp(_v, w); _q.copy(root.quaternion); root.quaternion.copy(ctl.fromRq).slerp(_q, w); }
  if (OPT.kdG && mode === 'dead' && ctl.bl < 1) { root.updateMatrixWorld(true); const P = kdPts(), rt = axes().right; for (const L of LEGS) { const F = L.kind === 'F'; liftOff(L.w, rt, P[L.id], -0.02, 12, F ? -1 : 1); liftOff(L.e, rt, P[L.id], -0.02, 8, F ? 1 : -1); } }      /* 野牛：跪下→翻倒的銜接途中腿會掃進地面，就把腕／飛節再折（方向固定，不會一格一格換邊抖） */
  /* 動作切換的過渡是把骨頭角度慢慢轉過去，中途腳可能沉進地面：過渡期間每隻腳量一次腳底，低於地面就把掌根原地往上抬（腳掌朝向不變），抬的力道隨穿入深度連續增加 */
  if (ctl.bl < 1 && mode !== 'dead') { root.updateMatrixWorld(true); for (const L of LEGS) if (L.fin && L.fin.n === ctl.fc) solveLeg(L, L.fin.p, L.fin.a[0], L.fin.a[1], 1, L.fin.o);      /* 接觸層管的腳：姿勢混合完再照目標解一次，換動作的過渡期間腳不會被身體拖著走 */ for (const L of LEGS) { const g = GND ? L.c.g || 0 : 0, mn = soleMin(L) - g; if (mn > -0.002) continue; const qh = GQ(L.h, Q()).clone(), qt = GQ(L.t, Q()).clone(), hw = wp(L.h); hw.y += -mn + HY - L.hy;
      solveLeg(L, hw, 0, 0, sm(0.002, 0.012, -mn), { ng: 9, sf: 1, avd: 1, g }); setW(L.h, qh); setW(L.t, qt); } }
  if (OPT.anat) { if (!ctl.llQ) ctl.llQ = bones.map(() => new THREE.Quaternion()); for (let i = 0; i < bones.length; i++) ctl.llQ[i].copy(ctl.lastQ[i]); ctl.llT = ctl.lqT; }      /* 上上格（擺盪加速度限制用） */
  for (let i = 0; i < bones.length; i++) { ctl.lastQ[i].copy(bones[i].quaternion); ctl.lastP[i].copy(bones[i].position); } ctl.lqT = st.t; ctl.lastR.copy(root.position); ctl.lastRq.copy(root.quaternion);
  root.updateMatrixWorld(true);
  if (OPT.bearM && ctl.pf) bPuffTick(dt);      /* 11-27 R1 棕熊噴氣氣團（換模式也會照樣淡掉，不會停在空中） */
  if (mode === 'dead') SEC.reset(); else { SEC.apply(dt, mode); root.updateMatrixWorld(true); tailClamp(); tailGround(); tailClamp(); } TLIM = TL0;
  ctl.pm.copy(stage.matrixWorld); ctl.pmOk = true; }      /* 嚎叫時晃動層照常作用 */
const _q = Q(), _v = V();
return { stage, root, model, update, FIT, RG, SEC, INR, RB, SIZE, LEGS, CL, ctl, BF, T: { BR, TG, gAt, setGround: f => { GND = f; }, soleG: L => { let mn = 1e9, mx = -1e9; const v = V(); for (const q of L.sole) { q.m.getVertexPosition(q.i, v); q.m.localToWorld(v); const d = GND ? (v.y - GND(v.x, v.z)) / TG.sW : stage.worldToLocal(v.clone()).y; if (d < mn) mn = d; if (d > mx) mx = d; } return [mn, mx]; },      /* 測試用：腳底每一點離真正地面多高（最低、最高） */ solveLeg, legLen, legAng, footPlan, resetPose, HY, GAITS, toWorld, soleMin, skinMinY, torsoPts, wp, axes, modes }, get mode() { return ctl.mode; } };
}
/* ================= 蛇形滑行（OPT.snake，沼蟒；11-27 Q2）=================
   骨架是一串（頭＝根骨，往尾巴一節接一節）。不用四足引擎：身體每一節都沿著「頭走過的路徑」放（身體跟著頭的路徑走）。
   頭在前進時左右擺（擺幅隨走過的距離變化），整條路徑就是一條蛇行曲線，往後傳＝沿身體的行進波；停下來時身體保持原本的形狀。
   招式：coil／bite 撲咬（頭往後縮成 S → 猛往前伸）、spit 噴毒（前段立起、頭往後仰 → 往前噴）、crush 扭絞（身體繞成兩圈螺旋、頭在上面）、
   sweep 甩尾（後半段繞中段甩一個大弧）、sub 沉水（貼地、頭壓低）、rise 起身、slide 滑回（照走路）、受擊頭往後彈、倒地頭垂到地上身體抽兩下。
   每一節離地高度＝那一節身體的半徑（從模型量），整條蛇不會穿地也不會浮空。 */
export function makeSnake(model, OPT = {}) {
  const stage = new THREE.Group(), root = new THREE.Group(); stage.add(root);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  model.scale.setScalar(1); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
  { const b = new THREE.Box3().setFromObject(model), s = b.getSize(V()), k = 6 / Math.max(s.z, 1e-6); model.scale.setScalar(k); model.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k); }
  root.add(model); stage.updateMatrixWorld(true);
  const wp = o => { const v = V(); o.getWorldPosition(v); return stage.worldToLocal(v); }, GQ = (o, q) => { o.getWorldQuaternion(q); const s = Q(); stage.getWorldQuaternion(s); return q.premultiply(s.invert()); };
  const all = []; model.traverse(o => { if (o.isBone) all.push(o); }); const hb = all.find(b => !(b.parent && b.parent.isBone)), ch = []; for (let b = hb; b; b = b.children.find(c => c.isBone)) ch.push(b);
  const rest = new Map(all.map(b => [b, { q: b.quaternion.clone(), p: b.position.clone() }])), resetPose = () => { for (const [b, r] of rest) { b.quaternion.copy(r.q); b.position.copy(r.p); } root.updateMatrixWorld(true); };
  const J0 = ch.map(wp), N = ch.length, D = []; for (let i = 0; i < N - 1; i++) D.push(J0[i].distanceTo(J0[i + 1]));
  const LEN = D.reduce((a, b) => a + b, 0), SK = []; model.traverse(o => { if (o.isSkinnedMesh) SK.push(o); });
  /* 每一節的身體半徑＝這一節的皮最低點到骨頭的高度（站姿量） */
  const R = ch.map(() => null), headPts = [], v = V();
  { const lo = ch.map(() => 1e9), cnt = ch.map(() => 0); for (const m of SK) { const g = m.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bi = m.skeleton.bones.map(b => ch.indexOf(b));
      for (let i = 0; i < g.attributes.position.count; i++) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const c = bi[SI.getComponent(i, k)]; if (c < 0) continue; m.getVertexPosition(i, v); const p = stage.worldToLocal(m.localToWorld(v.clone())); lo[c] = Math.min(lo[c], p.y); cnt[c]++; if (c === 0) headPts.push({ m, i, p }); } }
    for (let i = 0; i < N; i++) if (cnt[i] > 20) R[i] = clamp(J0[i].y - lo[i], 0.02, 0.4); for (let i = 0; i < N; i++) if (R[i] == null) R[i] = i ? R[i - 1] * 0.8 : 0.1; }
  const RB = Math.max(...R.slice(1, N - 2)); R[0] = Math.min(R[0], RB * 1.1);
  /* 頭的軸：頭的皮最前端（吻尖）← 脖子那個關節。中性姿勢＝這條軸水平朝前 */
  let tip = J0[0]; for (const h of headPts) if (h.p.z > tip.z) tip = h.p; const A0 = tip.clone().sub(J0[1]).normalize(), HQ0 = GQ(ch[0], Q()).clone();
  let HB = 0; { const lo = headPts.reduce((a, h) => Math.min(a, h.p.y), 1e9); HB = J0[0].y - lo; }      /* 頭骨到下巴的高度（站姿）；頭擺平後再量一次 */
  const U0 = V(0, 1, 0).addScaledVector(A0, -A0.y).normalize(), B0i = new THREE.Matrix4().makeBasis(A0, U0, A0.clone().cross(U0)).invert();      /* 頭的整個座標框（軸＋上方）一起對：只對軸的話頭會側翻，整條身體跟著翻（肚子朝外） */
  const setHead = (P, dir, roll = 0) => { const d = dir.clone().normalize(), u = V(0, 1, 0).addScaledVector(d, -d.y).normalize(); if (roll) u.applyAxisAngle(d, roll); const q = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, u, d.clone().cross(u)).multiply(B0i)).multiply(HQ0), pq = Q(); ch[0].parent.getWorldQuaternion(pq); const s = Q(); stage.getWorldQuaternion(s); ch[0].quaternion.copy(pq.invert().multiply(s.multiply(q))); ch[0].position.copy(ch[0].parent.worldToLocal(stage.localToWorld(P.clone()))); ch[0].updateMatrixWorld(true); };
  const aim = (b, c, t) => { const s = wp(b), e = wp(c), d = Q().setFromUnitVectors(e.sub(s).normalize(), t.clone().sub(s).normalize()), wq = GQ(b, Q()).premultiply(d), pq = GQ(b.parent, Q()); b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true); };
  setHead(V(0, 1, 0), V(0, 0, 1)); { let lo = 1e9; for (const h of headPts) { h.m.getVertexPosition(h.i, v); lo = Math.min(lo, stage.worldToLocal(h.m.localToWorld(v.clone())).y); } HB = 1 - lo; } resetPose();
  /* 每一節的站姿座標框（骨頭方向＋世界上方）：擺姿勢時整個框一起對（軸＋上方），身體不會因為轉了大角度就翻過去、肚子朝外 */
  const FR = []; for (let i = 0; i < N - 1; i++) { const d = J0[i + 1].clone().sub(J0[i]).normalize(), u = V(0, 1, 0).addScaledVector(d, -d.y); if (u.lengthSq() < 1e-6) u.set(0, 0, 1); u.normalize(); FR.push({ q: GQ(ch[i], Q()).clone(), Bi: new THREE.Matrix4().makeBasis(d, u, d.clone().cross(u)).invert() }); }
  const aimF = (i, t, roll = 0) => { const s = wp(ch[i]), d = t.clone().sub(s); if (d.lengthSq() < 1e-10) return; d.normalize(); const u = V(0, 1, 0).addScaledVector(d, -d.y); if (u.lengthSq() < 1e-6) u.set(0, 0, 1); u.normalize(); if (roll) u.applyAxisAngle(d, roll); const wq = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, u, d.clone().cross(u)).multiply(FR[i].Bi)).multiply(FR[i].q), pq = GQ(ch[i].parent, Q()); ch[i].quaternion.copy(pq.invert().multiply(wq)); ch[i].updateMatrixWorld(true); };
  const SIZE = { len: LEN + J0[0].distanceTo(tip), h: Math.max(...R) * 2 }, HOFF = 0.42 * LEN;
  /* 頭走過的路徑（世界座標，新的在後面） */
  const TR = [], _w = V(), _f = V(), ctl = { mode: '', fc: 0, dist: 0, mv: 0, sw: 0, pE: null, t: 0, bl: 1, last: null, dph: null }, st = { t: 0 };
  const W2L = p => stage.worldToLocal(p.clone()), L2W = p => stage.localToWorld(p.clone());
  const seed = () => { TR.length = 0; for (let k = 40; k >= 0; k--) { const s = (k / 40) * 1.3 * LEN, p = V(0.05 * LEN * Math.sin(s / LEN * 6), 0, HOFF - s); TR.push(L2W(p)); } };
  const gY = p => { const G = OPT.ground || (typeof window !== 'undefined' && window.__rigGround); if (!G) return 0; const w = stage.localToWorld(V(p.x, 0, p.z)), h = G(w.x, w.z); if (!(h === h)) return 0; const ws = V(); stage.getWorldScale(ws); const d = (h - w.y) / (ws.y || 1); return Math.abs(d) < 0.6 ? d : 0; };
  /* 路徑（換成自己座標、從頭開始，每 ds 取一點） */
  function poly(head) { const P = [head.clone()], ds = 0.01 * LEN; let need = ds, cur = head.clone(); for (let k = TR.length - 1; k >= 0 && P.length < 160; k--) { const q = W2L(TR[k]); q.y = 0; let seg = q.clone().sub(cur), L = Math.hypot(seg.x, seg.z); while (L >= need) { cur.addScaledVector(seg, need / L); cur.y = 0; P.push(cur.clone()); seg = q.clone().sub(cur); L = Math.hypot(seg.x, seg.z); need = ds; } need -= L; cur = q; }
    while (P.length < 160) { const a = P[P.length - 1], b = P[P.length - 2] || a.clone().add(V(0, 0, ds)), d = a.clone().sub(b); d.y = 0; if (d.lengthSq() < 1e-10) d.set(0, 0, -ds); P.push(a.clone().add(d.setLength(ds))); } return P; }
  const kf = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
  function update(o) { const dt = Math.min(0.05, Math.max(0, o.dt || 0)); st.t += dt; ctl.fc++; stage.updateMatrixWorld(true);
    const s0 = o.st | 0, atk = s0 >= 2 && s0 <= 4, an = o.anim || '', i3 = clamp(s0 - 2, 0, 2), dur = [o.wind || 0.6, o.strike || 0.3, o.recover || 0.8][i3], T = atk ? i3 + clamp((o.stT || 0) / dur, 0, 1) : 0;
    let mode = s0 === 6 ? 'dead' : s0 === 5 ? 'stag' : atk ? ({ coil: 'lunge', bite: 'lunge', spit: 'spit', crush: 'crush', sweep: 'sweep', sub: 'sub', rise: 'rise', slide: 'loco' }[an] || 'lunge') : 'loco';
    if (mode !== ctl.mode) { ctl.bl = ctl.mode ? 0 : 1; ctl.from = ctl.last ? ctl.last.map(p => p.clone()) : null; ctl.mode = mode; ctl.dT = 0; } ctl.bl = Math.min(1, ctl.bl + dt / 0.25); ctl.dT += dt;
    if (stage.parent) { const pq = Q(); stage.parent.getWorldQuaternion(pq); const f = V(0, 0, 1).applyQuaternion(pq), py = Math.atan2(f.x, f.z); if (ctl.vy == null || ctl.fc <= 1) ctl.vy = py; let e = py - ctl.vy; e -= Math.round(e / (2 * Math.PI)) * 2 * Math.PI; const mx = (s0 >= 2 && s0 <= 4 ? (OPT.vyAtk || 200) : OPT.trn ? lerp(OPT.trn.still, OPT.vyMax || 120, clamp(ctl.mv, 0, 1)) : (OPT.vyMax || 120)) * D2R * dt, vy0 = ctl.vy; ctl.vy += clamp(e, -mx, mx); ctl.dvy = Math.abs(ctl.vy - vy0);      /* 11-27 S1 OPT.trn.still：原地轉向（沒在移動）時外觀每秒最多轉幾度。頭在原點前 0.42 身長，原本 120°/s＝頭畫弧每秒 6 公尺（比滑行快）、整條身體被甩過去；限到約滑行速度 */ let r = ctl.vy - py; r -= Math.round(r / (2 * Math.PI)) * 2 * Math.PI; stage.rotation.y = mode === 'crush' || mode === 'dead' ? stage.rotation.y : r; stage.updateMatrixWorld(true); }      /* 11-27 Q2：外觀轉向每秒最多 120°（出招 200°）：遊戲一格把蛇轉很大角度時，頭不會一格甩到旁邊、身體也不會在路徑上折一個尖角 */
    stage.getWorldPosition(_w); const ws = V(); stage.getWorldScale(ws); const sW = ws.x || 1;
    if (!ctl.pE || _w.distanceTo(ctl.pE) > 0.6 * LEN * sW) { ctl.pE = _w.clone(); seed(); }
    const mvd = (dt > 0 ? _w.distanceTo(ctl.pE) / sW : 0) + (OPT.trn && mode === 'loco' ? (ctl.dvy || 0) * HOFF : 0);      /* 11-27 S1 OPT.trn：原地轉向時頭畫弧的距離也算滑行（身體照樣左右波動往前送，不是整條平移） */ ctl.pE.copy(_w); const sp = dt > 0 ? mvd / dt : 0; if (mode !== 'dead' && mode !== 'crush') ctl.dist += mvd; ctl.mv += ((sp > 0.05 ? 1 : 0) - ctl.mv) * (1 - Math.exp(-dt / 0.3));
    /* 11-27 Q2 r2：姿勢全部用連續的參數（前段 S 形壓縮 c、頭高 h、前段長 ln、前段權重 fw、俯仰、偏航、甩尾角 sw、纏繞進度 cw、纏繞半徑 cr、翻身 roll），每格往目標平滑靠近：換招、收招結束、受擊都不會一格跳 */
    const sm = ctl.sm || (ctl.sm = { fw: 0, c: 0, h: 0.03, ln: 0.4, pitch: -4, yaw: 0, sw: 0, tl: 0, cw: 0, cr: 1, roll: 0, hk: 1 }), tg = { fw: 0, c: 0, h: 0.03, ln: 0.4, pitch: -4, yaw: 0, sw: 0, tl: 0, cw: 0, cr: 1, roll: 0, hk: 1 }, rk = {};
    if (i3 === 0 || !atk) ctl.sawS = false; if (i3 === 1) ctl.sawS = true; const skipS = atk && i3 === 2 && !ctl.sawS && T - 2 < 0.3, Tr = atk && i3 === 2 && !ctl.sawS ? 2 + clamp((T - 2.3) / 0.7, 0, 1) : T;      /* 遊戲常常直接從預備跳到收招（出招段 0 格，例如一出手就判定命中）：收招前 0.3 段照樣做出招的動作 */
    let rate = 8, wob = 0; const stT = o.stT || 0, grab = !!o.grab, alert = s0 === 1 || s0 === 8 || s0 === 7, E = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    if (mode === 'loco') { const still = 1 - ctl.mv; tg.fw = still * (alert ? 1 : 0.7); tg.c = alert ? 0.35 : 0.18; tg.h = (alert ? 0.075 : 0.04) + 0.006 * Math.sin(st.t * 1.9) * still; tg.ln = 0.36; tg.yaw = 16 * Math.sin(st.t * 0.7) * still; rate = 4.5; }      /* 停著：前段微微盤成 S、頭抬起來慢慢左右看；一走動前段就放平跟著路徑 */
    if (mode === 'lunge') { tg.fw = 1;
      if (grab) { tg.ln = 0.46; if (i3 === 0) { const e = E(T); tg.c = 0.3 + 0.65 * e; tg.h = 0.05 + 0.1 * e; tg.pitch = 2 + 10 * e; wob = e; rate = 6; } else if (i3 === 1 || skipS) { tg.c = 0.03; tg.h = 0.03; tg.pitch = -14; rate = 26; } else { const r = E(Tr - 2); tg.c = 0.05 + 0.4 * r; tg.h = 0.03 + 0.05 * r; tg.pitch = -14 + 12 * r; rate = 4; } }      /* 撲纏：大 S 蓄力（頭高高往後拉、抖），出招整條 S 拉直往前撲，收招慢慢盤回 */
      else { tg.ln = 0.3; if (i3 === 0) { const e = E(T); tg.c = 0.2 + 0.5 * e; tg.h = 0.035 + 0.035 * e; tg.pitch = -2 + 8 * e; rate = 10; } else if (i3 === 1 || skipS) { tg.c = 0; tg.h = 0.02; tg.pitch = -18; rate = 36; } else { const r = E(Tr - 2); tg.c = 0.08 + 0.3 * r; tg.h = 0.025 + 0.045 * r; tg.pitch = -18 + 16 * r; rate = 8; } } }      /* 咬：小 S、頭壓低，出招快而短 */
    if (mode === 'spit') { tg.fw = 1; tg.ln = 0.42; if (i3 === 0) { const e = E(T); tg.c = 0.3 + 0.3 * e; tg.h = 0.08 + 0.15 * e; tg.pitch = 6 + 20 * e; rate = 6; } else if (i3 === 1) { tg.c = 0.42; tg.h = 0.21; tg.pitch = T < 1.3 ? -24 : -12; rate = 24; } else { const r = E(T - 2); tg.c = 0.42 - 0.12 * r; tg.h = 0.2 - 0.12 * r; tg.pitch = -10 + 6 * r; rate = 4; } }      /* 噴毒：前段高高仰起，噴的一瞬間頭往前下一甩 */
    if (mode === 'rise') { const u = clamp(stT / 0.5, 0, 1); tg.fw = 1; tg.c = 0.3; tg.h = 0.04 + 0.1 * Math.sin(Math.PI * u); tg.pitch = 10 * Math.sin(Math.PI * u); rate = 10; }
    if (mode === 'sub') { tg.fw = 0; tg.h = 0; tg.pitch = -8; rate = 6; }
    if (mode === 'stag') { const k = Math.exp(-stT * 3) * Math.min(1, stT * 20); tg.fw = 1; tg.c = 0.2 + 0.35 * k; tg.h = 0.04 + 0.07 * k; tg.pitch = -4 + 28 * k; tg.ln = 0.34; rate = 16; }      /* 受擊：頭被打得往後仰、前段縮成 S */
    if (mode === 'sweep') { tg.fw = 1; tg.c = 0.3; tg.h = 0.06; tg.ln = 0.3; if (i3 === 0) { tg.sw = -0.9 * E(T); tg.tl = 0.3 * E(T); rate = 6; } else if (i3 === 1) { tg.sw = -0.9 + 3.3 * E(T - 1); tg.tl = 1; rate = 22; } else { const r = T - 2, k = r < 0.35; tg.sw = k ? 2.4 : 2.4 * (1 - E((r - 0.35) / 0.65)); tg.tl = k ? 1 : 0.6 * (1 - E((r - 0.35) / 0.4)); rate = k ? 16 : 5; } }      /* 遊戲常常直接從預備跳到收招（出招段 0 格）：收招前 0.35 秒照樣掃過去 */      /* 甩尾：尾巴先往反方向收、再整條掃過去（離地），收招慢慢放回 */
    if (mode === 'crush') { tg.fw = 0; tg.cw = s0 === 4 ? 0 : 1; tg.cr = s0 === 4 ? 1.5 : 1 - 0.06 * Math.max(0, Math.sin(stT * 4.2)); tg.hk = s0 === 4 ? 0 : 1; rk.hk = 3; rk.cw = s0 === 4 ? 1.2 : 1.0; rk.cr = s0 === 4 ? 2.5 : 6; rk.fw = 2.5; rate = 6; }      /* 鬆開：圈先往下落到地上、往外鬆，再慢慢退開（不在半空拱成一座橋） */      /* 扭絞：從頭往下一圈一圈纏住被抓的人（人就在自己的原點）；鬆開時圈往外張、慢慢退開 */
    if (mode === 'dead') { tg.fw = 0; tg.h = 0; tg.pitch = -10; tg.roll = ctl.dT > 0.45 ? (OPT.dRoll ?? 100) : 0;      /* 11-27 S1 OPT.dRoll：倒地翻身角（100°＝側躺、白肚子整片朝外，像翻肚）*/  rk.roll = 3.2; rk.fw = 4; rate = 7; }      /* 倒地：前段垮下、全身抽搐幾下、慢慢翻成側躺（肚子露一半） */
    for (const q in tg) { const r = rk[q] || rate; sm[q] += (tg[q] - sm[q]) * (ctl.fc <= 1 ? 1 : 1 - Math.exp(-r * dt)); }
    /* 路徑：虛擬的頭在 HOFF 前方左右擺（行進波的源頭，波長 0.55 身長、振幅 0.1 身長），身體沿著頭走過的路 */
    const lam = 0.55 * LEN, amp = 0.1 * LEN * ctl.mv, ph = 2 * Math.PI * ctl.dist / lam, headG = V(amp * Math.sin(ph), 0, HOFF);
    if (mode !== 'dead' && mode !== 'crush' && mode !== 'sweep') { const hw = L2W(headG); while (TR.length > 3) { const a1 = TR[TR.length - 1], a0 = TR[TR.length - 2]; if ((hw.x - a1.x) * (a1.x - a0.x) + (hw.z - a1.z) * (a1.z - a0.z) < 0) TR.pop(); else break; } if (!TR.length || hw.distanceTo(TR[TR.length - 1]) > 0.006 * LEN * sW) { TR.push(hw); if (TR.length > 400) TR.splice(0, TR.length - 400); } }
    const P = poly(headG), ds = 0.01 * LEN;
    /* 前段：從錨點（路徑上 ln 身長處）往前用「烏龜走法」長出一條 S 形（每步固定一節長，抬高的部分水平步長縮短），弧長不變；c＝0 就是直線 */
    if (sm.fw > 0.002) { const ka = clamp(Math.round(sm.ln * 100), 10, 60), A = P[ka], tq = A.clone().sub(P[ka + 4]); tq.y = 0; tq.normalize(); const psA = Math.atan2(tq.x, tq.z); ctl.psi = ctl.psi == null || sm.fw < 0.05 ? psA : ctl.psi + (psA - ctl.psi) * (1 - Math.exp(-4 * dt)); const psi = ctl.psi, H = sm.h * LEN; let x = A.x, z = A.z, y0 = 0;      /* 錨點的切線先平滑（衝刺中路徑是大振幅的波，切線一格差很多） */
      for (let j = 1; j <= ka; j++) { const u = j / ka, th = psi * (1 - E(u / 0.55)) + sm.c * 1.35 * Math.sin(2 * Math.PI * u) * (1 - 0.25 * u) + wob * 0.05 * Math.sin(st.t * 38 + u * 6) * u, y = H * E((u - 0.3) / 0.6), dy = y - y0, dh = Math.sqrt(Math.max(ds * ds - dy * dy, 0.05 * ds * ds)); x += Math.sin(th) * dh; z += Math.cos(th) * dh; y0 = y; P[ka - j].lerp(V(x, y, z), sm.fw); } }
    for (let k = 0; k < 10; k++) P[k].y += 0.012 * LEN * (1 - sm.fw) * (1 - k / 10) ** 2 * (mode === 'dead' ? 0 : 1);
    /* 甩尾：身體中段（路徑 0.45 身長）當軸，後段整條繞過去，越往尾巴轉越多、離地 */
    if (Math.abs(sm.sw) > 0.002 || sm.tl > 0.002) { const piv = 45, pc = P[piv].clone(); for (let k = piv + 1; k < P.length; k++) { const f = Math.min(1, (k - piv) / 55), a = sm.sw * f * f, d = P[k].clone().sub(pc); P[k].set(pc.x + d.x * Math.cos(a) + d.z * Math.sin(a), P[k].y + 0.05 * LEN * sm.tl * Math.sin(Math.PI * Math.min(1, f * 1.1)), pc.z - d.x * Math.sin(a) + d.z * Math.cos(a)); } }
    /* 扭絞：被纏的人站在原點（半徑 0.33 公尺）；頭在上面對著人的臉，脖子往外下接螺旋，一圈一圈往下纏到地面，尾巴在地上往外繞 */
    let dirC = null; if (sm.cw > 0.002) { const Rv = 0.33 / sW, Rc = (Rv + RB) * sm.cr, top = Math.min(Math.max(0.2, 1.1 / sW - RB), 2.1 * RB * clamp(0.6 * LEN / (2 * Math.PI * Rc), 1, 2.2)) * sm.hk, Hh = lerp(0.04 * LEN, 1.4 / sW - RB, sm.hk),      /* 一圈疊一圈貼緊（每圈高一個身體直徑），不是彈簧 */ aH = 0.6, Ln = 0.1 * LEN, Lh = clamp(0.6 * LEN, 2 * Math.PI * Rc, 2.2 * 2 * Math.PI * Rc), Ctr = [];
      for (let k = 0; k < P.length; k++) { const s = k * ds; let a, r, y; if (s < Ln) { const u = s / Ln; a = aH + u * Ln / Rc; r = Rc * (0.85 + 0.15 * u); y = lerp(Hh, top, E(u)); } else if (s < Ln + Lh) { const u = (s - Ln) / Lh; a = aH + (s) / Rc; r = Rc; y = top * (1 - u); } else { const s2 = s - Ln - Lh; r = Rc + 0.25 * s2; a = aH + (Ln + Lh) / Rc + s2 / Math.max(r, 1e-3); y = 0; }
        Ctr.push(V(r * Math.sin(a), Math.max(0, y), r * Math.cos(a))); }
      for (let k = 0; k < P.length; k++) P[k].lerp(Ctr[k], E((sm.cw * 1.5 - k / 100) / 0.5));
      dirC = V(-Math.sin(aH), -0.35, -Math.cos(aH)).normalize(); }
    /* 倒地抽搐：沿身體往後傳的橫向波，振幅很快衰減 */
    if (mode === 'dead') { const u = ctl.dT, Aw = 0.05 * LEN * E(u / 0.12) * Math.exp(-1.8 * u); if (Aw > 1e-4) for (let k = 1; k < P.length - 1; k++) { const t2 = P[k - 1].clone().sub(P[k + 1]); t2.y = 0; t2.normalize(); const w = Aw * Math.sin(9 * u - k * 0.13) * Math.min(1, k / 12); P[k].x += t2.z * w; P[k].z -= t2.x * w; } }
    ctl.last = P;
    /* 擺骨頭：頭骨照路徑最前段的切線（加上俯仰、偏航；扭絞時對著人）；之後每一節找路徑上「離上一個關節剛好一節長」的點；翻身角從頭往尾變大 */
    resetPose(); const g0 = gY(P[0]), hd = P[0].clone().sub(P[5]); const hp = Math.atan2(hd.y, Math.hypot(hd.x, hd.z)) + sm.pitch * D2R; hd.y = 0; hd.normalize().applyAxisAngle(V(0, 1, 0), sm.yaw * D2R); let dir = V(hd.x * Math.cos(hp), Math.sin(hp), hd.z * Math.cos(hp)); if (dirC) dir.lerp(dirC, clamp(sm.cw * 1.5 - 0.3, 0, 1)).normalize();
    setHead(V(P[0].x, P[0].y + HB + g0 + 0.003 * LEN, P[0].z), dir, sm.roll * 0.4 * D2R);
    let k0 = 1; for (let i = 0; i < N - 1; i++) { const a = wp(ch[i + 1]); let tgt = null; for (let k = k0; k < P.length; k++) { const q = P[k].clone(); q.y += R[i + 1] + gY(q); if (q.distanceTo(a) >= D[i + 1] || k === P.length - 1) { tgt = q; k0 = k; break; } } if (i + 2 < N && tgt) aimF(i + 1, tgt, sm.roll * D2R * lerp(0.45, 1, E((i + 1) / (N * 0.5)))); }
    root.updateMatrixWorld(true); }
  return { stage, root, model, update, SIZE, RB: { chain: ch.map(b => b.name), R: R.map(x => +x.toFixed(3)) }, LEGS: [], INR: {}, ctl, T: { poly, TR }, get mode() { return ctl.mode; }, snake: true };
}
/* ================= 鳥類（OPT.bird，灰翎鷺；11-27 Q2）=================
   兩腳走路：每隻腳釘在世界上，離站位太遠才跨（兩腳輪流，不會同時離地），跨步弧線抬腳；腿是兩節 IK（脛→跗蹠，跗間關節往後彎）。
   頭前後點：每跨一步，頭先停在空中（脖子往後收）、再往前一伸追上身體。
   翅膀：模型是張開的（T 字），站著、走路時摺起來貼在身側（每節骨頭的方向＋羽毛朝下）；飛行時在摺起與張開之間插值，再加肩膀的上下拍動。
   受驚（遊戲的逃跑狀態）：蹲一下 → 起跳、快速拍翅爬升 → 平飛（脖子縮成 S、腳往後伸）；不逃了以後在原地上空盤旋幾圈再降落（張翅減速、腳往前伸）。
   倒地：腳軟、身體落地側躺一點點、脖子垂到地上、翅膀半開垂著（不會翻肚）。 */
export function makeBird(model, OPT = {}) {
  const stage = new THREE.Group(), root = new THREE.Group(); stage.add(root);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  model.scale.setScalar(1); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
  { const b = new THREE.Box3().setFromObject(model), s = b.getSize(V()), k = 1 / Math.max(s.y, 1e-6); model.scale.setScalar(k); model.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k); }
  root.add(model); stage.updateMatrixWorld(true);
  const M = OPT.bird, B = n => model.getObjectByName(n) || model.getObjectByName(n.replace(/[.]/g, '')), wp = o => { const v = V(); o.getWorldPosition(v); return stage.worldToLocal(v); };
  const GQ = (o, q) => { o.getWorldQuaternion(q); const s = Q(); stage.getWorldQuaternion(s); return q.premultiply(s.invert()); };
  const setWQ = (b, wq) => { const pq = GQ(b.parent, Q()).invert(); b.quaternion.copy(pq.multiply(wq)); b.updateMatrixWorld(true); };
  const rotW = (b, ax, a) => { if (!a) return; setWQ(b, GQ(b, Q()).premultiply(Q().setFromAxisAngle(ax, a))); };
  const aim = (b, c, t) => { const s = wp(b), e = wp(c); if (t.distanceToSquared(s) < 1e-10) return; setWQ(b, GQ(b, Q()).premultiply(Q().setFromUnitVectors(e.sub(s).normalize(), t.clone().sub(s).normalize()))); };
  const all = []; model.traverse(o => { if (o.isBone) all.push(o); }); const rest = new Map(all.map(b => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
  const resetPose = () => { for (const [b, r] of rest) { b.quaternion.copy(r.q); b.position.copy(r.p); } root.updateMatrixWorld(true); };
  const P = { pel: B(M.pelvis), sp: M.spine.map(B), nk: M.neck.map(B), hd: B(M.head), tl: (M.tail || []).map(B) };
  const LEG = [['L', M.legL, 1], ['R', M.legR, -1]].map(([id, n, sd]) => { const b = n.map(B), p = b.map(wp); return { id, sd, b, l1: p[0].distanceTo(p[1]), l2: p[1].distanceTo(p[2]), hip0: p[0], ft0: p[2], fq0: GQ(b[2], Q()).clone(), W: null, air: false, u: 0, from: V(), to: V(), dur: 0.3, tl: 0 }; });
  const WING = [['L', M.wingL, 1], ['R', M.wingR, -1]].map(([id, n, sd]) => { const b = n.map(B); return { id, sd, b, q0: b.map(x => GQ(x, Q()).clone()), p0: b.map(wp) }; });
  const HY0 = LEG[0].ft0.y, H0 = wp(P.pel).y, SIZE = (() => { const b = new THREE.Box3().setFromObject(model); return { h: b.max.y - b.min.y, len: b.max.z - b.min.z }; })();
  /* 摺翅姿勢：每一節骨頭的方向＋「羽毛往後」那個方向改成往下（世界／身體座標），在站姿上算一次存起來 */
  const FOLD = [[[0.15, -0.25, -0.95], [0, -1, 0.1]], [[0.1, 0.0, 1.0], [0, -1, 0]], [[0.08, -0.12, -1.0], [0, -1, 0]]];
  for (const W of WING) { W.qf = []; resetPose();
    for (let k = 0; k < 3; k++) { const b = W.b[k], c = W.b[k + 1], d0 = wp(c).sub(wp(b)).normalize(), t0 = V(0, 0, -1).addScaledVector(d0, -V(0, 0, -1).dot(d0)).normalize();
      const f = FOLD[k], d1 = V(W.sd * f[0][0], f[0][1], f[0][2]).normalize(), t1 = V(f[1][0], f[1][1], f[1][2]); t1.addScaledVector(d1, -t1.dot(d1)).normalize();
      const m0 = new THREE.Matrix4().makeBasis(d0, t0, d0.clone().cross(t0)), m1 = new THREE.Matrix4().makeBasis(d1, t1, d1.clone().cross(t1)), R = Q().setFromRotationMatrix(m1.multiply(m0.invert()));
      setWQ(b, R.multiply(GQ(b, Q()))); W.qf.push(b.quaternion.clone()); } }
  resetPose();
  const ctl = { mode: '', t: 0, air: 0, alt: 0, fly: 'ground', ft: 0, ang: 0, flap: 0, pE: null, bob: 0, circ: 0, dT: 0 }, st = { t: 0 }, _w = V();
  const kf = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return lerp(v0, v1, e); } return keys[keys.length - 1][1]; };
  /* 11-27 Q2 r2：所有轉動都用身體自己的軸（盤旋時身體轉了方向，原本用世界軸＝脖子往旁邊／往下折，審核：盤旋時低頭）；所有姿勢參數每格平滑靠近目標，不會一格跳 */
  const BEAK = B('Bone_065'), FS = OPT.wingFS ?? 0.72;
  function wings(open, flapA, ax) { for (const W of WING) { for (let k = 0; k < 3; k++) { const b = W.b[k]; b.quaternion.copy(W.qf[k]).slerp(rest.get(b).q, open); b.updateMatrixWorld(true); } W.b[1].scale.setScalar(lerp(FS, 1, open)); W.b[1].updateMatrixWorld(true); }      /* 摺起來時前臂以外整片縮一點，羽毛不會從身側戳出來 */
    if (flapA) for (const W of WING) { rotW(W.b[0], ax, -W.sd * flapA); rotW(W.b[1], ax, W.sd * 0.35 * Math.max(0, -flapA)); } }
  function legIK(L, F, pole) { const s = wp(L.b[0]), d = F.clone().sub(s), Lm = L.l1 + L.l2; let dl = Math.min(d.length(), Lm * 0.995); const dir = d.normalize(), x = (L.l1 * L.l1 + dl * dl - L.l2 * L.l2) / (2 * dl), h = Math.sqrt(Math.max(0, L.l1 * L.l1 - x * x)), pl = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (pl.lengthSq() < 1e-8) pl.set(0, 1, 0); pl.normalize();
    const kn = s.clone().addScaledVector(dir, x).addScaledVector(pl, h); aim(L.b[0], L.b[1], kn); aim(L.b[1], L.b[2], s.clone().addScaledVector(dir, dl)); }
  const T0 = LEG.map(L => L.p2 = null);
  for (const L of LEG) { const p = L.b.map(wp); L.td0 = p[2].clone().sub(p[1]).normalize(); }      /* 站姿的跗蹠方向（腳掌朝向跟著它轉） */
  function footOri(L, toe, qB, rtB) { const d = wp(L.b[2]).sub(wp(L.b[1])).normalize(), base = qB.clone().multiply(L.fq0); if (toe === 'follow') { const r = Q().setFromUnitVectors(L.td0.clone().applyQuaternion(qB), d); setWQ(L.b[2], r.multiply(base)); } else setWQ(L.b[2], Q().setFromAxisAngle(rtB, toe * D2R).multiply(base)); }
  function update(o) { const dt = Math.min(0.05, Math.max(0, o.dt || 0)); st.t += dt; stage.updateMatrixWorld(true);
    const s0 = o.st | 0; stage.getWorldPosition(_w); const ws = V(); stage.getWorldScale(ws); const sW = ws.x || 1;
    if (!ctl.pE || _w.distanceTo(ctl.pE) > 3 * sW) { ctl.pE = _w.clone(); for (const L of LEG) L.W = null; }
    const v = dt > 0 ? _w.distanceTo(ctl.pE) / sW / dt : 0; ctl.pE.copy(_w); ctl.v = (ctl.v || 0) + (v - (ctl.v || 0)) * (1 - Math.exp(-dt / 0.15)); const vs = ctl.v;
    /* 飛行狀態機：地上 →（受驚）起飛：蹲 0.18 秒→蹬地爬升 → 飛 →（不逃了）盤旋 → 降落：張翅煞車、腳往前伸、著地 → 地上 */
    const flee = s0 === 7, dead = s0 === 6; ctl.ft += dt; const TK = 0.8, LD = 1.1;
    if (dead && ctl.fly !== 'ground' && ctl.fly !== 'fall') { ctl.fly = 'fall'; ctl.ft = 0; }
    if (ctl.fly === 'ground' && flee && !dead) { ctl.fly = 'take'; ctl.ft = 0; }
    else if (ctl.fly === 'take' && ctl.ft > TK) { ctl.fly = 'fly'; ctl.ft = 0; }
    else if (ctl.fly === 'fly' && !flee) { ctl.calm = (ctl.calm || 0) + dt; if (ctl.calm > 0.6) { ctl.fly = 'circ'; ctl.ft = 0; ctl.calm = 0; } }
    else if (ctl.fly === 'circ' && flee) { ctl.fly = 'fly'; ctl.ft = 0; }
    else if (ctl.fly === 'circ' && ctl.ft > (OPT.circT || 3)) { ctl.fly = 'land'; ctl.ft = 0; ctl.alt0 = ctl.alt; }
    else if (ctl.fly === 'land' && ctl.ft > LD) { ctl.fly = 'ground'; ctl.ft = 0; for (const L of LEG) L.W = null; }
    else if (ctl.fly === 'fall' && ctl.ft > 0.6) { ctl.fly = 'ground'; ctl.ft = 0; }
    if (ctl.fly !== 'fly') ctl.calm = 0;
    const ALT = OPT.alt || 2.6, f = ctl.fly, ft = ctl.ft;
    if (f === 'take') ctl.alt = ALT * 0.4 * sm(0.18, TK, ft) + 0.1 * sm(0.18, 0.3, ft); else if (f === 'land') ctl.alt = (ctl.alt0 ?? ALT) * (1 - sm(0, 0.8, ft)); else if (f === 'fall') ctl.alt *= Math.max(0, 1 - dt * 4); else ctl.alt += ({ ground: 0, fly: ALT, circ: ALT * 1.1 }[f] - ctl.alt) * (1 - Math.exp(-dt / 0.6));
    /* 平滑的姿勢參數 */
    const S = ctl.S || (ctl.S = { air: 0, open: 0, pitch: 0, nkF: 0, legT: 0, legF: 0, cr: 0, flapA: 0 }), tg = { air: 0, open: 0, pitch: 0, nkF: 0, legT: 0, legF: 0, cr: 0, flapA: 0 }, rk = {}, FP = OPT.flyP ?? 50;      /* 骨盆→胸的連線站姿 57° 往上：飛行轉 50° 接近水平（自檢：33° 時飛起來身體還是斜立的） */
    if (f === 'take') { if (ft < 0.18) { tg.cr = 1; tg.open = 0.5; tg.nkF = 0.3; rk.cr = 14; } else { tg.air = 1; tg.open = 1; tg.pitch = -FP * 0.55; tg.nkF = 1; tg.legT = sm(0.3, 0.6, ft); tg.flapA = 0.85; rk.open = 6; } }
    else if (f === 'fly' || f === 'circ') { tg.air = 1; tg.open = 1; tg.pitch = -FP; tg.nkF = 1; tg.legT = 1; tg.flapA = f === 'circ' ? 0.35 + 0.3 * Math.max(0, Math.sin(ft * 0.9)) : 0.7; }
    else if (f === 'land') { tg.air = ft < 0.8 ? 1 : 0; tg.open = ft < 0.95 ? 1 : 0.4; tg.pitch = ft < 0.8 ? -FP + 38 * sm(0.1, 0.6, ft) : 0; tg.nkF = 0.5; tg.legT = 0; tg.legF = ft < 0.8 ? sm(0.1, 0.5, ft) : 0; tg.flapA = ft < 0.4 ? 0.45 : ft < 0.85 ? 0.3 : 0; rk.open = 3; }
    else if (f === 'fall') { tg.air = 1; tg.open = 0.6; tg.pitch = -10; tg.flapA = 0.2; }
    for (const q in tg) S[q] += (tg[q] - S[q]) * (ctl.fc ? 1 - Math.exp(-(rk[q] || 5) * dt) : 1); ctl.fc = (ctl.fc || 0) + 1;
    resetPose(); root.position.set(0, 0, 0); root.quaternion.identity();
    /* 盤旋：繞著邏輯位置畫圓，身體朝切線、往圓心傾 */
    if (f === 'circ' || (f === 'land' && ctl.circ)) { const Rc = OPT.circR || 2.2, k = f === 'land' ? (ctl.circ0 ?? 1) * (1 - sm(0, 0.8, ft)) : sm(0, 1, ft); if (f === 'circ') ctl.circ0 = k; ctl.ang += dt * 1.1 * Math.max(k, 0.2); ctl.circ = k; root.position.x = Rc * k * (Math.cos(ctl.ang) - 1); root.position.z = Rc * k * Math.sin(ctl.ang); root.quaternion.setFromAxisAngle(V(0, 1, 0), -ctl.ang * k).multiply(Q().setFromAxisAngle(V(0, 0, 1), -0.35 * k)); } else { ctl.circ = 0; ctl.ang = 0; }
    const qB = root.quaternion.clone(), fwdB = V(0, 0, 1).applyQuaternion(qB), upB = V(0, 1, 0).applyQuaternion(qB), rtB = V(-1, 0, 0).applyQuaternion(qB);
    /* 倒地：腳軟（跗蹠往前折、坐下）→ 身體往一側倒、脖子垂到地上、翅膀半開 */
    const du = dead ? (o.stT || 0) : 0, d1 = dead ? sm(0, 0.5, du) : 0, d2 = dead ? sm(0.35, 1.0, du) : 0, d3 = dead ? sm(0.2, 0.9, du) : 0, side = ctl.dSide || (ctl.dSide = Math.random() < 0.5 ? 1 : -1);
    if (!dead) ctl.dSide = 0;
    if (dead) root.quaternion.premultiply(Q().setFromAxisAngle(fwdB, side * 45 * d2 * D2R));
    root.position.y = ctl.alt - 0.06 * S.cr - (OPT.stgB && s0 === 5 ? OPT.stgB.dip * Math.sin(Math.PI * clamp((o.stT || 0) / 0.5, 0, 1)) : 0);      /* 11-27 S1 OPT.stgB：被打時蹲一下（dip 公尺）、身體往後仰 p 度、翅膀張開 w、脖子往後縮 nk 度（原本 12°／0.5／30° 看不出被打） */ root.updateMatrixWorld(true);
    let pitchB = S.pitch + (s0 === 5 ? (OPT.stgB ? OPT.stgB.p : 12) * Math.exp(-(o.stT || 0) * 3) * Math.min(1, (o.stT || 0) * 20) : 0) - 8 * S.cr;
    rotW(P.pel, rtB, pitchB * D2R);
    if (dead) { root.updateMatrixWorld(true); const py = Math.min(wp(P.pel).y, wp(P.sp[P.sp.length - 1] || P.pel).y); root.position.y += lerp(py, 0.17, d1) - py; root.updateMatrixWorld(true); }      /* 倒地：身體落到地上（骨盆離地約一個身體半徑） */
    /* 拍翅：頻率隨狀態，振幅＝平滑後的 flapA */
    const fr = f === 'take' ? 4.0 : f === 'land' ? 3.6 : f === 'circ' ? 1.6 : 2.6; ctl.flap += dt * fr * 2 * Math.PI;
    const stg = s0 === 5 ? Math.exp(-(o.stT || 0) * 3) : 0;
    wings(dead ? 0.08 * d3 : Math.max(S.open, (OPT.stgB ? OPT.stgB.w : 0.5) * stg), S.flapA * Math.sin(ctl.flap) + 0.5 * stg * Math.sin((o.stT || 0) * 18) * Math.exp(-(o.stT || 0) * 4), V(0, 0, 1).applyQuaternion(root.quaternion));
    /* 走路點頭（每一步：站著那段頭留在空中、脖子慢慢收，跨步時一伸追上）；飛行縮成 S；倒地垂下 */
    const nk = P.nk, g = ctl.gp ?? 1, walkK = f === 'ground' && !dead ? Math.min(1, vs * 2.5) : 0, hb = walkK * (g < 0.65 ? -1 + 2 * (g / 0.65) : 1 - 2 * sm(0.65, 1, g));      /* hb：+1＝脖子收到最後、-1＝伸出去 */
    const look = f === 'ground' && vs < 0.1 && !dead ? 35 * Math.sin(st.t * 0.5) * sm(0.5, 0.8, Math.sin(st.t * 0.23) * 0.5 + 0.5) : 0;
    if (nk[0]) { rotW(nk[0], rtB, (10 * hb + S.nkF * 68 - 40 * d3 + 10 * S.cr) * D2R); rotW(nk[0], upB, look * 0.5 * D2R); }
    if (nk[2]) rotW(nk[2], rtB, (-6 * hb - S.nkF * 92 - 25 * d3) * D2R); if (nk[4]) { rotW(nk[4], rtB, (S.nkF * 35 - 10 * d3) * D2R); rotW(nk[4], upB, look * 0.5 * D2R); }
    if (s0 === 5 && nk[1]) rotW(nk[1], rtB, -(OPT.stgB ? OPT.stgB.nk : 30) * stg * D2R);
    root.updateMatrixWorld(true);
    /* 頭的朝向：空中／降落時鳥嘴對著身體前方略往下（脖子怎麼折都不會低頭朝地）；地上照站姿 */
    if (P.hd && BEAK) { const bd = wp(BEAK).sub(wp(P.hd)).normalize(), aw = Math.max(S.air, d3); if (aw > 0.01) { const want = dead ? V(fwdB.x, 0, fwdB.z).normalize().addScaledVector(V(0, -1, 0), 0.15).normalize() : fwdB.clone().addScaledVector(upB, -0.12).normalize(), wq = GQ(P.hd, Q()).premultiply(Q().setFromUnitVectors(bd, bd.clone().lerp(want, aw).normalize())); setWQ(P.hd, wq); } }
    root.updateMatrixWorld(true);
    /* 腳：地上＝兩腳嚴格輪流（下一隻＝上一次沒跨的那隻），每隻釘在世界、跨到身體前方；空中往後伸直（腳掌順著跗蹠）；降落前往前下伸 */
    const Ts = clamp(0.5 - vs * 0.08, 0.28, 0.5), lead = clamp(vs * Ts * 0.8, 0, 0.32);
    if (ctl.nx == null) ctl.nx = 'L';
    let anyAir = false; for (const L of LEG) if (L.air) anyAir = true;
    for (const L of LEG) { const hip = wp(L.b[0]), Lm = L.l1 + L.l2;
      const home = V(L.sd * Math.abs(L.ft0.x), HY0, L.ft0.z); let Fg;
      if (!L.W) L.W = stage.localToWorld(home.clone());
      if (f === 'ground' && !dead) {
        if (!L.air) { const p = stage.worldToLocal(L.W.clone()), d = Math.hypot(p.x - home.x, p.z - home.z), other = LEG.find(o2 => o2 !== L), gap = st.t - (other.tl || 0);
          const go = vs > 0.05 ? (ctl.nx === L.id && !other.air && gap > Ts * 0.35 && (d > 0.03 || p.z < home.z - 0.02)) : (!other.air && d > 0.1 && gap > 0.15);
          if (go && !anyAir) { L.air = true; anyAir = true; L.u = 0; L.from.copy(p); L.dur = Ts; ctl.nx = other.id; } }
        if (L.air) { L.u = Math.min(1, L.u + dt / L.dur); const tgt = home.clone().add(V(0, 0, lead)), e = L.u * L.u * (3 - 2 * L.u); Fg = L.from.clone().lerp(tgt, e); Fg.y = HY0 + 0.13 * Math.sin(Math.PI * L.u); if (L.u >= 1) { L.air = false; L.tl = st.t; L.W = stage.localToWorld(V(Fg.x, HY0, Fg.z)); } }
        else { Fg = stage.worldToLocal(L.W.clone()); Fg.y = HY0; }
      } else { if (S.air > 0.5 && !dead) L.W = null; Fg = L.W ? stage.worldToLocal(L.W.clone()) : home.clone(); Fg.y = HY0; L.air = false; }      /* 飛起來以後不再記著起飛前踩的位置（降落時腳才會落在身體下面） */
      let Fx = Fg;
      if (S.legT > 0.001 || S.legF > 0.001) { const tr = hip.clone().addScaledVector(fwdB, -0.97 * Lm).addScaledVector(upB, -0.12 * Lm), fw = hip.clone().addScaledVector(fwdB, 0.25 * Lm).addScaledVector(upB, -0.9 * Lm); const pin = Fg.clone(); if (hip.distanceTo(pin) > Lm) pin.copy(hip).addScaledVector(pin.clone().sub(hip).normalize(), Lm); Fx = pin.lerp(tr, S.legT).lerp(fw, S.legF); }
      else if (f !== 'ground' || dead) { const pin = Fg.clone(); if (hip.distanceTo(pin) > Lm) pin.copy(hip).addScaledVector(pin.clone().sub(hip).normalize(), Lm); Fx = pin; }
      if (dead) { const sitF = hip.clone().addScaledVector(fwdB, 0.35 * Lm); sitF.y = Math.max(0.03, Math.min(sitF.y, 0.03 + 0.1 * (1 - d2))); Fx = Fx.clone().lerp(sitF, d1); }
      legIK(L, Fx, (S.legT > 0.5 ? upB.clone() : fwdB.clone().negate()));
      footOri(L, S.legT > 0.02 || S.legF > 0.02 || dead ? 'follow' : (L.air ? -45 * Math.sin(Math.PI * L.u) : 0), qB, rtB); }
    /* 步伐進度（給點頭）：從上一次落地到現在，佔一步的幾成 */
    { const tl = Math.max(...LEG.map(L => L.tl || 0)); ctl.gp = clamp((st.t - tl) / (Ts * 1.2), 0, 1); }
    /* 倒地：身體落到地上（骨盆離地約一個身體半徑）、頭貼地 */
    if (dead) { root.updateMatrixWorld(true);
      { const ax = V(0, 0, 1).applyQuaternion(root.quaternion); for (const W of WING) { const tip = W.b[3] || W.b[2]; let sg = 1; for (let it = 0; it < 8; it++) { const y0 = wp(tip).y, ref = wp(P.pel).y + 0.12; if (y0 <= ref) break; rotW(W.b[0], ax, sg * 7 * D2R); root.updateMatrixWorld(true); if (wp(tip).y > y0) { rotW(W.b[0], ax, -sg * 7 * D2R); root.updateMatrixWorld(true); if (it === 0) sg = -1; else break; } } } }      /* 倒地：翅尖高過背就繞身體長軸往下壓（審核：上側翅膀朝天翹） */
      if (P.hd && nk[0]) for (let it = 0; it < 4; it++) { const hp = wp(P.hd), hy = hp.y, lim = 0.16 + 0.6 * (1 - d3); if (hy >= 0.06 && hy <= lim) break; const a = hp.sub(wp(nk[0])), ax = a.clone().cross(V(0, -1, 0)); if (ax.lengthSq() < 1e-8) break; ax.normalize(); rotW(nk[0], ax, (hy < 0.06 ? -Math.min(12, (0.06 - hy) * 150) : Math.min(14, (hy - lim) * 90)) * D2R); root.updateMatrixWorld(true); } }      /* 頭往地面的方向轉（身體翻了也對）：頭高在 6 公分～上限之間 */
    for (const t of P.tl) rotW(t, rtB, (S.air * -10 + (dead ? 10 : 0)) * D2R);
    ctl.mode = dead ? 'dead' : s0 === 5 ? 'stag' : f !== 'ground' ? f : vs > 0.05 ? 'walk' : 'idle'; ctl.dT = ctl.mode === ctl.pm ? ctl.dT + dt : 0; ctl.pm = ctl.mode; root.updateMatrixWorld(true); }
  return { stage, root, model, update, SIZE, RB: { bird: true }, LEGS: [], INR: {}, ctl, get mode() { return ctl.mode; } };
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
  boar: { glb: 'boar_rig_2k', opt: { chg: true, tusk: true, strK: { walk: 0.85, trot: 0.85 }, cadMax: 2.6, sxMax: 1.0, kd: true }, fx: { sat: 1.3, gain: 1.8, gam: 0.75, tint: [1.1, 0.95, 0.84] } },
  bison: { glb: 'bison_rig_2k', opt: { hkH: 10, cuV: true, rmG: { cad: 0.85, sx: 4.6, lf: 0.4, lh: 0.5, sf: 0.3, sb: 0.1, gy: 0.06, ld: -0.05 }, wnM: true, hkR: 0.5, hsR: true, hsMin: 0.8, gY: 0.015, stB: 0.04, ldF: 0.15, swLo: true, anat: { k: 0.75, wLo: -3, wHi: 6, eF: 45 }, prG: true, vyMax: 170, vyAtk: 1.2, hkUp: 0, hkY: 0.7, hkP: 0.4, hkF: 0.35, gK: { bob: 0.6, crouch: 0.5, pitchA: 0.7 }, ramV2: true, rmHold: true, legc: true, fSkip: 1, chg: true, rgT: true, chN: 12, chH: 6, hook: true, daze: true, kk: { p: 22, u: 0.30, b: 0.46, nk: 14, k0: 0.7 }, scrK: 1.5, hdF: 0.05, kd: true, kdG: true, kdU: 40, kdFold: 0.85, strK: { walk: 0.85, trot: 0.85 }, cadMax: 2.5, sxMax: 1.6, rbStart: true }, fx: { sat: 1.05, gain: 1.1, gam: 0.9, tint: [1.02, 0.96, 0.96] } },      /* 11-26 野牛（Meshy 新模型，56 骨：臉部輔助骨 head_01～08、下顎、腳多一節）；?bison=20 開 */
  ibex: { glb: 'ibex_rig_2k', opt: { anat: { k: 0.7, wHi: 8, eF: 55 }, cuT: { vy: 3.5, lat: 1.2, bk: 0.5, k: 1.2, rr: 1.02, dz: 1.6, gm: 0.02, lx: 0.2 }, stagX: true, qWalk: true, rmPl: { h: 0.035, d: 0.6, fw: true, rr: 1.02, gm: 0.02, sw: 0.28 },      /* 11-27 A3：stagX（被打後退量切逃跑時交給外觀位置）、cuT.vy 2.5→3.5＋例外門檻 rr／dz／gm（逃跑第一步不再四腳同格起步；轉身中段不拖腳）、rmPl.fw／rr／gm／sw（衝撞收招同對不同時懸空、擺盪 ≤0.28 秒）；雲端 A/B 見交接「A3 更新」 */ swHmin: 0.12, swQ: true, rmStop: true, prC: true      /* 11-27 A1 prC：站定跨步時同一對（兩前、兩後）不同時懸空（衝撞收招停住後兩後腳一起抬 7 格） */      /* 11-27 A1：swSk [0.5, 0.55]／swHz [0.75, 0.8] 拿掉（swSk 造成貼地滑進去），改 swQ（smootherstep 水平＋頂點 0.42 後放下＋後段落點固定） */      /* （舊註）奔跑前腳擺盪只有約 3 格，落地前一格 u≈0.63，指數 0.4 時高度約最高點的 26% */, cuS: true, gK: { pitchA: 0.6, bob: 0.7, crouch: 0.6, liftF: 0.65 }, vyMax: 240, latC: 1.3, stagD: 0.9, stagAl: true, stagZ: 1, stagR: 0.9, stagBk: { a: 0.42, t: 0.75 }, stagP: 0.6      /* 11-27 A1：stagP 1.4→0.6（前半身抬 21° 加上往後坐，前腳搆不到地、在空中晃 0.6 秒） */, reachK: 0.93, trkW: [1.7, 1.2], kdAn: { wHi: 130, wSw: 130 }, ramV2: true, rbStart: true, flkS: true, cadMax: 2.4, sxMax: 1.6,      /* 11-27 Q1：奔跑步頻 3.2 倍時一步只有 0.16 秒（30fps 不到 5 格、擺盪 3 格），腳從收起到伸直要一格做完，限速一擋就落地前還在 0.3～0.4 高；步頻降到 2.4、步幅放到 1.6（GPT：快跑步頻 1.3～1.5 倍、步幅 1.15～1.3 倍，遊戲速度是 root 速度） */ flk: 0.55, flkA: 1.8, nkDn: 10, lookK: 0.5, rmHold: 16, fSkip: 1, chg: true, chgA: 'ram', noPaw: true, chN: 30, chH: 18, butt: { rear: 2.2 }, nodK: 0.35, idleA: 'flee', hdF: true, kd: true, kdG: true, kdFold: 0.9, kdH: 0.03 }, fx: { sat: 1.25, gain: 1.8, gam: 0.85, tint: [1.14, 0.97, 0.85] } },      /* 遊戲燈光下對美術圖：身體中間調 (118,94,87)／圖 (128,106,97)，亮部 (192,169,157)／圖 (195,168,150) */      /* 11-26 岩羊（Meshy 新模型，42 骨、前腳 6 節含肩胛、有下顎、head_01/02 輔助骨）；?ibex=20 開 */
  porc: { glb: 'porc_rig_2k', opt: { anat: { k: 0.65, wLo: -10, wHi: 15, eSt: 8, eSw: 25 }, cuS: true, reachK: 0.9, stagH: true,      /* 11-27 P1：拿掉 vyMax 40（外觀轉向每秒只轉 40 度，錄到倒衝開始時外觀還落後遊戲朝向 158 度、豎刺中途身體自己轉 30 度腳被扭開；被打的「被拖著轉」用固定鏡頭確認是鏡頭甩，不是身體轉） */ pbCad: [3.6, 1.6], stagN: 0.4, qHold: true, stagZ: 0.5, kdTs: 1.6, kdAng: 72, pawK: 0.5, swPit: { F: 0.4, H: 0.35 }, stagD: 1.8, stagAl: true, fSkip: 1, kd: true, kdG: true, kdRoll: 0.55, porcM: { bs: 1, hs: true, bY: -0.03, bH: true, kW: { z: 0.02, y: -0.06, p: -4, hold: true }, kP: -3 }, hsR: true      /* 11-27 P1：命中停頓時動作照真實時間（同野鹿、野牛的 hsR）；不開的話姿勢平滑濾波用 0.06 倍 dt，炸開抬頭到一半卡 2 格 */, gK: { roll: 2.4, yaw: 1.8, bob: 0.6, liftF: 0.55, liftH: 0.55 }, cadMax: 1.5, sxMax: 1.5      /* 11-27 Q1：箭豬腿短，奔跑抬腳高度照通用值會把腳收到肚子、落地前一格還離地 0.1～0.2；抬腳高度 ×0.55、步頻上限 1.5 */, strK: { walk: 0.75, trot: 0.8 } }, fx: { sat: 1.1, gain: 2.0, gam: 0.8, tint: [1.08, 0.97, 0.9] } },      /* 11-26 箭豬（Meshy 新模型，46 骨、蹠行；前腳從 frontUpr 起算：肩→肘→腕→掌→趾）；?porc=20 開 */
  monkey: { glb: 'monkey_rig_2k', opt: { anat: { k: 0.5, wLo: -10, wHi: 15, eSt: 8, eSw: 20, eF: 60 }, swQ: { hx: 0.8 }      /* 11-27 M1：hx 見 smq 那一行 */      /* 11-27 A1：swSk [0.5, 0.55]／swHz [0.75, 0.8] 拿掉（手腳貼地往前滑 60～70px 的來源之一），改 swQ；reachK 在 swQ 下改對落地時的肩膀位置量 */, swPit: { F: 0.5, H: 0.6 }      /* 11-27 Q1：猴子手指長，擺盪時手掌往下翻，解算為了指尖不擦地把掌根抬高 0.06～0.09（LD2 的 up），落地前一格就顯得很高；手掌少翻一點 */, rlUp: { H: 1 }      /* 11-27 M1：見 rlUp（m02 左後腳擺盪中段被壓到貼地） */, cuS: true, reachK: 0.93, tWrap: -175, tdSm: 1.6, stagD: 1.6, stagAl: true, sxMax: 1.05, cadMax: 2.1,      /* 11-27 Q1 審查（m02 前臂一格甩 55～65°）：猴子腿短、奔跑步頻 2.4 倍時一步只有 6 格、擺盪 4 格就要把前臂收起再伸出去；步頻降到 1.8 倍、步幅放到 1.35 倍 */ snapK: { z: 1.5, jaw: 1.6 }, snapLd: [[0, 0], [0.75, 0.75, 'l'], [1.0, 1.12, 'l'], [1.5, 1.5, 'l'], [3, 3, 'l']], fSkip: 1, monk: true, gK: { pitchA: 2.0, roll: 1.6, bob: 1.2, crouch: 1.6, liftF: 0.6, liftH: 0.7 }, tailUp: -0.2, tailSw: 1.8, hdF: true, kd: true, kdG: true, kdFold: 0.3, kdU: 20, kdFB: -40, kdDrape: { F: 0.25, H: 0.3 } }      /* 11-27 Q1 審查：倒地後手掌翻成掌心朝外（kdFold 把腕往回折 150°×0.6）、上側手臂橫過臉（kdU 58°）：折腕減半、上側手臂垂下搭在下側 */, fx: { sat: 1.05, gain: 1.45, gam: 0.88, tint: [1.1, 0.97, 0.88] } },      /* 11-27 Q1 審查：對 Meshy 渲染圖（上傳區 8e0d25db／fa805aa4，中位 (113,74,50) 色相 21° 飽和 0.56）：原本 sat 0.8 把頭冠的橘、手臉的粉都洗掉；sat 1.15／gain 1.6 時遊戲內 (154,95,56) 飽和 0.64 偏亮偏飽和，取中間 */      /* 11-27 Q1 遊戲燈光下對模型原貼圖：貼圖中位 (142,100,65) 色相 19° 飽和 0.47；gain 1.35 時遊戲內 (129,89,66)／19°／0.48 偏暗，1.5 補亮、飽和不加 */      /* 11-26 果脊猴（Meshy 新模型，44 骨、四足犬科綁骨、蹠行、長尾 10 節、無耳骨）；?monkey=20 開 */
  ape: { glb: 'gorilla_rig_2k', opt: { apeV2: true, reachK: 0.92, cuS: true, cuA: 0.8, apeLP: 0.07, apeHo: 0.2, apeHoA: 0.32, cuA2: 0.9, apeHR: 0.93, apeM: true, ctDur: 1.8, prG: true, prC: true, swLo: true, swPit: { F: 0.6, H: 0.4 }, legPick: { H: [0, 1, 2, 3, 5] }, anat: { k: 0.6, wLo: -8, wHi: 12, cu: 0.85 }, gK: { liftF: 0.8, bob: 0.8 }, strK: { walk: 0.9, trot: 0.85, gallop: 0.8 }, cadMax: 2.4, sxMax: 1.1, vyMax: 150, hdF: true, kd: true, kdG: true, headSK: 0.3 }, fx: { sat: 0.8, gain: 2.5, gam: 0.82, tint: [1.1, 1.0, 0.82] } },      /* 顏色：對照 producer-1118/cut/12、13-猩猩（中性炭灰，中位數約 60），原本偏黑偏藍 */      /* 11-27 猩猩（Meshy joint_01～46，GLB 已改名成犬科骨架名：肩關節當 clavicle、手當前腳掌、指節當前腳尖；後腳挑 髖→膝→踝→腳掌→腳趾；腳掌、手的皮原本掛在小腿／前臂上，已搬給踝／腕；背部貼圖已畫成銀背）；?ape=20 開 */
  heron: { glb: 'heron_rig_2k', bird: true, opt: { bird: { pelvis: 'Bone_001', spine: ['Bone_004', 'Bone_003', 'Bone_002'], neck: ['Bone_021', 'Bone_020', 'Bone_019', 'Bone_018', 'Bone_017'], head: 'Bone_016', tail: ['Bone_007', 'Bone_006'], legL: ['Bone_011', 'Bone_010', 'Bone_009'], legR: ['Bone_015', 'Bone_014', 'Bone_013'], wingL: ['Bone_029', 'Bone_028', 'Bone_027', 'Bone_026'], wingR: ['Bone_025', 'Bone_024', 'Bone_023', 'Bone_022'] }, stgB: { p: 22, w: 0.9, nk: 45, dip: 0.05 } }, fx: { sat: 0.95, gain: 1.3, gam: 0.88 } },      /* 11-27 灰翎鷺（Meshy 智慧綁定 67 骨 Bone_000～066，翅膀是張開的）：鳥類模式 makeBird；?heron=20 開 */
  python: { glb: 'python_rig_2k', snake: true, byLen: true, size: 0.8, opt: { trn: { still: 40 }, dRoll: 55 }, fx: { sat: 1.0, gain: 1.3, gam: 0.88 } },      /* 11-27 沼蟒（Meshy 智慧綁定 14 骨一串，頭是根骨）：蛇形滑行 makeSnake；?python=20 開 */
  croc: { glb: 'croc_rig_2k', opt: { crocM: { rs: 1, eLim: -0.04, tl: { sw: 0.06, dM: 0.22 }, yO: { dash: -0.09, snap: -0.02, stag: 0 }, bfY: -0.035, dZ: 0.5, dCh: 0.3, rBl: 0.3, dsY: -0.03, dBl: 0.25, sgR: 0.15, sgY: 0.4, gT: [1.9, 2.6], tuck: { hold: 1, F: [[0.12, -0.3, -0.9], [0.06, -0.25, -1], [0.03, -0.2, -1], [0, -0.15, -1]], H: [[0.15, -0.3, -0.85], [0.06, -0.25, -1], [0.03, -0.2, -1], [0, -0.15, -1]] }, snS: true, hR: true, vyA: 160, dsP: 0, iP: 0.3, tSeg: 0, pgU: true }, ctDur: 1.8, prG: true, prC: true, swLo: true, cuS: true, twStep: 0.28, inrK: { look: 0.4, bend: 0.4 }, tdSm: 0.8, neckK: 0.5, snapNk: -0.6, snapNY: 1.6, stagP: 0.2, stagR: 0.4, stagY: 0.4, snapY: 0.15, snapK: { z: 0.3 }, snapLd: [[0, 0], [1, 1.071, 'l'], [2, 1.5, 'l'], [3, 3, 'l']], vyAtk: 0.8, headSK: 0.5, fSkip: 1, anat: { k: 0.6, wLo: -8, wHi: 14, cu: 0.85 }, kd: true, kdG: true, kdAng: 20, hdF: 0.03, tailSw: 1.8, tup: 3, tupK: 0, tailK: 0.3, tailUp: 0.12, gK: { yaw: 4, roll: 1.5, bob: 0.4, liftF: 0.6, liftH: 0.6 }, strK: { walk: 0.8, trot: 0.75, gallop: 0.7 }, cadMax: 2.0, sxMax: 1.2, swPit: { F: 0.4, H: 0.4 }, vyMax: 80 }, fx: { sat: 1.0, gain: 1.4, gam: 0.85 }, size: 1.3 },      /* 11-27 鱷魚（Meshy 另一種骨架 joint_01～64，GLB 已照世界座標改名成犬科骨架名，對照見 eng/q2/croc_ed.json）；?croc=20 開 */
  capy: { glb: 'capy_rig_2k', opt: { tiltV: true, prU: 0.8, kdSd: -1, anat: { k: 0.7, cu: 0.85 }, ctDur: 1.8, prG: true, prC: true, swLo: true, fSkip: 1, legPick: { F: [0, 1, 4, 5, 6], H: [0, 2, 3, 4, 6] }, gK: { liftF: 0.6, liftH: 1.0, bob: 0.45, pitchA: 0.4 }, headSK: 0.22, vyMax: 70, latC: 1.3, kSm: true, kdAng: 48, kdDrape: { F: 0.6, H: 1.0, Fe: 30, He: 65 }, kdFoldK: 0.55, kdTw: 14, kdTs: 1.4, kdU: 30, twStep: 0.2, inrK: { look: 0.4, bend: 0.4 }, kdFit0: 1, stagP: 0, stagY: 0.8, stagN: 0.7, stagZ: 0.65, stagR: 1.3, stagD: 1.5, stagAl: 1.6, lookK: 0.6, swPit: { H: 0.35 }, strK: { walk: 0.9, trot: 0.95, gallop: 1.0 }, cadMax: 1.5, sxMax: 1.35, kd: true, kdG: true, kdFold: 1, kdHold: true, kdSk: 0.03, kdPl: 0.5, kdNoB: true, kdTT: true, kdRoll: 0.7, hdF: true }, fx: { sat: 0.9, gain: 1.5, gam: 0.85 } },      /* 腿短身體圓：步態抬腳低、步幅短步頻高（gK／strK／cadMax 同野豬的做法），奔跑前腳不再折進胸口的毛裡 */      /* 11-27 潮背水豚（Meshy 52 骨，四足犬科：GLB 已把左後腳的 tail1 改名 rearUpr.L、主骨鏈排第一；前腳 frontUpr→Lwr→(_04,_05 前臂輔助)→腕 horselink→掌 foot→趾，後腳 Upr→(R_02 膝前輔助)→Lwr 膝→飛節→掌→(_06)→趾）；?capy=20 開 */
  bear: { glb: 'bear_rig_2k', opt: { anat: { k: 0.65, wLo: -8, wHi: 12, eSt: 8, eSw: 25 }, cuS: true, bearM: true, prG: true, stagH: true, swBy: 0.35, swNk: 14, swY: 1.35, swXo: 1.35, swZr: 0.6, swYr: 1.5      /* 11-27 R1 橫掃：蓄力時掌舉到肩膀上方、掌心朝鏡頭像搭在肩上（swY 1.7→1.35、往外 swXo 1.35）；掃完前臂平貼地往前伸（收掌點往前 ×0.6） */, trkW: [1.25, 1.1], chRock: 1, tdSm: 1.6, kdDrape: { F: 0.5, H: 0.5, Fe: 45, He: 25 }      /* 11-27 R1 倒地：上側前掌原本伸到臉前、掌心朝鏡頭直立（像玩偶）；肘腕放鬆彎起、掌收在胸前；上側後腳膝也彎一點 */, chg: true, chgA: 'charge', noPaw: true, chN: 10, chH: 6, ramV2: true, rbStart: true, vyMax: 220, pawK: 0.3, swPit: { F: 0.15, H: 0.2 }, hdF: true, kd: true, kdG: true, kdFold: 0.5, kdSd: -1, kdNoB: true, gK: { pitchA: 0.7, roll: 1.4, yaw: 1.3, bob: 0.8 }, strK: { walk: 0.8, trot: 0.85 } }, fx: { sat: 0.9, gain: 0.8, gam: 0.9, tint: [1.2, 0.89, 0.95] } },      /* 11-27 R1 顏色：colshotR（向陽面、天氣固定、GD 11）sat 0.9／gain 0.8／gam 0.9／tint [1.2,0.875,0.95] 時上半身 (140,80,58)、飽和 0.58、紅綠比 1.75（目標 (141,83,60)／0.58／1.70），綠再補一點；舊值 sat 1.15 gain 1.5 時向陽面 (189,113,71) 太亮偏橘 */      /* 11-27 R1 倒地：kdSd -1 倒向右側（背朝鏡頭，原本肚子和四隻腳掌心朝鏡頭、前掌直立像玩偶）、kdNoB 翻到底不回彈 */      /* 11-27 Q1 審查：美術圖上半身 (141,83,60)、飽和 58%、紅/綠 1.70；原本 1.40，紅與飽和拉回 */      /* gain 1.85 時 colshot (103,66,51)／18°／0.46，再補亮一點 */      /* 11-27 Q1：colshot 原本沒固定天氣（跟真實時鐘走），前兩次量的亮度不能比；固定後 gain 1.3 時遊戲內 (81,53,46)／13°／0.41，對美術圖 (118,78,63)／16°／0.47 → 補亮、少一點藍 */      /* 11-27 Q1 審查：對美術圖 d8-art/ref/bear/棕熊-A（中位 (118,78,63) 色相 16° 飽和 0.47）。colshot 固定朝向：gain 1.8 時 (145,99,69)／24°；gain 1.45 時 (131,82,59)／20°／0.52，仍偏亮偏橘 → 再降亮、往紅棕拉 */      /* 遊戲燈光下對模型原貼圖：貼圖中位 (119,79,56) 色相 23° 飽和 0.48；gain 1.5／sat 1.0 時遊戲內 (90,59,42)／22°／0.52 偏暗偏飽和 */      /* 11-27 Q1 棕熊（Meshy 新模型，43 骨、四足犬科綁骨、蹠行；兩前腳最後一節名字不同 frontLegL_05／frontFootR、位置對稱；後腳綁定姿勢右膝比左膝前 6 公分）；?bear=20 開 */
  deer: { glb: 'deer_rig_2k', opt: { smTc: true, cuR: true, prS: true, hsR: true, ovL: true, hsMin: 0.8, limF: 1.35, rpF: 1.0, fSink: { r: 0.95, max: 0.55, k: 1.3 }, offW: { LH: 0, LF: 0.3, RH: 0.5, RF: 0.8 }, gY: 0.015, stB: 0.045, ldF: 0.15, kdNoB: true, kdH: -0.06, rmHk: 1.0, swLo: true, elbIns: { u: 0.6, bl: 0.09, r: 0.32 }, anat: { k: 0.65, eF: 50 }, prG: true, stlN: 8, vyAtk: 1.2, stagAlK: 2.5, gK: { bob: 0.45, crouch: 0.15, pitchA: 0.7 },      /* 審核：奔跑撐地前肘超過 55°——身體起伏、下蹲壓小 */ stagAl: true, stagD: 1.8, stagP: 0.6, stagZ: 1.2, chg: true, noPaw: true, chN: 46, chH: 30, kk: { p: 30, u: 0.40, b: 0.48, cr: 0.6, k0: 0.6, pc: [[0, 0], [0.75, -5, 's'], [1.45, -30, 's'], [2.1, -16.5, 's'], [2.8, 0, 's']], yc: [[0, 0], [0.75, -0.06, 's'], [1.45, 0.06, 's'], [2.4, 0, 's']] }, kd: true, kdG: true, kdFold: 1, kdTuck: 0.55, kdRoll: 0.7, hdF: true, ramV2: true, kSm: true, latC: 1.3, vyMax: 260, cadMax: 2.4, sxMax: 1.05, startle: true }, fx: { sat: 0.85, gain: 1.35, gam: 0.85, tint: [1.0, 0.95, 0.9] } } };      /* 11-26 野鹿（Meshy 新模型，35 骨、前腳 4 節）；?deer=20 開 */      /* 11-26 野豬（Meshy 新模型，37 骨、無下顎骨）；?boar=20 開 */
/* 11-27 A1 錄影對照用：網址 &xopt=<物種>:<URL 編碼 JSON> 覆蓋該物種 opt 的幾個鍵（值 null＝刪掉該鍵）；沒帶這個參數時完全不影響 */
if (typeof location !== 'undefined') for (const m of location.search.matchAll(/[?&]xopt=([a-z]+):([^&]*)/g)) { try { const o = JSON.parse(decodeURIComponent(m[2])); if (SPEC[m[1]]) for (const k in o) { if (o[k] === null) delete SPEC[m[1]].opt[k]; else SPEC[m[1]].opt[k] = o[k]; } } catch (e) { console.warn('[xopt]', e); } }
const QS0 = typeof location !== 'undefined' ? location.search : '', ON = {}; for (const k in SPEC) ON[k] = new RegExp('[?&](' + k + '=20|meshy=1)(&|$)').test(QS0);
if (/[?&]tiger=21(&|$)/.test(QS0)) { SPEC.tiger = { glb: 'tiger_rig_2k', opt: { swF: SWF, swP: SWP, rg: { flex1: 75, flex2: 65, rollOver: 45, rollC: 12 }, tup: TLM, tupK: TUK, tailK: 0.6, swXo: 2.3, swXi: -0.4, swZ: 1.7, swDr: 0.2, swPw: 0.35, swBy: 0.45, swNk: -16, swY: 0.72, swYr: 0.45, swZr: 0.6, faceR: 0.45, pReachUp: -0.32, neckK: 0.55, tdl: 45, stagNY: 0.5 }, fx: { sat: 1.0, gain: 1.6, gam: 0.78, tint: [1.1, 0.92, 0.85] } }      /* 遊戲燈光下對美術圖：色相 27°（圖 26°）、飽和 0.69（圖 0.69） */; ON.tiger = true; }      /* ?tiger=21：猛虎換成 Meshy 猛虎（11-25 新模型；引擎參數一個都沒改） */
export const LYNX20 = Object.values(ON).some(Boolean);
const proto = {}, bad = {};
/* 11-27 各物種專用引擎（製作人要求：一隻修好後，改主引擎不能再影響牠）：審核全部通過的物種，整份引擎＋牠的參數凍結成 js/rig/<物種>.js（img3d/eng/freeze.sh 產生），清單在 js/rig/list.json。
   有凍結檔的物種一律用自己那份的 makeRig／makeSnake／makeBird 和參數；這個主檔之後怎麼改都碰不到牠。凍結檔載入失敗＝這隻不顯示新模型（不退回主引擎，免得用到沒審過的版本）。 */
const FROZ = {}, FZW = {}; let FZL = null;
const FZP = typeof window === 'undefined' || /[?&]nofrz=1(&|$)/.test(QS0) ? Promise.resolve([]) : fetch('js/rig/list.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []);
FZP.then(L => { FZL = Array.isArray(L) ? L : []; for (const k of FZL) if (ON[k]) { FZW[k] = true; import('./rig/' + k + '.js').then(M => { FROZ[k] = M; }).catch(e => { bad[k] = true; console.warn('[lynx20] 凍結引擎載入失敗', k, e && e.message); }); } });
const loadTex = async (g, T) => { if (!T) return; const TL = new THREE.TextureLoader(), ld = async (f, srgb) => { const t = await TL.loadAsync('assets/meshy/' + f); t.flipY = false; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const map = T.map && await ld(T.map, true), nrm = T.nrm && await ld(T.nrm, false); g.scene.traverse(o => { if (o.isMesh) { if (map) o.material.map = map; if (nrm) o.material.normalMap = nrm; o.material.needsUpdate = true; } }); };
for (const k in SPEC) if (ON[k]) new GLTFLoader().loadAsync('assets/meshy/' + SPEC[k].glb + '.glb').then(async g => { try { await loadTex(g, SPEC[k].tex); } catch (e) { console.warn('[lynx20] 貼圖載入失敗（用原貼圖）', k, e && e.message); } proto[k] = g; }).catch(e => { bad[k] = true; console.warn('[lynx20] 載入失敗', k, e && e.message); });
export function lynx20(m, v, dt) {
  const ty = v && v.type && ON[v.type] && SPEC[v.type] ? v.type : m.type, S = SPEC[ty]; if (!S || !ON[ty] || !proto[ty] || bad[ty] || FZL === null || (FZW[ty] && !FROZ[ty])) return; const FE = FROZ[ty], ENG = FE || { makeRig, makeSnake, makeBird }, SO = FE ? FE.FROZEN.spec : S;      /* 有凍結檔就用凍結的引擎和參數 */      /* 11-27 Q2：遊戲裡還沒有舊模型的新物種（水豚、灰翎鷺）舊模型會退回野豬，所以先看野獸本身的種類 v.type */
  let X = m.lx;
  if (!X) { try { X = m.lx = (SO.snake ? ENG.makeSnake : SO.bird ? ENG.makeBird : ENG.makeRig)(SkeletonUtils.clone(proto[ty].scene), Object.assign({ clips: proto[ty].animations }, SO.opt)); X.eng = FE ? FE.FROZEN.tag : 'main';      /* S.snake（沼蟒）：蛇形滑行另一套 */ fixMeshyMaterials(X.stage, SO.fx); } catch (e) { bad[ty] = true; console.warn('[lynx20] 建立失敗', ty, e && e.message, e && e.stack); return; }
    const g = m.mesh && m.mesh.geometry, par = m.tilt || m.root; let k = 1;
    /* 大小：和舊模型一樣高（舊模型的世界高度 ÷ 新模型的高度），尾巴長短不影響 */
    if (g) { if (!g.boundingBox) g.computeBoundingBox(); m.root.updateWorldMatrix(true, true); const a = new THREE.Vector3(), b = new THREE.Vector3(); m.mesh.getWorldScale(a); par.getWorldScale(b); k = typeof SO.byLen === 'number' ? SO.byLen * (a.z / (b.z || 1)) / X.SIZE.len : SO.byLen ? Math.max(g.boundingBox.max.z - g.boundingBox.min.z, g.boundingBox.max.x - g.boundingBox.min.x) * (a.z / (b.z || 1)) / X.SIZE.len || 1 : (g.boundingBox.max.y - g.boundingBox.min.y) * (a.y / (b.y || 1)) / X.SIZE.h || 1; }      /* S.byLen（沼蟒）：照舊模型的身長對齊（蛇的高度沒意義） */
    X.k = clamp(k * (SO.size || 1), 0.4, 3); X.stage.scale.setScalar(X.k); X.hide = []; m.root.traverse(o => { if (o.isMesh) X.hide.push(o); }); par.add(X.stage); }
  for (const o of X.hide) o.visible = false;
  const sc = m.root.scale.x || 1, act = v.act || m.defAct || {};
  const gdt = dt;
  const gdt0 = dt; if (SO.opt && SO.opt.hsR && typeof window !== 'undefined' && window.__rdt > 0) dt = window.__rdt;      /* 11-27 OPT.hsR（野鹿、野牛）：命中停頓時動作照真實時間走——野獸位置本來就照真實時間在動，動作卻被放慢到 6%，造成「卡兩格再暴衝」（審核：鹿衝撞 62～64、牛頂撞 57～62、甩角 25～26） */
  try { X.update({ hs: !!(SO.opt && SO.opt.cuV && gdt0 < 0.35 * dt), st: v.st | 0, stT: v.stT || 0, anim: act.anim, wind: act.wind, strike: act.strike, recover: act.recover, shape: v.M && v.M.shape, grab: !!(v.M && v.M.grab), speed: (v.speed || 0) / sc / X.k, dt, cuR: SO.opt && SO.opt.cuR && v.tx != null && !v.ibp ? [v.x, v.z, v.tx, v.tz, (v.st | 0) === 3 ? 30 : 14, gdt] : null });      /* 11-27 D1：cuR 只有開了的物種才送 */
    setFlash(X.stage, clamp(v.flash || 0, 0, 1), v.ftone); setFade(X.stage, ((v.st | 0) === 6 ? 1 - clamp(((v.stT || 0) - 2.0) / 1.2, 0, 1) : 1) * (m.camFade == null ? 1 : m.camFade));
  } catch (e) { bad[ty] = true; for (const o of X.hide) o.visible = true; X.stage.visible = false; console.warn('[lynx20] 動作出錯，改回舊模型', ty, e && e.message, e && e.stack); }
}
/* 自己有動作函式的舊模型（沼蟒 beasts07 的 animPython：遊戲直接呼叫 m.anim，不經過 creatures.js，所以 lynx20 不會被叫到）：有開新模型時，把它的 m.anim 包一層，舊動作照跑完再交給 lynx20（舊模型會被藏起來） */
if (typeof window !== 'undefined' && Object.keys(ON).some(k => ON[k] && SPEC[k].snake)) setInterval(() => { const g = window.__game, L = g && g.mons; if (!L) return; for (const v of (Array.isArray(L) ? L : L.values ? [...L.values()] : [])) { const m = v && v.model; if (m && m.anim && !m.__lxw && ON[v.type]) { const f = m.anim; m.__lxw = 1; m.anim = (mm, vv, dt, t) => { f(mm, vv, dt, t); lynx20(mm, vv, dt); }; } } }, 300);
if (typeof window !== 'undefined') window.__lynx20 = { on: LYNX20, ON, ready: () => FZL !== null && Object.keys(ON).filter(k => ON[k]).every(k => proto[k] && (!FZW[k] || FROZ[k] || bad[k])), eng: k => FROZ[k] ? FROZ[k].FROZEN.tag : 'main', bad: () => Object.keys(bad).length > 0 };
