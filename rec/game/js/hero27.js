// 11-27 玩家新身體（Meshy 人形、Mixamo 骨架，男女各一隻）。網址加 ?hero=20 才開，只套用在自己的角色；NPC 與別的玩家照舊。
// 做法：Avatar 的 setLook／update／applyGear 在 heroOn 時改走這裡。動作全部手動給時間（暫停的 action＋設定 time），不靠 mixer 自己跑：
//  ・走／跑共用一個步伐相位（兩段動作左腳往前的相位對齊在 0.2 左右），速度變了只改步頻，混合時兩隻腳不會各走各的
//  ・步頻＝實際移動速度 ÷ 這段動作原本的腳底後退速度（載入時從動作本身量出來），腳踩著地不滑
//  ・一次性的動作（翻滾、攻擊、被打、倒地）把髖部的水平位移拿掉，角色由遊戲移動，動作只負責姿勢
import * as THREE from './three.bundle.js';
import { GLTFLoader, SkeletonUtils } from './three.bundle.js';
import { fixMeshyMaterials, setFlash } from './meshyfx.js';
import { clamp, lerp } from './core.js';
import { kaykit } from './actors.js';

const Q = new URLSearchParams(location.search);
export const HERO_ON = Q.get('hero') === '20';
const HG = Q.get('hg');      // 測試用：強制男(0)／女(1)
const FILES = { 0: 'hero_m_2k', 1: 'hero_f_2k' };
export const HERO = { H: 2.05, oldH: 2.0, run: 7.2 };      // H＝角色在世界裡的身高（頭頂到腳底）；舊身體（KayKit＋自製頭）實量見 eng/hero/README
const P = {};      // 0 男、1 女：{ scene, clips, info }
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bone = (root, re) => { let b = null; root.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };

export const heroReady = () => !!(P[0] && P[1]);
export async function loadHero() {
  const L = new GLTFLoader();
  await Promise.all([0, 1].map(async g => {
    const gl = await L.loadAsync('assets/meshy/' + FILES[g] + '.glb'), scene = gl.scene;
    scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    fixMeshyMaterials(scene, { sat: 1.0, gain: 1.05, gam: 1.0 });
    const hips = bone(scene, /Hips$/), clips = {};
    for (const c0 of gl.animations) {
      const c = c0.clone(), loop = /^(Running|Walking|Idle)/.test(c.name);
      for (const t of c.tracks) if (hips && t.name === hips.name + '.position' && !loop) { const v = t.values; for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }      // 一次性動作：髖部水平位置固定在第一格
      clips[c.name] = c;
    }
    P[g] = { scene, clips, info: measure(scene, clips) }; retargetAll(P[g]);
  }));
}
// 載入時量：身高、走／跑的自然速度（腳底撐地時往後退的速度）、攻擊連段每一下的出手時間與分段
function measure(scene, clips) {
  const root = SkeletonUtils.clone(scene), mixer = new THREE.AnimationMixer(root); root.updateMatrixWorld(true);
  const top = bone(root, /HeadTop_End$/), toes = [bone(root, /LeftToeBase$/), bone(root, /RightToeBase$/)], hand = bone(root, /RightHand$/), v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const bx = new THREE.Box3().setFromObject(root), H = bx.max.y - bx.min.y;      // 身高用外皮量（男版的 HeadTop_End 骨頭位置不可靠：量出來偏高，整個人被縮小、武器顯得巨大）
  const sample = (name, fn) => { const c = clips[name]; if (!c) return; const a = mixer.clipAction(c); a.play(); const n = Math.max(2, Math.round(c.duration * 30)); for (let i = 0; i <= n; i++) { mixer.setTime(i / n * c.duration); root.updateMatrixWorld(true); fn(i, i / n * c.duration); } a.stop(); mixer.uncacheAction(c); };
  const stance = name => { const Z = [[], []], Y = [[], []]; sample(name, () => toes.forEach((b, k) => { b.getWorldPosition(v); Z[k].push(v.z); Y[k].push(v.y); })); let s = 0, n = 0; const dt = clips[name].duration / (Z[0].length - 1);
    for (let k = 0; k < 2; k++) { const y0 = Math.min(...Y[k]); for (let i = 1; i < Z[k].length; i++) if (Y[k][i] < y0 + 0.015 * H && Y[k][i - 1] < y0 + 0.015 * H) { s += (Z[k][i - 1] - Z[k][i]) / dt; n++; } } return n ? s / n : 1; };
  const vW = stance('Walking'), vR = stance('Running');
  // 攻擊連段：右手速度的高峰＝一下出手；分段點取兩個高峰中間最慢的那一格
  const sp = []; let p0 = null; sample('Weapon_Combo_2', (i, t) => { hand.getWorldPosition(v); sp.push([t, p0 ? v.distanceTo(p0) : 0]); p0 = (p0 || new THREE.Vector3()).copy(v); });
  const mx = Math.max(...sp.map(s => s[1])), pk = [];
  for (let i = 2; i < sp.length - 2; i++) if (sp[i][1] > 0.45 * mx && sp[i][1] >= sp[i - 1][1] && sp[i][1] >= sp[i + 1][1] && sp[i][1] >= sp[i - 2][1] && sp[i][1] >= sp[i + 2][1]) { if (pk.length && sp[i][0] - pk[pk.length - 1][0] < 0.38) { if (sp[i][1] > pk[pk.length - 1][1]) pk[pk.length - 1] = sp[i]; } else pk.push(sp[i]); }
  const seg = pk.map((p, i) => { const lo = i ? pk[i - 1][0] : 0, hi = i < pk.length - 1 ? pk[i + 1][0] : clips.Weapon_Combo_2.duration; let a = 0, b = clips.Weapon_Combo_2.duration, ma = 1e9, mb = 1e9;
    for (const s of sp) { if (i && s[0] > lo && s[0] < p[0] && s[1] < ma) { ma = s[1]; a = s[0]; } if (i < pk.length - 1 && s[0] > p[0] && s[0] < hi && s[1] < mb) { mb = s[1]; b = s[0]; } }
    return { a, hit: p[0], b }; });
  // 握拳：連段出手那一格（手是握著的）每根手指的局部旋轉，拿武器的那隻手每格疊上去（待機、走跑的動作手是張開的）
  const fist = {}; { const c = clips.Weapon_Combo_2, a = mixer.clipAction(c); a.play(); mixer.setTime(seg.length ? seg[0].hit : c.duration * 0.3); root.traverse(o => { if (o.isBone && /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(o.name)) fist[o.name] = o.quaternion.clone(); }); a.stop(); mixer.uncacheAction(c); }
  return { H, vW, vR, seg, fist };
}

// ---------- 掛到 Avatar 上 ----------
export function heroSetLook(A, l, ctx) {
  const g = HG != null ? (+HG ? 1 : 0) : (l.g ? 1 : 0), Pp = P[g];
  if (A.heroG !== g) {
    if (A.root) { A.spin.remove(A.root); if (A.mixer) A.mixer.stopAllAction(); }
    const root = A.root = SkeletonUtils.clone(Pp.scene); A.heroG = g; A.bodyKey = 'hero' + g;
    const k = HERO.H / Pp.info.H; root.scale.setScalar(k); root.position.y = -0.62; A.spin.add(root);
    A.mixer = new THREE.AnimationMixer(root); A.act = {}; A.skinned = []; A.bodyMat = null;
    root.traverse(o => { if (o.isSkinnedMesh) { A.skinned.push(o); if (!A.bodyMat) A.bodyMat = o.material; } });
    const b = n => bone(root, new RegExp(n + '$'));
    A.hb = { hips: b('Hips'), head: b('Head'), chest: b('Spine2'), hl: b('LeftHand'), hr: b('RightHand') };
    // 武器掛點：手掌心附近，方向先對成「握拳時刃朝前上方」（數值實拍校正）
    root.updateMatrixWorld(true);
    const slot = (h, sd) => { const s = new THREE.Group(), S = Pp.slot && Pp.slot[sd], hin = h.getWorldScale(new THREE.Vector3()).x / root.getWorldScale(new THREE.Vector3()).x; s.name = 'heroSlot' + sd;
      if (S) { const hw = h.getWorldScale(new THREE.Vector3()).x / A.group.getWorldScale(new THREE.Vector3()).x; s.quaternion.copy(S.q); s.position.copy(S.p).divideScalar(hin); s.scale.setScalar(S.wsK * 1.07 * HERO.H / HERO.oldH / hw); }      // 武器世界大小＝舊身體的武器大小 ×（新身高／舊身高）      // 和舊身體同一種握法（見 retargetAll）
      else { s.position.set(...SLOT[sd].p); s.rotation.set(...SLOT[sd].r); s.scale.setScalar(SLOT.s / k); }
      h.add(s); return s; };
    A.bones = { l: slot(A.hb.hl, 'l'), r: slot(A.hb.hr, 'r'), head: A.hb.head, chest: A.hb.chest };
    // 舊身體專用的資料：全部給空的，相關功能（舉魚、游泳划手、爬坡姿勢、拉弓）在新身體上先不疊
    A.armT = {}; A.armRest = { l: null, r: null }; A.armDim = null; A.gripT = null; A.gripB = []; A.bowT = null; A.hips = A.hb.hips; A.raise = []; A.swimArm = []; A.swimB = []; A.climbB = {}; A.headRest = new THREE.Quaternion();
    A.hs = { ph: 0, idleT: 0, hitT: 0, lastAct: '', segOf: new Map(), w: { loco: 1, dead: 0, roll: 0, act: 0, hit: 0 } };
  }
  A.extra.forEach(o => o.parent && o.parent.remove(o)); A.extra = []; A.mats = []; A.own.forEach(x => x.dispose && x.dispose()); A.own = [];
  A.group.scale.setScalar(l.h / 100);
  // 武器：沿用舊的武器模型（貼圖用原色）。弓與雙手武器先一樣掛在右手
  const wp = ctx.WEAPONS[l.wp] || ctx.WEAPONS[0]; A.set = { idle: 'Idle_4' }; A.setName = wp.set; A.weap = []; A.tilts = []; A.hold = null; A.guard = null; A.bow = null; A.cape = null; A.headG = null; A.fadeDirty = true;
  A.fist = []; const hands = new Set();
  for (const n of wp.show) { const p = ctx.parts[wp.src] && ctx.parts[wp.src][n]; if (!p) continue; const left = /Offhand|Shield|Spellbook/.test(n), m = p.clone(); m.visible = true; m.userData.node = n; (left ? A.bones.l : A.bones.r).add(m); A.extra.push(m); A.weap.push(m); hands.add(left ? 'Left' : 'Right'); }
  A.root.traverse(o => { const f = Pp.info.fist[o.name]; if (f && [...hands].some(h => o.name.includes(h + 'Hand'))) A.fist.push([o, f]); });
}
export const SLOT = { s: 1.0, r: { p: [0, 0.075, -0.015], r: [0, 0, Math.PI / 2] }, l: { p: [0, 0.075, -0.015], r: [0, 0, -Math.PI / 2] } };      // 手的局部座標：Y＝手腕往指節、X＝食指往小指（握拳時的握柄方向）；武器模型的 +Y（刃）從虎口那側出去

export function heroUpdate(A, dt, s) {
  const S = A.hs, Pp = P[A.heroG], C = Pp.clips, I = Pp.info, w = S.w, wd = A.w;
  const dead = s.dead > 0, roll = !dead && s.roll != null, act = !dead && s.act;
  if (s.flash > 0.9 && S.hitT <= 0 && !act && !roll && !dead) S.hitT = 0.55;
  S.hitT = Math.max(0, S.hitT - dt);
  const kk = r => 1 - Math.exp(-dt * r);
  w.dead = lerp(w.dead, dead ? 1 : 0, dead ? kk(18) : 1); w.roll = lerp(w.roll, roll ? 1 : 0, kk(22)); w.act = lerp(w.act, act ? 1 : 0, kk(22)); w.hit = lerp(w.hit, S.hitT > 0 ? 0.85 : 0, kk(16));
  wd.dead = w.dead; wd.roll = w.roll; wd.act = w.act; wd.swim = dead ? 0 : s.swim || 0; wd.stroke = lerp(wd.stroke || 0, wd.swim > 0.5 ? clamp(s.speed01 / 0.36, 0, 1) : 0, kk(4.5));
  let rest = 1; const used = new Set();
  const KC = Pp.kclips || {};
  const put = (name, wt, time) => { const c = C[name] || (name.startsWith('K:') ? KC[name.slice(2)] : null); if (!c) return; let x = A.act[name]; if (!x) { x = A.act[name] = A.mixer.clipAction(c); x.setLoop(THREE.LoopRepeat, Infinity); x.play(); x.paused = true; }
    const ww = Math.min(rest, Math.max(0, wt)); x.setEffectiveWeight(ww); x.time = ((time % c.duration) + c.duration) % c.duration; rest -= ww; used.add(name); };
  const oneShot = (name, t) => Math.min((C[name] || KC[name.slice(2)]).duration - 0.02, Math.max(0, t));
  w.block = lerp(w.block || 0, s.block && !act && !dead ? 1 : 0, kk(22)); w.charge = lerp(w.charge || 0, s.charge && !act && !dead ? 1 : 0, kk(22)); w.cheer = lerp(w.cheer || 0, A.cheerT > 0 && !act && !roll && s.speed01 < 0.1 ? 1 : 0, kk(10)); A.cheerT = Math.max(0, (A.cheerT || 0) - dt);
  if (w.dead > 0.001) put('Fall_Dead_from_Abdominal_Injury', w.dead, oneShot('Fall_Dead_from_Abdominal_Injury', s.dead));
  if (w.roll > 0.001) { S.rollP = roll ? clamp(s.roll, 0, 1) : S.rollP || 1; put('Roll_Dodge_1', w.roll, oneShot('Roll_Dodge_1', S.rollP * C.Roll_Dodge_1.duration * 0.92)); }
  if (w.act > 0.001 && (act ? KC[act.clip] : S.lastK)) {      // 出招：舊身體的招式（轉過來的），出手最快那一格對到遊戲的傷害判定
    if (act) { S.lastK = act.clip; S.kp = act; } const c = KC[S.lastK], a2 = S.kp, imp = Pp.kimpact && Pp.kimpact[S.lastK]; let t;
    if (a2.hit != null && imp) { const L = Math.min(c.duration * 0.8, a2.dur * 1.65), t0 = clamp(imp - (a2.hit / a2.dur) * L, 0, c.duration - L); t = t0 + clamp(a2.p, 0, 1) * L; } else t = clamp(a2.p, 0, 1) * (a2.span || c.duration * 0.92);
    put('K:' + S.lastK, w.act, Math.min(c.duration - 0.001, t));
  } else if (w.act > 0.001 && I.seg.length) {
    if (act) { if (!S.segOf.has(act.clip)) S.segOf.set(act.clip, S.segOf.size % I.seg.length); S.lastSeg = I.seg[S.segOf.get(act.clip)]; S.actP = clamp(act.p, 0, 1); S.actH = act.hit != null && act.dur ? clamp(act.hit / act.dur, 0.05, 0.95) : 0.45; }
    const g = S.lastSeg, p = S.actP, h = S.actH, t = p < h ? lerp(g.a, g.hit, p / h) : lerp(g.hit, g.b, (p - h) / (1 - h));      // 遊戲的傷害判定時間點對到這一下出手最快的那一格
    put('Weapon_Combo_2', w.act, t);
  }
  if (w.charge > 0.001 && s.charge && KC[s.charge.clip]) { const imp = (Pp.kimpact && Pp.kimpact[s.charge.clip]) || 0.5; put('K:' + s.charge.clip, w.charge, imp * lerp(0.25, 0.5, s.charge.k)); }      // 蓄力：停在出手前
  if (w.block > 0.001 && KC.Blocking) put('K:Blocking', w.block, S.idleT);
  if (w.hit > 0.001) put('Hit_Reaction', w.hit, (0.55 - S.hitT) / 0.55 * 0.7);
  if (w.cheer > 0.001 && KC.Cheer) put('K:Cheer', w.cheer, S.idleT);
  // 移動：走／跑共用相位；步頻跟著實際速度
  const gs = A.group.scale.x * A.root.scale.x, sw = wd.swim, sprint = s.sprint ? 1.38 : 1, v = clamp(s.speed01, 0, 1) * HERO.run * sprint * (1 - sw), vW = I.vW * gs, vR = I.vR * gs;
  const r = sm(vW * 1.35, vR * 0.8, v), mv = sm(0.15, 0.9, v), tsW = clamp(v / vW, 0.55, 1.7), tsR = clamp(v / vR, 0.6, 2.6);
  const Tw = C.Walking.duration, Tr = C.Running.duration;
  if (mv > 0.001) S.ph = (S.ph + dt * lerp(tsW / Tw, tsR / Tr, r)) % 1;
  S.idleT += dt;
  const base = rest, armed = A.weap && A.weap.length && KC.Running_A_U && C.Running_L; put('Idle_4', base * (1 - mv), S.idleT); rest = base * mv;
  if (armed) { const lr = rest; put('Walking_L', rest * (1 - r), S.ph * Tw); put('Running_L', rest, S.ph * Tr); rest = lr;      // 腿：Meshy；手臂：舊身體的走跑（相位用同一個步伐）
    put('K:Walking_A_U', rest * (1 - r), S.ph * KC.Walking_A_U.duration); put('K:Running_A_U', rest, S.ph * KC.Running_A_U.duration); }
  else { put('Walking', rest * (1 - r), S.ph * Tw); put('Running', rest, S.ph * Tr); }
  for (const n in A.act) if (!used.has(n)) A.act[n].setEffectiveWeight(0);
  A.mixer.update(0);
  for (const [b, q] of A.fist) b.quaternion.slerp(q, w.dead > 0.5 ? 0.5 : 1);      // 拿武器的手握拳
  A.spin.rotation.set(0, 0, 0); A.spin.position.y = 0.62;
  if (sw > 0.3) A.spin.position.y = 0.62 - 0.35 * sw;      // 游泳：先整個人泡低一點（划水動作之後補）
  setFlash(A.root, clamp(s.flash || 0, 0, 1));      // 受擊閃光：和 Meshy 野獸同一套
}

/* ---------- 舊動作（KayKit：攻擊、格擋、拉弓、施法、歡呼…）轉到新身體 ----------
   兩副骨架的站姿不同（KayKit 是 T 字、Meshy 是 A 字），不能直接套「相對站姿的旋轉」。做法（方向對齊）：
   新骨頭的世界旋轉 = 舊骨頭這一格的世界旋轉 × 舊站姿⁻¹ × A × 新站姿；A＝把新站姿的骨頭方向轉到舊站姿骨頭方向的最短旋轉。
   站姿那一格剛好是「把新身體擺成舊身體的 T 字」，之後每一格都跟著舊動作轉。髖的位移照兩副骨架髖高的比例縮放。
   武器掛點也用同一個換算：新的手底下的掛點＝舊 handslot 相對舊手腕的位置與朝向，換到新手上，所以武器握法和舊身體一模一樣。 */
const MAP = [['hips', 'Hips', 'spine', 'Spine'], ['spine', 'Spine', 'chest', 'Spine2'], ['chest', 'Spine2', 'head', 'Head'], ['head', 'Head', null, null],
  ['upperarm.l', 'LeftArm', 'lowerarm.l', 'LeftForeArm'], ['lowerarm.l', 'LeftForeArm', 'wrist.l', 'LeftHand'], ['wrist.l', 'LeftHand', 'hand.l', 'LeftHandMiddle1'],
  ['upperarm.r', 'RightArm', 'lowerarm.r', 'RightForeArm'], ['lowerarm.r', 'RightForeArm', 'wrist.r', 'RightHand'], ['wrist.r', 'RightHand', 'hand.r', 'RightHandMiddle1'],
  ['upperleg.l', 'LeftUpLeg', 'lowerleg.l', 'LeftLeg'], ['lowerleg.l', 'LeftLeg', 'foot.l', 'LeftFoot'], ['foot.l', 'LeftFoot', 'toes.l', 'LeftToeBase'], ['toes.l', 'LeftToeBase', null, null],
  ['upperleg.r', 'RightUpLeg', 'lowerleg.r', 'RightLeg'], ['lowerleg.r', 'RightLeg', 'foot.r', 'RightFoot'], ['foot.r', 'RightFoot', 'toes.r', 'RightToeBase'], ['toes.r', 'RightToeBase', null, null]];
const KN = n => n.replace(/[.]/g, '');      // three 載入時會把骨頭名字裡的「.」拿掉
function retargetAll(Pp) {
  const K = kaykit(); if (!K || !K.proto) return;
  const kr = SkeletonUtils.clone(K.proto), hr = SkeletonUtils.clone(Pp.scene); kr.updateMatrixWorld(true); hr.updateMatrixWorld(true);
  const kb = n => { let b = null; kr.traverse(o => { if (!b && o.isBone && (o.name === n || o.name === KN(n))) b = o; }); return b; }, hb = n => bone(hr, new RegExp(n + '$'));
  const Q = () => new THREE.Quaternion(), V3 = () => new THREE.Vector3(), wq = o => o.getWorldQuaternion(Q()), wpz = o => o.getWorldPosition(V3());
  const M = MAP.map(([k, h, kc, hc]) => { const K0 = kb(k), H0 = hb(h); if (!K0 || !H0) return null; const Bk = wq(K0), Bh = wq(H0); let A = Q();
    if (kc && hc) { const K1 = kb(kc), H1 = hb(hc); if (K1 && H1) A = Q().setFromUnitVectors(wpz(H1).sub(wpz(H0)).normalize(), wpz(K1).sub(wpz(K0)).normalize()); }
    return { K0, H0, R: Bk.clone().invert().multiply(A).multiply(Bh) }; }).filter(Boolean);      // R＝舊站姿⁻¹ × A × 新站姿
  const kh = kb('hips'), hh = hb('Hips'), kh0 = wpz(kh), hh0 = wpz(hh), ratio = (hh0.y - Math.min(wpz(hb('LeftToeBase')).y, 0)) / Math.max(1e-3, kh0.y - Math.min(wpz(kb('toes.l')).y, 0));
  // 武器掛點（左右手）：舊 handslot 相對舊手腕 → 新手
  Pp.slot = {}; for (const [sd, kw, ks, hh2] of [['r', 'wrist.r', 'handslot.r', 'RightHand'], ['l', 'wrist.l', 'handslot.l', 'LeftHand']]) { const W0 = kb(kw), S0 = kb(ks), H = hb(hh2), m = M.find(x => x.H0 === H); if (!W0 || !S0 || !m) continue;
    const Bw = wq(W0), Bh = wq(H), A = Bw.clone().multiply(m.R).multiply(Bh.clone().invert());      // A＝舊手腕世界 → 新手世界 的換算（站姿時）：新手 = 舊手腕 × R … 反推
    const relQ = Bw.clone().invert().multiply(wq(S0)), relP = W0.worldToLocal(wpz(S0)).multiply(W0.getWorldScale(V3()));      // 掛點在舊手腕座標裡（含縮放換成世界長度）
    const T = m.R.clone().invert();      // 新手世界 = 舊手腕世界 × R  ⇒  舊手腕世界 = 新手世界 × R⁻¹
    const hk = wpz(hb(sd === 'r' ? 'RightHandMiddle1' : 'LeftHandMiddle1')).distanceTo(wpz(H)) / Math.max(1e-4, wpz(kb(sd === 'r' ? 'hand.r' : 'hand.l')).distanceTo(wpz(W0)));      // 手掌長度比（KayKit 腿很短，用髖高比例會讓武器大一倍）
    Pp.slot[sd] = { q: T.clone().multiply(relQ), p: relP.clone().multiplyScalar(hk).applyQuaternion(T), wsK: S0.getWorldScale(V3()).x };      // 位置照手掌長度換算；武器大小在 setLook 照身高換算      // 掛點在「新手的世界朝向」下：位置與朝向；ws＝掛點世界縮放（照比例）
  }
  // 逐格取樣每一段舊動作
  const mix = new THREE.AnimationMixer(kr), base = M.map(m => m.H0.quaternion.clone()), hp0 = hh.position.clone(), out = {};
  for (const name in K.clips) { if (/^(UP|LO):/.test(name)) continue; const c = K.clips[name], a = mix.clipAction(c); a.play(); const n = Math.max(2, Math.ceil(c.duration * 30)), times = new Float32Array(n + 1), QS = M.map(() => new Float32Array((n + 1) * 4)), PS = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) { const t = i / n * c.duration; times[i] = t; mix.setTime(t); kr.updateMatrixWorld(true);
      M.forEach((m, j) => { m.H0.quaternion.copy(base[j]); });
      M.forEach((m, j) => { const tgt = wq(m.K0).multiply(m.R), pw = m.H0.parent.getWorldQuaternion(Q()); m.H0.quaternion.copy(pw.invert().multiply(tgt)); m.H0.updateMatrixWorld(true); m.H0.quaternion.toArray(QS[j], i * 4); });
      const d = wpz(kh).sub(kh0).multiplyScalar(ratio), hw = hh0.clone().add(d), lp = hh.parent.worldToLocal(hw); PS.set([lp.x, lp.y, lp.z], i * 3); hh.position.copy(hp0); }
    a.stop(); mix.uncacheAction(c);
    const tracks = M.map((m, j) => new THREE.QuaternionKeyframeTrack(m.H0.name + '.quaternion', times, QS[j])); tracks.push(new THREE.VectorKeyframeTrack(hh.name + '.position', times, PS));
    out[name] = new THREE.AnimationClip('K:' + name, c.duration, tracks); }
  M.forEach((m, j) => m.H0.quaternion.copy(base[j]));
  // 拿著武器走跑：腿用 Meshy 的走跑（腳不滑），手臂用舊身體的跑步（雙手握著武器擺，不會像空手衝刺那樣把盾甩到臉上）
  const ARM = /(Left|Right)(Shoulder|Arm|ForeArm|Hand)/, sub = (c, keep, nm) => c ? new THREE.AnimationClip(nm, c.duration, c.tracks.filter(t => keep(ARM.test(t.name)))) : null;
  Pp.clips.Walking_L = sub(Pp.clips.Walking, a => !a, 'Walking_L'); Pp.clips.Running_L = sub(Pp.clips.Running, a => !a, 'Running_L');
  if (out.Running_A) out.Running_A_U = sub(out.Running_A, a => a, 'K:Running_A_U'); if (out.Walking_A) out.Walking_A_U = sub(out.Walking_A, a => a, 'K:Walking_A_U');
  Pp.kclips = out; Pp.kimpact = K.impact;
  window.__heroDbg = Object.assign(window.__heroDbg || {}, { ['g' + (Pp === P[1] ? 1 : 0)]: { ratio, kh: kh0.y, hh: hh0.y, slot: Object.fromEntries(Object.entries(Pp.slot).map(([k, v]) => [k, { ws: v.wsK, p: v.p.toArray() }])), kws: kb('handslot.r').getWorldScale(V3()).x, hws: hb('RightHand').getWorldScale(V3()).x } });
}

