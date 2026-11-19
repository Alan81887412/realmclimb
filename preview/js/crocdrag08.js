/* 0.8 X3a 鱷魚的純計算（node 可測）：拖行終點、白天曬背／潛伏的判定、危險區判定。不匯入任何檔。 */
export const CROC = {
  drag: { base: 3, elite: 5 },      /* 拖行距離（公尺）：南湖／沼林一般 3、巨鱷 5（計畫 T5 老鱷 5） */
  maxDepth: 0.75,                    /* 拖到的點水深不能超過（＝WATER.mon），不拖進要游泳的深水 */
  chaseLand: 10,                     /* 上岸最多追 10 公尺（從水邊算） */
  bank: 3, warn: 8,                  /* 踩進淺水或岸邊 3 公尺內衝出咬；曬背時 8 公尺內「嘶」一聲滑回水裡 */
  need: { base: 6, elite: 9 }, rollAt: 2.0, belly: 1.2, bellyVuln: 1.3, breakFrac: 0.05, capFrac: 0.35
};
/* 從 p0 朝 home 中心方向拖，每 0.25 公尺檢查水深，超過 maxDepth 就停在前一步。回傳 { x, z, dist, stopped: 'depth'|'max'|null }。depthFn(x,z) → 水深（公尺，岸上為負） */
export function dragEnd(p0, home, maxDist, depthFn, maxDepth = CROC.maxDepth) {
  let ux = home.x - p0.x, uz = home.z - p0.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
  let s = 0, stopped = null; const step = 0.25;
  while (s < maxDist - 1e-9) { const n = Math.min(maxDist, s + step); if (depthFn(p0.x + ux * n, p0.z + uz * n) > maxDepth) { stopped = 'depth'; break; } s = n; }
  if (!stopped && s >= maxDist - 1e-9) stopped = 'max';
  return { x: p0.x + ux * s, z: p0.z + uz * s, dist: s, ux, uz, stopped };
}
/* 離水域邊緣的距離（負的＝在水域圓裡）。home：{ x, z, r } */
export const edgeDist = (p, home) => Math.hypot(p.x - home.x, p.z - home.z) - home.r;
/* 玩家算不算踩進危險區：在水域裡或岸邊 bank 公尺內 */
export const inDanger = (p, home) => edgeDist(p, home) < CROC.bank;
/* 心情（每台用共同的時間與天氣算出同一個結果）：'bask' 曬背（白天、不下雨）｜'sub' 潛伏（夜裡或下雨）。hour 0–24，rain 0–1 */
export const mood = (hour, rain) => (hour >= 5.6 && hour < 19.4 && rain < 0.1 ? 'bask' : 'sub');
/* 上岸追的距離是否超過限制：croc 位置離水邊多遠 */
export const overChase = (p, home) => edgeDist(p, home) > CROC.chaseLand;
/* 傷害上限檢查：衝咬＋咬住拖滿的總傷害不得超過 cap×角色血量。dmgBase＝鱷魚該級攻擊，mults＝各招倍率，dotSec＝咬住秒數，dotK＝每秒傷害佔攻擊的比例 */
export const comboTotal = (dmgBase, mults, dotSec, dotK) => dmgBase * (mults.reduce((a, b) => a + b, 0) + dotSec * dotK);
