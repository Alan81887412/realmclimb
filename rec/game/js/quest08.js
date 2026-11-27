/* 0.8 任務接線（玩法總監 X10）：把劇情 story08.js／story08b.js 的 reach＋cond 目標接到遊戲裡（呼叫 game.js 的 questAct）。
   這個檔做的事：
   ① 事件：doVista、doCrocLook（看方向）｜doGrabSave（猩猩抓舉脫身／救人）｜doUpperOre、doIronOre、doSaltCalm（按住互動敲）｜doNameplate（撿名牌）｜
      doGateTouch:door／:winch（北關的門與絞盤，門不開）｜doTowerClimb（獵臺：梯子爬上、臺上不能出手）｜doCubHome（小猩猩跟回家）｜
      story08 原有的 doBisonStun、doCoilFree、doPatrolSeen、doChestnut（doBarkBreak 在 game.js 的 onMonState；doTrial 由 trial08.js 發）。
   ② 佔位觸發物：名牌、礦車、鹽壁、門、絞盤、小猩猩都是最簡單的方塊或模型＋互動鍵；美術之後換模型時只要換 mk*() 這幾個函式。
   ③ 新道具：劇情的道具代號在物品表裡沒有的，補一個佔位（ph8: 1，數值組在 data08 定義後這裡自動讓位）；掉落用 hooks08 的 lootExtra 掛鉤（DROPS08，機率先照數值決定08，新野獸的是暫定）。
   ④ 存檔：hooks08 的 save8('q8')。測試指令：window.__dev08.q8（__dev07 才有）。
   依賴：game.js（循環匯入，只在 init 之後用）、hooks08、beastai07／08b（查纏住、抓舉）、story08／08b（道具說明、名牌座標）、places08、land08。 */
import * as THREE from './three.bundle.js';
import { ITEMS, MOVES, MST, WORLD, angDiff } from './core.js';
import { Hgt, npcSpots } from './world.js';      /* R4：npcSpots（北境交件 NPC） */
import { popNumber, fxRing } from './actors.js';
import { keyOf } from './keys.js';
import * as H8 from './hooks08.js';
import * as BA7 from './beastai07.js';
import * as BB8 from './beastai08b.js';
import * as B08 from './beasts08.js';
import { input, qStatus } from './game.js';
import { PLACES, QUESTS } from './story.js';
import { LORE08 } from './story08.js';
import { LORE08B } from './story08b.js';
import { ELITE_SPOTS08, PATROL08, TROPHY08 } from './places08.js';
import { GATE08 } from './land08.js';
import { DROPS08 as D8, ELITE_DROPS08 as ED8, QUEST_DROP08 as QD8 } from './data08.js';      /* 0.8 X8：掉落數字 */
import './num08.js';      /* 0.8 X8：牛角飾、蟒膽劑的效果、開稀有天賦球箱 */

/* ============================== 佔位道具（物品表裡沒有的才補） ============================== */
const EXTRA_ITEMS = { pelt_croc: { name: '鱷魚皮', desc: '鱷魚的皮，又厚又硬，背上一排鱗。鍛造素材。' } };
const SELL8 = { horn: 12, pyskin: 20, quill: 6, pelt_ape: 30, pelt_croc: 18 };      /* 牛角、蟒皮照定案；箭豬刺、猩猩毛皮、鱷魚皮暫定 */
const GLYPH8 = { horn: '角', pgall: '膽', pyskin: '皮', collar: '圈', iron_collar: '鐵', ore_upper: '鐵', charm_horn: '飾', tonic_python: '劑', bone_margo: '骨', chest_rare: '箱', quill: '刺', pelt_ape: '皮', pelt_croc: '皮', troupe_bell: '鈴', troupe_ball: '球', troupe_bill: '單', keyring: '鑰' };
export const PH_ITEMS = [];
{ const all = Object.assign({}, LORE08.items || {}, LORE08B.items || {}, EXTRA_ITEMS);
  for (const id in all) { if (ITEMS[id] && ITEMS[id].txt8) { const o = all[id]; ITEMS[id].name = o.name || ITEMS[id].name; if (o.desc) ITEMS[id].desc = o.desc; delete ITEMS[id].txt8; continue; } /* X8：data08 定義的道具只補名字與說明 */ if (ITEMS[id]) continue; const o = all[id], tro = /^trophy_/.test(id);
    ITEMS[id] = { name: o.name, glyph: tro ? '徽' : GLYPH8[id] || [...o.name].pop(), color: tro ? '#c9b27a' : '#b9a27a', desc: o.desc || '', ph8: 1 }; if (SELL8[id]) ITEMS[id].sell = SELL8[id]; PH_ITEMS.push(id); }
  /* 戰利品還是 places08 的 TROPHY08 暫代（說明只有一句）時，換成劇情的名字與說明（獄卒長的戰利品劇情叫「半截舊鑰匙」，和 s18 的「獄卒犬的舊鑰匙圈」分開） */
  for (const id in TROPHY08) { const it = ITEMS[id], o = all[id]; if (it && o && it.desc === TROPHY08[id].desc) { it.name = o.name; it.desc = o.desc; } } }

/* ============================== 掉落（hooks08 的 lootExtra；回傳這一次擲到的 [[道具, 數量]]） ============================== */
/* 掉落的數字在 data08.js（數值總監 X8）：DROPS08 一般野獸、ELITE_DROPS08 菁英必掉、QUEST_DROP08 任務掉落；依據見 team/x8/報告.md */
export const DROPS08 = D8;
export const ELITE_DROPS08 = ED8;
let C = null, me = null, P = null;
const active = id => !!(P && P.q && P.q.a && P.q.a[id]);
const done = id => !!(P && P.q && Array.isArray(P.q.d) && P.q.d.includes(id));
const have = id => (P && P.inv[id]) || 0;
function lootExtra(v) {
  const out = []; if (!v || !P) return out; const luck = 1;
  if (v.elite && v.drop && ELITE_DROPS08[v.drop]) { for (const [id, n] of ELITE_DROPS08[v.drop]) out.push([id, n]); return out; }
  for (const [id, ch, ok] of DROPS08[v.type] || []) if ((!ok || ok(v)) && Math.random() < ch * luck) out.push([id, 1]);
  if (v.type === 'python') { if (!S.pg) { S.pg = 1; out.push(['pgall', 1]); } else if (Math.random() < QD8.pgallAgain) out.push(['pgall', 1]); }
  if (v.type === 'monkey' && active('x04')) for (const id of ['troupe_bell', 'troupe_ball', 'troupe_bill']) if (!have(id) && !out.some(o => o[0] === id) && Math.random() < QD8.troupe) { out.push([id, 1]); break; }
  if (v.type === 'dog' && v.lv >= QD8.keyLv && active('s18') && have('keyring') < 3 && Math.random() < QD8.keyring) out.push(['keyring', 1]);
  return out;
}

/* ============================== 觸發物的位置 ============================== */
const NP = (LORE08B.nameplates || []).map(n => ({ id: n.id, x: n.x, z: n.z, text: n.text, who: n.who }));
export const SPOTS08X = {
  rail: [[424, -431], [433, -424]],      /* m17 鐵道終點的翻倒礦車（rail_end 428,−428 兩側） */
  ramp: [[72, -279], [80, -272]],        /* s12 運鐵坡道的礦車（iron_ramp 76,−276） */
  salt: [[476, -12], [462, -28], [481, -30]],      /* s09 鹽原的鹽壁（salt_flat 470,−20） */
  door: [GATE08.door[0] - 5, GATE08.door[1] + 5],      /* 北關門前一步（門在 580,−580；面向西南） */
  winch: [[581, -569], [569, -581]],     /* 門邊兩座絞盤 */
  cub: [-413, -385],                     /* s17 走失的小猩猩（簡報給的 −417,−387 旁邊 4 公尺：那裡站著 55 號群的小猩猩，避開重疊） */
  home: (ELITE_SPOTS08.trophy_whiteback || [[-483, -435]])[0],      /* 白背老巢＝小猩猩的家 */
  gate: GATE08.door
};
const HILL_DOGS = new Set(PATROL08.filter(p => p.id === 'hill_in' || p.id === 'hill_out').flatMap(p => [...(p.members || []), ...(p.groups || []).flatMap(g => [g, g + 1, g + 2])]));      /* R4：巡邏路上的每一群（每群 3 隻）都算 */
export const CHESTNUT08 = 469;      /* s11 的「栗子」：hill_in 第一群（467–469）裡的一隻 13 級鬥犬；R4：真的在巡邏路上走（patrol08.js），和 patrol08 的 CHESTNUT_ID 同一隻 */

/* ============================== 狀態與存檔 ============================== */
const S = { np: [], tw: [], pg: 0, alt: 0, ch: null, look: 0, lookKey: '', grab: false, coil: false, resc: [], dz: new Map(), cub: null, cubT: 0, tipT: {}, objs: [], built: false, cnTagT: 0, ore: 0 };
function save() { const o = {}; if (S.np.length) o.np = S.np.slice(); if (S.tw.length) o.tw = S.tw.slice(); if (S.pg) o.pg = 1; if (S.alt) o.alt = 1; return Object.keys(o).length ? o : undefined; }
function load(d) { S.np = []; S.tw = []; S.pg = 0; S.alt = 0; if (!d || typeof d !== 'object') return; if (Array.isArray(d.np)) S.np = d.np.filter(x => NP.some(n => n.id === x)); if (Array.isArray(d.tw)) S.tw = d.tw.filter(x => x === 0 || x === 1 || x === 2); S.pg = d.pg ? 1 : 0; S.alt = d.alt ? 1 : 0; }

/* ============================== 共用 ============================== */
const objOpen = (qid, cond) => { const q = QUESTS.find(x => x.id === qid), a = P && P.q.a[qid]; if (!q || !a) return false; return q.objectives.some((o, i) => o.cond === cond && (a.o[i] || 0) < o.count); };
const condOpen = cond => { for (const id in P.q.a) if (objOpen(id, cond)) return true; return false; };
function act(c) { if (!C) return; C.questAct(c); }
const hyp = Math.hypot, near = (x, z, r) => hyp(me.x - x, me.z - z) < r, now = () => (C ? C.clock() : 0);
function tipOnce(k, lines, gap = 30) { const t = now(); if (S.tipT[k] && t - S.tipT[k] < gap) return; S.tipT[k] = t; C.ui.narrate(lines); }
const bearing = (x, z) => Math.atan2(x - me.x, z - me.z);
const lookYaw = () => (input.cam && input.cam.mode !== 'top' ? input.cam.yaw : me.f);
const facing = (x, z, tol = 0.7) => Math.abs(angDiff(lookYaw(), bearing(x, z))) < tol || Math.abs(angDiff(me.f, bearing(x, z))) < tol;
const towers = () => (C && C.W && C.W.p08b && Array.isArray(C.W.p08b.towers) ? C.W.p08b.towers : []);
const K = () => keyOf('interact');

/* ============================== 佔位模型（美術換模型時只換這幾個） ============================== */
const MAT = {};
const mat = (c, e = 0) => MAT[c + e] || (MAT[c + e] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: c === 0x6a6f74 ? 0.5 : 0, emissive: e ? c : 0, emissiveIntensity: e }));
function put(o, x, z, f = 0, dy = 0) { o.position.set(x, Hgt(x, z) + dy, z); o.rotation.y = f; C.W.scene.add(o); S.objs.push(o); return o; }
function box(w, h, d, c, y = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.y = y + h / 2; m.castShadow = true; return m; }
function mkPlate() { const g = new THREE.Group(); g.add(box(0.12, 0.9, 0.12, 0x5a4630)); const p = box(0.34, 0.24, 0.04, 0x6a6f74, 0.62); g.add(p); return g; }
function mkCart() { const g = new THREE.Group(); const b = box(1.7, 0.8, 1.1, 0x4b5258, 0); b.rotation.z = 1.25; b.position.set(0.3, 0.55, 0); g.add(b); const ore = box(0.5, 0.3, 0.4, 0x2c3a44, -0.1); ore.position.set(-0.7, 0, 0.2); g.add(ore); return g; }
function mkSalt() { const g = new THREE.Group(); g.add(box(1.4, 1.5, 0.6, 0xe8e2d4)); return g; }
function mkWinch() { const g = new THREE.Group(); g.add(box(0.9, 1.0, 0.9, 0x5a4630)); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 10), mat(0x6a6f74)); d.rotation.z = Math.PI / 2; d.position.y = 1.25; g.add(d); return g; }
function mkDoorMark() { const g = new THREE.Group(); g.add(box(0.5, 0.06, 0.5, 0x8a6a3a)); return g; }
function mkMarker() { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 })); return m; }
function mkCub() {
  try { const m = B08.makeBeast08('ape', 1, { young: true }); if (m && m.root) return m.root; } catch (e) { console.warn('[quest08] 小猩猩模型', e); }
  const g = new THREE.Group(); g.add(box(0.7, 0.8, 0.9, 0x2a2622)); const h = box(0.45, 0.4, 0.4, 0x3a332c); h.position.set(0, 0.75, 0.4); g.add(h); return g;
}
/* 觸發物清單：{ kind, x, z, r, o（模型）, mk（頭上的提示點）, on()（現在要不要出現） } */
const ITEMS8 = [];
function build() {
  if (S.built || !C || !C.W || !C.W.scene) return; S.built = true;
  const add = (kind, x, z, r, o, on, extra) => { const it = Object.assign({ kind, x, z, r, o, on, mk: null }, extra || {}); if (o) { put(o, x, z, extra && extra.f || 0); it.mk = mkMarker(); it.mk.visible = false; C.W.scene.add(it.mk); S.objs.push(it.mk); } ITEMS8.push(it); return it; };
  for (const n of NP) add('plate', n.x, n.z, 2.4, mkPlate(), () => active('m18') && objOpen('m18', 'doNameplate') && !S.np.includes(n.id), { id: n.id, text: n.text });
  for (const [x, z] of SPOTS08X.rail) add('rail', x, z, 2.6, mkCart(), () => active('m17') || done('m17'), { f: 0.6 });
  for (const [x, z] of SPOTS08X.ramp) add('ramp', x, z, 2.6, mkCart(), () => active('s12') || done('s12'), { f: 2.1 });
  for (const [x, z] of SPOTS08X.salt) add('salt', x, z, 2.4, mkSalt(), () => true, { f: 0.9 });
  add('door', SPOTS08X.door[0], SPOTS08X.door[1], 3.2, mkDoorMark(), () => true, { f: Math.PI / 4 });
  for (const [x, z] of SPOTS08X.winch) add('winch', x, z, 2.6, mkWinch(), () => true, { f: Math.PI / 4 });
}

/* ============================== 互動（game.js 的 interact 先問這裡；回傳 true＝處理了） ============================== */
function nearItem() { let best = null, bd = 1e9; for (const it of ITEMS8) { if (!it.on()) continue; const d = hyp(me.x - it.x, me.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } } return best; }
function nearLadder() { const T = towers(); for (let i = 0; i < T.length; i++) { const t = T[i], l = t.ladder; if (l && hyp(me.x - l[0], me.z - l[1]) < 2.2) return i; } return -1; }
function cubNear() { const c = S.cub; return c && c.st !== 'home' && hyp(me.x - c.x, me.z - c.z) < 3.2 ? c : null; }
function chestnutNear() { if (!active('s11') || !objOpen('s11', 'doChestnut') || !have('bone_margo')) return null; const v = C.mons[CHESTNUT08]; if (!v || v.st === MST.DEAD || v.st === MST.WIND || v.st === MST.STRIKE || hyp(me.x - v.x, me.z - v.z) > 6) return null; if (C.myDmg && C.mkey && C.myDmg[C.mkey(v)] > 0) return null; return v; }      /* 還沒被你打過、不在出招中（牠發現你以後照樣可以餵：巡邏與「帶狗群走開」等 R4／P2 的 beast:chestnut） */
/* ============================== R4：主線 m16–m19 的交件人（北境）：霜林獵屋的哈根、攻略團營地的巴索助手。
   座標：離營火 3–4 m、離最近的野獸 30 m 以上（營地的虎在 381,−480，離助手 30 m）；NPC 的對話資料在 story08b.js 的 NPCS_NEW08B。 ============================== */
{
  if (!npcSpots.some(n => n.id === 'aide')) npcSpots.push({ id: 'aide', name: '巴索的助手 小蘆', look: '5;1,2,5,9,0,1,98,100,42,44,40,44,0;', ft: { hair: 3, hc: 5, skin: 1, eye: 2, brow: 1, nose: 1, mouth: 2, lash: 1, blush: 2 }, fs: { es: 10 }, x: 356.4, z: -497.4, f: 1.2 });
  if (!npcSpots.some(n => n.id === 'hunter_n')) npcSpots.push({ id: 'hunter_n', name: '老獵人 哈根', look: '5;0,1,2,10,0,4,105,98,60,48,60,54,7;', ft: { hair: 7, hc: 11, skin: 4, fs: 4, eye: 4, ec: 7, brow: 3, nose: 3, mouth: 5, beard: 3, mark: 3, blush: 0 }, fs: { bs: 15, es: 8, fj: 13 }, x: -348.5, z: -483.8, f: -1.57 });
}
const HOLD = { salt: 1.6, rail: 1.6, ramp: 1.6 };
export function interact() {
  if (!C || !me || !me.alive || input.talk || !input.started) return false;
  if (S.ch) return true;
  if (me.tower8) { climbDown(); return true; }
  const li = nearLadder(); if (li >= 0 && !me.combat) { climbUp(li); return true; }
  const cv = chestnutNear(); if (cv) { feedChestnut(cv); return true; }
  const cb = cubNear(); if (cb) { feedCub(cb); return true; }
  const it = nearItem(); if (!it) return false;
  if (HOLD[it.kind]) { S.ch = { it, t: 0, dur: HOLD[it.kind], x: me.x, z: me.z }; me.vx = me.vz = 0; return true; }
  use(it); return true;
}
export function hint() {
  if (!C || !me || !me.alive || input.talk) return '';
  if (S.ch) { const k = Math.min(1, S.ch.t / S.ch.dur); return `${S.ch.it.kind === 'salt' ? '敲岩鹽' : '敲上層鐵'}……${Math.round(k * 100)}%（按住 ${K()}）`; }
  if (me.tower8) return `站在獵臺上（臺上不能出手，可以喝藥）。按 ${K()} 爬下來`;
  if (nearLadder() >= 0 && !me.combat) return `按 ${K()} 爬上獵臺`;
  if (chestnutNear()) return `按 ${K()} 把瑪歌的骨頭遞給栗子`;
  const cb = cubNear(); if (cb) return cb.st === 'follow' ? '小猩猩跟著你。帶牠走回霜林深處的家' : have('berry') ? `按 ${K()} 餵小猩猩一顆漿果` : '小猩猩看著你的手。身上沒有漿果';
  const it = nearItem(); if (!it) return '';
  return { plate: `按 ${K()} 撿起名牌`, rail: `按住 ${K()} 在翻倒的礦車上敲上層鐵`, ramp: `按住 ${K()} 在翻倒的礦車上敲上層鐵`, salt: `按住 ${K()} 在鹽壁上敲岩鹽`, door: `按 ${K()} 把手按在北關的門上`, winch: `按 ${K()} 轉動門邊的絞盤` }[it.kind] || '';
}
function use(it) {
  const y = Hgt(it.x, it.z);
  if (it.kind === 'plate') { S.np.push(it.id); C.Store.dirty = true; C.ui.narrate([it.text]); popNumber(it.x, y + 1.6, it.z, '名牌', 'heal'); C.ui.sfx('quest', 'found'); act('doNameplate'); return; }
  if (it.kind === 'door') { C.ui.sfx('gate', 'touch', { x: it.x, z: it.z }); if (condOpen('doGateTouch:door')) act('doGateTouch:door'); else C.ui.toast('鐵很冷。門紋風不動。'); return; }
  if (it.kind === 'winch') { C.ui.sfx('winch', 'jam', { x: it.x, z: it.z }); if (condOpen('doGateTouch:winch')) act('doGateTouch:winch'); else C.ui.toast('絞盤鏽死了，像被一根粗鐵門閂從裡面卡住。'); return; }
}
function finishHold(it) {
  const y = Hgt(it.x, it.z);
  if (it.kind === 'rail' || it.kind === 'ramp') { C.addItem('ore_upper'); popNumber(it.x, y + 1.8, it.z, '上層鐵塊', 'heal'); C.ui.sfx('gather', 'rock'); act(it.kind === 'rail' ? 'doUpperOre' : 'doIronOre'); return; }
  if (it.kind === 'salt') {
    if (bisonAngry()) { C.ui.toast('牛群被驚動了：這一塊不算。打完或退開，等牠們平靜再敲。'); C.ui.sfx('deny'); return; }
    if (ITEMS.salt) C.addItem('salt'); popNumber(it.x, y + 1.8, it.z, '岩鹽', 'heal'); C.ui.sfx('gather', 'rock'); act('doSaltCalm');
  }
}
/* s09「驚動」：敲下的當下，35 公尺內有野牛正在打（追、預備、出招、收招；警告不算） */
function bisonAngry() { for (const v of C.mons) { if (!v || v.type !== 'bison' || v.st === MST.DEAD) continue; if (hyp(v.x - me.x, v.z - me.z) > 35) continue; if (v.st === MST.CHASE || v.st === MST.WIND || v.st === MST.STRIKE || (v.st === MST.RECOVER && v.M !== MOVES.bison_daze)) return true; } return false; }

/* ---------- 獵臺：梯子觸發、臺面可站、臺上不能出手（game.js 的 canAct 看 me.tower8） ---------- */
function climbUp(i) {
  const t = towers()[i]; if (!t) return; me.tower8 = { i, x: t.x, z: t.z, rot: t.rot, y: t.platformY }; me.x = t.x; me.z = t.z; me.vx = me.vz = me.kx = me.kz = 0; me.atk = null; me.charge = null; me.guard = false;
  C.ui.sfx('step', 'wood'); revealAround(2);
  if (active('x01') && !S.tw.includes(i)) { S.tw.push(i); C.Store.dirty = true; act('doTowerClimb'); }
  C.ui.tip('tower8', '站在獵臺上看得比較遠（地圖會多開一圈）。臺上不能出手、不能閃避，可以喝藥；要打就先爬下來。別的玩家看得到你站在臺上。');
}
function climbDown() { const t = me.tower8, T = towers()[t.i]; me.tower8 = null; if (T && T.ladder) { me.x = T.ladder[0]; me.z = T.ladder[1]; } me.vx = me.vz = 0; C.ui.sfx('step', 'wood'); }
function towerTick() {
  const t = me.tower8; if (!t) return;
  if (!me.alive || hyp(me.x - t.x, me.z - t.z) > 6) { me.tower8 = null; return; }      /* 倒下、被傳送走：離開臺面 */
  const c = Math.cos(t.rot), s = Math.sin(t.rot), dx = me.x - t.x, dz = me.z - t.z, u = dx * c - dz * s, v = dx * s + dz * c, L = 1.3, uu = Math.max(-L, Math.min(L, u)), vv = Math.max(-L, Math.min(L, v));
  if (uu !== u || vv !== v) { me.x = t.x + uu * c + vv * s; me.z = t.z - uu * s + vv * c; }
  me.atk = null; me.charge = null; me.cast = null;
}
/* 站上高處：地圖的探索範圍一次多開 k 倍（平常半徑 7 格） */
function revealAround(k) {
  const FN = WORLD.FOG, gx = Math.floor((me.x + WORLD.FOG_SIZE / 2) / WORLD.FOG_SIZE * FN), gz = Math.floor((me.z + WORLD.FOG_SIZE / 2) / WORLD.FOG_SIZE * FN), R = Math.round(7 * k), R2 = R * R + 3; if (!P.explored || !FN) return;
  let ch = false; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dz * dz > R2) continue; const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= FN || z >= FN) continue; if (!P.explored[z * FN + x]) { P.explored[z * FN + x] = 1; ch = true; } }
  if (ch) { me.exploredDirty = true; C.Store.dirty = true; }
}

/* ---------- 看：望門石看北關（doVista）、渡口看鱷灘（doCrocLook）：在範圍內、面向目標停 1 秒 ---------- */
function lookTick(dt) {
  let key = '', tx = 0, tz = 0, pl = null;
  if (condOpen('doVista') && (pl = PLACES.vista_rock) && near(pl.x, pl.z, pl.r)) { key = 'doVista'; tx = SPOTS08X.gate[0]; tz = SPOTS08X.gate[1]; }
  else if (condOpen('doCrocLook') && (pl = PLACES.ferry_camp) && near(pl.x, pl.z, pl.r) && PLACES.croc_beach) { key = 'doCrocLook'; tx = PLACES.croc_beach.x; tz = PLACES.croc_beach.z; }
  if (!key) { S.look = 0; return; }
  if (key !== S.lookKey) { S.lookKey = key; S.look = 0; tipOnce('look' + key, [key === 'doVista' ? '北關在東邊，兩道崖之間。轉過去，看一眼。' : '鱷灘在湖的西南岸，沙洲後面。轉過去，遠遠看一眼就好。'], 60); }
  const still = hyp(me.vx || 0, me.vz || 0) < 0.6;
  if (facing(tx, tz) && still) { S.look += dt; if (S.look >= 1) { S.look = 0; act(key); } } else S.look = 0;
}

/* ---------- 抓舉（doGrabSave）與纏住（doCoilFree）：自己脫身（還站著）或打到抓著隊友的那隻、隊友 3 秒內鬆開 ---------- */
function holdTick() {
  const g = BB8.struggle ? BB8.struggle() : null, gOn = !!(g && g.grab);
  if (S.grab && !gOn && me.alive) act('doGrabSave'); S.grab = gOn;
  const c = BA7.struggle ? BA7.struggle() : null, cOn = !!(c && c.kind === 'coil');
  if (S.coil && !cOn && me.alive) act('doCoilFree'); S.coil = cOn;
  const t = now();
  for (let i = S.resc.length - 1; i >= 0; i--) { const r = S.resc[i], rm = C.remotes.get(r.peer), p = rm && rm.lastPres, v = p && Array.isArray(p[r.key]) ? p[r.key][0] | 0 : -1;
    if (v !== r.id) { if (rm && rm.alive !== false) act(r.key === 'g8' ? 'doGrabSave' : 'doCoilFree'); S.resc.splice(i, 1); } else if (t - r.t > 3) S.resc.splice(i, 1); }
}
function onHitMon(e) {
  const v = e && e.v; if (!v || (v.type !== 'ape' && v.type !== 'python')) return; const key = v.type === 'ape' ? 'g8' : 'h7';
  for (const [peer, r] of C.remotes) { const p = r.lastPres; if (p && Array.isArray(p[key]) && (p[key][0] | 0) === v.id && !S.resc.some(o => o.peer === peer && o.key === key)) S.resc.push({ peer, key, id: v.id, t: now() }); }
}

/* ---------- 野牛撞暈（doBisonStun）：25 公尺內的野牛進入撞暈 ---------- */
function dazeTick() {
  if (!condOpen('doBisonStun')) { S.dz.clear(); return; }
  for (const v of C.mons) { if (!v || v.type !== 'bison') continue; const dz = v.st === MST.RECOVER && v.M === MOVES.bison_daze, was = S.dz.get(v.id); S.dz.set(v.id, dz); if (dz && !was && hyp(v.x - me.x, v.z - me.z) < 25) act('doBisonStun'); }
}

/* ---------- 巡邏（doPatrolSeen）：後山巡邏群（hill_in／hill_out）的鬥犬在 28 公尺內。R4：牠們真的沿巡邏路來回走（patrol08.js），位置照共同時鐘，站得夠近就看得到 ---------- */
function patrolTick() {
  const want = condOpen('doPatrolSeen'), wantC = active('s11') && objOpen('s11', 'doChestnut'); if (!want && !wantC) return;
  let seen = false; for (const id of HILL_DOGS) { const v = C.mons[id]; if (v && v.st !== MST.DEAD && hyp(v.x - me.x, v.z - me.z) < 28) { seen = true; break; } }
  if (want && seen) act('doPatrolSeen');
  const wt = PLACES.west_trail; if (wt && near(wt.x, wt.z, wt.r) && !seen) tipOnce('patrol', ['獸徑上的爪印是新的，狗群剛走過。牠們沿著巡邏道來回走，在哨點停下來嗅一嗅。往東邊的巡邏道走，等牠們經過就看得到。'], 90);
  if (wantC) { const v = C.mons[CHESTNUT08], t = now(); if (v && v.st !== MST.DEAD && hyp(v.x - me.x, v.z - me.z) < 22 && t - S.cnTagT > 4) { S.cnTagT = t; popNumber(v.x, Hgt(v.x, v.z) + 2.2, v.z, '嘴邊白白的那隻', 'other'); } }
}
function feedChestnut(v) { H8.emit('beast:chestnut', { v, how: 'feed', who: 'self' }); /* R4：patrol08.js 讓整群走開 */ C.take('bone_margo', 1); popNumber(v.x, Hgt(v.x, v.z) + 2, v.z, '栗子', 'heal'); C.ui.narrate(['牠停下來，聞了聞骨頭，低下頭。你解下牠的項圈：背面刻著「栗子」。', '牠叼著骨頭，帶著狗群慢慢走開了。']); act('doChestnut'); }
function onKill(e) { const v = e && e.v; if (!v) return; if (v.id === CHESTNUT08 && active('s11') && objOpen('s11', 'doChestnut')) { S.alt = 1; C.Store.dirty = true; H8.emit('beast:chestnut', { v, how: 'kill', who: 'self' }); C.ui.narrate(['牠倒下的地方，項圈的背面刻著「栗子」。']); act('doChestnut'); act('doChestnut:kill'); } }

/* ---------- 小猩猩（doCubHome）：s17 進行中才出現；餵一顆漿果就跟著走 25 公尺內，走到白背的老巢就回家 ---------- */
function cubTick(dt) {
  const want = active('s17') && objOpen('s17', 'doCubHome');
  if (!want) { if (S.cub && S.cub.st !== 'home') dropCub(); return; }
  if (!S.cub) { const o = mkCub(); const [x, z] = SPOTS08X.cub; put(o, x, z, 0); S.cub = { o, x, z, f: 0, st: 'wait', t: 0 }; }
  const c = S.cub, d = hyp(me.x - c.x, me.z - c.z);
  if (c.st === 'home') { c.t += dt; const [hx, hz] = SPOTS08X.home; walkCub(c, hx, hz, 3.5, dt); if (c.t > 6) dropCub(); return; }
  if (c.st === 'follow') {
    if (d > 25 || !me.alive) { c.st = 'wait'; tipOnce('cubstop', ['小猩猩停下來，不肯再走。再餵牠一顆漿果吧。'], 20); }
    else if (d > 2.6) walkCub(c, me.x, me.z, Math.min(6.2, 2 + d * 0.8), dt, 2.4);
    const [hx, hz] = SPOTS08X.home; if (hyp(c.x - hx, c.z - hz) < 14) { c.st = 'home'; c.t = 0; C.ui.narrate(['小猩猩鬆開你的衣角，往樹下的大影子跑過去。', '大影子把牠拉進懷裡，看了你一眼，轉身走進林子裡。']); act('doCubHome'); }
  } else if (d < 12) { c.f = Math.atan2(me.x - c.x, me.z - c.z); c.o.rotation.y = c.f; }
  c.o.position.y = Hgt(c.x, c.z) + Math.abs(Math.sin(now() * 7)) * (c.st === 'follow' && d > 2.6 ? 0.12 : 0.02);
}
function walkCub(c, tx, tz, sp, dt, stop = 0.5) { const dx = tx - c.x, dz = tz - c.z, d = hyp(dx, dz); if (d < stop) return; const k = Math.min(1, sp * dt / d); c.x += dx * k; c.z += dz * k; c.f = Math.atan2(dx, dz); c.o.position.x = c.x; c.o.position.z = c.z; c.o.rotation.y = c.f; }
function feedCub(c) {
  if (c.st === 'follow') return; if (!have('berry')) { C.ui.toast('身上沒有漿果。托比給的吃完了的話，霜林也有野莓。'); C.ui.sfx('deny'); return; }
  C.take('berry', 1); c.st = 'follow'; popNumber(c.x, Hgt(c.x, c.z) + 1.6, c.z, '跟上來了', 'heal'); C.ui.sfx('quest', 'found'); tipOnce('cubgo', ['小猩猩把漿果塞進嘴裡，抓住你的衣角。帶牠往霜林深處走。'], 20);
}
function dropCub() { const c = S.cub; S.cub = null; if (!c) return; C.W.scene.remove(c.o); const i = S.objs.indexOf(c.o); if (i >= 0) S.objs.splice(i, 1); }

/* ---------- 每幀 ---------- */
let markT = 0;
function frame(dt) {
  if (!C || !me || !P || !P.q) return; if (!S.built) build(); if (!S.built) return;
  if (S.ch) { const ch = S.ch; ch.t += dt; if (!input.useHeld || hyp(me.x - ch.x, me.z - ch.z) > 0.8 || !me.alive || me.stun > 0) { S.ch = null; if (ch.t < ch.dur) C.ui.toast('要按住不放才敲得下來'); } else if (ch.t >= ch.dur) { S.ch = null; finishHold(ch.it); } }
  towerTick(); lookTick(dt); holdTick(); dazeTick(); patrolTick(); cubTick(dt);
  if ((markT -= dt) <= 0) { markT = 0.25; for (const it of ITEMS8) { if (!it.o) continue; const on = it.on(), d = hyp(me.x - it.x, me.z - it.z); it.o.visible = on && d < 140; if (it.mk) { it.mk.visible = on && d < 60 && (it.kind !== 'salt' || condOpen('doSaltCalm')) && (it.kind !== 'door' && it.kind !== 'winch' || active('m19')); it.mk.position.set(it.x, Hgt(it.x, it.z) + 2.6, it.z); } } }
  for (const it of ITEMS8) if (it.mk && it.mk.visible) { it.mk.rotation.y += dt * 1.6; it.mk.position.y = Hgt(it.x, it.z) + 2.6 + Math.sin(now() * 2.2) * 0.12; }
  if (!active('x01') && S.tw.length && done('x01')) S.tw = [];
}

/* ============================== 測試指令 ============================== */
function devCmds() {
  if (typeof window === 'undefined' || !window.__dev07) return; const Dv = window.__dev08 = window.__dev08 || {};
  const at = k => { if (PLACES[k]) return [PLACES[k].x, PLACES[k].z]; const n = NP.find(o => o.id === k); if (n) return [n.x + 1, n.z + 1];
    const T = towers(); if (/^tower\d$/.test(k) && T[+k[5]]) return [T[+k[5]].ladder[0], T[+k[5]].ladder[1]];
    if (k === 'door') return [SPOTS08X.door[0] - 1, SPOTS08X.door[1] + 1]; if (/^winch\d$/.test(k)) return [SPOTS08X.winch[+k[5]][0] - 1.2, SPOTS08X.winch[+k[5]][1] + 1.2];
    if (/^(rail|ramp|salt)\d$/.test(k)) { const p = SPOTS08X[k.slice(0, 4)][+k[4]]; return [p[0] + 1.3, p[1] + 1.3]; } if (k === 'cub') return [SPOTS08X.cub[0] + 2, SPOTS08X.cub[1] + 2]; if (k === 'home') return SPOTS08X.home.slice(); return null; };
  Dv.q8_loot = lootExtra; Dv.q8_item = id => ITEMS[id] && { name: ITEMS[id].name, desc: ITEMS[id].desc };
  Dv.q8 = {
    S, SPOTS08X, NP, ITEMS8, DROPS08, PH_ITEMS, CHESTNUT08,
    at, tp: k => { const p = Array.isArray(k) ? k : at(k); if (!p) return null; me.x = p[0]; me.z = p[1]; me.vx = me.vz = me.kx = me.kz = 0; me.tower8 = null; return p; },
    act: c => act(c), hint, interact,
    use: kind => { const it = ITEMS8.find(o => o.kind === kind && o.on() && hyp(me.x - o.x, me.z - o.z) < o.r); if (!it) return null; if (HOLD[kind]) finishHold(it); else use(it); return it.kind; },
    face: (x, z) => { me.f = Math.atan2(x - me.x, z - me.z); if (input.cam) input.cam.yaw = me.f; return me.f; },
    climb: i => { climbUp(i | 0); return !!me.tower8; }, down: () => { if (me.tower8) climbDown(); return !me.tower8; },
    towers: () => towers().map(t => ({ x: +t.x.toFixed(1), z: +t.z.toFixed(1), y: +t.platformY.toFixed(2), ladder: t.ladder.map(v => +v.toFixed(1)) })),
    cub: () => S.cub && { st: S.cub.st, x: +S.cub.x.toFixed(1), z: +S.cub.z.toFixed(1) },
    state: () => ({ np: S.np.slice(), tw: S.tw.slice(), pg: S.pg, alt: S.alt, ch: S.ch && S.ch.it.kind, tower: me.tower8 && me.tower8.i, cub: S.cub && S.cub.st, look: +S.look.toFixed(2) })
  };
}

/* ============================== 接上 ============================== */
H8.on('init', ctx => { C = ctx; me = ctx.me; P = ctx.P; H8.provide('lootExtra', lootExtra, 'X10'); devCmds(); });
H8.on('frame', dt => { try { frame(dt); } catch (e) { console.error('[quest08]', e); } });
H8.on('me:hitMon', onHitMon);
H8.on('mon:kill', onKill);
H8.save8('q8', save, load);
export const debug08x = { S, ITEMS8, SPOTS08X, lootExtra, act };
