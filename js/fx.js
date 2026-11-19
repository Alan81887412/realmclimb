// 特效、攻擊預警、世界座標標籤與傷害數字。由 actors.js 轉出，遊戲其他部分仍從 actors.js 取用
// 作法：全部特效共用三個著色器（立體的帶狀／殼狀網格、貼著地形的印花、一批不用每幀計算的小圖片粒子），物件都放在池裡重複使用，貼圖全部用程式畫
// 風格：每個特效一個主要形狀（月牙、光矛、環、裂痕）；顏色三層（白熱的芯、飽和的本體、深色的邊）；節奏是預備（往內收）、爆發（一兩幀最亮最大）、消散（被啃掉、縮小，不是慢慢變淡）
import * as THREE from './three.bundle.js';
import { TAU, clamp, lerp, easeOut, smooth, MON, MST, WORLD, SKILLS } from './core.js';
import { W, Hgt, mapRGB } from './world.js';

/* ============================== 基礎 ============================== */
export const fx = { shake: 0, hitstop: 0, kx: 0, ky: 0, kz: 0, punch: 0 };      // shake 鏡頭晃動（0–1）、hitstop 命中停頓（秒）、kx／ky／kz 鏡頭衝擊（這一下的速度，main.js 用彈簧拉回）、punch 視角往內縮的度數
let T = 0, ready = false, meX = 0, meZ = 0;                   // 特效自己的時鐘（定格時跟著慢下來）；自己角色的位置（從名牌得知）
const jobs = [], later = (d, fn) => jobs.push([T + d, fn]);
const QN = () => W.quality === 'high' ? 1 : W.quality === 'medium' ? 0.62 : 0.4;      // 粒子數量依畫質縮減
const R = Math.random, rr = (a, b) => a + R() * (b - a), num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
const near = (x, z, d) => Math.hypot(x - meX, z - meZ) < d;
const body = v => (MON[v.type] ? MON[v.type].body : 0.6) * (v.size || 1);
const U = v => ({ value: v }), UT = U(0);
// 顏色：[本體（含白熱的芯）, 深色的邊]
const C = {
  steel: [[0.95, 0.84, 0.58], [0.75, 0.42, 0.12]], armor: [[0.78, 0.9, 1.0], [0.3, 0.42, 0.62]], heavy: [[1.0, 0.55, 0.12], [0.75, 0.16, 0.03]], hit: [[1.0, 0.8, 0.4], [0.9, 0.4, 0.08]],
  gold: [[1.0, 0.68, 0.14], [0.7, 0.3, 0.03]], fire: [[1.0, 0.42, 0.06], [0.65, 0.08, 0.02]], earth: [[0.9, 0.55, 0.2], [0.4, 0.2, 0.07]],
  wind: [[0.15, 0.92, 0.5], [0.02, 0.5, 0.28]], mana: [[0.25, 0.6, 1.0], [0.06, 0.16, 0.8]], arcane: [[0.7, 0.4, 1.0], [0.3, 0.08, 0.75]],
  heal: [[0.3, 1.0, 0.6], [0.05, 0.55, 0.3]], rage: [[1.0, 0.3, 0.1], [0.65, 0.05, 0.03]], shade: [[0.65, 0.35, 1.0], [0.25, 0.06, 0.6]],
  bow: [[0.72, 1.0, 0.25], [0.3, 0.6, 0.05]], ice: [[0.6, 0.9, 1.0], [0.15, 0.4, 0.8]], foe: [[1.0, 0.25, 0.1], [0.6, 0.04, 0.02]],
  flurry: [[1.0, 0.45, 0.3], [0.7, 0.1, 0.08]], kick: [[1.0, 0.75, 0.3], [0.8, 0.35, 0.06]], soul: [[0.7, 0.9, 1.0], [0.3, 0.5, 0.75]], cyan: [[0.3, 0.9, 1.0], [0.04, 0.4, 0.8]],
  dust: [[0.66, 0.58, 0.44], [0.4, 0.33, 0.24]], rock: [[0.3, 0.25, 0.2], [0.2, 0.16, 0.13]], hot: [[1.0, 0.5, 0.1], [0.7, 0.15, 0.03]]
};
const SKC = { cleave: C.fire, dash: C.wind, wall: C.gold, blade: C.cyan, fire: C.fire, heal: C.heal, warcry: C.rage, quake: C.earth, blink: C.shade, pierce: C.gold, missile: C.arcane, triple: C.bow, flurry: C.flurry, nova: C.mana, backshot: C.bow, kick: C.kick };
// 遊戲那邊給的是加亮用的過亮顏色：轉成這裡的兩層
const pal = rgb => { const m = Math.max(rgb[0], rgb[1], rgb[2], 0.001), a = rgb[0] / m, b = rgb[1] / m, c = rgb[2] / m; return [[Math.pow(a, 1.6), Math.pow(b, 1.6), Math.pow(c, 1.6)], [Math.pow(a, 3) * 0.7, Math.pow(b, 3) * 0.7, Math.pow(c, 3) * 0.7]]; };
// 把幾個幾何合成一個，各自上一個顏色（頂點色）。parts：[[幾何, 顏色（十六進位或 [r,g,b]）], …]
export function mergeColored(parts) {
  const pos = [], col = [], c = new THREE.Color();
  for (const [g0, color] of parts) { const g = g0.index ? g0.toNonIndexed() : g0, a = g.attributes.position; if (Array.isArray(color)) c.setRGB(color[0], color[1], color[2]); else c.set(color); for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); col.push(c.r, c.g, c.b); } }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); out.computeVertexNormals(); return out;
}
// 一支箭：箭桿沿 +Z，箭尖在前、箭羽在後，原點在箭桿中段
export function arrowGeo(len = 1.25) {
  const shaft = new THREE.CylinderGeometry(0.022, 0.022, len, 5); shaft.rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.07, 0.2, 4); head.rotateX(Math.PI / 2); head.translate(0, 0, len / 2 + 0.08);
  const parts = [[shaft, 0xc9a56c], [head, 0xd8dee4]];
  for (let i = 0; i < 3; i++) { const f = new THREE.BufferGeometry(), a = i / 3 * TAU, ux = Math.cos(a), uy = Math.sin(a), z0 = -len / 2 + 0.03, z1 = z0 + 0.3; f.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, z0, ux * 0.1, uy * 0.1, z0 - 0.04, ux * 0.1, uy * 0.1, z1 - 0.1, 0, 0, z0, ux * 0.1, uy * 0.1, z1 - 0.1, 0, 0, z1], 3)); parts.push([f, i ? 0xf2efe6 : 0xc8442e]); }
  return mergeColored(parts);
}

/* ---------- 貼圖（全部用程式畫） ---------- */
let texN, texAtlas, texCrack, texFis, texRune, texLock, texH;
let seed = 7; const sr = () => (seed = (seed * 16807) % 2147483647) / 2147483647, srr = (a, b) => a + sr() * (b - a);
// 可以接續的雜訊：R 是順著流向拉長的條紋（刀光、拖尾、光柱），G 是一團一團的（殼、環被啃掉的邊）
function noiseTex() {
  const S = 128, d = new Uint8Array(S * S * 4), h = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const vn = (x, y, px, py, s) => { const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty); return lerp(lerp(h(ix % px, iy % py, s), h((ix + 1) % px, iy % py, s), ux), lerp(h(ix % px, (iy + 1) % py, s), h((ix + 1) % px, (iy + 1) % py, s), ux), uy); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S, v = y / S, i = (y * S + x) * 4; d[i] = (vn(u * 4, v * 14, 4, 14, 1) * 0.6 + vn(u * 8, v * 28, 8, 28, 2) * 0.4) * 255; d[i + 1] = (vn(u * 6, v * 6, 6, 6, 3) * 0.6 + vn(u * 12, v * 12, 12, 12, 4) * 0.4) * 255; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; draw(g); const t = new THREE.CanvasTexture(c); t.flipY = false; return t; }
// 粒子用的小圖：4×4 格。0 柔光｜1 圓點｜2 火花（頭圓尾尖）｜3 四芒星｜4 雲朵狀的塵團｜5 圓環｜6 加號｜7 碎塊｜8 兩頭尖的斬痕｜9 往下的箭頭｜10 菱形
const K = { glow: 0, dot: 1, streak: 2, star: 3, puff: 4, ring: 5, plus: 6, shard: 7, mark: 8, chev: 9, gem: 10 };
function atlasTex() {
  return canvasTex(256, 256, g => {
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * 64 + 32, (i >> 2) * 64 + 32); fn(); g.restore(); }, poly = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
    cell(0, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); });
    cell(1, () => { g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill(); });
    cell(2, () => { g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(6, -13, 22, -8); g.arc(22, 0, 8, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(6, 13, -30, 0); g.fill(); });
    cell(3, () => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 5 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); });
    cell(4, () => { for (const [x, y, r] of [[-10, 5, 15], [9, 7, 14], [-2, -8, 16], [13, -6, 10], [-15, -6, 9]]) { g.fillStyle = '#c4c4c4'; g.beginPath(); g.arc(x, y + 2, r, 0, TAU); g.fill(); } for (const [x, y, r] of [[-10, 5, 15], [9, 7, 14], [-2, -8, 16], [13, -6, 10], [-15, -6, 9]]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 1.5, y - 2.5, r - 3, 0, TAU); g.fill(); } });
    cell(5, () => { g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); });
    cell(6, () => { g.lineWidth = 13; g.beginPath(); g.moveTo(-17, 0); g.lineTo(17, 0); g.moveTo(0, -17); g.lineTo(0, 17); g.stroke(); });
    cell(7, () => { g.fillStyle = '#b8b8b8'; poly([[-20, 10], [-6, -22], [20, -6], [10, 20]]); g.fillStyle = '#fff'; poly([[-20, 10], [-6, -22], [2, 2]]); });
    cell(8, () => { g.beginPath(); g.moveTo(-31, 0); g.quadraticCurveTo(0, -9, 31, 0); g.quadraticCurveTo(0, 9, -31, 0); g.fill(); });
    cell(9, () => { poly([[-22, -16], [0, -4], [22, -16], [0, 22]]); });
    cell(10, () => { poly([[0, -26], [16, 0], [0, 26], [-16, 0]]); });
  });
}
// 裂痕：從中心往外的折線，愈遠愈細、會分岔
function crackRay(g, x, y, a, len, w, depth, n = 5) { for (let i = 0; i < n; i++) { a += srr(-0.5, 0.5); const l = len / n * srr(0.7, 1.3), nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l; g.lineWidth = Math.max(1.4, w * (1 - i / n)); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); if (depth > 0 && sr() < 0.55) crackRay(g, nx, ny, a + srr(0.5, 1.1) * (sr() < 0.5 ? -1 : 1), len * 0.42, w * 0.55, depth - 1, 3); x = nx; y = ny; } }
function initTex() {
  texN = noiseTex(); texAtlas = atlasTex();
  texCrack = canvasTex(256, 256, g => { for (let i = 0; i < 9; i++) crackRay(g, 128, 128, i / 9 * TAU + srr(-0.2, 0.2), srr(84, 116), 9, 2); g.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = srr(9, 19); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.fill(); });
  texFis = canvasTex(128, 256, g => { let x = 64, y = 4; for (let i = 0; i < 10; i++) { const nx = 64 + srr(-20, 20), ny = y + 24.5; g.lineWidth = 11 - i * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); crackRay(g, nx, ny, (i % 2 ? 0.5 : 2.6) + srr(-0.3, 0.3), srr(26, 46), 5, 1, 3); x = nx; y = ny; } });
  texRune = canvasTex(256, 256, g => { g.translate(128, 128); const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }; ring(118, 7); ring(102, 3); ring(58, 5);
    for (let k = 0; k < 2; k++) { g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + k * Math.PI / 3 - Math.PI / 2; g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100); } g.closePath(); g.stroke(); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.beginPath(); g.arc(Math.cos(a) * 80, Math.sin(a) * 80, 6.5, 0, TAU); g.fill(); } for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.lineWidth = 3; g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a) * 115, Math.sin(a) * 115); g.stroke(); } });
  texLock = canvasTex(128, 128, g => { g.translate(64, 64); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 47, a - 0.56, a + 0.56); g.stroke(); const b = i / 4 * TAU, c = Math.cos(b), s = Math.sin(b); g.beginPath(); g.moveTo(c * 60 - s * 10, s * 60 + c * 10); g.lineTo(c * 60 + s * 10, s * 60 - c * 10); g.lineTo(c * 40, s * 40); g.closePath(); g.fill(); } });
  // 地形高度（給貼地的印花在頂點著色器裡貼合地面）
  const G = WORLD.GRID, N1 = G + 1, CELL = WORLD.SIZE / G, d = new Uint16Array(N1 * N1); for (let z = 0; z < N1; z++) for (let x = 0; x < N1; x++) d[z * N1 + x] = THREE.DataUtils.toHalfFloat(Hgt(x * CELL - WORLD.SIZE / 2, z * CELL - WORLD.SIZE / 2));
  texH = new THREE.DataTexture(d, N1, N1, THREE.RedFormat, THREE.HalfFloatType); texH.magFilter = texH.minFilter = THREE.LinearFilter; texH.unpackAlignment = 1; texH.needsUpdate = true;
}
// 草地上的印花要墊高到草尖附近才看得到；石板、沙地、岩地貼著地面就好（用小地圖的顏色判斷是不是草地）
const grassy = (x, z) => { const G = WORLD.GRID, c = WORLD.SIZE / G, ix = clamp(Math.round((x + WORLD.SIZE / 2) / c), 0, G), iz = clamp(Math.round((z + WORLD.SIZE / 2) / c), 0, G), i = (iz * (G + 1) + ix) * 3; return mapRGB[i + 1] >= mapRGB[i] && mapRGB[i + 1] > mapRGB[i + 2] * 1.3; };
const liftAt = (x, z) => grassy(x, z) ? 0.3 : 0.07;

/* ---------- 著色器 ---------- */
const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
// 混合方式：顏色先乘上不透明度再輸出，同一個材質可以從「蓋上去」（uAdd 0，顏色在亮的草地上也飽和）漸變到「加亮」（uAdd 1）
const BLEND = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
const RAMP = 'vec3 col = mix(uC2, uC1, smoothstep(0.12, 0.55, I)); col = mix(col, uC1 * 0.5 + 1.15, smoothstep(0.8, 0.97, I)); a *= uOp; if (!(a >= 0.004) || !(I > -1.0)) discard; gl_FragColor = vec4(col * a, a * (1.0 - uAdd));';
const VS_M = 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }';
const SSDEF = '#define SS(a, b, x) (1.0 - smoothstep(b, a, x))\n';
const FS_M = SSDEF + `uniform sampler2D uN; uniform vec3 uC1; uniform vec3 uC2; uniform float uOp; uniform float uCut; uniform float uPan; uniform float uMode; uniform float uW; uniform float uAdd; uniform float uTip; uniform float uLen; varying vec2 vUv; varying float vF;
void main(){
  float u = vUv.x, v = vUv.y, a = 0.0, I = 0.0;
  if (uMode < 0.5) {                    // 月牙：u 尾→頭、v 內→外；頭寬尾尖
    float w = pow(max(u, 0.0001), 0.75) * uW, d = (v - (1.0 - w)) / max(w, 0.001), n = texture2D(uN, vec2(u * 1.6 - uPan, v * 1.4)).r;
    a = smoothstep(0.0, 0.12, d) * SS(1.0, 0.95, u); I = clamp(d, 0.0, 1.0); I = I * I * (0.6 + 0.6 * n) + smoothstep(0.84, 1.0, d) * 0.5;
    a *= smoothstep(uCut, uCut + 0.14, n * 0.45 + d * 0.25 + u * 0.5);
  } else if (uMode < 1.5) {             // 直條：u 尾→頭、v 橫向；uTip 0 頭最寬（拖尾）、1 頭也收尖（光矛）
    u = 1.0 - (1.0 - u) / uLen; float e = 1.0 - abs(v * 2.0 - 1.0), w = pow(max(u, 0.0001), 0.7) * mix(1.0, SS(1.0, 0.6, u), uTip) * uW, d = (e - (1.0 - w)) / max(w, 0.001), n = texture2D(uN, vec2(u * 1.5 - uPan, v * 0.8)).r;
    a = smoothstep(0.0, 0.2, d); I = clamp(d, 0.0, 1.0) * (0.55 + 0.65 * n);
    a *= smoothstep(uCut, uCut + 0.14, n * 0.45 + u * 0.55 + d * 0.15);
  } else if (uMode < 2.5) {             // 殼（護罩、脹開的球）：邊緣亮、中間透
    float rim = pow(clamp(1.0 - vF, 0.0, 1.0), uW), n = texture2D(uN, vec2(u * 3.0 + uPan * 0.3, v * 2.0 - uPan)).g;
    float pt = smoothstep(0.52, 0.62, n); I = rim * 0.62 + pt * 0.3; a = clamp(rim * 1.25 + 0.05 + pt * 0.2, 0.0, 1.0) * smoothstep(uCut, uCut + 0.16, n * 0.75 + rim * 0.35);
  } else if (uMode < 3.5) {             // 光柱：u 繞一圈、v 往上；正面濃、兩側淡，才像一團光而不是一根管子
    float n = texture2D(uN, vec2(v * 1.1 - uPan, u * 3.0)).r, top = pow(clamp(1.0 - v, 0.0, 1.0), uW);
    a = pow(clamp(vF, 0.0, 1.0), 1.6) * top * smoothstep(0.0, 0.06, v) * (0.45 + 0.75 * n); I = a * 0.82; a *= smoothstep(uCut, uCut + 0.2, n * 0.6 + top * 0.5);
  } else if (uMode < 4.5) {             // 立著的環：u 繞一圈、v 內→外
    float n = texture2D(uN, vec2(u * 4.0, v * 0.5 - uPan)).g, e = smoothstep(0.3, 0.75, v) * SS(1.0, 0.88, v);
    I = e * (0.3 + 0.42 * v); a = e * smoothstep(uCut, uCut + 0.2, n * 0.7 + v * 0.3);
  } else if (uMode < 5.5) {             // 實心光球：中間白熱、邊緣是本體色
    I = pow(clamp(vF, 0.0, 1.0), uW); a = smoothstep(0.0, 0.3, vF);
  } else {                              // 瞄準線：往前流動的箭頭虛線
    float e = 1.0 - abs(v * 2.0 - 1.0), k = fract(u * uW - uPan + e * 0.35);
    a = smoothstep(0.2, 0.5, e) * smoothstep(0.4, 0.5, k) * smoothstep(0.0, 0.04, u) * SS(1.0, 0.9, u); I = 0.5 + 0.38 * uTip;
  }
  ${RAMP}${TONE}`;
// 貼地的印花：一塊方格網，頂點從高度圖取地面高度；深度往鏡頭方向讓一點，才不會和地面打架，但還是會被角色擋住
const VS_G = 'uniform sampler2D uH; uniform vec4 uWd; uniform float uLift; varying vec2 vP; void main(){ vP = position.xz; vec4 w = modelMatrix * vec4(position.x, 0.0, position.z, 1.0); w.y = texture2D(uH, ((w.xz + uWd.x) / uWd.y + 0.5) / uWd.z).r + uLift; vec4 mv = viewMatrix * w; mv.xyz *= 1.0 - uWd.w / max(length(mv.xyz), 1.0); gl_Position = projectionMatrix * mv; }';
const FS_G = SSDEF + '#define NZ texture2D(uN, vec2(atan(vP.x, vP.y) * 0.955, r * 1.2)).g\n' + `uniform sampler2D uN; uniform sampler2D uTex; uniform vec3 uC1; uniform vec3 uC2; uniform float uOp; uniform float uCut; uniform float uMode; uniform float uAdd; uniform float uT; uniform vec4 uA; uniform vec2 uSz; varying vec2 vP;
void main(){
  float r = length(vP), a = 0.0, I = 0.0, n = 0.0;
  if (uMode < 0.5) {                    // 衝擊環：uA.x 半徑、uA.y 環寬（都是 0–1）。外緣一道銳利的邊，往內拖一段漸淡的尾
    float d = (uA.x - r) / uA.y; if (d < -0.08 || d > 2.25) discard; n = NZ; float e = smoothstep(-0.06, 0.02, d), edge = e * SS(0.42, 0.3, d), tail = e * pow(clamp(1.0 - d / 2.2, 0.0, 1.0), 2.0);
    I = max(edge * 0.74, tail * 0.42); a = clamp(edge + tail * 0.6, 0.0, 1.0) * smoothstep(uCut, uCut + 0.25, n * 0.55 + edge * 0.6 + 0.001);
  } else if (uMode < 1.5) {             // 圓盤：地面閃一下的光，外圈一道邊
    if (r > 1.0) discard; n = NZ; float e = SS(1.0, 0.94, r); I = e * (0.25 + 0.75 * smoothstep(0.55, 0.97, r)); a = e * (0.3 + 0.7 * smoothstep(0.5, 0.97, r)) * smoothstep(uCut, uCut + 0.25, n * 0.6 + r * 0.4);
  } else if (uMode < 2.5) {             // 貼圖（裂痕、法陣、鎖定標記）：uA.x 發亮程度、uA.y 顯現到多遠（uA.z 為 1 時沿長邊顯現）
    vec4 t = texture2D(uTex, vP * 0.5 + 0.5); float rv = uA.z > 0.5 ? vP.y * 0.5 + 0.5 : r; a = t.a * SS(uA.y, uA.y - 0.2, rv); I = uA.x;
  } else if (uMode < 3.5) {             // 長條（沿 +Z）：uA.x 前緣、uA.y 尾端（0–1）；頭寬尾尖
    float u = vP.y * 0.5 + 0.5, e = 1.0 - abs(vP.x), k = clamp((u - uA.y) / max(uA.x - uA.y, 0.001), 0.0, 1.0), wd = e - (1.0 - (0.3 + 0.7 * k)), ns = texture2D(uN, vec2(u * 3.0 - uT * 2.0, vP.x * 0.7)).r;
    a = step(uA.y, u) * SS(uA.x, uA.x - 0.04, u) * smoothstep(0.0, 0.12, wd) * smoothstep(uCut, uCut + 0.2, ns * 0.6 + k * 0.5); I = clamp(wd * 1.5, 0.0, 1.0) * (0.5 + 0.7 * ns) * (0.35 + 0.65 * k);
  } else {                              // 攻擊預警：uA.x 形狀（0 圓、1 環、2 扇形、3 直線）、uA.y 內徑、uA.z 半角、uA.w 進度；uSz 是公尺
    vec2 q = vP * uSz, sz = uSz - 0.35; float rq = length(q), d, k, p = uA.w;
    if (uA.x < 0.5) { d = rq - sz.x; k = rq / sz.x; }
    else if (uA.x < 1.5) { d = max(rq - sz.x, uA.y - rq); k = (rq - uA.y) / max(sz.x - uA.y, 0.01); }
    else if (uA.x < 2.5) { d = max(max(rq - sz.x, (abs(atan(q.x, q.y)) - uA.z) * rq), uA.y - rq); k = rq / sz.x; }
    else { d = max(abs(q.x) - sz.x, abs(q.y) - sz.y); k = q.y / sz.y * 0.5 + 0.5; }
    if (d > 0.25) discard;
    float ins = SS(0.04, -0.04, d), line = SS(0.2, 0.12, abs(d + 0.13)), fl = ins * SS(p + 0.015, p - 0.015, k) * step(0.0, p), front = ins * SS(0.045, 0.0, abs(k - p)) * step(0.02, p) * step(p, 0.99);
    float pulse = p > 0.8 ? 0.6 + 0.4 * sin(uT * 38.0) : 0.0, wave = smoothstep(0.3, 0.5, abs(fract(k * max(sz.x, sz.y) * 0.5 - uT * 1.3) - 0.5));
    float wk = step(0.0, p), rim = ins * smoothstep(-1.8, 0.0, d);   // wk＝0 是「領域警告」（熊的威嚇圈）：範圍大、時間長，只留邊線與靠邊的一圈淡色，不整片填色、不畫波紋
    I = max(max(line * (0.7 + 0.3 * pulse), fl * (0.3 + 0.35 * pulse)), front * 0.95) + ins * wave * 0.1 * wk;
    a = clamp(ins * mix(0.05, 0.24, wk) + rim * 0.16 * (1.0 - wk) + fl * 0.3 + line * 0.95 + front * 0.8 + ins * wave * 0.08 * wk + fl * pulse * 0.16, 0.0, 0.96);
  }
  ${RAMP}${TONE}`;
// 粒子：每顆只在產生時寫一次資料（起點、初速、時間、大小、圖樣、顏色），位置在頂點著色器裡算，每幀不花處理器時間
const VS_S = `attribute vec3 aP; attribute vec3 aV; attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec2 aD; uniform float uT; varying vec2 vUv; varying vec4 vC; varying float vK;
void main(){
  float t = uT - aA.x, k = t / aA.y; if (k < 0.0 || k >= 1.0) { gl_Position = vec4(0.0, 0.0, -9.0, 1.0); return; }
  float dr = aB.y, e = dr > 0.001 ? (1.0 - exp(-dr * t)) / dr : t; vec3 p = aP + aV * e; p.y -= 0.5 * aB.x * t * t;
  float sz = mix(aA.z, aA.w, 1.0 - (1.0 - k) * (1.0 - k)); vec4 mv = viewMatrix * vec4(p, 1.0); vec2 q = position.xy;
  if (aB.w > 0.0) { vec3 vel = aV * exp(-dr * t); vel.y -= aB.x * t; vec2 d = (viewMatrix * vec4(vel, 0.0)).xy; float l = length(d); d = l > 1e-6 ? d / l : vec2(1.0, 0.0); mv.xy += d * q.x * sz * aB.w * clamp(length(vel) / max(length(aV), 1e-5), 0.3, 1.0) + vec2(-d.y, d.x) * q.y * sz; }
  else { float an = aD.x + aD.y * t, c = cos(an), s = sin(an); mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * sz; }
  gl_Position = projectionMatrix * mv; vUv = (vec2(mod(aB.z, 4.0), floor(aB.z / 4.0)) + uv) * 0.25; vC = aC; vK = k;
}`;
const FS_S = SSDEF + `uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vC; varying float vK;
void main(){ vec4 s = texture2D(uAtlas, vUv); float a = s.a * SS(1.0, 0.72, vK); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * s.rgb * a, a * (1.0 - vC.a));${TONE}`;
const matM = () => new THREE.ShaderMaterial({ ...BLEND, uniforms: { uN: U(texN), uC1: U(new THREE.Color()), uC2: U(new THREE.Color()), uOp: U(1), uCut: U(0), uPan: U(0), uMode: U(0), uW: U(0.5), uAdd: U(0.4), uTip: U(0), uLen: U(1) }, vertexShader: VS_M, fragmentShader: FS_M });
let UH, UWD;
const matG = () => new THREE.ShaderMaterial({ ...BLEND, uniforms: { uH: UH, uWd: UWD, uLift: U(0.1), uN: U(texN), uTex: U(texCrack), uC1: U(new THREE.Color()), uC2: U(new THREE.Color()), uOp: U(1), uCut: U(0), uMode: U(0), uAdd: U(0.4), uT: UT, uA: U(new THREE.Vector4()), uSz: U(new THREE.Vector2(1, 1)) }, vertexShader: VS_G, fragmentShader: FS_G });

/* ---------- 粒子 ---------- */
const S_N = 1600; let sI = 0, sDirty = false, sGeo, aP, aV, aA, aB, aC, aD;
function initSprites() {
  const g = sGeo = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2)); g.setIndex([0, 1, 2, 2, 1, 3]);
  const at = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(S_N * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a.array; };
  aP = at('aP', 3); aV = at('aV', 3); aA = at('aA', 4); aB = at('aB', 4); aC = at('aC', 4); aD = at('aD', 2); for (let i = 0; i < S_N; i++) { aA[i * 4] = -1e6; aA[i * 4 + 1] = 1; } g.instanceCount = S_N;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...BLEND, uniforms: { uAtlas: U(texAtlas), uT: UT }, vertexShader: VS_S, fragmentShader: FS_S })); m.frustumCulled = false; m.isLine = true; m.renderOrder = 6; W.scene.add(m);      // isLine：高畫質的環境遮蔽在預先算深度時會略過標成線的物件，特效才不會在地上壓出黑影
}
// 一顆粒子：位置、速度、壽命、大小（起→終）、圖樣、顏色、加亮程度（0 蓋上去｜1 加亮）、重力、阻力、拉長倍率（順著速度方向）、角度、轉速、延後出現
function sp(x, y, z, vx, vy, vz, life, s0, s1, kind, c, add = 1, grav = 0, drag = 0, str = 0, rot = 0, spin = 0, delay = 0) {
  const i = sI; sI = (sI + 1) % S_N; sDirty = true; let j = i * 3; aP[j] = x; aP[j + 1] = y; aP[j + 2] = z; aV[j] = vx; aV[j + 1] = vy; aV[j + 2] = vz;
  j = i * 4; aA[j] = T + delay; aA[j + 1] = life; aA[j + 2] = s0; aA[j + 3] = s1; aB[j] = grav; aB[j + 1] = drag; aB[j + 2] = kind; aB[j + 3] = str; aC[j] = c[0]; aC[j + 1] = c[1]; aC[j + 2] = c[2]; aC[j + 3] = add; aD[i * 2] = rot; aD[i * 2 + 1] = spin;
}
// 火花：拉長的亮點，朝 dir（沒給就四面八方）噴出後很快慢下來。o：{ dir, cone 半角, sp 速度, up 往上, life, s 粗細, grav, drag, str 拉長, rad 起始半徑 }
function sparks(x, y, z, n, c, o = {}) {
  n = Math.max(1, Math.round(n * QN())); const spd = o.sp || 7, up = o.up == null ? 3 : o.up, cone = o.dir == null ? Math.PI : o.cone == null ? 0.6 : o.cone, rad = o.rad || 0;
  for (let i = 0; i < n; i++) { const a = (o.dir || 0) + rr(-cone, cone), s = spd * rr(0.4, 1.1), sn = Math.sin(a), cs = Math.cos(a); sp(x + sn * rad, y, z + cs * rad, sn * s, up * rr(0.15, 1.1), cs * s, (o.life || 0.35) * rr(0.6, 1.15), (o.s || 0.16) * rr(0.8, 1.25), 0.02, K.streak, c, 0.7, o.grav == null ? 9 : o.grav, o.drag == null ? 3 : o.drag, o.str || 5, 0, 0, o.delay ? R() * o.delay : 0); }
}
// 塵團：雲朵狀、兩階明暗的不透明小團，冒出來後脹大、縮回去
function puffs(x, y, z, n, o = {}) {
  n = Math.max(1, Math.round(n * QN())); const c = o.c || C.dust[0], cone = o.dir == null ? Math.PI : o.cone == null ? 0.6 : o.cone, rad = o.rad || 0, s0 = o.s || 0.45;
  for (let i = 0; i < n; i++) { const a = (o.dir || 0) + rr(-cone, cone), s = (o.sp || 2.5) * rr(0.4, 1), sn = Math.sin(a), cs = Math.cos(a), k = rr(0.75, 1.15); sp(x + sn * rad, y, z + cs * rad, sn * s, (o.up == null ? 1.2 : o.up) * rr(0.4, 1), cs * s, (o.life || 0.6) * rr(0.7, 1.2), s0 * k, s0 * k * rr(1.5, 2.0), K.puff, c, 0, -0.4, 3.2, 0, R() * TAU, rr(-1.2, 1.2), o.delay ? R() * o.delay : 0); }
}
// 碎塊：往上拋、會掉下來的小石塊（或發亮的碎片）
function shards(x, y, z, n, c, o = {}) { n = Math.max(1, Math.round(n * QN())); const rad = o.rad || 0; for (let i = 0; i < n; i++) { const a = R() * TAU, s = (o.sp || 3) * rr(0.3, 1), sn = Math.sin(a), cs = Math.cos(a), k = (o.s || 0.24) * rr(0.7, 1.3); sp(x + sn * rad * rr(0.5, 1), y, z + cs * rad * rr(0.5, 1), sn * s, (o.up || 6) * rr(0.55, 1.1), cs * s, (o.life || 0.7) * rr(0.8, 1.1), k, k * 0.5, o.gem ? K.gem : K.shard, c, o.add || 0, o.grav == null ? 17 : o.grav, 0.4, 0, R() * TAU, rr(-9, 9)); } }
// 一閃：四芒星加一團柔光
function flash(x, y, z, s, c, life = 0.12, wh = 0.55) { sp(x, y, z, 0, 0, 0, life, s, s * 0.3, K.star, [c[0] * (1.35 - wh) + wh, c[1] * (1.35 - wh) + wh, c[2] * (1.35 - wh) + wh], 0.8, 0, 0, 0, rr(0, TAU), 0); sp(x, y, z, 0, 0, 0, life * 1.4, s * 1.1, s * 0.6, K.glow, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 1); }
// 面向鏡頭的環（半徑 r0 → r1）
const ringB = (x, y, z, r0, r1, life, c, delay = 0) => sp(x, y, z, 0, 0, 0, life, r0 * 2.4, r1 * 2.4, K.ring, c, 1, 0, 0, 0, 0, 0, delay);
// 畫面上一道固定角度的斬痕（a 是畫面上的角度）
function mark(x, y, z, a, len, c, life = 0.13, w = 0.2) { const e = W.camera.matrixWorld.elements, cs = Math.cos(a) * 0.01, sn = Math.sin(a) * 0.01; sp(x, y, z, e[0] * cs + e[4] * sn, e[1] * cs + e[5] * sn, e[2] * cs + e[6] * sn, life, w, w * 0.25, K.mark, [c[0] * 0.6 + 0.7, c[1] * 0.6 + 0.7, c[2] * 0.6 + 0.7], 0.8, 0, 0, len / w); }
// 往一點聚過去的光點（預備、蓄力）
function gather(x, y, z, n, c, d, rad = 1.5, s = 0.11) { for (let i = 0; i < n; i++) { const a = R() * TAU, el = rr(-0.5, 0.9), r = rad * rr(0.7, 1.1), life = rr(0.16, 0.28), dx = Math.cos(a) * Math.cos(el) * r, dy = Math.sin(el) * r, dz = Math.sin(a) * Math.cos(el) * r; sp(x + dx, y + dy, z + dz, -dx / life * 0.9, -dy / life * 0.9, -dz / life * 0.9, life, s, s * 1.5, K.streak, c, 1, 0, 0, 5, 0, 0, R() * d); } }
// 往上飄的光點（治療、升級）
function motes(x, y, z, n, c, kind, o = {}) { n = Math.max(1, Math.round(n * QN())); const rad = o.rad || 1; for (let i = 0; i < n; i++) { const a = R() * TAU, r = rad * Math.sqrt(R()), s = (o.s || 0.26) * rr(0.7, 1.2); sp(x + Math.cos(a) * r, y + rr(0, o.h || 0.8), z + Math.sin(a) * r, 0, (o.up || 1.6) * rr(0.6, 1.2), 0, (o.life || 1.0) * rr(0.7, 1.2), s * 0.5, s, kind, c, 1, -0.5, 0.4, 0, 0, kind === K.star ? rr(-2, 2) : 0, R() * (o.delay || 0.4)); } }
// 舊的呼叫方式：暗色的當成塵土、水花；往上飄的當成光點；其餘是火花
function emit0(x, y, z, n, rgb, speed, up, life, grav) {
  const m = Math.max(rgb[0], rgb[1], rgb[2]), dull = m < 1.05, c = dull ? [rgb[0] * 1.1, rgb[1] * 1.1, rgb[2] * 1.1] : pal(rgb)[0]; n = Math.max(1, Math.round(n * QN() * (dull ? 0.6 : 0.8)));
  for (let i = 0; i < n; i++) { const a = R() * TAU, s = speed * rr(0.35, 1.1), vy = up * rr(0.4, 1.4), l = life * rr(0.6, 1.2), cx = Math.cos(a), cz = Math.sin(a);
    if (dull) sp(x, y, z, cx * s, vy * 0.6, cz * s, l * 1.2, rr(0.3, 0.45), rr(0.65, 0.9), K.puff, c, 0, grav * 0.2, 2.6, 0, R() * TAU, rr(-1, 1));
    else if (grav < 0) sp(x + cx * s * 0.25, y, z + cz * s * 0.25, cx * s * 0.35, vy, cz * s * 0.35, l, rr(0.1, 0.16), rr(0.22, 0.3), c[1] > c[0] && c[1] > c[2] ? K.plus : K.star, c, 1, grav, 0.8, 0, 0, rr(-2, 2));
    else sp(x, y, z, cx * s, vy, cz * s, l, rr(0.1, 0.15), 0.02, K.streak, c, 0.7, grav, 2.2, 5); }
}

/* ---------- 網格的池 ---------- */
const geos = {}, pool = {}, live = [], CAP = { gd: 48, arc: 14, arcH: 10, arcS: 8, spike: 20, pillar: 12, dome: 6, orb: 16, ringv: 16 };
const q1 = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
// 朝向：先在自己的平面裡轉 sweep，再側傾 roll、俯仰 pitch，最後轉向 yaw
function orient(m, yaw, pitch, roll, sweep) { m.quaternion.setFromAxisAngle(AY, yaw); if (pitch) m.quaternion.multiply(q1.setFromAxisAngle(AX, pitch)); if (roll) m.quaternion.multiply(q1.setFromAxisAngle(AZ, roll)); if (sweep) m.quaternion.multiply(q1.setFromAxisAngle(AY, sweep)); }
// 月牙帶，外緣加一圈立起來的邊（從背後的低視角看也有厚度）。躺在水平面，中心朝 +Z，從右手邊（-X）掃到左手邊
function arcGeo(r0, r1, A, seg, rim) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) { const u = i / seg, a = lerp(-A, A, u), s = Math.sin(a), c = Math.cos(a); pos.push(s * r0, 0, c * r0, s * r1, 0, c * r1, s * r1, rim, c * r1, s * r1, -rim, c * r1); uv.push(u, 0, u, 1, u, 0.5, u, 0.5); }
  for (let i = 0; i < seg; i++) { const o = i * 4; idx.push(o, o + 4, o + 1, o + 1, o + 4, o + 5, o + 1, o + 5, o + 2, o + 2, o + 5, o + 6, o + 1, o + 3, o + 5, o + 3, o + 7, o + 5); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function initGeos() {
  geos.arc = arcGeo(1.15, 3.0, 1.08, 24, 0.26); geos.arcH = arcGeo(1.2, 3.4, 1.32, 28, 0.32); geos.arcS = arcGeo(1.4, 3.7, Math.PI, 48, 0.3);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1], 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 3)); g.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]); geos.spike = g; }
  { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), p = g.attributes.position, uv = g.attributes.uv; g.translate(0, 0.5, 0); for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getZ(i), p.getX(i)) / TAU + 0.5, p.getY(i)); geos.pillar = g; }
  geos.dome = new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2); geos.orb = new THREE.SphereGeometry(1, 18, 12);
  { const g = new THREE.RingGeometry(0.55, 1, 36, 1), p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getY(i), p.getX(i)) / TAU + 0.5, (Math.hypot(p.getX(i), p.getY(i)) - 0.55) / 0.45); geos.ringv = g; }
  geos.gd = new THREE.PlaneGeometry(2, 2, 20, 20); geos.gd.rotateX(-Math.PI / 2);
  geos.arrow = arrowGeo(1.25);
}
// 取一個閒置的網格（沒有就新建，到上限就拿最舊的來用）；材質各自一份，只在新建時建立
function mesh(kind) {
  const p = pool[kind] || (pool[kind] = []); let s = p.find(k => !k.live);
  if (!s && p.length >= (CAP[kind] || 12)) { s = p.reduce((a, b) => a.born < b.born ? a : b); const i = live.indexOf(s); if (i >= 0) live.splice(i, 1); }
  if (!s) { const m = new THREE.Mesh(geos[kind], kind === 'gd' ? matG() : matM()); m.frustumCulled = false; m.isLine = true; W.scene.add(m); s = { m, u: m.material.uniforms, kind }; p.push(s); }
  s.live = true; s.t = 0; s.born = T; s.dur = 1; s.follow = null; s.fy = 0; s.m.visible = true; s.m.rotation.set(0, 0, 0); s.m.scale.set(1, 1, 1); s.m.renderOrder = kind === 'gd' ? 3 : 5; s.u.uOp.value = 1; s.u.uCut.value = 0;
  if (kind !== 'gd') { s.u.uPan.value = 0; s.u.uW.value = 0.5; s.u.uTip.value = 0; } live.push(s); return s;
}
const col = (s, c1, c2) => { s.u.uC1.value.setRGB(c1[0], c1[1], c1[2]); s.u.uC2.value.setRGB(c2[0], c2[1], c2[2]); };
const freeMesh = s => { if (s && s.live) s.t = s.dur; };
function gdSet(s, mode, x, z, sx, sz, f, c1, c2, add = 0.4) { col(s, c1, c2); s.u.uMode.value = mode; s.u.uAdd.value = add; s.u.uLift.value = liftAt(x, z); s.u.uA.value.set(0, 0, 0, 0); s.m.position.set(x, 0, z); s.m.scale.set(sx, 1, sz); s.m.rotation.y = f; }

/* ---------- 共用的幾種形狀 ---------- */
// 貼地的衝擊環：半徑 r0 → r1（r0 比較大就是往內收）。o：{ w 環寬（公尺）, op, lin 等速, add }
function gRing(x, z, r0, r1, dur, P, o = {}) {
  const s = mesh('gd'), R1 = Math.max(r0, r1, 0.01), w = (o.w || 0.3) / R1, op = o.op == null ? 1 : o.op; gdSet(s, 0, x, z, R1, R1, 0, P[0], P[1], o.add == null ? 0.3 : o.add); s.dur = dur;
  s.upd = p => { const e = o.lin ? p : 1 - Math.pow(1 - p, 3); s.u.uA.value.set(lerp(r0, r1, e) / R1, w * (1 - 0.45 * p), 0, 0); s.u.uOp.value = op * Math.min(1, p * 20 + 0.3, (1 - p) * 3); s.u.uCut.value = smooth(0.5, 1, p) * 0.85; }; s.upd(0); return s;
}
// 地面閃一下的圓盤
function gDisc(x, z, r, dur, P, op = 0.6) { const s = mesh('gd'); gdSet(s, 1, x, z, r, r, 0, P[0], P[1], 0.55); s.dur = dur; s.upd = p => { const k = r * (0.7 + 0.3 * easeOut(p)); s.m.scale.set(k, 1, k); s.u.uOp.value = op * (1 - p); s.u.uCut.value = smooth(0.3, 1, p) * 0.8; }; s.upd(0); return s; }
// 地面的長條光痕：前緣很快衝到底，再從尾端收掉
function gLane(x, z, f, len, w, dur, P, o = {}) {
  const s = mesh('gd'); gdSet(s, 3, x + Math.sin(f) * len / 2, z + Math.cos(f) * len / 2, w / 2, len / 2, f, P[0], P[1], o.add == null ? 0.3 : o.add); s.dur = dur;
  s.upd = p => { s.u.uA.value.set(o.still ? 1 : 1 - Math.pow(1 - Math.min(1, p / 0.32), 2), smooth(0.3, 1, p) * 0.92, 0, 0); s.u.uOp.value = (o.op || 1) * Math.min(1, (1 - p) * 3.5); s.u.uCut.value = smooth(0.55, 1, p) * 0.7; }; s.upd(0); return s;
}
// 裂痕印花：從中心裂開，先發亮、再退成深色的痕、最後淡掉。lin：沿著長邊裂過去
function crack(x, z, sx, sz, f, c1, dur = 1.6, tex = texCrack, lin = 0) {
  const s = mesh('gd'); gdSet(s, 2, x, z, sx, sz, f, c1, [0.11, 0.075, 0.05], 0.5); s.u.uTex.value = tex; s.dur = dur;
  s.upd = p => { const t = p * dur, g = 1 - smooth(0.06, 0.6, t); s.u.uA.value.set(0.25 + g * 0.5, 0.2 + Math.min(1, t / (lin ? 0.2 : 0.1)) * 1.3, lin, 0); s.u.uAdd.value = 0.5 * g; s.u.uOp.value = (0.6 + 0.4 * g) * (1 - smooth(0.6, 1, p)); }; s.upd(0); return s;
}
// 法陣（或鎖定標記）：彈出來、慢慢轉、收掉；可以跟著角色
function rune(x, z, r, P, dur, follow, o = {}) {
  const s = mesh('gd'); gdSet(s, 2, x, z, r, r, R() * TAU, P[0], P[1], 0.35); s.u.uTex.value = o.tex || texRune; s.dur = dur; s.follow = follow || null; const spin = o.spin == null ? 1.2 : o.spin, f0 = s.m.rotation.y, out = Math.min(0.3, dur * 0.4);
  s.upd = p => { const t = p * dur, e = Math.min(1, t / 0.18), k = r * (0.45 + 0.55 * (1 - Math.pow(1 - e, 3))); s.m.scale.set(k, 1, k); s.m.rotation.y = f0 + t * spin; s.u.uA.value.set(0.62, 2, 0, 0); s.u.uOp.value = (o.op || 1) * Math.min(1, t * 12, (dur - t) / out); }; s.upd(0); return s;
}
// 光柱
function pillar(x, z, r, h, dur, P, follow, op = 0.85) {
  const s = mesh('pillar'); col(s, P[0], P[1]); s.u.uMode.value = 3; s.u.uW.value = 1.3; s.u.uAdd.value = 1; s.dur = dur; s.follow = follow || null; s.m.position.set(x, Hgt(x, z), z);
  s.upd = p => { const k = r * (1 - 0.3 * p), e = 1 - Math.pow(1 - Math.min(1, p * 4), 3); s.m.scale.set(k, h * (0.3 + 0.7 * e), k); s.u.uOp.value = Math.min(1, p * 10) * op; s.u.uCut.value = smooth(0.45, 1, p) * 1.1; s.u.uPan.value = T * 0.9; }; s.upd(0); return s;
}
// 跟著環往外推的一圈矮光牆
function curtain(x, z, r0, r1, h, dur, P) { const s = mesh('pillar'); col(s, P[0], P[1]); s.u.uMode.value = 3; s.u.uW.value = 1.0; s.u.uAdd.value = 0.6; s.dur = dur; s.m.position.set(x, Hgt(x, z) + 0.1, z); s.upd = p => { const k = lerp(r0, r1, 1 - Math.pow(1 - p, 3)); s.m.scale.set(k, h * (1 - 0.5 * p), k); s.u.uOp.value = Math.min(1, p * 14, (1 - p) * 2.5) * 0.9; s.u.uCut.value = smooth(0.5, 1, p); s.u.uPan.value = T * 1.5; }; s.upd(0); return s; }
// 立著、朝某個方向推出去的氣環
function airRing(x, y, z, f, r0, r1, dur, P, delay = 0, pitch = 0) {
  const go = () => { const s = mesh('ringv'); col(s, P[0], P[1]); s.u.uMode.value = 4; s.u.uAdd.value = 0.3; s.dur = dur; s.m.position.set(x, y, z); orient(s.m, f, pitch, 0, 0); s.upd = p => { const r = lerp(r0, r1, 1 - Math.pow(1 - p, 3)); s.m.scale.set(r, r, r); s.u.uOp.value = Math.min(1, p * 12 + 0.3); s.u.uCut.value = smooth(0.3, 1, p); s.u.uPan.value = T; }; s.upd(0); };
  if (delay) later(delay, go); else go();
}
// 脹開的球殼（爆炸、震波）
function shell(x, y, z, r0, r1, dur, P, o = {}) { const s = mesh(o.dome ? 'dome' : 'orb'); col(s, P[0], P[1]); s.u.uMode.value = 2; s.u.uW.value = o.rim || 1.6; s.u.uAdd.value = o.add == null ? 0.4 : o.add; s.dur = dur; s.m.position.set(x, y, z); s.upd = p => { const k = lerp(r0, r1, 1 - Math.pow(1 - p, 3)); s.m.scale.set(k, k * (o.flat || 1), k); s.u.uOp.value = Math.min(1, p * 14 + 0.3); s.u.uCut.value = smooth(o.hold || 0.2, 1, p) * 1.15; s.u.uPan.value = T * 0.6; }; s.upd(0); return s; }
// 一根光矛：往前伸出去、再從尾端收掉。still：一出現就是全長（殘影）
function spike(x, y, z, f, len, w, P, dur, o = {}) {
  const s = mesh('spike'); col(s, P[0], P[1]); s.u.uMode.value = 1; s.u.uTip.value = o.tip == null ? 1 : o.tip; s.u.uW.value = 1; s.u.uAdd.value = o.add == null ? 0.25 : o.add; s.dur = dur; s.m.position.set(x, y, z); orient(s.m, f, o.pitch || 0, 0, 0);
  s.upd = p => { const e = o.still ? 1 : 1 - Math.pow(1 - Math.min(1, p / 0.3), 3); s.m.scale.set(w, w, len * (0.25 + 0.75 * e)); s.u.uOp.value = Math.min(1, p * 16 + 0.3) * (o.op || 1); s.u.uCut.value = smooth(o.hold || 0.35, 1, p) * 1.1; s.u.uPan.value = T * 3; }; s.upd(0); return s;
}
// 突刺：光矛加上穿過去的氣環與矛尖的火花
function thrust(x, y, z, f, len, w, P, hv, dur) {
  const sf = Math.sin(f), cf = Math.cos(f); spike(x + sf * 0.4, y, z + cf * 0.4, f, len, w, P, dur || (hv ? 0.3 : 0.22), { pitch: -0.07 }); gLane(x, z, f, len, w * 1.6, (dur || 0.26) + 0.1, P, { op: 0.75 });
  airRing(x + sf * len * 0.5, y, z + cf * len * 0.5, f, w * 0.3, w * (hv ? 1.5 : 1.1), 0.2, P, 0.02); if (hv) airRing(x + sf * len * 0.82, y, z + cf * len * 0.82, f, w * 0.2, w * 1.0, 0.2, P, 0.06);
  sparks(x + sf * len * 0.9, y, z + cf * len * 0.9, hv ? 7 : 4, P[0], { dir: f, cone: 0.35, sp: 9, up: 1.2, life: 0.22, grav: 3 });
}
// 月牙刀光。st：l 斜斬｜r 反手｜h 直劈｜s 迴旋｜t 突刺。o：{ heavy 重的, k 蓄力程度, P 顏色, noImpact 不要落地的效果, roll 另外指定側傾 }
function slash(x, y, z, f, st, sc = 1, tint, o = {}) {
  const hv = !!o.heavy, full = (o.k || 0) >= 0.95, P = o.P || (tint ? pal(tint) : hv ? C.heavy : C.steel);
  if (st === 't') return thrust(x, y + 1.2, z, f, 4.3 * sc, (hv ? 0.95 : 0.7) * sc, P, hv);
  const kind = st === 's' ? 'arcS' : st !== 'h' && hv && sc >= 1.25 ? 'arcH' : 'arc', dir = st === 'r' ? -1 : 1, dur = (st === 'h' ? 0.3 : st === 's' ? 0.4 : 0.24) + (hv ? 0.05 : 0), yy = y + (st === 'h' ? 1.15 : st === 's' ? 1.0 : 1.2), gk = st === 'h' ? 0.86 : kind === 'arcH' ? 0.9 : 1;
  const roll = o.roll != null ? o.roll : st === 'h' ? -0.82 : st === 's' ? 0.1 : st === 'r' ? 0.16 : -0.5, pitch = st === 'h' ? -0.6 : 0, sweep = st === 's' ? 5.4 : st === 'h' ? 1.2 : 1.15, sf = Math.sin(f), cf = Math.cos(f);
  const one = (c1, c2, k, lag, add, w) => {
    const s = mesh(kind); s.dur = dur + lag; col(s, c1, c2); s.u.uMode.value = 0; s.u.uW.value = w; s.u.uAdd.value = add; s.m.position.set(x, yy, z);
    s.upd = p => { const q = clamp((p * s.dur - lag) / dur, 0, 1), e = 1 - Math.pow(1 - Math.min(1, q / 0.36), 3), g = sc * gk * k * (0.92 + 0.12 * easeOut(q)); orient(s.m, f, pitch, roll * dir, -sweep * (1 - e) * dir); s.m.scale.set(g * dir, g, g); s.u.uOp.value = q <= 0 ? 0 : Math.min(1, q * 16 + 0.3); s.u.uCut.value = smooth(0.4, 1, q) * 1.15; s.u.uPan.value = T * 2.5; }; s.upd(0);
  };
  if (hv) one(P[1], [P[1][0] * 0.7, P[1][1] * 0.7, P[1][2] * 0.7], 1.1, 0.03, 0.1, 0.8);      // 重的一擊後面多一層深色的殘影，看起來更厚
  one(P[0], P[1], 1, 0, 0.2, hv ? 0.68 : 0.58);
  if (st === 'h') {
    const px = x + sf * 2.2 * sc, pz = z + cf * 2.2 * sc;
    if (!o.noImpact) later(0.07, () => { const gy = Hgt(px, pz); puffs(px, gy + 0.25, pz, hv ? 6 : 3, { sp: 3, up: 1.4, rad: 0.3 }); if (hv) { gRing(px, pz, 0.3, full ? 2.6 : 1.7, 0.3, P, { w: full ? 0.5 : 0.35 }); crack(px, pz, full ? 2.0 : 1.3, full ? 2.0 : 1.3, R() * TAU, P[0], full ? 1.6 : 1.1); shards(px, gy + 0.1, pz, full ? 7 : 3, C.rock[0], { sp: 3, up: full ? 7 : 5, rad: 0.5 }); sparks(px, gy + 0.3, pz, full ? 10 : 5, P[0], { sp: 5, up: 6, life: 0.4 }); if (full) flash(px, gy + 0.5, pz, 2.6, P[0], 0.14); } });
  } else if (hv) sparks(x + sf * 2.4 * sc, yy, z + cf * 2.4 * sc, st === 's' ? 9 : 5, P[0], { dir: f + (st === 's' ? 0 : dir * 1.0), cone: st === 's' ? Math.PI : 0.5, sp: 8, up: 2, life: 0.28, rad: st === 's' ? 2.4 * sc : 0 });
}
// 重擊落地：裂痕、衝擊環、碎石、塵團。pw 力道 0–1
function slam(x, z, r, P, pw = 1) {
  const y = Hgt(x, z); crack(x, z, r * 0.92, r * 0.92, R() * TAU, C.hot[0], 1.2 + pw * 0.7); gRing(x, z, r * 0.15, r, 0.4, P, { w: 0.55 + 0.35 * pw }); gDisc(x, z, r * 0.85, 0.16, P, 0.3);
  shards(x, y + 0.1, z, 5 + pw * 6, C.rock[0], { rad: r * 0.6, sp: 2.5, up: 5 + pw * 3 }); puffs(x, y + 0.25, z, 6 + pw * 4, { rad: r * 0.55, sp: r * 0.8, up: 1.5, s: 0.5 }); sparks(x, y + 0.3, z, 6 + pw * 6, P[0], { rad: r * 0.3, sp: r * 1.4, up: 5, life: 0.4 });
}
// 以自己為中心的震波
function nova(x, z, r, P) {
  const y = Hgt(x, z); gRing(x, z, 0.4, r, 0.42, P, { w: 0.6 }); later(0.07, () => gRing(x, z, 0.3, r * 0.74, 0.42, [P[1], P[1]], { w: 0.3, op: 0.7 })); curtain(x, z, 0.5, r, 1.0, 0.42, P); rune(x, z, 1.6, P, 0.5, null, { spin: 5 });
  shell(x, y + 0.2, z, 0.5, r * 0.5, 0.26, P, { dome: 1, flat: 0.7, rim: 2.4 }); flash(x, y + 1.3, z, 2.4, P[0]); sparks(x, y + 0.45, z, 14, P[0], { sp: r * 3.4, up: 0.5, life: 0.3, grav: 0, drag: 4, rad: 0.5, str: 7 });
}
// 爆開（火球、魔爆彈）
function explode(x, y, z, r, P, fire) {
  flash(x, y, z, r * 1.5, P[0], 0.13); shell(x, y, z, r * 0.3, r * 0.95, 0.36, P, { rim: 1.3, flat: 0.9 }); { const s = mesh('orb'); col(s, P[0], P[1]); s.u.uMode.value = 5; s.u.uW.value = 1.2; s.u.uAdd.value = 0.6; s.dur = 0.16; s.m.position.set(x, y, z); s.upd = q => { const k = r * lerp(0.25, 0.6, 1 - Math.pow(1 - q, 3)); s.m.scale.set(k, k, k); s.u.uOp.value = 1 - q * q; }; s.upd(0); }      // 中心一顆白熱的球，很快就散掉
  gRing(x, z, r * 0.2, r, 0.36, P, { w: 0.5 }); crack(x, z, r * 0.7, r * 0.7, R() * TAU, P[0], 1.4); sparks(x, y, z, 14, P[0], { sp: r * 3, up: 5, life: 0.5, grav: 10 });
  if (fire) puffs(x, y + 0.2, z, 5, { c: [0.2, 0.15, 0.13], sp: r * 0.8, up: 2.4, s: 0.55, life: 0.8, delay: 0.1 }); else shards(x, y, z, 6, P[0], { gem: 1, add: 1, sp: r * 1.6, up: 4, grav: 6, s: 0.2 });
}
// 命中的火花，依輕重分級（grade 由 game.js 算好）：
//   armor 霸體（打得到但打不動）：鋼藍色的小星、火花往出手的人那邊彈回來，沒有碎片
//   light 輕：一閃、一道斬痕、背向出手的人噴出的火花
//   heavy 重：大一號、兩道交叉斬痕、碎片
//   crush 暴擊／反擊／蓄滿、brk 打斷：金色的大星、往外推的衝擊環、一圈噴出的火花與碎片、腳下揚起塵土
function hitFx(v, o = {}) {
  if (!v || !near(v.x, v.z, 60)) return; const gr = o.grade || (o.strong ? 'heavy' : 'light'), big = gr === 'crush' || gr === 'brk', strong = big || gr === 'heavy', P = o.rgb ? pal(o.rgb) : gr === 'armor' ? C.armor : big ? C.gold : C.hit, b = body(v) * 0.75, c = W.camera.position, dx = c.x - v.x, dz = c.z - v.z, l = Math.hypot(dx, dz) || 1, hx = v.x + dx / l * b, hz = v.z + dz / l * b;
  const hy = Hgt(v.x, v.z) + clamp((MON[v.type] ? MON[v.type].tagH : 1.6) * (v.size || 1) * 0.42, 0.6, 1.5) + (o.second ? 0.35 : 0), from = Math.atan2(v.x - meX, v.z - meZ), k = big ? 1.6 : strong ? 1.45 : 1, a = rr(-0.9, 0.9);
  if (gr === 'armor') { flash(hx, hy, hz, 1.1, P[0], 0.09, 0.5); sparks(hx, hy, hz, 7, P[0], { dir: from + Math.PI, cone: 0.8, sp: 7, up: 2.4, life: 0.26, grav: 14, s: 0.14 }); return; }
  flash(hx, hy, hz, (big ? 0.95 : 1.4) * k, P[0], big ? 0.1 : strong ? 0.12 : 0.1, big ? 0.32 : 0.35); mark(hx, hy, hz, a, 2.2 * k, P[0], big ? 0.17 : 0.13); if (strong) mark(hx, hy, hz, a + rr(1.1, 2.0), 1.7 * k, P[0], 0.15);      // 金色那一下：星芒小一號、短一點，不把野獸的身形蓋掉
  sparks(hx, hy, hz, big ? 16 : strong ? 12 : 7, P[0], { dir: from, cone: big ? 1.3 : 0.95, sp: big ? 13 : strong ? 11 : 8, up: 3.4, life: big ? 0.4 : 0.34, grav: 12, s: big ? 0.22 : strong ? 0.2 : 0.17 });
  if (strong) shards(hx, hy, hz, big ? 6 : 4, P[0], { gem: 1, add: 1, sp: big ? 5 : 4, up: 4.5, s: 0.16 });
  if (big) { ringB(hx, hy, hz, 0.25, 1.7, 0.2, P[0]); const gy = Hgt(v.x, v.z); puffs(v.x, gy + 0.2, v.z, 5, { rad: b * 0.7, sp: 2.6, up: 0.9, s: 0.4 }); }
}

/* ============================== 對外：基本的幾種特效（game.js 在用） ============================== */
// 掛鉤：game.js 的特效函式開頭呼叫 fxBegin、結尾呼叫 fxEnd，中間它自己畫的基本款就不畫了（只記下來），改由這裡依招式播完整的一套；沒掛上、或遇到不認得的技能時，基本款照常畫
const stack = [], BEGIN = {}, END = {}; let mute = false;
export function fxBegin(kind, ...a) { const c = { kind, a, rec: [], mute: ready && !!BEGIN[kind] }; stack.push(c); mute = false; if (c.mute) try { if (BEGIN[kind](c, ...a) === false) c.mute = false; } catch (e) { c.mute = false; console.warn('特效', kind, e); } mute = c.mute; }
export function fxEnd() { const c = stack.pop(); mute = false; if (c && c.mute && END[c.kind]) try { END[c.kind](c, ...c.a); } catch (e) { console.warn('特效', c.kind, e); } mute = stack.length ? stack[stack.length - 1].mute : false; }
const rec = (n, a) => { stack[stack.length - 1].rec.push([n, a]); return DUMMY; }, DUMMY = { m: { position: new THREE.Vector3(), rotation: new THREE.Euler(), scale: new THREE.Vector3() } };
export function initFx() { initTex(); UH = U(texH); UWD = U(new THREE.Vector4(WORLD.SIZE / 2, WORLD.SIZE / WORLD.GRID, WORLD.GRID + 1, 0.3)); initGeos(); initSprites(); initFixed(); ready = true; }
// 刀光。style：l 斜斬｜r 反手｜h 重劈｜t 突刺｜s 迴旋（也接受舊的連段編號 0、1、2）；scale 放大倍率；tint 顏色
const SLASH_OLD = ['l', 'r', 'h'];
export function spawnSlash(x, y, z, f, style, scale = 1, tint) { const st = typeof style === 'number' ? SLASH_OLD[style] || 'l' : style || 'l'; if (mute) return rec('slash', [x, y, z, f, st, scale, tint]); slash(x, y, z, f, st, scale, tint, { heavy: !!tint || st === 'h' || st === 's' }); }
export function emit(x, y, z, n, rgb, speed, up, life, grav) { if (mute) return rec('emit', [x, y, z, n, rgb]); emit0(x, y, z, n, rgb, speed, up, life, grav); }
// 往中心聚攏的粒子（蓄力用）
export function emitGather(x, y, z, n, rgb, r) { if (mute) return; for (const [o, c] of charges) if (T - c.seen < 0.2 && Math.hypot(o.x - x, o.z - z) < 1) return; gather(x, y + 0.7, z, n, pal(rgb)[0], 0, r); }
// 地面擴散的圓環（震波、落地、治療、戰吼）
export function fxRing(x, z, r0, r1, dur, rgb, op = 0.9) { if (mute) return rec('ring', [x, z, r0, r1, dur, rgb]); return gRing(x, z, r0, r1, dur, pal(rgb), { op, w: 0.22 + Math.max(r0, r1) * 0.06 }); }
// 地面閃一下的圓盤
export function fxDisc(x, z, r, dur, rgb, op = 0.5) { if (mute) return rec('disc', [x, z, r]); return gDisc(x, z, r, dur, pal(rgb), op); }
// 光柱（可跟著角色）
export function fxPillar(x, z, r, h, dur, rgb, follow) { if (mute) return rec('pillar', [x, z, r, h, dur, rgb, follow]); const P = pal(rgb); motes(x, Hgt(x, z) + 0.2, z, 8, P[0], K.star, { rad: r, up: h * 0.4, life: dur }); return pillar(x, z, r, h, dur, P, follow); }
// 護罩半球（跟著角色）
export function fxDome(follow, r, dur, rgb) { if (mute) return rec('dome', [follow, r, dur, rgb]); return dome(follow, r, dur, pal(rgb)); }
// 腳下的光環（跟著角色，增益狀態用）
export function fxAura(follow, r, dur, rgb) { if (mute) return rec('aura', [follow, r, dur, rgb]); return aura(follow, r, dur, pal(rgb)); }
// 地面的長條光痕（裂地、突進殘影）；y 高於 0.5 的是浮在空中的殘影
export function fxLane(x, z, f, len, w, dur, rgb, y = 0.15, grow = true) { if (mute) return rec('lane', [x, z, f, len, w]); const P = pal(rgb); return y < 0.5 ? gLane(x, z, f, len, w, dur, P, { still: !grow }) : spike(x, Hgt(x, z) + y, z, f, len, w * 0.8, P, dur, { still: !grow }); }
function dome(follow, r, dur, P) {
  const s = mesh('dome'); col(s, P[0], P[1]); s.u.uMode.value = 2; s.u.uW.value = 2.6; s.u.uAdd.value = 0.5; s.dur = dur; s.follow = follow; s.m.position.set(follow.x, Hgt(follow.x, follow.z), follow.z);
  s.upd = p => { const t = p * dur, e = Math.min(1, t / 0.2), k = r * (e < 1 ? lerp(0.45, 1.14, easeOut(e)) : 1 + 0.14 * Math.exp(-(t - 0.2) * 9) + Math.sin(T * 5) * 0.012); s.m.scale.set(k, k * 0.95, k); s.m.rotation.y = T * 0.5; s.u.uOp.value = Math.min(1, t * 14 + 0.3); s.u.uCut.value = smooth(dur - 0.3, dur, t) * 1.1; s.u.uPan.value = T * 0.25; }; s.upd(0);
  later(dur - 0.14, () => { if (s.live && s.follow === follow) shards(follow.x, Hgt(follow.x, follow.z) + 1.2, follow.z, 10, P[0], { gem: 1, add: 1, sp: 4, up: 3, grav: 7, rad: r * 0.7, s: 0.22 }); }); return s;
}
function aura(follow, r, dur, P) {
  const s = rune(follow.x, follow.z, r, P, dur, follow, { spin: 1.6, op: 0.9 }), u0 = s.upd; let nx = 0;
  s.upd = p => { u0(p); if (T >= nx && near(follow.x, follow.z, 40)) { nx = T + 0.2 / QN(); const a = R() * TAU; sp(follow.x + Math.cos(a) * r * 0.8, Hgt(follow.x, follow.z) + 0.2, follow.z + Math.sin(a) * r * 0.8, 0, rr(1.6, 2.6), 0, rr(0.5, 0.8), 0.1, 0.03, K.streak, P[0], 1, -1, 0, 5); } }; return s;
}

/* ============================== 技能（每個一套：出手、主體、消散） ============================== */
const SK = {
  // 重斬：一記橘紅的直劈，裂痕沿著地面往前衝，碎石一路翻起
  cleave(who, x, z, f, arg, S) {
    const y = Hgt(x, z), P = C.fire, sf = Math.sin(f), cf = Math.cos(f), ex = x + sf * S.len, ez = z + cf * S.len; slash(x, y, z, f, 'h', 1.3, null, { heavy: 1, P, noImpact: 1 }); flash(x + sf * 1.8, y + 0.6, z + cf * 1.8, 3.0, P[0], 0.14);
    gLane(x, z, f, S.len + 0.6, S.w * 1.15, 0.5, P); crack(x + sf * S.len / 2, z + cf * S.len / 2, S.w * 0.75, S.len / 2, f, P[0], 1.8, texFis, 1);
    for (let i = 0; i <= 6; i++) later(0.02 + i * 0.026, () => { const d = 0.8 + i / 6 * (S.len - 0.8), px = x + sf * d + rr(-0.5, 0.5), pz = z + cf * d + rr(-0.5, 0.5), gy = Hgt(px, pz); shards(px, gy + 0.1, pz, 2, C.rock[0], { sp: 2, up: 6.5 }); puffs(px, gy + 0.25, pz, 2, { sp: 2, up: 1.6 }); sparks(px, gy + 0.2, pz, 2, P[0], { sp: 2.5, up: 6, life: 0.4 }); pillar(px, pz, 0.55 + i * 0.05, 1.5 + i * 0.22, 0.3, P, null, 0.9); });
    later(0.2, () => { gRing(ex, ez, 0.3, 1.9, 0.3, P, { w: 0.35 }); sparks(ex, Hgt(ex, ez) + 0.4, ez, 6, P[0], { dir: f, cone: 0.8, sp: 6, up: 4 }); });
  },
  // 疾步斬：綠色的風。衝過去的路上留下幾道殘影與交叉的斬痕，終點一圈風
  dash(who, x, z, f, arg, S) {
    const len = num(arg, S.len), y = Hgt(x, z), P = C.wind, sf = Math.sin(f), cf = Math.cos(f), ex = x + sf * len, ez = z + cf * len, ey = Hgt(ex, ez);
    gLane(x, z, f, len, 2.2, 0.4, P, { still: 1, op: 0.8 }); for (const [h, w, o] of [[1.15, 1.3, 0], [0.6, 0.7, 0.45], [1.6, 0.6, -0.4]]) spike(x - cf * o, y + h, z + sf * o, f, len, w, P, 0.3, { still: 1, hold: 0.15 });
    for (let i = 1; i <= 2; i++) { const d = len * i / 3, px = x + sf * d, pz = z + cf * d, py = Hgt(px, pz) + 1.1; later(i * 0.04, () => { mark(px, py, pz, 0.8, 3.2, P[0], 0.16, 0.28); mark(px, py, pz, -0.8, 3.2, P[0], 0.16, 0.28); sparks(px, py, pz, 5, P[0], { dir: f, cone: 1.2, sp: 6, up: 2.5, life: 0.3, grav: 4 }); }); }
    gRing(ex, ez, 0.3, 2.2, 0.32, P, { w: 0.35 }); puffs(ex, ey + 0.2, ez, 5, { dir: f, cone: 0.8, sp: 4, up: 1 }); flash(ex, ey + 1.2, ez, 1.8, P[0]);
  },
  // 鐵壁：金色的護罩彈出來罩住自己，腳下一圈法陣，一道淡淡的環往外掃過被拉住注意力的範圍
  wall(who, x, z, f, arg, S) { const y = Hgt(x, z), P = C.gold; dome(who, 1.9, S.dur, P); rune(x, z, 1.9, P, S.dur, who, { spin: 0.8, op: 0.8 }); gRing(x, z, 1, S.r, 0.6, P, { w: 0.3, op: 0.5 }); flash(x, y + 1.4, z, 3.0, P[0], 0.14); sparks(x, y + 0.3, z, 12, P[0], { sp: 5, up: 5, rad: 1.2, life: 0.4, grav: 5 }); },
  blade(who, x, z, f) { const y = Hgt(x, z) + 1.25, P = C.cyan, sf = Math.sin(f), cf = Math.cos(f); slash(x, Hgt(x, z), z, f, 'l', 0.7, null, { P, roll: -0.15 }); airRing(x + sf * 1.2, y, z + cf * 1.2, f, 0.2, 0.9, 0.2, P); },
  // 火球術：出手時掌前一閃、一圈火環、往後濺的火星（火球本身與爆炸在別處）
  fire(who, x, z, f) { const y = Hgt(x, z) + 1.25, P = C.fire, sf = Math.sin(f), cf = Math.cos(f), px = x + sf * 1.0, pz = z + cf * 1.0; flash(px, y, pz, 2.2, P[0]); airRing(px, y, pz, f, 0.25, 1.2, 0.22, P); sparks(px, y, pz, 8, P[0], { dir: f + Math.PI, cone: 1.0, sp: 4, up: 3, life: 0.4, grav: 3 }); },
  // 治癒之光：慢。腳下的法陣轉開，柔和的光柱升起，一道很淡的環慢慢掃過範圍，加號形的光點往上飄
  heal(who, x, z, f, arg, S) { const y = Hgt(x, z), P = C.heal; rune(x, z, 2.4, P, 1.2, who, { spin: 0.9 }); gRing(x, z, 0.5, S.r, 0.9, P, { w: 0.4, op: 0.5, lin: 0 }); pillar(x, z, 1.25, 4.8, 1.1, P, who, 0.7); motes(x, y + 0.1, z, 16, P[0], K.plus, { rad: 1.3, up: 1.9, life: 1.1, delay: 0.5 }); motes(x, y + 0.3, z, 6, [1.3, 1.3, 0.9], K.star, { rad: 1.5, up: 1.2, life: 0.9, delay: 0.6, s: 0.2 }); },
  // 戰吼：紅橘色的聲波一圈圈推出去，嘴邊炸出放射的線，腳下留一圈跟著走的戰意
  warcry(who, x, z, f, arg, S) {
    const y = Hgt(x, z), P = C.rage; for (let i = 0; i < 3; i++) later(i * 0.08, () => { gRing(x, z, 0.6, S.r * (1 - i * 0.22), 0.5, P, { w: 0.34 - i * 0.06, op: 1 - i * 0.2 }); ringB(x, y + 1.7, z, 0.3, 2.2 - i * 0.4, 0.3, P[0]); });
    flash(x, y + 1.7, z, 2.6, P[0], 0.14); sparks(x, y + 1.6, z, 18, P[0], { sp: 15, up: 0.6, life: 0.3, grav: 0, drag: 5, rad: 0.5, str: 8 }); aura(who, 1.25, S.dur, P);
  },
  // 震地踏：大片的裂痕、厚重的衝擊環、一圈碎石
  quake(who, x, z, f, arg, S) { slam(x, z, S.r, C.earth, 1); const y = Hgt(x, z); later(0.09, () => gRing(x, z, S.r * 0.3, S.r * 0.8, 0.4, [C.earth[1], C.earth[1]], { w: 0.4, op: 0.7 })); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rr(-0.2, 0.2), px = x + Math.sin(a) * S.r * 0.72, pz = z + Math.cos(a) * S.r * 0.72; later(0.05, () => shards(px, Hgt(px, pz) + 0.1, pz, 2, C.rock[0], { sp: 1.5, up: 7.5, s: 0.3 })); } flash(x, y + 0.4, z, 2.2, C.hot[0], 0.12, 0.35); },
  // 影步：原地往內收成一道細光、碎片飄散；一條紫色的線連到落點；落點炸開一圈
  blink(who, x, z, f, arg) {
    const tx = Array.isArray(arg) ? num(arg[0], x) : x, tz = Array.isArray(arg) ? num(arg[1], z) : z, P = C.shade, y = Hgt(x, z), ty = Hgt(tx, tz), d = Math.hypot(tx - x, tz - z);
    gRing(x, z, 1.7, 0.2, 0.24, P, { w: 0.3, lin: 1 }); pillar(x, z, 0.45, 3.6, 0.32, P); shards(x, y + 1.1, z, 8, P[0], { gem: 1, add: 1, sp: 2.5, up: 2.5, grav: -2, s: 0.2, life: 0.5 });
    if (d > 0.5) spike(x, y + 1.1, z, Math.atan2(tx - x, tz - z), d, 0.8, P, 0.28, { still: 1, hold: 0.1, tip: 0.5 });
    later(0.05, () => { gRing(tx, tz, 0.3, 2.0, 0.32, P, { w: 0.35 }); flash(tx, ty + 1.2, tz, 2.4, P[0], 0.14); pillar(tx, tz, 0.6, 3.2, 0.3, P); sparks(tx, ty + 0.4, tz, 10, P[0], { sp: 4, up: 6, life: 0.4, grav: 6, rad: 0.5 }); });
  },
  // 穿刺：一根金色的長矛貫穿整條線，兩道氣環，地上一道光痕，盡頭一閃
  pierce(who, x, z, f, arg, S) { const y = Hgt(x, z), P = C.gold, sf = Math.sin(f), cf = Math.cos(f), ex = x + sf * S.len, ez = z + cf * S.len; thrust(x, y + 1.15, z, f, S.len + 0.8, 1.35, P, 1, 0.34); later(0.05, () => { flash(ex, Hgt(ex, ez) + 1.15, ez, 2.0, P[0]); }); },
  // 魔法飛彈：出手時身前一個小法陣閃一下（飛彈本身在別處）
  missile(who, x, z, f) { const y = Hgt(x, z) + 1.4, P = C.arcane, sf = Math.sin(f), cf = Math.cos(f); airRing(x + sf * 0.9, y, z + cf * 0.9, f, 0.3, 1.1, 0.3, P); flash(x + sf * 0.9, y, z + cf * 0.9, 1.6, P[0]); sparks(x + sf * 0.9, y, z + cf * 0.9, 6, P[0], { sp: 3, up: 2, life: 0.35, grav: -1 }); },
  // 三重箭：弓前三道扇形的風線
  triple(who, x, z, f) { const y = Hgt(x, z) + 1.42, P = C.bow, sf = Math.sin(f), cf = Math.cos(f); for (let i = -1; i <= 1; i++) spike(x + sf * 0.8, y, z + cf * 0.8, f + i * 0.16, 3.4, 0.45, P, 0.2, { hold: 0.2 }); airRing(x + sf * 1.1, y, z + cf * 1.1, f, 0.2, 0.9, 0.2, P); },
  // 連斬：前三刀角度各不相同，最後一刀是直劈加一個交叉的斬痕
  flurry(who, x, z, f, arg, S, mine) {
    if (!mine) return false; const i = num(arg, 0) | 0, last = i >= S.n - 1, y = Hgt(x, z), P = C.flurry, sf = Math.sin(f), cf = Math.cos(f);
    if (!last) return void slash(x, y, z, f, i % 2 ? 'r' : 'l', 1.12, null, { P, roll: [-0.75, 0.6, -0.12][i % 3] });
    slash(x, y, z, f, 'h', 1.3, null, { heavy: 1, k: 1, P }); const px = x + sf * 2.2, pz = z + cf * 2.2, py = Hgt(px, pz) + 1.1; mark(px, py, pz, 0.75, 4.2, P[0], 0.18, 0.34); mark(px, py, pz, -0.75, 4.2, P[0], 0.18, 0.34); sparks(px, py, pz, 10, P[0], { dir: f, cone: 0.9, sp: 9, up: 3 });
  },
  nova(who, x, z, f, arg, S) { nova(x, z, S.r, C.mana); },
  // 後躍射擊：從起跳的地方到落點拉出一道風，落地揚塵，弓前一圈氣環（x、z 是放箭時站的位置，起跳點在前方）
  backshot(who, x, z, f, arg, S) { const y = Hgt(x, z), P = C.bow, sf = Math.sin(f), cf = Math.cos(f), d = S.back || 5, tx = x + sf * d, tz = z + cf * d; gLane(tx, tz, f + Math.PI, d, 1.8, 0.4, P, { still: 1 }); gRing(tx, tz, 0.3, 1.8, 0.3, P, { w: 0.3 }); for (const [h, o, w] of [[0.7, 0.4, 0.5], [1.25, -0.3, 0.7]]) spike(tx - cf * o, y + h, tz + sf * o, f + Math.PI, d, w, P, 0.28, { still: 1, hold: 0.1, tip: 0.3 }); puffs(x, y + 0.25, z, 6, { dir: f, cone: 0.8, sp: 3.5, up: 1 }); airRing(x + sf * 1.0, y + 1.42, z + cf * 1.0, f, 0.3, 1.3, 0.22, P); flash(x + sf * 1.0, y + 1.42, z + cf * 1.0, 1.8, P[0]); },
  // 破勢踢：腳尖的位置一個大大的四芒星、兩道氣環、一小根光矛與踢起來的塵土
  kick(who, x, z, f) { const sf = Math.sin(f), cf = Math.cos(f), px = x + sf * 1.7, pz = z + cf * 1.7, y = Hgt(px, pz) + 0.85, P = C.kick; flash(px, y, pz, 2.8, P[0], 0.13); airRing(px, y, pz, f, 0.25, 1.5, 0.22, P); airRing(px + sf * 0.6, y, pz + cf * 0.6, f, 0.2, 0.9, 0.2, P, 0.05); spike(x + sf * 0.3, Hgt(x, z) + 0.8, z + cf * 0.3, f, 2.8, 0.9, P, 0.18); sparks(px, y, pz, 10, P[0], { dir: f, cone: 0.7, sp: 9, up: 2.5 }); puffs(px, y - 0.55, pz, 4, { dir: f, cone: 0.6, sp: 4 }); }
};
BEGIN.skill = (c, id, who, x, z, f, arg, mine) => { const S = SKILLS[id]; if (!S || !SK[id]) return false; if (!near(x, z, 70)) return; return SK[id](who, x, z, f, arg, S, mine); };
// 別人放的治療與戰吼，站在範圍內的自己身上也要有（game.js 原本是對自己再畫一次光柱、光環）
END.skill = (c, id, who) => { for (const [n, a] of c.rec) { if (n === 'pillar' && a[6] && a[6] !== who) { const o = a[6], P = C.heal; pillar(o.x, o.z, 1.0, 4.2, 0.9, P, o, 0.7); motes(o.x, Hgt(o.x, o.z) + 0.1, o.z, 8, P[0], K.plus, { rad: 1, up: 1.9, life: 1.0 }); } if (n === 'aura' && a[0] !== who) aura(a[0], a[1], a[2], C.rage); } };
// 普通攻擊與招式（刀光、盾擊、震波）
END.atk = (c, o, a, i, y, tint) => {
  const A = a.A || {}, k = a.code === 8 ? a.k || 0 : 0; if (!near(o.x, o.z, 70)) return;
  if (A.nova) return nova(o.x, o.z, A.nova, C.mana);
  if (A.fx === 'p') { const sf = Math.sin(o.f), cf = Math.cos(o.f), px = o.x + sf * 1.5, pz = o.z + cf * 1.5, P = C.kick; flash(px, y + 1.15, pz, 2.4, P[0], 0.13); airRing(px, y + 1.15, pz, o.f, 0.3, 1.5, 0.22, P); spike(o.x + sf * 0.3, y + 1.1, o.z + cf * 0.3, o.f, 2.4, 0.9, P, 0.18); sparks(px, y + 1.15, pz, 12, P[0], { dir: o.f, cone: 0.8, sp: 9, up: 2.5 }); return; }
  const r = c.rec.find(e => e[0] === 'slash'), wave = A.wave && (!A.waveAt || (a.k || 0) >= A.waveAt);
  if (r) { const [x, yy, z, f, st, sc, tn] = r[1]; slash(x, yy, z, f, st, sc * (st === 't' ? 1 : 1), tint || null, { heavy: !!A.heavy || a.code === 8 || st === 's', k, noImpact: wave, P: tint || A.heavy || a.code === 8 || st === 's' ? null : C.steel }); }
  if (wave) { const px = o.x + Math.sin(o.f) * 2.2, pz = o.z + Math.cos(o.f) * 2.2; slam(px, pz, A.wave, C.heavy, 1); gLane(o.x, o.z, o.f, 2.2 + A.wave, 1.8, 0.45, C.heavy); flash(px, Hgt(px, pz) + 0.5, pz, 3.0, C.heavy[0], 0.14); }
};
BEGIN.atk = () => true;
BEGIN.hit = (c, v, dmg, o) => { hitFx(v, o); };
BEGIN.boom = (c, p) => { explode(p.x, p.y, p.z, p.S.r, p.kind === 'fire' ? C.fire : pal(p.rgb), p.kind === 'fire'); };
// 怪物的招式落地
BEGIN.impact = (c, v, s, M) => {
  if (!near(s.x, s.z, 50)) return; const y = Hgt(s.x, s.z), P = C.foe, an = M.anim;
  if (s.shape === 'circle' || s.shape === 'ring') {
    if (an === 'roar') { for (let i = 0; i < 3; i++) later(i * 0.07, () => gRing(s.x, s.z, s.shape === 'ring' ? s.r0 : s.r * 0.2, s.r, 0.5, C.ice, { w: 0.4 - i * 0.08, op: 0.9 - i * 0.2 })); ringB(v.x, y + 1.6, v.z, 0.4, 2.6, 0.3, C.ice[0]); sparks(v.x, y + 1.4, v.z, 14, C.ice[0], { sp: 14, up: 0.5, life: 0.3, grav: 0, drag: 5, rad: 0.8, str: 8 }); }
    else if (an === 'spin') { slash(s.x, y - 0.5, s.z, s.f, 's', s.r / 3.5, null, { P, heavy: 1 }); puffs(s.x, y + 0.25, s.z, 6, { rad: s.r * 0.6, sp: 3 }); }
    else slam(s.x, s.z, s.r, [P[0], C.earth[1]], M.heavy ? 1 : 0.5);
  } else if (s.shape === 'cone') {
    const k = s.r / 3.1; if (an === 'bite') { for (const d of [1, -1]) slash(s.x, y - 0.4, s.z, s.f, d > 0 ? 'l' : 'r', k * 0.7, null, { P, roll: d * 0.85 }); }
    else if (an === 'kick') { const px = s.x + Math.sin(s.f) * s.r * 0.6, pz = s.z + Math.cos(s.f) * s.r * 0.6; flash(px, y + 0.8, pz, 2.0, P[0]); airRing(px, y + 0.8, pz, s.f, 0.3, 1.3, 0.2, P); puffs(px, y + 0.25, pz, 5, { dir: s.f, cone: 0.7, sp: 4 }); }
    else for (let j = 0; j < 3; j++) later(j * 0.02, () => { const sm = mesh('arc'), kk = k * (0.74 + j * 0.2), yy = y + 0.35 + j * 0.55; col(sm, P[0], P[1]); sm.u.uMode.value = 0; sm.u.uW.value = 0.24; sm.u.uAdd.value = 0.2; sm.dur = 0.26; sm.m.position.set(s.x, yy, s.z); sm.upd = p => { const e = 1 - Math.pow(1 - Math.min(1, p / 0.36), 3); orient(sm.m, s.f, 0, -0.42, -1.0 * (1 - e)); sm.m.scale.set(kk, kk, kk); sm.u.uOp.value = Math.min(1, p * 16 + 0.3); sm.u.uCut.value = smooth(0.4, 1, p) * 1.15; sm.u.uPan.value = T * 2.5; }; sm.upd(0); });      // 爪擊：三道平行的爪痕
    puffs(s.x + Math.sin(s.f) * s.r * 0.6, y + 0.25, s.z + Math.cos(s.f) * s.r * 0.6, 4, { sp: 3 });
  }
};
// 怪物的狀態變化：出招揚塵、死亡消散、菁英現身
BEGIN.mon = (c, v, st) => {
  if (!near(v.x, v.z, 55)) return; const y = Hgt(v.x, v.z), b = body(v), h = (MON[v.type] ? MON[v.type].tagH : 1.6) * (v.size || 1);
  if (st === MST.STRIKE) puffs(v.x, y + 0.25, v.z, 6, { sp: 3, up: 1, rad: b * 0.5 });
  else if (st === MST.DEAD) { const P = v.elite ? C.gold : C.soul; gRing(v.x, v.z, b * 0.5, b * 2.4, 0.5, P, { w: 0.3, op: 0.7 }); puffs(v.x, y + h * 0.4, v.z, 8, { c: [0.95, 0.93, 0.86], sp: 2.4, up: 1.6, rad: b * 0.5, s: 0.55, life: 0.8 }); flash(v.x, y + h * 0.45, v.z, 2.2 * (v.elite ? 1.5 : 1), P[0], 0.14); motes(v.x, y + 0.3, v.z, v.elite ? 20 : 10, P[0], K.star, { rad: b, h: h * 0.6, up: 2.2, life: 0.9, delay: 0.3 }); later(1.5, () => motes(v.x, Hgt(v.x, v.z) + 0.2, v.z, v.elite ? 14 : 8, P[0], K.dot, { rad: b * 0.8, h: h * 0.5, up: 2.6, life: 0.9, s: 0.14, delay: 0.5 })); if (v.elite) pillar(v.x, v.z, b * 0.8, 6, 1.0, P); }
  else if (st === MST.WIND && v.elite && v.M && v.M.cd) { gRing(v.x, v.z, b * 2.6, b * 0.6, 0.5, P_FOE, { w: 0.3, lin: 1, op: 0.8 }); gather(v.x, y + h * 0.5, v.z, Math.round(14 * QN()), C.foe[0], 0.45, b * 2.2, 0.16); }      // 菁英的招牌招式：先聚一口氣
  else if ((st === MST.CHASE || st === MST.WIND) && v.elite && !v.fxSeen) { v.fxSeen = 1; gRing(v.x, v.z, b * 0.5, b * 3.4, 0.6, C.foe, { w: 0.5 }); pillar(v.x, v.z, b * 1.1, h * 2.2, 0.8, C.foe); rune(v.x, v.z, b * 2.0, C.foe, 1.2, v, { spin: 2 }); flash(v.x, y + h * 0.6, v.z, 4, C.foe[0], 0.16); sparks(v.x, y + 0.4, v.z, 16, C.foe[0], { sp: 5, up: 8, rad: b, life: 0.5, grav: 6 }); }      // 菁英第一次盯上人：現身
  if (st === MST.IDLE) v.fxSeen = 0;
};
const P_FOE = [C.foe[0], C.foe[1]];

/* ---------- 單發的提示（game.js 用 fxCue 呼叫；o 是角色） ---------- */
const front = (o, d = 0.55) => { const c = W.camera.position, dx = c.x - o.x, dz = c.z - o.z, l = Math.hypot(dx, dz) || 1; return [o.x + dx / l * d, o.z + dz / l * d]; };
const CUE = {
  // 施放技能的預備：一圈往腳下收的環、往身上聚的光點；法術多一個法陣。d 是離生效還有幾秒
  cast(o, id, d) { const S = SKILLS[id], P = SKC[id]; if (!S || !P) return; d = clamp(num(d, 0.2), 0.06, 0.6); const y = Hgt(o.x, o.z); gRing(o.x, o.z, 1.3 + d * 2.4, 0.3, d, P, { w: 0.22, lin: 1, op: 0.85 }); gather(o.x, y + 1.15, o.z, Math.round((5 + d * 28) * QN()), P[0], d * 0.8, 1.6); if (S.sc === 'spell' || !S.dmg) rune(o.x, o.z, 1.35, P, d + 0.2, o, { op: 0.75, spin: 4 }); },
  // 完美閃避：青色的殘影線與一閃
  perfect(o) { const y = Hgt(o.x, o.z), P = C.cyan; flash(o.x, y + 1.3, o.z, 2.6, P[0], 0.16); for (let i = 0; i < 5; i++) { const a = R() * TAU, r = rr(0.4, 0.9); sp(o.x + Math.cos(a) * r, y + rr(0.2, 0.6), o.z + Math.sin(a) * r, 0, rr(5, 8), 0, 0.3, 0.14, 0.05, K.streak, P[0], 1, 0, 2, 9); } ringB(o.x, y + 1.2, o.z, 0.4, 1.4, 0.22, P[0]); gRing(o.x, o.z, 0.4, 2.2, 0.3, P, { w: 0.3 }); },
  // 精準格擋：盾前一顆大四芒星、一道氣環
  parry(o) { const sf = Math.sin(o.f), cf = Math.cos(o.f), x = o.x + sf * 0.9, z = o.z + cf * 0.9, y = Hgt(o.x, o.z) + 1.3, P = C.gold; flash(x, y, z, 3.4, P[0], 0.16); airRing(x, y, z, o.f, 0.3, 1.7, 0.24, P); mark(x, y, z, 0.6, 3.4, P[0], 0.16, 0.26); mark(x, y, z, -0.9, 2.8, P[0], 0.16, 0.22); },
  // 反擊時機（精準格擋、完美閃避之後）：身上一圈金色的環往內收、武器一閃，提示「現在按攻擊」；go＝反擊招出手的那一下
  counter(o, go) { const y = Hgt(o.x, o.z), P = C.gold; if (go) { const sf = Math.sin(o.f), cf = Math.cos(o.f); gLane(o.x, o.z, o.f, 3.4, 1.4, 0.3, P, { op: 0.7 }); flash(o.x + sf * 0.6, y + 1.2, o.z + cf * 0.6, 2.0, P[0], 0.12); return; } gRing(o.x, o.z, 2.2, 0.5, 0.26, P, { w: 0.3, lin: 1 }); ringB(o.x, y + 1.2, o.z, 1.3, 0.3, 0.24, P[0]); motes(o.x, y + 0.2, o.z, 6, P[0], K.star, { rad: 0.7, h: 1.2, up: 1.4, life: 0.6, s: 0.22 }); },
  // 野獸撲空：前腳一路擦地，揚起一串塵土與碎石
  stumble(v) { const b = (MON[v.type] ? MON[v.type].body : 1) * (v.size || 1), f = v.f, sf = Math.sin(f), cf = Math.cos(f), x = v.x + sf * b * 0.7, z = v.z + cf * b * 0.7, y = Hgt(x, z);
    puffs(x, y + 0.15, z, 5, { dir: f, cone: 0.9, sp: 3, up: 0.8, rad: b * 0.4, s: 0.3 + 0.12 * b, life: 0.6 }); shards(x, y + 0.1, z, 3, C.rock[0], { sp: 2.5, up: 3, rad: b * 0.3, s: 0.1 });
    later(0.14, () => { const x2 = x + sf * 0.6, z2 = z + cf * 0.6; puffs(x2, Hgt(x2, z2) + 0.12, z2, 3, { dir: f, cone: 1.1, sp: 2, up: 0.5, rad: b * 0.5, s: 0.26 + 0.1 * b }); }); },
  // 爬坡、下坡的腳步：k > 0 上坡（往後踢出碎土），k < 0 下坡（腳跟前擦出一團塵）；sd 左右腳
  slope(o, k, sd) { const f = o.f, sf = Math.sin(f), cf = Math.cos(f), px = o.x + cf * 0.17 * sd, pz = o.z - sf * 0.17 * sd, y = Hgt(px, pz), a = Math.min(1, Math.abs(k));
    if (k > 0) { const bx = px - sf * 0.25, bz = pz - cf * 0.25; puffs(bx, y + 0.12, bz, a > 0.7 ? 2 : 1, { dir: f + Math.PI, cone: 0.5, sp: 1.6, up: 0.9, s: 0.2 + 0.1 * a, life: 0.5 }); shards(bx, y + 0.1, bz, 1 + Math.round(a), C.rock[0], { sp: 1.4, up: 3.2, s: 0.07 }); }
    else { const qx = px + sf * 0.3, qz = pz + cf * 0.3; puffs(qx, y + 0.1, qz, 2, { dir: f, cone: 0.7, sp: 2.2 * a, up: 0.6, s: 0.24 + 0.12 * a, life: 0.55 }); } },
  block(o) { const sf = Math.sin(o.f), cf = Math.cos(o.f), x = o.x + sf * 0.8, z = o.z + cf * 0.8, y = Hgt(o.x, o.z) + 1.3; flash(x, y, z, 1.7, C.steel[0], 0.1); airRing(x, y, z, o.f, 0.25, 1.0, 0.18, C.steel); },
  // 受傷：紅色的一閃與斬痕
  hurt(o) { const y = Hgt(o.x, o.z) + 1.3, P = C.foe, [x, z] = front(o); flash(x, y, z, 2.2, P[0], 0.13, 0.3); mark(x, y, z, rr(-1, 1), 2.8, P[0], 0.16, 0.26); mark(x, y, z, rr(1.2, 2), 2.0, P[0], 0.16, 0.2); sparks(x, y, z, 7, P[0], { sp: 6, up: 3, life: 0.3, s: 0.18 }); },
  // 升級：金色的光柱、法陣、往外的環、往上飄的星星
  levelup(o) { const y = Hgt(o.x, o.z), P = C.gold; pillar(o.x, o.z, 1.3, 7, 1.3, P, o); rune(o.x, o.z, 2.6, P, 1.4, o, { spin: 2 }); gRing(o.x, o.z, 0.5, 5, 0.7, P, { w: 0.5 }); later(0.15, () => gRing(o.x, o.z, 0.5, 3.4, 0.6, P, { w: 0.3, op: 0.7 })); flash(o.x, y + 1.5, o.z, 4.5, P[0], 0.2); motes(o.x, y + 0.2, o.z, 22, P[0], K.star, { rad: 1.6, up: 3, life: 1.2, delay: 0.7, s: 0.34 }); },
  // 喝藥水：一小圈綠色的法陣、加號往上飄
  potion(o) { const y = Hgt(o.x, o.z), P = C.heal; rune(o.x, o.z, 1.2, P, 0.8, o, { spin: 2 }); pillar(o.x, o.z, 0.8, 3.2, 0.7, P, o, 0.55); motes(o.x, y + 0.2, o.z, 9, P[0], K.plus, { rad: 0.8, up: 1.8, life: 0.9 }); },
  // 撿到東西：幾顆金色的光點從掉落的地方飛到身上
  loot(o, v) { if (!v) return; const y0 = Hgt(v.x, v.z) + 0.8, y1 = Hgt(o.x, o.z) + 1.2, n = Math.max(3, Math.round(7 * QN())); for (let i = 0; i < n; i++) { const life = rr(0.4, 0.6), g = 9, d = i * 0.04; sp(v.x + rr(-0.4, 0.4), y0, v.z + rr(-0.4, 0.4), (o.x - v.x) / life, (y1 - y0) / life + 0.5 * g * life, (o.z - v.z) / life, life, 0.34, 0.2, K.gem, C.gold[0], 1, g, 0, 0, R() * TAU, 6, d + 0.25); } later(0.75, () => { flash(o.x, Hgt(o.x, o.z) + 1.2, o.z, 1.6, C.gold[0]); ringB(o.x, Hgt(o.x, o.z) + 1.2, o.z, 0.15, 0.55, 0.22, C.gold[0]); }); }
};
export function fxCue(name, ...a) { if (ready && CUE[name] && a[0] && near(a[0].x, a[0].z, 70)) try { CUE[name](...a); } catch (e) { console.warn('特效', name, e); } }
// 蓄力：每幀呼叫（o 角色、k 蓄力程度 0–1）。沒再呼叫就自己收掉
const charges = new Map();
export function fxCharge(o, k = 0.5) { if (!ready) return; let c = charges.get(o); if (!c) charges.set(o, c = { next: 0, pulse: 0, glow: 0, full: false }); c.seen = T; c.k = k; }
function updateCharges() {
  for (const [o, c] of charges) {
    if (T - c.seen > 0.15) { charges.delete(o); continue; } if (!near(o.x, o.z, 50)) continue; const k = c.k, y = Hgt(o.x, o.z), full = k >= 1, cc = full ? C.gold[0] : [lerp(0.8, 1.3, k), lerp(0.62, 1.0, k), lerp(0.4, 0.5, k)];
    if (T >= c.next) { c.next = T + lerp(0.07, 0.028, k) / QN(); gather(o.x, y + 1.15, o.z, 1, cc, 0, lerp(1.2, 1.8, k), full ? 0.15 : 0.1); }
    if (T >= c.pulse) { c.pulse = T + lerp(0.5, 0.28, k); gRing(o.x, o.z, 1.3 + k * 0.8, 0.3, 0.3, [cc, C.gold[1]], { w: 0.2, lin: 1, op: 0.3 + 0.55 * k }); }
    if (T >= c.glow) { c.glow = T + 0.05; sp(o.x, y + 0.25, o.z, 0, 0, 0, 0.11, 1.2 + k * 1.2, 1.0 + k * 1.0, K.glow, [cc[0] * (0.12 + 0.2 * k), cc[1] * (0.12 + 0.2 * k), cc[2] * (0.12 + 0.2 * k)], 1); if (full) sp(o.x + rr(-0.5, 0.5), y + rr(0.3, 1.6), o.z + rr(-0.5, 0.5), 0, rr(1, 2.4), 0, 0.3, 0.2, 0.04, K.star, C.gold[0], 1); }
    if (full && !c.full) { c.full = true; flash(o.x, y + 1.25, o.z, 3.6, C.gold[0], 0.16); gRing(o.x, o.z, 0.4, 2.6, 0.32, C.gold, { w: 0.4 }); ringB(o.x, y + 1.25, o.z, 0.3, 1.6, 0.22, C.gold[0]); sparks(o.x, y + 0.3, o.z, 10, C.gold[0], { sp: 3, up: 7, rad: 0.6, life: 0.4, grav: 4 }); }
  }
}

/* ============================== 飛行物、瞄準線、鎖定標記 ============================== */
// 拖尾：記下頭走過的幾個點，拉成一條面向鏡頭的帶子
const RIB_N = 14, ribs = [];
function ribbon(P, w, step = 0.35) {
  let r = ribs.find(k => !k.live);
  if (!r) { const g = new THREE.BufferGeometry(), uv = [], idx = [], nor = []; for (let i = 0; i < RIB_N; i++) { const u = 1 - i / (RIB_N - 1); uv.push(u, 0, u, 1); nor.push(0, 1, 0, 0, 1, 0); if (i < RIB_N - 1) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); } } const pa = new THREE.BufferAttribute(new Float32Array(RIB_N * 6), 3); pa.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', pa); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, matM()); m.frustumCulled = false; m.isLine = true; m.renderOrder = 5; W.scene.add(m); r = { m, u: m.material.uniforms, pa, pts: new Float32Array(RIB_N * 3) }; ribs.push(r); }
  r.live = true; r.n = 0; r.w = w; r.step = step; r.fade = -1; r.m.visible = true; col(r, P[0], P[1]); r.u.uMode.value = 1; r.u.uTip.value = 0; r.u.uW.value = 1; r.u.uAdd.value = 0.3; r.u.uCut.value = 0; r.u.uOp.value = 1; return r;
}
function ribPush(r, x, y, z) { const p = r.pts; if (r.n === 0) { for (let i = 0; i < RIB_N; i++) { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; } r.n = 1; } const dx = x - p[3], dy = y - p[4], dz = z - p[5]; if (r.n < 2 || dx * dx + dy * dy + dz * dz > r.step * r.step) { p.copyWithin(3, 0, (RIB_N - 1) * 3); r.n = Math.min(RIB_N, r.n + 1); } p[0] = x; p[1] = y; p[2] = z; }
function ribBuild(r) {
  const p = r.pts, A = r.pa.array, c = W.camera.position, last = r.n - 1;
  for (let i = 0; i < RIB_N; i++) { const j = Math.min(i, last) * 3, a = Math.max(0, Math.min(i, last) - 1) * 3, b = Math.min(last, i + 1) * 3; let tx = p[a] - p[b], ty = p[a + 1] - p[b + 1], tz = p[a + 2] - p[b + 2]; const vx = c.x - p[j], vy = c.y - p[j + 1], vz = c.z - p[j + 2]; let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const l = Math.hypot(sx, sy, sz) || 1, w = r.w * 0.5 / l; sx *= w; sy *= w; sz *= w; const o = i * 6; A[o] = p[j] + sx; A[o + 1] = p[j + 1] + sy; A[o + 2] = p[j + 2] + sz; A[o + 3] = p[j] - sx; A[o + 4] = p[j + 1] - sy; A[o + 5] = p[j + 2] - sz; }
  r.pa.needsUpdate = true; r.u.uPan.value = T * 2; r.u.uLen.value = Math.max(0.08, last / (RIB_N - 1));
}
// 飛行物：fire 火球（依顏色再分火球、法杖的魔力彈、魔法飛彈）｜blade 迴旋刃｜arrow 箭。回傳的物件由 game.js 每幀設定位置與方向，結束時呼叫 fxFree
const bolts = [], BK = { fire: C.fire, mana: C.mana, missile: C.arcane, blade: C.cyan, arrow: C.bow };
function boltParts(vk) {
  const g = new THREE.Group(), parts = [], add = (geo, mode, w, addv, P) => { const m = new THREE.Mesh(geo, matM()); m.frustumCulled = false; m.isLine = true; m.renderOrder = 5; const u = m.material.uniforms; u.uMode.value = mode; u.uW.value = w; u.uAdd.value = addv; u.uC1.value.setRGB(...P[0]); u.uC2.value.setRGB(...P[1]); g.add(m); parts.push(m); return m; }, P = BK[vk];
  if (vk === 'arrow') { const b = new THREE.Mesh(geos.arrow, new THREE.MeshBasicMaterial({ vertexColors: true })); b.frustumCulled = false; g.add(b); const st = add(geos.spike, 1, 1, 0.5, P); st.material.uniforms.uTip.value = 0; }
  else if (vk === 'blade') { const b = add(geos.arcS, 0, 0.75, 0.4, P); b.scale.setScalar(0.3); }
  else { add(geos.orb, 5, vk === 'fire' ? 3.0 : 2.0, 0.3, P); if (vk === 'fire') { const sh = add(geos.orb, 2, 1.2, 0.5, [P[0], P[1]]); sh.scale.set(1.45, 1.45, 2.3); sh.position.z = -0.75; } }
  return { m: g, parts, vk };
}
export function fxBolt(kind, rgb, size = 1) {
  const vk = kind === 'arrow' || kind === 'blade' ? kind : rgb[0] > rgb[2] ? 'fire' : rgb[0] > rgb[1] ? 'missile' : 'mana'; let s = bolts.find(k => !k.live && k.vk === vk);
  if (!s) { s = boltParts(vk); W.scene.add(s.m); bolts.push(s); }
  s.live = true; s.was = false; s.size = size; s.bolt = kind; s.kind = vk; s.glow = 0; s.m.visible = true; s.m.rotation.set(0, 0, 0); s.rib = null; s.len = 0;
  if (vk === 'arrow') { s.gs = 1.1 * (1 + (size - 1) * 0.4); s.m.scale.setScalar(s.gs); s.trail = k => { s.len = k; }; s.parts[0].scale.set(0.3, 0.3, 0.02); }
  else s.m.scale.setScalar(vk === 'blade' ? 1 : vk === 'fire' ? 0.42 * size : 0.4 * size);
  return s;
}
export function fxFree(s) {
  if (!s || !s.live) return; s.live = false; s.m.visible = false; if (s.rib) { s.rib.fade = 0; s.rib = null; } if (!s.was) return;
  const p = s.m.position, P = BK[s.kind]; if (!near(p.x, p.z, 60)) return;
  if (s.kind === 'arrow') { flash(p.x, p.y, p.z, 0.9 * s.gs, P[0], 0.09); sparks(p.x, p.y, p.z, 4, P[0], { sp: 4, up: 2, life: 0.22 }); }
  else if (s.kind !== 'fire' || s.size < 0.9) { flash(p.x, p.y, p.z, 1.5 * Math.max(0.8, s.size * 1.4), P[0], 0.11); ringB(p.x, p.y, p.z, 0.15, 0.75, 0.2, P[0]); shards(p.x, p.y, p.z, 4, P[0], { gem: 1, add: 1, sp: 3.5, up: 2.5, grav: 5, s: 0.15, life: 0.4 }); }
}
function updateBolts(dt) {
  for (const s of bolts) {
    if (!s.live) continue; if (!s.m.visible) { s.was = false; continue; } const p = s.m.position, P = BK[s.kind], k = s.kind;
    if (!s.was) { s.was = true; if (s.rib) s.rib.fade = 0; s.rib = k === 'arrow' ? null : ribbon(k === 'fire' ? [P[0], P[1]] : P, k === 'fire' ? 1.0 * s.size : k === 'blade' ? 0.6 : 0.5 * Math.max(0.6, s.size * 1.6), k === 'fire' ? 0.3 : 0.35); if (k === 'missile' || k === 'mana') { flash(p.x, p.y, p.z, 1.1, P[0], 0.09); ringB(p.x, p.y, p.z, 0.1, 0.5, 0.16, P[0]); } }
    if (s.rib) { ribPush(s.rib, p.x, p.y, p.z); ribBuild(s.rib); }
    if (k === 'arrow') { const st = s.parts[0], l = Math.max(0.02, s.len) * 3.6 / s.gs; st.scale.set(0.34 / s.gs, 0.34 / s.gs, l); st.position.z = -0.3 - l; st.material.uniforms.uPan.value = T * 3; }
    else if (k === 'blade') s.parts[0].rotation.y = -T * 24;
    else { const pu = 1 + Math.sin(T * 34) * 0.08; s.parts[0].scale.setScalar(pu); if (k === 'fire') { s.parts[1].material.uniforms.uPan.value = T * 1.6; s.parts[1].rotation.z = T * 5; } }
    if (k !== 'arrow' && T >= s.glow) { s.glow = T + 0.022; const g = k === 'blade' ? 0.9 : 2.6 * s.m.scale.x; sp(p.x, p.y, p.z, 0, 0, 0, 0.09, g, g * 0.6, K.glow, [P[0][0] * 0.4, P[0][1] * 0.4, P[0][2] * 0.4], 1); }
  }
  for (const r of ribs) { if (!r.live || r.fade < 0) continue; r.fade += dt; r.u.uCut.value = r.fade / 0.22 * 1.1; if (r.fade >= 0.22) { r.live = false; r.m.visible = false; } }
}
let aimLine = null, aimDot = null, lockDec = null, lockPin = null, lockV = null, lockT = -9, lockR = 1;
function initFixed() {
  aimLine = new THREE.Mesh(geos.spike, matM()); aimLine.frustumCulled = false; aimLine.isLine = true; aimLine.visible = false; aimLine.renderOrder = 5; { const u = aimLine.material.uniforms; u.uMode.value = 6; u.uAdd.value = 0.7; } W.scene.add(aimLine);
  aimDot = new THREE.Mesh(geos.ringv, matM()); aimDot.frustumCulled = false; aimDot.isLine = true; aimDot.visible = false; aimDot.renderOrder = 5; { const u = aimDot.material.uniforms; u.uMode.value = 4; u.uAdd.value = 0.7; } W.scene.add(aimDot);
  lockDec = new THREE.Mesh(geos.gd, matG()); lockDec.frustumCulled = false; lockDec.isLine = true; lockDec.visible = false; lockDec.renderOrder = 4; { const u = lockDec.material.uniforms; u.uMode.value = 2; u.uTex.value = texLock; u.uAdd.value = 0.6; u.uC1.value.setRGB(1.0, 0.72, 0.16); u.uC2.value.setRGB(0.75, 0.3, 0.03); u.uA.value.set(0.7, 2, 0, 0); } W.scene.add(lockDec);
  lockPin = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, g => { g.fillStyle = '#ffd774'; g.strokeStyle = '#7a3d08'; g.lineWidth = 5; g.beginPath(); g.moveTo(10, 14); g.lineTo(32, 26); g.lineTo(54, 14); g.lineTo(32, 56); g.closePath(); g.stroke(); g.fill(); }), transparent: true, depthWrite: false, toneMapped: false })); lockPin.material.map.flipY = true; lockPin.frustumCulled = false; lockPin.isLine = true; lockPin.visible = false; lockPin.renderOrder = 7; W.scene.add(lockPin);
}
// 弓蓄力時的瞄準線：從射手指向箭會飛去的方向（o：{ x, y, z, f, len, k 蓄力程度 }；沒有就收起來）。往前流動的箭頭虛線，盡頭一個小準星；拉滿變成金白色
export function fxAim(o) {
  if (!aimLine) return; aimLine.visible = aimDot.visible = !!o; if (!o) return; const full = o.k >= 1, u = aimLine.material.uniforms, w = 0.16 + o.k * 0.14, c = full ? [1.0, 0.8, 0.22] : [lerp(0.6, 0.85, o.k), lerp(0.85, 0.95, o.k), lerp(0.45, 0.3, o.k)];
  aimLine.position.set(o.x, o.y, o.z); aimLine.rotation.set(0, o.f, 0); aimLine.scale.set(w, w, o.len); u.uC1.value.setRGB(c[0], c[1], c[2]); u.uC2.value.setRGB(c[0] * 0.6, c[1] * 0.5, c[2] * 0.3); u.uW.value = Math.max(2, o.len / 0.9); u.uPan.value = T * (1.5 + o.k * 2.5); u.uTip.value = full ? 1 : 0; u.uOp.value = 0.35 + 0.65 * o.k;
  const d = aimDot.material.uniforms, r = (0.5 - 0.22 * o.k) * (full ? 1 + Math.sin(T * 14) * 0.08 : 1); aimDot.position.set(o.x + Math.sin(o.f) * o.len, o.y, o.z + Math.cos(o.f) * o.len); aimDot.quaternion.copy(W.camera.quaternion); aimDot.scale.setScalar(r); d.uC1.value.setRGB(c[0], c[1], c[2]); d.uC2.value.setRGB(c[0] * 0.7, c[1] * 0.6, c[2] * 0.4); d.uOp.value = 0.4 + 0.6 * o.k;
}
// 鎖定目標腳下的標記：一圈四段的環加四個朝內的箭頭，慢慢轉；頭上一個往下指的小箭頭。換目標時：一道光從舊目標掃到新目標，標記從大縮到定位
export function fxLock(v, r) {
  if (!lockDec) return; const on = !!v; if (v !== lockV) { if (on) { lockT = T; if (lockV && near(lockV.x, lockV.z, 60)) { const dx = v.x - lockV.x, dz = v.z - lockV.z, d = Math.hypot(dx, dz); if (d > 1) spike(lockV.x, Hgt(lockV.x, lockV.z) + 1.0, lockV.z, Math.atan2(dx, dz), d, 0.5, C.gold, 0.2, { hold: 0.1, tip: 0.6 }); } gRing(v.x, v.z, r * 2.2, r * 1.1, 0.2, C.gold, { w: 0.25, lin: 1 }); } else if (lockV && near(lockV.x, lockV.z, 60)) rune(lockV.x, lockV.z, lockR * 1.25, C.gold, 0.2, null, { tex: texLock, spin: -4, op: 0.7 }); lockV = v; }
  lockDec.visible = lockPin.visible = on; if (!on) return; lockR = r;
  const e = clamp((T - lockT) / 0.22, 0, 1), k = r * 1.18 * (1 + (1 - easeOut(e)) * 1.1 + Math.sin(T * 5) * 0.035), u = lockDec.material.uniforms, top = (MON[v.type] ? MON[v.type].tagH : 1.8) * (v.size || 1);
  lockDec.position.set(v.x, 0, v.z); lockDec.scale.set(k, 1, k); lockDec.rotation.y = T * 1.2 + (1 - easeOut(e)) * 2.2; u.uLift.value = liftAt(v.x, v.z) + 0.03; u.uOp.value = 0.35 + 0.65 * e;
  lockPin.position.set(v.x, Hgt(v.x, v.z) + top + 0.05 + Math.sin(T * 4) * 0.07 + (1 - easeOut(e)) * 0.8, v.z); lockPin.quaternion.copy(W.camera.quaternion); lockPin.scale.setScalar(0.42); lockPin.material.opacity = e;
}

/* ============================== 每幀 ============================== */
export function updateFx(dt) {
  if (!ready) return; T += dt; UT.value = T;
  for (let i = jobs.length - 1; i >= 0; i--) if (T >= jobs[i][0]) { const fn = jobs[i][1]; jobs.splice(i, 1); try { fn(); } catch (e) { console.warn('特效', e); } }
  for (let i = live.length - 1; i >= 0; i--) {
    const s = live[i]; s.t += dt;
    if (s.t >= s.dur) { s.live = false; s.m.visible = false; live.splice(i, 1); continue; }
    if (s.follow) { if (s.kind === 'gd') s.m.position.set(s.follow.x, 0, s.follow.z); else s.m.position.set(s.follow.x, Hgt(s.follow.x, s.follow.z), s.follow.z); }
    s.upd(s.t / s.dur);
  }
  updateBolts(dt); updateCharges();
  if (sDirty) { sDirty = false; const a = sGeo.attributes; a.aP.needsUpdate = a.aV.needsUpdate = a.aA.needsUpdate = a.aB.needsUpdate = a.aC.needsUpdate = a.aD.needsUpdate = true; }
}
// 給測試與效能量測用：目前活著的特效數量
export const fxStats = () => ({ meshes: live.length, pooled: Object.values(pool).reduce((n, p) => n + p.length, 0), bolts: bolts.filter(b => b.live).length, ribbons: ribs.filter(r => r.live).length, jobs: jobs.length, time: T });

/* ============================== 攻擊預警 ============================== */
// 形狀：line 直線｜cone 扇形｜circle 圓｜ring 環。一塊貼著地形的印花（底色、邊線、隨時間由內往外填滿、快到時閃爍），加上沿邊緣立起的一圈矮光幕（從背後的低視角也看得清範圍）
// 印花有深度測試：只畫在地面（草地上墊高到草尖），會被角色擋住，不會畫到角色身上
const TG_U = 36, TG_SEG = TG_U * 2 + 14, TG_TONE = { atk: [[1.0, 0.08, 0.03], [0.78, 0.01, 0.01]], warn: [[1.0, 0.7, 0.08], [0.8, 0.42, 0.02]], ally: [[0.25, 0.8, 1.0], [0.05, 0.35, 0.85]] }, TG_SHAPE = { circle: 0, ring: 1, cone: 2, line: 3 };
function tgWall() {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(TG_SEG * 12), col = new Float32Array(TG_SEG * 16), idx = [];      // 頂點顏色帶透明度：底部不透明、頂端全透明
  for (let i = 0; i < TG_SEG; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); for (let k = 0; k < 4; k++) { col[(o + k) * 4] = col[(o + k) * 4 + 1] = col[(o + k) * 4 + 2] = 1; col[(o + k) * 4 + 3] = k < 2 ? 1 : 0; } }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.frustumCulled = false; m.isLine = true; m.visible = false; m.renderOrder = 4; W.scene.add(m); return m;
}
export function makeTelegraph() { return { dec: null, wall: null, on: false }; }
// d：{ shape, x, z, f, p（0–1 進度）, tone, r, r0, arc, w, len }；x、z 是圓心（line 則是起點），f 是朝向
export function drawTelegraph(tg, d) {
  if (!d || !ready) { if (tg.on) { tg.dec.visible = tg.wall.visible = false; tg.on = false; } return; }
  if (!tg.dec) { tg.dec = new THREE.Mesh(geos.gd, matG()); tg.dec.frustumCulled = false; tg.dec.isLine = true; tg.dec.renderOrder = 2; tg.dec.material.uniforms.uMode.value = 4; W.scene.add(tg.dec); tg.wall = tgWall(); }
  tg.on = true; tg.dec.visible = tg.wall.visible = true;
  const p = clamp(d.p, 0, 1), line = d.shape === 'line', full = d.shape === 'circle' || d.shape === 'ring', r0 = d.shape === 'ring' ? d.r0 : d.shape === 'cone' ? Math.min(0.6, d.r * 0.2) : 0, a0 = full ? -Math.PI : -d.arc, a1 = full ? Math.PI : d.arc;
  const sf = Math.sin(d.f), cf = Math.cos(d.f), warn = d.tone === 'warn', c = TG_TONE[d.tone] || TG_TONE.atk, u = tg.dec.material.uniforms, m = tg.dec, lift = liftAt(d.x, d.z);
  const hx = line ? d.w / 2 : d.r, hz = line ? d.len / 2 : d.r; m.position.set(line ? d.x + sf * d.len / 2 : d.x, 0, line ? d.z + cf * d.len / 2 : d.z); m.scale.set(hx + 0.35, 1, hz + 0.35); u.uSz.value.set(hx + 0.35, hz + 0.35);      // 網格比形狀大一圈，邊線才不會被切掉
  m.rotation.y = d.f; u.uA.value.set(TG_SHAPE[d.shape] || 0, r0, d.arc || 0, warn ? -1 : p); u.uLift.value = lift; u.uAdd.value = 0.05; u.uOp.value = warn ? 0.6 : 0.85 + 0.15 * p; u.uC1.value.setRGB(c[0][0], c[0][1], c[0][2]); u.uC2.value.setRGB(c[1][0], c[1][1], c[1][2]);
  // 邊緣光幕
  const y0 = lift + 0.02, pt = (uu, v, out) => { let x, z; if (line) { const s = (uu - 0.5) * d.w, l = v * d.len; x = d.x + sf * l + cf * s; z = d.z + cf * l - sf * s; } else { const a = d.f + lerp(a0, a1, uu), r = r0 + (d.r - r0) * v; x = d.x + Math.sin(a) * r; z = d.z + Math.cos(a) * r; } out[0] = x; out[1] = Hgt(x, z) + y0; out[2] = z; };
  const wa = tg.wall.geometry.attributes.position, h = warn ? 0.3 : 0.34 + p * 0.22; let s = 0; const a = [0, 0, 0], b = [0, 0, 0];
  const seg = (u0, v0, u1, v1) => { if (s >= TG_SEG) return; pt(u0, v0, a); pt(u1, v1, b); const o = s * 4; wa.setXYZ(o, a[0], a[1], a[2]); wa.setXYZ(o + 1, b[0], b[1], b[2]); wa.setXYZ(o + 2, a[0], a[1] + h, a[2]); wa.setXYZ(o + 3, b[0], b[1] + h, b[2]); s++; };
  if (line) { for (let i = 0; i < 6; i++) { seg(0, i / 6, 0, (i + 1) / 6); seg(1, i / 6, 1, (i + 1) / 6); } seg(0, 1, 0.5, 1); seg(0.5, 1, 1, 1); }
  else { for (let i = 0; i < TG_U; i++) seg(i / TG_U, 1, (i + 1) / TG_U, 1); if (d.shape === 'ring') for (let i = 0; i < TG_U; i++) seg(i / TG_U, 0, (i + 1) / TG_U, 0); if (!full) for (let i = 0; i < 4; i++) { seg(0, i / 4, 0, (i + 1) / 4); seg(1, i / 4, 1, (i + 1) / 4); } }
  for (let i = s; i < TG_SEG; i++) { const o = i * 4; for (let k = 0; k < 4; k++) wa.setXYZ(o + k, 0, -99, 0); }
  wa.needsUpdate = true; const fl = p > 0.8 && !warn ? 1.3 + Math.sin(T * 38) * 0.35 : 1; tg.wall.material.color.setRGB(c[0][0] * 0.55 * fl, c[0][1] * 0.55 * fl, c[0][2] * 0.55 * fl); tg.wall.material.opacity = warn ? 0.4 : 0.55 + p * 0.3;
}
// 舊的呼叫方式：v.tg 是這一刻要畫的預警（由 game.js 依招式算出），沒有就不畫
export function showTelegraph(tg, v, D, on) { drawTelegraph(tg, on && v && v.tg ? v.tg : null); }

/* ============================== 世界座標標籤與數字 ============================== */
const v3 = new THREE.Vector3(); let labels = null; const nums = [];
export function initLabels(el) { labels = el; }
export function project(x, y, z) { v3.set(x, y, z).project(W.camera); return v3.z > -1 && v3.z < 1 ? [(v3.x * .5 + .5) * W.W, (-v3.y * .5 + .5) * W.H] : null; }
export function makeTag(cls) {
  const el = document.createElement('div'); el.className = 'tag ' + cls;
  const name = document.createElement('span'); name.className = 'tag-name'; const bar = document.createElement('span'); bar.className = 'tag-bar'; const fill = document.createElement('i'); bar.appendChild(fill); const say = document.createElement('span'); say.className = 'tag-say';
  el.append(name, bar, say); el.style.display = 'none'; labels.appendChild(el); return { el, name, fill, say, sayT: 0, me: cls === 'me' };
}
export function placeTag(tag, x, y, z, show) { if (tag.me) { meX = x; meZ = z; } const s = show ? project(x, y, z) : null; const st = tag.el.style; if (!s) { if (st.display !== 'none') st.display = 'none'; return; } if (st.display !== '') st.display = ''; const tf = `translate3d(${s[0] | 0}px,${s[1] | 0}px,0) translate(-50%,-100%)`; if (tag.tf !== tf) { tag.tf = tf; st.transform = tf; } }      /* X12：值沒變就不寫 DOM */
export function tagSay(tag, text) { tag.say.textContent = text; tag.say.classList.add('on'); tag.sayT = 6; }
export function popNumber(x, y, z, text, cls) {
  let d = nums.find(k => k.life <= 0); if (!d) { if (nums.length > 48) return; d = { el: document.createElement('div'), life: 0 }; labels.appendChild(d.el); nums.push(d); }
  d.el.className = 'dmg ' + cls; d.el.textContent = text; d.x = x + (Math.random() - .5) * 0.7; d.y = y; d.z = z; d.life = d.dur = cls.includes('exp') ? 1.2 : 0.85; d.el.style.display = '';
}
export function updateNumbers(dt) {
  for (const d of nums) { if (d.life <= 0) continue; d.life -= dt; const p = 1 - d.life / d.dur, s = project(d.x, d.y + p * 1.7, d.z); if (d.life <= 0 || !s) { d.el.style.display = 'none'; d.life = 0; continue; } d.el.style.opacity = String(1 - p * p); d.el.style.transform = `translate3d(${s[0] | 0}px,${s[1] | 0}px,0) translate(-50%,-50%) scale(${1.25 - p * 0.3})`; }
}
