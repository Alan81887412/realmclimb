// 0.7 新野獸的招式、行為與協同：斷鍊鬥犬（協同包夾、咬住拖住＋背後飛撲、吠叫集火）、野牛（鬥牛式暴衝、衝過頭回身再衝、撞上岩石或樹會暈）、沼蟒（噴毒留毒池、撲纏＋扭絞、甩尾）
// 0.7 只做「測試用生成」：預設不進世界，牠們的資料（MON07、MOVES07）在第一次生成時才併進 core.js 的 MON／MOVES（招式編號接在現有的後面，每個人併進來的順序一樣，編號就一樣）。
//   主控台：__beast07.spawn('dog'｜'bison'｜'python')  在自己前方生成一組；__beast07.sites 是放進世界的設定（enabled: false）
// 介面（game.js 的補丁只做匯入＋呼叫）：init(ctx)｜owns(w)｜host(w, X)｜bump(w)｜post(w)｜shape(v, M)｜onHurt(v, M, res)｜pool(v, s, M)｜make(type, size, elite)｜frame(dt)
// 判定照現有的規則：主控端模擬怪物，每個人只判定自己有沒有被打中；預警（moveShape）＝判定。纏繞、咬住、挑飛、毒池的效果由「被打中的那個人」自己算，
//   被纏住的人在 presence 放 h7＝[怪物編號]（主控端看到才開始扭絞；掙脫就清掉），毒池由招式資料決定（每個人自己畫、自己判定），不另外同步。
import * as THREE from './three.bundle.js';
import { MON, MOVES, MOVE_IDS, MON_BASE_LV, MST, TAU, clamp, lerp, angDiff, dampAng, monStats } from './core.js';
import { W, Hgt, monBlocked, collide } from './world.js';
import { popNumber, emit, fxRing, fxDisc, fx } from './actors.js';
import { actionOf, keyOf } from './keys.js';
import * as B07m from './beasts07.js';      // 0.7a（d8-play-p1）：模型直接匯入（beasts07.js 只匯入 three.bundle.js 與 props07.js，不會繞回來）
import { BEAST_TIER08 } from './places08.js';      // 0.7a：新野獸放進世界的開關（0＝不放）
import { AI } from './core.js';      // 0.8：AI.reset（脫戰幾秒後恢復滿血，坑蟒沉下後自己照這個規則重置）
import * as H8 from './hooks08.js';      // 0.8：上限 H8.capped、senseK
import * as P08 from './places08.js'; import * as PT from './patrol08.js';      /* 0.8：PITS08（P1-b 交了才有；沒有就用 PIT_FALLBACK 的暫定值）；R4：鬥犬巡邏、長吠叫同伴、栗子走開（patrol08.js 不匯入本檔，不會循環） */
const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, PI = Math.PI;

/* ============================== 資料 ============================== */
// 數值第一版：以同級猛虎、棕熊為基準（monStats 的倍率 1＋0.13×(等級−基準等級)，在基準等級就是下面的數字）。
//   野牛 11 級 3 頭一群：單頭血量約棕熊的四成，一群合計約 1.3 頭同級棕熊；衝撞是重擊（擋不住、會挑飛），但撞到障礙物會暈 2.6 秒。第一次量（攻 44、衝撞 ×1.25）站著打掉 44% 生命，降到攻 40、×1.15／×0.95。
//   沼蟒 12 級單隻：血量約同級棕熊 1.2 倍、攻擊≈棕熊；纏住最久 5.5 秒（自己連按約 2 秒可掙脫），扭絞一秒比一秒痛。
//   鬥犬 13 級 3 隻一群：單隻比同級灰狼略強（血 300、攻 38），三隻合計血量約 1.4 頭同級猛虎；難在協同。
// 經驗：monStats 已經乘上數值定案的 ×1.25^(等級−1)；每點血量給的經驗介於棕熊與猛虎之間。掉落先用現有的素材（新素材等 data07 定）。
export const MON07 = {
  bison: { name: '野牛', temper: 'neutral', hp: 260, dmg: 40, exp: 40, speed: 6.2, aggro: 12, orbit: 10, pace: 1.15, atk: 'charge', wind: 1.35, dash: 19, dashT: 1.15, recover: 1.0, hitR: 2.4, size: 1.0, body: 1.15, tagH: 2.7, gold: [8, 15], drops: [['meat', 0.9], ['meat', 0.6]], moves: ['bison_rush', 'bison_hook', 'bison_buck'], orbs: ['wall', 'cleave'] },
  python: { name: '沼蟒', temper: 'ambush', hp: 780, dmg: 50, exp: 70, speed: 3.6, aggro: 10, orbit: 5, pace: 1.25, atk: 'coil', wind: 0.9, dash: 0, dashT: 0.34, recover: 0.9, hitR: 2.4, size: 1.0, body: 1.05, tagH: 2.6, gold: [15, 26], drops: [['meat', 0.4]], moves: ['py_spit', 'py_coil', 'py_sweep', 'py_bite'], orbs: ['heal', 'wall'] },
  dog: { name: '斷鍊鬥犬', temper: 'pack', hp: 300, dmg: 38, exp: 30, speed: 7.0, aggro: 15, orbit: 5.2, atk: 'lunge', wind: 0.55, dash: 6.2, dashT: 0.32, recover: 0.7, hitR: 1.5, size: 1.0, body: 0.8, tagH: 2.0, gold: [6, 11], drops: [], moves: ['dog_bite', 'dog_chain'], orbs: ['dash', 'blade'] }
};
export const LV07 = { bison: 11, python: 12, dog: 13 };
const mv = (name, anim, shape, o) => Object.assign({ name, anim, shape, wind: 0.6, strike: 0.3, recover: 0.7, dash: 0, at: 0, dmg: 1, min: 0, max: 3, w: 1.8, r: 3, r0: 0, arc: 1, off: 0, dir: 0, track: 0.6, cd: 0, low: 1 }, o);
// 新欄位：sh7 預警形狀由 shape() 決定｜nj 不判定（狀態用的招）｜steer 出招前段每秒最多修正幾弧度｜toss 打中會挑飛｜argOff 圓心在 arg/10 公尺外（不位移）｜pool 落地留毒池｜grab 打中會被纏住｜latch 打中會被咬住
export const MOVES07 = {
  bison_rush: mv('鬥牛衝', 'charge', 'line', { chain: ['bison_gore', 'bison_regore'], min: 6, max: 20, cd: 6.5 }),
  bison_gore: mv('鬥牛衝', 'charge', 'line', { wind: 1.35, strike: 1.15, recover: 2.4, dash: 19, w: 2.3, min: 6, max: 20, dmg: 1.15, heavy: 1, armor: 1, track: 0.85, steer: 0.3, toss: 1, sh7: 1 }),
  bison_regore: mv('回身再衝', 'charge', 'line', { wind: 1.0, strike: 1.0, recover: 1.1, dash: 16, w: 2.3, min: 0, max: 40, dmg: 0.95, heavy: 1, armor: 1, track: 0, steer: 0.25, toss: 1, sh7: 1 }),
  bison_hook: mv('角挑', 'toss', 'cone', { wind: 0.72, strike: 0.25, recover: 0.75, r: 3.4, arc: 0.85, at: 0.12, dmg: 0.9, max: 3.4, heavy: 1, toss: 1 }),
  bison_buck: mv('後踢', 'kick', 'cone', { wind: 0.5, strike: 0.22, recover: 0.6, r: 3.5, arc: 0.8, dir: PI, at: 0.08, dmg: 0.8, max: 3.4, behind: 1, track: 0 }),
  bison_daze: mv('撞暈', 'daze', 'circle', { wind: 0.1, strike: 0.1, recover: 2.6, r: 0, nj: 1, sh7: 1 }),
  py_spit: mv('噴毒', 'spit', 'circle', { wind: 0.95, strike: 0.6, recover: 0.8, r: 2.3, at: 0.6, dmg: 0.6, min: 4.5, max: 14, argOff: 1, pool: 1, cd: 5, track: 0.9 }),
  py_coil: mv('撲纏', 'coil', 'line', { wind: 0.9, strike: 0.34, recover: 0.9, dash: 4.6, w: 1.8, min: 1.8, max: 6.2, dmg: 0.5, grab: 1, cd: 7, track: 0.7 }),
  py_crush: mv('扭絞', 'crush', 'circle', { wind: 0.1, strike: 5.5, recover: 1.2, r: 0, nj: 1, sh7: 1 }),
  py_sweep: mv('甩尾', 'sweep', 'circle', { wind: 0.8, strike: 0.5, recover: 0.7, r: 4.0, at: 0.25, dmg: 0.85, max: 3.8, armor: 1 }),
  py_bite: mv('咬', 'coil', 'line', { wind: 0.6, strike: 0.26, recover: 0.6, dash: 3.0, w: 1.6, min: 1.5, max: 4.2, dmg: 0.75 }),
  dog_bite: mv('撲咬', 'bite', 'line', { wind: 0.55, strike: 0.32, recover: 0.7, dash: 6.2, w: 1.6, min: 2.2, max: 6.0 }),
  dog_chain: mv('斷鍊甩擊', 'spin', 'circle', { wind: 0.5, strike: 0.3, recover: 0.6, r: 2.3, at: 0.12, dmg: 0.75, max: 2.4 }),
  dog_pin: mv('包夾', 'bite', 'line', { wind: 0.85, strike: 0.38, recover: 0.75, dash: 7.5, w: 1.7, min: 0, max: 40, dmg: 0.9, track: 0.55 }),
  dog_latch: mv('咬住', 'bite', 'line', { wind: 0.6, strike: 0.3, recover: 1.2, dash: 4.2, w: 1.5, min: 0, max: 40, dmg: 0.45, latch: 1 }),
  dog_leap: mv('飛撲', 'pounce', 'leap', { wind: 0.75, strike: 0.5, recover: 0.8, r: 2.2, min: 2.5, max: 11, at: 0.5, dmg: 1.05, heavy: 1 }),
  dog_howl: mv('吠叫', 'roar', 'circle', { wind: 0.8, strike: 0.6, recover: 0.4, r: 0, nj: 1, sh7: 1 }),
  // 0.8 獸坑沼蟒的三個狀態招式（P2-a）：不判定、不畫預警（nj＋sh7），只讓大家從 mvc 看到牠現在是沉著（sub）、起身中（rise）、還是滑回坑裡（slide）；pyph＝階段名。
  //   美術的姿勢名稱照介面08 第 7 節（anim 'sub'／'rise'／'slide'）；美術還沒做之前，pitView 把模型往下沉頂著。
  py_sub: mv('沉水', 'sub', 'circle', { wind: 0.1, strike: 0.1, recover: 3600, r: 0, nj: 1, sh7: 1, pyph: 'sub' }),
  py_rise: mv('起身', 'rise', 'circle', { wind: 0.1, strike: 0.1, recover: 0.6, r: 0, nj: 1, sh7: 1, pyph: 'rise' }),
  py_slide: mv('滑回', 'slide', 'circle', { wind: 0.1, strike: 0.1, recover: 6, r: 0, nj: 1, sh7: 1, pyph: 'slide' })
};
// 放進世界的設定（0.7 預設關閉；要不要隨 0.7 上線由製作人和使用者決定）。座標取 places06.js 的地點
export const SITES07 = { enabled: false, list: [
  { kind: 'bison', place: '白鹽臺', x: 262, z: 140, n: 3, lv: 11 }, { kind: 'bison', place: '白鹽臺', x: 281, z: 160, n: 3, lv: 12 },
  { kind: 'python', place: '舊飼育場淹水的獸坑', x: -120, z: -287, n: 1, lv: 13 },
  { kind: 'dog', place: '獸欄西翼', x: -170, z: -262, n: 3, lv: 13 }, { kind: 'dog', place: '獸欄東翼（運鐵坡道）', x: 76, z: -270, n: 3, lv: 14 }, { kind: 'dog', place: '霜泉', x: 140, z: -280, n: 4, lv: 15 }] };
const TYPES = new Set(Object.keys(MON07));
let ready = false;
// 第一次用到才併進 core.js 的表（招式編號接在現有的後面；最多 63 招，現在 21＋17）
export function enable() {
  if (ready) return true; ready = true; Object.assign(MON, MON07); Object.assign(MON_BASE_LV, LV07);
  for (const id in MOVES07) { if (MOVES[id]) continue; const M = MOVES07[id]; M.id = id; M.i = MOVE_IDS.length; MOVES[id] = M; MOVE_IDS.push(id); }
  if (MOVE_IDS.length > 63) console.warn('招式超過 63 種，編碼放不下');
  return true;
}
if (BEAST_TIER08) enable();      // 0.7a（d8-play-p1）：新野獸在 buildSpawns 裡，載入當下就併（game.js 的 initGame 要用 MON／MOVES；招式編號 21 以後每台一樣）

/* ============================== 共用 ============================== */
let C = null, B07 = null, B07p = null, frameN = 0, now = 0;
const ST = new WeakMap(), sq = new Map();      // ST：每隻怪的額外狀態；sq：每一群（pack）的協同計畫
const S7 = w => { let s = ST.get(w); if (!s) ST.set(w, s = {}); return s; }, /* 0.8 試煉（P3）：試煉野獸不在 C.mons／C.sim（編號 9000 起，在 game.js 的 X8）；找不到時再查 X8，沒有試煉時和改前一樣 */
  monOf = id => C.mons[id] || (C.x8 ? C.x8.mons.find(v => v.id === id) : undefined), simOf = id => C.sim[id] || (C.x8 ? C.x8.sim.get(id) : undefined), monsAll = () => (C.x8 && C.x8.mons.length ? C.mons.concat(C.x8.mons) : C.mons);
export const owns = w => !!w && TYPES.has(w.type);
const dist = (a, b) => hyp(a.x - b.x, a.z - b.z);
const packOf = w => (w.pack != null && C.packs.get(w.pack)) || [w];
const alive = w => w.st !== MST.DEAD;
const toward = (w, x, z, k, dt) => { w.f = dampAng(w.f, Math.atan2(x - w.x, z - w.z), k, dt); };
function face(w, x, z, rate, dt) { const a = Math.atan2(x - w.x, z - w.z), d = angDiff(w.f, a); w.f += clamp(d, -rate * dt, rate * dt); }
function walk(w, X, x, z, sp) { const dx = x - X.nx, dz = z - X.nz, d = hyp(dx, dz); if (d < 0.05) return d; const s = Math.min(sp * X.dt, d); X.nx += dx / d * s; X.nz += dz / d * s; w.f = dampAng(w.f, Math.atan2(dx, dz), 10, X.dt); return d; }
function goStrike(w) { w.st = MST.STRIKE; w.t = 0; w.ox = w.x; w.oz = w.z; w.of = w.f; w.tag = false; w.dodged = null; }
function setAct(w, M, st, dur) { w.M = M; w.mvc = (M.i + 1) | (w.enr ? 64 : 0); w.st = st; w.t = 0; if (st === MST.RECOVER) w.rd = dur; else if (st === MST.STRIKE) w.sd = dur; w.chain = null; }
// 這群裡誰打牠們最痛（所有成員的傷害紀錄加總）
function topDamager(w) { const tot = new Map(); for (const o of packOf(w)) { const L = C.ledger.get(C.mkey(o)); if (L) for (const [who, d] of L) tot.set(who, (tot.get(who) || 0) + d); } let best = null, bd = 0; for (const [who, d] of tot) if (d > bd && C.playerOf(who)) { bd = d; best = who; } return best; }
// 從 (x,z) 往 f 方向 len 公尺內有沒有擋路的東西（樹、岩石、陡坡）
function clearAhead(x, z, f, len, r) { for (let s = 1.5; s < len; s += 1.2) { const px = x + sin(f) * s, pz = z + cos(f) * s; if (monBlocked(x, z, px, pz)) return s; const o = { x: px, z: pz }; collide(o, r); if (hyp(o.x - px, o.z - pz) > 0.15) return s; } return len; }

/* ============================== 0.8 獸坑伏擊（P2-a）：沼蟒平常沉在坑裡只露眼睛和一段背；8 公尺內 0.6 秒起身，起身後第一招固定噴毒或撲纏；目標離坑超過 12.5 公尺就滑回坑裡重新沉下 ============================== */
// 同步：沉下 py_sub、起身 py_rise、滑回 py_slide 是三個「狀態招式」，走現有的 mvc（RECOVER 狀態＋招式編號，和 bison_daze／py_crush 一樣），不加 presence 欄位。
//   主控端以招式當狀態（換主控端時從 w.M 讀回來）；每個人的畫面看 v.M 決定沉多深（pitView）。
//   獸坑座標在 places08.js 的 PITS08（P1-b 交之前用 PIT_FALLBACK 的暫定值）。對應：第 N 級的一般沼蟒 → 坑的 for＝'python<N>'；菁英大蟒蛇 → 'elite_python'；沒寫 for 的坑就近分配（80 公尺內）。
//   找不到坑的蟒（以及測試用生成的）照 0.7 的行為（定點盤著）。綁定時把牠的老家（hx、hz）和位置改到坑中心：每台載入時做同樣的事（資料一樣），不用同步。
const PIT_WAKE = 8, PIT_LEASH = 12.5, RISE_T = 0.6, SINK_Y = 1.5;
const PIT_FALLBACK = [{ id: 'pit_a', x: -112, z: -281, r: 5, water: 1.2, for: 'python12' }, { id: 'pit_b', x: -136, z: -279, r: 5, water: 1.2, for: 'python14' }, { id: 'pit_big', x: -128, z: -300, r: 8, water: 1.2, for: 'elite_python' }];
const PITS = new Map();      // 怪物編號 → 獸坑
let pitsBound = false;
const pitOf = w => PITS.get(w.id), pitList = () => (Array.isArray(P08.PITS08) && P08.PITS08.length ? P08.PITS08 : PIT_FALLBACK);
function bindPits() {
  if (pitsBound || !C || !C.sim.length) return; pitsBound = true; const list = pitList(), taken = new Set();
  for (const w of C.sim) {
    if (w.type !== 'python' || w.test7) continue; const v = C.mons[w.id], key = w.elite ? 'elite_python' : 'python' + v.lv, dh = p => hyp(p.x - w.hx, p.z - w.hz);
    const pit = list.filter(p => !taken.has(p.id) && (!p.for || p.for === key) && dh(p) < 80).sort((a, b) => (b.for === key) - (a.for === key) || dh(a) - dh(b))[0]; if (!pit) continue;
    taken.add(pit.id); PITS.set(w.id, pit);
    for (const o of [w, v]) { o.hx = o.x = pit.x; o.hz = o.z = pit.z; } w.wx = pit.x; w.wz = pit.z; v.tx = v.lx = v.ox = pit.x; v.tz = v.lz = v.oz = pit.z;
  }
}
// 坑蟒移動的目標點限制在坑裡（離中心 r−1 公尺內）：蟒不離開坑
const pitGoal = (t, pit) => { const dx = t.x - pit.x, dz = t.z - pit.z, d = hyp(dx, dz), lim = Math.max(0.5, pit.r - 1); return d <= lim ? t : { x: pit.x + dx / d * lim, z: pit.z + dz / d * lim }; };
function nearestPlayer(X, x, z) { let id = null, bd = 1e9; for (const [k, p] of X.players) { const d = hyp(p.x - x, p.z - z); if (d < bd) { bd = d; id = k; } } return { id, d: bd }; }
function setSub(w, s) { setAct(w, MOVES.py_sub, MST.RECOVER, MOVES.py_sub.recover); s.ph = 'sub'; w.target = null; w.provoked = false; w.kx = w.kz = 0; w.sprung = false; w.hits = 0; w.retreat = 0; w.chain = null; }
function startRise(w, s, who) { const p = who != null ? C.playerOf(who) : null; w.target = who; w.provoked = true; if (p) w.f = Math.atan2(p.x - w.x, p.z - w.z); setAct(w, MOVES.py_rise, MST.RECOVER, RISE_T); s.ph = 'rise'; w.cd = 0; w.kx = w.kz = 0; return true; }
function startSlide(w, s) { setAct(w, MOVES.py_slide, MST.RECOVER, MOVES.py_slide.recover); s.ph = 'slide'; w.target = null; w.provoked = false; w.kx = w.kz = 0; return true; }
// 沉著時受過傷、又一直沒人來：照遊戲原本的脫戰規則（game.js 的 calm 那一段）換一個重生編號、恢復滿血（沉著時不是 IDLE，遊戲自己的那一段碰不到牠，所以這裡做一份）
function calmReset(w, s) {
  const cnt = 1 + [...C.remotes.values()].filter(r => !r.away).length; s.calm = 0; w.spawn++; s.sp = w.spawn; w.seen = {}; w.hpMax = w.elite ? w.baseHp : Math.round(w.baseHp * (1 + 0.45 * (cnt - 1))); w.eng = false; w.enr = 0; w.mcd = {}; setSub(w, s);
}
// 回 true＝這一幀處理完；回 null＝戰鬥中，照下面 0.7 的流程（撲纏、扭絞、chasePython；坑蟒的 chasePython 會把走動限制在坑裡）
function hostPit(w, X, s, pit) {
  const dt = X.dt, M = w.M; if (s.noWake > 0) s.noWake -= dt;
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.ph = null; s.calm = 0; s.ls = -1; }      // 重生或重置：重來（沉下）
  let ph = s.ph || (s.ph = M && M.pyph ? M.pyph : w.st === MST.IDLE ? 'sub' : 'fight');      // 換主控端時從招式讀回來
  if (ph !== 'fight' && (w.st === MST.WIND || w.st === MST.STRIKE || w.st === MST.CHASE)) { ph = s.ph = 'fight'; s.fightT = 0; }      // 外面讓牠動起來了（測試的 force、換主控端）
  if (ph === 'sub') {
    X.nx = pit.x; X.nz = pit.z; const np = nearestPlayer(X, pit.x, pit.z), tg = w.target != null ? C.playerOf(w.target) : null;
    if (!(s.noWake > 0) && (w.st === MST.STAGGER || w.provoked) && tg && hyp(tg.x - pit.x, tg.z - pit.z) <= PIT_LEASH) return startRise(w, s, w.target);      // 被打（打的人在 12.5 公尺內）：起身
    if (np.id != null && np.d <= PIT_WAKE * H8.fn.senseK(w)) return startRise(w, s, np.id);      // 8 公尺內有人：起身（雨天察覺距離乘 senseK）
    if (w.st !== MST.RECOVER || w.M !== MOVES.py_sub) setAct(w, MOVES.py_sub, MST.RECOVER, MOVES.py_sub.recover);
    w.target = null; w.provoked = false; w.kx = w.kz = 0;
    const led = C.ledger.get(C.mkey(w)); let sum = 0; if (led) for (const d of led.values()) sum += d;
    if (sum > 0) { if (sum !== s.ls) { s.ls = sum; s.calm = 0; } else if ((s.calm = (s.calm || 0) + dt) >= AI.reset) calmReset(w, s); } else s.calm = 0;
    return true;
  }
  if (ph === 'rise') {
    X.nx = pit.x; X.nz = pit.z; if (w.st === MST.STAGGER) { s.ph = 'fight'; s.fightT = 0; return null; }      // 起身途中被打到：直接進戰鬥
    const tgt = X.tgt; if (tgt) face(w, tgt.x, tgt.z, 7, dt);
    if (w.st !== MST.RECOVER || w.M !== MOVES.py_rise) setAct(w, MOVES.py_rise, MST.RECOVER, RISE_T);
    if (w.t < RISE_T) return true;
    s.ph = 'fight'; s.fightT = 0; if (!tgt) return startSlide(w, s);
    if (dist(w, tgt) <= 14) { w.sprung = true; C.startMove(w, dist(w, tgt) >= 4.5 ? MOVES.py_spit : MOVES.py_coil, tgt); return true; }      // 起身後第一招固定：噴毒（4.5 公尺以外）或撲纏
    return null;
  }
  if (ph === 'slide') {
    if (w.st !== MST.RECOVER || w.M !== MOVES.py_slide) setAct(w, MOVES.py_slide, MST.RECOVER, MOVES.py_slide.recover);      // 滑回去的路上被打也不停（打的人在坑外）
    w.target = null; w.provoked = false; w.kx = w.kz = 0;
    if (walk(w, X, pit.x, pit.z, MON.python.speed * 1.15) < 0.35) { X.nx = pit.x; X.nz = pit.z; setSub(w, s); s.noWake = 1.5; w.cd = 1; }
    return true;
  }
  s.fightT = (s.fightT || 0) + dt;      // 戰鬥：目標離坑超過 12.5 公尺（換別的 12.5 公尺內的人，沒有就）滑回坑裡；剛起身 1 秒內不判（免得起身馬上滑回）
  if (w.st === MST.CHASE || w.st === MST.IDLE) {
    const tg = X.tgt;
    if (!tg || hyp(tg.x - pit.x, tg.z - pit.z) > PIT_LEASH) {
      let alt = null, bd = PIT_LEASH; for (const [id, p] of X.players) { const d = hyp(p.x - pit.x, p.z - pit.z); if (d <= bd) { bd = d; alt = id; } }
      if (alt != null) { w.target = alt; w.provoked = true; } else if (!tg || s.fightT > 1.0) return startSlide(w, s);
    }
  }
  return null;
}
// 畫面這一側：沉水的畫法（每個人看自己的 v.st／v.M 算，不用同步）。美術的 sub／rise／slide 姿勢（beasts07.js 匯出 POSES07.python 含 'sub'）做好之前，把模型往下沉頂著；做好之後這段自動讓位。
const PYV = new WeakMap(), smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ART_SUB = () => { const Z = B07m.POSES07; return !!(Z && Z.python && Z.python.includes('sub')); };
function pitView(v) {
  const pit = PITS.get(v.id); if (!pit || !v.model) return; let y = PYV.get(v); if (!y) PYV.set(v, y = { M: null, t0: now, sink: 1 });
  if (y.M !== v.M) { y.M = v.M; y.t0 = now; if (v.M === MOVES.py_rise) onRise(v); }
  const ph = v.st === MST.DEAD ? null : v.st === MST.IDLE ? 'sub' : (v.st === MST.RECOVER && v.M && v.M.pyph) || null;      // 還沒收到狀態招式的第一幀（IDLE）也當沉著
  const k = ph === 'sub' ? 1 : ph === 'rise' ? 1 - smooth01((now - y.t0) / RISE_T) : ph === 'slide' ? clamp(1 - hyp(v.x - pit.x, v.z - pit.z) / 2.2, 0, 1) : 0;      // 沉多深：1＝只露眼睛和背，0＝完全站起來
  y.sink = k; if (k > 0 && !ART_SUB()) v.model.root.position.y -= SINK_Y * v.model.root.scale.x * k;
  if (ph === 'sub' && v.tag) v.tag.el.style.display = 'none';      // 沉著時不顯示名牌（不然伏擊就沒意義了）
}
// 給 game.js 用的兩個查詢（總監要接再加一行；P2-a 沒動 game.js）：
//   inPit(w)：這隻蟒（sim 的 w）現在在不在自己的坑裡——坑做出來之後水深 1.2 超過 WATER.mon（0.75），game.js 的 monBlocked 會讓坑裡的蟒完全動不了（連撲纏的衝刺都被當成撞牆提早停下），需要在那一行對坑蟒略過水深：`if (!BA7.inPit(w) && monBlocked(...))`
//   hidden(v)：這隻蟒（mons 的 v）現在是不是沉著（只露眼睛）——鎖定與自動瞄準可以略過，免得從 30 公尺外就把牠鎖出來
export function inPit(w) { const pit = w && PITS.get(w.id); return !!pit && hyp(w.x - pit.x, w.z - pit.z) < pit.r + 0.4; }
export function hidden(v) { return !!v && PITS.has(v.id) && v.st !== MST.DEAD && (v.st === MST.IDLE || (v.st === MST.RECOVER && !!v.M && v.M.pyph === 'sub')); }
function onRise(v) {      // 起身：水花、一圈漣漪、嘶聲（每一台看到狀態招式變成 py_rise 都各自做）
  if (hyp(v.x - C.me.x, v.z - C.me.z) > 60) return; const y = Hgt(v.x, v.z);
  fxRing(v.x, v.z, 0.6, 4.2, 0.7, [0.55, 0.85, 1.25], 0.8); emit(v.x, y + 0.5, v.z, 40, [0.6, 0.9, 1.3], 5.5, 4.2, 0.7, 8); fx.shake = Math.max(fx.shake, 0.12); C.ui.sfx('rise', 'python', { x: v.x, z: v.z });
}
function pitState() { return [...PITS].map(([id, pit]) => { const w = C.sim[id], v = C.mons[id], y = PYV.get(v); return { id, pit: pit.id, st: v.st, M: v.M && v.M.id, simSt: w.st, simM: w.M && w.M.id, ph: S7(w).ph || null, x: +v.x.toFixed(2), z: +v.z.toFixed(2), sx: +w.x.toFixed(2), sz: +w.z.toFixed(2), sink: y ? +y.sink.toFixed(2) : null }; }); }

/* ============================== 主控端：每一隻在 switch 之前先問這裡（回傳 true＝這一幀已經處理完，略過原本的 switch） ============================== */
export function host(w, X) {
  if (!ready) return false; bindPits(); const s = S7(w); s.px = w.x; s.pz = w.z; s.dt = X.dt;
  now = C.clock();
  if (s.frz && (w.st === MST.IDLE || w.st === MST.CHASE)) { const t = X.tgt; if (t) face(w, t.x, t.z, 4, X.dt); if (w.st === MST.IDLE && t) w.st = MST.CHASE; return true; }      // 測試用：先按住不動（截圖時只讓指定的那隻出手）
  if (w.type === 'bison') return hostBison(w, X, s);
  if (w.type === 'python') return hostPython(w, X, s);
  if (w.type === 'dog') { const r4 = PT.host(w, X); return r4 !== undefined ? r4 : hostDog(w, X, s); }      /* R4：IDLE 的狗先問巡邏（回 undefined＝照舊走 hostDog） */
  return false;
}
/* ---------- 野牛 ---------- */
const DAZE = 2.6;
function setDaze(w, s) { setAct(w, MOVES.bison_daze, MST.RECOVER, DAZE); s.daze = DAZE; w.immune = 0; w.cd = Math.max(w.cd, DAZE + 0.6); w.kx = w.kz = 0; }
function hostBison(w, X, s) {
  const dt = X.dt;
  if (w.provoked && w.st !== MST.DEAD) { const top = topDamager(w); if (top && top !== w.target) w.target = top; }      // 被打之後整群盯著打牠們最痛的人
  if (s.daze > 0) { s.daze -= dt; if (w.st === MST.DEAD) { s.daze = 0; return false; } if (s.daze > 0) { if (w.st !== MST.RECOVER || w.M !== MOVES.bison_daze) setAct(w, MOVES.bison_daze, MST.RECOVER, DAZE); w.t = DAZE - s.daze; return true; } w.st = MST.CHASE; w.t = 0; w.cd = Math.max(w.cd, 0.4); return true; }      // 撞暈：被打也不會醒（照樣受傷）
  if (w.elite) { const e8 = H8.fn.eliteHost(w, X); if (e8 === true) return true; }      /* X4：菁英的招式（elite08） */
  const M = w.M, tgt = X.tgt;
  if (w.st === MST.STRIKE && M && M.steer) { s.f = w.f; if (tgt && w.t < w.sd * 0.4) face(w, tgt.x, tgt.z, M.steer, dt); return false; }      // 衝的前四成可以小幅修正方向（預警線跟著轉）
  if (w.st === MST.RECOVER && M === MOVES.bison_gore && w.chain && w.chain.length) { const k = 9 * Math.exp(-4 * w.t); X.nx += sin(w.f) * k * dt; X.nz += cos(w.f) * k * dt; s.f = w.f; return false; }      // 衝過頭：煞車滑一段
  if (w.st === MST.WIND && M === MOVES.bison_regore) {      // 回身：照實際的轉速轉過來（不是瞬間轉向）
    if (w.t <= dt * 1.5 && s.f != null) w.f = s.f; if (tgt) face(w, tgt.x, tgt.z, 4.2, dt);
    if (w.t >= w.wd) goStrike(w); return true; }
  if (w.st === MST.CHASE) return chaseBison(w, X, s);
  return false;
}
function chaseBison(w, X, s) {
  const tgt = X.tgt, dt = X.dt; if (!tgt) { w.st = MST.IDLE; w.t = 0; w.wanderT = 0; return true; }
  const dx = tgt.x - w.x, dz = tgt.z - w.z, d = hyp(dx, dz) || 0.01, toT = Math.atan2(dx, dz), rel = Math.abs(angDiff(w.f, toT)), herd = packOf(w).filter(alive);
  const busy = herd.some(o => o !== w && (o.st === MST.WIND || o.st === MST.STRIKE || (o.st === MST.RECOVER && o.chain && o.chain.length))), g = sq.get('b' + w.pack) || 0;
  const rushCd = w.mcd.bison_rush || 0;
  if (w.cd <= 0 && !busy && now >= g) {
    let M = null;
    if (d < 3.6 && rel > 2.1 && !(w.mcd.bison_buck > 0)) M = MOVES.bison_buck;
    else if (d < 3.4) M = MOVES.bison_hook;
    else if (d >= 6 && d <= 20 && rushCd <= 0 && rel < 0.9) M = MOVES.bison_rush;
    if (M) { C.startMove(w, M, tgt); if (M === MOVES.bison_buck) w.mcd.bison_buck = 2.5; sq.set('b' + w.pack, now + (M === MOVES.bison_rush ? 1.4 : 0.6)); return true; }
  }
  // 走位：輪到衝的那頭先拉開距離（約 11 公尺）、轉過來對著人刨地；別頭在衝的時候在外圈（約 12 公尺）慢慢繞；衝撞還在冷卻就走近用角挑、後踢
  const circle = v => { face(w, tgt.x, tgt.z, 2.6, dt); const sd = (w.id % 2 ? 1 : -1); X.nx += (-dz / d * sd) * v * dt; X.nz += (dx / d * sd) * v * dt; };
  if (busy) { if (d < 9) walk(w, X, w.x - dx / d * 3, w.z - dz / d * 3, MON.bison.speed * 0.6); else if (d > 15) walk(w, X, tgt.x, tgt.z, MON.bison.speed * 0.8); else circle(1.0); }
  else if (rushCd <= 1.2) { if (d < 8) { if (rel > 1.2 && d > 5.5) face(w, tgt.x, tgt.z, 3.0, dt); else walk(w, X, w.x - dx / d * 3, w.z - dz / d * 3, MON.bison.speed * 0.75); } else if (d > 18) walk(w, X, tgt.x, tgt.z, MON.bison.speed * 1.1); else circle(0.6); }
  else if (d > 2.9) walk(w, X, tgt.x, tgt.z, MON.bison.speed * (d > 12 ? 1.1 : 0.8)); else face(w, tgt.x, tgt.z, 3.2, dt);
  return true;
}
// monBlocked 擋住衝撞（地形、陡坡、深水）：衝撞改成撞暈
export function bump(w) { if (!ready || w.type !== 'bison' || !w.M || !w.M.steer) return false; const s = S7(w); hitWall(w, s); return true; }
function hitWall(w, s) { setDaze(w, s); s.bumpAt = now; }
// collide 之後：正前方貼著樹或岩石（被推開），衝撞也算撞上
export function post(w) {
  if (w.type === 'dog') PT.post(w);      /* R4：巡邏中的狗碰撞之後回到時鐘位置 */
  if (!ready || w.type !== 'bison' || w.st !== MST.STRIKE || !w.M || !w.M.steer) return; const s = S7(w), br = MON.bison.body * 0.8;
  const pushed = hyp(w.x - s.px, w.z - s.pz), want = w.M.dash / Math.max(0.05, w.sd) * (s.dt || 0.016);
  const o = { x: w.x + sin(w.f) * 0.7, z: w.z + cos(w.f) * 0.7 }; collide(o, br); if (hyp(o.x - w.x - sin(w.f) * 0.7, o.z - w.z - cos(w.f) * 0.7) > 0.25 && pushed < want * 0.75) hitWall(w, s);
}
/* ---------- 沼蟒 ---------- */
const victimHolds = (id, who) => { if (who === 'self') return !!(held && held.id === id); const r = C.remotes.get(who), p = r && r.lastPres; return !!(p && Array.isArray(p.h7) && (p.h7[0] | 0) === id); };
function othersDmg(w, who) { const L = C.ledger.get(C.mkey(w)); let n = 0; if (L) for (const [k, d] of L) if (k !== who) n += d; return n; }
function startCrush(w, s, who) { setAct(w, MOVES.py_crush, MST.STRIKE, MOVES.py_crush.strike); w.aid++; s.held = who; s.crushOthers = othersDmg(w, who); w.target = who; }
function release(w, s, why) { setAct(w, MOVES.py_crush, MST.RECOVER, MOVES.py_crush.recover); s.held = null; s.rel = why; w.immune = 0.6; w.cd = Math.max(w.cd, 1.6); }
function hostPython(w, X, s) {
  const pit = w.test7 ? null : pitOf(w); if (pit) { const r = hostPit(w, X, s, pit); if (r !== null) return r; }      // 0.8 獸坑：沉下／起身／滑回（處理完回 true；戰鬥中回 null、照下面 0.7 的流程）
  if (w.elite) { const e8 = H8.fn.eliteHost(w, X); if (e8 === true) return true; }      /* X4：菁英的招式（elite08） */
  const dt = X.dt, M = w.M;
  if (w.st === MST.STRIKE && M === MOVES.py_crush) {      // 扭絞：跟著被纏的人；被纏的人掙脫、隊友打夠了、或纏太久（累了）就鬆開
    const who = s.held, p = who && C.playerOf(who);
    if (!p || !victimHolds(w.id, who)) release(w, s, 'free');
    else if (othersDmg(w, who) - s.crushOthers >= holdBreakHp(w, 0.05)) release(w, s, 'ally');
    else if (w.t >= w.sd) release(w, s, 'tired');
    else { X.nx = p.x; X.nz = p.z; }
    return true;
  }
  if (M === MOVES.py_coil && (w.st === MST.STRIKE || (w.st === MST.RECOVER && w.t < 0.9))) {      // 撲纏打中了誰（自己判定的人回報 h7）
    for (const [id] of X.players) if (victimHolds(w.id, id)) { startCrush(w, s, id); return true; }
  }
  if (w.st === MST.CHASE) return chasePython(w, X, s);
  return false;
}
function chasePython(w, X, s) {
  const tgt = X.tgt, dt = X.dt; if (!tgt) { w.st = MST.IDLE; w.t = 0; w.wanderT = 0; return true; }
  const dx = tgt.x - w.x, dz = tgt.z - w.z, d = hyp(dx, dz) || 0.01, toT = Math.atan2(dx, dz), rel = Math.abs(angDiff(w.f, toT)), c = [];
  if (w.cd <= 0) {
    const ok = id => !(w.mcd[id] > 0), add = (id, k) => c.push([MOVES[id], k]);
    if (d < 3.8) add('py_sweep', rel > 1.5 ? 4 : 1);
    if (d >= 1.8 && d <= 6.2 && ok('py_coil')) add('py_coil', 2.2);
    if (d >= 4.5 && d <= 14 && ok('py_spit')) add('py_spit', d > 6.5 ? 3 : 1.2);
    if (d >= 1.5 && d <= 4.2) add('py_bite', 1);
    if (c.length) { let r = Math.random() * c.reduce((a, b) => a + b[1], 0), M = c[0][0]; for (const [m, k] of c) { r -= k; if (r <= 0) { M = m; break; } } if (M !== MOVES.py_sweep && rel > 0.5) face(w, tgt.x, tgt.z, 5, dt); else { C.startMove(w, M, tgt); return true; } }
  }
  // 盤著不動、轉頭對著人；人跑遠了才滑過去（蟒不追著人跑）
  const pit = pitOf(w), g = pit ? pitGoal(tgt, pit) : tgt, go = sp => { if (pit && hyp(g.x - w.x, g.z - w.z) < 0.4) face(w, tgt.x, tgt.z, 2.4, dt); else walk(w, X, g.x, g.z, sp); };      // 0.8：坑蟒不離開坑（目標點限制在坑裡）
  if (d > 12.5) go(MON.python.speed); else if (d > 7.5 && (w.mcd.py_spit || 0) > 1) go(MON.python.speed * 0.7); else face(w, tgt.x, tgt.z, 2.4, dt);
  return true;
}
/* ---------- 斷鍊鬥犬：協同 ---------- */
// 計畫（每一群同時只有一個）：flank 包夾（兩隻分到兩側同時撲）｜hold 咬住拖住（一隻咬住你、另一隻繞到背後飛撲）｜howl 吠叫集火（一隻吠叫，整群輪流撲向站最遠的人）
function squadOf(w) { const k = 'd' + w.pack; let q = sq.get(k); if (!q) sq.set(k, q = { plan: null, cd: now + 0.6, howl: now + 3, f: -1 }); return q; }
const engaged = w => alive(w) && w.target && (w.st !== MST.IDLE);
function hostDog(w, X, s) {
  if (w.elite) { const e8 = H8.fn.eliteHost(w, X); if (e8 === true) return true; }      /* X4：菁英的招式（elite08） */
  if (w.pack == null) return false; const q = squadOf(w), dogs = packOf(w).filter(alive);
  if (q.f !== frameN) { q.f = frameN; planTick(q, dogs, X); }
  const P = q.plan;
  if (P && P.ids.includes(w.id)) return planDog(w, X, s, q, P);
  if (!P && w.st === MST.CHASE && now >= q.cd && X.tgt) { const e = dogs.filter(engaged); if (e.length >= 2) { startPlan(q, e, w, X); if (q.plan && q.plan.ids.includes(w.id)) return planDog(w, X, s, q, q.plan); } }
  if (P && w.st === MST.CHASE && X.tgt) { const d = dist(w, X.tgt) || 0.01, o = MON.dog.orbit + 1.8, dx = X.tgt.x - w.x, dz = X.tgt.z - w.z, sd = (w.id % 2 ? 1 : -1), back = d < o - 1 ? -0.9 : d > o + 2 ? 0.9 : 0; X.nx += (-dz / d * sd + dx / d * back) * 3.4 * X.dt; X.nz += (dx / d * sd + dz / d * back) * 3.4 * X.dt; toward(w, X.tgt.x, X.tgt.z, 10, X.dt); C.packWait[w.pack] = Math.max(C.packWait[w.pack] || 0, 0.3); return true; }      // 不在計畫裡的：在外圈繞，等計畫打完
  return false;
}
function startPlan(q, e, w, X) {
  const tgt = X.tgt, kinds = [['flank', 0.4], ['hold', 0.35]]; if (now >= q.howl) kinds.push(['howl', e.length >= 3 ? 0.4 : 0.25]);
  let r = Math.random() * kinds.reduce((a, b) => a + b[1], 0), kind = kinds[0][0]; for (const [k, p] of kinds) { r -= p; if (r <= 0) { kind = k; break; } }
  const byD = e.slice().sort((a, b) => dist(a, tgt) - dist(b, tgt));
  if (kind === 'flank') { const a = byD[0], b = byD[1], cx = (a.x + b.x) / 2 - tgt.x, cz = (a.z + b.z) / 2 - tgt.z, cl = hyp(cx, cz) || 1, px = cz / cl, pz = -cx / cl, sa = (a.x - tgt.x) * px + (a.z - tgt.z) * pz >= 0 ? 1 : -1;
    q.plan = { kind, ids: [a.id, b.id], tgt: w.target, t0: now, phase: 'pos', px: px * sa, pz: pz * sa }; }
  else if (kind === 'hold') q.plan = { kind, ids: [byD[0].id, byD[1].id], tgt: w.target, t0: now, phase: 'pos' };
  else { q.plan = { kind, ids: byD.map(o => o.id), tgt: w.target, t0: now, phase: 'bark', sched: null }; q.howl = now + 11; }
}
function endPlan(q) { q.plan = null; q.cd = now + 2.4 + Math.random() * 1.2; }
function planTick(q, dogs, X) {
  const P = q.plan; if (!P) return; const D = id => simOf(id), tgt = C.playerOf(P.mark || P.tgt), t = now - P.t0;
  if (!tgt || P.ids.every(id => !alive(D(id)))) return endPlan(q);
  const acting = o => o.st === MST.WIND || o.st === MST.STRIKE;
  if (P.kind === 'flank') {
    const [a, b] = P.ids.map(D);
    if (P.phase === 'pos') { const ga = { x: tgt.x + P.px * 5.4, z: tgt.z + P.pz * 5.4 }, gb = { x: tgt.x - P.px * 5.4, z: tgt.z - P.pz * 5.4 }; P.ga = ga; P.gb = gb;
      const ready = (dist(a, ga) < 1.7 || !alive(a)) && (dist(b, gb) < 1.7 || !alive(b));
      if (ready || t > 2.6) { for (const o of [a, b]) if (alive(o) && o.st === MST.CHASE) { o.cd = 0; C.startMove(o, MOVES.dog_pin, tgt); } P.phase = 'act'; P.t1 = now; } }
    else if (now - P.t1 > 0.3 && ![a, b].some(acting)) endPlan(q);
    else if (t > 7) endPlan(q);
  } else if (P.kind === 'hold') {
    const [a, b] = P.ids.map(D);
    if (P.phase === 'pos' && alive(a) && a.st === MST.CHASE && dist(a, tgt) <= 4.2) { C.startMove(a, MOVES.dog_latch, tgt); P.phase = 'latch'; }
    if (P.phase === 'latch' && (a.st === MST.STRIKE || a.st === MST.RECOVER || !alive(a))) { P.tl = P.tl || now; if (now - P.tl > 0.12 && alive(b) && b.st === MST.CHASE) { const d = dist(b, tgt); C.startMove(b, d >= 2.5 ? MOVES.dog_leap : MOVES.dog_bite, tgt); P.phase = 'leap'; P.t1 = now; } }
    if (P.phase === 'leap' && now - P.t1 > 0.3 && !acting(b)) endPlan(q);
    if (t > (P.phase === 'pos' ? 4 : 6)) endPlan(q);
  } else {
    const L = D(P.ids[0]);
    if (P.phase === 'bark') { if (!alive(L)) return endPlan(q); if (P.started && L.st === MST.STAGGER && !P.broke) { P.broke = 1; H8.emit('beast:howlBreak', { v: C.mons[L.id], by: topDamager(L) }); return endPlan(q); }      /* R4：長吠被打斷（beast:howlBreak，給任務與試煉用）；計畫提早結束 */
      if (L.st === MST.CHASE && !P.started) { L.cd = 0; C.startMove(L, MOVES.dog_howl, tgt); P.started = true; }
      if (L.st === MST.STRIKE) {      // 吠出來的那一刻：選站得最遠的人（只有一個人就是你），整群輪流撲過去
        let far = P.tgt, fd = -1; for (const [id, p] of X.players) { const d = dist(p, L); if (d < 24 && d > fd) { fd = d; far = id; } } P.mark = far; PT.callPack(L, far);      /* R4：吠出來沒被打斷：60 m 內最近一群沒在打的鬥犬趕來（最多一群） */
        const mk = C.playerOf(far) || tgt, rest = P.ids.slice(1).map(D).filter(alive).sort((x, y) => dist(x, mk) - dist(y, mk));
        P.sched = rest.map((o, k) => ({ id: o.id, at: now + 0.25 + k * 0.45, done: false })).concat([{ id: L.id, at: now + 0.25 + rest.length * 0.45 + 0.5, done: false }]);
        for (const o of P.ids.map(D)) if (alive(o)) { o.target = far; o.provoked = true; }
        P.phase = 'jump'; P.t1 = now; } }
    else { let left = 0; for (const j of P.sched) { const o = D(j.id); if (j.done || !alive(o)) continue; left++;
        if (now >= j.at && o.st === MST.CHASE) { const d = dist(o, tgt); if (d >= 2.5 && d <= 11) { o.cd = 0; C.startMove(o, MOVES.dog_leap, tgt); j.done = true; } else if (d < 2.5) { C.startMove(o, MOVES.dog_bite, tgt); j.done = true; } else if (now - j.at > 2.2) j.done = true; } }
      if (!left && !P.ids.map(D).some(acting)) endPlan(q); }
    if (t > 8) endPlan(q);
  }
}
function planDog(w, X, s, q, P) {
  if (w.st !== MST.CHASE) return false; const tgt = C.playerOf(P.mark || P.tgt); if (!tgt) return false; const sp = MON.dog.speed;
  if (P.kind === 'flank' && P.phase === 'pos') { const g = w.id === P.ids[0] ? P.ga : P.gb; if (!g) return true; const d = dist(w, g);
    if (d > 1.2) { const tx = g.x, tz = g.z, mx = (w.x + tx) / 2, mz = (w.z + tz) / 2, dm = hyp(mx - tgt.x, mz - tgt.z); let gx = tx, gz = tz; if (dm < 3.5) { const ox = mx - tgt.x, oz = mz - tgt.z, ol = hyp(ox, oz) || 1; gx = tgt.x + ox / ol * 4.5; gz = tgt.z + oz / ol * 4.5; } walk(w, X, gx, gz, sp * 1.15); }      // 繞著目標跑到側面，不從人身上穿過
    else toward(w, tgt.x, tgt.z, 10, X.dt); return true; }
  if (P.kind === 'hold') { const a = simOf(P.ids[0]);
    if (w.id === P.ids[0]) { if (P.phase === 'pos') walk(w, X, tgt.x, tgt.z, sp * 1.1); else toward(w, tgt.x, tgt.z, 10, X.dt); return true; }
    const ux = tgt.x - a.x, uz = tgt.z - a.z, ul = hyp(ux, uz) || 1, gx = tgt.x + ux / ul * 4.8, gz = tgt.z + uz / ul * 4.8, d = hyp(w.x - gx, w.z - gz);      // 繞到另一隻的對面（你的背後）
    if (d > 1.0) { const mx = (w.x + gx) / 2, mz = (w.z + gz) / 2, dm = hyp(mx - tgt.x, mz - tgt.z); let px = gx, pz = gz; if (dm < 3.5) { const ox = mx - tgt.x, oz = mz - tgt.z, ol = hyp(ox, oz) || 1; px = tgt.x + ox / ol * 4.8; pz = tgt.z + oz / ol * 4.8; } walk(w, X, px, pz, sp * 1.1); } else toward(w, tgt.x, tgt.z, 10, X.dt); return true; }
  if (P.kind === 'howl') { if (P.phase === 'bark') { if (w.id !== P.ids[0]) { const d = dist(w, tgt); if (d < 7.5) walk(w, X, w.x - (tgt.x - w.x), w.z - (tgt.z - w.z), sp); else toward(w, tgt.x, tgt.z, 10, X.dt); } return true; }      // 吠叫時其他隻先散開拉出撲的距離
    const j = P.sched && P.sched.find(k => k.id === w.id); if (j && !j.done) { const d = dist(w, tgt); if (d > 9.5) walk(w, X, tgt.x, tgt.z, sp * 1.25); else toward(w, tgt.x, tgt.z, 12, X.dt); return true; } return false; }
  return false;
}

/* ============================== 預警形狀（moveShape 遇到 sh7 的招式會問這裡）：衝撞的線跟著野牛現在的位置與朝向（修正方向時線也轉）；狀態招式不畫、不判定 ============================== */
export function shape(v, M) {
  if (M.nj) return null; const wind = v.st === MST.WIND, br = MON[v.type].body * v.size, sz = v.elite ? 1.25 : 1, w = M.w * sz + 2 * (0.45 + br * 0.2), A = v.act || M;
  if (wind) return { shape: 'line', x: v.x, z: v.z, f: v.f, w, len: M.dash + br + 0.9, p: clamp(v.stT / Math.max(0.05, A.wind), 0, 1) };
  const rem = Math.max(0, 1 - v.stT / Math.max(0.05, A.strike)); return { shape: 'line', x: v.x, z: v.z, f: v.f, w, len: M.dash * rem + br + 0.9, p: 1 };
}

/* ============================== 被打中的那個人自己算的效果：纏住、咬住、挑飛、毒池 ============================== */
let held = null, latch = null, toss = null; const pools = [];
let relAt = -99, demo = null;      // relAt：自己上一次從纏繞脫身的時間（sweptGrab 放寬判定用）；demo：struggleDemo 假造的掙脫條
const escNeed = n => Math.max(1, Math.round(n * (1 - H8.capped('escape'))));      // 掙脫次數照上限（介面08 第 9c 節；P7 的 mod 沒提供時 capped＝0，次數不變）
// 沼蟒鬆口的門檻（隊友累計打掉多少血牠才放開）：按「同級普通個體」的血量算，不受菁英倍率與多人加血影響（製作人裁決 20:35 第 3 條）。ratio：一般沼蟒 0.05、大蟒蛇雙纏 0.04（P5 沿用這個函式）
export function holdBreakHp(w, ratio = 0.05) { const v = monOf(w.id); return monStats(w.type, v ? v.lv : MON_BASE_LV[w.type], false).hp * ratio; }
// 介面08 第 5 節 beastai07 的查詢（P2-a 只有 struggle；cast／targetedBy 是 P2-c、dragged 是 P5，先給空的讓介面可以先接）
export function struggle() {      // 自己 → null | { kind: 'coil'|'latch', n, need, by, t, tmax, drag }（need 已套 escape；by＝野獸編號）
  if (demo) { const t = (C.clock() - demo.t0) % 6.5, need = demo.kind === 'latch' ? 1 : escNeed(12); return { kind: demo.kind, n: demo.kind === 'latch' ? 0 : Math.min(need, Math.floor(t * 3)), need, by: -1, t, tmax: 6.5, drag: null }; }
  if (held) return { kind: 'coil', n: held.n, need: held.need, by: held.id, t: held.t, tmax: 6.5 * (1 - H8.capped('hold')), drag: null };
  if (latch) return { kind: 'latch', n: 0, need: 1, by: latch.id, t: latch.t, tmax: 2.0 * (1 - H8.capped('hold')), drag: null };
  for (const e of EXT) { const r = e.struggle && e.struggle(); if (r) return r; } /* 0.8：後面的野獸檔（X3a／X3b）註冊的 */
  return null;
}
export const EXT = []; /* 0.8 X3a／X3b：野獸檔把自己的 { struggle, dragged, targetedBy, cast } 用 EXT.push 掛進來，介面只讀這個檔 */
export function cast(v) { for (const e of EXT) { const r = e.cast && e.cast(v); if (r) return r; } return null; }      /* P2-c（長吠）、P5（召集） */
export const dragged = () => EXT.flatMap(e => (e.dragged ? e.dragged() : [])), targetedBy = () => EXT.flatMap(e => (e.targetedBy ? e.targetedBy() : []));      /* P5（大蟒蛇拖入坑底）、P2-c（吠叫集火、牛群盯人） */
const hitRes = res => res === 'hit' || res === 'broken';
let lastGH = -1; const gseen = new WeakMap();
export function onHurt(v, M, res) {
  if (!ready || !C.me.alive) return; if (M.grab || M.latch) lastGH = v.id * 1e6 + v.spawn * 1000 + v.aid;
  if (M.grab && hitRes(res)) { held = { id: v.id, sp: v.spawn, t: 0, n: 0, need: escNeed(12), x: C.me.x, z: C.me.z, tk: 0, k: 0, crush: false }; C.netSet('h7', [v.id], true); C.me.stun = Math.max(C.me.stun, 0.3); popNumber(C.me.x, Hgt(C.me.x, C.me.z) + 3.4, C.me.z, '被纏住了！', 'hurt');
    C.ui.tip('b7grab', `被沼蟒纏住了：連按 ${keyOf('dodge')}、${keyOf('interact')} 或 ${keyOf('attack')} 掙脫；隊友打牠也會讓牠鬆開。越久勒得越緊。舉盾格擋可以擋下撲纏。`); }
  if (M.latch && hitRes(res)) { latch = { id: v.id, sp: v.spawn, t: 0, d0: C.myDmg[C.mkey(v)] || 0 }; popNumber(C.me.x, Hgt(C.me.x, C.me.z) + 3.4, C.me.z, '被咬住了！', 'hurt'); C.ui.tip('b7latch', `被鬥犬咬住拖著走：另一隻會從背後撲過來。按 ${keyOf('dodge')} 閃避可以掙脫，打咬住你的那隻牠也會鬆口。`); }
  if (M.toss && hitRes(res)) { toss = { t: 0 }; C.me.stun = Math.max(C.me.stun, 0.95 * (1 - H8.capped('immob'))); popNumber(C.me.x, Hgt(C.me.x, C.me.z) + 3.6, C.me.z, '挑飛', 'hurt'); }
}
// 噴毒落地：留一灘毒池（每個人看到同一招就畫同一灘：位置由招式決定）
export function pool(v, s, M) { if (!ready || !M.pool) return; const P = { x: s.x, z: s.z, r: s.r, t: 0, dur: 7, dmg: v.dmg * 0.09, tick: 0.3, mesh: poolMesh(s.x, s.z, s.r) }; pools.push(P); emit(s.x, Hgt(s.x, s.z) + 0.4, s.z, 26, [0.7, 2.0, 0.35], 4, 2.6, 0.6, 8); if (pools.length > 8) dropPool(pools[0]);
  if (hyp(C.me.x - s.x, C.me.z - s.z) < 20) C.ui.tip('b7pool', '沼蟒的毒液落地會留下一灘毒池，站在裡面會一直掉血，大約七秒後才散。'); }
function dropPool(P) { const i = pools.indexOf(P); if (i >= 0) pools.splice(i, 1); if (P.mesh) { W.scene.remove(P.mesh); P.mesh.geometry.dispose(); } }
let poolTex = null, poolMat = null;
function poolMesh(x, z, r) {
  if (!poolTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 63); gr.addColorStop(0, 'rgba(170,240,70,0.95)'); gr.addColorStop(0.6, 'rgba(110,200,35,0.9)'); gr.addColorStop(0.84, 'rgba(70,140,20,0.88)'); gr.addColorStop(0.93, 'rgba(30,70,10,0.8)'); gr.addColorStop(1, 'rgba(30,60,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, rr = Math.random() * 46, bx = 64 + cos(a) * rr, by = 64 + sin(a) * rr, br = 2 + Math.random() * 5; g.strokeStyle = 'rgba(220,255,140,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke(); }
    poolTex = new THREE.CanvasTexture(cv); poolTex.colorSpace = THREE.SRGBColorSpace; poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }); }
  const geo = new THREE.PlaneGeometry(2 * r, 2 * r, 10, 10); geo.rotateX(-PI / 2); const pa = geo.attributes.position, y0 = Hgt(x, z); for (let i = 0; i < pa.count; i++) pa.setY(i, Hgt(x + pa.getX(i), z + pa.getZ(i)) - y0 + 0.07); pa.needsUpdate = true;
  const m = new THREE.Mesh(geo, poolMat); m.position.set(x, y0, z); m.renderOrder = 3; m.frustumCulled = false; m.isLine = true; W.scene.add(m); return m;
}

/* ============================== 模型 ============================== */
export function make(type, size, elite) { if (!TYPES.has(type) || !B07) return null; const m = B07.makeBeast07(type, size, !!elite); m.elite = !!elite; return m; /* 0.8：elite 傳給美術 A1 的 makeBeast07(type, size, elite) */ }

/* ============================== 每一幀（tick 最後）：毒池、纏住、咬住、挑飛、撞暈的星星、presence、測試用生成的同步 ============================== */
let ui7 = null, stars = null; const seen7 = new WeakMap();
function struggleUi(on, k, txt) {
  if (typeof window !== 'undefined' && window.__ui8struggle) { if (ui7) ui7.style.display = 'none'; return; }      // 0.8：介面畫遊戲樣式的掙脫條（struggle()）
  if (!ui7) { ui7 = document.createElement('div'); ui7.style.cssText = 'position:fixed;left:50%;top:64%;transform:translate(-50%,-50%);z-index:30;pointer-events:none;font:700 16px/1.3 system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 3px #000;display:none';
    ui7.innerHTML = '<div class="t"></div><div style="margin:6px auto 0;width:220px;height:12px;border-radius:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5);overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,#9bd648,#e6f27a)"></i></div>'; document.body.appendChild(ui7); }
  ui7.style.display = on ? '' : 'none'; if (!on) return; ui7.querySelector('.t').textContent = txt; ui7.querySelector('i').style.width = Math.round(clamp(k, 0, 1) * 100) + '%';
}
function onPress(e) { if (!held || held.t < 0.12) return; const code = e.type === 'keydown' ? e.code : 'Mouse' + (e.button | 0); if (e.repeat) return; const a = actionOf(code); if (a !== 'dodge' && a !== 'interact' && a !== 'attack' && e.type !== 'touchstart') return; held.n++; held.shake = 0.12; }
function starMesh() { const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false }); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), mat); s.userData.a = i / 4 * TAU; g.add(s); } g.visible = false; W.scene.add(g); return g; }
function selfDot(dmg, v) { const me = C.me; if (!me.alive || me.inSafe) return; if (me.hp - dmg <= 0) { C.hurtMe(dmg * 3, v ? v.x : me.x, v ? v.z : me.z, { mon: v }); return; } me.hp -= dmg; me.lastCombat = C.clock(); popNumber(me.x, Hgt(me.x, me.z) + 2.8, me.z, '-' + Math.round(dmg), 'hurt'); me.flash = Math.max(me.flash, 0.35); }
function freeMe(txt) { const me = C.me; held = null; relAt = C.clock(); C.netSet('h7', null, true); me.stun = 0; me.iframe = Math.max(me.iframe, 0.6); struggleUi(false); if (txt) popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, txt, 'perfect'); }
export function frame(dt) {
  if (!C) return; frameN++; now = C.clock(); const me = C.me, Net = C.Net; bindPits();
  // 測試用生成的同步：主控端在 presence 放 t7（每一組的種類、等級、位置），其他人照著補上同樣編號的怪
  if (Net.isHost) { const s = tests.map(g => g.join(',')).join(';'); C.netSet('t7', s || null); }
  else if (B07) { let hp = null; for (const r of C.remotes.values()) if (r.lastPres && typeof r.lastPres.ms === 'string') { hp = r.lastPres; break; } if (hp && typeof hp.t7 === 'string' && hp.t7 !== lastT7) { lastT7 = hp.t7; mirror(hp.t7); } }
  else { for (const r of C.remotes.values()) if (r.lastPres && typeof r.lastPres.ms === 'string' && typeof r.lastPres.t7 === 'string') { load(); break; } }
  if (!ready) return;
  // 毒池
  for (const P of pools.slice()) { P.t += dt; const k = P.t / P.dur; if (P.mesh) { P.mesh.material.opacity = 1; P.mesh.scale.setScalar(Math.min(1, P.t / 0.25) * (1 + 0.03 * sin(P.t * 6))); P.mesh.visible = k < 1; P.mesh.material.opacity = 1; } if (k >= 1) { dropPool(P); continue; }
    if (P.t % 0.35 < dt) emit(P.x + (Math.random() - 0.5) * P.r, Hgt(P.x, P.z) + 0.15, P.z + (Math.random() - 0.5) * P.r, 2, [0.6, 1.7, 0.3], 0.5, 1.4, 0.7, -1);
    if (me.alive && hyp(me.x - P.x, me.z - P.z) < P.r + 0.25 && !me.swim) { P.tick -= dt; if (P.tick <= 0) { P.tick = 0.5; selfDot(P.dmg, null); } } else P.tick = Math.min(P.tick, 0.15); }
  for (const P of pools) if (P.mesh) P.mesh.material.opacity = clamp((P.dur - P.t) / 1.2, 0, 1);
  // 纏住：不能動、不能出手；連按掙脫；牠在扭絞時每秒勒一下（一下比一下重）；牠鬆開（隊友打牠、牠累了）就自由
  if (held) { const v = monOf(held.id); held.t += dt; me.stun = Math.max(me.stun, 0.12); me.x = held.x; me.z = held.z; me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.guard = false; me.atk = null; me.charge = null;
    const crushing = v && v.st === MST.STRIKE && v.M === MOVES.py_crush;
    if (!me.alive) { held = null; C.netSet('h7', null, true); struggleUi(false); }
    else if (!v || v.spawn !== held.sp || v.st === MST.DEAD || (held.crush && !crushing) || (!crushing && held.t > 1.3)) freeMe(v && v.st !== MST.DEAD && held.crush ? '牠鬆開了' : '脫身');
    else if (held.n >= held.need) freeMe('掙脫！');
    else if (crushing && H8.capped('hold') > 0 && (held.ct = (held.ct || 0) + dt) >= 5.5 * (1 - H8.capped('hold'))) freeMe('脫身');      // 0.8：被纏的時間 × (1 − hold)（上限 0.30；沒有加成時不變）
    else if (held.t > 6.5) freeMe('脫身');
    else { if (crushing) { held.crush = true; held.tk -= dt; if (held.tk <= 0) { held.tk = 1.0; const d = v.dmg * (0.15 + 0.08 * held.k); held.k++; C.hurtMe(d, v.x, v.z, { mon: v }); me.kx = me.kz = 0; me.stun = Math.max(me.stun, 0.2); } }
      if (held.shake > 0) { held.shake -= dt; fx.shake = Math.max(fx.shake, 0.08); } struggleUi(true, held.n / held.need, `連按 ${keyOf('dodge')}／${keyOf('interact')}／${keyOf('attack')} 掙脫`); } }
  // 咬住：被拖著（離咬住你的那隻不能超過一點點）；閃避、打牠、牠被打踉蹌、兩秒到了就鬆口
  if (latch) { const v = monOf(latch.id); latch.t += dt;
    if (!me.alive || !v || v.spawn !== latch.sp || latch.t > 2.0 * (1 - H8.capped('hold')) || me.dodge || v.st === MST.STAGGER || v.st === MST.DEAD || (C.myDmg[C.mkey(v)] || 0) > latch.d0) { if (me.alive && (me.dodge || (C.myDmg[C.mkey(v)] || 0) > latch.d0)) popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, '掙脫', 'perfect'); latch = null; }
    else { const br = MON.dog.body * v.size * 1.25, mx = v.x + sin(v.f) * br, mz = v.z + cos(v.f) * br, dx = me.x - mx, dz = me.z - mz, d = hyp(dx, dz); if (d > 0.95) { me.x = mx + dx / d * 0.95; me.z = mz + dz / d * 0.95; } me.sprinting = false; } }
  // 挑飛：往上拋一下（只是畫面；落地前不能動）
  if (toss) { toss.t += dt; const k = toss.t / 0.9; if (k >= 1 || !me.alive) { toss = null; if (me.avatar) me.avatar.group.rotation.x = 0; } else if (me.avatar) { me.avatar.group.position.y += 2.1 * sin(PI * k); me.avatar.group.rotation.x = -0.85 * sin(PI * Math.min(1, k * 1.1)); } }
  // 怪物這邊的畫面：撞暈的星星、狀態轉換的提示、吠叫標出被盯上的人、噴毒的毒液
  let starV = null;
  for (const v of monsAll()) { if (!TYPES.has(v.type) || !v.model) continue; const pst = seen7.get(v); if (pst !== v.st) { seen7.set(v, v.st); onState(v, pst); }
    if (v.st === MST.RECOVER && v.M === MOVES.bison_daze && v.model.root.visible) starV = v;
    if (v.type === 'python' && v.st === MST.STRIKE && v.M === MOVES.py_spit) spitFx(v);
    if (v.M && (v.M.grab || v.M.latch) && v.st === MST.RECOVER && v.stT < 0.5) sweptGrab(v);
    if (v.type === 'python') pitView(v); }
  if (glob && now - globT > 0.05) glob.visible = false;
  if (!stars) stars = starMesh(); stars.visible = !!starV; if (starV) { const y = Hgt(starV.x, starV.z) + 2.55 * starV.size; stars.position.set(starV.x + sin(starV.f) * 1.2, y, starV.z + cos(starV.f) * 1.2); stars.children.forEach((s, i) => { const a = s.userData.a + now * 3.2; s.position.set(cos(a) * 0.55, 0.08 * sin(now * 7 + i), sin(a) * 0.55); s.rotation.y = now * 5; }); }
}
// 撲纏、咬住是「出招途中碰到就算」的直線：別人的畫面上怪物的位置是內插的，快的撲擊可能整段都沒看到牠靠近（只看到出招前、收招後）。
// 收招一開始再照預警的形狀（出招那一刻的起點、朝向、長度、寬度）補判一次；判定裡已經處理過這一招（打中、擋下、閃過）就不補
function sweptGrab(v) {
  const hid = v.id * 1e6 + v.spawn * 1000 + v.aid, me = C.me; if (gseen.get(v) === hid) return; gseen.set(v, hid); if (lastGH === hid || held || latch || !me.alive || me.inSafe || me.dodgeI > 0 || me.iframe > 0) return;
  const M = v.M, br = MON[v.type].body * v.size, sz = v.elite ? 1.25 : 1, dx = me.x - v.ox, dz = me.z - v.oz, al = dx * sin(v.of) + dz * cos(v.of), sd = Math.abs(dx * cos(v.of) - dz * sin(v.of));
  // 0.8（雙人第二次被纏住漏判）：剛從纏繞脫身的人，沼蟒就站在他身上；牠再撲過來時，畫面上的出招起點 v.ox 是「看到出招那一幀」的內插位置，主控端的蟒那時已經衝出去 1 公尺多（衝刺約 13 公尺／秒 × 封包延遲），
  //   剛被纏過的人落在起點後面，補判的線掃不到。所以脫身後 3.5 秒內（最快的下一次撲纏＝收招冷卻 1.6＋預備 0.9 秒後）：補判的範圍四邊多 0.6 公尺、往起點後面再多 1.8 公尺。
  //   （總監簡報寫「剛鬆開的 1 秒內放寬 0.6 公尺」：1 秒內不可能有下一次撲纏的判定，所以窗口拉長、並補上往後的那一段。）
  const rel = M.grab && C.clock() - relAt < 3.5, ex = rel ? 0.6 : 0, exb = rel ? 1.8 : 0;
  if (al > -0.5 - exb && al < M.dash + br + 0.9 + ex && sd < M.w * sz / 2 + 0.45 + br * 0.2 + ex) { const res = C.hurtMe(v.dmg * M.dmg, v.x, v.z, { heavy: M.heavy, mon: v }); onHurt(v, M, res); }
}
// 音效（d7-snd3）：招式出手的那一刻送 move7/<種類>/<招式>（對照在 audio-index.json 的 events）
const SND7 = { bison_gore: 'gore', bison_regore: 'gore', bison_hook: 'hook', bison_buck: 'buck', py_spit: 'spit', py_coil: 'coil', py_crush: 'crush', py_sweep: 'sweep', py_bite: 'bite', dog_bite: 'bite', dog_pin: 'bite', dog_latch: 'latch', dog_leap: 'leap', dog_chain: 'chain' };
function snd7(v) { if (v.st !== MST.STRIKE || !v.M) return; for (const k in SND7) if (MOVES[k] === v.M) { C.ui.sfx('move7', v.type, { x: v.x, z: v.z, tag: SND7[k] }); return; } }
function onState(v, pst) {
  const near = hyp(v.x - C.me.x, v.z - C.me.z) < 32, y = Hgt(v.x, v.z) + MON[v.type].tagH * v.size;
  if (!near) return;
  snd7(v);
  if (v.st === MST.RECOVER && v.M === MOVES.bison_daze) { popNumber(v.x, y + 0.4, v.z, '撞暈了！', 'perfect'); emit(v.x + sin(v.f) * 1.4, Hgt(v.x, v.z) + 1, v.z + cos(v.f) * 1.4, 30, [0.8, 0.66, 0.45], 6, 3, 0.6, 6); fx.shake = Math.max(fx.shake, 0.35); C.ui.sfx('boom', 1, { x: v.x, z: v.z }); C.ui.tip('b7daze', '野牛撞上障礙物暈過去了：這幾秒是反擊的機會。'); }
  if (v.st === MST.WIND && v.M && v.M.steer && v.type === 'bison') C.ui.tip('b7gore', '野牛刨地、低頭＝要衝了。看地上的直線：等牠衝到眼前再往旁邊閃（像鬥牛士），牠會衝過頭，煞車後回身再衝一次；把牠引向岩石或樹，撞上會暈好幾秒。');
  if (pst === MST.STRIKE && v.st === MST.RECOVER && v.M === MOVES.py_crush) popNumber(v.x, y + 0.3, v.z, '鬆開了', 'call');
  if (v.st === MST.STRIKE && v.M === MOVES.dog_howl) {      // 吠叫：標出站最遠的人（每個人自己看位置算，和主控端選的通常是同一個）
    let far = C.me, fd = hyp(C.me.x - v.x, C.me.z - v.z); for (const r of C.remotes.values()) { if (r.alive === false || r.away) continue; const d = hyp(r.x - v.x, r.z - v.z); if (d < 24 && d > fd) { fd = d; far = r; } }
    popNumber(far.x, Hgt(far.x, far.z) + 3.4, far.z, '被盯上了！', 'hurt'); fxRing(far.x, far.z, 2.4, 0.6, 0.5, [2.4, 0.4, 0.2], 0.9); C.ui.tip('b7howl', '鬥犬吠叫是在叫同伴：整群會輪流撲向站最遠的那個人。看地上一個接一個的紅圈，邊走邊閃。'); }
  if (v.st === MST.WIND && v.M === MOVES.dog_pin) C.ui.tip('b7flank', '兩隻鬥犬分到你的兩側，要同時撲過來：往前或往後離開兩條線的交叉處，或翻滾閃開。');
}
let glob = null;
function spitFx(v) {      // 拋物線的毒液（一團綠色的毒，從頭的位置飛到落點），沿路滴
  const A = v.act, s = clamp(v.stT / Math.max(0.05, A.strike), 0, 1), L = v.arg / 10, hx = v.ox + sin(v.of) * 1.9 * v.size, hz = v.oz + cos(v.of) * 1.9 * v.size, ex = v.ox + sin(v.of) * L, ez = v.oz + cos(v.of) * L;
  const x = lerp(hx, ex, s), z = lerp(hz, ez, s), y = lerp(Hgt(hx, hz) + 2.0, Hgt(ex, ez) + 0.2, s) + sin(PI * s) * (1.2 + L * 0.18); emit(x, y, z, 3, [0.8, 2.2, 0.35], 0.6, 0.3, 0.35, 6);
  if (!glob) { glob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.0, 0.2), toneMapped: false })); glob.frustumCulled = false; W.scene.add(glob); }
  glob.visible = s < 0.98; glob.position.set(x, y, z); glob.scale.set(1 + 0.25 * sin(now * 30), 1 - 0.2 * sin(now * 30), 1 + 0.25 * sin(now * 30)); globT = now;
}
let globT = -9;

/* ============================== 測試用生成 ============================== */
const tests = []; let lastT7 = '';
const KIND = { dog: { n: 3, lv: 13, d: 14 }, bison: { n: 3, lv: 11, d: 18 }, python: { n: 1, lv: 12, d: 11 } };
function addMon(type, lv, x, z, pack, f) {
  const id = C.sim.length, st = monStats(type, lv, false), D = MON[type];
  C.mons.push({ id, type, lv, elite: false, name: D.name, drop: undefined, orb: undefined, hx: x, hz: z, x, z, f, tx: x, tz: z, tf: f, st: MST.IDLE, stT: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, dmg: st.dmg, exp: st.exp, size: st.size, speed: 0, flash: 0, model: null, tag: null, tele: null, others: 0, credited: -1, idleT: Math.random() * 5, mvc: 0, arg: 0, enr: 0, M: null, act: null, tg: null, judged: -1, ox: x, oz: z, of: 0, lx: x, lz: z, test7: 1 });
  const w = { id, type, elite: false, pack, moves: D.moves.map(m => MOVES[m]), hx: x, hz: z, x, z, f, st: MST.IDLE, t: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, target: null, seen: {}, wanderT: Math.random() * 4, wx: x, wz: z, cd: 0, kx: 0, kz: 0, stagDur: 0.2, mvc: 0, arg: 0, enr: 0, M: null, wd: 0, sd: 0, rd: 0, chain: null, mcd: {}, last: '', provoked: false, fleeFrom: null, immune: 0, hits: 0, retreat: 0, sprung: false, near: 1e9, test7: 1 };
  C.sim.push(w); if (pack != null) { if (!C.packs.has(pack)) C.packs.set(pack, []); C.packs.get(pack).push(w); } return C.mons[id];
}
function group(kind, lv, x, z, f, n) { const pack = n > 1 ? 7000 + tests.length : null, out = []; for (let k = 0; k < n; k++) { const a = f + PI / 2 + k * 2.2, r = n > 1 ? 2.6 + k * 0.4 : 0; out.push(addMon(kind, lv, x + sin(a) * r, z + cos(a) * r, pack, f)); } return out; }
function mirror(s) { for (const [i, g] of s.split(';').entries()) { if (i < tests.length) continue; const [kind, lv, x, z, f, n, id0] = g.split(','); if (!KIND[kind] || +id0 !== C.sim.length) return; enable(); tests.push([kind, +lv, +x, +z, +f, +n, +id0]); group(kind, +lv, +x, +z, +f, +n); } }
// 在角色前方生成一組（主控端；其他人會照 t7 補上）。o：{ lv, n, d 距離, x, z, f }
export async function spawnTest(kind = 'dog', o = {}) {
  if (!KIND[kind]) throw new Error('沒有這種：' + kind); await load(); enable(); if (!C.Net.isHost) { console.warn('只有主控端能生成'); return []; }
  const K = KIND[kind], me = C.me, f0 = o.f ?? me.f, d = o.d ?? K.d, x = o.x ?? me.x + sin(f0) * d, z = o.z ?? me.z + cos(f0) * d, f = Math.atan2(me.x - x, me.z - z), lv = o.lv ?? K.lv, n = o.n ?? K.n;
  tests.push([kind, lv, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(f * 100) / 100, n, C.sim.length]); return group(kind, lv, x, z, f, n);
}
// 測試與截圖用：指定一隻出某一招（目標預設是自己）｜指定一群鬥犬用某個協同計畫｜按住不動｜把測試生成的全部收掉（倒下、不重生）
function force(id, moveId, who = 'self') { const w = simOf(id), p = C.playerOf(who); if (!w || !p || !MOVES[moveId]) return false; w.target = who; w.provoked = true; w.cd = 0; C.startMove(w, MOVES[moveId], p); return true; }
function plan(id, kind, who = 'self') { const w = simOf(id); if (!w || w.pack == null) return false; const q = squadOf(w), e = packOf(w).filter(o => alive(o) && !S7(o).frz); for (const o of e) { o.target = who; o.provoked = true; if (o.st === MST.IDLE) o.st = MST.CHASE; } now = C.clock(); const tgt = C.playerOf(who); q.plan = null; const save = Math.random; Math.random = () => ({ flank: 0.01, hold: 0.5, howl: 0.99 })[kind] ?? 0.5; q.howl = 0; startPlan(q, e, w, { tgt }); Math.random = save; return q.plan && q.plan.kind; }
function freeze(id, on = true) { const w = simOf(id); if (w) S7(w).frz = !!on; }
function clear() { for (const w of C.sim) if (w.test7) { w.st = MST.DEAD; w.t = -1e6; w.target = null; const v = C.mons[w.id]; v.st = MST.DEAD; v.stT = 99; if (v.model) v.model.root.visible = false; if (v.tag) v.tag.el.style.display = 'none'; } for (const P of pools.slice()) dropPool(P); held = latch = toss = null; }
function load() { if (!B07) B07 = B07m; return Promise.resolve(B07); }      // 0.7a：改成直接匯入（B07p 留著不用）
/* ============================== 初始化（game.js 把自己內部的東西傳進來） ============================== */
export function init(ctx) {
  C = ctx; if (typeof window === 'undefined') return;
  if (window.__dev07) {      // 0.8 測試指令（介面08 第 9 節）：其他模組也往同一個 __dev08 裡加，不要覆蓋
    const D = window.__dev08 = window.__dev08 || {};
    D.pit = (id, what = 'sub') => { if (!C.Net.isHost) return false; for (const [wid, pit] of PITS) if (pit.id === id) { const w = C.sim[wid], s = S7(w); if (what === 'rise') startRise(w, s, 'self'); else { setSub(w, s); w.x = pit.x; w.z = pit.z; } s.sp = w.spawn; return true; } return false; };      // 讓某個坑的蟒沉下／起身（主控端）
    D.struggleDemo = kind => { demo = kind ? { kind, t0: C.clock() } : null; return !!demo; };      // 假造掙脫條：'coil'｜'latch'｜null（收掉）；struggle() 會回假資料
  }
  window.addEventListener('keydown', onPress, true); window.addEventListener('mousedown', onPress, true); window.addEventListener('touchstart', onPress, { capture: true, passive: true });
  if (window.__dev07) window.__beast07 = {      /* 製作人：正式版不開放生成；測試頁或測試腳本在載入前設 window.__dev07 = true 才有 */ spawn: spawnTest, sites: SITES07, enable, MON07, MOVES07, state: () => ({ held, latch, toss, pools: pools.length, poolAt: pools.map(P => [+P.x.toFixed(2), +P.z.toFixed(2), +P.r.toFixed(2), +P.t.toFixed(2)]), tests: tests.slice(), pits: pitState() }), force, plan, freeze, clear };
  load(); if (SITES07.enabled) load().then(() => { enable(); if (C.Net.isHost) for (const s of SITES07.list) spawnTest(s.kind, { x: s.x, z: s.z, f: 0, n: s.n, lv: s.lv }); });
}
