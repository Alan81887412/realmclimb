// 0.8 X3a 新野獸行為：猴群（偷小東西、託管制）、箭豬（豎刺反傷、噴刺環、倒衝）、鱷魚（曬背／潛伏、衝咬、咬住拖行、菁英巨鱷翻滾翻肚）。照 beastai07 的接法。
// 接口（game.js 補丁 game.js-patch-X3a.py 只做匯入＋呼叫）：init(ctx)｜owns(w)｜host(w, X)｜free(w)｜hidden(v)｜perched(v)｜vuln(v)｜shape(v, M)｜onHurt(v, M, res)｜make(type, size, elite)｜frame(dt)｜struggle()｜shake(v)
// 同步原則（和沼蟒纏住同一套）：主控端模擬野獸；每個人只改「自己的」背包與血量。
//   偷竊：猴子伸手（monkey_steal，不傷人）→ 被偷的那個人自己的程式看到猴子出手＋人在範圍內，就把一份東西從自己的背包搬到託管欄（theft08.js），並在 presence 放 k8＝[被哪幾隻猴拿著]；
//         主控端看到 k8 才讓那隻猴抱著東西逃；所有人看 k8 決定猴子抱不抱東西（畫面道具）。歸還全由被偷的人自己的程式依「看得到的猴子狀態」判斷（打倒、重生、離開、超時、自己倒下），別人不能動你的背包。
//   咬住：croc_grab 打中的人自己算被咬，在 presence 放 c8＝[鱷魚編號]；主控端看到 c8 才開始拖，拖行位移是主控端的鱷魚位置（大家看到一樣），被咬的人自己跟著鱷魚嘴走。
import * as THREE from './three.bundle.js';
import { MON, MOVES, MOVE_IDS, MON_BASE_LV, MST, TAU, TEMPER, clamp, lerp, angDiff, dampAng, monStats, waterLevel } from './core.js';
import { Hgt, waterDepth, collide, nowHour } from './world.js';
import { popNumber, emit, fxRing, fx } from './actors.js';
import { actionOf, keyOf } from './keys.js';
import { animCreature } from './creatures.js';
import * as BM from './beasts08.js';
import * as H8 from './hooks08.js';
import { rain } from './weather08.js';
import { makeLedger, STEAL_OK, THEFT } from './theft08.js';
import { CROC, dragEnd, edgeDist, inDanger, mood, overChase } from './crocdrag08.js';
import { MON08, LV_BASE08 } from './data08.js';      /* 0.8 X8 */
const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, PI = Math.PI;

/* ============================== 資料 ============================== */
// 數值第一版（數值組之後調）：猴 8 級單隻很脆（群體以偷東西為主）；箭豬 6 級耐打但反傷；鱷魚 4 級（南湖）基準，一次衝咬＋咬住拖滿 ≤ 4 級角色血量 35%（crocdrag08.js 的 comboTotal 有測試）
/* 0.8 X8：數字在 data08.js（MON08、LV_BASE08；core.js 的 MON 指向同一批物件，兩邊不會不一致）。鱷魚新手保護的檢查在 team/x8/tests/check_x8.mjs */
export const MON08A = { monkey: MON08.monkey, porc: MON08.porc, croc: MON08.croc };
export const LV08A = { monkey: LV_BASE08.monkey, porc: LV_BASE08.porc, croc: LV_BASE08.croc };
const mv = (name, anim, shape, o) => Object.assign({ name, anim, shape, wind: 0.6, strike: 0.3, recover: 0.7, dash: 0, at: 0, dmg: 1, min: 0, max: 3, w: 1.8, r: 3, r0: 0, arc: 1, off: 0, dir: 0, track: 0.6, cd: 0, low: 1 }, o);
// 新欄位：steal8 偷東西的手（不傷人）｜calm8 偷東西與抱著的狀態不要染紅眼｜hold8 打中會被咬住｜stag8 打中會踉蹌幾秒｜reflect8 豎刺（打中牠的人被反傷）｜back8 倒衝距離（朝身後）｜sh8 預警形狀由 BA8.shape 決定
// 狀態招式（arg 帶階段，省招式編號；現有 41＋這包 12＝53，上限 63）：monkey_st arg1＝蹲在樹上；croc_st arg1＝潛伏（被驚動後）、arg2＝滑入水、arg4＝咬住拖行中
export const MOVES08A = {
  monkey_steal: mv('伸手偷', 'steal', 'circle', { wind: 0.8, strike: 0.6, recover: 0.6, r: 0, nj: 1, sh7: 1, calm8: 1, steal8: 1, max: 3.2 }),
  monkey_st: mv('蹲樹', 'sit', 'circle', { wind: 0.1, strike: 0.1, recover: 3600, r: 0, nj: 1, sh7: 1, calm8: 1 }),
  monkey_bite: mv('猴咬', 'bite', 'cone', { wind: 0.45, strike: 0.2, recover: 0.6, r: 2.2, arc: 0.8, at: 0.08, dmg: 0.8, max: 2.0 }),
  monkey_tug: mv('扯披肩', 'tug', 'cone', { wind: 0.55, strike: 0.25, recover: 0.7, r: 2.6, arc: 0.9, at: 0.1, dmg: 0.5, max: 2.4, stag8: 0.5, cd: 5 }),
  porc_quill: mv('豎刺', 'quill', 'circle', { wind: 0.6, strike: 2.2, recover: 0.8, r: 0, nj: 1, sh7: 1, reflect8: 1, max: 4.5, cd: 8 }),
  porc_burst: mv('噴刺環', 'burst', 'circle', { wind: 0.9, strike: 0.25, recover: 0.9, r: 5, at: 0.12, dmg: 0.9, max: 5, cd: 5 }),
  porc_back: mv('倒衝', 'back', 'line', { wind: 0.6, strike: 0.5, recover: 0.9, dash: 0, back8: 6, w: 1.6, max: 6.5, dmg: 0.85, behind: 1, track: 0, sh7: 1, sh8: 1 }),
  croc_st: mv('鱷魚狀態', 'bite', 'circle', { wind: 0.1, strike: 0.1, recover: 3600, r: 0, nj: 1, sh7: 1 }),
  croc_lunge: mv('水中衝咬', 'lunge', 'line', { wind: 0.8, strike: 0.35, recover: 0.9, dash: 4, w: 2.6, min: 1.4, max: 5.4, dmg: 1.0, cd: 3.5 }),
  croc_grab: mv('咬住', 'bite', 'line', { wind: 0.7, strike: 0.3, recover: 0.9, dash: 1.5, w: 2.8, max: 3.0, dmg: 0.7, hold8: 1, cd: 2 }),
  croc_roll: mv('翻滾', 'roll', 'circle', { wind: 0.4, strike: 1.0, recover: 1.2, r: 0, nj: 1, sh7: 1 }),
  croc_snap: mv('岸上咬', 'bite', 'cone', { wind: 0.5, strike: 0.2, recover: 0.7, r: 3.0, arc: 0.9, at: 0.08, dmg: 0.8, max: 3.0 })
};
// 場景參數（X1 之後給真座標；先用參數）：猴樹 { x, z, h（樹上高度）}、鱷魚水域 { x, z, r（水面半徑，水深約 0.2 處）}
import { TREES08 as TREES_X1, CROC_HOMES08 as HOMES_X1 } from './places08.js';      /* 0.8 X1：猴樹座標與每隻鱷魚的家（places08.js） */
export const TREES08 = TREES_X1.map(t => Object.assign({}, t));
export const CROC_HOMES08 = HOMES_X1.map(h => Object.assign({}, h));
const TYPES = new Set(Object.keys(MON08A));
let ready = false;
export function enable() {
  if (ready) return true; ready = true; Object.assign(MON, MON08A); Object.assign(MON_BASE_LV, LV08A); TEMPER.troop = '群居'; TEMPER.lurk = '伏水';
  for (const id in MOVES08A) { if (MOVES[id]) continue; const M = MOVES08A[id]; M.id = id; M.i = MOVE_IDS.length; MOVES[id] = M; MOVE_IDS.push(id); }
  if (MOVE_IDS.length > 63) console.warn('招式超過 63 種，編碼放不下');
  return true;
}
enable();

/* ============================== 共用 ============================== */
let C = null, frameN = 0, now = 0;
const ST = new WeakMap(), sq = new Map();
const S8 = w => { let s = ST.get(w); if (!s) ST.set(w, s = {}); return s; };
const monOf = id => C.mons[id] || (C.x8 ? C.x8.mons.find(v => v.id === id) : undefined);
const monsAll = () => (C.x8 && C.x8.mons.length ? C.mons.concat(C.x8.mons) : C.mons);
export const owns = w => !!w && TYPES.has(w.type);
const dist = (a, b) => hyp(a.x - b.x, a.z - b.z);
const alive = w => w.st !== MST.DEAD;
const packOf = w => (w.pack != null && C.packs.get(w.pack)) || [w];
function face(w, x, z, rate, dt) { const a = Math.atan2(x - w.x, z - w.z), d = angDiff(w.f, a); w.f += clamp(d, -rate * dt, rate * dt); }
function walk(w, X, x, z, sp, rate = 10) { const dx = x - X.nx, dz = z - X.nz, d = hyp(dx, dz); if (d < 0.05) return d; const s = Math.min(sp * X.dt, d); X.nx += dx / d * s; X.nz += dz / d * s; w.f = dampAng(w.f, Math.atan2(dx, dz), rate, X.dt); return d; }
function setAct(w, M, st, arg = 0) { w.M = M; w.arg = arg; w.mvc = (M.i + 1) | (w.enr ? 64 : 0); w.st = st; w.t = 0; if (st === MST.RECOVER) w.rd = 1e6; else if (st === MST.STRIKE) w.sd = 1e6; w.chain = null; }
const holdsK = (id, key, mid) => { if (id === 'self') return LED.heldIds().includes(mid); const r = C.remotes.get(id), p = r && r.lastPres; return !!(p && Array.isArray(p[key]) && p[key].includes(mid)); };
const holdsC = (id, mid) => { if (id === 'self') return !!(grab && grab.id === mid); const r = C.remotes.get(id), p = r && r.lastPres; return !!(p && Array.isArray(p.c8) && (p.c8[0] | 0) === mid); };
function othersDmg(w, who) { const L = C.ledger.get(C.mkey(w)); let n = 0; if (L) for (const [k, d] of L) if (k !== who) n += d; return n; }
const breakHp = w => { const v = monOf(w.id); return monStats(w.type, v ? v.lv : MON_BASE_LV[w.type], false).hp * CROC.breakFrac; };      /* 同級普通個體血量的 5%（製作人裁決 20:35 第 3 條） */
const hitRes = res => res === 'hit' || res === 'broken';

/* ============================== 偷竊託管（被偷的人自己的程式） ============================== */
const LED = makeLedger(() => (C && C.P ? C.P.inv : {}), id => (C && C.room ? C.room(id) : 9999), { change: (k, e, why) => onLedger(k, e, why) });
H8.save8('k8', () => LED.save(), d => { LED.load(d); if (C && C.P) { lastK8 = ''; C.Store.dirty = true; C.ui.dirty = true; } });      /* 存檔：託管欄跟著 snapshot 一起存；讀檔時全部搬回背包 */
let lastK8 = '';
const itemName = id => (C && C.ITEMS && C.ITEMS[id] && C.ITEMS[id].name) || id;
function onLedger(kind, e, why) {
  if (!C) return; C.Store.dirty = true; C.ui.dirty = true; const me = C.me, y = Hgt(me.x, me.z) + 3.4;
  if (kind === 'steal') { popNumber(me.x, y, me.z, '猴子偷走了 ' + itemName(e.item) + '！', 'hurt'); C.ui.tip('m8steal', '猴子偷走了你一份東西：它沒有消失，被託管著。打倒那隻抱著東西逃跑的猴子（或等牠離開、五分鐘到期）就會原樣還給你。'); }
  else if (kind === 'return') popNumber(me.x, y, me.z, '拿回 ' + itemName(e.item) + (why === 'down' ? '' : ''), 'heal');
  else if (kind === 'pending') { popNumber(me.x, y, me.z, itemName(e.item) + ' 放不下，留在託管', 'call'); C.ui.tip('m8pend', '背包放不下被偷的東西：先留在託管欄，騰出空間會自動領回。'); }
}
export const custody = () => LED.list();
export const claim = () => LED.claim();
const CARRY_ST = new Set([MST.FLEE, MST.STAGGER, MST.WIND, MST.STRIKE, MST.RECOVER]);
const seenSteal = new WeakMap();
function victimTick(dt) {
  const me = C.me; if (!C.input.started) return;
  if (!me.alive && LED.entries.length) LED.returnAll('down');      /* 玩家倒下：全部還 */
  LED.expire(now);
  for (const e of LED.entries.slice()) {
    if (e.mid == null) continue; const v = monOf(e.mid);
    if (!v || v.spawn !== e.sp || v.st === MST.DEAD) { LED.returnWhere(x => x === e, 'dead'); continue; }      /* 被打倒／重生／消失 */
    if (hyp(v.x - me.x, v.z - me.z) > 60) { LED.returnWhere(x => x === e, 'far'); continue; }
    if (now - e.t0 > THEFT.grace && !CARRY_ST.has(v.st)) { e.nc = (e.nc || 0) + dt; if (e.nc > 1.2) LED.returnWhere(x => x === e, 'left'); } else e.nc = 0;      /* 猴子不再抱著跑了＝離開 */
  }
  if ((victimTick.ct = (victimTick.ct || 0) - dt) <= 0) { victimTick.ct = 3; if (LED.entries.some(e => e.pending)) LED.claim(); }
  // 偷：猴子在出手（WIND 之後的 STRIKE 或收招前段），我在 2.8 公尺內、還活著、不在安全區
  if (me.alive && !me.inSafe) for (const v of monsAll()) {
    if (v.type !== 'monkey' || v.st === MST.DEAD || v.M !== MOVES.monkey_steal) continue; if (!(v.st === MST.STRIKE || (v.st === MST.RECOVER && v.stT < 0.9))) continue;
    if (hyp(v.x - me.x, v.z - me.z) > 2.8) continue; const hid = v.id * 1e6 + v.spawn * 1000 + v.aid; if (seenSteal.get(v) === hid) continue; seenSteal.set(v, hid);
    LED.steal(v.id, v.spawn, now);
  }
  const ids = LED.heldIds(), k = ids.join(','); if (k !== lastK8) { lastK8 = k; C.netSet('k8', ids.length ? ids : null, true); }
}
// 所有人都看得到的「誰抱著東西」：自己的託管＋遠端 presence 的 k8
function carriedSet() { const s = new Set(LED.heldIds()); for (const r of C.remotes.values()) { const p = r.lastPres; if (p && Array.isArray(p.k8)) for (const id of p.k8) s.add(id | 0); } return s; }

/* ============================== 猴群：主控端 ============================== */
const treeOf = w => { let b = null, bd = 30; for (const t of TREES08) { const d = hyp(t.x - w.hx, t.z - w.hz); if (d < bd) { bd = d; b = t; } } return b; };
export const perched = v => !!v && v.type === 'monkey' && v.st === MST.RECOVER && v.M === MOVES.monkey_st && v.arg === 1;
function goPerch(w, s, X, tree) { s.ph = 'perch'; s.pt = 0; s.tree = tree; setAct(w, MOVES.monkey_st, MST.RECOVER, 1); w.target = null; X.nx = tree.x; X.nz = tree.z; w.kx = w.kz = 0; return true; }
function shakeW(w) { const s = S8(w); if (s.ph !== 'perch') return false; s.ph = null; const t = s.tree; w.st = MST.STAGGER; w.t = 0; w.stagDur = 1.5; w.M = null; w.arg = 0; w.mvc = 0; w.immune = 0; if (t) { w.x = t.x + 1.3; w.z = t.z; } w.provoked = true; return true; }
export function shake(v) {      /* 重攻擊打向蹲樹的猴子：搖樹（猴子落地暈 1.5 秒）。主控端直接做；其他人把事件放進 presence 的 sk8 */
  if (!C || !v) return; if (C.Net.isHost) { const w = C.sim[v.id]; if (w) shakeW(w); } else C.netSet('sk8', [v.id, (shake.n = (shake.n || 0) + 1)], true);
}
function startCarry(w, s, who) { s.carry = { who, t0: s.clk || 0 }; w.target = null; w.provoked = false; w.fleeFrom = who; w.st = MST.FLEE; w.t = 0; w.M = null; w.mvc = 0; w.arg = 0; s.ph = null; }
function hostMonkey(w, X, s) {
  const dt = X.dt, Dm = MON.monkey; s.clk = (s.clk || 0) + dt;
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.ph = null; s.carry = null; s.bored = 0; s.curT = 0; s.clk = 0; }
  if (s.ph === 'perch') {      /* 蹲在樹上：不能被近戰打到；有人搖樹或被遠程打下來就落地；沒人時下樹 */
    s.pt += dt; const t = s.tree; X.nx = t.x; X.nz = t.z;
    if (w.st === MST.STAGGER || w.st === MST.DEAD) { s.ph = null; s.carry = null; return false; }
    let near = 1e9; for (const [, p] of X.players) near = Math.min(near, hyp(p.x - t.x, p.z - t.z));
    if (s.carry) { if (!holdsK(s.carry.who, 'k8', w.id) && s.clk - s.carry.t0 > 4) { s.carry = null; s.ph = null; w.st = MST.IDLE; w.t = 0; w.M = null; w.mvc = 0; w.arg = 0; return true; } if (s.pt > 60) { s.carry = null; s.ph = null; w.st = MST.IDLE; w.t = 0; w.M = null; w.mvc = 0; w.arg = 0; return true; } }
    else if (s.pt > 20 && near > 14) { s.ph = null; w.st = MST.IDLE; w.t = 0; w.M = null; w.mvc = 0; w.arg = 0; w.provoked = false; w.target = null; return true; }
    if (w.M !== MOVES.monkey_st || w.st !== MST.RECOVER) setAct(w, MOVES.monkey_st, MST.RECOVER, 1);
    return true;
  }
  if (s.carry) {      /* 抱著東西逃：往猴樹跑、爬上去；沒有樹就跑開約 18 秒後「離開」；被抱的人 k8 清掉（歸還了）就停止 */
    const c = s.carry, p = C.playerOf(c.who);
    if (w.st === MST.DEAD) { s.carry = null; return false; }
    if (!holdsK(c.who, 'k8', w.id) && s.clk - c.t0 > 4) { s.carry = null; w.st = MST.IDLE; w.t = 0; return true; }
    if (s.clk - c.t0 > 18 && !treeOf(w)) { s.carry = null; w.st = MST.IDLE; w.t = 0; w.target = null; w.provoked = false; return true; }
    if (w.st === MST.STAGGER || w.st === MST.WIND || w.st === MST.STRIKE || (w.st === MST.RECOVER && w.M)) return false;      /* 被打到：照遊戲原本的踉蹌／反擊 */
    if (w.st !== MST.FLEE) { w.st = MST.FLEE; w.t = 0; }
    const tr = treeOf(w);
    if (tr) { if (hyp(tr.x - w.x, tr.z - w.z) < 1.2) return goPerch(w, s, X, tr); walk(w, X, tr.x, tr.z, Dm.speed * 1.2); }
    else if (p) { const dx = w.x - p.x, dz = w.z - p.z, l = hyp(dx, dz) || 1; walk(w, X, w.x + dx / l * 8, w.z + dz / l * 8, Dm.speed * 1.2); }
    return true;
  }
  if (w.M === MOVES.monkey_steal && (w.st === MST.STRIKE || w.st === MST.RECOVER)) { for (const [id] of X.players) if (holdsK(id, 'k8', w.id)) { startCarry(w, s, id); return true; } }      /* 被偷的人的 k8 裡有我 → 抱著逃 */
  if (w.st === MST.DEAD) return false;
  const led = C.ledger.get(C.mkey(w));
  if (w.provoked || led) {      /* 被打：反擊（咬、扯，遊戲原本的流程）；血量剩一半逃上猴樹 */
    const hp = 1 - Array.from(led ? led.values() : []).reduce((a, b) => a + b, 0) / w.hpMax; const tr = treeOf(w);
    if (tr && hp < 0.5 && w.st !== MST.STAGGER && w.st !== MST.WIND && w.st !== MST.STRIKE) { if (hyp(tr.x - w.x, tr.z - w.z) < 1.2) return goPerch(w, s, X, tr); w.st = MST.FLEE; walk(w, X, tr.x, tr.z, Dm.speed * 1.2); return true; }
    return false;
  }
  if (w.st === MST.IDLE) {      /* 好奇：玩家靠近（察覺距離乘 senseK）就整群湊過來 */
    if (s.bored > 0) { s.bored -= dt; return false; }
    let id = null, best = Dm.aggro * H8.fn.senseK(w); for (const [k, p] of X.players) { const d = hyp(p.x - w.x, p.z - w.z); if (d < best && hyp(p.x - w.hx, p.z - w.hz) < 30) { best = d; id = k; } }
    if (id != null) { for (const o of packOf(w)) if (alive(o) && o.st === MST.IDLE && !o.target) { o.target = id; o.st = MST.CHASE; o.t = 0; S8(o).curT = 0; } if (w.st === MST.IDLE) { w.target = id; w.st = MST.CHASE; w.t = 0; } }
    return false;
  }
  if (w.st === MST.CHASE && X.tgt) {
    const tgt = X.tgt, d = dist(w, tgt); s.curT = (s.curT || 0) + dt;
    if (d > 24 || hyp(tgt.x - w.hx, tgt.z - w.hz) > 34 || s.curT > 16) { w.target = null; w.st = MST.IDLE; w.t = 0; s.bored = 30; return true; }
    const q = sq.get('m' + w.pack) || (w.pack != null ? (sq.set('m' + w.pack, { cd: 0 }), sq.get('m' + w.pack)) : { cd: 0 });
    const mates = packOf(w).filter(o => alive(o) && o.st === MST.CHASE && !o.provoked && !S8(o).carry), thief = mates.length ? mates.reduce((a, b) => (a.id < b.id ? a : b)) : w;
    if (thief === w) { if (d > 1.9) walk(w, X, tgt.x, tgt.z, Dm.speed * 0.9); else { face(w, tgt.x, tgt.z, 8, dt); if (w.cd <= 0 && s.clk >= q.cd) { q.cd = s.clk + 25 + Math.random() * 10; C.startMove(w, MOVES.monkey_steal, tgt); return true; } } }
    else { face(w, tgt.x, tgt.z, 6, dt); if (d > 5.5) walk(w, X, tgt.x, tgt.z, Dm.speed * 0.7); else if (d < 3.0) walk(w, X, w.x - (tgt.x - w.x), w.z - (tgt.z - w.z), Dm.speed * 0.6); }
    return true;
  }
  return false;
}

/* ============================== 箭豬 ============================== */
function hostPorc(w, X, s) {
  if (w.M === MOVES.porc_back && w.st === MST.STRIKE) { const k = MOVES.porc_back.back8 / Math.max(0.05, w.sd) * X.dt; X.nx -= sin(w.f) * k; X.nz -= cos(w.f) * k; if (w.t >= w.sd) { w.st = MST.RECOVER; w.t = 0; } return true; }      /* 倒衝：朝身後（尾巴那邊）衝，預警形狀由 shape() 畫在身後 */
  return false;
}
export function shape(v, M) {      /* porc_back 的預警：線往身後（v.f＋π）畫 */
  const wind = v.st === MST.WIND, br = MON[v.type].body * v.size, A = v.act || M, f = v.f + PI, w = M.w + 2 * (0.45 + br * 0.2);
  if (wind) return { shape: 'line', x: v.x, z: v.z, f, w, len: M.back8 + br + 0.9, p: clamp(v.stT / Math.max(0.05, A.wind), 0, 1) };
  const rem = Math.max(0, 1 - v.stT / Math.max(0.05, A.strike)); return { shape: 'line', x: v.x, z: v.z, f, w, len: M.back8 * rem + br + 0.9, p: 1 };
}
const quillUp = v => v.type === 'porc' && v.st === MST.STRIKE && v.M === MOVES.porc_quill;
function onMyHit(e) {      /* 自己打中箭豬：豎刺中、在 4 公尺內、站在牠背後 120° → 被反傷 40%（只扣自己的血） */
  const v = e && e.v, me = C.me; if (!v || !quillUp(v) || !me.alive) return; const d = hyp(me.x - v.x, me.z - v.z); if (d > 4 + MON.porc.body * v.size) return;
  const rear = v.f + PI, ang = Math.abs(angDiff(rear, Math.atan2(me.x - v.x, me.z - v.z))); if (ang > PI / 3) return;
  const dmg = Math.max(1, Math.round((e.r || e.dmg || 0) * 0.4)); selfDot(dmg, v, '刺反傷 -');
}
function selfDot(dmg, v, label) { const me = C.me; if (!me.alive || me.inSafe) return; if (me.hp - dmg <= 0) { C.hurtMe(dmg * 3, v ? v.x : me.x, v ? v.z : me.z, { mon: v }); return; } me.hp -= dmg; me.lastCombat = C.clock(); popNumber(me.x, Hgt(me.x, me.z) + 2.8, me.z, (label || '-') + Math.round(dmg), 'hurt'); me.flash = Math.max(me.flash, 0.35); }

/* ============================== 鱷魚：主控端 ============================== */
const homeOf = w => { if (w.home8) return w.home8; let b = null, bd = 1e9; for (const h of CROC_HOMES08) { const d = hyp(h.x - w.hx, h.z - w.hz); if (d < h.r + 40 && d < bd) { bd = d; b = h; } } return b ? (w.home8 = b) : null; };
const crocSize = w => MON.croc.size * (w.elite ? 1.38 : 1);
// 休息點：曬背在岸上（水邊外 1.5 公尺）、潛伏在水裡（離岸 2 公尺）；每隻用自己編號決定在哪個方位（每台算出來一樣）
export const spotOf = (home, id, kind) => { const a = (id * 2.399) % TAU, r = kind === 'bask' ? home.r + 1.5 : Math.max(1, home.r - 2.0); return { x: home.x + sin(a) * r, z: home.z + cos(a) * r, f: kind === 'bask' ? a + PI / 2 : a + PI }; };
const nowMood = () => mood(nowHour(), rain());
export function free(w) { if (!w || w.type !== 'croc') return false; const h = w.home8; return !!h && hyp(w.x - h.x, w.z - h.z) < h.r + 6; }      /* 在自己的水域附近：monBlocked 的水深限制略過（鱷魚本來就待在水裡） */
export function hidden(v) {      /* 鎖定與自動瞄準略過：蹲樹的猴子、潛伏中沒被驚動的鱷魚 */
  if (!v) return false; if (perched(v)) return true;
  if (v.type === 'croc' && v.st === MST.IDLE && nowMood() === 'sub') return true; return false;
}
export const vuln = v => (v && v.type === 'croc' && v.st === MST.RECOVER && v.M === MOVES.croc_roll ? CROC.bellyVuln : 1);      /* 翻肚的 1.2 秒受到的傷害 +30% */
function setSt(w, arg) { setAct(w, MOVES.croc_st, MST.RECOVER, arg); }
function startBack(w, s, home, alertSec, arg = 2) { s.ph = arg === 2 ? 'slide' : 'alert'; s.alertEnd = s.clk + alertSec; s.slideT = 0; setSt(w, arg); w.target = null; w.provoked = false; w.kx = w.kz = 0; }
function prey(w, X, home, rs, rad) {      /* 找踩進水裡或岸邊 3 公尺內的玩家（離這隻鱷魚 rad 公尺內，取最近） */
  let id = null, best = rad; for (const [k, p] of X.players) { if (!inDanger(p, home)) continue; const d = hyp(p.x - rs.x, p.z - rs.z); if (d < best) { best = d; id = k; } } return id;
}
function startHold(w, s, X, home, who) {
  const p = C.playerOf(who); if (!p) return false; const el = !!w.elite;
  s.held = who; s.ht = 0; s.p0 = { x: p.x, z: p.z }; s.drag = dragEnd(s.p0, home, el ? CROC.drag.elite : CROC.drag.base, waterDepth); s.prog = 0; s.others0 = othersDmg(w, who); s.rolled = false;
  setAct(w, MOVES.croc_st, MST.STRIKE, 4); w.target = who; w.aid++; w.cd = 99; return true;
}
function release(w, s, home, why) { const who = s.held; s.held = null; s.nb = { who, until: s.clk + 1.0 }; w.immune = Math.max(w.immune, 0.6); w.cd = Math.max(w.cd, 2.2); s.lastRel = why; startBack(w, s, home, 3, 2); return true; }
function holdTick(w, X, s, home) {
  const dt = X.dt, who = s.held, p = C.playerOf(who), el = !!w.elite; s.ht += dt;
  if (w.M === MOVES.croc_roll) {      /* 巨鱷翻滾：預備→翻（被咬的人自己在翻完那一刻被甩開、放開）→翻肚 */
    if (w.st === MST.RECOVER) { s.held = null; s.nb = { who, until: s.clk + 1.0 }; w.cd = 2.0; s.ph = null; return false; } return false; }
  if (!p) return release(w, s, home, 'gone');
  if (s.ht > 0.6 && !holdsC(who, w.id)) return release(w, s, home, 'free');
  if (othersDmg(w, who) - s.others0 >= breakHp(w)) return release(w, s, home, 'ally');
  if (el && s.ht >= CROC.rollAt && !s.rolled) { s.rolled = true; w.M = MOVES.croc_roll; w.arg = 0; w.mvc = (MOVES.croc_roll.i + 1) | (w.enr ? 64 : 0); w.st = MST.WIND; w.t = 0; w.wd = 0.4; w.sd = 1.0; w.rd = CROC.belly; w.aid++; w.immune = 2.4; return false; }
  if (s.ht >= (el ? 6 : 2.6)) return release(w, s, home, 'tired');
  const D = s.drag; if (s.prog < D.dist) s.prog = Math.min(D.dist, s.prog + (D.dist / 1.5) * dt);
  const off = 1.9 * crocSize(w), vx = s.p0.x + D.ux * s.prog, vz = s.p0.z + D.uz * s.prog; X.nx = vx + D.ux * off; X.nz = vz + D.uz * off; w.f = Math.atan2(-D.ux, -D.uz); return true;
}
function hostCroc(w, X, s) {
  const home = homeOf(w); if (!home) return false; const dt = X.dt, el = !!w.elite; s.clk = (s.clk || 0) + dt;
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.ph = null; s.held = null; s.nb = null; s.first = true; w.arg = 0; w.hx = spotOf(home, w.id, 'sub').x; w.hz = spotOf(home, w.id, 'sub').z; }
  if (s.held != null) { const r = holdTick(w, X, s, home); if (r !== null) return r; }
  if (w.M === MOVES.croc_grab && (w.st === MST.STRIKE || (w.st === MST.RECOVER && w.t < 1.0))) { for (const [id] of X.players) if (holdsC(id, w.id) && !(s.nb && s.nb.who === id && s.clk < s.nb.until)) { if (startHold(w, s, X, home, id)) return true; } }
  if (w.st === MST.DEAD) return false;
  const sense = H8.fn.senseK(w), sub = spotOf(home, w.id, 'sub');
  if (s.ph === 'slide') {      /* 滑入水：0.8 秒到潛伏點，之後潛伏約 60 秒（被驚動後） */
    if (w.M !== MOVES.croc_st || w.arg !== 2) setSt(w, 2); s.slideT += dt; const d = walk(w, X, sub.x, sub.z, 4.4, 6); w.f = dampAng(w.f, sub.f, 4, dt);
    if (d < 0.4 || s.slideT > 2.5) { s.ph = 'alert'; if (!(s.alertEnd > s.clk)) s.alertEnd = s.clk + 60; setSt(w, 1); } return true; }
  if (s.ph === 'alert') {
    if (w.M !== MOVES.croc_st || w.arg !== 1) { if (w.st === MST.RECOVER || w.st === MST.IDLE) setSt(w, 1); else return false; }
    X.nx = sub.x; X.nz = sub.z; w.f = dampAng(w.f, sub.f, 4, dt);
    const led = C.ledger.get(C.mkey(w)); let id = w.provoked && X.tgt ? w.target : prey(w, X, home, sub, Math.max(3.5, 14 * sense));
    if (id != null) { s.ph = null; w.target = id; w.st = MST.CHASE; w.t = 0; w.cd = 0; w.M = null; w.arg = 0; w.mvc = 0; return true; }
    if (s.clk >= s.alertEnd && !led) { s.ph = null; w.st = MST.IDLE; w.t = 0; w.M = null; w.arg = 0; w.mvc = 0; }
    return true; }
  if (w.st === MST.IDLE) {      /* 休息：白天晴天曬背（8 公尺內有人就「嘶」一聲滑回水裡）、夜裡下雨潛伏（有人踩進水邊就衝出來） */
    const m = nowMood(), rs = spotOf(home, w.id, m); X.nx = rs.x; X.nz = rs.z; w.f = rs.f;
    if (w.provoked && X.tgt) { w.st = MST.CHASE; w.t = 0; w.cd = 0; return true; }
    if (m === 'bask') { for (const [, p] of X.players) if (hyp(p.x - rs.x, p.z - rs.z) < CROC.warn * sense) { startBack(w, s, home, 60, 2); s.first = true; return true; } }
    else { const id = prey(w, X, home, rs, Math.max(3.5, 14 * sense)); if (id != null) { w.target = id; w.st = MST.CHASE; w.t = 0; w.cd = 0; s.first = true; } }
    return true; }
  if (w.st === MST.CHASE) {
    const tgt = X.tgt; if (!tgt) { startBack(w, s, home, 4, 2); return true; }
    const d = dist(w, tgt), own = edgeDist(w, home), nb = s.nb && s.nb.who === w.target && s.clk < s.nb.until, inW = waterDepth(w.x, w.z) > 0.25;
    if (overChase(w, home) || edgeDist(tgt, home) > CROC.chaseLand + 6 || (!w.provoked && edgeDist(tgt, home) > CROC.bank + 3)) { w.target = null; w.provoked = false; startBack(w, s, home, 4, 2); return true; }      /* 上岸最多追 10 公尺；回頭不回血（脫戰重置要等潛伏結束後再等 5 秒） */
    if (w.cd <= 0) {
      let M = null;
      if (s.first && d <= 5.2 && d >= 1.4) { M = MOVES.croc_lunge; s.first = false; }
      else if (!nb && d <= 2.8) M = MOVES.croc_grab;
      else if (d >= 1.4 && d <= 5.2 && !(w.mcd.croc_lunge > 0)) M = MOVES.croc_lunge;
      else if (own > 0 && d <= 2.9) M = MOVES.croc_snap;
      if (M) { C.startMove(w, M, tgt); return true; }
    }
    face(w, tgt.x, tgt.z, inW ? 4.2 : 1.57, dt);      /* 岸上轉身慢（每秒 90°），水裡 240° */
    if (d > 2.2) { const k = inW ? 1 : 0.6, tx = tgt.x, tz = tgt.z, dd = hyp(tx - home.x, tz - home.z), lim = home.r + CROC.chaseLand - 1, gx = dd > lim ? home.x + (tx - home.x) / dd * lim : tx, gz = dd > lim ? home.z + (tz - home.z) / dd * lim : tz; walk(w, X, gx, gz, MON.croc.speed * k, inW ? 4.2 : 1.57); }
    return true; }
  return false;
}

/* ============================== 主控端入口 ============================== */
export function host(w, X) {
  if (!ready) return false; const s = S8(w); s.px = w.x; s.pz = w.z;
  if (s.frz && (w.st === MST.IDLE || w.st === MST.CHASE)) { const t = X.tgt; if (t) face(w, t.x, t.z, 4, X.dt); return true; }      /* 測試用：按住不動 */
  if (w.type === 'monkey') return hostMonkey(w, X, s);
  if (w.type === 'porc') return hostPorc(w, X, s);
  if (w.type === 'croc') return hostCroc(w, X, s);
  return false;
}

/* ============================== 被打中的那個人自己算：鱷魚咬住、猴子扯披肩 ============================== */
let grab = null, press = 0;
const escNeed = n => Math.max(1, Math.round(n * (1 - H8.capped('escape'))));
export function onHurt(v, M, res) {
  if (!ready || !C.me.alive) return;
  if (M.hold8 && hitRes(res) && !grab) { const el = !!v.elite; grab = { id: v.id, sp: v.spawn, t: 0, n: 0, need: escNeed(el ? CROC.need.elite : CROC.need.base), tk: 0, flung: false }; C.netSet('c8', [v.id], true); C.me.stun = Math.max(C.me.stun, 0.3); popNumber(C.me.x, Hgt(C.me.x, C.me.z) + 3.4, C.me.z, '被鱷魚咬住了！', 'hurt');
    C.ui.tip('m8croc', `被鱷魚咬住往水裡拖：連按 ${keyOf('dodge')}、${keyOf('interact')} 或 ${keyOf('attack')} 掙脫；同伴打牠也會讓牠鬆口。不會被拖進深水。`); }
  if (M.stag8 && hitRes(res)) { C.me.stun = Math.max(C.me.stun, M.stag8 * (1 - H8.capped('immob'))); popNumber(C.me.x, Hgt(C.me.x, C.me.z) + 3.4, C.me.z, '被扯了一把', 'hurt'); }
}
export function struggle() { return grab ? { kind: 'latch', n: grab.n, need: grab.need, by: grab.id, t: grab.t, tmax: 6, drag: null } : null; }
function onPress(e) { if (!grab || grab.t < 0.12) return; const code = e.type === 'keydown' ? e.code : 'Mouse' + (e.button | 0); if (e.repeat) return; const a = actionOf(code); if (a !== 'dodge' && a !== 'interact' && a !== 'attack' && e.type !== 'touchstart') return; grab.n++; grab.shake = 0.12; }
let ui8 = null;
function barUi(on, k, txt) {
  if (on && typeof window !== 'undefined' && window.__ui8struggle) on = false;      /* 0.8 X7：介面的掙脫條（ui08e #e8struggle）接上了就不畫這個暫代條（和 beastai07 同一個約定） */
  if (!ui8) { ui8 = document.createElement('div'); ui8.style.cssText = 'position:fixed;left:50%;top:64%;transform:translate(-50%,-50%);z-index:30;pointer-events:none;font:700 16px/1.3 system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 3px #000;display:none';
    ui8.innerHTML = '<div class="t"></div><div style="margin:6px auto 0;width:220px;height:12px;border-radius:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5);overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,#d6a648,#f2e27a)"></i></div>'; document.body.appendChild(ui8); }
  ui8.style.display = on ? '' : 'none'; if (!on) return; ui8.querySelector('.t').textContent = txt; ui8.querySelector('i').style.width = Math.round(clamp(k, 0, 1) * 100) + '%';
}
function freeMe(txt) { const me = C.me; grab = null; C.netSet('c8', null, true); me.stun = 0; me.iframe = Math.max(me.iframe, 0.6); barUi(false); if (txt) popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, txt, 'perfect'); }
function grabTick(dt) {
  const me = C.me, v = monOf(grab.id); grab.t += dt; me.stun = Math.max(me.stun, 0.12); me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.guard = false; me.atk = null; me.charge = null;
  const holding = !!v && v.spawn === grab.sp && v.st === MST.STRIKE && v.M === MOVES.croc_st && v.arg === 4, rolling = !!v && v.M === MOVES.croc_roll && (v.st === MST.WIND || v.st === MST.STRIKE);
  if (!me.alive) { grab = null; C.netSet('c8', null, true); barUi(false); return; }
  if (!v || v.spawn !== grab.sp || v.st === MST.DEAD) return freeMe('脫身');
  if (v.M === MOVES.croc_roll && v.st === MST.RECOVER && !grab.flung) {      /* 巨鱷翻滾完：一次大傷害，把人甩到側邊 3 公尺放開 */
    grab.flung = true; const dx = me.x - v.x, dz = me.z - v.z, l = hyp(dx, dz) || 1; let best = null, bd = 1e9;
    for (const sg of [1, -1]) { const nx = me.x + (-dz / l) * 3 * sg, nz = me.z + (dx / l) * 3 * sg, dep = waterDepth(nx, nz); if (dep < bd) { bd = dep; best = [nx, nz]; } } me.x = best[0]; me.z = best[1];
    C.hurtMe(v.dmg * 1.5, v.x, v.z, { heavy: 1, mon: v }); return freeMe('被甩開了'); }
  if (grab.n >= grab.need) return freeMe('掙脫！');
  if (!holding && !rolling && grab.t > 1.3) return freeMe('牠鬆口了');
  if (grab.t > 12) return freeMe('脫身');
  if (holding) {      /* 跟著鱷魚嘴走（不超過一點點）；水太深就不再往前（主控端算終點時已經避開，這裡再擋一次） */
    const br = 1.9 * v.size, mx = v.x + sin(v.f) * br, mz = v.z + cos(v.f) * br, dx = me.x - mx, dz = me.z - mz, d = hyp(dx, dz);
    if (d > 0.95) { const nx = mx + dx / d * 0.95, nz = mz + dz / d * 0.95; if (waterDepth(nx, nz) <= CROC.maxDepth || waterDepth(nx, nz) <= waterDepth(me.x, me.z)) { me.x = nx; me.z = nz; } } me.sprinting = false;
    grab.tk -= dt; if (grab.tk <= 0) { grab.tk = 1.0; selfDot(v.dmg * 0.12, v, '-'); } }
  if (grab.shake > 0) { grab.shake -= dt; fx.shake = Math.max(fx.shake, 0.08); }
  barUi(true, grab.n / grab.need, `連按 ${keyOf('dodge')}／${keyOf('interact')}／${keyOf('attack')} 掙脫`);
}

/* ============================== 模型 ============================== */
export function make(type, size, elite) {
  if (!TYPES.has(type)) return null; const m = BM.makeBeast08(type, size, { elite: !!elite }); m.elite = !!elite;
  m.anim = (mm, v, dt, t) => {      /* 引擎在出招狀態會把眼睛染紅；偷東西、抱著、鱷魚潛伏等「不是要打人」的狀態把眼睛改回平常 */
    animCreature(mm, v, dt, t);
    if (v.M && v.M.calm8 && (v.st === MST.WIND || v.st === MST.STRIKE || v.st === MST.RECOVER)) { const ec = (mm.sp && mm.sp.D && mm.sp.D.eyeCol) || [1, 0.7, 0.3], G = mm.mats[0].userData.glow.value; G.setRGB(ec[0] * 0.3, ec[1] * 0.3, ec[2] * 0.3); mm.mats[0].userData.dim.value = 0; } };
  return m;
}

/* ============================== 每一幀 ============================== */
let lastT8 = '', tests = []; const lastSk = new Map();
function viewTick(dt) {
  const carried = carriedSet(); const m = nowMood();
  for (const v of monsAll()) {
    if (!TYPES.has(v.type) || !v.model) continue;
    if (v.type === 'monkey') {
      const carry = carried.has(v.id) && v.st !== MST.DEAD;
      v.pose = perched(v) ? 'perch' : carry ? 'carry' : v.st === MST.IDLE && (v.speed || 0) < 0.4 ? 'sit' : undefined;
      if (perched(v)) { const t = TREES08.reduce((b, q) => (!b || hyp(q.x - v.x, q.z - v.z) < hyp(b.x - v.x, b.z - v.z) ? q : b), null); if (t) v.model.root.position.y += (t.h || 3) * 0.9; if (v.tag) v.tag.el.style.display = 'none'; }
    } else if (v.type === 'porc') {
      v.pose = v.M === MOVES.porc_quill && (v.st === MST.WIND || v.st === MST.STRIKE) ? 'up' : undefined;
    } else if (v.type === 'croc') {
      const h = (v.home8) || homeFor(v); if (!v.home8 && h) v.home8 = h; const w = C.sim[v.id];
      if (h && v.st === MST.IDLE) { const rs = spotOf(h, v.id, m); if (v.px8 !== m) { v.px8 = m; } v.tx = rs.x; v.tz = rs.z; v.tf = rs.f; if (hyp(v.x - rs.x, v.z - rs.z) > 8) { v.x = rs.x; v.z = rs.z; } }
      const inW = waterDepth(v.x, v.z) > 0.25;
      v.pose = v.st === MST.IDLE ? (m === 'bask' ? 'sun' : 'sub') : v.st === MST.RECOVER && v.M === MOVES.croc_st ? (v.arg === 2 ? 'rise' : v.arg === 1 ? 'sub' : undefined) : v.st === MST.CHASE && inW ? 'rise' : undefined;
      const wl = waterLevel(v.x, v.z); if (wl > -1e8 && waterDepth(v.x, v.z) > 0.05) v.model.root.position.y = Math.max(v.model.root.position.y, wl - 0.02);      /* 水面高度：鱷魚浮在水面（沉的姿勢模型自己往下沉 0.44） */
      if (v.tag && v.pose === 'sub') v.tag.el.style.display = 'none';
      void w;
    }
  }
}
const homeFor = v => { let b = null, bd = 1e9; for (const h of CROC_HOMES08) { const d = hyp(h.x - v.hx, h.z - v.hz); if (d < h.r + 40 && d < bd) { bd = d; b = h; } } return b; };
export function frame(dt) {
  if (!C) return; frameN++; now = C.clock(); const Net = C.Net;
  if (Net.isHost) { const s = tests.map(g => g.join(',')).join(';'); C.netSet('t8', s || null); }
  else { let hp = null; for (const r of C.remotes.values()) if (r.lastPres && typeof r.lastPres.ms === 'string') { hp = r.lastPres; break; } if (hp && typeof hp.t8 === 'string' && hp.t8 !== lastT8) { lastT8 = hp.t8; mirror(hp.t8); } }
  victimTick(dt);
  if (Net.isHost) for (const [peer, r] of C.remotes) { const p = r.lastPres, sk = p && p.sk8; if (Array.isArray(sk) && lastSk.get(peer) !== sk[1]) { lastSk.set(peer, sk[1]); const w = C.sim[sk[0] | 0]; if (w) shakeW(w); } }
  if (grab) grabTick(dt); else barUi(false);
  viewTick(dt);
}

/* ============================== 測試用生成（__dev07 才開放） ============================== */
const KIND = { monkey: { n: 5, lv: 8, d: 16 }, porc: { n: 1, lv: 6, d: 8 }, croc: { n: 1, lv: 4, d: 12 } };
function addMon(type, lv, x, z, pack, f, elite, home) {
  const id = C.sim.length, st = monStats(type, lv, !!elite), D = MON[type], nm = elite && type === 'croc' ? '巨鱷' : D.name;
  C.mons.push({ id, type, lv, elite: !!elite, name: nm, drop: undefined, orb: undefined, hx: x, hz: z, x, z, f, tx: x, tz: z, tf: f, st: MST.IDLE, stT: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, dmg: st.dmg, exp: st.exp, size: st.size, speed: 0, flash: 0, model: null, tag: null, tele: null, others: 0, credited: -1, idleT: Math.random() * 5, mvc: 0, arg: 0, enr: 0, M: null, act: null, tg: null, judged: -1, ox: x, oz: z, of: 0, lx: x, lz: z, test8: 1, home8: home || null });
  const w = { id, type, elite: !!elite, pack, moves: D.moves.map(m => MOVES[m]), hx: x, hz: z, x, z, f, st: MST.IDLE, t: 0, aid: 0, spawn: 0, hpMax: st.hp, baseHp: st.hp, target: null, seen: {}, wanderT: Math.random() * 4, wx: x, wz: z, cd: 0, kx: 0, kz: 0, stagDur: 0.2, mvc: 0, arg: 0, enr: 0, M: null, wd: 0, sd: 0, rd: 0, chain: null, mcd: {}, last: '', provoked: false, fleeFrom: null, immune: 0, hits: 0, retreat: 0, sprung: false, near: 1e9, test8: 1, home8: home || null };
  C.sim.push(w); if (pack != null) { if (!C.packs.has(pack)) C.packs.set(pack, []); C.packs.get(pack).push(w); } return C.mons[id];
}
function group(kind, lv, x, z, f, n, elite, home) { const pack = n > 1 ? 8000 + tests.length : null, out = []; for (let k = 0; k < n; k++) { const a = f + PI / 2 + k * 2.2, r = n > 1 ? 2.6 + k * 0.4 : 0; out.push(addMon(kind, lv, x + sin(a) * r, z + cos(a) * r, pack, f, elite, home)); } return out; }
function mirror(s) { for (const [i, g] of s.split(';').entries()) { if (i < tests.length) continue; const [kind, lv, x, z, f, n, id0, el, hx, hz, hr] = g.split(','); if (!KIND[kind] || +id0 !== C.sim.length) return; const home = hr ? { x: +hx, z: +hz, r: +hr } : null; if (home) CROC_HOMES08.push(home); tests.push([kind, +lv, +x, +z, +f, +n, +id0, +el, +hx, +hz, +hr]); group(kind, +lv, +x, +z, +f, +n, !!+el, home); } }
export async function spawnTest(kind = 'monkey', o = {}) {
  if (!KIND[kind]) throw new Error('沒有這種：' + kind); if (!C.Net.isHost) { console.warn('只有主控端能生成'); return []; }
  const K = KIND[kind], me = C.me, f0 = o.f ?? me.f, d = o.d ?? K.d, x = o.x ?? me.x + sin(f0) * d, z = o.z ?? me.z + cos(f0) * d, f = Math.atan2(me.x - x, me.z - z), lv = o.lv ?? K.lv, n = o.n ?? K.n, el = !!o.elite;
  let home = null; if (kind === 'croc') { home = o.home || { x, z, r: 8 }; CROC_HOMES08.push(home); }
  tests.push([kind, lv, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(f * 100) / 100, n, C.sim.length, el ? 1 : 0, home ? home.x : '', home ? home.z : '', home ? home.r : '']);
  const out = group(kind, lv, x, z, f, n, el, home);
  if (home) for (const m of out) { const sp = spotOf(home, m.id, 'sub'), w = C.sim[m.id]; for (const q of [m, w]) { q.hx = q.x = sp.x; q.hz = q.z = sp.z; } m.tx = sp.x; m.tz = sp.z; }
  return out;
}
function force(id, moveId, who = 'self') { const w = C.sim[id], p = C.playerOf(who); if (!w || !p || !MOVES[moveId]) return false; w.target = who; w.provoked = true; w.cd = 0; if (w.st === MST.IDLE || w.st === MST.RECOVER) { w.st = MST.CHASE; w.M = null; } C.startMove(w, MOVES[moveId], p); return true; }
function clear() { for (const w of C.sim) if (w.test8) { w.st = MST.DEAD; w.t = -1e6; w.target = null; const v = C.mons[w.id]; v.st = MST.DEAD; v.stT = 99; if (v.model) v.model.root.visible = false; if (v.tag) v.tag.el.style.display = 'none'; } grab = null; LED.returnAll('clear'); }
export function init(ctx) {
  C = ctx; if (typeof window === 'undefined') return;
  H8.on('me:hitMon', onMyHit);
  window.addEventListener('keydown', onPress, true); window.addEventListener('mousedown', onPress, true); window.addEventListener('touchstart', onPress, { capture: true, passive: true });
  if (window.__dev07) {
    const D = window.__dev08 = window.__dev08 || {};
    D.monkey = o => spawnTest('monkey', o); D.porc = o => spawnTest('porc', o); D.croc = o => spawnTest('croc', o);
    window.__beast08a = { spawn: spawnTest, force, clear, MON08A, MOVES08A, TREES08, CROC_HOMES08, ledger: LED, custody, claim, shake, spotOf,
      freeze: (id, on = true) => { const w = C.sim[id]; if (w) S8(w).frz = !!on; },
      state: () => ({ grab: grab && { id: grab.id, t: +grab.t.toFixed(2), n: grab.n, need: grab.need }, held: LED.list(), heldIds: LED.heldIds(), tests: tests.slice(), mood: nowMood() }),
      sim: id => { const w = C.sim[id], s = S8(w); return { st: w.st, M: w.M && w.M.id, arg: w.arg, x: +w.x.toFixed(2), z: +w.z.toFixed(2), ph: s.ph || null, held: s.held ?? null, carry: s.carry && s.carry.who, target: w.target, lastRel: s.lastRel || null, nb: s.nb ? +(s.nb.until - (s.clk || 0)).toFixed(2) : null }; } };
  }
}
