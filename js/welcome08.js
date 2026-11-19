/* 劇情組 story-fin：新角色的出生點與托比迎新。
   規則：還沒有任何進度的新角色（1 級、沒經驗、沒殺過、沒做完任務、沒聽過迎新）開始遊戲時，從南門外 (0, 52) 出生、面向北（朝南門），
   走到托比身邊（12 公尺內）時，托比說六句迎新台詞（旁白條一句一句出，第一句同時冒在托比頭上）。說過就記旗標（存在 P.b7.f.welcome8，board07 的存檔會帶），之後不再出現。
   不改 game.js：只讀寫它匯出的 me、input、P、npcs、Store、ui；由 ui08.js 的初始化迴圈接上（見 patches/ui08.js-patch.py）。
   死亡復活仍回城內原出生點 WORLD.SPAWN（沒動）。註解只用區塊註解。 */
import { input, P, me, npcs, Store, ui } from './game.js';
import { tagSay } from './actors.js';

export const WELCOME_SPOT08 = { x: 0, z: 52, f: Math.PI };
export const WELCOME_KEY08 = 'welcome8';
/* 托比的迎新台詞（六句；{name} 換成玩家名字）。口吻照角色卡：認真、守規矩、一緊張就多話，口頭禪「報告」「依規定」 */
export const TOBY_WELCOME08 = [
  '報告！南門衛兵托比，負責登記進出的人。城外聚落來的吧？鞋上的泥我認得。',
  '第一次進鐵環城？依規定我該問來意……算了，你看起來是來找路的。',
  '進城後別亂跑。最近外頭的野獸不太安分，北邊尤其。',
  '沿大路走到廣場，北邊就是競技場。去找葛倫教官，他脾氣不太好，教人的本事「還行」。',
  '競技場裡那個鐵環，可以摸，不能拆。依規定，這句話我每天要講一次。',
  '登記完畢！{name}，你是今天第一個入城的人。出城的時候，記得回來讓我改成「已返回」。'
];

let fresh = false, phase = 0;
const flagged = () => !!(P.b7 && P.b7.f && P.b7.f[WELCOME_KEY08]);
const isFresh = () => !!P.q && !flagged() && (P.lv | 0) <= 1 && !(P.exp > 0) && !(P.kills > 0) && !(Array.isArray(P.q.d) && P.q.d.length);
let lastLine = '', shown = 0;
function setFlag() { if (!P.b7 || typeof P.b7 !== 'object') return; P.b7.f = P.b7.f || {}; P.b7.f[WELCOME_KEY08] = 1; Store.dirty = true; }
/* 第六句真的在旁白條上顯示滿它的時間（2.8 秒＋每字 0.12 秒，被區域名稱打斷的不算）才設旗標；中途重整沒設旗標，下次走近托比會從頭再講 */
function finishCheck(dt) {
  const e = document.getElementById('narr');
  if (!e || !e.classList.contains('on') || e.textContent !== lastLine) return;
  shown += dt || 0;
  if (shown >= 2.8 + lastLine.length * 0.12 - 0.1) { setFlag(); phase = 4; }
}
function tick(dt) {
  if (phase === 3) { finishCheck(dt); if (phase === 3) { const g = npcs.find(o => o.id === 'guard'); if (g && Math.hypot(me.x - g.x, me.z - g.z) > 28 && typeof ui.narrDrop === 'function') { ui.narrDrop(t => typeof t === 'string' && t.indexOf('托比：「') === 0); setFlag(); phase = 4; } } return; }
  if (phase >= 2) return;
  const playing = document.body.classList.contains('playing');
  if (phase === 0) {
    if (!playing) { fresh = isFresh(); if (fresh && !input.started) { me.x = WELCOME_SPOT08.x; me.z = WELCOME_SPOT08.z; } /* N5：開始遊戲前（進場、創角畫面）新角色就站在南門外，創角背景直接是出生地，完成後不用搬 */ return; }
    if (!fresh) { phase = 2; return; }
    me.x = WELCOME_SPOT08.x; me.z = WELCOME_SPOT08.z; if (input && input.cam) input.cam.yaw = WELCOME_SPOT08.f; /* N5：朝向不在這裡單幀改（創角完成時由 main.js 的過渡轉向南門；重新整理進場時 me.f 本來就是 π） */
    phase = 1; return;
  }
  const n = npcs.find(o => o.id === 'guard'); if (!n || !me.alive) return;
  if (Math.hypot(me.x - n.x, me.z - n.z) > 12) return;
  if (!P.b7 || typeof P.b7 !== 'object') { phase = 2; return; }
  phase = 3; shown = 0;
  const lines = TOBY_WELCOME08.map(t => t.replace('{name}', P.name || '旅人'));
  lastLine = `托比：「${lines[lines.length - 1]}」`;
  if (n.tag) tagSay(n.tag, lines[0]);
  { const L = lines.map(t => `托比：「${t}」`); if (typeof ui.narrFront === 'function') ui.narrFront(L); else ui.narrate(L); }
}
export function init(h) { if (h && typeof h.onTick === 'function') h.onTick(tick); }
export const debug = { tick, state: () => ({ fresh, phase }), reset: () => { phase = 0; fresh = false; } };
