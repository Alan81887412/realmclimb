/* 0.8 介面（ui-s S1，介面總監 R3 代做）：雨天的懷錶記號、區域列的雨字、第一次下雨的提示。
   只靠 init(H, D)：D.weather() → { rain: 0..1, flash: 0..1 }；H.onTick、H.tip。不 import 遊戲模組。
   懷錶外緣約 7 點半方向一個小琺瑯記號（雲＋雨點），雨 > 0.5 淡入；打雷 flash > 0 時記號裡的閃電亮起＋一圈淡金光，跟著 flash 退，不另外閃爍。
   太陽／月亮（#sunDot，沿錶面內圈轉）轉到 7 點半附近（±28 度）時，記號換到 4 點半那一側，不互相蓋住。
   區域列 #zoneLine：#zoneSub 後面加 #w8zone「雨　野獸的察覺距離短兩成」（不改 #zoneSub；ui08h 的 #watch8 在它後面）。 */
const CSS = `
body #w8rain{position:absolute;left:10px;top:151px;width:32px;height:32px;border-radius:50%;z-index:3;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,#3c5266,#1a2632 75%);box-shadow:0 0 0 2px var(--brass),0 0 0 3px rgba(40,30,12,.8),0 2px 5px rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .9s,left .4s,top .4s}
body #w8rain.on{opacity:1}
body #w8rain.alt{left:154px}
body #w8rain svg{width:24px;height:24px;overflow:visible}
body #w8rain .bolt{opacity:.15}
body #w8rain .glow{position:absolute;inset:-5px;border-radius:50%;box-shadow:0 0 12px 3px rgba(255,224,138,.6);opacity:0;pointer-events:none}
body #zoneLine #w8zone{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:1px;font-size:11.5px;color:#a9c4dc}
body #zoneLine #w8zone[hidden]{display:none}
body #zoneLine #w8zone svg{width:13px;height:13px}
body #zoneLine #w8zone span{display:inline;color:#a9c4dc;font-size:11.5px}
body #zoneLine #w8zone em{font-style:normal;color:var(--ink-dim)}
`;
const RAIN = '<span class="glow"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path class="bolt" d="M11 9.6L8.6 13.8h2.4L9.6 18l4-5.4h-2.6L12.6 9.6z" fill="#ffe08a"/><path d="M5.6 11.2a3.2 3.2 0 0 1 .5-6.3 4.4 4.4 0 0 1 8.3 1 2.7 2.7 0 0 1 .3 5.3z" fill="#e8eef4" stroke="#1c140c" stroke-width=".9"/><path d="M6 13.4l-1 2.4M9 13.4l-1 2.4M15 13.4l-1 2.4" stroke="#9fc6ea" stroke-width="1.4" stroke-linecap="round"/></svg>';
const DROP = '<svg viewBox="0 0 13 13" aria-hidden="true"><path d="M6.5 1.2C8.6 4 10 6 10 7.8a3.5 3.5 0 0 1-7 0C3 6 4.4 4 6.5 1.2z" fill="#9fc6ea"/></svg>';
const MARK_DEG = 226, NEAR = 28;      /* 記號在 7 點半（從正上方順時針 226 度）；太陽／月亮進到 ±28 度內就換邊 */
let H, D, mark = null, glow = null, bolt = null, zone = null, on = false, alt = false, slow = 0, tipped = false;
const wrap = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
function sunDeg() { const a = document.getElementById('sunArm'); const m = a && /rotate\((-?[\d.]+)deg\)/.exec(a.style.transform || ''); return m ? +m[1] : null; }
function build() {
  const c = document.getElementById('watchCase'); if (!c) return false;
  mark = document.createElement('div'); mark.id = 'w8rain'; mark.innerHTML = RAIN; mark.setAttribute('aria-hidden', 'true'); c.appendChild(mark);
  glow = mark.querySelector('.glow'); bolt = mark.querySelector('.bolt');
  const z = document.getElementById('zoneLine'), sub = document.getElementById('zoneSub');
  if (z) { zone = document.createElement('div'); zone.id = 'w8zone'; zone.hidden = true; zone.innerHTML = `${DROP}<span>雨</span><em>　野獸的察覺距離短兩成</em>`; if (sub && sub.parentNode === z) sub.after(zone); else z.appendChild(zone); }
  return true;
}
export function init(h, d) {
  H = h; D = d;
  if (!document.getElementById('w8css')) { const st = document.createElement('style'); st.id = 'w8css'; st.textContent = CSS; document.head.appendChild(st); }
  H.onTick(() => {
    if (!mark && !build()) return;
    const w = (D.weather && D.weather()) || { rain: 0, flash: 0 }, rain = +w.rain || 0, fl = Math.max(0, Math.min(1, +w.flash || 0)), now = rain > 0.5;
    if (now !== on) { on = now; mark.classList.toggle('on', on); if (zone) zone.hidden = !on;
      if (on && !tipped) { tipped = true; try { H.tip('rain8', '下雨了：野獸聽不清腳步，察覺距離短兩成；捕獸夾的鐵光看不到，只剩紅布樁和翻過的土。'); } catch (e) { } } }
    /* 閃電：跟著 flash 退（weather08 的 flash 是指數衰減，不另外閃） */
    const k = on ? fl : 0; bolt.style.opacity = (0.15 + 0.85 * k).toFixed(3); glow.style.opacity = k.toFixed(3);
    if ((slow -= 1) <= 0) { slow = 20; const s = sunDeg(); const a = s != null && Math.abs(wrap(s - MARK_DEG)) < NEAR; if (a !== alt) { alt = a; mark.classList.toggle('alt', alt); } }
  });
}
