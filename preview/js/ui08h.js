// 0.8 介面（ui-h）：試煉與對決進行中的畫面
//   倒數 3-2-1（#h8count）、試煉／百場連戰條件面板 #h8panel、巴索報幕字幕 #h8call、競技場看臺小字 #watch8、
//   對決邀請框 #duel8inv、對手血條 #duel8bar、對手名牌加雙劍。
// 只靠 init(H, D)；不 import 遊戲模組。不改 ui.js、index.html、玩法的檔。樣式照第 0 波樣品（d8-ui/samples/js/ui08s0.js）。
// 規則：巴索報幕沒有人聲（只有字幕＋鑼的圖示）；時間一律黃銅色，不變紅、不閃、不加速跳動；兩種邀請同時來時排隊（一次只顯示一個框）。
// D 需要：trialState() watching() gauntlet() duelState() duelInvite() answerDuel(yes) on('horn', fn)；trials() 選用（讀個人最佳）。
//   duelInvite() 形狀 { from:{name,lv}, t:剩餘秒, tmax }（tmax 沒有就當 30）；duelState().vs.tag（選用）＝對手名牌 { el }。
const CSS = `
body.trial8 #tracker{display:none!important}
body.trial8 #tip,body.duel8 #tip{display:none!important}
body.talking #h8panel,body.talking #h8call,body.talking #duel8bar,body.talking #duel8inv,body.talking #h8count{opacity:0!important;pointer-events:none}
body.duel8inv #invite{display:none!important}
body #h8panel{position:fixed;left:16px;top:150px;width:306px;box-sizing:border-box;z-index:5;padding:8px 12px 10px 12px;border-left:3px solid var(--brass);border-radius:0 6px 6px 0;background:linear-gradient(90deg,rgba(20,22,18,.93),rgba(20,22,18,.74));box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 0 0 1px rgba(201,163,90,.2);text-shadow:0 1px 2px #000;pointer-events:none}
body #h8panel .h8top{display:flex;align-items:center;gap:8px} body #h8panel .h8top .k{font-size:10.5px;letter-spacing:.22em;color:var(--brass)}
body #h8panel .h8top .t{margin-left:auto;font:700 21px/1 var(--font-display);color:var(--brass-light);font-variant-numeric:tabular-nums} body #h8panel .h8top .t small{font-size:12px;font-weight:400;color:var(--brass);margin-left:2px}
body #h8panel h4{margin:3px 0 5px;font-family:var(--font-display);font-size:15.5px;letter-spacing:.05em;font-weight:700}
body #h8panel ul{list-style:none;margin:0;padding:0}
body #h8panel li{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:12.5px}
body #h8panel li .bx{flex:none;width:12px;height:12px;border:1.5px solid var(--ink-faint);border-radius:2px;display:grid;place-items:center}
body #h8panel li.ok{color:var(--ink-faint)} body #h8panel li.ok .bx{background:var(--ok);border-color:var(--ok)} body #h8panel li.ok .bx::after{content:"";width:6px;height:3px;margin-top:-2px;border:solid #1d2a14;border-width:0 0 2px 2px;transform:rotate(-45deg)}
body #h8panel li.keep .bx{border-color:var(--ok);box-shadow:inset 0 0 0 2px rgba(20,30,14,.9),inset 0 0 0 5px rgba(143,227,138,.35)} body #h8panel li.keep .n{color:#a9dc8f} /* 0.8 X7：勾選型守住中 */ body #h8panel li.fail{color:#e9a493} body #h8panel li.fail .txt{text-decoration:line-through;text-decoration-color:rgba(233,164,147,.7)} body #h8panel li.fail .bx{border-color:var(--bad)} body #h8panel li.fail .bx::after{content:"✕";font-size:10px;line-height:1;color:var(--bad)}
body #h8panel li .pp{display:flex;gap:5px;margin-left:auto;align-items:center} body #h8panel li .pp i{width:7px;height:7px;transform:rotate(45deg);border:1px solid var(--brass);background:rgba(0,0,0,.3)} body #h8panel li .pp i.on{background:var(--brass-light);border-color:var(--brass-light)}
body #h8panel li .n{margin-left:6px;font-variant-numeric:tabular-nums;color:var(--ink-dim);font-size:12px;min-width:26px;text-align:right}
body #h8panel li .pp + .n{margin-left:0}
body #h8panel li .txt{min-width:0;overflow-wrap:anywhere}
body #h8panel .h8foot{margin-top:6px;padding-top:6px;border-top:1px solid var(--line);font-size:11.5px;color:var(--ink-dim);display:flex;gap:4px 10px;flex-wrap:wrap}
body #h8panel .h8foot b{font-weight:600;color:var(--ink)}
body #h8panel .wv{display:flex;gap:3px;margin:4px 0 2px} body #h8panel .wv i{flex:1;height:7px;border:1px solid rgba(201,163,90,.5);border-radius:1px;background:rgba(0,0,0,.4)} body #h8panel .wv i.on{background:linear-gradient(#e6c47c,#a7803c);border-color:#a7803c} body #h8panel .wv i.cur{background:rgba(201,163,90,.25);box-shadow:0 0 0 1px var(--brass-light)}
body #h8panel .wvl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-dim)} body #h8panel .wvl b{font-family:var(--font-display);font-size:15px;color:var(--ink)}
body #h8panel .wvn{margin-top:2px;font-size:12px;color:var(--ink)} body #h8panel .wvn em{font-style:normal;color:var(--brass-light)}
body #h8call{position:fixed;left:50%;top:16px;transform:translateX(-50%);width:min(520px,calc(100vw - 702px));box-sizing:border-box;z-index:6;padding:7px 30px 9px;text-align:center;background:linear-gradient(90deg,transparent,rgba(14,15,12,.84) 16%,rgba(14,15,12,.84) 84%,transparent);text-shadow:0 1px 3px #000;pointer-events:none;opacity:0;transition:opacity .5s}
body #h8call.on{opacity:1;transition:opacity .25s}
body.duel8 #h8call{top:96px;padding:5px 30px 6px}
body.duel8 #h8call .who{position:absolute;left:34px;top:50%;margin-top:-8px} body.duel8 #h8call .who span{display:none} body.duel8 #h8call p{margin:0} body.duel8 #h8call::after{margin-top:4px}
body #h8call .who{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;letter-spacing:.24em;color:var(--brass)} body #h8call .who svg{width:16px;height:16px}
body #h8call p{margin:2px 0 0;font-family:var(--font-display);font-size:17px;letter-spacing:.04em;color:var(--ink);overflow-wrap:anywhere}
body #h8call::after{content:"";display:block;width:62%;height:1px;margin:6px auto 0;background:linear-gradient(90deg,transparent,var(--brass-dark),transparent)}
body #duel8bar{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(520px,calc(100vw - 702px));box-sizing:border-box;z-index:6;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:0 12px;padding:7px 14px 8px 9px;border-radius:6px;border:1px solid var(--brass-dark);border-top:2px solid var(--brass);background:rgba(20,22,18,.9);box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.5);text-shadow:0 1px 2px #000;pointer-events:none}
body #duel8bar .em{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,#4b3e2a,#1f1a12);box-shadow:0 0 0 1.5px var(--brass),inset 0 0 0 1px rgba(0,0,0,.6)} body #duel8bar .em svg{width:24px;height:24px}
body #duel8bar .nm{display:flex;align-items:baseline;gap:7px;min-width:0} body #duel8bar .nm b{font-family:var(--font-display);font-size:16px;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} body #duel8bar .nm small{font-size:11.5px;color:var(--ink-dim);white-space:nowrap} body #duel8bar .nm em{margin-left:auto;font-style:normal;font-size:11px;letter-spacing:.2em;color:var(--brass)}
body #duel8bar .hb{position:relative;height:11px;margin-top:4px;border-radius:2px;background:rgba(0,0,0,.6);box-shadow:0 0 0 1px #2a2416,0 0 0 2px rgba(201,163,90,.35);overflow:hidden} body #duel8bar .hb i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#e47c64,#b4432f)} body #duel8bar .hb::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(25% - 1px),rgba(0,0,0,.55) 0 25%,transparent 0 calc(50% - 1px),rgba(0,0,0,.55) 0 50%,transparent 0 calc(75% - 1px),rgba(0,0,0,.55) 0 75%,transparent 0)}
body #duel8bar .tm{text-align:center;padding-left:12px;border-left:1px solid var(--line)} body #duel8bar .tm b{display:block;font:700 23px/1 var(--font-display);color:var(--brass-light);font-variant-numeric:tabular-nums} body #duel8bar .tm small{font-size:10.5px;letter-spacing:.2em;color:var(--ink-dim)}
body #duel8bar .out{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:-1px;padding:3px 16px 4px;border:1px solid var(--brass-dark);border-top:0;border-radius:0 0 6px 6px;background:rgba(20,22,18,.9);font-size:12.5px;color:var(--ink);white-space:nowrap} body #duel8bar .out b{font-family:var(--font-display);font-size:14px;color:var(--brass-light);margin-left:4px}
@keyframes h8pop{0%{opacity:0;transform:scale(1.7)}16%{opacity:1;transform:scale(1)}68%{opacity:1;transform:scale(.96)}100%{opacity:0;transform:scale(.82)}}
body #h8count{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);z-index:6;text-align:center;pointer-events:none}
body #h8count .pp{animation:h8pop .96s ease-out both} body #h8count.hold .pp{animation:none}
body #h8count b{display:block;font:900 118px/1 var(--font-display);background:linear-gradient(#fff6d6,#ecc879 46%,#9a6c26);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:2px rgba(40,26,10,.9);filter:drop-shadow(0 5px 10px rgba(0,0,0,.6))}
body #h8count.go b{font-size:84px;letter-spacing:.12em;text-indent:.12em}
body #h8count small{display:block;margin-top:4px;font-size:13px;letter-spacing:.3em;color:var(--brass-light);text-shadow:0 1px 3px #000}
body .tag.duel8 .tag-name{color:var(--brass-light);font-weight:700;display:flex;align-items:center;gap:4px} body .tag.duel8 .tag-name svg{width:13px;height:13px;flex:none} body .tag.duel8 .tag-bar{box-shadow:0 0 0 1px rgba(201,163,90,.8)}
body #duel8inv{position:fixed;right:16px;bottom:126px;width:282px;box-sizing:border-box;z-index:8;padding:10px 14px 0;border-radius:7px;background:var(--panel);border:1px solid var(--brass-dark);border-top:2px solid var(--brass);box-shadow:0 6px 18px rgba(0,0,0,.5);overflow:hidden;text-align:center;pointer-events:auto}
body #duel8inv .k{display:flex;align-items:center;justify-content:center;gap:6px;font-size:10.5px;letter-spacing:.24em;color:var(--brass)} body #duel8inv .k svg{width:14px;height:14px}
body #duel8inv .who{margin-top:3px} body #duel8inv .who b{font-family:var(--font-display);font-size:17px;letter-spacing:.05em} body #duel8inv .who small{margin-left:6px;font-size:12px;color:var(--ink-dim)}
body #duel8inv .ln{display:block;margin-top:1px;font-size:13.5px}
body #duel8inv .rule{margin:6px 0 0;font-size:11.5px;line-height:1.5;color:var(--ink-dim)}
body #duel8inv .q{margin:-3px 0 7px;font-size:11px;color:var(--ink-faint)}
body #duel8inv .invBar i{transition:none}
body #watch8{display:flex;flex-direction:column;align-items:center;gap:0;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--ink)}
body #watch8 .k{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;letter-spacing:.14em;color:var(--brass)} body #watch8 .k svg{width:12px;height:12px}
body #watch8 em{font-style:normal;color:var(--brass-light);font-variant-numeric:tabular-nums}
`;
const SWORDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke-linecap="round"><path d="M5 4l12.5 12.5M19 4L6.5 16.5" stroke="#f0d79a" stroke-width="2.4"/><path d="M14.6 18.8l4.2-4.2M9.4 18.8l-4.2-4.2" stroke="#c9a35a" stroke-width="2.2"/><path d="M18.4 18.4l2 2M5.6 18.4l-2 2" stroke="#7a5c28" stroke-width="2.6"/></g></svg>';
const GONG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="10" r="6.6" fill="#7a5c28" stroke="#f0d79a" stroke-width="1.3"/><circle cx="9" cy="10" r="2.4" fill="#c9a35a"/><path d="M9 2V0.8M14 16l4 3" stroke="#c9a35a" stroke-width="1.4" stroke-linecap="round"/><circle cx="18.2" cy="19" r="1.4" fill="#c9a35a"/></svg>';
const NAME = { boar: '野豬', wolf: '灰狼', bear: '棕熊', tiger: '猛虎', bison: '野牛', python: '沼蟒', dog: '鬥犬' };

let H, D, errN = 0, last = 0;
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const html = (t, c, h) => { const e = el(t, c); e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => s == null || !isFinite(s) ? '' : `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s)) % 60).padStart(2, '0')}`;
const sfx = (...a) => { try { if (H && typeof H.sfx === 'function') H.sfx(...a); } catch (e) { } };
const bodyCls = {};
const setBody = (n, on) => { on = !!on; if (bodyCls[n] === on) return; bodyCls[n] = on; try { H.onBodyClass(n, on); } catch (e) { document.body.classList.toggle(n, on); } };
const waveText = list => (list || []).map(f => `${NAME[f[0]] || f[0]}×${f[1]}`).join('、');

/* ---------- 3-2-1 與「開始」（試煉與對決共用） ---------- */
const C = { key: null, t: 0 };
function countFrame(dt, key, n, sub, phase) {
  // key：這一秒的識別（來源＋數字）；n：3..1；phase：'count'｜其他
  if (key && key !== C.key) {
    const prev = C.key; C.key = key;
    const go = n === 0;
    let c = $('h8count'); if (c) c.remove();
    c = el('div', 'hud' + (go ? ' go' : '')); c.id = 'h8count';
    const p = el('div', 'pp'); p.append(el('b', '', go ? '開始' : String(n)), el('small', '', go ? '' : sub)); c.append(p);
    document.body.append(c); C.t = 1.1;
    sfx('arena', go ? 'go' : 'count');
  }
  if (C.t > 0 && !window.__h8hold && (C.t -= dt) <= 0) { const c = $('h8count'); if (c) c.remove(); }
  if (!key && C.key && !phase) C.key = null;
}

/* ---------- 試煉條件面板 ---------- */
const P = { sig: '', el: null, tEl: null, bEl: null, best: {} };
function bestOf(id) {
  if (!(id in P.best)) { let b = null; try { const x = (D.trials ? D.trials() : []).find(t => t.id === id); if (x && x.best != null) b = x.best; } catch (e) { } P.best[id] = b; }
  return P.best[id];
}
function trialFrame(s) {
  const on = !!s && s.phase !== 'done';
  setBody('trial8', on);
  if (!on) { if (P.el) { P.el.remove(); P.el = null; P.sig = ''; } return; }
  const g = s.kind === 'gauntlet', between = s.phase === 'between', wave = s.wave || 0, waves = s.waves || 10;
  const sig = JSON.stringify([g, s.id, s.name, s.limit, between, wave, waves, s.cond, s.partner && s.partner.name, s.phase === 'fight']);
  if (sig !== P.sig || !P.el || !P.el.isConnected) {
    P.sig = sig; if (P.el) P.el.remove();
    const p = el('div', 'hud'); p.id = 'h8panel';
    p.append(html('div', 'h8top', `<span class="k">${g ? '百場連戰' : '競技場試煉'}</span><span class="t"><span id="h8t"></span>${s.limit ? `<small>/ ${fmt(s.limit)}</small>` : ''}</span>`));
    p.append(el('h4', '', s.name || (g ? '百場連戰' : '試煉')));
    if (g) {
      const wv = el('div', 'wv'); for (let i = 1; i <= waves; i++) wv.append(el('i', between ? (i <= wave ? 'on' : i === wave + 1 ? 'cur' : '') : (i < wave ? 'on' : i === wave ? 'cur' : ''))); p.append(wv);
      p.append(html('div', 'wvl', `<span>第 <b>${wave}</b> ／ ${waves} 波</span><span id="h8b">${between ? '' : '交手中'}</span>`));
      if (between) { let list = null; try { list = (D.gauntlet().list || [])[wave]; } catch (e) { } if (list) p.append(html('div', 'wvn', `下一波：<em>${esc(waveText(list))}</em>　Lv${esc(list[0][2])}`)); }
    }
    const ul = el('ul');
    for (const c of s.cond || []) {
      /* 0.8 X7（R6）：m＝0 的「不准」型（不喝藥、不被打中）與時限型（m > 4 秒）是勾選型：打的過程中顯示「守住中」／剩幾秒，不先打勾；破了才打叉 */
      const keep = !c.fail && (c.m === 0 || c.m > 4), li = el('li', keep ? 'keep' : c.ok ? 'ok' : c.fail ? 'fail' : ''); li.append(el('span', 'bx'), el('span', 'txt', c.label));
      if (c.m > 1 && c.m <= 4) { const pp = el('span', 'pp'); for (let i = 0; i < c.m; i++) pp.append(el('i', i < c.n ? 'on' : '')); li.append(pp); }
      li.append(el('span', 'n', c.m === 0 ? (c.fail ? '破了' : '守住中') : c.m > 4 ? (c.fail ? '超過' : `剩 ${Math.max(0, c.m - (c.n || 0))} 秒`) : `${c.n || 0}/${c.m}`)); ul.append(li);
    }
    p.append(ul);
    const who = s.partner && s.partner.name ? `<span>兩人組・隊友 <b>${esc(s.partner.name)}</b></span>` : '<span>單人挑戰</span>';
    let ft = g ? '<span>藥水與料理：巴索代管中</span>' + who : who; if (!g) { const b = bestOf(s.id); ft += `<span>個人最佳 <b>${b == null ? '—' : fmt(b)}</b></span>`; }
    p.append(html('div', 'h8foot', ft));
    document.body.append(p); P.el = p;
  }
  const t = $('h8t'); if (t) { const v = fmt(s.t || 0); if (t.textContent !== v) t.textContent = v; }
  const b = $('h8b'); if (b && between) { const v = `下一波　${Math.ceil(s.betweenT || 0)} 秒`; if (b.textContent !== v) b.textContent = v; }
}

/* ---------- 報幕字幕 ---------- */
const K = { t: 0 };
function onHorn(e) {
  const text = e && (e.text || e.line); if (!text) return;
  let c = $('h8call');
  if (!c) { c = el('div', 'hud'); c.id = 'h8call'; c.append(html('div', 'who', GONG + '<span>巴索・報幕</span>'), el('p')); document.body.append(c); }
  c.querySelector('p').textContent = text; c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); K.t = 4;
}
function callFrame(dt) { if (K.t > 0 && (K.t -= dt) <= 0) { const c = $('h8call'); if (c) c.classList.remove('on'); } }

/* ---------- 看臺小字 ---------- */
function watchFrame(w, mine) {
  let e = $('watch8');
  if (!w || mine) { if (e) e.remove(); return; }
  const z = $('zoneLine'); if (!z) return;
  if (!e) { e = el('div'); e.id = 'watch8'; e.append(html('span', 'k', SWORDS + '競技場看臺'), html('span', 'wtx', '<span></span>　<em></em>')); z.append(e); }
  else if (e.parentNode !== z) z.append(e);
  const tx = `${w.who || ''} 挑戰 ${w.name || ''}`.trim(), q = e.querySelector('.wtx span'), em = e.querySelector('em'), tv = fmt(w.t || 0);
  if (q.textContent !== tx) q.textContent = tx; if (em.textContent !== tv) em.textContent = tv;
}

/* ---------- 對決 ---------- */
const U = { tag: null };
function duelFrame(d) {
  const on = !!d && d.phase !== 'done';
  setBody('duel8', on);
  let b = $('duel8bar');
  if (!on) { if (b) b.remove(); tagClear(); return; }
  const vs = d.vs || {}, hp = Math.max(0, Math.min(1, vs.hp01 == null ? 1 : vs.hp01)), lim = d.limit || 180, left = Math.max(0, lim - (d.t || 0));
  if (!b) {
    b = el('div', 'hud'); b.id = 'duel8bar'; b.append(html('div', 'em', SWORDS));
    const m = el('div'); m.append(html('div', 'nm', '<b></b><small></small><em>對決</em>')); const hb = el('div', 'hb'); hb.append(el('i')); m.append(hb); b.append(m);
    b.append(html('div', 'tm', '<b></b><small>剩餘</small>')); document.body.append(b);
  }
  const nm = b.querySelector('.nm b'), lv = b.querySelector('.nm small'), fill = b.querySelector('.hb i'), tm = b.querySelector('.tm b');
  const name = vs.name || '對手', lvT = vs.lv ? `Lv${vs.lv}` : '', w = (hp * 100).toFixed(1) + '%', tT = fmt(Math.ceil(left));
  if (nm.textContent !== name) nm.textContent = name; if (lv.textContent !== lvT) lv.textContent = lvT; if (fill.style.width !== w) fill.style.width = w; if (tm.textContent !== tT) tm.textContent = tT;
  let o = b.querySelector('.out');
  if (d.outT != null && d.outT > 0) { if (!o) { o = html('div', 'out', '回到沙地內<b></b>'); b.append(o); } const v = `（${Math.ceil(d.outT)}）`; const bb = o.querySelector('b'); if (bb.textContent !== v) bb.textContent = v; } else if (o) o.remove();
  tagFrame(vs.tag);
}
function tagEl(t) { return t ? (t.el || (t.classList ? t : null)) : null; }
function tagFrame(t) {
  const e = tagEl(t); if (U.tag && U.tag !== e) tagClear(); if (!e) return; U.tag = e;
  if (!e.classList.contains('duel8')) e.classList.add('duel8');
  const nm = e.querySelector('.tag-name'); if (nm && !nm.querySelector('.h8sw')) { nm.insertAdjacentHTML('afterbegin', SWORDS); const s = nm.querySelector('svg'); if (s) s.classList.add('h8sw'); }
}
function tagClear() { const e = U.tag; U.tag = null; if (!e) return; e.classList.remove('duel8'); const s = e.querySelector('.h8sw'); if (s) s.remove(); }

/* ---------- 對決邀請（和組隊邀請排隊：這個框在時，#invite 被 body.duel8inv 隱藏，Y／N 只給這個框） ---------- */
const V = { el: null, who: '' };
function invFrame(iv) {
  setBody('duel8inv', !!iv);
  if (!iv) { if (V.el) { V.el.remove(); V.el = null; } return; }
  const f = iv.from || {}, party = $('invite'), q = iv.queued != null ? iv.queued : (party && !party.hidden ? 1 : 0), k = Math.max(0, Math.min(1, (iv.t || 0) / (iv.tmax || 30)));
  const sig = [f.name, f.lv, q].join('|');
  if (!V.el || V.sig !== sig) {
    if (V.el) V.el.remove(); V.sig = sig;
    const b = el('div', 'hud'); b.id = 'duel8inv';
    b.append(html('div', 'k', SWORDS + '<span>對決邀請</span>'), html('div', 'who', `<b>${esc(f.name || '有人')}</b>${f.lv ? `<small>Lv${esc(f.lv)}</small>` : ''}`), el('span', 'ln', '邀請你在沙地上對決'));
    b.append(el('p', 'rule', '先倒下的輸（留 1 點生命，不倒地、不掉經驗金幣）・限時 3 分鐘，比剩餘生命，一樣多算平手'));
    const bt = html('div', 'invBtns', '<button class="primary" data-a="1"><kbd>Y</kbd>接受</button><button data-a="0"><kbd>N</kbd>拒絕</button>');
    bt.addEventListener('click', e => { const x = e.target.closest('button'); if (x) answer(x.dataset.a === '1'); }); b.append(bt);
    if (q) b.append(el('p', 'q', `還有 ${q} 個組隊邀請，處理完這個再顯示`));
    b.append(html('div', 'invBar', '<i></i>')); document.body.append(b); V.el = b;
  }
  V.el.querySelector('.invBar i').style.width = (k * 100).toFixed(0) + '%';
}
function answer(yes) { try { D.answerDuel(!!yes); } catch (e) { console.error('ui08h answerDuel', e); } }
function onKey(e) {
  if (!V.el || !V.el.isConnected || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.code !== 'KeyY' && e.code !== 'KeyN') return;
  e.preventDefault(); e.stopImmediatePropagation(); answer(e.code === 'KeyY');
}

export function init(h, d) {
  H = h; D = d;
  if (!$('h8css')) { const st = document.createElement('style'); st.id = 'h8css'; st.textContent = CSS; document.head.appendChild(st); }
  if (typeof D.on === 'function') D.on('horn', onHorn);
  window.addEventListener('keydown', onKey, true);
  last = performance.now();
  H.onTick(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      const s = D.trialState(), d = D.duelState(), tin = !!s && s.phase !== 'done', din = !!d && d.phase !== 'done';
      trialFrame(s); duelFrame(d); invFrame(D.duelInvite());
      // 倒數：試煉優先；每一秒一個鍵，「開始」＝倒數結束那一刻
      let key = null, n = 0, sub = '';
      if (tin && s.phase === 'count') { n = Math.max(0, s.count | 0); if (Number.isFinite(s.count)) key = 't' + n; sub = '試煉開始倒數'; C.src = 't'; }
      else if (din && d.phase === 'count') { n = Math.max(0, d.count | 0); if (Number.isFinite(d.count)) key = 'd' + n; sub = '對決開始倒數'; C.src = 'd'; }
      else if (C.src && ((C.src === 't' && tin && s.phase !== 'count') || (C.src === 'd' && din && d.phase !== 'count')) && C.key && C.key[1] !== '0') { key = C.src + '0'; n = 0; }
      else if (!tin && !din) C.src = null;
      countFrame(dt, key, n, sub, key != null);
      callFrame(dt); watchFrame(D.watching(), tin);
    } catch (e) { if (errN++ < 5) console.error('ui08h', e); }
  });
}
