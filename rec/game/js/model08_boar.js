/* 野豬新模型（圖生 3D：TRELLIS.2 形體＋參考圖投影貼圖）。載入 assets/model/boar.json／.bin／.png。
   載好之前、或任何一步失敗：getBoar08() 回傳 null，遊戲照舊用程式拼的野豬。 */
import * as THREE from './three.bundle.js';
const data = {}, failed = {};
const base = 'assets/model/';
export const TIGER14 = typeof location !== 'undefined' && /[?&]tiger=14(&|$)/.test(location.search);      /* 預覽版切換：網址帶 ?tiger=14 才用 tiger14 新老虎（assets/model/tiger14.*），預設仍是舊老虎 */
export const TIGER15 = typeof location !== 'undefined' && /[?&]tiger=15(&|$)/.test(location.search);      /* 預覽版切換：網址帶 ?tiger=15 才用 tiger15（assets/model/tiger15.*：加粗軀幹四肢、頭加高加厚、耳放大、條紋加粗）；體長已與舊老虎相同，不另設 VISK */
export const TIGER19 = typeof location !== 'undefined' && /[?&]tiger=19(&|$)/.test(location.search);      /* 測試版：?tiger=19＝夜鉤猞 Meshy 版，舊的圓柱規則權重（對照組） */
export const TIGER18 = typeof location !== 'undefined' && /[?&]tiger=18(&|$)/.test(location.search);      /* 測試版：?tiger=18＝夜鉤猞（L7，暫借老虎骨架與動作） */
export const TIGER17 = typeof location !== 'undefined' && /[?&]tiger=17(&|$)/.test(location.search);      /* 測試版：?tiger=17＝11-22 TRELLIS.2 新猛虎（原樣減面＋貼圖＋自動綁骨，未修飾） */
export const TIGER16 = typeof location !== 'undefined' && /[?&]tiger=16(&|$)/.test(location.search);      /* 預覽版切換：網址帶 ?tiger=16 才用 tiger16（assets/model/tiger16.*：耳朵放大變圓、臉部配色、頰毛外蓬、腿加長＝腿關節與上半身關節上移 0.1）；體長同舊老虎，不另設 VISK */
async function load(name) {
  const file = name === 'tiger' && TIGER19 ? 'tiger19' : name === 'tiger' && TIGER18 ? 'tiger18' : name === 'tiger' && TIGER17 ? 'tiger17' : name === 'tiger' && TIGER16 ? 'tiger16' : name === 'tiger' && TIGER15 ? 'tiger15' : name === 'tiger' && TIGER14 ? 'tiger14' : name;
  try {
    const [mr, br] = await Promise.all([fetch(base + file + '.json'), fetch(base + file + '.bin')]);
    if (!mr.ok || !br.ok) throw new Error('抓不到模型檔');
    const meta = await mr.json(), buf = await br.arrayBuffer(), n = meta.verts;
    const seg = (k, T, len) => { const s = meta[k]; if (!s || s.offset + s.bytes > buf.byteLength) throw new Error('模型檔缺 ' + k); return new T(buf, s.offset, len); };
    const pos = seg('pos', Float32Array, n * 3), nr = seg('nrm', Int8Array, n * 4), uv = seg('uv', Float32Array, n * 2), s8 = seg('skin4', Uint8Array, n * 8), idx = seg('idx', Uint16Array, meta.tris * 3);
    const nor = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(nr[i * 4], nr[i * 4 + 1], nr[i * 4 + 2]) || 1; for (let k = 0; k < 3; k++) nor[i * 3 + k] = nr[i * 4 + k] / l;
      let t = 0; for (let k = 0; k < 4; k++) t += s8[i * 8 + 4 + k];
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = s8[i * 8 + k]; sw[i * 4 + k] = t ? s8[i * 8 + 4 + k] / t : (k ? 0 : 1); }
    }
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('座標有 NaN');
    for (let i = 0; i < idx.length; i++) if (idx[i] >= n) throw new Error('索引超界');
    const tex = await new THREE.TextureLoader().loadAsync(base + (meta.tex || file + '.png'));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(), 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.slice(), 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    geo.setIndex(new THREE.Uint16BufferAttribute(idx.slice(), 1)); geo.computeBoundingSphere();
    data[name] = { meta, geo, tex, joints: meta.joints, bones: meta.bones };
  } catch (e) { failed[name] = true; console.warn('[boar08] ' + name + ' 新模型載入失敗，沿用舊模型：', e && e.message); }
}
/* 製作人 11-18：改成通用。MODELS08 列出已經有新模型檔的名字（物種名，菁英加 E）；只載列出來的，沒列的物種照舊用程式拼的模型。
   VISK08：外觀放大倍率（只放大外觀，判定大小不變），沒列的是 1。 */
export const MODELS08 = ['boar', 'boarE', 'bisonE', 'tiger', 'bear', 'wolf', 'bison', 'porc', 'deer', 'monkey', 'ibex', 'python', 'ape', 'apeY', 'bearE', 'wolfE', 'croc', 'pythonE'];      /* 11-19 08:39 使用者通過沼蟒、猩猩、小猩猩、老疤、霜背與動作（岩羊 11-19 01:36 已通過）；08:55 通過鱷魚、金紋蟒 */      /* apeY＝小猩猩（ape 的幼體 young）新模型；getModel08(type, elite, young) 的第三個參數取它 */
export const VISK08 = Object.assign(TIGER14 ? { tiger: 1.205 / 1.183 } : {}, { boarE: 1.5 / 1.38, bearE: 1.15, wolfE: 1.15 * 1.6625 / 1.954 });      /* bearE：老疤（菁英熊）外觀放大 1.15 倍，只放大外觀、判定大小不變 */
for (const m of MODELS08) load(m);
export const getModel08 = (type, elite, young) => data[type + (young ? 'Y' : elite ? 'E' : '')] || null;
export const getBoar08 = (elite) => data[elite ? 'boarE' : 'boar'] || null;
export const boar08Failed = (elite) => !!failed[elite ? 'boarE' : 'boar'];
if (typeof window !== 'undefined') window.__boar08 = { get: (e) => getBoar08(e), failed: (e) => boar08Failed(e), ready: () => MODELS08.every(m => data[m] || failed[m]), model: (t, e) => getModel08(t, e), list: MODELS08 };
