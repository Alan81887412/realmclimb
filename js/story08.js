// 0.8「競技場」的劇情資料（d8-story）：m11–m14「鐵鬃的三招」、s09–s12 支線、s13–s15 懸賞、委託卡 g1–g6 的文字、新物品與三隻菁英的說明、試煉與百場連戰的報幕字幕、各 NPC 多出來的閒聊與傳聞。
// 只依賴 keys.js。接法照 0.7：story.js 匯入 merge08 並在 PLACE_NOTES 宣告之後呼叫 merge08(NPCS, PLACES, QUESTS, LORE, PLACE_NOTES, ready)（第五個參數可省略；第六個 ready＝已接好的事件名，見 GATED08：m14、s09、s12 要等事件接好才開放）。
// 規格來源：/home/claude/team/design08/0.8 設計定案.md 第 1-5、1-6、2、3 節；任務名稱、給的人、等級、前置、目標、經驗照定案 2-2 表。
// 格式照 story.js 檔頭與 story07.js；0.8 多加的選用欄位（遊戲端沒接也不會壞，只是少一句話或退回較簡單的版本）：
//   QUESTS[].preAny          陣列：其中任一個做完就能接（s09＝s08 或 m11）。沒支援時看 pre（s09 的 pre 寫 ['m11']，退回成只認 m11）
//   QUESTS[].give            接下任務那一刻給的道具 { 道具: 數量 }（s11 瑪歌的骨頭；身上已經有就不再給）。沒支援時：骨頭拿不到，s11 只剩「打倒」那個結局
//   QUESTS[].text.doneIf     { 任務代號: [句子…] }：做過那個任務的人，回報時把這幾頁插在 done 的「最後一頁之前」（m11 的 h02、s12 的 h04）
//   QUESTS[].text.doneAlt    另一套回報台詞；QUESTS[].alt 寫的事件（例：'doChestnut:kill'）在這個任務期間發生過，就用 doneAlt 代替 done（s11）
//   objectives[].sayIf        同 doneIf，用在 talk 目標的 say：做過那個任務的人，把這幾頁插在 say 的最後一頁之前（m13 布蘿娜看項圈，h01）
//   NPC08[id].when            [{ need: 條件代號, idle?: [...], rumors?: [...] }]：條件成立後才加進閒聊／傳聞。條件代號見 LORE08.needs（0.9 線索：葛倫「面向北門舉盾」要試煉全部過關）
//   NPC08[id].replaceRumors   [舊句, 新句]：換掉傳聞裡的一句（merge07 只換 idle，這裡兩種都換）
// 目標代號：kill → MON（bison 野牛、python 沼蟒、dog 斷鍊鬥犬，見 beastai07.js）；elite → 'e:戰利品代號'；collect → ITEMS；talk → NPCS；reach → PLACES（含本檔的 STORY_PLACES08）
// 新的道具代號（horn、pgall……）是劇情先取的名字，數值／玩法定了別的代號就整批換掉：見 LORE08.items 與交回報告的對照表。
// 新的玩法事件（objectives[].cond，do 開頭，掛在 reach 目標上，由玩法的程式呼叫 questAct）：見 LORE08.acts。介面約定（d8-play/介面08.md）出來後名字以它為準。
// 11-16 21:4x 企劃總監 d8-design 驗收後改過（原檔 story08.v1.js）：NUM08 照數值決定、蟒膽劑三成、s10 份數台詞、m13 鍊扣、s11 餵食結局、s09 驚動定義與米洛提示、GATED08＋merge08 第六參數、百場連戰 waveBeast、球箱三顆都學會、委託卡字數、去掉網路用語。對照定案第 3 版。
import { keyOf } from './keys.js';
const K = a => `「${keyOf(a)}」`;

/* ============================== 會改的數字（數值定了改這裡就好） ============================== */
// 經驗與金幣照數值決定（d8-bal/數值決定08.md 21:2x，定案第 3 版 2-2）：主線＋支線 70,000；懸賞用折衷版
export const NUM08 = {
  exp: { m11: 9500, m12: 10500, m13: 11500, m14: 12500, s09: 5000, s10: 3500, s11: 8200, s12: 9300, s13: 7400, s14: 5900, s15: 2800 },
  gold: { m11: 310, m12: 280, m13: 270, m14: 260, s09: 160, s10: 160, s11: 170, s12: 170, s13: 500, s14: 330, s15: 500 },
  // 新素材的效果（定案 1-6）。說明文字從這裡帶數字
  charmHorn: 30,        // 牛角飾：被挑飛、擊倒、踉蹌而不能動的時間 −30%
  tonicMash: 40,        // 蟒膽劑：掙脫要按的次數 −40%（12 → 7）
  tonicDrag: '三成',     // 蟒膽劑：被拖住的時間少多少（數值決定 21:2x 第 6 點：0.30）
  tonicMin: 5,          // 蟒膽劑：野外幾分鐘
  collarOre: 2,         /* 斷項圈：1 條抵幾塊鐵礦石（整備時直接抵，沒有熔成項圈鐵這一步） */
  hornCharmCost: { horn: 2, gold: 30 },
  tonicCost: { pgall: 1, herb_bleed: 2, gold: 15 }
};
const X = NUM08.exp, G = NUM08.gold;

/* ============================== 地點（併進 PLACES） ============================== */
// 座標照 places06.js 的 PLACES06（白鹽臺、舊飼育場、運鐵坡道）；west_trail 是西巡獸徑橫過西側山徑的地方，座標等玩法 P1 的路點定了再換（setPlace08）
// prop 是場景描述（不跳旁白）。舊飼育場的「籠子的鎖是開著的」是 0.9「最後的馴獸師」的線索，只放在這裡和 PLACE_NOTES08，不做觸發
export const STORY_PLACES08 = {
  salt_terrace: { name: '白鹽臺', x: 271, z: 149, r: 22, zone: 'quarry', prop: '一階白色的鹽臺地，鹽壁被舔出一道道淺溝' },
  old_kennels: { name: '舊飼育場', x: -120, z: -287, r: 20, zone: 'wings', prop: '殘牆、鐵欄與一排破籠。籠門半掩，籠子的鎖都是開著的' },
  west_trail: { name: '後山的獸徑', x: -27, z: -433, r: 30, zone: 'backhill', prop: '一條被踩平的草帶，泥裡疊著一層層狗爪印' },
  iron_ramp: { name: '運鐵坡道', x: 76, z: -276, r: 26, zone: 'wings', prop: '沿獸欄高牆往上爬的坡道，鐵軌旁翻倒著幾輛礦車' }
};
export function setPlace08(id, x, z, r) { const p = STORY_PLACES08[id]; if (!p) return; p.x = x; p.z = z; if (r) p.r = r; }

// 地點說明（30 字內）。replace：換掉 story.js 的 PLACE_NOTES 那一條的 note
export const PLACE_NOTES08 = {
  salt_terrace: '白色的鹽臺地，從前商隊在這裡裝鹽。',
  old_kennels: '殘牆、鐵欄與破籠。籠子的鎖，都是開著的。',
  iron_ramp: '沿高牆往上爬的坡道，翻倒的礦車裡還有上一層的鐵。'
};

/* ============================== 任務 ============================== */
const QUARRY = { zone: 'quarry' }, WINGS = { zone: 'wings' }, T = { zone: 'town' };
const SALT = { zone: 'saltflat' }, BACKHILL = { zone: 'backhill' }, FLOODPEN = { zone: 'floodpen' };      // x9：0.8 擴建後野牛在鹽原、巡邏犬在獸欄後山、大蟒蛇在淹水獸場
export const QUESTS08 = [
  /* ---------- 主線：鐵鬃的三招（接 m10） ---------- */
  {
    id: 'm11', name: '最兇的那個', type: 'main', rating: 2, lv: 11, giver: 'instructor', pre: ['m10'], keys: ['dodge'],
    desc: '巴索說鐵鬃掃的是最惹牠的人。葛倫要你到東邊的鹽原看牛群怎麼挑人：讓衝過來的野牛撞上鹽壁或岩石暈倒一次，再擊敗三頭野牛。牛群溫和，不惹不打。',
    objectives: [
      { kind: 'reach', target: 'salt_flat', count: 1, label: '到東邊的鹽原', hint: SALT, say: ['白色的鹽壁下，幾頭野牛低著頭舔鹽，尾巴慢慢地甩。'] },
      { kind: 'reach', target: 'salt_flat', count: 1, label: '讓衝過來的野牛撞上鹽壁或岩石暈倒', hint: null, cond: 'doBisonStun' },
      { kind: 'kill', target: 'bison', count: 3, label: '擊敗野牛', hint: null }
    ],
    rewards: { exp: X.m11, gold: G.m11, items: { potion: 2 }, orbChoice: null },
    text: {
      offer: ['巴索說鐵鬃掃最兇的那個。說得簡單。', '最兇的是誰，牠說了算。不是你。', '東邊的鹽原，有一群野牛在舔鹽。', '牛不惹不打。惹了，整群盯著打牠最痛的那個衝。', '去讓牠衝。衝到鹽壁上，牠自己會暈。', '三頭。打倒了再回來。'],
      accept: ['靠太近，牠會抬頭、刨地、噴氣。那是警告。退開就沒事。', '要打，先想好誰當最兇的那個。一個人去，那就是你。', '背對鹽壁站。牠衝過來，你閃開。剩下的，牆會做。', '被頂飛了別躺著。起來，再找一面牆。'],
      progress: ['撞一次牆，打倒三頭。', '被頂飛幾次？……那就是你還站錯地方。'],
      done: ['撞上了？聽聲音就知道。', '牛不笨。牠認定了一個人，眼睛裡就沒別的。', '鐵鬃也一樣。誰惹牠最兇，牠就只看誰。', '所以隊伍裡要有人故意當那個人。把牠帶到牆邊，帶到別人打得到的地方。', '還行。', '下一招，去問哈根。什麼東西咬住了不放，他知道。'],
      doneIf: { h02: ['當年場上最兇的，就是我。', '我被牠壓過，我知道。當最兇的那個，要先想好怎麼站起來。'] }
    },
    discover: null
  },
  {
    id: 'm12', name: '鬆口', type: 'main', rating: 2, lv: 12, giver: 'hunter', pre: ['m11'], keys: ['interact'],
    desc: '哈根說舊飼育場的水坑裡住著當年競技場養的蟒。到舊飼育場，被纏住時自己掙脫，或把被纏住的同伴救出來一次，再擊敗一條沼蟒。一個人也做得到。',
    objectives: [
      { kind: 'reach', target: 'old_kennels', count: 1, label: '到獸欄西翼的舊飼育場', hint: WINGS, say: ['塌了一半的獸坑積著發綠的水。水面冒著細泡，有東西在底下。'] },
      { kind: 'reach', target: 'old_kennels', count: 1, get label() { return `被纏住時連按${K('interact')}掙脫，或把被纏住的同伴救出來`; }, hint: null, cond: 'doCoilFree' },
      { kind: 'kill', target: 'python', count: 1, label: '擊敗沼蟒', hint: null }
    ],
    rewards: { exp: X.m12, gold: G.m12, items: { meat: 2, potion: 1 }, orbChoice: null },
    text: {
      offer: ['……坐。葛倫叫你來的。', '獸欄西邊，舊飼育場。坑裡積了水，水裡有蟒。', '那不是原野的東西。當年場子養來表演的。', '牠沉在水裡等。靠近了，才起身纏人。', '被纏住，一個人掙得開。兩個人，更快。', '去被纏一次。掙開，或者把被纏的人拉出來。再打倒一條。'],
      accept: ['水面冒細泡，有一雙眼睛。看到了，就別再往前。', '纏住了，別慌。一直掙。掙得越急，鬆得越快。', '有同伴在，讓他打牠。打痛了，牠就鬆。', '你跑遠了，牠會滑回坑裡。不追。'],
      progress: ['被纏過沒有。掙開了沒有。', '……濕了？呵。坑裡的水，十二年沒換過。'],
      done: ['掙開了。好。', '記住那種勒法。從胸口開始，氣一口一口被擠掉。', '蟒，掙得開。鐵鬃咬住的，自己掙不開。', '那時候只能靠旁邊的人。打牠，打到牠鬆口。', '……當年餵那些蟒的，是馴獸師長本人。', '我看過一次。她站在坑邊，蟒就把頭靠過去。', '呵。不說了。肉拿去。']
    },
    discover: null
  },
  {
    id: 'm13', name: '站得最遠的人', type: 'main', rating: 2, lv: 13, giver: 'guard', pre: ['m12'], keys: ['heavy'],
    desc: '托比要清點斷鍊之夜後還在巡邏的獸欄巡邏犬。到獸欄後山看一次鬥犬巡邏經過，打斷一次長吠，帶回三個斷項圈，先拿給布蘿娜看。',
    objectives: [
      { kind: 'reach', target: 'west_trail', count: 1, label: '在獸欄後山看見鬥犬巡邏經過', hint: BACKHILL, cond: 'doPatrolSeen' },
      { kind: 'reach', target: 'west_trail', count: 1, get label() { return `鬥犬長吠時用${K('heavy')}或暈眩打斷牠`; }, hint: null, cond: 'doBarkBreak' },
      { kind: 'collect', target: 'collar', count: 3, label: '取回斷項圈', hint: null },
      { kind: 'talk', target: 'smith', count: 1, label: '把斷項圈拿給布蘿娜看', hint: T,
        say: ['項圈？拿來！……嘖，這上面的鍊扣是我阿公打的。', '你看這裡。扣舌是推開的，扣環一點都沒拉長。', '鍊子不是扯斷的，是解開的。', '三個都一樣。誰解的，我不知道。', '我阿公的鐵沒輸。……拿回去給托比，他要記，就讓他記清楚。'],
        sayIf: { h01: ['跟競技場那條一樣。都是解開的。'] } }
    ],
    rewards: { exp: X.m13, gold: G.m13, items: { potion: 2 }, orbChoice: null },
    text: {
      offer: ['報告！我在南門的櫃子裡找到一本巡邏名冊。', '斷鍊之夜以前，獸欄外每晚有巡邏隊帶狗沿著高牆走一圈。', '人走了，狗還在走同一條路。十二年，同一條。', '名冊上登記著十七隻巡邏犬。依規定，要清點。', '請到後山看牠們走過去，帶三個項圈回來。我……我想知道還剩幾隻。'],
      accept: ['紀錄寫著：開打前，會有一隻先抬頭長吠，把別群叫來。', '依我的理解，趁牠吠的時候重重打下去，牠就叫不出來。', '還有，狗群撲的是站得最遠的那個人，不是最近的。這條我畫了兩條線。', '路上有一條被踩平的草帶，那就是牠們的路。躲在旁邊等牠們過去，也可以。', '項圈拿到了，先給布蘿娜看。她說她要看。'],
      progress: ['看見巡邏、打斷長吠、三個項圈。報告完畢。', '項圈要先給布蘿娜看。她說的，不是我說的。'],
      done: ['布蘿娜看過了？她怎麼說？', '……解開的。我記下來了。可是我不知道該記在哪一欄。', '十七隻。看到的、帶回項圈的，我一隻一隻畫掉。', '還沒畫掉的那幾隻，我先寫「巡邏中」。', '依規定這樣寫不對。可是我想這樣寫。']
    },
    discover: null
  },
  {
    id: 'm14', name: '名冊上的空格', type: 'main', rating: 3, lv: 14, giver: 'keeper', pre: ['m13'], keys: [],
    desc: '巴索翻開一本十二年沒寫過字的「攻略團名冊」。在競技場的戰績簿接第三級的三個試煉——最兇的那個、鬆口、站得最遠的人——全部過關。三個都可以一個人打。',
    objectives: [
      { kind: 'reach', target: 'arena_ring', count: 1, label: '通過試煉「最兇的那個」', hint: T, cond: 'doTrial:3-1' },
      { kind: 'reach', target: 'arena_ring', count: 1, label: '通過試煉「鬆口」', hint: null, cond: 'doTrial:3-2' },
      { kind: 'reach', target: 'arena_ring', count: 1, label: '通過試煉「站得最遠的人」', hint: null, cond: 'doTrial:3-3' }
    ],
    rewards: { exp: X.m14, gold: G.m14, items: { potion: 3 }, orbChoice: null },
    text: {
      offer: ['各位觀眾——咳。這次不是老習慣，是正式的。', '這本，叫攻略團名冊。斷鍊之夜隔天，我就備好了。', '十二年，一個名字都沒寫進去。', '鐵鬃的三招，你在外面都見過了。見過不算，要在場子裡打給我看。', '牛、蟒、狗，各一場。看臺上，我會坐好。', '三場都站著走出來，我就把你的名字寫上第一行。'],
      accept: ['在我的戰績簿接試煉。柵欄一拉、鑼一響，獸門就開。', '一個人打得過，兩個人也行。名冊不挑。', '藥水照帶。這三場考的是腦袋，不是撐。'],
      progress: ['三場：最兇的那個、鬆口、站得最遠的人。', '場子小，牛衝不了幾步就撞牆。當年的觀眾，最愛看這個。'],
      done: ['有請——', '……好。墨要乾一下。', '十二年。第一行，總算有字了。', '寫在這裡的，才叫攻略團。門外那兩座絞盤，等的就是這本名冊上的人。', '還差幾行。一個人，轉不動兩座絞盤。', '去酒館。把會這三招的人，一個一個帶來給我登記。']
    },
    discover: null
  },

  /* ---------- 支線 ---------- */
  {
    id: 's09', name: '鹽路', type: 'side', rating: 2, lv: 11, giver: 'merchant', pre: ['m11'], preAny: ['s08', 'm11'], keys: ['interact'],
    desc: '商隊要鹽原的鹽。用礦鎬在鹽壁敲下六塊岩鹽，過程中不能驚動牛群：被警告後退開不算驚動，硬敲才算。驚動了也不扣東西，等牛群散開再敲就好。',
    objectives: [{ kind: 'reach', target: 'salt_flat', count: 6, get label() { return `在鹽壁按住${K('interact')}敲岩鹽，別驚動牛群`; }, hint: SALT, cond: 'doSaltCalm' }],
    rewards: { exp: X.s09, gold: G.s09, items: {}, orbChoice: null },
    text: {
      offer: ['老闆！好消息跟壞消息，先聽哪個？', '好消息：商隊要鹽原的鹽，價錢開得很好看。', '壞消息：鹽壁旁邊住了一群野牛。', '講真的，牛不吃人。可是牛會踩人。', '幫我敲六塊岩鹽，別驚動牠們。商隊說牛舔過的那面鹽最白，我不想知道為什麼。'],
      accept: ['牛抬頭、刨地、噴氣，就是嫌你太近。退開，牠就繼續舔。', '斷角那頭特別小氣，離牠遠一倍。商隊的人講的。', '礦鎬敲輕一點。有沒有用我不知道，是我自己的心理安慰。', '商隊的人說，牛一聽到鐵響就走開。夾子、鈴鐺那些，你比我懂。'],
      progress: ['六塊岩鹽。牛瞪你，你就退。', '被瞪了？退。退不丟臉，被踩才丟臉。'],
      done: ['六塊！白的！講真的，比我的牙還白。', '牛沒追你？……你怎麼辦到的？算了，別教我，我不會去。', '商隊說，牛舔了十幾年的鹽，哪一面最好，牠們最清楚。', '錢在這。下一車鹽，我會跟商隊說是「老闆親手敲的」。加價。']
    },
    discover: null
  },
  {
    id: 's10', name: '一顆膽三個人', type: 'side', rating: 1, lv: 12, giver: 'apothecary', pre: ['m12'], keys: [],
    desc: '艾妲要一顆蟒膽，調一種讓人被纏住時掙得比較快的藥劑。交一顆蟒膽給她；沼蟒第一次被你擊敗時一定有。',
    objectives: [{ kind: 'collect', target: 'pgall', count: 1, label: '帶回蟒膽', hint: WINGS }],
    rewards: { exp: X.s10, gold: G.s10, items: {}, orbChoice: null, recipes: ['tonic_python'] },
    text: {
      offer: ['下一位。……身上有蟒的腥味。你去過舊飼育場了。', '蟒膽。苦，腥，很有用。', '以劑量來說，一顆蟒膽只夠調一瓶，一瓶管一個人。', '喝了，被纏住的時候，掙的次數少四成。', '帶一顆來。配方我教你，劑量我盯著。'],
      accept: ['第一次打倒的那條，身上一定有膽。之後就看運氣。', '取膽要快，別弄破。破了的膽，只剩苦。', '它跟熊膽劑、鬥士藥酒同時只能一種。藥效會打架，倒楣的是你的胃。'],
      progress: ['一顆蟒膽。完整的。', '米洛不收蟒膽。他說聞了會做惡夢。我說那是他良心的問題。'],
      done: ['完整的。很好。', '配方記下了：蟒膽一顆、止血草兩株、調製費十五金。管五分鐘。', '三個人去坑邊，就是一瓶藥、三顆膽。另外兩顆，請自己帶。', '還有，被纏住的時候，記得呼吸。這不是比喻。']
    },
    discover: null
  },
  {
    id: 's11', name: '栗子', type: 'side', rating: 2, lv: 13, giver: 'tavern', pre: ['m13'], keys: [],
    give: { bone_margo: 1 }, alt: 'doChestnut:kill',
    desc: '瑪歌小時候，每晚有一隻巡邏犬到酒館後門討骨頭，項圈刻著「栗子」。在後山巡邏的那一群裡找到牠，把項圈帶回來。瑪歌給了你一根骨頭，怎麼用你自己決定。',
    objectives: [{ kind: 'reach', target: 'west_trail', count: 1, label: '在後山巡邏的狗群裡，拿到刻著「栗子」的項圈', hint: BACKHILL, cond: 'doChestnut' }],
    rewards: { exp: X.s11, gold: G.s11, items: {}, orbChoice: null },
    text: {
      offer: ['欸，托比在清點那些狗喔？我跟你講一件事，你別笑。', '我小時候，巡邏隊收班會來店裡喝一杯。有一隻狗就蹲在後門，等我丟骨頭。', '牠項圈上刻著「栗子」。毛是栗子色的，名字是我取的。', '斷鍊之後就沒來了。前幾天商隊的人說，後山那群狗裡，有一隻嘴邊都白了。', '我想要那個項圈。……牠的話，你看著辦。'],
      accept: ['這根骨頭你帶著。燉過的，牠以前最愛這個。', '聽說啦，帶著骨頭、在牠們發現你之前走過去，說不定牠還記得。', '不記得也沒關係。真的，沒關係。'],
      progress: ['後山那一群。嘴邊白白的那隻。', '骨頭還在嗎？別自己啃喔。'],
      done: ['……牠聞了骨頭？還低下頭，讓你解項圈？', '然後就帶著整群走了。', '牠記得。牠記得欸。', '欸我跟你講，我沒有哭，是爐子的煙。', '這是說好的。今晚你的酒，算我的。'],
      doneAlt: ['……這個項圈。對，就是這個。', '牠很老了吧。嘴邊都白了。', '沒關係。牠在外面走了十二年，總要有人讓牠歇一下。', '項圈我掛在後門。牠以前就蹲在那裡。', '這是說好的。……謝謝你把牠帶回來。']
    },
    discover: null
  },
  {
    id: 's12', name: '上一層的鐵', type: 'side', rating: 2, lv: 14, giver: 'smith', pre: ['m13'], keys: ['interact'],
    desc: '獸欄大門旁的兩座絞盤十二年沒動，齒輪鏽死了。布蘿娜要上一層運下來的硬鐵才修得好：到運鐵坡道，從翻倒的礦車上敲下三塊上層鐵塊。斷鍊・鐵牙會帶著狗群經過那一帶。',
    objectives: [{ kind: 'reach', target: 'iron_ramp', count: 3, get label() { return `在翻倒的礦車旁按住${K('interact')}敲上層鐵塊`; }, hint: WINGS, cond: 'doIronOre' }],
    rewards: { exp: X.s12, gold: G.s12, items: { ore_iron: 2 }, orbChoice: null },
    text: {
      offer: ['喂！你去過獸欄大門吧？門邊那兩座絞盤，你摸過沒有？', '十二年沒上油，齒輪鏽成一塊。到時候你們轉到吐血，它也不會動。', '那齒輪是上一層的鐵打的。硬。我們的鐵咬不住它。', '運鐵坡道上有翻倒的礦車，是斷鍊那一夜的最後一車。車裡的，還是上面的鐵。', '敲三塊回來。要礦鎬、要耐心，眼睛還要顧著背後。'],
      accept: ['坡道上有狗。帶頭那隻脖子掛鐵牌，托比叫牠「鐵牙」。看到牠過來，先躲。', '上層的鐵是青黑色的，敲起來聲音比較悶。敲錯了，就只是石頭。', '三塊就好。多的我也捨不得用。'],
      progress: ['三塊上層鐵。青黑色，聲音悶。', '被狗追了？鐵塊又不會跑。等牠們走過去再敲。'],
      done: ['給我——', '……你聽。', '這鐵比我們的硬。我燒了十二年的爐，打不出這種東西。', '上面的火還沒熄。', '絞盤交給我。等你們湊齊人，門邊那兩座，一定轉得動。'],
      doneIf: { h04: ['芬恩說他在水裡看到上面的火光，快熄了。', '快熄，就是還沒熄。'] }
    },
    discover: null
  },

  /* ---------- 懸賞（菁英位置不標示：只說到「一帶」） ---------- */
  {
    id: 's13', name: '懸賞：鐵牙', type: 'side', rating: 3, lv: 13, giver: 'guard', pre: ['m13'], keys: [],
    desc: '南門的懸賞：斷鍊・鐵牙。獸欄巡邏犬的頭犬，脖子上掛著鐵牌，還帶著狗群在獸欄後山與運鐵坡道一帶巡邏。牠一長吠，別群的狗會趕來。最好結伴前往。',
    objectives: [{ kind: 'elite', target: 'e:trophy_irontooth', count: 1, label: '擊敗斷鍊・鐵牙', hint: BACKHILL }],
    rewards: { exp: X.s13, gold: G.s13, items: { potion: 2 }, orbChoice: null },
    text: {
      offer: ['報告！名冊第一行，是一隻叫「鐵牙」的頭犬。', '斷鍊之後，牠還在帶隊。走同一條路，停同幾個哨點。', '依規定，這一隻得親手擊退，巡邏名冊才有辦法改記。', '我、我不是要牠死。只是名冊上的事，總要有個結尾。', '牠在後山的巡邏道，有時也到運鐵坡道。請結伴去。這是建議，也有一點是請求。'],
      accept: ['紀錄寫著：牠長吠一聲，附近的狗都會過來。要打斷，要很用力。', '牠拖著一截斷鍊。甩起來，會把人拉過去。', '人被拉過去，狗群就撲站得最遠的那個。你們要互相看著。'],
      progress: ['鐵牙還在巡。後山的巡邏道一帶。', '牠繞一趟大概兩三分鐘。我數過了。請不要問我怎麼數的。'],
      done: ['這是……鐵牙的項圈。鐵牌上刻著牠的名字。', '旁邊這個記號，名冊上沒有。我也沒看過。', '報告全體：鐵牙，已擊退。……我小聲講就好。', '賞金在這。第一行畫掉了，可是名冊我會留著。']
    },
    discover: null
  },
  {
    id: 's14', name: '懸賞：狂牛', type: 'side', rating: 3, lv: 12, giver: 'merchant', pre: ['s09'], keys: [],
    desc: '米洛的懸賞：擊退鹽原的狂牛。牛群的頭牛，左角斷了一截，不惹不打，惹了就一趟接一趟地衝。商隊又被牠趕回來了。牠在鹽原一帶走動，身邊跟著兩頭牛。最好結伴前往。',
    objectives: [{ kind: 'elite', target: 'e:trophy_bison', count: 1, label: '擊敗鹽原的狂牛', hint: SALT }],
    rewards: { exp: X.s14, gold: G.s14, items: { potion: 2 }, orbChoice: null },
    text: {
      offer: ['老闆，鹽的生意好到我睡不著。可是又出事了。', '講真的，其他牛都讓路了，就那頭斷角的不讓。', '商隊的車一靠近，牠就刨地。刨完就衝，一趟不夠，衝三趟。', '商隊說牠十幾年前就在鹽原了。比我開店還早。', '我不想跟老前輩過不去。可是車要過。拜託了。'],
      accept: ['牠前腳一踏，前面一整片都會震。站旁邊，別站前面。', '衝的時候撞上牆，牠也會暈。跟別的牛一樣，就是脾氣大一點。', '商隊說，要有人先當牠最討厭的那個，把牠帶到鹽壁。那個人……反正不是我。'],
      progress: ['斷角那頭還在。商隊在驛站等，等到開始吵架了。', '牠在鹽原一帶走。帶同伴、帶藥水，再帶一面牆。'],
      done: ['這是……牠的角？斷掉的那一截？', '老闆，你們把老前輩請下來了。', '商隊可以走了，鹽也可以敲了。我心裡有一點過意不去，一點點。', '賞金在這。講真的，這次我沒有殺價。']
    },
    discover: null
  },
  {
    id: 's15', name: '懸賞：坑底那條', type: 'side', rating: 4, lv: 14, giver: 'hunter', pre: ['m12'], keys: [],
    desc: '哈根的懸賞：擊退淹水獸場的大蟒蛇。當年競技場的壓軸蟒，沉在淹水獸場最深的那個坑裡。牠能同時纏住兩個人，纏住了就往水裡拖。不要一個人去。',
    objectives: [{ kind: 'elite', target: 'e:trophy_python', count: 1, label: '擊敗淹水獸場的大蟒蛇', hint: FLOODPEN }],
    rewards: { exp: X.s15, gold: G.s15, items: { potion: 2 }, orbChoice: null },
    text: {
      offer: ['……那個坑裡，還有一條大的。', '當年場子的壓軸。斷鍊那一夜，牠自己滑進最深的坑。', '我去看過一次。水面底下，比坑還長。', '我當年沒敢下手。現在，腿也不行了。', '你們去。帶人去。'],
      accept: ['牠頭和尾巴一起來。一次纏兩個。', '纏住了沒人救，就往水裡拖。水裡的，勒得更緊。', '旁邊的人要快。先救誰，進去之前就想好。', '帶艾妲的藥。……呵，這句聽起來像她講的。'],
      progress: ['坑底那條還在。', '兩個人被纏，第三個人別發呆。'],
      done: ['……這顆牙。', '好。', '那條蟒不是壞東西。牠只是被留在那裡。', '十二年。總算有人去替牠收尾。', '賞金拿去。……坐。火還旺。']
    },
    discover: null
  }
];

/* ============================== NPC 多出來的話（併進 NPCS） ============================== */
// idle／rumors：附加在後面｜replaceRumors、replaceIdle：[舊句, 新句]（舊句找不到就略過）｜when：條件成立才出現（見檔頭）
export const NPC08 = {
  instructor: {
    idle: ['試煉的沙地比外面小。牛衝不了幾步就撞牆。這是好事。', '在場子裡輸，柵欄一放就出來了。在外面輸，沒有柵欄。', '巴索又開始敲鑼了。十二年沒聽到，吵。……還行。'],
    rumors: ['鹽原那頭斷角的，斷鍊以前就在那裡了。牠不是場子裡的，別當牠是。'],
    when: [{ need: 'trialsAll', idle: ['都過了？……還行。不，比還行好一點。'], rumors: ['當年開賽前，角鬥士要面向北門舉盾。誰定的規矩，我也不知道。'] }]
  },
  keeper: {
    idle: ['戰績簿翻到最新一頁了。十二年來第一次，墨水不夠用。', '報幕不喊了，改敲鑼。嗓子老了，鑼不會。', '百場連戰不准帶藥水和吃的。東西我替你保管，出場一樣不少還你。'],
    rumors: ['第一百場那一格，我留著沒填。', '攻略團名冊，我每一頁都先畫好了格子。畫了十二年。', '淹水獸場最深的坑裡那條大的，是當年的壓軸。牠出場前，全場要熄一半的燈。']
  },
  hunter: {
    idle: ['蟒不追人。你跑遠了，牠就回去。呵，比人講理。', '牛舔鹽，舔得專心。別在牠吃飯的時候吵牠。'],
    rumors: ['鬥犬走的那條路，草長不起來。十二年，一天都沒停過。']
  },
  guard: {
    idle: ['報告：巡邏犬名冊，沒畫掉的我都寫「巡邏中」。依規定不對，我知道。', '依紀錄，狗群撲站得最遠的人。出城的時候，請不要一個人落在隊伍最後面。'],
    rumors: ['報告：鐵牙的鐵牌上有個記號，不是巡邏隊的。我翻了三個晚上的舊紀錄，沒找到。']
  },
  merchant: {
    idle: ['牛角我收，蟒皮我更收！城裡的鞋匠搶著要。斷項圈？不收，那是布蘿娜的。', '蟒膽我不收。艾妲說我只會論斤算。她說得對。'],
    rumors: ['商隊說，那頭斷角的牛十幾年前就在鹽原了。講真的，牠才是老闆，我們是借路的。']
  },
  tavern: {
    idle: ['後門那個項圈，別問。……好啦，你問的話，我會講。', '欸我跟你講，競技場又在敲鑼了。我阿爸聽到的話，會把店關了跑去看。'],
    rumors: ['聽說啦，巴索在找會三招的人寫名冊。寫上去的，酒錢我打九折。九十九場嘛。']
  },
  apothecary: {
    idle: ['被蟒纏過的人，肋骨會痛三天。第四天開始，換成心裡痛。', '牛角挑出來的傷口，我分得出來。比熊的整齊。']
  },
  smith: {
    idle: ['斷項圈拿來。整備三、四階的時候，我直接算：一條抵兩塊鐵礦石，省得你去敲石頭。不用先熔，鍊扣拆下來就能用。', '牛角飾，兩支牛角加三十金。被挑飛了，爬起來快一點。'],
    rumors: ['那些項圈上的鍊扣，都是推開的，不是扯斷的。我看過的每一個都一樣。']
  },
  surveyor: {
    idle: ['獸徑我畫成褐色虛線。你親眼看過的那一段，我才敢畫。', '白鹽臺在東——不對，在外谷。總之很白，到了就知道。'],
    rumors: ['狗群走的路，跟老圖上巡邏隊的路一模一樣。老圖比我準，我有點不甘心。']
  }
};

/* ============================== 影牙出沒點搬家（定案 1-5 規則 3） ============================== */
// 白鹽臺改成狂牛的地盤，影牙的第三處搬走；新地名等玩法驗證後填進 SHADOW_SPOT08（例：'峽谷主道東段'）。沒填（null）時 merge08 不換任何字
// 要換的字串（story.js 原文 → 新句，{影牙新出沒點} 換成 SHADOW_SPOT08）
export let SHADOW_SPOT08 = '峽谷東段';      // x9：X1 驗過的新出沒點 (180,−104)，places08.js 的 SHADOW_SPOT08.name
export function setShadowSpot08(name) { SHADOW_SPOT08 = name || null; }
export const SHADOW08 = [
  // ① 米洛的傳聞（NPCS.merchant.rumors）
  { where: 'merchant.rumors', old: '聽說影牙不只一個窩：岔路盡頭、採石場、白鹽臺，牠輪著待。講真的，別去。', nu: '聽說影牙不只一個窩：岔路盡頭、採石場、{影牙新出沒點}，牠輪著待。講真的，別去。' },
  // ② s08 的說明（QUESTS s08.desc）
  { where: 's08.desc', old: '潛行虎・影牙不肯退開，商隊就不敢走峽谷。牠輪流待在岔路盡頭的窩、採石場、白鹽臺。米洛把積蓄全押上了，務必結伴前往。', nu: '潛行虎・影牙不肯退開，商隊就不敢走峽谷。牠輪流待在岔路盡頭的窩、採石場、{影牙新出沒點}。米洛把積蓄全押上了，務必結伴前往。' },
  // ③ s08 的進行中台詞（QUESTS s08.text.progress[1]）
  { where: 's08.progress', old: '岔路盡頭、採石場、白鹽臺，牠輪著待。帶同伴，帶藥水，帶腦袋。', nu: '岔路盡頭、採石場、{影牙新出沒點}，牠輪著待。帶同伴，帶藥水，帶腦袋。' },
  // ④（簡報沒列，一併換）m09 米洛的 say
  { where: 'm09.say.merchant', old: '最近連採石場、白鹽臺那邊都有人看過牠。三個地方，牠輪著待。', nu: '最近連採石場、{影牙新出沒點}那邊都有人看過牠。三個地方，牠輪著待。' },
  // ⑤（簡報沒列，一併換）LORE.elites.trophy_shadow.where
  { where: 'lore.elites.trophy_shadow', old: '斷牙峽谷東側岔路盡頭的窩、採石場、白鹽臺，輪流出沒', nu: '斷牙峽谷東側岔路盡頭的窩、採石場、{影牙新出沒點}，輪流出沒' }
];

/* ============================== 委託卡 g1–g6（併進 board07.js 的 CARDS；格式照 CARDS） ============================== */
// T（預估分鐘）是劇情先抓的，數值照 board07.js 檔頭的算法重算；g6 的座標等玩法 P1 的西巡路點定了再換（和 STORY_PLACES08.west_trail 同一處）
const R = (x, z, r, name) => ({ x, z, r, name });
export const BOARD08 = [
  { id: 'g1', kind: 'hunt', lv: 11, T: 6, by: 'merchant', title: '鹽原的牛擋路了', goal: { kill: 'bison', n: 3, min: 11, where: '鹽原' },
    text: '老闆，商隊的車又被牛群堵在鹽原了。講真的，牛沒錯，錯的是牛站在路上。請「勸」走三頭。', done: '路通了！商隊說牛群退到鹽壁另一邊了。我就說嘛，好好講牠們聽得懂。' },
  { id: 'g2', kind: 'mat', lv: 12, T: 6, by: 'smith', title: '要一對牛角', goal: { kill: 'bison', n: 3, min: 11, where: '鹽原' }, item: 'horn',
    text: '喂！牛角飾要一對牛角。三頭野牛，運氣差也沒差，我這裡先墊一支給你。打到的自己留著，湊一對！', done: '這支給你。牛角硬，我磨了一整晚，磨刀石都磨平一塊。' },
  { id: 'g3', kind: 'hunt', lv: 13, T: 5, by: 'hunter', title: '坑裡那條', goal: { kill: 'python', n: 1, min: 12, where: '舊飼育場' },
    text: '……飼育場的坑，又拖走一頭鹿。一條。別站在坑邊。', done: '……一條。夠了。坑裡能安靜幾天。' },
  { id: 'g4', kind: 'mat', lv: 13, T: 5, by: 'apothecary', title: '新鮮的蟒膽', goal: { kill: 'python', n: 1, min: 12, where: '舊飼育場' }, item: 'pgall',
    text: '蟒膽劑的存貨見底了。請打倒一條沼蟒。膽不一定完整，我先備了一顆，事成給你。', done: '這顆是說好的。你的肋骨……嗯，都在。只是位置有點不服氣。' },
  { id: 'g5', kind: 'hunt', lv: 14, T: 6, by: 'guard', title: '巡邏犬清點', goal: { kill: 'dog', n: 4, min: 13, where: '獸欄後山' },
    text: '報告：巡邏犬名冊，我想再清點一次。請打倒四隻，記得打斷長吠。依規定，我只能在這裡數。', done: '報告！四隻，畫掉了。……旁邊我寫了「辛苦了」。是寫給牠們的。' },
  { id: 'g6', kind: 'survey', lv: 12, T: 5, by: 'surveyor', title: '獸徑往哪走', goal: { reach: R(-27, -433, 14, '後山獸徑的西段') }, say: '後山的巡邏道上有一條被踩平的草帶，泥裡疊著一層層狗爪印，一路往獸欄那頭去。',
    text: '狗群十二年都走同一條路！我要畫進圖裡。去後山獸徑的西段看一眼，看到草帶就好。', done: '草被踩平一條？就是它！我畫成褐色虛線。……等等，畫反了。沒事，再畫一次。' }
];

/* ============================== 競技場：試煉、百場連戰、對決的字幕（給玩法 P3／P6 與介面） ============================== */
// 巴索報幕不做人聲（製作人裁決 4）：每句先響一聲號角或鑼（cue），再出字幕。cue 只是建議，音效總監可改
// 帶 {} 的是範本：{wave} 波數｜{time} 時間（介面排好的字串）｜{a}、{b} 對決雙方｜{w} 贏的人｜{tier} 第幾級
export const TRIALS08 = [
  { id: '1-1', tier: 1, name: '讓牠先衝', foe: '野豬×2', rule: '先閃過 3 次衝撞，再擊敗', desc: '野豬衝過來，先閃開三次，再打倒牠們。' },
  { id: '1-2', tier: 1, name: '狼不排隊', foe: '灰狼×4', rule: '60 秒內擊敗', desc: '四隻灰狼，六十秒內打完。牠們會繞到你背後。' },
  { id: '1-3', tier: 1, name: '先擋再打', foe: '棕熊（4 級）', rule: '精準格擋 3 次', desc: '一頭棕熊。擋下牠三次，要擋得剛剛好。' },
  { id: '2-1', tier: 2, name: '不喝藥', foe: '猛虎×2', rule: '不喝藥水', desc: '兩頭猛虎，整場不准開藥瓶。' },
  { id: '2-2', tier: 2, name: '影子', foe: '猛虎（9 級）', rule: '整場不被打中', desc: '一頭猛虎。整場一下都不准被碰到。' },
  { id: '2-3', tier: 2, name: '兩人一組', foe: '棕熊＋猛虎', rule: '兩人組', desc: '一頭熊、一頭虎，要兩個人一起進場。' },
  { id: '3-1', tier: 3, name: '最兇的那個', foe: '野牛×2', rule: '讓牛撞牆 2 次', desc: '兩頭野牛。場子小，讓牠們撞上場邊兩次。' },
  { id: '3-2', tier: 3, name: '鬆口', foe: '沼蟒', rule: '被纏住後 3 秒內脫身 2 次（自己掙或隊友救）', desc: '一條沼蟒。被纏住後三秒內脫身，兩次；自己掙或同伴救都算。' },
  { id: '3-3', tier: 3, name: '站得最遠的人', foe: '鬥犬×3', rule: '打斷長吠 2 次', desc: '三隻斷鍊鬥犬。在牠們長吠的時候打斷，兩次。' }
];
export const TIERS08 = { 1: '第一級（建議 3–5 級）', 2: '第二級（建議 8–10 級）', 3: '第三級（建議 12–15 級）' };

export const ARENA08 = {
  cue: { open: 'horn', win: 'gong', fail: 'gong', wave: 'gong', clear: 'horn', duel: 'horn', duelEnd: 'gong' },
  common: {
    fence: '柵欄拉起來了。獸門那邊有動靜。',
    gate: '獸門開了！',
    best: '新的個人最佳：{time}。我寫大一點。',
    first: '第一次過關！照老規矩，有賞。',
    tierClear: '{tier}三場全過！天賦球，挑一顆。',
    leave: '挑戰者離場。柵欄放下了。'
  },
  trials: {
    '1-1': { open: '各位觀眾——第一場：野豬兩頭！挑戰者，請先讓牠衝三次。', win: '三次全閃開，兩頭全倒下！第一課，畢業。', fail: '被頂飛了。不要緊，冠軍也是被野豬教出來的。' },
    '1-2': { open: '灰狼四隻！時限六十秒——牠們可不排隊。', win: '四隻，時間內！看臺上的人都數到了。', fail: '時間到，狼還站著。下一場，先找第四隻。' },
    '1-3': { open: '棕熊上場！挑戰者，請擋下牠三次——擋得剛剛好的那種。', win: '三次都擋得剛剛好！這頭熊想不通，牠的掌打到哪去了。', fail: '熊贏了這一場。牠的前輩，當年也在這裡學過怎麼贏。' },
    '2-1': { open: '猛虎兩頭！本場規矩：藥水不准開瓶。', win: '一滴都沒喝，兩頭都倒下！艾妲會很欣慰。', fail: '開瓶了，或倒下了。規矩就是規矩。' },
    '2-2': { open: '猛虎一頭。本場規矩：整場不准被碰到，一下都不行。', win: '乾乾淨淨！各位，請看挑戰者的衣服，一道爪痕都沒有。', fail: '碰到了。影子被踩到，就不叫影子了。' },
    '2-3': { open: '熊一頭、虎一頭，挑戰者兩位！請記得，你們是一組。', win: '兩位都站著！這才叫一組。', fail: '這一場輸了。下一場，先說好誰顧誰。' },
    '3-1': { open: '野牛兩頭！場子小，請讓牠們撞上場邊——兩次。', win: '兩聲悶響，兩頭倒下！最兇的那個，站得住。', fail: '被踩了。不要緊，牆還在，牛也還在。' },
    '3-2': { open: '沼蟒一條！被纏住了，請在三秒內脫身——兩次。', win: '兩次都鬆開了！各位，請為這一口氣鼓掌。', fail: '纏太久了。先喘口氣，再來。' },
    '3-3': { open: '巡邏犬三隻！請在牠們長吠的時候打斷——兩次。', win: '兩聲長吠都被打斷！一隻同伴都沒叫來。', fail: '沒打斷，或倒下了。下一次，看到牠抬頭就出手。' }
  },
  // 百場連戰（定案 3-2；0.8 沒有葛倫）。第 10 波是一般版，0.9 的葛倫版另寫
  gauntlet: {
    name: '百場連戰',
    desc: '十波，從野豬打到斷鍊鬥犬。不准帶藥水與料理，倒下就結束。第一次打完，領稀有天賦球箱。',
    open: '各位觀眾——百場連戰！十波，中間不准開瓶，不准吃東西。',
    starve: '藥水與料理先交給我保管，出場還你。',
    returned: '保管的東西還你了。數一數，我一樣都沒動。',
    between: '十五秒。喘氣也算時間。',
    waves: [
      '第一波！暖身而已——對野獸來說也是。',
      '第二波。看臺上有人開始下注了。我們不收賭金。',
      '第三波。呼吸，挑戰者。',
      '第四波。從這裡開始，有人會回頭看出口。',
      '第五波，過半！當年能走到這裡的，看臺會站起來。',
      '第六波。沒有藥水的第六波，比有藥水的第十波還長。',
      '第七波。各位觀眾，請安靜，讓挑戰者聽得到腳步聲。',
      '第八波。我的鑼還撐得住，挑戰者呢？',
      '第九波！只剩一扇門了。',
      '第十波——最後一場。各位觀眾，請起立。'
    ],
    // 每一波放出野獸時可以接的一句（照那一波的野獸種類挑；不用也行）
    // 每一波接哪一句 beasts（照定案第 3 版 3-2 的波次表；玩法 P3 改了波次就跟著改）
    waveBeast: ['boar', 'wolf', 'wolf', 'bear', 'tiger', 'tiger', 'bison', 'python', 'dog', 'bison'],
    beasts: { boar: '野豬上場！', wolf: '灰狼——不只一隻。', bear: '棕熊上場！牠站起來，你就該動了。', tiger: '猛虎！看地上，別看牠的眼睛。', bison: '野牛上場！牆在你身後。', python: '沼蟒！被纏住了，別停手。', dog: '斷鍊鬥犬！聽到長吠，就打。' },
    clear: '十波全過！各位觀眾——咳。抱歉。這一次，我是故意的。',
    reward: '冠軍的獎品，照老規矩。這箱子，我收了十二年。',
    fail: '連戰到此為止。紀錄：第 {wave} 波。簿子等你下次。',
    record: '新紀錄：第 {wave} 波。'
  },
  // 玩家對決（定案 3-3）
  duel: {
    open: '各位觀眾——對決！{a} 對 {b}。三分鐘，點到為止。',
    count: ['三——', '二——', '一——', '開始！'],
    win: '{w} 勝！兩位都站著離開，這才是好場子。',
    timeout: '時間到！照剩下的力氣——{w} 勝。',
    draw: '時間到，兩邊一樣。這一場，記平手。',
    leave: '有人離場了。這一場不記。'
  }
};

/* ============================== 世界觀與說明（併進 LORE） ============================== */
const N = NUM08;
export const LORE08 = {
  // 新道具的說明（給數值／玩法的道具表；代號是劇情先取的，見檔頭）
  items: {
    horn: { name: '牛角', desc: `野牛的角，硬得能當楔子。牛角飾的素材（${N.hornCharmCost.horn} 支）。` },
    pgall: { name: '蟒膽', desc: '沼蟒的膽，青黑色，很苦。蟒膽劑的材料。米洛不收。' },
    pyskin: { name: '蟒皮', desc: '沼蟒的皮，帶著青苔色的花紋。米洛說城裡的鞋匠搶著要。' },
    collar: { name: '斷項圈', desc: `獸欄巡邏犬的項圈，拴鍊子的鍊扣是被推開的，不是扯斷的；有的還刻著名字。布蘿娜整備武器（三、四階）時，一條直接抵 ${N.collarOre} 塊鐵礦石，不必先熔。` },
    iron_collar: { name: '項圈鐵', desc: `舊版的鐵條，現在不用做了：斷項圈在整備時直接抵 ${N.collarOre} 塊鐵礦石。` },
    ore_upper: { name: '上層鐵塊', desc: '從翻倒的礦車上敲下來的鐵，青黑色，敲起來聲音很悶。是上一層的鐵。布蘿娜、委託板都收。' },
    charm_horn: { name: '牛角飾', desc: `獸飾：被挑飛、擊倒、踉蹌而不能動的時間 −${N.charmHorn}%。武器二階起可以請布蘿娜裝上。` },
    tonic_python: { name: '蟒膽劑', desc: `野外 ${N.tonicMin} 分鐘：被纏住、咬住、壓制時，掙脫要按的次數少 ${N.tonicMash}%，被拖住的時間少${N.tonicDrag}。藥劑同時只有一種生效。` },
    trophy_bison: { name: '狂牛的斷角', desc: '擊敗鹽原的狂牛的證明。斷口早就磨圓了，是十幾年前斷的。' },
    trophy_python: { name: '大蟒的毒牙', desc: '擊敗淹水獸場的大蟒蛇的證明。牙根還是濕的。' },
    trophy_irontooth: { name: '鐵牙的項圈', desc: '擊敗斷鍊・鐵牙的證明。鐵牌上刻著「鐵牙」，旁邊壓著一個小記號：不是巡邏隊的，也不是布蘿娜家的。' },
    bone_margo: { name: '瑪歌的骨頭', desc: '瑪歌燉過的大骨，還有香味。她說「栗子」以前最愛這個。任務物品。' },
    chest_rare: { name: '稀有天賦球箱', desc: '百場連戰的冠軍獎品。打開會出現戰吼、震地踏、影步其中一顆；已經學會的不會出現。三顆都學會了，就自己挑一顆，留著交易或送人。' }
  },
  // 三隻新菁英（格式照 LORE.elites；where 只寫到「一帶」，位置不標示）
  elites: {
    trophy_bison: { name: '鹽原的狂牛', where: '鹽原一帶，帶著兩頭牛走動', text: '牛群的頭牛，肩背長著一整片火焰似的橘褐鬃毛，左角斷了一截，臉上和身上有幾道舊爪痕。商隊說十幾年前牠就在鹽原了，比斷鍊之夜還早——牠沒進過籠子，是原野本來的主人之一。平常和別的牛一樣溫和，只是嫌人靠太近的距離大一倍。惹了牠，牠會一趟接一趟地衝，每一趟都找最惹牠的那個人。' },
    trophy_python: { name: '淹水獸場的大蟒蛇', where: '淹水獸場最深的那個坑', text: '當年競技場的壓軸蟒，馴獸師長親手餵大的。斷鍊之夜後沉進淹水獸場最深的坑，身上長滿青苔，傳說比坑還長。頭和尾巴能同時纏住兩個人，纏住了就往水裡拖。' },
    trophy_irontooth: { name: '斷鍊・鐵牙', where: '獸欄後山的巡邏道與運鐵坡道一帶，帶著兩隻狗巡邏', text: '獸欄巡邏犬的頭犬。斷鍊以前，牠每晚跟著巡邏隊沿高牆走一圈；人走了，牠還帶著狗群走同一條路。脖子上的鐵牌刻著「鐵牙」，旁邊還壓著一個沒人認得的記號。牠一長吠，附近的狗都會趕來。' }
  },
  // 新野獸的習性（格式照 LORE.beasts）
  beasts: {
    bison: { name: '野牛', temper: '溫和', text: '鹽原的牛群，整天舔鹽。靠太近會抬頭、刨地、噴氣警告，退開就沒事；被打了整群一起上，盯著打牠最痛的人衝。衝上鹽壁或岩石會撞暈。聽到夾子、鈴鐺的鐵響會受驚走開。' },
    python: { name: '沼蟒', temper: '伏擊', text: '當年競技場養來表演的蟒，住在舊飼育場與淹水獸場的獸坑。平常沉在水裡只露眼睛，靠近了才起身噴毒、纏人。被纏住的人連按能掙開，同伴打痛牠也會鬆口。跑遠了，牠就滑回坑裡。' },
    dog: { name: '斷鍊鬥犬', temper: '成群巡邏', text: '獸欄巡邏犬，脖子上還掛著斷項圈。人走了十二年，牠們每天照舊沿著巡邏路走，在當年的哨點停下來嗅一嗅。前方看得遠，側後方看得近。開打時會有一隻先長吠叫同伴，重攻擊或暈眩打得斷；狗群專撲站得最遠的人。' }
  },
  // 區域說明的替換（LORE.zones）
  zones: {
    quarry: '峽谷翻過舊山脊的外谷。從前的採石場和白鹽臺，如今是猛虎的地盤。',
    wings: '獸欄高牆的左右兩翼：舊飼育場、馴獸師哨站、運鐵坡道和霜泉。這裡的野獸都是十幾級；舊飼育場的水坑裡有東西。'
  },
  terms: {
    獸徑: '斷鍊鬥犬每天走的巡邏路。草被踩平成一條帶子，泥裡疊著爪印。親眼看過的那一段，會畫進自己的地圖。',
    淹水獸坑: '舊飼育場積了水的獸坑，沼蟒沉在裡面。水面冒細泡、有一雙眼睛的，就別再往前。',
    試煉: '巴索在戰績簿上開的場子。九個，分三級；每個第一次過關有賞，之後只記最佳時間。沒有期限，隨時都能打。',
    百場連戰: '十波連打，不准帶藥水與料理（巴索代管，出場還你），倒下就結束。每個人第一次打完，領一個稀有天賦球箱；之後只記打到第幾波。',
    攻略團名冊: '巴索在斷鍊之夜隔天備好的名冊。學會鐵鬃三招的人，名字才寫得進去。',
    對決: '兩個人在競技場裡互相邀請、同意後開打。三分鐘、點到為止，先倒的輸；不算殺人，也不扣東西。'
  },
  // NPC08.when 的條件代號（玩法判定）
  needs: {
    trialsAll: '試煉全部過關（0.8 若只先上第三級三個，就是這三個全過；第一、二級補上後改成九個全過）。'
  },
  // 0.8 的玩法事件（objectives[].cond，掛在 reach 目標上）。和 LORE.acts 同一格式，merge08 會併進去
  acts: {
    doBisonStun: '讓衝過來的野牛（含狂牛）撞上鹽壁、岩石或牆而暈倒（beastai07 的 bison_daze）。要是這個玩家惹的那頭牛（在牠的仇恨名單上、60 公尺內）。',
    doCoilFree: '被沼蟒纏住後自己連按掙脫，或打掉夠多血讓纏著同伴的沼蟒鬆口（兩者都算；救人的人與被救的人都算一次）。',
    doPatrolSeen: '看見一群巡邏中的斷鍊鬥犬走過（巡邏狀態、在你前方 25 公尺內、維持 2 秒；被發現開打也算）。',
    doBarkBreak: '用重攻擊或暈眩打斷鬥犬（含鐵牙）的長吠。',
    doSaltCalm: '在鹽原的鹽壁敲下一塊岩鹽，而且這一下沒有驚動牛群。驚動＝敲下那一塊時，你或你的隊友正在和野牛打（在任一頭野牛的仇恨名單上），這一塊不算數、不扣東西。被警告後退開、用捕獸夾或絆索鈴把牛嚇開、牛群已經被打倒都不算驚動。count 6 ＝六塊。',
    doTrial: '通過試煉（doTrial:<試煉代號>，TRIALS08 的 id：1-1～3-3）。第一次或之後再過都算。',
    doChestnut: '拿到「栗子」的項圈（doChestnut:feed 帶著骨頭、在狗群發現你之前走到牠 6 公尺內：牠聞過骨頭、低頭讓你解下項圈（項圈直接進背包），再帶狗群走開；doChestnut:kill 打倒牠）。不寫參數＝兩種都算；s11 用 alt: \'doChestnut:kill\' 挑回報台詞。',
    doIronOre: '在運鐵坡道翻倒的礦車上敲下一塊上層鐵塊（只有接了 s12 才敲得出來）。'
  },
  // 0.9 線索在哪（給製作團隊看，不顯示）
  secrets: [
    '0.9「最後的馴獸師」：m12 哈根「當年餵那些蟒的，是馴獸師長本人」；鐵牙項圈的記號（trophy_irontooth、托比的傳聞）；舊飼育場的地點說明「籠子的鎖是開著的」（只在 STORY_PLACES08.prop 與 PLACE_NOTES08，不做觸發）；m13 布蘿娜「扣舌是推回去的」。',
    '0.9「無冠的冠軍」：巴索的傳聞「第一百場那一格，我留著沒填」；葛倫在試煉全部過關後的傳聞「當年開賽前，角鬥士要面向北門舉盾」（NPC08.instructor.when）。',
    '沒有洩漏鐵鬃的召喚、狂暴、項圈弱點：鬥犬的長吠只講鬥犬自己，沒有人說「鐵鬃也會」。'
  ]
};

/* ============================== 合併 ============================== */
let merged = false;
const swap = (arr, o, n) => { if (!Array.isArray(arr)) return; const i = arr.indexOf(o); if (i >= 0) arr[i] = n; };
export function applyShadow08(NPCS, QUESTS, LORE) {
  if (!SHADOW_SPOT08) return 0;
  const nu = s => s.replace('{影牙新出沒點}', SHADOW_SPOT08); let n = 0;
  const s08 = QUESTS.find(q => q.id === 's08'), m09 = QUESTS.find(q => q.id === 'm09');
  for (const r of SHADOW08) {
    const v = nu(r.nu);
    if (r.where === 'merchant.rumors' && NPCS.merchant) { const b = NPCS.merchant.rumors.indexOf(r.old); if (b >= 0) { NPCS.merchant.rumors[b] = v; n++; } }
    if (r.where === 's08.desc' && s08 && s08.desc === r.old) { s08.desc = v; n++; }
    if (r.where === 's08.progress' && s08) { const b = s08.text.progress.indexOf(r.old); if (b >= 0) { s08.text.progress[b] = v; n++; } }
    if (r.where === 'm09.say.merchant' && m09) for (const o of m09.objectives) { const b = (o.say || []).indexOf(r.old); if (b >= 0) { o.say[b] = v; n++; } }
    if (r.where === 'lore.elites.trophy_shadow' && LORE && LORE.elites && LORE.elites.trophy_shadow && LORE.elites.trophy_shadow.where === r.old) { LORE.elites.trophy_shadow.where = v; n++; }
  }
  return n;
}
// 事件接好前不開放的任務（定案第 3 版 2-2「開放條件」）：整個任務只靠這個事件判定，沒接時 reach 的退路會讓人「走到就完成」。
// 玩法接好事件後，在 story.js 呼叫 merge08 時把事件名放進第六個參數 ready，例：merge08(NPCS, PLACES, QUESTS, LORE, PLACE_NOTES, ['doTrial', 'doSaltCalm', 'doIronOre'])。
// 沒傳 ready（或沒列到）＝這幾個任務不併進 QUESTS。s14 的前置是 s09，s09 沒開時 s14 一起不併（免得前置指到不存在的任務）。
export const GATED08 = { m14: 'doTrial', s09: 'doSaltCalm', s12: 'doIronOre', s14: 'doSaltCalm' };
export function merge08(NPCS, PLACES, QUESTS, LORE, NOTES, ready) {
  if (merged) return; merged = true;
  const ok = new Set(ready || []);
  for (const id in STORY_PLACES08) if (!PLACES[id]) PLACES[id] = STORY_PLACES08[id];
  for (const q of QUESTS08) if (!(GATED08[q.id] && !ok.has(GATED08[q.id])) && !QUESTS.some(x => x.id === q.id)) QUESTS.push(q);
  for (const id in NPC08) {
    const Np = NPCS[id], A = NPC08[id]; if (!Np) continue;
    for (const [o, n] of A.replaceIdle || []) swap(Np.idle, o, n);
    for (const [o, n] of A.replaceRumors || []) swap(Np.rumors, o, n);
    if (A.idle) Np.idle = (Np.idle || []).concat(A.idle.filter(t => !(Np.idle || []).includes(t)));
    if (A.rumors) Np.rumors = (Np.rumors || []).concat(A.rumors.filter(t => !(Np.rumors || []).includes(t)));
    if (A.when) Np.when = (Np.when || []).concat(A.when);      // 條件句另外放，由對話介面在條件成立時才加進去
  }
  if (LORE) {
    if (LORE.elites) Object.assign(LORE.elites, LORE08.elites);
    if (LORE.beasts) Object.assign(LORE.beasts, LORE08.beasts);
    if (LORE.zones) Object.assign(LORE.zones, LORE08.zones);
    if (LORE.terms) Object.assign(LORE.terms, LORE08.terms);
    if (LORE.acts) Object.assign(LORE.acts, LORE08.acts);
    if (Array.isArray(LORE.secrets)) for (const s of LORE08.secrets) if (!LORE.secrets.includes(s)) LORE.secrets.push(s);
    LORE.items08 = LORE08.items; LORE.needs08 = LORE08.needs; LORE.trials = TRIALS08; LORE.arena = ARENA08;
  }
  if (NOTES) for (const id in PLACE_NOTES08) if (NOTES[id]) NOTES[id].note = PLACE_NOTES08[id];
  applyShadow08(NPCS, QUESTS, LORE);
}
