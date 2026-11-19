/* 野獸補光（只影響套了這個函式的材質；不改全域燈光、不改地形與角色）。
   問題：野獸在遊戲光線下「背光處過暗、偏藍」。原因與數字見 team/tech-model08/補光說明.md。
   做法（都在片段著色器的 lights_fragment_end 之後、只改這個材質的漫反射）：
     1. 天光去藍：半球光（天空藍）照在野獸上的那一份，色相往中性偏暖拉 neutral（夜裡月光本來就是藍的，自動少拉）、再乘 gain。
     3. 低光補償：場景的光弱（黃昏、雨天、夜晚）時野獸整體多亮一點（最多 lowMax 倍；正午不變），讓深色的野獸不被色調映射壓成一團黑。
     2. 暗部下限：任何一點的亮度不低於「向陽面大約的亮度 × floor」；下限跟著場景的光走（夜裡、雨天自動變暗，不會發亮），
        並保留一點立體感（朝上、朝鏡頭的面稍亮），不是整片填平。原本就比下限亮的地方完全不動。
   用法：beastLight08(材質)。材質原本的 onBeforeCompile（softShader、臉的 faceShader…）照樣會跑，這個接在後面。
   全部野獸共用一組參數（beastLightTune08 即時調）；個別材質要不同的值就給 o.own = true。 */
import * as THREE from './three.bundle.js';

export const BL08_DEFAULT = { neutral: 0.6, gain: 1.12, floor: 0.42, form: 0.45, tint: [1.0, 0.95, 0.88], lowTarget: 3.6, lowPow: 0.45, lowMax: 1.7, bounce: 0.5, rim: 0.35, night: 1.15, ground: [0.36, 0.38, 0.17] };      /* bounce：地面反光（朝下的面往地面色拉的程度＋一點點加光；0＝關）、ground：地面色（線性，草綠偏土） */
const mkU = o => ({ k: { value: new THREE.Vector4(o.neutral, o.gain, o.floor, o.form) }, t: { value: new THREE.Color().setRGB(o.tint[0], o.tint[1], o.tint[2]) }, b: { value: new THREE.Vector4(o.lowTarget, o.lowPow, o.lowMax, o.bounce) }, g: { value: new THREE.Color().setRGB(o.ground[0], o.ground[1], o.ground[2]) }, r: { value: new THREE.Vector4(o.rim, o.night, 0, 0) } });
const SHARED = mkU(BL08_DEFAULT), KEYED = {};      /* KEYED：o.key 相同的材質共用一組自己的參數（例如狼要多補一點） */
const GLSL = `
  {
    vec3 blAlb = diffuseColor.rgb * RECIPROCAL_PI;
    vec3 blKey = vec3( 0.0 );
    #if NUM_DIR_LIGHTS > 0
      for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) { if ( dot( directionalLights[ i ].color, vec3( 1.0 ) ) > dot( blKey, vec3( 1.0 ) ) ) blKey = directionalLights[ i ].color; }
    #endif
    const vec3 blW = vec3( 0.2126, 0.7152, 0.0722 );
    float blWarm = clamp( ( blKey.r / max( blKey.b, 1e-3 ) - 0.6 ) / 0.5, 0.0, 1.0 );      /* 主光偏藍（月光）時少去藍，夜色才對 */
    float blN = uBL08.x;      /* 夜裡不再少去藍：月光下的天光放大後會變成飽和藍，反而像在發光 */
    vec3 blTint = mix( vec3( 0.9, 0.95, 1.0 ), uBL08t, blWarm );      /* 夜裡往冷灰（不帶色偏），白天往暖 */
    vec3 blIrr = mix( irradiance, dot( irradiance, blW ) * blTint / dot( blTint, blW ), blN ) * mix( 1.0, uBL08.y, blWarm );
    vec3 blInd = blAlb * blIrr;
    vec3 blUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float blShape = 1.0 - uBL08.w + uBL08.w * ( 0.6 * ( 0.5 + 0.5 * dot( geometryNormal, blUp ) ) + 0.4 * clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 ) );
    vec3 blRef = mix( blKey, dot( blKey, blW ) * blTint / dot( blTint, blW ), 0.5 * blN ) + blIrr;      /* 向陽面大約收到的光 */
    float blDn = clamp( 0.35 - 0.65 * dot( geometryNormal, blUp ), 0.0, 1.0 );      /* 朝下 1、側面 0.35、朝上 0：地面反光 */
    float blRL = dot( blRef, blW );
    vec3 blGr = uBL08g / dot( uBL08g, blW );
    blInd += blAlb * blGr * blRL * ( 0.08 * uBL08b.w * blDn );
    vec3 blFloor = blAlb * mix( blRef, blRL * blGr, uBL08b.w * blDn ) * ( uBL08.z * blShape );
    vec3 blTot = reflectedLight.directDiffuse + blInd;
    float blNow = dot( blTot, blW ), blMin = dot( blFloor, blW );
    float blT = clamp( ( blMin - blNow ) / max( blMin, 1e-5 ), 0.0, 1.0 );      /* 0＝本來就夠亮；1＝全黑 */
    float blG = mix( uBL08r.y, clamp( pow( uBL08b.x / max( dot( blRef, blW ), 1e-3 ), uBL08b.y ), 1.0, uBL08b.z ), blWarm );      /* 夜裡（主光是月光）不補償：夜晚維持暗，只留輪廓 */      /* 3. 低光補償：場景的光越弱（黃昏、雨、夜），野獸整體多亮一點，最多 lowMax 倍；正午＝1 倍 */
    reflectedLight.directDiffuse *= blG;
    vec3 blSky = vec3( 0.0 );
    #if NUM_HEMI_LIGHTS > 0
      blSky = hemisphereLights[ 0 ].skyColor;
    #endif
    vec3 blRimC = mix( blSky, dot( blSky, blW ) * blTint / dot( blTint, blW ), 0.6 );      /* 邊緣光：天光色、去藍 */
    float blFr = pow( 1.0 - clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 ), 2.5 );
    float blDark = clamp( 1.0 - blNow / max( blMin * 2.2, 1e-5 ), 0.0, 1.0 );      /* 只在暗面起作用 */
    vec3 blRim = blRimC * ( blFr * blDark * uBL08r.x * sqrt( dot( diffuseColor.rgb, blW ) + 0.04 ) );
    reflectedLight.indirectDiffuse = ( blInd + blFloor * blT + blRim ) * blG;
  }
`;
export function beastLight08(mat, o = {}) {
  if (!mat || mat.userData.bl08) return mat;
  const U = o.own ? mkU(Object.assign({}, BL08_DEFAULT, o)) : o.key ? (KEYED[o.key] || (KEYED[o.key] = mkU(Object.assign({}, BL08_DEFAULT, o)))) : SHARED, prev = mat.onBeforeCompile, hasKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey'), prevKey = mat.customProgramCacheKey;
  const baseKey = hasKey ? () => prevKey.call(mat) : () => (prev ? prev.toString() : '');
  mat.userData.bl08 = U;
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uBL08 = U.k; sh.uniforms.uBL08t = U.t; sh.uniforms.uBL08b = U.b; sh.uniforms.uBL08g = U.g; sh.uniforms.uBL08r = U.r;
    if (sh.fragmentShader.indexOf('#include <lights_fragment_end>') < 0) return;      /* 不是有光照的材質：不動 */
    sh.fragmentShader = 'uniform vec4 uBL08;\nuniform vec3 uBL08t;\nuniform vec4 uBL08b;\nuniform vec3 uBL08g;\nuniform vec4 uBL08r;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + GLSL);
  };
  mat.customProgramCacheKey = () => baseKey() + '+bl08';
  mat.needsUpdate = true; return mat;
}
/* 即時調整（全部共用參數的野獸一起變）：beastLightTune08({ floor: 0.34 })；給 mat 就只調那個（要是 own 的） */
export function beastLightTune08(o = {}, mat) {
  const U = mat && mat.userData.bl08 || SHARED, k = U.k.value;
  if (o.neutral != null) k.x = o.neutral; if (o.gain != null) k.y = o.gain; if (o.floor != null) k.z = o.floor; if (o.form != null) k.w = o.form; if (o.tint) U.t.value.setRGB(o.tint[0], o.tint[1], o.tint[2]); if (o.lowTarget != null) U.b.value.x = o.lowTarget; if (o.lowPow != null) U.b.value.y = o.lowPow; if (o.lowMax != null) U.b.value.z = o.lowMax; if (o.bounce != null) U.b.value.w = o.bounce; if (o.rim != null) U.r.value.x = o.rim; if (o.night != null) U.r.value.y = o.night; if (o.ground) U.g.value.setRGB(o.ground[0], o.ground[1], o.ground[2]);
  return { neutral: k.x, gain: k.y, floor: k.z, form: k.w, tint: U.t.value.toArray(), lowTarget: U.b.value.x, lowPow: U.b.value.y, lowMax: U.b.value.z };
}
/* 一整隻套用（身體材質＋臉面材質）。m＝makeCreature／makeBeast07／makeBeast08 回傳的物件 */
export function beastLightModel08(m, o) { for (const mt of m.mats || []) beastLight08(mt, o); if (m.face && m.face.material) beastLight08(m.face.material, o); return m; }

/* ---------- 黏土模型的標準材質（頂點色；和 creatures.js／beasts07.js／beasts08.js 三份一樣的 softShader，合併後可以只留這一份） ---------- */
export function softShader08(sh) {
  const U = this.userData; sh.uniforms.uGlow = U.glow; sh.uniforms.uDim = U.dim; sh.uniforms.uFade = U.fade; sh.uniforms.uRim = U.rim;
  sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
  sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uRim;\nuniform float uDim;\nuniform float uFade;\nvarying float vGlow;\n' + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.995 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 1.0 - vGlow * uDim;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * vGlow;\n  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); float rim2 = rimF * rimF; totalEmissiveRadiance += uRim * (rim2 * rim2); }');
}
/* o：{ map（有貼圖的舊模型才給）, roughness, light（預設 true：套補光）, shader（預設 softShader08）, key } */
export function softMaterial08(o = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: o.map || null, vertexColors: !o.map, roughness: o.roughness ?? 0.8, metalness: 0 });
  mat.userData.glow = { value: new THREE.Color(0, 0, 0) }; mat.userData.dim = { value: 0 }; mat.userData.fade = { value: 1 }; mat.userData.rim = { value: new THREE.Color(0, 0, 0) };
  mat.onBeforeCompile = o.shader || softShader08; mat.customProgramCacheKey = () => o.key || 'soft08';
  if (o.light !== false) beastLight08(mat, o);
  return mat;
}
if (typeof window !== 'undefined') window.__bl08 = { apply: beastLight08, model: beastLightModel08, tune: beastLightTune08 };
