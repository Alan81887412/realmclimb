/* 0.8 菁英招式（玩法總監 X4；接替原排給 P5 的 elite08）。
   R5（設計定案 1-5）：白鹽臺的狂牛「狂奔連衝」「震地刨」、舊飼育場的大蟒蛇「雙纏」「拖入坑底」、斷鍊・鐵牙「召集」「斷鍊鞭」。
   X4（大擴建計畫 T5 菁英）：猩猩・白背「雙抓」（在 beastai08b，這裡只給招式資料）「連續拔石」、岩羊・斷崖角「連衝三趟」、獄卒長「鐵嘴套咬住」「鎖鍊橫掃」「召集（不叫拴住的狗）」。
   接法：
   ① 招式資料在載入時併進 core.js 的 MOVES。這個檔匯入 beastai07／08a／08b，所以它們一定先註冊：舊的 62 招編號不變，新招接在 62 以後，同步用 hooks08 的 MC()（加寬的招式編碼）。
   ② 主控端：beastai07（野牛、沼蟒、鬥犬）與 beastai08b（猩猩、岩羊）的 host() 遇到菁英先問 H8.fn.eliteHost(w, X)：回 true＝這一幀處理完；其他＝照原本的流程（可以先開一招再讓原流程接著跑）。
   ③ 判定照遊戲原本的規則（每個人只判定自己、預警＝判定）。被打中之後的效果（擊倒、拉近、咬住）聽 me:hurt；大蟒蛇雙纏的兩條線自己判定（遊戲只判一條）。
   ④ 介面：export eliteInfo／cast／struggle／dragged／targetedBy（ui08.js 動態載入這個檔，game.js 也靜態匯入，兩邊是同一份）；事件 beast:cast、beast:marked、beast:drag、beast:free、beast:rescue、elite:spawn（介面08 第 3 節）。
   presence 新欄位（大小）：
     e8  ＝受害者自己放 [野獸編號, 動作編號 % 1000]：被雙纏或鐵嘴套咬住時才有，脫身就清掉。約 12 位元組。
     e8h ＝主控端放 [[野獸編號, 被纏的人 peer, 階段 0 纏住｜1 拖進坑], …]：有人被纏住時才有。每筆約 26 位元組，最多 3 筆（大蟒蛇 2＋獄卒長 1）。
   菁英的扭絞、咬住每秒傷害不乘 eliteK（數值 9b 的要求，和沼蟒一樣）。註解只用區塊註解。 */
import { MON, MOVES, MOVE_IDS, MST, AI, monStats, clamp, angDiff, dampAng, TAU } from './core.js'; import { applyBig08 } from './core.js';
import { ELITE } from './data06.js';
import { Hgt, blockedAt, waterDepth, collide } from './world.js';
import { popNumber, fxRing, emit as fxEmit, makeTelegraph, showTelegraph } from './actors.js';
import { keyOf, actionOf } from './keys.js';
import * as H8 from './hooks08.js';
import * as BA7 from './beastai07.js';
import * as BB from './beastai08b.js';
import './beastai08a.js';
import { PITS08, ELITE_SPOTS08 } from './places08.js';
const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, PI = Math.PI;

/* ============================== 數字（數值總監改這裡；倍率照設計定案 1-5 的暫代值，玩法當上限用） ============================== */
export const T8 = {
  bull: { rushCd: 16, rushMin: 6, rushMax: 24, stompCd: 9, stompD: 6.6, kd: 1.2 },
  python: { twinCd: 13, twinD: 7.2, drag: 2.5, hold: 6.0, need: 12, free: 0.04, tick: 1.0, pitK: 1.5 },
  rally: { cd: 28, r: 60, packs: 1, first: 3, max: 3 },
  whip: { cd: 7, d: 5.8, pull: 2 },
  warden: { muzzleCd: 10, muzzleD: 4.6, hold: 3.5, need: 12, free: 0.05, tickK: 0.6 },
  cliff: { ramCd: 11, min: 4, max: 13 },
  whiteback: { rock2: true }
};

/* ============================== 招式資料 ============================== */
const mv = (name, anim, shape, o) => Object.assign({ name, anim, shape, wind: 0.6, strike: 0.3, recover: 0.7, dash: 0, at: 0, dmg: 1, min: 0, max: 3, w: 1.8, r: 3, r0: 0, arc: 1, off: 0, dir: 0, track: 0.6, cd: 0, low: 1 }, o);
/* 欄位（新的）：kd8 打中擊倒幾秒（乘 1 − immob）｜pull8 打中拉近幾公尺｜latch8e 打中被咬住（照沼蟒的掙脫規則）｜twin8 雙纏（兩條線，這個檔自己判定）｜e8 菁英招（介面施法條、被盯上）
   steer／toss／sh7 是 beastai07 的欄位（衝撞修正方向、挑飛、預警跟著野牛）；shove 是 beastai08b 的（往坡下推）；seize 是 beastai08b 的抓舉 */
export const MOVES_E8 = {
  /* 狂牛：狂奔連衝。第一趟刨地 1.6 秒；後兩趟是連段的後續招（預備 ×0.8＝0.34 秒、上一趟收招 ×0.3＝0.17 秒 → 趟間約 0.5 秒）；每趟＝鬥牛衝 ×1.15。撞上鹽壁、岩石照 beastai07 撞暈 2.6 秒並中斷連衝 */
  bull_rush1: mv('狂奔連衝', 'charge', 'line', { wind: 1.6, strike: 1.1, recover: 0.55, dash: 18, w: 2.3, min: 0, max: 40, dmg: 1.15 * 1.15, heavy: 1, armor: 1, track: 0.9, steer: 0.32, toss: 1, sh7: 1, cd: 1, e8: 1 }),
  bull_rush2: mv('狂奔連衝', 'charge', 'line', { wind: 0.42, strike: 1.0, recover: 0.55, dash: 17, w: 2.3, min: 0, max: 40, dmg: 1.15 * 1.15, heavy: 1, armor: 1, track: 0.9, steer: 0.3, toss: 1, sh7: 1, e8: 1 }),
  /* 狂牛：震地刨（前方 8 公尺、±70°；擊倒 1.2 秒；＝老疤震地 ×1.4）。r 5.75 × 菁英 1.25 ＋ 身體半寬 ≈ 8 公尺 */
  bull_stomp: mv('震地刨', 'slam', 'cone', { wind: 0.9, strike: 0.22, recover: 1.1, r: 5.75, arc: 1.1, at: 0.2, dmg: 1.4 * 1.4, max: 7, heavy: 1, armor: 1, cd: 1, kd8: T8.bull.kd, e8: 1 }),
  /* 大蟒蛇：雙纏（頭往前、尾巴往後同時撲出兩條直線，各長約 7、寬約 2.8；0.9 秒預警；最多纏兩人；每條＝撲纏 ×0.5）。遊戲畫頭那一條，尾巴那一條這個檔畫；判定都在這個檔 */
  py_twin: mv('雙纏', 'coil', 'line', { wind: 0.9, strike: 0.3, recover: 0.9, dash: 4.65, w: 1.6, min: 0, max: 7.5, dmg: 0.5 * 0.5, nj: 1, twin8: 1, cd: 1, e8: 1 }),
  /* 大蟒蛇：纏住（狀態招；STRIKE 一直到放開；拖入坑底也是這一招，階段看 e8h） */
  py_hold: mv('拖入坑底', 'crush', 'circle', { wind: 0.1, strike: 99, recover: 1.2, r: 0, nj: 1, sh7: 1, e8: 1 }),
  /* 鐵牙、獄卒長：召集（1.2 秒長吠，重攻擊或暈眩打斷；出聲那一刻 60 公尺內最多 1 群沒拴住的鬥犬趕來）。snd8 'call'＝音效的召集聲 */
  dog_rally: mv('召集', 'rally', 'circle', { wind: 1.2, strike: 0.6, recover: 0.4, r: 0, nj: 1, sh7: 1, snd8: 'call', cd: 1, e8: 1 }),
  /* 鐵牙、獄卒長：斷鍊鞭（6 公尺扇形；打中拉近 2 公尺；＝斷鍊甩擊 ×0.75）。r 4.4 × 1.25 ＋ 身體半寬 ≈ 6 公尺 */
  dog_whip: mv('斷鍊鞭', 'whip', 'cone', { wind: 0.6, strike: 0.25, recover: 0.8, r: 4.4, arc: 1.0, at: 0.12, dmg: 0.75 * 0.75, max: 6, pull8: T8.whip.pull, cd: 1, e8: 1 }),
  /* 獄卒長：鐵嘴套咬住（咬住型：自己連按 12 下、隊友打掉同級普通鬥犬 5% 就鬆口、最多 3.5 秒 × (1 − hold)） */
  dog_muzzle: mv('鐵嘴套', 'bite', 'line', { wind: 0.65, strike: 0.3, recover: 1.0, dash: 4.2, w: 1.5, min: 0, max: 5, dmg: 0.45, latch8e: 1, cd: 1, e8: 1 }),
  dog_mhold: mv('咬住不放', 'bite', 'circle', { wind: 0.1, strike: 99, recover: 0.9, r: 0, nj: 1, sh7: 1, e8: 1 }),
  /* 斷崖角：連衝三趟（每趟都往坡下推；後兩趟是連段的後續招） */
  ibex_ram1: mv('連衝', 'ram', 'line', { wind: 0.8, strike: 0.5, recover: 0.6, dash: 9, w: 2.0, min: 0, max: 40, dmg: 1.0, heavy: 1, track: 0.7, shove: 1, cd: 1, e8: 1 }),
  ibex_ram2: mv('連衝', 'ram', 'line', { wind: 0.5, strike: 0.5, recover: 0.6, dash: 9, w: 2.0, min: 0, max: 40, dmg: 1.0, heavy: 1, track: 0.85, shove: 1, e8: 1 }),
  /* 白背：雙抓（比一般猩猩的抓舉寬，兩個人並排站在前面都抓得到；同時舉兩個人的規則在 beastai08b 的 maxHold） */
  ape_grab2: mv('雙抓', 'grab', 'cone', { wind: 0.75, strike: 0.25, recover: 1.25, r: 2.3, arc: 1.15, at: 0.14, dmg: 0.4, min: 0, max: 3.0, cd: 8, track: 0.5, seize: 1, armor: 1, e8: 1 })
};
/* 連段的容器（不進 MOVES，不佔編號；startMove 只用 chain、id、cd） */
const RUSH3 = { id: 'bull_rush3', chain: ['bull_rush1', 'bull_rush2', 'bull_rush2'], cd: T8.bull.rushCd };
const IRAM3 = { id: 'ibex_ram3', chain: ['ibex_ram1', 'ibex_ram2', 'ibex_ram2'], cd: T8.cliff.ramCd };
export function enable() {
  for (const id in MOVES_E8) { if (MOVES[id]) continue; const M = MOVES_E8[id]; M.id = id; M.i = MOVE_IDS.length; MOVES[id] = M; MOVE_IDS.push(id); }
  applyBig08();
  return MOVE_IDS.length;
}
enable();

/* ============================== 菁英的身分 ============================== */
/* 介面的名牌（六隻＋新增六隻）：key 短名、title 稱號、name 名字、crest 剪影種類 */
const INFO = {
  trophy_frost: { key: 'frost', title: '頭狼', name: '霜背', crest: 'wolf' }, trophy_scar: { key: 'scar', title: '巨熊', name: '老疤', crest: 'bear' }, trophy_shadow: { key: 'shade', title: '潛行虎', name: '影牙', crest: 'tiger' },
  trophy_bison: { key: 'bull', title: '白鹽臺的', name: '狂牛', crest: 'bison', k: 'bull' }, trophy_python: { key: 'python', title: '舊飼育場的', name: '大蟒蛇', crest: 'python', k: 'python' }, trophy_irontooth: { key: 'irontooth', title: '斷鍊', name: '鐵牙', crest: 'dog', k: 'iron' },
  trophy_blackridge: { key: 'blackridge', title: '悍豬', name: '黑脊', crest: 'boar' }, trophy_whitecrest: { key: 'whitecrest', title: '大公鹿', name: '白冠', crest: 'deer' }, trophy_croc: { key: 'bigcroc', title: '', name: '巨鱷', crest: 'croc' },
  trophy_whiteback: { key: 'whiteback', title: '猩猩', name: '白背', crest: 'ape', k: 'whiteback' }, trophy_cliffhorn: { key: 'cliffhorn', title: '岩羊', name: '斷崖角', crest: 'ibex', k: 'cliff' }, trophy_warden: { key: 'warden', title: '', name: '獄卒長', crest: 'dog', k: 'warden' }
};
const NEW9 = new Set(['trophy_bison', 'trophy_python', 'trophy_irontooth', 'trophy_blackridge', 'trophy_whitecrest', 'trophy_croc', 'trophy_whiteback', 'trophy_cliffhorn', 'trophy_warden']);
let C = null, now = 0, me = null;
const monOf = id => (C && C.mons[id]) || null;
const dropOf = w => { const v = monOf(w.id); return v ? v.drop : undefined; };
export const kindOf = w => { if (!w || !w.elite) return null; const I = INFO[dropOf(w)]; return I && I.k ? I.k : null; };
const SE = new WeakMap(), S = w => { let s = SE.get(w); if (!s) SE.set(w, s = {}); return s; };
const dist = (a, b) => hyp(a.x - b.x, a.z - b.z);
const rel = (w, t) => Math.abs(angDiff(w.f, Math.atan2(t.x - w.x, t.z - w.z)));
const selfPeer = () => (C.Net && C.Net.selfPeer) || 'local';
const peerOf = who => (who === 'self' ? selfPeer() : who);
/* 菁英這一場的傷害加成（同 game.js 的 eliteK：由血量上限推回開戰時的人數） */
export const eliteN = v => (v && v.elite ? clamp(Math.round((v.hpMax / v.baseHp - 1) / ELITE.perHp) + 1, 1, ELITE.maxN) : 1);
export const eliteK = v => (v && v.elite ? 1 + ELITE.perDmg * (eliteN(v) - 1) : 1);
/* 門檻按同級普通個體的血量（製作人裁決第 3 條）：打斷＝× AI.big（狂牛 65、鐵牙 66、大蟒蛇 216）；鬆口＝× 比例 */
export const breakThr = w => w.baseHp / ELITE.hp * AI.big;
const normalHp = w => { const v = monOf(w.id); return monStats(w.type, v ? v.lv : 1, false).hp; };
/* 招式編碼（加寬，hooks08）：狀態招自己設 */
function setA(w, M, st, dur) { w.M = M; w.mvc = H8.MC(M) | (w.enr ? 64 : 0); w.st = st; w.t = 0; if (st === MST.RECOVER) w.rd = dur; else if (st === MST.STRIKE) w.sd = dur; else if (st === MST.WIND) w.wd = dur; w.chain = null; }

/* ============================== 主控端（beastai07／08b 的 host() 先問這裡） ============================== */
export function eliteHost(w, X) {
  const k = kindOf(w); if (!k || !C) return undefined; now = C.clock(); const s = S(w);
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.holds = []; s.rallyN = 0; s.engT = 0; s.ra = -1; s.rk = -1; s.second = false; pubHolds(); }
  if (w.provoked && w.target) s.engT = (s.engT || 0) + X.dt; else if (w.st === MST.IDLE) s.engT = 0;
  if (k === 'bull') return hostBull(w, X, s);
  if (k === 'python') return hostPython(w, X, s);
  if (k === 'iron' || k === 'warden') return hostDog(w, X, s, k);
  if (k === 'whiteback') return hostApe(w, X, s);
  if (k === 'cliff') return hostIbex(w, X, s);
  return undefined;
}
/* ---------- 狂牛 ---------- */
function hostBull(w, X, s) {
  const t = X.tgt; if (w.st !== MST.CHASE || w.cd > 0 || !t) return undefined;
  const d = dist(w, t), r = rel(w, t);
  if (d <= T8.bull.stompD && r < 0.9 && !(w.mcd.bull_stomp > 0)) { C.startMove(w, MOVES.bull_stomp, t); w.mcd.bull_stomp = T8.bull.stompCd; return true; }
  if (w.provoked && d >= T8.bull.rushMin && d <= T8.bull.rushMax && r < 1.4 && !(w.mcd.bull_rush3 > 0)) { C.startMove(w, RUSH3, t); return true; }
  return undefined;
}
/* ---------- 大蟒蛇：雙纏 → 纏住 → 2.5 秒沒被救就拖進坑 ---------- */
function hostPython(w, X, s) {
  const M = w.M;
  if (M === MOVES.py_twin && (w.st === MST.WIND || w.st === MST.STRIKE || w.st === MST.RECOVER)) {
    X.nx = w.x; X.nz = w.z;
    if (w.st === MST.WIND) { if (X.tgt && w.t < w.wd * 0.7) w.f = dampAng(w.f, Math.atan2(X.tgt.x - w.x, X.tgt.z - w.z), 6, X.dt); if (w.t >= w.wd) { w.st = MST.STRIKE; w.t = 0; w.ox = w.x; w.oz = w.z; w.of = w.f; w.tag = false; } return true; }
    collect(w, s, X, 2);
    if (w.st === MST.STRIKE) { if (w.t >= w.sd) { w.st = MST.RECOVER; w.t = 0; } return true; }
    if (s.holds.length && (s.holds.length >= 2 || w.t >= 0.35)) { startHold(w, s, MOVES.py_hold); return true; }      /* 只纏到一個時多等一下，讓另一個人的判定傳過來 */
    if (w.t >= w.rd) { w.st = MST.CHASE; w.t = 0; w.cd = 0.8; w.mcd.py_twin = T8.python.twinCd; }
    return true;
  }
  if (M === MOVES.py_hold && w.st === MST.STRIKE) return holdTick(w, X, s, 'coil');
  if (w.st === MST.CHASE && w.cd <= 0 && X.tgt && !(w.mcd.py_twin > 0) && dist(w, X.tgt) <= T8.python.twinD) { C.startMove(w, MOVES.py_twin, X.tgt); w.mcd.py_twin = T8.python.twinCd; return true; }
  return undefined;
}
/* ---------- 鐵牙、獄卒長 ---------- */
function hostDog(w, X, s, k) {
  const M = w.M;
  if (M === MOVES.dog_mhold && w.st === MST.STRIKE) return holdTick(w, X, s, 'latch');
  if (M === MOVES.dog_muzzle && (w.st === MST.STRIKE || (w.st === MST.RECOVER && w.t < 0.9))) { collect(w, s, X, 1); if (s.holds.length) { startHold(w, s, MOVES.dog_mhold); return true; } return undefined; }
  if (M === MOVES.dog_rally && (w.st === MST.STRIKE || w.st === MST.RECOVER) && s.ra !== w.aid) { s.ra = w.aid; s.called = rally(w); return undefined; }      /* 預備走完那一刻（出招可能同一幀就被地形擋成收招，所以收招也算；被打斷是踉蹌，不算） */
  const t = X.tgt; if (w.st !== MST.CHASE || w.cd > 0 || !t) return undefined;
  const d = dist(w, t), r = rel(w, t);
  if (w.provoked && (s.engT || 0) >= T8.rally.first && (s.rallyN || 0) < T8.rally.max && !(w.mcd.dog_rally > 0)) { s.rallyN = (s.rallyN || 0) + 1; C.startMove(w, MOVES.dog_rally, t); w.mcd.dog_rally = T8.rally.cd; return true; }
  const c = [];
  if (d <= T8.whip.d && r < 0.9 && !(w.mcd.dog_whip > 0)) c.push(MOVES.dog_whip);
  if (k === 'warden' && d <= T8.warden.muzzleD && r < 0.6 && !(w.mcd.dog_muzzle > 0)) c.push(MOVES.dog_muzzle);
  if (!c.length) return undefined;
  const P = c[Math.floor(Math.random() * c.length)]; C.startMove(w, P, t); w.mcd[P.id] = P === MOVES.dog_whip ? T8.whip.cd : T8.warden.muzzleCd; return true;
}
/* 召集：60 公尺內最多 1 群（不含自己這群、不含拴住的狗、不含已經在打的）；回傳叫來幾隻。
   叫來的狗老家暫時搬到牠旁邊（不然離老家 42 公尺就放棄目標）；回到閒晃時搬回去（host 每幀看 RALLIED） */
const RALLIED = new Set();
export function rally(w, opt = {}) {
  const sim = opt.sim || C.sim, leashed = opt.leashed || BB.leashed, R = opt.r || T8.rally.r, packs = new Map();
  for (const o of sim) {
    if (o === w || o.type !== 'dog' || o.st === MST.DEAD || o.elite || leashed(o)) continue;
    if (o.pack != null && o.pack === w.pack) continue; if (o.target && o.st !== MST.IDLE) continue;
    const d = dist(o, w); if (d > R) continue; const key = o.pack != null ? 'p' + o.pack : 's' + o.id, g = packs.get(key) || { d: 1e9, list: [] }; g.d = Math.min(g.d, d); g.list.push(o); packs.set(key, g);
  }
  const pick = [...packs.values()].sort((a, b) => a.d - b.d).slice(0, opt.packs || T8.rally.packs); let n = 0;
  for (const g of pick) for (const o of g.list) { o.target = w.target; o.provoked = true; o.cd = 0; if (o.st === MST.IDLE || o.st === MST.WARN) { o.st = MST.CHASE; o.t = 0; } if (!o.rh8) o.rh8 = [o.hx, o.hz]; o.hx = w.x; o.hz = w.z; RALLIED.add(o); n++; }
  return n;
}
function rallyTick() { for (const o of RALLIED) { if (o.st === MST.DEAD || (o.st === MST.IDLE && !o.target)) { if (o.rh8) { o.hx = o.rh8[0]; o.hz = o.rh8[1]; o.rh8 = null; } RALLIED.delete(o); } } }
/* ---------- 白背：連續拔石（第一塊丟完馬上對最遠的人再拔一塊） ---------- */
function hostApe(w, X, s) {
  if (!T8.whiteback.rock2) return undefined;
  if (w.M === MOVES.ape_rock && w.st === MST.RECOVER && w.t >= w.rd - 0.02 && s.rk !== w.aid) {
    s.rk = w.aid; if (s.second) { s.second = false; return undefined; }
    let far = null, fd = 0; for (const [, p] of X.players) { const q = dist(w, p); if (q >= MOVES.ape_rock.min && q <= MOVES.ape_rock.max && q > fd) { fd = q; far = p; } }
    if (far) { s.second = true; C.startMove(w, MOVES.ape_rock, far, true); return false; }      /* 回 false：beastai08b 接著把落點與加成寫進 arg */
  }
  return undefined;
}
/* ---------- 斷崖角：連衝三趟（不逃，beastai08b 的菁英岩羊一律回頭打） ---------- */
function hostIbex(w, X, s) {
  const t = X.tgt; if (w.st !== MST.CHASE || w.cd > 0 || !t) return undefined;
  const d = dist(w, t), r = rel(w, t);
  if (d >= T8.cliff.min && d <= T8.cliff.max && r < 0.8 && !(w.mcd.ibex_ram3 > 0)) { C.startMove(w, IRAM3, t); return true; }
  return undefined;
}

/* ---------- 纏住／咬住（主控端）：誰被纏（受害者放 e8）、隊友救、拖入坑底、放開 ---------- */
const victimAt = (id, aid, who) => { if (who === 'self') return !!(VH && VH.id === id && VH.aid === aid); const r = C.remotes.get(who), p = r && r.lastPres; return !!(p && Array.isArray(p.e8) && (p.e8[0] | 0) === id && (p.e8[1] | 0) === aid); };
const victimHeld = (id, who) => { if (who === 'self') return !!(VH && VH.id === id); const r = C.remotes.get(who), p = r && r.lastPres; return !!(p && Array.isArray(p.e8) && (p.e8[0] | 0) === id); };
function collect(w, s, X, max) {
  if (!s.holds || s.hAid !== w.aid % 1000) { s.holds = []; s.hAid = w.aid % 1000; s.relH = new Set(); }      /* 新的一招（動作編號換了）：重新收 */
  for (const [id] of X.players) { if (s.holds.length >= max) break; if (s.holds.some(h => h.who === id) || (s.relH && s.relH.has(id))) continue; if (victimAt(w.id, s.hAid, id)) s.holds.push({ who: id, ph: 0, t0: now }); }
}
function startHold(w, s, M) {
  setA(w, M, MST.STRIKE, 99); w.kx = w.kz = 0; s.rs = new Map(); s.acc = new Map(); s.kind = M === MOVES.py_hold ? 'coil' : 'latch';
  const L = C.ledger.get(C.mkey(w)); if (L) for (const [who, d] of L) s.rs.set(who, d);
  for (const h of s.holds) h.t0 = now; s.h0 = now; pubHolds();
}
function dropHold(w, s, h, why, by) { const i = s.holds.indexOf(h); if (i >= 0) s.holds.splice(i, 1); (s.relH || (s.relH = new Set())).add(h.who); h.why = why; s.lastWhy = why; s.lastBy = by || null; }
export function holdTick(w, X, s, kind) {
  X.nx = w.x; X.nz = w.z; const P = kind === 'coil' ? T8.python : T8.warden, thr = normalHp(w) * P.free; let ch = false;
  if (kind === 'coil' && s.holds.length < 2 && now - s.h0 < 0.8) { const n0 = s.holds.length; collect(w, s, X, 2); for (const h of s.holds.slice(n0)) { h.t0 = now; if (C.ledger.get(C.mkey(w))) s.rs.set(h.who, (C.ledger.get(C.mkey(w)).get(h.who)) || 0); } if (s.holds.length > n0) ch = true; }      /* 晚一點才收到的第二個人（開始纏後 0.8 秒內） */
  /* 隊友救：每個沒被纏的人各自累計打掉的血；到門檻就放開離他最近的那一個（兩個人一起被纏時，第三個人站到誰旁邊就先救誰） */
  const L = C.ledger.get(C.mkey(w));
  if (L) for (const [who, d] of L) { const prev = s.rs.has(who) ? s.rs.get(who) : 0; s.rs.set(who, d); const inc = d - prev; if (inc <= 0 || s.holds.some(h => h.who === who)) continue; s.acc.set(who, (s.acc.get(who) || 0) + inc); }
  for (const [who, a] of s.acc) {
    if (a < thr || !s.holds.length) continue; const p = C.playerOf(who); let best = s.holds[0], bd = 1e9;
    for (const h of s.holds) { const q = C.playerOf(h.who); const dd = p && q ? dist(p, q) : 1e8; if (dd < bd) { bd = dd; best = h; } }
    dropHold(w, s, best, 'ally', who); s.acc.set(who, a - thr); ch = true;
  }
  for (const h of s.holds.slice()) {
    const p = C.playerOf(h.who);
    if (!p || !victimHeld(w.id, h.who)) { dropHold(w, s, h, 'free'); ch = true; }
    else if (now - h.t0 >= (kind === 'coil' ? P.hold + 0.5 : P.hold + 0.5)) { dropHold(w, s, h, 'tired'); ch = true; }
    else if (kind === 'coil' && h.ph === 0 && now - h.t0 >= P.drag) { h.ph = 1; ch = true; }
  }
  if (ch) pubHolds();
  if (!s.holds.length) { setA(w, w.M, MST.RECOVER, w.M.recover); w.cd = Math.max(w.cd, 1.6); w.immune = 0.6; return true; }
  const v = monOf(w.id); if (kind === 'latch' && s.holds[0]) { const p = C.playerOf(s.holds[0].who); if (p) w.f = dampAng(w.f, Math.atan2(p.x - w.x, p.z - w.z), 6, X.dt); }
  if (v) v.hold8 = s.holds.length;
  return true;
}
let hostList = [], lastPub = '';
function pubHolds() {
  if (!C || !C.Net || !C.Net.isHost) return; const out = [];
  for (const w of C.sim) { if (!w.elite) continue; const s = SE.get(w); if (s && s.holds && s.holds.length && w.M && (w.M === MOVES.py_hold || w.M === MOVES.dog_mhold) && w.st === MST.STRIKE) for (const h of s.holds) out.push([w.id, peerOf(h.who), h.ph]); }
  const j = JSON.stringify(out); hostList = out; if (j === lastPub) return; lastPub = j; C.netSet('e8h', out.length ? out : null, true);
}
/* 大家讀：主控端的纏住名單（主控端自己用本機的） */
function holdsNow() {
  if (C.Net.isHost) return hostList;
  for (const r of C.remotes.values()) { const p = r.lastPres; if (p && typeof p.ms === 'string') return Array.isArray(p.e8h) ? p.e8h.filter(e => Array.isArray(e)) : []; }
  return [];
}

/* ============================== 受害者自己（每個人只算自己）：被纏、被咬、被擊倒、被拉近 ============================== */
let VH = null, relAt = -99;
const escNeed = n => Math.max(1, Math.round(n * (1 - H8.capped('escape'))));
function grabMe(v, kind) {
  if (VH || !me.alive || me.inSafe) return; if (BA7.struggle && BA7.struggle()) return;
  const P = kind === 'coil' ? T8.python : T8.warden;
  VH = { id: v.id, sp: v.spawn, aid: v.aid % 1000, kind, t: 0, n: 0, need: escNeed(P.need), x: me.x, z: me.z, acc: false, at: 0, miss: 0, tk: 0.6, k: 0, ph: 0, dragOn: false };
  C.netSet('e8', [v.id, VH.aid], true); me.stun = Math.max(me.stun, 0.3);
  popNumber(me.x, Hgt(me.x, me.z) + 3.4, me.z, kind === 'coil' ? '被纏住了！' : '被咬住了！', 'hurt');
  if (kind === 'coil') C.ui.tip('e8twin', `被大蟒蛇纏住：連按 ${keyOf('dodge')}、${keyOf('interact')} 或 ${keyOf('attack')} 掙脫；2.5 秒內沒脫身會被拖進坑底（更痛）。隊友打牠就會先放開一個人。`);
  else C.ui.tip('e8muzzle', `被獄卒長的鐵嘴套咬住：連按 ${keyOf('dodge')}、${keyOf('interact')} 或 ${keyOf('attack')} 掙脫，隊友打牠也會鬆口。牠的手下會趁機撲上來。`);
}
function freeVH(txt, how) {
  const h = VH; VH = null; relAt = C.clock(); C.netSet('e8', null, true); me.stun = 0; me.iframe = Math.max(me.iframe, 0.6);
  if (txt) popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, txt, 'perfect');
  const v = monOf(h.id); if (h.dragOn && v) H8.emit('beast:drag', { v, who: 'self', t: 0, on: false });
  if (how && v) H8.emit('beast:free', { v, how, t: h.t });
}
function vhTick(dt) {
  const h = VH, v = monOf(h.id); h.t += dt;
  me.stun = Math.max(me.stun, 0.12); me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.guard = false; me.atk = null; me.charge = null; me.cast = null;
  if (!me.alive) { VH = null; C.netSet('e8', null, true); return; }
  if (!v || v.spawn !== h.sp || v.st === MST.DEAD) return freeVH('脫身', null);
  const e = holdsNow().find(x => (x[0] | 0) === h.id && x[1] === selfPeer());
  if (e) { if (!h.acc) { h.acc = true; h.at = 0; } h.miss = 0; h.ph = e[2] | 0; }
  else if (h.acc) { h.miss += dt; if (h.miss > 0.3) return freeVH('牠鬆開了', 'ally'); }
  else if (h.t > 1.4) return freeVH('脫身', null);
  if (h.n >= h.need) return freeVH('掙脫！', 'self');
  const P = h.kind === 'coil' ? T8.python : T8.warden, hk = 1 - H8.capped('hold');
  if (h.acc) {
    h.at += dt;
    const tmax = h.kind === 'coil' ? P.drag + (P.hold - P.drag) * hk : P.hold * hk;      /* 拖入坑底的 2.5 秒倒數不乘 hold（介面08 9c） */
    if (h.at >= tmax) return freeVH('脫身', 'self');
    if (h.kind === 'coil') {
      if (h.ph === 0 && !h.dragOn) { h.dragOn = true; H8.emit('beast:drag', { v, who: 'self', t: Math.max(0, P.drag - h.at), on: true }); }
      if (h.ph === 1 && h.dragOn) { h.dragOn = false; H8.emit('beast:drag', { v, who: 'self', t: 0, on: false }); popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, '被拖進坑底！', 'hurt'); }
    }
    /* 拖進坑：慢慢被拉到蟒的身邊（坑裡） */
    if (h.ph === 1) { const dx = v.x - h.x, dz = v.z - h.z, d = hyp(dx, dz), stop = MON.python.body * v.size + 0.6; if (d > stop) { const k = Math.min(d - stop, 3.2 * dt); h.x += dx / d * k; h.z += dz / d * k; } }
    h.tk -= dt; if (h.tk <= 0) { h.tk = h.kind === 'coil' ? T8.python.tick : 1.0; const d = v.dmg * (0.15 + 0.08 * h.k) * (h.ph === 1 ? T8.python.pitK : 1) * (h.kind === 'latch' ? T8.warden.tickK : 1); h.k++; C.hurtMe(d, v.x, v.z, { mon: v }); me.kx = me.kz = 0; }
  }
  me.x = h.x; me.z = h.z;
}
function onPress(e) {
  if (!VH || VH.t < 0.12) return; const code = e.type === 'keydown' ? e.code : e.type === 'touchstart' ? '' : 'Mouse' + (e.button | 0); if (e.repeat) return;
  const a = code ? actionOf(code) : 'attack'; if (a !== 'dodge' && a !== 'interact' && a !== 'attack') return; VH.n++;
}
/* 遊戲判定完被打中（含格擋、閃避的結果）之後：擊倒、拉近、咬住 */
function onMeHurt(o) {
  if (!o || !o.M || !o.v) return; const { v, M, res } = o, ok = res === 'hit' || res === 'broken'; if (!ok || !me.alive) return;
  if (M.kd8) { me.stun = Math.max(me.stun, M.kd8 * (1 - H8.capped('immob'))); popNumber(me.x, Hgt(me.x, me.z) + 3.6, me.z, '被震倒', 'hurt'); }
  if (M.pull8) pullMe(v, M.pull8);
  if (M.latch8e) grabMe(v, 'latch');
}
export function pullStep(px, pz, vx, vz, amt, stopAt, ok) {      /* 純函式：往 (vx,vz) 拉 amt 公尺，停在離牠 stopAt 公尺；ok(x,z)＝站不站得住 */
  const dx = vx - px, dz = vz - pz, d = hyp(dx, dz); if (d < 1e-6) return { x: px, z: pz, moved: 0 }; let left = Math.max(0, Math.min(amt, d - stopAt)), x = px, z = pz, moved = 0;
  while (left > 1e-4) { const s = Math.min(0.35, left), nx = x + dx / d * s, nz = z + dz / d * s; if (!ok(nx, nz)) break; x = nx; z = nz; moved += s; left -= s; }
  return { x, z, moved };
}
function pullMe(v, amt) {
  const stop = MON[v.type].body * v.size + 0.9, r = pullStep(me.x, me.z, v.x, v.z, amt, stop, (x, z) => !blockedAt(x, z) && waterDepth(x, z) < 1.1);
  const o = { x: r.x, z: r.z }; collide(o, 0.5); me.x = o.x; me.z = o.z; if (r.moved > 0.3) popNumber(me.x, Hgt(me.x, me.z) + 3.4, me.z, '被拉過去', 'hurt');
}

/* ============================== 大蟒蛇雙纏：兩條線的預警與判定（每個人自己判定自己） ============================== */
export function twinShapes(x, z, f, M, br) { const w = M.w * 1.25 + 2 * (0.45 + br * 0.2), len = M.dash + br + 0.9; return [{ shape: 'line', x, z, f, w, len }, { shape: 'line', x, z, f: f + PI, w, len }]; }
export function inLine(s, x, z, pad = 0.35) { const dx = x - s.x, dz = z - s.z, al = dx * sin(s.f) + dz * cos(s.f), sd = Math.abs(dx * cos(s.f) - dz * sin(s.f)); return al > -0.5 && al < s.len && sd < s.w / 2 + pad; }
const TW = new WeakMap(), TWJ = new WeakMap();
function twinView(v) {
  const M = v.M, on = M === MOVES.py_twin && (v.st === MST.WIND || v.st === MST.STRIKE) && v.model && v.model.root.visible !== false;
  let tg = TW.get(v); if (!on) { if (tg && tg.on8) { showTelegraph(tg, null, null, false); tg.on8 = false; } return; }
  if (!tg) TW.set(v, tg = makeTelegraph());
  const wind = v.st === MST.WIND, A = v.act || M, br = MON.python.body * v.size, sh = twinShapes(wind ? v.x : v.ox, wind ? v.z : v.oz, wind ? v.f : v.of, M, br)[1];
  sh.p = wind ? clamp(v.stT / Math.max(0.05, A.wind + M.at), 0, 1) : 1; showTelegraph(tg, { tg: sh }, null, true); tg.on8 = true;
  if (v.st === MST.STRIKE) { const hid = v.spawn * 1000 + v.aid; if (TWJ.get(v) !== hid) { TWJ.set(v, hid); judgeTwin(v); } }
}
function judgeTwin(v) {
  if (!me.alive || me.inSafe || VH) return; const M = MOVES.py_twin, br = MON.python.body * v.size, rel8 = C.clock() - relAt < 3.5 ? 0.6 : 0;
  const hit = twinShapes(v.ox, v.oz, v.of, M, br).some(s => inLine(s, me.x, me.z, 0.35 + rel8)); if (!hit) return;
  const res = C.hurtMe(v.dmg * M.dmg * eliteK(v), v.x, v.z, { mon: v }); H8.emit('me:hurt', { v, M, res });
  if (res === 'hit' || res === 'broken') grabMe(v, 'coil');
}

/* ============================== 介面：名牌、施法條、掙脫條、拖入倒數、被盯上 ============================== */
export function eliteInfo(v) {
  if (!v || !v.elite) return null; const I = INFO[v.drop];
  if (!I) { const t = String(v.name || ''), i = t.lastIndexOf('・'); return { key: v.drop || v.type, title: i > 0 ? t.slice(0, i) : '', name: i > 0 ? t.slice(i + 1) : t, crest: v.type, n: eliteN(v) }; }
  return { key: I.key, title: I.title, name: I.name, crest: I.crest, n: eliteN(v) };
}
export function cast(v) {
  if (!v || !v.M || v.st !== MST.WIND) return null;
  if (v.M === MOVES.dog_rally) return { key: 'rally', t: v.stT, dur: (v.act && v.act.wind) || MOVES.dog_rally.wind, breakable: true };
  if (MOVES.dog_howl && v.M === MOVES.dog_howl && !v.leash) return { key: 'howl', t: v.stT, dur: (v.act && v.act.wind) || MOVES.dog_howl.wind, breakable: true };      /* 一般鬥犬的長吠（P2 沒接，順手給） */
  return null;
}
export function struggle() {
  const h = VH; if (!h) return null; const P = h.kind === 'coil' ? T8.python : T8.warden, hk = 1 - H8.capped('hold');
  return { kind: h.kind, n: h.n, need: h.need, by: h.id, t: h.at, tmax: h.kind === 'coil' ? P.drag + (P.hold - P.drag) * hk : P.hold * hk, drag: h.kind === 'coil' && h.acc && h.ph === 0 ? { t: Math.max(0, P.drag - h.at), dur: P.drag } : null };
}
const SEEN = new Map();      /* 'id|peer' → 第一次看到（拖入倒數用） */
export function dragged() {
  const out = [], t = C.clock();
  for (const e of holdsNow()) { const v = monOf(e[0] | 0); if (!v || v.M !== MOVES.py_hold) continue; const k = e[0] + '|' + e[1], t0 = SEEN.get(k); if (t0 == null || (e[2] | 0) !== 0) continue; out.push({ who: e[1] === selfPeer() ? 'me' : e[1], t: Math.max(0, T8.python.drag - (t - t0)), dur: T8.python.drag }); }
  return out;
}
let marks = []; const barkUntil = new Map();
export function targetedBy() { return marks.slice(); }
function markTick() {
  const out = [], t = C.clock();
  for (const v of C.mons) {
    if (v.st === MST.DEAD || !v.M || !v.model) continue;
    if ((v.M === MOVES.bull_rush1 || v.M === MOVES.bull_rush2 || v.M === MOVES.ibex_ram1 || v.M === MOVES.ibex_ram2) && (v.st === MST.WIND || v.st === MST.STRIKE)) {
      const f = v.st === MST.WIND ? v.f : v.of, x = v.st === MST.WIND ? v.x : v.ox, z = v.st === MST.WIND ? v.z : v.oz, br = MON[v.type].body * v.size, s = { x, z, f, w: v.M.w * 1.25 + 2 * (0.45 + br * 0.2) + 1.2, len: v.M.dash + br + 6 };
      if (inLine(s, me.x, me.z, 0)) out.push({ id: v.id, kind: 'charge', x: v.x, z: v.z });
    }
    if (MOVES.dog_howl && v.M === MOVES.dog_howl && v.st === MST.STRIKE && !v.leash && !barkUntil.has(v.id + '_' + v.aid)) {
      let far = me, fd = hyp(me.x - v.x, me.z - v.z); for (const r of C.remotes.values()) { if (r.alive === false || r.away) continue; const d = hyp(r.x - v.x, r.z - v.z); if (d < 24 && d > fd) { fd = d; far = r; } }
      barkUntil.set(v.id + '_' + v.aid, far === me && fd < 24 ? t + 2.6 : -1);
    }
  }
  for (const [k, until] of barkUntil) { if (until < t) { if (until > -1 && t - until > 5) barkUntil.delete(k); else if (until === -1 && barkUntil.size > 40) barkUntil.delete(k); continue; } const v = monOf(+k.split('_')[0]); if (v && v.st !== MST.DEAD) out.push({ id: v.id, kind: 'bark', x: v.x, z: v.z }); }
  const key = o => o.id + ':' + o.kind, was = new Set(marks.map(key)), is = new Set(out.map(key));
  for (const o of out) if (!was.has(key(o))) H8.emit('beast:marked', { v: monOf(o.id), on: true, kind: o.kind });
  for (const o of marks) if (!is.has(key(o))) H8.emit('beast:marked', { v: monOf(o.id), on: false, kind: o.kind });
  marks = out;
}
/* 施法事件（召集、長吠）：開始、被打斷、完成。每台從同步的狀態判斷 */
const CST = new WeakMap(), myHit = new WeakMap();
function castTick() {
  for (const v of C.mons) {
    const c = CST.get(v), on = v.st === MST.WIND && v.M && (v.M === MOVES.dog_rally || (MOVES.dog_howl && v.M === MOVES.dog_howl && !v.leash));
    if (on && (!c || c.aid !== v.aid)) { const key = v.M === MOVES.dog_rally ? 'rally' : 'howl'; CST.set(v, { aid: v.aid, key }); H8.emit('beast:cast', { v, key, end: 'start', by: null }); continue; }
    if (c && !on && c.aid != null) {
      const broken = v.st === MST.STAGGER || v.st === MST.DEAD, mine = C.clock() - (myHit.get(v) || -9) < 0.5;
      H8.emit('beast:cast', { v, key: c.key, end: broken ? 'broken' : 'done', by: broken ? (mine ? 'self' : null) : null });
      if (broken && c.key === 'rally' && mine) popNumber(v.x, Hgt(v.x, v.z) + MON[v.type].tagH * v.size + 0.6, v.z, '打斷召集！', 'perfect');
      CST.delete(v);
    }
  }
}
/* 雙纏的拖入倒數事件（隊友被纏時也發，介面畫紅圈）＋救人事件 */
let lastHolds = new Map();
function holdEvents() {
  const t = C.clock(), cur = new Map();
  for (const e of holdsNow()) { const k = e[0] + '|' + e[1]; cur.set(k, e); if (!SEEN.has(k)) SEEN.set(k, t); }
  for (const [k, e] of cur) { const p = lastHolds.get(k), v = monOf(e[0] | 0); if (!v || e[1] === selfPeer() || v.M !== MOVES.py_hold) continue; if (!p) H8.emit('beast:drag', { v, who: e[1], t: T8.python.drag, on: true }); else if ((p[2] | 0) === 0 && (e[2] | 0) === 1) H8.emit('beast:drag', { v, who: e[1], t: 0, on: false }); }
  for (const [k, e] of lastHolds) if (!cur.has(k)) {
    SEEN.delete(k); const v = monOf(e[0] | 0); if (!v) continue;
    if (e[1] !== selfPeer()) { if ((e[2] | 0) === 0) H8.emit('beast:drag', { v, who: e[1], t: 0, on: false }); if (t - (myHit.get(v) || -9) < 1.0) { H8.emit('beast:rescue', { v, who: e[1] }); popNumber(v.x, Hgt(v.x, v.z) + MON[v.type].tagH * v.size + 0.4, v.z, '救下一個！', 'perfect'); } }
  }
  lastHolds = cur;
}
/* 菁英現身／換出沒點 */
const SPW = new WeakMap();
function spawnTick() {
  for (const v of C.mons) { if (!v.elite) continue; const k = v.spawn + '|' + Math.round(v.hx) + '|' + Math.round(v.hz); if (SPW.get(v) === k) continue; SPW.set(v, k);
    const sp = ELITE_SPOTS08 && ELITE_SPOTS08[v.drop]; let spot = 0; if (sp) { let bd = 1e9; sp.forEach((p, i) => { const d = hyp(p[0] - v.hx, p[1] - v.hz); if (d < bd) { bd = d; spot = i; } }); } H8.emit('elite:spawn', { v, spot }); }
}
/* 菁英招的提示（第一次看到） */
const TIPSEEN = new WeakMap();
function tipTick() {
  for (const v of C.mons) { if (!v.elite || !v.M || !v.M.e8 || v.st !== MST.WIND) continue; if (TIPSEEN.get(v) === v.aid) continue; TIPSEEN.set(v, v.aid); if (hyp(v.x - me.x, v.z - me.z) > 32) continue; const M = v.M;
    if (M === MOVES.bull_rush1) C.ui.tip('e8rush', '狂牛刨地刨得特別久＝要連衝三趟，每一趟都對準打牠最痛的人。把牠引向鹽壁或岩石：撞上就暈，連衝也斷了。');
    else if (M === MOVES.bull_stomp) C.ui.tip('e8stomp', '狂牛抬起前腳＝震地刨：前方一大片扇形會把人震倒。繞到牠側面或後面。');
    else if (M === MOVES.py_twin) C.ui.tip('e8twin0', '大蟒蛇的頭和尾巴同時要撲：前後兩條線都會纏人，往側面閃。');
    else if (M === MOVES.dog_rally) C.ui.tip('e8rally', '牠在召集附近的鬥犬：用重攻擊或暈眩打斷這一聲長吠，同伴就不會來。');
    else if (M === MOVES.dog_whip) C.ui.tip('e8whip', '斷鍊甩成一個扇形：打中會把人拉過去，接著狗群會撲站最遠的人。');
    else if (M === MOVES.dog_muzzle) C.ui.tip('e8muz', '獄卒長戴著鐵嘴套撲咬：被咬住要連按掙脫，隊友打牠也會鬆口。');
    else if (M === MOVES.ibex_ram1) C.ui.tip('e8ram', '斷崖角要連衝三趟，每一趟都把人往坡下撞。背對著崖邊時特別小心。');
    else if (M === MOVES.ape_grab2) C.ui.tip('e8grab2', '白背張開雙臂＝兩隻手各抓一個人。兩個人被舉起時，隊友各要打牠一下才救得下來。');
  }
}

/* ============================== 每一幀 ============================== */
function frame(dt) {
  if (!C) return; now = C.clock();
  if (C.Net.isHost) { rallyTick(); pubHolds(); }
  for (const v of C.mons) if (v.elite && v.type === 'python') twinView(v);
  if (VH) vhTick(dt);
  holdEvents(); castTick(); markTick(); spawnTick(); tipTick();
}

/* ============================== 測試指令（__dev07 才有） ============================== */
function devCmds() {
  if (typeof window === 'undefined' || !window.__dev07) return; const D = window.__dev08 = window.__dev08 || {};
  const find = key => { const i = C.mons.findIndex(v => v.elite && (v.drop === key || v.drop === 'trophy_' + key || (INFO[v.drop] && (INFO[v.drop].key === key || INFO[v.drop].k === key)))); return i; };
  D.elite = (key, at) => { if (!key) return C.mons.filter(v => v.elite).map(v => ({ id: v.id, drop: v.drop, name: v.name, lv: v.lv, st: v.st, x: Math.round(v.x), z: Math.round(v.z), M: v.M && v.M.id })); const i = find(key); if (i < 0) return null; if (at && C.Net.isHost) { const w = C.sim[i]; w.x = w.hx = at[0]; w.z = w.hz = at[1]; } return C.mons[i] && { id: i, x: C.mons[i].x, z: C.mons[i].z, M: C.mons[i].M && C.mons[i].M.id }; };
  D.e8 = {
    T8, MOVES_E8, RUSH3, IRAM3, eliteInfo, cast, struggle, dragged, targetedBy, holds: () => holdsNow(), vh: () => VH && Object.assign({}, VH),
    find, force(id, moveId, who = 'self') { if (!C.Net.isHost) return false; const w = C.sim[id], p = C.playerOf(who); if (!w || !p) return false; const M = moveId === 'bull_rush3' ? RUSH3 : moveId === 'ibex_ram3' ? IRAM3 : MOVES[moveId]; if (!M) return false; w.target = who; w.provoked = true; w.cd = 0; if (w.st === MST.IDLE || w.st === MST.WARN || w.st === MST.FLEE) w.st = MST.CHASE; C.startMove(w, M, p); return true; },
    state(id) { const w = C.sim[id], s = w && SE.get(w); return w && { st: w.st, M: w.M && w.M.id, mvc: w.mvc, t: +w.t.toFixed(2), holds: s && s.holds ? s.holds.map(h => [h.who, h.ph]) : [], why: s && s.lastWhy, by: s && s.lastBy, rallyN: s && s.rallyN, called: s && s.called, x: +w.x.toFixed(1), z: +w.z.toFixed(1), target: w.target }; },
    rallied: () => [...RALLIED].map(o => o.id)
  };
}

/* ============================== 初始化 ============================== */
H8.provide('eliteHost', eliteHost, 'X4');
H8.provide('interrupt', (w, hit, big) => {      /* 新的 9 隻菁英：預備動作（沒有霸體的）一下打掉同級普通個體 22% 就打斷；其他照舊（undefined） */
  if (!w || !w.elite || w.st !== MST.WIND || !w.M || w.M.armor) return undefined; const v = monOf(w.id); if (!v || !NEW9.has(v.drop)) return undefined;
  return hit >= breakThr(w);
}, 'X4');
H8.on('init', ctx => {
  C = ctx; me = ctx.me; devCmds();
  if (typeof window !== 'undefined') { window.addEventListener('keydown', onPress, true); window.addEventListener('mousedown', onPress, true); window.addEventListener('touchstart', onPress, { capture: true, passive: true }); }
});
H8.on('frame', frame);
H8.on('me:hurt', onMeHurt);
H8.on('me:hitMon', o => { if (o && o.v) myHit.set(o.v, C ? C.clock() : 0); });
export const debugE8 = { S: w => SE.get(w), VH: () => VH, setVH: o => { VH = o; }, hostList: () => hostList, init: c => { C = c; me = c.me; }, frame };
