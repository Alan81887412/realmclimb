// 0.7 介面（d7-ui-f）：釣魚的介面——拉鋸面板 #fish7 的樣式與補畫、料理視窗「分解魚」頁、角色面板「釣魚紀錄」頁
// 做法：不改玩法。#fish7 的 DOM 由 fish07.js 建，這裡在每幀補元素、改樣式（樣式全在 body #fish7 …）；
//   分解頁：fish07.craftPage 的一行掛鉤 Fish.deco.gut（補丁 fish07.js-patch.py）；釣魚紀錄頁：自己在 init 裡加分頁按鈕與容器，不碰 ui06.js／index.html。
import { me, P } from './game.js';
import { ITEMS } from './core.js';
import { FISHING as K, WATERS07, FISH, FISH_IDS, GUT } from './data07.js';
import * as Fish from './fish07.js';
import { charTab } from './ui06.js';

let H = null;
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const name = id => (ITEMS[id] && ITEMS[id].name) || id;
const ic = (id, cls) => (H && H.ic ? H.ic(id, cls) : el('span', 'ic', name(id)[0]));
const kbd = t => `<kbd>${t}</kbd>`;
const inv = id => P.inv[id] || 0;

/* ============================== 樣式 ============================== */
const CSS = `
/* ---- 拉鋸面板：0.6 視窗的樣子（深底、細黃銅框、Noto Serif TC 標題列） ---- */
body #fish7{width:372px;padding:0 0 9px;border-radius:8px;border:1px solid rgba(201,163,90,.6);background:var(--panel);box-shadow:0 10px 26px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.5);backdrop-filter:blur(6px);font-size:12.5px;bottom:126px;transition:opacity .15s,transform .15s,border-color .25s,box-shadow .25s}
body #fish7 .f7top{display:flex;align-items:center;gap:8px;margin:0;padding:6px 12px 5px;border-bottom:1px solid var(--line);color:var(--ink-dim);font-size:11.5px}
body #fish7 .f7top .ic{width:22px;height:22px;flex:none}
body #fish7 .f7w{flex:none;font-family:var(--font-display);font-weight:700;font-size:13.5px;letter-spacing:.08em;color:var(--brass-light)}
body #fish7 .f7bait{flex:1;min-width:0;text-align:right;font-size:11.5px;color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body #fish7 .f7msg{margin:8px 12px 5px;min-height:22px;font-family:var(--font-display);font-size:15.5px;font-weight:700;letter-spacing:.08em;text-align:center;color:var(--ink);line-height:22px}
body #fish7.bite{border-color:var(--ember);box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 0 1px rgba(242,162,74,.55),0 0 18px rgba(242,162,74,.28),inset 0 0 0 1px rgba(0,0,0,.5)}
body #fish7.bite .f7msg{color:var(--ember);font-size:17px;animation:none}
body #fish7.bite .f7top{border-bottom-color:rgba(242,162,74,.5)}
/* 蓄力條 */
body #fish7 .f7bar,body #fish7 .f7ten,body #fish7 .f7fish,body #fish7 .f7scale,body #fish7 .f7cd,body #fish7 .f7card{display:none}
body #fish7.chg .f7charge{display:block;position:relative;height:16px;margin:5px 12px 3px;border-radius:3px;background:rgba(0,0,0,.5);border:1px solid var(--brass-dark);overflow:hidden}
body #fish7 .f7charge i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#4a7aa0,#8fb4c8 55%,var(--ember))}
body #fish7 .f7charge::before{content:"拋竿距離";position:absolute;left:7px;top:0;z-index:1;line-height:14px;font-size:11px;color:rgba(255,255,255,.85);text-shadow:0 1px 2px #000}
body #fish7 .f7charge span{position:absolute;right:8px;top:0;z-index:1;line-height:14px;font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000}
/* 張力條：太鬆 0–10｜安全 10–80｜警戒 80–85｜紅區 85–100 */
body #fish7.reel .f7ten{display:block;position:relative;height:16px;margin:6px 14px 0;border-radius:3px;overflow:visible}
body #fish7 .f7zone{position:absolute;inset:0;border-radius:3px;border:1px solid var(--brass-dark);box-shadow:inset 0 0 0 1px rgba(0,0,0,.45);animation:none;filter:none;
  background:linear-gradient(90deg,#46627a 0,#46627a 10%,#456a46 10%,#6e8a48 78%,#a8923c 80%,#c98f3a 80%,#c98f3a 85%,#a8392f 85%,#c4493a 100%)}
body #fish7 .f7zone::after{content:"";position:absolute;inset:0;border-radius:2px;background:linear-gradient(90deg,transparent calc(10% - 1px),rgba(0,0,0,.55) calc(10% - 1px),rgba(0,0,0,.55) 10%,transparent 10%,transparent calc(80% - 1px),rgba(0,0,0,.55) calc(80% - 1px),rgba(0,0,0,.55) 80%,transparent 80%,transparent calc(85% - 1px),rgba(0,0,0,.6) calc(85% - 1px),rgba(0,0,0,.6) 85%,transparent 85%)}
body #fish7 .f7needle{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 6px rgba(255,255,255,.6);transition:left .05s linear;z-index:2}
body #fish7.run .f7needle{background:#ffe09a}
body #fish7 .f7red,body #fish7 .f7slack{display:none}
body #fish7.reel .f7scale{display:block;position:relative;height:15px;margin:3px 14px 0;font-size:11px;line-height:15px;color:var(--ink-faint)}
body #fish7 .f7scale span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
body #fish7 .f7scale .s0{left:5%} body #fish7 .f7scale .s1{left:45%} body #fish7 .f7scale .s2{left:92.5%;color:#e4968a}
/* 紅區／太鬆的計時：一條細條＋一句話，平靜但看得清楚 */
body #fish7.reel .f7cd{display:block;margin:2px 14px 0}
body #fish7 .f7cd .tr{height:4px;border-radius:2px;background:rgba(0,0,0,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);overflow:hidden}
body #fish7 .f7cd .tr i{display:block;height:100%;width:0;border-radius:2px;background:#c98f3a;transition:width .08s linear}
body #fish7 .f7cd p{margin:3px 0 0;min-height:17px;font-size:12px;line-height:17px;text-align:center;color:var(--ink-dim)}
body #fish7 .f7cd.warn p{color:#e8c25c} body #fish7 .f7cd.red .tr i{background:#d9553f} body #fish7 .f7cd.red p{color:#f0a08e}
body #fish7 .f7cd.slack .tr i{background:#6f9cc4} body #fish7 .f7cd.slack p{color:#a9cdee}
body #fish7.hot{border-color:#b9553f;box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 14px rgba(217,85,63,.3),inset 0 0 0 1px rgba(0,0,0,.5)} body #fish7.hot .f7msg{color:#f0a08e}
body #fish7.loose .f7msg{color:#a9cdee;animation:u8once .45s ease-out 1} @keyframes u8once{from{filter:brightness(1.9)}} /* 0.8：一次亮起，不重複閃 */ body #fish7.hot .f7zone{animation:none}
/* 魚的力氣 */
body #fish7.reel .f7fish{display:flex;align-items:center;gap:8px;margin:7px 14px 0;font-size:11.5px;color:var(--ink-dim)}
body #fish7 .f7fish span{flex:none;width:58px}
body #fish7 .f7fish div{flex:1;height:7px;border-radius:2px;background:rgba(0,0,0,.5);border:1px solid var(--brass-dark);overflow:hidden}
body #fish7 .f7fish i{display:block;height:100%;background:linear-gradient(90deg,#6aa889,#a9cf9a);transition:width .08s linear}
/* 按鍵列 */
body #fish7 .f7keys{display:none}
body #fish7 .f7k{margin:8px 12px 0;min-height:20px;text-align:center;font-size:11.5px;line-height:20px;color:var(--ink-dim);white-space:nowrap}
body #fish7 .f7k kbd{margin:0 2px 0 5px} body #fish7 .f7k kbd:first-child{margin-left:0}
/* 上岸：魚名、長度、標記 */
body #fish7.land{opacity:0!important}      /* 舉魚時面板讓開，角色和魚整個看得到；結果改在右下的 #fish7got */
body #fish7got{right:16px;bottom:132px;width:300px;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--brass);border-top:2px solid var(--brass);background:var(--panel);box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 16px rgba(201,163,90,.22),inset 0 0 0 1px rgba(0,0,0,.5);backdrop-filter:blur(6px);opacity:0;transform:translateX(14px);transition:opacity .25s,transform .25s,bottom .2s;z-index:6}
body #fish7got.on{opacity:1;transform:none}
body.talking #fish7got{opacity:0!important}
body #fish7got .f7card{display:flex;align-items:center;gap:12px}
body #fish7got .f7card .ic{width:54px;height:54px;flex:none}
body #fish7got .f7card .nm{flex:1;min-width:0}
body #fish7got .f7card h4{margin:0;font-family:var(--font-display);font-size:19px;letter-spacing:.06em;line-height:1.3;color:var(--ink)}
body #fish7got .f7card .ln{margin:0;font-size:13px;color:var(--ink-dim);font-variant-numeric:tabular-nums}
body #fish7got .f7card .tg{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
body #fish7got .f7card .tg i{font-style:normal;font-size:11.5px;line-height:17px;padding:0 7px;border-radius:3px;border:1px solid rgba(201,163,90,.55);background:rgba(201,163,90,.12);color:var(--brass-light)}
body #fish7got .f7card .tg i.first{border-color:var(--ember);background:rgba(242,162,74,.16);color:var(--ember)}
body #fish7got .f7card .tg i.boss{background:var(--brass);border-color:var(--brass);color:#241a0c;font-weight:700}

/* ---- 料理視窗「分解魚」頁 ---- */
#winCraft .g7y{display:flex;flex-wrap:wrap;align-items:center;gap:1px 7px;margin-top:2px;font-size:11.5px;color:var(--ink-dim)}
#winCraft .g7y .ic{width:18px;height:18px;border-radius:4px}
#winCraft .g7y span{white-space:nowrap;display:inline-flex;align-items:center;gap:2px;font-variant-numeric:tabular-nums}
#winCraft .g7get{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
#winCraft .g7t{display:flex;align-items:center;gap:7px;padding:4px 8px 4px 5px;border:1px solid rgba(201,163,90,.4);border-radius:5px;background:rgba(0,0,0,.26)}
#winCraft .g7t .ic{width:32px;height:32px;flex:none}
#winCraft .g7t b{display:block;font-weight:500;font-size:13px;line-height:1.3} #winCraft .g7t small{display:block;font-size:11px;line-height:1.3;color:var(--ink-dim)}
#winCraft .g7t.maybe{border-style:dashed;border-color:var(--line)}
#winCraft .g7empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:30px 14px 0;text-align:center}
#winCraft .g7empty .ic{width:56px;height:56px} #winCraft .g7empty .ic>*{filter:brightness(0) opacity(.3)}
#winCraft .g7empty b{font-family:var(--font-display);font-weight:500;font-size:15px;letter-spacing:.06em;color:var(--ink)}
#winCraft .g7empty p{margin:0;max-width:260px;font-size:12px;line-height:1.65;color:var(--ink-dim)}
#winCraft .g7note{margin:9px 0 0;font-size:11.5px;line-height:1.6;color:var(--ink-faint)}
#winCraft #fishTabs{margin-bottom:9px} #winCraft #fishTabs button{padding:4px 0;font-size:13px}

/* ---- 角色面板「釣魚紀錄」頁 ---- */
#charPageFish{padding-top:2px}
#charPageFish .f7sum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:4px}
#charPageFish .f7sum div{padding:3px 4px 2px;border:1px solid var(--line);border-radius:5px;background:rgba(0,0,0,.28);text-align:center}
#charPageFish .f7sum b{display:block;font-family:var(--font-display);font-size:18px;line-height:1.25;color:var(--brass-light);font-variant-numeric:tabular-nums} #charPageFish .f7sum b u{text-decoration:none;font-size:12px;color:var(--ink-faint)}
#charPageFish .f7sum small{display:block;font-size:11px;color:var(--ink-dim)}
#charPageFish .f7sec{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:6px 0 2px;font-size:11.5px;font-weight:700;letter-spacing:.14em;color:var(--ink-dim)} #charPageFish .f7sec small{font-size:11px;font-weight:400;letter-spacing:0;color:var(--ink-faint)}
#charPageFish .f7r{display:flex;align-items:center;gap:9px;padding:2px 4px 2px 3px;border-bottom:1px solid var(--line)}
#charPageFish .f7r .ic{width:28px;height:28px;flex:none}
#charPageFish .f7r .tx{flex:1;min-width:0} #charPageFish .f7r b{display:block;font-weight:500;font-size:13.5px;line-height:1.35} #charPageFish .f7r small{display:block;font-size:11px;line-height:1.35;color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#charPageFish .f7r em{flex:none;min-width:38px;text-align:right;font:700 12.5px var(--font-body);font-style:normal;font-variant-numeric:tabular-nums;color:var(--ok)}
#charPageFish .f7r.unk .ic>*{filter:brightness(0) opacity(.35)} #charPageFish .f7r.unk b{color:var(--ink-faint);letter-spacing:.2em} #charPageFish .f7r.unk small{color:var(--ink-faint)} #charPageFish .f7r.unk em{color:var(--ink-faint);font-weight:400}
#charPageFish .f7r.boss{border-bottom-color:rgba(201,163,90,.3)} #charPageFish .f7r.boss .ic{box-shadow:inset 0 0 0 1px var(--brass)} #charPageFish .f7r.boss b{color:var(--brass-light);font-family:var(--font-display)}
#charPageFish .f7r.boss .bt{display:inline-block;margin-right:5px;padding:0 5px;border-radius:3px;background:var(--brass);color:#241a0c;font-size:10.5px;font-weight:700;line-height:15px;letter-spacing:0;vertical-align:1px}
#charPageFish .f7r.boss.unk .bt{background:none;border:1px solid var(--brass-dark);color:var(--brass);line-height:13px}
#charPageFish .f7foot{margin:8px 0 0;font-size:11.5px;line-height:1.55;color:var(--ink-faint)}
`;

/* ============================== 拉鋸面板 ============================== */
let ui = null;      // 補的元素
let lastSt = '', keysKey = '', landKey = -1, rodShown = '', snapRec = null, cdKey = '';
const KEYS = {
  idle: `${kbd('左鍵')}按住蓄力、放開拋竿${kbd('E')}換餌${kbd('Esc')}收起`,
  charge: `${kbd('左鍵')}放開拋出去${kbd('E')}換餌${kbd('Esc')}收起`,
  fly: `${kbd('Esc')}收起`,
  wait: `${kbd('E')}收線${kbd('Esc')}收起`,
  bite: `${kbd('左鍵')}現在點一下`,
  reel: `${kbd('左鍵')}按住收線、放開放線${kbd('Esc')}放棄`,
  back: ''
};
function build(e) {
  const top = e.querySelector('.f7top'), ten = e.querySelector('.f7ten'), fish = e.querySelector('.f7fish'), keys = e.querySelector('.f7keys'); if (!top || !ten || !fish || !keys) return null;
  const scale = el('div', 'f7scale'); scale.innerHTML = '<span class="s0">鬆</span><span class="s1">安全</span><span class="s2">紅區</span>';
  const cd = el('div', 'f7cd'); cd.innerHTML = '<div class="tr"><i></i></div><p></p>';
  const kk = el('div', 'f7k'), card = el('div', 'f7card'); card.innerHTML = '<span class="cic"></span><div class="nm"><h4></h4><p class="ln"></p><div class="tg"></div></div>';
  ten.after(scale); scale.after(cd); keys.before(kk); gotEl().replaceChildren(card);
  e.dataset.u7 = '1'; return { e, top, scale, cd, bar: cd.querySelector('.tr i'), cdp: cd.querySelector('p'), kk, card, ten, fish };
}
function recOf(id) { const r = P.fishRec && P.fishRec[id]; return r ? [r[0], r[1]] : [0, 0]; }
let got = null, gotUntil = 0;
const gotEl = () => { if (!got || !got.isConnected) { got = el('div', 'hud'); got.id = 'fish7got'; document.body.appendChild(got); } return got; };
function tickGot() {
  if (!got || !got.classList.contains('on')) return; if (performance.now() > gotUntil) { got.classList.remove('on'); return; }
  let b = 132; for (const id of ['invite', 'gift7']) { const x = $(id); if (x && !x.hidden && x.offsetHeight) b = Math.max(b, (innerHeight - x.getBoundingClientRect().top) + 10); } got.style.bottom = b + 'px';
}
function tickHud() {
  tickGot();
  const e = $('fish7'); if (!e) return; if (!ui || ui.e !== e || !e.dataset.u7) { ui = build(e); if (!ui) return; keysKey = ''; rodShown = ''; }
  const s = me.fish; if (!s) { lastSt = ''; snapRec = null; return; }
  const st = s.st;
  if (s.rod !== rodShown) { rodShown = s.rod; const old = ui.top.querySelector('.ic'); if (old) old.remove(); ui.top.prepend(ic(s.rod, 'bare')); }
  e.classList.toggle('land', st === 'land');
  const k = KEYS[st] != null ? KEYS[st] : ''; if (k !== keysKey) { keysKey = k; ui.kk.innerHTML = k; }
  if (st === 'reel' && s.f) {
    snapRec = recOf(s.f.id);
    const f = s.f, redT = s.R.redT, redF = f.red / redT, slF = f.slack / K.slackT; let cls = '', t = '', w = 0;
    if (f.T >= K.red) { cls = 'red'; w = redF; t = `紅區：再撐 ${Math.max(0, redT - f.red).toFixed(1)} 秒會斷線，放開左鍵` ; }
    else if (f.T <= K.slack) { cls = 'slack'; w = slF; t = `太鬆：再 ${Math.max(0, K.slackT - f.slack).toFixed(1)} 秒魚會掙脫，按住左鍵收線`; }
    else if (f.back > 0) { cls = 'slack'; w = f.back / ((K.back && K.back.dur) || 1); t = '魚朝你游——快收線！'; } /* 0.8 回衝：和 fish07 面板的「線鬆了！快收線！」同一件事，不再寫「張力在安全區」 */
    else if (f.red > 0.02) { cls = 'red'; w = redF; t = '回到安全區了，紅區的計時正在退'; }
    else if (f.slack > 0.02) { cls = 'slack'; w = slF; t = '線拉緊了，鬆的計時正在退'; }
    else if (f.T >= 80) { cls = 'warn'; t = '警戒：快到紅區了，放開一下'; }
    else t = f.run > 0 ? '魚在衝，先放開' : '張力在安全區';
    if (cls + t !== cdKey) { cdKey = cls + t; ui.cd.className = 'f7cd ' + cls; ui.cdp.textContent = t; } ui.bar.style.width = (clamp01(w) * 100).toFixed(1) + '%';
  }
  if (st === 'land' && s.landN !== landKey) {      // 上岸：補一張魚的卡片（第一次／新紀錄／漂亮／主）
    landKey = s.landN; const id = s.fishId, F = FISH[id] || {}, r = recOf(id), first = r[0] === 1, rec = !first && snapRec && s.fishLen > snapRec[1] + 1e-6;
    const c = ui.card; c.querySelector('.cic').replaceChildren(ic(id)); c.querySelector('h4').textContent = name(id); c.querySelector('.ln').textContent = (s.fishLen != null ? s.fishLen.toFixed(1) : '?') + ' 公分';
    const tg = c.querySelector('.tg'); tg.textContent = ''; if (F.boss) tg.append(el('i', 'boss', '主')); if (first) tg.append(el('i', 'first', '第一次釣到')); else if (rec) tg.append(el('i', '', '新紀錄')); if (s.f && s.f.pretty) tg.append(el('i', '', '漂亮　全程沒進紅區')); gotUntil = performance.now() + 4000; gotEl().classList.add('on'); tickGot();
  }
  lastSt = st;
}
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ============================== 分解魚頁（fish07.craftPage 的掛鉤） ============================== */
const gutList = () => FISH_IDS.filter(id => FISH[id].gut && inv(id) > 0);
function yieldsOf(id) { const o = []; for (const [m, c, ch] of FISH[id].gut) { const x = o.find(a => a.m === m && !!a.ch === !!ch); if (x && !ch) x.c += c; else o.push({ m, c, ch }); } return o; }
function gutPage(S, rerender) {
  const box = $('craftList'), info = $('craftInfo'); if (!box || !info) return false;
  const note = $('craftNote'); if (note) note.textContent = '魚鱗、魚膽、魚鰾不能賣，拿去做藥劑（艾妲）、鏡鱗飾（布蘿娜）、釣竿（哈根）。主不能分解。';
  const hic = $('craftIc'); if (hic) { hic.textContent = ''; hic.append(ic('fish_crucian', 'bare')); }
  box.textContent = ''; info.textContent = ''; const list = gutList();
  if (!list.length) {
    const a = el('div', 'g7empty'); a.append(ic('fish_perch'), el('b', '', '背包裡沒有魚'), el('p', '', '到水邊釣幾尾再來。分解得到魚鱗、魚膽、魚鰾。')); info.appendChild(a);
    box.appendChild(el('p', 'c6empty', '釣到的魚會列在這裡。')); return true;
  }
  if (!S.gsel || !list.includes(S.gsel)) S.gsel = list[0];
  for (const id of list) {
    const b = el('button', 'c6r' + (id === S.gsel ? ' on' : '')), sp = el('span'), y = el('div', 'g7y');
    for (const q of yieldsOf(id)) { const s = el('span'); s.append(ic(q.m, 'bare'), document.createTextNode('×' + q.c + (q.ch ? '（' + Math.round(q.ch * 100) + '%）' : ''))); y.append(s); }
    sp.append(el('b', '', name(id)), y); b.append(ic(id), sp, el('em', 'ok', '有 ' + inv(id))); b.onclick = () => { S.gsel = id; H.sfx('click'); rerender(); }; box.appendChild(b);
  }
  const id = S.gsel, n = inv(id), g = Fish.gutting(), head = el('div', 'c6head'), ht = el('div'), chips = el('div', 'c6chips');
  chips.append(el('i', 'dim', `每尾 ${GUT.t} 秒`), el('i', 'dim', `背包有 ${n} 尾`)); ht.append(el('h4', '', '分解' + name(id)), chips); head.append(ic(id, 'big'), ht); info.appendChild(head);
  info.appendChild(el('div', 'c6sec', '分解得到')); const grid = el('div', 'g7get');
  for (const q of yieldsOf(id)) { const t = el('div', 'g7t' + (q.ch ? ' maybe' : '')), tx = el('div'); tx.append(el('b', '', name(q.m)), el('small', '', q.ch ? `每尾 ×${q.c}，機率 ${Math.round(q.ch * 100)}%（不一定有）` : `每尾 ×${q.c}`)); t.append(ic(q.m), tx); grid.appendChild(t); }
  info.appendChild(grid);
  info.appendChild(el('p', 'g7note', (ITEMS[id] && ITEMS[id].desc) || ''));
  const row = el('div', 'c6go');
  if (g) { const b = el('button', 'primary busy'), fill = el('i'); b.disabled = true; b.id = 'gutGo'; b.append(el('span', '', `分解${name(g.id)}中…（${g.n} 尾）`)); fill.style.transform = `scaleX(${Math.min(1, g.t / g.dur).toFixed(3)})`; b.appendChild(fill); row.appendChild(b); setTimeout(() => { const w = $('winCraft'); if (S.page === 'gut' && w && !w.hidden) rerender(); }, 100); }
  else { const ks = [Math.min(n, GUT.max), 1].filter((v, i, a) => v > 0 && a.indexOf(v) === i); ks.forEach((k, i) => { const b = el('button', i ? '' : 'primary'); if (!i) b.id = 'gutGo'; b.append(el('span', '', k === 1 ? '分解 1 尾' : `全部分解（${k} 尾）`)); if (!i) b.append(el('small', '', `${(k * GUT.t).toFixed(1)} 秒`), el('i')); b.onclick = () => { if (Fish.gutStart(id, k)) rerender(); }; row.appendChild(b); }); }
  info.appendChild(row); return true;
}

/* ============================== 角色面板「釣魚紀錄」頁 ============================== */
const waterName = w => (WATERS07[w] && WATERS07[w].name) || w;
function where(id) {      // 這種魚在哪片水（夜裡、清晨）：資料在 WATERS07
  const out = [];
  for (const w in WATERS07) { const W = WATERS07[w]; for (const f of W.fish) if (f[0] === id) out.push(waterName(w) + (f[2] ? '・夜裡' : '')); if (W.boss && W.boss.id === id) out.push(waterName(w) + (W.boss.night ? '・夜裡' : W.boss.hours ? `・清晨 ${W.boss.hours[0]}–${W.boss.hours[1]} 時` : '')); }
  return out;
}
let recKey = '';
function tickRec() {
  const tabs = $('charTabs'), pg = $('charPageFish'), win = $('winChar'); if (!tabs || !pg) return;
  const on = !!win && !win.hidden && charTab() === 'fish'; pg.hidden = !on; if (!on) { recKey = ''; return; }
  const rs = Fish.records(), key = JSON.stringify(rs.map(r => [r.n, r.best])); if (key === recKey && pg.firstChild) return; recKey = key; renderRec(pg, rs);
}
function renderRec(pg, rs) {
  pg.textContent = ''; const reg = rs.filter(r => !r.boss), bos = rs.filter(r => r.boss), got = a => a.filter(r => r.n > 0).length, total = rs.reduce((a, r) => a + r.n, 0);
  const sum = el('div', 'f7sum'); for (const [v, m, l] of [[got(reg), reg.length, '釣過的魚'], [got(bos), bos.length, '主'], [total, 0, '一共尾數']]) { const d = el('div'), b = el('b'); b.append(document.createTextNode(String(v))); if (m) { const u = el('u', '', ' / ' + m); b.append(u); } d.append(b, el('small', '', l)); sum.append(d); }
  pg.append(sum);
  const row = r => {
    const k = r.n > 0, w = where(r.id), x = el('div', 'f7r' + (k ? '' : ' unk') + (r.boss ? ' boss' : '')), t = el('div', 'tx'), b = el('b');
    if (r.boss) b.append(el('span', 'bt', '主'));
    b.append(document.createTextNode(k ? r.name : '？？？'));
    const sm = el('small', '', k ? `最長 ${r.best.toFixed(1)} 公分・${w.join('、')}` : (w.length ? '線索：' + w.join('、') : '線索：還不知道'));
    t.append(b, sm); x.append(ic(r.id), t, el('em', '', k ? '×' + r.n : '——')); return x;
  };
  pg.append(el('div', 'f7sec', '魚')); for (const r of reg) pg.append(row(r));
  pg.append(el('div', 'f7sec', '主'));
  for (const r of bos) pg.append(row(r));
}
function initRec() {
  const tabs = $('charTabs'), rack = $('charPageRack'); if (!tabs || !rack || $('charPageFish')) return;
  const b = el('button', '', '釣魚紀錄'); b.dataset.t = 'fish'; tabs.append(b);
  const pg = el('div'); pg.id = 'charPageFish'; pg.hidden = true; rack.after(pg);
}

/* ============================== init ============================== */
export function init(h) {
  H = h; if (!$('ui07f-css')) { const st = el('style'); st.id = 'ui07f-css'; st.textContent = CSS; document.head.appendChild(st); }
  initRec(); if (Fish.deco) Fish.deco.gut = gutPage;
  H.onTick(() => { tickHud(); tickRec(); });
}
