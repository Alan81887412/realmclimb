/* 0.8 X8（數值總監）執行期的數值效果。由 quest08.js 匯入（只在瀏覽器載入；node 的表格檢查只讀 data08.js）。
   ① hooks08 的 mod(k)：牛角飾（裝在手上那把、二階以上）→ immob；蟒膽劑（藥劑格）→ hold、escape。上限由 hooks08 的 capped() 套（immob、hold ≤ 30%，escape ≤ 40%），各事件各算、不合併。
   ② 稀有天賦球箱 chest_rare：使用時打開，出現戰吼、震地踏、影步其中一顆（學會的、背包裡已經有的不出現）；三顆都有了 → 出背包裡最少的那一顆（留著交易或送人）。
   game.js 只加一行：useItem 看到道具有 open8 就交給它。遊戲狀態用 game.js 的循環匯入，只在 init 之後的呼叫裡用。 */
import * as H8 from './hooks08.js';
import { ITEMS, SKILLS } from './core.js';
import { CHARMS, USE, CHARM_TIER } from './data06.js';
import { P, Ars, ui, addItem, Store } from './game.js';

export const RARE_ORBS = ['warcry', 'quake', 'blink'];

function charmFx(k) {
  try { const me = H8.ctx && H8.ctx.me; if (me && me.trial != null) return 0; const o = P.wps && P.wps[Ars.current()]; if (!o || !o.c || o.t < CHARM_TIER) return 0; const f = CHARMS[o.c] && CHARMS[o.c].fx; return (f && +f[k]) || 0; }
  catch (e) { return 0; }
}
function tonicFx(k) { const b = P && P.tonic, f = b && USE[b.id] && USE[b.id].fx; return (f && +f[k]) || 0; }
export function mod(k) { return charmFx(k) + tonicFx(k); }
H8.provide('mod', mod, 'num08');

export function openChest(id = 'chest_rare', want) {      /* 0.8 X7：want＝三顆都有時玩家在介面（ui08a 的挑選框）自己挑的那一顆；沒給照舊給最少的 */
  if (!P || !(P.inv[id] > 0)) return false;
  const orbs = RARE_ORBS.filter(k => SKILLS[k] && ITEMS['orb_' + k]);
  if (!orbs.length) return false;
  const fresh = orbs.filter(k => !P.skills.includes(k) && !(P.inv['orb_' + k] > 0));
  const pick = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : orbs.includes(want) ? want : orbs.slice().sort((a, b) => (P.inv['orb_' + a] || 0) - (P.inv['orb_' + b] || 0))[0];
  P.inv[id]--; if (P.inv[id] <= 0) delete P.inv[id];
  addItem('orb_' + pick, 1);
  const nm = ITEMS['orb_' + pick].name;
  ui.loot(fresh.length ? `打開稀有天賦球箱：${nm}` : `打開稀有天賦球箱：${nm}（三顆你都有了，這顆留著交易或送人）`, ['orb_' + pick]);
  Store.dirty = true; ui.dirty = true; return true;
}
if (ITEMS.chest_rare) ITEMS.chest_rare.open8 = openChest;
