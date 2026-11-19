/* qa-fix（音效補丁）：0.8 的營火有 15 處，audio-index.json 的環境音點只抄了原本六處。
   做法：音效索引載好之後，把 places06.js 的 CAMPS（已含 0.8 新增的九處）裡還沒有火聲的營火補進 ambience.spots（直接加進索引那一份陣列，audio.js 用的就是它），
   聲音設定照索引裡既有的營火點複製（兩種火聲輪流）。位置從 CAMPS 讀，不寫死。壞掉一律吞掉。註解只用區塊註解。 */
import { CAMPS } from './places06.js';
export const stats = { added: 0, tries: 0 };
export function syncCampFires(GA) {
  let sp = null;
  try { const idx = GA && GA.index && GA.index(); sp = idx && idx.ambience && idx.ambience.spots; } catch (e) { sp = null; }
  if (!Array.isArray(sp)) { if (++stats.tries < 180) setTimeout(() => syncCampFires(GA), 1000); return; }
  const fires = sp.filter(s => s && s.kind === 'fire' && s.at); if (!fires.length) return;
  let k = 0;
  for (const c of CAMPS) {
    if (fires.some(s => Math.hypot(s.at[0] - c.x, s.at[1] - c.z) < 0.5)) continue;
    const t = fires[k++ % fires.length]; sp.push(Object.assign({}, t, { at: [c.x, c.z], name: c.name })); stats.added++;
  }
}
