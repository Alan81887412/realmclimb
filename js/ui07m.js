// 0.7 介面（d7-ui-m）：地圖的介面——繪圖桌視窗、手繪地圖視窗、送圖確認框、抄本的手寫地名、褐墨的向量路線
// 內容（視窗的 DOM）從 maps07.js 的 deco 掛鉤進來（maps07.js-patch.py，7 處）；大地圖寫地名走 ui.js 的 M7.deco.word（ui.js-patch.py，1 處）。
// 這個檔不改 maps07 的任何邏輯，只畫東西；狀態（S、D7）從 maps07 的 debug7 讀。
import * as M from './maps07.js';
import { P, ui, Store, buy, qStatus, QUESTS } from './game.js';
import { WORLD, ITEMS, ROADS, TRAILS, CORRIDORS, clamp, ZONES } from './core.js';
import { GATHER_SITES, CAMPS } from './places06.js';

let H = null;
const $ = id => document.getElementById(id);
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { MAP7, AREAS, areaName } = M;
const ALL = 'all', INNER = new Set(['meadow', 'forest', 'canyon', 'lair']);
const S = () => M.debug7.S, D7 = () => M.debug7.D7;
const FN = WORLD.FOG, CN = FN >> 1, FS = WORLD.FOG_SIZE, FC = FS / FN, CC = FS / CN;
const dateTxt = t => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const qx = id => QUESTS.some(q => q.id === id);

/* ============================== 抄本的地名：手寫感 ============================== */
const HAND = '"DFKai-SB","BiauKai","標楷體","Kaiti TC","STKaiti","KaiTi","Noto Serif TC",serif', INK = '#4a2c14', HALO = 'rgba(243,230,196,.94)';
// 只在抄本裡（自己沒走過）：那個位置在抄本有、自己的探索格沒有
function copyOnly(wx, wz) {
  const gx = Math.floor((wx + FS / 2) / FC), gz = Math.floor((wz + FS / 2) / FC); if (gx < 0 || gz < 0 || gx >= FN || gz >= FN) return false;
  return !P.explored[gz * FN + gx] && M.copyAt(wx, wz);
}
const hash = (s, a, b) => { let h = 2166136261 ^ Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 1274126177); return (h ^ (h >>> 16)) >>> 0; };
// ui.js drawBigMap 的 word() 先問這裡；回傳 true＝已經寫完。每個字的偏轉、高低、大小由「字＋位置」的雜湊決定，每次畫都一樣
function word(cx, t, x, y, font, lw, o, s) {
  const ox = Array.isArray(o) ? o[0] : o, oz = Array.isArray(o) ? o[1] : o;      /* 0.8 X7：大地圖可以平移縮放，原點分 x、z 兩個 */
  if (!copyOnly((x - ox) / s, (y - oz) / s)) return false;
  const m = /(\d+(?:\.\d+)?)px/.exec(font), size = m ? +m[1] : 16, big = size >= 20, f = `${big ? 800 : 700} ${size}px ${HAND}`, chars = [...t];
  cx.save(); cx.font = f; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
  const adv = chars.map(c => cx.measureText(c).width * 0.97), W = adv.reduce((a, b) => a + b, 0), X0 = x - W / 2, bx = Math.round(x), by = Math.round(y); let px = X0;
  const pos = chars.map((c, i) => { const h = hash(c, bx + i * 7, by), r = (((h & 1023) / 1023) - 0.5) * 2 * 0.0838, dy = ((((h >>> 10) & 1023) / 1023) - 0.5) * 3, sc = 0.9 + (((h >>> 20) & 1023) / 1023) * 0.2, dx = ((((h >>> 5) & 255) / 255) - 0.5) * 1.2, cxp = px + adv[i] / 2 + dx; px += adv[i]; return { c, r, dy, sc, x: cxp }; });
  const draw = (stroke) => { for (const p of pos) { cx.save(); cx.translate(p.x, y + p.dy); cx.rotate(p.r); cx.scale(p.sc, p.sc); cx.textAlign = 'center'; if (stroke) { cx.lineWidth = Math.max(3, lw * 0.85) / p.sc; cx.strokeStyle = HALO; cx.strokeText(p.c, 0, 0); } else { cx.fillStyle = INK; cx.fillText(p.c, 0, 0); } cx.restore(); } };
  draw(true); draw(false);
  if (big) { const h = hash(t, bx, by), sag = 2 + (h % 3); cx.beginPath(); cx.moveTo(X0 - 2, y + size * 0.62); cx.quadraticCurveTo(x, y + size * 0.62 + sag, X0 + W + 2, y + size * 0.62 - ((h >>> 8) % 3) + 1); cx.lineWidth = 3.4; cx.strokeStyle = HALO; cx.stroke(); cx.lineWidth = 1.3; cx.strokeStyle = 'rgba(74,44,20,.75)'; cx.stroke(); }
  cx.restore(); return true;
}

/* ============================== 褐墨的路：向量虛線，裁在抄本區 ============================== */
const tmps = {};
// maps07.js inkLayer 在褐墨底圖之後呼叫：ox, oz＝世界原點在畫布上的位置，s＝每公尺像素，mask＝抄本遮罩（130×130，有抄本且自己沒走過的格）
function inkRoads(cx, ox, oz, s, mask, fs) {
  const cv = cx.canvas, W = cv.width, Hh = cv.height; if (!mask || W < 16) return;
  const t = tmps[W] || (tmps[W] = document.createElement('canvas')); if (t.width !== W || t.height !== Hh) { t.width = W; t.height = Hh; }
  const c = t.getContext('2d'), disp = cv.clientWidth || W / 1.47, k = W / disp;      // k：畫布像素 ÷ 顯示像素；線寬、虛線段長用「顯示後的像素」算
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, Hh); c.lineCap = 'round'; c.lineJoin = 'round';
  const path = pts => { c.beginPath(); pts.forEach((p, i) => { const X = ox + p[0] * s, Y = oz + p[1] * s; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); };
  const lay = (list, wd, dash, gap) => {
    c.setLineDash([]); c.strokeStyle = 'rgba(244,232,200,.88)'; c.lineWidth = (wd + 3) * k; for (const pts of list) { path(pts); c.stroke(); }      // 底：一道淡紙色，深色的虛線才讀得出來
    c.setLineDash([dash * k, gap * k]); c.strokeStyle = '#4a2c14'; c.lineWidth = wd * k; for (const pts of list) { path(pts); c.stroke(); }
  };
  lay(TRAILS, 2.2, 5, 4); lay(CORRIDORS.map(q => q.pts), 3.2, 8, 5); lay(ROADS, 3.2, 8, 5);      // 通道（core.js roadDist 也算它的路色）和大道同樣畫
  c.setLineDash([]); c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = false; c.drawImage(mask, ox - fs / 2 * s, oz - fs / 2 * s, fs * s, fs * s);
  cx.drawImage(t, 0, 0);
}

/* ============================== 縮圖：羊皮紙、褐墨的邊、採集片 ============================== */
const unpack = (s, n) => { const a = new Uint8Array(n); try { const b = atob(s || ''); for (let i = 0; i < b.length && i * 8 < n; i++) { const c = b.charCodeAt(i); for (let k = 0; k < 8 && i * 8 + k < n; k++) a[i * 8 + k] = (c >> k) & 1; } } catch (e) {} return a; };
function drawThumb(cv, m, css) {
  const n = cv.width, q = n / css, c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, n, n);
  const g = c.createRadialGradient(n * 0.42, n * 0.38, n * 0.08, n / 2, n / 2, n * 0.78); g.addColorStop(0, '#f2e5c2'); g.addColorStop(0.7, '#e1c995'); g.addColorStop(1, '#c9ab72'); c.fillStyle = g; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 90; i++) { const h = hash(m.uid || 'x', i, 3), x = (h & 1023) / 1023 * n, y = ((h >>> 10) & 1023) / 1023 * n, r = (1 + ((h >>> 20) & 3)) * 0.35 * q; c.fillStyle = `rgba(110,76,36,${0.05 + ((h >>> 22) & 7) * 0.012})`; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); }      // 紙上的斑
  const cells = M.rleDec(m.cells, CN * CN); if (!cells) return;
  let x0 = CN, x1 = 0, z0 = CN, z1 = 0; for (let i = 0; i < CN * CN; i++) if (cells[i]) { const x = i % CN, z = (i / CN) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (m.area === ALL) { const o6 = (CN - (WORLD.FOG06 >> 1)) / 2, e6 = CN - 1 - o6; x0 = Math.min(x0, o6); z0 = Math.min(z0, o6); x1 = Math.max(x1, e6); z1 = Math.max(z1, e6); }      /* 0.8 X7：整層圖照畫過的範圍裁切，至少是舊世界那一圈（新地沒走過的話，縮圖和 0.7 一樣大） */
  const w = Math.max(x1 - x0, z1 - z0) + 4, k = n / w, ox = (w - (x1 - x0 + 1)) / 2 - x0, oz = (w - (z1 - z0 + 1)) / 2 - z0, has = (x, z) => x >= 0 && z >= 0 && x < CN && z < CN && cells[z * CN + x];
  c.save(); c.beginPath(); for (let i = 0; i < CN * CN; i++) if (cells[i]) c.rect(((i % CN) + ox) * k - 0.3, (((i / CN) | 0) + oz) * k - 0.3, k + 0.6, k + 0.6); c.clip();
  c.fillStyle = 'rgba(122,85,48,.30)'; c.fillRect(0, 0, n, n); c.strokeStyle = 'rgba(90,58,28,.38)'; c.lineWidth = 0.8 * q; c.beginPath(); for (let d = -n; d < n * 2; d += 4.2 * q) { c.moveTo(d, 0); c.lineTo(d - n, n); } c.stroke(); c.restore();
  c.strokeStyle = 'rgba(62,38,16,.88)'; c.lineWidth = 1.3 * q; c.lineCap = 'round'; c.beginPath();
  const j = (x, z, a) => ((hash('e', x * 3 + a, z) & 255) / 255 - 0.5) * 0.7 * q;
  for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) { if (!has(x, z)) continue; const X = (x + ox) * k, Y = (z + oz) * k;
    if (!has(x - 1, z)) { c.moveTo(X + j(x, z, 0), Y); c.lineTo(X + j(x, z, 1), Y + k); } if (!has(x + 1, z)) { c.moveTo(X + k + j(x, z, 2), Y); c.lineTo(X + k + j(x, z, 3), Y + k); }
    if (!has(x, z - 1)) { c.moveTo(X, Y + j(x, z, 4)); c.lineTo(X + k, Y + j(x, z, 5)); } if (!has(x, z + 1)) { c.moveTo(X, Y + k + j(x, z, 6)); c.lineTo(X + k, Y + k + j(x, z, 7)); } }
  c.stroke();
  const cx = wx => ((wx + FS / 2) / CC + ox) * k;      // 世界座標 → 縮圖
  if (m.pv === GATHER_SITES.length && typeof m.patches === 'string') { const b = unpack(m.patches, GATHER_SITES.length); c.fillStyle = '#3e2610'; GATHER_SITES.forEach((p, i) => { if (!b[i]) return; c.beginPath(); c.arc(cx(p.x), cx(p.z), Math.max(1.1, 1.25 * q), 0, 6.3); c.fill(); }); }
  if (Array.isArray(m.camps)) { c.strokeStyle = '#3e2610'; c.lineWidth = 1.2 * q; for (const id of m.camps) { const o = CAMPS.find(p => p.id === id); if (!o) continue; c.beginPath(); c.arc(cx(o.x), cx(o.z), 2.6 * q, 0, 6.3); c.stroke(); } }
  c.strokeStyle = 'rgba(70,44,20,.85)'; c.lineWidth = 1.6 * q; c.strokeRect(1.5 * q, 1.5 * q, n - 3 * q, n - 3 * q); c.lineWidth = 0.7 * q; c.strokeRect(4.5 * q, 4.5 * q, n - 9 * q, n - 9 * q);
  if (css >= 80) { c.fillStyle = 'rgba(70,44,20,.9)'; c.font = `700 ${11 * q}px ${HAND}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('北', n - 13 * q, 14 * q); }
}

/* ============================== 繪圖桌 ============================== */
let drawN = 1;
const generalWhy = () => !M.canDrawAt() ? 'lock' : !M.nearTable(MAP7.tableR + 3) ? '要走到芬恩的繪圖桌旁邊（桌子、墨和光）才能畫。' : S().maps.length >= MAP7.maxMaps ? `手繪地圖最多帶 ${MAP7.maxMaps} 張。先送掉或撕掉一張。` : '';
function supply(id, name, have, sub, btn) {
  const t = el('div', 'm7t'), nm = el('b', '', name), sm = el('small', have === 0 && id !== 'map_drawn' ? 'no' : '', sub);
  const tx = el('span'); tx.append(nm, sm); t.append(H.ic(id), tx); if (btn) t.appendChild(btn); return t;
}
function renderDraw() {
  const w = $('winDraw7'); if (!w || w.hidden) return; const body = w.querySelector('.body'), keep = body.scrollTop; body.textContent = '';
  const st = S(), d7 = D7(), pc = M.pcts(), why0 = generalWhy(), drawing = !!d7.draw; w.querySelector('.hgold b').textContent = P.gold;
  if (why0 === 'lock') body.appendChild(el('div', 'm7lock', '芬恩：「想學畫圖？先幫我一個小忙——接下『第一張圖』。」（風吹草原自己走過三成、做完主線「大概在那一帶」之後，芬恩會教你）'));
  // 用品
  const sup = el('div', 'm7sup');
  for (const [id, nm] of [['map_blank', '空白地圖'], ['map_big', '大張空白地圖']]) {
    const info = ITEMS[id], have = P.inv[id] || 0, price = info && info.buy, full = have >= ((info && info.max) || 99), b = el('button', '', price ? `買 ${price} 金` : '還沒上架');
    b.disabled = !price || P.gold < price || full; b.title = !price ? '' : P.gold < price ? '金幣不夠' : full ? '帶不下了' : ''; b.onclick = () => { buy(id); H.sfx('click'); renderDraw(); };
    sup.appendChild(supply(id, nm, have, `有 ${have}`, b));
  }
  { const b = el('button', '', '看手繪地圖'); b.onclick = () => M.openMaps(); sup.appendChild(supply('map_drawn', '手繪地圖', st.maps.length, `${st.maps.length} / ${MAP7.maxMaps} 張`, b)); }
  body.appendChild(sup);
  // 畫一區
  const h3 = el('div', 'm7h3'), sel = el('select'); h3.appendChild(el('span', '', `畫一區（空白地圖 ×1，${survey() ? '不用等' : MAP7.drawT.one + ' 秒'}）　自己走過一成以上才畫得出來`));
  for (let i = 1; i <= MAP7.maxMaps; i++) { const o = el('option', '', `一次畫 ${i} 張`); o.value = i; if (i === drawN) o.selected = true; sel.appendChild(o); } sel.disabled = drawing; sel.onchange = () => { drawN = +sel.value; }; h3.appendChild(sel); body.appendChild(h3);
  const cols = el('div', 'm7cols');
  /* 0.8 X7：22 區＝城＋舊八區＋新地 A 圈九區＋北境四塊。左欄：內圈、外環、北境；右欄：新地（A 圈九區）。北境的名字去掉「北境・」（欄頭已經寫了） */
  const ring = a => (M.ringOf ? M.ringOf(a) : INNER.has(a) ? 'in' : 'out'), short = a => areaName(a).replace(/^北境・/, '').replace('採石場與鹽臺', '採石鹽臺');      /* R4：名字欄 70 px 只放得下 5 個字 */
  const groups = [[['內圈', AREAS.filter(a => ring(a) === 'in')], ['外環', AREAS.filter(a => ring(a) === 'out')], ['北境', AREAS.filter(a => ring(a) === 'N')]], [['新地', AREAS.filter(a => ring(a) === 'A')]]];
  for (const colSets of groups) { const col = el('div', 'm7col'); for (const [title, set] of colSets) {
    if (!set.length) continue; const hd = el('div', 'm7ch'), sc = el('span', 'sc'); hd.append(el('b', '', title), sc); if (title === '內圈' || title === '新地') for (const p of [10, 90]) { const e = el('em', '', p + '%'); e.style.left = p + '%'; sc.appendChild(e); } hd.append(el('span'), el('span')); col.appendChild(hd);
    for (const a of set) { const v = pc[a], r = el('div', 'm7row'), why = M.drawCheck(a), bar = el('span', 'm7bar'), fill = el('i', v >= MAP7.fullPct ? 'full' : v < MAP7.minPct ? 'low' : ''), t1 = el('em'), t9 = el('em');
      fill.style.width = (v * 100).toFixed(1) + '%'; t1.style.left = '10%'; t9.style.left = '90%'; bar.append(fill, t1, t9); bar.title = `走過 ${Math.floor(v * 100)}%（一成可以畫、九成可以領測繪費）`;
      const b = el('button', '', '畫一張'); b.disabled = !!why || drawing; b.title = why || ''; b.onclick = () => M.startDraw(a, drawN);
      const nm = el('span', 'nm', short(a)); nm.title = areaName(a) + (ZONES[a] && ZONES[a].lv ? `（建議等級 ${ZONES[a].lv}）` : ''); r.append(nm, bar, el('span', 'pc', Math.floor(v * 100) + '%'), b); col.appendChild(r); }
    } cols.appendChild(col);
  }
  body.appendChild(cols);
  { const r = el('div', 'm7all'), n = AREAS.filter(a => pc[a] >= MAP7.minPct).length, tx = el('div', 'tx'), why = M.drawCheck(ALL), b = el('button', '', '畫整層');
    tx.append(el('b', '', `整層畫在一張（大張空白地圖 ×1，${survey() ? '不用等' : MAP7.drawT.all + ' 秒'}）`), el('small', '', `只畫走過一成以上的 ${n} 區；全層自己走過 ${Math.floor(pc[ALL] * 100)}%`));
    b.disabled = !!why || drawing; b.title = why || ''; b.onclick = () => M.startDraw(ALL, drawN); r.append(tx, b); body.appendChild(r); }
  // 畫圖中的進度條與提示（固定高度，出現與消失視窗不跳）
  const pw = el('div', 'm7pgw'), note = el('div', 'm7note' + (why0 && why0 !== 'lock' ? ' w' : ''), why0 && why0 !== 'lock' ? why0 : '只畫得出你自己走過的地方；別人送你的部分（地圖上褐色的）畫不出來。'), pg = el('div', 'm7prog'); pg.id = 'm7prog'; pg.hidden = true; pg.innerHTML = '<i></i><span></span>'; pw.append(note, pg); body.appendChild(pw); drawBar(d7, areaName);
  // 給芬恩看
  { const h = el('div', 'm7h3', '給芬恩看（一區自己走過九成，芬恩付一次測繪費，越遠的區越多）'); h.title = '只畫得出你自己走過的地方；別人送你的部分（地圖上褐色的）畫不出來。畫好的圖可以在「手繪地圖」送給 8 公尺內的人。'; body.appendChild(h); }
  { const full = AREAS.filter(a => pc[a] >= MAP7.fullPct), unpaid = full.filter(a => !st.fee.has(a)), f04 = qx('f04') && qStatus('f04') === 'active', row = el('div', 'm7show'), tx = el('div', 'tx'), b = el('button', '', '拿給芬恩看');
    tx.innerHTML = full.length ? `走過九成的：<b>${full.map(areaName).join('、')}</b>` + (unpaid.length ? `　還沒領：${unpaid.map(a => areaName(a) + ' ' + (M.feeOf ? M.feeOf(a) : INNER.has(a) ? MAP7.fee.inner : MAP7.fee.outer) + ' 金').join('、')}` : '　測繪費都領過了') : '還沒有一區自己走過九成。抄來的地圖不算。';
    b.disabled = !(unpaid.length || (f04 && full.length)); b.onclick = () => { M.showFinn(); renderDraw(); }; row.append(tx, b); body.appendChild(row); }
  body.scrollTop = keep;
}
const survey = () => M.survey();
// 畫圖進度：平靜的細條，不倒數
function drawBar(D, nameOf) {
  const d = D.draw, b = $('m7prog'); if (!b) return; if (!d) { b.hidden = true; return; } b.hidden = false;
  const k = d.dur ? clamp(d.t / d.dur, 0, 1) : 1; b.querySelector('i').style.width = (k * 100) + '%';
  b.querySelector('span').textContent = `正在畫《${nameOf(d.area)}》${d.n > 1 ? `（第 ${d.done + 1} / ${d.n} 張）` : ''}`;
}

/* ============================== 手繪地圖 ============================== */
let whoFor = null, tearFor = null, tearT = 0, lastSig = '';
function renderMaps(soft) {
  const w = $('winMaps7'); if (!w || w.hidden) return; const body = w.querySelector('.body'), st = S(), d7 = D7();
  const targets = whoFor ? M.giftTargets() : [], sig = JSON.stringify([st.maps.map(m => m.uid), d7.gift ? [d7.gift.uid, Math.floor(d7.gift.t)] : 0, whoFor, tearFor, targets.map(t => [t.peer, Math.round(t.d)]), st.cpSrc, Object.keys(st.cpSrc).length]);
  w.querySelector('.hcount b').textContent = `${st.maps.length} / ${MAP7.maxMaps}`;
  if (soft && sig === lastSig) return; lastSig = sig; const keep = body.scrollTop; body.textContent = '';
  body.appendChild(el('div', 'm7note2', `到芬恩的繪圖桌畫；走到朋友 ${MAP7.giftR} 公尺內就能送。`));
  if (!st.maps.length) { const e = el('div', 'm7empty'); e.append(H.ic('map_blank'), el('b', '', '身上還沒有手繪地圖'), el('p', '', '到鐵環城東南市集旁芬恩的繪圖桌，用空白地圖把自己走過的一區畫下來。畫好的圖可以送給朋友。')); const b = el('button', '', '打開繪圖桌'); b.onclick = () => M.openDraw(); e.appendChild(b); body.appendChild(e); }
  for (const m of st.maps) {
    const card = el('div', 'm7card'), cv = el('canvas'); cv.width = cv.height = 192; drawThumb(cv, m, 96); const tx = el('div', 'tx');
    const pb = el('div', 'm7pb'), pf = el('i'); pf.style.width = clamp(m.pct, 0, 100) + '%'; pb.append(pf);
    tx.append(el('h4', '', `《${areaName(m.area)}》`), el('p', '', `${m.by} 畫的　${dateTxt(m.at)}`), pb, el('p', 'pt', `畫了 ${m.pct}%`));
    const bt = el('div', 'bt'), g = d7.gift && d7.gift.uid === m.uid;
    if (g) { const c = el('button', '', '收回'); c.onclick = () => M.cancelGift('收回了。'); bt.appendChild(c); const wt = el('div', 'm7wait'); wt.append(el('span', '', `等 ${d7.gift.name} 回覆…`)); const wb = el('div', 'wb'), wi = el('i'); wi.style.width = clamp(d7.gift.t / MAP7.giftT * 100, 0, 100) + '%'; wb.appendChild(wi); wt.appendChild(wb); tx.append(bt, wt); }
    else {
      const gv = el('button', whoFor === m.uid ? 'on' : '', '送給…'); gv.disabled = !!d7.gift; gv.onclick = () => { whoFor = whoFor === m.uid ? null : m.uid; tearFor = null; renderMaps(); };
      const tr = el('button', tearFor === m.uid ? 'warn' : '', tearFor === m.uid ? '確定撕掉？' : '撕掉');
      tr.onclick = () => { if (tearFor !== m.uid) { tearFor = m.uid; tearT = 4; renderMaps(); return; } st.maps = st.maps.filter(o => o !== m); tearFor = null; ui.sfx('page'); Store.dirty = true; renderMaps(); renderDraw(); };
      bt.append(gv, tr); tx.appendChild(bt);
      if (whoFor === m.uid) { const box = el('div', 'm7who'); box.appendChild(el('small', '', targets.length ? `送給誰？（${MAP7.giftR} 公尺內，對方會先看到確認框）` : `${MAP7.giftR} 公尺內沒有其他玩家。走近一點再送。`)); for (const t of targets) { const b = el('button', '', `${t.name}（${t.d.toFixed(0)} 公尺）`); b.onclick = () => { whoFor = null; M.giveMap(m.uid, t.peer); }; box.appendChild(b); } tx.appendChild(box); }
    }
    card.append(cv, tx); body.appendChild(card);
  }
  const cs = Object.keys(st.cpSrc);
  if (cs.length) { body.appendChild(el('h3', '', '收到的抄本（地圖上褐色的部分）')); const lst = el('div', 'm7cp'); for (const a of cs) { const s = st.cpSrc[a], r = el('div', 'r'); r.append(el('i'), el('span', 'nm', areaName(a)), el('span', 'by', `抄自 ${s.by}　${dateTxt(s.at)}`)); lst.appendChild(r); } body.appendChild(lst); body.appendChild(el('p', 'hint', '抄本不算探索度和測繪費，也不能再畫給別人；自己走過的地方會變回彩色。')); }
  body.scrollTop = keep;
}

/* ============================== 送圖確認框 ============================== */
function showPrompt(pr, g) {
  const tx = g.querySelector('.gTxt'), cv = g.querySelector('.g7thumb'); if (!tx) return; const m = pr.m;
  tx.textContent = ''; const a = el('div', 'l1'), b1 = el('b', '', pr.name); a.append(b1, document.createTextNode(' 想送你')); const l2 = el('div', 'l2'); l2.append(document.createTextNode('手繪地圖'), el('i', '', `《${areaName(m.area)}》`)); tx.append(a, l2, el('div', 'l3', `畫了 ${m.pct | 0}%　收下後褐色的部分就是抄來的`));
  if (cv) drawThumb(cv, m, 64);
}

/* ============================== 樣式 ============================== */
const CSS = `
body #winDraw7{left:max(332px,calc(50vw - 330px));top:max(142px,calc(50vh - 262px));transform:none;width:min(660px,calc(100vw - 350px))}
body:has(#winDraw7:not([hidden])) #prompt{visibility:hidden}
body #winMaps7{right:20px;left:auto;top:max(290px,calc(50vh - 150px));transform:none;width:min(440px,94vw);max-height:calc(100vh - max(290px,calc(50vh - 150px)) - 122px)}
body #winDraw7 header .hic .ic,body #winMaps7 header .hic .ic{width:28px;height:28px}
body #winMaps7 .hcount{font-size:12.5px;color:var(--ink-dim);margin-right:2px} body #winMaps7 .hcount b{color:var(--brass-light);font-weight:700;font-variant-numeric:tabular-nums}
body #winDraw7 .body{padding:8px 16px 8px}
body #winDraw7 .m7sup{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
body #winDraw7 .m7t{display:grid;grid-template-columns:36px minmax(0,1fr);gap:3px 9px;align-items:center;padding:7px 9px 7px 7px;border:1px solid var(--brass-dark);border-radius:6px;background:rgba(0,0,0,.28)}
body #winDraw7 .m7t .ic{grid-row:1;width:36px;height:36px}
body #winDraw7 .m7t b{display:block;font-family:var(--font-display);font-weight:500;font-size:13.5px;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body #winDraw7 .m7t small{display:block;font-size:11.5px;color:var(--ink-dim);font-variant-numeric:tabular-nums} body #winDraw7 .m7t small.no{color:var(--bad)}
body #winDraw7 .m7t button{grid-column:1/3;margin-top:3px;padding:3px 8px;font-size:12.5px}
body #winDraw7 .m7lock{padding:8px 10px;margin-bottom:10px;border-radius:6px;background:rgba(232,194,92,.1);border:1px solid rgba(232,194,92,.35);color:var(--warn);font-size:13px;line-height:1.5}
body #winDraw7 .m7h3{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.1em;color:var(--ink-dim)}
body #winDraw7 .m7h3 select{flex:none;font:inherit;font-size:12px;letter-spacing:0;font-weight:400;padding:1px 4px;background:#1c1f19;color:var(--ink);border:1px solid var(--line-strong);border-radius:4px}
body #winDraw7 .m7cols{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}
body #winDraw7 .m7ch,body #winDraw7 .m7row{display:grid;grid-template-columns:70px minmax(0,1fr) 34px 52px;gap:7px;align-items:center}
body #winDraw7 .m7ch{height:18px;font-size:11px;color:var(--ink-faint)} body #winDraw7 .m7ch b{font-family:var(--font-display);font-weight:700;font-size:12px;letter-spacing:.14em;color:var(--brass-light)}
body #winDraw7 .m7ch .sc{position:relative;height:100%} body #winDraw7 .m7ch .sc em{position:absolute;top:2px;transform:translateX(-50%);font-style:normal;font-size:11px;line-height:14px}
body #winDraw7 .m7row{padding:0;border-top:1px solid var(--line)} body #winDraw7 .m7row .nm,body #winDraw7 .m7row .pc{line-height:16px} body #winDraw7 .m7row button{padding:0 4px!important;line-height:16px} body #winDraw7 .m7row .nm{overflow:hidden;text-overflow:ellipsis;font-size:13px!important} body #winDraw7 .m7col .m7ch:not(:first-child){margin-top:5px} body #winDraw7 .m7h3{margin:6px 0 3px!important} /* 0.8 X7：22 區，列距收緊；左欄三組、右欄新地 */ body #winDraw7 .body{max-height:calc(100vh - max(142px,calc(50vh - 262px)) - 64px);overflow-y:auto}
body #winDraw7 .m7row .nm{font-family:var(--font-display);font-size:13.5px;letter-spacing:.05em;white-space:nowrap}
body #winDraw7 .m7bar{position:relative;display:block;height:9px;border-radius:2px;background:rgba(0,0,0,.5);box-shadow:inset 0 0 0 1px rgba(201,163,90,.28)}
body #winDraw7 .m7bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#e2c07e,#a97d3c);border-radius:2px 0 0 2px} body #winDraw7 .m7bar i.low{background:linear-gradient(#8a8576,#605c50)} body #winDraw7 .m7bar i.full{background:linear-gradient(#f6dca0,#d49a45);box-shadow:0 0 6px rgba(240,215,154,.55)}
body #winDraw7 .m7bar em{position:absolute;top:-3px;bottom:-3px;width:1px;background:rgba(244,236,217,.6)}
body #winDraw7 .m7row .pc{text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink-dim)} body #winDraw7 .m7row button{padding:3px 4px;font-size:12.5px;white-space:nowrap}
body #winDraw7 .m7all{display:flex;align-items:center;gap:12px;margin-top:4px;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:rgba(0,0,0,.2)}
body #winDraw7 .m7all .tx{flex:1;min-width:0} body #winDraw7 .m7all b{display:block;font-family:var(--font-display);font-weight:500;font-size:13.5px;letter-spacing:.04em} body #winDraw7 .m7all small{display:block;font-size:11.5px;color:var(--ink-dim)} body #winDraw7 .m7all button{flex:none}
body #winDraw7 .m7pgw{position:relative;height:22px;margin-top:4px} body #winDraw7 .m7note{position:absolute;inset:0;display:flex;align-items:center;font-size:11.5px;color:var(--ink-faint)} body #winDraw7 .m7note.w{font-size:12.5px;color:var(--warn)}
body #winDraw7 .m7prog{position:absolute;inset:0;border-radius:3px;background:#1a1c16;box-shadow:inset 0 0 0 1px var(--brass-dark);overflow:hidden} body #winDraw7 .m7prog[hidden]{display:none}
body #winDraw7 .m7prog i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#7a5c28,#c9a35a);transition:width .12s linear} body #winDraw7 .m7prog span{position:relative;display:block;text-align:center;font-size:12px;line-height:20px;text-shadow:0 1px 2px #000}
body #winDraw7 .m7show{display:flex;align-items:center;gap:12px;font-size:12.5px} body #winDraw7 .m7show .tx{flex:1;color:var(--ink-dim);line-height:1.5} body #winDraw7 .m7show .tx b{color:var(--ink)} body #winDraw7 .m7show button{flex:none}
body #winDraw7 p.hint{margin:10px 0 0;font-size:11.5px;color:var(--ink-faint);line-height:1.5}
body #winMaps7 .body{padding:10px 14px 12px}
body #winMaps7 .m7note2{margin:0 0 8px;font-size:12px;color:var(--ink-dim)}
body #winMaps7 .m7empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 16px;border:1px dashed var(--brass-dark);border-radius:8px;text-align:center} body #winMaps7 .m7empty .ic{width:52px;height:52px} body #winMaps7 .m7empty b{font-family:var(--font-display);font-size:15px;letter-spacing:.08em} body #winMaps7 .m7empty p{margin:0 0 4px;font-size:12.5px;color:var(--ink-dim);line-height:1.6}
body #winMaps7 .m7card{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;margin-bottom:8px;padding:8px;border:1px solid var(--line);border-radius:7px;background:rgba(0,0,0,.22)}
body #winMaps7 .m7card canvas{width:96px;height:96px;border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.5),0 0 0 1px rgba(70,44,20,.7)}
body #winMaps7 .m7card h4{margin:0;font-family:var(--font-display);font-size:15.5px;letter-spacing:.07em;line-height:1.3} body #winMaps7 .m7card p{margin:1px 0 0;font-size:12px;color:var(--ink-dim)} body #winMaps7 .m7card p.pt{font-size:11.5px;color:var(--brass-light);font-variant-numeric:tabular-nums}
body #winMaps7 .m7pb{height:5px;margin-top:6px;border-radius:2px;background:rgba(0,0,0,.5);box-shadow:inset 0 0 0 1px rgba(201,163,90,.25);overflow:hidden} body #winMaps7 .m7pb i{display:block;height:100%;background:linear-gradient(#d9b77a,#9a6f35)}
body #winMaps7 .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px} body #winMaps7 .bt button{padding:3px 10px;font-size:12.5px} body #winMaps7 .bt button.on{border-color:var(--ember);color:var(--ember);background:rgba(242,162,74,.12)} body #winMaps7 .bt button.warn{border-color:var(--bad);color:#f0b0a4;background:rgba(226,114,95,.12)}
body #winMaps7 .m7who{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:6px 8px;border-radius:5px;background:rgba(0,0,0,.28);border:1px solid var(--line)} body #winMaps7 .m7who small{width:100%;font-size:11.5px;color:var(--ink-dim)} body #winMaps7 .m7who button{padding:3px 10px;font-size:12.5px}
body #winMaps7 .m7wait{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--ink-dim)} body #winMaps7 .m7wait .wb{flex:1;height:3px;border-radius:2px;background:rgba(0,0,0,.5);overflow:hidden} body #winMaps7 .m7wait .wb i{display:block;height:100%;background:#b98a4a;transition:width .5s linear}
body #winMaps7 h3{margin:12px 0 6px}
body #winMaps7 .m7cp{display:grid;gap:3px;font-size:12.5px} body #winMaps7 .m7cp .r{display:flex;align-items:center;gap:8px;padding:3px 0;border-top:1px solid var(--line)} body #winMaps7 .m7cp .r i{flex:none;width:12px;height:12px;border-radius:2px;background:repeating-linear-gradient(135deg,#a07840 0 2px,#e0c996 2px 4px);box-shadow:0 0 0 1px rgba(70,44,20,.8)} body #winMaps7 .m7cp .nm{font-family:var(--font-display);letter-spacing:.05em} body #winMaps7 .m7cp .by{margin-left:auto;color:var(--ink-dim)}
body #winMaps7 p.hint{margin:8px 0 0;font-size:11.5px;color:var(--ink-faint);line-height:1.5}
body #gift7{right:16px;bottom:126px;width:316px;padding:11px 14px 0;z-index:60;background:var(--panel);border:1px solid var(--brass-dark);border-top:2px solid var(--brass)}
body #gift7 .g7row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:center} body #gift7 .g7thumb{width:64px;height:64px;border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.5),0 0 0 1px rgba(70,44,20,.7)}
body #gift7 .gTxt{font-size:13.5px;line-height:1.5;text-align:left} body #gift7 .gTxt b{font-family:var(--font-display);font-size:15px;letter-spacing:.05em;color:var(--brass-light)} body #gift7 .gTxt .l2 i{font-style:normal;font-family:var(--font-display);color:#e6c890;letter-spacing:.04em} body #gift7 .gTxt .l3{font-size:11.5px;color:var(--ink-dim);line-height:1.45;margin-top:2px}
body #gift7 .gBtns{display:flex;gap:8px;justify-content:center;margin:10px 0 11px} body #gift7 .gBtns button{flex:1;padding:5px 10px;font-size:14px} body #gift7 .gBtns button.primary{padding:5px 10px;font-size:14px}
body #gift7 .gBar{height:3px;margin:0 -14px;background:rgba(0,0,0,.5)} body #gift7 .gBar i{display:block;height:100%;background:var(--brass);transform-origin:left center}
`;

/* ============================== 啟動 ============================== */
let dressed = false;
function dress() {
  if (dressed) return; const wd = $('winDraw7'), wm = $('winMaps7'), g = $('gift7'); if (!wd || !wm || !g) return; dressed = true;
  const head = (w, icon, right) => { const h = w.querySelector('header'), hic = el('span', 'hic'); hic.appendChild(H.ic(icon, 'bare')); h.insertBefore(hic, h.firstChild); h.insertBefore(right, h.querySelector('.x')); };
  const hg = el('span', 'hgold'); hg.title = '你的金幣'; hg.append(H.ic('gold', 'bare'), el('b', '', '0')); head(wd, 'map_drawn', hg);
  const hc = el('span', 'hcount'); hc.append(document.createTextNode('帶著 '), el('b', '', '0 / 5')); head(wm, 'map_drawn', hc);
  g.innerHTML = '<div class="g7row"><canvas class="g7thumb" width="128" height="128"></canvas><div class="gTxt"></div></div><div class="gBtns"><button class="primary" id="gift7Yes"><kbd>Y</kbd>收下</button><button id="gift7No"><kbd>N</kbd>不要</button></div><div class="gBar"><i></i></div>';
  $('gift7Yes').onclick = () => M.answer(true); $('gift7No').onclick = () => M.answer(false);
}
export function init(h) {
  H = h; if (!$('ui07m-css')) { const st = el('style'); st.id = 'ui07m-css'; st.textContent = CSS; document.head.appendChild(st); }
  M.deco.roadFlat = !window.__noRoadFlat; M.deco.inkRoads = inkRoads; M.deco.word = word; M.deco.renderDraw = renderDraw; M.deco.renderMaps = renderMaps; M.deco.drawBar = drawBar; M.deco.showPrompt = showPrompt;
  dress(); let acc = 0, sig = '';
  H.onTick(dt => {
    dress(); acc += dt; if (acc < 0.4) return; acc = 0;
    const wd = $('winDraw7');
    if (wd && !wd.hidden) { const d7 = D7(), s = [M.nearTable(MAP7.tableR + 3), P.gold, P.inv.map_blank | 0, P.inv.map_big | 0, S().maps.length, !!d7.draw, M.canDrawAt(), Object.values(M.pcts()).map(v => Math.floor(v * 100)).join()].join('|'); if (s !== sig) { sig = s; renderDraw(); } }
    if (tearFor && (tearT -= 0.4) <= 0) { tearFor = null; renderMaps(); }
  });
}
