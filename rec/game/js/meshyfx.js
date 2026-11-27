/* Meshy 模型的材質調整與受擊閃光／倒地淡出（觀感比照 creatures.js 的舊野獸）。
   用法：fixMeshyMaterials(stage) 建好模型後呼叫一次（每隻各自複製材質，閃光與淡出才不會互相影響）；
        每格 setFlash(stage, v.flash 平方前的 0～1, v.ftone)、setFade(stage, 淡出值 1→0)。 */
import * as THREE from './three.bundle.js';

export const FX = { rough: 0.82, sat: 1.25, gain: 1.0, gam: 1.0, gnd: 0.7, nrm: 1.0, tint: [1, 1, 1] };      // tint：三色各乘一個倍率（調色相用，例如猛虎在遊戲燈光下偏黃，要往紅橘拉）      // 另：gam＝中間調提亮（小於 1 變亮，白色不會爆）、gnd＝把地面反光（肚子下面那片土色）壓淡壓灰的程度      // 粗糙度下限、飽和度倍率、亮度倍率（線性空間）、法線強度

const meshes = (root, fn) => root.traverse(o => { if (o.isMesh && o.material) fn(o); });
function shader(sh) {
  const U = this.userData.mfx; sh.uniforms.uFade = U.fade; sh.uniforms.uRim = U.rim; sh.uniforms.uSat = U.sat; sh.uniforms.uGain = U.gain; sh.uniforms.uRMin = U.rmin; sh.uniforms.uGam = U.gam; sh.uniforms.uGnd = U.gnd; sh.uniforms.uTint = U.tint;
  sh.fragmentShader = 'uniform vec3 uRim;\nuniform vec3 uTint;\nuniform float uFade;\nuniform float uSat;\nuniform float uGain;\nuniform float uRMin;\nuniform float uGam;\nuniform float uGnd;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  { float lm = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = pow(max(mix(vec3(lm), diffuseColor.rgb, uSat), 0.0), vec3(uGam)) * uGain * uTint; }')
    .replace('#include <lights_fragment_begin>', HEMI)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = max(roughnessFactor, uRMin);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
const key = () => 'meshyfx3';
/* 半球光的地面色（草地的土綠）打在朝下的面上，白肚子會變成一塊土色。這裡只對 Meshy 模型把那一份光壓灰、壓暗。 */
const HEMI = THREE.ShaderChunk.lights_fragment_begin.replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
  '{ vec3 hI = getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ); float dn = clamp( 0.5 - 0.5 * dot( geometryNormal, hemisphereLights[ i ].direction ), 0.0, 1.0 ); float hl = dot( hI, vec3( 0.2126, 0.7152, 0.0722 ) ); irradiance += mix( hI, vec3( hl ) * 0.75, uGnd * dn ); }');

export function fixMeshyMaterials(root, o = {}) {
  const P = Object.assign({}, FX, o);
  meshes(root, mesh => {
    let m = mesh.material; if (Array.isArray(m)) m = m[0];
    if (!m.userData.mfx) { m = m.clone(); mesh.material = m; }      // 每個網格自己一份（共用同一份的話閃光會一起亮）
    m.metalness = 0; m.metalnessMap = null;      // 實測 metallicRoughness 貼圖 B 通道≈0，金屬度其實是 0；拿掉免得 metalness=1 的乘數留下去
    m.roughness = 1; if (m.normalScale) m.normalScale.set(P.nrm, -P.nrm);
    const U = m.userData.mfx;
    if (U) { U.sat.value = P.sat; U.gain.value = P.gain; U.rmin.value = P.rough; U.gam.value = P.gam; U.gnd.value = P.gnd; U.tint.value.set(P.tint[0], P.tint[1], P.tint[2]); return; }      // 已經處理過：只更新參數
    m.userData.mfx = { fade: { value: 1 }, rim: { value: new THREE.Color(0, 0, 0) }, sat: { value: P.sat }, gain: { value: P.gain }, rmin: { value: P.rough }, gam: { value: P.gam }, gnd: { value: P.gnd }, tint: { value: new THREE.Vector3(P.tint[0], P.tint[1], P.tint[2]) } };
    m.onBeforeCompile = shader; m.customProgramCacheKey = key; m.needsUpdate = true;
    if (m.map) m.map.anisotropy = Math.max(m.map.anisotropy, 4);
  });
}
// 受擊閃光：和 creatures.js 一模一樣的算法（f2=k²；整身 emissive＝f2×0.75×色，輪廓光＝f2×0.8×色；tone 1 霸體鋼藍、2 暴擊金）
export function setFlash(root, k, tone = 0) {
  const f2 = k * k, tn = tone | 0, c = tn === 1 ? [0.5, 0.66, 0.95] : tn === 2 ? [1.0, 0.72, 0.3] : [0.95, 0.86, 0.74], gold = tn === 2, kb = gold ? f2 * f2 * 0.22 : f2 * 0.75, kr = f2 * (gold ? 1.8 : 0.8);
  meshes(root, mesh => { const m = mesh.material, U = m.userData.mfx; if (!U) return; m.emissive.setRGB(kb * c[0], kb * c[1], kb * c[2]); U.rim.value.setRGB(kr * c[0], kr * c[1], kr * c[2]); });
}
// 倒地淡出：和舊野獸一樣是螢幕網點（dither）鏤空，不開 transparent、不必排序；a=1 完整，a→0 消失（<0.01 時整個 visible=false）
export function setFade(root, a) {
  a = Math.max(0, Math.min(1, a));
  meshes(root, mesh => { const U = mesh.material.userData.mfx; if (U) U.fade.value = a; });
  root.visible = a > 0.01;
}
