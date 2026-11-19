// 0.6「獵人的手藝」的資料：物品、採集物、配方、武器整備與獸飾、披肩、飽食與精力、菁英。純資料，數字都是第一版（數值設計師直接改這裡）
// 對照：design06/0.6 設計定案.md 的實作附錄 A–G。物品代號照附錄；現有物品與怪物的代號沿用 core.js
import { ITEMS } from './core.js';
import { TIER5 } from './data08.js';      /* 0.8 X8 */

/* ============================== A. 物品 ============================== */
// kind：gather 採集物｜food 料理｜ration 乾糧｜drink 飲品｜med 藥｜tonic 藥劑｜tool 工具｜recipe 食譜｜cloak 披肩｜charm 獸飾｜passive 被動天賦球
// max：最多帶幾個；sell 沒寫＝商店不收；buy 有寫＝雜貨商有賣；once＝只能有一個（買過就不再賣）
const G = (name, glyph, color, desc) => ({ name, glyph, color, desc, kind: 'gather', max: 99 });
export const ITEMS06 = {
  herb_bleed: G('止血草', '草', '#5fa55a', '到處都有的藥草。治療藥水的材料。'),
  berry: G('野莓', '莓', '#c2456b', '酸甜的漿果。'),
  wheat: G('麥穗', '麥', '#d9b65a', '風車旁的麥田與舊牧欄的野麥。'),
  cress: G('水芹', '芹', '#6fb98a', '長在水邊，燉肉用。'),
  mushroom: G('樹蔭菇', '菇', '#b08a6a', '長在森林倒木旁。'),
  moss: G('低語苔', '苔', '#5fc7b0', '潭岸的苔，夜裡發微光。'),
  ginseng: G('熊徑蔘', '蔘', '#c9a36a', '森林最西的好藥材，長在熊的地盤。'),
  ore_iron: G('鐵礦石', '礦', '#a0624a', '峽谷岩壁的鏽色礦脈。要礦鎬。'),
  salt: G('岩鹽', '鹽', '#e6e2dc', '峽谷岩壁的鹽晶。要礦鎬。'),
  scrap: G('舊鐵件', '鐵', '#7d8790', '斷鍊、破籠、翻倒的礦車上拆下來的鐵。向布蘿娜訂做武器要用。'),
  mint: G('霜薄荷', '荷', '#8fd6c8', '長在冷泉邊，提神。'),
  honey: G('野蜂蜜', '蜜', '#e0a93a', '古木上的蜂巢。'),
  egg: G('鳥蛋', '蛋', '#efe6d0', '蘆葦澤裡的鳥巢。'),
  food_skewer: { name: '烤肉串', glyph: '串', color: '#b5673f', kind: 'food', desc: '飽食 +40。野外 20 分鐘：生命上限 +8%。' },
  food_stew: { name: '獵人燉肉', glyph: '燉', color: '#9a5a3a', kind: 'food', desc: '飽食 +50。野外 20 分鐘：生命上限 +15%，脫離戰鬥後每秒回 1% 生命。' },
  food_cake: { name: '莓果麥餅', glyph: '餅', color: '#d7a45a', kind: 'food', desc: '飽食 +40。野外 20 分鐘：體力上限與回復 +15%。' },
  food_soup: { name: '蘑菇濃湯', glyph: '湯', color: '#c8b08a', kind: 'food', desc: '飽食 +40。野外 20 分鐘：魔力上限與回復 +20%。' },
  food_steak: { name: '岩鹽烤排', glyph: '排', color: '#a8482e', kind: 'food', desc: '飽食 +50。野外 20 分鐘：造成的傷害 +8%。' },
  food_pie: { name: '厚皮肉派', glyph: '派', color: '#c98f4a', kind: 'food', desc: '飽食 +50。野外 20 分鐘：受到的傷害 −5%，格擋少耗 15% 體力。' },
  food_tea: { name: '野莓草茶', glyph: '茶', color: '#b8607a', kind: 'food', desc: '飽食 +10、精力 +25。野外 20 分鐘：掉寶與採集加量 +5%。' },
  food_feast: { name: '九十九場大鍋', glyph: '鍋', color: '#b0452a', kind: 'food', desc: '要架在營火上：同場每人盛一碗。飽食 +60。野外 20 分鐘：生命上限 +12%、傷害 +5%、體力上限 +10%。' },
  food_jerky: { name: '肉乾', glyph: '乾', color: '#8a4a30', kind: 'ration', desc: '飽食 +20，8 秒內恢復 25% 生命（挨打就中斷）。不佔料理的增益。' },
  drink_mint: { name: '提神茶', glyph: '茶', color: '#7fcab8', kind: 'drink', desc: '精力 +50。不佔料理的增益。' },
  potion_strong: { name: '強效治療藥水', glyph: '藥', color: '#d94a6a', kind: 'med', desc: '3 秒內恢復 65% 生命。和治療藥水共用冷卻。', sell: 12 },
  potion_mana: { name: '清神藥水', glyph: '藥', color: '#5a8fd9', kind: 'med', desc: '5 秒內恢復 40% 魔力。自己的冷卻 60 秒。', sell: 10 },
  tonic_gall: { name: '熊膽劑', glyph: '劑', color: '#4f9d5d', kind: 'tonic', desc: '野外 3 分鐘：受到的傷害 −5%，喝藥不會被打斷。藥劑同時只有一種生效。', sell: 10 },
  tonic_fighter: { name: '鬥士藥酒', glyph: '酒', color: '#c9953a', kind: 'tonic', desc: '野外 3 分鐘：造成的傷害 +10%、體力回復 +20%。藥劑同時只有一種生效。', sell: 10 },
  pickaxe: { name: '礦鎬', glyph: '鎬', color: '#8d7a66', kind: 'tool', desc: '敲礦與岩鹽用。不會壞，買一次就夠。', buy: 80, once: 1, max: 1 },
  recipe_steak: { name: '食譜：岩鹽烤排', glyph: '譜', color: '#d8c9a0', kind: 'recipe', desc: '用了就學會「岩鹽烤排」。', buy: 60, once: 1, max: 1, teach: 'food_steak' },
  cloak_wolf: { name: '狼皮披肩', glyph: '披', color: '#8d959c', kind: 'cloak', desc: '受到的傷害 −4%，精力消耗少 10%。一次穿一件。', max: 1 },
  cloak_bear: { name: '熊皮披肩', glyph: '披', color: '#7a5a3e', kind: 'cloak', desc: '受到的傷害 −7%，精力消耗少 15%。一次穿一件。', max: 1 },
  cloak_tiger: { name: '虎皮披肩', glyph: '披', color: '#d98a3a', kind: 'cloak', desc: '受到的傷害 −10%，精力消耗少 20%。一次穿一件。', max: 1 },
  charm_tusk: { name: '獠牙飾', glyph: '飾', color: '#cfc6ae', kind: 'charm', desc: '獸飾：重攻擊傷害 +10%。武器二階起可以請布蘿娜裝上。' },
  charm_antler: { name: '鹿角飾', glyph: '飾', color: '#e0d2b4', kind: 'charm', desc: '獸飾：攻擊與閃避少耗 10% 體力。武器二階起可以請布蘿娜裝上。' },
  charm_fang: { name: '虎牙飾', glyph: '飾', color: '#e8dcc0', kind: 'charm', desc: '獸飾：暴擊率 +5%。武器二階起可以請布蘿娜裝上。' },
  orb_gather: { name: '天賦球：採集精通', glyph: '採', color: '#6fae5a', kind: 'passive', desc: '被動：每採兩株多 1 個，採集時間少三成。不佔技能欄。', passive: 'gather', req: { luk: 15, end: 10 } }
};
// 併進遊戲的物品表（背包、掉落、商店、說明文字都只認 core.js 的 ITEMS）；現有物品補上這批的用途
Object.assign(ITEMS, ITEMS06);
ITEMS.meat.desc = '生吃：飽食 +8，10 秒內慢慢恢復 15% 生命，一挨打就中斷。也是各種料理的材料。';
ITEMS.potion.desc = '喝下後 3 秒內恢復 40% 生命。喝的時候要站穩（被打中會中斷），喝完 12 秒內不能再用回復道具。也可以找艾妲自己調。';
for (const [id, d] of [['tusk', '武器整備（一、二階）與獠牙飾的素材。'], ['pelt_deer', '武器一階、狼皮披肩的素材。'], ['pelt_wolf', '武器一、二階與披肩的素材。'], ['pelt_bear', '武器三階與披肩的素材。'], ['pelt_tiger', '武器四階與虎皮披肩的素材。'], ['fang', '武器三階與虎牙飾的素材。'], ['antler', '鹿角飾的素材。'], ['gall', '熊膽劑的材料。']]) ITEMS[id].desc = d;
for (const id of ['trophy_frost', 'trophy_scar', 'trophy_shadow']) ITEMS[id].desc += '武器四階要出示三件戰利品（不會消耗）。';

/* ============================== B. 採集物 ============================== */
// t 採一株幾秒｜re 幾秒長回｜n 一片幾株（場景沒給株數時用）｜tool 需要的工具｜shape 佔位模型的樣子（美術的 makeGatherMesh 到位後不用）
export const GATHER = {
  herb_bleed: { t: 0.8, re: 180, n: [10, 14], shape: 'herb' },
  berry: { t: 0.8, re: 180, n: [6, 8], shape: 'bush' },
  cress: { t: 0.8, re: 180, n: [8, 10], shape: 'herb' },
  wheat: { t: 0.8, re: 240, n: [12, 16], shape: 'stalk' },
  mushroom: { t: 0.8, re: 240, n: [6, 8], shape: 'cap' },
  moss: { t: 1.0, re: 240, n: [6, 8], shape: 'pad' },
  mint: { t: 0.8, re: 240, n: [8, 10], shape: 'herb' },
  ginseng: { t: 1.5, re: 300, n: [6, 8], shape: 'stalk' },
  honey: { t: 1.5, re: 300, n: [3, 4], shape: 'blob' },
  egg: { t: 1.0, re: 300, n: [5, 6], shape: 'nest' },
  scrap: { t: 1.5, re: 300, n: [3, 8], shape: 'pile' },
  ore_iron: { t: 2.0, re: 300, n: [3, 8], tool: 'pickaxe', shape: 'rock' },
  salt: { t: 2.0, re: 300, n: [3, 8], tool: 'pickaxe', shape: 'rock' }
};
// reach 走到多近可以採｜auto 按住互動鍵時，會自己走去多遠以內的下一株｜show 多遠以內才畫出來｜big 長回時變成大株的機率（再乘幸運）｜bigN 大株一次給幾個
// mastery 採集精通：每 every 株多 1 個、時間乘 time｜cap 每種最多帶幾個
export const GATHER_K = { reach: 2.3, auto: 7, show: 80, hide: 95, big: 0.06, bigN: 3, mastery: { every: 2, time: 0.7 }, cap: 99 };

/* ============================== C. 配方 ============================== */
// st 在哪裡做：cook 酒館大鍋或營火｜brew 艾妲的藥草架。mats 材料｜fee 調製費｜out 一次做出幾份
// src 怎麼學：npc 誰教｜quest 哪個任務的獎勵（story.js 有這個任務時，回報就學會；還沒有這個任務時，由那位 NPC 在對話裡直接教）｜pre 要先完成的任務｜lv 等級｜show 要帶在身上給他看的東西｜item 也可以用這個食譜道具學
export const CRAFT_TIME = 3;
export const RECIPES = {
  food_skewer: { st: 'cook', mats: { meat: 2 }, src: { npc: 'tavern', quest: 'c01', pre: 's01' } },
  food_cake: { st: 'cook', mats: { wheat: 2, berry: 2 }, src: { npc: 'tavern', quest: 'c01', pre: 's01' } },
  food_stew: { st: 'cook', mats: { meat: 2, cress: 1 }, src: { npc: 'hunter', quest: 'c04', lv: 4 } },
  food_jerky: { st: 'cook', mats: { meat: 2, salt: 1 }, out: 3, src: { npc: 'hunter', quest: 'c04', lv: 4 } },
  food_soup: { st: 'cook', mats: { mushroom: 2, wheat: 1 }, src: { npc: 'tavern', show: 'mushroom' } },
  food_steak: { st: 'cook', mats: { meat: 3, salt: 1 }, src: { npc: 'merchant', quest: 'c05', item: 'recipe_steak', never: 1 } },
  food_pie: { st: 'cook', mats: { meat: 2, wheat: 2, egg: 1 }, src: { npc: 'tavern', lv: 6 } },
  food_tea: { st: 'cook', mats: { berry: 2, herb_bleed: 1 }, src: { npc: 'apothecary', quest: 'c02', lv: 2 } },
  food_feast: { st: 'cook', mats: { meat: 4, mushroom: 2, cress: 2, egg: 2 }, src: { npc: 'tavern', pre: 'm09' } },
  drink_mint: { st: 'cook', mats: { mint: 2, honey: 1 }, src: { npc: 'hunter', lv: 7 } },
  potion: { st: 'brew', mats: { herb_bleed: 3 }, fee: 15, src: { npc: 'apothecary', quest: 'c02', lv: 2 } },
  potion_strong: { st: 'brew', mats: { ginseng: 1, herb_bleed: 2 }, fee: 25, src: { npc: 'apothecary', quest: 'c06', pre: 's07' } },
  potion_mana: { st: 'brew', mats: { moss: 2, mushroom: 1 }, fee: 20, src: { npc: 'apothecary', lv: 4 } },
  tonic_gall: { st: 'brew', mats: { gall: 1, herb_bleed: 2 }, fee: 20, src: { npc: 'apothecary', pre: 's02' } },
  tonic_fighter: { st: 'brew', mats: { ginseng: 1, honey: 1 }, fee: 20, src: { npc: 'apothecary', lv: 9 } }
};
export const RECIPE_IDS = Object.keys(RECIPES);      // 存檔用這個順序的位元記「學會了哪些」：新配方一律加在最後
export const STATION = { cook: '料理', brew: '製藥' };
// 吃、喝的效果。act 動作秒數｜combat 戰鬥中能不能用｜sat／en 回多少飽食、精力｜slot 佔哪一格增益（food 料理｜tonic 藥劑）｜dur 增益秒數（只在野外倒數）
// fx 增益內容：hp 生命上限｜st 體力上限｜stRegen 體力回復｜mp 魔力上限｜mpRegen 魔力回復｜dmg 造成的傷害｜dr 減傷｜guard 格擋耗體力｜loot 掉寶與採集加量｜ooc 脫戰後每秒回生命的比例｜steady 喝藥不被打斷
// heal [比例, 幾秒內回完, 挨打會不會中斷]｜mana [比例, 幾秒]｜cd 冷卻：pot 和治療藥水共用、mana 自己的｜camp 要在營火旁才能用（隊伍料理）
export const BUFF_FOOD = 1200, BUFF_TONIC = 180, EAT_TIME = 2;
export const USE = {
  meat: { sat: 8 },      // 生吃獸肉：回復的部分沿用原本的規則（core.js 的 MEAT），這裡只加飽食
  food_skewer: { act: EAT_TIME, sat: 40, slot: 'food', dur: BUFF_FOOD, fx: { hp: 0.08 } },
  food_stew: { act: EAT_TIME, sat: 50, slot: 'food', dur: BUFF_FOOD, fx: { hp: 0.15, ooc: 0.01 } },
  food_cake: { act: EAT_TIME, sat: 40, slot: 'food', dur: BUFF_FOOD, fx: { st: 0.15, stRegen: 0.15 } },
  food_soup: { act: EAT_TIME, sat: 40, slot: 'food', dur: BUFF_FOOD, fx: { mp: 0.2, mpRegen: 0.2 } },
  food_steak: { act: EAT_TIME, sat: 50, slot: 'food', dur: BUFF_FOOD, fx: { dmg: 0.08 } },
  food_pie: { act: EAT_TIME, sat: 50, slot: 'food', dur: BUFF_FOOD, fx: { dr: 0.05, guard: -0.15 } },
  food_tea: { act: EAT_TIME, sat: 10, en: 25, slot: 'food', dur: BUFF_FOOD, fx: { loot: 0.05 } },
  food_feast: { act: EAT_TIME, sat: 60, slot: 'food', dur: BUFF_FOOD, fx: { hp: 0.12, dmg: 0.05, st: 0.1 }, camp: 1 },
  food_jerky: { act: EAT_TIME, sat: 20, heal: [0.25, 8, 1], cd: ['pot', 10] },
  drink_mint: { act: EAT_TIME, en: 50 },
  potion_strong: { act: 0.8, combat: 1, heal: [0.65, 3, 0], cd: ['pot', 12] },
  potion_mana: { act: 0.8, combat: 1, mana: [0.4, 5], cd: ['mana', 60] },
  tonic_gall: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC, fx: { dr: 0.05, steady: 1 } },
  tonic_fighter: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC, fx: { dmg: 0.1, stRegen: 0.2 } }
};
export const FX_TEXT = { hp: ['生命上限', 1], st: ['體力上限', 1], stRegen: ['體力回復', 1], mp: ['魔力上限', 1], mpRegen: ['魔力回復', 1], dmg: ['造成的傷害', 1], dr: ['受到的傷害', -1], guard: ['格擋耗體力', 1], loot: ['掉寶與採集加量', 1], ooc: ['脫戰後每秒回生命', 1] };
export const FEAST_R = 14;      // 大鍋：營火周圍多遠的人盛得到

/* ============================== D. 武器架、階級、獸飾 ============================== */
// 武器沿用 actors.js 的 WEAPONS 編號 0–11。pelt＝鹿皮或狼皮（可以混用，先用鹿皮）
export const ORDER = { fee: 60, mats: { scrap: 3 } };      // 向布蘿娜訂做別種基礎款
export const SWAP_TIME = 1.5;                              // 換武器的動作秒數（脫離戰鬥才能換）
export const PELT_ANY = ['pelt_deer', 'pelt_wolf', 'pelt_croc'];      /* 0.8 X8：鱷魚皮 1 張抵 1 張狼皮（一階的「鹿皮或狼皮」也算） */
// dmg 累計傷害加成｜mats 第一次做的素材｜half 這一階在任何一把上做過之後的素材｜fee 工錢（不減半）｜slot 開獸飾格｜show 要出示（不消耗）的東西
export const TIERS = [null,
  { name: '纏皮', dmg: 0.06, fee: 60, mats: { pelt: 3, tusk: 1 }, half: { pelt: 2, tusk: 1 } },
  { name: '鑲牙', dmg: 0.12, fee: 150, mats: { pelt_wolf: 2, tusk: 2, ore_iron: 3 }, half: { pelt_wolf: 1, tusk: 1, ore_iron: 2 }, slot: 1 },
  { name: '鐵箍', dmg: 0.20, fee: 350, mats: { pelt_bear: 3, ore_iron: 6, fang: 1 }, half: { pelt_bear: 2, ore_iron: 3, fang: 1 } },
  { name: '三名', dmg: 0.28, fee: 600, mats: { pelt_tiger: 3, ore_iron: 8 }, half: { pelt_tiger: 2, ore_iron: 4 }, show: ['trophy_frost', 'trophy_scar', 'trophy_shadow'] }
];
TIERS.push(TIER5);      /* 0.8 X8：五階「三獸」（data08.js） */
export const TIER_MAX = TIERS.length - 1, CHARM_TIER = 2;      // 幾階起可以裝獸飾
// 獸飾：fx heavy 重攻擊傷害｜act 攻擊與閃避耗的體力｜crit 暴擊率
export const CHARMS = {
  charm_tusk: { mats: { tusk: 2 }, fx: { heavy: 0.10 }, text: '重攻擊傷害 +10%' },
  charm_antler: { mats: { antler: 1 }, fx: { act: -0.10 }, text: '攻擊與閃避少耗 10% 體力' },
  charm_fang: { mats: { fang: 1 }, fx: { crit: 0.05 }, text: '暴擊率 +5%' }
};
export const CHARM_IDS = Object.keys(CHARMS);              // 存檔記編號＋1（0＝沒裝）
export const CHARM_FEE = { make: 30, move: 10 };
export const MELT_BACK = 1 / 3;                            // 熔掉：返還這一把用過的強化素材的幾分之幾（無條件捨去、每種至少 1 個；工錢不退）

/* ============================== E. 披肩與減傷 ============================== */
// dr 減傷｜en 精力消耗倍率｜cape／cc 佔位外觀：美術還沒做披肩模型前，借用現有披風的款式與顏色（actors.js 的 CAPES、CAPE_COLORS 編號）
export const CLOAKS = {
  cloak_wolf: { tier: 1, dr: 0.04, en: 0.9, mats: { pelt_wolf: 4, pelt_deer: 2 }, fee: 40, lv: 4, cape: 4, cc: 5 },
  cloak_bear: { tier: 2, dr: 0.07, en: 0.85, mats: { pelt_bear: 4, pelt_wolf: 2 }, fee: 120, lv: 7, cape: 4, cc: 7 },
  cloak_tiger: { tier: 3, dr: 0.10, en: 0.8, mats: { pelt_tiger: 4, pelt_bear: 2 }, fee: 300, lv: 10, cape: 4, cc: 4 }
};
export const CLOAK_IDS = Object.keys(CLOAKS);
export const DR_CAP = 0.2;      // 硬規則：披肩＋料理＋藥劑（以及之後任何減傷來源）合計最多兩成

/* ============================== F. 飽食與精力 ============================== */
// 上限＝base＋(耐力−5)×perEnd。只在野外戰鬥中消耗：satTick／enTick 秒扣 1 點；倒下一次扣 death 點精力
// hi／lo：區間的界線（比例）。飽食：hi 以上脫戰 oocWait 秒後每秒回 satRegen 的生命；lo 以下生命上限 −satLo；見底 −sat0。精力：hi 以上體力回復 +enHi；lo 以下 −enLo；見底 −en0
// 城裡：飽食每 townSat[0] 秒 +1（最多到 townSat[1] 的比例）；精力每 townEn 秒 +1 到滿。營火：坐下每秒 +camp，附近（campNear 公尺內）有另一位坐著的玩家時 +campDuo
export const NEEDS = { base: 100, perEnd: 2, satTick: 12, enTick: 20, death: 10, hi: 0.7, lo: 0.3, oocWait: 5, satRegen: 0.005, satLo: 0.05, sat0: 0.10, enHi: 0.10, enLo: 0.15, en0: 0.30, townSat: [3, 0.5], townEn: 2, camp: 5, campDuo: 7.5, campNear: 8, stewFee: 5, combatT: 6 };
export const NEED_NAME = { sat: ['餓壞了', '餓了', '', '吃飽'], en: ['累壞了', '累了', '', '精神好'] };      // 見底／lo 以下／中間／hi 以上
export const NEED_TEXT = { sat: ['生命上限 −10%', '生命上限 −5%', '沒有效果', '脫離戰鬥後每秒回 0.5% 生命'], en: ['體力回復 −30%', '體力回復 −15%', '沒有效果', '體力回復 +10%'] };

/* ============================== G. 菁英 ============================== */
// hp／dmg：對同種同級普通野獸的倍率｜perHp／perDmg：開戰時附近 range 公尺內每多一位玩家的加成（最多算 maxN 人）｜respawn 重生秒數
// spots：每隻三處輪流出沒（第一處是老巢）。之後由 places06.js 的 ELITE_SPOTS 取代；這裡是測試用的位置（白鹽臺的座標在山壁裡，先用東外環的空地）
export const ELITE = {
  hp: 6, dmg: 1.45, perHp: 0.7, perDmg: 0.05, maxN: 4, range: 60, respawn: 480,
  spots: { trophy_frost: [[-34, 168], [-104, 280], [142, 300]], trophy_scar: [[-176, -44], [-284, 172], [-214, -216]], trophy_shadow: [[214, 16], [270, -92], [262, 124]] }
};

/* ============================== NPC 的服務與商店 ============================== */
// 對話選單裡多出來的選項（ui.js 的 dlgMenu 會照這張表加）：cook 借大鍋料理｜brew 調藥｜teach 請教配方｜forge 整備、訂做、獸飾、熔掉｜cloak 做披肩｜rest 歇一會｜stew 今日燉鍋｜trial 試用武器
// need：要先完成哪個任務才開放（story.js 還沒有那個任務時不擋）
export const SERVICES = {
  tavern: [['cook', '借用大鍋（料理）'], ['rest', '歇一會（精力回滿）'], ['stew', '今日燉鍋（5 金，飽食回滿）'], ['teach', '請教料理']],
  apothecary: [['brew', '借用藥草架（調藥）'], ['teach', '請教配方']],
  smith: [['forge', '整備與訂做武器']],
  hunter: [['cloak', '做披肩', { need: 'c04' }], ['teach', '請教料理']],
  instructor: [['trial', '試用競技場的武器']]
};
export const SHOP = { merchant: ['potion', 'pickaxe', 'recipe_steak'] };

/* ============================== 測試用的地點（之後由 places06.js 的 GATHER_SITES、CAMPS 取代） ============================== */
// 採集點：{ kind, x, z, r, n } 一片（中心、半徑、株數）；或 { kind, pts: [[x, z], …] } 指定每一個敲點
export const TEST_SITES = [
  { kind: 'herb_bleed', x: -16, z: 62, r: 7, n: 12 }, { kind: 'herb_bleed', x: 30, z: 96, r: 7, n: 12 }, { kind: 'berry', x: 20, z: 66, r: 5, n: 7 }, { kind: 'wheat', x: 70, z: 70, r: 7, n: 14 },
  { kind: 'cress', x: 48, z: 101, r: 5, n: 8 }, { kind: 'mushroom', x: -70, z: 30, r: 6, n: 7 }, { kind: 'egg', x: -30, z: 84, r: 4, n: 5 }, { kind: 'mint', x: 2, z: 92, r: 5, n: 8 },
  { kind: 'moss', x: -52, z: 62, r: 4, n: 6 }, { kind: 'ginseng', x: -84, z: 44, r: 5, n: 6 }, { kind: 'honey', x: -60, z: 46, r: 4, n: 3 },
  { kind: 'scrap', pts: [[7.4, -103.4], [10.6, -100.6], [12.2, -104.2]] }, { kind: 'scrap', x: 22, z: 54, r: 3, n: 3 },
  { kind: 'ore_iron', x: 66, z: 30, r: 3.5, n: 4 }, { kind: 'salt', x: 78, z: 20, r: 3, n: 3 }
];
// 營火：{ id, name, x, z }。ph＝這裡沒有場景做的營火模型，由 gather.js 放一個佔位的
export const TEST_CAMPS = [{ id: 'hunter', name: '獵人營地', x: -105.6, z: -10.8 }, { id: 'test_south', name: '南門外的營火（測試）', x: 12, z: 58, ph: 1 }];
