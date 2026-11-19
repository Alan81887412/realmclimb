// 0.7 介面（d7-ui-t）：陷阱的提示（夾住／拆除的面板、第一次看到的標記與提示）
// 掛鉤（都在 traps07.js 的 deco，補丁 traps07.js-patch.py 只加四個小地方）：
//   deco.hud(held, disarm, K)  每幀由 traps07 的 hud() 呼叫；回傳 true＝畫面由這裡畫（原本的小面板不建立）
//   deco.press()               夾住時每按一下互動鍵
//   deco.see(trap)             第一次看到一個陷阱（教學夾子不會呼叫）
// 提示框的文字（trap7see／trap7held／trap7bell）在這裡換成短而有結構的版本：包住 ui.tip，照代號換字，traps07.js 裡原本的字不再顯示
import { project } from './fx.js';
import { Hgt } from './world.js';
import { ui } from './game.js';
import * as Traps from './traps07.js';

let H = null, panel = null, U = null, mark = null, mk = null;
const JAW_SVG = '<svg viewBox="0 0 26 26"><path d="M3 15 A10 10 0 0 1 23 15" fill="none" stroke="#d8d1c2" stroke-width="2.4"/><path d="M3 15 A10 10 0 0 0 23 15" fill="none" stroke="#9a9488" stroke-width="2.4"/><path d="M6 13l1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3" fill="none" stroke="#efe9db" stroke-width="1.2"/><circle cx="13" cy="15" r="2.2" fill="#b0683a"/></svg>';
const BELL_SVG = '<svg viewBox="0 0 26 26"><path d="M2 20 Q13 14 24 20" fill="none" stroke="#c9b48a" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M13 4v5" stroke="#a89a78" stroke-width="1.4"/><path d="M8.5 16 Q8.5 9 13 9 Q17.5 9 17.5 16 Z" fill="#d6a948" stroke="#8a6a24" stroke-width="1"/><circle cx="13" cy="18" r="1.7" fill="#8a6a24"/></svg>';

const CSS = `
body #trap7{left:50%;bottom:174px;transform:translateX(-50%);width:372px;box-sizing:border-box;padding:9px 14px 10px;border-radius:7px;background:var(--panel,rgba(30,24,18,.88));border:1px solid var(--brass-dark,#8a6f3a);border-top:2px solid var(--brass,#c9a35a);box-shadow:0 6px 18px rgba(0,0,0,.5);opacity:0;transition:opacity .14s;z-index:6}
body #trap7.on{opacity:1}
body.talking #trap7{opacity:0!important}
body #trap7 .t7h{display:flex;align-items:center;gap:10px}
body #trap7 .t7ic{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:6px;background:rgba(0,0,0,.34);border:1px solid var(--line-strong,#6a5a44)}
body #trap7 .t7ic svg{width:26px;height:26px}
body #trap7 .t7m{flex:1;min-width:0}
body #trap7 .t7t{display:block;font-family:var(--font-display);font-size:15.5px;font-weight:700;letter-spacing:.08em;line-height:1.25;color:var(--ink,#ece5d2)}
body #trap7 .t7k{display:flex;align-items:center;gap:7px;margin-top:3px;font-size:13px;color:var(--ink,#ece5d2)}
body #trap7 .t7k kbd{min-width:30px;height:26px;padding:0 7px;box-sizing:border-box;font:700 15px/22px var(--font-body);color:var(--brass-light,#e6c98a);border-color:var(--brass,#c9a35a);border-bottom-width:3px;background:rgba(201,163,90,.14);transition:transform .06s}
body #trap7 .t7k kbd.press{animation:t7press .16s ease-out}
body #trap7 .t7n{flex:none;min-width:64px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:var(--ink-dim,#b4ad9a)}
body #trap7 .t7n em{font:700 20px/1 var(--font-display);font-style:normal;color:var(--brass-light,#e6c98a)}
body #trap7 .t7bar{position:relative;height:9px;margin:9px 0 0;border-radius:4px;background:rgba(0,0,0,.55);border:1px solid rgba(0,0,0,.7);box-shadow:0 0 0 1px var(--line,#4a4030);overflow:hidden}
body #trap7 .t7bar i{position:absolute;inset:0;transform-origin:left center;background:linear-gradient(#f6c273,#d98a2e)}
body #trap7 .t7bar i.hit{animation:t7hit .2s ease-out}
body #trap7 small{display:block;margin-top:7px;font-size:11.5px;line-height:1.5;color:var(--ink-dim,#b4ad9a)}
@keyframes t7press{0%{transform:translateY(2px) scale(.84)}60%{transform:scale(1.08)}}
@keyframes t7hit{0%{filter:brightness(1.7)}}
/* 夾住、拆除時：互動提示（#prompt）不再重複同一句，也不會跑出別的互動提示 */
body.trap7on #prompt{opacity:0!important}
/* 第一次看到陷阱：世界座標上的小卡（只第一次） */
body #trap7mark{left:0;top:0;z-index:4;opacity:0;will-change:transform}
body #trap7mark .t7c{display:flex;align-items:center;gap:7px;padding:5px 11px 5px 6px;border-radius:5px;background:var(--panel,rgba(30,24,18,.9));border:1px solid var(--brass,#c9a35a);box-shadow:0 3px 10px rgba(0,0,0,.5);white-space:nowrap;font-size:13px;color:var(--ink,#ece5d2)}
body #trap7mark .t7c svg{width:22px;height:22px;flex:none}
body #trap7mark .t7c b{font-family:var(--font-display);font-weight:700;letter-spacing:.06em}
body #trap7mark .t7c span{color:var(--brass-light,#e6c98a)}
body #trap7mark::after{content:"";display:block;width:0;height:0;margin:0 auto;border:6px solid transparent;border-top-color:var(--brass,#c9a35a);border-bottom:0}
/* 提示框的文字分行（只有這三則有換行字元，其他提示不受影響） */
body #tip span{white-space:pre-line}
`;

// 提示框文字：短、有結構
const TIPS = () => {
  const E = H.keyOf('interact');
  return {
    trap7see: '舊陷阱：翻過的土與鐵光＝捕獸夾，繩子反光＝絆索。\n紅布木樁＝15 公尺內有一個。看到就繞過去，學會拆以前別碰。',
    trap7held: `被舊捕獸夾夾住：幾秒內不能走、不能閃避，可以攻擊、格擋、喝藥。\n連按 ${E} 掙脫得快一點；隊友走過來按 ${E} 能直接幫你掰開。`,
    trap7bell: '絆到舊絆索了：鈴聲會把附近的野獸引過來。\n繩子在小腿高度，靠近會看到反光；從繩子的一端繞過去就好。',
  };
};

function buildPanel() {
  panel = H.el('div', 'hud'); panel.id = 'trap7';
  panel.innerHTML = '<div class="t7h"><span class="t7ic"></span><div class="t7m"><b class="t7t"></b><div class="t7k"><kbd></kbd><span class="t7kl"></span></div></div><div class="t7n"><em></em> 秒</div></div><div class="t7bar"><i></i></div><small></small>';
  document.body.appendChild(panel);
  U = { ic: panel.querySelector('.t7ic'), t: panel.querySelector('.t7t'), kbd: panel.querySelector('kbd'), kl: panel.querySelector('.t7kl'), n: panel.querySelector('.t7n em'), bar: panel.querySelector('.t7bar i'), s: panel.querySelector('small'), mode: '', on: false, txt: '' };
}
const set = (e, v) => { if (e.textContent !== v) e.textContent = v; };

// 夾住／拆除的面板（traps07 的 hud() 每幀呼叫）
function hud(h, k, K) {
  if (!panel) buildPanel();
  const E = H.keyOf('interact'); let mode = h ? 'held' : k ? (k.jaw ? 'jaw' : 'bell') : '';
  if (mode !== U.mode) {
    U.mode = mode;
    if (mode) {
      U.ic.innerHTML = mode === 'bell' ? BELL_SVG : JAW_SVG; set(U.kbd, E);
      if (mode === 'held') { set(U.t, '被舊捕獸夾夾住了'); set(U.kl, '連按掙脫'); set(U.s, `可以攻擊、格擋、喝藥｜隊友走過來按 ${E} 能直接幫你掰開`); }
      else { set(U.t, mode === 'jaw' ? '拆下舊捕獸夾…' : '割斷舊絆索…'); set(U.kl, '按住不放'); set(U.s, '放開、走動或受傷都會中斷'); }
    }
  }
  if (h) { const left = Math.max(0, h.left - h.t); set(U.n, left.toFixed(1)); U.bar.style.transform = `scaleX(${Math.min(1, left / Math.max(0.01, K.hold || 2)).toFixed(3)})`; }
  else if (k) { set(U.n, Math.max(0, k.dur - k.t).toFixed(1)); U.bar.style.transform = `scaleX(${Math.min(1, k.t / Math.max(0.01, k.dur)).toFixed(3)})`; }
  const on = !!mode; if (on !== U.on) { U.on = on; panel.classList.toggle('on', on); document.body.classList.toggle('trap7on', on); }
  return true;
}
// 連按回饋：鍵帽縮一下、條亮一下
function press() {
  if (!U) return;
  for (const [e, c] of [[U.kbd, 'press'], [U.bar, 'hit']]) { e.classList.remove(c); void e.offsetWidth; e.classList.add(c); }
}

// 第一次看到陷阱：小卡跟著陷阱，約 4 秒淡出。只有「提示還沒出現過」的第一次
function firstEver() { try { const s = JSON.parse(localStorage.getItem('wanshou-settings-v2') || '{}'); return !(s.tips && s.tips.trap7see); } catch (e) { return true; } }
function see(t) {
  if (!firstEver()) return;
  if (!mark) { mark = H.el('div', 'hud'); mark.id = 'trap7mark'; document.body.appendChild(mark); }
  const jaw = t.k === 'jaw';
  mark.innerHTML = `<div class="t7c">${jaw ? JAW_SVG : BELL_SVG}<b>${jaw ? '捕獸夾' : '絆索鈴'}</b><span>— 繞過去</span></div>`;
  mk = { t, age: 0 }; void mark.offsetWidth;
}
function markTick(dt) {
  if (!mk) return; mk.age += dt; const a = mk.age, LIFE = 4.2;
  if (a > LIFE) { mk = null; mark.style.opacity = '0'; return; }
  const t = mk.t, p = project(t.x, Hgt(t.x, t.z) + 1.7, t.z);
  if (!p) { mark.style.opacity = '0'; return; }
  const op = Math.min(1, a / 0.3, (LIFE - a) / 0.8), w = mark.offsetWidth || 150, x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, p[0])), y = Math.max(70, p[1]);
  mark.style.opacity = op.toFixed(2); mark.style.transform = `translate(${(x - w / 2).toFixed(1)}px,${(y - (mark.offsetHeight || 40)).toFixed(1)}px)`;
}

export function init(h) {
  H = h; const st = document.createElement('style'); st.id = 'ui07t-css'; st.textContent = CSS; document.head.appendChild(st);
  Traps.deco.hud = hud; Traps.deco.press = press; Traps.deco.see = see;
  const orig = ui.tip; ui.tip = (id, text) => orig.call(ui, id, TIPS()[id] || text);      // 照代號換字（別的提示照舊）
  H.onTick(markTick);
}
