/* 11-20 F4：迎新與劇情文字的新呈現（取代旁白條 #narr 的版面與速度）。
   切換：網址 ?intro=a（電影字幕）｜?intro=b（對白框＋旁白卡）；沒有參數＝維持原本的旁白條（localStorage intro1120 可代替網址參數，測試用）。
   佇列仍是 ui.js 的 narrQ（字串或 { t, again, k }），這裡只管「怎麼顯示」。k：'intro'＝開場白（LORE.intro）、'toby'＝托比迎新、其他＝一般旁白。
   速度：設定裡的「文字速度」慢／中／快／立即（預設中）。逐字速度以每秒字數計。 */
const QS = new URLSearchParams(location.search);
const DEFAULT = 'c';      /* 正式設定（11-20 使用者定案）：c＝開場白用 B 的全螢幕旁白卡、托比迎新與其他旁白用 A 的電影字幕。?intro=a｜b｜off（舊旁白條，對照用）仍可切換 */
let want = QS.get('intro'); if (want !== 'a' && want !== 'b' && want !== 'c' && want !== 'off') { try { want = localStorage.getItem('intro1120'); } catch (e) { want = null; } }
export const MODE = want === 'a' || want === 'b' || want === 'c' || want === 'off' ? want : DEFAULT;
const CARD = MODE === 'b' || MODE === 'c';           /* 開場白用全螢幕旁白卡 */
export const hasCard = () => CARD;
export const SPEEDS = { slow: 14, mid: 36, fast: 80, now: Infinity };      /* 每秒幾字 */
const HOLD_K = { slow: 1.5, mid: 1, fast: 0.75, now: 0.6 };                /* 停留時間的倍率 */
let C = null, curEl = null, cur = null, gap = 0, root = null, cardEl = null, lastK = '';
const ended = new Set();                                                    /* 已經顯示完或被跳過的句子（welcome08 用它判斷第六句講完沒有） */
const speedKey = () => { const s = C && C.speed && C.speed(); return SPEEDS[s] ? s : 'mid'; };
const kindOf = it => (typeof it === 'object' && it.k) || ((typeof it === 'string' ? it : it.t).indexOf('托比：「') === 0 ? 'toby' : 'misc');
const SPK = /^([^：「]{1,8})：「([\s\S]*)」$/;
function split(t) { const m = SPK.exec(t); return m ? { name: m[1], text: m[2] } : { name: '', text: t }; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function build() {
  root = el('div', 'i11 m' + MODE); root.id = 'i11'; curEl = el('div'); curEl.id = 'i11cur'; document.body.appendChild(curEl);
  root.innerHTML = '<div class="i11band"></div><div class="i11box"><div class="i11who"><b></b><span></span></div><p class="i11txt"><span class="v"></span><span class="h"></span></p><div class="i11hint"></div></div><button class="i11skip" type="button">跳過 ▶▶</button>';
  document.body.appendChild(root);
  root.querySelector('.i11box').addEventListener('click', () => advance());
  root.querySelector('.i11skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  if (CARD) {
    cardEl = el('div', 'i11card'); cardEl.id = 'i11card';
    cardEl.innerHTML = '<div class="i11cardin"><div class="i11kick">第 一 層</div><div class="i11paras"></div></div><div class="i11cardhint"></div><button class="i11skip" type="button">跳過 ▶▶</button>';
    document.body.appendChild(cardEl);
    cardEl.addEventListener('click', e => { if (e.target.closest('.i11skip')) return; advance(); });
    cardEl.querySelector('.i11skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
  }
  window.addEventListener('keydown', e => {
    if (!cur || cur.k === 'misc' || e.code !== 'Enter' || e.repeat) return;
    if (!(cur.k === 'intro' && CARD)) return;                                  /* Enter 是「說話」鍵，只有全螢幕旁白卡時才當成跳過 */
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault(); e.stopImmediatePropagation(); skip();
  }, true);
}
export function init(ctx) { C = ctx; if (MODE === 'off') return; build(); }

/* ---------- 空白鍵／滑鼠守門：開場旁白與托比迎新顯示期間，空白鍵只拿來加速／下一句，絕不傳給遊戲（不閃避）；連按、長按都一樣 ----------
   這支監聽在模組載入時就掛上（比 ui.js 的按鍵監聽早），而且用 stopImmediatePropagation，同一個 window 上後面的監聽才收不到。 */
let spaceEat = false;                                                       /* 這一次按下的空白鍵已被吃掉：直到放開為止，連發（長按）也一律吃掉，字幕在長按中結束也不會漏一個閃避出去 */
const busy = () => !!C && !C.talking() && (cur ? cur.k !== 'misc' : C.queue.some(q => { const k = kindOf(q); return k === 'intro' || k === 'toby'; }));
if (MODE !== 'off') {
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    if (spaceEat && e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!busy()) { spaceEat = false; return; }
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault(); e.stopImmediatePropagation(); spaceEat = true; if (!e.repeat) advance();
  }, true);
  window.addEventListener('keyup', e => { if (e.code === 'Space') spaceEat = false; }, true);
  window.addEventListener('blur', () => { spaceEat = false; });
  /* 滑鼠鎖定視角時，點擊的目標是畫面本身（點不到字幕）：迎新顯示期間左鍵只當「加速」，不出手；沒鎖定時點字幕本來就不會碰到畫面 */
  window.addEventListener('mousedown', e => {
    if (e.button !== 0 || !busy() || !document.pointerLockElement || !(e.target && e.target.id === 'scene')) return;
    e.preventDefault(); e.stopImmediatePropagation(); advance();
  }, true);
}
/* 開場旁白卡全部播完或被跳過：通知 ui.js 開放遊戲（出生、淡入、操控） */
let onEnd = null; export const setOnEnd = f => { onEnd = f; };
export const setCurtain = (on, sec) => { if (!curEl) return; curEl.style.transition = on ? 'none' : `opacity ${sec || 1.6}s ease`; curEl.style.opacity = on ? '1' : '0'; curEl.style.display = 'block'; if (!on) setTimeout(() => { if (curEl.style.opacity === '0') curEl.style.display = 'none'; }, (sec || 1.6) * 1000 + 100); };
const sub = on => document.body.classList.toggle('i11sub', !!on);       /* 字幕顯示中：互動提示（按 E）讓位 */

/* ---------- 一句的生命週期：打字 → 停留 → 淡出 ---------- */
function holdOf(len) { return (1.1 + len * 0.045) * HOLD_K[speedKey()]; }
function start(it) {
  const k = kindOf(it), raw = typeof it === 'string' ? it : it.t, again = typeof it === 'object' && it.again;
  const sp = split(raw); let name = sp.name, title = '';
  if (name) { const o = C.npcOf && C.npcOf(name); if (o) title = o.title || ''; }
  cur = { raw, k, name, title, text: sp.text, n: 0, done: false, hold: 0, card: CARD && k === 'intro' };
  if (!again) C.log(raw);
  if (cur.card) return startPara();
  const who = root.querySelector('.i11who'); who.hidden = !name; who.querySelector('b').textContent = name; who.querySelector('span').textContent = title;
  root.dataset.who = name ? '1' : '0'; root.dataset.k = k;
  root.querySelector('.i11hint').textContent = k === 'misc' ? '' : '空白鍵　加速／下一句';
  root.querySelector('.i11skip').hidden = k === 'misc';
  paint(); root.classList.add('on'); sub(true);
  if (SPEEDS[speedKey()] === Infinity) cur.n = cur.text.length;
}
function paint() {
  const v = root.querySelector('.v'), h = root.querySelector('.h'), n = Math.floor(cur.n);
  v.textContent = cur.text.slice(0, n); h.textContent = cur.text.slice(n);
}
/* 旁白卡（B）：開場白的每一句是一個段落，淡入後留在畫面上；整組結束才收起 */
function startPara() {
  const box = cardEl.querySelector('.i11paras'), p = el('p', 'i11p', cur.text); box.appendChild(p); void p.offsetWidth; p.classList.add('on');
  cardEl.querySelector('.i11cardhint').textContent = '點一下或空白鍵　下一段　｜　Enter　跳過';
  cardEl.classList.add('on'); cur.done = true; cur.n = cur.text.length; cur.hold = 0;
}
function finishLine() {
  if (!cur) return; ended.add(cur.raw); const wasCard = cur.card, k = cur.k; lastK = k; cur = null; gap = wasCard ? 0.35 : 0.45;
  if (!wasCard) { root.classList.remove('on'); sub(false); }
  /* 卡片：後面沒有開場白的句子了，就收起來 */
  if (wasCard && !C.queue.some(q => kindOf(q) === 'intro')) { closeCard(); if (onEnd) onEnd(); }
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
  const wasCard = cur.card; ended.add(cur.raw); cur = null; gap = 0.3; root.classList.remove('on'); sub(false); if (wasCard) { closeCard(); if (onEnd) onEnd(); }
}
export function tick(dt) {
  if (!root) return;
  const talk = C.talking();
  sub((cur ? !cur.card : C.queue.some(q => kindOf(q) === 'toby')) && !talk);      /* 句與句的空檔也算顯示中，互動提示不會閃出來 */
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
export const dbg = () => ({ busy: busy(), spaceEat,  cur: cur && { k: cur.k, done: cur.done, hold: +cur.hold.toFixed(2), card: cur.card }, q: C.queue.length, gap: +gap.toFixed(2), lastK });
