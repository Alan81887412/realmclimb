// 0.8 的接點（玩法總監 d8-play）：事件匯流排、拉值的掛鉤、存檔掛鉤、以主控端為準的共同時鐘。
// 這個檔不匯入任何檔（game.js 與各個 0.8 模組都匯入它，不會循環）。規格見 /home/claude/team/d8-play/介面08.md。
// game.js 只做三件事：init(ctx) 交出遊戲狀態、frame(dt) 每幀呼叫、在固定的地方 emit 事件或呼叫 fn.* 掛鉤。
// 各模組（trial08、duel08、weather08、elite08、story08、beastai07…）：
//   import * as H8 from './hooks08.js';
//   H8.on('mon:kill', e => …)            聽事件（回傳取消函式）
//   H8.emit('beast:daze', { v, by })      發事件（事件鍵與內容照介面08.md）
//   H8.provide('senseK', w => 0.8)        提供掛鉤（一個名稱只有一個擁有者，見介面08.md）
//   H8.save8('t8', () => 存, d => 讀)      存檔（跟著 game.js 的 snapshot 的 x8 欄位）
//   H8.now()                               共同時鐘（秒；以主控端時鐘為準）

/* ---------- 事件 ---------- */
const L = new Map();
export function on(k, fn) { let a = L.get(k); if (!a) L.set(k, a = []); a.push(fn); return () => { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }
export function emit(k, d) { const a = L.get(k); if (!a || !a.length) return; for (const fn of a.slice()) { try { fn(d); } catch (e) { console.error('[hooks08] ' + k, e); } } }

/* ---------- 拉值的掛鉤（game.js 在熱路徑上呼叫，所以是單一函式、預設值不做事） ---------- */
const NONE = Object.freeze([]);
export const fn = {
  senseK: w => 1,                 // 野獸察覺距離倍率（weather08：雨天 0.8）
  interrupt: (w, hit, big) => undefined,   // 主控端：這一下算不算打斷預備（undefined＝照舊規則；true／false＝由掛鉤決定，含菁英與霸體）
  packSkip: s => false,           // 主控端：這隻不放進 hostPack 的活動名單（巡邏中、位置可以用共同時鐘算出來）
  farIdle: (w, dt) => {},         // 主控端：78 m 內沒有玩家而跳過模擬的閒置野獸（巡邏犬用它更新位置；一般野獸不做事）
  idleView: (v, dt) => false,     // 非主控端：閒置野獸的畫法（回傳 true＝已處理，game.js 就不做原本的原地閒晃）
  pvpOk: (a, b) => undefined,     // a 打得到 b 嗎（undefined＝照舊；duel08：沙地上對決中的兩人＝true）
  pvpFloor: r => 0,               // 被玩家 r 打中時生命最低留幾點（duel08：對決中＝1）
  lockables: () => NONE,          // 鎖定的額外候選（duel08：對決對手的 lock8 物件 { lock8: true, x, z, … }）
  lockAlive: v => false,          // lock8 物件現在還能不能鎖
  mod: k => 0,                    // 側向效果的合計（P7；鍵 'immob' 挑飛／擊倒／踉蹌的不能動時間縮短、'hold' 被纏／咬／拖住的時間縮短、'escape' 掙脫次數減少），用 capped() 取有上限的值
  noSafe: () => false,            /* 對決中回 true＝安全區回血不算（duel08） */
  eliteHost: (w, X) => undefined,  /* X4：主控端，菁英這一幀要不要由 elite08 處理（true＝處理完；其他＝照原本的流程） */
  lootExtra: v => NONE            // 自己擊殺時的必掉 [[道具代號, 數量], …]（P5：三隻新菁英；數量由數值的 bal08）
};
const OWN = {};
export function provide(name, f, who = '?') {
  if (!(name in fn)) { console.warn('[hooks08] 沒有這個掛鉤：' + name); return; }
  if (OWN[name] && OWN[name] !== who) console.warn(`[hooks08] 掛鉤 ${name} 已由 ${OWN[name]} 提供，被 ${who} 換掉`);
  OWN[name] = who; fn[name] = f;
}
// 設計定案 1-6 寫死的上限（數值 d8-bal 21:2x 決定：各事件各算、不合併）：immob ≤ 30%（挑飛、擊倒、踉蹌）、hold ≤ 30%（纏、咬、拖；和 immob 共用 0.30 這個值）、escape ≤ 40%（掙脫次數）。
// 數值的 data07.js CAPS07.immob／.escape 進主線後，P7 的模組在載入時 Object.assign(H8.CAPS, { immob: CAPS07.immob, hold: CAPS07.immob, escape: CAPS07.escape })，以數值的檔為準。
// 用法：不能動的時間 × (1 − capped('immob'))；被纏住的時間 × (1 − capped('hold'))（大蟒蛇「拖入坑底」2.5 秒倒數不乘）；掙脫次數 = Math.round(need × (1 − capped('escape')))（12→7）
export const CAPS = { immob: 0.3, hold: 0.3, escape: 0.4 };
export function capped(k) { const v = +fn.mod(k) || 0; return Math.max(0, Math.min(CAPS[k] ?? 1, v)); }

/* ---------- 招式編碼（X4 加寬；game.js 的 moveOf／startMove 與 elite08 用） ----------
   原本：低 6 位元＝招式編號＋1（1–63），64 狂暴、128 連段後續、256 後面還有招、512 撲空。0.8 已經用到編號 61（62 招）。
   加寬：編號 0–61 照舊（低 6 位元＝編號＋1，舊版完全一樣）；編號 62 起低 6 位元放 63（跳脫碼），真正的編號減 62 放在 1024 起的 8 個位元（2^10–2^17）。
   最多 62＋256＝318 招；編碼最大 262143（MVC_MAX）。舊版客戶端收到新招：它把值夾到 1023，低 6 位元 63 → 它的招式表沒有第 62 號 → 不顯示新招（不會當機；那一隻的動作停在上一招）。
   新版客戶端收到舊主機：舊主機的值都 < 1024，解出來和舊版一樣。 */
export const MVC_MAX = 262143;
export const MC = M => (M.i < 62 ? M.i + 1 : 63 | (((M.i - 62) & 255) << 10));
export const mvIdx = c => { const l = c & 63; return l < 63 ? l - 1 : 62 + ((c >> 10) & 255); };

/* ---------- 存檔 ---------- */
const SV = new Map(); let loaded = null;
export function save8(key, save, load) {
  SV.set(key, { save, load });
  if (loaded && key in loaded) { try { load(loaded[key]); } catch (e) { console.error('[hooks08] 讀檔 ' + key, e); } }
}
export function saveAll() {
  const o = loaded ? Object.assign({}, loaded) : {};      // 還沒載入的模組（或之後版本的欄位）原樣留著，不會被洗掉
  for (const [k, s] of SV) { try { const v = s.save(); if (v === undefined) delete o[k]; else o[k] = v; } catch (e) { console.error('[hooks08] 存檔 ' + k, e); } }
  return o;
}
export function loadAll(d) {
  loaded = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  for (const [k, s] of SV) { try { s.load(k in loaded ? loaded[k] : undefined); } catch (e) { console.error('[hooks08] 讀檔 ' + k, e); } }
}

/* ---------- 共同時鐘 ---------- */
// 主控端每 5 秒在 presence 放 tk＝自己的 Date.now()/100（整數，約 14 位元組）；其他人收到新值時算「主控端時間 − 本機時間」，
// 取最近 6 次的最大值（傳送延遲只會讓估計偏小），換主控端時平滑過去。主控端自己 off＝0。
export let ctx = null;
let off = 0, offT = 0, lastTk = null, tkSent = -1e9; const samp = [];
export function now() { return (Date.now() + off) / 1000; }
export function clockInfo() { return { off, samples: samp.slice(), host: !!(ctx && ctx.Net && ctx.Net.isHost) }; }
function syncClock() {
  if (!ctx || !ctx.Net) return; const t = Date.now();
  if (ctx.Net.isHost) { if (t - tkSent > 5000) { tkSent = t; ctx.netSet('tk', Math.round(t / 100)); } offT = 0; off += (0 - off) * 0.2; return; }
  let tk = null; for (const r of ctx.remotes.values()) { const p = r.lastPres; if (p && typeof p.ms === 'string' && typeof p.tk === 'number') { tk = p.tk; break; } }
  if (tk == null || tk === lastTk) { if (offT) off += (offT - off) * 0.1; return; }
  const s = tk * 100 - t; lastTk = tk;
  if (!samp.length || Math.abs(s - offT) > 3000) { samp.length = 0; samp.push(s); offT = s; off = s; return; }      // 第一次或換了主控端差很多：重來、直接跳過去
  samp.push(s); if (samp.length > 6) samp.shift(); offT = Math.max(...samp);
}

/* ---------- game.js 呼叫 ---------- */
export function init(c) { ctx = c; emit('init', c); }
export function frame(dt) { syncClock(); emit('frame', dt); }
