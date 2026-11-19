// 0.8 競技場：玩家對決（d8-play P6）。規格：設計定案 3-3、介面08 第 2、5、9 節。
// 新檔，不改 game.js（只靠 hooks08 的 pvpOk／pvpFloor／lockables／lockAlive 與 me:floor／me:hurt 事件）；game.js 只要匯入一行（patches/game.js-duel-import-patch.py）。
//
// 流程（雙方各自在自己的瀏覽器判定，靠 presence 欄位 dv 交換）：
//   dv = [編號, 對象 peer, 狀態, 附帶數字]，是「狀態」不是一次性事件（對方每幀輪詢 r.lastPres.dv），所以不怕漏看。
//   狀態 1 邀請（對象＝被邀請的人）｜2 接受（附帶＝開始倒數的共同時鐘 ×10）｜3 拒絕｜4 對決中｜
//        5 我倒下了（附帶＝共同時鐘 ×10）｜6 時間到，我的生命％（附帶＝整數百分比）｜8 結果（附帶＝勝負碼×10＋原因碼，供對方照著記）
//   第三人看到 2／4／5／6 就知道這個人在對決（對象不是我＝打不到我、我也打不到他）。
//   倒數開始時間 T0 由「接受的人」定（共同時鐘 H8.now()＋0.6 秒），雙方照同一個 T0 算：倒數 3 秒→開打→180 秒。
// 判定規則：
//   先被打到只剩 1 點（me:floor）的輸；兩人倒下時間差 ≤ 0.5 秒＝平手（各自畫面對不齊，所以先倒的人等 0.5＋1.2 秒看對方有沒有也倒）；
//   時間到：雙方各自送出自己的整數生命百分比，一樣＝平手，高的贏；不加時。
//   誰先判定誰就把結果放進 dv 狀態 8，另一邊看到就照著（鏡像）記，兩邊一定一致。
// 收尾（寫清楚的部分）：
//   走出沙地（半徑 WORLD.ARENA_IN）：開打後離開超過 5 秒（outT 倒數，回到沙地歸零重算）＝認輸（by 'leave'）。倒數中不計。
//   斷線（對方從 remotes 消失 3 秒）、對方切分頁超過 10 秒：留下的人贏（by 'drop'）。自己切分頁超過 10 秒回來＝自己輸（by 'drop'）。
//   被野獸打到（me:hurt）、試煉開始（trial08.state() 有值）、自己倒下、加入對方的隊伍、對方 2.5 秒沒有回應：取消，不記錄（duel:cancel）。
//   組隊中：邀請隊友被拒絕（要先退隊）；對決中和第三人（含自己的隊友）互相打不到，範圍技能也傷不到旁人。
//   傷害照 0.6 玩家對打（0.5 倍，game.js 現成）；不倒地、不扣經驗與金幣、不通緝（pvpFloor 留 1 點，game.js 的死亡路徑走不到）。
//   開打那一刻生命補滿（兩邊公平）；對決中 me.inSafe 對外回 false（沙地在城裡，否則每秒回 6% 生命），結束後恢復。
import * as H8 from './hooks08.js';
import { WORLD } from './core.js';

const SAND = WORLD.ARENA_IN, OUTR = WORLD.ARENA_OUT;
const COUNT_T = 3, DEF = { limit: 180, inv: 30, grace: 5, away: 10 }, TUNE = Object.assign({}, DEF), TIE_W = 0.5, TIE_WAIT = 1.2, TIME_WAIT = 3, DONE_T = 4.5, GONE_T = 3, MISS_T = 6, ACK_T = 8, DEC_T = 3;
const RES = { win: 1, lose: 2, draw: 3, cancel: 4 }, RES_N = [null, 'win', 'lose', 'draw', 'cancel'];
const BY = { down: 1, time: 2, leave: 3, drop: 4, cancel: 5 }, BY_N = [null, 'down', 'time', 'leave', 'drop', 'cancel'];

// 劇情 story08.js 的 ARENA08.duel（沒有檔就用下面這份，內容一樣）
let LINES = { open: '各位觀眾——對決！{a} 對 {b}。三分鐘，點到為止。', win: '{w} 勝！兩位都站著離開，這才是好場子。', timeout: '時間到！照剩下的力氣——{w} 勝。', draw: '時間到，兩邊一樣。這一場，記平手。', leave: '有人離場了。這一場不記。' }, CUE = { duel: 'horn', duelEnd: 'gong' };
import('./story08.js').then(m => { if (m.ARENA08 && m.ARENA08.duel) LINES = Object.assign({}, LINES, m.ARENA08.duel); if (m.ARENA08 && m.ARENA08.cue) CUE = Object.assign({}, CUE, m.ARENA08.cue); }).catch(() => {});
let TRIAL = null; import('./trial08.js').then(m => { TRIAL = m; }).catch(() => {});      // 試煉進行中不開對決（trial08 沒有就略過）

let C = null, me = null;
let D = null;                       // 對決 { role: 'a'邀請的人｜'b'接受的人, peer, id, T0, ph: 'count'|'fight'|'done', … }
let inc = null, out = null, dec = null;   // 收到的邀請 { peer, name, lv, id, t, tmax }｜我發出的邀請 { peer, name, id, t }｜我剛拒絕的（讓對方看到）{ peer, id, t }
let idN = (Math.random() * 1e5) | 0; const seenInv = new Map();
let REC = { win: 0, lose: 0, draw: 0 };
let demo = null, devForce = false, devAuto = false;
let hideAt = 0, lastWall = 0;
const proxy = { lock8: true, x: 0, z: 0, name: '', peer: '', type: 'boar', size: 0.8, st: 0 };      // 鎖定用的對手代理物件（type／size 只給鎖定框算大小）

const selfPeer = () => C && C.Net && C.Net.selfPeer;
const dvOf = r => { const v = r && r.lastPres && r.lastPres.dv; return Array.isArray(v) && v.length >= 3 && typeof v[0] === 'number' && typeof v[2] === 'number' ? v : null; };
const dist0 = o => Math.hypot(o.x, o.z);
const maxHp = () => { try { return __game.debug.derived().maxHp || 0; } catch (e) { return 0; } };
const pctOf = hp => { const m = maxHp() || (D && D.hp0) || Math.max(1, hp); return Math.max(0, Math.min(100, Math.round(hp / m * 100))); };
const myPct = () => pctOf(me.hp);
const oppR = () => (D ? C.remotes.get(D.peer) : null);
const toast = t => { try { C.ui.toast(t); } catch (e) {} };
const sfx = k => { try { C.ui.sfx('arena', k); } catch (e) {} };
const ext = () => !!globalThis.__ui8duel;      // 介面組的對決畫面（ui08h）接上時，下面暫代的 DOM 全部不做
const busyTrial = () => { try { return !!(TRIAL && TRIAL.state && TRIAL.state()); } catch (e) { return false; } };

/* ---------- 對外 API（介面08 第 5 節） ---------- */
export function rec() { return Object.assign({}, REC); }
export function busy() { return !!D && D.ph !== 'done'; }      // 給試煉：沙地上有人在對決
export function inviteIn() { if (demo && demo.inv) return demo.inv; return inc ? { from: { peer: inc.peer, name: inc.name, lv: inc.lv }, t: Math.max(0, inc.t), tmax: inc.tmax } : null; }
export function lockIsDuel() { return !!(me && me.lock && me.lock.lock8 && D && D.ph !== 'done'); }
export function state() {
  if (demo) return demoState();
  if (!D) return null; const r = oppR(), el = H8.now() - D.T0;
  return { phase: D.ph, count: D.ph === 'count' ? Math.max(1, Math.min(COUNT_T, Math.ceil(COUNT_T - el))) : 0, t: D.ph === 'count' ? 0 : D.ph === 'done' ? D.doneAt : Math.max(0, Math.min(TUNE.limit, el - COUNT_T)), limit: TUNE.limit,
    vs: { peer: D.peer, name: D.name, lv: r ? r.lv : D.lv, hp01: r ? r.hp / 100 : 0, tag: r ? r.tag : null }, me: { hp01: Math.max(0, Math.min(1, me.hp / (maxHp() || D.hp0 || me.hp || 1))) },
    outT: D.out != null && D.out < TUNE.grace ? Math.max(0, D.out) : null, res: D.res, by: D.by, hpPct: D.hpPct };
}
// 發邀請：回傳 true／'原因'。身邊的人在競技場裡（沙地或看臺）、沒在別的事情裡才行
export function invite(peer) {
  const r = typeof peer === 'string' ? C.remotes.get(peer) : peer; const why = whyNot(r); if (why) { toast(why); return why; }
  idN++; out = { peer: r.peer, name: r.name, id: idN, t: TUNE.inv }; toast(`已向 ${r.name} 發出對決邀請，等待回應…`); try { C.ui.log(`邀請 ${r.name} 對決。`); C.ui.sfx('click'); } catch (e) {} return true;
}
export function answer(yes) {
  if (demo && demo.inv) { demo.inv = null; return true; }
  if (!inc) return false; const i = inc, r = C.remotes.get(i.peer); inc = null;
  const fail = t => { toast(t); dec = { peer: i.peer, id: i.id, t: DEC_T }; return false; };
  if (!yes) { dec = { peer: i.peer, id: i.id, t: DEC_T }; try { C.ui.log(`拒絕了 ${i.name} 的對決邀請。`); } catch (e) {} return true; }
  if (!r) return fail('對方已經離開了'); const v = dvOf(r); if (!v || v[0] !== i.id || v[1] !== selfPeer() || v[2] !== 1) return fail('這個邀請已經失效了');
  const why = whyNot(r, true); if (why) return fail(why);
  out = null; start('b', r, i.id, H8.now() + 0.6); return true;
}
// 取消我發出的邀請
export function cancelInvite() { out = null; }

function whyNot(r, accept) {
  if (!C || !C.Net || !selfPeer()) return '目前是單人模式，沒辦法對決';
  if (!r) return '找不到對手'; if (D) return '你正在對決中'; if (demo) return '展示中';
  if (!me.alive || !C.remotes.has(r.peer) || !r.alive) return '對手現在不能對決';
  if (r.away) return `${r.name} 暫離中，沒辦法邀請`; if (C.allyOf(r)) return `${r.name} 是你的隊友，要先退出隊伍才能對決`;
  if (busyTrial()) return '試煉進行中，不能對決'; if (me.trial != null && me.trial !== false) return '競技場試用中，不能對決';
  if (!accept && out && out.peer === r.peer) return `已經邀請過 ${r.name}，等待回應中`; if (!accept && out) return '已經有一個對決邀請在等回應';
  if (!devForce && (dist0(me) >= OUTR || dist0(r) >= OUTR)) return '兩個人都要在競技場裡（沙地或看臺）才能對決';
  const v = dvOf(r); if (v && !(accept && v[1] === selfPeer()) && [2, 4, 5, 6].includes(v[2])) return `${r.name} 正在對決中`;
  return null;
}

/* ---------- 對決的開始與結束 ---------- */
function start(role, r, id, T0) {
  inc = null; out = null; dec = null;
  D = { role, peer: r.peer, name: r.name, lv: r.lv, id, T0, ph: 'count', cnt: 0, goSent: false, confirm: role === 'a', t0: H8.now(), myDown: null, oppDown: null, myTimeHp: null, oppTimeHp: null, timeAt: 0, out: null, gone: 0, awayT: 0, miss: 0, fin: null, res: null, by: null, hpPct: null, doneAt: 0, doneT: 0, hp0: maxHp() || me.hp };
  proxy.name = r.name; proxy.peer = r.peer; proxy.x = r.x; proxy.z = r.z;
  say('open', { a: C.P.name, b: r.name }, CUE.duel); try { C.ui.log(`和 ${r.name} 的對決開始。`); } catch (e) {}
}
function say(k, o, cue) { let t = LINES[k] || ''; for (const x in o || {}) t = t.split('{' + x + '}').join(o[x]); if (t) H8.emit('trial:horn', { text: t, cue: cue || 'horn', duel: true }); return t; }
function cancel(why) { if (!D || D.fin != null) return; finish('cancel', 'cancel', why); }
function decide(res, by) { if (!D || D.fin != null) return; finish(res, by); }
function finish(res, by, why) {
  const r = oppR(); D.fin = RES[res] * 10 + BY[by]; D.res = res; D.by = by; D.ph = 'done'; D.doneT = DONE_T; D.doneAt = Math.max(0, Math.min(TUNE.limit, H8.now() - D.T0 - COUNT_T));
  const mine = D.myTimeHp != null ? D.myTimeHp : myPct(), theirs = D.oppTimeHp != null ? D.oppTimeHp : r ? Math.round(r.hp) : 0; D.hpPct = [mine, theirs];
  if (me.lock && me.lock.lock8) me.lock = null;
  if (res === 'cancel') { H8.emit('duel:cancel', { reason: why || 'cancel', vs: { peer: D.peer, name: D.name, lv: D.lv } }); toast('對決取消，這一場不記'); say('leave', {}, CUE.duelEnd); sfx('gong'); return; }
  if (res === 'win') REC.win++; else if (res === 'lose') REC.lose++; else REC.draw++; try { C.Store.dirty = true; } catch (e) {}
  H8.emit('duel:result', { kind: 'duel', res, by, hpPct: D.hpPct.slice(), vs: { peer: D.peer, name: D.name, lv: D.lv } }); sfx('gong');
  const w = res === 'win' ? C.P.name : D.name;
  if (res === 'draw') say('draw', {}, CUE.duelEnd); else if (by === 'time') say('timeout', { w }, CUE.duelEnd); else if (by === 'leave' || by === 'drop') say('win', { w }, CUE.duelEnd); else say('win', { w }, CUE.duelEnd);
  toast(res === 'draw' ? '平手！' : res === 'win' ? (by === 'leave' || by === 'drop' ? '對手離場，你贏了' : '你贏了！') : (by === 'leave' ? '離開了沙地，這場判輸' : by === 'drop' ? '離開太久，這場判輸' : '你輸了'));
}
// 對方已經判定好了（dv 狀態 8）：照鏡像記
function adopt(code) {
  const res = RES_N[Math.floor(code / 10)], by = BY_N[code % 10]; if (!res || !by) return;
  decide(res === 'win' ? 'lose' : res === 'lose' ? 'win' : res, by);
  if (res === 'cancel') cancel('peer');
}

/* ---------- 每幀 ---------- */
function frame(dt) {
  if (!C) return; me = C.me; const sp = selfPeer();
  if (demo) { demoTick(dt); return; }
  const wall = Date.now(), gap = lastWall ? wall - lastWall : 0; lastWall = wall;      // 這個分頁卡住（背景節流、畫面卡死）超過寬限＝等同切分頁太久；短暫卡住就先不判定，等 presence 追上
  if (D && D.ph !== 'done') { if (gap > TUNE.away * 1000) decide('lose', 'drop'); else if (gap > 2000) D.stall = 2.5; }
  // 邀請的逾時與回應
  if (dec && (dec.t -= dt) <= 0) dec = null;
  if (inc) { const r = C.remotes.get(inc.peer), v = dvOf(r); inc.t -= dt; if (inc.t <= 0 || !r || !v || v[0] !== inc.id || v[2] !== 1 || D) { inc = null; } }
  if (out) {
    const r = C.remotes.get(out.peer), v = dvOf(r); out.t -= dt;
    if (!r) { out = null; } else if (v && v[0] === out.id && v[1] === sp && v[2] === 3) { toast(`${r.name} 拒絕了對決邀請`); out = null; }
    else if (v && v[0] === out.id && v[1] === sp && v[2] === 2 && !D) { const o = out; if (whyNot(r, true)) { out = null; } else start('a', r, o.id, v[3] / 10); }
    else if (out.t <= 0) { toast(`${out.name} 沒有回應對決邀請`); out = null; }
  }
  for (const r of C.remotes.values()) {      // 新的邀請
    const v = dvOf(r); if (!v || v[2] !== 1 || v[1] !== sp || seenInv.get(r.peer) === v[0]) continue; seenInv.set(r.peer, v[0]);
    const busy = D || inc || busyTrial() || !me.alive || r.away || C.allyOf(r) || (me.trial != null && me.trial !== false);
    if (busy || (!devForce && (dist0(me) >= OUTR || dist0(r) >= OUTR))) { dec = { peer: r.peer, id: v[0], t: DEC_T }; continue; }
    inc = { peer: r.peer, name: r.name, lv: r.lv, id: v[0], t: TUNE.inv, tmax: TUNE.inv }; H8.emit('duel:invite', { from: { peer: r.peer, name: r.name, lv: r.lv }, t: TUNE.inv });
    try { C.ui.sfx('invite'); C.ui.log(`${r.name} 邀請你對決。`); } catch (e) {} if (devAuto) answer(true);
  }
  if (D) duelTick(dt);
  publish(); tick8(dt);
}
function duelTick(dt) {
  const r = oppR(), now = H8.now(), el = now - D.T0, od = dvOf(r), sp = selfPeer();
  proxy.name = D.name; if (r) { proxy.x = r.x; proxy.z = r.z; }
  if (D.ph === 'done') { D.doneT -= dt; if (D.doneT <= 0) { D = null; } return; }
  if (D.stall > 0) D.stall -= dt;
  // 取消的條件
  if (!me.alive) return cancel('dead'); if (busyTrial()) return cancel('trial');
  if (r && C.allyOf(r)) return cancel('team');
  if (D.ph === 'fight' && D.beast) return cancel('beast');
  // 對方的消失、切分頁
  if (!r) { D.gone += dt; if (D.gone > GONE_T) return decide('win', 'drop'); } else { D.gone = 0; D.awayT = r.away ? D.awayT + dt : 0; if (D.awayT > TUNE.away) return decide('win', 'drop'); }
  // 對方的 dv
  const mine = od && od[0] === D.id && od[1] === sp ? od : null;
  if (mine) {
    const st = mine[2]; D.miss = 0;
    if (st === 8) return adopt(mine[3]);
    if ([4, 5, 6].includes(st)) D.confirm = true;
    if (st === 5 && D.oppDown == null) D.oppDown = mine[3] / 10;
    if (st === 6 && D.oppTimeHp == null) D.oppTimeHp = mine[3];
  } else if (r && (D.role === 'a' || D.confirm || el > ACK_T)) { D.miss += dt; if (D.miss > MISS_T && (D.confirm || el > ACK_T)) return cancel('lost'); }
  if (D.role === 'b' && !D.confirm && el > ACK_T) return cancel('noack');
  if (D.stall > 0) return;      // 剛從卡住回來：先讀對方的狀態（上面已處理 st 8），不下判定
  // 倒數與開打
  if (D.ph === 'count') {
    const n = Math.max(1, Math.min(COUNT_T, Math.ceil(COUNT_T - el))); if (n !== D.cnt) { D.cnt = n; if (el >= -1) { H8.emit('duel:count', { n }); sfx('count'); } }
    if (el >= COUNT_T) {
      D.ph = 'fight'; H8.emit('duel:go', {}); sfx('go'); D.hp0 = maxHp() || D.hp0; me.hp = Math.max(me.hp, maxHp() || me.hp);      // 開打：生命補滿（兩邊公平）
    }
    else return;
  }
  // 戰鬥中
  const fightT = el - COUNT_T;
  if (D.myTimeHp == null) {      // 離開沙地：倒數；回來就歸零重算
    if (dist0(me) >= SAND) { D.out = D.out == null ? TUNE.grace : D.out - dt; if (D.out <= 0) return decide('lose', 'leave'); } else D.out = null; }
  if (D.myDown != null || D.oppDown != null) {      // 有人倒下：看兩個人倒下的時間差
    if (D.myDown != null && D.oppDown != null) { const df = Math.abs(D.myDown - D.oppDown); return decide(df <= TIE_W ? 'draw' : D.myDown < D.oppDown ? 'lose' : 'win', 'down'); }
    const first = D.myDown != null ? D.myDown : D.oppDown; if (now >= first + TIE_W + TIE_WAIT) return decide(D.myDown != null ? 'lose' : 'win', 'down'); return;
  }
  if (fightT >= TUNE.limit && (mine || D.myTimeHp != null)) {      // 時間到：各自送出整數生命百分比，等對方的
    if (D.myTimeHp == null) { D.myTimeHp = myPct(); D.timeAt = now; D.out = null; }
    let oh = D.oppTimeHp; if (oh == null && now - D.timeAt > TIME_WAIT && r) oh = Math.round(r.hp);
    if (oh != null) { const mm = D.myTimeHp; decide(mm === oh ? 'draw' : mm > oh ? 'win' : 'lose', 'time'); }
  }
}
// 決定這一幀要放進 presence 的 dv
function publish() {
  let v = null;
  if (D) { const sec = Math.round; v = D.fin != null ? [D.id, D.peer, 8, D.fin] : D.myDown != null ? [D.id, D.peer, 5, sec(D.myDown * 10)] : D.myTimeHp != null ? [D.id, D.peer, 6, D.myTimeHp] : D.role === 'b' && D.ph === 'count' ? [D.id, D.peer, 2, sec(D.T0 * 10)] : [D.id, D.peer, 4]; }
  else if (out) v = [out.id, out.peer, 1]; else if (dec) v = [dec.id, dec.peer, 3];
  try { C.netSet('dv', v, true); } catch (e) {}
}

/* ---------- 掛鉤（hooks08；一個名稱一個擁有者） ---------- */
const partnerOf = r => { const v = dvOf(r); return v && [2, 4, 5, 6].includes(v[2]) ? v[1] : null; };
const onSand = o => dist0(o) < SAND + 0.4;
H8.provide('pvpOk', (a, b) => {
  if (!C) return undefined; me = C.me;
  const pa = a === me ? (D && D.ph !== 'done' ? D.peer : D ? 'x' : null) : partnerOf(a), pb = b === me ? (D && D.ph !== 'done' ? D.peer : D ? 'x' : null) : partnerOf(b);
  if (!pa && !pb) return undefined;      // 沒有人在對決：照舊（城裡打不到、組隊不傷隊友）
  if (D && D.ph === 'fight' && D.myTimeHp == null && ((a === me && b && b.peer === D.peer) || (b === me && a && a.peer === D.peer))) return onSand(a) && onSand(b);
  return false;      // 對決中的人和第三人、倒數中、時間到之後、結果顯示中：打不到
}, 'P6');
H8.provide('pvpFloor', r => (D && r && r.peer === D.peer && D.ph !== 'done' ? 1 : 0), 'P6');
H8.provide('lockables', () => (D && D.ph !== 'done' && oppR() ? [proxy] : []), 'P6');
H8.provide('lockAlive', v => v === proxy && !!D && D.ph !== 'done' && !!oppR() && !oppR().away, 'P6');

H8.on('me:floor', e => {
  if (!D || D.ph !== 'fight' || D.myDown != null || !e || !e.o || !e.o.pvp || e.o.pvp.peer !== D.peer) return;
  D.myDown = H8.now();
});
H8.on('me:hurt', e => { if (D && D.ph === 'fight' && e && e.v) D.beast = true; });      // 被野獸打到：取消（沙地在城裡，只有試煉的野獸會到這裡）

/* ---------- 對決中 me.inSafe 對外回 false（沙地在城裡：安全區每秒回 6% 生命、野獸規則等） ---------- */
let realSafe = false, masked = false;
function installMask() {
  const d = Object.getOwnPropertyDescriptor(me, 'inSafe'); if (d && d.get) return; realSafe = !!me.inSafe;
  Object.defineProperty(me, 'inSafe', { configurable: true, enumerable: true, get: () => (masked ? false : realSafe), set: v => { realSafe = !!v; } });
}
const tick8 = () => { masked = !!D && D.ph !== 'done'; };

/* ---------- 暫代畫面（介面組的 ui08h 接上時設 globalThis.__ui8duel = true，這一段就停用） ---------- */
let box = null, shown = '', btnT = 0;
function ensureBox() {
  if (box) return box; const st = document.createElement('style');
  st.textContent = '#duel8tmp{position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:30;min-width:300px;max-width:520px;padding:8px 14px;border:1px solid #c9a35a;border-radius:8px;background:rgba(24,18,10,.88);color:#e8dcc0;font:14px sans-serif;text-align:center;display:none;pointer-events:none}#duel8tmp b{color:#e8c97a}#duel8tmp .big{font:700 38px serif;color:#e8c97a}#duel8tmp button{pointer-events:auto;margin:6px 6px 0;padding:3px 14px;border:1px solid #c9a35a;border-radius:6px;background:#3a2c14;color:#e8dcc0;cursor:pointer}.d8btn{pointer-events:auto;cursor:pointer;font-size:11px;padding:1px 7px;border:1px solid #c9a35a;border-radius:9px;background:rgba(36,26,12,.8);color:#e8c97a;margin-top:2px}';
  document.head.appendChild(st); box = document.createElement('div'); box.id = 'duel8tmp'; document.body.appendChild(box);
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (b) answer(b.dataset.y === '1'); }); return box;
}
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function tmpUi(dt) {
  if (!C || typeof document === 'undefined') return; if (ext()) { if (box) box.style.display = 'none'; return; }
  const b = ensureBox(), S = state(), iv = inviteIn(); let h = '';
  if (iv) h = `<b>${iv.from.name}</b>（Lv${iv.from.lv}）邀請你對決　${Math.ceil(iv.t)} 秒<br><button data-y="1">接受 (Y)</button><button data-y="0">拒絕 (N)</button>`;
  else if (S && S.phase === 'count') h = `<div class="big">${S.count}</div>對決　vs ${S.vs.name}`;
  else if (S && S.phase === 'fight') h = `對決　vs <b>${S.vs.name}</b>　${mmss(S.limit - S.t)}<br>你 ${Math.round(S.me.hp01 * 100)}%　／　對手 ${Math.round(S.vs.hp01 * 100)}%${S.outT != null ? `<br>回到沙地內（${Math.ceil(S.outT)}）` : ''}`;
  else if (S && S.phase === 'done') h = S.res === 'cancel' ? '對決取消，不記' : `<b>${{ win: '勝', lose: '敗', draw: '平手' }[S.res]}</b>　你 ${S.hpPct[0]}%　／　對手 ${S.hpPct[1]}%`;
  if (h !== shown) { shown = h; b.innerHTML = h; b.style.display = h ? 'block' : 'none'; }
  btnT -= dt; if (btnT > 0) return; btnT = 0.3;      // 對方名牌旁的「⚔ 對決」按鈕：兩個人都在競技場裡才出現
  for (const r of C.remotes.values()) {
    if (!r.tag || !r.tag.el) continue; let el = r._d8; const ok = !whyNot(r) && !r.away;
    if (ok && !el) { el = r._d8 = document.createElement('span'); el.className = 'd8btn'; el.textContent = '⚔ 對決'; el.title = '邀請對方對決（定案 3-3）'; el.addEventListener('click', e => { e.stopPropagation(); invite(r); }); r.tag.el.appendChild(el); }
    if (el) el.style.display = ok ? '' : 'none';
  }
}
/* ---------- __dev08.duelDemo：單人也能把 state() 擺成某一幕 ---------- */
function demoState() {
  const d = demo, el = d.t0 == null ? 0 : (performance.now() - d.t0) / 1000;
  if (d.phase === 'count') return { phase: 'count', count: Math.max(1, Math.ceil(COUNT_T - el % (COUNT_T + 0.01))), t: 0, limit: TUNE.limit, vs: d.vs, me: { hp01: 1 }, outT: null };
  if (d.phase === 'fight') { const t = 47 + el; return { phase: 'fight', count: 0, t: Math.min(t, TUNE.limit), limit: TUNE.limit, vs: Object.assign({}, d.vs, { hp01: Math.max(0.05, 0.62 - el * 0.01) }), me: { hp01: Math.max(0.05, 0.85 - el * 0.005) }, outT: d.out ? Math.max(0, 5 - el) : null }; }
  if (d.phase === 'done') return { phase: 'done', count: 0, t: 132, limit: TUNE.limit, vs: d.vs, me: { hp01: 0.4 }, outT: null, res: d.res || 'win', by: d.by || 'down', hpPct: [40, 1] };
  return null;
}
function demoTick() { }
function setDemo(phase, o) {
  demo = null; inc = null; if (!phase) return true; const vs = { peer: 'demo', name: '小麥', lv: 9, hp01: 0.6, tag: null };
  demo = { phase, vs, t0: performance.now() }; if (o) Object.assign(demo, o);
  if (phase === 'invite') { demo.phase = 'none'; demo.inv = { from: { peer: 'demo', name: '小麥', lv: 9 }, t: 22, tmax: 30 }; H8.emit('duel:invite', { from: demo.inv.from, t: 30 }); }
  else if (phase === 'count') { H8.emit('duel:count', { n: 3 }); }
  else if (phase === 'fight') { H8.emit('duel:go', {}); }
  else if (phase === 'done') { H8.emit('duel:result', { kind: 'duel', res: demo.res || 'win', by: demo.by || 'down', hpPct: [40, 1], vs: { peer: 'demo', name: '小麥', lv: 9 } }); }
  return true;
}

/* ---------- 接進遊戲 ---------- */
H8.on('init', ctx => {
  C = ctx; me = ctx.me; if ('noSafe' in H8.fn) H8.provide('noSafe', () => !!D && D.ph !== 'done', 'P6'); else installMask(); listen();      /* 有 noSafe 掛鉤就用掛鉤；舊版 hooks08 沒有時退回 me.inSafe 遮罩 */
  H8.save8('d8', () => ({ w: REC.win, l: REC.lose, d: REC.draw }), d => { REC = { win: (d && d.w) | 0, lose: (d && d.l) | 0, draw: (d && d.d) | 0 }; });
  H8.on('frame', dt => { try { frame(dt); tmpUi(dt); } catch (e) { console.error('[duel08]', e); } });
  if (window.__dev07) {
    const dv = window.__dev08 = window.__dev08 || {};
    dv.duel = peer => { devForce = true; devAuto = true; const r = peer ? C.remotes.get(peer) || peer : [...C.remotes.values()][0]; return invite(r); };      // 直接發邀請（不管位置）；devAuto＝收到邀請自動接受
    dv.duelDemo = (phase, o) => setDemo(phase, o);
    window.__duel08 = { state, invite, answer, rec, lockIsDuel, inviteIn, busy, get D() { return D; }, get inc() { return inc; }, get out() { return out; }, set devForce(v) { devForce = !!v; }, set devAuto(v) { devAuto = !!v; }, tune: TUNE };      // 測試用：tune.limit／inv／grace／away 可縮短（正式版沒有 __dev07 就改不到）

  }
});

function listen() {
window.addEventListener('keydown', e => {      // Y／N：只在對決邀請出現、而且沒有組隊邀請（#invite）時
  if (!inc || ext() || e.repeat || (e.code !== 'KeyY' && e.code !== 'KeyN')) return; const p = document.getElementById('invite'); if (p && !p.hidden) return;
  const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return; e.preventDefault(); answer(e.code === 'KeyY');
}, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hideAt = Date.now(); return; }
  if (D && D.ph !== 'done' && hideAt && Date.now() - hideAt > TUNE.away * 1000) decide('lose', 'drop'); hideAt = 0;
});

}
