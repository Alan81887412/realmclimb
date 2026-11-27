/* 野獸收尾（0.8 補光合併）：每隻野獸建好後呼叫 beastFinish08(m)。
   1. 補光（beastlight08.js：天光去藍、暗部下限、低光補償 1.7 倍、朝下的面帶一點地面色）。
   2. 腳下接觸陰影：一塊柔和的橢圓暗影貼片（子物件掛在 m.root 底下，隨體型縮放、跟著位置與朝向）；
      每 4 幀用地形高度估一次坡面法線把貼片貼著斜坡，遠於 FX08.contact（70 公尺）就隱藏。
   3. 遠處不投影：m.shadowLod(距離, 幀序) 由 game.js 的 updateMonViews 每幀呼叫一次，實際每 4 幀才判斷；
      距離超過 off（58 公尺）關掉這隻所有 mesh 的 castShadow，回到 on（55 公尺）以內再打開（3 公尺遲滯）。 */
import * as THREE from './three.bundle.js';
import { beastLightModel08 } from './beastlight08.js';
import { Hgt } from './world.js';
export const FX08 = { on: 55, off: 58, contact: 70, opacity: 0.5, size: 0.85, wolfGain: 1.6, wolfNight: 1.0 };
let _tex = null, _geo = null;
const tex = () => {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.72)'); g.addColorStop(0.8, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _tex = new THREE.CanvasTexture(c); _tex.colorSpace = THREE.SRGBColorSpace; _geo = new THREE.PlaneGeometry(2, 2); return _tex;
};
const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion();
function contactDecal(m) {
  if (typeof document === 'undefined' || !m.mesh || !m.mesh.geometry) return null;
  const g = m.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; if (!b || !isFinite(b.min.x)) return null;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, rx = Math.max(0.15, (b.max.x - b.min.x) / 2 * FX08.size), rz = Math.max(0.2, (b.max.z - b.min.z) / 2 * FX08.size);
  const mat = new THREE.MeshBasicMaterial({ map: tex(), transparent: true, depthWrite: false, opacity: FX08.opacity, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const d = new THREE.Mesh(_geo, mat); d.scale.set(rx, rz, 1); d.position.set(cx, 0.03 / (m.root.scale.y || 1), cz); d.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  d.castShadow = false; d.receiveShadow = false; d.frustumCulled = false; d.renderOrder = 1; d.name = 'contact08'; m.root.add(d); return d;
}
export function beastFinish08(m) {
  beastLightModel08(m, m.type === 'wolf' ? { key: 'wolf', gain: FX08.wolfGain, night: FX08.wolfNight } : undefined);      /* 狼：拿掉 0.15 自發光後白天略暗，用較大的天光倍數補回（隨場景光量，夜裡不發亮） */
  const ms = []; m.root.traverse(o => { if (o.isMesh && o.castShadow) ms.push(o); });
  const dec = contactDecal(m), base = dec ? dec.material.opacity : 0; m._shOn = true;
  m.shadowLod = (dist, n) => {
    if ((n & 3) !== 0) return;
    const on = m._shOn ? dist < FX08.off : dist < FX08.on;
    if (on !== m._shOn) { m._shOn = on; for (let i = 0; i < ms.length; i++) ms[i].castShadow = on; }
    if (dec) {
      const vis = dist < FX08.contact; if (dec.visible !== vis) dec.visible = vis;
      if (vis) {
        const p = m.root.position, r = 1.0, k = m.root.scale.y || 1;
        _n.set(Hgt(p.x - r, p.z) - Hgt(p.x + r, p.z), 2 * r, Hgt(p.x, p.z - r) - Hgt(p.x, p.z + r)).normalize();
        m.root.getWorldQuaternion(_wq); _n.applyQuaternion(_wq.invert()); _q.setFromUnitVectors(_z, _n); dec.quaternion.copy(_q); dec.position.y = 0.03 / k;
        const mo = m.mats && m.mats[0] ? m.mats[0].opacity : 1; dec.material.opacity = base * (mo == null ? 1 : mo);
      }
    }
  };
  return m;
}
if (typeof window !== 'undefined') window.__fx08 = FX08;
