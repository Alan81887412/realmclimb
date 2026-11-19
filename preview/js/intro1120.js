/* 11-20 F4：迎新與劇情文字的新呈現（取代旁白條 #narr 的版面與速度）。
   切換：網址 ?intro=a（電影字幕）｜?intro=b（對白框＋旁白卡）；沒有參數＝維持原本的旁白條（localStorage intro1120 可代替網址參數，測試用）。
   佇列仍是 ui.js 的 narrQ（字串或 { t, again, k }），這裡只管「怎麼顯示」。k：'intro'＝開場白（LORE.intro）、'toby'＝托比迎新、其他＝一般旁白。
   速度：設定裡的「文字速度」慢／中／快／立即（預設中）。逐字速度以每秒字數計。 */
const QS = new URLSearchParams(location.search);
const DEFAULT = 'b';      /* 預覽版（11-20）預設 b；?intro=a 或 ?intro=off（舊旁白條，對照用）可切換 */
let want = QS.get('intro'); if (want !== 'a' && want !== 'b' && want !== 'off') { try { want = localStorage.getItem('intro1120'); } catch (e) { want = null; } }
export const MODE = want === 'a' || want === 'b' ? want : want === 'off' ? 'off' : DEFAULT;
export const SPEEDS = { slow: 14, mid: 36, fast: 80, now: Infinity };      /* 每秒幾字 */
const HOLD_K = { slow: 1.5, mid: 1, fast: 0.75, now: 0.6 };                /* 停留時間的倍率 */
let C = null, cur = null, gap = 0, root = null, cardEl = null, lastK = '';
const ended = new Set();                                                    /* 已經顯示完或被跳過的句子（welcome08 用它判斷第六句講完沒有） */
const speedKey = () => { const s = C && C.speed && C.speed(); return SPEEDS[s] ? s : 'mid'; };
const kindOf = it => (typeof it === 'object' && it.k) || ((typeof it === 'string' ? it : it.t).indexOf('托比：「') === 0 ? 'toby' : 'misc');
const SPK = /^([^：「]{1,8})：「([\s\S]*)」$/;
function split(t) { const m = SPK.exec(t); return m ? { name: m[1], text: m[2] } : { name: '', text: t }; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function build() {
  root = el('div', 'i11 m' + MODE); root.id = 'i11';
  root.innerHTML = '<div class="i11band"></div><div class="i11box"><div class="i11who"><b></b><span></span></div><p class="i11txt"><span class="v"></span><span class="h"></span></p><div class="i11hint"></div></div><button class="i11skip" type="button">跳過 ▶▶</button>';
  document.body.appendChild(root);
  root.querySelector('.i11box').addEventListener('click', () => advance());
  root.querySelector('.i11skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  if (MODE === 'b') {
    cardEl = el('div', 'i11card'); cardEl.id = 'i11card';
    cardEl.innerHTML = '<div class="i11cardin"><div class="i11kick">第 一 層</div><div class="i11paras"></div></div><div class="i11cardhint"></div><button class="i11skip" type="button">跳過 ▶▶</button>';
    document.body.appendChild(cardEl);
    cardEl.addEventListener('click', e => { if (e.target.closest('.i11skip')) return; advance(); });
    cardEl.querySelector('.i11skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  }
  window.addEventListener('keydown', e => {
    if (!cur || cur.k === 'misc' || (e.code !== 'Space' && e.code !== 'Enter') || e.repeat) return;
    if (e.code === 'Enter' && !(cur.k === 'intro' && MODE === 'b')) return;      /* Enter 是「說話」鍵，只有全螢幕旁白卡時才當成跳過 */
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault(); e.stopPropagation(); if (e.code === 'Enter') skip(); else advance();
  }, true);
}
export function init(ctx) { C = ctx; if (MODE === 'off') return; build(); }

/* ---------- 一句的生命週期：打字 → 停留 → 淡出 ---------- */
function holdOf(len) { return (1.1 + len * 0.045) * HOLD_K[speedKey()]; }
function start(it) {
  const k = kindOf(it), raw = typeof it === 'string' ? it : it.t, again = typeof it === 'object' && it.again;
  const sp = split(raw); let name = sp.name, title = '';
  if (name) { const o = C.npcOf && C.npcOf(name); if (o) title = o.title || ''; }
  cur = { raw, k, name, title, text: sp.text, n: 0, done: false, hold: 0, card: MODE === 'b' && k === 'intro' };
  if (!again) C.log(raw);
  if (cur.card) return startPara();
  const who = root.querySelector('.i11who'); who.hidden = !name; who.querySelector('b').textContent = name; who.querySelector('span').textContent = title;
  root.dataset.who = name ? '1' : '0'; root.dataset.k = k;
  root.querySelector('.i11hint').textContent = k === 'misc' ? '' : '空白鍵　加速／下一句';
  root.querySelector('.i11skip').hidden = k === 'misc';
  paint(); root.classList.add('on');
  if (SPEEDS[speedKey()] === Infinity) cur.n = cur.text.length;
}
function paint() {
  const v = root.querySelector('.v'), h = root.querySelector('.h'), n = Math.floor(cur.n);
  v.textContent = cur.text.slice(0, n); h.textContent = cur.text.slice(n);
}
/* 旁白卡（B）：開場白的每一句是一個段落，淡入後留在畫面上；整組結束才收起 */
function startPara() {
  const box = cardEl.querySelector('.i11paras'), p = el('p', 'i11p', cur.text); box.appendChild(p); void p.offsetWidth; p.classList.add('on');
  cardEl.querySelector('.i11cardhint').textContent = '點一下　下一段　｜　Enter　跳過';
  cardEl.classList.add('on'); cur.done = true; cur.n = cur.text.length; cur.hold = 0;
}
function finishLine() {
  if (!cur) return; ended.add(cur.raw); const wasCard = cur.card, k = cur.k; lastK = k; cur = null; gap = wasCard ? 0.35 : 0.45;
  if (!wasCard) root.classList.remove('on');
  /* 卡片：後面沒有開場白的句子了，就收起來 */
  if (wasCard && !C.queue.some(q => kindOf(q) === 'intro')) closeCard();
}
function closeCard() { if (!cardEl) return; cardEl.classList.remove('on'); setTimeout(() => { if (!cardEl.classList.contains('on')) cardEl.querySelector('.i11paras').textContent = ''; }, 900); }
/* 加速：打字中 → 直接顯示完整；已經顯示完 → 下一句 */
export function advance() {
  if (!cur) return;
  if (!cur.card && !cur.done) { cur.n = cur.text.length; paint(); cur.done = true; cur.hold = 0; return; }
  finishLine();
}
/* 跳過：這一組（開場白或托比迎新）剩下的全部略過，並寫進左下角的紀錄讓人重看 */
export function skip() {
  if (!cur) return; const k = cur.k; const drop = [];
  for (let i = C.queue.length - 1; i >= 0; i--) if (kindOf(C.queue[i]) === k) { const q = C.queue.splice(i, 1)[0]; drop.unshift(typeof q === 'string' ? q : q.t); }
  for (const t of drop) { ended.add(t); C.log(t); }
  const wasCard = cur.card; ended.add(cur.raw); cur = null; gap = 0.3; root.classList.remove('on'); if (wasCard) closeCard();
}
export function tick(dt) {
  if (!root) return;
  const talk = C.talking();
  if (!cur) {
    root.classList.toggle('talk', talk);
    if (!C.queue.length || talk) return;
    if ((gap -= dt) > 0) return;
    /* 開場白還沒講完時，托比的迎新排在後面（narrFront 會插到最前面，這裡把開場白的句子先拿出來） */
    let i = 0; if (lastK === 'intro') { const j = C.queue.findIndex(q => kindOf(q) === 'intro'); if (j > 0) i = j; }
    start(C.queue.splice(i, 1)[0]); return;
  }
  if (talk) return;                                                         /* 交談中先暫停，講完接著播 */
  if (!cur.done) {
    const cps = SPEEDS[speedKey()]; cur.n += cps === Infinity ? 999 : cps * dt;
    if (cur.n >= cur.text.length) { cur.n = cur.text.length; cur.done = true; cur.hold = 0; }
    paint(); return;
  }
  cur.hold += dt;
  let need = cur.card ? (0.9 + cur.text.length * 0.1) * HOLD_K[speedKey()] : holdOf(cur.text.length);
  if (cur.card && !C.queue.some(q => kindOf(q) === 'intro')) need += 2.2;      /* 最後一段多留一會兒 */
  if (cur.hold >= need) finishLine();
}
export const state = () => cur ? { k: cur.k, text: cur.text, done: cur.done, n: Math.floor(cur.n) } : null;
export const hasEnded = t => ended.has(t);
export const active = () => !!cur;
/* 重看：測試與日後「設定／任務日誌」的重看入口用（本版沒有接到畫面上） */
export function replay(lines, k) { for (const t of lines) C.queue.push({ t, k, again: 0 }); }
export const dbg = () => ({ cur: cur && { k: cur.k, done: cur.done, hold: +cur.hold.toFixed(2), card: cur.card }, q: C.queue.length, gap: +gap.toFixed(2), lastK });
