/* 0.8 X3a 猴群偷竊的「託管」邏輯（純邏輯，不匯入任何檔，node 可直接測）。
   原則：物品只在「背包 inv」與「託管欄 held」之間搬，每一步都是同步的一次搬動（先減一邊、再加另一邊），所以不會遺失、也不會複製。
   存檔：save() 同時和 P.inv 一起進 snapshot；讀檔 load() 把上次留下的託管欄原樣搬回背包（放不下的留在託管、可領回）。 */
export const STEAL_OK = ['potion', 'meat', 'herb_bleed', 'berry', 'wheat', 'cress', 'mushroom', 'moss', 'mint', 'honey', 'egg', 'food_skewer', 'food_jerky', 'drink_mint'];      /* 白名單：一般消耗品與採集素材；裝備、任務物品、金幣、稀有素材（熊膽、蔘…）、菁英戰利品、地圖都不在裡面 */
export const THEFT = { holdSec: 300, maxHeld: 3, cooldown: 40, grace: 4 };      /* 託管最久 300 秒；同時最多被 3 隻猴拿著；同一個人兩次被偷至少隔 40 秒；剛偷到後 4 秒內等主控端把猴子切成抱東西的狀態 */
export function makeLedger(invArg, room, hooks = {}) {
  const I = () => (typeof invArg === 'function' ? invArg() : invArg);      /* inv 可以給函式：遊戲讀檔會換掉 P.inv 這個物件，每次都重新取 */
  const L = { entries: [], seq: 0, lastTheft: -1e9 };
  const ok = it => STEAL_OK.includes(it);
  /* 隨機挑一樣背包裡有的可偷物（每種等機率）；沒有就回 null */
  L.pick = (rnd = Math.random) => { const c = STEAL_OK.filter(k => (I()[k] | 0) > 0); return c.length ? c[Math.floor(rnd() * c.length)] : null; };
  L.canSteal = now => L.entries.filter(e => e.mid != null).length < THEFT.maxHeld && now - L.lastTheft >= THEFT.cooldown;
  /* 被猴子 mid（重生編號 sp）偷：背包扣 1、託管欄加 1。回傳託管項，不能偷回 null */
  L.steal = (mid, sp, now, rnd) => {
    if (!L.canSteal(now) || L.entries.some(e => e.mid === mid && e.sp === sp)) return null;
    const it = L.pick(rnd); if (!it || !ok(it)) return null;
    const inv = I(); inv[it] -= 1; if (inv[it] <= 0) delete inv[it];
    const e = { eid: ++L.seq, mid, sp, item: it, n: 1, t0: now }; L.entries.push(e); L.lastTheft = now; hooks.change && hooks.change('steal', e); return e;
  };
  /* 歸還一項：能放進背包的放進去；放不下的留在託管（mid 清掉，不再跟任何猴子連動，等領回） */
  const giveBack = (e, why) => {
    const k = Math.min(e.n, room(e.item)); if (k > 0) { const inv = I(); inv[e.item] = (inv[e.item] || 0) + k; e.n -= k; }
    if (e.n <= 0) { L.entries.splice(L.entries.indexOf(e), 1); hooks.change && hooks.change('return', e, why); return k; }
    e.mid = null; e.pending = true; hooks.change && hooks.change('pending', e, why); return k;
  };
  /* 條件歸還：pred(e) 為真的全部還；回傳實際放回背包的總份數 */
  L.returnWhere = (pred, why) => { let t = 0; for (const e of L.entries.slice()) if (e.mid != null && pred(e)) t += giveBack(e, why); return t; };
  L.returnAll = why => { let t = 0; for (const e of L.entries.slice()) t += giveBack(e, why); return t; };
  L.claim = () => { let t = 0; for (const e of L.entries.slice()) if (e.pending) t += giveBack(e, 'claim'); return t; };
  L.expire = now => L.returnWhere(e => now - e.t0 >= THEFT.holdSec, 'timeout');
  L.heldIds = () => L.entries.filter(e => e.mid != null).map(e => e.mid);
  L.list = () => L.entries.map(e => ({ item: e.item, n: e.n, pending: !!e.pending }));
  L.save = () => L.entries.length ? L.entries.map(e => [e.item, e.n]) : undefined;
  /* 讀檔：上次留下的全部搬回背包（猴子隨著重新整理消失了）；放不下的留著等領回。只收白名單裡的代號與正整數，其他丟掉 */
  L.load = d => { L.entries.length = 0; if (!Array.isArray(d)) return; for (const r of d) { if (!Array.isArray(r) || !ok(r[0]) || !(r[1] > 0)) continue; L.entries.push({ eid: ++L.seq, mid: null, sp: 0, item: r[0], n: Math.min(99, r[1] | 0), t0: 0, pending: true }); } L.claim(); };
  return L;
}
