// 0.7「走遍原野」：道路上的舊陷阱與荒地（場景＋玩法成員 w7-wild）
// 規格：0.7 設計定案第 2 節①②、附錄 E；使用者決定（11-16 08:22）：大路相對安全、陷阱看得到能繞，荒地才真正危險但有回報。
//
// 這個檔做的事（game.js 只有「匯入＋呼叫」的補丁：tick、held、interact、hint、save／load、tryDodge 的一行）：
//   ・48 處舊陷阱（捕獸夾、絆索鈴）與紅布樁、f03 的兩個教學夾子：模型、看得到的距離、觸發、夾住（不能走、不能閃避與衝刺；可以攻擊、格擋、喝藥）、
//     連按互動鍵掙脫、其他玩家幫忙掰開、拆除（學會之後）、用武器或箭打空夾、引怪（只引普通野獸，鹿會逃）、看到別人踩到／拆掉就一起消失、野獸不觸發。
//   ・荒地的定義 isWild()、荒地採集片大株機率 ×2（在採集片上做記號，gather.js 一行補丁讀它）、荒地的標記（爪痕、骨堆、臥窩、腳印）。荒地的野獸由 core.js 的 buildSpawns 讀 places07.js 加。
//   ・委託板與繪圖桌的模型與碰撞（位置在 places07.js，w7-story、w7-map 照那裡的位置做互動）。
//   ・托比在南門提醒一次。
// 每人各自一份（像採集點）：P.trapSeen、P.trapGone（位元組，長度 TRAP_N07＝48＋2）、P.trapToby。存檔欄位 tr7 = { s, g, tb }。
// 多人（presence，詳見檔尾）：nz 引怪、tr 我踩到／拆掉了哪一個、th 我被夾住、fr 我幫誰掰開。
import * as THREE from './three.bundle.js';
import { clamp, lerp, r1, MON, MST, expNeed, roadDist, trailDist, E1 } from './core.js';
import { W, Hgt, addCollider, waterDepth, grassPress07 } from './world.js';
import { popNumber, emit, fxRing, tagSay } from './actors.js';
import { keyOf } from './keys.js';
import { me, P, input, ui, Net, remotes, npcs, debug, Store, gainExp, addItem, getClock, Gather, Needs, Craft, M6, D, QUESTS } from './game.js';
import { TRAP07 as K, TRAPS07, TUTOR07, TRAP_N07, STAKES07, WILD_RULE07, WILD07, WILD_TIER07, WILD_MARKS07, BOARD07, DRAW_TABLE07 } from './places07.js';
import { CAMPS, ELITE_SPOTS, GATHER_SITES } from './places06.js';
import './weather08.js'; import { TRAPS08 } from './places08.js';      /* X10：新地的陷阱 */      // 0.8：雨與雷的時程與規則（d8-play-p4）

const ALL = [...TRAPS07, ...TUTOR07, ...TRAPS08], NR = TRAPS07.length, NT = TRAP_N07, N = TRAP_N07 + TRAPS08.length;      /* X10：NR–NT＝教學夾子（每人自己的）；NT 以後＝TRAPS08 */
const OFF = typeof window !== 'undefined' && window.__traps07 === 0;      // 測試：載入前設 window.__traps07 = 0 整個關掉（量繪製次數的對照組）

/* ============================== 數值 ============================== */
// E1＝同級打獵一分鐘的經驗：用 core.js 的共用表（HUNT07），拆除獎勵 夾子 E1×0.5＋舊鐵件 1、絆索 E1×0.25

/* ============================== 荒地 ============================== */
const ELITE_PTS = Object.values(ELITE_SPOTS).flat();
// 荒地：離道路 ≥ 30、離小徑 ≥ 20、離營火 ≥ 50、離城牆 ≥ 60、不是水面、離菁英出沒點 ≥ 60（附錄 E）
export function isWild(x, z) {
  const R = WILD_RULE07; if (Math.hypot(x, z) < 42 + R.wall || roadDist(x, z) < R.road || trailDist(x, z) < R.trail) return false;
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < R.camp) return false;
  for (const e of ELITE_PTS) if (Math.hypot(x - e.x, z - e.z) < R.elite) return false;
  return !(waterDepth(x, z) > -0.15);
}
export const wildGroups = () => WILD07.filter(g => g.t <= WILD_TIER07);

/* ============================== 存檔 ============================== */
function ensure() { if (!(P.trapSeen instanceof Uint8Array) || P.trapSeen.length !== N) { const o = P.trapSeen; P.trapSeen = new Uint8Array(N); if (o && o.length) P.trapSeen.set(Array.from(o).slice(0, N)); } if (!(P.trapGone instanceof Uint8Array) || P.trapGone.length !== N) { const o = P.trapGone; P.trapGone = new Uint8Array(N); if (o && o.length) P.trapGone.set(Array.from(o).slice(0, N)); } }
const packBits = a => { let s = ''; for (let i = 0; i < a.length; i += 8) { let b = 0; for (let k = 0; k < 8 && i + k < a.length; k++) if (a[i + k]) b |= 1 << k; s += String.fromCharCode(b); } return btoa(s); };
const unpackBits = (s, a) => { if (typeof s !== 'string' || s.length > 64) return; try { const b = atob(s); for (let i = 0; i < b.length && i * 8 < a.length; i++) { const c = b.charCodeAt(i); for (let k = 0; k < 8 && i * 8 + k < a.length; k++) a[i * 8 + k] = (c >> k) & 1; } } catch (e) {} };
// 存檔欄位 tr7：s 找到過的陷阱、g 對我已經沒了的陷阱（各 7 個位元組的 base64，12 字元）、tb 托比提醒過。0.6a 的存檔沒有這個欄位＝全部從零開始
export function save(p = P) { ensure(); const o = { s: packBits(p.trapSeen), g: packBits(p.trapGone) }; if (p.trapToby) o.tb = 1; return o; }
export function load(p = P, d) { p.trapSeen = new Uint8Array(N); p.trapGone = new Uint8Array(N); p.trapToby = 0; if (d && typeof d === 'object') { unpackBits(d.s, p.trapSeen); unpackBits(d.g, p.trapGone); p.trapToby = d.tb ? 1 : 0; } S.resync = true; }
// 給地圖（w7-map）：每個陷阱的位置與狀態。地圖畫 ✕＝seen && !gone（教學夾子不畫）
export const trapList = () => { ensure(); return ALL.map((d, i) => ({ i, k: d.k, x: d.x, z: d.z, a: d.a, b: d.b, zone: d.zone, tutor: !!d.tutor, seen: !!P.trapSeen[i], gone: !!P.trapGone[i] })); };

/* ============================== 狀態 ============================== */
const S = { ready: false, held: null, disarm: null, atk: null, atkHi: 0, wasSafe: true, lastHp: -1, nzN: 0, nzT: 0, trN: 0, trT: 0, frN: 0, frT: 0, seq: new Map(), visT: 0, markT: 0, resync: true, warnT: 0, lx: 0, lz: 0, ui: null, tipBell: 0, hintCache: '' };
const T = ALL.map((d, i) => ({ i, d, k: d.k, x: d.x, z: d.z, tutor: !!d.tutor, obj: null, open: null, shut: null, glint: null, vis: false, closed: -1, how: 0, y: 0 }));
const learned = () => { const q = QUESTS.find(o => o.id === 'f03'); return q ? P.q.d.includes('f03') : P.lv >= 3; };      // f03 還沒合併進來時：3 級以上就算學會（讓功能可以先測）
const tutorOn = () => !!(P.q && P.q.a && P.q.a.f03) && !P.q.d.includes('f03');
const survey = () => !!(P.pas && (P.pas.survey || P.pas.map));      // 「測繪」天賦（w7-map）：看得更遠
const seeR = t => t.k === 'jaw' ? (survey() ? K.jawSeeSurvey : K.jawSee) : (survey() ? K.bellSeeSurvey : K.bellSee);
function segD(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }
const distTo = (t, x, z) => t.k === 'bell' ? segD(x, z, t.d.a, t.d.b) : Math.hypot(x - t.x, z - t.z);
// 兩條線段 p0→p1 與 a→b 有沒有相交（絆索：這一幀走過繩子）
function crosses(x0, z0, x1, z1, a, b) { const d = (x1 - x0) * (b[1] - a[1]) - (z1 - z0) * (b[0] - a[0]); if (Math.abs(d) < 1e-9) return false; const u = ((a[0] - x0) * (b[1] - a[1]) - (a[1] - z0) * (b[0] - a[0])) / d, v = ((a[0] - x0) * (z1 - z0) - (a[1] - z0) * (x1 - x0)) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; }
const live = t => !P.trapGone[t.i] && (!t.tutor || tutorOn());
// d7-play：教學夾子「已經沒了」的個數不能多於 f03 的進度（0.7 第一波的版本踩到教學夾子也會記成沒了 → f03 卡在 0/2、永遠學不會拆）。
// 接了 f03、還沒完成時每幀對一次：多出來的清掉（剛接的任務＝兩個都回來；拆了一個＝留那一個）。讀檔、重新接任務都會經過這裡
function tutorHeal() {
  const a = P.q.a.f03, n = a && Array.isArray(a.o) ? a.o[0] | 0 : 0; let g = 0; for (let i = NR; i < NT; i++) g += P.trapGone[i] ? 1 : 0;
  if (g <= n) return; for (let i = NR; i < NT; i++) { P.trapGone[i] = 0; T[i].closed = -1; } if (n > 0) P.trapGone[NR] = 1; Store.dirty = true; S.resync = true;
}

/* ============================== 多人（presence） ============================== */
// 和 game.js 的 netSet 同一套（值沒變不送、force 立刻送）；在單人模式時只是放在 Net.pending，不會送出
function nset(k, v, force) { const s = JSON.stringify(v); if (Net.sent[k] === s) return; Net.sent[k] = s; Net.pending[k] = v; Net.dirty = true; if (force) Net.force = true; }
// 帶序號的欄位：第一次看到只記序號（不重播舊的），之後序號變了才處理
function seqNew(peer, key, v) { const k = peer + '|' + key, last = S.seq.get(k), cur = Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null; S.seq.set(k, cur); return cur !== null && last !== undefined && last !== cur; }      // 欄位是空的也記下來：之後第一個值就會處理
// 引怪：主控端把 rad 公尺內、不在戰鬥中的普通野獸的目標設成觸發的人（等同被打了一下，同群的一起上）；菁英與菁英的護衛不受影響；膽小的（鹿）逃開
function lureHost(who, x, z, rad) {
  const sim = debug.sim, elitePack = new Set(sim.filter(w => w.elite && w.pack != null).map(w => w.pack)); let n = 0;
  const log = S.lastLure = { who, x, z, rad, n: 0, near: [] };      // 測試與除錯用：這次引怪時附近每隻野獸的狀況（只在踩到時記一次）
  for (const w of sim) { const dd = Math.hypot(w.x - x, w.z - z); if (dd < rad + 8 && w.st !== MST.DEAD) log.near.push([w.id, w.type, +dd.toFixed(1), w.st, w.target, w.pack, !!w.elite]);
    if (w.st === MST.DEAD || w.elite || (w.pack != null && elitePack.has(w.pack))) continue;
    if (Math.hypot(w.x - x, w.z - z) > rad || w.target || (w.st !== MST.IDLE && w.st !== MST.WARN) || w.type === 'bison') continue;      /* 0.7a（d8-play-p1）：野牛不被陷阱聲引來（絆索 #33 不會把牛群引向 9–10 級的人） */
    if (MON[w.type].temper === 'timid') { w.fleeFrom = who; w.target = null; if (w.st !== MST.FLEE) { w.st = MST.FLEE; w.t = 0; } }
    else { w.target = who; w.provoked = true; n++; if (w.pack != null) for (const o of sim) if (o !== w && o.pack === w.pack && o.st !== MST.DEAD && !o.target && MON[o.type].temper !== 'timid') { o.target = who; o.provoked = true; } }
  }
  log.n = n; return n;
}
function noise(x, z, rad) { if (Net.isHost) S.lured = lureHost('self', x, z, rad); else { nset('nz', [++S.nzN, r1(x), r1(z), rad], true); S.nzT = K.nzT; } }
function tellGone(i, how) { if (i >= NR && i < NT) return; nset('tr', [++S.trN, i, how], true); S.trT = K.trT; }      // 教學夾子是每人自己的，不廣播
function remoteTick() {
  const host = Net.isHost;
  for (const r of remotes.values()) {
    const p = r.lastPres; if (!p) continue;
    if (seqNew(r.peer, 'nz', p.nz) && host && !r.away) { const v = p.nz, x = Number(v[1]), z = Number(v[2]), rad = clamp(Number(v[3]) || 0, 0, 40); if (isFinite(x) && isFinite(z)) lureHost(r.peer, x, z, rad); }
    if (seqNew(r.peer, 'tr', p.tr)) { const i = p.tr[1] | 0, how = p.tr[2] | 0; if (i >= 0 && (i < NR || (i >= NT && i < N)) && Math.hypot(r.x - me.x, r.z - me.z) <= K.seenBy) gone(T[i], how === 1 ? 'taken' : 'shut', true); }
    if (seqNew(r.peer, 'fr', p.fr) && p.fr[1] === Net.selfPeer && S.held) release('free', r.name);
    r.t7held = p.th === 1 && r.alive && !r.away;
  }
  if (S.nzT > 0 && (S.nzT -= S.dt) <= 0) nset('nz', null);
  if (S.trT > 0 && (S.trT -= S.dt) <= 0) nset('tr', null);
  if (S.frT > 0 && (S.frT -= S.dt) <= 0) nset('fr', null);
  nset('th', S.held ? 1 : null);
}

/* ============================== 模型（暫代；美術的 props07.js 有就用正式的） ============================== */
// 小型合併器：幾何體轉成無索引、套位置與旋轉、上頂點色（可依高度漸層），合成一個網格＝一次繪製
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Matrix3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c0 = new THREE.Color(), _c1 = new THREE.Color();
class B7 {
  constructor() { this.P = []; this.N = []; this.C = []; }
  add(geo, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nn = g.attributes.normal, at = o.at || [0, 0, 0], r = o.rot || [0, 0, 0], sc = o.sc == null ? [1, 1, 1] : typeof o.sc === 'number' ? [o.sc, o.sc, o.sc] : o.sc;
    _m.compose(_v.set(at[0], at[1], at[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), _s.set(sc[0], sc[1], sc[2])); _n.getNormalMatrix(_m);
    const col = Array.isArray(o.col) ? o.col : [o.col, o.col]; _c0.set(col[0] == null ? 0xffffff : col[0]); _c1.set(col[1] == null ? 0xffffff : col[1]);
    const V = []; let y0 = 1e9, y1 = -1e9; for (let i = 0; i < p.count; i++) { _a.fromBufferAttribute(p, i).applyMatrix4(_m); V.push(_a.x, _a.y, _a.z); y0 = Math.min(y0, _a.y); y1 = Math.max(y1, _a.y); }
    const gy = o.gy || [y0, y1], dy = Math.max(1e-5, gy[1] - gy[0]);
    for (let i = 0; i < p.count; i++) {
      if (o.flat && i % 3 === 0) { _a.set(V[i * 3 + 3] - V[i * 3], V[i * 3 + 4] - V[i * 3 + 1], V[i * 3 + 5] - V[i * 3 + 2]); _b.set(V[i * 3 + 6] - V[i * 3], V[i * 3 + 7] - V[i * 3 + 1], V[i * 3 + 8] - V[i * 3 + 2]); _a.cross(_b).normalize(); this._fn = _a.clone(); }
      if (o.flat) _b.copy(this._fn); else if (nn) _b.fromBufferAttribute(nn, i).applyMatrix3(_n).normalize(); else _b.set(0, 1, 0);
      const t = clamp((V[i * 3 + 1] - gy[0]) / dy, 0, 1), j = o.jit ? 1 + (Math.sin(i * 12.9898 + this.P.length) * 0.5) * o.jit : 1;
      this.P.push(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); this.N.push(_b.x, _b.y, _b.z); this.C.push(lerp(_c0.r, _c1.r, t) * j, lerp(_c0.g, _c1.g, t) * j, lerp(_c0.b, _c1.b, t) * j);
    }
    return this;
  }
  mesh(mat) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat || MAT().vc); m.castShadow = true; m.receiveShadow = true; return m; }
}
let _mat = null;
const MAT = () => _mat || (_mat = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 }),
  cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  glint: new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.0, depthWrite: false }),
  scratch: new THREE.MeshBasicMaterial({ color: 0xead9b4, side: THREE.DoubleSide }),
  prints: null
});
const cyl = (r0, r1_, h, s = 7) => new THREE.CylinderGeometry(r0, r1_, h, s), box = (x, y, z) => new THREE.BoxGeometry(x, y, z), ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d), dod = r => new THREE.DodecahedronGeometry(r, 0);
const IRON = [0x4e4a46, 0x9a948a], RUST = [0x5a3a24, 0x8a5634], SOIL = [0x3b2b1c, 0x5b4630], WOOD = [0x5a3f27, 0x8b6743];
// 捕獸夾（張開／夾上）：翻過的土圈、底板、兩片帶齒的半圓鐵顎、彈簧、一截鍊子與地樁
function jawGeo(shut) {
  const B = new B7();
  B.add(cyl(0.6, 0.66, 0.05, 14), { at: [0, 0.0, 0], col: SOIL, jit: 0.25 });
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + 0.3, r = 0.55 + (k % 3) * 0.06; B.add(dod(0.055 + (k % 2) * 0.03), { at: [Math.cos(a) * r, 0.04, Math.sin(a) * r], col: SOIL[1], flat: true, jit: 0.3 }); }
  B.add(cyl(0.13, 0.15, 0.035, 10), { at: [0, 0.045, 0], col: RUST });
  const MB = new B7();      // 鐵的部分另外一個網格（金屬材質才有鐵光）。鐵顎的鉸鏈在 x 軸兩端：張開時兩片平躺成一圈，夾上時兩片立起來合在中間
  for (const s of [-1, 1]) {
    const ring = new THREE.TorusGeometry(0.33, 0.026, 5, 14, Math.PI);
    if (!shut) {
      MB.add(ring, { at: [0, 0.07, 0], rot: [-Math.PI / 2, s > 0 ? 0 : Math.PI, 0], col: IRON });
      for (let k = 1; k < 7; k++) { const a = k / 7 * Math.PI; MB.add(new THREE.ConeGeometry(0.02, 0.07, 4), { at: [Math.cos(a) * 0.29 * s, 0.1, -Math.sin(a) * 0.29 * s], col: 0xc8c2b6 }); }
    } else {
      MB.add(ring, { at: [0, 0.07, s * 0.022], rot: [0, s > 0 ? 0 : Math.PI, 0], col: IRON });
      for (let k = 1; k < 7; k++) { const a = k / 7 * Math.PI; MB.add(new THREE.ConeGeometry(0.018, 0.06, 4), { at: [Math.cos(a) * 0.28, 0.07 + Math.sin(a) * 0.28, s * 0.03], rot: [s * Math.PI / 2, 0, 0], col: 0xc8c2b6 }); }
    }
  }
  for (const s of [-1, 1]) MB.add(box(0.09, 0.05, 0.12), { at: [s * 0.36, 0.07, 0], col: IRON });
  for (let k = 0; k < 4; k++) MB.add(new THREE.TorusGeometry(0.035, 0.011, 4, 8), { at: [0.42 + k * 0.06, 0.035, 0.05 + k * 0.025], rot: [Math.PI / 2, k % 2 ? 0.6 : -0.6, 0], col: RUST });
  MB.add(cyl(0.025, 0.012, 0.18, 5), { at: [0.66, 0.06, 0.15], rot: [0.3, 0, 0.2], col: RUST });
  const g = new THREE.Group(); g.add(B.mesh(), MB.mesh(MAT().metal)); return g;
}
// 絆索鈴：兩根短樁、一條細繩（略反光）、三個銅鈴（cut：繩子斷了垂在地上）
function bellGeo(len, cut) {
  const B = new B7(), MB = new B7(), h = 0.26;
  for (const s of [-1, 1]) { B.add(cyl(0.045, 0.06, 0.62, 6), { at: [s * len / 2, 0.24, 0], rot: [0, 0, s * 0.12], col: WOOD, flat: true, jit: 0.2 }); B.add(cyl(0.07, 0.07, 0.05, 6), { at: [s * len / 2, 0.02, 0], col: SOIL }); }
  if (!cut) B.add(cyl(0.011, 0.011, len - 0.06, 4), { at: [0, h, 0], rot: [0, 0, Math.PI / 2], col: 0xefe6c8 });
  else for (const s of [-1, 1]) B.add(cyl(0.011, 0.011, len * 0.48, 4), { at: [s * len * 0.27, 0.04, 0.05 * s], rot: [0, 0.1 * s, Math.PI / 2], col: 0xd8cfb0 });
  for (const u of [-0.28, 0, 0.3]) { const x = u * len, y = cut ? 0.05 : h - 0.06; MB.add(new THREE.ConeGeometry(0.045, 0.07, 7), { at: [x, y, cut ? 0.12 : 0], rot: cut ? [Math.PI / 2, 0, 0] : [0, 0, 0], col: [0x8a6420, 0xe8b850] }); MB.add(ico(0.016), { at: [x, y - 0.04, cut ? 0.12 : 0], col: 0x6a4a18 }); }
  const g = new THREE.Group(); g.add(B.mesh(), MB.mesh(MAT().metal)); return g;
}
// 紅布樁：削尖的木樁、上端綁一條紅布
function stakeGeo() {
  const B = new B7(), C = new B7();
  B.add(cyl(0.05, 0.06, 1.1, 6), { at: [0, 0.55, 0], col: WOOD, flat: true, jit: 0.18 }); B.add(new THREE.ConeGeometry(0.05, 0.12, 6), { at: [0, 1.16, 0], col: WOOD[1], flat: true });
  B.add(cyl(0.062, 0.062, 0.05, 6), { at: [0, 0.98, 0], col: 0x3a2a1a });
  const cloth = (w, h, at, rot) => C.add(new THREE.PlaneGeometry(w, h, 1, 3), { at, rot, col: [0x8e1f18, 0xd8402e] });
  cloth(0.13, 0.42, [0.07, 0.78, 0.02], [0, 0.4, 0.22]); cloth(0.1, 0.3, [-0.05, 0.84, -0.03], [0, -0.7, -0.3]);
  const g = new THREE.Group(); g.add(B.mesh(), C.mesh(MAT().cloth)); return g;
}
function marksGeo(kind) {
  const B = new B7();
  if (kind === 'bones') {
    const bone = (l, at, ry, rz) => { B.add(cyl(0.025, 0.025, l, 5), { at, rot: [0, ry, Math.PI / 2 + rz], col: [0xcbbf9e, 0xeee4ca] }); for (const s of [-1, 1]) B.add(ico(0.04), { at: [at[0] + Math.cos(ry) * s * l / 2, at[1], at[2] - Math.sin(ry) * s * l / 2], col: 0xe8dcc0 }); };
    bone(0.55, [0, 0.04, 0], 0.3, 0.05); bone(0.42, [0.15, 0.05, 0.12], 1.6, 0); bone(0.36, [-0.2, 0.03, 0.1], -0.9, 0); bone(0.3, [0.05, 0.08, -0.12], 2.4, 0.1);
    for (let k = 0; k < 5; k++) B.add(new THREE.TorusGeometry(0.16, 0.014, 4, 8, Math.PI * 0.9), { at: [-0.35 + k * 0.07, 0.03, -0.25], rot: [0, Math.PI / 2, 0.1], col: 0xd8cdb0 });
    B.add(ico(0.12, 1), { at: [0.3, 0.09, -0.2], sc: [1, 0.8, 1.25], col: [0xc8bc9c, 0xefe6cc] }); for (const s of [-1, 1]) B.add(ico(0.03), { at: [0.3 + s * 0.05, 0.12, -0.08], col: 0x2a241c });
    B.add(cyl(0.5, 0.55, 0.02, 10), { at: [0, 0.0, 0], col: 0x4a3a28 });
  } else if (kind === 'bed') {
    B.add(new THREE.TorusGeometry(0.75, 0.16, 5, 14), { at: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], sc: [1, 1, 0.45], col: [0x6f6a3a, 0xa8a060], jit: 0.25 });
    B.add(cyl(0.78, 0.8, 0.03, 14), { at: [0, 0.01, 0], col: [0x7a6a3e, 0x9a8a52], jit: 0.2 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; B.add(new THREE.ConeGeometry(0.035, 0.22, 3), { at: [Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45], rot: [1.2, a, 0], col: [0x8a8a48, 0xc0b870] }); }
    B.add(ico(0.035), { at: [0.2, 0.05, 0.1], col: 0x8d8d8d }); B.add(ico(0.035), { at: [-0.15, 0.05, -0.2], col: 0x6e6a62 });      // 幾撮掉下來的毛
  } else if (kind === 'snag') {      // 附近沒有樹時：一截枯木樁，上面有爪痕
    B.add(cyl(0.2, 0.3, 1.9, 8), { at: [0, 0.95, 0], col: [0x4a3826, 0x7a6248], flat: true, jit: 0.2 }); B.add(new THREE.ConeGeometry(0.2, 0.5, 8), { at: [0.03, 2.1, 0], rot: [0, 0, 0.25], col: 0x6a5238, flat: true });
    for (let k = 0; k < 3; k++) B.add(box(0.035, 0.5, 0.02), { at: [-0.08 + k * 0.08, 1.35, 0.25], rot: [0, 0, 0.12], col: 0xead9b4 });
  }
  return B.mesh();
}
let printTex = null;
function printsMesh(kind) {      // 腳印：一張貼在地上的半透明圖（一串爪印）
  if (!printTex) { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = 'rgba(40,30,20,1)';
    const paw = (x, y, s, a) => { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.ellipse(0, 4 * s, 7 * s, 6 * s, 0, 0, 6.29); c.fill(); for (const [dx, dy] of [[-7, -6], [-2.5, -9], [2.5, -9], [7, -6]]) { c.beginPath(); c.ellipse(dx * s, dy * s, 2.4 * s, 3 * s, 0, 0, 6.29); c.fill(); } c.restore(); };
    for (let k = 0; k < 7; k++) paw(20 + k * 34, 64 + (k % 2 ? -16 : 16), 1.15, Math.PI / 2 + (k % 2 ? -0.1 : 0.1));
    printTex = new THREE.CanvasTexture(cv); MAT().prints = new THREE.MeshBasicMaterial({ map: printTex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), MAT().prints); m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); return g;
}
function clawMesh(r) {      // 刻在真正的樹幹上：三道淺色的抓痕（樹幹半徑 r）
  const B = new B7(); for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.28; B.add(box(0.045, 0.62 - Math.abs(k - 1) * 0.08, 0.012), { at: [Math.sin(a) * (r + 0.012), 1.45 + (k === 1 ? 0.06 : 0), Math.cos(a) * (r + 0.012)], rot: [0, a, 0.1], col: 0xead9b4 }); B.add(box(0.02, 0.5, 0.008), { at: [Math.sin(a) * (r + 0.02), 1.42, Math.cos(a) * (r + 0.02)], rot: [0, a, 0.1], col: 0x8a6a48 }); }
  const m = B.mesh(); m.castShadow = false; return m;
}
function boardGeo() {      // 委託板：兩根柱子、小雨遮、木板、三張委託
  const B = new B7();
  for (const s of [-1, 1]) B.add(cyl(0.07, 0.08, 2.3, 6), { at: [s * 0.85, 1.15, 0], col: WOOD, flat: true, jit: 0.15 });
  B.add(box(1.62, 1.0, 0.07), { at: [0, 1.45, 0], col: [0x6e5034, 0x9a7650], jit: 0.12 }); B.add(box(1.76, 0.07, 0.11), { at: [0, 0.93, 0.01], col: WOOD[0] }); B.add(box(1.76, 0.07, 0.11), { at: [0, 1.97, 0.01], col: WOOD[0] });
  B.add(box(2.1, 0.06, 0.55), { at: [0, 2.32, 0.08], rot: [0.22, 0, 0], col: [0x7a3a2a, 0xa04a34], flat: true });
  for (const [x, y, a] of [[-0.48, 1.5, 0.06], [0.02, 1.42, -0.05], [0.5, 1.52, 0.04]]) { B.add(box(0.36, 0.48, 0.01), { at: [x, y, 0.045], rot: [0, 0, a], col: [0xd8cba8, 0xf2e8cc] }); B.add(ico(0.022), { at: [x, y + 0.2, 0.06], col: 0x8a2a20 }); for (let k = 0; k < 3; k++) B.add(box(0.24, 0.018, 0.004), { at: [x, y + 0.08 - k * 0.08, 0.052], rot: [0, 0, a], col: 0x6a5a48 }); }
  return B.mesh();
}
function tableGeo() {      // 繪圖桌：長桌、攤開的地圖、墨水瓶、羽毛筆、尺、一捲紙
  const B = new B7(), hw = DRAW_TABLE07.hw, hd = DRAW_TABLE07.hd;
  B.add(box(hw * 2, 0.07, hd * 2), { at: [0, 0.86, 0], col: [0x6a4a2e, 0x8e6a44], jit: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(box(0.08, 0.84, 0.08), { at: [sx * (hw - 0.1), 0.42, sz * (hd - 0.08)], col: WOOD[0] });
  B.add(box(hw * 1.7, 0.05, 0.06), { at: [0, 0.25, 0], col: WOOD[0] });
  B.add(box(1.15, 0.006, 0.78), { at: [-0.12, 0.9, 0], rot: [0, 0.06, 0], col: [0xd9c79c, 0xeadbb4] });
  for (let k = 0; k < 6; k++) B.add(box(0.5 - k * 0.04, 0.004, 0.012), { at: [-0.2 + (k % 2) * 0.08, 0.905, -0.28 + k * 0.1], rot: [0, 0.3 * (k % 3 - 1), 0], col: k % 2 ? 0x5a7a9a : 0x7a5a3a });
  B.add(cyl(0.05, 0.06, 0.09, 8), { at: [0.62, 0.94, -0.22], col: 0x22283a }); B.add(cyl(0.03, 0.03, 0.03, 8), { at: [0.62, 1.0, -0.22], col: 0x8a6a3a });
  B.add(box(0.012, 0.012, 0.34), { at: [0.66, 1.02, -0.14], rot: [0.9, 0.3, 0], col: 0xf2efe6 }); B.add(box(0.5, 0.01, 0.05), { at: [0.55, 0.9, 0.2], rot: [0, -0.4, 0], col: 0xb08a4a });
  B.add(cyl(0.05, 0.05, 0.6, 8), { at: [0.2, 0.94, 0.38], rot: [0, 0.2, Math.PI / 2], col: [0xd9c79c, 0xeadbb4] });
  return B.mesh();
}
let PROPS = null;      // 美術的 props07.js（makeProp07(name, opt)）；還沒有或那個名字還沒做就用上面的暫代
const prop = (name, opt, fallback) => { try { const o = PROPS && PROPS.makeProp07 ? PROPS.makeProp07(name, opt || {}) : null; if (o && o.isObject3D) return o; } catch (e) { console.warn('props07', name, e); } return fallback(); };
const placeAt = (o, x, z, f, dy = 0) => { o.position.set(x, Hgt(x, z) + dy, z); o.rotation.y = f || 0; W.scene.add(o); return o; };

function addGlint(t) { t.glint = new THREE.Mesh(new THREE.OctahedronGeometry(t.k === 'jaw' ? 0.05 : 0.035, 0), MAT().glint); t.glint.position.set(t.k === 'jaw' ? 0.2 : 0, t.k === 'jaw' ? 0.11 : 0.27, t.k === 'jaw' ? 0.18 : 0); t.obj.add(t.glint); }
/* ============================== 建立 ============================== */
let stakes = [], marks = [], boardObj = null, tableObj = null, remoteJaw = new Map(), tutorCache = false;
function build() {
  ensure();
  for (const t of T) {
    const d = t.d; t.y = Hgt(d.x, d.z);
    if (t.k === 'jaw') { t.open = prop('trap_jaw', {}, () => jawGeo(false)); t.shut = prop('trap_jaw_closed', {}, () => jawGeo(true)); }
    else { const len = Math.round(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) * 10) / 10; t.len = len; t.f = Math.atan2(d.b[0] - d.a[0], d.b[1] - d.a[1]) - Math.PI / 2; t.open = prop('trap_bell', { len }, () => bellGeo(len, false)); t.shut = prop('trap_bell_cut', { len }, () => new THREE.Group()); }      // 絆索：繩子照實際長度（觸發也照這條線）；絆到之後鈴晃一下再收掉
    t.obj = new THREE.Group(); t.obj.add(t.open, t.shut); t.shut.visible = false; t.obj.visible = false;
    if (!(t.open.userData && t.open.userData.glint)) addGlint(t);      // 美術模型自己會閃（userData.glint）就不另外加一顆（每個看得到的陷阱少一次繪製）
    placeAt(t.obj, d.x, d.z, t.k === 'jaw' ? d.f : t.f, 0.005);
  }
  for (const s of STAKES07) { let art = true; const o = prop('stake_red', { lean: s.lean, fallen: s.lean > 0.5 }, () => { art = false; return stakeGeo(); }); placeAt(o, s.x, s.z, s.f, art ? 0 : -0.04); if (!art) o.rotation.z = s.lean; o.visible = false; stakes.push({ s, o }); }
  const groups = WILD07; for (const m of WILD_MARKS07) { const gq = groups[m.g]; if (!gq || gq.t > WILD_TIER07) continue; let o;
    if (m.kind === 'claw') o = m.tree ? clawMesh(m.r) : prop('claw_tree', { seed: m.g + 3 }, () => marksGeo('snag'));
    else if (m.kind === 'bones') o = prop('bone_pile', { seed: m.g + 5 }, () => marksGeo('bones'));
    else if (m.kind === 'bed') o = prop('beast_bed', {}, () => marksGeo('bed'));
    else o = prop('paw_prints', { type: gq.type }, () => printsMesh(gq.type));
    const wrap = o.isGroup ? o : new THREE.Group().add(o); placeAt(wrap, m.x, m.z, m.f, m.kind === 'prints' ? 0.05 : 0); if (m.tree) wrap.position.y = Hgt(m.x, m.z); wrap.visible = false; marks.push({ m, o: wrap }); }
  // 委託板、繪圖桌（碰撞：板子一根圓柱；桌子沿長邊兩個圓）
  { const b = BOARD07; boardObj = placeAt(prop('board', { cards: 3 }, boardGeo), b.x, b.z, b.f); addCollider(b.x, b.z, b.r, 2.4); }
  { const t = DRAW_TABLE07; tableObj = placeAt(prop('draw_table', {}, tableGeo), t.x, t.z, t.f); const ux = Math.cos(t.f), uz = -Math.sin(t.f); for (const s of [-1, 1]) addCollider(t.x + ux * s * (t.hw - 0.45), t.z + uz * s * (t.hw - 0.45), 0.62, 1.0); }
  markWildSites(); if (Gather && Gather.setAvoid) Gather.setAvoid(pathHits);      // 0.7（d7-play）：按住互動鍵自動採集時，不自己走進看得到的陷阱
  S.ready = true;
}
// 這條路（x0,z0 → x1,z1）會不會碰到「看得到、還在、沒夾上」的陷阱：起點附近 0.5 公尺不算（人站在陷阱旁邊往外走沒關係）。教學夾子也避開（不會觸發，但走上去很怪）
function pathHits(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) return false; const k = Math.min(0.5, L) / L, sx = x0 + (x1 - x0) * k, sz = z0 + (z1 - z0) * k;
  for (const t of T) { if (!t.vis || !live(t) || t.closed >= 0) continue; if (Math.hypot(t.x - x0, t.z - z0) > L + 8) continue;
    if (t.k === 'jaw' ? segD(t.x, t.z, [sx, sz], [x1, z1]) < K.jawR + 0.6 : (crosses(sx, sz, x1, z1, t.d.a, t.d.b) || segD(x1, z1, t.d.a, t.d.b) < K.bellR + 0.4 || segD(sx, sz, t.d.a, t.d.b) < K.bellR + 0.4)) return true; }
  return false;
}
// 荒地裡的採集片：在採集片上記 wild7＝倍率（gather.js 長回來決定大株時乘上它）
function markWildSites() { for (const s of GATHER_SITES || []) { let x = s.x, z = s.z; if (x == null && s.pts && s.pts.length) { x = 0; z = 0; for (const p of s.pts) { x += p[0]; z += p[1]; } x /= s.pts.length; z /= s.pts.length; } if (x != null) s.wild7 = isWild(x, z) ? WILD_RULE07.big : 1; } }
// 委託板的模型（美術的 board：userData.setCards(n) 換板上的卡片數、userData.cardSlots）給 w7-story 用；繪圖桌給 w7-map
export const board07 = () => boardObj, drawTable07 = () => tableObj;
export const wildSites = () => (GATHER_SITES || []).filter(s => s.wild7 > 1).map(s => s.id);

/* ============================== 觸發、夾住、掙脫、解救、拆除 ============================== */
const sfx = (n, a, t) => ui.sfx(n, a, t ? { x: t.x, z: t.z } : undefined);      // 音效事件：trap（夾上）、bell（鈴響）、disarm（拆下）、free（掙脫）；音效成員還沒做之前沒有聲音
function trigger(t) {
  const d = t.d; gone(t, 'shut'); tellGone(t.i, 0); debug.questAct('doTrap');
  if (t.k === 'jaw') {
    S.held = { i: t.i, x: d.x, z: d.z, left: K.hold, t: 0 }; me.dodge = null; me.rush = null; me.sprinting = false; me.seatGo = null; me.vx = me.vz = 0;
    const dmg = Math.max(1, Math.round(D.maxHp * K.dmg * D.defMul * (1 - M6.dr))), y = Hgt(me.x, me.z);      // 照一般傷害算減傷（防禦、披肩與料理）；不會把人夾死
    me.hp = Math.max(1, me.hp - dmg); me.flash = 1; me.lastCombat = getClock(); Gather.cancel(); Needs.stand(); Craft.cancel();
    popNumber(me.x, y + 2.8, me.z, '-' + dmg, 'hurt'); popNumber(me.x, y + 3.4, me.z, '捕獸夾！', 'hurt'); ui.hurt(); ui.sfx('ouch', me.avatar.look.g ? 'f' : 'm'); emit(d.x, y + 0.2, d.z, 14, [0.6, 0.5, 0.36], 2.6, 1.6, 0.5, 4); emit(d.x, y + 0.3, d.z, 8, [2.6, 2.4, 2.0], 4, 1.2, 0.25, 6);
    sfx('trap', 'jaw', t); ui.tip('trap7held', `被舊捕獸夾夾住了：${K.hold} 秒內不能走、不能閃避，但可以攻擊、格擋、喝藥。連按 ${keyOf('interact')} 掙脫得快一點；隊友走過來按 ${keyOf('interact')} 能直接幫你掰開。`);
    noise(d.x, d.z, K.jawNoise);
  } else {
    const y = Hgt(d.x, d.z); popNumber(me.x, y + 3.2, me.z, '鈴！', 'other'); emit(d.x, y + 0.3, d.z, 10, [2.4, 2.0, 1.0], 2.6, 1.4, 0.4, 4); sfx('bell', 0, t);
    ui.tip('trap7bell', '絆到舊絆索了：鈴聲會把附近的野獸引過來。繩子在小腿的高度，靠近一點看得到反光；從繩子的一端繞過去就好。');
    noise(d.x, d.z, K.bellNoise);
  }
}
// 一個陷阱對我沒了：shut＝夾上／絆斷（模型留在原地一陣子）、taken＝被拆走（直接不見）。fromRemote：看到別人弄的
function gone(t, how, fromRemote) {
  if (P.trapGone[t.i] && t.closed >= 0) return; P.trapGone[t.i] = 1; Store.dirty = true; if (S.disarm && S.disarm.i === t.i) S.disarm = null;
  if (how === 'shut' && t.obj) { t.closed = 0; t.open.visible = t.k === 'bell'; t.shut.visible = t.k !== 'bell'; t.obj.visible = t.vis || !fromRemote || distTo(t, me.x, me.z) < 40; t.obj.scale.setScalar(1.25); if (fromRemote && t.obj.visible) { const y = Hgt(t.x, t.z); emit(t.x, y + 0.2, t.z, 10, [0.6, 0.5, 0.36], 2.4, 1.4, 0.45, 4); sfx(t.k === 'jaw' ? 'trap' : 'bell', t.k, t); } }
  else if (t.obj) { t.closed = -1; t.obj.visible = false; }
}
function release(why, who) {
  const h = S.held; if (!h) return; S.held = null; const y = Hgt(me.x, me.z);
  if (why === 'free') { popNumber(me.x, y + 3.2, me.z, (who || '隊友') + ' 幫你掰開了', 'heal'); ui.log(`${who || '隊友'} 幫你掰開了捕獸夾。`); } else popNumber(me.x, y + 3.2, me.z, '掙脫', 'other');
  sfx('free', 0); emit(me.x, y + 0.3, me.z, 8, [0.6, 0.5, 0.36], 2, 1.2, 0.4, 4);
}
function springAt(t, how) { gone(t, 'shut'); tellGone(t.i, 2); const y = Hgt(t.x, t.z); popNumber(t.x, y + 1.2, t.z, '空夾', 'other'); emit(t.x, y + 0.25, t.z, 12, [2.6, 2.4, 2.0], 4, 1.4, 0.25, 6); sfx('trap', 'jaw', t); noise(t.x, t.z, K.jawNoise); debug.questAct('doSpring'); }
// 用武器或箭打到夾子 → 空夾（沒有獎勵；學會的人也可以這樣做）。絆索打不掉。教學夾子不算（f03 要親手拆）
function watchAttack() {
  const a = me.atk; if (a !== S.atk) { S.atk = a; S.atkHi = 0; } if (!a) return;
  while (S.atkHi < a.hi) { S.atkHi++; const A = a.A || {}, f = me.f, sf = Math.sin(f), cf = Math.cos(f);
    for (const t of T) { if (t.k !== 'jaw' || t.tutor || !live(t)) continue; const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz); if (d > 26) continue;
      if (A.bolt || A.arrow) { const al = dx * sf + dz * cf, side = Math.abs(dx * cf - dz * sf); if (al > 0 && al < (A.range || 16) && side < 0.6) { springAt(t); break; } }
      else { const rng = (A.nova || A.range || 2.6) + 0.45; if (d > rng) continue; if (A.nova || d < 1.0 || (A.arc || 1) >= 3 || Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - f), Math.cos(Math.atan2(dx, dz) - f))) <= (A.arc || 1)) springAt(t); } } }
}
// 互動鍵（game.js interact() 最前面呼叫；回傳 true＝這一下歸陷阱用）
export function interact() {
  if (OFF || !S.ready || !input.started || !me.alive || input.talk) return false;
  if (S.held) { const h = S.held; h.left = Math.max(h.left - K.mash, K.holdMin); /* left＝這次總共夾幾秒（和 h.t 比） */ popNumber(me.x, Hgt(me.x, me.z) + 2.6, me.z, '用力！', 'other'); if (deco.press) deco.press(); sfx('block', 0); return true; }
  const r = heldNear(); if (r) { nset('fr', [++S.frN, r.peer], true); S.frT = K.frT; popNumber(r.x, Hgt(r.x, r.z) + 2.8, r.z, '掰開！', 'heal'); ui.log(`你幫 ${r.name} 掰開了捕獸夾。`); debug.questAct('doTrapFree'); return true; }
  const t = nearTrap(K.disarmR); if (!t) return false;
  if (!(t.tutor || learned())) { ui.toast(t.k === 'jaw' ? '還不會安全地拆下舊捕獸夾。可以繞過去，或用武器、箭打它讓它空夾（會響）。獵人營地的哈根當年埋過這種夾子。' : '絆索的鈴一碰就響，還不會割。從繩子的一端繞過去。'); ui.sfx('deny'); return true; }
  if (me.atk || me.dodge || me.cast || me.drink || me.swim) return true;
  S.disarm = { i: t.i, t: 0, dur: t.k === 'jaw' ? K.disarmJaw : K.disarmBell, x: me.x, z: me.z, hp: me.hp }; me.guard = false; Gather.cancel(); return true;
}
function heldNear() { let best = null, bd = K.freeR; for (const r of remotes.values()) { if (!r.t7held) continue; const d = Math.hypot(r.x - me.x, r.z - me.z); if (d < bd) { bd = d; best = r; } } return best; }
function nearTrap(rad) { let best = null, bd = rad; for (const t of T) { if (!t.vis || !live(t) || t.closed >= 0) continue; const d = distTo(t, me.x, me.z); if (d < bd) { bd = d; best = t; } } return best; }
function disarmTick(dt) {
  const k = S.disarm; if (!k) return; const t = T[k.i];
  if (!input.useHeld || !live(t) || me.hp < k.hp - 0.01 || Math.hypot(me.x - k.x, me.z - k.z) > 0.7 || me.atk || me.dodge || me.cast || S.held || !me.alive) { if (me.hp < k.hp - 0.01) popNumber(me.x, Hgt(me.x, me.z) + 3, me.z, '中斷', 'hurt'); S.disarm = null; return; }
  me.f = Math.atan2(t.x - me.x, t.z - me.z); k.t += dt; if (k.t < k.dur) return;
  S.disarm = null; gone(t, 'taken'); tellGone(t.i, 1); const y = Hgt(t.x, t.z); emit(t.x, y + 0.3, t.z, 12, [0.6, 0.5, 0.36], 2, 1.4, 0.45, 4); sfx('disarm', t.k, t);
  debug.questAct('doDisarm'); debug.questAct('doDisarm:' + t.k);
  if (t.tutor) { debug.questAct('doDisarm:f03'); popNumber(t.x, y + 1.4, t.z, '拆下來了', 'heal'); }
  else if (t.k === 'jaw') { addItem('scrap', 1); ui.loot('拆下舊捕獸夾：舊鐵件 ×1', ['scrap']); gainExp(Math.round(E1(P.lv) * 0.5), t.x, t.z); }
  else { popNumber(t.x, y + 1.4, t.z, '割斷絆索', 'heal'); gainExp(Math.round(E1(P.lv) * 0.25), t.x, t.z); }
}
export const held = () => !!S.held;
export const deco = {};      // 0.7 介面（d7-ui-t）：ui07t.js 設 deco.hud(held, disarm, K)、deco.press()、deco.see(trap)
// 互動提示（game.js 的 ui.prompt 用；沒有就回空字串，照原本的提示）
export function hint() {
  if (OFF || !S.ready || !me.alive || input.talk) return '';
  if (S.held) return `被捕獸夾夾住了：連按 ${keyOf('interact')} 掙脫（還有 ${Math.max(0, S.held.left - S.held.t).toFixed(1)} 秒）`;
  const r = heldNear(); if (r) return `按 ${keyOf('interact')} 幫 ${r.name} 掰開捕獸夾`;
  if (S.disarm) return '';
  const t = nearTrap(K.disarmR + 0.6); if (!t) return '';
  if (t.tutor || learned()) return t.k === 'jaw' ? `按住 ${keyOf('interact')} 拆下舊捕獸夾` : `按住 ${keyOf('interact')} 割斷絆索`;
  return t.k === 'jaw' ? '舊捕獸夾：繞過去，或用武器打它讓它空夾' : '舊絆索：從繩子的一端繞過去';
}

/* ============================== 每幀（game.js tick() 在 updateMe 之後呼叫） ============================== */
export function tick(dt) {
  if (OFF) return; S.dt = dt;
  if (!S.ready) { if (!W.scene) return; build(); import('./props07.js').then(m => { PROPS = m; rebuildProps(); }).catch(() => {}); import('./story07.js').then(m => { S.story = m; }).catch(() => {}); }
  ensure(); if (!input.started || input.creator) return;
  const x0 = S.lx, z0 = S.lz; S.lx = me.x; S.lz = me.z;
  // 夾住：位置釘在夾子上（招式的突進、擊退、疾步斬都不會把人帶走）
  if (S.held) { const h = S.held; if (!me.alive) S.held = null; else { me.x = h.x; me.z = h.z; me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.rush = null; me.sprinting = false; h.t += dt; if (h.t >= h.left) release('time'); } S.lx = me.x; S.lz = me.z; }
  // 觸發：這一幀走過的線段碰到夾子半徑或繩子（翻滾照樣觸發）。野獸不觸發（只檢查自己）；城裡、倒下、游泳中不觸發
  else if (me.alive && !me.inSafe && !me.swim && Math.hypot(me.x - x0, me.z - z0) < 6) {
    for (const t of T) { if (t.tutor || !live(t) || t.closed >= 0) continue; const dx = t.x - me.x, dz = t.z - me.z; if (dx * dx + dz * dz > 64) continue;      /* d7-play：f03 的教學夾子不會觸發（踩掉就永遠拆不到、f03 卡死） */
      if (t.k === 'jaw' ? segD(t.x, t.z, [x0, z0], [me.x, me.z]) < K.jawR : (segD(me.x, me.z, t.d.a, t.d.b) < K.bellR || crosses(x0, z0, me.x, me.z, t.d.a, t.d.b))) { trigger(t); break; } }
  }
  watchAttack(); disarmTick(dt); remoteTick(); toby();
  // 看得到：夾子 6 公尺（絆索 8）內出現；找到過的之後一直畫（在 60 公尺內）。夾上的留在原地，走遠 30 公尺才收掉
  const tut = tutorOn(); if (tut !== tutorCache) { tutorCache = tut; S.resync = true; }
  if (tut) tutorHeal();
  for (const t of T) {
    if (!t.obj) continue; const d = distTo(t, me.x, me.z);
    if (t.closed >= 0) { t.closed += dt; t.obj.scale.setScalar(lerp(t.obj.scale.x, 1, Math.min(1, dt * 14)));
      if (t.k === 'bell') { t.open.visible = t.closed < 1.4; t.open.rotation.x = Math.sin(t.closed * 38) * 0.25 * Math.max(0, 1 - t.closed / 1.4); t.shut.visible = !t.open.visible; }      // 鈴晃 1.4 秒，然後換成斷掉垂地的繩子（美術的 trap_bell_cut；沒有就是空的）      // 絆索：鈴晃一陣子，繩子斷掉收起來
      if (d > K.keepClosed && t.closed > 2) { t.closed = -1; t.obj.visible = false; } continue; }
    if (!live(t)) { if (t.obj.visible) t.obj.visible = false; t.vis = false; continue; }
    const see = d < seeR(t), was = t.vis; t.vis = (see || !!P.trapSeen[t.i]) && d < 60;
    if (t.vis !== t.obj.visible || S.resync) { t.obj.visible = t.vis; t.open.visible = true; t.shut.visible = false; t.obj.scale.setScalar(1); }
    if (see && !P.trapSeen[t.i]) { P.trapSeen[t.i] = 1; Store.dirty = true; if (!t.tutor) { const y = Hgt(t.x, t.z); popNumber(t.x, y + 1.3, t.z, t.k === 'jaw' ? '捕獸夾' : '絆索', 'other'); fxRing(t.x, t.z, 0.4, 1.4, 0.4, [2.4, 2.0, 1.2]); if (deco.see) deco.see(t); ui.tip('trap7see', `路上有斷鍊之夜後埋下的舊陷阱：捕獸夾（${K.jawSee} 公尺內看得到翻過的土與鐵光）、絆索鈴（${K.bellSee} 公尺內看得到繩子）。路邊插著紅布的木樁，表示附近 15 公尺內有一個。看到就繞過去。`); } }
    if (!was && t.vis) t.obj.position.y = Hgt(t.x, t.z) + 0.005;
  }
  S.resync = false;
  MAT().glint.opacity = (0.25 + 0.55 * Math.max(0, Math.sin(getClock() * 2.3)) ** 6) * (W.rain08 ? W.rain08.rain08State().glint : 1);      // 0.8：雨中鐵光看不到（d8-play-p4）；原註解接在後面 //      // 鐵光：一閃一閃（暫代模型用；美術模型的鐵光由 props07 的共用材質自己閃）
  if (PROPS && PROPS.setNight07) PROPS.setNight07(W.night || 0);
  if (PROPS && PROPS.setMe07) PROPS.setMe07(me.x, me.z, W.rain08 ? W.rain08.glintR08((survey() ? K.bellSeeSurvey : K.bellSee) + 1) : (survey() ? K.bellSeeSurvey : K.bellSee) + 1);      // 0.8：雨中半徑 0.01（不能傳 0＝不限距離）      // d8-art：鐵光只在看得到的距離附近亮（找到過、在 60 公尺內一直畫的陷阱，遠了就不閃）
  pressGrass(dt);      // 夜裡：美術模型的鐵光、委託板與繪圖桌的燈變亮（看得到的距離不變）
  if ((S.visT -= dt) <= 0) { S.visT = 0.4; for (const q of stakes) q.o.visible = Math.hypot(q.s.x - me.x, q.s.z - me.z) < 75; for (const q of marks) q.o.visible = Math.hypot(q.m.x - me.x, q.m.z - me.z) < 80; }
  remoteVis(); hud();
}
// 其他玩家被夾住時：在他腳下畫一個夾上的夾子（只是畫面）
// d8-art：看得到的陷阱腳下壓草（world.js 的 grassPress07；最近的 4 個、0.5 秒淡入）。捕獸夾：翻土 0.78 公尺內不長草、外圈 0.6 公尺壓低；絆索：沿繩子 0.25 公尺壓低
const pressL = [];
function pressGrass(dt) { pressL.length = 0;
  for (const t of T) { if (!t.obj) continue; const on = t.obj.visible ? 1 : 0; t.pk = clamp((t.pk || 0) + (on ? dt * 2.2 : -dt * 4), 0, 1); if (t.pk <= 0) continue; const d = distTo(t, me.x, me.z); if (d > 45) continue;
    pressL.push(t.k === 'jaw' ? { ax: t.x, az: t.z, bx: t.x, bz: t.z, r: 0.8, k: t.pk, ring: 0.6, cut: 1, d } : { ax: t.d.a[0], az: t.d.a[1], bx: t.d.b[0], bz: t.d.b[1], r: 0.22, k: t.pk, ring: 0.35, cut: 0, d }); }
  pressL.sort((a, b) => a.d - b.d); grassPress07(pressL); }
function remoteVis() { for (const r of remotes.values()) { let o = remoteJaw.get(r.peer); if (r.t7held) { if (!o) { o = prop('trap_jaw_closed', {}, () => jawGeo(true)); W.scene.add(o); remoteJaw.set(r.peer, o); } o.visible = true; o.position.set(r.x, Hgt(r.x, r.z) + 0.01, r.z); } else if (o) o.visible = false; } for (const [p, o] of remoteJaw) if (!remotes.has(p)) { W.scene.remove(o); remoteJaw.delete(p); } }
function rebuildProps() {      // 美術的模型晚一點才載到：把暫代換掉
  if (!PROPS || !PROPS.makeProp07) return; const swap = (o, name, opt) => { const n = prop(name, opt, () => null); if (!n) return o; n.position.copy(o.position); n.rotation.copy(o.rotation); n.visible = o.visible; W.scene.remove(o); W.scene.add(n); return n; };
  for (const q of stakes) if (!q.o.name || !q.o.name.startsWith('prop:')) { q.o = swap(q.o, 'stake_red', { lean: q.s.lean, fallen: q.s.lean > 0.5 }); q.o.rotation.z = 0; }
  if (!(boardObj.name || '').startsWith('prop:')) boardObj = swap(boardObj, 'board', { cards: 3 }); if (!(tableObj.name || '').startsWith('prop:')) tableObj = swap(tableObj, 'draw_table', {});
  for (const t of T) { if (t.open && t.open.name && t.open.name.startsWith('prop:')) continue; const a = t.k === 'jaw' ? prop('trap_jaw', {}, () => null) : prop('trap_bell', { len: t.len }, () => null), b = t.k === 'jaw' ? prop('trap_jaw_closed', {}, () => null) : prop('trap_bell_cut', { len: t.len }, () => new THREE.Group());
    if (a && b) { t.obj.remove(t.open, t.shut); t.open = a; t.shut = b; t.obj.add(a, b); t.open.visible = t.closed < 0; t.shut.visible = t.closed >= 0; if (a.userData && a.userData.glint && t.glint) { t.obj.remove(t.glint); t.glint = null; } } }
}
// 托比：0.7 之後第一次出南門、而且 2 級以上時說一次（台詞由劇情成員的 story07.js 提供 TRAP_TEXT.toby；還沒有就用這裡的）
const TOBY_DEF = ['報告！出門前一件事：斷鍊之夜後，獵戶在城外的路上埋過捕獸夾、拉過絆索鈴，現在沒人記得在哪。', '路邊插著紅布的木樁，就是附近有陷阱的記號。看到就放慢，盯著地面走。往鏡池那條路，第一個彎就有一個。'];
function toby() {
  const out = !me.inSafe, wasSafe = S.wasSafe; S.wasSafe = !out; if (!out || !wasSafe || P.trapToby || P.lv < 2) return; if (!(me.z > 36 && Math.abs(me.x) < 14)) return;
  P.trapToby = 1; Store.dirty = true; const tx = S.story && S.story.TRAP_TEXT && S.story.TRAP_TEXT.toby, lines = Array.isArray(tx) ? tx : tx ? [tx] : TOBY_DEF;
  const n = npcs.find(o => o.id === 'guard'); if (n && n.tag) tagSay(n.tag, lines[0]); lines.forEach(l => ui.chat('托比', l, '#e8c070')); debug.questAct('doToby');
}
// 夾住、拆除的進度條（樣式照採集的進度條；放在它上面一點）
function hud() {
  if (deco.hud && deco.hud(S.held && { left: S.held.left, t: S.held.t }, S.disarm && { t: S.disarm.t, dur: S.disarm.dur, jaw: T[S.disarm.i].tutor || T[S.disarm.i].k === 'jaw' }, K)) return;      // 0.7 介面：面板由 ui07t.js 畫
  if (!S.ui) { const st = document.createElement('style'); st.textContent = '#trap7{left:50%;bottom:168px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;width:236px;padding:6px 14px 7px 9px;border-radius:8px;background:var(--panel,rgba(30,24,18,.85));border:1px solid var(--line-strong,#6a5a44);box-shadow:0 4px 12px rgba(0,0,0,.4);opacity:0;transition:opacity .12s}#trap7.on{opacity:1}#trap7>div{flex:1;min-width:0}#trap7 b{display:block;font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#trap7 .nbar{display:block;margin-top:4px;height:6px}#trap7 .nbar i{transition:none}#trap7.held .nbar i{background:linear-gradient(#ff9a7a,#c8452e)}#trap7 svg{width:26px;height:26px;flex:none}body.talking #trap7{opacity:0!important}';
    document.head.appendChild(st); const e = document.createElement('div'); e.className = 'hud'; e.id = 'trap7'; e.innerHTML = '<svg viewBox="0 0 26 26"><path d="M3 15 A10 10 0 0 1 23 15" fill="none" stroke="#c9c2b4" stroke-width="2.2"/><path d="M3 15 A10 10 0 0 0 23 15" fill="none" stroke="#8d877c" stroke-width="2.2"/><path d="M6 13l1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3" fill="none" stroke="#e8e2d4" stroke-width="1.2"/><circle cx="13" cy="15" r="2.2" fill="#a0603a"/></svg><div><b></b><div class="nbar"><i></i></div></div>'; document.body.appendChild(e); S.ui = { e, b: e.querySelector('b'), i: e.querySelector('.nbar i') }; }
  const U = S.ui, h = S.held, k = S.disarm; let on = false;
  if (h) { on = true; U.b.textContent = `夾住了　連按 ${keyOf('interact')}`; U.i.style.transform = `scaleX(${clamp(1 - h.t / Math.max(0.01, h.left), 0, 1).toFixed(3)})`; }
  else if (k) { on = true; const t = T[k.i]; U.b.textContent = t.tutor || t.k === 'jaw' ? '拆下捕獸夾…' : '割斷絆索…'; U.i.style.transform = `scaleX(${clamp(k.t / k.dur, 0, 1).toFixed(3)})`; }
  if (on !== U.on) { U.on = on; U.e.classList.toggle('on', on); } U.e.classList.toggle('held', !!h);
}

/* ============================== 測試用 ============================== */
export const debug07 = { S, T, K, lureHost, isWild, trigger: i => trigger(T[i]), release, learned, tutorOn, wildGroups, nearTrap, E1, rebuildProps, objs: () => ({ stakes, marks, boardObj, tableObj }) };

/* ============================== presence 欄位（多人） ==============================
   nz = [序號, x, z, 半徑]：我踩到夾子或絆索，請主控端引怪（掛 2 秒後清掉；主控端是自己就不送，直接引）。約 22 位元組
   tr = [序號, 陷阱編號, 0 踩到／1 拆掉／2 打空]：20 公尺內的人看到就把那個陷阱記成沒了（掛 3 秒）。約 14 位元組
   th = 1：我正被夾住（別人才看得到、才能走過來按互動鍵幫我掰開）。6 位元組
   fr = [序號, 對方 peer]：我幫誰掰開（掛 2 秒）。約 40–50 位元組（peer 代號的長度）
   最壞同時都有約 90 位元組（0.6a 最壞約 1,280，上限 4 KiB）。荒地的野獸讓主控端的 ms、md 各多一個字元／隻（第一批 16 隻＝多 32 位元組，加滿 30 隻＝多 60）。 */
