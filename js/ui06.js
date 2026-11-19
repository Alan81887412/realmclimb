// 0.6 的視窗與 HUD：製作（料理／製藥共用）、整備（布蘿娜）、披肩（哈根）、角色面板「武器架與狀態」分頁、營火休息面板、飽食與精力兩條、增益列、採集進度
// 版面和 0.5 同一套（羊皮紙墨色面板、黃銅邊、ui.js 的圖示）；1222×789 不用捲動就看得到重點。資料都從 game.js 的模組（Ars／Craft／Needs／Gather）拿，這裡只管畫面
// 圖示：H.ic(id) 由 ui.js 提供（ICON 沒有的代號交給美術的 icons06.js：tier0–4、satiety、energy、rest、buff_*、slot_* …）
import { ITEMS, STATS } from './core.js';
import { P, me, ui, M6, Ars, Craft, Needs, Gather, useItem, remotes } from './game.js';
import { TIERS, TIER_MAX, CHARMS, CHARM_IDS, CHARM_TIER, CHARM_FEE, ORDER, CLOAKS, CLOAK_IDS, DR_CAP, CRAFT_TIME, NEEDS, USE, RECIPES } from './data06.js';
import { WEAPONS } from './actors.js';
import { keyOf } from './keys.js';
import { campSpots } from './world.js';
import * as Fish from './fish07.js';      // 0.7：料理視窗的「分解魚」頁

let H = null;      // ui.js 給的工具：$、el、ic、toast、sfx、setWin、isOpen、tip、cursor（坐下時放開滑鼠）
const S = { st: 'cook', where: null, sel: null, n: 1, tab: 'up', wp: null, arm: null, charTab: 'stat', last: {} };
const $ = id => H.$(id), el = (t, c, x) => H.el(t, c, x), NUM = '一二三四五';
const btn = (text, fn, why, cls) => { const b = el('button', cls || '', text); b.onclick = e => { e.stopPropagation(); fn(); }; if (why) { b.disabled = true; b.title = why; } return b; };
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const left = s => (s > 90 ? Math.ceil(s / 60) + ' 分' : Math.ceil(s) + ' 秒');
const pct = v => Math.round(v * 100) + '%';
const inv = id => P.inv[id] || 0;
const peltIc = () => (inv('pelt_deer') > 0 || !inv('pelt_wolf') ? 'pelt_deer' : 'pelt_wolf');

/* ---------- 共用的小元件 ---------- */
// 素材格：圖示＋名稱＋要幾個；第二行寫持有（不夠是紅的、寫缺幾個）。o.was：減半前的數量（劃掉）；o.show：出示用（不消耗）；o.gold：金幣
function tile(id, name, need, have, o = {}) {
  const ok = o.show ? have > 0 : have >= need, t = el('div', 'c6t ' + (ok ? 'ok' : 'no') + (o.was ? ' half' : '') + (o.cls ? ' ' + o.cls : ''));
  const tx = el('span'), top = el('b'), sub = el('small');
  top.append(el('span', 'nm', name)); if (o.was) top.append(el('s', '', '×' + o.was)); if (!o.show) top.append(el('em', '', o.gold ? need + ' 金' : '×' + need));
  sub.textContent = o.show ? (ok ? '有了' : '還沒有') : ok ? '有 ' + have : `有 ${have}　缺 ${need - have}`;
  tx.append(top, sub); t.append(H.ic(id === 'pelt' ? peltIc() : id), tx); if (o.was) t.title = `做過這一階：素材減半（原本 ×${o.was}）`; return t;
}
const goldTile = (fee, nm) => tile('gold', nm || '工錢', fee, P.gold, { gold: 1 });
const tiles = list => { const d = el('div', 'c6tiles'); d.append(...list); return d; };
const sec = (t, extra) => { const h = el('div', 'c6sec'); h.append(el('span', '', t)); if (extra) h.append(extra); return h; };
const tierTxt = t => (t ? `${NUM[t - 1]}階「${TIERS[t].name}」　傷害 +${pct(TIERS[t].dmg)}` : '還沒整備');
// 一把武器的獸飾格：二階起才有；有裝就是那個獸飾的圖示，沒裝是虛線空格
function slotBox(o, big) { if (o.t < CHARM_TIER) return el('span', 'c6slot none'); const s = el('span', 'c6slot' + (big ? ' big' : '') + (o.t < CHARM_TIER ? ' lock' : o.c ? ' on' : '')); if (o.c && o.t >= CHARM_TIER) { s.appendChild(H.ic(o.c, 'bare')); s.title = ITEMS[o.c].name + '：' + CHARMS[o.c].text; } else s.title = o.t < CHARM_TIER ? '二階「鑲牙」起才有獸飾格' : '獸飾格空著'; return s; }
// 一道料理或藥吃下去的效果（短）：清單上的一行說明、詳細欄的小標籤
function effects(id) {
  const U = USE[id] || {}, out = [];
  if (U.sat) out.push('飽食 +' + U.sat); if (U.en) out.push('精力 +' + U.en);
  const hl = U.heal || (ITEMS[id] && ITEMS[id].heal && !U.sat ? [ITEMS[id].heal, 3] : null); if (hl) out.push(`${hl[1]} 秒回 ${pct(hl[0])} 生命` + (hl[2] ? '（挨打中斷）' : '')); if (U.mana) out.push(`${U.mana[1]} 秒回 ${pct(U.mana[0])} 魔力`);
  if (U.fx) { const t = Craft.fxText(U.fx); if (t) out.push(t); if (U.fx.steady) out.push('喝藥不會被打斷'); } return out;
}
const BUFF_IC = fx => (!fx ? 'slot_food' : fx.dmg ? 'buff_dmg' : fx.dr ? 'buff_def' : fx.hp ? 'buff_hp' : fx.mp ? 'buff_mp' : fx.st || fx.stRegen ? 'buff_st' : fx.loot ? 'buff_luck' : 'slot_food');

export function init(helpers) {
  H = helpers;
  $('forgeTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { S.tab = b.dataset.t; S.arm = null; H.sfx('tab'); renderForge(); } });
  $('charTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { S.charTab = b.dataset.t; H.sfx('tab'); ui.dirty = true; } });
  for (const id of ['satBox', 'enBox']) $(id).onclick = () => { S.charTab = 'rack'; H.setWin('char', true); };
  $('r6cook').onclick = e => { e.stopPropagation(); restCook(); }; $('r6up').onclick = e => { e.stopPropagation(); Needs.stand(); onStand(); };
}

/* ============================== 製作視窗：料理（酒館大鍋、營火）與製藥（艾妲）共用 ============================== */
// st：'cook'｜'brew'；where：{ camp 營火 } 或 { npc 對話中的 NPC }
export function openCraft(st, where) { if (!st) { if (H.isOpen('craft')) H.setWin('craft', false); return; } S.st = st; S.where = where || {}; S.sel = null; S.n = 1; H.setWin('craft', true); }
export function closeCraft() { Craft.cancel(); S.last.note = null; }      // 關掉視窗：做到一半的取消；營火旁照樣坐著（回到休息面板）
// 還沒學會的配方：去找誰、現在學不學得到
function learnHint(r) {
  const s = RECIPES[r.id].src; if (s.never && !s.npc) return '向雜貨商米洛買食譜';
  const t = s.npc ? Craft.teachList(s.npc).find(x => x.id === r.id) : null, who = r.from;
  if (s.item && s.never) return `向雜貨商米洛買「${ITEMS[s.item].name}」` + (t && t.why && !/米洛/.test(t.why) ? '，或' + t.why : '');
  return !t ? `跟${who}學` : t.ok ? `現在就能去找${who}學` : `跟${who}學：${t.why}`;
}
export function renderCraft() {
  if (!H.isOpen('craft')) return;
  if (Fish.craftPage(S, renderCraft, H)) return;      // 0.7：「分解魚」分頁（fish07.js 畫）
  const camp = S.where && S.where.camp, list = Craft.list(S.st), box = $('craftList'), info = $('craftInfo'), brew = S.st === 'brew';
  $('craftTitle').textContent = brew ? '製藥　艾妲的藥草架' : camp ? '料理　' + camp.name : '料理　酒館的大鍋';
  $('craftIc').innerHTML = ''; $('craftIc').appendChild(H.ic(brew ? 'potion' : camp ? 'rest' : 'food_stew', 'bare'));
  if (!S.sel || !list.some(r => r.id === S.sel)) S.sel = (list.find(r => r.known && !r.why) || list.find(r => r.known) || list[0] || {}).id || null;
  box.textContent = ''; const known = list.filter(r => r.known), unk = list.filter(r => !r.known);
  const row = r => { const b = el('button', 'c6r' + (r.id === S.sel ? ' on' : '') + (r.known ? (r.why ? ' no' : '') : ' unk')), sp = el('span'); b.dataset.id = r.id;
    sp.append(el('b', '', r.name), el('small', '', r.known ? effects(r.id).join('・') : learnHint(r))); b.append(H.ic(r.id), sp);
    if (r.known) b.append(el('em', r.why ? 'no' : 'ok', r.why ? (r.why === '帶不下了' ? '帶滿' : r.why === '金幣不夠' ? '缺錢' : '缺料') : '×' + r.max));
    b.onclick = () => { S.sel = r.id; S.n = 1; H.sfx('click'); renderCraft(); }; return b; };
  for (const r of known) box.appendChild(row(r));
  if (!known.length) box.appendChild(el('p', 'c6empty', brew ? '還沒學會任何藥。找艾妲「請教配方」。' : '還沒學會任何料理。找瑪歌或哈根「請教料理」。'));
  if (unk.length) { box.appendChild(el('div', 'c6sub', `還沒學會（${unk.length}）：點一下看跟誰學`)); const g = el('div', 'c6unk');      // 還沒學會的縮成一排小圖示，清單才不用捲動
    for (const r of unk) { const b = el('button', 'c6u' + (r.id === S.sel ? ' on' : '')); b.dataset.id = r.id; b.title = r.name + '：' + learnHint(r); b.appendChild(H.ic(r.id)); b.onclick = () => { S.sel = r.id; S.n = 1; H.sfx('click'); renderCraft(); }; g.appendChild(b); } box.appendChild(g); }
  info.textContent = ''; const r = list.find(x => x.id === S.sel);
  if (!r) { info.appendChild(el('p', 'c6empty', '這裡還沒有會做的東西。')); return; }
  // 標題：大圖示、名稱、效果標籤
  const head = el('div', 'c6head'), ht = el('div'), chips = el('div', 'c6chips'), U = USE[r.id] || {};
  for (const t of effects(r.id)) chips.append(el('i', '', t)); if (U.slot) chips.append(el('i', 'dim', (U.slot === 'food' ? '佔料理格' : '佔藥劑格') + '・' + (U.dur >= 60 ? U.dur / 60 + ' 分鐘' : U.dur + ' 秒')));
  if (r.out > 1) chips.append(el('i', 'dim', `一次做出 ${r.out} 份`));
  ht.append(el('h4', '', r.name), chips); head.append(H.ic(r.id, 'big'), ht); info.appendChild(head);
  { const d = ITEMS[r.id].desc.split('。').filter(t => t && !/^(飽食|精力|喝下後|\d+ 秒內恢復|野外 \d+ 分鐘)/.test(t)).join('。'); if (d) info.appendChild(el('p', 'c6desc', d + '。')); }
  const cur = U.slot && P[U.slot]; if (cur && cur.id !== r.id) info.appendChild(el('p', 'c6warn', `吃下去會取代現在的「${ITEMS[cur.id].name}」（還剩 ${left(cur.left)}）`));
  if (!r.known) { info.append(sec('材料'), tiles(r.mats.map(m => tile(m[0], m[1], m[2], m[3])).concat(r.fee ? [goldTile(r.fee, '調製費')] : []))); const p = el('p', 'c6learn'); p.append(H.ic('recipe', 'bare'), el('span', '', '還沒學會：' + learnHint(r) + '。')); info.appendChild(p); return; }
  S.n = Math.max(1, Math.min(S.n, Math.max(1, r.max)));
  info.append(sec(S.n > 1 ? `材料（做 ${S.n} 次）` : '材料'), tiles(r.mats.map(m => tile(m[0], m[1], m[2] * S.n, m[3])).concat(r.fee ? [goldTile(r.fee * S.n, '調製費')] : [])));
  const q = el('div', 'c6qty'), has = inv(r.id); q.append(btn('−', () => { S.n = Math.max(1, S.n - 1); renderCraft(); }, S.n <= 1 ? ' ' : ''), el('b', '', String(S.n)), btn('＋', () => { S.n = Math.min(Math.max(1, r.max), S.n + 1); renderCraft(); }, S.n >= r.max ? ' ' : ''), btn(`最多 ${Math.max(1, r.max)}`, () => { S.n = Math.max(1, r.max); renderCraft(); }, r.max <= 1 ? ' ' : '', 'mx'));
  q.append(el('small', '', r.max >= 1 ? `背包有 ${has}　做好變 ${has + S.n * r.out}` : `背包有 ${has}`)); info.appendChild(q);
  const go = el('div', 'c6go'), job = Craft.current(), b = btn('', () => { if (Craft.start(r.id, S.n, camp || me)) renderCraft(); }, '', 'primary'); b.id = 'craftGo';
  b.append(el('span', '', job ? `製作中…（${job.n * r.out} 份）` : `製作 ${S.n * r.out} 份`), el('small', '', job ? '' : `${CRAFT_TIME} 秒`)); b.disabled = !!job || !!r.why; if (job) b.classList.add('busy'); const fill = el('i'); fill.id = 'craftBar'; b.appendChild(fill);
  go.appendChild(b); if (r.why && !job) go.appendChild(el('span', 'why', r.why === '材料不夠' ? '材料不夠：紅色的那幾樣' : r.why));
  if (!brew && U.act && has > 0) go.appendChild(btn(`吃一份（背包有 ${has}）`, () => { useItem(r.id); renderCraft(); }, '', 'eat'));
  info.appendChild(go);
}

/* ============================== 整備視窗（布蘿娜）：整備｜訂做｜獸飾｜熔掉 ============================== */
export function openForge(tab) { if (tab) S.tab = tab; S.arm = null; if (S.wp == null || !Ars.has(S.wp)) S.wp = Ars.current(); H.setWin('forge', true); }
// 四階的路線：做到哪一階、下一階是哪個、哪幾階做過（別把再做素材減半）
function track(t) {
  const w = el('div', 'c6track');
  for (let i = 1; i <= TIER_MAX; i++) { const n = el('div', 'c6tn' + (i <= t ? ' done' : i === t + 1 ? ' next' : '')); n.append(el('i', '', NUM[i - 1]), el('b', '', TIERS[i].name), el('small', '', '+' + pct(TIERS[i].dmg))); if (i > t && (P.td >> i & 1)) n.append(el('u', '', '做過・減半')); w.appendChild(n); }
  return w;
}
// 武器的一列（整備清單、獸飾格、熔掉、武器架共用）：階級圖示、名稱、階級
function wpHead(o, sub) { const t = el('div', 'txt'), b = el('b', '', o.name); if (o.cur) b.append(el('i', 'c6tag', '手上')); t.append(b, el('small', '', sub != null ? sub : tierTxt(o.t))); return [H.ic('tier' + o.t), t]; }
export function renderForge() {
  if (!H.isOpen('forge')) return;
  $('forgeGold').textContent = P.gold; for (const b of $('forgeTabs').children) b.classList.toggle('on', b.dataset.t === S.tab);
  const box = $('forgeBody'); box.textContent = ''; box.dataset.t = S.tab; const owned = Ars.owned(); if (!Ars.has(S.wp)) S.wp = Ars.current();
  if (S.tab === 'up') {
    const wrap = el('div', 'c6wrap'), list = el('div', 'c6list'), info = el('div', 'c6info');
    for (const o of owned) { const b = el('button', 'c6r' + (o.wp === S.wp ? ' on' : '')), sp = el('span'); b.dataset.wp = o.wp; sp.append(el('b', '', o.name), el('small', '', (o.t ? NUM[o.t - 1] + '階「' + TIERS[o.t].name + '」' : '還沒整備') + (o.cur ? '・手上' : ''))); b.append(H.ic('tier' + o.t), sp); b.onclick = () => { S.wp = o.wp; H.sfx('click'); renderForge(); }; list.appendChild(b); }
    list.appendChild(el('p', 'c6foot', '別種武器在「訂做」分頁。'));
    const I = Ars.upgradeInfo(S.wp), o = owned.find(x => x.wp === S.wp);
    if (o) {
      const head = el('div', 'c6head'), ht = el('div'); ht.append(el('h4', '', o.name), el('div', 'c6now', '現在：' + tierTxt(o.t))); head.append(H.ic('tier' + o.t, 'big'), ht); info.append(head, track(o.t));
      if (I.max) info.appendChild(el('p', 'c6done', '已經整備到頂了：四階「三名」，武器帶著微光。'));
      else {
        const T = TIERS[I.tier], orig = I.half ? T.mats : null, nx = el('div', 'c6next');
        nx.append(el('b', '', `下一階：${NUM[I.tier - 1]}階「${I.name}」`), el('span', '', `傷害 +${pct(I.dmg)}（累計）` + (I.slot ? '，開一格獸飾' : '')));
        if (I.half) nx.append(el('i', 'half', '素材減半')); info.appendChild(nx);
        const ts = I.mats.map(m => tile(m[0], m[1], m[2], m[3], { was: orig ? orig[m[0]] : 0 }));
        if (I.show.length) info.append(sec('素材'), tiles(ts.concat([goldTile(I.fee)])), sec('出示三件菁英戰利品（不會消耗）'), tiles(I.show.map(([id, name, has]) => tile(id, name, 1, has ? 1 : 0, { show: 1, cls: 'tro' }))));
        if (I.show.length) info.lastChild.classList.add('w3');
        else info.append(sec('素材'), tiles(ts.concat([goldTile(I.fee)])));
        const go = ((ITEMS.collar || P.inv.collar > 0) && I.mats.some(m => m[0] === 'ore_iron') && info.appendChild(el('p', 'c6foot c8collar', `斷項圈可直接抵鐵礦石（1 條抵 2 塊）：你有 ${P.inv.collar || 0} 條`)), el('div', 'c6go')), b = btn(`整備到${NUM[I.tier - 1]}階`, () => { Ars.upgrade(S.wp); renderForge(); }, '', 'primary'); b.id = 'forgeGo'; b.disabled = !!I.why; go.appendChild(b);
        go.appendChild(el('span', I.why ? 'why' : 'fee', I.why || '不會失敗、不會損壞、不會降階')); info.appendChild(go);
      }
      if (!I.max && !I.show.length) info.appendChild(el('p', 'c6foot', '同一階只要在任何一把上做過，之後別把做到這一階素材減半（工錢照付）。'));
    }
    wrap.append(list, info); box.appendChild(wrap);
  } else if (S.tab === 'order') {      // 不能訂做的原因（素材、金幣）上面那排已經標紅，不在每張卡重複
    const top = el('div', 'c6bar'); top.append(el('div', 'c6lead', '訂做一把別種武器的基礎款（零階）'), tiles([goldTile(ORDER.fee), tile('scrap', ITEMS.scrap.name, ORDER.mats.scrap, inv('scrap'))]));
    box.append(top, el('p', 'c6foot', '舊鐵件在北大道盡頭的斷鍊旁、岔路營地的貨車邊撿得到。想先試手感：競技場裡 12 種都能免費試用。'));
    const g = el('div', 'c6cards w3');
    WEAPONS.forEach((w, wp) => { const has = Ars.has(wp), why = has ? '' : Ars.orderCheck(wp), r = el('div', 'c6row card' + (has ? ' have' : '')), t = el('div', 'txt'); t.append(el('b', '', w.name), el('small', '', has ? (wp === Ars.current() ? '拿在手上' : '在武器架上') : why ? '' : '可以訂做')); r.append(t, has ? el('span', 'ok', '✓') : btn('訂做', () => { Ars.order(wp); renderForge(); }, why)); g.appendChild(r); });
    box.appendChild(g);
  } else if (S.tab === 'charm') {
    box.appendChild(el('p', 'c6foot', `獸飾裝在武器上（二階「鑲牙」起每把一格）。製作 ${CHARM_FEE.make} 金；裝上免費；從武器上拆下來 ${CHARM_FEE.move} 金，不會壞。`));
    const g = el('div', 'c6cards w3');
    for (const id of CHARM_IDS) { const K = CHARMS[id], why = Ars.charmCheck(id), c = el('div', 'c6row card tall'), n = inv(id);
      const hd = el('div', 'hd'); hd.append(H.ic(id), el('b', '', ITEMS[id].name)); c.append(hd, el('p', 'fx', K.text), tiles(Ars.matRows(K.mats).map(m => tile(m[0], m[1], m[2], m[3]))), el('small', 'own', n ? `背包有 ${n} 個` : '背包裡沒有'), btn(`製作　${CHARM_FEE.make} 金`, () => { Ars.makeCharm(id); renderForge(); }, why)); g.appendChild(c); }
    box.append(g, sec('武器上的獸飾格'));
    for (const o of owned) { const r = el('div', 'c6row'), right = el('div', 'acts');
      if (o.t < CHARM_TIER) right.append(el('span', 'dim', '二階才有獸飾格'));
      else if (o.c) right.append(btn(`拆下　${CHARM_FEE.move} 金`, () => { Ars.removeCharm(o.wp); renderForge(); }, P.gold < CHARM_FEE.move ? '金幣不夠' : ''));
      else { const have = CHARM_IDS.filter(id => inv(id) > 0); if (!have.length) right.append(el('span', 'dim', '背包裡沒有獸飾')); for (const id of have) right.append(btn('裝上' + ITEMS[id].name, () => { Ars.setCharm(o.wp, id); renderForge(); })); }
      r.append(...wpHead(o, (o.t ? NUM[o.t - 1] + '階' : '還沒整備') + (o.c && o.t >= CHARM_TIER ? '　' + ITEMS[o.c].name + '：' + CHARMS[o.c].text : o.t >= CHARM_TIER ? '　獸飾格空著' : '')), slotBox(o, true), right); box.appendChild(r); }
  } else {
    box.appendChild(el('p', 'c6foot', '用不到的武器可以熔掉：還你那一把用過的強化素材的三分之一（無條件捨去，每種至少 1 個）。工錢不退，獸飾先拆下來還你。拿在手上的不能熔。'));
    for (const o of owned) { const why = Ars.meltCheck(o.wp), back = Ars.meltBack(o.wp), r = el('div', 'c6row melt' + (S.arm === o.wp ? ' arm' : '')), got = el('div', 'back');
      const ids = Object.keys(back); if (o.c) { const s = el('span', 'bk'); s.append(H.ic(o.c, 'bare'), el('em', '', '拆下')); got.appendChild(s); }
      for (const id of ids) { const s = el('span', 'bk'); s.title = ITEMS[id].name + ' ×' + back[id]; s.append(H.ic(id, 'bare'), el('em', '', '×' + back[id])); got.appendChild(s); }
      if (!ids.length && !o.c) got.appendChild(el('small', 'dim', '沒用過強化素材，熔掉什麼也不會還'));
      const b = btn(S.arm === o.wp ? '確定熔掉？' : '熔掉', () => { if (S.arm !== o.wp) { S.arm = o.wp; renderForge(); return; } S.arm = null; Ars.melt(o.wp); renderForge(); }, why, S.arm === o.wp ? 'primary' : '');
      const t = wpHead(o, why && o.cur ? tierTxt(o.t) + '　（拿在手上）' : tierTxt(o.t)); r.append(...t, got, b); box.appendChild(r); }
    if (owned.length < 2) box.appendChild(el('p', 'c6empty', '你只有一把武器，沒有可以熔的。'));
  }
}

/* ============================== 披肩視窗（哈根） ============================== */
export function openCloak() { H.setWin('cloak', true); }
export function renderCloak() {
  if (!H.isOpen('cloak')) return; $('cloakGold').textContent = P.gold; const box = $('cloakBody'); box.textContent = '';
  const now = el('div', 'c6bar'), wear = P.cloak; now.append(wear ? H.ic(wear) : el('span', 'ic empty'), el('div', 'c6lead', wear ? `穿著${ITEMS[wear].name}` : '還沒穿披肩'), el('span', 'c6dr', `減傷合計 ${pct(M6.dr)}（上限 ${pct(DR_CAP)}）`)); box.appendChild(now);
  const g = el('div', 'c6cards w3');
  for (const id of CLOAK_IDS) { const K = CLOAKS[id], has = inv(id) > 0, on = wear === id, why = has ? '' : Ars.cloakCheck(id), c = el('div', 'c6row card tall' + (on ? ' cur' : has ? ' have' : ''));
    const hd = el('div', 'hd'); hd.append(H.ic(id, 'big'), el('b', '', ITEMS[id].name)); if (on) c.append(el('i', 'rib', '穿著'));
    const fx = el('div', 'fx2'); fx.append(el('span', '', '受到的傷害 −' + pct(K.dr)), el('span', '', '精力消耗 −' + pct(1 - K.en)));
    c.append(hd, fx); if (has) c.append(el('p', 'own', on ? '已經披在身上' : '已經有了，隨時可以換'));
    else c.append(tiles(Ars.matRows(K.mats).map(m => tile(m[0], m[1], m[2], m[3])).concat([goldTile(K.fee)])), el('small', 'own', `大約 ${K.lv} 級可以做`));
    c.append(has ? btn(on ? '收起來' : '披上', () => { Ars.wearCloak(id); renderCloak(); }) : btn('製作', () => { Ars.makeCloak(id); renderCloak(); }, why)); g.appendChild(c); }
  box.append(g, el('p', 'c6foot', `披肩跟著人，一次穿一件，外觀看得到。減傷和料理、藥劑的減傷加在一起，合計最多 ${pct(DR_CAP)}。`));
}

/* ============================== 角色面板的「武器架與狀態」分頁 ============================== */
export const charTab = () => S.charTab;
function needRow(k, N) {
  const lv = k === 'sat' ? N.satLv : N.enLv, v = k === 'sat' ? N.sat : N.en, nm = k === 'sat' ? N.satName : N.enName, tx = k === 'sat' ? N.satText : N.enText;
  const r = el('div', 'c6need ' + ['zero', 'lo', 'mid', 'hi'][lv]), top = el('div', 'top'), bar = el('div', 'nbar ' + (k === 'sat' ? 'sat' : 'en')), f = el('i');
  f.style.transform = `scaleX(${Math.max(0, Math.min(1, v / N.max))})`; bar.append(f, el('u'), el('u'));
  top.append(H.ic(k === 'sat' ? 'satiety' : 'energy', 'bare'), el('b', '', k === 'sat' ? '飽食' : '精力'), el('em', '', `${Math.round(v)} / ${N.max}`)); r.append(top, bar, el('small', '', (nm ? nm + '：' : '') + tx)); return r;
}
function buffRow(slot) {
  const b = Craft.buffs().find(x => x.slot === slot), r = el('div', 'c6buff' + (b ? '' : ' empty'));
  if (!b) { r.append(H.ic(slot === 'food' ? 'slot_food' : 'slot_tonic', 'bare'), el('div', 'txt')); r.lastChild.append(el('b', '', slot === 'food' ? '料理格空著' : '藥劑格空著'), el('small', '', slot === 'food' ? '吃料理：20 分鐘的加成' : '喝藥劑：3 分鐘的加成')); return r; }
  const t = el('div', 'txt'); t.append(el('b', '', b.name), el('small', '', b.text)); r.append(H.ic(b.id), t, el('em', me.inSafe ? 'town' : '', me.inSafe ? mmss(b.left) + '　城裡不倒數' : '剩 ' + mmss(b.left))); return r;
}
export function renderRack() {
  for (const b of $('charTabs').children) b.classList.toggle('on', b.dataset.t === S.charTab);
  $('charPageStat').hidden = S.charTab !== 'stat'; const box = $('charPageRack'); box.hidden = S.charTab !== 'rack'; if (box.hidden) return; box.textContent = '';
  const trial = me.trial != null, own = Ars.owned();
  box.appendChild(sec(`武器架（${own.length} 把）`, el('small', '', '脫離戰鬥才能換，換的動作 1.5 秒')));
  for (const o of own) { const cur = o.cur && !trial, why = cur ? '' : Ars.canSwap(o.wp), r = el('div', 'c6row wp' + (cur ? ' cur' : '')); r.append(...wpHead(Object.assign({}, o, { cur }), o.t ? `${NUM[o.t - 1]}階「${TIERS[o.t].name}」　傷害 +${pct(TIERS[o.t].dmg)}` : '還沒整備　傷害 +0%'), slotBox(o), cur ? el('span', 'ok', '拿著') : btn('換上', () => { Ars.swap(o.wp); }, why)); box.appendChild(r); }
  if (Ars.inArena() || trial) { box.appendChild(sec('競技場試用', el('small', '', '免費，帶不出競技場'))); const g = el('div', 'c6grid'); WEAPONS.forEach((w, wp) => { const b = btn(w.name, () => { Ars.trial(wp); ui.dirty = true; }); if (Ars.shown() === wp) b.className = 'on'; g.appendChild(b); }); box.appendChild(g); }
  else box.appendChild(el('p', 'c6foot', '別種武器向鐵匠布蘿娜訂做；整備、獸飾、熔掉也找她。'));
  // 披肩：一列；有好幾件時其他的是小按鈕
  const cl = CLOAK_IDS.filter(id => inv(id) > 0), cr = el('div', 'c6row cloak' + (P.cloak ? ' cur' : ''));
  box.appendChild(sec('披肩'));
  if (P.cloak) { const K = CLOAKS[P.cloak], t = el('div', 'txt'); t.append(el('b', '', ITEMS[P.cloak].name), el('small', '', `受到的傷害 −${pct(K.dr)}　精力消耗 −${pct(1 - K.en)}`)); cr.append(H.ic(P.cloak), t); }
  else { const t = el('div', 'txt'); t.append(el('b', '', cl.length ? '沒有穿' : '還沒有披肩'), el('small', '', cl.length ? '點右邊的披肩穿上' : '到獵人營地找老獵人哈根做')); cr.append(el('span', 'ic empty'), t); }
  const acts = el('div', 'acts'); for (const id of cl) acts.append(btn(P.cloak === id ? '收起來' : ITEMS[id].name.replace('披肩', ''), () => Ars.wearCloak(id), '', P.cloak === id ? '' : 'pick')); cr.appendChild(acts); box.appendChild(cr);
  // 狀態：飽食、精力、料理格、藥劑格
  const N = Needs.status(), g = el('div', 'c6state'); g.append(needRow('sat', N), needRow('en', N), buffRow('food'), buffRow('tonic')); box.append(sec('狀態', el('small', '', '飽食與精力只在野外戰鬥中消耗；增益只在野外倒數')), g);
  const sum = el('div', 'c6sum'); sum.append(el('span', '', '造成的傷害 ×' + M6.dmg.toFixed(2) + (M6.heavy > 1 ? `（重攻擊 ×${(M6.dmg * M6.heavy).toFixed(2)}）` : '')), el('span', '', `減傷 ${pct(M6.dr)}` + (M6.drRaw > DR_CAP + 1e-6 ? `（合計 ${pct(M6.drRaw)}，上限 ${pct(DR_CAP)}）` : `（上限 ${pct(DR_CAP)}）`)));
  if (P.pas && P.pas.gather) sum.append(el('span', 'good', '採集精通：每兩株多 1 個、快三成')); box.appendChild(sum);
  box.appendChild(el('p', 'c6foot', `飽食：吃料理、肉乾、生吃獸肉；回城會慢慢回到一半，瑪歌的今日燉鍋 ${NEEDS.stewFee} 金回滿。精力：營火坐下每秒 +${NEEDS.camp}，回城自動回滿。「${STATS.end.name}」每 1 點讓兩條上限各 +${NEEDS.perEnd}。`));
}

/* ============================== 營火休息 ============================== */
// game.js 坐下成功後會呼叫 ui.craft('cook', { camp })（ui.js 轉到 onSit）；起身時 ui.craft(null)（轉到 onStand）。移動、出手、挨打起身時 game.js 不通知：每幀看 me.sit
const R6 = { camp: null, seat: null, from: null, t: 0, dur: 0.22, at: 0 }, SEAT_IN = 0.5;      // SEAT_IN：坐在座位（木樁、倒木）前面多少公尺的地上，靠著它面向火
// 這處營火的座位（world.js 擺好營火後算出的世界座標）：最近的空位；被其他坐著的玩家佔了的不選。沒有座位（佔位的火堆）就原地坐
export function seatFor(c) {
  const cs = campSpots.find(s => s.id === c.id) || campSpots.find(s => Math.hypot(s.x - c.x, s.z - c.z) < 2), seats = (cs && cs.seats) || []; if (!seats.length) return null;
  let best = null, bd = 1e9;
  for (const q of seats) { const dx = c.x - q.x, dz = c.z - q.z, d = Math.hypot(dx, dz) || 1, s = { x: q.x + dx / d * SEAT_IN, z: q.z + dz / d * SEAT_IN };
    if ([...remotes.values()].some(r => r.sit && Math.hypot(r.x - s.x, r.z - s.z) < 0.8)) continue; const dm = Math.hypot(s.x - me.x, s.z - me.z); if (dm < bd) { bd = dm; best = s; } }
  return best;
}
export function onSit(camp) {
  R6.camp = camp; R6.seat = seatFor(camp); R6.from = { x: me.x, z: me.z }; R6.t = 0; R6.at = performance.now();
  S.last.rest = null; H.cursor(true); renderRest(); $('rest6').classList.add('on');
}
export function onStand() { if (!R6.camp) return; R6.camp = null; R6.seat = null; $('rest6').classList.remove('on'); if (H.isOpen('craft') && S.where && S.where.camp) H.setWin('craft', false); H.cursor(false); }
export const resting = () => !!R6.camp;
export function restCook() { if (!R6.camp || !me.sit) return; if (H.isOpen('craft')) { H.setWin('craft', false); return; } openCraft('cook', { camp: R6.camp }); }
function renderRest() {
  const N = Needs.status(), c = R6.camp; if (!c) return;
  const full = N.en >= N.max - 0.5, key = [c.id, Math.round(N.en), N.max, N.duo, full, H.isOpen('craft')].join('|'); if (key === S.last.rest) return; S.last.rest = key;
  $('r6name').textContent = c.name; $('r6fill').style.transform = `scaleX(${Math.max(0, Math.min(1, N.en / N.max))})`; $('r6en').textContent = `${Math.round(N.en)} / ${N.max}`;
  $('r6rate').textContent = full ? '精力滿了，隨時可以出發。' : N.duo ? `有同伴一起坐：精力每秒 +${NEEDS.campDuo}` : `精力每秒 +${NEEDS.camp}`;
  $('r6tip').textContent = N.duo ? '一起坐的人越久越省事，誰都不用等。' : `兩個人以上一起坐，回得快五成（每秒 +${NEEDS.campDuo}）。`;
  $('rest6').classList.toggle('duo', !!N.duo); $('rest6').classList.toggle('full', full); const co = H.isOpen('craft'); $('r6cook').classList.toggle('on', co); $('r6cook').lastChild.textContent = co ? '收起料理' : '料理';
}

/* ============================== 每幀：飽食與精力兩條、增益列、採集進度、製作進度、休息面板與座位 ============================== */
const LVC = ['zero', 'lo', 'mid', 'hi'];
export function updateHud() {
  const N = Needs.status(), L = S.last, now = performance.now();
  for (const [k, box, fill, tag, lv, v, nm] of [['s', 'satBox', 'satFill', 'satTag', N.satLv, N.sat, N.satName], ['e', 'enBox', 'enFill', 'enTag', N.enLv, N.en, N.enName]]) {
    const q = Math.round(v / N.max * 200); if (q === L[k + 'q'] && lv === L[k + 'l'] && N.max === L[k + 'm']) continue; L[k + 'q'] = q; L[k + 'l'] = lv; L[k + 'm'] = N.max;
    $(fill).style.transform = `scaleX(${q / 200})`; $(box).className = 'n6 ' + LVC[lv]; $(tag).textContent = nm || '';
    $(box).title = (k === 's' ? '飽食' : '精力') + ` ${Math.round(v)} / ${N.max}　${nm ? nm + '：' : ''}${k === 's' ? N.satText : N.enText}（點一下看詳情）`;
  }
  // 增益列：料理一格、藥劑一格（只在野外倒數；在城裡時間不動），底下一條細線是剩下的比例
  const bf = Craft.buffs(), key = bf.map(b => b.id + Math.ceil(b.left / (b.left > 90 ? 60 : 1))).join('|') + (me.inSafe ? 't' : '');
  if (key !== L.bf) { L.bf = key; const box = $('buffs6'); box.textContent = ''; for (const b of bf) { const sp = el('span', me.inSafe ? 'town' : (b.left < 60 ? 'end' : '')); sp.title = `${b.name}：${b.text}` + (me.inSafe ? '（在城裡不倒數）' : '（只在野外倒數）'); const u = el('u'); u.style.transform = `scaleX(${Math.max(0, Math.min(1, b.left / b.dur))})`; sp.append(H.ic(b.id), el('b', '', b.name), el('em', '', me.inSafe ? '⏸ ' + left(b.left) : left(b.left)), u); box.appendChild(sp); } }
  // 採集進度
  const g = Gather.progress(), ge = $('gather6');
  if (!!g !== !!L.g) { L.g = !!g; ge.classList.toggle('on', !!g); if (g) H.tip('g6gather', `按住 ${keyOf('interact')} 會一株接一株採，放開或走動就停；採過的過幾分鐘會長回來。`); }
  if (g) { const t = (g.walk ? '走向下一株' : '採集') + g.name; if (t !== L.gt || g.kind !== L.gk) { L.gt = t; L.gk = g.kind; $('g6name').textContent = t; const ic = $('g6ic'); ic.textContent = ''; ic.appendChild(H.ic(g.kind, 'bare')); } $('g6fill').style.transform = `scaleX(${g.p})`; ge.classList.toggle('walk', !!g.walk); }
  // 製作視窗：進度條（做在按鈕裡）、營火旁的休息狀態；做完或中斷後重畫；起身就關
  if (H.isOpen('craft')) {
    const job = Craft.current(), camp = S.where && S.where.camp; if (!!job !== !!L.job) { L.job = !!job; renderCraft(); }
    if (job) { const bar = $('craftBar'); if (bar) bar.style.transform = `scaleX(${Math.min(1, job.t / job.dur)})`; }
    const note = camp ? `用${camp.name}的火料理。關掉視窗照樣坐著休息；移動或按 ${keyOf('interact')} 起身。` : S.st === 'brew' ? '藥草架借你用：調藥要付調製費，材料自己採。' : '大鍋借你用，材料自己帶。做好的料理放在背包，出門前吃一份。';
    if (note !== L.note) { L.note = note; $('craftNote').textContent = note; }
    if (camp && !me.sit) H.setWin('craft', false);
  } else L.job = false;
  // 休息面板：坐著才顯示（料理視窗開在左邊，面板在右下，兩個同時看得到）；滑到座位上
  if (R6.camp) {
    if (!me.sit) onStand();
    else {
      renderRest();
      if (R6.seat && R6.from) { const c = me.sit, s = R6.seat, k = Math.min(1, (now - R6.at) / 1000 / R6.dur), e = k * (2 - k);      // 沿著營火繞（角度與半徑分開內插），不會穿過火堆
        const a0 = Math.atan2(R6.from.x - c.x, R6.from.z - c.z), r0 = Math.hypot(R6.from.x - c.x, R6.from.z - c.z), a1 = Math.atan2(s.x - c.x, s.z - c.z), r1 = Math.hypot(s.x - c.x, s.z - c.z), da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), a = a0 + da * e, r = r0 + (r1 - r0) * e;
        me.x = c.x + Math.sin(a) * r; me.z = c.z + Math.cos(a) * r; me.vx = me.vz = 0; me.f = Math.atan2(c.x - me.x, c.z - me.z); if (k >= 1) R6.from = null; }
    }
  }
  // 新手提示：餓了、累了、第一次走到營火旁
  if (N.satLv <= 1 && !me.inSafe) H.tip('g6hungry', '肚子餓了，生命上限少了一點。吃料理、肉乾或生吃獸肉都能填飽；回城也會慢慢回到一半。');
  if (N.enLv <= 1 && !me.inSafe) H.tip('g6tired', '累了，體力回得比較慢。到營火坐一下（大約 20 秒回滿），或回城找瑪歌歇一會。');
  if (!me.sit && !(L.campT > now)) { L.campT = now + 500; if (Needs.nearCamp()) H.tip('g6camp', `這是營火：按 ${keyOf('interact')} 坐下回精力，有人一起坐更快；坐著也能料理。`); }
}
// 新手提示：第一次撿到料理的材料、獸飾或披肩的材料（ui.js 每次背包變動時呼叫；第一次呼叫只記下現有的數量）
const FOOD_MATS = [...new Set(Object.values(RECIPES).filter(r => r.st === 'cook').flatMap(r => Object.keys(r.mats)))].filter(id => id !== 'herb_bleed'), GEAR_MATS = ['tusk', 'antler', 'fang', 'pelt_deer', 'pelt_wolf', 'pelt_bear', 'pelt_tiger'];
let invSeen = null;
export function invTips() {
  const got = id => invSeen && inv(id) > (invSeen[id] || 0), knowsCook = () => Object.keys(P.rec || {}).some(id => RECIPES[id] && RECIPES[id].st === 'cook');
  if (FOOD_MATS.some(id => got(id) && (id !== 'meat' || knowsCook()))) H.tip('g6food', '這是料理的材料：帶到酒館的大鍋或營火，就能做成吃了有加成的料理（配方向瑪歌、哈根學）。');
  if (GEAR_MATS.some(got)) H.tip('g6gear', '獸皮、獠牙、鹿角先留著：鐵匠布蘿娜拿來整備武器、做獸飾，老獵人哈根拿來縫披肩。');
  invSeen = {}; for (const id of FOOD_MATS.concat(GEAR_MATS)) invSeen[id] = inv(id);
}
