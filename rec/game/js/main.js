// 進入點：載入、攝影機、主迴圈
import { HERO_ON, loadHero } from './hero27.js';
import * as THREE from './three.bundle.js';
import { clamp, lerp, damp, dampAng, angDiff, waterLevel, MST, baseZone } from './core.js';
import { W, initWorld, updateWorld, render, Hgt, tryMove, blockedAt, sightClear, slopeAt, waterDepth, monBlocked, SLOPE, groundAt, waterDist, resize } from './world.js';
import { loadAvatars, initFx, updateFx, updateNumbers, initLabels, fx, project } from './actors.js';
import { initGame, bootNet, tick, me, input, P, Net, Store, mons, remotes, npcs, debug, gainExp, addItem, getClock, tryAttack, tryHeavy, tryDodge, toggleLock, cycleLock, lockTarget, aiming, grantBasics, aimAngle, setOf, castSkill, learnOrb, equipSkill, pickGift, allocate, QUESTS, NPCS, PLACES, qStatus, objProg, acceptQuest, turnInQuest, trackQuest, talkTo, npcMark, isNight, interact } from './game.js';
import { initUI, initMaps, updateUI, uiProgress, uiReady, uiFatal, applyQuality, getQuality, perf, softGpu } from './ui.js';
import { ui, setPlaces06, setProps06, Ars, Craft, Needs, Gather, M6, inCombat, room, setEliteSpots, useItem, buy, sell, setLook, refreshDerived, mkey } from './game.js';
import * as SND08 from './snd08.js'; import { syncCampFires } from './campfire08.js';      /* 營火聲補齊 15 處；0.8 X11：新野獸與菁英的招式聲 */
import {setIcon06 } from './ui.js';
import * as GA from './audio.js';
import { biteUpdate } from './bitefx08.js';      /* 0.8 咬合特效每幀更新 */

window.__boot = 1;
const canvas = document.getElementById('scene');
const cam = { x: 0, z: 0, y: 0, ready: false, d: 6, fov: 36 }, ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), look = new THREE.Vector3();
const TALK0 = { u: 0.62, v: 0.82 }, tbox = new THREE.Box3(), TALK_TAN = Math.tan(40 * Math.PI / 360);
const FISHCAM = { side: 1.2, pull: 0.12, lookBob: 0.35, lookUp: 0.6 };      // 0.7 釣魚鏡頭：右肩偏移（公尺）、拉近比例、視線往浮標偏的比例、看浮標上方多高
// 背後視角平常也稍微偏右肩（角色在畫面中間偏左，準心前方不被 Q 版大頭擋住）；戴高帽子（巫師帽）時鏡頭支點再抬高、再偏一點。HAT_UP：各頂帽子比頭頂高出多少公尺（actors.js 的 HATS 順序）
const TPSCAM = { side: 0, tallSide: 0.45, tallUp: 0.3, tall: 0.3 }, HAT_UP = [0, 0.12, 0.62, 0.22];      // 使用者：沒戴高帽子時鏡頭和 0.6a 一樣（side 0）；帽子比頭頂高 tall 公尺以上（現在只有巫師帽）才算高帽子：鏡頭偏右肩 tallSide 公尺、支點抬高 tallUp 公尺（V2＝0.45／0.3＋帽子變淡）
// 戴高帽子時：帽子預設不透明，只有真的擋住要看的東西（鎖定目標、對付你的怪、開打中的敵對玩家、瞄準時的準心）才淡成網點 a——規則見下面 hatFade 前的說明（fix07-hat）
// a 淡到多少｜tin 淡入秒數｜tout 淡回秒數｜hold 擋住的條件消失後維持幾秒｜r 只看幾公尺內的怪與玩家｜mem 打過幾秒內的怪算「對付你」｜pad 帽子方框外擴幾像素
const HATF = { on: true, a: 0.25, tin: 0.15, tout: 0.25, hold: 0.5, r: 25, mem: 4, pad: 10 };
if (typeof window !== 'undefined') { window.__fishcam = FISHCAM; window.__tpscam = TPSCAM; window.__hatf = HATF; }      // 測試用：量改前改後（全部設 0＝改前的鏡頭）
const setFov = (f, dt) => { cam.fov = dt ? damp(cam.fov, f, 6, dt) : f; const F = cam.fov + ck.f; if (Math.abs(W.camera.fov - F) > 0.02) { W.camera.fov = F; W.camera.updateProjectionMatrix(); } };      // ck.f：重擊時視角往內縮一下
// 鏡頭的震動與衝擊（打擊感）：fx.shake 是持續的晃動（0–1，平方後當幅度；幾個不同頻率的正弦疊成平滑的抖動，不再每幀亂跳），並帶一點側傾；
// fx.kx／ky／kz 是一下衝擊的速度（方向＝受力方向）、fx.punch 是視角往內縮的度數，都由彈簧拉回原位。只影響自己的鏡頭
const ck = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, f: 0, vf: 0, t: 0, sx: 0, sy: 0, sz: 0, roll: 0 };
function camShake(dt) {
  fx.shake = Math.max(0, fx.shake - dt * 1.9); const tr = Math.min(1, fx.shake), sh = tr * tr, t = (ck.t += dt), n = (a, b, c) => (Math.sin(t * a + c) + 0.6 * Math.sin(t * b + c * 2.3)) / 1.6;
  ck.sx = sh * 0.6 * n(31, 53, 0.3); ck.sz = sh * 0.6 * n(37, 47, 1.9); ck.sy = sh * 0.3 * n(43, 29, 2.7); ck.roll = sh * 0.04 * n(27, 41, 4.1);
  if (fx.kx || fx.ky || fx.kz) { ck.vx += fx.kx; ck.vy += fx.ky; ck.vz += fx.kz; fx.kx = fx.ky = fx.kz = 0; } if (fx.punch) { ck.vf -= fx.punch * 16; fx.punch = 0; }
  for (let k = Math.ceil(dt / 0.01), h = dt / Math.max(1, k), i = 0; i < k; i++) { const w2 = 576, c = 24; ck.vx += (-w2 * ck.x - c * ck.vx) * h; ck.vy += (-w2 * ck.y - c * ck.vy) * h; ck.vz += (-w2 * ck.z - c * ck.vz) * h; ck.vf += (-w2 * 0.5 * ck.f - c * 0.7 * ck.vf) * h; ck.x += ck.vx * h; ck.y += ck.vy * h; ck.z += ck.vz * h; ck.f += ck.vf * h; }
  if (!(Math.abs(ck.x) < 3 && Math.abs(ck.y) < 3 && Math.abs(ck.z) < 3 && Math.abs(ck.f) < 20)) { ck.x = ck.y = ck.z = ck.vx = ck.vy = ck.vz = ck.f = ck.vf = 0; }      // 保險：數值異常就歸零
}
// 回傳自己角色的不透明度（鏡頭貼近時淡出）；沒回傳就是完全不透明
/* N5：創角鏡頭 → 遊戲鏡頭的過渡。創角中每幀記下鏡頭的位置、視線點、視角；離開創角後 0.9 秒內，把「記下的」和「遊戲鏡頭算出來的」做平滑內插（位置、視線、視角），避免瞬間切換 */
const XB = { s: null, t: 1, dur: 0.9, f: 0 }, _xp = new THREE.Vector3(), _xl = new THREE.Vector3();
function moveCamera(dt) {
  const c = W.camera, a = moveCamera0(dt);
  if (input.creator) { XB.s = [c.position.x, c.position.y, c.position.z, look.x, look.y, look.z, c.fov]; XB.f = me.f; XB.t = 0; return a; }
  if (XB.s && XB.t < 1) {
    XB.t = Math.min(1, XB.t + dt / XB.dur); const u = XB.t * XB.t * (3 - 2 * XB.t), s = XB.s;
    _xp.set(s[0] + (c.position.x - s[0]) * u, s[1] + (c.position.y - s[1]) * u, s[2] + (c.position.z - s[2]) * u); _xl.set(s[3] + (look.x - s[3]) * u, s[4] + (look.y - s[4]) * u, s[5] + (look.z - s[5]) * u);
    c.position.copy(_xp); c.lookAt(_xl); c.fov = s[6] + (c.fov - s[6]) * u; c.updateProjectionMatrix();
    if (!(me.speed01 > 0.05)) { const d = ((Math.PI - XB.f + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; me.f = Math.PI - d * (1 - u); } /* 站著不動時，角色從創角時的朝向平順轉到面向南門（不是單幀轉 180 度） */
  }
  return a;
}
function moveCamera0(dt) {
  const gy = me.y != null ? me.y : Hgt(me.x, me.z), c = W.camera, C = input.cam;      // me.y：角色腳底的高度（游泳時浮在水面，不是池底）
  if (input.creator) {
    const face = input.creatorFocus === 'face', hy = gy + 1.98 * (me.avatar.look.h / 100), tx = me.x + (face ? 0.62 : 1.15), ty = face ? hy + 0.08 : gy + 1.5, tz = me.z + (face ? 3.9 : 7.4);
    if (!cam.creator) { cam.creator = true; c.position.set(tx + 3, ty + 3.5, tz + 9); look.set(me.x, gy + 1, me.z); }
    c.position.x = damp(c.position.x, tx, 5, dt); c.position.y = damp(c.position.y, ty, 5, dt); c.position.z = damp(c.position.z, tz, 5, dt);
    look.x = damp(look.x, me.x + (face ? 0.56 : 1.3), 6, dt); look.y = damp(look.y, face ? hy : gy + 1.28, 6, dt); look.z = damp(look.z, me.z, 6, dt); c.lookAt(look); cam.ready = false; setFov(36); return;
  }
  cam.creator = false;
  if (!cam.ready) { cam.x = me.x; cam.z = me.z; cam.y = gy; cam.ready = true; cam.d = C.dist; cam.snap = true; }
  cam.x = damp(cam.x, me.x, 14, dt); cam.z = damp(cam.z, me.z, 14, dt); cam.y = damp(cam.y, gy, 7, dt);
  camShake(dt); const sx = ck.sx + ck.x, sz = ck.sz + ck.z, sy = ck.sy + ck.y;
  const T = input.talk;
  if (T) {
    // 交談：鏡頭在自己這一側、往旁邊偏一點，自己淡出不入鏡（Q 版的大頭放在肩後會擋掉三分之一個畫面）。
    // 取景跟著版面走（ui.js 量好寫在 input.talkFrame）：對方站在對白條的正上方（u），頭頂留一點空、腳踩在對白條上緣（v），介面不會蓋到他；被牆擋住而必須靠近時改用較廣的視角，仍然看得到上半身，不會只剩一張臉
    const F = input.talkFrame || TALK0, hk = ((T.avatar && T.avatar.look.h) || 100) / 100, ny = Hgt(T.x, T.z), top = ny + (cam.talk && cam.talkH || 2.5 * hk), eye = ny + 1.9 * hk, vT = 0.15, vB = Math.max(vT + 0.4, F.v - 0.012), k = 4.5;
    let dx = me.x - T.x, dz = me.z - T.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const D0 = (top - ny) / ((vB - vT) * 2 * TALK_TAN), py0 = ny + 1.45 * hk, at = s => [T.x + dx * D0 * 0.96 + dz * s * D0 * 0.27, T.z + dz * D0 * 0.96 - dx * s * D0 * 0.27];      // 視角 40 度時全身剛好放進去的距離；s：鏡頭偏向哪一邊
    if (!cam.talk) { cam.talk = true; cam.talkH = clamp(tbox.setFromObject(T.avatar.group).max.y - ny + 0.06, 2.4 * hk, 3.3 * hk); const a = at(1), b = at(-1); cam.talkS = sightClear(T.x, eye, T.z, b[0], py0, b[1]) > sightClear(T.x, eye, T.z, a[0], py0, a[1]) + 0.08 ? -1 : 1; }      // 開口時挑沒被擋住的那一邊（預設在右：對方看著你，在畫面上就是望向左邊的選項）
    let [px, pz] = at(cam.talkS), py = py0, q = 1; const fr = sightClear(T.x, eye, T.z, px, py, pz); if (fr < 0.999) { q = Math.max(0.42, fr - 0.05); px = T.x + (px - T.x) * q; pz = T.z + (pz - T.z) * q; py = eye + (py - eye) * q; }
    const D = D0 * q, th = Math.min(TALK_TAN * 1.52, TALK_TAN / q), fz = Math.hypot(T.x - px, T.z - pz) || 1, fxn = (T.x - px) / fz, fzn = (T.z - pz) / fz, sh = (F.u * 2 - 1) * D * th * W.W / W.H;      // sh：視線往左移多少，對方才會落在畫面的 u
    c.position.set(damp(c.position.x, px, k, dt), damp(c.position.y, py, k, dt), damp(c.position.z, pz, k, dt));
    look.set(damp(look.x, T.x + fzn * sh, k, dt), damp(look.y, top - (1 - 2 * vT) * D * th, k, dt), damp(look.z, T.z - fxn * sh, k, dt)); c.lookAt(look); setFov(Math.atan(th) * 360 / Math.PI, dt); cam.snap = true;
    cam.tf = Math.max(0, (cam.tf ?? 1) - dt * 5); if (cam.tf <= 0.02) me.avatar.group.visible = false; return cam.tf;
  }
  cam.talk = false; cam.tf = Math.min(1, (cam.tf ?? 1) + dt * 4);
  if (C.mode === 'top') {
    const z = input.zoom, L = lockTarget(); setFov(36, cam.snap ? 0 : dt); cam.snap = false;
    cam.lx = damp(cam.lx || 0, L ? clamp((L.x - me.x) * 0.42, -7, 7) : 0, 4, dt); cam.lz = damp(cam.lz || 0, L ? clamp((L.z - me.z) * 0.42, -6, 5) : 0, 4, dt);      // 鎖定：鏡頭往目標偏一點，自己與目標都留在畫面裡
    c.position.set(cam.x + cam.lx + sx, cam.y + 27 * z + sy, cam.z + cam.lz + 21 * z + sz); look.set(cam.x + cam.lx + sx * 0.6, cam.y + 1, cam.z + cam.lz + sz * 0.6); c.lookAt(look); if (ck.roll) c.rotateZ(ck.roll);
    // 滑鼠指向的地面位置
    ndc.set(input.aim.sx / W.W * 2 - 1, -(input.aim.sy / W.H) * 2 + 1); c.updateMatrixWorld(); ray.setFromCamera(ndc, c); plane.constant = -(gy + 1);
    if (ray.ray.intersectPlane(plane, hitP)) { input.aim.x = hitP.x; input.aim.z = hitP.z; }
    return;
  }
  // 背後視角：鏡頭繞著角色轉；沒有鎖定滑鼠時，跑動中會慢慢轉回角色背後
  const L = C.free ? null : lockTarget(), aim = !C.free && aiming(), fish = !C.free && !aim && !!me.fish, hk = me.avatar.look.h / 100, hat = C.free ? 0 : tallHat() > 0 ? 1 : 0, py = cam.y + 1.72 * hk + 1.0 + hat * TPSCAM.tallUp * hk;      // hat：戴高帽子＝1（沒戴或矮的頭盔＝0），鏡頭支點抬高 tallUp      // C.free：測試截圖用，鏡頭不跟鎖定與瞄準；fish：拿著釣竿（0.7）
  // 鏡頭往右肩偏：鎖定時偏一點（目標才不會被自己的頭擋住），拉弓瞄準時偏更多並拉近。偏出去的位置被牆擋住就少偏一點
  // 0.7 釣魚：和拉弓一樣移到右肩、拉近一點，Q 版的大頭才不會擋住竿尖、浮標與上鉤的魚（浮標在水上時視線再往浮標偏一點）
  { const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw), sw = Math.max(aim ? 1.05 : fish ? FISHCAM.side : L ? 0.95 : C.free ? 0 : TPSCAM.side, hat * TPSCAM.tallSide), fr = sw ? sightClear(cam.x, py, cam.z, cam.x + rx * (sw + 0.4), py, cam.z + rz * (sw + 0.4)) : 1;
    cam.side = cam.snap ? 0 : damp(cam.side || 0, sw * (fr >= 0.999 ? 1 : Math.max(0, fr - 0.3)), aim ? 7 : fish ? 5 : 4, dt); cam.aimK = damp(cam.aimK || 0, aim ? 1 : 0, aim ? 7 : 3.5, dt); cam.fishK = damp(cam.fishK || 0, fish ? 1 : 0, fish ? 5 : 3.5, dt); C.side = cam.side; }
  const px = cam.x - Math.cos(C.yaw) * cam.side, pz = cam.z + Math.sin(C.yaw) * cam.side;
  if (L) {      // 鎖定：鏡頭對著目標，俯仰收在看得到雙方的範圍內（滑鼠上下仍可微調）
    const d = Math.hypot(L.x - me.x, L.z - me.z), wp = clamp(0.3 + Math.max(0, 6 - d) * 0.045 - ((L.model ? L.model.root.position.y : gy) - gy) * 0.06, 0.14, 0.62);
    C.yaw = dampAng(C.yaw, Math.atan2(L.x - px, L.z - pz), 8, dt); C.pitch = damp(C.pitch, clamp(C.pitch, wp - 0.12, wp + 0.22), 5, dt);
  }
  else if (!C.locked && me.speed01 > 0.3 && performance.now() - (C.manual || 0) > 1300) { const w = (1 + Math.cos(angDiff(C.yaw, me.f))) / 2; C.yaw = dampAng(C.yaw, me.f, 1.7 * w, dt); }
  const cp = Math.cos(C.pitch), fxv = Math.sin(C.yaw) * cp, fyv = -Math.sin(C.pitch), fzv = Math.cos(C.yaw) * cp, dist = C.dist * (1 - 0.26 * cam.aimK - FISHCAM.pull * cam.fishK);
  const frac = sightClear(px, py, pz, px - fxv * dist, py - fyv * dist, pz - fzv * dist), want = frac >= 0.999 ? dist : Math.max(0.9, dist * frac - 0.35);
  cam.d = cam.snap ? want : want < cam.d ? damp(cam.d, want, 26, dt) : damp(cam.d, want, 3.5, dt);
  // 鏡頭被牆或山壁擋住而貼近角色時：鏡頭抬高一點、越過頭頂往前看，角色同時變成網點透明（2.7 公尺內開始，1.4 公尺內完全不畫），大頭才不會佔滿畫面
  const close = clamp((2.6 - cam.d) / 1.3, 0, 1), lift = close * close * 0.55;
  let cx = px - fxv * cam.d + sx, cy = py - fyv * cam.d + lift + sy, cz = pz - fzv * cam.d + sz; const floor = Math.max(Hgt(cx, cz), waterLevel(cx, cz)) + 0.35; if (cy < floor) cy = floor;      // 鏡頭不鑽進地面，也不沉到水面下
  c.position.set(cx, cy, cz); look.set(px + fxv * 6 + ck.x * 0.5, py + fyv * 6 + lift * 0.4 + ck.y * 0.5, pz + fzv * 6 + ck.z * 0.5);
  { const s = me.fish, on = fish && s && (s.st === 'wait' || s.st === 'bite' || s.st === 'reel') && isFinite(s.bx) && isFinite(s.bz); cam.bobK = damp(cam.bobK || 0, on ? 1 : 0, on ? 2.5 : 4, dt);      // 視線往浮標偏（平滑，不跟著浮標抖）
    if (on) { cam.bx = cam.bx == null ? s.bx : damp(cam.bx, s.bx, 3, dt); cam.bz = cam.bz == null ? s.bz : damp(cam.bz, s.bz, 3, dt); cam.by = waterLevel(s.bx, s.bz); } else if (cam.bobK < 0.01) cam.bx = cam.bz = null;
    if (cam.bobK > 0.001 && cam.bx != null) { const k = FISHCAM.lookBob * cam.bobK; look.x += (cam.bx - look.x) * k; look.y += (cam.by + FISHCAM.lookUp - look.y) * k; look.z += (cam.bz - look.z) * k; } }
  c.lookAt(look); if (ck.roll) c.rotateZ(ck.roll); setFov(55 - 7 * cam.aimK, cam.snap ? 0 : dt); cam.snap = false;
  input.aim.x = me.x + Math.sin(C.yaw) * 8; input.aim.z = me.z + Math.cos(C.yaw) * 8;
  if (cam.d <= 1.4) me.avatar.group.visible = false;
  return lerp(1, clamp((cam.d - 1.4) / 1.3, 0, 1), clamp((dist - cam.d) / 0.6, 0, 1)) * cam.tf;      // 自己把鏡頭拉近（沒被擋）不算
}
// 高帽子：帽子比頭頂高 TPSCAM.tall 公尺以上才算（騎士頭盔、獸骨盔不算）
const tallHat = () => { const h = HAT_UP[me.avatar.look.hat | 0] || 0; return h >= TPSCAM.tall ? h : 0; };
// 高帽子變淡（fix07-hat，2026-11-16 使用者第三次反映「怎樣都透明是不對的」）：帽子預設永遠不透明，只有帽子真的擋住「需要看的東西」才淡成網點 HATF.a。
// 需要看的東西只有：鎖定中的目標｜HATF.r 公尺內、活著、正在對付你的怪（追你、打你、對你威嚇；或你 HATF.mem 秒內打過牠）｜開打中的敵對玩家｜按住瞄準時的準心。
// NPC、一般玩家、閒晃沒理你的怪、營火、採集點、場景物件都不算。「擋住」＝那東西的身體中心或頭頂（大型的再加左右兩點）在帽子的畫面方框（外擴 HATF.pad 像素）裡、而且比帽子離鏡頭遠；準心＝畫面中心在方框裡。
// 淡入 tin 秒；擋住的條件消失後先維持 hold 秒，再用 tout 秒淡回（怪在帽緣進出不會閃）。只動自己的帽子：複製一份自己的材質，網點跟 actors.js 的 setFade 同一段著色器，所以不多編譯、不多繪製；每幀不配置新物件
let hatMesh = null, hatMat = null, hatA = 1, hatHold = 0, hatF = 0, hatNow = 0, meFl = 0, meHurtT = -99, hatMonNear = false, hatMon = null, hatCloser = false, hatNc = 0;
const hatU = { value: 1 }, _hb = new THREE.Box3(), _hv = new THREE.Vector3(), _hr = new THREE.Vector3(), _hc = new THREE.Vector3(), hatBox = [0, 0, 0, 0, 0], hatC = [], hatK = [];      // hatBox：帽子的畫面方框（NDC，已外擴：x0 x1 y0 y1）與帽子中心到鏡頭的距離平方｜hatC／hatK：這一幀的候選與種類（重複使用，不配置）
const hatAct = st => st !== MST.IDLE && st !== MST.DEAD && st !== MST.FLEE;      // 有在動作的狀態（追、蓄力、出招、收招、硬直、威嚇）
function hatPush(o, k) { if (hatNc < 24) { hatC[hatNc] = o; hatK[hatNc] = k; hatNc++; } }
// 世界座標這一點：比帽子（包圍盒中心）離鏡頭遠、在鏡頭前方、落在帽子的畫面方框裡
function hatBehind(x, y, z) { const p = W.camera.position, dx = x - p.x, dy = y - p.y, dz = z - p.z; if (dx * dx + dy * dy + dz * dz <= hatBox[4]) return false; _hv.set(x, y, z).project(W.camera); return _hv.z < 1 && _hv.x > hatBox[0] && _hv.x < hatBox[1] && _hv.y > hatBox[2] && _hv.y < hatBox[3]; }
// 一隻怪：身體中心、頭頂；體型大的（半寬 0.8 公尺以上）再取左右兩點。高度與寬度第一次用到時從模型量一次存起來
function hatMonHit(v) {
  const m = v.model, r = m.root, gy = r.position.y, x = r.position.x, z = r.position.z; if (m.hatH == null) { _hb.setFromObject(r); m.hatH = Math.max(0.6, _hb.max.y - gy); m.hatR = Math.max(_hb.max.x - _hb.min.x, _hb.max.z - _hb.min.z) / 2; }
  const h = m.hatH; if (hatBehind(x, gy + h * 0.5, z) || hatBehind(x, gy + h * 0.92, z)) return true;
  const R = m.hatR * 0.7; return R >= 0.8 && (hatBehind(x + _hr.x * R, gy + h * 0.5, z + _hr.z * R) || hatBehind(x - _hr.x * R, gy + h * 0.5, z - _hr.z * R));
}
const hatManHit = (x, y0, z, h) => hatBehind(x, y0 + h * 0.5, z) || hatBehind(x, y0 + h * 0.95, z);
function hatCloserFn(r) { if (!hatCloser && r.alive && !r.away) { const a = r.x - hatMon.x, b = r.z - hatMon.z, c = me.x - hatMon.x, d = me.z - hatMon.z; if (a * a + b * b < c * c + d * d) hatCloser = true; } }      // 不是主控端時不知道怪在追誰：有別的玩家比自己更靠近牠，就當作牠不是在對付你
// 其他玩家：自己打中他（他閃了一下、同一刻自己進入戰鬥）或自己挨打時他就在旁邊（附近沒有在對付你的怪）→ 記為開打中；城外、不同隊、HATF.r 內、HATF.mem 秒內開打過才算敵對
function hatRemoteFn(r) {
  const fl = r.flash || 0; if (fl > (r.hatFl || 0) + 0.05 && hatNow - me.lastCombat < 0.25) r.hatT = hatNow; r.hatFl = fl;
  if (!r.alive || !r.avatar) return; const dx = r.x - me.x, dz = r.z - me.z, d2 = dx * dx + dz * dz; if (d2 > HATF.r * HATF.r) return;
  if (meHurtT === hatNow && !hatMonNear && d2 < 144) r.hatT = hatNow;
  if (hatNow - (r.hatT ?? -99) < HATF.mem && debug.pvpPair(me, r)) hatPush(r, 3);
}
// 這一幀帽子擋住了什麼：0 沒有｜1 鎖定的目標｜2 對付你的怪｜3 敵對玩家｜4 瞄準時的準心
function hatSee() {
  const c = W.camera, R2 = HATF.r * HATF.r, S = Net.isHost ? debug.sim : null, dmg = debug.myDmg, L = lockTarget(), aim = aiming() && !!(me.charge || me.cast || (me.atk && me.atk.A && me.atk.A.arrow)), f = ++hatF; hatNow = getClock(); hatNc = 0; hatMonNear = false;      /* 22:4x 製作人：瞄準只在拉弓／蓄力／施放／出箭時算（放開後 aimT 還留 1.1 秒，那段不算）。00:4x 修正：上一版把這行後半段寫進了註解，hatNc 不歸零→打中怪後清單塞滿、讀到空項目出錯、遊戲迴圈停住 */
  const mf = me.flash || 0; if (mf > meFl + 0.05) meHurtT = hatNow; meFl = mf;
  if (L) hatPush(L, 1); else if (me.lock && me.lock.lock8) hatPush(me.lock, 1);      // lock8：0.8 對決鎖定的玩家（代理物件只有 x、z）
  for (const v of mons) {
    const dx = v.x - me.x, dz = v.z - me.z; if (dx * dx + dz * dz > R2 || v.st === MST.DEAD || !v.model || v.model.root.visible === false) continue;
    if (v.hatS !== v.spawn) { v.hatS = v.spawn; v.hatKey = mkey(v); v.hatD = 0; v.hatT = -99; }      // 鍵只在重生時算一次
    const d = dmg[v.hatKey] || 0; if (d > v.hatD && v.hatF === f - 1) v.hatT = hatNow; v.hatD = d; v.hatF = f;      // 傷害變多＝自己打中了（剛進 25 公尺的那一幀只對齊、不算）
    let mine = hatNow - v.hatT < HATF.mem;
    if (!mine && hatAct(v.st)) { if (S) mine = !!S[v.id] && S[v.id].target === 'self'; else { hatMon = v; hatCloser = false; remotes.forEach(hatCloserFn); mine = !hatCloser; } }
    if (!mine) continue; if (dx * dx + dz * dz < 64 && hatAct(v.st)) hatMonNear = true; if (v !== L) hatPush(v, 2);
  }
  remotes.forEach(hatRemoteFn);
  if (!hatNc && !aim) return 0;
  c.updateMatrixWorld(); hatMesh.updateWorldMatrix(true, false); const G = hatMesh.geometry, pos = G.attributes.position, mw = hatMesh.matrixWorld; if (!G.boundingBox) G.computeBoundingBox(); _hb.copy(G.boundingBox).applyMatrix4(mw);
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (let i = 0; i < pos.count; i++) { _hv.fromBufferAttribute(pos, i).applyMatrix4(mw).project(c); if (_hv.x < x0) x0 = _hv.x; if (_hv.x > x1) x1 = _hv.x; if (_hv.y < y0) y0 = _hv.y; if (_hv.y > y1) y1 = _hv.y; }      // 用帽子的頂點（巫師帽約 400 個）投影出畫面上的方框，比包圍盒 8 個角投影緊很多（包圍盒會多框到帽子旁邊一大圈）；只在有候選時才算
  const px = 2 * HATF.pad / W.W, py = 2 * HATF.pad / W.H; hatBox[0] = x0 - px; hatBox[1] = x1 + px; hatBox[2] = y0 - py; hatBox[3] = y1 + py; _hb.getCenter(_hc); hatBox[4] = _hc.distanceToSquared(c.position); _hr.setFromMatrixColumn(c.matrixWorld, 0);
  HATF.box = hatBox;
  for (let i = 0; i < hatNc; i++) { const o = hatC[i], k = hatK[i];
    if (o.model ? hatMonHit(o) : o.avatar ? hatManHit(o.avatar.group.position.x, o.avatar.group.position.y, o.avatar.group.position.z, 2 * ((o.avatar.look && o.avatar.look.h) || 100) / 100) : hatManHit(o.x, Hgt(o.x, o.z), o.z, 2)) { hatC.fill(null, 0, hatNc); return k; } }
  hatC.fill(null, 0, hatNc);
  return aim && hatBox[0] < 0 && hatBox[1] > 0 && hatBox[2] < 0 && hatBox[3] > 0 ? 4 : 0;
}
function hatFade(dt, on) {
  const av = me.avatar; if (!av || !av.group) return; const tall = tallHat() > 0;
  if (hatMesh) { let q = hatMesh; while (q && q !== av.group) q = q.parent; if (!q) { hatMesh = null; hatMat = null; } }      // 換了外觀（角色重建）：重新找
  if (!hatMesh && tall) av.group.traverse(o => { if (!hatMesh && o.isMesh && /Hat|Helmet/.test(o.userData.node || '')) hatMesh = o; });
  const see = on && tall && hatMesh && HATF.on && hatMesh.visible ? hatSee() : 0;
  hatHold = see ? HATF.hold : on && tall ? Math.max(0, hatHold - dt) : 0;      // 擋住的條件消失後維持 hold 秒；對話、創角、俯視、沒戴高帽子＝不處理
  const tgt = hatHold > 0 ? HATF.a : 1, k = (1 - HATF.a) * dt; hatA = tgt < hatA ? Math.max(tgt, hatA - k / HATF.tin) : Math.min(tgt, hatA + k / HATF.tout);
  HATF.hit = see > 0; HATF.see = see; HATF.held = hatHold; HATF.cur = hatA;
  if (!hatMesh) return;
  if (hatA < 0.999 && hatMat !== hatMesh.material && hatMesh.material && !Array.isArray(hatMesh.material)) {
    const m = hatMesh.material.clone(); m.onBeforeCompile = sh => { sh.uniforms.uAFade = hatU; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAFade;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uAFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uAFade) discard;'); };
    m.customProgramCacheKey = () => 'afade'; m.needsUpdate = true; hatMesh.material = hatMat = m; }
  if (hatMat) hatU.value = Math.min(hatA > 0.98 ? 1 : hatA, av.fadeU ? av.fadeU.value : 1);
}
function updateCamera(dt) {
  const a = moveCamera(dt); me.avatar.setFade(a == null ? 1 : a); hatFade(dt, input.cam.mode !== 'top' && !input.talk && !input.creator && !cam.creator && !cam.talk);
  // 鏡頭貼到某位 NPC 身上時（例如自己背後剛好站著另一位），那位 NPC 變成網點透明，帽子或頭才不會塞滿畫面一角
  if (input.creator) return; const cp = W.camera.position;
  for (const n of npcs) { const d = Math.hypot(n.x - cp.x, n.z - cp.z), f = n === input.talk ? 1 : clamp((d - 1.2) / 1.6, 0, 1); if (f < 1 || n.fadeOn) { n.avatar.setFade(f); n.fadeOn = f < 1; } }
  // 大型野獸（熊、虎、菁英）擋在鏡頭與自己之間、壓在自己身上、或鏡頭鑽進牠身體時，牠變成網點透明，畫面才不會被牠的身體蓋掉一半
  { const sx = me.x - cp.x, sz = me.z - cp.z, sl2 = sx * sx + sz * sz || 1;
    for (const v of mons) { const m = v.model; if (!m) continue; const R = 0.95 * (v.size || 1); let want = 1;
      if (R >= 1.2 && v.st !== MST.DEAD) { const dx = v.x - cp.x, dz = v.z - cp.z, t = clamp((dx * sx + dz * sz) / sl2, 0, 1), dSeg = Math.hypot(v.x - cp.x - sx * t, v.z - cp.z - sz * t);
        if (Math.hypot(dx, dz) < R + 0.8) want = 0.18; else if (dSeg < R * 0.9 && t > 0.08 && t < 0.97) want = 0.3; else if (Math.hypot(v.x - me.x, v.z - me.z) < R * 0.8) want = 0.38; }
      const cur = m.camFade == null ? 1 : m.camFade; if (want < 1 || cur < 1) m.camFade = Math.abs(want - cur) < 0.01 ? want : damp(cur, want, 10, dt); } }
}

/* ---------- 聲音：聽者位置、場景（環境音與音樂依區域、日夜、是否戰鬥）、腳步 ---------- */
let sceneT = 0;
const surfOf = (o, dt) => { if ((o._gT = (o._gT || 0) - dt) <= 0) { o._gT = 0.15; o._g = groundAt(o.x, o.z); } return o._g; };      // 腳下的材質：每 0.15 秒查一次就夠
function updateAudio(dt, realDt) {
  GA.setListener(me.x, me.z, input.cam.mode === 'tps' ? input.cam.yaw : Math.PI);
  if (!input.started) { return; }                 // 標題與捏角色畫面：維持預設的城內場景
  try { SND08.tick(dt, mons, me, ui.sfx); } catch (e) { }
  if ((sceneT -= realDt) <= 0) {
    sceneT = 0.25;
    // 戰鬥中：6 秒內打過或被打，或 18 公尺內有野獸正在追、正在出招
    let fight = false;
    if (me.alive && !me.inSafe) { fight = getClock() - me.lastCombat < 6; if (!fight) for (const v of mons) if (v.st >= MST.CHASE && v.st <= MST.RECOVER && Math.hypot(v.x - me.x, v.z - me.z) < 18) { fight = true; break; } }
    GA.setZone(baseZone(me.zone), W.night, fight, { water: waterDist(me.x, me.z), rain: W.weatherRain08 || 0, sub: me.zone });      // 0.8：雨量 0..1（weather08 放在 W.weatherRain08）
  }
  if (me.alive && !input.creator) GA.footstep('me', dt * (me.swim ? 0.45 : me.sprinting ? 1.23 : 1), me.speed01, me.swim ? 'swim' : surfOf(me, dt));      // d7-snd-code：游泳送 step/swim，節拍放慢成約每秒 1.2 下（划水比踩地慢）      // 衝刺時跑步動畫快 1.23 倍，腳步跟上
  for (const r of remotes.values()) if (r.alive && Math.hypot(r.x - me.x, r.z - me.z) < 24) GA.footstep(r.peer, dt * (r.swim ? 0.45 : 1), r.speed01, r.swim ? 'swim' : surfOf(r, dt), r.x, r.z);
}

let last = 0, fpsN = 0, fpsT = 0, lowT = 0, sinceStart = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000) || 0.016); last = now;      // 載入很久之後的第一幀，瀏覽器給的時間可能比 last 還早：不能讓時間倒退（否則受擊閃紅、無敵時間會被加成一大段）
  let dt = realDt; if (fx.hitstop > 0) { fx.hitstop -= realDt; dt = realDt * 0.06; } if (typeof window !== 'undefined') window.__rdt = realDt;      /* 11-27 新模型野獸的動作用真實時間（野獸的模擬本來就照真實時間走；命中停頓只慢玩家自己的畫面）：lynxrig 的 OPT.hsR 讀這個 */
  tick(dt, realDt, now, me.x, me.z);
  updateCamera(realDt);
  updateAudio(dt, realDt);
  updateWorld(dt, cam.ready ? cam.x : me.x, cam.ready ? cam.z : me.z);
  updateFx(dt); biteUpdate(dt); updateNumbers(dt); updateUI(realDt);
  render(realDt);
  fpsN++; fpsT += realDt;
  if (fpsT >= 1) {
    perf.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0;
    if (input.started && !document.hidden && !window.__noRender) { sinceStart++; lowT = perf.fps < 26 ? lowT + 1 : 0; if (sinceStart === 6 && softGpu()) ui.toast('偵測到瀏覽器沒有用到顯示卡（硬體加速可能沒開），畫面會很慢。Chrome／Edge：設定 → 系統 → 開啟「使用圖形加速功能」，再重新開啟瀏覽器。');      // 0.5d
    if (lowT >= 4 && sinceStart < 60 && W.quality === 'low' && !W.lowPr) { lowT = 0; W.lowPr = 0.75; resize(); ui.toast('畫面還是不夠順，已把解析度降到 75%。'); }      // 0.5d：低畫質仍不夠順就降解析度
    if (lowT >= 4 && sinceStart < 40 && W.quality !== 'low') { lowT = 0; const q = W.quality === 'high' ? 'medium' : 'low'; applyQuality(q, true); ui.toast(`畫面不夠順，已自動把畫質降為「${q === 'medium' ? '中' : '低'}」。可以在設定裡調回來。`); } }
  }
}
async function boot() {
  initLabels(document.getElementById('labels')); initUI();
  await initWorld(canvas, (p, t) => uiProgress(p * 0.78, t));
  await loadAvatars(p => uiProgress(0.8 + p * 0.12, '喚醒冒險者'));
  if (HERO_ON) await loadHero().catch(e => console.warn('[hero27] 新身體載入失敗，用舊身體', e));      // 11-27 ?hero=20
  initFx(); initGame(); initMaps();
  // 0.6：場景的地點資料（places06.js）、美術的模型與圖示（props06.js、icons06.js）。檔案還沒合併進來時照常開機，用 data06.js 的測試地點與佔位模型
  { const opt = f => import(f).catch(() => null), [pl, pr, ic6, pr7, ic7, ic8] = await Promise.all([opt('./places06.js'), opt('./props06.js'), opt('./icons06.js'), opt('./props07.js'), opt('./icons07.js'), opt('./icons08.js')]); try { setPlaces06(pl); setProps06(pr); if (pr7 && window.__fish07) window.__fish07.setProps07(pr7);      // 0.7：美術的模型交給釣魚；圖示 0.7 的先找、沒有再找 0.6 的
      const s8 = ic8 && ic8.icon08Svg, s7 = ic7 && ic7.icon07Svg, s6 = ic6 && ic6.icon06Svg; if (s8 || s7 || s6) setIcon06((id, n) => (s8 && ic8.has08(id) ? ic8.icon08(id, n) : s7 && ic7.has07(id) ? ic7.icon07(id, n) : ic6 && ic6.icon06 ? ic6.icon06(id, n) : null), id => (s8 && s8(id)) || (s7 && s7(id)) || (s6 ? s6(id) : null)); } catch (e) { console.warn('0.6 外掛資料載入失敗', e); } }
  uiProgress(0.95, '確認身分與存檔');
  await bootNet();
  applyQuality(getQuality(), true);
  uiProgress(1, '完成'); uiReady();
  GA.init(); window.__GA = GA; syncCampFires(GA);      // 音效：全部載完、進入畫面出來之後才開始抓，不等它（載入階段做的事和沒有音效時一樣）；還沒抓完或抓不到就用合成音
  window.__game = { W, me, P, input, Net, Store, mons, remotes, npcs, debug, gainExp, addItem, getClock, ui, perf, cam, project, Hgt, tryMove, blockedAt, tryAttack, tryHeavy, tryDodge, toggleLock, cycleLock, lockTarget, grantBasics, aimAngle, setOf, castSkill, learnOrb, equipSkill, pickGift, allocate, QUESTS, NPCS, PLACES, qStatus, objProg, acceptQuest, turnInQuest, trackQuest, talkTo, npcMark, isNight, interact, Ars, Craft, Needs, Gather, M6, inCombat, room, setEliteSpots, setPlaces06, useItem, buy, sell, setLook, refresh: refreshDerived, slopeAt, waterDepth, monBlocked, SLOPE, waterLevel, groundAt, waterDist };
  last = performance.now(); requestAnimationFrame(frame);
}
boot().catch(e => { console.error(e); uiFatal(e); });
