/* 0.8 介面中間層（介面總監 d8-ui，R3）。
   把介面成員的四包（ui08a 戰績簿／結果卡、ui08e 菁英名牌／施法條／掙脫條／懸賞、ui08h 試煉與對決 HUD、ui08g 被盯上預警）和 ui08w（雨的懷錶記號）
   接到真遊戲：給它們 H（介面工具）與 D（玩法的狀態與事件，形狀照 d8-ui/mock/stub08.js）。
   ui.js 只在 initUI 呼叫 init(基本工具)、updateUI 呼叫 tick(dt)、對話選單／任務卡／任務詳細頁呼叫 npcOptions／dlgCard／questDetail。
   玩法模組一律「有就用、沒有就退回」：trial08、duel08、weather08、elite08、story08、trail08 用動態匯入，載不到就給空的樣子。
   規格：/home/claude/team/d8-play/介面08.md v1.3 第 5 節；/home/claude/team/d8-ui/約定-需求.md。
   註解只用區塊註解（不准用行尾雙斜線註解）。 */
import * as H8 from './hooks08.js';
import { me, mons, remotes, party, inviteIn as partyInviteIn, QUESTS, NPCS, qStatus, X8 } from './game.js';
import * as BA7 from './beastai07.js'; import * as BA8 from './beastai08a.js';      /* 0.8 X7（R6）：鱷魚咬住（beastai08a 沒有掛進 beastai07 的 EXT）、猴子偷東西的託管 */
import { W } from './world.js';
import * as UA from './ui08a.js';
import * as UE from './ui08e.js';
import * as UH from './ui08h.js';
import * as UG from './ui08g.js';
import * as UW from './ui08w.js';
import * as UK from './ui08k.js';      /* 0.8 X7（R6）：猴子偷走的東西（託管清單）；下一行是 story-fin 加的 */
import * as UWL from './welcome08.js';      /* 劇情 story-fin：新角色出生在南門外、托比迎新 */

const M = { trial: null, duel: null, wx: null, elite: null, story: null, trail: null };
/* 動態載入的玩法模組。0.8 X7：elite08.js（P5 三隻菁英的招式）與 trail08.js（P1-c 獸徑）還沒有這兩個檔，載入會在 console 留兩筆 404（成員回報的「真遊戲載入時有 404」就是這兩筆），
   所以先不載；檔案進到 0.8 線時，把 ['elite', './elite08.js']、['trail', './trail08.js'] 加回這張表即可（沒載到時 M.elite／M.trail 是 null，介面照常退回） */
const OPT08 = [['trial', './trial08.js'], ['duel', './duel08.js'], ['wx', './weather08.js'], ['story', './story08.js'], ['elite', './elite08.js']];      /* X4：elite08 進 0.8 線了 */
const opt = (k, f) => import(f).then(m => { M[k] = m; }).catch(() => {});
const call = (f, dflt) => { try { const v = f(); return v === undefined ? dflt : v; } catch (e) { return dflt; } };
const dev = () => typeof window !== 'undefined' && !!window.__dev07;

/* ============================== H：介面工具 ============================== */
let B = null, H = null, started = false;
const ticks = [], cardHooks = [], detailHooks = [], npcOpts = {};
/* 3-2-1 的 sfx('arena','count'|'go')：由玩法發（trial08 的 lead()、duel08 的 duelTick()，雙方各自照共同時鐘），介面不再發，避免響兩次 */
const ARENA_BY_PLAY = new Set(['count', 'go']);
function makeH(base) {
  return Object.assign({}, base, {
    sfx: (n, a, o) => { if (n === 'arena' && ARENA_BY_PLAY.has(a)) return; try { base.sfx(n, a, o); } catch (e) { } },
    /* 對話中開視窗（巴索的戰績簿）：走 ui.js 的 dlgWin，對白條先收起來、關掉視窗回到對話；其他時候照舊 */
    setWin: (k, on) => { const d = base.dlg && base.dlg(); if (on && d && !d.shop && base.dlgWin && base.WINS[k] && !base.isOpen(k)) { base.dlgWin(k); return; } base.setWin(k, on); },
    onTick: fn => { if (typeof fn === 'function') ticks.push(fn); },
    addWin: (k, id) => { base.WINS[k] = id; },
    addNpcOption: (npc, label, fn) => { (npcOpts[npc] = npcOpts[npc] || []).push([label, fn]); },
    onBodyClass: (n, on) => document.body.classList.toggle(n, !!on),
    onDlgCard: fn => { if (typeof fn === 'function') cardHooks.push(fn); },
    onQuestDetail: fn => { if (typeof fn === 'function') detailHooks.push(fn); },
  });
}

/* ============================== D：玩法的狀態與事件 ============================== */
/* 介面成員用的事件名 → hooks08 的事件鍵（介面08 第 3、5 節） */
const EV = { result: ['trial:result', 'duel:result'], horn: ['trial:horn'], cast: ['beast:cast'], invite: ['duel:invite'], cancel: ['duel:cancel'],
  drag: ['beast:drag'], marked: ['beast:marked'], spawn: ['elite:spawn'], rain: ['weather:change'], thunder: ['weather:thunder'],
  wave: ['trial:wave'], cond: ['trial:cond'], enter: ['trial:enter'], exit: ['trial:exit'], gate: ['trial:gate'], count: ['duel:count'], go: ['duel:go'] };
const TIER_NAME = ['第一級', '第二級', '第三級'], TIER_LV = ['3–5', '8–10', '12–15'];
const SHORT = { trophy_frost: 'frost', trophy_scar: 'scar', trophy_shadow: 'shade', trophy_bison: 'bull', trophy_bull: 'bull', trophy_python: 'python', trophy_irontooth: 'irontooth' };
const CREST = { frost: 'wolf', scar: 'bear', shade: 'tiger', bull: 'bison', python: 'python', irontooth: 'dog' };
const BOUNTY_CREST = { trophy_frost: 'wolf', trophy_scar: 'bear', trophy_shadow: 'tiger', trophy_bison: 'bison', trophy_python: 'python', trophy_irontooth: 'dog' };
/* 玩法給的原因有開發用字（「還沒做好（P3-c）」）：玩家看到的換成一般說法 */
const playerWhy = w => (/還沒做好|還沒載入/.test(w) ? '還在準備，晚一點開放' : w);
const allMons = () => (X8 && Array.isArray(X8.mons) && X8.mons.length ? mons.concat(X8.mons) : mons);
const monById = id => { for (const v of allMons()) if (v.id === id) return v; return null; };
const tagOfPeer = who => { if (who === 'me' || who === 'self') return me.tag || null; const r = remotes.get(who); return r && r.tag ? r.tag : null; };
const nameTitle = s => { const t = String(s || '').replace(/\s*Lv\s*\d+$/, ''), i = t.lastIndexOf('・'); return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : ['', t]; };

/* 對決邀請和組隊邀請：先到先顯示（後到的那個排隊；對決邀請排隊時 ui08h 不畫、不攔 Y／N，Y／N 照舊給組隊） */
let duelQ = { key: '', party: false };
function duelInvite() {
  const v = M.duel && call(() => M.duel.inviteIn(), null); if (!v) { duelQ = { key: '', party: false }; return null; }
  const key = (v.from && (v.from.peer || v.from.name)) + '', pty = !!call(() => partyInviteIn(), null);
  if (key !== duelQ.key) duelQ = { key, party: pty };
  if (duelQ.party) { if (pty) return null; duelQ.party = false; }
  return Object.assign({ tmax: 30 }, v, { queued: pty ? 1 : 0 });
}

/* 測試用假資料（只在 __dev07；玩法給了同名指令就用玩法的） */
const demo = { cast: null, drag: 0, mark: null };
function nearestShown(n = 1) {
  const out = []; for (const v of allMons()) { if (!v.tag || !v.tag.el || v.tag.el.style.display === 'none') continue; out.push([Math.hypot(v.x - me.x, v.z - me.z), v]); }
  return out.sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
}
function camBasis() {
  const c = W.camera; let fx = 0, fz = -1;
  if (c) { const e = c.matrixWorld.elements, dx = -e[8], dz = -e[10], l = Math.hypot(dx, dz); if (l > 0.05) { fx = dx / l; fz = dz / l; } }
  return [fx, fz];
}
function screenAng(x, z) { const [fx, fz] = camBasis(), dx = x - me.x, dz = z - me.z; return Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); }

const D = {
  on(evt, fn) { for (const k of EV[evt] || [evt]) H8.on(k, fn); },

  /* ---------- 試煉、百場連戰、對決紀錄（ui08a） ---------- */
  trials() {
    const T = M.trial; if (!T || !T.TRIALS) return [];
    return T.TRIALS.map(x => { const r = call(() => T.rec(x.id), { cleared: false, best: null }), why = call(() => T.canStart('trial', x.id, x.mode === 'duo' ? 'duo' : 'solo'), null);
      return { id: x.id, tier: x.tier, name: x.name, foes: x.foes, cond: x.cond, mode: x.mode, reward: x.reward, cleared: !!r.cleared, best: r.best, lock: why ? playerWhy(why) : null }; });
  },
  tiers() {
    const T = M.trial, S = M.story && M.story.TIERS08, list = D.trials();
    return [1, 2, 3].map(t => { const a = list.filter(x => x.tier === t), s = Array.isArray(S) ? S[t - 1] : S && S[t];
      return { tier: t, name: (s && s.name) || TIER_NAME[t - 1], lv: (s && s.lv) || TIER_LV[t - 1], open: T ? !!call(() => T.tierOpen(t), false) : false,
        done: a.filter(x => x.cleared).length, need: a.length || 3, orb: T ? call(() => T.tierOrb(t), 'locked') : 'locked' }; });
  },
  gauntlet() {
    const T = M.trial, G = (T && T.GAUNTLET) || { waves: 10, list: [] }, r = T ? call(() => T.gauntletRec(), {}) : {}, why = T ? call(() => T.canStart('gauntlet', G.id || 'g100', 'solo'), '') : '還沒載入';
    return { waves: G.waves, list: G.list || [], best: r.best | 0, cleared: !!r.cleared, boxClaimed: !!r.boxClaimed, open: !!T && !/還沒做好|還沒載入|還沒開放/.test(why || '') };
  },
  duelRec: () => (M.duel ? call(() => M.duel.rec(), null) : null) || { win: 0, lose: 0, draw: 0 },
  carry: () => (M.trial ? call(() => M.trial.carryList(), []) : []),
  partner() {
    let best = null, bd = 1e9; for (const r of call(() => party(), [])) { const d = Math.hypot(r.x - me.x, r.z - me.z); if (d < bd) { bd = d; best = r; } }
    return best ? { name: best.name, lv: best.lv, near: bd < 15 && !best.away && best.alive !== false, peer: best.peer } : null;
  },
  /* 開始：先問 canStart（不行就把原因交給介面 toast，避免 trial08 自己也 toast 一次） */
  start(kind, id, mode) {
    const T = M.trial; if (!T) return '還沒載入'; const why = call(() => T.canStart(kind, id, mode), '還沒載入'); if (why) return playerWhy(why);
    const r = call(() => T.start(kind, id, mode), '開始失敗'); return r == null ? 'ok' : r;
  },
  orbChoices: tier => (M.trial ? call(() => M.trial.orbChoices(tier), []) : []),
  claimOrb: (tier, orb) => (M.trial ? call(() => M.trial.claimOrb(tier, orb), '還沒載入') : '還沒載入'),
  /* 結果卡的「離開沙地」：trial08 沒有 leaveSand 時，還在進行中就呼叫 leave()；已經結束就只關卡片（trial08 收尾時自己把人放到柵欄外） */
  leaveSand() { const T = M.trial; if (!T) return; if (typeof T.leaveSand === 'function') return T.leaveSand(); const s = call(() => T.state(), null); if (s && s.phase !== 'done') call(() => T.leave()); },

  /* ---------- 試煉與對決進行中（ui08h） ---------- */
  trialState: () => (M.trial ? call(() => M.trial.state(), null) : null),
  watching: () => (M.trial && M.trial.watching ? call(() => M.trial.watching(), null) : null),
  duelState() {
    const s = M.duel ? call(() => M.duel.state(), null) : null; if (!s) return null;
    if (s.vs && !s.vs.tag && s.vs.peer) { const tg = tagOfPeer(s.vs.peer); if (tg) s.vs = Object.assign({}, s.vs, { tag: tg }); }
    return s;
  },
  duelInvite,
  answerDuel: yes => (M.duel ? call(() => M.duel.answer(!!yes), false) : false),

  /* ---------- 菁英、施法、纏繞、懸賞（ui08e） ---------- */
  mons: allMons,
  eliteInfo(v) {
    if (!v || !v.elite) return null;
    const e = M.elite && M.elite.eliteInfo ? call(() => M.elite.eliteInfo(v), null) : null;
    const [t0, n0] = nameTitle(v.name), key = (e && (SHORT[e.key] || e.key)) || SHORT[v.drop] || SHORT[v.key] || '';
    return { key, title: String((e && e.title) || t0).replace(/・$/, ''), name: (e && e.name) || n0, crest: (e && e.crest) || CREST[key] || v.type, n: (e && e.n) || 1 };
  },
  cast(v) {
    const e = M.elite && M.elite.cast ? call(() => M.elite.cast(v), null) : null; if (e) return e;
    const b = call(() => BA7.cast(v), null); if (b) return b;
    if (demo.cast && demo.cast.v === v) { const d = demo.cast, t = (performance.now() - d.t0) / 1000 % (d.dur + 0.8); return t <= d.dur ? { key: d.key, t, dur: d.dur, breakable: true } : null; }
    return null;
  },
  dragged() {
    const src = (M.elite && M.elite.dragged ? call(() => M.elite.dragged(), []) : []).concat(call(() => BA7.dragged(), []) || []);
    if (demo.drag) { const t = 2.5 - ((performance.now() - demo.drag) / 1000) % 2.5; src.push({ who: 'me', t, dur: 2.5 }); }
    return src.map(o => ({ who: o.who, self: o.who === 'me' || o.who === 'self', t: o.t, dur: o.dur || 2.5, tag: o.tag || tagOfPeer(o.who) }));
  },
  struggle() {
    const s = (M.elite && M.elite.struggle ? call(() => M.elite.struggle(), null) : null) || call(() => BA7.struggle(), null) || call(() => BA8.struggle(), null); if (!s) return null;      /* BA7 已含猩猩（EXT）；BA8＝鱷魚 */
    const v = typeof s.by === 'number' ? monById(s.by) : null, o = Object.assign({}, s, { by: v ? { name: v.name } : s.by });
    if (o.kind === 'latch' && !(o.need > 1)) o.need = 0;      /* 狗咬住：介面畫時間條（ui-e 要 need:0）；鱷魚咬住要連按（need > 1）照留 */
    if (!o.drag && demo.drag) o.drag = { t: 2.5 - ((performance.now() - demo.drag) / 1000) % 2.5, dur: 2.5 };
    return o;
  },
  bounties() {
    const out = [];
    for (const q of QUESTS) {
      const ob = (q.objectives || []).find(o => o.kind === 'elite' && /^e:trophy_/.test(o.target || '')); if (!ob && !q.bounty) continue;
      const b = q.bounty || {}, trophy = b.trophy || (ob ? ob.target.slice(2) : ''), g = NPCS[q.giver], st = call(() => qStatus(q), 'open');
      out.push({ q: q.id, name: q.name, giver: g ? g.name : '', lv: q.lv, area: b.area, trophy, crest: b.crest || BOUNTY_CREST[trophy], state: st === 'done' ? 'done' : st === 'active' || st === 'ready' ? 'active' : 'offer' });
    }
    return out;
  },
  targetedBy() {
    const src = (M.elite && M.elite.targetedBy ? call(() => M.elite.targetedBy(), []) : []).concat(call(() => BA7.targetedBy(), []) || []);
    if (demo.mark) { const vs = nearestShown(3); if (vs.length) vs.forEach((v, i) => src.push({ id: v.id, kind: demo.mark === 'all' ? ['bark', 'herd', 'charge'][i % 3] : demo.mark, x: v.x, z: v.z }));
      else ['bark', 'herd', 'charge'].forEach((k, i) => { if (demo.mark !== 'all' && i) return; const a = -0.9 + i * 0.9; src.push({ id: -1 - i, kind: demo.mark === 'all' ? k : demo.mark, x: me.x + Math.sin(a) * 18, z: me.z - Math.cos(a) * 18 }); }); }
    return src.map(o => { const v = monById(o.id); return { id: o.id, kind: o.kind, ang: o.ang != null ? o.ang : screenAng(o.x, o.z), d: o.d != null ? o.d : Math.hypot(o.x - me.x, o.z - me.z), tag: o.tag || (v && v.tag) || null }; });
  },

  /* ---------- 雨、獸徑（ui08w；ui-m 之後接） ---------- */
  weather: () => (M.wx && M.wx.weather ? call(() => M.wx.weather(), null) : null) || { rain: 0, flash: 0 },
  trails: () => (M.trail && M.trail.trails ? call(() => M.trail.trails(), []) : []),
  seenSegs: () => (M.trail && M.trail.seenSegs ? call(() => M.trail.seenSegs(), new Set()) : new Set()),
  copySegs: () => (M.trail && M.trail.copySegs ? call(() => M.trail.copySegs(), new Set()) : new Set()),

  /* ---------- 猴子偷走的東西（託管；ui08k） ---------- */
  custody: () => call(() => BA8.custody(), []) || [],
  claim: () => call(() => BA8.claim(), 0),
};

/* ============================== 測試指令（__dev07 才有；玩法給了就不蓋） ============================== */
function devCmds() {
  if (!dev()) return; const Dv = window.__dev08 = window.__dev08 || {};
  if (!Dv.castDemo) Dv.castDemo = (key = 'howl') => { if (demo.cast) H8.emit('beast:cast', { v: demo.cast.v, key: demo.cast.key, end: 'done', by: null }); if (!key) { demo.cast = null; return null; }
    const vs = nearestShown(8), v = vs.find(x => x.elite) || vs[0]; if (!v) return '附近沒有看得到名牌的野獸'; /* 有菁英先拿菁英（看名牌底下的施法條） */ demo.cast = { v, key, dur: key === 'rally' ? 1.2 : 2.5, t0: performance.now() }; H8.emit('beast:cast', { v, key, end: 'start', by: null }); return v.name; };
  if (!Dv.dragDemo) Dv.dragDemo = (on = true) => { demo.drag = on ? performance.now() : 0; return !!on; };
  if (!Dv.markDemo) Dv.markDemo = (kind = 'bark') => { demo.mark = kind || null; return demo.mark; };
  Dv.ui8 = { H: () => H, D, emit: H8.emit };
}

/* ============================== 各包之間的排法（只放跨包的；各包自己的樣式在各自的檔） ============================== */
/* 對決中報幕字幕 #h8call 移到 y96（對決血條下面），會壓到遊戲的 #toast（y104）：對決中 toast 往下移到 #h8call 下緣之後 */
const CSS8 = `body.duel8 #toast{top:142px}`;

/* ============================== 對 ui.js ============================== */
export function init(base) {
  if (started) return; started = true; B = base; H = makeH(base);
  if (!document.getElementById('u8css')) { const st = document.createElement('style'); st.id = 'u8css'; st.textContent = CSS8; document.head.appendChild(st); }
  globalThis.__ui8duel = true;      /* duel08 的暫代畫面（P6）停用：對決邀請、血條、倒數由 ui08h 畫 */
  globalThis.__ui8trial = true;     /* trial08 的暫代畫面與字幕（P3）停用：條件面板、報幕由 ui08h 畫、戰績簿由 ui08a 畫 */
  H8.on('init', devCmds); wirePreAny();
  Promise.all(OPT08.map(([k, f]) => opt(k, f))).then(() => { if (dev()) devCmds(); });
  for (const [nm, P] of [['ui08a', UA], ['ui08e', UE], ['ui08h', UH], ['ui08g', UG], ['ui08w', UW], ['ui08k', UK], ['welcome08', UWL]]) { try { P.init(H, D); } catch (e) { console.error('[ui08] ' + nm + ' init', e); } }
}
/* 0.8 X7（R6）：story08 的 preAny（其中任一個做完就能接；s09＝s08 或 m11）。game.js 的 qStatus 只看 q.pre.every(qDone)，
   這裡把有 preAny 的任務的 pre 換成一個 every 改成「任一個」的陣列（內容照舊，給列出前置的地方用），不用改 game.js。玩法要正式支援時把這段拿掉即可 */
function wirePreAny() { for (const q of QUESTS) { if (!Array.isArray(q.preAny) || !q.preAny.length || q.pre8) continue; const any = q.preAny.slice(), a = Array.isArray(q.pre) ? q.pre.slice() : any.slice(); Object.defineProperty(a, 'every', { value: f => any.some(id => f(id)), enumerable: false }); q.pre = a; q.pre8 = 1; } }
/* story08 NPC08.when 的條件（LORE08.needs）：trialsAll＝試煉全部過關 */
export function need8(k) { if (k === 'trialsAll') { const T = D.trials(); return T.length > 0 && T.every(x => x.cleared); } return false; }
let errN = 0;
export function tick(dt) { for (const f of ticks) { try { f(dt); } catch (e) { if (errN++ < 8) console.error('[ui08] tick', e); } } }
/* 巴索等 NPC 的對話選單要多加的選項：[文字, 動作] */
export function npcOptions(npcId) { return npcOpts[npcId] || []; }
export function dlgCard(card, q, done) { for (const f of cardHooks) { try { f(card, q, !!done); } catch (e) { console.error('[ui08] dlgCard', e); } } }
export function questDetail(box, q, status) { for (const f of detailHooks) { try { f(box, q, status); } catch (e) { console.error('[ui08] questDetail', e); } } }
/* 試煉／對決進行中：提示框（#tip）暫停倒數，結束後再出來（ui08h 用 CSS 把它藏起來） */
export function holdTip() { const c = document.body.classList; return c.contains('trial8') || c.contains('duel8'); }
export { D as D8 };
