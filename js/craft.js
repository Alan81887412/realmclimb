// 料理與製藥：配方學習、製作、吃喝、增益（料理一格、藥劑一格，只在野外倒數，倒下不消失）。規則見定案第 4 節與附錄 C；數字在 data06.js
// 狀態放在 P 上：P.rec = { 配方代號: 1 }、P.food／P.tonic = { id, left 剩幾秒 } 或 null
import { RECIPES, RECIPE_IDS, USE, CRAFT_TIME, STATION, FEAST_R, FX_TEXT } from './data06.js';
import { GROUPS, groupHave, groupTake } from './data07.js';      // 0.7：配方材料的群組（任何魚、鱒類、主）

let C = null, job = null;
const P = () => C.P, inv = id => (GROUPS[id] ? groupHave(id, C.P.inv) : C.P.inv[id] || 0);
export function init(ctx) { C = ctx; }
export function reset() { const p = P(); p.rec = {}; p.food = null; p.tonic = null; C.me.manaCd = 0; job = null; }

/* ---------- 存檔 ---------- */
export function save() { const p = P(); let rc = 0; RECIPE_IDS.forEach((id, i) => { if (p.rec[id]) rc += 2 ** i; }); const o = { rc }; if (p.food) o.f = [p.food.id, Math.round(p.food.left)]; if (p.tonic) o.t = [p.tonic.id, Math.round(p.tonic.left)]; return o; }
export function load(h) {
  reset(); if (!h) return; const p = P(), rc = typeof h.rc === 'number' && h.rc > 0 ? Math.floor(h.rc) : 0; RECIPE_IDS.forEach((id, i) => { if (Math.floor(rc / 2 ** i) % 2) p.rec[id] = 1; });
  const buff = (a, slot) => (Array.isArray(a) && USE[a[0]] && USE[a[0]].slot === slot && a[1] > 0 ? { id: a[0], left: Math.min(USE[a[0]].dur, +a[1] || 0) } : null);
  p.food = buff(h.f, 'food'); p.tonic = buff(h.t, 'tonic');
}

/* ---------- 配方 ---------- */
export const knows = id => !!P().rec[id];
export function learn(id, quiet) {
  if (!RECIPES[id] || knows(id)) return false; P().rec[id] = 1; C.save();
  if (!quiet) { C.ui.log(`學會了配方「${C.ITEMS[id].name}」（${STATION[RECIPES[id].st]}）。`); C.ui.sfx('learn'); } return true;
}
// 任務回報時：把這個任務當獎勵的配方學起來（story.js 的任務獎勵也可以直接寫 rewards.recipes）
export function onQuestDone(qid, list) { const got = []; for (const id of RECIPE_IDS) if ((RECIPES[id].src.quest === qid || (list && list.includes(id))) && learn(id, true)) got.push(id); return got; }
// 這位 NPC 能教的配方與目前學不學得到。回傳 [{ id, name, ok, why }]（已經會的不列）
export function teachList(npc) {
  const out = [];
  for (const id of RECIPE_IDS) {
    const s = RECIPES[id].src; if (s.npc !== npc || knows(id)) continue; let why = '';
    if (s.quest && C.questExists(s.quest)) why = C.questDone(s.quest) ? '' : `完成任務「${C.questName(s.quest)}」就教你`;
    else if (s.never) why = '向米洛買食譜';
    else if (s.pre && C.questExists(s.pre) && !C.questDone(s.pre)) why = `先完成任務「${C.questName(s.pre)}」`;
    else if (s.lv && P().lv < s.lv) why = `等級 ${s.lv} 以後`;
    else if (s.chk && s.chk(P())) why = s.chk(P());      // 0.7：自訂的學習條件（例：帶 2 尾魚給瑪歌看）
    else if (s.show && !(inv(s.show) > 0)) why = `帶${C.ITEMS[s.show].name}給${C.npcName(npc)}看`;
    out.push({ id, name: C.ITEMS[id].name, ok: !why, why });
  }
  return out;
}
// 向 NPC 請教：把現在學得到的都學起來，回傳學到的名稱
export function teach(npc) { const got = []; for (const r of teachList(npc)) if (r.ok && learn(r.id, true)) got.push(r.name); if (got.length) { C.ui.sfx('learn'); C.ui.log('學會了配方：' + got.map(n => '「' + n + '」').join('') + '。'); } return got; }
// 食譜道具：用了就學會
export function useRecipeItem(id) { const t = C.ITEMS[id].teach; if (knows(t)) { C.ui.toast('已經會做「' + C.ITEMS[t].name + '」了'); return false; } C.take(id, 1); learn(t); return true; }

/* ---------- 製作 ---------- */
// st：'cook'｜'brew'。回傳這個地方做得出來的全部配方（還沒學會的也列，介面自己決定怎麼顯示）
export function list(st) {
  return RECIPE_IDS.filter(id => RECIPES[id].st === st).map(id => {
    const R = RECIPES[id], mats = Object.keys(R.mats).map(m => [m, C.ITEMS[m].name, R.mats[m], inv(m)]), fee = R.fee || 0, out = R.out || 1;
    let max = Math.min(...mats.map(m => Math.floor(m[3] / m[2])), fee ? Math.floor(P().gold / fee) : 99, 20); const room = Math.floor(C.room(id) / out); max = Math.max(0, Math.min(max, room));
    const s = R.src, from = s.never ? '米洛賣的食譜' : C.npcName(s.npc);
    return { id, name: C.ITEMS[id].name, desc: C.ITEMS[id].desc, known: knows(id), mats, fee, out, max, from, why: !knows(id) ? '還沒學會（' + from + '）' : room < 1 ? '帶不下了' : max < 1 ? (mats.some(m => m[3] < m[2]) ? '材料不夠' : '金幣不夠') : '' };
  });
}
export const current = () => job;      // 正在做的：{ id, n, t, dur, st } 或 null
// 開始做 n 份（CRAFT_TIME 秒，一次做完）。where：{ x, z } 做的地方，走開就中斷
export function start(id, n, where) {
  const R = RECIPES[id], it = R && list(R.st).find(r => r.id === id); if (!it || job) return false;
  if (it.why) { C.ui.toast(it.why); C.ui.sfx('deny'); return false; } if (C.me.combat) { C.ui.toast('戰鬥中沒辦法' + STATION[R.st]); return false; }
  n = Math.max(1, Math.min(n | 0, it.max)); job = { id, n, t: 0, dur: CRAFT_TIME, st: R.st, x: where ? where.x : C.me.x, z: where ? where.z : C.me.z }; C.me.craft = job; C.ui.sfx('craft', R.st); return true;
}
export function cancel(why) { if (!job) return; job = null; C.me.craft = null; if (why) C.ui.toast(why); }
function finish() {
  const j = job, R = RECIPES[j.id]; job = null; C.me.craft = null;
  const it = list(R.st).find(r => r.id === j.id), n = Math.min(j.n, it ? it.max : 0); if (n < 1) { C.ui.toast('材料不夠'); return; }
  for (const m in R.mats) { if (GROUPS[m]) groupTake(m, R.mats[m] * n, C.P.inv, C.take); else C.take(m, R.mats[m] * n); } if (R.fee) P().gold -= R.fee * n;
  let made = n * (R.out || 1), extra = 0; const luck = Math.max(0, C.D().luck - 1); for (let i = 0; i < n; i++) if (Math.random() < luck) extra++;      // 幸運：有（幸運加成減 1）的機率多做一份
  made = C.addItem(j.id, made + extra); C.save();
  C.ui.loot(`做好了${C.ITEMS[j.id].name} ×${made}` + (extra ? '（手氣不錯，多做了 ' + extra + ' 份）' : ''), [j.id]); C.ui.sfx('craft', 'done');
  for (let i = 0; i < n; i++) { C.quest(R.st === 'cook' ? 'doCook' : 'doBrew'); C.quest((R.st === 'cook' ? 'doCook:' : 'doBrew:') + j.id); }      // 任務目標：做幾次算幾次（例如「調 2 瓶治療藥水」）
}

/* ---------- 吃與喝 ---------- */
const inWild = () => !C.me.inSafe;
export function useCheck(id) {
  const U = USE[id], me = C.me; if (!U || !U.act) return '這個道具現在還用不到'; if (!(inv(id) > 0)) return '沒有' + C.ITEMS[id].name;
  if (!me.alive || me.drink || me.swim || me.atk || me.cast || me.dodge || me.rush || me.stun > 0) return '現在騰不出手';
  if (!U.combat && me.combat) return '戰鬥中不能吃東西';
  if (U.cd && U.cd[0] === 'pot' && me.potCd > 0) return `還要 ${Math.ceil(me.potCd)} 秒才能再用回復道具`;
  if (U.cd && U.cd[0] === 'mana' && me.manaCd > 0) return `還要 ${Math.ceil(me.manaCd)} 秒才能再喝清神藥水`;
  if (U.heal && !U.sat && me.hp >= C.D().maxHp - 0.5) return '生命已滿'; if (U.mana && me.mp >= C.D().maxMp - 0.5) return '魔力已滿';
  if (U.camp && !C.nearCamp(4.5)) return '要架在營火上：到營火旁邊再用';
  return '';
}
export function use(id) {
  const why = useCheck(id); if (why) { C.ui.toast(why); return false; } const U = USE[id], drinkish = /^(potion|tonic|drink)/.test(id);
  C.busy(id, U.act, drinkish ? '喝藥中' : '進食中', () => consume(id)); C.ui.sfx(drinkish ? 'drink' : 'eat', id); return true;
}
// 生效（動作做完那一刻）。from：別人架的大鍋盛來的（不扣道具）
function consume(id, from) {
  const U = USE[id], me = C.me, p = P(), D = C.D(); if (!from) { if (!(inv(id) > 0)) return; C.take(id, 1); }
  if (U.sat) C.need('sat', U.sat); if (U.en) C.need('en', U.en);
  if (U.slot) { p[U.slot] = { id, left: U.dur }; C.refresh(); }      // 新的取代舊的
  if (U.heal) { const amt = Math.round(D.maxHp * U.heal[0]); me.regenLeft = amt; me.regenRate = amt / U.heal[1]; me.regenMeat = !!U.heal[2]; C.pop('+' + amt, 'heal'); }
  if (U.mana) { me.manaLeft = Math.round(D.maxMp * U.mana[0]); me.manaRate = me.manaLeft / U.mana[1]; }
  if (U.cd) { if (U.cd[0] === 'pot') me.potCd = me.potCdMax = U.cd[1]; else me.manaCd = U.cd[1]; }
  C.fx('eat', id); C.ui.sfx('heal'); C.save(); C.ui.dirty = true;
  if (U.slot) C.ui.log(`${C.ITEMS[id].name}的效果開始了：${fxText(U.fx)}（${Math.round(U.dur / 60)} 分鐘，只在野外倒數）。`);
  C.quest('doEat'); C.quest('doEat:' + id);
  if (U.camp && !from) { const c = C.nearCamp(6); if (c) C.feast(c, id); }      // 隊伍料理：告訴同一處營火旁的其他人
}
// 別人在這處營火架了大鍋：在附近就盛一碗
export function onFeast(camp, who, kind) { const me = C.me, id = kind && USE[kind] && USE[kind].camp ? kind : 'food_feast'; if (!camp || !me.alive || Math.hypot(camp.x - me.x, camp.z - me.z) > FEAST_R) return; consume(id, who || '同伴'); C.ui.loot(`${who || '同伴'}在營火上架了${id === 'food_feast' ? '九十九場大鍋' : C.ITEMS[id].name}，你盛了一碗。`, [id]); }
export const fxText = fx => Object.keys(fx || {}).filter(k => FX_TEXT[k]).map(k => { const [n, s] = FX_TEXT[k], v = fx[k] * s; return n + (k === 'ooc' ? ' ' + fx[k] * 100 + '%' : (v > 0 ? ' +' : ' −') + Math.round(Math.abs(v) * 100) + '%'); }).join('、');

/* ---------- 每幀 ---------- */
export function update(dt) {
  const p = P(), me = C.me;
  if (job) { if (!me.alive || me.combat || Math.hypot(job.x - me.x, job.z - me.z) > 5) cancel(me.alive ? '中斷了' : ''); else { job.t += dt; if (job.t >= job.dur) finish(); } }
  if (me.manaCd > 0) me.manaCd = Math.max(0, me.manaCd - dt);
  if (me.manaLeft > 0) { const h = Math.min(me.manaLeft, me.manaRate * dt); me.manaLeft -= h; me.mp = Math.min(C.D().maxMp, me.mp + h); }
  if (inWild() && me.alive) for (const k of ['food', 'tonic']) { const b = p[k]; if (!b) continue; b.left -= dt; if (b.left <= 0) { p[k] = null; C.refresh(); C.save(); C.ui.log(`${C.ITEMS[b.id].name}的效果結束了。`); } }
}
// 介面用：目前的增益 [{ slot, id, name, left, dur, text }]
export function buffs() { const out = []; for (const k of ['food', 'tonic']) { const b = P()[k]; if (b) out.push({ slot: k, id: b.id, name: C.ITEMS[b.id].name, left: b.left, dur: USE[b.id].dur, text: fxText(USE[b.id].fx) }); } return out; }
// 把增益加進 m（game.js 的匯總點）
export function mods(m) {
  for (const k of ['food', 'tonic']) { const b = P()[k], f = b && USE[b.id] && USE[b.id].fx; if (!f) continue;
    m.hp += f.hp || 0; m.st += f.st || 0; m.stRegen += f.stRegen || 0; m.mp += f.mp || 0; m.mpRegen += f.mpRegen || 0; m.dmg *= 1 + (f.dmg || 0); m.dr += f.dr || 0; m.guard += f.guard || 0; m.loot += f.loot || 0; m.ooc += f.ooc || 0; if (f.steady) m.steady = 1; }
}
