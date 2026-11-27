// 採集：一片一片的採集點、走近出現提示、按住互動鍵連續採、每株各自長回。規則見定案第 2 節與附錄 B；數字在 data06.js 的 GATHER、GATHER_K
// 每個人各自一份：狀態只在自己這邊，不同步、不存檔（重新進遊戲全部長好）。只畫附近的採集點
// 模型：美術的 props06.js 提供 makeGatherMesh(kind, picked)、makeCampfire() 時用它們（setFactories），沒有就用這裡的佔位模型
import * as THREE from './three.bundle.js';
import { rng } from './core.js';
import { GATHER, GATHER_K } from './data06.js';

let C = null, sites = [], meshFn = null, patchFn = null, fireFn = null, cur = null, picked = 0, scanT = 0, near = null, campObjs = [];
export const state = { sites, get cur() { return cur; } };
export function init(ctx) { C = ctx; }
// pr：props06.js 的匯出。makeGatherPatch(kind, points) 一整片一個 InstancedMesh（優先用，一片只多一次繪製）；否則 makeGatherMesh(kind, picked) 每株兩個物件
export function setFactories(pr) { pr = pr || {}; patchFn = pr.makeGatherPatch || null; meshFn = pr.makeGatherMesh || null; fireFn = pr.makeCampfire || null; for (const s of sites) unbuild(s); }

/* ---------- 採集點 ---------- */
// list：[{ kind, x, z, r, n }] 一片（中心、半徑、株數；株的位置由這裡用固定的亂數撒）或 [{ kind, pts: [[x, z], …] }] 指定每個點
export function setSites(list) {
  for (const s of sites) unbuild(s); sites.length = 0; cur = null; C.me.gather = null;
  (list || []).forEach((src, si) => {
    const K = GATHER[src.kind]; if (!K) return; const rand = rng(9100 + si * 131), nodes = [], s = { kind: src.kind, x: src.x, z: src.z, r: src.r || 0, nodes, live: false };
    const ok = (x, z) => !C.blockedAt(x, z) && C.slopeAt(x, z).s < 0.75 && C.waterDepth(x, z) < 0.55 && Math.hypot(x, z) > 46;
    const pts = src.pts || src.points; if (Array.isArray(pts)) { let sx = 0, sz = 0; for (const p of pts) { const x = Array.isArray(p) ? p[0] : p.x, z = Array.isArray(p) ? p[1] : p.z; nodes.push({ x, z }); sx += x; sz += z; } s.x = sx / nodes.length; s.z = sz / nodes.length; s.r = Math.max(...nodes.map(n => Math.hypot(n.x - s.x, n.z - s.z))); }
    else { const n = src.n || Math.round((K.n[0] + K.n[1]) / 2), gap = Math.min(1.7, s.r * 1.6 / Math.sqrt(n)); for (let i = 0, g = 0; i < n && g < n * 60; g++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * s.r, x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d; if (!ok(x, z) || nodes.some(o => Math.hypot(o.x - x, o.z - z) < gap)) continue; nodes.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }); i++; } }
    nodes.forEach((n, i) => Object.assign(n, { kind: s.kind, site: s, readyAt: 0, big: false, rolled: true, yaw: rand() * 6.28, sc: 0.85 + rand() * 0.3, on: null, off: null, i }));
    if (nodes.length) sites.push(s);
  });
}
// 營火的佔位模型（只給 ph 的那幾處；場景自己做了營火的不放）
export function setCamps(list) {
  for (const o of campObjs) C.W.scene.remove(o); campObjs = [];
  for (const c of list || []) { if (!c.ph) continue; const o = fireFn ? fireFn() : phFire(); o.position.set(c.x, C.Hgt(c.x, c.z), c.z); C.W.scene.add(o); campObjs.push(o); }
}

/* ---------- 佔位模型：每種一個簡單的塊面造型，採過的留下短莖或空巢 ---------- */
const geo = {}, mats = {}, PH_SCALE = 1.5;      // 佔位模型放大一點，草叢裡才看得到
const G = (k, f) => geo[k] || (geo[k] = f()), M = col => mats[col] || (mats[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, flatShading: true }));
const part = (g, col, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => { const m = new THREE.Mesh(g, M(col)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, 0, rz); m.castShadow = true; return m; };
function phMesh(kind, off) {
  const o = new THREE.Group(), col = C.ITEMS[kind].color, sh = GATHER[kind].shape, cone = G('cone', () => new THREE.ConeGeometry(0.16, 0.6, 5)), cyl = G('cyl', () => new THREE.CylinderGeometry(0.05, 0.06, 1, 5)), sph = G('sph', () => new THREE.IcosahedronGeometry(0.3, 0)), box = G('box', () => new THREE.BoxGeometry(0.5, 0.3, 0.36)), rock = G('rock', () => new THREE.DodecahedronGeometry(0.55, 0)), tor = G('tor', () => new THREE.TorusGeometry(0.3, 0.09, 5, 9));
  const green = '#4f8f4a', stem = '#7a6a48';
  if (sh === 'herb') { if (off) o.add(part(cyl, stem, 0, 0.06, 0, 1, 0.12)); else for (let i = 0; i < 3; i++) o.add(part(cone, col, Math.sin(i * 2.1) * 0.14, 0.28, Math.cos(i * 2.1) * 0.14, 1, 1, 1, Math.cos(i * 2.1) * 0.35, -Math.sin(i * 2.1) * 0.35)); }
  else if (sh === 'bush') { o.add(part(sph, green, 0, 0.3, 0, off ? 1.1 : 1.5, off ? 0.9 : 1.2, off ? 1.1 : 1.5)); if (!off) for (let i = 0; i < 4; i++) o.add(part(sph, col, Math.sin(i * 1.7) * 0.36, 0.42 + (i % 2) * 0.16, Math.cos(i * 1.7) * 0.36, 0.3)); }
  else if (sh === 'stalk') { o.add(part(cyl, stem, 0, off ? 0.1 : 0.4, 0, 1, off ? 0.2 : 0.8)); if (!off) { o.add(part(cone, col, 0, 0.95, 0, 0.9, 0.8, 0.9)); o.add(part(cone, col, 0.1, 0.7, 0.05, 0.6, 0.5, 0.6, 0, -0.5)); } }
  else if (sh === 'cap') { o.add(part(cyl, '#e8dcc0', 0, 0.12, 0, 1.6, 0.24, 1.6)); if (!off) o.add(part(sph, col, 0, 0.3, 0, 0.9, 0.5, 0.9)); }
  else if (sh === 'pad') o.add(part(sph, off ? '#3f5f58' : col, 0, 0.06, 0, off ? 0.7 : 1.5, 0.22, off ? 0.7 : 1.5));
  else if (sh === 'blob') { o.add(part(cyl, stem, 0, 0.45, 0, 2.4, 0.9, 2.4)); if (!off) o.add(part(sph, col, 0.12, 0.9, 0.12, 0.9, 1.05, 0.9)); }
  else if (sh === 'nest') { const t = part(tor, '#8a6a44', 0, 0.1, 0); t.rotation.x = Math.PI / 2; o.add(t); if (!off) for (let i = 0; i < 3; i++) o.add(part(sph, col, Math.sin(i * 2.1) * 0.1, 0.16, Math.cos(i * 2.1) * 0.1, 0.34, 0.42, 0.34)); }
  else if (sh === 'pile') { o.add(part(box, '#5c5148', 0, 0.12, 0, 1.2, 0.8, 1.2)); if (!off) { o.add(part(box, col, 0.1, 0.36, 0, 0.9, 0.8, 0.9, 0, 0.3)); o.add(part(cyl, col, -0.15, 0.5, 0.1, 1.2, 0.7, 1.2, 1.2, 0.4)); } }
  else { o.add(part(rock, '#6f6a64', 0, 0.3, 0, 1.1, 0.9, 1.1)); if (!off) for (let i = 0; i < 3; i++) o.add(part(rock, col, Math.sin(i * 2.3) * 0.36, 0.5 + i * 0.12, Math.cos(i * 2.3) * 0.3, 0.4)); }
  return o;
}
function phFire() {
  const o = new THREE.Group(), st = G('rock', () => new THREE.DodecahedronGeometry(0.55, 0)), cone = G('cone', () => new THREE.ConeGeometry(0.16, 0.6, 5));
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; o.add(part(st, '#66615c', Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, 0.36)); }
  const fl = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.5) })); fl.position.y = 0.5; fl.scale.set(1.8, 1.3, 1.8); o.add(fl); return o;
}
function build(s) { s.live = true; if (patchFn) { for (const n of s.nodes) { n.y = C.Hgt(n.x, n.z); n.shown = ''; } s.patch = patchFn(s.kind, s.nodes.map(n => ({ x: n.x, z: n.z }))); C.W.scene.add(s.patch.mesh); return; } for (const n of s.nodes) { n.y = C.Hgt(n.x, n.z); for (const k of ['on', 'off']) { const o = meshFn ? meshFn(n.kind, k === 'off') : phMesh(n.kind, k === 'off'); o.position.set(n.x, n.y, n.z); o.rotation.y = n.yaw; o.visible = false; C.W.scene.add(o); n[k] = o; } n.shown = ''; } }
function unbuild(s) { s.live = false; if (s.patch) { s.patch.dispose(); s.patch = null; } for (const n of s.nodes) for (const k of ['on', 'off']) if (n[k]) { C.W.scene.remove(n[k]); n[k] = null; } }
const avail = n => C.clock() >= n.readyAt;

/* ---------- 採 ---------- */
const reachOf = n => GATHER_K.reach + (GATHER[n.kind].tool ? 0.5 : 0);
function nearest(maxD, site, skip, ok) { let best = null, bd = maxD; for (const s of sites) { if (!s.live || (site && s !== site)) continue; for (const n of s.nodes) { if (n === skip || !avail(n) || (ok && !ok(n))) continue; const d = Math.hypot(n.x - C.me.x, n.z - C.me.z); if (d < bd) { bd = d; best = n; } } } return best; }
const toolMiss = n => { const t = GATHER[n.kind].tool; return t && !(C.P.inv[t] > 0) ? t : ''; };
// 提示文字（走近可以採的那一株）
export function hint() {
  if (cur || !near || C.me.sit) return ''; const it = C.ITEMS[near.kind], t = toolMiss(near);
  return t ? `${it.name}：需要${C.ITEMS[t].name}（雜貨商米洛有賣）` : `按住 ${C.keyOf('interact')} 採集${it.name}` + (near.big ? '（大株）' : '');
}
// 按下互動鍵：身邊有可以採的就開始採
export function start() {
  const me = C.me, n = near && avail(near) ? near : nearest(GATHER_K.reach + 0.5); if (!n || cur) return false;
  if (!me.alive || me.swim || me.drink || me.atk || me.cast || me.dodge || me.rush || me.charge || me.stun > 0) return false;
  return begin(n, false);
}
function begin(n, walk) {
  const t = toolMiss(n); if (t) { C.ui.toast(`要有${C.ITEMS[t].name}才能敲${C.ITEMS[n.kind].name}。雜貨商米洛有賣。`); C.ui.sfx('deny'); return false; }
  if (C.room(n.kind) < 1) { C.ui.toast(`${C.ITEMS[n.kind].name}已經帶滿 ${GATHER_K.cap} 個了`); return false; }
  const K = GATHER[n.kind]; cur = { node: n, kind: n.kind, t: 0, dur: K.t * (C.P.pas && C.P.pas.gather ? GATHER_K.mastery.time : 1), walk, mine: !!K.tool }; C.me.gather = cur; C.me.guard = false; return true;
}
export function cancel() { cur = null; C.me.gather = null; }
// 按住時自己走向下一株：回傳移動方向 [x, z]，不用走就回傳 null
export function drive() { if (!cur || !cur.walk) return null; const n = cur.node, dx = n.x - C.me.x, dz = n.z - C.me.z, d = Math.hypot(dx, dz) || 1;
  if (avoid && avoid(C.me.x, C.me.z, n.x, n.z)) { if (warned !== n) { warned = n; C.ui.toast('前面有看得到的陷阱，自己繞過去吧'); } cancel(); return null; }      // 0.7：自己走過去的路上出現看得到的陷阱就停下來（不會自己踩進去）
  return [dx / d, dz / d]; }
// 0.7：traps07.js 給的判斷 (x0, z0, x1, z1) => 這條路會不會碰到看得到的陷阱。按住互動鍵自動走向下一株時避開（手動按身邊那一株不受影響）
let avoid = null, warned = null;
export function setAvoid(fn) { avoid = typeof fn === 'function' ? fn : null; }
function collect(n) {
  const it = C.ITEMS[n.kind], K = GATHER[n.kind], luck = Math.max(0, C.D().luck - 1) + C.M().loot - 1; let got = n.big ? GATHER_K.bigN : 1, why = n.big ? '大株' : '';
  if (Math.random() < luck) { got++; why = why ? why + '、手氣好' : '手氣好'; }
  if (C.P.pas && C.P.pas.gather && ++picked % GATHER_K.mastery.every === 0) got++;
  got = C.addItem(n.kind, got); n.readyAt = C.clock() + K.re; n.rolled = false; n.big = false;
  C.pop(`+${got} ${it.name}` + (why ? `（${why}）` : ''), 'exp'); C.ui.sfx(K.tool ? 'mine' : 'gather', n.kind); C.fx('gather', n);
  C.quest('doGather'); C.quest('doGather:' + n.kind);
}

/* ---------- 每幀 ---------- */
export function update(dt, held) {
  const me = C.me, now = C.clock();
  scanT -= dt; if (scanT <= 0) { scanT = 0.4; for (const s of sites) { const d = Math.hypot(s.x - me.x, s.z - me.z) - s.r; if (!s.live && d < GATHER_K.show) build(s); else if (s.live && d > GATHER_K.hide) unbuild(s); } }
  near = null; let bd = 1e9;
  for (const s of sites) { if (!s.live) continue; for (const n of s.nodes) {
    const a = now >= n.readyAt; if (a && !n.rolled) { n.rolled = true; n.big = Math.random() < GATHER_K.big * C.D().luck * (s.wild7 || 1); }      /* 0.7：荒地 ×2 */      // 長回來的那一刻決定是不是大株
    const want = a ? (n.big ? 'big' : 'on') : 'off'; if (n.shown !== want) { n.shown = want; if (s.patch) s.patch.setState(n.i, a ? (n.big ? 2 : 0) : 1); else { n.on.visible = a; n.off.visible = !a; n.on.scale.setScalar(n.sc * (n.big ? 1.55 : 1) * (meshFn ? 1 : PH_SCALE)); } }
    if (a) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < reachOf(n) && d < bd) { bd = d; near = n; } }
  } }
  if (!cur) return;
  const n = cur.node, d = Math.hypot(n.x - me.x, n.z - me.z);
  if (!held || !me.alive || me.swim || me.drink || me.atk || me.dodge || me.cast || me.combat && cur.walk || C.moving() || !avail(n)) { cancel(); return; }      // 放開、自己移動、出手、挨打（game.js 的 hurtMe 會呼叫 cancel）都中斷
  if (cur.walk) { if (d < reachOf(n) * 0.7) { cur.walk = false; cur.t = 0; } return; }
  if (d > reachOf(n) + 0.6) { cancel(); return; }
  me.f = Math.atan2(n.x - me.x, n.z - me.z); cur.t += dt;
  if (cur.t >= cur.dur) {
    collect(n); const site = n.site; cur = null; me.gather = null;
    const nx = nearest(GATHER_K.auto, site, n, avoid ? (q => Math.hypot(q.x - me.x, q.z - me.z) <= reachOf(q) * 0.7 || !avoid(me.x, me.z, q.x, q.z)) : null); if (nx) begin(nx, Math.hypot(nx.x - me.x, nx.z - me.z) > reachOf(nx) * 0.7);      /* 0.7：路上有看得到的陷阱的那幾株跳過 */      // 還按著：接著採同一片裡最近的下一株（太遠就自己走過去）
  }
}
// 介面用：正在採的進度 { kind, name, p, walk } 或 null
export const progress = () => (cur ? { kind: cur.kind, name: C.ITEMS[cur.kind].name, p: cur.walk ? 0 : cur.t / cur.dur, walk: cur.walk } : null);
// 測試用：全部長好、列出某一種的株
export const debug = { regrow() { for (const s of sites) for (const n of s.nodes) { n.readyAt = 0; n.rolled = true; } }, nodes: kind => sites.filter(s => !kind || s.kind === kind).flatMap(s => s.nodes) };
