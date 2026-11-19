// 0.8 雨與雷的時程與規則（d8-play-p4）。只有「什麼時候下、下多大、什麼時候打雷」和兩條玩法規則；雨絲、天色、霧、閃光由美術的 rain08.js 畫。
// 規格：0.8 設計定案第 5 節、介面08 第 2／3／5／8／9 節。
//
// 時程（全部只用 H8.now()＝以主控端時鐘為準的秒數與固定種子的雜湊，沒有 Math.random；每台算出一樣的結果；不依賴任何地圖座標，地圖擴大後照樣適用）：
//   ・時間軸切成每段 SLOT 秒（約 3.2 個遊戲日；遊戲一天＝24 分鐘＝1440 秒）；每段恰好一場雨，開始點落在段內前 1 個遊戲日裡（雜湊）。
//     所以相鄰兩場雨的間隔在約 2.3～4.3 個遊戲日之間，平均約 3.2 個遊戲日，雨不會疊在一起。
//   ・每場雨現實 300～480 秒（5～8 分鐘），開始與結束各漸變 30 秒（smoothstep），尖峰雨量 0.8～1.0。
//   ・約三成的雨是雷雨：高原期（雨量穩在尖峰）每 45 秒一格，每格 60% 機率打一道雷（時間點、方位、距離都由雜湊決定）。
// 規則一：雨中野獸察覺距離 ×0.8（雨量 ≥0.5 全效，漸變中照比例）—— H8.provide('senseK')。新野獸（beastai07）由 P2 自己乘 H8.fn.senseK(w)。
// 規則二：雨中捕獸夾的鐵光看不到 —— 在 traps07.js（交補丁），讀 rain08.js 的 glintR08()／rain08State().glint。
// 不做：雨天限定的魚／任務／素材、營火澆熄、雷嚇到牛群（定案第 5 節）。
import * as H8 from './hooks08.js';

export const WX08 = {
  SLOT: 4608,            // 一段的秒數（3.2 個遊戲日）
  JIT: 1440,             // 雨的開始點落在段內的 [0, JIT) 秒
  DUR: [300, 480],       // 一場雨的長度（秒）
  RAMP: 30,              // 開始與結束各漸變幾秒
  PEAK: [0.8, 1.0],      // 尖峰雨量
  STORM: 0.3,            // 雷雨的比例
  CELL: 45, THUNDER_P: 0.6,   // 高原期每 45 秒一格、每格 60% 打雷
  SENSE: 0.8,            // 雨中察覺距離倍率
  SENSE_FULL: 0.5,       // 雨量到這個值時倍率全效
  DIST: [520, 1700],     // 雷離聽者的距離（公尺）；聲音晚 dist/343 秒（夾在 1.5～5 秒），< NEAR 算近雷
  NEAR: 900
};

// 固定種子的雜湊：(整數, 用途) → [0,1)
function hash(n, salt) {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t, sm = t => (t = t < 0 ? 0 : t > 1 ? 1 : t, t * t * (3 - 2 * t));

// 第 n 段的那場雨（純函式）
export function stormOf(n) {
  const W = WX08, start = n * W.SLOT + hash(n, 1) * W.JIT, dur = lerp(W.DUR[0], W.DUR[1], hash(n, 2));
  return { n, start, end: start + dur, dur, peak: lerp(W.PEAK[0], W.PEAK[1], hash(n, 3)), thunder: hash(n, 4) < W.STORM };
}
// 這場雨在時刻 t 的雨量
function levelOf(s, t) {
  if (t <= s.start || t >= s.end) return 0;
  return s.peak * Math.min(sm((t - s.start) / WX08.RAMP), sm((s.end - t) / WX08.RAMP));
}
// 一場雷雨的雷（高原期的格子）：回傳 [{ t, az, dist }]，t 由小到大
export function thundersOf(s) {
  const out = []; if (!s.thunder) return out; const W = WX08, a = s.start + W.RAMP, b = s.end - W.RAMP, c0 = Math.ceil(a / W.CELL);
  for (let c = c0; (c + 1) * W.CELL <= b; c++) {
    const id = s.n * 1000 + (c - c0); if (hash(id, 5) >= W.THUNDER_P) continue;
    out.push({ t: c * W.CELL + hash(id, 6) * W.CELL * 0.55, az: (hash(id, 7) * 2 - 1) * Math.PI, dist: lerp(W.DIST[0], W.DIST[1], hash(id, 8)) });
  }
  return out;
}
const stormAt = t => { const n = Math.floor(t / WX08.SLOT); return [stormOf(n - 1), stormOf(n)]; };   // 前一段的雨可能跨進這一段

// ---- 純時鐘版本（node 測試與 weather() 共用）----
export function rainAt(t) { let k = 0; for (const s of stormAt(t)) k = Math.max(k, levelOf(s, t)); return k; }
export function stormNow(t) { for (const s of stormAt(t)) if (t > s.start && t < s.end) return s; return null; }
export function nextStorm(t) { const n = Math.floor(t / WX08.SLOT); for (let i = n - 1; i <= n + 2; i++) { const s = stormOf(i); if (s.end > t) return s; } return null; }
export function nextThunder(t) {
  const n = Math.floor(t / WX08.SLOT);
  for (let i = n - 1; i <= n + 40; i++) { const s = stormOf(i); if (!s.thunder || s.end < t) continue; for (const th of thundersOf(s)) if (th.t >= t) return th; }
  return null;
}

/* ============================== 遊戲裡 ============================== */
const S = { force: null, k: 0, shown: -1, shownTh: null, lastT: null, flashT: -1e9, q: [], ctx: null, W: null, ui: null, cur: null };
const nowT = () => H8.now();
export const rain = () => S.force != null ? S.force : rainAt(nowT());
// next()：下一場雨（正在下就是這一場）{ start, end, dur, peak, thunder }（H8.now() 基準），測試用
export const next = () => nextStorm(nowT());
// weather()：{ rain 0..1, thunderAt 下一道雷（H8.now() 基準）| null, flash 0..1 }
export function weather() {
  const t = nowT(), th = S.force != null ? null : nextThunder(t), f = t - S.flashT;
  return { rain: rain(), thunderAt: th ? th.t : null, flash: f >= 0 && f < 0.7 ? Math.max(0, Math.exp(-f / 0.12)) : 0 };
}
// 現在這場是不是雷雨（weather:change 的 thunder 欄位）
const isStorm = t => S.force != null ? S.force >= 0.8 && S.thunderForce === true : !!(stormNow(t) || {}).thunder;

// 規則一：雨中野獸察覺距離倍率
export const senseK = () => { const k = rain(); return 1 - (1 - WX08.SENSE) * Math.min(1, k / WX08.SENSE_FULL); };

function fireThunder(th, forceDelay) {
  const R = S.W && S.W.rain08, me = S.ctx && S.ctx.me;
  const delay = forceDelay != null ? forceDelay : Math.min(5, Math.max(1.5, th.dist / 343));
  if (R && R.thunder08) { try { R.thunder08({ az: th.az, delay }); } catch (e) { console.error('[weather08] thunder08', e); } }
  S.flashT = nowT();
  const x = me ? me.x + Math.sin(th.az) * th.dist : 0, z = me ? me.z + Math.cos(th.az) * th.dist : 0;
  H8.emit('weather:thunder', { x, z, dist: th.dist, delay });
  S.q.push({ at: performance.now() + delay * 1000, tag: th.dist < WX08.NEAR ? 'near' : 'far', x, z });   // 雷聲晚 delay 秒
}

H8.provide('senseK', senseK, 'P4');

H8.on('init', ctx => {
  S.ctx = ctx; S.W = ctx.W; S.ui = ctx.ui;
  S.lastT = nowT();
  if (typeof window !== 'undefined' && window.__dev07) {      // 測試指令（介面08 第 9 節）
    const d = window.__dev08 = window.__dev08 || {};
    d.rain = k => { S.force = k == null ? null : Math.max(0, Math.min(1, +k)); S.thunderForce = false; return { rain: rain(), forced: S.force != null }; };
    d.thunder = (dist = 700) => { fireThunder({ az: 0.5, dist }); return true; };
    d.weather = () => Object.assign(weather(), { sense: senseK(), next: next() });
  }
});

H8.on('frame', dt => {
  const t = nowT(), k = rain(), W = S.W, R = W && W.rain08;
  // 畫面：把目標雨量交給 rain08（它自己再漸變約 25 秒）；剛進遊戲時（第一次）直接到位
  if (Math.abs(k - S.shown) > 0.004 || (k === 0) !== (S.shown === 0)) {
    const first = S.shown < 0; S.shown = k; if (R && R.setRain08) R.setRain08(k, first);
    if (W) W.weatherRain08 = k;      // 給 main.js 的 GA.setZone(…, { water, rain }) 讀（見報告）
  }
  const st = isStorm(t);
  if (Math.abs(k - (S.cur ? S.cur.rain : -1)) >= 0.05 || (k === 0) !== (S.cur ? S.cur.rain === 0 : false) || (S.cur && S.cur.thunder !== st)) {
    S.cur = { rain: k, thunder: st }; H8.emit('weather:change', { rain: k, thunder: st });
  }
  // 雷：從上一幀到現在之間排定的雷（用時鐘算；離上次檢查超過 3 秒——分頁在背景、剛進遊戲——就不補放）
  if (S.force == null) {
    const a = S.lastT, s = stormNow(t);
    if (s && s.thunder && t - a < 3) for (const th of thundersOf(s)) if (th.t > a && th.t <= t) fireThunder(th);
  }
  S.lastT = t;
  // 雷聲的延遲播放
  if (S.q.length) { const pn = performance.now(); for (let i = S.q.length - 1; i >= 0; i--) { const e = S.q[i]; if (pn >= e.at) { S.q.splice(i, 1); try { if (S.ui && S.ui.sfx) S.ui.sfx('thunder', 0, { x: e.x, z: e.z, tag: e.tag }); } catch (er) {} } } }
});
