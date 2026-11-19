/* 0.8 數值總表（數值總監 X8＋X13 等級 20）。純資料：這個檔不匯入任何檔（core.js、data06.js、beastai08a／b、quest08、story08b、trial08 都從這裡拿數字）。
   要調數字改這裡就好；每一段的依據寫在 team/x8/報告.md 的「0.8 數值總表」。
   接法：core.js（等級表、MON 新野獸、ITEMS 新道具）｜data06.js（五階、牛角飾、蟒膽劑配方與效果、抵用素材）｜beastai08a／b（同一份 MON08，不再各寫一份）｜
         quest08.js（DROPS08、ELITE_DROPS08）｜story08b.js（NUM08B）｜trial08.js（百場連戰）｜num08.js（執行期：牛角飾、蟒膽劑、開球箱） */

/* ============================== 一、等級（上限 20） ============================== */
/* need[等級]＝從這一級升到下一級要的經驗。15→16＝34,000（和 14→15 一樣，照計畫）；16–19 照機器人在霜林、關前高地量到的打獵速度反推（一般玩家每級約 12.5 分）：75k／100k／135k／185k（計畫初值 54k／68k／85k／106k 太快：北境比 11–15 級的舊獵場密，又多是高一兩級的虎熊，每級只要 6–9 分） */
/* lvMin[級距]＝這個級距「只打同級野獸」平均每升一級幾分鐘（E1＝需求 ÷ 這個數）：前三格照數值定案07（52.3／5、49.9／5、50.7／4，和 0.7 一模一樣），第四格（16–20）照機器人量測 */
/* G1[等級]＝同級打獵一分鐘的金幣（含賣素材，一般玩家＝機器人÷1.5）；16–20 照機器人量測（雜訊大，單調化、取整到 5） */
export const LV08 = {
  cap: 20,
  need: [0, 100, 400, 900, 1300, 1800, 2700, 3900, 5500, 7300, 10000, 19000, 24000, 28000, 34000, 34000, 75000, 100000, 135000, 185000],
  lvMin: [52.3 / 5, 49.9 / 5, 50.7 / 4, 12.5],
  G1: [0, 15, 30, 45, 60, 80, 100, 110, 120, 125, 130, 135, 140, 145, 155, 165, 170, 175, 185, 195, 200]
};

/* ============================== 二、新野獸（core.js 的 MON 與 beastai08a／b 共用這一份） ============================== */
/* monStats：血、攻、經驗 × (1＋0.13×(等級−基準等級))，經驗再 × 1.25^(等級−1)。基準等級在 LV_BASE08 */
/* 猴（不主動打人、偷東西）：血 90 照使用者；經驗按血量比同級猛虎多一成五（爬樹、搖樹要時間） */
/* 箭豬：豎刺時打背後會反傷、要等收刺 → 每點血的經驗和猛虎差不多（0.13） */
/* 鱷魚：南湖 4–5 級新手保護：一次衝咬＋咬住拖滿 ≤ 4 級角色血量 35%（攻 20：最壞 5 級鱷魚咬 4 級角色約 17%、2 級角色約 27%、1 級約 37%；num 檢查在 tests/check_x8.mjs） */
/* 猩猩、岩羊：照 16、18、20 級機器人量測（報告第 3 節） */
const NB = (o) => o;
export const MON08 = {
  monkey: NB({ name: '雜耍猴', temper: 'troop', hp: 90, dmg: 12, exp: 14, speed: 6.8, aggro: 14, orbit: 3.5, pace: 1.0, atk: 'lunge', wind: 0.5, dash: 0, dashT: 0.3, recover: 0.6, hitR: 1.5, size: 1.1, body: 0.45, tagH: 1.9, gold: [2, 6], drops: [['meat', 0.25], ['berry', 0.35], ['scrap', 0.1]], moves: ['monkey_bite', 'monkey_tug'], orbs: ['dash', 'heal'] }),
  porc: NB({ name: '箭豬', temper: 'neutral', hp: 200, dmg: 16, exp: 26, speed: 4.2, aggro: 6, orbit: 3, pace: 1.2, atk: 'swipe', wind: 0.6, dash: 0, dashT: 0.3, recover: 0.8, hitR: 2.0, size: 0.95, body: 0.7, tagH: 1.6, gold: [5, 10], drops: [['meat', 0.5]], moves: ['porc_quill', 'porc_burst', 'porc_back'], orbs: ['wall', 'cleave'] }),
  croc: NB({ name: '鱷魚', temper: 'lurk', hp: 260, dmg: 20, exp: 28, speed: 4.4, aggro: 8, orbit: 3, pace: 1.1, atk: 'lunge', wind: 0.8, dash: 4, dashT: 0.35, recover: 0.9, hitR: 2.4, size: 1.2, body: 1.1, tagH: 1.4, gold: [5, 12], drops: [['meat', 0.3]], moves: ['croc_lunge', 'croc_grab', 'croc_snap'], orbs: ['cleave', 'wall'] }),
  ape: NB({ name: '猩猩', temper: 'territorial', hp: 1000, dmg: 55, exp: 55, speed: 5.4, aggro: 12, orbit: 3.0, pace: 1.5, terr: 14, warn: 3.0, atk: 'swipe', wind: 0.7, dash: 0, dashT: 0.25, recover: 0.9, hitR: 3.2, size: 1.3, body: 1.0, tagH: 2.1, gold: [10, 18], drops: [['meat', 0.6]], moves: ['ape_swat', 'ape_slam', 'ape_grab', 'ape_rock', 'ape_beat'], orbs: ['wall', 'cleave'] }),
  ibex: NB({ name: '岩羊', temper: 'timid', hp: 380, dmg: 42, exp: 50, speed: 8.2, aggro: 13, orbit: 6, atk: 'charge', wind: 0.55, dash: 8, dashT: 0.45, recover: 0.7, hitR: 1.8, size: 1.1, body: 0.55, tagH: 2.1, gold: [10, 18], drops: [['meat', 0.7]], moves: ['ibex_ram', 'ibex_butt'], orbs: ['dash', 'blade'] })
};
/* 16 級以上的經驗倍率（只動北境的新個體；1–15 級不變）：灰狼血少、一兩下就倒，量到 16 級打霜林的狼每分經驗是猛虎的兩倍多 */
export const EXP_HI08 = { lv: 16, k: { wolf: 0.5 } };
export const LV_BASE08 = { monkey: 8, porc: 6, croc: 4, ape: 16, ibex: 16 };
/* 小猩猩：血量、傷害、經驗、體型 對猩猩的倍率（體型 0.6 照美術）。一家＝1 大 2 小＝1.8 隻猩猩的血與經驗 */
export const YOUNG08 = { hp: 0.4, dmg: 0.5, exp: 0.4, size: 0.6 };

/* ============================== 三、掉落（quest08.js 的 lootExtra 讀這兩張；一般野獸原本的 drops 在 MON） ============================== */
/* [道具, 機率, 條件]：同一種寫兩筆會各擲一次。機率會乘幸運（quest08 目前 luck＝1） */
export const DROPS08 = {
  bison: [['horn', 0.25]], python: [['pyskin', 0.6]], dog: [['collar', 0.4, v => v.lv <= 15]],
  porc: [['quill', 0.5]], ape: [['pelt_ape', 0.4]], croc: [['pelt_croc', 0.5]], ibex: [['horn_ibex', 0.3]]
};
/* 菁英必掉（每次擊敗；戰利品與天賦球照 game.js 原本的規則另外給） */
export const ELITE_DROPS08 = {
  trophy_bison: [['horn', 2]], trophy_irontooth: [['collar', 3]], trophy_python: [['pgall', 1], ['pyskin', 3]],
  trophy_blackridge: [['tusk', 3]], trophy_whitecrest: [['antler', 1], ['pelt_deer', 3]], trophy_croc: [['pelt_croc', 4]],
  trophy_whiteback: [['pelt_ape', 2]], trophy_cliffhorn: [['horn_ibex', 2]], trophy_warden: [['ore_upper', 2]]
};
/* 猴群舊物（x04 進行中、身上沒有的那一樣）與獄卒犬鑰匙圈（s18 進行中、18 級以上的鬥犬、不到 3 個） */
export const QUEST_DROP08 = { troupe: 0.35, keyring: 0.5, keyLv: 18, pgallAgain: 0.4 };

/* ============================== 四、新道具（core.js 併進 ITEMS；txt8＝名字與說明照劇情 story08／08b 的 LORE，quest08 載入時補上） ============================== */
const T8 = (name, desc) => ({ name, glyph: '徽', color: '#c9b27a', desc, txt8: 1 });
export const ITEMS08 = {
  trophy_bison: T8('狂牛的斷角', '擊敗狂牛的證明。'), trophy_python: T8('大蟒的毒牙', '擊敗大蟒蛇的證明。'), trophy_irontooth: T8('鐵牙的項圈', '擊敗斷鍊・鐵牙的證明。'),
  trophy_blackridge: T8('黑脊的獠牙', '擊敗悍豬・黑脊的證明。'), trophy_whitecrest: T8('白冠的鹿角', '擊敗大公鹿・白冠的證明。'), trophy_croc: T8('巨鱷的鱗', '擊敗巨鱷的證明。'),
  trophy_whiteback: T8('白背的毛皮', '擊敗猩猩・白背的證明。'), trophy_warden: T8('半截舊鑰匙', '擊敗獄卒長的證明。'), trophy_cliffhorn: T8('斷崖角', '擊敗岩羊・斷崖角的證明。'),
  horn: { name: '牛角', glyph: '角', color: '#d8c79a', desc: '牛角飾的素材（2 支）。', sell: 12, txt8: 1 },
  pgall: { name: '蟒膽', glyph: '膽', color: '#3f6f52', desc: '蟒膽劑的材料。', txt8: 1 },
  pyskin: { name: '蟒皮', glyph: '皮', color: '#6f7d4a', desc: '鍛造素材。', sell: 20, txt8: 1 },
  collar: { name: '斷項圈', glyph: '圈', color: '#8a8f94', desc: '布蘿娜整備武器時，1 條抵 2 塊鐵礦石。', txt8: 1 },
  iron_collar: { name: '項圈鐵', glyph: '鐵', color: '#8a8f94', desc: '舊版的鐵條，現在不用做了：斷項圈在整備時直接抵鐵礦石。', txt8: 1 },
  ore_upper: { name: '上層鐵塊', glyph: '鐵', color: '#2f3d47', desc: '上一層的鐵。五階「三獸」的素材。', txt8: 1 },      /* 礦車上敲得到、不限數量 → 不給售價（否則按住 1.6 秒就能刷錢） */
  quill: { name: '箭豬刺', glyph: '刺', color: '#d9cfae', desc: '又長又直，硬度和獠牙差不多。布蘿娜整備武器、做獸飾時，1 根抵 1 個野豬獠牙。', sell: 6 },
  pelt_ape: { name: '猩猩毛皮', glyph: '皮', color: '#3a332c', desc: '又厚又長的毛皮。五階「三獸」的素材。', sell: 30 },
  pelt_croc: { name: '鱷魚皮', glyph: '皮', color: '#5d6b45', desc: '又厚又硬，背上一排鱗。布蘿娜整備武器、哈根縫披肩時，1 張抵 1 張狼皮。', sell: 10 },
  horn_ibex: { name: '岩羊角', glyph: '角', color: '#d6cbb0', desc: '大彎角的一截，紋路一圈一圈。布蘿娜做獸飾時，1 個抵 1 個鹿角。', sell: 25 },
  charm_horn: { name: '牛角飾', glyph: '飾', color: '#d8c79a', kind: 'charm', desc: '獸飾：被挑飛、擊倒、踉蹌而不能動的時間 −30%。武器二階起可以請布蘿娜裝上。', txt8: 1 },
  tonic_python: { name: '蟒膽劑', glyph: '劑', color: '#3f6f52', kind: 'tonic', desc: '野外 5 分鐘：掙脫要按的次數 −40%，被纏住、咬住、拖住的時間 −30%。藥劑同時只有一種生效。', sell: 10, txt8: 1 },
  chest_rare: { name: '稀有天賦球箱', glyph: '箱', color: '#c9a24a', desc: '打開會出現戰吼、震地踏、影步其中一顆。', txt8: 1 }
};

/* ============================== 五、武器五階「三獸」、獸飾、藥劑、抵用素材（data06.js 併進去） ============================== */
/* 五階：傷害 +36%（四階 +28%）；出示 11–15 級三隻菁英的戰利品（和四階「三名」出示 1–10 級三件同一個做法）；16 級左右做得出來 */
export const TIER5 = { name: '三獸', dmg: 0.36, fee: 1000, mats: { pelt_ape: 3, ore_upper: 6 }, half: { pelt_ape: 2, ore_upper: 3 }, show: ['trophy_bison', 'trophy_python', 'trophy_irontooth'] };
export const CHARMS08 = { charm_horn: { mats: { horn: 2 }, fx: { immob: 0.30 }, text: '不能動的時間 −30%' } };
export const RECIPES08 = { tonic_python: { st: 'brew', mats: { pgall: 1, herb_bleed: 2 }, fee: 15, src: { npc: 'apothecary', quest: 's10' } } };
export const USE08 = { tonic_python: { act: 0.8, combat: 1, slot: 'tonic', dur: 300, fx: { hold: 0.30, escape: 0.40 } } };
export const FX_TEXT08 = { hold: ['被纏咬拖住的時間', -1], escape: ['掙脫要按的次數', -1], immob: ['不能動的時間', -1] };
/* 抵用（武器整備、獸飾、披肩的素材不夠時，用這些補；[代號, 1 個抵幾個]）。鹿皮／狼皮的「pelt」另由 PELT_ANY 處理（鱷魚皮加進去） */
export const SUB08 = { pelt_wolf: [['pelt_croc', 1]], tusk: [['quill', 1]], antler: [['horn_ibex', 1]], ore_iron: [['collar', 2]] };

/* ============================== 六、菁英（照 0.6／0.8 規則：同種同級普通個體的血 ×6、傷害 ×1.45，data06.js ELITE；經驗第一次 ×6、之後 ×3） ============================== */
/* 這裡只放「數值卡」要用的對照（等級、護衛、目標時間）；招式倍率是 X4 的事。北境三隻的數值卡見報告 */
export const ELITE_CARD08 = {
  blackridge: { type: 'boar', lv: 5, guards: 0, solo: [1, 1.5] }, whitecrest: { type: 'deer', lv: 7, guards: 3, solo: [1.5, 2.5] }, bigcroc: { type: 'croc', lv: 11, guards: 0, solo: [2, 3] },
  whiteback: { type: 'ape', lv: 17, guards: 0, solo: [2.5, 3.5] }, cliffhorn: { type: 'ibex', lv: 17, guards: 0, solo: [2, 3] }, warden: { type: 'dog', lv: 19, guards: 2, solo: [2.5, 3.5] }
};

/* ============================== 七、任務與委託（story08b 的 NUM08B 讀這裡；算法見報告第 5 節與 tools/calc_x8.mjs） ============================== */
export const QUEST08B = {
  exp: { m15: 22000, m16: 33000, m17: 40000, m18: 55000, m19: 75000, x01: 1010, x02: 780, x03: 2820, x04: 7210, s16: 12000, s17: 15000, s18: 30000, s19: 18000, s20: 12000, s21: 35000, s22: 69000, s23: 33000, s24: 560, s25: 1700, s26: 4700 },
  gold: { m15: 400, m16: 340, m17: 350, m18: 360, m19: 360, x01: 470, x02: 380, x03: 790, x04: 940, s16: 200, s17: 200, s18: 200, s19: 200, s20: 200, s21: 530, s22: 610, s23: 490, s24: 170, s25: 270, s26: 360 },
  T: { x01: 6.5, x02: 7, x03: 8, x04: 8 }
};

/* ============================== 八、百場連戰（trial08.js 的 GAUNTLET 讀這裡）＋釣魚回衝 ============================== */
/* 第三級（建議 12–15 級）：前三波暖身、最後一波 14 級；兩人時每隻血量 ×1.7（兩個人打約 2 倍傷害 → 每人約 0.85 倍時間，和菁英的 +70%／人同一個比例） */
export const GAUNTLET08 = { duoHp: 1.7, list: [[['boar', 2, 8]], [['wolf', 3, 9]], [['wolf', 2, 10], ['boar', 1, 10]], [['bear', 1, 11]], [['tiger', 2, 12]], [['bear', 1, 12], ['tiger', 1, 12]], [['bison', 2, 13]], [['python', 1, 13]], [['dog', 3, 14]], [['bison', 1, 14], ['dog', 2, 14]]] };
/* 回衝：瞬間掉張力與回衝期間的拉扯，都不會把張力壓到 floor 以下（本來就比 floor 低的不動）→ 看到「線鬆了」再按收線來得及（slack 10、slackT 0.9） */
export const FISH_BACK08 = { floor: 13 };
