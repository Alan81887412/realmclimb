// 共用工具、世界配置、怪物與道具資料、能力公式
import { WILD07, WILD_TIER07 } from './places07.js';      // 0.7 荒地的野獸（w7-wild）
import { LV08, MON08, LV_BASE08, ITEMS08, EXP_HI08 } from './data08.js';      /* 0.8 X8：數值總表（等級 20、新野獸、新道具） */
import { BEAST08, BEAST_TIER08, spawnsX08 } from './places08.js';      // 0.7a／0.8 新野獸的定點老家（d8-play-p1）
import { SPAWN08 } from './spawns08.js';      /* 0.8 大擴建（X0a）：0–211 號野獸出生點的凍結表 */
import { landN, nw08, edge08, wall08, zone08, LAKES08 } from './land08.js';      /* 0.8 大擴建（X0b）：新地形 */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const dampAng = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const r2 = v => Math.round(v * 100) / 100;
export const r1 = v => Math.round(v * 10) / 10;
export const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
export function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = t => t * t * (3 - 2 * t); const u = s(xf), v = s(yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
export const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1 + 3) * 0.28 + vnoise(x * 4.3 + 1, y * 4.3 + 9) * 0.12;
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ============================== 世界 ============================== */
// 座標：x 向東、z 向南（北方是 -z）。城鎮在原點。
// 0.6：可玩半徑 250 → 350。R0 是 0.5a 的半徑（舊內容的生成、舊邊界留下的山脊都以它為準）。格距維持 1.4 公尺，新格點和舊格點重合（761.6 = 560 + 2×72×1.4）
// FOG：戰爭迷霧每邊格數與涵蓋的邊長（每格和 0.5a 一樣是 560/96 公尺；正中央 FOG0×FOG0 格就是舊存檔那一份）
/* 0.8 大擴建（X0a 地基，推 200）：格網照 0.6 的規則往外推（格距 1.4、舊格點重合；SIZE＝560＋2k×1.4），k＝240 → SIZE 1232、GRID 880（舊的 544 格在正中央、偏移 168）。
   迷霧每格照舊 560/96 公尺，FOG 210（0.6 的 130 格放在偏移 40、0.5a 的 96 格放在偏移 57）。
   R 維持 350＝「0.6 的邊界」（舊程式照用）；RA＝A 圈可走的外緣 545；HALF＝格網半寬（北境的角落最多長到 HALF − 22）。SIZE06、GRID06、FOG06 是 0.6 的值（舊存檔、樹石分格用） */
export const WORLD = { R: 350, R0: 250, RA: 545, HALF: 616, SIZE: 1232, GRID: 880, SIZE06: 761.6, GRID06: 544, FOG: 210, FOG0: 96, FOG06: 130, FOG_SIZE: 210 * 560 / 96, TOWN_R: 42, ARENA_OUT: 17.0, ARENA_IN: 9.6, SPAWN: [0, 24] };
/* 0.8：到「可走範圍的邊界」多遠（正的在裡面、負的在外面）。新程式一律問它，不要再寫 r > R − 9。
   X0a：邊界還是 0.6 那一圈（半徑 R − 9＝341），判斷結果和舊的一模一樣；X0b 開山後改成 A 圓＋北境三塊＋兩個隘口＋古道 */
export function edgeAt(x, z) { return edge08(x, z); }      /* 0.8（X0b）：A 圓＋北境＋隘口＋古道（舊世界半徑 341 以內一律在裡面） */
export const GATES = [0, 90, 180, 270];                // 城門方位（度，0 為北，順時針）
export const CORRIDORS = [
  { pts: [[0, -100], [2, -135], [-8, -168], [0, -196]], w: 9 },                                              // 北方荒徑
  { pts: [[98, 6], [128, -6], [158, -30], [184, -60], [190, -98], [172, -134], [142, -158]], w: 10 },         // 峽谷主道
  { pts: [[158, -30], [192, -14], [214, 14]], w: 9 },                                                         // 支道：影牙的巢
  { pts: [[142, -158], [98, -172], [48, -182], [6, -192]], w: 9 },                                            // 峽谷通往巢穴
  // ↓ 0.6 外環（只能加在後面：前 4 條是 0.5a 的，舊怪物與舊樹石的位置靠它們重現）
  { pts: [[190, -98], [222, -106], [254, -100], [284, -86]], w: 9 },                                          // 東隘口：峽谷主道穿過舊山脊到外谷
  { pts: [[196, -236], [240, -190], [272, -140], [284, -86], [298, -28], [296, 34], [278, 96], [246, 152], [204, 214], [150, 262]], w: 12 },   // 外谷：東邊外環的主幹，南端出到草原
  { pts: [[196, -236], [150, -266], [104, -290]], w: 9 },                                                     // 巢穴東側山徑
  { pts: [[-104, -290], [-150, -266], [-196, -236], [-206, -224]], w: 9 },                                    // 巢穴西側山徑，出到森林
  // ↓ 0.6 場景（四面外環的新地點）
  { pts: [[214, 14], [233, 48], [230, 96], [250, 126]], w: 9 },                                               // 驛站支道：影牙的巢 → 舊驛站 → 外谷（白鹽臺）
  { pts: [[-4, -204], [-32, -221], [-52, -246], [-64, -274], [-84, -290], [-104, -290]], w: 9 },              // 獸欄西翼：大門前廣場 → 沿獸欄高牆 → 馴獸師哨站 → 舊飼育場
  { pts: [[48, -182], [63, -212], [61, -244], [68, -272], [86, -288], [104, -290]], w: 9 },                   // 獸欄東翼：運鐵坡道（沿獸欄高牆往上爬到東翼高地）
  { pts: [[284, -86], [292, -104]], w: 9 }                                                                    // 採石場的入口
];
export const PLAZAS = [[0, -202, 21], [186, -62, 17], [214, 16, 15], /* ↓ 0.6 外環 */ [296, 2, 22], [262, 124, 18], [104, -290, 16], [-104, -290, 16],
  /* ↓ 0.6 場景 */ [296, -110, 24], [270, 148, 21], [230, 97, 15], [-62, -268, 13], [-120, -287, 20], [146, -285, 15], [118, -280, 15]];      // 採石場、白鹽臺、舊驛站、馴獸師哨站、舊飼育場、霜泉、運鐵坡道頂
/* 0.8（X0a）：「0.6 的世界」有幾條通道、幾塊空地、幾條小徑、幾個水域。corrDist、roadDist、lakeDist 的 which 給 '06' 時只算這幾個：
   0.6 外環的樹石照它判斷，大擴建在這些表後面加的隘口、古道、新水域就不會改到舊樹石（亂數消耗順序不變）。數字要和 0.6 時的表長一樣，不要跟著改 */
export const N06 = { corr: 12, plaza: 14, trail: 8, lake: 6 };
export const OLD = { corr: 4, plaza: 3, road: 4, pond: 2 };              // 0.5a 既有的通道、空地、道路、池塘數量
// 小徑（0.6）：草原與森林裡通往新地點的土路。比道路窄（roadDist 算它時多加 TRAIL_NARROW），只影響地面顏色、腳步聲與種樹，不影響舊怪物與舊樹石的位置
export const TRAIL_NARROW = 1.0;
export const TRAILS = [
  [[34, 98], [25, 112], [26, 134], [36, 158], [44, 180], [47, 189.2]],                                        // 南門大路盡頭 → 鏡池西岸 → 木橋西端
  [[63, 190.8], [70, 206], [72, 230], [76, 250]],                                                             // 木橋東端 → 舊牧欄營地
  [[76, 250], [60, 268], [44, 281]],                                                                          // 舊牧欄營地 → 長灣北岸的釣臺
  [[44, 180], [20, 214], [-16, 246], [-58, 268], [-92, 276]],                                                 // 鏡溪西岸 → 蘆葦澤北邊 → 狼丘
  [[-104, -14], [-140, -6], [-180, 6], [-214, 18], [-228, 24]],                                               // 獵人營地 → 採藥人小屋
  [[-228, 24], [-234, 48], [-252, 66], [-278, 50], [-294, 14], [-298, -14]],                                  // 採藥人小屋 → 繞過石脊南端 → 蔘坡
  [[-234, 48], [-236, 84], [-250, 112], [-266, 130]],                                                         // 採藥人小屋 → 古木林
  [[-104, -14], [-128, -52], [-150, -96], [-182, -150], [-204, -180], [-238, -193]]                           // 獵人營地 → 西北缺口 → 苔瀑潭
];
export const ROADS = [[[0, -42], [0, -100]], [[42, 0], [98, 6]], [[-42, 0], [-70, -6], [-104, -14]], [[0, 42], [10, 70], [34, 98]]];
export const PONDS = [[48, 122, 17], [-150, 62, 12]];
export const LAIR_GATE = [0, -224];
function segDist(x, z, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
export function polyDist(x, z, pts) { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) b = Math.min(b, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return b; }
// 每條折線的外框（往外放寬 pad）：離得遠的整條跳過。只影響「離得很遠」時的回傳值（原本也只會被當成很遠），近處的值不變
const bbox = (pts, pad) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0 - pad, x1 + pad, z0 - pad, z1 + pad]; };
const inBox = (b, x, z) => x > b[0] && x < b[1] && z > b[2] && z < b[3];
let corrBB = null, roadBB = null, trailBB = null;
// which：不給＝全部；1＝只算 0.5a 既有的（重現舊內容用）；2＝只算 0.6 新增的
export function corrDist(x, z, which) {      // 負值表示在通道內
  let b = 1e9; const c0 = which === 2 ? OLD.corr : 0, c1 = which === 1 ? OLD.corr : which === '06' ? N06.corr : CORRIDORS.length, p0 = which === 2 ? OLD.plaza : 0, p1 = which === 1 ? OLD.plaza : which === '06' ? N06.plaza : PLAZAS.length;      /* 0.8：'06'＝只算 0.6 的 */
  if (!corrBB) corrBB = CORRIDORS.map(c => bbox(c.pts, c.w + 18));
  let wob = null;
  for (let i = c0; i < c1; i++) { if (!inBox(corrBB[i], x, z)) continue; const c = CORRIDORS[i]; if (wob === null) wob = (vnoise(x * 0.09 + 11, z * 0.09 + 5) - 0.5) * 5; b = Math.min(b, polyDist(x, z, c.pts) - c.w - wob); }
  for (let i = p0; i < p1; i++) { const p = PLAZAS[i]; b = Math.min(b, Math.hypot(x - p[0], z - p[1]) - p[2]); }
  return b;
}
export function roadDist(x, z, which) {
  let b = 1e9; const c1 = which === 1 ? OLD.corr : which === '06' ? N06.corr : CORRIDORS.length;      /* 0.8：'06'＝只算 0.6 的 */
  if (!roadBB) roadBB = [ROADS.map(r => bbox(r, 16)), CORRIDORS.map(c => bbox(c.pts, 16))];
  for (let i = 0; i < ROADS.length; i++) if (inBox(roadBB[0][i], x, z)) b = Math.min(b, polyDist(x, z, ROADS[i]));
  for (let i = 0; i < c1; i++) if (inBox(roadBB[1][i], x, z)) b = Math.min(b, polyDist(x, z, CORRIDORS[i].pts));
  if (which !== 1) { if (!trailBB) trailBB = TRAILS.map(r => bbox(r, 16)); for (let i = 0, n = which === '06' ? N06.trail : TRAILS.length; i < n; i++) if (inBox(trailBB[i], x, z)) b = Math.min(b, polyDist(x, z, TRAILS[i]) + TRAIL_NARROW); }
  return b;
}
// 只算小徑（沒有就是很大的值）
export function trailDist(x, z) { let b = 1e9; if (!trailBB) trailBB = TRAILS.map(r => bbox(r, 16)); for (let i = 0; i < TRAILS.length; i++) if (inBox(trailBB[i], x, z)) b = Math.min(b, polyDist(x, z, TRAILS[i])); return b; }
export function sectors(x, z) {
  const r = Math.hypot(x, z), ang = Math.atan2(x, -z) * 180 / Math.PI, wob = (vnoise(x * 0.02 + 3, z * 0.02 + 7) - 0.5) * 16, a = Math.abs(ang);
  const north = smooth(40, 33, a) * smooth(146 + wob, 160 + wob, r);
  const east = ang > 0 ? smooth(33, 40, a) * smooth(152, 144, a) * smooth(100 + wob, 114 + wob, r) : 0;
  const west = ang < 0 ? smooth(33, 40, a) * smooth(152, 144, a) * smooth(94 + wob, 110 + wob, r) : 0;
  return { r, north, east, west };
}
// 鏡頭固定在南方俯視，所以「北邊不遠處有路」的岩壁要壓低成矮坡，否則會把走在路上的角色整個擋住
export function southBank(x, z) { return smooth(5, -1, Math.min(corrDist(x, z - 8, 1), corrDist(x, z - 16, 1), corrDist(x, z - 25, 1))); }      // 0.6：只看 0.5a 的通道，新通道兩側都是高牆，也不去壓低舊區的岩壁
export function wallness(x, z, which) { const s = sectors(x, z), m = Math.max(s.north, s.east); return m <= 0.001 ? 0 : m * smooth(0, 9, corrDist(x, z, which)); }
// 0.5a 的邊界是半徑 238–256 的一圈山。外推之後：北（巢穴山體）照舊一路高到新邊界；東（峽谷後山）留成一道山脊，只在東隘口斷開；
// 西邊留三段 10–15 公尺高的石脊（ridgeW 回傳 0–1 的形狀，高度在 landHeight 加上去），中間是寬缺口；南邊整個打開。rimMask 回傳「往山的高度靠多少」0–1（含半徑 338 以外的新邊界）
const RIDGES_W = [[-60, 7], [-91, 9], [-125, 7]];      // 西邊石脊：方位（度，西是 -90）、半寬（度）
export function ridgeW(x, z, s) {
  const r = s.r, R0 = WORLD.R0; if (s.west <= 0 || r < R0 - 9 || r > R0 + 26) return 0;
  const ang = Math.atan2(x, -z) * 180 / Math.PI; let seg = 0; for (const q of RIDGES_W) seg = Math.max(seg, smooth(q[1] + 3.4, q[1], Math.abs(ang - q[0]))); if (seg <= 0) return 0;
  const rw = r + (vnoise(x * 0.045 + 70, z * 0.045 + 3) - 0.5) * 9;
  return s.west * seg * smooth(R0 - 9, R0 - 5, r) * smooth(R0 - 8, R0 + 1, rw) * smooth(R0 + 20, R0 + 10, rw);
}
/* 0.8（X0b）：新世界的 rimMask：半徑 342 以內和舊的一模一樣（舊世界可走到 341）；以外「舊邊界那一圈山」到 350 收掉（換成新地），只留北、東兩面的山 */
export function rimMaskX(x, z, s) {
  if (s.r <= 342) return rimMask(x, z, s);
  const r = s.r, R0 = WORLD.R0, ne = s.north + s.east * smooth(R0 + 36, R0 + 16, r), k = smooth(WORLD.R - 12, WORLD.R + 6, 342) * smooth(350, 342, r);
  return Math.max(k, ne > 0.001 ? Math.min(1, ne) * smooth(R0 - 12, R0 + 6, r) * smooth(0, 9, corrDist(x, z, 2)) : 0);
}
export const RIDGE_BLOCK = 0.3;                         // 石脊遮罩超過這個值（約 3–4 公尺高）就不能走
export function rimMask(x, z, s) {
  const r = s.r, R = WORLD.R, R0 = WORLD.R0; let k = smooth(R - 12, R + 6, r);
  if (r > R0 - 12 && k < 1) {
    const ne = s.north + s.east * smooth(R0 + 36, R0 + 16, r);
    if (ne > 0.001) k = Math.max(k, Math.min(1, ne) * smooth(R0 - 12, R0 + 6, r) * smooth(0, 9, corrDist(x, z, 2)));
  }
  return k;
}
// 水：wade 以上算涉水（變慢）；neck 是脖子的高度（乘上角色身高比例），水比它深就改成游泳；mon 是怪物肯下水的深度；bank 岸邊比水面高多少；deep 池底比岸邊低多少
export const WATER = { wade: 0.3, neck: 1.3, mon: 0.75, bank: 0.3, deep: 3.0 };
export const LOWLAND = [-40, 303, 52, 294, 58, -3.0];  // 外環南邊的河灣低地（長灣與蘆葦澤所在）：一條線段的兩端 x、z，半徑，往哪個高度壓平（保留四分之一的原有起伏，實際地面約 -2.4）
export const KNOLL = [-297, -26, 46, 7];               // 外環西邊的緩丘＝蔘坡（中段石脊的背後）：中心 x、z、半徑、高度
// 外環其他的隆起：中心 x、z、半徑、高度、頂部平坦的比例（0＝圓丘，越大頂越平）。狼丘；獸欄東翼高地（運鐵坡道爬上去的那一階）；白鹽臺（比谷底高一階的臺地）
export const HILLS = [[-104, 281, 30, 4.6, 0.12], [116, -286, 64, 9, 0.12], [271, 149, 27, 1.7, 0.72]];
// 獸欄本體：中心 x、z、圍牆半徑、牆腳岩臺的高度。這批是封閉的（solidAt 整個擋住）。岩臺只壓在山體上，不動旁邊的通道
export const PEN = [0, -284, 46, 7.5];
export const QUARRY = [296, -110, 50, 3.4];            // 採石場：中心 x、z、影響半徑、每一階的高度（周圍的岩壁切成一階一階的採石面）
export function solidAt(x, z) { return Math.hypot(x - PEN[0], z - PEN[1]) < PEN[2] + 7; }
/* 0.8（X0a）：0.6 格網（±380.8）以外的新地。先放佔位：照 0.6 邊界山的公式一路延伸（和舊格網邊上接得起來，不用算通道、水域），舊格網裡的地形一個位元都不變。
   真正的新地形是 X0b（計畫 T2-5：加在 landHeight 最後面、r > 335 才生效；到時候這個佔位要拿掉或只留在最外圈） */
const H06 = 380.8 + 0.7;      /* 0.6 格網的半寬＋半格：舊格點都在裡面，新格點（382.2 起）都在外面 */
export const outside06 = (x, z) => x > H06 || x < -H06 || z > H06 || z < -H06;
function landHeight(x, z, old) {      // old：算 0.5a 的地形（只給 buildSpawns 重現舊位置用）
  if (!old && outside06(x, z)) return landN(x, z);      /* 0.8（X0b）：0.6 格網以外全是新地（land08.js） */
  const s = sectors(x, z), r = s.r, m = Math.max(s.north, s.east);
  let h = (fbm(x * 0.022 + 5, z * 0.022 + 9) - 0.5) * 5.2 * smooth(46, 74, r);
  h += s.west * (fbm(x * 0.05 + 2, z * 0.05 + 8) - 0.5) * 3.2;
  if (m > 0.001) {
    const wall = smooth(0, 9, corrDist(x, z, old ? 1 : 0)); h = lerp(h, h * 0.35 - 1.4, m * (1 - wall));
    if (wall > 0) { const tall = 15 + fbm(x * 0.03 + 50, z * 0.03) * 10 + vnoise(x * 0.21, z * 0.21) * 1.8, low = 2.4 + fbm(x * 0.06 + 50, z * 0.06) * 2.6 + vnoise(x * 0.21, z * 0.21) * 1.1; h = lerp(h, lerp(tall, low, southBank(x, z)), m * wall); }
  }
  if (old) { const e0 = smooth(WORLD.R0 - 12, WORLD.R0 + 6, r); return e0 > 0 ? lerp(h, lerp(25 + fbm(x * 0.03 + 9, z * 0.03 + 30) * 12, 4.5 + fbm(x * 0.05 + 9, z * 0.05 + 30) * 4, smooth(0.15, 0.6, z / (r || 1))), e0) : h; }
  if (r > WORLD.R0 - 10) {      // 外環的起伏（半徑 240 以內不動）：南邊一塊低平地（之後放河灣）、西邊一座緩丘、三段石脊
    const o = smooth(WORLD.R0 - 10, WORLD.R0 + 6, r), dS = segDist(x, z, LOWLAND[0], LOWLAND[1], LOWLAND[2], LOWLAND[3]), dW = Math.hypot(x - KNOLL[0], z - KNOLL[1]);
    if (dS < LOWLAND[4]) h = lerp(h, LOWLAND[5] + (h - LOWLAND[5]) * 0.25, o * smooth(LOWLAND[4], LOWLAND[4] * 0.45, dS));
    if (dW < KNOLL[2]) h += KNOLL[3] * o * smooth(KNOLL[2], KNOLL[2] * 0.1, dW);
    for (const q of HILLS) { const d = Math.hypot(x - q[0], z - q[1]); if (d < q[2]) h += q[3] * o * smooth(q[2], q[2] * q[4], d); }
    { const d = Math.hypot(x - QUARRY[0], z - QUARRY[1]); if (d < QUARRY[2] && m > 0.001) { const cd = corrDist(x, z); if (cd > 0.5) { const st = QUARRY[3], f = h / st, q = (Math.floor(f) + smooth(0.78, 1, f - Math.floor(f))) * st; h = lerp(h, q, smooth(QUARRY[2], QUARRY[2] * 0.7, d) * smooth(0.5, 3, cd)); } } }
    if (s.west > 0) { const rw = ridgeW(x, z, s); if (rw > 0) h += rw * (9.5 + 5.5 * vnoise(x * 0.07 + 12, z * 0.07 + 40)); }
  }
  const edge = rimMaskX(x, z, s); if (edge > 0) h = lerp(h, lerp(25 + fbm(x * 0.03 + 9, z * 0.03 + 30) * 12, 4.5 + fbm(x * 0.05 + 9, z * 0.05 + 30) * 4, smooth(0.15, 0.6, z / (r || 1))), edge);
  { const d = Math.hypot(x - PEN[0], z - PEN[1]);      // 獸欄本體：圍牆內是平的場地，牆腳一圈岩臺，往外接回山體（只壓山，不壓通道的地面）
    if (d < PEN[2] + 16) { const k = smooth(PEN[2] + 14, PEN[2] + 6, d) * smooth(0, 5, corrDist(x, z)); h = lerp(h, lerp(-1.2, PEN[3], smooth(PEN[2] - 9, PEN[2] - 4, d)), k); } }
  if (r > 330.5) { const w = nw08(x, z); if (w > 0) h = lerp(h, landN(x, z), w); }      /* 0.8（X0b）：舊邊界山換成新地（半徑 330.5 以內 w 一律 0） */
  return h;
}
// 池塘：周圍的地先整平到同一個岸邊高度（取池邊一圈偏低的高度，四周的地自然往池塘斜下來），再往下挖成碗狀。水面是一個平面，所以岸一定要平，不然一邊淹過頭、一邊懸在半空
let pondRimY = null;
const pondRim = () => pondRimY || (pondRimY = PONDS.map(p => { const a = []; for (let i = 0; i < 16; i++) a.push(landHeight(p[0] + Math.cos(i / 16 * TAU) * (p[2] + 3), p[1] + Math.sin(i / 16 * TAU) * (p[2] + 3))); a.sort((u, v) => u - v); return (a[3] + a[4]) / 2; }));
export const pondLevel = i => pondRim()[i] - WATER.bank;          // 水面高度
export function height(x, z, old) {
  let h = landHeight(x, z, old), inPond = false;
  for (let i = 0; i < PONDS.length; i++) {
    const p = PONDS[i], d0 = Math.hypot(x - p[0], z - p[1]); if (d0 > p[2] + 13) continue;
    const d = d0 + (vnoise(x * 0.13 + 31, z * 0.13 + 17) - 0.5) * 2.2;          // 岸線帶一點不規則
    h = lerp(h, pondRim()[i], smooth(p[2] + 13, p[2] + 4.5, d0)) - WATER.deep * smooth(p[2] + 2, p[2] - 8, d);
    if (d0 < p[2] + 4.5) inPond = true;
  }
  if (!old && lakeField(x, z)) { const hn = lerp(h, LK.L + WATER.bank, LK.k) - LK.c; h = inPond ? Math.min(h, hn) : hn; }      // 0.6 新水域：岸拉平到水面＋bank，再往下挖；和舊池塘相接的地方（鏡溪的源頭）只往下挖、不把池底墊高
  return h;
}
/* ---------- 0.6 新水域：鏡溪、長灣、蘆葦澤、苔瀑潭、採石坑湖、霜泉 ----------
   每個水域是一條折線，pts 的每個點是 [x, z, 半寬, 水面高]；只有一個點就是圓池。水面高可以寫數字、'p0'（接鏡池的水面）、null（圓池：照周圍地勢自動取；河道：沿線在前後兩個有值的點之間內插）。
   所以鏡溪的水面是沿著河道一路緩緩下降的斜面（全長降 1.6 公尺，約 1%），不是一階一階的；waterLevel() 回傳的就是所在位置的水面高，涉水、游泳、怪物不下深水都照舊用它。
   deep 池底比岸低多少（水深＝deep − bank）；sl 從岸邊到最深處的水平距離上限；out 岸往外多遠接回原地形；rough 岸線的小凹凸；wob 岸線的大彎曲（公尺，最多 2.6）；islets 池底的起伏（蘆葦澤：一塊塊露出水面的草墩） */
export const LAKE_LV = { bay: -2.6 };
export const LAKES = [
  { id: 'brook', name: '鏡溪', pts: [[48, 131, 3.4, 'p0'], [50.5, 147, 3.6, 'p0'], [57, 168, 3.8, null], [55, 190, 3.8, null], [45, 214, 4, null], [36, 238, 4.2, null], [31, 262, 4.6, 'bay'], [30, 279, 5.4, 'bay'], [28, 292, 8.5, 'bay']], deep: 1.4, sl: 9, out: 14, rough: 0.5 },
  { id: 'bay', name: '長灣', pts: [[-6, 302, 11, 'bay'], [16, 305, 16.5, 'bay'], [40, 300, 15.5, 'bay'], [62, 290, 12.5, 'bay'], [80, 283, 8, 'bay']], deep: 3.0, sl: 10, out: 16, rough: 1, wob: 2.6 },
  { id: 'marsh', name: '蘆葦澤', pts: [[-18, 306, 9, 'bay'], [-36, 311, 13.5, 'bay'], [-52, 304, 13, 'bay'], [-67, 295, 8, 'bay']], deep: 0.8, sl: 5, out: 16, rough: 1, wob: 2.2, islets: 1 },
  { id: 'falls', name: '苔瀑潭', pts: [[-255, -199, 11, null]], deep: 3.0, sl: 10, out: 13, rough: 1, wob: 1.2 },
  { id: 'pit', name: '採石坑湖', pts: [[305, -103, 8, null]], deep: 3.4, sl: 7, out: 9, rough: 0.5 },
  { id: 'spring', name: '霜泉', pts: [[147, -287, 6.5, null]], deep: 1.9, sl: 6, out: 9, rough: 0.6 },
  ...LAKES08      /* 0.8（X0b）：新地的水域（land08.js；只能加在後面） */
];
export const FORDS = [[53, 157, 6], [38.5, 231, 6]];      // 鏡溪的淺灘：這裡水深不到半公尺，野獸也過得去
export const LAKE_PAD = 4;                                 // 水面比水域的名義邊界多畫出去多少（和池塘一樣）
let lakeD = null; const LK = { sd: 0, L: 0, k: 0, c: 0, i: -1, w: 0 };
function lakeData() {
  if (lakeD) return lakeD;
  const inv = y => { let lo = 0, hi = 1; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (m * m * (3 - 2 * m) < y) lo = m; else hi = m; } return (lo + hi) / 2; };
  const named = v => v === 'p0' ? pondLevel(0) : typeof v === 'string' ? LAKE_LV[v] : v;
  return lakeD = LAKES.map(b => {
    const P = b.pts.map(p => [p[0], p[1], p[2], named(p[3])]), n = P.length;
    if (n === 1 && P[0][3] == null) { const a = []; for (let i = 0; i < 16; i++) a.push(landHeight(P[0][0] + Math.cos(i / 16 * TAU) * (P[0][2] + 3), P[0][1] + Math.sin(i / 16 * TAU) * (P[0][2] + 3))); a.sort((u, v) => u - v); P[0][3] = (a[3] + a[4]) / 2 - WATER.bank; }
    if (n > 1) { const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));      // 沒寫水面高的點：沿線內插
      for (let i = 0; i < n; i++) if (P[i][3] == null) { let a = i, c = i; while (P[a][3] == null) a--; while (P[c][3] == null) c++; P[i][3] = lerp(P[a][3], P[c][3], (cum[i] - cum[a]) / (cum[c] - cum[a])); } }
    const t0 = inv(WATER.bank / b.deep), wmax = Math.max(...P.map(p => p[2])), a0 = t0 * Math.min(wmax / (1 - t0), b.sl), bin = Math.max(2.2, a0 + 1.1 * (b.rough || 0) + (b.wob || 0) + 0.3), pad = Math.max(b.out, LAKE_PAD) + 0.5;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of P) { x0 = Math.min(x0, p[0] - p[2] - pad); x1 = Math.max(x1, p[0] + p[2] + pad); z0 = Math.min(z0, p[1] - p[2] - pad); z1 = Math.max(z1, p[1] + p[2] + pad); }
    return { id: b.id, P, t0, bin, out: b.out, deep: b.deep, sl: b.sl, rough: b.rough || 0, wob: b.wob || 0, islets: b.islets || 0, x0, x1, z0, z1 };
  });
}
// 第 bi 個水域在 (x,z) 的「離岸距離」（負的在水域裡）；順便把最近那一點的水面高與半寬放進 LK.L、LK.w
function lakeSd(b, x, z) {
  const P = b.P; let sd = 1e9;
  if (P.length === 1) { sd = Math.hypot(x - P[0][0], z - P[0][1]) - P[0][2]; LK.L = P[0][3]; LK.w = P[0][2]; return sd; }
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], q = P[i + 1], dx = q[0] - a[0], dz = q[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1), w = a[2] + (q[2] - a[2]) * t, d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - w; if (d < sd) { sd = d; LK.L = a[3] + (q[3] - a[3]) * t; LK.w = w; } }
  return sd;
}
// 新水域對地形的影響：LK.k 岸拉平的比例、LK.c 往下挖多少、LK.L 水面高、LK.sd 離岸距離、LK.i 哪一個水域。附近沒有水域回傳 false
function lakeField(x, z) {
  const D = lakeData(); let best = 1e9, L = 0, bi = -1, k = 0, c = 0;
  for (let i = 0; i < D.length; i++) {
    const b = D[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    const sd = lakeSd(b, x, z); if (sd > b.out) continue;
    if (sd < best) { best = sd; L = LK.L; bi = i; }
    k = Math.max(k, smooth(b.out, b.bin, sd));
    const sdn = sd + (b.rough ? (vnoise(x * 0.13 + 31, z * 0.13 + 17) - 0.5) * 2.2 * b.rough : 0) + (b.wob ? (vnoise(x * 0.043 + 9, z * 0.043 + 3) - 0.5) * 2 * b.wob : 0), sl = Math.min(LK.w / (1 - b.t0), b.sl), a0 = b.t0 * sl;
    let cc = b.deep * smooth(a0, a0 - sl, sdn);
    if (b.islets && cc > 0) cc = lerp(Math.min(cc, WATER.bank + (b.islets === 1 ? 0.5 : b.islets)), Math.min(cc, 0.1), smooth(0.47, 0.36, vnoise(x * 0.17 + 5, z * 0.17 + 60)));       // 草墩：有的地方露出水面，最深不超過半公尺
    if (i === 0 && cc > WATER.bank + 0.42) for (const f of FORDS) { const fd = Math.hypot(x - f[0], z - f[1]); if (fd < f[2]) cc = lerp(cc, WATER.bank + 0.42, smooth(f[2], f[2] * 0.45, fd)); }      // 淺灘
    c = Math.max(c, cc);
  }
  if (bi < 0) return false; LK.sd = best; LK.L = L; LK.i = bi; LK.k = k; LK.c = c; return true;
}
// 新水域的資料（給水面網格、地點資料用）：每個水域折線上各點 [x, z, 半寬, 水面高] 與外框
export const lakeInfo = () => lakeData().map(b => ({ id: b.id, P: b.P, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }));
// 第 i 個新水域在 (x,z) 的 [離岸距離, 水面高]（不管離多遠都回傳，水面網格用）
export function lakeProbe(i, x, z) { const sd = lakeSd(lakeData()[i], x, z); return [sd, LK.L]; }
// 離最近的新水域岸邊多遠（負的在水域裡；附近沒有回傳很大的值）；which 指定只看哪一個
export function lakeDist(x, z, which) { const D = lakeData(); let best = 1e9; for (let i = 0; i < D.length; i++) { if (which === '06' ? i >= N06.lake : which != null && which !== i && which !== D[i].id) continue; /* 0.8：'06'＝只看 0.6 的六個水域 */ const b = D[i]; if (x < b.x0 - 30 || x > b.x1 + 30 || z < b.z0 - 30 || z > b.z1 + 30) continue; best = Math.min(best, lakeSd(b, x, z)); } return best; }
const oldWaterLevel = (x, z) => { for (let i = 0; i < OLD.pond; i++) { const p = PONDS[i], dx = x - p[0], dz = z - p[1], R = p[2] + 4; if (dx < R && dx > -R && dz < R && dz > -R && dx * dx + dz * dz < R * R) return pondLevel(i); } return -1e9; };
// 這個位置的水面高度（不在水域範圍內回傳 -1e9）。池塘是平的；鏡溪沿河道緩緩下降
export function waterLevel(x, z) {
  for (let i = 0; i < PONDS.length; i++) { const p = PONDS[i], dx = x - p[0], dz = z - p[1], R = p[2] + 4; if (dx < R && dx > -R && dz < R && dz > -R && dx * dx + dz * dz < R * R) return pondLevel(i); }
  const D = lakeData(); let best = LAKE_PAD, L = -1e9;
  for (let i = 0; i < D.length; i++) { const b = D[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; const sd = lakeSd(b, x, z); if (sd < best) { best = sd; L = LK.L; } }
  return L;
}
export function terrainBlocked(x, z, old) {      // old：照 0.5a 的世界判斷（重現舊怪物位置用）
  if (old ? Math.hypot(x, z) > WORLD.R0 - 9 : edgeAt(x, z) < 0) return true;      /* 0.8：新世界的邊界問 edgeAt（X0a 和原本的 r > R − 9 完全相同） */
  if (!old && Math.hypot(x, z) > 330.5 && nw08(x, z) >= 0.5) { if (wall08(x, z) > 0.4) return true; }      /* 0.8（X0b）：新地的崖、石脊、石柱 */
  else if (wallness(x, z, old ? 1 : 0) > 0.4) return true;
  if (!old) { const s = sectors(x, z); if (s.west > 0 && ridgeW(x, z, s) > RIDGE_BLOCK) return true; if (solidAt(x, z)) return true; }
  for (const p of PONDS) if (Math.hypot(x - p[0], z - p[1]) < p[2] - 0.8) return true;
  if (!old && lakeDist(x, z) < -0.8) return true;
  return false;
}
// 木橋（world.js 把橋面當成可以走的地面，Hgt 在橋面範圍內回傳橋面高度；水照樣從橋下流過）：中心 x、z、橋身方向（弧度，0＝沿 x 軸）、長、寬、橋拱比兩端高多少
// flat：一頭搭在岸上、一頭伸到水面上的平臺（釣臺），整片和岸上那一頭等高，盡頭也有欄杆
export const BRIDGES = [{ id: 'brook', name: '鏡溪木橋', x: 55, z: 190, rot: -0.1, len: 16.4, w: 4.4, arch: 0.75 }, { id: 'jetty', name: '長灣釣臺', x: 45, z: 285.3, rot: Math.PI / 2, len: 10.6, w: 3.6, arch: 0, flat: true }];
export const ZONES = {
  town: { name: '鐵環城', sub: '安全區　生命緩步恢復', lv: '', safe: true },
  meadow: { name: '風吹草原', sub: '建議等級 1–3', lv: '1–3' },
  forest: { name: '低語森林', sub: '建議等級 3–6', lv: '3–6' },
  canyon: { name: '斷牙峽谷', sub: '建議等級 6–9', lv: '6–9' },
  lair: { name: '獸王巢穴', sub: '建議等級 10–13', lv: '10–13' },
  // ↓ 0.6 外環的四個子區域（半徑 250 以外）。base 是它所屬的舊區域：音樂、環境音、腳步、種樹規則都照 base
  bend: { name: '河灣草場', sub: '建議等級 3–5', lv: '3–5', base: 'meadow' },
  oldwood: { name: '古木林', sub: '建議等級 5–8', lv: '5–8', base: 'forest' },
  quarry: { name: '採石場與鹽臺', sub: '建議等級 9–10', lv: '9–10', base: 'canyon' },
  wings: { name: '獸欄兩翼', sub: '建議等級 12–13', lv: '12–13', base: 'lair' },
  /* ↓ 0.8 大擴建：A 圈九區（半徑 345–545）、北境三塊、關前古道。base 是所屬的舊區域（音樂、環境音、腳步、種樹照 base）；mix 是混合生態區交界的兩種；ring：A＝A 圈、N＝北境 */
  southlake: { name: '南湖濕原', sub: '建議等級 3–5', lv: '3–5', base: 'meadow', ring: 'A' },
  edgewood: { name: '林緣獵場', sub: '建議等級 5–7', lv: '5–7', base: 'meadow', mix: ['meadow', 'forest'], ring: 'A' },
  giantwood: { name: '巨木林', sub: '建議等級 7–9', lv: '7–9', base: 'forest', ring: 'A' },
  marshwood: { name: '沼林', sub: '建議等級 9–11', lv: '9–11', base: 'forest', mix: ['forest', 'lair'], ring: 'A' },
  floodpen: { name: '淹水獸場', sub: '建議等級 12–14', lv: '12–14', base: 'lair', ring: 'A' },
  backhill: { name: '獸欄後山', sub: '建議等級 13–15', lv: '13–15', base: 'lair', ring: 'A' },
  orecliff: { name: '礦脈斷崖', sub: '建議等級 12–14', lv: '12–14', base: 'lair', mix: ['lair', 'canyon'], ring: 'A' },
  saltflat: { name: '鹽原', sub: '建議等級 10–12', lv: '10–12', base: 'canyon', ring: 'A' },
  redslope: { name: '紅土荒坡', sub: '建議等級 6–8', lv: '6–8', base: 'canyon', mix: ['canyon', 'meadow'], ring: 'A' },
  frostwood: { name: '北境・霜林', sub: '建議等級 16–18', lv: '16–18', base: 'forest', ring: 'N' },
  northrim: { name: '北境・北緣稜線', sub: '建議等級 16–17', lv: '16–17', base: 'lair', ring: 'N' },
  gatehigh: { name: '北境・關前高地', sub: '建議等級 18–20', lv: '18–20', base: 'lair', ring: 'N' },
  oldroad: { name: '關前古道', sub: '建議等級 20', lv: '20', base: 'lair', ring: 'N' }
};
const SUBZONE = { meadow: 'bend', forest: 'oldwood', canyon: 'quarry', lair: 'wings' };
export const baseZone = z => (ZONES[z] && ZONES[z].base) || z;
// sub：false 時只回傳五個舊區域（不分外環）
export function zoneAt(x, z, sub) {
  const r = Math.hypot(x, z); if (r < WORLD.TOWN_R) return 'town';
  if (sub !== false && r > 345) return zoneA(x, z);      /* 0.8（X0b）：A 圈從 345 起（舊世界可走到 341，0.6 外環的判斷到 344，都不受影響） */      /* 0.8：0.6 邊界（350）以外回傳新區（舊世界走不到，舊程式不受影響）；X0b 開山後照新地的實際範圍改這個門檻 */
  const s = sectors(x, z), b = s.north > 0.5 ? 'lair' : s.east > 0.5 ? 'canyon' : s.west > 0.5 ? 'forest' : 'meadow';
  return sub !== false && r > WORLD.R0 ? SUBZONE[b] : b;
}
/* 0.8：新地的區域（照計畫 T1 的方位，az＝atan2(x, −z)，0＝北、順時針）。A 圈九區照方位；A 外緣再 10 公尺以外、北邊 ±72 度是北境三塊。
   關前古道（oldroad）照古道的折線判斷，X0b 做出古道時加在最前面 */
const ZONE_A08 = [[-160, 'southlake'], [-120, 'edgewood'], [-70, 'giantwood'], [-38, 'marshwood'], [-12, 'floodpen'], [28, 'backhill'], [62, 'orecliff'], [118, 'saltflat'], [160, 'redslope'], [181, 'southlake']];
export function zoneA(x, z) {
  return zone08(x, z);      /* 0.8（X0b）：照 land08（多了關前古道）；下面是 X0a 的舊寫法，留著不用 */
  const a = Math.atan2(x, -z) * 180 / Math.PI;
  if (Math.hypot(x, z) > WORLD.RA + 10 && a > -72 && a < 72) return a < -18 ? 'frostwood' : a < 18 ? 'northrim' : 'gatehigh';
  for (const q of ZONE_A08) if (a < q[0]) return q[1];
  return 'southlake';
}
// 遊戲時間：全球統一，現實 24 分鐘為一天
export const gameHour = () => ((Date.now() / 60000) + 16.4) % 24;

/* ============================== 怪物 ============================== */
// 習性 temper：timid 膽小（被靠近或被打就逃）｜neutral 中立（被打才反擊）｜territorial 護地盤（先威嚇，不走才打）｜pack 成群主動（一隻開打整群上，輪流出手）｜ambush 伏擊（遠遠壓低身子接近，一撲之後打帶跑）
// atk／wind／dashT／recover 是主要招式的值（怪物模型的相容用途）；moves 是這種怪會用的招式；orbit 等待出手時與目標保持的距離；terr 領域半徑；warn 威嚇秒數
export const MON = {
  boar: { name: '野豬', temper: 'neutral', hp: 160, dmg: 13, exp: 8, speed: 5.4, aggro: 11, orbit: 5.2, pace: 0.75, atk: 'charge', wind: 0.78, dash: 11, dashT: 0.6, recover: 1.05, hitR: 1.5, size: 1.1, body: 0.85, tagH: 2.15, gold: [2, 5], drops: [['meat', 0.6], ['tusk', 0.28]], moves: ['boar_charge', 'boar_spin', 'boar_kick'], orbs: ['cleave', 'wall'] },
  wolf: { name: '灰狼', temper: 'pack', hp: 95, dmg: 14, exp: 15, speed: 6.6, aggro: 14, orbit: 4.6, atk: 'lunge', wind: 0.6, dash: 7.4, dashT: 0.34, recover: 0.75, hitR: 1.5, size: 1.15, body: 0.8, tagH: 2.1, gold: [3, 7], drops: [['pelt_wolf', 0.5], ['meat', 0.3]], moves: ['wolf_bite', 'wolf_snap', 'wolf_leap'], orbs: ['dash', 'blade'] },
  bear: { name: '棕熊', temper: 'territorial', hp: 320, dmg: 25, exp: 30, speed: 4.6, aggro: 12, orbit: 2.6, pace: 1.8, terr: 13, warn: 3.4, atk: 'swipe', wind: 0.95, dash: 0, dashT: 0.22, recover: 0.95, hitR: 3.6, size: 1.6, body: 1.25, tagH: 2.0, gold: [8, 16], drops: [['pelt_bear', 0.5], ['meat', 0.7], ['gall', 0.16]], moves: ['bear_slam', 'bear_swipe', 'bear_charge'], orbs: ['wall', 'heal'] },
  tiger: { name: '猛虎', temper: 'ambush', hp: 340, dmg: 38, exp: 46, speed: 7.7, aggro: 18, orbit: 7.5, pace: 1.3, atk: 'pounce', wind: 0.62, dash: 10, dashT: 0.45, recover: 0.6, hitR: 1.7, size: 1.3, body: 0.95, tagH: 2.2, gold: [10, 20], drops: [['pelt_tiger', 0.45], ['fang', 0.26]], moves: ['tiger_pounce', 'tiger_swipe', 'tiger_lunge'], orbs: ['blade', 'fire'] },
  deer: { name: '野鹿', temper: 'timid', hp: 80, dmg: 9, exp: 5, speed: 9.4, aggro: 10, orbit: 6, atk: 'lunge', wind: 0.36, dash: 0, dashT: 0.2, recover: 0.45, hitR: 1.4, size: 1.2, body: 0.75, tagH: 3.1, gold: [1, 3], drops: [['meat', 0.8], ['pelt_deer', 0.45], ['antler', 0.14]], moves: ['deer_kick', 'deer_charge'], orbs: ['heal', 'dash'] }
};
/* 0.8 X3a／X3b／X8：新野獸（雜耍猴、箭豬、鱷魚、猩猩、岩羊）的數字只有一份：data08.js 的 MON08（beastai08a 的 MON08A、beastai08b 的 MON08B 指向同一批物件） */
Object.assign(MON, MON08);
export const TEMPER = { timid: '膽小', neutral: '溫和', territorial: '護地盤', pack: '成群獵食', ambush: '伏擊' };
// 招式。shape 決定預警形狀與判定：line 直線（出招時沿路撞到就算）｜cone 扇形｜circle 圓形（off：圓心在前方多遠）｜ring 環形（r0 內側安全）｜leap 躍向落點（距離於出招時決定，落地時圓形判定）
// wind 預備、strike 出招、recover 收招（秒）；dash 出招時前進的距離；at 出招後幾秒命中（預警在這一刻填滿）；min／max 發動距離；dir 相對面向的角度（後蹬是 π）
// heavy 重擊（格擋會破防）；armor 預備中不會被打斷；behind 目標在身後才用；cd 這一招自己的冷卻；chain 連段（依序出招，中間收招很短）；low 血量低於此比例才會用
// wrec 撲空時收招多幾秒（沒寫＝game.js 的 WHIFF.rec 0.3 秒）。猛虎身手靈活：飛撲、低撲撲空只多愣 0.1 秒（0.6 第二段：撲空踉蹌讓猛虎太好打，補回一點）
const mv = (name, anim, shape, o) => Object.assign({ name, anim, shape, wind: 0.6, strike: 0.3, recover: 0.7, dash: 0, at: 0, dmg: 1, min: 0, max: 3, w: 1.8, r: 3, r0: 0, arc: 1, off: 0, dir: 0, track: 0.6, cd: 0, low: 1 }, o);
export const MOVES = {
  boar_charge: mv('衝撞', 'charge', 'line', { wind: 0.78, strike: 0.6, recover: 1.05, dash: 11, w: 1.9, min: 3.4, max: 10.5, heavy: 1 }),
  boar_spin: mv('甩牙旋身', 'spin', 'circle', { wind: 0.5, strike: 0.3, recover: 0.6, r: 3.0, at: 0.14, dmg: 0.8, max: 3.0 }),
  boar_kick: mv('後蹬', 'kick', 'cone', { wind: 0.4, strike: 0.2, recover: 0.5, r: 3.1, arc: 0.8, dir: Math.PI, at: 0.08, dmg: 0.75, max: 3.2, behind: 1, track: 0 }),
  wolf_bite: mv('撲咬', 'bite', 'line', { wind: 0.6, strike: 0.34, recover: 0.75, dash: 7.4, w: 1.6, min: 2.4, max: 6.2 }),
  wolf_snap: mv('啃咬', 'bite', 'cone', { wind: 0.42, strike: 0.18, recover: 0.55, dash: 0.6, r: 2.8, arc: 0.8, at: 0.06, dmg: 0.7, max: 2.6 }),
  wolf_leap: mv('飛撲', 'pounce', 'leap', { wind: 0.8, strike: 0.5, recover: 0.9, r: 2.3, min: 6, max: 10, dmg: 1.25, at: 0.5, cd: 4 }),
  bear_slam: mv('人立拍地', 'slam', 'circle', { wind: 0.95, strike: 0.22, recover: 0.95, r: 3.6, off: 2.7, at: 0.2, max: 4.6, heavy: 1, armor: 1 }),
  bear_swipe: mv('橫掃', 'swipe', 'cone', { wind: 0.68, strike: 0.26, recover: 0.7, r: 4.7, arc: 1.25, at: 0.12, dmg: 0.8, max: 4.2, armor: 1 }),
  bear_charge: mv('衝撞', 'charge', 'line', { wind: 0.9, strike: 0.7, recover: 1.2, dash: 12, w: 2.8, min: 6.5, max: 13, dmg: 1.1, heavy: 1, armor: 1, cd: 5 }),
  tiger_pounce: mv('飛撲', 'pounce', 'leap', { wind: 0.62, strike: 0.45, recover: 0.6, r: 2.7, min: 5, max: 11.5, at: 0.45, heavy: 1, cd: 2.5, wrec: 0.1 }),
  tiger_swipe: mv('爪擊', 'swipe', 'cone', { wind: 0.42, strike: 0.2, recover: 0.45, r: 3.5, arc: 1.05, at: 0.1, dmg: 0.7, max: 3.3 }),
  tiger_lunge: mv('低撲', 'pounce', 'line', { wind: 0.5, strike: 0.3, recover: 0.55, dash: 6.5, w: 1.7, min: 2.8, max: 5.6, dmg: 0.85, wrec: 0.1 }),
  deer_kick: mv('後蹬', 'kick', 'cone', { wind: 0.36, strike: 0.2, recover: 0.45, r: 2.9, arc: 0.75, dir: Math.PI, at: 0.08, max: 2.8, behind: 1, track: 0 }),
  deer_charge: mv('角頂', 'charge', 'line', { wind: 0.55, strike: 0.4, recover: 0.6, dash: 7, w: 1.6, max: 8, dmg: 1.2 }),
  // 菁英的招牌招式
  frost_howl: mv('霜嚎', 'roar', 'circle', { wind: 1.15, strike: 0.3, recover: 0.8, r: 6.4, at: 0.05, dmg: 1.5, max: 6, armor: 1, cd: 10, rally: 1 }),
  frost_combo: mv('三連撲', 'bite', 'line', { chain: ['wolf_bite', 'wolf_bite', 'wolf_leap'], min: 2.4, max: 6.2, cd: 8, low: 0.9 }),
  scar_roar: mv('震懾咆哮', 'roar', 'ring', { wind: 1.2, strike: 0.3, recover: 0.7, r0: 4.2, r: 11, at: 0.05, dmg: 0.8, max: 14, armor: 1, cd: 11 }),
  scar_quake: mv('震地', 'slam', 'circle', { wind: 0.85, strike: 0.22, recover: 1.3, r: 7, at: 0.2, dmg: 1.4, max: 5, heavy: 1, armor: 1 }),
  scar_combo: mv('震地三連', 'slam', 'circle', { chain: ['bear_slam', 'bear_slam', 'scar_quake'], max: 4.6, cd: 9, low: 0.7 }),
  shadow_spin: mv('迴身尾掃', 'spin', 'circle', { wind: 0.55, strike: 0.3, recover: 0.5, r: 4.8, at: 0.12, dmg: 0.8, max: 3.6, cd: 6 }),
  shadow_combo: mv('影襲', 'pounce', 'leap', { chain: ['tiger_pounce', 'tiger_pounce', 'tiger_pounce', 'shadow_spin'], min: 5, max: 11.5, cd: 9, low: 0.7 })
};
export const MOVE_IDS = Object.keys(MOVES); MOVE_IDS.forEach((k, i) => { MOVES[k].id = k; MOVES[k].i = i; });
/* 11-20 野獸放大（F2，使用者選「混合」）：野豬、灰狼用 B 倍率，其餘物種用 A 倍率，熊 A 倍率改 1.36（站起才到玩家 2 倍）。寫死、不留網址參數或 localStorage 切換，
   避免多人連線時每個人的判定範圍不一致。BIGK08 是各物種「外觀＋身體」放大倍率（玩家 2.5 高，參考點：腰 0.6、胸 1.0、肩 1.3）。菁英的 1.38 倍不動。
   放大了什麼：MON[type].size（模型、身體半徑 body*size、名牌高度、擊退）、名牌高度（保持和頭頂的間距）、orbit、這個物種所有招式的距離與範圍（ak 倍，見下）；
   沒動：血量、傷害、速度、預備與收招秒數、偵測距離 aggro、領地 terr。 */
export const BIGK08 = { boar: 1.55, wolf: 1.5, deer: 1.2, bear: 1.36, tiger: 1.25, bison: 1.2, ape: 1.15, ibex: 1.25, dog: 1.25, porc: 1.3, monkey: 1.2, croc: 1.15 };
export const BIG08 = { mode: 'mix', k: BIGK08 };
const TOP08 = { boar: 1.47, wolf: 1.59, deer: 2.51, bear: 2.43, tiger: 2.13, bison: 2.16, ape: 2.67, ibex: 1.88, dog: 1.63, porc: 1.17, monkey: 1.12, croc: 0.82 };      /* 放大前的最高點（量測，見報告），用來讓名牌和頭頂的間距維持原樣 */
const MOVE_OWN08 = [['boar_', 'boar'], ['wolf_', 'wolf'], ['frost_', 'wolf'], ['bear_', 'bear'], ['scar_', 'bear'], ['tiger_', 'tiger'], ['shadow_', 'tiger'], ['deer_', 'deer'], ['bison_', 'bison'], ['bull_', 'bison'], ['dog_', 'dog'], ['ape_', 'ape'], ['ibex_', 'ibex'], ['croc_', 'croc'], ['porc_', 'porc'], ['monkey_', 'monkey']];
export const atkK08 = k => 1 + 0.7 * (k - 1);      /* 招式距離／範圍的放大倍率：外觀放大 k 倍，招式幾何放大 0.7(k−1)+1 倍（預警形狀另外有 br＝body*size 的項會跟著變大，補足剩下的） */
export function applyBig08() {
  const K = BIG08.k;
  for (const t in MON) { const D = MON[t], k = K[t]; if (!k || D.bk) continue; D.bk = k; const sz0 = D.size; D.size = Math.round(sz0 * k * 1000) / 1000; D.tagH = Math.round(((D.tagH * sz0 + (k - 1) * (TOP08[t] || 1.5)) / D.size) * 100) / 100; D.orbit = Math.round(D.orbit * atkK08(k) * 10) / 10; }
  for (const id in MOVES) { const M = MOVES[id]; if (M._big || id === 'ape_rock') continue; const o = MOVE_OWN08.find(q => id.startsWith(q[0])); if (!o) continue; const k = K[o[1]]; if (!k) continue; M._big = 1; const a = atkK08(k), travel = M.shape === 'leap' || M.dash >= 1.5; for (const f of travel ? ['r', 'r0', 'w', 'off'] : ['r', 'r0', 'w', 'off', 'dash', 'min', 'max']) if (M[f]) M[f] = Math.round(M[f] * a * 100) / 100; }      /* 撲、衝、跳（leap 或位移 ≥1.5）：只放大範圍（r、w、off），位移距離與發動距離 min／max／dash 不動——否則同樣的預備秒數要跑更遠，難度會變（伏擊虎的 16 公尺盯上也會變）；線型招式的長度本來就含 br＝body*size，會跟著身體變長 */
}
applyBig08();
export const ENRAGE = { at: 0.35, wind: 0.72, recover: 0.7, minWind: 0.35 };       // 血量低於 35% 狂暴：預備與收招變快
export const ELITES = [
  { type: 'wolf', name: '頭狼・霜背', lv: 4, x: -34, z: 168, drop: 'trophy_frost', orb: 'warcry', moves: ['wolf_bite', 'wolf_snap', 'wolf_leap', 'frost_howl', 'frost_combo'] },
  { type: 'bear', name: '巨熊・老疤', lv: 7, x: -176, z: -44, drop: 'trophy_scar', orb: 'quake', moves: ['bear_slam', 'bear_swipe', 'bear_charge', 'scar_roar', 'scar_combo'] },
  { type: 'tiger', name: '潛行虎・影牙', lv: 9, x: 214, z: 16, drop: 'trophy_shadow', orb: 'blink', moves: ['tiger_pounce', 'tiger_swipe', 'tiger_lunge', 'shadow_spin', 'shadow_combo'] }
];
// 野獸的行為：cd 兩招之間的間隔［最短, 隨機再加］（再乘上各種野獸的 pace：熊出手慢而重）；一下打掉 big 比例的生命才算重擊（能打斷沒有霸體的預備動作）；狼群一隻出手完，隔 packGap 秒下一隻才出手；目標離得比 far 遠時追擊加速 rush 倍（甩不掉、也不能邊退邊射）；失去目標回到原地 reset 秒後恢復滿血（脫離戰鬥）
export const AI = { cd: [0.35, 0.5], far: 8, rush: 1.3, reset: 5, big: 0.22, packGap: 0.5 };
// 等級差（野獸等級 − 玩家等級）：每差一級，受到的傷害 ±hurt、造成的傷害 ∓deal，各有上下限。越級吃力（主要是打得慢、挨得久），但不會幾下就倒
export const LVK = { hurt: 0.02, hurtMin: 0.85, hurtMax: 1.15, deal: 0.05, dealMin: 0.7, dealMax: 1.15 };
export const lvHurt = d => clamp(1 + LVK.hurt * d, LVK.hurtMin, LVK.hurtMax), lvDeal = d => clamp(1 - LVK.deal * d, LVK.dealMin, LVK.dealMax);
// 擊殺經驗：gap 玩家比野獸高幾級時的倍率（同等級 ±2 都是全額；高 3 級剩一半、4 級剩四分之一、5 級以上沒有）；野獸比玩家高，每級多 up（上限 upMax）
// first 第一次擊敗這種野獸額外給幾倍；菁英第二次以後只剩 eliteAgain（重生要 200 秒，刷菁英不會比正常打獵快）。同一種野獸打再多也不遞減
export const EXPK = { gap: [1, 1, 1, 0.5, 0.25], up: 0.1, upMax: 1.3, first: 3, eliteAgain: 0.5 };
export function killExp(base, monLv, pLv, n, elite) {      // n：之前已經擊敗過幾隻同種的（菁英是同一隻）
  const d = pLv - monLv, lvK = d >= EXPK.gap.length ? 0 : d >= 0 ? EXPK.gap[d] : Math.min(EXPK.upMax, 1 - d * EXPK.up);
  if (elite) return Math.round(base * lvK * (n > 0 ? EXPK.eliteAgain : 1));
  return Math.round(base * lvK) + (n === 0 ? Math.round(base * EXPK.first) : 0);
}
export const MON_BASE_LV = { boar: 1, wolf: 2, bear: 4, tiger: 6, deer: 1 };
// 0.6 第二段：擊殺經驗另外乘上「等級倍率」MON_EXP.grow^(等級−1)——每高一級的野獸，經驗多 25%（連同原本隨等級加的血量比例，同種每高一級約多 35–40%；血量、傷害不變），和升級需求一起一級一級往上，同等級的野獸大約都是十來分鐘升一級。
// 種類之間的比例照舊（同等級：猛虎 > 棕熊 > 灰狼 > 野豬 > 野鹿）
export const MON_EXP = { grow: 1.25 };
export const monExpK = lv => MON_EXP.grow ** (Math.max(1, lv) - 1);
Object.assign(MON_BASE_LV, LV_BASE08); /* 0.8 X3b／X8：新野獸的基準等級（data08.js：猴 8、箭豬 6、鱷魚 4、猩猩 16、岩羊 16） */
const hiK = (t, lv) => (lv >= EXP_HI08.lv && EXP_HI08.k[t]) || 1;      /* 0.8 X8：16 級以上某些種類的經驗倍率（北境灰狼一兩下就倒，不打對折會變成刷狼；data08.js） */
export function monStats(type, lv, elite) {
  const d = MON[type], k = 1 + 0.13 * (lv - MON_BASE_LV[type]);
  return { hp: Math.round(d.hp * k * (elite ? 4 : 1)), dmg: Math.round(d.dmg * k * (elite ? 1.3 : 1)), exp: Math.round(d.exp * k * monExpK(lv) * hiK(type, lv) * (elite ? 6 : 1)), size: d.size * (elite ? 1.38 : 1) };
}
export function buildSpawns(gen) {      /* 0.8（X0a）：gen＝true 才照原本的規則重算 0–211 號（只給 node 比對用）；平常讀凍結表 spawns08.js */
  const rand = rng(7741), out = []; let pack = 0;
  const ok = (x, z, zone) => !terrainBlocked(x, z, 1) && zoneAt(x, z) === zone && roadDist(x, z, 1) > 5;      // 0.6：一律照 0.5a 的世界判斷（半徑 241 以內、舊通道），怪物的編號與位置才不會變；外環先不放怪
  const put = (type, lv, x, z, extra) => out.push(Object.assign({ id: out.length, type, lv, x: r1(x), z: r1(z), elite: false }, extra));
  const scatter = (zone, n, pick, test) => { for (let i = 0, g = 0; i < n && g < 9000; g++) { const a = rand() * TAU, r = 50 + rand() * 195, x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!ok(x, z, zone) || (test && !test(x, z, r))) continue; if (out.some(o => Math.hypot(o.x - x, o.z - z) < 13)) continue; pick(x, z, r); i++; } };
  const group = (type, lv, x, z, n) => { pack++; for (let k = 0; k < n; k++) put(type, lv, x + Math.cos(k * 2.1) * 3.2, z + Math.sin(k * 2.1) * 3.2, { pack }); };
  if (!gen && SPAWN08.list.length) {      /* 0.8（X0a）：0.5a＋0.6 外環的 212 隻照凍結表放（欄位、順序、群組編號和重算的一模一樣），之後地形怎麼改都不會動 */
    for (const q of SPAWN08.list) { const e = q[5] >= 0 ? ELITES[q[5]] : null; out.push(Object.assign({ id: out.length, type: q[0], lv: q[1], x: q[2], z: q[3], elite: false }, e ? { elite: true, name: e.name, drop: e.drop, orb: e.orb, moves: e.moves, pack: e.type === 'wolf' ? q[4] : undefined } : q[4] ? { pack: q[4] } : null)); }
    pack = SPAWN08.pack;
  } else {
  // 草原：近城是野豬，外圍是狼群
  scatter('meadow', 16, (x, z, r) => put('boar', r < 95 ? 1 : 2, x, z), (x, z, r) => r > 56 && r < 150);
  scatter('meadow', 11, (x, z, r) => group('wolf', r < 120 ? 2 : 3, x, z, 3), (x, z, r) => r > 78);
  // 森林：熊與狼群
  scatter('forest', 14, (x, z, r) => put('bear', r < 150 ? 4 : r < 200 ? 5 : 6, x, z));
  scatter('forest', 6, (x, z, r) => group('wolf', r < 160 ? 3 : 4, x, z, 3));
  // 峽谷：虎
  scatter('canyon', 17, (x, z) => put('tiger', Math.hypot(x - 98, z - 6) < 70 ? 6 : Math.hypot(x - 98, z - 6) < 130 ? 7 : Math.hypot(x - 98, z - 6) < 150 ? 8 : 9, x, z));
  // 巢穴外圍：混合
  scatter('lair', 5, (x, z) => put('tiger', roadDist(x, z, 1) < 9 ? 10 : out.length % 2 ? 12 : 13, x, z)); scatter('lair', 4, (x, z) => put('bear', roadDist(x, z, 1) < 9 ? 10 : 12, x, z));
  for (const e of ELITES) put(e.type, e.lv, e.x, e.z, { elite: true, name: e.name, drop: e.drop, orb: e.orb, moves: e.moves, pack: e.type === 'wolf' ? ++pack : undefined });
  // 以下都加在後面，前面的怪物編號與位置維持不變。鹿群：草原與森林邊緣，兩三隻一群
  scatter('meadow', 7, (x, z, r) => group('deer', r < 110 ? 1 : 2, x, z, 2 + (out.length % 2)), (x, z, r) => r > 62 && r < 190);
  scatter('forest', 4, (x, z) => group('deer', 3, x, z, 2));
  // 霜背的兩隻護衛
  { const f = out.find(o => o.elite && o.type === 'wolf'); for (const s of [-1, 1]) put('wolf', 3, f.x + s * 3.4, f.z + 2.2, { pack: f.pack }); }
  // 站在陡坡上或池塘裡的挪到旁邊平緩的地方（只動這幾隻，其餘的編號與位置不變）
  const grad = (x, z) => [(height(x + 0.7, z, 1) - height(x - 0.7, z, 1)) / 1.4, (height(x, z + 0.7, 1) - height(x, z - 0.7, 1)) / 1.4];
  for (const o of out) {
    const x0 = o.x, z0 = o.z;
    for (let pi = 0; pi < OLD.pond; pi++) { const p = PONDS[pi]; let d = Math.hypot(o.x - p[0], o.z - p[1]) || 1, n = 0; while (d < p[2] + 4 && oldWaterLevel(o.x, o.z) - height(o.x, o.z, 1) > 0.25 && n++ < 40) { o.x += (o.x - p[0]) / d * 0.5; o.z += (o.z - p[1]) / d * 0.5; d = Math.hypot(o.x - p[0], o.z - p[1]); } }
    let [gx, gz] = grad(o.x, o.z), n = 0; while (Math.hypot(gx, gz) > 0.62 && n++ < 60) { const l = Math.hypot(gx, gz); o.x -= gx / l; o.z -= gz / l; [gx, gz] = grad(o.x, o.z); }
    if (o.x !== x0 || o.z !== z0) { o.x = r1(o.x); o.z = r1(o.z); }
  }
  // ===== 0.6 外環的野獸：一律加在最後面、用另一組亂數，前面 134 隻的編號與位置不受影響 =====
  const r6 = rng(20260614), N0 = out.length;
  const steep = (x, z) => Math.hypot(height(x + 1.4, z) - height(x - 1.4, z), height(x, z + 1.4) - height(x, z - 1.4)) / 2.8;
  const ok6 = (x, z, zone) => zoneAt(x, z) === zone && !terrainBlocked(x, z) && roadDist(x, z) > 4.5 && lakeDist(x, z) > 2.5 && steep(x, z) < 0.42 && SPAWN_AVOID.every(q => Math.hypot(x - q[0], z - q[1]) > q[2]);
  const okGroup = (x, z, zone, n) => { for (let k = 0; k < n; k++) if (!ok6(x + Math.cos(k * 2.1) * 3.2, z + Math.sin(k * 2.1) * 3.2, zone)) return false; return ok6(x, z, zone); };
  // 在指定的區域裡撒 n 個（或 n 群）：a0–a1 方位（度，0 北、順時針）、半徑範圍、彼此至少隔 gap 公尺。
  // 0.6 第二波：嘗試上限 6000→20000（營火的避開範圍放大後，獸欄兩翼的棕熊原本放不滿；其他區本來就不到上限就放滿了，位置不變）
  const scatter6 = (zone, n, gap, pick, a0 = 0, a1 = 360, rr0 = WORLD.R0 + 3, rr1 = WORLD.R - 13, size = 1) => { for (let i = 0, g = 0; i < n && g < 20000; g++) { const a = (a0 + r6() * (a1 - a0)) * Math.PI / 180, r = Math.sqrt(lerp(rr0 * rr0, rr1 * rr1, r6())), x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!(size > 1 ? okGroup(x, z, zone, size) : ok6(x, z, zone))) continue; if (out.some(o => Math.hypot(o.x - x, o.z - z) < (o.id < N0 ? 13 : gap))) continue; pick(x, z, r); i++; } };
  // 南：河灣草場。狼丘上一群四隻的灰狼，另外兩群；野鹿三群（四到五隻）；野豬
  group('wolf', 5, -96.5, 272.5, 4);
  scatter6('bend', 2, 46, (x, z, r) => group('wolf', r < 300 ? 4 : 5, x, z, 3), 0, 360, 262, 330, 3);
  { let k = 0; scatter6('bend', 3, 40, (x, z) => { group('deer', 3 + (k % 2), x, z, 5 - (k % 2)); k++; }, 0, 360, 258, 330, 5); }
  scatter6('bend', 6, 24, (x, z, r) => put('boar', r < 295 ? 3 : 4, x, z));
  // 西：古木林。蔘坡是棕熊的地盤（三隻），其餘散在林子裡；灰狼四群
  for (const [x, z] of [[-287, -40], [-306, -18], [-286.5, -7.5]]) put('bear', 8, x, z);
  scatter6('oldwood', 9, 34, (x, z, r) => put('bear', r < 296 ? 7 : 8, x, z));
  scatter6('oldwood', 4, 50, (x, z, r) => group('wolf', r < 296 ? 5 : 6, x, z, 3), 0, 360, 256, 330, 3);
  // 東：採石場與鹽臺（外谷）。猛虎，南段 9 級、北段 10 級
  scatter6('quarry', 13, 30, (x, z) => put('tiger', z > 30 ? 9 : 10, x, z));
  // 北：獸欄兩翼。猛虎與棕熊 12–13 級
  scatter6('wings', 6, 24, (x, z) => put('tiger', out.length % 2 ? 12 : 13, x, z));
  { const n0 = out.length; scatter6('wings', 5, 24, (x, z) => put('bear', out.length % 2 ? 12 : 13, x, z)); if (out.length - n0 < 5) put('bear', out.length % 2 ? 12 : 13, -174, -260); }      // 0.6 第二波：營火的避開範圍放大後兩翼放不下第五隻（間隔 24 公尺），補在西翼山徑的出口（離最近的野獸 23 公尺）
  // 0.6 的新地形（鏡溪、新通道、營地）上原本站著的舊野獸：只挪這幾隻到旁邊（編號不變）
  for (const o of out) if (SPAWN_MOVED[o.id]) { o.x = SPAWN_MOVED[o.id][0]; o.z = SPAWN_MOVED[o.id][1]; }
  }      /* ↑ 0.8（X0a）：凍結表的另一支（gen） */
  // ===== 0.7 荒地的野獸（places07.js 的 WILD07，座標在遊戲裡驗證過）：一律加在最後面，前面的編號與位置不變。WILD_TIER07：1＝第一批 16 隻、2＝加滿 =====
  for (const g of WILD07) if (g.t <= WILD_TIER07) { const pk = g.pts.length > 1 ? ++pack : undefined; for (const p of g.pts) put(g.type, g.lv, p[0], p[1], { pack: pk, wild: 1 }); }
  // ===== 0.7a 新野獸（places08.js 的 BEAST08：野牛、沼蟒、斷鍊鬥犬，定點）：一律加在最後面，前面的編號與位置不變；每群一個 pack。BEAST_TIER08＝0 時不放（緊急開關）。0.8 的菁英接在這些後面 =====
  for (const g of BEAST08) if (g.t <= BEAST_TIER08) { const pk = ++pack; for (const p of g.pts) put(g.type, g.lv, p[0], p[1], { pack: pk, beast8: 1 }); }
  /* ===== 0.8 大擴建（X1）：新地的野獸與菁英（places08.js 的 NEW08，凍結表）：編號 242 起，前面的編號與位置不變 ===== */
  { const X8 = spawnsX08(out.length, pack); for (const o of X8.list) out.push(o); pack = X8.pack; }
  return out;
}
export const SPAWN_OLD = 134;                              // 0.5a 既有的出生點數量（編號 0–133）；之後的是 0.6 外環的
// 外環的野獸不要出現在這些地方附近：六處營火（36 公尺＝營火 30 公尺內不能有野獸＋牠在老家附近閒晃的 6 公尺，再留 1 公尺）、木橋、釣臺、菁英的外環出沒點（x、z、半徑）
export const SPAWN_AVOID = [[76, 250, 37], [-224.6, 27.4, 37], [222.5, 99.5, 37], [-68.5, -266.5, 37], [246.5, -105.6, 37], [-105.6, -10.8, 37], [55, 190, 16], [45, 285, 14], [132, 296, 16], [-272, 170, 16], [-222, -204, 16], [298, -113, 14], [277, 153, 14], [-120, -299, 13], [-96.5, 288.5, 10]];
// 0.6 第二波：採藥人小屋營火旁 12、16 公尺的兩隻 6 級棕熊（0.5a 的 50、55 號）挪到 40 公尺外的林子裡；編號、種類、等級不變
// 另外三隻外環野獸的老家剛好壓在加粗後的樹幹上，往旁邊挪不到一公尺
export const SPAWN_MOVED = { 50: [-232.4, -13.4], 55: [-222.6, 69.4], 182: [-177.9, -186.7], 203: [112.5, -295.4], 204: [68.5, -254.9] };

/* ============================== 道具 ============================== */
export const ITEMS = {
  potion: { name: '治療藥水', glyph: '藥', color: '#c8563f', desc: '喝下後 3 秒內恢復 40% 生命。喝的時候要站穩（被打中會中斷），喝完 12 秒內不能再用回復道具。', heal: 0.4, buy: 40, sell: 8 },
  meat: { name: '獸肉', glyph: '肉', color: '#b5673f', desc: '生吃：10 秒內慢慢恢復 15% 生命，一挨打就中斷。適合戰鬥結束後補體力。', regen: 0.15, sell: 3 },
  tusk: { name: '野豬獠牙', glyph: '牙', color: '#cfc6ae', desc: '鍛造素材。', sell: 6 },
  pelt_wolf: { name: '狼皮', glyph: '皮', color: '#8d959c', desc: '鍛造素材。', sell: 8 },
  pelt_bear: { name: '熊皮', glyph: '皮', color: '#7a5a3e', desc: '鍛造素材。', sell: 18 },
  gall: { name: '熊膽', glyph: '膽', color: '#5aa469', desc: '稀有的藥品素材。', sell: 40 },
  pelt_tiger: { name: '虎皮', glyph: '皮', color: '#d98a3a', desc: '鍛造素材。', sell: 26 },
  fang: { name: '虎牙', glyph: '牙', color: '#e8dcc0', desc: '稀有的鍛造素材。', sell: 45 },
  pelt_deer: { name: '鹿皮', glyph: '皮', color: '#c9a070', desc: '柔軟的鍛造素材。', sell: 7 },
  antler: { name: '鹿角', glyph: '角', color: '#e0d2b4', desc: '稀有的鍛造素材。', sell: 30 },
  trophy_frost: { name: '霜背的獠牙', glyph: '徽', color: '#9fc4e0', desc: '擊敗頭狼・霜背的證明。' },
  trophy_scar: { name: '老疤的爪', glyph: '徽', color: '#c79a5a', desc: '擊敗巨熊・老疤的證明。' },
  trophy_shadow: { name: '影牙的尾', glyph: '徽', color: '#a58bd6', desc: '擊敗潛行虎・影牙的證明。' },
  ...ITEMS08      /* 0.8 X8：九隻菁英的戰利品與新素材、牛角飾、蟒膽劑、稀有天賦球箱（data08.js；名字與說明由 quest08 照劇情的 LORE 補上） */
};

/* ============================== 能力與成長 ============================== */
export const LV_CAP = LV08.cap;      /* 0.8 X13：15 → 20（data08.js） */
// 升級需求（0.6 第二段重做）：每一層 15 級，每 5 級一個級距（1–5、6–10、11–15）。need[等級]＝從這一級升到下一級要的經驗。
// 每一級「只打同等級 ±2 的野獸」一般玩家約 8–14 分鐘（用實測的打獵速度定的，見 team/w6-balance2/數值定案.md）；野獸的經驗一級比一級多（MON_EXP），所以需求也一級一級往上跳，
// 三個級距的總需求：1–5 級 4,500、6–10 級 29,400（約 ×6.5）、11–15 級 105,000（約 ×3.6）。0.8：上限 20，15→16 取 34,000、16–19 照計畫 T6（16–20 級四次升級 313,000；15→20 共 347,000）。20 級以後（第二層）先照 grow 往上推
export const EXP = { band: 5, need: LV08.need, grow: 1.2 };      /* 0.8 X8：表在 data08.js 的 LV08.need（明寫到 19 級） */
export const expNeed = lv => { const l = Math.max(1, lv | 0), N = EXP.need; return l < N.length ? N[l] : Math.round(N[N.length - 1] * EXP.grow ** (l - N.length + 1) / 50) * 50; };
export const expBand = lv => Math.floor((Math.max(1, lv | 0) - 1) / EXP.band);      // 0＝第一級距（1–5 級）、1＝第二級距（6–10）、2＝第三級距（11–15）
// 0.7 E1／G1（數值定案07）：同級打獵一分鐘的經驗／金幣（金幣含賣素材，一般玩家）。第一次釣到魚的經驗、委託卡、陷阱拆除、測繪費、f01–f04 都照這張表
export const HUNT07 = { bandMin: [52.3, 49.9, 50.7, LV08.lvMin[3] * 4], lvMin: LV08.lvMin, G1: LV08.G1 };      /* 0.8 X8：lvMin＝各級距每升一級幾分鐘（前三格＝bandMin÷5、÷5、÷4，和 0.7 一樣）；第四級距 16–20 與 G1 的 16–20 級照機器人量測（data08.js） */
export const E1 = lv => { const l = Math.max(1, Math.min(LV_CAP, lv | 0)); return expNeed(l) / HUNT07.lvMin[Math.min(HUNT07.lvMin.length - 1, expBand(l))]; };
export const G1 = lv => HUNT07.G1[Math.max(1, Math.min(LV_CAP, lv | 0))];
// 倒下扣的經驗（接在 expBand 後面）：這一級需求的 die[0]，每高一級少 die[1]，最少 die[2]（1 級 10%、14 級起 4%；上限 LV_CAP（0.8：20 級）經驗固定 0，不扣）；只扣這一級已經累積的，不會降級。復活後 5 分鐘內再倒不重複扣（game.js）
export const DEATH = { die: [0.1, 0.0045, 0.04] };
export const deathExp = lv => Math.floor(expNeed(lv) * Math.max(DEATH.die[2], DEATH.die[0] - DEATH.die[1] * (Math.max(1, lv) - 1)));
// 舊存檔：0.6 第二段之前存的（存檔沒有 xv）用的是舊需求 100 × 等級 × 級距倍率（10 級起 2.5 倍）。等級一律不降：
// 先照舊需求補完該升的級（更早版本的存檔可能累積了超過舊需求的經驗，舊版載入時本來就會補升），剩下的這一級經驗照比例換到新需求
// （例如舊的 12 級 1,500／3,000＝五成 → 新需求的五成）。回傳 { lv, exp }；game.js 照升了幾級補能力點數
export const EXP_VER = 2;
export const expNeedOld = lv => Math.round(100 * lv * (lv >= 10 ? 2.5 : 1));
export const expMigrate = (lv, exp, xv) => { if (xv === EXP_VER) return { lv, exp };
  while (lv < LV_CAP && exp >= expNeedOld(lv)) { exp -= expNeedOld(lv); lv++; }
  return { lv, exp: lv >= LV_CAP ? 0 : Math.floor(exp / expNeedOld(lv) * expNeed(lv)) }; };
// 治療藥水（沒有攜帶上限）：use 喝的動作秒數（走得慢、不能出手，被打中或閃避會中斷，不消耗）；heal 恢復的生命比例，在 dur 秒內回完；cd 喝完多久才能再用回復道具；price 價格＝[0]＋[1]×等級
export const POTION = { use: 0.8, heal: 0.4, dur: 3, cd: 12, move: 0.45, price: [40, 0] };   // 製作人：固定價（商店價格不跟著買的人等級變）
export const potionPrice = lv => POTION.price[0] + POTION.price[1] * lv;
// 獸肉（生吃）：dur 秒內恢復 heal 比例的生命，挨打就中斷；cd 同上
export const MEAT = { heal: 0.15, dur: 10, cd: 10 };
export const STAT_KEYS = ['str', 'agi', 'acc', 'int', 'luk', 'end'];
export const STATS = {
  str: { name: '力量', sup: 'end', eff: '近戰傷害', side: '攻擊與閃避更耗體力' },
  agi: { name: '敏捷', sup: 'acc', eff: '移動與攻擊速度', side: '攻擊有機率打偏' },
  acc: { name: '命中', sup: 'str', eff: '暴擊率、弓箭與投擲威力', side: '射箭與投擲出手變慢' },
  int: { name: '智力', sup: 'agi', eff: '法術威力、魔力上限與回復', side: '施法變慢' },
  luk: { name: '幸運', sup: 'int', eff: '掉寶與金幣', side: '超出的幸運不生效' },
  end: { name: '耐力', sup: 'str', eff: '生命、體力、防禦', side: '移動與閃避變慢' }
};
export const baseStats = () => ({ str: 5, agi: 5, acc: 5, int: 5, luk: 5, end: 5 });
// 支撐能力低於主能力的一半時出現副作用；deficit 為缺口
export function derive(st, lv) {
  const def = k => Math.max(0, st[k] / 2 - st[STATS[k].sup]);
  const d = { str: def('str'), agi: def('agi'), acc: def('acc'), int: def('int'), luk: def('luk'), end: def('end') };
  const lukEff = Math.min(st.luk, Math.max(5, st.int * 2));
  return {
    deficit: d,
    maxHp: Math.round(90 + st.end * 6 + (lv - 1) * 10),
    maxSt: Math.round(92 + st.end * 1.6),
    maxMp: Math.round(60 + st.int * 4 + (lv - 1) * 3),
    mpRegen: (60 + st.int * 4 + (lv - 1) * 3) / MANA.full,
    dmgMul: 1 + (st.str - 5) * 0.035,
    spellMul: 1 + (st.int - 5) * 0.04,
    throwMul: 1 + (st.acc - 5) * 0.03,
    speedMul: Math.min(1.25, 1 + (st.agi - 5) * 0.004) * Math.max(0.7, 1 - d.end * 0.012),
    atkSpeed: Math.min(1.4, 1 + (st.agi - 5) * 0.006),
    crit: Math.min(0.5, 0.05 + (st.acc - 5) * 0.005),
    miss: Math.min(0.3, d.agi * 0.015),
    stCost: 1 + d.str * 0.04,
    castMul: 1 + Math.min(1, d.int * 0.05),
    aimMul: 1 + Math.min(1, d.acc * 0.05),
    defMul: 100 / (100 + st.end * 1.5),
    luck: 1 + (lukEff - 5) * 0.012,
    lukEff
  };
}
export const MST = { IDLE: 0, CHASE: 1, WIND: 2, STRIKE: 3, RECOVER: 4, STAGGER: 5, DEAD: 6, FLEE: 7, WARN: 8 };

/* ============================== 玩家戰鬥 ============================== */
// 武器招式表，依武器類型（1h 單手｜2h 雙手｜dual 雙持｜staff 法杖與短杖｜bow 弓）。每種武器一套：
//   light 輕攻擊連段｜heavy 重攻擊（可蓄力）｜a 輕攻擊一下後接重攻擊｜b 輕攻擊兩下以上接重攻擊｜sprint 衝刺中攻擊｜dodge 翻滾或快閃後攻擊｜back 後撤步後攻擊
// 每一招：name 招式名、clip 動作、dur 整段秒數、hit 命中時間點、dmg 傷害、range 距離、arc 半角、step 前踏的力道、cost 體力
// fx 刀光：l 斜斬｜r 反手橫斬｜h 重劈｜t 突刺｜s 迴旋｜p 盾擊｜b 魔力彈｜a 箭｜n 震波
// 其他：heavy 會打斷怪物的動作；stag 打斷的強度（硬直 0.1 秒為 1）；push 把怪物推開的力道；twice 一次命中算兩段傷害；hits 多段命中 [[時間點, 傷害倍率], …]；rep 每一段重播一次動作
//   lunge 向前突進的公尺數（會停在目標身前）；hop 躍起的高度；spin 轉身圈數（負的是順著揮擊的方向）；wave 命中時震波的半徑；crit 暴擊率倍率；behind 從背後命中的傷害倍率
//   bolt 魔力彈的大小、arrow 箭的大小（威力分別隨智力、命中）；fan [發數, 夾角]；burst [發數, 間隔秒]；pierce 貫穿；boom 命中後爆開的半徑；nova 以自己為中心的震波半徑
const at = (name, clip, dur, hit, dmg, range, arc, step, cost, fx, o) => Object.assign({ name, clip, dur, hit, dmg, range, arc, step, cost, fx }, o);
export const MOVESET = {
  '1h': {
    name: '單手', note: '攻守均衡。有盾的話格擋最穩，輕攻擊後接重攻擊是盾擊，能打斷野獸。',
    light: [at('斜斬', '1H_Melee_Attack_Slice_Diagonal', 0.38, 0.15, 12, 3.0, 1.15, 2.4, 7, 'l'), at('橫斬', '1H_Melee_Attack_Slice_Horizontal', 0.38, 0.15, 12, 3.0, 1.15, 2.4, 7, 'r'), at('直劈', '1H_Melee_Attack_Chop', 0.52, 0.22, 22, 3.5, 1.05, 5.5, 11, 'h')],
    heavy: at('蓄力重劈', '1H_Melee_Attack_Chop', 0.56, 0.22, [22, 46], 3.8, 1.1, 6, [12, 20], 'h', { heavy: 1, full: 0.9 }),
    a: at('盾擊', 'Block', 0.46, 0.2, 9, 2.9, 1.0, 0, 9, 'p', { lunge: 2.2, stag: 8, push: 9, span: 0.5 }),
    a2: at('踢擊', 'Unarmed_Melee_Attack_Kick', 0.46, 0.2, 9, 2.8, 0.9, 3, 9, 'p', { stag: 8, push: 9 }),
    b: at('迴旋斬', '1H_Melee_Attack_Slice_Horizontal', 0.6, 0.26, 27, 3.6, 3.2, 1.5, 14, 's', { spin: -1, heavy: 1 }),
    sprint: at('躍斬', '1H_Melee_Attack_Chop', 0.62, 0.32, 24, 3.6, 1.05, 0, 12, 'h', { lunge: 5, hop: 0.9, heavy: 1 }),
    dodge: at('翻身斬', '1H_Melee_Attack_Slice_Horizontal', 0.34, 0.12, 15, 3.3, 1.35, 3, 8, 'r', { crit: 2.5 }),
    back: at('突進刺', '1H_Melee_Attack_Stab', 0.5, 0.24, 20, 3.9, 0.6, 0, 10, 't', { lunge: 5.5 })
  },
  '2h': {
    name: '雙手', note: '慢、重、範圍大。收尾的迴旋與重攻擊都能打斷野獸，蓄滿的重劈會震裂地面。',
    light: [at('橫掃', '2H_Melee_Attack_Slice', 0.6, 0.26, 21, 3.9, 1.5, 2.2, 11, 'l', { big: 1 }), at('直劈', '2H_Melee_Attack_Chop', 0.66, 0.3, 26, 4.0, 0.9, 3.2, 13, 'h'), at('迴旋斬', '2H_Melee_Attack_Spin', 0.86, 0.38, 36, 4.2, 3.2, 1.6, 18, 's', { heavy: 1 })],
    heavy: at('蓄力重劈', '2H_Melee_Attack_Chop', 0.72, 0.3, [30, 68], 4.4, 1.0, 4.5, [16, 27], 'h', { heavy: 1, full: 1.2, big: 1, wave: 3.4, waveAt: 1 }),
    a: at('貫刺', '2H_Melee_Attack_Stab', 0.6, 0.27, 30, 5.2, 0.45, 0, 14, 't', { lunge: 2.4, heavy: 1 }),
    b: at('旋風斬', '2H_Melee_Attack_Spinning', 1.0, 0.24, 20, 4.4, 3.2, 0, 22, 's', { hits: [[0.24, 1], [0.52, 1], [0.8, 1.3]], loop: 3, heavy: 1 }),
    sprint: at('躍劈', '2H_Melee_Attack_Chop', 0.8, 0.42, 36, 4.2, 0.95, 0, 17, 'h', { lunge: 5, hop: 1.3, heavy: 1, wave: 3.2 }),
    dodge: at('起身掃', '2H_Melee_Attack_Slice', 0.5, 0.2, 22, 4.0, 1.6, 2.5, 12, 'r'),
    back: at('突進刺', '2H_Melee_Attack_Stab', 0.6, 0.28, 28, 4.8, 0.5, 0, 14, 't', { lunge: 6, heavy: 1 })
  },
  dual: {
    name: '雙持', note: '快、連段長，單下傷害低。翻滾或快閃後繞到背後出手，傷害更高。',
    light: [at('交叉斬', 'Dualwield_Melee_Attack_Slice', 0.27, 0.1, 8, 2.7, 1.0, 2.0, 5, 'l'), at('雙刺', 'Dualwield_Melee_Attack_Stab', 0.27, 0.11, 8, 2.9, 0.7, 2.2, 5, 't'), at('反手斬', 'Dualwield_Melee_Attack_Slice', 0.27, 0.1, 9, 2.7, 1.0, 2.0, 5, 'r'), at('雙刺', 'Dualwield_Melee_Attack_Stab', 0.27, 0.11, 9, 2.9, 0.7, 2.2, 5, 't'), at('雙劈', 'Dualwield_Melee_Attack_Chop', 0.46, 0.19, 10, 3.0, 1.2, 4.5, 9, 'h', { twice: 1 })],
    heavy: at('蓄力雙劈', 'Dualwield_Melee_Attack_Chop', 0.5, 0.2, [9, 20], 3.3, 1.2, 7, [10, 17], 'h', { heavy: 1, full: 0.7, twice: 1 }),
    a: at('三連刺', 'Dualwield_Melee_Attack_Stab', 0.58, 0.1, 7, 3.1, 0.65, 1.2, 10, 't', { hits: [[0.1, 1], [0.27, 1], [0.44, 1.5]], rep: 1 }),
    b: at('迴旋亂舞', 'Dualwield_Melee_Attack_Slice', 0.82, 0.14, 7, 3.0, 3.2, 0, 15, 's', { spin: -2, hits: [[0.14, 1], [0.3, 1], [0.46, 1], [0.64, 1.6]], heavy: 1 }),
    sprint: at('掠身斬', 'Dualwield_Melee_Attack_Slice', 0.42, 0.2, 16, 3.0, 1.4, 0, 9, 'l', { lunge: 6 }),
    dodge: at('背襲', 'Dualwield_Melee_Attack_Stab', 0.36, 0.14, 9, 3.2, 0.7, 0, 8, 't', { twice: 1, lunge: 2.5, behind: 1.6 }),
    back: at('飛身刺', 'Dualwield_Melee_Attack_Stab', 0.5, 0.26, 10, 3.4, 0.7, 0, 9, 't', { twice: 1, lunge: 6, hop: 0.7 })
  },
  // 法杖與短杖：普通攻擊是射出魔力彈（威力隨智力），重攻擊蓄力後的魔力彈會爆開。
  //   法杖的招式主要耗魔力（mp，蓄力的是 [不蓄, 蓄滿]），體力（cost）只扣一點；魔力彈打中野獸會回流一點魔力（MANA.bolt）。射程和火球術同級（約 20 公尺）
  //   魔力不夠時改射 weak「微光彈」：不耗魔力、只耗體力，威力與射程都差很多（出招編號 13）
  staff: {
    name: '法杖', note: '遠距離法術，射程約 20 公尺。魔力彈的威力看智力，每發耗 3–4 點魔力（蓄力魔爆彈 5–12 點）、體力只扣 1 點；打中野獸回流 1 點魔力。魔力不夠時改射微弱的「微光彈」（只耗體力）。被貼身時用魔力震波把野獸推開。',
    light: [at('魔力彈', 'Spellcast_Shoot', 0.46, 0.2, 11, 21, 0, 0.5, 1, 'b', { bolt: 1, mp: 3 }), at('魔力彈', 'Spellcast_Shoot', 0.46, 0.2, 11, 21, 0, 0.5, 1, 'b', { bolt: 1, mp: 3 }), at('強化彈', 'Spellcast_Shoot', 0.62, 0.27, 19, 22, 0, 0.5, 1, 'b', { bolt: 1.4, mp: 4 })],
    heavy: at('蓄力魔爆彈', 'Spellcast_Shoot', 0.62, 0.27, [20, 48], 24, 0, 0.5, [2, 3], 'b', { bolt: 1.7, heavy: 1, full: 1.0, boom: 2.8, mp: [5, 12] }),
    a: at('散射', 'Spellcast_Shoot', 0.52, 0.22, 9, 18, 0, 0.5, 1, 'b', { bolt: 0.9, fan: [3, 0.24], mp: 5 }),
    b: at('魔力震波', 'Spellcast_Raise', 0.7, 0.32, 20, 4.6, 3.2, 0, 2, 'n', { nova: 4.6, stag: 7, push: 10, span: 1.3, mp: 5 }),
    sprint: at('滑步連彈', 'Spellcast_Shoot', 0.52, 0.18, 9, 20, 0, 0, 1, 'b', { bolt: 0.9, burst: [2, 0.14], lunge: 2.5, mp: 3 }),
    dodge: at('瞬發彈', 'Spellcast_Shoot', 0.34, 0.1, 12, 20, 0, 0.5, 1, 'b', { bolt: 1, mp: 3 }),
    back: at('震退彈', 'Spellcast_Shoot', 0.5, 0.2, 15, 20, 0, 0.5, 1, 'b', { bolt: 1.3, stag: 6, push: 9, mp: 4 }),
    weak: at('微光彈', 'Spellcast_Shoot', 0.5, 0.22, 5, 14, 0, 0.5, 6, 'b', { bolt: 0.42 })
  },
  // 弓：普通攻擊是射箭（威力隨命中），重攻擊拉滿弓的箭會貫穿、射得更遠
  bow: {
    name: '弓', note: '最遠的射程。箭的威力看命中；拉滿弓的箭會貫穿，拉滿後可以一直瞄準、放開才射出（撐太久會耗體力）。被貼身時先後撤再射。',
    light: [at('速射', 'Bow', 0.5, 0.27, 10, 22, 0, 0, 6, 'a', { arrow: 1 }), at('速射', 'Bow', 0.5, 0.27, 10, 22, 0, 0, 6, 'a', { arrow: 1 }), at('強弓', 'Bow', 0.64, 0.36, 17, 24, 0, 0, 9, 'a', { arrow: 1.25, pierce: 1 })],
    heavy: at('蓄力射', 'Bow', 0.5, 0.14, [15, 52], 30, 0, 0, [10, 18], 'a', { arrow: 1.5, heavy: 1, full: 1.1, pierce: 1, drawn: 1 }),
    a: at('散射', 'Bow', 0.58, 0.32, 8, 16, 0, 0, 10, 'a', { arrow: 0.9, fan: [3, 0.2] }),
    b: at('貫穿箭', 'Bow', 0.74, 0.44, 27, 28, 0, 0, 14, 'a', { arrow: 1.8, pierce: 1, heavy: 1, trail: 1 }),
    sprint: at('滑射', 'Bow', 0.48, 0.24, 12, 20, 0, 0, 8, 'a', { arrow: 1, lunge: 3 }),
    dodge: at('瞬射', 'Bow', 0.36, 0.16, 12, 20, 0, 0, 7, 'a', { arrow: 1, crit: 2 }),
    back: at('退步強射', 'Bow', 0.54, 0.28, 18, 24, 0, 0, 10, 'a', { arrow: 1.3, stag: 6, push: 7 })
  }
};
export const SETS = Object.keys(MOVESET);
// 出招編號（連線同步用）：0–4 輕攻擊連段、8 重攻擊、9 翻滾或快閃後、10 輕接重、11 輕輕接重、12 衝刺、13 法杖魔力不足時的微光彈、14 後撤後
export const MOVE_SLOTS = [['heavy', 8], ['a', 10], ['b', 11], ['sprint', 12], ['dodge', 9], ['back', 14]];
export const moveByCode = (set, code, noShield) => { const M = MOVESET[set] || MOVESET['1h']; return code < 8 ? M.light[clamp(code | 0, 0, M.light.length - 1)] : code === 8 ? M.heavy : code === 10 ? (noShield && M.a2) || M.a : code === 11 ? M.b : code === 12 ? M.sprint : code === 13 ? M.weak || M.dodge : code === 14 ? M.back : M.dodge; };
// 武器家族（技能的武器限制用）：melee 近戰｜staff 法杖｜bow 弓
export const famOf = set => set === 'staff' || set === 'bow' ? set : 'melee';
export const FAM_NAME = { melee: '近戰武器', staff: '法杖', bow: '弓' };
// 舊的名稱（其他地方還在用）：連段、蓄力重擊、閃避後的攻擊
export const COMBOS = {}, HEAVY = {}, DASH_ATK = {}; for (const k of SETS) { COMBOS[k] = { name: MOVESET[k].name, list: MOVESET[k].light }; HEAVY[k] = MOVESET[k].heavy; DASH_ATK[k] = MOVESET[k].dodge; }
export const ATTACKS = MOVESET['1h'].light;
export const CHARGE = { hold: 0.24, min: 0.3, max: 2.6, move: 0.45,      // 輕攻擊鍵按住超過 hold 秒開始蓄力，蓄不到 min 就放開不算；重攻擊鍵一按就開始蓄，輕點是不蓄力的重攻擊；近戰最多撐 max 秒就自動出招
  aim: { bow: 1, staff: 1 }, drain: 10, sag: 0.35, floor: 0.4 };          // aim 的遠程武器（弓、法杖）蓄滿後不會自己放出，一直瞄準到放開才出手：撐過 max 秒開始每秒耗 drain 點體力（會留著放出這一下要的體力）；體力撐不住時蓄力每秒流失 sag，最低剩 floor（弓弦慢慢鬆回去）
export const COMBO_WIN = 0.6;                                                // 一招結束後多久內再按算連段
export const PROJ = { bolt: 30, arrow: 46 };                                 // 魔力彈與箭的飛行速度（魔力彈原本 24；射程拉長到 20 公尺後太慢會打不到移動中的野獸）
// 閃避。規則：沒鎖定時，有按方向就朝那個方向翻滾；鎖定中，朝按的方向快閃一小步；沒按方向都是後撤步
// dist 位移、iframe 無敵秒數、cost 體力、win 結束後可以接攻擊的秒數
export const DODGES = {
  roll: { name: '翻滾', dur: 0.56, dist: 6.2, iframe: 0.38, cost: 24, win: 0.35 },
  step: { name: '快閃', dur: 0.3, dist: 3.6, iframe: 0.2, cost: 14, win: 0.45 },
  back: { name: '後撤步', dur: 0.36, dist: 4.4, iframe: 0.16, cost: 12, win: 0.45 }
};
DODGES.side = DODGES.step;
export const DODGE = { dur: DODGES.roll.dur, speed: 13.5, cost: DODGES.roll.cost, iframe: DODGES.roll.iframe };
export const DODGE_KINDS = ['roll', 'left', 'right', 'back', 'fwd'];      // left／right／fwd 是鎖定中的快閃
export const dodgeOf = kind => DODGES[kind === 'roll' || kind === 'back' ? kind : 'step'];
export const PERFECT = { st: 22, counter: 3, mul: 1.5, slow: 0.16, mp: 6 };       // 完美閃避：回體力與魔力、3 秒內下一擊必定暴擊且傷害 ×1.5
// 衝刺：按住時移動加快、持續消耗體力；跑了 atk 秒以上按攻擊是衝刺攻擊
export const SPRINT = { mul: 1.38, cost: 8, min: 8, atk: 0.3 };
// 鎖定：range 可以鎖定的距離、lose 超過就解除、arc 鏡頭前方多大的夾角內優先、next 目標倒下時自動改鎖多近的敵人
export const LOCK = { range: 24, lose: 32, arc: 1.15, next: 14, back: 0.72 };
// 與野獸互相推開：r 自己的半徑、k 推開的速率、max 最快每秒推多遠；野獸的範圍是半徑 body 倍身體大小的圓，圓心往頭那邊移 fwd 倍（四足動物是長的）
export const PUSH = { r: 0.5, k: 9, max: 6.5, body: 0.9, fwd: 0.3 };
// 魔力：技能只消耗魔力；法杖的招式也耗魔力（MOVESET.staff 的 mp）。普通攻擊命中會回一點（hit 輕攻擊、heavy 重的一擊、shot 遠程每發；bolt 法杖耗魔力的魔力彈打中時再多回流的量，加上 shot 共 1 點）
export const MANA = { hit: 0.4, heavy: 1, shot: 0.3, bolt: 0.7, full: 75, gcd: 1 };      // full：從空到滿自動回復要幾秒（比體力慢得多）；gcd：放了一個技能後，其他技能要等幾秒（共用冷卻）
// 格擋：正面 arc 內減傷 cut、每點傷害耗 st 體力；舉起後 parry 秒內擋下算精準格擋；破防後 stun 秒不能動
export const GUARD = { '1h': { cut: 0.8, st: 0.9 }, '2h': { cut: 0.62, st: 1.2 }, dual: { cut: 0.45, st: 1.5 }, staff: { cut: 0.55, st: 1.3 }, bow: { cut: 0.4, st: 1.5 }, arc: 1.25, parry: 0.2, move: 0.4, stun: 0.9, heavyCut: 0.45 };

/* ============================== 天賦球與技能 ============================== */
// 技能一律消耗魔力（cost.mp）。req 能力門檻；cd 冷卻秒數；cast 動作秒數、at 生效時間點；rare 稀有（菁英掉落）；wp 需要的武器家族（沒寫就是都能用）；sc 出手速度看什麼（spell 智力支撐｜aim 命中支撐｜其餘看攻擊速度）
// basic 基礎技能：不需要天賦球，等級到 lv 就會領悟
export const SKILLS = {
  cleave: { name: '重斬', kind: '近戰', glyph: '斬', color: '#e2725f', wp: 'melee', req: { str: 12 }, cost: { mp: 14 }, cd: 6, cast: 0.56, at: 0.26, dmg: 54, len: 8, w: 2.8, desc: '高舉武器劈下，震裂前方 8 公尺的地面，並打斷沿線野獸的動作。' },
  dash: { name: '疾步斬', kind: '敏捷', glyph: '疾', color: '#8fd08a', wp: 'melee', req: { agi: 12 }, cost: { mp: 12 }, cd: 5, cast: 0.34, at: 0.3, dmg: 34, len: 8.5, w: 2.4, desc: '向前突進 8 公尺，斬過沿途所有野獸；突進途中不會受傷。' },
  wall: { name: '鐵壁', kind: '防禦', glyph: '壁', color: '#e8c25c', req: { end: 18, str: 10 }, cost: { mp: 18 }, cd: 14, cast: 0.3, at: 0.1, dur: 4, cut: 0.7, r: 10, desc: '4 秒內受到的傷害減少 70%，不會被擊退或破防，並把 10 公尺內野獸的注意力拉到自己身上。' },
  blade: { name: '飛刃', kind: '遠程', glyph: '刃', color: '#9fc4e0', sc: 'aim', req: { acc: 15 }, cost: { mp: 10 }, cd: 3, cast: 0.44, at: 0.24, dmg: 27, range: 18, speed: 26, desc: '擲出迴旋的氣刃，貫穿 18 公尺內直線上的野獸。暴擊率加倍。' },
  fire: { name: '火球術', kind: '法術', glyph: '火', color: '#f2a24a', sc: 'spell', req: { int: 12 }, cost: { mp: 16 }, cd: 2.5, cast: 0.5, at: 0.3, dmg: 34, range: 22, speed: 20, r: 3.2, desc: '射出火球，命中後在 3 公尺內爆炸。威力隨智力提高。' },
  heal: { name: '治癒之光', kind: '輔助', glyph: '癒', color: '#7fd6c4', sc: 'spell', req: { int: 18, luk: 8 }, cost: { mp: 30 }, cd: 16, cast: 0.7, at: 0.45, heal: 40, r: 8, desc: '治療自己與 8 公尺內的隊友，恢復 40＋智力×1.5 點生命。' },
  warcry: { name: '戰吼', kind: '輔助', glyph: '吼', color: '#ff8a5c', rare: 1, req: { str: 28, end: 22 }, cost: { mp: 22 }, cd: 20, cast: 0.5, at: 0.2, dur: 8, mul: 1.25, r: 10, desc: '8 秒內，自己與 10 公尺內隊友的傷害提高 25%、體力回復加快。' },
  quake: { name: '震地踏', kind: '防禦', glyph: '震', color: '#c79a5a', rare: 1, req: { end: 28, str: 18 }, cost: { mp: 20 }, cd: 9, cast: 0.6, at: 0.34, dmg: 46, r: 5.6, desc: '重踏地面，震傷 5.5 公尺內所有野獸並打斷牠們的動作。威力隨耐力提高。' },
  blink: { name: '影步', kind: '敏捷', glyph: '影', color: '#a58bd6', rare: 1, req: { agi: 32, acc: 16 }, cost: { mp: 14 }, cd: 8, cast: 0.2, at: 0.08, range: 13, dur: 3, desc: '瞬間移動到前方 13 公尺內目標的背後；3 秒內的下一擊必定暴擊。' },
  // 以下是基礎技能（新增的技能一律加在後面，編號才不會變）
  pierce: { name: '穿刺', kind: '近戰', glyph: '刺', color: '#d9a45f', basic: 1, lv: 2, wp: 'melee', req: {}, cost: { mp: 8 }, cd: 4, cast: 0.46, at: 0.22, dmg: 32, len: 6.2, w: 1.9, lunge: 2.6, desc: '踏步刺出，貫穿前方 6 公尺直線上的野獸。威力隨力量提高。' },
  missile: { name: '魔法飛彈', kind: '法術', glyph: '彈', color: '#8f8be8', basic: 1, lv: 2, sc: 'spell', req: {}, cost: { mp: 9 }, cd: 4, cast: 0.56, at: 0.2, dmg: 12, n: 3, gap: 0.11, range: 21, speed: 16, desc: '連續射出三枚會自己追著目標的飛彈。任何武器都能用，威力隨智力提高。' },
  triple: { name: '三重箭', kind: '弓術', glyph: '矢', color: '#7fb86a', basic: 1, lv: 2, wp: 'bow', sc: 'aim', req: {}, cost: { mp: 10 }, cd: 5, cast: 0.64, at: 0.26, dmg: 16, n: 3, gap: 0.09, range: 24, speed: 46, desc: '一口氣連射三箭。威力隨命中提高。' },
  flurry: { name: '連斬', kind: '近戰', glyph: '連', color: '#e88a6a', basic: 1, lv: 3, wp: 'melee', req: {}, cost: { mp: 12 }, cd: 6, cast: 0.68, at: 0.1, dmg: 12, n: 4, gap: 0.14, range: 3.6, arc: 1.15, desc: '一口氣揮出四刀，掃過前方的扇形範圍，最後一刀最重。威力隨力量提高。' },
  nova: { name: '震退波', kind: '法術', glyph: '波', color: '#6fb5e8', basic: 1, lv: 4, wp: 'staff', sc: 'spell', req: {}, cost: { mp: 14 }, cd: 8, cast: 0.6, at: 0.3, dmg: 26, r: 4.8, desc: '以自己為中心放出魔力震波，震傷並推開 5 公尺內的野獸，打斷牠們的動作。威力隨智力提高。' },
  backshot: { name: '後躍射擊', kind: '弓術', glyph: '躍', color: '#5fae9a', basic: 1, lv: 4, wp: 'bow', sc: 'aim', req: {}, cost: { mp: 10 }, cd: 7, cast: 0.56, at: 0.3, dmg: 32, range: 24, speed: 46, back: 5.5, desc: '向後躍開 5 公尺，在半空射出一箭，打斷目標的動作。躍起時不會受傷。' },
  kick: { name: '破勢踢', kind: '通用', glyph: '踢', color: '#c9b072', basic: 1, lv: 5, req: {}, cost: { mp: 6 }, cd: 6, cast: 0.46, at: 0.2, dmg: 8, range: 2.9, arc: 1.0, desc: '一腳踹開面前的野獸。傷害很低，但能打斷牠的預備動作（霸體的除外）並把牠踢退。任何武器都能用。' }
};
export const SKILL_IDS = Object.keys(SKILLS); SKILL_IDS.forEach((k, i) => { SKILLS[k].id = k; SKILLS[k].i = i; ITEMS['orb_' + k] = { name: '天賦球：' + SKILLS[k].name, glyph: SKILLS[k].glyph, color: SKILLS[k].color, desc: SKILLS[k].desc, orb: k, sell: SKILLS[k].rare ? 120 : 40 }; });
export const BASIC_SKILLS = SKILL_IDS.filter(k => SKILLS[k].basic);
export const ORB_DROP = 0.012;                      // 一般野獸掉落天賦球的機率（會乘上幸運）
export const STARTER_ORBS = ['cleave', 'dash', 'fire'];
export const reqText = req => Object.keys(req).map(k => STATS[k].name + ' ' + req[k]).join('、');
export const meetsReq = (req, st) => Object.keys(req).every(k => st[k] >= req[k]);
// 這個技能現在拿的武器能不能用
export const skillFits = (S, set) => !S.wp || S.wp === famOf(set);

/* ============================== 任務 ============================== */
// 任務內容在 story.js（QUESTS、NPCS、PLACES）；這裡只放難度評級與任務類型的顯示設定
export const RATINGS = [
  { name: '教學', color: '#a9bccb', ink: '#17202a' }, { name: '簡易', color: '#8fd08a', ink: '#12240f' }, { name: '普通', color: '#e8c25c', ink: '#2a2008' },
  { name: '困難', color: '#f08a4b', ink: '#2a1206' }, { name: '極限', color: '#e0524a', ink: '#fff1ea' }
];
export const QTYPES = { main: '主線', side: '支線', hidden: '隱藏' };
// 各區域的代表位置（指引的方向標用）
export const ZONE_AT = { town: [0, 0], meadow: [8, 120], forest: [-150, 10], canyon: [150, -50], lair: [0, -190], bend: [30, 276], oldwood: [-282, 40], quarry: [292, 20], wings: [0, -262], /* ↓ 0.8 新區（各區方位的中線、A 圈半徑 445；北境照角落；初值，X1 定地點後可改） */ southlake: [-40, 410], edgewood: [-286, 341], giantwood: [-443, 39], marshwood: [-330, -300], floodpen: [-150, -410], backhill: [40, -470], orecliff: [270, -330], saltflat: [445, 0], redslope: [292, 336], frostwood: [-460, -460], northrim: [0, -572], gatehigh: [400, -444], oldroad: [490, -479] };      /* 0.8（X0b）：新區改到走得到的地方 */
