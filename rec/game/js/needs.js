// 飽食與精力（設計文件的飢餓度、疲勞度），以及營火與酒館的休息。規則見定案第 3 節與附錄 F；數字在 data06.js 的 NEEDS
// 只在野外戰鬥中消耗（me.combat，由 game.js 每幀算好）；走路、採集、逛街、離線都不扣。狀態：P.sat 飽食、P.en 精力；me.sit 正坐著的營火
import { NEEDS, NEED_NAME, NEED_TEXT } from './data06.js';

let C = null, camps = [], acc = { sat: 0, en: 0, tSat: 0, tEn: 0, ooc: 0 }, told = { sat: 3, en: 3 }, lv = { s: -1, e: -1 };
const P = () => C.P;
export function init(ctx) { C = ctx; }
export const max = () => NEEDS.base + (C.P.stats.end - 5) * NEEDS.perEnd;
export function reset() { const p = P(); p.sat = max(); p.en = max(); C.me.sit = null; acc = { sat: 0, en: 0, tSat: 0, tEn: 0, ooc: 0 }; told = { sat: 3, en: 3 }; }
export function save() { return { s: Math.round(P().sat), e: Math.round(P().en) }; }
export function load(h) { reset(); if (!h) return; const p = P(), m = max(), n = v => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(m, v)) : m); p.sat = n(h.s); p.en = n(h.e); told = { sat: level('sat'), en: level('en') }; }      // 舊存檔沒有這兩個值：都給滿

// 區間：0 見底｜1 低（lo 以下）｜2 中間｜3 高（hi 以上）
export function level(k) { const v = P()[k], m = max(); return v <= 0.5 ? 0 : v < m * NEEDS.lo ? 1 : v >= m * NEEDS.hi ? 3 : 2; }
export function add(k, n) {
  const p = P(), m = max(), a = level(k); p[k] = Math.max(0, Math.min(m, p[k] + n)); const b = level(k);
  if (a !== b) { if (b < a && b < 2 && b < told[k]) { C.ui.toast((k === 'sat' ? '飽食' : '精力') + (b ? '剩不到三成：' : '見底了：') + NEED_NAME[k][b] + '（' + NEED_TEXT[k][b] + '）。' + (k === 'sat' ? '吃點東西吧。' : '找個營火坐一下，或回城歇一會。')); C.ui.sfx('deny'); } told[k] = b; }
  return p[k];
}
export const onDeath = () => { add('en', -NEEDS.death); C.save(); };

/* ---------- 營火與酒館 ---------- */
export function setCamps(list) { camps = (list || []).map(c => ({ id: c.id, name: c.name || '營火', x: c.x, z: c.z, ph: c.ph })); }
export const campList = () => camps;
export function nearCamp(r = 3.4) { let best = null, bd = r; for (const c of camps) { const d = Math.hypot(c.x - C.me.x, c.z - C.me.z); if (d < bd) { bd = d; best = c; } } return best; }
export const campIndex = c => camps.indexOf(c);
// 坐下：脫離戰鬥才能坐。坐著每秒回精力，附近有另一位坐著的玩家時更快；移動、出手、挨打就站起來
export function sit(c) {
  const me = C.me; if (!c || !me.alive) return false; if (me.combat) { C.ui.toast('脫離戰鬥才能坐下休息'); return false; } if (me.swim || me.drink || me.atk || me.cast || me.dodge) return false;
  me.sit = c; me.sitT = 0; me.vx = me.vz = 0; me.f = Math.atan2(c.x - me.x, c.z - me.z); C.ui.sfx('sit'); C.quest('doRest'); C.quest('doRest:' + c.id); return true;
}
export function stand() { if (!C.me.sit) return; C.me.sit = null; C.save(); }
export const duo = () => { const me = C.me; if (!me.sit) return false; for (const r of C.remotes.values()) if (r.sit && Math.hypot(r.x - me.x, r.z - me.z) < NEEDS.campNear) return true; return false; };
export function tavernRest() { const p = P(); if (p.en >= max() - 0.5) { C.ui.toast('精神已經很好了'); return false; } add('en', max()); C.save(); C.ui.sfx('heal'); return true; }
export function tavernStew() {
  const p = P(); if (p.sat >= max() - 0.5) { C.ui.toast('已經吃得很飽了'); return false; } if (p.gold < NEEDS.stewFee) { C.ui.toast('金幣不夠'); C.ui.sfx('deny'); return false; }
  p.gold -= NEEDS.stewFee; add('sat', max()); C.save(); C.ui.sfx('heal'); return true;
}

/* ---------- 每幀 ---------- */
export function update(dt) {
  const p = P(), me = C.me, m = max(); if (!me.alive) return;
  if (p.sat > m) p.sat = m; if (p.en > m) p.en = m;
  { const ls = level('sat'), le = level('en'); if (ls !== lv.s || le !== lv.e) { lv.s = ls; lv.e = le; C.refresh(); } }      // 區間變了（吃了東西、配了耐力、讀檔）：重算加成
  if (me.inSafe) {      // 城裡：不消耗；飽食慢慢回到一半，精力回滿
    acc.tSat += dt; if (acc.tSat >= NEEDS.townSat[0]) { acc.tSat = 0; if (p.sat < m * NEEDS.townSat[1]) add('sat', 1); }
    acc.tEn += dt; if (acc.tEn >= NEEDS.townEn) { acc.tEn = 0; if (p.en < m) add('en', 1); }
  } else if (me.combat) {
    acc.sat += dt; if (acc.sat >= NEEDS.satTick) { acc.sat -= NEEDS.satTick; add('sat', -1); C.save(); }
    acc.en += dt * C.M().enCost; if (acc.en >= NEEDS.enTick) { acc.en -= NEEDS.enTick; add('en', -1); }
  }
  if (me.sit) {
    me.sitT += dt; if (me.combat || me.swim || Math.hypot(me.sit.x - me.x, me.sit.z - me.z) > 5) { stand(); return; }
    if (p.en < m) add('en', (duo() ? NEEDS.campDuo : NEEDS.camp) * dt);
  }
  // 吃飽：野外脫離戰鬥一陣子後慢慢回生命
  acc.ooc = me.combat ? 0 : acc.ooc + dt;
  if (!me.inSafe && level('sat') === 3 && acc.ooc >= NEEDS.oocWait && me.hp < C.D().maxHp) me.hp = Math.min(C.D().maxHp, me.hp + C.D().maxHp * NEEDS.satRegen * dt);
}
// 把飽食與精力的效果加進 m（game.js 的匯總點）
export function mods(m) {
  const s = level('sat'), e = level('en');
  if (s === 0) m.hp -= NEEDS.sat0; else if (s === 1) m.hp -= NEEDS.satLo;
  if (e === 0) m.stRegen -= NEEDS.en0; else if (e === 1) m.stRegen -= NEEDS.enLo; else if (e === 3) m.stRegen += NEEDS.enHi;
}
// 介面用
export function status() { const p = P(), m = max(), s = level('sat'), e = level('en'); return { sat: p.sat, en: p.en, max: m, satLv: s, enLv: e, satName: NEED_NAME.sat[s], enName: NEED_NAME.en[e], satText: NEED_TEXT.sat[s], enText: NEED_TEXT.en[e], sitting: !!C.me.sit, duo: duo(), rate: C.me.sit ? (duo() ? NEEDS.campDuo : NEEDS.camp) : 0 }; }
