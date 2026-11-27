/* 熊的威嚇動作（11-20 修正：F3）。棕熊與菁英老疤共用（creatures.js 的 WARN 狀態在 type === 'bear' 時呼叫 bearThreat08）。
   兩個版本用參數切換：網址 ?bearthreat=A｜B、或執行時設 window.__bearThreat = 'A'｜'B'；預設 A。
   A「人立威嚇」：後腳站起、身體前傾約 15°，前肢手肘彎曲、掌心朝前下、爪子朝前，位在胸前到肩高；頭前伸壓低、肩聳起；每隔一陣舉掌過頭再往前下拍空一次。
   B「四足威嚇」：四足著地、前身壓低，頭左右甩，前掌輪流抬起重重踏地（踏地瞬間在 m.fx8 排一筆 dust），鼻孔不時噴白氣（排 breath）；game.js 取走後用 emit 畫粒子。
   全程閉嘴（T.jaw 不給）。前肢的手掌位置／朝向用「身體座標（含朝向，單位同模型）」直接指定（m.xa，solveLegs 讀），不再靠胸骨座標的 air()，
   所以身體怎麼傾，手都不會跟著被轉到怪方向；IK 長度夾在 a+b 以內，前肢不會比原本長。 */
const PI = Math.PI, sin = Math.sin, cos = Math.cos, TAU = PI * 2, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }, lerp = (a, b, t) => a + (b - a) * t;
export const BT = {
  /* A：lean＝rear 通道值（×rearK 1.2 ＝ 身體從水平抬起的弧度）；hold＝手掌（掌心點）相對肩關節的位置 x 外、y 上、z 前（模型單位，臂長 a+b≈0.5）與掌俯仰 */
  A: { rear: 1.02, bz: -0.1, by: -0.01, np: 0.88, hp: -0.2, cp: 0.1, pp: -0.03, hold: { x: 0.02, y: 0.0, z: 0.33, p: -0.55, r: 0.25 }, period: 2.1, first: 1.25 },
  B: { by: -0.12, bp: 0.07, np: 0.27, hp: -0.2, period: 1.5 },
};
export const mode = () => { let q = null; try { q = (globalThis.__bearThreat || new URLSearchParams(globalThis.location.search).get('bearthreat') || 'A'); } catch (e) { q = 'A'; } return String(q).toUpperCase() === 'B' ? 'B' : 'A'; };
const ensure = m => m.xa || (m.xa = { w: 0, on: false, x: [0, 0], y: [0, 0], z: [0, 0], p: [0, 0], r: [0, 0] });
const hand = (X, s, x, y, z, p, r) => { X.x[s] = x; X.y[s] = y; X.z[s] = z; X.p[s] = p; X.r[s] = r; };
const push = (m, o) => { const q = m.fx8 || (m.fx8 = []); if (q.length < 8) q.push(o); };

/* T：animCreature 的目標姿勢（會再被平滑）；p：進入威嚇後的秒數；回傳 rate（姿勢平滑的速度） */
export function bearThreat08(m, T, t, p) {
  const X = ensure(m), md = mode(), seed = m.seed || 0;
  if (md === 'B') return threatB(m, T, t, p, X, seed);
  const A = BT.A, r = sm(0, 0.85, p), sw = sin(t * 1.3 + seed), hu = sin(t * 2.1 + seed);
  /* 舉掌過頭＋拍下：週期 period，第一次在 first 秒；u 0→1 一個循環 */
  const cu = p - A.first, u = cu < 0 ? -1 : (cu % A.period) / A.period, rise = u < 0 ? 0 : sm(0, 0.3, u) * (1 - sm(0.36, 0.42, u)), down = u < 0 ? 0 : sm(0.4, 0.46, u) * (1 - sm(0.5, 0.64, u)), hit = u < 0 ? 0 : sm(0.44, 0.48, u) * (1 - sm(0.5, 0.62, u));
  T.rear = A.rear * r - 0.1 * hit + 0.02 * sw; T.bz = A.bz * r; T.by = A.by * r - 0.03 * hit; T.bw = 0.07 * sw * r; T.br = 0.025 * hu * r;
  T.np = A.np * r + 0.18 * hit - 0.05 * rise; T.hp = A.hp * r - 0.1 * hit; T.hw = 0.1 * sin(t * 0.9 + seed * 2) * r; T.cp = A.cp * r + 0.06 * hit; T.pp = A.pp * r; T.cw = -0.05 * sw * r;
  T.sq = 3 * hu * r * 0.4; T.eL = T.eR = 0.8 * r; T.mane = 0.6 * r;
  const h = A.hold, w = r * r;      /* 手臂在身體抬起的後半段才到位 */
  for (let s = 0; s < 2; s++) {
    const sd = s ? 1 : -1, ph = s * 0.3, br = 0.03 * sin(t * 2.4 + ph + seed), x = lerp(0.1, h.x, w) + 0.1 * rise + 0.06 * down + br, y = lerp(-0.2, h.y, w) + 0.26 * rise - 0.5 * down + 0.025 * sin(t * 1.9 + ph), z = lerp(0.25, h.z, w) - 0.02 * rise + 0.08 * down + 0.02 * sin(t * 2.2 + ph);
    hand(X, s, x, y, z, lerp(-0.3, h.p, w) - 0.3 * rise + 1.0 * down, lerp(0.1, h.r, w) * (1 - 0.8 * (rise + down)));
  }
  X.on = true; X.k = 6;
  return 9;
}

function threatB(m, T, t, p, X, seed) {
  const B = BT.B, r = sm(0, 0.6, p), q = (t * (1 / B.period) + seed * 0.13) % 1, s2 = Math.floor(t / B.period + seed * 0.13) % 2;
  const sh = sin(t * 2.5 + seed), sh2 = sin(t * 2.5 + seed - 0.7);      /* 頭左右甩（頭先到、身體慢半拍）*/
  T.by = B.by * r; T.bp = B.bp * r; T.bz = -0.04 * r; T.np = B.np * r; T.hp = B.hp * r; T.nw = 0.28 * sh * r; T.hw = 0.5 * sh * r; T.bw = 0.12 * sh2 * r; T.cw = 0.1 * sh2 * r; T.cr = 0.05 * sh * r; T.br = 0.04 * sh2 * r;
  T.pp = -0.05 * r; T.cp = 0.1 * r; T.eL = T.eR = 1 * r; T.mane = 1 * r; T.tp = 0.2 * r; T.sq = 2.5 * sin(t * 6) * r;
  /* 前掌輪流踏地：抬起（0–0.55）→ 往下砸（0.55–0.68）→ 停住壓住（0.68–1）；砸到地的瞬間排一筆塵土 */
  const o = s2, lift = sm(0, 0.5, q) * (1 - sm(0.55, 0.66, q)), hit = sm(0.6, 0.7, q) * (1 - sm(0.82, 1, q));
  const base = o ? 8 : 0;
  T.L[base] += 0; T.L[base + 1] += 0.44 * lift; T.L[base + 2] += 0.3 * lift - 0.05 * hit; T.L[base + 7] += -0.5 * lift + 0.35 * hit;
  T.by -= 0.04 * hit * r; T.bp += 0.05 * hit * r; T.np += 0.1 * hit * r;
  if (r > 0.9) { const k = Math.floor(t / B.period + seed * 0.13); if (q >= 0.66 && m._b8hit !== k) { m._b8hit = k; push(m, { k: 'dust', s: o }); }
    const bk = Math.floor(t * 2.6 + seed); if (m._b8br !== bk) { m._b8br = bk; push(m, { k: 'breath' }); } }
  X.on = false;
  return 9;
}

/* game.js 每次 animCreature 之後呼叫：把 m.fx8 排的粒子畫出來（emit＝fx.js 的 emit；粒子的位置取骨頭世界座標）。測試台沒有 fx.js 時由測試台自己實作 */
const _v = { x: 0, y: 0, z: 0 };
export function bearFx08(m, emit, wp) {
  const q = m.fx8; if (!q || !q.length) return; m.fx8 = [];
  for (const e of q) {
    if (e.k === 'dust') { const b = m.bones.find(b => b.name === 'leg' + e.s + 'c'); if (!b) continue; wp(b, _v); emit(_v.x, _v.y + 0.1, _v.z, 9, [0.72, 0.6, 0.42], 2.4, 1.4, 0.7, 2); }
    else if (e.k === 'breath') { const b = m.bones.find(b => b.name === 'head'); if (!b) continue; wp(b, _v, 0.22, -0.12, 0.34); emit(_v.x, _v.y, _v.z, 3, [0.96, 0.97, 1.0], 0.6, 0.55, 0.75, -0.3); }
  }
}
