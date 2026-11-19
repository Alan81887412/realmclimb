/* 快照插值（F5，11-20）：遠端玩家與野獸主控同步共用。
   做法：每一筆收到的位置記一個「對方取樣時間（換算成本機時鐘）」，畫面固定比最新快照晚 D 毫秒，
   在兩個快照之間做線性插值（朝向用角度插值）；缺資料時用最後的速度外推，最多 EXT_MAX 毫秒，之後停住；
   大跳躍（瞬移、復活、傳送、距離遠到不可能走到）直接跳過去不插值。
   D 自動依「快照間隔」與「到達晚點量」調整（夾在 D_MIN～D_MAX），變動速率受限，不會讓播放速度忽快忽慢。
   註解只用區塊註解。 */
export const EXT_MAX = 250, D_MIN = 100, D_MAX = 300, KEEP = 2500;
const TAU = Math.PI * 2;
const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return a + d * k; };

export function makeBuf() { return { a: [], n: 0 }; }
/* 加一筆：t 本機時鐘毫秒；mv＝這一刻是不是在移動中（決定結尾能不能外推）；opt.maxSpd／opt.maxD 判斷跳躍 */
export function pushSnap(buf, t, x, z, f, mv, opt) {
  const a = buf.a, o = opt || {}, L = a.length ? a[a.length - 1] : null;
  if (L && t <= L.t) { if (t === L.t) { L.x = x; L.z = z; L.f = f; L.mv = mv; return false; } /* 亂序（較舊的）：丟掉 */ return false; }
  let jump = !L;
  if (L) { const d = Math.hypot(x - L.x, z - L.z), dt = (t - L.t) / 1000; jump = o.force || d > (o.maxD || 40) || (d > (o.minJump || 6) && d / Math.max(dt, 0.001) > (o.maxSpd || 28)) || (dt > 1.0 && d > 3); }
  a.push({ t, x, z, f, mv: !!mv, jump }); buf.n = a.length;
  while (a.length > 2 && t - a[1].t > KEEP) a.shift();
  return true;
}
/* 取 renderT（本機毫秒）時的位置。回傳 out = { x, z, f, vx, vz, mode: 0 內插｜1 外推｜2 停住｜3 還沒到第一筆 } */
export function sampleAt(buf, rT, out) {
  const a = buf.a, n = a.length; if (!n) return null;
  if (rT <= a[0].t) { const s = a[0]; out.x = s.x; out.z = s.z; out.f = s.f; out.vx = out.vz = 0; out.mode = 3; return out; }
  const L = a[n - 1];
  if (rT >= L.t) {
    out.x = L.x; out.z = L.z; out.f = L.f; out.vx = out.vz = 0; out.mode = 2;
    if (n >= 2 && L.mv && !L.jump) { const P = a[n - 2], dt = (L.t - P.t) / 1000; if (dt > 0.02 && dt < 0.8) { const e = Math.min(rT - L.t, EXT_MAX) / 1000, vx = (L.x - P.x) / dt, vz = (L.z - P.z) / dt; out.x = L.x + vx * e; out.z = L.z + vz * e; out.f = L.f; out.vx = vx; out.vz = vz; out.mode = rT - L.t < EXT_MAX ? 1 : 2; if (out.mode === 2) { out.vx = out.vz = 0; } } }
    return out;
  }
  let i = n - 2; while (i > 0 && a[i].t > rT) i--;
  const A = a[i], B = a[i + 1];
  if (B.jump) { out.x = A.x; out.z = A.z; out.f = A.f; out.vx = out.vz = 0; out.mode = 2; return out; }
  const k = (rT - A.t) / (B.t - A.t), dt = (B.t - A.t) / 1000;
  out.x = A.x + (B.x - A.x) * k; out.z = A.z + (B.z - A.z) * k; out.f = angLerp(A.f, B.f, k); out.vx = (B.x - A.x) / dt; out.vz = (B.z - A.z) / dt; out.mode = 0; return out;
}

/* 延遲控制：note(收到一筆快照的 本機到達時間, 它換算的快照時間)；D(dt) 每幀呼叫回傳目前的延遲（毫秒） */
export function makeLag() { return { D: 0, tgt: 0, gaps: [], lates: [], lastT: 0, init: false }; }
export function lagNote(L, snapT, late) {
  if (L.lastT) { const g = snapT - L.lastT; if (g > 0 && g < 700) { L.gaps.push(g); if (L.gaps.length > 16) L.gaps.shift(); } }
  L.lastT = snapT; L.lates.push(Math.max(0, late || 0)); if (L.lates.length > 32) L.lates.shift();
  /* 間隔取 75 百分位（偶爾一次長間隔不要把延遲墊高）；晚點取 平均＋1.5 倍標準差（網路／主執行緒偶發的尖峰交給外推去補） */
  let G = 120; if (L.gaps.length) { const a = L.gaps.slice().sort((x, y) => x - y); G = a[Math.min(a.length - 1, Math.floor(a.length * 0.75))]; }
  let Lt = 0; if (L.lates.length) { const n = L.lates.length, m = L.lates.reduce((x, y) => x + y, 0) / n, sd = Math.sqrt(L.lates.reduce((x, y) => x + (y - m) * (y - m), 0) / n); Lt = m + 1.5 * sd; }
  L.tgt = Math.min(D_MAX, Math.max(D_MIN, 0.9 * G + Lt + 15)); if (!L.init) { L.init = true; L.D = L.tgt; }
}
export function lagStep(L, dt) {
  if (!L.init) return 150;
  const up = 120 * dt, dn = 30 * dt; if (L.tgt > L.D) L.D = Math.min(L.tgt, L.D + up); else L.D = Math.max(L.tgt, L.D - dn);
  return L.D;
}
