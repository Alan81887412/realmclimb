// 0.8 雨與雷的畫面（d8-art-rain）。什麼時候下雨由玩法的 weather08.js 決定，這個檔只管「看起來」：
//   setRain08(k, now)   雨的濃度 0–1（0＝晴）。預設慢慢變過去（約 25 秒從晴到大雨），now＝true 時立刻到位（測試、剛進遊戲時用）
//   thunder08(opt)      打一次雷：遠處天空一側閃兩三下、地面被照亮。回傳 { delay, az }：delay＝建議幾秒後播雷聲（1.5–5 秒），az＝閃光方位（弧度，世界座標，atan2(x, z)）
//   rain08State()       { k 現在的濃度, target 目標濃度, wet 地面濕度, glint 捕獸夾鐵光還剩多少 0–1 }
//   glintR08(r)         給 traps07 用：把 props07.setMe07 的半徑換成雨天的半徑（雨大到看不到鐵光時回傳 0.01＝所有夾子的鐵光都不亮；不能回傳 0，0 在 props07 是「不限距離」）
// 畫質：高＝雨絲 5200 條、中＝2600 條，兩者都有地面變深與積水反光、水面雨點；低＝只有天色變暗與霧（定案第 5 節）。
// 繪製次數：雨絲是一個網格（+1 次），水面雨點畫在原本的水面著色器裡（+0）。天色、霧、地面都是改既有的 uniform（+0）。
import * as THREE from './three.bundle.js';
import { W, SKY08, setRainWater08 } from './world.js';

const N_MAX = 5200, COUNT = { high: 5200, medium: 2600, low: 0 }, RAMP_IN = 25, RAMP_OUT = 35, BOX = new THREE.Vector3(46, 30, 46);
const S = { k: 0, target: 0, wet: 0, applied: -1, t: 0, mesh: null, U: null, flashT: -1, flashAmp: 1, hold: -1, ready: false };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v, smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function setRain08(k, now = false) { S.target = clamp01(+k || 0); if (now) { S.k = S.target; S.wet = S.target; } }
export function rain08State() { return { k: S.k, target: S.target, wet: S.wet, glint: 1 - smooth(0.2, 0.4, S.k) }; }
export function glintR08(r) { return S.k >= 0.3 ? 0.01 : r; }
export function thunder08(opt = {}) {
  const cam = W.camera, f = new THREE.Vector3(0, 0, -1); if (cam) f.applyQuaternion(cam.quaternion);
  const az = opt.az != null ? opt.az : Math.atan2(f.x, f.z) + (Math.random() - 0.5) * 2.1;      // 大致在鏡頭前方 ±60° 的遠處，玩家才看得到
  SKY08.dir.set(Math.sin(az), 0.16, Math.cos(az)).normalize();
  S.flashT = 0; S.flashAmp = opt.amp != null ? opt.amp : 0.75 + Math.random() * 0.25;
  S.hold = opt.hold != null ? opt.hold : -1;      // 測試用：hold＝把閃光固定在這個亮度（截圖用），下一次 thunder08 才放開
  return { delay: opt.delay != null ? opt.delay : 1.5 + Math.random() * 3.5, az };
}
// 閃光的樣子：猛亮一下、暗、再亮一下（較弱）、偶爾第三下，共約 0.6 秒
function flashAt(t) { const p = (t0, a, d) => t < t0 ? 0 : a * (t < t0 + 0.04 ? (t - t0) / 0.04 : Math.exp(-(t - t0 - 0.04) / d)); return Math.min(1, Math.max(p(0, 1, 0.06), p(0.17, 0.7, 0.08), p(0.36, 0.32, 0.1))); }

const VS = `attribute vec4 aS; attribute vec2 aC; uniform float uT; uniform vec3 uCen; uniform vec3 uBox; uniform vec3 uVel; uniform float uLen; varying float vA; varying float vAl; varying float vSide; varying float vFogD;
void main() {
  float sp = 0.82 + 0.36 * aS.w; vec3 lo = uCen - 0.5 * uBox;
  vec3 p = mod(aS.xyz * uBox + uVel * sp * uT - lo, uBox) + lo;
  vec3 dir = normalize(uVel); float L = uLen * (0.7 + 0.6 * fract(aS.w * 13.7));
  vec3 q = p - dir * L * aC.y; vec3 toC = cameraPosition - q; float dist = length(toC);
  float w = max(0.011, dist * 0.0011); q += normalize(cross(dir, toC)) * w * aC.x;
  vec3 rel = abs(p - uCen) / (0.5 * uBox);
  vA = (1.0 - smoothstep(0.7, 1.0, max(rel.x, rel.z))) * (1.0 - smoothstep(0.75, 1.0, rel.y)) * smoothstep(2.0, 5.5, dist) * clamp(0.011 / (dist * 0.0011), 0.35, 1.0);
  vAl = aC.y; vSide = aC.x;
  vec4 mv = viewMatrix * vec4(q, 1.0); vFogD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const FS = `uniform vec3 uCol; uniform float uA; uniform vec3 fogColor; uniform float fogDensity; varying float vA; varying float vAl; varying float vSide; varying float vFogD;
void main() {
  float a = vA * uA * (1.0 - vAl) * (1.0 - vAl * 0.4) * (1.0 - 0.45 * vSide * vSide) * exp(-fogDensity * fogDensity * vFogD * vFogD * 0.55);
  gl_FragColor = vec4(uCol * (1.0 + 0.5 * (1.0 - vAl)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function initRain08() {
  if (S.ready || !W.scene) return; S.ready = true;
  const pos = new Float32Array(N_MAX * 12), cor = new Float32Array(N_MAX * 8), seed = new Float32Array(N_MAX * 16), idx = new Uint32Array(N_MAX * 6);
  let r = 20261116; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N_MAX; i++) {
    const s = [rnd(), rnd(), rnd(), rnd()], c = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (let j = 0; j < 4; j++) { cor.set(c[j], (i * 4 + j) * 2); seed.set(s, (i * 4 + j) * 4); }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.BufferAttribute(cor, 2)); g.setAttribute('aS', new THREE.BufferAttribute(seed, 4)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);      // position 全是 0（面積 0）：高畫質的 GTAO 用自己的材質再畫一次場景時，雨絲畫不出任何東西
  const U = S.U = { uT: { value: 0 }, uCen: { value: new THREE.Vector3() }, uBox: { value: BOX }, uVel: { value: new THREE.Vector3(1.3, -11.5, 0.7) }, uLen: { value: 0.8 }, uCol: { value: new THREE.Color() }, uA: { value: 0 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.005 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide });
  const m = S.mesh = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; m.visible = false; m.name = 'rain08'; m.matrixAutoUpdate = false; W.scene.add(m); W.noAO08 = m;
  if (typeof window !== 'undefined') window.__rain08 = { set: setRain08, thunder: thunder08, state: rain08State, glintR: glintR08 };      // 測試用（只影響自己的畫面）
}

const _f = new THREE.Vector3();
export function tickRain08(dt, fx, fz) {
  if (!S.ready) return;
  const d = S.target - S.k; if (d) S.k = clamp01(S.k + Math.sign(d) * Math.min(Math.abs(d), dt / (d > 0 ? RAMP_IN : RAMP_OUT)));
  const dw = S.k - S.wet; if (dw) S.wet = clamp01(S.wet + Math.sign(dw) * Math.min(Math.abs(dw), dt / (dw > 0 ? 40 : 90)));      // 地面比雨慢濕、更慢乾
  SKY08.k = S.k; if (Math.abs(S.k - S.applied) > 0.004 || (S.k === 0 && S.applied !== 0)) { S.applied = S.k; SKY08.dirty = true; }
  let fl = 0; if (S.flashT >= 0) { S.flashT += dt; fl = flashAt(S.flashT) * S.flashAmp; if (S.flashT > 0.8) { S.flashT = -1; fl = 0; } } if (S.hold >= 0) fl = S.hold; SKY08.flash = fl;
  const q = W.quality, low = q === 'low', n = Math.round((COUNT[q] ?? COUNT.high) * smooth(0.02, 0.6, S.k));
  SKY08.wet.value = low ? 0 : S.wet; setRainWater08(low ? 0 : smooth(0.05, 0.7, S.k));
  const m = S.mesh; m.visible = n > 0; if (!m.visible) return;
  m.geometry.setDrawRange(0, n * 6);
  const cam = W.camera, U = S.U; S.t = (S.t + dt) % 600; U.uT.value = S.t;
  _f.set(0, 0, -1).applyQuaternion(cam.quaternion); _f.y = 0; if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1); _f.normalize();
  U.uCen.value.set(cam.position.x + _f.x * 13, cam.position.y - 6, cam.position.z + _f.z * 13);      // 雨絲的盒子在鏡頭前方、略低（角色周圍最密）
  const nt = W.night || 0, b = (0.72 - 0.47 * nt) + fl * 0.7;      // 白天淡淡發亮的銀白，夜裡暗一點偏藍；打雷時一起亮
  U.uCol.value.setRGB(0.8 * b, (0.86 + 0.02 * nt) * b, (0.94 + 0.1 * nt) * b);
  U.uA.value = (0.34 - 0.08 * nt) * (0.55 + 0.45 * smooth(0.1, 0.9, S.k));
}
