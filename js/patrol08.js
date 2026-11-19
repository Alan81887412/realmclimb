/* 0.8 R4／X14：鬥犬巡邏路線（P2-b）、長吠叫同伴（P2-c）、栗子帶狗群走開（s11）。
   原則：閒著巡邏的狗，位置只看「共同時鐘」（hooks08.now()，以主控端為準）算出來，所有人算得一樣，不用同步，也不佔 hostPack 的活動名額（掛鉤 packSkip）。
   只有發現玩家／被打／被叫走／走回路上的那一段，才交給主控端模擬、走 hostPack 同步。
   路線資料：places08.js 的 PATROL08（路點、停留秒數、速度 2 m/s、每條路上有幾群）。每群三隻，同一條路上的幾群錯開相位；群裡第 k 隻比前一隻晚 1.1 秒到同一點（排成一列，哨點上聚成一團，轉身時不會跳）。
   介面：beastai07.js 只呼叫 host(w, X)、post(w)、callPack(L, who)；掛鉤 packSkip／farIdle／idleView 在這裡自己 provide；game.js 只多一個 w.pat8（巡邏中不用 14 m 全方位的舊察覺，改用這裡的視野）。
   註：這個檔不匯入 beastai07.js（beastai07 匯入它），遊戲狀態從 hooks08 的 init 事件拿。 */
import { MST, angDiff, dampAng } from './core.js';
import * as H8 from './hooks08.js';
import { PATROL08 } from './places08.js';
const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, atan2 = Math.atan2;

export const SIGHT = { front: 20, side: 8, half: 1.047 };      /* 前方 ±60° 看 20 m，其他方向 8 m（乘雨天的 senseK） */
export const SIGHT_CHESTNUT = { front: 14, side: 4, half: 1.047 };      /* 栗子那一群眼神差一點：側後方 4 m 才發現，所以從背後慢慢靠近，6 m 內遞骨頭來得及（s11：被發現前走到 6 m 內） */
export const GAIT = { lag: 1.1, back: 4.0, leave: 2.8, join: 2.5, leaveT: 55, leaveDist: 45, callR: 60, spread: 1.5 };
export const CHESTNUT_ID = 469;      /* 和 quest08.js 的 CHESTNUT08 同一隻（hill_in 第一群的第三隻） */

let C = null;
const ROUTES = [], DOG = new Map(), ST = new WeakMap(), LEAVE = new Map();      /* DOG：怪物編號 → { R, g, k }；LEAVE：pack → 走開的設定 */
const S7 = w => { let s = ST.get(w); if (!s) ST.set(w, s = {}); return s; };

/* ---------- 路線時間表（純函式，node 可單獨測） ---------- */
export function buildRoute(r) {
  const P = r.pts, n = P.length, sp = r.speed || 2, order = []; for (let i = 0; i < n; i++) order.push(i); for (let i = n - 2; i >= 1; i--) order.push(i);      /* 來回：0…n−1…1，再回 0 */
  const segs = [], outs = []; let t = 0;
  for (let k = 0; k < order.length; k++) {
    const i = order[k], j = order[(k + 1) % order.length], p = P[i], q = P[j], stay = p.stay || 0;
    if (stay > 0) { segs.push({ t0: t, t1: t + stay, type: 'stay', x: p.x, z: p.z, hd: 0 }); t += stay; }
    const dx = q.x - p.x, dz = q.z - p.z, len = hyp(dx, dz), d = len / sp; if (d <= 0) continue;
    const sg = { t0: t, t1: t + d, type: 'move', ax: p.x, az: p.z, dx, dz, hd: atan2(dx, dz), len }; segs.push(sg); if (outs.length < n - 1) outs.push(sg); t += d;      /* outs：去程的 n−1 段（算群的相位用） */
  }
  for (let k = 0; k < segs.length; k++) if (segs[k].type === 'stay') { let m = (k + segs.length - 1) % segs.length, c = 0; while (segs[m].type !== 'move' && c++ < segs.length) m = (m + segs.length - 1) % segs.length; segs[k].hd = segs[m].hd || 0; }      /* 站著時面向剛走來的方向 */
  return { id: r.id, T: t, segs, outs, speed: sp };
}
/* 離路線最近的那一點在去程的時間（秒）和距離：算每一群的相位（照出生點的間距，群與群原本離多遠，路上就離多遠） */
export function projT(R, x, z) {
  let best = 1e9, bt = 0; for (const s of R.outs) { const L2 = s.dx * s.dx + s.dz * s.dz || 1, k = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / L2)), d = hyp(x - (s.ax + s.dx * k), z - (s.az + s.dz * k)); if (d < best) { best = d; bt = s.t0 + k * (s.t1 - s.t0); } }
  return { t: bt, d: best };
}
/* 時間 t（秒）的位置：{ x, z, hd（朝向）, w（0–1：站著的程度，1 秒淡入淡出，給「聚成一團」用）, mv（是不是在走） } */
export function at(R, t) {
  t = ((t % R.T) + R.T) % R.T; let lo = 0, hi = R.segs.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (R.segs[m].t1 <= t) lo = m + 1; else hi = m; }
  const s = R.segs[lo];
  if (s.type === 'stay') return { x: s.x, z: s.z, hd: s.hd, w: Math.max(0, Math.min(1, t - s.t0, s.t1 - t)), mv: false };
  const k = (t - s.t0) / (s.t1 - s.t0); return { x: s.ax + s.dx * k, z: s.az + s.dz * k, hd: s.hd, w: 0, mv: true };
}
/* 相位 off（秒）那一群的第 k 隻在時鐘時間 t 的位置 */
export function placeAt(R, off, k, t) {
  const p = at(R, t + off - k * GAIT.lag), a = k * 2.1 + off * 0.37, rad = GAIT.spread * p.w * (k ? 1 : 0.35);
  return { x: p.x + cos(a) * rad, z: p.z + sin(a) * rad, hd: p.hd, mv: p.mv };
}

/* ---------- 綁定（第一次用到時，從 sim 找出每條路上的狗群） ---------- */
let bound = false, chestPack = null;
function bind() {
  if (bound || !C || !C.sim || !C.sim.length) return; bound = true; if (C.sim[CHESTNUT_ID]) chestPack = C.sim[CHESTNUT_ID].pack;
  for (const r of PATROL08) {
    const R = buildRoute(r); ROUTES.push(R); let t0 = null;
    (r.groups || []).forEach((first, g) => {
      const w0 = C.sim[first]; if (!w0 || w0.type !== 'dog' || w0.pack == null) return;
      const v0 = C.mons[first] || w0, pj = projT(R, v0.lx != null ? v0.lx : w0.hx, v0.lz != null ? v0.lz : w0.hz); if (t0 == null) t0 = pj.t;
      const off = pj.d < 40 ? pj.t - t0 : g * 20;      /* 出生點在路上（40 m 內）：照原本的間距；不在路上的（gate）：一群隔 20 秒（約 40 m） */
      const mem = C.sim.filter(o => o.type === 'dog' && o.pack === w0.pack && !o.elite && !o.leash).sort((a, b) => a.id - b.id);
      mem.forEach((o, k) => DOG.set(o.id, { R, g, k, off }));
    });
  }
}
export const routeOf = id => (DOG.get(id) || {}).R || null;
export function posOf(id, t) { const d = DOG.get(id); return d ? placeAt(d.R, d.off, d.k, t == null ? H8.now() : t) : null; }
const packOf = w => (w.pack != null && C.packs.get(w.pack)) || [w];
const alive = w => w.st !== MST.DEAD;

/* ---------- 主控端：IDLE 的狗（beastai07 的 host() 先問這裡；回傳 undefined＝照舊，true＝這一幀處理完了） ---------- */
export function host(w, X) {
  bind(); const s = S7(w), d = DOG.get(w.id), dt = X.dt;
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.mode = null; s.home0 = null; }
  if (w.st !== MST.IDLE || X.tgt) { if (d) { s.mode = 'fight'; w.pat8 = false; } return undefined; }
  if (s.home0) { w.hx = s.home0.hx; w.hz = s.home0.hz; s.home0 = null; }      /* 被叫去幫忙的狗：回自己的老家 */
  if (!d) return undefined;
  const t = H8.now(), g = placeAt(d.R, d.off, d.k, t); s.gx = g.x; s.gz = g.z; w.pat8 = true;
  const lv = LEAVE.get(w.pack);
  if (lv && t > lv.until) LEAVE.delete(w.pack);
  if (LEAVE.has(w.pack)) s.mode = 'leave'; else if (s.mode === 'leave') s.mode = 'back';
  if (!s.mode) s.mode = hyp(w.x - g.x, w.z - g.z) < GAIT.join ? 'patrol' : 'back';
  else if (s.mode === 'fight') s.mode = 'back';      /* 打完了（沒有目標、站著）：走回路上，不瞬移 */
  if (s.mode !== 'leave') {      /* 發現玩家：前方 ±60° 20 m、其他方向 8 m（乘雨天倍率）；整群一起上 */
    const sk = H8.fn.senseK(w) || 1, sg = w.pack === chestPack ? SIGHT_CHESTNUT : SIGHT; let who = null, best = 1e9;
    for (const [id, p] of X.players) { const dx = p.x - w.x, dz = p.z - w.z, dd = hyp(dx, dz), lim = (Math.abs(angDiff(w.f, atan2(dx, dz))) < sg.half ? sg.front : sg.side) * sk; if (dd <= lim && dd < best) { best = dd; who = id; } }
    if (who != null) { w.target = who; w.provoked = true; for (const o of packOf(w)) if (o !== w && alive(o) && !o.target) { o.target = who; o.provoked = true; } s.mode = 'fight'; w.pat8 = false; const p = C.playerOf(who); if (p) w.f = atan2(p.x - w.x, p.z - w.z); return true; }
  }
  if (s.mode === 'patrol') { X.nx = g.x; X.nz = g.z; w.f = dampAng(w.f, g.hd, 8, dt); w.hx = g.x; w.hz = g.z; return true; }
  let tx = g.x, tz = g.z, sp = GAIT.back;
  if (s.mode === 'leave') { const k = d.k; tx = lv.x + lv.ax * GAIT.leaveDist + cos(k * 2.1) * 2.2; tz = lv.z + lv.az * GAIT.leaveDist + sin(k * 2.1) * 2.2; sp = GAIT.leave; if (hyp(w.x - tx, w.z - tz) < 2.5) { w.hx = w.x + 8; w.hz = w.z; return true; } }      /* 走到了就站在那裡嗅（不打人），時間到才走回路上 */
  const dx = tx - X.nx, dz = tz - X.nz, dd = hyp(dx, dz);
  if (s.mode === 'back' && dd < GAIT.join) { s.mode = 'patrol'; X.nx = g.x; X.nz = g.z; w.hx = g.x; w.hz = g.z; return true; }
  if (dd > 0.05) { const st = Math.min(sp * dt, dd); X.nx += dx / dd * st; X.nz += dz / dd * st; w.f = dampAng(w.f, atan2(dx, dz), 8, dt); }
  w.hx = w.x + 8; w.hz = w.z;      /* 走回路上／走開的狗要放進 hostPack（game.js 的條件之一是離老家 > 7.5 m）：老家先放在身邊 8 m 外；回到路上時再放回時鐘位置 */
  return true;
}
/* beastai07.post(w)：碰撞推擠之後，巡邏中的狗回到時鐘位置（主控端與別人算的才一樣） */
export function post(w) { if (w.type !== 'dog' || w.st !== MST.IDLE) return; const s = ST.get(w); if (s && s.mode === 'patrol' && s.gx != null) { w.x = s.gx; w.z = s.gz; } }

/* ---------- 掛鉤 ---------- */
H8.provide('packSkip', s => { if (s.type !== 'dog' || s.st !== MST.IDLE) return false; const q = ST.get(s); return !!q && q.mode === 'patrol' && DOG.has(s.id); }, 'R4');
H8.provide('farIdle', (w, dt) => {      /* 主控端：78 m 內沒人的巡邏狗直接放到時鐘位置（沒人看得到） */
  if (w.type !== 'dog' || !DOG.size) return; const d = DOG.get(w.id); if (!d) return; const s = S7(w);
  if (s.sp !== w.spawn) { s.sp = w.spawn; s.home0 = null; }
  if (s.home0) { w.hx = s.home0.hx; w.hz = s.home0.hz; s.home0 = null; }
  const p = placeAt(d.R, d.off, d.k, H8.now()); w.x = w.hx = w.wx = p.x; w.z = w.hz = w.wz = p.z; w.f = p.hd; s.gx = p.x; s.gz = p.z; s.mode = 'patrol'; w.pat8 = true;
}, 'R4');
function viewPlace(v) { const p = posOf(v.id); if (!p) return false; v.tx = v.hx = p.x; v.tz = v.hz = p.z; v.tf = p.hd; return true; }
H8.provide('idleView', (v, dt) => (v.type === 'dog' ? viewPlace(v) : false), 'R4');      /* 非主控端：沒被主控端點名的狗，畫在時鐘位置 */

/* ---------- 每幀（所有人） ---------- */
function frame(dt) {
  if (!C) return; bind(); if (!DOG.size) return; const host = C.Net.isHost;
  for (const id of DOG.keys()) {
    const v = C.mons[id]; if (!v) continue;
    if (v.st === MST.DEAD) { const p = posOf(id); if (p) { v.hx = p.x; v.hz = p.z; const w = C.sim[id]; if (host && w) { w.hx = p.x; w.hz = p.z; } } continue; }      /* 死掉的：老家跟著時鐘走，重生時就在路上 */
    if (!host && !v.awake && v.st === MST.IDLE) viewPlace(v);      /* 離得遠、沒進畫面也要跟著走，進視野時不會從老家飛過來 */
  }
  if (host) chestnutNet();
}
const netSeen = new WeakMap();
function chestnutNet() { for (const r of C.remotes.values()) { const p = r.lastPres; if (!p || typeof p.cn8 !== 'number' || netSeen.get(r) === p.cn8) continue; netSeen.set(r, p.cn8); if (Math.abs(H8.now() - p.cn8 / 10) < 30) startLeave(r); } }

/* ---------- 栗子：餵骨頭之後，整群跟著牠走開、一段時間不打人 ---------- */
export function startLeave(from) {
  bind(); const w0 = C.sim[CHESTNUT_ID]; if (!w0 || w0.pack == null) return false; const mem = packOf(w0).filter(alive); if (!mem.length) return false;
  let cx = 0, cz = 0; for (const o of mem) { cx += o.x; cz += o.z; } cx /= mem.length; cz /= mem.length;
  let ax = cx - (from ? from.x : C.me.x), az = cz - (from ? from.z : C.me.z), l = hyp(ax, az); if (l < 0.5) { ax = 1; az = 0; l = 1; } ax /= l; az /= l;
  LEAVE.set(w0.pack, { until: H8.now() + GAIT.leaveT, x: cx, z: cz, ax, az });
  for (const o of mem) { o.target = null; o.provoked = false; if (o.st === MST.CHASE || o.st === MST.STAGGER || o.st === MST.FLEE) { o.st = MST.IDLE; o.t = 0; } S7(o).mode = 'leave'; }
  return true;
}
H8.on('beast:chestnut', e => {
  if (!C || !e || e.how !== 'feed' || (e.who && e.who !== 'self')) return;
  if (C.Net.isHost) startLeave(C.me); else C.netSet('cn8', Math.round(H8.now() * 10), true);
});
export const leaving = pack => LEAVE.has(pack);

/* ---------- 長吠叫同伴（beastai07 的吠叫招式落地沒被打斷時呼叫）：60 m 內最近的一群沒在打的鬥犬趕來，最多一群 ---------- */
export function callPack(L, who) {
  if (!C) return 0; let best = null, bd = GAIT.callR;
  for (const o of C.sim) { if (o.type !== 'dog' || o.pack === L.pack || !alive(o) || o.st !== MST.IDLE || o.target || o.elite || o.leash || o.trial8) continue; const d = hyp(o.x - L.x, o.z - L.z); if (d < bd) { bd = d; best = o.pack; } }
  if (best == null) return 0; let n = 0;
  for (const o of packOf({ pack: best })) { if (!alive(o) || o.leash || o.elite) continue; const s = S7(o); if (!s.home0) s.home0 = { hx: o.hx, hz: o.hz }; o.hx = L.hx; o.hz = L.hz; o.target = who; o.provoked = true; s.mode = 'fight'; o.pat8 = false; n++; }      /* 老家暫時放到叫的那隻的老家：目標離牠們不超過 leash 42 m，才不會一出發就被放棄 */
  LEAVE.delete(best);
  if (n) H8.emit('beast:call', { from: L.id, pack: best, n });
  return n;
}

H8.on('init', ctx => { C = ctx; });
H8.on('frame', dt => { try { frame(dt); } catch (e) { console.error('[patrol08]', e); } });
if (typeof window !== 'undefined') window.__patrol08 = { get routes() { return ROUTES; }, DOG, posOf, at, placeAt, buildRoute, startLeave, callPack, state: id => { const w = C && C.sim[id], s = w && ST.get(w); return s ? { mode: s.mode, gx: s.gx, gz: s.gz, home0: s.home0 || null, pat8: !!w.pat8 } : null; }, leave: LEAVE, GAIT, SIGHT, SIGHT_CHESTNUT };
