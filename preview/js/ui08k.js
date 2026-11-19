/* 0.8 介面（X7／R6）：猴子偷走的東西——託管小清單。
   資料：ui08 的 D.custody()（＝beastai08a 的 custody()＝託管帳本 list()：[{ item, n, pending }]）、D.claim()（＝帳本 claim()：放得下的領回背包）。
   規則（theft08.js）：猴子抱著東西跑時，打倒牠、牠跑掉（離開 60 公尺或不再抱著）、或 300 秒到期都會原樣還你；背包放不下的留在託管（pending），騰出空間後每 3 秒自動再試，也可以按「領回」。
   帳本沒有給剛被偷的時間，所以倒數是介面自己記的：第一次看到這一筆就開始算（每 0.25 秒看一次，誤差在 0.25 秒內）。
   版面：畫面右下（右 22、底 126），在 #bottom（中間的技能列）右邊、#feed（右側紀錄）下面；送圖的確認框 #gift7 出現時往上讓。1222×789 不擋 HUD。
   註解只用區塊註解。 */
import { ITEMS } from './core.js';
const HOLD = 300;      /* 託管最久幾秒（theft08 THEFT.holdSec） */
const CSS = `
body #k8box{position:fixed;right:22px;bottom:126px;width:252px;box-sizing:border-box;z-index:6;padding:8px 11px 9px;border-radius:7px;border:1px solid var(--brass-dark);border-top:2px solid #b98a4a;background:rgba(20,22,18,.9);box-shadow:0 5px 14px rgba(0,0,0,.45);pointer-events:auto;font-size:12.5px;color:var(--ink)}
body #k8box[hidden]{display:none} body.talking #k8box{opacity:0;pointer-events:none}
body #k8box.up{bottom:250px}
body #k8box h5{display:flex;align-items:center;gap:6px;margin:0 0 6px;font:700 13px/1.2 var(--font-display);letter-spacing:.08em;color:var(--brass-light)} body #k8box h5 svg{width:16px;height:16px;flex:none}
body #k8box h5 small{margin-left:auto;font:400 11px/1.2 var(--font-body,inherit);letter-spacing:0;color:var(--ink-faint)}
body #k8box .r{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:7px;padding:3px 0;border-top:1px solid var(--line)}
body #k8box .r .ic{width:24px;height:24px} body #k8box .r b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} body #k8box .r b i{font-style:normal;color:var(--ink-dim)}
body #k8box .r small{display:block;font-size:11px;color:var(--ink-dim)} body #k8box .r small.w{color:var(--warn)}
body #k8box .r em{font-style:normal;font-variant-numeric:tabular-nums;color:#e6c890;font-size:12px}
body #k8box .r button{padding:2px 8px;font-size:12px}
body #k8box p{margin:6px 0 0;font-size:11px;line-height:1.5;color:var(--ink-faint)}
`;
const MONKEY = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.6" r="5.6" fill="#8a6a48" stroke="#1c140c" stroke-width="1.1"/><circle cx="2.6" cy="7.6" r="1.8" fill="#c9a27a" stroke="#1c140c" stroke-width="1"/><circle cx="13.4" cy="7.6" r="1.8" fill="#c9a27a" stroke="#1c140c" stroke-width="1"/><ellipse cx="8" cy="10" rx="3.6" ry="3" fill="#e6c9a0"/><circle cx="6.4" cy="8" r=".8" fill="#1c140c"/><circle cx="9.6" cy="8" r=".8" fill="#1c140c"/><path d="M6.8 11.2q1.2.8 2.4 0" fill="none" stroke="#1c140c" stroke-width=".9" stroke-linecap="round"/></svg>';
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
let H = null, D = null, box = null, acc = 0, sig = '';
const seen = new Map();      /* 'item#第幾筆' → 第一次看到的時間（毫秒） */
const nameOf = id => (ITEMS[id] && ITEMS[id].name) || id;
export function init(h, d) {
  H = h; D = d; if (document.getElementById('k8css')) return;
  const st = el('style'); st.id = 'k8css'; st.textContent = CSS; document.head.appendChild(st);
  box = el('div', 'hud'); box.id = 'k8box'; box.hidden = true; document.body.appendChild(box);
  H.onTick(dt => { acc += dt; if (acc < 0.25) return; acc = 0; frame(); });
}
function frame() {
  let list = []; try { list = (D.custody && D.custody()) || []; } catch (e) { list = []; }
  if (!list.length) { if (!box.hidden) box.hidden = true; seen.clear(); sig = ''; return; }
  const now = performance.now(), cnt = {}, rows = list.map(e => { const k = e.item + '#' + (cnt[e.item] = (cnt[e.item] || 0) + 1); if (!seen.has(k)) seen.set(k, now); return { ...e, k, left: e.pending ? null : Math.max(0, HOLD - (now - seen.get(k)) / 1000) }; });
  for (const k of [...seen.keys()]) if (!rows.some(r => r.k === k)) seen.delete(k);
  const g = document.getElementById('gift7'); box.classList.toggle('up', !!(g && !g.hidden));
  const s2 = JSON.stringify(rows.map(r => [r.k, r.n, r.pending]));
  if (s2 !== sig) { sig = s2; build(rows); }
  rows.forEach((r, i) => { const t = box.querySelectorAll('.r em')[i]; if (t && r.left != null) { const v = `${Math.floor(r.left / 60)}:${String(Math.floor(r.left % 60)).padStart(2, '0')}`; if (t.textContent !== v) t.textContent = v; } });
  box.hidden = false;
}
function build(rows) {
  box.textContent = ''; const pend = rows.some(r => r.pending);
  const h = el('h5'); h.innerHTML = MONKEY + '被猴子拿走的東西'; h.append(el('small', '', '託管中')); box.append(h);
  for (const r of rows) {
    const row = el('div', 'r'), tx = el('span'), b = el('b'); b.append(nameOf(r.item)); if (r.n > 1) b.append(el('i', '', ' ×' + r.n));
    tx.append(b, el('small', r.pending ? 'w' : '', r.pending ? '背包滿了，騰出空間就能領回' : '打倒抱著它的猴子，或等牠跑掉'));
    row.append(H.ic(r.item), tx);
    if (r.pending) { const bt = el('button', '', '領回'); bt.onclick = () => { let n = 0; try { n = D.claim() || 0; } catch (e) { } if (n > 0) { H.toast(`領回了 ${n} 份`); H.sfx('click'); } else { H.toast('背包還是放不下，先騰出空間'); H.sfx('deny'); } sig = ''; frame(); }; row.append(bt); }
    else row.append(el('em', '', ''));
    box.append(row);
  }
  box.append(el('p', '', pend ? '放不下的東西會一直留著，不會消失。' : '倒數到了一樣會原樣還你，不會消失。'));
}
