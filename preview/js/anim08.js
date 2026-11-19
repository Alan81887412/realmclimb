/* 0.8 圖生 3D 新模型（m.sp.v8）的額外動作：整身不要像「同一個姿勢在平移」。
   掛接：creatures.js animCreature 在 solveLegs 之前呼叫一次（只有 v8 模型才呼叫，舊模型完全不經過這裡）。
   這裡只「疊加」骨頭旋轉／位置（每幀 animCreature 都會從頭設一次骨頭，所以不會累積），腳是 IK 站在地上，
   身體、脊椎、頭頸、耳尾的擺動放在 solveLegs 之前，腳會自動補償、不會被帶著滑。
   內容：
   1 步幅／抬腳依新模型調整（m.S 複製後覆寫，舊模型共用的 S 不動）
   2 走路：脊椎左右蛇行（胸與骨盆反向）、重心左右換邊的側傾、每步一上一下的起伏、頭頸反向穩定＋慢半拍的點頭（鬃毛綁在頸與胸，跟著甩）
   3 耳朵、尾巴：慢半拍的行進波（尾巴一節一節延遲）
   4 轉彎：身體往轉向側彎、後半身甩出去
   5 待機：呼吸（胸口脹縮＋身體微升降）、重心慢慢換腳、偶爾甩耳、尾巴行進波 */
import * as THREE from './three.bundle.js';
import { gaitPre, gaitPost } from './gait08.js';      /* 著地腳釘在世界座標（foot planting）*/
const TAU = Math.PI * 2, clamp = (x, a, b) => Math.min(b, Math.max(a, x)), sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
/* 各物種倍率：sway 脊椎蛇行、roll 側傾、bob 起伏、nod 頭頸點頭、tail 尾巴波、stride／lift 步幅與抬腳倍率（相對舊參數）、breath 呼吸 */
const DEF = { spread: 0.6, gallop: 0, tailX: 0, sway: 1, roll: 1, bob: 1, nod: 1, tail: 1, stride: 1.3, lift: 1.1, breath: 1 };
const PROF = {
  boar: { crouch: 0.2, sway: 1.2, roll: 1.2, stride: 1.3, lift: 1.1 }, bison: { gallop: 1, sway: 1.2, roll: 1.7, bob: 1.7, nod: 1.5, stride: 1.4, lift: 1.3, breath: 1.3 },
  tiger: { tailX: 0.05, sway: 1.25, roll: 1, tail: 0.6, stride: 1.25, lift: 1.15 }, bear: { sway: 1.3, roll: 1.7, bob: 1.35, nod: 1.2, stride: 1.3, lift: 1.1, breath: 1.3 },
  wolf: { sway: 1.2, roll: 1, tail: 0.8, stride: 1.25, lift: 1.15 }, deer: { sway: 1, roll: 0.9, nod: 1.5, stride: 1.45, lift: 1.1 },
  porc: { crouch: 0.22, sway: 1.5, roll: 1.4, bob: 1.2, stride: 1.25, lift: 1.1 }, monkey: { crouch: 0.24, spread: 0.4, tailX: 0.1, sway: 1.3, roll: 1.2, bob: 1.4, nod: 1.2, stride: 1.7, lift: 1.2 },
};
const find = (m, re) => { const o = []; m.bones.forEach((b, i) => { if (re.test(b.name)) o.push(i); }); return o; };
/* 鬃毛：新模型的蒙皮是自動算的，mane、mane2 骨沒有權重（鬃毛不會動）。第一次建立時，把鬃毛關節附近、偏上方的頂點分一部分權重給 mane／mane2 骨
   （幾何是同物種共用的，只改一次，用 userData 記號）。這樣鬃毛會跟著慢半拍的擺動甩，狂暴時 animCreature 本來就會抬高、放大 mane 骨，也會真的豎起來。 */
const MANE = { boar: 1, bison: 1, wolf: 1, tiger: 1, deer: 1, porc: 1 };
function maneSkin(m) {
  const geo = m.mesh && m.mesh.geometry; if (!geo || geo.userData.mane08 || !MANE[m.type] || m.elite && m.type === 'boar') return; geo.userData.mane08 = 1;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, bn = m.sp.bones, ix = s => bn.findIndex(b => b.name === s), J = [ix('mane'), ix('mane2')].filter(i => i >= 0);
  if (!pos || !si || !sw || !J.length) return; const ch = bn[ix('chest')].p, nk = bn[ix('neck')].p, R = Math.hypot(nk[0] - ch[0], nk[1] - ch[1], nk[2] - ch[2]) * 1.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    for (const j of J) {
      const p = bn[j].p, d = Math.hypot(x - p[0], y - p[1], z - p[2]), w = 0.7 * sm(R, R * 0.3, d) * sm(p[1] - 0.9 * R, p[1] - 0.2 * R, y); if (w < 0.01) continue;
      const a = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], b = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)]; let sum = 0;
      for (let k = 0; k < 4; k++) b[k] *= 1 - w;
      let s = a.findIndex((u, k) => u === j && b[k] > 0); if (s < 0) { s = 0; for (let k = 1; k < 4; k++) if (b[k] < b[s]) s = k; a[s] = j; b[s] = 0; }
      b[s] += w; for (let k = 0; k < 4; k++) sum += b[k]; si.setXYZW(i, a[0], a[1], a[2], a[3]); sw.setXYZW(i, b[0] / sum, b[1] / sum, b[2] / sum, b[3] / sum);
    }
  }
  si.needsUpdate = sw.needsUpdate = true;
}
/* 熊的肢體隔離（威嚇人立時前掌被拉成兩塊長板的根因）：圖生 3D 的網格是一整片，熊的前掌腳跟和後腳腳尖在綁定姿勢幾乎貼在一起，
   (1) 有 98 個三角形橫跨「前肢頂點」和「後肢頂點」（棕熊；老疤沒有這種三角形），前肢一抬起來，這些三角形就從舉高的前掌一路拉到地上的後腳＝長板；
   (2) 自動蒙皮讓不少肢體頂點帶著別條腿的權重（棕熊 307 顆、老疤 376 顆，平均占 13–20%），抬前肢時把後腳／另一側的皮膚也扯起來。
   處理：先把「位置在前半身卻綁後腿」的頂點改綁同側前肢；肢體頂點只留自己那條腿的骨頭權重；橫跨不同肢體的三角形移除（接觸地面的腳跟與腳尖之間，平常看不到）。幾何是同物種共用的，只做一次，用 userData 記號。 */
const LIMB = { bear: 1 };
function limbSkin(m) {
  const geo = m.mesh && m.mesh.geometry; if (!geo || geo.userData.limb08 || !LIMB[m.type]) return; geo.userData.limb08 = 1;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, ix = geo.index, bn = m.sp.bones; if (!si || !sw || !ix) return;
  const pz = geo.attributes.position, fr = bn.map((b, i) => { const k = /^leg([23])([abc])/.exec(b.name); return k ? bn.findIndex(o => o.name === 'leg' + (k[1] - 2) + k[2]) : i; }), lm = bn.map(b => { const k = /^leg(\d)/.exec(b.name); return k ? +k[1] : -1; }), n = si.count, dom = new Int8Array(n), wt = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], b = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)]; let k0 = 0; for (let k = 1; k < 4; k++) if (b[k] > b[k0]) k0 = k;
    let L = lm[a[k0]]; if (L >= 2 && pz.getZ(i) > -0.15) { for (let k = 0; k < 4; k++) if (lm[a[k]] >= 2) a[k] = fr[a[k]]; si.setXYZW(i, a[0], a[1], a[2], a[3]); L -= 2; }      /* 位置在前半身（z＞−0.15）、卻被自動蒙皮綁到後腿的頂點＝前掌腳跟：改綁同側前肢同節的骨頭 */
    dom[i] = L; if (L < 0) continue;
    let sum = 0; for (let k = 0; k < 4; k++) { const l2 = lm[a[k]]; wt[k] = l2 >= 0 && l2 !== L ? 0 : b[k]; sum += wt[k]; }
    if (sum < 1e-6) continue; for (let k = 0; k < 4; k++) wt[k] /= sum; sw.setXYZW(i, wt[0], wt[1], wt[2], wt[3]);
  }
  const keep = []; for (let t = 0; t < ix.count; t += 3) { const x = dom[ix.getX(t)], y = dom[ix.getX(t + 1)], z = dom[ix.getX(t + 2)], ls = [x, y, z].filter(l => l >= 0); if (ls.length && ls.some(l => l !== ls[0])) continue; keep.push(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)); }
  if (keep.length < ix.count) geo.setIndex(keep.length > 65535 * 3 || n > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
  sw.needsUpdate = true;
}
function init(m) {
  maneSkin(m); limbSkin(m);
  const P = Object.assign({}, DEF, PROF[m.type] || {}), n = s => m.bones.findIndex(b => b.name === s), lg = m.sp.legs[0];
  m.S = Object.assign({}, m.S, { stride: m.S.stride * P.stride, lift: m.S.lift * P.lift });      /* 複製：舊模型共用的 S 不受影響 */
  return { P, body: n('body'), pelvis: n('pelvis'), chest: n('chest'), neck: n('neck'), head: n('head'), earL: n('earL'), earR: n('earR'), mane: [n('mane'), n('mane2')], tail: find(m, /^tail\d/), leg0: n('leg0a'), L: lg ? lg.a + lg.b : 0.5, lag: 0, lagV: 0, mv: 0, ready: false, ry: m.rest[n('body')].y };
}

/* 野牛奔跑：原本的奔跑步態兩條後腿只差 0.12 圈、兩條前腿也只差 0.12 圈（跳躍式步態，設計如此），在體型厚重的野牛身上像同步蹦跳。
   這裡把後腿、右前腿的相位拉開（RR 0.12→0.34、FR 0.62→0.84、FL 0.5→0.46），算法和 creatures.js 的 gait() 一樣，只對「相位改變的差量」加到 C.L 上，其他疊加效果不受影響。 */
const GO = [-0.04, 0.22, 0, 0.22];
function gallopShift(m, sp, mv, wG) {
  const S = m.S, g = clamp(sp / m.run, 0, 1.5), wW = 1 - sm(0.3, 0.5, g), wT = 1 - wW - wG, duty = 0.64 * wW + 0.5 * wT + 0.38 * wG, Lmax = S.stride * (0.62 * wW + 0.85 * wT + 1.05 * wG);
  let f = (0.95 + 1.45 * Math.min(g, 1)) * S.cad, Ls = sp * duty / f; if (Ls > Lmax) { f = sp * duty / Lmax; Ls = Lmax; }
  const lift = S.lift * (0.55 * wW + 0.85 * wT + 1.2 * wG), iu = 1 / (S.u || 1), mdx = Math.sin(m.md || 0), mdz = Math.cos(m.md || 0), fpk = 0.4 + 0.6 * Math.max(0, mdz), L = m.C.L, ph = m.phase;
  const at = q => { q = ((q % 1) + 1) % 1; let z, y = 0, fp; if (q < duty) { const s = q / duty; z = Ls * (0.5 - s); fp = 0.4 * sm(0.65, 1, s) - 0.1 * (1 - sm(0, 0.2, s)); } else { const s = (q - duty) / (1 - duty); z = Ls * (-0.5 + s * s * (3 - 2 * s)); y = Math.sin(Math.PI * Math.pow(s, 0.8)) * lift; fp = 0.75 + (-0.3 - 0.75) * sm(0.1, 0.9, s); } return [z, y, fp]; };
  for (let i = 0; i < 4; i++) {
    const off = i === 0 ? 0.25 * wW + 0.5 * wT + 0.5 * wG : i === 1 ? 0.75 * wW + wT + 0.62 * wG : i === 2 ? 0 : 0.5 * wW + 0.5 * wT + 0.12 * wG, a = at(ph + off), b = at(ph + off + GO[i] * wG), o = i * 8;
    L[o] += (b[0] - a[0]) * mv * iu * mdx; L[o + 1] += (b[1] - a[1]) * mv * iu; L[o + 2] += (b[0] - a[0]) * mv * iu * mdz; L[o + 7] += (b[2] - a[2]) * mv * fpk;
  }
}
export function anim08(m, v, dt, t, sp, calm) {
  const a = m.a8 || (m.a8 = init(m)), P = a.P, B = m.bones, st = v.st | 0, loco = (st === 0 || st === 1 || st === 7) && !v.pose, sd = m.seed || 0;
  const g = clamp(sp / (m.run || 1), 0, 1.5), mvT = loco ? sm(0.04, 0.35, sp) : 0, k = a.ready ? 1 - Math.exp(-10 * dt) : 1; a.mv += (mvT - a.mv) * (dt > 0 ? k : 1); a.ready = true;
  const pre = gaitPre(m, a, sp, dt, loco);                                                                                /* 步幅、步頻、各腳相位（見 gait08.js） */
  const mv = a.mv, rw = sm(0.45, 0.9, g), wk = 1 - 0.7 * rw, c2 = TAU * m.phase, L = a.L, yv = clamp(m.yv || 0, -6, 6), body = B[a.body], chest = B[a.chest], pel = B[a.pelvis], neck = B[a.neck], head = B[a.head];
  /* 尾巴：animCreature 只在尾根（tail0）給俯仰，整條尾巴像一塊硬板整個翹起。把一部分尾根的俯仰平均分給後面各節，尾巴就會逐節彎成弧形 */
  if (a.tail.length > 1 && P.spread) { const r0 = B[a.tail[0]].rotation.x, mvv = r0 * P.spread; B[a.tail[0]].rotation.x = r0 - mvv; for (let j = 1; j < a.tail.length; j++) B[a.tail[j]].rotation.x += mvv / (a.tail.length - 1); }
  /* 慢半拍：身體的俯仰＋起伏經過一階延遲，頭頸跟不上身體（過衝）→ 頭頸反向補償，鬃毛跟著甩 */
  const q = body.rotation.x + (body.position.y - a.ry) / Math.max(0.2, L) * 1.2; let d = 0;
  if (dt > 0) { a.lagV += (q - a.lag - a.lagV * 0.35) * dt * 150; a.lag += a.lagV * dt; a.lag = clamp(a.lag, q - 0.4, q + 0.4); d = clamp(q - a.lag, -0.3, 0.3); }
  if (P.gallop && mv > 0.05 && rw > 0.02) { gallopShift(m, sp, mv, sm(0.62, 0.85, g)); pel.rotation.x -= 0.1 * rw * mv * Math.cos(c2 - 0.15); chest.rotation.x += 0.05 * rw * mv * Math.cos(c2 + 0.5); }
  if (mv > 0.001) {
    const s1 = Math.sin(c2), s2 = Math.sin(2 * c2 + 0.5), c1 = Math.cos(c2);
    chest.rotation.y += 0.055 * P.sway * mv * wk * s1; pel.rotation.y -= 0.06 * P.sway * mv * wk * s1;                 /* 脊椎蛇行 */
    body.rotation.z += 0.032 * P.roll * mv * wk * Math.sin(c2 + 0.7);                                                /* 重心換邊 */
    chest.rotation.z -= 0.02 * P.roll * mv * wk * Math.sin(c2 + 0.7);
    body.position.y += L * 0.016 * P.bob * mv * (1 - 0.5 * rw) * s2;                                                  /* 每步一起伏 */
    neck.rotation.x += (-body.rotation.x * 0.25 - d * 0.6 * P.nod) * mv; head.rotation.x += (-d * 0.35 * P.nod + 0.03 * P.nod * c1 * (1 - rw)) * mv;
    head.rotation.y -= 0.05 * P.sway * mv * wk * s1;                                                                   /* 頭對著前進方向，抵消脊椎蛇行 */
    for (const e of [a.earL, a.earR]) if (e >= 0) B[e].rotation.x += (-d * 1.1 + 0.1 * Math.sin(2 * c2 + 1)) * mv;
    a.tail.forEach((i, j) => { B[i].rotation.y += 0.11 * P.tail * mv * (1 - 0.3 * rw) * Math.sin(c2 - 0.9 * j - 0.4) * (1 + 0.25 * j); B[i].rotation.x += (-d * 0.6 * (j + 1) * 0.5) * P.tail * mv + P.tailX * mv * Math.sin(c2 - 0.9 * j - 0.4); });
  }
  /* 鬃毛：慢半拍的上下甩＋隨身體側傾、左右飄（mane 骨 animCreature 不會每幀重設旋轉，所以這裡用「設定」不是「疊加」） */
  for (let j = 0; j < 2; j++) { const mb = a.mane[j] >= 0 ? B[a.mane[j]] : null; if (!mb) continue; mb.rotation.x = (-d * 1.1 * mv + 0.05 * Math.sin(2 * c2 - 0.8 * j) * mv + 0.04 * Math.sin(t * 1.9 + sd + j) * (1 - mv * 0.5)) * P.nod; mb.rotation.z = (0.5 * body.rotation.z * mv + 0.03 * Math.sin(t * 1.3 + sd * 2 + j)) * P.nod - clamp(yv * 0.04, -0.2, 0.2) * (j ? 1 : 0.6); }
  if (loco && Math.abs(yv) > 0.01) {                                                                                      /* 轉彎：身體往轉向側彎，後半身甩出去 */
    const tk = (0.4 + 0.6 * mv); body.rotation.z -= clamp(yv * 0.03, -0.12, 0.12) * tk; chest.rotation.y += clamp(yv * 0.03, -0.14, 0.14) * tk; pel.rotation.y -= clamp(yv * 0.022, -0.1, 0.1) * tk;
    a.tail.forEach((i, j) => { B[i].rotation.y -= clamp(yv * 0.03, -0.2, 0.2) * (j + 1) * 0.35 * P.tail; });
  }
  /* 待機＆慢走之間：呼吸、換重心、甩耳（站著時才明顯） */
  const rest = 1 - mv, br = Math.sin(t * 1.55 + sd), br2 = Math.sin(t * 1.55 + sd - 0.5);
  chest.scale.x += 0.016 * P.breath * br; chest.scale.y += 0.024 * P.breath * br2; body.position.y += L * 0.006 * P.breath * br2 * rest; head.rotation.x += 0.012 * br2 * rest;
  if (loco && !v.enr) {
    const w1 = Math.sin(t * 0.37 + sd * 1.3) * Math.sin(t * 0.23 + sd), w2 = Math.sin(t * 0.51 + sd * 2.1);
    body.rotation.z += 0.03 * P.roll * w1 * rest; pel.rotation.y += 0.035 * w1 * rest; chest.rotation.y -= 0.025 * w1 * rest; chest.rotation.z += 0.012 * w2 * rest;
    const fl = sm(0.9, 0.97, Math.sin(t * 0.9 + sd * 5) * Math.sin(t * 1.7 + sd * 2)) * rest, fr = sm(0.9, 0.97, Math.sin(t * 1.1 + sd * 3) * Math.sin(t * 1.3 + sd * 7)) * rest;
    if (a.earL >= 0) B[a.earL].rotation.x -= 0.4 * fl * Math.abs(Math.sin(t * 30)); if (a.earR >= 0) B[a.earR].rotation.x -= 0.4 * fr * Math.abs(Math.sin(t * 30 + 1));
    a.tail.forEach((i, j) => { B[i].rotation.y += 0.07 * P.tail * rest * Math.sin(t * 1.3 - 0.8 * j + sd) * (1 + 0.3 * j); B[i].rotation.x += 0.03 * P.tail * rest * Math.sin(t * 0.8 - 0.6 * j + sd * 2) * (j + 1) * 0.5 + P.tailX * 0.6 * rest * Math.sin(t * 1.6 - 0.9 * j + sd); });
  }
  gaitPost(m, a, v, dt, sp, loco, pre);                                                                                      /* 四隻腳釘地＋身體隨腳下蹲，必須在最後（身體的動作都疊完之後） */
}
