// 0.7 介面（d7-ui-b）：委託板視窗美化、已接委託進追蹤欄與任務日誌、瑪歌對話的「委託板」選項
// 邏輯（接、撕、交件、進度）全在 board07.js，這裡只「讀」：B7.debug.S()／CBY、B7.progress、B7.reward。
// 掛鉤：ui.js 的補丁（ui.js-patch.py）呼叫 tracker(box)、tabLabel(btn, on)、renderLog(listBox, detailBox)；board07.js 的補丁把 deco.render 指到這裡。
import * as B7 from './board07.js';
import { SERVICES } from './data06.js';
import { ITEMS, MON } from './core.js';
import { P, NPCS } from './game.js';

let H = null;
const KIND = { hunt: '狩獵', mat: '保底素材', gather: '採集', cook: '下廚', deliver: '送貨', survey: '測繪', fish: '釣魚' };
const kindIc = k => 'card_' + (k === 'mat' ? 'hunt' : k);
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const S = () => { try { return B7.debug.S(); } catch (e) { return { c: [], a: [] }; } };
const CBY = () => B7.debug.CBY;
const icon = (id, cls) => { try { return H.ic(id, cls); } catch (e) { return el('span'); } };
const who = c => { const n = NPCS[c.by]; return n ? `${n.title} ${n.name}` : ''; };
const whoShort = c => { const n = NPCS[c.by]; return n ? n.name : ''; };
// 已接的卡（只留資料還在的）；每項 { x, c, p: [目前, 需要, 說明], done }
function accepted() {
  const by = CBY(), out = [];
  for (const x of S().a) { const c = by[x.id]; if (!c) continue; const p = B7.progress(x); out.push({ x, c, p, done: p[0] >= p[1] }); }
  return out;
}
function goalText(c) {
  const g = c.goal;
  if (g.kill) return `擊敗${(MON[g.kill] || {}).name || g.kill}×${g.n}${g.min > 1 ? `（${g.min} 級以上）` : ''}`;
  if (g.give) return '交 ' + Object.entries(g.give).map(([id, n]) => `${(ITEMS[id] || {}).name || id}×${n}`).join('、');
  return (c.kind === 'deliver' ? '送到' : '走到') + g.reach.name;
}
function rewardRow(c, cls) {
  const R = B7.reward(c), row = el('div', cls || 'qrew'), add = (ic, text) => { const s = el('span'); if (ic) s.append(icon(ic, 'bare')); s.append(text); row.append(s); };
  if (R.exp) add(null, `經驗 ${R.exp}`);
  if (R.gold) add('gold', `${R.gold} 金幣`);
  for (const it in R.items) add(it, `${(ITEMS[it] || {}).name || it} ×${R.items[it]}`);
  return row;
}
const bar = (p, done) => { const b = el('div', 'b7bar' + (done ? ' full' : '')), i = el('i'); i.style.width = Math.round(100 * Math.min(1, p[0] / Math.max(1, p[1]))) + '%'; b.append(i); return b; };

/* ============================== 追蹤欄：委託 n / 3 ============================== */
function trackerBlock(list, tight) {
  const d = el('div', 'tq b7t' + (tight ? ' tight' : '')), h = el('b', '', `委託 ${list.length} / 3`); d.append(h);
  for (const { c, p, done } of list) {
    const r = el('div', 'b7tr' + (done ? ' ok' : '')), k = done ? el('i', 'b7ck', '✓') : icon(kindIc(c.kind), 'bare'); k.classList.add('b7tk');
    r.append(k, el('span', 'b7tt', c.title));
    if (tight) r.append(el('em', 'b7tn', done ? '完成' : `${p[0]} / ${p[1]}`));
    else r.append(el('em', 'b7tp', done ? '完成，回酒館門口的委託板交件' : p[2]));
    d.append(r);
  }
  return d;
}
export function tracker(box) {
  if (!H) return;
  const list = accepted(); if (!list.length) return;
  let d = trackerBlock(list, false); box.append(d); box.hidden = false;
  // 太高會壓到左下的聊天框：收成一行一張
  const chat = document.getElementById('chat'); if (!chat) return;
  if (box.getBoundingClientRect().bottom > chat.getBoundingClientRect().top - 10) { const t = trackerBlock(list, true); d.replaceWith(t); }
}

/* ============================== 任務日誌：「委託」分頁 ============================== */
let sel = null;
export function anyReady() { try { return accepted().some(e => e.done); } catch (e) { return false; } }
export function tabLabel(btn, on) { btn.textContent = `委託 ${S().a.length}`; btn.classList.toggle('on', on); btn.title = `進行中 ${S().a.length}　已完成 ${(S().d || []).length}`; }
/* 0.8 X7（R6）：做完的委託也留在這一頁，以故事為主（使用者 11/17：已完成的留存緣由與結果）。緣由＝貼卡人寫在卡上的話（text）、結果＝交件時他說的（done）、紀錄（目標、獎勵）縮小放最後；樣式和主線的故事頁共用（.qsh／.qsay／.qrec） */
function doneCards() { const by = CBY(), d = (S().d || []).slice().reverse(); return d.map(id => by[id]).filter(Boolean); }
function storyCard(detail, c) {
  const meta = el('div', 'qmeta'), kt = el('span', 'b7kind k-' + c.kind, KIND[c.kind]); kt.prepend(icon(kindIc(c.kind), 'bare')); meta.append(kt, el('span', '', `Lv ${c.lv}`), el('span', '', '已交件'));
  const q = (by, t) => { const b = el('div', 'qsay'); if (by) b.append(el('b', '', by)); b.append(el('p', '', t)); return b; };
  detail.append(el('h4', '', c.title), meta, el('h3', 'qsh', '緣由'), q(who(c), c.text));
  if (c.done) detail.append(el('h3', 'qsh', '結果'), q(who(c), c.done));
  const rec = el('div', 'qrec'); rec.append(el('h3', '', '紀錄'), el('p', 'qgiver', `貼卡的人：${who(c)}　交件：九十九場酒館門口的委託板`), el('p', 'qgiver', '目標：' + goalText(c) + (c.goal.where ? `（${c.goal.where}）` : '')), el('p', 'qgiver', '拿到的獎勵：'), rewardRow(c));
  detail.append(rec);
}
export function renderLog(listBox, detail) {
  const list = accepted(), fin = doneCards(); listBox.textContent = ''; detail.textContent = '';
  if (!list.some(e => e.x.id === sel) && !(typeof sel === 'string' && sel.startsWith('d:') && fin.some(c => 'd:' + c.id === sel))) sel = list.length ? list[0].x.id : fin.length ? 'd:' + fin[0].id : null;
  const finList = () => { if (!fin.length) return; listBox.append(el('p', 'b7lh', `已完成 ${fin.length}`)); for (const c of fin) { const b = el('button', 'qi b7qi b7done' + ('d:' + c.id === sel ? ' on' : '')), k = icon(kindIc(c.kind), 'bare'); k.classList.add('b7qk'); b.append(k, el('span', 'nm', c.title), el('small', '', `${KIND[c.kind]}　${whoShort(c)}`)); b.onclick = () => { sel = 'd:' + c.id; H.sfx('click'); H.renderQuests(); }; listBox.append(b); } };
  if (typeof sel === 'string' && sel.startsWith('d:')) { for (const e of list) { const b = el('button', 'qi b7qi' + (e.done ? ' ready' : '')), k = icon(kindIc(e.c.kind), 'bare'); k.classList.add('b7qk'); b.append(k, el('span', 'nm', e.c.title), el('small', '', e.done ? '可以交件' : `${KIND[e.c.kind]}　${e.p[2]}`)); b.onclick = () => { sel = e.x.id; H.sfx('click'); H.renderQuests(); }; listBox.append(b); } finList(); storyCard(detail, CBY()[sel.slice(2)]); return; }
  if (!list.length) {
    listBox.append(el('p', 'empty', '還沒有接委託。'));
    detail.append(el('h4', '', '委託'), el('p', 'qdesc', '九十九場酒館門口有一塊委託板，板上永遠有三張。接下的委託會出現在這裡，也會出現在畫面左側。'), el('p', 'qnote dim', '最多同時接 3 張，沒有期限；做完回到板子交件，瑪歌代付。'));
    finList(); return;
  }
  for (const e of list) {
    const b = el('button', 'qi b7qi' + (e.x.id === sel ? ' on' : '') + (e.done ? ' ready' : '')), k = icon(kindIc(e.c.kind), 'bare'); k.classList.add('b7qk');
    b.append(k, el('span', 'nm', e.c.title), el('small', '', e.done ? '可以交件' : `${KIND[e.c.kind]}　${e.p[2]}`));
    b.onclick = () => { sel = e.x.id; H.sfx('click'); H.renderQuests(); }; listBox.append(b);
  }
  const e = list.find(e => e.x.id === sel), c = e.c, g = c.goal, meta = el('div', 'qmeta');
  const kt = el('span', 'b7kind k-' + c.kind, KIND[c.kind]); kt.prepend(icon(kindIc(c.kind), 'bare'));
  const low = P.lv < c.lv;
  meta.append(kt, el('span', low ? 'low' : '', `Lv ${c.lv}` + (low ? `（你現在 ${P.lv} 級）` : '')), el('span', '', who(c)));
  const quote = el('blockquote', 'b7quote'); quote.append(el('p', '', c.text), el('cite', '', `——${whoShort(c)}`));
  detail.append(el('h4', '', c.title), meta, quote, el('h3', '', '目標'));
  const ul = el('ul', 'qobj'), li = el('li', e.done ? 'ok' : ''), mk = el('i', '', e.done ? '✓' : ''), sp = el('span', '', goalText(c));
  if (g.where) sp.append(el('small', '', g.where)); else if (g.reach && !e.done) sp.append(el('small', '', '走到那一帶就算'));
  li.append(mk, sp); if (g.kill || g.give) li.append(el('em', '', `${e.p[0]} / ${e.p[1]}`)); else li.append(el('em', '', e.done ? '到過了' : '還沒到'));
  ul.append(li); detail.append(ul, bar(e.p, e.done), el('h3', '', '獎勵'), rewardRow(c));
  if (c.kind === 'hunt' || c.kind === 'mat') detail.append(el('p', 'qnote dim', '途中打倒的野獸，經驗與掉落照常。'));
  detail.append(el('p', 'qnote' + (e.done ? '' : ' dim'), e.done ? '目標完成了。回九十九場酒館門口的委託板交件，瑪歌代付。' : '做完回九十九場酒館門口的委託板交件，瑪歌代付。'));
  finList();
}

/* ============================== 委託板視窗：每次 render() 後補上進度條與主要按鈕 ============================== */
function decoBoard(win, s) {
  const hic = win.querySelector('header .hic'); if (hic) hic.replaceChildren(icon('card_hunt'));      // 圖示在開機時可能還沒載好，每次畫都換一次
  const rows = win.querySelectorAll('#b7acc .b7row'), list = accepted();
  rows.forEach((row, i) => {
    const e = list[i]; if (!e) return;
    const k = icon(kindIc(e.c.kind), 'bare'); k.classList.add('b7rk'); row.prepend(k);
    const info = row.querySelector('.b7ri'); if (info) { info.querySelector('.ic.b7ki, img.b7ki')?.remove(); info.append(bar(e.p, e.done)); }
    const go = row.querySelector('.b7btns button:not(.quiet)'); if (go && !go.disabled) go.classList.add('primary');
  });
}

/* ============================== 樣式 ============================== */
const CSS = `
#qList .b7lh{margin:10px 2px 4px;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:var(--ink-faint)} #qList .b7done{opacity:.86} #qList .b7done .nm{color:var(--ink-dim)}      /* 0.8 X7：已完成的委託 */
/* --- 追蹤欄的委託 --- */
body .tq.b7t{border-left-color:var(--brass)}
body .tq.b7t>b{font-family:var(--font-body);font-size:11px;font-weight:600;letter-spacing:.16em;color:var(--brass-light,#e2c387);gap:5px}
body .tq.b7t span{padding-left:0;display:block}body .tq.b7t span::before{display:none}
body .tq.b7t .b7tk{display:block;width:16px;height:16px;padding:0}body .tq.b7t .b7tk .ic,body .tq.b7t .ic{width:16px;height:16px;padding:0;display:block}
body .b7ck{font-style:normal;font-weight:700;font-size:13px;line-height:16px;text-align:center;color:var(--ok)}
body .b7tr{display:grid;grid-template-columns:16px 1fr auto;column-gap:6px;align-items:baseline;padding:2px 0 0}
body .b7tr .b7tk{width:16px;height:16px;align-self:center;grid-row:1}
body .b7tt{grid-column:2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:1.4;color:var(--ink)}
body .b7tp{grid-column:2/4;display:block;font-style:normal;font-size:12px;line-height:1.4;color:var(--ink-dim)}
body .b7tn{grid-column:3;font-style:normal;font-size:12px;color:var(--ink-dim)}
body .b7tr.ok .b7tp,body .b7tr.ok .b7tn{color:var(--ok)}
body .b7tr.ok .b7tt{color:var(--ink-dim)}
/* --- 任務日誌 --- */
body .qSide{width:300px}
body #qTabs{gap:4px;margin-right:12px}
body #qTabs button{padding:4px 0;font-size:12px}
body .b7qi .b7qk,body .qi .b7qk{grid-row:1/3;width:26px;height:26px}
body .b7qi small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body #qDetail .b7kind{display:inline-flex;align-items:center;gap:4px;padding:1px 7px 1px 4px;border-radius:3px;background:#5d4630;color:#f4ecd9;letter-spacing:.06em;font-size:11.5px}
body #qDetail .b7kind .ic{width:16px;height:16px}
body #qDetail .b7kind.k-hunt,body #qDetail .b7kind.k-mat{background:#8c3a2b}body #qDetail .b7kind.k-gather{background:#4f7a3a}body #qDetail .b7kind.k-cook{background:#a8642a}body #qDetail .b7kind.k-deliver{background:#5a5f8c}body #qDetail .b7kind.k-survey{background:#3f6f7a}body #qDetail .b7kind.k-fish{background:#2f6a94}
body .b7quote{margin:10px 0 0;padding:8px 12px;border-left:2px solid var(--brass);background:rgba(201,163,90,.07);border-radius:0 4px 4px 0}
body .b7quote p{margin:0;font-size:13.5px;line-height:1.75}
body .b7quote cite{display:block;margin-top:3px;text-align:right;font-style:normal;font-size:12px;color:var(--ink-dim)}
/* --- 進度條（任務日誌、委託板共用） --- */
body .b7bar{height:4px;margin:4px 0 0;border-radius:2px;background:rgba(244,236,217,.12);overflow:hidden}
body .b7bar i{display:block;height:100%;background:var(--brass);border-radius:2px}
body .b7bar.full i{background:var(--ok)}
body #qDetail .b7bar{margin:2px 0 10px}
/* --- 委託板視窗：位置（不壓左上狀態、右上懷錶、下方快捷列）與 0.6 家族的版面 --- */
body #winBoard7{left:max(330px,calc(50vw - 330px));--t:max(calc(var(--plateB,150px) + 8px),calc(50vh - 300px));top:var(--t);bottom:auto;transform:none;margin:0;width:min(660px,calc(100vw - 346px));max-height:calc(100vh - var(--t) - 16px)}
body #winBoard7 header{gap:8px}
body #winBoard7 header h2{display:flex;align-items:baseline;flex:1}
body #winBoard7 header h2 small{font-size:12px;letter-spacing:.1em;color:var(--ink-dim);font-weight:400;margin-left:12px}
body #winBoard7 .hgold{gap:5px;font-size:14px;margin-right:4px}
body #winBoard7 .body{padding:10px 14px 12px}
body #winBoard7 .b7rule{margin:0 0 8px;font-size:12px;color:var(--ink-dim)}
body #winBoard7 h3{margin:12px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.14em;color:var(--ink-dim)}
body #winBoard7 .b7cards{gap:10px;padding:12px 10px 10px;background:linear-gradient(#6b4a2c,#5a3d24);border:1px solid #3b2716;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(255,220,160,.08),inset 0 2px 8px rgba(0,0,0,.35)}
body #winBoard7 .b7card{padding:13px 10px 8px;gap:2px}
body #winBoard7 .b7text{font-size:11.5px;line-height:1.4}
body #winBoard7 .b7title{font-family:var(--font-display);font-size:15px}
body #winBoard7 .b7goal{margin-top:auto}
body #winBoard7 .b7rw{padding-top:1px;gap:3px 8px}
body #winBoard7 .b7card .b7btns{margin-top:6px;gap:8px;align-items:center}
body #winBoard7 .b7card .b7btns button{border-radius:3px}
body #winBoard7 .b7card .b7btns button.go{flex:2;padding:5px 0;font-size:13px}
body #winBoard7 .b7card .b7btns button.quiet{flex:1;padding:2px 0;font-size:11.5px;border:0;background:none;color:#7a6650;text-decoration:underline dotted;text-underline-offset:3px}
body #winBoard7 .b7card .b7btns button.quiet:hover{background:none;color:#3a2a1c}
/* 已接的委託：0.6 的列樣式（左邊一條線）＋進度條 */
body #winBoard7 .b7row{grid-template-columns:26px 1fr auto auto;gap:4px 12px;padding:4px 10px 4px 8px;margin-bottom:3px;border:0;border-left:2px solid var(--brass-dark,#8a6d33);border-radius:0 4px 4px 0;background:rgba(244,236,217,.04)}
body #winBoard7 .b7row.ready{border-left-color:var(--ok);background:rgba(143,208,138,.08)}
body #winBoard7 .b7rk{width:26px;height:26px}
body #winBoard7 .b7ri{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center}
body #winBoard7 .b7ri .b7bar{grid-column:2;grid-row:2;margin:0;max-width:140px}
body #winBoard7 .b7ri .b7prog{grid-column:1;grid-row:2;white-space:nowrap}
body #winBoard7 .b7ri .b7who{grid-column:2;grid-row:1}
body #winBoard7 .b7ri b{font-family:var(--font-display);font-size:14px}
body #winBoard7 .b7ri .b7who{font-size:11px}
body #winBoard7 .b7ri .b7prog{font-size:12px;color:var(--ink-dim)}
body #winBoard7 .b7row.ready .b7prog{color:var(--ok)}
body #winBoard7 .b7row .b7rw{font-size:12px;color:var(--ink-dim)}
body #winBoard7 .b7row .b7rw .ic{width:16px;height:16px}
body #winBoard7 .b7row .b7btns{gap:8px;align-items:center}
body #winBoard7 .b7row .b7btns button{padding:4px 12px;font-size:13px}
body #winBoard7 .b7row .b7btns button.primary{padding:5px 16px;font-size:13px;border-color:var(--ember);color:#241a0c}
body #winBoard7 .b7row .b7btns button.quiet{border:0;background:none;color:var(--ink-faint);padding:4px 4px;font-size:11.5px;text-decoration:underline dotted;text-underline-offset:3px}
body #winBoard7 .b7row .b7btns button.quiet:hover{color:var(--ink-dim)}
body #winBoard7 .b7last{margin:8px 0 0;font-size:12.5px;color:var(--brass-light,#e2c387)}
`;

/* ============================== 初始化 ============================== */
export function init(h) {
  H = h; if (document.getElementById('ui07b-css')) return;
  const st = document.createElement('style'); st.id = 'ui07b-css'; st.textContent = CSS; document.head.appendChild(st);
  // 瑪歌（酒館）：看看委託板（放在最後，不改變原本選項的數字鍵）
  try { const L = SERVICES.tavern; if (L && !L.some(o => o[0] === 'board7')) L.push(['board7', '看看委託板（接委託、交件）']); } catch (e) {}
  // 委託板視窗：標題列左邊一個圖示
  try {
    const w = document.getElementById('winBoard7'), hd = w && w.querySelector('header');
    if (hd && !hd.querySelector('.hic')) { const s = el('span', 'hic'); s.append(icon('card_hunt')); hd.prepend(s); }
    B7.deco.render = decoBoard;
  } catch (e) { console.warn('ui07b：委託板掛鉤失敗', e); }
  // 任務日誌：第四個分頁
  try { const t = document.getElementById('qTabs'); if (t && !t.querySelector('[data-t="board"]')) { const b = el('button', '', '委託 0'); b.dataset.t = 'board'; t.append(b); } } catch (e) {}
  // 進度變了（擊殺、撿東西、走到地點）就更新追蹤欄與（開著的）任務日誌；ui.dirty 在 board07 接／交件時已會設
  let acc = 0, sig = '';
  H.onTick(dt => {
    acc += dt; if (acc < 0.5) return; acc = 0;
    let s = ''; try { s = accepted().map(e => e.x.id + e.p[0] + '/' + e.p[1]).join('|'); } catch (e) {}
    if (s !== sig) { sig = s; H.renderTracker(); H.renderQuests(); }
  });
}
