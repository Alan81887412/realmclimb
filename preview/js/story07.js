// 0.7「走遍原野」的劇情資料：f01–f04 四個任務、陷阱的故事與托比的提醒、米洛收魚與芬恩繪圖的台詞、魚與地圖的說明文字、各 NPC 多出來的閒聊與傳聞。
// 只依賴 keys.js。story.js 在檔尾呼叫 merge07(...) 把這裡的東西併進 NPCS／PLACES／QUESTS／LORE（補丁 story.js-patch.py，只有匯入＋一行呼叫）。
// 格式照 story.js 檔頭；0.7 多加的選用欄位（遊戲端沒接也不會壞）：
//   QUESTS[].unlock.explore  [區域代號, 比例]：那一區「自己走過」的比例達到才接得到（'any'＝任一區）。判定在 w7-map 的 maps07.js（unlockOk）與它的 game.js 補丁
//   f01 的竹釣竿由 w7-fish 的 fish07.js 在接下時給（身上沒有竿才給），所以獎勵不放 rod_1；目標照釣魚成員的建議：doFishAt:whisper_pool ×1、doCook:food_fish ×1；f02 的第一張空白地圖由 w7-map 的 maps07.js 在第一次打開繪圖桌時給（身上沒有才給）
// 玩法事件（objectives[].cond，do 開頭，由各玩法成員的程式呼叫 questAct）：見 LORE07_ACTS 與交回報告。
import { keyOf } from './keys.js';
const K = a => `「${keyOf(a)}」`;

/* ============================== 地點（併進 PLACES） ============================== */
// 代號與座標照 w7-wild 的 places07.js（PLACES07：trap_clearing、tavern_board、draw_table）。places07.js 是動態載入的，board07.js 的 init 會再用它的座標覆蓋一次
export const STORY_PLACES07 = {
  draw_table: { name: '芬恩的繪圖桌', x: 20.15, z: 13.3, r: 3, zone: 'town', prop: '市集旁的長桌，桌上攤著地圖、墨與尺' },
  trap_clearing: { name: '營地旁的空地', x: -111.85, z: -10.05, r: 6, zone: 'forest', prop: '兩個半埋在土裡的舊捕獸夾（教學用，每人一份）' },
  tavern_board: { name: '酒館門口的委託板', x: -20.25, z: -11.85, r: 3, zone: 'town', prop: '九十九場門口的木板，釘著三張委託' }
};
export function setPlace07(id, x, z, r) { const p = STORY_PLACES07[id]; if (!p) return; p.x = x; p.z = z; if (r) p.r = r; }

/* ============================== 任務 f01–f04 ============================== */
// 經驗與金幣比照同級支線（c04、s03、c03、s05），數值成員重算後改這裡就好
const T = { zone: 'town' }, FOREST = { zone: 'forest' };
export const QUESTS07 = [
  {
    id: 'f01', name: '水邊的耐心', type: 'side', rating: 1, lv: 4, giver: 'hunter', pre: ['m08'], keys: ['interact'], teach: ['food_fish'],
    desc: '哈根給你一根竹釣竿：到低語潭釣魚，再用營火烤成一份烤河魚（一份要兩尾魚）。釣魚不扣飽食和精力。',
    objectives: [
      { kind: 'reach', target: 'whisper_pool', count: 2, get label() { return `在低語潭邊按${K('interact')}拿出釣竿，釣上兩尾魚（烤一份要兩尾）`; }, hint: { x: -136, z: 48, r: 30 }, cond: 'doFishAt:whisper_pool' },
      { kind: 'reach', target: 'hunter_camp', count: 1, label: '用營火烤一份烤河魚（要兩尾魚）', hint: null, cond: 'doCook:food_fish' }
    ],
    rewards: { exp: 780, gold: 60, items: { meat: 2 }, orbChoice: null, recipes: ['food_fish'] },
    text: {
      offer: ['……坐。今天不打獵。', '打獵靠腿，靠眼睛。釣魚靠的是坐得住。', '低語潭有魚。十二年沒人釣，長得比我還老。', '竿子拿去。竹子削的，不會壞。', '釣上來，在火上烤了。烤一份要兩尾。烤好拿來我看。'],
      accept: ['拋出去，等浮標沉。沉了再拉，別早。', '線繃太緊會斷，放太鬆魚會跑。跟拉弓一樣，滿了就放一點。', '身上帶塊肉，會自己拿去當餌。魚跟人一樣，看到肉才肯靠過來。', '被野獸打中就收竿。那一尾，算牠運氣好。'],
      progress: ['釣上來，烤好。一份兩尾。就這樣。', '魚跑了？呵。牠也想活。下一尾。'],
      done: ['……嗯。皮烤得脆。', '吃了它，閃跟衝都省力。', '釣魚的錢比不上打獵。可是水邊沒有牙，也不用喝藥。你自己挑。', '吃不完的魚拿去給米洛。他十二年沒吃過魚，價錢會開得很好看。', '肉拿去當餌。別全吃了。']
    },
    discover: null
  },
  {
    id: 'f02', name: '第一張圖', type: 'side', rating: 1, lv: 3, giver: 'surveyor', pre: ['m04'], keys: ['bag'],
    unlock: { explore: ['meadow', 0.3] },
    desc: '芬恩要教你畫圖：到他的繪圖桌，用他給的空白地圖把你走過的風吹草原畫下來。畫好的手繪地圖可以送給還沒去過的人。',
    objectives: [{ kind: 'reach', target: 'draw_table', count: 1, label: '在芬恩的繪圖桌畫一張風吹草原', hint: T, cond: 'doDraw:meadow' }],
    rewards: { exp: 270, gold: 30, items: { map_blank: 1 }, orbChoice: null },
    text: {
      offer: ['你回來啦！等等——你身上有草原的味道。', '我看看你的地圖……三成了！比我這輩子走得還多。', '我教你畫圖。你走過的地方用墨畫在紙上，就能送給別人。', '剛出城的人，一格一格揭霧，揭得很辛苦。有了圖，就不用從白紙開始。', '空白地圖我放在桌上了。在我的繪圖桌畫一張風吹草原。'],
      accept: ['只畫得出你自己走過的。沒去過的地方，我也畫不出來——我是說，誰都畫不出來。', '桌子就在我旁邊。要墨、要光、要平的桌面。野外畫不了，風一吹線就歪到隔壁去。', '畫好的那張可以送人。走到朋友身邊，打開背包拿給他。'],
      progress: ['空白地圖攤在桌上，選風吹草原。墨我磨好了。', '線條歪一點沒關係。我的也歪，只是歪的方向比較一致。'],
      done: ['給我看看——', '……這是南大道，這是風車，這裡是鏡池。對，都對！', '線條比我的直。我有點不甘心。', '那張你留著，或送給剛出城的人。這張空白的再給你。', '以後桌子隨你用。空白地圖我和米洛都有，一張二十金，畫整層的大張一百二十。', '哪一區你自己走滿九成，拿來給我看。我付測繪費。']
    },
    discover: null
  },
  {
    id: 'f03', name: '當年的夾子', type: 'side', rating: 1, lv: 3, giver: 'hunter', pre: ['m06'], keys: ['interact'],
    desc: '斷鍊之夜後，城裡的獵戶在路上埋了捕獸夾，哈根也是其中一個。他在營地旁的空地埋了兩個舊夾子，要教你怎麼拆。',
    objectives: [{ kind: 'reach', target: 'trap_clearing', count: 2, get label() { return `站在夾子旁按住${K('interact')}，拆掉教學用的夾子`; }, hint: { x: -111.85, z: -10.05, r: 10 }, cond: 'doDisarm:f03' }],
    rewards: { exp: 270, gold: 30, items: { scrap: 2 }, orbChoice: null },
    text: {
      offer: ['……路上，看到紅布樁沒有。插在路邊，布都褪色了。', '那是記號。樁子附近，埋著夾子。', '斷鍊那一夜之後，獵戶在每條往城牆的路上埋夾子、拉繩鈴。野獸靠近城牆，先夾住，先聽到。', '我也埋過。埋了幾個，埋在哪，記不全了。', '後來人都退回城裡，夾子還在。野獸住了十二年，認得鐵味，會繞。現在踩到的，只剩人。', '營地旁那塊空地，我埋了兩個舊的。去拆了。我教你。'],
      accept: ['先看地。土翻過一圈，有一點鐵光。看到了，就別踩。', '蹲在旁邊，壓住彈簧，慢慢鬆。手別急。急的人，手指頭少一根。', '鐵件拆下來留著。布蘿娜收。'],
      progress: ['兩個。拆完回來。', '被夾了？呵。我當年也被自己的夾子咬過。'],
      done: ['手指都在。好。', '以後路上看到，能拆就拆。拆一個，就少一個新來的被咬。', '拆不了，就拿武器敲它，讓它空夾。或者繞過去。', '繩鈴不傷人。可是鈴一響，附近的野獸都會過來。比夾子麻煩。', '鐵件拿去。當年的鐵，比現在的好。']
    },
    discover: null
  },
  {
    id: 'f04', name: '畫滿一張', type: 'side', rating: 2, lv: 5, giver: 'surveyor', pre: ['f02'], keys: ['map'],
    unlock: { explore: ['any', 0.9] },
    desc: '你有一區自己走滿了九成。在芬恩的繪圖桌把那一區攤開給他量一次（繪圖桌的「測繪費」那一欄）。',
    objectives: [{ kind: 'reach', target: 'draw_table', count: 1, label: '在繪圖桌把走滿九成的那一區攤給芬恩量', hint: T, cond: 'doShowMap' }],
    rewards: { exp: 1240, gold: 80, items: { orb_survey: 1 }, orbChoice: null },
    text: {
      offer: ['等一下，你那張圖借我看——', '九成！這一區你幾乎每一步都踩過了？', '我師父說過，走滿一張圖的人，眼睛會變。看得比別人遠，看得到別人看不到的東西。', '我不是你師父，可是我有他留下的東西。', '把圖攤在桌上，讓我好好量一次。'],
      accept: ['到繪圖桌那邊把那一區攤開，我用尺量。你別笑。'],
      progress: ['到繪圖桌把那一區攤開，我才量得準。'],
      done: ['……量完了。沒有一條線是猜的。', '這顆球是我師父的。他走過整整一層，畫了一輩子的圖。', '握碎它，走過的地方會記得更寬，路上的舊夾子遠遠就看得到，畫圖也不用等。', '要夠聰明、運氣也夠好才用得上。不夠的話，先收著。', '……其實我自己也想用。可是我走不了那麼遠。給會走的人比較好。']
    },
    discover: null
  }
];

/* ============================== NPC 多出來的話（併進 NPCS） ============================== */
// add：附加在 idle／rumors 後面｜replace：[舊句, 新句]（舊句找不到就略過）
export const NPC07 = {
  merchant: {
    replace: [['空白地圖還在路上。講真的，路斷了十二年，我也不知道它走到哪了。', '空白地圖到貨了！一張二十，畫整層的大張一百二十。講真的，十二年來第一批新貨。']],
    idle: ['魚我收，生的就好。烤過的我不收，那是你的晚餐。', '越危險的水邊，魚越值錢。不是我定的，是城裡的嘴定的。'],
    rumors: ['商隊的人說，霜泉的魚冷得像冰塊。一尾抵好幾尾鏡鯽。講真的，我只聽過沒吃過。', '長灣夜裡有一尾大魚，鬍子比槳還長。釣到的話……老闆，那種的我不敢收。']
  },
  guard: {
    idle: ['依規定，看到紅布樁要放慢腳步。樁子倒了的也算。', '報告：被夾子咬到，連按互動鍵掙得比較快。這是我被咬過以後才知道的。'],
    rumors: ['報告：巡邏隊的舊紀錄寫著，城外每條路都埋過夾子。埋在哪的那一頁，被雨淋糊了。']
  },
  hunter: {
    idle: ['水邊坐久了，心會靜。呵，跟等熊坐回去一樣。', '紅布樁倒了，夾子還在。看地，別看天。', '荒地的野獸多。離路遠了，就是牠們的地方。先吃飽，再進去。'],
    rumors: ['南大道第一個彎那個夾子，是我埋的。彈簧大概還很緊。', '野獸不踩夾子。十二年，鐵味牠們記得比人清楚。']
  },
  surveyor: {
    idle: ['空白地圖畫一區二十金，大張的畫整層一百二十。畫好的送人，人家就不用從白紙開始。', '抄來的圖是褐色的，粗一點。自己走一遍，那一塊就變彩色了。', '菁英在哪、隱藏的事在哪，我從來不畫。那種的，要用嘴問。'],
    rumors: ['老圖上，有些路邊畫著小小的紅點。我一直以為是墨滴。現在想想……是紅布樁吧？', '離大路越遠，爪痕越多。地圖上一片白的地方，大多就在那裡。']
  },
  tavern: {
    idle: ['門口那塊委託板，城裡誰缺人手就釘一張。做完回板子交件，錢我先墊。', '欸我跟你講，魚湯要放水芹，不然有腥味。', '委託不想做就撕掉，我馬上補一張。不扣錢，也不記仇。'],
    rumors: ['我阿爸說，斷鍊那一夜以後，獵戶每晚出城埋夾子。埋到最後，自己也記不得埋在哪。']
  },
  smith: {
    idle: ['舊鐵件拿來！那批夾子的彈簧是我阿公打的，十二年了還咬得住人。氣死我，又有點得意。']
  },
  apothecary: {
    idle: ['被夾子咬過的腳踝，我一個月看三個。都說「我以為那是石頭」。', '魚膽很苦。苦的東西，通常有用。']
  },
  keeper: {
    rumors: ['各位觀眾——咳。斷鍊之夜過後，獵戶在每條路上埋夾子。那是這座城最後一次全體出動。']
  },
  instructor: {
    idle: ['踩到夾子，別慌。連按互動鍵。慌的人只會被夾更久。']
  }
};

/* ============================== 陷阱的故事、提示與托比的提醒（給 w7-wild；places07.js 也有一個 TRAP07＝陷阱的數字，名字故意分開） ============================== */
export const TRAP_TEXT = {
  story: [
    '斷鍊之夜後的那個冬天，城裡的獵戶在每條通往城牆的路上埋了捕獸夾、拉了絆索鈴，要在野獸靠近城牆之前先聽到、先夾住。',
    '路邊插一根紅布樁當記號，附近十五公尺內就有陷阱。後來人退回城裡，沒人記得埋在哪；很多紅布樁也倒了。',
    '野獸在原野住了十二年，認得鐵的味道，會繞開。現在會踩到的，只剩人。哈根是當年埋夾子的人之一。'
  ],
    // 托比的話（不含說話者名字：traps07.js 用 ui.chat('托比', 句子) 一句一句講；board07.js 的備援用旁白時才加「托比：」）
  toby: ['報告！等一下！依規定我得補充一條。', '南門外第一個彎，路邊有根紅布樁。紅布樁附近十五公尺內，埋著舊夾子。', '土翻過一圈、有一點鐵光的地方，別踩。', '踩到了會被夾住一下。連按互動鍵能早點掙開，隊友也能幫你扳開。', '想學拆，去問獵人營地的哈根。他……他當年也埋過。這是隊長說的，不是我說的。'],
  look: { jaw: '土翻過一圈，有一點鐵光。', bell: '一條細繩橫過路面，繩上掛著鈴鐺。', stake: '一根褪色的紅布樁。附近十五公尺內埋著舊陷阱。', stakeDown: '倒在草裡的紅布樁。附近可能還有陷阱。' },
  caught: '喀！捕獸夾咬住了腳踝。',
  caughtTip: () => `連按${K('interact')}掙開，隊友走過來也能幫你扳開。`,
  freed: '你掙開了夾子。',
  freedBy: name => `${name}扳開了夾子。`,
  bell: '叮鈴——繩鈴響了。附近的野獸都聽到了。',
  noise: '鐵響傳得很遠。附近的野獸被引過來了。',
  disarmHold: () => `按住${K('interact')}拆夾子`,
  cutHold: () => `按住${K('interact')}割斷繩子`,
  disarmed: '夾子拆下來了。',
  cut: '你割斷了繩子，鈴鐺掉進草裡。',
  notLearned: '你不知道怎麼拆。去問獵人營地的哈根，或者用武器敲它，讓它空夾。',
  bellNoHit: '繩子太細，打不斷。繞過去，或乾脆讓它響。',
  sprung: '夾子「喀」地空夾了。',
  interrupted: '挨打了，手一抖，沒拆成。',
  othersGone: name => `${name}拆掉了一個舊陷阱。`,
  tutorial: '這是哈根埋的教學用夾子。拆了也不會再長回來。',
  // 荒地（離路 30 公尺以上）的場景標記與第一次走進去的提示
  wild: { enter: '你離開大路了。荒地的野獸比較多，採集點也長得比較大。', claw: '樹皮上有新鮮的爪痕，比你的頭還高。', bones: '一堆啃乾淨的骨頭。', den: '一塊壓平的草窩，還有一點溫度。', tracks: '地上的腳印一層疊一層。' }
};

/* 米洛收魚、哈根做釣竿的正式台詞：直接寫成 fish07.js-patch.py（換掉 fish07.js 的 service() 裡的暫用句） */

/* ============================== 芬恩與繪圖桌、送圖、測繪費（給 w7-map） ============================== */
// 帶 {} 的是範本：{area} 區域名｜{pct} 幾成（整數百分比）｜{by} 畫圖的人｜{date} 日期｜{gold} 金幣｜{from} 送的人｜{to} 收的人
export const FINN07 = {
  open: '桌子借你。墨在左邊，尺在右邊，別拿反了。',
  locked: '桌子？等一下，我先教你怎麼畫。走過草原三成再來找我。',
  tooLittle: '「{area}」你自己走過的不到一成。沒去過的地方，我畫不出來——你也一樣。',
  copyOnly: '這一塊是別人畫給你的吧？抄來的圖不能再抄。自己走一遍，就是你的了。',
  noPaper: '要空白地圖。我這裡一張二十金，米洛那邊也是。畫整層要大張的。',
  full: '你身上已經有五張了。先送掉幾張，紙會皺的。',
  drawing: '沙沙沙……',
  drawn: '畫好了。墨還沒乾，別折。',
  drawnAll: '整層都畫上去了。這張拿出去，人家會以為你是老圖師。',
  wild: '野外畫不了。要桌子、要墨、要光。回城找我。',
  // 送圖
  giveAsk: '{from}想送你：手繪地圖《{area}》（畫了 {pct}%），收下嗎？',
  giveSent: '把手繪地圖遞給{to}……',
  giveOk: '{to}收下了手繪地圖《{area}》。',
  giveGot: '收下了{from}畫的《{area}》。褐色的那一塊就是抄來的，自己走過會變彩色。',
  giveNo: '{to}沒有收下。地圖還在你身上。',
  giveTimeout: '{to}沒有回應。地圖還在你身上。',
  giveFar: '走近一點再送（8 公尺內）。',
  giveCombat: '戰鬥中不能送圖。',
  giveDup: '這張你已經收過了。',
  hoverCopy: '抄自：{by}（{date}）',
  // 測繪費（一區自己走過九成，付一次：照區域的同級 G1×5 分鐘，150–720 金，算法在 maps07.js 的 feeOf）
  feeOpt: '「{area}」走滿九成了，量給你看',
  fee: ['九成？讓我量——', '……對，這一區的圖我收了。測繪費 {gold} 金。', '以後有人問這一區的路，我就說：去問你。'],
  feePaid: '「{area}」的測繪費已經給過了。我是窮，可是帳很清楚。',
  // 天賦球：測繪 生效時的一句
  orbOn: '你看地圖的眼光不一樣了：走過的地方記得更寬，陷阱遠遠就看得到。'
};

/* 魚、魚素材、釣竿、地圖、測繪天賦球的說明：直接寫成 data07.js-patch.py（只換 desc 字串） */

/* ============================== 釣魚時的短句（給 w7-fish，要用就用） ============================== */
export const FISH07 = {
  ready: () => `按住滑鼠左鍵蓄力，放開拋竿。移動或按 Esc 收竿。`,
  wait: '浮標靜靜地浮著……',
  bite: '浮標沉下去了！',
  lateBite: '慢了一拍，魚吐鉤跑了。',
  snap: '線斷了。',
  escape: '線放太鬆，魚跑了。',
  hit: '被打中了，收竿。那一尾跑了。',
  swim: '游泳的時候不能釣魚。',
  far: '離水邊太遠了。',
  first: name => `第一次釣到${name}！`,
  boss: name => `是「主」——${name}！`,
  clean: '一次都沒進紅區，漂亮！',
  bait: name => `用了一份${name}當餌。`,
  record: (name, cm) => `${name}，${cm} 公分。新紀錄！`
};

/* ============================== 世界觀（併進 LORE） ============================== */
export const LORE07 = {
  history: { when: '斷鍊之夜後的那個冬天', what: '城裡的獵戶在每條通往城牆的路上埋了捕獸夾、拉了絆索鈴，路邊插紅布樁當記號。人退回城裡以後，沒人記得埋在哪。' },
  terms: {
    迷霧: '城外沒人走過的地方，地圖上是一片白。走過就記下來；走過的人也可以在芬恩的繪圖桌畫成手繪地圖，送給還沒去過的人。',
    紅布樁: '當年獵戶埋陷阱時插的記號。樁子附近十五公尺內有捕獸夾或絆索鈴，但不說在哪。草原的每個陷阱旁都有，越往外越少。',
    手繪地圖: '用空白地圖在芬恩的繪圖桌畫的地圖，只畫得出自己走過的地方。收到的是褐色抄本，比較粗，不算探索度，也不能再畫給別人。',
    荒地: '離大路三十公尺以上、離營火五十公尺以上的地方。野獸比較多，採集點長成大株的機會也比較大。',
    委託板: '「九十九場」酒館門口的木板。永遠有三張委託，做完或撕掉就補一張，沒有期限、沒有次數。'
  },
  // 0.7 的玩法事件（objectives[].cond）。和 story.js 的 LORE.acts 同一個格式，merge07 會併進去
  acts: {
    doFish: '釣上任何一尾魚（主也算）。doFish:<魚的代號> 指定哪一種（例：doFish:fish_catfish）；doFishBoss 釣上「主」。',
    doFishAt: '在某一處水邊釣上一尾魚（doFishAt:<水域代號>，places06.js 的 WATERS：mirror_pond、whisper_pool、brook、long_bay、moss_falls、quarry_lake、frost_spring）。',
    doGut: '分解一尾魚（doGut:<魚的代號>）。（目前沒有任務用到）',
    doSellFish: '賣一尾魚給米洛。（目前沒有任務用到）',
    doRod: '請哈根把釣竿改成下一階（doRod:<釣竿代號>）。（目前沒有任務用到）',
    doDraw: '在繪圖桌畫好一張手繪地圖（doDraw:<區域代號>；畫整層時是 doDraw:all，另外每一區也各算一次）。',
    doGiveMap: '送出一張手繪地圖，對方收下了。doGetMap 是收下別人的。（目前沒有任務用到）',
    doShowMap: '把走滿九成的一區拿給芬恩看（doSurveyFee：同時領到測繪費）。（目前沒有任務用到：f04 用走到繪圖桌判定）',
    doDisarm: '拆掉一個陷阱（doDisarm:jaw 捕獸夾｜doDisarm:bell 絆索鈴｜doDisarm:f03 f03 的教學用夾子）。',
    doTrap: '踩到陷阱（doSpring 打空夾子、doTrapFree 掙開或被救出、doToby 托比提醒過了）。（目前沒有任務用到）'
  }
};

/* ============================== 合併 ============================== */
let merged = false;
export function merge07(NPCS, PLACES, QUESTS, LORE) {
  if (merged) return; merged = true;
  for (const id in STORY_PLACES07) if (!PLACES[id]) PLACES[id] = STORY_PLACES07[id];
  for (const q of QUESTS07) if (!QUESTS.some(x => x.id === q.id)) QUESTS.push(q);
  for (const id in NPC07) {
    const N = NPCS[id], A = NPC07[id]; if (!N) continue;
    for (const [o, n] of A.replace || []) { const i = (N.idle || []).indexOf(o); if (i >= 0) N.idle[i] = n; }
    if (A.idle) N.idle = (N.idle || []).concat(A.idle.filter(t => !N.idle.includes(t)));
    if (A.rumors) N.rumors = (N.rumors || []).concat(A.rumors.filter(t => !(N.rumors || []).includes(t)));
  }
  if (LORE) {
    if (Array.isArray(LORE.history) && !LORE.history.some(h => h.when === LORE07.history.when)) { const i = LORE.history.findIndex(h => h.when === '那一夜之後'); LORE.history.splice(i >= 0 ? i + 1 : LORE.history.length, 0, LORE07.history); }
    if (LORE.terms) Object.assign(LORE.terms, LORE07.terms);
    if (LORE.acts) Object.assign(LORE.acts, LORE07.acts);
    LORE.traps = { name: '路上的舊陷阱', text: TRAP_TEXT.story };
  }
}
