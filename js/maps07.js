// 0.7 地圖（w7-map）：個人地圖多記採集片、營火、陷阱；手繪地圖（芬恩的繪圖桌、只畫得出自己走過的、送圖、收到的抄本畫成褐墨）；f02／f04 的判定；測繪費；天賦球「測繪」
// 規格：設計定案第 1 節、附錄 D。存檔欄位放在存檔的 m7（save／load），舊存檔沒有 m7 就全部當成空的。
// 這個檔只在函式裡用 game.js 的東西（game.js 會靜態匯入這個檔，模組最上層碰 game.js 的變數會撞到循環匯入）。
import * as THREE from './three.bundle.js';
import { WORLD, ITEMS, ZONES, zoneAt, clamp, TAU, G1, edgeAt } from './core.js';
import { mapRGB, blockedAt, W, Hgt } from './world.js';
import { GATHER_SITES, CAMPS } from './places06.js';
import { SHOP, SERVICES } from './data06.js';
import { P, me, Net, Store, remotes, npcs, ui, input, debug, inCombat, buy, netSet, qStatus, QUESTS, addItem } from './game.js';
import { keyOf } from './keys.js';

/* ============================== 數值（第一版，試玩後再調） ============================== */
export const MAP7 = {
  seenR: 25,            // 經過採集片、營火多近就記下（公尺）
  surveyK: 1.5,         // 天賦球「測繪」：記錄範圍 ×1.5
  tableR: 3.0,          // 繪圖桌幾公尺內能畫
  drawT: { one: 3, all: 10 },       // 畫一區、整層幾秒（測繪：0 秒）
  minPct: 0.10,         // 一區自己走過不到一成不能畫
  fullPct: 0.90,        // 測繪費、f04：一區自己走過九成
  fee: { lv: { meadow: [2], bend: [4], forest: [4, 5], oldwood: [6, 7], canyon: [7, 8], quarry: [9, 10], lair: [11, 12], wings: [12, 13], /* 0.8 X7：新地 13 區照各區建議等級（取中間；G1 到 20 級由數值補表，沒補時 G1 停在 15 級） */ southlake: [4], edgewood: [6], giantwood: [8], marshwood: [10], floodpen: [13], backhill: [14], orecliff: [13], saltflat: [11], redslope: [7], frostwood: [17], northrim: [16, 17], gatehigh: [19], oldroad: [20] }, mins: 5, step: 10 },      // 測繪費（數值定案07）：一區走滿九成，芬恩付約「mins 分鐘的同級打獵收入」＝該區對應等級（半級＝前後兩級平均）的 G1 × mins，取整到 step 金；算法見 feeOf
  maxMaps: 5,           // 手繪地圖最多帶幾張
  accMax: 50,           // 記住最近收過的幾個 uid（不重複併入）
  giftR: 8, giftT: 30, goneT: 3, lostT: 15,  // 送圖：幾公尺內、對方幾秒沒回就算了
  warnZ: 0              // （保留）
};
export const AREAS = ['meadow', 'forest', 'canyon', 'lair', 'bend', 'oldwood', 'quarry', 'wings', /* 0.8 X7：A 圈九區＋北境四塊（接在後面，舊的順序不動） */ 'southlake', 'edgewood', 'giantwood', 'marshwood', 'floodpen', 'backhill', 'orecliff', 'saltflat', 'redslope', 'frostwood', 'northrim', 'gatehigh', 'oldroad'];      // 八個子區域（鐵環城不算，測繪費照 feeOf 算）
export const feeOf = a => { const l = MAP7.fee.lv[a] || [2], g = Math.round(l.reduce((s, x) => s + G1(x), 0) / l.length); return Math.round(g * MAP7.fee.mins / MAP7.fee.step) * MAP7.fee.step; };      // 8 區＝150／300／350／530／580／640／690／720
export const deco = {};      // d7-ui-m（ui07m.js）掛進來的介面函式：renderDraw／renderMaps／drawBar／showPrompt／inkRoads／roadFlat
const INNER = new Set(['meadow', 'forest', 'canyon', 'lair']);
const AREA_ALL = 'all';
export const areaName = a => (a === AREA_ALL ? '第一層全圖' : (ZONES[a] && ZONES[a].name) || a);
export const ringOf = a => (INNER.has(a) ? 'in' : ZONES[a] && ZONES[a].ring === 'N' ? 'N' : ZONES[a] && ZONES[a].ring === 'A' ? 'A' : 'out');      /* 0.8 X7：內圈／外環／A 圈（新地）／北境 */

/* ============================== 物品、商店、芬恩的選項 ==============================
   物品（map_blank、map_big、map_drawn、orb_survey）用 data07.js 的定義，這裡不另外新增；售價由 data07.js-patch.py 補上（20、120 金）。
   手繪地圖不放進背包的 P.inv（每張內容不同），存在 m7.mp；背包裡用「手繪地圖 n/5」按鈕打開清單。 */
export const SHOP07_MAP = { merchant: ['map_blank', 'map_big'] };
// 第一幀才上架（data07.js 的物品與售價那時一定已經載入）；沒有售價的不上架，免得商店顯示「undefined 金」
function shopInit() { for (const k in SHOP07_MAP) { if (!SHOP[k]) SHOP[k] = []; for (const id of SHOP07_MAP[k]) if (ITEMS[id] && ITEMS[id].buy && !SHOP[k].includes(id)) SHOP[k].push(id); } }
export const SERVICES07_MAP = { surveyor: [['draw7', '繪圖桌（畫地圖、買空白地圖、測繪費）']] };
for (const k in SERVICES07_MAP) { if (!SERVICES[k]) SERVICES[k] = []; for (const s of SERVICES07_MAP[k]) if (!SERVICES[k].some(o => o[0] === s[0])) SERVICES[k].push(s); }

/* ============================== 格網 ============================== */
const FN = WORLD.FOG, CN = FN >> 1, FS = WORLD.FOG_SIZE, FC = FS / FN, CC = FS / CN;      // 細格 130×130（約 5.8 公尺，P.explored）；粗格 65×65（約 11.7 公尺，抄本）
const fIdx = (x, z) => { const gx = Math.floor((x + FS / 2) / FC), gz = Math.floor((z + FS / 2) / FC); return gx < 0 || gz < 0 || gx >= FN || gz >= FN ? -1 : gz * FN + gx; };
const cIdx = (x, z) => { const gx = Math.floor((x + FS / 2) / CC), gz = Math.floor((z + FS / 2) / CC); return gx < 0 || gz < 0 || gx >= CN || gz >= CN ? -1 : gz * CN + gx; };
const f2c = i => ((((i / FN) | 0) >> 1) * CN + ((i % FN) >> 1));
let G = null;      // { fz 細格的區域編號（-1＝城內或界外）, reach 細格走得到附近, cz 粗格的區域編號, tot[a] 每區算進比例的細格數 }
function grid() {
  if (G) return G;
  const fz = new Int8Array(FN * FN).fill(-1), walk = new Uint8Array(FN * FN), reach = new Uint8Array(FN * FN), cz = new Int8Array(CN * CN).fill(-1), tot = new Array(AREAS.length).fill(0), cen = i => [((i % FN) + 0.5) * FC - FS / 2, (((i / FN) | 0) + 0.5) * FC - FS / 2];
  const isNew = new Uint8Array(FN * FN), walkOk = (x, z) => { let ok = 0; for (const [dx, dz] of [[0, 0], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) if (!blockedAt(x + dx, z + dz)) ok++; return ok >= 2 ? 1 : 0; };
  for (let i = 0; i < FN * FN; i++) { const [x, z] = cen(i), r = Math.hypot(x, z); if (r > WORLD.R - 6) { /* 0.8 X7：新地 13 區照 edgeAt（可走邊界）與 zoneAt；舊八區的格照舊（下一段的 reach 也分開算），舊存檔的比例不變 */ const e = edgeAt(x, z); if (e < -3) continue; const k = AREAS.indexOf(zoneAt(x, z, true)); if (k < 8) continue; fz[i] = k; isNew[i] = 1; if (e > 1) walk[i] = walkOk(x, z); continue; } const zn = zoneAt(x, z, true); fz[i] = AREAS.indexOf(zn); if (r < WORLD.R - 10) walk[i] = walkOk(x, z); }
  // 走得到的格附近 6 格（揭開半徑約 7 格）：算比例只算這些，四面高牆、獸欄裡面、邊界外面不會讓「走過九成」變成不可能
  const reachN = new Uint8Array(FN * FN); const R2 = 36; for (let z = 0; z < FN; z++) for (let x = 0; x < FN; x++) { if (!walk[z * FN + x]) continue; const nw = isNew[z * FN + x]; for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { if (dx * dx + dz * dz > R2) continue; const X = x + dx, Z = z + dz; if (X >= 0 && Z >= 0 && X < FN && Z < FN) { reachN[Z * FN + X] = 1; if (!nw) reach[Z * FN + X] = 1; } } }
  for (let i = 0; i < FN * FN; i++) if (isNew[i]) reach[i] = reachN[i];      /* 舊區的格只認舊世界走得到的格（新地開了以後舊區的「九成」不會變難） */
  for (let i = 0; i < FN * FN; i++) if (fz[i] >= 0 && reach[i]) tot[fz[i]]++;
  for (let i = 0; i < CN * CN; i++) { const x = ((i % CN) + 0.5) * CC - FS / 2, z = (((i / CN) | 0) + 0.5) * CC - FS / 2; if (Math.hypot(x, z) > WORLD.R - 4) { const k = edgeAt(x, z) > -8 ? AREAS.indexOf(zoneAt(x, z, true)) : -1; if (k >= 8) cz[i] = k; continue; } cz[i] = AREAS.indexOf(zoneAt(x, z, true)); }
  return G = { fz, reach, cz, tot };
}

/* ============================== 狀態（存檔的 m7） ============================== */
const S = {
  copy: new Uint8Array(CN * CN),      // P.copy：收到的抄本的聯集（粗格）
  cpSrc: {},                          // 每一區最後一張抄本的來源 { 區域: { by, at } }
  cpPatch: new Set(), cpCamp: new Set(), cpTrap: new Set(),      // 抄本帶來的採集片、營火、陷阱（和自己的分開，畫成褐色）
  seenPatch: new Set(), seenCamp: new Set(),                       // 自己經過的採集片、營火（25 公尺內）
  trapSeen: new Set(), trapGone: new Set(),                        // 自己找到的陷阱；對自己已經沒了的陷阱
  maps: [],                           // P.maps：手繪地圖（最多 5 張）
  acc: [],                            // P.mapAcc：收過的手繪地圖 uid（最近 50 個）
  fee: new Set(),                     // 已經領過測繪費的區
  f02g: 0                             // f02 進行中芬恩先給的那張練習用空白地圖（只給一次）
};
const D7 = { ink: true, pct: null, pctT: 0, seenT: 0, draw: null, gift: null, inbox: [], prompt: null, acks: [], nos: [], egx: -1, egz: -999, warnLv: 0, traps: [], table: null, built: false, tip: null };
const SIGN = () => GATHER_SITES.length;      // 採集片的版本（數量）：手繪地圖裡採集片用編號存，數量不同的版本之間不互通

// 位元陣列 ↔ base64
const packBits = a => { let s = ''; for (let i = 0; i < a.length; i += 8) { let b = 0; for (let k = 0; k < 8 && i + k < a.length; k++) if (a[i + k]) b |= 1 << k; s += String.fromCharCode(b); } return btoa(s); };
const unpackBits = (s, n) => { const a = new Uint8Array(n); try { const b = atob(s || ''); for (let i = 0; i < b.length && i * 8 < n; i++) { const c = b.charCodeAt(i); for (let k = 0; k < 8 && i * 8 + k < n; k++) a[i * 8 + k] = (c >> k) & 1; } } catch (e) {} return a; };
// 粗格的游程編碼：0 的一段、1 的一段……交替，每段長度用 7 位元一組的變長整數，最後 base64
export function rleEnc(a) { const out = []; let cur = 0, run = 0; const put = n => { while (n >= 128) { out.push((n & 127) | 128); n >>= 7; } out.push(n); }; for (let i = 0; i < a.length; i++) { if (a[i] === cur) run++; else { put(run); cur = a[i]; run = 1; } } put(run); let s = ''; for (const b of out) s += String.fromCharCode(b); return btoa(s); }
/* 0.8（X0a）：舊的粗格（0.6／0.7 的 65×65）搬到新格網（105×105）的正中央。cellsOf：照新長度解，解不出來再照舊長度解並搬到正中央 */
const CN06 = WORLD.FOG06 >> 1, CO06 = (CN - CN06) / 2;
const cUp = a => { if (!a) return null; const o = new Uint8Array(CN * CN); for (let z = 0; z < CN06; z++) for (let x = 0; x < CN06; x++) o[(z + CO06) * CN + x + CO06] = a[z * CN06 + x]; return o; };
export const cellsOf = s => rleDec(s, CN * CN) || cUp(rleDec(s, CN06 * CN06));
const mapUp = m => { if (rleDec(m.cells, CN * CN)) return m; const c = cellsOf(m.cells); return c ? Object.assign({}, m, { cells: rleEnc(c) }) : m; };      /* 舊格式的手繪地圖換成新格式 */
export function rleDec(s, n) { const a = new Uint8Array(n); let b; try { b = atob(s || ''); } catch (e) { return null; } let i = 0, p = 0, cur = 0; while (p < b.length) { let v = 0, sh = 0, c; do { c = b.charCodeAt(p++); v |= (c & 127) << sh; sh += 7; } while (c & 128 && p < b.length && sh < 28); if (i + v > n) return null; if (cur) a.fill(1, i, i + v); i += v; cur ^= 1; } return i === n ? a : null; }
const setArr = s => [...s].map(String).slice(0, 400);
const strSet = (a, max = 400) => new Set(Array.isArray(a) ? a.filter(v => (typeof v === 'string' || typeof v === 'number') && String(v).length < 24).map(String).slice(0, max) : []);

export function save() {
  const o = {};
  if (S.copy.some(v => v)) o.cp = rleEnc(S.copy);
  if (Object.keys(S.cpSrc).length) o.cs = S.cpSrc;
  if (S.cpPatch.size) o.pp = setArr(S.cpPatch); if (S.cpCamp.size) o.pc = setArr(S.cpCamp); if (S.cpTrap.size) o.pt = setArr(S.cpTrap);
  if (S.seenPatch.size) o.sp = setArr(S.seenPatch); if (S.seenCamp.size) o.sc = setArr(S.seenCamp);
  if (S.trapSeen.size) o.ts = setArr(S.trapSeen); if (S.trapGone.size) o.tg = setArr(S.trapGone);
  if (S.maps.length) o.mp = S.maps.slice(0, MAP7.maxMaps); if (S.acc.length) o.ac = S.acc.slice(-MAP7.accMax);
  if (S.fee.size) o.fe = setArr(S.fee); if (S.f02g) o.fg = 1; if (P.pas && P.pas.survey) o.sv = 1;
  return o;
}
export function load(Pp, d) {
  d = d && typeof d === 'object' ? d : {};
  S.copy = (typeof d.cp === 'string' && cellsOf(d.cp)) || new Uint8Array(CN * CN);      /* 0.8：舊存檔的 65×65 抄本搬到正中央 */
  S.cpSrc = {}; if (d.cs && typeof d.cs === 'object') for (const a of AREAS) { const v = d.cs[a]; if (v && typeof v.by === 'string') S.cpSrc[a] = { by: v.by.slice(0, 14), at: +v.at || 0 }; }
  S.cpPatch = strSet(d.pp); S.cpCamp = strSet(d.pc); S.cpTrap = strSet(d.pt); S.seenPatch = strSet(d.sp); S.seenCamp = strSet(d.sc); S.trapSeen = strSet(d.ts); S.trapGone = strSet(d.tg);
  S.maps = Array.isArray(d.mp) ? d.mp.filter(okMap).map(mapUp).slice(0, MAP7.maxMaps) : [];      /* 0.8：舊格式的手繪地圖換成新格式 */ S.acc = Array.isArray(d.ac) ? d.ac.filter(u => typeof u === 'string' && u.length < 24).slice(-MAP7.accMax) : [];
  S.fee = strSet(d.fe); S.f02g = d.fg ? 1 : 0; if (Pp && Pp.pas) Pp.pas.survey = d.sv ? 1 : 0;
  D7.ink = true; D7.pct = null; D7.draw = null; if (me) me.exploredDirty = true;
}
const okMap = m => m && typeof m === 'object' && typeof m.uid === 'string' && m.uid.length < 24 && typeof m.cells === 'string' && m.cells.length < 3000 && (m.area === AREA_ALL || AREAS.includes(m.area)) && typeof m.by === 'string';

/* ============================== 探索比例 ============================== */
// 每一區自己走過（P.explored）的比例；抄本不算
export function pcts() {
  const now = performance.now(); if (D7.pct && now - D7.pctT < 700) return D7.pct;
  const g = grid(), have = new Array(AREAS.length).fill(0), ex = P.explored; for (let i = 0; i < FN * FN; i++) { const a = g.fz[i]; if (a >= 0 && g.reach[i] && ex[i]) have[a]++; }
  const o = {}; let h = 0, t = 0; AREAS.forEach((a, k) => { o[a] = g.tot[k] ? Math.min(1, have[k] / g.tot[k]) : 0; h += have[k]; t += g.tot[k]; }); o[AREA_ALL] = t ? h / t : 0;
  D7.pct = o; D7.pctT = now; return o;
}
export const pct = a => (a === 'any' ? Math.max(...AREAS.map(z => pcts()[z])) : pcts()[a] || 0);
// 任務的 unlock.explore：['meadow', 0.3]＝風吹草原自己走過三成；['any', 0.9]＝任一區九成（game.js 的 unlocked 會呼叫）
export function unlockOk(e) { if (!Array.isArray(e)) return true; return pct(e[0]) >= (+e[1] || 0); }
export const survey = () => !!(P.pas && P.pas.survey);

/* ============================== 陷阱（w7-wild 的 traps07.js 呼叫） ============================== */
// 陷阱的編號用 places07.js 的 TRAPS[i].id（沒有 id 就用陣列順序）；教學用的夾子也一樣
const tk = id => String(id != null && typeof id === 'object' ? (id.id != null ? id.id : id.i) : id);
export function trapSeen(id) { const k = tk(id); if (S.trapSeen.has(k)) return false; S.trapSeen.add(k); Store.dirty = true; return true; }
export function trapGone(id) { const k = tk(id); if (S.trapGone.has(k)) return false; S.trapGone.add(k); Store.dirty = true; return true; }
export const trapIsSeen = id => S.trapSeen.has(tk(id)) || S.cpTrap.has(tk(id));
export const trapIsGone = id => S.trapGone.has(tk(id));
// 陷阱的位置（畫地圖上的 ✕ 用）：[{ id, x, z, kind:'jaw'|'bell' }]。traps07.js 或 places07.js 給；沒有就沒有
// 0.7 合併（製作人）：陷阱的「找到過／沒了」由 traps07 記在 P.trapSeen／P.trapGone（存檔 tr7）；這裡每 30 幀同步一次到地圖自己的紀錄，地圖才畫得出 ✕（教學夾子不畫）
let syncN = 0;
export function syncTraps(listFn) { if (typeof listFn !== 'function' || (syncN++ % 30)) return; let list; try { list = listFn(); } catch (e) { return; } if (!Array.isArray(list)) return; const real = list.filter(t => !t.tutor);
  if (D7.traps.length !== real.length) setTraps(real.map(t => ({ id: t.i, x: t.x, z: t.z, kind: t.k })));
  for (const t of real) { if (t.seen) trapSeen(t.i); if (t.gone) trapGone(t.i); } }
export function setTraps(list) { D7.traps = Array.isArray(list) ? list.map((t, i) => ({ id: tk(t.id != null ? t.id : i), x: +t.x || 0, z: +t.z || 0, kind: t.kind || t.type || 'jaw' })) : []; }

/* ============================== 繪圖桌的位置（w7-wild 的 places07.js 給 DRAW_TABLE；沒有就放在芬恩旁邊） ============================== */
const TABLE0 = { x: 19.1, z: 14.7, f: -2.31 };
const table = () => D7.table || TABLE0;
import('./places07.js').then(m => { if (!m) return; const t = m.DRAW_TABLE07 || m.DRAW_TABLE || m.DRAWTABLE || (m.PLACES07 && m.PLACES07.draw_table); if (t && isFinite(t.x) && isFinite(t.z)) D7.table = { x: +t.x, z: +t.z, f: +t.f || 0, model: !!t.model }; if (Array.isArray(m.TRAPS) && !D7.traps.length) setTraps(m.TRAPS); }).catch(() => {});

/* ============================== 手繪地圖：畫 ============================== */
// 一張圖：{ uid, by, bs, at, area, pct, cells, pv, patches, camps, traps }
//   cells：65×65 粗格中屬於那一區（整層＝走過一成以上的區）的格，對應的 2×2 細格裡有一格在 P.explored 就算（不看抄本：收到的畫不出來）；游程編碼後 base64
//   patches：自己經過的採集片（GATHER_SITES 的編號，位元）＋ pv 採集片數量；camps：營火 id；traps：自己找到的陷阱 id（含自己已經拆掉的：對收的人來說還在）
function inArea(a, list) { return a >= 0 && list.includes(AREAS[a]); }
export function makeMap(area) {
  const g = grid(), pc = pcts(), list = area === AREA_ALL ? AREAS.filter(a => pc[a] >= MAP7.minPct) : [area]; if (!list.length) return null;
  const cells = new Uint8Array(CN * CN), ex = P.explored; let any = 0;
  for (let cz = 0; cz < CN; cz++) for (let cx = 0; cx < CN; cx++) { const c = cz * CN + cx; if (!inArea(g.cz[c], list)) continue; const f = cz * 2 * FN + cx * 2; if (ex[f] || ex[f + 1] || ex[f + FN] || ex[f + FN + 1]) { cells[c] = 1; any = 1; } }
  if (!any) return null;
  const inList = (x, z) => { const c = cIdx(x, z); return c >= 0 && inArea(g.cz[c], list); };
  const pBits = new Uint8Array(SIGN()); GATHER_SITES.forEach((s, i) => { if (S.seenPatch.has(s.id) && inList(s.x, s.z)) pBits[i] = 1; });
  const camps = CAMPS.filter(c => S.seenCamp.has(c.id) && inList(c.x, c.z)).map(c => c.id);
  const traps = [...S.trapSeen].filter(id => { const t = D7.traps.find(o => o.id === id); return !t || inList(t.x, t.z); }).slice(0, 80);
  return { uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), by: String(P.name || '旅人').slice(0, 12), bs: P.serial != null ? +P.serial : null, at: Date.now(), area, pct: Math.round((area === AREA_ALL ? pc[AREA_ALL] : pc[area]) * 100), cells: rleEnc(cells), pv: SIGN(), patches: packBits(pBits), camps, traps };
}
export const mapBytes = m => new TextEncoder().encode(JSON.stringify(m)).length;
// 畫圖的條件：完成 f02（或 f02 進行中：芬恩正在教）；在繪圖桌 3 公尺內；那一區自己走過一成；有對應的空白地圖；手繪地圖還帶得下
const qx = id => QUESTS.some(q => q.id === id);
const f02State = () => (qx('f02') ? qStatus('f02') : 'none');
export function canDrawAt() { const s = f02State(); return s === 'none' || s === 'done' || s === 'active' || s === 'ready'; }
export const nearTable = (r = MAP7.tableR) => { const t = table(); return Math.hypot(me.x - t.x, me.z - t.z) < r; };
export function drawCheck(area) {
  if (!canDrawAt()) return '芬恩還沒教你畫地圖（先接他的小任務「第一張圖」）。';
  if (!nearTable(MAP7.tableR + 3)) return '要在芬恩的繪圖桌旁邊才能畫（要桌子、墨和光）。';
  if (S.maps.length >= MAP7.maxMaps) return `手繪地圖最多帶 ${MAP7.maxMaps} 張。先送掉或撕掉一張。`;
  const pc = pcts();
  if (area === AREA_ALL) { if (!(P.inv.map_big > 0)) return '沒有大張空白地圖（120 金，米洛或芬恩有賣）。'; if (!AREAS.some(a => pc[a] >= MAP7.minPct)) return '沒有一區自己走過一成以上。'; return ''; }
  if (!(P.inv.map_blank > 0)) return '沒有空白地圖（20 金，米洛或芬恩有賣）。';
  if (pc[area] < MAP7.minPct) return '沒去過的地方，我畫不出來。那一區自己走過不到一成。';
  return '';
}
export function startDraw(area, n = 1) {
  const why = drawCheck(area); if (why) { ui.toast(why); ui.sfx('deny'); return false; }
  const dur = survey() ? 0 : area === AREA_ALL ? MAP7.drawT.all : MAP7.drawT.one;
  D7.draw = { area, n: Math.max(1, n | 0), done: 0, t: 0, dur, hp: me.hp, lc: me.lastCombat }; ui.sfx('page', 0, { tag: 'draw' }); renderDraw(); return true;
}
function finishOne() {
  const d = D7.draw, why = drawCheck(d.area); if (why) { ui.toast(why); D7.draw = null; renderDraw(); return; }
  const m = makeMap(d.area); if (!m) { ui.toast('這一區你還沒走過，畫不出來。'); D7.draw = null; return; }
  const it = d.area === AREA_ALL ? 'map_big' : 'map_blank'; P.inv[it]--; if (P.inv[it] <= 0) delete P.inv[it];
  S.maps.push(m); Store.dirty = true; ui.dirty = true; d.done++;
  ui.loot(`畫好了一張手繪地圖《${areaName(m.area)}》（畫了 ${m.pct}%）`); ui.sfx('craft');
  const qa = debug.questAct; if (qa) { qa('doDraw'); qa('doDraw:' + m.area); if (m.area === AREA_ALL) for (const a of AREAS) if (pcts()[a] >= MAP7.minPct) qa('doDraw:' + a); }
  if (d.done >= d.n || drawCheck(d.area)) D7.draw = null; else d.t = 0;
  renderDraw(); renderMaps();
}
function drawTick(dt) {
  const d = D7.draw; if (!d) return;
  if (!nearTable(MAP7.tableR + 3) || !me.alive || me.lastCombat !== d.lc) { D7.draw = null; ui.toast('畫圖中斷了。'); renderDraw(); return; }
  d.t += dt; if ((d.sk = (d.sk ?? 1.2) - dt) <= 0) { d.sk = 1 + Math.random() * 0.5; ui.sfx('page', 0, { tag: 'draw' }); } if (d.t >= d.dur) finishOne(); else if (drawOpen()) drawBar();
}

/* ============================== 手繪地圖：收到之後併進自己的地圖 ============================== */
export function mergeMap(m) {
  if (!okMap(m)) return 'bad'; if (S.acc.includes(m.uid)) return 'dup';
  const cells = cellsOf(m.cells); if (!cells) return 'bad';      /* 0.8：收到舊格式的也照樣併 */
  const g = grid(), zs = new Set(); for (let i = 0; i < CN * CN; i++) if (cells[i]) { S.copy[i] = 1; if (g.cz[i] >= 0) zs.add(AREAS[g.cz[i]]); }
  const src = { by: String(m.by).slice(0, 14), at: +m.at || Date.now() }; for (const a of zs) { const o = S.cpSrc[a]; if (!o || o.at <= src.at) S.cpSrc[a] = src; }      // 重疊的以最新那張為準
  if (m.pv === SIGN() && typeof m.patches === 'string') { const b = unpackBits(m.patches, SIGN()); GATHER_SITES.forEach((s, i) => { if (b[i]) S.cpPatch.add(s.id); }); }
  if (Array.isArray(m.camps)) for (const c of m.camps) if (CAMPS.some(o => o.id === c)) S.cpCamp.add(String(c));
  if (Array.isArray(m.traps)) for (const t of m.traps.slice(0, 80)) if (typeof t === 'string' || typeof t === 'number') S.cpTrap.add(String(t));
  S.acc.push(m.uid); if (S.acc.length > MAP7.accMax) S.acc.splice(0, S.acc.length - MAP7.accMax);
  D7.ink = true; me.exploredDirty = true; Store.dirty = true; return 'ok';
}

/* ============================== 送圖（即時狀態，設計成「狀態」：mg 掛著直到收到回覆或 30 秒） ==============================
   送的人 mg = { to: 對方 peer, uid, d: 地圖 }；收的人收下 → mk = [uid…]（每個掛 30 秒），拒收或在戰鬥中 → mn = [[uid, 原因]…]
   送的人看到 mk 有這個 uid → 那張圖用掉；看到 mn 或逾時 → 圖留著。對方斷線（presence 消失）→ 收的人的確認框自己關掉 */
export function giftTargets() { const out = []; for (const r of remotes.values()) { if (r.away || !r.lastPres) continue; const d = Math.hypot(r.x - me.x, r.z - me.z); if (d < MAP7.giftR) out.push({ peer: r.peer, name: r.name || '旅人', d }); } return out.sort((a, b) => a.d - b.d); }
export function giveMap(uid, peer) {
  const m = S.maps.find(o => o.uid === uid), r = remotes.get(peer);
  if (!m) return false; if (D7.gift) { ui.toast('一次只能送一張，等對方回覆。'); return false; }
  if (!Net.room || !Net.selfPeer) { ui.toast('目前是單人模式，沒有人可以送。'); return false; }
  if (!r || r.away || Math.hypot(r.x - me.x, r.z - me.z) >= MAP7.giftR) { ui.toast(`要走到對方 ${MAP7.giftR} 公尺內才能送。`); return false; }
  if (inCombat() || me.combat) { ui.toast('戰鬥中不能送地圖。'); return false; }
  const parts = mapParts(JSON.stringify(m)); D7.gift = { uid, peer, name: r.name || '旅人', t: 0, title: areaName(m.area), parts: parts.length > 1 ? parts : null, pi: 0, pt: 0 }; netSet('mg', parts.length > 1 ? { to: peer, uid, n: parts.length, i: 0, s: parts[0] } : { to: peer, uid, d: m }, true);      /* X12：大張的分段送 */
  ui.toast(`把《${areaName(m.area)}》遞給 ${D7.gift.name}，等對方回覆…`); ui.sfx('page'); renderMaps(); return true;
}
const hidTab = r => !!(r && r.lastPres && r.lastPres.r === 0);      // 對方切到別的分頁或縮小視窗（presence 的 r＝0，game.js 一直留著這個人）：不是斷線
/* X12：分段（每段 UTF-8 不超過 MG_PART 位元組）與收段（D7.parts：peer:uid → { n, s[], t }，60 秒沒湊齊就丟掉） */
const MG_PART = 700;
function mapParts(js) { const out = []; let cur = '', b = 0; for (const ch of js) { const c = ch.codePointAt(0), n = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; if (b + n > MG_PART && cur) { out.push(cur); cur = ''; b = 0; } cur += ch; b += n; } if (cur || !out.length) out.push(cur); return out; }
function joinPart(peer, mg, now) { const P8 = D7.parts || (D7.parts = new Map()); for (const [k, e] of P8) if (now - e.t > 60000) P8.delete(k); const n = mg.n | 0; if (n < 2 || n > 24 || !(mg.i >= 0 && mg.i < n) || typeof mg.s !== 'string') return undefined; const key = peer + ':' + mg.uid; let e = P8.get(key); if (!e || e.n !== n) { e = { n, s: [], t: now }; P8.set(key, e); } e.s[mg.i | 0] = mg.s; for (let i = 0; i < n; i++) if (typeof e.s[i] !== 'string') return undefined; P8.delete(key); try { return JSON.parse(e.s.join('')); } catch (err) { return null; } }
export function cancelGift(msg) { if (!D7.gift) return; if (msg) ui.toast(msg); D7.gift = null; netSet('mg', null, true); renderMaps(); }
function giftTick(dt) {
  const now = Date.now(); D7.acks = D7.acks.filter(a => now - a[1] < MAP7.giftT * 1000); D7.nos = D7.nos.filter(a => now - a[2] < MAP7.giftT * 1000);
  netSet('mk', D7.acks.length ? D7.acks.map(a => a[0]) : null); netSet('mn', D7.nos.length ? D7.nos.map(a => [a[0], a[1]]) : null);
  // 送出去的：等回覆
  const g = D7.gift; if (g) {
    if (g.parts && (g.pt += dt) >= 0.5) { g.pt = 0; g.pi = (g.pi + 1) % g.parts.length; netSet('mg', { to: g.peer, uid: g.uid, n: g.parts.length, i: g.pi, s: g.parts[g.pi] }, true); }      /* X12：輪流掛下一段 */
    g.t += dt; const r = remotes.get(g.peer), p = r && r.lastPres;
    if (p && Array.isArray(p.mk) && p.mk.includes(g.uid)) { const i = S.maps.findIndex(o => o.uid === g.uid); if (i >= 0) S.maps.splice(i, 1); Store.dirty = true; ui.loot(`${g.name} 收下了手繪地圖《${g.title}》`); ui.sfx('quest', 'accept'); const qa = debug.questAct; if (qa) qa('doGiveMap'); D7.gift = null; netSet('mg', null, true); renderMaps(); }
    else if (p && Array.isArray(p.mn) && p.mn.some(o => Array.isArray(o) && o[0] === g.uid)) { const o = p.mn.find(o => o[0] === g.uid); cancelGift(o[1] === 'combat' ? `${g.name} 正在戰鬥中，地圖留在你身上。` : o[1] === 'full' ? `${g.name} 收不下了。` : `${g.name} 沒有收下，地圖留在你身上。`); }
    else if (!r) { g.gone = (g.gone || 0) + dt; if (g.gone > MAP7.goneT) cancelGift(`${g.name} 離開了，地圖留在你身上。`); }      // 對方已經不在房間裡
    else if (r.away && !hidTab(r)) { g.gone = (g.gone || 0) + dt; if (g.gone > MAP7.lostT) cancelGift(`${g.name} 斷線了，地圖留在你身上。`); }      // 收不到對方的更新：和 game.js 一樣 15 秒才當成斷線
    else if (g.t > MAP7.giftT * (g.hid ? 2 : 1)) cancelGift(`${g.name} 沒有回覆，地圖留在你身上。`);
    else { g.gone = 0; if (r.away && !g.hid) { g.hid = true; ui.toast(`${g.name} 暫時不在畫面前（切到別的分頁），等他回來…`); } }      // 切到別的分頁不算斷線：回覆時限放寬到兩倍
  }
  // 別人送來的：mg.to 是自己 → 排隊跳確認框
  if (Net.selfPeer) for (const r of remotes.values()) { const p = r.lastPres, mg = p && p.mg; if (!mg || mg.to !== Net.selfPeer || typeof mg.uid !== 'string') continue;
    if (D7.acks.some(a => a[0] === mg.uid) || D7.nos.some(a => a[0] === mg.uid) || D7.inbox.some(o => o.uid === mg.uid) || (D7.prompt && D7.prompt.uid === mg.uid)) continue;
    if (S.acc.includes(mg.uid)) { D7.acks.push([mg.uid, now]); continue; }      // 收過了（上次的回覆遺失）：直接回「收下」，不再併
    let md = mg.d; if (md === undefined && mg.n > 1) { md = joinPart(r.peer, mg, now); if (md === undefined) continue; }      /* X12：分段的湊齊才往下 */
    if (!okMap(md)) { D7.nos.push([mg.uid, 'bad', now]); continue; }
    D7.inbox.push({ uid: mg.uid, peer: r.peer, name: r.name || '旅人', m: md, t: 0 }); }
  if (!D7.prompt && D7.inbox.length) { D7.prompt = D7.inbox.shift(); if (inCombat() || me.combat) { D7.nos.push([D7.prompt.uid, 'combat', now]); D7.prompt = null; } else showPrompt(); }
  const pr = D7.prompt; if (pr) { pr.t += dt; const r = remotes.get(pr.peer), mg = r && r.lastPres && r.lastPres.mg;
    if (!r || !mg || mg.uid !== pr.uid) { hidePrompt(); ui.toast(`${pr.name} 收回了地圖。`); }
    else if (r.away && !hidTab(r) && (pr.gone = (pr.gone || 0) + dt) > MAP7.lostT) { hidePrompt(); ui.toast(`${pr.name} 斷線了，沒有收到地圖。`); }      // 送的人切到別的分頁：確認框照留（他回來就看得到回覆）
    else if (pr.t > MAP7.giftT) answer(false, 'late'); else promptBar(); }
}
export function answer(ok, why) {
  const pr = D7.prompt; if (!pr) return; const now = Date.now();
  if (ok) { const res = mergeMap(pr.m); D7.acks.push([pr.uid, now]); if (res === 'ok') { ui.loot(`收下了 ${pr.name} 的手繪地圖《${areaName(pr.m.area)}》。地圖上褐色的部分就是抄來的。`); ui.sfx('quest', 'accept'); const qa = debug.questAct; if (qa) qa('doGetMap'); } else if (res === 'dup') ui.toast('這張你已經收過了。'); }
  else { D7.nos.push([pr.uid, why || 'no', now]); if (why === 'late') ui.toast(`沒有回覆 ${pr.name}，地圖留在他身上。`); }
  hidePrompt(); giftTick(0);
}

/* ============================== 每幀 ============================== */
export function tick(dt) {
  if (!input.started || input.creator) return;
  if (!D7.built) buildDom(); if (!D7.tbl) { D7.tbl = 1; placeholderTable(); shopInit(); }
  // 測繪天賦：記錄範圍 ×1.5（game.js 照常揭開半徑 7 格，這裡補到約 10.5 格）
  if (survey()) { const gx = Math.floor((me.x + FS / 2) / FC), gz = Math.floor((me.z + FS / 2) / FC); if (gx !== D7.egx || gz !== D7.egz) { D7.egx = gx; D7.egz = gz; let ch = false; for (let dz = -11; dz <= 11; dz++) for (let dx = -11; dx <= 11; dx++) { const q = dx * dx + dz * dz; if (q > 117 || q <= 52) continue; const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= FN || z >= FN) continue; const i = z * FN + x; if (!P.explored[i]) { P.explored[i] = 1; ch = true; } } if (ch) { me.exploredDirty = true; Store.dirty = true; } } }
  // 經過的採集片、營火（25 公尺內）
  if ((D7.seenT -= dt) <= 0) { D7.seenT = 0.4; const R = MAP7.seenR * (survey() ? MAP7.surveyK : 1), R2 = R * R; let ch = false;
    for (const s of GATHER_SITES) { if (S.seenPatch.has(s.id)) continue; const dx = s.x - me.x, dz = s.z - me.z; if (dx * dx + dz * dz < R2) { S.seenPatch.add(s.id); ch = true; } }
    for (const c of CAMPS) { if (S.seenCamp.has(c.id)) continue; const dx = c.x - me.x, dz = c.z - me.z; if (dx * dx + dz * dz < R2) { S.seenCamp.add(c.id); ch = true; } }
    if (ch) { Store.dirty = true; D7.marks = null; } }
  drawTick(dt); giftTick(dt);
  if (D7.f02t !== f02State()) { D7.f02t = f02State(); if (drawOpen()) renderDraw(); }
  if (mapsOpen() && (D7.mapsT = (D7.mapsT || 0) - dt) <= 0) { D7.mapsT = 0.5; renderMaps(true); }
  if ((D7.bagT = (D7.bagT || 0) - dt) <= 0) { D7.bagT = 0.5; const b = document.getElementById('bagMaps7'); if (b) b.querySelector('b').textContent = `${S.maps.length} / ${MAP7.maxMaps}`; }
}
// 互動提示與 E：繪圖桌比芬恩近時，按 E 是用繪圖桌
const nearestNpc = () => { let d = 1e9; for (const n of npcs) d = Math.min(d, Math.hypot(n.x - me.x, n.z - me.z)); return d; };
function tableFirst() { const t = table(), d = Math.hypot(me.x - t.x, me.z - t.z); return d < 2.3 && d < nearestNpc(); }
export function hint(h) { return !input.talk && !me.sit && tableFirst() ? `按 ${keyOf('interact')} 使用芬恩的繪圖桌` : h; }
export function interact() { if (!tableFirst()) return false; openDraw(); return true; }
// 芬恩的對話選項（ui.js 的 service 找不到的代號交給這裡）
export function service(k, dlg) { if (k !== 'draw7') return false; if (dlg && dlg.win) { dlg.win('draw7'); f02Gift(); renderDraw(); } else openDraw(); return true; }

/* ============================== 地圖的畫法（ui.js 呼叫） ============================== */
// 迷霧：抄本有、自己沒走過的細格也要打開（底下改畫褐墨）
export const ink = i => !P.explored[i] && S.copy[f2c(i)] === 1;
export function copyAt(x, z) { const c = cIdx(x, z); return c >= 0 && S.copy[c] === 1; }
export function fogDone() { D7.ink = true; D7.marks = null; }
let sepCv = null, inkCv = null, maskCv = null, grainP = null;
// 褐墨底圖：照地圖的顏色分類改成單色——地形依明暗分深淺、路畫成虛線、水邊描線、水面橫線、岩壁交叉線、森林點點
function buildSepia() {
  const N1 = WORLD.GRID + 1, cv = document.createElement('canvas'); cv.width = cv.height = N1; const c = cv.getContext('2d'), id = c.createImageData(N1, N1), d = id.data;
  const PAPER = [238, 222, 188], INK = [70, 42, 20], mix = (k, o) => { k = clamp(k, 0, 1); d[o] = PAPER[0] + (INK[0] - PAPER[0]) * k; d[o + 1] = PAPER[1] + (INK[1] - PAPER[1]) * k; d[o + 2] = PAPER[2] + (INK[2] - PAPER[2]) * k; d[o + 3] = 255; };
  const cat = i => { const r = mapRGB[i * 3], g = mapRGB[i * 3 + 1], b = mapRGB[i * 3 + 2]; return r === 84 && g === 148 && b === 184 ? 'w' : (r === 196 && g === 168 && b === 122) || (r === 176 && g === 158 && b === 118) || (r === 186 && g === 174 && b === 152) ? 'r' : (r === 124 && g === 122 && b === 122) || (r === 92 && g === 84 && b === 82) || (r === 96 && g === 90 && b === 92) || (r === 140 && g === 104 && b === 74) ? 'm' : g > r + 30 && g < 110 ? 'f' : 'g'; };
  const C = new Array(N1 * N1); for (let i = 0; i < N1 * N1; i++) C[i] = cat(i);
  const near = (i, x, z, k, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N1 || Z >= N1) continue; if ((C[Z * N1 + X] === k) !== (C[i] === k)) return true; } return false; };
  for (let z = 0; z < N1; z++) for (let x = 0; x < N1; x++) {
    const i = z * N1 + x, o = i * 4, k = C[i], r = mapRGB[i * 3], g = mapRGB[i * 3 + 1], b = mapRGB[i * 3 + 2], lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255, h = ((x * 73856093) ^ (z * 19349663)) >>> 0;
    if (k === 'w') mix(near(i, x, z, 'w', 1) ? 0.88 : z % 3 === 0 && (x + (z >> 1)) % 9 < 6 ? 0.34 : 0.06, o);      // 水：岸邊描一道深墨、水面一段一段的橫線
    else if (near(i, x, z, 'w', 1)) mix(0.78, o);
    else if (k === 'r') mix(deco.roadFlat ? 0.12 : (x + z) % 6 < 3 ? 0.78 : 0.1, o);      // 路：虛線
    else if (k === 'm') mix(((x + z) % 3 === 0 || (x - z + 3000) % 3 === 0) ? 0.72 : 0.34, o);      // 岩壁、山：交叉線
    else if (k === 'f') mix(h % 4 === 0 ? 0.72 : h % 9 === 1 ? 0.5 : 0.22, o);      // 森林：點點
    else { const dk = 1 - lum; mix(0.1 + dk * 0.3 + ((x - z + 3000) % 5 === 0 && dk > 0.42 ? 0.22 : 0), o); }      // 草地、沙地：淡底，暗的地方加斜線
  }
  c.putImageData(id, 0, 0); return cv;
}
function rebuildInk() {
  if (!sepCv) sepCv = buildSepia();
  const R = FN * 4; if (!inkCv) { inkCv = document.createElement('canvas'); inkCv.width = inkCv.height = R; maskCv = document.createElement('canvas'); maskCv.width = maskCv.height = FN; }
  const mc = maskCv.getContext('2d'), md = mc.createImageData(FN, FN); let any = false; for (let i = 0; i < FN * FN; i++) if (ink(i)) { md.data[i * 4 + 3] = 255; any = true; } mc.putImageData(md, 0, 0);
  const c = inkCv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, R, R); D7.inkAny = any; if (!any) return;
  const SIZE = WORLD.SIZE, CELL = SIZE / WORLD.GRID, k = R / FS, N1 = WORLD.GRID + 1;
  c.imageSmoothingEnabled = true; c.drawImage(sepCv, (FS / 2 - (SIZE / 2 + CELL / 2)) * k, (FS / 2 - (SIZE / 2 + CELL / 2)) * k, N1 * CELL * k, N1 * CELL * k);
  // 紙的紋理：一點不規則的斑
  if (!grainP) { const g = document.createElement('canvas'); g.width = g.height = 64; const gc = g.getContext('2d'), gd = gc.createImageData(64, 64); for (let i = 0; i < 64 * 64; i++) { const v = (((i * 2654435761) >>> 0) % 1000) / 1000; gd.data[i * 4] = 70; gd.data[i * 4 + 1] = 46; gd.data[i * 4 + 2] = 24; gd.data[i * 4 + 3] = v < 0.08 ? 60 : v < 0.2 ? 22 : 0; } gc.putImageData(gd, 0, 0); grainP = c.createPattern(g, 'repeat'); }
  c.fillStyle = grainP; c.fillRect(0, 0, R, R);
  c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = false; c.drawImage(maskCv, 0, 0, R, R);      // 粗格的邊不做平滑（手抄本的毛邊）
  // 褐色區的外框：沿著邊描一道淡墨線
  c.globalCompositeOperation = 'source-over'; c.strokeStyle = 'rgba(70,44,20,.55)'; c.lineWidth = 1.2; c.beginPath(); const s = 4;
  for (let z = 0; z < FN; z++) for (let x = 0; x < FN; x++) { const i = z * FN + x; if (!ink(i)) continue; const out = j => j < 0 || !ink(j); if (x === 0 || out(i - 1)) { c.moveTo(x * s, z * s); c.lineTo(x * s, z * s + s); } if (x === FN - 1 || out(i + 1)) { c.moveTo(x * s + s, z * s); c.lineTo(x * s + s, z * s + s); } if (z === 0 || out(i - FN)) { c.moveTo(x * s, z * s); c.lineTo(x * s + s, z * s); } if (z === FN - 1 || out(i + FN)) { c.moveTo(x * s, z * s + s); c.lineTo(x * s + s, z * s + s); } }
  c.stroke();
}
// mapLayer 畫完彩色底圖之後、迷霧之前呼叫：在抄本區畫上褐墨
export function inkLayer(cx, ox, oz, s) {
  if (D7.ink) { D7.ink = false; rebuildInk(); } if (!D7.inkAny) return;
  cx.drawImage(inkCv, ox - FS / 2 * s, oz - FS / 2 * s, FS * s, FS * s);
  if (deco.inkRoads) deco.inkRoads(cx, ox, oz, s, maskCv, FS);
}
// 地圖上的記號：自己看過的採集片（彩色）、抄本的採集片（褐色墨點）、陷阱 ✕（自己找到的或抄本上的，且對自己還沒消失）、只從抄本知道的營火（褐色圈）
const KIND_COL = { herb_bleed: '#7fd06a', mushroom: '#d9b48a', berry: '#d65a6a', wheat: '#e8cf6a', cress: '#8fe0b0', egg: '#efe6d0', mint: '#a8f0e0', moss: '#7ab6a0', ginseng: '#e0a050', honey: '#f2b830', scrap: '#a0a4a8', ore_iron: '#b8b0a8', salt: '#f4f2ea' };
const kindName = k => (ITEMS[k] && ITEMS[k].name) || k;
export function marks(cx, ox, oz, s, mini) {
  const R = mini ? 2.6 : 3.4, X = (x) => ox + x * s, Y = (z) => oz + z * s, hits = mini ? null : (D7.hits = []);
  const vis = (x, z) => { if (!mini) return true; const dx = x - me.x, dz = z - me.z; return dx * dx + dz * dz < 60 * 60; };
  for (const p of GATHER_SITES) { const own = S.seenPatch.has(p.id), cp = !own && S.cpPatch.has(p.id); if (!own && !cp) continue; if (!vis(p.x, p.z)) continue; const x = X(p.x), y = Y(p.z);
    cx.beginPath(); cx.arc(x, y, R, 0, TAU); cx.fillStyle = own ? (KIND_COL[p.kind] || '#cfe0a0') : '#6b4626'; cx.fill(); cx.lineWidth = own ? 1.2 : 1; cx.strokeStyle = own ? 'rgba(0,0,0,.75)' : 'rgba(240,222,186,.8)'; cx.stroke();
    if (hits) hits.push({ x, y, t: kindName(p.kind), note: (own ? '採集片：你經過時看到的' : '採集片：抄本上畫的') + (p.n ? `（約 ${p.n} 株）` : '') }); }
  for (const c of CAMPS) { if (S.seenCamp.has(c.id) || !S.cpCamp.has(c.id) || P.explored[fIdx(c.x, c.z)]) continue; if (!vis(c.x, c.z)) continue; const x = X(c.x), y = Y(c.z); cx.beginPath(); cx.arc(x, y, mini ? 6 : 9, 0, TAU); cx.lineWidth = 2; cx.strokeStyle = '#6b4626'; cx.stroke(); }
  const xr = mini ? 4.2 : 5.5; for (const t of D7.traps) { if (S.trapGone.has(t.id)) continue; const own = S.trapSeen.has(t.id), cp = !own && S.cpTrap.has(t.id); if (!own && !cp) continue; if (!vis(t.x, t.z)) continue; const x = X(t.x), y = Y(t.z);
    cx.save(); cx.lineCap = 'round'; for (const [w, col] of [[4.2, 'rgba(0,0,0,.8)'], [2.2, own ? '#ff5a3c' : '#7a3a18']]) { cx.lineWidth = w; cx.strokeStyle = col; cx.beginPath(); cx.moveTo(x - xr, y - xr); cx.lineTo(x + xr, y + xr); cx.moveTo(x + xr, y - xr); cx.lineTo(x - xr, y + xr); cx.stroke(); } cx.restore();
    if (hits) hits.push({ x, y, t: t.kind === 'bell' ? '絆索鈴' : '捕獸夾', note: own ? '你找到的陷阱。' : '抄本上畫的陷阱：對畫圖的人可能已經拆掉了，對你來說還在。' }); }
}
// 大地圖的游標提示：褐色區「抄自：阿明（11 月 20 日）」、記號的名字
function mapHover(e) {
  const cv = e.currentTarget, r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * cv.width, py = (e.clientY - r.top) / r.height * cv.height, S9 = cv.width, V = deco.view, s = V ? V.s : S9 / WORLD.SIZE, wx = (px - (V ? V.ox : S9 / 2)) / s, wz = (py - (V ? V.oz : S9 / 2)) / s;      /* 0.8 X7：大地圖的平移縮放（ui.js 每次畫完放進 deco.view） */
  setTimeout(() => {
    const tip = D7.tip, base = document.getElementById('mapTip'); if (!tip) return; if (base && !base.hidden) { tip.hidden = true; return; }
    let txt = null; const h = (D7.hits || []).find(q => Math.hypot(q.x - px, q.y - py) < 7); if (h) txt = [h.t, h.note];
    else { const i = fIdx(wx, wz); if (i >= 0 && ink(i)) { const g = grid(), c = cIdx(wx, wz), a = g.cz[c] >= 0 ? AREAS[g.cz[c]] : null, src = a && S.cpSrc[a]; if (src) { const d = new Date(src.at); txt = ['抄本', `抄自：${src.by}（${d.getMonth() + 1} 月 ${d.getDate()} 日）`]; } else txt = ['抄本', '別人送的手繪地圖']; } }
    if (!txt) { tip.hidden = true; return; } tip.textContent = ''; const b = document.createElement('b'); b.textContent = txt[0]; const sp = document.createElement('span'); sp.textContent = txt[1]; tip.append(b, sp); tip.hidden = false;
    const pr = tip.parentElement.getBoundingClientRect(), x = e.clientX - pr.left, y = e.clientY - pr.top; tip.style.left = clamp(x + 14, 4, pr.width - tip.offsetWidth - 4) + 'px'; tip.style.top = (y + 16) + 'px';
  }, 0);
}

/* ============================== 視窗：繪圖桌、手繪地圖、收到地圖的確認框 ============================== */
const $ = id => document.getElementById(id);
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const CSS7 = `
#winDraw7{left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,94vw)} #winMaps7{right:20px;top:50%;transform:translateY(-50%);width:min(430px,94vw)}
.m7sup{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:13px;color:var(--ink-dim);margin-bottom:8px} .m7sup b{color:var(--ink);font-weight:700} .m7sup .sp{flex:1}
.m7sup button{padding:3px 10px;font-size:12.5px}
.m7row{display:grid;grid-template-columns:96px 1fr 44px 112px;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.m7row .nm{font-family:var(--font-display);letter-spacing:.06em} .m7row .nm small{display:block;font-family:inherit;font-size:10.5px;color:var(--ink-faint);letter-spacing:0}
.m7bar{height:8px;border-radius:4px;background:rgba(0,0,0,.5);box-shadow:0 0 0 1px rgba(0,0,0,.6);position:relative;overflow:hidden} .m7bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#e9cf8f,#b98a4a)} .m7bar em{position:absolute;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,.55)}
.m7row .pc{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-dim)} .m7row button{padding:4px 8px;font-size:12.5px}
.m7row.all{grid-template-columns:1fr 112px;border-bottom:none;margin-top:4px}
.m7prog{margin:10px 0 2px;height:22px;border-radius:5px;background:rgba(0,0,0,.45);position:relative;overflow:hidden;box-shadow:0 0 0 1px var(--line)} .m7prog i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#8a6236,#d9b06a)} .m7prog span{position:relative;display:block;text-align:center;font-size:12.5px;line-height:22px;text-shadow:0 1px 2px #000}
.m7lock{padding:8px 10px;margin-bottom:8px;border-radius:6px;background:rgba(232,194,92,.1);border:1px solid rgba(232,194,92,.35);color:var(--warn);font-size:13px}
.m7show{display:flex;align-items:center;gap:10px;font-size:13px} .m7show .tx{flex:1;color:var(--ink-dim);line-height:1.55} .m7show .tx b{color:var(--ink)}
.m7card{display:grid;grid-template-columns:88px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)} .m7card canvas{width:88px;height:88px;border-radius:4px;background:#e9d8b4;box-shadow:inset 0 0 0 1px rgba(70,44,20,.5)}
.m7card h4{margin:0 0 2px;font-family:var(--font-display);font-size:15px;letter-spacing:.06em} .m7card p{margin:0 0 6px;font-size:12px;color:var(--ink-dim)} .m7card .bt{display:flex;flex-wrap:wrap;gap:6px} .m7card button{padding:3px 10px;font-size:12.5px}
.m7who{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:6px;border-radius:5px;background:rgba(0,0,0,.25)} .m7who small{width:100%;color:var(--ink-dim);font-size:11.5px}
.m7wait{margin-top:6px;font-size:12.5px;color:var(--warn)} .m7cp{font-size:12.5px;color:var(--ink-dim);line-height:1.7} .m7cp b{color:#d9b48a;font-weight:500}
#gift7{right:16px;bottom:126px;width:300px;padding:10px 14px 0;border-radius:7px;background:var(--panel);border:1px solid var(--brass-dark);border-top:2px solid #b98a4a;box-shadow:0 6px 18px rgba(0,0,0,.5);pointer-events:auto;overflow:hidden;z-index:8}
#gift7 .gTxt{font-size:14px;line-height:1.55;text-align:center} #gift7 .gTxt b{font-family:var(--font-display);color:var(--brass-light)} #gift7 .gTxt i{font-style:normal;color:#e6c890}
#gift7 .gBtns{display:flex;gap:8px;justify-content:center;margin:9px 0 10px} #gift7 .gBtns button{min-width:100px;padding:5px 12px;font-size:14px} #gift7 .gBtns kbd{margin-right:6px}
#gift7 .gBar{height:3px;margin:0 -14px;background:rgba(0,0,0,.5)} #gift7 .gBar i{display:block;height:100%;background:#b98a4a;transform-origin:left center}
body.talking #gift7{opacity:0!important;pointer-events:none} #invite:not([hidden])~#gift7{bottom:236px}
#mapTip7{position:absolute;z-index:3;max-width:260px;padding:6px 9px;border-radius:5px;background:rgba(30,22,12,.94);border:1px solid #8a6236;font-size:12.5px;line-height:1.5;pointer-events:none} #mapTip7 b{display:block;color:#e6c890;font-family:var(--font-display)} #mapTip7 span{color:#e9dcc0}
#bagMaps7{display:flex;align-items:center;gap:8px;width:100%;margin:8px 0 2px;padding:6px 10px;font-size:13px} #bagMaps7 b{margin-left:auto;font-weight:500;color:var(--ink-dim)}
`;
function buildDom() {
  D7.built = true; if ($('winDraw7')) return;
  const st = el('style'); st.id = 'css7m'; st.textContent = CSS7; document.head.appendChild(st);
  const win = (id, title) => { const s = el('section', 'win'); s.id = id; s.hidden = true; s.innerHTML = `<header><h2>${title}</h2><button class="x" data-close>×</button></header><div class="body"></div>`; document.body.appendChild(s); return s; };
  win('winDraw7', '芬恩的繪圖桌'); win('winMaps7', '手繪地圖');
  const g = el('div', 'hud'); g.id = 'gift7'; g.hidden = true; g.innerHTML = '<div class="gTxt"></div><div class="gBtns"><button class="primary" id="gift7Yes"><kbd>Y</kbd>收下</button><button id="gift7No"><kbd>N</kbd>不要</button></div><div class="gBar"><i></i></div>'; document.body.appendChild(g);
  $('gift7Yes').onclick = () => answer(true); $('gift7No').onclick = () => answer(false);
  window.addEventListener('keydown', e => { if (!D7.prompt || $('gift7').hidden || input.typing || e.repeat) return; const inv = $('invite'); if (inv && !inv.hidden) return; if (e.code === 'KeyY' || e.code === 'KeyN') { e.preventDefault(); e.stopImmediatePropagation(); answer(e.code === 'KeyY'); } }, true);
  const bm = $('bigMap'); if (bm) { const t = el('div'); t.id = 'mapTip7'; t.hidden = true; bm.parentElement.appendChild(t); D7.tip = t; bm.addEventListener('mousemove', mapHover); bm.addEventListener('mouseleave', () => { t.hidden = true; }); }
  const bag = $('itemInfo'); if (bag) { const b = el('button'); b.id = 'bagMaps7'; b.innerHTML = '<span>手繪地圖</span><b></b>'; b.onclick = () => openMaps(); bag.parentElement.insertBefore(b, bag); }
}
if (typeof document !== 'undefined' && document.body) buildDom();      // 視窗要在 ui.js 第一次查 WINS 之前就存在
const drawOpen = () => { const w = $('winDraw7'); return w && !w.hidden; }, mapsOpen = () => { const w = $('winMaps7'); return w && !w.hidden; };
function showWin(id, on) { const k = id === 'winDraw7' ? 'draw7' : 'maps7'; if (ui.win7) ui.win7(k, on); else { const w = $(id); if (w) w.hidden = !on; } }
export function openDraw() { if (!D7.built) buildDom(); showWin('winDraw7', true); f02Gift(); renderDraw(); }
// f02 進行中、身上沒有空白地圖：芬恩先給一張練習用的（只給一次；任務獎勵再送一張）
function f02Gift() { if (qx('f02') && f02State() === 'active' && !S.f02g && !(P.inv.map_blank > 0)) { S.f02g = 1; addItem('map_blank', 1); Store.dirty = true; ui.loot('芬恩給你一張空白地圖：「這張先拿去練習。」'); } }
export function openMaps() { if (!D7.built) buildDom(); showWin('winMaps7', true); renderMaps(); }
function drawBar() { if (deco.drawBar) return deco.drawBar(D7, areaName); const d = D7.draw, b = $('m7prog'); if (!b) return; if (!d) { b.hidden = true; return; } b.hidden = false; const k = d.dur ? clamp(d.t / d.dur, 0, 1) : 1; b.querySelector('i').style.width = (k * 100) + '%'; b.querySelector('span').textContent = `正在畫《${areaName(d.area)}》${d.n > 1 ? `（第 ${d.done + 1} / ${d.n} 張）` : ''}　${Math.ceil(Math.max(0, d.dur - d.t))} 秒`; }
let drawN = 1;
export function renderDraw() {
  if (deco.renderDraw) return deco.renderDraw();
  const w = $('winDraw7'); if (!w || w.hidden) return; const body = w.querySelector('.body'); body.textContent = '';
  const pc = pcts(), lock = !canDrawAt(), sup = el('div', 'm7sup');
  sup.innerHTML = `<span>空白地圖 <b>${P.inv.map_blank || 0}</b></span><span>大張 <b>${P.inv.map_big || 0}</b></span><span>手繪地圖 <b>${S.maps.length} / ${MAP7.maxMaps}</b></span><span>金幣 <b>${P.gold}</b></span><span class="sp"></span>`;
  for (const [id, t] of [['map_blank', '買空白地圖'], ['map_big', '買大張']]) { const it = ITEMS[id] || {}, b = el('button', '', it.buy ? `${t} ${it.buy} 金` : `${t}（還沒上架）`); b.disabled = !it.buy || P.gold < it.buy || (P.inv[id] || 0) >= (it.max || 99); if (it.buy && P.gold < it.buy) b.title = '金幣不夠'; else if ((P.inv[id] || 0) >= (it.max || 99)) b.title = '帶不下了'; b.onclick = () => { buy(id); renderDraw(); }; sup.appendChild(b); }
  body.appendChild(sup);
  if (lock) body.appendChild(el('div', 'm7lock', '芬恩：「想學畫圖？先幫我一個小忙——接下『第一張圖』。」（風吹草原自己走過三成、做完主線「大概在那一帶」之後，芬恩會教你）'));
  body.appendChild(el('h3', '', '畫一區（空白地圖 ×1，' + (survey() ? '不用等' : MAP7.drawT.one + ' 秒') + '）　自己走過一成以上才畫得出來'));
  const nSel = el('select'); for (let i = 1; i <= MAP7.maxMaps; i++) { const o = el('option', '', '一次畫 ' + i + ' 張'); o.value = i; if (i === drawN) o.selected = true; nSel.appendChild(o); } nSel.onchange = () => { drawN = +nSel.value; }; nSel.style.cssText = 'float:right;margin-top:-26px;font-size:12px;padding:1px 4px;background:#222;color:var(--ink);border:1px solid var(--line-strong);border-radius:4px';
  body.appendChild(nSel);
  for (const a of AREAS) { const r = el('div', 'm7row'), v = pc[a], nm = el('span', 'nm', areaName(a)); nm.appendChild(el('small', '', { in: '內圈', out: '外環', A: '新地', N: '北境' }[ringOf(a)])); const bar = el('span', 'm7bar'), fill = el('i'); fill.style.width = (v * 100).toFixed(1) + '%'; const tick = el('em'); tick.style.left = '10%'; const t9 = el('em'); t9.style.left = '90%'; bar.append(fill, tick, t9);
    const b = el('button', '', v < MAP7.minPct ? '走過不到一成' : '畫一張'); const why = drawCheck(a); b.disabled = !!why || !!D7.draw; if (why) b.title = why; b.onclick = () => startDraw(a, drawN);
    r.append(nm, bar, el('span', 'pc', Math.floor(v * 100) + '%'), b); body.appendChild(r); }
  { const r = el('div', 'm7row all'), n = AREAS.filter(a => pc[a] >= MAP7.minPct).length, t = el('span', 'nm', `整層畫在一張（大張空白地圖 ×1，${survey() ? '不用等' : MAP7.drawT.all + ' 秒'}）`); t.appendChild(el('small', '', `只畫走過一成以上的 ${n} 區；全層自己走過 ${Math.floor(pc[AREA_ALL] * 100)}%`)); const b = el('button', '', '畫整層'); const why = drawCheck(AREA_ALL); b.disabled = !!why || !!D7.draw; if (why) b.title = why; b.onclick = () => startDraw(AREA_ALL, drawN); r.append(t, b); body.appendChild(r); }
  const pg = el('div', 'm7prog'); pg.id = 'm7prog'; pg.innerHTML = '<i></i><span></span>'; body.appendChild(pg); drawBar();
  // 給芬恩看：自己走過九成的區（測繪費、f04）
  body.appendChild(el('h3', '', '給芬恩看（一區自己走過九成，芬恩付一次測繪費，越遠的區越多）'));
  { const full = AREAS.filter(a => pc[a] >= MAP7.fullPct), unpaid = full.filter(a => !S.fee.has(a)), f04 = qx('f04') && qStatus('f04') === 'active', row = el('div', 'm7show'), tx = el('div', 'tx'), b = el('button', '', '拿給芬恩看');
    tx.innerHTML = full.length ? `走過九成的：<b>${full.map(areaName).join('、')}</b>` + (unpaid.length ? `　還沒領：${unpaid.map(a => areaName(a) + ' ' + feeOf(a) + ' 金').join('、')}` : '　測繪費都領過了') : '還沒有一區自己走過九成。抄來的地圖不算。';
    b.disabled = !(unpaid.length || (f04 && full.length)); b.onclick = () => { showFinn(); renderDraw(); }; row.append(tx, b); body.appendChild(row); }
  const mb = el('button', '', `看你的手繪地圖（${S.maps.length} / ${MAP7.maxMaps}）`); mb.style.marginTop = '12px'; mb.onclick = () => openMaps(); body.appendChild(mb);
  body.appendChild(el('p', 'hint', '只畫得出你自己走過的地方；別人送你的部分（地圖上褐色的）畫不出來。畫好的圖可以在背包的「手繪地圖」送給 8 公尺內的人。'));
}
export function showFinn() {
  const pc = pcts(), full = AREAS.filter(a => pc[a] >= MAP7.fullPct); let got = 0; const paid = [];
  for (const a of full) if (!S.fee.has(a)) { const g = feeOf(a); S.fee.add(a); P.gold += g; got += g; paid.push(areaName(a)); }
  const qa = debug.questAct; if (full.length && qa) { qa('doShowMap'); if (got) qa('doSurveyFee'); }
  if (got) { ui.loot(`芬恩付了測繪費 ${got} 金（${paid.join('、')}）`); ui.sfx('coin'); } else if (full.length) ui.toast('芬恩把你的圖看了又看。'); else ui.toast('還沒有一區自己走過九成。');
  Store.dirty = true; ui.dirty = true; return got;
}
// 手繪地圖的縮圖：褐色的粗格
function preview(cv, m) { const c = cv.getContext('2d'), n = cv.width; c.fillStyle = '#ecdcb8'; c.fillRect(0, 0, n, n); const cells = rleDec(m.cells, CN * CN); if (!cells) return; let x0 = CN, x1 = 0, z0 = CN, z1 = 0; for (let i = 0; i < CN * CN; i++) if (cells[i]) { const x = i % CN, z = (i / CN) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } if (m.area === AREA_ALL) { x0 = z0 = 0; x1 = z1 = CN - 1; } const w = Math.max(x1 - x0, z1 - z0) + 3, k = n / w, ox = (w - (x1 - x0 + 1)) / 2 - x0, oz = (w - (z1 - z0 + 1)) / 2 - z0; c.fillStyle = '#7a5530'; for (let i = 0; i < CN * CN; i++) if (cells[i]) c.fillRect(((i % CN) + ox) * k, (((i / CN) | 0) + oz) * k, Math.ceil(k), Math.ceil(k)); c.strokeStyle = 'rgba(70,44,20,.6)'; c.strokeRect(0.5, 0.5, n - 1, n - 1); }
let whoFor = null, tearFor = null;
export function renderMaps(soft) {
  if (deco.renderMaps) return deco.renderMaps(soft);
  const w = $('winMaps7'); if (!w || w.hidden) return; const body = w.querySelector('.body');
  if (soft && document.activeElement && body.contains(document.activeElement) && !D7.gift && !whoFor) return;
  body.textContent = '';
  body.appendChild(el('div', 'm7sup', '')).innerHTML = `<span>手繪地圖 <b>${S.maps.length} / ${MAP7.maxMaps}</b></span><span>到芬恩的繪圖桌畫；走到朋友 ${MAP7.giftR} 公尺內就能送</span>`;
  if (!S.maps.length) body.appendChild(el('p', 'hint', '身上沒有手繪地圖。到鐵環城東南市集旁，芬恩的繪圖桌，用空白地圖把自己走過的一區畫下來。'));
  for (const m of S.maps) {
    const card = el('div', 'm7card'), cv = el('canvas'); cv.width = cv.height = 88; preview(cv, m); const tx = el('div'), d = new Date(m.at);
    tx.append(el('h4', '', `《${areaName(m.area)}》`), el('p', '', `${m.by} 畫的　${d.getMonth() + 1} 月 ${d.getDate()} 日　畫了 ${m.pct}%`));
    const bt = el('div', 'bt'), g = D7.gift && D7.gift.uid === m.uid;
    if (g) { const wt = el('div', 'm7wait', `正在等 ${D7.gift.name} 回覆…（剩 ${Math.max(0, Math.ceil(MAP7.giftT - D7.gift.t))} 秒）`), c = el('button', '', '收回'); c.onclick = () => cancelGift('收回了。'); bt.append(c); tx.append(bt, wt); }
    else {
      const gv = el('button', '', '送給…'); gv.disabled = !!D7.gift; gv.onclick = () => { whoFor = whoFor === m.uid ? null : m.uid; tearFor = null; renderMaps(); };
      const tr = el('button', '', tearFor === m.uid ? '確定撕掉？' : '撕掉'); tr.onclick = () => { if (tearFor !== m.uid) { tearFor = m.uid; renderMaps(); return; } S.maps = S.maps.filter(o => o !== m); tearFor = null; Store.dirty = true; ui.sfx('page', 0, { tag: 'tear' }); renderMaps(); renderDraw(); };
      bt.append(gv, tr); tx.appendChild(bt);
      if (whoFor === m.uid) { const box = el('div', 'm7who'), list = giftTargets(); box.appendChild(el('small', '', list.length ? `送給誰？（${MAP7.giftR} 公尺內，對方會先看到確認框）` : `${MAP7.giftR} 公尺內沒有其他玩家。走近一點再送。`)); for (const t of list) { const b = el('button', '', `${t.name}（${t.d.toFixed(0)} 公尺）`); b.onclick = () => { whoFor = null; giveMap(m.uid, t.peer); }; box.appendChild(b); } tx.appendChild(box); }
    }
    card.append(cv, tx); body.appendChild(card);
  }
  const cs = Object.keys(S.cpSrc); if (cs.length) { body.appendChild(el('h3', '', '收到的抄本（地圖上褐色的部分）')); const p = el('div', 'm7cp'); p.innerHTML = cs.map(a => { const s = S.cpSrc[a], d = new Date(s.at); return `${areaName(a)}：抄自 <b>${esc(s.by)}</b>（${d.getMonth() + 1} 月 ${d.getDate()} 日）`; }).join('<br>'); body.appendChild(p); body.appendChild(el('p', 'hint', '抄本不算探索度和測繪費，也不能再畫給別人；自己走過的地方會變回彩色。')); }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function showPrompt() { const pr = D7.prompt, g = $('gift7'); if (!g) return; g.querySelector('.gTxt').innerHTML = `<b>${esc(pr.name)}</b> 想送你：<br>手繪地圖<i>《${esc(areaName(pr.m.area))}》</i>（畫了 ${pr.m.pct | 0}%），收下嗎？`; g.hidden = false; if (deco.showPrompt) deco.showPrompt(pr, g); ui.sfx('invite'); promptBar(); }
function promptBar() { const g = $('gift7'), pr = D7.prompt; if (g && pr) g.querySelector('.gBar i').style.transform = `scaleX(${clamp(1 - pr.t / MAP7.giftT, 0, 1)})`; }
function hidePrompt() { D7.prompt = null; const g = $('gift7'); if (g) g.hidden = true; }

/* ============================== 繪圖桌的暫代模型（場景或美術已經放了 name='draw_table' 的就不放） ============================== */
function placeholderTable() {
  setTimeout(async () => {
    if (!W.scene) return; let found = false; const grp0 = null; W.scene.traverse(o => { if (o !== grp0 && (o.name === 'draw_table' || o.name === 'prop:draw_table' || (o.userData && o.userData.drawTable))) found = true; }); if (found || (D7.table && D7.table.model)) return;
    const t = table(), grp = new THREE.Group(); grp.name = 'draw_table7';
    let made = null; try { const pr = await import('./props07.js'); if (pr && pr.has07 && pr.makeProp07 && (!pr.has07 || pr.has07('draw_table'))) made = pr.makeProp07('draw_table', {}); } catch (e) {}
    if (made) grp.add(made); else {
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.85 }), paper = new THREE.MeshStandardMaterial({ color: 0xe8d6ae, roughness: 0.95 }), ink = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.4 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.9), wood); top.position.y = 0.92; grp.add(top);
      for (const [x, z] of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood); l.position.set(x, 0.45, z); grp.add(l); }
      const sh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.012, 0.7), paper); sh.position.set(-0.05, 0.967, 0); sh.rotation.y = 0.08; grp.add(sh);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), ink); pot.position.set(0.6, 1.01, -0.28); grp.add(pot);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10), paper); roll.rotation.z = Math.PI / 2; roll.position.set(0.3, 1.0, 0.36); grp.add(roll);
      grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }
    grp.position.set(t.x, Hgt(t.x, t.z), t.z); grp.rotation.y = t.f || 0; W.scene.add(grp);
  }, 6000);      // 等場景（places07）先放；6 秒後還沒有人放才放
}

/* ============================== 測試用 ============================== */
export const debug7 = { MAP7, S, D7, sites: GATHER_SITES, camps: CAMPS, trapSeen, trapGone, grid, pcts, makeMap, mergeMap, rleEnc, rleDec, mapBytes, giftTargets, giveMap, answer, startDraw, drawCheck, showFinn, table, setTraps, ink, copyAt, openDraw, openMaps, renderDraw, renderMaps, save, load };
if (typeof window !== 'undefined') window.__m7 = debug7;
