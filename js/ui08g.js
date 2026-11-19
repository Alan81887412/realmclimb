// 0.8 介面（ui-i）：「被盯上」的預警
//   角色四周的橢圓上，每個盯著你的方向一個記號（#g8ring 裡的 .g8m）；盯人那隻的名牌上加一個「盯」（.g8eye，絕對定位，不改名牌的大小與定位）。
// 只靠 init(H, D)；不 import 遊戲模組。不改 ui.js、index.html、玩法的檔。
// D 需要：targetedBy() → [{ id, kind:'bark'|'herd'|'charge', ang:畫面方向（弧度，0＝正上方、順時針）, d:公尺, tag:{el}|null }]（中間層把 beastai07 的世界座標 x、z 換成 ang、d）。
// 規則：每種 kind 一個形狀（吠叫＝聲波弧、牛群＝牛角、連衝＝箭頭），不只靠顏色；越近越不透明、稍微放大；不閃、不動畫、沒有全螢幕紅框
//   （受傷的 #lowhp 是紅的，混在一起會看不出是誰）；橢圓留在 x≤270、y≤190 半徑內，下緣不碰 #bottom；公告 #notice 出現時，會碰到它的記號往下讓開並淡一點；
//   同一種的、方向很近的（9 隻狗同時叫）合成一個記號加「×n」。
const CSS = `
body #g8ring{position:fixed;left:0;top:0;width:0;height:0;z-index:4;pointer-events:none;transition:opacity .25s}
body.talking #g8ring{opacity:0}
body #g8ring .g8m{position:absolute;left:0;top:0;width:52px;height:52px;margin:-26px 0 0 -26px;opacity:0;transition:opacity .25s;will-change:transform,opacity}
body #g8ring .g8m .rot{position:absolute;inset:0}
body #g8ring .g8m svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))}
body #g8ring .g8m .n{position:absolute;right:-6px;bottom:-4px;min-width:14px;padding:0 3px 1px;box-sizing:border-box;border-radius:8px;background:#1c140c;border:1px solid var(--brass,#c9a35a);font:700 10.5px/13px var(--font-display,serif);color:var(--brass-light,#f0d79a);text-align:center}
body .tag .g8eye{position:absolute;left:100%;top:-1px;margin-left:5px;padding:0 4px 1px;border-radius:3px;font:700 11px/14px var(--font-display,serif);letter-spacing:.04em;color:#2a1a08;background:linear-gradient(#f6d98a,#d6a642);box-shadow:0 0 0 1px #1c140c;pointer-events:none}
body .tag .g8eye[data-k=charge]{background:linear-gradient(#ffb48a,#e8743e)}
body .tag .g8eye[data-k=herd]{background:linear-gradient(#f3e6c4,#c9b48a)}
`;
const IK = '#1c140c';
const ln = (d, col, w, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
const out = (d, col, w) => ln(d, IK, w + 3) + ln(d, col, w);
// 記號朝上＝朝向那隻野獸（外側）；每個畫在 52×52 裡，中心 (26,26)
const BACK = '<circle cx="26" cy="26" r="23" fill="rgba(18,14,9,.52)"/>';
const arc = r => { const dx = r * 0.616, dy = r * 0.788; return `M${(26 - dx).toFixed(2)} ${(19 + dy).toFixed(2)}A${r} ${r} 0 0 0 ${(26 + dx).toFixed(2)} ${(19 + dy).toFixed(2)}`; };
const SHAPE = {
  // 吠叫：外側是一個張嘴的狗頭（吠叫的是狗，不然像 wifi 符號），三道聲波一圈比一圈大、往你這邊（鼓向內側）
  bark: BACK + out(arc(8), '#f6d98a', 2.4) + out(arc(14.500), '#f2c54a', 2.6) + out(arc(21), '#e8a838', 2.8)
    + `<path d="M17.500 11.500L15.500 2.500L22 6.200H30L36.500 2.500L34.500 11.500C34.500 16.500 31 19.500 26 19.500S17.500 16.500 17.500 11.500z" fill="#c9a070" stroke="${IK}" stroke-width="1.700" stroke-linejoin="round"/>`
    + `<path d="M15.500 2.500L17.200 8L21 6.500zM36.500 2.500L34.800 8L31 6.500z" fill="#5a3a1e"/><ellipse cx="26" cy="15.200" rx="4.600" ry="3.600" fill="#ecd2a6" stroke="${IK}" stroke-width="1.200"/><ellipse cx="26" cy="13.500" rx="1.700" ry="1.200" fill="${IK}"/><path d="M23 17.200q3 3.800 6 0z" fill="#8a2a22" stroke="${IK}" stroke-width="1"/><circle cx="21.700" cy="10" r="1.200" fill="${IK}"/><circle cx="30.300" cy="10" r="1.200" fill="${IK}"/>`,
  // 牛群：牛角（豎琴形，兩支角往外側張開），下面是牛頭
  herd: BACK + [1, -1].map(s => { const X = x => 26 + s * x; return `<path d="M${X(-6)} 33C${X(-15)} 34 ${X(-19)} 22 ${X(-14)} 8C${X(-12)} 17 ${X(-9)} 23 ${X(-4)} 26z" fill="#f3e6c4" stroke="${IK}" stroke-width="1.700" stroke-linejoin="round"/>` + ln(`M${X(-14.500)} 13C${X(-15)} 21 ${X(-12)} 27 ${X(-8)} 30`, '#fff', 1.200, .7); }).join('')
    + `<path d="M17 31c0-4 4-6 9-6s9 2 9 6c0 5-3 9-9 12c-6-3-9-7-9-12z" fill="#7a5436" stroke="${IK}" stroke-width="1.700" stroke-linejoin="round"/><ellipse cx="26" cy="38.500" rx="5.500" ry="3.600" fill="#c8a07a" stroke="${IK}" stroke-width="1.300"/><circle cx="23.800" cy="38.500" r=".9" fill="${IK}"/><circle cx="28.200" cy="38.500" r=".9" fill="${IK}"/>`,
  // 連衝：往你這邊衝的粗箭頭（尖端朝內側）＋兩側的速度線
  charge: BACK + ln('M14.500 8v10M37.500 8v10M20 5.500v7M32 5.500v7', '#ffd0a8', 2, .85)
    + `<path d="M21 11h10v14h7.500L26 44 13.500 25H21z" fill="#ee6a3c" stroke="${IK}" stroke-width="1.900" stroke-linejoin="round"/><path d="M26 11h5v14h7.500L26 44z" fill="#b8401e" opacity=".55"/>` + ln('M23.200 14v9', '#fff', 1.400, .75),
};
const NAME = { bark: '吠叫集火', herd: '牛群盯人', charge: '連衝對準' };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

export function init(H, D) {
  if (!D || typeof D.targetedBy !== 'function') return;
  if (!document.getElementById('g8css')) { const st = document.createElement('style'); st.id = 'g8css'; st.textContent = CSS; document.head.appendChild(st); }
  const ring = document.createElement('div'); ring.id = 'g8ring'; ring.hidden = true; document.body.appendChild(ring);
  const state = new Map();            // id → { a（平滑後的方向）, d, kind }
  const pool = [];                    // 記號元素
  const eyes = new Map();             // 名牌元素 → 「盯」記號
  let frame = 0, noticeBox = null, hideT = 0;
  const mk = () => { const m = document.createElement('div'); m.className = 'g8m'; m.innerHTML = '<div class="rot"></div><span class="n" hidden></span>'; m._k = ''; ring.appendChild(m); pool.push(m); return m; };
  const geo = () => {
    const W = innerWidth, Hh = innerHeight, cx = W / 2; let cy = Hh * 0.61;
    const bt = document.getElementById('bottom'); let limit = Hh - 40;
    if (bt && !bt.hidden) { const r = bt.getBoundingClientRect(); if (r.height > 0 && r.top > Hh * 0.5) limit = Math.min(limit, r.top - 14); }
    const ry = clamp(limit - 28 - cy, 100, 190), rx = clamp(W / 2 - 340, 150, 270);
    return { cx, cy, rx, ry };
  };
  const readNotice = () => {                      // 公告 #notice 目前佔的框（沒有就 null）；每 6 幀量一次
    const n = document.getElementById('notice'); if (!n || n.hidden) return null;
    const r = n.getBoundingClientRect(); return r.height > 2 && r.width > 2 ? r : null;
  };
  H.onTick(dt => {
    let list = []; try { list = D.targetedBy() || []; } catch (e) { list = []; }
    const seen = new Set(), tagSeen = new Set();
    for (const e of list) {
      if (!e || typeof e.ang !== 'number' || !SHAPE[e.kind]) continue;
      const id = e.id != null ? e.id : e.kind + ':' + seen.size; seen.add(id);
      let s = state.get(id);
      if (!s) { s = { a: e.ang, d: e.d, kind: e.kind }; state.set(id, s); }
      else { s.a = wrap(s.a + wrap(e.ang - s.a) * Math.min(1, dt * 10)); s.d = e.d; s.kind = e.kind; }
      if (e.tag && e.tag.el) {
        tagSeen.add(e.tag.el); let g = eyes.get(e.tag.el);
        if (!g) { const sp = document.createElement('span'); sp.className = 'g8eye'; sp.textContent = '盯'; sp.title = NAME[e.kind]; e.tag.el.appendChild(sp); g = { sp }; eyes.set(e.tag.el, g); }
        if (g.sp.dataset.k !== e.kind) { g.sp.dataset.k = e.kind; g.sp.title = NAME[e.kind]; }
      }
    }
    for (const k of [...state.keys()]) if (!seen.has(k)) state.delete(k);
    for (const [el, g] of [...eyes]) if (!tagSeen.has(el)) { g.sp.remove(); eyes.delete(el); }

    if (!state.size) { if (!ring.hidden && !hideT) { for (const m of pool) m.style.opacity = '0'; hideT = setTimeout(() => { hideT = 0; if (!state.size) ring.hidden = true; }, 320); } return; }
    if (hideT) { clearTimeout(hideT); hideT = 0; }
    if (frame++ % 6 === 0) noticeBox = readNotice();
    const G = geo();
    // 合併：同一種、方向差 < 0.32 弧度的合成一個（×n）
    const items = [...state.values()].sort((p, q) => p.a - q.a), cl = [];
    for (const s of items) { const c = cl.find(c => c.kind === s.kind && Math.abs(wrap(c.a - s.a)) < 0.32); if (c) { c.n++; c.a = wrap(c.a + wrap(s.a - c.a) / c.n); c.d = Math.min(c.d, s.d); } else cl.push({ kind: s.kind, a: s.a, d: s.d, n: 1 }); }
    // 位置，再把靠太近的不同記號沿橢圓推開（最多 4 輪）
    const pos = c => ({ x: G.cx + G.rx * Math.sin(c.a), y: G.cy - G.ry * Math.cos(c.a) });
    for (let it = 0; it < 4; it++) for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
      const p = pos(cl[i]), q = pos(cl[j]), dist = Math.hypot(p.x - q.x, p.y - q.y);
      if (dist < 46) { const push = (46 - dist) / 2 / Math.max(G.rx, G.ry) * 1.1, sg = wrap(cl[i].a - cl[j].a) >= 0 ? 1 : -1; cl[i].a = wrap(cl[i].a + sg * push); cl[j].a = wrap(cl[j].a - sg * push); }
    }
    ring.hidden = false;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const lay = [];
    cl.forEach((c, i) => {
      const p = pos(c), near = clamp((46 - c.d) / 36, 0, 1), sc = 0.82 + 0.28 * near; let op = 0.5 + 0.5 * near;
      if (noticeBox) {                               // 公告擋到：往下讓開，讓不開就淡一點
        const M = 18, hit = () => p.x + 26 > noticeBox.left - M && p.x - 26 < noticeBox.right + M && p.y + 26 > noticeBox.top - M && p.y - 26 < noticeBox.bottom + M;
        if (hit()) { p.y = noticeBox.bottom + M + 26; op *= 0.55; }
      }
      const h = 26 * sc; x0 = Math.min(x0, p.x - h); y0 = Math.min(y0, p.y - h); x1 = Math.max(x1, p.x + h); y1 = Math.max(y1, p.y + h);
      lay.push({ c, p, sc, op });
    });
    // 容器貼著所有記號的外框（讓版面檢查看得到實際佔的位置；記號用 transform 定位，容器本身不擋滑鼠）
    ring.style.left = x0 + 'px'; ring.style.top = y0 + 'px'; ring.style.width = (x1 - x0) + 'px'; ring.style.height = (y1 - y0) + 'px';
    lay.forEach(({ c, p, sc, op }, i) => {
      const m = pool[i] || mk();
      if (m._k !== c.kind) { m._k = c.kind; m.firstChild.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true">${SHAPE[c.kind]}</svg>`; m.title = NAME[c.kind]; }
      m.firstChild.style.transform = `rotate(${c.a.toFixed(3)}rad)`;
      m.style.transform = `translate3d(${(p.x - x0).toFixed(1)}px,${(p.y - y0).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
      m.style.opacity = op.toFixed(2);
      const nn = m.lastChild; nn.hidden = c.n < 2; if (c.n >= 2) nn.textContent = '×' + c.n;
    });
    for (let i = cl.length; i < pool.length; i++) pool[i].style.opacity = '0';
  });
}
