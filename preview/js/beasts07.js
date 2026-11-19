// 0.7 新野獸「樣品」：野牛、沼蟒、斷鍊鬥犬（0.8 才進遊戲；這個檔案只給樣品圖用，遊戲不會載入）
// 做法和 creatures.js 的圓潤版完全一樣（同一套建模工具，從 props07.js 的 KIT 取用），物種函式的寫法照 SOFT.<物種>，0.8 可以直接搬進 creatures.js。
// 參考：野牛＝肩峰高聳、頭低垂抬不過肩、前半身（頭、頸、肩、前腿）是深色的長捲毛、後半身短毛較淺、短而往上彎的黑角、下巴有鬍子、要衝撞前會翹尾巴（Britannica）。
//       沼蟒＝緬甸蟒的花紋：淺褐底上一塊塊黑邊的深褐斑、頭頂深色、一道淺色紋從鼻尖經過眼睛往後（佛州自然史博物館）；改成沼澤的苔綠。
//       鬥犬＝鬥牛犬／獒犬體型：寬頭、短吻、厚頸、深胸、短毛虎斑；戴釘刺鐵項圈，鍊子斷了一截還掛著（斷鍊之夜從競技場獸欄逃出來的）。
import * as THREE from './three.bundle.js';
import { KIT } from './props07.js';
import { beastFinish08 } from './beastfx08.js';
import { getModel08, VISK08 } from './model08_boar.js';
const { Part, ball, tubeP, place, push, mirrorX, finish, blendN, surf, spike, tuft: tuftK, cone, horn, ridge, rgb, cov, ink, put, h2, wedge, occl, buildSoft, softSkel, legSk, quatOf, skMix, B, add3, sub3, cross3, dot3, norm3, mid3, fall, TAU, clamp, lerp, smooth } = KIT;
const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, hyp = Math.hypot;
const SOFT = {};
function mirrorP(src, name, refl) { const pt = new Part(name, src.nu, src.nv), nu = src.nu, Wd = nu + 1;
  for (let j = 0; j <= src.nv; j++) for (let i = 0; i <= nu; i++) { const a = (j * Wd + i) * 3, b = (j * Wd + nu - i) * 3, q = refl([src.P[b], src.P[b + 1], src.P[b + 2]]); pt.P[a] = q[0]; pt.P[a + 1] = q[1]; pt.P[a + 2] = q[2]; }
  pt.share = src; pt.uflip = true; pt.tex = src.tex; pt.glow = src.glow; pt.flat = src.flat; pt.rows = src.rows; pt.sk = src.sk; return pt; }
// 環（鍊子的一節、項圈）：圓心 c、兩個軸 a、b（單位向量）、兩個半徑、管子粗細
function ringPart(name, c, a, b, R1, R2, rx, ry = rx, nu = 6, arc = 1) { const keys = [], n = 14; for (let i = 0; i <= n; i++) { const t = i / n * TAU * arc; keys.push({ p: add3(add3(c, a, cos(t) * R1), b, sin(t) * R2), rx, ry }); } return tubeP(name, nu, keys, arc < 1 ? { nv: 25, ref: cross3(a, b), capA: rx * 0.8, capB: rx * 0.8, capN: 2 } : { nv: 29, ref: cross3(a, b) }); }

/* ---------- 0.7 招式的姿勢（creatures.js 的 animCreature 算完共用動作後呼叫 S.pose，直接改目標姿勢 T） ---------- */
const LEGO = { FL: 0, FR: 8, RL: 16, RR: 24 }, legT = (T, o, x, y, z, fp = 0) => { T.L[o] += x; T.L[o + 1] += y; T.L[o + 2] += z; T.L[o + 7] += fp; };
// 野牛：撞暈（頭晃圈、腳岔開、眼睛半閉、舌頭吐出來）｜角挑（頭壓低偏一邊 → 往上甩）
function poseBison(T, q) {
  const { st, p, t, an, act, sd } = q;
  // d7-av-bison（製作人 14:38）：平常站著、走路、追、逃、收招時抬頭看人（頸線約和背線同高或略低）；
  //   吃草改成閒置時偶爾低頭一陣子（S.graze 關掉共用的吃草，這裡用較少出現的節奏自己做）；鬥牛衝的蓄力與衝刺、角挑、後踢、撞暈沿用原本的低頭姿勢
  if (st === 0 || st === 1 || st === 7 || st === 8 || (st === 4 && an !== 'daze')) { const c = q.calm || 0, ph = (q.m && q.m.seed || 0) * 1.7, w = 0.5 + 0.5 * Math.sin(t * 0.045 + ph) * Math.sin(t * 0.019 + ph * 2.3 + 1.1), gz = smooth(0.8, 0.88, w) * c;
    T.np += -0.36 * (1 - gz) + 0.72 * gz; T.hp += -0.05 * (1 - gz) + 0.3 * gz; T.cp += 0.04 * gz; T.jaw += gz * Math.max(0, sin(t * 6.5)) * 0.22; T.hw += gz * sin(t * 1.3) * 0.1; }      // d8-art：偶爾吃草時嘴要碰到草（0.3／0.22 只低到腳的一半高，看不出在吃草）
  if (an === 'daze' && st === 4) { const w = Math.min(1, p / 0.25); T.hw = 0.38 * sin(t * 3.4) * w; T.nw = 0.15 * sin(t * 3.4 - 0.6) * w; T.hr = 0.28 * sin(t * 3.4 + 1.2) * w; T.np = 0.32 * w; T.hp = (0.18 + 0.1 * sin(t * 2.2)) * w; T.br = 0.07 * sin(t * 2.4) * w; T.bw = 0.04 * sin(t * 1.7); T.by -= 0.06 * w; T.jaw = 0.32 * w; T.eye = 1 - 0.55 * w; T.brow = -0.3; T.pup = 1.45; T.tp = -0.35 * w; T.eL = T.eR = -0.4 * w;
    legT(T, LEGO.FL, 0.07 * w, 0, 0.05 * w); legT(T, LEGO.FR, 0.07 * w, 0, 0.05 * w); legT(T, LEGO.RL, 0.05 * w, 0, -0.03 * w); legT(T, LEGO.RR, 0.05 * w, 0, -0.03 * w); return; }
  if (an === 'toss') { if (st === 2) { const e = smooth(0, 1, p / Math.max(0.05, act.wind)); T.np = 0.38 * e; T.hp = 0.22 * e; T.hw = -0.28 * e * sd; T.nw = -0.15 * e * sd; T.bz = -0.07 * e; T.by -= 0.04 * e; T.tp = 1.2; legT(T, LEGO.FL, 0.03, 0, 0.08 * e); legT(T, LEGO.FR, 0.03, 0, 0.08 * e); }
    else if (st === 3) { const s = clamp(p / Math.max(0.05, act.strike), 0, 1), e = smooth(0, 1, s); T.np = lerp(0.38, -0.45, e); T.hp = lerp(0.22, -0.4, e); T.hw = lerp(-0.28, 0.42, e) * sd; T.nw = lerp(-0.15, 0.2, e) * sd; T.bz = 0.14 * e; T.by += 0.05 * sin(PI * s); T.bp = -0.08 * sin(PI * s); T.jaw = 0.25; legT(T, LEGO.RL, 0, 0, -0.1 * e); legT(T, LEGO.RR, 0, 0, -0.1 * e); } }
}
// 鬥犬：咬住之後拖（嘴咬緊、頭左右甩、身體往後坐、後腳撐地）｜吠叫（嘴一開一合連吠）
function poseDog(T, q) {
  const { st, p, t, an, v } = q;
  // d8-art-dog：鐵牙的長鍊（chain0–chain4）。每一幀用世界座標做一條 6 個點的鍊子（Verlet：重力、地面摩擦＝拖在地上），再轉成骨頭的旋轉。
  //   斷鍊鞭：act.anim === 'whip'（P2 的招式用這個名字；預備 st 2＝頭往一側扭、鍊子收到身側後方，出手 st 3＝頭甩過去、鍊子貼地掃一個扇形到另一側，收招後鍊子靠慣性落地）
  const m = q.m, CHN = m && m.sp.D.chain;
  if (CHN) { const Bn = m.bones, ids = CHN.ids, R = CHN.rest, n = ids.length; let S = m.chS;
    if (!S) S = m.chS = { P: [], O: [], t, v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), qp: new THREE.Quaternion(), qr: new THREE.Quaternion(), qi: new THREE.Quaternion(), ok: false };
    const sc = m.root.scale.x, gy = m.root.position.y + 0.045 * sc, dt = Math.min(1 / 20, Math.max(0, t - S.t)); S.t = t;
    Bn[ids[0]].getWorldPosition(S.v); m.rig.getWorldQuaternion(S.qr); const P = S.P, O = S.O, ax = S.v.x, ay = S.v.y, az = S.v.z;
    if (!S.ok || m.snap || hyp(P[0] - ax, P[2] - az) > 4) { for (let k = 0; k <= n; k++) { S.w.set(R[k][0] - R[0][0], R[k][1] - R[0][1], R[k][2] - R[0][2]).multiplyScalar(sc).applyQuaternion(S.qr); P[k * 3] = O[k * 3] = ax + S.w.x; P[k * 3 + 1] = O[k * 3 + 1] = Math.max(gy, ay + S.w.y); P[k * 3 + 2] = O[k * 3 + 2] = az + S.w.z; } S.ok = true; }
    P[0] = O[0] = ax; P[1] = O[1] = ay; P[2] = O[2] = az;
    const Ls = []; for (let k = 0; k < n; k++) Ls.push(hyp(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1], R[k + 1][2] - R[k][2]) * sc);
    if (dt > 0) for (let k = 1; k <= n; k++) { const i = k * 3, gnd = P[i + 1] <= gy + 0.01, fr = gnd ? 0.55 : 0.985; let vx = (P[i] - O[i]) * fr, vy = (P[i + 1] - O[i + 1]) * 0.985, vz = (P[i + 2] - O[i + 2]) * fr; O[i] = P[i]; O[i + 1] = P[i + 1]; O[i + 2] = P[i + 2]; P[i] += vx; P[i + 1] += vy - 16 * dt * dt; P[i + 2] += vz; }
    // 斷鍊鞭：把每一節往「扇形上的目標」拉（拉力夠大、但保留速度，放手後會自己甩出去落地）
    const act = q.act, lash = (an === 'whip') && act && (st === 2 || st === 3);
    if (lash && dt > 0) { const yaw = m.root.rotation.y, sd = q.sd || 1, s3 = st === 3 ? clamp(p / Math.max(0.05, act.strike), 0, 1) : 0, e2 = st === 2 ? smooth(0, 1, p / Math.max(0.05, act.wind)) : 1;
      const ang = st === 2 ? yaw - sd * (1.2 + 1.0 * e2) : yaw - sd * lerp(2.2, -2.0, smooth(0, 1, s3)), pull = st === 2 ? 0.12 * e2 : 0.45 * (1 - smooth(0.85, 1, s3)); let acc = 0;
      for (let k = 1; k <= n; k++) { acc += Ls[k - 1]; const a = ang + sd * 0.16 * k * (st === 3 ? 1 : 0), i = k * 3, tx = ax + sin(a) * acc * 0.95, tz = az + cos(a) * acc * 0.95, ty = gy + (ay - gy) * (st === 3 ? 0.55 : 0.35) * (1 - k / (n + 1));
        P[i] += (tx - P[i]) * pull; P[i + 1] += (ty - P[i + 1]) * pull; P[i + 2] += (tz - P[i + 2]) * pull; } }
    for (let it = 0; it < 6; it++) for (let k = 0; k < n; k++) { const i = k * 3, j = i + 3, dx = P[j] - P[i], dy = P[j + 1] - P[i + 1], dz = P[j + 2] - P[i + 2], d = hyp(dx, dy, dz) || 1e-6, e = (d - Ls[k]) / d, wi = k ? 0.5 : 0, wj = 1 - wi;
      P[i] += dx * e * wi; P[i + 1] += dy * e * wi; P[i + 2] += dz * e * wi; P[j] -= dx * e * wj; P[j + 1] -= dy * e * wj; P[j + 2] -= dz * e * wj; if (P[j + 1] < gy) P[j + 1] = gy; }
    // 轉成骨頭：第 k 根骨頭的世界旋轉＝把（身體朝向下的）原本方向轉到現在這一段的方向；本地旋轉＝父骨頭世界旋轉的反＋這個
    Bn[ids[0]].parent.getWorldQuaternion(S.qp);
    for (let k = 0; k < n; k++) { const i = k * 3; S.w.set(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1], R[k + 1][2] - R[k][2]).normalize().applyQuaternion(S.qr); S.v.set(P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]).normalize();
      S.q.setFromUnitVectors(S.w, S.v).multiply(S.qr); Bn[ids[k]].quaternion.copy(S.qi.copy(S.qp).invert().multiply(S.q)); S.qp.copy(S.q); } }
  // 斷鍊鞭的身體：預備時頭頸往一側扭、重心後移；出手時頭甩過去
  if (an === 'whip' && (st === 2 || st === 3) && q.act) { const sd = q.sd || 1;
    if (st === 2) { const e = smooth(0, 1, p / Math.max(0.05, q.act.wind)); T.hw = -0.55 * e * sd; T.nw = -0.35 * e * sd; T.bw = -0.18 * e * sd; T.np = 0.12 * e; T.bz = -0.06 * e; T.by -= 0.04 * e; T.jaw = 0.15; T.mane = 1; legT(T, LEGO.FL, 0.04 * sd, 0, 0.05 * e); legT(T, LEGO.FR, 0.04 * sd, 0, 0.05 * e); }
    else { const e = smooth(0, 1, clamp(p / Math.max(0.05, q.act.strike), 0, 1)); T.hw = lerp(-0.55, 0.6, e) * sd; T.nw = lerp(-0.35, 0.38, e) * sd; T.bw = lerp(-0.18, 0.22, e) * sd; T.np = 0.12; T.bz = 0.06 * e; T.jaw = 0.45; T.mane = 1; legT(T, LEGO.RL, 0, 0, -0.08 * e); legT(T, LEGO.RR, 0, 0, -0.08 * e); }
    return; }
  if (st === 4 && v && v.M && v.M.latch && !(v.act && v.act.whiff) && p < 1.15) { const w = Math.min(1, p / 0.12) * (1 - smooth(0.95, 1.15, p)); T.jaw = 0.02; T.hw = 0.5 * sin(t * 15) * w; T.nw = 0.22 * sin(t * 15 + 0.6) * w; T.hr = 0.2 * sin(t * 15 + 1.1) * w; T.np = 0.28 * w; T.hp = 0.12 * w; T.bz = -0.13 * w; T.by -= 0.07 * w; T.bp = 0.08 * w; T.tp = 0.7; T.mane = 1;
    legT(T, LEGO.RL, 0.03 * w, 0, -0.1 * w); legT(T, LEGO.RR, 0.03 * w, 0, -0.1 * w); legT(T, LEGO.FL, 0, 0, 0.06 * w); legT(T, LEGO.FR, 0, 0, 0.06 * w); return; }
  // 鐵牙的召集（act.anim === 'rally'，1.2 秒長吠）：預備時頭頸抬高、胸挺起來，出聲時嘴一張一合地拖長音（胸口起伏）
  if (an === 'rally' && (st === 2 || st === 3) && q.act) { const e = st === 2 ? smooth(0, 1, p / Math.max(0.05, q.act.wind)) : 1, h = st === 3 ? 0.5 + 0.5 * sin(t * 9) : 0;
    T.np = -0.62 * e; T.hp = -0.34 * e; T.bp = -0.07 * e; T.bz = -0.03 * e; T.by += 0.03 * e + 0.015 * h; T.jaw = st === 2 ? 0.25 * e : 0.42 + 0.3 * h; T.mane = 1; T.tp = 0.5 * e; legT(T, LEGO.FL, 0, 0, 0.05 * e); legT(T, LEGO.FR, 0, 0, 0.05 * e); legT(T, LEGO.RL, 0, 0, -0.04 * e); legT(T, LEGO.RR, 0, 0, -0.04 * e); return; }
  if (an === 'roar' && st === 3) { T.jaw = 0.25 + 0.6 * Math.abs(sin(p * 17)); T.np = -0.1 - 0.12 * Math.abs(sin(p * 17)); T.by += 0.02 * Math.abs(sin(p * 17)); T.hr = 0; }
}

/* ---------- 斷鍊鬥犬：比灰狼矮壯。寬大的方頭、短而寬的吻、下垂的嘴角、地包天露出下犬齒；剪短的耳朵（左耳被咬缺一角）；粗頸、深胸、腰收得很緊；
   短毛虎斑（褐底深色直紋）、黑色口罩、胸前一塊白；臉上、肩上有舊疤；釘刺鐵項圈，前面的鍊子斷了，還垂著三節 ---------- */
SOFT.dog = elite => {
  const K = { fur: rgb(0x2e2b30), furD: rgb(0x161418), furL: rgb(0x4e4952), cream: rgb(0xc7783a), creamD: rgb(0x8e4e24), dark: rgb(0x1e1410), mask: rgb(0x2a1b14), nose: rgb(0x120c0a), mouth: rgb(0x58161e), tongue: rgb(0xb84e5c), tooth: rgb(0xfff3da), toothD: rgb(0xd8c49c), claw: rgb(0x1c1410),
    iris: rgb(0xff8c1a), irisD: rgb(0xc2280a), pupil: rgb(0x0a0605), earIn: rgb(0x9a6656), scar: rgb(0xe0a294), iron: rgb(0x3e4046), ironL: rgb(0x8a8e98), rust: rgb(0x8a4826), spikeC: rgb(0xc8ccd4), leather: rgb(0x3a2216) };
  const E = !!elite, WD = elite === 'warden', IT = E && !WD, DOGP = 'A';      /* X4：WD＝獄卒長（深毛色與鞭痕同鐵牙；瞎眼、鐵牌、長鍊只有鐵牙 IT） */      // d8-art-dog：菁英「斷鍊・鐵牙」＝毛色更深（黑更黑、棕褐轉成暗紅褐）、右眼一道直疤（瞎了、灰白混濁）、胸前鐵牌（刻「鐵牙」＋馴獸師長的記號）、拖地的長鍊（5 節骨頭，poseDog 裡做物理與「斷鍊鞭」）
  if (E) Object.assign(K, { fur: rgb(0x221f26), furD: rgb(0x0e0c10), furL: rgb(0x433d4a), cream: rgb(0xa24c22), creamD: rgb(0x632c12), mask: rgb(0x150d0a), scar: rgb(0xd29684), blind: rgb(0xb4c2c4), blindD: rgb(0x7d8c90), plate: rgb(0xa8812f), plateL: rgb(0xf2d57e), plateD: rgb(0x3a2a0e), whip: rgb(0xe6b6a6), whipD: rgb(0x7c3a32), fang: rgb(0x8d95a2) });
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.8, 0.7], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const zz = (s, f) => { const q = s * f - Math.floor(s * f); return abs(q - 0.5) * 2; };
  const FJ = { j0: [0.26, 0.56, 0.28], j1: [0.27, 0.34, 0.18], j2: [0.27, 0.12, 0.26], pad: [0.27, 0, 0.32] }, RJ = { j0: [0.23, 0.58, -0.36], j1: [0.25, 0.37, -0.23], j2: [0.25, 0.17, -0.42], pad: [0.25, 0, -0.34] };
  const TK = [[0.74, -0.52, 0.055], [0.76, -0.66, 0.048], [0.72, -0.8, 0.04], [0.66, -0.92, 0.032], [0.58, -1.0, 0.024], [0.5, -1.05, 0.016]], TN = 4;
  const sk = softSkel({ body: [0, 0.66, -0.06], pelvis: [0, 0.67, -0.34], chest: [0, 0.68, 0.14], neck: [0, 0.76, 0.38], head: [0, 0.78, 0.54], jaw: hd(0, -0.17, 0.1), ear: hd(0.26, 0.22, -0.06), mane: [0, 0.97, 0.22], fl: FJ, rl: RJ, tail: TK.slice(0, TN).map(k => [0, k[0], k[1]]), mane2: [0, 1.0, 0.44] });
  const BN = sk.BN, Lg = i => B.leg + i * 3, mir = p => [-p[0], p[1], p[2]];

  /* ----- 頭：寬而方，頭頂平、兩頰的咬肌鼓起；吻短而寬、嘴角下垂 ----- */
  const head = ball('head', 26, 15, [0.47, 0.39, 0.38], { vmap: t => Math.pow(t, 1.15) });
  push(head, [0.35, -0.08, -0.04], 0.36, [0.1, 0.0, 0]);                         // 咬肌（兩頰往外鼓）
  push(head, [0, 0.36, -0.02], [0.52, 0.2, 0.46], [0, -0.05, 0]);                 // 頭頂壓平
  push(head, [0, 0.2, 0.3], [0.12, 0.14, 0.2], [0, -0.02, 0.0]);                  // 眉心一道溝
  push(head, [0.17, 0.13, 0.31], 0.17, [0.008, -0.02, 0.06]);                     // 眉骨（很重）
  push(head, [0.2, 0.02, 0.34], 0.1, [0, 0, -0.022]);                             // 眼窩
  push(head, [0, -0.08, 0.34], [0.3, 0.2, 0.22], [0, -0.01, 0.06]);               // 吻根
  place(head, HC); finish(head); head.sk = B.head; head.tex = [448, 288]; add(head);
  const eh = surf(head, HC, norm3([0.2, 0.02, 0.33])), ez = norm3(add3(eh.n, [0.08, 0, 0.5])), ex0 = norm3(cross3([0, 1, 0], ez)), ey0 = cross3(ez, ex0), cT = cos(0.28), sT = sin(0.28);
  const ex = [0, 1, 2].map(i => ex0[i] * cT + ey0[i] * sT), ey = [0, 1, 2].map(i => ey0[i] * cT - ex0[i] * sT), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  // 臉：虎斑底色，吻部與眼周是黑色口罩，下巴到喉嚨是白的
  // 臉（羅威那式的黑底棕褐斑）：吻的兩側與下巴、兩頰下半是棕褐色，鼻樑與頭頂是黑的，嘴唇黑
  const face = (c, x, y, z) => { const ax = abs(x); put(c, K.fur); ink(c, 0.4 * smooth(0.1, 0.35, ax) * smooth(0.12, -0.15, y), K.furL);
    const tan = Math.max(smooth(0.05, -0.01, y) * smooth(0.2, 0.28, z) * Math.max(smooth(0.05, 0.11, ax), smooth(-0.02, -0.07, y)), cov(h2((ax - 0.25) / 0.1, (y + 0.17) / 0.08) - 1, 0.2) * smooth(-0.05, 0.05, z)); ink(c, tan, K.cream); ink(c, 0.35 * tan * smooth(-0.1, -0.25, y), K.creamD);
    ink(c, 0.95 * smooth(0.44, 0.5, z) * smooth(-0.03, -0.1, y), K.mask); };
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x); face(c, x, y, z);
    // 頭頂與兩頰的虎斑紋
        if (z > 0.05 && y > -0.2 && y < 0.3) { const dx = ax - EC[0], dy = p[1] - EC[1], dz = p[2] - EC[2], a = dx * ex[0] + dy * ex[1] + dz * ex[2], b = dx * ey[0] + dy * ey[1] + dz * ey[2]; if (a * a + b * b < 0.07) ink(c, cov((h2(a / 0.1, b / 0.088) - 1) * 0.09, 0.005), K.dark); ink(c, cov((h2((a - 0.01) / 0.038, (b - 0.12) / 0.026) - 1) * 0.03, 0.005), K.cream); }
    // 舊疤：一道從右額頭斜劃過眼睛到右頰、一道短的在左吻側
    if (x < 0 && z > -0.05) { const a = (y - 0.04) * 0.86 + (x + 0.19) * 0.5, b = (x + 0.19) * 0.86 - (y - 0.04) * 0.5; ink(c, cov(Math.max(abs(b) - 0.016 * smooth(0.3, 0.1, abs(a)), abs(a) - 0.28), 0.004), K.scar); }
    if (n[1] < -0.2 && y < -0.18 && z > 0.05) ink(c, cov((h2(x / 0.1, (z - 0.24) / 0.18) - 1) * 0.1 + 0.004), K.mouth);
    if (IT && x < 0 && z > 0) { const a = p[1] - EC[1], b = p[0] + EC[0] + 0.22 * a, w = 0.026 * smooth(0.24, 0.02, abs(a + 0.02)); if (abs(a + 0.02) < 0.24) { ink(c, cov(abs(b) - w - 0.008, 0.004), K.mask); ink(c, cov(abs(b) - w, 0.004), K.scar); } } };      // 鐵牙：右眼一道直疤（從眉上到頰）
  // 吻部：短、寬、深；兩側的嘴唇往下垂（鬥犬的嘴角）
  const snout = tubeP('snout', 14, [{ p: hd(0, -0.075, 0.2), rx: 0.24, ry: 0.15, rd: 0.15 }, { p: hd(0, -0.085, 0.33), rx: 0.215, ry: 0.125, rd: 0.155, e: 0.8 }, { p: hd(0, -0.09, 0.44), rx: 0.19, ry: 0.105, rd: 0.135, e: 0.8 }], { nv: 6, capB: 0.07, capN: 2 });
  push(snout, [0.18, -0.22 + HC[1], 0.33 + HC[2]], 0.12, [0.025, -0.045, 0]);      // 垂下的嘴角
  snout.sk = B.head; snout.tex = [160, 96]; snout.blend = [head, 0.1]; add(snout);
  snout.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x); face(c, x, y, z);
    if (z > 0.46 && y < -0.06) ink(c, cov(ax - 0.006, 0.004), K.nose);
    ink(c, cov(y + 0.17 + 0.03 * smooth(0.4, 0.5, z) - 0.04 * smooth(0.2, 0.08, ax), 0.005) * smooth(0.18, 0.24, z), K.nose);
    if (x > 0 && z > 0.25 && y > -0.12) { const a = (z - 0.33) * 0.7 + (y + 0.03) * 0.7, b = (y + 0.03) * 0.7 - (z - 0.33) * 0.7; ink(c, cov(Math.max(abs(b) - 0.011, abs(a) - 0.07), 0.004), K.scar); } };
  // 下顎：寬、往前突一點（地包天）
  const JC = hd(0, -0.25, 0.31), jaw = ball('jaw', 12, 7, [0.165, 0.078, 0.19]); push(jaw, [0, 0.075, 0], [0.15, 0.07, 0.17], [0, -0.022, 0]); jaw.map(p => { p[0] *= 1 - 0.12 * smooth(-0.05, 0.18, p[2]); });
  place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [96, 64]; add(jaw);
  jaw.paint = (c, p) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.mask); ink(c, 0.7 * smooth(0.0, -0.06, y) * smooth(0.12, -0.05, z), K.cream);
    if (y > 0.012) { put(c, K.nose); ink(c, cov((h2(x / 0.13, z / 0.16) - 1) * 0.1), K.mouth); ink(c, cov((h2(x / 0.075, (z - 0.02) / 0.12) - 1) * 0.06), K.tongue); } };
  { const nose = ball('nose', 10, 5, [0.09, 0.06, 0.06]); nose.map(p => { p[0] *= 1 + 0.3 * p[1] / 0.06; }); place(nose, hd(0, -0.045, 0.505)); nose.sk = B.head; nose.col = K.nose; nose.tex = [8, 8]; add(nose); }
  // 牙：上犬齒粗長；下犬齒從下顎往上翹出嘴外（地包天）；門牙一排
  { const T2 = (name, a, m, b, r, bone, nu = 5, col = K.tooth) => { const t = cone(name, nu, a, m, b, r); t.sk = bone; t.col = col; t.tex = [8, 8]; add(t); add(mirrorX(t, name + 'R')).sk = bone; };
    T2('fang', hd(0.12, -0.16, 0.39), hd(0.125, -0.22, 0.4), hd(0.117, -0.285, 0.395), 0.042, B.head, 5, E ? K.fang : K.tooth);
    T2('fangd', hd(0.092, -0.25, 0.43), hd(0.1, -0.19, 0.445), hd(0.094, -0.13, 0.45), 0.036, B.jaw, 5, E ? K.fang : K.tooth);
    T2('inc1', hd(0.03, -0.24, 0.475), hd(0.031, -0.215, 0.48), hd(0.03, -0.195, 0.48), 0.02, B.jaw, 4); T2('inc2', hd(0.058, -0.245, 0.465), hd(0.059, -0.22, 0.47), hd(0.058, -0.2, 0.47), 0.02, B.jaw, 4);
    T2('tu1', hd(0.145, -0.15, 0.31), hd(0.147, -0.19, 0.31), hd(0.145, -0.215, 0.31), 0.028, B.head, 4); }
  // 耳朵：剪短的立耳；左耳缺一角
  const mkEar = (name, base, tip, side, hw, th, notch) => {
    const t = norm3(sub3(tip, base)), L = hyp(...sub3(tip, base)), at = f => add3(base, t, L * f);
    const ear = tubeP(name, 10, [{ p: at(0), rx: hw * 0.9, ry: th, rd: th * 0.5 }, { p: at(0.3), rx: hw, ry: th, rd: -th * 0.35 }, { p: at(0.62), rx: hw * 0.7, ry: th * 0.8, rd: -th * 0.4 }, { p: at(0.86), rx: hw * 0.32, ry: th * 0.55, rd: -th * 0.1 }, { p: at(1), rx: 0.004, ry: 0.004 }], { ref: side, nv: notch ? 9 : 6, capB: 0.004, capN: 1, seam: PI / 2 });
    if (notch) { const e1 = norm3(add3(side, t, -dot3(side, t))); ear.map(p => { const q = sub3(p, base), a = dot3(q, t) / L, b = dot3(q, e1), k = Math.max(0, 1 - abs(a - 0.66) / 0.24); if (b < 0 && k > 0) { const d = b * 0.9 * k; p[0] -= e1[0] * d; p[1] -= e1[1] * d; p[2] -= e1[2] * d; } }); }
    ear.tex = [64, 80];
    ear.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), h = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0), front = -cos(TAU * u), b = abs(sin(TAU * u));
      put(c, K.fur); ink(c, 0.7 * smooth(0.2, 0.9, h), K.furD); if (front > 0.2) ink(c, 0.5 * cov(Math.max(b - 0.6 + 0.25 * h, 0.12 - h, h - 0.72) * 0.12, 0.012), K.earIn); };
    return ear;
  };
  { const eb = hd(0.27, 0.25, -0.1), et = hd(0.44, 0.4, -0.26); add(mkEar('earL', eb, et, [0.5, 0.8, -0.2], 0.13, 0.045, true)).sk = B.head; add(mkEar('earR', mir(eb), mir(et), [0.5, -0.8, 0.2], 0.13, 0.045, false)).sk = B.head; }      // 耳朵剪短了，不跟著耳朵骨頭動（豎起來會像角）
  // 眼睛：小、橘紅、瞳孔小，壓在很粗的眉下面（眉的角度比灰狼更斜）
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR);
  const X = {};
  { X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(-0.006, -0.012, 0.012), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(-0.006, -0.012, 0.012)), eqR);
    X.browL = sk.bone('browL', B.head, eloc(0.005, 0.055, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.005, 0.055, 0.014)), eqR);
    const eye = ball('eyeL', 12, 4, [0.084, 0.07, 0.02], { vmax: 0.6 }); place(eye, eloc(0, 0, -0.007), [ex, ey, ez]); eye.sk = X.eyeL; eye.tex = [48, 32]; eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1] + 0.25); put(c, K.iris); ink(c, smooth(0.25, 0.8, r) * 0.9, K.irisD); if (d[2] < 0.14 || d[1] > 0.22 + 0.5 * d[0]) put(c, K.dark); };
    add(eye); if (!IT) add(mirrorX(eye, 'eyeR')).sk = X.eyeR;
    else { const eR = ball('eyeR', 12, 4, [0.084, 0.07, 0.02], { vmax: 0.6 }); place(eR, mir(eloc(0, 0, -0.007)), [exR, eyR, ezR]); eR.sk = X.eyeR; eR.tex = [48, 32]; eR.glow = 0;      // 瞎掉的右眼：灰白混濁、眼皮垂下一半、不發光
      eR.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1] + 0.1); put(c, K.blind); ink(c, smooth(0.2, 0.9, r) * 0.6, K.blindD); if (d[2] < 0.14 || d[1] > 0.02 - 0.3 * d[0]) put(c, K.dark); }; add(eR); }
    const pup = ball('pupL', 8, 2, [0.02, 0.026, 0.007], { vmax: 0.5 }); place(pup, eloc(-0.006, -0.012, 0.012), [ex, ey, ez]); pup.sk = X.pupL; pup.col = K.pupil; pup.tex = [8, 8]; add(pup); if (!IT) add(mirrorX(pup, 'pupR')).sk = X.pupR;
    const br = tubeP('browL', 6, [{ p: [-0.11, 0.015, 0.016], rx: 0.02, ry: 0.024 }, { p: [0.0, 0.058, 0.02], rx: 0.03, ry: 0.034 }, { p: [0.13, 0.1, 0.0], rx: 0.018, ry: 0.02 }], { ref: [0, 0, 1], capA: 0.026, capB: 0.022, capN: 1 }); place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = K.dark; br.tex = [8, 8]; add(br); add(mirrorX(br, 'browR')).sk = X.browR; }

  /* ----- 身體：深胸、寬肩、腰收得很緊、臀小而結實 ----- */
  const body = tubeP('body', 16, [{ p: [0, 0.67, -0.5], rx: 0.22, ry: 0.21, rd: 0.18 }, { p: [0, 0.67, -0.34], rx: 0.27, ry: 0.25, rd: 0.22, wt: 0.92 }, { p: [0, 0.68, -0.1], rx: 0.24, ry: 0.24, rd: 0.17, wt: 0.92 }, { p: [0, 0.67, 0.15], rx: 0.35, ry: 0.32, rd: 0.36, wt: 0.88 }, { p: [0, 0.7, 0.33], rx: 0.35, ry: 0.33, rd: 0.34 }, { p: [0, 0.76, 0.5], rx: 0.3, ry: 0.3, rd: 0.3 }], { nv: 10, capA: 0.1, capB: 0.1 });
  push(body, [0.27, 0.9, 0.24], 0.24, [0.045, 0.035, 0]); push(body, [0.22, 0.75, -0.36], 0.2, [0.03, 0.01, 0]);      // 肩與臀的肌肉
  finish(body); body.tex = [384, 224]; add(body);
  body.sk = p => { const t = smooth(-0.3, 0.1, p[2]), nk = 0.6 * smooth(0.3, 0.56, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2];
    put(c, K.fur); ink(c, 0.45 * smooth(0.9, 1.6, al) * smooth(2.4, 1.8, al), K.furL); ink(c, 0.4 * smooth(0.5, 0.0, al), K.furD);
    const ax = abs(p[0]); ink(c, cov(Math.max(abs(ax - 0.13) - 0.075 * smooth(0.62, 0.42, p[1]), 0.42 - z), 0.01) * smooth(0.66, 0.6, p[1]), K.cream);      // 胸前兩塊棕褐色
    // 左肩三道爪痕
    if (p[0] > 0.15 && z > 0.05 && z < 0.4) for (const k of [-0.05, 0, 0.05]) { const a = (z - 0.2) * 0.6 + (p[1] - 0.82 - k) * 0.8, b = -(z - 0.2) * 0.8 + (p[1] - 0.82 - k) * 0.6 + k * 0.4; ink(c, 0.95 * cov(wedge(a + 0.09, b, 0.18, 0.012, 0.7, 0.03), 0.006), K.scar); }
    if (E) {
      // 鞭痕：斜著劃過肋、背與臀的一道道舊疤（淺粉、邊緣暗紅）；左右兩側、背上各幾道
      const W = [[1, 0.76, 0.16, -0.8, 0.6, 0.26], [1, 0.68, 0.0, -0.9, -0.45, 0.2], [1, 0.72, -0.12, -0.7, 0.7, 0.14], [1, 0.8, -0.3, -0.9, -0.3, 0.2], [-1, 0.74, 0.26, -0.8, -0.55, 0.22], [-1, 0.7, 0.08, -0.9, 0.4, 0.24], [-1, 0.75, -0.12, -0.75, 0.65, 0.16], [-1, 0.72, -0.26, -0.85, -0.5, 0.18]];
      for (const [sx, qy, qz, dy, dz, hl2] of W.filter((o, i) => DOGP === 'A' || i % 2 === 0)) if (p[0] * sx > 0.05) { const nl = Math.hypot(dy, dz), uy = dy / nl, uz = dz / nl, rx = p[1] - qy, rz = z - qz, tt = clamp(rx * uy + rz * uz, -hl2, hl2), d2 = Math.hypot(rx - uy * tt, rz - uz * tt), w = 0.012 * smooth(hl2 * 1.05, hl2 * 0.3, abs(rx * uy + rz * uz)); ink(c, 0.9 * cov(d2 - w - 0.006, 0.004), K.whipD); ink(c, cov(d2 - w, 0.004), K.whip); }
      // 背上：三道橫過背的
      for (const [qz, sl] of DOGP === 'A' ? [[0.22, 0.6], [0.0, -0.4], [-0.2, 0.7]] : []) { const dd = z - qz - sl * p[0], w = 0.012 * smooth(0.3, 0.12, abs(p[0])); if (p[1] > 0.8) { ink(c, 0.9 * cov(abs(dd) - w - 0.006, 0.004), K.whipD); ink(c, cov(abs(dd) - w, 0.004), K.whip); } } } };
  // 頸背豎起的短硬毛（生氣時更高）
  [[0.3, 0.08], [0.18, 0.09], [0.05, 0.075], [-0.08, 0.06]].forEach(([z, l0], i) => { const l = l0 * (E ? 1.7 : 1), h = surf(body, [0, 0.7, z], [0, 1, 0]), tip = add3(add3(h.p, [0, 1, 0], l), [0, 0, -l * 1.1]), wgt = body.sk(h.p), s = spike('hk' + i, add3(h.p, [0, -0.05, 0]), tip, [0, 0, 1], 0.12, 0.06, 6, 0.84);
    s.sk = (q, ii, j) => { const f = [0, 0.6, 1, 1][j]; return [wgt[0], wgt[1] * (1 - f), wgt[2], wgt[3] * (1 - f), wgt[4], wgt[5] * (1 - f), B.mane, f]; }; s.col = K.furD; s.tex = [8, 8]; add(s); });

  /* ----- 釘刺鐵項圈與斷掉的鍊子 ----- */
  { const NC = [0, 0.77, 0.34], ax = norm3([0, 0.3, 0.95]), a = [1, 0, 0], b = cross3(ax, a);
    const col = ringPart('collar', NC, a, b, 0.37, 0.345, 0.065, 0.03, 8); col.sk = [B.neck, 0.7, B.chest, 0.3]; col.tex = [96, 32];
    col.paint = (c, p, n, u, v) => { put(c, K.leather); ink(c, 0.5 * cov(abs(abs(((p[0] * 0 + v * 14) % 1) - 0.5) - 0.25) - 0.2, 0.05), K.furD); const e = abs(dot3(sub3(p, NC), ax)); ink(c, cov(0.035 - e, 0.006), K.iron); ink(c, 0.6 * cov(0.02 - abs(e - 0.045), 0.004), K.ironL); }; add(col);
    for (let i = 0; i < 12; i++) { const t = i / 12 * TAU, dir = add3(a.map(x => x * cos(t)), b.map(x => x * sin(t))), base = add3(add3(NC, a, cos(t) * 0.39), b, sin(t) * 0.365); if (sin(t) < -0.8) continue;
      const sp = cone('cspike' + i, 4, add3(base, dir, -0.01), add3(base, dir, 0.055 * (E ? 1.5 : 1)), add3(base, dir, 0.13 * (E ? 1.55 : 1)), 0.034, ax); sp.sk = col.sk; sp.col = K.spikeC; sp.tex = [8, 8]; add(sp); }
    // 下面一個 D 形環、三節鍊子（最後一節斷開）
    const bot = add3(add3(NC, b, -0.365), ax, 0.03), d = norm3([0, -1, 0.15]);
    const dr = ringPart('dring', add3(bot, d, 0.04), a, d, 0.045, 0.05, 0.016, 0.016, 6); dr.sk = col.sk; dr.col = K.iron; dr.tex = [8, 8]; add(dr);
    let c0 = add3(bot, d, 0.1); const dirs = [norm3([0.05, -1, 0.25]), norm3([0.1, -1, 0.1]), norm3([0.18, -1, 0.0])];
    if (!E) dirs.forEach((dd, i) => { const ctr = add3(c0, dd, 0.05), aa = i % 2 ? cross3(dd, [0, 0, 1]) : norm3(cross3(dd, [1, 0, 0])), lk = ringPart('link' + i, ctr, dd, norm3(aa), 0.06, 0.035, 0.016, 0.016, 6, i === 2 ? 0.78 : 1); lk.sk = col.sk; lk.tex = [16, 16]; lk.paint = (c, p, n, u, v) => { put(c, K.iron); ink(c, 0.6 * smooth(0.3, 0.9, n[1]), K.ironL); ink(c, 0.55 * smooth(0.4, 0.8, Math.sin(u * 40 + v * 30 + i)), K.rust); }; add(lk); c0 = add3(ctr, dd, 0.075); });
    dr.paint = (c, p, n, u, v) => { put(c, K.iron); ink(c, 0.6 * smooth(0.3, 0.9, n[1]), K.ironL); ink(c, 0.55 * smooth(0.4, 0.8, Math.sin(u * 40 + v * 30)), K.rust); }; dr.tex = [16, 16];
    if (WD) {      /* X4 獄卒長：粗鐵項圈＋鑰匙串（一個大鐵環、三把舊鑰匙，鑰匙頭朝上掛在環底） */
      col.paint = (c, p, n, u, v) => { put(c, K.iron); ink(c, 0.6 * smooth(0.2, 0.9, n[1]), K.ironL); ink(c, 0.5 * smooth(0.35, 0.85, Math.sin(u * 41 + v * 17) * Math.sin(v * 29 - u * 7)), K.rust); };
      const ironP = (c, p, n, u, v) => { put(c, K.iron); ink(c, 0.6 * smooth(0.3, 0.9, n[1]), K.ironL); ink(c, 0.5 * smooth(0.4, 0.8, Math.sin(u * 40 + v * 30)), K.rust); };
      const brassP = (c, p, n) => { put(c, K.plate); ink(c, 0.5 * smooth(0.2, 0.9, n[1]), K.plateL); ink(c, 0.45 * smooth(0.5, 0.9, Math.sin(p[0] * 91 + p[1] * 57) * Math.sin(p[2] * 73 - p[1] * 31)), K.plateD); };
      const RC = add3(c0, [0, -1, 0], 0.07), kr = ringPart('keyring', RC, [1, 0, 0], [0, 1, 0], 0.085, 0.085, 0.015, 0.015, 6); kr.sk = col.sk; kr.tex = [16, 16]; kr.paint = ironP; add(kr);
      [-1, 0, 1].forEach((k, i) => { const top = add3(RC, [k * 0.05, -0.075 + 0.012 * Math.abs(k), 0.012 * k], 1), d = norm3([k * 0.28, -1, 0.12 + 0.06 * k]), ax2 = norm3(cross3(d, [0, 0, 1]));
        const bow = ringPart('kbow' + i, add3(top, d, 0.026), ax2, d, 0.026, 0.024, 0.009, 0.009, 4); bow.sk = col.sk; bow.tex = [8, 8]; bow.paint = brassP; add(bow);
        const sh = tubeP('kshaft' + i, 4, [{ p: add3(top, d, 0.05), rx: 0.011, ry: 0.011 }, { p: add3(top, d, 0.12 + 0.02 * (i % 2)), rx: 0.01, ry: 0.01 }, { p: add3(top, d, 0.19 + 0.02 * (i % 2)), rx: 0.009, ry: 0.009 }], { nv: 3, capB: 0.009, capN: 1 }); sh.sk = col.sk; sh.tex = [8, 16]; sh.paint = brassP; add(sh);
        const bt = ball('kbit' + i, 6, 4, [0.024, 0.012, 0.009]); place(bt, add3(add3(top, d, 0.17 + 0.02 * (i % 2)), ax2, 0.022), [ax2, d, cross3(ax2, d)]); bt.sk = col.sk; bt.tex = [8, 8]; bt.paint = brassP; add(bt); }); }
    if (IT) {
      // 鐵牙的長鍊：從 D 形環垂到地上、往後拖；5 根骨頭 chain0–chain4（每根 2 節鍊環），最後一節斷開。動作在 poseDog（拖地的物理＋「斷鍊鞭」甩出去）
      const CP = [c0, [0.03, 0.2, c0[2] - 0.03], [0.05, 0.035, c0[2] - 0.2], [0.06, 0.035, c0[2] - 0.5], [0.07, 0.035, c0[2] - 0.8], [0.08, 0.035, c0[2] - 1.1]], ids = [];
      const lkP = (c, p, n, u, v) => { put(c, K.iron); ink(c, 0.65 * smooth(0.2, 0.9, n[1]), K.ironL); ink(c, 0.5 * smooth(0.35, 0.85, Math.sin(u * 37 + v * 23)), K.rust); };
      const lkR = (name, ctr, dd, aa, R1, R2, r, arc) => { const keys = [], nn = arc < 1 ? 8 : 10; for (let i = 0; i <= nn; i++) { const tt = i / nn * TAU * arc; keys.push({ p: add3(add3(ctr, dd, cos(tt) * R1), aa, sin(tt) * R2), rx: r, ry: r }); } return tubeP(name, 4, keys, arc < 1 ? { nv: 10, ref: cross3(dd, aa), capA: r * 0.8, capB: r * 0.8, capN: 1 } : { nv: 12, ref: cross3(dd, aa) }); };
      for (let i = 0; i < 5; i++) { ids.push(sk.bone('chain' + i, i ? ids[i - 1] : B.neck, CP[i])); const a0 = CP[i], dd = norm3(sub3(CP[i + 1], a0)), L = hyp(...sub3(CP[i + 1], a0));
        for (let k = 0; k < 2; k++) { const ctr = add3(a0, dd, L * (0.25 + 0.5 * k)), aa = (i * 2 + k) % 2 ? norm3(cross3(dd, [0, 1, 0.001])) : norm3(cross3(dd, cross3(dd, [0, 1, 0.001]))), last = i === 4 && k === 1, lk = lkR('ch' + i + k, ctr, dd, aa, L * 0.3, 0.05, 0.024, last ? 0.75 : 1); lk.sk = ids[i]; lk.tex = [16, 16]; lk.paint = lkP; add(lk); } }
      X.chain = { ids, rest: CP };
      // 胸前的鐵牌：掛在 D 形環上、面朝前下方。正面刻「鐵牙」兩個字，下面是一個沒人認得的記號（圈裡一把鑰匙：馴獸師長的記號，0.9 的線索）
      const GL = ['0 1c380e0 1fc380e0 1fdff1f0 3ddff3f8 39dff7fc 39c78fbc 1c38f1e 7ffffe1f 7ffffffe 7ffffbfe 3c003fc 1dff0e0 1dff0e0 39dff0e0 39dc77fe 39dff7fe 3fdff7fe 1fdfe0e0 1fdf06e0 1fdffeee f87f6ec f8387ec 79ff3ec 379ff3fc 779ff6e0 77c387f0 77fffffe 7ffffbfe 3ffbf83e 3e700004 8200000', '3ffffff8 3ffffff8 3ffffff8 3ffffff8 1f007c0 1f003c0 1f003e0 1f003e0 1f003e0 1f001e0 1f001e0 1f001f0 7ffffff0 fffffff0 fffffff0 fffffff8 7fffbf90 1ff8000 1f7c000 1f3f000 1f1f800 1f0fc00 1f07f00 1f03f80 1f01fe0 1f00ff8 1f003fe 1f001fe 1ff807c ff8018 ff0000 3f0000'].map(g => g.split(' ').map(h => parseInt(h, 16) | 0));      // 兩個字的點陣（32×32，每列一個十六進位數，第 x 位＝第 x 欄）
      const PC = [0.5, 0.5, 0.47], pz = norm3([1, -0.12, 0.3]), px = norm3(cross3([0, 1, 0], pz)), py = cross3(pz, px), PW = 0.19, PH = 0.225;
      const pl = ball('plate', 16, 8, [PW, PH, 0.03], { e: 0.45 }); place(pl, PC, [px, py, pz]); pl.sk = col.sk; pl.tex = [224, 176];
      pl.paint = (c, p, n) => { const lx = p[0] - PC[0], ly = p[1] - PC[1], lz = p[2] - PC[2], X0 = (lx * px[0] + ly * px[1] + lz * px[2]) / PW, Y0 = (lx * py[0] + ly * py[1] + lz * py[2]) / PH; put(c, K.plate); ink(c, 0.55 * smooth(0.62, 1, Math.max(abs(X0), abs(Y0))), K.plateD); ink(c, 0.35 * smooth(0.3, 0.9, n[1]), K.plateL); ink(c, 0.4 * smooth(0.45, 0.85, Math.sin(X0 * 13 + Y0 * 7) * Math.sin(Y0 * 17 - X0 * 5)), K.rust);
        if (dot3(n, pz) < 0.2) return; const gx = (X0 * 1.12 + 1) / 2, gy = (1 - Y0 * 1.12) / 2;      // 正面 0–1（從左上角起；px 朝看板子的人的右邊、py 朝上）
        // 兩個字：上半部左右並排
        if (gy > 0.06 && gy < 0.48) { const ci = gx < 0.5 ? 0 : 1, lx = (gx - 0.04 - ci * 0.47) / 0.44, ly = (gy - 0.07) / 0.4; if (lx >= 0 && lx < 1 && ly >= 0 && ly < 1) { const bx = Math.floor(lx * 32), by = Math.floor(ly * 32); if ((GL[ci][by] >>> bx) & 1) put(c, K.plateD); } }
        // 記號：圈裡一把鑰匙（鑰匙頭朝上）
        const mx = (gx - 0.5) / 0.22, my = (gy - 0.74) / 0.22, r = h2(mx, my); let k = cov((abs(r - 0.85) - 0.09) * 0.22, 0.01);
        k = Math.max(k, cov((abs(h2(mx, my + 0.32) - 0.2) - 0.07) * 0.22, 0.01), cov(Math.max(abs(mx) - 0.07, abs(my - 0.2) - 0.32) * 0.22, 0.01), cov(Math.max(abs(mx - 0.15) - 0.1, abs(my - 0.38) - 0.05) * 0.22, 0.01), cov(Math.max(abs(mx - 0.13) - 0.08, abs(my - 0.2) - 0.045) * 0.22, 0.01));
        ink(c, k, K.plateD); }; add(pl);
      if (DOGP === 'B') {      // 方案 B「披甲頭犬」：兩片鐵肩甲（上面各兩根長刺）＋背上三片鐵板，鉚在皮帶上
        const ironP = (c, p, n) => { put(c, K.iron); ink(c, 0.6 * smooth(0.3, 0.9, n[1]), K.ironL); ink(c, 0.55 * smooth(0.35, 0.85, Math.sin(p[0] * 57 + p[2] * 41) * Math.sin(p[1] * 63 + p[2] * 23)), K.rust); };
        for (const sg of [1, -1]) { const px2 = norm3([sg, -0.5, 0]), py2 = norm3([sg * 0.5, 1, 0]), C = [0.3 * sg, 0.96, 0.2], pd = ball('pauld' + sg, 12, 6, [0.17, 0.05, 0.23], { e: 0.55 }); place(pd, C, [px2, py2, [0, 0, 1]]); pd.sk = B.chest; pd.tex = [64, 64]; pd.paint = ironP; add(pd);
          for (const [dz, h] of [[0.09, 0.2], [-0.09, 0.16]]) { const b0 = add3(add3(C, py2, 0.03), [0, 0, 1], dz), sp2 = cone('psp' + sg + dz, 4, add3(b0, py2, -0.01), add3(b0, norm3([sg * 0.4, 1, 0]), h * 0.5), add3(b0, norm3([sg * 0.45, 1, 0]), h), 0.04, [0, 0, 1]); sp2.sk = B.chest; sp2.col = K.spikeC; sp2.tex = [8, 8]; add(sp2); } }
        [[0.02, B.chest], [-0.14, B.pelvis], [-0.28, B.pelvis]].forEach(([z, bn], i) => { const bp = ball('bplate' + i, 10, 5, [0.15, 0.04, 0.075], { e: 0.55 }); place(bp, [0, 0.975 - 0.02 * i, z], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]); bp.sk = bn; bp.tex = [48, 32]; bp.paint = ironP; add(bp); }); }
      const A0 = [0.4, 0.74, 0.38], T0 = add3(PC, py, PH * 0.92), hm = mid3(A0, T0), hdv = norm3(sub3(T0, A0)), hl = hyp(...sub3(T0, A0)) / 2 + 0.03, hr = ringPart('plring', hm, hdv, norm3(cross3(hdv, pz)), hl, 0.04, 0.014, 0.014, 4); hr.sk = col.sk; hr.col = K.iron; hr.tex = [8, 8]; add(hr); }
  }

  /* ----- 四條腿：粗壯、肌肉明顯；前腳腳尖白 ----- */
  const legPaint = (c, p, n) => { put(c, K.fur); ink(c, 0.45 * smooth(0.2, -0.6, n[0]), K.furL); ink(c, cov(p[1] - 0.26 - 0.03 * Math.sin(Math.atan2(n[2], n[0]) * 4), 0.01), K.cream); ink(c, 0.4 * smooth(0.1, 0.0, p[1]), K.creamD); };
  const pawPaint = pc => (c, p) => { put(c, K.cream); ink(c, 0.5 * smooth(0.05, 0, p[1]), K.creamD); };
  const mkLeg = (name, keys, J, li, pawC, pawR, claw) => {
    const leg = tubeP(name, 10, keys, { nv: 6, capA: 0.1, capN: 2 }); leg.tex = [96, 112]; leg.paint = legPaint; leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.06); leg.blend = [body, 0.12]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.06); lr.blend = [body, 0.12];
    const paw = ball(name + 'paw', 8, 5, pawR); paw.map(p => { p[0] *= 1 + 0.14 * smooth(-0.3, 0.8, p[2] / pawR[2]); if (p[1] < -pawR[1] * 0.8) p[1] = -pawR[1] * 0.8; }); place(paw, pawC); paw.tex = [48, 32]; paw.paint = pawPaint(pawC); paw.sk = Lg(li) + 2; add(paw); add(mirrorX(paw, name + 'pawR')).sk = Lg(li + 1) + 2;
    for (const o of [-0.6, 0, 0.6]) { const zf = pawC[2] + pawR[2] * (0.84 - 0.12 * abs(o)), x = pawC[0] + o * pawR[0], cl = cone(name + 'cl' + o, 3, [x, 0.05, zf - 0.02], [x + o * 0.004, 0.036, zf + claw * 0.55], [x + o * 0.008, 0.01, zf + claw], claw * 0.6, [1, 0, 0]); cl.sk = Lg(li) + 2; cl.col = K.claw; cl.tex = [8, 8]; add(cl); add(mirrorX(cl, name + 'clR' + o)).sk = Lg(li + 1) + 2; }
  };
  mkLeg('fl', [{ p: [0.25, 0.72, 0.28], rx: 0.17, ry: 0.2 }, { p: [0.265, 0.52, 0.27], rx: 0.16, ry: 0.18 }, { p: [0.27, 0.34, 0.22], rx: 0.125, ry: 0.13 }, { p: [0.27, 0.2, 0.25], rx: 0.11, ry: 0.112 }, { p: [0.27, 0.07, 0.268], rx: 0.115, ry: 0.12, rd: 0.11 }], FJ, 0, [0.27, 0.066, 0.33], [0.145, 0.088, 0.17], 0.048);
  mkLeg('rl', [{ p: [0.22, 0.72, -0.36], rx: 0.17, ry: 0.21, rd: 0.19 }, { p: [0.245, 0.53, -0.31], rx: 0.16, ry: 0.2, rd: 0.16 }, { p: [0.25, 0.38, -0.27], rx: 0.125, ry: 0.135, rd: 0.11 }, { p: [0.25, 0.27, -0.36], rx: 0.1, ry: 0.105 }, { p: [0.25, 0.17, -0.43], rx: 0.09, ry: 0.095 }, { p: [0.25, 0.07, -0.41], rx: 0.098, ry: 0.104, rd: 0.096 }], RJ, 2, [0.25, 0.062, -0.355], [0.13, 0.082, 0.158], 0.044);

  /* ----- 尾巴：細長的鞭尾，尾尖黑 ----- */
  { const tail = tubeP('tail', 8, TK.map(k => ({ p: [0, k[0], k[1]], rx: k[2], ry: k[2] })), { nv: 11, capB: 0.012, capN: 1, seam: PI / 2 }); tail.tex = [48, 112];
    const tsk = t => { const s = t * (TK.length - 1), k = clamp(Math.round(s), 1, TN - 1), w = smooth(k - 0.32, k + 0.32, s); return [B.tail + k - 1, 1 - w, B.tail + k, w]; };
    tail.sk = (p, i, j, pt) => tsk(pt.rows[j].t);
    tail.paint = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), t = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0); put(c, K.fur); ink(c, 0.5 * smooth(0.2, 0.8, n[1]), K.furD); ink(c, smooth(0.6, 0.85, t), K.dark); };
    tail.blend = [body, 0.1]; add(tail); }

  const AO = [{ id: 'head', c: HC, r: 0.4 }, { id: 'body', c: [0, 0.68, 0.26], r: 0.34 }, { id: 'body', c: [0, 0.68, -0.08], r: 0.24 }, { id: 'body', c: [0, 0.68, -0.36], r: 0.27 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.26 * s, 0.46, 0.27], r: 0.17 }, { id: 'rl', c: [0.24 * s, 0.48, -0.32], r: 0.18 });
  const aoId = { snout: 'head', jaw: 'head', flpaw: 'fl', rlpaw: 'rl' };
  for (const pt of parts) if (pt.paint) { const f = pt.paint, id = aoId[pt.name] || pt.name, ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.45, occl(p, n, AO, id) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(0.5, 0.1, p[1])); c[0] *= 1 - o * 0.95; c[1] *= 1 - o * 0.95; c[2] *= 1 - o * 0.88; }; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, chain: X.chain, bg: K.fur, eyeCol: [1.0, 0.45, 0.08],
    S: { k: 1.3, run: 6.2, stride: 0.5, lift: 0.1, bob: 0.04, cad: 1.3, graze: 0.3, grazeN: 0.9, grazeH: 0.25, jawMax: 0.65, maneUp: 0.04, wag: 3, wagAmp: 0.18, halfW: 0.3, tailRun: 0.5, low: 0.28, howl: 0, earBack: 0, u: 0.7, jump: 0.85, jaw0: 0.22, reach: 0.38, elastic: 1, maneK: 0.45, pose: poseDog } };
};

/* ---------- 野牛：最大、最重。肩峰高聳、頭低垂抬不過肩；前半身（頭頂、頸、肩峰、前腿上半）是深褐色的長捲毛，後半身短毛較淺；
   短而往上彎的角（淺色、尖端黑）、寬而濕的黑鼻子、下巴一撮鬍子；小眼睛壓在捲毛下面，眼眶泛紅；尾巴翹起來（要衝撞了） ---------- */
SOFT.bison = elite => {
  const K = { wool: rgb(0x3a2114), woolD: rgb(0x1e1008), woolL: rgb(0x60391e), coat: rgb(0x7c5232), coatD: rgb(0x52341e), coatL: rgb(0xa27a50), mid: rgb(0x5a3820), muzzle: rgb(0x6a5546), muzzleL: rgb(0xa08a76), nose: rgb(0x1a1412), noseL: rgb(0x8a7a72), face: rgb(0xb47c4a), faceL: rgb(0xdcae78), brow: rgb(0x2a1608), nostril: rgb(0x0e0a08), mouth: rgb(0x4a1a1c), tongue: rgb(0x9a4a54),
    horn: rgb(0xd2c6ae), hornD: rgb(0x2a2420), hoof: rgb(0x1e1612), hoofL: rgb(0x4a3c32), eye: rgb(0xffb22a), eyeD: rgb(0xd0400e), pupil: rgb(0x120806), rim: rgb(0x8a2a1a), scar: rgb(0xc89a80) };
  // 0.8 菁英「白鹽臺的狂牛」（使用者選定方案 B「鐵角狂牛」）：第四版身形完全不動，只往上加——左角斷一截、左肩鹽漬舊傷、右角包一圈舊鐵箍、肩峰長毛末端的白鹽結晶、紅眼；體型一律用遊戲給的 size ×1.38，不另外放大
  const EL = !!elite;
  if (EL) Object.assign(K, { eye: rgb(0xff4a1e), eyeD: rgb(0xa80c06), rim: rgb(0xa01a12) });      // 眼睛紅（戰鬥中的紅光由共用的眼睛發光負責）
  const KE = { salt: rgb(0xeee8da), saltD: rgb(0xb4aa94), saltW: rgb(0xfdfcf6), scarP: rgb(0xc4887c), stump: rgb(0xf0e6cc), stumpD: rgb(0xa89a80), iron: rgb(0x3a3836), ironL: rgb(0x8a8680), rust: rgb(0x7a3e1c) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.6, 0.86], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.31, 0.6, 0.32], j1: [0.32, 0.35, 0.25], j2: [0.32, 0.13, 0.32], pad: [0.32, 0, 0.36] }, RJ = { j0: [0.28, 0.64, -0.45], j1: [0.3, 0.39, -0.35], j2: [0.3, 0.15, -0.48], pad: [0.3, 0, -0.42] };
  const TK = [[0.98, -0.68, 0.05], [1.1, -0.76, 0.042], [1.22, -0.76, 0.036], [1.3, -0.7, 0.03]];
  const sk = softSkel({ body: [0, 0.9, -0.05], pelvis: [0, 0.88, -0.4], chest: [0, 0.96, 0.2], neck: [0, 0.9, 0.5], head: [0, 0.7, 0.7], jaw: hd(0, -0.24, 0.12), ear: hd(0.34, 0.12, -0.12), mane: [0, 1.5, 0.15], fl: FJ, rl: RJ, tail: TK.slice(0, 3).map(k => [0, k[0], k[1]]), mane2: [0, 1.3, 0.45] });
  const BN = sk.BN, Lg = i => B.leg + i * 3, mir = p => [-p[0], p[1], p[2]];
  const curl = (p, f = 1) => { const a = Math.sin(p[0] * 61 * f + Math.sin(p[1] * 47 * f) * 2) * Math.sin(p[1] * 53 * f + p[2] * 41 * f) * Math.sin(p[2] * 57 * f + p[0] * 23); return a; };      // 捲毛的明暗
  const woolPaint = (c, p, n) => { put(c, K.wool); const k = curl(p); ink(c, 0.55 * smooth(0.1, 0.7, k), K.woolD); ink(c, 0.4 * smooth(0.2, 0.8, -k), K.woolL); ink(c, 0.25 * smooth(0.2, 0.9, n[1]), K.woolL); if (EL && p[1] > 1.22) { const g = smooth(1.22, 1.42, p[1]), k2 = curl(p, 2.6); ink(c, 0.9 * g * smooth(0.45, 0.75, k2), KE.salt); ink(c, 0.7 * g * smooth(0.8, 0.95, k2), KE.saltW); ink(c, 0.35 * g * smooth(0.3, 0.6, -k2) * smooth(0.6, 0.9, curl(p, 4.1)), KE.saltD); } };      // 方案 B：肩峰的長毛末端結了白鹽
  // 左肩的鹽漬舊傷：一片不規則的白色鹽殼，中間一道粉色的舊疤；位置寫死在左肩（x > 0），身體與肩上的毛團都呼叫
  const saltScar = (c, p) => { if (p[0] < 0.18) return; const dy = p[1] - 1.18, dz = p[2] - 0.3, ang = Math.atan2(dy, dz), e = h2(dz / 0.2, dy / 0.15) - (1 + 0.1 * sin(ang * 3 + 1) + 0.07 * sin(ang * 5 + 2.4) + 0.05 * sin(ang * 9 + 0.7)); if (e > 0.6) return;
    const cv = smooth(0.06, -0.06, e) * smooth(0.18, 0.3, p[0]), sp = sin(p[1] * 173 + sin(p[2] * 151) * 2) * sin(p[2] * 167 + p[0] * 97), sx = smooth(0.18, 0.3, p[0]);
    ink(c, 0.6 * smooth(0.6, 0.05, e) * smooth(0.35, 0.8, sp) * sx, KE.salt); ink(c, 0.94 * cv, KE.salt); ink(c, 0.45 * cv * smooth(0.25, 0.8, sp), KE.saltD); ink(c, 0.35 * cv * smooth(0.6, 0.95, -sp), KE.saltW);
    const l = abs(dy - 0.42 * dz + 0.012 * sin(dz * 60)); ink(c, cv * 0.85 * smooth(0.024, 0.008, l) * smooth(0.17, 0.07, abs(dz)), KE.scarP); ink(c, cv * 0.5 * smooth(0.034, 0.024, l) * smooth(0.17, 0.07, abs(dz)), KE.saltD); };

  /* ----- 頭：寬大的方頭，額頭被捲毛蓋住；前面一截寬而深色的吻 ----- */
  const head = ball('head', 24, 15, [0.4, 0.4, 0.4], { vmap: t => Math.pow(t, 1.1) });
  push(head, [0.3, -0.1, 0.0], 0.36, [0.06, -0.04, 0]); push(head, [0, -0.1, 0.36], [0.3, 0.26, 0.26], [0, -0.02, 0.07]); push(head, [0.19, 0.08, 0.3], 0.16, [0.01, -0.01, 0.05]); push(head, [0.2, -0.02, 0.33], 0.09, [0, 0, -0.02]);
  place(head, HC); finish(head); head.sk = B.head; head.tex = [384, 256]; add(head);
  const eh = surf(head, HC, norm3([0.22, -0.02, 0.34])), ez = norm3(add3(eh.n, [0.18, 0, 0.45])), ex0 = norm3(cross3([0, 1, 0], ez)), ey0 = cross3(ez, ex0), cT = cos(0.25), sT = sin(0.25);
  const ex = [0, 1, 2].map(i => ex0[i] * cT + ey0[i] * sT), ey = [0, 1, 2].map(i => ey0[i] * cT - ex0[i] * sT), EC = eh.p;
  const eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x); woolPaint(c, p, n); ink(c, 0.92 * smooth(0.14, 0.3, z) * smooth(0.08, -0.08, y), K.face); ink(c, 0.35 * smooth(0.2, 0.34, z) * smooth(0.02, -0.1, y) * smooth(0.2, 0.05, ax), K.faceL); ink(c, 0.8 * smooth(0.26, 0.36, z) * smooth(-0.02, -0.15, y), K.muzzleL);
    if (z > 0.05 && y > -0.2 && y < 0.25) { const dx = ax - EC[0], dy = p[1] - EC[1], dz = p[2] - EC[2], a = dx * ex[0] + dy * ex[1] + dz * ex[2], b = dx * ey[0] + dy * ey[1] + dz * ey[2]; ink(c, smooth(2.3, 1.2, h2(a / 0.1, b / 0.085)), K.face); ink(c, 0.85 * smooth(1.75, 1.15, h2(a / 0.1, b / 0.085)), K.faceL); if (a * a + b * b < 0.06) { ink(c, cov((h2(a / 0.098, b / 0.082) - 1) * 0.09, 0.006), K.rim); ink(c, cov((h2(a / 0.088, b / 0.074) - 1) * 0.09, 0.005), K.woolD); } }
  };
  // 吻：寬、圓、深色，前面兩個大鼻孔
  const SZ = HC[2] + 0.55, SY = HC[1] - 0.16;
  { const sn = tubeP('snout', 16, [{ p: hd(0, -0.13, 0.26), rx: 0.27, ry: 0.2, rd: 0.18 }, { p: hd(0, -0.15, 0.42), rx: 0.24, ry: 0.17, rd: 0.16 }, { p: hd(0, -0.16, 0.52), rx: 0.22, ry: 0.15, rd: 0.14 }], { nv: 6, capB: 0.06, capN: 2 });
    sn.sk = B.head; sn.tex = [160, 96]; sn.blend = [head, 0.1]; add(sn);
    sn.paint = (c, p, n) => { const x = p[0], y = p[1] - SY, z = p[2] - SZ, ax = abs(x); woolPaint(c, p, n); ink(c, 0.85 * smooth(-0.42, -0.3, z), K.face); ink(c, smooth(-0.34, -0.2, z), K.muzzle); ink(c, 0.75 * smooth(-0.05, 0.12, y) * smooth(-0.32, -0.08, z), K.muzzleL); ink(c, 0.5 * smooth(0.04, 0.14, y) * smooth(0.1, 0.0, ax) * smooth(-0.3, -0.12, z), K.faceL);
      if (z > -0.07) { ink(c, smooth(-0.07, -0.02, z) * cov(h2(x / 0.19, (y + 0.01) / 0.12) - 1, 0.12), K.nose); ink(c, 0.6 * smooth(-0.02, 0.05, y) * smooth(-0.04, 0.0, z) * smooth(0.12, 0.04, ax), K.noseL); }
      if (z > -0.03) ink(c, cov((h2((ax - 0.085) / 0.04, (y + 0.0) / 0.055) - 1) * 0.04, 0.005), K.nostril);
      if (n[1] < -0.5 && z < -0.05) ink(c, cov((h2(x / 0.14, (z + 0.2) / 0.16) - 1) * 0.12, 0.01), K.mouth);
    }; }
  const JC = hd(0, -0.31, 0.38); { const jaw = ball('jaw', 12, 7, [0.16, 0.07, 0.17]); push(jaw, [0, 0.07, 0], [0.14, 0.07, 0.16], [0, -0.02, 0]); place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [96, 64]; add(jaw);
    jaw.paint = (c, p) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.muzzle); if (y > 0.012) { ink(c, cov((h2(x / 0.12, z / 0.14) - 1) * 0.1), K.mouth); ink(c, cov((h2(x / 0.07, (z - 0.02) / 0.1) - 1) * 0.06), K.tongue); } }; }
  // 角：從頭頂兩側往外、再往上彎，尖端往內；淺色、尖端黑
  if (!EL) { const hn = horn('hornL', 8, [hd(0.27, 0.2, -0.04), hd(0.44, 0.2, 0.0), hd(0.55, 0.28, 0.04), hd(0.57, 0.42, 0.06), hd(0.5, 0.53, 0.06)], 0.085, { tip: 0.12, pw: 0.9, capA: 0.03 });
    hn.sk = B.head; hn.tex = [16, 64]; hn.paint = (c, p, n, u, v) => { put(c, K.horn); ink(c, smooth(0.4, 0.9, v), K.hornD); ink(c, 0.3 * cov(abs(((v * 7) % 1) - 0.5) - 0.42, 0.04) * smooth(0.5, 0.2, v), K.coatD); }; add(hn); add(mirrorX(hn, 'hornR')).sk = B.head; }
  else { const HP = [hd(0.27, 0.2, -0.04), hd(0.44, 0.2, 0.0), hd(0.55, 0.28, 0.04), hd(0.57, 0.42, 0.06), hd(0.5, 0.53, 0.06)], hornPaint = (c, p, n, u, v) => { put(c, K.horn); ink(c, smooth(0.4, 0.9, v), K.hornD); ink(c, 0.3 * cov(abs(((v * 7) % 1) - 0.5) - 0.42, 0.04) * smooth(0.5, 0.2, v), K.coatD); };
    // 左角斷了一截：只剩到彎上去的地方，斷口不平、淺色（露出角心）
    const SE = hd(0.566, 0.35, 0.05), st = horn('hornL', 8, [HP[0], HP[1], HP[2], SE], 0.088, { tip: 0.54, pw: 1, capA: 0.03 }), tS = norm3(sub3(SE, HP[2]));
    st.map(q => { const d = dot3(sub3(q, SE), tS); if (d > -0.035) { const k = smooth(-0.035, 0.0, d); q[0] += tS[0] * k * 0.022 * sin(q[0] * 95 + q[2] * 71); q[1] += tS[1] * k * 0.022 * sin(q[0] * 95 + q[2] * 71) - k * 0.012 * smooth(0.5, 0.6, q[0] - 0.0); q[2] += tS[2] * k * 0.022 * sin(q[0] * 95 + q[2] * 71); } });
    st.sk = B.head; st.tex = [16, 48]; st.paint = (c, p, n, u, v) => { put(c, K.horn); ink(c, 0.45 * smooth(0.35, 0.85, v), K.hornD); ink(c, 0.3 * cov(abs(((v * 5) % 1) - 0.5) - 0.42, 0.04), K.coatD); const cut = smooth(0.84, 0.93, v); ink(c, cut, KE.stump); ink(c, cut * 0.5 * smooth(0.2, 0.9, abs(sin(u * 37 + v * 13))), KE.stumpD); ink(c, 0.6 * smooth(0.78, 0.84, v) * smooth(0.95, 0.88, v), K.hornD); }; add(st);
    // 右角：略粗略長（×1.1，好包鐵箍）
    const gk = 1.1, b0 = mir(HP[0]), RP = HP.map(q => add3(b0, sub3(mir(q), b0), gk)), rh = horn('hornR', 8, RP, 0.098, { tip: 0.12, pw: 0.9, capA: 0.03 }); rh.sk = B.head; rh.tex = [16, 64]; rh.paint = hornPaint; add(rh);
    { const c0 = RP[2], tg = norm3(sub3(RP[3], RP[1])), a0 = norm3(cross3(tg, [0, 0, 1])), b1 = cross3(tg, a0), rr = 0.098 * (0.12 + 0.88 * Math.pow(0.5, 0.9));      // 右角中段一圈舊鐵箍（當年被抓過又逃掉）
      const ir = ringPart('ironBand', c0, a0, b1, rr + 0.03, rr + 0.03, 0.078, 0.04, 6); ir.sk = B.head; ir.tex = [48, 16]; ir.paint = (c, p, n, u, v) => { put(c, KE.iron); ink(c, 0.5 * smooth(0.3, 0.9, n[1]), KE.ironL); const rs = sin(u * 31 + sin(v * 23) * 2) * sin(v * 41 + u * 7); ink(c, 0.75 * smooth(0.2, 0.7, rs), KE.rust); ink(c, 0.35 * smooth(0.6, 0.95, abs(sin(v * TAU * 6))), KE.ironL); }; add(ir); } }
  // 耳朵：小，藏在角下面的捲毛裡
  { const ear = ball('earL', 10, 5, [0.11, 0.07, 0.05]); place(ear, hd(0.38, 0.05, -0.12), [0.2, 0.4, -0.3]); ear.sk = B.earL; ear.tex = [32, 32]; ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.wool); if (d[2] > 0.3) ink(c, 0.7, K.coatD); }; add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 眼睛：小、琥珀色、瞳孔小，眼眶泛紅；粗眉壓低
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR);
  const X = {};
  { X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(-0.01, -0.006, 0.012), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(-0.01, -0.006, 0.012)), eqR);
    X.browL = sk.bone('browL', B.head, eloc(0.005, 0.05, 0.014), eq); X.browR = sk.bone('browR', B.head, mir(eloc(0.005, 0.05, 0.014)), eqR);
    const eye = ball('eyeL', 12, 4, [0.084, 0.07, 0.022], { vmax: 0.6 }); place(eye, eloc(0, 0, -0.007), [ex, ey, ez]); eye.sk = X.eyeL; eye.tex = [48, 32]; eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1] + 0.2); put(c, K.eye); ink(c, smooth(0.25, 0.85, r) * 0.9, K.eyeD); if (d[2] < 0.14 || d[1] > 0.2 + 0.45 * d[0]) put(c, K.woolD); };
    add(eye); add(mirrorX(eye, 'eyeR')).sk = X.eyeR;
    const pup = ball('pupL', 8, 2, [0.02, 0.024, 0.007], { vmax: 0.5 }); place(pup, eloc(-0.01, -0.006, 0.012), [ex, ey, ez]); pup.sk = X.pupL; pup.col = K.pupil; pup.tex = [8, 8]; add(pup); add(mirrorX(pup, 'pupR')).sk = X.pupR;
    const br = tubeP('browL', 6, [{ p: [-0.1, 0.01, 0.016], rx: 0.024, ry: 0.028 }, { p: [0.0, 0.052, 0.02], rx: 0.034, ry: 0.038 }, { p: [0.12, 0.092, 0.0], rx: 0.02, ry: 0.022 }], { ref: [0, 0, 1], capA: 0.026, capB: 0.022, capN: 1 }); place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = K.woolD; br.tex = [8, 8]; add(br); add(mirrorX(br, 'browR')).sk = X.browR; }

  /* ----- 身體：肩峰高聳（最高點在前腳正上方）、往後一路低下去；後半身小而短毛 ----- */
  // 美術重做（d7-av-bison）：肩峰靠身體截面做出來——最高點移到前腳正上方、頂部收窄成脊；背線從肩峰往後斜降，後半身收窄壓低；
  //   長毛只到肩胛後面（交界從背上往下斜到前腳後方），後半身是淺色短毛，看得出肋、臀、大腿
  const body = tubeP('body', 24, [{ p: [0, 0.84, -0.6], rx: 0.27, ry: 0.25, rd: 0.26, wt: 0.88 }, { p: [0, 0.85, -0.44], rx: 0.35, ry: 0.3, rd: 0.3, wt: 0.86 }, { p: [0, 0.89, -0.17], rx: 0.41, ry: 0.4, rd: 0.35, wt: 0.84 }, { p: [0, 0.98, 0.08], rx: 0.52, ry: 0.55, rd: 0.43, wt: 0.88 }, { p: [0, 1.0, 0.3], rx: 0.54, ry: 0.6, rd: 0.47, wt: 0.86 }, { p: [0, 0.86, 0.52], rx: 0.42, ry: 0.48, rd: 0.42, wt: 0.8 }], { nv: 16, capA: 0.14, capB: 0.16 });
  push(body, [0, 1.62, 0.25], [0.46, 0.36, 0.4], [0, 0.03, 0]);      // 肩峰：最高點在前腳（z 0.32）正上方
  push(body, [0, 1.34, -0.14], [0.38, 0.18, 0.3], [0, -0.05, 0]);      // 肩峰後面的背往下凹一點，背線斜降得更明顯
  push(body, [0.33, 0.98, -0.45], [0.13, 0.2, 0.19], [0.035, 0.01, 0]);      // 臀與大腿的肌肉
  push(body, [0.4, 0.82, -0.2], [0.1, 0.18, 0.13], [-0.03, 0.01, 0]);      // 大腿前面的腹側凹一點
  finish(body); body.tex = [384, 224]; add(body);
  body.sk = p => { const t = smooth(-0.4, 0.1, p[2]), nk = 0.5 * smooth(0.36, 0.6, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
  const WZ = (p, n) => 0.1 - 0.26 * (p[1] - 1.0) + 0.04 * Math.sin(p[1] * 11 + n[0] * 3) + 0.025 * Math.sin(p[1] * 29 + p[0] * 9);      // 長毛的後緣：肩胛後的背上 z≈−0.04、手肘後 z≈0.2，往前下斜
  const W0 = [0, 0, 0], W1 = [0, 0, 0];      // 上色用的暫存（每個像素不配置新陣列）
  const hash = k => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2], y = p[1], ax = abs(p[0]), wz = WZ(p, n), dz = wz - z;      // dz > 0：在長毛後緣的後面
    // 短毛底色：中深棕，背上深、肚子淺
    put(c, K.coat); ink(c, 0.55 * smooth(1.0, 0.1, al), K.coatD); ink(c, 0.5 * smooth(1.7, 2.7, al), K.coatL);
    // 毛流：側面往後下、背上往後；細紋（一根根）＋成束的起伏
    const fa = z * 0.92 - y * 0.38 * (ax / 0.5), fb = y * 0.92 + z * 0.38 + ax * 0.2, hr = Math.sin(fb * 150 + Math.sin(fa * 21) * 2.2 + Math.sin(fa * 57 + fb * 40) * 1.1) * (0.6 + 0.4 * Math.sin(fa * 13 + fb * 71)), cl = Math.sin(fa * 30 + Math.sin(fb * 27) * 2.2) * Math.sin(fb * 33 + fa * 9);
    ink(c, 0.26 * smooth(0.2, 0.9, hr), K.coatD); ink(c, 0.2 * smooth(0.4, 1.0, -hr) * smooth(-0.2, 0.6, cl), K.coatL); ink(c, 0.22 * smooth(0.1, 0.8, -cl), K.mid);
    // 肌肉明暗：大腿前緣的凹、臀上的亮面、大腿後下方的陰影、淡淡的肋
    ink(c, 0.32 * smooth(0.07, 0.0, abs(z + 0.27 - 0.12 * (y - 0.8))) * smooth(0.2, 0.34, ax) * smooth(1.22, 0.95, y), K.coatD);
    ink(c, 0.22 * smooth(0.14, 0.0, h2((z + 0.46) / 1.3, y - 1.08)) * smooth(0.2, 0.3, ax), K.coatL);
    ink(c, 0.3 * smooth(0.85, 0.6, y) * smooth(-0.3, -0.5, z) * smooth(0.18, 0.3, ax), K.coatD);
    for (const rz of [0.02, -0.07]) ink(c, 0.16 * smooth(0.025, 0.0, abs(z - rz + 0.05 * (y - 0.9))) * smooth(0.28, 0.38, ax) * smooth(1.2, 0.95, y) * smooth(0.65, 0.8, y), K.coatD);
    // 中長毛的過渡帶：從長毛後緣往後約 0.3 慢慢變淺變短（顏色漸變＋紋路變粗）
    let wok = false; const WC = () => { if (!wok) { woolPaint(W0, p, n); wok = true; } W1[0] = W0[0]; W1[1] = W0[1]; W1[2] = W0[2]; return W1; };
    const md = smooth(0.32, 0.0, dz); if (md > 0) { const cc = WC(); ink(cc, 0.35, K.mid); ink(c, 0.62 * md * md, cc); }
    // 長毛的後緣：一束束往後下方蓋到肋骨上的長毛（尖端參差）
    if (dz > -0.02 && dz < 0.24) { const yy = y + 0.45 * dz, k = Math.floor(yy / 0.07), s = yy / 0.07 - k, L = 0.07 + 0.15 * hash(k + (p[0] > 0 ? 50 : 0)), e = abs(2 * s - 1); const cov2 = smooth(L * (1 - Math.pow(e, 1.6)) + 0.01, L * (1 - Math.pow(e, 1.6)) - 0.02, dz);
      if (cov2 > 0) { const cc = WC(); ink(cc, 0.3 * smooth(0.6, 1.0, e), K.woolD); ink(cc, 0.25 * smooth(0.3, 0.0, e) * smooth(0.0, L, dz), K.woolL); ink(c, cov2, cc); } }
    const w = smooth(-0.02, 0.0, -dz); if (w > 0) ink(c, w, WC());
    if (p[0] < -0.2 && z < -0.05 && z > -0.45) { const a = (z + 0.25) * 0.9 + (y - 0.95) * 0.4, b = -(z + 0.25) * 0.4 + (y - 0.95) * 0.9; ink(c, 0.9 * cov(wedge(a + 0.12, b, 0.24, 0.014, 0.7, 0.04), 0.008), K.scar); } if (EL) saltScar(c, p); };      // 菁英：左肩鹽漬舊傷
  // 捲毛：肩峰、頸、頭頂一撮撮往後下方垂的毛（同一張貼圖）
  // 一撮捲毛：從表面長出來，先往外鼓再垂向尖端（火焰狀，粗而圓）
  const locks = [], lock = (name, on, o, d, tip, side, hw, th, skin, bow = 0.45, pr = [1, 0.92, 0.6, 0.06]) => { const h = surf(on, o, norm3(d)); if (!h) return; const b0 = add3(h.p, h.n, -0.06), s = tuftK(name, b0, tip(h.p, h.n), side, hw, th, { nu: 6, bow, up: h.n, pr }); s.sk = skin; s.tex = [16, 32]; locks.push(s); return add(s); };
  // 蓬毛團：很扁的大橢球，大半壓進身體，長軸順著肩峰往後下方；法線往身體帶（交界沒有暗縫）、貼圖用和身體同一套捲毛畫法（依位置上色，接得起來）
  const clump = (name, z, ang, sd, r, droop) => { const h = surf(body, [0, 1.0, z], norm3([sin(ang) * sd, cos(ang), 0])); if (!h) return; const ny = h.n, fw0 = [0, -droop, -1], k = dot3(fw0, ny), fz = norm3([fw0[0] - ny[0] * k, fw0[1] - ny[1] * k, fw0[2] - ny[2] * k]), fx = cross3(ny, fz);
    const pt = ball(name, 8, 5, r); place(pt, add3(h.p, ny, -r[1] * 0.5), [fx, ny, fz]); pt.sk = body.sk(h.p); pt.tex = [40, 28]; pt.blend = [body, 0.09, false]; pt.paint = (c, p, n) => { woolPaint(c, p, n); ink(c, 0.12, K.woolL); if (EL) saltScar(c, p); }; return add(pt); };      // 菁英：舊傷延伸到肩上的毛團
  // 肩峰兩側上半各兩片（不越過身體輪廓：俯視時收在身體寬度內）
  for (const sd of [1, -1]) { clump('hs0' + (sd > 0 ? 'a' : 'b'), 0.36, 0.62, sd, [0.25, 0.06, 0.24], 0.5); clump('hs1' + (sd > 0 ? 'a' : 'b'), 0.14, 0.7, sd, [0.21, 0.05, 0.2], 0.7); }
  // 胸前與頸下垂著的長毛
  [[0, 0.62], [0.16, 0.6], [-0.16, 0.6], [0.28, 0.55], [-0.28, 0.55]].forEach(([x, z], i) => lock('ch' + i, body, [x, 0.75, z], [x * 2, -0.4, 1], (q, nn) => add3(q, [x * 0.2, -0.3, 0.04]), [1, 0, 0], 0.14, 0.08, [B.chest, 0.5, B.neck, 0.5], 0.35));
  // 頭頂的一大撮捲毛（蓋住額頭、往前垂到眼睛上方）
  [[0, 0.33, 0.12], [0.15, 0.3, 0.08], [-0.15, 0.3, 0.08], [0.08, 0.36, -0.06], [-0.08, 0.36, -0.06], [0, 0.34, -0.18]].forEach(([x, y, z], i) => lock('mop' + i, head, HC, [x * 2, 1, z + 0.35], (q, nn) => add3(add3(q, nn, 0.08), [x * 0.4, -0.04, 0.17]), [1, 0, 0], 0.13, 0.08, B.head, 0.6));
  [[0, 0.16, 0.05], [0.08, 0.13, 0.0], [-0.08, 0.13, 0.0]].forEach(([x, l, dz], i) => { const b0 = hd(x, -0.36, 0.3 + dz), s = spike('beard' + i, b0, add3(b0, [x * 0.4, -l, -0.1], 1), [1, 0, 0], 0.07, 0.05, 6, 0.86); s.sk = [B.head, 0.6, B.jaw, 0.4]; s.tex = [16, 32]; locks.push(s); add(s); });
  { const L0 = locks[0]; L0.paint = (c, p, n, u, v) => { put(c, K.wool); ink(c, 0.6 * smooth(0.6, 0.1, v), K.woolD); ink(c, 0.45 * smooth(0.3, 0.9, abs(sin(u * TAU * 2))), K.woolL); }; for (const q of locks) if (q !== L0) q.share = L0; }

  { const sl = []; [[0.06, 0, 0.11], [-0.08, 0, 0.1], [-0.22, 0, 0.09], [-0.36, 0.12, 0.08], [-0.36, -0.12, 0.08], [-0.5, 0.1, 0.07], [-0.5, -0.1, 0.07]].forEach(([z, x, l], i) => { const h = surf(body, [x, 3, z], [0, -1, 0]); if (!h) return;
      const s = tuftK('bk' + i, add3(h.p, h.n, -0.03), add3(add3(h.p, h.n, -0.004), [x * 0.3, -0.02, -l]), [1, 0, 0], 0.085, 0.024, { nu: 4, bow: 0.08, up: h.n, pr: [1, 0.85, 0.5, 0.08] }); s.sk = body.sk(h.p); s.tex = [16, 16]; sl.push(add(s)); });
    const S0 = sl[0]; S0.paint = (c, p, n, u, v) => { put(c, K.coat); ink(c, 0.35 * smooth(0.6, 0.0, v), K.coatD); ink(c, 0.25 * smooth(0.5, 1.0, abs(sin(u * TAU * 2 + v * 3))), K.mid); }; for (const q of sl) if (q !== S0) q.share = S0; }
  /* ----- 四條腿：前腳粗、上半截是捲毛（像穿了毛褲），後腳細一點；黑色的分趾蹄 ----- */
  const mkLeg = (name, keys, J, li, hc, hr, wooly) => {
    const leg = tubeP(name, 12, keys, { nv: 6, capA: 0.14, capN: 2 }); leg.tex = [64, 96];
    leg.paint = (c, p, n) => { put(c, K.coat); ink(c, 0.4 * smooth(0.2, -0.6, n[0]), K.coatL); ink(c, 0.7 * smooth(0.32, 0.14, p[1]), K.coatD); if (wooly) { const cc = [0, 0, 0]; woolPaint(cc, p, n); ink(c, smooth(0.3, 0.38, p[1] + 0.04 * Math.sin(Math.atan2(n[2], n[0]) * 5)), cc); } };
    leg.sk = legSk(Lg(li), J.j1[1], J.j2[1], 0.06); leg.blend = [body, 0.14]; add(leg); const lr = add(mirrorX(leg, name + 'R')); lr.sk = legSk(Lg(li + 1), J.j1[1], J.j2[1], 0.06); lr.blend = [body, 0.14];
    const hf = ball(name + 'hoof', 10, 6, hr); hf.map(p => { p[0] *= 1 + 0.12 * smooth(-0.3, 0.8, p[2] / hr[2]); if (p[1] < -hr[1] * 0.8) p[1] = -hr[1] * 0.8; p[2] -= 0.06 * fall(h2(p[0] / 0.035, 0) + Math.max(0, 0.6 - p[2] / hr[2])); }); place(hf, hc); hf.tex = [32, 24];
    hf.paint = (c, p, n) => { put(c, K.hoof); ink(c, 0.4 * smooth(0.02, 0.14, p[1]) * Math.max(0, n[1]), K.hoofL); }; hf.sk = Lg(li) + 2; add(hf); add(mirrorX(hf, name + 'hoofR')).sk = Lg(li + 1) + 2;
    if (wooly) for (const [a, l] of [[0.5, 0.25], [1.6, 0.28], [2.6, 0.25], [-0.6, 0.23]]) { const d = [cos(a), 0, sin(a)], b0 = add3([J.j0[0], 0.42, J.j0[2] - 0.02], d, 0.15), s = spike(name + 'chap' + a, b0, add3(b0, add3(d.map(v => v * 0.07), [0, -l, -0.05])), [d[2], 0, -d[0]], 0.125, 0.06, 6, 0.9); s.sk = [Lg(li), 0.7, Lg(li) + 1, 0.3]; s.share = locks[0]; s.tex = locks[0].tex; add(s); const mr = add(mirrorX(s, name + 'chapR' + a)); mr.sk = [Lg(li + 1), 0.7, Lg(li + 1) + 1, 0.3]; mr.share = locks[0]; }
  };
  mkLeg('fl', [{ p: [0.3, 0.72, 0.32], rx: 0.235, ry: 0.25 }, { p: [0.315, 0.5, 0.3], rx: 0.23, ry: 0.24 }, { p: [0.32, 0.33, 0.25], rx: 0.15, ry: 0.16 }, { p: [0.32, 0.18, 0.29], rx: 0.115, ry: 0.12 }, { p: [0.32, 0.07, 0.32], rx: 0.11, ry: 0.115 }], FJ, 0, [0.32, 0.078, 0.345], [0.13, 0.095, 0.15], true);
  mkLeg('rl', [{ p: [0.27, 0.78, -0.45], rx: 0.2, ry: 0.24, rd: 0.22 }, { p: [0.295, 0.56, -0.41], rx: 0.18, ry: 0.2, rd: 0.17 }, { p: [0.3, 0.38, -0.36], rx: 0.13, ry: 0.14, rd: 0.13 }, { p: [0.3, 0.22, -0.45], rx: 0.105, ry: 0.11 }, { p: [0.3, 0.07, -0.43], rx: 0.1, ry: 0.105 }], RJ, 2, [0.3, 0.074, -0.405], [0.12, 0.09, 0.14], false);

  /* ----- 尾巴：細、翹起來，末端一撮黑毛 ----- */
  { const tail = tubeP('tail', 7, TK.map(k => ({ p: [0, k[0], k[1]], rx: k[2], ry: k[2] })), { capB: 0.03, capN: 1, seam: PI / 2, nv: 7 }); tail.tex = [16, 48];
    tail.sk = (p, i, j, pt) => { const s = pt.rows[j].t * 3, k = clamp(Math.round(s), 1, 2), w = smooth(k - 0.32, k + 0.32, s); return [B.tail + k - 1, 1 - w, B.tail + k, w]; };
    tail.paint = (c, p, n, u, v) => { put(c, K.coat); ink(c, smooth(0.5, 0.8, v), K.woolD); }; add(tail);
    const tf = spike('tailTuft', [0, 1.3, -0.7], [0, 1.18, -0.6], [0, 0, 1], 0.07, 0.055, 6, 1.5); tf.sk = B.tail + 2; tf.col = K.woolD; tf.tex = [8, 8]; add(tf); }

  const AO = [{ id: 'head', c: HC, r: 0.42 }, { id: 'body', c: [0, 1.0, 0.24], r: 0.52 }, { id: 'body', c: [0, 0.92, -0.16], r: 0.42 }, { id: 'body', c: [0, 0.87, -0.46], r: 0.36 }];
  for (const s of [1, -1]) AO.push({ id: 'fl', c: [0.31 * s, 0.45, 0.28], r: 0.19 }, { id: 'rl', c: [0.29 * s, 0.48, -0.4], r: 0.2 });
  for (const pt of parts) if (pt.paint && !pt.share) { const f = pt.paint, id = pt.name.replace(/R$|hoof$/, ''), ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.45, occl(p, n, AO, id) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(0.5, 0.08, p[1])); c[0] *= 1 - o * 0.9; c[1] *= 1 - o; c[2] *= 1 - o * 0.95; }; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: 3, X, bg: K.wool, eyeCol: EL ? [1.0, 0.1, 0.04] : [1.0, 0.4, 0.1],      // 菁英：眼睛發光偏紅（體型一律用遊戲給的 size ×1.38，不另外放大）
    S: { k: 1.55, run: 5.0, stride: 0.42, lift: 0.08, bob: 0.03, cad: 1.2, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.4, jawMax: 0.4, maneUp: 0.03, wag: 3, wagAmp: 0.3, halfW: 0.5, tailRun: 0.8, low: 0.15, chew: 1, u: 0.6, jump: 0.6, jaw0: 0.08, reach: 0.3, elastic: 1, maneK: 0.12, ram: 0.22, pose: poseBison } };
};

/* ---------- 沼蟒：當年競技場養的蟒，住進淹水的獸坑。苔綠底色上一塊塊黑邊的深褐斑（緬甸蟒的花紋）、肚子是淺黃的橫鱗、背上長了青苔；
   楔形的大頭（Q 版放大）、黃色直立細瞳、很重的眉骨、一對往後彎的大牙與分叉的舌頭。
   0.7 精修：改成「能動的蟒」——身體在建模時拉成一直線（尾尖在 z＝−L、脖子末端在 z＝0），沿著身體排 PY.N 根脊椎骨（全部直接掛在 rig 下，
   每一幀由 animPython 算出每根骨頭的位置與朝向，所以盤成兩圈、S 形抬頭、蛇行、纏繞成螺旋都只是換一條曲線），頭與下顎各一根骨頭 ---------- */
export const PY = { N: 26, L: 8.0, y0: 0.3, head: 26, jaw: 27 };
const PY_RAD = t => 0.035 + 0.265 * Math.pow(smooth(0, 0.8, t), 0.7) - 0.05 * smooth(0.85, 1, t);      // 半徑（t：0 尾尖 → 1 脖子末端）
SOFT.python = elite => {
  const K = { base: rgb(0x6f7e34), baseL: rgb(0x93a04a), blot: rgb(0x46401f), blotD: rgb(0x2c2814), ink: rgb(0x141409), belly: rgb(0xdccf98), bellyD: rgb(0xa89a62), moss: rgb(0x5d8a2c), mossL: rgb(0x8ab848),
    mouth: rgb(0xc04a5a), mouthD: rgb(0x7a2030), tongue: rgb(0xd02a3a), tooth: rgb(0xfff4dc), eye: rgb(0xffd21e), eyeD: rgb(0xe07a0a), pupil: rgb(0x0a0806), stripe: rgb(0xd8cc8a), cap: rgb(0x2a2814), scar: rgb(0xc8b090) };
  // 0.8 菁英「舊飼育場的大蟒蛇」：遊戲裡菁英已經 ×1.38，所以身長與姿勢都不動，只靠近看才看得到的東西分辨——花紋與底色、頭形（更寬、眉上兩根骨色短角）、疤痕、嵌進肉裡的斷鐵環與一小段斷鏈、背上的青苔、黃綠色的眼睛；不加遠處會發光的東西。PY_PLAN 切換兩個方案（A 青苔老蟒、B 深潭金紋蟒），使用者選定後刪掉另一個（攝影棚可用 globalThis.__pyPlan 臨時切換）
  const EL = !!elite, EA = false, EB = EL;      // 使用者 22:11 選定 B「深潭金紋蟒」（A 的分支留著不會執行，之後整理時刪）
  const KE = { mossD: rgb(0x2e4a16), iron: rgb(0x3a3834), ironL: rgb(0x7a7670), rust: rgb(0x7a3a18), flesh: rgb(0x4a3a20), bone: rgb(0xd6ca94), boneD: rgb(0x8a7a48), gold: rgb(0xd8b04a), scar: rgb(0xe6d8b4) }, RINGT = [0.5, 0.8];      // RINGT：斷鐵環在身上的位置（0 尾尖 → 1 脖子末端）
  if (EA) Object.assign(K, { base: rgb(0x58652c), baseL: rgb(0x7c8a3e), blot: rgb(0x34301a), blotD: rgb(0x1f1c0e), moss: rgb(0x4a8a2a), mossL: rgb(0x8cc44c), eye: rgb(0xc8f238), eyeD: rgb(0x4a8a0c) });
  if (EB) Object.assign(K, { base: rgb(0x2d473c), baseL: rgb(0x4c6c56), blot: rgb(0x1a2820), blotD: rgb(0x0e1812), moss: rgb(0x3c6a3a), mossL: rgb(0x6a9c58), eye: rgb(0xdcf04c), eyeD: rgb(0x6e9410), stripe: rgb(0xe0c25c), cap: rgb(0x16201a) });
  const KO = EB ? KE.gold : K.ink, OW = EB ? 0.06 : 0.035;      // 斑塊外框的顏色與粗細（B 是金色粗框）
  const parts = [], add = pt => (parts.push(pt), pt), { N, L, y0 } = PY, ds = L / (N - 1);
  const BN = []; for (let i = 0; i < N; i++) BN.push({ name: 'sp' + i, parent: -1, p: [0, y0, -L + i * ds] });
  // ---- 身體：一根直的管子（尾尖 → 脖子末端），蒙皮照沿身體的位置分給相鄰的兩根脊椎骨 ----
  const NKEY = 17, keys = []; for (let k = 0; k < NKEY; k++) { const t = k / (NKEY - 1), r = PY_RAD(t); keys.push({ p: [0, y0, -L + t * L], rx: r * 0.88, ry: r, rd: r }); }
  const body = tubeP('body', 16, keys, { ref: [0, 1, 0], nv: 104, capA: 0.03, capN: 2, seam: PI }); body.t0 = 0; body.t1 = 1; body.tex = [96, 1280]; add(body);
  const spSk = z => { const f = clamp((z + L) / ds, 0, N - 1.0001), b0 = Math.floor(f), w = f - b0, hw = smooth(-0.32, 0.02, z) * 0.55; return hw > 0.01 ? [b0, (1 - w) * (1 - hw), b0 + 1, w * (1 - hw), PY.head, hw] : [b0, 1 - w, b0 + 1, w]; };
  body.sk = p => spSk(p[2]);
  const LEN = 9.5;      // 花紋的間距照樣品（全長換算）
  const skin = (c, p, n, u, v, pt) => { const fj = v * pt.nv, j0 = Math.min(pt.nv - 1, Math.floor(fj)), tr = lerp(pt.rows[j0].t, pt.rows[j0 + 1].t, fj - j0), t = lerp(pt.t0, pt.t1, tr), back = -Math.cos(u * TAU), side = Math.sin(u * TAU);
    const Lp = t * LEN; put(c, K.base); ink(c, 0.4 * smooth(0.0, 0.8, back), K.baseL);
    const bs = Lp / 0.48, bi = Math.floor(bs), bf = bs - bi, jit = Math.sin(bi * 12.9898) * 0.15, db = h2((bf - 0.5) * 1.6, (Math.acos(clamp(back, -1, 1)) / PI) * 3.2 + jit) - 0.55 - 0.12 * Math.sin(bi * 7 + bf * 9);
    const ss = Lp / 0.48 + 0.5, si = Math.floor(ss), sf = ss - si, ang = Math.acos(clamp(back, -1, 1)) / PI, dsd = h2((sf - 0.5) * 2.0, (ang - 0.55) * 5.5 + Math.sin(si * 3.1) * 0.3) - 0.5 - 0.1 * Math.sin(si * 5 + sf * 11);
    const d = Math.min(db, dsd); ink(c, cov(d, 0.02), K.blot); ink(c, 0.5 * cov(d + 0.12, 0.05), K.blotD); ink(c, cov(abs(d) - OW, 0.015), KO);
    const bel = smooth(-0.35, -0.6, back); if (bel > 0) { ink(c, bel, K.belly); ink(c, bel * 0.6 * cov(abs(((Lp * 22) % 1) - 0.5) - 0.42, 0.04), K.bellyD); }
    ink(c, 0.12 * cov(abs(Math.sin(Lp * 70 + side * 9)) * abs(Math.sin(Lp * 70 - side * 9)) - 0.15, 0.1), K.ink);
    const m = Math.sin(Lp * 5.3 + Math.sin(Lp * 2.1) * 2) * Math.sin(side * 7 + Lp * 3); ink(c, 0.75 * smooth(0.35, 0.6, m) * smooth(0.3, 0.8, back) * smooth(0.15, 0.3, t), K.moss); ink(c, 0.5 * smooth(0.55, 0.75, m) * smooth(0.5, 0.9, back) * smooth(0.15, 0.3, t), K.mossL);
    if (EL) { const m2 = Math.sin(Lp * 1.9 + Math.sin(Lp * 0.7) * 2.5 + side * 2) * Math.sin(side * 4 - Lp * 1.3 + 1) + 0.25 * Math.sin(Lp * 23 + side * 17) * Math.sin(Lp * 19 - side * 13), mb = smooth(-0.1, 0.5, back) * smooth(0.08, 0.2, t) * (EA ? 1 : 0.4), wv = Math.acos(clamp(back, -1, 1)) / PI;      // 大蟒蛇：背上一大片一大片的青苔（邊緣碎；B 只剩零星）
      ink(c, 0.92 * smooth(0.12, 0.3, m2) * mb, K.moss); ink(c, 0.6 * smooth(0.35, 0.6, m2) * mb * smooth(0.2, 0.8, Math.sin(Lp * 41 + side * 29)), K.mossL); ink(c, 0.5 * smooth(0.12, 0.2, m2) * smooth(0.3, 0.18, m2) * mb, KE.mossD);
      for (const [Ls0, sd] of [[2.7, 1], [5.5, -1], [7.3, 1]]) for (let k = 0; k < 3; k++) { const a = Lp - Ls0 - k * 0.14 - (wv - 0.45) * 1.1; ink(c, 0.85 * cov(abs(a) - 0.024, 0.012) * smooth(0.12, 0.2, wv) * smooth(0.78, 0.66, wv) * smooth(0.1, 0.4, side * sd), KE.scar); }      // 側腹三道一組的舊爪痕
      for (const rt of RINGT) { const dl = abs(t - rt) * L; ink(c, 0.75 * smooth(0.2, 0.06, dl), KE.flesh); ink(c, 0.5 * smooth(0.12, 0.03, dl) * smooth(-0.6, 0.2, back), KE.rust); } } };      // 鐵環勒進肉裡的那一圈：深色、帶鏽
  body.paint = skin;
  // ---- 頭（直的狀態下建：脖子末端 HB＝(0, y0, 0)、朝 +z）。頭骨的上顎微抬；下顎掛在自己的骨頭上，張嘴時繞鉸鏈轉 ----
  const HS = 1.75, HB = [0, y0, 0], HD = [0, 0, 1], HC = add3(HB, HD, 0.2 * HS), up = [0, 1, 0], sideV = [1, 0, 0];
  const LOC = (a, b, c2) => add3(add3(add3(HC, sideV, a * HS), up, b * HS), HD, c2 * HS), open = 0.3;
  const rotX = (q, ang) => [q[0], q[1] * cos(ang) - q[2] * sin(ang), q[1] * sin(ang) + q[2] * cos(ang)];
  const toW = q => LOC(q[0], q[1], q[2]), hinge = [0, -0.02, -0.14];
  BN.push({ name: 'head', parent: -1, p: HB }); BN.push({ name: 'jaw', parent: PY.head, p: toW(hinge) });
  const skull = ball('skull', 24, 14, [0.24, 0.15, 0.33], { vmap: t => Math.pow(t, 1.1) });
  push(skull, [0.17, -0.02, -0.12], 0.2, [0.06, 0.0, 0]); push(skull, [0, 0.0, 0.25], [0.22, 0.16, 0.14], [0, -0.01, -0.04]); push(skull, [0.12, 0.1, 0.06], 0.1, [0.015, 0.035, 0.0]); push(skull, [0, -0.15, 0.05], [0.2, 0.08, 0.3], [0, 0.07, 0]);
  skull.map(q => { q[0] *= (1 - 0.38 * smooth(-0.05, 0.33, q[2])) * (EL ? 1.15 : 1); const r = rotX(sub3(q, hinge), -open * 0.45); const w = toW(add3(r, hinge)); q[0] = w[0]; q[1] = w[1]; q[2] = w[2]; });
  finish(skull); skull.sk = PY.head; skull.tex = [320, 224]; skull.blend = [body, 0.12]; add(skull);
  const jaw = ball('jaw', 18, 10, [0.21, 0.07, 0.3]); push(jaw, [0, 0.07, 0.0], [0.19, 0.06, 0.28], [0, -0.035, 0]);
  jaw.map(q => { q[0] *= (1 - 0.35 * smooth(-0.05, 0.3, q[2])) * (EL ? 1.12 : 1); q[1] -= 0.09; const r = rotX(sub3(q, hinge), open * 0.75); const w = toW(add3(r, hinge)); q[0] = w[0]; q[1] = w[1]; q[2] = w[2]; });
  finish(jaw); jaw.sk = PY.jaw; jaw.tex = [192, 128]; add(jaw);
  const local = p => { const d = sub3(p, HC); return [dot3(d, sideV) / HS, dot3(d, up) / HS, dot3(d, HD) / HS]; }, reflH = p => { const d = dot3(sub3(p, HC), sideV); return add3(p, sideV, -2 * d); };
  skull.paint = (c, p, n) => { const [x, y, z] = local(p), ax = abs(x), nl = [dot3(n, sideV), dot3(n, up), dot3(n, HD)];
    put(c, K.base); ink(c, 0.6 * smooth(-0.02, 0.08, y + 0.05 * z), K.cap);
    ink(c, cov(abs(y - 0.02 + 0.12 * z + 0.06 * ax) - 0.022, 0.01) * smooth(0.06, 0.12, ax), K.stripe);
    if (nl[1] < -0.2) { put(c, K.mouth); ink(c, 0.6 * smooth(0.0, -0.1, z), K.mouthD); }
    if (x > 0.06 && z < 0.0 && y > 0.0) { const a = (z + 0.12) * 0.8 + (y - 0.05) * 0.6, b = (y - 0.05) * 0.8 - (z + 0.12) * 0.6; ink(c, 0.9 * cov(wedge(a + 0.08, b, 0.16, 0.01, 0.7, 0.02), 0.005), K.scar); }
    if (EL && nl[1] > 0.3) { const rr = h2(x / 0.14, (z + 0.04) / 0.2); ink(c, 0.8 * cov(abs(rr - 1) - 0.08, 0.03), EA ? KE.bone : KE.gold); ink(c, 0.5 * cov(abs(rr - 1) - 0.15, 0.03) * cov(0.08 - abs(rr - 1), 0.02), K.ink); }      // 大蟒蛇：頭頂一圈淺色紋（A 骨白、B 金）
    if (EL && x < -0.04 && z > -0.02 && nl[1] > -0.35) for (let k = 0; k < 3; k++) { const a = (z - 0.03 - k * 0.05) + (y - 0.02) * 0.9; ink(c, 0.9 * cov(abs(a) - 0.011, 0.005) * smooth(0.04, 0.08, -x) * smooth(0.13, 0.07, abs(y - 0.02)), KE.scar); } };      // 大蟒蛇：右臉一組三道爪痕
  jaw.paint = (c, p, n) => { const [x, y, z] = local(p), nl = [dot3(n, sideV), dot3(n, up), dot3(n, HD)]; put(c, K.belly); ink(c, 0.5 * smooth(0.1, 0.25, abs(x)), K.base); if (nl[1] > 0.35) { put(c, K.mouth); ink(c, 0.5 * smooth(0.02, -0.12, z), K.mouthD); } };
  const fang = (name, q0, q1, q2, r, ang, bone) => { const pts = [q0, q1, q2].map(q => toW(add3(rotX(sub3(q, hinge), ang), hinge))), t = cone(name, 5, pts[0], pts[1], pts[2], r * HS, HD); t.sk = bone; t.col = K.tooth; t.tex = [8, 8]; add(t); return t; };
  for (const sd of [1, -1]) { fang('fangU' + sd, [0.07 * sd, -0.1, 0.24], [0.075 * sd, -0.16, 0.235], [0.07 * sd, -0.21, 0.2], 0.026, -open * 0.45, PY.head);
    for (let i = 0; i < 4; i++) fang('tU' + sd + i, [0.1 * sd + i * 0.012 * sd, -0.1, 0.15 - i * 0.07], [0.1 * sd + i * 0.012 * sd, -0.13, 0.145 - i * 0.07], [0.1 * sd + i * 0.012 * sd, -0.15, 0.135 - i * 0.07], 0.012, -open * 0.45, PY.head);
    for (let i = 0; i < 4; i++) fang('tD' + sd + i, [0.085 * sd + i * 0.012 * sd, -0.06, 0.2 - i * 0.07], [0.085 * sd + i * 0.012 * sd, -0.035, 0.195 - i * 0.07], [0.085 * sd + i * 0.012 * sd, -0.015, 0.185 - i * 0.07], 0.011, open * 0.75, PY.jaw); }
  { const base = toW(add3(rotX(sub3([0, -0.07, 0.05], hinge), open * 0.4), hinge)); for (const sd of [1, -1]) { const tg = horn('tongue' + sd, 5, [base, add3(base, HD, 0.18 * HS), add3(add3(add3(base, HD, 0.3 * HS), sideV, 0.012 * sd * HS), up, -0.03 * HS), add3(add3(add3(base, HD, 0.4 * HS), sideV, 0.05 * sd * HS), up, -0.02 * HS)], 0.014 * HS, { tip: 0.3 }); tg.sk = PY.jaw; tg.col = K.tongue; tg.tex = [8, 8]; add(tg); } }
  { const eo = toW(add3(rotX(sub3([0.0, 0.06, 0.06], hinge), -open * 0.45), hinge)), hit = surf(skull, eo, norm3(add3(sideV, add3(up.map(v => v * 0.25), HD.map(v => v * 0.25)))));
    const ezz = norm3(add3(hit.n, HD.map(v => v * 0.35))), exx = norm3(cross3(up, ezz)), eyy = cross3(ezz, exx), EC = add3(hit.p, ezz, -0.008);
    const eye = ball('eyeL', 12, 4, [0.06 * HS, 0.054 * HS, 0.02 * HS], { vmax: 0.6 }); place(eye, EC, [exx, eyy, ezz]); eye.sk = PY.head; eye.tex = [48, 32]; eye.glow = 1;
    eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.eye); ink(c, smooth(0.3, 0.9, r) * 0.85, K.eyeD); ink(c, cov(h2(d[0] / 0.12, d[1] / 0.55) - 1, 0.15), K.pupil); if (d[2] < 0.12 || d[1] > 0.28 + 0.4 * d[0]) put(c, K.cap); };
    add(eye); add(mirrorP(eye, 'eyeR', reflH)).sk = PY.head;
    const H = HS, br = tubeP('browL', 6, [{ p: [-0.07 * H, 0.03 * H, 0.008 * H], rx: 0.016 * H, ry: 0.016 * H }, { p: [0.0, 0.05 * H, 0.01 * H], rx: 0.022 * H, ry: 0.02 * H }, { p: [0.075 * H, 0.068 * H, -0.004 * H], rx: 0.013 * H, ry: 0.012 * H }], { ref: [0, 0, 1], capA: 0.02 * H, capB: 0.018 * H, capN: 1 }); place(br, EC, [exx, eyy, ezz]); br.sk = PY.head; br.col = K.cap; br.tex = [8, 8]; add(br); add(mirrorP(br, 'browR', reflH)).sk = PY.head;
    if (EL) { const sd = EC[0] < 0 ? -1 : 1, hb = add3(add3(EC, up, 0.07 * H), HD, -0.02 * H), hp = (a, b, c2) => add3(add3(add3(hb, sideV, a * sd * H), up, b * H), HD, c2 * H), hn = horn('browHornL', 6, [hb, hp(0.02, 0.045, -0.07), hp(0.04, 0.095, -0.15), hp(0.04, 0.12, -0.24)], 0.034 * H, { tip: 0.1, capA: 0.02 * H, ref: [1, 0, 0] }); hn.sk = PY.head; hn.col = EA ? KE.bone : KE.gold; hn.tex = [8, 8]; add(hn); add(mirrorP(hn, 'browHornR', reflH)).sk = PY.head; } }      // 大蟒蛇：眉骨上一對往後翹的短角
  // 背上的青苔與水草：幾撮短短的綠毛（跟著所在的脊椎骨）
  [[0.3, 0.2], [0.42, -0.5], [0.52, 0.15], [0.6, 0.6], [0.72, -0.3]].forEach(([tt, a], i) => { const z = -L + tt * L, h = surf(body, [a * 0.15, y0 + 1, z], [0, -1, 0]); if (!h) return;
    for (let j = 0; j < 3; j++) { const b0 = add3(h.p, [j * 0.05 - 0.05, -0.02, j * 0.04 - 0.04]), s = tuftK('moss' + i + j, b0, add3(b0, [0.08 * (j - 1), 0.07 + 0.03 * j, -0.06 + 0.05 * j]), [1, 0, 0], 0.035, 0.015, { nu: 4, bow: 0.4 }); s.sk = spSk(b0[2]); s.col = j % 2 ? K.moss : K.mossL; s.tex = [8, 8]; add(s); } });
  if (EL) { const arcR = (name, c, a, b, R1, R2, rx, ry, nu, arc, nk, nv) => { const keys = []; for (let i = 0; i <= nk; i++) { const t = i / nk * TAU * arc; keys.push({ p: add3(add3(c, a, cos(t) * R1), b, sin(t) * R2), rx, ry }); } return tubeP(name, nu, keys, arc < 1 ? { nv, ref: cross3(a, b), capA: rx * 0.8, capB: rx * 0.8, capN: 1 } : { nv, ref: cross3(a, b) }); };      // 低面數的環（ringPart 一個環就 300 多個三角形，太貴）
    RINGT.forEach((rt, i) => { const z = -L + rt * L, r = PY_RAD(rt), sd = i ? -1 : 1, ax = [sd, 0, 0], ay = [0, -1, 0];      // 兩個斷掉的鐵環：缺口朝上側（俯視看得到斷口）；管子一半埋進身體＝勒進肉裡；第二個（近脖子）粗一點，掛著一小段斷鏈
      const ir = arcR('pyRing' + i, [0, y0, z], ax, ay, r * 0.88 * 0.96, r * 0.96, i ? 0.042 : 0.034, i ? 0.04 : 0.032, 4, 0.74, 9, 17); ir.sk = spSk(z); ir.tex = [48, 16]; ir.paint = (c, p, n, u, v) => { put(c, KE.iron); ink(c, 0.45 * smooth(0.2, 0.9, n[1]), KE.ironL); const rs = sin(u * 29 + sin(v * 37) * 2) * sin(v * 53 + u * 11); ink(c, 0.8 * smooth(0.0, 0.6, rs), KE.rust); }; add(ir);
      if (i) { const dd = norm3([sd * 0.9, -0.4, -0.2]); let c0 = [sd * r * 0.88 + dd[0] * 0.02, y0 + dd[1] * 0.02, z + dd[2] * 0.02];
        for (let k = 0; k < 3; k++) { const ctr = add3(c0, dd, 0.06), aa = k % 2 ? cross3(dd, [0, 0, 1]) : norm3(cross3(dd, [1, 0, 0])), lk = arcR('pyLink' + k, ctr, dd, norm3(aa), 0.062, 0.036, 0.016, 0.016, 4, 1, 6, 13); lk.sk = spSk(z); lk.tex = [16, 16]; lk.paint = ir.paint; add(lk); c0 = add3(ctr, dd, 0.078); } } });
    const top = tt => { const z = -L + tt * L, h = surf(body, [0, y0 + 1, z], [0, -1, 0]); return h ? { z, p: h.p } : null; };
    if (EA) { [[0.3, 0.1, 1], [0.5, -0.1, 0], [0.9, -0.05, 2]].forEach(([tt, xo, ci], i) => { const h = top(tt); if (!h) return; const md = ball('pyMound' + i, 8, 4, [0.15, 0.06, 0.22]); place(md, add3(h.p, [xo, 0.0, 0.0], 1)); md.sk = spSk(h.z); md.col = [K.moss, K.mossL, KE.mossD][ci]; md.tex = [8, 8]; add(md); });      // 青苔墊：背上幾塊隆起的苔
      [[0.22, 0.3], [0.38, -0.4], [0.56, -0.2], [0.7, 0.35], [0.86, 0.1]].forEach(([tt, a], i) => { const z = -L + tt * L, h = surf(body, [a * 0.15, y0 + 1, z], [0, -1, 0]); if (!h) return;      // 多幾撮比較長的青苔與水草
        for (let j = 0; j < 1; j++) { const b0 = add3(h.p, [j * 0.07 - 0.035, -0.02, j * 0.06 - 0.03]), sx = tuftK('moss2' + i + j, b0, add3(b0, [0.1 * (j - 0.5), 0.1 + 0.03 * j, -0.12 + 0.05 * j]), [1, 0, 0], 0.05, 0.018, { nu: 4, bow: 0.45 }); sx.sk = spSk(b0[2]); sx.col = j ? K.mossL : KE.mossD; sx.tex = [8, 8]; add(sx); } }); }
    if (EB) { for (let i = 0; i < 9; i++) { const tt = 0.52 + i * 0.05, h = top(tt); if (!h) continue; const hh = 0.07 + 0.045 * (i / 8), b0 = add3(h.p, [0, -0.03, 0]), sp2 = spike('pySpike' + i, b0, add3(h.p, [0, hh, -0.035]), [0, 0, 1], 0.04, 0.018, 4); sp2.sk = spSk(h.z); sp2.col = i % 2 ? KE.gold : KE.bone; sp2.tex = [8, 8]; add(sp2); } }      // B：背脊一排金色骨刺（脖子那端最高）
  }
  return { parts, bones: BN, legs: [], mane2: 0, tailN: 0, X: {}, bg: K.base, eyeCol: EL ? [0.7, 1, 0.2] : [1, 0.8, 0.1], py: 1, S: { k: 1.15 } };
};

/* ============================== 產生一隻（和 creatures.js 的 makeCreature 一樣的結構，動作用 creatures.js 的 animCreature） ============================== */
const cache = {};
function softShader(sh) {
  sh.uniforms.uGlow = this.userData.glow; sh.uniforms.uDim = this.userData.dim; sh.uniforms.uFade = this.userData.fade; sh.uniforms.uRim = this.userData.rim;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nvarying float vGlow;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 1.0 - vGlow * uDim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * vGlow;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
const CH = ['bx', 'by', 'bz', 'bp', 'br', 'bw', 'rear', 'buck', 'pp', 'pw', 'cp', 'cw', 'cr', 'np', 'nw', 'nr', 'hp', 'hw', 'hr', 'jaw', 'eL', 'eR', 'eS', 'mane', 'tp', 'tc', 'tw', 'rigX', 'rigY', 'rigZ', 'rigP', 'rigW', 'rigR', 'eye', 'sq', 'ssz', 'ssy', 'brow', 'pup'];
const newPose = () => { const o = { L: new Float32Array(32) }; for (const k of CH) o[k] = 0; o.eye = 1; o.pup = 1; return o; };
export const BEAST07_TYPES = () => Object.keys(SOFT);
/* 製作人 11-18：圖生 3D 新模型（和 creatures.js 的 species08 同一套做法）。有 <物種>.json（菁英 <物種>E.json）就用新模型，骨架用模型檔的 joints，
   姿勢參數 S、眼睛顏色等 D 沿用舊模型（世界大小、判定不變）。還沒載好就先用舊模型、下一隻再試；建失敗就永遠用舊模型。 */
function soft08(type, el) { const K8 = type + (el ? '!#8' : '#8'), K0 = type + (el ? '!' : '');
  if (cache[K8]) return cache[K8]; if (cache[K8] === false) return null;
  const d = getModel08(type, el); if (!d || !SOFT[type]) return null;
  try {
    const old = cache[K0] || (cache[K0] = buildSoft(SOFT[type](!!el))), pyk = !!(d.joints && d.joints.py), sk = pyk ? { BN: d.joints.bn.map(b => ({ name: b.name, parent: b.parent, p: b.p.slice() })), legs: [], mane2: 0 } : softSkel(d.joints), BN = sk.BN, vk = VISK08[type + (el ? 'E' : '')] || 1;      /* 沼蟒（py）：骨鍊 sp0–sp25＋head＋jaw 的骨名、位置直接寫在模型檔 joints.bn，不走四足 softSkel */
    if (BN.length !== d.bones.length || BN.some((b, i) => b.name !== d.bones[i])) throw new Error('骨名對不上');
    const one = new THREE.Vector3(1, 1, 1), Mw = BN.map(b => new THREE.Matrix4().compose(new THREE.Vector3(b.p[0], b.p[1], b.p[2]), new THREE.Quaternion(), one)), inv = Mw.map(m => m.clone().invert());
    BN.forEach((b, i) => { const L = b.parent < 0 ? Mw[i].clone() : inv[b.parent].clone().multiply(Mw[i]); b.lp = new THREE.Vector3(); b.lq = new THREE.Quaternion(); L.decompose(b.lp, b.lq, new THREE.Vector3()); });
    return (cache[K8] = Object.assign({}, old, { geo: d.geo, tex: d.tex, bones: BN, legs: sk.legs, mane2: sk.mane2, inv, S: vk !== 1 ? Object.assign({}, old.S, { k: old.S.k * vk }) : old.S, X: {}, D: Object.assign({}, old.D, { face: null, chain: null, X: {}, tailN: pyk ? 0 : d.joints.tail.length, rad: pyk ? d.joints.rad : undefined }), v8: true }));      /* 舊模型的額外骨（眼皮、瞳孔、眉、鍊子）新模型沒有：X 清空 */
  } catch (e) { console.warn('[model08] ' + type + ' 建骨架失敗，沿用舊模型：', e && e.message); cache[K8] = false; return null; }
}
export function makeBeast07(type, size = 1, elite = false) {      // 0.8 A1：elite＝菁英造型（快取鍵 type＋'!'，比照 creatures.js 的 species()；SOFT[type](elite) 自己決定加什麼，一般個體不變）
  const wd = elite === 'warden', ck = type + (elite ? (wd ? '!w' : '!') : ''), sp = (!wd && soft08(type, !!elite)) || cache[ck] || (cache[ck] = buildSoft(SOFT[type](wd ? 'warden' : !!elite))), S = sp.S;      /* X4：'warden'＝獄卒長 */
  const root = new THREE.Group(), tilt = new THREE.Group(), rig = new THREE.Group(); root.add(tilt); tilt.add(rig); root.scale.setScalar(S.k * size * (wd ? 1.12 : 1));
  const bones = sp.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
  sp.bones.forEach((b, i) => { const pp = b.parent < 0 ? [0, 0, 0] : sp.bones[b.parent].p; (b.parent < 0 ? rig : bones[b.parent]).add(bones[i]); if (b.lp) { bones[i].position.copy(b.lp); bones[i].quaternion.copy(b.lq); } else bones[i].position.set(b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]); });
  const mat = new THREE.MeshStandardMaterial({ map: sp.tex, roughness: 0.8, metalness: 0 }); mat.userData.glow = { value: new THREE.Color(0, 0, 0) }; mat.userData.dim = { value: 0 }; mat.userData.fade = { value: 1 }; mat.userData.rim = { value: new THREE.Color(0, 0, 0) }; mat.onBeforeCompile = softShader; mat.customProgramCacheKey = () => 'softcreature';
  const mesh = new THREE.SkinnedMesh(sp.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh); mesh.bind(new THREE.Skeleton(bones, sp.inv), new THREE.Matrix4());
  return beastFinish08({ root, tilt, rig, bones, mesh, eye: null, mats: [mat], mEye: null, sp, S, type, elite: !!elite, phase: Math.random(), seed: Math.random() * 100, T: newPose(), C: newPose(), st: -1, lp: 0, side: 1, yaw: null, yv: 0, sl: [0, 0, 0], fading: false, snap: true,
    rest: bones.map(b => b.position.clone()), restQ: bones.map(b => b.quaternion.clone()), tailN: sp.D.tailN, anim: sp.D.py ? animPython : null, py: !!sp.D.py });
}

/* ============================== 沼蟒的動作：每一幀先「擺一條曲線」（盤蛇、蛇行、抬頭、噴毒、撲纏、扭絞、甩尾、倒地），沿曲線等距取出每根脊椎骨的位置，再平滑靠攏 ============================== */
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _mb = new THREE.Matrix4(), _UP = new THREE.Vector3(0, 1, 0);
// poly：頭 → 尾的一串點；取出 N 個等距點（尾 → 頭）。不夠長就沿最後一段延伸
function pyResample(poly, out) {
  const { N, L } = PY, ds = L / (N - 1); let si = 0, acc = 0, a = poly[0], b = poly[1], sl = hyp(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1e-6;
  out[(N - 1) * 3] = a[0]; out[(N - 1) * 3 + 1] = a[1]; out[(N - 1) * 3 + 2] = a[2];
  for (let k = 1; k < N; k++) { const s = k * ds;
    while (acc + sl < s && si < poly.length - 2) { acc += sl; si++; a = poly[si]; b = poly[si + 1]; sl = hyp(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1e-6; }
    const f = (s - acc) / sl, o = (N - 1 - k) * 3; out[o] = a[0] + (b[0] - a[0]) * f; out[o + 1] = a[1] + (b[1] - a[1]) * f; out[o + 2] = a[2] + (b[2] - a[2]) * f; }
  return out;
}
// 盤在地上的螺旋（從 p 接著往裡繞）
function pySpiral(poly, C, a0, R0, du, U, yFn) { for (let u = du; u <= U; u += du) { const R = Math.max(0.24, R0 - 0.075 * u), a = a0 - u; poly.push([C[0] + sin(a) * R, yFn ? yFn(R, u) : 0.1 + 0.17 * smooth(0.25, 0.9, R), C[2] + cos(a) * R]); } return poly; }
const PYC = [0, 0, -0.25];
// 盤蛇：頭抬高成 S 形（alert 越大越高、越往後縮）；back：頭再往後拉（預備）；fwd：頭往前探
function pyCoil(o) {
  const al = o.alert || 0, bk = o.back || 0, fw = o.fwd || 0, lk = o.look || 0, br = 0.03 * sin(o.t * 1.3);
  const H = [0.12 + 0.25 * lk, 1.38 + 0.25 * al + 0.3 * bk - 0.15 * fw + br, 0.9 - 0.2 * al - 0.6 * bk + 0.55 * fw];
  const p1 = [0.16 + 0.12 * lk, H[1] - 0.34 + 0.05 * bk, H[2] - 0.36 + 0.3 * bk - 0.15 * fw], p2 = [0.38, H[1] - 0.78 + 0.1 * bk, 0.4 + 0.1 * bk], p3 = [0.5, 0.55, 0.42], p4 = [0.36, 0.28, 0.7];
  const poly = [H, p1, p2, p3, p4], a0 = Math.atan2(p4[0] - PYC[0], p4[2] - PYC[2]), R0 = hyp(p4[0] - PYC[0], p4[2] - PYC[2]);
  return pySpiral(poly, PYC, a0, R0, 0.12, 12, o.tailUp ? (R, u) => 0.1 + 0.17 * smooth(0.25, 0.9, R) + o.tailUp * smooth(5.5, 8, u) : null);
}
// 蛇行：頭微抬往前，身體在後面左右擺（波往後傳，看起來像沿著同一條路滑過去）
function pySlither(o) {
  const hh = o.hh ?? 0.6, A = o.A ?? 0.42, ext = o.ext || 0, H = [0, hh, 1.6 + ext], poly = [H, [0, hh - 0.12, 1.15 + ext * 0.85], [0, 0.3, 0.55 + ext * 0.5]];
  for (let s = 0.15; s < 9.5; s += 0.15) poly.push([A * sin(s * 2.4 + o.ph) * smooth(0, 1.4, s), 0.27 - 0.14 * smooth(4, 7.5, s), 0.55 + ext * 0.5 - s * 0.9]);
  return poly;
}
// 纏繞：圍著原點（被纏的人）往下繞成螺旋，頭在上面對著那個人的臉；sq：勒緊的程度
function pyCrush(o) {
  const sq = o.sq || 0, R = 0.6 - 0.09 * sq, H = [0.05, 1.78, 0.66 - 0.05 * sq], poly = [H, [0.42, 1.66, 0.5]], T = 2.5 * TAU;
  for (let u = 0; u <= T; u += 0.2) { const a = 0.9 + u, y = 1.48 - u / T * 1.2; poly.push([sin(a) * R * (1 + 0.04 * sin(o.t * 9 + u)), y, cos(a) * R]); }
  const last = poly[poly.length - 1], a1 = 0.9 + T; for (let u = 0.2; u < 6; u += 0.2) { const Rr = R + u * 0.16; poly.push([sin(a1 + u) * Rr, 0.16, cos(a1 + u) * Rr]); }
  return poly;
}
// 甩尾：前半身照樣盤著抬頭，尾巴從盤圈伸出去、繞著身體掃一圈（a：尾巴的方位角）
function pyTail(o) {
  const poly = pyCoil({ alert: 1, t: o.t, back: 0.15 }).slice(0, 5); const p4 = poly[4], a0 = Math.atan2(p4[0] - PYC[0], p4[2] - PYC[2]), R0 = hyp(p4[0] - PYC[0], p4[2] - PYC[2]);
  pySpiral(poly, PYC, a0, R0, 0.12, 3.6); const q = poly[poly.length - 1], lift = o.lift || 0;
  for (let k = 1; k <= 16; k++) { const f = k / 16, a = o.a + (1 - f) * 0.9, R = lerp(hyp(q[0] - PYC[0], q[2] - PYC[2]), 3.1, smooth(0, 1, f)); poly.push([PYC[0] + sin(a) * R, 0.14 + (0.4 + lift * 0.9) * sin(PI * Math.min(1, f * 1.25)), PYC[2] + cos(a) * R]); }      // 尾巴離地甩（高過草）
  return poly;
}
function pyDead(o) { const H = [0.35, 0.2, 1.5], poly = [H]; for (let s = 0.2; s < 9; s += 0.2) poly.push([0.35 + 0.75 * sin(s * 0.85), 0.2 - 0.08 * smooth(4, 7, s), 1.5 - s * 0.92]); return poly; }
const PYT = {};      // 暫存（避免每幀配置）
const pyBuf = k => PYT[k] || (PYT[k] = new Float32Array(PY.N * 3));
function pyMix(dst, a, b, w) { for (let i = 0; i < dst.length; i++) dst[i] = a[i] + (b[i] - a[i]) * w; return dst; }
export function animPython(m, v, dt, t) {
  const st = v.st | 0, p = v.stT || 0, an = (v.act && v.act.anim) || '', N = PY.N, ds = PY.L / (N - 1), sc = m.root.scale.x;
  if (!m.P) { m.P = new Float32Array(N * 3); m.hd = new THREE.Vector3(0, 0, 1); m.jawC = 0; m.ph = 0; m.snap = true; m.recoil = 0; }
  const sp = (v.speed || 0) / sc; m.ph -= sp * dt * 2.4 / 0.9;
  if (st !== m.st) { m.pst = m.st; m.st = st; if (st === 6) m.side = Math.random() < 0.5 ? -1 : 1; }
  const T = pyBuf('T'), A = pyBuf('A'), Bf = pyBuf('B'); let rate = 9, jaw = 0, hd = null, glow = 0, eyeK = 1;
  const look = clamp(v.look || 0, -1, 1), mv = smooth(0.25, 1.2, sp), alert = st === 1 || st === 8 ? 1 : st === 0 ? 0 : 0.6;
  const coilOrSlither = (al, extra = {}) => { pyResample(pyCoil(Object.assign({ alert: al, t, look }, extra)), A); if (mv > 0.01) { pyResample(pySlither({ ph: m.ph }), Bf); pyMix(T, A, Bf, mv); } else T.set(A); };
  if (st === 6) {      // 倒下：身體一鬆攤在地上
    pyResample(pyDead({ t }), T); rate = 4; jaw = 0.35;
  } else if (st === 2) {      // 預備
    const k = clamp(p / Math.max(0.05, (v.act && v.act.wind) || 0.6), 0, 1), e = smooth(0, 1, k); glow = 1; eyeK = 2; rate = 10;
    if (an === 'spit') { pyResample(pyCoil({ alert: 1, back: 0.9 * e, t }), T); jaw = 0.15 + 0.35 * e + 0.05 * sin(p * 40); hd = [0, 0.55 * e, 1]; }      // 往後仰、鼓起脖子、嘴慢慢張開
    else if (an === 'coil') { pyResample(pyCoil({ alert: 1, back: 0.7 * e, t }), T); jaw = 0.3 + 0.08 * sin(p * 50); hd = [0, -0.1, 1]; }      // 頭縮成緊繃的 S 形，嘶嘶作響
    else if (an === 'sweep') { pyResample(pyTail({ a: -1.2 - 0.5 * e, lift: 0.6 * e, t }), T); jaw = 0.2; }      // 尾巴抬起來往後收
    else coilOrSlither(1);
  } else if (st === 3) {      // 出招
    const s = clamp(p / Math.max(0.05, (v.act && v.act.strike) || 0.3), 0, 1); glow = 1; eyeK = 2.4; rate = 26;
    if (an === 'spit') { pyResample(pyCoil({ alert: 1, fwd: 1 - 0.4 * s, t }), T); jaw = 0.55 * (1 - 0.6 * s); hd = [0, 0.15, 1]; }
    else if (an === 'coil') { pyResample(pySlither({ ph: m.ph, hh: 0.75, A: 0.18, ext: 1.6 * sin(PI * Math.min(1, s * 1.15)) }), T); jaw = s < 0.7 ? 0.5 : 0.1; hd = [0, -0.25, 1]; rate = 30; }
    else if (an === 'crush') { const sq = 0.5 + 0.5 * Math.max(0, sin(p * TAU * 0.9)); pyResample(pyCrush({ sq, t }), T); jaw = 0.25 + 0.1 * sq; hd = [0, -0.35, -1]; rate = 7; glow = 0.6; }
    else if (an === 'sweep') { pyResample(pyTail({ a: lerp(-1.7, -1.7 + TAU, smooth(0, 1, s)), lift: 0.35 * (1 - s), t }), T); jaw = 0.25; rate = 34; }
    else coilOrSlither(1);
  } else if (st === 4) {      // 收招：慢慢盤回去；撲空時頭栽在地上喘一下
    const R0 = Math.max(0.05, (v.act && v.act.recover) || 0.6), r = clamp(p / R0, 0, 1);
    if (an === 'crush') { pyResample(pyCrush({ sq: 0, t }), A); A.forEach((x, i) => { if (i % 3 !== 1) A[i] = x * (1 + 0.9 * r); }); pyResample(pyCoil({ alert: 1, t }), Bf); pyMix(T, A, Bf, smooth(0.3, 1, r)); rate = 6; jaw = 0.3 * (1 - r); }      // 鬆開：圈往外張、再盤回去
    else if (v.act && v.act.whiff) { pyResample(pySlither({ ph: m.ph, hh: 0.3, A: 0.15, ext: 1.2 * (1 - r) }), T); jaw = 0.25; rate = 8; }
    else { coilOrSlither(1); rate = 7; jaw = 0.12 * (1 - r); }
  } else if (st === 5) {      // 受擊：頭被打得往後仰、全身一抖
    coilOrSlither(0.8); m.recoil = Math.max(m.recoil, 1 - p / 0.4); rate = 14; jaw = 0.35 * Math.exp(-p * 6);
  } else if (st === 7) coilOrSlither(0.5);
  else { coilOrSlither(alert); jaw = st === 1 ? 0.08 + 0.05 * Math.max(0, sin(t * 3.1 + m.seed)) : 0.02; if (st === 1) eyeK = 1.5; }
  // 被打到（hitCreature 記在 m.hit）：頭往受力方向甩一下
  const H = m.hit; let hx = 0, hz = 0; if (H) { H.hw *= Math.exp(-7 * dt); H.hp *= Math.exp(-7 * dt); hx = H.hw * 0.5; hz = -H.hp * 0.5; m.recoil = Math.max(m.recoil, Math.abs(H.hp) * 0.8); }
  m.recoil *= Math.exp(-5 * dt);
  if (m.recoil > 0.01 || hx) for (let i = Math.floor(N * 0.65); i < N; i++) { const w = smooth(N * 0.65, N - 1, i), o = i * 3; T[o] += hx * w; T[o + 1] += 0.35 * m.recoil * w; T[o + 2] += (-0.5 * m.recoil + hz) * w; }
  // 靠攏 → 保持每節長度（從頭往尾拉）→ 不陷進地面
  const P = m.P, kb = m.snap ? 1 : 1 - Math.exp(-rate * dt); m.snap = false;
  for (let i = 0; i < P.length; i++) P[i] += (T[i] - P[i]) * kb;
  for (let i = N - 2; i >= 0; i--) { const o = i * 3, q = o + 3, dx = P[o] - P[q], dy = P[o + 1] - P[q + 1], dz = P[o + 2] - P[q + 2], l = hyp(dx, dy, dz) || 1e-6; P[o] = P[q] + dx / l * ds; P[o + 1] = P[q + 1] + dy / l * ds; P[o + 2] = P[q + 2] + dz / l * ds; }
  for (let i = 0; i < N; i++) { const r = (m.sp.D.rad ? m.sp.D.rad[i] : PY_RAD(i / (N - 1))) * 0.92; if (P[i * 3 + 1] < r) P[i * 3 + 1] = r; }      /* 新模型（D.rad）：用模型自己每節的半徑 */
  // 骨頭：位置＝曲線上的點；朝向＝沿身體往頭的方向（肚子朝下）
  const Bn = m.bones;
  for (let i = 0; i < N; i++) { const a = Math.max(0, i - 1) * 3, b = Math.min(N - 1, i + 1) * 3; _bz.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]).normalize(); _bx.crossVectors(_UP, _bz); if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0); _bx.normalize(); _by.crossVectors(_bz, _bx);
    _mb.makeBasis(_bx, _by, _bz); Bn[i].quaternion.setFromRotationMatrix(_mb); Bn[i].position.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
  { const o = (N - 1) * 3, q = (N - 2) * 3; _bz.set(P[o] - P[q], P[o + 1] - P[q + 1], P[o + 2] - P[q + 2]).normalize(); if (hd) { _bx.set(hd[0], hd[1], hd[2]).normalize(); _bz.lerp(_bx, 0.7).normalize(); } else _bz.y *= 0.4, _bz.normalize();
    m.hd.lerp(_bz, m.hd.lengthSq() < 0.5 ? 1 : 1 - Math.exp(-rate * 1.4 * dt)).normalize(); _bz.copy(m.hd); _bx.crossVectors(_UP, _bz); if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0); _bx.normalize(); _by.crossVectors(_bz, _bx); _mb.makeBasis(_bx, _by, _bz);
    Bn[PY.head].quaternion.setFromRotationMatrix(_mb); Bn[PY.head].position.set(P[o], P[o + 1], P[o + 2]); }
  m.jawC += (jaw - m.jawC) * (1 - Math.exp(-14 * dt)); Bn[PY.jaw].rotation.set(m.sp.D.rad ? clamp(-0.115 + Math.max(0, m.jawC - 0.14) * 2.2, -0.115, 1.05) : clamp(m.jawC, -0.15, 0.7) - 0.05, 0, 0);      /* 新模型（D.rad）：嘴縫是楔形、綁定姿勢張開 0.10 rad → 閉嘴＝-0.115（多壓一點讓唇線貼緊）；jawC 超過 0.14 才開，放大 2.2 倍、最大約 60°（舊模型照舊）*/
  // 眼睛發光、受擊閃光、死亡淡出（照 creatures.js 的做法）
  const mat = m.mats[0], G = mat.userData.glow.value, ec = m.sp.D.eyeCol, kk = st === 6 ? 0 : 0.16 + 0.22 * (eyeK - 1), gl = Math.max(glow, v.enr && st !== 6 ? 0.9 : 0);
  G.setRGB(lerp(ec[0] * kk, 1.05, gl), lerp(ec[1] * kk, 0.04, gl), lerp(ec[2] * kk, 0.012, gl)); mat.userData.dim.value = 0.95 * gl;
  const op = st === 6 ? 1 - clamp((p - 2.0) / 1.2, 0, 1) : 1; { const of = op * (m.camFade == null ? 1 : m.camFade); mat.userData.fade.value = of; mat.opacity = of; }
  { const f2 = clamp(v.flash || 0, 0, 1) ** 2, tn = v.ftone | 0, c = tn === 1 ? [0.5, 0.66, 0.95] : tn === 2 ? [1.0, 0.72, 0.3] : [0.95, 0.86, 0.74], R = mat.userData.rim, kb2 = f2 * 0.75, kr = f2 * 0.8; mat.emissive.setRGB(kb2 * c[0], kb2 * c[1], kb2 * c[2]); R.value.setRGB(kr * c[0], kr * c[1], kr * c[2]); }
  m.root.visible = op > 0.01;
}
