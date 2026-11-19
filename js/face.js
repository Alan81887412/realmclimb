// 捏臉：Q 版公仔頭。每個部位先挑一個造型，再用少數幾條滑桿調大小、高低、間距、角度。
// 頭型、眼窩、鼻子是實體曲面；眼睛、眉毛、嘴、耳朵、鬍子、頭髮都貼合同一個曲面，所以怎麼調都不會穿模
import * as THREE from './three.bundle.js';

const TAU = Math.PI * 2, D = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const FACE = {
  skin: ['#ffdfcc', '#ffcfae', '#f6bd94', '#e6a77a', '#cf8d5e', '#ad6f47', '#875434', '#5a3824'],
  hairColor: ['#2b2624', '#4a2f22', '#7a4a2a', '#b47a34', '#e2c078', '#f1e9d8', '#b33a2c', '#e8809f', '#5b7bd0', '#44a48c', '#8e68c8', '#9298a0'],
  eyeColor: ['#6b4423', '#33302f', '#3d7cd0', '#35a487', '#8658d0', '#c98524', '#c3445a', '#7c8894'],
  lipColor: ['#e9c3b4', '#d98684', '#ee8f98', '#d44f4f', '#f08c6a', '#b23e66'],
  faceNames: ['圓臉', '包子臉', '鵝蛋臉', '尖下巴', '方臉'],
  eyeNames: ['圓眼', '杏眼', '垂眼', '鳳眼', '半闔眼', '貓眼', '豆豆眼', '瞇瞇眼'],
  lashNames: ['無', '自然', '濃密'],
  browNames: ['自然', '平眉', '彎眉', '劍眉', '八字眉', '豆豆眉'],
  noseNames: ['小圓鼻', '尖鼻', '點鼻', '大圓鼻'],
  mouthNames: ['微笑', '一字', '貓嘴', '開口笑', '小圓嘴', '不悅'],
  earNames: ['一般', '尖耳', '獸耳'],
  blushNames: ['無', '淡', '圓形', '斜線'],
  markNames: ['無', '雀斑', '淚痣', '刀疤'],
  beardNames: ['無', '鬍渣', '八字鬍', '山羊鬍', '大鬍子'],
  hairNames: ['短髮', '刺蝟頭', '側分', '中分', '後梳', '鮑伯頭', '長直髮', '馬尾', '雙馬尾', '丸子頭', '平頭']
};
export const GROUPS = [['shape', '臉型'], ['eye', '眼睛'], ['brow', '眉毛'], ['nm', '鼻子與嘴'], ['detail', '臉部細節'], ['hair', '頭髮']];
// 滑桿：[代號, 分類, 名稱]。全部 0–20，中間 10 是該造型原本的樣子
export const SLIDERS = [
  ['fw', 'shape', '臉寬'], ['fl', 'shape', '臉長'], ['fc', 'shape', '臉頰'], ['fj', 'shape', '下巴'],
  ['es', 'eye', '大小'], ['ey', 'eye', '高低'], ['ex', 'eye', '間距'], ['er', 'eye', '角度'],
  ['bs', 'brow', '粗細'], ['by', 'brow', '高低'], ['bx', 'brow', '間距'], ['br', 'brow', '角度'],
  ['ns', 'nm', '鼻子大小'], ['ny', 'nm', '鼻子高低'], ['ms', 'nm', '嘴巴大小'], ['my', 'nm', '嘴巴高低'],
  ['ea', 'detail', '耳朵大小']
];
export const MAXV = 20, MID = 10;
// 選項：[代號, 最小, 最大, 預設]
export const PARAMS = [['skin', 0, 7, 1], ['fs', 0, 4, 0], ['eye', 0, 7, 0], ['ec', 0, 7, 0], ['lash', 0, 2, 1], ['brow', 0, 5, 0], ['nose', 0, 3, 0], ['mouth', 0, 5, 0], ['lipc', 0, 5, 0], ['ear', 0, 2, 0], ['blush', 0, 3, 1], ['mark', 0, 3, 0], ['beard', 0, 4, 0], ['hair', 0, 10, 0], ['hc', 0, 11, 1]];
// 介面用：[代號, 分類, 標題, 名稱或色票, 是否為色票]
export const CHOICES = [
  ['skin', 'base', '膚色', FACE.skin, 1], ['fs', 'shape', '臉型', FACE.faceNames, 0], ['eye', 'eye', '眼型', FACE.eyeNames, 0], ['ec', 'eye', '瞳色', FACE.eyeColor, 1], ['lash', 'eye', '睫毛', FACE.lashNames, 0],
  ['brow', 'brow', '眉型', FACE.browNames, 0], ['nose', 'nm', '鼻型', FACE.noseNames, 0], ['mouth', 'nm', '嘴型', FACE.mouthNames, 0], ['lipc', 'nm', '唇色（第一格是不上色）', FACE.lipColor, 1],
  ['ear', 'detail', '耳朵', FACE.earNames, 0], ['blush', 'detail', '腮紅', FACE.blushNames, 0], ['mark', 'detail', '特徵', FACE.markNames, 0], ['beard', 'detail', '鬍子', FACE.beardNames, 0],
  ['hair', 'hair', '髮型', FACE.hairNames, 0], ['hc', 'hair', '髮色（眉毛與鬍子同色）', FACE.hairColor, 1]
];
// 基礎臉：整張臉的搭配，選了之後再到各分頁換造型、拉滑桿
export const PRESETS = [
  ['元氣', { fs: 0, eye: 0, brow: 0, nose: 0, mouth: 3 }, {}], ['文靜', { fs: 2, eye: 2, brow: 2, nose: 2, mouth: 0 }, {}], ['冷酷', { fs: 3, eye: 3, brow: 3, nose: 1, mouth: 1 }, {}], ['呆萌', { fs: 1, eye: 6, brow: 5, nose: 2, mouth: 4, blush: 2 }, {}],
  ['慵懶', { fs: 0, eye: 4, brow: 1, nose: 0, mouth: 5 }, {}], ['機靈', { fs: 3, eye: 5, brow: 3, nose: 1, mouth: 2 }, {}], ['豪邁', { fs: 4, eye: 1, brow: 3, nose: 3, mouth: 3 }, { bs: 14 }], ['笑瞇瞇', { fs: 1, eye: 7, brow: 2, nose: 0, mouth: 0, blush: 2 }, {}]
];
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export function defaultFace(g) {
  const f = { s: {} }; PARAMS.forEach(([k, , , d]) => { f[k] = d; }); SLIDERS.forEach(([id]) => { f.s[id] = MID; });
  if (g) { f.hair = 6; f.lash = 2; f.lipc = 2; f.eye = 0; f.brow = 2; } else { f.hair = 0; f.lash = 0; f.blush = 0; f.brow = 0; }
  return f;
}
export const encodeFace = f => PARAMS.map(([k]) => B36[f[k]] || '0').join('') + SLIDERS.map(([id]) => B36[f.s[id]] || 'a').join('');
export function decodeFace(str, g) {
  const f = defaultFace(g); str = String(str || ''); if (str.length < PARAMS.length) return f;
  PARAMS.forEach(([k, lo, hi], i) => { const v = B36.indexOf(str[i]); if (v >= 0) f[k] = clamp(v, lo, hi); });
  SLIDERS.forEach(([id], i) => { const v = B36.indexOf(str[PARAMS.length + i]); if (v >= 0) f.s[id] = clamp(v, 0, MAXV); });
  return f;
}
export function similarFace(f, amt = 2) { const o = JSON.parse(JSON.stringify(f)); SLIDERS.forEach(([id]) => { if (Math.random() < 0.7) o.s[id] = clamp(o.s[id] + Math.round((Math.random() - 0.5) * 2 * amt), 0, MAXV); }); return o; }
export function randomFace(g) {
  const f = defaultFace(g), R = n => Math.floor(Math.random() * n);
  f.skin = R(7); f.fs = R(5); f.eye = R(8); f.ec = R(8); f.brow = R(6); f.nose = R(4); f.mouth = R(6); f.hc = R(12); f.hair = g ? [2, 3, 5, 6, 7, 8, 9][R(7)] : [0, 1, 2, 3, 4, 7, 10][R(7)];
  f.lipc = g ? 1 + R(5) : 0; f.lash = g ? 1 + R(2) : R(2); f.blush = R(4); f.ear = Math.random() < 0.2 ? 1 + R(2) : 0; f.mark = Math.random() < 0.25 ? 1 + R(3) : 0; f.beard = !g && Math.random() < 0.3 ? 1 + R(4) : 0;
  return similarFace(f, 4);
}

/* ---------- 頭的曲面 ---------- */
// 球面上的隆起：以經緯度為中心、兩個方向各自的寬度
const K = (lon, lat, lon0, lat0, sl, st) => { let dl = lon - lon0; if (dl > Math.PI) dl -= TAU; else if (dl < -Math.PI) dl += TAU; dl *= Math.cos(lat0); const dt = lat - lat0; return Math.exp(-(dl * dl) / (sl * sl) - (dt * dt) / (st * st)); };
const K2 = (lon, lat, lon0, lat0, sl, st) => K(lon, lat, lon0, lat0, sl, st) + K(lon, lat, -lon0, lat0, sl, st);
// 臉型：taper 下半臉往下巴收窄；tp 收窄集中在多低（越大臉頰越飽滿、接近下巴才收）；ck 臉頰；cn 下巴；cw 下巴寬（度）；jw 下顎角；len 下半臉長度；w 整體寬度
const SHAPES = [
  { taper: 0.27, ck: 0.045, cn: 0.05, jw: 0, len: 0 },                                             // 圓臉
  { taper: 0.16, ck: 0.12, cn: 0.02, jw: 0, len: -0.05, tp: 1.6, w: 1.03 },                        // 包子臉：臉頰低而飽滿、下巴平
  { taper: 0.23, ck: 0, cn: 0.055, jw: -0.005, len: 0.085, cw: 30, tp: 1.4, w: 0.955 },            // 鵝蛋臉：稍窄稍長、下巴圓順
  { taper: 0.3, ck: 0.05, cn: 0.08, jw: -0.02, len: 0, cw: 14, tp: 1.5 },                          // 尖下巴：臉頰圓、下面一個小小的尖下巴（愛心形）
  { taper: 0.07, ck: 0, cn: 0.03, jw: 0.11, len: 0.05, cw: 34 }                                    // 方臉
];
// 眼型（單位：度）：a 半寬、hu/hl 上下高度、su/sl 眼角尖的程度、sk 上眼瞼最高點往外偏、tilt 眼尾上揚、iris 虹膜、cut 上眼瞼壓低成半闔、droop 外眼角往下彎
const EYES = [
  { a: 10.5, hu: 11.5, hl: 9.5, su: 0.12, sl: 0.22, sk: 0, tilt: 0, iris: 0.9 }, { a: 12.8, hu: 9.2, hl: 7, su: 0.8, sl: 0.85, sk: 0.08, tilt: 4, iris: 0.95 }, { a: 12.2, hu: 9.2, hl: 8.6, su: 0.22, sl: 0.18, sk: -0.05, tilt: -4, iris: 0.93, droop: 6 }, { a: 13, hu: 7.4, hl: 5.2, su: 0.9, sl: 0.95, sk: 0.2, tilt: 13, iris: 1 },
  { a: 11.8, hu: 11, hl: 8.6, su: 0.2, sl: 0.3, sk: 0, tilt: -2, iris: 0.86, cut: 0.42 }, { a: 12.2, hu: 10.6, hl: 7.4, su: 0.55, sl: 0.75, sk: 0.34, tilt: 11, iris: 0.84, cat: 1 }, { a: 4.6, hu: 6.4, hl: 6.4, su: 0, sl: 0, sk: 0, tilt: 0, iris: 1.3, bead: 1 }, { a: 9.5, hu: 5.2, hl: 0, su: 0, sl: 0, sk: 0, tilt: 0, iris: 0, closed: 1 }
];
// 眉型：L 長度、th 粗細、arch 弧度、ang 眉尾上揚、tp 眉尾收細、dot 豆豆眉
const BROWS = [{ L: 1, th: 1.5, arch: 2, ang: -2, tp: 0.7 }, { L: 1, th: 1.7, arch: 0.2, ang: 0, tp: 0.15 }, { L: 1.06, th: 1.05, arch: 4.6, ang: -3, tp: 0.6 }, { L: 1, th: 2.1, arch: 0.4, ang: 13, tp: 0.9 }, { L: 0.95, th: 1.4, arch: 1, ang: -15, tp: 0.5 }, { L: 0.36, th: 2.9, arch: 0, ang: 4, tp: 0, dot: 1 }];
const PX = 2.3;      // 頭型的方圓程度：2 是正圓球，越大越接近方塊。正面較平，眼睛才不會像貼在球上
function context(f) {
  const s = f.s, b = id => ((s[id] == null ? MID : s[id]) - MID) / MID, C = { f }, S = SHAPES[f.fs] || SHAPES[0], E = EYES[f.eye] || EYES[0];
  // 臉型滑桿：兩端都收在「還是圓潤可愛」的範圍內；臉拉長時下巴跟著變圓，不會變成尖蛋
  const bw = b('fw'), bl = b('fl'), bc = b('fc'), bj = b('fj');
  C.sx = (S.w || 1) * (1 + bw * (bw > 0 ? 0.13 : 0.085)); C.sy = 0.94; C.sz = 0.93; C.up = 1.1; C.tp = S.tp || 1.15;
  C.len = S.len + bl * (bl > 0 ? 0.085 : 0.07); C.taper = clamp(S.taper - bj * 0.03 - Math.max(0, bl) * 0.05, 0, 0.55);
  C.ck = S.ck + bc * (bc > 0 ? 0.07 : 0.035); C.cn = Math.max(0, S.cn + bj * (bj > 0 ? 0.04 : Math.min(0.04, S.cn))); C.jw = S.jw; C.cw = (S.cw || 22) * D; C.cl = (S.cl || -72) * D;
  // 眼睛：大小、間距、高低都收在不會擠到鼻樑、不會繞到側臉的範圍
  const be = b('es'), e = 1 + be * (be > 0 ? 0.3 : 0.34), bey = b('ey'); C.E = E; C.e = e; C.ea = E.a * D * e; C.hu = E.hu * D * e; C.hl = E.hl * D * e; C.et = clamp(E.tilt + b('er') * 9, -12, 18) * D; C.dr = clamp((E.droop || 0) - b('er') * 4, -3.5, 7) * D * e;      // 角度：往上是眼尾上揚，往下是外眼角下垂
  C.ex = clamp((24 + b('ex') * 6) * D + (C.ea - 10.5 * D) * 0.45, C.ea + 6.5 * D, Math.max(C.ea + 6.5 * D, 43 * D - C.ea)); C.ey = (-13 + bey * (bey > 0 ? 5 : 6)) * D; C.ed = E.bead || E.closed ? 0.012 : 0.028; C.ir = E.iris * (C.hu + C.hl) / 2;
  C.lash = f.lash | 0; C.lt = [0.45, 0.85, 1.35][C.lash] * D * Math.sqrt(e);
  const curve = (t, h, sh, sk) => { const tt = clamp(t - sk * (1 - t * t), -1, 1), c = Math.sqrt(Math.max(0, 1 - tt * tt)); return h * lerp(c, c * c, sh); }, ct = Math.cos(C.et), st = Math.sin(C.et);
  C.drop = t => -C.dr * Math.pow(Math.max(0, (t + 0.35) / 1.35), 2);
  C.eu = E.closed ? t => C.hu * (0.55 - t * t) : E.cut ? t => C.hu * E.cut * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t), 3))) + C.drop(t) : t => curve(t, C.hu, E.su, E.sk) + C.drop(t);
  C.el = t => -curve(t, C.hl, E.sl, 0) + C.drop(t);
  // 眉毛：沿著眉毛取樣，任何一點都和上眼瞼保持距離，怎麼調都不會壓到眼睛
  const B = C.B = BROWS[f.brow] || BROWS[0], bby = b('by'), bbs = b('bs'); C.bx = (8.5 + b('bx') * 3.5) * D; C.bL = (C.ex + C.ea - C.bx + 1.5 * D) * B.L; C.bang = (B.ang + b('br') * 12) * D; C.bth = B.th * D * (1 + bbs * (bbs > 0 ? 0.6 : 0.5));
  C.bw = t => Math.max(0.0005, B.dot ? C.bth * Math.sqrt(Math.max(0.03, 1 - (2 * t - 1) * (2 * t - 1))) : C.bth * Math.sqrt(smooth(0, 0.14, t)) * lerp(1, 1 - 0.9 * B.tp, smooth(0.25, 1, t)) * Math.sqrt(Math.max(0.03, 1 - Math.pow(Math.max(0, (t - 0.9) / 0.1), 2))));
  C.bl = t => (t - 0.5) * C.bL * Math.tan(C.bang) + B.arch * D * 4 * t * (1 - t);
  const top = []; let ref = -9; for (let k = 0; k <= 16; k++) { const t = -1 + k / 8, x = C.ea * t, y = C.eu(t) + (E.closed ? C.lt : 0), q = [C.ex + x * ct - y * st, C.ey + x * st + y * ct]; top.push(q); if (q[1] > ref) ref = q[1]; }
  const topAt = lon => { let m = -9; for (let k = 0; k < 16; k++) { const p = top[k], q = top[k + 1]; if ((lon - p[0]) * (lon - q[0]) <= 0) m = Math.max(m, Math.abs(q[0] - p[0]) < 1e-6 ? Math.max(p[1], q[1]) : p[1] + (q[1] - p[1]) * (lon - p[0]) / (q[0] - p[0])); } return m; };
  C.bh = (E.closed ? C.ey + 9 * D * e : E.cut ? ref + 1.6 * D * e : ref) + (5.2 + bby * (bby > 0 ? 5 : 2.6)) * D;
  for (let k = 0; k <= 10; k++) { const t = k / 10, need = topAt(C.bx + C.bL * t) + C.bw(t) + 1.2 * D - C.bl(t); if (need > C.bh) C.bh = need; }
  // 鼻子、嘴：嘴永遠在鼻子下方留一段距離
  const bn = b('ns'), bm = b('ms'), NZ = [[0.05, 5.5, 5, 0], [0.06, 3.6, 5, 1], [0.012, 5, 5, 0], [0.095, 8, 7, 0]][f.nose | 0] || [0.05, 5.5, 5, 0];
  C.nose = f.nose | 0; C.ns = 1 + bn * (bn > 0 ? 0.55 : 0.5); C.ny = (-27.5 + b('ny') * 4) * D; C.mouth = f.mouth | 0; C.ms = 1 + bm * (bm > 0 ? 0.5 : 0.45); C.my = Math.min((-40 + b('my') * 4.5) * D, C.ny - (5.5 + NZ[2] * 0.55 * Math.sqrt(C.ns)) * D); C.mw = 10.5 * D * C.ms; C.lip = f.lipc > 0 ? 1 : 0;
  { const lowest = (-44.5 - Math.min(0, C.len) * 45) * D, gap = C.ny - C.my; if (C.my < lowest) { C.my = lowest; C.ny = Math.max(C.ny, C.my + gap); } }      // 短臉：嘴不會掉到下巴邊緣
  C.ear = 1 + b('ea') * 0.45; C.eh = -12 * D;
  const eyc = C.ey + (C.hu - C.hl) / 2, eys = Math.max(4 * D, (C.hu + C.hl) / 2);
  const base = (lon, lat) => { const cl = Math.cos(lat), x = Math.abs(cl * Math.sin(lon)), y = Math.abs(Math.sin(lat)), z = Math.abs(cl * Math.cos(lon)); return Math.pow(Math.pow(x, PX) + Math.pow(y, PX) + Math.pow(z, PX), -1 / PX); };
  // 顱骨（不含五官）
  C.skull = (lon, lat) => base(lon, lat) + C.ck * K2(lon, lat, 46 * D, -30 * D, 26 * D, 22 * D) + C.jw * K2(lon, lat, 60 * D, -48 * D, 24 * D, 17 * D) + C.cn * K(lon, lat, 0, C.cl, C.cw, 15 * D) + 0.015 * K(lon, lat, 0, 30 * D, 50 * D, 30 * D) - 0.09 * smooth(-64 * D, -90 * D, lat);
  // 五官造成的起伏：眼窩、鼻子、嘴
  C.feat = (lon, lat) => {
    let r = -C.ed * K2(lon, lat, C.ex, eyc, C.ea * 1.3, eys * 1.4) + C.ns * NZ[0] * K(lon, lat, 0, C.ny + NZ[3] * D, NZ[1] * D * Math.sqrt(C.ns), NZ[2] * D * Math.sqrt(C.ns));
    if (NZ[3]) r += C.ns * 0.03 * K(lon, lat, 0, C.ny - 2.2 * D, 3 * D, 3 * D);
    return r + 0.012 * K(lon, lat, 0, C.my + D, 16 * D * C.ms, 9 * D) + C.lip * 0.008 * (K(lon, lat, 0, C.my + 2 * D, C.mw * 0.7, 2 * D) + K(lon, lat, 0, C.my - 2.6 * D, C.mw * 0.6, 2.4 * D));
  };
  // 方向與半徑 → 位置：下半臉往下巴收窄、臉長拉伸
  const place = (lon, lat, r, o, hairLike) => {
    const cl = Math.cos(lat); let x = r * cl * Math.sin(lon) * C.sx, y = r * Math.sin(lat) * C.sy, z = r * cl * Math.cos(lon) * C.sz;
    if (y > 0) y *= lerp(1, C.up, smooth(0, 0.45, y / C.sy)); else { const t = Math.pow(smooth(0, -1, y / C.sy), C.tp) * (hairLike ? Math.min(C.taper, 0.2) : C.taper); x *= 1 - t; z *= 1 - t * 0.55; y *= 1 + C.len * smooth(0, -0.6, y / C.sy); }
    o[0] = x; o[1] = y; o[2] = z; return o;
  };
  C.pos = (lon, lat, lift, o) => place(lon, lat, C.skull(lon, lat) + C.feat(lon, lat) + lift, o);
  C.bone = (lon, lat, lift, o) => place(lon, lat, C.skull(lon, lat) + lift, o);
  // 頭髮貼合：m 是相對頭皮的倍率；耳朵以下不跟著下巴收窄，頭髮才會自然垂下
  C.hair = (lon, lat, m, o) => place(lon, lat, (base(lon, lat) + Math.max(0, C.ck) * K2(lon, lat, 46 * D, -30 * D, 26 * D, 22 * D) + Math.max(0, C.jw) * K2(lon, lat, 60 * D, -48 * D, 24 * D, 17 * D) + 0.015 * K(lon, lat, 0, 30 * D, 50 * D, 30 * D)) * m, o, true);
  C.nrm = (p, o) => { const x = p[0] / (C.sx * C.sx), y = p[1] / (C.sy * C.sy), z = p[2] / (C.sz * C.sz), l = Math.hypot(x, y, z) || 1; o[0] = x / l; o[1] = y / l; o[2] = z / l; return o; };
  return C;
}
// 經緯網格：臉的正面比較密
const NL = 112, NT = 84; let GRID = null;
function grid() {
  if (GRID) return GRID;
  const cum = (n, lo, hi, dens) => { const S = 2400, acc = new Float64Array(S + 1); for (let i = 0; i < S; i++) acc[i + 1] = acc[i] + dens(lo + (hi - lo) * (i + 0.5) / S); const out = new Float32Array(n + 1); let k = 0; for (let i = 0; i <= n; i++) { const tg = acc[S] * i / n; while (k < S - 1 && acc[k + 1] < tg) k++; out[i] = lo + (hi - lo) * (k + (acc[k + 1] > acc[k] ? (tg - acc[k]) / (acc[k + 1] - acc[k]) : 0)) / S; } out[0] = lo; out[n] = hi; return out; };
  const lon = cum(NL, -Math.PI, Math.PI, x => 1 + 1.8 * Math.exp(-(x / (55 * D)) * (x / (55 * D)))), lat = cum(NT, Math.PI / 2, -Math.PI / 2, y => 1 + 1.8 * Math.exp(-((y + 16 * D) / (36 * D)) * ((y + 16 * D) / (36 * D))));
  for (let i = 0; i <= NL / 2; i++) lon[NL - i] = -lon[i]; lon[NL / 2] = 0;
  const idx = []; for (let j = 0; j < NT; j++) for (let i = 0; i < NL; i++) { const a = j * (NL + 1) + i, b = a + 1, c = a + NL + 1, d = c + 1; if (j > 0) idx.push(a, c, b); if (j < NT - 1) idx.push(b, c, d); }
  return (GRID = { lon, lat, idx: new Uint16Array(idx) });
}
const texCache = new Map();

/* ---------- 小工具 ---------- */
const tri = (G, a, b, c) => { const P = G.pos, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az; if ((uy * vz - uz * vy) * ax + (uz * vx - ux * vz) * ay + (ux * vy - uy * vx) * az < 0) G.idx.push(a, c, b); else G.idx.push(a, b, c); };
const quad = (G, a, b, c, d) => { tri(G, a, b, c); tri(G, b, d, c); };
const put = (C, G, lon, lat, lift, col, o, q) => { C.pos(lon, lat, lift, o); G.pos.push(o[0], o[1], o[2]); C.nrm(o, q); G.nrm.push(q[0], q[1], q[2]); G.col.push(col.r, col.g, col.b); };
// 沿著臉部表面的一條帶子：pts 為 [經度, 緯度, 半寬]，浮在曲面上方 lift 的高度
function strip(C, G, pts, col, lift) {
  const n = pts.length, base = G.pos.length / 3, o = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < n; i++) { const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], cl = Math.cos(p[1]); let tx = (b[0] - a[0]) * cl, ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; for (const s of [1, -1]) put(C, G, p[0] - ty * p[2] * s / cl, p[1] + tx * p[2] * s, lift, col, o, q); }
  for (let i = 0; i < n - 1; i++) { const a = base + i * 2; quad(G, a, a + 1, a + 2, a + 3); }
}
// 貼在臉上的小圓片
function disc(C, G, lon, lat, rx, ry, col, lift) {
  const o = [0, 0, 0], q = [0, 0, 0], base = G.pos.length / 3, N = 14, cl = Math.cos(lat);
  put(C, G, lon, lat, lift, col, o, q); for (let i = 0; i < N; i++) { const a = i / N * TAU; put(C, G, lon + Math.cos(a) * rx / cl, lat + Math.sin(a) * ry, lift, col, o, q); }
  for (let i = 0; i < N; i++) tri(G, base, base + 1 + i, base + 1 + (i + 1) % N);
}
function eyeMaterial(ec, kind) {
  const k = 'eye' + ec + kind; if (texCache.has(k)) return texCache.get(k);
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), hex = FACE.eyeColor[ec] || FACE.eyeColor[0], rgb = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
  const tone = k2 => 'rgb(' + rgb.map(v => Math.round(k2 >= 0 ? v + (255 - v) * k2 : v * (1 + k2))).join(',') + ')', c = S / 2, R = S * 0.3125;
  if (kind === 'b') { g.fillStyle = '#1b151d'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c - R * 0.2, c - R * 0.26, R * 0.17, R * 0.2, -0.4, 0, TAU); g.fill(); g.globalAlpha = 0.8; g.beginPath(); g.arc(c + R * 0.2, c + R * 0.26, R * 0.07, 0, TAU); g.fill(); g.globalAlpha = 1; }
  else {
    g.fillStyle = '#f8f3ef'; g.fillRect(0, 0, S, S);
    let gr = g.createRadialGradient(c, c + R * 0.3, R * 0.05, c, c, R); gr.addColorStop(0, tone(0.42)); gr.addColorStop(0.5, tone(0.05)); gr.addColorStop(1, tone(-0.5)); g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(c, c, R, 0, TAU); g.clip();
    gr = g.createLinearGradient(0, c - R, 0, c + R * 0.25); gr.addColorStop(0, 'rgba(14,8,26,0.72)'); gr.addColorStop(1, 'rgba(14,8,26,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = '#16101c'; g.beginPath(); if (kind === 'c') g.ellipse(c, c, R * 0.17, R * 0.66, 0, 0, TAU); else g.arc(c, c, R * 0.45, 0, TAU); g.fill();
    gr = g.createRadialGradient(c, c + R * 0.62, 0, c, c + R * 0.62, R * 0.55); gr.addColorStop(0, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.restore();
    g.strokeStyle = tone(-0.72); g.lineWidth = R * 0.1; g.beginPath(); g.arc(c, c, R * 0.96, 0, TAU); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c - R * 0.36, c - R * 0.4, R * 0.25, R * 0.3, -0.4, 0, TAU); g.fill(); g.globalAlpha = 0.92; g.beginPath(); g.arc(c + R * 0.36, c + R * 0.4, R * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.2, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  texCache.set(k, m); return m;
}
function eye(C, sd, GE, GR, lashC, softC, creaseC) {
  const E = C.E, a = C.ea, ct = Math.cos(C.et), st = Math.sin(C.et), o = [0, 0, 0], at = (x, y, w) => [sd * (C.ex + x * ct - y * st), C.ey + x * st + y * ct, w], up = C.eu, lo = C.el;
  if (E.closed) {      // 瞇瞇眼：一道向上彎的弧線
    const pts = []; for (let k = 0; k <= 16; k++) { const t = -1 + k / 8; pts.push(at(a * t, up(t), Math.max(0.0005, C.lt * 1.3 * Math.sqrt(Math.max(0.04, 1 - t * t * 0.92))))); } strip(C, GR, pts, lashC, 0.012);
    if (C.lash === 2) for (const [t, dx, dy] of [[0.7, 0.55, -0.6], [0.93, 0.8, -0.3]]) strip(C, GR, [at(a * t, up(t), C.lt * 0.6), at(a * t + dx * 3.2 * D * C.e, up(t) + dy * 3.2 * D * C.e, 0.0005)], lashC, 0.012);
    return;
  }
  const NX = 24, NY = 10, xi = E.bead ? 0 : -0.05 * a, yi = E.bead ? 0 : (C.hu - C.hl) / 2 + (E.yo == null ? 0.03 : E.yo) * (C.hu + C.hl), Rt = C.ir * 1.6, base = GE.pos.length / 3;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const t = -1 + 2 * i / NX, r = j / NY, x = a * t, y = lerp(lo(t), up(t), r), p = at(x, y);
    C.pos(p[0], p[1], 0.006 + (E.bead ? 0.03 : 0.02) * (1 - t * t) * Math.pow(4 * r * (1 - r), 0.6), o); GE.pos.push(o[0], o[1], o[2]);
    GE.uv.push(0.5 + sd * (x - xi) / (2 * Rt), 0.5 + (y - yi) / (2 * Rt)); const sh = E.bead ? 1 : lerp(1, 0.6, smooth(0.5, 1, r)); GE.col.push(sh, sh, sh);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const p = base + j * (NX + 1) + i; quad(GE, p, p + 1, p + NX + 1, p + NX + 2); }
  if (E.bead) { if (C.lash === 2) strip(C, GR, [at(a * 0.55, C.hu * 0.8, C.lt * 0.5), at(a * 1.5, C.hu * 1.25, 0.0005)], lashC, 0.012); return; }
  // 上眼線（睫毛）、眼尾、下眼線、雙眼皮
  const KN = 20, pts = [], y1 = up(1), wa = clamp(0.55 - C.dr / (D * C.e) * 0.19, -0.6, 0.75); for (let k = 0; k <= KN; k++) { const t = -1 + 2 * k / KN, w = C.lt * (0.32 + 0.68 * smooth(-1, 0.1, t)); pts.push(at(a * t, up(t) + w * 0.5, w)); }
  if (C.lash === 2) { for (let m = 1; m <= 3; m++) pts.push(at(a + Math.cos(wa) * a * 0.3 * m / 3, y1 + C.lt * 0.5 * (1 - m / 3) + Math.sin(wa) * a * 0.3 * m / 3, C.lt * (1 - m / 3) * 0.95 + 0.0005)); } else pts.push(at(a * 1.05, y1 + C.lt * 0.2 + (wa < 0 ? -0.05 * a : 0), 0.0005));
  strip(C, GR, pts, lashC, 0.013);
  if (C.lash === 2) for (const t of [0.5, 0.78]) strip(C, GR, [at(a * t, up(t) + C.lt, C.lt * 0.55), at(a * (t + 0.22), up(t) + C.lt + (wa < 0 ? 1.6 : 3) * D * C.e, 0.0005)], lashC, 0.013);
  { const lp = [], lw = (C.lash ? 0.3 : 0.2) * D; for (let k = 0; k <= 10; k++) { const t = -0.3 + 1.3 * k / 10, w = lw * smooth(-0.3, 0.5, t) * (1 - 0.6 * smooth(0.8, 1, t)) + 0.0005; lp.push(at(a * t, lo(t) - w * 0.3, w)); } strip(C, GR, lp, softC, 0.011); }
  if (!E.cut) { const cp = [], off = 1.5 * D * C.e + C.lt; for (let k = 0; k <= 12; k++) { const t = -0.6 + 1.4 * k / 12; cp.push(at(a * t * 1.02, up(t) + off, 0.22 * D * Math.pow(Math.sin(Math.PI * k / 12), 0.6) + 0.0004)); } strip(C, GR, cp, creaseC, 0.006); }
}
function brow(C, sd, GR, col) {
  const pts = [], N = 14; for (let k = 0; k <= N; k++) { const t = k / N; pts.push([sd * (C.bx + C.bL * t), C.bh + C.bl(t), C.bw(t)]); }
  strip(C, GR, pts, col, 0.014);
}
function mouth(C, GR, lineC) {
  const N = 24, w = C.mw, ms = C.ms, th = 0.95 * D * Math.sqrt(ms), my = C.my, st = C.mouth;
  const line = (fn, k, wd) => { const p = []; for (let i = 0; i <= N; i++) { const t = -1 + 2 * i / N; p.push([wd * t, my + fn(t), th * k * Math.sqrt(Math.max(0.07, 1 - t * t * 0.93))]); } strip(C, GR, p, lineC, 0.009); };
  if (st === 0) line(t => 2.5 * D * ms * (t * t - 0.33), 1, w);
  else if (st === 1) line(() => 0, 1, w * 0.85);
  else if (st === 2) line(t => 1.2 * D * ms * (t * t - 0.33) - 1.9 * D * ms * Math.sin(Math.PI * Math.abs(t)) + 0.7 * D * ms, 1, w * 1.1);
  else if (st === 5) line(t => -2.3 * D * ms * (t * t - 0.33), 1, w * 0.9);
  else if (st === 4) { disc(C, GR, 0, my - 0.5 * D, 3 * D * ms, 3.5 * D * ms, lineC, 0.008); disc(C, GR, 0, my - 0.9 * D, 1.9 * D * ms, 2.2 * D * ms, new THREE.Color('#7a262c'), 0.011); }
  else {      // 開口笑：上緣、下緣之間填滿口腔，下半是舌頭
    const o = [0, 0, 0], q = [0, 0, 0], RW = 5, base = GR.pos.length / 3, inC = new THREE.Color('#5c1c22'), toC = new THREE.Color('#e06a76'), c = new THREE.Color(), upL = t => 1.3 * D * ms * (t * t - 0.33) + 0.6 * D, loL = t => upL(t) - 7 * D * ms * Math.pow(Math.max(0, 1 - t * t), 0.55);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= RW; j++) { const t = -1 + 2 * i / N, v = j / RW; c.copy(inC).lerp(toC, smooth(0.62, 0.3, v) * smooth(0.8, 0.5, Math.abs(t))); put(C, GR, w * t, my + lerp(loL(t), upL(t), v), 0.005, c, o, q); }
    for (let i = 0; i < N; i++) for (let j = 0; j < RW; j++) { const p = base + i * (RW + 1) + j; quad(GR, p, p + 1, p + RW + 1, p + RW + 2); }
    line(upL, 0.85, w); line(loL, 0.6, w);
  }
}
const earSrc = new THREE.SphereGeometry(1, 14, 10);
function ears(C, G, skin, elf) {
  const o = [0, 0, 0], sp = earSrc.attributes.position, ix = earSrc.index, dark = skin.clone().multiply(new THREE.Color(0.86, 0.74, 0.72)), c = new THREE.Color(), tk = 0.05 * C.ear, ht = 0.17 * C.ear, dp = 0.125 * C.ear, eo = (elf ? 52 : 40) * D, ce = Math.cos(eo), se = Math.sin(eo);
  for (const sd of [1, -1]) {
    C.bone(sd * 93 * D, C.eh, -0.04, o); const base = G.pos.length / 3, dx = sd * se, dz = -ce, tx = sd * ce, tz = se, cx = o[0] + dx * dp * 0.5, cy = o[1], cz = o[2] + dz * dp * 0.5;
    for (let i = 0; i < sp.count; i++) {
      let X = sp.getX(i), Y = sp.getY(i), Z = sp.getZ(i); const dent = X > 0 ? Math.exp(-((Y + 0.08) * (Y + 0.08) * 2.6 + Z * Z * 3.4)) : 0; X -= dent * 0.45;
      if (elf && Y > -0.2) { const k = (Y + 0.2) * (Y + 0.2); Z = Z * (1 - 0.5 * smooth(-0.2, 1, Y)) + k * 1.25; Y += k * 1.5; X *= 1 - 0.3 * smooth(0, 1.6, Y); }
      Z += 0.16 * Y; G.pos.push(cx + tx * X * tk + dx * Z * dp, cy + Y * ht, cz + tz * X * tk + dz * Z * dp); c.copy(skin).lerp(dark, dent * 0.8); G.col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < ix.count; i += 3) { const a = base + ix.getX(i), b = base + ix.getX(i + 1), d = base + ix.getX(i + 2); if (sd > 0) G.idx.push(a, b, d); else G.idx.push(a, d, b); }
  }
}

/* ---------- 頭髮：整塊有厚度的髮片，邊緣是一個個尖角；長髮由同一張面往下延伸；馬尾是圓滾滾的髮束 ---------- */
const triw = x => { const f = x - Math.floor(x); return 1 - 2 * Math.abs(f - 0.5); };
// 髮片邊緣：正面 f、側面 s、後面 b 三段的緯度（度）；tips 為 [起, 迄, 尖角寬, 深度, 相位]（以經度絕對值分段）。回傳的函式另帶 tip(lon)：這個方向上髮尖的程度 0–1
const edgeFn = o => {
  const tip = lon => { const a = Math.abs(lon); let d = 0, k = 0; for (const [a0, a1, w, dep, ph] of o.tips || []) if (a >= a0 - 6 && a <= a1 + 6) { const q = triw(lon / w + (ph || 0)) * smooth(a0 - 6, a0 + 2, a) * smooth(a1 + 6, a1 - 2, a); if (dep * q > d) { d = dep * q; k = q; } } return [d, k]; };
  const fn = lon => { const a = Math.abs(lon); let e = typeof o.f === 'function' ? o.f(lon) : o.f; e = lerp(e, o.s, smooth((o.fs || 52) - 9, (o.fs || 52) + 9, a)); e = lerp(e, o.b, smooth((o.sb || 118) - 16, (o.sb || 118) + 16, a)); return e - tip(lon)[0]; };
  fn.tip = lon => tip(lon)[1]; return fn;
};
// r 相對頭皮的倍率、puff 中段蓬起、r1 髮尾外翹、gv 髮束的起伏（跟著髮尖，或用 gw 指定固定寬度）、hang 邊緣往下垂成長髮 { from, bottom(lon), flare, tuck, back }、spike(lon, lat) 往外隆起的尖刺、sweep 尖刺往後上方掃
function shell(C, G, o) {
  const step = 2.5, NC = Math.round(360 / step), NR = o.rows || 13, H = o.hang, NE = H ? 9 : 0, base = G.pos.length / 3, p = [0, 0, 0], W = NR + NE + 2, gv = o.gv || 0;
  for (let i = 0; i < NC; i++) {
    const lon = -180 + step * i, e = o.edge(lon), puff = typeof o.puff === 'function' ? o.puff(lon) : o.puff || 0, gt = gv ? (o.gw ? triw(lon / o.gw + (o.gp || 0)) : o.edge.tip(lon)) - 0.5 : 0; let m = o.r;
    for (let j = 0; j <= NR; j++) { const v = j / NR, lat = lerp(90, e, v), gk = gt * smooth(0.12, 0.75, v); const sp = o.spike ? o.spike(lon * D, clamp(lat, -89, 90) * D) : 0; m = o.r + puff * Math.sin(Math.PI * v) + (o.r1 || 0) * v * v * v + gv * gk + sp; C.hair(lon * D, clamp(lat, -89, 90) * D, m, p); if (sp) { p[1] += sp * sp * (o.sweep || 0); p[2] -= sp * sp * (o.sweep || 0) * 0.8; } G.pos.push(p[0], p[1], p[2]); G.shade.push(0.94 + 0.1 * Math.exp(-((lat - 50) / 11) * ((lat - 50) / 11)) - 0.1 * v * v * v + gk * 0.12 + sp * 0.22); }
    const ex = p[0], ey = p[1], ez = p[2]; C.hair(lon * D, clamp(e + 1.5, -89, 90) * D, m - 0.085, p);      // 邊緣往內折，髮片才有厚度
    if (H) {
      const L = smooth(H.from - 8, H.from + 8, Math.abs(lon)), yb = lerp(ey, H.bottom(lon), L);
      for (let k = 1; k <= NE; k++) { const t = k / NE, kk = 1 + ((H.flare || 0) * Math.sin(t * Math.PI * 0.85) - (H.tuck || 0) * t * t) * L; G.pos.push(ex * kk, lerp(ey, yb, t), ez * kk - (ez < 0 ? (H.back || 0) * Math.sin(t * Math.PI) * L : 0)); G.shade.push(lerp(0.84, 0.72, t) + gt * 0.12); }
      const kk = (1 - (H.tuck || 0)) * 0.93; p[0] = lerp(p[0], ex * kk, L); p[1] = lerp(p[1], yb + 0.025, L); p[2] = lerp(p[2], ez * kk, L);
    }
    G.pos.push(p[0], p[1], p[2]); G.shade.push(0.7);
  }
  for (let i = 0; i < NC; i++) for (let j = 0; j < W - 1; j++) { const a = base + i * W + j, b = base + ((i + 1) % NC) * W + j; G.idx.push(a, a + 1, b, b, a + 1, b + 1); }
}
// 一束圓滾滾的頭髮（馬尾）：沿著 pts 的管子，半徑依 rad(t)；ref 是截面橫向的參考方向，wx／wn 為橫向與厚度的倍率；t0–t1 只做其中一段
function tuft(G, pts, rad, ref, wx = 1, wn = 1, t0 = 0, t1 = 1) {
  const cv = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), n = 14, SEG = 10, base = G.pos.length / 3, T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = lerp(t0, t1, i / n), r = Math.max(0.004, rad(t)); cv.getPoint(t, q); cv.getTangent(t, T); B.copy(ref).addScaledVector(T, -ref.dot(T)).normalize(); N.crossVectors(T, B).normalize();
    for (let k = 0; k < SEG; k++) { const a = k / SEG * TAU; P.copy(q).addScaledVector(B, Math.cos(a) * r * wx).addScaledVector(N, Math.sin(a) * r * wn); G.pos.push(P.x, P.y, P.z); G.shade.push(lerp(1.02, 0.84, t) * (0.97 + 0.05 * Math.cos(a * 2))); }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < SEG; k++) { const a = base + i * SEG + k, b = base + i * SEG + (k + 1) % SEG, c = a + SEG, d = b + SEG; G.idx.push(a, b, c, b, d, c); }
  const c0 = G.pos.length / 3; cv.getPoint(t0, q); G.pos.push(q.x, q.y, q.z); G.shade.push(1); for (let k = 0; k < SEG; k++) G.idx.push(c0, base + (k + 1) % SEG, base + k);
  const c1 = G.pos.length / 3; cv.getPoint(t1, q); cv.getTangent(t1, T); q.addScaledVector(T, t1 < 1 ? 0 : rad(t1) * 1.5); G.pos.push(q.x, q.y, q.z); G.shade.push(0.8); for (let k = 0; k < SEG; k++) G.idx.push(c1, base + n * SEG + k, base + n * SEG + (k + 1) % SEG);
}
// 八字鬍用的扁平髮束：沿著 pts 的錐狀管
function lock(G, pts, w0, w1, th, round = 0) {
  const n = pts.length, SEG = 8, base = G.pos.length / 3, T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = i / (n - 1);
    T.subVectors(b, a).normalize(); N.copy(p).normalize(); N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N).normalize();
    const taper = round ? Math.sin(Math.min(1, t * 1.9) * Math.PI / 2) * (t > 0.6 ? Math.cos((t - 0.6) / 0.4 * Math.PI / 2) * 0.9 + 0.1 : 1) : 1, w = lerp(w0, w1, Math.pow(t, 1.3)) * taper * (i === n - 1 ? 0.5 : 1), h = (round ? w * round : th * lerp(1, 0.6, t)) * (i === n - 1 ? 0.5 : 1);
    for (let k = 0; k < SEG; k++) { const a2 = k / SEG * TAU; P.copy(p).addScaledVector(B, Math.cos(a2) * w).addScaledVector(N, Math.sin(a2) * h + h * 0.55); G.pos.push(P.x, P.y, P.z); G.shade.push(lerp(0.9, 1.04, 1 - t) * (Math.sin(a2) > 0 ? 1.03 : 0.9)); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < SEG; k++) { const a = base + i * SEG + k, b = base + i * SEG + (k + 1) % SEG, c = a + SEG, d = b + SEG; G.idx.push(a, c, b, b, c, d); }
  const c0 = G.pos.length / 3; G.pos.push(pts[0].x, pts[0].y, pts[0].z); G.shade.push(1); for (let k = 0; k < SEG; k++) G.idx.push(c0, base + k, base + (k + 1) % SEG);
  const c1 = G.pos.length / 3, e = pts[n - 1], e2 = pts[n - 2]; G.pos.push(e.x + (e.x - e2.x) * 0.25, e.y + (e.y - e2.y) * 0.25, e.z + (e.z - e2.z) * 0.25); G.shade.push(0.86); for (let k = 0; k < SEG; k++) G.idx.push(c1, base + (n - 1) * SEG + (k + 1) % SEG, base + (n - 1) * SEG + k);
}
const blobSrc = new THREE.SphereGeometry(1, 16, 12);
function blob(G, c, rx, ry, rz, sh = 0.95) {
  const p = blobSrc.attributes.position, base = G.pos.length / 3, ix = blobSrc.index;
  for (let i = 0; i < p.count; i++) { G.pos.push(c.x + p.getX(i) * rx, c.y + p.getY(i) * ry, c.z + p.getZ(i) * rz); G.shade.push(sh + p.getY(i) * 0.09); }
  for (let i = 0; i < ix.count; i++) G.idx.push(base + ix.getX(i));
}
const toGeo = G => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setIndex(G.idx); const col = new Float32Array(G.shade.length * 3); for (let i = 0; i < G.shade.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = G.shade[i]; g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; };
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
// 回傳 [主體, 頭頂的突出物]：後者（丸子、翹起的髮尖）戴帽子時由 actors.js 隱藏，才不會穿出帽子
function hairGeo(C, style) {
  const G = { pos: [], idx: [], shade: [] }, X = { pos: [], idx: [], shade: [] }, V = (lon, lat, m) => { const p = [0, 0, 0]; C.hair(lon * D, lat * D, m, p); return new THREE.Vector3(p[0], p[1], p[2]); }, off = (a, x, y, z) => new THREE.Vector3(a.x + x, a.y + y, a.z + z);
  const TIPS = [[0, 50, 21, 13, 0.5], [56, 100, 22, 12, 0.2], [112, 180, 24, 9, 0]], TEETH = [[0, 44, 11, 3.5, 0.5]];
  const fat = (t, R) => R * (t < 0.3 ? lerp(0.45, 1, smooth(0, 0.3, t)) : lerp(1, 0.07, Math.pow((t - 0.3) / 0.7, 1.7)));
  switch (style) {
    case 1: {    // 刺蝟頭：整頂頭髮隆起成一根根粗短的尖刺，往後上方翹
      const SP = [[0, 86, 0.46, 50], [20, 56, 0.42, 46], [92, 58, 0.44, 48], [164, 58, 0.46, 48], [236, 58, 0.46, 48], [308, 58, 0.44, 48], [62, 22, 0.36, 40], [116, 22, 0.4, 44], [180, 24, 0.42, 46], [244, 22, 0.4, 44], [298, 22, 0.36, 40], [104, -12, 0.26, 34], [148, -14, 0.32, 38], [212, -14, 0.32, 38], [256, -12, 0.26, 34]].map(([lo, la, A, w]) => [Math.cos(la * D) * Math.sin(lo * D), Math.sin(la * D), Math.cos(la * D) * Math.cos(lo * D), A, w * D, Math.cos(w * D)]);
      const spike = (lon, lat) => { const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon); let m = 0; for (const q of SP) { const dt = x * q[0] + y * q[1] + z * q[2]; if (dt > q[5]) m = Math.max(m, q[3] * Math.pow(1 - Math.acos(Math.min(1, dt)) / q[4], 1.12)); } return m; }, edge = edgeFn({ f: 22, s: 0, b: -44, tips: [[0, 180, 30, 17, 0.5]] });
      shell(C, G, { r: 1.045, rows: 10, edge }); shell(C, X, { r: 1.06, r1: 0.05, rows: 24, spike, sweep: 0.5, edge }); break;      // 戴帽子時只留下貼頭的那一層
    }
    case 2: shell(C, G, { r: 1.09, puff: 0.03, gv: 0.03, edge: edgeFn({ f: lon => lerp(31, 5, smooth(-52, 46, lon)), s: 0, b: -46, tips: [[0, 52, 36, 9, 0.3], [56, 100, 22, 11, 0.2], [112, 180, 24, 9, 0]] }) }); break;
    case 3: shell(C, G, { r: 1.09, puff: 0.035, edge: edgeFn({ f: lon => 44 - 50 * Math.pow(smooth(0, 60, Math.abs(lon)), 0.8), s: -24, fs: 66, b: -48, tips: [[104, 180, 26, 7, 0]] }) }); break;
    case 4:      // 後梳：髮際線有個小美人尖，髮流由前往後
      shell(C, G, { r: 1.09, puff: lon => 0.05 + 0.035 * smooth(50, 150, Math.abs(lon)), r1: 0.02, gv: 0.022, gw: 20, edge: edgeFn({ f: lon => 28 + 7 * smooth(3, 36, Math.abs(lon)), s: 4, fs: 56, b: -42, tips: [[112, 180, 22, 9, 0.5]] }) }); break;
    case 5: shell(C, G, { r: 1.1, puff: 0.05, r1: -0.03, edge: edgeFn({ f: 9, s: -44, fs: 52, b: -48, tips: TEETH }) }); break;
    case 6:      // 長直髮：兩側與後面往下垂到肩膀
      shell(C, G, { r: 1.09, puff: 0.03, gv: 0.022, gw: 26, edge: edgeFn({ f: 9, s: 2, b: 0, tips: TEETH }), hang: { from: 58, bottom: lon => -1.72 + 0.13 * (1 - triw(lon / 26)) + 0.3 * smooth(100, 60, Math.abs(lon)), flare: 0.05, tuck: 0.06, back: 0.05 } }); break;
    case 7:      // 馬尾：髮圈綁在後腦勺上方，一束往下垂
      shell(C, G, { r: 1.085, puff: 0.02, gv: 0.03, edge: edgeFn({ f: 21, s: 6, b: -38, tips: TIPS }) });
      { const a = V(180, 40, 1.08), pts = [a, off(a, 0, 0.07, -0.15), off(a, 0, -0.1, -0.31), off(a, 0, -0.5, -0.37), off(a, 0, -0.95, -0.31), off(a, 0, -1.35, -0.23), off(a, 0, -1.62, -0.2)], rd = t => fat(t, 0.28); blob(X, off(a, 0, 0.03, -0.07), 0.17, 0.15, 0.13, 0.62); tuft(X, pts, t => rd(t) * 0.97, AX, 1.12, 0.8, 0, 0.56); tuft(G, pts, rd, AX, 1.12, 0.8, 0.52, 1); } break;
    case 8:      // 雙馬尾
      shell(C, G, { r: 1.09, puff: 0.03, edge: edgeFn({ f: 9, s: 2, b: -44, tips: TEETH.concat([[56, 100, 22, 12, 0.2]]) }) });
      for (const sd of [1, -1]) { const a = V(sd * 100, 33, 1.08), pts = [a, off(a, sd * 0.2, 0.08, -0.02), off(a, sd * 0.4, -0.08, -0.04), off(a, sd * 0.5, -0.52, -0.04), off(a, sd * 0.47, -1.02, 0), off(a, sd * 0.4, -1.42, 0.03), off(a, sd * 0.34, -1.7, 0.05)], rd = t => fat(t, 0.22); blob(X, off(a, sd * 0.07, 0.02, 0), 0.13, 0.15, 0.15, 0.62); tuft(X, pts, t => rd(t) * 0.97, AZ, 0.9, 1.05, 0, 0.56); tuft(G, pts, rd, AZ, 0.9, 1.05, 0.52, 1); } break;
    case 9:      // 丸子頭：頭頂兩側各一顆
      shell(C, G, { r: 1.085, puff: 0.02, gv: 0.03, edge: edgeFn({ f: 21, s: 4, b: -44, tips: TIPS }) }); for (const sd of [-1, 1]) blob(X, V(sd * 112, 46, 1.18), 0.3, 0.28, 0.3); break;
    case 10: shell(C, G, { r: 1.03, rows: 12, edge: edgeFn({ f: 37, s: 22, b: -38 }) }); break;
    default: shell(C, G, { r: 1.085, puff: 0.02, gv: 0.03, edge: edgeFn({ f: 21, s: 2, b: -46, tips: TIPS }) });
  }
  return [toGeo(G), X.pos.length ? toGeo(X) : null];
}
function beardGeo(C, style) {
  if (style < 2) return null;
  const G = { pos: [], idx: [], shade: [] }, o = [0, 0, 0], V = (lon, lat, lift) => { C.pos(lon, lat, lift, o); return new THREE.Vector3(o[0], o[1], o[2]); };
  if (style === 2 || style === 4) for (const sd of [1, -1]) lock(G, [V(sd * D, C.my + 5.2 * D, 0.008), V(sd * C.mw * 0.5, C.my + 5 * D, 0.02), V(sd * C.mw * 1.05, C.my + 3 * D, 0.02), V(sd * (C.mw + 6 * D), C.my - 4 * D, 0.012)], 0.085, 0.018, 0.04);
  // 貼著下顎的鬍子：臉上的部分沿曲面隆起，下巴底下接一個圓弧形收尾。大鬍子包到耳前，山羊鬍只有下巴中間一撮
  const jaw = (LM, topFn, hangFn, lift, fwd) => {
    const NC = style === 4 ? 44 : 16, NF = 7, NB = 6, Wd = NF + NB + 1, base = G.pos.length / 3, JL = -62 * D;
    for (let i = 0; i <= NC; i++) {
      const lon = lerp(-LM, LM, i / NC) * D, al = Math.abs(lon), top = topFn(al), front = smooth(LM * 0.93 * D, LM * 0.15 * D, al), side = smooth(LM * D, LM * 0.82 * D, al);
      for (let j = 0; j <= NF; j++) { const u = j / NF; C.pos(lon, lerp(top, JL, u), 0.006 + lift * Math.pow(Math.sin(Math.PI * clamp(u * 0.5 + 0.03, 0, 1)), 0.7) * side, o); G.pos.push(o[0], o[1], o[2]); G.shade.push(lerp(1.04, 0.94, u)); }
      const x0 = o[0], y0 = o[1], z0 = o[2], hang = hangFn(front) * side;
      for (let k = 1; k <= NB; k++) { const ph = k / NB * Math.PI / 2, c = Math.pow(Math.cos(ph), 0.6), sn = Math.sin(ph); G.pos.push(x0 * c, y0 - hang * sn, z0 * c + fwd * front * sn); G.shade.push(lerp(0.94, 0.8, k / NB)); }
    }
    for (let i = 0; i < NC; i++) for (let j = 0; j < Wd - 1; j++) { const a = base + i * Wd + j, b = a + Wd; G.idx.push(a, a + 1, b, b, a + 1, b + 1); }
  };
  if (style === 3) jaw(27, () => C.my - 6 * D, fr => 0.05 + 0.24 * fr * fr, 0.1, 0.12);
  if (style === 4) jaw(102, al => lerp(C.my - 5 * D, lerp(C.my + 5.5 * D, 0, smooth(C.mw + 14 * D, 96 * D, al)), smooth(C.mw + 2 * D, C.mw + 14 * D, al)), fr => 0.1 + 0.26 * fr, 0.085, 0.1);
  return toGeo(G);
}

/* ---------- 組合 ---------- */
export const HEAD_R = 0.52;           // 頭部 1 單位對應角色模型的長度
let LM = null; const lineMat = () => LM || (LM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const geoOf = (G, nrm) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3)); if (G.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2)); if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nrm, 3)); g.setIndex(G.idx); if (!nrm) g.computeVertexNormals(); return g; };
// 回傳以頭部中心為原點的群組（+z 為臉的方向）；userData 帶著頭頂、下巴底、半寬，給掛帽子與接脖子用。
// mats 收集受擊閃光要改動的材質；own 收集這顆頭專用、換臉時要釋放的資源
export function buildHead(f, mats, own) {
  const g = new THREE.Group(), C = context(f), GD = grid(), W1 = NL + 1, n = W1 * (NT + 1), P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), col = new Float32Array(n * 3), o = [0, 0, 0], keep = x => { own && own.push(x); return x; };
  const skin = new THREE.Color(FACE.skin[f.skin] || FACE.skin[1]), hc = new THREE.Color(FACE.hairColor[f.hc] || FACE.hairColor[0]), lip = new THREE.Color(FACE.lipColor[f.lipc] || FACE.lipColor[1]);
  const blush = new THREE.Color(Math.min(1, skin.r + 0.1), skin.g * 0.55, skin.b * 0.6), under = new THREE.Color(skin.r * 0.8, skin.g * 0.62, skin.b * 0.58), stub = skin.clone().multiplyScalar(0.6).lerp(new THREE.Color(0.2, 0.23, 0.29), 0.5).lerp(hc, 0.18), c = new THREE.Color();
  const stubble = f.beard === 1, soft = f.blush === 1, ckLon = C.ex + 5 * D, ckLat = C.ey - C.hl - 7 * D, bigNose = C.nose === 3;
  let top = -9, bottom = 9, halfW = 0;
  for (let j = 0; j <= NT; j++) for (let i = 0; i <= NL; i++) {
    const k = (j * W1 + i) * 3, lon = GD.lon[i], lat = GD.lat[j]; C.pos(lon, lat, 0, o); P[k] = o[0]; P[k + 1] = o[1]; P[k + 2] = o[2]; if (o[1] > top) top = o[1]; if (o[1] < bottom) bottom = o[1]; if (o[0] > halfW) halfW = o[0];
    c.copy(skin);
    if (Math.abs(lon) < 1.9 && lat < 0.6) {
      if (soft) { const wb = Math.min(0.6, 0.55 * K2(lon, lat, ckLon, ckLat, 11 * D, 7.5 * D)); if (wb > 0.002) c.lerp(blush, wb); }
      if (C.lip) { const wl = 0.78 * Math.min(1, 0.85 * K(lon, lat, 0, C.my + 2.2 * D, C.mw * 0.72, 2.1 * D) + K(lon, lat, 0, C.my - 2.8 * D, C.mw * 0.62, 2.6 * D)); if (wl > 0.002) c.lerp(lip, wl); }
      if (C.nose !== 2) { const wn = 0.1 * Math.min(1, C.ns) * K(lon, lat, 0, C.ny - 5 * D * Math.sqrt(C.ns), 4.6 * D, 2 * D); if (wn > 0.002) c.lerp(under, wn); }
      if (bigNose) { const wp = 0.17 * K(lon, lat, 0, C.ny, 6.5 * D * Math.sqrt(C.ns), 5.5 * D * Math.sqrt(C.ns)); if (wp > 0.002) c.lerp(blush, wp); }
      if (stubble) { const wst = 0.7 * Math.max(smooth(lerp(-25, -6, smooth(40 * D, 95 * D, Math.abs(lon))) * D, lerp(-36, -18, smooth(40 * D, 95 * D, Math.abs(lon))) * D, lat) * smooth(-88 * D, -74 * D, lat) * smooth(112 * D, 90 * D, Math.abs(lon)) * (1 - Math.min(1, K(lon, lat, 0, C.my - D, C.mw * 1.1, 3.6 * D))), 0.85 * K(lon, lat, 0, C.my + 5.5 * D, C.mw * 1.4, 2.6 * D)); if (wst > 0.002) c.lerp(stub, wst); }
    }
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  for (let j = 0; j <= NT; j++) for (let i = 0; i <= NL; i++) {
    const k = (j * W1 + i) * 3; if (j === 0 || j === NT) { Nn[k + 1] = j ? -1 : 1; continue; }
    const a = (j * W1 + (i === NL ? 1 : i + 1)) * 3, b = (j * W1 + (i === 0 ? NL - 1 : i - 1)) * 3, d = ((j + 1) * W1 + i) * 3, e = ((j - 1) * W1 + i) * 3;
    const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2], vx = P[d] - P[e], vy = P[d + 1] - P[e + 1], vz = P[d + 2] - P[e + 2], nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux, l = Math.hypot(nx, ny, nz) || 1; Nn[k] = nx / l; Nn[k + 1] = ny / l; Nn[k + 2] = nz / l;
  }
  const geo = keep(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(GD.idx, 1));
  const sm = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0 })); sm.userData.em = skin.clone().multiplyScalar(0.07); mats && mats.push(sm);
  const head = new THREE.Mesh(geo, sm); head.castShadow = true; g.add(head);
  const hm = keep(new THREE.MeshStandardMaterial({ color: hc, roughness: 0.5, metalness: 0.03, vertexColors: true, side: THREE.DoubleSide })); hm.userData.em = hc.clone().multiplyScalar(0.06); mats && mats.push(hm);
  // 脖子與耳朵
  const GS = { pos: [], col: [], idx: [] }; if (f.ear !== 2) ears(C, GS, skin, f.ear === 1);      // 有獸耳就不再畫人耳
  { const cg = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 14, 1, true), p = cg.attributes.position, ix = cg.index, base = GS.pos.length / 3, sh = skin.clone().multiplyScalar(0.9); for (let i = 0; i < p.count; i++) { GS.pos.push(p.getX(i), p.getY(i) + bottom - 0.25, p.getZ(i) - 0.03); GS.col.push(sh.r, sh.g, sh.b); } for (let i = 0; i < ix.count; i++) GS.idx.push(base + ix.getX(i)); cg.dispose(); }
  const sk2 = new THREE.Mesh(keep(geoOf(GS)), sm); sk2.castShadow = true; g.add(sk2);
  if (f.ear === 2) {      // 獸耳：頭頂兩隻立體的三角耳（正面一片、背面鼓起），外側是髮色，內側粉色
    const GK = { pos: [], idx: [], shade: [] }, GI = { pos: [], col: [], idx: [] }, kem = new THREE.Group(), pk = skin.clone().lerp(new THREE.Color('#ff9aa8'), 0.6), p = [0, 0, 0]; kem.name = 'kemono';
    const face = (a, b, c2, sh) => { const b0 = GK.pos.length / 3; for (const v of [a, b, c2]) { GK.pos.push(v.x, v.y, v.z); GK.shade.push(sh); } GK.idx.push(b0, b0 + 1, b0 + 2); };
    for (const sd of [1, -1]) {
      C.hair(sd * 40 * D, 54 * D, 0.97, p); const B0 = new THREE.Vector3(p[0], p[1], p[2]), up = B0.clone().normalize().lerp(new THREE.Vector3(sd * 0.25, 1, 0), 0.5).normalize(), fw = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z).normalize(), sdv = new THREE.Vector3().crossVectors(up, fw).normalize(), w = 0.31 * C.ear, h = 0.64 * C.ear;
      const L = B0.clone().addScaledVector(sdv, w), R = B0.clone().addScaledVector(sdv, -w), T = B0.clone().addScaledVector(up, h).addScaledVector(fw, -0.04), Bk = B0.clone().addScaledVector(fw, -0.27 * C.ear).addScaledVector(up, 0.02);
      face(L, R, T, 1); face(L, T, Bk, 0.9); face(Bk, T, R, 0.8);
      const mid = L.clone().add(R).multiplyScalar(0.5), i0 = GI.pos.length / 3; for (const v of [L.clone().lerp(mid, 0.3).lerp(T, 0.12), R.clone().lerp(mid, 0.3).lerp(T, 0.12), T.clone().lerp(mid, 0.3)]) { v.addScaledVector(fw, 0.012); GI.pos.push(v.x, v.y, v.z); GI.col.push(pk.r, pk.g, pk.b); } GI.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 1);
    }
    const km = new THREE.Mesh(keep(toGeo(GK)), hm); km.castShadow = true; kem.add(km, new THREE.Mesh(keep(geoOf(GI)), sm)); g.add(kem);
  }
  // 眼睛、睫毛、眉毛、嘴、腮紅、特徵
  const GE = { pos: [], uv: [], col: [], idx: [] }, GR = { pos: [], nrm: [], col: [], idx: [] }, lashC = hc.clone().multiplyScalar(0.3).lerp(new THREE.Color('#1c1418'), 0.6), softC = skin.clone().multiply(new THREE.Color(0.62, 0.46, 0.44)), creaseC = skin.clone().multiply(new THREE.Color(0.8, 0.64, 0.6)), browC = hc.clone().multiplyScalar(0.62), lineC = skin.clone().multiply(new THREE.Color(0.4, 0.2, 0.2));
  for (const sd of [1, -1]) { eye(C, sd, GE, GR, lashC, softC, creaseC); brow(C, sd, GR, browC); }
  mouth(C, GR, lineC);
  if (C.nose === 2) disc(C, GR, 0, C.ny, 1.15 * D * C.ns, 0.8 * D * C.ns, softC, 0.008);
  if (f.blush >= 2) { const bc = skin.clone().lerp(blush, 0.62); for (const sd of [1, -1]) { if (f.blush === 2) disc(C, GR, sd * ckLon, ckLat, 6.4 * D, 3.9 * D, bc, 0.005); else for (let k = -1; k <= 1; k++) strip(C, GR, [[sd * (ckLon + k * 2.8 * D - 1.2 * D), ckLat - 2.2 * D, 0.5 * D], [sd * (ckLon + k * 2.8 * D + 1.2 * D), ckLat + 2.2 * D, 0.5 * D]], bc, 0.007); } }
  if (f.mark === 1) { const fc = skin.clone().multiply(new THREE.Color(0.72, 0.5, 0.4)); for (const [x, y] of [[0, 3.2], [5, 1.4], [-5, 1.6], [10, 2.6], [-10, 2.2], [15, 1.2], [-15, 1.5], [20, 2.8], [-20, 2.4], [7.5, 4.2], [-12.5, 4.4]]) disc(C, GR, x * D, C.ey - C.hl - (1.5 + y) * D, 0.75 * D, 0.75 * D, fc, 0.006); }
  if (f.mark === 2) disc(C, GR, C.ex + C.ea * 0.7, C.ey - C.hl - 3.2 * D, 1 * D, 1 * D, new THREE.Color('#3a2622'), 0.008);
  if (f.mark === 3) strip(C, GR, [[C.ex - 4 * D, C.bh + 5 * D, 0.0006], [C.ex - 2 * D, C.bh + 1 * D, 0.7 * D], [C.ex + 1.5 * D, C.ey - C.hl - 3 * D, 0.7 * D], [C.ex + 3 * D, C.ey - C.hl - 7.5 * D, 0.0006]], skin.clone().lerp(new THREE.Color('#ff9c8c'), 0.55).multiplyScalar(0.92), 0.017);
  if (GE.pos.length) { const eyes = new THREE.Mesh(keep(geoOf(GE)), eyeMaterial(f.ec, C.E.bead ? 'b' : C.E.cat ? 'c' : 'n')); eyes.name = 'eyes'; g.add(eyes); }
  g.add(new THREE.Mesh(keep(geoOf(GR, true)), lineMat()));
  // 頭髮與鬍子
  const hg = hairGeo(C, f.hair | 0), hair = new THREE.Mesh(keep(hg[0]), hm); hair.name = 'hair'; hair.castShadow = true; g.add(hair);
  if (hg[1]) { const ht = new THREE.Mesh(keep(hg[1]), hm); ht.name = 'hairTop'; ht.castShadow = true; hair.add(ht); }
  const bg = beardGeo(C, f.beard | 0); if (bg) { const bm = new THREE.Mesh(keep(bg), hm); bm.name = 'beard'; g.add(bm); }
  g.userData.top = top; g.userData.bottom = bottom; g.userData.halfW = halfW;
  return g;
}
