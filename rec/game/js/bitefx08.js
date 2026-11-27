/* 0.8 咬合特效 v2（bitefx08.js）：新模型（m.sp.v8）的嘴不能張開，咬人時看起來像用頭撞。v2 不畫任何牙形，改用「被咬的感覺」：
   咬中本機玩家：畫面邊緣一圈暗紅暈影（約 0.25 秒由四周往內淡出，克制）＋玩家身上靠野獸那一側噴 5～8 顆深紅小血點（0.3 秒內落下消失）＋咬合音加咬肉聲。
   咬中其他玩家：只有對方身上的血點＋咬合音，沒有暈影。沒咬中：只有一聲較輕的「喀」，沒有任何畫面效果。畫質 low：只留暈影與聲音（不畫血點）。
   鏡頭震動：不另外加。game.js 的 hurtMe 已經有 fx.shake 0.5＋鏡頭被往後推＋命中停頓＋紅閃（#vignette）＋12 顆小粒子，疊上去會重複；這裡的暈影是深色、較寬、較久的一層，補上「被咬」的重量。
   只對 m.sp.v8 的野獸啟用；舊模型一律不經過這裡。壞掉一律吞掉，不影響遊戲。
   掛接：game.js 4 處（import；BITE.sfx／BITE.target 接聲音與玩家位置；咬中玩家時記 v.biteHit = hid；updateMonViews 在判定之後呼叫 biteTick(v, scene, hid, near)）、main.js 2 處（import；每幀 biteUpdate(dt)）、ui.js 1 處（後備合成音）。
   血點：每次一組 Points（8 點），物件池最多 BITE.max＝8 組，超過就回收最舊的。暈影：一個 DOM 元素（#bite8vig，第一次用到才建立，插在 #vignette 後面）。 */
import * as THREE from './three.bundle.js';

const TAU = Math.PI * 2, clamp = (x, a, b) => Math.min(b, Math.max(a, x)), smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const BITE = {
  max: 8, enabled: true, quality: 'high',      /* quality：high｜medium｜low（low 只留暈影與聲音，不畫血點） */
  bloodN: 7, bloodLife: 0.3, vigT: 0.25, vigPeak: 0.55,      /* 血點數（5～8，實際在 bloodN±1 隨機）、血點壽命、暈影長度、暈影最大不透明度 */
  sfx: null, target: null, spawned: 0, recycled: 0, live: 0, fails: 0, last: null, vigA: 0, vigT0: -1      /* sfx(strong, v, big)；target()→{x,y,z,cy}（本機玩家腳底與胸高，game.js 接）；vigA＝目前暈影強度 0–1（棚拍合成用） */
};
/* 各物種大小倍率（相對量到的嘴寬）與最小半寬（公尺）：嘴很窄的物種，效果也要大到玩家（鏡頭 5～8 公尺外）看得出來 */
const SPK = { wolf: [1.5, 0.26], wolfE: [1.5, 0.3], tiger: [1.4, 0.3], bear: [1.35, 0.34], bearE: [1.35, 0.4], croc: [0.95, 0.3], monkey: [1.6, 0.2] };
const BIG = { tiger: 1, bear: 1, croc: 1 };      /* 音效用：體型大的音低一點 */

/* ---------------- 哪些招式算「咬」，以及咬合發生的時間（相對出招 STRIKE 開始）---------------- */
const BM = { wolf_bite: 'b', wolf_snap: 'b', wolf_leap: 'p', tiger_pounce: 'p', tiger_lunge: 'q', croc_lunge: 'l', croc_snap: 'b', croc_grab: 'b', monkey_bite: 'b' };
export function snapAt(M, act) {
  const k = M && BM[M.id]; if (!k) return -1; const st = (act && act.strike) || M.strike || 0.3, f = M.strike ? st / M.strike : 1;
  switch (k) { case 'b': return 0.55 * st; case 'l': return 0.62 * st; case 'q': return 0.9 * st; case 'p': return Math.max(0.05, ((M.at || M.strike) - 0.03) * f); }
  return -1;
}
export const isBiteMove = M => !!(M && BM[M.id]);

/* ---------------- 嘴的位置（從模型幾何量，記在 head 骨座標）---------------- */
function measure(m) {
  const g = m.mesh && m.mesh.geometry, pos = g && g.attributes.position, si = g && g.attributes.skinIndex, sw = g && g.attributes.skinWeight; if (!pos || !si || !sw) return null;
  const names = m.bones.map(b => b.name), hi = names.indexOf('head'), ji = names.indexOf('jaw'); if (hi < 0 || !m.sp.bones || !m.sp.bones[hi]) return null;
  const hp = m.sp.bones[hi].p, sel = []; let zmax = -1e9;
  for (let i = 0; i < pos.count; i++) {
    let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent ? sw.getComponent(i, k) : [sw.getX, sw.getY, sw.getZ, sw.getW][k].call(sw, i); if (w > bw) { bw = w; b = si.getComponent ? si.getComponent(i, k) : [si.getX, si.getY, si.getZ, si.getW][k].call(si, i); } }
    if (b === hi || b === ji) { sel.push(i); const z = pos.getZ(i); if (z > zmax) zmax = z; }
  }
  const Ls = zmax - hp[2]; if (!(Ls > 0.03) || sel.length < 20) return null;
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
  for (const i of sel) { const z = pos.getZ(i), y = pos.getY(i), x = pos.getX(i); if (z > zmax - 0.2 * Ls) { if (y < y0) y0 = y; if (y > y1) y1 = y; } if (z > zmax - 0.4 * Ls) { if (x < x0) x0 = x; if (x > x1) x1 = x; } }
  return { hi, p: [0, (y0 + y1) / 2 - hp[1], zmax - hp[2]], w: Math.max(0.02, (x1 - x0) / 2), h: Math.max(0.02, (y1 - y0) / 2), L: Ls };
}
export function mouthInfo(m) {
  const sp = m && m.sp; if (!sp) return null; if (sp._mouth08 === undefined) { let r = null; try { r = measure(m); } catch (e) { console.warn('[bitefx08] 量嘴失敗', e && e.message); } sp._mouth08 = r; if (!r) BITE.fails++; } return sp._mouth08;
}
const _mo = { tip: new THREE.Vector3(), q: new THREE.Quaternion(), fwd: new THREE.Vector3(), S: 0.4, sc: 1 };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
/* 嘴現在的世界位置、朝向、大小 → out { pos, q, fwd, S }（S＝牙弧半寬，公尺） */
export function mouthPose(m, out) {
  const I = mouthInfo(m); if (!I) return false; const hb = m.bones[I.hi]; hb.updateWorldMatrix(true, false);
  hb.matrixWorld.decompose(_p, _q, _s); const sc = _s.x;
  out.tip.set(I.p[0], I.p[1], I.p[2]).applyMatrix4(hb.matrixWorld); out.q.copy(_q); out.fwd.set(0, 0, 1).applyQuaternion(_q);
  const k = SPK[m.type + (m.elite ? 'E' : '')] || SPK[m.type] || [2, 0.35]; out.S = Math.max(k[1] * Math.pow(Math.max(0.5, m.root.scale.x), 0.5), I.w * sc * k[0]); out.sc = sc; return true;
}


/* ---------------- 暈影（DOM）---------------- */
let vigEl = null;
function vigEnsure() {
  if (vigEl || typeof document === 'undefined' || !document.body) return vigEl;
  vigEl = document.createElement('div'); vigEl.id = 'bite8vig';
  vigEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;display:none;box-shadow:inset 0 0 150px 44px rgba(70,0,4,.9)';      /* 深暗紅（不是鮮紅）、比原本的 #vignette 寬一點 */
  const ref = document.getElementById('vignette'); if (ref && ref.parentNode) ref.parentNode.insertBefore(vigEl, ref.nextSibling); else document.body.appendChild(vigEl);
  return vigEl;
}
/* 暈影強度曲線：0.03 秒快速出現，之後由四周往內淡出到 vigT（0.25 秒）結束 */
const vigCurve = t => t < 0 ? 0 : t < 0.03 ? t / 0.03 : Math.pow(Math.max(0, 1 - (t - 0.03) / (BITE.vigT - 0.03)), 1.6);
function vigStart() { BITE.vigT0 = 0; const e = vigEnsure(); if (e) e.style.display = 'block'; }
function vigStep(dt) {
  if (BITE.vigT0 < 0) return; BITE.vigT0 += dt; const t = BITE.vigT0;
  if (t >= BITE.vigT) { BITE.vigT0 = -1; BITE.vigA = 0; if (vigEl) { vigEl.style.opacity = '0'; vigEl.style.display = 'none'; } return; }
  BITE.vigA = vigCurve(t); if (vigEl) vigEl.style.opacity = String(+(BITE.vigA * BITE.vigPeak).toFixed(3));
}

/* ---------------- 血點（池）---------------- */
const pool = []; let scene0 = null, TEX = null; const NP = 8;
function dotTex() { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 2, 16, 16, 15); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.7, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function makeRig(scene) {
  if (!TEX) TEX = dotTex();
  const mat = new THREE.SpriteMaterial({ map: TEX, color: 0x6e0a0a, transparent: true, depthWrite: false, depthTest: false, fog: false }), spr = [];      /* 深紅（不是鮮豔的卡通紅）；Sprite 的大小以公尺計，不受顯示卡點大小上限影響 */
  for (let i = 0; i < NP; i++) { const s = new THREE.Sprite(mat); s.visible = false; s.frustumCulled = false; s.renderOrder = 10; scene.add(s); spr.push(s); }      /* 注意：不要標 isLine（三維引擎會把標了 isLine 的 Sprite 畫成線）；Sprite 不進環境遮蔽的深度預先計算 */
  return { spr, mat, n: 0, live: false, t: 0, born: 0, p0: new Float32Array(NP * 3), v: new Float32Array(NP * 3), sz: new Float32Array(NP) };
}
function release(r) { if (!r.live) return; r.live = false; for (const s of r.spr) s.visible = false; BITE.live = Math.max(0, BITE.live - 1); }
/* 在 (x, y, z) 噴血：dx／dz 是「從野獸指向被咬者」的單位方向；血點從靠野獸那一側的身體冒出來，往野獸方向與兩側噴，再落下 */
function bloodSpawn(scene, x, y, z, dx, dz) {
  if (BITE.quality === 'low') return null; scene0 = scene;
  let r = pool.find(k => !k.live);
  if (!r) { if (pool.length < BITE.max) { r = makeRig(scene); pool.push(r); } else { r = pool.reduce((a, b) => a.born < b.born ? a : b); BITE.recycled++; release(r); } }
  const n = Math.max(5, Math.min(NP, BITE.bloodN + Math.round((Math.random() - 0.5) * 2))), sx = -dz, sz = dx;      /* sx, sz：身體兩側的方向 */
  for (let i = 0; i < n; i++) {
    const side = (Math.random() - 0.5) * 3.4, out = 0.7 + Math.random() * 1.5, up = 0.4 + Math.random() * 1.6;
    r.p0[i * 3] = x - dx * 0.3 + sx * (Math.random() - 0.5) * 0.4; r.p0[i * 3 + 1] = y + (Math.random() - 0.4) * 0.3; r.p0[i * 3 + 2] = z - dz * 0.3 + sz * (Math.random() - 0.5) * 0.4;
    r.v[i * 3] = -dx * out + sx * side; r.v[i * 3 + 1] = up; r.v[i * 3 + 2] = -dz * out + sz * side;
  }
  r.n = n; r.live = true; r.t = 0; r.born = performance.now(); r.mat.opacity = 1; BITE.live++;
  for (let i = 0; i < NP; i++) { const s = r.spr[i]; s.visible = i < n; r.sz[i] = 0.06 + Math.random() * 0.05; s.position.set(r.p0[i * 3], r.p0[i * 3 + 1], r.p0[i * 3 + 2]); s.scale.setScalar(r.sz[i]); }
  return r;
}

/* ---------------- 對外 ---------------- */
/* 一次咬合。m：野獸模型；o：{ strong（咬中）, who: 'me'（預設，本機玩家）｜'other'（其他玩家）, target: { x, y, z, cy }（被咬者的位置；沒給就用 BITE.target() 或嘴的位置）, v, key, sfx（false＝不出聲）, vig（false＝強制不畫暈影，棚拍用） }。
   回傳 { strong, who }（失敗或被關掉回傳 null）。沒咬中：只出聲，沒有畫面。 */
export function biteSpawn(scene, m, o = {}) {
  if (!BITE.enabled || !m || !m.sp || !m.sp.v8) return null;
  try {
    const who = o.who || 'me', strong = !!o.strong; BITE.spawned++; BITE.last = { type: m.type, strong, who };
    if (o.sfx !== false && BITE.sfx) { try { BITE.sfx(strong, o.v || null, !!BIG[m.type], who); } catch (e) { /* 聲音壞了不影響畫面 */ } }
    if (strong) hitVisual(scene, m, o, who);
    return { strong, who };
  } catch (e) { console.warn('[bitefx08] 生成失敗', e && e.message); BITE.fails++; return null; }
}
function hitVisual(scene, m, o, who) {
  if (!scene) return;
  let t = o.target || (who === 'me' && BITE.target ? BITE.target() : null);
  const hasM = mouthInfo(m) ? mouthPose(m, _mo) : false; if (!hasM && !t) return;
  const bx = hasM ? _mo.tip.x : (m.root.position.x), bz = hasM ? _mo.tip.z : (m.root.position.z);
  if (!t) t = { x: bx, y: hasM ? _mo.tip.y - 0.4 : 0, z: bz, cy: hasM ? _mo.tip.y : 1 };
  let dx = t.x - m.root.position.x, dz = t.z - m.root.position.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  if (who === 'me' && o.vig !== false) vigStart();
  bloodSpawn(scene, t.x, t.cy != null ? t.cy : t.y + 1.2, t.z, dx, dz);
}

/* 每幀更新（main.js 在 updateFx 之後呼叫；dt＝遊戲時間，命中停頓時會變慢，特效跟著慢，和其他特效一致） */
export function biteUpdate(dt) {
  vigStep(dt);
  for (let i = pend.length - 1; i >= 0; i--) { const q = pend[i]; q.t += dt; if (q.v.biteHit === q.key) { pend.splice(i, 1); upgrade(q); } else if (q.t > 0.2) pend.splice(i, 1); }
  for (const r of pool) {
    if (!r.live) continue; r.t += dt; const t = r.t, L = BITE.bloodLife; if (t >= L) { release(r); continue; }
    for (let i = 0; i < r.n; i++) r.spr[i].position.set(r.p0[i * 3] + r.v[i * 3] * t, r.p0[i * 3 + 1] + r.v[i * 3 + 1] * t - 5.2 * t * t, r.p0[i * 3 + 2] + r.v[i * 3 + 2] * t);
    r.mat.opacity = 1 - clamp((t - 0.18) / (L - 0.18), 0, 1);
  }
}
/* 咬合之後才判定到咬中（扇形招式的判定比咬合晚，0.2 秒內）→ 補上咬中的畫面與咬肉聲 */
const pend = [];
function upgrade(q) {
  try { if (BITE.sfx) BITE.sfx(true, q.v, q.big, 'me'); hitVisual(q.scene, q.m, { v: q.v }, 'me'); } catch (e) { /* 吞掉 */ }
}

/* 遊戲接線：每隻野獸每幀呼叫一次（在 STRIKE 時）。v＝畫面物件（v.st、v.stT、v.M、v.act、v.model、v.biteHit）；hid＝這一招的識別（和 game.js 判定用的同一個）；near＝是否在看得到的範圍 */
const STRIKE = 3, memo = new WeakMap();
export function biteTick(v, scene, hid, near) {
  if (!BITE.enabled || v.st !== STRIKE || !near) return;
  const m = v.model; if (!m || !m.sp || !m.sp.v8 || !v.M) return;
  let r = memo.get(v); if (!r) memo.set(v, r = { key: -1, done: false, at: -1 });
  if (r.key !== hid) { r.key = hid; r.done = false; r.at = snapAt(v.M, v.act); }
  if (r.done || r.at < 0 || v.stT < r.at) return; r.done = true;
  const strong = v.biteHit === hid; biteSpawn(scene, m, { strong, v, key: hid });
  if (!strong && pend.length < 8) pend.push({ v, key: hid, m, scene, t: 0, big: !!BIG[m.type] });
}
export const biteStats = () => ({ rigs: pool.length, live: BITE.live, spawned: BITE.spawned, recycled: BITE.recycled, fails: BITE.fails, last: BITE.last });
export function biteDispose() { for (const r of pool) { release(r); if (scene0) for (const sp of r.spr) scene0.remove(sp); r.mat.dispose(); } pool.length = 0; pend.length = 0; BITE.vigT0 = -1; BITE.vigA = 0; if (vigEl) { vigEl.style.opacity = '0'; vigEl.style.display = 'none'; } }
if (typeof window !== 'undefined') window.__bite08 = BITE;
