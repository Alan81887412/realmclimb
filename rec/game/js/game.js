// 遊戲邏輯：玩家（閃避、連段、蓄力、格擋、技能）、成長、怪物（主控端模擬與呈現）、連線、存檔
import { HERO_ON } from './hero27.js';
import { TAU, clamp, lerp, damp, angDiff, dampAng, r2, r1, num, WORLD, ZONES, zoneAt, MON, MST, MOVES, MOVE_IDS, ENRAGE, monStats, buildSpawns, ITEMS, LV_CAP, expNeed, STAT_KEYS, baseStats, derive, COMBOS, HEAVY, CHARGE, DODGES, DODGE_KINDS, PERFECT, GUARD, SKILLS, SKILL_IDS, ORB_DROP, meetsReq, reqText, WATER, waterLevel, MOVESET, moveByCode, famOf, FAM_NAME, dodgeOf, COMBO_WIN, PROJ, SPRINT, LOCK, PUSH, MANA, BASIC_SKILLS, skillFits, POTION, MEAT, potionPrice, lvHurt, lvDeal, EXPK, killExp, AI, expMigrate, deathExp, EXP_VER } from './core.js';
import { QUESTS, NPCS, PLACES } from './story.js';
import { W, Hgt, tryMove, collide, blockedAt, npcSpots, winches, nowHour, SLOPE, slopeAt, waterDepth, monBlocked, slopeK, setRipple } from './world.js';
import { keyOf } from './keys.js';
import * as T7 from './traps07.js';      // 0.7 舊陷阱與荒地（w7-wild）
import { seatFor } from './ui06.js';      // 營火座位（坐下前先走過去）
import { ELITE, NEEDS, USE, DR_CAP, TEST_SITES, TEST_CAMPS } from './data06.js';
import * as Ars from './arsenal.js';
import * as Craft from './craft.js';
import { biteTick, BITE } from './bitefx08.js';      /* 0.8 咬合特效：新模型（m.sp.v8）咬下去的那一瞬間，嘴前閃一道合起的利齒（bitefx08.js；舊模型不經過） */
import * as Needs from './needs.js'; import * as BB from './beastai08b.js'; import * as BA7 from './beastai07.js'; import * as BA8 from './beastai08a.js';      /* 0.8 X3a：猴群、箭豬、鱷魚 */      // 0.7 新野獸（w7-beast，測試用生成）
import * as THREE from './three.bundle.js';
import { bearFx08 } from './bearthreat08.js';      /* 熊威嚇（四足版）的塵土與鼻息粒子 */
import * as H8 from './hooks08.js'; import './elite08.js';      /* 0.8 X4：菁英招式（elite08 匯入 beastai07／08a／08b，新招接在舊招後面） */      // 0.8 接點（d8-play；規格 team/d8-play/介面08.md）
import './duel08.js';      // 0.8 競技場玩家對決（d8-play P6；只靠 hooks08，最上層不碰遊戲狀態）
import * as B7 from './board07.js';      // 0.7 委託板（w7-story）
import './trial08.js'; import * as Q8 from './quest08.js';      /* 0.8 X10：任務接線（quest08 只靠 hooks08 與 init 之後的循環匯入） */      // 0.8 競技場試煉（d8-play P3；trial08 從這裡拿 X8，循環匯入只在 init 之後用）
import * as M7 from './maps07.js'; import * as S7 from './save07.js';      // 0.7（w7-map）：地圖、手繪地圖與送圖、存檔代碼
import * as Gather from './gather.js';
import { makeBuf, pushSnap, sampleAt, makeLag, lagNote, lagStep } from './interp08.js';      /* F5：快照插值（遠端玩家、野獸主控同步） */
import * as Fish from './fish07.js';      // 0.7 釣魚（fish07.js）：拿出釣竿、拋竿、拉鋸、分解、米洛收魚、哈根做釣竿、新增益
const BK20 = (() => { const m = typeof location !== 'undefined' && /[?&]bk=([\d.]+)/.exec(location.search); return m ? +m[1] : 0.45; })();      /* 11-26 使用者決定：太近退開時放慢到 45%（?bk=1 可還原原速對照） */
export { Ars, Craft, Needs, Gather, Fish };      // 0.6 的四個玩法模組：game.js 只留掛鉤（init6、匯總 recalc6、存讀檔 save6／load6、每幀 tick、擊殺、互動）
import { Avatar, WEAPONS, parseLook, lookStr, isNewLook, makeCreature, animCreature, fx, spawnSlash, emit, emitGather, makeTelegraph, showTelegraph, fxRing, fxDisc, fxPillar, fxDome, fxAura, fxLane, fxBolt, fxFree, makeTag, placeTag, tagSay, popNumber, clipDur, fxLock, fxAim, fxBegin, fxEnd, fxCue, fxCharge, hitCreature } from './actors.js';

export const ui = { toast() {}, log() {}, chat() {}, banner() {}, loot() {}, levelUp() {}, dead() {}, hurt() {}, prompt() {}, sfx() {}, shop() {}, skills() {}, tip() {}, talk() {}, narrate() {}, move() {}, craft() {}, forge() {}, cloak() {}, arsenal() {}, notice() {}, invite() {}, dirty: true };
BITE.sfx = (strong, v, big, who) => ui.sfx('bite8', strong ? 'hit' : 'miss', { x: v ? v.x : undefined, z: v ? v.z : undefined, tag: big ? 'big' : null });      /* 咬合音（audio-index.json 的 bite8 事件：miss 較輕、hit 加咬肉聲；沒有實錄就退回 ui.js 的合成音） */
BITE.target = () => { const y = me.y != null ? me.y : Hgt(me.x, me.z); return { x: me.x, y, z: me.z, cy: y + 1.2 * (me.avatar && me.avatar.look && me.avatar.look.h ? me.avatar.look.h / 100 : 1) }; };      /* 被咬的本機玩家：腳底與胸高（血點從這裡冒） */
export const input = { keys: new Set(), aim: { x: 0, z: 0, sx: 0, sy: 0 }, typing: false, started: false, zoom: 0.8, creator: false, talk: null, atkHeld: false, heavyHeld: false, sprint: false, guard: false, useHeld: false, cam: { mode: 'top', yaw: Math.PI, pitch: 0.3, dist: 6.4, locked: false, noLock: false } };
// 移動與瞄準的基準方向：背後視角跟著鏡頭，俯視視角固定朝北
export const basisYaw = () => input.cam.mode === 'top' ? Math.PI : input.cam.yaw;
const moveVec = () => { const k = input.keys, f = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0), r = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0), y = basisYaw(); let x = Math.sin(y) * f - Math.cos(y) * r, z = Math.cos(y) * f + Math.sin(y) * r; const l = Math.hypot(x, z); if (l) { x /= l; z /= l; } return [x, z, f, r]; };
// 攻擊方向：鎖定中一律朝鎖定的目標。沒鎖定時，俯視朝滑鼠指的地面；背後視角朝鏡頭前方，前方不遠有怪時自動對準最順手的一隻（cone 是容許的夾角，遠程武器比較窄）
function aimPick(reach, cone = 0.9) {
  const y = input.cam.mode === 'top' ? Math.atan2(input.aim.x - me.x, input.aim.z - me.z) : input.cam.yaw - Math.atan2(input.cam.side || 0, 18); let best = null, bs = 0.95;      // 鏡頭偏到右肩時，準心對著的是前方 18 公尺處，所以稍微往右修正
  for (const v of MV()) { if (v.st === MST.DEAD || !v.model) continue; const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz); if (d > reach + MON[v.type].body * v.size) continue; const a = Math.abs(angDiff(y, Math.atan2(dx, dz))), sc = a + d * 0.06 * 5.5 / reach; if (a < cone && sc < bs) { bs = sc; best = v; } }
  return [y, best];
}
const lockOk = v => !!v && (v.lock8 ? !!H8.fn.lockAlive(v) : v.st !== MST.DEAD && !!v.model && v.model.root.visible !== false);      // 0.8：v.lock8＝對決對手（duel08）
export const lockTarget = () => lockOk(me.lock) ? me.lock : null;
// 正在用弓瞄準（蓄力、出箭、弓的技能，或剛射完不久）：鏡頭會移到右肩後方
let aimT = 0;
export const aiming = () => aimT > 0;
export function aimAngle(reach = 5.5, tight) {
  if (lockOk(me.lock)) return Math.atan2(me.lock.x - me.x, me.lock.z - me.z);
  if (input.cam.mode === 'top') return Math.atan2(input.aim.x - me.x, input.aim.z - me.z);
  const [y, v] = aimPick(reach, tight ? 0.32 : 0.9); return v ? Math.atan2(v.x - me.x, v.z - me.z) : y;
}
export const P = { name: '旅人', serial: null, look: '', lv: 1, exp: 0, stats: baseStats(), pts: 0, gold: 0, inv: { potion: 3 }, kills: 0, deaths: 0, explored: new Uint8Array(WORLD.FOG * WORLD.FOG), bag: null, q: { a: {}, d: [], u: [], tr: [], intro: 0 }, lastDeath: 0, skills: [], slots: [null, null, null, null], gift: null, giftQ: [], kc: {}, wps: {}, td: 0, cloak: '', rec: {}, food: null, tonic: null, sat: 100, en: 100, pas: {}, pk: 0 };      // pk：通緝（惡名）還剩幾秒在線時間｜kc：各種野獸（與各隻菁英）擊敗過幾隻，擊殺經驗的熟悉度用
export let D = derive(P.stats, P.lv);
export const me = { x: WORLD.SPAWN[0], z: WORLD.SPAWN[1], f: Math.PI, vx: 0, vz: 0, kx: 0, kz: 0, hp: 100, st: 100, mp: 50, alive: true, deadT: 0, atk: null, combo: 0, comboT: 0, queued: false, dodge: null, dodgeCd: 0, dodgeI: 0, dashWin: 0, dashKind: '', lightN: 0, lock: null, sprinting: false, sprintT: 0, guard: false, guardT: 0, stun: 0, charge: null, holdT: 0, cast: null, rush: null, counter: 0, buff: { wall: 0, warcry: 0 }, cds: {}, evs: [], evN: 0, stDelay: 0, iframe: 0, flash: 0, as: 0, ac: 0, lastCombat: -99, inSafe: true, zone: 'town', speed01: 0, sayN: 0, regenLeft: 0, regenRate: 0, regenMeat: false, itemCd: 0, potCd: 0, potCdMax: 1, drink: null, combat: false, sit: null, gather: null, craft: null, trial: null, manaCd: 0, manaLeft: 0, manaRate: 0, lookStr: '', avatar: null, tag: null, exploredDirty: true, team: '', ad: null, killer: null, stats: { perfect: 0, parry: 0, blocked: 0, broken: 0, hits: 0 } };
export const mons = [], remotes = new Map(), npcs = [];
const packWait = {};      // 狼群：一隻出手完到下一隻可以出手之間的空檔（依群）
const sim = [], packs = new Map(), ledger = new Map(), myDmg = {}, projs = []; let dmgFlushAt = 0, dmgDirty = false, evDirty = false, clock = 0, rclock = 0, rdt = 0.016;      // rclock／rdt：真實時間（命中停頓時 clock 會變慢，受擊顫動要照真實時間抖）
/* ---------- 打擊感（只影響自己的畫面；主控端的野獸模擬一律照真實時間走，所以多人時不會因為某人打中東西而讓大家的野獸停頓） ---------- */
// 分級：stop 命中停頓秒數（自己的畫面變慢）｜rc 野獸往受力方向退縮的力道｜fl 閃光｜tone 閃光顏色（1 鋼藍＝霸體、2 金＝暴擊與反擊）｜sh 鏡頭晃動｜kick 鏡頭衝擊｜shk 停頓中受擊者顫動的幅度（公尺）
const FEEL = {
  armor: { stop: 0.035, rc: 0.5, fl: 0.5, tone: 1, sh: 0.12, kick: 0.05, shk: 0.03 },      // 野獸出招中（霸體）：打得到、打不動
  light: { stop: 0.05, rc: 0.45, fl: 0.62, sh: 0.16, kick: 0.1, shk: 0.045 },
  heavy: { stop: 0.1, rc: 0.85, fl: 0.85, sh: 0.38, kick: 0.24, shk: 0.08 },
  crush: { stop: 0.14, rc: 1.1, fl: 1, tone: 2, sh: 0.5, kick: 0.34, shk: 0.11 },            // 暴擊、反擊、蓄滿的重擊
  brk: { stop: 0.16, rc: 1.25, fl: 1, tone: 2, sh: 0.55, kick: 0.4, shk: 0.12 },              // 打斷野獸的預備動作
  parry: { stop: 0.13, rc: 1.5, fl: 0.75, tone: 2, sh: 0.32, kick: 0.2, shk: 0.1 },          // 精準格擋：出手的野獸被彈開
  block: { stop: 0.05, rc: 0.4, fl: 0, sh: 0.25, kick: 0.14, shk: 0.03 }                     // 一般格擋：野獸的攻擊被擋回去一點
};
// 反擊（0.6 過招）：精準格擋、完美閃避之後 win 秒內按輕攻擊，使出這把武器的反擊招——衝向目標、必定暴擊、能打斷沒有霸體的預備動作。原本「3 秒內下一擊必定暴擊」照舊
const COUNTER = { win: 1.2 };
// 0.6 過招第二段（主控端的野獸模擬；只改收招與走位，不改傷害）
// 撲空踉蹌：有位移的招式（直線衝撞／撲咬 dash ≥ 3、飛撲）出招途中沒碰到任何玩家（正在閃避的不算碰到）→ 收招多 rec 秒，順勢往前滑約 skid 公尺。
//   同步：出招編碼多一個位元 512（actTimes 依它把收招加長、v.act.whiff＝1），非主控端看到的收招長度與動作一樣。連段中間的招不算（連段本來就一氣呵成）
const WHIFF = { rec: 0.3, skid: 0.75, pad: 0.35, bit: 512 };
// 被打退調整距離：狼群（另有輪流規則）與膽小的以外，被精準格擋或重擊踉蹌（≥ stag 秒，或一下打掉兩成以上）後，先面向目標退 back 秒，再繞著目標走（最多 arc 弧度、circ 秒）才上。
//   不讓遠程白賺：觸發時出手的人要在牠身邊 near 公尺內（遠處射來的重擊不觸發）；同一隻 cd 秒內一次；繞圈途中被任何人打到、或目標拉開到繞圈半徑＋far 以外，立刻取消直接撲上（照舊有「對遠處目標追擊加速」與「脫戰 5 秒回滿」）
const BACK = { stag: 0.4, near: 4.5, back: 0.7, backV: 0.62, arc: 2.6, circ: 2.2, circV: 1.0, far: 3.5, cd: 8 };
const lunging = M => !!M && ((M.shape === 'line' && M.dash >= 3) || M.shape === 'leap');
const CMOVE = {}; for (const k in MOVESET) { const M = MOVESET[k], r = k === 'staff' || k === 'bow', B = r ? M.dodge : M.back; CMOVE[k] = Object.assign({}, B, { name: '反擊', stag: Math.max(B.stag || 0, 7), cost: Math.round((Array.isArray(B.cost) ? B.cost[0] : B.cost) * 0.5), cmove: 1 }, r ? {} : { lunge: Math.max(B.lunge || 0, 4.5), heavy: 1 }); }
// 鏡頭衝擊：只留最大的那一下，同一下打中好幾隻不會疊成很大
// 爬坡程度的暫代估法（w6-scene 的 tryMove 寫 o.climb 之後自己的角色改用那個；其他玩家仍用這個）：al＝沿著前進方向的坡度（高度差／水平距離）
const climbOf = al => clamp((al - 0.15) / 0.6, 0, 1), descOf = al => clamp((-al - 0.16) / 0.5, 0, 1);
// 爬坡、下坡時腳下的塵土（上坡往後踢出碎土、下坡腳跟前面擦出一團）：照步伐的節奏，自己與其他玩家都有，只是畫面
const _bwv = new THREE.Vector3(); const bearWp = (b, out, x = 0, y = 0, z = 0) => { _bwv.set(x, y, z); b.localToWorld(_bwv); out.x = _bwv.x; out.y = _bwv.y; out.z = _bwv.z; };      /* 骨頭局部座標 → 世界座標（bearFx08 用）*/
function slopeDust(o, dt) { const c = o.climbK || 0, d = o.descK || 0, k = Math.max(c, d) * clamp((o.speed01 || 0) * 1.6 - 0.3, 0, 1); if (k < 0.3) { o.dustT = 0; return; } o.dustT = (o.dustT || 0) + dt * (d > c ? 6.5 : 4.2) * (0.6 + 0.4 * k); if (o.dustT >= 1) { o.dustT -= 1; o.dustS = -(o.dustS || 1); fxCue('slope', o, d > c ? -k : k, o.dustS); } }
function kickCam(ux, uz, k) { const v = k * 20; if (v > Math.hypot(fx.kx || 0, fx.kz || 0)) { fx.kx = ux * v; fx.kz = uz * v; fx.ky = -k * 5; } }
// 一次命中的畫面：(dx, dz) 是受力方向（從出手的人指向挨打的野獸）；ks 是鏡頭衝擊的方向（-1：自己被推回來）
function feelHit(v, G, dx, dz, armored, ks = 1, stopK = 1) {
  const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
  fx.hitstop = Math.max(fx.hitstop, G.stop * stopK); fx.shake = Math.max(fx.shake, G.sh); kickCam(ux * ks, uz * ks, G.kick); if (G === FEEL.crush || G === FEEL.brk) fx.punch = Math.max(fx.punch, 2.2);
  if (!v) return; const mass = (v.elite ? 1.5 : 1) * clamp(MON[v.type].size / 1.2, 0.85, 1.4);      // 大隻的、菁英：同一下縮得少，看起來比較重
  if (v.model) hitCreature(v.model, ux, uz, G.rc * (armored ? 0.4 : 1) / mass, { armor: armored });
  if (G.fl) { v.flash = Math.max(v.flash || 0, G.fl); v.ftone = armored && G.tone !== 2 ? 1 : G.tone || 0; } v.shk = Math.max(v.shk || 0, G.stop * stopK + 0.04); v.shkA = G.shk * (armored ? 0.6 : 1); v.shx = ux; v.shz = uz;
}
// 這一下算哪一級（先算好，特效 hitFx 與畫面反應都照它）：打斷＞暴擊／反擊／蓄滿＞重＞霸體中＞輕
function gradeOf(v, o) {
  const counter = me.counter > 0 && !o.spell; o.counter = counter; o.crit = counter || Math.random() < D.crit * (o.critMul || 1);
  const acting = v.st === MST.WIND || v.st === MST.STRIKE; o.brk = !!o.stop && v.st === MST.WIND && !(v.M && v.M.armor); o.armored = acting && !o.brk;
  return o.brk ? 'brk' : o.crit || o.full ? 'crush' : o.strong ? 'heavy' : o.armored ? 'armor' : 'light';
}
export const getClock = () => clock;
/* ---------- 0.6：數值加成的匯總點 ----------
   武器階級與獸飾、披肩（arsenal.js）、料理與藥劑（craft.js）、飽食與精力（needs.js）各自的 mods(m) 把加成加進 m；這裡整理成 M6，再套到 D（生命、體力、魔力上限等）與各個算式上。
   hp／st／mp 上限倍率｜mpRegen、stRegen 回復倍率｜dmg 造成的傷害（各來源相乘）｜heavy 重攻擊傷害｜act 攻擊與閃避耗的體力｜crit 暴擊率加值｜dr 減傷（合計最多 DR_CAP，drRaw 是沒截斷前的總和）｜guard 格擋耗的體力｜loot 掉寶與採集加量｜ooc 脫戰後每秒多回的生命比例｜steady 喝藥不被打斷｜enCost 精力消耗倍率 */
export const M6 = { hp: 1, st: 1, mp: 1, mpRegen: 1, stRegen: 1, dmg: 1, heavy: 1, act: 1, crit: 0, dr: 0, drRaw: 0, guard: 1, loot: 1, ooc: 0, steady: false, enCost: 1 };
let ready6 = false, curWp = 0;
function recalc6() {
  const m = { hp: 0, st: 0, mp: 0, mpRegen: 0, stRegen: 0, dmg: 1, heavy: 0, act: 0, crit: 0, dr: 0, guard: 0, loot: 0, ooc: 0, steady: 0, enCost: 1 };
  if (ready6) { Ars.mods(m); Craft.mods(m); Needs.mods(m); Fish.mods(m); }
  Object.assign(M6, { hp: Math.max(0.5, 1 + m.hp), st: 1 + m.st, mp: 1 + m.mp, mpRegen: 1 + m.mpRegen, stRegen: Math.max(0.2, 1 + m.stRegen), dmg: m.dmg, heavy: 1 + m.heavy, act: Math.max(0.5, 1 + m.act), crit: m.crit, dr: clamp(m.dr, 0, DR_CAP), drRaw: m.dr, guard: Math.max(0.5, 1 + m.guard), loot: 1 + m.loot, ooc: m.ooc, steady: !!m.steady, enCost: m.enCost }); Fish.cap(M6, m);      // 0.7：回復與移速、時機的上限，新增益 M6.move／M6.win／M6.dsSt
}
// 能力換算＋目前的加成（角色面板的預覽也用這個，才不會把料理的加成當成配點的變化）
export function deriveAll(stats, lv) { const d = derive(stats, lv); d.maxHp = Math.round(d.maxHp * M6.hp); d.maxSt = Math.round(d.maxSt * M6.st); d.maxMp = Math.round(d.maxMp * M6.mp); d.mpRegen *= M6.mpRegen; d.crit += M6.crit; return d; }
// 戰鬥中（飽食與精力只在這時候消耗；換武器、坐下、吃料理要脫離戰鬥）：在野外，而且有野獸把你當目標，或 6 秒內打中過野獸、被野獸打中過
export function inCombat() {
  if (!me.alive || me.inSafe) return false; if (clock - me.lastCombat < NEEDS.combatT) return true;
  if (Net.isHost) { for (const w of sim) if (w.target === 'self' && w.st !== MST.DEAD && w.st !== MST.IDLE && w.st !== MST.WARN) return true; return false; }
  for (const v of MV()) if (v.st >= MST.CHASE && v.st <= MST.RECOVER && Math.hypot(v.x - me.x, v.z - me.z) < 18) return true; return false;
}
export function refreshDerived() { const hpK = me.hp / D.maxHp, stK = me.st / D.maxSt, mpK = me.mp / D.maxMp; recalc6(); if (ready6 && me.avatar && me.avatar.setGear) me.avatar.setGear(Ars.gearOf(Ars.gearCode())); D = deriveAll(P.stats, P.lv); ITEMS.potion.buy = potionPrice(P.lv); me.hp = clamp(hpK * D.maxHp, me.alive ? 1 : 0, D.maxHp); me.st = clamp(stK * D.maxSt, 0, D.maxSt); me.mp = clamp(mpK * D.maxMp, 0, D.maxMp); ui.dirty = true; }

/* ============================== 建立 ============================== */
export function initGame() {
  for (const s of buildSpawns()) {
    const st = monStats(s.type, s.lv, s.elite), moves = (s.moves || MON[s.type].moves).map(id => MOVES[id]); if (s.elite) { const b = monStats(s.type, s.lv, false); st.hp = Math.round(b.hp * ELITE.hp); st.dmg = Math.round(b.dmg * ELITE.dmg); }      // 0.6：菁英的血量與傷害倍率在 data06.js（對同種同級的普通野獸）
    mons.push({ id: s.id, type: s.type, lv: s.lv, elite: s.elite, name: s.name || MON[s.type].name, drop: s.drop, orb: s.orb, hx: s.x, hz: s.z, x: s.x, z: s.z, f: (s.id * 2.4) % TAU, tx: s.x, tz: s.z, tf: 0, st: MST.IDLE, stT: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, dmg: st.dmg, exp: st.exp, size: st.size, speed: 0, flash: 0, model: null, tag: null, tele: null, others: 0, credited: -1, idleT: Math.random() * 5, mvc: 0, arg: 0, enr: 0, M: null, act: null, tg: null, judged: -1, ox: s.x, oz: s.z, of: 0 });
    const w = { id: s.id, type: s.type, elite: s.elite, pack: s.pack, moves, hx: s.x, hz: s.z, x: s.x, z: s.z, f: 0, st: MST.IDLE, t: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, target: null, seen: {}, wanderT: Math.random() * 4, wx: s.x, wz: s.z, cd: 0, kx: 0, kz: 0, stagDur: 0.2, mvc: 0, arg: 0, enr: 0, M: null, wd: 0, sd: 0, rd: 0, chain: null, mcd: {}, last: '', provoked: false, fleeFrom: null, immune: 0, hits: 0, retreat: 0, sprung: false, near: 1e9 };
    sim.push(w); BB.attach(w, mons[mons.length - 1], s); /* X3b：小猩猩、拴住的狗 */ if (s.pack != null) { if (!packs.has(s.pack)) packs.set(s.pack, []); packs.get(s.pack).push(w); }
  }
  for (const v of mons) { v.lx = v.hx; v.lz = v.hz; }      // 老巢（0.5a 的位置）
  if (!P.look) P.look = lookStr(parseLook('')); me.avatar = new Avatar(P.look, { hero: HERO_ON }); me.tag = makeTag('me'); curWp = parseLook(P.look).wp;
  init6(); setEliteSpots(null);
  for (const n of npcSpots) { const nl = parseLook(n.look); Object.assign(nl.face, n.ft || {}); Object.assign(nl.face.s, n.fs || {}); const a = new Avatar(nl), tag = makeTag('npc'), mk = document.createElement('span'); mk.className = 'tag-mark'; tag.el.prepend(mk); tag.name.textContent = n.name; a.group.position.set(n.x, Hgt(n.x, n.z), n.z); a.group.rotation.y = n.f; npcs.push(Object.assign({ avatar: a, tag, mk, mark: '', short: (NPCS[n.id] || {}).name || n.name }, n)); }
}
/* ---------- 0.6：模組初始化與對外的接點 ---------- */
function init6() {
  const ctx = {
    P, me, input, ui, ITEMS, Net, remotes, mons, W, Hgt, blockedAt, slopeAt, waterDepth, keyOf, D: () => D, M: () => M6, clock: () => clock,
    addItem, take, room, save: () => { Store.dirty = true; }, refresh: refreshDerived, busy: busy6, lookWp: () => curWp, setWp, applyLook,
    quest: questAct, questExists: id => !!QBY[id], questDone: id => qDone(id), questName: id => (QBY[id] || {}).name || id, npcName: id => (NPCS[id] || {}).name || '',
    need: (k, n) => Needs.add(k, n), nearCamp: r => Needs.nearCamp(r), feast: (c, id) => sendEv(['c', Needs.campIndex(c), id === 'food_fishfeast' ? 1 : 0]),
    pop: (t, cls) => popNumber(me.x, meY() + 2.9, me.z, t, cls), fx: fx6, moving: () => !input.typing && !input.talk && ['up', 'down', 'left', 'right'].some(k => input.keys.has(k))
  };
  Ars.init(ctx, WEAPONS, [WORLD.ARENA_IN, WORLD.ARENA_OUT]); Craft.init(ctx); B7.init(ctx); Needs.init(ctx); Gather.init(ctx); Fish.init(ctx, { aimAngle, gainExp, Gather, Ars });
  Ars.reset(); Craft.reset(); Needs.reset(); Fish.reset(); ready6 = true;
  Needs.setCamps(TEST_CAMPS); Gather.setSites(TEST_SITES); Gather.setCamps(TEST_CAMPS);
}
// 場景的 places06.js 到位後（main.js 動態載入）：換掉測試用的採集點、營火、菁英出沒點
export function setPlaces06(pl) { if (!pl) return; if (pl.CAMPS) { Needs.setCamps(pl.CAMPS); Gather.setCamps(pl.CAMPS); } if (pl.GATHER_SITES) Gather.setSites(pl.GATHER_SITES); if (pl.ELITE_SPOTS) setEliteSpots(pl.ELITE_SPOTS); }
// 美術的 props06.js 到位後：採集物與營火改用正式模型
export function setProps06(pr) { if (!pr) return; Gather.setFactories(pr); Gather.setCamps(Needs.campList()); }
function fx6(kind, a) { const y = meY(); if (kind === 'eat') { emit(me.x, y + 1, me.z, 14, [0.9, 2.0, 0.7], 2, 3, 0.7, -1); fxCue('potion', me); } else if (kind === 'gather') emit(a.x, Hgt(a.x, a.z) + 0.4, a.z, 8, [0.8, 1.6, 0.6], 2.5, 2.5, 0.5, 4); }
// 一段要站穩做完的動作（進食、喝藥、換武器）：沿用喝治療藥水的規則——走得慢、不能出手，被打中或閃避會中斷；做完才呼叫 done
function busy6(id, dur, label, done) { me.atk = null; me.queued = false; me.charge = null; me.guard = false; me.dashWin = 0; me.drink = { id, t: 0, dur, label, done }; }
const take = (id, n = 1) => { P.inv[id] = (P.inv[id] || 0) - n; if (P.inv[id] <= 0) delete P.inv[id]; Store.dirty = true; ui.dirty = true; };
// 這個道具還帶得下幾個（採集物每種 99、工具與披肩 1）
export const room = id => Math.max(0, ((ITEMS[id] && ITEMS[id].max) || 9999) - (P.inv[id] || 0));
// 身邊可以坐的營火（站在 NPC 交談範圍內時讓給 NPC：獵人營地的營火就在哈根旁邊，繞到另一側才是坐下）
function campFirst() { const c = Needs.nearCamp(); if (!c) return null; for (const n of npcs) if (Math.hypot(n.x - me.x, n.z - me.z) < 3.4) return null; return c; }
/* ---------- 0.6：菁英的輪流出沒 ----------
   elites：{ i 怪物編號, key 戰利品代號, spots 三處（第一處是老巢）, spot 現在在第幾處, mates 跟著牠的護衛 [編號, 相對位置] }。由主控端決定、寫在 es 欄位同步給所有人 */
const elites = [];
export function setEliteSpots(map) {
  const old = elites.map(e => e.spot); elites.length = 0;
  sim.forEach((w, i) => { if (!w.elite) return; const v = mons[i], src = map && (map[v.drop] || map[v.type] || (Array.isArray(map) ? map[elites.length] : null)), list = (src || ELITE.spots[v.drop] || []).map(p => (Array.isArray(p) ? p : [p.x, p.z]));
    if (list.length && Math.hypot(list[0][0] - v.lx, list[0][1] - v.lz) < 15) list.shift();      // 第一處是老巢：一律用 0.5a 的實際位置（任務指引不用改）；清單裡沒列老巢也可以
    elites.push({ i, key: v.drop, spots: [[v.lx, v.lz], ...list], spot: 0, mates: sim.map((o, j) => (o !== w && w.pack != null && o.pack === w.pack ? [j, mons[j].lx - v.lx, mons[j].lz - v.lz] : null)).filter(Boolean) }); });
  elites.forEach((e, j) => { if (old[j]) placeElite(e, old[j], true); });
}
function placeElite(e, k, snap) { const s = e.spots[k]; if (!s) return; e.spot = k; for (const [i, dx, dz] of [[e.i, 0, 0], ...e.mates]) { const w = sim[i], v = mons[i]; w.hx = v.hx = s[0] + dx; w.hz = v.hz = s[1] + dz; if (snap && !v.awake) { v.x = v.tx = v.hx; v.z = v.tz = v.hz; } } }
// 重生時換一處（不會連續同一處）。在場還有人沒擊敗過牠：回老巢（每位玩家第一次遇到一定在老巢）
function eliteNext(e) { const bit = 1 << elites.indexOf(e); if (e.spots.length < 2 || !(P.kc[e.key] > 0) || [...remotes.values()].some(r => !((r.ek | 0) & bit))) return 0; let k = Math.floor(Math.random() * (e.spots.length - 1)); if (k >= e.spot) k++; return k; }
function eliteRespawn(w) {
  const e = elites.find(o => o.i === w.id); if (!e) return; placeElite(e, eliteNext(e));
  for (const [j] of e.mates) { const m = sim[j]; if (m.st !== MST.DEAD) { m.spawn++; m.st = MST.IDLE; m.t = 0; m.target = null; m.seen = {}; m.kx = m.kz = 0; m.calm = 0; m.enr = 0; m.mvc = 0; m.M = null; m.chain = null; m.mcd = {}; m.provoked = false; } m.x = m.wx = m.hx; m.z = m.wz = m.hz; }      // 護衛跟著搬家
}
const ekMask = () => elites.reduce((m, e, j) => m | (P.kc[e.key] > 0 ? 1 << j : 0), 0);      // 我擊敗過哪幾隻菁英（位元）
// 菁英這一場的傷害加成：由血量上限推回開戰時的人數（主控端只同步血量上限，所有人算出來一致）
const eliteK = v => (v.elite ? 1 + ELITE.perDmg * (clamp(Math.round((v.hpMax / v.baseHp - 1) / ELITE.perHp) + 1, 1, ELITE.maxN) - 1) : 1);
export function revealTown() { const N = WORLD.FOG, S = WORLD.FOG_SIZE; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const wx = (x + 0.5) / N * S - S / 2, wz = (z + 0.5) / N * S - S / 2; if (Math.hypot(wx, wz) < WORLD.TOWN_R + 10) P.explored[z * N + x] = 1; } me.exploredDirty = true; }
export const mkey = m => 'm' + m.id + '_' + (m.spawn % 36);      // 0.5d：和主控端送出的 ms（spawn % 36）同一個基準，主控換手後各家的鍵才對得上
// 0.5d：每人的累計傷害只增不減；對方的累計值變小（重整頁面、主控換手後從 0 重新累計）時接著往上加，不會被當成舊值丟掉
const ledgerSet = (k, who, d) => { let m = ledger.get(k); if (!m) { m = new Map(); m.raw = new Map(); ledger.set(k, m); } const last = m.raw.get(who), e = m.get(who) || 0; m.raw.set(who, d); if (last == null) { if (!(e >= d)) m.set(who, d); } else if (d > last) m.set(who, e + d - last); else if (d < last) m.set(who, e + d); };
const ledgerSum = k => { const m = ledger.get(k); if (!m) return 0; let s = 0; for (const d of m.values()) s += d; return s; };
const ledgerMine = k => { const m = ledger.get(k); return (m && m.get('self')) || 0; };

/* ============================== 玩家對打、通緝、組隊（0.6，使用者的決定） ==============================
   城外（不在鐵環城安全區）打到別的玩家一律扣血，傷害＝打同等級野獸的 PVP.k 倍（再經過對方自己的防禦與減傷）；城裡互相打不到；同隊的攻擊（含技能）不傷隊友；暫離的人不能打也不被打。
   判定照野獸的做法「每個人只判定自己有沒有被打中」：攻擊者把這一招的攻擊力放進 presence（ad＝[攻擊力, 暴擊%]；技能的攻擊力附在 s 事件最後兩格），
   被打的人用攻擊者廣播的出招（as／ac、位置、面向）與飛行物在自己這邊判定、自己扣血、自己播受擊（閃避無敵、格擋、精準格擋照常），結果回報在 hr 給攻擊者看數字。
   攻擊者自己的畫面：打到的當下先有命中火花與一點位移（預測），數字等對方回報。被玩家打倒：照一般死亡處理；kd 告訴大家「誰在哪裡被誰打倒」，各自顯示公告，殺人的人自己記上通緝。
   組隊：pt＝隊伍代號（隊長 peer＋序號），同代號的就是隊友；邀請 iv、回覆 ia 是一次性的事件（帶序號）。隊伍只在這次連線有效（不存檔）。 */
const PVP = { k: 0.5, kbK: 0.45, body: 0.45, outlaw: 1800, outlawMax: 10800, inviteT: 30, party: 5, hbT: 3, kdT: 20, reach: 3.2, soft: { r: 0.95, k: 7, max: 4.2 } };
const RES_CODE = { hit: 1, blocked: 2, broken: 3, parried: 4, dodged: 5, immune: 6 };
const safeAt = (x, z) => Math.hypot(x, z) < WORLD.TOWN_R;
export const teamOf = o => (o === me ? me.team : o && o.pt) || '';
export const allyOf = o => !!me.team && o !== me && teamOf(o) === me.team;
// a 打得到 b 嗎（a、b 是 me 或其他玩家）：都在城外、都活著、都不是暫離、不同隊
function pvpPair(a, b) {
  if (!a || !b || a === b || (a !== me && (a.away || !a.alive)) || (b !== me && (b.away || !b.alive)) || (b === me && (!me.alive || document.hidden))) return false;      // 自己切走視窗（別人看到暫離）時不判定
  const d8 = H8.fn.pvpOk(a, b); if (d8 !== undefined) return !!d8;      // 0.8：沙地上對決中的兩人（duel08）
  if ((a === me ? me.inSafe : safeAt(a.x, a.z)) || (b === me ? me.inSafe : safeAt(b.x, b.z))) return false; const t = teamOf(a); return !(t && t === teamOf(b));
}
// 範圍（玩家的身體算成半徑 PVP.body 的圓）：c 前方扇形（range、arc）｜l 直線（len、w）｜o 圓（r）——和打野獸的 inCone／inLane 同一套
function inArea(s, x, z) {
  const dx = x - s.x, dz = z - s.z, b = PVP.body; if (s.k === 'o') return Math.hypot(dx, dz) < s.r + b;
  if (s.k === 'l') { const sf = Math.sin(s.f), cf = Math.cos(s.f), al = dx * sf + dz * cf; return al > -b && al < s.len + b && Math.abs(dx * cf - dz * sf) < s.w / 2 + b; }
  const d = Math.hypot(dx, dz); return d <= s.range + b && (d <= 1.0 + b || s.arc >= 3 || Math.abs(angDiff(s.f, Math.atan2(dx, dz))) <= s.arc);
}
// 攻擊力＝打同等級野獸、還沒算暴擊的傷害（含戰吼、武器階級與料理 M6.dmg）；反擊那一下必定暴擊（暴擊% 寫 100）
const pvpPow = (base, spell) => { const ctr = me.counter > 0 && !spell; return [r1(base * (me.buff.warcry > 0 ? SKILLS.warcry.mul : 1) * M6.dmg * (ctr ? PERFECT.mul : 1)), ctr ? 100 : Math.round(D.crit * 100)]; };
const powOk = v => (Array.isArray(v) && v.length >= 2 && v[0] > 0 ? [clamp(num(v[0], 0), 0, 9999), clamp(num(v[1], 0), 0, 100)] : null);
const SPELLS = new Set(['fire', 'missile', 'nova']);
function skillPow(id) { const S = SKILLS[id]; if (!S || !S.dmg) return []; const k = id === 'quake' ? 1 + (P.stats.end - 5) * 0.03 : id === 'blade' || id === 'triple' || id === 'backshot' ? D.throwMul : SPELLS.has(id) ? D.spellMul : D.dmgMul; return pvpPow(S.dmg * k, SPELLS.has(id)); }      // 同 fireSkill 打野獸的算法
// 被其他玩家打中（自己這邊判定）：pw＝[攻擊力, 暴擊%]，mul 這一下的倍率，(fx0, fz0) 力量從哪裡來；o.heavy 擋不住（蓄滿的重擊、後躍射擊），o.critMul 這一招的暴擊倍率
let hbN = 0, hbT = 0, kdN = 0, kdT = 0;
function pvpHurtMe(r, pw, mul, fx0, fz0, o = {}) {
  if (!pw || !(pw[0] > 0) || !pvpPair(r, me)) return null;
  const crit = Math.random() * 100 < pw[1] * (o.critMul || 1), raw = pw[0] * mul * lvDeal(P.lv - r.lv) * (crit ? 1.6 : 1) * PVP.k;
  me.killer = { peer: r.peer, name: r.name }; const res = hurtMe(raw, fx0, fz0, { pvp: r, heavy: !!o.heavy, floor: H8.fn.pvpFloor(r) || 0 }); me.killer = null;      // 0.8：floor＝對決中最低留幾點生命
  H8.emit('pvp:hurtMe', { r, res, hp: me.hp });
  if (res !== 'none') { hbN++; hbT = PVP.hbT; netSet('hr', [hbN, r.peer, res === 'dodged' || res === 'immune' || res === 'parried' ? 0 : me.lastDmg || 0, RES_CODE[res] || 1], true); }      // 回報給攻擊者（他的畫面跳數字）
  return res;
}
// 其他玩家的近戰（含杖的震波、雙手的劍氣）命中那一刻：看自己站的位置
function pvpMelee(r, a, i) {
  if (!a.pw || !pvpPair(r, me)) return;
  const A = a.A, f = r.tf; let mul = a.hits[i][1] * (A.twice ? 2 : 1), x0 = r.x, z0 = r.z;
  if (!inArea(A.nova ? { k: 'o', x: r.x, z: r.z, r: A.nova } : { k: 'c', x: r.x, z: r.z, f, range: A.range, arc: A.arc }, me.x, me.z)) {
    if (!(A.wave && (!A.waveAt || (a.k || 0) >= A.waveAt))) return; const px = r.x + Math.sin(f) * 2.2, pz = r.z + Math.cos(f) * 2.2; if (!inArea({ k: 'o', x: px, z: pz, r: A.wave }, me.x, me.z)) return; mul = a.hits[i][1] * 0.6; x0 = px; z0 = pz; }
  if (A.behind && Math.abs(angDiff(me.f, Math.atan2(me.x - r.x, me.z - r.z))) < 1.0) mul *= A.behind;
  pvpHurtMe(r, a.pw, mul, x0, z0, { heavy: a.code === 8 && (a.k || 0) >= 0.95, critMul: A.crit });
}
// 其他玩家的範圍技能（s 事件到的那一刻；連斬照間隔一下一下判）。飛行物類（飛刃、火球、飛彈、箭）在飛行物上判
function pvpSkill(r, id, x, z, f, arg, pw) {
  const S = SKILLS[id]; if (!S || !pw) return; const one = (s, mul) => { if (inArea(s, me.x, me.z)) pvpHurtMe(r, pw, mul, s.x, s.z); };
  if (id === 'cleave' || id === 'pierce') one({ k: 'l', x, z, f, len: S.len, w: S.w }, 1);
  else if (id === 'dash') one({ k: 'l', x, z, f, len: clamp(num(arg, S.len), 0, S.len * 1.5), w: S.w }, 1);
  else if (id === 'quake' || id === 'nova') one({ k: 'o', x, z, r: S.r }, 1);
  else if (id === 'kick') one({ k: 'c', x, z, f, range: S.range, arc: S.arc }, 1);
  else if (id === 'flurry') for (let i = 0; i < S.n; i++) later(i * S.gap, () => one({ k: 'c', x: r.x, z: r.z, f: r.tf, range: S.range, arc: S.arc }, i === S.n - 1 ? 1.6 : 1));
}
// 自己打到別的玩家：當下的命中火花、被打的人往後一小步（只是畫面；真正的傷害由對方判定後回報）
function pvpSpark(r, dx, dz, strong) {
  const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, y = Hgt(r.x, r.z);
  fxBegin('hit', { x: r.x, z: r.z, size: 1.9 }, 0, { grade: strong ? 'heavy' : 'light', strong }); try { emit(r.x, y + 1.3, r.z, strong ? 18 : 10, [3.4, 2.4, 1.0], strong ? 7 : 5, 3, 0.35, 14); } finally { fxEnd(); }
  r.flash = Math.max(r.flash || 0, 0.75); r.x += ux * (strong ? 0.35 : 0.2); r.z += uz * (strong ? 0.35 : 0.2);
  fx.hitstop = Math.max(fx.hitstop, strong ? 0.06 : 0.035); fx.shake = Math.max(fx.shake, strong ? 0.22 : 0.12); me.lastCombat = clock;
}
function pvpSparks(s, strong, got) { let n = 0; for (const r of remotes.values()) { if ((got && got.has(r.peer)) || !pvpPair(me, r) || !inArea(s, r.x, r.z)) continue; if (got) got.add(r.peer); pvpSpark(r, r.x - s.x, r.z - s.z, strong); n++; } if (n) ui.sfx('hit', strong, { x: me.x, z: me.z, tag: 'pvp' }); return n; }
// 自己被玩家打倒：告訴大家（kd：序號、兇手、地區、兇手名字、我是不是通緝犯），自己也顯示公告
function killNotice(killer, victim, zone, ol) { const zn = (ZONES[zone] || ZONES.meadow).name; if (ol) ui.notice(`${killer} 討伐了通緝犯 ${victim}`, 'hunt'); else ui.notice(`【通緝】${killer} 在 ${zn} 殺害了 ${victim}`, 'kill'); }
function pvpDied(k) { kdN++; kdT = PVP.kdT; const ol = P.pk > 0 ? 1 : 0; netSet('kd', [kdN, k.peer, me.zone, String(k.name).slice(0, 14), ol], true); killNotice(k.name, P.name, me.zone, ol); }
// 看到自己打倒了別人：一般玩家 → 自己變成通緝犯（30 分鐘在線時間，再犯延長）；通緝犯 → 討伐，不算殺人
function pvpKilled(name, ol) {
  if (ol) { ui.toast(`討伐了通緝犯 ${name}`); return; }
  const was = P.pk > 0; P.pk = Math.min(PVP.outlawMax, (P.pk || 0) + PVP.outlaw); Store.dirty = true; ui.dirty = true;
  ui.toast(was ? `又殺害了 ${name}：通緝延長到 ${Math.ceil(P.pk / 60)} 分鐘` : `你殺害了 ${name}，被全城通緝（名牌變紅 ${Math.ceil(P.pk / 60)} 分鐘）`);
}
/* ---------- 組隊 ---------- */
let teamSeq = 0, ivN = 0, iaN = 0, iaT = 0, ivOut = null, ivIn = null, teamWas = '', memWas = new Map();
export const party = () => { const m = []; if (me.team) for (const r of remotes.values()) if (r.pt === me.team) m.push(r); return m; };
export const inviteIn = () => ivIn;
export function invitePlayer(r) {
  if (typeof r === 'string') r = remotes.get(r); if (!r || !input.started) return false;
  if (!Net.selfPeer) { ui.toast('目前是單人模式，沒辦法組隊'); return false; }
  if (r.away) { ui.toast(`${r.name} 暫離中，沒辦法邀請`); return false; }
  if (allyOf(r)) { ui.toast(`${r.name} 已經是隊友了`); return false; }
  if (party().length + 1 >= PVP.party) { ui.toast(`隊伍已滿（最多 ${PVP.party} 人）`); return false; }
  if (ivOut && ivOut.peer === r.peer) { ui.toast(`已經邀請過 ${r.name}，等待回應中`); return false; }
  if (!me.team) me.team = Net.selfPeer + '.' + (++teamSeq).toString(36);
  ivN++; ivOut = { peer: r.peer, name: r.name, t: PVP.inviteT }; netSet('pt', me.team); netSet('iv', [ivN, r.peer, me.team], true);
  ui.toast(`已邀請 ${r.name} 加入隊伍，等待回應…`); ui.log(`邀請 ${r.name} 加入隊伍。`); ui.sfx('click'); return true;
}
function gotInvite(r, team) { if (team === me.team) return; ivIn = { peer: r.peer, name: r.name, lv: r.lv, team, t: PVP.inviteT }; ui.invite(ivIn); ui.sfx('invite'); ui.log(`${r.name} 邀請你加入隊伍。`); }
export function answerInvite(ok) {
  const v = ivIn; if (!v) return; ivIn = null; ui.invite(null); const r = remotes.get(v.peer);
  if (ok && !r) { ui.toast('對方已經離開了'); ok = false; }
  else if (ok) { let n = 0; for (const o of remotes.values()) if (o.pt === v.team) n++; if (n >= PVP.party) { ui.toast(`隊伍已滿（最多 ${PVP.party} 人）`); ok = false; } else { me.team = v.team; teamWas = me.team; memWas = new Map(party().map(o => [o.peer, o.name])); ui.log(`你加入了 ${v.name} 的隊伍。`); ui.sfx('confirm'); } }
  iaN++; iaT = PVP.hbT; netSet('ia', [iaN, v.peer, ok ? 1 : 0], true); if (ok) netSet('pt', me.team);
}
export function leaveTeam() { if (!me.team) return; const had = party().length > 0; me.team = ''; teamWas = ''; memWas = new Map(); ivOut = null; netSet('iv', null); netSet('pt', null); if (had) { ui.log('你離開了隊伍。'); ui.sfx('click'); } }
// 身邊（PVP.reach 內、大致在前方）可以邀請的玩家
function nearPlayer() { let best = null, bs = 1e9; for (const r of remotes.values()) { if (r.away || allyOf(r)) continue; const dx = r.x - me.x, dz = r.z - me.z, d = Math.hypot(dx, dz); if (d > PVP.reach) continue; const s = d + Math.abs(angDiff(me.f, Math.atan2(dx, dz))) * 0.6; if (s < bs) { bs = s; best = r; } } return best; }
// 每幀：邀請到期、成員變動的提示、超過人數上限時（兩人同時接受）代號大的自己退出、通緝倒數
function pvpTick(dt) {
  if (ivIn && (ivIn.t -= dt) <= 0) { ivIn = null; ui.invite(null); }
  if (ivOut && (ivOut.t -= dt) <= 0) { ui.toast(`${ivOut.name} 沒有回應組隊邀請`); ivOut = null; netSet('iv', null); }
  if (iaT > 0 && (iaT -= dt) <= 0) netSet('ia', null); if (hbT > 0 && (hbT -= dt) <= 0) netSet('hr', null); if (kdT > 0 && (kdT -= dt) <= 0) netSet('kd', null);
  if (me.team !== teamWas) { teamWas = me.team; memWas = new Map(party().map(o => [o.peer, o.name])); }
  else if (me.team) { const now = new Map(party().map(o => [o.peer, o.name])); for (const [p, n] of now) if (!memWas.has(p)) { ui.log(`${n} 加入了隊伍。`); if (ivOut && ivOut.peer === p) { ivOut = null; netSet('iv', null); } } for (const [p, n] of memWas) if (!now.has(p)) ui.log(`${n} 離開了隊伍。`); memWas = now;
    if (now.size + 1 > PVP.party && Net.selfPeer) { const lead = me.team.slice(0, me.team.lastIndexOf('.')), ids = [Net.selfPeer, ...now.keys()].sort((a, b) => (a === lead ? -1 : b === lead ? 1 : a < b ? -1 : 1)); if (ids.indexOf(Net.selfPeer) >= PVP.party) { leaveTeam(); ui.toast(`隊伍已滿（最多 ${PVP.party} 人），沒有加入`); } } }
  if (P.pk > 0 && input.started) { const m0 = Math.ceil(P.pk / 60); P.pk = Math.max(0, P.pk - dt); if (Math.ceil(P.pk / 60) !== m0) { Store.dirty = true; ui.dirty = true; if (P.pk <= 0) ui.log('通緝的時間到了，名牌恢復原本的顏色。'); } }
  const ol = P.pk > 0; if (ol !== !!me.olOn) { me.olOn = ol; me.tag.el.classList.toggle('outlaw', ol); }
}
// 名牌被點一下：陌生人 → 邀請組隊
function tagClick(r) { if (!input.started || input.creator || !me.alive) return; if (allyOf(r)) { ui.toast(`${r.name} 是你的隊友`); return; } invitePlayer(r); }

/* ============================== 玩家：動作 ============================== */
// 外觀（捏角色用）。0.6：武器是擁有的東西——有了武器架之後，外觀裡的武器固定是手上那把（要換去武器架）；還沒有任何武器（創角）時可以自由選第一把
export function setLook(l) { if (typeof l === 'string') l = parseLook(l); if (Ars.count()) l.wp = curWp; else curWp = l.wp; P.look = lookStr(l); applyLook(); fitSlots(); Store.dirty = true; ui.dirty = true; }
// 畫面上的樣子＝存檔的外觀＋手上的武器（或競技場試用的）＋穿著的披肩；其他玩家看到的也是這個（lk 欄位）
// 武器階級、獸飾、披肩的模型由美術的 Avatar.setGear({ tier, charm, pelt }) 負責；角色模型還沒有 setGear 時，披肩先借用現有的「毛皮披肩」款披風
export function applyLook() { const gear = !!me.avatar.setGear, l = Ars.lookMods(parseLook(P.look), !gear); me.lookStr = lookStr(l); me.avatar.setLook(l); if (gear) me.avatar.setGear(Ars.gearOf(Ars.gearCode())); }
function setWp(wp) { const l = parseLook(P.look); l.wp = curWp = wp; P.look = lookStr(l); applyLook(); fitSlots(); Store.dirty = true; ui.dirty = true; }
// 測試用：直接換成這個外觀，沒有的武器順便給一把（回歸腳本靠它換武器）
function devLook(l) { if (typeof l === 'string') l = parseLook(l); if (!Ars.has(l.wp)) P.wps[l.wp] = { t: 0, c: '', hm: 0, d1: 0 }; curWp = l.wp; me.trial = null; P.look = lookStr(l); applyLook(); fitSlots(); refreshDerived(); Store.dirty = true; ui.dirty = true; }
// 武器類型：弓、杖類（長杖、短杖＋魔導書）各自成一類，其餘依 actors.js 的 1h／2h／dual
export const setOf = av => { const w = av.look && WEAPONS[av.look.wp]; return !w ? '1h' : w.set === 'bow' ? 'bow' : w.src === 'mage' ? 'staff' : MOVESET[av.setName] ? av.setName : '1h'; };
const noShield = av => { const w = av.look && WEAPONS[av.look.wp]; return !(w && w.show.some(n => /Shield/.test(n))); };
const STAB = { '1h': '1H_Melee_Attack_Stab', '2h': '2H_Melee_Attack_Stab', dual: 'Dualwield_Melee_Attack_Stab', staff: '2H_Melee_Attack_Stab', bow: '1H_Melee_Attack_Stab' };
const CHOP = { '1h': '1H_Melee_Attack_Chop', '2h': '2H_Melee_Attack_Chop', dual: 'Dualwield_Melee_Attack_Chop', staff: 'Spellcast_Shoot', bow: '1H_Melee_Attack_Chop' };
const SLICE = { '1h': ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'], '2h': ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'], dual: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab'] };
const SKILL_CLIP = { cleave: s => CHOP[s], dash: s => STAB[s], wall: () => 'Block', blade: () => 'Throw', fire: () => 'Spellcast_Shoot', heal: () => 'Spellcast_Raise', warcry: () => 'Cheer', quake: () => 'Jump_Full_Short', blink: () => 'Dodge_Forward', pierce: s => STAB[s], missile: () => 'Spellcast_Shoot', nova: () => 'Spellcast_Raise', kick: () => 'Unarmed_Melee_Attack_Kick' };
const SKILL_SPAN = { wall: 0.5, heal: 1.3, warcry: 0.8, quake: 1.0, blink: 0.4, nova: 1.3 };
const DODGE_CLIP = { left: 'Dodge_Left', right: 'Dodge_Right', back: 'Dodge_Backward', fwd: 'Dodge_Forward' };
// 弓的姿勢：up 舉弓的程度、draw 拉弦的程度（0–1）。t 從開始算的秒數，h 放箭的時間點，d 整段長度；full 是一開始就拉滿（蓄力射放開的那一下）
function bowShot(t, h, d, full) { const up = Math.min(1, t / Math.min(0.09, h * 0.4)) * (1 - clamp((t - (h + (d - h) * 0.45)) / ((d - h) * 0.55), 0, 1)); return { up, draw: t >= h ? 0 : full ? 1 : clamp((t - h * 0.22) / (h * 0.7), 0, 1), loose: t >= h ? t - h : -1 }; }
// 把角色目前的狀態轉成 Avatar.update 要的動作描述（自己、其他玩家、NPC 共用）
function pose(o, av) {
  const set = setOf(av); let act = null, roll = null, bow = null;
  if (o.atk) {
    const a = o.atk, A = a.A;
    if (A.clip === 'Bow') bow = bowShot(a.t, a.hit, a.dur, A.drawn);
    else if (A.rep && a.hits) { const H = a.hits; let i = 0; while (i < H.length - 1 && a.t >= (H[i][0] + H[i + 1][0]) / 2) i++; const s0 = i ? (H[i - 1][0] + H[i][0]) / 2 : 0, s1 = i < H.length - 1 ? (H[i][0] + H[i + 1][0]) / 2 : a.dur; act = { clip: A.clip, p: (a.t - s0) / (s1 - s0), dur: s1 - s0, hit: H[i][0] - s0 }; }
    else if (A.loop) act = { clip: A.clip, p: (a.t / a.dur * A.loop) % 1, span: clipDur(A.clip) };
    else if (A.span) act = { clip: A.clip, p: a.t / a.dur, span: A.span };
    else act = { clip: A.clip, p: a.t / a.dur, dur: a.dur, hit: a.hit };
  }
  else if (o.cast) {
    const c = o.cast, id = c.id, S = c.S, span = SKILL_SPAN[id], p = Math.min(1, c.t / c.dur), kk = c.k || 1;
    if (id === 'triple') { const g = S.gap * kk, i = clamp(Math.floor((c.t - c.at) / g) + 1, 0, S.n - 1), h = c.at + i * g, t0 = i ? h - g : 0; bow = c.t >= c.at + (S.n - 1) * g ? bowShot(c.t - t0, h - t0, c.dur - t0, false) : { up: Math.min(1, c.t / 0.08), draw: clamp((c.t - t0) / (h - t0), 0, 1), loose: -1 }; }
    else if (id === 'backshot') bow = bowShot(c.t, c.at, c.dur, false);
    else if (id === 'flurry') { const g = S.gap * kk, i = clamp(Math.floor((c.t - c.at + g * 0.6) / g), 0, S.n - 1), h = c.at + i * g, s0 = Math.max(0, h - g * 0.6), s1 = i === S.n - 1 ? c.dur : h + g * 0.4, cl = SLICE[set] || SLICE['1h']; act = { clip: i === S.n - 1 ? CHOP[set] : cl[i % 2], p: (c.t - s0) / (s1 - s0), dur: s1 - s0, hit: h - s0 }; }
    else { const clip = (SKILL_CLIP[id] || SKILL_CLIP.fire)(set); act = span ? { clip, p, span } : { clip, p, dur: c.dur, hit: c.at }; }
  }
  else if (o.dodge) { const p = Math.min(1, o.dodge.t / o.dodge.dur); if (o.dodge.kind === 'roll') roll = p; else act = { clip: DODGE_CLIP[o.dodge.kind] || 'Dodge_Backward', p, span: 0.4 }; }
  else if (o.drink) act = { clip: 'Use_Item', p: Math.min(1, o.drink.t / o.drink.dur) };
  else if (o.stun > 0) act = { clip: 'Block_Hit', p: 1 - o.stun / GUARD.stun, span: 0.9 };
  else if (o.sit) act = { clip: 'Sit_Floor_Idle', p: (clock % 4) / 4, span: 4 };      // 0.6：營火旁坐下、製作、採集（敲礦用劈砍的動作）
  else if (o.craft) act = { clip: 'Interact', p: (o.craft.t % 1.3) / 1.3, span: 1.3 };
  else if (o.gather && !o.gather.walk) act = o.gather.mine ? { clip: CHOP[set], p: (o.gather.t % 0.8) / 0.8 } : { clip: 'PickUp', p: Math.min(1, o.gather.t / Math.max(0.5, o.gather.dur)), span: 1.1 };
  const ch = o.charge ? (set === 'bow' ? null : { clip: HEAVY[set].clip, k: o.charge.k }) : null; if (o.charge && set === 'bow' && !bow) bow = { up: 1, draw: Math.min(1, 0.25 + o.charge.k * 0.75, (o.charge.t == null ? 1 : o.charge.t / 0.16)), loose: -1, hold: o.charge.k };
  // 出招的重心：命中前往後收、命中那一下往前壓、收招回正（重的招幅度大）；蓄力時往後坐
  let lean = 0; { const a = o.atk; if (a && a.A && !a.A.bolt && !a.A.arrow && a.hit > 0) { const A = a.A, hv = A.heavy || A.fx === 'h' || A.fx === 's' || a.code >= 8 ? 1 : 0.5, u = a.t / a.hit; lean = u < 0.7 ? -0.1 * hv * u / 0.7 : u < 1 ? lerp(-0.1 * hv, 0.2 * hv, (u - 0.7) / 0.3) : 0.2 * hv * Math.pow(1 - clamp((a.t - a.hit) / Math.max(0.05, a.dur - a.hit), 0, 1), 2); } else if (o.charge && set !== 'bow') lean = -0.13 * (o.charge.k || 0); }
  // 爬坡：自己用 updateMe 算好的；其他玩家用腳下坡度與面向估（只是畫面，不用同步）
  let climb = 0, desc = 0; if (o === me) { climb = me.climbK || 0; desc = me.descK || 0; } else if (o.x != null && (o.speed01 || 0) > 0.2 && !o.atk && !o.dodge && !o.sw) { const g1 = slopeAt(o.x, o.z), al = Math.sin(o.f) * g1.x + Math.cos(o.f) * g1.z; o.climbK = lerp(o.climbK || 0, climbOf(al), 0.15); o.descK = lerp(o.descK || 0, descOf(al), 0.15); climb = o.climbK; desc = o.descK; } else if (o.climbK || o.descK) { o.climbK = (o.climbK || 0) * 0.85; o.descK = (o.descK || 0) * 0.85; climb = o.climbK; desc = o.descK; }
  return { speed01: o.speed01 || 0, act, roll, block: !!o.guard, charge: ch, glow: o.charge ? o.charge.k : 0, bow, mv: o.mv || null, sprint: o.sprinting ? 1 : 0, dead: o.deadT || 0, flash: o.flash || 0, swim: o.sw || 0, slide: o.slideK || 0, lean, climb, desc, cglow: o.cwin > 0 ? (0.72 + 0.28 * Math.sin(rclock * 19)) * Math.min(1, o.cwin / 0.2) : 0 };
}
// 招式裡身體的位移：躍起的高度、轉身的角度（只影響看起來的樣子，判定仍以 f 為準）
const hopY = o => { const a = o.atk, A = a && a.A; if (A && A.hop) return A.hop * Math.sin(Math.PI * clamp(a.t / a.hit, 0, 1)); const c = o.cast; return c && c.S.back ? 0.9 * Math.sin(Math.PI * clamp(c.t / (c.at * 1.25), 0, 1)) : 0; };
const spinYaw = o => { const a = o.atk, A = a && a.A; if (!A || !A.spin) return 0; const q = clamp(a.t / (a.dur * 0.86), 0, 1); return A.spin * TAU * (q * q * (3 - 2 * q)); };
const meY = () => me.swim && me.y != null ? me.y : Hgt(me.x, me.z);      // 特效、數字用的腳底高度（游泳時在水面附近）
const canAct = ok8 => input.started && !input.creator && me.alive && me.stun <= 0 && !me.swim && !me.drink && !me.sit && (ok8 || !me.tower8);      /* R4：ok8＝true 時獵臺上也算（喝藥）；攻擊、技能、閃避照舊擋 */      /* X10：站在獵臺上不能出手 */       // 游泳中、喝藥中不能攻擊、施放技能（閃避會中斷喝藥）
const val = (v, k) => Array.isArray(v) ? lerp(v[0], v[1], k) : v;

/* ---------- 鎖定目標 ---------- */
// 挑選目標。背後視角：鏡頭前方夾角內最靠近準心的；俯視：最靠近滑鼠游標的；都沒有就挑身邊最近的。from 是目前的目標，dir 往右（1）或往左（-1）換下一隻
function lockPick(from, dir) {
  const top = input.cam.mode === 'top', yaw = top ? Math.atan2(input.aim.x - me.x, input.aim.z - me.z) : input.cam.yaw, c = [];
  for (const v of MV()) { if (!lockOk(v) || v === from || BA7.hidden(v) || BA8.hidden(v)) continue; const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz); if (d > LOCK.range) continue; if (Math.hypot(v.x, v.z) < WORLD.TOWN_R - 1 && !v.trial8) continue; c.push({ v, d, a: Math.atan2(dx, dz) }); }
  for (const v of H8.fn.lockables()) { if (!lockOk(v) || v === from) continue; const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz); if (d <= LOCK.range) c.push({ v, d, a: Math.atan2(dx, dz) }); }      // 0.8：對決時可以鎖定對手（不受城內限制）
  if (!c.length) return null;
  if (from) { const a0 = Math.atan2(from.x - me.x, from.z - me.z); for (const k of c) k.r = ((angDiff(a0, k.a) * -dir) + TAU) % TAU; c.sort((p, q) => p.r - q.r); return c[0].v; }      // 以目前目標的方向為準，依角度順序換
  let best = null, bs = 1e9;
  for (const k of c) { let sc; if (top) { const m = Math.hypot(k.v.x - input.aim.x, k.v.z - input.aim.z); sc = m < 7 ? m : 20 + k.d; } else { const a = Math.abs(angDiff(yaw, k.a)); sc = a < LOCK.arc ? a * 9 + k.d * 0.25 : k.d < 10 ? 30 + k.d : 1e8; } if (sc < bs) { bs = sc; best = k.v; } }
  return bs < 1e7 ? best : null;
}
export function toggleLock() {
  if (!input.started || input.creator || input.talk || !me.alive) return false;
  if (me.lock) { me.lock = null; ui.sfx('unlock'); return false; }
  const v = lockPick(); if (v) questAct('doLock'); if (!v) { ui.toast('附近沒有可以鎖定的野獸'); return false; }
  me.lock = v; ui.sfx('lock'); ui.tip('lock', `已鎖定：移動會繞著目標走，閃避變成朝按的方向快閃。${keyOf('lockNext')} 或滾輪換目標，再按 ${keyOf('lock')} 解除。`); return true;
}
export function cycleLock(dir = 1) { if (!me.lock) return toggleLock(); const v = lockPick(me.lock, dir); if (v) { me.lock = v; ui.sfx('lock'); } return !!v; }
// 每幀檢查：目標倒下時，旁邊還有正在攻擊自己的野獸就自動改鎖牠，否則解除；離得太遠也解除
function updateLock() {
  const v = me.lock; if (!v) return;
  if (!me.alive || input.creator) { me.lock = null; return; }
  if (lockOk(v) && Math.hypot(v.x - me.x, v.z - me.z) <= LOCK.lose) return;
  let best = null, bd = LOCK.next; if (v.st === MST.DEAD) for (const o of MV()) { if (!lockOk(o) || o === v || BA7.hidden(o) || BA8.hidden(o) || o.st === MST.IDLE || o.st === MST.FLEE || o.st === MST.WARN) continue; const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < bd) { bd = d; best = o; } }
  me.lock = best; if (!best) ui.sfx('unlock');
}

/* ---------- 攻擊 ---------- */
// 出招：A 是招式資料，code 是出招編號（見 core.js 的 MOVE_SLOTS），k 是蓄力程度
function startAttack(A, code, k) {
  let mp = A.mp ? val(A.mp, k) : 0; if (mp > me.mp) { const W = moveset().weak; if (!W) { ui.toast('魔力不足'); return false; } A = W; code = 13; k = 1; mp = 0; if (clock - (me.mpWarn || -9) > 2) { me.mpWarn = clock; ui.toast('魔力不足：改射微光彈'); ui.sfx('deny'); ui.tip('weakbolt', '魔力不夠時，法杖改射微弱的「微光彈」：只耗體力，威力和射程都差很多。等魔力回復，或用魔力彈打中野獸回流一點魔力。'); } }      // 法杖的招式耗魔力；魔力不夠就改射微光彈（只耗體力），不會完全不能攻擊
  const cost = val(A.cost, k) * D.stCost * M6.act; if (me.st < cost) { ui.toast('體力不足'); return false; }
  const ranged = !!(A.bolt || A.arrow), sp = D.atkSpeed / (A.arrow ? D.aimMul : 1), vl = Math.hypot(me.vx, me.vz);
  let ldx = vl > 1 ? me.vx / vl : Math.sin(me.f), ldz = vl > 1 ? me.vz / vl : Math.cos(me.f), lunge = A.lunge || 0;
  me.f = aimAngle(ranged ? A.range : 5.5 + lunge, ranged); me.guard = false;
  if (lunge && !ranged) {      // 近戰的突進朝目標去，停在打得到的距離
    ldx = Math.sin(me.f); ldz = Math.cos(me.f); const tv = lockOk(me.lock) ? me.lock : aimPick(lunge + A.range)[1];
    if (tv) lunge = clamp(Math.hypot(tv.x - me.x, tv.z - me.z) - MON[tv.type].body * tv.size - Math.min(2.1, A.range * 0.58), 0.3, lunge);
  }
  const hits = (A.hits || [[A.hit, 1]]).map(h => [h[0] / sp, h[1]]);
  me.atk = { t: 0, A, code, k, dmg: val(A.dmg, k), hits, hi: 0, done: false, dur: A.dur / sp, hit: hits[0][0], lunge, ldx, ldz, lt: hits[0][0] };
  me.ad = pvpPow(val(A.dmg, k) * (code === 8 || code === 10 || code === 11 ? M6.heavy : 1) * (A.arrow ? D.throwMul : A.bolt || A.nova ? D.spellMul : D.dmgMul), !!A.nova);      // 對打：這一招的攻擊力（和 as 同一次送出）
  me.queued = false; me.as++; me.ac = code; if (code === 12) questAct('doSprint'); me.ak = Math.round(k * 10); me.st -= cost; me.mp -= mp; me.stDelay = 0.7; me.sprintT = 0;
  me.kx += Math.sin(me.f) * A.step; me.kz += Math.cos(me.f) * A.step; if (!(A.drawn && k > 0)) ui.sfx(A.arrow ? 'draw' : 'swing', A.fx === 'h' || A.fx === 's', { wp: me.avatar.look.wp, tag: A.fx === 't' ? 'thrust' : null }); if (A.lunge) ui.sfx('dodge', 'lunge'); if (code >= 9) ui.move(A.name); return true;
}
const moveset = () => MOVESET[setOf(me.avatar)];
// 輕攻擊：連段；翻滾／快閃／後撤之後、衝刺中各有不同的招
export function tryAttack() {
  if (Fish.click()) return;      // 0.7：拿著釣竿時，左鍵是拋竿、提竿與收線
  if (!canAct() || me.cast || me.rush || me.charge) return;
  if (me.dodge) { me.queued = 'L'; return; }                    // 閃避中按攻擊：結束時接上
  if (me.atk) { if (me.atk.t > 0.1) me.queued = 'L'; return; }
  const M = moveset();
  if (me.cwin > 0) { const set = setOf(me.avatar), r = set === 'staff' || set === 'bow'; me.cwin = 0; me.dashWin = 0; if (startAttack(CMOVE[set], r ? 9 : 14, 1)) { fxCue('counter', me, 1); questAct('doCounter'); } return; }      // 反擊：同步時用後撤／翻滾後攻擊的編號（別人看到的是同一個動作）
  if (me.dashWin > 0) { const back = me.dashKind === 'back'; me.dashWin = 0; startAttack(back ? M.back : M.dodge, back ? 14 : 9, 1); return; }
  if (me.sprinting && me.sprintT >= SPRINT.atk) { startAttack(M.sprint, 12, 1); return; }
  const c = me.comboT > 0 ? me.combo % M.light.length : 0; startAttack(M.light[c], c, 1);
}
// 重攻擊：連段中按是收尾招（輕一下接、輕兩下以上接各不同）；平常按下開始蓄力，放開出招（輕點就是不蓄力的重攻擊）
export function tryHeavy() {
  if (!canAct() || me.cast || me.rush || me.charge) return;
  if (me.dodge) { me.queued = 'H'; return; }
  if (me.atk) { me.queued = 'H'; return; }      // 出招途中按重攻擊：一律排進下一招（跟輕攻擊不同鍵，不怕連點誤觸）
  const M = moveset();
  if (me.comboT > 0 && me.lightN > 0) { const b = me.lightN >= 2; me.comboT = 0; me.combo = 0; me.lightN = 0; if (startAttack(b ? M.b : (noShield(me.avatar) && M.a2) || M.a, b ? 11 : 10, 1)) ui.tip('branch', `連段中按 ${keyOf('heavy')} 會接收尾招：輕一下後接、輕兩下後接是不同的招。全部招式在 ${keyOf('skills')} 的「招式表」。`); return; }
  if (me.guard || me.st <= 4) { if (me.st <= 4) ui.toast('體力不足'); return; }
  me.dashWin = 0; me.charge = { t: 0, k: 0, full: M.heavy.full / D.atkSpeed, ding: false, key: true };
}
// 閃避。沒鎖定：有按方向就朝那個方向翻滾；鎖定中：朝按的方向快閃一小步（面向不變）；沒按方向都是後撤步
export function tryDodge() {
  if (T7.held()) return;      // 0.7：被捕獸夾夾住不能閃避
  const dk = me.drink; me.drink = null; if (!canAct() || me.dodge || me.rush || me.dodgeCd > 0) { me.drink = dk; return; }      // 喝藥途中可以閃避：喝藥中斷，藥不會少
  let [dx, dz] = moveVec(); const aim = aimAngle(8), fxv = Math.sin(aim), fzv = Math.cos(aim); let kind;
  if (!dx && !dz) { kind = 'back'; dx = -fxv; dz = -fzv; }
  else if (!lockOk(me.lock)) kind = 'roll';
  else { const dot = dx * fxv + dz * fzv, side = dx * fzv - dz * fxv; kind = Math.abs(side) > Math.abs(dot) * 0.7 ? (side > 0 ? 'left' : 'right') : dot > 0 ? 'fwd' : 'back'; }
  const G = dodgeOf(kind), cost = G.cost * D.stCost * M6.act * (M6.dsSt || 1); if (me.st < cost) { me.drink = dk; ui.toast('體力不足'); return; }
  questAct(kind === 'roll' ? 'doRoll' : kind === 'back' ? 'doBack' : 'doStep'); me.dodge = { t: 0, kind, dx, dz, G, dur: G.dur }; me.atk = null; me.queued = false; me.charge = null; me.cast = null; me.guard = false; me.f = kind === 'roll' ? Math.atan2(dx, dz) : aim; me.st -= cost; me.stDelay = 0.8; me.dodgeI = G.iframe * (M6.win || 1); me.dashWin = 0; me.dodgeAt = clock; me.sprintT = 0;
  emit(me.x, meY() + 0.2, me.z, kind === 'roll' ? 12 : 7, [0.5, 0.44, 0.3], 2.2, 1.2, 0.5, 3); ui.sfx('dodge', kind);
}
function perfectDodge(v) {
  me.dodgeI = Math.max(me.dodgeI, 0.12); me.counter = PERFECT.counter; me.st = Math.min(D.maxSt, me.st + PERFECT.st); me.mp = Math.min(D.maxMp, me.mp + PERFECT.mp); me.stats.perfect++; fx.hitstop = Math.max(fx.hitstop, PERFECT.slow);
  const y = meY(); popNumber(me.x, y + 3.2, me.z, '完美閃避', 'perfect'); fxCue('perfect', me); fxRing(me.x, me.z, 0.6, 2.6, 0.35, [1.2, 2.2, 3.0]); emit(me.x, y + 1.2, me.z, 16, [1.2, 2.2, 3.0], 4, 2, 0.4, 0); ui.sfx('perfect'); me.cwin = COUNTER.win; fxCue('counter', me); ui.sfx('counter'); ui.tip('perfect', `完美閃避！在攻擊命中的瞬間閃開，體力回復，3 秒內的下一擊必定暴擊。身上發出金光的 ${COUNTER.win} 秒內按 ${keyOf('attack')}，會衝上去使出「反擊」。`);
}
// d7-snd-code：喘氣（pant/m、pant/f）。force＝衝刺把體力用光；否則是生命偏低（每 lowEvery 秒最多一次）。兩種共用冷卻 cd 秒
const PANT = { cd: 10, low: 0.25, lowEvery: 12 }; let pantT = -99;
function pantMe(force) { if (!me.alive || me.swim || clock - pantT < (force ? PANT.cd : PANT.lowEvery)) return; pantT = clock; ui.sfx('pant', 0, { tag: me.avatar.look.g ? 'f' : 'm' }); }
// d7-snd-code：遠端玩家受擊的人聲（ouch，每人 1.5 秒）、生命掉到 25 以下那一刻喘氣（pant，每人 15 秒）。體型取自外觀字串（lk）
function remoteVoice(r, hp) { const g = r.avatar.look && r.avatar.look.g ? 'f' : 'm'; if (clock - (r.ouchT ?? -99) >= 1.5) { r.ouchT = clock; ui.sfx('ouch', g, { x: r.x, z: r.z }); } if (hp > 0 && hp < 25 && r.lastHp >= 25 && clock - (r.pantT ?? -99) >= 15) { r.pantT = clock; ui.sfx('pant', 0, { tag: g, x: r.x, z: r.z }); } }      // 以上 d7-snd-code
// 受到攻擊。o.heavy 重擊（擋不住）、o.mon 出手的怪。回傳結果：hit／dodged／immune／blocked／parried／broken
function hurtMe(raw, fromX, fromZ, o = {}) {
  me.lastDmg = 0; if (!me.alive) return 'none';      // o.pvp：出手的是其他玩家（擊退只有 PVP.kbK 倍：輕微擊退）
  if (me.dodgeI > 0) { perfectDodge(o.mon); return 'dodged'; }
  if (me.iframe > 0) return 'immune';
  const y = meY(), wall = me.buff.wall > 0, set = setOf(me.avatar); let dmg = raw * D.defMul * (1 - M6.dr) * (o.mon ? lvHurt(o.mon.lv - P.lv) : 1), kb = 9, res = 'hit';      // M6.dr：披肩＋料理＋藥劑的減傷，合計最多兩成
  if (me.guard && Math.abs(angDiff(me.f, Math.atan2(fromX - me.x, fromZ - me.z))) <= GUARD.arc) {
    const G = GUARD[set], need = raw * G.st * D.stCost * M6.guard;
    if (me.guardT <= GUARD.parry * (M6.win || 1)) {            // 精準格擋：不受傷、不耗體力，出手的怪會踉蹌
      me.counter = PERFECT.counter; me.st = Math.min(D.maxSt, me.st + 12); me.mp = Math.min(D.maxMp, me.mp + PERFECT.mp); me.iframe = 0.3; me.stats.parry++; me.lastCombat = clock; fx.hitstop = Math.max(fx.hitstop, 0.1); fx.shake = Math.max(fx.shake, 0.25);
      popNumber(me.x, y + 3.2, me.z, '精準格擋', 'perfect'); fxCue('parry', me); fxRing(me.x + Math.sin(me.f) * 0.8, me.z + Math.cos(me.f) * 0.8, 0.3, 1.8, 0.25, [3, 2.6, 1.4]); emit(me.x + Math.sin(me.f) * 0.9, y + 1.3, me.z + Math.cos(me.f) * 0.9, 22, [3, 2.6, 1.4], 7, 3, 0.35, 10); ui.sfx('parry', 0, { wp: me.avatar.look.wp });
      if (o.mon) { sendEv(['p', o.mon.id]); feelHit(o.mon, FEEL.parry, o.mon.x - me.x, o.mon.z - me.z, false); } me.cwin = COUNTER.win; fxCue('counter', me); ui.sfx('counter');
      ui.tip('parry', `精準格擋！在攻擊命中前一瞬間舉起格擋，不受傷，野獸會踉蹌，3 秒內的下一擊必定暴擊。身上發出金光的 ${COUNTER.win} 秒內按 ${keyOf('attack')}，會衝上去使出「反擊」。`); return 'parried';
    }
    if ((o.heavy || me.st < need) && !wall) {  // 破防：重擊擋不住，或體力不夠
      dmg *= o.heavy ? 1 - GUARD.heavyCut : 1 - G.cut * clamp(me.st / need, 0, 1); me.st = 0; me.stDelay = 1.4; me.stun = GUARD.stun; me.guard = false; res = 'broken'; me.stats.broken++; kb = 5;
      popNumber(me.x, y + 3.2, me.z, '破防', 'hurt'); ui.sfx('break'); ui.tip('break', o.heavy ? '被破防了。衝撞、拍地、飛撲這類重擊擋不住，要用閃避躲開。' : '體力不夠，格擋被打穿了。格擋每擋一下都會消耗體力。');
    } else { dmg *= 1 - G.cut; if (!wall) { me.st -= need; me.stDelay = 0.9; } kb = 2.5; res = 'blocked'; me.stats.blocked++; fxCue('block', me); if (o.mon) feelHit(o.mon, FEEL.block, o.mon.x - me.x, o.mon.z - me.z, false, -1); emit(me.x + Math.sin(me.f) * 0.8, y + 1.3, me.z + Math.cos(me.f) * 0.8, 12, [2.6, 2.4, 2.0], 6, 2.5, 0.3, 12); ui.sfx('block', 0, { wp: me.avatar.look.wp }); }
  }
  if (wall) { dmg *= 1 - SKILLS.wall.cut; kb = 0; } if (o.pvp) kb *= PVP.kbK;
  dmg = Math.max(1, Math.round(dmg)); me.stats.hits++; me.lastDmg = dmg;
  me.hp = Math.max(o.floor || 0, me.hp - dmg); if (o.floor && me.hp <= o.floor) H8.emit('me:floor', { o, dmg }); me.flash = res === 'blocked' ? 0.4 : 1; me.lastCombat = clock; fx.shake = Math.max(fx.shake, res === 'blocked' ? 0.25 : 0.5);
  const dx = me.x - fromX, dz = me.z - fromZ, l = Math.hypot(dx, dz) || 1; me.kx += dx / l * kb; me.kz += dz / l * kb;
  if (res !== 'blocked') { fx.hitstop = Math.max(fx.hitstop, res === 'broken' ? 0.09 : 0.06); kickCam(dx / l, dz / l, res === 'broken' ? 0.34 : 0.26); me.cwin = 0; }      // 挨打：自己的畫面頓一下、鏡頭被往後推
  if (me.regenMeat) me.regenLeft = 0;      // 獸肉的緩慢回復：挨打就中斷
  Gather.cancel(); Needs.stand(); Craft.cancel();      // 採集、坐著休息、製作：挨打就中斷
  if (res !== 'blocked') { if (!wall) { me.atk = null; me.queued = false; me.charge = null; me.cast = null; if (me.drink && !(M6.steady && /^(potion|tonic)/.test(me.drink.id))) { me.drink = null; popNumber(me.x, y + 3.4, me.z, '中斷', 'hurt'); } } me.iframe = 0.45; } else me.iframe = 0.15;
  popNumber(me.x, y + 2.8, me.z, '-' + dmg, res === 'blocked' ? 'block' : 'hurt'); if (res !== 'blocked') { emit(me.x, y + 1.3, me.z, 12, [3, 0.5, 0.3], 4, 2.5, 0.45, 9); fxCue('hurt', me); ui.sfx('hurt', 0, { tag: me.avatar.look.g ? 'f' : 'm' }); ui.hurt(); }      // d7-snd-code：依體型 hurt/m、hurt/f
  if (me.hp <= 0) die();
  return res;
}
function die() {
  if (X8.down && X8.down()) return; /* 0.8 試煉（trial08）：沙地上倒下＝這場結束，不扣經驗、不掉金幣、在沙地邊緣起來 */
  if (me.killer) { pvpDied(me.killer); me.killer = null; }      // 被其他玩家打倒：公告（死亡懲罰照常）
  me.alive = false; me.deadT = 0; me.seatGo = null; me.drink = null; me.regenLeft = 0; me.dodge = null; me.atk = null; me.charge = null; me.cast = null; me.rush = null; me.guard = false; me.stun = 0; me.lock = null; me.sprinting = false; P.deaths++; Gather.cancel(); Needs.stand(); Craft.cancel(); Ars.endTrial(true); Needs.onDeath();      // 倒下一次扣精力；料理與藥劑的增益不會消失
  // 復活後 5 分鐘內再次倒下不重複扣除，免得回去撿金幣時連續受罰
  const grace = P.lastDeath > 0 && Date.now() - P.lastDeath < 300000;
  const loss = grace ? 0 : Math.min(deathExp(P.lv), P.exp), gold = grace ? 0 : Math.floor(P.gold * 0.03);
  if (!grace) P.lastDeath = Date.now();
  P.exp -= loss; if (gold > 0) { P.gold -= gold; P.bag = { x: r1(me.x), z: r1(me.z), gold, until: Date.now() + 15 * 60000 }; }
  ui.dead(loss, gold, grace); Store.dirty = true; ui.dirty = true;
}
export function gainExp(n, x, z) {
  if (P.lv >= LV_CAP || n <= 0) return;
  P.exp += n; popNumber(x, Hgt(x, z) + 3.3, z, '+' + n + ' 經驗', 'exp');
  while (P.lv < LV_CAP && P.exp >= expNeed(P.lv)) { P.exp -= expNeed(P.lv); P.lv++; P.pts += 10; refreshDerived(); me.hp = D.maxHp; me.st = D.maxSt; me.mp = D.maxMp; me.avatar.cheer(); emit(me.x, meY() + 0.3, me.z, 60, [2.6, 2.0, 0.8], 5, 6, 1.2, 4); ui.levelUp(P.lv); fxCue('levelup', me); grantBasics(); }
  if (P.lv >= LV_CAP) P.exp = 0;
  Store.dirty = true; ui.dirty = true;
}
// 回傳實際放進背包的數量（有攜帶上限的道具可能放不下）
export function addItem(id, n = 1) {
  n = Math.min(n, room(id)); if (n <= 0) return 0;
  P.inv[id] = (P.inv[id] || 0) + n; Store.dirty = true; ui.dirty = true; qRefresh(); if (ITEMS[id] && ITEMS[id].orb) ui.tip('orb', `得到天賦球了。按 ${keyOf('skills')} 開啟技能視窗，能力達到門檻就能學會，再裝到技能欄使用。`); return n; }
export function useItem(id) {
  const it = ITEMS[id]; if (!it || !(P.inv[id] > 0) || !me.alive) return false;
  if (it.orb) return learnOrb(it.orb);
  if (it.passive) return learnPassive(id);                       // 0.6：被動天賦球、食譜、披肩、料理與藥
  if (it.kind === 'recipe') return Craft.useRecipeItem(id);
  if (it.kind === 'cloak') return Ars.wearCloak(id);
  if (it.open8) return it.open8(id);      /* 0.8 X8：稀有天賦球箱（num08.js） */
  if (USE[id] && USE[id].act) return Craft.use(id);
  if (!it.heal && !it.regen) { ui.toast(it.kind === 'charm' ? '獸飾要請布蘿娜裝到武器上' : '這個道具現在還用不到'); return false; }
  if (me.drink) return false;
  if (me.potCd > 0) { ui.toast(`還要 ${Math.ceil(me.potCd)} 秒才能再用回復道具`); return false; }
  if (me.hp >= D.maxHp - 0.5 && !(id === 'meat' && P.sat < Needs.max() - 0.5)) { ui.toast('生命已滿'); return false; }      // 獸肉也回飽食：肚子沒滿就能吃
  if (!canAct(true) || me.dodge || me.rush || me.cast) return false;      /* R4：獵臺上可以喝藥 */
  // 喝藥、進食是一個動作：期間走得慢、不能出手，被打中或閃避會中斷（道具不會少）；動作做完才生效
  me.atk = null; me.queued = false; me.charge = null; me.guard = false; me.dashWin = 0; me.drink = { id, t: 0, dur: POTION.use }; ui.sfx('drink', id);
  ui.tip('drink', `回復道具不能連用。治療藥水：喝的時候站穩（被打中會中斷），${POTION.dur} 秒內回復，之後 ${POTION.cd} 秒不能再用。獸肉回得慢、一挨打就中斷，適合打完再吃。`); return true;
}
// 喝完（吃完）：扣掉道具，在幾秒內慢慢回復，並開始冷卻
function drinkDone(id) {
  const it = ITEMS[id], K = id === 'potion' ? POTION : MEAT; if (!(P.inv[id] > 0)) return;
  P.inv[id]--; if (P.inv[id] <= 0) delete P.inv[id]; me.potCd = me.potCdMax = K.cd;
  if (id === 'meat') { Needs.add('sat', USE.meat.sat); questAct('doEat'); questAct('doEat:meat'); } const amt = Math.round(D.maxHp * K.heal); me.regenLeft = amt; me.regenRate = amt / K.dur; me.regenMeat = id !== 'potion'; fxCue('potion', me); popNumber(me.x, meY() + 2.8, me.z, '+' + amt, 'heal');
  emit(me.x, meY() + 1, me.z, 18, [0.5, 2.2, 0.9], 2, 3, 0.8, -1); ui.sfx('heal'); Store.dirty = true; ui.dirty = true;
}
// 回復鍵：戰鬥中喝藥水（沒有才吃肉）；沒在戰鬥先吃肉，把藥水省下來
export const quickHeal = () => { const pot = P.inv.potion > 0 ? 'potion' : P.inv.potion_strong > 0 ? 'potion_strong' : '';      // 0.6：治療藥水用完了改喝強效的
  if (!useItem(pot && (clock - me.lastCombat < 6 || !(P.inv.meat > 0)) ? pot : P.inv.meat > 0 ? 'meat' : pot || 'potion')) { if (!pot && !(P.inv.meat > 0)) ui.toast('沒有可用的回復道具'); } };
// 被動天賦球（不佔技能欄）：能力達到門檻才學得會
function learnPassive(id) {
  const it = ITEMS[id]; if (P.pas[it.passive]) { ui.toast('已經學會了，多的可以留著交易。'); return false; }
  if (!meetsReq(it.req, P.stats)) { ui.toast('能力還不夠：需要 ' + reqText(it.req)); ui.sfx('deny'); return false; }
  take(id, 1); P.pas[it.passive] = 1; me.avatar.cheer(); ui.sfx('learn'); ui.log(`學會了被動天賦「${it.name.replace('天賦球：', '')}」：${it.desc.replace('被動：', '')}`); Store.dirty = true; ui.dirty = true; return true;
}
export function allocate(add) { let n = 0; for (const k of STAT_KEYS) n += add[k] || 0; if (n <= 0 || n > P.pts) return false; for (const k of STAT_KEYS) P.stats[k] += add[k] || 0; P.pts -= n; refreshDerived(); Store.dirty = true; return true; }

/* ============================== 天賦球與技能 ============================== */
// 天賦球是道具：能力達到門檻才能學，學會後球消失；學會的技能裝進四格技能欄使用
export function learnOrb(id) {
  const S = SKILLS[id], it = 'orb_' + id; if (!S || !(P.inv[it] > 0)) return false;
  if (P.skills.includes(id)) { ui.toast('已經學會「' + S.name + '」了，多的天賦球可以留著交易或賣掉。'); return false; }
  if (!meetsReq(S.req, P.stats)) { ui.toast('能力還不夠：需要 ' + reqText(S.req)); ui.sfx('deny'); return false; }
  P.inv[it]--; if (P.inv[it] <= 0) delete P.inv[it]; P.skills.push(id); const free = P.slots.indexOf(null); if (free >= 0) P.slots[free] = id;
  const y = meY(); fxPillar(me.x, me.z, 1.1, 5.5, 1.1, [1.6, 1.3, 0.6], me); fxRing(me.x, me.z, 0.5, 4, 0.7, [2.4, 2.0, 0.9]); emit(me.x, y + 0.4, me.z, 40, [2.4, 2.0, 0.9], 3, 6, 1.1, 2); me.avatar.cheer(); ui.sfx('learn');
  ui.log(`學會了「${S.name}」` + (free >= 0 ? `，已放進技能欄第 ${free + 1} 格（按 ${keyOf('skill' + (free + 1))} 施放）。` : `。技能欄滿了，按 ${keyOf('skills')} 調整。`)); Store.dirty = true; ui.dirty = true; return true;
}
// 基礎技能不需要天賦球：等級到了就領悟（讀到舊存檔時也會補上）。現在的武器用得上的，有空格就自動放進技能欄
function fitSlots() { const set = setOf(me.avatar); let n = 0; for (const id of P.skills) { if (!SKILLS[id].basic || P.slots.includes(id) || !skillFits(SKILLS[id], set)) continue; const free = P.slots.indexOf(null); if (free < 0) break; P.slots[free] = id; n++; } return n; }
export function grantBasics(quiet, noFit) {
  const got = []; for (const id of BASIC_SKILLS) if (P.lv >= SKILLS[id].lv && !P.skills.includes(id)) { P.skills.push(id); got.push(SKILLS[id].name); }
  if (!got.length) return got; if (me.avatar && !noFit) fitSlots(); Store.dirty = true; ui.dirty = true;
  if (!quiet) { ui.log(`領悟了基礎技能：${got.map(n => '「' + n + '」').join('')}。按 ${keyOf('skills')} 可以查看、調整技能欄。`); ui.tip('basic', `升級會領悟基礎技能（不用天賦球），按 ${keyOf('skill1')}–${keyOf('skill4')} 施放。技能只耗魔力（藍條），普通攻擊打中會回一點。`); }
  return got;
}
export function equipSkill(id, slot) { if (slot < 0 || slot > 3 || (id && !P.skills.includes(id))) return; const cur = P.slots.indexOf(id); if (id && cur >= 0) P.slots[cur] = P.slots[slot]; P.slots[slot] = id || null; Store.dirty = true; ui.dirty = true; }
export function pickGift(id) { if (!P.gift || !P.gift.includes(id)) return; P.gift = P.giftQ.shift() || null; addItem('orb_' + id); ui.loot('得到 ' + ITEMS['orb_' + id].name, ['orb_' + id]); Store.dirty = true; ui.dirty = true; }
// 把事件告訴主控端與其他玩家：k 打斷怪物（可帶推開的原點與力道）、p 精準格擋、t 嘲諷、s 技能特效
function sendEv(e) { if (e[0] === 'k') for (const i of e[1]) if (mons[i]) mons[i].qk = clock; me.evN++; const ev = [me.evN, ...e]; me.evs.push(ev); if (me.evs.length > 4) me.evs.shift(); evDirty = true; if (Net.isHost) hostEvent('self', ev); else if (X8.sim.size) hostEvent('self', ev, 1); }
const stagEv = (ids, stag, push) => { if (ids.length) sendEv(push ? ['k', ids.slice(0, 12), stag, r1(me.x), r1(me.z), push] : ['k', ids.slice(0, 12), stag]); };
// 技能一律消耗魔力；有些技能限定武器家族
export function castSkill(i) {
  const id = P.slots[i], S = SKILLS[id]; if (!S || !canAct() || !P.skills.includes(id) || me.cast || me.rush || me.dodge) return false;
  if (me.atk && me.atk.t < me.atk.hit) return false;
  const set = setOf(me.avatar); if (!skillFits(S, set)) { ui.toast(`「${S.name}」要拿${FAM_NAME[S.wp]}才能用`); ui.sfx('deny'); return false; }
  if (me.cds[id] > 0) { ui.sfx('deny'); return false; }
  const mp = S.cost.mp || 0; if (me.mp < mp) { ui.toast('魔力不足'); ui.sfx('deny'); return false; }
  // 共用冷卻：放了一個技能，技能欄裡其他技能也要等一下，不能一個接一個連放
  me.mp -= mp; questAct('doSkill'); me.cds[id] = S.cd; for (const o of P.slots) if (o && o !== id) me.cds[o] = Math.max(me.cds[o] || 0, MANA.gcd); me.atk = null; me.queued = false; me.charge = null; me.guard = false; me.dashWin = 0; me.comboT = 0; me.lightN = 0;
  const k = S.sc === 'spell' ? D.castMul : S.sc === 'aim' ? D.aimMul : 1 / D.atkSpeed;
  me.f = aimAngle(S.range || S.len || 6, S.sc === 'spell' || S.sc === 'aim'); me.cast = { id, S, t: 0, dur: S.cast * k, at: S.at * k, k, n: 0, fired: false, lunge: 0 };
  if (S.lunge) { const tv = lockOk(me.lock) ? me.lock : aimPick(S.lunge + 3.5)[1]; Object.assign(me.cast, { lunge: tv ? clamp(Math.hypot(tv.x - me.x, tv.z - me.z) - MON[tv.type].body * tv.size - 2.0, 0.3, S.lunge) : S.lunge, ldx: Math.sin(me.f), ldz: Math.cos(me.f), lt: S.at * k }); }
  if (S.back) { Object.assign(me.cast, { lunge: S.back, ldx: -Math.sin(me.f), ldz: -Math.cos(me.f), lt: S.at * k * 1.25 }); me.dodgeI = Math.max(me.dodgeI, 0.3); me.dodgeAt = clock; }
  fxCue('cast', me, id, me.cast.at); ui.sfx('cast', id); ui.dirty = true; return true;
}
function hitMon(v, dmg, o = {}) { o.grade = gradeOf(v, o); fxBegin('hit', v, dmg, o); try { const r = hitMon0(v, dmg, o); H8.emit('me:hitMon', { v, dmg, o, r }); return r; } finally { fxEnd(); } }      // 0.8：事件 me:hitMon
function hitMon0(v, dmg, o = {}) {
  const counter = o.counter, crit = o.crit, yy = Hgt(v.x, v.z);
  const d = Math.max(1, Math.round(dmg * lvDeal(v.lv - P.lv) * (crit ? 1.6 : 1) * (counter ? PERFECT.mul : 1) * (me.buff.warcry > 0 ? SKILLS.warcry.mul : 1) * M6.dmg * BA8.vuln(v))), key = mkey(v);      /* 0.8 X3a：巨鱷翻肚 +30% */      // M6.dmg：武器階級、料理、藥劑（近戰、魔力彈、弓箭、技能都經過這裡）
  myDmg[key] = (myDmg[key] || 0) + d; ledgerSet(key, 'self', myDmg[key]); dmgDirty = true; me.lastCombat = clock;
  { const G = FEEL[o.grade] || FEEL.light, dx = o.dir ? o.dir[0] : v.x - me.x, dz = o.dir ? o.dir[1] : v.z - me.z; feelHit(v, G, dx, dz, o.armored && !o.brk, 1, o.shot ? 0.6 : 1);
    if (o.brk && v.brkA !== v.spawn * 1000 + v.aid) { v.brkA = v.spawn * 1000 + v.aid; popNumber(v.x, yy + MON[v.type].tagH * v.size + 0.2, v.z, '打斷', 'perfect'); ui.sfx('break', 'stun', { x: v.x, z: v.z }); }      // 音效成員：打斷和被破防的聲音分開
    else if (o.stop && o.armored && v.st === MST.WIND && v.armA !== v.spawn * 1000 + v.aid) { v.armA = v.spawn * 1000 + v.aid; popNumber(v.x, yy + MON[v.type].tagH * v.size + 0.2, v.z, '霸體', 'call'); ui.sfx('armor'); }
    else if (o.armored) ui.sfx('armor'); }
  if (!o.skill) me.mp = Math.min(D.maxMp, me.mp + (o.shot ? MANA.shot : o.strong ? MANA.heavy : MANA.hit) * (o.second ? 0 : 1));      // 普通攻擊命中回一點魔力
  popNumber(v.x, yy + 2.3 * v.size + (o.second ? 0.55 : 0), v.z, String(d) + (crit ? '!' : ''), crit || o.strong ? 'mine heavy' : 'mine');
  emit(v.x, yy + 1.2, v.z, o.strong ? 26 : 14, o.rgb || [3.4, 2.4, 1.0], o.strong ? 8 : 6, 3.5, 0.4, 14); return d;
}
const alive = v => v.st !== MST.DEAD && v.model;
// 前方扇形、直線、圓形範圍內的野獸
const inCone = (v, x, z, f, range, arc) => { const dx = v.x - x, dz = v.z - z, d = Math.hypot(dx, dz), br = MON[v.type].body * v.size; return d <= range + br && (d <= 1.0 + br || arc >= 3 || Math.abs(angDiff(f, Math.atan2(dx, dz))) <= arc); };
const inLane = (v, x, z, f, len, w) => { const dx = v.x - x, dz = v.z - z, sf = Math.sin(f), cf = Math.cos(f), along = dx * sf + dz * cf, side = Math.abs(dx * cf - dz * sf), br = MON[v.type].body * v.size; return along > -br && along < len + br && side < w / 2 + br; };
// 技能生效。i 是第幾發（連發的技能會呼叫多次）
function fireSkill(c, i = 0) {
  const S = c.S, id = c.id, f = me.f, x = me.x, z = me.z, ids = [], pw = skillPow(id); let arg = 0, any = false, quiet = i > 0;
  if (id === 'cleave') { for (const v of MV()) if (alive(v) && inLane(v, x, z, f, S.len, S.w)) { hitMon(v, S.dmg * D.dmgMul, { strong: 1, skill: 1 }); ids.push(v.id); any = true; } fx.shake = Math.max(fx.shake, 0.5); if (any) fx.hitstop = Math.max(fx.hitstop, 0.08); }
  else if (id === 'dash') { me.rush = { t: 0, dur: 0.2, dx: Math.sin(f), dz: Math.cos(f), v: S.len / 0.2, S, hit: new Set(), x0: x, z0: z, pw }; me.dodgeI = 0.3; return; }
  else if (id === 'wall') { me.buff.wall = S.dur; sendEv(['t', r1(x), r1(z), S.r]); }
  else if (id === 'blade') spawnProj('blade', x, z, f, true, S.dmg * D.throwMul);
  else if (id === 'fire') spawnProj('fire', x, z, f, true, S.dmg * D.spellMul);
  else if (id === 'heal') { arg = Math.round(S.heal + P.stats.int * 1.5); me.hp = Math.min(D.maxHp, me.hp + arg); popNumber(x, Hgt(x, z) + 2.8, z, '+' + arg, 'heal'); }
  else if (id === 'warcry') me.buff.warcry = S.dur;
  else if (id === 'quake') { const k = 1 + (P.stats.end - 5) * 0.03; for (const v of MV()) { if (!alive(v)) continue; if (Math.hypot(v.x - x, v.z - z) < S.r + MON[v.type].body * v.size) { hitMon(v, S.dmg * k, { strong: 1, skill: 1 }); ids.push(v.id); any = true; } } fx.shake = Math.max(fx.shake, 0.75); if (any) fx.hitstop = Math.max(fx.hitstop, 0.09); }
  else if (id === 'blink') {
    const [yaw, v0] = aimPick(S.range), v = lockOk(me.lock) && Math.hypot(me.lock.x - x, me.lock.z - z) < S.range + 3 ? me.lock : v0; let tx, tz;
    if (v) { const br = MON[v.type].body * v.size + 1.3; tx = v.x - Math.sin(v.f) * br; tz = v.z - Math.cos(v.f) * br; if (blockedAt(tx, tz)) { const a = Math.atan2(x - v.x, z - v.z); tx = v.x + Math.sin(a) * br; tz = v.z + Math.cos(a) * br; } }
    else { let d = 9; while (d > 1 && blockedAt(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d)) d -= 1; tx = x + Math.sin(yaw) * d; tz = z + Math.cos(yaw) * d; }
    if (Math.hypot(tx, tz) < WORLD.TOWN_R + 2 && !me.inSafe && !(X8.on && X8.on())) { tx = x; tz = z; }
    const o = { x, z }; tryMove(o, tx, tz, 0.5); me.x = o.x; me.z = o.z; me.vx = me.vz = me.kx = me.kz = 0; if (v) me.f = Math.atan2(v.x - me.x, v.z - me.z); me.counter = S.dur; me.dodgeI = Math.max(me.dodgeI, 0.2); arg = [r1(me.x), r1(me.z)];
  }
  else if (id === 'pierce') { for (const v of MV()) if (alive(v) && inLane(v, x, z, f, S.len, S.w)) { hitMon(v, S.dmg * D.dmgMul, { strong: 1, skill: 1 }); ids.push(v.id); any = true; } if (any) { fx.hitstop = Math.max(fx.hitstop, 0.06); fx.shake = Math.max(fx.shake, 0.3); stagEv(ids, 3); ids.length = 0; } }
  else if (id === 'missile') { const tgt = lockOk(me.lock) ? me.lock : aimPick(S.range, 0.7)[1]; spawnProj('missile', x, z, f + [0.6, -0.6, 0.15][i % 3], true, S.dmg * D.spellMul, { range: S.range * 1.5, speed: S.speed, tgt, skill: 1, size: 1 }); }
  else if (id === 'triple') spawnProj('arrow', x, z, f + (i - 1) * 0.04, true, S.dmg * D.throwMul, { range: S.range, speed: S.speed, size: 1, skill: 1 });
  else if (id === 'flurry') { const last = i === S.n - 1; for (const v of MV()) if (alive(v) && inCone(v, x, z, f, S.range, S.arc)) { hitMon(v, S.dmg * (last ? 1.6 : 1) * D.dmgMul, { strong: last, skill: 1 }); any = true; if (last) ids.push(v.id); } if (any) { fx.hitstop = Math.max(fx.hitstop, last ? 0.07 : 0.03); ui.sfx('hit', last); } if (last) stagEv(ids, 3); ids.length = 0; arg = i; pvpSparks({ k: 'c', x, z, f, range: S.range, arc: S.arc }, last); skillFx(id, me, x, z, f, i, true); if (i === 0) sendEv(['s', S.i, r1(x), r1(z), r2(f), 0, ...pw]); if (any) me.counter = 0; return; }
  else if (id === 'nova') { for (const v of MV()) if (alive(v) && Math.hypot(v.x - x, v.z - z) < S.r + MON[v.type].body * v.size) { hitMon(v, S.dmg * D.spellMul, { strong: 1, skill: 1, spell: 1 }); ids.push(v.id); } stagEv(ids, 7, 10); ids.length = 0; fx.shake = Math.max(fx.shake, 0.35); }
  else if (id === 'backshot') spawnProj('arrow', x, z, f, true, S.dmg * D.throwMul, { range: S.range, speed: S.speed, size: 1.4, skill: 1, heavy: 1, stag: 6, push: 6, trail: 1 });
  else if (id === 'kick') { for (const v of MV()) if (alive(v) && inCone(v, x, z, f, S.range, S.arc)) { hitMon(v, S.dmg * D.dmgMul, { skill: 1 }); ids.push(v.id); any = true; } if (any) { fx.hitstop = Math.max(fx.hitstop, 0.07); fx.shake = Math.max(fx.shake, 0.35); ui.sfx('hit', 1); } stagEv(ids, 9, 11); ids.length = 0; }
  { const sh = id === 'cleave' || id === 'pierce' ? { k: 'l', x, z, f, len: S.len, w: S.w } : id === 'quake' || id === 'nova' ? { k: 'o', x, z, r: S.r } : id === 'kick' ? { k: 'c', x, z, f, range: S.range, arc: S.arc } : null; if (sh) pvpSparks(sh, id !== 'kick'); }      // 對打：範圍技能打到別的玩家的火花
  if (any) me.counter = 0; if (ids.length) sendEv(['k', ids.slice(0, 12), 6]);
  if (quiet) return;
  skillFx(id, me, x, z, f, arg, true); sendEv(['s', S.i, r1(x), r1(z), r2(f), arg, ...pw]);      // 最後兩格：對打用的攻擊力（舊版的人不看）
}
// 延後一點才出現的特效（別人的連發技能用）
const laters = []; const later = (sec, fn) => laters.push([clock + sec, fn]);
// 技能特效（自己與其他玩家共用）；別人放的治療與戰吼，站在範圍內也會生效
function skillFx(...a) { fxBegin('skill', ...a); try { skillFx0(...a); } finally { fxEnd(); } }
function skillFx0(id, who, x, z, f, arg, mine, pv) {      // pv：其他玩家的技能帶來的對打攻擊力 { r, pw }（飛行物用）
  const S = SKILLS[id], y = Hgt(x, z), dm = Math.hypot(x - me.x, z - me.z); if (!S || dm > 60) return;
  if (id === 'cleave') { spawnSlash(x, y, z, f, 'h', 1.35, [2.8, 1.4, 0.5]); fxLane(x, z, f, S.len, S.w, 0.6, [2.8, 1.1, 0.3]); for (let i = 1; i <= 6; i++) { const d = i / 6 * S.len, px = x + Math.sin(f) * d, pz = z + Math.cos(f) * d; emit(px, Hgt(px, pz) + 0.2, pz, 8, [1.6, 0.9, 0.4], 3.5, 4.5, 0.5, 9); } ui.sfx('boom', 1, { x, z }); }
  else if (id === 'dash') { const len = num(arg, S.len); fxLane(x, z, f, len, 1.5, 0.45, [0.9, 2.4, 1.1], 0.9, false); fxLane(x, z, f, len, 2.4, 0.35, [0.4, 1.2, 0.5], 0.14, false); spawnSlash(x + Math.sin(f) * len * 0.5, y, z + Math.cos(f) * len * 0.5, f, 't', 1.5, [0.9, 2.4, 1.1]); ui.sfx('dodge', 0, { x, z }); }
  else if (id === 'wall') { fxDome(who, 1.9, S.dur, [2.2, 1.6, 0.4]); fxRing(x, z, 1, S.r, 0.5, [2.2, 1.6, 0.4], 0.6); emit(x, y + 0.3, z, 20, [2.2, 1.6, 0.4], 3, 4, 0.6, 3); ui.sfx('block', 0, { tag: 'skill', x, z }); }
  else if (id === 'blade') { if (!mine) spawnProj('blade', x, z, f, false, 0, undefined, pv); }
  else if (id === 'fire') { if (!mine) spawnProj('fire', x, z, f, false, 0, undefined, pv); }
  else if (id === 'heal') { fxPillar(x, z, 1.3, 5.5, 1.0, [0.5, 2.4, 1.7], who); fxRing(x, z, 0.5, S.r, 0.7, [0.5, 2.4, 1.7], 0.7); emit(x, y + 0.3, z, 30, [0.5, 2.4, 1.7], 2.5, 5, 1.0, -1); ui.sfx('heal', 0, { x, z }); if (!mine && allyOf(who) && me.alive && dm < S.r) { const h = clamp(num(arg, 0), 0, 400); me.hp = Math.min(D.maxHp, me.hp + h); popNumber(me.x, meY() + 2.8, me.z, '+' + Math.round(h), 'heal'); fxPillar(me.x, me.z, 1.1, 4.5, 0.9, [0.5, 2.4, 1.7], me); } }
  else if (id === 'warcry') { fxRing(x, z, 0.5, S.r, 0.6, [2.8, 1.0, 0.4]); fxRing(x, z, 0.5, S.r * 0.6, 0.5, [2.8, 1.6, 0.6], 0.6); fxAura(who, 1.15, S.dur, [2.8, 1.0, 0.4]); emit(x, y + 1.6, z, 24, [2.8, 1.0, 0.4], 6, 2, 0.5, 0); ui.sfx('growl', 'bear', { tag: 'skill' }); if (!mine && allyOf(who) && me.alive && dm < S.r) { me.buff.warcry = S.dur; fxAura(me, 1.15, S.dur, [2.8, 1.0, 0.4]); popNumber(me.x, meY() + 3, me.z, '戰吼', 'perfect'); } }
  else if (id === 'quake') { fxRing(x, z, 0.6, S.r, 0.45, [2.2, 1.5, 0.7]); fxRing(x, z, 0.3, S.r * 0.7, 0.6, [1.4, 1.0, 0.5], 0.7); fxDisc(x, z, S.r, 0.4, [1.6, 1.1, 0.5]); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, px = x + Math.sin(a) * S.r * 0.7, pz = z + Math.cos(a) * S.r * 0.7; emit(px, Hgt(px, pz) + 0.2, pz, 6, [1.2, 0.9, 0.5], 3, 5, 0.6, 9); } if (dm < 25) fx.shake = Math.max(fx.shake, 0.5); ui.sfx('boom', 1, { x, z }); }
  else if (id === 'blink') { const tx = Array.isArray(arg) ? num(arg[0], x) : x, tz = Array.isArray(arg) ? num(arg[1], z) : z, d = Math.hypot(tx - x, tz - z); emit(x, y + 1.1, z, 26, [1.6, 0.9, 2.8], 3, 2, 0.5, -1); emit(tx, Hgt(tx, tz) + 1.1, tz, 26, [1.6, 0.9, 2.8], 4, 2, 0.5, -1); if (d > 0.5) fxLane(x, z, Math.atan2(tx - x, tz - z), d, 1.1, 0.4, [1.6, 0.9, 2.8], 1.0, false); fxRing(tx, tz, 1.6, 0.3, 0.3, [1.6, 0.9, 2.8]); ui.sfx('dodge', 0, { x, z }); }
  else if (id === 'pierce') { const c = [2.9, 2.2, 1.1]; spawnSlash(x, y, z, f, 't', 1.75, c); fxLane(x, z, f, S.len, 1.0, 0.32, c, 1.15, false); fxLane(x, z, f, S.len, S.w, 0.4, [1.5, 1.0, 0.4], 0.14); const ex = x + Math.sin(f) * S.len, ez = z + Math.cos(f) * S.len; emit(ex, Hgt(ex, ez) + 1.2, ez, 12, c, 5, 2, 0.35, 6); ui.sfx('swing', 1, { x, z, wp: who.avatar.look.wp, tag: 'thrust' }); }
  else if (id === 'missile') { emit(x, y + 1.5, z, 10, [1.9, 1.2, 3.2], 2.5, 2, 0.4, -1); if (!mine) for (let i = 0; i < S.n; i++) spawnProj('missile', x, z, f + [0.6, -0.6, 0.15][i % 3], false, 0, { range: S.range * 1.5, speed: S.speed, size: 1, wait: i * S.gap }, pv); }
  else if (id === 'triple') { if (!mine) for (let i = 0; i < S.n; i++) spawnProj('arrow', x, z, f + (i - 1) * 0.04, false, 0, { range: S.range, speed: S.speed, size: 1, wait: i * S.gap }, pv); }
  else if (id === 'flurry') { const one = i => { const last = i === S.n - 1; spawnSlash(x, y, z, f, last ? 'h' : i % 2 ? 'r' : 'l', last ? 1.3 : 1.1, [3.0, 1.5, 1.0]); if (last) emit(x + Math.sin(f) * 2, y + 1.2, z + Math.cos(f) * 2, 14, [3.0, 1.5, 1.0], 6, 3, 0.35, 8); if (dm < 30) ui.sfx('swing', last, { x, z, wp: who.avatar.look.wp }); }; if (mine) one(num(arg, 0)); else for (let i = 0; i < S.n; i++) later(i * S.gap, () => one(i)); }
  else if (id === 'nova') { const c = [1.0, 2.0, 3.2]; fxRing(x, z, 0.5, S.r, 0.4, c); fxRing(x, z, 0.3, S.r * 0.7, 0.55, [0.6, 1.3, 2.4], 0.7); fxDisc(x, z, S.r, 0.35, c, 0.45); fxPillar(x, z, 1.0, 3.6, 0.5, c, who); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, px = x + Math.sin(a) * S.r * 0.8, pz = z + Math.cos(a) * S.r * 0.8; emit(px, Hgt(px, pz) + 0.6, pz, 4, c, 3, 3, 0.5, 2); } if (dm < 25) fx.shake = Math.max(fx.shake, 0.3); ui.sfx('boom', 0, { tag: 'magic', x, z }); }
  else if (id === 'backshot') { fxRing(x, z, 0.4, 2.2, 0.3, [1.4, 2.2, 1.8], 0.6); emit(x, y + 0.3, z, 12, [0.6, 0.55, 0.4], 3, 2, 0.5, 4); if (!mine) spawnProj('arrow', x, z, f, false, 0, { range: S.range, speed: S.speed, size: 1.4, trail: 1, heavy: 1 }, pv); }
  else if (id === 'kick') { const px = x + Math.sin(f) * 1.6, pz = z + Math.cos(f) * 1.6, c = [2.8, 2.4, 1.6]; fxRing(px, pz, 0.3, 1.9, 0.26, c); spawnSlash(x, y - 0.5, z, f, 't', 0.8, c); emit(px, Hgt(px, pz) + 0.9, pz, 16, c, 6, 2.5, 0.35, 8); ui.sfx('block', 'kick', { x, z }); }
}
// 飛行物：fire 火球（命中爆炸）｜blade 飛刃（貫穿）｜bolt 杖的魔力彈｜arrow 箭｜missile 會追蹤的飛彈
// prm：range 射程、speed 速度、size 大小、r 命中後爆開的半徑、pierce 貫穿、heavy／stag／push 打斷與推開、crit 暴擊率倍率、tgt 追蹤的目標、wait 延後出現、skill 是技能（命中不回魔力）、trail 帶光痕
const PROJ_RGB = { fire: [3.2, 1.3, 0.3], bolt: [1.3, 1.7, 3.2], arrow: [2.6, 2.3, 1.5], missile: [1.9, 1.2, 3.2], blade: [1.2, 1.9, 2.8] };
function spawnProj(kind, x, z, f, mine, dmg, prm, pv) {      // pv：其他玩家射的（對打判定用）{ r 射的人, pw 攻擊力 }
  const S = prm || SKILLS[kind], rgb = PROJ_RGB[kind], size = kind === 'bolt' ? 0.6 * (S.size || 1) : kind === 'missile' ? 0.5 : S.size || 1;
  const p = { kind, S, x: x + Math.sin(f) * 0.9, z: z + Math.cos(f) * 0.9, y: Hgt(x, z) + (kind === 'arrow' ? 1.45 : 1.25), f, left: S.range, mine, dmg, hit: new Set(), rgb, tgt: S.tgt || null, wait: S.wait || 0, age: 0, skill: !prm || !!S.skill, ids: [], owner: mine ? me : pv ? pv.r : null, pv: !mine && pv ? pv.pw : null, m: fxBolt(kind === 'blade' || kind === 'arrow' ? kind : 'fire', rgb, size) };
  p.m.m.rotation.y = f; if (p.wait > 0) p.m.m.visible = false; projs.push(p);
  if (!p.wait) ui.sfx(kind === 'fire' ? 'fire' : kind === 'arrow' ? 'arrow' : kind === 'bolt' || kind === 'missile' ? 'cast' : 'swing', kind === 'bolt' || kind === 'missile' ? 'fire' : undefined, { x, z });
}
function projBoom(...a) { fxBegin('boom', ...a); try { projBoom0(...a); } finally { fxEnd(); } }
function projBoom0(p) {
  const S = p.S; fxRing(p.x, p.z, 0.4, S.r, 0.35, p.rgb); fxDisc(p.x, p.z, S.r, 0.32, [3.2, 1.7, 0.5], 0.7); emit(p.x, p.y, p.z, 44, p.rgb, 7, 5, 0.6, 6); if (Math.hypot(p.x - me.x, p.z - me.z) < 22) { fx.shake = Math.max(fx.shake, 0.3); ui.sfx('boom', 0, { tag: 'magic', x: p.x, z: p.z }); }
  if (!p.mine) return; let n = 0;
  for (const v of MV()) if (alive(v) && Math.hypot(v.x - p.x, v.z - p.z) < S.r + MON[v.type].body * v.size) { hitMon(v, p.dmg, { spell: p.kind === 'fire', strong: 1, rgb: p.rgb, skill: p.skill, shot: 1 }); p.ids.push(v.id); n++; }
  if (p.kind !== 'fire' && n) me.counter = 0; if (S.back && n) me.mp = Math.min(D.maxMp, me.mp + S.back);
}
// 火球爆開：範圍內的玩家（自己的 → 火花；別人的 → 自己有沒有在範圍內）
function pvpBoom(p) { const s = { k: 'o', x: p.x, z: p.z, r: p.S.r }; if (p.mine) pvpSparks(s, true); else if (p.pv && inArea(s, me.x, me.z)) pvpHurtMe(p.owner, p.pv, 1, p.x, p.z); }
function updateProjs(dt) {
  const pl = projs.length ? [me, ...remotes.values()] : null;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i], S = p.S;
    if (p.wait > 0) { p.wait -= dt; if (p.wait > 0) continue; p.m.m.visible = true; }
    p.age += dt;
    if (p.tgt) { if (!alive(p.tgt)) p.tgt = null; else if (p.age > 0.1) { const d = angDiff(p.f, Math.atan2(p.tgt.x - p.x, p.tgt.z - p.z)); p.f += clamp(d, -8 * dt, 8 * dt); } }
    let rem = S.speed * (p.kind === 'missile' ? Math.min(1, 0.45 + p.age * 2.2) : 1) * dt, end = false; const sf = Math.sin(p.f), cf = Math.cos(p.f);
    while (rem > 0 && !end) {      // 飛得快的分段前進，才不會穿過目標
      const step = Math.min(rem, 0.8); rem -= step; p.x += sf * step; p.z += cf * step; p.left -= step;
      const o = { x: p.x, z: p.z }; collide(o, 0.25); end = p.left <= 0 || blockedAt(p.x, p.z) || Math.hypot(o.x - p.x, o.z - p.z) > 0.05;
      for (const v of MV()) {
        if (!alive(v) || p.hit.has(v.id)) continue; if (Math.hypot(v.x - p.x, v.z - p.z) > MON[v.type].body * v.size + (p.kind === 'arrow' ? 0.55 : 0.75)) continue; p.hit.add(v.id);
        const through = p.kind === 'blade' || S.pierce;
        if (S.r) { end = true; break; }
        ui.sfx(p.kind === 'arrow' ? 'arrow' : 'hit', p.kind === 'arrow' ? 'hit' : !!S.heavy, { x: v.x, z: v.z, tag: p.kind === 'arrow' ? 'flesh' : p.kind === 'blade' ? null : 'magic' });
        if (p.mine) { hitMon(v, p.dmg, { critMul: S.crit || (p.kind === 'blade' ? 2 : 1), rgb: p.rgb, skill: p.skill, shot: 1, spell: p.kind === 'missile', strong: !!S.heavy, stop: !!(S.heavy || S.stag), dir: [sf, cf] }); if (p.kind !== 'missile') me.counter = 0; if (S.back) me.mp = Math.min(D.maxMp, me.mp + S.back); if (S.heavy || S.stag) p.ids.push(v.id); if (!p.skill) ui.tip('charge', `按住 ${keyOf('heavy')}（或按住 ${keyOf('attack')}）不放可以蓄力，放開使出重攻擊。蓄到一半以上能打斷野獸的預備動作。`); }
        else emit(v.x, p.y, v.z, 8, p.rgb, 5, 3, 0.35, 12);
        if (!through) { end = true; break; }
      }
      if (!end && p.owner) for (const t of pl) {      // 對打：飛行物碰到玩家。被打的是自己 → 判定扣血；自己射的打到別人 → 火花（傷害由對方判定）；旁觀者 → 只有一點火星。同隊、城裡、暫離的穿過去
        const key = t === me ? 'me' : 'p' + t.peer; if (p.hit.has(key) || !pvpPair(p.owner, t) || Math.hypot(t.x - p.x, t.z - p.z) > PVP.body + (p.kind === 'arrow' ? 0.4 : 0.55)) continue; p.hit.add(key);
        if (S.r) { end = true; break; }
        if (t === me) pvpHurtMe(p.owner, p.pv, 1, p.x - sf * 2, p.z - cf * 2, { heavy: !!S.heavy, critMul: S.crit || (p.kind === 'blade' ? 2 : 1) }); else if (p.mine) pvpSpark(t, sf, cf, !!S.heavy); else emit(t.x, p.y, t.z, 8, p.rgb, 5, 3, 0.35, 12);
        ui.sfx('hit', !!S.heavy, { x: t.x, z: t.z, tag: 'pvp' });
        if (!(p.kind === 'blade' || S.pierce)) { end = true; break; }
      }
    }
    p.y = damp(p.y, Math.max(Hgt(p.x, p.z), waterLevel(p.x, p.z)) + (p.kind === 'arrow' ? 1.4 : 1.2), 10, dt); p.m.m.position.set(p.x, p.y, p.z); if (p.kind !== 'blade') p.m.m.rotation.y = p.f;
    if (p.kind === 'arrow') { p.m.trail(clamp((S.range - p.left - 0.6) / 3.4, 0, 1)); if (S.trail && Math.random() < dt * 90) emit(p.x, p.y, p.z, 1, [2.2, 2.0, 1.2], 0.4, 0.2, 0.25, 0); } else if (Math.random() < dt * 70) emit(p.x, p.y, p.z, 1, p.rgb, 0.6, 0.4, 0.3, p.kind === 'fire' ? -2 : 0);
    if (!end) continue;
    if (S.r) { projBoom(p); if (p.owner) pvpBoom(p); } else emit(p.x, p.y, p.z, p.kind === 'arrow' ? 6 : 10, p.kind === 'arrow' ? [1.6, 1.4, 1.0] : p.rgb, 3, 2, 0.3, 4);
    if (p.mine && p.ids.length && (S.heavy || S.stag)) stagEv(p.ids, S.stag || 5, S.push);
    if (p.kind === 'arrow' && !p.hit.size) ui.sfx('arrow', 'hit', { tag: 'dirt', x: p.x, z: p.z });
    fxFree(p.m); projs.splice(i, 1);
  }
  for (let i = laters.length - 1; i >= 0; i--) if (clock >= laters[i][0]) { const fn = laters[i][1]; laters.splice(i, 1); fn(); }
}

/* ============================== 玩家：任務 ============================== */
// 任務資料在 story.js。P.q：a 進行中 { 代號: { o: 各目標的進度, h: 易碎品挨打次數, f: 碎了 } }、d 已完成、u 已發現的隱藏任務、tr 追蹤中、intro 看過開場白
export { QUESTS, NPCS, PLACES };
const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q]));
const TARGETS = [[-3.2, -3.0], [3.4, -2.4], [0, 3.6]];      // 競技場的木靶（位置同 world.js）
export const isNight = () => { const h = nowHour(); return h < 5.6 || h >= 19.4; };
const qDone = id => P.q.d.includes(id);
function unlocked(q) { const u = q.unlock; if (!u) return true; if (u.explore && !M7.unlockOk(u.explore)) return false; /* 0.7：自己走過幾成才接得到 */ if (u.reach) return P.q.u.includes(q.id); if (u.item && !(P.inv[u.item] > 0)) return false; if (u.night && !isNight()) return false; return true; }
export function objProg(q, i) {
  const o = q.objectives[i], a = P.q.a[q.id]; if (!a) return [qDone(q.id) ? o.count : 0, o.count];
  if (o.kind === 'collect') return [Math.min(o.count, P.inv[o.target] || 0), o.count];
  if (o.kind === 'elite' && P.inv[o.target.slice(2)] > 0) return [o.count, o.count];      // 持有戰利品也算
  return [Math.min(o.count, a.o[i] || 0), o.count];
}
const objDone = (q, i) => { const p = objProg(q, i); return p[0] >= p[1]; };
// done 已完成｜ready 目標都完成、可以回報｜active 進行中｜open 可以接｜locked 還不能接
export function qStatus(q) {
  if (typeof q === 'string') q = QBY[q]; if (!q) return 'locked'; if (qDone(q.id)) return 'done';
  if (P.q.a[q.id]) return q.objectives.every((o, i) => objDone(q, i)) ? 'ready' : 'active';
  return (!q.pre || q.pre.every(qDone)) && unlocked(q) ? 'open' : 'locked';
}
const readySet = new Set();
function qRefresh(quiet) {      // 進度有變：剛完成全部目標的任務，提醒回去回報
  for (const id in P.q.a) { const q = QBY[id], rd = qStatus(q) === 'ready'; if (rd && !readySet.has(id)) { readySet.add(id); if (!quiet) { const g = NPCS[q.giver]; ui.toast(`任務「${q.name}」的目標都完成了，回去找${g.title}${g.name}。`); ui.sfx('quest', 'ready'); } } else if (!rd) readySet.delete(id); }
  Store.dirty = true; ui.dirty = true;
}
function qAdvance(q, i, quiet) {
  const a = P.q.a[q.id], o = q.objectives[i]; if (!a || (a.o[i] || 0) >= o.count) return false;
  a.o[i] = (a.o[i] || 0) + 1; ui.log(`任務「${q.name}」：${o.label}` + (o.count > 1 ? `　${a.o[i]} / ${o.count}` : '（完成）')); qRefresh(quiet); return true;
}
function eachObj(fn) { for (const id of Object.keys(P.q.a)) { const q = QBY[id]; if (q) q.objectives.forEach((o, i) => { if (!objDone(q, i)) fn(q, o, i, P.q.a[id]); }); } }
const COND_FAIL = { dodged: '這隻不算：要先閃開牠的攻擊，再擊敗牠。', guarded: '這隻不算：要先擋下牠的攻擊，再擊敗牠。', nohit: '這隻不算：過程中被牠打中了。脫離戰鬥後再試一次。' };
function questKill(v) {
  const key = v.elite ? 'e:' + v.drop : '';
  eachObj((q, o, i) => {
    if (!((o.kind === 'kill' && o.target === v.type) || (o.kind === 'elite' && o.target === key))) return;
    const c = o.cond, ok = c === 'dodged' ? v.qd === v.spawn : c === 'guarded' ? v.qg === v.spawn : c === 'nohit' ? v.qh !== v.spawn : true;
    if (ok) qAdvance(q, i); else ui.toast(COND_FAIL[c]);
  });
}
// 野獸的一招結束後的結果：閃過、擋下、受傷（任務的附加條件用）；miss 是靠閃避讓這一招落空
function questHurt(v, res) {
  if (res === 'dodged' || res === 'miss') v.qd = v.spawn; else if (res === 'blocked' || res === 'parried') v.qg = v.spawn;
  if (res === 'hit' || res === 'broken' || res === 'blocked') v.qh = v.spawn;
  if (res === 'hit' || res === 'broken') for (const id in P.q.a) {
    const q = QBY[id], a = P.q.a[id]; if (a.f || !q.objectives.some((o, i) => o.cond === 'fragile' && !objDone(q, i))) continue;
    a.h = (a.h || 0) + 1; if (a.h > 3) { a.f = 1; ui.toast(`任務「${q.name}」：帶著的東西摔碎了，回去找${NPCS[q.giver].name}重拿一份。`); ui.sfx('deny'); } else ui.toast(`小心，帶著的東西很容易碎：已經挨了 ${a.h} 下，超過 3 下就會碎。`);
    Store.dirty = true; ui.dirty = true;
  }
}
// 蓄滿的重擊打在木靶上（主線「木靶不會還手」）
function questCharge(a) {
  if (a.code !== 8) return;
  eachObj((q, o, i) => {
    if (o.kind !== 'reach' || o.cond !== 'charge') return; const pl = PLACES[o.target]; if (Math.hypot(me.x - pl.x, me.z - pl.z) > pl.r + 4) return;
    const t = TARGETS.find(t => Math.hypot(t[0] - me.x, t[1] - me.z) < a.A.range + 1.4 && Math.abs(angDiff(me.f, Math.atan2(t[0] - me.x, t[1] - me.z))) < 1.2); if (!t) { ui.toast('這一下沒打到木靶。再靠近一點、面向木靶再放。'); return; }
    if (a.k < 0.98) { ui.toast('還沒蓄滿。按住重攻擊，等身上的光變亮、聽到提示聲再放開。'); return; }
    const y = Hgt(t[0], t[1]); popNumber(t[0], y + 3, t[1], '蓄力重擊', 'perfect'); emit(t[0], y + 1.4, t[1], 26, [3, 2.2, 0.8], 7, 4, 0.5, 10); fx.shake = Math.max(fx.shake, 0.4); ui.sfx('parry'); qAdvance(q, i);
  });
}
// 棕熊威嚇完、沒有打起來就作罷（主線「四種脾氣」）
function questWarned(v) { if (ledgerMine(mkey(v)) > 0 || v.qh === v.spawn || !me.alive) return; eachObj((q, o, i) => { if (o.cond === 'warned') { qAdvance(q, i); if (o.say) ui.narrate(o.say); } }); }
// 每隔一小段時間檢查：抵達地點、發現隱藏任務
let reachT = 0, nightTip = false;
function questReach(dt) {
  reachT -= dt; if (reachT > 0 || !me.alive) return; reachT = 0.3;
  const at = id => { const pl = PLACES[id]; return pl && Math.hypot(me.x - pl.x, me.z - pl.z) < pl.r; };
  eachObj((q, o, i) => {
    if (o.kind !== 'reach' || o.cond === 'charge' || o.cond === 'warned' || /^do/.test(o.cond) || !at(o.target)) return;
    if (o.cond === 'night' && !isNight()) { if (!nightTip) { nightTip = true; ui.narrate(['水面很平靜，只映著天光。也許該等到夜裡再來。']); } return; }
    qAdvance(q, i); if (o.say) ui.narrate(o.say);
  });
  for (const q of QUESTS) { const u = q.unlock; if (!u || !u.reach || P.q.u.includes(q.id) || qDone(q.id) || P.q.a[q.id] || (q.pre && !q.pre.every(qDone)) || !at(u.reach) || (u.night && !isNight())) continue; P.q.u.push(q.id); if (u.note) ui.narrate([u.note]); ui.sfx('quest', 'found'); Store.dirty = true; ui.dirty = true; }
}
// 教學任務的「做到某個操作」：cond 以 do 開頭的目標（doLock 鎖定｜doStep 快閃｜doBack 後撤步｜doRoll 翻滾｜doSprint 衝刺攻擊｜doStop 打斷預備動作｜doSkill 施放技能）
function questAct(c) { eachObj((q, o, i) => { if (o.cond === c && qAdvance(q, i) && o.say && objDone(q, i)) ui.narrate(o.say); }); }      /* X10：do 目標完成時播它的 say */
export function acceptQuest(id) {
  const q = QBY[id]; if (!q || qStatus(q) !== 'open') return false;
  P.q.a[id] = { o: q.objectives.map(() => 0) }; if (P.q.tr.length < 3) P.q.tr.push(id); if (q.teach) for (const r of q.teach) Craft.learn(r); if (q.give) for (const g in q.give) if (ITEMS[g] && !(P.inv[g] > 0)) addItem(g, q.give[g]);      /* X10：接下時給的東西（s11 瑪歌的骨頭、s17 漿果；身上已經有就不給） */      // 0.6：要用配方做東西的任務，接下時就教（story.js 的 teach）
  ui.log(`接下任務「${q.name}」。按 ${keyOf('quest')} 開啟任務日誌。`); ui.sfx('quest', 'accept'); qRefresh(true); return true;
}
function grantGift(list) { if (list.length === 1) { addItem('orb_' + list[0]); return; } if (P.gift) P.giftQ.push(list.slice()); else P.gift = list.slice(); }
// 回報：扣掉蒐集品、發獎勵。回傳獎勵清單（文字與圖示代號），沒有成功回傳 null
export function turnInQuest(id) {
  const q = QBY[id]; if (!q || qStatus(q) !== 'ready') return null; const R = q.rewards, got = [], icons = [];
  q.objectives.forEach(o => { if (o.kind === 'collect') { P.inv[o.target] -= o.count; if (P.inv[o.target] <= 0) delete P.inv[o.target]; } });
  delete P.q.a[id]; readySet.delete(id); P.q.d.push(id); P.q.tr = P.q.tr.filter(t => t !== id);
  if (R.gold) { P.gold += R.gold; got.push(R.gold + ' 金幣'); icons.push('gold'); }
  for (const it in R.items) { addItem(it, R.items[it]); got.push(ITEMS[it].name + ' ×' + R.items[it]); icons.push(it); }
  { const rec = Craft.onQuestDone(id, R.recipes); if (rec.length) { got.push('配方：' + rec.map(r => ITEMS[r].name).join('、')); icons.push(rec[0]); } }      // 0.6：任務教的配方（data06.js 的 RECIPES[].src.quest，或任務獎勵的 recipes）
  const orbs = (R.orbChoice || []).filter(o => SKILLS[o]); if (orbs.length) { grantGift(orbs); got.push(orbs.length > 1 ? '天賦球一顆（自選）' : ITEMS['orb_' + orbs[0]].name); icons.push('orb_' + orbs[0]); }
  ui.loot(`任務「${q.name}」完成` + (got.length ? '：' + got.join('、') : ''), icons); ui.log(`完成任務「${q.name}」。`); ui.sfx('quest', 'done'); gainExp(R.exp, me.x, me.z);
  if (orbs.length > 1) ui.log(`有一顆天賦球等你挑。按 ${keyOf('skills')} 開啟技能視窗。`);
  if (QUESTS.every(x => x.type !== 'main' || qDone(x.id)) && q.type === 'main') ui.log('第一層的主線任務已全部完成。獸王討伐將在下一版開放。');
  qRefresh(true); return { got, icons, gift: orbs.length > 1 };
}
export function trackQuest(id, on) { const t = P.q.tr.filter(x => x !== id); if (on && P.q.a[id]) { if (t.length >= 3) { ui.toast('最多同時追蹤三個任務'); return false; } t.push(id); } P.q.tr = t; Store.dirty = true; ui.dirty = true; return true; }
// 與 NPC 開始交談時：完成「找他談」的目標，回傳要播的對白 [{ q, pages, note }]；找發任務的人談的目標要等其他目標都完成
export function talkTo(npcId) {
  const out = [];
  for (const id of Object.keys(P.q.a)) {
    const q = QBY[id], a = P.q.a[id];
    if (a.f && q.giver === npcId) { a.f = 0; a.h = 0; out.push({ q, note: `${NPCS[npcId].name}看了一眼碎掉的罐子，沒說什麼，重新包了一份給你。` }); Store.dirty = true; }
    q.objectives.forEach((o, i) => {
      if (o.kind !== 'talk' || o.target !== npcId || objDone(q, i)) return;
      if (npcId === q.giver && !q.objectives.every((x, j) => j === i || objDone(q, j))) return;
      if (o.cond === 'allocated' && P.pts > 0) { out.push({ q, note: `（還有 ${P.pts} 點能力點數沒分配。按 ${keyOf('char')} 配好再來。）` }); return; }
      if (o.cond === 'fragile' && a.f) { out.push({ q, note: `（懷裡的東西已經碎了，得回去找${NPCS[q.giver].name}重拿一份。）` }); return; }
      a.o[i] = o.count; ui.log(`任務「${q.name}」：${o.label}（完成）`); out.push({ q, pages: o.say || null });
    });
  }
  if (out.length) qRefresh(true); return out;
}
// 這位 NPC 頭上的標記：turnin 可以回報｜talk 任務要找他談｜offer 有任務可接（hidden：只有隱藏任務，地圖上不標）
export function npcMark(npcId) {
  let offer = '', talk = false;
  for (const q of QUESTS) {
    const s = qStatus(q);
    if (q.giver === npcId) { if (s === 'ready') return 'turnin'; if (s === 'open') offer = offer === 'offer' || q.type !== 'hidden' ? 'offer' : 'hidden'; }
    if (s === 'active') q.objectives.forEach((o, i) => { if (o.kind === 'talk' && o.target === npcId && !objDone(q, i) && (npcId !== q.giver || q.objectives.every((x, j) => j === i || objDone(q, j)))) talk = true; });
  }
  return talk ? 'talk' : offer;
}
export function seenIntro() { if (P.q.intro) return true; P.q.intro = 1; Store.dirty = true; return false; }
function loadQuests(d) {
  const q = { a: {}, d: [], u: [], tr: [], intro: 0 }; P.q = q; readySet.clear(); if (!d || typeof d !== 'object') return;
  if (Array.isArray(d.d)) q.d = [...new Set(d.d.filter(id => QBY[id]))]; if (Array.isArray(d.u)) q.u = [...new Set(d.u.filter(id => QBY[id] && QBY[id].unlock))];
  if (d.a && typeof d.a === 'object') for (const id in d.a) { const Q = QBY[id], a = d.a[id]; if (!Q || q.d.includes(id) || !a || typeof a !== 'object') continue; q.a[id] = { o: Q.objectives.map((o, i) => clamp(num(Array.isArray(a.o) ? a.o[i] : 0, 0) | 0, 0, o.count)) }; if (a.h > 0) q.a[id].h = a.h | 0; if (a.f) q.a[id].f = 1; }
  if (Array.isArray(d.tr)) q.tr = [...new Set(d.tr.filter(id => q.a[id]))].slice(0, 3); q.intro = d.intro ? 1 : 0;
  for (const id in q.a) if (qStatus(QBY[id]) === 'ready') readySet.add(id);
}

/* ============================== 玩家：買賣、互動 ============================== */
export function buy(id) { const it = ITEMS[id]; if (!it || !it.buy) return; if (room(id) < 1 || (it.teach && Craft.knows(it.teach))) { ui.toast(it.teach ? '已經會做了' : it.once ? '已經有了' : '帶不下了'); ui.sfx('deny'); return; } if (P.gold < it.buy) { ui.toast('金幣不夠'); ui.sfx('deny'); return; } P.gold -= it.buy; addItem(id); ui.sfx('buy'); questAct('doBuy:' + id); }
export function sell(id, all) { const it = ITEMS[id], n = all ? P.inv[id] : 1; if (!it || !it.sell || !(P.inv[id] > 0)) return; P.inv[id] -= n; if (P.inv[id] <= 0) delete P.inv[id]; P.gold += it.sell * n; Store.dirty = true; ui.dirty = true; ui.sfx('sell'); }
export function interact() {
  if (T7.interact()) return;      // 0.7：夾住時連按掙脫、幫別人掰開、拆陷阱
  if (!input.started || !me.alive || input.talk) return;
  if (Q8.interact()) return;      /* X10：任務的觸發物（名牌、礦車、鹽壁、北關的門與絞盤、獵臺、小猩猩、栗子） */
  if (me.sit) { Needs.stand(); ui.craft(null); return; }      // 坐著：起身
  if (me.seatGo) { me.seatGo = null; return; }      // 正走向座位：再按一次就不坐了
  if (Fish.interact(true)) return;      // 0.7：拿著釣竿時，互動鍵是換餌、收線
  { const c = campFirst(); if (c) { const s = !me.combat && !me.swim && !me.atk && !me.dodge && !me.cast && !me.drink ? seatFor(c) : null;      // 0.6：營火（坐下休息，順便可以料理）。有空的座位就先走過去再坐
    if (s && Math.hypot(s.x - me.x, s.z - me.z) > 0.3) { me.seatGo = { c, s, t: 0 }; me.atk = null; me.charge = null; me.queued = false; me.guard = false; return; }
    if (Needs.sit(c)) ui.craft('cook', { camp: c }); return; } }
  if (B7.near() && !me.combat) { B7.open(); return; }      // 0.7：酒館門口的委託板
  if (M7.interact()) return;      // 0.7：繪圖桌比芬恩近時，按互動＝用繪圖桌（w7-map）
  let best = null, bd = 3.4; for (const n of npcs) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < bd) { bd = d; best = n; } }
  if (best) { me.atk = null; me.charge = null; me.queued = false; me.guard = false; me.vx = me.vz = 0; me.f = Math.atan2(best.x - me.x, best.z - me.z); ui.talk(best); return; }
  for (const w of winches) if (Math.hypot(w.x - me.x, w.z - me.z) < 3.2) { const other = [...remotes.values()].some(r => winches.some(o => o !== w && Math.hypot(o.x - r.x, o.z - r.z) < 3.2)); ui.sfx(other ? 'gate' : 'winch', 0, { x: w.x, z: w.z }); ui.toast(other ? '兩座絞盤都有人了。閘門震了一下，獸王討伐將在下一版開放。' : '絞盤紋風不動。需要另一名玩家同時轉動對面那座。'); return; }
  { const r = nearPlayer(); if (r && ivIn && ivIn.peer === r.peer) { answerInvite(true); return; } if (r && !Gather.hint()) { invitePlayer(r); return; } }      // 對方邀請過我：按互動＝接受      // 0.6：走到其他玩家旁邊按互動＝邀請組隊（身邊有能採的東西時先採）
  if (!Fish.interact()) Gather.start();      // 0.6：採集；0.7：在水邊、身邊沒有能採的東西時拿出釣竿（fish07.js）
}

/* ============================== 玩家：每幀 ============================== */
// 弓與法杖（CHARGE.aim）蓄滿後不會自己放出，一直瞄準到放開才出手。撐過 CHARGE.max 秒開始每秒耗 CHARGE.drain 點體力（留著放出這一下要的體力）；體力撐不住時蓄力每秒流失 CHARGE.sag，最低 CHARGE.floor（弓弦慢慢鬆回去，威力變弱）
function holdK(c, set, dt) {
  const k = clamp(c.t / c.full, 0, 1); if (c.t < CHARGE.max) return k;
  const keep = val(HEAVY[set].cost, 1) * D.stCost * M6.act;
  if (me.st > keep) { me.st = Math.max(keep, me.st - CHARGE.drain * D.stCost * dt); ui.tip('aimhold', `弓與法杖蓄滿後不會自己放出，放開按鍵才出手。撐超過 ${CHARGE.max} 秒會開始消耗體力；體力撐不住時，蓄力會慢慢流失、威力變弱。`); }
  else { c.sag = Math.min(1 - CHARGE.floor, (c.sag || 0) + CHARGE.sag * dt); if (!c.tired) { c.tired = 1; ui.toast(set === 'bow' ? '手臂撐不住了，弓弦慢慢鬆回去' : '魔力聚不住了，蓄力慢慢散去'); } }
  return k - (c.sag || 0);
}
function updateMe(dt) {
  const y = Hgt(me.x, me.z), set = setOf(me.avatar), dec = k => { me[k] = Math.max(0, me[k] - dt); };
  me.zone = zoneAt(me.x, me.z); me.inSafe = me.zone === 'town' && !(X8.on && X8.on()); /* 0.8：試煉中、在沙地上的挑戰者不算安全區（trial08 的 X8.on） */ me.combat = inCombat();
  me.flash = Math.max(0, me.flash - dt * 4); for (const k of ['iframe', 'dodgeI', 'dodgeCd', 'comboT', 'potCd', 'dashWin', 'counter', 'stun', 'stDelay']) dec(k); me.cwin = Math.max(0, (me.cwin || 0) - rdt); me.itemCd = 4 * me.potCd / (me.potCdMax || 1); updateLock();      // cwin：反擊窗口照真實時間倒數（命中停頓不會把它拉長）
  aimT = set === 'bow' && input.cam.mode === 'tps' && me.alive && (me.charge || (me.atk && me.atk.A.arrow) || (me.cast && me.cast.S.wp === 'bow')) ? 1.1 : Math.max(0, aimT - dt);
  for (const k in me.cds) if (me.cds[k] > 0) me.cds[k] = Math.max(0, me.cds[k] - dt);
  me.buff.wall = Math.max(0, me.buff.wall - dt); me.buff.warcry = Math.max(0, me.buff.warcry - dt);
  if (!me.alive) {
    me.deadT += dt; me.speed01 = 0;
    if (me.deadT > 3.6) { me.alive = true; me.deadT = 0; me.swim = false; me.combo = 0; me.lightN = 0; me.hp = D.maxHp; me.st = D.maxSt; me.mp = D.maxMp; me.x = WORLD.SPAWN[0]; me.z = WORLD.SPAWN[1]; me.f = Math.PI; me.kx = me.kz = me.vx = me.vz = 0; me.iframe = 1.5; me.regenLeft = 0; me.potCd = 0; me.buff.wall = me.buff.warcry = 0; me.counter = 0; ui.dead(-1); emit(me.x, meY() + 1, me.z, 30, [0.5, 2.2, 1.9], 3, 3, 0.9, 0); }
    return;
  }
  // 水：淺水涉水（變慢）；水深過脖子就游泳——浮在水面、移動更慢，不能攻擊、閃避、格擋、施放技能；離開深水自動恢復
  const wd = waterDepth(me.x, me.z), neck = WATER.neck * me.avatar.look.h / 100, swim = me.swim ? wd > neck - 0.14 : wd > neck;
  if (swim && !me.swim) { me.drink = null; me.atk = null; me.charge = null; me.cast = null; me.dodge = null; me.queued = false; me.guard = false; me.dashWin = 0; me.sprinting = false; emit(me.x, y + wd, me.z, 14, [0.8, 0.95, 1.1], 2.6, 2.4, 0.5, 9); ui.tip('swim', '水深過脖子會改成游泳：移動變慢，而且不能攻擊、閃避、格擋與施放技能。回到淺水就會站起來。'); }
  me.swim = swim; me.wet = wd;
  const free = input.started && !input.typing && !input.creator && !input.talk; let ix = 0, iz = 0;
  if (free && me.stun <= 0 && !T7.held()) [ix, iz] = moveVec();      // 0.7：被捕獸夾夾住不能走
  if ((ix || iz) && (me.sit || me.craft)) { Needs.stand(); Craft.cancel(); }      // 坐著、製作中：一移動就起身（中斷）
  if (input.atkHeld || input.heavyHeld || input.guard) Needs.stand();
  { const gd = me.gather && free && me.stun <= 0 ? Gather.drive() : null; if (gd) { ix = gd[0] * 0.62; iz = gd[1] * 0.62; } }      // 連續採集：自己走向下一株
  if (me.seatGo) { const G = me.seatGo, c = G.c, s = G.s; G.t += dt;      // 走向營火的座位：繞著火走（直線會穿過火堆時先沿著圓弧），到了才坐下；自己一動、出手、進入戰鬥就取消
    if (ix || iz || !free || me.atk || me.dodge || me.cast || me.drink || me.combat || swim || input.atkHeld || input.heavyHeld || input.guard) me.seatGo = null;
    else { const dx = s.x - me.x, dz = s.z - me.z, d = Math.hypot(dx, dz);
      if (d < 0.14 || G.t > 2.6 || (G.t > 0.4 && d < 0.35 && Math.hypot(me.vx, me.vz) < 0.4)) { me.seatGo = null; me.vx = me.vz = 0; if (Needs.sit(c)) ui.craft('cook', { camp: c }); }
      else { const rc = Math.hypot(me.x - c.x, me.z - c.z), rs = Math.hypot(s.x - c.x, s.z - c.z), a0 = Math.atan2(me.x - c.x, me.z - c.z), da = angDiff(a0, Math.atan2(s.x - c.x, s.z - c.z)); let tx = s.x, tz = s.z;
        if (Math.abs(da) > 0.45) { const a = a0 + Math.sign(da) * 0.45, r = Math.max(rs, Math.min(rc, rs + 0.6)); tx = c.x + Math.sin(a) * r; tz = c.z + Math.cos(a) * r; }
        const ex = tx - me.x, ez = tz - me.z, el = Math.hypot(ex, ez) || 1, k = clamp(d / 0.9, 0.22, 0.42); ix = ex / el * k; iz = ez / el * k; } } }
  const il = Math.hypot(ix, iz), busy = !!(me.atk || me.dodge || me.cast || me.rush || me.drink || me.sit || me.craft || me.fish || (me.gather && !me.gather.walk)) || me.stun > 0;
  // 格擋：按住期間舉盾（或架起武器），面向瞄準方向
  const g = free && input.guard && !busy && !me.charge && !swim; if (g && !me.guard) me.guardT = 0; me.guard = g; if (g) me.guardT += dt;
  // 蓄力：輕攻擊鍵按住超過一小段時間開始蓄力；重攻擊鍵一按就開始。放開使出重攻擊（重攻擊鍵輕點＝不蓄力的重攻擊）
  me.holdT = free && input.atkHeld ? me.holdT + dt : 0;
  if (!me.charge && me.holdT >= CHARGE.hold && !busy && !me.guard && me.st > 4 && !swim) me.charge = { t: 0, k: 0, full: HEAVY[set].full / D.atkSpeed, ding: false };
  if (me.charge) {
    const c = me.charge; fxCharge(me, c.k); c.t += dt; c.k = CHARGE.aim && CHARGE.aim[set] ? holdK(c, set, dt) : clamp(c.t / c.full, 0, 1); me.stDelay = Math.max(me.stDelay, 0.3);
    if (Math.random() < dt * 34) emitGather(me.x, y + 0.5, me.z, 1, c.k >= 1 ? [3, 2.2, 0.8] : [1.5, 1.1, 0.6], 1.5);
    if (!c.snd && c.t >= 0.14) { c.snd = 1; ui.sfx('charge', set); }
    if (c.k >= 1 && !c.ding) { c.ding = true; ui.sfx('charged'); fxRing(me.x, me.z, 1.8, 0.4, 0.25, [3, 2.2, 0.8]); }
    if (!(c.key ? input.heavyHeld : input.atkHeld) || !free || (c.t >= CHARGE.max && !(CHARGE.aim && CHARGE.aim[set]))) { me.charge = null; if (c.key || c.t >= CHARGE.min) startAttack(HEAVY[set], 8, c.key && c.t < 0.14 ? 0 : c.k); }
  }
  // 衝刺：按住時跑得更快、持續消耗體力；體力用完就回到一般的跑步
  const wasSp = me.sprinting; me.sprinting = free && input.sprint && il > 0 && !busy && !me.guard && !me.charge && !swim && (wasSp ? me.st > 0.5 : me.st >= SPRINT.min);
  if (wasSp && !me.sprinting && me.st <= 0.5) pantMe(true); else if (me.hp < D.maxHp * PANT.low) pantMe(false);      // d7-snd-code：喘氣
  if (me.sprinting) { me.sprintT += dt; me.st = Math.max(0, me.st - SPRINT.cost * D.stCost * (M6.dsSt || 1) * dt); me.stDelay = Math.max(me.stDelay, 0.35); if (Math.random() < dt * 14) emit(me.x, y + 0.1, me.z, 1, [0.5, 0.44, 0.3], 1.2, 0.8, 0.4, 2); } else if (!busy) me.sprintT = 0;
  const lk = lockOk(me.lock) ? me.lock : null, lockF = lk ? Math.atan2(lk.x - me.x, lk.z - me.z) : 0, turn = me.guard || me.charge || (lk && !me.sprinting);      // turn：面向目標（或瞄準方向），移動不轉身
  let sp = 7.2 * D.speedMul * (M6.move || 1); if (me.atk || me.cast) sp *= 0.3; else if (me.drink) sp *= POTION.move; else if (me.charge) sp *= CHARGE.move; else if (me.guard) sp *= GUARD.move; else if (me.sprinting) sp *= SPRINT.mul;
  else if (lk && il) sp *= lerp(1, LOCK.back, clamp(-(ix * Math.sin(me.f) + iz * Math.cos(me.f)), 0, 1));      // 鎖定中倒退走比較慢
  if (swim) sp *= 0.48; else if (wd > WATER.wade) sp *= lerp(1, 0.6, clamp((wd - WATER.wade) / (neck - WATER.wade), 0, 1));
  if (me.rush) {      // 疾步斬的突進：沿途的野獸各受一次傷害
    const r = me.rush; r.t += dt; me.vx = r.dx * r.v; me.vz = r.dz * r.v;
    for (const v of MV()) { if (!alive(v) || r.hit.has(v.id)) continue; if (Math.hypot(v.x - me.x, v.z - me.z) < r.S.w / 2 + MON[v.type].body * v.size) { r.hit.add(v.id); hitMon(v, r.S.dmg * D.dmgMul, { strong: 1, rgb: [0.9, 2.4, 1.1] }); fx.hitstop = Math.max(fx.hitstop, 0.04); } }
    for (const o of remotes.values()) { if (r.hit.has(o.peer) || !pvpPair(me, o) || Math.hypot(o.x - me.x, o.z - me.z) >= r.S.w / 2 + PVP.body) continue; r.hit.add(o.peer); pvpSpark(o, r.dx, r.dz, true); ui.sfx('hit', 1, { x: o.x, z: o.z, tag: 'pvp' }); }      // 對打：突進途中擦過的玩家
    if (r.t >= r.dur) { me.rush = null; me.vx = me.vz = 0; if (r.hit.size) me.counter = 0; const len = Math.hypot(me.x - r.x0, me.z - r.z0), f = Math.atan2(r.dx, r.dz); skillFx('dash', me, r.x0, r.z0, f, r1(len), true); sendEv(['s', SKILLS.dash.i, r1(r.x0), r1(r.z0), r2(f), r1(len), ...(r.pw || [])]); me.dashWin = 0.4; }
  }
  else if (me.dodge) {      // 位移用積分算，先快後慢，總距離不受畫面更新率影響
    const d = me.dodge, F = q => 1.6 * q - 0.6 * q * q, p0 = d.t / d.dur; d.t += dt; const p = d.t / d.dur, v = d.G.dist * D.speedMul * (F(Math.min(1, p)) - F(p0)) / Math.max(dt, 1e-4); me.vx = d.dx * v; me.vz = d.dz * v; if (p >= 1) { me.dodge = null; me.dodgeCd = 0.14; me.dashWin = d.G.win; me.dashKind = d.kind === 'back' ? 'back' : 'dodge'; me.vEnd = 0.3; if (me.queued) { const q = me.queued; me.queued = false; if (q === 'H') tryHeavy(); else tryAttack(); } } }
  else if ((me.atk && me.atk.lunge > 0 && me.atk.t < me.atk.lt) || (me.cast && me.cast.lunge > 0 && me.cast.t < me.cast.lt)) {      // 招式裡的突進：先快後慢，在命中前到位
    const a = me.atk && me.atk.lunge > 0 ? me.atk : me.cast, F = q => 1.6 * q - 0.6 * q * q, v = a.lunge * (F(Math.min(1, (a.t + dt) / a.lt)) - F(a.t / a.lt)) / Math.max(dt, 1e-4); me.vx = a.ldx * v; me.vz = a.ldz * v;
  }
  else { me.vx = damp(me.vx, ix * sp, 16, dt); me.vz = damp(me.vz, iz * sp, 16, dt); }
  me.kx = damp(me.kx, 0, 9, dt); me.kz = damp(me.kz, 0, 9, dt);
  // 與野獸互相推開：重疊時慢慢被擠出去（翻滾、快閃的無敵期間與突進途中可以穿過去）。推開的位移一樣經過 tryMove，所以不會被推進牆裡或推上陡坡
  let pvx = 0, pvz = 0;
  if (!me.dodge && !me.rush && !swim) {
    for (const v of MV()) { if (!alive(v)) continue; const br = MON[v.type].body * v.size, dx = me.x - v.x - Math.sin(v.f) * br * PUSH.fwd, dz = me.z - v.z - Math.cos(v.f) * br * PUSH.fwd; if (dx > 4.5 || dx < -4.5 || dz > 4.5 || dz < -4.5) continue; const d = Math.hypot(dx, dz), m = br * PUSH.body + PUSH.r; if (d >= m) continue; const k = (m - d) * (v.st === MST.WIND || v.st === MST.STRIKE ? 1 : 0.5), ux = d > 0.05 ? dx / d : Math.sin(v.f), uz = d > 0.05 ? dz / d : Math.cos(v.f); pvx += ux * k; pvz += uz * k; }
    const pl = Math.hypot(pvx, pvz) * PUSH.k; if (pl > 0) { const c = Math.min(pl, PUSH.max) / pl * PUSH.k; pvx *= c; pvz *= c; }
    // 0.6 軟碰撞：站不進別的玩家身體裡——重疊時把自己往外推（只推自己、不同步，兩邊各推各的）；推力有上限（比走路慢），硬要走還是擠得過去，不會被人卡住
    { const C = PVP.soft; let qx = 0, qz = 0; for (const r of remotes.values()) { if (!r.alive) continue; const dx = me.x - r.x, dz = me.z - r.z; if (dx > 2 || dx < -2 || dz > 2 || dz < -2) continue; const d = Math.hypot(dx, dz); if (d >= C.r) continue; const k = (C.r - d) * C.k; qx += (d > 0.02 ? dx / d : -Math.sin(me.f)) * k; qz += (d > 0.02 ? dz / d : -Math.cos(me.f)) * k; }
      const ql = Math.hypot(qx, qz); if (ql > C.max) { qx *= C.max / ql; qz *= C.max / ql; } pvx += qx; pvz += qz; }
  }
  // 陡坡站不住：順著坡往下滑（往上走不上去是 tryMove 擋的），滑的時候身體轉向下坡
  const g0 = slopeAt(me.x, me.z), steep = !swim && g0.s > SLOPE.slide;
  me.slide = damp(me.slide || 0, steep ? 3.6 + 5.5 * clamp((g0.s - SLOPE.slide) / 0.7, 0, 1) : 0, steep ? 4 : 10, dt); me.slideK = clamp((me.slide - 0.6) / 2.4, 0, 1);
  if (steep) { me.sdx = -g0.x / g0.s; me.sdz = -g0.z / g0.s; if (Math.random() < dt * 26) emit(me.x, y + 0.15, me.z, 1, [0.55, 0.47, 0.34], 1.6, 0.8, 0.5, 2); }
  const sv = me.slide > 0.05 ? me.slide : 0, x0 = me.x, z0 = me.z; me.climb = undefined;
  tryMove(me, me.x + (me.vx + me.kx + pvx + (me.sdx || 0) * sv) * dt, me.z + (me.vz + me.kz + pvz + (me.sdz || 0) * sv) * dt, 0.5);
  for (const n of npcs) { const dx = me.x - n.x, dz = me.z - n.z, d = Math.hypot(dx, dz), m = 0.95; if (d < m) { if (d > 1e-4) { me.x = n.x + dx / d * m; me.z = n.z + dz / d * m; } else { me.x = n.x + Math.sin(n.f || 0) * m; me.z = n.z + Math.cos(n.f || 0) * m; } } }      // NPC 有身體：不能穿過去（0.95 ＝ 玩家 0.5＋NPC 0.45）
  // 爬坡的樣子：world.js 的 tryMove 寫 me.climb（0–1，相對這裡能爬的最陡；擋住爬不上去時回到 0）與 me.climbDir。畫面上開根號放大（中等坡度也看得出在爬）；
  // tryMove 沒寫（舊版 world.js）時用腳下坡度與移動方向估一個。下坡煞車一律用估的
  { const g1 = slopeAt(me.x, me.z), v = Math.hypot(me.vx, me.vz), mv = Math.hypot(me.x - x0, me.z - z0) / Math.max(dt, 1e-4), al = v > 0.8 && mv > 0.5 && !swim ? (me.vx * g1.x + me.vz * g1.z) / v : 0;
    const cv = me.climb === undefined ? climbOf(al) : Math.min(1, Math.sqrt(clamp(me.climb, 0, 1)) * 1.25); if (me.climb === undefined) { me.climb = climbOf(al); me.climbDir = Math.atan2(g1.x, g1.z); }
    me.climbK = damp(me.climbK || 0, busy || me.dodge || swim ? 0 : cv, 6, dt); me.descK = damp(me.descK || 0, busy || me.dodge || me.slideK > 0.3 ? 0 : descOf(al), 6, dt); slopeDust(me, dt); }
  if (me.vEnd) { me.vx *= me.vEnd; me.vz *= me.vEnd; me.vEnd = 0; }      // 閃避最後一格：位移走完才減速（原本先減速，畫面更新慢的時候會少走一截）
  me.speed01 = me.dodge || me.rush || (me.atk && me.atk.lunge > 0) || (me.cast && me.cast.lunge > 0) ? 0 : clamp(Math.min(Math.hypot(me.vx, me.vz), Math.hypot(me.x - x0, me.z - z0) / Math.max(dt, 1e-4) + 1.6) / 7.2, 0, 1);      // 被牆或陡坡擋住時腳步跟著慢下來，不會原地全速跑
  if (me.guard || me.charge) me.f = dampAng(me.f, aimAngle(HEAVY[set].range || 5.5, set === 'bow' || set === 'staff'), 14, dt); else if (!busy && me.slideK > 0.5) me.f = dampAng(me.f, Math.atan2(me.sdx, me.sdz), 7, dt); else if (lk && !me.sprinting && !swim) { if (!busy) me.f = dampAng(me.f, lockF, 14, dt); else if (me.atk && me.atk.t < me.atk.hit * 0.8) me.f = dampAng(me.f, lockF, 7, dt); } else if (!busy && il) me.f = dampAng(me.f, Math.atan2(ix, iz), swim ? 7 : 16, dt);
  // 面向不跟著移動方向時（鎖定、格擋、蓄力）：把移動方向換成相對於面向的前後左右，步伐才會是平移與倒退
  if (turn && !busy && !swim && me.speed01 > 0.12) { const vl = Math.hypot(me.vx, me.vz) || 1, sf = Math.sin(me.f), cf = Math.cos(me.f); me.mv = [(me.vx * sf + me.vz * cf) / vl, (me.vx * cf - me.vz * sf) / vl]; } else me.mv = null;
  // 在水裡移動：濺起水花、帶出漣漪
  if (wd > 0.12) { const v = Math.hypot(me.vx, me.vz); if (v > 1 && Math.random() < dt * (swim ? 16 : 10)) emit(me.x + (Math.random() - 0.5) * 0.7, y + wd + 0.05, me.z + (Math.random() - 0.5) * 0.7, 1, [0.8, 0.95, 1.1], 1.3, 1.5, 0.4, 8); }
  if (me.atk) {
    const a = me.atk; a.t += dt;
    while (a.hi < a.hits.length && a.t >= a.hits[a.hi][0] && me.atk === a) doHit(a, a.hi++);
    a.done = a.hi > 0;
    if (a.t >= a.dur && me.atk === a) {
      me.atk = null; const n = COMBOS[set].list.length;
      if (a.code < 8) { const end = a.code === n - 1; me.combo = (a.code + 1) % n; me.comboT = end ? 0 : COMBO_WIN; me.lightN = end ? 0 : a.code + 1; } else { me.combo = 0; me.comboT = 0; me.lightN = 0; }
      if (me.queued) { const q = me.queued; me.queued = false; if (q === 'H') tryHeavy(); else tryAttack(); }
    }
  }
  if (me.cast) { const c = me.cast, n = c.S.n || 1; c.t += dt; while (c.n < n && c.t >= c.at + c.n * (c.S.gap || 0) * c.k && me.cast === c) { c.n++; c.fired = true; fireSkill(c, c.n - 1); } if (c.t >= c.dur && me.cast === c) me.cast = null; }
  if (me.drink) { const k = me.drink; k.t += dt; if (k.t >= k.dur) { me.drink = null; if (k.done) k.done(); else drinkDone(k.id); } }
  if (me.stDelay <= 0 && !me.guard) me.st = Math.min(D.maxSt, me.st + 27 * (me.buff.warcry > 0 ? 1.5 : 1) * M6.stRegen * dt);
  me.mp = Math.min(D.maxMp, me.mp + D.mpRegen * (me.inSafe ? 3 : 1) * dt);
  if (me.regenLeft > 0) { const h = Math.min(me.regenLeft, (me.regenRate || 6) * dt); me.regenLeft -= h; me.hp = Math.min(D.maxHp, me.hp + h); }
  if (me.inSafe && !H8.fn.noSafe()) me.hp = Math.min(D.maxHp, me.hp + D.maxHp * 0.06 * dt); /* 0.8：對決中（沙地在城裡）不吃安全區回血（duel08 的 noSafe 掛鉤） */ else if (clock - me.lastCombat > 6) me.hp = Math.min(D.maxHp, me.hp + D.maxHp * (0.008 + M6.ooc) * dt);
  // 撿回遺落的金幣
  if (P.bag) { if (Date.now() > P.bag.until) { P.bag = null; Store.dirty = true; } else if (Math.hypot(P.bag.x - me.x, P.bag.z - me.z) < 1.8) { P.gold += P.bag.gold; ui.sfx('coin'); ui.loot('撿回 ' + P.bag.gold + ' 金幣'); P.bag = null; Store.dirty = true; ui.dirty = true; } }
  // 探索紀錄
  const FN = WORLD.FOG, gx = Math.floor((me.x + WORLD.FOG_SIZE / 2) / WORLD.FOG_SIZE * FN), gz = Math.floor((me.z + WORLD.FOG_SIZE / 2) / WORLD.FOG_SIZE * FN);
  if (gx !== me.egx || gz !== me.egz) { me.egx = gx; me.egz = gz; let ch = false; for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) { if (dx * dx + dz * dz > 52) continue; const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= FN || z >= FN) continue; if (!P.explored[z * FN + x]) { P.explored[z * FN + x] = 1; ch = true; } } if (ch) { me.exploredDirty = true; Store.dirty = true; } }
  // 互動提示
  let hint = ''; if (!input.talk) for (const n of npcs) if (Math.hypot(n.x - me.x, n.z - me.z) < 3.4) hint = `按 ${keyOf('interact')} 與${n.short}交談`; for (const w of winches) if (Math.hypot(w.x - me.x, w.z - me.z) < 3.2) hint = `按 ${keyOf('interact')} 轉動絞盤`; if (!hint && !input.talk && B7.near()) hint = B7.hint();      // 0.7：委託板
  if (!input.talk && !me.sit) { const c = campFirst(); if (c) hint = `按 ${keyOf('interact')} 在${c.name}坐下（休息、料理）`; else if (!hint) hint = Gather.hint(); } else if (me.sit) hint = '';
  if (!hint && !input.talk && !me.sit && Net.selfPeer) { const r = nearPlayer(); if (r) hint = ivIn && ivIn.peer === r.peer ? `按 ${keyOf('interact')} 接受 ${r.name} 的組隊邀請` : ivOut && ivOut.peer === r.peer ? `等待 ${r.name} 回應組隊邀請…` : `按 ${keyOf('interact')} 邀請 ${r.name} 組隊`; }
  ui.prompt(Q8.hint() || T7.hint() || M7.hint(Fish.prompt(hint)));      /* X10：任務觸發物的提示優先 */      /* 0.7：陷阱的提示優先（w7-wild）；站在繪圖桌旁時改成繪圖桌的提示（w7-map） */      // 0.7：水邊提示拿出釣竿
}
// 一招的第 i 段命中時看起來的樣子（刀光、震波、盾擊的火花）；自己與其他玩家共用
function atkFx(...a) { fxBegin('atk', ...a); try { atkFx0(...a); } finally { fxEnd(); } }
function atkFx0(o, a, i, y, tint) {
  const A = a.A, set = setOf(o.avatar), big = (set === '2h' ? 1.3 : set === 'dual' ? 0.9 : 1) * (a.code === 8 ? 1 + (a.k || 0) * 0.25 : 1), n = a.hits ? a.hits.length : 1, last = i === n - 1, x = o.x, z = o.z, f = o.f, near = Math.hypot(x - me.x, z - me.z) < 30;
  if (A.nova) { const c = [1.0, 2.0, 3.2]; fxRing(x, z, 0.5, A.nova, 0.4, c); fxDisc(x, z, A.nova, 0.32, c, 0.4); fxPillar(x, z, 0.9, 3.2, 0.45, c, o); for (let k = 0; k < 10; k++) { const an = k / 10 * TAU, px = x + Math.sin(an) * A.nova * 0.8, pz = z + Math.cos(an) * A.nova * 0.8; emit(px, Hgt(px, pz) + 0.5, pz, 4, c, 3, 3, 0.45, 2); } if (near) ui.sfx('boom', 0, { tag: 'magic', x, z }); return; }
  if (A.fx === 'p') { const px = x + Math.sin(f) * 1.5, pz = z + Math.cos(f) * 1.5, c = [2.8, 2.5, 1.8]; fxRing(px, pz, 0.3, 1.6, 0.22, c, 0.5); spawnSlash(x, y - 0.15, z, f, 't', 0.72, c); emit(px, y + 1.15, pz, 22, c, 7, 2.5, 0.35, 9); emit(px, y + 1.15, pz, 8, [3.2, 3.0, 2.6], 2.5, 1, 0.2, 0); if (near) ui.sfx('block', 0, /Kick/.test(A.clip) ? { tag: 'kick', x, z } : { wp: o.avatar.look.wp, x, z }); return; }
  const st = n > 1 && A.fx === 't' ? 't' : n > 1 ? (last ? 's' : i % 2 ? 'r' : 'l') : A.fx;
  spawnSlash(x, y + hopY(o) * 0.5, z, f + (A.spin ? spinYaw(o) : 0), A.loop ? 's' : st, big * (A.lunge && A.fx === 't' ? 1.25 : 1), tint || (A.heavy || A.crit ? [2.6, 1.9, 1.1] : null));
  if (A.wave && (!A.waveAt || (a.k || 0) >= A.waveAt)) { const px = x + Math.sin(f) * 2.2, pz = z + Math.cos(f) * 2.2, c = [2.4, 1.5, 0.6]; fxRing(px, pz, 0.5, A.wave, 0.42, c); fxDisc(px, pz, A.wave, 0.36, [1.6, 1.0, 0.4], 0.5); fxLane(x, z, f, 2.2 + A.wave, 1.6, 0.5, c); for (let k = 0; k < 8; k++) { const an = k / 8 * TAU, qx = px + Math.sin(an) * A.wave * 0.7, qz = pz + Math.cos(an) * A.wave * 0.7; emit(qx, Hgt(qx, qz) + 0.2, qz, 5, [1.2, 0.9, 0.5], 3, 5, 0.55, 9); } if (near) { fx.shake = Math.max(fx.shake, 0.55); ui.sfx('boom', 1, { x, z }); } }
}
// 遠程的招式：射出魔力彈或箭（fan 是扇形的多發）
function shoot(o, a, dmg, mine, pv) {
  const A = a.A, kind = A.arrow ? 'arrow' : 'bolt', ch = a.code === 8 ? (a.k || 0) : 1, on = a.code !== 8 || ch >= 0.5, n = A.fan ? A.fan[0] : 1;
  const prm = { range: A.range * (a.code === 8 && A.arrow ? 0.7 + 0.3 * ch : 1), speed: PROJ[kind], r: A.boom || 0, size: (A.bolt || A.arrow) * (a.code === 8 ? 0.7 + ch * 0.5 : 1), heavy: A.heavy && on, pierce: A.pierce && on, stag: A.stag, push: A.push, crit: A.crit, trail: A.trail || (A.arrow && a.code === 8 && ch >= 1), back: A.mp && mine ? MANA.bolt : 0 };
  for (let j = 0; j < n; j++) spawnProj(kind, o.x, o.z, o.f + (A.fan ? (j - (n - 1) / 2) * A.fan[1] : 0), mine, dmg, prm, pv);
}
function doHit(a, i) {
  const A = a.A, mul = a.hits[i][1], n = a.hits.length, last = i === n - 1; if (i === 0) questCharge(a);
  const hv = a.code === 8 || a.code === 10 || a.code === 11 ? M6.heavy : 1;      // 獠牙飾：重攻擊（蓄力重擊與兩種收尾招）的傷害
  if (A.bolt || A.arrow) { shoot(me, a, a.dmg * mul * hv * (A.arrow ? D.throwMul : D.spellMul), true); return; }
  const y = meY(), strong = A.fx === 'h' || A.fx === 's' || a.code === 8 || (n > 1 && last), stop = (A.heavy && (a.code !== 8 || a.k >= 0.5) && (n === 1 || last)) || A.stag, ids = [], got = new Set(), pow = A.nova ? D.spellMul : D.dmgMul;
  atkFx(me, a, i, y, me.counter > 0 ? [2.6, 1.5, 0.5] : null);
  let any = false;
  for (const v of MV()) {
    if (!alive(v)) continue;
    if (BA8.perched(v)) { if (stop && !A.nova && inCone(v, me.x, me.z, me.f, A.range, A.arc)) BA8.shake(v); continue; }      /* 0.8 X3a：蹲樹的猴子近戰打不到；重攻擊打過去＝搖樹 */
    if (A.nova ? Math.hypot(v.x - me.x, v.z - me.z) > A.nova + MON[v.type].body * v.size : !inCone(v, me.x, me.z, me.f, A.range, A.arc)) continue;
    any = true; me.lastCombat = clock; got.add(v.id);
    if (Math.random() < D.miss && !A.nova) { popNumber(v.x, Hgt(v.x, v.z) + 2.2 * v.size, v.z, '失手', 'other'); continue; }
    let d = a.dmg * mul * pow * hv; if (A.behind && Math.abs(angDiff(v.f, Math.atan2(v.x - me.x, v.z - me.z))) < 1.0) { d *= A.behind; popNumber(v.x, Hgt(v.x, v.z) + 2.9 * v.size, v.z, '背襲', 'perfect'); }
    const full = a.code === 8 && a.k >= 0.95; hitMon(v, d, { strong, critMul: A.crit, spell: !!A.nova, stop, full }); if (A.twice) hitMon(v, d, { strong, second: 1, critMul: A.crit, stop, full }); if (stop) ids.push(v.id);
  }
  if (A.wave && (!A.waveAt || a.k >= A.waveAt)) { const px = me.x + Math.sin(me.f) * 2.2, pz = me.z + Math.cos(me.f) * 2.2; for (const v of MV()) if (alive(v) && !got.has(v.id) && Math.hypot(v.x - px, v.z - pz) < A.wave + MON[v.type].body * v.size) { hitMon(v, a.dmg * mul * 0.6 * pow, { strong: 1, stop: 1, dir: [v.x - px, v.z - pz] }); ids.push(v.id); any = true; } }
  { const pg = new Set(); pvpSparks(A.nova ? { k: 'o', x: me.x, z: me.z, r: A.nova } : { k: 'c', x: me.x, z: me.z, f: me.f, range: A.range, arc: A.arc }, strong, pg);      // 對打：打到別的玩家的火花（傷害由對方判定）
    if (A.wave && (!A.waveAt || a.k >= A.waveAt)) pvpSparks({ k: 'o', x: me.x + Math.sin(me.f) * 2.2, z: me.z + Math.cos(me.f) * 2.2, r: A.wave }, true, pg); }
  if (any) { me.counter = 0; me.cwin = 0; ui.sfx('hit', strong); stagEv(ids, A.stag || 5, A.push); ui.tip('charge', `按住 ${keyOf('heavy')}（或按住 ${keyOf('attack')}）不放可以蓄力，放開使出重攻擊。蓄到一半以上能打斷野獸的預備動作。`); }
}

/* ============================== 怪物：主控端模擬 ============================== */
// 招式編碼（同步用）：低 6 位元是招式編號＋1（0 表示沒有出招），64 狂暴，128 連段的後續招（預備較短），256 後面還有招（收招很短），512 撲空（收招多 WHIFF.rec 秒）
const moveOf = c => { const i = H8.mvIdx(c);      /* X4：招式編碼加寬（hooks08） */ return i >= 0 ? MOVES[MOVE_IDS[i]] || null : null; };
const actTimes = (M, c) => ({ anim: M.anim, wind: Math.max(Math.min(M.wind, ENRAGE.minWind), M.wind * (c & 64 ? ENRAGE.wind : 1) * (c & 128 ? 0.8 : 1)), strike: M.strike, recover: M.recover * (c & 64 ? ENRAGE.recover : 1) * (c & 256 ? 0.3 : 1) + (c & WHIFF.bit ? (M.wrec != null ? M.wrec : WHIFF.rec) : 0), whiff: c & WHIFF.bit ? 1 : 0 });      // 512：撲空，收招加長
const sizeK = o => (o.elite ? 1.25 : 1);
// 兩招之間的間隔（熊這類出手慢的 pace 較大；狂暴時縮短）
const rollCd = w => (AI.cd[0] + Math.random() * AI.cd[1]) * (MON[w.type].pace || 1) * (w.enr ? 0.6 : 1);
// 收招途中被打到踉蹌：收招剩下的時間與下一招前的間隔照算（原本會直接跳過，變成「趁牠收招打牠，牠反而更快出下一招」）
const keepDown = w => { if (w.st === MST.RECOVER) w.cd = Math.max(w.cd, w.rd - w.t + rollCd(w)); };
// 被打退之後要不要先調整距離（BACK）：記下來，踉蹌結束時才開始。a 是出手的人（要在近身範圍內）
function boArm(w, a) { const T = MON[w.type].temper; w.bo = null; if (T === 'pack' || T === 'timid' || w.boCd > 0 || !a) return; const v = w.v8 || mons[w.id], br = MON[w.type].body * (v ? v.size : 1) * (w.elite ? 1.38 : 1); if (Math.hypot(a.x - w.x, a.z - w.z) - br > BACK.near) return; w.boP = 1; }
const myId = () => Net.selfPeer || 'local';
function playerOf(id) { if (id === 'self') return me.alive && !me.inSafe ? me : null; const r = remotes.get(id); return r && r.alive && (!r.inSafe || (X8.mate && X8.mate(id))) ? r : null; /* 0.8：試煉參戰的隊友在沙地上不算安全區 */ }
function startFlee(w, who) { w.fleeFrom = who; w.target = null; if (w.st !== MST.WIND && w.st !== MST.STRIKE && w.st !== MST.RECOVER && w.st !== MST.STAGGER && w.st !== MST.FLEE) { w.st = MST.FLEE; w.t = 0; } }
// 同一群的反應：鹿群一起逃；狼群（與霜背的護衛）一起上
function alertPack(w, who) { if (w.pack == null) return; for (const o of packs.get(w.pack)) { if (o === w || o.st === MST.DEAD || (o.leash && !w.leash)) continue; if (MON[o.type].temper === 'timid') { if (o.st === MST.IDLE) startFlee(o, who); } else if (!o.target) { o.target = who; o.provoked = true; } } }
function startMove(w, M, tgt, follow) {
  if (M.chain) { w.chain = M.chain.slice(); w.mcd[M.id] = M.cd; M = MOVES[w.chain.shift()]; }
  const key = mkey(w), hp = 1 - ledgerSum(key) / w.hpMax; if (hp < ENRAGE.at) w.enr = 1;
  w.M = M; w.mvc = H8.MC(M) | (w.enr ? 64 : 0) | (follow ? 128 : 0) | (w.chain && w.chain.length ? 256 : 0);
  const A = actTimes(M, w.mvc); w.wd = A.wind; w.sd = A.strike; w.rd = A.recover; w.st = MST.WIND; w.t = 0; w.aid++; w.last = M.id; if (M.cd && !follow) w.mcd[M.id] = M.cd;
  const d = tgt ? Math.hypot(tgt.x - w.x, tgt.z - w.z) : M.min; if (tgt && !M.behind) w.f = Math.atan2(tgt.x - w.x, tgt.z - w.z);
  w.arg = M.shape === 'leap' || M.argOff ? Math.round(clamp(d, M.min, M.max) * 10) : 0;
}
// 其他玩家（或自己）送來的事件：打斷、精準格擋、嘲諷
function hostEvent(who, ev, xo) {      // 0.8：xo＝只處理自己模擬的試煉野獸（組長不是主控端時）
  const k = ev[1], at = i => (xo ? X8.sim.get(i) : sim[i] || X8.sim.get(i));
  if (k === 'k' && Array.isArray(ev[2])) for (const id of ev[2].slice(0, 12)) {
    const w = at(id | 0); if (!w || w.st === MST.DEAD || w.st === MST.STRIKE) continue; if (w.st === MST.WIND && w.M && w.M.armor) continue;
    keepDown(w); w.stagDur = clamp(num(ev[3], 5), 2, 9) / 10 * (w.elite ? 0.55 : 1); w.st = MST.STAGGER; w.t = 0; w.chain = null; w.immune = w.stagDur + 0.9; w.bo = null; if (num(ev[3], 5) / 10 >= BACK.stag) boArm(w, who === 'self' ? me : remotes.get(who));
    const pv = clamp(num(ev[6], 0), 0, 12); if (pv > 0) { const dx = w.x - num(ev[4], w.x), dz = w.z - num(ev[5], w.z), l = Math.hypot(dx, dz) || 1, kk = pv / (w.elite ? 2.2 : MON[w.type].size); w.kx = dx / l * kk; w.kz = dz / l * kk; }      // 盾擊、踢擊、震波：把怪物推開
  }
  else if (k === 'p') { const w = at(ev[2] | 0); if (w && w.st !== MST.DEAD) { keepDown(w); w.stagDur = w.elite ? 0.7 : 1.3; w.st = MST.STAGGER; w.t = 0; w.chain = null; w.immune = w.stagDur + 0.9; boArm(w, who === 'self' ? me : remotes.get(who)); } }
  else if (k === 't') { const x = num(ev[2], 0), z = num(ev[3], 0), r = clamp(num(ev[4], 0), 0, 14); for (const w of (xo ? X8.sim.values() : X8.sim.size ? [...sim, ...X8.sim.values()] : sim)) { if (w.st === MST.DEAD || Math.hypot(w.x - x, w.z - z) > r) continue; const T = MON[w.type].temper; if (T === 'timid' || (!w.target && T !== 'pack' && T !== 'ambush')) continue; w.target = who; w.provoked = true; } }
}
// 撲空判定：直線招出招途中碰到就算；飛撲看落點（how 2 落地、how 3 提早撞停：都看原本的落點，和每個人自己的判定一樣）。
//   主控端自己：直線招直接用自己畫面的判定結果（updateMonViews 寫回 w.tag／w.dodged），飛撲落地照同一套 inShape 算；
//   其他玩家：用已同步的位置，寬度多給 pad，閃避的無敵時間要還剩一點才算閃掉（拿不準時寧可算打到，不會出現「打中了還踉蹌」）
function strikeTouch(w, M, players, how) {
  if (!lunging(M) || w.tag) return; const mv = w.v8 || mons[w.id], sz = sizeK(w), br = MON[w.type].body * (mv ? mv.size : 1), lx = w.ox + Math.sin(w.of) * w.arg / 10, lz = w.oz + Math.cos(w.of) * w.arg / 10;
  for (const [id, p] of players) {
    if (p === me) { if (M.shape === 'line' || how < 2 || !mv || !mv.M) continue; const s = moveShape(mv); if (!s || !inShape(s, me.x, me.z)) continue; if (me.dodgeI > 0) { if (!w.dodged) w.dodged = []; if (!w.dodged.includes(id)) w.dodged.push(id); continue; } w.tag = true; return; }
    const inside = M.shape === 'line' ? Math.hypot(p.x - w.x, p.z - w.z) < M.w * sz / 2 + 0.45 + br * 0.2 + WHIFF.pad : how >= 2 && Math.hypot(p.x - lx, p.z - lz) < M.r * sz + 0.35 + WHIFF.pad; if (!inside) continue;
    const dodging = !!(p.dodge && p.dodge.t < (dodgeOf(p.dodge.kind) || {}).iframe - 0.04);
    if (dodging || (w.dodged && w.dodged.includes(id))) { if (!w.dodged) w.dodged = []; if (!w.dodged.includes(id)) w.dodged.push(id); continue; }
    w.tag = true; return; }
}
// 出招結束：有位移的招式沒碰到任何人 → 撲空（收招加長，編碼帶 512，大家看到的一樣）。連段中間的招不算
function strikeEnd(w, M) { if (lunging(M) && !w.tag && !(w.mvc & 256)) { w.mvc |= WHIFF.bit; w.rd = actTimes(M, w.mvc).recover; } }
/* ---------- 0.8 試煉（d8-play P3）：本機額外模擬的野獸 ----------
   試煉與百場連戰的野獸只在挑戰者（兩人組＝組長）的瀏覽器模擬：不進世界的 sim／mons、不進 hostPack；編號 9000 起，ledger 的鍵（m9xxx_0）和世界的不撞，
   隊友的傷害照現在的 presence d 送給組長。X8.sim＝我在模擬的（編號 → sim）｜X8.mons＝畫面上要畫、要判定的（自己模擬的＋看臺從組長 presence 看到的）。
   trial08.js 設定 on（自己是不是沙地上的挑戰者）、players（參戰的人）、post（柵欄）。沒有試煉時兩個都是空的：世界的野獸照舊。 */
export const X8 = { sim: new Map(), mons: [], pw: {}, on: null, players: null, post: null, make: x8Make, drop: x8Drop, pack: x8Pack, apply: x8Apply };
const MV = () => (X8.mons.length ? mons.concat(X8.mons) : mons);      // 攻擊、鎖定、判定、傷害上傳要看的野獸＝世界的＋試煉的
function x8Simulate(dt) {
  const pl = X8.players ? X8.players() : [], list = [...X8.sim.values()];
  hostSimulate(dt, { list, players: pl, all: pl.map(p => p[1]), pof: id => { for (const [k, p] of pl) if (k === id) return p; return null; }, pw: X8.pw, post: X8.post });
  for (const s of list) { const v = s.v8; setMove(v, s.mvc | (s.enr ? 64 : 0), s.arg); if (v.st !== s.st || (s.st === MST.WIND && v.aid !== s.aid)) { fxBegin('mon', v, s.st); onMonState(v, s.st); fxEnd(); v.st = s.st; v.stT = 0; } v.tx = s.x; v.tz = s.z; v.tf = s.f; v.aid = s.aid; v.hpMax = s.hpMax; }      // 同 simToView 的一筆
}
function x8Make(o) {      // o：{ id, type, lv, x, z, f, pack, hp, sim }（sim＝我來模擬）→ 畫面物件 v（v.trial8＝true；有 sim 時 v.s8 與 w.v8 互指）
  const st = monStats(o.type, o.lv, false), D = MON[o.type], x = o.x, z = o.z, f = o.f || 0, hp = o.hp || st.hp;
  const v = { id: o.id, type: o.type, lv: o.lv, elite: false, name: D.name, hx: x, hz: z, x, z, f, tx: x, tz: z, tf: f, st: MST.IDLE, stT: 0, aid: 0, spawn: 0, hpMax: hp, baseHp: hp, dmg: st.dmg, exp: 0, size: st.size, speed: 0, flash: 0, model: null, tag: null, tele: null, others: 0, credited: -1, idleT: 0, mvc: 0, arg: 0, enr: 0, M: null, act: null, tg: null, judged: -1, ox: x, oz: z, of: 0, lx: x, lz: z, awake: true, trial8: true };
  if (o.sim) { const w = { id: o.id, type: o.type, elite: false, pack: o.pack ?? null, moves: D.moves.map(m => MOVES[m]), hx: x, hz: z, x, z, f, st: MST.IDLE, t: 0, aid: 0, spawn: 0, hpMax: hp, baseHp: hp, target: null, seen: {}, wanderT: 9, wx: x, wz: z, cd: 0, kx: 0, kz: 0, stagDur: 0.2, mvc: 0, arg: 0, enr: 0, M: null, wd: 0, sd: 0, rd: 0, chain: null, mcd: {}, last: '', provoked: false, fleeFrom: null, immune: 0, hits: 0, retreat: 0, sprung: false, near: 1e9, trial8: true, v8: v };
    v.s8 = w; X8.sim.set(o.id, w); if (w.pack != null) { if (!packs.has(w.pack)) packs.set(w.pack, []); packs.get(w.pack).push(w); } }
  X8.mons.push(v); return v;
}
function x8Drop(v) {      // 收掉一隻：畫面、名牌、預警、模擬、群、傷害紀錄
  const i = X8.mons.indexOf(v); if (i >= 0) X8.mons.splice(i, 1); const w = v.s8;
  if (w) { X8.sim.delete(w.id); const p = w.pack != null && packs.get(w.pack); if (p) { const j = p.indexOf(w); if (j >= 0) p.splice(j, 1); if (!p.length) { packs.delete(w.pack); delete X8.pw[w.pack]; } } }
  if (v.model) W.scene.remove(v.model.root); if (v.tag) v.tag.el.remove(); if (v.tele) { v.tg = null; showTelegraph(v.tele, v, MON[v.type], false); } if (me.lock === v) me.lock = null; const k = mkey(v); ledger.delete(k); delete myDmg[k];
}
function x8Pack(s) { const on = s.st === MST.WIND || s.st === MST.STRIKE || s.st === MST.RECOVER, c = (on ? s.mvc : 0) | (s.enr ? 64 : 0), a = [s.id, r1(s.x), r1(s.z), r2(s.f), s.st, s.aid % 1000, s.hpMax]; if (c || (on && s.arg)) a.push(c); if (on && s.arg) a.push(s.arg); return a; }      // 和 hostPack 的 ma 同一個格式
function x8Apply(v, a) {      // 看臺與隊友：照組長送來的一筆更新畫面（同 applyHostPack 的一筆）
  let st = clamp(num(a[4], 0) | 0, 0, 8); const aid = num(a[5], 0) | 0; v.tx = clamp(num(a[1], v.x), -WORLD.SIZE / 2, WORLD.SIZE / 2); v.tz = clamp(num(a[2], v.z), -WORLD.SIZE / 2, WORLD.SIZE / 2); v.tf = num(a[3], v.f); v.hpMax = clamp(num(a[6], v.baseHp), 10, 99999); setMove(v, clamp(num(a[7], 0) | 0, 0, H8.MVC_MAX), clamp(num(a[8], 0) | 0, 0, 300));
  if ((st === MST.WIND || st === MST.STRIKE || st === MST.RECOVER) && !v.M) st = MST.CHASE;
  if (st !== v.st || (st === MST.WIND && aid !== v.aid)) { fxBegin('mon', v, st); onMonState(v, st); fxEnd(); v.st = st; v.stT = 0; } v.aid = aid;
}
function hostSimulate(dt, XS) {      // 0.8：XS＝一組本機額外模擬的野獸 { list, players, all, pof, pw }（試煉，x8Simulate 給）；沒給＝世界的野獸（主控端），和改前一樣
  const players = []; if (XS) players.push(...XS.players); else { if (input.started && me.alive && !me.inSafe) players.push(['self', me]); for (const [id, r] of remotes) if (r.alive && !r.inSafe && !r.away) players.push([id, r]); }
  const all = XS ? XS.all : [me, ...remotes.values()], count = 1 + [...remotes.values()].filter(r => !r.away).length, busy = {}, list = XS ? XS.list : sim, pof = XS ? XS.pof : playerOf, PW = XS ? XS.pw : packWait; for (const k in PW) if (PW[k] > 0) PW[k] -= dt;
  for (const w of list) if ((w.st === MST.WIND || w.st === MST.STRIKE) && w.target && w.pack != null) busy[w.target] = (busy[w.target] || 0) + 1;
  const pool8 = []; for (const o of list) { let n = 1e9; for (const p of all) { const ex = p.x - o.x, ez = p.z - o.z, d = ex * ex + ez * ez; if (d < n) n = d; } if (n < 8836 || o.st !== MST.IDLE) pool8.push(o); }      /* X12：互相推開只要看玩家 94 m 內或不是閒著的野獸（離玩家 87 m 內的野獸，3 m 內的鄰居一定在名單裡；更遠的照舊看全部） */
  for (const w of list) {
    if (w.st === MST.IDLE) { let n0 = 1e9; for (const p of all) { const ex = p.x - w.x, ez = p.z - w.z, d0 = Math.sqrt(ex * ex + ez * ez); if (d0 < n0) n0 = d0; } if (n0 > 78 && (!ledger.size || !ledger.get(mkey(w)))) { w.near = n0; H8.fn.farIdle(w, dt); continue; } }      /* X12：遠處閒著的野獸先略過（條件同下面 farIdle 那行） */
    const Dm = MON[w.type], T = Dm.temper, key = mkey(w), sz = sizeK(w);
    if (w.st === MST.DEAD) { w.t += dt; if (!XS && w.t >= (w.elite ? ELITE.respawn : 20)) { if (w.elite) eliteRespawn(w); w.spawn++; w.st = MST.IDLE; w.t = 0; w.target = null; w.seen = {}; w.kx = w.kz = 0; w.hpMax = w.elite ? w.baseHp : Math.round(w.baseHp * (1 + 0.45 * (count - 1))); w.eng = false; const a = Math.random() * TAU; w.x = w.hx + Math.cos(a) * 2; w.z = w.hz + Math.sin(a) * 2; w.wanderT = 0; w.enr = 0; w.mvc = 0; w.M = null; w.chain = null; w.mcd = {}; w.provoked = false; w.fleeFrom = null; w.sprung = false; w.hits = 0; w.retreat = 0; w.rammed = false; w.bo = null; w.boP = 0; w.boCd = 0; } continue; }
    let near = 1e9; for (const p of all) near = Math.min(near, Math.hypot(p.x - w.x, p.z - w.z)); w.near = near;
    const led = ledger.get(key);
    if (near > 78 && w.st === MST.IDLE && !led) { H8.fn.farIdle(w, dt); continue; }      // 0.8：巡邏犬（beastai07）
    w.t += dt; w.cd = Math.max(0, w.cd - dt); w.immune = Math.max(0, w.immune - dt); w.boCd = Math.max(0, (w.boCd || 0) - dt); for (const k in w.mcd) if (w.mcd[k] > 0) w.mcd[k] -= dt;
    // 受到傷害：膽小的逃、其他的反擊並叫上同伴。預備與出招中不會被一般攻擊打斷，只有夠重的一擊能打斷沒有霸體的預備
    if (led) for (const [who, d] of led) { const prev = w.seen[who] || 0; if (d <= prev) continue; w.seen[who] = d;
      const a = who === 'self' ? me : remotes.get(who), big0 = (d - prev) >= w.hpMax * AI.big, i8 = H8.fn.interrupt(w, d - prev, big0), big = i8 === undefined ? big0 : !!i8, acting = w.st === MST.WIND || w.st === MST.STRIKE;      // 0.8：i8＝掛鉤決定這一下算不算打斷（undefined＝照舊）
      if (T === 'timid') startFlee(w, who); else { w.target = who; w.provoked = true; } alertPack(w, who);
      if (w.bo && w.bo.t >= BACK.back) w.bo = null;      // 繞圈途中被打到：不繞了，直接上（退步那一下照退）
      if (acting ? (w.st === MST.WIND && big && (i8 !== undefined || (!w.elite && !(w.M && w.M.armor)))) : (w.immune <= 0 && w.st !== MST.STAGGER && (w.st !== MST.FLEE || big))) {
        keepDown(w); w.stagDur = big ? 0.4 : 0.18; w.st = MST.STAGGER; w.t = 0; w.chain = null; w.immune = w.stagDur + 0.9; w.bo = null; if (big) boArm(w, a);
        if (a) { const dx = w.x - a.x, dz = w.z - a.z, l = Math.hypot(dx, dz) || 1, k = (big ? 8 : 4) / (w.elite ? 2.2 : Dm.size); w.kx = dx / l * k; w.kz = dz / l * k; }
      }
    }
    if (w.hpMax - ledgerSum(key) <= 0) { w.st = MST.DEAD; w.t = 0; w.mvc = 0; continue; }
    w.kx = damp(w.kx, 0, 8, dt); w.kz = damp(w.kz, 0, 8, dt);
    let nx = w.x + w.kx * dt, nz = w.z + w.kz * dt;
    // 目標：離家太遠就放棄。護地盤的熊沒被打的話，玩家退出領域不遠就作罷
    const terr = (Dm.terr || 0) * (w.elite ? 1.3 : 1), leash = T === 'territorial' && !w.provoked ? terr + 7 : 42;
    let tgt = w.target ? pof(w.target) : null; if (tgt && Math.hypot(tgt.x - w.hx, tgt.z - w.hz) > leash) tgt = null;
    if (!tgt && w.target) { w.target = null; w.provoked = false; w.sprung = false; }
    if (!tgt && !w.pat8 && (T === 'pack' || T === 'ambush')) { let best = Dm.aggro * (w.elite ? 1.3 : 1) * H8.fn.senseK(w); for (const [id, p] of players) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < best && Math.hypot(p.x - w.hx, p.z - w.hz) < 34) { best = d; w.target = id; tgt = p; } } if (tgt) alertPack(w, w.target); }
    // 脫離戰鬥：受過傷、沒有目標、回到閒晃一陣子之後恢復滿血（換一個重生編號，大家手上的傷害紀錄一起作廢）。不能靠「打幾下、拉到牠放棄、再回來打」磨死
    // 0.6 菁英：開戰那一刻（被打或盯上人）看附近 ELITE.range 公尺內有幾位玩家，決定這一場的血量上限；傷害加成由每個人從血量上限推回人數（eliteK）。脫戰重置後重新算。一般野獸維持全場人數的算法
    if (w.elite) { if (!w.eng && (led || tgt)) { w.eng = true; let n = 0; for (const [, p] of players) if (Math.hypot(p.x - w.x, p.z - w.z) <= ELITE.range) n++; w.hpMax = Math.round(w.baseHp * (1 + ELITE.perHp * (clamp(n, 1, ELITE.maxN) - 1))); } else if (w.eng && !led && !tgt && w.st === MST.IDLE) { w.eng = false; w.hpMax = w.baseHp; } }
    if (led && !tgt && w.st === MST.IDLE && !XS) { w.calm = (w.calm || 0) + dt; if (w.calm >= AI.reset) { w.calm = 0; w.spawn++; w.seen = {}; w.hpMax = w.elite ? w.baseHp : Math.round(w.baseHp * (1 + 0.45 * (count - 1))); w.eng = false; w.enr = 0; w.mvc = 0; w.M = null; w.mcd = {}; continue; } } else w.calm = 0;
    const moveTo = (x, z, sp) => { const dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz); if (d < 0.05) return; const s = Math.min(sp * dt, d); nx += dx / d * s; nz += dz / d * s; w.f = dampAng(w.f, Math.atan2(dx, dz), 10, dt); };
    const X7 = (BA7.owns(w) || BA8.owns(w) || BB.owns(w)) ? { dt, tgt, players, nx, nz } : null, h7 = X7 ? (BB.owns(w) ? BB.host(w, X7) : BA7.owns(w) ? BA7.host(w, X7) : BA8.host(w, X7)) : false; if (X7) { nx = X7.nx; nz = X7.nz; } /* X3b：BB 先問（製作人依 X3a 合併後改寫） */      // 0.7 新野獸：先問 beastai07.js（處理完就略過下面的 switch）
    if (!h7) switch (w.st) {
      case MST.IDLE: {
        if (T === 'timid') { let who = null, best = Dm.aggro * H8.fn.senseK(w); for (const [id, p] of players) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < best) { best = d; who = id; } } if (who) { startFlee(w, who); alertPack(w, who); break; } }
        else if (T === 'territorial' && !tgt) { let who = null, best = terr; for (const [id, p] of players) { const d = Math.hypot(p.x - w.hx, p.z - w.hz); if (d < best) { best = d; who = id; tgt = p; } } if (who) { w.target = who; w.st = MST.WARN; w.t = 0; break; } }
        if (tgt) { w.st = MST.CHASE; w.t = 0; break; }
        w.wanderT -= dt; if (w.wanderT <= 0) { w.wanderT = 2.5 + Math.random() * 4; const a = Math.random() * TAU, r = Math.random() * 6; w.wx = w.hx + Math.cos(a) * r; w.wz = w.hz + Math.sin(a) * r; }
        moveTo(w.wx, w.wz, Math.hypot(w.x - w.hx, w.z - w.hz) > 10 ? (T === 'timid' ? 2.6 : Dm.speed * 0.8) : 1.5); break;
      }
      case MST.WARN: {      // 威嚇：面向闖入者不動；對方退出領域就作罷，賴著不走或貼得太近就動手
        if (!tgt || Math.hypot(tgt.x - w.hx, tgt.z - w.hz) > terr + 1.5) { w.target = null; w.st = MST.IDLE; w.t = 0; w.wanderT = 1.5; break; }
        w.f = dampAng(w.f, Math.atan2(tgt.x - w.x, tgt.z - w.z), 8, dt);
        if (w.t >= Dm.warn * (w.elite ? 0.8 : 1) || Math.hypot(tgt.x - w.x, tgt.z - w.z) < 4.2) { w.st = MST.CHASE; w.t = 0; }
        break;
      }
      case MST.FLEE: {      // 逃跑：遠離嚇到牠的人，被擋住就偏向一邊；被追到身後會後蹬
        let from = pof(w.fleeFrom), fd = from ? Math.hypot(from.x - w.x, from.z - w.z) : 1e9; for (const [id, p] of players) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < fd) { fd = d; from = p; } }
        if (!from || (fd > 26 && w.t > 1) || w.t > 9) { w.st = MST.IDLE; w.t = 0; w.fleeFrom = null; w.wanderT = 3 + Math.random() * 3; w.wx = w.x; w.wz = w.z; break; }
        const dx = w.x - from.x, dz = w.z - from.z; let a = Math.atan2(dx, dz);
        if (fd < 2.9 && w.cd <= 0 && Math.abs(angDiff(w.f, Math.atan2(-dx, -dz))) > 2.0) { startMove(w, MOVES.deer_kick, from); break; }
        if (!w.rammed && fd < 8 && w.cd <= 0 && 1 - ledgerSum(key) / w.hpMax < 0.55) { w.rammed = true; startMove(w, MOVES.deer_charge, from); break; }      // 被打到半血以下：回頭用角頂一次再逃
        for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) { const ax = w.x + Math.sin(a + off) * 2.4, az = w.z + Math.cos(a + off) * 2.4; if (!monBlocked(w.x, w.z, ax, az) && Math.hypot(ax, az) > WORLD.TOWN_R + 6) { a += off; break; } }
        /* 11-20 F1b：逃跑方向先平滑（繞開障礙時 a 會一次跳 0.5～1 弧度，身體追不上就像甩尾）；起跑加速 0.3 秒（不再瞬間滿速）；身體還沒轉到跑的方向時速度先打折，朝向 22／秒追上去 */
        w.fa = w.t <= dt * 1.5 || w.fa == null ? a : dampAng(w.fa, a, 9, dt); const sp0 = Dm.speed * (w.t < 2.5 ? 1 : 0.84), err = Math.abs(angDiff(w.f, w.fa)); w.fsp = w.t <= dt * 1.5 || w.fsp == null ? Math.min(1.5, sp0) : w.fsp + clamp(sp0 - w.fsp, -24 * dt, 24 * dt);
        const et = clamp((err - 0.35) / 0.85, 0, 1), sp = w.fsp * (1 - 0.4 * et * et * (3 - 2 * et)); nx += Math.sin(w.fa) * sp * dt; nz += Math.cos(w.fa) * sp * dt; w.f = dampAng(w.f, w.fa, 22, dt); break;
      }
      case MST.CHASE: {
        if (!tgt) { w.st = MST.IDLE; w.t = 0; w.wanderT = 0; break; }
        const dx = tgt.x - w.x, dz = tgt.z - w.z, d = Math.hypot(dx, dz) || 0.01, toT = Math.atan2(dx, dz), rel = Math.abs(angDiff(w.f, toT)); let wait = false;
        if (w.bo) {      // 被打退：先面向目標退兩步（壓低身子），再繞著目標走一段，然後直接上
          const B = w.bo, orbitR = Math.max(Dm.orbit * sz, Dm.body * ((w.v8 || mons[w.id]) ? (w.v8 || mons[w.id]).size : 1) * sz + 1.6); B.t += dt;
          if (d > (B.r || B.d0 + BACK.backV * Dm.speed * BACK.back) + BACK.far || B.t > BACK.back + BACK.circ || B.a >= BACK.arc) { w.bo = null; w.cd = Math.min(w.cd, B.t > BACK.back ? 0 : 0.25); }      // 目標拉開了（遠程想風箏）、或繞夠了：直接上
          else if (B.t < BACK.back) { const k = BACK.backV * Dm.speed * (1 - 0.5 * B.t / BACK.back); nx -= dx / d * k * dt; nz -= dz / d * k * dt; w.f = dampAng(w.f, toT, 10, dt); break; }
          else { if (!B.r) B.r = clamp(d, orbitR * 0.8, orbitR + 1.2);
            const sp = Dm.speed * BACK.circV, da = sp * dt / Math.max(2, d), a0 = Math.atan2(w.x - tgt.x, w.z - tgt.z) + B.s * da, rr = d + (B.r - d) * Math.min(1, 3 * dt), ex = tgt.x + Math.sin(a0) * rr, ez = tgt.z + Math.cos(a0) * rr;
            if (monBlocked(w.x, w.z, ex, ez)) { if (!B.flip && B.a < 1.2) { B.flip = 1; B.s = -B.s; } else { w.bo = null; w.cd = 0; } break; }      // 繞到一半被擋：剛開始就往另一邊繞，已經繞了一大段就直接上
            nx += ex - w.x; nz += ez - w.z; B.a += da; const tan = Math.atan2(ex - w.x, ez - w.z); w.f = dampAng(w.f, toT + angDiff(toT, tan) * 0.65, 12, dt); break; }      // 身體朝前進方向偏一點、頭看著目標（creatures.js 依移動方向轉頭）
        }
        if (w.cd <= 0) {
          // 選招：距離合適、冷卻好了的招式裡挑；身後專用的優先，其次是有冷卻的招牌招式。成群的狼要輪流出手
          if (w.pack != null && T === 'pack' && ((busy[w.target] || 0) >= 1 || (!w.elite && PW[w.pack] > 0))) wait = true;      // 頭狼也不跟護衛同時出手（同一時間只有一個預警），但不用等空檔
          else {
            const hp = 1 - ledgerSum(key) / w.hpMax; let best = 0, c = [];
            for (const M of w.moves) { if (d < M.min || d > M.max * sz || w.mcd[M.id] > 0 || hp > M.low || (M.behind ? rel < 2.1 || d > M.max : false)) continue; const pr = M.behind ? 3 : M.cd ? 2 : M.id === w.last ? 0.5 : 1; if (pr > best) { best = pr; c = [M]; } else if (pr === best) c.push(M); }
            if (c.length) { startMove(w, c[Math.floor(Math.random() * c.length)], tgt); busy[w.target] = (busy[w.target] || 0) + 1; w.sprung = true; break; }
          }
        }
        // 走位：伏擊的先壓低身子慢慢接近；打完兩招拉開距離；其餘在各自習慣的距離繞著目標
        const orbit = Dm.orbit * sz, face = () => { w.f = dampAng(w.f, toT, 10, dt); };
        if (T === 'ambush' && !w.sprung && d > 11) moveTo(tgt.x, tgt.z, Dm.speed * 0.42);
        else if (w.retreat > 0) { w.retreat -= dt; if (d < orbit + 2) { nx -= dx / d * Dm.speed * 0.9 * dt; nz -= dz / d * Dm.speed * 0.9 * dt; } face(); }
        else if (w.cd <= 0 && !wait ? d > Math.max(1.6, Dm.body * Dm.size * (w.elite ? 1.38 : 1) * (PUSH.body + PUSH.fwd) + PUSH.r + 0.3) : d > orbit + 1.2) moveTo(tgt.x, tgt.z, Dm.speed * (d > AI.far ? AI.rush : 1));      // 目標離得遠：加速追上去
        else { const s = (w.id % 2 ? 1 : -1), back = d < orbit - 1.5 ? -0.8 : 0, v = (T === 'territorial' ? 1.1 : Dm.speed * 0.5) * (back < 0 ? BK20 : 1);      /* 太近要退開時放慢（四足橫退搆不到腳，會整隻縮成一團） */ nx += (-dz / d * s + dx / d * back) * v * dt; nz += (dx / d * s + dz / d * back) * v * dt; face(); }
        break;
      }
      case MST.WIND: {
        const M = w.M; if (!M) { w.st = MST.CHASE; w.t = 0; break; }
        if (tgt && M.track > 0 && w.t < w.wd * M.track) w.f = dampAng(w.f, Math.atan2(tgt.x - w.x, tgt.z - w.z), 9, dt);
        if (w.t >= w.wd) { w.st = MST.STRIKE; w.t = 0; w.ox = w.x; w.oz = w.z; w.of = w.f; w.tag = false; w.dodged = null; if (M.rally) for (const o of list) if (o !== w && o.type === 'wolf' && o.st !== MST.DEAD && !o.target && Math.hypot(o.x - w.x, o.z - w.z) < 34) { o.target = w.target; o.provoked = true; o.cd = 0; } }
        break;
      }
      case MST.STRIKE: { const M = w.M, v = (M.shape === 'leap' ? w.arg / 10 : M.dash) / w.sd; nx += Math.sin(w.f) * v * dt; nz += Math.cos(w.f) * v * dt;
        strikeTouch(w, M, players, w.t >= w.sd - 0.02 ? 2 : 1);
        if (w.t >= w.sd) { w.st = MST.RECOVER; w.t = 0; if (w.pack != null && !w.elite) PW[w.pack] = AI.packGap; strikeEnd(w, M); }
        break; }
      case MST.RECOVER:
        if (w.mvc & WHIFF.bit && w.t < 0.6) { const s = WHIFF.skid * 7 * Math.exp(-7 * w.t); nx += Math.sin(w.f) * s * dt; nz += Math.cos(w.f) * s * dt; }      // 撲空：煞不住，往前滑一小段
        if (w.t >= w.rd) {
          if (w.chain && w.chain.length && tgt) { startMove(w, MOVES[w.chain.shift()], tgt, true); break; }
          // 收招時目標繞到身後又貼得近：直接往後蹬（野豬）
          const bm = tgt && w.moves.find(M => M.behind && !(w.mcd[M.id] > 0)); if (bm && T !== 'timid' && Math.hypot(tgt.x - w.x, tgt.z - w.z) < bm.max * sz && Math.abs(angDiff(w.f, Math.atan2(tgt.x - w.x, tgt.z - w.z))) > 2.1) { w.chain = null; startMove(w, bm, tgt); w.mcd[bm.id] = 2.5; break; }
          w.chain = null; w.st = T === 'timid' ? MST.FLEE : MST.CHASE; w.t = 0; w.cd = rollCd(w);
          if (T === 'ambush' && ++w.hits >= 2) { w.hits = 0; w.retreat = 1.2; }
        }
        break;
      case MST.STAGGER: if (w.t >= w.stagDur) { w.st = T === 'timid' ? MST.FLEE : MST.CHASE; w.t = 0; w.cd = Math.max(w.cd, 0.25); if (w.boP && tgt && w.st === MST.CHASE) { w.bo = { t: 0, s: Math.random() < 0.5 ? 1 : -1, a: 0, r: 0, d0: Math.hypot(tgt.x - w.x, tgt.z - w.z) }; w.boCd = BACK.cd; } w.boP = 0; } break;
    }
    for (const o of (w.near < 87 ? pool8 : list)) { if (o === w || o.st === MST.DEAD) continue; const dx = nx - o.x, dz = nz - o.z; if (Math.abs(dx) > 4.6 || Math.abs(dz) > 4.6) continue; const d = Math.hypot(dx, dz), m = (Dm.body * (Dm.bk || 1) + MON[o.type].body * (MON[o.type].bk || 1)) * 0.9;      /* 11-20 野獸放大：群體推擠距離跟著體型（bk＝放大倍率，沒放大＝1） */ if (d < m && d > 0.001) { nx += dx / d * (m - d) * 0.5; nz += dz / d * (m - d) * 0.5; } }
    // 與玩家互相推開（柔性）：重疊時慢慢退開一半，另一半由玩家那邊自己讓開。預備與出招中不動，預警與判定的位置才不會跑掉
    if (w.st !== MST.WIND && w.st !== MST.STRIKE && near < 5) { const b0 = Dm.body * Dm.size * (w.elite ? 1.38 : 1), br = b0 * PUSH.body + PUSH.r, ox = Math.sin(w.f) * b0 * PUSH.fwd, oz = Math.cos(w.f) * b0 * PUSH.fwd, kq = 1 - Math.exp(-PUSH.k * dt); for (const pl of all) { if (pl.alive === false || pl.dodge || pl.rush || pl.swim) continue; const dx = nx + ox - pl.x, dz = nz + oz - pl.z, d = Math.hypot(dx, dz); if (d >= br || d < 0.05) continue; const q = Math.min((br - d) * 0.5 * kq, PUSH.max * dt); nx += dx / d * q; nz += dz / d * q; } }
    { const k = BB.cliff(w) ? 1 : slopeK(w.x, w.z, nx, nz); if (k < 1) { nx = w.x + (nx - w.x) * k; nz = w.z + (nz - w.z) * k; w.climb = 1 - k; } else w.climb = 0; }      // 往上爬坡變慢（和玩家同一套規則）；w.climb 給動作用
    const before = w.st; if (!BA7.inPit(w) && !BA8.free(w) && (BB.cliff(w) ? BB.blocked(w.x, w.z, nx, nz) : monBlocked(w.x, w.z, nx, nz))) { /* 0.8（P2）：坑裡的沼蟒不算撞到水 */ if (!monBlocked(w.x, w.z, nx, w.z)) w.x = nx; else if (!monBlocked(w.x, w.z, w.x, nz)) w.z = nz; if (before === MST.STRIKE && !BA7.bump(w)) { strikeTouch(w, w.M, players, 3); w.st = MST.RECOVER; w.t = 0; strikeEnd(w, w.M); } } else { w.x = nx; w.z = nz; }      // 撞到石頭樹幹提早停下：照樣看有沒有撲空      // 地形、陡坡（往上）、深水都過不去
    collide(w, Dm.body * 0.8 * (Dm.bk || 1)); BA7.post(w); BB.post(w); /* X3b：拴住 */      // 0.7：野牛衝撞撞上樹或岩石會暈
    const rr = Math.hypot(w.x, w.z); if (XS) { if (XS.post) XS.post(w); } else if (rr < WORLD.TOWN_R + 3) { const k = (WORLD.TOWN_R + 3) / (rr || 1); w.x *= k; w.z *= k; if (w.st === MST.STRIKE) { w.st = MST.RECOVER; w.t = 0; } w.target = null; }
  }
}
function setMove(v, mvc, arg) { if (v.mvc === mvc && v.arg === arg) return; v.mvc = mvc; v.arg = arg; v.enr = mvc & 64 ? 1 : 0; const M = moveOf(mvc); if (M) { v.M = M; v.act = actTimes(M, mvc); } }
function simToView() { for (let i = 0; i < sim.length; i++) { const s = sim[i], v = mons[i]; if (v.spawn !== s.spawn) { if (v.st !== MST.DEAD && v.model && Math.hypot(v.x - me.x, v.z - me.z) < 40) popNumber(v.x, Hgt(v.x, v.z) + MON[v.type].tagH * v.size + 0.4, v.z, '恢復', 'heal'); ledger.delete(mkey(v)); delete myDmg[mkey(v)]; v.spawn = s.spawn; v.x = s.x; v.z = s.z; v.f = s.f; v.others = 0; } setMove(v, s.mvc | (s.enr ? 64 : 0), s.arg); if (v.st !== s.st || (s.st === MST.WIND && v.aid !== s.aid)) { fxBegin('mon', v, s.st); onMonState(v, s.st); fxEnd(); v.st = s.st; v.stT = 0; } v.tx = s.x; v.tz = s.z; v.tf = s.f; v.aid = s.aid; v.hpMax = s.hpMax; } }
function viewToSim() { for (let i = 0; i < sim.length; i++) { const s = sim[i], v = mons[i], T = MON[s.type].temper; s.spawn = v.spawn; s.x = v.x; s.z = v.z; s.f = v.f; s.st = v.st; s.t = v.stT; s.aid = v.aid; s.hpMax = v.hpMax; s.target = null; s.kx = s.kz = 0; s.seen = {}; s.mvc = v.mvc; s.arg = v.arg; s.enr = v.enr; s.M = v.M; s.chain = null; s.fleeFrom = null; s.bo = null; s.boP = 0; s.tag = true; s.provoked = v.st !== MST.IDLE; s.eng = s.provoked || v.hpMax !== v.baseHp; if (v.act) { s.wd = v.act.wind; s.sd = v.act.strike; s.rd = v.act.recover; } if ((s.st === MST.WIND || s.st === MST.STRIKE) && !s.M) s.st = MST.IDLE; if (s.st === MST.WARN || (s.st === MST.CHASE && T !== 'pack' && T !== 'ambush')) s.st = MST.IDLE; const led = ledger.get(mkey(v)); if (led) for (const [who, d] of led) s.seen[who] = d; } }
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function hostPack() {
  let ms = '', md = '', act = [];
  for (const s of sim) { ms += B36[s.spawn % 36]; md += s.st === MST.DEAD ? '1' : '0'; if (s.st !== MST.DEAD && (s.st !== MST.IDLE || Math.hypot(s.x - s.hx, s.z - s.hz) > 7.5 || s.hpMax !== s.baseHp) && !H8.fn.packSkip(s)) act.push(s); }
  if (act.length > 28) act = act.sort((a, b) => a.near - b.near).slice(0, 28).sort((a, b) => a.id - b.id);
  const ma = act.map(s => { const a = [s.id, r1(s.x), r1(s.z), r2(s.f), s.st, s.aid % 1000, s.hpMax], on = s.st === MST.WIND || s.st === MST.STRIKE || s.st === MST.RECOVER, c = (on ? s.mvc : 0) | (s.enr ? 64 : 0); if (c || (on && s.arg)) a.push(c); if (on && s.arg) a.push(s.arg); return a; });
  return { ms, md, ma, mb: packMb(md), mc: packMc(ma), es: elites.map(e => e.spot).join('') };      /* X12：mb＝md 改位元（每字 6 隻）、mc＝ma 改成精簡字串；送出去的是 mb、mc */      // es：三隻菁英現在各在第幾處
}
/* X12：即時狀態壓縮。mb＝「隻數(36 進位):」＋死活位元（每字 6 隻，A–Z a–z 0–9 - _）；mc＝活動中的野獸，每隻「id,x×10,z×10,f×100,st,aid,hpMax[,c[,arg]]」36 進位、逗號分欄、分號分隻（不是整數的值寫成 ~十進位） */
const B64X = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function packMb(md) { let o = md.length.toString(36) + ':'; for (let i = 0; i < md.length; i += 6) { let b = 0; for (let k = 0; k < 6; k++) if (md[i + k] === '1') b |= 1 << k; o += B64X[b]; } return o; }
let mbSeen = null, mbMd = '';
function unpackMb(s) { if (s === mbSeen) return mbMd; const c = s.indexOf(':'), n = c > 0 ? parseInt(s.slice(0, c), 36) : 0; let o = ''; if (n > 0 && n <= 4096) for (let i = 0; i < n; i++) { const b = B64X.indexOf(s[c + 1 + ((i / 6) | 0)]); o += b >= 0 && (b >> (i % 6)) & 1 ? '1' : '0'; } mbSeen = s; mbMd = o; return o; }
const mcV = v => (Number.isInteger(v) ? v.toString(36) : '~' + v);
function packMc(ma) { return ma.map(a => a.map((v, j) => (j === 1 || j === 2 ? Math.round(v * 10).toString(36) : j === 3 ? Math.round(v * 100).toString(36) : mcV(v))).join(',')).join(';'); }
function unpackMc(s) { const out = []; if (!s) return out; for (const e of s.split(';').slice(0, 64)) { const f = e.split(','); out.push(f.map((t, j) => { const v = t[0] === '~' ? parseFloat(t.slice(1)) : parseInt(t, 36); return j === 1 || j === 2 ? v / 10 : j === 3 ? v / 100 : v; })); } return out; }
function applyHostPack(pr) {
  if (typeof pr.mb === 'string' || typeof pr.mc === 'string') pr = Object.assign({}, pr, { md: typeof pr.mb === 'string' ? unpackMb(pr.mb) : pr.md, ma: typeof pr.mc === 'string' ? unpackMc(pr.mc) : pr.ma });      /* X12：新格式轉回舊格式再照舊處理（舊主控端送的 md、ma 照樣看得懂） */
  if (typeof pr.es === 'string') elites.forEach((e, j) => { const k = pr.es.charCodeAt(j) - 48; if (k !== e.spot && e.spots[k]) placeElite(e, k, true); });
  const ms = typeof pr.ms === 'string' ? pr.ms : '', md = typeof pr.md === 'string' ? pr.md : '', act = new Map(); if (Array.isArray(pr.ma)) for (const a of pr.ma) if (Array.isArray(a)) act.set(a[0] | 0, a);
  for (let i = 0; i < mons.length; i++) {
    const v = mons[i], sp = ms.length > i ? B36.indexOf(ms[i]) : -1, a = act.get(i);
    if (sp >= 0 && sp !== v.spawn % 36) { ledger.delete(mkey(v)); delete myDmg[mkey(v)]; v.spawn = sp > v.spawn % 36 ? v.spawn - (v.spawn % 36) + sp : v.spawn - (v.spawn % 36) + 36 + sp; v.x = v.tx = v.hx; v.z = v.tz = v.hz; v.ib = null; v.others = 0; v.credited = -1; if (v.st === MST.DEAD) { v.st = MST.IDLE; v.stT = 0; } v.hpMax = v.baseHp; v.enr = 0; v.mvc = 0; }
    let st = md[i] === '1' ? MST.DEAD : a ? clamp(num(a[4], 0) | 0, 0, 8) : (v.st === MST.DEAD ? MST.DEAD : MST.IDLE); if (st === MST.DEAD && md[i] !== '1') st = MST.IDLE;
    if (md.length <= i) st = v.st;
    let aid = v.aid;
    if (a) { v.tx = clamp(num(a[1], v.x), -WORLD.SIZE / 2, WORLD.SIZE / 2); v.tz = clamp(num(a[2], v.z), -WORLD.SIZE / 2, WORLD.SIZE / 2); v.tf = num(a[3], v.f); aid = num(a[5], 0) | 0; v.hpMax = clamp(num(a[6], v.baseHp), 10, 99999); v.awake = true; setMove(v, clamp(num(a[7], 0) | 0, 0, H8.MVC_MAX), clamp(num(a[8], 0) | 0, 0, 300)); if ((st === MST.WIND || st === MST.STRIKE || st === MST.RECOVER) && !v.M) st = MST.CHASE; }
    else if (v.awake && st !== MST.DEAD) { v.awake = false; v.ib = null; v.tx = v.hx; v.tz = v.hz; }
    if (md[i] === '0' && v.st === MST.DEAD && !a) st = MST.IDLE;
    if (st !== v.st || (st === MST.WIND && aid !== v.aid)) { fxBegin('mon', v, st); onMonState(v, st); fxEnd(); v.st = st; v.stT = 0; }
    v.aid = aid;
  }
}

/* F5：主控端的野獸位置也走快照插值。收到的每筆主控封包（room.js 的 snaps）：位置進各野獸的緩衝（v.ib）、離散狀態（死活、招式、狀態碼）排隊到播放時間才套用。
   播放時間用主控玩家那條的延遲（remotes 裡主控的 lag），所以野獸和主控玩家的畫面對得上。 */
function hostIn(t, pres) {
  const pr = pres; let ma = null;
  if (typeof pr.mc === 'string') ma = unpackMc(pr.mc); else if (Array.isArray(pr.ma)) ma = pr.ma;
  if (ma) for (const a of ma) { if (!Array.isArray(a)) continue; const v = mons[a[0] | 0]; if (!v) continue; const HALF = WORLD.SIZE / 2, st = clamp(num(a[4], 0) | 0, 0, 8); pushSnap(v.ib || (v.ib = makeBuf()), t, clamp(num(a[1], v.x), -HALF, HALF), clamp(num(a[2], v.z), -HALF, HALF), num(a[3], v.f), st === MST.CHASE || st === MST.FLEE, BE_JUMP); }
  Net.hostQ.push({ t, pres });
}
function hostFeed(ent, peer) {
  const pr = ent && ent.presence; if (!pr || typeof pr.ms !== 'string') return;
  const hr = remotes.get(peer), D = hr && hr.lag.init ? hr.lag.D : 150, nowMs = Net.frameT || Date.now(), sn = ent.snaps;
  if (Net.hostSrc !== peer) { Net.hostSrc = peer; Net.hostQ = []; Net.hostSeen = pr; Net.hostSnapDone = sn && sn.length ? sn[sn.length - 1].t : 0; for (const v of mons) v.ib = null; applyHostPack(pr); Net.hostRT = nowMs - D + LEAD; return; }
  if (Net.hostSeen !== pr) {
    Net.hostSeen = pr;
    if (sn && sn.length) { for (const s of sn) if (s.t > Net.hostSnapDone) { Net.hostSnapDone = s.t; hostIn(s.t, s.pres); } } else hostIn(nowMs, pr);
  }
  const rT = Net.hostRT = nowMs - D + LEAD;
  while (Net.hostQ.length && Net.hostQ[0].t <= rT) applyHostPack(Net.hostQ.shift().pres);
  if (Net.hostQ.length > 80) { const last = Net.hostQ[Net.hostQ.length - 1]; Net.hostQ = []; applyHostPack(last.pres); }
}
const SMB = { x: 0, z: 0, f: 0, vx: 0, vz: 0, mode: 0 };

/* ============================== 怪物：呈現與判定（每個人各自判定自己有沒有被打中） ============================== */
// 這一招此刻的範圍：預警與命中判定共用。預備時跟著怪物的位置與朝向，出招後固定在出招那一刻
function moveShape(v) {
  const M = v.M, A = v.act; if (!M || !A) return null; if (M.sh8 && BA8.owns(v)) return BA8.shape(v, M); /* 製作人：X3a 與 X3b 都用 sh8，依擁有者分派 */ if (M.sh7 || M.sh8) return M.sh8 ? BB.shape(v, M) : BA7.shape(v, M);      // 0.7：野牛衝撞的線跟著修正方向；狀態招式不畫
  const wind = v.st === MST.WIND, sz = sizeK(v), br = MON[v.type].body * v.size, x = wind ? v.x : v.ox, z = wind ? v.z : v.oz, f = (wind ? v.f : v.of) + M.dir, p = clamp((wind ? v.stT : A.wind + v.stT) / (A.wind + M.at), 0, 1);
  if (M.shape === 'line') return { shape: 'line', x, z, f, w: M.w * sz + 2 * (0.45 + br * 0.2), len: M.dash + br + 0.9, p: wind ? p : 1 };   // 寬度含身體與玩家半徑：畫出來的就是會被打到的範圍
  if (M.shape === 'cone') return { shape: 'cone', x, z, f, r: M.r * sz + br * 0.5, arc: M.arc, p };
  if (M.shape === 'ring') return { shape: 'ring', x, z, f, r0: M.r0 * sz, r: M.r * sz, p };
  const off = M.shape === 'leap' || M.argOff ? v.arg / 10 : M.off * sz; return { shape: 'circle', x: x + Math.sin(f) * off, z: z + Math.cos(f) * off, f, r: M.r * sz, p };
}
function inShape(s, x, z) {
  const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), pad = 0.35;
  if (s.shape === 'circle') return d < s.r + pad; if (s.shape === 'ring') return d > s.r0 - pad && d < s.r + pad;
  if (s.shape === 'cone') return d < s.r + pad && (d < 0.9 || Math.abs(angDiff(s.f, Math.atan2(dx, dz))) < s.arc + 0.12);
  const al = dx * Math.sin(s.f) + dz * Math.cos(s.f), sd = Math.abs(dx * Math.cos(s.f) - dz * Math.sin(s.f)); return al > -0.5 && al < s.len && sd < s.w / 2 + pad;
}
// 野獸的叫聲（帶位置，遠近左右有差別）：出招、受驚逃跑、發現玩家、菁英現身、受擊硬直、倒下。預備與威嚇的低吼在 onMonState 裡
function monSfx(v, st) {
  const d = Math.hypot(v.x - me.x, v.z - me.z), at = v.elite && BA7.owns(v) ? { x: v.x, z: v.z, tag: 'elite' } : { x: v.x, z: v.z }; if (d > 60) return; /* 0.8：新野獸菁英的叫聲帶 tag elite */
  if (st === MST.STRIKE) ui.sfx('strike', v.type, at);
  else if (st === MST.FLEE && v.st === MST.IDLE) ui.sfx('flee', v.type, at);
  else if (v.st === MST.IDLE && (st === MST.CHASE || st === MST.WARN)) { if (v.elite && d < 40) ui.sfx('danger'); if (st === MST.CHASE) ui.sfx('growl', v.type, { x: v.x, z: v.z, tag: v.elite ? (BA7.owns(v) ? 'elite' : 'roar') : 'spot' }); }
  else if (st === MST.STAGGER) ui.sfx('stagger', v.type, at);
  else if (st === MST.DEAD) ui.sfx('die', v.type, at);
}
function onMonState(v, st) {
  if (v.st === MST.WIND && (st === MST.STAGGER || st === MST.DEAD) && clock - v.qk < 1) { questAct('doStop'); if (MOVES.dog_howl && v.M === MOVES.dog_howl) questAct('doBarkBreak'); }      /* X10：打斷鬥犬的長吠（m13） */
  monSfx(v, st);
  const near = Math.hypot(v.x - me.x, v.z - me.z) < 30, y = Hgt(v.x, v.z), M = v.M;
  if (st === MST.WIND) { v.ox = v.x; v.oz = v.z; v.of = v.f; if (near) ui.sfx('growl', v.type, { x: v.x, z: v.z, tag: M && M.snd8 ? M.snd8 : M && M.anim === 'roar' ? 'roar' : v.elite && BA7.owns(v) ? 'elite' : null }); /* 0.8：招式的 snd8 */ if (near && M && v.elite && M.cd) popNumber(v.x, y + MON[v.type].tagH * v.size + 0.6, v.z, M.name, 'call'); }
  if (st === MST.STRIKE) { v.ox = v.x; v.oz = v.z; v.of = v.tf; emit(v.x, y + 0.2, v.z, 8, [0.5, 0.44, 0.3], 2.5, 1.2, 0.4, 3); }
  if (st === MST.WARN && near) { if (!MON[v.type].warnOnly) ui.sfx('growl', v.type, { x: v.x, z: v.z });      /* 11-27 N3：只警告的野牛不在這裡出聲（音效接口在 beastai07 的 warnSfx7，跟噴氣同一格） */ popNumber(v.x, y + MON[v.type].tagH * v.size + 0.5, v.z, '！', 'call'); if (Math.hypot(v.hx - me.x, v.hz - me.z) < MON[v.type].terr * 1.4) ui.tip('warn', MON[v.type].name + '在警告你：地上的黃圈是牠的地盤，退出去牠就不會追來；賴著不走牠會動手。'); }
  if (st === MST.FLEE && near && v.st === MST.IDLE) { popNumber(v.x, y + MON[v.type].tagH * v.size + 0.4, v.z, '！', 'call'); ui.tip('deer', '野鹿很膽小，一靠近就逃。真要追，小心追到牠身後時的後蹬。'); }
  if (st === MST.CHASE && near && v.st === MST.IDLE && MON[v.type].temper === 'pack') ui.tip('pack', '灰狼成群行動，打一隻整群都會上，而且會輪流撲過來。看地上的紅色預警，往旁邊閃開直線的撲咬。');
  if (st === MST.DEAD) emit(v.x, y + 1, v.z, 30, [2.4, 2.1, 1.6], 5, 4, 0.7, 8);
  if (st === MST.RECOVER && v.act && v.act.whiff && near) { fxCue('stumble', v); ui.sfx('stumble', v.type, { x: v.x, z: v.z }); ui.tip('whiff', '野獸的衝撞、撲咬、飛撲撲空時會往前栽一下，比平常多愣一會：這就是反打的空檔。'); }      // 撲空：腳下揚起一串塵土（動作在 creatures.js）
  if (st === MST.IDLE && v.st === MST.WARN && Math.hypot(v.hx - me.x, v.hz - me.z) < MON[v.type].terr * 2.6) questWarned(v);
}
// 招式命中那一刻的落地效果
function impactFx(...a) { fxBegin('impact', ...a); try { impactFx0(...a); } finally { fxEnd(); } }
function impactFx0(v, s, M) {
  const near = Math.hypot(s.x - me.x, s.z - me.z) < 30; if (!near) return; const y = Hgt(s.x, s.z), dust = [0.7, 0.58, 0.4];
  if (s.shape === 'circle' || s.shape === 'ring') { fxRing(s.x, s.z, s.shape === 'ring' ? s.r0 : s.r * 0.25, s.r, 0.4, M.anim === 'roar' ? [1.8, 1.9, 2.2] : [1.6, 1.2, 0.8], 0.75); if (M.anim !== 'roar') { fxDisc(s.x, s.z, s.r, 0.3, [1.2, 0.9, 0.6], 0.4); emit(s.x, y + 0.3, s.z, 28, dust, 5, 3, 0.6, 5); } fx.shake = Math.max(fx.shake, M.heavy ? 0.4 : 0.22); if (M.anim !== 'roar') ui.sfx('boom', M.heavy, { x: s.x, z: s.z, tag: M.anim === 'slam' ? null : 'light' }); }
  else if (s.shape === 'cone') { spawnSlash(s.x, y - 0.3, s.z, s.f, 'h', s.r / 3.4, [2.2, 0.9, 0.5]); emit(s.x + Math.sin(s.f) * s.r * 0.6, y + 0.6, s.z + Math.cos(s.f) * s.r * 0.6, 10, dust, 4, 2, 0.4, 5); }
}
// 擊殺經驗：看等級差（同等級 ±2 全額，低 3 級以上遞減），第一次擊敗另有獎勵；菁英第二次以後減半
const noExpTold = new Set();
function killReward(v) {
  const k = v.elite ? v.drop || 'e' + v.id : v.type, n = P.kc[k] || 0, exp = killExp(v.exp, v.lv, P.lv, n, v.elite); P.kc[k] = n + 1;
  if (P.lv < LV_CAP && !v.elite) { if (!n) ui.log(`第一次擊敗${MON[v.type].name}：額外獲得 ${Math.round(v.exp * EXPK.first)} 經驗。`); }
  if (exp <= 0) { const why = P.lv >= LV_CAP ? 'cap' : k; if (!noExpTold.has(why)) { noExpTold.add(why); ui.log(P.lv >= LV_CAP ? `已達等級上限（${LV_CAP} 級），不再獲得經驗。` : `${v.name || MON[v.type].name}比你低太多級，打牠已經沒有經驗了。`); } }
  return exp;
}
let animN = 0;      /* X12：動作降頻用的幀數 */
function updateMonViews(dt, fxp, fzp) {
  animN++; for (const v of MV()) {
    const Dm = MON[v.type], ex8 = v.x - fxp, ez8 = v.z - fzp, dist = Math.sqrt(ex8 * ex8 + ez8 * ez8);      /* X12：Math.hypot 在熱迴圈裡慢 */
    if (dist > 125) { if (v.model && v.model.root.visible) { v.model.root.visible = false; if (v.tag) v.tag.el.style.display = 'none'; if (v.tele) { v.tg = null; showTelegraph(v.tele, v, Dm, false); } } v.x = v.tx; v.z = v.tz; v.stT += dt; continue; }
    if (!v.model) { v.model = BB.make(v.type, v.size, v.elite, v) || BA7.make(v.type, v.size, v.elite) || BA8.make(v.type, v.size, v.elite) || makeCreature(v.type, v.size, v.elite); W.scene.add(v.model.root); if (Dm.bk && v.model.S && !v.model.bkDone) { v.model.bkDone = 1; v.model.S = Object.assign({}, v.model.S, { cad: (v.model.S.cad || 1) / Dm.bk }); }      /* 11-20 野獸放大：步頻隨體型降低，世界座標的步幅才跟著放大（本地步幅不變，不會滑步） */
      v.tag = makeTag(v.elite ? 'mon elite' : Dm.temper === 'timid' || Dm.temper === 'neutral' ? 'mon calm' : 'mon'); v.tag.name.textContent = v.name + '　Lv' + v.lv; v.tele = makeTelegraph(); v.adt = 0.21; }      /* 11-20 F3b：生成當幀一定要跑一次動作（anim08 的蒙皮修正在第一次 anim 才做），不能被遠處降頻跳過、讓沒修的幾何先 render 出去 */
    const px = v.x, pz = v.z, k = v.st === MST.STRIKE ? 30 : 14;
    if (!Net.isHost && !v.awake && v.st === MST.IDLE && !H8.fn.idleView(v, dt)) { v.idleT -= dt; if (v.idleT <= 0) { v.idleT = 3 + Math.random() * 5; const a = Math.random() * TAU, r = Math.random() * 5; v.tx = v.hx + Math.cos(a) * r; v.tz = v.hz + Math.sin(a) * r; v.tf = Math.atan2(v.tx - v.x, v.tz - v.z); } }
    const sm = !Net.isHost && v.awake && v.ib ? sampleAt(v.ib, Net.hostRT, SMB) : null;
    if (sm) { const jd = v.ibp ? Math.hypot(sm.x - v.ibx, sm.z - v.ibz) / Math.max(dt, 0.001) : 0; v.ibx = sm.x; v.ibz = sm.z; v.ibp = true; if (jd > 60) { v.x = sm.x; v.z = sm.z; v.f = sm.f; } else { v.x = damp(v.x, sm.x, FOLLOW_K, dt); v.z = damp(v.z, sm.z, FOLLOW_K, dt); v.f = dampAng(v.f, sm.f, FOLLOW_K, dt); } }      /* F5：野獸（非主控端）走快照插值 */
    else { v.ibp = false; v.x = damp(v.x, v.tx, k, dt); v.z = damp(v.z, v.tz, k, dt);
      { let tf = v.tf, kf = 14; if (v.st === MST.FLEE) { const ex = v.tx - v.x, ez = v.tz - v.z; if (ex * ex + ez * ez > 0.04 && v.speed > 2) { tf = Math.atan2(ex, ez); kf = 22; } }      /* 11-20 F1b：逃跑時身體直接對著「實際在跑的方向」（模擬的朝向慢半拍，斜跑就像甩尾）*/
        v.f = dampAng(v.f, tf, kf, dt); } }
    v.speed = damp(v.speed, Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 0.001), 10, dt); v.stT += dt; v.flash = Math.max(0, v.flash - rdt * 6.5);      // 閃光照真實時間退：停頓的前一兩幀亮一下，之後就看得到挨打的姿勢
    const y = Hgt(v.x, v.z); let ox = 0, oz = 0; if (v.shk > 0) { v.shk = Math.max(0, v.shk - rdt); const a = v.shkA * Math.min(1, v.shk / 0.06) * Math.sin(rclock * 88); ox = v.shx * a; oz = v.shz * a; }      // 命中停頓中，挨打的野獸沿受力方向顫動
    { let la = 0; if (v.st === MST.CHASE) { let bd = 14, p = null; const see = o => { if (o.alive === false) return; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < bd) { bd = d; p = o; } }; see(me); for (const r of remotes.values()) see(r); if (p) la = clamp(angDiff(v.f, Math.atan2(p.x - v.x, p.z - v.z)), -1.1, 1.1); } v.look = damp(v.look || 0, la, 6, dt); }      // 繞圈時身體朝前進方向、頭看著最近的玩家（每個人各自算，只是畫面）
    v.model.root.position.set(v.x + ox, y, v.z + oz); if (!v.model.lx) v.model.root.rotation.y = v.f;      /* 11-27 新模型（lynx20）：朝向只在算動作的那一格更新，降頻跳過的格不轉（否則遠一點的野獸轉身時會一格跳過去，Q2 查到） */ v.model.shadowLod && v.model.shadowLod(dist, animN + v.id); v.adt = (v.adt || 0) + dt;
    { const lod = dist < 40 || (v.st !== MST.IDLE && v.st !== MST.CHASE && v.st !== MST.FLEE) ? 1 : dist < 80 ? 2 : 4; if (lod === 1 || (animN + v.id) % lod === 0 || v.adt > 0.2) { if (v.model.lx || !v.model.root.userData.fy0) { v.model.root.rotation.y = v.f; v.model.root.userData.fy0 = 1; } (v.model.anim || animCreature)(v.model, v, v.adt, clock); v.adt = 0; if (v.model.fx8 && v.model.fx8.length) bearFx08(v.model, emit, bearWp); } }      /* X12：動作依距離降頻，跳過的時間累加 */
    // 預警：威嚇時畫出領域（黃），預備與出招時畫出這一招的範圍（紅）
    const acting = (v.st === MST.WIND || v.st === MST.STRIKE) && v.M, hid = v.spawn * 1000 + v.aid; let s = acting ? moveShape(v) : null;
    if (v.st === MST.WARN && Dm.warnOnly) v.tg = { shape: 'circle', x: v.x, z: v.z, f: 0, r: (Dm.warnR || 8) * (v.elite ? 1.3 : 1), p: 0, tone: 'warn' };      /* 11-27 N3：野牛警告的黃圈以牠自己為圓心（不是地盤），退出黃圈就沒事 */
    else if (v.st === MST.WARN) v.tg = { shape: 'circle', x: v.hx, z: v.hz, f: 0, r: Dm.terr * (v.elite ? 1.3 : 1), p: v.stT / (Dm.warn * (v.elite ? 0.8 : 1)), tone: 'warn' };
    else v.tg = s && (v.st === MST.WIND || (v.judged !== hid && (v.M.shape !== 'line' || v.stT < v.act.strike))) ? s : null;
    showTelegraph(v.tele, v, Dm, !!v.tg);
    // 受擊判定：每個人只判定自己。直線招式出招途中碰到就算；其餘在命中那一刻看站的位置
    if (v.M && v.act && !v.M.nj && v.judged !== hid && (v.st === MST.STRIKE || (v.st === MST.RECOVER && v.stT < 0.3))) {
      const M = v.M; let hit = false, done = false; if (!s) s = moveShape(v);
      if (M.shape === 'line') { if (v.st === MST.STRIKE) hit = Math.hypot(v.x - me.x, v.z - me.z) < M.w * sizeK(v) / 2 + 0.45 + Dm.body * v.size * 0.2; else done = true; }
      else if (v.st === MST.RECOVER || v.stT >= M.at - 0.02) { done = true; hit = inShape(s, me.x, me.z); impactFx(v, s, M); if (M.rock) BB.rock(v, s, M); if (M.pool) BA7.pool(v, s, M); }
      if (hit && me.alive && !me.inSafe) { done = true; const res = hurtMe(v.dmg * M.dmg * eliteK(v) * BB.dmgK(v), v.x, v.z, { heavy: M.heavy, mon: v }); if (res !== 'none' && res !== 'dodged' && res !== 'immune' && res !== 'parried') v.biteHit = hid; /* 咬合特效：真的咬中玩家（格擋也算，格擋住的不算） */ questHurt(v, res); H8.emit('me:hurt', { v, M, res }); if (M.grab || M.latch || M.toss) BA7.onHurt(v, M, res); if (M.seize || M.shove) BB.onHurt(v, M, res); if (M.hold8 || M.stag8) BA8.onHurt(v, M, res);
        const w8 = v.s8 || (Net.isHost && sim[v.id]); if (w8 && w8.aid === v.aid) { const w = w8; if (res === 'dodged') { if (!w.dodged) w.dodged = []; if (!w.dodged.includes('self')) w.dodged.push('self'); } else if (res !== 'none' && !(w.dodged && w.dodged.includes('self'))) w.tag = true; } }      // 撲空判定用：主控端自己有沒有被打到
      else if (done && me.alive && clock - (me.dodgeAt || -99) < v.act.wind + v.act.strike + 0.5 && Math.hypot(v.ox - me.x, v.oz - me.z) < 15) questHurt(v, 'miss');
      if (done) v.judged = hid;
    }
    if (v.st === MST.STRIKE && v.model.sp && v.model.sp.v8) { BITE.quality = W.quality === 'low' ? 'low' : W.quality === 'medium' ? 'medium' : 'high'; biteTick(v, W.scene, hid, dist < 60); }      /* 0.8 咬合特效：咬類招式的出招中，到了咬合的時間點放一次（biteTick 內自己判斷招式與時間） */
    if (v.enr && !v.rage && v.st !== MST.DEAD) { v.rage = true; v.tag.el.classList.add('rage'); if (dist < 40) { popNumber(v.x, y + Dm.tagH * v.size + 0.5, v.z, '狂暴', 'call'); emit(v.x, y + 1.2, v.z, 24, [3, 0.5, 0.3], 5, 4, 0.6, 2); } } else if (!v.enr && v.rage) { v.rage = false; v.tag.el.classList.remove('rage'); }
    // 擊殺結算：有造成傷害的人都拿到經驗與自己的掉落
    const key = mkey(v);
    if (v.st === MST.DEAD && v.credited !== v.spawn) {
      v.credited = v.spawn; v.deadAt = clock; H8.emit('mon:dead', { v, mine: ledgerMine(key) > 0 }); if (myDmg[key]) { dmgDirty = true; dmgFlushAt = clock + 3.2; } if (!v.trial8) { const vx = v.x, vz = v.z; B7.kill(v, ledgerMine(key) > 0, () => { const led = ledger.get(key); if (!led || !me.team) return false; for (const [w, d] of led) if (w !== 'self' && d > 0 && (remotes.get(w) || {}).pt === me.team) return Math.hypot(vx - me.x, vz - me.z) < 60; return false; }); }      // 0.7 委託板：自己或隊友（60 公尺內）打倒的都算；隊友的傷害晚一點才同步到，board07 會再看 2 秒
      if (ledgerMine(key) > 0 && !v.trial8) {      // 0.8：試煉野獸不給經驗、金幣、掉落，不算任務擊殺與 P.kc、P.kills（mon:dead 照發）
        P.kills++; ui.sfx('kill'); questKill(v); gainExp(killReward(v), v.x, v.z); H8.emit('mon:kill', { v });
        const gold = Math.round((Dm.gold[0] + Math.random() * (Dm.gold[1] - Dm.gold[0])) * (1 + (v.lv - 1) * 0.15) * (v.elite ? 6 : 1) * D.luck); P.gold += gold; const got = [gold + ' 金幣'], ic = ['gold'];
        for (const [id, n] of H8.fn.lootExtra(v)) if (ITEMS[id] && n > 0) { addItem(id, n); got.push(ITEMS[id].name + (n > 1 ? '×' + n : '')); ic.push(id); }      /* 0.8：必掉（菁英的牛角、斷項圈、蟒膽、蟒皮；數量由數值） */
        for (const [id, ch] of Dm.drops) if (Math.random() < ch * D.luck * M6.loot) { addItem(id); got.push(ITEMS[id].name); ic.push(id); }
        if (v.drop) { addItem(v.drop); got.push(ITEMS[v.drop].name); ic.push(v.drop); }
        // 天賦球：菁英第一次必掉（之後低機率），一般野獸低機率
        const orb = v.orb ? ((!P.skills.includes(v.orb) && !(P.inv['orb_' + v.orb] > 0)) || Math.random() < 0.1 ? v.orb : null) : (Dm.orbs && Math.random() < ORB_DROP * D.luck ? Dm.orbs[Math.floor(Math.random() * Dm.orbs.length)] : null);
        if (orb) { addItem('orb_' + orb); got.push(ITEMS['orb_' + orb].name); ic.push('orb_' + orb); }
        ui.loot(got.join('、'), ic); fxCue('loot', me, v); Store.dirty = true; ui.dirty = true;
      }
    }
    const led = ledger.get(key); let total = 0, mine = 0; if (led) for (const [who, d] of led) { total += d; if (who === 'self') mine = d; }
    const others = total - mine; if (others > v.others) { if (v.st !== MST.DEAD) { popNumber(v.x, y + 2.0 * v.size, v.z, String(others - v.others), 'other'); v.flash = Math.max(v.flash, 0.6); v.ftone = 0;
      { let src = null, bd = 30; for (const r of remotes.values()) { const d = Math.hypot(r.x - v.x, r.z - v.z); if (d < bd) { bd = d; src = r; } } if (src && v.model) hitCreature(v.model, v.x - src.x, v.z - src.z, (others - v.others) >= v.hpMax * 0.08 ? 0.75 : 0.4); }      /* 別人打中：看起來也往被打的方向縮一下（猜是最近的那位打的） */ emit(v.x, y + 1.2, v.z, 8, [3.4, 2.4, 1.0], 5, 3, 0.35, 14); } v.others = others; }
    const hp = clamp(1 - total / v.hpMax, 0, 1); if (v.hpS !== hp) { v.hpS = hp; v.tag.fill.style.transform = `scaleX(${hp})`; }      /* X12：血條有變才寫 DOM */
    const rear = Dm.temper === 'territorial' && (v.st === MST.WARN || (acting && v.M.anim === 'slam')) ? 0.95 : 0;      // 熊人立時名牌跟著抬高
    const lk = v === me.lock; if (lk !== !!v.lk) { v.lk = lk; v.tag.el.classList.toggle('locked', lk); }
    placeTag(v.tag, v.x, y + (Dm.tagH + rear) * v.size, v.z, v.st !== MST.DEAD && dist < 46 && (hp < 1 || v.st !== MST.IDLE || v.elite || dist < 16 || lk));
  }
}

/* ============================== 其他玩家 ============================== */
function addRemote(peer) { const r = { peer, avatar: new Avatar(''), look: '', tag: makeTag('other'), x: 0, z: 0, f: 0, tx: 0, tz: 0, tf: 0, hp: 100, alive: true, inSafe: true, a: 0, as: -1, ac: 0, atk: null, dodge: null, cast: null, guard: false, charge: null, stun: 0, deadT: 0, speed01: 0, name: '旅人', lv: 1, sayN: -1, evN: null, first: true, guest: false, flash: 0, lastHp: 100, goneAt: 0, pt: '', ol: false, buf: makeBuf(), lag: makeLag(), q: [], snapDone: 0, tgx: 0, tgz: 0, hasPrev: false, prevA: 0 }; remotes.set(peer, r); r.tag.name.title = '點一下邀請組隊'; r.tag.name.addEventListener('click', e => { e.stopPropagation(); tagClick(r); }); return r; }      // 0.6：點名牌邀請組隊
function removeRemote(peer) { const r = remotes.get(peer); if (!r) return; r.avatar.dispose(); r.tag.el.remove(); remotes.delete(peer); ui.log((r.name || '旅人') + ' 離開了'); }
// 狀態碼 a：0 站立 1 跑動 2 游泳 3 閃避 4 倒下 5 格擋 6 蓄力 7 破防 8 施放技能 9 衝刺 10 坐在營火旁
function applyRemote(r, p, guest) {
  r.tx = clamp(num(p.x, r.tx), -WORLD.SIZE / 2, WORLD.SIZE / 2); r.tz = clamp(num(p.z, r.tz), -WORLD.SIZE / 2, WORLD.SIZE / 2); r.tf = num(p.f, r.tf);
  const hp = clamp(num(p.hp, 100), 0, 100); if (hp < r.lastHp - 0.5 && !r.first) { r.flash = 1; remoteVoice(r, hp); } r.lastHp = r.hp = hp; r.alive = hp > 0; r.a = num(p.a, 0) | 0; r.lv = clamp(num(p.lv, 1) | 0, 1, 99); r.guest = !!guest;
  const nm = typeof p.n === 'string' && p.n.trim() ? p.n.trim().slice(0, 14) : '旅人'; if (nm !== r.name || r.first) { r.name = nm; } r.tag.name.textContent = nm + '　Lv' + r.lv;
  if (typeof p.lk === 'string' && p.lk !== r.look && p.lk.length < 260) { r.look = p.lk; r.avatar.setLook(p.lk); }
  const as = num(p.as, 0) | 0, set = setOf(r.avatar);
  if (r.first) { r.x = r.tx; r.z = r.tz; r.f = r.tf; r.as = as; ui.log(nm + ' 進入了這片土地'); }
  else if (as !== r.as) { r.as = as; r.ac = clamp(num(p.ac, 0) | 0, 0, 14); const A = moveByCode(set, r.ac, noShield(r.avatar)), hits = A.hits || [[A.hit, 1]]; if (A.bolt || A.arrow) r.f = r.tf; r.atk = { t: 0, A, code: r.ac, k: clamp(num(p.ak, 10), 0, 10) / 10, hits, hi: 0, done: false, dur: A.dur, hit: hits[0][0], pw: powOk(p.ad) }; }      // pw：對打用的攻擊力（和 as 同一次送來）
  if (r.a === 3 && r.prevA !== 3) { const kind = DODGE_KINDS[clamp(num(p.dd, 0) | 0, 0, DODGE_KINDS.length - 1)]; r.dodge = { t: 0, kind, dur: dodgeOf(kind).dur }; }
  if (r.a === 8) { const S = SKILLS[SKILL_IDS[clamp(num(p.sc, 0) | 0, 0, SKILL_IDS.length - 1)]]; if (!r.cast || r.cast.id !== S.id || r.prevA !== 8) r.cast = { id: S.id, S, t: 0, dur: S.cast, at: S.at, k: 1 }; } else r.cast = null;
  if (r.a === 2) r.swim = true; else if (r.a === 0 || r.a === 1) r.swim = false;        // 游泳中被打（7）或倒下（4）時維持原狀
  r.sit = r.a === 10; r.tower8 = typeof p.tw === 'number' && p.tw > -200 && p.tw < 600 ? { y: p.tw / 10 } : null; /* R4：對方站在獵臺上（floatY 看 tower8.y） */ r.ek = num(p.ek, 0) | 0; { const g = num(p.g6, 0) | 0; if (g !== r.g6) { r.g6 = g; r.gear = Ars.gearOf(g); if (r.avatar.setGear) r.avatar.setGear(r.gear); } }      // 0.6：坐在營火旁、擊敗過哪些菁英、裝備代碼（披肩與武器階級，給美術的外觀用）
  r.guard = r.a === 5; r.charge = r.a === 6 ? { k: clamp(num(p.ck, 0), 0, 10) / 10 } : null; r.sprinting = r.a === 9; if (r.a === 7 && r.prevA !== 7) r.stun = GUARD.stun; r.prevA = r.a;
  const say = p.say; if (say && typeof say === 'object' && typeof say.t === 'string') { const n = num(say.n, 0) | 0; if (r.first) r.sayN = n; else if (n !== r.sayN) { r.sayN = n; const t = say.t.slice(0, 60); tagSay(r.tag, t); ui.chat(nm, t, '#9fc4e0'); } }
  // 事件：技能特效每個人都要看到；打斷、格擋、嘲諷只有主控端處理
  if (Array.isArray(p.ev)) { let top = r.evN == null ? -1 : r.evN; for (const e of p.ev) { if (!Array.isArray(e) || typeof e[0] !== 'number') continue; if (r.evN != null && e[0] > r.evN) { if (Net.isHost) hostEvent(r.peer, e); else if (X8.sim.size) hostEvent(r.peer, e, 1); if (e[1] === 's') { const id = SKILL_IDS[e[2] | 0]; if (id) { const X = clamp(num(e[3], r.x), -WORLD.SIZE / 2, WORLD.SIZE / 2), Z = clamp(num(e[4], r.z), -WORLD.SIZE / 2, WORLD.SIZE / 2), F = num(e[5], 0), pw = powOk([e[7], e[8]]); skillFx(id, r, X, Z, F, e[6], false, pw ? { r, pw } : null); if (pw) pvpSkill(r, id, X, Z, F, e[6], pw); } } else if (e[1] === 'c') Craft.onFeast(Needs.campList()[e[2] | 0], r.name, e[3] ? 'food_fishfeast' : ''); } top = Math.max(top, e[0]); } r.evN = top; } else if (r.evN == null) r.evN = -1;
  // 0.6 對打與組隊：pt 隊伍代號、ol 通緝中、kd 被誰打倒（公告）、iv 組隊邀請、ia 回覆邀請、hr 被我打中的結果（跳數字）。帶序號的事件：第一次看到只記序號不處理（不重播舊的）
  r.pt = typeof p.pt === 'string' && p.pt.length < 100 ? p.pt : ''; r.ol = !!p.ol;
  const seq = (k, v, fn) => { if (!Array.isArray(v) || typeof v[0] !== 'number') { if (r[k] == null) r[k] = -1; return; } if (r[k] == null || r.first) { r[k] = v[0]; return; } if (v[0] !== r[k]) { r[k] = v[0]; fn(v); } };
  seq('kdN', p.kd, v => { const mine = v[1] === Net.selfPeer, ol = v[4] ? 1 : 0; killNotice(mine ? P.name : String(v[3] || '旅人').slice(0, 14), nm, typeof v[2] === 'string' && ZONES[v[2]] ? v[2] : 'meadow', ol); if (mine) pvpKilled(nm, ol); });
  seq('ivN', p.iv, v => { if (v[1] === Net.selfPeer && typeof v[2] === 'string' && v[2].length < 100) gotInvite(r, v[2]); });
  seq('iaN', p.ia, v => { if (v[1] !== Net.selfPeer || !ivOut || ivOut.peer !== r.peer) return; if (!v[2]) { ui.toast(`${nm} 拒絕了組隊邀請`); ui.log(`${nm} 拒絕了組隊邀請。`); } ivOut = null; netSet('iv', null); });
  seq('hrN', p.hr, v => { if (v[1] !== Net.selfPeer) return; const res = v[3] | 0, d = clamp(num(v[2], 0), 0, 9999) | 0, y = Hgt(r.x, r.z) + 2.6;      // 對方判定的結果：打中的數字、被擋、被閃、精準格擋
    if (res === 5) popNumber(r.x, y, r.z, '閃避', 'other'); else if (res === 4) popNumber(r.x, y, r.z, '精準格擋', 'perfect'); else if (res === 2) popNumber(r.x, y, r.z, String(d), 'block'); else if (res !== 6 && d > 0) popNumber(r.x, y, r.z, String(d), res === 3 ? 'mine heavy' : 'mine'); });
  r.first = false;
}
/* F5：快照插值。收到的每一筆（room.js 給的 snaps：本機時鐘的快照時間）先放進緩衝；畫面固定晚 D 毫秒，在兩個快照之間內插。
   離散狀態（動作碼 a、攻擊、閃避、事件…）也排隊，等播放時間到了才套用（applyRemote），這樣走跑動畫和實際移動對得上、不會滑步。
   沒有 snaps 的來源（原版 window.claude 平台）用到達時間當快照時間。 */
const PL_JUMP = { maxSpd: 28, minJump: 6, maxD: 40 }, BE_JUMP = { maxSpd: 45, minJump: 8, maxD: 50 }, MOVING_A = new Set([1, 2, 3, 9]), SMP = { x: 0, z: 0, f: 0, vx: 0, vz: 0, mode: 0 }, FOLLOW_K = 30, LEAD = 1000 / FOLLOW_K;
function remoteIn(r, p, pr) {
  const sn = p.snaps;
  if (r.first) { applyRemote(r, pr, p.guest); r.buf = makeBuf(); r.q.length = 0; r.hasPrev = false; const t = sn && sn.length ? sn[sn.length - 1].t : Date.now(); r.snapDone = t; pushSnap(r.buf, t, r.x, r.z, r.f, false, PL_JUMP); r.tgx = r.x; r.tgz = r.z; if (sn && sn.length) lagNote(r.lag, t, sn[sn.length - 1].late); return; }
  if (sn && sn.length) { for (const s of sn) if (s.t > r.snapDone) { r.snapDone = s.t; remoteSnap(r, s.t, s.late, s.pres, p.guest); } }
  else remoteSnap(r, Date.now(), 0, pr, p.guest);
}
function remoteSnap(r, t, late, pres, guest) {
  lagNote(r.lag, t, late); const a = num(pres.a, 0) | 0, HALF = WORLD.SIZE / 2, x = clamp(num(pres.x, r.tx), -HALF, HALF), z = clamp(num(pres.z, r.tz), -HALF, HALF), f = num(pres.f, r.tf);
  const L = r.q.length ? r.q[r.q.length - 1].pres : r.lastApplied, revive = L && num(L.a, 0) === 4 && a !== 4;
  pushSnap(r.buf, t, x, z, f, MOVING_A.has(a), revive ? { force: true } : PL_JUMP); r.q.push({ t, pres, guest }); if (r.q.length > 80) { const it = r.q.shift(); applyRemote(r, it.pres, it.guest); }
}
function updateRemotes(dt) {
  const nowMs = Net.frameT || Date.now();
  for (const r of remotes.values()) {
    const px = r.x, pz = r.z, rT = nowMs - lagStep(r.lag, dt) + LEAD;
    while (r.q.length && r.q[0].t <= rT) { const it = r.q.shift(); r.lastApplied = it.pres; applyRemote(r, it.pres, it.guest); }
    const sm = sampleAt(r.buf, rT, SMP);
    if (sm) { const jd = r.hasPrev ? Math.hypot(sm.x - r.tgx, sm.z - r.tgz) / Math.max(dt, 0.001) : 0; r.tgx = sm.x; r.tgz = sm.z; r.hasPrev = true; if (jd > 40 || r.first) { r.x = sm.x; r.z = sm.z; r.f = sm.f; } else { r.x = damp(r.x, sm.x, FOLLOW_K, dt); r.z = damp(r.z, sm.z, FOLLOW_K, dt); r.f = dampAng(r.f, sm.f, FOLLOW_K, dt); } }
    r.inSafe = Math.hypot(r.x, r.z) < WORLD.TOWN_R; const sp = Math.hypot(r.x - px, r.z - pz) / Math.max(dt, 0.001);
    r.speed01 = damp(r.speed01, r.a === 1 || r.a === 2 || r.a === 5 || r.a === 6 || r.a === 9 ? clamp(sp / 7.2, r.a === 1 || r.a === 9 ? 0.3 : 0, 1) : 0, 12, dt);
    { const mx = r.x - px, mz = r.z - pz, ml = Math.hypot(mx, mz), sf = Math.sin(r.f), cf = Math.cos(r.f), fw = ml > 1e-4 ? (mx * sf + mz * cf) / ml : 1; r.mv = r.speed01 > 0.2 && fw < 0.75 && (r.a === 1 || r.a === 5 || r.a === 6) ? [fw, (mx * cf - mz * sf) / ml] : null; }      r.flash = Math.max(0, r.flash - dt * 4); r.stun = Math.max(0, r.stun - dt);      // 面向與移動方向不同（鎖定、格擋中）：平移或倒退的步伐。0.5e：閃光與硬直的倒數原本被寫進註解裡，其他玩家挨打後會一直泛紅、一直抖
    r.slideK = damp(r.slideK || 0, sp > 1.5 && slopeAt(r.x, r.z).s > SLOPE.slide ? 1 : 0, 6, dt);
    const y = floatY(r, dt);
    if (r.atk) { const a = r.atk, A = a.A; a.t += dt; while (a.hi < a.hits.length && a.t >= a.hits[a.hi][0]) { if (A.bolt || A.arrow) shoot(r, a, 0, false, a.pw ? { r, pw: [a.pw[0] * a.hits[a.hi][1], a.pw[1]] } : null); else { atkFx(r, a, a.hi, y); pvpMelee(r, a, a.hi); } a.hi++; a.done = true; if (Math.hypot(r.x - me.x, r.z - me.z) < 30) A.bolt || A.arrow || ui.sfx('swing', A.fx === 'h' || A.fx === 's', { x: r.x, z: r.z, wp: r.avatar.look.wp, tag: A.fx === 't' ? 'thrust' : null }); } if (a.t >= a.dur) r.atk = null; }
    if (r.dodge) { r.dodge.t += dt; if (r.dodge.t >= r.dodge.dur) r.dodge = null; }
    if (r.cast) r.cast.t = Math.min(r.cast.dur, r.cast.t + dt);
    if (r.charge) fxCharge(r); if (r.charge && Math.random() < dt * 20) emitGather(r.x, y + 0.5, r.z, 1, [1.5, 1.1, 0.6], 1.5);
    r.deadT = r.alive ? 0 : r.deadT + dt;
    r.avatar.group.position.set(r.x, y + hopY(r), r.z); r.avatar.group.rotation.y = r.f + spinYaw(r);
    r.avatar.update(dt, pose(r, r.avatar)); Fish.remote(r, dt); slopeDust(r, dt);
    { const al = allyOf(r); if (al !== !!r.alOn) { r.alOn = al; r.tag.el.classList.toggle('ally', al); r.tag.name.title = al ? '隊友' : '點一下邀請組隊'; } if (r.ol !== !!r.olOn) { r.olOn = r.ol; r.tag.el.classList.toggle('outlaw', r.ol); } }      // 隊友、通緝犯的名牌
    r.tag.fill.style.transform = `scaleX(${r.hp / 100})`; if (r.tag.sayT > 0) { r.tag.sayT -= dt; if (r.tag.sayT <= 0) r.tag.say.classList.remove('on'); }
    placeTag(r.tag, r.x, y + 3.05, r.z, true);
  }
}

/* ============================== 連線層 ============================== */
export const Net = { room: null, user: null, db: null, ready: false, connected: false, fatal: '', selfPeer: null, guestSelf: false, sent: {}, pending: {}, dirty: false, force: false, lastSend: 0, errors: 0, isHost: true, wasHost: true, hostName: '你', rxRate: 0, mvTime: 0, mvCount: 0, rtts: [], pingSeq: 0, pingAt: {}, pingT: 0, seenPg: {}, acks: {}, measured: {}, hb: 0, hbT: 0, adopted: new Set(), hostQ: [], hostSrc: null, hostSeen: null, hostSnapDone: 0, hostRT: 0, frameT: 0 };
export function netSet(key, value, force) { const s = JSON.stringify(value); if (Net.sent[key] === s) return; Net.sent[key] = s; Net.pending[key] = value; Net.dirty = true; if (force) Net.force = true; }
function netFlush(now) {
  if (!Net.room || !Net.dirty || Net.fatal) return; if (!Net.force && now - Net.lastSend < 80) return;
  const patch = Net.pending; Net.pending = {}; Net.dirty = false; Net.force = false; Net.lastSend = now;
  Net.room.presence(patch, Net.frameT || undefined).catch(e => { Net.errors++; Net.lastErr = e && (e.code || e.message); if (e && ['not_granted', 'revoked', 'capability_disabled', 'capability_removed'].includes(e.code)) Net.fatal = e.code; });
}
function netTick(dt, now) {
  const room = Net.room;
  if (!room || Net.fatal) { Net.isHost = true; Net.hostName = '你'; Net.selfPeer = null; if (remotes.size) for (const id of [...remotes.keys()]) removeRemote(id); return; }
  let list; try { list = room.peers(); Net.connected = room.connected(); } catch (e) { list = []; }
  const nowMs = Date.now(), seen = new Set(); let self = null;
  for (const p of list) if (p.isMe && p.sameTab) { self = p; break; }
  Net.selfPeer = self ? self.peer : null; Net.guestSelf = !!(self && self.guest);
  let hostPeer = null, lowPeer = input.started && self ? self.peer : null, claimPeer = null, hostPres = null, adoptFrom = null, bestAt = 0;
  for (const p of list) {
    if (p.kind !== 'viewer' || (p.isMe && p.sameTab)) continue;
    // 0.5d：收不到更新 3.5 秒內照常；之後不能當主控、怪物不追，但人留在畫面上；15 秒才當成離開（切走視窗的人 r＝0，一直留著）
    const pr = p.presence || {}, age = nowMs - p.updatedAt; if (typeof pr.x !== 'number' || (age > 15000 && pr.r !== 0)) continue;
    const live = pr.r === 1 && age < 3500;
    seen.add(p.peer); let r = remotes.get(p.peer); if (!r) r = addRemote(p.peer); r.goneAt = 0; r.away = !live; r.age = age;
    if (r.lastPres !== pr) { if (r.lastPres && (pr.x !== r.lastPres.x || pr.z !== r.lastPres.z)) Net.mvCount++; r.lastPres = pr; remoteIn(r, p, pr); }
    if (r.a === 1 || r.a === 2 || r.a === 3) Net.mvTime += dt;
    if (pr.d && typeof pr.d === 'object') for (const k in pr.d) { const d = num(pr.d[k], 0); if (d > 0 && d < 1e6 && /^m\d+_\d+$/.test(k)) ledgerSet(k, p.peer, d); }
    if (typeof pr.pg === 'number' && Net.seenPg[p.peer] !== pr.pg) { Net.seenPg[p.peer] = pr.pg; Net.acks[p.peer] = pr.pg; }
    if (self && pr.pa && typeof pr.pa === 'object' && pr.pa[self.peer] === Net.pingSeq && Net.pingAt[Net.pingSeq] && !Net.measured[p.peer + Net.pingSeq]) { Net.measured[p.peer + Net.pingSeq] = 1; Net.rtts.push(performance.now() - Net.pingAt[Net.pingSeq]); if (Net.rtts.length > 12) Net.rtts.shift(); }
    if (live) { if (lowPeer === null || p.peer < lowPeer) lowPeer = p.peer; if (typeof pr.ms === 'string' && (claimPeer === null || p.peer < claimPeer)) claimPeer = p.peer; }
    if (typeof pr.ms === 'string') { if (live && !Net.adopted.has(p.peer) && p.updatedAt >= bestAt) { adoptFrom = { peer: p.peer, pr }; bestAt = p.updatedAt; } } else Net.adopted.delete(p.peer);
  }
  for (const [id, r] of [...remotes]) if (!seen.has(id)) { if (!r.goneAt) r.goneAt = nowMs; else if (nowMs - r.goneAt > 2500) removeRemote(id); }
  // 0.5d：已經在當主控（3 秒以上）的人優先，有人加入或回來不換人；都沒人在當，才給代號最小的
  if (self && input.started && Net.isHost && Net.hostT > 3 && (claimPeer === null || self.peer < claimPeer)) claimPeer = self.peer;
  hostPeer = claimPeer !== null ? claimPeer : lowPeer;
  const amHost = !self || !input.started ? true : hostPeer === self.peer;
  let hpEnt = null; if (!amHost) { const hp = hpEnt = list.find(p => p.peer === hostPeer); hostPres = hp && hp.presence; Net.hostName = (remotes.get(hostPeer) || {}).name || '其他玩家'; } else Net.hostName = '你';
  if (amHost && !Net.wasHost) viewToSim();
  if (amHost && input.started && self && adoptFrom) { Net.adopted.add(adoptFrom.peer); applyHostPack(adoptFrom.pr); for (const v of mons) { v.x = v.tx; v.z = v.tz; v.f = v.tf; } viewToSim(); }
  Net.isHost = amHost; Net.wasHost = amHost; Net.hostT = amHost && input.started && self ? (Net.hostT || 0) + dt : 0;
  if (!amHost && hostPres && typeof hostPres.ms === 'string') { hostFeed(hpEnt, hostPeer); Net.adopted.add(hostPeer); } else if (amHost) { Net.hostSrc = null; }
  if (input.started && self) {
    Net.hbT += dt; if (Net.hbT > 0.9) { Net.hbT = 0; Net.hb = (Net.hb + 1) % 100000; }
    Net.pingT += dt; if (Net.pingT > 2 && remotes.size) { Net.pingT = 0; Net.pingSeq++; Net.pingAt[Net.pingSeq] = performance.now(); delete Net.pingAt[Net.pingSeq - 6]; netSet('pg', Net.pingSeq, true); }
    const acks = {}; let n = 0; for (const id of remotes.keys()) if (Net.acks[id] != null && n < 14) { acks[id] = Net.acks[id]; n++; }
    netSet('pa', acks, true); netSet('r', document.hidden ? 0 : 1); netSet('hb', Net.hb); netSet('n', P.name); netSet('lk', me.lookStr || P.look); netSet('g6', Ars.gearCode()); netSet('fi', Fish.pres()); netSet('ek', ekMask()); netSet('tw', me.tower8 ? Math.round(me.tower8.y * 10) : null); /* R4：站在獵臺上＝臺面高度×10，別人才看得到你站高 */ netSet('lv', P.lv);
    netSet('ad', me.ad); netSet('pt', me.team || null); netSet('ol', P.pk > 0 ? 1 : null);      // 0.6 對打：攻擊力、隊伍、通緝
    netSet('x', r1(me.x)); netSet('z', r1(me.z)); netSet('f', r2(me.f)); netSet('a', !me.alive ? 4 : me.sit ? 10 : me.dodge ? 3 : me.stun > 0 ? 7 : me.cast || me.rush ? 8 : me.charge ? 6 : me.guard ? 5 : me.swim ? 2 : me.sprinting ? 9 : me.speed01 > 0.15 ? 1 : 0); netSet('as', me.as); netSet('ac', me.ac); if (me.ac === 8) netSet('ak', me.ak || 0);
    if (me.dodge) netSet('dd', DODGE_KINDS.indexOf(me.dodge.kind)); if (me.cast) netSet('sc', me.cast.S.i); if (me.charge) netSet('ck', Math.round(me.charge.k * 10));
    if (evDirty) { evDirty = false; netSet('ev', me.evs.slice(), true); } netSet('hp', Math.round(me.hp / D.maxHp * 100));
    if (dmgFlushAt && clock > dmgFlushAt) { dmgFlushAt = 0; dmgDirty = true; }      // 0.7：剛倒下的野獸 3 秒後從 d 拿掉
    if (dmgDirty) { dmgDirty = false; const live = {}; let c = 0; for (const v of MV()) { const k = mkey(v); if (myDmg[k] && (v.st !== MST.DEAD || clock - (v.deadAt ?? -99) < 3) && c < 40) { live[k] = myDmg[k]; c++; } } netSet('d', live); }      // 0.7：倒下不到 3 秒的也送（主控端一擊打倒時，這一下的傷害才送得出去，隊友的委託才算得到）
    if (amHost) { const pk = hostPack(); netSet('ms', pk.ms); netSet('mb', pk.mb); netSet('mc', pk.mc); netSet('es', pk.es); } else { netSet('ms', null); netSet('mb', null); netSet('mc', null); netSet('es', null); }      /* X12：md、ma 改送 mb、mc */
  }
  netFlush(now);
  if (Net.mvTime >= 1.5) { Net.rxRate = Net.mvCount / Net.mvTime; Net.mvCount = 0; Net.mvTime = 0; }
}
export function say(text) { me.sayN++; tagSay(me.tag, text); ui.chat(P.name, text, '#f2a24a'); if (Net.room && Net.selfPeer) netSet('say', { n: me.sayN, t: text }, true); else ui.log('目前是單人模式，其他人看不到訊息。'); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) Net.hostT = 0; if (document.hidden) Store.flush(); if (Net.room && input.started && Net.selfPeer) { netSet('r', document.hidden ? 0 : 1, true); netFlush(performance.now()); } });

/* ============================== 存檔 ============================== */
const LS_KEY = 'wanshou-profile-v2';
const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
const exCore = (N0 = WORLD.FOG0) => { /* 0.8：N0 給 WORLD.FOG06＝0.6 的 130×130 */ const N = WORLD.FOG, o = (N - N0) / 2, a = new Uint8Array(N0 * N0); for (let z = 0; z < N0; z++) for (let x = 0; x < N0; x++) a[z * N0 + x] = P.explored[(z + o) * N + x + o]; return a; };      // 迷霧正中央 96×96（0.5a 的範圍）
/* 0.8（X0a）：舊存檔的迷霧（N0×N0）放回新格網的正中央 */
const exPut = (s, N0) => { const N = WORLD.FOG, o = (N - N0) / 2, a = new Uint8Array(N0 * N0); unpackEx(s, a); P.explored.fill(0); for (let z = 0; z < N0; z++) for (let x = 0; x < N0; x++) P.explored[(z + o) * N + x + o] = a[z * N0 + x]; };
const exLoad3 = s => { const a = typeof s === 'string' ? M7.rleDec(s, WORLD.FOG * WORLD.FOG) : null; if (a) P.explored.set(a); return !!a; };      /* ex3：游程編碼，長度不是 210×210 就解不開（回傳 false） */
const packEx = a => { let s = ''; for (let i = 0; i < a.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) if (a[i + k]) b |= 1 << k; s += String.fromCharCode(b); } return btoa(s); };
const unpackEx = (s, a) => { try { const b = atob(s); for (let i = 0; i < b.length && i * 8 < a.length; i++) { const c = b.charCodeAt(i); for (let k = 0; k < 8; k++) a[i * 8 + k] = (c >> k) & 1; } } catch (e) {} };
// 0.6 的存檔欄位 h6：w 擁有的武器 [[編號, 階級, 獸飾, 減半位元, 一階用的鹿皮數], …]｜td 做過的階（位元）｜ck 穿著的披肩｜rc 學會的配方（位元）｜f／t 料理與藥劑的增益 [代號, 剩幾秒]｜s／e 飽食與精力｜pa 被動天賦
function save6() { const o = Object.assign(Ars.save(), Craft.save(), Needs.save(), Fish.save()); if (P.pas.gather) o.pa = 1; return o; }
function load6(h) {
  h = h && typeof h === 'object' ? h : null; curWp = parseLook(P.look).wp; Ars.load(h, curWp);
  if (!Ars.has(curWp)) { const o = Ars.owned()[0]; if (o) { const l = parseLook(P.look); l.wp = curWp = o.wp; P.look = lookStr(l); } }      // 外觀裡的武器不在武器架上（資料不一致）：改拿架上的第一把
  Craft.load(h); Needs.load(h); Fish.load(h); P.pas = { gather: h && h.pa ? 1 : 0 };
}
export const Store = {
  mode: 'pending', uid: null, reason: '', dirty: false, saving: false, lastSave: 0, needCreator: true, has: false,
  snapshot() { return { v: 2, xv: EXP_VER, name: P.name, look: P.look, lv: P.lv, exp: P.exp, stats: P.stats, pts: P.pts, gold: P.gold, inv: P.inv, kills: P.kills, deaths: P.deaths, ex: packEx(exCore()), ex2: packEx(exCore(WORLD.FOG06)), ex3: M7.rleEnc(P.explored), /* 0.8：ex3＝整張 210×210（游程編碼）；ex2（0.6 的 130×130）、ex（0.5a 的 96×96）照寫，回退舊版用 */ bag: P.bag, qs: P.q, ld: P.lastDeath, sk: P.skills, sl: P.slots, gift: P.gift, gq: P.giftQ, kc: P.kc, tr7: T7.save(P), h6: save6(), b7: B7.save(P), m7: M7.save(), pk: Math.round(P.pk || 0), x8: H8.saveAll(), updated: new Date().toISOString() }; },      // x8：0.8 各模組的存檔（hooks08.save8）      // pk：通緝還剩幾秒（在線時間）
  load(d) {
    if (!d || typeof d !== 'object') return false;
    if (typeof d.name === 'string') P.name = d.name.slice(0, 12); P.kills = num(d.kills, 0) | 0; P.deaths = num(d.deaths, 0) | 0;
    if (typeof d.look === 'string') { P.look = lookStr(parseLook(d.look)); this.needCreator = !isNewLook(d.look); }
    P.lv = clamp(num(d.lv, 1) | 0, 1, LV_CAP); P.pts = Math.max(0, num(d.pts, 0) | 0); { const m = expMigrate(P.lv, Math.max(0, num(d.exp, 0) | 0), d.xv); P.pts += (m.lv - P.lv) * 10; P.lv = m.lv; P.exp = m.exp; } /* 0.6 第二段之前的存檔（沒有 xv）：先照舊需求補完該升的級，剩下的經驗照比例換到新需求；等級不降 */ while (P.lv < LV_CAP && P.exp >= expNeed(P.lv)) { P.exp -= expNeed(P.lv); P.lv++; P.pts += 10; } if (P.lv >= LV_CAP) P.exp = 0; P.gold = Math.max(0, num(d.gold, 0) | 0);
    if (d.stats && typeof d.stats === 'object') { let sum = 0; const s = baseStats(); for (const k of STAT_KEYS) { s[k] = clamp(num(d.stats[k], 5) | 0, 5, 999); sum += s[k] - 5; } if (sum + P.pts <= (P.lv - 1) * 10) P.stats = s; else P.pts = (P.lv - 1) * 10; }
    if (d.inv && typeof d.inv === 'object') { P.inv = {}; for (const k in d.inv) if (ITEMS[k] && d.inv[k] > 0) P.inv[k] = Math.min(9999, d.inv[k] | 0); }
    P.kc = {}; if (d.kc && typeof d.kc === 'object') for (const k in d.kc) if (d.kc[k] > 0 && k.length < 24) P.kc[k] = Math.min(99999, d.kc[k] | 0);
    if (!exLoad3(d.ex3)) { if (typeof d.ex2 === 'string') exPut(d.ex2, WORLD.FOG06); else if (typeof d.ex === 'string') exPut(d.ex, WORLD.FOG0); } /* 0.8：ex3 整張；沒有就讀 ex2＝0.6／0.7 的 130×130、ex＝0.5a 的 96×96，放回正中央 */      // 0.5a 的存檔：96×96 放回新格網的正中央
    P.lastDeath = Math.min(Date.now(), Math.max(0, num(d.ld, 0))); P.pk = clamp(num(d.pk, 0), 0, PVP.outlawMax);
    loadQuests(d.qs);      // 舊版的單線任務進度（quest 欄位）作廢，從頭開始
    if (Array.isArray(d.sk)) { P.skills = [...new Set(d.sk.filter(id => typeof id === 'string' && SKILLS[id]))]; P.slots = [0, 1, 2, 3].map(i => Array.isArray(d.sl) && P.skills.includes(d.sl[i]) ? d.sl[i] : null); for (let i = 1; i < 4; i++) if (P.slots[i] && P.slots.indexOf(P.slots[i]) < i) P.slots[i] = null; }
    P.gift = Array.isArray(d.gift) && d.gift.length ? d.gift.filter(id => typeof id === 'string' && SKILLS[id]).slice(0, 4) : null; if (P.gift && !P.gift.length) P.gift = null;
    P.giftQ = Array.isArray(d.gq) ? d.gq.filter(Array.isArray).map(l => l.filter(id => typeof id === 'string' && SKILLS[id])).filter(l => l.length > 1).slice(0, 6) : []; if (!P.gift && P.giftQ.length) P.gift = P.giftQ.shift();
    if (d.bag && typeof d.bag === 'object' && d.bag.until > Date.now()) P.bag = { x: num(d.bag.x, 0), z: num(d.bag.z, 0), gold: num(d.bag.gold, 0) | 0, until: d.bag.until };
    T7.load(P, d.tr7); load6(d.h6); B7.load(P, d.b7); M7.load(P, d.m7); H8.loadAll(d.x8); /* 0.7 地圖（w7-map；舊存檔沒有 m7＝空的） */      /* 0.7 委託板（舊存檔沒有 b7：從零開始） */      // 0.6：武器架、配方、飽食與精力、增益（0.5a 的舊存檔沒有 h6：只留手上那把武器、其餘給初值）
    grantBasics(true, true);      // 基礎技能：依等級補上（舊存檔升到新版時也會拿到）；放進技能欄要等外觀載入、知道拿什麼武器之後（bootNet）
    return true;
  },
  local() { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  async init() {
    const { user, db } = Net;
    try { this.uid = user ? await user.id() : null; } catch (e) { this.uid = null; }
    if (db && this.uid) {
      try { const snap = await withTimeout(db.doc('players/' + this.uid).get(), 8000); if (snap && snap.exists) { const d = snap.data() || {}; this.load(d); P.serial = num(d.uid, null); this.mode = 'cloud'; this.has = true; return; } { const l = this.local(); if (l && typeof l.name === 'string' && l.name && this.load(l)) { this.has = true; let canW = true; try { canW = !(user && typeof user.canEdit === 'function') || (await user.canEdit()) !== false; } catch (e) { canW = true; } if (canW) { this.mode = 'cloud-new'; let r = null; try { r = await this.register(P.name); } catch (e) { r = null; } if (this.mode === 'cloud') { this.migrated = true; return; } this.migrateMsg = (r && r.msg) || ''; } this.mode = 'local'; this.reason = this.migrateMsg ? '名字已被使用，暫存本機' : '還沒有雲端存檔'; return; } } /* 11-19：雲端沒有角色、本機有 → 自動搬到雲端（失敗才留本機） */ this.mode = 'cloud-new'; return; } /* 0.7：雲端沒有這個角色、本機有 → 讀本機（檢視者讀得到資料庫但寫不進去，原本每次都要重新創角） */ catch (e) { /* 讀不到就改用本機 */ }
    }
    { const l = this.local(); this.has = !!(this.load(l) && l && typeof l.name === 'string' && l.name); } this.mode = 'local'; this.reason = !Net.user && !Net.db ? '訪客' : !this.uid ? '無身分' : '讀不到資料庫';
  },
  async register(name) {
    if (this.mode === 'cloud-new') {
      const db = Net.db, uid = this.uid;
      try {
        const keyDoc = db.doc('names/n' + Array.from(new TextEncoder().encode(name.toLowerCase())).map(b => b.toString(16).padStart(2, '0')).join(''));
        const lease = await withTimeout(keyDoc.acquire({ holder: uid, ttlMs: 5000 }), 8000); if (!lease.acquired) return { ok: false, msg: '這個名字正在被別人註冊，請稍後再試或換一個。' };
        const cur = await withTimeout(keyDoc.get(), 8000), cd = (cur.exists && cur.data()) || {}; if (cd.owner && cd.owner !== uid) return { ok: false, msg: '這個名字已經有人使用了。' };
        await withTimeout(keyDoc.set({ owner: uid, name }), 8000);
        let serial = null; const ctr = db.doc('meta/counter');
        for (let i = 0; i < 6 && serial == null; i++) { const l = await withTimeout(ctr.acquire({ holder: uid, ttlMs: 5000 }), 8000); if (!l.acquired) { await new Promise(r => setTimeout(r, 500 + Math.random() * 500)); continue; } const c = await withTimeout(ctr.get(), 8000), n = Math.max(1, num(c.exists && c.data() && c.data().next, 1) | 0); await withTimeout(ctr.set({ next: n + 1 }), 8000); serial = n; }
        if (serial == null) throw new Error('counter busy');
        P.name = name; P.serial = serial; await withTimeout(db.doc('players/' + uid).set(Object.assign({ uid: serial, created: new Date().toISOString() }, this.snapshot())), 8000);
        this.mode = 'cloud'; return { ok: true };
      } catch (e) { this.mode = 'local'; this.reason = '無寫入權限'; }
    }
    P.name = name; this.dirty = true; this.flush(); return { ok: true };
  },
  flush() {
    if (!this.dirty || this.saving || !input.started) return; this.dirty = false; this.lastSave = performance.now();
    const snap = this.snapshot();
    if (this.mode === 'cloud') { this.saving = true; Net.db.doc('players/' + this.uid).update(snap).catch(() => { this.dirty = true; }).then(() => { this.saving = false; }); }
    else if (this.mode === 'local') { try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) { this.mode = 'none'; this.reason = '瀏覽器不允許存檔'; } }
  },
  label() {
    if (this.mode === 'cloud') return ['雲端資料庫' + (P.serial != null ? '（UID #' + String(P.serial).padStart(3, '0') + '）' : ''), 's-ok'];
    if (this.mode === 'cloud-new') return ['雲端資料庫（尚未註冊）', 's-ok'];
    if (this.mode === 'local') return ['僅此瀏覽器' + (this.reason ? '（' + this.reason + '）' : ''), 's-warn'];
    if (this.mode === 'none') return ['不存檔' + (this.reason ? '（' + this.reason + '）' : ''), 's-bad'];
    return ['確認中', ''];
  }
};
export async function bootNet() {
  let api = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  if (!api) { try { api = await withTimeout(import('./sb/platform.js').then(m => m.sbPlatform()), 8000); } catch (e) { api = null; } }      /* GitHub Pages 版：沒有 window.claude 就用 Supabase 轉接層（js/sb/）；沒設定或載入失敗＝null＝單機 */
  const use = n => api ? Promise.resolve().then(() => api.use(n)).catch(() => null) : Promise.resolve(null);
  const [room, user, db] = await Promise.all([use('room'), use('user'), use('db')]);
  Net.room = room || null; Net.user = user || null; Net.db = db || null;
  if (room) { try { room.onConnection(c => { Net.connected = !!c; }, e => { Net.fatal = (e && e.code) || 'error'; }); room.onPeers(() => {}, e => { Net.fatal = (e && e.code) || 'error'; }); } catch (e) { Net.fatal = 'error'; } }
  await Store.init(); revealTown(); refreshDerived(); me.hp = D.maxHp; me.st = D.maxSt; me.mp = D.maxMp; applyLook(); grantBasics(true); fitSlots(); Net.ready = true;
}

/* ============================== 每幀 ============================== */
// 角色腳底的高度：平常貼地；游泳時浮在水面（o.sw 是 0–1 的游泳程度，姿勢也用它），停著踩水時身體直立、沉得深一點，划水前進時身體打平、浮得高一點
function floatY(o, dt) {
  if (o.tower8) return o.tower8.y;      /* X10：站在獵臺的臺面上 */
  const g = Hgt(o.x, o.z), wl = waterLevel(o.x, o.z), on = !!o.swim && wl > -1e8 && o.alive !== false;
  o.sw = damp(o.sw || 0, on ? 1 : 0, on ? 7 : 9, dt); if (o.sw < 0.003) { o.sw = 0; return g; }
  const sc = o.avatar.group.scale.x, sub = lerp(1.2, 0.75, o.avatar.w.stroke) * sc - Math.sin(W.time * 2.4 + (o.tf || 0)) * 0.035;
  return Math.max(g, lerp(g, wl - sub, o.sw));
}
export function tick(dt, realDt, now, fxp, fzp) {
  Net.frameT = typeof now === 'number' && isFinite(now) ? performance.timeOrigin + now : 0;      /* F5：這一幀的時間（本機時鐘毫秒，用 rAF 的時間戳；不受主執行緒卡頓影響）。送出位置的取樣時間、收到快照的播放時間都用它 */
  clock += dt; rclock += realDt; rdt = realDt;
  updateMe(dt); T7.tick(dt);      // 0.7 陷阱：要在 updateMe 之後（被夾住時把位置釘回夾子上）
  if (ready6) { Gather.update(dt, input.useHeld && input.started && !input.typing && !input.creator && !input.talk); Craft.update(dt); Needs.update(dt); Fish.update(dt); Ars.update(); if (input.started && !input.creator && !Ars.count()) Ars.claimFirst(curWp); }      // 0.6 的模組；創角選的那把是第一把武器
  updateProjs(dt); questReach(dt); if (ready6) B7.update(dt); M7.tick(dt); M7.syncTraps(T7.trapList); S7.tick(realDt); pvpTick(realDt);
  if (Net.isHost) { hostSimulate(realDt); simToView(); } if (X8.sim.size) x8Simulate(realDt);      // 野獸的模擬照真實時間走：命中停頓只慢自己的畫面，不會讓主控端打中東西時全場的野獸跟著停
  netTick(realDt, now);
  updateMonViews(dt, fxp, fzp);
  { const c = me.alive && me.charge && setOf(me.avatar) === 'bow' ? me.charge : null;      // 弓蓄力：畫出箭會飛去的方向（有自動對準時會指到那隻野獸身上）
    if (c) { const A = HEAVY.bow, f = aimAngle(A.range, true), [, v] = lockOk(me.lock) ? [0, me.lock] : aimPick(A.range, 0.32); fxAim({ x: me.x + Math.sin(f) * 1.1, y: meY() + 1.42, z: me.z + Math.cos(f) * 1.1, f, len: v ? Math.max(1, Math.hypot(v.x - me.x, v.z - me.z) - 1.6) : A.range * (0.4 + 0.25 * c.k), k: c.k }); } else fxAim(null); }
  fxLock(lockOk(me.lock) ? me.lock : null, me.lock ? MON[me.lock.type].body * me.lock.size * 1.1 + 0.45 : 1);
  updateRemotes(dt);
  const y = me.y = floatY(me, dt); me.avatar.group.position.set(me.x, y + hopY(me), me.z); me.avatar.group.rotation.y = me.f + spinYaw(me);
  me.avatar.update(dt, pose(me, me.avatar));
  { let i = 0; const rip = o => { const d = waterDepth(o.x, o.z); if (d > 0.12 && i < 4) setRipple(i++, o.x, o.z, o.sw > 0.5 ? 0.45 + 0.55 * clamp(o.speed01 * 2.2, 0, 1) : 0.3 + 0.5 * clamp(o.speed01, 0, 1)); }; rip(me); for (const r of remotes.values()) rip(r); while (i < 4) setRipple(i++, 0, 0, 0); }
  me.avatar.group.visible = !(me.alive && me.iframe > 0 && !me.dodge && Math.floor(clock * 20) % 2 === 0 && me.flash <= 0);
  if (me.tag.sayT > 0) { me.tag.sayT -= dt; if (me.tag.sayT <= 0) me.tag.say.classList.remove('on'); }
  me.tag.name.textContent = P.name; me.tag.el.classList.toggle('noname', input.cam.mode === 'tps'); placeTag(me.tag, me.x, y + 3.05, me.z, input.started && !input.creator && !input.talk);
  markT -= realDt; const remark = markT <= 0; if (remark) markT = 0.4;
  for (const n of npcs) { const near = Math.hypot(n.x - fxp, n.z - fzp) < 60; n.avatar.group.visible = near; if (near) { const dm = Math.hypot(n.x - me.x, n.z - me.z); n.cf = dampAng(n.cf == null ? n.f : n.cf, dm < 9 && !input.creator ? Math.atan2(me.x - n.x, me.z - n.z) : n.f, 5, dt); n.avatar.group.rotation.y = n.cf; n.avatar.update(dt, pose(NPC_POSE, n.avatar)); } if (n.tag.sayT > 0) { n.tag.sayT -= dt; if (n.tag.sayT <= 0) n.tag.say.classList.remove('on'); } if (remark) { const mark = npcMark(n.id); if (n.mark !== mark) { n.mark = mark; n.mk.textContent = MARK_CH[mark] || ''; n.mk.className = 'tag-mark ' + mark; } } placeTag(n.tag, n.x, Hgt(n.x, n.z) + 3.1, n.z, near && !input.creator && !input.talk && Math.hypot(n.x - me.x, n.z - me.z) < 30); }
  if (Store.dirty && now - Store.lastSave > 10000) Store.flush();
  BB.frame(dt); BA7.frame(dt); BA8.frame(dt);      // 0.7 新野獸：毒池、纏住、咬住、挑飛、撞暈的星星、測試用生成的同步
  H8.frame(dt);      // 0.8：共同時鐘、各模組的 frame 事件
}
const NPC_POSE = {}, MARK_CH = { offer: '！', hidden: '！', turnin: '？', talk: '…' }; let markT = 0;
BA7.init({ sim, mons, packs, packWait, ledger, myDmg, mkey, startMove, playerOf, me, remotes, hurtMe, netSet, Net, ui, clock: () => clock, x8: X8 /* 0.8：試煉野獸，beastai07 找不到編號時查 */ });
BA8.init({ sim, mons, packs, packWait, ledger, myDmg, mkey, startMove, playerOf, me, remotes, hurtMe, netSet, Net, ui, clock: () => clock, x8: X8, P, ITEMS, room, Store, input });      /* 0.8 X3a */      // 0.7 新野獸
H8.init({ sim, mons, packs, ledger, myDmg, mkey, startMove, playerOf, me, remotes, hurtMe, hitMon, netSet, Net, ui, P, ITEMS, addItem, take, gainExp, questAct, questKill, pvpPair, allyOf, teamOf, Store, W, Hgt, clock: () => clock });      // 0.8 接點（hooks08.js）
BB.init({ sim, mons, packs, packWait, ledger, myDmg, mkey, startMove, playerOf, me, remotes, hurtMe, netSet, Net, ui, eliteK, clock: () => clock, x8: X8 });
export const debug = { BB, BA7, PVP, pvpPair, party, allyOf, nearPlayer, invite: invitePlayer, inviteIn: () => ivIn, inviteOut: () => ivOut, sim, ledger, myDmg, projs, fx, hurtMe, hitMon, hostEvent, pack: () => hostPack(), unpack: pr => applyHostPack(pr), actTimes, WHIFF, BACK, seatFor, setLook: devLook, questHurt, questKill, questAct, M6, elites, placeElite, eliteNext, eliteRespawn, eliteK, save6, load6, ekMask, inCombat, derived: () => D, lockPick, aimPick, pose };
