/* 0.8 新模型（m.sp.v8）的踏地：著地的腳「釘」在世界座標，不再被身體帶著滑。
   掛接：anim08.js 在 anim08() 開頭呼叫 gaitPre（算步幅、步頻）、結尾呼叫 gaitPost（算四隻腳的目標，直接寫進 m.C.L，並讓身體隨腳下蹲）；
         creatures.js gait() 的相位推進改用 m.f8（本檔算出的步頻；沒有就用舊的），共 1 處。舊模型不經過這裡，行為完全不變。
   為什麼會滑（診斷見 gait-08/進度.md）：
     1 新模型站姿腿是伸直的（髖到踝的垂直距離÷腿長 0.96~0.998），腳能水平移動的範圍只有 ±0.1 上下，但舊步幅的一半（0.2~0.45）遠超過 → IK 把腳硬拉短，著地腳被拖著走；
     2 腳目標算在身體座標裡：轉彎、變速、身體晃動時，著地腳跟著身體跑；停下時直接朝中立位置滑回去；
     3 站姿落腳點比髖部投影靠前（猴 +0.09、猩猩 +0.18），著地範圍偏前、可達範圍白白用掉一半。
   做法：
     著地期：腳的世界 (x,z) 在落地那一刻就固定，每幀只把它換算回身體座標給 IK；
     抬腳期：從離地點沿弧線到「落腳點」（髖部投影＋沿前進方向半個步幅＝髖投影＋速度×半個著地期），落腳點在身體座標裡算，轉彎、變速時自己修正；
     步幅 Ls：min(速度×著地比÷自然步頻, 舊步幅上限, 可達範圍上限)；可達範圍＝腿長（a+b）與髖高算出來的、身體最多蹲 crouch（比例）下能踩到的水平距離；步頻 f ＝ 速度×著地比÷Ls；
     身體隨腳下蹲：每幀算四隻腳目標離髖的距離，不夠長就把身體壓低一點（只在移動時），腳才踩得到；
     停下：移動速度低於門檻就改成「補步」——腳離中立位置太遠時，對角兩隻一組輪流抬起、踏回中立位置；原地轉身同理；
     不是行走狀態（出招、受擊、死亡、做特別姿勢）：不接手，原本的動作照舊；之後回到行走，從當下位置接續。 */
import * as THREE from './three.bundle.js';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const GO = [-0.04, 0.22, 0, 0.22];      /* 同 anim08 gallopShift：野牛奔跑的相位差 */
const LOG = ev => { if (typeof window !== 'undefined' && window.__g8log) window.__g8log.push(ev.concat([window.__g8i])); };
const DTMAX = 0.06, MINLIFT = 0.07, ROLLK = 0.4, KP = 0.955, KR = 0.975, FMAX = 9, MOVE_ON = 0.3, MOVE_OFF = 0.2, TST = 0.26;
const _M = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _v = new THREE.Vector3();

function init(m, a) {
  const lgs = m.sp.legs, P = a.P; if (m.anim || (m.sp.D && m.sp.D.py) || !lgs || lgs.length !== 4 || P.plant === false) return null;      /* 沼蟒（自己的 animPython、沒有腿）等沒有四條腿的不接手 */
  const bn = m.sp.bones, ix = s => bn.findIndex(b => b.name === s), b0 = m.rest[a.body]; if (!b0) return null;
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const lg = lgs[i], j = ix('leg' + i + 'a'); if (!lg || j < 0 || !(lg.a > 0) || !lg.pad || !lg.f0) return null;
    const hip = bn[j].p, Ll = lg.a + lg.b, hs = hip[1] - (lg.pad[1] - lg.f0.y), e0 = lg.pad[2] - lg.f0.z - hip[2], coff = e0 * 0.35;
    legs.push({ i, sx: i & 1 ? -1 : 1, pad: lg.pad, f0: lg.f0, hip, Ll, hs, dx: Math.abs(lg.pad[0] - lg.f0.x - hip[0]), zc: hip[2] + lg.f0.z + coff, coff,
      sw: false, tm: false, s: 0, T: 0.3, lh: 0, armed: true, px: 0, pz: 0, lx: 0, lz: 0, ay: 0 });
  }
  const hm = legs.reduce((s, l) => s + l.hs, 0) / 4, cmax = (P.crouch != null ? P.crouch : 0.15) * hm;
  /* 可達範圍上限：蹲 cmax 之後，每隻腳在「中心±Ls/2」都踩得到 */
  let cap = 9; for (const l of legs) { const r = KP * l.Ll, bm = 0.02 * l.Ll, rad = r * r - l.dx * l.dx - Math.pow(l.hs + bm - cmax, 2); cap = Math.min(cap, 2 * (Math.sqrt(Math.max(0, rad)) - Math.abs(l.coff))); }
  return { legs, cmax, cap: Math.max(0.06, cap), brest: [b0.x, b0.y, b0.z], on: false, moving: false, wm: 0, cs: 0 };
}

/* 開頭：算步幅、步頻、每隻腳的相位。回傳 pre（或 null＝不接手） */
export function gaitPre(m, a, sp, dt, loco) {
  const G = a.g === undefined ? (a.g = init(m, a)) : a.g; if (!G) return null;
  if (dt > DTMAX) { G.on = false; G.cs = 0; G.moving = false; m.f8 = 0; return null; }      /* 一幀超過 0.06 秒（遠處 LOD 隔幀更新、或卡頓）：腳跟不上，這種時候不釘地，用原本的步態（遠處看不出來） */
  const S = m.S, g = clamp(sp / (m.run || 1), 0, 1.5), wW = 1 - sm(0.3, 0.5, g), wG = sm(0.62, 0.85, g), wT = 1 - wW - wG;
  const duty = 0.64 * wW + 0.5 * wT + 0.38 * wG, Lmax = S.stride * (0.62 * wW + 0.85 * wT + 1.05 * wG), f0 = (0.95 + 1.45 * Math.min(g, 1)) * S.cad;
  if (G.moving ? sp < MOVE_OFF : sp > MOVE_ON) G.moving = !G.moving; if (!loco) G.moving = false;
  const Ls0 = Math.min(Lmax, G.cap), f = clamp(Math.max(f0, sp * duty / Ls0), 0.1, FMAX), Ls = sp * duty / f;
  m.f8 = G.moving ? f : 0;
  const ph = m.phase, q = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) { const off = i === 0 ? 0.25 * wW + 0.5 * wT + 0.5 * wG : i === 1 ? 0.75 * wW + wT + 0.62 * wG : i === 2 ? 0 : 0.5 * wW + 0.5 * wT + 0.12 * wG; q[i] = ((ph + off + (a.P.gallop ? GO[i] * wG : 0)) % 1 + 1) % 1; }
  return { duty, f, Ls, q, lift: Math.max(S.lift * (0.55 * wW + 0.85 * wT + 1.2 * wG), MINLIFT / (m.root.scale.x || 1)) };      /* 不管多小隻，腳至少抬離地面 7 公分（草、石頭、地面起伏） */
}

/* 結尾（骨頭動作都疊完之後、solveLegs 之前）：算四隻腳的目標寫進 C.L，身體下蹲 */
const _m1 = new THREE.Matrix4(), _p = new THREE.Vector3();
export function gaitPost(m, a, v, dt, sp, loco, pre) {
  const G = a.g; if (!G || !pre) return;
  const C = m.C, L = C.L, U = m.S.u || 1, B = m.bones, body = B[a.body], legs = G.legs;
  if (!loco || (L[3] > 0.001 || L[11] > 0.001 || L[19] > 0.001 || L[27] > 0.001)) { G.on = false; G.cs = 0; return; }
  m.rig.updateWorldMatrix(true, false); _M.copy(m.rig.matrixWorld); _Mi.copy(_M).invert(); const e = _Mi.elements, ok5 = Math.abs(e[5]) > 1e-3, c0x = _M.elements[12], c0z = _M.elements[14];
  const toW = (x, y, z) => { _v.set(x, y, z).applyMatrix4(_M); return [_v.x, _v.z]; };
  const toL = (wx, wz, ly) => { const yw = ok5 ? (ly - e[1] * wx - e[9] * wz - e[13]) / e[5] : 0; _v.set(wx, yw, wz).applyMatrix4(_Mi); return [_v.x, _v.z]; };
  const cur = l => { const o = l.i * 8; return [l.pad[0] + L[o] * l.sx * U, l.pad[1] + L[o + 1] * U, l.pad[2] + L[o + 2] * U]; };
  /* 身體在世界裡的速度（用來預測「落地那一刻」落腳點在世界哪裡：落腳點在身體座標裡固定，身體還在前進，所以世界座標要加上 速度×剩餘時間；轉彎再加上偏航速度） */
  if (!G.on || G.pw == null || !(dt > 0)) { G.vx = G.vz = 0; } else { const kv = 1 - Math.exp(-25 * dt); G.vx += (clamp((c0x - G.pw[0]) / dt, -40, 40) - G.vx) * kv; G.vz += (clamp((c0z - G.pw[1]) / dt, -40, 40) - G.vz) * kv; }
  G.pw = [c0x, c0z];
  if (!G.on) { G.on = true; for (const l of legs) { const c = cur(l), w = toW(c[0], c[1], c[2]); l.px = w[0]; l.pz = w[1]; l.cw = null; l.sw = false; l.tm = false; l.armed = true; } }
  const mov = G.moving, k = dt > 0 ? 1 - Math.exp(-8 * dt) : 0; G.wm += ((mov ? 1 : 0) - G.wm) * k; const w = G.wm, { duty, Ls, q } = pre, yv = clamp(m.yv || 0, -6, 6);
  const dx = Math.sin(m.md || 0), dz = Math.cos(m.md || 0), mvk = a.mv, Tsw = clamp((1 - duty) / pre.f, 0.08, 0.5);
  const land = l => [l.pad[0] + w * (l.pad[0] + dx * Ls * 0.5 - l.pad[0]), l.pad[2] + w * (l.zc + dz * Ls * 0.5 - l.pad[2])];      /* 落腳點（身體座標）：停下時漸漸回到站姿位置 */
  const predW = (l, tau) => { const t = land(l), wl = toW(t[0], l.pad[1], t[1]), th = yv * tau, cs = Math.cos(th), sn = Math.sin(th), ex = wl[0] - c0x, ez = wl[1] - c0z; return [c0x + ex * cs + ez * sn + G.vx * tau, c0z - ex * sn + ez * cs + G.vz * tau]; };
  const plant = l => { const t = land(l), t0 = toW(t[0], l.pad[1], t[1]), p = l.cw ? l.cw : toW(t[0], l.pad[1], t[1]); LOG(['plant', l.i, l.tm ? 'T' : 'P', Math.hypot(p[0] - t0[0], p[1] - t0[1]), l.s]); l.px = p[0]; l.pz = p[1]; };
  const lift = (l, forced) => { LOG(['lift', l.i, forced ? 'F' : 'P', Ls, mov]); l.sw = true; l.tm = forced; l.s = 0; l.T = forced ? Tsw : 0.3; l.lh = Math.max(m.S.lift * 0.8, 0.05 / (m.root.scale.x || 1)); const p = toL(l.px, l.pz, l.pad[1]), wp = toW(p[0], l.pad[1], p[1]); l.lx = wp[0]; l.lz = wp[1]; };
  let air = 0; for (const l of legs) if (l.sw) air++;
  for (const l of legs) {
    const cx = l.pad[0], cz = l.zc, qi = q[l.i];
    if (dt > 0) {
      if (l.sw) {
        if (l.tm) { l.s += dt / l.T; if (l.s >= 1) { l.sw = false; l.armed = qi < duty; air--; plant(l); } }
        else if (!mov) { l.tm = true; l.T = TST; l.lh = Math.max(m.S.lift * 0.8, 0.05 / (m.root.scale.x || 1)); }
        else if (qi < duty) { l.sw = false; l.armed = true; air--; plant(l); }
        else l.s = (qi - duty) / (1 - duty);
      } else if (mov) {
        const p = toL(l.px, l.pz, l.pad[1]), rx = p[0] - cx, rz = p[1] - cz, along = rx * dx + rz * dz, dist = Math.hypot(rx, rz);
        if (qi < duty) l.armed = true;
        if (qi >= duty && l.armed) { l.armed = false; lift(l, false); air++; }
        else if (air < 2 && (along < -0.5 * Ls * 1.25 - 0.015 || dist > 0.8 * Ls + 0.03 || l.nd > G.cmax * 1.2)) { lift(l, true); air++; }      /* 提早抬腳：腳已經落後太多、或身體已經要蹲太低才踩得到（起步、減速、轉彎） */
      }
    }
  }
  /* 停下／原地轉身：沒有任何腳在空中時，挑誤差最大的一組（對角兩隻）補步 */
  if (!mov && air === 0 && dt > 0) {
    const er = [0, 0, 0, 0]; for (const l of legs) { const p = toL(l.px, l.pz, l.pad[1]); er[l.i] = Math.hypot(p[0] - l.pad[0], p[1] - l.pad[2]) / l.Ll; }
    const pe = [Math.max(er[0], er[3]), Math.max(er[1], er[2])], best = pe[0] > 0.07 || pe[1] > 0.07 ? (pe[0] >= pe[1] ? 0 : 1) : -1;
    if (best >= 0) for (const l of legs) if ((l.i === 0 || l.i === 3) === (best === 0) && er[l.i] > 0.035) lift(l, true), l.T = TST;
  }
  /* 髖（含身體俯仰、胸／骨盆轉動）的實際位置：和 solveLegs 同一套矩陣 */
  body.updateMatrix(); const hips = [];
  for (let h = 0; h < 2; h++) { const par = B[h ? a.pelvis : a.chest]; par.updateMatrix(); _m1.multiplyMatrices(body.matrix, par.matrix); for (let s = 0; s < 2; s++) { const i = h * 2 + s; _p.copy(B[a.leg0 + i * 3].position).applyMatrix4(_m1); hips[i] = [_p.x, _p.y, _p.z]; } }
  /* 寫進 C.L；順便算每隻腳要踩得到，身體最多能有多高 */
  const qi0 = l => q[l.i]; let need = 0;
  for (const l of legs) {
    const o = l.i * 8; let rx, ry, rz;
    if (l.sw) {
      const s = clamp(l.s, 0, 1), e1 = sm(0.18, 0.86, s), ar = Math.pow(Math.sin(Math.PI * s), 0.55) * (l.tm ? l.lh : pre.lift * mvk), tau = (1 - s) * (l.tm ? l.T : Tsw), wp = predW(l, tau);
      const wx = l.lx + (wp[0] - l.lx) * e1, wz = l.lz + (wp[1] - l.lz) * e1, p = toL(wx, wz, l.pad[1] + ar); rx = p[0]; ry = l.pad[1] + ar; rz = p[1];      /* 水平移動集中在中間 80%：離地先垂直抬起、落地前先垂直放下 */
    } else { const p = toL(l.px, l.pz, l.pad[1]); rx = p[0]; ry = l.pad[1]; rz = p[1]; }
    if (Math.hypot(rx - l.pad[0], rz - l.pad[2]) > 2.2 * l.Ll + Ls) { LOG(['teleport', l.i, rx, rz, Ls]); rx = l.pad[0]; rz = l.pad[2]; ry = l.pad[1]; const wp = toW(rx, ry, rz); l.px = wp[0]; l.pz = wp[1]; l.sw = false; l.armed = true; }      /* 瞬移或被推開太遠：重新站好 */
    l.cw = toW(rx, ry, rz);      /* 這一幀腳在世界的位置：下一幀落地時就「踩在原地」，不會有一格的跳動 */
    L[o] = (rx - l.pad[0]) * l.sx / U; L[o + 1] = (ry - l.pad[1]) / U; L[o + 2] = (rz - l.pad[2]) / U;
    /* 腳掌俯仰：著地期把「腳跟抬起、腳尖壓地」的滾動幅度縮小（腳掌接地點本來就釘住了，但踝骨會被滾動帶著前後移動，看起來像在滑）；抬腳期照原本 */
    if (l.fp == null) l.fp = L[o + 7]; const gt = L[o + 7], rs = clamp(qi0(l) / duty, 0, 1), ft = !l.sw && mov ? ROLLK * (0.4 * sm(0.65, 1, rs) - 0.1 * (1 - sm(0, 0.2, rs))) * mvk * (0.4 + 0.6 * Math.max(0, dz)) : gt;
    l.fp += (ft - l.fp) * (dt > 0 ? 1 - Math.exp(-30 * dt) : 0); L[o + 7] = l.fp;
    const th = L[o + 7], ct = Math.cos(th), st = Math.sin(th), ax = rx - l.f0.x, ay = ry - (l.f0.y * ct - l.f0.z * st), az = rz - (l.f0.y * st + l.f0.z * ct), hp = hips[l.i];      /* 踝＝腳掌點減去腳掌俯仰後的 f0 */
    const dh = Math.hypot(ax - hp[0], az - hp[2]), R = KR * l.Ll, reach = Math.sqrt(Math.max(0, R * R - dh * dh)); const nd = hp[1] - ay - reach; l.nd = nd; need = Math.max(need, nd); (G.dbg || (G.dbg = []))[l.i] = [+nd.toFixed(3), +dh.toFixed(3), +(hp[1] - ay).toFixed(3), +(l.Ll).toFixed(3)];
  }
  need = clamp(need, 0, G.cmax * 1.7) * w; G.cs = dt > 0 ? Math.max(need, G.cs * Math.exp(-14 * dt)) : Math.max(need, G.cs); body.position.y -= G.cs;
}
