// 0.8 競技場試煉（d8-play P3）。規格：design08/0.8 設計定案.md 第 3 節；接口：d8-play/介面08.md 第 5、5b、8、9 節。
// 做法（P3-a 定案＝甲）：試煉的野獸只在挑戰者（兩人組＝組長）的瀏覽器模擬（game.js 的 X8：hostSimulate 同一套 AI，不進世界的 sim／hostPack、編號 9000 起），
//   組長在 presence 放一個小欄位 t8（試煉代號、階段、時間、條件、每隻一筆和 hostPack 同格式的位置狀態），看臺與隊友照它畫；隊友的傷害照野外的方式（presence d）送給組長。
// P3-a：3-1 原型。P3-c：九個試煉的資料與條件、playerOf 對試煉隊友開例外（X8.mate）。P3-d：百場連戰（10 波、波間 15 秒、斷糧代管、倒下就結束、最遠波數）。
// P3-b：框架——倒下不扣（製作人 01:0x 裁決 1）、木靶收起（裁決 2）、兩人組的進場與沒進場、同時開始的先後、
//   級距天賦球三選一、斷糧代管（百場連戰用，P3-d 接）、trialDemo、組長斷線／切走的收尾。標「暫代」的地方等別組的東西進來就拿掉。
import * as H8 from './hooks08.js';
import { GAUNTLET08 } from './data08.js';      /* 0.8 X8 */
import { X8, D } from './game.js';
import { MON, MST, MOVES, WORLD, ITEMS, SKILLS, SKILL_IDS, monStats, num, r1 } from './core.js';
import * as BA7 from './beastai07.js';
import { W, debugColliders } from './world.js';
import { makeTag, makeTelegraph } from './actors.js';

/* ============================== 資料 ============================== */
// name／cond 的文字以劇情 story08 的 TRIALS08（name、rule）為準（載得到就換上）；這裡的是定案第 3 節的表，story08 沒進來時頂著。
// foes：[種類, 隻數, 等級]｜c：條件代號（k）與門檻（m）｜reward：數值 bal-b（定案第 3 節第一次過關獎勵表）
export const TRIALS = [
  { id: '1-1', tier: 1, name: '讓牠先衝', foes: [{ type: 'boar', n: 2, lv: 4 }], cond: '先閃過 3 次衝撞，再擊敗', mode: 'any', reward: { gold: 85, exp: 175 }, c: [{ k: 'dodge', m: 3 }] },
  { id: '1-2', tier: 1, name: '狼不排隊', foes: [{ type: 'wolf', n: 4, lv: 4 }], cond: '60 秒內擊敗', mode: 'any', reward: { gold: 95, exp: 195 }, c: [{ k: 'time', m: 60 }] },
  { id: '1-3', tier: 1, name: '先擋再打', foes: [{ type: 'bear', n: 1, lv: 4 }], cond: '精準格擋 3 次', mode: 'any', reward: { gold: 120, exp: 250 }, c: [{ k: 'parry', m: 3 }] },
  { id: '2-1', tier: 2, name: '不喝藥', foes: [{ type: 'tiger', n: 2, lv: 9 }], cond: '不喝藥水', mode: 'any', reward: { gold: 220, exp: 1280 }, c: [{ k: 'nopot', m: 0 }] },
  { id: '2-2', tier: 2, name: '影子', foes: [{ type: 'tiger', n: 1, lv: 9 }], cond: '整場不被打中', mode: 'any', reward: { gold: 195, exp: 1150 }, c: [{ k: 'nohit', m: 0 }] },
  { id: '2-3', tier: 2, name: '兩人一組', foes: [{ type: 'bear', n: 1, lv: 9 }, { type: 'tiger', n: 1, lv: 9 }], cond: '兩人組', mode: 'duo', reward: { gold: 345, exp: 2010 }, c: [{ k: 'duo', m: 1 }] },
  { id: '3-1', tier: 3, name: '最兇的那個', foes: [{ type: 'bison', n: 2, lv: 12 }], cond: '讓牛撞牆 2 次', mode: 'any', reward: { gold: 275, exp: 4510 }, c: [{ k: 'daze', m: 2, label: '讓牛撞牆' }] },
  { id: '3-2', tier: 3, name: '鬆口', foes: [{ type: 'python', n: 1, lv: 13 }], cond: '被纏住後 3 秒內脫身 2 次（自己掙或隊友救）', mode: 'any', reward: { gold: 305, exp: 4950 }, c: [{ k: 'free', m: 2 }] },
  { id: '3-3', tier: 3, name: '站得最遠的人', foes: [{ type: 'dog', n: 3, lv: 13 }], cond: '打斷長吠 2 次', mode: 'any', reward: { gold: 305, exp: 4950 }, c: [{ k: 'howl', m: 2 }] }
];
const TBY = Object.fromEntries(TRIALS.map(T => [T.id, T]));
// 條件種類（c.k）：count 型＝n 達到 m 才算（dodge 閃過衝撞、parry 精準格擋、daze 撞牆、free 3 秒內脫身、howl 打斷長吠、duo 兩人組＝兩個人都進場）
//   「不准」型＝n 是違規次數、m 是允許次數（0），n > m 就當場失敗（nopot 喝了回復道具、nohit 被打中）｜time＝n 是已過秒數（超過 m 時固定成 m + 1）、m 秒內要打倒，n > m 當場失敗
const NEG = new Set(['nopot', 'nohit', 'time']);
const metC = c => (NEG.has(c.k) ? c.n <= c.m : c.n >= c.m);
const FREE_T = 3, FREE_SLACK = 0.2;      // 3-2：被纏住後 3 秒內脫身（多給 0.2 秒：隊友被纏時，脫身的消息要從 presence 傳回組長）
// 百場連戰（定案第 3 版 3-2；介面08 GAUNTLET）。P3-d 做，這裡只放資料
export const GAUNTLET = { id: 'g100', name: '百場連戰', waves: 10, betweenT: 15, duoHp: GAUNTLET08.duoHp, reward: { gold: 1560, exp: 13500, box: 'chest_rare' },
  list: GAUNTLET08.list };      /* 0.8 X8：各波等級在 data08.js */
const GT = { id: GAUNTLET.id, tier: 0, name: GAUNTLET.name, foes: [], cond: '', mode: 'any', reward: GAUNTLET.reward, c: [] };      // 百場連戰當作一種「試煉」放進查表（不在 TRIALS 裡）
const tOf = id => TBY[id] || (id === GAUNTLET.id ? GT : null);
// 製作人裁決第 5 條的備案：同步不穩時只開第三級（P3-a 量過，甲做法穩，全開；要縮就改這裡）
const TIER_OPEN = { 1: true, 2: true, 3: true };
// 一般天賦球（級距三個都過＝三選一；已經有的不出現）＝不是稀有、不是基礎技能的那幾顆（重斬、疾步斬、鐵壁、飛刃、火球術、治癒之光）
const ORBS_NORMAL = SKILL_IDS.filter(k => !SKILLS[k].rare && !SKILLS[k].basic);
// 斷糧（百場連戰）：交給巴索代管的＝治療藥水、藥品、料理、乾糧、藥劑、生獸肉
const CARRY = id => id === 'potion' || id === 'meat' || ['med', 'food', 'ration', 'tonic'].includes((ITEMS[id] || {}).kind);
// 競技場的位置（places08 的 ARENA_SPOT08 交了就換上；暫定值見介面08 第 4 節）。北＝−z
const SPOT = { gate: { x: 0, z: -WORLD.ARENA_IN, f: 0 }, book: { x: -3.6, z: -(WORLD.ARENA_OUT + 3.6) } };
const SAND = WORLD.ARENA_IN, IN_R = SAND - 0.45, OUT_R = SAND + 0.6, BEAST_R = SAND - 0.26, RISE_R = SAND + 1.6;      // 柵欄：參戰的人留在 IN_R 內、其他人留在 OUT_R 外；野獸碰到 BEAST_R（獸門、入口）就停；倒下的人在 RISE_R（最近的入口通道）起來
const TGT = [[-3.2, -3.0], [3.4, -2.4], [0, 3.6]];      // 沙地上的木靶（位置同 world.js 815 行、game.js TARGETS）：試煉中收起來（裁決 2）
const PH = { gate: 'g', count: 'c', fight: 'f', between: 'b', done: 'd' }, PH_ = Object.fromEntries(Object.entries(PH).map(([k, v]) => [v, k]));
const GATE_T = 12, GATE_MIN = 1.5, COUNT_T = 3, DONE_T = 3.5, AWAY_T = 10, RISE_HP = 0.3;
// 報幕字幕（劇情 story08 的 ARENA08；沒有就不出字、只響聲音）
let LINES = null;

/* ============================== 狀態 ============================== */
let C = null, DUEL = null, cur = null, view = null, demo = null, B07 = null, B07p = null, p2daze = false, hiddenAt = 0, rise = 0; const lost = new Set();
// cur（自己是組長時）：{ kind 'trial'|'gauntlet', id, T, mode, seq, phase, pt, t, partner: peer|null, ws: [sim], vs: [v], cond: [{k,label,n,m}], res, down, wave, sq（這一波的編號段）, hpK, newRec }
// view（自己不是組長、看得到別人的試煉）：{ peer, seq, id, vs: Map(id → v), me: 自己是不是隊友, down, last: 最後一份 t8, res }
let REC = {}, ORB = {}, GREC = { b: 0, c: 0, x: 0 }, HOLD = [];      // 存檔 t8：REC[id]＝{ c: 過關次數, b: 最佳秒數 }｜ORB[tier]＝領的球｜GREC 百場連戰｜HOLD 巴索代管中的東西 [{ id, n }]
const emit = (k, d) => H8.emit('trial:' + k, d);
const sfx = k => { try { C.ui.sfx('arena', k); } catch (e) {} };
const onSand = o => !!o && Math.hypot(o.x, o.z) < SAND - 0.1;
const loadB07 = () => { if (B07) return Promise.resolve(B07); if (!B07p) B07p = import('./beasts07.js').then(m => (B07 = m)).catch(() => null); return B07p; };
const NOREW = () => ({ gold: 0, exp: 0, orb: null, box: null });

/* ============================== 對外 API（介面08 第 5 節） ============================== */
export function tierOpen(tier) { return !!TIER_OPEN[tier]; }
export function rec(id) { const r = REC[id]; return { cleared: !!(r && r.c > 0), best: r && r.b ? r.b : null }; }
export function tierOrb(tier) { if (ORB[tier]) return 'claimed'; return TRIALS.filter(T => T.tier === tier).every(T => rec(T.id).cleared) ? 'ready' : 'locked'; }
const hasOrb = k => C.P.skills.includes(k) || C.P.inv['orb_' + k] > 0;
export function orbChoices(tier) {      // 三選一：還沒有的一般天賦球；順序每個級距固定（同一個人重開選單看到的一樣）
  if (!C) return []; const a = ORBS_NORMAL.filter(k => !hasOrb(k)), s = (tier * 2) % Math.max(1, a.length); return a.slice(s).concat(a.slice(0, s)).slice(0, 3);
}
export function claimOrb(tier, orb) {
  const st = tierOrb(tier); if (st === 'claimed') return '已經領過了'; if (st !== 'ready') return '這一級還沒全過';
  const ch = orbChoices(tier); if (!ch.length) return '一般天賦球都有了（改給什麼由數值定）'; if (!ch.includes(orb)) return '不在這次的選項裡';
  C.addItem('orb_' + orb); ORB[tier] = orb; C.Store.dirty = true; C.ui.dirty = true; sfx('cheer'); try { C.ui.loot('得到 ' + ITEMS['orb_' + orb].name, ['orb_' + orb]); } catch (e) {}
  horn(line(['common', 'tierClear']).replace('{tier}', '第' + '一二三'[tier - 1] + '級'), 'win'); return true;
}
export function gauntletRec() { return { best: GREC.b | 0, cleared: !!GREC.c, boxClaimed: !!GREC.x }; }
export function carryList() { if (!C) return []; return Object.keys(C.P.inv).filter(id => CARRY(id) && C.P.inv[id] > 0).map(id => ({ id, n: C.P.inv[id] })); }
export function canStart(kind, id, mode = 'solo') {
  if (!C) return '還沒載入';
  const g = kind === 'gauntlet', T = g ? GT : TBY[id];
  if (g ? id && id !== GAUNTLET.id : !T) return g ? '沒有這個連戰' : '沒有這個試煉';
  if (!g && !tierOpen(T.tier)) return '這一級還沒開放';
  if (cur || (view && view.me)) return '已在試煉中';
  if (view) return '別人正在挑戰';
  if (DUEL && typeof DUEL.busy === 'function' && DUEL.busy()) return '沙地上有人在對決';      // 對決（P6 duel08）：有這個模組才檢查
  if (!C.me.alive) return '倒下了';
  if (!g && T.mode === 'duo' && mode !== 'duo') return '要兩人組';
  if (mode === 'duo' && !partnerNear()) return '隊友不在附近';
  for (const r of C.remotes.values()) if (!r.away && onSand(r) && !(mode === 'duo' && r.peer === partnerNear())) return '沙地上有人';
  return null;
}
export function start(kind, id, mode = 'solo', o = {}) {
  const g = kind === 'gauntlet'; if (g) id = GAUNTLET.id;
  const why = o.force ? null : canStart(kind, id, mode); if (why) { C.ui.toast(why); return why; }
  const T = g ? GT : TBY[id]; BA7.enable(); loadB07(); demo = null; mine = null;
  cur = { kind: g ? 'gauntlet' : 'trial', id, T, mode, seq: Math.floor(Math.random() * 2000), phase: 'gate', pt: 0, t: 0, partner: mode === 'duo' ? partnerNear() : null, ws: [], vs: [], cond: T.c.map(c => ({ k: c.k, label: c.label || T.cond, n: 0, m: c.m })), res: null, down: false, carry: [], wave: 0, sq: 0, hpK: 1, newRec: false };
  if (g) cur.carry = holdItems();      // 斷糧：藥水與料理交給巴索代管，出場（過關、倒下、離開、取消）自動還
  if (o.tp) { C.me.x = 0; C.me.z = 4; C.me.f = Math.PI; }      // 測試用：直接站到沙地上
  emit('enter', { kind: cur.kind, id, duo: !!cur.partner }); if (!onSand(C.me)) C.ui.toast('走進沙地，柵欄就會拉起來'); return null;
}
export function leave() {
  if (cur && cur.phase !== 'done') { if (cur.phase === 'gate') { cur.res = null; setPhase('done'); cur.pt = DONE_T; } else finish(false, 'leave'); }
  else if (view && view.me && !view.down) partnerOut('leave');
}
export function state() {
  if (demo) return demoState();
  if (cur) return shape(cur.id, cur.phase, cur.t, cur.pt, cur.cond, cur.partner, cur.wave);
  if (view && view.me && view.last) { const L = view.last, T = tOf(view.id); return shape(view.id, PH_[L.h] || 'fight', num(L.t, 0), num(L.pt, 0), (T.c || []).map((c, i) => ({ k: c.k, label: c.label || T.cond, n: (L.c || [])[i] | 0, m: c.m })), view.peer, L.w | 0); }
  return null;
}
/* cond 一筆：{ label, n, m, ok, fail }。count 型 n/m＝進度；「不准」型（不喝藥、不被打中）m＝0、n＝違規次數，ok＝還沒違規、fail＝違規了；時限型 n＝已過秒數（超過時 m + 1）、m＝時限 */
function shape(id, phase, t, pt, cond, partner, wave) {
  const T = tOf(id), g = id === GAUNTLET.id, r = partner && C.remotes.get(partner);
  return { kind: g ? 'gauntlet' : 'trial', id, name: T.name, phase, t: Math.max(0, r1(t)), limit: g ? null : (T.c.find(c => c.k === 'time') || {}).m || null, count: phase === 'count' ? Math.max(0, Math.ceil(COUNT_T - pt)) : 0,
    wave: g ? wave | 0 : null, waves: g ? GAUNTLET.waves : null, betweenT: g && phase === 'between' ? Math.max(0, Math.ceil(GAUNTLET.betweenT - pt)) : null,
    cond: cond.map(c => { const neg = NEG.has(c.k), fail = neg && c.n > c.m; return { label: c.label, n: c.n, m: c.m, ok: neg ? !fail : c.n >= c.m, fail }; }), partner: partner ? { name: r ? r.name : '隊友' } : null };
}
export function watching() { if (!view || view.me || !view.last) return null; const r = C.remotes.get(view.peer); return { who: view.peer, name: r ? r.name : '挑戰者', t: num(view.last.t, 0) }; }

/* ============================== 組長：流程 ============================== */
function partnerNear() { if (!C.me.team) return null; let best = null, bd = 15; for (const r of C.remotes.values()) { if (r.away || r.pt !== C.me.team || !r.alive) continue; const d = Math.hypot(r.x - C.me.x, r.z - C.me.z); if (d < bd) { bd = d; best = r.peer; } } return best; }
function horn(text, cue = 'horn') { sfx('gong'); emit('horn', { text: text || '', cue }); tempSub(text); }
function line(path) { if (!LINES) return ''; let o = LINES; for (const k of path) { o = o && o[k]; } return typeof o === 'string' ? o : ''; }
function setPhase(ph) { cur.phase = ph; cur.pt = 0; }
function release() {      // 獸門打開：這一波的野獸出來（每隻一個編號，9000 起；同一組放同一群，野牛輪流衝）。百場連戰每一波一個新的編號段 sq（同一場的 q 不變）；兩人組每隻血 ×1.7
  const g = cur.kind === 'gauntlet', T = cur.T, gp = SPOT.gate; let k = 0;
  const foes = g ? GAUNTLET.list[cur.wave - 1].map(([type, n, lv]) => ({ type, n, lv })) : T.foes, total = foes.reduce((a, F) => a + F.n, 0);
  cur.sq = g ? (cur.seq + cur.wave * 7) % 2000 : cur.seq; const pr = cur.partner && C.remotes.get(cur.partner); cur.hpK = g && pr && onSand(pr) ? GAUNTLET.duoHp : 1;
  for (const F of foes) { const pack = F.n > 1 ? 'x8_' + cur.sq + '_' + F.type : null, hp = cur.hpK > 1 ? Math.round(monStats(F.type, F.lv, false).hp * cur.hpK) : undefined;
    for (let i = 0; i < F.n; i++, k++) { const side = (k - (total - 1) / 2) * 2.6, x = gp.x + side, z = gp.z + 1.9, v = X8.make({ id: 9000 + cur.sq * 4 + k, type: F.type, lv: F.lv, x, z, f: 0, pack, hp, sim: true }), w = v.s8;
      w.target = 'self'; w.provoked = true; w.st = MST.CHASE; w.cd = 1.2 + k * 1.5; model(v); cur.ws.push(w); cur.vs.push(v); } }
  sfx('beast'); sfx('go');
}
/* 打鬥開始（倒數完）：條件計數歸零（每一台自己算自己的）、第一波／野獸放出來 */
function startFight() {
  mineStart(); const dc = cur.cond.find(c => c.k === 'duo'); if (dc) setN(dc, cur.partner ? 1 : 0);
  if (cur.kind === 'gauntlet') { cur.wave = 1; cur.prevB = GREC.b | 0; waveStart(); } else { release(); horn(line(['common', 'gate'])); }
}
function waveStart() {      // 百場連戰：放這一波、報幕（story08 的第 n 波＋那一波野獸的一句）、記最遠波數
  release(); const i = cur.wave - 1, wb = LINES && LINES.gauntlet && LINES.gauntlet.waveBeast && LINES.gauntlet.waveBeast[i];
  horn(line(['gauntlet', 'waves', i]) + (wb ? line(['gauntlet', 'beasts', wb]) : ''), 'wave'); emit('wave', { wave: cur.wave, waves: GAUNTLET.waves });
  if (cur.wave > (GREC.b | 0)) { GREC.b = cur.wave; cur.newRec = true; C.Store.dirty = true; }
}
function clearWave() { for (const v of cur.vs) X8.drop(v); cur.ws = []; cur.vs = []; }      // 上一波的屍體收掉（看臺從 t8 的 m 看不到就跟著收）
function waveClear() { if (cur.wave >= GAUNTLET.waves) return finish(true, null); setPhase('between'); horn(line(['gauntlet', 'between']), 'wave'); }
function nextWave() { clearWave(); cur.wave++; setPhase('fight'); waveStart(); }
function finish(ok, reason) {
  const g = cur.kind === 'gauntlet', T = cur.T, time = r1(cur.t); let first, newBest, best, reward;
  if (g) { first = ok && !(GREC.c > 0); newBest = cur.newRec; best = GREC.b | 0; if (ok) GREC.c = (GREC.c | 0) + 1; reward = first ? { gold: GAUNTLET.reward.gold, exp: GAUNTLET.reward.exp, orb: null, box: GAUNTLET.reward.box } : NOREW(); }
  else { const r = REC[cur.id] || (REC[cur.id] = { c: 0, b: 0 }); first = ok && !(r.c > 0); newBest = ok && (!r.b || time < r.b); if (ok) { r.c = (r.c | 0) + 1; if (newBest) r.b = time; } best = r.b || null; reward = first ? { gold: T.reward.gold, exp: T.reward.exp, orb: null, box: null } : NOREW(); }
  if (first) { C.P.gold += reward.gold; C.gainExp(reward.exp, C.me.x, C.me.z); if (g) grantBox(); }
  const returned = g ? (cur.ret || []).concat(returnItems(true)) : cur.carry; cur.ret = returned;      // 百場連戰：代管的東西還了（倒下的那一刻就先還過一次，見 downFn）
  C.Store.dirty = true; C.ui.dirty = true;
  cur.res = { kind: cur.kind, id: cur.id, ok, reason: ok ? null : reason, time, best, newBest, wave: g ? (ok ? GAUNTLET.waves : cur.wave) : null, waves: g ? GAUNTLET.waves : null, reward, returned };
  const txt = g ? (ok ? line(['gauntlet', 'clear']) + (first ? line(['gauntlet', 'reward']) : '') : reason === 'leave' ? line(['common', 'leave']) : line(['gauntlet', 'fail']).replace('{wave}', cur.wave) + (newBest && cur.prevB > 0 ? line(['gauntlet', 'record']).replace('{wave}', cur.wave) : ''))
    : ok ? (first ? line(['common', 'first']) || line(['trials', cur.id, 'win']) : newBest ? line(['common', 'best']).replace('{time}', fmt(time)) || line(['trials', cur.id, 'win']) : line(['trials', cur.id, 'win'])) : reason === 'leave' ? line(['common', 'leave']) : line(['trials', cur.id, 'fail']);
  horn(txt, ok ? 'win' : 'fail');
  if (ok) sfx('cheer');
  emit('result', cur.res); if (ok && !g) try { C.questAct('doTrial:' + cur.id); } catch (e) {}
  setPhase('done');
}
function cleanup() { const ret = cur.ret || (cur.kind === 'gauntlet' ? returnItems(true) : []); for (const v of cur.vs) X8.drop(v); cur = null; mine = null; C.netSet('t8', null, true); emit('gate', { open: true }); sfx('gate'); emit('exit', { returned: ret }); }
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;
function lead(dt) {
  const me = C.me, g = cur.kind === 'gauntlet'; cur.pt += dt;
  // 組長這邊卡住或切走超過 AWAY_T 秒（遊戲迴圈停了；看臺與隊友那邊這時已經收掉、隊友拿到 lost）：這一場算 away，免得兩邊對不上
  { const t = performance.now(); if (!noAway && cur.ms && t - cur.ms > AWAY_T * 1000 && cur.phase !== 'gate' && cur.phase !== 'done') finish(false, 'away'); cur.ms = t; }
  const pr = cur.partner && C.remotes.get(cur.partner), here = onSand(me) && me.alive && !cur.down, mate = !cur.partner || (pr && onSand(pr));
  if (cur.phase === 'gate' || cur.phase === 'count') {
    // 同時有兩個人按開始（彼此還沒看到對方的 t8）：對方已經開打、或對方代號比較小 → 這一場取消（柵欄至少開 GATE_MIN 秒，讓 t8 來得及傳到）
    for (const r of C.remotes.values()) { const L = r.lastPres && r.lastPres.t8; if (L && typeof L === 'object' && tOf(L.i) && r.peer !== cur.partner && (L.h === 'f' || L.h === 'b' || L.h === 'd' || r.peer < (C.Net.selfPeer || ''))) { C.ui.toast('別人先開始了，這一場取消'); cur.res = null; setPhase('done'); cur.pt = DONE_T; break; } }
  }
  if (cur.phase === 'gate') {
    if ((here && mate && cur.pt >= GATE_MIN) || cur.pt > GATE_T) {
      if (!here) { C.ui.toast('沒有走進沙地：試煉取消'); cur.res = null; setPhase('done'); cur.pt = DONE_T; }
      else if (!mate && cur.T.mode === 'duo') { C.ui.toast('隊友沒有進場：試煉取消'); cur.res = null; setPhase('done'); cur.pt = DONE_T; }
      else { if (!mate) { cur.partner = null; C.ui.toast('隊友沒有進場：一個人打'); } setPhase('count'); emit('gate', { open: false }); sfx('gate'); horn(g ? line(['gauntlet', 'open']) : line(['trials', cur.id, 'open']) || line(['common', 'fence'])); cur.cnt = COUNT_T; }
    }
  }
  else if (cur.phase === 'count') { const n = Math.ceil(COUNT_T - cur.pt); if (n !== cur.cnt && n > 0) { cur.cnt = n; sfx('count'); } if (cur.pt >= COUNT_T) { setPhase('fight'); startFight(); } }
  else if (cur.phase === 'fight' || cur.phase === 'between') {
    cur.t += dt; const meOut = cur.down || !me.alive || !onSand(me), mateOut = !cur.partner || !pr || !pr.alive || !onSand(pr);
    if (cur.phase === 'fight') {
      // 撞牆（暫代：P2 的 beast:daze 還沒交，自己看模擬裡的撞暈招；收到 P2 對試煉野牛的事件就改用事件，見 init）
      if (!p2daze) for (const w of cur.ws) { const dz = w.st === MST.RECOVER && w.M === MOVES.bison_daze; if (dz && !w.dz8) bump(w); w.dz8 = dz; }
      watchSims(); updConds();
      const alive = cur.ws.some(w => w.st !== MST.DEAD), bad = cur.cond.some(c => NEG.has(c.k) && c.n > c.m);
      if (bad) finish(false, 'cond');      // 不喝藥、不被打中、時限：違規的當場失敗
      else if (!alive) { if (g) waveClear(); else finish(cur.cond.every(metC), 'cond'); }
      else if (meOut && mateOut) finish(false, 'down');
    } else if (meOut && mateOut) finish(false, 'down');
    else if (cur.pt >= GAUNTLET.betweenT) nextWave();
    else if (cur.pt >= 4 && cur.ws.length) clearWave();
  } else if (cur.phase === 'done' && cur.pt >= DONE_T) { cleanup(); return; }
  // 送給看臺與隊友：試煉代號、序號、階段、時間、條件、隊友、每隻一筆（和 hostPack 同格式）；百場連戰多 w（第幾波）、sq（這一波的編號段）
  C.netSet('t8', { q: cur.seq, i: cur.id, h: PH[cur.phase], t: r1(cur.t), pt: r1(cur.pt), c: cur.cond.map(c => c.n), p: cur.partner || undefined, w: g ? cur.wave : undefined, sq: g ? cur.sq : undefined, m: cur.ws.map(w => X8.pack(w)), r: cur.res ? (cur.res.ok ? 1 : 0) : undefined });
}
/* 條件：count 的加一（daze 撞牆、free 脫身、howl 打斷長吠）；其他由 updConds 每幀算 */
function setN(c, n) { if (n === c.n) return; c.n = n; emit('cond', { i: cur.cond.indexOf(c), n, m: c.m }); }
function countCond(k) { const c = cur && cur.cond.find(c => c.k === k); if (c) setN(c, c.n + 1); }
function bump(w) { countCond('daze'); }
/* 這一台自己的人（組長或隊友）在打鬥中的計數：me:hurt 事件（閃過衝撞、精準格擋）、挨打次數（me.stats.hits：擋住也算被打中；閃過、格擋、無敵不算）、回復道具的消耗
   隊友那台把自己的數字放進 presence 的 u8＝[q, 閃, 擋, 挨打, 喝藥]，組長加進條件裡 */
let mine = null, noAway = false;      /* noAway：測試截圖用（swiftshader 畫一張要好幾秒，不關掉會被當成切分頁） */
const healSum = () => { let n = 0; for (const id of Object.keys(C.P.inv)) if (id === 'potion' || (ITEMS[id] && (ITEMS[id].heal || ITEMS[id].regen))) n += C.P.inv[id] | 0; return n; };
function mineStart() { mine = { d: 0, p: 0, h: 0, w: 0, h0: C.me.stats.hits | 0, inv: healSum() }; }
function mineTick() {
  if (!mine) return; mine.h = (C.me.stats.hits | 0) - mine.h0; const s = healSum(); if (s < mine.inv) mine.w += mine.inv - s; mine.inv = s;
  if (view && view.me) C.netSet('u8', [view.seq, mine.d, mine.p, mine.h, mine.w]);
}
const partnerU = () => { const r = cur && cur.partner && C.remotes.get(cur.partner), u = r && r.lastPres && r.lastPres.u8; return Array.isArray(u) && u[0] === cur.seq ? { d: u[1] | 0, p: u[2] | 0, h: u[3] | 0, w: u[4] | 0 } : { d: 0, p: 0, h: 0, w: 0 }; };
function updConds() {
  if (!mine) return; const pu = partnerU();
  for (const c of cur.cond) { if (c.k === 'dodge') setN(c, mine.d + pu.d); else if (c.k === 'parry') setN(c, mine.p + pu.p); else if (c.k === 'nohit') setN(c, mine.h + pu.h); else if (c.k === 'nopot') setN(c, mine.w + pu.w); else if (c.k === 'time') setN(c, cur.t > c.m ? c.m + 1 : Math.floor(cur.t)); }
}
/* 從組長的模擬判斷（P2 的 beast:free／beast:howlBreak 還沒有；組長的模擬看得到自己和隊友的狀況，兩人組也算得到）：
   3-2 脫身＝沼蟒的扭絞在「沒累」的情況下結束（自己掙開、隊友打痛牠或被纏的人不再被纏），扭絞從開始到結束 ≤ 3 秒，被纏的人還活著
   3-3 打斷長吠＝鬥犬的長吠預備中被打成踉蹌（重擊打斷、精準格擋）或倒下 */
function watchSims() {
  for (const w of cur.ws) { const p = w.p8 || (w.p8 = {});
    if (w.type === 'python') { const cr = w.st === MST.STRIKE && w.M === MOVES.py_crush;
      if (p.cr && !cr && w.st !== MST.DEAD) { const vic = w.target === 'self' ? C.me : C.remotes.get(w.target), tired = p.t >= (w.sd || 99) - 0.12; if (!tired && p.t <= FREE_T + FREE_SLACK && vic && vic.alive) countCond('free'); }
      p.cr = cr; p.t = w.t; }
    else if (w.type === 'dog') { const hw = w.st === MST.WIND && w.M === MOVES.dog_howl; if (p.hw && !hw && (w.st === MST.STAGGER || w.st === MST.DEAD)) countCond('howl'); p.hw = hw; }
  }
}

/* ============================== 看臺與隊友：照組長的 t8 畫 ============================== */
const kindOf = id => (id === GAUNTLET.id ? 'gauntlet' : 'trial'), waveOf = (id, w) => (id === GAUNTLET.id ? w | 0 : null), wavesOf = id => (id === GAUNTLET.id ? GAUNTLET.waves : null);
const giveBack = () => (view && view.me && view.id === GAUNTLET.id && HOLD.length ? returnItems(true) : []);      // 隊友那台：百場連戰代管的東西還回去
function watch() {
  let src = null; for (const r of C.remotes.values()) { const p = r.lastPres; if (p && p.t8 && typeof p.t8 === 'object' && tOf(p.t8.i) && !lost.has(r.peer + ':' + p.t8.q) && !(r.away && r.age > AWAY_T * 1000)) { src = r; break; } }
  if (!src || (view && (view.peer !== src.peer || view.seq !== src.lastPres.t8.q))) dropView();
  if (!src) return; const L = src.lastPres.t8;
  if (!view) { const mine_ = L.p === C.Net.selfPeer; view = { peer: src.peer, seq: L.q, id: L.i, vs: new Map(), me: mine_, down: false, last: null, res: false, ret: null, fellW: 0 }; BA7.enable(); loadB07();
    if (mine_) { if (L.i === GAUNTLET.id) holdItems(true); emit('enter', { kind: kindOf(L.i), id: L.i, duo: true }); if (L.h === 'g') C.ui.toast(`${src.name || '隊長'} 開始了${L.i === GAUNTLET.id ? '' : '試煉'}「${tOf(L.i).name}」：走進沙地加入`); } }
  if (view.me && L.p !== C.Net.selfPeer && !view.down) { view.me = false; view.ret = giveBack(); C.ui.toast('沒有進場：改在看臺看'); emit('exit', { returned: view.ret }); }      // 組長那邊判定隊友沒進場，改一個人打
  const prev = view.last; view.last = L;
  if (view.me && L.h === 'f' && !mine) mineStart();
  if (view.me && prev && prev.h !== L.h) { if (L.h === 'c') emit('gate', { open: false }); if (L.h === 'd' && !view.res && L.r != null) partnerResult(L); }
  if (view.me && prev) (L.c || []).forEach((n, i) => { if (n !== ((prev.c || [])[i] | 0)) emit('cond', { i, n, m: (tOf(L.i).c[i] || {}).m }); });
  if (view.me && prev && L.i === GAUNTLET.id && (L.w | 0) !== (prev.w | 0)) emit('wave', { wave: L.w | 0, waves: GAUNTLET.waves });
  if (!Array.isArray(L.m) || !B07) return;
  const T = tOf(L.i), g = L.i === GAUNTLET.id, foes = g ? (GAUNTLET.list[(L.w | 0) - 1] || []).map(([type, n, lv]) => ({ type, n, lv })) : T.foes, sq = g ? L.sq | 0 : view.seq, types = []; for (const F of foes) for (let i = 0; i < F.n; i++) types.push(F);
  const have = new Set();
  for (const a of L.m) { if (!Array.isArray(a)) continue; const id = a[0] | 0, F = types[id - 9000 - sq * 4]; if (!F) continue; have.add(id); let v = view.vs.get(id);
    if (!v) { v = X8.make({ id, type: F.type, lv: F.lv, x: num(a[1], 0), z: num(a[2], 0), f: num(a[3], 0), hp: num(a[6], 0) }); model(v); view.vs.set(id, v); }
    X8.apply(v, a); }
  for (const [id, v] of view.vs) if (!have.has(id)) { X8.drop(v); view.vs.delete(id); }      // 百場連戰：上一波收掉了
}
function partnerResult(L) {      // 隊友也照自己的紀錄給一次第一次過關的獎勵（試煉：過關前倒下的也算同一組；百場連戰：倒下的人就是失敗，記自己倒下的那一波）
  view.res = true; const g = L.i === GAUNTLET.id, T = tOf(L.i), time = num(L.t, 0), ok = L.r === 1 && !(g && view.down); let first, newBest, best, reward;
  if (g) { const w = ok ? GAUNTLET.waves : view.fellW || L.w | 0; first = ok && !(GREC.c > 0); newBest = w > (GREC.b | 0); if (newBest) GREC.b = w; if (ok) GREC.c = (GREC.c | 0) + 1; best = GREC.b | 0; reward = first ? { gold: GAUNTLET.reward.gold, exp: GAUNTLET.reward.exp, orb: null, box: GAUNTLET.reward.box } : NOREW(); view.w = w; }
  else { const r = REC[L.i] || (REC[L.i] = { c: 0, b: 0 }); first = ok && !(r.c > 0); newBest = ok && (!r.b || time < r.b); if (ok) { r.c = (r.c | 0) + 1; if (newBest) r.b = time; } best = r.b || null; reward = first ? { gold: T.reward.gold, exp: T.reward.exp, orb: null, box: null } : NOREW(); }
  if (first) { C.P.gold += reward.gold; C.gainExp(reward.exp, C.me.x, C.me.z); if (g) grantBox(); }
  const returned = view.ret || (g ? returnItems(true) : []); view.ret = returned; C.Store.dirty = true;
  emit('result', { kind: kindOf(L.i), id: L.i, ok, reason: ok ? null : g ? 'down' : 'cond', time, best, newBest, wave: g ? view.w : null, waves: wavesOf(L.i), reward, returned }); if (ok && !g) try { C.questAct('doTrial:' + L.i); } catch (e) {}
}
function partnerOut(reason) {      // 隊友自己離場（離場鍵）：這一場對自己算失敗，人移到柵欄外（組長那邊繼續）；倒下的話結果等組長那場打完再給
  view.down = true; if (reason === 'leave') { view.res = true; const L = view.last || {}; place(); view.ret = giveBack(); emit('result', { kind: kindOf(view.id), id: view.id, ok: false, reason, time: num(L.t, 0), best: view.id === GAUNTLET.id ? GREC.b | 0 : rec(view.id).best, newBest: false, wave: waveOf(view.id, L.w), waves: wavesOf(view.id), reward: NOREW(), returned: view.ret }); }
  emit('exit', { returned: view.ret || [] });
}
function dropView() {      // 組長收掉了、換了一場、或組長斷線／切走太久（隊友沒拿到結果就算失敗：lost；組長在開打前取消：cancel）
  if (!view) return; for (const v of view.vs.values()) X8.drop(v); const L = view.last || {}, ret = view.me ? view.ret || giveBack() : [];
  if (view.me && !view.res) { const r = C.remotes.get(view.peer), gone = !r || r.away; if (gone) lost.add(view.peer + ':' + view.seq);      // 組長回來時那一場已經算 lost，不再重畫一次
    emit('result', { kind: kindOf(view.id), id: view.id, ok: false, reason: L.h === 'd' || L.h === 'g' ? 'cancel' : 'lost', time: num(L.t, 0), best: view.id === GAUNTLET.id ? GREC.b | 0 : rec(view.id).best, newBest: false, wave: waveOf(view.id, view.fellW || L.w), waves: wavesOf(view.id), reward: NOREW(), returned: ret }); }
  if (view.me && !view.down) { emit('gate', { open: true }); emit('exit', { returned: ret }); }
  if (!view.me && view.last && (view.last.h === 'c' || view.last.h === 'f')) { const r = C.remotes.get(view.peer); if (!r || r.away) lost.add(view.peer + ':' + view.seq); }
  if (view.me) { mine = null; C.netSet('u8', null); } view = null; }
function model(v) {      // 新野獸（野牛、沼蟒、鬥犬）的模型（beastai07 自己的 load() 沒有對外；照 game.js 畫面那一行建好，game.js 看到有 model 就不再建）
  if (v.model || !B07 || !BA7.owns(v)) return; /* 0.7 以前的野獸（豬、狼、熊、虎）game.js 自己建模型（BA7.make 沒有就 makeCreature） */ const Dm = MON[v.type]; v.model = B07.makeBeast07(v.type, v.size); v.model.elite = false; W.scene.add(v.model.root);
  v.tag = makeTag(Dm.temper === 'timid' || Dm.temper === 'neutral' ? 'mon calm' : 'mon'); v.tag.name.textContent = v.name + '　Lv' + v.lv; v.tele = makeTelegraph();
}

/* ============================== 倒下（裁決 1：這場結束、不扣經驗金幣、在沙地邊緣起來） ============================== */
// game.js 的 die() 最前面問 X8.down()：回 true＝這次倒下由試煉接手（不跑死亡懲罰、不回城）。
// 這一幀先把 me.alive 設成 false（beastai07 看到會放開纏住／咬住／挑飛，這一幀其他野獸也不再打），trial08 的 frame（同一幀最後）再讓人在最近的入口通道站起來
function downFn() {
  const ph = cur ? (cur.down ? null : cur.phase) : view && view.me && !view.down && view.last ? PH_[view.last.h] : null; if (!(ph === 'count' || ph === 'fight' || ph === 'between') || !onSand(C.me)) return false;
  if (cur) { cur.down = true; if (cur.kind === 'gauntlet') cur.ret = (cur.ret || []).concat(returnItems(true)); } else { view.down = true; view.fellW = view.last ? view.last.w | 0 : 0; if (view.id === GAUNTLET.id) view.ret = giveBack(); }
  const me = C.me; me.alive = false; me.hp = 0; rise = 2; return true;      // rise 2：倒著過完下一幀（beastai07 的 frame 看到才會放開纏住、咬住），再站起來
}
function place() {
  const me = C.me, a = Math.round(Math.atan2(me.x, -me.z) / (Math.PI / 2)) * (Math.PI / 2);      // 最近的入口通道（柵欄外）
  Object.assign(me, { x: Math.sin(a) * RISE_R, z: -Math.cos(a) * RISE_R, kx: 0, kz: 0, vx: 0, vz: 0, stun: 0, atk: null, dodge: null, cast: null, charge: null, rush: null, drink: null, guard: false, lock: null }); me.f = a + Math.PI;
}
function stand() {
  const me = C.me; place(); me.alive = true; me.deadT = 0; me.iframe = 2; me.hp = Math.max(1, Math.round(D.maxHp * RISE_HP)); C.ui.dirty = true;
  try { C.ui.toast('倒下了：這一場到此為止（不扣經驗、不掉金幣）'); } catch (e) {}
  if (view && view.me) emit('exit', { returned: view.ret || [] });
}

/* ============================== 木靶（裁決 2：試煉進行中收起來，結束放回） ============================== */
// 暫代：world.js（美術／場景）沒有對外的接點，直接找場景裡那三個木靶的物件與碰撞圓（位置對得上的），隱藏＋碰撞半徑設 0；美術給正式接點後換掉
let tg = null, tgOff = false;
function setTargets(off) {
  if (off === tgOff) return; if (!tg) { tg = { objs: [], cols: [] };
    for (const o of W.scene.children) if (TGT.some(t => Math.abs(o.position.x - t[0]) < 0.05 && Math.abs(o.position.z - t[1]) < 0.05)) tg.objs.push(o);
    for (const c of debugColliders().circles) if (TGT.some(t => Math.abs(c.x - t[0]) < 0.01 && Math.abs(c.z - t[1]) < 0.01)) tg.cols.push([c, c.r]); }
  tgOff = off; for (const o of tg.objs) o.visible = !off; for (const [c, r] of tg.cols) c.r = off ? 0 : r;
}

/* ============================== 斷糧代管（百場連戰用；P3-d 的 start('gauntlet') 呼叫） ============================== */
// 收：藥水、料理、藥劑、生肉全部交給巴索（存進 t8 存檔的 k，當掉重開也拿得回來）｜還：出場（過關、倒下、離開、取消）時照數量還；quiet＝不報幕（結果的字幕會講）
// 稀有天賦球箱：第一次過關時 grantBox 給 chest_rare ×1（道具表還沒有這個道具時先記著，等 merge08 把它加進 ITEMS 才補給；P7 的開箱另做）
function grantBox() { if (GREC.x || !GREC.c || !ITEMS.chest_rare) return; C.addItem('chest_rare'); GREC.x = 1; C.Store.dirty = true; C.ui.dirty = true; }
function holdItems(quiet) { const out = carryList(); for (const { id, n } of out) C.take(id, n); HOLD = HOLD.concat(out.map(o => ({ ...o }))); C.Store.dirty = true; if (out.length && !quiet) horn(line(['gauntlet', 'starve'])); return out; }
function returnItems(quiet) { const out = HOLD; HOLD = []; for (const { id, n } of out) if (ITEMS[id] && n > 0) C.addItem(id, n); C.Store.dirty = true; C.ui.dirty = true; if (out.length && !quiet) horn(line(['gauntlet', 'returned'])); return out; }

/* ============================== 介面測試：trialDemo（介面08 第 9 節） ============================== */
// __dev08.trialDemo(id, phase)：不開打，把 state() 擺成某一幕並發對應的事件；trialDemo(null) 收掉。id 可以是試煉代號或 'g100'（百場連戰：wave 3/10、between 15 秒）
export function trialDemo(id, phase = 'fight') {
  if (!id) { if (demo) { demo = null; emit('gate', { open: true }); emit('exit', { returned: [] }); } return null; }
  const g = id === GAUNTLET.id, T = g ? null : TBY[id]; if (!g && !T) return '沒有這個試煉';
  demo = { id, g, phase };
  if (phase === 'gate') emit('enter', { kind: g ? 'gauntlet' : 'trial', id, duo: false });
  else if (phase === 'count') { emit('gate', { open: false }); horn(g ? line(['gauntlet', 'open']) : line(['trials', id, 'open'])); }
  else if (phase === 'fight') { horn(g ? line(['gauntlet', 'waves', 2]) : line(['common', 'gate'])); if (g) emit('wave', { wave: 3, waves: GAUNTLET.waves }); else if (T.c.length) emit('cond', { i: 0, n: 1, m: T.c[0].m }); }
  else if (phase === 'between') { horn(line(['gauntlet', 'between'])); emit('wave', { wave: 3, waves: GAUNTLET.waves }); }
  else if (phase === 'done') { horn(g ? line(['gauntlet', 'clear']) : line(['trials', id, 'win']), 'win');
    emit('result', { kind: g ? 'gauntlet' : 'trial', id, ok: true, reason: null, time: 83.4, best: 83.4, newBest: true, wave: g ? 10 : null, waves: g ? 10 : null, reward: g ? { gold: GAUNTLET.reward.gold, exp: GAUNTLET.reward.exp, orb: null, box: 'chest_rare' } : { gold: T.reward.gold, exp: T.reward.exp, orb: null, box: null }, returned: g ? [{ id: 'potion', n: 3 }] : [] }); }
  else return '沒有這一幕';
  return null;
}
function demoState() {
  const d = demo, ph = d.phase, t = ph === 'fight' || ph === 'between' || ph === 'done' ? 42.7 : 0;
  if (d.g) return { kind: 'gauntlet', id: d.id, name: GAUNTLET.name, phase: ph, t, limit: null, count: ph === 'count' ? 2 : 0, wave: 3, waves: GAUNTLET.waves, betweenT: ph === 'between' ? 11 : null, cond: [], partner: null };
  const T = TBY[d.id]; return shape(d.id, ph, t, ph === 'count' ? 1 : 0, T.c.map(c => ({ k: c.k, label: c.label || T.cond, n: ph === 'done' && !NEG.has(c.k) ? c.m : Math.min(1, c.m), m: c.m })), null, 0);
}

/* ============================== 每幀 ============================== */
function frame(dt) {
  if (!C) return; const me = C.me;
  if (rise && --rise === 0) stand();
  if (cur) lead(dt); else watch();
  mineTick(); if (GREC.c && !GREC.x) grantBox();
  // 柵欄（暫代：美術的柵欄模型與碰撞進來前，用推回的方式擋）：參戰的人出不去、其他人（含倒下的人）進不來
  const ph = cur ? cur.phase : view && view.last ? PH_[view.last.h] : null, live = ph === 'count' || ph === 'fight' || ph === 'between';
  if (live) { const inn = cur ? !cur.down : view.me && !view.down, r = Math.hypot(me.x, me.z);
    if (inn && r > IN_R && r < SAND + 3) { const k = IN_R / r; me.x *= k; me.z *= k; } else if (!inn && r < OUT_R) { const k = OUT_R / (r || 1); me.x = r ? me.x * k : 0; me.z = r ? me.z * k : OUT_R; } }
  setTargets(!!ph && ph !== 'gate');
  tempUi(dt);
}
// 沙地上、試煉進行中、還沒倒下的挑戰者不算安全區（game.js 的 me.inSafe 看這個）
function onFn() { const ph = cur ? (cur.down ? null : cur.phase) : view && view.me && !view.down && view.last ? PH_[view.last.h] : null; return (ph === 'count' || ph === 'fight' || ph === 'between') && onSand(C.me); }
// 參戰的人（組長的模擬用）：自己＋隊友，在沙地上、還站著
// 組長的機器上，沙地上參戰的隊友不算安全區（game.js playerOf 的例外；beastai07 的 topDamager、鬥犬計畫、沼蟒扭絞都用 playerOf 找人）
function mateFn(peer) { if (!cur || cur.partner !== peer || cur.phase === 'gate' || cur.phase === 'done') return false; const r = C.remotes.get(peer); return !!r && onSand(r); }
function playersFn() { const out = []; if (cur && !cur.down && C.me.alive && onSand(C.me)) out.push(['self', C.me]); const r = cur && cur.partner && C.remotes.get(cur.partner); if (r && r.alive && onSand(r)) out.push([r.peer, r]); return out; }
// 野獸碰到獸門或入口（沒有牆的地方）：擋回來；衝撞中撞上就暈（和撞牆一樣）
function postFn(w) { const r = Math.hypot(w.x, w.z); if (r <= BEAST_R) return; const k = BEAST_R / r; w.x *= k; w.z *= k; if (w.st === MST.STRIKE && w.M && w.M.steer) BA7.bump(w); }

/* ============================== 暫代的畫面（介面組的 ui08 進來後拿掉；window.__ui8trial 為真時不畫） ============================== */
let box = null, sub = null, subT = 0;
function el(css) { const d = document.createElement('div'); d.style.cssText = css; document.body.appendChild(d); return d; }
function tempSub(text) { if (typeof window === 'undefined' || window.__ui8trial || !text) return; if (!sub) sub = el('position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:40;padding:6px 16px;border-radius:6px;background:rgba(30,22,12,.72);color:#f0d79a;font:600 17px/1.5 system-ui;pointer-events:none;max-width:70%;text-align:center'); sub.textContent = text; sub.style.display = ''; subT = 4.5; }
function tempUi(dt) {
  if (typeof document === 'undefined' || window.__ui8trial) return;
  if (sub && subT > 0) { subT -= dt; if (subT <= 0) sub.style.display = 'none'; }
  if (!box) { box = el('position:fixed;right:12px;top:120px;z-index:40;padding:8px 12px;border-radius:6px;background:rgba(30,22,12,.78);color:#e8d9b8;font:14px/1.6 system-ui;display:none;min-width:190px'); box.addEventListener('click', e => { const d = e.target.dataset; if (d.go) start('trial', d.go, partnerNear() || TBY[d.go].mode === 'duo' ? 'duo' : 'solo'); if (d.gauntlet) start('gauntlet', GAUNTLET.id, partnerNear() ? 'duo' : 'solo'); if (d.leave) leave(); if (d.orb) claimOrb(+d.tier, d.orb); }); }
  const s = state(), w = watching(), me = C.me, nearBook = Math.hypot(me.x - SPOT.book.x, me.z - SPOT.book.z) < 4.5; let h = '';
  if (s) { h = `<b>${s.name}</b>（暫代畫面）<br>${s.phase === 'count' ? '倒數 ' + s.count : s.phase === 'gate' ? '走進沙地' : ''}<span style="color:#d8b35a">${s.phase === 'fight' || s.phase === 'done' ? fmt(s.t) : ''}</span><br>` + (s.wave ? `第 ${s.wave}／${s.waves} 波${s.phase === 'between' ? '　下一波 ' + s.betweenT + ' 秒' : ''}<br>` : '') + s.cond.map(c => `${c.fail ? '✗' : c.ok ? '✓' : '・'} ${c.label} ${c.m ? c.n + '/' + c.m : ''}`).join('<br>') + ((cur && s.phase !== 'done') || (view && view.me && !view.down) ? '<br><button data-leave="1">離場</button>' : ''); }
  else if (w) h = `看臺：${w.name} 正在挑戰<br><span style="color:#d8b35a">${fmt(w.t)}</span>`;
  else if (nearBook) { h = '巴索的戰績簿（暫代）';
    for (const T of TRIALS) { const r = rec(T.id); h += `<br>${T.id} ${T.name}${r.cleared ? '　✓' : ''}${r.best ? ' ' + fmt(r.best) : ''} <button data-go="${T.id}">${T.mode === 'duo' ? '兩人開始' : '開始'}</button>`; }
    h += `<br>${GAUNTLET.name}　最遠第 ${gauntletRec().best} 波${gauntletRec().cleared ? '　✓' : ''} <button data-gauntlet="1">開始</button>`;
    for (const tier of [1, 2, 3]) if (tierOrb(tier) === 'ready') h += `<br>第${'一二三'[tier - 1]}級全過：選一顆天賦球<br>` + orbChoices(tier).map(k => `<button data-tier="${tier}" data-orb="${k}">${SKILLS[k].name}</button>`).join(' '); }
  box.style.display = h ? '' : 'none'; if (box.innerHTML !== h) box.innerHTML = h;
}

/* ============================== 初始化 ============================== */
H8.on('init', ctx => {
  C = ctx; X8.on = onFn; X8.mate = mateFn; X8.players = playersFn; X8.post = postFn; X8.down = downFn;
  H8.on('frame', frame);
  H8.on('me:hurt', e => { if (!mine || !e || !e.v || !e.v.trial8) return; if (e.res === 'dodged' && e.M && e.M.anim === 'charge') mine.d++; else if (e.res === 'parried') mine.p++; });      // 閃過衝撞（野豬的衝撞）、精準格擋
  H8.on('beast:daze', e => { if (!e || !e.v || !e.v.trial8) return; p2daze = true; if (cur && cur.phase === 'fight' && e.v.s8 && cur.ws.includes(e.v.s8)) bump(e.v.s8); });      // P2 交了 beast:daze 之後用事件（每台都會發；組長算自己的）
  H8.save8('t8', () => ({ r: REC, o: ORB, g: GREC, k: HOLD.length ? HOLD : undefined }), d => {
    REC = (d && typeof d.r === 'object' && d.r) || {}; ORB = (d && typeof d.o === 'object' && d.o) || {}; GREC = Object.assign({ b: 0, c: 0, x: 0 }, d && d.g);
    HOLD = Array.isArray(d && d.k) ? d.k.filter(o => o && typeof o.id === 'string' && o.n > 0) : []; if (HOLD.length && !cur) setTimeout(() => { if (!cur && HOLD.length) returnItems(); }, 0); });      // 上次代管到一半當掉：讀檔時還回去
  import('./story08.js').then(m => { LINES = m.ARENA08 || null; for (const S of m.TRIALS08 || []) { const T = TBY[S.id]; if (T) { T.name = S.name; T.cond = S.rule; } } }).catch(() => {});
  import('./duel08.js').then(m => { DUEL = m; }).catch(() => {});      // 對決模組還沒合進來時找不到，照常
  import('./places08.js').then(m => { const A = m.ARENA_SPOT08; if (A && A.gate) SPOT.gate = A.gate; if (A && A.book) SPOT.book = A.book; }).catch(() => {});
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = performance.now(); else { if (!noAway && cur && cur.phase !== 'done' && cur.phase !== 'gate' && hiddenAt && performance.now() - hiddenAt > AWAY_T * 1000) finish(false, 'away'); hiddenAt = 0; } });
  if (typeof window !== 'undefined' && window.__dev07) { const Dv = window.__dev08 = window.__dev08 || {};
    Dv.trial = (id = '3-1', mode = 'solo') => start(id === GAUNTLET.id ? 'gauntlet' : 'trial', id, mode, { force: true, tp: true }); Dv.trialDemo = trialDemo;
    Dv.custody = what => (what === 'take' ? holdItems() : what === 'give' ? returnItems() : HOLD.slice());
    Dv.trialNoAway = on => { noAway = !!on; };
    Dv.trialWarp = (what, sec) => { if (!cur) return false; if (what === 't') cur.t += sec; else cur.pt += sec; return true; };      /* 測試用：把試煉時間（t）或階段時間（pt，例如波間倒數）往前撥 */
    Dv.trialRec = (id, c = 1, b = 60) => { REC[id] = { c, b }; return rec(id); };
    Dv.trialInfo = () => ({ mine: mine && { ...mine }, gr: { ...GREC }, cur: cur && { id: cur.id, kind: cur.kind, wave: cur.wave, hpK: cur.hpK, newRec: cur.newRec, phase: cur.phase, t: cur.t, down: cur.down, partner: cur.partner, cond: cur.cond, ids: cur.ws.map(w => w.id), st: cur.ws.map(w => [w.st, w.M && w.M.id, +w.x.toFixed(2), +w.z.toFixed(2), w.target]) }, view: view && { peer: view.peer, me: view.me, down: view.down, ids: [...view.vs.keys()], h: view.last && view.last.h }, x8: { sim: X8.sim.size, mons: X8.mons.length }, targets: { off: tgOff, objs: tg ? tg.objs.length : 0, vis: tg ? tg.objs.map(o => o.visible) : [], cols: tg ? tg.cols.map(([c]) => c.r) : [] }, hold: HOLD.slice() }); }
});
