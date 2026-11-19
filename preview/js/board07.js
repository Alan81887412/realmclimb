// 0.7 委託板：「九十九場」酒館門口，板上永遠 3 張，做完或撕掉就補。規則照設計定案第 4 節與附錄 F，最後一節「使用者決定」優先。
// - 沒有任何計時：不存「今天」、沒有每日次數、沒有連續天數。三天沒上線，板上一樣是同樣 3 張。
// - 出卡：玩家等級 ±2，而且在同一個 5 級級距（1–5、6–10、11–15）；沒做過的優先；最近做過或撕掉的 5 張不重複；板上最多 1 張釣魚卡、1 張保底素材卡；同一種盡量不重複。
// - 已接的最多 3 張；撕掉、放棄都免費。做完回到板子交件（瑪歌代付）。組隊時隊友打倒的也算（60 公尺內）。
// - 獎勵用「同級打獵一分鐘」換算（E1／G1 表在 core.js 的 HUNT07，全遊戲只有那一份）。不給只有委託才拿得到的東西。
// 對外：init(ctx)／initUI(H)／update(dt)／near()／hint()／open()／kill(v, mine, party)／save(P)／load(P, d)；資料：CARDS、E1G1、reward(card)。
// 擺放：位置讀 w7-wild 的 places07.js 的 BOARD07（動態載入）。模型由 w7-wild 的 traps07.js 放（名字 'prop:board'）；場景裡 3 秒都沒有才自己放一個（美術的 makeProp07('board') 優先，沒有就用佔位模型），之後別人放了就拿掉自己的。
import * as THREE from './three.bundle.js';
import { ITEMS, MON, E1, G1, LV_CAP } from './core.js';
import { P, me, ui, input, Store, addItem, gainExp, Craft, qStatus } from './game.js';
import { W, Hgt, addCollider } from './world.js';
import { keyOf } from './keys.js';
import { NPCS, PLACES } from './story.js';
import { TRAP_TEXT } from './story07.js';
import { BOARD08 } from './story08.js';
import { BOARD08B } from './story08b.js';

/* ============================== 換算表 ============================== */
// E1／G1：同級打獵一分鐘的經驗／金幣（含賣素材）。表在 core.js 的 HUNT07（E1＝這一級的升級需求 ÷ 這個級距平均每級的分鐘數；G1＝實測金幣＋素材售價），這裡不再有第二份。
export const bandOf = lv => lv <= 5 ? 0 : lv <= 10 ? 1 : lv <= 15 ? 2 : 3;      /* x9：16–20 級是第四級距 */
/* X8：E1／G1 在 core.js 已經到 20 級（表在 data08.js 的 LV08），這裡不再外推 */
export const E1G1 = lv => { lv = Math.max(1, Math.min(LV_CAP, lv | 0)); return { e1: E1(lv), g1: G1(lv) }; };
// 魚的售價：data07.js 有就用道具表的 sell，沒有就用設計附錄 B 的價錢
const FISH_PRICE = { fish_crucian: 4, fish_startrout: 10, fish_catfish: 14, fish_loach: 20, fish_perch: 12, fish_carp: 12, fish_falltrout: 21, fish_stonecarp: 31, fish_frosttrout: 38 };      // 數值定案07 的魚價（和 data07.js 一樣）
const KIND = { hunt: '狩獵', mat: '保底素材', gather: '採集', cook: '下廚', deliver: '送貨', survey: '測繪', fish: '釣魚' };
// 卡片給的倍率（附錄 F）：狩獵另給經驗 0.19、金幣 0.25（數值定案07：經驗 0.25 時帶卡打怪的時間只有只打怪的七成，違反附錄 F 的八成；金幣不影響升級時間，維持 0.25）；保底素材另給 0.1 經驗＋指定素材；不打怪的給 0.9；釣魚：金幣＝max(0.9×T×G1, 售價×1.5)（和採集、送貨一樣是同樣時間打獵的九成，但不少於原本的 1.5 倍售價），經驗＝0.9×2×E1（釣魚本來就不給經驗，只給一點）
const K = { hunt: [0.19, 0.25], mat: [0.1, 0], gather: [0.9, 0.9], cook: [0.9, 0.9], deliver: [0.9, 0.9], survey: [0.9, 0.9] };

/* ============================== 委託卡（45 張，每個級距 14–16 張） ============================== */
// 送貨、測繪卡的 T（預估分鐘，數值定案07）＝ceil 到 0.5 的 (2×(板子到目標的直線距離−目標半徑)×1.4÷7.2 公尺/秒×1.5＋45 秒)÷60，最少 2；板子在 (−20.25, −11.85)。原本高估約兩倍
// id 存檔用，不要改｜kind 種類｜lv 卡片等級（出卡與獎勵都看它）｜T 預估分鐘｜by 貼卡的 NPC｜title 標題｜text 貼卡人的口吻｜done 交件時貼卡人留的話
// goal：kill { kill: 野獸, n, min: 最低等級, where: 說明 }｜give { give: { 道具: 數量 } }｜reach { reach: { x, z, r, name }, say: 到了的旁白 }
// req：quest（做完某任務）｜recipe（會做某配方）｜item（身上有某道具）。條件不符的卡不出
const R = (x, z, r, name) => ({ x, z, r, name });
export const CARDS = [
  /* ---------- 1–5 級 ---------- */
  { id: 'a0', kind: 'gather', lv: 1, T: 3, by: 'tavern', title: '野莓，一小籃', goal: { give: { berry: 5 } },
    text: '欸，新來的！幫我摘五顆野莓好不好？南門外的矮樹叢就有。我要做麥餅，客人在等。', done: '好紅！這幾顆我留著自己吃，別說出去。' },
  { id: 'a1', kind: 'hunt', lv: 1, T: 4, by: 'surveyor', title: '風車底下的野豬', goal: { kill: 'boar', n: 5, min: 1, where: '風吹草原' },
    text: '風車是我的基準點！野豬在底下拱土，萬一風車歪了怎麼辦？……好啦，應該不會歪。拜託趕走五隻。', done: '風車還是直的！我量過了。謝謝你。' },
  { id: 'a2', kind: 'hunt', lv: 3, T: 5, by: 'guard', title: '南門外的狼又多了', goal: { kill: 'wolf', n: 4, min: 2, where: '風吹草原外圍' },
    text: '報告：南門外的灰狼最近夜裡叫得很近。依規定我不能離開崗位，所以貼了這張。請打倒四隻。結伴更好，這是建議。', done: '報告！昨晚只聽到三聲狼嚎，比前天少十四聲。我有記。' },
  { id: 'a3', kind: 'hunt', lv: 5, T: 6, by: 'hunter', title: '河灣的狼', goal: { kill: 'wolf', n: 5, min: 4, where: '河灣草場、低語森林' },
    text: '……河灣草場的狼，今年多了一群。五隻。別多打。', done: '……五隻。剛好。呵。' },
  { id: 'a4', kind: 'mat', lv: 2, T: 5, by: 'smith', title: '我缺一對好獠牙', goal: { kill: 'boar', n: 4, min: 1, where: '風吹草原' }, item: 'tusk',
    text: '喂！我要一對像樣的野豬獠牙，打獠牙飾用的。四隻野豬，運氣差也沒關係，我這裡先墊一根給你。', done: '這根給你，你打到的自己留著。好牙不嫌多！' },
  { id: 'a5', kind: 'mat', lv: 5, T: 5, by: 'apothecary', title: '熊膽要新鮮的', goal: { kill: 'bear', n: 1, min: 4, where: '低語森林' }, item: 'gall',
    text: '熊膽劑的存貨見底了。請擊敗一頭棕熊。牠身上不一定有膽，所以我先備了一顆，事成給你。劑量請自己拿捏。', done: '辛苦了。這顆是說好的。傷口讓我看一下……嗯，只是擦傷。' },
  { id: 'a6', kind: 'gather', lv: 2, T: 4, by: 'apothecary', title: '止血草不夠了', goal: { give: { herb_bleed: 8 } },
    text: '止血草不夠了。八株，連根拔，別扯斷。葉緣有細鋸齒的那種。', done: '八株，根都完整。你的手越來越穩了。' },
  { id: 'a7', kind: 'gather', lv: 4, T: 4, by: 'hunter', title: '水芹，一把', goal: { give: { cress: 6 } },
    text: '……燉肉少了水芹，不對味。六把。水邊有。', done: '嗯。這個味道。……坐，喝口湯再走。' },
  { id: 'a8', kind: 'cook', lv: 2, T: 4, by: 'tavern', title: '幫我顧一下鍋', goal: { give: { food_skewer: 2 } }, req: { recipe: 'food_skewer' },
    text: '欸我跟你講，今天客人多到我手都不夠用！幫我烤兩份烤肉串交給我，大鍋借你。', done: '香！你烤的比我家那個幫工好吃，別跟他說。' },
  { id: 'a9', kind: 'cook', lv: 4, T: 5, by: 'guard', title: '夜哨的宵夜', goal: { give: { food_stew: 2 } }, req: { recipe: 'food_stew' },
    text: '報告：今晚輪我站夜哨。依規定不能離崗，所以……能不能幫我帶兩碗獵人燉肉？錢我照付。', done: '報告！燉肉還是熱的！隊長問起來，我就說是情報交換。' },
  { id: 'b1', kind: 'deliver', lv: 3, T: 2, by: 'smith', title: '把修好的刀送去給哈根', goal: { reach: R(-108, -12, 4.5, '獵人營地的哈根') }, say: '哈根接過刀，用拇指試了試刃口。「……布蘿娜的手藝。替我說一聲。」',
    text: '哈根那把剝皮刀崩了三個口，我修好了。他不進城，我不出城，你跑一趟。刀我包好了，接下就帶走。', done: '他說了什麼？……「替我說一聲」？那老頭，一個謝字都捨不得。' },
  { id: 'b2', kind: 'deliver', lv: 4, T: 3, by: 'merchant', title: '商隊的路標', goal: { reach: R(55, 190, 9, '鏡溪的木橋') }, say: '你把米洛刻的路標插在橋頭。上面寫著「鐵環城→北」，字歪歪的。',
    text: '老闆，商隊說鏡溪的木橋邊少了一塊路標。我刻了一塊新的，幫我插在橋頭。講真的，我自己不敢去。', done: '插好了？太好了！下一隊商隊就不會走到蘆葦澤裡去了。' },
  { id: 'b3', kind: 'survey', lv: 2, T: 2.5, by: 'surveyor', title: '鏡池的水位', goal: { reach: R(48, 122, 20, '鏡池') }, say: '鏡池的水面平得像鏡子，水位和岸邊的舊刻痕差不多。',
    text: '鏡池的水位，跟老圖上的對不對得上？走到水邊看一眼就好。……我是說，不用下水。', done: '差不多？太好了，那我的圖不用改。改圖很花墨的。' },
  { id: 'b4', kind: 'survey', lv: 5, T: 4, by: 'guard', title: '狼丘在哪裡', goal: { reach: R(-104, 281, 16, '狼丘') }, say: '一座長滿短草的小丘，地上滿是狼的腳印。這裡就是狼丘。',
    text: '報告：巡邏隊的紀錄裡，狼丘的位置寫著「大概在南邊」。依規定這樣不行。請替我確認狼丘在哪。', done: '報告！我已經把「大概在南邊」劃掉，改成「長灣西邊」。這是我上任以來最有成就感的一天。' },
  { id: 'b5', kind: 'fish', lv: 4, T: 4, by: 'apothecary', title: '苔鯰的鰾', goal: { give: { fish_catfish: 2 } }, req: { quest: 'f01' },
    text: '苔鯰的鰾可以入藥。請到低語潭釣兩尾給我。整尾就好，我自己取。', done: '很新鮮。鰾我留下，魚肉你要的話……不要？好，我拿去給瑪歌。' },
  { id: 'b6', kind: 'fish', lv: 5, T: 4, by: 'tavern', title: '今晚想煮魚', goal: { give: { fish_perch: 2 } }, req: { quest: 'f01' },
    text: '欸，今晚想煮魚湯！幫我弄兩尾河鱸，鏡溪或長灣都有。十二年沒煮過魚了，我手都在抖。', done: '這兩尾好肥！今晚的魚湯，第一碗給你留著。' },
  /* ---------- 6–10 級 ---------- */
  { id: 'c0', kind: 'survey', lv: 10, T: 3, by: 'keeper', title: '大門的絞盤', goal: { reach: R(0, -206, 14, '獸欄大門') }, say: '大門左右各一座絞盤，鐵鍊上的鏽是新的，像是最近有東西碰過。',
    text: '各位觀眾——咳。獸欄大門的兩座絞盤，還轉得動嗎？請替我去看一眼。不用轉，看就好。轉了會出事。', done: '鏽是新的？……那表示門後的那位，還醒著。這一句我記進簿子裡。' },
  { id: 'c1', kind: 'hunt', lv: 6, T: 5, by: 'hunter', title: '古木林的狼', goal: { kill: 'wolf', n: 5, min: 5, where: '古木林、河灣草場' },
    text: '古木林的狼，跟到採藥人的小屋門口了。五隻。牠們只是餓。可是不能讓牠們以為人是吃的。', done: '……嗯。牠們會記得。' },
  { id: 'c2', kind: 'hunt', lv: 8, T: 6, by: 'apothecary', title: '採藥人的路又不通了', goal: { kill: 'bear', n: 2, min: 7, where: '古木林' },
    text: '採藥人說，古木林又多了兩頭熊擋在路上。我不恨熊。可是藥要有人採。兩頭，請量力而為。', done: '路通了。採藥人說，下次採到好的熊徑蔘，第一株留給你。' },
  { id: 'c3', kind: 'hunt', lv: 10, T: 6, by: 'merchant', title: '採石場的虎', goal: { kill: 'tiger', n: 3, min: 9, where: '採石場與鹽臺' },
    text: '老闆，採石場的虎又把商隊嚇回來了。三頭。講真的，三頭就好，我不貪心。', done: '三頭！商隊的人說要請你喝酒。我說我請，反正也是他們的錢。' },
  { id: 'c4', kind: 'mat', lv: 7, T: 6, by: 'smith', title: '虎牙，要整顆的', goal: { kill: 'tiger', n: 3, min: 6, where: '斷牙峽谷' }, item: 'fang',
    text: '虎牙飾要整顆的虎牙，崩一角都不行。峽谷的虎打三頭，有沒有掉牙我都先給你一顆。', done: '這顆是說好的。你打到的要是也完整，拿來我給你打個好的！' },
  { id: 'c5', kind: 'gather', lv: 7, T: 5, by: 'apothecary', title: '低語苔與樹蔭菇', goal: { give: { moss: 4, mushroom: 3 } },
    text: '清神藥水的料快見底了。低語苔四片、樹蔭菇三朵。苔要整片，菇要帶柄。', done: '苔是整片的，菇也帶柄。很好。這是說好的酬勞，加一句醫囑：別空腹出城。' },
  { id: 'c6', kind: 'gather', lv: 9, T: 6, by: 'smith', title: '鐵礦石，越多越好', goal: { give: { ore_iron: 5 } }, req: { item: 'pickaxe' },
    text: '鐵礦石！越多越好——不對，五塊就好，我爐子塞不下。峽谷的岩壁上有鏽色的礦脈。', done: '這塊顏色好！我阿公說好鐵是會唱歌的，你聽——算了，你聽不到。' },
  { id: 'c7', kind: 'cook', lv: 6, T: 4, by: 'instructor', title: '場邊的肉乾', goal: { give: { food_jerky: 3 } }, req: { recipe: 'food_jerky' },
    text: '新來的們練到一半就餓。三份肉乾。別問我為什麼不自己做。', done: '……還行。' },
  { id: 'c8', kind: 'cook', lv: 8, T: 5, by: 'keeper', title: '開賽日的肉派', goal: { give: { food_pie: 2 } }, req: { recipe: 'food_pie' },
    text: '各位觀眾——咳。我想在看臺上辦個小小的紀念日。兩份厚皮肉派，瑪歌說她忙不過來。', done: '有請——厚皮肉派，登場！……咳。謝謝你。看臺很久沒有這麼香了。' },
  { id: 'd1', kind: 'deliver', lv: 7, T: 3, by: 'apothecary', title: '給採藥人小屋的藥箱', goal: { reach: R(-224.6, 27.4, 10, '採藥人小屋') }, say: '你把藥箱放在採藥人小屋的門邊。屋裡的人探頭說了聲謝謝，又縮回去了。',
    text: '採藥人小屋的藥箱該補了。繃帶、藥膏、兩瓶治療藥水。箱子我封好了，接下就帶走。路上有熊，請繞。', done: '他們說謝謝？好。下個月的藥箱，我會多放一卷繃帶。' },
  { id: 'd2', kind: 'deliver', lv: 10, T: 3.5, by: 'merchant', title: '岔路營地的包裹', goal: { reach: R(246.5, -105.6, 10, '岔路營地') }, say: '你把包裹放在岔路營地的火堆邊。一個商隊的人朝你揮了揮手。',
    text: '老闆，商隊在岔路營地等一包東西——一封信跟三瓶藥。講真的，路上有虎，我只付得起錢，付不起膽。', done: '送到了？商隊回信說「收到，下次走東門」。東門！他們要回來了！' },
  { id: 'd3', kind: 'survey', lv: 7, T: 3.5, by: 'surveyor', title: '古木林那棵巨木', goal: { reach: R(-268, 132, 18, '古木林') }, say: '一棵要好幾個人才抱得住的巨木還站著，樹根像一圈矮牆。',
    text: '老圖上，古木林正中央畫了一棵特別大的樹。三十年了，它還在嗎？走到樹下看一眼。', done: '還在！好，那我的圖上它可以繼續當基準點。巨木不會走路，我最喜歡了。' },
  { id: 'd4', kind: 'survey', lv: 9, T: 4, by: 'surveyor', title: '白鹽臺有多白', goal: { reach: R(271, 149, 18, '白鹽臺') }, say: '一層一層的白色臺地，陽光一照，亮得睜不開眼。',
    text: '老圖上寫著「白鹽臺，很白」。就這樣。誰寫的啊！請你去看一眼，回來告訴我到底多白。', done: '亮得睜不開眼？好，我寫上去：「很白，請瞇眼」。' },
  { id: 'd5', kind: 'fish', lv: 7, T: 5, by: 'tavern', title: '燻鱒要瀑紋鱒', goal: { give: { fish_falltrout: 2 } }, req: { quest: 'f01' },
    text: '我跟你講，哈根說燻鱒要用苔瀑潭的瀑紋鱒才夠味。兩尾！那裡有熊，你小心點。', done: '這紋路好漂亮。燻好了分你一塊，哈根那份我叫他自己來拿。' },
  { id: 'd6', kind: 'fish', lv: 10, T: 5, by: 'merchant', title: '坑湖的石鯉', goal: { give: { fish_stonecarp: 2 } }, req: { quest: 'f01' },
    text: '老闆，商隊的廚子說採石坑湖的石鯉，鱗硬肉甜。兩尾！我自己要吃的，講真的，不轉賣。', done: '真的好硬！這鱗……老闆，你確定這是魚不是石頭？' },
  /* ---------- 11–15 級 ---------- */
  { id: 'e0', kind: 'gather', lv: 15, T: 5, by: 'apothecary', title: '北邊的止血草', goal: { give: { herb_bleed: 10 } },
    text: '要去敲獸欄大門的人，一人至少帶五瓶藥。止血草十株，北邊長的比較苦，藥性也比較足。', done: '十株，夠調三瓶多。剩下的一株，留給下一個受傷的人。' },
  { id: 'e1', kind: 'hunt', lv: 12, T: 6, by: 'instructor', title: '北邊的虎', goal: { kill: 'tiger', n: 3, min: 12, where: '獸王巢穴外圍、獸欄兩翼' },
    text: '北門外的虎，最近敢走到荒徑一半。三頭。打完不用回來跟我講細節。', done: '三頭。……還行。' },
  { id: 'e2', kind: 'hunt', lv: 13, T: 6, by: 'hunter', title: '兩翼的熊', goal: { kill: 'bear', n: 3, min: 12, where: '獸欄兩翼、獸王巢穴外圍' },
    text: '獸欄兩翼的熊，是當年場子裡的。老了，脾氣更壞。三頭。……打完，讓牠們安靜。', done: '……安靜了。好。' },
  { id: 'e3', kind: 'mat', lv: 14, T: 5, by: 'apothecary', title: '十二級以上的熊膽', goal: { kill: 'bear', n: 2, min: 12, where: '獸欄兩翼、獸王巢穴外圍' }, item: 'gall',
    text: '北邊的老熊，膽的藥性最好。請擊敗兩頭十二級以上的。膽我先備了一顆給你，運氣好的話你會多一顆。', done: '這顆給你。北邊的熊很兇，你身上這道疤……坐下，我先處理。' },
  { id: 'e4', kind: 'gather', lv: 11, T: 5, by: 'apothecary', title: '牆根下的霜薄荷', goal: { give: { mint: 4 } },
    text: '提神茶要霜薄荷。獸欄兩翼的牆根下長得最好，四株。那裡的熊脾氣不好，劑量請自己拿捏。', done: '涼的。很好。這個季節能採到四株，你運氣不錯。' },
  { id: 'e5', kind: 'gather', lv: 13, T: 5, by: 'smith', title: '舊柵欄的鐵', goal: { give: { scrap: 4 } },
    text: '獸欄兩翼散了一堆舊鐵，是當年的柵欄。拿四件回來，我要看看我阿公那時候用的是什麼鐵。', done: '……這是我阿公的鐵。你看這個收口。他打的柵欄，十二年都沒鏽穿。' },
  { id: 'e6', kind: 'cook', lv: 12, T: 5, by: 'tavern', title: '不服氣的烤排', goal: { give: { food_steak: 2 } }, req: { recipe: 'food_steak' },
    text: '欸，商隊的廚子說岩鹽烤排是他的獨門。我不服氣，想吃吃看。兩份！做好拿來，我研究一下。', done: '……好吃。好吃到我很生氣。下禮拜我要做一道更好吃的。' },
  { id: 'e7', kind: 'cook', lv: 13, T: 5, by: 'instructor', title: '夜裡的提神茶', goal: { give: { drink_mint: 2 } }, req: { recipe: 'drink_mint' },
    text: '晚上站在場邊，冷。兩杯提神茶。……別跟瑪歌說我不喝酒了。', done: '……放著。我晚點喝。' },
  { id: 'f1', kind: 'deliver', lv: 11, T: 3.5, by: 'keeper', title: '馴獸師哨站的名冊', goal: { reach: R(-68.5, -266.5, 10, '馴獸師哨站') }, say: '你把巴索抄的名冊壓在哨站火堆邊的石頭下。第一頁寫著「馴獸師長」，名字被墨塗掉了。',
    text: '馴獸師哨站以前有一本名冊。我抄了一份，想放回原來的地方。請替我送去，壓在火堆邊的石頭下。', done: '放回去了？好。有些名字，得有人記得放在哪。' },
  { id: 'f2', kind: 'deliver', lv: 13, T: 3.5, by: 'smith', title: '運鐵坡道的鐵楔', goal: { reach: R(76, -276, 14, '運鐵坡道') }, say: '你把布蘿娜打的鐵楔敲進絞車的卡榫。坡道往上延伸，盡頭被落石堵住了。',
    text: '運鐵坡道的絞車少一根鐵楔。我打了一根，你幫我敲回去。說不定哪天，上面的鐵又會運下來。', done: '敲進去了？……好。等路通了，第一車鐵我要親自去接。' },
  { id: 'f3', kind: 'survey', lv: 12, T: 3.5, by: 'surveyor', title: '舊飼育場', goal: { reach: R(-120, -287, 16, '舊飼育場') }, say: '一排塌了一半的獸坑，坑底積著發綠的水。水面動了一下，又靜了。',
    text: '老圖上，獸欄西邊有一排飼育場。聽說現在積了水？去看一眼，告訴我水有多深——不對，不要量，看就好！', done: '水面動了一下？……我、我先在圖上畫個問號。很大的問號。' },
  { id: 'f4', kind: 'survey', lv: 14, T: 4, by: 'surveyor', title: '霜泉冷不冷', goal: { reach: R(147, -287, 12, '霜泉') }, say: '泉水冒著白氣，岸邊的石頭結著薄霜。四周卻一點冰也沒有。',
    text: '老圖上寫著霜泉「冬天也不結冰」，旁邊又寫「很冷」。到底哪個對？去看一眼——不用摸，真的不用摸。', done: '兩個都對？……好，我兩個都寫上去。老圖師也會吵架的。' },
  { id: 'f5', kind: 'fish', lv: 12, T: 6, by: 'tavern', title: '霜鱒，兩尾', goal: { give: { fish_frosttrout: 2 } }, req: { quest: 'f01' },
    text: '欸我跟你講，霜泉的霜鱒，商隊的人吹了一整晚。我要兩尾，煮給他們看什麼叫真的魚湯。', done: '冰的！還是冰的！今晚那群商隊的人，等著哭吧。' },
  { id: 'f6', kind: 'fish', lv: 14, T: 7, by: 'merchant', title: '給商隊的霜鱒', goal: { give: { fish_frosttrout: 3 } }, req: { quest: 'f01' },
    text: '老闆，商隊說上一層的人以前最愛霜泉的魚。三尾！我先存著，等路通了，這就是我的第一筆大買賣。', done: '三尾，冰的。講真的，我現在就開始算要賣上面的人多少錢了。' }
];
CARDS.push(...BOARD08.filter(c => !CARDS.some(x => x.id === c.id)), ...BOARD08B.filter(c => !CARDS.some(x => x.id === c.id)));      /* x9：0.8 的委託卡 */
const CBY = Object.fromEntries(CARDS.map(c => [c.id, c]));

/* ============================== 獎勵 ============================== */
const rn = v => v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5;
const fishPrice = id => (ITEMS[id] && ITEMS[id].sell) || FISH_PRICE[id] || 0;
export function reward(c) {
  const { e1, g1 } = E1G1(c.lv);
  if (c.kind === 'fish') { let g = 0; for (const id in c.goal.give) g += fishPrice(id) * c.goal.give[id]; return { exp: rn(0.9 * 2 * e1), gold: Math.max(rn(0.9 * c.T * g1), Math.round(g * 1.5)), items: {} }; }
  const k = K[c.kind] || [0, 0], items = {}; if (c.kind === 'mat' && c.item) items[c.item] = 1;
  return { exp: rn(k[0] * c.T * e1), gold: rn(k[1] * c.T * g1), items };
}

/* ============================== 狀態（存在 P.b7） ============================== */
// c 板上的 3 張｜a 已接的 [{ id, n 進度 }]｜d 做過的（不重複的代號）｜r 最近做過或撕掉的 5 張｜f 一次性的旗標（toby：托比的陷阱提醒說過了）
const blank = () => ({ c: [], a: [], d: [], r: [], f: {}, k: {} });      // k：做過的卡還要再完成幾張別的才會再出現（數值定案07：擋住撕卡洗同一張交件卡）
const COOL07 = 10;
const S = () => { if (!P.b7 || typeof P.b7 !== 'object') P.b7 = blank(); return P.b7; };
export function save(Pl) { const s = (Pl || P).b7; if (!s) return undefined; return { c: s.c.slice(), a: s.a.map(x => [x.id, x.n | 0]), d: s.d.slice(), r: s.r.slice(), f: Object.assign({}, s.f), k: Object.assign({}, s.k || {}) }; }
export function load(Pl, d) {
  const s = blank(); (Pl || P).b7 = s; readySeen.clear(); if (!d || typeof d !== 'object') return;
  const ok = id => typeof id === 'string' && CBY[id];
  if (Array.isArray(d.a)) for (const x of d.a) { if (Array.isArray(x) && ok(x[0]) && !s.a.some(y => y.id === x[0]) && s.a.length < 3) s.a.push({ id: x[0], n: Math.max(0, Math.min(99, x[1] | 0)) }); }
  if (Array.isArray(d.c)) s.c = [...new Set(d.c.filter(ok))].filter(id => !s.a.some(y => y.id === id)).slice(0, 3);
  if (Array.isArray(d.d)) s.d = [...new Set(d.d.filter(ok))];
  if (Array.isArray(d.r)) { s.r = d.r.filter(ok).slice(-5); }
  if (d.k && typeof d.k === 'object') for (const id in d.k) { const n = d.k[id] | 0; if (ok(id) && n > 0) s.k[id] = Math.min(COOL07, n); }
  if (d.f && typeof d.f === 'object') for (const k in d.f) if (k.length < 12 && d.f[k]) s.f[k] = 1;
  for (const x of s.a) if (isDone(x)) readySeen.add(x.id);
  syncCards();
}
const dirty = () => { Store.dirty = true; ui.dirty = true; if (H && isOpen()) render(); };

/* ============================== 出卡 ============================== */
function reqOk(c) {
  const q = c.req; if (!q) return true;
  if (q.quest && qStatus(q.quest) !== 'done') return false;
  if (q.recipe && !(Craft.knows && Craft.knows(q.recipe))) return false;
  if (q.item && !(P.inv[q.item] > 0)) return false;
  if (c.kind === 'fish' || c.kind === 'cook' || c.kind === 'gather') for (const id in c.goal.give) if (!ITEMS[id]) return false;      // 道具表裡還沒有這種東西（例如 data07.js 還沒合併）：不出
  if (c.item && !ITEMS[c.item]) return false;
  return true;
}
const fits = (c, lv) => bandOf(c.lv) === bandOf(lv) && Math.abs(c.lv - lv) <= 2;
export function eligible(c, lv = P.lv) { return fits(c, lv) && reqOk(c); }
// 依序放寬：①等級 ±2、不在最近 5 張 ②允許最近 5 張 ③整個級距。每一輪裡「沒做過的」優先、板上沒有的種類優先
function pick() {
  const s = S(), lv = P.lv, taken = new Set([...s.c, ...s.a.map(x => x.id)]), onBoard = s.c.map(id => CBY[id]);
  const nFish = onBoard.filter(c => c.kind === 'fish').length, nMat = onBoard.filter(c => c.kind === 'mat').length, kinds = new Set(onBoard.map(c => c.kind));
  const base = CARDS.filter(c => !taken.has(c.id) && reqOk(c) && !(c.kind === 'fish' && nFish) && !(c.kind === 'mat' && nMat));
  const cool = c => s.k && s.k[c.id] > 0;      // 做過、還在冷卻的卡：前三輪都不抽，第四輪（整個級距都在冷卻）才補
  const rounds = [c => fits(c, lv) && !s.r.includes(c.id) && !cool(c), c => fits(c, lv) && !cool(c), c => bandOf(c.lv) === bandOf(lv) && !cool(c), c => bandOf(c.lv) === bandOf(lv)];
  for (const r of rounds) {
    let pool = base.filter(r); if (!pool.length) continue;
    { const rk = c => s.r.indexOf(c.id), lo = Math.min(...pool.map(rk)); pool = pool.filter(c => rk(c) === lo); }      // 放寬到「最近 5 張」時，先挑最久以前的（剛撕掉的那張最後才會回來）
    const fresh = pool.filter(c => !s.d.includes(c.id)); if (fresh.length) pool = fresh;
    const nk = pool.filter(c => !kinds.has(c.kind)); if (nk.length) pool = nk;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  return null;
}
export function fill() {
  const s = S(); let ch = false;
  s.c = s.c.filter(id => { const c = CBY[id]; if (c && eligible(c)) return true; ch = true; return false; });      // 等級變了、條件不符的卡換掉（不扣東西）
  while (s.c.length < 3) { const id = pick(); if (!id) break; s.c.push(id); ch = true; }
  if (ch) dirty(); syncCards(); return s.c;
}

/* ============================== 進度 ============================== */
const readySeen = new Set();
const goalN = c => c.goal.kill ? c.goal.n : c.goal.reach ? 1 : 0;
export function progress(x) {      // [目前, 需要, 說明]
  const c = CBY[x.id]; if (!c) return [0, 1, ''];
  if (c.goal.give) { let have = 0, need = 0; const parts = []; for (const id in c.goal.give) { const n = c.goal.give[id], h = Math.min(n, P.inv[id] || 0); have += h; need += n; parts.push(`${(ITEMS[id] || {}).name || id} ${h} / ${n}`); } return [have, need, parts.join('、')]; }
  if (c.goal.kill) return [Math.min(x.n, c.goal.n), c.goal.n, `擊敗${MON[c.goal.kill].name}${c.goal.min > 1 ? `（${c.goal.min} 級以上）` : ''} ${Math.min(x.n, c.goal.n)} / ${c.goal.n}`];
  return [Math.min(x.n, 1), 1, x.n ? `到過${c.goal.reach.name}了` : `走到${c.goal.reach.name}`];
}
export const isDone = x => { const p = progress(x); return p[0] >= p[1]; };
function goalText(c) {
  if (c.goal.kill) return `擊敗${MON[c.goal.kill].name}×${c.goal.n}${c.goal.min > 1 ? `（${c.goal.min} 級以上）` : ''}・${c.goal.where}`;
  if (c.goal.give) return '交' + Object.entries(c.goal.give).map(([id, n]) => `${(ITEMS[id] || {}).name || id}×${n}`).join('、');
  return (c.kind === 'deliver' ? '送到' : '走到') + c.goal.reach.name;
}
function readyCheck(quiet) {
  for (const x of S().a) { const d = isDone(x); if (d && !readySeen.has(x.id)) { readySeen.add(x.id); if (!quiet) { ui.toast(`委託「${CBY[x.id].title}」完成了，回酒館門口的委託板交件。`); ui.sfx('quest', 'ready'); } } else if (!d) readySeen.delete(x.id); }
}
// 擊殺：mine 自己有打到｜party 隊友打到、而且在 60 公尺內：布林值，或 game.js 補丁傳進來的判斷函式（隊友的傷害紀錄可能比野獸倒下晚一點同步到，所以 2 秒內每 0.25 秒再看一次）
const pendKill = [];
export function kill(v, mine, party) {
  if (!v) return;
  if (!mine && typeof party === 'function') { let p = false; try { p = !!party(); } catch (e) {} if (!p) { if (S().a.some(x => CBY[x.id] && CBY[x.id].goal.kill === v.type)) pendKill.push({ v: { type: v.type, lv: v.lv }, fn: party, t: 3.5 });      /* d7-play：隊友的傷害晚一點才同步到（主控端一擊打倒時要等下一份 presence） */ return; } party = true; }
  if (!(mine || party)) return; let ch = false;
  for (const x of S().a) { const c = CBY[x.id]; if (!c || !c.goal.kill || c.goal.kill !== v.type || (v.lv | 0) < c.goal.min || x.n >= c.goal.n) continue; x.n++; ch = true; ui.log(`委託「${c.title}」：擊敗${MON[c.goal.kill].name} ${x.n} / ${c.goal.n}${mine ? '' : '（隊友）'}`); }
  if (ch) { readyCheck(); dirty(); }
}

/* ============================== 委託板的位置與模型 ============================== */
// 位置：w7-wild 的 places07.js 的 BOARD07 = { x, z, f, r, use }（動態載入；載不到就用這裡的預設值，和 BOARD07 一樣）。
// 模型：w7-wild 的 traps07.js 會把美術的 makeProp07('board') 放進場景（名字 'prop:board'）。場景裡一直沒有，才由這裡放一個（美術的有就用美術的，再沒有就用下面的佔位模型）；之後別人放了，這裡的就拿掉
const spot = { x: -20.25, z: -11.85, f: 1.04, r: 0.9, use: 2.4 };
let tobyT = 0, ic07 = null, C = null, H = null, mesh = null, own = false, col = null, scanT = 0, farT = 0, zonePrev = 'town', winEl = null, winSig = '', modelT = 3, makeArt = null;
export const getSpot = () => ({ ...spot });
export function setSpot(x, z, f, r, use) { spot.x = x; spot.z = z; spot.f = f != null ? f : Math.atan2(-x, -z); if (r) spot.r = r; if (use) spot.use = use; if (col) { col.x = x; col.z = z; col.r = spot.r; } if (mesh && own) place(mesh); }
function place(m) { m.position.set(spot.x, Hgt(spot.x, spot.z), spot.z); m.rotation.y = spot.f; }
// 佔位模型：Q 版的布告板（兩根粗木柱、紅瓦小屋頂、板面三張羊皮紙卡、黃銅圖釘），和城裡的紅瓦屋頂同色系
function makeBoardMesh() {
  const g = new THREE.Group(), M = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, emissive: e || 0x000000 });
  const wood = M(0x95603a), dark = M(0x5c3920), roof = M(0xa83e2c), roofD = M(0x7a2a1e), paper = M(0xf3e6c4, 0x2b2416), paper2 = M(0xeedcae, 0x2b2416), ink = M(0x3a2a1c), pin = new THREE.MeshStandardMaterial({ color: 0xd8b25e, roughness: 0.35, metalness: 0.6, emissive: 0x1a1206 });
  const box = (w, h, d, m, x, y, z, rz = 0, par = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = true; o.receiveShadow = true; par.add(o); return o; };
  for (const sx of [-0.95, 0.95]) { box(0.24, 2.55, 0.24, wood, sx, 1.27, 0); box(0.34, 0.18, 0.34, dark, sx, 0.09, 0); }      // 粗木柱與柱腳
  box(2.05, 1.25, 0.12, wood, 0, 1.55, 0); box(2.2, 0.12, 0.2, dark, 0, 2.2, 0); box(2.2, 0.12, 0.2, dark, 0, 0.9, 0);      // 板面與上下框
  // 屋頂：兩片紅瓦斜板＋屋脊
  for (const k of [-1, 1]) { const r = box(1.28, 0.1, 0.7, roof, k * 0.58, 2.62, 0, -k * 0.42); box(1.28, 0.04, 0.72, roofD, 0, -0.06, 0, 0, r); }
  box(0.16, 0.16, 0.74, roofD, 0, 2.9, 0);
  // 橫匾「委託」：畫在小木板上的字（沒有中文字型的環境就只剩木板）
  { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const c = cv.getContext('2d'); c.fillStyle = '#5c3920'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#3b2412'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 90); c.fillStyle = '#f2d58a'; c.font = 'bold 60px "Noto Serif TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('委　託', 128, 52);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; const sign = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 0.06), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8, emissive: 0x150d06 }), dark]); sign.position.set(0, 2.42, 0.1); sign.castShadow = true; g.add(sign); }
  // 三張委託卡（羊皮紙、黃銅圖釘、字跡）
  [[-0.6, 1.56, 0.06], [0.02, 1.5, -0.05], [0.62, 1.58, 0.04]].forEach(([x, y, rz], i) => {
    const p = box(0.5, 0.64, 0.02, i === 1 ? paper2 : paper, x, y, 0.075, rz);
    for (let k = 0; k < 4; k++) box(k ? 0.34 - (k % 2) * 0.08 : 0.24, k ? 0.025 : 0.045, 0.006, ink, 0, 0.18 - k * 0.11, 0.012, 0, p);
    const pn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pin); pn.position.set(0, 0.27, 0.03); p.add(pn);
  });
  g.userData.board7 = true; g.name = 'board7:placeholder'; return g;
}
export function init(ctx) {
  C = ctx || null;
  for (const id in FALLBACK) if (!ITEMS[id]) { ITEMS[id] = FALLBACK[id]; console.info('[board07] 道具表還沒有', id, '，先用委託板的暫代資料（data07.js 合併後會被蓋過）'); }
  import('./places07.js').then(m => {
    const b = m && m.BOARD07; if (b && isFinite(b.x) && isFinite(b.z)) setSpot(b.x, b.z, b.f, b.r, b.use);
    if (m && m.PLACES07) for (const id in m.PLACES07) { const q = m.PLACES07[id]; if (PLACES[id]) Object.assign(PLACES[id], { x: q.x, z: q.z, r: q.r || PLACES[id].r }); else PLACES[id] = q; }      // 任務的地點（f03 的空地、f04 的繪圖桌）用場景成員的座標
  }).catch(() => {});
  import('./props07.js').then(m => { if (m && m.makeProp07 && (!m.has07 || m.has07('board'))) makeArt = m.makeProp07; }).catch(() => {});
}
// 每幀（update 裡）：別人放的委託板模型優先；3 秒後場景裡還沒有就自己放一個
let modelCk = 0, modelAge = 0;
// 找別人放的委託板：名字 'prop:board' 的最外層（美術的模型裡面那塊網格也叫 'prop:board'，所以跳過父物件同名的，也跳過自己放的那一棵）
const findBoard = o => { if (own && o === mesh) return null; if (o.name === 'prop:board' && !(o.parent && o.parent.name === 'prop:board')) return o; for (const c of o.children) { const r = findBoard(c); if (r) return r; } return null; };
function modelTick(dt) {
  if (!W.scene) return; modelCk -= dt; if (modelCk > 0) return; modelCk = 1; modelT -= 1; modelAge += 1;
  if (mesh && !own && mesh.parent) return;      // 已經在用別人放的
  const other = modelAge <= 90 ? findBoard(W.scene) : null;      // 開場 90 秒內一秒找一次就好
  if (other) { if (mesh && own) { W.scene.remove(mesh); if (col) col.r = 0; } mesh = other; own = false; syncCards(); return; }
  if (mesh || modelT > 0) return;
  mesh = makeArt ? makeArt('board', { cards: 3 }) : null; if (mesh) mesh.name = 'board7:art'; else mesh = makeBoardMesh(); own = true; place(mesh); W.scene.add(mesh); col = addCollider(spot.x, spot.z, spot.r, 3); syncCards();
}
// 暫代的道具資料：f01–f04 要給的東西。data07.js（w7-fish 合併）有了就不會用到
const FALLBACK = {
  rod_1: { name: '竹釣竿', glyph: '竿', color: '#a8894e', kind: 'tool', desc: '哈根用竹子削的。不會壞。', once: 1, max: 1 },
  map_blank: { name: '空白地圖', glyph: '圖', color: '#cdb98a', kind: 'tool', desc: '畫一區用。', buy: 20, max: 99 },
  orb_survey: { name: '天賦球：測繪', glyph: '測', color: '#8a7a4e', kind: 'passive', desc: '被動：記錄範圍大五成、陷阱 10 公尺外就看得到、畫圖不用等。', passive: 'survey', req: { int: 10, luk: 10 } }
};
// 板子上畫幾張卡：跟著自己板上的卡（永遠 3 張；舊存檔還沒打開過板子時也畫 3 張）
function syncCards() { if (mesh && mesh.userData && typeof mesh.userData.setCards === 'function') { const n = (P.b7 && P.b7.c && P.b7.c.length) || 3; if (mesh.userData.nCards !== n) { mesh.userData.nCards = n; mesh.userData.setCards(n); } } }
export const near = r => me.alive && !input.talk && Math.hypot(spot.x - me.x, spot.z - me.z) < (r || spot.use);
export function hint() { if (isOpen()) return ''; const n = S().a.filter(isDone).length; return `按 ${keyOf('interact')} 看委託板` + (n ? `（${n} 張可以交件）` : ''); }

/* ============================== 每幀 ============================== */
export function update(dt) {
  if (!P || !me) return; modelTick(dt);
  for (let i = pendKill.length - 1; i >= 0; i--) { const k = pendKill[i]; k.t -= dt; k.w = (k.w || 0) - dt; if (k.w > 0) continue; k.w = 0.25; let p = false; try { p = !!k.fn(); } catch (e) {} if (p) { pendKill.splice(i, 1); kill(k.v, false, true); } else if (k.t <= 0) pendKill.splice(i, 1); }
  scanT -= dt; if (scanT <= 0) {
    scanT = 0.3; const s = S();
    for (const x of s.a) { const c = CBY[x.id]; if (!c || !c.goal.reach || x.n >= 1) continue; const g = c.goal.reach; if (me.alive && Math.hypot(me.x - g.x, me.z - g.z) < g.r) { x.n = 1; if (c.say) ui.narrate([c.say]); ui.log(`委託「${c.title}」：${c.kind === 'deliver' ? '送到' : '到過'}${g.name}了`); dirty(); } }
    readyCheck();
    // 托比的陷阱提醒：0.7 之後第一次出南門、而且 2 級以上時說一次。w7-wild 的 traps07.js 也會講（托比頭上冒字＋聊天框，旗標 P.trapToby）；
    // 這裡是備援：條件成立後等 1.5 秒，traps07 已經講過（P.trapToby）就不講，只記旗標
    const z = me.zone || 'town';
    if (!s.f.toby && tobyT <= 0 && P.lv >= 2 && zonePrev === 'town' && z !== 'town' && me.z > 28 && Math.abs(me.x) < 16) tobyT = 1.5;
    if (tobyT > 0) { tobyT -= 0.3; if (tobyT <= 0) { s.f.toby = 1; Store.dirty = true; if (!P.trapToby) { P.trapToby = 1; ui.narrate(TRAP_TEXT.toby.map(t => `托比：「${t}」`)); ui.sfx('quest', 'found'); } } }
    zonePrev = z;
  }
  if (winEl && !winEl.hidden) { farT -= dt; if (farT <= 0) { farT = 0.25; if (Math.hypot(spot.x - me.x, spot.z - me.z) > 6 || !me.alive) close(); else { const sig = P.gold + '|' + S().a.map(x => progress(x)[2]).join('|'); if (sig !== winSig) render(); } } }      // 開著的時候背包或金幣變了就重畫
}

/* ============================== 操作 ============================== */
export function accept(id) {
  const s = S(), c = CBY[id]; if (!c || !s.c.includes(id)) return false;
  if (s.a.length >= 3) { ui.toast('最多同時接 3 張委託。先交件、或放棄一張。'); ui.sfx('deny'); return false; }
  s.c = s.c.filter(x => x !== id); s.a.push({ id, n: 0 }); fill(); ui.log(`接下委託「${c.title}」（${NPCS[c.by].name}）：${goalText(c)}。`); ui.sfx('quest', 'accept'); readyCheck(true); dirty(); return true;
}
export function tear(id) {
  const s = S(); if (!s.c.includes(id)) return false;
  s.c = s.c.filter(x => x !== id); s.r = s.r.filter(x => x !== id).concat(id).slice(-5); fill(); ui.sfx('page', 0, { tag: 'tear' }); dirty(); return true;
}
export function abandon(id) {
  const s = S(), c = CBY[id]; if (!s.a.some(x => x.id === id)) return false;
  s.a = s.a.filter(x => x.id !== id); s.r = s.r.filter(x => x !== id).concat(id).slice(-5); readySeen.delete(id); if (c) ui.log(`放棄了委託「${c.title}」。`); ui.sfx('page', 0, { tag: 'tear' }); dirty(); return true;
}
export function turnIn(id) {
  const s = S(), x = s.a.find(y => y.id === id), c = CBY[id]; if (!x || !c) return null;
  if (!isDone(x)) { ui.toast('這張委託還沒做完。'); ui.sfx('deny'); return null; }
  if (c.goal.give) for (const it in c.goal.give) { P.inv[it] -= c.goal.give[it]; if (P.inv[it] <= 0) delete P.inv[it]; }
  const R = reward(c), got = [], icons = [];
  if (R.gold) { P.gold += R.gold; got.push(R.gold + ' 金幣'); icons.push('gold'); }
  for (const it in R.items) { addItem(it, R.items[it]); got.push((ITEMS[it] || {}).name + ' ×' + R.items[it]); icons.push(it); }
  s.a = s.a.filter(y => y.id !== id); readySeen.delete(id); if (!s.d.includes(id)) { s.d.push(id); } s.r = s.r.filter(y => y !== id).concat(id).slice(-5); if (!s.k) s.k = {}; for (const k in s.k) if (--s.k[k] <= 0) delete s.k[k]; s.k[id] = COOL07;
  ui.loot(`委託「${c.title}」完成` + (got.length ? '：' + got.join('、') : ''), icons); ui.log(`交件：委託「${c.title}」。`); ui.sfx('quest', 'done', { tag: 'board' });
  if (R.exp) gainExp(R.exp, me.x, me.z);
  last = { id, line: c.done }; fill(); dirty(); return { got, exp: R.exp };
}
let last = null;
export const deco = {};      // 0.7 介面（d7-ui-b）：deco.render(winEl, 板子的狀態) 在 render() 結尾呼叫

/* ============================== 視窗 ============================== */
const isOpen = () => !!winEl && !winEl.hidden;
export function initUI(h) {
  H = h; if (!H || !H.$) return; if (document.getElementById('winBoard7')) { winEl = document.getElementById('winBoard7'); return; }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  winEl = document.createElement('section'); winEl.className = 'win'; winEl.id = 'winBoard7'; winEl.hidden = true;
  winEl.innerHTML = '<header><h2>委託板<small>九十九場</small></h2><span class="hgold" title="你的金幣"><span class="ic bare" data-ic="gold"></span><b id="b7gold">0</b></span><button class="x" data-close>×</button></header><div class="body"><p class="b7rule">接走或撕掉就補一張。沒有期限，也沒有次數。做完回這裡交件，瑪歌代付。</p><div class="b7cards" id="b7cards"></div><h3 id="b7accH">已接的委託</h3><div id="b7acc"></div><p class="b7last" id="b7last" hidden></p></div>';
  document.body.appendChild(winEl);
  import('./icons07.js').then(m => { if (m && m.icon07) { ic07 = m; if (isOpen()) render(); } }).catch(() => {});
  if (H.WINS) H.WINS.board7 = 'winBoard7';      // 掛進 ui.js 的視窗表：Esc、×、拖動、滑鼠解鎖都照一般視窗
  try { winEl.querySelector('[data-ic="gold"]').replaceWith(H.ic('gold', 'bare')); } catch (e) {}
}
export function open() {
  if (!winEl) { ui.toast('委託板：' + S().c.map(id => CBY[id].title).join('、')); return; }
  fill(); last = null; render();
  if (H && H.setWin && H.WINS && H.WINS.board7) H.setWin('board7', true); else { winEl.hidden = false; ui.sfx('win', 'open'); try { document.exitPointerLock(); } catch (e) {} }      // setWin 自己會出開窗的聲音
}
export function close() { if (!winEl || winEl.hidden) return; if (H && H.setWin && H.WINS && H.WINS.board7) H.setWin('board7', false); else winEl.hidden = true; }
const kindIcon = k => { const id = 'card_' + (k === 'mat' ? 'hunt' : k), u = ic07 && ic07.has07(id) ? ic07.icon07(id, 32) : null; if (!u) return null; const im = new Image(); im.src = u; im.alt = ''; im.className = 'b7ki'; return im; };
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const icon = (id, cls) => { try { return H && H.ic ? H.ic(id, cls) : el('span'); } catch (e) { return el('span'); } };
function rewardRow(c) {
  const R = reward(c), row = el('div', 'b7rw');
  if (R.exp) row.append(el('span', 'b7exp', `經驗 ${R.exp}`));
  if (R.gold) { const g = el('span', 'b7g'); g.append(icon('gold', 'bare'), String(R.gold)); row.append(g); }
  for (const it in R.items) { const g = el('span', 'b7it'); g.append(icon(it, 'bare'), `${(ITEMS[it] || {}).name || it}×${R.items[it]}`); row.append(g); }
  if (c.kind === 'hunt' || c.kind === 'mat') row.append(el('span', 'b7note', '＋擊殺照常'));
  return row;
}
function render() {
  if (!winEl) return; const s = S(), $ = id => winEl.querySelector('#' + id); winSig = P.gold + '|' + s.a.map(x => progress(x)[2]).join('|');
  $('b7gold').textContent = P.gold;
  const box = $('b7cards'); box.textContent = '';
  s.c.forEach((id, i) => {
    const c = CBY[id], card = el('div', 'b7card k-' + c.kind); card.style.setProperty('--tilt', [-1.2, 0.7, -0.4][i] + 'deg');
    const top = el('div', 'b7top'), kb = el('span', 'b7kind', KIND[c.kind]), ki = kindIcon(c.kind); if (ki) kb.prepend(ki); top.append(kb, el('span', 'b7lv', `Lv ${c.lv}`)); card.append(top);
    card.append(el('b', 'b7title', c.title), el('div', 'b7by', `${NPCS[c.by].title} ${NPCS[c.by].name}`), el('p', 'b7text', c.text), el('div', 'b7goal', goalText(c)), rewardRow(c));
    const bt = el('div', 'b7btns'), a = el('button', 'go', '接下'), t = el('button', 'quiet', '撕掉');
    if (s.a.length >= 3) { a.disabled = true; a.title = '已接 3 張'; }
    a.onclick = e => { e.stopPropagation(); accept(id); }; t.onclick = e => { e.stopPropagation(); tear(id); }; bt.append(a, t); card.append(bt); box.append(card);
  });
  if (!s.c.length) box.append(el('p', 'b7empty', '板上暫時沒有適合你的委託。'));
  $('b7accH').textContent = `已接的委託（${s.a.length} / 3）`;
  const acc = $('b7acc'); acc.textContent = '';
  if (!s.a.length) acc.append(el('p', 'b7empty', '還沒接。挑一張順路的吧。'));
  for (const x of s.a) {
    const c = CBY[x.id]; if (!c) continue; const p = progress(x), done = p[0] >= p[1], row = el('div', 'b7row' + (done ? ' ready' : ''));
    const info = el('div', 'b7ri'), tl = el('b', '', c.title), ki = kindIcon(c.kind); if (ki) tl.prepend(ki); info.append(tl, el('span', 'b7who', `${NPCS[c.by].name}・${KIND[c.kind]}`), el('span', 'b7prog', done ? '完成，可以交件' : p[2])); row.append(info, rewardRow(c));
    const bt = el('div', 'b7btns'), tb = el('button', done ? 'go' : '', '交件'), ab = el('button', 'quiet', '放棄'); tb.disabled = !done;
    tb.onclick = e => { e.stopPropagation(); turnIn(x.id); }; ab.onclick = e => { e.stopPropagation(); abandon(x.id); }; bt.append(tb, ab); row.append(bt); acc.append(row);
  }
  const L = $('b7last'); if (last && CBY[last.id]) { const c = CBY[last.id]; L.hidden = false; L.textContent = `${NPCS[c.by].name}留了一句話：「${last.line}」`; } else L.hidden = true;
  if (deco.render) deco.render(winEl, s);
}
const CSS = `
#winBoard7{left:max(16px,calc(50vw - 330px));top:50%;transform:translateY(-50%);width:660px;max-width:calc(100vw - 32px)}
#winBoard7 header h2 small{margin-left:10px;font-size:12px;letter-spacing:.06em;color:var(--ink-dim);font-family:inherit}
#winBoard7 .hgold{display:flex;align-items:center;gap:4px;font-size:13px}#winBoard7 .hgold .ic{width:16px;height:16px}
#winBoard7 .body{padding:8px 14px 12px;overflow:auto}
#winBoard7 .b7rule{margin:0 0 8px;font-size:12px;color:var(--ink-dim)}
#winBoard7 h3{margin:10px 0 6px;font-size:13px;letter-spacing:.08em;color:var(--brass,#c9a35a)}
.b7cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 2px 2px;background:linear-gradient(#6b4a2c,#5a3d24);border:1px solid #3b2716;border-radius:6px;padding:10px}
.b7card{position:relative;display:flex;flex-direction:column;gap:3px;padding:12px 10px 9px;background:#efe2c0;color:#2e2216;border-radius:2px;box-shadow:0 3px 8px rgba(0,0,0,.45);transform:rotate(var(--tilt,0deg));min-height:0}
.b7card::before{content:'';position:absolute;top:4px;left:50%;width:9px;height:9px;margin-left:-4px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f7dc9a,#a87a2c);box-shadow:0 1px 2px rgba(0,0,0,.5)}
.b7top{display:flex;justify-content:space-between;align-items:center;font-size:11px}
.b7kind{display:inline-flex;align-items:center;gap:3px;padding:1px 6px 1px 3px;border-radius:3px;background:#5d4630;color:#f4ecd9;letter-spacing:.06em}
.b7ki{width:16px;height:16px;margin:-1px 0}
.k-hunt .b7kind,.k-mat .b7kind{background:#8c3a2b}.k-gather .b7kind{background:#4f7a3a}.k-cook .b7kind{background:#a8642a}.k-deliver .b7kind{background:#5a5f8c}.k-survey .b7kind{background:#3f6f7a}.k-fish .b7kind{background:#2f6a94}
.b7lv{color:#6a5640}
.b7title{font-size:14.5px;line-height:1.25;margin-top:2px}
.b7by{font-size:11px;color:#6a5640}
.b7text{margin:2px 0 0;font-size:12px;line-height:1.45;color:#3a2c1e;flex:1}
.b7goal{margin-top:3px;font-size:12px;font-weight:600;color:#2e2216;border-top:1px dashed rgba(60,40,20,.35);padding-top:4px}
.b7rw{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;font-size:11.5px;color:#4a3a28}
.b7rw .ic{width:15px;height:15px;vertical-align:-3px;margin-right:2px}
.b7rw span{display:inline-flex;align-items:center}
.b7note{color:#7a6650;font-size:11px}
.b7btns{display:flex;gap:6px;margin-top:5px}
.b7card .b7btns button{flex:1;padding:4px 0;font-size:12.5px;justify-content:center;border-radius:3px}
.b7card .b7btns button.go{background:#5b3d22;color:#f6ead0;border:1px solid #3b2716;font-weight:600}
.b7card .b7btns button.go:hover:not(:disabled){background:#74502e}
.b7card .b7btns button.quiet{background:transparent;color:#5b4632;border:1px dashed rgba(70,50,30,.55)}
.b7card .b7btns button.quiet:hover{background:rgba(90,60,30,.1);color:#3a2a1c}
.b7card .b7btns button:disabled{opacity:.45}
.b7row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:7px 9px;margin-bottom:6px;border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.03)}
.b7row.ready{border-color:var(--ok);background:rgba(143,208,138,.08)}
.b7row .b7rw{color:var(--ink-dim)}
.b7ri{display:flex;flex-direction:column;gap:1px;min-width:0}.b7ri b{display:flex;align-items:center;gap:5px;font-size:13.5px}
.b7who{font-size:11px;color:var(--ink-dim)}.b7prog{font-size:12px;color:var(--ink)}.b7row.ready .b7prog{color:var(--ok)}
.b7row .b7btns{margin:0}.b7row .b7btns button.go:not(:disabled){border-color:var(--ok);color:var(--ok);font-weight:600}.b7row .b7btns button{padding:4px 10px;font-size:12.5px}
.b7empty{margin:4px 0;font-size:12.5px;color:var(--ink-dim)}
.b7cards .b7empty{grid-column:1/-1;color:#f4ecd9}
.b7last{margin:8px 0 0;font-size:12.5px;color:var(--brass,#c9a35a)}
`;

/* ============================== 測試用 ============================== */
export const debug = { S, CBY, pick, fill, accept, tear, abandon, turnIn, progress, isDone, reward, eligible, spot, render, open, close, mesh: () => mesh };
