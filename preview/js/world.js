// 世界：繪圖設定、日夜、地形、草、樹石、城鎮與競技場、巢穴、碰撞
import * as THREE from './three.bundle.js';
import { buildTreeProtos, SP, SP_NAMES } from './trees08.js';      /* 0.8（art-tree）：五種樹（松、杉、橡、白樺、枯樹） */
import { GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, GTAOPass, OutputPass, ShaderPass } from './three.bundle.js';
import { TAU, clamp, lerp, damp, smooth, rng, vnoise, fbm, WORLD, GATES, CORRIDORS, PONDS, LAIR_GATE, WATER, pondLevel, waterLevel, corrDist, roadDist, sectors, height, zoneAt, gameHour, wallness, rimMask, ridgeW, RIDGE_BLOCK, baseZone, solidAt, lakeInfo, lakeProbe, lakeDist, LAKE_PAD, BRIDGES, PEN, QUARRY, HILLS, trailDist, edgeAt, outside06, rimMaskX } from './core.js';      /* 0.8（X0a）：edgeAt 到邊界的距離、outside06 在不在 0.6 格網外 */
import { ground08, rock08, nw08, wall08, zone08, outerSd } from './land08.js';      /* X12：outerSd 給世界外隔點算 */      /* 0.8（X0b）：新地形的地面、崖 */
import { CAMPS, GROVE, clear06, PADS06, GATHER_SITES } from './places06.js';
import { PADS07 } from './places07.js';      // 0.7：陷阱腳下不長草（w7-wild）
const CAMP_PADS = [[-106.5, -11.5, 8.0], [-112.5, -6.0, 5.0], [-116.5, -9.5, 4.0], [-112.0, -17.5, 4.5], [-116.5, -16.5, 3.2], [-104.5, -21.5, 3.5], [-100.6, -5.0, 3.6], [-107.5, -3.5, 3.4]];      // 使用者要整片營地土：營火為中心的大圈＋各處再一圈，彼此重疊成一片（邊緣照雜訊不規則），在地面顏色那段處理      // fix07-camp：獵人營地放大，帳篷、工作區、處理獵物的區、靶子腳下的泥地
const PADS_ALL = PADS06.concat(PADS07);      // 獵人營地的土另外處理（見地面顏色那段 CAMP_PADS），要像踩實的大路，不是只把草染黃
export const W = { renderer: null, scene: null, camera: null, composer: null, quality: 'high', hour: 12, night: 0, models: {}, time: 0, W: 1, H: 1, tri8: { value: typeof globalThis !== 'undefined' && globalThis.__tri08 === 0 ? 0 : 1 } };      /* X12：tri8＝崖壁三向貼圖、陡坡樹石規則（載入前設 globalThis.__tri08 = 0 關掉；著色器部分可即時切 W.tri8.value） */
const cS = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const G = WORLD.GRID, SIZE = WORLD.SIZE, CELL = SIZE / G, N1 = G + 1;
const heights = new Float32Array(N1 * N1), blockedGrid = new Uint8Array(N1 * N1), blocked06 = new Uint8Array(N1 * N1) /* 0.8：照 0.6 的世界算的阻擋 */, climbG = new Float32Array(N1 * N1).fill(0.94);      // climbG：每個格點能爬的最陡（坡度）
export const mapRGB = new Uint8Array(N1 * N1 * 3);          // 小地圖用的顏色

// 地面的高度（只看地形）
/* 0.8（X0a）：舊格網（0.6 的 544 格）在新格網裡偏移 O06 格。位置換算一律照 0.6 的原點（S06）與格距（C06）算、再加偏移：
   新舊格距在 JavaScript 裡差最後一位（761.6/544 和 1232/880），直接用新的算，舊範圍內插出來的高度會差 1e-14 公尺；這樣算則一個位元都不差 */
const O06 = (G - WORLD.GRID06) / 2, S06 = WORLD.SIZE06 / 2, C06 = WORLD.SIZE06 / WORLD.GRID06;
function groundH(x, z) {
  const fx = clamp((x + S06) / C06, -O06, G - O06 - 0.001), fz = clamp((z + S06) / C06, -O06, G - O06 - 0.001), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = (iz + O06) * N1 + ix + O06;
  return lerp(lerp(heights[i], heights[i + 1], tx), lerp(heights[i + N1], heights[i + N1 + 1], tx), tz);
}
// 0.6：橋面也是可以站的地面。橋面範圍內回傳橋面的高度（兩端接岸、中間微微拱起），所以人、野獸、特效都走在橋上，水照樣從橋下流過；橋的兩側有欄杆的碰撞，不會從側面掉下去或鑽進橋下
const decks = [];
export function Hgt(x, z) {
  const g = groundH(x, z);
  for (let k = 0; k < decks.length; k++) { const d = decks[k], dx = x - d.x, dz = z - d.z; if (dx * dx + dz * dz > d.R2) continue; const u = dx * d.c + dz * d.s, v = dz * d.c - dx * d.s; if (u > -d.hl && u < d.hl && v > -d.hw && v < d.hw) { const t = u / d.hl; return Math.max(g, d.y0 + (d.y1 - d.y0) * (t * 0.5 + 0.5) + d.arch * (1 - t * t)); } }
  return g;
}
export const deckAt = (x, z) => { for (const d of decks) { const dx = x - d.x, dz = z - d.z, u = dx * d.c + dz * d.s, v = dz * d.c - dx * d.s; if (u > -d.hl && u < d.hl && v > -d.hw && v < d.hw) return d; } return null; };
// 橋面的判定寬度比看得到的橋面每邊多 1.2 公尺（那一段被欄杆的碰撞擋住，站不到）：否則貼著欄杆走時，量坡度的取樣點會落到橋外的河床上，被當成站在陡坡上往下滑
function planDecks() { for (const b of BRIDGES) { const c = Math.cos(b.rot), s = Math.sin(b.rot), hl = b.len / 2, y0 = groundH(b.x - c * hl, b.z - s * hl) + 0.1; decks.push({ id: b.id, x: b.x, z: b.z, c, s, hl, hw: b.w / 2 + 1.2, arch: b.arch, R2: (hl + b.w + 2) * (hl + b.w + 2), y0, y1: b.flat ? y0 : groundH(b.x + c * hl, b.z + s * hl) + 0.1 }); } }
export function blockedAt(x, z) { const ix = Math.round((x + S06) / C06) + O06, iz = Math.round((z + S06) / C06) + O06; if (ix < 0 || iz < 0 || ix > G || iz > G) return true; return blockedGrid[iz * N1 + ix] === 1; }      /* 0.8：格點照 0.6 的原點與格距找，再加偏移 */
/* 0.8（X0a）：「0.6 的世界」能不能走（邊界固定是 0.6 那一圈）。0.6 外環的樹石照它重現，邊界山打開以後位置也不會跑掉 */
const blocked06At = (x, z) => { const ix = Math.round((x + S06) / C06) + O06, iz = Math.round((z + S06) / C06) + O06; if (ix < 0 || iz < 0 || ix > G || iz > G) return true; return blocked06[iz * N1 + ix] === 1; };

/* ---------- 靜態碰撞 ---------- */
const HASH = 10, grid = new Map(), boxes = [], TR = WORLD.TOWN_R;
const key = (cx, cz) => cx * 4096 + cz;
export function addCollider(x, z, r, h = 2.5) { const c = { x, z, r, h }, k = key(Math.floor(x / HASH), Math.floor(z / HASH)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(c); return c; }
// 方形碰撞（建築用）：中心、半寬、半深、朝向（同 rotation.y）、高度
export function addBox(x, z, hw, hd, rot = 0, h = 6) { const b = { x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), h, y: Hgt(x, z), R: Math.hypot(hw, hd) }; boxes.push(b); return b; }
export const debugColliders = () => ({ boxes: boxes, circles: [...grid.values()].flat() });
export function removeCollider(c) { const l = grid.get(key(Math.floor(c.x / HASH), Math.floor(c.z / HASH))); if (l) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); } } /* 0.8 X3b：猩猩丟的石頭留 6 秒就拿掉 */
const angDeg = (x, z) => (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;
const nearGate = (a, tol) => GATES.some(g => { const d = Math.abs(((a - g + 540) % 360) - 180); return d < tol; });
const polar = (deg, r) => [Math.sin(deg * Math.PI / 180) * r, -Math.cos(deg * Math.PI / 180) * r];
// 城牆是正二十邊形：換算成「所在那一段牆」的座標（along 沿半徑往外、lat 沿牆面），碰撞與鏡頭才貼得住模型
const WSEG = 20, WSTEP = 360 / WSEG, ARENA_GAP = 10.3, WALL = { in: 2.1, out: 1.97, gateIn: 2.7, eave: 2.75, door: 3.0, top: 6.9, gateTop: 8.7, doorTop: 4.45 };
const wl = { along: 0, lat: 0, gate: false, ux: 0, uz: 0 };
function wallLocal(x, z) { const i = Math.round(angDeg(x, z) / WSTEP) % WSEG, ca = i * WSTEP * Math.PI / 180; wl.ux = Math.sin(ca); wl.uz = -Math.cos(ca); wl.along = x * wl.ux + z * wl.uz; wl.lat = z * wl.ux - x * wl.uz; wl.gate = GATES.indexOf(i * WSTEP) >= 0; return wl; }
export function collide(o, rad) {
  const cx = Math.floor(o.x / HASH), cz = Math.floor(o.z / HASH);
  for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) { const l = grid.get(key(ix, iz)); if (!l) continue; for (const c of l) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad; if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } } }
  for (const b of boxes) {
    const dx = o.x - b.x, dz = o.z - b.z; if (dx * dx + dz * dz > (b.R + rad) * (b.R + rad)) continue;
    let lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; const qx = clamp(lx, -b.hw, b.hw), qz = clamp(lz, -b.hd, b.hd), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-8) { const k = rad / Math.sqrt(d2); lx = qx + ex * k; lz = qz + ez * k; }
    else if (b.hw - Math.abs(lx) < b.hd - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * (b.hw + rad); else lz = (lz < 0 ? -1 : 1) * (b.hd + rad);
    o.x = b.x + lx * b.c + lz * b.s; o.z = b.z - lx * b.s + lz * b.c;
  }
  const r = Math.hypot(o.x, o.z);
  if (r > TR - 6 && r < TR + 6) {
    const w = wallLocal(o.x, o.z), m = rad * 0.8, d = TR - w.along, din = (w.gate ? WALL.gateIn : WALL.in) + m, dout = -WALL.out - m;
    if (d < din && d > dout) {
      const al = Math.abs(w.lat), gw = WALL.door - m; let lat = w.lat, dd = d;
      if (!(w.gate && al < gw)) {                                              // 門洞裡可以通行
        if (w.gate && al - gw < Math.min(din - d, d - dout)) lat = (lat < 0 ? -1 : 1) * gw;      // 貼著門柱側面：往門洞中間推
        else dd = din - d < d - dout ? din : dout;
        const along = TR - dd; o.x = along * w.ux - lat * w.uz; o.z = along * w.uz + lat * w.ux;
      }
    }
  } else if (r > WORLD.ARENA_IN - rad * 0.3 && r < WORLD.ARENA_OUT + rad * 0.3) {
    const a = angDeg(o.x, o.z), ga = Math.round(a / 90) * 90, dl = ((a - ga + 540) % 360) - 180, tol = ARENA_GAP - Math.asin(Math.min(0.9, rad * 0.8 / r)) * 180 / Math.PI;
    if (Math.abs(dl) > tol) {
      const rin = WORLD.ARENA_IN - rad * 0.3, rout = WORLD.ARENA_OUT + rad * 0.3;
      if ((Math.abs(dl) - tol) * Math.PI / 180 * r < Math.min(r - rin, rout - r)) { const na = (ga + (dl < 0 ? -tol : tol)) * Math.PI / 180; o.x = Math.sin(na) * r; o.z = -Math.cos(na) * r; }    // 入口通道裡：沿側牆滑動，不會被彈到場內外
      else { const t = (r - rin < rout - r ? rin : rout) / (r || 1); o.x *= t; o.z *= t; }
    }
  }
}
// 鏡頭遮擋：從 a（角色頭部）往 b（理想鏡頭位置）取樣，回傳沒有被擋住的比例（0–1）
const arenaTop = r => r < 9.7 ? 0 : r < 10.9 ? 1.5 : r < 12.1 ? 2.6 : r < 13.4 ? 3.7 : r < 14.7 ? 4.9 : r < 17.2 ? 7.4 : 0;
function sightHit(x, y, z) {
  const g = Hgt(x, z); if (y < g + 0.35) return true;
  const cx = Math.floor(x / HASH), cz = Math.floor(z / HASH);
  // 細的東西（路燈、木桶）不擋鏡頭，否則鏡頭一掃過就被吸到角色身上
  for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) { const l = grid.get(key(ix, iz)); if (l) for (const c of l) if (c.h > 0 && c.r >= 1 && y < g + c.h && (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return true; }
  for (const b of boxes) { if (y > b.y + b.h) continue; const dx = x - b.x, dz = z - b.z; if (Math.abs(dx * b.c - dz * b.s) < b.hw + 0.2 && Math.abs(dx * b.s + dz * b.c) < b.hd + 0.2) return true; }
  const r = Math.hypot(x, z);
  if (r > TR - 6 && r < TR + 6) {
    const w = wallLocal(x, z), d = TR - w.along, al = Math.abs(w.lat), yy = y - g;
    if (d < (w.gate ? WALL.gateIn : WALL.in) + 0.3 && d > -WALL.out - 0.3) { if (!w.gate) return yy < WALL.top + 0.4; if (yy < (al < 3.6 ? WALL.gateTop : WALL.top) + 0.4 && !(al < WALL.door - 0.5 && yy < WALL.doorTop)) return true; }
    else if (d <= -WALL.out - 0.3 && d > -WALL.eave - 0.3 && yy > 3.3 && yy < WALL.top) return true;      // 外側的木造挑簷
  } else if (r > 9.7 && r < 17.2 && y < Hgt(0, 0) + arenaTop(r)) {
    const a = angDeg(x, z), dl = Math.abs(((a - Math.round(a / 90) * 90 + 540) % 360) - 180) * Math.PI / 180;
    if (r * (Math.sin(ARENA_GAP * Math.PI / 180) - Math.sin(dl)) < 0.45) return true;
  }
  return false;
}
export function sightClear(ax, ay, az, bx, by, bz) {
  const N = 18, dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 2; i <= N; i++) {
    if (!sightHit(ax + dx * i / N, ay + dy * i / N, az + dz * i / N)) continue;
    // 找到擋住的那一格後再二分細找，回傳值才會連續，鏡頭不會一格一格跳
    let lo = (i - 1) / N, hi = i / N;
    for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (sightHit(ax + dx * m, ay + dy * m, az + dz * m)) hi = m; else lo = m; }
    return Math.max(0.08, lo - 0.2 / N);
  }
  return 1;
}
// 坡度（升高 ÷ 水平距離）。0.6 第二波：長草、泥土的山坡都爬得上去，只是越陡越慢；岩壁、峭壁腳下、地圖邊界的山照舊擋住。
// 每個格點有一個「能爬的最陡」climb（地形建好時算好，見 buildTerrain 的 climbG）：軟地 SLOPE.climb（56°），岩質 SLOPE.hard（41°）。
// 往上走的速度：坡度 ease 以下全速，到 climb 剩 slow（約四成五）；超過 climb 再陡 band 就完全上不去（往上的分量削光，只能橫著走或往下）。
// slide：比這更陡才站不住往下滑（game.js 用）；要比軟地能爬的上限再陡一點，爬坡時才不會一邊爬一邊滑、卡住抖動。
// walk：舊名稱保留（＝岩質的坡最多爬到這裡），給還在讀它的程式與測試用
export const SLOPE = { ease: 0.36, climb: 1.5, hard: 0.87, band: 0.1, slow: 0.45, walk: 0.94, slide: 1.65 };
const slp = { x: 0, z: 0, s: 0 };
export function slopeAt(x, z) { const e = 0.7; slp.x = (Hgt(x + e, z) - Hgt(x - e, z)) / (2 * e); slp.z = (Hgt(x, z + e) - Hgt(x, z - e)) / (2 * e); slp.s = Math.hypot(slp.x, slp.z); return slp; }
// 水深（沒有水的地方是很大的負值）
export const waterDepth = (x, z) => waterLevel(x, z) - Hgt(x, z);
// 這個位置能爬的最陡（格點之間內插）
export function climbAt(x, z) {
  const fx = clamp((x + SIZE / 2) / CELL, 0, G - 0.001), fz = clamp((z + SIZE / 2) / CELL, 0, G - 0.001), ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * N1 + ix;
  return lerp(lerp(climbG[i], climbG[i + 1], tx), lerp(climbG[i + N1], climbG[i + N1 + 1], tx), tz);
}
// 往上爬的速度倍率（坡度 s、這裡能爬的最陡 L）
function climbF(s, L) { if (s <= SLOPE.ease) return 1; if (s <= L) return 1 - (1 - SLOPE.slow) * smooth(SLOPE.ease, L, s); return SLOPE.slow * (1 - smooth(L, L + SLOPE.band, s)); }
// 從 (x,z) 移動到 (nx,nz) 的速度倍率（往上坡才會變慢；給怪物用，玩家在 tryMove 裡已經算了）
export function slopeK(x, z, nx, nz) { const g = slopeAt(nx, nz); if (g.s <= SLOPE.ease) return 1; const mx = nx - x, mz = nz - z, ml = Math.hypot(mx, mz); if (ml < 1e-6) return 1; const up = (mx * g.x + mz * g.z) / (g.s * ml); return up > 0 ? 1 - up * (1 - climbF(g.s, climbAt(nx, nz))) : 1; }
// 怪物從 (x,z) 走到 (nx,nz) 會不會被擋：地形、往上爬太陡的坡（和玩家同一套：玩家爬得上去的地方，追過來的野獸也跟得上去）、走進深水都不行
export function monBlocked(x, z, nx, nz) { if (blockedAt(nx, nz) || waterDepth(nx, nz) > WATER.mon) return true; const s = slopeAt(nx, nz).s; return s > SLOPE.hard && s > climbAt(nx, nz) + SLOPE.band * 0.7 && Hgt(nx, nz) > Hgt(x, z) + 0.01; }
// 嘗試移動：往上坡變慢、太陡上不去（只能橫著走或往下），地形擋住時沿可行的軸滑動。
// 移動後寫入 o.climb（0＝平地、下坡或沒在往上走，1＝正往能爬的最陡處爬；擋住爬不上去時回到 0）與 o.climbDir（坡面往上的方位，同角色面向：0 朝 +z、π/2 朝 +x）
export function tryMove(o, nx, nz, rad) {
  const g = slopeAt(nx, nz), mx = nx - o.x, mz = nz - o.z, ml = Math.hypot(mx, mz); let c = 0;
  if (g.s > 0.15) { o.climbDir = Math.atan2(g.x, g.z); const up = ml > 1e-6 ? (mx * g.x + mz * g.z) / g.s : 0;
    if (up > 0) { const L = climbAt(nx, nz), f = climbF(g.s, L); if (f < 1) { const k = up * (1 - f) / g.s; nx -= g.x * k; nz -= g.z * k; } c = clamp((g.s - 0.15) / (L - 0.15), 0, 1) * (up / ml) * smooth(0, 0.25, f); } }
  o.climb = c;
  if (!blockedAt(nx, nz)) { o.x = nx; o.z = nz; } else if (!blockedAt(nx, o.z)) o.x = nx; else if (!blockedAt(o.x, nz)) o.z = nz;
  collide(o, rad);
}

/* ---------- 載入 ---------- */
const gltfLoader = new GLTFLoader(), texLoader = new THREE.TextureLoader();
// 模型以 base64 包在 JSON 裡（平台不提供 .glb 這類副檔名），取回後直接在記憶體中解析
const b64buf = s => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
export async function loadPack(url, path) {
  const r = await fetch(url); if (!r.ok) throw new Error('讀不到 ' + url + '（' + r.status + '）');
  const j = await r.json(), out = {};
  await Promise.all(Object.keys(j).map(k => new Promise((res, rej) => gltfLoader.parse(b64buf(j[k]), path, g => { out[k] = g; res(); }, e => rej(new Error(k + '：' + (e && e.message || e)))))));
  return out;
}
const loadTex = (url, srgb) => new Promise((res, rej) => texLoader.load(url, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; res(t); }, undefined, rej));
let atlas = null;      // 所有建築與樹石共用同一張貼圖，只留一份
function prep(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material && o.material.map) { if (!atlas) atlas = o.material.map; else o.material.map = atlas; } if (o.material && 'roughness' in o.material) { o.material.roughness = Math.max(o.material.roughness, 0.8); o.material.metalness = Math.min(o.material.metalness, 0.1); } } }); return obj; }
function fitHeight(obj, target) { const b = new THREE.Box3().setFromObject(obj); obj.scale.multiplyScalar(target / (b.max.y - b.min.y)); return obj; }
function place(obj, x, z, ry = 0, sink = 0) { obj.position.set(x, 0, z); obj.rotation.y = ry; obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); obj.position.y = Hgt(x, z) - b.min.y - sink; W.scene.add(obj); return obj; }

/* ---------- 日夜 ---------- */
const KEYS = [   // 時, 日光色, 日光強度, 天光, 地光, 環境強度, 霧色, 霧濃度, 天頂, 地平線, 曝光, 補光強度
  [0, [0.56, 0.66, 1.0], 1.05, [0.30, 0.38, 0.66], [0.15, 0.17, 0.26], 1.4, [0.14, 0.18, 0.30], 0.0062, [0.03, 0.05, 0.13], [0.11, 0.15, 0.28], 1.0, 0.45],
  [4.6, [0.56, 0.66, 1.0], 1.05, [0.30, 0.38, 0.66], [0.15, 0.17, 0.26], 1.4, [0.14, 0.18, 0.30], 0.0062, [0.03, 0.05, 0.13], [0.11, 0.15, 0.28], 1.0, 0.45],
  [6, [1, 0.64, 0.44], 2.1, [0.76, 0.74, 0.88], [0.40, 0.34, 0.30], 1.35, [0.93, 0.72, 0.62], 0.0062, [0.34, 0.45, 0.76], [1.0, 0.74, 0.58], 0.92, 0.5],
  [8, [1, 0.96, 0.88], 2.85, [0.72, 0.84, 1.0], [0.50, 0.47, 0.36], 1.62, [0.74, 0.84, 0.93], 0.0042, [0.22, 0.46, 0.86], [0.72, 0.86, 0.98], 0.9, 0.62],
  [15.5, [1, 0.96, 0.88], 2.85, [0.72, 0.84, 1.0], [0.50, 0.47, 0.36], 1.62, [0.74, 0.84, 0.93], 0.0042, [0.22, 0.46, 0.86], [0.72, 0.86, 0.98], 0.9, 0.62],
  [17.6, [1, 0.76, 0.5], 2.7, [0.80, 0.82, 0.98], [0.48, 0.42, 0.30], 1.5, [0.95, 0.77, 0.57], 0.0058, [0.30, 0.40, 0.72], [1.0, 0.72, 0.47], 0.92, 0.58],
  [19.2, [0.92, 0.52, 0.46], 1.3, [0.48, 0.47, 0.72], [0.26, 0.24, 0.28], 1.3, [0.44, 0.37, 0.52], 0.0064, [0.08, 0.10, 0.27], [0.56, 0.37, 0.43], 0.96, 0.45],
  [20.4, [0.56, 0.66, 1.0], 1.05, [0.30, 0.38, 0.66], [0.15, 0.17, 0.26], 1.4, [0.14, 0.18, 0.30], 0.0062, [0.03, 0.05, 0.13], [0.11, 0.15, 0.28], 1.0, 0.45],
  [24, [0.56, 0.66, 1.0], 1.05, [0.30, 0.38, 0.66], [0.15, 0.17, 0.26], 1.4, [0.14, 0.18, 0.30], 0.0062, [0.03, 0.05, 0.13], [0.11, 0.15, 0.28], 1.0, 0.45]
];
const env = { sun: null, fill: null, fdir: new THREE.Vector3(), hemi: null, sky: null, stars: null, dir: new THREE.Vector3(-0.6, 0.6, 0.4).normalize(), tmpA: new THREE.Color(), tmpB: new THREE.Color() };
function mixKey(h) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = smooth(a[0], b[0], h), out = [];
  for (let k = 1; k < a.length; k++) out.push(Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t));
  return out;
}
// 捏角色時固定用白天的光線
export const nowHour = () => W.forceHour != null ? W.forceHour : typeof window.__hour === 'number' ? window.__hour : gameHour();
export function setForceHour(h) { W.forceHour = h; applyTime(nowHour()); }
// d8-art-rain（0.8 雨與雷）：k＝雨的濃度 0–1（rain08.js 每幀給）、flash＝雷光 0–1、dir＝閃的方向。wet＝地面濕度（地形與草的著色器用；低畫質給 0）
export const SKY08 = { k: 0, flash: 0, dir: new THREE.Vector3(1, 0.2, 0), wet: { value: 0 }, dirty: false };
function rainMix08(m) {      // 把這個時刻的光線、霧、天色往「陰雨」拉：顏色去飽和、太陽變弱、霧變濃（霧色由原本的霧色推出來，和晴天接得上）
  const k = SKY08.k, gray = (c, s, f) => { const L = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; for (let i = 0; i < 3; i++) c[i] = lerp(c[i], L * [0.94, 0.98, 1.06][i], s) * f; };
  const nt = W.night || 0;      // 夜裡原本就暗（月光＋天光是僅有的亮處），雨再壓下去會看不清：夜裡壓得比白天輕、曝光反而補一點
  gray(m[0], 0.6 * k, 1); m[1] *= 1 - (0.74 - 0.5 * nt) * k; gray(m[2], 0.55 * k, 1 - (0.12 - 0.12 * nt) * k); gray(m[3], 0.4 * k, 1 - (0.25 - 0.2 * nt) * k); m[4] *= 1 - 0.06 * k; m[9] *= 1 + 0.12 * nt * k;
  gray(m[5], 0.72 * k, 1 - 0.2 * k); m[6] *= 1 + 1.15 * k;
  for (let i = 0; i < 3; i++) { m[8][i] = lerp(m[8][i], m[5][i], 0.85 * k); m[7][i] = lerp(m[7][i], m[5][i] * 0.8, 0.8 * k); }
  m[9] *= 1 - 0.06 * k; m[10] *= 1 - 0.35 * k;
}
function applyTime(h) {
  W.hour = h;
  const m8 = mixKey(h); if (SKY08.k > 0.001) rainMix08(m8); SKY08.dirty = false;
  const [sc, si, hs, hg, hi, fc, fd, st, sh, ex, fi] = m8; env.hiB = hi; env.exB = ex;
  env.sun.color.setRGB(sc[0], sc[1], sc[2], THREE.SRGBColorSpace); env.sun.intensity = si;
  env.hemi.color.setRGB(hs[0], hs[1], hs[2], THREE.SRGBColorSpace); env.hemi.groundColor.setRGB(hg[0], hg[1], hg[2], THREE.SRGBColorSpace); env.hemi.intensity = hi;
  W.scene.fog.color.setRGB(fc[0], fc[1], fc[2], THREE.SRGBColorSpace); W.scene.fog.density = fd;
  env.sky.material.uniforms.uTop.value.setRGB(st[0], st[1], st[2], THREE.SRGBColorSpace); env.sky.material.uniforms.uHor.value.setRGB(sh[0], sh[1], sh[2], THREE.SRGBColorSpace);
  W.renderer.toneMappingExposure = ex;
  const day = h > 5.4 && h < 19.6, phi = day ? Math.PI * (h - 5.4) / 14.2 : Math.PI * (((h - 19.6 + 24) % 24) / 9.8);
  env.dir.set(Math.cos(phi) * 0.86, Math.max(0.3, Math.sin(phi) * 0.92), 0.36).normalize();
  // 補光：從太陽的對面、偏北打過來（不投影）。太陽永遠在南邊，沒有它朝北的牆面整天只有一片死黑
  env.fdir.set(-env.dir.x * 0.55, 0.42, -0.72).normalize(); env.fill.color.setRGB(lerp(hs[0], 1, 0.35), lerp(hs[1], 1, 0.35), lerp(hs[2], 1, 0.35), THREE.SRGBColorSpace); env.fill.intensity = fi;
  env.sky.material.uniforms.uSun.value.copy(env.dir); env.sky.material.uniforms.uSunCol.value.copy(env.sun.color).multiplyScalar((day ? 1 : 0.5) * (1 - 0.95 * SKY08.k));      // d8-art-rain：雨天看不到太陽
  W.night = 1 - smooth(5.0, 6.4, h) + smooth(18.9, 20.2, h); W.night = clamp(W.night, 0, 1);
  env.stars.material.opacity = W.night * 0.9 * (1 - SKY08.k);
  waterU.uSky.value.setRGB(lerp(sh[0], st[0], 0.3), lerp(sh[1], st[1], 0.3), lerp(sh[2], st[2], 0.3), THREE.SRGBColorSpace);       // 水面映出的天色
}

/* ---------- 建立 ---------- */
export async function initWorld(canvas, progress) {
  const renderer = W.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__capture });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = W.scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xffffff, 0.005);
  W.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 1400);
  env.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(env.hemi);
  const sun = env.sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 220; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 9; sun.shadow.intensity = 0.55;   /* 11/18 使用者同意：全場景影子變柔變淡 */
  env.fill = new THREE.DirectionalLight(0xffffff, 0.6); env.fill.target = sun.target;
  scene.add(sun, sun.target, env.fill);
  // 天空
  env.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uFlash: { value: new THREE.Vector4(1, 0.2, 0, 0) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec4 uFlash; varying vec3 vDir; void main(){ vec3 d = normalize(vDir); float t = pow(clamp(d.y, 0.0, 1.0), 0.55); vec3 c = mix(uHor, uTop, t); float s = max(dot(d, normalize(uSun)), 0.0); c += uSunCol * (pow(s, 240.0) * 6.0 + pow(s, 9.0) * 0.28); if (uFlash.w > 0.0) { float q = max(dot(d, uFlash.xyz), 0.0); c += vec3(0.78, 0.84, 1.0) * uFlash.w * (0.22 + 2.4 * pow(q, 6.0) + 0.5 * pow(q, 1.5)) * (1.0 - 0.6 * clamp(d.y, 0.0, 1.0)); } gl_FragColor = vec4(c, 1.0); }'
  }));
  env.sky.frustumCulled = false; scene.add(env.sky);
  { const n = 500, p = new Float32Array(n * 3), rs = rng(99); for (let i = 0; i < n; i++) { const a = rs() * TAU, y = 0.12 + rs() * 0.88, rr = Math.sqrt(1 - y * y); p[i * 3] = Math.cos(a) * rr * 1000; p[i * 3 + 1] = y * 1000; p[i * 3 + 2] = Math.sin(a) * rr * 1000; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); env.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); env.stars.frustumCulled = false; scene.add(env.stars); }
  progress(0.08, '載入貼圖');
  const [gCol, gNor, rCol, rNor] = await Promise.all([loadTex('assets/tex/grass_c.jpg', true), loadTex('assets/tex/grass_n.jpg'), loadTex('assets/tex/rock_c.jpg', true), loadTex('assets/tex/rock_n.jpg')]);
  W.tex = { gCol, gNor, rCol, rNor };
  progress(0.16, '載入模型');
  { const pack = await loadPack('assets/models.json', 'assets/'); for (const n in pack) W.models[n] = prep(pack[n].scene); }
  try { const pr = await import('./props06.js'); W.mkFire = pr.makeCampfire; W.mkProp = pr.makeProp; } catch (e) { W.mkFire = null; }      // 0.6：美術的營火模型（檔案還沒合進來時用佔位的火堆）；座位（木樁、倒木）也用美術的
  progress(0.4, '生成地形');
  await new Promise(r => setTimeout(r, 0));
  const T0 = performance.now(); planTown(); buildTerrain(); const T1 = performance.now();
  progress(0.55, '種樹與鋪草');
  await new Promise(r => setTimeout(r, 0));
  const T2 = performance.now(); buildFlora(); const T3 = performance.now(); buildGrass(); buildWater(); W.timing = { terrain: Math.round(T1 - T0), flora: Math.round(T3 - T2) }; W.grid = { G, CELL, N1, chunks: chunks.length, supers: supers.length };
  progress(0.7, '建造城鎮');
  await new Promise(r => setTimeout(r, 0));
  buildTown(); buildLair(); buildPlaces06();
  /* 0.8（X5a）：新地場景・南半（props08b.js）。檔案不在或出錯時照舊開機 */
  try { const pb = await import('./props08b.js'); let c08 = null, t08 = null; try { const pl8 = await import('./places08.js'); c08 = pl8.CAMPS08; t08 = pl8.TREES08; } catch (e) { c08 = null; } W.p08b = pb.buildProps08b({ camps08: c08, scene, Hgt, addCollider, addBox, waterDepth, waterLevel, blockedAt, slopeAt, lakeDist, rockTex: W.tex.rCol, plantTrees: list => { return flora.plant08(list.concat(flora.monkeyList(t08))); }, cull: (o, c, r, detail, lim) => P6.list.push({ o, c, r, detail, lim }), campfire, fitCampfires, W }); } catch (e) { W.p08b = null; console.warn('props08b', e); }
  W.lantern = new THREE.PointLight(cS(1, 0.82, 0.6), 0, 17, 1.8); scene.add(W.lantern);      // 夜裡跟著玩家的微光，免得看不見自己
  buildPost();
  try { W.rain08 = await import('./rain08.js'); W.rain08.initRain08(); } catch (e) { W.rain08 = null; }      // d8-art-rain：雨與雷的畫面（檔案還沒合進來時就是不下雨）
  applyTime(nowHour());
  resize();
  window.addEventListener('resize', resize);
}

/* ---------- 地形 ---------- */
// 0.6：世界變大後地形切成 8×8 塊（每塊 68 格＝95.2 公尺），各自做視錐剔除；每塊有三級粗細（每 1／2／4 格取一點），依離鏡頭的距離切換；2×2 塊都不用最細一級時併成一張大塊來畫。
// 每塊四邊垂一圈裙邊，蓋住粗細不同的兩塊交界的縫。格點位置、三角形切法、貼圖座標都和 0.5a 相同，舊範圍的地面長得一樣
/* 0.8（X0a）：格網 880 格 → 10×10 塊、每塊 88 格（123.2 公尺）。塊的格數要是 4 的倍數（三級粗細）、塊數要是偶數（2×2 併大塊） */
const CH = 88, NCH = G / CH, SKIRT = 12, LOD_D = { high: [200, 400], medium: [160, 320], low: [130, 260] }, chunks = [], supers = [];
let grassMap, grassCol;
function buildTerrain() {
  const n = N1 * N1, col = new Float32Array(n * 3), rock = new Float32Array(n), pave = new Float32Array(n), nrm = new Float32Array(n * 3);
  const gm = new Uint16Array(n * 4), gc = new Uint16Array(n * 4), den = new Float32Array(n), hf = THREE.DataUtils.toHalfFloat;
  const c = new THREE.Color(), t = new THREE.Color();
  const P = { lush: [0.95, 1.35, 0.55], dry: [1.55, 1.5, 0.7], deep: [0.7, 1.1, 0.5], forest: [0.55, 0.92, 0.5], moss: [0.42, 0.78, 0.46], sand: [1.9, 1.42, 0.9], mesa: [1.7, 1.0, 0.6], mesaTop: [1.9, 1.35, 0.85], ash: [0.6, 0.54, 0.5], mount: [0.82, 0.8, 0.8], snow: [2.3, 2.35, 2.5], pave: [1.22, 1.1, 0.94], paveD: [0.98, 0.9, 0.8], arena: [2.5, 2.0, 1.3], road: [1.4, 1.02, 0.68], bed: [0.36, 0.56, 0.58], shore: [1.5, 1.28, 0.92], salt: [4.3, 4.2, 4.05], saltD: [3.1, 2.95, 2.7], pad: [1.25, 1.0, 0.7], cut: [1.72, 1.6, 1.4], mud: [0.74, 0.66, 0.42], frost: [1.9, 2.1, 2.3], trail: [1.18, 0.92, 0.62] };
  const bladeM = cS(0.33, 0.52, 0.2), bladeM2 = cS(0.5, 0.65, 0.24), bladeDry = cS(0.76, 0.7, 0.33), bladeF = cS(0.2, 0.4, 0.2), bladeC = cS(0.74, 0.62, 0.32), bladeL = cS(0.44, 0.4, 0.3), bc = new THREE.Color();
  const MC = { meadow: [112, 154, 76], meadowDry: [150, 152, 84], forest: [62, 104, 62], sand: [201, 164, 110], mesa: [140, 104, 74], ash: [92, 84, 82], mount: [124, 122, 122], pave: [186, 174, 152], arena: [214, 186, 132], road: [196, 168, 122], water: [84, 148, 184], salt: [226, 222, 212], cut: [170, 160, 146], trail: [176, 158, 118], pen: [96, 90, 92] };
  const SALT = HILLS[2], SPRING = lakeInfo().find(b => b.id === 'spring').P[0], MARSH = lakeInfo().findIndex(b => b.id === 'marsh');
  const VX = i => Math.fround((i % N1) * CELL - SIZE / 2), VZ = i => Math.fround(((i / N1) | 0) * CELL - SIZE / 2);      // 和 0.5a 一樣取單精度的格點座標，舊範圍算出來的高度才會一模一樣
  // 0.6：採集片的草調稀、調矮（止血草的花苞、蘑菇要露得出來；麥田幾乎不長草）。thin 0–1，每一片蓋一個圓；範圍很大的片（敲點沿著岩壁散開）改成每一株各蓋一小圈
  const thin = new Float32Array(n), stamp = (x0, z0, rad, k) => { const i0 = Math.max(0, Math.floor((x0 - rad + SIZE / 2) / CELL)), i1 = Math.min(G, Math.ceil((x0 + rad + SIZE / 2) / CELL)), j0 = Math.max(0, Math.floor((z0 - rad + SIZE / 2) / CELL)), j1 = Math.min(G, Math.ceil((z0 + rad + SIZE / 2) / CELL)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = k * smooth(rad, rad - 2.4, Math.hypot(i * CELL - SIZE / 2 - x0, j * CELL - SIZE / 2 - z0)); if (v > thin[j * N1 + i]) thin[j * N1 + i] = v; } };
  for (const q of GATHER_SITES) { const k = q.kind === 'wheat' ? 1 : 0.78; if (q.r <= 12) stamp(q.x, q.z, q.r + 2.2, k); else for (const p of q.pts) stamp(p[0], p[1], 3.4, k); }
  /* 0.8（X0a）：0.6 格網以外的格點＝佔位的山（和 0.6 邊界山同一套高度與顏色，edge＝1 時原本的算法也是這個結果）。X0b 做出新地形後，這一段換成新地的地面 */
  /* 0.8（X0b）：0.6 格網以外的格點＝新地（land08.js 的 ground08：各區的地面、崖、山、路、水邊）。阻擋＝邊界外或崖；崖與山的可爬坡度照岩質 */
  const new08 = i => { const x = VX(i), z = VZ(i), h = height(x, z); heights[i] = h; const g = ground08(x, z, h, waterLevel(x, z) - h); col[i * 3] = g.c[0]; col[i * 3 + 1] = g.c[1]; col[i * 3 + 2] = g.c[2]; rock[i] = g.rock; den[i] = clamp(g.dens, -1, 1);
    blockedGrid[i] = (edgeAt(x, z) < 0 || wall08(x, z) > 0.4) ? 1 : 0; blocked06[i] = 1; climbG[i] = lerp(SLOPE.climb, SLOPE.hard, smooth(0.2, 0.55, g.cliff));
    bc.setRGB(g.blade[0], g.blade[1], g.blade[2], THREE.SRGBColorSpace); gm[i * 4] = hf(h); gm[i * 4 + 2] = hf(g.short); gm[i * 4 + 3] = hf(1); gc[i * 4] = hf(bc.r); gc[i * 4 + 1] = hf(bc.g); gc[i * 4 + 2] = hf(bc.b); gc[i * 4 + 3] = hf(1); mapRGB[i * 3] = g.mc[0]; mapRGB[i * 3 + 1] = g.mc[1]; mapRGB[i * 3 + 2] = g.mc[2]; };
  const far8 = new Uint8Array(n), edge8 = new Int8Array(n);      /* X12：edge8 見下面崖頂崖底；世界外 40 m 以外的奇數格點先跳過，最後用鄰近的偶數格點補 */
  for (let i = 0; i < n; i++) {
    if (outside06(VX(i), VZ(i))) { if ((((i % N1) | ((i / N1) | 0)) & 1) && outerSd(VX(i), VZ(i)) < -40) { far8[i] = 1; continue; } new08(i); continue; }
    const x = VX(i), z = VZ(i), s = sectors(x, z), r = s.r, m = Math.max(s.north, s.east);
    const h = height(x, z); heights[i] = h;
    const cd = m > 0.001 ? corrDist(x, z) : -99, wall = m > 0.001 ? m * smooth(0, 9, cd) : 0, floor = m * (1 - smooth(0, 9, cd));
    const rdg = s.west > 0 ? ridgeW(x, z, s) : 0, edge = Math.max(rimMaskX(x, z, s), smooth(0.06, 0.4, rdg));      /* 0.8（X0b）：rimMaskX 在 336 以內和 rimMask 一樣 */      // 山的比例：新舊邊界的山，加上西邊的石脊
    const n1 = fbm(x * 0.03 + 20, z * 0.03 + 4), n2 = vnoise(x * 0.09 + 3, z * 0.09 + 8);
    const rd = 1 - smooth(1.3, 3.4, roadDist(x, z) + (vnoise(x * 0.5 + 9, z * 0.5) - 0.5) * 1.6);
    const wd = waterLevel(x, z) - h;          // 水深（負值是高出水面多少）
    // 地面顏色
    c.setRGB(...P.lush).lerp(t.setRGB(...P.dry), smooth(0.5, 0.8, n1)).lerp(t.setRGB(...P.deep), smooth(0.55, 0.9, n2) * 0.6);
    let rk = 0, dens = 1, mc = n1 > 0.62 ? MC.meadowDry : MC.meadow;
    bc.copy(bladeM).lerp(bladeM2, n2).lerp(bladeDry, smooth(0.5, 0.82, n1) * 0.8);
    if (s.west > 0) { c.lerp(t.setRGB(...P.forest).lerp(new THREE.Color(...P.moss), n2), s.west); bc.lerp(bladeF, s.west * 0.85); dens = lerp(dens, 0.72, s.west); if (s.west > 0.5) mc = MC.forest; }
    if (floor > 0) { const lair = s.north > s.east; c.lerp(t.setRGB(...(lair ? P.ash : P.sand)), floor); rk = Math.max(rk, floor * (lair ? 0.92 : 1)); dens = lerp(dens, lair ? 0.16 : 0.1, floor); bc.lerp(lair ? bladeL : bladeC, floor); if (floor > 0.5) mc = lair ? MC.ash : MC.sand; }
    if (wall > 0) { const band = 0.84 + 0.22 * Math.sin(h * 1.25 + n2 * 3.0), top = smooth(0.9, 1, wall) * smooth(17, 21, h); t.setRGB(...P.mesa).multiplyScalar(band).lerp(new THREE.Color(...P.mesaTop), top); if (s.north > s.east) t.multiplyScalar(0.72); c.lerp(t, wall); rk = Math.max(rk, wall); dens *= 1 - wall; if (wall > 0.4) mc = s.north > s.east ? MC.mount : MC.mesa; }
    if (edge > 0) { c.lerp(t.setRGB(...P.mount).lerp(new THREE.Color(...P.snow), smooth(29, 33, h)), edge); rk = Math.max(rk, edge); dens *= 1 - edge; if (edge > 0.4) mc = MC.mount; }
    // 0.6 外環的幾種地面：白鹽臺（一片白）、採石場（新鑿開的淺色石面）、霜泉（結霜的一圈）
    if (r > WORLD.R0 - 8) {
      const dq = Math.hypot(x - QUARRY[0], z - QUARRY[1]); if (dq < QUARRY[2]) { const k = smooth(QUARRY[2], QUARRY[2] * 0.62, dq + (n2 - 0.5) * 6); c.lerp(t.setRGB(...P.cut).multiplyScalar(0.9 + 0.2 * Math.sin(h * 1.85)), k * 0.8); rk = Math.max(rk, k); dens *= 1 - k; if (k > 0.5 && wall < 0.4) mc = MC.cut; }
      const dsl = Math.hypot(x - SALT[0], z - SALT[1]); if (dsl < SALT[2] + 6) { const k = smooth(SALT[2] + 2, SALT[2] - 7, dsl + (n2 - 0.5) * 7) * (1 - smooth(0.25, 0.6, wall)); c.lerp(t.setRGB(...P.salt).lerp(new THREE.Color(...P.saltD), smooth(0.45, 0.8, vnoise(x * 0.33 + 4, z * 0.33 + 77))), k * 0.94); rk = lerp(rk, 0.92, k); dens *= 1 - k; if (k > 0.5) mc = MC.salt; }
      const dsp = Math.hypot(x - SPRING[0], z - SPRING[1]); if (dsp < SPRING[2] + 9) { const k = smooth(SPRING[2] + 9, SPRING[2] + 2, dsp + (n2 - 0.5) * 3); c.lerp(t.setRGB(...P.frost), k * 0.8); dens *= 1 - k * 0.8; }
      if (solidAt(x, z)) mc = MC.pen;
    }
    if (r > 60 && x < -85 && x > -135 && z > -40 && z < 15) { let ck = 0; for (const q of CAMP_PADS) { const dq = Math.hypot(x - q[0], z - q[1]); if (dq < q[2] + 4) ck = Math.max(ck, smooth(q[2] + 1.0, q[2] - 1.3, dq + (n2 - 0.5) * 3.6 + (vnoise(x * 0.55 + 4, z * 0.55 + 19) - 0.5) * 1.4)); }
      if (ck > 0) { c.lerp(t.setRGB(...P.road), ck * 0.95); rk = Math.max(rk, ck * 0.9); dens *= 1 - ck; if (ck > 0.5) mc = MC.road; } }      // 獵人營地的整片土：和大路同色同質地，草不長
    if (r > 60) for (const q of PADS_ALL) { if (Math.abs(x - q[0]) >= q[2] + 2 || Math.abs(z - q[1]) >= q[2] + 2) continue; const dq = Math.hypot(x - q[0], z - q[1]); if (dq < q[2] + 2) {      /* X12：先用方框篩（結果相同） */ const k = smooth(q[2] + 1.5, q[2] * 0.5, dq + (n2 - 0.5) * 3); c.lerp(t.setRGB(...P.pad), k * 0.72); rk = Math.max(rk, k * 0.45); dens *= 1 - k * 0.95; } }      // 0.6：營地與地標周圍踩實的泥地（不長草）
    if (rd > 0 && r > WORLD.TOWN_R - 2) { const tr = trailDist(x, z) + 1 < roadDist(x, z) + 0.01 ? 1 : 0;      // 小徑：顏色深一點、沒那麼實
      c.lerp(t.setRGB(...(tr ? P.trail : P.road)), rd * (tr ? 0.8 : 0.92)); rk = Math.max(rk, rd * (tr ? 0.5 : 0.85)); dens *= 1 - rd; if (rd > 0.5) mc = tr ? MC.trail : MC.road; }
    if (r < TR + 6) {
      const w = wallLocal(x, z), spoke = nearGate(angDeg(x, z), 4.5) ? 1 : 0;
      const gp = w.gate ? smooth(4.6, 3.3, Math.abs(w.lat)) * smooth(TR + 5.6, TR + 4.2, w.along) : 0;        // 城門門洞到門外一小段也鋪石板
      const tw = Math.max(smooth(TR + 3, TR - 1, r), gp), ring = 0.5 + 0.5 * Math.sin(r * 1.6);
      if (tw > 0) {
        t.setRGB(...P.pave).lerp(new THREE.Color(...P.paveD), ring * 0.35 + (vnoise(x * 0.8, z * 0.8) - 0.5) * 0.3); if (spoke && r > WORLD.ARENA_OUT) t.multiplyScalar(1.1);
        // 草皮：避開建築、攤位、路燈與人，再加上每棵樹下的一圈
        let garden = 0; if (r > 19 && r < 38 && !spoke) { const cl = townClear(x, z); const gn = (px, pz) => vnoise(px * 0.16 + 60, pz * 0.16 + 9); garden = Math.max(smooth(0.56, 0.66, Math.min(gn(x, z), gn(x + 2.6, z), gn(x - 2.6, z), gn(x, z + 2.6), gn(x, z - 2.6))) * smooth(1.2, 2.6, cl), lawnAt(x, z) * smooth(0.2, 1.0, cl)); }
        if (r < WORLD.ARENA_IN + 0.3) t.setRGB(...P.arena).multiplyScalar(0.92 + vnoise(x * 0.9, z * 0.9) * 0.16);
        if (garden > 0) { c.lerp(new THREE.Color(...P.lush).lerp(new THREE.Color(...P.deep), n2 * 0.5), tw); bc.copy(bladeM).lerp(bladeM2, n2 * 0.7); }
        c.lerp(t, tw * (1 - garden)); rk = Math.max(rk, tw * (1 - garden)); dens = lerp(dens, garden > 0.5 ? 0.9 : -1, tw); if (tw > 0.5) mc = r < WORLD.ARENA_IN ? MC.arena : MC.pave; if (r > WORLD.ARENA_IN + 0.3) pave[i] = tw * (1 - garden);     // 石板上的密度給負值，內插後草才不會長到石板上
      }
    }
    if (wd > -0.7) { const k = smooth(-0.7, -0.05, wd), mud = r > WORLD.R0 && lakeDist(x, z, MARSH) < 5; c.lerp(t.setRGB(...(mud ? P.mud : P.shore)), k * 0.9).lerp(t.setRGB(...P.bed), smooth(0.25, 1.9, wd)); rk = Math.max(rk, k * 0.85); dens = wd > -0.14 ? -1 : dens * (1 - smooth(-0.55, -0.14, wd)); if (wd > 0.05) mc = MC.water; }      // 岸邊一圈濕沙，水下顏色漸深；水裡不長草
    let nwv = 0, G8 = null; if (r > 330.5) { nwv = nw08(x, z); if (nwv > 0) { G8 = ground08(x, z, h, wd); c.lerp(t.setRGB(G8.c[0], G8.c[1], G8.c[2]), nwv); bc.lerp(t.setRGB(G8.blade[0], G8.blade[1], G8.blade[2], THREE.SRGBColorSpace), nwv); rk = lerp(rk, G8.rock, nwv); dens = lerp(dens, G8.dens, nwv); if (nwv >= 0.5) mc = G8.mc; } }      /* 0.8（X0b）：舊邊界那一圈換成新地 */
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; rock[i] = rk;
    blockedGrid[i] = (wall > 0.4 || edgeAt(x, z) < 0 || rdg > RIDGE_BLOCK || solidAt(x, z)) ? 1 : 0;      /* 0.8：邊界問 edgeAt（X0a 和 r > R − 9 相同） */
    blocked06[i] = (wall > 0.4 || r > WORLD.R - 9 || rdg > RIDGE_BLOCK || solidAt(x, z)) ? 1 : 0;      /* 0.8：0.6 的世界（舊樹石用；X0b 開山也不改它） */
    climbG[i] = lerp(SLOPE.climb, SLOPE.hard, Math.max(smooth(0.1, 0.3, wall), smooth(0.12, 0.35, edge), smooth(WORLD.R - 16, WORLD.R - 12, r)));      // 岩壁（峽谷、巢穴的山）、石脊與邊界的山算岩質，其餘（草地、林地、沙地、泥地、河岸）算軟地
    if (thin[i] > 0 && dens > 0) dens *= 1 - 0.62 * thin[i];
    den[i] = clamp(dens, -1, 1); gm[i * 4] = hf(h); gm[i * 4 + 2] = hf(Math.max(s.west, thin[i] * 1.9)); gm[i * 4 + 3] = hf(1);      // 第三個分量是「草矮多少」：森林 1（矮 28%），採集片最多 1.9（矮一半）
    gc[i * 4] = hf(bc.r); gc[i * 4 + 1] = hf(bc.g); gc[i * 4 + 2] = hf(bc.b); gc[i * 4 + 3] = hf(1);
    mapRGB[i * 3] = mc[0]; mapRGB[i * 3 + 1] = mc[1]; mapRGB[i * 3 + 2] = mc[2];
    if (nwv > 0) { climbG[i] = lerp(lerp(SLOPE.climb, SLOPE.hard, Math.max(smooth(0.1, 0.3, wall), smooth(0.12, 0.35, edge))), lerp(SLOPE.climb, SLOPE.hard, smooth(0.2, 0.55, G8.cliff)), nwv); gm[i * 4 + 2] = hf(lerp(Math.max(s.west, thin[i] * 1.9), G8.short, nwv)); if (nwv >= 0.5) blockedGrid[i] = (edgeAt(x, z) < 0 || wall08(x, z) > 0.4 || solidAt(x, z)) ? 1 : 0; }      /* 0.8（X0b） */
  }
  // 陡坡不長草（低角度看，直立在岩壁上的草很假）
  for (let i = 0; i < n; i++) { if (!far8[i]) continue; const ix = i % N1, iz = (i / N1) | 0, nb = ix & 1 && iz & 1 ? [i - N1 - 1, i - N1 + 1, i + N1 - 1, i + N1 + 1] : ix & 1 ? [i - 1, i + 1] : [i - N1, i + N1], k = 1 / nb.length;      /* X12：世界外的奇數格點＝鄰點平均（高度、顏色、岩質、草密度）；其餘照第一個鄰點 */
    let h = 0, rk = 0, dn = 0, c0 = 0, c1 = 0, c2 = 0; for (const j of nb) { h += heights[j] * k; rk += rock[j] * k; dn += den[j] * k; c0 += col[j * 3] * k; c1 += col[j * 3 + 1] * k; c2 += col[j * 3 + 2] * k; }
    const j = nb[0]; heights[i] = h; rock[i] = rk; den[i] = dn; col[i * 3] = c0; col[i * 3 + 1] = c1; col[i * 3 + 2] = c2; blockedGrid[i] = 1; blocked06[i] = 1; climbG[i] = climbG[j];
    gm[i * 4] = hf(h); gm[i * 4 + 2] = gm[j * 4 + 2]; gm[i * 4 + 3] = gm[j * 4 + 3]; for (let q = 0; q < 4; q++) gc[i * 4 + q] = gc[j * 4 + q]; for (let q = 0; q < 3; q++) mapRGB[i * 3 + q] = mapRGB[j * 3 + q]; }
  for (let iz = 1; iz < G; iz++) for (let ix = 1; ix < G; ix++) { const i = iz * N1 + ix, sl = Math.hypot(heights[i + 1] - heights[i - 1], heights[i + N1] - heights[i - N1]) / (2 * CELL); if (sl > 0.5 && den[i] > 0) den[i] *= 1 - smooth(0.5, 0.9, sl); }
  for (let i = 0; i < n; i++) gm[i * 4 + 1] = hf(den[i]);
  // 法線：整張格網一起算（和 computeVertexNormals 一樣以三角形面積加權），塊與塊的交界才不會有明暗接縫
  for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
    const a = iz * N1 + ix, b = a + N1, c2 = b + 1, d = a + 1, hA = heights[a], hB = heights[b], hC = heights[c2], hD = heights[d];
    const x1 = C06 * (hA - hD), z1 = C06 * (hA - hB), x2 = C06 * (hB - hC), z2 = C06 * (hD - hC), y = C06 * C06;      /* 0.8：用 0.6 的格距（同上，舊範圍的法線才一個位元都不差） */
    for (const k of [a, b, d]) { nrm[k * 3] += x1; nrm[k * 3 + 1] += y; nrm[k * 3 + 2] += z1; }
    for (const k of [b, c2, d]) { nrm[k * 3] += x2; nrm[k * 3 + 1] += y; nrm[k * 3 + 2] += z2; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1; nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l; }
  /* X12：崖頂（凸）＋、崖底（凹）−：離 2 格的八個點平均高度比自己低多少（給崖頂草邊、崖底碎石帶；Int8 正規化） */
  for (let iz = 2; iz < G - 1; iz++) for (let ix = 2; ix < G - 1; ix++) { const i = iz * N1 + ix, q = 2 * N1, lap = (heights[i - 2] + heights[i + 2] + heights[i - q] + heights[i + q] + heights[i - q - 2] + heights[i - q + 2] + heights[i + q - 2] + heights[i + q + 2]) / 8 - heights[i], a = Math.abs(lap); edge8[i] = a < 0.25 ? 0 : Math.round(-Math.sign(lap) * Math.min(1, (a - 0.25) / 1.0) * 127); }
  const { gCol, gNor, rCol } = W.tex; gCol.repeat.set(90, 90); gNor.repeat.set(90, 90);
  const mat = new THREE.MeshStandardMaterial({ map: gCol, normalMap: gNor, vertexColors: true, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRockMap = { value: rCol }; sh.uniforms.uPaveMap = { value: cobbleTexture() }; sh.uniforms.uWet = SKY08.wet;
    sh.uniforms.uTri = W.tri8;      /* X12：三向貼圖崖壁的開關（W.tri8.value 0／1，可即時切換） */
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRock; attribute float aPave; attribute float aEdge; varying float vRock; varying float vPave; varying float vEdge; varying vec3 vTP; varying vec3 vTN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vPave = aPave; vEdge = aEdge; vTP = position; vTN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRockMap; uniform sampler2D uPaveMap; uniform float uWet; uniform float uTri; varying float vRock; varying float vPave; varying float vEdge; varying vec3 vTP; varying vec3 vTN; float wetN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)), dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)), dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)))) * 43758.5453); return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y); }')
      .replace('#include <map_fragment>', 'vec4 gT = texture2D(map, vMapUv); vec4 rT = texture2D(uRockMap, vMapUv * 0.31) * 1.25; vec4 pT = texture2D(uPaveMap, vMapUv * 1.3); float rkA = clamp(vRock, 0.0, 1.0), tri8S = 0.0, tri8G = 0.0; vec3 tri8R = vec3(1.0);\nif (uTri > 0.5) { vec3 tn = normalize(vTN); if (tn.y < 0.96) { vec3 bw = pow(abs(tn), vec3(4.0)); bw /= bw.x + bw.y + bw.z; rT = rT * bw.y + (texture2D(uRockMap, vTP.zy * 0.0498) * bw.x + texture2D(uRockMap, vTP.xy * 0.0498) * bw.z) * 1.25; } float top = clamp(vEdge, 0.0, 1.0), bot = clamp(-vEdge, 0.0, 1.0), stp = smoothstep(0.8, 0.7, tn.y), lip = top * smoothstep(0.66, 0.82, tn.y); rkA = max(rkA * (1.0 - lip * 0.8), stp * (1.0 - lip)); if (bot > 0.0) gT = mix(gT, texture2D(uRockMap, vMapUv * 1.7) * 1.3, bot * (1.0 - stp) * 0.8); tri8S = stp * (1.0 - lip); tri8G = bot * (1.0 - stp); tri8R = rT.rgb; }\ndiffuseColor *= mix(mix(gT, rT, rkA), pT, smoothstep(0.35, 0.65, vPave));\nfloat wPud = 0.0; if (uWet > 0.0) { wPud = smoothstep(0.58, 0.72, wetN(vMapUv * 2.3) * 0.7 + wetN(vMapUv * 7.1) * 0.3) * (1.0 - clamp(vRock, 0.0, 1.0)) * uWet; diffuseColor.rgb *= 1.0 - uWet * 0.3 - wPud * 0.25; }')      // d8-art-rain：雨天地面變深，平地上一塊塊積水
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (uTri > 0.5) { float gr8 = smoothstep(0.02, 0.25, vColor.g - max(vColor.r, vColor.b) * 0.9); diffuseColor.rgb = mix(diffuseColor.rgb, tri8R * vec3(0.66, 0.63, 0.6), tri8S * gr8 * 0.75); diffuseColor.rgb = mix(diffuseColor.rgb, tri8R * vec3(0.8, 0.74, 0.64), tri8G * gr8 * 0.55); }\nroughnessFactor = mix(roughnessFactor, 0.62, uWet * 0.7); roughnessFactor = mix(roughnessFactor, 0.34, wPud);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (wPud > 0.0) normal = normalize(mix(normal, nonPerturbedNormal, wPud * 0.9));')      // 積水是平的：拿掉草地法線貼圖的凹凸（否則夜裡跟著角色的燈照上去會一閃一閃）
      .replace('#include <opaque_fragment>', '#ifdef USE_FOG\nif (uWet > 0.0) { float wUp = clamp(dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)), 0.0, 1.0), wFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0); outgoingLight = mix(outgoingLight, fogColor * 1.05, clamp(wFr * (uWet * 0.35 + wPud * 0.9) * smoothstep(0.85, 0.97, wUp), 0.0, 0.85)); }\n#endif\n#include <opaque_fragment>');      // 低角度看濕地映出天色（積水最亮）
  };
  // 分塊。每塊的頂點：格點＋一圈裙邊（邊上的點往下垂 SKIRT 公尺）。同一塊的三級粗細共用同一份頂點與索引，用 drawRange 切換
  const grp = new THREE.Group(); grp.matrixAutoUpdate = false; W.scene.add(grp); W.ground = grp;
  const layout = (cells, strides) => {      // cells：每邊幾格；回傳邊上一圈的頂點編號、索引、各級的範圍
    const V = cells + 1, nv = V * V, ring = [], idx = [], lods = [];
    for (let j = 0; j < cells; j++) ring.push(j);                             // 北邊由西往東
    for (let j = 0; j < cells; j++) ring.push(j * V + cells);                 // 東邊由北往南
    for (let j = 0; j < cells; j++) ring.push(cells * V + cells - j);         // 南邊由東往西
    for (let j = 0; j < cells; j++) ring.push((cells - j) * V);               // 西邊由南往北
    for (const st of strides) {
      const start = idx.length;
      for (let jz = 0; jz < cells; jz += st) for (let jx = 0; jx < cells; jx += st) { const a = jz * V + jx, b = a + st * V, c2 = b + st, d = a + st; idx.push(a, b, d, b, c2, d); }
      for (let q = 0; q < ring.length; q += st) { const q1 = (q + st) % ring.length; idx.push(ring[q], ring[q1], nv + q, ring[q1], nv + q1, nv + q); }      // 裙邊朝外
      lods.push([start, idx.length - start]);
    }
    return { V, nv, ring, lods, index: new THREE.BufferAttribute(new Uint16Array(idx), 1) };
  };
  const piece = (L, ix0, iz0, step) => {      // 從格點 (ix0, iz0) 起、每 step 格取一點
    const tot = L.nv + L.ring.length, Pp = new Float32Array(tot * 3), Nn = new Float32Array(tot * 3), Uv = new Float32Array(tot * 2), Cc = new Float32Array(tot * 3), Rk = new Float32Array(tot), Pv = new Float32Array(tot), Ed = new Int8Array(tot);
    const gi = k => (iz0 + ((k / L.V) | 0) * step) * N1 + ix0 + (k % L.V) * step;
    const put = (k, i, dy) => { const x = VX(i), z = VZ(i); Pp[k * 3] = x; Pp[k * 3 + 1] = heights[i] - dy; Pp[k * 3 + 2] = z; Nn[k * 3] = nrm[i * 3]; Nn[k * 3 + 1] = nrm[i * 3 + 1]; Nn[k * 3 + 2] = nrm[i * 3 + 2]; Uv[k * 2] = (x + 280) / 560; Uv[k * 2 + 1] = 1 - (z + 280) / 560; Cc[k * 3] = col[i * 3]; Cc[k * 3 + 1] = col[i * 3 + 1]; Cc[k * 3 + 2] = col[i * 3 + 2]; Rk[k] = rock[i]; Pv[k] = pave[i]; Ed[k] = edge8[i]; };      // 貼圖座標沿用 0.5a 的原點與比例
    for (let k = 0; k < L.nv; k++) put(k, gi(k), 0);
    for (let q = 0; q < L.ring.length; q++) put(L.nv + q, gi(L.ring[q]), SKIRT);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(Uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); geo.setAttribute('aRock', new THREE.BufferAttribute(Rk, 1)); geo.setAttribute('aPave', new THREE.BufferAttribute(Pv, 1)); geo.setAttribute('aEdge', new THREE.BufferAttribute(Ed, 1, true));
    geo.setIndex(L.index); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; grp.add(mesh); return mesh;
  };
  const LF = layout(CH, [1, 2, 4]);
  for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
    const mesh = piece(LF, cx * CH, cz * CH, 1); mesh.geometry.setDrawRange(LF.lods[2][0], LF.lods[2][1]);
    chunks.push({ mesh, geo: mesh.geometry, lod: 2, lods: LF.lods, x0: cx * CH * CELL - SIZE / 2, x1: (cx + 1) * CH * CELL - SIZE / 2, z0: cz * CH * CELL - SIZE / 2, z1: (cz + 1) * CH * CELL - SIZE / 2 });
  }
  // 大塊：相鄰四塊（2×2）都不需要最細一級時，改畫一張併好的大塊（每 2 格取一點，同樣的索引；它的兩級就是小塊的第 2、3 級），四次繪製變一次
  for (let cz = 0; cz < NCH; cz += 2) for (let cx = 0; cx < NCH; cx += 2) { const mesh = piece(LF, cx * CH, cz * CH, 2); mesh.visible = false; supers.push({ mesh, lod: -1, kids: [cz * NCH + cx, cz * NCH + cx + 1, (cz + 1) * NCH + cx, (cz + 1) * NCH + cx + 1].map(i => chunks[i]) }); }
  const mk = (data) => { const tx = new THREE.DataTexture(data, N1, N1, THREE.RGBAFormat, THREE.HalfFloatType); tx.magFilter = tx.minFilter = THREE.LinearFilter; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.needsUpdate = true; return tx; };
  grassMap = mk(gm); grassCol = mk(gc);
  planDecks();
}
// 依離鏡頭的距離切換每塊地形的粗細（切換點前後留 12 公尺的緩衝，免得在邊界上來回跳）；太遠、已經被霧吃掉的樹石分格整格不畫
function lodWorld() {
  const cp = W.camera.position, [d0, d1] = LOD_D[W.quality] || LOD_D.high, H = 12, k0 = chunks[0];
  for (const k of chunks) {
    const d = Math.hypot(Math.max(k.x0 - cp.x, 0, cp.x - k.x1), Math.max(k.z0 - cp.z, 0, cp.z - k.z1)); let l = k.lod;
    if (l === 0) { if (d > d0 + H) l = d > d1 + H ? 2 : 1; } else if (l === 1) { if (d < d0) l = 0; else if (d > d1 + H) l = 2; } else if (d < d0) l = 0; else if (d < d1) l = 1;
    if (l !== k.lod) { k.lod = l; k.geo.setDrawRange(k.lods[l][0], k.lods[l][1]); }
  }
  for (const q of supers) { const l = Math.min(q.kids[0].lod, q.kids[1].lod, q.kids[2].lod, q.kids[3].lod); if (l === q.lod) continue; q.lod = l; q.mesh.visible = l > 0; for (const k of q.kids) k.mesh.visible = l === 0; if (l > 0) q.mesh.geometry.setDrawRange(k0.lods[l - 1][0], k0.lods[l - 1][1]); }
  const far = 2.05 / W.scene.fog.density;          // 霧把東西吃到剩不到 1.5% 的距離（白天約 490 公尺、晨昏與夜晚約 330 公尺）
  for (const q of flora.cull) q.o.visible = Math.hypot(q.c.x - cp.x, q.c.z - cp.z) - q.r < far;
  const dfar = W.quality === 'high' ? far : W.quality === 'medium' ? 150 : 70;          // 0.6 地標：細碎的零件（蘆葦）中、低畫質只畫近處的
  const pfar = W.quality === 'low' ? Math.min(far, 190) : far; for (const q of P6.list) q.o.visible = Math.hypot(q.c.x - cp.x, q.c.z - cp.z) - q.r < (q.lim ? Math.min(q.lim, q.detail ? dfar : pfar) : (q.detail ? dfar : pfar));
}

/* ---------- 樹與岩石（實例化） ---------- */
// 0.6：樹、石依位置分格（樹每邊 5 格、石每邊 4 格），各格自己做視錐剔除（主畫面與陰影都是）。樹：每格每種一個實例化網格，各格共用同一份頂點；
// 石頭：模型很小（18–71 個三角形），同一格的五種直接併成一個靜態網格，一格只畫一次
const FB = { tree: 5, rock: 4 };
/* 0.8（X0a）：分格照 0.6 的範圍（±380.8）切，格網變大後舊樹石的分組、剔除與繪製次數照舊（範圍外的歸到最邊那一格；新地的樹石由 X5 另外分格） */
const B06 = WORLD.SIZE06, bucket = (x, z, nb) => clamp(Math.floor((x + B06 / 2) / B06 * nb), 0, nb - 1) + nb * clamp(Math.floor((z + B06 / 2) / B06 * nb), 0, nb - 1);
function instProto(model, byWidth) {
  model.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(model), hgt = byWidth ? Math.max(b.max.x - b.min.x, b.max.z - b.min.z) : b.max.y - b.min.y, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const norm = new THREE.Matrix4().makeScale(1 / hgt, 1 / hgt, 1 / hgt).multiply(new THREE.Matrix4().makeTranslation(-cx, -b.min.y, -cz)), parts = [];
  model.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld)); parts.push({ g, mat: o.material }); });
  return { parts, aspect: (b.max.y - b.min.y) / Math.max(b.max.x - b.min.x, b.max.z - b.min.z) };
}
function instMake(proto, count, inject, fade) {
  return proto.parts.map(p => {
    const g = new THREE.BufferGeometry(); for (const k in p.g.attributes) g.setAttribute(k, p.g.attributes[k]); g.setIndex(p.g.index);
    if (fade) { g.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2)); g.setAttribute('aLift', new THREE.InstancedBufferAttribute(new Float32Array(count), 1)); if (proto.morph) g.setAttribute('aVar', new THREE.InstancedBufferAttribute(new Float32Array(count), 1)); }
    const im = new THREE.InstancedMesh(g, p.im || (p.im = inject(p.mat, proto)), count); im.castShadow = true; im.receiveShadow = true; if (fade) im.customDepthMaterial = p.dm || (p.dm = proto.depth ? proto.depth() : treeDepth(proto)); W.scene.add(im); return im;
  });
}
const flora = { trees: [], rocks: [], cull: [], hash: new Map(), dummy: new THREE.Object3D(), stat: {} };
function buildFlora() {
  const rand = rng(20261113), trees = flora.trees, col = new THREE.Color(), R0 = WORLD.R0, R = WORLD.R, [gx, gz] = LAIR_GATE;
  // 0.5a 的阻擋判斷（最近的格點、舊通道、舊邊界）：舊樹石照它重現，位置才會和 0.5a 一模一樣
  const oldBlocked = (x, z) => { const vx = Math.fround(Math.round((x + SIZE / 2) / CELL) * CELL - SIZE / 2), vz = Math.fround(Math.round((z + SIZE / 2) / CELL) * CELL - SIZE / 2); return wallness(vx, vz, 1) > 0.4 || Math.hypot(vx, vz) > R0 - 9; };
  const free = (x, z, pad, old) => { if (old ? oldBlocked(x, z) : blocked06At(x, z)) return false; /* 0.8：外環照 0.6 的世界判斷（亂數消耗順序不變） */ if (Math.hypot(x, z) < WORLD.TOWN_R + 6) return false; if (roadDist(x, z, old ? 1 : '06') < 4 + pad) return false; /* 0.8：外環只看 0.6 的路 */ if (Math.abs(x - gx) < 14 && z < gz + 22 && (old || z > gz - 40)) return false; return true; };
  const hashOK = (x, z, min) => { const cx = Math.floor(x / 12), cz = Math.floor(z / 12); for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) { const l = flora.hash.get(key(ix, iz)); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < min) return false; } return true; };
  // 水裡與水邊、獵人營地（原本有一棵長在帳篷裡）、翻倒的貨車旁的樹不種，但留著佔位（skip），其餘的樹位置才不會跟著變。0.6：舊樹如果落在新開的通道上也不種
  const KEEP_CLEAR = [[-111.2, -14.6, 4.6], [-107, -11.5, 3.6], [158, -30, 4.5], [-108, -8, 3.0]];      // fix07-camp：獵人營地放大，營火與主帳之間那一棵不種（其餘照舊；範圍外的樹位置不變）
  const add = (x, z, s, v, tint, rnd, old) => { const t = { x, z, s, v, rot: rnd() * TAU, tint, fade: 0, fadeT: 0, idx: 0, ims: null, skip: waterDepth(x, z) > -0.45 || KEEP_CLEAR.some(q => Math.hypot(x - q[0], z - q[1]) < q[2]) || (old && (blockedAt(x, z) || roadDist(x, z) < 3.5)) || clear06(x, z) || lakeDist(x, z) < 2.6 }; treeShape(t); trees.push(t); const k = key(Math.floor(x / 12), Math.floor(z / 12)); let l = flora.hash.get(k); if (!l) flora.hash.set(k, l = []); l.push(t); if (!t.skip) addCollider(t.tx, t.tz, t.tr, 0); };
  // 各區種樹的規則（新舊共用）：回傳是否種下
  const plant = (x, z, zone, rnd, old) => {
    const dn = fbm(x * 0.028 + 40, z * 0.028 + 12);
    if (zone === 'forest' && !old && Math.hypot(x - GROVE[0], z - GROVE[1]) < GROVE[2] + (dn - 0.5) * 16) { if (!hashOK(x, z, 12.5)) return; add(x, z, 13.5 + rnd() * 5.5, rnd() < 0.8 ? 0 : 1, [0.6 + rnd() * 0.14, 0.82 + rnd() * 0.12, 0.66 + rnd() * 0.12], rnd, old); }      // 古木林：稀疏的巨木
    else if (zone === 'forest') { if (!hashOK(x, z, 5.6) || (dn < 0.4 && rnd() > 0.25)) return; add(x, z, 6.2 + rnd() * 3.6, rnd() < 0.72 ? 0 : 1, [0.72 + rnd() * 0.2, 0.92 + rnd() * 0.14, 0.8 + rnd() * 0.15], rnd, old); }
    else if (zone === 'meadow') { if (dn < 0.56 || !hashOK(x, z, 7) || rnd() > 0.5) return; const au = rnd() < 0.1; add(x, z, 6 + rnd() * 4, rnd() < 0.45 ? 0 : 1, au ? [1.5, 0.95, 0.5] : [0.95 + rnd() * 0.15, 1.0, 0.9 + rnd() * 0.15], rnd, old); }
    else if (zone === 'canyon') { if (rnd() > 0.045 || !hashOK(x, z, 10)) return; add(x, z, 5 + rnd() * 3, 0, [1.25, 0.72, 0.42], rnd, old); }
    else if (zone === 'lair') { if (rnd() > 0.12 || !hashOK(x, z, 8)) return; add(x, z, 6 + rnd() * 4, 0, [0.5, 0.46, 0.44], rnd, old); }
  };
  let g = 0;
  for (; g < 26000 && trees.length < 1150; g++) {
    const a = rand() * TAU, r = WORLD.TOWN_R + 8 + Math.pow(rand(), 0.75) * (R0 - WORLD.TOWN_R - 14), x = Math.sin(a) * r, z = -Math.cos(a) * r, zone = zoneAt(x, z, false);
    if (!free(x, z, 0, true)) continue;
    plant(x, z, zone, rand, true);
  }
  flora.stat.oldTreeTries = g; flora.stat.oldTrees = trees.length;
  // 城內的幾棵樹
  TOWN_TREES.forEach(([x, z]) => add(x, z, 6, 1, [1, 1.05, 0.95], rand, true));
  // 岩石
  const rocks = flora.rocks;
  const stone = (x, z, zone, rnd, old) => {
    const wl = Math.max(sectors(x, z).north, sectors(x, z).east) > 0.01 ? smooth(0, 9, corrDist(x, z, old ? 1 : '06')) /* 0.8：外環只看 0.6 的通道 */ : 0;
    const cliff = wl > 0.2 && wl < 0.75;
    if (!cliff && (!free(x, z, 0, old) || rnd() > (zone === 'canyon' || zone === 'lair' ? 0.5 : 0.16))) return;
    const s = cliff ? 4 + rnd() * 6 : 0.7 + Math.pow(rnd(), 2.2) * 3.4;
    const tint = zone === 'canyon' ? [2.3, 1.38, 0.8] : zone === 'lair' ? [1.05, 0.98, 0.98] : zone === 'forest' ? [1.25, 1.4, 1.28] : [1.55, 1.46, 1.36];      // 原本的石頭色票太深，背光就是一塊黑
    rocks.push({ x, z, s, v: (rnd() * 5) | 0, rot: rnd() * TAU, tint, sx: 0.85 + rnd() * 0.3, sz: 0.85 + rnd() * 0.3, cliff, skip: waterDepth(x, z) > 0.45 || (old && (cliff ? corrDist(x, z, 2) < 1.5 : s > 1 && roadDist(x, z) < 3.2)) || (!cliff && clear06(x, z)) || (cliff && solidAt(x, z)) || (s > 1 && deckAt(x, z)) });      // 水裡不放石頭（岸邊淺水的留著）；0.6：舊石頭落在新通道裡的不放
  };
  for (g = 0; g < 9000 && rocks.length < 520; g++) {
    const a = rand() * TAU, r = WORLD.TOWN_R + 7 + rand() * (R0 - WORLD.TOWN_R - 4), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    stone(x, z, zoneAt(x, z, false), rand, true);
  }
  flora.stat.oldRockTries = g; flora.stat.oldRocks = rocks.length;
  // 0.6 外環（半徑 241–344）：另一組亂數、同樣的規則與密度；嘗試次數照 0.5a 在外圍的每平方公尺次數換算。河灣低地先空著（之後要挖河道）
  const rb = rng(20261114), ringXZ = () => { const a = rb() * TAU, r = Math.sqrt(lerp((R0 - 9) * (R0 - 9), (R - 6) * (R - 6), rb())); return [Math.sin(a) * r, -Math.cos(a) * r]; };
  const lowland = (x, z) => lakeDist(x, z, '06') < 9; /* 0.8：只看 0.6 的水域 */      // 0.6：長灣、蘆葦澤、鏡溪的岸邊留空
  for (g = 0; g < OUTER.treeTries; g++) { const [x, z] = ringXZ(); if (!free(x, z, 0, false) || lowland(x, z)) continue; plant(x, z, zoneAt(x, z, false), rb, false); }
  for (g = 0; g < OUTER.rockTries; g++) { const [x, z] = ringXZ(); if (lowland(x, z) && rb() > 0.3) continue; stone(x, z, zoneAt(x, z, false), rb, false); }
  flora.stat.trees = trees.length; flora.stat.rocks = rocks.length;
  if (W.tri8.value) for (const t of trees) { if (t.skip) continue; const s0 = slopeAt(t.x, t.z).s; t.hide8 = s0 > 0.577 && (blockedAt(t.x, t.z) || s0 > climbAt(t.x, t.z)); }      /* X12：長在 30 度以上、走不上去的崖面上的舊樹不畫（資料與碰撞照舊：那裡本來就過不去） */
  // 分格實例化
  const group = (list, nb, byV) => { const m = new Map(); for (const o of list) { if (o.skip) continue; const k = (byV ? o.sp * 1000 : 0) + bucket(o.x, o.z, typeof nb === 'function' ? nb(o) : nb); let l = m.get(k); if (!l) m.set(k, l = []); l.push(o); } return m; };
  /* 0.8（art-tree）：五種樹。種類由位置與區域決定（treeLook，不動種樹的亂數與位置、碰撞）；舊的兩種 KayKit 樹只留給 flora.stat 的繪製數（凍結比對）與舊的樹形常數 */
  const TPK = buildTreeProtos(), tp = SP_NAMES.map(k => TPK[k]); flora.tp = tp;
  const oldTp = ['tree_single_A', 'tree_single_B'].map(n => instProto(W.models[n])), lgParts = oldTp.map(q => q.parts.length);
  for (const t of trees) treeLook(t, pickOld(t));
  const nbOf = o => o.sp >= 3 ? 1 : 3;      /* 白樺與枯樹少：格子大一點（3×3），繪製呼叫少一點 */
  const lg = new Set(); for (const o of trees) if (!o.skip) lg.add(o.v * 1000 + bucket(o.x, o.z, FB.tree));      /* 舊分格的組數（flora.stat 照舊） */
  flora.stat.treeMeshes = 0; for (const k of lg) flora.stat.treeMeshes += lgParts[(k / 1000) | 0];
  for (const [k, list] of group(trees, nbOf, true)) fillTreeIms(list, instMake(tp[(k / 1000) | 0], list.length, treeInjectAny, true), col);
  const rp = ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'].map(n => instProto(W.models[n], true)), d = flora.dummy, rockMat = rockInject(rp[0].parts[0].mat), nm = new THREE.Matrix3(), v3 = new THREE.Vector3();
  for (const [, list] of group(rocks, FB.rock, false)) {
    let nV = 0, nI = 0; for (const k2 of list) for (const p of rp[k2.v].parts) { nV += p.g.attributes.position.count; nI += p.g.index.count; }
    const Pp = new Float32Array(nV * 3), Nn = new Float32Array(nV * 3), Uv = new Float32Array(nV * 2), Cc = new Float32Array(nV * 3), Ix = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI); let vo = 0, io = 0;
    for (const k2 of list) {
      const pr = rp[k2.v], asp = Math.max(0.45, pr.aspect), hy = k2.s * (asp / pr.aspect) * (k2.cliff ? 1.2 : 1), sink = Math.min(slopeAt(k2.x, k2.z).s * k2.s * 0.45, hy * pr.aspect * 0.55);
      d.position.set(k2.x, Hgt(k2.x, k2.z) - hy * pr.aspect * 0.12 - sink, k2.z);      // 坡上的石頭往下埋，下坡那一側才不會懸空
      d.rotation.set(0, k2.rot, 0); if (W.tri8.value) { const sp = slopeAt(k2.x, k2.z), tl = Math.min(Math.atan(sp.s) * 0.8, 0.6); if (tl > 0.02) d.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-sp.z, 0, sp.x).normalize(), tl)); }      /* X12：石頭順著坡面傾斜（最多 34 度；位置、大小、碰撞照舊） */
      d.scale.set(k2.s * k2.sx, hy, k2.s * k2.sz); d.updateMatrix(); nm.getNormalMatrix(d.matrix);
      if (k2.s > 1.0) addCollider(k2.x, k2.z, k2.s * 0.5 * (k2.sx + k2.sz) / 2 * (k2.cliff ? 0.72 : 0.86), hy * pr.aspect);
      for (const p of pr.parts) {
        const ga = p.g.attributes, n = ga.position.count, gi = p.g.index.array;
        for (let i = 0; i < n; i++) { v3.fromBufferAttribute(ga.position, i).applyMatrix4(d.matrix).toArray(Pp, (vo + i) * 3); v3.fromBufferAttribute(ga.normal, i).applyMatrix3(nm).normalize().toArray(Nn, (vo + i) * 3); Uv[(vo + i) * 2] = ga.uv.getX(i); Uv[(vo + i) * 2 + 1] = ga.uv.getY(i); Cc[(vo + i) * 3] = k2.tint[0]; Cc[(vo + i) * 3 + 1] = k2.tint[1]; Cc[(vo + i) * 3 + 2] = k2.tint[2]; }
        for (let i = 0; i < gi.length; i++) Ix[io + i] = gi[i] + vo; vo += n; io += gi.length;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(Uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); geo.setIndex(new THREE.BufferAttribute(Ix, 1)); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, rockMat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; W.scene.add(mesh); flora.cull.push({ o: mesh, c: geo.boundingSphere.center, r: geo.boundingSphere.radius });
  }
  flora.stat.rockMeshes = flora.cull.filter(q => !q.o.isInstancedMesh).length; W.treeMeshes08 = flora.cull.filter(q => q.o.isInstancedMesh).length; W.floraStat = flora.stat; W._flora = flora;
  /* 0.8（X5a）：新地的樹（props08b.js 給位置）：同一套樹形、著色器、淡出、碰撞；分格 720 m；不進 flora.trees（舊世界的統計與凍結比對不受影響） */
  flora.plant08 = list => {
    const cell = 720, m = new Map(), out = [];
    for (const o of list) { const t = { x: o.x, z: o.z, s: o.s, v: o.v, rot: o.rot, tint: o.tint, fade: 0, fadeT: 0, idx: 0, ims: null, skip: false, noCol: o.noCol, kind: o.kind, mh: o.h }; treeShape(t); treeLook(t, pickNew(t, o.kind), o.kind === 'monkey' ? 2 : -1); if (o.kind === 'monkey') { t.hv = 1; t.top = t.hv * (tp[2].tree.H * t.s + t.lift); t.y0w = (tp[2].tree.y0 * t.s + t.lift); } out.push(t);
      const gk = t.sp * 1e6 + Math.floor((o.x + 700) / cell) * 1000 + Math.floor((o.z + 700) / cell); let gl = m.get(gk); if (!gl) m.set(gk, gl = []); gl.push(t);
      const hk = key(Math.floor(o.x / 12), Math.floor(o.z / 12)); let hl = flora.hash.get(hk); if (!hl) flora.hash.set(hk, hl = []); hl.push(t); if (!t.noCol) addCollider(t.tx, t.tz, t.tr, 0); }
    for (const [gk, l] of m) fillTreeIms(l, instMake(tp[(gk / 1e6) | 0], l.length, treeInjectAny, true), col);
    return out;
  };
  /* 猴樹（places08 的 TREES08）：大橡樹（高 h），不加碰撞（猴子要走到樹中心 1.2 m 內才爬得上去）；參考圖沒有猴窩，所以不另外設計記號 */
  flora.monkeyList = t08 => (t08 || []).map((q, i) => ({ x: q.x, z: q.z, s: Math.max(5, (q.h - 3.75) / 1.055), v: i % 2, rot: h01(q.x, q.z) * TAU, tint: [1, 1, 1], kind: 'monkey', noCol: true, h: q.h, troop: q.troop }));
}

/* ---------- 0.8（art-tree）：五種樹的分配與外觀 ----------
   種類只由位置、區域（與新地的 kind）決定，用位置算的固定亂數（h01），不動種樹的亂數序列；t.v、位置、大小、碰撞（tx、tz、tr）一律照舊。
   t.sp 種類（SP）、t.hv／t.wv 高度與寬度的個體差（高 ±15%、寬 ±7%）、t.tint2 顯示用的色調（色相 ±15%、亮度 ±8%；舊的 t.tint 不動，凍結比對要用）、
   t.top／t.rb／t.y0w／t.rf／t.ext 給鏡頭遮擋淡出與剔除用（依各種樹的模型尺寸） */
const treeInjectAny = (m, proto) => proto.inject ? proto.inject(m, proto) : treeInject(m, proto);
function treeLook(t, sp, mode) {
  t.sp = sp; const P = flora.tp[sp].tree, h3 = h01(t.x * 0.91 + 2.2, t.z * 1.13 + 4.4), h4 = h01(t.x * 1.7 + 9.1, t.z * 0.63 + 1.9), a = h01(t.x * 2.1 + 1.3, t.z * 1.7 + 9.1), b = h01(t.x * 0.57 + 5.5, t.z * 2.9 + 0.4);
  t.hv = mode === 2 ? 1 : 1 + 0.15 * (h3 * 2 - 1); t.wv = mode === 2 ? 1 : 1 + 0.07 * (h4 * 2 - 1);
  t.top = t.hv * (P.H * t.s + t.lift); t.rb = P.R * t.s * t.wv; t.y0w = (P.y0 * t.s + t.lift) * t.hv; t.rf = P.rf; t.ext = t.lift * t.hv + t.s * 0.3;
  const hue = (a * 2 - 1) * 0.15, br = 1 + (b * 2 - 1) * 0.08, au = false;      /* 參考圖沒有秋色樹：舊的橘色秋樹（t.tint[0] >= 1.4）不再顯示成橘色 */
  t.tint2 = sp === SP.dead ? [br, br * 0.98, br * 0.96] : au && sp === SP.oak ? [1.5 * br, 0.84 * br, 0.42 * br] : au && sp === SP.birch ? [1.25 * br, 1.0 * br, 0.5 * br] : [(1 + hue) * br, br, (1 - hue) * br];
}
function pickOld(t) {
  const h = h01(t.x * 1.31 + 7.7, t.z * 0.77 + 3.3), z = zoneAt(t.x, t.z, false), wet = lakeDist(t.x, t.z) < 16;
  if (t.s > 12) return h < 0.55 ? SP.pine : SP.fir;      /* 古木林的巨木：大松杉 */
  if (z === 'town') return SP.oak;
  if (z === 'canyon') return SP.dead;      /* 峽谷：枯樹 */
  if (z === 'lair') return h < 0.8 ? SP.dead : h < 0.9 ? SP.pine : SP.fir;      /* 北方荒地：枯樹為主，少量松杉 */
  if (z === 'forest') return wet && h < 0.3 ? SP.birch : h < 0.4 ? SP.pine : h < 0.78 ? SP.fir : h < 0.9 ? SP.oak : SP.birch;      /* 林地：松杉為主 */
  return wet && h < 0.3 ? SP.birch : h < 0.6 ? SP.oak : h < 0.68 ? SP.birch : h < 0.84 ? SP.pine : SP.fir;      /* 草原與城郊：多橡樹；溼地邊少量白樺 */
}
function pickNew(t, kind) {
  const h = h01(t.x * 1.31 + 7.7, t.z * 0.77 + 3.3);
  if (!kind) { const z = zoneAt(t.x, t.z); kind = z === 'giantwood' ? 'giant' : z === 'frostwood' || z === 'northrim' || z === 'gatehigh' ? 'frost' : z === 'saltflat' ? 'salt' : z === 'redslope' ? 'dry' : z === 'edgewood' ? 'forest' : z === 'southlake' || z === 'marshwood' ? 'lake' : 'meadow'; }
  switch (kind) {
    case 'monkey': return SP.oak;
    case 'giant': return h < 0.55 ? SP.pine : SP.fir;      /* 巨木林：大松杉 */
    case 'frost': return h < 0.5 ? SP.fir : h < 0.75 ? SP.birch : h < 0.85 ? SP.pine : SP.dead;      /* 霜林：杉與白樺，夾枯樹 */
    case 'salt': return SP.dead;
    case 'dry': return h < 0.85 ? SP.dead : SP.pine;      /* 紅土：少量枯樹 */
    case 'lake': return h < 0.18 ? SP.birch : h < 0.62 ? SP.oak : h < 0.82 ? SP.pine : SP.fir;      /* 南湖濕原：橡樹為主，少量白樺 */
    case 'forest': return h < 0.36 ? SP.pine : h < 0.7 ? SP.fir : h < 0.88 ? SP.oak : SP.birch;
    default: return h < 0.55 ? SP.oak : h < 0.7 ? SP.birch : h < 0.85 ? SP.pine : SP.fir;
  }
}
function fillTreeIms(list, ims, col) {
  let lift = 0;
  list.forEach((t, i) => { t.idx = i; t.ims = ims; setTree(t); lift = Math.max(lift, t.ext); ims.forEach(im => { im.setColorAt(i, col.setRGB(...(t.tint2 || t.tint))); const A = im.geometry.attributes; A.aLift.setX(i, t.lift / t.s); if (A.aVar) A.aVar.setX(i, t.v ? 1 : 0); }); });
  ims.forEach(im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.boundingSphere.radius += lift + 1.5; flora.cull.push({ o: im, c: im.boundingSphere.center, r: im.boundingSphere.radius }); });      // 樹幹加長是在著色器裡做的，外框球要跟著放大，剔除才不會切掉樹梢
}
const OUTER = { treeTries: 21500, rockTries: 2900 };      // 外環的嘗試次數：照 0.5a 外圍（半徑 150–238）每公頃的樹石數量校準
const rockInject = m => { const c = m.clone(); c.vertexColors = true; c.onBeforeCompile = sh => {      // 0.6：石頭併成靜態網格，位置與法線已經烘進頂點、色調放在頂點色
  sh.uniforms.uRockTex = { value: W.tex.rCol };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP; varying vec3 vRN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = mat3(modelMatrix) * normal;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRockTex; varying vec3 vRP; varying vec3 vRN;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec3 bw = pow(abs(normalize(vRN)), vec3(4.0)); bw /= bw.x + bw.y + bw.z; vec3 rt = texture2D(uRockTex, vRP.zy * 0.13).rgb * bw.x + texture2D(uRockTex, vRP.xz * 0.13).rgb * bw.y + texture2D(uRockTex, vRP.xy * 0.13).rgb * bw.z; diffuseColor.rgb *= mix(vec3(1.0), rt * 12.0, 0.6); }');
}; c.customProgramCacheKey = () => 'rock'; return c; };
function setTree(t) {
  const d = flora.dummy;
  d.position.set(t.x, Hgt(t.x, t.z) - 0.12, t.z); d.rotation.set(0, t.rot, 0); const s8 = t.hide8 ? 0 : t.s; d.scale.set(s8 * (t.wv || 1), s8 * (t.hv || 1), s8 * (t.wv || 1)); d.updateMatrix();      /* X12：hide8 縮成 0 */
  t.ims && t.ims.forEach(im => im.setMatrixAt(t.idx, d.matrix));
}
/* 0.6 第二波：樹加高。KayKit 的兩種樹最下層樹冠只在 0.25／0.21 倍樹高，6–10 公尺的樹樹冠離地才 1.2–2.5 公尺，剛好卡在角色的頭與鏡頭的高度。
   作法：樹冠形狀與大小不變，只把樹幹拉長、整個樹冠往上抬，讓最下層樹冠離地 3.5–4 公尺（古木林的巨木照比例抬到 1.7 倍）；樹幹底部加粗、往上收（拉得越長加粗越多），才不會像插在棍子上。
   拉長是在頂點著色器裡做的（每棵樹一個 aLift，模型單位）：低於樹冠底的頂點（樹幹）往上伸展並加粗，其餘（樹冠）整個平移。陰影用同樣變形的深度材質。三角形數不變。 */
const TREE = { yb: [0.245, 0.2], rb: [0.252, 0.297], tc: [[0.0005, 0.0236], [0, 0]], tr: [0.075, 0.078], thick: 0.16, low: [3.5, 4.0], grand: 1.7 };      // 樹冠底（模型單位，剛好在最下層樹冠之下）、最下層樹冠半徑、樹幹中心、樹幹底半徑、樹幹底加粗（樹幹每拉長一倍加粗多少，最多兩倍）、樹冠底離地的範圍、巨木抬高倍數
const trunkThk = (lift, yb) => 1 + TREE.thick * clamp(lift / yb, 0, 2);      // 樹幹拉得越長，底部加粗越多（小棵的樹才不會像插在棍子上）；lift、yb 同單位
/* 0.6 第二波之二：使用者看了加高的樹覺得「偏細高」，做兩種樣本給他挑（選定後改這個常數；測試頁可以先設 window.__treeStyle 覆蓋）：
   'now' 現在的樣子｜'A' 多一層樹冠：最下層樹冠複製一份、放大一點墊在最底下，原本的樹冠整個再往上抬（樹冠底仍是 3.5–4 公尺，樹變高）｜'B' 整體變粗：樹幹粗 1.6 倍、樹冠水平放大 1.28 倍（高度不變）。
   兩種都只在頂點著色器裡變形（A 多出來的那一層是每種樹的原型多一段三角形），種樹的亂數與位置不變。 */
const TREE_STYLE = (typeof window !== 'undefined' && window.__treeStyle) || 'AB';      // 0.6a：使用者選「A＋B」（整棵變粗一點，又多一層樹冠）
const TSTY = { now: { dy: [0, 0], tier: null, trunk: 1, wide: 1 }, A: { dy: [0.23, 0.3], tier: [[1.22, 1.0], [1.2, 0.95]], trunk: 1, wide: 1 }, B: { dy: [0, 0], tier: null, trunk: 1.6, wide: 1.28 }, AB: { dy: [0.23, 0.3], tier: [[1.4, 1.0], [1.38, 0.95]], trunk: 1.45, wide: 1.15 } }[TREE_STYLE] || null;      // dy：原本的樹冠再抬多少（模型單位）；tier：墊底那一層的水平、垂直倍率；trunk：樹幹粗細倍率；wide：樹冠水平倍率
const TS = TSTY || { dy: [0, 0], tier: null, trunk: 1, wide: 1 }, TNEW = !!TSTY && TREE_STYLE !== 'now';
const h01 = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };      // 用位置算的固定亂數（不能動種樹的亂數序列）
function treeShape(t) {
  const yb = TREE.yb[t.v] * t.s, want = t.s > 12 ? yb * TREE.grand : lerp(TREE.low[0], TREE.low[1], h01(t.x, t.z));
  t.lift = Math.max(0, want - yb); t.top = t.s + t.lift + TS.dy[t.v] * t.s;                               // 樹幹多長出來的長度（公尺）與新的樹高
  t.rb = TREE.rb[t.v] * t.s * (TS.tier ? TS.tier[t.v][0] : TS.wide); t.ext = t.top - t.s + t.rb - TREE.rb[t.v] * t.s;      // 最下層樹冠的半徑；比原模型多出來的高度＋寬度（剔除用的外框球要放大這麼多）
  const [cx, cz] = TREE.tc[t.v], c = Math.cos(t.rot), sn = Math.sin(t.rot);
  t.tx = t.x + (cx * c + cz * sn) * t.s; t.tz = t.z + (-cx * sn + cz * c) * t.s;                             // 樹幹中心（A 款的樹幹不在外框正中央）
  t.tr = TREE.tr[t.v] * trunkThk(t.lift, yb) * TS.trunk * t.s;                                         // 碰撞半徑＝畫出來的樹幹底的半徑（多邊形的外接圓）
}
// 樹的原型：aPart（0 樹幹、1 樹冠，淡出用）；樣本 A／B 另外加 aSeg（0 樹幹｜1 墊底的那一層｜2 原本的樹冠），樣本 A 把最下層樹冠的三角形複製一份接在後面
const upperRing = (v, y) => v === 0 ? (y > 0.45 && y < 0.5) || y > 0.6 : y > 0.562;      // 不屬於最下層樹冠的頂點（A 款上層的底圈與尖、B 款上層）
function treeProto(proto, v) {
  const [cx, cz] = TREE.tc[v], yb = TREE.yb[v], isTrunk = (P, i) => P.getY(i) < yb + 0.04 && Math.hypot(P.getX(i) - cx, P.getZ(i) - cz) < 0.1;
  for (const p of proto.parts) {
    if (TNEW) {
      const P = p.g.attributes.position, ix = p.g.index.array, n = P.count, add = [], map = new Map(), nidx = Array.from(ix);
      if (TS.tier) for (let k = 0; k < ix.length; k += 3) { const t = [ix[k], ix[k + 1], ix[k + 2]]; if (t.every(i => isTrunk(P, i)) || t.some(i => upperRing(v, P.getY(i)))) continue; for (const i of t) { if (!map.has(i)) { map.set(i, n + add.length); add.push(i); } nidx.push(map.get(i)); } }
      const g = new THREE.BufferGeometry(), m = n + add.length;
      for (const k in p.g.attributes) { const a = p.g.attributes[k], s = a.itemSize, arr = new Float32Array(m * s), get = (i, c) => c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i); for (let i = 0; i < m; i++) { const o = i < n ? i : add[i - n]; for (let c = 0; c < s; c++) arr[i * s + c] = get(o, c); } g.setAttribute(k, new THREE.BufferAttribute(arr, s)); }
      const seg = new Float32Array(m); for (let i = 0; i < m; i++) seg[i] = i >= n ? 1 : isTrunk(P, i) ? 0 : 2; g.setAttribute('aSeg', new THREE.BufferAttribute(seg, 1));
      g.setIndex(nidx); g.computeBoundingSphere(); p.g = g; p.extra = add.length ? nidx.length / 3 - ix.length / 3 : 0;
    }
    const P = p.g.attributes.position, part = new Float32Array(P.count); for (let i = 0; i < P.count; i++) part[i] = isTrunk(P, i) ? 0 : 1; p.g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  }
  proto.tree = { yb, tc: new THREE.Vector2(cx, cz), dy: TS.dy[v], tier: TS.tier ? new THREE.Vector2(...TS.tier[v]) : new THREE.Vector2(1, 1) }; return proto;
}
const TREE_VS = 'attribute float aLift; uniform float uYb; uniform vec2 uTc; uniform float uThk;' + (TNEW ? ' attribute float aSeg; uniform vec4 uSty; uniform float uTrk;' : '');
const TREE_BEND = TNEW
  // 樣本 A／B：樹幹（低於樹冠底）拉長、加粗 uTrk 倍；樹幹頂在樹冠裡那一圈也加粗；墊底那一層照 uSty.yz 放大；原本的樹冠水平放大 uSty.w、再抬 uSty.x
  ? '\nif (transformed.y < uYb) { float yb = max(uYb, 0.01), tk = transformed.y / yb, thk = (1.0 + uThk * clamp(aLift / yb, 0.0, 2.0)) * uTrk; transformed.y *= (yb + aLift) / yb; transformed.xz = uTc + (transformed.xz - uTc) * mix(thk, uTrk, tk); }' +
    ' else { if (aSeg < 0.5) transformed.xz = uTc + (transformed.xz - uTc) * uTrk; else if (aSeg < 1.5) { transformed.xz = uTc + (transformed.xz - uTc) * uSty.y; transformed.y = uYb + (transformed.y - uYb) * uSty.z; } else { transformed.xz = uTc + (transformed.xz - uTc) * uSty.w; transformed.y += uSty.x; } transformed.y += aLift; }'
  : '\nif (transformed.y < uYb) { float tk = transformed.y / uYb, thk = 1.0 + uThk * clamp(aLift / uYb, 0.0, 2.0); transformed.y *= (uYb + aLift) / uYb; transformed.xz = uTc + (transformed.xz - uTc) * mix(thk, 1.0, tk); } else transformed.y += aLift;';
// 樹冠水平放大時法線跟著修正（變寬的錐面比較朝上）；除數先 clamp
const TREE_NRM = TNEW ? '\nif (position.y >= uYb) { vec2 ns = aSeg < 0.5 ? vec2(uTrk, 1.0) : aSeg < 1.5 ? uSty.yz : vec2(uSty.w, 1.0); ns = max(ns, vec2(0.2)); objectNormal = normalize(objectNormal / vec3(ns.x, ns.y, ns.x) + vec3(0.0, 1e-5, 0.0)); }' : '';
const treeUni = (sh, proto) => { sh.uniforms.uYb = { value: proto.tree.yb }; sh.uniforms.uTc = { value: proto.tree.tc }; sh.uniforms.uThk = { value: TREE.thick }; if (TNEW) { sh.uniforms.uSty = { value: new THREE.Vector4(proto.tree.dy, proto.tree.tier.x, proto.tree.tier.y, TS.wide) }; sh.uniforms.uTrk = { value: TS.trunk }; } };
// 擋在鏡頭與角色之間的樹冠（或鏡頭鑽進樹冠）以網點半透明顯示；樹幹只有自己擋住時才淡出。不改變大小，也不影響碰撞
const treeInject = (m, proto) => { const c = m.clone(); c.onBeforeCompile = sh => { treeUni(sh, proto);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFade; attribute float aPart; varying float vFade; ' + TREE_VS).replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + TREE_NRM).replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = mix(aFade.y, aFade.x, aPart);' + TREE_BEND);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade > 0.02) { float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (dn < vFade * 0.88) discard; }');
}; c.customProgramCacheKey = () => 'tree2'; return c; };
const treeDepth = proto => { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.onBeforeCompile = sh => { treeUni(sh, proto);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TREE_VS).replace('#include <begin_vertex>', '#include <begin_vertex>' + TREE_BEND); }; m.customProgramCacheKey = () => 'tree2d'; return m; };
// 鏡頭遮擋：從角色身上往鏡頭取樣，落在樹冠的錐體裡（放寬 0.45 公尺）就淡出樹冠；鏡頭本身在樹冠裡或旁邊 3 公尺內也算。樹幹：視線在樹冠底以下經過樹幹，或鏡頭貼著樹幹
const fadeSeg = { n: 10 };
const crownProf = (f, rf) => (1 - 0.85 * f) * (1 - rf) + rf * Math.max(0.2, Math.sqrt(Math.max(0, 1 - (2 * f - 1) * (2 * f - 1))));      /* 樹冠在高度比例 f 處的相對半徑：0＝錐形、1＝圓球 */
function treeBlock(t, px, py, pz, cam) {
  const sx = cam.x - px, sz = cam.z - pz, u0 = clamp(((t.x - px) * sx + (t.z - pz) * sz) / (sx * sx + sz * sz || 1), 0, 1); if (Math.hypot(t.x - px - sx * u0, t.z - pz - sz * u0) > t.rb + 3.4) return 0;      // 離視線太遠：不用細算
  const base = Hgt(t.x, t.z) - 0.12, y0 = base + (t.y0w != null ? t.y0w : t.lift + TREE.yb[t.v] * t.s), y1 = base + t.top, Rb = t.rb, rf = t.rf || 0, n = fadeSeg.n; let can = 0, trk = 0;
  for (let k = 0; k <= n; k++) {
    const u = 0.06 + 0.94 * k / n, qx = px + (cam.x - px) * u, qy = py + (cam.y - py) * u, qz = pz + (cam.z - pz) * u;
    if (!can && qy > y0 - 0.45 && qy < y1) { const f = clamp((qy - y0) / (y1 - y0), 0, 1); if (Math.hypot(qx - t.x, qz - t.z) < Rb * crownProf(f, rf) + 0.45) can = 1; }
    if (!trk && qy < y0 + 0.3 && qy > base && Math.hypot(qx - t.tx, qz - t.tz) < t.tr + 0.25) trk = 1;
    if (can && trk) break;
  }
  if (!can && cam.y > y0 - 1.2 && cam.y < y1) { const f = clamp((cam.y - y0) / (y1 - y0), 0, 1); if (Math.hypot(cam.x - t.x, cam.z - t.z) < Rb * crownProf(f, rf) + 3.2) can = 1; }      // 鏡頭在樹冠旁邊 3 公尺內（背後視角的鏡頭約 4.6 公尺高，正好在樹冠的高度，旁邊的樹冠會蓋掉四分之一個畫面）
  if (!trk && cam.y < y0 + 0.3 && Math.hypot(cam.x - t.tx, cam.z - t.tz) < t.tr + 1.3) trk = 1;      // 鏡頭貼著樹幹（樹幹佔掉畫面一角）
  if (t.sp === SP.dead) can = 0;      /* 枯樹沒有樹冠，不擋視線 */
  return can + trk * 2;
}
function fadeTrees(dt, px, py, pz) {
  const cam = W.camera.position, dirty = fadeTrees.dirty || (fadeTrees.dirty = new Set()), M = 14.5;      // 搜尋範圍：最大的巨木樹冠半徑 4.8（樣本 A／B 約 7）＋鏡頭旁 3.4
  const x0 = Math.floor((Math.min(px, cam.x) - M) / 12), x1 = Math.floor((Math.max(px, cam.x) + M) / 12), z0 = Math.floor((Math.min(pz, cam.z) - M) / 12), z1 = Math.floor((Math.max(pz, cam.z) + M) / 12);
  const seen = fadeTrees.live || (fadeTrees.live = new Set()), hy = py + 0.5;
  const visit = (t, near) => {
    if (t.skip) return;
    const b = near ? treeBlock(t, px, hy, pz, cam) : 0, wc = b & 1, wt = b & 2 ? 1 : 0;
    if (Math.abs(t.fade - wc) < 0.004 && Math.abs(t.fadeT - wt) < 0.004) { if (!wc && !wt) seen.delete(t); return; }
    t.fade = damp(t.fade, wc, 10, dt); if (Math.abs(t.fade - wc) < 0.004) t.fade = wc;
    t.fadeT = damp(t.fadeT, wt, 10, dt); if (Math.abs(t.fadeT - wt) < 0.004) t.fadeT = wt;
    t.ims.forEach(im => { im.geometry.attributes.aFade.setXY(t.idx, t.fade, t.fadeT); dirty.add(im); }); if (t.fade > 0 || t.fadeT > 0) seen.add(t); else seen.delete(t);
  };
  const fid = fadeSeg.f = (fadeSeg.f || 0) + 1;
  if (x1 - x0 < 12 && z1 - z0 < 12) for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const l = flora.hash.get(key(ix, iz)); if (l) for (const t of l) { t.fid = fid; visit(t, true); } }
  for (const t of [...seen]) if (t.fid !== fid) visit(t, false);       // 已經淡出的樹即使離開搜尋範圍也要恢復
  for (const im of dirty) im.geometry.attributes.aFade.needsUpdate = true; dirty.clear(); flora.fadeN = seen.size;
}

/* ---------- 草 ---------- */
const grass = { mesh: null, uniforms: null, max: 190000 };
// d8-art：陷阱看得到的時候，腳下那一圈的草壓掉（捕獸夾：翻土範圍內不長草、外圈壓低；絆索：沿繩子壓低）。traps07 每幀給最多 4 個（線段 a→b、半徑、強度 0–1、外圈寬、要不要整個拿掉）
const PRESS_N = 4, pressA = Array.from({ length: PRESS_N }, () => new THREE.Vector4()), pressR = Array.from({ length: PRESS_N }, () => new THREE.Vector4());
export function grassPress07(list) { for (let i = 0; i < PRESS_N; i++) { const q = list && list[i]; if (q) { pressA[i].set(q.ax, q.az, q.bx, q.bz); pressR[i].set(q.r, q.k, q.ring, q.cut ? 1 : 0); } else pressR[i].set(0, 0, 0, 0); } }
function buildGrass() {
  const TILE = 104, N = grass.max, rand = rng(555), bw = 0.05;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-bw, 0, 0, bw, 0, 0, -bw * 0.8, 0.38, 0, bw * 0.8, 0.38, 0, -bw * 0.5, 0.74, 0, bw * 0.5, 0.74, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(7).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1, 1, 1, 1, 1, 1, 1.22, 1.22, 1.22], 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 2, 1, 0, 3, 1, 2, 4, 3, 2, 5, 3, 4, 6, 5, 4]);
  const off = new Float32Array(N * 3), sc = new Float32Array(N * 3), tint = new Float32Array(N);
  for (let i = 0; i < N; i++) { off[i * 3] = rand() * TILE; off[i * 3 + 1] = rand() * TILE; off[i * 3 + 2] = rand() * TAU; sc[i * 3] = 0.9 + rand() * 0.9; sc[i * 3 + 1] = 0.36 + rand() * 0.5; sc[i * 3 + 2] = 0.12 + rand() * 0.3; tint[i] = rand(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aSc', new THREE.InstancedBufferAttribute(sc, 3)); g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  g.instanceCount = N;
  const u = grass.uniforms = { uFocus: { value: new THREE.Vector2() }, uTile: { value: TILE }, uMap: { value: grassMap }, uColMap: { value: grassCol }, uWorld: { value: SIZE * N1 / G }, uTime: { value: 0 }, uPA: { value: pressA }, uPR: { value: pressR }, uWet: SKY08.wet };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aOff; attribute vec3 aSc; attribute float aTint; uniform vec2 uFocus; uniform float uTile; uniform sampler2D uMap; uniform sampler2D uColMap; uniform float uWorld; uniform float uTime; uniform vec4 uPA[4]; uniform vec4 uPR[4]; uniform float uWet;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec2 gBase = mod(aOff.xy - uFocus, uTile) - 0.5 * uTile + uFocus;
        vec2 gUv = gBase / uWorld + 0.5;
        vec4 gM = texture2D(uMap, gUv);
        vColor.rgb *= texture2D(uColMap, gUv).rgb * (0.8 + 0.4 * fract(aTint * 7.31)) * (1.0 - 0.24 * uWet);`)
      .replace('#include <begin_vertex>', `
        float gKeep = step(aTint, gM.g) * (1.0 - smoothstep(0.43 * uTile, 0.5 * uTile, max(abs(gBase.x - uFocus.x), abs(gBase.y - uFocus.y))));
        float gPr = 0.0, gIn = 0.0;
        for (int k = 0; k < 4; k++) { vec4 pa = uPA[k], pr = uPR[k]; if (pr.y <= 0.0) continue; vec2 ab = pa.zw - pa.xy, ap = gBase - pa.xy; float gh = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0), dd = length(ap - ab * gh);
          gPr = max(gPr, pr.y * (1.0 - smoothstep(pr.x, pr.x + pr.z, dd))); if (pr.w > 0.5) gIn = max(gIn, pr.y * (1.0 - smoothstep(pr.x * 0.82, pr.x, dd))); }
        gKeep *= step(gIn, fract(aTint * 13.7) * 0.999);
        float gC = cos(aOff.z), gS = sin(aOff.z);
        vec3 gP = position; gP.x *= aSc.x; gP.y *= aSc.y * mix(1.0, 0.72, gM.b) * mix(1.0, 0.3, gPr);
        float gWind = sin(uTime * 1.6 + gBase.x * 0.33 + gBase.y * 0.27) * 0.6 + sin(uTime * 2.7 + gBase.x * 0.9 - gBase.y * 0.4) * 0.3;
        gP.z += position.y * position.y * (aSc.z + gWind * 0.2);
        vec3 transformed = vec3(gC * gP.x + gS * gP.z, gP.y, -gS * gP.x + gC * gP.z) * gKeep + vec3(gBase.x, gM.r - 0.03, gBase.y);`);
  };
  const mesh = grass.mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; W.scene.add(mesh);
}

/* ---------- 水 ---------- */
// 水面：依每個頂點的水深決定顏色與透明度（淺處看得到池底，深處是不透明的藍綠色），岸邊一圈白沫，水波用雜訊擾動法線，低角度看會映出天色。
// 游泳或涉水的人周圍有一圈圈往外擴散的漣漪（setRipple：第幾個、位置、強度 0–1）
const waterU = { uTime: { value: 0 }, uSky: { value: new THREE.Color(0.5, 0.7, 0.9) }, uShallow: { value: cS(0.45, 0.82, 0.76) }, uDeep: { value: cS(0.06, 0.34, 0.52) }, uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uRain: { value: 0 } };      // d8-art-rain：uRain＝水面雨點漣漪的強度（低畫質給 0）
export function setRipple(i, x, z, k) { if (i >= 0 && i < 4) waterU.uRip.value[i].set(x, z, k, 0); }
export function setRainWater08(v) { waterU.uRain.value = v; }      // d8-art-rain：水面雨點漣漪 0–1（rain08.js 給）
// 水的材質。給了 shallow／deep 就是另一種水色（霜泉偏白、蘆葦澤偏綠、坑湖偏深），其餘共用同一組時間與漣漪
function waterMat(shallow, deep) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0, transparent: true, depthWrite: false });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, waterU, shallow ? { uShallow: { value: shallow }, uDeep: { value: deep } } : null);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDepth; varying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec3 uSky; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec4 uRip[4]; uniform float uRain; varying float vDepth; varying vec3 vWP;
      float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float wRing(vec2 p, float sharp) { float r = 0.0; for (int i = 0; i < 4; i++) { vec4 s = uRip[i]; if (s.z > 0.0) { float d = distance(p, s.xy), w = sin(d * 4.2 - uTime * 6.0); r += (sharp > 0.5 ? smoothstep(0.72, 1.0, w) : w) * exp(-d * 0.7) * smoothstep(0.35, 1.1, d) * s.z; } } return r; }
      float wDrop(vec2 p, float sd) { vec2 c = floor(p), f = fract(p) - 0.5; float h = wHash(c + sd), ph = fract(uTime * 0.9 + h * 7.0), d = length(f - (vec2(wHash(c + sd + 3.1), wHash(c + sd + 7.7)) - 0.5) * 0.24), r = 0.04 + ph * 0.34; return (1.0 - smoothstep(0.0, 0.07, abs(d - r))) * (1.0 - ph) * (1.0 - ph) * step(h, uRain * 0.8); }
      float wRain(vec2 p) { return uRain > 0.0 ? wDrop(p * 0.9, 0.0) + wDrop(p * 1.3 + 17.0, 31.0) : 0.0; }
      float wH(vec2 p) { return wNoise(p * 0.55 + vec2(uTime * 0.32, uTime * 0.2)) + wNoise(p * 1.35 - vec2(uTime * 0.42, -uTime * 0.27)) * 0.5 + wRing(p, 0.0) * 0.8 + wRain(p) * 0.25; }`)
      .replace('#include <map_fragment>', `float wd = max(vDepth, 0.0), wh = wH(vWP.xz);
      vec3 wc = mix(uShallow, uDeep, smoothstep(0.0, 1.7, wd)) * (0.9 + 0.14 * wh);
      float wa = mix(0.4, 0.93, smoothstep(0.0, 1.4, wd));
      float lap = vDepth - 0.06 * sin(uTime * 1.3 + vWP.x * 0.45 + vWP.z * 0.3) - 0.07 * wNoise(vWP.xz * 1.7 + uTime * 0.15);
      float foam = clamp((1.0 - smoothstep(0.02, 0.17, lap)) * 0.9 + wRing(vWP.xz, 1.0) * 0.34, 0.0, 1.0);
      diffuseColor.rgb = mix(wc, vec3(0.94, 0.98, 1.0), foam); if (uRain > 0.0) diffuseColor.rgb += wRain(vWP.xz) * 0.2 * uRain; diffuseColor.a = mix(wa, 0.9, foam) * smoothstep(-0.05, 0.02, vDepth);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec2 e = vec2(0.14, 0.0); vec2 wg = vec2(wH(vWP.xz + e.xy) - wh, wH(vWP.xz + e.yx) - wh) / e.x; normal = normalize((viewMatrix * vec4(normalize(vec3(-wg.x * 0.16, 1.0, -wg.y * 0.16)), 0.0)).xyz); }`)
      .replace('#include <opaque_fragment>', `{ float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * (1.0 - foam); outgoingLight = mix(outgoingLight, uSky, fr * 0.7); diffuseColor.a = mix(diffuseColor.a, 0.97, fr * 0.7); }
      #include <opaque_fragment>`);
  };
  if (shallow) mat.customProgramCacheKey = () => 'water' + shallow.getHexString() + deep.getHexString();
  return mat;
}
function buildWater() {
  const mat = waterMat();
  const disc = pi => {
    const p = PONDS[pi], R = p[2] + 4, RN = Math.ceil(R / 0.9), SN = 96, y = pondLevel(pi), pos = [], nor = [], dep = [], idx = [];
    for (let j = 0; j <= RN; j++) for (let i = 0; i < SN; i++) { const r = R * j / RN, a = i / SN * TAU, x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r; pos.push(x, y, z); nor.push(0, 1, 0); dep.push(y - groundH(x, z)); }
    for (let j = 0; j < RN; j++) for (let i = 0; i < SN; i++) { const a = j * SN + i, b = j * SN + (i + 1) % SN, c = a + SN, d = b + SN; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = -1; W.scene.add(m); return m;      // 比其他半透明的東西先畫：攻擊預警、特效在淺水裡才看得清楚
  };
  W.waters = [disc(1)];          // 低語潭照舊是一張圓盤
  // 0.6：鏡池＋新水域共用同一張 1 公尺的格網，每一格只歸離它最近的那個水域（相接的地方水面等高，所以沒有重疊也沒有縫）；每個水域各自一個網格、各自剔除。
  // 頂點的高度就是那個位置的水面高（鏡溪是緩緩下降的斜面），深度照樣逐點算
  const L = lakeInfo(), ST = 1.0, bodies = [{ id: 'pond0', sd: (x, z) => [Math.hypot(x - PONDS[0][0], z - PONDS[0][1]) - PONDS[0][2], pondLevel(0)], x0: PONDS[0][0] - PONDS[0][2] - 6, x1: PONDS[0][0] + PONDS[0][2] + 6, z0: PONDS[0][1] - PONDS[0][2] - 6, z1: PONDS[0][1] + PONDS[0][2] + 6 }, ...L.map((b, i) => ({ id: b.id, sd: (x, z) => lakeProbe(i, x, z), x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }))];
  const owner = (x, z) => { let best = LAKE_PAD + 0.2, bi = -1; for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; const sd = b.sd(x, z)[0]; if (sd < best) { best = sd; bi = i; } } return bi; };
  const tintOf = { spring: [cS(0.7, 0.93, 0.98), cS(0.24, 0.62, 0.8)], marsh: [cS(0.5, 0.74, 0.56), cS(0.16, 0.36, 0.34)], pit: [cS(0.4, 0.8, 0.8), cS(0.04, 0.3, 0.42)] };
  for (const k of ['mire', 'crocpond', 'floodpool']) tintOf[k] = tintOf.marsh; for (const k of ['saltspring', 'saltspring2', 'meltlake', 'icepond']) tintOf[k] = tintOf.spring;      /* 0.8（X0b）：新水域 */
  bodies.forEach((b, bi) => {
    const i0 = Math.floor(b.x0 / ST), i1 = Math.ceil(b.x1 / ST), j0 = Math.floor(b.z0 / ST), j1 = Math.ceil(b.z1 / ST), nx = i1 - i0 + 1, vid = new Map(), pos = [], dep = [], idx = [];
    const vert = (i, j) => { const k = j * nx + i; let v = vid.get(k); if (v == null) { const x = (i0 + i) * ST, z = (j0 + j) * ST, y = b.sd(x, z)[1]; v = pos.length / 3; pos.push(x, y, z); dep.push(y - groundH(x, z)); vid.set(k, v); } return v; };
    for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < nx - 1; i++) { if (owner((i0 + i + 0.5) * ST, (j0 + j + 0.5) * ST) !== bi) continue; const a = vert(i, j), c = vert(i + 1, j), d = vert(i, j + 1), e = vert(i + 1, j + 1); idx.push(a, d, c, c, d, e); }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length); for (let k = 1; k < nor.length; k += 3) nor[k] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, tintOf[b.id] ? waterMat(...tintOf[b.id]) : mat); m.receiveShadow = true; m.renderOrder = -1; m.name = 'water-' + b.id; W.scene.add(m); W.waters.push(m);
  });
}

/* ---------- 程式產生的貼圖：砂岩磚與石板路 ---------- */
function finishTex(cv) { const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx; }
function blockTexture(seed = 5, col = [232, 212, 178], mortar = '#75695a', warmK = 0.07) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const cx = cv.getContext('2d'), rr = rng(seed), cols = 4, rows = 6, bw = 512 / cols, bh = 512 / rows;
  cx.fillStyle = mortar; cx.fillRect(0, 0, 512, 512);
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, v = 0.8 + rr() * 0.2, warm = rr() * warmK;
    cx.fillStyle = `rgb(${col[0] * v | 0},${col[1] * (v - warm * 0.4) | 0},${col[2] * (v - warm) | 0})`; cx.beginPath(); cx.roundRect(x + 3, y + 3, bw - 6, bh - 6, 7); cx.fill();
    for (let k = 0; k < 22; k++) { cx.fillStyle = `rgba(90,70,50,${0.04 + rr() * 0.07})`; cx.fillRect(x + 6 + rr() * (bw - 18), y + 6 + rr() * (bh - 16), 2 + rr() * 6, 2 + rr() * 4); }
    cx.fillStyle = 'rgba(255,250,235,.2)'; cx.fillRect(x + 8, y + 5, bw - 16, 3); cx.fillStyle = 'rgba(60,45,30,.18)'; cx.fillRect(x + 8, y + bh - 9, bw - 16, 4);
  }
  return finishTex(cv);
}
function cobbleTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const cx = cv.getContext('2d'), rr = rng(11), n = 7, cs = 512 / n;
  cx.fillStyle = '#857b6c'; cx.fillRect(0, 0, 512, 512);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5 + (j % 2 ? 0.5 : 0)) * cs + (rr() - 0.5) * 9, y = (j + 0.5) * cs + (rr() - 0.5) * 7, rx = cs * (0.4 + rr() * 0.07), ry = cs * (0.38 + rr() * 0.08), rot = (rr() - 0.5) * 0.6, v = 0.8 + rr() * 0.22, cool = rr() * 0.05;
    for (const ox of [0, 512]) {
      cx.save(); cx.translate(x - ox, y); cx.rotate(rot);
      cx.fillStyle = `rgb(${226 * (v - cool) | 0},${222 * (v - cool * 0.4) | 0},${212 * v | 0})`; cx.beginPath(); cx.roundRect(-rx, -ry, rx * 2, ry * 2, Math.min(rx, ry) * 0.62); cx.fill();
      cx.fillStyle = 'rgba(255,255,250,.2)'; cx.beginPath(); cx.ellipse(-rx * 0.15, -ry * 0.3, rx * 0.55, ry * 0.32, 0, 0, TAU); cx.fill();
      cx.restore();
    }
  }
  for (let k = 0; k < 900; k++) { cx.fillStyle = `rgba(60,50,40,${0.03 + rr() * 0.06})`; cx.fillRect(rr() * 512, rr() * 512, 1 + rr() * 4, 1 + rr() * 3); }
  return finishTex(cv);
}

/* ---------- 城鎮與競技場 ---------- */
export const npcSpots = [];
const lamps = [];
// 配置放在最上層：地形（草皮）、碰撞與建造共用同一份。建築：名稱、方位（度）、半徑、高度
const BLD = [['building_tavern_red', 312, 29, 9.5], ['building_blacksmith_red', 48, 29, 8.2], ['building_market_red', 132, 29.5, 8.2], ['building_church_red', 228, 29, 11.5], ['building_barracks_red', 24, 31, 8], ['building_archeryrange_red', 68, 31.5, 6],
  ['building_home_A_red', 292, 32, 7], ['building_home_B_red', 336, 31.5, 7.4], ['building_home_A_red', 112, 32, 7], ['building_home_B_red', 156, 31.5, 7.4], ['building_home_A_red', 204, 32, 7], ['building_home_B_red', 250, 31.5, 7.4]];
const TOWN_TREES = [[11, 30], [348, 30], [80, 34.5], [100, 33], [215, 33], [239, 34], [260, 33], [280, 33]].map(([a, r]) => polar(a, r));      // 原本有四棵種在房子裡
const WELL = polar(194, 21.5);          // 原本在 166°，跟教官站的位置疊在一起
// 市集攤位與雜物：名稱、高度、x、z、朝向、碰撞半徑（原本埋在酒館、鐵匠鋪、兵營裡面的幾件挪到屋外）
const PROPS = [['tent', 4.0, 7.5, 27, 0.2, 2.2], ['tent', 4.0, -7.5, 28.5, -0.2, 2.2], ['tent', 3.8, 8.5, 35, 0.1, 2.1], ['tent', 3.8, -8.5, 35.5, -0.1, 2.1],
  ['barrel', 1.3, 10.6, 25.4, 0, 0.7], ['barrel', 1.3, 11.6, 26.2, 1, 0.7], ['crate_A_big', 1.35, 5.2, 29.8, 0.4, 0.8], ['crate_B_small', 0.85, 4.6, 28.6, 1.1, 0], ['sack', 0.8, -5.0, 30.2, 2, 0], ['crate_long_A', 0.8, -10.6, 26.4, 0.6, 0.8], ['bucket_water', 0.62, -4.4, 27.2, 0, 0], ['barrel', 1.3, -11.2, 30.6, 0.5, 0.7],
  ['weaponrack', 2.0, 15.8, -24.5, -0.6, 1.0], ['bucket_arrows', 0.9, 15.0, -23.0, 0, 0], ['resource_lumber', 0.9, 25.3, -13.4, 2.4, 0.9], ['resource_stone', 0.9, 23.4, -12.2, 0.3, 0.9], ['pallet', 0.4, 14.6, -21.7, 0.2, 0], ['wheelbarrow', 1.15, -23.0, -13.9, 2.2, 0.9], ['crate_A_big', 1.35, -16.6, -21.9, 0.2, 0.8], ['sack', 0.8, -15.8, -21.0, 1, 0]];
const town = { blds: [], solid: [], lamps: [] };
// 模型靠近地面那一段的外框（不含屋簷）：建築的方形碰撞用
function footprint(obj, frac = 0.3) {
  obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj), top = b.min.y + (b.max.y - b.min.y) * frac, v = new THREE.Vector3(); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  obj.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > top) continue; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } });
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 };
}
function planTown() {
  for (const [n, a, r, h] of BLD) { const [x, z] = polar(a, r), rot = -a * Math.PI / 180, obj = fitHeight(W.models[n].clone(true), h), f = footprint(obj), c = Math.cos(rot), s = Math.sin(rot); town.blds.push({ obj, x, z, rot, h, c, s, bx: x + f.cx * c + f.cz * s, bz: z - f.cx * s + f.cz * c, hw: f.hw, hd: f.hd }); }
  for (let i = 0; i < 8; i++) { const a = 22.5 + i * 45; town.lamps.push([...polar(a, 22.6), 3.6, false, -a * Math.PI / 180 + Math.PI / 2]); }
  GATES.forEach(a => [-7.2, 7.2].forEach(d => town.lamps.push([...polar(a + d, WORLD.ARENA_OUT + 2.6), 1.5, true, 0], [...polar(a + d * 0.85, TR - 3.9), 1.5, true, 0])));
  npcSpots.push({ id: 'instructor', name: '競技場教官 葛倫', model: 'knight', look: '3;0,0,8,2,0,1,106,100,64,52,62,56;', ft: { hair: 10, hc: 11, skin: 3, beard: 4, fs: 4, eye: 3, brow: 3, nose: 1, mouth: 1, mark: 3 }, fs: { bs: 14, es: 8 }, x: 3.6, z: WORLD.ARENA_OUT + 3.6, f: -0.3, lines: ['新來的？城外草原上的野豬最適合練手，狼群要等你習慣閃避再碰。', '被怪物盯上時地上會出現紅色預警，看到就往旁邊閃。', '北方荒徑盡頭是獸王的巢穴。那扇門要兩個人同時轉動絞盤才打得開。'] });
  npcSpots.push({ id: 'smith', name: '鐵匠 布蘿娜', model: 'barbarian', look: '3;1,1,3,5,0,0,101,100,58,52,60,54;', ft: { hair: 7, hc: 6, skin: 2, fs: 0, eye: 5, brow: 3, mouth: 3, lash: 1, mark: 1 }, fs: {}, x: polar(48, 22.3)[0], z: polar(48, 22.3)[1], f: -0.84, lines: ['狼皮、熊皮、虎牙我都收。鍛造爐下一版就會生火，材料先留著。', '力量再高，耐力跟不上也只是揮兩下就喘。配點別偏得太兇。'] });
  npcSpots.push({ id: 'merchant', name: '雜貨商 米洛', model: 'mage', look: '3;0,2,6,8,2,2,97,100,44,62,44,46;', ft: { hair: 2, hc: 5, skin: 1, beard: 2, fs: 1, eye: 7, brow: 1, nose: 3, mouth: 0 }, fs: { fw: 13 }, x: 3.9, z: 27.4, f: -Math.PI / 2, lines: ['空白地圖還在路上。眼下你走過的地方，右上角的羅盤會自己記下來。', '西邊森林的熊走得慢，但牠站起來的那一下別待在圈裡。', '東邊峽谷只有幾條路走得通，迷路就沿著谷底的沙地走。'] });
  // 新增的六位居民（站位、名字與頭銜照 story.js 的 NPCS）。哈根在城外西邊的獵人營地
  npcSpots.push({ id: 'tavern', name: '酒館老闆娘 瑪歌', look: '5;1,3,1,10,0,0,98,104,62,66,56,54,0;', ft: { hair: 9, hc: 6, skin: 2, fs: 1, eye: 0, brow: 2, nose: 0, mouth: 3, lash: 2, lipc: 3, blush: 2 }, fs: { fw: 13, fc: 13, es: 12 }, x: -17.1, z: -15.4, f: 0.84 });
  npcSpots.push({ id: 'apothecary', name: '藥師 艾妲', look: '5;1,2,7,7,0,0,101,98,40,36,38,42,0;', ft: { hair: 6, hc: 5, skin: 0, fs: 2, eye: 4, ec: 3, brow: 1, nose: 2, mouth: 1, lash: 1, lipc: 0, blush: 0, mark: 2 }, fs: { fw: 8, es: 9 }, x: -17.1, z: 15.4, f: 2.3 });
  npcSpots.push({ id: 'guard', name: '南門衛兵 托比', look: '5;0,0,0,1,1,0,95,104,46,44,44,46,0;', ft: { hair: 1, hc: 3, skin: 1, fs: 1, eye: 6, brow: 4, nose: 0, mouth: 4, blush: 1, mark: 1 }, fs: { es: 12, by: 12 }, x: -2.6, z: 36.6, f: 2.03 });
  npcSpots.push({ id: 'surveyor', name: '測繪師 芬恩', look: '5;0,3,3,8,0,3,100,102,42,40,40,42,1;', ft: { hair: 2, hc: 4, skin: 1, fs: 3, eye: 5, ec: 2, brow: 0, nose: 1, mouth: 2, blush: 1 }, fs: { es: 12 }, x: 17.8, z: 16.1, f: -2.31 });
  npcSpots.push({ id: 'hunter', name: '老獵人 哈根', look: '5;0,1,2,10,0,4,105,98,60,48,60,54,7;', ft: { hair: 7, hc: 11, skin: 4, fs: 4, eye: 4, ec: 7, brow: 3, nose: 3, mouth: 5, beard: 3, mark: 3, blush: 0 }, fs: { bs: 15, es: 8, fj: 13 }, x: -108, z: -12, f: 1.37 });
  npcSpots.push({ id: 'keeper', name: '競技場記錄官 巴索', look: '5;0,2,1,7,0,1,99,102,50,64,44,46,4;', ft: { hair: 4, hc: 5, skin: 2, fs: 0, eye: 7, brow: 2, nose: 3, mouth: 0, beard: 2, blush: 1 }, fs: { fw: 12, bs: 13, ns: 13 }, x: -3.6, z: -(WORLD.ARENA_OUT + 3.6), f: 2.85 });
  town.solid.push([WELL[0], WELL[1], 2.0]); PROPS.forEach(q => town.solid.push([q[2], q[3], q[0] === 'tent' ? 2.9 : 1.0])); town.lamps.forEach(l => town.solid.push([l[0], l[1], 0.7])); npcSpots.forEach(q => town.solid.push([q.x, q.z, 1.2]));
}
// 離最近的建築、攤位、路燈、NPC 多遠（草皮要避開它們）
function townClear(x, z) {
  let d = 99;
  for (const b of town.blds) { const dx = x - b.bx, dz = z - b.bz, ex = Math.abs(dx * b.c - dz * b.s) - b.hw, ez = Math.abs(dx * b.s + dz * b.c) - b.hd; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0)); }
  for (const q of town.solid) d = Math.min(d, Math.hypot(x - q[0], z - q[1]) - q[2]);
  return d;
}
const lawnAt = (x, z) => { let g = 0; for (const [tx, tz] of TOWN_TREES) g = Math.max(g, smooth(3.9, 2.7, Math.hypot(x - tx, z - tz) + (vnoise(x * 0.7, z * 0.7) - 0.5) * 1.2)); return g; };
// 城牆、門樓、塔樓：KayKit 的牆放大後是一整面沒有紋理的深灰色，背光時就是一塊死黑。
// 依模型自己的座標貼上砌石紋並把石材提亮；木造的挑簷加上木板縫。靠色票的彩度分辨石、木、屋瓦
let wallMap = null;
function masonry(src, scale, planks) {
  const m = src.clone(); if (!wallMap) wallMap = blockTexture(23, [208, 205, 198], '#67645f', 0.03);
  m.onBeforeCompile = sh => {
    sh.uniforms.uWallMap = { value: wallMap }; sh.uniforms.uWScale = { value: scale / 4.4 }; sh.uniforms.uPlank = { value: planks ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uWallMap; uniform float uWScale; uniform float uPlank; varying vec3 vOP; varying vec3 vON;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 an = abs(normalize(vON)), q = vOP * uWScale;
        vec2 wuv = an.y > 0.7 ? q.xz : (an.x > an.z ? q.zy : q.xy);
        float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)), sat = (mx - mn) / max(mx, 0.001);
        float stone = (1.0 - smoothstep(0.3, 0.45, sat)) * (1.0 - smoothstep(0.5, 0.57, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))));
        float wood = uPlank * smoothstep(0.45, 0.6, sat) * smoothstep(0.1, 0.2, diffuseColor.g / max(diffuseColor.r, 0.001));
        float wu = (an.y > 0.7 ? q.x : (an.x > an.z ? q.z : q.x)) * 7.0, fw = fwidth(wu), ed = 0.5 - abs(fract(wu) - 0.5);
        float seam = (1.0 - smoothstep(0.04, 0.05 + fw * 1.5, ed)) * clamp(1.0 - fw * 2.0, 0.0, 1.0), bv = 0.9 + 0.2 * fract(sin(floor(wu) * 12.9898) * 43758.5453);
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(uWallMap, wuv).rgb * 2.9, stone) * mix(1.0, bv * (1.0 - 0.42 * seam), wood); }`);
  };
  m.customProgramCacheKey = () => 'masonry'; return m;
}
const setMasonry = (obj, cache, scale, planks) => obj.traverse(o => { if (o.isMesh) o.material = cache.m || (cache.m = masonry(o.material, scale, planks)); });
function buildTown() {
  const scene = W.scene, M = W.models;
  const inst = (n, h) => fitHeight(M[n].clone(true), h);
  // 外牆：二十段。城門那幾段的門樓用跟牆一樣的比例（原本比較小，兩側各留一道看得穿的縫），每段橫向再放寬一點補掉段與段之間的缺口
  const proto = inst('wall_straight', 7.2), ws = proto.scale.x, pb = new THREE.Box3().setFromObject(proto), alongX = (pb.max.x - pb.min.x) >= (pb.max.z - pb.min.z), wm = {}, tm = {};
  for (let i = 0; i < WSEG; i++) {
    const a = i * WSTEP, gate = GATES.indexOf(a) >= 0, [x, z] = polar(a, TR), ar = a * Math.PI / 180, seg = M[gate ? 'wall_straight_gate' : 'wall_straight'].clone(true);
    seg.scale.multiplyScalar(ws); if (alongX) seg.scale.x *= 1.07; else seg.scale.z *= 1.07;
    if (gate) seg.traverse(o => { if (/door/.test(o.name)) o.visible = false; });
    setMasonry(seg, wm, ws, true); seg.position.set(x, Hgt(x, z) - 0.3, z); seg.rotation.y = alongX ? -ar : Math.PI / 2 - ar; scene.add(seg);
  }
  for (let i = 0; i < 8; i++) { const a = 22.5 + i * 45, [x, z] = polar(a, TR + 0.4), t = place(inst('building_tower_A_red', 12.5), x, z, -a * Math.PI / 180, 0.3); setMasonry(t, tm, t.scale.x, false); addBox(x, z, 2.7, 2.9, -a * Math.PI / 180, 12); }
  // 競技場：四段階梯看臺，入口對著四個城門
  const arena = new THREE.Group(); arena.position.y = Hgt(0, 0) - 0.25; scene.add(arena);
  const TW = 3.2, sMat = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.94, color: cS(1, 0.95, 0.84), flatShading: true, side: THREE.DoubleSide });
  const sDark = sMat.clone(); sDark.color = cS(0.78, 0.7, 0.6); const sBox = sDark.clone(); sBox.side = THREE.FrontSide;
  sMat.shadowSide = THREE.FrontSide;      // 看臺的面朝著實心內側：陰影只畫背光那幾面，受光的外牆才不會被自己遮出斜紋
  const prof = [[9.75, 0], [9.75, 1.5], [10.9, 1.5], [10.9, 2.6], [12.1, 2.6], [12.1, 3.7], [13.4, 3.7], [13.4, 4.9], [14.7, 4.9], [14.7, 6.4], [16.3, 6.4], [16.3, 7.1], [16.75, 7.1], [16.6, 0]];
  const pv = prof.map(q => new THREE.Vector2(q[0], q[1])), cum = [0]; for (let j = 1; j < prof.length; j++) cum.push(cum[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
  const boxUV = (g, sx, sy) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / TW, uv.getY(i) * sy / TW); return g; };
  for (let q = 0; q < 4; q++) {
    const center = Math.PI / 4 + q * Math.PI / 2, span = Math.PI / 2 - 0.36, start = center - span / 2, SEG = 22;
    const g = new THREE.LatheGeometry(pv, SEG, start, span), uv = g.attributes.uv;
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < prof.length; j++) uv.setXY(i * prof.length + j, (i / SEG) * span * prof[j][0] / TW, cum[j] / TW);
    const stand = new THREE.Mesh(g, sMat); stand.castShadow = true; stand.receiveShadow = true; arena.add(stand);
    // 兩端的側牆
    const shape = new THREE.Shape(pv);
    [start, start + span].forEach(th => { const cg = new THREE.ShapeGeometry(shape), cu = cg.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) / TW, cu.getY(i) / TW); const cap = new THREE.Mesh(cg, sDark); cap.rotation.y = th - Math.PI / 2; cap.castShadow = true; cap.receiveShadow = true; arena.add(cap); });
    // 外牆的立柱
    for (let k = 0; k <= 6; k++) { const th = start + span * k / 6, pil = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.0, 7.7, 0.9), 1, 7.7), sBox); pil.position.set(Math.sin(th) * 16.75, 3.85, Math.cos(th) * 16.75); pil.rotation.y = th; pil.castShadow = true; pil.receiveShadow = true; arena.add(pil); }
    [start + 0.1, start + span - 0.1].forEach(th => { const f = inst('flag_red', 4.4); f.position.set(Math.sin(th) * 16.5, arena.position.y + 7.1, Math.cos(th) * 16.5); f.rotation.y = th; scene.add(f); });
    // 入口上方的橫樑
    const ga = q * Math.PI / 2, beam = new THREE.Mesh(boxUV(new THREE.BoxGeometry(7.4, 1.1, 1.3), 7.4, 1.1), sBox); beam.position.set(Math.sin(ga) * 16.2, 7.0, Math.cos(ga) * 16.2); beam.rotation.y = ga; beam.castShadow = true; arena.add(beam);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.25), new THREE.MeshStandardMaterial({ color: cS(0.62, 0.1, 0.08), roughness: 0.7 })); crest.position.set(Math.sin(ga) * 16.95, 7.0, Math.cos(ga) * 16.95); crest.rotation.set(0, ga, Math.PI / 4); arena.add(crest);
  }
  [[-3.2, -3.0, 0.4], [3.4, -2.4, -0.5], [0, 3.6, 3.1]].forEach(([x, z, ry]) => { place(inst('target', 2.3), x, z, ry); addCollider(x, z, 0.8); });
  town.blds.forEach(b => { place(b.obj, b.x, b.z, b.rot, 0.25); addBox(b.bx, b.bz, b.hw - 0.2, b.hd - 0.2, b.rot, b.h * 0.9); });
  { const [x, z] = WELL; place(inst('building_well_red', 3.6), x, z, 0, 0.1); addCollider(x, z, 1.7, 3.4); }
  { const x = 74, z = 62; place(inst('building_windmill_red', 15), x, z, -0.8, 0.3); addCollider(x, z, 4.4, 12); }
  PROPS.forEach(([n, h, x, z, ry, cr]) => { place(inst(n, h), x, z, ry); if (cr) addCollider(x, z, cr, n === 'tent' ? 3.8 : 2.5); });
  // 任務用的小物件：競技場中央的拴獸樁與鐵環、北大道盡頭草叢裡的斷鍊、獵人營地、峽谷岔路口翻倒的貨車
  {
    const iron = new THREE.MeshStandardMaterial({ color: cS(0.2, 0.19, 0.2), roughness: 0.5, metalness: 0.7 }), rust = new THREE.MeshStandardMaterial({ color: cS(0.34, 0.2, 0.13), roughness: 0.9, metalness: 0.3 }), wood = new THREE.MeshStandardMaterial({ color: cS(0.36, 0.25, 0.16), roughness: 0.9, flatShading: true });
    const put = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    { const y = Hgt(0, 0); put(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.7, 8), wood), 0, y + 0.85, 0); put(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.16, 8), iron), 0, y + 1.42, 0);
      const ring = put(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.085, 8, 20), iron), 0, y + 1.0, 0.52); ring.rotation.x = 0.35; const lock = put(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.12), rust), 0, y + 0.5, 0.72); lock.rotation.x = 0.2; addCollider(0, 0, 0.7, 1.8); }
    { const [cx, cz] = [9, -102], y = Hgt(cx, cz); for (let i = 0; i < 7; i++) { const l = put(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 10), rust), cx + i * 0.27 - 0.8, y + 0.08 + (i % 2) * 0.04, cz + Math.sin(i * 0.9) * 0.22); l.rotation.set(i % 2 ? Math.PI / 2 : 0.25, i * 0.5, 0); } }
    { const [cx, cz] = [-108, -12];      // fix07-camp：0.5a 的帳篷、木箱、木桶拿掉，獵人營地整個在 buildPlaces06（hunter6 那一批）重擺
      campfire('hunter', '獵人營地', cx + 2.4, cz + 1.2); }      // 0.6：六處營火都用同一個做法（外觀不變）；火光改成六處共用一盞，見 buildPlaces06
    { const [cx, cz] = [158, -30]; const wb = place(inst('wheelbarrow', 1.5), cx, cz, 0.7); wb.rotation.z = 1.25; wb.position.y += 0.45; place(inst('crate_A_big', 1.3), cx + 1.8, cz + 0.6, 0.3); const c2 = place(inst('crate_B_small', 0.85), cx - 1.4, cz + 1.5, 1.2); c2.rotation.z = 0.5; place(inst('crate_long_A', 0.8), cx + 0.6, cz - 1.9, 2.0); place(inst('sack', 0.8), cx - 2.0, cz - 0.8, 0.4); addCollider(cx, cz, 1.0); addCollider(cx + 1.8, cz + 0.6, 0.8); }
  }
  // 路燈與火盆
  const flameGeo = new THREE.LatheGeometry([[0, 0], [0.3, 0.12], [0.4, 0.36], [0.3, 0.7], [0.13, 1.02], [0, 1.3]].map(q => new THREE.Vector2(q[0], q[1])), 8);
  const poleM = new THREE.MeshStandardMaterial({ color: cS(0.2, 0.17, 0.15), roughness: 0.8 });
  const lamp = (x, z, hgt, brazier) => {
    const g = new THREE.Group(), y = Hgt(x, z);
    if (brazier) { const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.36, 0.5, 8), poleM); bowl.position.y = hgt; const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, hgt, 6), poleM); stand.position.y = hgt / 2; g.add(bowl, stand); }
    else { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, hgt, 6), poleM); pole.position.y = hgt / 2; const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.09, 0.09), poleM); arm.position.set(0.32, hgt - 0.08, 0); g.add(pole, arm); }
    const glow = new THREE.Mesh(brazier ? flameGeo : new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.5) })); glow.position.set(brazier ? 0 : 0.62, brazier ? hgt + 0.2 : hgt - 0.42, 0); g.add(glow); let core = null; if (brazier) { core = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.0) })); core.scale.setScalar(0.55); core.position.y = 0.06; glow.add(core); } if (!brazier) { const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.12, 6), poleM); cage.position.set(0.62, hgt - 0.14, 0); g.add(cage); }
    g.traverse(o => { if (o.isMesh && o !== glow && o !== core) o.castShadow = true; }); g.position.set(x, y, z); scene.add(g); lamps.push({ glow, core, brazier, seed: x * 7 + z }); addCollider(x, z, 0.35); return g;
  };
  town.lamps.forEach(([x, z, hgt, brazier, ry]) => { lamp(x, z, hgt, brazier).rotation.y = ry; });
  W.fireLights = [[0, WORLD.ARENA_OUT + 2.6, 1], [0, -(WORLD.ARENA_OUT + 2.6), 1]].map(([x, z]) => { const l = new THREE.PointLight(cS(1, 0.55, 0.25), 0, 34, 2); l.position.set(x, Hgt(x, z) + 3, z); scene.add(l); return l; });
}

/* ---------- 獸王巢穴入口 ---------- */
export const winches = [];
function buildLair() {
  const M = W.models, [gx, gz] = LAIR_GATE, inst = (n, h) => fitHeight(M[n].clone(true), h);
  const proto = inst('wall_straight_gate', 13), pb = new THREE.Box3().setFromObject(proto), alongX = (pb.max.x - pb.min.x) >= (pb.max.z - pb.min.z);
  const gate = place(proto, gx, gz, alongX ? 0 : Math.PI / 2, 0.6), lm = {}; setMasonry(gate, lm, proto.scale.x, true); lm.m.color.setRGB(0.6, 0.56, 0.56);
  const door = new THREE.Mesh(new THREE.BoxGeometry(6.4, 8.4, 0.8), new THREE.MeshStandardMaterial({ color: cS(0.16, 0.11, 0.08), roughness: 0.9 })); door.position.set(gx, Hgt(gx, gz + 2) + 3.6, gz + 0.3); door.castShadow = true; W.scene.add(door);
  for (let i = -3; i <= 3; i++) addCollider(gx + i * 2.2, gz + 1.2, 1.6, 11);
  const wood = new THREE.MeshStandardMaterial({ color: cS(0.3, 0.2, 0.12), roughness: 0.9 }), iron = new THREE.MeshStandardMaterial({ color: cS(0.22, 0.22, 0.24), roughness: 0.6, metalness: 0.5 });
  [-8.5, 8.5].forEach((dx, i) => {
    const x = gx + dx, z = gz + 9, g = new THREE.Group(); g.position.set(x, Hgt(x, z), z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), wood); base.position.y = 0.25; const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10), wood); drum.position.y = 1.25; drum.rotation.z = Math.PI / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), iron); bar.position.set(0.95, 1.25, 0); const bar2 = bar.clone(); bar2.rotation.x = Math.PI / 2;
    g.add(base, drum, bar, bar2); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); W.scene.add(g); addCollider(x, z, 1.2); winches.push({ x, z, id: i });
  });
  [[-5.4, 4], [5.4, 4]].forEach(([dx, dz]) => { const x = gx + dx, z = gz + dz, glow = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.36, 0.14], [0.48, 0.42], [0.36, 0.84], [0.15, 1.2], [0, 1.55]].map(q => new THREE.Vector2(q[0], q[1])), 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.2, 0.4) })), stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.4, 2, 6), iron); stand.position.set(x, Hgt(x, z) + 1, z); glow.position.set(x, Hgt(x, z) + 2.05, z); W.scene.add(stand, glow); lamps.push({ glow, brazier: true, seed: dx, always: true }); addCollider(x, z, 0.5); });
}

/* ---------- 0.6 外環的地標（程式生成＋KayKit 小物） ---------- */
// 每個地點的零件全部烘進世界座標、併成一到三個靜態網格（平面著色的頂點色零件／KayKit 貼圖零件／砌石牆），各自做視錐剔除，太遠被霧吃掉就整個不畫。
// 營火是例外：每一處一個獨立的 Group（campSpots[i].holder），裡面先放佔位的營火；美術的 makeCampfire() 做好後 holder.clear(); holder.add(makeCampfire()) 就換掉了。
export const campSpots = [];
const P6 = { list: [], mats: null, stat: { tris: 0, meshes: 0 } };
const UG = {};
function unitGeo(k) {
  if (UG[k]) return UG[k];
  if (k === 'roof') { const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [.5, 0, .5], D = [-.5, 0, .5], E = [-.5, 1, 0], F = [.5, 1, 0], g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([A, F, B, A, E, F, D, C, F, D, F, E, A, D, E, B, F, C].flat(), 3)); g.computeVertexNormals(); return UG[k] = g; }
  return UG[k] = k === 'box' ? new THREE.BoxGeometry(1, 1, 1) : k === 'cyl' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8) : k === 'cyl6' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 6) : k === 'tap' ? new THREE.CylinderGeometry(0.3, 0.5, 1, 6) : k === 'cone' ? new THREE.ConeGeometry(0.5, 1, 6) : k === 'spike' ? new THREE.ConeGeometry(0.5, 1, 4) : k === 'dode' ? new THREE.DodecahedronGeometry(0.5, 0) : new THREE.IcosahedronGeometry(0.5, 0);
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _up = new THREE.Vector3(0, 1, 0);
const C6 = {};      // 色票（線性色）
function initP6() {
  const c = (r, g, b) => { const k = cS(r, g, b); return [k.r, k.g, k.b]; };
  Object.assign(C6, { wood: c(0.42, 0.29, 0.18), woodD: c(0.3, 0.2, 0.13), plank: c(0.62, 0.46, 0.29), pale: c(0.74, 0.6, 0.42), bark: c(0.33, 0.25, 0.18), cut: c(0.72, 0.56, 0.36), stone: c(0.58, 0.56, 0.53), stoneL: c(0.78, 0.75, 0.69), stoneD: c(0.4, 0.39, 0.38), iron: c(0.22, 0.22, 0.25), rust: c(0.45, 0.26, 0.16), ore: c(0.36, 0.25, 0.22), canvas: c(0.84, 0.78, 0.62), thatch: c(0.74, 0.62, 0.33), hay: c(0.86, 0.72, 0.36), salt: c(0.97, 0.96, 0.93), saltB: c(0.86, 0.9, 0.94), rope: c(0.62, 0.52, 0.36), moss: c(0.36, 0.52, 0.26), reed: c(0.5, 0.6, 0.28), reedD: c(0.36, 0.46, 0.22), cat: c(0.4, 0.26, 0.15), red: c(0.66, 0.14, 0.11), ice: c(0.78, 0.92, 1.0), iceD: c(0.55, 0.78, 0.95), bone: c(0.9, 0.87, 0.78), herb: c(0.42, 0.6, 0.3), dark: c(0.12, 0.09, 0.07) });
  let src = null; W.models.barrel.traverse(o => { if (o.isMesh && !src) src = o.material; });
  const kitM = src.clone(); kitM.vertexColors = true; let wsrc = null; W.models.wall_straight.traverse(o => { if (o.isMesh && !wsrc) wsrc = o.material; });
  const mas = masonry(wsrc, 1, true); mas.color.setRGB(0.6, 0.56, 0.56);
  P6.mats = { flat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }), kit: kitM, mason: mas };
}
let cb = null, cr = null;      // 目前的批次與亂數
const jit = () => 0.9 + cr() * 0.2;
const arrs = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function begin(name, seed, detail) { cb = { name, detail: !!detail, flat: arrs(), kit: arrs(), mason: arrs() }; cr = rng(seed); return cb; }
function putGeo(A, g, m, col, k, useUv) {
  const ps = g.attributes.position, ns = g.attributes.normal, us = g.attributes.uv, n = ps.count, base = A.pos.length / 3; _n3.getNormalMatrix(m);
  for (let i = 0; i < n; i++) { _v.fromBufferAttribute(ps, i).applyMatrix4(m); A.pos.push(_v.x, _v.y, _v.z); _v.fromBufferAttribute(ns, i).applyMatrix3(_n3).normalize(); A.nor.push(_v.x, _v.y, _v.z); if (useUv) A.uv.push(us.getX(i), us.getY(i)); A.col.push(col[0] * k, col[1] * k, col[2] * k); }
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) A.idx.push(ix[i] + base); } else for (let i = 0; i < n; i++) A.idx.push(base + i);
}
function prim(kind, x, y, z, sx, sy, sz, col, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); putGeo(cb.flat, unitGeo(kind), _m4, col, jit()); }
const box = (x, y, z, sx, sy, sz, col, ry, rx, rz) => prim('box', x, y, z, sx, sy, sz, col, ry, rx, rz);
// 兩點之間的一根料：w、h 是斷面；kind 可以換成圓木（cyl／cyl6）
function beam(x1, y1, z1, x2, y2, z2, w, h, col, kind = 'box') { _v.set(x2 - x1, y2 - y1, z2 - z1); const L = _v.length(); if (L < 1e-4) return; _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / L)); _m4.compose(_p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), _q, _s.set(w, L, h)); putGeo(cb.flat, unitGeo(kind), _m4, col, jit()); }
// 立在地上的柱子（底埋進地面 0.3）
const post = (x, z, h, w, col, kind = 'box', lean = 0, ry = 0) => prim(kind, x, groundH(x, z) + h / 2 - 0.3, z, w, h + 0.3, w, col, ry, lean, lean * 0.6);
// KayKit 的模型：高度 h、放在地上（o.y 指定底面高度）、朝向 ry；o.tint 色調、o.rx／o.rz 傾倒、o.mason 走砌石材質
function kit(name, h, x, z, ry = 0, o = {}) {
  const M = W.models[name]; if (!M.userData.bb) { M.updateMatrixWorld(true); M.userData.bb = new THREE.Box3().setFromObject(M); }
  const bb = M.userData.bb, s = h / (bb.max.y - bb.min.y); _e.set(o.rx || 0, ry, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
  const y = (o.y != null ? o.y : groundH(x, z)) - bb.min.y * s - (o.sink || 0); _m4.compose(_p.set(x, y, z), _q, _s.set(s * (o.sx || 1), s * (o.sy || 1), s * (o.sz || 1)));
  const tint = o.tint || [1, 1, 1], A = o.mason ? cb.mason : cb.kit, mm = new THREE.Matrix4();
  M.traverse(m => { if (m.isMesh && m.visible) putGeo(A, m.geometry, mm.multiplyMatrices(_m4, m.matrixWorld), tint, 1, true); });
}
function finish() {
  const b = cb, out = [];
  for (const k of ['flat', 'kit', 'mason']) {
    const A = b[k]; if (!A.idx.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3)); if (k !== 'flat') g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); if (k !== 'mason') g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
    g.setIndex(A.pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(A.idx), 1) : new THREE.BufferAttribute(new Uint16Array(A.idx), 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, P6.mats[k]); m.castShadow = !b.detail; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'p6-' + b.name + '-' + k; W.scene.add(m);
    P6.list.push({ o: m, c: g.boundingSphere.center, r: g.boundingSphere.radius, detail: b.detail }); P6.stat.tris += A.idx.length / 3; P6.stat.meshes++; out.push(m);
  }
  cb = null; return out;
}
// 營火的大小與座位（holder 的區域座標；fitCampfires 之後整組轉向）。每一項 [離火多遠, 方位, 倒木?]，方位同美術的 makeCampfire（0 朝 +z）。
// 美術原本的三個座位（兩個木樁、一段倒木）照 1.3 倍往外擺；大一點的營地多一段倒木。獵人營地：哈根站在營火西北 2.7 公尺、北邊是路口，座位固定擺在東、南（fixed：不自動轉向）
const FIRE = { k: 1.3, fixed: { hunter: 1 }, seats: { hunter: [[2.65, 2.25, 0], [2.65, 0.25, 0], [2.75, 1.25, 1]], base: [[2.65, 0.75, 0], [2.65, 2.6, 0], [2.75, 4.55, 1]], fork: [[2.65, 0.75, 0], [2.65, 2.6, 0], [2.75, 4.55, 1], [2.8, 5.95, 1]], ranch: [[2.65, 0.75, 0], [2.65, 2.6, 0], [2.75, 4.55, 1], [2.8, 5.95, 1]], post: [[2.65, 0.75, 0], [2.65, 2.6, 0], [2.75, 4.55, 1], [2.8, 5.95, 1]] } };
// 把座位併成一個網格放進 holder，回傳座位清單（同 makeCampfire 的 userData.seats：x、z、y 坐面高、face 面向火）
function campSeats(h, list) {
  const parts = [], seats = [], m4 = new THREE.Matrix4();
  for (const [d, a, bench] of list) { const x = Math.sin(a) * d, z = Math.cos(a) * d, o = W.mkProp(bench ? 'logseat' : 'stump'); if (!o) continue;
    m4.makeRotationY(bench ? a : a * 2.3).setPosition(x, 0, z); parts.push([o, m4.clone()]);
    if (bench) for (const k of [-0.42, 0.42]) seats.push({ x: x + Math.cos(a) * k, z: z - Math.sin(a) * k, y: 0.5, face: a + Math.PI }); else seats.push({ x, z, y: 0.44, face: a + Math.PI }); }
  if (!parts.length) return seats;
  const keys = Object.keys(parts[0][0].geometry.attributes), acc = {}, n3 = new THREE.Matrix3(), v = new THREE.Vector3(); keys.forEach(k => { acc[k] = []; });
  for (const [o, mm] of parts) { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; n3.getNormalMatrix(mm);
    for (const k of keys) { const a = g.attributes[k]; if (!a) continue; for (let i = 0; i < a.count; i++) { if (k === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(mm); acc[k].push(v.x, v.y, v.z); } else if (k === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(n3).normalize(); acc[k].push(v.x, v.y, v.z); } else for (let c = 0; c < a.itemSize; c++) acc[k].push(c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i)); } }
    o.geometry.dispose(); }
  const g = new THREE.BufferGeometry(); for (const k of keys) g.setAttribute(k, new THREE.Float32BufferAttribute(acc[k], parts[0][0].geometry.attributes[k].itemSize)); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, parts[0][0].material); mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'camp-seats'; h.add(mesh); return seats;
}
// 營火：有美術的 makeCampfire（props06.js）就用它（自己帶一盞共用的火光；放大 FIRE.k 倍，座位由 campSeats 用美術的木樁、倒木另外擺）；沒有就放佔位的火堆（外觀同 0.5a 獵人營地那一堆）。回傳 holder
function campfire(id, name, x, z) {
  const y = groundH(x, z), h = new THREE.Group(); h.position.set(x, y, z); h.name = 'campfire-' + id; W.scene.add(h);
  if (W.mkFire) { const f = W.mkFire({ seed: campSpots.length + 3, seats: !W.mkProp }), ud = f.userData; h.add(f);
    if (W.mkProp) { f.scale.setScalar(FIRE.k); ud.radius = (ud.radius || 0.85) * FIRE.k; ud.seats = campSeats(h, FIRE.seats[id] || FIRE.seats.base); }      // 0.6 第二波之二：營火放大 1.3 倍，座位照比例往外擺（木樁、倒木本身維持原大小）
    addCollider(x, z, ud.radius || 0.85, 1); campSpots.push({ id, name, x, y, z, holder: h, fire: f, seats: [] }); return h; }
  // 石頭與柴併成一個網格（頂點色），加兩層火焰：一堆佔位的營火只有三個網格
  const mat = campfire.mat || (campfire.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })), f1 = campfire.f1 || (campfire.f1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.5) })), f2 = campfire.f2 || (campfire.f2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.1) }));
  if (!campfire.geo) { const A = arrs(), st = cS(0.4, 0.38, 0.36), wd = cS(0.36, 0.25, 0.16), dg = new THREE.DodecahedronGeometry(0.2, 0), lg = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; _e.set(0, a, 0, 'XYZ'); _q.setFromEuler(_e); _m4.compose(_p.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62), _q, _s.set(1, 1, 1)); putGeo(A, dg, _m4, [st.r, st.g, st.b], 1); }
    for (let i = 0; i < 3; i++) { _e.set(Math.PI / 2 - 0.25, i * 2.1, 0, 'XYZ'); _q.setFromEuler(_e); _m4.compose(_p.set(0, 0.16, 0), _q, _s.set(1, 1, 1)); putGeo(A, lg, _m4, [wd.r, wd.g, wd.b], 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3)); g.setIndex(A.idx); campfire.geo = g; campfire.c1 = new THREE.ConeGeometry(0.28, 0.75, 7); campfire.c2 = new THREE.ConeGeometry(0.15, 0.45, 6); }
  const base = new THREE.Mesh(campfire.geo, mat); base.castShadow = base.receiveShadow = true; h.add(base);
  const a = new THREE.Mesh(campfire.c1, f1); a.position.y = 0.55; const b = new THREE.Mesh(campfire.c2, f2); b.position.y = 0.45; h.add(a, b);
  addCollider(x, z, 0.7, 1); campSpots.push({ id, name, x, y, z, holder: h, fire: null, seats: [] }); return h;
}
// 離最近的碰撞體表面多遠（圓與方塊；附近沒有回傳 9）
function clearAt(x, z, skip) {
  let d = 9; const cx = Math.floor(x / HASH), cz = Math.floor(z / HASH);
  for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) { const l = grid.get(key(ix, iz)); if (l) for (const c of l) if (!skip || Math.hypot(c.x - skip[0], c.z - skip[1]) > 0.1) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r); }
  for (const b of boxes) { const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz > (b.R + 9) * (b.R + 9)) continue; const ex = Math.abs(dx * b.c - dz * b.s) - b.hw, ez = Math.abs(dx * b.s + dz * b.c) - b.hd; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0)); }
  return d;
}
// 美術的營火帶三個座位（兩個木樁、一段倒木）：等周圍的帳篷雜物都擺好之後，把每一堆營火轉到座位最不擋東西、不壓在路上的方向，並記下座位的世界座標
function fitCampfires() {
  for (const c of campSpots) { if (!c.fire) continue; const S = c.fire.userData.seats || []; let best = 0, bs = -1e9;
    for (let k = 0; k < (FIRE.fixed[c.id] && W.mkProp ? 0 : 16); k++) { const R = k / 16 * TAU, cs = Math.cos(R), sn = Math.sin(R); let sc = 9; for (const q of S) { const x = c.x + q.x * cs + q.z * sn, z = c.z - q.x * sn + q.z * cs; for (const nq of npcSpots) sc = Math.min(sc, Math.hypot(x - nq.x, z - nq.z) - 1.0); sc = Math.min(sc, Math.min(1.1, clearAt(x, z, [c.x, c.z])), Math.min(1.1, roadDist(x, z) - 1.4), blockedAt(x, z) ? -1 : 1.1, 1.1 - Math.abs(groundH(x, z) - c.y) * 2, waterDepth(x, z) > -0.2 ? -1 : 1.1); } if (sc > bs + 1e-6) { bs = sc; best = R; } }
    c.holder.rotation.y = best; c.rot = best; const cs = Math.cos(best), sn = Math.sin(best); c.seats = S.map(q => ({ x: c.x + q.x * cs + q.z * sn, z: c.z - q.x * sn + q.z * cs, y: c.y + q.y, face: q.face + best })); }
}
// 一段木柵：沿折線每隔約 2.2 公尺一根樁、兩道橫木，跟著地面起伏。broken：0–1，壞掉的比例（缺橫木、歪樁）。回傳樁的位置
function fence(pts, o = {}) {
  const gap = o.gap || 2.2, h = o.h || 1.15, col = o.col || C6.wood, brk = o.broken || 0, posts = [];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / gap)); for (let k = i ? 1 : 0; k <= n; k++) posts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  posts.forEach(([x, z], i) => {
    const gone = cr() < brk * 0.25; if (!gone) post(x, z, h + 0.15, 0.2, col, 'box', cr() < brk ? (cr() - 0.5) * 0.5 : 0, cr() * 0.4);
    if (i === posts.length - 1) return; const [x2, z2] = posts[i + 1], y1 = groundH(x, z), y2 = groundH(x2, z2), r = cr();
    if (r < brk * 0.55) { if (r < brk * 0.3) beam(x, y1 + h * 0.85, z, x2, y2 + 0.12, z2, 0.1, 0.16, col); return; }      // 整段沒了，或是一頭掉在地上
    beam(x, y1 + h * 0.85, z, x2, y2 + h * 0.85, z2, 0.1, 0.16, col); if (cr() > brk * 0.5) beam(x, y1 + h * 0.45, z, x2, y2 + h * 0.45, z2, 0.1, 0.16, col);
    if (!o.open) addCollider((x + x2) / 2, (z + z2) / 2, Math.hypot(x2 - x, z2 - z) * 0.45, 1.2);
  });
  return posts;
}
// 殘牆：從 a 到 b 一塊一塊疊，頂端參差。h 最高處、th 厚度
function ruinWall(ax, az, bx, bz, h, th = 0.75, col = C6.stone, low = 0.35) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 1.3)), ry = -Math.atan2(bz - az, bx - ax), prof = cr() * 6;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, hh = h * (low + (1 - low) * (0.5 + 0.5 * Math.sin(prof + t * 5.2)) * (0.75 + cr() * 0.25)), y = groundH(x, z); box(x, y + hh / 2 - 0.2, z, L / n * 1.02, hh + 0.4, th * (0.92 + cr() * 0.16), col, ry); if (cr() < 0.35) box(x, y + hh + 0.12, z, L / n * 0.55, 0.3, th * 0.9, C6.stoneL, ry + (cr() - 0.5) * 0.2); }
  for (let k = 0; k < Math.round(L / 3); k++) { const t = cr(), s = 0.35 + cr() * 0.35, ox = (cr() - 0.5) * 3.2, oz = (cr() - 0.5) * 3.2, x = ax + (bx - ax) * t + ox, z = az + (bz - az) * t + oz; box(x, groundH(x, z) + s * 0.3, z, s * 1.3, s * 0.7, s, col, cr() * 3, (cr() - 0.5) * 0.4); }
  addBox((ax + bx) / 2, (az + bz) / 2, L / 2, th / 2 + 0.1, ry, h);
}
// 一小叢東西（箱子、木桶、麻袋）
function clutter(x, z, list) { list.forEach(([n, h, dx, dz, ry, cr2]) => { kit(n, h, x + dx, z + dz, ry || 0); if (cr2) addCollider(x + dx, z + dz, cr2); }); }
// 圓木座位
const logSeat = (x, z, ry, L = 1.6) => { if (W.mkFire) return; const y = groundH(x, z); prim('cyl', x, y + 0.24, z, 0.5, L, 0.5, C6.bark, ry, 0, Math.PI / 2); addCollider(x, z, 0.55, 0.6); };
/* 0.6 第二波之二：營地的布置（柴堆、劈柴墩、手推貨車、拴馬橫木、布棚、旗桿、晾皮架）。都併進目前的批次，碰撞自己加 */
// 柴堆：一層層橫放的劈柴（往上少一根），兩端是淺色的切面；L 長度、n 最下層幾根
function woodpile(x, z, ry, L = 1.5, n = 4) { const y = groundH(x, z), c = Math.cos(ry), s = Math.sin(ry), r = 0.17;
  for (let lv = 0; lv < n; lv++) for (let i = 0; i < n - lv; i++) { const o = (i - (n - lv - 1) / 2) * r * 2.05, ox = -s * o, oz = -c * o, yy = y + r + lv * r * 1.75, j = (cr() - 0.5) * 0.25; beam(x + ox - c * L / 2 + c * j, yy, z + oz + s * L / 2 - s * j, x + ox + c * L / 2 + c * j, yy, z + oz - s * L / 2 - s * j, r * 2, r * 2, cr() < 0.3 ? C6.woodD : C6.bark, 'cyl6');
    for (const e of [-1, 1]) prim('cyl6', x + ox + c * (L / 2 * e + j + e * 0.005), yy, z + oz - s * (L / 2 * e + j + e * 0.005), r * 1.8, 0.03, r * 1.8, C6.cut, ry, 0, Math.PI / 2); }
  addCollider(x, z, Math.max(L, n * r * 2) * 0.55, n * r * 1.75); }
// 劈柴墩：一截粗樹樁、上面斜插一把斧頭，旁邊兩塊劈好的柴
function chopBlock(x, z, ry = 0) { const y = groundH(x, z), c = Math.cos(ry), s = Math.sin(ry); prim('cyl', x, y + 0.28, z, 0.75, 0.62, 0.75, C6.bark); prim('cyl', x, y + 0.6, z, 0.68, 0.03, 0.68, C6.cut);
  const hx = x + c * 0.08, hz = z - s * 0.08; beam(hx, y + 0.62, hz, hx + c * 0.42, y + 1.18, hz - s * 0.42, 0.06, 0.06, C6.pale); box(hx + c * 0.02, y + 0.66, hz - s * 0.02, 0.05, 0.16, 0.26, C6.iron, ry + Math.PI / 2, 0, 0.6);
  for (const k of [-1, 1]) box(x + s * 0.65 * k - c * 0.2, y + 0.08, z + c * 0.65 * k + s * 0.2, 0.18, 0.16, 0.55, C6.wood, ry + 0.6 * k, 0, 0.2 * k); addCollider(x, z, 0.45, 0.7); }
// 手推貨車：車斗（底板＋三面擋板）、一對車輪、兩根車把（前端擱在地上）；load：車上的貨（KayKit 名稱、高度、沿車身、橫向）
function handcart(x, z, ry, load = []) { const y = groundH(x, z), c = Math.cos(ry), s = Math.sin(ry), P = (u, v) => [x + c * u + s * v, z - s * u + c * v], tilt = -0.12, bedY = 0.95;
  { const [px, pz] = P(0, 0); box(px, y + bedY, pz, 2.4, 0.12, 1.5, C6.plank, ry, 0, tilt); }
  for (const v of [-0.72, 0.72]) { const [px, pz] = P(0, v); box(px, y + bedY + 0.28, pz, 2.4, 0.45, 0.08, C6.wood, ry, 0, tilt); } { const [px, pz] = P(-1.17, 0); box(px, y + bedY + 0.42, pz, 0.08, 0.5, 1.5, C6.wood, ry, 0, tilt); }
  for (const v of [-0.92, 0.92]) { const [px, pz] = P(0.1, v); prim('cyl', px, y + 0.62, pz, 1.24, 0.14, 1.24, C6.woodD, ry, Math.PI / 2, 0); prim('cyl', px, y + 0.62, pz, 0.3, 0.2, 0.3, C6.iron, ry, Math.PI / 2, 0); for (let k = 0; k < 3; k++) box(px, y + 0.62, pz, 1.08, 0.07, 0.08, C6.wood, ry, 0, k / 3 * Math.PI); }
  { const [ax, az] = P(0.1, 0); box(ax, y + 0.62, az, 0.1, 0.1, 1.9, C6.iron, ry); }
  for (const v of [-0.55, 0.55]) { const [ax, az] = P(1.1, v), [bx, bz] = P(2.6, v * 0.8); beam(ax, y + bedY - 0.12, az, bx, groundH(bx, bz) + 0.12, bz, 0.09, 0.09, C6.woodD); }
  for (const [n, h, u, v, r2] of load) { const [px, pz] = P(u, v); kit(n, h, px, pz, ry + (r2 || 0), { y: y + bedY + 0.06 + u * Math.tan(tilt) }); }
  { const [cx, cz] = P(0.3, 0); addCollider(cx, cz, 1.35, 1.6); const [qx, qz] = P(2.0, 0); addCollider(qx, qz, 0.55, 0.8); } }
// 拴馬橫木：兩根柱、一根橫木
function hitchRail(ax, az, bx, bz) { post(ax, az, 1.1, 0.2, C6.wood); post(bx, bz, 1.1, 0.2, C6.wood); beam(ax, groundH(ax, az) + 1.0, az, bx, groundH(bx, bz) + 1.0, bz, 0.14, 0.14, C6.wood); const L = Math.hypot(bx - ax, bz - az); for (let t = 0.5; t < L; t += 1.6) addCollider(ax + (bx - ax) * t / L, az + (bz - az) * t / L, 0.5, 1.2); }
// 布棚：四根柱撐一塊往後斜的帆布（前高後低），w 寬（沿 ry 方向）、d 深
function awning(x, z, ry, w = 3.4, d = 2.6, col = C6.canvas) { const c = Math.cos(ry), s = Math.sin(ry), P = (u, v) => [x + c * u + s * v, z - s * u + c * v], y = groundH(x, z), hf = 2.5, hb = 1.9;
  for (const [u, v, h] of [[-w / 2, d / 2, hf], [w / 2, d / 2, hf], [-w / 2, -d / 2, hb], [w / 2, -d / 2, hb]]) { const [px, pz] = P(u, v); post(px, pz, h + 0.1, 0.14, C6.woodD); }
  { const [px, pz] = P(0, 0); box(px, y + (hf + hb) / 2 + 0.08, pz, w + 0.5, 0.07, d + 0.6, col, ry, -Math.atan2(hf - hb, d), 0); }
  for (const v of [d / 2 + 0.25]) for (let i = 0; i < 5; i++) { const u = -w / 2 - 0.25 + (i + 0.5) * (w + 0.5) / 5, [px, pz] = P(u, v); prim('spike', px, y + hf + 0.15 - 0.16, pz, 0.32 * (w + 0.5) / 5 * 1.6, 0.32, 0.06, i % 2 ? C6.red : col, ry, Math.PI, 0); } }      // 前緣一排三角布條（紅白相間）
// 旗桿：KayKit 的紅旗（自帶旗桿）
function flagPole(x, z, h = 4.2, ry = 0) { kit('flag_red', h, x, z, ry, { sink: 0.1 }); addCollider(x, z, 0.3, h); }
// 晾皮架：兩根柱、一根橫桿，掛著兩三張攤開的獸皮
function hideRack(x, z, ry, n = 3) { const c = Math.cos(ry), s = Math.sin(ry), L = 0.9 * n + 0.4, ax = x - c * L / 2, az = z + s * L / 2, bx = x + c * L / 2, bz = z - s * L / 2; post(ax, az, 2.1, 0.16, C6.wood); post(bx, bz, 2.1, 0.16, C6.wood); const ya = groundH(ax, az) + 1.95, yb = groundH(bx, bz) + 1.95; beam(ax, ya, az, bx, yb, bz, 0.1, 0.1, C6.wood);
  const pel = [[0.55, 0.38, 0.24], [0.66, 0.5, 0.33], [0.42, 0.3, 0.2]].map(q => { const k = cS(...q); return [k.r, k.g, k.b]; });
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = lerp(ya, yb, t), col = pel[i % 3], P2 = (u, v) => [px + c * u, py + v, pz - s * u];      // 攤開的獸皮：身體、四條腿的皮、尾巴
    box(px, py - 0.5, pz, 0.62, 0.86, 0.05, col, ry, 0.05, 0); box(px, py - 0.12, pz, 0.36, 0.2, 0.05, col, ry, 0.05, 0);
    for (const [u, v, a] of [[-0.36, -0.2, 0.7], [0.36, -0.2, -0.7], [-0.34, -0.86, -0.6], [0.34, -0.86, 0.6]]) { const [qx, qy, qz] = P2(u, v); box(qx, qy, qz, 0.16, 0.34, 0.045, col, ry, 0.05, a); }
    { const [qx, qy, qz] = P2(0, -1.02); box(qx, qy, qz, 0.09, 0.3, 0.045, col, ry, 0.05, 0.15); } }
  addCollider(x, z, L * 0.5, 2); }
// 尖木樁（哨站的拒馬）
const stake = (x, z, h, lean, ry) => { const y = groundH(x, z); prim('cyl6', x, y + h / 2 - 0.3, z, 0.26, h, 0.26, C6.wood, ry, lean, 0); prim('cone', x + Math.sin(ry) * Math.sin(lean) * (h / 2 + 0.2), y + Math.cos(lean) * (h / 2 + 0.2) + h / 2 - 0.3, z + Math.cos(ry) * Math.sin(lean) * (h / 2 + 0.2), 0.26, 0.5, 0.26, C6.pale, ry, lean, 0); };
// 木橋與釣臺：橋面板、縱樑、欄杆、橋樁（立在河床上）。d 是 decks 裡的一項
function buildDeck(d, def) {
  const hw = def.w / 2, hl = d.hl, c = d.c, s = d.s, ry = -Math.atan2(s, c), P = (u, v) => [d.x + c * u - s * v, d.z + s * u + c * v], Y = u => { const t = u / hl; return d.y0 + (d.y1 - d.y0) * (t * 0.5 + 0.5) + d.arch * (1 - t * t); };
  const N = Math.round(def.len / 0.62);
  for (let i = 0; i < N; i++) { const u = -hl + (i + 0.5) * (2 * hl / N), [x, z] = P(u, 0), sl = Math.atan2(Y(u + 0.3) - Y(u - 0.3), 0.6); box(x, Y(u) - 0.07, z, 2 * hl / N * 0.94, 0.13, def.w + 0.24 + (cr() - 0.5) * 0.16, cr() < 0.2 ? C6.pale : C6.plank, ry, 0, sl); }
  const SEG = 6; for (const v of [-hw * 0.72, hw * 0.72]) for (let i = 0; i < SEG; i++) { const u0 = -hl + i * 2 * hl / SEG, u1 = u0 + 2 * hl / SEG, [x0, z0] = P(u0, v), [x1, z1] = P(u1, v); beam(x0, Y(u0) - 0.3, z0, x1, Y(u1) - 0.3, z1, 0.28, 0.34, C6.woodD); }
  const np = Math.max(2, Math.round(def.len / 2.7)), rail = [-1, 1].map(() => []);
  [-1, 1].forEach((sd, si) => { for (let i = 0; i <= np; i++) { const u = -hl + 0.25 + i * (2 * hl - 0.5) / np, [x, z] = P(u, sd * (hw + 0.02)), y = Y(u); box(x, y + 0.6, z, 0.2, 1.3, 0.2, C6.wood, ry); rail[si].push([x, y, z]);
      const wl = waterLevel(x, z); if (wl > -1e8 && wl > groundH(x, z) + 0.05) { const gb = groundH(x, z); prim('cyl6', x, (y + gb) / 2 - 0.3, z, 0.3, y - gb + 0.6, 0.3, C6.woodD); } }
    for (let i = 0; i < np; i++) { const a = rail[si][i], b = rail[si][i + 1]; beam(a[0], a[1] + 1.16, a[2], b[0], b[1] + 1.16, b[2], 0.12, 0.16, C6.wood); beam(a[0], a[1] + 0.62, a[2], b[0], b[1] + 0.62, b[2], 0.08, 0.12, C6.wood); }
    const [bx, bz] = P(0, sd * (hw + 0.7)); addBox(bx, bz, hl, 0.8, ry, 1.3); });
  if (def.flat) { const a = rail[0][np], b = rail[1][np]; beam(a[0], a[1] + 1.16, a[2], b[0], b[1] + 1.16, b[2], 0.12, 0.16, C6.wood); beam(a[0], a[1] + 0.62, a[2], b[0], b[1] + 0.62, b[2], 0.08, 0.12, C6.wood); const [ex, ez] = P(hl + 0.7, 0); addBox(ex, ez, 0.8, hw + 1.5, ry, 1.3); }      // 釣臺：盡頭也有欄杆
}
// 沿某個方向往外找岩壁的腳（通道邊緣再進去 pad 公尺）
function wallFoot(x, z, dx, dz, pad = 0.5, max = 40) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; for (let t = 0; t < max; t += 0.5) if (corrDist(x + dx * t, z + dz * t) > pad) return [x + dx * t, z + dz * t, t]; return [x + dx * max, z + dz * max, max]; }
// 小屋／棚子用的人字屋頂：中心、寬（沿屋脊）、深、簷高、脊高、朝向
function gable(x, y, z, w, d, hRoof, col, ry, over = 0.35) { prim('roof', x, y, z, w + over * 2, hRoof, d + over * 2, col, ry); }
function buildPlaces06() {
  initP6(); const fire = id => { const c = CAMPS.find(q => q.id === id); return campfire(c.id, c.name, c.x, c.z); };
  const G = groundH;
  /* ===== 南：鏡溪木橋、釣臺、舊牧欄營地、蘆葦、狼丘 ===== */
  begin('bridge', 11); BRIDGES.forEach((b, i) => buildDeck(decks[i], b));
  { const d = decks[0], b = BRIDGES[0]; for (const e of [-1, 1]) for (const sd of [-1, 1]) { const u = e * (d.hl + 0.5), v = sd * (b.w / 2 + 0.9), x = d.x + d.c * u - d.s * v, z = d.z + d.s * u + d.c * v; kit('rock_single_C', 1.3 + cr() * 0.5, x, z, cr() * 6, { tint: [1.5, 1.45, 1.36], sink: 0.2 }); } }      // 橋頭兩側的石塊
  finish();
  begin('hunter6', 27);
  /* fix07-camp：獵人營地做大（使用者 11-16「營地有點太小」）。營火、哈根、任務判定都不動；0.5a 的帳篷、木箱、木桶拿掉，整個營地改成這一批（平面頂點色＋KayKit 各一個網格）＋一個自發光網格（燈籠與熏肉坑的炭火）。
     營地被四群野獸的老家夾住（東邊灰狼 24 公尺、南邊棕熊 23、西邊棕熊 29、北邊棕熊 31）：邊緣離灰狼 20、棕熊 15 公尺以上，所以往西、往北（兩條小徑中間）長，東邊只到路口。
     三頂帳篷圍著營火的南半圈、門朝路口；營火西邊（教學夾子旁）是修夾子的工作區；路口西北、兩條小徑中間是處理獵物的區；西北小徑的入口兩根掛燈的木柱。座標都是世界座標 */
  { const c = CAMPS.find(q => q.id === 'hunter'), fx = c.x, fz = c.z, GH = groundH, glow = [], E = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
    const PT = (x, z, ry) => { const cc = Math.cos(ry), s = Math.sin(ry); return (u, v) => [x + cc * u + s * v, z - s * u + cc * v]; };
    const geoC = {}, gput = (k, mk, x, y, z, sx, sy, sz, col, ry = 0, rx = 0, rz = 0) => { const g = geoC[k] || (geoC[k] = mk()); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); putGeo(cb.flat, g, _m4, col, jit()); };
    const ring = (x, y, z, r, t, col, ry = 0, rx = 0) => gput('ring' + t, () => new THREE.TorusGeometry(0.5, t, 4, 12), x, y, z, r * 2, r * 2, r * 2, col, ry, rx);      // 鐵環、繩圈（t：管徑對半徑的比例）
    const glowAt = (x, y, z, r, sy = 1) => glow.push([x, y, z, r, sy]);
    const k6 = q => { const k = cS(...q); return [k.r, k.g, k.b]; }, MEAT = k6([0.5, 0.2, 0.13]), MEATD = k6([0.36, 0.14, 0.1]), FUR = k6([0.52, 0.37, 0.24]), FURD = k6([0.38, 0.27, 0.18]), ASH = k6([0.22, 0.2, 0.19]);
    const grow = (x, z, r) => { E.x0 = Math.min(E.x0, x - r); E.x1 = Math.max(E.x1, x + r); E.z0 = Math.min(E.z0, z - r); E.z1 = Math.max(E.z1, z + r); };
    // 一把捕獸夾：一圈鐵顎＋中間的踏板（open＝張開平放；掛著的用 rx 立起來）
    const jaw = (x, y, z, ry, hang, s = 1) => { const cc = Math.cos(ry), sn = Math.sin(ry);
      if (hang) { ring(x, y, z, 0.17 * s, 0.09, C6.iron, ry, 0); box(x, y, z, 0.12 * s, 0.12 * s, 0.03, C6.rust, ry); box(x, y - 0.25 * s, z, 0.05, 0.16 * s, 0.05, C6.iron, ry); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; box(x + cc * Math.cos(a) * 0.14 * s, y + Math.sin(a) * 0.14 * s, z - sn * Math.cos(a) * 0.14 * s, 0.035, 0.035, 0.035, C6.iron, ry, 0, a); } return; }
      ring(x, y, z, 0.17 * s, 0.09, C6.iron, ry, Math.PI / 2); box(x, y, z, 0.12 * s, 0.025, 0.12 * s, C6.rust, ry); for (const e of [-1, 1]) box(x + cc * e * 0.27 * s, y, z - sn * e * 0.27 * s, 0.18 * s, 0.04, 0.05, C6.iron, ry);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; box(x + Math.cos(a) * 0.14 * s, y + 0.02, z + Math.sin(a) * 0.14 * s, 0.035, 0.05, 0.035, C6.iron, a); } };
    // 帳篷：ry 是門的方向（區域 +x）；L 長（沿屋脊）、Wd 寬、H 高、wall 側牆高（主帳）。帆布、門洞、捲起的門簾、屋脊桿、前後柱、拉繩與地樁
    const tent = (x, z, ry, L, Wd, H, o = {}) => { const P = PT(x, z, ry), y = GH(x, z) - 0.05, wall = o.wall || 0, col = o.col || C6.canvas, hr = H - wall;
      if (wall) { for (const v of [-Wd / 2, Wd / 2]) { const [px, pz] = P(0, v); box(px, y + wall / 2, pz, L, wall + 0.1, 0.08, col, ry); } { const [px, pz] = P(-L / 2, 0); box(px, y + wall / 2, pz, 0.08, wall + 0.1, Wd, col, ry); } }
      prim('roof', x, y + wall, z, L, hr, Wd + 0.14, col, ry);
      { const [px, pz] = P(L / 2 + 0.012, 0); if (wall) box(px, y + wall * 0.5, pz, 0.03, wall, Wd * 0.46, C6.dark, ry); prim('roof', px, y + wall, pz, 0.03, hr * 0.62, Wd * 0.46 * (wall ? 1.25 : 1.05), C6.dark, ry); }      // 門洞
      for (const e of [-1, 1]) { const [ax, az] = P(L / 2 + 0.05, e * 0.12), [bx, bz] = P(L / 2 + 0.05, e * (Wd / 2 - 0.1)); beam(ax, y + H - 0.12, az, bx, y + wall + 0.12, bz, 0.13, 0.13, o.flap || C6.pale, 'cyl6'); }      // 捲起的門簾
      { const [ax, az] = P(-L / 2 - 0.22, 0), [bx, bz] = P(L / 2 + 0.32, 0); beam(ax, y + H + 0.04, az, bx, y + H + 0.04, bz, 0.09, 0.09, C6.woodD, 'cyl6'); }
      for (const e of [-1, 1]) { const [px, pz] = P(e * (L / 2 + 0.14), 0); post(px, pz, H + 0.12, 0.1, C6.woodD, 'cyl6');
        const [sx, sz] = P(e * (L / 2 + 1.05), 0); beam(px, y + H, pz, sx, GH(sx, sz) + 0.12, sz, 0.025, 0.025, C6.rope); post(sx, sz, 0.32, 0.06, C6.pale); }
      for (const e of [-1, 1]) for (const u of [-L * 0.3, L * 0.3]) { const [ax, az] = P(u, e * (Wd / 2 + 0.04)), [sx, sz] = P(u, e * (Wd / 2 + 0.75)); beam(ax, y + wall + 0.05, az, sx, GH(sx, sz) + 0.1, sz, 0.022, 0.022, C6.rope); post(sx, sz, 0.28, 0.06, C6.pale); }
      addBox(x, z, L / 2 + 0.1, Wd / 2 + 0.1, ry, H); grow(x, z, Math.hypot(L, Wd) / 2 + 0.6); return P; };
    // 1. 三頂帳篷：主帳（有側牆、屋脊上搭著兩張毛皮、門口掛燈、門前一張毛皮地墊）在西南，兩頂小的在西邊與東南，門都朝營火與路口
    { const P = tent(-109.8, -5.4, 0.91, 3.6, 3.2, 2.7, { wall: 0.75 }), y = GH(-109.8, -5.4) - 0.05, tilt = Math.atan2(2.7 - 0.75, 1.6), sl = Math.hypot(1.95, 1.6);
      for (const [u, e, col] of [[-0.75, 1, FUR], [-0.55, -1, FURD]]) { const [px, pz] = P(u, e * 0.85); box(px, y + 0.75 + 1.95 / 2 + 0.07, pz, 1.05, 0.05, sl * 0.95, col, 0.91, e * tilt); }
      { const [px, pz] = P(2.25, 0); box(px, GH(px, pz) + 0.02, pz, 1.1, 0.03, 0.85, FURD, 0.91 + 0.15); }
      { const [px, pz] = P(2.12, 0.0), gy = y + 2.7 - 0.36; box(px, gy + 0.2, pz, 0.24, 0.05, 0.24, C6.iron, 0.91); box(px, gy - 0.2, pz, 0.22, 0.05, 0.22, C6.iron, 0.91); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [qx, qz] = P(2.12 + a * 0.1, b * 0.1); box(qx, gy, qz, 0.03, 0.4, 0.03, C6.iron); } const [rx, rz] = P(2.12, 0); beam(rx, gy + 0.22, rz, rx, y + 2.74, rz, 0.02, 0.02, C6.rope); glowAt(px, gy, pz, 0.13, 1.25); }
      clutter(0, 0, [['barrel', 1.05, -111.6, -2.6, 0.4, 0.55], ['sack', 0.7, -112.3, -3.6, 1.1, 0]]); }
    { const P = tent(-117.0, -2.4, 0.45, 2.8, 2.4, 2.05, { col: k6([0.8, 0.72, 0.56]) }); const [px, pz] = P(1.9, 0.7); kit('bucket_water', 0.55, px, pz, 0.3); }
    { const P = tent(-100.8, -4.2, 2.1, 2.8, 2.4, 2.05, { col: k6([0.78, 0.74, 0.6]), flap: C6.canvas }); const [px, pz] = P(0.4, 1.75); kit('sack', 0.7, px, pz, 0.8); }
    // 2. 修夾子的工作區（營火西邊，教學夾子就在旁邊的空地）：木樁腳的長桌（桌上兩把張開的夾子、一卷繩、鐵鎚）、掛滿夾子與繩圈的木架、磨刀石
    { const x = -115.8, z = -7.6, ry = 0.25, P = PT(x, z, ry), y = GH(x, z);
      box(x, y + 0.84, z, 2.1, 0.1, 0.78, C6.plank, ry); { const [px, pz] = P(0, 0.36); box(px, y + 0.74, pz, 2.0, 0.12, 0.04, C6.woodD, ry); }
      for (const u of [-0.78, 0.78]) { for (const e of [-1, 1]) { const [ax, az] = P(u, -0.36 * e), [bx, bz] = P(u, 0.32 * e); beam(ax, y - 0.05, az, bx, y + 0.8, bz, 0.09, 0.09, C6.wood); } }
      { const [ax, az] = P(-0.78, 0), [bx, bz] = P(0.78, 0); beam(ax, y + 0.4, az, bx, y + 0.4, bz, 0.07, 0.07, C6.woodD); }
      { const [px, pz] = P(-0.5, 0.02); jaw(px, y + 0.91, pz, ry + 0.3); } { const [px, pz] = P(0.18, -0.12); jaw(px, y + 0.91, pz, ry - 0.5, false, 0.9); }
      { const [px, pz] = P(0.72, 0.12); ring(px, y + 0.93, pz, 0.16, 0.3, C6.rope, ry, Math.PI / 2); ring(px, y + 0.98, pz, 0.13, 0.3, C6.rope, ry, Math.PI / 2); }
      { const [ax, az] = P(0.3, 0.26), [bx, bz] = P(0.62, 0.3); beam(ax, y + 0.91, az, bx, y + 0.91, bz, 0.035, 0.035, C6.pale); box(ax, y + 0.92, az, 0.07, 0.07, 0.16, C6.iron, ry); }
      kit('crate_B_small', 0.7, ...P(-1.55, 0.55), ry + 0.4); { const [px, pz] = P(-1.5, 0.55); jaw(px, GH(px, pz) + 0.72, pz, 0.6, false, 0.8); }
      { const [px, pz] = P(1.2, 0.7); jaw(px, GH(px, pz) + 0.03, pz, 1.2, false, 0.95); }      // 地上一把等著修的
      addBox(x, z, 1.05, 0.45, ry, 0.95); grow(x, z, 1.4); }
    { const ax = -118.2, az = -8.6, bx = -119.4, bz = -7.4, ya = GH(ax, az), yb = GH(bx, bz), h = 2.05;      // 掛夾子的木架：兩根柱、一根橫桿，掛著三把夾子、兩個繩圈、一段鐵鍊
      post(ax, az, h + 0.1, 0.16, C6.wood); post(bx, bz, h + 0.1, 0.16, C6.wood); beam(ax, ya + h - 0.08, az, bx, yb + h - 0.08, bz, 0.1, 0.1, C6.wood, 'cyl6'); const ry = -Math.atan2(bz - az, bx - ax);
      for (const [t, kind, drop] of [[0.14, 'jaw', 0.5], [0.32, 'rope', 0.42], [0.5, 'jaw', 0.62], [0.68, 'chain', 0.0], [0.86, 'jaw', 0.48]]) { const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = lerp(ya, yb, t) + h - 0.1;
        if (kind === 'chain') { for (let i = 0; i < 6; i++) ring(px, py - 0.08 - i * 0.11, pz, 0.06, 0.28, C6.iron, ry + (i % 2) * Math.PI / 2, 0); continue; }
        beam(px, py, pz, px, py - drop, pz, 0.018, 0.018, C6.rope); if (kind === 'jaw') jaw(px, py - drop - 0.17, pz, ry, true); else { ring(px, py - drop - 0.2, pz, 0.2, 0.28, C6.rope, ry, 0); ring(px, py - drop - 0.17, pz, 0.16, 0.28, C6.rope, ry + 0.2, 0); } }
      addCollider(ax, az, 0.25, h); addCollider(bx, bz, 0.25, h); addCollider((ax + bx) / 2, (az + bz) / 2, 0.35, h); grow((ax + bx) / 2, (az + bz) / 2, 1.2); }
    { const x = -114.0, z = -5.6, ry = 2.6, P = PT(x, z, ry), y = GH(x, z);      // 磨刀石：木架、石輪、搖把、底下接水的木槽
      for (const e of [-1, 1]) { for (const f of [-1, 1]) { const [ax, az] = P(0.32 * f, e * 0.26), [bx, bz] = P(0, e * 0.22); beam(ax, y - 0.05, az, bx, y + 0.68, bz, 0.08, 0.08, C6.wood); } }
      prim('cyl', x, y + 0.66, z, 0.84, 0.15, 0.84, C6.stone, ry, Math.PI / 2, 0); prim('cyl', x, y + 0.66, z, 0.2, 0.55, 0.2, C6.iron, ry, Math.PI / 2, 0);
      { const [px, pz] = P(0, 0.34); box(px, y + 0.66 - 0.12, pz, 0.05, 0.3, 0.05, C6.iron, ry); const [qx, qz] = P(0, 0.42); prim('cyl', qx, y + 0.42, qz, 0.06, 0.14, 0.06, C6.pale, ry, Math.PI / 2, 0); }
      box(x, y + 0.14, z, 0.95, 0.24, 0.42, C6.woodD, ry); box(x, y + 0.27, z, 0.82, 0.02, 0.3, k6([0.25, 0.38, 0.45]), ry);
      addCollider(x, z, 0.55, 1.0); grow(x, z, 0.7); }
    // 3. 處理獵物的區（路口西北、兩條小徑中間）：熏肉架（四柱、帆布頂、掛著一排肉條，底下一坑悶燒的炭）、晾皮架兩座、繃皮框、木桶與木箱
    { const x = -111.7, z = -16.8, ry = 0.55, P = PT(x, z, ry), y = GH(x, z), hw = 1.15, hd = 0.62, h = 1.9;
      for (const [u, v] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) { const [px, pz] = P(u, v); post(px, pz, h + 0.15, 0.13, C6.woodD, 'cyl6'); }
      for (const v of [-hd, hd]) { const [ax, az] = P(-hw - 0.15, v), [bx, bz] = P(hw + 0.15, v); beam(ax, y + h, az, bx, y + h, bz, 0.08, 0.08, C6.wood, 'cyl6'); }
      { const [px, pz] = P(0, 0); box(px, y + h + 0.32, pz, hw * 2 + 0.5, 0.06, hd * 2 + 0.7, k6([0.6, 0.55, 0.44]), ry, 0.22, 0); }      // 擋雨的帆布頂（往一邊斜）
      for (const u of [-0.75, -0.25, 0.25, 0.75]) { const [ax, az] = P(u, -hd - 0.05), [bx, bz] = P(u, hd + 0.05); beam(ax, y + h - 0.12, az, bx, y + h - 0.12, bz, 0.045, 0.045, C6.pale, 'cyl6');
        for (const v of [-0.42, -0.14, 0.14, 0.42]) { const [px, pz] = P(u + (cr() - 0.5) * 0.06, v), L2 = 0.42 + cr() * 0.22; box(px, y + h - 0.16 - L2 / 2, pz, 0.13, L2, 0.035, cr() < 0.5 ? MEAT : MEATD, ry + Math.PI / 2 + (cr() - 0.5) * 0.3, 0, (cr() - 0.5) * 0.1); } }
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, px = x + Math.cos(a) * 0.55, pz = z + Math.sin(a) * 0.55; prim('dode', px, GH(px, pz) + 0.06, pz, 0.32, 0.22, 0.3, C6.stone, a); }
      prim('cyl', x, y + 0.03, z, 0.95, 0.06, 0.95, ASH); for (let i = 0; i < 4; i++) { const a = i * 1.7, px = x + Math.cos(a) * 0.2, pz = z + Math.sin(a) * 0.2; box(px, y + 0.09, pz, 0.5, 0.09, 0.09, C6.dark, a); }
      glowAt(x, y + 0.08, z, 0.26, 0.28); glowAt(x + 0.18, y + 0.1, z - 0.1, 0.12, 0.5); glowAt(x - 0.15, y + 0.1, z + 0.12, 0.1, 0.5);
      addBox(x, z, hw + 0.15, hd + 0.18, ry, h); grow(x, z, 1.6); }
    hideRack(-115.0, -15.6, 0.22, 3); grow(-115.0, -15.6, 1.6);
    { const x = -115.6, z = -19.2, ry = 0.4, P = PT(x, z, ry), y = GH(x, z), lean = 0.32, S = 1.45;      // 繃皮框：方框斜靠在兩根撐棍上，中間用皮繩繃著一張皮
      const Q = (u, h) => { const [px, pz] = P(u, -Math.sin(lean) * h); return [px, y + Math.cos(lean) * h, pz]; };
      const cn = [Q(-S / 2, 0.05), Q(S / 2, 0.05), Q(S / 2, S + 0.05), Q(-S / 2, S + 0.05)]; for (let i = 0; i < 4; i++) { const a = cn[i], b = cn[(i + 1) % 4]; beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.08, 0.08, C6.wood, 'cyl6'); }
      { const m = Q(0, S / 2 + 0.05); box(m[0], m[1], m[2], S * 0.72, S * 0.74, 0.04, FUR, ry, -lean, 0); }
      for (const [u, h] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, 1.3], [0.36, 1.3], [-0.55, 0.75], [0.55, 0.75], [0, 0.12], [0, 1.4]]) { const a = Q(u, h), b = Q(Math.abs(u) > 0.5 ? Math.sign(u) * S / 2 : u * 1.4, h < 0.3 ? 0.05 : h > 1.2 ? S + 0.05 : h); beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.015, 0.015, C6.rope); }
      for (const e of [-1, 1]) { const top = Q(e * 0.6, 1.2), [gx, gz] = P(e * 0.6, -1.05); beam(top[0], top[1], top[2], gx, GH(gx, gz) - 0.05, gz, 0.06, 0.06, C6.woodD); }
      { const [cx, cz] = P(0, -0.45); addBox(cx, cz, 0.85, 0.6, ry, 1.6); } grow(x, z, 1.3); }
    clutter(0, 0, [['barrel', 1.15, -113.2, -21.7, 0.2, 0.6], ['barrel', 1.0, -112.3, -22.5, 1.1, 0.55], ['crate_A_big', 1.0, -109.9, -15.0, 0.55, 0.7], ['bucket_water', 0.55, -110.9, -14.6, 0, 0], ['sack', 0.7, -114.3, -21.3, 0.4, 0]]);
    // 4. 柴火：東南帳篷旁一堆柴、營火東邊的劈柴墩（0.6 的兩件搬過來）、營火南邊的水桶
    woodpile(-97.4, -3.2, 1.25, 1.5, 4); chopBlock(-101.0, -7.6, 0.6); clutter(0, 0, [['bucket_water', 0.6, -103.7, -6.1, 0, 0]]); grow(-97.4, -3.2, 1.0);
    // 5. 邊界：西邊一段拒馬（橫木上交叉的尖樁）、東南面向狼窩的一排尖木樁；北邊、西邊兩條小徑與東邊的大路都留著
    { const x = -118.3, z = -16.0, ry = 1.5, L = 4.3, P = PT(x, z, ry), y = GH(x, z);
      { const [ax, az] = P(-L / 2, 0), [bx, bz] = P(L / 2, 0); beam(ax, GH(ax, az) + 0.55, az, bx, GH(bx, bz) + 0.55, bz, 0.26, 0.26, C6.bark, 'cyl6'); }
      for (let i = 0; i < 5; i++) { const u = -L / 2 + 0.35 + i * (L - 0.7) / 4; for (const e of [-1, 1]) { const [ax, az] = P(u + e * 0.05, -0.62 * e), [bx, bz] = P(u - e * 0.05, 0.62 * e), ya = GH(ax, az) - 0.05, yb = GH(bx, bz) + 1.15;
        beam(ax, ya, az, bx, yb, bz, 0.12, 0.12, C6.wood, 'cyl6'); const dx = bx - ax, dy = yb - ya, dz = bz - az, l = Math.hypot(dx, dy, dz); _v.set(dx / l, dy / l, dz / l); _q.setFromUnitVectors(_up, _v); _m4.compose(_p.set(bx + dx / l * 0.14, yb + dy / l * 0.14, bz + dz / l * 0.14), _q, _s.set(0.12, 0.3, 0.12)); putGeo(cb.flat, unitGeo('cone'), _m4, C6.pale, jit()); } }
      addBox(x, z, L / 2, 0.5, ry, 1.2); grow(x, z, L / 2); void y; }
    { const pts = [[-95.6, -0.4], [-95.2, -1.6], [-95.1, -2.8]]; pts.forEach(([x, z], i) => { stake(x, z, 1.25 + (i % 2) * 0.2, 0.28, 1.6 + (i - 1) * 0.15); addCollider(x, z, 0.3, 1.3); grow(x, z, 0.4); });
      for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; beam(ax + 0.1, GH(ax, az) + 0.45, az, bx + 0.1, GH(bx, bz) + 0.45, bz, 0.04, 0.04, C6.rope); } }
    // 6. 西北小徑進營地的入口：兩根掛燈的木柱（燈是自發光，不是新的光源），左邊那根釘著一副鹿角
    for (const [x, z, e] of [[-105.16, -19.77, 1], [-108.72, -17.53, -1]]) { const y = GH(x, z), h = 2.65, ox = -0.846 * e * 0.55, oz = 0.534 * e * 0.55;
      post(x, z, h + 0.1, 0.2, C6.wood, 'cyl6'); beam(x, y + h - 0.1, z, x + ox, y + h - 0.1, z + oz, 0.08, 0.08, C6.woodD); beam(x, y + h - 0.45, z, x + ox * 0.55, y + h - 0.1, z + oz * 0.55, 0.05, 0.05, C6.woodD);
      const lx = x + ox * 0.95, lz = z + oz * 0.95, ly = y + h - 0.52; beam(lx, y + h - 0.12, lz, lx, ly + 0.2, lz, 0.02, 0.02, C6.iron);
      box(lx, ly + 0.2, lz, 0.26, 0.05, 0.26, C6.iron); box(lx, ly - 0.22, lz, 0.24, 0.05, 0.24, C6.iron); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(lx + a * 0.11, ly, lz + b * 0.11, 0.03, 0.42, 0.03, C6.iron);
      glowAt(lx, ly, lz, 0.14, 1.3); addCollider(x, z, 0.3, h); grow(x, z, 0.8);
      if (e < 0) { const ty = y + h + 0.02; for (const s of [-1, 1]) { const rx = x + 0.534 * s * 0.08, rz = z + 0.846 * s * 0.08; beam(rx, ty, rz, rx + 0.534 * s * 0.28, ty + 0.42, rz + 0.846 * s * 0.28, 0.05, 0.05, C6.bone); beam(rx + 0.534 * s * 0.14, ty + 0.2, rz + 0.846 * s * 0.14, rx + 0.534 * s * 0.08, ty + 0.5, rz + 0.846 * s * 0.08, 0.035, 0.035, C6.bone); beam(rx + 0.534 * s * 0.24, ty + 0.36, rz + 0.846 * s * 0.24, rx + 0.534 * s * 0.42, ty + 0.62, rz + 0.846 * s * 0.42, 0.03, 0.03, C6.bone); } box(x, ty - 0.05, z, 0.22, 0.14, 0.2, C6.bone, 0.56); } }
    // 7. 路口北邊、小徑東側：練箭的靶子、一桶箭；一輛載著毛皮捆的手推車停在旁邊
    kit('target', 1.7, -103.4, -21.5, 0.15); addCollider(-103.4, -21.5, 0.75, 1.8); kit('bucket_arrows', 0.8, -102.9, -19.9, 0.4); grow(-103.4, -21.5, 1.0);
    handcart(-104.4, -24.8, 1.9, [['sack', 0.55, -0.4, 0.3, 0.6], ['crate_B_small', 0.55, 0.45, -0.2, 0.2]]); { const [px, pz] = PT(-104.4, -24.8, 1.9)(-0.2, -0.25), gy = GH(-104.4, -24.8); box(px, gy + 1.25, pz, 1.0, 0.32, 0.62, FURD, 1.9 + 0.1, 0, 0.08); } grow(-104.4, -24.8, 1.8);
    // 自發光：燈籠與熏肉坑的炭火併成一個網格，跟城裡的燈一起隨夜晚變亮（不加新的光源）
    { const A = arrs(), sg = new THREE.IcosahedronGeometry(1, 1); for (const [x, y, z, r, sy] of glow) { _m4.compose(_p.set(x, y, z), _q.identity(), _s.set(r, r * sy, r)); putGeo(A, sg, _m4, [1, 1, 1], 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setIndex(A.idx); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.9, 0.8) })); m.name = 'p6-hunter8-glow'; m.matrixAutoUpdate = false; W.scene.add(m); lamps.push({ glow: m, core: null, brazier: false, seed: fx * 7 + fz, gain: 1.8 });
      P6.list.push({ o: m, c: g.boundingSphere.center, r: g.boundingSphere.radius, detail: false }); P6.stat.meshes++; P6.stat.tris += A.idx.length / 3; }
    W.hunterCamp = { box: [+E.x0.toFixed(1), +E.x1.toFixed(1), +E.z0.toFixed(1), +E.z1.toFixed(1)], glow: glow.length }; }
  finish();
  begin('ranch', 12);
  { const fx = 76, fz = 250; fire('ranch'); logSeat(fx + 1.9, fz + 1.5, 0.9); logSeat(fx - 1.6, fz + 2.0, -0.7); logSeat(fx - 2.2, fz - 1.0, 1.9, 1.3);
    kit('tent', 3.6, fx - 4.6, fz - 3.6, 0.8); addCollider(fx - 4.6, fz - 3.6, 2.0, 3.4);
    // 乾草棚：四根柱、單斜的茅草頂、後牆半面木板
    const sx = fx + 5.2, sz = fz - 4.4, sy = G(sx, sz); for (const [dx, dz, h] of [[-1.7, -1.2, 2.0], [1.7, -1.2, 2.0], [-1.7, 1.2, 2.7], [1.7, 1.2, 2.7]]) box(sx + dx, sy + h / 2 - 0.15, sz + dz, 0.2, h + 0.3, 0.2, C6.wood);
    box(sx, sy + 2.5, sz, 4.2, 0.16, 3.3, C6.thatch, 0, -0.28); box(sx, sy + 1.0, sz - 1.25, 3.4, 1.5, 0.1, C6.plank);
    prim('cone', sx - 0.5, sy + 0.55, sz + 0.1, 1.9, 1.3, 1.7, C6.hay); prim('cone', sx + 0.9, sy + 0.4, sz - 0.3, 1.3, 0.9, 1.2, C6.hay); addCollider(sx, sz, 1.9, 2.4);
    clutter(fx, fz, [['barrel', 1.2, 3.4, -1.0, 0, 0.6], ['crate_A_big', 1.2, -1.2, -5.4, 0.4, 0.8], ['sack', 0.8, -0.2, -4.6, 1.2, 0], ['bucket_water', 0.6, 2.6, 2.6, 0, 0]]);
    // 牧欄：一圈木柵，塌了一半；西邊留一個缺口當門
    const A = [[86, 252], [101, 251], [103, 263.5], [87, 265], [85.6, 259]]; fence([...A, [85.8, 256.4]], { broken: 0.55 });
    post(85.9, 253.2, 1.9, 0.26, C6.wood); post(85.7, 256.2, 1.9, 0.26, C6.wood); beam(85.9, G(85.9, 253.2) + 1.7, 253.2, 85.7, G(85.7, 256.2) + 1.7, 256.2, 0.16, 0.2, C6.wood);      // 門框
    const tx = 97, tz = 261, ty = G(tx, tz); box(tx, ty + 0.3, tz, 2.4, 0.5, 0.7, C6.wood, 0.2); box(tx, ty + 0.5, tz, 2.1, 0.12, 0.45, C6.dark, 0.2); addCollider(tx, tz, 1.0, 0.8);      // 飼料槽
    prim('cone', 93, G(93, 255.6) + 0.9, 255.6, 3.0, 2.0, 3.0, C6.hay); prim('cyl6', 93, G(93, 255.6) + 0.15, 255.6, 3.0, 0.5, 3.0, C6.thatch); addCollider(93, 255.6, 1.5, 2);      // 草垛
    for (const [x, z, h] of [[70.4, 254.6, 1.5], [69.8, 250.6, 1.2], [72.6, 257.2, 1.7]]) post(x, z, h, 0.24, C6.woodD, 'cyl6', (cr() - 0.5) * 0.2);      // 拴馬的木樁
    // 0.6 第二波之二：營地放大——火堆北邊一堆柴與劈柴墩、往牧欄那頭停一輛載著乾草的手推車
    woodpile(fx + 2.6, fz - 7.8, 0.12, 1.4, 3); chopBlock(fx + 4.1, fz - 9.6, 0.4);
    handcart(fx + 6.2, fz + 4.6, -0.6); prim('dode', fx + 6.25, G(fx + 6.2, fz + 4.6) + 1.32, fz + 4.62, 2.1, 0.75, 1.25, C6.hay, -0.6); prim('dode', fx + 6.0, G(fx + 6.0, fz + 4.4) + 1.62, fz + 4.45, 1.3, 0.55, 0.9, C6.hay, 0.3);
    clutter(fx, fz, [['sack', 0.55, 4.3, 6.7, 0.4, 0], ['sack', 0.5, 3.6, 6.2, 1.6, 0], ['bucket_water', 0.6, 7.9, 2.4, 0, 0]]);
  }
  finish();
  begin('reeds', 13, true);
  { const mi = lakeInfo().findIndex(b => b.id === 'marsh'), bi = lakeInfo().findIndex(b => b.id === 'bay'); let n = 0;
    for (let g = 0; g < 4000 && n < 210; g++) { const x = -86 + cr() * 180, z = 276 + cr() * 54, sdm = lakeProbe(mi, x, z)[0], sdb = lakeProbe(bi, x, z)[0], wd = waterLevel(x, z) - G(x, z);
      if (!((sdm < 2.5 && wd < 0.42 && wd > -0.45) || (sdb < 1.6 && sdb > -2.2 && wd < 0.5 && wd > -0.4 && cr() < 0.35))) continue; if (Math.hypot(x - 45, z - 288) < 5) continue; n++;
      const y = G(x, z), k = 4 + (cr() * 4 | 0); for (let i = 0; i < k; i++) { const a = cr() * TAU, r = cr() * 0.55, h = 1.3 + cr() * 1.2, lx = (cr() - 0.5) * 0.3, lz = (cr() - 0.5) * 0.3, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; prim('spike', px, y + h / 2 - 0.2, pz, 0.11, h, 0.11, cr() < 0.5 ? C6.reed : C6.reedD, a, lx, lz); if (cr() < 0.45) prim('cyl6', px + lz * h * 0.42, y + h * 0.84 - 0.2, pz - lx * h * 0.42, 0.12, 0.42, 0.12, C6.cat, a, lx, lz); } }
  }
  finish();
  begin('wolfhill', 14);
  { const [hx, hz] = [-104, 281]; kit('rock_single_C', 5.4, hx, hz - 0.5, 0.7, { tint: [1.5, 1.44, 1.36], sx: 0.62, sz: 0.62, sink: 0.5 }); addCollider(hx, hz - 0.5, 1.5, 5);
    kit('rock_single_E', 2.2, hx + 2.6, hz + 1.2, 2.2, { tint: [1.45, 1.4, 1.32], sink: 0.3 }); kit('rock_single_B', 1.6, hx - 2.8, hz + 0.8, 4.1, { tint: [1.5, 1.44, 1.36], sink: 0.2 }); kit('rock_single_D', 1.2, hx - 0.6, hz + 3.0, 1.0, { tint: [1.5, 1.44, 1.36], sink: 0.2 }); addCollider(hx + 2.6, hz + 1.2, 1.2, 2); addCollider(hx - 2.8, hz + 0.8, 0.9, 1.5);
    for (let i = 0; i < 7; i++) { const a = cr() * TAU, r = 3.5 + cr() * 5, x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r; box(x, G(x, z) + 0.06, z, 0.7 + cr() * 0.5, 0.09, 0.1, C6.bone, cr() * 3, 0, (cr() - 0.5) * 0.3); }      // 散落的獸骨
  }
  finish();
  /* ===== 西：採藥人小屋、古木林的倒木、苔瀑潭的石頭 ===== */
  begin('hut', 15);
  { const hx = -231.5, hz = 20.2, ry = 0.5, y = G(hx, hz) - 0.1, c = Math.cos(ry), s = Math.sin(ry), L = (u, v) => [hx + c * u + s * v, hz - s * u + c * v];      // u 沿屋脊、v 往門口
    box(hx, y + 1.3, hz, 4.6, 2.6, 3.6, C6.wood, ry); for (const [u, v] of [[-2.3, -1.8], [2.3, -1.8], [-2.3, 1.8], [2.3, 1.8]]) { const [x, z] = L(u, v); prim('cyl6', x, y + 1.35, z, 0.36, 2.8, 0.36, C6.woodD); }
    for (let k = 0; k < 4; k++) box(hx, y + 0.45 + k * 0.62, hz, 4.66, 0.07, 3.66, C6.woodD, ry);      // 圓木牆的縫
    gable(hx, y + 2.6, hz, 4.6, 3.6, 1.7, C6.moss, ry, 0.45); { const [x, z] = L(0, 0); box(x, y + 4.32, z, 5.6, 0.14, 0.3, C6.woodD, ry); }
    { const [x, z] = L(-0.5, 1.82); box(x, y + 0.95, z, 0.95, 1.9, 0.1, C6.dark, ry); const [x2, z2] = L(1.3, 1.82); box(x2, y + 1.5, z2, 0.7, 0.6, 0.1, C6.pale, ry); const [x3, z3] = L(1.4, -0.9); box(x3, y + 3.6, z3, 0.7, 2.4, 0.7, C6.stone, ry); box(x3, y + 4.86, z3, 0.86, 0.16, 0.86, C6.stoneD, ry); }
    addBox(hx, hz, 2.4, 1.9, ry, 4);
    fire('hut'); logSeat(-222.8, 28.6, 0.4); logSeat(-225.6, 29.6, -0.9, 1.3);
    // 晾藥草的架子：兩根柱、一根橫桿、掛著幾束
    { const [ax, az] = [-227.4, 15.6], [bx, bz] = [-224.2, 17.0]; post(ax, az, 2.0, 0.16, C6.wood); post(bx, bz, 2.0, 0.16, C6.wood); const ya = G(ax, az) + 1.85, yb = G(bx, bz) + 1.85; beam(ax, ya, az, bx, yb, bz, 0.1, 0.1, C6.wood); for (let i = 1; i < 6; i++) { const t = i / 6; prim('spike', ax + (bx - ax) * t, lerp(ya, yb, t) - 0.38, az + (bz - az) * t, 0.22, 0.7, 0.22, i % 2 ? C6.herb : C6.thatch, 0, Math.PI); } addCollider((ax + bx) / 2, (az + bz) / 2, 1.2, 2); }
    clutter(-228, 24, [['barrel', 1.1, -0.6, -6.2, 0, 0.6], ['crate_B_small', 0.8, 1.4, 5.6, 0.5, 0], ['sack', 0.8, -5.6, 1.4, 0.3, 0], ['bucket_water', 0.6, 0.4, -1.4, 0, 0], ['resource_lumber', 0.9, -6.8, 3.4, 1.1, 0.9]]);
    fence([[-236.5, 25.5], [-236.8, 30.2], [-232.4, 32.4], [-229.4, 30.8]], { h: 0.9, broken: 0.15 });      // 藥圃的矮籬
    // 0.6 第二波之二：營地放大——小屋東頭一堆柴、劈柴墩、門邊的木桶與木箱；火堆東邊再一座晾藥草的架子
    woodpile(-228.2, 19.2, 2.07, 1.5, 4); chopBlock(-222.8, 22.4, 1.2); clutter(-224.6, 27.4, [['barrel', 1.1, -4.4, -5.9, 0, 0.6], ['crate_A_big', 1.1, -5.6, -4.6, 0.6, 0.75]]);
    { const [ax, az] = [-220.2, 23.6], [bx, bz] = [-220.0, 26.8]; post(ax, az, 2.0, 0.16, C6.wood); post(bx, bz, 2.0, 0.16, C6.wood); const ya = G(ax, az) + 1.85, yb = G(bx, bz) + 1.85; beam(ax, ya, az, bx, yb, bz, 0.1, 0.1, C6.wood); for (let i = 1; i < 6; i++) { const t = i / 6; prim('spike', ax + (bx - ax) * t, lerp(ya, yb, t) - 0.38, az + (bz - az) * t, 0.22, 0.7, 0.22, i % 2 ? C6.thatch : C6.herb, 0, Math.PI); } addCollider((ax + bx) / 2, (az + bz) / 2, 1.2, 2); }
    for (let i = 0; i < 9; i++) { const x = -235.4 + (i % 3) * 1.5 + cr() * 0.3, z = 26.8 + ((i / 3) | 0) * 1.5 + cr() * 0.3; prim('ico', x, G(x, z) + 0.2, z, 0.6, 0.45, 0.6, C6.herb, cr() * 3); }
  }
  finish();
  begin('grove', 16);
  { const [gx, gz, gr] = GROVE, logs = []; const freeAt = (x, z, pad) => { if (blocked06At(x, z) /* 0.8（X0b）：照 0.6 的世界判斷，邊界山打開後倒木的位置不變 */ || roadDist(x, z) < 3 || slopeAt(x, z).s > 0.4) return false; const cx = Math.floor(x / 12), cz = Math.floor(z / 12); for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) { const l = flora.hash.get(key(ix, iz)); if (l) for (const t of l) if (!t.skip && Math.hypot(t.x - x, t.z - z) < pad + 0.085 * t.s) return false; } return true; };
    for (let g = 0; g < 900 && logs.length < 7; g++) { const a = cr() * TAU, r = Math.sqrt(cr()) * (gr - 8), x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r, dir = cr() * Math.PI, L = 9 + cr() * 5, R = 0.75 + cr() * 0.4, dx = Math.cos(dir), dz = Math.sin(dir); let ok = true;
      for (let t = -L / 2; t <= L / 2 + 0.01 && ok; t += 1.5) ok = freeAt(x + dx * t, z + dz * t, R + 1.2); if (!ok || logs.some(q => Math.hypot(q[0] - x, q[1] - z) < 13)) continue; logs.push([x, z, dir, L, R]);
      const x1 = x - dx * L / 2, z1 = z - dz * L / 2, x2 = x + dx * L / 2, z2 = z + dz * L / 2, y1 = G(x1, z1) + R * 0.7, y2 = G(x2, z2) + R * 0.62; beam(x1, y1, z1, x2, y2, z2, R * 2, R * 2 * 0.92, C6.bark, 'cyl');
      prim('cyl', x1 - dx * 0.03, y1, z1 - dz * 0.03, R * 1.7, 0.08, R * 1.6, C6.cut, -dir, 0, Math.PI / 2); prim('cyl', x2 + dx * 0.03, y2, z2 + dz * 0.03, R * 1.5, 0.08, R * 1.4, C6.cut, -dir, 0, Math.PI / 2);
      for (let k = 0; k < 4; k++) { const t = (cr() - 0.5) * L * 0.8, px = x + dx * t, pz = z + dz * t; prim('ico', px, lerp(y1, y2, t / L + 0.5) + R * 0.8, pz, R * 1.5, 0.4, R * 1.2, C6.moss, cr() * 3); }      // 樹幹上的青苔
      { const t = (cr() - 0.5) * L * 0.4, px = x + dx * t, pz = z + dz * t, yy = lerp(y1, y2, t / L + 0.5); beam(px, yy, pz, px - dz * 1.6 + dx * 0.5, yy + 1.5, pz + dx * 1.6 + dz * 0.5, 0.3, 0.3, C6.bark, 'cyl6'); }      // 一根斷枝
      for (let t = -L / 2 + 0.6; t <= L / 2 - 0.4; t += 1.5) addCollider(x + dx * t, z + dz * t, R + 0.12, R * 1.6);
      // 根部那一頭的樹樁
      const sx = x1 - dx * (2.2 + cr() * 1.5) + dz * (cr() - 0.5) * 2, sz = z1 - dz * (2.2 + cr() * 1.5) - dx * (cr() - 0.5) * 2; if (freeAt(sx, sz, R + 1)) { const sy = G(sx, sz); prim('tap', sx, sy + 0.5, sz, R * 2.6, 1.3, R * 2.6, C6.bark, cr() * 3); prim('cyl', sx, sy + 1.16, sz, R * 1.5, 0.05, R * 1.5, C6.cut); addCollider(sx, sz, R * 1.15, 1.2); }
    }
    W.groveLogs = logs;
  }
  finish();
  begin('falls', 17);
  { const F = lakeInfo().find(b => b.id === 'falls').P[0], l = Math.hypot(F[0], F[1]), ux = F[0] / l, uz = F[1] / l, px = -uz, pz = ux;      // u：往邊界外；p：橫向
    for (const [du, dp, h, n] of [[F[2] + 5.5, -4.6, 5.5, 'C'], [F[2] + 5.0, 4.8, 6.4, 'E'], [F[2] + 2.2, -7.8, 3.0, 'B'], [F[2] + 1.5, 8.6, 2.6, 'D'], [F[2] + 8.5, -1.5, 3.2, 'A'], [F[2] - 0.5, -11.5, 1.8, 'C'], [F[2] - 2.5, 12, 1.5, 'B'], [-F[2] - 1.5, 3, 1.4, 'E'], [-F[2] - 2.4, -5.5, 1.1, 'D']]) { const x = F[0] + ux * du + px * dp, z = F[1] + uz * du + pz * dp; kit('rock_single_' + n, h, x, z, cr() * 6, { tint: [1.0, 1.32, 1.0], sink: h * 0.18, sx: 0.8, sz: 0.8 }); if (h > 1.6 && du < F[2] + 3) addCollider(x, z, h * 0.45, h); }
  }
  finish();
  /* ===== 東：採石場、白鹽臺、舊驛站營地、岔路營地 ===== */
  begin('quarry', 18);
  { const [qx, qz] = [QUARRY[0], QUARRY[1]];
    // 吊架：人字腳、立柱、吊臂、繩子吊著一塊石料
    { const x = qx - 8, z = qz - 9, y = G(x, z), ry = 0.6, c = Math.cos(ry), s = Math.sin(ry); beam(x - c * 1.8, y - 0.2, z + s * 1.8, x, y + 6.6, z, 0.3, 0.3, C6.wood); beam(x + c * 1.8, y - 0.2, z - s * 1.8, x, y + 6.6, z, 0.3, 0.3, C6.wood); beam(x - s * 2.6, y - 0.2, z - c * 2.6, x, y + 6.6, z, 0.3, 0.3, C6.wood);
      beam(x - c * 1.0, y + 2.6, z + s * 1.0, x + c * 1.0, y + 2.6, z - s * 1.0, 0.18, 0.22, C6.woodD); const tx = x + s * 4.6, tz = z + c * 4.6; beam(x - s * 0.6, y + 5.2, z - c * 0.6, tx, y + 7.6, tz, 0.26, 0.26, C6.woodD); beam(x, y + 6.6, z, tx, y + 7.6, tz, 0.07, 0.07, C6.rope);
      beam(tx, y + 7.6, tz, tx, y + 2.6, tz, 0.07, 0.07, C6.rope); box(tx, y + 1.9, tz, 1.5, 1.2, 1.1, C6.stoneL, 0.3); box(tx, y + 2.56, tz, 1.6, 0.1, 0.16, C6.rope, 0.3); prim('cyl', x - s * 1.4, y + 0.9, z - c * 1.4, 0.7, 1.3, 0.7, C6.wood, ry, 0, Math.PI / 2); addCollider(x, z, 1.6, 6); addCollider(tx, tz, 1.0, 3); }
    // 一疊疊鑿好的石料
    for (const [dx, dz, n, ry] of [[-13, 2, 5, 0.2], [2, -14, 6, 1.1], [-3, 9, 3, 0.7], [11, -13, 4, 0.4]]) { const x = qx + dx, z = qz + dz, y = G(x, z); for (let i = 0; i < n; i++) { const lv = i < 3 ? 0 : 1, ox = (i % 3 - 1) * 1.5 + (lv ? 0.7 : 0), w = 1.25 + cr() * 0.3, h = 0.85 + cr() * 0.2; box(x + Math.cos(ry) * ox, y + h / 2 + lv * 0.95 - 0.05, z - Math.sin(ry) * ox, w, h, 0.95 + cr() * 0.2, cr() < 0.3 ? C6.stone : C6.stoneL, ry + (cr() - 0.5) * 0.12); } addCollider(x, z, 2.0, 1.8); }
    // 靠著採石面的鷹架：兩層平臺、斜撐、梯子
    { const [wx, wz, t] = wallFoot(qx, qz, -0.75, -0.66, 0.2); const dl = Math.hypot(wx - qx, wz - qz), nx = (qx - wx) / dl, nz = (qz - wz) / dl, tx = -nz, tz = nx, bx = wx + nx * 1.6, bz = wz + nz * 1.6, y = G(bx, bz), H = QUARRY[3];
      for (const u of [-3.2, 0, 3.2]) for (const v of [0, 1.6]) { const x = bx + tx * u + nx * v, z = bz + tz * u + nz * v; box(x, y + H - 0.1, z, 0.18, 2 * H + 0.6, 0.18, C6.wood); }
      for (const lv of [1, 2]) { const yy = y + H * lv - 0.3; for (const v of [0.25, 0.8, 1.35]) beam(bx + tx * -3.5 + nx * v, yy, bz + tz * -3.5 + nz * v, bx + tx * 3.5 + nx * v, yy, bz + tz * 3.5 + nz * v, 0.5, 0.08, v === 0.8 ? C6.pale : C6.plank); beam(bx + tx * -3.3 + nx * 1.62, yy + 0.9, bz + tz * -3.3 + nz * 1.62, bx + tx * 3.3 + nx * 1.62, yy + 0.9, bz + tz * 3.3 + nz * 1.62, 0.08, 0.1, C6.wood); }
      beam(bx + tx * -3.2 + nx * 1.6, y, bz + tz * -3.2 + nz * 1.6, bx + nx * 1.6, y + H, bz + nz * 1.6, 0.1, 0.12, C6.woodD); beam(bx + nx * 1.6, y + H, bz + nz * 1.6, bx + tx * 3.2 + nx * 1.6, y + 2 * H, bz + tz * 3.2 + nz * 1.6, 0.1, 0.12, C6.woodD);
      const lx = bx + tx * 2.3 + nx * 2.3, lz = bz + tz * 2.3 + nz * 2.3; for (const o of [-0.28, 0.28]) beam(lx + tx * o + nx * 1.0, y - 0.2, lz + tz * o + nz * 1.0, lx + tx * o - nx * 0.5, y + H - 0.2, lz + tz * o - nz * 0.5, 0.08, 0.08, C6.wood); for (let k = 1; k < 8; k++) { const f = k / 8; box(lx + nx * (1.0 - 1.5 * f), y - 0.2 + H * f, lz + nz * (1.0 - 1.5 * f), 0.62, 0.06, 0.06, C6.wood, -Math.atan2(tz, tx)); }
      addBox(bx + nx * 0.8, bz + nz * 0.8, 3.7, 1.1, -Math.atan2(tz, tx), 6); }
    clutter(qx, qz, [['wheelbarrow', 1.3, -5, 3, 0.6, 0.9], ['resource_stone', 1.3, -11, -6, 0.3, 1.1], ['resource_stone', 1.1, 5, -17, 2.0, 1.0], ['resource_lumber', 0.9, -15, -3, 1.2, 0.9], ['crate_A_big', 1.2, -12, 6.5, 0.2, 0.8], ['barrel', 1.2, -13.4, 7.4, 0, 0.6], ['pallet', 0.35, -8, 6, 0.4, 0]]);
    for (let i = 0; i < 14; i++) { const a = cr() * TAU, r = 6 + cr() * 15, x = qx + Math.cos(a) * r, z = qz + Math.sin(a) * r; if (waterLevel(x, z) > -1e8 || corrDist(x, z) > -1.5) continue; const s = 0.25 + cr() * 0.4; box(x, G(x, z) + s * 0.3, z, s * 1.4, s * 0.8, s, C6.stoneL, cr() * 3, (cr() - 0.5) * 0.5); }      // 碎石料
  }
  finish();
  begin('salt', 19);
  { const [sx, sz, sr] = HILLS[2];
    // 鹽壁：臺地靠山那一側一排白色的鹽柱（高矮不一的方柱）
    for (let i = 0; i < 46; i++) { const a = -1.15 + i / 45 * 2.9 + (cr() - 0.5) * 0.05, dx = Math.cos(a), dz = Math.sin(a), f = wallFoot(sx, sz, dx, dz, 0.3, 30), back = cr() * 2.2, x = f[0] + dx * (back - 1.2), z = f[1] + dz * (back - 1.2), h = 1.3 + cr() * 2.6 + back * 0.9, w = 0.9 + cr() * 1.0; if (roadDist(x, z) < 5) continue; prim(cr() < 0.5 ? 'box' : 'cyl6', x, G(x, z) + h / 2 - 0.4, z, w, h, w * (0.8 + cr() * 0.4), cr() < 0.25 ? C6.saltB : C6.salt, cr() * 3, (cr() - 0.5) * 0.12, (cr() - 0.5) * 0.12); if (back < 0.8) addCollider(x, z, w * 0.55, h); }
    // 曬鹽的淺池：木框、白色的鹽面；耙子與麻袋
    for (const [dx, dz, ry] of [[-6, -3, 0.25], [-1.5, 3.4, 0.25], [4.5, -2.2, 0.25]]) { const x = sx + dx, z = sz + dz, y = G(x, z); box(x, y + 0.05, z, 3.6, 0.1, 2.6, C6.salt, ry); for (const [ox, oz, w, d] of [[0, 1.35, 3.8, 0.14], [0, -1.35, 3.8, 0.14], [1.85, 0, 0.14, 2.7], [-1.85, 0, 0.14, 2.7]]) box(x + Math.cos(ry) * ox + Math.sin(ry) * oz, y + 0.13, z - Math.sin(ry) * ox + Math.cos(ry) * oz, w, 0.26, d, C6.wood, ry); prim('cone', x + 0.5, y + 0.3, z - 0.2, 0.9, 0.5, 0.9, C6.salt); }
    { const x = sx - 3.4, z = sz - 6.4, y = G(x, z); beam(x, y + 0.1, z, x + 1.6, y + 1.5, z + 0.3, 0.07, 0.07, C6.wood); box(x - 0.05, y + 0.1, z, 0.1, 0.1, 0.9, C6.wood, 0.2); }
    clutter(sx, sz, [['sack', 0.8, -9.5, 2.2, 0.3, 0], ['sack', 0.8, -8.8, 3.2, 1.3, 0], ['sack', 0.75, -9.9, 3.4, 2.2, 0], ['crate_A_big', 1.2, -10.6, 0.4, 0.2, 0.8], ['barrel', 1.2, -10.2, -1.2, 0, 0.6], ['wheelbarrow', 1.3, 1.5, -7.5, 2.4, 0.9]]);
    for (let i = 0; i < 16; i++) { const a = cr() * TAU, r = 3 + cr() * (sr - 9), x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r, s = 0.3 + cr() * 0.5; if (roadDist(x, z) < 3) continue; prim('dode', x, G(x, z) + s * 0.25, z, s, s * 0.7, s, C6.salt, cr() * 3); }      // 地上的鹽塊
  }
  finish();
  begin('post', 20);
  { const fx = CAMPS.find(q => q.id === 'post').x, fz = CAMPS.find(q => q.id === 'post').z; fire('post'); logSeat(fx + 1.4, fz + 1.9, 0.5); logSeat(fx - 1.9, fz + 0.8, 2.0, 1.3);
    // 驛站的殘牆：一個缺了角的方框，留著門框；牆裡搭著帳篷
    const x0 = fx - 7.2, x1 = fx + 0.4, z0 = fz - 9.2, z1 = fz - 3.0; ruinWall(x0, z0, x1, z0, 3.2); ruinWall(x0, z0, x0, z1 + 1.2, 2.8); ruinWall(x1, z0, x1, z0 + 2.4, 2.4, 0.75, C6.stone, 0.5); ruinWall(x0, z1 + 1.2, x0 + 2.2, z1 + 1.2, 1.5);
    { const y = G(x1, z1); box(x1, y + 1.5, z1 - 1.3, 0.3, 3.2, 0.3, C6.woodD); box(x1, y + 1.5, z1 + 0.5, 0.3, 3.2, 0.3, C6.woodD); box(x1, y + 3.05, z1 - 0.4, 0.34, 0.3, 2.5, C6.woodD); }      // 門框
    kit('tent', 3.4, fx - 4.0, fz - 5.8, 2.2); addCollider(fx - 4.0, fz - 5.8, 1.9, 3.2);
    // 路邊的驛站招牌：一根柱、一根橫桿、吊著一塊木牌
    { const x = fx + 4.6, z = fz + 3.6, y = G(x, z); box(x, y + 1.9, z, 0.24, 4.0, 0.24, C6.woodD); box(x + 0.7, y + 3.5, z, 1.7, 0.16, 0.16, C6.woodD); box(x + 0.85, y + 2.85, z, 1.2, 0.8, 0.08, C6.plank); box(x + 0.85, y + 2.85, z + 0.05, 0.7, 0.12, 0.03, C6.red); for (const o of [0.4, 1.3]) box(x + o, y + 3.33, z, 0.04, 0.2, 0.04, C6.iron); addCollider(x, z, 0.4, 4); }
    // 拴馬的橫木、翻倒的貨車與貨物
    { const ax = fx + 3.0, az = fz - 6.6, bx = fx + 6.6, bz = fz - 5.6; post(ax, az, 1.1, 0.2, C6.wood); post(bx, bz, 1.1, 0.2, C6.wood); beam(ax, G(ax, az) + 1.0, az, bx, G(bx, bz) + 1.0, bz, 0.14, 0.14, C6.wood); addCollider((ax + bx) / 2, (az + bz) / 2, 1.7, 1.2); }
    kit('wheelbarrow', 1.5, fx - 5.4, fz + 3.8, 2.6, { rz: 1.2, sink: -0.4 }); addCollider(fx - 5.4, fz + 3.8, 1.0);
    clutter(fx, fz, [['crate_A_big', 1.3, -6.9, 2.4, 0.3, 0.8], ['crate_B_small', 0.85, -4.2, 5.0, 1.2, 0], ['barrel', 1.2, -1.6, -7.6, 0, 0.6], ['barrel', 1.2, -2.6, -8.0, 1, 0.6], ['sack', 0.8, -5.6, 5.6, 0.4, 0], ['crate_long_A', 0.8, 2.0, -8.0, 0.1, 0.8]]);
    // 0.6 第二波之二：營地放大——南邊一座賣貨的布棚與手推貨車、殘牆北邊一堆柴與劈柴墩、殘牆角一面旗
    awning(fx + 3.0, fz + 7.8, 0.2, 3.4, 2.6); clutter(fx, fz, [['crate_A_big', 1.1, 2.2, 7.4, 0.2, 0.8], ['crate_B_small', 0.75, 3.6, 7.2, 0.9, 0.5], ['sack', 0.55, 3.2, 8.6, 0.3, 0], ['barrel', 1.1, 4.7, 8.1, 0, 0.6]]);
    handcart(fx - 1.6, fz + 7.0, 0.35, [['barrel', 0.8, -0.4, 0, 0], ['crate_B_small', 0.6, 0.45, 0.25, 0.4]]);
    woodpile(fx - 0.5, fz - 11.2, 0.0, 1.5, 4); chopBlock(fx + 1.7, fz - 10.3, 0.5); flagPole(fx - 4.6, fz - 10.4, 4.2, 0.3);
  }
  finish();
  begin('fork', 21);
  { const c = CAMPS.find(q => q.id === 'fork'), fx = c.x, fz = c.z; fire('fork'); logSeat(fx + 1.9, fz + 0.6, 1.2, 1.4); logSeat(fx - 0.6, fz - 2.0, 0.1, 1.4);
    // 0.6 第二波：搬到峽谷主道往東岔進隘口的路旁（原址在翻倒的貨車旁，猛虎的老家只隔 3.5 公尺）。商隊歇腳的小營地：帳篷靠著北邊的山壁、路邊一支指路的岔路牌、一堆貨
    // 0.6 第二波之二：營地放大（使用者：岔路營地太單薄）。路北靠山壁的一長條：兩頂帳篷、柴堆與劈柴墩、火堆後一疊貨、西頭一面旗；路南較寬的草地：手推貨車、拴馬橫木、一堆貨
    kit('tent', 3.4, fx - 5.4, fz - 3.4, 0.35); addCollider(fx - 5.4, fz - 3.4, 1.9, 3.2);
    kit('tent', 3.1, fx - 10.6, fz - 2.9, 0.1); addCollider(fx - 10.6, fz - 2.9, 1.75, 3.0);
    woodpile(fx - 8.1, fz - 5.5, 0.05, 1.5, 4); chopBlock(fx - 8.0, fz - 0.9, 0.8);
    clutter(fx, fz, [['crate_A_big', 1.2, -1.6, -5.0, 0.3, 0.8], ['barrel', 1.2, -0.1, -4.6, 0, 0.6], ['sack', 0.8, -2.9, -5.4, 0.7, 0], ['crate_B_small', 0.8, 0.9, -3.9, 1.1, 0.5], ['bucket_water', 0.6, -13.4, -1.6, 0, 0], ['crate_long_A', 0.8, -13.6, -4.8, 1.4, 0.8]]);
    flagPole(fx - 14.6, fz - 5.4, 4.0, 0.4);
    handcart(fx - 3.5, fz + 7.9, -0.27, [['crate_A_big', 0.85, -0.55, -0.15, 0.1], ['barrel', 0.75, 0.5, 0.3, 0], ['sack', 0.5, 0.45, -0.38, 1.9]]);
    hitchRail(fx - 11.0, fz + 6.4, fx - 7.4, fz + 7.4);
    clutter(fx, fz, [['crate_A_big', 1.2, -8.6, 9.2, 0.25, 0.8], ['crate_B_small', 0.8, -7.3, 9.6, 0.9, 0.5], ['barrel', 1.2, -9.9, 8.7, 0, 0.6]]);
    { const x = fx + 3.6, z = fz + 2.3, y = G(x, z); box(x, y + 1.55, z, 0.22, 3.3, 0.22, C6.woodD);      // 岔路牌：一支往西（峽谷主道）、一支往東（外谷）
      box(x - 0.75, y + 2.75, z, 1.5, 0.34, 0.08, C6.plank, 0.12); box(x - 1.45, y + 2.75, z, 0.16, 0.24, 0.1, C6.plank, 0.9); box(x + 0.75, y + 2.25, z, 1.5, 0.34, 0.08, C6.plank, -0.1); box(x + 1.45, y + 2.25, z, 0.16, 0.24, 0.1, C6.plank, -0.9); addCollider(x, z, 0.35, 3.4); } }
  finish();
  /* ===== 北：獸欄本體、馴獸師哨站、舊飼育場、運鐵坡道、霜泉 ===== */
  begin('pen', 22);
  { const [px, pz, pr, ph] = PEN, N = 14; for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * TAU, x = px + Math.sin(a) * pr, z = pz - Math.cos(a) * pr; kit('wall_straight', 12.5, x, z, -a, { y: ph - 0.9, mason: true, sx: TAU * pr / N / (12.5 / 1.1 * 2) * 1.03 }); }
    // 牆頂每隔一段一座望臺（木造、尖頂），遠遠看得出是一圈有人守的高牆
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.22, x = px + Math.sin(a) * (pr + 0.4), z = pz - Math.cos(a) * (pr + 0.4), y = ph + 11.2; box(x, y + 1.3, z, 4.2, 2.6, 4.2, C6.woodD, -a); prim('spike', x, y + 4.3, z, 6.6, 3.6, 6.6, C6.rust, -a + Math.PI / 4); box(x, y - 0.1, z, 4.8, 0.3, 4.8, C6.wood, -a); }
  }
  finish();
  begin('tamer', 23);
  { const c = CAMPS.find(q => q.id === 'tamer'), fx = c.x, fz = c.z; fire('tamer'); logSeat(fx - 1.2, fz + 2.0, 0.3); logSeat(fx - 2.2, fz - 0.6, 1.5, 1.3);
    // 望樓：四根高柱、平臺、欄杆、尖頂、梯子、旗
    { const x = fx - 3.6, z = fz - 5.0, y = G(x, z), H = 5.2; for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) { box(x + dx, y + (H + 2.2) / 2 - 0.2, z + dz, 0.26, H + 2.6, 0.26, C6.woodD); beam(x + dx, y + 0.2, z + dz, x - dx, y + H - 0.3, z + dz * 0.99, 0.1, 0.12, C6.wood); }
      box(x, y + H, z, 3.3, 0.16, 3.3, C6.plank); for (const [dx, dz, w, d] of [[0, -1.5, 3.2, 0.1], [0, 1.5, 3.2, 0.1], [-1.5, 0, 0.1, 3.2], [1.5, 0, 0.1, 3.2]]) box(x + dx, y + H + 0.95, z + dz, w, 0.12, d, C6.wood);
      prim('spike', x, y + H + 3.3, z, 5.2, 2.0, 5.2, C6.thatch, Math.PI / 4); for (const o of [-0.3, 0.3]) beam(x + 1.9, y - 0.1, z + o, x + 1.5, y + H, z + o, 0.08, 0.08, C6.wood); for (let k = 1; k < 10; k++) box(x + 1.9 - 0.4 * k / 10, y + H * k / 10, z, 0.06, 0.06, 0.66, C6.wood);
      kit('flag_red', 2.6, x - 1.3, z - 1.3, 0.6, { y: y + H + 2.4 }); addCollider(x, z, 2.1, 7); }
    kit('tent', 3.6, fx - 4.6, fz + 3.4, -0.6); addCollider(fx - 4.6, fz + 3.4, 2.0, 3.4);
    for (let i = 0; i < 6; i++) { const a = -0.5 + i * 0.26, x = fx + 0.6 + Math.sin(a) * 5.4, z = fz + 6.4 + Math.cos(a) * 1.6; stake(x, z, 2.2, 0.55, a + 0.1); if (i % 2 === 0) addCollider(x, z, 0.7, 1.4); }      // 朝著山徑的一排拒馬
    clutter(fx, fz, [['weaponrack', 2.0, -6.6, -1.0, 1.4, 0.9], ['crate_A_big', 1.2, -6.4, 1.2, 0.3, 0.8], ['barrel', 1.2, -1.4, -6.8, 0, 0.6], ['bucket_arrows', 0.9, -5.6, -2.4, 0, 0], ['sack', 0.8, -7.0, 2.6, 0.9, 0]]);
    // 0.6 第二波之二：營地放大——望樓北邊一堆柴、劈柴墩、晾獸皮的架子；帳篷旁一座練箭的靶
    woodpile(fx - 3.6, fz - 9.4, 0.3, 1.5, 4); chopBlock(fx - 5.6, fz - 8.4, 0.9); hideRack(fx - 6.2, fz - 11.6, 0.2, 3);
    kit('target', 2.2, fx - 1.4, fz + 5.4, 3.0); addCollider(fx - 1.4, fz + 5.4, 0.75);
  }
  finish();
  begin('kennels', 24);
  { const kx = -120, kz = -287;
    // 鐵籠：四角鐵柱、上下框、一根根鐵條；有的門開著、有的倒在地上
    const cage = (x, z, ry, w, h, tilt, open) => { const y = G(x, z) + (tilt ? w * 0.42 : 0), rz = tilt ? 1.35 : 0, c = Math.cos(ry), s = Math.sin(ry), T = (u, v, yy) => { const uu = tilt ? u * Math.cos(rz) - yy * Math.sin(rz) : u, y2 = tilt ? u * Math.sin(rz) + yy * Math.cos(rz) : yy; return [x + c * uu + s * v, y + y2, z - s * uu + c * v]; };
      const bar = (u1, v1, y1, u2, v2, y2, t, col) => { const a = T(u1, v1, y1), b = T(u2, v2, y2); beam(a[0], a[1], a[2], b[0], b[1], b[2], t, t, col); }, hw = w / 2;
      for (const [u, v] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) bar(u, v, 0, u, v, h, 0.12, C6.iron);
      for (const yy of [0.05, h]) { bar(-hw, -hw, yy, hw, -hw, yy, 0.1, C6.iron); bar(hw, -hw, yy, hw, hw, yy, 0.1, C6.iron); bar(hw, hw, yy, -hw, hw, yy, 0.1, C6.iron); bar(-hw, hw, yy, -hw, -hw, yy, 0.1, C6.iron); }
      const nb = Math.round(w / 0.38); for (let i = 1; i < nb; i++) { const t = -hw + i * w / nb, col = cr() < 0.3 ? C6.rust : C6.iron; bar(t, -hw, 0, t, -hw, h, 0.05, col); bar(hw, t, 0, hw, t, h, 0.05, col); bar(-hw, t, 0, -hw, t, h, 0.05, col); if (!open || i < nb * 0.45) bar(t, hw, 0, t, hw, h, 0.05, col); bar(t, -hw, h, t, hw, h, 0.05, col); }
      if (open) { bar(hw * 0.1, hw, 0, hw * 0.1 + w * 0.42, hw + w * 0.34, 0, 0.08, C6.iron); bar(hw * 0.1, hw, h, hw * 0.1 + w * 0.42, hw + w * 0.34, h, 0.08, C6.iron); bar(hw * 0.1 + w * 0.42, hw + w * 0.34, 0, hw * 0.1 + w * 0.42, hw + w * 0.34, h, 0.08, C6.iron); }
      addCollider(x, z, w * 0.62, tilt ? w : h); };
    cage(kx - 11.6, kz - 12.6, 0.2, 2.6, 2.3, false, true); cage(kx + 1.5, kz - 11, -0.3, 2.2, 2.0, false, false); cage(kx + 9, kz - 7.5, 0.9, 2.0, 1.8, true, false); cage(kx - 13.5, kz + 1.5, 1.2, 2.4, 2.1, false, true); cage(kx - 2, kz + 6, 0.5, 1.8, 1.6, true, false);
    // 殘牆圍成的三個獸欄（朝南開口），欄口殘留的鐵柵
    for (const ox of [-11, -1, 9]) { const x0 = kx + ox - 4.2, x1 = kx + ox + 4.2, zb = Math.max(wallFoot(kx + ox - 3, kz - 8, 0, -1, 0.2)[1], wallFoot(kx + ox + 3, kz - 8, 0, -1, 0.2)[1]) + 0.5, zf = kz - 6.5; ruinWall(x0, zb, x1, zb, 3.4, 0.8, C6.stoneD, 0.45); ruinWall(x0, zb, x0, zf, 3.0, 0.8, C6.stoneD, 0.3); if (ox === 9) ruinWall(x1, zb, x1, zf, 2.6, 0.8, C6.stoneD, 0.3); }
    for (const [ax, az, bx, bz] of [[kx - 15.2, kz - 6.3, kx - 11.4, kz - 6.3], [kx + 4.9, kz - 6.3, kx + 8.2, kz - 6.3]]) { const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.42); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = G(x, z), h = 2.3 + (i % 2) * 0.2, lean = cr() < 0.2 ? (cr() - 0.5) * 0.5 : 0; prim('box', x, y + h / 2 - 0.1, z, 0.07, h, 0.07, cr() < 0.35 ? C6.rust : C6.iron, 0, lean, lean); prim('spike', x, y + h + 0.05, z, 0.16, 0.3, 0.16, C6.iron); } beam(ax, G(ax, az) + 1.9, az, bx, G(bx, bz) + 1.9, bz, 0.09, 0.09, C6.iron); beam(ax, G(ax, az) + 0.5, az, bx, G(bx, bz) + 0.5, bz, 0.09, 0.09, C6.iron); addBox((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2, 0.25, 0, 2.4); }
    // 飼料槽、鐵鍊樁、散落的骨頭
    { const x = kx + 5, z = kz + 1, y = G(x, z); box(x, y + 0.3, z, 2.6, 0.5, 0.8, C6.stoneD, 0.8); box(x, y + 0.5, z, 2.3, 0.12, 0.5, C6.dark, 0.8); addCollider(x, z, 1.1, 0.8); }
    for (const [dx, dz] of [[-6, 0.5], [12.5, 2.5]]) { const x = kx + dx, z = kz + dz, y = G(x, z); prim('cyl6', x, y + 0.6, z, 0.34, 1.5, 0.34, C6.woodD); prim('cyl', x, y + 1.2, z, 0.5, 0.14, 0.5, C6.iron); for (let i = 0; i < 6; i++) prim('ico', x + 0.4 + i * 0.26, y + 0.07, z + Math.sin(i * 1.1) * 0.2, 0.2, 0.1, 0.24, C6.rust, i); addCollider(x, z, 0.4, 1.4); }
    for (let i = 0; i < 9; i++) { const a = cr() * TAU, r = 3 + cr() * 13, x = kx + Math.cos(a) * r, z = kz + Math.sin(a) * r; if (corrDist(x, z) > -1) continue; box(x, G(x, z) + 0.06, z, 0.6 + cr() * 0.5, 0.09, 0.1, C6.bone, cr() * 3); }
  }
  finish();
  begin('ramp', 25);
  { // 運鐵坡道：沿著東翼通道的鐵軌（枕木＋兩條鐵軌），在通道中線的一側；坡頂有擋車樁與絞盤；兩處翻倒的礦車
    const pts = CORRIDORS[10].pts.slice(1), top = [[104, -290], [113, -283]], line = [...pts, ...top.slice(1)], off = 3.3, samp = []; let acc = 0;
    for (let i = 0; i < line.length - 1; i++) { const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L; for (let t = (i ? 0 : 0); t < L; t += 0.7) samp.push([ax + (bx - ax) * t / L + nx * off, az + (bz - az) * t / L + nz * off, Math.atan2(bz - az, bx - ax)]); }
    for (let k = 4; k < 8; k++) for (let i = 0; i < samp.length; i++) { let x = 0, z = 0, n = 0; for (let j = Math.max(0, i - 6); j <= Math.min(samp.length - 1, i + 6); j++) { x += samp[j][0]; z += samp[j][1]; n++; } samp[i] = [x / n, z / n, samp[i][2]]; }      // 轉角磨圓
    for (let i = 0; i < samp.length - 1; i++) samp[i][2] = Math.atan2(samp[i + 1][1] - samp[i][1], samp[i + 1][0] - samp[i][0]);
    const GA = 0.62; let prevL = null, prevR = null; W.rampTrack = samp;
    for (let i = 0; i < samp.length; i++) { const [x, z, a] = samp[i], y = G(x, z), nx = -Math.sin(a), nz = Math.cos(a), broken = i > 60 && i < 68;
      if (i % 2 === 0 && !broken) box(x, y + 0.05, z, 0.24, 0.12, 1.9, cr() < 0.2 ? C6.woodD : C6.wood, -a + (cr() - 0.5) * 0.06);
      if (i % 4 === 0) { const l = [x + nx * GA, y + 0.17, z + nz * GA], r = [x - nx * GA, y + 0.17, z - nz * GA]; if (prevL && !broken) { beam(prevL[0], prevL[1], prevL[2], l[0], l[1], l[2], 0.1, 0.12, C6.iron); beam(prevR[0], prevR[1], prevR[2], r[0], r[1], r[2], 0.1, 0.12, cr() < 0.3 ? C6.rust : C6.iron); } prevL = l; prevR = r; } }
    const cart = (x, z, ry, tip) => { const y = G(x, z), c = Math.cos(ry), s = Math.sin(ry), rz = tip ? 1.25 : 0, up = tip ? 0.55 : 0.62; box(x, y + up + (tip ? 0.1 : 0.25), z, 1.9, 1.0, 1.25, C6.rust, ry, 0, rz); box(x, y + up + (tip ? 0.1 : 0.25), z, 1.98, 0.14, 1.33, C6.iron, ry, 0, rz); for (const [u, v] of [[-0.6, -0.68], [0.6, -0.68], [-0.6, 0.68], [0.6, 0.68]]) { const uu = tip ? u * Math.cos(rz) + 0.55 * Math.sin(rz) : u, yy = tip ? u * Math.sin(rz) - 0.55 * Math.cos(rz) + up + 0.1 : 0.3; prim('cyl', x + c * uu + s * v, y + Math.max(0.3, yy), z - s * uu + c * v, 0.6, 0.12, 0.6, C6.iron, ry, Math.PI / 2, tip ? rz : 0); }
      for (let i = 0; i < (tip ? 7 : 3); i++) { const r = 0.9 + cr() * 1.6, a = ry + (tip ? -0.4 + cr() * 0.8 : cr() * 6), s2 = 0.3 + cr() * 0.3, ox = tip ? -Math.cos(a) * r : Math.cos(a) * 0.3, oz = tip ? Math.sin(a) * r : Math.sin(a) * 0.3; prim('dode', x + ox, tip ? G(x + ox, z + oz) + s2 * 0.3 : y + 1.25, z + oz, s2, s2 * 0.8, s2, cr() < 0.4 ? C6.rust : C6.ore, cr() * 3); } addCollider(x, z, 1.1, 1.4); };
    { const a = samp[66], b = samp[104], c2 = samp[samp.length - 5]; cart(a[0] - Math.sin(a[2]) * 1.9, a[1] + Math.cos(a[2]) * 1.9, -a[2] + 0.5, true); cart(b[0] + Math.sin(b[2]) * 1.7, b[1] - Math.cos(b[2]) * 1.7, -b[2] - 0.7, true); cart(c2[0], c2[1], -c2[2], false); }
    { const e = samp[samp.length - 1], x = e[0] + Math.cos(e[2]) * 0.8, z = e[1] + Math.sin(e[2]) * 0.8, y = G(x, z), nx = -Math.sin(e[2]), nz = Math.cos(e[2]); for (const o of [-0.8, 0.8]) box(x + nx * o, y + 0.6, z + nz * o, 0.26, 1.5, 0.26, C6.woodD); beam(x + nx * -1.1, y + 0.9, z + nz * -1.1, x + nx * 1.1, y + 0.9, z + nz * 1.1, 0.3, 0.3, C6.woodD); addCollider(x, z, 1.1, 1.4);
      const wx = x + nx * 3.4, wz = z + nz * 3.4, wy = G(wx, wz); box(wx, wy + 0.3, wz, 2.0, 0.6, 2.0, C6.wood, -e[2]); prim('cyl', wx, wy + 1.3, wz, 1.2, 1.7, 1.2, C6.woodD, -e[2], Math.PI / 2, 0); beam(wx - nx * 1.2, wy + 1.3, wz - nz * 1.2, wx - nx * 1.2, wy + 2.5, wz - nz * 1.2, 0.12, 0.12, C6.iron); addCollider(wx, wz, 1.3, 2); }      // 擋車樁、絞盤
    for (const [x, z, n] of [[110, -274, 6], [121, -287, 5]]) { for (let i = 0; i < n; i++) { const a = cr() * TAU, r = cr() * 1.3, s2 = 0.5 + cr() * 0.6; prim('dode', x + Math.cos(a) * r, G(x, z) + s2 * 0.3 + (r < 0.5 ? 0.4 : 0), z + Math.sin(a) * r, s2, s2 * 0.8, s2, cr() < 0.4 ? C6.rust : C6.ore, cr() * 3); } addCollider(x, z, 1.3, 1.2); }      // 礦石堆
    clutter(118, -280, [['crate_A_big', 1.2, 6, 4, 0.3, 0.8], ['barrel', 1.2, 7.4, 3, 0, 0.6], ['resource_lumber', 0.9, -4, 8.5, 0.4, 0.9]]);
  }
  finish();
  begin('spring', 26);
  { const S = lakeInfo().find(b => b.id === 'spring').P[0];
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + cr() * 0.3, r = S[2] + 1.2 + cr() * 2.6, x = S[0] + Math.cos(a) * r, z = S[1] + Math.sin(a) * r; if (corrDist(x, z) > -0.8 || roadDist(x, z) < 3) continue; const y = G(x, z), n = 2 + (cr() * 3 | 0); for (let k = 0; k < n; k++) { const h = 0.8 + cr() * 1.9, w = 0.3 + cr() * 0.35, ox = (cr() - 0.5) * 0.9, oz = (cr() - 0.5) * 0.9; prim('spike', x + ox, y + h / 2 - 0.15, z + oz, w, h, w, cr() < 0.5 ? C6.ice : C6.iceD, cr() * 3, (cr() - 0.5) * 0.5, (cr() - 0.5) * 0.5); } if (i % 3 === 0) addCollider(x, z, 0.6, 1.5); }
    for (const [da, dr, h, n] of [[0.4, 3.4, 1.6, 'C'], [2.3, 3.8, 1.2, 'B'], [4.4, 3.2, 1.4, 'E']]) { const x = S[0] + Math.cos(da) * (S[2] + dr), z = S[1] + Math.sin(da) * (S[2] + dr); if (corrDist(x, z) > -0.5) continue; kit('rock_single_' + n, h, x, z, cr() * 6, { tint: [2.0, 2.2, 2.4], sink: 0.2 }); addCollider(x, z, h * 0.5, h); }
  }
  finish();
  // 六處營火共用一盞火光（跟著離玩家最近的那一處），不另外加光源
  if (W.mkFire) fitCampfires(); else { W.campLight = new THREE.PointLight(cS(1, 0.6, 0.3), 2.5, 12, 2); W.scene.add(W.campLight); const c = campSpots[0]; W.campLight.position.set(c.x, c.y + 1.2, c.z); }      // 美術的營火自己帶一盞共用的火光；佔位的火堆才用這一盞
  buildFalls();
  W.places06 = { list: P6.list, stat: P6.stat, camps: campSpots };
}
// 苔瀑潭的瀑布：一條順著邊界山壁往下的水帶（頂點色帶著「往下第幾公尺」，用時間捲動白色水紋），底下一圈水花
function buildFalls() {
  const F = lakeInfo().find(b => b.id === 'falls').P[0], l = Math.hypot(F[0], F[1]), ux = F[0] / l, uz = F[1] / l, px = -uz, pz = ux, pos = [], uv = [], idx = [], Wd = 4.4;
  let top = F[2] + 3; for (let t = F[2] + 3; t < F[2] + 30; t += 0.5) { if (groundH(F[0] + ux * t, F[1] + uz * t) > F[3] + 17) { top = t; break; } top = t; }
  let acc = 0, prev = null; const N = 30;
  for (let i = 0; i <= N; i++) { const t = lerp(top, F[2] - 1.2, i / N), x = F[0] + ux * t, z = F[1] + uz * t, y = Math.max(groundH(x, z) + 0.35 + 0.5 * Math.sin(i / N * Math.PI), F[3] + 0.05); if (prev) acc += Math.hypot(t - prev[0], y - prev[1]); prev = [t, y]; const w = Wd * (0.75 + 0.35 * i / N) / 2;
    pos.push(x - px * w, y, z - pz * w, x + px * w, y, z + pz * w); uv.push(0, acc, 1, acc); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: waterU.uTime, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.005 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: 'varying vec2 vUv; varying float vFogD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 fogColor; uniform float fogDensity; varying vec2 vUv; varying float vFogD;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float v = vUv.y * 0.55 - uTime * 2.6, s = n(vec2(vUv.x * 9.0, v * 1.3)) * 0.6 + n(vec2(vUv.x * 21.0 + 3.0, v * 2.7)) * 0.4; float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        vec3 c = mix(vec3(0.42, 0.74, 0.86), vec3(1.0), smoothstep(0.38, 0.72, s)); float a = edge * mix(0.62, 0.96, smoothstep(0.3, 0.7, s));
        c = mix(fogColor, c, exp(-fogDensity * fogDensity * vFogD * vFogD)); gl_FragColor = vec4(c * 0.92, a); }` });
  const m = new THREE.Mesh(g, mat); m.renderOrder = -1; m.name = 'falls'; W.scene.add(m); W.falls = m;
  // 瀑布落水處的水花：幾片貼著水面的白色圓片
  const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.7), transparent: true, opacity: 0.5, depthWrite: false }), fg = new THREE.CircleGeometry(1, 10); W.fallFoam = [];
  for (let i = 0; i < 5; i++) { const t = F[2] - 1.6 - i * 0.5, w = (i - 2) * 0.9, f = new THREE.Mesh(fg, fm); f.rotation.x = -Math.PI / 2; f.position.set(F[0] + ux * t + px * w, F[3] + 0.06, F[1] + uz * t + pz * w); f.renderOrder = 0; W.scene.add(f); W.fallFoam.push(f); }
}

/* ---------- 後製與畫質 ---------- */
let gtao = null, bloom = null;
function buildPost() {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const c = W.composer = new EffectComposer(W.renderer, rt);
  c.addPass(new RenderPass(W.scene, W.camera));
  gtao = new GTAOPass(W.scene, W.camera, 4, 4); gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.2, samples: 12 }); gtao.blendIntensity = 0.8; c.addPass(gtao);
  { const ov = gtao.overrideVisibility.bind(gtao); gtao.overrideVisibility = () => { ov(); if (W.noAO08) W.noAO08.visible = false; }; }      // d8-art-rain：GTAO 畫法線時不畫雨絲（原本的可見與否由 GTAO 自己記下、畫完還原）
  bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.3, 0.6, 1.2); c.addPass(bloom);
  c.addPass(new OutputPass());
  c.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 p = vUv - 0.5; float v = smoothstep(0.95, 0.3, length(p * vec2(1.0, 0.84))); c.rgb *= mix(0.7, 1.0, v); c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.2); gl_FragColor = c; }' }));
}
export function setQuality(q) {
  W.quality = q;
  const r = W.renderer; r.shadowMap.enabled = q !== 'low'; env.sun.castShadow = q !== 'low';
  env.sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048); if (env.sun.shadow.map) { env.sun.shadow.map.dispose(); env.sun.shadow.map = null; }
  if (gtao) gtao.enabled = q === 'high';
  grass.mesh.geometry.instanceCount = q === 'high' ? grass.max : q === 'medium' ? 110000 : 45000;
  W.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  resize();
}
export function resize() {
  const w = W.W = Math.max(1, window.innerWidth), h = W.H = Math.max(1, window.innerHeight), pr = W.quality === 'low' ? (W.lowPr || 1) : Math.min(window.devicePixelRatio || 1, W.quality === 'high' ? 1.75 : 1.25);      // 0.5d：低畫質仍不夠順時 lowPr＝0.75
  W.renderer.setPixelRatio(pr); W.renderer.setSize(w, h, false); W.camera.aspect = w / h; W.camera.updateProjectionMatrix();
  if (W.composer) { W.composer.setPixelRatio(pr); W.composer.setSize(w, h); }
}

/* ---------- 每幀 ---------- */
let timeT = 0;
export function updateWorld(dt, fx, fz) {
  W.time += dt; timeT += dt;
  if (W.rain08) W.rain08.tickRain08(dt, fx, fz);      // d8-art-rain：雨的濃度漸變、雨絲跟著鏡頭、雷光
  if (timeT > 1.5 || SKY08.dirty) { timeT = 0; applyTime(nowHour()); }
  if (SKY08.flash > 0 || env.fl08) { const f = SKY08.flash; env.fl08 = f > 0; env.hemi.intensity = env.hiB * (1 + 2.6 * f); W.renderer.toneMappingExposure = env.exB * (1 + 0.3 * f); env.sky.material.uniforms.uFlash.value.set(SKY08.dir.x, SKY08.dir.y, SKY08.dir.z, f); }      // 雷光：天空一側亮一下、整片地面被照亮
  env.sun.target.position.set(fx, 0, fz); env.sun.position.set(fx, 0, fz).addScaledVector(env.dir, 110); env.sun.target.updateMatrixWorld();
  env.fill.position.set(fx, 0, fz).addScaledVector(env.fdir, 60);
  env.sky.position.set(fx, 0, fz); env.stars.position.set(fx, 0, fz);
  grass.uniforms.uFocus.value.set(fx, fz - 6); grass.uniforms.uTime.value = W.time;
  fadeTrees(dt, fx, Hgt(fx, fz) + 1.4, fz); lodWorld();
  const k = 0.35 + W.night * 0.65;
  for (const l of lamps) { const f = 1 + Math.sin(W.time * 9 + l.seed) * 0.12 + Math.sin(W.time * 23 + l.seed * 2) * 0.08, b = (l.always ? 1 : k) * f * (l.gain || 1); if (l.brazier) { l.glow.scale.set(f, 0.85 + f * 0.25, f); l.glow.material.color.setRGB(2.8 * b, 0.9 * b, 0.16 * b); if (l.core) l.core.material.color.setRGB(3.2 * b, 2.3 * b, 1.0 * b); } else l.glow.material.color.setRGB(3.0 * b, 1.9 * b, 0.8 * b); }
  if (W.fireLights) W.fireLights.forEach((l, i) => { l.intensity = (14 + W.night * 60) * (1 + Math.sin(W.time * 10 + i) * 0.1); });
  if (W.campLight) { let b = null, bd = 1e9; for (const c of campSpots) { const d = (c.x - fx) * (c.x - fx) + (c.z - fz) * (c.z - fz); if (d < bd) { bd = d; b = c; } } W.campLight.position.set(b.x, b.y + 1.2, b.z); }
  if (W.lantern) { W.lantern.position.set(fx, Hgt(fx, fz) + 3.2, fz + 1.2); W.lantern.intensity = W.forceHour != null ? 0 : W.night * 26; }
  waterU.uTime.value = W.time;
}
export function render(dt) {
  if (window.__noRender) { W.camera.updateMatrixWorld(); W.camera.matrixWorldInverse.copy(W.camera.matrixWorld).invert(); return; }
  if (W.quality === 'low' || !W.composer) W.renderer.render(W.scene, W.camera); else W.composer.render(dt);
}

/* ---------- 音效用（0.5 批次新增，只讀既有資料）：腳下的地面材質、離最近水面的距離 ---------- */
// 回傳 audio-index.json 的腳步材質名稱（step/…）：water 涉水｜sand 水岸濕沙與競技場沙地｜stone 城內石板｜grass 草地（含城裡的草皮）｜gravel 道路與通道｜leaf 森林地面｜rock 峽谷、巢穴、邊界山地
// 城內的石板／草皮用和鋪地時同一套算式，所以踩在看得到的草皮上就是草地的腳步聲
export function groundAt(x, z) {
  if (decks.length && deckAt(x, z)) return 'plank';      // 0.6：木橋的橋面
  const wd = waterDepth(x, z); if (wd > 0.12) return 'water'; if (wd > -0.5) return 'sand';
  const r = Math.hypot(x, z);
  if (r > 345) { if (rock08(x, z, 0) > 0.5) return 'rock'; const zn = zone08(x, z); return { southlake: 'grass', edgewood: 'grass', giantwood: 'leaf', marshwood: 'leaf', floodpen: 'dirt', backhill: 'dirt', orecliff: 'rock', saltflat: 'sand', redslope: 'dirt', frostwood: 'leaf', northrim: 'rock', gatehigh: 'rock', oldroad: 'stone' }[zn] || 'dirt'; }      /* 0.8（X0b）：新地的腳步聲 */
  if (r < WORLD.ARENA_IN + 0.3) return 'sand';
  if (r < TR + 6) {
    const w = wallLocal(x, z), gp = w.gate ? smooth(4.6, 3.3, Math.abs(w.lat)) * smooth(TR + 5.6, TR + 4.2, w.along) : 0;
    if (Math.max(smooth(TR + 3, TR - 1, r), gp) > 0.5) {
      if (r <= 19 || r >= 38 || nearGate(angDeg(x, z), 4.5)) return 'stone';
      const cl = townClear(x, z), gn = (px, pz) => vnoise(px * 0.16 + 60, pz * 0.16 + 9);
      const garden = Math.max(smooth(0.56, 0.66, Math.min(gn(x, z), gn(x + 2.6, z), gn(x - 2.6, z), gn(x, z + 2.6), gn(x, z - 2.6))) * smooth(1.2, 2.6, cl), lawnAt(x, z) * smooth(0.2, 1.0, cl));
      return garden > 0.5 ? 'grass' : 'stone';
    }
  }
  if (roadDist(x, z) < 2.4) return 'gravel';
  if (r > WORLD.R - 6) return 'rock';
  if (r > WORLD.R0 - 12) { const s = sectors(x, z); if (rimMask(x, z, s) > 0.4 || (s.west > 0 && ridgeW(x, z, s) > 0.15)) return 'rock'; }      // 0.6：舊邊界留下的山脊與石脊
  return { meadow: 'grass', forest: 'leaf', canyon: 'rock', lair: 'rock' }[zoneAt(x, z, false)] || 'dirt';
}
// 離最近水面邊緣的公尺數（在水裡是 0）。之後加河流、瀑布時這個函式跟著改，水聲就會對
export function waterDist(x, z) { let d = 1e9; for (const p of PONDS) d = Math.min(d, Math.hypot(x - p[0], z - p[1]) - p[2]); return Math.max(0, Math.min(d, lakeDist(x, z))); }      // 0.6：加上鏡溪、長灣等新水域
