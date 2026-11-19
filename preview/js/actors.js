// 角色（Q 版模型與動作）、怪物（程式生成的四足動物）、特效與世界標籤
import * as THREE from './three.bundle.js';
import { SkeletonUtils } from './three.bundle.js';
import { TAU, clamp, lerp, damp, easeOut, smooth, MON, MST } from './core.js';
import { FACE, buildHead, defaultFace, encodeFace, decodeFace, randomFace, HEAD_R } from './face.js';
import { W, loadPack, Hgt } from './world.js';
import { mergeColored, arrowGeo } from './fx.js';

/* ============================== 角色 ============================== */
// 身體沿用 KayKit 的四套服裝與骨架動作；頭、臉、髮型自製；武器、帽子、披風可跨服裝搭配
export const BODIES = { knight: { file: 'Knight', name: '騎士鎧甲', base: 350 }, barbarian: { file: 'Barbarian', name: '獸皮戰衣', base: 205 }, mage: { file: 'Mage', name: '法師長袍', base: 245 }, rogue: { file: 'Rogue', name: '斥候輕裝', base: 160 } };
export const BODY_KEYS = Object.keys(BODIES);
export const WEAPONS = [
  { name: '單手劍＋圓盾', src: 'knight', show: ['1H_Sword', 'Round_Shield'], set: '1h' }, { name: '單手劍＋方盾', src: 'knight', show: ['1H_Sword', 'Rectangle_Shield'], set: '1h' }, { name: '雙手劍', src: 'knight', show: ['2H_Sword'], set: '2h' }, { name: '雙劍', src: 'knight', show: ['1H_Sword', '1H_Sword_Offhand'], set: 'dual' },
  { name: '單手斧＋圓盾', src: 'barbarian', show: ['1H_Axe', 'Barbarian_Round_Shield'], set: '1h' }, { name: '雙手斧', src: 'barbarian', show: ['2H_Axe'], set: '2h' }, { name: '雙斧', src: 'barbarian', show: ['1H_Axe', '1H_Axe_Offhand'], set: 'dual' },
  { name: '長杖', src: 'mage', show: ['2H_Staff'], set: '2h' }, { name: '短杖＋魔導書', src: 'mage', show: ['1H_Wand', 'Spellbook_open'], set: '1h' },
  { name: '雙匕首', src: 'rogue', show: ['Knife', 'Knife_Offhand'], set: 'dual' }, { name: '單匕首', src: 'rogue', show: ['Knife'], set: '1h' },
  { name: '獵弓', src: 'bow', show: [], set: 'bow' }      // 新武器一律加在最後，存檔裡的武器編號才不會變
];
export const HATS = [{ name: '不戴' }, { name: '騎士頭盔', src: 'knight', node: 'Knight_Helmet' }, { name: '巫師帽', src: 'mage', node: 'Mage_Hat' }, { name: '獸骨盔', src: 'barbarian', node: 'Barbarian_Hat' }];
// 披風：五種形狀不同的款式（程式生成，掛在胸口骨頭上），顏色另外選
export const CAPES = [{ name: '不披' }, { name: '短披風' }, { name: '長披風' }, { name: '單肩披風' }, { name: '毛皮披肩' }, { name: '破斗篷' }];
export const CAPE_COLORS = ['#b8322e', '#2f5fb0', '#2f8a4e', '#6b3fa0', '#c9a233', '#e8e2d2', '#2b2b33', '#7a4a2a', '#c2577a', '#3a8d92'];
const capeCache = new Map(), capeMats = new Map();
function capeGeo(style) {
  if (capeCache.has(style)) return capeCache.get(style);
  const pos = [], shade = [], idx = [], NC = 44, NR = 12, tw = x => { const f = x - Math.floor(x); return 1 - 2 * Math.abs(f - 0.5); }, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // 一片布：a0–a1 為繞身體的角度（0 是正後方，正值往角色左側）；top 上緣、bot 下緣（以肩線為 0）；flare 下襬外擴；fold 皺褶；narrow 越往下越收到背後
  const sheet = o => {
    const base = pos.length / 3;
    for (let i = 0; i <= NC; i++) { const u = i / NC, a = lerp(o.a0, o.a1, u) * Math.PI / 180, yb = o.bot(u);
      for (let j = 0; j <= NR; j++) { const v = j / NR, ae = a * (1 - (o.narrow || 0) * v), wave = Math.sin(a * (o.nf || 6) + 1.3), k = (o.r0 || 1) * (1 + o.flare * v) + (o.fold || 0) * v * wave; pos.push(Math.sin(ae) * 0.47 * k, lerp(o.top, yb, v), -Math.cos(ae) * 0.31 * k - (o.back || 0) * v * v); shade.push((o.shade || 1) * (0.9 + 0.1 * wave * v) * lerp(1, 0.8, v)); } }
    for (let i = 0; i < NC; i++) for (let j = 0; j < NR; j++) { const p = base + i * (NR + 1) + j, q = p + NR + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); }      // 外側為正面，環境遮蔽才不會把身體的陰影透到布上
  };
  if (style === 1) sheet({ a0: -100, a1: 100, top: 0.03, bot: u => -0.44 - 0.03 * tw(u * 5), flare: 0.2, fold: 0.03, nf: 7, narrow: 0.1, back: 0.03 });
  else if (style === 2) sheet({ a0: -96, a1: 96, top: 0.03, bot: () => -1.1, flare: 0.42, fold: 0.06, nf: 6, narrow: 0.32, back: 0.1 });
  else if (style === 3) sheet({ a0: -38, a1: 126, top: 0.04, bot: u => lerp(-0.28, -0.96, sm(0.08, 0.9, u)), flare: 0.26, fold: 0.045, nf: 6, narrow: 0.1, back: 0.04 });
  else if (style === 4) { sheet({ a0: -152, a1: 152, top: 0.1, bot: u => -0.2 - 0.075 * tw(u * 13), flare: 0.52, fold: 0.035, nf: 22, r0: 0.74 }); sheet({ a0: -165, a1: 165, top: 0.2, bot: u => -0.02 - 0.05 * tw(u * 11 + 0.5), flare: 0.34, fold: 0.03, nf: 19, r0: 0.64, shade: 1.12 }); }
  else { sheet({ a0: -98, a1: 98, top: 0.03, bot: u => -1.08 + 0.34 * tw(u * 4.5 + 0.2) * (0.45 + 0.55 * tw(u * 11)), flare: 0.38, fold: 0.07, nf: 5, narrow: 0.3, back: 0.1 }); sheet({ a0: -118, a1: 118, top: 0.24, bot: () => 0.01, flare: -0.26, r0: 1.12, shade: 0.9 }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const col = new Float32Array(shade.length * 3); for (let i = 0; i < shade.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade[i]; g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); capeCache.set(style, g); return g;
}
const capeMat = cc => { let m = capeMats.get(cc); if (!m) { m = new THREE.MeshStandardMaterial({ color: CAPE_COLORS[cc] || CAPE_COLORS[0], vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }); capeMats.set(cc, m); } return m; };
/* ============================== 0.6：獸皮披肩、武器階級外觀、獸飾 ============================== */
// 獸皮披肩（裝備，跟披風是兩回事）：蓋在肩上的一層——披風照常垂在它下面；只有「毛皮披肩」那一款披風（同一個位置的毛領）在穿獸皮披肩時不顯示。
// 三種共用同一套版型（披在雙肩與上背、胸前垂兩條前腿、頸邊兩圈毛領、下緣鋸齒毛邊），靠毛色、花紋、尾巴與厚度分辨：狼＝灰藍、深色背脊、蓬尾巴；熊＝深褐、最厚、圓尾與掌爪；虎＝橘底黑條紋、白邊、長條紋尾
// 虎的條紋畫在一張貼圖上（tigerTexture）：條紋是平滑的曲線、兩端尖中段粗，從背脊往兩側斜斜往下走；狼與熊仍是每個面各自上色
// 披肩是蒙皮網格：靠背脊與頸邊的部分跟著胸口，兩肩與胸前的前腿有一部分跟著上臂轉，舉手時肩上的毛皮會被手臂帶起來，不會被手臂穿過去
export const PELTS = {
  wolf: { id: 'cloak_wolf', name: '狼皮披肩', base: [0.5, 0.55, 0.61], dark: [0.25, 0.28, 0.34], light: [0.88, 0.9, 0.93], tuft: 0.1, puff: 1, tail: 'bushy' },
  bear: { id: 'cloak_bear', name: '熊皮披肩', base: [0.43, 0.28, 0.17], dark: [0.25, 0.15, 0.09], light: [0.66, 0.48, 0.32], tuft: 0.075, puff: 1.12, tail: 'stub', claws: true },
  tiger: { id: 'cloak_tiger', name: '虎皮披肩', base: [0.95, 0.56, 0.13], dark: [0.09, 0.06, 0.05], light: [0.99, 0.92, 0.78], tuft: 0.065, puff: 0.97, tail: 'long', stripes: true }
};
export const GEAR_PELTS = ['', 'wolf', 'bear', 'tiger'], GEAR_CHARMS = ['', 'tusk', 'antler', 'fang'];
// 裝備外觀的資料：{ tier 武器階級 0–4, charm 獸飾（''｜tusk｜antler｜fang，也收 charm_xxx）, pelt 披肩（''｜wolf｜bear｜tiger，也收 cloak_xxx） }。gearCode／parseGear：壓成「階.飾.披」三個數字的短字串，方便連線時帶給別人
export const normGear = g => { g = g || {}; const c = String(g.charm || '').replace('charm_', ''), q = String(g.pelt || '').replace('cloak_', ''); return { tier: clamp(g.tier | 0, 0, 4), charm: GEAR_CHARMS.includes(c) ? c : '', pelt: PELTS[q] ? q : '' }; };
export const gearCode = g => { g = normGear(g); return g.tier + '.' + GEAR_CHARMS.indexOf(g.charm) + '.' + GEAR_PELTS.indexOf(g.pelt); };
export const parseGear = s => { const a = String(s || '').split('.').map(v => parseInt(v, 10) || 0); return normGear({ tier: a[0], charm: GEAR_CHARMS[a[1]] || '', pelt: GEAR_PELTS[a[2]] || '' }); };
// 虎皮貼圖（512×512）：上 0–320 主披肩（橫軸＝繞身體的角度 −170°…170°，縱軸＝領口到下緣）；330–418 毛領；428–500 尾巴（橫軸＝尾根到尾尖）；右下角一小塊純白給骨扣等不上花紋的零件
const TEX_W = [505 / 512, 506 / 512], tigerUV = (a, v) => [(a + 170) / 340, v * 320 / 512];
let tigerTex = null;
function tigerTexture() {
  if (tigerTex) return tigerTex; const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'), X = a => (a + 170) / 340 * S, MY = v => v * 320, INK = '#1d120b';
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 底色：背脊深橘、兩側亮橘，前腿內側與下緣漸漸轉成米白（老虎的肚子是白的）
  const gx = cx.createLinearGradient(0, 0, S, 0); [[0, '#f6c27a'], [X(-150) / S, '#f3a23c'], [X(-95) / S, '#f0922a'], [X(-35) / S, '#e5741d'], [0.5, '#dc6619'], [X(35) / S, '#e5741d'], [X(95) / S, '#f0922a'], [X(150) / S, '#f3a23c'], [1, '#f6c27a']].forEach(([o, c]) => gx.addColorStop(o, c));
  cx.fillStyle = gx; cx.fillRect(0, 0, S, 320);
  const gb = cx.createLinearGradient(0, MY(0.8), 0, MY(1)); gb.addColorStop(0, 'rgba(252,236,206,0)'); gb.addColorStop(0.6, 'rgba(252,236,206,0.7)'); gb.addColorStop(1, 'rgba(252,238,212,1)'); cx.fillStyle = gb; cx.fillRect(0, MY(0.8), S, MY(0.2) + 1);
  for (const sd of [-1, 1]) { const x0 = X(sd * 134), x1 = X(sd * 150), g = cx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(252,236,206,0)'); g.addColorStop(1, 'rgba(252,238,212,1)'); cx.fillStyle = g; cx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), 320); cx.fillStyle = '#fcefd6'; cx.fillRect(sd > 0 ? x1 : 0, 0, sd > 0 ? S - x1 : x1, 320); }
  // 一條條紋：沿著控制點（角度, v）走的平滑曲線；粗細從尖端長到最粗（pk 處）再收回尖端，w 是最粗處的半寬（v 的單位）
  const stripe = (pts, w, pk = 0.4, Y = MY) => {
    const N = 28, Q = pts.map(([a, v]) => [X(a), Y(v)]), seg = Q.length - 1, P = [], q = j => Q[Math.max(0, Math.min(seg, j))], cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    for (let i = 0; i <= N; i++) { const u = i / N * seg, k = Math.min(seg - 1, Math.floor(u)), t = u - k; P.push([0, 1].map(e => cr(q(k - 1)[e], q(k)[e], q(k + 1)[e], q(k + 2)[e], t))); }
    const L = [], R = [], H = Y(1) - Y(0);
    for (let i = 0; i <= N; i++) { const t = i / N, a = P[Math.max(0, i - 1)], b = P[Math.min(N, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, pr = t < pk ? Math.pow(Math.sin(t / pk * Math.PI / 2), 0.75) : Math.pow(Math.cos((t - pk) / (1 - pk) * Math.PI / 2), 0.85), hw = w * H * pr;
      L.push([P[i][0] - dy / l * hw, P[i][1] + dx / l * hw]); R.push([P[i][0] + dy / l * hw, P[i][1] - dx / l * hw]); }
    cx.beginPath(); cx.moveTo(L[0][0], L[0][1]); for (const p of L) cx.lineTo(p[0], p[1]); for (let i = R.length - 1; i >= 0; i--) cx.lineTo(R[i][0], R[i][1]); cx.closePath(); cx.fillStyle = INK; cx.fill();
  };
  // 背上：從背脊往兩側、往下斜的人字紋（尖端朝領口），越往下越長；兩邊不完全對稱，有的分岔、有的中間夾一條短紋
  const back = [[0.1, 0.026, 50, 0.1], [0.25, 0.034, 72, 0.13], [0.4, 0.04, 86, 0.15], [0.555, 0.043, 96, 0.16], [0.71, 0.04, 100, 0.14], [0.86, 0.032, 90, 0.1]];
  for (const sd of [-1, 1]) back.forEach(([v0, w, a1, dv], i) => { const j = (rnd() - 0.5) * 0.03, A0 = 5 + rnd() * 4;
    stripe([[sd * A0, v0 + j], [sd * (a1 * 0.35), v0 + j + dv * 0.3], [sd * (a1 * 0.7), v0 + j + dv * 0.72 + 0.02], [sd * a1, v0 + j + dv + 0.08]], w * (0.88 + rnd() * 0.25), 0.34);
    if (i === 1 || i === 3) stripe([[sd * (a1 * 0.42), v0 + j + dv * 0.48 + 0.035], [sd * (a1 * 0.62), v0 + j + dv * 0.74 + 0.085], [sd * (a1 * 0.76), v0 + j + dv + 0.14]], w * 0.55, 0.3);
    if (i === 2 || i === 4) stripe([[sd * (a1 * 0.55), v0 + j + 0.085], [sd * (a1 * 0.8), v0 + j + dv * 0.5 + 0.1], [sd * (a1 + 6), v0 + j + dv + 0.12]], w * 0.5, 0.5); });
  // 兩側（肩膀外側）：往下走、微彎的直紋；胸前垂下的前腿：橫過腿的細紋，內側米白
  for (const sd of [-1, 1]) [[98, 0.08, 0.6, 0.03], [108, 0.16, 0.66, 0.026]].forEach(([a, v0, v1, w]) => stripe([[sd * a, v0], [sd * (a + 3), (v0 + v1) / 2], [sd * (a - 2), v1]], w, 0.45));
  for (const sd of [-1, 1]) [[0.36, 0.022], [0.5, 0.026], [0.64, 0.028], [0.78, 0.026], [0.9, 0.018]].forEach(([v, w]) => stripe([[sd * 116, v - 0.03], [sd * 127, v], [sd * 141, v + 0.025]], w, 0.38));
  // 毛領：頸後是橘色帶幾撇短紋，往前轉成米白（老虎臉頰的白毛）
  const RY = v => 330 + v * 88, rg = cx.createLinearGradient(0, 0, S, 0); [[0, '#fdf0d8'], [X(-112) / S, '#fdf0d8'], [X(-88) / S, '#f0922a'], [0.5, '#e2701c'], [X(88) / S, '#f0922a'], [X(112) / S, '#fdf0d8'], [1, '#fdf0d8']].forEach(([o, c]) => rg.addColorStop(o, c)); cx.fillStyle = rg; cx.fillRect(0, 330, S, 88);
  const gr = cx.createLinearGradient(0, 330, 0, 418); gr.addColorStop(0, 'rgba(255,240,215,0.25)'); gr.addColorStop(1, 'rgba(255,240,215,0)'); cx.fillStyle = gr; cx.fillRect(0, 330, S, 88);
  for (const sd of [-1, 1]) for (const [a, w] of [[14, 0.13], [38, 0.12], [62, 0.1]]) stripe([[sd * (a - 4), 0.2], [sd * a, 0.6], [sd * (a + 5), 1.0]], w, 0.55, RY);
  // 尾巴：橘底，斜斜的環紋越往尾尖越粗，尾尖黑
  const TY = 428, TH = 72; const gt = cx.createLinearGradient(0, 0, S, 0); gt.addColorStop(0, '#e5741d'); gt.addColorStop(1, '#f0922a'); cx.fillStyle = gt; cx.fillRect(0, TY, S, TH); cx.fillStyle = INK;
  for (const [t, w] of [[0.16, 0.035], [0.31, 0.04], [0.45, 0.042], [0.58, 0.045], [0.7, 0.046], [0.8, 0.045]]) { cx.beginPath(); cx.moveTo((t - w) * S, TY); cx.lineTo((t + w) * S, TY); cx.lineTo((t + w + 0.03) * S, TY + TH); cx.lineTo((t - w + 0.03) * S, TY + TH); cx.closePath(); cx.fill(); }
  cx.fillRect(0.88 * S, TY, 0.12 * S, TH); cx.fillStyle = '#ffffff'; cx.fillRect(496, 500, 16, 12);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4; return tigerTex = t;
}
const peltCache = new Map(), peltMats = {};
function peltGeo(kind) {
  if (peltCache.has(kind)) return peltCache.get(kind);
  const K = PELTS[kind], TX = !!K.stripes, lin = c => { const q = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return [q.r, q.g, q.b]; }, cb = lin(K.base), cd = lin(K.dark), cl = lin(K.light), mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const tw = x => { const f = x - Math.floor(x); return 1 - 2 * Math.abs(f - 0.5); }, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, WH = [1, 1, 1];
  const P = [], N = [], C = [], T = [];
  // 一片毛皮：a0–a1 繞身體的角度（0 正後方）；v0–v1 是這一層在整件披肩上從上到下佔哪一段；每個面各自上色（狼熊的花紋邊才俐落；虎的花紋在貼圖上，面色只帶明暗），法線仍是平滑的
  const sheet = (o, NC, NR) => {
    const W1 = NR + 1, V = [], U = [], nrm = [], v0 = o.v0 || 0, v1 = o.v1 == null ? 1 : o.v1;
    for (let i = 0; i <= NC; i++) { const u = i / NC, a = lerp(o.a0, o.a1, u), yb = o.bot(a, u), zig = o.zig ? o.zig(u) : 0; for (let j = 0; j <= NR; j++) { const jj = j / NR, v = lerp(v0, v1, jj), ar = a * Math.PI / 180, wave = Math.sin(ar * (o.nf || 9) + 1.3), k = (o.rad ? o.rad(v) : o.r0 * (1 + o.flare * v)) + (o.off || 0) + (o.fold || 0) * v * wave; V.push(new THREE.Vector3(Math.sin(ar) * 0.47 * k, lerp(o.top, yb, v) - zig * sm(0.45, 1, jj), -Math.cos(ar) * 0.31 * k - (o.back || 0) * v * v - (o.hump || 0) * Math.max(0, Math.cos(ar)) * (1 - sm(0.06, 0.4, v)))); U.push(o.uv ? o.uv(a, v, jj) : TEX_W); nrm.push(new THREE.Vector3()); } }
    const tris = [], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < NC; i++) for (let j = 0; j < NR; j++) { const p = i * W1 + j, q = p + W1, a = lerp(o.a0, o.a1, (i + 0.5) / NC), jj = (j + 0.5) / NR, v = lerp(v0, v1, jj), wave = Math.sin(a * Math.PI / 180 * (o.nf || 9) + 1.3), sh = (o.shade || 1) * (0.92 + 0.08 * wave * v) * lerp(1, 0.86, v), col = o.col(a, v, jj).map(c => c * sh);
      for (const t of [[p, q, p + 1], [q, q + 1, p + 1]]) { e1.subVectors(V[t[1]], V[t[0]]); e2.subVectors(V[t[2]], V[t[0]]); e1.cross(e2); for (const k of t) nrm[k].add(e1); tris.push([t, col]); } }
    for (const [t, col] of tris) for (const k of t) { const n = nrm[k].clone().normalize(); P.push(V[k].x, V[k].y, V[k].z); N.push(n.x, n.y, n.z); C.push(col[0], col[1], col[2]); T.push(U[k][0], U[k][1]); }
  };
  const flap = A => sm(116, 128, A) * (1 - 0.55 * sm(143, 152, A));      // 胸前垂下來的兩條前腿
  const tuftF = K.claws ? x => Math.abs(Math.sin(x * Math.PI)) : tw;      // 毛尖：狼虎是尖的，熊是圓圓一撮一撮
  const rad = v => K.puff * lerp(0.76, 1.07, sm(0, 0.26, v)) * (1 + 0.3 * v);      // 領口貼著脖子，到肩膀才撐開
  const botAll = a => { const A = Math.abs(a); return -0.6 + 0.2 * sm(18, 70, A) + 0.14 * sm(70, 96, A) - 0.3 * flap(A); };
  const colAll = TX ? (a, v, jj) => mix(WH, [1.08, 1.06, 1.02], 0.5 * sm(0.55, 1, jj)) : (a, v, jj) => { const A = Math.abs(a), tip = sm(0.55, 1, jj);
    let c = mix(cb, cd, 0.4 * sm(30, 4, A) * (kind === 'bear' ? 0.6 : 1)); if (A > 118 && v > 0.74) c = mix(cb, cd, 0.75); return mix(c, cl, (kind === 'wolf' ? 0.6 : 0.3) * tip); };
  // 披肩本體：三層像瓦片一樣疊著的毛（上層蓋住下層的上緣，每層下緣是毛尖）——低面數做「一層一層的毛」，比一整片布像毛皮。hump：上背往外鼓一點，騎士衣領才不會從背上穿出來
  for (const [v0, v1, off, n, ph, amp] of [[0.6, 1, 0, 19, 0.2, 1], [0.3, 0.76, 0.04, 17, 0.45, 0.8], [0, 0.44, 0.08, 15, 0, 0.7]]) sheet({ a0: -152, a1: 152, top: 0.17, rad, off, v0, v1, fold: 0.03, nf: 9, back: 0.03, hump: 0.05, bot: botAll, zig: u => K.tuft * amp * tuftF(u * n + ph), col: colAll, uv: TX ? tigerUV : null }, 40, 6);
  // 頸邊的毛領：兩圈（熊三圈），下緣是一撮一撮的毛
  const ruff = TX ? () => WH : (a, v) => kind === 'bear' ? mix(cl, cb, 0.35 * v) : mix(cl, cb, 0.25 * sm(0.5, 1, v)), ruv = TX ? (a, v, jj) => [(a + 170) / 340, (330 + jj * 88) / 512] : null;
  if (kind === 'bear') sheet({ a0: -150, a1: 150, top: 0.1, r0: 0.9 * K.puff, flare: 0.6, fold: 0.03, nf: 17, bot: () => -0.2, zig: u => 0.08 * tuftF(u * 13 + 0.3), col: () => mix(cb, cl, 0.5), shade: 1.02 }, 36, 5);
  sheet({ a0: -156, a1: 156, top: 0.15, r0: 0.8 * K.puff, flare: 0.62, fold: 0.035, nf: 22, bot: () => -0.11, zig: u => K.tuft * 1.3 * tuftF(u * 13), col: ruff, uv: ruv, shade: 1.06 }, 36, 5);
  sheet({ a0: -166, a1: 166, top: 0.25, r0: 0.68 * K.puff, flare: 0.4, fold: 0.03, nf: 19, bot: () => 0.02, zig: u => K.tuft * 1.0 * tuftF(u * 11 + 0.5), col: ruff, uv: ruv, shade: 1.14 }, 36, 5);
  const put = (g, col) => { const q = g.index ? g.toNonIndexed() : g; q.computeVertexNormals(); const p = q.attributes.position, n = q.attributes.normal, c = lin(col); for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(c[0], c[1], c[2]); T.push(TEX_W[0], TEX_W[1]); } };
  // 胸前的骨扣；熊的掌爪、圓尾
  { const g = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6); g.rotateZ(Math.PI / 2 - 0.25); g.translate(0, -0.12, 0.31 * 1.2 * K.puff + 0.06); put(g, [0.95, 0.91, 0.8]); }
  if (K.claws) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const a = (138 + (i - 1) * 9) * Math.PI / 180, k = 1.07 * K.puff * 1.3, g = new THREE.ConeGeometry(0.022, 0.085, 5); g.rotateX(Math.PI); g.translate(sd * Math.sin(a) * 0.47 * k, -0.565, -Math.cos(a) * 0.31 * k + 0.01); put(g, [0.96, 0.93, 0.84]); }
  if (K.tail === 'stub') { const g = new THREE.IcosahedronGeometry(0.095, 1); g.translate(0, -0.5, -0.31 * 1.07 * K.puff * 1.27 - 0.07); put(g, K.dark); }
  const mk = (PP, NN, CC, TT) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(PP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3)); if (TT) g.setAttribute('uv', new THREE.Float32BufferAttribute(TT, 2)); return g; };
  const body = mk(P.slice(), N.slice(), C.slice(), TX ? T.slice() : null); let tail = null;
  // 蒙皮權重：0＝跟著披肩（胸口），1／2＝左／右上臂。離身體中線越遠（兩肩、胸前的前腿）越跟著手臂，領口與背脊完全不動
  { const n = P.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], w = 0.72 * sm(0.17, 0.44, Math.abs(x)) * (1 - 0.6 * sm(0.04, 0.2, y)); si[i * 4] = 0; si[i * 4 + 1] = x > 0 ? 1 : 2; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w; }
    body.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); body.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); }
  if (K.tail === 'bushy' || K.tail === 'long') {      // 尾巴另外一個網格，跑起來會甩；原點在尾根、往下垂
    P.length = N.length = C.length = T.length = 0; const bushy = K.tail === 'bushy', prof = bushy ? [[0.04, 0], [0.085, -0.1], [0.118, -0.25], [0.105, -0.39], [0.055, -0.5], [0, -0.57]] : [[0.036, 0], [0.046, -0.13], [0.044, -0.3], [0.042, -0.45], [0.04, -0.57], [0, -0.66]], L = -prof[prof.length - 1][1], NS = 7;
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < NS; i++) { const a0 = i / NS * TAU, a1 = (i + 1) / NS * TAU, [r0, y0] = prof[j], [r1, y1] = prof[j + 1], bend = y => -0.1 * Math.pow(-y / L, 2) * (bushy ? 0.4 : 1.4), tm = -(y0 + y1) / 2 / L;
      const col = TX ? WH : bushy ? mix(mix(cb, cl, 0.35 * (Math.cos((a0 + a1) / 2) > 0.3 ? 1 : 0)), cd, sm(0.68, 0.86, tm)) : (tm > 0.86 || (tm * 5.2 + 0.1) % 1 < 0.36 ? cd : cb), q = [[r0, y0, a0], [r1, y1, a0], [r0, y0, a1], [r1, y1, a0], [r1, y1, a1], [r0, y0, a1]];
      for (const [r, y, a] of q) { const s = 0.86 + 0.14 * Math.cos(a - 3.6); P.push(Math.sin(a) * r, y, Math.cos(a) * r + bend(y)); N.push(Math.sin(a), 0.15, Math.cos(a)); C.push(col[0] * s, col[1] * s, col[2] * s); T.push(-y / L, (428 + 72 * a / TAU) / 512); } }
    tail = mk(P, N, C, TX ? T : null);
  }
  const out = { body, tail, tailAt: [0, -0.47, -0.31 * 1.07 * K.puff * 1.25 - 0.03] }; peltCache.set(kind, out); return out;
}
const peltMaterial = kind => { const k = PELTS[kind] && PELTS[kind].stripes ? 'tex' : 'col'; return peltMats[k] || (peltMats[k] = new THREE.MeshStandardMaterial({ vertexColors: true, map: k === 'tex' ? tigerTexture() : null, side: THREE.DoubleSide, roughness: 0.96, metalness: 0 })); };
// 舉手時肩上那一塊要跟著轉多少：拿「待機動作」裡上臂相對於披肩的位置當基準（不管綁上去時角色正在做什麼動作）
function peltArmRef(root, bodyKey, pm, ua) {
  const P = protos[bodyKey], idle = clips.Idle, chain = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let b = ua; while (b && b !== pm.parent) { chain.unshift(b); b = b.parent; } if (!b) return null;
  for (const o of chain) { const r = P && P.getObjectByName(o.name) || o; p.copy(r.position); q.copy(r.quaternion); s.copy(r.scale);
    const tq = idle && idle.tracks.find(t => t.name === o.name + '.quaternion'), tp = idle && idle.tracks.find(t => t.name === o.name + '.position'); if (tq) q.fromArray(tq.values, 0); if (tp) p.fromArray(tp.values, 0);
    m.multiply(new THREE.Matrix4().compose(p, q, s)); }
  pm.updateMatrix(); return new THREE.Matrix4().copy(pm.matrix).invert().multiply(m);
}
/* ---------- 武器階級的外觀：疊在原本的武器上，另外依階級把武器本身換色（換一份帶頂點色的網格，不多畫一次） ----------
   每一階都有一眼看得出的「材質」：零階 素鐵｜一階 纏皮（刃根纏一圈皮、柄尾皮穗）｜二階 鑲牙（護手換成骨白、大獠牙、刃口磨亮）｜三階 鐵箍（黑鐵箍與鉚釘、刃身轉深色淬火、刃口亮白）｜四階 三名（金飾、紅寶石、刃上一道金色微光） */
// 各武器的定位（武器自己的座標：握把在原點附近、刃朝 +Y）：tas 皮穗的掛點與長度 [x, y, z, 長]｜grip [y0, y1, 半徑]｜fang [[x, y, z, 方向x, y, z, 長度]]｜col 刃根（或斧柄、杖身）的一圈 [[y, 高, 半寬x, 半寬z, 形狀 0 菱形（刃）／1 圓（柄）, z 偏移]]｜zr 刃脊的半厚（刃口亮度用）｜glow [中心x, y, 寬, 高, z]｜rune 四階的光紋 [[x0, y0, x1, y1, z, 寬]]（z 兩面各一條）｜tip 杖頭寶石 [x, y, z, 半徑]｜charm 掛點
const bowZd = t => -0.21 * Math.pow(Math.abs(t), 1.7);
const WDECO = {
  '1H_Sword': { tas: [0, -0.36, 0, 0.32], grip: [-0.1, 0.13, 0.058], fang: [[0.22, 0.25, 0, 0.42, 0.9, 0, 0.17], [-0.22, 0.25, 0, -0.42, 0.9, 0, 0.17]], col: [[0.4, 0.13, 0.157, 0.048, 0, 0]], zr: 0.048, glow: [0, 0.86, 0.6, 1.34, 0], rune: [[0, 0.52, 0, 1.24, 0.05, 0.036]], charm: [0.25, 0.16, 0] },
  '2H_Sword': { tas: [0, -0.4, 0, 0.36], grip: [-0.2, 0.09, 0.064], fang: [[0.38, 0.42, 0, 0.42, 0.9, 0, 0.22], [-0.38, 0.42, 0, -0.42, 0.9, 0, 0.22]], col: [[0.86, 0.14, 0.139, 0.048, 0, 0]], zr: 0.048, glow: [0, 1.22, 0.7, 1.8, 0], rune: [[0, 0.98, 0, 1.72, 0.05, 0.042]], charm: [0.42, 0.3, 0] },
  '1H_Axe': { tas: [0, -0.27, 0, 0.32], grip: [-0.2, 0.12, 0.074], fang: [[0.1, 0.52, 0, 0.95, -0.3, 0, 0.2], [0.1, 0.72, 0, 0.9, 0.42, 0, 0.16]], col: [[0.215, 0.1, 0.064, 0.064, 1, 0]], zr: 0.092, glow: [-0.23, 0.62, 1.05, 1.0, 0], rune: [[-0.47, 0.47, -0.47, 0.86, 0.06, 0.036]], charm: [0.08, 0.2, 0] },
  '2H_Axe': { tas: [0, -0.43, 0, 0.36], grip: [-0.26, 0.2, 0.094], fang: [[0.08, 1.2, 0, 0.5, 0.86, 0, 0.22], [-0.08, 1.2, 0, -0.5, 0.86, 0, 0.22]], col: [[0.29, 0.11, 0.075, 0.075, 1, 0]], zr: 0.131, glow: [0, 0.86, 1.6, 1.2, 0], rune: [[0.5, 0.6, 0.5, 1.12, 0.08, 0.04], [-0.5, 0.6, -0.5, 1.12, 0.08, 0.04]], charm: [0.1, 0.36, 0] },
  '2H_Staff': { tas: [0.075, -0.2, 0, 0.36], grip: [-0.2, 0.16, 0.07], fang: [[0.12, 0.66, 0, 0.62, 0.78, 0, 0.19], [-0.12, 0.66, 0, -0.62, 0.78, 0, 0.19]], col: [[0.42, 0.11, 0.052, 0.052, 1, 0], [-0.62, 0.1, 0.05, 0.05, 1, 0]], glow: [0.04, 1.0, 0.95, 0.85, 0], rune: [], charm: [0.1, 0.52, 0] },
  '1H_Wand': { tas: [0, -0.26, 0, 0.22], grip: [-0.05, 0.1, 0.052], fang: [[0.055, 0.19, 0, 0.6, 0.8, 0, 0.1], [-0.055, 0.19, 0, -0.6, 0.8, 0, 0.1]], col: [[0.27, 0.08, 0.042, 0.042, 1, 0]], tip: [-0.035, 0.72, 0, 0.05], glow: [0, 0.58, 0.46, 0.46, 0], rune: [], charm: [0.06, 0.14, 0] },
  'Knife': { tas: [0, -0.22, 0, 0.24], grip: [-0.13, 0.1, 0.058], fang: [[0.11, 0.24, 0, 0.5, 0.86, 0, 0.13], [-0.11, 0.24, 0, -0.5, 0.86, 0, 0.13]], col: [[0.3, 0.08, 0.08, 0.026, 0, 0]], zr: 0.047, glow: [0.01, 0.64, 0.46, 0.9, 0], rune: [[0, 0.38, 0.02, 0.84, 0.046, 0.03]], charm: [0.13, 0.15, 0] },
  bow: { tas: [0, -0.11, 0.06, 0.3], grip: [-0.1, 0.1, 0.064], fang: [[0, 0.16, 0.03, 0, 0.5, 0.86, 0.15], [0, -0.16, 0.03, 0, -0.5, 0.86, 0.15]], col: [[0.36, 0.07, 0.05, 0.042, 1, bowZd(0.47)], [-0.36, 0.07, 0.05, 0.042, 1, bowZd(0.47)]], glow: [0, 0, 0.5, 1.7, -0.08], rune: [[0.114, 0.38, -0.008, -0.065], [0.38, 0.646, -0.065, -0.127]].flatMap(([y0, y1, z0, z1]) => [1, -1].flatMap(sy => [1, -1].map(f => [0, sy * y0, 0, sy * y1, z0 + f * 0.042, 0.028, z1 + f * 0.04]))), charm: [0, -0.13, 0.03] }
};
WDECO['1H_Sword_Offhand'] = WDECO['1H_Sword']; WDECO['1H_Axe_Offhand'] = WDECO['1H_Axe']; WDECO.Knife_Offhand = WDECO.Knife;
// 武器本身換色：依貼圖格子（KayKit 的貼圖是一格一格的色票）與位置把頂點分成 刃 b／金屬配件 f／寶石 g／木頭 w，各階乘上不同的顏色（線性色彩空間的倍率）
const ST = (c, r) => c === 3 && r === 1, WOOD5 = (c, r) => c === 5 && r === 1;
const WCLS = {
  '1H_Sword': (c, r, y) => ST(c, r) ? (y > 0.3 ? 'b' : 'f') : WOOD5(c, r) ? 'w' : null,
  '2H_Sword': (c, r, y) => ST(c, r) ? (y > 0.6 ? 'b' : 'f') : c === 2 && r === 2 ? 'g' : WOOD5(c, r) ? 'w' : null,
  '1H_Axe': (c, r) => ST(c, r) ? 'b' : WOOD5(c, r) ? 'w' : null,
  '2H_Axe': (c, r) => ST(c, r) ? 'b' : c === 0 && r === 2 ? 'f' : WOOD5(c, r) ? 'w' : null,
  '2H_Staff': (c, r) => ST(c, r) ? 'f' : c === 6 && r === 2 ? 'g' : WOOD5(c, r) ? 'w' : null,
  '1H_Wand': (c, r) => WOOD5(c, r) ? 'w' : null,
  'Knife': (c, r) => ST(c, r) ? 'b' : c === 2 && r === 1 ? 'f' : null
};
WCLS['1H_Sword_Offhand'] = WCLS['1H_Sword']; WCLS['1H_Axe_Offhand'] = WCLS['1H_Axe']; WCLS.Knife_Offhand = WCLS.Knife;
// 各階的倍率：刃 [刃身, 刃口]、配件、寶石、木頭。刃口是刃上靠近刃緣的一條帶（把刃上的三角形沿「離刃緣多遠」切開，帶內由刃身色漸變到刃口色）
const TCOL = [null,
  { b: [[1, 1, 1], [1, 1, 1]], f: [1, 1, 1], g: [1, 1, 1], w: [1, 1, 1] },
  { b: [[1, 1, 1], [1.7, 1.7, 1.7]], f: [2.6, 2.3, 1.75], g: [1, 1, 1], w: [1, 1, 1] },
  { b: [[0.32, 0.36, 0.48], [2.4, 2.5, 2.6]], f: [0.3, 0.3, 0.35], g: [1.15, 1.15, 1.15], w: [0.5, 0.46, 0.46] },
  { b: [[1.0, 0.95, 0.84], [2.2, 1.7, 0.8]], f: [3.0, 1.75, 0.32], g: [1.7, 1.7, 1.7], w: [0.72, 0.5, 0.42] }];
const EDGE = 0.6, tierGeoCache = new Map(), vcMats = new WeakMap();
function tierGeo(src, node, tier) {
  const cls = WCLS[node], S = WDECO[node]; if (!cls || !tier || !src.attributes.uv) return src;
  const key = src.uuid + ':' + tier; let g = tierGeoCache.get(key); if (g) return g;
  const g0 = src.index ? src.toNonIndexed() : src, pa = g0.attributes.position, na = g0.attributes.normal, ua = g0.attributes.uv, K = TCOL[tier], zr = S.zr || 0.05, P = [], N = [], U = [], C = [];
  const V = i => ({ p: [pa.getX(i), pa.getY(i), pa.getZ(i)], n: [na.getX(i), na.getY(i), na.getZ(i)], u: [ua.getX(i), ua.getY(i)], t: 1 - clamp(Math.abs(pa.getZ(i)) / zr, 0, 1) });
  const mixV = (a, b, f) => ({ p: a.p.map((v, j) => lerp(v, b.p[j], f)), n: a.n.map((v, j) => lerp(v, b.n[j], f)), u: a.u.map((v, j) => lerp(v, b.u[j], f)), t: lerp(a.t, b.t, f) });
  const emit = (vs, col) => { for (let k = 1; k < vs.length - 1; k++) for (const v of [vs[0], vs[k], vs[k + 1]]) { const l = Math.hypot(v.n[0], v.n[1], v.n[2]) || 1, c = col(v); P.push(...v.p); N.push(v.n[0] / l, v.n[1] / l, v.n[2] / l); U.push(...v.u); C.push(c[0], c[1], c[2]); } };
  const bc = v => { const f = clamp((v.t - EDGE) / (1 - EDGE), 0, 1); return [0, 1, 2].map(j => lerp(K.b[0][j], K.b[1][j], f)); };
  for (let i = 0; i < pa.count; i += 3) { const vs = [V(i), V(i + 1), V(i + 2)], cu = (vs[0].u[0] + vs[1].u[0] + vs[2].u[0]) / 3, cv = (vs[0].u[1] + vs[1].u[1] + vs[2].u[1]) / 3, cy = (vs[0].p[1] + vs[1].p[1] + vs[2].p[1]) / 3, k = cls(Math.floor(cu * 8), Math.floor(cv * 4), cy);
    if (k !== 'b') { const c = k ? K[k] : [1, 1, 1]; emit(vs, () => c); continue; }
    // 刃：沿 t＝EDGE 把三角形切成刃身、刃口兩塊
    const lo = [], hi = []; for (let j = 0; j < 3; j++) { const a = vs[j], b = vs[(j + 1) % 3]; (a.t <= EDGE ? lo : hi).push(a); if ((a.t - EDGE) * (b.t - EDGE) < 0) { const m = mixV(a, b, (EDGE - a.t) / (b.t - a.t)); lo.push(m); hi.push(m); } }
    if (lo.length >= 3) emit(lo, bc); if (hi.length >= 3) emit(hi, bc); }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  tierGeoCache.set(key, g); return g;
}
const vcMat = m => { let v = vcMats.get(m); if (!v) { v = m.clone(); v.vertexColors = true; vcMats.set(m, v); } return v; };
// 弓身（程式生成，本來就是頂點色）：各階換木色、弓梢與束環的材質
function bowStave(tier) {
  const k = 'bowst:' + tier; if (decoCache.has(k)) return decoCache.get(k);
  const C = [[0x8a5a34, 0xe9dfc6, 0xc9a35a], [0x8a5a34, 0xe9dfc6, 0xc9a35a], [0x8a5a34, 0xf2ead6, 0xf2ead2], [0x4e3020, 0x3a3e48, 0x3a3e48], [0x6a2e1c, 0xf0bf4a, 0xf0bf4a]][tier], parts = [], N = 7, P = t => new THREE.Vector3(0, BOW.half * t, bowZ(t));
  for (const sg of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = sg * (0.1 + 0.9 * i / N), t1 = sg * (0.1 + 0.9 * (i + 1) / N), a = P(t0), b = P(t1), len = a.distanceTo(b), kk = 1 - 0.52 * (i + 0.5) / N;
    const g = new THREE.BoxGeometry(0.1 * kk, len * 1.06, 0.07 * kk); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_Y, b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push([g, i === N - 1 ? C[1] : i === 0 ? C[2] : C[0]]);
  }
  { const g = new THREE.BoxGeometry(0.1, BOW.half * 0.24, 0.085); g.translate(0, 0, -0.004); parts.push([g, 0x4a3323]); }
  const g = mergeColored(parts); decoCache.set(k, g); return g;
}
const decoCache = new Map(); let decoMat = null, auraMat = null;
// 刃根（或柄上）的一圈：菱形（套在刃上）或圓形（套在柄上）
function ringGeo(c, h, sx, sz, tilt) { const [y, , hx, hz, round, z0] = c, g = new THREE.CylinderGeometry(1, 1, h, round ? 8 : 4); g.scale(hx * sx, 1, hz * sz); if (tilt) g.rotateZ(tilt); g.translate(0, y, z0); return g; }      // 4 邊的圓柱就是尖角朝 ±x、±z 的菱形，剛好包住菱形斷面的刃
// 三、四階箍的大小；surf(x)：箍的表面在 x 處的 z（鉚釘、寶石貼在上面）
const BAND = c => { const [, , hx, hz, round] = c, sx = round ? 1.42 : 1.24, sz = round ? 1.42 : 1.576, X = hx * sx, Z = hz * sz; return { sx, sz, X, Z, surf: x => round ? Z * Math.sqrt(Math.max(0, 1 - (x / X) * (x / X))) : Z * Math.max(0, 1 - Math.abs(x) / X), gr: clamp(hx * 0.36, 0.026, 0.05) }; };
function decoGeo(node, tier) {
  const k = node + ':' + tier; if (decoCache.has(k)) return decoCache.get(k);
  const S = WDECO[node], parts = [], _yy = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), qq = new THREE.Quaternion(), GOLD = 0xf0bf4a;
  if (S && tier >= 1) {      // 握把纏皮：一圈一圈斜斜纏上去的皮條
    const [y0, y1, r] = S.grip, n = Math.max(3, Math.round((y1 - y0) / 0.058)), h = (y1 - y0) / n;
    for (let i = 0; i < n; i++) { const g = new THREE.CylinderGeometry(r * 1.22, r * 1.22, h * 0.8, 6); g.rotateZ(i % 2 ? 0.2 : -0.2); g.rotateY(i * 0.9); g.translate(0, y0 + (i + 0.5) * h, 0); parts.push([g, i % 2 ? 0xa87c48 : 0xd2ab72]); }
  }
  for (const c of S && tier >= 1 ? S.col : []) { const [y, h, hx, hz, round] = c, rr = round ? 1.3 : 1.12;
    if (tier <= 2) {      // 一、二階：刃根纏三圈皮帶（斜斜的，深淺交錯），二階在皮帶上釘骨釘
      for (let i = 0; i < 3; i++) { const cc = [y + (i - 1) * h * 0.32, h, hx, hz, round, c[5]]; parts.push([ringGeo(cc, h * 0.36, rr + i * 0.02, rr * (round ? 1 : 1.25) + i * 0.02, (i % 2 ? 0.16 : -0.16) * (round ? 1 : 0.6)), i % 2 ? 0x7a4c2a : 0xb07a42]); }
      if (tier === 2) for (const sz of [-1, 1]) for (const f of round ? [0] : [-0.45, 0.45]) { const X = hx * (rr + 0.02), Z = hz * (round ? rr : rr * 1.25) + hz * 0.02, x = f * X, v = new THREE.OctahedronGeometry(Math.min(0.022, hx * 0.3), 0); v.translate(x, y, c[5] + sz * (round ? Z : Z * (1 - Math.abs(f)) + 0.004)); parts.push([v, 0xf2ead2]); }
    } else {      // 三階：黑鐵箍＋鉚釘；四階：金箍、上下兩道細邊、兩面各鑲一顆紅寶石
      const gold = tier >= 4, B = BAND(c); parts.push([ringGeo(c, h * 0.82, B.sx, B.sz), gold ? GOLD : 0x33363e]);
      for (const e of [-1, 1]) parts.push([ringGeo([y + e * h * 0.43, 0, hx, hz, round, c[5]], h * 0.12, B.sx + 0.1, B.sz + 0.1), gold ? 0xffe08a : 0x4a4e58]);
      if (!gold) for (const sz of [-1, 1]) for (const f of [-0.5, 0.5]) { const x = f * B.X, v = new THREE.OctahedronGeometry(Math.min(0.02, hx * 0.26), 0); v.translate(x, y, c[5] + sz * (B.surf(x) + 0.004)); parts.push([v, 0xd8dee4]); }
      else if (c === S.col[0]) for (const sz of [-1, 1]) { const v = new THREE.OctahedronGeometry(B.gr, 0); v.scale(1, 1.25, 0.6); v.translate(0, y, c[5] + sz * (B.Z + B.gr * 0.3)); parts.push([v, 0xe0262a]); }
    }
  }
  if (S && tier >= 2) for (const [x, y, z, dx, dy, dz, len0] of S.fang) {      // 鑲牙：大獠牙鑲在護手（或斧背、杖頭）上，根部一圈箍（二階皮綁、三階黑鐵、四階金）
    const len = len0 * 1.35; qq.setFromUnitVectors(_yy, _d.set(dx, dy, dz).normalize()); const g = new THREE.ConeGeometry(len * 0.24, len, 5); g.translate(0, len / 2, 0); g.applyQuaternion(qq); g.translate(x, y, z); parts.push([g, 0xf6efdc]);
    const c = new THREE.CylinderGeometry(len * 0.28, len * 0.28, len * 0.22, 6); c.applyQuaternion(qq); c.translate(x, y, z); parts.push([c, tier >= 4 ? GOLD : tier === 3 ? 0x3a3e48 : 0x6a4428]);
  }
  if (S && S.tip && tier >= 2) { const [x, y, z, r] = S.tip;      // 短杖頭：二階起套一個箍（骨、黑鐵、金），四階箍上托一顆紅寶石
    const cup = new THREE.CylinderGeometry(r * 0.9, r * 0.55, r * 0.9, 7); cup.translate(x, y - r * 0.6, z); parts.push([cup, tier >= 4 ? GOLD : tier === 3 ? 0x33363e : 0xf2ead2]);
    if (tier >= 4) { const v = new THREE.OctahedronGeometry(r, 0); v.scale(0.9, 1.3, 0.9); v.translate(x, y + r * 0.35, z); parts.push([v, 0xe0262a]); } }
  const g = parts.length ? mergeColored(parts) : null; decoCache.set(k, g); return g;
}
// 皮穗：一階起留在柄尾的三條皮條，中間串一顆紅珠。原點在掛點、往 −Y 垂
function tasselGeo(L) {
  const k = 'tassel:' + L; if (decoCache.has(k)) return decoCache.get(k); const parts = [], kn = new THREE.OctahedronGeometry(0.045, 1); kn.scale(1, 0.8, 1); parts.push([kn, 0x9a7040]); const bd = new THREE.OctahedronGeometry(0.036, 1); bd.translate(0, -0.075, 0); parts.push([bd, 0xc8402e]);
  for (const [a, yaw, q, c] of [[0.3, 0.2, 1, 0xcfa468], [-0.26, 2.3, 0.82, 0xb98f58], [0.12, 4.2, 0.64, 0xdcb87e]]) { const l1 = L * q * 0.55, l2 = L * q * 0.45, s1 = new THREE.BoxGeometry(0.056, l1, 0.018), s2 = new THREE.BoxGeometry(0.05, l2, 0.016);
    s1.translate(0, -l1 / 2, 0); s1.rotateZ(a); s2.translate(0, -l2 / 2, 0); s2.rotateZ(a * 0.25); s2.translate(Math.sin(a) * l1, -Math.cos(a) * l1, 0); for (const g of [s1, s2]) { g.rotateY(yaw); parts.push([g, c]); } }
  const g = mergeColored(parts); decoCache.set(k, g); return g;
}
// 獸飾：從掛點垂下來的一小串（繩、紅珠、獸材），原點在掛點、往 −Y 垂
function charmGeo(kind) {
  const k = 'charm:' + kind; if (decoCache.has(k)) return decoCache.get(k);
  const parts = [], cord = new THREE.CylinderGeometry(0.007, 0.007, 0.08, 4); cord.translate(0, -0.04, 0); parts.push([cord, 0x8a5a36]);
  const bead = new THREE.OctahedronGeometry(0.028, 1); bead.translate(0, -0.095, 0); parts.push([bead, 0xd9483a]); const ring = new THREE.TorusGeometry(0.022, 0.008, 4, 8); ring.translate(0, -0.005, 0); parts.push([ring, 0xf2c54a]);
  if (kind === 'tusk') { const a = new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6); a.rotateZ(0.12); a.translate(0.006, -0.17, 0); const b = new THREE.ConeGeometry(0.03, 0.13, 6); b.rotateZ(Math.PI + 0.5); b.translate(0.045, -0.27, 0); parts.push([a, 0xf1e8d0], [b, 0xfff8e8]); }
  else if (kind === 'antler') { const a = new THREE.CylinderGeometry(0.014, 0.022, 0.2, 5); a.translate(0, -0.22, 0); parts.push([a, 0xe6d7b5]); for (const [y, r, L] of [[-0.2, 0.9, 0.11], [-0.27, -0.9, 0.1], [-0.31, 0.5, 0.08]]) { const t = new THREE.ConeGeometry(0.013, L, 4); t.translate(0, L / 2, 0); t.rotateZ(Math.PI - r); t.translate(0, y, 0); parts.push([t, 0xf3ead4]); } }
  else { const cap = new THREE.CylinderGeometry(0.036, 0.036, 0.04, 6); cap.translate(0, -0.135, 0); const f = new THREE.ConeGeometry(0.032, 0.2, 4); f.rotateX(Math.PI); f.translate(0, -0.25, 0); parts.push([cap, 0x4a4f5a], [f, 0xfbf6ea]); }
  const g = mergeColored(parts); decoCache.set(k, g); return g;
}
const decoMaterial = () => decoMat || (decoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12 }));
// 四階的微光：沿著刃（或斧頭、杖頭）的一圈柔光＋刃上一道金色光紋＋寶石上的小星芒，全部在同一個網格（加法混色）。光紋用柔光貼圖的中心，白天也看得出一道亮線
function auraMaterial() {
  if (auraMat) return auraMat; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(cv); return auraMat = new THREE.MeshBasicMaterial({ map: tx, color: new THREE.Color(1.9, 1.35, 0.55), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}
function auraGeo(node) { const k = 'aura:' + node; if (decoCache.has(k)) return decoCache.get(k); const S = WDECO[node], [cx, cy, w, h, cz] = S.glow, P = [], UV = [], I = [];
  const quad = (x, y, z, qw, qh, yz, rot) => { const b = P.length / 3, c = Math.cos(rot), sn = Math.sin(rot); for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = u * qw / 2 * c - v * qh / 2 * sn, ly = u * qw / 2 * sn + v * qh / 2 * c; P.push(yz ? x : x + lx, y + ly, yz ? z + lx : z); UV.push(u * 0.5 + 0.5, v * 0.5 + 0.5); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  quad(cx, cy, cz || 0, w, h, false, 0); quad(cx, cy, cz || 0, Math.min(w, 0.55), h, true, 0);
  for (const [fx, fy, sz] of [[0.3, 0.32, 0.3], [-0.26, 0.02, 0.22], [0.12, -0.3, 0.26]]) for (const yz of [false, true]) for (const r of [0, Math.PI / 2]) quad(cx + (yz ? 0 : fx * w * 0.5), cy + fy * h, (cz || 0) + (yz ? fx * 0.2 : 0), sz * 0.16, sz, yz, r + 0.3);
  // 光紋：中間一欄取貼圖正中央（最亮），兩側與兩端取外圈（漸暗），兩面各一條
  for (const [x0, y0, x1, y1, z, lw, z1] of S.rune) for (const sz of z1 == null ? [-1, 1] : [1]) { const b = P.length / 3, ys = [0, 0.14, 0.86, 1], us = [0.5 - 0.34, 0.5, 0.5 + 0.34];      // z1：光紋兩端的 z 不同（弓身是彎的），這種只畫一面、兩面分開寫
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const t = ys[r]; P.push(lerp(x0, x1, t) + (c - 1) * lw, lerp(y0, y1, t), z1 == null ? z * sz : lerp(z, z1, t)); UV.push(us[c], r === 0 || r === 3 ? 0.5 + 0.36 : 0.5); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const a = b + r * 3 + c; I.push(a, a + 1, a + 4, a, a + 4, a + 3); } }
  // 寶石上的星芒
  const c0 = S.col && S.col[0], gp = S.tip ? [[S.tip[0], S.tip[1] + S.tip[3] * 0.35, S.tip[2] + S.tip[3] * 0.9], [S.tip[0], S.tip[1] + S.tip[3] * 0.35, S.tip[2] - S.tip[3] * 0.9]] : c0 ? [1, -1].map(sz => [0, c0[0], c0[5] + sz * (BAND(c0).Z + BAND(c0).gr * 0.9)]) : [];
  for (const [x, y, z] of gp) for (const r of [0.2, 0.2 + Math.PI / 2]) quad(x, y, z, 0.035, 0.22, false, r);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); decoCache.set(k, g); return g; }
const skipOverride = m => { m.onBeforeRender = (r, sc, c, geo, mat) => { if (mat !== m.material) geo.setDrawRange(0, 0); }; m.onAfterRender = (r, sc, c, geo) => { geo.setDrawRange(0, Infinity); }; };      // 後製用替代材質重畫整個場景時（算環境遮蔽的那一道）這個網格不畫
export const HUE_N = 13;                         // 0 為原色，1–12 為目標色相（每 30 度）
export const hueCss = i => i === 0 ? null : `hsl(${(i - 1) * 30} 62% 50%)`;
const SETS = { '1h': { idle: 'Idle' }, '2h': { idle: '2H_Melee_Idle' }, 'dual': { idle: 'Idle' }, 'bow': { idle: 'Idle' } };
export const weaponSet = l => (WEAPONS[l.wp] || WEAPONS[0]).set;
// 外觀字串：「3;基本欄位（逗號分隔）;臉部代碼」。數值都會夾在合法範圍內；舊格式會轉成預設臉
const ORDER = [['g', 0, 1, 0], ['body', 0, 3, 0], ['hue', 0, 12, 0], ['wp', 0, WEAPONS.length - 1, 0], ['hat', 0, HATS.length - 1, 0], ['cape', 0, CAPES.length - 1, 1], ['h', 85, 115, 100], ['hs', 80, 125, 100], ['chest', 0, 100, 50], ['belly', 0, 100, 50], ['arm', 0, 100, 50], ['leg', 0, 100, 50], ['cc', 0, CAPE_COLORS.length - 1, 0]];
export const isNewLook = s => typeof s === 'string' && s.startsWith('5;');
export function parseLook(s) {
  const l = {}; s = String(s || ''); ORDER.forEach(([k, , , d]) => { l[k] = d; });
  if (/^[345];/.test(s)) { const seg = s.split(';'), p = (seg[1] || '').split(','); ORDER.forEach(([k, lo, hi, d], i) => { const v = parseInt(p[i], 10); l[k] = Number.isFinite(v) ? clamp(v, lo, hi) : d; }); l.face = s[0] === '5' ? decodeFace(seg[2], l.g) : defaultFace(l.g); }      // 3、4 版的臉是舊的做法，無法沿用
  else {      // 舊格式：只沿用服裝、色調、武器
    const p = s.replace(/^2;/, '').split(','), old = { knight: [0, [0, 1, 2, 3]], barbarian: [1, [5, 4, 6]], mage: [2, [7, 8]], rogue: [3, [9, 10]], hooded: [3, [9, 10]] }[p[0]];
    if (old) { l.body = old[0]; l.hue = clamp(parseInt(p[1], 10) || 0, 0, 12); l.wp = old[1][clamp(parseInt(p[3], 10) || 0, 0, old[1].length - 1)]; }
    l.face = defaultFace(l.g);
  }
  return l;
}
export const lookStr = l => '5;' + ORDER.map(([k]) => l[k]).join(',') + ';' + encodeFace(l.face);
export function randomLook(g) { const l = parseLook(''); l.g = g == null ? (Math.random() < 0.5 ? 1 : 0) : g; l.body = Math.floor(Math.random() * 4); l.hue = Math.floor(Math.random() * 13); l.wp = Math.floor(Math.random() * WEAPONS.length); l.cape = Math.floor(Math.random() * CAPES.length); l.cc = Math.floor(Math.random() * CAPE_COLORS.length); l.h = 92 + Math.floor(Math.random() * 17); for (const k of ['chest', 'belly', 'arm', 'leg']) l[k] = 30 + Math.floor(Math.random() * 40); l.face = randomFace(l.g); return l; }

const protos = {}, clips = {}, impact = {}, texCache = new Map(), geoCache = new Map(), parts = {};
export const clipDur = n => (clips[n] ? clips[n].duration : 1);
export async function loadAvatars(progress) {
  let done = 0; const pack = await loadPack('assets/chars.json', 'assets/');
  for (const k of BODY_KEYS) {
    const g = pack[BODIES[k].file]; protos[k] = g.scene; parts[k] = {};
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (!o.isSkinnedMesh) parts[k][o.name] = o; } });
    if (g.animations.length) g.animations.forEach(c => { clips[c.name] = c; }); progress && progress(++done / BODY_KEYS.length);
  }
  // 分離動作：「UP:」只有雙臂、「LO:」是其餘骨頭。雙手武器跑步與格擋時下半身照跑、照蹲，雙手仍握著武器
  const ARM = /^(upperarm|lowerarm|wrist|hand|handslot)[lr]\./, part = (name, arm) => { const c = clips[name]; if (c) clips[(arm ? 'UP:' : 'LO:') + name] = new THREE.AnimationClip((arm ? 'UP:' : 'LO:') + name, c.duration, c.tracks.filter(t => ARM.test(t.name) === arm)); };
  part('2H_Melee_Idle', true); part('Running_A', false); part('Blocking', false); part('Walking_Backwards', false); part('Running_Strafe_Left', false); part('Running_Strafe_Right', false);
  // 找出每個攻擊動作揮到最快的時間點，用來對齊傷害判定
  const probe = SkeletonUtils.clone(protos.knight), mixer = new THREE.AnimationMixer(probe), hand = probe.getObjectByName('handslotr') || probe, p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  for (const name in clips) {
    if (!/Attack|Throw|Spellcast_Shoot|Kick/.test(name)) continue; const c = clips[name];
    const a = mixer.clipAction(c); a.play(); let best = 0, bestT = c.duration * 0.45; mixer.setTime(0); probe.updateMatrixWorld(true); hand.getWorldPosition(p0);
    for (let t = 0.04; t < c.duration * 0.85; t += 0.03) { mixer.setTime(t); probe.updateMatrixWorld(true); hand.getWorldPosition(p1); const v = p1.distanceTo(p0); if (v > best) { best = v; bestT = t; } p0.copy(p1); }
    impact[name] = bestT + 0.02; a.stop(); mixer.uncacheAction(c);
  }
}
// 服裝貼圖：把這套服裝的主色相轉到指定色相，膚色換成指定膚色；金屬與皮革不動
function bodyTexture(body, hue, skin) {
  const k = body + ':' + hue + ':' + skin; if (texCache.has(k)) return texCache.get(k);
  let base = null; protos[body].traverse(o => { if (o.isMesh && o.material.map && !base) base = o.material.map; });
  if (!base || !base.image) { texCache.set(k, base); return base; }
  const img = base.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const id = cx.getImageData(0, 0, cv.width, cv.height), px = id.data, shift = hue === 0 ? 0 : (((hue - 1) * 30 - BODIES[body].base + 720) % 360) / 360, sk = new THREE.Color(FACE.skin[skin] || FACE.skin[1]), sr = sk.r, sg = sk.g, sb = sk.b;
  const lin = v => Math.pow(v, 1 / 2.2) * 255, skR = lin(sr), skG = lin(sg), skB = lin(sb);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.0001) continue; const s = d / mx; let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    if (h >= 12 && h <= 38 && s <= 0.5 && s > 0.12 && mx >= 0.75) { const kk = mx / 0.98; px[i] = Math.min(255, skR * kk); px[i + 1] = Math.min(255, skG * kk); px[i + 2] = Math.min(255, skB * kk); continue; }    // 皮膚
    if (shift === 0 || s < 0.3 || mx < 0.16) continue;
    if (h >= 6 && h <= 34 && mx < 0.75) continue;                                 // 皮革與木頭
    h = ((h / 360 + shift) % 1) * 6; const q = Math.floor(h), t = h - q, p = mx * (1 - s), u = mx * (1 - s * t), w = mx * (1 - s * (1 - t));
    const rgb = q === 0 ? [mx, w, p] : q === 1 ? [u, mx, p] : q === 2 ? [p, mx, w] : q === 3 ? [p, u, mx] : q === 4 ? [w, p, mx] : [mx, p, u];
    px[i] = rgb[0] * 255; px[i + 1] = rgb[1] * 255; px[i + 2] = rgb[2] * 255;
  }
  cx.putImageData(id, 0, 0);
  const tx = new THREE.CanvasTexture(cv); tx.flipY = base.flipY; tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = base.wrapS; tx.wrapT = base.wrapT; tx.magFilter = base.magFilter; tx.minFilter = base.minFilter; tx.generateMipmaps = base.generateMipmaps;
  texCache.set(k, tx); return tx;
}
// 胖瘦與性別：在綁定姿勢下把身體、手臂、腿的頂點沿粗細方向縮放（不動骨架，所以動作不受影響）
function shapedGeo(body, part, src, fx, fz, fl, waist) {
  const k = [body, part, fx.toFixed(2), fz.toFixed(2), fl.toFixed(2), waist].join('|'); if (geoCache.has(k)) return geoCache.get(k);
  const g = src.clone(), p = g.attributes.position.clone(); g.setAttribute('position', p);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (part === 'Body') { const wt = waist ? 1 - 0.1 * Math.sin(smooth(0.56, 1.0, y) * Math.PI) : 1, belly = 1 + (fz - 1) * (0.5 + 0.5 * Math.sin(smooth(0.4, 1.2, y) * Math.PI)); x *= fx * wt; z *= z > 0 ? belly : 1 + (fz - 1) * 0.5; }
    else if (part.startsWith('Leg')) { const sd = Math.sign(x) || 1, c = 0.171 * sd; x = c * (1 + (fx - 1) * 0.55) + (x - c) * fl; z *= fl; }
    else { const sd = Math.sign(x) || 1; y = 1.115 + (y - 1.115) * fl; z *= fl; x += sd * (fx - 1) * 0.3 * (waist ? 0.8 : 1) - (waist ? sd * 0.012 : 0); }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); geoCache.set(k, g); return g;
}
// 頭的位置：下巴底固定在領口上緣（頭骨座標），頭再大也是往上長。帽子原本是照素材的方頭做的，依實際頭型縮放後戴上
const CHIN_AT = new THREE.Vector3(0, 0.06, 0.02), HAT_BASE = new THREE.Vector3(0, -0.03, 0.02), HAT_TOP = 0.98, HAT_HALF = 0.543;
// 手臂的固定姿勢：在胸口座標裡指定上臂、前臂、手掌各自朝哪個方向（[方向, 手背朝向]），換算成各骨頭的區域旋轉。
// 動作播完後再疊上去，所以不管跑步、揮擊，這隻手都維持同一個拿法。x 為角色左方、y 上、z 前；右手的 x 會自動鏡射
const ARM_POSES = {
  book: { side: 'l', u: [[0.2, -0.93, 0.3], [1, 0, 0]], f: [[-0.5, 0.2, 0.84], [1, 0, 0.3]], h: [[-0.5, 0.55, 0.84], [1, 0, 0.3]] },      // 魔導書：左手肘貼身、前臂平舉在胸前，書攤在拳頭上
  guard: { side: 'r', u: [[0.35, -0.6, 0.72], [1, 0, 0]], f: [[-0.6, 0.62, 0.5], [0.7, 0.2, 0.7]], h: [[-0.6, 0.62, 0.5], [0.7, 0.2, 0.7]] }      // 單匕首格擋：右手橫在胸前
};
// 游泳的手臂關鍵姿勢（寫法同 ARM_POSES 的左手；身體趴平時 y 是前方、z 朝水底）。前四個是自由式的一圈：往前伸 → 往下划 → 收到腿邊 → 抬肘出水回到前面；後兩個是踩水（雙手在身體兩側來回撥水）
const SWIM_KEYS = [
  { u: [[0.22, 0.96, 0.1], [0, 0, -1]], f: [[0.05, 1, 0.12], [0, 0, -1]], h: [[0, 1, 0.2], [0, 0, -1]] },
  { u: [[0.32, 0.25, 0.9], [0, 1, 0]], f: [[0.1, -0.35, 0.93], [0, 1, 0]], h: [[0.1, -0.5, 0.86], [0, 1, 0]] },
  { u: [[0.3, -0.93, 0.18], [0, 0, 1]], f: [[0.22, -0.97, 0.05], [0, 0, 1]], h: [[0.22, -0.97, 0], [0, 0, 1]] },
  { u: [[0.72, 0.3, -0.62], [0, 1, 0]], f: [[0.4, 0.88, -0.25], [0.4, 0, -0.9]], h: [[0.3, 0.95, -0.05], [0.4, 0, -0.9]] },
  { u: [[0.82, -0.4, 0.4], [0, 1, 0]], f: [[0.8, 0.05, 0.6], [0, 1, 0]], h: [[0.8, 0.15, 0.58], [0, 1, 0]] },
  { u: [[0.6, -0.4, 0.7], [0, 1, 0]], f: [[0.3, 0.05, 0.95], [0, 1, 0]], h: [[0.25, 0.15, 0.95], [0, 1, 0]] }
], SWIM_AT = [0, 0.24, 0.48, 0.74, 1];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _NY = new THREE.Vector3(0, -1, 0);
/* ---------- 弓（程式生成：KayKit 這一包只有弩，沒有弓） ---------- */
// 弓的座標：握把在原點，弓身沿 Y，箭朝 +Z 射出，弦在 -Z 那一側。塊面與配色比照 KayKit 的武器（木頭、皮革握把、銅色束環、骨色弓梢）
const BOW = { half: 0.76, rest: 0.21, yaw: 0.92, arrow: 0.94 };      // half 弓梢到握把的高度、rest 弦離握把多遠、yaw 拉弓時身體側過去的角度、arrow 箭長
const bowZ = t => -BOW.rest * Math.pow(Math.abs(t), 1.7) + 0.075 * smooth(0.72, 1, Math.abs(t));      // 弓身的弧線（t：-1 下梢 … 1 上梢），弓梢往前翹一點
let bowKit = null;
function bowParts() {
  if (bowKit) return bowKit;
  const parts = [], N = 7, P = t => new THREE.Vector3(0, BOW.half * t, bowZ(t));
  for (const sg of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = sg * (0.1 + 0.9 * i / N), t1 = sg * (0.1 + 0.9 * (i + 1) / N), a = P(t0), b = P(t1), len = a.distanceTo(b), k = 1 - 0.52 * (i + 0.5) / N;
    const g = new THREE.BoxGeometry(0.1 * k, len * 1.06, 0.07 * k); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_Y, b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push([g, i === N - 1 ? 0xe9dfc6 : i === 0 ? 0xc9a35a : 0x8a5a34]);
  }
  { const g = new THREE.BoxGeometry(0.1, BOW.half * 0.24, 0.085); g.translate(0, 0, -0.004); parts.push([g, 0x4a3323]); }      // 握把
  const stave = mergeColored(parts), cyl = new THREE.CylinderGeometry(0.009, 0.009, 1, 4);
  const quiver = (() => { const body = new THREE.CylinderGeometry(0.105, 0.085, 0.62, 7), rim = new THREE.CylinderGeometry(0.118, 0.118, 0.07, 7), pr = [[body, 0x6d4630], [rim, 0xc9a35a]]; rim.translate(0, 0.3, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.5, sh = new THREE.CylinderGeometry(0.014, 0.014, 0.3, 4), fl = new THREE.BoxGeometry(0.075, 0.16, 0.012); sh.translate(Math.cos(a) * 0.045, 0.42, Math.sin(a) * 0.045); fl.rotateY(a); fl.translate(Math.cos(a) * 0.045, 0.5, Math.sin(a) * 0.045); pr.push([sh, 0xc9a56c], [fl, i % 2 ? 0xf2efe6 : 0xc8442e]); }
    return mergeColored(pr); })();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 }), smat = new THREE.MeshStandardMaterial({ color: 0xefe9da, roughness: 0.9 });
  return bowKit = { stave, cyl, quiver, arrow: arrowGeo(BOW.arrow), mat, smat, tip: [P(1), P(-1)] };
}
// 兩節手臂的姿勢：肩 S、手腕要到的位置 T、兩節的長度、手肘偏向的方向 → [上臂方向, 前臂方向]
function armIK(S, T, l1, l2, pole) {
  const d = T.clone().sub(S), L = Math.min(d.length(), (l1 + l2) * 0.998), dn = d.clone().normalize(), ca = (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const pp = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize(), E = S.clone().addScaledVector(dn, l1 * ca).addScaledVector(pp, l1 * sa);
  return [E.clone().sub(S).normalize(), S.clone().addScaledVector(dn, L).sub(E).normalize()];
}
// 拉弓的幾個關鍵姿勢（胸口座標：x 左、y 上、z 前）。身體側過去 BOW.yaw，所以「正前方」在胸口座標裡偏左。
// 搭箭：弓拿在胸前、手肘彎著；拉滿：持弓的手往前推直、拉弦的手拉到下巴旁；放箭後拉弦的手再往後帶一點。必須在骨架還是 T 字姿勢時呼叫
function bowTargets(root) {
  const th = BOW.yaw, a = new THREE.Vector3(Math.sin(th), 0, Math.cos(th)), left = [Math.cos(th), 0, -Math.sin(th)], V = (x, y, z) => new THREE.Vector3(x, y, z), arr = v => [v.x, v.y, v.z];
  const Ls = V(0.212, 0.134, 0), Rs = V(-0.212, 0.134, 0), l1 = 0.242, l2 = 0.334, hl = 0.096, anchor = V(-0.07, 0.2, 0.21), drawLen = 0.56;
  const gripD = anchor.clone().addScaledVector(a, drawLen), gripN = anchor.clone().addScaledVector(a, drawLen * 0.56).add(V(0.02, -0.09, 0));
  const L = grip => { const [u, f] = armIK(Ls, grip.clone().addScaledVector(a, -hl), l1, l2, V(0.5, -1, -0.1)); return { side: 'l', u: [arr(u), left], f: [arr(f), left], h: [arr(a), left] }; };
  const R = (hand, pole) => { const [u, f] = armIK(Rs, hand.clone().addScaledVector(a, hl * 0.6), l1, l2, pole), m = v => [-v.x, v.y, v.z]; return { side: 'r', u: [m(u), [0, 1, 0]], f: [m(f), [0, 1, 0.2]], h: [m(f), [0, 1, 0.2]] }; };
  const keysL = [L(gripN), L(gripD)].map(p => armTargets(root, p)), pole = V(-0.5, 0.35, -0.8);
  const keysR = [R(gripN.clone().addScaledVector(a, -BOW.rest), V(-0.6, -0.5, -0.3)), R(anchor, pole), R(anchor.clone().addScaledVector(a, -0.13).add(V(-0.04, 0.03, 0)), pole)].map(p => armTargets(root, p));
  if (keysL.some(k => !k) || keysR.some(k => !k)) return null;
  const zip = ks => ks[0].map((t, i) => [t[0], ks.map(k => k[i][1]), new THREE.Quaternion(), new THREE.Quaternion()]);
  return { armL: zip(keysL), armR: zip(keysR), head: [root.getObjectByName('head'), null, new THREE.Quaternion(), new THREE.Quaternion()] };
}
function basisQ(a, b) { const x = new THREE.Vector3(a[0], a[1], a[2]).normalize(), y = new THREE.Vector3(b[0], b[1], b[2]); y.addScaledVector(x, -y.dot(x)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y))); }
// 手臂四根骨頭（上臂、前臂、手腕、手）在原始 T 字姿勢下相對胸口的朝向，記下來之後任何時候都能換算姿勢（舉魚要每一幀重算）
function armRest(root, sd) {
  const B = n => root.getObjectByName(n), chest = B('chest'), bones = ['upperarm', 'lowerarm', 'wrist', 'hand'].map(n => B(n + sd)); if (!chest || bones.some(b => !b)) return null;
  const wc = chest.getWorldQuaternion(new THREE.Quaternion()).invert();
  return { sd, bones, rel: bones.map(b => b.getWorldQuaternion(new THREE.Quaternion()).premultiply(wc)) };
}
// 姿勢 → [[骨頭, 目標區域旋轉, 0, 0], ...]（後兩個是 fix() 記動作值用的空位）
function armFrom(R, pose) {
  const sg = R.sd === 'l' ? 1 : -1, r0 = basisQ([sg, 0, 0], [0, 1, 0]).invert();
  const rot = ([a, b]) => basisQ([a[0] * sg, a[1], a[2]], [b[0] * sg, b[1], b[2]]).multiply(r0), want = [rot(pose.u), rot(pose.f), rot(pose.f), rot(pose.h)].map((r, i) => r.multiply(R.rel[i]));
  return R.bones.map((b, i) => [b, i ? want[i - 1].clone().invert().multiply(want[i]) : want[0], new THREE.Quaternion(), new THREE.Quaternion()]);
}
// 回傳 [[骨頭, 目標區域旋轉], ...]；必須在骨架還是原始 T 字姿勢時呼叫
function armTargets(root, pose) { const R = armRest(root, pose.side); return R && armFrom(R, pose); }
// 爬坡姿勢各骨頭旋轉的正方向（依 KayKit 骨架實測）：lean 上身前傾、fwd 手往前擺、abd 手往外張（左手；右手相反）、elb 手肘彎；ph 擺手的相位（右腳在前時左手在前）、rph 左右晃的相位（重心移到踩地的那隻腳）
const CLP = { lean: 1, fwd: -1, abd: 1, elb: 1, ph: -1.26, rph: -1.571 };
// 肩、各節長度（胸口座標，單位和骨架相同，不含角色整體縮放）：舉魚用的兩節手臂 IK 要用
function armDims(root) {
  const B = n => root.getObjectByName(n), ch = B('chest'); if (!ch || !B('handslotl') || !B('handslotr')) return null;
  const cp = ch.getWorldPosition(new THREE.Vector3()), wc = ch.getWorldQuaternion(new THREE.Quaternion()).invert(), sc = ch.getWorldScale(new THREE.Vector3()), P = n => B(n).getWorldPosition(new THREE.Vector3()).sub(cp).applyQuaternion(wc).divide(sc), out = {};
  // al：拳心（handslot）在手腕前方多遠（沿手臂方向）、pp：偏在手背的反方向多少（T 字姿勢下手背朝上，拳心在掌側，所以是負的）
  for (const sd of ['l', 'r']) { const S = P('upperarm' + sd), E = P('lowerarm' + sd), W = P('wrist' + sd), H = P('handslot' + sd), d = H.clone().sub(W); out[sd] = { S, l1: S.distanceTo(E), l2: E.distanceTo(W), al: Math.abs(d.x), pp: d.y }; }
  out.shift = 0; return out;
}
// 一隻手抓住胸口座標裡的 g.p（拳心）、手背朝 g.back：算出兩節手臂的姿勢。回傳 armFrom 的結果。
// 手腕要到的位置 = 拳心 − 沿前臂 (al + 手臂網格外推量) − 手背反方向 pp；前臂方向要先知道，所以先用「肩到拳心」估一次、解出 IK 之後再修正一次
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3(), _g4 = new THREE.Vector3();
function gripArm(D, R, sd, g) {
  const d = D[sd], S = d.S, al = d.al + D.shift, pole = _g3.set(sd === 'l' ? 0.55 : -0.55, -1, -0.15), m = v => sd === 'l' ? [v.x, v.y, v.z] : [-v.x, v.y, v.z];
  let f = _g1.copy(g.p).sub(S).normalize(), u, Wt = _g2;
  for (let it = 0; it < 2; it++) { Wt.copy(g.p).addScaledVector(f, -al); const bk = _g4.copy(g.back).addScaledVector(f, -g.back.dot(f)); if (bk.lengthSq() > 1e-4) Wt.addScaledVector(bk.normalize(), -d.pp); [u, f] = armIK(S, Wt, d.l1, d.l2, pole); }
  const ref = (dir, bk) => { const b = bk.clone().addScaledVector(dir, -bk.dot(dir)); if (b.lengthSq() < 0.02) b.set(0, 1, 0).addScaledVector(dir, -dir.y); return m(b.normalize()); };
  return armFrom(R, { u: [m(u), ref(u, g.back)], f: [m(f), ref(f, g.back)], h: [m(f), ref(f, g.back)] });
}
export class Avatar {
  constructor(look) { this.group = new THREE.Group(); this.spin = new THREE.Group(); this.spin.position.y = 0.62; this.group.add(this.spin); this.root = null; this.mixer = null; this.act = {}; this.look = null; this.bodyKey = ''; this.mats = []; this.extra = []; this.own = []; this.cheerT = 0; this.grip = null; this.gw = 0; this.hitT = 0; this.w = { act: 0, roll: 0, dead: 0, hit: 0, cheer: 0, block: 0, charge: 0, swim: 0, stroke: 0, slide: 0 }; this.swimPh = 0; this.fadeMats = new Map(); this.lastAct = ''; this.setLook(look); W.scene.add(this.group); }
  setLook(s) {
    const l = this.look = typeof s === 'string' ? parseLook(s) : Object.assign({}, s), key = BODY_KEYS[l.body] || 'knight';
    if (this.bodyKey !== key) {
      if (this.root) { this.spin.remove(this.root); this.mixer.stopAllAction(); }
      this.root = SkeletonUtils.clone(protos[key]); this.root.position.y = -0.62; this.bodyKey = key; this.spin.add(this.root);
      this.mixer = new THREE.AnimationMixer(this.root); this.act = {}; this.bodyMat = null; this.skinned = [];
      this.root.traverse(o => { if (o.isSkinnedMesh) { if (/_Head$/.test(o.name)) o.visible = false; else { if (!this.bodyMat) this.bodyMat = o.material.clone(); o.material = this.bodyMat; o.userData.src = o.geometry; this.skinned.push(o); } } });
      const own = []; this.root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) own.push(o); }); own.forEach(o => o.parent.remove(o));       // 服裝自帶的武器、帽子、披風一律拿掉，改由下面依外觀掛上
      this.bones = { l: this.root.getObjectByName('handslotl'), r: this.root.getObjectByName('handslotr'), head: this.root.getObjectByName('head'), chest: this.root.getObjectByName('chest') };
      this.armT = {}; for (const k in ARM_POSES) this.armT[k] = armTargets(this.root, ARM_POSES[k]);
      // 兩手抓東西（舉魚）：每一幀依 this.grip 重算兩隻手臂。armRest＝T 字姿勢的朝向、armDim＝肩的位置與各節長度（胸口座標）
      this.armRest = { l: armRest(this.root, 'l'), r: armRest(this.root, 'r') }; this.armDim = armDims(this.root); this.gw = 0; this.gripOn = false;
      this.gripT = this.armRest.l && this.armRest.r ? { l: this.armRest.l.bones.map(b => [b, new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]), r: this.armRest.r.bones.map(b => [b, new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]) } : null;
      this.gripB = ['spine', 'head'].map(n => { const b = this.root.getObjectByName(n); return b ? [b, null, new THREE.Quaternion(), new THREE.Quaternion()] : null; });
      this.bowT = bowTargets(this.root); this.hips = this.root.getObjectByName('hips');
      this.raise = ['upperarml', 'upperarmr'].map(n => [this.root.getObjectByName(n), null, new THREE.Quaternion(), new THREE.Quaternion()]).filter(t => t[0]);
      // 游泳：兩隻手各四根骨頭的關鍵姿勢，加上頭與兩條大腿（各自記住動作原本的值，疊上去才不會累加）
      this.swimArm = ['l', 'r'].map(side => { const ks = SWIM_KEYS.map(p => armTargets(this.root, Object.assign({ side }, p))); return ks.every(k => k) ? ks[0].map((t, i) => [t[0], ks.map(k => k[i][1]), new THREE.Quaternion(), new THREE.Quaternion()]) : []; });
      this.headRest = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.bones.head.getWorldQuaternion(new THREE.Quaternion()));
      this.swimB = ['head', 'upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr'].map(n => [this.root.getObjectByName(n), null, new THREE.Quaternion(), new THREE.Quaternion()]);
      // 爬坡、下坡煞車：每根骨頭一筆 [骨頭, 原始 T 字姿勢的旋轉, 動作值, 上次寫入值]（腿的步幅是「相對 T 字姿勢的偏移」放大或縮小）
      this.climbB = {}; for (const n of ['upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'head', 'spine', 'chest', 'upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr']) { const b = this.root.getObjectByName(n); this.climbB[n] = b ? [b, b.quaternion.clone(), new THREE.Quaternion(), new THREE.Quaternion()] : null; }
    }
    this.extra.forEach(o => o.parent && o.parent.remove(o)); this.extra = []; this.mats = [this.bodyMat]; this.own.forEach(g => g.dispose()); this.own = [];
    const F = l.face, tex = bodyTexture(key, l.hue, F.skin); if (this.bodyMat.map !== tex) { this.bodyMat.map = tex; this.bodyMat.needsUpdate = true; }
    // 體型：身高改變腿與軀幹的比例（頭不跟著放大），上身、腹部、手臂、腿各自調整
    const k = l.h / 100, slim = Math.pow(k, -0.35), gk = l.g ? 0.94 : 1, fx = lerp(0.84, 1.3, l.chest / 100) * slim * gk, fz = lerp(0.88, 1.55, l.belly / 100) * slim * (l.g ? 0.95 : 1), fa = lerp(0.84, 1.3, l.arm / 100) * slim * gk, fg = lerp(0.86, 1.28, l.leg / 100) * slim * gk;
    for (const o of this.skinned) { const part = o.name.replace(/^[A-Za-z]+_/, ''); o.geometry = shapedGeo(key, part, o.userData.src, fx, fz, part.startsWith('Arm') ? fa : fg, l.g ? 1 : 0); }
    if (this.armDim) this.armDim.shift = (fx - 1) * 0.3 * (l.g ? 0.8 : 1) - (l.g ? 0.012 : 0);      // 手臂網格被往外推了這麼多（見 shapedGeo），拳頭比骨頭遠一點
    this.group.scale.setScalar(1.07 * k); const hs = (l.hs / 100) / Math.pow(k, 0.85);
    const attach = (src, node, bone, hat) => {
      const p = parts[src] && parts[src][node]; if (!p || !bone) return null; const m = p.clone(), mk = 'm:' + src + ':' + l.hue + ':' + F.skin; let mm = texCache.get(mk); if (!mm) { mm = p.material.clone(); mm.map = bodyTexture(src, l.hue, F.skin); texCache.set(mk, mm); }
      m.material = mm; m.visible = true; m.userData.mm = mm; m.userData.node = node;
      if (hat) { const g = new THREE.Group(); g.position.set(CHIN_AT.x, CHIN_AT.y, CHIN_AT.z); g.scale.set(hat.w, hat.h, hat.w); m.position.sub(HAT_BASE); g.add(m); bone.add(g); this.extra.push(g); } else { bone.add(m); this.extra.push(m); }
      return m;
    };
    const wp = WEAPONS[l.wp] || WEAPONS[0]; this.set = SETS[wp.set]; this.setName = wp.set;
    for (const T of [this.hold, this.guard, this.raise, this.bowT && this.bowT.armL, this.bowT && this.bowT.armR, this.bowT && [this.bowT.head]]) if (T) for (const t of T) if (t[0].quaternion.equals(t[3])) t[0].quaternion.copy(t[2]);      // 換武器：把上一把武器疊上去的手臂姿勢還原
    this.hold = null; this.guard = l.wp === 10 ? this.armT.guard : null; this.hw = 1; this.tilts = []; this.tw = 0; this.weap = []; this.wHide = false; this.fadeDirty = true;
    for (const n of wp.show) { const left = /Offhand|Shield|Spellbook/.test(n), m = attach(wp.src, n, left ? this.bones.l : this.bones.r); if (m) this.weap.push(m);
      if (m && wp.set !== '2h' && !/Shield|Spellbook/.test(n)) { const pv = new THREE.Group(); m.parent.add(pv); pv.add(m); this.extra.push(pv); this.tilts.push([pv, left ? 1 : -1]); }      // 單手武器掛在可轉動的支點上：跑步時把刃尖壓低，才不會甩到臉前面
      if (m && /Spellbook/.test(n)) { m.scale.setScalar(0.68); m.position.set(0, 0.125, 0); m.quaternion.premultiply(_q.setFromAxisAngle(_v.set(0, 1, 0), -Math.PI / 2)); this.hold = this.armT.book; } }      // 魔導書：原本是大大一本貼在手邊，改成合理大小、攤開托在左拳上、書頭朝前
    // 弓：握在左手（弓身沿手握的方向，箭朝指節的方向），弦用兩段細圓柱接到搭箭點，另有一支搭在弦上的箭與掛在右腰後的箭袋
    this.bow = null; if (!this.swimOn) this.spin.rotation.y = 0;
    if (wp.set === 'bow' && this.bones.l && this.bowT) {
      const K = bowParts(), g = new THREE.Group(), mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false; g.add(m); return m; };
      g.rotation.y = -Math.PI / 2; mk(K.stave, K.mat); const s1 = mk(K.cyl, K.smat), s2 = mk(K.cyl, K.smat), ar = mk(K.arrow, K.mat); ar.visible = false; this.bones.l.add(g); this.extra.push(g); this.weap.push(g);
      this.bow = { g, s1, s2, ar, tip: K.tip, nock: new THREE.Vector3(0, 0, -BOW.rest), draw: 0, loose: -1, on: false, T: this.bowT }; this.strings();
      if (this.hips) { const q = new THREE.Mesh(K.quiver, K.mat); q.castShadow = true; q.position.set(-0.27, 0.06, -0.2); q.rotation.set(-0.5, 0, -0.3); this.hips.add(q); this.extra.push(q); this.weap.push(q); }
    }
    this.cape = null; if (l.cape && this.bones.chest) { const c = new THREE.Mesh(capeGeo(l.cape), capeMat(l.cc)); c.position.set(0, 0.25, -0.02); c.scale.x = fx; c.castShadow = true; this.bones.chest.add(c); this.extra.push(c); this.cape = c; }
    // 頭：由臉部參數即時變形出來
    const head = buildHead(F, this.mats, this.own), ud = head.userData, sc = HEAD_R * hs, hg = new THREE.Group(); hg.position.set(CHIN_AT.x, CHIN_AT.y - ud.bottom * sc, CHIN_AT.z); hg.scale.setScalar(sc); hg.add(head); this.bones.head.add(hg); this.extra.push(hg); this.headG = hg;
    const hat = l.hat ? HATS[l.hat] : null; if (hat) attach(hat.src, hat.node, this.bones.head, { w: ud.halfW * sc / HAT_HALF * (l.hat === 2 ? 1.13 : 1.04), h: (ud.top - ud.bottom) * sc / HAT_TOP * (l.hat === 2 ? 1.08 : 1.02) });
    { const hair = head.getObjectByName('hair'), top = head.getObjectByName('hairTop'); if (hair && (l.hat === 1 || l.hat === 3)) hair.visible = false;       // 全罩的頭盔下不顯示頭髮
      else if (hair && l.hat === 2) { if (top) top.visible = false; hair.scale.set(0.945, 0.93, 0.945); } }       // 巫師帽：收起頭頂的丸子、髮圈與尖刺，頭髮壓扁一點，才不會穿出帽子
    if (l.hat) { const k = head.getObjectByName('kemono'); if (k) k.visible = false; }
    Object.values(this.act).forEach(a => a.setEffectiveWeight(0));
    this.applyGear();
  }
  /* ---------- 0.6 裝備外觀 ---------- */
  // 依階級與獸飾更新武器外觀、穿脫獸皮披肩。g：{ tier, charm, pelt } 可以只給其中幾項（沒給的維持原狀）。換外觀（setLook）後會自動重新掛上。別的玩家的角色也是呼叫這個
  setGear(g) { const o = Object.assign({}, this.gear || {}, g || {}), n = normGear(o), old = this.gear; if (old && old.tier === n.tier && old.charm === n.charm && old.pelt === n.pelt) return; this.gear = n; this.applyGear(); }
  setWeaponTier(tier, charm) { this.setGear(charm === undefined ? { tier } : { tier, charm }); }
  setPelt(kind) { this.setGear({ pelt: kind || '' }); }
  applyGear() {
    const G = this.gear || (this.gear = normGear(null)), X = this.gx || (this.gx = { objs: [], mats: [], auras: [], dangle: [], pelt: null, tail: null });
    for (const o of X.objs) { if (o.parent) o.parent.remove(o); if (o.isSkinnedMesh) o.skeleton.dispose(); } this.mats = this.mats.filter(m => !X.mats.includes(m)); X.mats.forEach(m => m.dispose());
    for (const m of this.weap || []) m.traverse(o => { if (o.isMesh && o.userData.mm0) { o.material = o.userData.mm0; o.userData.mm0 = null; } if (o.isMesh && o.userData.geo0) { o.geometry = o.userData.geo0; o.userData.geo0 = null; } });
    X.objs = []; X.mats = []; X.auras = []; X.dangle = []; X.pelt = null; X.tail = null; this.fadeDirty = true;
    // 武器：每一件有定位資料的武器（盾與書不裝飾）先換成這一階的配色，再疊一個裝飾網格；獸飾只掛在第一件（主手）上
    let first = true;
    for (const w of this.weap || []) {
      const node = w.isMesh ? w.userData.node : this.bow && w === this.bow.g ? 'bow' : null; if (!node || !WDECO[node]) continue;
      const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== auraMat; m.frustumCulled = false; w.add(m); X.objs.push(m); return m; };
      const body = w.isMesh ? w : w.children[0];
      if (G.tier >= 1 && body && body.isMesh) { const g2 = w.isMesh ? tierGeo(body.geometry, node, G.tier) : bowStave(G.tier); if (g2 !== body.geometry) { body.userData.geo0 = body.geometry; body.geometry = g2; if (w.isMesh) { body.userData.mm0 = body.material; body.material = vcMat(body.userData.mm || body.material); } } }
      if (G.tier >= 1) { const dg = decoGeo(node, G.tier), S = WDECO[node]; if (dg) add(dg, decoMaterial()); const t = add(tasselGeo(S.tas[3]), decoMaterial()); t.position.set(S.tas[0], S.tas[1], S.tas[2]); X.dangle.push(t); }
      if (G.tier >= 4) { const a = add(auraGeo(node), auraMaterial()); a.renderOrder = 3; skipOverride(a); X.auras.push(a); }
      if (first && G.tier >= 2 && G.charm) { const c = add(charmGeo(G.charm), decoMaterial()), at = WDECO[node].charm; c.position.set(at[0], at[1], at[2]); c.scale.setScalar(1.25); X.dangle.push(c); }
      first = false;
    }
    // 獸皮披肩：蒙皮網格，骨頭＝[披肩自己（跟著胸口與擺動）, 左上臂, 右上臂]；找不到上臂骨頭時退回一般網格（整件跟著胸口）
    if (this.cape) this.cape.visible = !(G.pelt && this.look.cape === 4);      // 「毛皮披肩」這款披風和獸皮披肩在同一個位置，穿了獸皮就不顯示
    if (G.pelt && this.bones.chest) {
      const K = peltGeo(G.pelt), l = this.look, k = l.h / 100, slim = Math.pow(k, -0.35), fx = lerp(0.84, 1.3, l.chest / 100) * slim * (l.g ? 0.94 : 1), fz = lerp(0.88, 1.55, l.belly / 100) * slim * (l.g ? 0.95 : 1), ua = ['upperarml', 'upperarmr'].map(n => this.root.getObjectByName(n));
      const skin = ua[0] && ua[1], pm = skin ? new THREE.SkinnedMesh(K.body, peltMaterial(G.pelt)) : new THREE.Mesh(K.body, peltMaterial(G.pelt)); pm.position.set(0, 0.25, -0.02); pm.rotation.x = 0.02; pm.scale.set(fx, 1, Math.max(1, lerp(1, fz, 0.7))); pm.castShadow = true; pm.frustumCulled = false; this.bones.chest.add(pm); X.objs.push(pm); X.pelt = pm;
      if (skin) { const ref = ua.map(b => peltArmRef(this.root, this.bodyKey, pm, b)), anchor = new THREE.Object3D(); pm.add(anchor);
        if (ref[0] && ref[1]) pm.bind(new THREE.Skeleton([anchor, ua[0], ua[1]], [new THREE.Matrix4(), ref[0].invert(), ref[1].invert()]), new THREE.Matrix4()); else pm.bind(new THREE.Skeleton([anchor, anchor, anchor], [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()]), new THREE.Matrix4()); }
      if (K.tail) { const t = new THREE.Mesh(K.tail, peltMaterial(G.pelt)); t.position.set(K.tailAt[0], K.tailAt[1], K.tailAt[2]); t.rotation.x = 0.26; t.castShadow = true; t.frustumCulled = false; pm.add(t); X.tail = t; }
    }
  }
  strings() { const B = this.bow; for (const [m, tp] of [[B.s1, B.tip[0]], [B.s2, B.tip[1]]]) { _v.copy(B.nock).sub(tp); const len = _v.length(); m.position.copy(tp).addScaledVector(_v, 0.5); m.quaternion.setFromUnitVectors(_Y, _v.multiplyScalar(1 / len)); m.scale.set(1, len, 1); } B.ar.position.set(0, 0, B.nock.z + BOW.arrow / 2 - 0.02); }
  a(name, loop) { let x = this.act[name]; if (!x) { const c = clips[name] || clips.Idle; x = this.act[name] = this.mixer.clipAction(c); x.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); x.clampWhenFinished = true; x.play(); x.setEffectiveWeight(0); if (!loop) x.paused = true; } return x; }
  // s: { speed01, act: {clip, p, dur, hit, span}|null, roll: 0..1|null, block, charge: {clip, k}|null, dead: 秒, flash, swim: 0–1 游泳程度, slide: 0–1 從陡坡滑落 }
  update(dt, s) {
    const k = 1 - Math.exp(-dt * 22), w = this.w, set = this.set, dead = s.dead > 0, act = !dead && s.act, roll = !dead && s.roll != null;
    if (s.flash > 0.9 && this.hitT <= 0 && !act && !roll && !dead && !s.block) this.hitT = 0.3;
    this.hitT = Math.max(0, this.hitT - dt); this.cheerT = Math.max(0, this.cheerT - dt);
    w.dead = lerp(w.dead, dead ? 1 : 0, dead ? k : 1); w.act = lerp(w.act, act ? 1 : 0, k); w.roll = lerp(w.roll, roll ? 1 : 0, k); w.block = lerp(w.block, s.block && !act && !dead ? 1 : 0, k); w.charge = lerp(w.charge, s.charge && !act && !dead ? 1 : 0, k);
    w.swim = dead ? 0 : s.swim || 0; w.stroke = lerp(w.stroke, w.swim > 0.5 ? clamp(s.speed01 / 0.36, 0, 1) : 0, 1 - Math.exp(-dt * 4.5)); w.slide = lerp(w.slide, !dead && !act && !roll ? s.slide || 0 : 0, 1 - Math.exp(-dt * 8));
    w.hit = lerp(w.hit, this.hitT > 0 ? 0.7 : 0, k); w.cheer = lerp(w.cheer, this.cheerT > 0 && !act && !roll && s.speed01 < 0.1 ? 1 : 0, 1 - Math.exp(-dt * 10));
    let rest = 1; const used = new Set();
    const use = (name, wt, time, loop) => { const x = this.a(name, !!loop), ww = Math.min(rest, wt); x.setEffectiveWeight(ww); if (time != null) x.time = clamp(time, 0, x.getClip().duration - 0.001); rest -= ww; used.add(name); };
    if (w.dead > 0.001) use('Death_A', w.dead, Math.min(clips.Death_A.duration - 0.02, s.dead * 1.1));
    { const ji = Math.max(w.roll * 0.9, w.slide * 0.75); if (ji > 0.001) use('Jump_Idle', ji, 0.3); }      // 翻滾與滑落都用騰空的姿勢
    if (act) {
      const c = clips[act.clip] || clips.Idle, name = clips[act.clip] ? act.clip : 'Idle'; let time;
      if (act.hit != null && impact[name]) { const L = Math.min(c.duration * 0.8, act.dur * 1.65), t0 = clamp(impact[name] - (act.hit / act.dur) * L, 0, c.duration - L); time = t0 + clamp(act.p, 0, 1) * L; } else time = clamp(act.p, 0, 1) * (act.span || c.duration * 0.92);
      if (this.lastAct && this.lastAct !== name) this.a(this.lastAct, false).setEffectiveWeight(0); this.lastAct = name; use(name, w.act, time);
    } else if (this.lastAct) { if (w.act > 0.01) use(this.lastAct, w.act); else { this.a(this.lastAct, false).setEffectiveWeight(0); this.lastAct = ''; } }
    if (w.charge > 0.001 && s.charge) use(s.charge.clip, w.charge, (impact[s.charge.clip] || 0.5) * lerp(0.25, 0.5, s.charge.k) + Math.sin(W.time * 30) * 0.008 * s.charge.k); else if (this.chargeClip && this.act[this.chargeClip] && !used.has(this.chargeClip)) this.act[this.chargeClip].setEffectiveWeight(0);
    if (s.charge) this.chargeClip = s.charge.clip;
    const two = this.setName === '2h' && !!clips['LO:Running_A']; let up2 = 0;
    if (w.block > 0.001) { if (two) { const ww = Math.min(rest, w.block); this.a('LO:Blocking', true).setEffectiveWeight(ww); rest -= ww; up2 += ww; used.add('LO:Blocking'); } else use('Blocking', w.block, null, true); }
    if (w.hit > 0.001) use('Hit_A', w.hit, (0.3 - this.hitT) / 0.3 * clips.Hit_A.duration * 0.6);
    if (w.cheer > 0.001) use('Cheer', w.cheer, null, true);
    for (const n of ['Death_A', 'Jump_Idle', 'Blocking', 'LO:Blocking', 'Hit_A', 'Cheer']) if (!used.has(n) && this.act[n]) this.act[n].setEffectiveWeight(0);
    const runName = two ? 'LO:Running_A' : 'Running_A', idle = this.a(set.idle, true), run = this.a(runName, true), sp = clamp(s.speed01, 0, 1) * (1 - w.swim);      // 游泳時不播跑步
    for (const n of ['Idle', '2H_Melee_Idle', 'Running_A', 'LO:Running_A']) if (n !== set.idle && n !== runName && this.act[n]) this.act[n].setEffectiveWeight(0);
    // 面向不跟著移動方向時（鎖定、格擋、蓄力）：s.mv = [前後, 左右]，依方向混合前跑、倒退、左右平移的步伐
    { const mv = s.mv, M = this.mvw || (this.mvw = [1, 0, 0, 0]), pre = two ? 'LO:' : '', kk = 1 - Math.exp(-dt * 12); let t = [1, 0, 0, 0];
      if (mv) { t = [Math.max(0, mv[0]), Math.max(0, -mv[0]), Math.max(0, mv[1]), Math.max(0, -mv[1])]; const sum = t[0] + t[1] + t[2] + t[3] || 1; t = t.map(v => v / sum); }
      for (let i = 0; i < 4; i++) M[i] = lerp(M[i], t[i], kk);
      w.sprint = lerp(w.sprint || 0, s.sprint && !act && !roll ? 1 : 0, 1 - Math.exp(-dt * 8));
      { const off = dead || roll || w.swim > 0.3 || act || s.block || s.charge, F = window.__climbPose; w.cl = lerp(w.cl || 0, off ? 0 : clamp(s.climb || 0, 0, 1), 1 - Math.exp(-dt * 6)); w.ds = lerp(w.ds || 0, off ? 0 : clamp(s.desc || 0, 0, 1), 1 - Math.exp(-dt * 6)); if (F) { w.cl = F[0]; w.ds = F[1]; } }      // __climbPose：測試用，固定爬坡程度
      idle.setEffectiveWeight(rest * (1 - sp)); run.setEffectiveWeight(rest * sp * M[0]); run.timeScale = (0.95 + sp * 0.35 + w.sprint * 0.3) * (1 - 0.36 * w.cl) * (1 + 0.28 * w.ds);      // 爬坡步子慢而重、下坡步子碎而快
      ['Walking_Backwards', 'Running_Strafe_Left', 'Running_Strafe_Right'].forEach((n, i) => { const ww = rest * sp * M[i + 1]; if (ww > 0.001 || this.act[pre + n]) { const x = this.a(pre + n, true); x.setEffectiveWeight(ww); if (!i) x.timeScale = 1.35; } }); }
    if (two) { up2 += rest * sp; this.a('UP:2H_Melee_Idle', true).setEffectiveWeight(up2); }      // 雙手武器：跑步、格擋時雙手仍握著武器
    this.mixer.update(dt);
    // 動作之後再疊上手臂的固定姿勢。動作沒有更新骨頭的那幾幀，要從上次記下的動作值重新疊，才不會越疊越多
    const fix = (t, f) => { const b = t[0]; if (!b.quaternion.equals(t[3])) t[2].copy(b.quaternion); b.quaternion.copy(t[2]); f(b.quaternion); t[3].copy(b.quaternion); };
    if (this.hold) { this.hw = lerp(this.hw, dead || (s.block && !act) || w.swim > 0.3 ? 0 : 1, k); for (const t of this.hold) fix(t, q => q.slerp(t[1], this.hw)); }      // 魔導書：格擋時改成把書往前舉
    if (this.guard) for (const t of this.guard) fix(t, q => q.slerp(t[1], w.block));
    if (this.tilts.length) { this.tw = lerp(this.tw, act || roll || dead || s.block ? 0 : sp, k); for (const t of this.tilts) t[0].rotation.z = t[1] * 0.75 * this.tw; }
    if (two) for (const t of this.raise) fix(t, q => q.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -0.5 * w.block)));      // 雙手武器格擋：把武器舉高橫在身前
    // 爬坡（cl）：上身往前壓、頭抬起來看坡頂、膝蓋抬高步幅大、雙手大幅擺動且手肘外張、身體隨步伐左右晃；
    // 下坡煞車（ds）：整個人往後仰、膝蓋彎低、步子短、雙手往兩側張開保持平衡（從背後看是一個張開的剪影）、頭低下來看腳下
    if ((w.cl > 0.01 || w.ds > 0.01 || this.clOn) && this.climbB.head) {
      this.clOn = w.cl > 0.01 || w.ds > 0.01; const B = this.climbB, rn = this.act[two ? 'LO:Running_A' : 'Running_A'], ph = rn ? rn.time / rn.getClip().duration * TAU : 0, mv = clamp(sp * 1.5, 0, 1), cl = w.cl, ds = w.ds, sw = Math.sin(ph + CLP.ph), arms = !two && !(w.bow > 0.05);
      const rot = (t, ax, a) => { if (t && Math.abs(a) > 1e-4) fix(t, q => q.premultiply(_q.setFromAxisAngle(ax, a))); };
      const amp = (t, k) => { if (t && Math.abs(k - 1) > 1e-3) fix(t, q => { _q2.copy(t[1]).invert().multiply(q); _q.identity().slerp(_q2, k); q.copy(t[1]).multiply(_q); }); };
      rot(B.spine, _X, CLP.lean * (0.42 * cl - 0.12 * ds)); fix(B.chest, q => q.premultiply(_q.setFromAxisAngle(_X, CLP.lean * (0.3 * cl - 0.06 * ds))).premultiply(_q2.setFromAxisAngle(_Y, -0.16 * cl * mv * sw)));
      rot(B.head, _X, CLP.lean * (-0.34 * cl + 0.32 * ds));
      if (arms) for (const [u, lo, sd] of [[B.upperarml, B.lowerarml, 1], [B.upperarmr, B.lowerarmr, -1]]) {
        const swing = CLP.fwd * (0.22 * cl + 0.78 * cl * mv * sw * sd + 0.25 * ds), out = CLP.abd * sd * (0.24 * cl + (0.95 + 0.12 * Math.sin(W.time * 6.5 + sd)) * ds);
        if (u) fix(u, q => q.premultiply(_q.setFromAxisAngle(_X, swing)).premultiply(_q2.setFromAxisAngle(_Z, out))); rot(lo, _X, CLP.elb * (0.45 * cl - 0.2 * ds)); }
      amp(B.upperlegl, 1 + 0.5 * cl - 0.3 * ds); amp(B.upperlegr, 1 + 0.5 * cl - 0.3 * ds); amp(B.lowerlegl, 1 + 0.4 * cl + 0.45 * ds); amp(B.lowerlegr, 1 + 0.4 * cl + 0.45 * ds);
      this.clRoll = (0.06 * cl + 0.08 * ds) * mv * Math.sin(ph + CLP.rph); }
    else this.clRoll = 0;
    if (this.cape) { this.capeSw = lerp(this.capeSw || 0, dead ? 0 : sp, 1 - Math.exp(-dt * 6)); this.cape.rotation.x = 0.04 + this.capeSw * 0.36 + Math.sin(W.time * 9.5) * 0.04 * this.capeSw; }
    { const X = this.gx;
      if (X && X.pelt) { const c = this.cape && this.cape.visible; if (!c) this.capeSw = lerp(this.capeSw || 0, dead ? 0 : sp, 1 - Math.exp(-dt * 6)); X.pelt.rotation.x = c ? this.cape.rotation.x : 0.02 + this.capeSw * 0.1;      // 下面有披風時跟披風一起擺，披風才不會從毛皮底下穿出來
        if (X.tail) X.tail.rotation.x = 0.26 + this.capeSw * 0.36 + Math.sin(W.time * 9.5) * 0.1 * this.capeSw + Math.sin(W.time * 1.7) * 0.03; }
      if (X && X.dangle.length) { let par = null; const kk = 1 - Math.exp(-dt * 9); for (const c of X.dangle) { if (c.parent !== par) { par = c.parent; par.getWorldQuaternion(_q).invert(); _v.set(0, -1, 0).applyQuaternion(_q); _q2.setFromUnitVectors(_NY, _v); } c.quaternion.slerp(_q2, kk); } }      // 皮穗與獸飾永遠朝地面垂，帶一點延遲
      if (X && X.auras.length) { const p = 0.5 + 0.5 * Math.sin(W.time * 2.3); for (const a of X.auras) a.material.opacity = 0.42 + 0.3 * p; for (const m of X.mats) { const e = m.userData.em, kk = m.userData.emK * (0.72 + 0.28 * p); e.r = kk; e.g = kk * 0.82; e.b = kk * 0.5; } } }
    // 弓：舉弓、拉弦的手臂姿勢疊在動作上；身體側過去、頭仍看著前方；弦與箭跟著拉弦那隻手
    if (this.bow) {
      const B = this.bow, T = B.T, b = s.bow && !dead && w.swim < 0.3 ? s.bow : null; w.bow = lerp(w.bow || 0, b ? b.up : 0, 1 - Math.exp(-dt * 24)); if (b) { B.draw = b.draw; B.loose = b.loose; }
      if (w.bow > 0.003 || B.on) {
        B.on = w.bow > 0.003; const d = B.draw * B.draw * (3 - 2 * B.draw), lo = B.loose >= 0 ? Math.min(1, B.loose / 0.07) : 0, wb = w.bow;
        for (const t of T.armL) fix(t, q => { _q.copy(t[1][0]).slerp(t[1][1], lo ? 1 : d); q.slerp(_q, wb); });
        for (const t of T.armR) fix(t, q => { _q.copy(t[1][0]).slerp(t[1][1], lo ? 1 : d); if (lo) _q.slerp(t[1][2], lo); q.slerp(_q, wb); });
        fix(T.head, q => q.multiply(_q.setFromAxisAngle(_Y, BOW.yaw * wb)));
        if (!this.swimOn) this.spin.rotation.y = -BOW.yaw * wb;
        // 搭箭點：拉弦時跟著右手（取右手在箭的軸線上的位置），放箭後彈回原位
        let nz = -BOW.rest; if (wb > 0.5 && !lo && this.bones.r) { this.group.updateMatrixWorld(true); nz = clamp(B.g.worldToLocal(this.bones.r.getWorldPosition(_v)).z + 0.03, -BOW.rest - 0.62, -BOW.rest); }
        B.nock.z = nz; B.ar.visible = wb > 0.5 && !lo; this.strings();
      }
    }
    // 游泳：停著是直立踩水（雙手在兩側撥水、雙腳慢慢踢）；前進時身體往前趴平、頭抬起來看前面、雙手輪流往前划、雙腳打水。武器先收起來
    if (w.swim > 0.001 || this.swimOn) {
      this.swimOn = w.swim > 0.001; const sk = w.stroke, ws = w.swim; this.swimPh += dt * lerp(2.3, 5.4, sk); const ph = this.swimPh;
      this.swimArm.forEach((arm, si) => { const u = ((ph / TAU + si * 0.5) % 1 + 1) % 1; let i = 0; while (i < 3 && SWIM_AT[i + 1] <= u) i++; const kt = (u - SWIM_AT[i]) / (SWIM_AT[i + 1] - SWIM_AT[i]), tr = 0.5 + 0.5 * Math.sin(ph * 1.3);
        for (const t of arm) fix(t, q => { _q.copy(t[1][i]).slerp(t[1][(i + 1) % 4], kt); _q2.copy(t[1][4]).slerp(t[1][5], tr).slerp(_q, sk); q.slerp(_q2, ws); }); });
      const pitch = lerp(0.2, 1.12, sk) * ws, kick = lerp(0.3, 0.42, sk) * ws, kp = ph * lerp(1.4, 2.6, sk);
      this.swimLean = pitch; if (!roll) this.spin.rotation.x = pitch; this.spin.rotation.y = Math.sin(ph) * 0.2 * sk * ws;
      this.swimB.forEach((t, i) => { if (!t[0]) return;
        if (i === 0) { t[0].parent.getWorldQuaternion(_q2).invert().multiply(this.group.quaternion).multiply(_q.setFromAxisAngle(_X, 0.2 * sk)).multiply(this.headRest); fix(t, q => q.slerp(_q2, ws)); return; }      // 頭不跟著身體趴下去，抬起來看著前方
        const a = i < 3 ? Math.sin(kp + (i - 1) * Math.PI) * kick - lerp(0.1, 0.3, sk) * ws : (0.25 + 0.25 * Math.sin(kp + (i - 3) * Math.PI + 0.6)) * ws; fix(t, q => q.premultiply(_q.setFromAxisAngle(_X, a))); });
      const hide = ws > 0.4; if (hide !== this.wHide) { this.wHide = hide; for (const m of this.weap) m.visible = !hide; }
    }
    // （grip.yaw：身體轉向一邊，把魚亮給後面的鏡頭看）
    // 兩手抓東西（舉魚）：this.grip＝{ l: { p, back }, r: { p, back }, lean, head }（胸口座標），由 holdFish07 每一幀更新；放在所有手臂姿勢之後，所以一定蓋過動作與別的姿勢。
    // 為什麼放在這裡不放在 holdFish07：自己的角色先跑 Fish.update 再跑 avatar.update、遠端玩家相反，放在 holdFish07 裡會被動畫蓋掉或順序不一致
    { const G = this.grip, ok = !!(G && !dead && this.gripT && this.armDim && this.armRest.l && this.armRest.r), want = ok ? 1 : 0;
      this.gw = lerp(this.gw, want, 1 - Math.exp(-dt * (want ? 16 : 9))); if (!want && this.gw < 0.004) this.gw = 0;
      if (ok) for (const sd of ['l', 'r']) { const q = gripArm(this.armDim, this.armRest[sd], sd, G[sd]); q.forEach((t, i) => this.gripT[sd][i][1].copy(t[1])); }
      if (this.gw > 0) { this.gripOn = true; const gw = this.gw; for (const sd of ['l', 'r']) for (const t of this.gripT[sd]) fix(t, q => q.slerp(t[1], gw));
        const ln = G ? G.lean || 0 : 0, hd = G ? G.head || 0 : 0; this.gLean = lerp(this.gLean || 0, ln, 1 - Math.exp(-dt * 10)); this.gHead = lerp(this.gHead || 0, hd, 1 - Math.exp(-dt * 10)); this.gYaw = lerp(this.gYaw || 0, G ? G.yaw || 0 : 0, 1 - Math.exp(-dt * 8)); if (!this.swimOn && !(w.bow > 0.003)) this.spin.rotation.y = this.gYaw * gw;
        if (this.gripB[0]) fix(this.gripB[0], q => q.premultiply(_q.setFromAxisAngle(_X, this.gLean * gw))); if (this.gripB[1]) fix(this.gripB[1], q => q.premultiply(_q.setFromAxisAngle(_X, this.gHead * gw))); }
      else if (this.gripOn) { this.gripOn = false; this.gLean = this.gHead = this.gYaw = 0; if (!this.swimOn && !(w.bow > 0.003)) this.spin.rotation.y = 0; for (const sd of ['l', 'r']) for (const t of this.gripT[sd]) if (t[0].quaternion.equals(t[3])) t[0].quaternion.copy(t[2]); for (const t of this.gripB) if (t && t[0].quaternion.equals(t[3])) t[0].quaternion.copy(t[2]); } }
    // 翻滾：整個身體繞腰部往前轉一圈，同時壓低。游泳往前趴、滑落時往後仰也是轉同一個支點
    if (roll) { const e = Math.min(1, s.roll); this.spin.rotation.z = 0; this.spin.rotation.x = e * Math.PI * 2; this.spin.position.y = 0.62 - 0.22 * Math.sin(e * Math.PI); }
    else { w.lean = lerp(w.lean || 0, dead ? 0 : s.lean || 0, 1 - Math.exp(-dt * 30)); const cl = w.cl || 0, ds = w.ds || 0;      // lean：出招的重心（前正後負）；cl／ds：爬坡前傾、下陡坡後仰煞車
      this.spin.rotation.x = (this.swimOn ? this.swimLean : 0) - 0.32 * w.slide + 0.17 * (w.sprint || 0) * (1 - cl) + w.lean + 0.2 * cl - 0.34 * ds; this.spin.position.y = 0.62 - 0.05 * cl - 0.09 * ds - 0.06 * Math.max(0, -w.lean); this.spin.rotation.z = this.swimOn ? 0 : this.clRoll || 0; }
    const f = clamp(s.flash || 0, 0, 1), g = (s.glow != null ? s.glow : s.charge ? s.charge.k : 0) * 0.17, cg = clamp(s.cglow || 0, 0, 1) * 0.24; this.mats.forEach(m => { if (!m.emissive) return; const e = m.userData.em, c = m === this.bodyMat ? cg : 0; m.emissive.setRGB((e ? e.r : 0) + f * 0.8 + g + c, (e ? e.g : 0) + f * 0.12 + g * 0.7 + c * 0.66, (e ? e.b : 0) + f * 0.08 + g * 0.25 + c * 0.12); });      // cglow：反擊時機，衣服泛金光脈動（頭與頭髮不變色）
  }
  cheer() { this.cheerT = 1.6; }
  // 鏡頭貼近時讓角色變透明（0–1）：用畫面上的網點（跟擋住視線的樹同一種做法），不必排序、影子照舊。跟別人共用的材質（武器、帽子、披風）先複製一份自己的，才不會連別人一起變淡。
  // 只有呼叫過這個函式的角色（自己）才會改材質；換外觀後新掛上的零件在下一次呼叫時補上
  setFade(a) {
    if (!this.fadeU) this.fadeU = { value: 1 };
    if (this.fadeDirty !== false) { this.fadeDirty = false; const U = this.fadeU;
      this.group.traverse(o => { if (!o.isMesh || !o.material || Array.isArray(o.material)) return; let m = o.material; if (m.userData.fadeU === U) return;
        if (!this.mats.includes(m)) { let c = this.fadeMats.get(m); if (!c) { c = m.clone(); this.fadeMats.set(m, c); } o.material = m = c; if (m.userData.fadeU === U) return; }
        m.userData.fadeU = U; m.onBeforeCompile = sh => { sh.uniforms.uAFade = U; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAFade;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uAFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uAFade) discard;'); };
        m.customProgramCacheKey = () => 'afade'; m.needsUpdate = true; }); }
    this.fadeU.value = a > 0.98 ? 1 : Math.max(0, a);
  }
  dispose() { W.scene.remove(this.group); if (this.mixer) this.mixer.stopAllAction(); this.own.forEach(g => g.dispose()); this.own = []; }
}

export * from './creatures.js';
export * from './fx.js';
