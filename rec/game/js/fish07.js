// 0.7 釣魚：拿出釣竿 → 蓄力拋竿 → 等浮標沉 → 拉鋸（張力條）→ 上岸；魚的紀錄、分解、米洛收魚、哈根做釣竿、魚料理與新藥劑的新增益（移速、時機、閃避衝刺耗體力）
// 規則見 design07/0.7 設計定案.md 第 3 節與附錄 B、C；數字全在 data07.js。這個檔案不匯入 game.js／ui.js（避免循環載入），遊戲的工具由 game.js 的 init6 交進來（ctx＋extra）
// 狀態：me.fish＝拿著釣竿時的狀態（沒拿是 null）｜P.fishRec＝{ 魚代號: [尾數, 最長公分] }｜P.fishPity＝三尾主的保底次數｜P.fishOpt＝{ bait: 'auto'|'wheat'|'meat'|'none' }
// 對外的接點（game.js／ui.js／ui06.js 的補丁只做呼叫）：init、reset、save、load、update、interact、click、stow、prompt、mods、cap、pres、remote、service、craftPage、setProps07
// 任務事件（questAct）：doFish、doFish:<魚>、doFishAt:<水邊>、doFishBoss、doGut、doGut:<魚>、doRod:<釣竿>、doSellFish（烤河魚用 craft.js 原本的 doCook:food_fish）
import * as THREE from './three.bundle.js';
import { W, Hgt, waterDepth, deckAt, nowHour } from './world.js';
import { TAU, clamp, lerp, damp, PONDS, LAKE_PAD, lakeDist, waterLevel, expNeed, LV_CAP, E1 as E1h } from './core.js';
import { emit } from './fx.js';
import { USE } from './data06.js';
import { FISHING as K, WATERS07, LAKE_WATER, POND_WATER, FISH, FISH_IDS, GUT, RODS, ROD_IDS, GROUPS, CAPS07 } from './data07.js';

let C = null, X = {}, props7 = null, preloaded = false;
const P = () => C.P, inv = id => C.P.inv[id] || 0, U = (a, b) => a + Math.random() * (b - a), ITEM = id => C.ITEMS[id] || { name: id };
const evLog = []; function qa(c) { C.quest(c); evLog.push(c); if (evLog.length > 40) evLog.shift(); }      // 任務事件（測試看得到最近 40 個）
export function init(ctx, extra) { C = ctx; X = extra || {}; if (typeof window !== 'undefined') window.__fish07 = { debug, records, service, scan, waterAt, rodOf, FISH_SPOTS07, setProps07 }; }      // __fish07：給 QA 與測試腳本
export function setProps07(pr) { props7 = pr && typeof pr.makeProp07 === 'function' ? pr : null; if (props7 && typeof props7.preload07 === 'function' && !preloaded) { preloaded = true; try { props7.preload07(); } catch (e) {} } }      // 背景裡先把魚的模型建好（不然第一次釣到會頓一下）      // 美術的 props07.js 到位後：釣竿、浮標、魚改用正式模型（has07 回 false 的照樣用暫代）
const art = (name, opt) => { try { return props7 && (!props7.has07 || props7.has07(name)) ? props7.makeProp07(name, opt) : null; } catch (e) { return null; } };

/* ============================== 存檔 ============================== */
export function reset() { const p = P(); p.fishRec = {}; p.fishPity = [0, 0, 0]; p.fishOpt = { bait: 'auto' }; if (C.me.fish) stow(); gut = null; }
// h6 裡的 fr：[[魚編號, 尾數, 最長（0.1 公分）], …]｜fp：三尾主的保底次數｜fo：餌的設定（0 自動、1 麥穗、2 獸肉、3 不用）。沒有釣過魚的存檔不多任何欄位
const BAIT_OPT = ['auto', 'wheat', 'meat', 'none'], BOSS_IDS = FISH_IDS.filter(id => FISH[id].boss);
export function save() {
  const p = P(), o = {}, fr = []; FISH_IDS.forEach((id, i) => { const r = p.fishRec[id]; if (r && r[0] > 0) fr.push([i, r[0], Math.round(r[1] * 10)]); });
  if (fr.length) o.fr = fr; if (p.fishPity.some(n => n > 0)) o.fp = p.fishPity.slice(); const b = BAIT_OPT.indexOf(p.fishOpt.bait); if (b > 0) o.fo = b; return o;
}
export function load(h) {
  reset(); if (!h || typeof h !== 'object') return; const p = P(), n = (v, hi) => (typeof v === 'number' && isFinite(v) ? clamp(Math.floor(v), 0, hi) : 0);
  if (Array.isArray(h.fr)) for (const a of h.fr) { if (!Array.isArray(a)) continue; const id = FISH_IDS[n(a[0], FISH_IDS.length - 1)], c = n(a[1], 999999); if (id && c > 0 && a[0] < FISH_IDS.length) p.fishRec[id] = [c, n(a[2], 99999) / 10]; }
  if (Array.isArray(h.fp)) p.fishPity = [0, 1, 2].map(i => n(h.fp[i], 5));
  p.fishOpt.bait = BAIT_OPT[n(h.fo, 3)] || 'auto';
}

/* ============================== 水邊 ============================== */
// 這一點是哪一處水邊（places06.js 的 WATERS 代號）；不在水裡回傳 null
export function waterAt(x, z) {
  for (let i = 0; i < POND_WATER.length && i < PONDS.length; i++) { const p = PONDS[i]; if (Math.hypot(x - p[0], z - p[1]) < p[2] + LAKE_PAD) return POND_WATER[i]; }
  let best = LAKE_PAD + 0.5, id = null; for (const k in LAKE_WATER) { const d = lakeDist(x, z, k); if (d < best) { best = d; id = LAKE_WATER[k]; } } return id;
}
const deep = (x, z) => waterDepth(x, z) >= K.deep;
// 站在 (x,z)：reach 公尺內有夠深的水嗎？回傳 { f 面向水面的方向, water, d 離水多近 } 或 null
export function scan(x, z, reach = K.reach) {
  let best = null; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, sx = Math.sin(a), cz = Math.cos(a); for (let r = 0.6; r <= reach + 1e-6; r += 0.8) { if (deep(x + sx * r, z + cz * r)) { if (!best || r < best.d) best = { a, d: r, x: x + sx * r, z: z + cz * r }; break; } } }
  if (!best) return null; let vx = 0, vz = 0;
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, sx = Math.sin(a), cz = Math.cos(a); let n = 0; for (const r of [4, 7, 10, 13]) if (deep(x + sx * r, z + cz * r)) n++; vx += sx * n * n; vz += cz * n * n; }
  return { f: vx || vz ? Math.atan2(vx, vz) : best.a, water: waterAt(best.x, best.z), d: best.d };
}
const onJetty = () => { const d = deckAt(C.me.x, C.me.z); return !!(d && d.id === 'jetty'); };
const isNight = () => { const h = nowHour(); return h < 5.6 || h >= 19.4; };
export const rodOf = () => { for (let i = ROD_IDS.length - 1; i >= 0; i--) if (inv(ROD_IDS[i]) > 0) return ROD_IDS[i]; return ''; };
const E1 = () => Math.max(1, Math.round(E1h(P().lv)));      // 同級打獵一分鐘的經驗（數值定案07 的 E1 表，core.js；1 級＝10，第一尾給 E1×2＝19，不會再一尾就升級）

/* ============================== 餌與魚 ============================== */
// 這處水邊現在會咬鉤的魚 [[代號, 權重], …]（夜裡的魚只在夜裡；少見魚乘幸運）
function pool(water) { const Wt = WATERS07[water]; if (!Wt) return []; const n = isNight(), luck = C.D().luck || 1; return Wt.fish.filter(f => !f[2] || n).map(([id, w]) => [id, w * (FISH[id].rare ? luck : 1)]); }
// 這一竿用的餌：自動＝這處水邊權重最大的魚對的餌（有主的條件時優先主的餌），身上沒有就用另一種；設定成某一種、身上沒有就不用
export function baitFor(water) {
  const o = P().fishOpt.bait; if (o === 'none') return ''; if (o !== 'auto') return inv(o) > 0 ? o : '';
  const Wt = WATERS07[water] || {}, b = Wt.boss, want = []; if (b && bossTime(b)) want.push(b.bait);
  const pl = pool(water).sort((a, c) => c[1] - a[1]); for (const [id] of pl) if (FISH[id].bait) want.push(FISH[id].bait); want.push('wheat', 'meat');
  for (const id of want) if (inv(id) > 0) return id; return '';
}
const bossTime = b => (b.night ? isNight() : b.hours ? (h => h >= b.hours[0] && h < b.hours[1])(nowHour()) : true);
// 咬鉤的是哪一尾。回傳 { id, mult（對的餌讓等待縮短的倍率） }
function pickFish(water, bait) {
  const pl = pool(water); if (!pl.length) return null; const m = id => (bait && FISH[id].bait === bait ? 1 / K.baitK : 1);
  let w0 = 0, wb = 0; for (const [id, w] of pl) { w0 += w; wb += w * m(id); } let r = Math.random() * wb, id = pl[0][0]; for (const [i, w] of pl) { r -= w * m(i); if (r <= 0) { id = i; break; } }
  return { id, mult: wb / w0 };
}
// 主：條件全對時每次咬鉤 1/6，沒中下次再加 1/6（保底存檔）。帶滿 9 尾就不出
function tryBoss(water, bait) {
  const b = (WATERS07[water] || {}).boss; if (!b || bait !== b.bait || !bossTime(b) || C.room(b.id) < 1) return '';
  const i = BOSS_IDS.indexOf(b.id), p = P(); if (Math.random() < (p.fishPity[i] + 1) * K.bossP) { p.fishPity[i] = 0; C.save(); return b.id; } p.fishPity[i] = Math.min(5, p.fishPity[i] + 1); C.save(); return '';
}

/* ============================== 拿出、收起 ============================== */
// 狀態 st：idle 拿著釣竿｜charge 蓄力｜fly 浮標飛出去｜wait 等咬鉤｜bite 咬鉤（要按左鍵）｜reel 拉鋸｜land 舉魚｜back 收線
function takeOut(sc) {
  const me = C.me, rod = rodOf(); me.fish = { st: 'idle', t: 0, rod, R: RODS[rod], water: sc.water, hp: me.hp, bx: me.x, bz: me.z, by: 0, k: 0, msg: '', msgT: 0 };
  me.f = me.fish.f0 = sc.f; me.vx = me.vz = 0; if (C.input.cam.mode !== 'top') C.input.cam.yaw = sc.f + K.camOff;      // 背後視角：鏡頭轉向水面，人稍微側向右邊（右手的竿子才不會被頭擋住；角度越大越往左） me.atk = null; me.charge = null; me.queued = false; me.guard = false; me.gather = null;
  C.ui.sfx('equip'); C.ui.tip('fish7', '釣魚：按住左鍵蓄力，放開拋竿。浮標沉下去時點左鍵；拉鋸時按住收線、放開放線，張力條別進紅區太久，也別鬆到底。互動鍵換餌，移動或 Esc 收起釣竿。');
  return true;
}
// 收起釣竿（拉鋸中收起＝那一尾跑掉）
export function stow(why) {
  const me = C.me, s = me.fish; if (!s) return; if (s.st === 'reel' && why) C.ui.toast('魚跑掉了'); else if (why) C.ui.toast(why);
  me.fish = null; hud(null);
}
// Esc 收起釣竿：這個監聽在模組載入時就掛上，比 ui.js 的（開設定）先執行；拿著釣竿時吃掉這一下。背後視角鎖著滑鼠時，瀏覽器會先拿 Esc 解除鎖定（照舊開設定，釣竿留著）
if (typeof window !== 'undefined') window.addEventListener('keydown', e => { if (e.code !== 'Escape' || !C || !C.me.fish || C.input.talk || C.input.typing || e.repeat) return; stow(); e.stopImmediatePropagation(); e.preventDefault(); }, true);
function say(msg, t = 2.2) { const s = C.me.fish; if (s) { s.msg = msg; s.msgT = t; } }

/* ============================== 輸入 ============================== */
// 互動鍵。top＝interact() 一開頭的呼叫（只處理拿著釣竿時）；否則是採集之前的呼叫（水邊、沒有別的事可做時拿出釣竿）
export function interact(top) {
  const me = C.me, s = me.fish;
  if (s) {
    if (s.st === 'idle' || s.st === 'charge') { cycleBait(); return true; }
    if (s.st === 'wait' || s.st === 'bite' || s.st === 'fly') { s.st = 'back'; s.t = 0; say('收線了'); C.ui.sfx('click', 0, { tag: 'reel' }); return true; }
    if (s.st === 'reel') { say('收線用左鍵：按住收、放開放'); return true; } return true;
  }
  if (top || !me.alive || me.swim) return false;
  if (X.Gather && X.Gather.hint && X.Gather.hint()) return false;      // 身邊有能採的東西：先採
  const sc = scan(me.x, me.z); if (!sc || !sc.water) return false;
  if (me.combat) { C.ui.toast('戰鬥中沒辦法釣魚'); return true; }
  const W7 = WATERS07[sc.water]; if (W7 && W7.none) { C.ui.toast(W7.none); return true; }
  if (!rodOf()) { C.ui.toast('沒有釣竿。獵人營地的哈根年輕時常釣魚（4 級以後去問他）。'); return true; }
  return takeOut(sc);
}
function cycleBait() { const p = P(), i = BAIT_OPT.indexOf(p.fishOpt.bait); p.fishOpt.bait = BAIT_OPT[(i + 1) % BAIT_OPT.length]; C.save(); const s = C.me.fish, b = baitFor(s ? s.water : ''); say('餌：' + baitText(b), 1.6); C.ui.sfx('click'); }
const baitText = b => (P().fishOpt.bait === 'auto' ? '自動（' + (b ? ITEM(b).name : '身上沒有麥穗或獸肉') + '）' : P().fishOpt.bait === 'none' ? '不用餌' : ITEM(P().fishOpt.bait).name + (inv(P().fishOpt.bait) ? '' : '（身上沒有）'));
// 左鍵按下（tryAttack 開頭的呼叫）：拿著釣竿時一律回 true（不攻擊）
export function click() {
  const s = C.me.fish; if (!s) return false;
  if (s.st === 'idle') { s.st = 'charge'; s.t = 0; s.k = 0; }
  else if (s.st === 'wait') { s.st = 'wait'; s.waitT = (s.waitT || 0) + K.early; s.nib = []; say('太早了，魚被嚇跑了'); C.ui.sfx('deny'); }
  else if (s.st === 'bite') hook(s);
  return true;
}

/* ============================== 每幀 ============================== */
let gut = null, lastHp = 0, f01Told = false, hint = '', hintT = 0;
export function update(dt) {
  const me = C.me, s = me.fish;
  sweepRemotes();
  if (gut) gutTick(dt);
  // f01：接下「水邊的耐心」時身上沒有釣竿 → 哈根塞一根竹釣竿給你（任務完成後就是你的）
  if (P().q && P().q.a && P().q.a.f01 && !rodOf() && C.room('rod_1') > 0) { C.addItem('rod_1'); C.save(); if (!f01Told) { f01Told = true; C.ui.loot('哈根塞給你一根竹釣竿：「拿去。低語潭的苔鯰最好上鉤。」', ['rod_1']); } }
  if (!s) { lastHp = me.hp; drawMe(dt, null); return; }
  // 收起的條件：移動、游泳、交談、坐下、倒下、挨打、按了格擋或重攻擊、身上的釣竿不見了
  const moving = C.moving && C.moving(), hurt = me.hp < lastHp - 0.5; lastHp = me.hp;
  if (!me.alive || me.swim || C.input.talk || me.sit || me.drink || me.dodge || me.cast || me.atk || me.charge || me.rush || moving || C.input.heavyHeld || C.input.guard || hurt || !rodOf()) { stow(hurt ? (s.st === 'reel' ? '挨打了，魚跑掉了' : '挨打了，先把釣竿收起來') : ''); drawMe(dt, null); return; }
  if (rodOf() !== s.rod) { s.rod = rodOf(); s.R = RODS[s.rod]; }
  s.t += dt; if (s.msgT > 0) s.msgT -= dt; const hold = !!C.input.atkHeld && !C.input.typing;
  if (s.st === 'charge') {
    me.f = damp_ang(me.f, aimDir(s), 10, dt);
    s.k = clamp(s.t / K.cast.t, 0, 1); if (!hold) cast(s);
  } else if (s.st === 'fly') {
    const p = clamp(s.t / s.flyT, 0, 1); s.bx = lerp(s.fx0, s.tx, p); s.bz = lerp(s.fz0, s.tz, p); s.by = lerp(s.fy0, s.ty, p) + Math.sin(p * Math.PI) * (1.2 + s.dist * 0.12);
    if (p >= 1) land(s);
  } else if (s.st === 'wait') waitTick(s, dt);
  else if (s.st === 'bite') { s.by = s.wl - 0.16; if (s.t >= s.R.react) { s.st = 'wait'; s.t = 0; s.waitT = U(...waitRange(s)) * 0.6 / s.mult; s.nib = nibbles(s.waitT); say('魚吐鉤跑了'); ring(s.bx, s.bz, 0.5); } }
  else if (s.st === 'reel') reelTick(s, dt, hold);
  else if (s.st === 'land') { if (s.t >= (props7 && props7.holdFish07 ? (FISH[s.fishId] && FISH[s.fishId].boss ? 3.0 : 2.4) : K.landT)) { s.st = 'idle'; s.t = 0; s.fishId = ''; } }
  else if (s.st === 'back') { const p = clamp(s.t / 0.45, 0, 1); s.bx = lerp(s.bx, me.x, p * 0.5); s.bz = lerp(s.bz, me.z, p * 0.5); s.by = lerp(s.by, Hgt(me.x, me.z) + 1.2, p * 0.5); if (p >= 1) { s.st = 'idle'; s.t = 0; } }
  drawMe(dt, s); hud(s);
}
// 拋竿的方向：背後視角跟著鏡頭、俯視跟著滑鼠；那個方向拋不到水時，維持面向水面的方向（拿出釣竿時轉好的）
function aimDir(s) { const me = C.me, I = C.input, a = I.cam.mode === 'top' ? Math.atan2(I.aim.x - me.x, I.aim.z - me.z) : I.cam.yaw - K.camOff; if (Math.abs(((a - s.f0) % TAU + TAU * 1.5) % TAU - TAU / 2) < 0.05) return a; for (let d = 3; d <= s.R.cast; d += 1.5) if (deep(me.x + Math.sin(a) * d, me.z + Math.cos(a) * d)) return a; return s.f0; }
const damp_ang = (a, b, k, dt) => { let d = ((b - a) % TAU + TAU * 1.5) % TAU - TAU / 2; return a + d * (1 - Math.exp(-k * dt)); };
const waitRange = s => ((WATERS07[s.water] || {}).slow ? K.waitFrost : K.wait);
function nibbles(waitT) { const n = Math.floor(U(K.nibble[0], K.nibble[1] + 0.999)), out = []; for (let i = 0; i < n; i++) out.push(Math.max(0.5, waitT - (i + 1) * U(0.5, 1.0))); return out; }
function cast(s) {
  const me = C.me, dist = lerp(K.cast.min, s.R.cast, s.k), f = me.f, sx = Math.sin(f), cz = Math.cos(f); let d = dist;
  while (d >= 2 && !deep(me.x + sx * d, me.z + cz * d)) d -= 0.5;      // 落在岸上：往回找最遠的一點水面
  const tip = rodTip(me, 'fly'); s.fx0 = tip.x; s.fz0 = tip.z; s.fy0 = tip.y; s.dist = d;
  if (d < 2) { s.tx = me.x + sx * dist; s.tz = me.z + cz * dist; s.ty = Hgt(s.tx, s.tz) + 0.1; s.st = 'fly'; s.t = 0; s.flyT = 0.5; s.miss = true; C.ui.sfx('swing'); return; }
  s.tx = me.x + sx * d; s.tz = me.z + cz * d; s.wl = waterLevel(s.tx, s.tz); s.ty = s.wl + 0.02; s.st = 'fly'; s.t = 0; s.flyT = 0.45 + d * 0.022; s.miss = false; s.water = waterAt(s.tx, s.tz) || s.water;
  C.ui.sfx('swing', 0, { x: me.x, z: me.z, tag: 'cast' });
}
function land(s) {
  if (s.miss) { s.st = 'back'; s.t = 0; say('拋到岸上了，對著水面再拋一次'); return; }
  const W7 = WATERS07[s.water]; splash(s.bx, s.bz, s.wl, 0.7); C.ui.sfx('splash', 0, { x: s.bx, z: s.bz, tag: 'plop' });
  if (!W7 || W7.none) { s.st = 'back'; s.t = 0; say(W7 && W7.none || '這裡沒有魚'); return; }
  s.bait = baitFor(s.water); const pk = pickFish(s.water, s.bait); if (!pk) { s.st = 'back'; s.t = 0; say('這裡沒有魚'); return; }
  s.mult = pk.mult; s.st = 'wait'; s.t = 0; s.waitT = U(...waitRange(s)) / s.mult * (onJetty() ? K.jettyK : 1); s.nib = nibbles(s.waitT); s.bob = 0;
}
function waitTick(s, dt) {
  s.by = s.wl + 0.02 + Math.sin(s.t * 2.1) * 0.012; s.rp = (s.rp || 0) - dt; if (s.rp <= 0) { s.rp = 1.7; ring(s.bx, s.bz, 0.18); }      // 浮標周圍淡淡的水紋：遠處也找得到浮標
  if (s.nib && s.nib.length && s.t >= s.nib[s.nib.length - 1]) { s.nib.pop(); s.dip = 0.22; ring(s.bx, s.bz, 0.35); }      // 試探：浮標輕輕點一下
  if (s.dip > 0) { s.dip -= dt; s.by -= Math.sin(clamp(s.dip / 0.22, 0, 1) * Math.PI) * 0.05; }
  if (s.t >= s.waitT) {      // 咬鉤：浮標整個沉下去、水花、音效
    const boss = s.forceId && FISH[s.forceId] && FISH[s.forceId].boss ? s.forceId : s.forceId ? '' : tryBoss(s.water, s.bait), pk = boss ? { id: boss } : s.forceId ? { id: s.forceId } : pickFish(s.water, s.bait); s.fishId = pk.id; s.st = 'bite'; s.t = 0;
    splash(s.bx, s.bz, s.wl, boss ? 1.3 : 0.9); C.ui.sfx('charged'); C.ui.sfx('splash', 0, { x: s.bx, z: s.bz, tag: 'bite' }); say(boss ? '浮標猛地沉下去——好重！快點左鍵！' : '咬鉤了！快點左鍵！', s.R.react);
  }
}
// 咬鉤後點左鍵：開始拉鋸
function hook(s) {
  const F = FISH[s.fishId], boss = !!F.boss, dur = U(...F.reel); s.st = 'reel'; s.t = 0; s.msgT = 0;
  s.f = { id: s.fishId, boss, S0: dur * (boss ? K.bossSta : K.sta), T: K.start, red: 0, slack: 0, surge: U(...(boss ? K.surge.bossGap : K.surge.gap)), run: 0, bk: U(...(boss ? K.back.bossGap : K.back.gap)), back: 0, pretty: true, ang: Math.random() * TAU, dist: Math.hypot(s.bx - C.me.x, s.bz - C.me.z), hx: s.bx, hz: s.bz };
  s.f.S = s.f.S0; C.ui.sfx('hit', 0, { x: s.bx, z: s.bz }); splash(s.bx, s.bz, s.wl, 0.8); C.ui.tip('fish7reel', '拉鋸：按住左鍵收線（張力上升、魚的力氣下降），放開放線（張力下降）。魚衝刺時張力會猛跳，先放開。張力在紅區撐太久會斷線，鬆到底太久魚會跑掉。');
}
function reelTick(s, dt, hold) {
  const f = s.f, me = C.me; f.run = Math.max(0, f.run - dt); f.back = Math.max(0, f.back - dt);
  const T0 = f.T; f.T += (hold ? K.up + (f.run > 0 ? K.runUp : 0) : -(f.run > 0 ? K.runDown : K.down)) * dt - (f.back > 0 ? (hold ? K.back.pullHold : K.back.pull) : 0) * dt;      // bal-d：回衝時魚朝你游，張力每秒再掉
  f.surge -= dt; if (f.surge <= 0) { f.T += U(...K.surge.add) * s.R.surge * (f.boss ? K.surge.bossK : 1); f.run = U(...K.run) * (f.boss ? 1.25 : 1); f.surge = U(...(f.boss ? K.surge.bossGap : K.surge.gap)); f.ang += U(-1.6, 1.6); splash(s.bx, s.bz, s.wl, f.boss ? 1 : 0.6); C.ui.sfx('splash', 0, { x: s.bx, z: s.bz, tag: 'fight' }); }
  f.bk -= dt; if (f.bk <= 0) { if (f.run > 0) f.bk = 0.5; else { f.bk = U(...(f.boss ? K.back.bossGap : K.back.gap)); if (Math.random() < K.back.p) { f.T -= U(...K.back.drop); f.back = K.back.dur; f.surge = Math.max(f.surge, K.back.dur + 0.5); splash(lerp(s.bx, me.x, 0.12), lerp(s.bz, me.z, 0.12), s.wl, f.boss ? 0.9 : 0.6); C.ui.sfx('splash', 0, { x: s.bx, z: s.bz, tag: 'fight' }); } } }      // bal-d：回衝——浮標朝岸邊濺水
  f.T = clamp(f.T, 0, 100);      // 回衝的瞬間掉落也夾在 0–100
  if (f.back > 0 && K.back.floor) f.T = Math.max(f.T, Math.min(T0, K.back.floor));      /* X8：回衝（瞬間掉落＋回衝期間）不把張力壓到 floor 以下 */
  if (hold && (f.rl = (f.rl || 0) - dt) <= 0 && (f.rl = 0.3 + Math.random() * 0.1)) C.ui.sfx('click', 0, { tag: 'reel' });      // 收線的棘輪聲
  if (hold) f.S -= (K.drain[0] + K.drain[1] * Math.min(1, f.T / K.red)) * dt; else f.S = Math.min(f.S0, f.S + K.rest * dt);
  if (f.T >= K.red) { f.pretty = false; f.red += dt; if (f.red >= s.R.redT) return snap(s, '線斷了！張力在紅區撐太久'); } else f.red = Math.max(0, f.red - dt * 2);
  if (f.T <= K.slack) { f.slack += dt; if (f.slack >= K.slackT) return snap(s, '線太鬆，魚掙脫跑了'); } else f.slack = Math.max(0, f.slack - dt * 2);
  // 魚在水裡游：衝刺時往側邊竄，力氣越少離岸越近；浮標跟著魚走（只在夠深的水裡）
  const prog = 1 - clamp(f.S / f.S0, 0, 1), d = Math.max(1.6, f.dist * (1 - prog * 0.85) - (f.back > 0 ? 2.5 : 0)), sw = (f.run > 0 ? 0.9 : 0.3) * Math.sin(s.t * (f.run > 0 ? 7 : 2.3));
  const base = Math.atan2(f.hx - me.x, f.hz - me.z), a = base + Math.sin(f.ang) * 0.35 + sw * 0.12, nx = me.x + Math.sin(a) * d, nz = me.z + Math.cos(a) * d;
  if (deep(nx, nz)) { const kk = f.run > 0 || f.back > 0 ? 6 : 2.5; s.bx = damp(s.bx, nx, kk, dt); s.bz = damp(s.bz, nz, kk, dt); }
  s.wl = waterLevel(s.bx, s.bz); s.by = s.wl - 0.05 - 0.06 * f.T / 100;
  f.rip = (f.rip || 0) - dt; if (f.rip <= 0) { f.rip = f.run > 0 ? 0.18 : 0.5; ring(s.bx, s.bz, f.run > 0 ? 0.45 : 0.25); }
  if (Math.random() < dt * (f.run > 0 ? 18 : 4)) emit(s.bx, s.wl + 0.05, s.bz, 1, [0.85, 0.95, 1.1], f.run > 0 ? 2.2 : 1.1, 1.4, 0.4, 8);
  if (f.S <= 0) catchIt(s);
}
function snap(s, why) { s.st = 'back'; s.t = 0; say(why, 2.6); C.ui.sfx(/斷/.test(why) ? 'break' : 'deny'); C.ui.log(why + '。'); ring(s.bx, s.bz, 0.8); return false; }
// 上岸：記紀錄、給魚、第一次給經驗、扣餌、任務事件
function catchIt(s) {
  const f = s.f, id = f.id, F = FISH[id], luck = C.D().luck || 1, p = P();
  const len = Math.round(U(...F.len) * (1 + (luck - 1) * 0.5) * (f.pretty ? K.pretty : 1) * 10) / 10, rec = p.fishRec[id] || [0, 0], first = !rec[0], best = len > rec[1];
  p.fishRec[id] = [rec[0] + 1, Math.max(rec[1], len)]; const got = C.addItem(id, 1);
  if (s.bait && inv(s.bait) > 0) C.take(s.bait, 1);
  s.st = 'land'; s.t = 0; s.fishId = id; s.fishLen = len; s.landN = (s.landN || 0) + 1; splash(s.bx, s.bz, s.wl, 1.1); C.ui.sfx('splash', 1, { x: s.bx, z: s.bz, tag: 'land' }); C.ui.sfx(first ? 'learn' : 'loot');
  C.ui.loot(`釣到了${ITEM(id).name}　${len} 公分` + (f.pretty ? '（漂亮！全程沒進紅區）' : '') + (first ? '（第一次釣到）' : best ? '（新紀錄）' : '') + (got ? '' : '——帶不下了，放回水裡'), [id]);
  if (first) { const e = E1() * (F.boss ? K.firstBossExp : K.firstExp); if (X.gainExp) X.gainExp(e, C.me.x, C.me.z); C.ui.log(`第一次釣到${ITEM(id).name}！釣魚紀錄記上一筆。`); }
  say(`${ITEM(id).name}　${len} 公分` + (best && !first ? '　新紀錄！' : ''), K.landT);
  qa('doFish'); qa('doFish:' + id); qa('doFishAt:' + s.water); if (F.boss) qa('doFishBoss'); C.save();
}

/* ============================== 增益（game.js 的 recalc6 呼叫） ============================== */
// data06.js 的 craft.mods 只認舊的增益種類；這裡補上新的三種：move 移速、win 閃避格擋時機、dsSt 閃避衝刺耗體力（料理、藥劑、鏡鱗飾）
export function mods(m) {
  m.move = m.move || 0; m.win = m.win || 0; m.dsSt = m.dsSt || 0; const p = P();
  for (const k of ['food', 'tonic']) { const b = p[k], fx = b && USE[b.id] && USE[b.id].fx; if (!fx) continue; m.move += fx.move || 0; m.win += fx.win || 0; m.dsSt += fx.dsSt || 0; }
  if (X.Ars && C.me.trial == null) { const wp = X.Ars.current(), o = p.wps && p.wps[wp]; if (o && o.c === 'charm_scale' && o.t >= 2) m.win += 0.15; }
}
// 上限：體力回復、魔力回復加成各最多 +50%；移速最多 +10%；時機最多 +25%（減傷兩成在 game.js 原本就截）
export function cap(M, m) {
  M.stRegen = Math.min(M.stRegen, 1 + CAPS07.stRegen); M.mpRegen = Math.min(M.mpRegen, 1 + CAPS07.mpRegen);
  M.move = 1 + clamp(m.move || 0, -0.5, CAPS07.move); M.win = 1 + clamp(m.win || 0, 0, CAPS07.win); M.dsSt = Math.max(0.5, 1 + (m.dsSt || 0));
}

/* ============================== 分解（料理視窗的「分解」頁） ============================== */
export const deco = {};      // 0.7 介面（d7-ui-f）：ui07f.js 在這裡掛 deco.gut（分解魚頁的畫法）
const gutList = () => FISH_IDS.filter(id => FISH[id].gut && inv(id) > 0);
export function gutStart(id, n) {
  const me = C.me; if (gut) return false; if (me.combat) { C.ui.toast('戰鬥中沒辦法分解'); return false; } n = Math.max(1, Math.min(n | 0, inv(id), GUT.max)); if (!(n > 0) || !FISH[id] || !FISH[id].gut) return false;
  gut = { id, n, t: 0, dur: n * GUT.t, x: me.x, z: me.z }; me.craft = gut; C.ui.sfx('craft', 'cook'); return true;
}
function gutTick(dt) {
  const me = C.me; if (!me.alive || me.combat || Math.hypot(gut.x - me.x, gut.z - me.z) > 5 || C.moving && C.moving()) { gut = null; if (me.craft && !me.craft.st) me.craft = null; C.ui.toast('分解中斷了'); return; }
  gut.t += dt; if (gut.t < gut.dur) return; const g = gut, got = {}; gut = null; if (me.craft === g) me.craft = null; const n = Math.min(g.n, inv(g.id)); if (n < 1) return;
  C.take(g.id, n); for (let i = 0; i < n; i++) for (const [m, c, ch] of FISH[g.id].gut) if (ch == null || Math.random() < ch) got[m] = (got[m] || 0) + c;
  const txt = []; for (const m in got) { const k = C.addItem(m, got[m]); txt.push(ITEM(m).name + ' ×' + k); }
  C.ui.loot(`分解了${ITEM(g.id).name} ×${n}：` + (txt.join('、') || '什麼也沒有'), Object.keys(got)); C.ui.sfx('craft', 'done'); C.save();
  for (let i = 0; i < n; i++) { qa('doGut'); qa('doGut:' + g.id); }
}
export const gutting = () => gut;
// ui06.js 的 renderCraft 開頭呼叫：料理視窗（大鍋、營火）多一排「料理｜分解」分頁；在分解頁就由這裡畫，回 true（renderCraft 不再往下畫）
export function craftPage(S, rerender, H) {
  const win = document.getElementById('winCraft'), body = win && win.querySelector('.body'); if (!body) return false;
  let tabs = document.getElementById('fishTabs');
  if (!tabs) { tabs = document.createElement('div'); tabs.id = 'fishTabs'; tabs.className = 'seg'; tabs.innerHTML = '<button data-p="cook">料理</button><button data-p="gut">分解魚</button>'; body.insertBefore(tabs, body.firstChild);
    tabs.addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (!b || !tabs._S) return; tabs._S.page = b.dataset.p; tabs._S.gsel = null; if (H && H.sfx) H.sfx('tab'); tabs._r(); }); }
  if (tabs._where !== S.where) { tabs._where = S.where; S.page = 'cook'; }      // 每次打開料理視窗都從「料理」頁開始
  tabs._S = S; tabs._r = rerender; tabs.hidden = S.st !== 'cook'; if (S.st !== 'cook') { S.page = 'cook'; return false; }
  if (!S.page) S.page = 'cook'; for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.p === S.page);
  if (S.page !== 'gut') return false;
  if (deco.gut && deco.gut(S, rerender, H)) return true;      // 0.7 介面（d7-ui-f）
  const box = document.getElementById('craftList'), info = document.getElementById('craftInfo'), el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }, ic = id => (H && H.ic ? H.ic(id) : el('span', 'ic', ITEM(id).glyph || '？'));
  const title = document.getElementById('craftTitle'); if (title) title.textContent = '分解魚　' + (S.where && S.where.camp ? S.where.camp.name : '酒館的大鍋');
  const note = document.getElementById('craftNote'); if (note) note.textContent = '';
  box.textContent = ''; info.textContent = ''; const list = gutList();
  if (!list.length) { box.appendChild(el('p', 'c6empty', '背包裡沒有能分解的魚。主（老鬍子、鏡王、霜鰭）不能分解。')); info.appendChild(el('p', 'c6empty', '分解得到魚鱗、魚膽、魚鰾：做新藥劑（艾妲）、鏡鱗飾（布蘿娜）、更好的釣竿（哈根）。')); return true; }
  if (!S.gsel || !list.includes(S.gsel)) S.gsel = list[0];
  const yields = id => FISH[id].gut.map(([m, c, ch]) => ITEM(m).name + ' ×' + c + (ch ? `（${Math.round(ch * 100)}%）` : '')).join('、');
  for (const id of list) { const b = el('button', 'c6r' + (id === S.gsel ? ' on' : '')), sp = el('span'); sp.append(el('b', '', ITEM(id).name), el('small', '', yields(id))); b.append(ic(id), sp, el('em', 'ok', '×' + inv(id))); b.onclick = () => { S.gsel = id; if (H && H.sfx) H.sfx('click'); rerender(); }; box.appendChild(b); }
  const id = S.gsel, n = inv(id), head = el('div', 'c6head'), ht = el('div'); ht.append(el('h4', '', '分解' + ITEM(id).name), el('div', 'c6chips')); ht.lastChild.append(el('i', '', yields(id)), el('i', 'dim', `一尾 ${GUT.t} 秒`)); head.append(H && H.ic ? H.ic(id, 'big') : ic(id), ht); info.appendChild(head);
  info.appendChild(el('p', 'c6desc', ITEM(id).desc + ' 素材不能賣，拿去做藥劑、獸飾與釣竿。'));
  const g = gut, row = el('div', 'c6go');
  if (g) { const b = el('button', 'primary busy'), fill = el('i'); b.disabled = true; b.id = 'gutGo'; b.append(el('span', '', `分解${ITEM(g.id).name}中…（${g.n} 尾）`)); fill.style.transform = `scaleX(${Math.min(1, g.t / g.dur).toFixed(3)})`; b.appendChild(fill); row.appendChild(b); setTimeout(() => { if (S.page === 'gut' && document.getElementById('winCraft') && !document.getElementById('winCraft').hidden) rerender(); }, 100); }
  else { const ks = [Math.min(n, GUT.max), 1].filter((v, i, a) => v > 0 && a.indexOf(v) === i); ks.forEach((k, i) => { const b = el('button', i ? '' : 'primary'); if (!i) b.id = 'gutGo'; b.append(el('span', '', k === 1 ? '分解 1 尾' : `全部分解（${k} 尾）`)); if (!i) { b.append(el('small', '', `${(k * GUT.t).toFixed(1)} 秒`), el('i')); } b.onclick = () => { if (gutStart(id, k)) rerender(); }; row.appendChild(b); }); }
  info.appendChild(row); return true;
}

/* ============================== NPC 的服務（ui.js 的 service() 補丁呼叫）：回傳要顯示的對白，不認得的選項回 null ============================== */
export function service(k, npc) {
  const p = P();
  if (k === 'sellfish') {
    const got = [], ids = Object.keys(C.ITEMS).filter(id => C.ITEMS[id].kind === 'fish' && C.ITEMS[id].sell && inv(id) > 0); let gold = 0, n = 0;
    for (const id of ids) { const c = inv(id); gold += C.ITEMS[id].sell * c; n += c; got.push(ITEM(id).name + ' ×' + c); C.take(id, c); }
    if (!n) return '（米洛：「老闆，魚呢？我聞到水味了，可是沒看到魚。生的我都收，越危險的水邊越值錢。『主』我可不敢收。」）';
    p.gold += gold; C.save(); C.ui.sfx('sell'); for (let i = 0; i < n; i++) qa('doSellFish'); C.ui.log(`把魚賣給米洛：${got.join('、')}，一共 ${gold} 金。`);
    return `（米洛收下了 ${got.join('、')}，一共付了 ${gold} 金。「講真的，十二年了，城裡終於有新鮮魚！這價錢我不砍，秤你自己看。」）`;
  }
  if (k === 'rod') {
    const cur = rodOf();
    if (!cur) { if (C.questExists('f01') && !C.questDone('f01')) return '（哈根：「竿子？先坐下。」——先接哈根的任務「水邊的耐心」。）'; if (p.lv < 4) return '（哈根：「等你 4 級再說。水邊也有狼。」）'; C.addItem('rod_1'); C.save(); C.ui.loot('哈根從帳篷裡翻出一根竹釣竿，丟給你。', ['rod_1']); return '（哈根從帳篷裡翻出一根竹釣竿：「舊是舊了，魚認的是耐心。」到水邊按互動鍵拿出來。）'; }
    const next = ROD_IDS.find(id => RODS[id].from === cur); if (!next) return `（哈根看了一眼你的${ITEM(cur).name}：「……夠好了。剩下的，靠手。」）`;
    const R = RODS[next], lack = Object.keys(R.mats).filter(m => inv(m) < R.mats[m]), need = Object.keys(R.mats).map(m => `${ITEM(m).name}×${R.mats[m]}（有 ${inv(m)}）`).join('、') + `、工錢 ${R.fee} 金`;
    if (lack.length || p.gold < R.fee) return `（哈根：「${ITEM(next).name}？料湊齊再來。」要：${need}。${lack.length ? '素材不夠。' : '金幣不夠。'}）`;
    for (const m in R.mats) C.take(m, R.mats[m]); p.gold -= R.fee; C.take(cur, 1); C.addItem(next, 1); C.save(); C.ui.sfx('forge'); C.ui.loot(`哈根把${ITEM(cur).name}改成了${ITEM(next).name}。`, [next]); qa('doRod:' + next);
    return `（哈根把竿子拆了，一圈一圈重纏：「${ITEM(next).name}。${next === 'rod_3' ? '拋得遠，魚衝也穩。呵，別拿去釣熊。' : '韌了。魚咬了，多給你一口氣的時間。'}」）`;
  }
  return null;
}

/* ============================== 提示、介面 ============================== */
// 互動提示列（game.js 每幀的 ui.prompt）：別的提示優先；水邊、手上有釣竿時提示拿出來
export function prompt(h) {
  const me = C.me, s = me.fish; if (s) return '';
  if (h || !me.alive || me.swim || me.sit || C.input.talk) return h; hintT -= 1 / 30;
  if (hintT <= 0) { hintT = 0.35; hint = ''; if (rodOf()) { const sc = scan(me.x, me.z); if (sc && sc.water) { const W7 = WATERS07[sc.water]; hint = W7 && !W7.none ? `按 E 拿出釣竿（${W7.name}）` : ''; } } }
  return hint || h;
}
let hudEl = null, hudK = '';
function hudBuild() {
  if (hudEl || typeof document === 'undefined') return hudEl; const st = document.createElement('style'); st.textContent = HUD_CSS; document.head.appendChild(st);
  hudEl = document.createElement('div'); hudEl.id = 'fish7'; hudEl.innerHTML = '<div class="f7top"><b class="f7w"></b><span class="f7bait"></span></div><div class="f7msg"></div><div class="f7bar f7charge"><i></i><span></span></div><div class="f7ten"><div class="f7zone"></div><i class="f7needle"></i><em class="f7red"></em><em class="f7slack"></em></div><div class="f7fish"><span>魚的力氣</span><div><i></i></div></div><div class="f7keys"></div>';
  document.body.appendChild(hudEl); return hudEl;
}
function hud(s) {
  const e = hudBuild(); if (!e) return; if (!s) { if (e.classList.contains('on')) e.classList.remove('on'); return; } e.classList.add('on');
  const q = sel => e.querySelector(sel), W7 = WATERS07[s.water] || { name: '水邊' }, b = baitFor(s.water), st = s.st;
  const key = st + '|' + s.water + '|' + P().fishOpt.bait + '|' + b + '|' + inv(b) + '|' + s.rod; if (key !== hudKey) { hudKey = key; q('.f7w').textContent = ITEM(s.rod).name + '・' + W7.name + (onJetty() ? '（釣臺）' : ''); q('.f7bait').textContent = '餌：' + baitText(b) + (b ? ` ×${inv(b)}` : ''); }
  const tip = { idle: '按住左鍵蓄力，放開拋竿', charge: '放開左鍵拋出去', fly: '', wait: '等浮標沉下去…（太早點會嚇跑魚）', bite: '咬鉤了！點左鍵！', reel: '按住左鍵收線、放開放線', land: '', back: '' }[st];
  const rt = st === 'reel' && s.f ? (s.f.T >= K.red ? '張力太高——放開！' : s.f.T <= K.slack || s.f.back > 0 ? '線鬆了！快收線！' : s.f.run > 0 ? '魚在衝，先放開' : '') : '', msg = rt || (s.msgT > 0 && s.msg ? s.msg : tip); if (q('.f7msg').textContent !== msg) q('.f7msg').textContent = msg; e.classList.toggle('bite', st === 'bite'); e.classList.toggle('reel', st === 'reel'); e.classList.toggle('chg', st === 'charge'); if (st !== 'reel') for (const c of ['hot', 'loose', 'run']) e.classList.remove(c);
  if (st === 'charge') { q('.f7charge i').style.width = (s.k * 100).toFixed(1) + '%'; q('.f7charge span').textContent = Math.round(lerp(K.cast.min, s.R.cast, s.k)) + ' 公尺'; }
  if (st === 'reel') { const f = s.f; q('.f7needle').style.left = f.T.toFixed(1) + '%'; q('.f7red').style.width = (f.red / s.R.redT * 15).toFixed(1) + '%'; q('.f7slack').style.width = (f.slack / K.slackT * 10).toFixed(1) + '%'; q('.f7fish i').style.width = (clamp(f.S / f.S0, 0, 1) * 100).toFixed(1) + '%'; e.classList.toggle('hot', f.T >= K.red); e.classList.toggle('loose', f.T <= K.slack || f.back > 0); e.classList.toggle('run', f.run > 0); }
  const keys = st === 'idle' || st === 'charge' ? 'E 換餌　移動或 Esc 收起' : st === 'wait' || st === 'bite' ? 'E 收線　移動或 Esc 收起' : st === 'reel' ? '張力條別在紅區撐太久，也別鬆到最左邊' : ''; if (q('.f7keys').textContent !== keys) q('.f7keys').textContent = keys;
}
let hudKey = '';
const HUD_CSS = `
#fish7{position:fixed;left:50%;bottom:126px;transform:translateX(-50%) translateY(6px);width:340px;padding:8px 12px 9px;border-radius:9px;background:var(--panel,rgba(20,22,18,.86));border:1px solid var(--line-strong,rgba(244,236,217,.3));box-shadow:0 6px 18px rgba(0,0,0,.45);color:var(--ink,#f4ecd9);font-size:12.5px;pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;z-index:6}
#fish7.on{opacity:1;transform:translateX(-50%)}
#fish7 .f7top{display:flex;justify-content:space-between;gap:8px;color:var(--ink-dim,#b9b2a0);font-size:11.5px} #fish7 .f7w{font-weight:500;color:var(--ink-dim,#b9b2a0)}
#fish7 .f7msg{margin:5px 0 4px;font-size:15px;font-weight:600;text-align:center;letter-spacing:.04em;min-height:20px}
#fish7.bite .f7msg{color:#ffd36a;animation:f7pulse .25s infinite alternate} @keyframes f7pulse{from{transform:scale(1)}to{transform:scale(1.08)}}
#fish7 .f7bar,#fish7 .f7ten,#fish7 .f7fish{display:none}
#fish7.chg .f7charge{display:block;position:relative;height:14px;border-radius:7px;background:rgba(0,0,0,.45);overflow:hidden;margin:4px 0}
#fish7 .f7charge i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#7fb6e6,#f2a24a)} #fish7 .f7charge span{position:absolute;right:8px;top:0;line-height:14px;font-size:11px;font-weight:600;text-shadow:0 1px 2px #000,0 0 3px #000}
#fish7.reel .f7ten{display:block;position:relative;height:16px;margin:6px 2px 7px;border-radius:4px;overflow:visible}
#fish7 .f7zone{position:absolute;inset:0;border-radius:4px;background:linear-gradient(90deg,#4a6f8f 0,#4a6f8f 10%,#4f7a4a 10%,#8a9a46 55%,#c9963a 80%,#c9963a 85%,#b8322e 85%,#e04a3a 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.5)}
#fish7 .f7needle{position:absolute;top:-4px;bottom:-4px;width:4px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.8);transition:left .05s linear}
#fish7 .f7red{position:absolute;right:0;bottom:-6px;height:3px;background:#ff6a4a;border-radius:2px} #fish7 .f7slack{position:absolute;left:0;bottom:-6px;height:3px;background:#8fc4ff;border-radius:2px}
#fish7.hot{border-color:#e04a3a;box-shadow:0 0 16px rgba(224,74,58,.55)} #fish7.hot .f7msg{color:#ff7a5a} #fish7.loose .f7msg{color:#8fc4ff;animation:f7pulse .25s infinite alternate} #fish7.hot .f7zone{animation:f7hot .18s infinite alternate} @keyframes f7hot{to{filter:brightness(1.35)}} #fish7.run .f7needle{background:#ffd36a}
#fish7.reel .f7fish{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink-dim,#b9b2a0)} #fish7 .f7fish div{flex:1;height:6px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden} #fish7 .f7fish i{display:block;height:100%;background:linear-gradient(90deg,#6fd6c0,#9fe0b0)}
#fish7 .f7keys{margin-top:5px;text-align:center;font-size:10.5px;color:var(--ink-faint,#8a8576)}
`;

/* ============================== 畫面：釣竿、線、浮標、魚 ============================== */
// 美術的模型（props07.js：rod_1–3、bobber、fish_*）到位前用暫代：分節的竿子、紅白浮標、橢圓身體加尾鰭的魚
const ROD_LOOK = { rod_1: { c: 0xc9b46a, n: 0x8a7a3a, L: 2.0 }, rod_2: { c: 0xa86a32, n: 0xe6d6b0, L: 2.1 }, rod_3: { c: 0x8fb4c8, n: 0x3a4a56, L: 2.3 } };
let mats = null, lineGeo = null; const SEG = 6, LN = 16, _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function mat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o || {})); }
function ensureMats() {
  if (!lineGeo) { lineGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true); lineGeo.translate(0, 0.5, 0); }
  if (!mats) mats = { line: new THREE.MeshBasicMaterial({ color: 0xf2f8fa, transparent: true, opacity: 0.9 }), red: mat(0xd8382e, { roughness: 0.45 }), white: mat(0xf4f0e6, { roughness: 0.5 }), ring: new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), shadow: new THREE.MeshBasicMaterial({ color: 0x0a1418, transparent: true, opacity: 0.35, depthWrite: false }) };
}
function makeVis() {
  ensureMats();
  const v = { rod: new THREE.Group(), segs: [], rodId: '', line: new THREE.Group(), lseg: [], pts: new Float32Array(LN * 3), bob: new THREE.Group(), fish: null, fishId: '', shadow: null, hide: true };
  for (let i = 0; i < LN - 1; i++) { const m = new THREE.Mesh(lineGeo, mats.line); m.frustumCulled = false; v.line.add(m); v.lseg.push(m); }
  { const top = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, TAU, 0, Math.PI / 2), mats.red), bot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), mats.white), stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), mats.red); stick.position.y = 0.12; v.bob.add(top, bot, stick); const a = art('bobber'); if (a) { v.bob.clear(); v.bob.add(a); } }
  v.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), mats.shadow); v.shadow.rotation.x = -Math.PI / 2; v.shadow.scale.set(0.35, 1, 1);
  W.scene.add(v.rod, v.line, v.bob, v.shadow); return v;
}
function buildRod(v, id) {
  v.rod.clear(); v.segs = []; v.rodId = id; const a = art(id); if (a) { v.art = a; v.artL = a.userData && a.userData.tip ? a.userData.tip.length() : (ROD_LOOK[id] || ROD_LOOK.rod_1).L; v.rod.add(a); return; } v.art = null;
  const L = ROD_LOOK[id] || ROD_LOOK.rod_1, m = mat(L.c, { roughness: id === 'rod_3' ? 0.35 : 0.65, metalness: id === 'rod_3' ? 0.5 : 0 }), mn = mat(L.n), sl = L.L / SEG;
  for (let i = 0; i < SEG; i++) { const r0 = lerp(0.036, 0.012, i / SEG), r1 = lerp(0.036, 0.012, (i + 1) / SEG), g = new THREE.Group(), cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, sl, 6), m); cyl.position.y = sl / 2; g.add(cyl);
    if (i === 0) { const grip = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.35, r0 * 1.45, sl * 0.55, 7), mn); grip.position.y = sl * 0.3; g.add(grip); }
    else { const node = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.3, r0 * 1.3, 0.025, 6), mn); g.add(node); }
    if (id !== 'rod_1' && i === 0) { const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), mn); reel.rotation.z = Math.PI / 2; reel.position.set(0.04, sl * 0.62, 0); g.add(reel); }
    v.rod.add(g); v.segs.push(g); }
  v.segLen = sl;
}
// 釣魚的魚（暫代）：身體＋尾鰭＋背鰭＋眼睛，顏色照物品色；主大一號、帶一點光
function fishMesh(id) {
  const a = art(id); if (a) return a; const it = ITEM(id), F = FISH[id] || {}, g = new THREE.Group(), col = new THREE.Color(it.color || '#9fb8c4'), m = mat(col, { roughness: 0.4, metalness: 0.15, emissive: F.boss ? col.clone().multiplyScalar(0.18) : 0x000000 }), belly = mat(col.clone().lerp(new THREE.Color('#f4f0e6'), 0.55), { roughness: 0.5 });
  const L = (F.boss ? 1.1 : 0.42) * (F.len ? (F.len[0] + F.len[1]) / 2 / 40 : 1), body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), m); body.scale.set(0.28, 0.42, 1); g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, TAU, Math.PI * 0.55, Math.PI * 0.45), belly); bel.scale.set(0.27, 0.41, 0.98); g.add(bel);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 4), m); tail.rotation.x = -Math.PI / 2; tail.scale.set(0.18, 1, 1.2); tail.position.z = -0.6; g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 3), m); fin.scale.set(0.15, 1, 1.6); fin.position.set(0, 0.22, -0.05); fin.rotation.x = -0.5; g.add(fin);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0x111111, { roughness: 0.2 })); eye.position.set(sx * 0.12, 0.06, 0.33); g.add(eye); }
  g.scale.setScalar(L); g.userData.L = L; return g;
}
// 竿子往右手邊偏多少（弧度）：從背後看得到竿子，線再從竿尖拉回浮標
const ROD_YAW = { idle: 0.42, charge: 0.3, fly: 0.12, wait: 0.3, bite: 0.24, reel: 0.1, back: 0.3 };
// 釣竿的姿勢：每個狀態一個仰角（拋竿前往後揚到肩上、拋出去往前甩、等待時斜斜朝水面、拉鋸時抬高並朝線的方向彎、舉魚時豎起來）
function rodPose(st, t, k, bend) {
  switch (st) { case 'charge': return lerp(0.75, 1.9, k); case 'fly': return lerp(1.9, 0.35, clamp(t / 0.16, 0, 1)); case 'wait': return 0.3; case 'bite': return 0.36; case 'reel': return 0.75 + 0.25 * bend; case 'land': return 1.15; case 'back': return 0.9; default: return 0.7; }
}
function rodBase(o) { const av = o.avatar, b = av && av.bones && av.bones.r; if (b) { b.getWorldPosition(_a); return _a; } return _a.set(o.x + Math.sin(o.f + 1.2) * 0.3, (o.y != null ? o.y : Hgt(o.x, o.z)) + 1.05, o.z + Math.cos(o.f + 1.2) * 0.3); }
const tipOut = new THREE.Vector3();
function rodTip(o, st) { const base = rodBase(o).clone(), p = rodPose(st || 'idle', 0, 0, 0), L = (ROD_LOOK[(o.fish && o.fish.rod) || 'rod_1'] || ROD_LOOK.rod_1).L; return base.add(_v.set(Math.sin(o.f) * Math.cos(p) * L, Math.sin(p) * L, Math.cos(o.f) * Math.cos(p) * L)); }
// 畫一個人的釣具。d：{ st, t, k 蓄力、bend 彎（0–1）, rod, bx, by, bz 浮標, fishId, fishT 舉魚經過的秒數, run 魚在衝 }
function drawVis(v, o, d, dt) {
  const on = !!d, held = on && d.st === 'land' && d.fishId && holdArt(v, o, d, dt); if (!(on && d.st === 'land') && v.held) dropHeld(v);
  if (held) { v.rod.visible = v.line.visible = v.bob.visible = v.shadow.visible = false; if (v.fish) v.fish.visible = false; holdPose(o.avatar, false, true); return; } v.rod.visible = on; v.line.visible = on && d.st !== 'idle' && d.st !== 'charge'; v.bob.visible = on && v.line.visible && d.st !== 'land'; v.shadow.visible = on && d.st === 'reel';
  if (v.fish) v.fish.visible = on && d.st === 'land'; holdPose(o.avatar, on); if (!on) return;
  if (v.rodId !== d.rod) buildRod(v, d.rod);
  const base = rodBase(o), pitch = rodPose(d.st, d.t, d.k, d.bend), f = o.f - (d.st === 'land' ? 0.95 * clamp(d.t / 0.3, 0, 1) : ROD_YAW[d.st] || 0), L = (ROD_LOOK[d.rod] || ROD_LOOK.rod_1).L, dir = _b.set(Math.sin(f) * Math.cos(pitch), Math.sin(pitch), Math.cos(f) * Math.cos(pitch)).normalize();
  // 彎曲：竿尖往浮標的方向拉（拉鋸時照張力，衝刺時多抖一點）
  const pull = _c.set(d.bx - base.x, (d.by || base.y) - base.y, d.bz - base.z), pl = pull.length() || 1; pull.multiplyScalar(1 / pl);
  const bend = clamp(d.bend, 0, 1) * (d.st === 'reel' ? 1 : 0.15) + (d.run ? Math.sin(W.time * 40) * 0.04 : 0);
  if (v.art) { if (bend > 0.01) dir.lerp(pull, bend * 0.3).normalize(); v.rod.position.copy(base); v.rod.quaternion.setFromUnitVectors(_up, dir); }      // 美術的竿子是硬的：拉鋸時整支往線的方向壓
  else { let px = base.x, py = base.y, pz = base.z; const cur = dir.clone();
    for (let i = 0; i < SEG; i++) { const g = v.segs[i]; g.position.set(px, py, pz); g.quaternion.setFromUnitVectors(_up, cur); const s = v.segLen; px += cur.x * s; py += cur.y * s; pz += cur.z * s; cur.lerp(pull, bend * 0.55 * (i + 1) / SEG).normalize(); }
    tipOut.set(px, py, pz); }
  const tip = v.art ? tipOut.copy(base).addScaledVector(dir, v.artL || L) : tipOut;
  // 浮標與線
  let bx = d.bx, by = d.by, bz = d.bz;
  if (d.st === 'land' || d.st === 'back') { const hang = clamp((d.fishT || 0) / 0.35, 0, 1); bx = lerp(d.bx, tip.x, hang); bz = lerp(d.bz, tip.z, hang); by = lerp(d.by, tip.y - 0.55, hang); }
  v.bob.position.set(bx, by, bz); v.bob.rotation.z = d.st === 'bite' ? 0.5 : 0;
  const sag = d.st === 'wait' || d.st === 'bite' ? 0.18 + 0.02 * Math.hypot(bx - tip.x, bz - tip.z) : d.st === 'fly' ? 0.1 : d.st === 'back' ? 0.25 : d.st === 'reel' ? Math.max(0, 0.2 - (d.bend || 0)) * 0.9 : 0;
  for (let i = 0; i < LN; i++) { const s = i / (LN - 1), j = i * 3; v.pts[j] = lerp(tip.x, bx, s); v.pts[j + 1] = lerp(tip.y, by + (d.st === 'land' ? 0 : 0.06), s) - sag * 4 * s * (1 - s); v.pts[j + 2] = lerp(tip.z, bz, s); }
  { const cp = W.camera ? W.camera.position : tip, P = v.pts; for (let i = 0; i < LN - 1; i++) { const m = v.lseg[i], j = i * 3; _a.set(P[j], P[j + 1], P[j + 2]); _c.set(P[j + 3] - P[j], P[j + 4] - P[j + 1], P[j + 5] - P[j + 2]); const len = _c.length() || 1e-3, r = clamp(_a.distanceTo(cp) * 0.0011, 0.004, 0.05); m.position.copy(_a); m.quaternion.setFromUnitVectors(_up, _c.multiplyScalar(1 / len)); m.scale.set(r, len, r); } }
  // 拉鋸時水下的魚影；舉魚時魚掛在線上掙扎
  if (d.st === 'reel') { const wl = waterLevel(d.bx, d.bz); v.shadow.position.set(d.bx - Math.sin(f) * 0.25, wl - 0.04, d.bz - Math.cos(f) * 0.25); v.shadow.rotation.z = -f + Math.sin(W.time * (d.run ? 14 : 4)) * 0.4; const big = (FISH[d.fishId] && FISH[d.fishId].boss ? 2.4 : 1.3) * (d.run ? 1.15 : 1); v.shadow.scale.set(0.38 * big, 1 * big, 1); }
  if (d.st === 'land' && d.fishId) { if (v.fishId !== d.fishId) { if (v.fish) W.scene.remove(v.fish); v.fish = fishMesh(d.fishId); v.fishId = d.fishId; W.scene.add(v.fish); } const L2 = v.fish.userData.L || 0.4; v.fish.visible = true; v.fish.position.set(bx, by - 0.1 - L2 * 0.45, bz); v.fish.rotation.set(-Math.PI / 2 + Math.sin(W.time * 13) * 0.25, f + Math.PI / 2 + Math.sin(W.time * 9) * 0.5, 0); if (v.fish.userData.flap) v.fish.userData.flap(W.time, 0.8); }      // 0.7：上岸那一下掛在線上的魚也擺尾（美術的 6 骨魚）
}
// 拿著釣竿的手臂：借用角色現成的「右手橫在胸前」姿勢（armT.guard，雙手握竿的位置），武器先收起來
function holdPose(av, on, keepHidden) {
  if (!av || !av.armT) return; const T = av.armT.guard;
  if (on) { if (av.hold !== T && T) { av.__fishHold = av.hold; av.hold = T; av.hw = 0; } if (av.weap && !av.__fishHid) { av.__fishHid = true; for (const m of av.weap) m.visible = false; } }
  else { if (av.hold === T && av.__fishHold !== undefined) { av.hold = av.__fishHold; av.__fishHold = undefined; } if (av.__fishHid && !keepHidden) { av.__fishHid = false; if (!av.wHide) for (const m of av.weap || []) m.visible = true; } }
}
// 美術的舉魚姿勢：holdFish07(avatar, 魚) → { update(dt) 回 false 就結束, dispose() }（props07.js）。每一次上岸只舉一次
function holdArt(v, o, d, dt) {
  if (!props7 || typeof props7.holdFish07 !== 'function' || !o.avatar) return false;
  if (!v.held && v.heldKey !== d.key) { v.heldKey = d.key; try { v.held = props7.holdFish07(o.avatar, d.fishId); } catch (e) { v.held = null; } }
  if (!v.held) return false; let go = true; try { go = v.held.update(dt) !== false; } catch (e) { go = false; } if (!go) { dropHeld(v); return false; } return true;
}
function dropHeld(v) { if (v.held) { try { v.held.dispose(); } catch (e) {} v.held = null; } }
// 水花與漣漪（水面高度上，不用 fx.js 的地面環：池底比水面低）
const rings = []; function ring(x, z, s) { const wl = waterLevel(x, z); if (!(wl > -1e8)) return; let r = rings.find(o => o.t >= o.dur); if (!r) { ensureMats(); r = { m: new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 28), mats.ring.clone()), t: 0, dur: 1 }; r.m.rotation.x = -Math.PI / 2; r.m.frustumCulled = false; W.scene.add(r.m); rings.push(r); } r.t = 0; r.dur = 0.9 + s * 0.6; r.s = s; r.m.position.set(x, wl + 0.03, z); r.m.visible = true; }
const arts = []; function splash(x, z, wl, s) { const a = props7 && art('splash', { size: s * 1.5 }); if (a && a.userData && a.userData.update) { a.position.set(x, wl, z); W.scene.add(a); arts.push({ a, t: 0 }); return; } ring(x, z, s); ring(x, z, s * 0.55); emit(x, wl + 0.05, z, Math.round(6 + s * 10), [0.85, 0.95, 1.12], 1.8 + s * 2.2, 2.2 + s * 1.5, 0.55, 9); }
function tickRings(dt) { for (let i = arts.length - 1; i >= 0; i--) { const o = arts[i]; o.t += dt; if (o.a.userData.update(o.t) === false) { W.scene.remove(o.a); if (o.a.userData.dispose) o.a.userData.dispose(); arts.splice(i, 1); } } for (const r of rings) { if (r.t >= r.dur) { r.m.visible = false; continue; } r.t += dt; const p = clamp(r.t / r.dur, 0, 1); r.m.scale.setScalar(0.15 + p * (0.8 + r.s * 1.4)); r.m.material.opacity = 0.65 * (1 - p) * (1 - p); } }

/* ---------- 自己 ---------- */
let meVis = null;
function drawMe(dt, s) {
  tickRings(dt); const me = C.me;
  if (!s) { if (meVis && !meVis.hide) { drawVis(meVis, me, null, dt); meVis.hide = true; } else if (meVis) holdPose(me.avatar, false); return; }
  if (!meVis) meVis = makeVis(); meVis.hide = false;
  drawVis(meVis, me, { st: s.st, t: s.t, k: s.k, bend: s.st === 'reel' ? s.f.T / 100 : 0, rod: s.rod, bx: s.bx, by: s.by, bz: s.bz, fishId: s.fishId || (s.f && s.f.id) || '', fishT: s.st === 'land' ? s.t : 0, run: s.st === 'reel' && s.f.run > 0, key: s.landN }, dt);
  if (s.st === 'land' && s.t < 0.05) splash(s.bx, s.bz, s.wl, 0.6);
}

/* ============================== 多人：即時狀態與其他玩家的釣具 ============================== */
// presence.fi＝[狀態, 浮標 x, 浮標 z, 數值]；不釣魚時 null。狀態：1 拿著｜2 蓄力（數值＝蓄力 0–9）｜3 浮標在水上｜4 咬鉤｜5 拉鋸（數值＝張力 0–9）｜6 舉魚（數值＝魚的編號）｜7 收線
const ST_CODE = { idle: 1, charge: 2, fly: 3, wait: 3, bite: 4, reel: 5, land: 6, back: 7 }, CODE_ST = ['', 'idle', 'charge', 'wait', 'bite', 'reel', 'land', 'back'];
const r1 = v => Math.round(v * 10) / 10;
export function pres() {
  const s = C.me.fish; if (!s) return null; const c = ST_CODE[s.st] || 1, rod = ROD_IDS.indexOf(s.rod) + 1;
  const k = c === 2 ? Math.round(s.k * 9) : c === 5 ? Math.round(s.f.T / 100 * 9) : c === 6 ? FISH_IDS.indexOf(s.fishId) : 0;
  return c === 1 || c === 2 ? [c, rod, 0, k] : [c, r1(s.bx), r1(s.bz), k, rod];
}
const rvis = new Map();
export function remote(r, dt) {
  const fi = r.lastPres && r.lastPres.fi; let v = rvis.get(r);
  if (!Array.isArray(fi) || !r.alive || typeof fi[0] !== 'number') { if (v && v.on) { drawVis(v, r, null, dt); v.on = false; } return; }
  if (!v) { v = makeVis(); v.t = 0; v.n = 0; rvis.set(r, v); } const st = CODE_ST[fi[0] | 0] || 'idle'; if (v.st !== st) { v.st = st; v.t = 0; if (st === 'land') v.n++; } v.t += dt; v.on = true;
  const rod = ROD_IDS[((fi[0] <= 2 ? fi[1] : fi[4]) | 0) - 1] || 'rod_1', k = clamp(+fi[3] || 0, 0, 99);
  let bx = r.x, bz = r.z; if (fi[0] > 2 && typeof fi[1] === 'number' && typeof fi[2] === 'number' && Math.hypot(fi[1] - r.x, fi[2] - r.z) < 30) { bx = fi[1]; bz = fi[2]; }
  v.bx = v.bx == null || v.st === 'idle' ? bx : damp(v.bx, bx, 6, dt); v.bz = v.bz == null || v.st === 'idle' ? bz : damp(v.bz, bz, 6, dt);
  const wl = waterLevel(v.bx, v.bz), by = st === 'reel' ? wl - 0.08 : st === 'bite' ? wl - 0.16 : wl > -1e8 ? wl + 0.02 + Math.sin(v.t * 2.1) * 0.012 : Hgt(v.bx, v.bz) + 0.1;
  if (st === 'bite' && v.t < dt * 1.5) splash(v.bx, v.bz, wl, 0.8); if (st === 'land' && v.t < dt * 1.5) splash(v.bx, v.bz, wl, 1);
  drawVis(v, r, { st, t: v.t, k: k / 9, bend: st === 'reel' ? k / 9 : 0, rod, bx: v.bx, by, bz: v.bz, fishId: st === 'land' ? FISH_IDS[k | 0] || '' : st === 'reel' ? 'fish_carp' : '', fishT: st === 'land' ? v.t : 0, run: st === 'reel' && k >= 8, key: v.n }, dt);
}
function sweepRemotes() { if (!rvis.size) return; for (const [r, v] of rvis) if (!C.remotes || ![...C.remotes.values()].includes(r)) { for (const o of [v.rod, v.line, v.bob, v.shadow, v.fish]) if (o) W.scene.remove(o); rvis.delete(r); } }

/* ============================== 介面與測試用 ============================== */
// 釣魚紀錄（角色面板的「釣魚紀錄」頁用）：[{ id, name, n, best, boss }]，沒釣過的 n＝0
export const records = () => FISH_IDS.map(id => { const r = P().fishRec[id] || [0, 0]; return { id, name: ITEM(id).name, n: r[0], best: r[1], boss: !!FISH[id].boss }; });
export const FISH_SPOTS07 = [      // 每處水邊的一個好站位（QA、地圖、委託卡用）：places06.js 的六個釣點＋鏡溪木橋、鏡溪下游淺灘旁
  { water: 'mirror_pond', x: 30.2, z: 117.5, f: 1.32 }, { water: 'whisper_pool', x: -137.2, z: 58.6, f: -1.31 }, { water: 'long_bay', x: 45, z: 289.4, f: 0, jetty: 1 },
  { water: 'moss_falls', x: -243.6, z: -193.4, f: -2.03 }, { water: 'quarry_lake', x: 296.2, z: -105.4, f: 1.31 }, { water: 'frost_spring', x: 139.8, z: -283.6, f: 2.01 },
  { water: 'brook', x: 52.4, z: 190.3, f: 0.0 }, { water: 'brook', x: 44.2, z: 222.0, f: 1.6 },
  { water: 'south_lake', x: -126.5, z: 475.4, f: 1.71 }, { water: 'melt_lake', x: -55.3, z: -507, f: -1.48 }, { water: 'ice_pond', x: -585.9, z: -340.5, f: 0.92 }      /* 0.8 X1：南湖（挪到湖邊）、雪融湖、霜林冰潭 */
];
export const debug = {
  get s() { return C.me.fish; }, item: id => C.ITEMS[id], evLog, pres, scan, waterAt, baitFor, pickFish, tryBoss, E1,
  bite() { const s = C.me.fish; if (s && s.st === 'wait') { s.waitT = s.t + 0.01; s.nib = []; } },
  tire(k = 0.02) { const s = C.me.fish; if (s && s.st === 'reel') s.f.S = s.f.S0 * k; },
  setT(T) { const s = C.me.fish; if (s && s.st === 'reel') s.f.T = T; },
  calm(t = 99) { const s = C.me.fish; if (s && s.st === 'reel') { s.f.surge = t; s.f.bk = t; } },
  back() { const s = C.me.fish; if (s && s.st === 'reel') s.f.bk = 0; },      // bal-d：下一格立刻回衝（測試用）
  force(id) { const s = C.me.fish; if (s) s.forceId = id; },
  takeOut: () => { const sc = scan(C.me.x, C.me.z); return sc ? takeOut(sc) : false; }, gutStart, service,
  remotes: () => [...rvis.values()].map(v => ({ on: !!v.on, st: v.st, rod: v.rod.visible, line: v.line.visible, bob: v.bob.visible, bx: v.bx, bz: v.bz, fish: !!(v.fish && v.fish.visible), held: !!v.held }))
};
