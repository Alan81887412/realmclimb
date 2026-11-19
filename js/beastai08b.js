// 0.8 X3b：新野獸行為——猩猩（含小猩猩）、岩羊、獄卒犬「拴住」。接法照 beastai07.js：game.js 的補丁只做匯入＋呼叫。
// 介面（game.js 補丁呼叫）：init(ctx)｜owns(w)｜host(w, X)｜post(w)｜shape(v, M)｜onHurt(v, M, res)｜rock(v, s, M)｜dmgK(v)｜make(type, size, elite, v)｜attach(w, v, s)｜frame(dt)｜cliff(w)｜blocked(x, z, nx, nz)｜leashed(w)
// 給介面（beastai07.EXT 註冊）：struggle()｜dragged()｜targetedBy()｜cast(v)
// 判定規則照現有的：主控端模擬野獸、每個人只判定自己有沒有被打中；預警（moveShape）＝判定。
// ───── 抓摔怎麼同步（多人最容易漏判的地方）─────
//   1 受害者自己判定被 ape_grab 打中 → presence g8＝[猿編號, 動作編號 % 1000, 槽位]（和沼蟒的 h7 同一種做法；有「動作編號」才不會讀到上一次的）
//   2 主控端看到 g8 對得上這一招 → 開始「舉起」（狀態招式 ape_lift，STRIKE 1.2 秒），同時在自己的 presence 放 l8＝[[猿編號, 被舉的人的 peer, 槽位], …]
//     （l8 讓「同時被打中、但名額只有一個」的另一個人知道自己沒被舉，自己放開）
//   3 舉起期間：主控端每幀算「同伴打掉的血量」（傷害紀錄裡除了被抓的人以外的總和 − 舉起那一刻的值）≥ 同級普通猩猩血量的 5% → 放手；
//     受害者自己掙脫（g8 清掉）、被抓的人倒下或離線 → 放手；滿 1.2 秒 → 丟出去
//   4 結局只有主控端決定、用同一個狀態招式的收招廣播：ape_lift 的 RECOVER 狀態＋arg 的最低位（1＝丟出去、0＝放手）。兩邊的畫面都看這個，所以不可能「這邊被丟、那邊已經放手」
//   5 受害者看到 ape_lift 的 STRIKE（而且 l8 有自己）才開始黏在猿的手上；之後看到 RECOVER 就依 arg 丟或放。1.8 秒內沒等到舉起（封包掉了）就自己脫身
// ───── arg 的編碼（hostPack 的 arg 上限 300、整數）─────
//   arg = 加成等級 × 75 ＋ d5。加成等級：0 無｜1 捶胸（傷害 ×1.1）｜2 護小暴怒（傷害 ×1.2）；d5＝落點距離（0.2 公尺一格、0–74，只有 ape_rock 用）；ape_lift 的收招用 d5＝丟（1）或放（0）
//   受害者端的傷害加成由 game.js 補丁在 hurtMe 那行乘 dmgK(v)。
import * as THREE from './three.bundle.js';
import { MON, MOVES, MOVE_IDS, MON_BASE_LV, MST, TAU, clamp, lerp, angDiff, dampAng, monStats, WATER } from './core.js';
import { Hgt, monBlocked, collide, blockedAt, waterDepth, slopeAt, climbAt, SLOPE, W } from './world.js';
import * as WM from './world.js';
import { popNumber, emit, fxRing, fx } from './actors.js';
import * as B08 from './beasts08.js'; import * as B07w from './beasts07.js';      /* X4：獄卒長的模型在 beasts07（鬥犬） */
import * as H8 from './hooks08.js';
import * as BA7m from './beastai07.js';      /* 用 namespace：舊版 beastai07（沒有 EXT）也載得起來 */
import { MON08, LV_BASE08, YOUNG08 } from './data08.js';      /* 0.8 X8 */
const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, PI = Math.PI;

/* ============================== 數字（數值總監改這裡） ============================== */
export const T = {
  young: YOUNG08,      // 小猩猩：血量、傷害、經驗、體型 對猩猩的倍率（體型 0.6 照美術）
  ape: { beatT: 12, beatK: 1.1, rageT: 20, rageK: 1.2, liftT: 1.2, throwD: 6, throwT: 0.55, holdFwd: 1.7, liftY: 2.3, breakRatio: 0.05, grabWait: 1.2, throwRec: 0.9, dropRec: 1.1, rockLife: 6, rockR: 1.25 },
  ibex: { knock: 5, knockBlocked: 2, knockT: 0.45, climbMax: 3.0, fightT: 7, cornerD: 4.2, ledgeGain: 3.5, fleeMax: 5, fleeNear: 16, ledgeMax: 30 },      /* X4：fleeMax 沒有崖可上時逃幾秒（人還在 fleeNear 公尺內）就回頭打；ledgeMax 崖上最多待幾秒（人在 24 公尺內等著）就下來打（人走到 6.5 公尺內照舊馬上反擊） */
  leash: { reach: 2.9 }
};
export const LV_K = [1, T.ape.beatK, T.ape.rageK];
/* 0.8 X8：數字在 data08.js（MON08、LV_BASE08；core.js 的 MON 指向同一批物件） */
export const MON08B = { ape: MON08.ape, ibex: MON08.ibex };
export const LV08B = { ape: LV_BASE08.ape, ibex: LV_BASE08.ibex };
const mv = (name, anim, shape, o) => Object.assign({ name, anim, shape, wind: 0.6, strike: 0.3, recover: 0.7, dash: 0, at: 0, dmg: 1, min: 0, max: 3, w: 1.8, r: 3, r0: 0, arc: 1, off: 0, dir: 0, track: 0.6, cd: 0, low: 1 }, o);
// 新欄位：sh8 預警形狀問這裡的 shape()（nj 的招式回 null＝不畫）｜nj 不判定（狀態用的招）｜seize 打中會被抓（onHurt）｜shove 打中會被推開（onHurt）｜rock 落地留石頭
export const MOVES08B = {
  ape_swat: mv('拍擊', 'swipe', 'cone', { wind: 0.62, strike: 0.24, recover: 0.7, r: 2.6, arc: 0.9, at: 0.1, dmg: 0.8, max: 3.0 }),
  ape_slam: mv('雙拳砸地', 'slam', 'circle', { wind: 0.9, strike: 0.25, recover: 1.1, r: 6, at: 0.15, dmg: 1.0, max: 4.8, heavy: 1, armor: 1, cd: 5 }),
  ape_grab: mv('抓舉', 'grab', 'cone', { wind: 0.7, strike: 0.25, recover: 1.25, r: 1.9, arc: 0.62, at: 0.14, dmg: 0.4, min: 0, max: 2.6, cd: 7, track: 0.5, seize: 1, armor: 1 }),
  ape_lift: mv('舉起', 'grab', 'circle', { wind: 0.1, strike: 1.2, recover: 1.0, r: 0, dmg: 1.1, heavy: 1, nj: 1, sh8: 1 }),
  ape_rock: mv('拔石', 'rock', 'circle', { wind: 1.0, strike: 0.55, recover: 0.9, r: 2.1, at: 0.5, dmg: 1.0, min: 5, max: 14.8, argOff: 1, sh8: 1, rock: 1, cd: 9, track: 0, heavy: 1 }),
  ape_beat: mv('捶胸', 'beat', 'circle', { wind: 0.5, strike: 1.0, recover: 0.5, r: 0, armor: 1, nj: 1, sh8: 1 }),
  ibex_ram: mv('下坡衝撞', 'ram', 'line', { wind: 0.8, strike: 0.5, recover: 1.1, dash: 9, w: 2.0, min: 4, max: 11, dmg: 1.1, heavy: 1, track: 0.6, cd: 5, shove: 1 }),
  ibex_butt: mv('連頂', 'butt', 'cone', { wind: 0.5, strike: 0.25, recover: 0.5, r: 2.3, arc: 0.75, at: 0.1, dmg: 0.7, max: 2.6 }),
  ibex_flee: mv('逃上崖', 'flee', 'circle', { wind: 0.1, strike: 0.1, recover: 3600, r: 0, nj: 1, sh8: 1 })
};
let ready = false;
// 載入當下就併進 core.js 的表（initGame 要用 MON／MOVES；招式編號接在現有的後面，每台一樣）。core.js 的補丁已經加了 MON.ape／MON.ibex 就不重複
export function enable() {
  if (ready) return true; ready = true;
  for (const k in MON08B) if (!MON[k]) MON[k] = MON08B[k];
  for (const k in LV08B) if (MON_BASE_LV[k] == null) MON_BASE_LV[k] = LV08B[k];
  for (const id in MOVES08B) { if (MOVES[id]) continue; const M = MOVES08B[id]; M.id = id; M.i = MOVE_IDS.length; MOVES[id] = M; MOVE_IDS.push(id); }
  if (MOVE_IDS.length > 63) console.warn('招式超過 63 種，編碼放不下');
  return true;
}
enable();

/* ============================== 純函式（node 直接測） ============================== */
export const encArg = (lvl, d5 = 0) => clamp(lvl | 0, 0, 2) * 75 + clamp(Math.round(d5), 0, 74);
export const decArg = a => { a = a | 0; const lvl = clamp(Math.floor(a / 75), 0, 2); return { lvl, d5: clamp(a - lvl * 75, 0, 74) }; };
// 坡下的方向（單位向量與坡度）；平地回 null
export function downhill(hgt, x, z) { const e = 0.7, gx = (hgt(x + e, z) - hgt(x - e, z)) / (2 * e), gz = (hgt(x, z + e) - hgt(x, z - e)) / (2 * e), s = hyp(gx, gz); return s < 1e-6 ? null : { dx: -gx / s, dz: -gz / s, s }; }
// 岩羊衝撞的擊退方向：坡度夠（≥ minS）而且坡下大致在羊衝過來的方向（不往羊身後推）→ 往坡下；否則（平地、或人站在羊的上坡）→ 從羊往人的方向
export function shoveDir(hgt, px, pz, fromX, fromZ, minS = 0.1) {
  let ax = px - fromX, az = pz - fromZ; const al = hyp(ax, az) || 1; ax /= al; az /= al;
  const g = downhill(hgt, px, pz); if (g && g.s >= minS && g.dx * ax + g.dz * az >= -0.2) return { dx: g.dx, dz: g.dz, down: true };
  return { dx: ax, dz: az, down: false };
}
// 強制位移（丟出去、推開）的一步：sl＝{ dx, dz, dist, dur, t, done, stop }；env＝{ get(): {x,z}, set(x, z), blocked(x, z), collide(o) }。分成 ≤0.35 公尺的小步（不會穿過樹、岩石、不能走的格子）；碰到就停在那裡
export function stepSlide(sl, dt, env) {
  sl.t += dt; const k = clamp(sl.t / sl.dur, 0, 1), want = (1 - (1 - k) * (1 - k)) * sl.dist; let step = want - sl.done;
  while (step > 1e-4 && !sl.stop) {
    const s = Math.min(step, 0.35), p = env.get(), nx = p.x + sl.dx * s, nz = p.z + sl.dz * s;
    if (env.blocked(nx, nz)) { sl.stop = true; break; }
    const o = { x: nx, z: nz }; env.collide(o); if (hyp(o.x - nx, o.z - nz) > 0.25) sl.stop = true;
    env.set(o.x, o.z); sl.done += s; step -= s;
  }
  return sl.t >= sl.dur || sl.stop;
}
// 拴住：超出半徑就拉回圈邊（圈心 L.x、L.z，半徑 L.r）
export function leashClamp(L, x, z) { const dx = x - L.x, dz = z - L.z, d = hyp(dx, dz); if (d <= L.r || d < 1e-6) return { x, z, clamped: false }; return { x: L.x + dx / d * L.r, z: L.z + dz / d * L.r, clamped: true }; }
// 同級普通個體的血量 × 比例（製作人裁決 20:35 第 3 條）
export const breakHp = (type, lv, ratio = T.ape.breakRatio) => monStats(type, lv, false).hp * ratio;
// 岩羊找崖：往遠離威脅的方向，找一個比現在高 ≥ gain 公尺、站得住、而且「走過去的路上有人爬不上去的坡」但羊爬得上去的地方
export function findLedge(env, w, away, o = {}) {
  const h0 = env.hgt(w.x, w.z), gain = o.gain ?? T.ibex.ledgeGain; let best = null, bs = -1e9;
  for (let k = 0; k < 24; k++) {
    const a = k * TAU / 24, ux = sin(a), uz = cos(a), dot = away ? ux * away.x + uz * away.z : 0; if (dot < -0.4) continue;
    for (const r of [8, 12, 16, 21, 27]) {
      const px = w.x + ux * r, pz = w.z + uz * r, g = env.hgt(px, pz) - h0; if (g < gain || env.blocked(px, pz) || env.slope(px, pz) > 1.1) continue;
      let ok = true, steep = false;
      for (let q = 1.5; q < r; q += 1.5) { const qx = w.x + ux * q, qz = w.z + uz * q, s = env.slope(qx, qz); if (env.blocked(qx, qz) || s > T.ibex.climbMax) { ok = false; break; } if (s > env.climb(qx, qz) + 0.07 && env.hgt(qx + ux * 0.7, qz + uz * 0.7) > env.hgt(qx - ux * 0.7, qz - uz * 0.7)) steep = true; }
      if (!ok || !steep) continue; const sc = g + r * 0.2 + dot * 4; if (sc > bs) { bs = sc; best = { x: px, z: pz, gain: g }; }
    }
  }
  return best;
}
const worldEnv = { hgt: Hgt, slope: (x, z) => slopeAt(x, z).s, climb: climbAt, blocked: (x, z) => blockedAt(x, z) || waterDepth(x, z) > WATER.mon };

/* ============================== 共用 ============================== */
let C = null, now = 0, frameN = 0;
const ST = new WeakMap(), S = w => { let s = ST.get(w); if (!s) ST.set(w, s = {}); return s; };
export const owns = w => !!w && (w.type === 'ape' || w.type === 'ibex' || !!w.leash);
const dist = (a, b) => hyp(a.x - b.x, a.z - b.z);
const alive = w => w.st !== MST.DEAD;
const packOf = w => (w.pack != null && C.packs.get(w.pack)) || [w];
const monOf = id => C.mons[id] || (C.x8 ? C.x8.mons.find(v => v.id === id) : undefined);
const ledgerOf = w => C.ledger.get(C.mkey(w));
const ledgerSum = w => { const L = ledgerOf(w); let n = 0; if (L) for (const d of L.values()) n += d; return n; };
const othersDmg = (w, who) => { const L = ledgerOf(w); let n = 0; if (L) for (const [k, d] of L) if (k !== who) n += d; return n; };
function topDamager(w) { const L = ledgerOf(w); let best = null, bd = 0; if (L) for (const [who, d] of L) if (d > bd && C.playerOf(who)) { bd = d; best = who; } return best; }
function face(w, x, z, rate, dt) { const a = Math.atan2(x - w.x, z - w.z), d = angDiff(w.f, a); w.f += clamp(d, -rate * dt, rate * dt); }
function walk(w, X, x, z, sp) { const dx = x - X.nx, dz = z - X.nz, d = hyp(dx, dz); if (d < 0.05) return d; const s = Math.min(sp * X.dt, d); X.nx += dx / d * s; X.nz += dz / d * s; w.f = dampAng(w.f, Math.atan2(dx, dz), 10, X.dt); return d; }
function setAct(w, M, st, dur) { w.M = M; w.mvc = (M.i + 1) | (w.enr ? 64 : 0); w.st = st; w.t = 0; if (st === MST.RECOVER) w.rd = dur; else if (st === MST.STRIKE) w.sd = dur; else if (st === MST.WIND) w.wd = dur; w.chain = null; }
const youngOf = w => !!(w && w.young);

/* ============================== 主控端 ============================== */
export function host(w, X) {
  if (!ready || !C) return false; now = C.clock(); const s = S(w); s.dt = X.dt;
  if (s.frz && (w.st === MST.IDLE || w.st === MST.CHASE)) { const t = X.tgt; if (t) face(w, t.x, t.z, 4, X.dt); if (w.st === MST.IDLE && t) w.st = MST.CHASE; return true; }      /* 測試用：按住不動 */
  if (w.elite) { const e8 = H8.fn.eliteHost(w, X); if (e8 === true) return true; }      /* X4：菁英的招式（elite08） */
  if (w.type === 'ape') return hostApe(w, X, s);
  if (w.type === 'ibex') return hostIbex(w, X, s);
  if (w.leash && w.type === 'dog') return hostLeash(w, X, s);
  return false;
}
/* ---------- 猩猩 ---------- */
function hostApe(w, X, s) {
  const dt = X.dt, D = MON.ape, M = w.M;
  if (s.sp !== w.spawn) { const first = s.sp === undefined; s.sp = w.spawn; s.rageT = s.beatT = 0; s.beaten = false; s.holds = []; s.fate = 0; s.ys = {}; s.aidSeen = -1; s.mSeen = null; if (!first) for (const o of packOf(w)) if (o.young) s.ys[o.id + '_' + o.spawn] = ledgerSum(o); }
  // 沒人的時候照自己的規則進入警告（察覺距離乘雨天的 senseK）；其他交給遊戲原本的流程
  if (w.st === MST.IDLE && !X.tgt) {
    const terr = D.terr * (w.elite ? 1.3 : 1) * H8.fn.senseK(w); let who = null, best = terr;
    for (const [id, p] of X.players) { const d = hyp(p.x - w.hx, p.z - w.hz); if (d < best) { best = d; who = id; } }
    if (who != null) { w.target = who; w.st = MST.WARN; w.t = 0; return true; }
  }
  if (!youngOf(w)) {
    // 護小：任何人打小猩猩（傷害紀錄增加）→ 暴怒 20 秒（傷害 +20%），並盯上打小猩猩最痛的那個人
    for (const o of packOf(w)) { if (o === w || !o.young) continue; const k = o.id + '_' + o.spawn, sum = ledgerSum(o), prev = s.ys[k] || 0; s.ys[k] = sum; if (sum > prev + 1e-6) rageOn(w, s, o); }
    s.rageT = Math.max(0, (s.rageT || 0) - dt); s.beatT = Math.max(0, (s.beatT || 0) - dt); s.lvl = s.rageT > 0 ? 2 : s.beatT > 0 ? 1 : 0;
    if (w.st === MST.STRIKE && M === MOVES.ape_lift) return liftTick(w, X, s);
    if (M && M.seize && w.st === MST.RECOVER && w.t < T.ape.grabWait) { const got = []; for (const [id] of X.players) if (got.length < maxHold(w) && grabbedBy(w, id)) got.push(id); if (got.length && (got.length >= maxHold(w) || w.t >= (maxHold(w) > 1 ? 0.3 : 0))) { startLift(w, s, got); return true; } }      /* X4：同時抓到的都舉起（白背最多 2；只抓到一個時多等 0.3 秒，讓隊友的判定傳過來） */
    if (M && M.id && M.id.startsWith('ape_') && (w.st === MST.WIND || w.st === MST.STRIKE || w.st === MST.RECOVER)) {
      if (s.aidSeen !== w.aid || s.mSeen !== M) { s.aidSeen = w.aid; s.mSeen = M; s.d5 = M.argOff ? clamp(Math.round(w.arg / 2), 0, 74) : 0; }
      w.arg = encArg(s.lvl, M === MOVES.ape_lift ? s.fate : M.argOff ? s.d5 : 0);
    }
    if (w.st === MST.CHASE) return chaseApe(w, X, s);
  }
  return false;
}
function rageOn(w, s, young) {
  s.rageT = T.ape.rageT; const who = topDamagerOf(young);
  if (who != null && C.playerOf(who)) { w.target = who; w.provoked = true; if (w.st === MST.IDLE || w.st === MST.WARN) { w.st = MST.CHASE; w.t = 0; } }
}
function topDamagerOf(o) { const L = ledgerOf(o); let best = null, bd = 0; if (L) for (const [who, d] of L) if (d > bd) { bd = d; best = who; } return best; }
function startAct(w, s, M, tgt, d5) { C.startMove(w, M, tgt); s.aidSeen = w.aid; s.mSeen = M; s.d5 = M.argOff ? (d5 != null ? d5 : clamp(Math.round(w.arg / 2), 0, 74)) : 0; w.arg = encArg(s.lvl, M.argOff ? s.d5 : 0); }
function chaseApe(w, X, s) {
  const tgt = X.tgt, dt = X.dt, D = MON.ape; if (!tgt) { w.st = MST.IDLE; w.t = 0; w.wanderT = 0; return true; }
  const dx = tgt.x - w.x, dz = tgt.z - w.z, d = hyp(dx, dz) || 0.01, toT = Math.atan2(dx, dz), rel = Math.abs(angDiff(w.f, toT)), ok = id => !(w.mcd[id] > 0);
  if (w.cd <= 0) {
    if (!s.beaten) { s.beaten = true; s.beatT = T.ape.beatT; s.lvl = Math.max(s.lvl || 0, 1); startAct(w, s, MOVES.ape_beat, tgt); return true; }      // 開打先捶胸（增益）
    if (s.lvl === 0 && (1 - ledgerSum(w) / w.hpMax) < 0.6 && !(s.beatCd > now)) { s.beatCd = now + 25; s.beatT = T.ape.beatT; s.lvl = Math.max(s.lvl || 0, 1); startAct(w, s, MOVES.ape_beat, tgt); return true; }      // 打到六成血以下再捶一次
    let far = null, fd = 0; for (const [id, p] of X.players) { const q = dist(w, p); if (q >= MOVES.ape_rock.min && q <= MOVES.ape_rock.max && q > fd) { fd = q; far = p; } }      // 丟最遠的人
    const c = [], add = (M, k, t, d5) => c.push([M, k, t, d5]);
    { const G = (w.elite && MOVES.ape_grab2) || MOVES.ape_grab; if (d <= G.max && ok(G.id) && rel < 0.8) add(G, 3, tgt); }      /* X4：白背用雙抓（elite08） */
    if (d <= MOVES.ape_slam.max && ok('ape_slam')) add(MOVES.ape_slam, d < 3.6 ? 2.2 : 1.2, tgt);
    if (d <= 3.0) add(MOVES.ape_swat, 1.2, tgt);
    if (far && ok('ape_rock') && (d >= 6 || far !== tgt)) add(MOVES.ape_rock, fd >= 8 ? 3 : 1.4, far, clamp(Math.round(clamp(fd, MOVES.ape_rock.min, MOVES.ape_rock.max) * 5), 25, 74));
    if (c.length) { let r = Math.random() * c.reduce((a, b) => a + b[1], 0), pick = c[0]; for (const e of c) { r -= e[1]; if (r <= 0) { pick = e; break; } } startAct(w, s, pick[0], pick[2], pick[3]); return true; }
  }
  const want = 2.3; if (d > want) walk(w, X, tgt.x, tgt.z, D.speed * (d > 8 ? 1.3 : 1)); else face(w, tgt.x, tgt.z, 3.2, dt);
  return true;
}
// 誰被這隻猿的這一招抓中了（受害者自己判定後放的 g8；主控端自己看自己的 grab）
function grabbedBy(w, who) { return grabbedAt(w, who, w.aid % 1000); }
function grabbedAt(w, who, a) {      /* X4：舉起之後動作編號換了，晚到的受害者用抓舉那一招的編號對 */
  if (who === 'self') return !!(grab && grab.id === w.id && grab.aid === a);
  const r = C.remotes.get(who), p = r && r.lastPres; return !!(p && Array.isArray(p.g8) && (p.g8[0] | 0) === w.id && (p.g8[1] | 0) === a);
}
function stillHeld(w, who) {
  if (who === 'self') return !!(grab && grab.id === w.id);
  const r = C.remotes.get(who), p = r && r.lastPres; return !!(p && Array.isArray(p.g8) && (p.g8[0] | 0) === w.id);
}
const MAXHOLD = 1, maxHold = w => (w.elite ? 2 : MAXHOLD);      /* 同時舉幾個人：一般 1、白背菁英雙抓 2（X4）。槽位 0＝右手、1＝左手，放在 l8 的第三格 */
function startLift(w, s, who) {
  const ids = Array.isArray(who) ? who : [who]; s.grabAid = w.aid % 1000; s.relW = []; who = ids[0];
  setAct(w, MOVES.ape_lift, MST.STRIKE, T.ape.liftT); w.aid++; w.target = who; w.kx = w.kz = 0; s.fate = 0; w.arg = encArg(s.lvl || 0, 0);
  s.holds = ids.map((id, k) => ({ who: id, slot: k, snap: othersDmg(w, id), t0: now })); s.aidSeen = w.aid; s.mSeen = MOVES.ape_lift; publishLifts();
}
function liftTick(w, X, s) {
  X.nx = w.x; X.nz = w.z; const need = breakHp('ape', monLv(w)); let ally = null, ch = false;
  if (s.holds && s.holds.length < maxHold(w) && w.t < 0.8) for (const [id] of X.players) if (s.holds.length < maxHold(w) && !s.holds.some(h => h.who === id) && !(s.relW || []).includes(id) && grabbedAt(w, id, s.grabAid)) { s.holds.push({ who: id, slot: s.holds.some(h => h.slot === 0) ? 1 : 0, snap: othersDmg(w, id), t0: now }); ch = true; }      /* X4：晚一點才收到的第二個人（舉起後 0.8 秒內） */
  for (const h of (s.holds || []).slice()) {
    const p = C.playerOf(h.who); let why = null;
    if (!p) why = 'gone'; else if (!stillHeld(w, h.who)) why = 'free'; else if (!ally && othersDmg(w, h.who) - h.snap >= need) { why = 'ally'; ally = h; }
    if (why) { s.holds.splice(s.holds.indexOf(h), 1); s.lastWhy = why; ch = true; (s.relW || (s.relW = [])).push(h.who); }
  }
  if (ally) for (const h of s.holds) h.snap = othersDmg(w, h.who);      /* X4 雙抓：救下一個之後，另一個要重新打夠 5% */
  if (ch && s.holds.length) publishLifts();
  if (!s.holds.length) endLift(w, s, 0); else if (w.t >= w.sd) endLift(w, s, 1);
  return true;
}
function endLift(w, s, thrown) {
  setAct(w, MOVES.ape_lift, MST.RECOVER, thrown ? T.ape.throwRec : T.ape.dropRec); w.aid++; s.fate = thrown ? 1 : 0; s.holds = []; w.arg = encArg(s.lvl || 0, s.fate); w.cd = Math.max(w.cd, thrown ? 1.4 : 1.0); w.immune = 0.4; s.aidSeen = w.aid; s.mSeen = MOVES.ape_lift; publishLifts();
}
function monLv(w) { const v = monOf(w.id); return v ? v.lv : MON_BASE_LV[w.type]; }
const lastL8 = { s: '' };
function publishLifts() {      // 主控端：把「誰被哪隻猿舉著」放進 presence（沒有時清掉）
  if (!C || !C.Net || !C.Net.isHost) return; const out = [];
  for (const w of C.sim) { if (w.type !== 'ape') continue; const s = ST.get(w); if (s && s.holds) for (const h of s.holds) out.push([w.id, h.who === 'self' ? (C.Net.selfPeer || 'local') : h.who, h.slot]); }
  const j = JSON.stringify(out); if (j === lastL8.s) return; lastL8.s = j; C.netSet('l8', out.length ? out : null, true);
}
export function liftsOf(id) { const w = C.sim[id], s = w && ST.get(w); return s && s.holds ? s.holds.map(h => h.who) : []; }
/* ---------- 岩羊 ---------- */
export const cliff = w => !!w && w.type === 'ibex' && !!S(w).cliffing;
// 岩羊爬崖時的「過不過得去」：只擋不能走的格子與深水，不看坡度（上限 climbMax 弧度正切＝很陡也行）
export function blocked(x, z, nx, nz) { return blockedAt(nx, nz) || waterDepth(nx, nz) > WATER.mon || slopeAt(nx, nz).s > T.ibex.climbMax; }
function nearestOf(X, w) { let p = null, id = null, d = 1e9; for (const [k, q] of X.players) { const e = dist(w, q); if (e < d) { d = e; p = q; id = k; } } return { p, id, d }; }
function hostIbex(w, X, s) {
  const dt = X.dt, M = w.M; if (s.sp !== w.spawn) { s.sp = w.spawn; s.fight = 0; s.onLedge = false; s.cliffing = false; s.ledge = undefined; s.buttLeft = 0; s.fightWho = null; }
  if (s.fight > 0) s.fight -= dt;
  if (w.st === MST.RECOVER && M === MOVES.ibex_butt && s.buttLeft > 0 && w.t >= w.rd - 1e-6) {      // 連頂：收招一結束、人還貼著就馬上再頂（follow＝預備快 20%）
    const tg = X.tgt; if (tg && dist(w, tg) <= 3.3) { s.buttLeft--; C.startMove(w, MOVES.ibex_butt, tg, true); return true; } s.buttLeft = 0; }
  if (w.st === MST.RECOVER && M === MOVES.ibex_flee && s.onLedge) return ledgeTick(w, X, s);
  if (w.st === MST.FLEE) return fleeIbex(w, X, s);
  if (w.st === MST.CHASE) return chaseIbex(w, X, s);
  if (w.st !== MST.RECOVER || M !== MOVES.ibex_flee) s.cliffing = false;
  return false;
}
function startFight(w, s, id) { s.fight = T.ibex.fightT; s.fightWho = id; s.onLedge = false; s.cliffing = false; s.buttLeft = 0; w.target = id; w.provoked = true; w.st = MST.CHASE; w.t = 0; w.cd = Math.min(w.cd, 0.3); w.fleeFrom = null; }
function fleeIbex(w, X, s) {
  const dt = X.dt, D = MON.ibex;
  if (w.elite) { const n0 = nearestOf(X, w); if (n0.p && n0.d < 30) { startFight(w, s, n0.id); X.tgt = n0.p; return chaseIbex(w, X, s); } }      /* X4：菁英岩羊（斷崖角）不逃，回頭打 */
  if (s.fight > 0 && s.fightWho != null && C.playerOf(s.fightWho)) { w.target = s.fightWho; w.provoked = true; w.st = MST.CHASE; w.t = 0; s.cliffing = false; X.tgt = C.playerOf(s.fightWho); return chaseIbex(w, X, s); }      /* 反擊中被打（遊戲讓膽小的逃）：不逃，回頭打。X4：X.tgt 是主控端照逃跑時的 target（null）算的，要補上，不然 chaseIbex 一看沒目標又轉回逃跑（岩羊一直逃的原因之一） */
  const n = nearestOf(X, w), from = n.p; if (!s.ledge && n.p && n.d < T.ibex.fleeNear) { s.fleeRun = (s.fleeRun || 0) + dt; if (s.fleeRun >= T.ibex.fleeMax) { s.fleeRun = 0; startFight(w, s, n.id); X.tgt = n.p; return chaseIbex(w, X, s); } }      /* X4：逃跑上限（機器人追不到）：附近沒有崖可上、人一直追在 16 公尺內，逃 5 秒就回頭打（有崖的照舊逃上崖，崖上待太久另外算） */
  let fp = null; if (w.fleeFrom != null) fp = C.playerOf(w.fleeFrom); const src = fp && (!from || dist(w, fp) < n.d + 6) ? fp : from;
  if (!src || (n.d > 26 && w.t > 1) || w.t > 12) { s.cliffing = false; w.st = MST.IDLE; w.t = 0; w.fleeFrom = null; w.wanderT = 3 + Math.random() * 3; w.wx = w.x; w.wz = w.z; return true; }
  const fd = dist(w, src);
  if (w.t <= dt * 1.5 || s.ledge === undefined) { const l = hypotUnit(w.x - src.x, w.z - src.z); s.ledge = findLedge(worldEnv, w, l, {}); s.stuckT = 0; s.mx = w.x; s.mz = w.z; s.mt = 0; }
  const L = s.ledge;
  // 被逼到：貼著人又跑不動（地形擋住）
  s.mt += dt; if (s.mt >= 0.6) { const moved = hyp(w.x - s.mx, w.z - s.mz); s.stuck = moved < D.speed * 0.6 * 0.3; s.mx = w.x; s.mz = w.z; s.mt = 0; }
  if (s.stuck && fd < T.ibex.cornerD) { s.stuck = false; startFight(w, s, n.id); return chaseIbex(w, X, s); }
  if (L) {
    const dl = hyp(L.x - w.x, L.z - w.z);
    if (dl < 2.0) { s.onLedge = true; s.ledgeT = 0; s.cliffing = false; w.fleeFrom = null; w.target = null; setAct(w, MOVES.ibex_flee, MST.RECOVER, 3600); return true; }
    s.cliffing = true; walk(w, X, L.x, L.z, D.speed * 1.12); return true;
  }
  s.cliffing = false;      // 沒有崖可上：一般逃跑
  let a = Math.atan2(w.x - src.x, w.z - src.z);
  for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) { const ax = w.x + sin(a + off) * 2.4, az = w.z + cos(a + off) * 2.4; if (!monBlocked(w.x, w.z, ax, az) && hyp(ax, az) > 48) { a += off; break; } }
  const sp = D.speed * (w.t < 2.5 ? 1 : 0.84); X.nx += sin(a) * sp * dt; X.nz += cos(a) * sp * dt; w.f = dampAng(w.f, a, 12, dt); return true;
}
const hypotUnit = (x, z) => { const l = hyp(x, z) || 1; return { x: x / l, z: z / l }; };
function ledgeTick(w, X, s) {
  X.nx = w.x; X.nz = w.z; const n = nearestOf(X, w); if (n.p) face(w, n.p.x, n.p.z, 3, X.dt);
  if (n.p && n.d < 6.5) { startFight(w, s, n.id); return true; }      /* 人從別的路上來了：被逼到才反擊 */
  s.ledgeT = (s.ledgeT || 0) + X.dt; if (n.p && n.d < 24 && s.ledgeT > T.ibex.ledgeMax) { s.ledgeT = 0; s.onLedge = false; startFight(w, s, n.id); return true; }      /* X4：在崖上待太久、人還在下面等：下來打 */
  if (!n.p || n.d > 24) { s.calmL = (s.calmL || 0) + X.dt; if (s.calmL > 3) { s.calmL = 0; s.onLedge = false; s.ledge = undefined; w.st = MST.IDLE; w.t = 0; w.wanderT = 2; w.wx = w.x; w.wz = w.z; } } else s.calmL = 0;
  return true;
}
function chaseIbex(w, X, s) {
  const dt = X.dt, tgt = X.tgt, D = MON.ibex; if (!tgt) { s.fight = 0; w.st = MST.FLEE; w.t = 0; w.fleeFrom = s.fightWho; w.target = null; return true; }
  const dx = tgt.x - w.x, dz = tgt.z - w.z, d = hyp(dx, dz) || 0.01, rel = Math.abs(angDiff(w.f, Math.atan2(dx, dz))), ok = id => !(w.mcd[id] > 0), above = Hgt(w.x, w.z) - Hgt(tgt.x, tgt.z);
  if (w.elite) s.fight = Math.max(s.fight || 0, 1);      /* X4：菁英一直打 */
  if (!(s.fight > 0)) { if (d > 5) { w.fleeFrom = s.fightWho != null ? s.fightWho : w.target; w.target = null; w.provoked = false; w.st = MST.FLEE; w.t = 0; return true; } s.fight = 1; }
  if (w.cd <= 0) {
    if (d <= 2.7) { s.buttLeft = 1 + (Math.random() < 0.5 ? 1 : 0); C.startMove(w, MOVES.ibex_butt, tgt); return true; }
    if (d >= MOVES.ibex_ram.min && d <= MOVES.ibex_ram.max && ok('ibex_ram') && rel < 0.6 && above >= -0.4) { C.startMove(w, MOVES.ibex_ram, tgt); return true; }
  }
  if (ok('ibex_ram') && d < 5 && above >= -0.4) walk(w, X, w.x - dx / d * 3, w.z - dz / d * 3, D.speed * 0.8);      // 想衝：先退開拉出助跑
  else if (d > 2.4) walk(w, X, tgt.x, tgt.z, D.speed * (d > 8 ? 1.2 : 0.95)); else face(w, tgt.x, tgt.z, 5, dt);
  return true;
}
/* ---------- 獄卒犬：拴住（leash:{x,z,r}） ---------- */
export const leashed = w => !!w && !!w.leash;
function hostLeash(w, X, s) {
  const L = w.leash, dt = X.dt, M = w.M;
  if (w.st === MST.WIND && M === MOVES.dog_howl && s.bark) { if (w.t >= w.wd) { s.bark = false; w.st = MST.CHASE; w.t = 0; w.cd = 1.0; } return true; }      // 吠叫只做預備（吼的動作與聲音），不出招、不標人
  if (w.st !== MST.CHASE) return false;
  const tgt = X.tgt; if (!tgt) return false;
  const dTa = hyp(tgt.x - L.x, tgt.z - L.z), dT = dist(w, tgt);
  if (dTa > L.r + T.leash.reach) {      // 鍊子搆不到：停在鍊子盡頭吠，不追
    const a = Math.atan2(tgt.x - L.x, tgt.z - L.z), gx = L.x + sin(a) * Math.max(0, L.r - 0.35), gz = L.z + cos(a) * Math.max(0, L.r - 0.35), d = walk(w, X, gx, gz, MON.dog.speed * 0.9);
    if (d < 0.7) { face(w, tgt.x, tgt.z, 6, dt); s.barkT = (s.barkT === undefined ? 0.4 : s.barkT) - dt; if (s.barkT <= 0 && w.cd <= 0) { s.barkT = 2.0 + Math.random() * 1.5; s.bark = true; C.startMove(w, MOVES.dog_howl, tgt); } }
    return true;
  }
  if (w.cd <= 0) { if (dT < 2.3) { C.startMove(w, MOVES.dog_chain, tgt); return true; } if (dT <= 3.6) { C.startMove(w, MOVES.dog_bite, tgt); return true; } }
  if (dT > 2.0) walk(w, X, tgt.x, tgt.z, MON.dog.speed); else face(w, tgt.x, tgt.z, 8, dt);
  return true;
}
// 移動完、collide 之後（game.js）：拴住的狗不能超出圈
export function post(w) { if (!ready || !w.leash) return; const p = leashClamp(w.leash, w.x, w.z); if (p.clamped) { w.x = p.x; w.z = p.z; } }

/* ============================== 預警形狀（moveShape 遇到 sh8 的招式問這裡） ============================== */
export function shape(v, M) {
  if (M.nj) return null;
  if (M === MOVES.ape_rock) { const wind = v.st === MST.WIND, A = v.act || M, x = wind ? v.x : v.ox, z = wind ? v.z : v.oz, f = wind ? v.f : v.of, d = decArg(v.arg).d5 / 5, sz = v.elite ? 1.25 : 1, p = clamp((wind ? v.stT : A.wind + v.stT) / (A.wind + M.at), 0, 1); return { shape: 'circle', x: x + sin(f) * d, z: z + cos(f) * d, f, r: M.r * sz, p }; }
  return null;
}
// 受害者端：這一招的傷害加成（hurtMe 那行乘；arg 只有野獸在出招／收招時才有效，判定剛好都在那段時間）
export function dmgK(v) { if (!v || v.type !== 'ape' || !v.M || !v.M.id || !v.M.id.startsWith('ape_')) return 1; return LV_K[decArg(v.arg).lvl] || 1; }

/* ============================== 受害者自己算的效果：被抓、被丟、被推開 ============================== */
let grab = null, slide = null; const hitRes = res => res === 'hit' || res === 'broken';
const myEnv = () => ({ get: () => ({ x: C.me.x, z: C.me.z }), set: (x, z) => { C.me.x = x; C.me.z = z; }, blocked: (x, z) => blockedAt(x, z) || waterDepth(x, z) > WATER.neck, collide: o => collide(o, 0.5) });
export function onHurt(v, M, res) {
  const me = C.me; if (!me.alive) return;
  if (M.seize && hitRes(res)) {
    if (grab || slide || BA7m.struggle()) return;      // 已經被抓、被丟、被別的野獸纏著
    grab = { id: v.id, sp: v.spawn, aid: v.aid % 1000, t: 0, t2: 0, lifted: false, slot: 0 }; C.netSet('g8', [v.id, v.aid % 1000, 0], true); me.stun = Math.max(me.stun, 0.3);
    popNumber(me.x, Hgt(me.x, me.z) + 3.4, me.z, '被抓住了！', 'hurt'); C.ui.tip('b8grab', '猩猩的手往前伸＝要抓人：閃避或舉盾可以躲開。被抓起來的人什麼都做不了，隊友打牠一下（約 5% 血）牠就會放手，不然一秒多後會被丟出去。');
  }
  if (M.shove && (hitRes(res) || res === 'blocked') && !grab) {
    const dir = shoveDir(Hgt, me.x, me.z, v.x, v.z), k = hitRes(res) ? T.ibex.knock : T.ibex.knockBlocked;
    slide = { dx: dir.dx, dz: dir.dz, dist: k, dur: T.ibex.knockT, t: 0, done: 0, stop: false, kind: 'shove', arc: 0 }; me.stun = Math.max(me.stun, T.ibex.knockT * (1 - H8.capped('immob')) + 0.1);
    popNumber(me.x, Hgt(me.x, me.z) + 3.4, me.z, dir.down ? '被撞下坡' : '被撞開', 'hurt'); C.ui.tip('b8ram', '岩羊從高處衝下來會把人往坡下撞開約 5 公尺（不會摔死，只是被迫繞路）。看地上的直線，在牠衝到眼前時閃開。');
  }
}
function freeGrab(txt) { const me = C.me; grab = null; C.netSet('g8', null, true); me.stun = 0; me.iframe = Math.max(me.iframe, 0.6); if (txt) popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, txt, 'perfect'); }
function chosenSlot(id) {      /* 主控端選了我嗎：回傳槽位（0 右手、1 左手），沒選 −1（X4） */
  if (C.Net.isHost) { const w = C.sim[id], s = w && ST.get(w), h = s && s.holds ? s.holds.find(o => o.who === 'self') : null; return h ? h.slot | 0 : -1; }
  for (const r of C.remotes.values()) { const p = r.lastPres; if (p && typeof p.ms === 'string') { const l = p.l8, e = Array.isArray(l) ? l.find(e => Array.isArray(e) && (e[0] | 0) === id && e[1] === (C.Net.selfPeer || 'local')) : null; return e ? (e[2] | 0) : -1; } } return -1;
}
const chosen = id => chosenSlot(id) >= 0;
function grabTick(dt) {
  const me = C.me; grab.t += dt; const v = monOf(grab.id), okv = me.alive && v && v.spawn === grab.sp && v.st !== MST.DEAD;
  if (!okv) { freeGrab(me.alive ? '脫身' : null); return; }
  const isLift = v.M === MOVES.ape_lift;
  if (!grab.lifted) {
    if (isLift && v.st === MST.STRIKE && chosen(grab.id)) { grab.lifted = true; grab.t2 = 0; }
    else if ((isLift && v.st === MST.STRIKE && grab.t > (v.elite ? 1.4 : 0.9)) || grab.t > 1.9 || (grab.t > 0.6 && !isLift && !(v.M && v.M.seize))) { freeGrab('脫身'); return; }      /* X4：白背雙抓的第二個人比較晚被收（網路延遲），多等一下 */
  }
  me.stun = Math.max(me.stun, 0.12); me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.guard = false; me.atk = null; me.charge = null; me.cast = null;
  if (!grab.lifted) return;
  grab.t2 += dt;
  if (isLift && v.st === MST.STRIKE) {      /* X4：雙抓的左右手（槽位）；主控端把我放掉了（隊友救下我）就落地 */
    const sl = chosenSlot(grab.id); if (sl < 0) { grab.nc = (grab.nc || 0) + dt; if (grab.nc > 0.35) { freeGrab(); popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, '被放開了', 'perfect'); return; } } else { grab.nc = 0; grab.slot = sl; }
    const fw = T.ape.holdFwd * (v.size / 1.3), sd = v.elite ? (grab.slot ? -1 : 1) * 0.95 * (v.size / 1.3) : 0; me.x = v.x + sin(v.f) * fw + cos(v.f) * sd; me.z = v.z + cos(v.f) * fw - sin(v.f) * sd; }
  else if (isLift && v.st === MST.RECOVER) {
    const thrown = decArg(v.arg).d5 === 1, lvl = decArg(v.arg).lvl, f = v.f; freeGrab(); me.iframe = 0;
    if (thrown) slide = { dx: sin(f), dz: cos(f), dist: T.ape.throwD, dur: T.ape.throwT, t: 0, done: 0, stop: false, kind: 'throw', arc: 2.2, v, lvl };
    else { popNumber(me.x, Hgt(me.x, me.z) + 3.2, me.z, '被放開了', 'perfect'); me.iframe = 0.6; }
  } else freeGrab('脫身');
}
function slideTick(dt) {
  const me = C.me; if (!me.alive) { slide = null; return; } me.stun = Math.max(me.stun, 0.12); me.vx = me.vz = me.kx = me.kz = 0; me.dodge = null; me.atk = null; me.charge = null;
  const fin = stepSlide(slide, dt, myEnv()), k = clamp(slide.t / slide.dur, 0, 1);
  if (me.avatar && slide.arc) { me.avatar.group.position.y += slide.arc * sin(PI * k); me.avatar.group.rotation.x = -0.9 * sin(PI * Math.min(1, k * 1.1)); }
  if (!fin) return;
  const sl = slide; slide = null; if (me.avatar) me.avatar.group.rotation.x = 0;
  if (sl.kind === 'throw') {      // 落地：一次重擊＋倒地
    const v = sl.v, M = MOVES.ape_lift; me.stun = 0; if (me.iframe > 0 && me.iframe < 0.7) me.iframe = 0;
    const res = C.hurtMe(v.dmg * M.dmg * (C.eliteK ? C.eliteK(v) : 1) * (LV_K[sl.lvl] || 1), v.x, v.z, { heavy: 1, mon: v }); me.stun = Math.max(me.stun, 0.9 * (1 - H8.capped('immob')));
    popNumber(me.x, Hgt(me.x, me.z) + 3.6, me.z, '被摔了', 'hurt'); emit(me.x, Hgt(me.x, me.z) + 0.3, me.z, 24, [0.7, 0.58, 0.4], 5, 3, 0.6, 5); fx.shake = Math.max(fx.shake, 0.45); return res;
  }
}
export function struggle() { if (!grab) return null; return { kind: 'latch', grab: true, n: 0, need: 0, by: grab.id, t: grab.lifted ? grab.t2 : 0, tmax: T.ape.liftT, drag: null }; }
export function dragged() {      // 看得到隊友被舉起的倒數圈（介面的「快救！」）；自己的走 struggle()
  const out = []; for (const [peer, r] of C.remotes) { const p = r.lastPres; if (!p || !Array.isArray(p.g8)) continue; const v = monOf(p.g8[0] | 0); if (!v || v.M !== MOVES.ape_lift || v.st !== MST.STRIKE) continue; out.push({ who: peer, t: Math.max(0, T.ape.liftT - v.stT), dur: T.ape.liftT }); } return out;
}
export const targetedBy = () => [], cast = v => null;
if (BA7m.EXT) BA7m.EXT.push({ struggle, dragged, targetedBy, cast });      /* 介面（ui08）只讀 beastai07 的 struggle／dragged／targetedBy／cast；beastai07 的補丁開一個 EXT 讓後面的野獸檔掛進來 */

/* ============================== 模型、掛接 ============================== */
export function make(type, size, elite, v) {
  if (type === 'dog' && elite && v && v.drop === 'trophy_warden' && B07w.makeBeast07) { const m = B07w.makeBeast07('dog', size, 'warden'); m.elite = true; return m; }      /* X4：獄卒長 */
  if (type !== 'ape' && type !== 'ibex') return null; const young = !!(v && v.young);
  const m = B08.makeBeast08(type, young ? size / T.young.size : size, { elite: !!elite, young }); m.elite = !!elite; return m;
}
// initGame 建好每一隻之後呼叫：小猩猩（血量、傷害、體型、招式）與拴住的狗
export function attach(w, v, sp) {
  if (!sp) return;
  if (sp.young && w.type === 'ape') { const Y = T.young; w.young = v.young = 1; const hp = Math.round(v.hpMax * Y.hp); v.hpMax = v.baseHp = w.hpMax = w.baseHp = hp; v.dmg = Math.round(v.dmg * Y.dmg); v.exp = Math.round(v.exp * Y.exp); v.size *= Y.size; v.name = '小猩猩'; w.moves = [MOVES.ape_swat]; }
  if (sp.leash && w.type === 'dog') { w.leash = v.leash = { x: sp.leash.x, z: sp.leash.z, r: sp.leash.r }; }
}

/* ============================== 每一幀（tick 最後） ============================== */
const seen8 = new WeakMap(); const rocks = []; let rockGeo = null, rockMat = null, flyRock = null;
const LIFTY = new WeakMap();
function rockMesh() {
  if (!rockGeo) { rockGeo = new THREE.IcosahedronGeometry(1.2, 1); rockMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.95, flatShading: true }); }
  const m = new THREE.Mesh(rockGeo, rockMat); m.scale.set(1, 0.85, 1); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; if (W && W.scene) W.scene.add(m); return m;
}
// 石頭落地：每個人各自在落點放一塊（位置由招式決定）；留 6 秒當障礙（碰撞圈），最後 0.8 秒沉下去
export function rock(v, s, M) {
  if (!M || !M.rock || !C) return; const R = { x: s.x, z: s.z, t: 0, life: T.ape.rockLife, mesh: typeof document !== 'undefined' ? rockMesh() : null, col: WM.addCollider ? WM.addCollider(s.x, s.z, T.ape.rockR, 2.4) : null, y0: Hgt(s.x, s.z), gone: false };
  rocks.push(R); if (R.mesh) R.mesh.position.set(R.x, R.y0 + 0.7, R.z); if (rocks.length > 12) dropRock(rocks[0]);
  if (hyp(s.x - C.me.x, s.z - C.me.z) < 40) { emit(s.x, R.y0 + 0.6, s.z, 26, [0.7, 0.62, 0.5], 5, 3, 0.6, 5); fx.shake = Math.max(fx.shake, 0.3); }
}
function dropRock(R) { const i = rocks.indexOf(R); if (i >= 0) rocks.splice(i, 1); R.gone = true; if (R.col) { if (WM.removeCollider) WM.removeCollider(R.col); else { R.col.r = 0; R.col.x = R.col.z = 1e7; } R.col = null; } if (R.mesh) { if (R.mesh.parent) R.mesh.parent.remove(R.mesh); R.mesh = null; } }
export const rocksNow = () => rocks.map(R => ({ x: R.x, z: R.z, t: R.t, solid: !!R.col }));
export function frame(dt) {
  if (!C) return; frameN++; now = C.clock(); const me = C.me, Net = C.Net;
  if (Net.isHost) { const str = tests.map(g => g.join(',')).join(';'); C.netSet('t8b', str || null); publishLifts(); }
  else { let hp = null; for (const r of C.remotes.values()) if (r.lastPres && typeof r.lastPres.ms === 'string') { hp = r.lastPres; break; } if (hp && typeof hp.t8b === 'string' && hp.t8b !== lastT8) { lastT8 = hp.t8b; mirror(hp.t8b); } }
  if (grab) grabTick(dt); if (slide) slideTick(dt);
  if (grab && grab.lifted && me.avatar) { const k = clamp(grab.t2 / 0.35, 0, 1); me.avatar.group.position.y += T.ape.liftY * k; me.avatar.group.rotation.x = -0.25 * k; }
  // 隊友被舉起的畫面：看到對方 presence 有 g8、而且那隻猿正在舉（STRIKE ape_lift）→ 把他的人物抬到猿手上
  for (const r of C.remotes.values()) { const p = r.lastPres, g = p && Array.isArray(p.g8) ? p.g8 : null; if (!r.avatar) continue; const v = g ? monOf(g[0] | 0) : null; const lifted = !!(v && v.M === MOVES.ape_lift && v.st === MST.STRIKE);
    if (lifted) { const k = clamp(v.stT / 0.35, 0, 1); r.avatar.group.position.y += T.ape.liftY * k; r.avatar.group.rotation.x = -0.25 * k; LIFTY.set(r, 1); } else if (LIFTY.get(r)) { LIFTY.delete(r); r.avatar.group.rotation.x = 0; } }
  for (const R of rocks.slice()) { R.t += dt; const k = R.t / R.life; if (k >= 1) { dropRock(R); continue; } if (R.t > R.life - 0.8 && R.col) { if (WM.removeCollider) WM.removeCollider(R.col); else { R.col.r = 0; R.col.x = R.col.z = 1e7; } R.col = null; }
    if (R.mesh) { const drop = R.t < 0.15 ? (1 - R.t / 0.15) * 3 : 0, sink = R.t > R.life - 0.8 ? (R.t - (R.life - 0.8)) / 0.8 : 0; R.mesh.position.set(R.x, R.y0 + 0.7 + drop - sink * 1.6, R.z); } }
  let fly = null;
  for (const v of monsAll()) {
    if (!(v.type === 'ape' || v.type === 'ibex') || !v.model) continue;
    const st = seen8.get(v) || (seen8.set(v, st0()), seen8.get(v)); if (st.st !== v.st || st.M !== v.M || (v.st === MST.WIND && st.aid !== v.aid)) { const pst = st.st, pM = st.M; st.st = v.st; st.M = v.M; st.aid = v.aid; onState(v, pst, pM); }
    if (v.type === 'ape') { const l = v.M && v.M.id && v.M.id.startsWith('ape_') && (v.st === MST.WIND || v.st === MST.STRIKE || v.st === MST.RECOVER) ? decArg(v.arg).lvl : 0; if (l === 2 && !st.rage) { st.rage = true; onRage(v); } else if (l !== 2 && st.rage && v.st !== MST.WIND && v.st !== MST.STRIKE && v.st !== MST.RECOVER) st.rage = false;
      if (v.M === MOVES.ape_rock && ((v.st === MST.WIND && v.stT > (v.act ? v.act.wind : 1) * 0.55) || v.st === MST.STRIKE)) fly = v; }
    if (v.type === 'ibex') v.pose = v.M === MOVES.ibex_flee && v.st === MST.RECOVER ? 'cliff' : v.pose === 'cliff' ? null : v.pose;
  }
  rockFly(fly);
}
const st0 = () => ({ st: -1, M: null, aid: -1, rage: false });
const monsAll = () => (C.x8 && C.x8.mons.length ? C.mons.concat(C.x8.mons) : C.mons);
function rockFly(v) {
  if (typeof document === 'undefined') return; if (!v) { if (flyRock) flyRock.visible = false; return; } if (!flyRock) { flyRock = rockMesh(); flyRock.scale.set(0.85, 0.7, 0.85); } flyRock.visible = true;
  const A = v.act || MOVES.ape_rock, sz = v.size / 1.3;
  if (v.st === MST.WIND) { const e = clamp((v.stT / A.wind - 0.55) / 0.45, 0, 1); flyRock.position.set(v.x + sin(v.f) * 0.5, Hgt(v.x, v.z) + (0.6 + 3.6 * e) * sz, v.z + cos(v.f) * 0.5); return; }
  const d = decArg(v.arg).d5 / 5, s = clamp(v.stT / Math.max(0.05, A.strike), 0, 1), hx = v.ox + sin(v.of) * 0.6, hz = v.oz + cos(v.of) * 0.6, ex = v.ox + sin(v.of) * d, ez = v.oz + cos(v.of) * d;
  flyRock.position.set(lerp(hx, ex, s), lerp(Hgt(hx, hz) + 3.9 * sz, Hgt(ex, ez) + 0.9, s) + sin(PI * s) * (1.2 + d * 0.16), lerp(hz, ez, s)); flyRock.rotation.x += 0.2; flyRock.rotation.z += 0.15;
}
function onRage(v) {
  if (hyp(v.x - C.me.x, v.z - C.me.z) > 60) return; const y = Hgt(v.x, v.z) + MON.ape.tagH * v.size + 0.6;
  popNumber(v.x, y, v.z, '暴怒！', 'hurt'); fxRing(v.x, v.z, 1.0, 5, 0.6, [3, 0.5, 0.3], 0.9); fx.shake = Math.max(fx.shake, 0.2); C.ui.tip('b8rage', '打小猩猩，猩猩會暴怒 20 秒（傷害 +20%）。要打牠們的話，先處理大的，或者別碰小的。');
}
function onState(v, pst, pM) {
  const near = hyp(v.x - C.me.x, v.z - C.me.z) < 40; if (!near) return; const y = Hgt(v.x, v.z) + MON[v.type].tagH * v.size;
  if (v.type === 'ape') {
    if (v.M === MOVES.ape_beat && v.st === MST.STRIKE) { popNumber(v.x, y + 0.5, v.z, '捶胸！', 'call'); fxRing(v.x, v.z, 0.8, 4.5, 0.5, [2.4, 1.8, 0.8], 0.8); fx.shake = Math.max(fx.shake, 0.25); C.ui.sfx('boom', 1, { x: v.x, z: v.z }); }
    if (v.M && v.M.seize && v.st === MST.WIND) C.ui.tip('b8grabw', '猩猩張開雙手＝要抓人。閃避或舉盾格擋可以躲開；被抓住的話隊友打牠就會放手。');
    if (v.M === MOVES.ape_rock && v.st === MST.WIND) C.ui.tip('b8rockw', '猩猩拔石頭是要丟「站最遠的人」：看地上的圓圈，丟出去之前離開；石頭會留在原地 6 秒，可以擋路也可以躲在後面。');
    if (v.M === MOVES.ape_lift && v.st === MST.STRIKE) popNumber(v.x, y + 0.4, v.z, '舉起來了！', 'hurt');
    if (v.M === MOVES.ape_lift && v.st === MST.RECOVER) popNumber(v.x, y + 0.4, v.z, decArg(v.arg).d5 === 1 ? '丟！' : '放手了', decArg(v.arg).d5 === 1 ? 'hurt' : 'call');
  } else if (v.M === MOVES.ibex_ram && v.st === MST.WIND) C.ui.tip('b8ramw', '岩羊低頭刨地＝要衝了。牠從高處衝下來力道最大；在牠衝到眼前時閃開。');
}

/* ============================== 測試用生成 ============================== */
const tests = []; let lastT8 = '';
const KIND = { ape: { n: 1, ny: 2, lv: 16, d: 16 }, ibex: { n: 4, lv: 16, d: 22 }, leashdog: { n: 1, lv: 18, d: 14, r: 6 } };
function addMon(type, lv, x, z, pack, f, ex = {}) {
  const id = C.sim.length, st = monStats(type, lv, false), D = MON[type], Y = ex.young ? T.young : null, hp = Math.round(st.hp * (Y ? Y.hp : 1)), size = st.size * (Y ? Y.size : 1);
  C.mons.push({ id, type, lv, elite: false, name: Y ? '小猩猩' : D.name, drop: undefined, orb: undefined, hx: x, hz: z, x, z, f, tx: x, tz: z, tf: f, st: MST.IDLE, stT: 0, aid: 0, spawn: 0, hpMax: hp, baseHp: hp, dmg: Math.round(st.dmg * (Y ? Y.dmg : 1)), exp: Math.round(st.exp * (Y ? Y.exp : 1)), size, speed: 0, flash: 0, model: null, tag: null, tele: null, others: 0, credited: -1, idleT: Math.random() * 5, mvc: 0, arg: 0, enr: 0, M: null, act: null, tg: null, judged: -1, ox: x, oz: z, of: 0, lx: x, lz: z, test7: 1, test8b: 1, young: Y ? 1 : undefined, leash: ex.leash });
  const w = { id, type, elite: false, pack, moves: (Y ? ['ape_swat'] : D.moves).map(m => MOVES[m]), hx: x, hz: z, x, z, f, st: MST.IDLE, t: 0, aid: 0, spawn: 0, hpMax: hp, baseHp: hp, target: null, seen: {}, wanderT: Math.random() * 4, wx: x, wz: z, cd: 0, kx: 0, kz: 0, stagDur: 0.2, mvc: 0, arg: 0, enr: 0, M: null, wd: 0, sd: 0, rd: 0, chain: null, mcd: {}, last: '', provoked: false, fleeFrom: null, immune: 0, hits: 0, retreat: 0, sprung: false, near: 1e9, test7: 1, test8b: 1, young: Y ? 1 : undefined, leash: ex.leash };
  C.sim.push(w); if (pack != null) { if (!C.packs.has(pack)) C.packs.set(pack, []); C.packs.get(pack).push(w); } return C.mons[id];
}
function group(kind, lv, x, z, f, n, ny, r) {
  const pack = 8000 + tests.length, out = [];
  if (kind === 'ape') { out.push(addMon('ape', lv, x, z, pack, f)); for (let k = 0; k < ny; k++) { const a = f + PI / 2 + k * 2.6; out.push(addMon('ape', lv, x + sin(a) * 3.4, z + cos(a) * 3.4, pack, f, { young: 1 })); } }
  else if (kind === 'ibex') for (let k = 0; k < n; k++) { const a = k * 2.1; out.push(addMon('ibex', lv, x + sin(a) * 3, z + cos(a) * 3, pack, f)); }
  else if (kind === 'leashdog') for (let k = 0; k < n; k++) { const px = x + k * 9, pz = z; out.push(addMon('dog', lv, px, pz, null, f, { leash: { x: px, z: pz, r } })); }
  return out;
}
function mirror(s) { for (const [i, g] of s.split(';').entries()) { if (i < tests.length) continue; const [kind, lv, x, z, f, n, id0, ny, r] = g.split(','); if (!KIND[kind] || +id0 !== C.sim.length) return; tests.push([kind, +lv, +x, +z, +f, +n, +id0, +ny, +r]); group(kind, +lv, +x, +z, +f, +n, +ny, +r); } }
export function spawnTest(kind = 'ape', o = {}) {
  if (!KIND[kind]) throw new Error('沒有這種：' + kind); if (!C.Net.isHost) { console.warn('只有主控端能生成'); return []; }
  const K = KIND[kind], me = C.me, f0 = o.f ?? me.f, d = o.d ?? K.d, x = o.x ?? me.x + sin(f0) * d, z = o.z ?? me.z + cos(f0) * d, f = Math.atan2(me.x - x, me.z - z), lv = o.lv ?? K.lv, n = o.n ?? K.n, ny = o.ny ?? K.ny ?? 0, r = o.r ?? K.r ?? 0;
  tests.push([kind, lv, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(f * 100) / 100, n, C.sim.length, ny, r]); return group(kind, lv, tests[tests.length - 1][2], tests[tests.length - 1][3], f, n, ny, r);
}
function force(id, moveId, who = 'self') { const w = C.sim[id], p = C.playerOf(who); if (!w || !p || !MOVES[moveId]) return false; w.target = who; w.provoked = true; w.cd = 0; C.startMove(w, MOVES[moveId], p); return true; }
function freeze(id, on = true) { const w = C.sim[id]; if (w) S(w).frz = !!on; }
function clear() { for (const w of C.sim) if (w.test8b) { w.st = MST.DEAD; w.t = -1e6; w.target = null; const v = C.mons[w.id]; v.st = MST.DEAD; v.stT = 99; if (v.model) v.model.root.visible = false; if (v.tag) v.tag.el.style.display = 'none'; } grab = slide = null; for (const R of rocks.slice()) dropRock(R); }
function state() { return { grab: grab && { id: grab.id, t: +grab.t.toFixed(2), lifted: grab.lifted, t2: +grab.t2.toFixed(2) }, slide: slide && { kind: slide.kind, done: +slide.done.toFixed(2), dist: slide.dist, stop: slide.stop }, rocks: rocksNow(), tests: tests.slice(), apes: C.sim.filter(w => w.type === 'ape').map(w => { const s = ST.get(w) || {}; return { id: w.id, st: w.st, M: w.M && w.M.id, arg: w.arg, rage: +(s.rageT || 0).toFixed(1), beat: +(s.beatT || 0).toFixed(1), holds: (s.holds || []).map(h => h.who), why: s.lastWhy || null, young: !!w.young }; }), ibex: C.sim.filter(w => w.type === 'ibex').map(w => { const s = ST.get(w) || {}; return { id: w.id, st: w.st, M: w.M && w.M.id, fight: +(s.fight || 0).toFixed(1), onLedge: !!s.onLedge, ledge: s.ledge || null, cliffing: !!s.cliffing }; }) }; }
/* ============================== 初始化 ============================== */
export function init(ctx) {
  C = ctx; if (typeof window === 'undefined') return;
  if (window.__dev07) {
    const D = window.__dev08 = window.__dev08 || {};
    D.x3b = window.__beast08b = { spawn: spawnTest, force, freeze, clear, state, T, MON08B, MOVES08B, rock, liftsOf, shoveDir, downhill, findLedge: w => findLedge(worldEnv, w, null, {}), dragged, struggle };
  }
}
