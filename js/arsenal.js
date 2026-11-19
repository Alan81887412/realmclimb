// 武器架、整備（四階）、獸飾、披肩、熔掉、競技場試用。規則見 design06/0.6 設計定案.md 第 5 節與附錄 D、E；數字在 data06.js
// 狀態放在 P 上：P.wps = { 武器編號: { t 階級, c 獸飾代號或 '', hm 哪幾階是用減半的素材做的（位元）, d1 一階用了幾張鹿皮 } }、P.td 哪幾階已經在任何一把上做過（位元）、P.cloak 穿著的披肩代號或 ''
// 手上那把的編號就是外觀字串裡的 wp（P.look）；競技場試用的武器只改畫面上的外觀（me.trial），不進存檔
import { ORDER, SWAP_TIME, PELT_ANY, TIERS, TIER_MAX, CHARM_TIER, CHARMS, CHARM_IDS, CHARM_FEE, MELT_BACK, CLOAKS, CLOAK_IDS } from './data06.js';
import { SUB08 } from './data08.js';      /* 0.8 X8：抵用素材 */

let C = null, WEAPONS = [], arenaR = [9.6, 17];
const P = () => C.P, inv = id => C.P.inv[id] || 0;
export const WP_N = 12;
export function init(ctx, weapons, arena) { C = ctx; WEAPONS = weapons; if (arena) arenaR = arena; }
export function reset() { const p = P(); p.wps = {}; p.td = 0; p.cloak = ''; C.me.trial = null; }
export const wpName = wp => (WEAPONS[wp] || {}).name || '武器';

/* ---------- 存檔 ---------- */
export function save() { const p = P(); return { w: Object.keys(p.wps).map(k => { const o = p.wps[k]; return [+k, o.t, o.c ? CHARM_IDS.indexOf(o.c) + 1 : 0, o.hm || 0, o.d1 || 0]; }), td: p.td, ck: p.cloak ? CLOAK_IDS.indexOf(p.cloak) + 1 : 0 }; }
// h：存檔裡的 h6（沒有＝0.5a 的舊存檔）；wp：外觀裡拿著的那把。舊存檔只留手上那把，階級 0
export function load(h, wp) {
  reset(); const p = P(), int = (v, lo, hi) => Math.max(lo, Math.min(hi, (typeof v === 'number' && isFinite(v) ? v : 0) | 0));
  if (h && Array.isArray(h.w)) for (const a of h.w) { if (!Array.isArray(a)) continue; const k = int(a[0], -1, WP_N - 1); if (k < 0 || p.wps[k]) continue; const t = int(a[1], 0, TIER_MAX), c = CHARM_IDS[int(a[2], 0, CHARM_IDS.length) - 1] || ''; p.wps[k] = { t, c: t >= CHARM_TIER ? c : '', hm: int(a[3], 0, 31), d1: int(a[4], 0, 3) }; }
  if (h) { p.td = int(h.td, 0, 63);      /* X8：五階 */ for (const k in p.wps) for (let i = 1; i <= p.wps[k].t; i++) p.td |= 1 << i; const ck = CLOAK_IDS[int(h.ck, 0, CLOAK_IDS.length) - 1]; p.cloak = ck && inv(ck) > 0 ? ck : ''; }
  if (wp != null && !p.wps[wp] && (!h || !Object.keys(p.wps).length)) p.wps[wp] = { t: 0, c: '', hm: 0, d1: 0 };      // 舊存檔（或壞掉的新存檔）：手上那把一定在
}

/* ---------- 查詢 ---------- */
export const has = wp => !!P().wps[wp];
export const count = () => Object.keys(P().wps).length;
export const current = () => C.lookWp();
export const shown = () => (C.me.trial != null ? C.me.trial : current());
export const tierOf = wp => (P().wps[wp] ? P().wps[wp].t : 0);
export const charmOf = wp => (P().wps[wp] ? P().wps[wp].c : '');
export const owned = () => Object.keys(P().wps).map(Number).sort((a, b) => a - b).map(wp => ({ wp, name: wpName(wp), t: P().wps[wp].t, c: P().wps[wp].c, cur: wp === current() }));
export const tierDmg = t => (t > 0 ? TIERS[t].dmg : 0);
// 創角選的第一把：免費
export function claimFirst(wp) { if (count()) return false; P().wps[wp] = { t: 0, c: '', hm: 0, d1: 0 }; C.save(); return true; }

/* ---------- 換武器 ---------- */
export function canSwap(wp) {
  const me = C.me; if (!has(wp)) return '還沒有這把武器'; if (wp === current() && me.trial == null) return '已經拿在手上了';
  if (!me.alive) return '倒下了'; if (me.combat) return '脫離戰鬥才能換武器'; if (me.swim) return '游泳中不能換武器'; if (me.drink || me.atk || me.cast || me.dodge || me.rush) return '現在騰不出手';
  return '';
}
// 脫離戰鬥才能換；換的動作 SWAP_TIME 秒，被打中會中斷
export function swap(wp) {
  const why = canSwap(wp); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  C.busy('swap', SWAP_TIME, '換武器中', () => equipNow(wp)); C.ui.sfx('equip'); return true;
}
export function equipNow(wp) { if (!has(wp)) return false; C.me.trial = null; C.setWp(wp); C.refresh(); C.save(); C.quest('doSwap'); C.ui.log(`換上了${wpName(wp)}` + (tierOf(wp) ? `（${TIERS[tierOf(wp)].name}）` : '') + '。'); return true; }

/* ---------- 競技場試用：12 種都能拿，走出競技場自動換回自己的 ---------- */
export const inArena = () => Math.hypot(C.me.x, C.me.z) < arenaR[0];
export function trial(wp) {
  if (!inArena()) { C.ui.toast('要在競技場的場地裡才能試用'); return false; } if (C.me.combat || C.me.drink || C.me.atk || C.me.cast) return false;
  C.me.trial = wp === current() ? null : wp; C.applyLook(); C.refresh(); C.ui.sfx('equip'); C.ui.toast(C.me.trial == null ? '換回自己的武器' : `試用${wpName(wp)}：只能在競技場裡用，走出去會換回自己的。`); return true;
}
export function endTrial(quiet) { if (C.me.trial == null) return; C.me.trial = null; C.applyLook(); C.refresh(); if (!quiet) C.ui.toast('離開競技場，試用的武器還回架上了。'); }
export function update() { if (C.me.trial != null && Math.hypot(C.me.x, C.me.z) > arenaR[1] + 0.5) endTrial(); }

/* ---------- 素材檢查（pelt＝鹿皮或狼皮，先用鹿皮） ---------- */
const haveOf = id => (id === 'pelt' ? PELT_ANY.reduce((s, k) => s + inv(k), 0) : inv(id) + (SUB08[id] || []).reduce((s, [k, w]) => s + inv(k) * w, 0));      /* X8：抵用素材也算 */
const nameOf = id => (id === 'pelt' ? '鹿皮或狼皮' : C.ITEMS[id].name);
// 回傳 [[代號, 名稱, 需要, 持有]]
export const matRows = mats => Object.keys(mats).map(id => [id, nameOf(id), mats[id], haveOf(id)]);
const enough = mats => Object.keys(mats).every(id => haveOf(id) >= mats[id]);
function pay(mats) { let deer = 0; for (const id in mats) { let n = mats[id]; if (id === 'pelt') for (const k of PELT_ANY) { const u = Math.min(n, inv(k)); if (u) { C.take(k, u); if (k === 'pelt_deer') deer = u; n -= u; } } else { let n2 = n; const u = Math.min(n2, inv(id)); if (u) { C.take(id, u); n2 -= u; } for (const [k, w] of SUB08[id] || []) { if (n2 <= 0) break; const c = Math.min(inv(k), Math.ceil(n2 / w)); if (c) { C.take(k, c); n2 -= c * w; } } } }      /* X8：先用本來的素材，不夠再用抵用的 */ return deer; }

/* ---------- 訂做 ---------- */
export function orderCheck(wp) { return has(wp) ? '已經有這把了' : P().gold < ORDER.fee ? '金幣不夠' : !enough(ORDER.mats) ? '素材不夠' : ''; }
export function order(wp) {
  const why = orderCheck(wp); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  P().gold -= ORDER.fee; pay(ORDER.mats); P().wps[wp] = { t: 0, c: '', hm: 0, d1: 0 }; C.save(); C.quest('doOrder'); C.ui.sfx('forge'); C.ui.loot(`布蘿娜打好了一把${wpName(wp)}，放上你的武器架。`); return true;
}

/* ---------- 整備：必定成功。這一階在任何一把上做過，之後素材減半（工錢照付） ---------- */
export function upgradeInfo(wp) {
  const o = P().wps[wp]; if (!o) return null; if (o.t >= TIER_MAX) return { max: true, tier: o.t };
  const tier = o.t + 1, T = TIERS[tier], half = !!(P().td >> tier & 1), mats = half ? T.half : T.mats, show = (T.show || []).map(id => [id, C.ITEMS[id].name, inv(id) > 0]);
  const why = show.some(s => !s[2]) ? '要先集滿三件菁英的戰利品' : !enough(mats) ? '素材不夠' : P().gold < T.fee ? '金幣不夠' : '';
  return { tier, name: T.name, dmg: T.dmg, fee: T.fee, half, mats: matRows(mats), show, slot: !!T.slot, why };
}
export function upgrade(wp) {
  const I = upgradeInfo(wp); if (!I || I.max) return false; if (I.why) { C.ui.toast(I.why); C.ui.sfx('deny'); return false; }
  const o = P().wps[wp], T = TIERS[I.tier], deer = pay(I.half ? T.half : T.mats); P().gold -= T.fee;
  o.t = I.tier; if (I.half) o.hm |= 1 << I.tier; if (I.tier === 1) o.d1 = deer; P().td |= 1 << I.tier;
  C.refresh(); C.save(); C.quest('doTier'); C.quest('doTier:' + I.tier); C.ui.sfx('forge'); C.ui.loot(`${wpName(wp)}整備到${'一二三四五'[I.tier - 1]}階「${T.name}」：傷害 +${Math.round(T.dmg * 100)}%` + (T.slot ? '，可以裝獸飾了。' : '。')); return true;
}
// 這一把到目前為止用掉的強化素材（熔掉時返還三分之一）
export function usedMats(wp) {
  const o = P().wps[wp], out = {}; if (!o) return out;
  for (let i = 1; i <= o.t; i++) { const m = o.hm >> i & 1 ? TIERS[i].half : TIERS[i].mats; for (const id in m) { if (id === 'pelt') { const d = Math.min(o.d1 || 0, m[id]); if (d) out.pelt_deer = (out.pelt_deer || 0) + d; if (m[id] - d) out.pelt_wolf = (out.pelt_wolf || 0) + m[id] - d; } else out[id] = (out[id] || 0) + m[id]; } }
  return out;
}

/* ---------- 熔掉：返還這一把用過的強化素材的三分之一（無條件捨去，每種至少 1 個）；工錢不退；獸飾先拆下 ---------- */
export function meltBack(wp) { const u = usedMats(wp), out = {}; for (const id in u) out[id] = Math.max(1, Math.floor(u[id] * MELT_BACK)); return out; }
export function meltCheck(wp) { return !has(wp) ? '沒有這把武器' : count() <= 1 ? '這是你唯一的武器' : wp === current() ? '拿在手上的不能熔，先換成別把' : ''; }
export function melt(wp) {
  const why = meltCheck(wp); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  const back = meltBack(wp), o = P().wps[wp], got = []; if (o.c) { C.addItem(o.c, 1); got.push(C.ITEMS[o.c].name + '（拆下）'); }
  for (const id in back) { C.addItem(id, back[id]); got.push(C.ITEMS[id].name + ' ×' + back[id]); }
  delete P().wps[wp]; C.save(); C.quest('doMelt'); C.ui.sfx('forge'); C.ui.loot(`布蘿娜把${wpName(wp)}熔掉了` + (got.length ? '，還給你：' + got.join('、') : '（沒有用過強化素材，沒有東西可以還）') + '。'); return true;
}

/* ---------- 獸飾：做出來是背包裡的道具；裝上不收錢，從武器上拆下來收拆裝費 ---------- */
export function charmCheck(id) { const K = CHARMS[id]; return !K ? '?' : P().gold < CHARM_FEE.make ? '金幣不夠' : !enough(K.mats) ? '素材不夠' : ''; }
export function makeCharm(id) {
  const why = charmCheck(id); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  P().gold -= CHARM_FEE.make; pay(CHARMS[id].mats); C.addItem(id, 1); C.quest('doCharm'); C.ui.sfx('forge'); C.ui.loot('布蘿娜做好了' + C.ITEMS[id].name + '。', [id]); return true;
}
export function setCharmCheck(wp, id) { const o = P().wps[wp]; return !o ? '沒有這把武器' : o.t < CHARM_TIER ? '要整備到二階「鑲牙」才有獸飾格' : o.c ? '這把已經裝了獸飾，先拆下來' : !(inv(id) > 0) ? '背包裡沒有這個獸飾' : ''; }
export function setCharm(wp, id) {
  const why = setCharmCheck(wp, id); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  C.take(id, 1); P().wps[wp].c = id; C.refresh(); C.save(); C.ui.sfx('forge'); C.ui.log(`${C.ITEMS[id].name}裝上了${wpName(wp)}。`); return true;
}
export function removeCharm(wp) {
  const o = P().wps[wp]; if (!o || !o.c) return false; if (P().gold < CHARM_FEE.move) { C.ui.toast('金幣不夠（拆裝費 ' + CHARM_FEE.move + ' 金）'); C.ui.sfx('deny'); return false; }
  P().gold -= CHARM_FEE.move; C.addItem(o.c, 1); C.ui.log(`布蘿娜把${C.ITEMS[o.c].name}從${wpName(wp)}上拆了下來。`); o.c = ''; C.refresh(); C.save(); C.ui.sfx('forge'); return true;
}

/* ---------- 披肩：哈根做，做出來是背包裡的道具；一次穿一件 ---------- */
export function cloakCheck(id) { const K = CLOAKS[id]; return !K ? '?' : inv(id) > 0 ? '已經有了' : P().gold < K.fee ? '金幣不夠' : !enough(K.mats) ? '素材不夠' : ''; }
export function makeCloak(id) {
  const why = cloakCheck(id); if (why) { C.ui.toast(why); C.ui.sfx('deny'); return false; }
  P().gold -= CLOAKS[id].fee; pay(CLOAKS[id].mats); C.addItem(id, 1); C.quest('doCloak'); C.ui.sfx('forge'); C.ui.loot('哈根縫好了' + C.ITEMS[id].name + '。', [id]); wearCloak(id); return true;
}
export function wearCloak(id) {
  if (id && !(inv(id) > 0)) return false; if (C.me.combat) { C.ui.toast('脫離戰鬥才能換披肩'); return false; }
  P().cloak = P().cloak === id ? '' : id || ''; C.applyLook(); C.refresh(); C.save(); C.ui.sfx('equip'); C.ui.log(P().cloak ? '披上了' + C.ITEMS[P().cloak].name + '。' : '把披肩收起來了。'); return true;
}

/* ---------- 數值加成與外觀 ---------- */
// 把這個模組的加成加進 m（game.js 的匯總點）。試用中的武器沒有階級與獸飾
export function mods(m) {
  const o = C.me.trial == null ? P().wps[current()] : null;
  if (o) { m.dmg *= 1 + tierDmg(o.t); const f = o.c && o.t >= CHARM_TIER ? CHARMS[o.c].fx : null; if (f) { m.heavy += f.heavy || 0; m.act += f.act || 0; m.crit += f.crit || 0; } }
  const K = CLOAKS[P().cloak]; if (K) { m.dr += K.dr; m.enCost *= K.en; }
}
// 畫面上的外觀：手上的武器（或試用中的）、穿著的披肩。披肩模型還沒做之前，借用現有披風的款式與顏色
export function lookMods(l, placeholder) { l.wp = shown(); const K = CLOAKS[P().cloak]; if (K && placeholder) { l.cape = K.cape; l.cc = K.cc; } return l; }      // placeholder：角色模型還不支援 setGear（美術的 actors.js 還沒合併）時才借用披風
// 給其他玩家與美術用的裝備代碼：披肩階（0–3）＋武器階（0–4）×4＋獸飾（0–3）×20
export function gearCode() { const o = C.me.trial == null ? P().wps[current()] : null, K = CLOAKS[P().cloak]; return (K ? K.tier : 0) + (o ? Math.min(4, o.t) : 0) * 4 + (o && o.c ? CHARM_IDS.indexOf(o.c) + 1 : 0) * 20; }
// 解開成 { tier, charm, pelt, cloak }：tier 武器階級、charm 獸飾代號、pelt 披肩代號（美術的 Avatar.setGear 吃這三個）、cloak 披肩階
export const gearOf = code => ({ cloak: code % 4, pelt: CLOAK_IDS[code % 4 - 1] || '', tier: Math.floor(code / 4) % 5, charm: CHARM_IDS[Math.floor(code / 20) % 4 - 1] || '' });
