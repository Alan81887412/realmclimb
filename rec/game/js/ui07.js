// 0.7 介面（d7-ui 介面總監）：0.7 新視窗與提示的美化（1222×789）、追蹤欄與任務日誌的委託、瑪歌的「委託板」、釣魚紀錄、地圖畫法、陷阱提示
// ui.js 在 initUI 尾端呼叫 init(H)、每幀呼叫 tick(dt)。
// H＝{ $, el, ic, iconSvg, toast, log, tip, sfx, setWin, isOpen, WINS, renderChar, renderQuests, renderTracker, dlg, dlgWin, dlgMenu, keyOf, onTick(fn) }
// 分工（每個檔只有一位成員改）：ui07f.js＝釣魚（拉鋸面板、分解魚、釣魚紀錄）＋角色面板位置｜ui07b.js＝委託板、追蹤欄與任務日誌、瑪歌｜ui07m.js＝繪圖桌、手繪地圖、抄本畫法、送圖確認框｜ui07t.js＝陷阱提示、公告位置
import * as UF from './ui07f.js';
import * as UB from './ui07b.js';
import * as UM from './ui07m.js';
import * as UT from './ui07t.js';
const ticks = [];
export function init(H) {
  H.onTick = fn => { if (typeof fn === 'function') ticks.push(fn); };
  for (const [n, m] of [['ui07f', UF], ['ui07b', UB], ['ui07m', UM], ['ui07t', UT]]) { try { if (m.init) m.init(H); } catch (e) { console.warn(n + ' 初始化失敗', e); } }
}
export function tick(dt) { for (const f of ticks) { try { f(dt); } catch (e) {} } }
