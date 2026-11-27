// 0.7「走遍原野」的新物品與釣魚資料。純資料，數字都是第一版（數值成員直接改這裡）
// 對照：design07/0.7 設計定案.md 的附錄 A（物品）、B（釣魚、魚表）、C（配方、上限）。物品代號照附錄
// 匯入這個檔案時就把新東西併進 core.js 的 ITEMS 與 data06.js 的 RECIPES、USE、CHARMS、SERVICES（新配方、新獸飾一律接在最後，存檔的位元順序才不會變）
import { ITEMS } from './core.js';
import { RECIPES08, CHARMS08, USE08, FX_TEXT08, FISH_BACK08 } from './data08.js';      /* 0.8 X8 */
import { RECIPES, RECIPE_IDS, USE, FX_TEXT, CHARMS, CHARM_IDS, SERVICES, BUFF_FOOD, EAT_TIME } from './data06.js';

/* ============================== A. 物品 ============================== */
// kind：fish 魚｜fishboss 主｜mat 素材（不能賣）｜food 料理｜tonic 藥劑｜tool 工具（釣竿）｜charm 獸飾｜item 道具（地圖）｜passive 被動天賦球
const F = (name, glyph, color, sell, desc) => ({ name, glyph, color, kind: 'fish', max: 99, sell, desc });
const B = (name, color, desc) => ({ name, glyph: '主', color, kind: 'fishboss', max: 9, desc: desc + '太有名了，米洛不敢收，也捨不得分解。可以做大魚宴。' });
const M = (name, glyph, color, desc) => ({ name, glyph, color, kind: 'mat', max: 99, desc });
export const ITEMS07 = {
  rod_1: { name: '竹釣竿', glyph: '竿', color: '#c9b46a', kind: 'tool', max: 1, desc: '哈根年輕時削的竹竿，握把磨得發亮。走到水邊按互動鍵拿出來，按住左鍵蓄力拋竿。不會壞。' },
  rod_2: { name: '鰾膠釣竿', glyph: '竿', color: '#b07a3a', kind: 'tool', max: 1, desc: '哈根用熬過的魚鰾膠一圈一圈纏過，竿身韌了不少：張力在紅區能多撐一下，咬鉤後能反應的時間 1.0 秒。不會壞。' },
  rod_3: { name: '霜鋼釣竿', glyph: '竿', color: '#8fb4c8', kind: 'tool', max: 1, desc: '竿尖包了一截霜鋼。鰾膠釣竿的全部，再加：拋得更遠（24 公尺），魚衝刺時張力跳得少兩成。不會壞。' },
  fish_crucian: F('鏡鯽', '鯽', '#b9c4c9', 4, '鏡池與鏡溪最常見的小魚，鱗片亮得能照人。愛吃麥穗。'),
  fish_startrout: F('星點鱒', '鱒', '#5f7fa8', 10, '只在夜裡的鏡池出現，背上的白點像星星。愛吃肉。'),
  fish_catfish: F('苔鯰', '鯰', '#5d6b4a', 14, '低語潭底的老住戶，大嘴、鬚上掛著苔。很會拖，別急著收。'),
  fish_loach: F('螢鰍', '鰍', '#9fe0b0', 20, '夜裡低語潭水底一閃一閃的光，就是牠。不挑餌。'),
  fish_perch: F('河鱸', '鱸', '#7d9a52', 12, '鏡溪與長灣都有，身上幾道黑橫紋。嘴大、性子急，咬鉤咬得猛。'),
  fish_carp: F('長灣鯉', '鯉', '#c98a3a', 12, '長灣裡懶洋洋的金色大肚鯉，力氣卻不小。愛吃麥穗。'),
  fish_falltrout: F('瀑紋鱒', '鱒', '#6aa0a8', 21, '苔瀑潭只有牠。身上的紋路像瀑布的水花，逆著水才長得這麼壯。'),
  fish_stonecarp: F('坑湖石鯉', '鯉', '#8a8f94', 31, '採石坑湖的灰鯉，鱗像碎石一樣硬，肉卻是甜的。'),
  fish_frosttrout: F('霜鱒', '鱒', '#a9d6e8', 38, '霜泉冷得刺骨，只有牠住得下去。咬鉤很慢，值得等。'),
  fish_boss_beard: B('老鬍子', '#6b5a3a', '長灣夜裡的傳說，鬍鬚比槳還長。帶著肉餌、在夜裡才等得到。'),
  fish_boss_mirror: B('鏡王', '#e6eef2', '清晨才浮上鏡池的銀鯽，鱗片會映出天色。'),
  fish_boss_frost: B('霜鰭', '#d8f0ff', '霜泉深處的白色大鱒，夜裡才上來，鰭邊結著薄霜。'),
  scale: M('魚鱗', '鱗', '#c8d6dc', '鯽、鯉、鱸、鱒分解出來的鱗片。布蘿娜拿來編鏡鱗飾，哈根拿來做釣竿。'),
  fgall: M('魚膽', '膽', '#5f9a5a', '鱒、鱸、螢鰍分解出來的苦膽（熊膽是另一樣）。做藥劑。'),
  bladder: M('魚鰾', '鰾', '#e6d6b0', '鯉、鯰分解出來的魚鰾，熬成魚膠。做藥劑與釣竿。'),
  food_fish: { name: '烤河魚', glyph: '烤', color: '#c97a3a', kind: 'food', desc: '飽食 +40。野外 20 分鐘：閃避與衝刺少耗 12% 體力。' },
  food_fishsoup: { name: '鮮魚湯', glyph: '湯', color: '#e2d6b8', kind: 'food', desc: '飽食 +45，吃下立刻精力 +15。野外 20 分鐘：魔力回復 +25%。' },
  food_smoked: { name: '燻鱒', glyph: '燻', color: '#a8582e', kind: 'food', desc: '飽食 +50。野外 20 分鐘：完美閃避與精準格擋的時機寬一成、體力回復 +10%。' },
  food_fishfeast: { name: '大魚宴', glyph: '宴', color: '#d9a43a', kind: 'food', desc: '要架在營火上：同場每人一碗。飽食 +60、精力 +30。野外 20 分鐘：生命上限 +10%、體力回復 +15%。' },
  tonic_trout: { name: '鱒膽劑', glyph: '劑', color: '#5a8a6a', kind: 'tonic', sell: 8, desc: '野外 5 分鐘：造成的傷害 +8%。藥劑同時只有一種生效。' },
  tonic_glue: { name: '鰾膠強身劑', glyph: '劑', color: '#d9c48a', kind: 'tonic', sell: 8, desc: '野外 5 分鐘：體力上限 +15%、體力回復 +15%。藥劑同時只有一種生效。' },
  tonic_moss: { name: '苔光露', glyph: '露', color: '#6fd6c0', kind: 'tonic', sell: 8, desc: '野外 5 分鐘：魔力回復 +25%。藥劑同時只有一種生效。' },
  tonic_swift: { name: '疾鱒劑', glyph: '劑', color: '#8fd0e8', kind: 'tonic', sell: 8, desc: '野外 5 分鐘：移動速度 +8%（走、跑、衝刺、游泳；閃避距離不變）。藥劑同時只有一種生效。' },
  charm_scale: { name: '鏡鱗飾', glyph: '飾', color: '#d8e6ea', kind: 'charm', desc: '獸飾：完美閃避與精準格擋的判定時間寬 15%。武器二階起可以請布蘿娜裝上。' },
  // 地圖與測繪（玩法由 w7-map 做，這裡只放物品資料；商店要不要賣、怎麼用，等地圖成員接上）
  map_blank: { name: '空白地圖', glyph: '圖', color: '#e8dcb8', kind: 'item', buy: 20, max: 20, desc: '畫一區用。在芬恩的繪圖桌，把自己走過的一區畫下來，送給還沒去過的人。' },
  map_big: { name: '大張空白地圖', glyph: '圖', color: '#e0cfa0', kind: 'item', buy: 120, max: 5, desc: '畫整層用。在芬恩的繪圖桌，把自己走過一成以上的每一區都畫上去。' },
  map_drawn: { name: '手繪地圖', glyph: '圖', color: '#b08a5a', kind: 'item', max: 5, desc: '褐墨畫的地圖，寫著誰畫的、哪一區、畫了幾成。可以送給身邊的玩家；抄來的圖不能再畫給別人。' },
  orb_survey: { name: '天賦球：測繪', glyph: '測', color: '#b08a5a', kind: 'passive', desc: '被動：記錄範圍大五成；陷阱在 10 公尺外就看得到；畫圖不用等。智力 10、幸運 10 才學得會，還不夠時可以先留著或交易。芬恩的師父走過整整一層，留下了這顆球。', passive: 'survey', req: { int: 10, luk: 10 } }
};
// 配方裡的「任何魚」「鱒類」「主」：材料欄寫群組代號，craft.js 的補丁照群組算數量、先用便宜的
export const GROUPS = {
  '@fish': ['fish_crucian', 'fish_perch', 'fish_startrout', 'fish_catfish', 'fish_carp', 'fish_loach', 'fish_falltrout', 'fish_stonecarp', 'fish_frosttrout'],
  '@trout': ['fish_startrout', 'fish_falltrout', 'fish_frosttrout'],
  '@boss': ['fish_boss_mirror', 'fish_boss_beard', 'fish_boss_frost']
};
export const GROUP_ITEMS = {
  '@fish': { name: '任何魚', glyph: '魚', color: '#9fb8c4', kind: 'group', desc: '主不算。' },
  '@trout': { name: '鱒類', glyph: '鱒', color: '#6aa0a8', kind: 'group', desc: '星點鱒、瀑紋鱒、霜鱒。' },
  '@boss': { name: '主', glyph: '主', color: '#e6d6a0', kind: 'group', desc: '老鬍子、鏡王、霜鰭任一尾。' }
};
// 群組裡現在有幾個；扣的時候從排在前面（便宜）的開始扣
export const groupHave = (g, inv) => GROUPS[g].reduce((s, id) => s + (inv[id] || 0), 0);
export function groupTake(g, n, inv, take) { for (const id of GROUPS[g]) { if (n <= 0) break; const k = Math.min(n, inv[id] || 0); if (k > 0) { take(id, k); n -= k; } } }

/* ============================== B. 釣魚 ============================== */
// 操作的常數（附錄 B）。reach 離水邊多近能拿出釣竿｜cast 蓄力秒數、距離（霜鋼 24）｜wait 咬鉤等待秒數（霜泉另計）｜react 咬鉤後的反應時間（鰾膠起 1.0）
// up／down 按住、放開時張力每秒的變化｜surge 魚每隔幾秒衝一次、張力跳多少｜red 張力多少算紅區、連續幾秒斷線｜slack 張力多少算太鬆、連續幾秒魚跑掉｜start 咬鉤時的張力
// drain 按住時魚的力氣每秒掉多少（基本＋張力越高掉越快）｜rest 放開時魚每秒回多少力氣｜sta／bossSta 魚的力氣＝拉鋸秒數×sta（照「一般手感」大約拉那麼久，tests/tension_sim.js 量過）
// bandMin：只打怪升完一個 5 級級距約幾分鐘（數值定案實測 50–52），第一次釣到某種魚的經驗用它換算 E1
export const FISHING = {
  reach: 4, deep: 0.3, cast: { t: 1.2, min: 5, max: 18, maxRod3: 24 }, wait: [4, 15], waitFrost: [8, 20], baitK: 0.5, jettyK: 0.8,
  react: 0.8, reactRod2: 1.0, nibble: [0, 2], early: 2.5,
  up: 35, down: 45, surge: { gap: [2, 5], add: [15, 30], rod3: 0.8, bossGap: [2.5, 4.5], bossK: 0.4 },      // bal-d 0.8：主加了回衝，衝刺 0.45→0.4 讓主仍約三成多跑掉
  red: 85, redT: 1.11, redTRod2: 1.15, slack: 10, slackT: 0.9, start: 40,      // redT／redTRod2 只是說明（fish07 讀 RODS[竿].redT）；數值定案07：竹竿 1.5→1.11，一般玩家約一成三跑掉
  drain: [0.55, 0.9], rest: 0.12, sta: 0.5, bossSta: 0.4, pretty: 1.1,
  back: { gap: [6, 10], bossGap: [12, 18], p: 0.4, drop: [25, 35], pull: 60, pullHold: 22, dur: 1, floor: FISH_BACK08.floor },      /* X8：floor＝回衝不會把張力壓到這以下（本來就比較低的不動），看到「線鬆了」再按收線來得及 */      // bal-d 0.8 回衝：每 gap 秒 p 機率魚朝你游→張力瞬間掉 drop，之後 dur 秒內每秒再掉 pull（按住收線時只再掉 pullHold）；衝刺中不回衝
  run: [0.5, 1.0], runDown: 12, runUp: 10,      // （0.7 衝刺）魚衝刺之後會繼續竄 run 秒：這段時間放開只降 runDown、按住多加 runUp（要立刻放開才不會進紅區太久）
  bossP: 1 / 6, firstExp: 2, firstBossExp: 5, landT: 1.6, bandMin: 51, camOff: 0.24      // camOff：背後視角拿出釣竿時，鏡頭比面向偏左多少（弧度），竿子才不會被頭擋住
};
// 每處水邊：fish [代號, 權重, 只在夜裡 n:1]、boss 主的條件、slow 霜泉咬得慢
// water 的代號對照：places06.js 的 WATERS（鏡池、低語潭是 core.js 的 PONDS 0、1；其他是 core.js 的 LAKES：brook、bay、marsh、falls、pit、spring）
export const WATERS07 = {
  mirror_pond: { name: '鏡池', fish: [['fish_crucian', 1], ['fish_startrout', 0.43, 1]], boss: { id: 'fish_boss_mirror', hours: [5, 8], bait: 'wheat' } },      // 夜裡：鏡鯽 0.7、星點鱒 0.3
  brook: { name: '鏡溪', fish: [['fish_perch', 1], ['fish_crucian', 0.5]] },      // 數值定案07：河鱸排前面（自動用餌帶獸肉），鏡鯽 0.5
  long_bay: { name: '長灣', fish: [['fish_perch', 1], ['fish_carp', 1]], boss: { id: 'fish_boss_beard', night: 1, bait: 'meat' } },
  whisper_pool: { name: '低語潭', fish: [['fish_catfish', 1], ['fish_loach', 0.25, 1]] },                // 夜裡：苔鯰 0.8、螢鰍 0.2
  moss_falls: { name: '苔瀑潭', fish: [['fish_falltrout', 1]] },
  quarry_lake: { name: '採石坑湖', fish: [['fish_stonecarp', 1]] },
  frost_spring: { name: '霜泉', fish: [['fish_frosttrout', 1]], slow: 1, boss: { id: 'fish_boss_frost', night: 1, bait: 'meat' } },
  reed_marsh: { name: '蘆葦澤', fish: [], none: '水太淺了，只有蝌蚪和水草。' },
  south_lake: { name: '南湖', fish: [['fish_perch', 1], ['fish_carp', 1]] },      /* 0.8 X1：南湖照長灣（沒有主） */
  melt_lake: { name: '雪融湖', fish: [['fish_frosttrout', 1]], slow: 1 },      /* 雪融湖與霜林冰潭照霜泉（冷水，上鉤慢） */
  ice_pond: { name: '霜林冰潭', fish: [['fish_frosttrout', 1]], slow: 1 }
};
export const LAKE_WATER = { brook: 'brook', bay: 'long_bay', marsh: 'reed_marsh', falls: 'moss_falls', pit: 'quarry_lake', spring: 'frost_spring', southlake: 'south_lake', meltlake: 'melt_lake', icepond: 'ice_pond' };
export const POND_WATER = ['mirror_pond', 'whisper_pool'];
// 魚：reel 拉鋸秒數｜bait 對的餌（meat 獸肉、wheat 麥穗）｜len 長度（公分）｜rare 少見魚（權重乘幸運）｜gut 分解得到的 [素材, 數量, 機率]｜trout 鱒類
export const FISH = {
  fish_crucian: { reel: [8, 12], bait: 'wheat', len: [12, 22], gut: [['scale', 1]] },
  fish_startrout: { reel: [12, 18], bait: 'meat', len: [25, 40], rare: 1, trout: 1, gut: [['fgall', 1], ['scale', 1]] },
  fish_catfish: { reel: [14, 20], bait: 'meat', len: [30, 55], gut: [['bladder', 1]] },
  fish_loach: { reel: [8, 12], bait: '', len: [8, 14], rare: 1, gut: [['fgall', 1], ['fgall', 1, 0.5]] },
  fish_perch: { reel: [10, 16], bait: 'meat', len: [20, 35], gut: [['scale', 1], ['fgall', 1, 0.5]] },
  fish_carp: { reel: [14, 22], bait: 'wheat', len: [30, 60], gut: [['scale', 2], ['bladder', 1]] },
  fish_falltrout: { reel: [12, 20], bait: 'meat', len: [30, 50], trout: 1, gut: [['fgall', 1], ['scale', 1]] },
  fish_stonecarp: { reel: [16, 24], bait: 'wheat', len: [35, 65], gut: [['scale', 2], ['bladder', 1]] },
  fish_frosttrout: { reel: [16, 25], bait: 'meat', len: [35, 55], trout: 1, gut: [['fgall', 2], ['scale', 1]] },
  fish_boss_beard: { reel: [30, 40], bait: 'meat', len: [95, 130], boss: 1 },
  fish_boss_mirror: { reel: [30, 40], bait: 'wheat', len: [70, 95], boss: 1 },
  fish_boss_frost: { reel: [30, 40], bait: 'meat', len: [80, 110], boss: 1 }
};
export const FISH_IDS = Object.keys(FISH);      // 存檔與即時狀態用這個順序的編號：新魚一律加在最後
export const BAITS = ['wheat', 'meat'];          // 自動用餌的順序（那處水邊對的餌優先）
export const GUT = { t: 0.5, max: 20 };          // 分解一尾幾秒、一次最多幾尾
// 釣竿：lv 第幾階｜react 咬鉤反應秒數｜redT 紅區撐幾秒｜cast 最遠幾公尺｜surge 衝刺張力倍率｜make 哈根做（從上一階升上來：mats 素材、fee 工錢）
export const RODS = {
  rod_1: { lv: 1, react: 0.8, redT: 1.11, cast: 18, surge: 1 },
  rod_2: { lv: 2, react: 1.0, redT: 1.15, cast: 18, surge: 1, from: 'rod_1', mats: { bladder: 4, scrap: 2 }, fee: 40 },
  rod_3: { lv: 3, react: 1.0, redT: 1.15, cast: 24, surge: 0.8, from: 'rod_2', mats: { bladder: 6, ore_iron: 4, scale: 6 }, fee: 120 }
};
export const ROD_IDS = ['rod_1', 'rod_2', 'rod_3'];

/* ============================== C. 配方、藥劑、獸飾 ============================== */
// 魚料理（瑪歌的大鍋或任何營火）：src 同 data06.js。chk：自訂的學習條件（回傳還不能學的原因，空字串＝可以）——craft.js 的補丁會看這一格
export const RECIPES07 = {
  food_fish: { st: 'cook', mats: { '@fish': 2 }, src: { npc: 'hunter', quest: 'f01', lv: 4 } },
  food_fishsoup: { st: 'cook', mats: { '@fish': 2, cress: 1 }, src: { npc: 'tavern', chk: p => (groupHave('@fish', p.inv) >= 2 ? '' : '帶 2 尾魚給瑪歌看') } },
  food_smoked: { st: 'cook', mats: { '@trout': 2, salt: 1 }, src: { npc: 'hunter', lv: 7 } },
  food_fishfeast: { st: 'cook', mats: { '@boss': 1, wheat: 2, cress: 2 }, src: { npc: 'tavern', chk: p => (p.fishRec && FISH_IDS.some(id => FISH[id].boss && p.fishRec[id] && p.fishRec[id][0] > 0) ? '' : '第一次釣到主之後，瑪歌才教') } },
  tonic_trout: { st: 'brew', mats: { fgall: 1, herb_bleed: 1 }, fee: 15, src: { npc: 'apothecary', lv: 5, show: 'fgall' } },
  tonic_glue: { st: 'brew', mats: { bladder: 2, wheat: 1 }, fee: 15, src: { npc: 'apothecary', lv: 5, show: 'bladder' } },
  tonic_moss: { st: 'brew', mats: { fgall: 1, moss: 2 }, fee: 15, src: { npc: 'apothecary', lv: 6 } },
  tonic_swift: { st: 'brew', mats: { fgall: 1, mint: 2 }, fee: 15, src: { npc: 'apothecary', lv: 8 } }
};
export const BUFF_TONIC07 = 300;      // 新藥劑 5 分鐘（0.6 的熊膽劑、鬥士藥酒仍是 3 分鐘）
// 新的增益種類（game.js 的補丁照 M6.move／M6.win／M6.dsSt 算）：move 移動速度｜win 完美閃避與精準格擋的判定時間｜dsSt 閃避與衝刺耗的體力
export const USE07 = {
  food_fish: { act: EAT_TIME, sat: 40, slot: 'food', dur: BUFF_FOOD, fx: { dsSt: -0.12 } },
  food_fishsoup: { act: EAT_TIME, sat: 45, en: 15, slot: 'food', dur: BUFF_FOOD, fx: { mpRegen: 0.25 } },
  food_smoked: { act: EAT_TIME, sat: 50, slot: 'food', dur: BUFF_FOOD, fx: { win: 0.10, stRegen: 0.10 } },
  food_fishfeast: { act: EAT_TIME, sat: 60, en: 30, slot: 'food', dur: BUFF_FOOD, fx: { hp: 0.10, stRegen: 0.15 }, camp: 1 },
  tonic_trout: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC07, fx: { dmg: 0.08 } },
  tonic_glue: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC07, fx: { st: 0.15, stRegen: 0.15 } },
  tonic_moss: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC07, fx: { mpRegen: 0.25 } },
  tonic_swift: { act: 0.8, combat: 1, slot: 'tonic', dur: BUFF_TONIC07, fx: { move: 0.08 } }
};
export const FX_TEXT07 = { move: ['移動速度', 1], win: ['完美閃避與精準格擋的時機', 1], dsSt: ['閃避與衝刺耗體力', 1] };
export const CHARMS07 = { charm_scale: { mats: { scale: 8, bladder: 1 }, fx: { win: 0.15 }, text: '完美閃避與精準格擋的判定時間 +15%' } };
// 上限（寫死在計算裡，之後的新來源也受限；減傷兩成在 data06.js 的 DR_CAP）
export const CAPS07 = { stRegen: 0.5, mpRegen: 0.5, move: 0.10, win: 0.25 };

/* ============================== NPC：米洛收魚、哈根做釣竿 ============================== */
// SERVICES 的新選項由 ui.js 補丁交給 fish07.js 的 service() 處理。need：要先完成的任務（story.js 還沒有那個任務時不擋）
export const SERVICES07 = { merchant: [['sellfish', '賣魚（米洛收新鮮的魚）']], hunter: [['rod', '請哈根做釣竿', { need: 'f01' }]] };

/* ============================== 併進遊戲的表 ============================== */
Object.assign(ITEMS, ITEMS07);
for (const g in GROUP_ITEMS) ITEMS[g] = GROUP_ITEMS[g];      // 群組只給配方的材料欄顯示名稱用（背包裡不會有）；存檔載入時 inv 的數量 >0 才收，群組永遠是 0
for (const id in RECIPES07) if (!RECIPES[id]) { RECIPES[id] = RECIPES07[id]; RECIPE_IDS.push(id); }
Object.assign(USE, USE07); Object.assign(FX_TEXT, FX_TEXT07);
for (const id in CHARMS07) if (!CHARMS[id]) { CHARMS[id] = CHARMS07[id]; CHARM_IDS.push(id); }
for (const id in RECIPES08) if (!RECIPES[id]) { RECIPES[id] = RECIPES08[id]; RECIPE_IDS.push(id); }      /* 0.8 X8：蟒膽劑（s10 學會） */
Object.assign(USE, USE08); Object.assign(FX_TEXT, FX_TEXT08);
for (const id in CHARMS08) if (!CHARMS[id]) { CHARMS[id] = CHARMS08[id]; CHARM_IDS.push(id); }      /* 0.8 X8：牛角飾 */
for (const n in SERVICES07) { SERVICES[n] = SERVICES[n] || []; for (const s of SERVICES07[n]) if (!SERVICES[n].some(o => o[0] === s[0])) SERVICES[n].splice(Math.max(0, SERVICES[n].length - (n === 'hunter' ? 1 : 0)), 0, s); }
for (const id of ['meat', 'wheat']) if (ITEMS[id]) ITEMS[id].desc += '也可以當魚餌（拿出釣竿時按互動鍵換餌）。';
