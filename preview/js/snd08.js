/* 0.8 X11（音效）：新野獸與菁英的招式聲。不改玩法的檔：每一幀看一次野獸的狀態（st）與招式（M），出招或預備的那一刻送 ui.sfx('move7', 種類, { x, z, tag })。
   對照在 audio-index.json 的 events（move7/<種類>/<招式短名>[/hit][/elite]）。叫聲（growl／strike／stagger／die／flee）還是 game.js 的 monSfx／onMonState 送的，這裡不重複。
   用法：main.js 的 updateAudio 每幀呼叫 SND08.tick(dt, mons, me, ui.sfx)。壞掉一律吞掉，不影響遊戲。
   招式短名：monkey 的 steal（伸手偷）、tug（扯披肩）｜porc 的 quill（豎刺，預備時）、burst（噴刺環）、back（倒衝）｜croc 的 lunge、grab、roll｜ape 的 beat（捶胸）、rock（拔石，預備時）、grab（抓舉、雙抓）｜ibex 的 ram、butt｜dog（獄卒長）的 whip、muzzle。
   額外標籤：hit＝猴子出手時玩家就在 4 公尺內（多半偷得到，加竊笑）；elite＝菁英個體（巨鱷、白背、斷崖角、獄卒長…）。獄卒長另有 elite/warden（發現玩家）與 elite/warden/walk（走動時的鐵鍊鑰匙聲，約每秒一次）。 */
import { MOVES, MST } from './core.js';
const NEW = new Set(['monkey', 'porc', 'croc', 'ape', 'ibex', 'dog']);
/* 招式 → [時機 s 出招｜w 預備, 短名] */
const SND = { monkey_steal: ['s', 'steal'], monkey_tug: ['s', 'tug'], porc_quill: ['w', 'quill'], porc_burst: ['s', 'burst'], porc_back: ['s', 'back'], croc_lunge: ['s', 'lunge'], croc_grab: ['s', 'grab'], croc_roll: ['s', 'roll'],
  ape_beat: ['s', 'beat'], ape_rock: ['w', 'rock'], ape_grab: ['s', 'grab'], ape_grab2: ['s', 'grab'], ibex_ram: ['s', 'ram'], ibex_ram1: ['s', 'ram'], ibex_ram2: ['s', 'ram'], ibex_butt: ['s', 'butt'], dog_whip: ['s', 'whip'], dog_muzzle: ['s', 'muzzle'] };
let REV = null, revN = 0;
const rev = () => { const n = Object.keys(MOVES).length; if (!REV || n !== revN) { REV = new Map(); revN = n; for (const k in SND) if (MOVES[k]) REV.set(MOVES[k], k); } return REV; };
const seen = new WeakMap();
export const stats = { calls: 0, last: null };
export function tick(dt, mons, me, sfx) {
  if (!mons || !me || typeof sfx !== 'function') return;
  const R = rev();
  for (const v of mons) {
    if (!v || !NEW.has(v.type) || v.st === MST.DEAD) continue;
    const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz); let r = seen.get(v); if (!r) { r = { st: v.st, M: v.M, wt: 0, px: v.x, pz: v.z }; seen.set(v, r); }
    if (d > 70) { r.st = v.st; r.M = v.M; continue; }
    const at = { x: v.x, z: v.z };
    if (r.st !== v.st || r.M !== v.M) {
      const k = (v.st === MST.STRIKE || v.st === MST.WIND) && v.M ? R.get(v.M) : null, e = k ? SND[k] : null;
      if (e && ((e[0] === 's' && v.st === MST.STRIKE) || (e[0] === 'w' && v.st === MST.WIND))) {
        const tag = [e[1]]; if (k === 'monkey_steal' && d < 4) tag.push('hit'); if (v.elite) tag.push('elite');
        sfx('move7', v.type, Object.assign({ tag }, at)); stats.calls++; stats.last = v.type + '/' + tag.join('/');
      }
      if (v.elite && v.drop === 'trophy_warden' && r.st === MST.IDLE && (v.st === MST.CHASE || v.st === MST.WARN)) sfx('elite', 'warden', at);
    }
    if (v.elite && v.drop === 'trophy_warden') { const mv = Math.hypot(v.x - r.px, v.z - r.pz); if (mv > 0.012 && d < 45 && v.st !== MST.STAGGER) { r.wt += dt; if (r.wt > 0.95) { r.wt = 0; sfx('elite', 'warden', Object.assign({ tag: 'walk' }, at)); } } }
    r.px = v.x; r.pz = v.z; r.st = v.st; r.M = v.M;
  }
}
