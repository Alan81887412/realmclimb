// 0.8 X2「新野獸」造型：猴群（雜耍猴）、猩猩、箭豬、岩羊、鱷魚。
// 做法和 beasts07.js／creatures.js 的圓潤版完全一樣：同一套建模工具（props07.js 的 KIT）、同一副四足骨架（softSkel：body／pelvis／chest／neck／head／jaw／ear／mane／四條腿三節／尾巴）、
// 動作欄位也一樣（act.anim／wind／strike，由 creatures.js 的 animCreature 算共用動作，再呼叫 S.pose 疊上物種專用姿勢）。
// 這個檔案只做模型與姿勢（不含行為）：makeBeast08(type, size, o) 的回傳物件和 makeBeast07 同格式，可以直接丟給 animCreature。
//   猴群 monkey：Q 版小猴，破背心（後緣撕破）＋脖子上掛一顆小銅鈴；四足站、坐、蹲在樹上、丟東西、扯披風
//   猩猩 ape：白背、長臂、拳頭比頭大（指節著地走）；小猩猩共用骨架（makeBeast08('ape', size, { young: true }) → 體型 0.6、頭更圓、沒有白背）
//   箭豬 porc：背刺分三組骨頭（porcQ0 肩、porcQ1 背、porcQ2 臀），豎起時往上撐開、顏色變亮（porcGlow：刺的材質另做、由 pose 調亮度）
//   岩羊 ibex：粗壯的野山羊，向後的大彎角（橫紋）、下巴鬍子、分趾蹄、淺色腹部與臀斑
//   鱷魚 croc：低矮長身、背上骨板、長吻、長尾；可半沒入水（v.pose === 'sub'：只露眼睛與鼻孔）
import * as THREE from './three.bundle.js';
import { KIT } from './props07.js';
import { beastFinish08 } from './beastfx08.js';
import { getModel08, VISK08 } from './model08_boar.js';
const { Part, ball, tubeP, place, push, mirrorX, finish, blendN, surf, spike, tuft: tuftK, cone, horn, ridge, rgb, cov, ink, put, h2, wedge, occl, buildSoft, softSkel, legSk, quatOf, skMix, B, add3, sub3, cross3, dot3, norm3, mid3, fall, TAU, clamp, lerp, smooth } = KIT;
const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, hyp = Math.hypot;
const SOFT = {};
const mir = p => [-p[0], p[1], p[2]];
const LEGO = { FL: 0, FR: 8, RL: 16, RR: 24 };
const legT = (T, o, x, y, z, fp = 0) => { T.L[o] += x; T.L[o + 1] += y; T.L[o + 2] += z; T.L[o + 7] += fp; };      /* 腳踩點的偏移（跟 creatures.js 的 leg() 一樣） */
const airT = (T, o, w, ax, ay, az, fp = 0) => { T.L[o + 3] = w; T.L[o + 4] = ax; T.L[o + 5] = ay; T.L[o + 6] = az; T.L[o + 7] += fp * w; };      /* 腳離地、跟著身體（跟 creatures.js 的 air() 一樣） */
const hashf = k => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const furN = (p, f = 1) => sin(p[0] * 83 * f + sin(p[1] * 61 * f) * 2) * sin(p[1] * 77 * f + p[2] * 53 * f) * sin(p[2] * 91 * f + p[0] * 37 * f);      /* 毛的細紋明暗 */
// 毛皮底色（背深腹淺＋細紋）：al＝繞身體一圈的角度（0 背、π 腹）
function furPaint(c, p, al, base, dark, light) { const k = furN(p); put(c, base); ink(c, 0.55 * smooth(1.0, 0.1, al), dark); ink(c, 0.55 * smooth(1.7, 2.7, al), light); ink(c, 0.2 * smooth(0.2, 0.9, k), dark); ink(c, 0.14 * smooth(0.3, 0.9, -k), light); }
// 身體蒙皮：後半跟 pelvis、前半跟 chest、前端一點點跟 neck
const bodySk = (z0, z1, n0, n1) => p => { const t = smooth(z0, z1, p[2]), nk = 0.5 * smooth(n0, n1, p[2]); return [B.pelvis, 1 - t, B.chest, t * (1 - nk), B.neck, t * nk]; };
// 腿的蒙皮（任意方向的腿都能用）：在膝（j1）與腳踝（j2）各切一個垂直於路徑的面，面兩邊平滑過渡
const legSkG = (b0, J, w = 0.06) => { const d01 = norm3(sub3(J.j1, J.j0)), d12 = norm3(sub3(J.j2, J.j1)), n1 = norm3(add3(d01, d12)), n2 = norm3(add3(d12, norm3(sub3(J.pad, J.j2))));
  return p => { const tc = smooth(-w * 0.7, w * 0.7, dot3(sub3(p, J.j2), n2)); if (tc > 0.002) return [b0 + 1, 1 - tc, b0 + 2, tc]; const tb = smooth(-w, w, dot3(sub3(p, J.j1), n1)); return [b0, 1 - tb, b0 + 1, tb]; }; };
// 尾巴蒙皮：N 根骨頭、keys 有 N+1 個站點（第 j 根骨頭在第 j 個站點）；列的 t（0–1）→ 兩根骨頭之間的比重
const tailSk = N => (p, i, j, pt) => { const s = pt.rows[j].t * N, k = clamp(Math.floor(s), 0, N - 2), w = smooth(0, 1, clamp(s - k, 0, 1)); if (s >= N - 1) return [B.tail + N - 1, 1]; return [B.tail + k, 1 - w, B.tail + k + 1, w]; };
// 眼睛組：兩側各一顆眼球（發光層）、瞳孔、眉（眉會跟著 T.brow 動）。回傳 { X, EC, ex, ey, ez, eloc }
function eyeSet(add, sk, head, HC, aim, o = {}) {
  const eh = surf(head, HC, norm3(aim)), ez = norm3(add3(eh.n, o.zadd || [0.18, 0, 0.45])), ex0 = norm3(cross3([0, 1, 0], ez)), ey0 = cross3(ez, ex0), cT = cos(o.tilt ?? 0.25), sT = sin(o.tilt ?? 0.25);
  const ex = [0, 1, 2].map(i => ex0[i] * cT + ey0[i] * sT), ey = [0, 1, 2].map(i => ey0[i] * cT - ex0[i] * sT), EC = eh.p, eloc = (a, b, c) => [EC[0] + ex[0] * a + ey[0] * b + ez[0] * c, EC[1] + ex[1] * a + ey[1] * b + ez[1] * c, EC[2] + ex[2] * a + ey[2] * b + ez[2] * c];
  const eq = quatOf(ex, ey, ez), exR = [ex[0], -ex[1], -ex[2]], eyR = [-ey[0], ey[1], ey[2]], ezR = [-ez[0], ez[1], ez[2]], eqR = quatOf(exR, eyR, ezR), X = {};
  const r = o.r || [0.084, 0.07, 0.022], pr = o.pr || [0.02, 0.024, 0.007], po = o.po || [-0.01, -0.006, 0.012], bs = o.bs || 1, bo = o.bo || [0.005, 0.05, 0.014];
  X.eyeL = sk.bone('eyeL', B.head, eloc(0, 0, 0), eq); X.eyeR = sk.bone('eyeR', B.head, mir(eloc(0, 0, 0)), eqR); X.pupL = sk.bone('pupL', X.eyeL, eloc(po[0], po[1], po[2]), eq); X.pupR = sk.bone('pupR', X.eyeR, mir(eloc(po[0], po[1], po[2])), eqR);
  X.browL = sk.bone('browL', B.head, eloc(bo[0], bo[1], bo[2]), eq); X.browR = sk.bone('browR', B.head, mir(eloc(bo[0], bo[1], bo[2])), eqR);
  const eye = ball('eyeL', o.seg || 12, o.segv || 4, r, { vmax: o.vmax || 0.6 }); place(eye, eloc(0, 0, o.ez ?? -0.007), [ex, ey, ez]); eye.sk = X.eyeL; eye.tex = [48, 32]; eye.glow = 1;
  eye.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), rr = h2(d[0], d[1] + 0.2); put(c, o.iris); ink(c, smooth(0.25, 0.85, rr) * 0.9, o.irisD); if (o.sclera) ink(c, smooth(0.72, 0.9, rr), o.sclera); if (o.hl) ink(c, smooth(0.2, 0.1, h2(d[0] + 0.32, d[1] - 0.38)), o.hl); if (d[2] < 0.14 || (!o.noLid && d[1] > 0.2 + 0.45 * d[0])) put(c, o.lid); else if (o.lidTop) ink(c, smooth(o.lidTop, o.lidTop + 0.12, d[1]), o.lid); };
  add(eye); add(mirrorX(eye, 'eyeR')).sk = X.eyeR;
  const pup = ball('pupL', o.seg || 8, o.segv ? 3 : 2, pr, { vmax: 0.5 }); place(pup, eloc(po[0], po[1], po[2]), [ex, ey, ez]); pup.sk = X.pupL; pup.col = o.pupil || rgb(0x120806); pup.tex = [8, 8]; add(pup); add(mirrorX(pup, 'pupR')).sk = X.pupR;
  const bk = o.brk || [0.01, 0.052, 0.092], bsx = o.bsx ?? 1, br = tubeP('browL', 6, [{ p: [-0.1 * bs, bk[0] * bs, 0.016], rx: 0.024 * bs * bsx, ry: 0.028 * bs }, { p: [0.0, bk[1] * bs, 0.02], rx: 0.034 * bs * bsx, ry: 0.038 * bs }, { p: [0.12 * bs, bk[2] * bs, 0.0], rx: 0.02 * bs * bsx, ry: 0.022 * bs }], { ref: [0, 0, 1], capA: (o.capA ?? 0.026) * bs, capB: (o.capB ?? 0.022) * bs, capN: o.capN ?? 1 });
  place(br, EC, [ex, ey, ez]); br.sk = X.browL; br.col = o.brow; br.tex = [8, 8]; add(br); add(mirrorX(br, 'browR')).sk = X.browR;
  return { X, EC, ex, ey, ez, eloc };
}
// 腿：一條圓管（蒙皮、接進身體）＋一個腳掌／蹄（跟著腳踝骨頭）；回傳 [左, 右]
function legParts(add, body, name, keys, J, li, o) {
  const leg = tubeP(name, o.nu || 12, keys, { nv: o.nv || 6, capA: o.capA ?? 0.14, capN: 2 }); leg.tex = o.tex || [64, 96]; leg.paint = o.paint; leg.sk = o.sk(Lg(li), J); leg.blend = [body, o.blend || 0.14]; add(leg);
  const lr = add(mirrorX(leg, name + 'R')); lr.sk = o.sk(Lg(li + 1), J); lr.blend = [body, o.blend || 0.14]; return [leg, lr];
}
const Lg = i => B.leg + i * 3;
// 凹處陰影（每個部位上色完再乘一層）
function withAO(parts, AO, footN = 0.45) { for (const pt of parts) if (pt.paint && !pt.share) { const f = pt.paint, id = pt.name.replace(/R$|hoof$|paw$|hand$/, ''), ks = pt.glow ? 0 : 1; pt.paint = (c, p, n, u, v, q) => { f(c, p, n, u, v, q); if (!ks) return; const o = Math.min(0.45, occl(p, n, AO, id) * 0.38 + 0.2 * Math.max(0, -n[1]) * smooth(footN, 0.08, p[1])); c[0] *= 1 - o * 0.9; c[1] *= 1 - o; c[2] *= 1 - o * 0.95; }; } }

/* ============================== 共用的姿勢小工具 ============================== */
const ST = { IDLE: 0, CHASE: 1, WIND: 2, STRIKE: 3, RECOVER: 4, STAGGER: 5, DEAD: 6, FLEE: 7, WARN: 8 };
// v.pose（遊戲指定的固定姿勢）—— 玩法用 v.pose = '名字' 切換；只列有做的：
export const POSES08 = { monkey: ['sit', 'perch', 'cling', 'carry'], ape: ['sit', 'beat'], porc: ['up'], ibex: ['look', 'cliff'], croc: ['sub', 'rise', 'sun'] };
// 招式動作名（act.anim）：沒列在這裡的名字就照 creatures.js 的共用動作（bite／slam／swipe／roar／charge／kick…）
export const ANIMS08 = { monkey: ['throw', 'tug', 'bite', 'snatch', 'steal'], ape: ['beat', 'rock', 'slam', 'grab'], porc: ['quill', 'burst', 'back'], ibex: ['ram', 'butt', 'flee'], croc: ['bite', 'roll', 'lunge'] };
const eased = (a, b, x) => smooth(a, b, x);
const isMove = q => (q.st === ST.IDLE && (q.v.speed || 0) > 0.05) || q.st === ST.CHASE || q.st === ST.FLEE;


// 手（前腳）離地、跟著胸骨：目標用「胸骨本地座標」（和 SOFT 裡 FJ.pad 同一個座標系，原點在胸骨）；x 給正的（左右會自動鏡射）。w＝離地比重（1＝完全跟著身體）
function armTo(T, m, i, tx, ty, tz, w = 1, fp = 0) { const lg = m.sp.legs[i], U = m.S.u || 1, o = i * 8; T.L[o + 3] = w; T.L[o + 4] = (tx - abs(lg.rest[0])) / U; T.L[o + 5] = (ty - lg.rest[1]) / U; T.L[o + 6] = (tz - lg.rest[2]) / U; T.L[o + 7] += fp * w; }
// 腳踩點往旁邊挪（模型座標；dx 正＝往外）
function footAt(T, m, i, dx, dy, dz, fp = 0) { const U = m.S.u || 1, o = i * 8; T.L[o] += dx / U; T.L[o + 1] += dy / U; T.L[o + 2] += dz / U; T.L[o + 7] += fp; }
const tri = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
const wind = q => (q.st === ST.WIND ? clamp(q.p / Math.max(0.05, q.act.wind || 0.6), 0, 1) : q.st === ST.STRIKE || q.st === ST.RECOVER ? 1 : 0);
const strikeK = q => (q.st === ST.STRIKE ? clamp(q.p / Math.max(0.05, q.act.strike || 0.3), 0, 1) : q.st === ST.RECOVER ? 1 : 0);

/* ============================== 猴群（雜耍猴） ============================== */
/* 照參考圖（雜耍猴-A四面設定／B正面臉）重做：半蹲四肢著地、肩寬臂粗、深灰大手大腳（四根粗圓的長指＋外張的拇指，指頭貼地）、手腕一圈參差的毛；
   頭大、頭頂一叢往後掃的毛、黃頭巾（打結在左後、兩條尾巴往後飄）、大圓耳；破紅背心（金邊、金鈕扣、後緣撕成鋸齒）、腰間皮帶＋金環吊一顆紅白雜耍球；尾巴粗、往上再捲成螺旋。
   臉：直接用參考圖 B 剪下來的貼圖（assets/face/monkey_grin.webp 壞笑、monkey_bare.webp 齜牙）；平常壞笑，威嚇／偷／出招時換齜牙（m.face 材質的 userData.bare）。 */
const MKB = [[-0.3, 0.44, 0.16, 0.15, 0.14], [-0.15, 0.46, 0.21, 0.2, 0.19], [0.02, 0.49, 0.24, 0.225, 0.2], [0.18, 0.52, 0.26, 0.24, 0.21], [0.3, 0.55, 0.21, 0.21, 0.17], [0.38, 0.58, 0.13, 0.14, 0.12]];      /* 身體剖面：z、中心高、半寬、上半高、下半高 */
const mkBodyAt = z => { let i = 0; while (i < MKB.length - 2 && z > MKB[i + 1][0]) i++; const a = MKB[i], b = MKB[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1), s = t * t * (3 - 2 * t); return { y: lerp(a[1], b[1], s), rx: lerp(a[2], b[2], s), ry: lerp(a[3], b[3], s), rd: lerp(a[4], b[4], s) }; };
const mkOnBody = (a, z, off) => { const q = mkBodyAt(z), c = cos(a); return [sin(a) * (q.rx + off), q.y + c * ((c >= 0 ? q.ry : q.rd) + off), z]; };
/* 一片曲面（不封閉）：fn(u, v) → 座標；用來做背心、皮帶這種「披在身上」的東西 */
function sheetP(name, nu, nv, fn) { const pt = new KIT.Part(name, nu, nv); let k = 0; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = fn(i / nu, j / nv); pt.P[k++] = q[0]; pt.P[k++] = q[1]; pt.P[k++] = q[2]; } return pt; }
SOFT.monkey = () => {
  const K = { fur: rgb(0x8a5a3a), furD: rgb(0x61402b), furL: rgb(0xa9744d), belly: rgb(0xc99c80), bellyD: rgb(0xa97b62), crown: rgb(0x7a4f33), crownD: rgb(0x573823), crownL: rgb(0xa06c46), skin: rgb(0xefb7a2), skinD: rgb(0xc98a74), earIn: rgb(0xe3a08e), earRim: rgb(0xf2c0ac),
    hand: rgb(0x4d4446), handL: rgb(0x6c6264), handD: rgb(0x362f31), iris: rgb(0x6a3a14), irisD: rgb(0x120a04), hl: rgb(0xffffff), lid: rgb(0x52391e),
    vest: rgb(0xb24b39), vestD: rgb(0x7c2b21), vestL: rgb(0xd0705a), trim: rgb(0xe4ac3c), trimD: rgb(0xa8741c), trimL: rgb(0xfbd77a), band: rgb(0xeeb34a), bandD: rgb(0xc8872c), bandL: rgb(0xfbd179), strap: rgb(0x4a2d20), strapL: rgb(0x6c4630), ballR: rgb(0xc9402f), ballRD: rgb(0x8f2619), ballC: rgb(0xf2dfbc), ballCD: rgb(0xcfb78e), brass: rgb(0xdca83a), brassD: rgb(0x8a5f16) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.7, 0.36], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.25, 0.47, 0.2], j1: [0.295, 0.27, 0.12], j2: [0.3, 0.1, 0.22], pad: [0.3, 0, 0.27] }, RJ = { j0: [0.22, 0.44, -0.2], j1: [0.27, 0.26, -0.1], j2: [0.28, 0.1, -0.24], pad: [0.28, 0, -0.19] };
  /* 尾巴路徑（骨頭取前 5 個點）：從尾椎往後、往上，頂端捲成螺旋（朝頭的方向捲） */
  const TK0 = [[0, 0.43, -0.3], [0, 0.4, -0.46], [0, 0.46, -0.6], [0, 0.58, -0.68], [0, 0.78, -0.68]], TN = 5;
  const sk = softSkel({ body: [0, 0.5, 0], pelvis: [0, 0.48, -0.22], chest: [0, 0.52, 0.18], neck: [0, 0.58, 0.28], head: [0, 0.68, 0.36], jaw: hd(0, -0.13, 0.09), ear: hd(0.3, 0.07, -0.05), mane: [0, 0.74, 0.1], fl: FJ, rl: RJ, tail: TK0, mane2: [0, 0.74, 0.3] });
  const BN = sk.BN, X = {};

  /* ----- 頭：寬圓的顱（頭頂平寬、頭巾圈在上面）＋往前鼓的口鼻＋尖下巴；臉是貼圖，所以頭殼只要形狀對、膚色對 ----- */
  const head = ball('head', 36, 22, [0.275, 0.285, 0.275], { e: 0.88 });
  push(head, [0.2, -0.09, 0.07], [0.15, 0.14, 0.2], [0.05, 0.0, 0.03]); push(head, [0, -0.2, 0.17], [0.2, 0.14, 0.14], [0, -0.04, 0.05]);      /* 兩頰鼓出、下巴往前下 */
  place(head, HC); finish(head); head.sk = B.head; head.tex = [320, 224]; add(head);
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x), k = furN(p, 1.5); put(c, K.fur); ink(c, 0.3 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.25 * smooth(0.2, 0.9, -k), K.furL); ink(c, 0.6 * smooth(0.12, 0.28, y), K.crown); ink(c, 0.9 * smooth(0.04, 0.2, z) * smooth(0.05, -0.1, y) * smooth(0.14, 0.05, ax), K.skin); };
  { const sn = ball('snout', 22, 14, [0.125, 0.1, 0.105], { e: 0.9 }); place(sn, hd(0, -0.095, 0.205), [0.12, 0, 0]); sn.sk = B.head; sn.tex = [160, 112]; sn.blend = [head, 0.1]; add(sn); sn.paint = (c, p, n) => { put(c, K.skin); ink(c, 0.3 * smooth(-0.1, -0.2, p[1] - HC[1]), K.skinD); }; }
  { const jw = ball('jaw', 18, 10, [0.105, 0.075, 0.1], { e: 0.9 }); place(jw, hd(0, -0.2, 0.15)); jw.sk = B.head; jw.tex = [96, 64]; jw.blend = [head, 0.1]; add(jw); jw.paint = (c, p, n) => { put(c, K.skin); ink(c, 0.35 * smooth(0.0, -0.08, p[1] - (HC[1] - 0.2)), K.skinD); }; }
  /* 耳朵：大圓耳，淡粉、有厚邊、內側凹進去 */
  { const ear = ball('earL', 20, 12, [0.115, 0.125, 0.034], { e: 0.8 }); push(ear, [0, 0, 0.05], [0.09, 0.1, 0.08], [0, 0, -0.026], false); place(ear, hd(0.305, 0.02, -0.04), [0.1, 1.28, -0.1]); ear.sk = B.earL; ear.tex = [96, 96]; add(ear);
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.skin); ink(c, 0.5 * smooth(0.45, 0.0, r) * smooth(0.2, 0.7, d[2]), K.earIn); ink(c, 0.35 * smooth(0.6, 0.95, r), K.earRim); ink(c, 0.45 * smooth(0.0, 0.5, -d[2]), K.skinD); }; add(mirrorX(ear, 'earR')).sk = B.earR; }
  /* 兩頰的毛簇：往外往後掃的幾片扁錐（參考圖：頰邊參差的毛） */
  for (const [y, z, tx, ty, tz, w] of [[-0.06, 0.1, 0.3, -0.02, -0.06, 0.07], [-0.12, 0.1, 0.31, -0.1, -0.02, 0.07], [-0.17, 0.12, 0.27, -0.2, 0.0, 0.065], [0.0, 0.08, 0.3, 0.05, -0.1, 0.06]]) {
    const b0 = hd(0.17, y, z), t0 = hd(tx, ty, tz), s = tuftK('cheek' + y, b0, t0, [0, 0.4, 1], w, 0.03, { nu: 6, bow: 0.1, up: [0, 0.3, 0] }); s.sk = B.head; s.tex = [24, 48]; s.paint = (c, p, n, u, v) => { put(c, K.fur); ink(c, 0.5 * smooth(0.4, 1.0, v), K.furD); ink(c, 0.3 * smooth(0.0, 0.3, abs(sin(u * TAU * 2))), K.furL); }; add(s); add(mirrorX(s, 'cheekR' + y)).sk = B.head; }
  /* 頭頂的毛叢：中間最大的一撮往後上掃，兩側與前後各幾小撮，像一團火焰 */
  const lock = (nm, b, t, hw, th, bow) => { const B0 = hd(...b), T0 = hd(...t), s = tuftK(nm, B0, T0, [1, 0, 0], hw, th, { nu: 8, bow, pr: [1, 0.92, 0.55, 0.04] }); s.sk = B.head; s.tex = [32, 64]; s.paint = (c, p, n, u, v) => { put(c, K.crown); ink(c, 0.55 * smooth(0.55, 1.0, v), K.crownD); ink(c, 0.35 * smooth(0.0, 0.5, v), K.crownL); ink(c, 0.25 * smooth(0.6, 1.0, abs(sin(u * TAU * 3))), K.crownD); }; return add(s); };
  lock('lk0', [0, 0.22, 0.0], [0.02, 0.4, -0.17], 0.13, 0.085, 0.3);
  for (const sx of [1, -1]) { lock('lk1' + sx, [sx * 0.11, 0.2, -0.02], [sx * 0.2, 0.33, -0.15], 0.1, 0.07, 0.3); lock('lk3' + sx, [sx * 0.07, 0.2, -0.13], [sx * 0.1, 0.3, -0.28], 0.09, 0.06, 0.3); lock('lk4' + sx, [sx * 0.06, 0.22, 0.08], [sx * 0.1, 0.31, 0.05], 0.08, 0.055, 0.3); }
  /* 黃頭巾：一圈寬帶（頭頂平寬處、後面略低），打結在左後（+x、後）＋兩條往後飄的尾巴 */
  { const ks = [], n = 40, R = a => 0.292 + 0.006 * cos(a * 2); for (let i = 0; i <= n; i++) { const a = i / n * TAU + 2.4, rr = R(a), yy = 0.135 - 0.03 * (1 - cos(a - 0.0)) / 2 * 0 - 0.035 * Math.pow(abs(sin(a)), 1.5); ks.push({ p: hd(sin(a) * rr, yy, 0.0 + cos(a) * rr * 0.97), rx: 0.05, ry: 0.022 }); }
    const bd = tubeP('band', 12, ks, { nv: 96, ref: [0, 1, 0] }); bd.sk = B.head; bd.tex = [160, 48]; add(bd);
    bd.paint = (c, p, n, u, v) => { const k = furN(p, 0.8); put(c, K.band); ink(c, 0.3 * smooth(0.1, 0.8, k), K.bandD); ink(c, 0.25 * smooth(0.2, 0.9, -k), K.bandL); ink(c, 0.3 * smooth(0.05, 0.0, abs(u - 0.5) * 2 - 0.9), K.bandD); };
    const kn = ball('knot', 14, 9, [0.05, 0.045, 0.05]); place(kn, hd(0.22, 0.12, -0.2)); kn.sk = B.head; kn.tex = [48, 48]; kn.paint = bd.paint; add(kn);
    const kn2 = ball('knot2', 12, 8, [0.04, 0.04, 0.04]); place(kn2, hd(0.27, 0.12, -0.15)); kn2.sk = B.head; kn2.tex = [32, 32]; kn2.paint = bd.paint; add(kn2);
    for (const [nm, tipv, w] of [['tailA', [0.3, 0.02, -0.46], 0.06], ['tailB', [0.2, -0.1, -0.4], 0.05]]) { const b0 = hd(0.23, 0.12, -0.2), tp = hd(...tipv), s = tuftK(nm, b0, tp, [0.6, 0.8, 0], w, 0.012, { nu: 6, bow: 0.15, up: [0, 0.2, 0], pr: [0.55, 1.0, 0.95, 0.5] }); s.sk = B.head; s.tex = [32, 64]; s.paint = bd.paint; add(s); } }
  const E = eyeSet(add, sk, head, HC, [0.2, 0.03, 0.4], { r: [0.07, 0.07, 0.03], pr: [0.04, 0.045, 0.012], po: [0.0, -0.004, 0.022], seg: 8, segv: 5, brk: [0.05, 0.052, 0.03], tilt: 0.0, zadd: [0.1, 0, 0.5], iris: K.iris, irisD: K.irisD, hl: K.hl, lid: K.skinD, brow: K.crown, bs: 0.5, bo: [0.0, 0.1, 0.01], noLid: true, lidTop: 0.6, ez: 0.006, vmax: 0.7 }); Object.assign(X, E.X);

  /* ----- 身體：胸寬而有肌肉、腰收、肚子淺褐色（有腹肌的起伏）、屁股渾厚 ----- */
  const body = tubeP('body', 28, MKB.map(k => ({ p: [0, k[1], k[0]], rx: k[2], ry: k[3], rd: k[4], wt: 0.94 })), { nv: 22, capA: 0.11, capB: 0.12 });
  push(body, [0.24, 0.56, 0.15], 0.15, [0.014, 0.014, 0]); push(body, [0.22, 0.46, -0.24], 0.16, [0.02, 0.0, 0]);
  finish(body); body.tex = [384, 224]; add(body); body.sk = bodySk(-0.2, 0.1, 0.3, 0.5);
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2]; furPaint(c, p, al, K.fur, K.furD, K.furL); const bm = smooth(1.75, 2.35, al) * smooth(-0.3, -0.12, z); ink(c, 0.92 * bm, K.belly); ink(c, 0.4 * bm * smooth(0.2, 0.9, furN(p, 2.2)), K.bellyD);
    const ab = smooth(2.5, 3.0, al) * smooth(-0.16, -0.06, z) * smooth(0.3, 0.15, z); for (const zz of [-0.08, 0.0, 0.08, 0.16]) ink(c, 0.32 * ab * cov(abs(z - zz) - 0.006, 0.01), K.bellyD); ink(c, 0.3 * ab * cov(abs(p[0]) - 0.004, 0.008), K.bellyD); };
  /* 破背心：披在背與兩側、腹面敞開的一片（金邊在腹面的開口邊緣），後緣撕成鋸齒、背脊比兩側長 */
  { const A = 2.45, vest = sheetP('vest', 28, 18, (u, v) => { const a = (u - 0.5) * 2 * A, aa = abs(a) / A, tooth = 0.045 * (abs(((a * 2.4 + 5) % 1 + 1) % 1 - 0.5) * 2) + 0.03 * hashf(Math.floor(a * 2.4 + 5)), zEnd = -0.17 + 0.12 * aa + tooth, zf = 0.31; return mkOnBody(a, lerp(zf, zEnd, v), 0.034 + 0.006 * sin(v * PI)); });
    finish(vest); vest.tex = [288, 160]; vest.sk = bodySk(-0.2, 0.1, 0.3, 0.5); add(vest);
    vest.paint = (c, p, n, u, v) => { const k = furN(p, 0.7), a = abs(u - 0.5) * 2; put(c, K.vest); ink(c, 0.35 * smooth(0.1, 0.8, k), K.vestD); ink(c, 0.3 * smooth(0.2, 0.9, -k), K.vestL); ink(c, 0.5 * smooth(0.6, 1.0, v), K.vestD); ink(c, 0.3 * smooth(0.5, 0.0, v), K.vestL);
      ink(c, 0.95 * smooth(0.94, 0.985, a), K.trim); ink(c, 0.3 * smooth(0.95, 1.0, a), K.trimD); ink(c, 0.6 * cov(abs(a - 0.965) - 0.012, 0.008), K.trimL); };
    /* 金鈕扣：腹面開口邊緣各兩顆 */
    for (const z of [0.2, 0.08]) { const q = mkOnBody(2.2, z, 0.028), bt = ball('btn' + z, 12, 8, [0.026, 0.026, 0.018]); place(bt, q); bt.sk = bodySk(-0.2, 0.1, 0.3, 0.5); bt.tex = [32, 32]; bt.paint = (cc, pp, nn2) => { put(cc, K.trim); ink(cc, 0.5 * smooth(0.0, 0.8, nn2[1]), K.trimL); ink(cc, 0.5 * smooth(0.0, -0.8, nn2[1]), K.trimD); }; add(bt); add(mirrorX(bt, 'btnR' + z)).sk = bodySk(-0.2, 0.1, 0.3, 0.5); } }
  /* ----- 腰間：皮帶繞過骨盆、金環吊一顆紅白雜耍球 ----- */
  { const ks = [], n = 30; for (let i = 0; i <= n; i++) { const a = i / n * TAU, zz = -0.2 - 0.06 * (1 - cos(a - 1.2)) / 2; const q = mkOnBody(a, zz, 0.012); ks.push({ p: q, rx: 0.026, ry: 0.007 }); }
    const bt = tubeP('belt', 8, ks, { nv: 90, ref: [0, 0, 1], seam: 0 }); bt.sk = [B.pelvis, 1]; bt.tex = [128, 24]; add(bt); bt.paint = (c, p, n, u, v) => { put(c, K.strap); ink(c, 0.4 * smooth(0.2, 0.9, furN(p, 3)), K.strapL); ink(c, 0.7 * cov(abs(abs(u - 0.5) * 2 - 0.82) - 0.05, 0.04), K.strapL); };
    const ring = tubeP('bring', 7, (() => { const r = [], cx = 0.265, cy = 0.375, cz = -0.255; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU; r.push({ p: [cx, cy + cos(a) * 0.03, cz + sin(a) * 0.03], rx: 0.0085, ry: 0.0085 }); } return r; })(), { nv: 30, ref: [1, 0, 0] }); ring.sk = [B.pelvis, 1]; ring.tex = [24, 24]; ring.col = K.brass; add(ring);
    const cd = tubeP('bcord', 5, [{ p: [0.265, 0.347, -0.255], rx: 0.01, ry: 0.01 }, { p: [0.285, 0.31, -0.25], rx: 0.009, ry: 0.009 }, { p: [0.3, 0.27, -0.25], rx: 0.009, ry: 0.009 }], { nv: 6, ref: [0, 0, 1] }); cd.sk = [B.pelvis, 1]; cd.col = K.strap; cd.tex = [8, 8]; add(cd);
    const ball0 = ball('jball', 28, 18, [0.082, 0.082, 0.082], { axis: 'y' }); place(ball0, [0.33, 0.2, -0.25]); ball0.sk = [B.pelvis, 1]; ball0.tex = [128, 96]; add(ball0);
    ball0.paint = (c, p, n) => { const dx = p[0] - 0.33, dy = p[1] - 0.2, dz = p[2] + 0.25, ph = Math.atan2(dx, dz), g = Math.floor(((ph / PI + 1) * 3 + 0.5) % 6), cream = (g % 2 === 0); put(c, cream ? K.ballC : K.ballR); ink(c, 0.45 * smooth(0.45, 1.0, abs(dy) / 0.082), cream ? K.ballCD : K.ballRD); ink(c, 0.5 * smooth(0.6, 0.8, abs(dy) / 0.082), K.ballR); ink(c, 0.25 * smooth(0.0, 0.8, -dy / 0.082), K.ballRD); }; }

  /* ----- 四肢：臂粗而有肌肉；手腳深灰、掌墊＋粗圓的長指（貼地、外張）；腕與踝一圈參差的毛 ----- */
  const limbPaint = (c, p, n) => { const k = furN(p, 1.2); put(c, K.fur); ink(c, 0.4 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.3 * smooth(0.0, 0.5, n[0]) * smooth(0.5, 0.2, p[1]), K.furL); ink(c, 0.25 * smooth(0.2, -0.3, n[1]), K.furD); };
  const dig = (nm, base, dir, len, r0, bend, bone, clone) => {      /* 一根手指／腳趾：兩節，末端圓頭，貼地；回傳（左右各一） */
    const d = norm3(dir), p1 = add3(base, d, len * 0.5), p2 = add3(add3(base, d, len), [0, -bend * 0.0, 0]);
    const f = tubeP(nm, 8, [{ p: base, rx: r0, ry: r0 * 0.9 }, { p: p1, rx: r0 * 1.05, ry: r0 * 0.92 }, { p: p2, rx: r0 * 0.88, ry: r0 * 0.8 }], { nv: 7, capB: r0 * 0.85, capN: 3, ref: [0, 1, 0] });
    f.sk = bone; f.tex = [24, 40]; f.paint = (c, p, n) => { put(c, K.hand); ink(c, 0.35 * smooth(0.0, 0.8, n[1]), K.handL); ink(c, 0.4 * smooth(0.0, -0.8, n[1]), K.handD); ink(c, 0.5 * cov(abs(p[2] - (base[2] + len * 0.5)) - 0.004, 0.006), K.handD); }; return f; };
  const mkHand = (li, cx, cz, front) => {
    const bone = Lg(li) + 2, boneR = Lg(li + 1) + 2, palm = ball('hand' + li, 20, 12, [front ? 0.092 : 0.082, 0.04, front ? 0.095 : 0.1], { e: 0.85 }); place(palm, [cx, 0.04, cz]); palm.tex = [96, 80]; palm.sk = bone;
    palm.paint = (c, p, n) => { put(c, K.hand); ink(c, 0.4 * smooth(0.0, 0.8, n[1]), K.handL); ink(c, 0.5 * smooth(0.0, -0.8, n[1]), K.handD); }; add(palm); add(mirrorX(palm, 'hand' + li + 'R')).sk = boneR;
    const L = front ? 1 : 0.9, spec = front ? [[-0.058, 0.9, -0.1], [-0.02, 1.0, 0.0], [0.02, 0.98, 0.0], [0.056, 0.82, 0.1]] : [[-0.056, 0.8, -0.1], [-0.02, 1.0, 0.0], [0.02, 0.96, 0.0], [0.056, 0.78, 0.1]];
    spec.forEach(([dx, ln, fan], i) => { const bs = [cx + dx, 0.025, cz + 0.07], f = dig('fg' + li + i, bs, [fan, 0, 1], 0.1 * ln * L, 0.027, 0, bone); add(f); add(mirrorX(f, 'fg' + li + i + 'R')).sk = boneR; });
    { const th = dig('th' + li, [cx - 0.075, 0.026, cz + 0.015], [-0.55, 0, 0.85], 0.08 * L, 0.028, 0, bone); add(th); add(mirrorX(th, 'th' + li + 'R')).sk = boneR; }
    /* 手腕（腳踝）的毛：一圈往下垂的短錐 */
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, cxy = [cx + cos(a) * 0.075, cz + sin(a) * 0.075], b0 = [cxy[0], 0.15, cxy[1]], t0 = [cx + cos(a) * 0.09, 0.095 + 0.015 * hashf(i + li * 9), cz + sin(a) * 0.09 + 0.01]; const s = tuftK('wf' + li + i, b0, t0, [-sin(a), 0, cos(a)], 0.026, 0.012, { nu: 4, bow: 0.05, up: [0, 0.1, 0], pr: [1, 0.9, 0.5, 0.1] }); s.sk = bone; s.tex = [16, 24]; s.paint = limbPaint; add(s); add(mirrorX(s, 'wf' + li + i + 'R')).sk = boneR; } };
  legParts(add, body, 'fl', [{ p: [0.25, 0.5, 0.2], rx: 0.135, ry: 0.135 }, { p: [0.272, 0.38, 0.16], rx: 0.118, ry: 0.122 }, { p: [0.295, 0.27, 0.12], rx: 0.096, ry: 0.1 }, { p: [0.298, 0.17, 0.17], rx: 0.082, ry: 0.086 }, { p: [0.3, 0.1, 0.22], rx: 0.07, ry: 0.074 }], FJ, 0, { paint: limbPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.05), blend: 0.1, tex: [80, 112], nu: 18, nv: 10, capA: 0.13 });
  mkHand(0, 0.3, 0.215, true);
  legParts(add, body, 'rl', [{ p: [0.22, 0.46, -0.2], rx: 0.15, ry: 0.15, rd: 0.14 }, { p: [0.24, 0.35, -0.15], rx: 0.125, ry: 0.13 }, { p: [0.27, 0.26, -0.1], rx: 0.09, ry: 0.095 }, { p: [0.278, 0.17, -0.18], rx: 0.075, ry: 0.08 }, { p: [0.28, 0.1, -0.24], rx: 0.066, ry: 0.07 }], RJ, 2, { paint: limbPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.05), blend: 0.1, tex: [80, 112], nu: 18, nv: 10, capA: 0.15 });
  mkHand(2, 0.28, -0.25, false);

  /* ----- 尾巴：粗、往後往上、頂端捲成螺旋 ----- */
  { const ks = [[0, 0.43, -0.3, 0.052], [0, 0.4, -0.46, 0.05], [0, 0.46, -0.6, 0.047], [0, 0.58, -0.68, 0.045], [0, 0.7, -0.7, 0.043], [0, 0.78, -0.68, 0.04]];
    const C = [0, 0.9, -0.55], sp = 11; for (let i = 1; i <= sp; i++) { const t = i / sp, th = t * 2.3 * PI, rr = 0.14 * (1 - 0.68 * t); ks.push([0, C[1] + rr * sin(th), C[2] - rr * cos(th), lerp(0.038, 0.024, t)]); }
    const tail = tubeP('tail', 14, ks.map(k => ({ p: [k[0], k[1], k[2]], rx: k[3], ry: k[3] })), { nv: 70, capB: 0.02, capN: 2, seam: PI / 2 }); tail.tex = [64, 192]; tail.sk = tailSk(TN);
    tail.paint = (c, p, n, u, v) => { const k = furN(p, 1.4); put(c, K.fur); ink(c, 0.4 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.3 * smooth(0.2, 0.9, -k), K.furL); ink(c, 0.25 * smooth(0.4, 1.0, v), K.furD); }; add(tail); }

  const AO = [{ id: 'head', c: HC, r: 0.3 }, { id: 'body', c: [0, 0.52, 0.12], r: 0.3 }, { id: 'body', c: [0, 0.5, -0.16], r: 0.28 }];
  withAO(parts, AO);
  const FACE = apeFaceGrid(parts, HC, 1, FACE_MK); for (let i = parts.length - 1; i >= 0; i--) if (/^(eye|pup|brow)/.test(parts[i].name)) parts.splice(i, 1);
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.fur, eyeCol: [1.0, 0.7, 0.3], key: K, face: FACE, texW: 1536,
    S: { k: 1.0, run: 5.2, stride: 0.3, lift: 0.1, bob: 0.04, cad: 1.35, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.5, jawMax: 0.5, maneUp: 0, wag: 2.4, wagAmp: 0.3, halfW: 0.28, tailRun: 0.8, low: 0.12, u: 0.45, jump: 0.8, jaw0: 0, reach: 0.3, elastic: 1, maneK: 0, pose: poseMonkey } };
};

/* 猴群姿勢：v.pose = 'sit'（蹲坐，兩手放在肚子前面）｜'perch'（蹲在樹枝上、手腳抓著）｜'cling'（抱著樹幹，身體直立、兩手往上抓）；招式 act.anim = 'throw'（坐起、右手舉到腦後→往前丟）、'tug'（蹲低→撲出、兩手往前抓披風）、'snatch'（同 tug、只有一隻手）、'bite'（共用） */
function poseMonkey(T, q) {
  const { st, p, t, an, m, v } = q, pose = v.pose, loco = isMove(q), sd = q.sd || 1;
  const sit = pose === 'sit', perch = pose === 'perch', cling = pose === 'cling';
  { const bu = m.face && m.face.material.userData.bare; if (bu) bu.value = (st === ST.WARN || st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER) ? 1 : 0; }      /* 平常＝壞笑；威嚇／偷／出招＝齜牙（參考圖 B 右）；偷東西不染紅眼（glow 只有 0.1） */
  const sitUp = k => { /* k：蹲坐的程度 */ T.rear += 1.1 * k; T.by -= 0.3 * k; T.bz -= 0.02 * k; T.np += 0.62 * k; T.hp += 0.16 * k; T.tp -= 0.5 * k; footAt(T, m, 2, -0.04 * k, 0, 0.2 * k, 0.1 * k); footAt(T, m, 3, -0.04 * k, 0, 0.2 * k, 0.1 * k); T.pp -= 0.1 * k; T.cp -= 0.1 * k; };
  const hands = (k, wob) => { armTo(T, m, 0, 0.17, -0.33 + 0.02 * wob, 0.15, k, 0.3); armTo(T, m, 1, 0.17, -0.33 - 0.02 * wob, 0.15, k, 0.3); };
  if (sit && st === ST.IDLE) { sitUp(1); hands(1, sin(t * 1.7)); T.hw += 0.35 * sin(t * 0.7 + m.seed); T.nw += 0.15 * sin(t * 0.7 + m.seed); T.tw += 0.3 * sin(t * 0.9); T.sq += 1.2 * sin(t * 1.6); }
  else if (perch && st !== ST.WIND && st !== ST.STRIKE) { T.by -= 0.15; T.bp += 0.08; T.np -= 0.3; T.hp -= 0.12; T.tp -= 0.6; T.tc -= 0.3; T.hw += 0.5 * sin(t * 0.8 + m.seed); footAt(T, m, 0, -0.02, 0, 0.05); footAt(T, m, 1, -0.02, 0, 0.05); footAt(T, m, 2, 0, 0, 0.05); footAt(T, m, 3, 0, 0, 0.05); T.eL = T.eR = 0.2; }
  else if (cling) { T.rear += 1.45; T.by -= 0.04; T.np += 0.8; T.hp += 0.25; T.tp -= 0.9; armTo(T, m, 0, 0.15, 0.32, 0.3, 1, -0.2); armTo(T, m, 1, 0.15, 0.3, 0.34, 1, -0.2); footAt(T, m, 2, -0.06, 0.12, 0.1, 0.2); footAt(T, m, 3, -0.06, 0.18, 0.1, 0.2); T.hw += 0.3 * sin(t * 0.9); }
  if (an === 'throw' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) {
    const e = eased(0, 1, wind(q)), s = strikeK(q), sw = st === ST.WIND ? e : st === ST.STRIKE ? 1 - 0.0 * s : 1 - tri(0, (q.act.recover || 0.6), q.st === ST.RECOVER ? p : 0) * 0.8;
    sitUp(0.55 * sw); T.hw += 0.1 * sd;
    // 右手（FR）：預備＝舉到腦後；出手＝往前下揮；另一隻手護在前面
    const bx = lerp(0.2, 0.2, 0), up = st === ST.WIND ? e : 1, fw = st === ST.STRIKE ? eased(0, 1, s) : st === ST.RECOVER ? 1 : 0;
    armTo(T, m, 1, 0.2, lerp(-0.2, 0.42, up) * (1 - fw) + 0.05 * fw, lerp(0.08, -0.22, up) * (1 - fw) + 0.5 * fw, 1, 0.3);
    armTo(T, m, 0, 0.2, -0.2, 0.28, 0.9 * sw, 0.2);
    T.np += 0.1 * fw - 0.1 * e; T.bp += 0.1 * fw; T.jaw += 0.1 * e; T.tp += 0.4 * e; T.eL = T.eR = 0.4 * e;
  } else if ((an === 'tug' || an === 'snatch') && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) {
    const e = eased(0, 1, wind(q)), s = strikeK(q), two = an === 'tug' ? 1 : 0, ex = e * (1 - s);
    T.by -= 0.12 * ex; T.bz -= 0.1 * ex; T.bp += 0.1 * ex; T.np += 0.2 * ex; T.tp += 0.5 * ex; T.jaw += 0.2 * ex;
    if (st === ST.STRIKE || st === ST.RECOVER) { const k = eased(0, 1, s); T.bz += 0.28 * k; T.bp -= 0.05 * k; T.np -= 0.1 * k; armTo(T, m, 0, 0.2, -0.12, 0.62, 1 * k, -0.3); armTo(T, m, 1, 0.2, -0.12, 0.62, two * k, -0.3); T.by += 0.04 * sin(PI * s); }
    else { armTo(T, m, 0, 0.2, -0.3, 0.2, 0.5 * e, 0); armTo(T, m, 1, 0.2, -0.3, 0.2, two * 0.5 * e, 0); }
  }
  if (an === 'steal' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) {
    const e = eased(0, 1, wind(q)), s2 = strikeK(q), k = st === ST.WIND ? 0 : eased(0, 1, s2);
    T.by -= 0.1 * e; T.bz += 0.05 * e; T.bp += 0.08 * e; T.np -= 0.15 * e; T.hp -= 0.05 * e; T.hw += 0.25 * sd * Math.sin(t * 3) * e; T.eL = T.eR = -0.3 * e; T.tp += 0.4 * e;
    armTo(T, m, 1, 0.2, lerp(-0.25, 0.0, e) * (1 - k) - 0.3 * k, lerp(0.2, 0.7, e) * (1 - k) + 0.28 * k, 1, 0.3 * (1 - k));
    armTo(T, m, 0, 0.2, -0.3, 0.2, 0.4 * e, 0);
    if (m.carry) m.carry.visible = k > 0.7 || st === ST.RECOVER;
  }
  if (pose === 'carry') { T.rear += 0.75; T.by -= 0.1; T.np += 0.45; T.hp += 0.1; T.tp += 0.5; armTo(T, m, 0, 0.1, -0.3, 0.3, 1, 0.3); armTo(T, m, 1, 0.1, -0.3, 0.3, 1, 0.3); T.eL = T.eR = 0.5; if (m.carry) m.carry.visible = true; }
  else if (m.carry && an !== 'steal') m.carry.visible = false;
  if (loco && !pose) { T.tp += 0.3; T.tw *= 0.6; }
}



/* ============================== 猩猩臉（參考圖貼圖）============================== */
/* 臉面網格：把參考圖裁出來的臉（448×460 的畫布，原圖座標 X0,Y0 起）正面投影到頭／口吻／下巴的表面（從正前方往 -z 射線找最前面的點），
   再往外推一點點、做成一片貼合曲面的網格；貼圖 alpha 做柔邊，邊緣與深色毛自然過渡。s＝每像素的公尺數（頭的區域座標，再乘 HS）、ye＝眼睛的高度。 */
const FACE_SRC = { X0: 226, Y0: 262, CW: 448, CH: 460, cx: 448, ey: 381 };
const FACE_ADJ = { s: 0.0012, ye: 0.05, sy: 0.0011, yy: 0.045 };
/* 小猩猩臉（參考圖 小猩猩-正面臉-平常與生氣.png 左右各裁一張，520×512）：cx／ey＝兩眼中線的橫座標與眼高、s＝每像素公尺（不含 HS）、ye＝眼高相對頭心 */
const FACE_BABY = { X0: 0, Y0: 0, CW: 520, CH: 512, cx: 253, ey: 241, s: 0.00119, ye: 0.03, eyes: [162, 241, 366, 243], r0: 34, r1: 50, tex: ['ape_baby.webp', 'ape_baby_angry.webp'] };
/* 猩猩（成年）：參考圖 猩猩-表情特寫 左臉 */
const FACE_APE = Object.assign({}, FACE_SRC, { s: FACE_ADJ.s, ye: FACE_ADJ.ye, eyes: [333, 383, 546, 380], tex: ['ape_closed.webp', 'ape_angry.webp'] });
/* 雜耍猴臉（參考圖 雜耍猴-B正面臉 左＝壞笑、右＝齜牙，各裁一張 585×386）：s＝每像素公尺、ye＝兩眼線相對頭心的高度 */
const FACE_MK = { X0: 0, Y0: 0, CW: 585, CH: 386, cx: 292, ey: 166, s: 0.00128, ye: -0.02, eyes: [202, 166, 381, 166], r0: 26, r1: 38, NX: 48, NY: 32, tex: ['monkey_grin.webp', 'monkey_bare.webp'] };
function apeFaceGrid(parts, HC, HS, F) {
  const s = F.s, ye = F.ye, NX = F.NX || 40, NY = F.NY || 44, W = NX + 1, nvx = W * (NY + 1), cand = ['head', 'snout', 'jaw'].map(n => parts.find(p => p.name === n)).filter(Boolean);
  const X = new Float32Array(nvx), Yv = new Float32Array(nvx), Z = new Float32Array(nvx).fill(NaN), uv = new Float32Array(nvx * 2);
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, px = F.X0 + i / NX * F.CW, py = F.Y0 + j / NY * F.CH; X[k] = HC[0] + (px - F.cx) * s * HS; Yv[k] = HC[1] + (ye + (F.ey - py) * s) * HS; uv[k * 2] = i / NX; uv[k * 2 + 1] = 1 - j / NY;
    for (const pt of cand) { const h = surf(pt, [X[k], Yv[k], HC[2] + 1.2], [0, 0, -1]); if (h && !(Z[k] >= h.p[2])) Z[k] = h.p[2]; }
  }
  /* 沒打到的格子（臉盤外、下巴以下）：同一欄往外延伸，z 隨距離往後退；整欄都沒打到的從隔壁欄借 */
  for (let i = 0; i <= NX; i++) { let a = -1, b = -1; for (let j = 0; j <= NY; j++) if (!isNaN(Z[j * W + i])) { if (a < 0) a = j; b = j; }
    if (a < 0) continue; for (let j = 0; j <= NY; j++) { const k = j * W + i; if (!isNaN(Z[k])) continue; const r = j < a ? a : b, d = abs(Yv[j * W + i] - Yv[r * W + i]); Z[k] = Z[r * W + i] - 0.5 * d; } }
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const k = j * W + i; if (!isNaN(Z[k])) continue; for (let d = 1; d <= NX; d++) { const l = i - d >= 0 ? Z[k - d] : NaN, r = i + d <= NX ? Z[k + d] : NaN; const v = !isNaN(l) ? l : r; if (!isNaN(v)) { Z[k] = v - 0.5 * d * F.CW / NX * s * HS; break; } } if (isNaN(Z[k])) Z[k] = HC[2]; }
  const Z0 = Float32Array.from(Z); for (let pass = 0; pass < 2; pass++) { const Z2 = Float32Array.from(Z); for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) { let t = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += Z[(j + b) * W + i + a]; Z2[j * W + i] = Math.max(t / 9, Z0[j * W + i]); } Z.set(Z2); }
  const pos = new Float32Array(nvx * 3), nor = new Float32Array(nvx * 3), off = 0.011 * HS;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, kl = j * W + Math.max(0, i - 1), kr = j * W + Math.min(NX, i + 1), ku = Math.max(0, j - 1) * W + i, kd = Math.min(NY, j + 1) * W + i;
    const tx = [X[kr] - X[kl], Yv[kr] - Yv[kl], Z[kr] - Z[kl]], ty = [X[kd] - X[ku], Yv[kd] - Yv[ku], Z[kd] - Z[ku]], n = norm3(cross3(ty, tx));
    nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2]; pos[k * 3] = X[k] + n[0] * off; pos[k * 3 + 1] = Yv[k] + n[1] * off; pos[k * 3 + 2] = Z[k] + n[2] * off;
  }
  const idx = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
    return { pos, nor, uv, idx, eyes: F.eyes, r0: F.r0 || 9, r1: F.r1 || 19, cw: F.CW, ch: F.CH, X0: F.X0, Y0: F.Y0, tex: F.tex };
}

/* ============================== 猩猩 ============================== */
/* Q 版但兇：像大猩猩，指節著地走。背上一整片銀白的鞍（白背）、其餘是炭黑的長毛；頭頂一道矢狀脊、厚重的眉骨壓著小而深的眼睛；肩膀又寬又高、手臂長到著地、拳頭比頭還大；腿短。
   小猩猩（young）共用同一副骨架：整隻 ×0.6（makeBeast08 的 young 旗標）、頭更圓更大、眼睛更大、毛是褐黑色、沒有白背。 */
SOFT.ape = (elite, young) => {
  const Y = !!young, E = !!elite;
  const K = { fur: rgb(0x4d4a50), furD: rgb(0x2d2b31), furL: rgb(0x6d6970), mid: rgb(0x625f69), brown: rgb(0x3e3128), silver: rgb(0x8c898f), silverD: rgb(0x6f6c74), silverW: rgb(0xa4a1a7), skin: rgb(0x6c686e), skinD: rgb(0x3a373d), skinL: rgb(0x8b878d), lip: rgb(0x58525a), nose: rgb(0x151317), mouth: rgb(0x4d2024), tongue: rgb(0xd0707c), tooth: rgb(0xf4ecd8), iris: rgb(0x4c2410), irisD: rgb(0x1e0d06), sclera: rgb(0xe2d9cc), lidc: rgb(0x55525a), browc: rgb(0x625f65), lid: rgb(0x231a18), nail: rgb(0x1a1412), scar: rgb(0xb08a7c) };
  if (Y) Object.assign(K, { fur: rgb(0x48444c), furD: rgb(0x29272d), furL: rgb(0x67636c), silver: rgb(0x403d45), silverD: rgb(0x2e2b33), silverW: rgb(0x504c56), mid: rgb(0x3a373f), skin: rgb(0x726e76), skinD: rgb(0x403c44), skinL: rgb(0x938f97), iris: rgb(0x5a2c14) });
  if (E && !Y) Object.assign(K, { silver: rgb(0xaaa7ad), silverD: rgb(0x85828a), silverW: rgb(0xcac7cc) });      /* X4 白背：銀背更亮 */
  const HS = Y ? 1.2 : 1, FS = Y ? 0.8 : 1;
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 1.2, 0.8], hd = (x, y, z) => [HC[0] + x * HS, HC[1] + y * HS, HC[2] + z * HS];
  const FJ = { j0: [0.55, 1.12, 0.22], j1: [0.58, 0.62, 0.12], j2: [0.54, 0.2, 0.3], pad: [0.54, 0, 0.36] }, RJ = { j0: [0.3, 0.5, -0.52], j1: [0.36, 0.3, -0.4], j2: [0.36, 0.11, -0.52], pad: [0.36, 0, -0.45] };
  const sk = softSkel({ body: [0, 0.85, -0.1], pelvis: [0, 0.56, -0.55], chest: [0, 1.08, 0.12], neck: [0, 1.18, 0.5], head: [0, 1.2, 0.66], jaw: hd(0, -0.2, 0.12), ear: hd(0.27, 0.05, -0.1), mane: [0, 1.45, 0.1], fl: FJ, rl: RJ, tail: [[0, 0.52, -0.78]], mane2: [0, 1.4, 0.3] });
  const BN = sk.BN, X = {};

  /* ----- 頭（照使用者確認的參考圖）：頭頂往後上尖起的矢狀脊（毛簇）、一道粗弧的眉骨壓在深陷的眼窩上、短鼻樑接到寬扁的鼻墊、下半臉圓鼓前凸（上唇長、嘴線平）、
     淺一階的灰色心形臉盤（包住眼、鼻、口吻，盤外是深色長毛）、小圓耳貼頭側。小猩猩：臉更圓、口吻小、眼更大、嘴角微笑。 ----- */
  const MZ = Y ? 0.8 : 1, P3 = (pt, c, r, d) => push(pt, c.map(v => v * HS), (Array.isArray(r) ? r : [r, r, r]).map(v => v * HS), d.map(v => v * HS)), LP = p => [(p[0] - HC[0]) / HS, (p[1] - HC[1]) / HS, (p[2] - HC[2]) / HS];
  const head = ball('head', 30, 18, [0.31 * HS, (Y ? 0.34 : 0.3) * HS, 0.31 * HS], { vmap: t => Math.pow(t, 1.1) });
  if (!Y) { P3(head, [0, 0.3, -0.1], [0.11, 0.24, 0.3], [0, 0.2, -0.15]); P3(head, [0, 0.1, -0.3], [0.26, 0.26, 0.18], [0, 0.03, -0.07]); }      // 矢狀脊（往後上方）＋後腦
  else { P3(head, [0, 0.2, 0.0], [0.2, 0.16, 0.24], [0, 0.03, 0]); P3(head, [0, 0.0, -0.24], [0.26, 0.26, 0.16], [0, 0.02, -0.03]); }      // 小猩猩：頭圓，頭頂一個圓丘＋正中往前上翹的一撮毛（下一行）
  P3(head, [0, 0.21, 0.24], [0.2, 0.12, 0.14], [0, 0.0, -0.06 * (Y ? 0.5 : 1)]);      // 額頭往後斜
  if (Y) { P3(head, [0, 0.4, 0.05], [0.1, 0.14, 0.13], [0, 0.12, 0.04]); P3(head, [0.03, 0.36, -0.1], [0.08, 0.1, 0.1], [0.01, 0.08, -0.04]); P3(head, [-0.04, 0.34, 0.18], [0.07, 0.09, 0.09], [-0.01, 0.07, 0.04]); }      // 小猩猩頭頂那一撮毛（參考圖：正中一撮往上翹、旁邊兩小撮）
  P3(head, [0, 0.1, 0.31], [0.31, 0.075, 0.12], [0, 0.0, 0.1 * (Y ? 0.4 : 1)]);      // 眉骨（橫過雙眼上方的一整條粗弧）
  P3(head, [0.17, 0.085, 0.3], [0.13, 0.06, 0.1], [0.0, -0.005, 0.045 * (Y ? 0.4 : 1)]);      // 眉骨外側的弧（蓋住眼角）
  P3(head, [0.19, 0.0, 0.33], [0.08, 0.065, 0.075], [0, 0, -0.04 * (Y ? 0.5 : 1)]);      // 眼窩（往內凹）
  P3(head, [0, 0.02, 0.33], [0.05, 0.11, 0.08], [0, 0.0, 0.03]);      // 短鼻樑（接到眉心）
  P3(head, [0.21, -0.12, 0.02], [0.2, 0.22, 0.24], [0.07, -0.04, 0.0]);      // 兩頰、下顎寬
  P3(head, [0, -0.1, 0.3], [0.2, 0.14, 0.1], [0, -0.01, 0.03]);      // 口鼻根
  place(head, HC); finish(head); head.sk = B.head; head.tex = [512, 384]; add(head);
  /* 心形臉盤：上緣在眉骨上方（中間微凹）、兩側含眼角與顴骨、往下收窄到下巴；邊緣用毛紋抖一點 */
  const diskD = (hx, hy, hz, k) => { const ax = abs(hx), wy = (Y ? 0.275 : 0.26) - 0.1 * smooth(0.02, -0.3, hy), top = (Y ? 0.125 : 0.115) + 0.05 * smooth(0.0, 0.17, ax) - 0.07 * smooth(0.19, 0.27, ax), s = Math.min(top - hy, hy + 0.38, wy - ax) + 0.014 * k; return s * smooth(0.1, 0.17, hz); };
  head.paint = (c, p, n) => { const [hx, hy, hz] = LP(p), ax = abs(hx), k = furN(p, 1.3); put(c, K.fur); ink(c, 0.2 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.16 * smooth(0.2, 0.9, -k), K.furL);
    const fm = 0 * smooth(0.0, 0.016, diskD(hx, hy, hz, k)); ink(c, 0.98 * fm, K.skin);      /* 臉盤膚色改由貼圖（fm＝0 停用，程式保留） */
    ink(c, 0.3 * fm * smooth(0.02, 0.1, hy) * smooth(0.12, 0.0, hy - 0.1 + 0.05) * 0.6, K.skinD);      /* 眉骨下的陰影（眼窩深） */
    ink(c, 0.5 * fm * smooth(0.12, 0.17, hy), K.skinL);      /* 眉骨上緣亮 */
    { const EC = E8.EC; for (const sx of [1, -1]) { const dx = (p[0] * sx - EC[0]) / HS, dy = (p[1] - EC[1]) / HS; ink(c, 0.6 * fm * smooth(0.1, 0.05, h2(dx / 1.1, (dy + 0.005) / 0.8)), K.skinD); } }      /* 眼窩一圈暗 */
    ink(c, 0.55 * fm * cov(abs(ax - 0.014) - 0.004, 0.004) * smooth(0.04, 0.1, hy) * smooth(0.19, 0.14, hy), K.skinD);      /* 眉心兩道皺 */
    ink(c, 0.28 * fm * smooth(0.0, 0.08, ax - 0.2) * smooth(-0.1, 0.0, hy), K.skinL);      /* 顴骨 */
  };
  /* 口吻：上半臉往前鼓的大圓（上唇長）；鼻墊寬扁、兩個大鼻孔朝前下；嘴線平、嘴角微下壓（小猩猩上揚） */
  { const sn = ball('snout', 20, 12, [0.15 * HS * MZ, 0.105 * HS * MZ, 0.115 * HS * MZ], { e: 0.85 }); P3(sn, [0, 0.04, 0.1], [0.1 * MZ, 0.05 * MZ, 0.05], [0, 0.004, 0.02]); P3(sn, [0.14 * MZ, -0.03, 0.0], [0.08, 0.08, 0.1], [0.02, 0, 0.0]); place(sn, hd(0, -0.1 * MZ - 0.01, 0.32 * (Y ? 0.95 : 1))); sn.sk = B.head; sn.tex = [192, 128]; sn.blend = [head, 0.1]; add(sn);
    sn.paint = (c, p, n) => { const [hx, hy, hz] = LP(p), ax = abs(hx), k = furN(p, 1.6); put(c, K.skin); ink(c, 0.28 * smooth(-0.2, -0.05, hy), K.skinL);
      { const dx = ax - 0.052 * MZ, dy = hy + 0.07 * MZ, al = dx * 0.88 - dy * 0.48, ac = dx * 0.48 + dy * 0.88, nh = h2(al / (0.037 * MZ), ac / (0.019 * MZ)) - 1; ink(c, cov(nh, 0.22) * smooth(0.26, 0.34, hz), K.nose); ink(c, 0.4 * cov(abs(nh - 0.5) - 0.4, 0.2) * smooth(0.26, 0.34, hz) * 0, K.skinD); }      /* 鼻孔：外低內高的斜弧 */
      ink(c, 0.32 * cov(abs(hy + 0.115 * MZ + 0.3 * Math.max(0, ax - 0.06) * 0) - 0.003, 0.004) * smooth(0.075 * MZ, 0.07 * MZ, ax) * smooth(0.26, 0.34, hz) * 0, K.skinD);
      ink(c, 0.6 * cov(abs(ax - 0.092 * MZ + (hy + 0.06 * MZ) * 0.5) - 0.0035, 0.004) * smooth(-0.015, -0.03, hy + 0.05 * MZ) * smooth(-0.13 * MZ, -0.09 * MZ, hy) * smooth(0.26, 0.34, hz), K.skinD);      /* 鼻翼外緣：往下略往外開的兩道溝（鼻墊呈倒梯形） */
      ink(c, 0.28 * cov(abs(hy + 0.1 * MZ) - 0.004, 0.005) * smooth(0.1 * MZ, 0.08 * MZ, ax) * smooth(0.26, 0.34, hz), K.skinD);      /* 鼻墊下緣 */
      ink(c, 0.4 * cov(ax - 0.008, 0.008) * smooth(-0.1, -0.15, hy) * smooth(-0.2, -0.16, hy) * smooth(0.3, 0.38, hz), K.skinD);      /* 人中 */
      const lineY = -0.185 * MZ + (Y ? 0.035 : -0.02) * (ax / 0.14) * (ax / 0.14); ink(c, 0.92 * cov(abs(hy - lineY) - 0.0065, 0.005) * smooth(0.1, 0.2, hz) * smooth(0.19, 0.15, ax), K.mouth);      /* 嘴線 */
      if (n[1] < -0.8) { put(c, K.mouth); ink(c, 0.5 * smooth(0.0, 0.2, hz), K.tongue); } };
  }
  { const JC = hd(0, -0.218 * MZ, 0.262 * (Y ? 0.95 : 1)), jaw = ball('jaw', 16, 10, [0.12 * HS * MZ, 0.075 * HS * MZ, 0.128 * HS * MZ]); P3(jaw, [0, 0.07, 0], [0.15, 0.06, 0.13], [0, -0.025, 0]); P3(jaw, [0, -0.04, 0.12], [0.1, 0.08, 0.06], [0, 0.0, 0.015]); place(jaw, JC); jaw.sk = B.head; jaw.tex = [128, 96]; add(jaw);
    jaw.paint = (c, p, n) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2], ax = abs(x) / HS, yy = y / HS, zz = z / HS; put(c, K.skin); ink(c, 0.35 * smooth(-0.02, -0.1, yy), K.skinL); ink(c, 0.3 * smooth(0.0, -0.1, yy) * smooth(0.0, 0.1, zz), K.skinL);
      if (n[1] > 0.55 && yy > 0.0) { put(c, K.mouth); ink(c, 0.95 * cov((h2(x / (0.085 * HS), (z - 0.01) / (0.1 * HS)) - 1) * 0.07), K.tongue); ink(c, 0.5 * cov(abs(x) - 0.004, 0.004) * smooth(-0.05, 0.08, zz), K.mouth); } };
    /* 犬齒與牙列：嘴閉著時全藏在上唇／下唇後面（上犬齒藏在下顎裡、下犬齒藏在口吻裡），張嘴才露出 */
    const ZC = 0.345 * (Y ? 0.96 : 1), YU = -0.17 * MZ;
    for (const sx of [1, -1]) {
      const up = cone('canineU' + sx, 5, hd(sx * 0.07 * MZ, YU - 0.0, ZC - 0.04), hd(sx * 0.072 * MZ, YU - 0.05 * MZ, ZC - 0.035), hd(sx * 0.073 * MZ, YU - (Y ? 0.035 : 0.088) * MZ, ZC - 0.03), 0.026 * HS * MZ); up.sk = B.head; up.col = K.tooth; up.tex = [8, 8]; add(up);
      const lo = cone('canineL' + sx, 5, hd(sx * 0.09 * MZ, YU - 0.07 * MZ, ZC - 0.06), hd(sx * 0.091 * MZ, YU - 0.02 * MZ, ZC - 0.055), hd(sx * 0.092 * MZ, YU + 0.05 * MZ, ZC - 0.05), 0.024 * HS * MZ); lo.sk = B.jaw; lo.col = K.tooth; lo.tex = [8, 8]; add(lo); }
    { const row = (name, bone, y0, dir) => { const ks = []; for (let i = 0; i <= 6; i++) { const t = i / 6 * 2 - 1, x = t * 0.1 * MZ; ks.push({ p: hd(x, y0, ZC - 0.07 - 0.07 * t * t), rx: 0.008 * HS, ry: 0.01 * HS }); } const t = tubeP(name, 4, ks, { nv: 8, ref: [0, 1, 0] }); t.sk = bone; t.col = K.tooth; t.tex = [8, 8]; return add(t); };
      row('teethU', B.head, YU - 0.04 * MZ, 1); row('teethL', B.jaw, YU - 0.03 * MZ, -1); } }
  { const ear = ball('earL', 14, 9, Y ? [0.082 * HS, 0.092 * HS, 0.03 * HS] : [0.055 * HS, 0.07 * HS, 0.022 * HS]); place(ear, hd(Y ? 0.33 : 0.305, Y ? -0.01 : 0.0, Y ? -0.03 : -0.06), [0.0, 1.35, 0.0]); ear.sk = B.earL; ear.tex = [48, 48]; add(ear);
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.skin); ink(c, 0.55 * smooth(0.25, 0.85, abs(d[2])) * smooth(0.95, 0.45, h2(d[0], d[1])) , K.skinD); ink(c, 0.4 * smooth(0.55, 1.0, h2(d[0], d[1])), K.skinL); }; add(mirrorX(ear, 'earR')).sk = B.earR; }
  /* 毛簇：矢狀脊兩側的斜坡上各排幾撮往外往後翹的毛（貼著頭皮、尖端微翹），讓頭頂的輪廓有毛的層次，不是光滑的錐 */
  /* 頭頂兩側的毛簇（crest）：貼臉圖後從 3/4 看像兩支黑角，拿掉（輪廓由頭的矢狀脊負責） */
  const E8 = eyeSet(add, sk, head, HC, [0.19, 0.05, 0.4], { r: [(Y ? 0.078 : 0.057) * HS, (Y ? 0.078 : 0.055) * HS, 0.022], pr: [(Y ? 0.034 : 0.03) * HS, (Y ? 0.038 : 0.034) * HS, 0.008], po: [0, -0.004, 0.013], tilt: Y ? -0.06 : 0.1, iris: K.iris, irisD: K.irisD, sclera: Y ? null : K.sclera, lid: K.lidc, brow: K.browc, bs: (Y ? 0.55 : 0.62) * HS, bsx: 0.32, bo: [0.0, Y ? 0.03 : 0.012, -0.03], brk: Y ? [0.1, 0.095, 0.075] : [0.045, 0.07, 0.04], hl: rgb(0xffffff), lidTop: Y ? 0.9 : 0.52, ez: -0.002, seg: 14, segv: 7 }); Object.assign(X, E8.X);

  /* ----- 身體：脊椎前高後低（肩高臀低、從側面看是前高後低的三角）。胸寬厚、肩背有斜方肌隆起，屁股小 ----- */
  const body = tubeP('body', 26, [{ p: [0, 0.58, -0.78], rx: 0.2, ry: 0.2, rd: 0.19, wt: 0.92 }, { p: [0, 0.64, -0.55], rx: 0.31, ry: 0.3, rd: 0.3, wt: 0.9 }, { p: [0, 0.78, -0.22], rx: 0.44, ry: 0.4, rd: 0.42, wt: 0.88 }, { p: [0, 1.0, 0.1], rx: 0.6, ry: 0.5, rd: 0.46, wt: 0.84 }, { p: [0, 1.12, 0.34], rx: 0.54, ry: 0.48, rd: 0.4, wt: 0.84 }, { p: [0, 1.14, 0.52], rx: 0.33, ry: 0.36, rd: 0.3 }], { nv: 16, capA: 0.14, capB: 0.16 });
  push(body, [0, 1.46, 0.06], [0.4, 0.2, 0.34], [0, 0.05, 0]); push(body, [0.55, 1.14, 0.2], 0.3, [0.05, 0.02, 0]);      // 斜方肌隆起（脖子後面的山）、肩頭
  finish(body); body.tex = [384, 256]; add(body); body.sk = bodySk(-0.36, 0.08, 0.36, 0.55);
  /* 銀背：背上淺灰的 V 形——肩胛上方最寬、往下（往後）收到腰，下緣是參差的毛尖；外圈一層中灰漸層，和深色毛自然過渡 */
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, k = furN(p, 0.9), z = p[2]; put(c, K.fur); ink(c, 0.2 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.16 * smooth(0.2, 0.9, -k), K.furL); ink(c, 0.5 * smooth(1.8, 2.8, al), K.furL);
    const nz = 0.5 + 0.5 * k, zz = z + 0.05 * k, aa = al + 0.22 * k + 0.11 * sin(zz * 34 + al * 1.6), wm = (E ? 0.38 : 0.1) + (E ? 1.95 : 1.5) * Math.pow(smooth(E ? -0.88 : -0.74, 0.14, zz), 1.35);      /* X4 白背：銀背更寬 */
    const along = smooth(-0.9, -0.7, zz) * smooth(0.22, 0.04, zz), wide = smooth(wm + 0.4, wm - 0.1, aa), core = smooth(wm, wm - 0.5, aa) * smooth(E ? -0.97 : -0.84, E ? -0.8 : -0.66, zz) * smooth(E ? 0.32 : 0.2, E ? 0.12 : 0.06, zz);
    ink(c, 0.7 * along * wide * (0.6 + 0.4 * nz), K.mid); ink(c, 0.9 * core * (0.55 + 0.45 * nz), K.silver); ink(c, 0.4 * core * smooth(0.1, 0.8, k), K.silverD); ink(c, 0.35 * core * smooth(0.3, 0.9, -k), K.silverW);
    /* 胸口裸露的深灰皮膚（捶胸時看得到）：腹側、肩線以前，邊緣像稀疏的毛 */
    const ch = smooth(2.0, 2.6, al + 0.2 * k) * smooth(-0.1, 0.18, z) * smooth(0.62, 0.4, z); ink(c, 0.96 * ch, K.skin); ink(c, 0.5 * ch * smooth(0.2, 0.8, k), K.skinL); ink(c, 0.4 * ch * smooth(0.3, 0.9, -k), K.skinD); };
  /* 肩上與手臂的長毛：一撮撮往下垂 */
  const locks = []; const lock = (name, on, o, d, tip, hw, th, skin, silver) => { const h = surf(on, o, norm3(d)); if (!h) return null; const b0 = add3(h.p, h.n, -0.05), s = tuftK(name, b0, tip(h.p, h.n), [1, 0, 0], hw, th, { nu: 6, bow: 0.4, up: h.n, pr: [1, 0.9, 0.55, 0.05] }); s.sk = skin; s.tex = [16, 32]; s.paint = (c, p, n, u, v) => { put(c, silver ? K.silver : K.fur); ink(c, 0.5 * smooth(0.5, 1.0, v), silver ? K.silverD : K.furD); ink(c, 0.3 * smooth(0.3, 0.9, abs(sin(u * TAU * 2))), silver ? K.silverW : K.furL); }; locks.push(s); return add(s); };
  /* 肩背的長毛用貼圖表現（銀白的鞍邊緣參差），不另外做毛簇（做出來像骨板） */

  /* ----- 手臂：粗長，前臂比上臂更粗；拳頭極大，指節朝下著地 ----- */
  const limbPaint = (c, p, n) => { const k = furN(p, 1.1); put(c, K.fur); ink(c, 0.2 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.16 * smooth(0.2, 0.9, -k), K.furL); };
  const legSkA = (b, J) => legSkG(b, J, 0.09);
  /* 手臂：比腿長、比腿粗，前臂更粗；拳頭大，指節朝前著地、拇指在內側；手背手掌是裸露的深灰皮膚 */
  legParts(add, body, 'fl', [{ p: [0.55, 1.14, 0.22], rx: 0.27, ry: 0.27 }, { p: [0.57, 0.9, 0.18], rx: 0.25, ry: 0.25 }, { p: [0.58, 0.62, 0.12], rx: 0.2, ry: 0.21 }, { p: [0.56, 0.42, 0.2], rx: 0.23, ry: 0.23 }, { p: [0.54, 0.2, 0.3], rx: 0.16, ry: 0.16 }], FJ, 0, { paint: limbPaint, sk: legSkA, blend: 0.2, tex: [96, 128], capA: 0.2 });
  /* 拳頭（照參考圖）：一整塊實心、略扁的圓角方塊（拳擊手套的形狀），底面平貼地、上緣伸進前臂裡（無縫）；指節與指縫用貼圖線條表現、大拇指是內側一個小隆起；手背與前臂交界一圈毛邊（扁環） */
  { const AX = 0.54, fist = ball('hand', 20, 12, [0.2 * FS, 0.2 * FS, 0.22 * FS], { e: 0.62 }); push(fist, [-0.2 * FS, 0.0, 0.12], [0.09, 0.09, 0.11], [-0.025, 0.0, 0.02], false); fist.map(p => { if (p[1] < -0.17 * FS) p[1] = -0.17 * FS; }); place(fist, [AX, 0.19 * FS, 0.33]); fist.tex = [128, 112];
    fist.paint = (c, p, n) => { const y = p[1], z = p[2] - 0.33, x = abs(p[0]) - AX; put(c, K.skin); ink(c, 0.35 * smooth(0.16 * FS, 0.38, y) * smooth(0.0, 0.8, n[1]), K.skinL); ink(c, 0.45 * smooth(0.03, 0.2, z) * smooth(0.0, 0.8, -n[1]) * smooth(0.12, 0.02, y), K.skinD);
      for (const dx of [-0.08, 0, 0.08]) ink(c, 0.7 * cov(abs(x - dx * FS) - 0.006, 0.006) * smooth(0.1, 0.18, z) * smooth(0.36, 0.14, y) * smooth(0.0, 0.07, y), K.skinD); ink(c, 0.45 * cov(abs(y - 0.27 * FS) - 0.01, 0.009) * smooth(0.08, 0.16, z), K.skinD); };
    fist.sk = Lg(0) + 2; add(fist); add(mirrorX(fist, 'handR')).sk = Lg(1) + 2;
    { const cuff = ball('cuff', 18, 8, [0.21 * FS, 0.07, 0.22 * FS], { axis: 'y', vmax: 1 }); place(cuff, [AX, 0.35 * FS, 0.3]); cuff.tex = [64, 32]; cuff.paint = limbPaint; cuff.sk = Lg(0) + 2; add(cuff); add(mirrorX(cuff, 'cuffR')).sk = Lg(1) + 2; } }
  /* 腿：短、細，屁股小；腳掌是裸露的深灰皮膚 */
  legParts(add, body, 'rl', [{ p: [0.3, 0.54, -0.52], rx: 0.24, ry: 0.25, rd: 0.23 }, { p: [0.33, 0.42, -0.46], rx: 0.2, ry: 0.2 }, { p: [0.36, 0.3, -0.4], rx: 0.14, ry: 0.14 }, { p: [0.36, 0.2, -0.47], rx: 0.115, ry: 0.12 }, { p: [0.36, 0.11, -0.52], rx: 0.1, ry: 0.105 }], RJ, 2, { paint: limbPaint, sk: legSkA, blend: 0.16, tex: [80, 96], capA: 0.14 });
  /* 後腳：一整塊扁平、前寬後窄的腳掌墊，整塊貼地；腳趾只用前緣的趾縫線條與色分區表現；腿接縫處一圈毛邊（扁環） */
  { const ft = ball('foot', 20, 10, [0.115, 0.06, 0.17], { e: 0.7 }); ft.map(p => { const zn = p[2] / 0.17; p[0] *= 1 + 0.28 * zn; if (p[1] < -0.055) p[1] = -0.055; }); place(ft, [0.36, 0.055, -0.46]); ft.tex = [112, 112];
    ft.paint = (c, p, n) => { const rx = abs(p[0]) - 0.36, zr = p[2] + 0.46, y = p[1]; put(c, K.skin); ink(c, 0.3 * smooth(0.06, 0.12, y), K.skinL); ink(c, 0.4 * smooth(0.0, 0.8, -n[1]), K.skinD);
      for (const gx of [-0.075, -0.025, 0.025, 0.075]) ink(c, 0.65 * cov(abs(rx - gx * (1 + 0.28 * zr / 0.17)) - 0.004, 0.005) * smooth(0.07, 0.11, zr) * smooth(0.1, 0.0, y), K.skinD); ink(c, 0.35 * cov(abs(zr - 0.085) - 0.006, 0.006) * smooth(0.14, 0.1, abs(rx)), K.skinD); ink(c, 0.3 * smooth(0.12, 0.17, zr) * smooth(0.0, 0.8, n[2]), K.skinD); };
    ft.sk = Lg(2) + 2; add(ft); add(mirrorX(ft, 'footR')).sk = Lg(3) + 2;
    const fr = ball('fcuff', 16, 8, [0.108, 0.055, 0.115], { axis: 'y', vmax: 1 }); place(fr, [0.36, 0.14, -0.5]); fr.tex = [48, 24]; fr.paint = limbPaint; fr.sk = Lg(2) + 2; add(fr); add(mirrorX(fr, 'fcuffR')).sk = Lg(3) + 2; }
  /* 臉直接用參考圖的貼圖（assets/face/*.webp）：程序化的眼、眉、牙、犬齒拿掉（骨頭仍在，m.bn 不變）；下巴改固定在頭上當形狀（張嘴改由換圖表現） */
  const FACE = apeFaceGrid(parts, HC, HS, Y ? Object.assign({}, FACE_BABY, { s: FACE_BABY.s / HS }) : FACE_APE); for (let i = parts.length - 1; i >= 0; i--) if (/^(canine|teeth|eye|pup|brow)/.test(parts[i].name)) parts.splice(i, 1);
  const AO = [{ id: 'head', c: HC, r: 0.32 }, { id: 'body', c: [0, 1.0, 0.14], r: 0.5 }, { id: 'body', c: [0, 0.74, -0.3], r: 0.4 }];
  withAO(parts, AO);
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: 1, X, bg: K.fur, eyeCol: Y ? [0.3, 0.2, 0.12] : [0.22, 0.15, 0.1], key: K, face: FACE,
    S: { k: 1.35, run: 4.6, stride: 0.48, lift: 0.09, bob: 0.04, cad: 1.15, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.3, jawMax: 0.55, maneUp: 0.03, wag: 1, wagAmp: 0, halfW: 0.5, tailRun: 0, low: 0.12, u: 0.62, jump: 0.5, jaw0: 0, reach: 0.3, elastic: 1, maneK: 0, rearK: 1.1, pose: poseApe } };
};

/* 猩猩姿勢：WARN／招式 beat＝捶胸（用後腳站起來、雙拳輪流捶胸）｜rock＝拔石（彎腰兩手伸到地上→撈起→站直舉過頭丟出）｜grab＝抓（前傾、一手往前伸→往上提起）；slam 用共用的（rear＋雙拳砸地）；v.pose='sit'＝坐著 */
function poseApe(T, q) {
  const { st, p, t, an, m, v } = q, pose = v.pose, sd = q.sd || 1, n8 = !!(m.sp && m.sp.v8), RX = n8 ? 0.26 : 0, RY = n8 ? -0.12 : 0, RZ = n8 ? -0.1 : 0, GX = n8 ? 0.12 : 0, GY = n8 ? -0.3 : 0, GZ = n8 ? 0.08 : 0, beating = st === ST.WARN || (an === 'beat' && (st === ST.WIND || st === ST.STRIKE));
  if (beating) { const e = st === ST.WARN ? eased(0, 0.5, p) : st === ST.WIND ? eased(0, 1, wind(q)) : 1, cyc = t * 7.5 + m.seed, a = Math.max(0, sin(cyc)), b = Math.max(0, sin(cyc + PI));
    T.rear += 0.95 * e; T.bz -= 0.1 * e; T.np += 0.6 * e; T.hp += 0.2 * e; T.jaw += (0.45 + 0.3 * sin(t * 9)) * e; T.eL = T.eR = 1; T.by -= 0.05 * e; footAt(T, m, 2, -0.04 * e, 0, 0.05 * e); footAt(T, m, 3, -0.04 * e, 0, 0.05 * e); T.sq += 2 * e * (a + b);
    armTo(T, m, 0, lerp(0.5, 0.18, a), lerp(-0.34, -0.6, a), lerp(0.08, -0.2, a), e, 0.2); armTo(T, m, 1, lerp(0.5, 0.18, b), lerp(-0.34, -0.6, b), lerp(0.08, -0.2, b), e, 0.2); T.hw += 0.1 * sin(t * 3); }
  else if (an === 'rock' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q), dig = st === ST.WIND ? eased(0, 0.6, e) : 0, lift = st === ST.WIND ? eased(0.6, 1, e) : 1;
    if (st === ST.WIND) { T.bp += 0.3 * dig * (1 - lift); T.bz += 0.1 * dig; T.np += 0.3 * dig * (1 - lift); T.by -= 0.1 * dig; T.rear += 0.3 * lift; T.np -= 0.1 * lift; armTo(T, m, 0, 0.3 + RX * lift, lerp(-0.55, 0.0, lift) + RY * lift, lerp(0.55, 0.25, lift) + RZ * lift, 1, 0.4 * (1 - lift)); armTo(T, m, 1, 0.3 + RX * lift, lerp(-0.55, 0.0, lift) + RY * lift, lerp(0.55, 0.25, lift) + RZ * lift, 1, 0.4 * (1 - lift)); T.jaw += 0.2 * lift; }
    else { const k = eased(0, 1, s); T.rear += 0.3 - 0.15 * k; T.bp += 0.2 * k; T.bz += 0.1 * k; T.np += 0.1 * k; armTo(T, m, 0, 0.3 - 0.1 * k + RX, lerp(0.1, 0.0, k) + RY, lerp(0.25, 0.9, k) + RZ, 1, -0.2); armTo(T, m, 1, 0.3 - 0.1 * k + RX, lerp(0.1, 0.0, k) + RY, lerp(0.25, 0.9, k) + RZ, 1 - 0.3 * k, -0.2); T.jaw += 0.5; } }
  else if (an === 'grab' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q);
    if (st === ST.WIND) { T.bp += 0.12 * e; T.bz += 0.1 * e; T.np += 0.1 * e; T.hp -= 0.1 * e; T.jaw += 0.25 * e; T.by -= 0.04 * e; armTo(T, m, 1, 0.45 + GX * e, lerp(-0.45, -0.1, e) + GY * e, lerp(0.2, 0.75, e) + GZ * e, e, 0.2); armTo(T, m, 0, 0.5, -0.5, 0.3, 0, 0); T.hw += 0.12 * sd * e; }
    else { const k = eased(0, 1, s); T.rear += 0.08 * k; T.bz += 0.06; T.jaw += 0.5; T.np -= 0.1 * k; armTo(T, m, 1, 0.45 + GX, lerp(-0.1, 0.55, k) + GY, 0.7 - 0.1 * k + GZ, 1, 0); T.hp -= 0.15 * k; } }
  else if (pose === 'sit' && st === ST.IDLE) { T.rear += 0.3; T.by -= 0.22; T.np += 0.15; T.hp -= 0.1; footAt(T, m, 2, 0, 0, 0.3, 0.2); footAt(T, m, 3, 0, 0, 0.3, 0.2); armTo(T, m, 0, 0.45, -0.38, 0.35, 1, 0.3); armTo(T, m, 1, 0.45, -0.38, 0.35, 1, 0.3); T.hw += 0.3 * sin(t * 0.6 + m.seed); }
  if (v.enr && st !== ST.DEAD) { T.jaw += 0.2; }
}



/* ============================== 箭豬 ============================== */
/* 照參考圖（箭豬-A設定 四面、箭豬-B正面臉）重做（art-porc）：熊一樣的圓臉與圓耳、大黑鼻頭、低矮渾圓的身子、短粗的熊腳（腳掌貼地、五根黑色彎爪往前下扣到地面）；
   從額頭（眉毛上方）到屁股、往下到腿根，蓋滿一大片圓潤的粗錐形長刺：刺根深咖啡、前段米白（交界是鋸齒狀的火焰紋）、尖端白；刺往後倒、同時往四周放射成一個圓頂。
   臉：直接用參考圖 B 剪下來的貼圖（assets/face/porc_calm.webp 平常、porc_angry.webp 生氣齜牙）；威嚇／蓄力／出手時換生氣圖、虹膜轉紅（和猴群、猩猩同一套 attachFace）。
   背刺骨頭照舊三組（porcQ0 肩頸、porcQ1 背、porcQ2 臀），只負責豎刺時的發抖；豎刺本身改在頂點著色器裡做：每根刺繞自己的刺根轉向「從身體中心往外放射」的方向（參考圖 B 右、A 的 3/4 圖），
   豎起量＝m.mats[0].userData.q（0 平貼～1 全豎，噴刺環出手時到 1.25）。每根刺的刺根與轉軸存在 sp.D.qb／qa，第一次擺姿勢時掛到幾何上（aQb／aQa）；影子用同一套變形（customDepthMaterial）。 */
const FACE_PORC = { X0: 0, Y0: 0, CW: 530, CH: 380, cx: 265, ey: 145, s: 0.00104, ye: 0.012, eyes: [155, 145, 375, 145], r0: 22, r1: 34, NX: 48, NY: 36, tex: ['porc_calm.webp', 'porc_angry.webp'] };
/* 刺沿長度的位置（0 刺根～1 刺尖）：tubeP 的列是平均分在站點之間的，貼圖 v 要換回長度比例才好畫花紋。QS＝站點的長度比例 */
const QS = [-0.1, 0.12, 0.4, 0.68, 0.88, 1.0];
const qLen = v => { const k = clamp(v * 10 / 9, 0, 1) * (QS.length - 1), i = Math.min(QS.length - 2, Math.floor(k)); return lerp(QS[i], QS[i + 1], k - i); };
SOFT.porc = () => {
  const K = { fur: rgb(0x56423b), furD: rgb(0x332825), furL: rgb(0x735d55), face: rgb(0x58443e), faceD: rgb(0x3e302c), faceL: rgb(0x735e57), earIn: rgb(0x3a2b27), earRim: rgb(0x7c655c),
    claw: rgb(0x262427), clawL: rgb(0x55535a), sole: rgb(0x3a2c28), qDark: rgb(0x433835), qDarkD: rgb(0x2e2524), qDarkL: rgb(0x605250), qCream: rgb(0xecd9c4), qCreamD: rgb(0xc9b29c), qTip: rgb(0xfbfaf8), iris: rgb(0x5a3418), irisD: rgb(0x140a06), hl: rgb(0xffffff) };
  const parts = [], add = pt => (parts.push(pt), pt), HS = 1.1, HC = [0, 0.3, 0.37], hd = (x, y, z) => [HC[0] + x * HS, HC[1] + y * HS, HC[2] + z * HS], sc3 = r => r.map(x => x * HS), HP = -0.06, hdr = (x, y, z) => hd(x, y * cos(HP) - z * sin(HP), y * sin(HP) + z * cos(HP));
  const FJ = { j0: [0.24, 0.31, 0.2], j1: [0.28, 0.17, 0.25], j2: [0.3, 0.065, 0.3], pad: [0.305, 0, 0.35] }, RJ = { j0: [0.24, 0.31, -0.27], j1: [0.27, 0.17, -0.215], j2: [0.275, 0.065, -0.27], pad: [0.275, 0, -0.235] };
  const TK = [[0, 0.3, -0.42, 0.05], [0, 0.27, -0.5, 0.04], [0, 0.24, -0.56, 0.025]], TN = 2;
  const sk = softSkel({ body: [0, 0.36, -0.06], pelvis: [0, 0.34, -0.28], chest: [0, 0.36, 0.14], neck: [0, 0.33, 0.25], head: [0, 0.29, 0.34], jaw: hd(0, -0.12, 0.08), ear: hd(0.215, 0.165, -0.03), mane: [0, 0.62, 0.05], fl: FJ, rl: RJ, tail: TK.slice(0, TN).map(k => [k[0], k[1], k[2]]), mane2: [0, 0.6, 0.25] });
  const BN = sk.BN, X = {};
  const bq0 = sk.bone('porcQ0', B.chest, [0, 0.6, 0.2]), bq1 = sk.bone('porcQ1', B.body, [0, 0.68, -0.06]), bq2 = sk.bone('porcQ2', B.pelvis, [0, 0.6, -0.32]);

  /* ----- 頭：寬圓的熊臉（兩頰鼓、眉骨略高）＋短而鈍的口吻（鼻頭在貼圖上）＋圓下巴；臉是貼圖，頭殼只要形狀和膚色對 ----- */
  const facePaint = (c, p) => { const k = furN(p, 1.3), y = p[1] - HC[1], z = p[2] - HC[2]; put(c, K.face); ink(c, 0.3 * smooth(0.1, 0.8, k), K.faceD); ink(c, 0.22 * smooth(0.2, 0.9, -k), K.faceL); ink(c, 0.35 * smooth(0.0, -0.18, z), K.faceD); ink(c, 0.25 * smooth(0.05, 0.2, y), K.faceL); };
  const head = ball('head', 40, 26, sc3([0.27, 0.19, 0.165]), { e: 0.92 });
  push(head, sc3([0.17, -0.07, 0.08]), sc3([0.14, 0.12, 0.14]), sc3([0.03, -0.012, 0.012])); push(head, sc3([0, 0.11, 0.09]), sc3([0.22, 0.09, 0.12]), sc3([0, 0.015, 0.0]));
  place(head, HC, [HP, 0, 0]); finish(head); head.sk = B.head; head.tex = [320, 224]; head.paint = facePaint; add(head);
  { const sn = ball('snout', 28, 18, sc3([0.125, 0.09, 0.12]), { e: 0.92 }); place(sn, hdr(0, -0.075, 0.17), [HP, 0, 0]); sn.sk = B.head; sn.tex = [160, 112]; sn.blend = [head, 0.1]; sn.paint = facePaint; add(sn); }
  { const jw = ball('jaw', 24, 14, sc3([0.13, 0.065, 0.11]), { e: 0.92 }); place(jw, hdr(0, -0.15, 0.1), [HP, 0, 0]); jw.sk = B.head; jw.tex = [128, 80]; jw.blend = [head, 0.1]; jw.paint = facePaint; add(jw); }
  /* 耳朵：圓的熊耳，朝前、外緣厚而淺、內側凹而深 */
  { const ear = ball('earL', 20, 12, sc3([0.075, 0.075, 0.032]), { e: 0.85 }); push(ear, sc3([0, 0, 0.05]), sc3([0.055, 0.055, 0.07]), sc3([0, 0, -0.03]), false); place(ear, hd(0.215, 0.165, -0.03), [0.0, 0.45, -0.25]); ear.sk = B.earL; ear.tex = [96, 96]; add(ear);
    ear.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v), r = h2(d[0], d[1]); put(c, K.face); ink(c, 0.7 * smooth(0.6, 0.15, r) * smooth(0.1, 0.6, d[2]), K.earIn); ink(c, 0.4 * smooth(0.6, 0.95, r) * smooth(-0.2, 0.4, d[2]), K.earRim); ink(c, 0.3 * smooth(0.0, -0.6, d[2]), K.faceD); }; add(mirrorX(ear, 'earR')).sk = B.earR; }
  const E8 = eyeSet(add, sk, head, HC, [0.15, 0.02, 0.4], { r: [0.05, 0.05, 0.018], pr: [0.03, 0.034, 0.007], po: [0, 0, 0.011], tilt: 0.1, iris: K.iris, irisD: K.irisD, hl: K.hl, lid: K.faceD, brow: K.faceD, bs: 0.4, bo: [0.0, 0.05, 0.01], brk: [0.03, 0.05, 0.04], noLid: true, lidTop: 0.5, seg: 14, segv: 6 }); Object.assign(X, E8.X);

  /* ----- 身體：低矮渾圓（肚子離地一個腳掌高），前接頭、後面圓屁股；整個背被刺蓋住，只有腿根、胸、肚子露出毛 ----- */
  const BK = [[0.3, 0.33, 0.19, 0.23, 0.16], [0.16, 0.35, 0.28, 0.33, 0.23], [-0.06, 0.37, 0.31, 0.32, 0.26], [-0.26, 0.35, 0.29, 0.28, 0.24], [-0.4, 0.32, 0.19, 0.19, 0.18]];
  const body = tubeP('body', 32, BK.map(k => ({ p: [0, k[1], k[0]], rx: k[2], ry: k[3], rd: k[4], wt: 0.95 })), { nv: 20, capA: 0.13, capB: 0.11 });
  finish(body); body.tex = [384, 256]; add(body); body.sk = bodySk(-0.28, 0.1, 0.2, 0.34);
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU; furPaint(c, p, al, K.fur, K.furD, K.furL); ink(c, 0.25 * smooth(2.2, 3.0, al), K.furD); };
  /* ----- 腿：短粗的熊腿；腳掌寬平貼地，前緣五個圓趾，每趾一根黑色粗彎爪（往前、往下扣，爪尖碰地，不翹） ----- */
  const limbPaint = (c, p) => { const k = furN(p, 1.4); put(c, K.fur); ink(c, 0.35 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.25 * smooth(0.2, 0.9, -k), K.furL); ink(c, 0.25 * smooth(0.3, 0.12, p[1]), K.faceL); };
  const pawPaint = (c, p) => { const k = furN(p, 1.6); put(c, K.fur); ink(c, 0.45, K.faceL); ink(c, 0.3 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.3 * smooth(0.2, 0.9, -k), K.faceL); ink(c, 0.7 * smooth(0.012, 0.0, p[1]), K.sole); };
  const mkPaw = (name, li, hc, r, fz) => {
    const h = ball(name, 20, 12, r, { e: 0.9 }); h.map(q => { if (q[1] < -r[1] * 0.82) q[1] = -r[1] * 0.82; }); place(h, hc); h.tex = [64, 48]; h.paint = pawPaint; h.sk = Lg(li) + 2; add(h); add(mirrorX(h, name + 'R')).sk = Lg(li + 1) + 2;
    for (const k of [-2, -1, 0, 1, 2]) {
      const dx = k * 0.038 * r[0] / 0.1, tz = hc[2] + fz + 0.012 - 0.013 * k * k, tc = [hc[0] + dx, 0.031, tz];
      const toe = ball(name + 't' + k, 12, 8, [0.035, 0.032, 0.036], { e: 0.9 }); toe.map(q => { if (q[1] < -0.029) q[1] = -0.029; }); place(toe, tc, [0, k * 0.12, 0]); toe.tex = [24, 16]; toe.paint = pawPaint; toe.sk = Lg(li) + 2; toe.blend = [h, 0.03]; add(toe); add(mirrorX(toe, name + 't' + k + 'R')).sk = Lg(li + 1) + 2;
      const b0 = [tc[0] + k * 0.005, 0.03, tz + 0.022], f = [k * 0.08, 0, 1], cl = horn(name + 'c' + k, 10, [b0, add3(b0, [f[0] * 0.015, 0.003, 0.016]), add3(b0, [f[0] * 0.03, -0.008, 0.032]), add3(b0, [f[0] * 0.04, -0.025, 0.042])], 0.02, { tip: 0.12, pw: 0.9, nv: 7, capA: 0.007 });
      cl.sk = Lg(li) + 2; cl.tex = [16, 24]; cl.paint = (c, p, n, u, v) => { put(c, K.claw); ink(c, 0.45 * smooth(0.4, 0.95, n[1]) * smooth(0.1, 0.6, v), K.clawL); }; add(cl); add(mirrorX(cl, name + 'c' + k + 'R')).sk = Lg(li + 1) + 2;
    }
  };
  legParts(add, body, 'fl', [{ p: [0.22, 0.35, 0.19], rx: 0.13, ry: 0.13 }, { p: [0.26, 0.25, 0.23], rx: 0.115, ry: 0.112 }, { p: [0.282, 0.16, 0.26], rx: 0.1, ry: 0.098 }, { p: [0.298, 0.095, 0.29], rx: 0.094, ry: 0.094 }, { p: [0.302, 0.055, 0.31], rx: 0.092, ry: 0.086 }], FJ, 0, { nu: 18, nv: 9, paint: limbPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.04), blend: 0.12, tex: [80, 80] });
  mkPaw('paw', 0, [0.305, 0.042, 0.35], [0.11, 0.054, 0.105], 0.082);
  legParts(add, body, 'rl', [{ p: [0.21, 0.37, -0.28], rx: 0.16, ry: 0.17, rd: 0.16 }, { p: [0.255, 0.26, -0.245], rx: 0.14, ry: 0.13 }, { p: [0.272, 0.165, -0.225], rx: 0.108, ry: 0.106 }, { p: [0.275, 0.095, -0.235], rx: 0.098, ry: 0.096 }, { p: [0.275, 0.055, -0.245], rx: 0.096, ry: 0.088 }], RJ, 2, { nu: 18, nv: 9, paint: limbPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.04), blend: 0.12, tex: [80, 80] });
  mkPaw('foot', 2, [0.28, 0.042, -0.215], [0.112, 0.054, 0.135], 0.11);
  /* 尾巴：參考圖看不到（被屁股的刺蓋住），只留一小截短尾給骨頭用 */
  { const tail = tubeP('tail', 10, TK.map(k => ({ p: [k[0], k[1], k[2]], rx: k[3], ry: k[3] })), { capB: 0.02, capN: 2, seam: PI / 2, nv: 6 }); tail.tex = [24, 32]; tail.sk = tailSk(TN); tail.paint = (c, p) => { put(c, K.fur); ink(c, 0.4 * smooth(0.1, 0.8, furN(p)), K.furD); }; add(tail); }
  const AO = [{ id: 'head', c: HC, r: 0.22 }, { id: 'body', c: [0, 0.37, 0.05], r: 0.3 }, { id: 'body', c: [0, 0.36, -0.25], r: 0.3 }];
  withAO(parts, AO, 0.3);

  /* ----- 背刺：圓潤的粗長錐（截面 10 邊、沿長度 10 段、平滑法線），刺根深咖啡、前段米白（鋸齒交界）、刺尖白。
     刺根：從身體裡的中心往外打一圈均勻分布的方向（費氏球），打在頭殼或身體表面上；只留額頭（眉上）、頭頂、耳後、背、兩側到腿根、屁股。
     平貼方向＝往外放射＋往後倒（越靠上越往後倒），所以正面看是一圈放射狀、側面看是往後梳的一大片（參考圖 A 正面與側面）。 ----- */
  const qs = [], QV = [], C0 = [0, 0.3, -0.06], CR = [0, 0.36, 0.36], back = [0, 0, -1];
  const qPaint = b0 => (c, p, n, u, v) => { const s = qLen(v), tooth = x => { const f = x - Math.floor(x); return Math.pow(1 - abs(2 * f - 1), 1.7); }, bd = b0 + 0.1 * tooth(u * 3 + 0.2) + 0.04 * tooth(u * 7 + 0.55) - 0.03;
    put(c, K.qDark); ink(c, 0.35 * smooth(0.2, 0.9, abs(sin(u * TAU * 4 + 0.7))), K.qDarkL); ink(c, 0.4 * smooth(0.12, -0.1, s), K.qDarkD);
    const cr = smooth(bd - 0.008, bd + 0.012, s); ink(c, cr, K.qCream); ink(c, cr * 0.4 * smooth(bd + 0.16, bd, s), K.qCreamD); ink(c, cr * 0.15 * smooth(0.3, 0.9, abs(sin(u * TAU * 3))), K.qCreamD); ink(c, smooth(0.9, 0.97, s), K.qTip); };
  const QPAINT = [qPaint(0.55), qPaint(0.61), qPaint(0.67)], qOwn = [];
  /* 一圈一圈排（像屋瓦，前後排錯開半格）：z＝這一圈的前後位置、fm＝從背中線往兩側最多幾度、yc＝打光線的中心高度；每圈的刺根從外面往中心打，取最外層（頭殼或身體）的表面 */
  const RW = [[0.46, 46, 0.28], [0.38, 75, 0.28], [0.3, 100, 0.3], [0.21, 112, 0.32], [0.12, 122, 0.33], [0.03, 124, 0.34], [-0.06, 124, 0.35], [-0.15, 124, 0.35], [-0.24, 124, 0.35], [-0.33, 120, 0.34], [-0.41, 112, 0.33], [-0.48, 92, 0.32]];
  let qi = 0, ri = 0;
  for (const [z, fm, yc] of RW) { const A = [0, yc, z], rr0 = 0.33, st0 = 0.1 / rr0, n = Math.max(1, Math.round(fm * PI / 180 / st0)), sh = ri++ % 2 ? 0.5 : 0;
   for (let k = -n - 1; k <= n + 1; k++) { const ph = (k + sh) * st0 + (hashf(qi * 7.7 + ri) - 0.5) * st0 * 0.3; if (abs(ph) > fm * PI / 180 + 1e-6) continue; const i = qi * 3 + ri * 101, dd = [sin(ph), cos(ph), 0];
    let hit = null, onHead = false; for (const pt of [body, head]) { const h = surf(pt, add3(A, dd, 3), [-dd[0], -dd[1], -dd[2]]); if (h) { const dist = hyp(h.p[0] - A[0], h.p[1] - A[1]); if (!hit || dist > hit.dist) { hit = Object.assign(h, { dist }); onHead = pt === head; } } }
    if (!hit) continue; const P = hit.p, ax = abs(P[0]);
    if (P[1] < 0.15 || (onHead && P[2] > 0.3 && (P[1] < 0.39 || ax > 0.19))) continue;
    const rad = norm3(sub3(P, CR)), kb = P[2] > 0.12 ? 0.45 : 0.3, d = norm3(add3(add3(add3(rad, back, kb), hit.n, 0.1 + 0.3 * smooth(0.4, 0.24, P[1])), [0, 1, 0], (0.55 + 0.25 * smooth(0.1, 0.22, P[2]) * smooth(0.36, 0.25, P[2])) * smooth(0.42, 0.68, P[1]) * smooth(-0.42, -0.2, P[2]) - 0.35 * smooth(-0.3, -0.48, P[2])));
    { const w = smooth(-0.12, -0.4, P[2]) * (onHead ? 0 : 1); if (w > 0) { const g = [0, -1, -0.45], gn = dot3(g, hit.n), tg = norm3(add3(sub3(g, [hit.n[0] * gn, hit.n[1] * gn, hit.n[2] * gn]), hit.n, 0.28)); for (let c = 0; c < 3; c++) d[c] = lerp(d[c], tg[c], w); const dn = norm3(d); d[0] = dn[0]; d[1] = dn[1]; d[2] = dn[2]; } }      /* 屁股的刺順著表面往下垂（參考圖 A 背面像一片往下的簾子） */
    const up = norm3(sub3(hit.n, [d[0] * dot3(hit.n, d), d[1] * dot3(hit.n, d), d[2] * dot3(hit.n, d)])), jr = hashf(i * 1.37), jl = hashf(i * 2.91);
    const L = (P[2] > 0.3 ? lerp(0.42, 0.52, smooth(0.46, 0.32, P[2])) : P[2] > 0.12 ? lerp(0.44, 0.64, smooth(0.25, 0.6, P[1])) : lerp(0.38, 0.62, smooth(0.2, 0.7, P[1])) * lerp(1, 0.62, smooth(-0.2, -0.45, P[2])) * lerp(0.85, 1, smooth(0.3, 0.12, P[2]))) * (0.9 + 0.2 * jl), R = (P[2] > 0.3 ? 0.048 : 0.058) * (0.9 + 0.2 * jr);
    const base = add3(P, d, -0.02), at = (s, bow) => add3(add3(base, d, s * L), up, bow * L);
    const keys = [{ p: add3(base, d, -0.1 * L), r: 0.85 }, { p: at(0.12, 0.012), r: 1 }, { p: at(0.4, 0.035), r: 0.94 }, { p: at(0.68, 0.03), r: 0.68 }, { p: at(0.88, 0.012), r: 0.32 }, { p: at(1.0, -0.005), r: 0.03 }].map(k => ({ p: k.p, rx: R * k.r, ry: R * k.r }));
    const q = tubeP('q' + qi, 9, keys, { nv: 10, capB: R * 0.05, capN: 1, ref: up, seam: hashf(i * 5.3) * TAU }); finish(q);
    const v3 = qi % 3; if (!qOwn[v3]) { q.tex = [40, 128]; q.paint = QPAINT[v3]; qOwn[v3] = q; } else { q.share = qOwn[v3]; q.tex = qOwn[v3].tex; }
    const gb = P[2] > 0.15 ? bq0 : P[2] > -0.2 ? bq1 : bq2, bs = onHead || P[2] > 0.3 ? B.head : body.sk(P);
    q.sk = onHead ? B.head : (pp, ii, j, pt) => skMix(bs, gb, 0.6 * clamp(j / pt.nv, 0, 1)); q.glow = 0.5; qs.push(q); add(q);
    /* 豎起來的方向：從身體中心往外放射（額頭的刺朝上，不朝臉前倒），只帶一點點往後 */
    const de = norm3([rad[0], rad[1] + 0.25, Math.min(rad[2], 0.1) - 0.3]), cs = clamp(dot3(d, de), -1, 1), axv = cross3(d, de), al = hyp(axv[0], axv[1], axv[2]);
    QV.push({ q, b: base, a: al > 1e-5 ? [axv[0] / al, axv[1] / al, axv[2] / al, Math.acos(cs)] : [0, 0, 0, 0] }); qi++;
  } }

  const FACE = apeFaceGrid(parts, HC, HS, FACE_PORC); for (let i = parts.length - 1; i >= 0; i--) if (/^(eye|pup|brow)/.test(parts[i].name)) parts.splice(i, 1);
  /* 每個頂點的刺根（aQb）與轉軸＋角度（aQa）：頂點順序和 buildSoft 一樣（部位依序、每個部位 (nu+1)(nv+1) 個） */
  let nvx = 0; for (const pt of parts) nvx += (pt.nu + 1) * (pt.nv + 1);
  const qb = new Float32Array(nvx * 3), qa = new Float32Array(nvx * 4), qm = new Map(QV.map(o => [o.q, o])); let o = 0;
  for (const pt of parts) { const n = (pt.nu + 1) * (pt.nv + 1), e = qm.get(pt); if (e) for (let k = 0; k < n; k++) { qb.set(e.b, (o + k) * 3); qa.set(e.a, (o + k) * 4); } o += n; }
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.fur, eyeCol: [1.0, 0.7, 0.3], key: K, quill: { bones: [bq0, bq1, bq2] }, face: FACE, qb, qa, texW: 1024,
    S: { k: 1.3, run: 4.8, stride: 0.3, lift: 0.07, bob: 0.03, cad: 1.4, graze: 0, grazeN: 0, grazeH: 0, earBack: 0.5, jawMax: 0.45, maneUp: 0, wag: 1.5, wagAmp: 0.15, halfW: 0.4, tailRun: 0.4, low: 0.15, u: 0.5, jump: 0.5, jaw0: 0, reach: 0.2, elastic: 1, maneK: 0, pose: posePorc } };
};

/* 豎刺的頂點變形（主材質與影子共用）：rotate(頂點−刺根) 繞 aQa.xyz 轉 aQa.w×uQ；uQ 超過 1（噴刺環出手）時刺再伸長一點 */
const QV_HEAD = 'attribute vec3 aQb;\nattribute vec4 aQa;\nuniform float uQ;\nvec3 qRot(vec3 v, float an) { vec3 k = aQa.xyz; float c = cos(an), s = sin(an); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }\nfloat qAn() { return aQa.w * uQ * step(0.001, dot(aQa.xyz, aQa.xyz)); }\n';
const QV_POS = '\n  { float an = qAn(); if (an != 0.0) transformed = aQb + qRot(transformed - aQb, an) * (1.0 + 0.4 * max(uQ - 1.0, 0.0)); }';
const QV_NRM = '\n  { float an = qAn(); if (an != 0.0) objectNormal = qRot(objectNormal, an); }';
/* 第一次擺姿勢時：把刺根／轉軸掛到共用幾何上、換上會跟著豎刺的影子材質 */
function porcGeo(m) {
  if (m.qOK) return; m.qOK = 1; const g = m.mesh.geometry, D = m.sp.D;
  if (D.qb && !g.attributes.aQb) { g.setAttribute('aQb', new THREE.BufferAttribute(D.qb, 3)); g.setAttribute('aQa', new THREE.BufferAttribute(D.qa, 4)); }
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); dm.userData.q = m.mats[0].userData.q;
  dm.onBeforeCompile = function (sh) { sh.uniforms.uQ = this.userData.q; sh.vertexShader = QV_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + QV_POS); }; dm.customProgramCacheKey = () => 'porcdepth';
  m.mesh.customDepthMaterial = dm;
}

/* 箭豬姿勢：背刺豎起量 qU（0 平貼～1 全豎）：v.pose='up'、招式 quill／burst／back 的預備與出手；豎起時每根刺繞刺根往外放射（頂點著色器）、三組刺骨頭發抖、材質變亮一點（userData.q）。
   burst＝縮成一團（身體壓低、頭縮進去、全身發抖）再炸出去（出手瞬間豎起量到 1.25：刺轉過頭再伸長一點）；back＝倒衝：屁股抬高、刺全豎、後腿蹬。 */
function posePorc(T, q) {
  const { st, p, t, an, m, v } = q, pose = v.pose, act = q.act, inMove = (an === 'quill' || an === 'burst' || an === 'back') && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER);
  porcGeo(m);
  let tgt = pose === 'up' ? 1 : st === ST.WARN ? 0.35 : 0;
  if (inMove) tgt = st === ST.WIND ? 0.3 + 0.7 * eased(0, 1, wind(q)) : st === ST.STRIKE ? 1 : 1 - 0.7 * tri(0, (act.recover || 0.8), p);
  if (v.enr) tgt = Math.max(tgt, 0.6);
  const now = t, dt = clamp(now - (m.qt ?? now), 0, 0.1); m.qt = now; m.qU = (m.qU ?? 0) + (tgt - (m.qU ?? 0)) * (1 - Math.exp(-dt * (tgt > (m.qU ?? 0) ? 16 : 3.5)));
  const U = m.qU, shake = (st === ST.WIND && inMove ? 1 : 0) * (0.4 + 0.6 * wind(q)), brst = an === 'burst' && inMove ? (st === ST.STRIKE ? 1.25 : 1 + 0.12 * wind(q)) : 1;
  const bq = m.sp.D.quill ? m.sp.D.quill.bones : []; for (let i = 0; i < bq.length; i++) { const b = m.bones[bq[i]]; const ph = t * 55 + i * 2; b.rotation.set(0.04 * U + 0.05 * shake * sin(ph), 0, 0.05 * shake * sin(ph * 0.9 + 1) + 0.015 * U * sin(t * 3 + i)); b.scale.set(1, 1, 1); }
  m.mats[0].userData.q.value = U * brst;
  if (an === 'burst' && inMove) { const e = st === ST.WIND ? eased(0, 1, wind(q)) : st === ST.STRIKE ? 1 - 0.8 * eased(0, 1, strikeK(q)) : 0.2; T.by -= 0.1 * e; T.bz -= 0.04 * e; T.np += 0.5 * e; T.hp += 0.35 * e; T.sq += 3 * e; T.bx += 0.012 * sin(t * 60) * e * (st === ST.WIND ? 1 : 0); T.tp -= 0.6 * e; footAt(T, m, 0, -0.03 * e, 0, 0.03 * e); footAt(T, m, 1, -0.03 * e, 0, 0.03 * e); T.eye *= 1 - 0.5 * e; }
  else if (an === 'back' && inMove) { const e = st === ST.WIND ? eased(0, 1, wind(q)) : 1; T.bp -= 0.1 * e; T.pp += 0.12 * e; T.np += 0.3 * e; T.hp += 0.2 * e; T.by += 0.02 * e; T.tp += 0.5 * e; footAt(T, m, 2, 0, 0.01 * e, -0.1 * e, 0.2 * e); footAt(T, m, 3, 0, 0.01 * e, -0.1 * e, 0.2 * e); T.bx += 0.01 * sin(t * 40) * e; }
  else if ((an === 'quill' && inMove) || pose === 'up') { const e = pose === 'up' ? 1 : st === ST.WIND ? eased(0, 1, wind(q)) : 1; T.by -= 0.02 * e; T.np += 0.12 * e; T.hp += 0.08 * e; T.jaw += 0.08 * e; T.eL = T.eR = 0.8 * e; T.bx += 0.006 * sin(t * 45) * e * (st === ST.WIND ? 1 : 0); T.tp += 0.3 * e; }
}



/* ============================== 岩羊 ============================== */
/* 北境山崖上的野羊（像喜馬拉雅的岩羊／阿爾卑斯野山羊）：粗壯的身子、短而有力的腿、分趾蹄；青灰色的毛，側腹與腿前緣一道黑線，肚子與屁股是白的；
   羊的長臉帶一點羅馬鼻、下巴一撮短鬍子；頭上一對大彎角——從頭頂往兩側、再往後彎成一道大弧，根部粗、尖端細、整根有橫向的年輪節。 */
SOFT.ibex = elite => {
  const E = !!elite;      /* X4：斷崖角 */
  const K = { fur: rgb(0x8a7a68), furD: rgb(0x5c4d40), furL: rgb(0xb09d86), dark: rgb(0x2a2724), chest: rgb(0x4a413a), white: rgb(0xe9e4d6), whiteD: rgb(0xbdb6a2), face: rgb(0x8e8070), faceD: rgb(0x4e4238), nose: rgb(0x231d1b), mouth: rgb(0x4a1c1e), tongue: rgb(0xb4505a), iris: rgb(0xd8a22c), irisD: rgb(0x7a4a0a), pupil: rgb(0x120a06), lid: rgb(0x4c4944), hornC: rgb(0xb8a36e), hornL: rgb(0xd8c690), hornD: rgb(0x5c4a2a), tip: rgb(0x3a2e1a), hoof: rgb(0x28211c), hoofL: rgb(0x544840), beard: rgb(0x2e2a26), earIn: rgb(0xa88a80) };
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 1.04, 0.56], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.21, 0.66, 0.27], j1: [0.225, 0.42, 0.21], j2: [0.225, 0.19, 0.27], pad: [0.225, 0, 0.295] }, RJ = { j0: [0.21, 0.69, -0.36], j1: [0.235, 0.43, -0.28], j2: [0.235, 0.2, -0.4], pad: [0.235, 0, -0.36] };
  const TK = [[0, 0.85, -0.56, 0.04], [0, 0.83, -0.64, 0.033], [0, 0.77, -0.7, 0.024]], TN = 2;
  const sk = softSkel({ body: [0, 0.79, -0.04], pelvis: [0, 0.79, -0.34], chest: [0, 0.81, 0.18], neck: [0, 0.91, 0.34], head: [0, 1.03, 0.46], jaw: hd(0, -0.17, 0.1), ear: hd(0.2, 0.12, -0.08), mane: [0, 1.03, 0.14], fl: FJ, rl: RJ, tail: TK.slice(0, TN).map(k => [k[0], k[1], k[2]]), mane2: [0, 1.03, 0.3] });
  const BN = sk.BN, X = {};

  /* ----- 頭：長臉、前額到鼻樑微微隆起（羅馬鼻）、小下巴 ----- */
  const head = ball('head', 26, 15, [0.17, 0.225, 0.3], { vmap: t => Math.pow(t, 1.15) });
  push(head, [0.1, -0.08, 0.04], 0.15, [0.02, -0.02, 0]); push(head, [0, 0.0, 0.26], [0.11, 0.17, 0.2], [0, 0.0, 0.05]); push(head, [0, 0.2, 0.0], [0.17, 0.1, 0.2], [0, 0.03, 0]);
  place(head, HC); finish(head); head.sk = B.head; head.tex = [384, 256]; add(head);
  const faceP = (c, p, x, y, z, ax) => { const k = furN(p, 1.5); put(c, K.face); ink(c, 0.35 * smooth(0.1, 0.8, k), K.faceD); ink(c, 0.3 * smooth(0.2, 0.9, -k), K.furL); ink(c, 0.55 * smooth(0.05, -0.2, y) * smooth(0.0, 0.2, z), K.white); ink(c, 0.7 * smooth(0.03, 0.12, ax) * smooth(0.12, 0.0, ax - 0.12) * 0, K.faceD); ink(c, 0.6 * cov(h2(x / 0.045, (z - 0.12) / 0.34) - 1, 0.3) * smooth(-0.1, 0.1, y), K.dark); };
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2]; faceP(c, p, x, y, z, abs(x)); };
  { const sn = tubeP('snout', 14, [{ p: hd(0, -0.03, 0.2), rx: 0.115, ry: 0.13, rd: 0.11 }, { p: hd(0, -0.065, 0.34), rx: 0.1, ry: 0.112, rd: 0.098 }, { p: hd(0, -0.1, 0.47), rx: 0.085, ry: 0.092, rd: 0.082 }], { nv: 6, capB: 0.06, capN: 2 }); sn.sk = B.head; sn.tex = [160, 96]; sn.blend = [head, 0.1]; add(sn);
    sn.paint = (c, p, n) => { const x = p[0], y = p[1] - HC[1], z = p[2] - HC[2], ax = abs(x); faceP(c, p, x, y, z, ax); ink(c, 0.9 * smooth(0.43, 0.5, z), K.nose); if (z > 0.4) ink(c, cov(h2((ax - 0.04) / 0.022, (y + 0.07) / 0.03) - 1, 0.3), K.mouth); if (n[1] < -0.5 && z > 0.18) ink(c, 0.7 * cov(abs(x) - 0.002, 0.01) * 0, K.mouth); }; }
  { const JC = hd(0, -0.158, 0.31), jaw = ball('jaw', 12, 7, [0.058, 0.04, 0.14]); push(jaw, [0, 0.04, 0], [0.07, 0.04, 0.14], [0, -0.012, 0]); place(jaw, JC); jaw.sk = B.jaw; jaw.tex = [64, 64]; add(jaw);
    jaw.paint = (c, p) => { const x = p[0] - JC[0], y = p[1] - JC[1], z = p[2] - JC[2]; put(c, K.face); ink(c, 0.6 * smooth(0.1, 0.0, z), K.white); if (y > 0.01) { put(c, K.mouth); ink(c, cov((h2(x / 0.05, (z - 0.02) / 0.1) - 1) * 0.06), K.tongue); } }; }
  { const ear = tubeP('earL', 8, [{ p: hd(0.16, 0.12, -0.08), rx: 0.05, ry: 0.025 }, { p: hd(0.23, 0.12, -0.1), rx: 0.085, ry: 0.025 }, { p: hd(0.3, 0.09, -0.13), rx: 0.05, ry: 0.015 }, { p: hd(0.34, 0.07, -0.15), rx: 0.004, ry: 0.004 }], { nv: 9, ref: [0, 0, 1], capB: 0.004, capN: 1 }); ear.sk = B.earL; ear.tex = [32, 48]; ear.paint = (c, p, n) => { put(c, K.face); ink(c, 0.6 * smooth(0.0, 0.5, n[2]), K.earIn); }; add(ear); add(mirrorX(ear, 'earR')).sk = B.earR; }
  // 角：從頭頂往兩側、再往後彎成大弧。根部粗、尖端細，橫向的年輪節
  const HPt = [hd(0.11, 0.2, 0.0), hd(0.17, 0.33, -0.03), hd(0.23, 0.43, -0.12), hd(0.26, 0.47, -0.26), hd(0.25, 0.44, -0.4), hd(0.21, 0.36, -0.52), hd(0.16, 0.26, -0.6)];
  const hornPaint = (c, p, n, u, v) => { put(c, K.hornC); const ring = abs(((v * 15) % 1 + 1) % 1 - 0.5); ink(c, 0.55 * smooth(0.18, 0.5, ring) * smooth(0.95, 0.3, v), K.hornD); ink(c, 0.55 * smooth(0.5, 0.0, ring) * smooth(0.0, 0.6, n[1]), K.hornL); ink(c, 0.8 * smooth(0.84, 0.97, v), K.tip); ink(c, 0.5 * smooth(0.08, 0.0, v), K.hornD); };
  if (E) {      /* X4 斷崖角：左角（+x）斷在半截、斷口粗糙淺色；右角（−x）更粗更長 */
    const st = horn('hornL', 6, HPt.slice(0, 4), 0.084, { tip: 0.82, pw: 0.8, capA: 0.03, nv: 12, flat: 1.0 }); st.sk = B.head; st.tex = [24, 96];
    st.paint = (c, p, n, u, v) => { put(c, K.hornC); const ring = abs(((v * 8) % 1 + 1) % 1 - 0.5); ink(c, 0.55 * smooth(0.18, 0.5, ring) * smooth(0.95, 0.3, v), K.hornD); ink(c, 0.5 * smooth(0.0, 0.6, n[1]), K.hornL); ink(c, 0.9 * smooth(0.86, 0.99, v), K.hornL); ink(c, 0.35 * smooth(0.9, 1.0, v) * smooth(0.3, 0.9, Math.sin(u * 47) * Math.sin(u * 23 + 1)), K.hornD); }; add(st);
    const big = horn('hornR', 10, HPt.map(q => [HC[0] - (q[0] - HC[0]) * 1.14, HC[1] + (q[1] - HC[1]) * 1.12, HC[2] + (q[2] - HC[2]) * 1.16]), 0.097, { tip: 0.12, pw: 0.85, capA: 0.03, nv: 22, flat: 1.0 }); big.sk = B.head; big.tex = [28, 176]; big.paint = hornPaint; add(big);
  } else { const hn = horn('hornL', 10, HPt, 0.075, { tip: 0.1, pw: 0.85, capA: 0.03, nv: 22, flat: 1.0 }); hn.sk = B.head; hn.tex = [24, 160];
    hn.paint = (c, p, n, u, v) => { put(c, K.hornC); const ring = abs(((v * 15) % 1 + 1) % 1 - 0.5); ink(c, 0.55 * smooth(0.18, 0.5, ring) * smooth(0.95, 0.3, v), K.hornD); ink(c, 0.55 * smooth(0.5, 0.0, ring) * smooth(0.0, 0.6, n[1]), K.hornL); ink(c, 0.8 * smooth(0.84, 0.97, v), K.tip); ink(c, 0.5 * smooth(0.08, 0.0, v), K.hornD); }; add(hn); add(mirrorX(hn, 'hornR')).sk = B.head; }
  { const b0 = hd(0, -0.17, 0.36), s2 = tuftK('beard', b0, add3(b0, E ? [0, -0.17, -0.06] : [0, -0.075, -0.035]), [1, 0, 0], E ? 0.065 : 0.045, E ? 0.06 : 0.045, { nu: 6, bow: 0.1, up: [0, -0.3, 0] }); s2.sk = B.head; s2.col = E ? rgb(0xd8d3c7) : K.faceD;      /* X4 斷崖角：灰白長鬍 */ s2.tex = [8, 8]; add(s2); }
  const E8 = eyeSet(add, sk, head, HC, [0.15, 0.07, 0.3], { r: [0.052, 0.046, 0.02], pr: [0.034, 0.013, 0.008], po: [0, 0, 0.012], tilt: 0.15, iris: K.iris, irisD: K.irisD, lid: K.lid, brow: K.dark, bs: 0.7, bo: [0.0, 0.035, 0.012], brk: [0.01, 0.05, 0.07], lidTop: 0.45, seg: 14, segv: 6, pupil: K.pupil }); Object.assign(X, E8.X);

  /* ----- 身體：粗壯、胸厚、肩略高；青灰色，側腹一道黑線、肚子白、屁股白斑 ----- */
  const body = tubeP('body', 24, [{ p: [0, 0.81, -0.56], rx: 0.208, ry: 0.208, rd: 0.192, wt: 0.9 }, { p: [0, 0.81, -0.4], rx: 0.248, ry: 0.248, rd: 0.232, wt: 0.88 }, { p: [0, 0.81, -0.12], rx: 0.264, ry: 0.256, rd: 0.24, wt: 0.88 }, { p: [0, 0.84, 0.14], rx: 0.288, ry: 0.272, rd: 0.248, wt: 0.86 }, { p: [0, 0.85, 0.32], rx: 0.248, ry: 0.256, rd: 0.224, wt: 0.88 }, { p: [0, 0.87, 0.44], rx: 0.192, ry: 0.208, rd: 0.176 }], { nv: 14, capA: 0.13, capB: 0.14 });
  push(body, [0, 1.19, 0.2], [0.2, 0.1, 0.24], [0, 0.03, 0]); push(body, [0.24, 0.81, -0.4], [0.1, 0.17, 0.16], [0.03, 0.0, 0]);
  finish(body); body.tex = [384, 224]; add(body); body.sk = bodySk(-0.34, 0.08, 0.3, 0.5);
  body.paint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2], y = p[1], k = furN(p, 0.9); furPaint(c, p, al, K.fur, K.furD, K.furL); ink(c, 0.7 * smooth(0.45, 0.2, z) * smooth(0.1, 0.4, z) * 0, K.chest);
    ink(c, 0.85 * smooth(0.18, 0.4, z) * smooth(0.0, 0.4, 0.3), K.chest); ink(c, 0.9 * smooth(2.0, 2.7, al), K.white);
    const band = abs(y - (0.78 - 0.05 * (z + 0.1))) - 0.035 - 0.012 * sin(z * 24); ink(c, 0.8 * cov(band, 0.03) * smooth(0.28, 0.44, abs(p[0])) * smooth(0.44, 0.3, z) * smooth(-0.52, -0.38, z), K.dark);
    ink(c, 0.95 * cov(h2((p[0]) / 0.17, (z + 0.55) / 0.16) - 1, 0.3) * smooth(1.2, 0.0, al) * 0 + 0.95 * smooth(-0.46, -0.58, z) * smooth(1.0, 2.2, al), K.white); ink(c, 0.7 * smooth(-0.42, -0.58, z) * smooth(0.0, 1.0, al), K.white);
    if (E) { ink(c, 0.85 * smooth(0.24, 0.08, al) * smooth(-0.6, -0.46, z) * smooth(0.52, 0.38, z), K.dark);      /* X4 斷崖角：背脊線、左肩三道舊疤 */
      if (p[0] > 0.1) for (const kk of [-0.045, 0, 0.045]) { const a = (z - 0.24) * 0.6 + (y - 0.96 - kk) * 0.8, b = (z - 0.24) * 0.8 - (y - 0.96 - kk) * 0.6; if (abs(a) < 0.1) { ink(c, 0.9 * cov(abs(b) - 0.017, 0.006), rgb(0x6e4234)); ink(c, cov(abs(b) - 0.009, 0.005), rgb(0xd9ab9b)); } } } };
  /* ----- 腿：粗而短、前緣一道黑線、蹄是分趾的 ----- */
  const legPaint = (c, p, n) => { const k = furN(p, 1.2); put(c, K.fur); ink(c, 0.35 * smooth(0.1, 0.8, k), K.furD); ink(c, 0.6 * smooth(0.0, 0.8, n[2]) * smooth(0.5, 0.12, p[1]) * 0.0 + 0.85 * smooth(0.05, 0.5, n[2]) * smooth(0.55, 0.3, p[1]), K.dark); ink(c, 0.7 * smooth(0.22, 0.08, p[1]), K.dark); ink(c, 0.7 * smooth(0.0, -0.6, n[0]) * smooth(0.3, 0.1, p[1]), K.white); };
  const mkHoof = (name, li, hc) => { const hf = ball(name, 12, 7, [0.058, 0.05, 0.075]); hf.map(p => { if (p[1] < -0.045) p[1] = -0.045; p[2] -= 0.015 * smooth(0.0, 0.07, p[2]) * fall(h2(p[0] / 0.03, 0)); }); place(hf, hc); hf.tex = [32, 24]; hf.paint = (c, p, n) => { put(c, K.hoof); ink(c, 0.4 * smooth(0.0, 0.08, p[1] - hc[1]) * Math.max(0, n[1]), K.hoofL); ink(c, 0.9 * cov(abs(p[0]) - 0.004, 0.006) * smooth(0.0, 0.05, p[2] - hc[2]), K.nose); }; hf.sk = Lg(li) + 2; add(hf); add(mirrorX(hf, name + 'R')).sk = Lg(li + 1) + 2; };
  legParts(add, body, 'fl', [{ p: [0.215, 0.71, 0.27], rx: 0.123, ry: 0.135 }, { p: [0.22, 0.54, 0.24], rx: 0.107, ry: 0.111 }, { p: [0.225, 0.42, 0.21], rx: 0.082, ry: 0.084 }, { p: [0.225, 0.28, 0.24], rx: 0.067, ry: 0.07 }, { p: [0.225, 0.07, 0.285], rx: 0.059, ry: 0.061 }], FJ, 0, { paint: legPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.05), blend: 0.13, tex: [64, 96] });
  mkHoof('hoof', 0, [0.225, 0.055, 0.29]);
  legParts(add, body, 'rl', [{ p: [0.21, 0.73, -0.36], rx: 0.139, ry: 0.156, rd: 0.148 }, { p: [0.23, 0.56, -0.31], rx: 0.119, ry: 0.127 }, { p: [0.235, 0.43, -0.28], rx: 0.082, ry: 0.086 }, { p: [0.235, 0.28, -0.35], rx: 0.064, ry: 0.067 }, { p: [0.235, 0.075, -0.385], rx: 0.057, ry: 0.06 }], RJ, 2, { paint: legPaint, sk: (b, J) => legSk(b, J.j1[1], J.j2[1], 0.05), blend: 0.13, tex: [64, 96] });
  mkHoof('hoofB', 2, [0.235, 0.055, -0.36]);
  { const tail = tubeP('tail', 6, TK.map(k => ({ p: [k[0], k[1], k[2]], rx: k[3], ry: k[3] })), { capB: 0.025, capN: 1, seam: PI / 2, nv: 6 }); tail.tex = [16, 32]; tail.sk = tailSk(TN); tail.paint = (c, p, n, u, v) => { put(c, K.dark); ink(c, 0.7 * smooth(0.0, 0.3, 0.3 - v) * 0, K.white); }; add(tail); }
  const AO = [{ id: 'head', c: HC, r: 0.26 }, { id: 'body', c: [0, 0.8, 0.14], r: 0.36 }, { id: 'body', c: [0, 0.76, -0.3], r: 0.34 }];
  withAO(parts, AO);
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.fur, eyeCol: [1.0, 0.75, 0.2], key: K,
    S: { k: 1.3, run: 7.0, stride: 0.55, lift: 0.14, bob: 0.05, cad: 1.05, graze: 0.5, grazeN: 0.6, grazeH: 0.2, earBack: 0.7, jawMax: 0.4, maneUp: 0, wag: 3, wagAmp: 0.25, halfW: 0.33, tailRun: 0.6, low: 0.1, u: 0.68, jump: 0.8, jaw0: 0, reach: 0.3, elastic: 1, maneK: 0, ram: 0.3, chew: 0.4, pose: poseIbex } };
};

/* 岩羊姿勢：v.pose='look'（抬頭警戒、耳朵朝前）｜'cliff'（站在高處：一隻前蹄抬起踏在岩上、頭高抬）；招式 act.anim＝'ram'（刨地→低頭衝，角朝前）、'butt'（人立起前半身→往下連頂）、'flee'（共用逃跑＋耳朵貼後；爬崖時 v.pose='cliff'） */
function poseIbex(T, q) {
  const { st, p, t, an, m, v } = q, pose = v.pose, sd = q.sd || 1;
  if (pose === 'look' && st === ST.IDLE) { T.np -= 0.28; T.hp -= 0.12; T.eL = T.eR = -0.4; T.hw += 0.5 * sin(t * 0.8 + m.seed); T.tp += 0.4; }
  if (pose === 'cliff') { T.np -= 0.3; T.hp -= 0.1; T.bp -= 0.05; footAt(T, m, 0, 0, 0.1, 0.05, -0.3); T.tp += 0.4; T.eL = T.eR = -0.3; }
  if (an === 'ram' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q);
    if (st === ST.WIND) { T.np += 0.62 * e; T.hp += 0.3 * e; T.bp += 0.06 * e; T.bz -= 0.06 * e; T.by -= 0.05 * e; T.tp += 0.6 * e; const sc = (q.p * 3.2) % 1; airT(T, sd > 0 ? 0 : 8, 1 - tri(0.7, 1, e), 0, 0, 0); legT(T, sd > 0 ? LEGO.FL : LEGO.FR, 0, Math.max(0, sin(TAU * sc)) * 0.12 * (1 - e * 0.5), (0.1 * cos(TAU * sc) - 0.02) * (1 - e * 0.5), 0.7 * Math.max(0, sin(TAU * sc))); T.eL = T.eR = 1; }
    else { T.np += 0.7; T.hp += 0.3; T.bp += 0.08; T.bz += 0.12 * (1 - s) + 0.05; T.tp += 0.8; T.by += 0.02 * sin(PI * s); } }
  else if (an === 'butt' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q);
    if (st === ST.WIND) { T.rear += 0.55 * e; T.np -= 0.1 * e; T.hp -= 0.1 * e; T.by -= 0.03 * e; airT(T, LEGO.FL, e, 0.1, 0.1, 0.1, -0.3); airT(T, LEGO.FR, e, 0.1, 0.1, 0.1, -0.3); T.tp += 0.5 * e; T.eL = T.eR = 1; }
    else { const k = eased(0, 0.6, s); T.rear += 0.55 * (1 - k); T.np += 0.75 * k; T.hp += 0.25 * k; T.bz += 0.1 * k; T.bp += 0.05 * k; const hit = eased(0.5, 0.65, s); T.ssy += 0.1 * hit * (1 - eased(0.7, 1, s)); legT(T, LEGO.FL, 0, 0, 0.05 * k); legT(T, LEGO.FR, 0, 0, 0.05 * k); } }
  if (st === ST.FLEE) { T.eL = T.eR = 1; }
}


/* ============================== 鱷魚 ============================== */
/* 湖邊的鱷魚（Q 版放大頭）：低矮的長身子，肚子幾乎貼地；腿短、往兩側撐開；背上兩排骨板，尾巴又長又粗、上緣一排尖脊；長吻、鼻孔在吻尖往上鼓、眼睛長在頭頂的兩個小丘上（可以只露眼睛與鼻孔浮在水面）；
   嘴裡上下交錯的牙。橄欖綠的背、淺黃的肚子。 */
SOFT.croc = (elite, young, elder) => {
  const EL = !!elder;
  const K = { skin: rgb(0x5c6a3a), skinD: rgb(0x2e3a22), skinL: rgb(0x8a9a54), belly: rgb(0xcdc58e), bellyD: rgb(0x9a9468), scute: rgb(0x3e4a2a), scuteL: rgb(0x78883f), nose: rgb(0x1c2216), mouth: rgb(0xb4585e), mouthD: rgb(0x6a2a30), tongue: rgb(0xd88a86), tooth: rgb(0xf2eccc), toothD: rgb(0xb8ae84), iris: rgb(0xe0c828), irisD: rgb(0x8a6a0a), pupil: rgb(0x0c0e06), lid: rgb(0x3e4a2a), claw: rgb(0x2a2a1e), spot: rgb(0x2a3220), moss: rgb(0x4a7a2e), mossL: rgb(0x8ab04a), ring: rgb(0xb8863a), ringL: rgb(0xf0c870), scar: rgb(0xd8c8a0) };
  if (EL) Object.assign(K, { skin: rgb(0x4e5a34), skinD: rgb(0x2a321c), skinL: rgb(0x7a8a4a), belly: rgb(0xb4aa78) });
  const parts = [], add = pt => (parts.push(pt), pt), HC = [0, 0.34, 0.9], hd = (x, y, z) => [HC[0] + x, HC[1] + y, HC[2] + z];
  const FJ = { j0: [0.3, 0.3, 0.42], j1: [0.4, 0.16, 0.37], j2: [0.43, 0.07, 0.46], pad: [0.45, 0, 0.5] }, RJ = { j0: [0.3, 0.3, -0.52], j1: [0.41, 0.16, -0.46], j2: [0.44, 0.07, -0.58], pad: [0.46, 0, -0.54] };
  const TK = [[0, 0.3, -0.8, 0.21], [0, 0.29, -1.15, 0.19], [0, 0.27, -1.5, 0.155], [0, 0.24, -1.85, 0.115], [0, 0.21, -2.2, 0.08], [0, 0.18, -2.55, 0.05], [0, 0.17, -2.85, 0.02]], TN = 6;
  const sk = softSkel({ body: [0, 0.3, 0], pelvis: [0, 0.3, -0.55], chest: [0, 0.3, 0.38], neck: [0, 0.32, 0.62], head: [0, 0.33, 0.78], jaw: hd(0, -0.06, 0.0), ear: hd(0.2, 0.12, -0.15), mane: [0, 0.5, 0.1], fl: FJ, rl: RJ, tail: TK.slice(0, TN).map(k => [k[0], k[1], k[2]]), mane2: [0, 0.5, 0.3] });
  const BN = sk.BN, X = {};

  /* ----- 頭：寬而扁的頭骨、往前一根長吻（上顎）；下顎另一根（跟 jaw 骨頭）；眼睛在頭頂的小丘上 ----- */
  const head = ball('head', 28, 14, [0.3, 0.14, 0.34], { vmap: t => Math.pow(t, 1.1) });
  push(head, [0.2, 0.12, 0.12], 0.14, [0.0, 0.05, 0.02]); push(head, [0, 0.1, 0.0], [0.2, 0.08, 0.3], [0, 0.015, 0]);
  place(head, HC); finish(head); head.sk = B.head; head.tex = [384, 192]; add(head);
  const scalePaint = (c, p, n, K2) => { const a = p[0] * 22 + p[2] * 5, b = p[2] * 22, hx = Math.sin(a) * Math.sin(b + Math.sin(a) * 1.2); ink(c, 0.35 * smooth(0.2, 0.9, hx), K.skinD); ink(c, 0.25 * smooth(0.3, 0.9, -hx), K.skinL); };
  head.paint = (c, p, n) => { const x = p[0] - HC[0], y = p[1] - HC[1], z = p[2] - HC[2]; put(c, K.skin); ink(c, 0.5 * smooth(0.0, 0.14, y), K.skinL); scalePaint(c, p, n); ink(c, 0.7 * smooth(0.0, -0.1, y), K.belly); ink(c, 0.35 * smooth(0.0, 0.2, y) * smooth(-0.1, 0.2, z) * smooth(0.5, 1, furN(p, 0.7)), K.spot); if (EL) { ink(c, 0.6 * smooth(0.35, 0.8, furN(p, 1.3)) * smooth(0.0, 0.1, y), K.moss); const a = (p[0] - HC[0] + 0.1) * 0.8 + (z - 0.1) * 0.6; ink(c, 0.9 * cov(Math.max(abs((z - 0.1) * 0.8 - (p[0] - HC[0] + 0.1) * 0.6) - 0.012, abs(a) - 0.2), 0.008) * smooth(-0.0, 0.1, y), K.scar); } };
  { const up = tubeP('upper', 18, [{ p: hd(0, -0.005, 0.25), rx: 0.25, ry: 0.12, rd: 0.09 }, { p: hd(0, -0.01, 0.45), rx: 0.23, ry: 0.11, rd: 0.08 }, { p: hd(0, -0.015, 0.65), rx: 0.2, ry: 0.1, rd: 0.07 }, { p: hd(0, -0.02, 0.8), rx: 0.175, ry: 0.095, rd: 0.065 }], { nv: 12, capB: 0.1, capN: 3 }); up.sk = B.head; up.tex = [192, 160]; up.blend = [head, 0.12]; add(up);
    up.paint = (c, p, n) => { const x = p[0], y = p[1] - HC[1], z = p[2] - HC[2]; put(c, K.skin); ink(c, 0.5 * smooth(0.0, 0.1, y), K.skinL); scalePaint(c, p, n); ink(c, 0.75 * smooth(-0.02, -0.07, y), K.belly); if (EL) ink(c, 0.5 * smooth(0.3, 0.9, furN(p, 1.6)), K.moss); };
    for (const sx of [1, -1]) { const nb = ball('nostril' + sx, 10, 6, [0.05, 0.04, 0.055]); place(nb, hd(sx * 0.07, 0.075, 0.78)); nb.sk = B.head; nb.col = K.skin; nb.tex = [8, 8]; add(nb); const nh = ball('nhole' + sx, 8, 4, [0.024, 0.014, 0.024]); place(nh, hd(sx * 0.07, 0.108, 0.785)); nh.sk = B.head; nh.col = K.nose; nh.tex = [8, 8]; add(nh); } }
  { const jw = tubeP('lower', 16, [{ p: hd(0, -0.1, 0.22), rx: 0.2, ry: 0.06, rd: 0.05 }, { p: hd(0, -0.095, 0.45), rx: 0.19, ry: 0.055, rd: 0.048 }, { p: hd(0, -0.09, 0.65), rx: 0.165, ry: 0.05, rd: 0.044 }, { p: hd(0, -0.085, 0.79), rx: 0.15, ry: 0.045, rd: 0.04 }], { nv: 10, capB: 0.08, capN: 3 }); jw.sk = B.jaw; jw.tex = [160, 96]; add(jw);
    jw.paint = (c, p, n) => { const y = p[1] - HC[1]; put(c, K.belly); ink(c, 0.6 * smooth(-0.075, -0.05, y) * smooth(0.0, 1.0, n[1]), K.skin); scalePaint(c, p, n); ink(c, 0.5 * smooth(0.1, 0.0, n[1]), K.bellyD); if (n[1] > 0.6) { put(c, K.mouth); ink(c, 0.5 * smooth(0.0, 0.6, p[2] - HC[2] - 0.3), K.mouthD); } };
    const tn = tubeP('tongue', 8, [{ p: hd(0, -0.075, 0.3), rx: 0.09, ry: 0.012 }, { p: hd(0, -0.07, 0.55), rx: 0.075, ry: 0.012 }, { p: hd(0, -0.068, 0.7), rx: 0.05, ry: 0.01 }], { nv: 6, capB: 0.02, capN: 1 }); tn.sk = B.jaw; tn.col = K.tongue; tn.tex = [8, 8]; add(tn);
    const teeth = (side, sk2, y0, zs, name, amp) => { zs.forEach((z, i) => { const sx = side, w = 0.235 - 0.075 * (z - 0.25) / 0.6, big = (i === 2 || i === 5) ? 1.5 : 1; const b0 = hd(sx * (w - 0.012), y0, z), t = cone(name + sx + i, 4, b0, add3(b0, [0, amp * 0.5 * big, 0.004]), add3(b0, [-sx * 0.004, amp * big, 0.01]), 0.024 * big); t.sk = sk2; t.col = K.tooth; t.tex = [8, 8]; add(t); }); };
    const zU = [0.3, 0.4, 0.5, 0.6, 0.7, 0.77], zL = [0.34, 0.44, 0.54, 0.64, 0.73];
    for (const sx of [1, -1]) { teeth(sx, B.head, -0.025, zU, 'tu', -0.075); teeth(sx, B.jaw, -0.085, zL.map(z => z + 0.03), 'tl', 0.07); } }
  // 眼睛：頭頂兩顆大眼泡（突出、圓鼓鼓），眼球長在眼泡的前上方；可以只露這兩顆與鼻孔浮在水面
  let EMd = null; for (const sx of [1, -1]) { const mound = ball('eyemound' + sx, 16, 10, [0.073, 0.064, 0.076]); place(mound, hd(sx * 0.15, 0.128, 0.13)); mound.sk = B.head; mound.tex = [64, 56]; mound.paint = (c, p, n) => { put(c, K.skin); ink(c, 0.5 * smooth(0.0, 0.1, p[1] - HC[1] - 0.12), K.skinL); ink(c, 0.3, K.skinD); }; add(mound); if (sx > 0) EMd = mound; }
  const E8 = eyeSet(add, sk, EMd, hd(0.15, 0.128, 0.13), [0.45, 0.35, 0.85], { r: [0.044, 0.04, 0.02], pr: [0.009, 0.031, 0.007], po: [0, 0, 0.011], tilt: 0.0, zadd: [0.0, 0.0, 0.5], iris: K.iris, irisD: K.irisD, lid: K.lid, brow: K.scute, bs: 0.45, bo: [0.0, 0.02, 0.012], brk: [0.006, 0.032, 0.04], lidTop: 0.5, seg: 14, segv: 6, pupil: K.pupil });
  Object.assign(X, E8.X);

  /* ----- 身體：扁扁長長；背上兩排骨板（隆起的方塊，往後有龍骨）、側面小鱗 ----- */
  const body = tubeP('body', 26, [{ p: [0, 0.29, -0.82], rx: 0.22, ry: 0.15, rd: 0.12, wt: 0.9 }, { p: [0, 0.3, -0.58], rx: 0.31, ry: 0.2, rd: 0.16, wt: 0.9 }, { p: [0, 0.3, -0.2], rx: 0.34, ry: 0.21, rd: 0.17, wt: 0.88 }, { p: [0, 0.3, 0.16], rx: 0.34, ry: 0.21, rd: 0.17, wt: 0.88 }, { p: [0, 0.3, 0.44], rx: 0.3, ry: 0.19, rd: 0.15, wt: 0.9 }, { p: [0, 0.31, 0.66], rx: 0.22, ry: 0.15, rd: 0.12 }], { nv: 16, capA: 0.1, capB: 0.12, e: 1 });
  finish(body); body.tex = [384, 256]; add(body); body.sk = bodySk(-0.36, 0.1, 0.4, 0.6);
  const bodyPaint = (c, p, n, u) => { const al = abs(u - 0.5) * TAU, z = p[2]; put(c, K.skin); ink(c, 0.5 * smooth(1.0, 0.1, al), K.skinD); ink(c, 0.4 * smooth(1.4, 2.4, al), K.skinL); scalePaint(c, p, n); ink(c, 0.95 * smooth(2.2, 2.8, al), K.belly); ink(c, 0.25 * smooth(2.2, 2.8, al) * smooth(0.5, 1, furN(p, 3)), K.bellyD);
    // 背上的骨板格（兩排，每排一格一格）＋側面的深色斑塊
    const gx = abs(p[0]), cell = h2(((gx - 0.1) / 0.1), 0) , row = abs(((z * 8) % 1 + 1) % 1 - 0.5); ink(c, 0.8 * cov(Math.max(abs(gx - 0.1) - 0.065, row - 0.4) , 0.03) * smooth(0.9, 0.3, al), K.scute); ink(c, 0.5 * cov(abs(Math.max(abs(gx - 0.1) - 0.065, row - 0.4)) - 0.01, 0.02) * smooth(0.9, 0.3, al), K.scuteL); ink(c, 0.55 * smooth(0.4, 0.95, furN(p, 1.1)) * smooth(1.0, 1.7, al) * smooth(2.1, 1.6, al), K.spot); if (EL) { const mk = smooth(0.35, 0.85, furN(p, 1.0)) * smooth(2.0, 0.6, al); ink(c, 0.7 * mk, K.moss); ink(c, 0.5 * mk * smooth(0.6, 0.9, furN(p, 3.1)), K.mossL); } };
  body.paint = bodyPaint;
  { const sc = []; const zs = [0.56, 0.44, 0.32, 0.2, 0.08, -0.04, -0.16, -0.28, -0.4, -0.52, -0.64, -0.76]; zs.forEach((z, i) => { for (const sx of [1, -1]) { const h = surf(body, [sx * 0.1, 3, z], [0, -1, 0]); if (!h) continue; const t = ball('sc' + i + sx, 8, 5, EL ? [0.07, 0.058, 0.062] : [0.06, 0.04, 0.052]); place(t, add3(h.p, [0, 0.012, 0])); t.sk = body.sk(h.p); t.tex = [24, 24]; t.blend = [body, 0.06, false]; sc.push(add(t)); } });
    const S0 = sc[0]; S0.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.scute); ink(c, 0.7 * smooth(0.2, 0.9, d[1]), K.scuteL); if (EL) ink(c, 0.55 * smooth(0.0, 0.8, d[1]) * smooth(0.3, 0.7, furN([d[0] * 9, d[1] * 9, d[2] * 9], 1)), K.moss); }; for (const t of sc) if (t !== S0) { t.share = S0; t.tex = S0.tex; } }
  /* ----- 腿：短粗、往兩側撐開；腳趾有蹼；爪 ----- */
  const limbPaint = (c, p, n) => { put(c, K.skin); ink(c, 0.5 * smooth(0.0, 0.8, -n[1]), K.belly); scalePaint(c, p, n); ink(c, 0.4 * smooth(0.14, 0.02, p[1]), K.skinD); };
  const legSkC = (b, J) => legSkG(b, J, 0.05);
  legParts(add, body, 'fl', [{ p: [0.3, 0.3, 0.42], rx: 0.13, ry: 0.13 }, { p: [0.36, 0.22, 0.4], rx: 0.1, ry: 0.1 }, { p: [0.4, 0.16, 0.37], rx: 0.08, ry: 0.085 }, { p: [0.42, 0.1, 0.42], rx: 0.07, ry: 0.07 }, { p: [0.43, 0.07, 0.46], rx: 0.065, ry: 0.06 }], FJ, 0, { paint: limbPaint, sk: legSkC, blend: 0.14, tex: [64, 80] });
  legParts(add, body, 'rl', [{ p: [0.3, 0.3, -0.52], rx: 0.16, ry: 0.15, rd: 0.14 }, { p: [0.37, 0.22, -0.49], rx: 0.12, ry: 0.115 }, { p: [0.41, 0.16, -0.46], rx: 0.09, ry: 0.09 }, { p: [0.43, 0.1, -0.54], rx: 0.075, ry: 0.07 }, { p: [0.44, 0.07, -0.58], rx: 0.07, ry: 0.06 }], RJ, 2, { paint: limbPaint, sk: legSkC, blend: 0.14, tex: [64, 80] });
  const mkFoot = (name, li, hc, w) => { const f = ball(name, 12, 6, [w, 0.03, 0.1]); f.map(p => { if (p[1] < -0.025) p[1] = -0.025; }); place(f, hc); f.tex = [48, 32]; f.paint = (c, p, n) => { put(c, K.skin); ink(c, 0.5 * smooth(0.0, 0.05, p[1] - hc[1]), K.skinD); }; f.sk = Lg(li) + 2; add(f); add(mirrorX(f, name + 'R')).sk = Lg(li + 1) + 2;
    for (const dx of [-0.05, 0.0, 0.05]) { const b0 = [hc[0] + dx, hc[1], hc[2] + 0.1], t = cone(name + 'c' + dx, 4, b0, add3(b0, [dx * 0.2, 0.0, 0.025]), add3(b0, [dx * 0.4, -0.018, 0.055]), 0.016); t.sk = Lg(li) + 2; t.col = K.claw; t.tex = [8, 8]; add(t); add(mirrorX(t, name + 'cR' + dx)).sk = Lg(li + 1) + 2; } };
  mkFoot('foot', 0, [0.45, 0.028, 0.5], 0.085); mkFoot('footB', 2, [0.46, 0.028, -0.54], 0.09);
  { const c0 = [0.415, 0.13, 0.4], d = norm3(sub3(FJ.j2, FJ.j1)), a0 = [1, 0, 0], b0 = norm3(cross3(d, a0)), keys = []; for (let i = 0; i <= 14; i++) { const t = i / 14 * TAU; keys.push({ p: add3(add3(c0, a0, cos(t) * 0.082), b0, sin(t) * 0.082), rx: 0.017, ry: 0.017 }); }
    const rg = tubeP('bronzeRing', 6, keys, { nv: 29, ref: cross3(a0, b0) }); rg.sk = Lg(0) + 1; rg.tex = [48, 16]; rg.paint = (c, p, n, u, v) => { put(c, K.ring); ink(c, 0.6 * smooth(0.3, 0.9, n[1]), K.ringL); ink(c, 0.4 * smooth(0.6, 0.95, abs(sin(v * TAU * 4))), K.mouthD); }; add(rg); }
  /* ----- 尾巴：長而粗，側扁（游泳用），上緣一排尖脊（前面兩排、後面合成一排） ----- */
  { const tail = tubeP('tail', 10, TK.map(k => ({ p: [k[0], k[1], k[2]], rx: k[3], ry: k[3] * 0.95, rd: k[3] * 0.7 })), { capB: 0.02, capN: 2, seam: PI / 2, nv: 22 }); tail.tex = [128, 256]; tail.sk = tailSk(TN);
    tail.paint = (c, p, n, u, v) => { const al = abs(u - 0.5) * TAU; put(c, K.skin); ink(c, 0.5 * smooth(1.0, 0.1, al), K.skinD); scalePaint(c, p, n); ink(c, 0.8 * smooth(2.3, 2.9, al), K.belly); const bands = abs(((v * 11) % 1 + 1) % 1 - 0.5); ink(c, 0.55 * smooth(0.25, 0.4, bands) * smooth(1.5, 0.3, al) * smooth(0.0, 0.2, v), K.skinD); }; add(tail);
    const tz = p => { const k = TN, zs = TK.map(q => q[2]); let s2 = 0; for (let j = 0; j < zs.length - 1; j++) if (p[2] <= zs[j] && p[2] > zs[j + 1]) s2 = j + (zs[j] - p[2]) / (zs[j] - zs[j + 1]); if (p[2] <= zs[zs.length - 1]) s2 = zs.length - 1; if (p[2] > zs[0]) s2 = 0; if (s2 >= k - 1) return [B.tail + k - 1, 1]; const j = Math.floor(s2), w = smooth(0, 1, s2 - j); return [B.tail + j, 1 - w, B.tail + j + 1, w]; };
    const ks = []; for (let i = 0; i < 16; i++) { const f = i / 15, zz = -0.82 - f * 1.95, k = TK.length - 1, s2 = f * 0.93 * k, j0 = Math.min(k - 1, Math.floor(s2)), tt = s2 - j0, yy = TK[j0][1] + (TK[j0 + 1][1] - TK[j0][1]) * tt, rr = TK[j0][3] + (TK[j0 + 1][3] - TK[j0][3]) * tt, base = [0, yy + rr * 0.92, zz], sz = 1 - f * 0.55;
      const t = ball('tc' + i, 8, 5, [0.04 * sz, 0.04 * sz, 0.055 * sz]); place(t, base); t.sk = tz(base); t.tex = [16, 16]; ks.push(add(t)); }
    const T0 = ks[0]; T0.paint = (c, p, n, u, v, pt) => { const d = pt.dir(u, v); put(c, K.scute); ink(c, 0.7 * smooth(0.2, 0.9, d[1]), K.scuteL); }; for (const t of ks) if (t !== T0) { t.share = T0; t.tex = T0.tex; } }
  const AO = [{ id: 'head', c: HC, r: 0.34 }, { id: 'body', c: [0, 0.3, 0.2], r: 0.34 }, { id: 'body', c: [0, 0.3, -0.3], r: 0.34 }];
  withAO(parts, AO, 0.15);
  return { parts, bones: BN, legs: sk.legs, mane2: sk.mane2, tailN: TN, X, bg: K.skin, eyeCol: [1.0, 0.9, 0.2], key: K,
    S: { k: 1.0, run: 4.4, stride: 0.38, lift: 0.07, bob: 0.015, cad: 1.2, graze: 0, grazeN: 0, grazeH: 0, earBack: 0, jawMax: 0.8, maneUp: 0, wag: 1.6, wagAmp: 0.4, halfW: 0.34, tailRun: 0.3, low: 0.05, u: 0.5, jump: 0.5, jaw0: 0.0, reach: 0.2, elastic: 1, maneK: 0, rearK: 0.6, pose: poseCroc } };
};

/* 鱷魚姿勢（v.pose）：'sun'／'bask' 曬背＝趴平、腿撐開、嘴張開、眼睛半瞇、尾巴攤平｜'sub' 潛伏＝整隻沉進水裡，只露兩顆眼泡和鼻孔（水面是模型座標 y＝0，遊戲把 root 放在水面高度）｜'rise' 浮上來一半；
   招式：lunge＝水中衝咬（預備：眼泡停住、頭仰、嘴張開；出手：整個身體往前竄＋閉嘴一咬）、grab＝咬住拖行（預備：頭往後縮；咬住：嘴閉緊、頭左右甩、身體後坐）、
   roll＝翻滾（預備：尾巴拱起；出手 1 秒繞身體長軸翻一整圈以上；收招＝肚子朝上愣住 1.2 秒，腳朝天抽動，再翻回來）、tail＝甩尾（頭轉向、身體彎成 C、尾巴橫掃）、bite＝共用。 */
function poseCroc(T, q) {
  const { st, p, t, an, m, v } = q, pose = v.pose, sd = q.sd || 1, act = q.act, ph = TAU * m.phase, mv = clamp((q.sp || 0) / 3, 0, 1) * (isMove(q) ? 1 : 0);
  const sunny = pose === 'sun' || pose === 'bask', sub = pose === 'sub', rise = pose === 'rise';
  // 低身子：平常肚子貼地、腿往外撐；移動時身體左右扭（頭尾反向）
  T.by -= 0.02; if (mv > 0.01) { T.bw += 0.16 * sin(ph) * mv; T.pw -= 0.2 * sin(ph) * mv; T.cw -= 0.08 * sin(ph) * mv; T.nw += 0.1 * sin(ph + 0.8) * mv; T.tw += 0.5 * sin(ph + 1.6) * mv; }
  for (let i = 0; i < 4; i++) footAt(T, m, i, 0.03, 0, 0);
  if (sunny && st === ST.IDLE) { T.by -= 0.05; T.jaw = 1.0 + 0.04 * sin(t * 1.4); T.eye *= 0.45; T.brow -= 0.3; T.tp -= 0.2; T.tw += 0.12 * sin(t * 0.5 + m.seed); T.sq += 1.6 * sin(t * 1.1); for (let i = 0; i < 4; i++) footAt(T, m, i, 0.08, 0, i < 2 ? -0.04 : 0.04); T.np -= 0.1; T.hp -= 0.05; }
  if ((sub || rise) && st !== ST.DEAD) { const k = sub ? 1 : 0.45; T.rigY -= 0.6 * k; T.by -= 0.05 * k; T.np -= 0.28 * k; T.hp -= 0.08 * k; T.tp -= 0.2 * k; T.jaw = Math.max(T.jaw, 0); T.tw += 0.25 * sin(t * 1.2 + m.seed) * k; T.tc += 0.1 * sin(t * 0.8) * k; for (let i = 0; i < 4; i++) footAt(T, m, i, -0.06 * k, 0, i < 2 ? -0.1 * k : -0.18 * k); T.eye = Math.max(T.eye, sub ? 0.9 : 0.8); T.brow = -0.2; }
  const sj = sub || rise ? 0.8 : 1;
  if ((an === 'lunge') && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q);
    if (st === ST.WIND) { T.np -= 0.35 * e; T.hp -= 0.15 * e; T.jaw += 0.85 * e; T.bz -= 0.1 * e; T.bp -= 0.08 * e; T.rigY += 0.0; T.eye = 1.1; T.eL = T.eR = 1; T.tw += 0.3 * sin(t * 12) * e; }
    else { const k = eased(0, 1, s); T.bz += 0.34 * k; T.np += 0.35 * k; T.hp += 0.1 * k; T.jaw += 0.9 * (1 - eased(0.5, 0.75, s)); T.ssz += 0.1 * sin(PI * s); T.bp += 0.05 * k; T.tw += 0.3 * k * sd; } }
  else if (an === 'grab' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = wind(q), s = strikeK(q);
    if (st === ST.WIND) { T.np -= 0.4 * e; T.hp -= 0.2 * e; T.bz -= 0.12 * e; T.jaw += 0.5 * e; T.by -= 0.02 * e; T.eye = 1.1; }
    else { const k = eased(0, 1, s), lat = st === ST.STRIKE ? 1 : 0.3; T.np += 0.2 * k; T.jaw = 0.02; T.hw += 0.3 * sin(t * 13) * lat; T.nw += 0.18 * sin(t * 13 + 0.6) * lat; T.bw += 0.08 * sin(t * 13 + 1.1) * lat; T.bz -= 0.1 * k; T.pp -= 0.06 * k; T.tw += 0.4 * sin(t * 6); for (let i = 0; i < 4; i++) footAt(T, m, i, 0, 0, -0.06 * k); } }
  else if (an === 'roll' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const hg = 0.3;
    if (st === ST.WIND) { const e = eased(0, 1, wind(q)); T.tp += 0.9 * e; T.tc += 0.3 * e; T.by -= 0.03 * e; T.bp -= 0.05 * e; T.jaw = 0.1; T.eL = T.eR = 1; T.bw += 0.1 * sd * e; }
    else if (st === ST.STRIKE) { const s = strikeK(q), th = eased(0, 1, s) * (TAU + PI) * sd; T.rigR = th; T.rigX = hg * sin(th) * 1.0; T.rigY = hg * (1 - cos(th)); T.jaw = 0.05; T.tp += 0.4; T.tw += 0.5 * sin(s * 30); }
    else { const belly = act.belly ?? 1.2, k = p < belly ? 1 : 1 - eased(0, 0.4, p - belly), th = PI * k * sd; T.rigR = th; T.rigX = hg * sin(th); T.rigY = hg * (1 - cos(th)); T.jaw = 0.4 * (p < belly ? 1 : 0); T.eye = p < belly ? 0.5 : 1; T.brow = -0.2; T.tw += 0.2 * sin(t * 9) * k; T.tp -= 0.2; for (let i = 0; i < 4; i++) { const w2 = k * (0.12 * sin(t * 11 + i * 1.7)); footAt(T, m, i, 0.08 * k, w2, 0.04 * sin(t * 9 + i)); } }
    // 翻滾的角度跨過 2π 時，目標與目前值差一整圈 → 把目前值拉到最近的等價角度（和 creatures.js 對 rigW 的做法一樣）
    const C = m.C; C.rigR -= TAU * Math.round((C.rigR - T.rigR) / TAU); }
  else if (an === 'tail' && (st === ST.WIND || st === ST.STRIKE || st === ST.RECOVER)) { const e = eased(0, 1, wind(q)), s = strikeK(q), k = st === ST.STRIKE ? eased(0, 1, s) : st === ST.RECOVER ? 1 : 0;
    T.hw += 0.6 * sd * (e - k * 0.4); T.nw += 0.3 * sd * e; T.bw += 0.2 * sd * e * (1 - k * 0.5); T.pw -= 0.3 * sd * e; T.tw += (-1.1 * e + 2.0 * k) * sd; T.tp += 0.3 * e; T.jaw += 0.35 * e; T.by -= 0.02 * e; }
  if (!(an === 'roll' && st !== ST.IDLE && st !== ST.CHASE)) { const C = m.C; C.rigR -= TAU * Math.round((C.rigR - T.rigR) / TAU); }
}


/* ============================== 產生一隻（和 beasts07.js 的 makeBeast07 同格式） ============================== */
const cache = {}, faceTex = {};
const faceTexture = name => { let t = faceTex[name]; if (!t) { t = faceTex[name] = new THREE.TextureLoader().load('assets/face/' + name); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; } return t; };
/* 臉面材質：和身體共用 glow／dim／fade／rim 這幾個 uniform 物件（animCreature 只改 mats[0]，臉會跟著）。uDim（＝0.95×發光程度）大於 0.12 起從閉嘴圖漸變成生氣圖（威嚇／蓄力／出手／狂暴），
   眼睛（虹膜位置的圓）和其他野獸一樣：染上 uGlow 的光（攻擊時紅）。 */
function faceShader(sh) {
  const U = this.userData; sh.uniforms.uGlow = U.glow; sh.uniforms.uDim = U.dim; sh.uniforms.uFade = U.fade; sh.uniforms.uRim = U.rim; sh.uniforms.mapB = { value: U.mapB }; sh.uniforms.uEyes = { value: U.eyes }; sh.uniforms.uCan = { value: U.can }; sh.uniforms.uBare = U.bare; sh.uniforms.uLift = { value: FACE_LIFT };
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nuniform sampler2D mapB;\nuniform vec4 uEyes;\nuniform vec4 uCan;\nuniform float uBare;\nuniform float uLift;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', `vec4 tA = texture2D(map, vMapUv), tB = texture2D(mapB, vMapUv), tM = mix(tA, tB, max(smoothstep(0.12, 0.3, uDim), uBare));
  vec2 tp = vec2(vMapUv.x * uCan.x, (1.0 - vMapUv.y) * uCan.y); float eyeM = max(1.0 - smoothstep(uCan.z, uCan.w, distance(tp, uEyes.xy)), 1.0 - smoothstep(uCan.z, uCan.w, distance(tp, uEyes.zw)));
  float luma = dot(tM.rgb, vec3(0.3, 0.59, 0.11)), irisK = eyeM * smoothstep(0.1, 0.6, uDim) * (1.0 - smoothstep(0.3, 0.5, luma)), rr = luma * 2.6 + 0.04;
  tM.rgb = mix(tM.rgb, vec3(1.0, 0.1, 0.05) * rr, irisK); diffuseColor *= tM;`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * (irisK * 0.5) + diffuseColor.rgb * uLift;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
let FACE_TINT = 1.0, FACE_LIFT = 0.06;
export const __faceTune = (t, l) => { FACE_TINT = t; FACE_LIFT = l; };
function attachFace(m, F, mat, mesh, young) {
  let g = F.geo; if (!g) { g = F.geo = new THREE.BufferGeometry(); const n = F.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = B.head; sw[i * 4] = 1; }
    g.setAttribute('position', new THREE.BufferAttribute(F.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(F.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(F.uv, 2)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setIndex(F.idx); }
  const tA = faceTexture(F.tex[0]), tB = faceTexture(F.tex[1]), fm = new THREE.MeshStandardMaterial({ map: tA, roughness: 0.82, metalness: 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  fm.color.setRGB(FACE_TINT, FACE_TINT, FACE_TINT); fm.emissive = mat.emissive; Object.assign(fm.userData, { glow: mat.userData.glow, dim: mat.userData.dim, fade: mat.userData.fade, rim: mat.userData.rim, mapB: tB, eyes: new THREE.Vector4(F.eyes[0] - F.X0, F.eyes[1] - F.Y0, F.eyes[2] - F.X0, F.eyes[3] - F.Y0), can: new THREE.Vector4(F.cw, F.ch, F.r0, F.r1), bare: { value: 0 } });
  fm.onBeforeCompile = faceShader; fm.customProgramCacheKey = () => 'apeface2';
  const fmesh = new THREE.SkinnedMesh(g, fm); fmesh.frustumCulled = false; fmesh.castShadow = false; fmesh.receiveShadow = false; fmesh.renderOrder = 1; fmesh.bind(mesh.skeleton, new THREE.Matrix4());
  fmesh.onBeforeRender = () => { fm.opacity = tA.image && tB.image ? mat.opacity : 0; };
  m.root.add(fmesh); m.face = fmesh; return fmesh;
}
function softShader(sh) {
  sh.uniforms.uGlow = this.userData.glow; sh.uniforms.uDim = this.userData.dim; sh.uniforms.uFade = this.userData.fade; sh.uniforms.uRim = this.userData.rim;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nvarying float vGlow;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 1.0 - vGlow * uDim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * vGlow;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}

/* 箭豬專用的材質變體：aGlow＝0.5 的頂點是「刺」（uQ＝豎起量：頂點著色器把刺繞刺根轉成往外放射（QV_HEAD／QV_POS／QV_NRM，在箭豬段）；豎起時刺只乘一點亮度（不往白色混，深咖啡／米白照參考圖））；aGlow＝1 的頂點是眼睛（跟其他野獸一樣） */
function softShaderQ(sh) {
  sh.uniforms.uGlow = this.userData.glow; sh.uniforms.uDim = this.userData.dim; sh.uniforms.uFade = this.userData.fade; sh.uniforms.uRim = this.userData.rim; sh.uniforms.uQ = this.userData.q;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + QV_HEAD + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + QV_NRM).replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;' + QV_POS);
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nuniform float uQ;\nvarying float vGlow;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  float eyeM = step(0.75, vGlow); float qM = step(0.25, vGlow) * (1.0 - eyeM), qU = min(uQ, 1.0);\n  diffuseColor.rgb *= 1.0 - eyeM * uDim; diffuseColor.rgb *= 1.0 + qM * qU * 0.25;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * eyeM + vec3(1.0, 0.86, 0.6) * (qM * qU * 0.012);\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
const CH = ['bx', 'by', 'bz', 'bp', 'br', 'bw', 'rear', 'buck', 'pp', 'pw', 'cp', 'cw', 'cr', 'np', 'nw', 'nr', 'hp', 'hw', 'hr', 'jaw', 'eL', 'eR', 'eS', 'mane', 'tp', 'tc', 'tw', 'rigX', 'rigY', 'rigZ', 'rigP', 'rigW', 'rigR', 'eye', 'sq', 'ssz', 'ssy', 'brow', 'pup'];
const newPose = () => { const o = { L: new Float32Array(32) }; for (const k of CH) o[k] = 0; o.eye = 1; o.pup = 1; return o; };
export const BEAST08_TYPES = () => Object.keys(SOFT);
// o：{ elite, young }；young（猩猩的小猩猩）＝同一副骨架，體型 ×0.6、頭更圓
/* 製作人 11-18：圖生 3D 新模型（同 creatures.js 的 species08、beasts07.js 的 soft08）。只換一般成年個體（不換菁英／幼體／老個體，除非另有模型檔）。
   新模型的骨架＝標準骨（softSkel，用模型檔的 joints）＋舊模型在標準骨之後加的額外骨（箭豬的噴刺骨、眼睛骨等，位置沿用舊模型、新網格不綁它們），
   所以動畫裡用到的骨頭索引全部不變；條件是尾巴節數要和舊模型相同。臉貼圖、箭豬的刺 shader 在新模型上關掉（新模型的臉與刺都在貼圖裡）。 */
function soft08b(type, elite, young, elder) { if (elder || (young && type !== 'ape')) return null; if (young) elite = false; const K8 = type + (elite ? '!#8' : '#8') + (young ? '~' : ''), K0 = type + (elite ? '!' : '') + (young ? '~' : '');      /* 小猩猩（ape 的 young）改用 apeY 新模型；舊小猩猩當骨架／尺寸的對照 */
  if (cache[K8]) return cache[K8]; if (cache[K8] === false) return null;
  const d = getModel08(type, elite, young); if (!d || !SOFT[type]) return null;
  try {
    const old = cache[K0] || (cache[K0] = buildSoft(SOFT[type](elite, !!young, false))), sk = softSkel(d.joints), BN = sk.BN, n0 = BN.length;
    if (d.bones.length < n0 || BN.some((b, i) => b.name !== d.bones[i])) throw new Error('骨名對不上');
    if (old.bones.length < n0 || old.bones.slice(0, n0).some((b, i) => b.name !== BN[i].name)) throw new Error('尾巴節數和舊模型不同');
    for (let i = n0; i < old.bones.length; i++) { const b = old.bones[i]; BN.push({ name: b.name, parent: b.parent, p: b.p.slice ? b.p.slice() : [b.p[0], b.p[1], b.p[2]] }); }
    const one = new THREE.Vector3(1, 1, 1), Mw = BN.map(b => new THREE.Matrix4().compose(new THREE.Vector3(b.p[0], b.p[1], b.p[2]), new THREE.Quaternion(), one)), inv = Mw.map(m => m.clone().invert());
    BN.forEach((b, i) => { const L = b.parent < 0 ? Mw[i].clone() : inv[b.parent].clone().multiply(Mw[i]); b.lp = new THREE.Vector3(); b.lq = new THREE.Quaternion(); L.decompose(b.lp, b.lq, new THREE.Vector3()); });
    const vk = VISK08[type + (elite ? 'E' : '')] || 1;
    return (cache[K8] = Object.assign({}, old, { geo: d.geo, tex: d.tex, bones: BN, legs: sk.legs, mane2: sk.mane2, inv, S: vk !== 1 ? Object.assign({}, old.S, { k: old.S.k * vk }) : old.S, D: Object.assign({}, old.D, { face: null, quill: false }), v8: true }));
  } catch (e) { console.warn('[model08] ' + type + ' 建骨架失敗，沿用舊模型：', e && e.message); cache[K8] = false; return null; }
}
export function makeBeast08(type, size = 1, o = {}) {
  const elite = !!(o && o.elite), young = !!(o && o.young), elder = !!(o && o.elder) || (type === 'croc' && elite), ck = type + (elite ? '!' : '') + (young ? '~' : '') + (elder ? '^' : ''), sp = soft08b(type, elite, young, elder) || cache[ck] || (cache[ck] = buildSoft(SOFT[type](elite, young, elder))), S = sp.S;
  const root = new THREE.Group(), tilt = new THREE.Group(), rig = new THREE.Group(); root.add(tilt); tilt.add(rig); root.scale.setScalar(S.k * size * (young ? 0.6 : 1) * (elder ? 1.25 : 1) * (elite && type === 'ape' && !young ? 1.12 : 1));      /* X4：白背再大一號 */
  const bones = sp.bones.map(b => { const o2 = new THREE.Bone(); o2.name = b.name; return o2; });
  sp.bones.forEach((b, i) => { const pp = b.parent < 0 ? [0, 0, 0] : sp.bones[b.parent].p; (b.parent < 0 ? rig : bones[b.parent]).add(bones[i]); if (b.lp) { bones[i].position.copy(b.lp); bones[i].quaternion.copy(b.lq); } else bones[i].position.set(b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]); });
  const mat = new THREE.MeshStandardMaterial({ map: sp.tex, roughness: sp.D.rough ?? 0.8, metalness: 0 }); mat.userData.glow = { value: new THREE.Color(0, 0, 0) }; mat.userData.dim = { value: 0 }; mat.userData.fade = { value: 1 }; mat.userData.rim = { value: new THREE.Color(0, 0, 0) }; mat.userData.q = { value: 0 }; mat.onBeforeCompile = sp.D.quill ? softShaderQ : softShader; mat.customProgramCacheKey = () => sp.D.quill ? 'softporc' : 'softcreature';
  const mesh = new THREE.SkinnedMesh(sp.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh); mesh.bind(new THREE.Skeleton(bones, sp.inv), new THREE.Matrix4());
  const m = { root, tilt, rig, bones, mesh, eye: null, mats: [mat], mEye: null, sp, S, type, elite, young, elder, phase: Math.random(), seed: Math.random() * 100, T: newPose(), C: newPose(), st: -1, lp: 0, side: 1, yaw: null, yv: 0, sl: [0, 0, 0], fading: false, snap: true,
    rest: bones.map(b => b.position.clone()), restQ: bones.map(b => b.quaternion.clone()), tailN: sp.D.tailN };
  if (type === 'monkey') { const g = new THREE.Group(), glass = new THREE.MeshStandardMaterial({ color: 0x4aa86a, roughness: 0.3, metalness: 0.1 }), cork = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.9 });
    const bt = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), glass), nk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 10), glass), ck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 10), cork); nk.position.y = 0.09; ck.position.y = 0.145; g.add(bt, nk, ck); g.position.set(0, -0.2, 0.32); g.visible = false; g.traverse(o2 => { o2.castShadow = true; }); bones[B.chest].add(g); m.carry = g; }
  m.bn = {}; sp.bones.forEach((b, i) => { m.bn[b.name] = bones[i]; });
  if (sp.D.face) attachFace(m, sp.D.face, mat, mesh, young);
  return beastFinish08(m);
}
export const BEAST08_SIZE = { monkey: 1.1, ape: 1.3, porc: 0.95, ibex: 1.1, croc: 1.2 };      /* 建議的 size（照 MON[type].size 的用法）；菁英巨鱷再由遊戲 ×1.38（模型內另有 ×1.25 → 合計約 1.7 倍）。和現有野獸的對照見報告 */
