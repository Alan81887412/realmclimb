// 0.8 介面：菁英名牌（六隻）、施法條（長吠／召集）、拖入坑底倒數圈、掙脫條 #e8struggle、懸賞告示（ui-e）
// 只靠 init(H, D) 給的東西；可 import ./core.js、./data06.js、./data07.js（純資料）與 ./sil08.js（剪影）。不碰 game.js、ui.js、fx.js、beastai07.js。
//
// 名牌 DOM 的做法（game.js 每幀只改 tag.el 的 transform、只用 tag.name／tag.fill／tag.say 三個「元素參考」）：
//   我只在 tag.el 裡加東西、加 class：把原本的 .tag-name 與 .tag-bar 搬進新的列（元素還是同一個，game.js 的參考不會失效）、
//   原本的 .tag-say 不動；每幀檢查「名牌還在不在我的樣子」，被改掉就補回（名字被 game.js 重寫、class 被洗掉都會補）。
//   施法條、倒數圈、「打斷！」都是絕對定位掛在 tag.el 底下，不改名牌的流動高度，所以開始施法時名牌不會往上跳。
// D 需要：mons() eliteInfo(v) cast(v) on('cast', fn) dragged() struggle() bounties()（形狀看 d8-ui/mock/stub08.js；缺的欄位都寫在報告裡）
import { ITEMS } from './core.js';
import { ITEMS06 } from './data06.js';
import { ITEMS07 } from './data07.js';
import { silSvg as silSvg0, SIL } from './sil08.js';

let H, D, errN = 0;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const html = (t, c, h) => { const e = el(t, c); e.innerHTML = h; return e; };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/* 0.8 新菁英的剪影（sil08.js 還沒有鹿、鱷、猩猩、岩羊；都朝左，和 sil08 的野豬、鬥犬一致）；獄卒長用鬥犬 */
const SILX = {
  deer: '<path d="M52 20C52 15 46 12.6 38 12.6C32 12.6 28.6 13.4 26.4 14.6C24.6 11.6 22 9 18.4 8L14 9.2L8.6 15L9.6 18L15 17.4C17 17.2 19.4 17.8 21.2 19.4L21.4 24.4L22 36H24.8L25.6 27C30 28 38 28 41 27L42 36H44.8L45.4 26C49.6 25.4 52 23.4 52 20Z"/><path d="M18.4 8L17.2 2.8M17.2 2.8L13.2 2.2M17.2 2.8L21 2.4M21.6 9.2L25 3.6M25 3.6L28.4 3.8M25 3.6L24.6 1.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  croc: '<path d="M2 23.4C2 21.4 6 20.6 10 21L14 19.6C18 18.4 24 18 30 18.4C40 18 48 19.4 56 22C60 23.4 62 25 62 26C58 25.6 52 27 44 27.6L24 28L12 28C6 28 2 26.4 2 23.4Z"/><path d="M20 28L17.4 33.6H23L25 28ZM41 27.6L39.6 33.6H45.4L47 27.2Z"/><path d="M24 18.4L26 15.6L28 18.4M32 18.2L34 15.4L36 18.4M40 18.6L42 15.8L44 18.8" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12.4" cy="19.6" r="1.8" fill="#f4ecd9"/>',
  ape: '<path d="M18 12.6C18 8.4 22 6.2 27 6.6C33 7 40 9.6 44.4 15C48.4 20 48.6 27 46.4 31.6L48.4 36H41.4L39.4 32.6L30.6 31.6L28.6 36H22.4L23.4 31.2C20.6 28.6 19.6 25 19.8 21.6C16.4 21.2 13.4 23 12.4 26L13.4 31.6H8L7.6 25C8 19.6 12 14.6 18 12.6Z"/><circle cx="19.4" cy="14.2" r="1.3" fill="#f4ecd9"/><path d="M30 8C35 8 41 11 44 16" fill="none" stroke="#f4ecd9" stroke-width="2.4" stroke-linecap="round"/>',
  ibex: '<path d="M15 14.6L12.6 10.6L7.6 11.6L5.4 15.6L8.4 17.6L13 18L16.4 18.6C19.4 17.6 24 17.2 32 17.4C42 17.6 48 18.6 51 20.6L52 23.6L50 24.6L50 36H46L45.4 27.6C40 28.6 34 29 29 28.6L28 36H24L23.6 28L18.4 25L16.4 29L17 36H13L12.6 24.6Z"/><path d="M13.6 10.8C12.4 6 17.4 2.6 24.6 4.2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15.6 6.4L14.6 8M17.8 4.6L17.4 6.4" stroke="#f4ecd9" stroke-width="1" stroke-linecap="round"/>',
};
SILX.warden = SIL.dog;
const silSvg = k => (SILX[k] && !SIL[k] ? `<svg viewBox="0 0 64 40" fill="currentColor" style="color:currentColor" aria-hidden="true">${SILX[k]}</svg>` : silSvg0(k));

/* ========================= 徽記：盾形＋頭像（不再用整隻剪影，18px 看不出是什麼） =========================
   shield 22×24、頭像 16×16 左右、一律實色粗輪廓；主色取自 beasts07.js：
   狂牛 B「鐵角狂牛」＝鐵色 0x3a3836／舊鏽 0x7a3e1c／角骨 0xf0e6cc；大蟒蛇 B「深潭金紋蟒」＝底 0x2d473c、金 0xd8b04a；
   斷鍊・鐵牙（外觀還沒做）先取 SOFT.dog 的鐵灰 0x3e4046／鐵鏽 0x8a4826／刺環 0xc8ccd4。 */
const EMB = {
  bull: '<path d="M7 9.6C7 7.6 9.4 6.8 12 6.8S17 7.6 17 9.6L15.8 15.6C15.4 18.4 14 20.4 12 20.4S8.6 18.4 8.2 15.6Z"/><path d="M16.4 9C20.4 9.4 22.4 6.8 21.8 2.2C20.2 5.2 18.6 6 15.8 6.2Z"/><path d="M16.6 8h3.6" stroke="#1c140c" stroke-width="1.2" fill="none"/><path d="M7.6 9C4.8 9 3.4 7.6 3.4 5.4L8 6.2Z"/><ellipse cx="9.6" cy="11.6" rx="1.1" ry="1.3" fill="#1c140c"/><ellipse cx="14.4" cy="11.6" rx="1.1" ry="1.3" fill="#1c140c"/><ellipse cx="12" cy="17.6" rx="3" ry="2.1" fill="#1c140c" fill-opacity=".38"/><circle cx="10.9" cy="17.6" r=".7" fill="#1c140c"/><circle cx="13.1" cy="17.6" r=".7" fill="#1c140c"/>',
  python: '<path d="M6 20.2C2.6 17.6 4 13.4 8.6 13.2C12.2 13 13.2 11.4 12 10" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M8.6 13.2C12.4 13 18 13.8 18.6 17.2C19 19.6 16 20.6 13.6 20" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M8.4 6.2C8.6 3.6 11 2.2 13.8 2.6C16.6 3 17.4 5.2 16 6.8C14.8 8.2 12.4 9.8 10.6 9.6C8.8 9.4 8.3 7.8 8.4 6.2Z"/><circle cx="13" cy="5.2" r="1" fill="#1c140c"/><path d="M16.4 6.2L20.6 5.6M19 5.9L21.4 7.6M19 5.9L21 4.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  dog: '<path d="M5 3.2L10.4 8.4L9.4 11.6L5.4 10.8Z"/><path d="M9 8C12.4 6.6 16.6 7.6 17.6 10.2L21.2 11.4C22 11.8 22 13 21.4 13.6L18 14.6C16.6 17.2 13 17.6 10 16.4C7.2 15.4 5.8 13.2 6.6 10.8Z"/><circle cx="13.6" cy="10.6" r="1.1" fill="#1c140c"/><circle cx="21.2" cy="12" r=".9" fill="#1c140c"/><path d="M5.4 15.4L18 18.6L17.4 21.2L4.8 18Z" fill="#8a8e98"/><path d="M8.4 16.6L8 19.4M13 17.8L12.6 20.6" stroke="#1c140c" stroke-width="1" fill="none"/><path d="M5.6 20.2C4 21 3.6 22.6 5 23.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.6 1.2" stroke-linecap="round"/>',
  wolf: '<path d="M3.4 2.8L9.6 7.6C11 7.2 13 7.2 14.4 7.6L20.6 2.8L19.6 11.6C19.4 16 15.4 19.8 12 21.6C8.6 19.8 4.6 16 4.4 11.6Z"/><path d="M7.4 11.2L10.6 12.4M16.6 11.2L13.4 12.4" stroke="#1c140c" stroke-width="1.8" stroke-linecap="round"/><path d="M10.4 17.6L12 19.6L13.6 17.6Z" fill="#1c140c"/>',
  bear: '<circle cx="5.6" cy="6.4" r="3.2"/><circle cx="18.4" cy="6.4" r="3.2"/><circle cx="12" cy="12.6" r="8"/><ellipse cx="12" cy="15.8" rx="3.6" ry="2.8" fill="#1c140c" fill-opacity=".3"/><ellipse cx="12" cy="14.6" rx="1.5" ry="1" fill="#1c140c"/><circle cx="8.6" cy="10.6" r="1.1" fill="#1c140c"/><circle cx="15.4" cy="10.6" r="1.1" fill="#1c140c"/><path d="M15 6.4L9.2 17.4" stroke="#1c140c" stroke-width="1.5" stroke-linecap="round"/>',
  tiger: '<path d="M3.8 3.6L9 6.4C10.6 6 13.4 6 15 6.4L20.2 3.6L21 10.6C21 16.6 16.6 20.4 12 20.4S3 16.6 3 10.6Z"/><path d="M12 6.4V10.4M9.2 7.2L10 9.8M14.8 7.2L14 9.8M4.2 12.4L7 12.6M19.8 12.4L17 12.6" stroke="#1c140c" stroke-width="1.5" stroke-linecap="round"/><circle cx="8.6" cy="12.2" r="1.1" fill="#1c140c"/><circle cx="15.4" cy="12.2" r="1.1" fill="#1c140c"/><path d="M10.2 15.6H13.8L12 17.6Z" fill="#1c140c"/><path d="M12 17.6V19.2" stroke="#1c140c" stroke-width="1.1"/>',
  boar: '<path d="M8 7.6L9.2 3.4L10.8 7L12 2.8L13.2 7L14.8 3.4L16 7.6Z"/><path d="M3.4 6.4L8.4 8.2C10.2 7.4 13.8 7.4 15.6 8.2L20.6 6.4L19.8 13.2C19.2 18 16 21.2 12 21.2S4.8 18 4.2 13.2Z"/><ellipse cx="12" cy="16.4" rx="3.6" ry="2.6" fill="#1c140c" fill-opacity=".4"/><circle cx="10.8" cy="16.4" r=".8" fill="#1c140c"/><circle cx="13.2" cy="16.4" r=".8" fill="#1c140c"/><circle cx="8.4" cy="11.8" r="1.1" fill="#1c140c"/><circle cx="15.6" cy="11.8" r="1.1" fill="#1c140c"/><path d="M7.6 17.4L4.6 13L9.2 15.6ZM16.4 17.4L19.4 13L14.8 15.6Z" fill="#f4ecd9" stroke="#1c140c" stroke-width=".7" stroke-linejoin="round"/>',
  deer: '<path d="M9.4 10.4L6.2 5.6M6.2 5.6L3.4 4.8M6.2 5.6L5.6 2.4M14.6 10.4L17.8 5.6M17.8 5.6L20.6 4.8M17.8 5.6L18.4 2.4M7.8 8L5 8.6M16.2 8L19 8.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8.6 11.6L3.6 11L7.8 14.2ZM15.4 11.6L20.4 11L16.2 14.2Z"/><path d="M12 21.4C9 21.4 7.6 17.4 8 13.6C8.4 10.8 10 9.6 12 9.6S15.6 10.8 16 13.6C16.4 17.4 15 21.4 12 21.4Z"/><circle cx="10" cy="13.4" r="1" fill="#1c140c"/><circle cx="14" cy="13.4" r="1" fill="#1c140c"/><path d="M10.4 18.4H13.6L12 20.2Z" fill="#1c140c"/>',
  croc: '<path d="M6.8 4.2C9 3.2 15 3.2 17.2 4.2L16.2 9.4C16.8 12.2 17.6 14.8 17.2 18C16.6 21.4 14.2 22.6 12 22.6S7.4 21.4 6.8 18C6.4 14.8 7.2 12.2 7.8 9.4Z"/><circle cx="7.6" cy="4.4" r="2"/><circle cx="16.4" cy="4.4" r="2"/><circle cx="7.6" cy="4.4" r=".9" fill="#1c140c"/><circle cx="16.4" cy="4.4" r=".9" fill="#1c140c"/><circle cx="10.6" cy="20.2" r=".8" fill="#1c140c"/><circle cx="13.4" cy="20.2" r=".8" fill="#1c140c"/><path d="M7.6 11L9.2 11.8M7.4 14L9 14.6M7.4 17L9 17.4M16.4 11L14.8 11.8M16.6 14L15 14.6M16.6 17L15 17.4" stroke="#1c140c" stroke-width="1.1" stroke-linecap="round"/>',
  ape: '<circle cx="3.8" cy="12" r="2.4"/><circle cx="20.2" cy="12" r="2.4"/><path d="M12 2.6C7 2.6 4.4 6.4 4.4 11.4C4.4 17.6 7.8 21.6 12 21.6S19.6 17.6 19.6 11.4C19.6 6.4 17 2.6 12 2.6Z"/><path d="M7 9.6C9.4 8.2 14.6 8.2 17 9.6L16.6 12.4C14.6 13.4 9.4 13.4 7.4 12.4Z" fill="#1c140c" fill-opacity=".55"/><ellipse cx="12" cy="16.4" rx="4.8" ry="4.2" fill="#1c140c" fill-opacity=".62"/><circle cx="9.8" cy="11" r="1" fill="#f6f2e4"/><circle cx="14.2" cy="11" r="1" fill="#f6f2e4"/><circle cx="10.8" cy="15.6" r=".7" fill="#f6f2e4"/><circle cx="13.2" cy="15.6" r=".7" fill="#f6f2e4"/><path d="M10 18.6H14" stroke="#f6f2e4" stroke-width=".9" stroke-linecap="round"/>',
  ibex: '<path d="M9.4 9.4C5.4 9.4 2.8 6.6 3.6 2.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M5.2 8.2L6.8 6.4M4.2 6L6 4.6" stroke="#1c140c" stroke-width=".9" stroke-linecap="round"/><path d="M14.6 9.4C17.2 9.4 19.2 8 19.2 5.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M8.4 10.6L3.6 11.8L8.6 13.4ZM15.6 10.6L20.4 11.8L15.4 13.4Z"/><path d="M9 9.4C9 8.2 10.4 7.8 12 7.8S15 8.2 15 9.4L14.2 17.4C13.8 20 13 21.4 12 21.4S10.2 20 9.8 17.4Z"/><circle cx="10.4" cy="12.4" r=".9" fill="#1c140c"/><circle cx="13.6" cy="12.4" r=".9" fill="#1c140c"/><path d="M12 15.6V20" stroke="#1c140c" stroke-width="1" stroke-linecap="round" stroke-opacity=".5"/><ellipse cx="12" cy="19.6" rx="1.7" ry="1.1" fill="#1c140c" fill-opacity=".5"/>',
  warden: '<path d="M5 3.2L10.4 8.4L9.4 11.6L5.4 10.8Z"/><path d="M9 8C12.4 6.6 16.6 7.6 17.6 10.2L21.2 11.4C22 11.8 22 13 21.4 13.6L18 14.6C16.6 17.2 13 17.6 10 16.4C7.2 15.4 5.8 13.2 6.6 10.8Z"/><circle cx="13.6" cy="10.6" r="1.1" fill="#1c140c"/><circle cx="21.2" cy="12" r=".9" fill="#1c140c"/><circle cx="7.6" cy="19.2" r="2.6" fill="none" stroke="#e8c47c" stroke-width="1.5"/><path d="M10 19.8L16.8 21.8M13.8 20.9V23M16 21.5V22.9" fill="none" stroke="#e8c47c" stroke-width="1.4" stroke-linecap="round"/>',
};
const EMBK = { bull: 'bull', bison: 'bull', python: 'python', irontooth: 'dog', dog: 'dog', frost: 'wolf', wolf: 'wolf', scar: 'bear', bear: 'bear', shade: 'tiger', tiger: 'tiger', blackridge: 'boar', boar: 'boar', whitecrest: 'deer', deer: 'deer', bigcroc: 'croc', croc: 'croc', whiteback: 'ape', ape: 'ape', cliffhorn: 'ibex', ibex: 'ibex', warden: 'warden' };
const PAL = {      // [盾底, 盾邊（亮）, 頭像色]
  bull: ['#4a2a18', '#e8c47c', '#f0e6cc'], python: ['#1c3128', '#d8b04a', '#e6c25c'], dog: ['#2a2c32', '#e8c47c', '#d0d4dc'],
  wolf: ['#2a2016', '#e8c47c', '#f0d79a'], boar: ['#1a1a1f', '#9aa6b8', '#e6dfd2'], deer: ['#4a2030', '#f4f1e6', '#f6f2e4'], croc: ['#1c3a2a', '#9fd06a', '#8fc25a'],
  ape: ['#34465c', '#bcdcf4', '#f2f5f8'], ibex: ['#4a3a26', '#d8a86a', '#ead4aa'], warden: ['#3a1618', '#e0503c', '#d0d4dc'],
  bear: ['#2a2016', '#e8c47c', '#f0d79a'], tiger: ['#2a2016', '#e8c47c', '#f0d79a'],
};
const SHIELD = 'M1.6 1.8h18.8v10c0 5.6-4.2 9-9.4 10.8C5.8 20.8 1.6 17.6 1.6 11.8z';
function crestSvg(info) {
  const k = EMBK[info.key] || EMBK[info.crest] || 'wolf', [bg, edge, fg] = PAL[k];
  // 不用漸層（外面的名牌 display:none 時，同一個 id 的漸層會失效）：用一片半透明白當上緣高光
  return `<svg class="e8crest" viewBox="0 0 22 24" aria-hidden="true"><path d="${SHIELD}" fill="${bg}" stroke="${edge}" stroke-width="1.5" stroke-linejoin="round"/><path d="M2.6 2.8h16.8v4.4c-3 1.4-6.2 1.6-8.4 1.2-3-.5-6.4-.2-8.4 1.2z" fill="#fff" fill-opacity=".1"/><g transform="translate(2.9 3) scale(.68)" fill="${fg}" color="${fg}">${EMB[k]}</g></svg>`;
}

/* ========================= 樣式 ========================= */
const CSS = `
/* ---------- 菁英名牌（總高 ≤ 46px：稱號 12＋名字列 18＋血條 6＋縫） ---------- */
body .tag.e8{gap:1px}
body .tag.e8 .e8t{font:600 10.5px/1.2 var(--font-body);letter-spacing:.16em;text-indent:.16em;color:#f6e2b0;padding:0 8px;border-radius:7px;background:rgba(20,14,8,.58);text-shadow:0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 0 4px #000}
body .tag.e8 .e8row{display:flex;align-items:center;gap:2px;padding:0 10px 0 3px;border-radius:12px;background:linear-gradient(rgba(38,27,14,.84),rgba(16,11,6,.78));box-shadow:0 0 0 1px rgba(232,196,124,.55),0 2px 5px rgba(0,0,0,.55)}
body .tag.e8 .e8crest{flex:none;width:24px;height:26px;margin:-4px 0 -4px -7px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))}
body .tag.e8 .tag-name{font-size:14.5px;font-weight:700;line-height:1.25;text-shadow:0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 0 5px #000}
body .tag.e8 .tag-name small{font:500 10.5px var(--font-body);color:#f0d8cf;margin-left:5px;letter-spacing:.02em}
body .tag.e8 .e8bar{position:relative;display:flex;align-items:center}
body .tag.e8 .tag-bar{width:96px;height:6px;border-radius:1px;box-shadow:0 0 0 1px rgba(201,163,90,.92),0 0 0 2px rgba(20,14,8,.62),0 1px 3px rgba(0,0,0,.7)}
body .tag.e8 .e8n{position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:6px;font:700 10px/1 var(--font-body);color:#f6e2b0;white-space:nowrap;text-shadow:0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 0 4px #000}
body .tag.e8.rage .tag-name{text-shadow:0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 0 8px rgba(255,60,30,.8)}
body .tag.e8.locked .tag-bar{box-shadow:0 0 0 1px #ffd27a,0 0 0 2px rgba(20,14,8,.62),0 1px 3px rgba(0,0,0,.7)}
/* ---------- 施法條（長吠／召集共用）：掛在名牌正下方，絕對定位，不改名牌高度 ---------- */
body .tag .c8cast{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none}
body .tag .c8bar{position:relative;width:84px;height:5px;border-radius:1px;background:rgba(0,0,0,.7);box-shadow:0 0 0 1px rgba(232,196,124,.8),0 0 0 2px rgba(20,14,8,.55)}
body .tag .c8bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#f6d58c,#d79a3a)}
body .tag .c8lbl{display:flex;align-items:center;gap:3px;font:700 10.5px/1.2 var(--font-body);white-space:nowrap;color:#f6e2b0;text-shadow:0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 0 4px #000}
body .tag .c8lbl svg{width:13px;height:9px;flex:none} body .tag .c8lbl em{font-style:normal;font-weight:500;color:#e2d8bc;margin-left:2px}
body .tag .c8bar.broken{background:none;box-shadow:none} body .tag .c8bar.broken i{width:40px;box-shadow:0 0 0 1px rgba(232,196,124,.8);background:#8a7350;transform:rotate(-8deg) translate(-3px,1px)} body .tag .c8bar.broken i+i{left:auto;right:0;transform:rotate(9deg) translate(3px,1px)}
body .tag .c8pop{position:absolute;left:50%;bottom:100%;margin-bottom:2px;white-space:nowrap;pointer-events:none;font:900 16px/1 var(--font-display);letter-spacing:.06em;color:#f6dc9a;text-shadow:0 2px 0 #2a1c0c,0 0 8px rgba(0,0,0,.9)}
body .tag .c8pop.bad{font:700 12px/1 var(--font-body);padding:3px 8px;border-radius:3px;background:rgba(122,34,26,.9);color:#fff;text-shadow:none;letter-spacing:.04em}
/* ---------- 拖入坑底倒數圈：紅色圓環一格一格縮短（不閃、不脈動） ---------- */
body .tag .d8lbl{margin-top:1px;padding:1px 8px;border-radius:8px;background:rgba(138,34,24,.94);box-shadow:0 0 0 1px rgba(20,8,4,.7);font:900 12px/1.25 var(--font-display);letter-spacing:.1em;color:#fff;text-shadow:none}
body .tag .d8ring{position:absolute;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))} body .tag .d8ring svg{display:block}
body #e8struggle .d8ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}
/* ---------- 掙脫條 #e8struggle：畫面中下，#bottom（底 14px 起）與 #prompt（底 132px 起）之上 ---------- */
body #e8struggle{position:fixed;left:50%;bottom:178px;transform:translateX(-50%);width:320px;box-sizing:border-box;z-index:7;padding:8px 13px 9px;border-radius:7px;border:1px solid var(--brass-dark);border-top:2px solid var(--brass);background:rgba(20,22,18,.92);box-shadow:0 6px 18px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.5);text-shadow:0 1px 2px #000;pointer-events:none;display:grid;grid-template-columns:minmax(0,1fr);gap:0 12px}
body #e8struggle[hidden]{display:none}
body #e8struggle.drag{grid-template-columns:56px minmax(0,1fr);width:384px}
body #e8struggle.drag > :not(.drw){grid-column:2}
body #e8struggle .drw{grid-column:1;grid-row:1/span 3;align-self:center;display:flex;flex-direction:column;align-items:center;gap:3px} body #e8struggle .drw .cap{font:900 12px/1 var(--font-display);letter-spacing:.06em;color:#ffb4a4;white-space:nowrap}
body #e8struggle .d8ring{position:relative;width:46px;height:46px} body #e8struggle .d8ring b{position:absolute;inset:0;display:grid;place-items:center;font:700 13px/1 var(--font-display);color:#ffd9d0;font-variant-numeric:tabular-nums}
body #e8struggle .hd{display:flex;align-items:baseline;gap:7px;min-width:0} body #e8struggle .hd b{font:700 15.5px/1.2 var(--font-display);letter-spacing:.06em;color:var(--ink)} body #e8struggle .hd small{font-size:11px;color:var(--ink-dim)} body #e8struggle .hd .ct{margin-left:auto;font:700 14px/1 var(--font-display);color:var(--brass-light);font-variant-numeric:tabular-nums}
body #e8struggle .hd svg{width:16px;height:16px;align-self:center;flex:none}
body #e8struggle .sbar{display:flex;gap:2px;height:11px;margin-top:6px;padding:2px;border-radius:3px;background:rgba(0,0,0,.6);box-shadow:0 0 0 1px #2a2416,0 0 0 2px rgba(201,163,90,.4)} body #e8struggle .sbar i{flex:1;border-radius:1px;background:rgba(244,236,217,.1)} body #e8struggle .sbar i.on{background:linear-gradient(#f6d58c,#d79a3a)}
body #e8struggle .tbar{position:relative;height:11px;margin-top:6px;border-radius:3px;background:rgba(0,0,0,.6);box-shadow:0 0 0 1px #2a2416,0 0 0 2px rgba(201,163,90,.4);overflow:hidden} body #e8struggle .tbar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#f6d58c,#d79a3a)}
body #e8struggle .keys{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:7px;white-space:nowrap;font-size:12px;color:var(--ink)} body #e8struggle .keys kbd{min-width:18px;height:20px;padding:0 6px;font:700 11.5px/18px var(--font-body);color:var(--brass-light);border-color:var(--brass-dark)} body #e8struggle .keys em{font-style:normal;color:var(--ink-dim);font-size:11px}
body #e8struggle .keys .nt{margin-left:auto;font-size:11.5px;color:var(--ink-dim)}
/* ---------- 懸賞告示（對話框的任務卡換掉；目標與獎勵列照留） ---------- */
body #dlgCard.b8{box-sizing:border-box}
body .b8poster{position:relative;margin:7px 1px 8px;padding:11px 16px 9px;background:radial-gradient(ellipse at 50% 38%,#f3e7c7 0%,#e6d4a9 64%,#c9ae7c 100%);color:#2e2216;border-radius:2px;box-shadow:0 3px 10px rgba(0,0,0,.55),inset 0 0 24px rgba(110,70,25,.32);transform:rotate(-.6deg);text-shadow:none}
body .b8poster::before,body .b8poster::after{content:"";position:absolute;top:6px;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f7dc9a,#8a6224);box-shadow:0 1px 2px rgba(0,0,0,.6)} body .b8poster::before{left:8px} body .b8poster::after{right:8px}
body .b8poster h5{margin:0;text-align:center;font:900 23px/1.1 var(--font-display);letter-spacing:.6em;text-indent:.6em;color:#5c2414}
body .b8poster .rl{height:4px;margin:4px 10px 5px;border-top:1px solid #6b4a2c;border-bottom:1px solid #6b4a2c}
body .b8poster .pic{display:grid;place-items:center;height:70px;margin:0 6px;border:1px solid rgba(80,55,30,.45);background:radial-gradient(ellipse at 50% 85%,rgba(90,60,30,.22),transparent 70%);box-shadow:inset 0 0 12px rgba(90,60,30,.25)} body .b8poster .pic svg{width:116px;height:72px;color:#2b1d12;opacity:.92}
body .b8poster .nm{margin:5px 0 0;text-align:center;font:900 20px/1.2 var(--font-display);letter-spacing:.08em} body .b8poster .sub{margin:0 0 5px;text-align:center;font-size:11.5px;color:#5e4a34}
body .b8poster dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0 2px;font-size:12.5px;line-height:1.4} body .b8poster dt{font-size:11px;letter-spacing:.2em;color:#7a5c28;padding-top:1px} body .b8poster dd{margin:0} body .b8poster dd b{font-family:var(--font-display);font-size:14px;color:#5c2414}
body .b8poster dd .ic{display:inline-block;width:19px;height:19px;vertical-align:-5px;margin-right:3px} body .b8poster dd .ic svg{display:block;width:100%;height:100%}
body .b8poster .sign{margin:6px 4px 0 0;text-align:right;font-size:11.5px;color:#5e4a34;font-family:var(--font-display)}
body .b8poster .seal{position:absolute;left:12px;bottom:7px;width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#c4473a,#7c1f16 72%);box-shadow:0 1px 2px rgba(0,0,0,.5),inset 0 0 0 3px rgba(0,0,0,.12);color:#f3d2c4;font:900 13px/28px var(--font-display);text-align:center}
body .b8poster.done .pic svg{opacity:.5} body .b8poster.done{filter:saturate(.75)}
body .b8poster .stamp,body .b8mini .stamp{position:absolute;right:16px;top:80px;transform:rotate(-13deg);padding:1px 10px;border:3px double #9a2a1c;border-radius:4px;color:#9a2a1c;font:900 22px/1.25 var(--font-display);letter-spacing:.2em;opacity:.86;mix-blend-mode:multiply;pointer-events:none}
/* ui-fin：回報完成那張（左欄下面還排著一長串選項，card 會被壓矮）改成緊湊版，1222×789 下印章與署名都不被裁掉 */
body .b8poster.done{padding:7px 14px 6px;margin:5px 1px 6px} body .b8poster.done h5{font-size:17px} body .b8poster.done .rl{margin:2px 10px 3px} body .b8poster.done .pic{height:42px} body .b8poster.done .pic svg{width:72px;height:45px} body .b8poster.done .nm{font-size:17px;margin-top:3px} body .b8poster.done .sub{display:none} body .b8poster.done .sign{margin-top:3px} body .b8poster.done .seal{bottom:5px;width:24px;height:24px;font:900 12px/24px var(--font-display)} body .b8poster.done .stamp{top:42px;font-size:20px}
/* 任務日誌詳細頁：縮小版（橫式；回報完成卡的緊湊版在上） */
body .b8mini{position:relative;display:grid;grid-template-columns:104px minmax(0,1fr);gap:0 12px;align-items:center;margin:8px 0 10px;padding:9px 14px 9px 12px;background:radial-gradient(ellipse at 40% 38%,#f3e7c7 0%,#e6d4a9 64%,#c9ae7c 100%);color:#2e2216;border-radius:2px;box-shadow:0 2px 8px rgba(0,0,0,.5),inset 0 0 18px rgba(110,70,25,.3);text-shadow:none;transform:rotate(-.4deg)}
body .b8mini .pic{display:grid;place-items:center;height:62px;border:1px solid rgba(80,55,30,.45);background:radial-gradient(ellipse at 50% 85%,rgba(90,60,30,.22),transparent 70%)} body .b8mini .pic svg{width:92px;height:57px;color:#2b1d12;opacity:.92}
body .b8mini h5{margin:0;font:900 12px/1.2 var(--font-display);letter-spacing:.5em;color:#5c2414} body .b8mini .nm{margin:1px 0 3px;font:900 16px/1.2 var(--font-display);letter-spacing:.06em} body .b8mini p{margin:0;font-size:12px;line-height:1.5;color:#3d2e1c} body .b8mini p b{font-family:var(--font-display);color:#5c2414} body .b8mini p .ic{display:inline-block;width:17px;height:17px;vertical-align:-4px;margin-right:2px} body .b8mini p .ic svg{display:block;width:100%;height:100%}
body .b8mini.done .pic svg{opacity:.5} body .b8mini .stamp{right:12px;top:10px;font-size:17px;border-width:2px} body .b8mini.done > div:nth-child(2){padding-right:78px}
`;

/* ========================= 狀態：每個名牌一份 ========================= */
const S = new WeakMap();      // tag.el → { … }
const stOf = tg => { let s = S.get(tg.el); if (!s) { s = { tg, castW: null, bar: null, fill: null, lbl: null, ck: '', brk: 0, pop: null, popT: 0, popDur: 0, plate: null, nEl: null, lastN: -1, ring: null, dlbl: null }; S.set(tg.el, s); } return s; };

/* ---------- 菁英名牌 ---------- */
function plate(v, tg, info) {
  const s = stOf(tg), t = tg.el;
  if (!s.plate || !s.plate.row.isConnected || s.plate.row.parentNode !== t) {
    const nm = tg.name || t.querySelector('.tag-name'), bar = t.querySelector('.tag-bar'); if (!nm || !bar) return;
    const title = el('span', 'e8t'), row = el('div', 'e8row'), br = el('div', 'e8bar'), nEl = el('span', 'e8n');
    row.innerHTML = crestSvg(info); row.append(nm); br.append(bar, nEl);
    const say = t.querySelector('.tag-say'); t.insertBefore(title, say); t.insertBefore(row, say); t.insertBefore(br, say);
    s.plate = { title, row, br, nm, nEl, ck: '' }; s.lastN = -1;
  }
  const P = s.plate; if (!t.classList.contains('e8')) t.classList.add('e8');
  const ck = `${info.key}|${info.name}|${info.title}|${v.lv}`;
  if (P.ck !== ck || !P.nm.firstElementChild) {      // 名字被 game.js 重寫（textContent 會洗掉 <small>）也在這裡補回
    P.ck = ck; P.title.textContent = info.title || ''; P.title.hidden = !info.title;
    P.nm.textContent = info.name || v.name || ''; P.nm.append(el('small', '', 'Lv' + v.lv));
    const old = P.row.querySelector('.e8crest'); if (old) old.outerHTML = crestSvg(info);
  }
  const n = info.n | 0; if (n !== s.lastN) { s.lastN = n; P.nEl.textContent = n > 1 ? `×${n} 人` : ''; }
}

/* ---------- 施法條 ---------- */
const CHAIN_BREAK = '<svg viewBox="0 0 13 9" aria-hidden="true"><g fill="none" stroke="#f0d79a" stroke-width="1.3"><rect x=".7" y="2.2" width="4.6" height="4.6" rx="2.3"/><rect x="7.7" y="2.2" width="4.6" height="4.6" rx="2.3"/></g><path d="M6.5 .5v2M6.5 6.5v2" stroke="#f0d79a" stroke-width="1"/></svg>';
const CAST_NAME = { howl: '長吠', rally: '召集' };
function castWidget(s) {
  if (!s.castW) { s.castW = el('div', 'c8cast'); s.bar = el('div', 'c8bar'); s.fill = el('i'); s.bar.append(s.fill); s.lbl = el('span', 'c8lbl'); s.castW.append(s.bar, s.lbl); s.tg.el.append(s.castW); s.ck = ''; }
  return s.castW;
}
function dropCast(s) { if (s.castW) { s.castW.remove(); s.castW = s.bar = s.fill = s.lbl = null; s.ck = ''; } }
function castFrame(v, tg, shown, dt) {
  const s = S.get(tg.el);
  let c = shown ? D.cast(v) : null;
  if (!s && !c) return;
  const st = s || stOf(tg);
  if (st.quiet > 0) { st.quiet -= dt; if (c && c.dur > 0 && c.t > c.dur * 0.5) c = null; }      // 「施放完成」後 0.4 秒內，還在回報舊那一輪（進度過半）的不算，免得條又冒出來一下
  if (st.brk > 0) {      // 被打斷：條碎開的畫面撐 0.9 秒（期間若真的又開始新的一輪，立刻改回正常）
    if (c && c.t < st.brkT0 - 0.15) { st.brk = 0; dropCast(st); }
    else { st.brk -= dt; if (st.brk <= 0) dropCast(st); return; }
  }
  if (!c) { if (st.castW) dropCast(st); return; }
  const key = c.key || 'howl', name = c.label || CAST_NAME[key] || '施法', br = c.breakable !== false;
  castWidget(st);
  const ck = `${key}|${name}|${br}`; if (st.ck !== ck) { st.ck = ck; st.bar.className = 'c8bar'; st.bar.textContent = ''; st.fill = el('i'); st.bar.append(st.fill); st.lbl.innerHTML = (br ? CHAIN_BREAK : '') + `${name}` + (br ? '<em>可打斷</em>' : '<em>不可打斷</em>'); }
  st.fill.style.width = (clamp(c.dur > 0 ? c.t / c.dur : 0, 0, 1) * 100).toFixed(1) + '%';
}
function popFx(st, text, cls, dur) {
  if (st.pop) st.pop.remove();
  st.pop = el('div', 'c8pop' + (cls ? ' ' + cls : ''), text); st.tg.el.append(st.pop); st.popT = 0; st.popDur = dur;
}
function popTick(st, dt) {
  if (!st.pop) return; st.popT += dt; const k = st.popT / st.popDur;
  if (k >= 1) { st.pop.remove(); st.pop = null; return; }
  const a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;      // 前 60% 全亮、後 40% 淡出（不閃）
  st.pop.style.opacity = a.toFixed(2); st.pop.style.transform = `translateX(-50%) translateY(${(-k * 7).toFixed(1)}px)`;
}
function onCast(e) {
  const v = e && e.v, tg = v && v.tag; if (!tg || !tg.el) return;
  const st = stOf(tg);
  if (e.end === 'broken') {
    const c0 = D.cast(v); st.brkT0 = c0 ? c0.t : 99;      // 之後 cast 的進度比這個小很多＝又開始新的一輪
    castWidget(st); st.bar.className = 'c8bar broken'; st.bar.textContent = ''; st.bar.append(el('i'), el('i')); st.fill = null; st.ck = 'broken';
    st.lbl.textContent = `${CAST_NAME[e.key] || '施法'}被打斷`; st.brk = 0.9;
    popFx(st, '打斷！', '', 0.8);
  } else if (e.end === 'done') {
    dropCast(st); st.brk = 0; st.quiet = 0.4; popFx(st, '叫來了同伴', 'bad', 1.8);
  }
}

/* ---------- 倒數圈 ---------- */
// 名牌上的圈＝一條圍住整張名牌（名字＋「快救！」）的紅色藥丸形外框；掙脫條上的圈＝正圓。都用 pathLength=100：弧長＝剩餘比例，一格一格縮短。
const ringArc = k => `${(clamp(k, 0, 1) * 100).toFixed(2)} 100`;
const ringSvg = () => '<svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="19" fill="rgba(20,8,4,.35)" stroke="rgba(20,8,4,.7)" stroke-width="6"/><circle class="a" cx="23" cy="23" r="19" fill="none" stroke="#e0503c" stroke-width="3.6" pathLength="100" stroke-dasharray="100 100"/></svg>';
const setArc = (root, k) => { const c = root.querySelector('.a'); if (c) c.setAttribute('stroke-dasharray', ringArc(k)); };
function tagRing(s, k) {
  const t = s.tg.el; if (!t.offsetWidth) return;      // 名牌被隱藏（display:none）時量不到
  const say = t.querySelector('.tag-say'), top = say && !say.classList.contains('on') ? say.offsetHeight + 5 : 0;      // 名牌最上面有一塊留給說話泡泡的空位（空的時候不圈進去）
  const w = Math.round(t.offsetWidth + 20), h = Math.round(t.offsetHeight - top + 10), key = `${w}x${h}x${top}`;
  if (s.rk !== key) {
    s.rk = key; s.ring.style.cssText = `left:-10px;top:${top - 5}px;width:${w}px;height:${h}px`;
    const rx = Math.min(14, h / 2 - 1);
    s.ring.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x="2.5" y="2.5" width="${w - 5}" height="${h - 5}" rx="${rx}" fill="rgba(20,8,4,.42)" stroke="rgba(20,8,4,.72)" stroke-width="6"/><rect class="a" x="2.5" y="2.5" width="${w - 5}" height="${h - 5}" rx="${rx}" fill="none" stroke="#e0503c" stroke-width="3.2" pathLength="100" stroke-dasharray="100 100"/></svg>`;
  }
  setArc(s.ring, k);
}
function dragFrame() {
  const list = (D.dragged && D.dragged()) || [], seen = new Set();
  for (const d of list) {
    const tg = d.tag; if (!tg || !tg.el) continue;      // 沒有名牌（遠端隊友的名牌找不到）就不畫；自己的圈在掙脫條上
    const s = stOf(tg); seen.add(s);
    if (!s.ring) { s.ring = el('div', 'd8ring tg'); s.dlbl = el('span', 'd8lbl', '快救！'); tg.el.append(s.dlbl, s.ring); s.rk = ''; }
    tagRing(s, d.dur > 0 ? d.t / d.dur : 0);
  }
  for (const s of dragRings) if (!seen.has(s)) { if (s.ring) { s.ring.remove(); s.dlbl.remove(); s.ring = s.dlbl = null; } }
  dragRings = seen;
}
let dragRings = new Set();

/* ========================= 掙脫條 ========================= */
let sp = null, spKey = '';
const COIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.6C.8 9.6 4 7.6 7 8.6S10.4 4.2 8 2.8" fill="none" stroke="#e6c25c" stroke-width="2.6" stroke-linecap="round"/><path d="M8 2.8L11.8 1.8L10.6 5.4Z" fill="#e6c25c"/></svg>';
const JAW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 3.4L5 7.2L7.4 3.8L9.8 7.2L14.4 3.4L13 9.6H3Z" fill="#d0d4dc"/><path d="M3.4 12.6L6 9.6L8 12.2L10 9.6L12.6 12.6" fill="none" stroke="#d0d4dc" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const HAND = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 9.6V5.4a1.2 1.2 0 0 1 2.4 0V8M5.6 7.6V3.8a1.2 1.2 0 0 1 2.4 0v3.6M8 7.4V4.4a1.2 1.2 0 0 1 2.4 0v3.4M10.4 7.8V6a1.2 1.2 0 0 1 2.4 0v3.6c0 3-2 4.8-4.6 4.8H7.4c-2 0-3.2-1.2-4.2-2.8L1.8 9.4a1.1 1.1 0 0 1 1.8-1.2l.8 1" fill="#d8b48a" stroke="#2a1c10" stroke-width="1.1" stroke-linejoin="round"/></svg>';      /* 猩猩的手（被抓住） */
function struggleFrame() {
  const g = D.struggle && D.struggle();
  if (!g) { if (sp && !sp.hidden) sp.hidden = true; return; }
  if (!sp) { sp = el('div'); sp.id = 'e8struggle'; sp.hidden = true; document.body.appendChild(sp); }
  const grab = !!g.grab, coil = g.kind !== 'latch' && !grab, press = g.need > 0, drag = g.drag || null, lifted = grab && g.t > 0;      /* 0.8 X7（R6）：grab＝被猩猩抓住（自己掙不開、等隊友打牠）；latch 有 need＝鱷魚咬住（連按掙脫） */
  const by = typeof g.by === 'string' ? g.by : g.by && g.by.name ? g.by.name : '';
  const kd = H.keyOf('dodge'), ki = H.keyOf('interact'), ka = H.keyOf('attack');
  const key = [coil, grab, lifted, press, !!drag, by, g.need, kd, ki, ka].join('|');
  if (key !== spKey) {      // 結構只在這些改變時重建
    spKey = key; sp.textContent = ''; sp.className = drag ? 'drag' : '';
    if (drag) sp.append(html('div', 'drw', '<div class="d8ring">' + ringSvg() + '<b></b></div><span class="cap">快掙脫！</span>'));
    const hd = el('div', 'hd'); hd.innerHTML = (grab ? HAND : coil ? COIL : JAW) + `<b>${grab ? (lifted ? '被舉起來了' : '被抓住了') : coil ? '被纏住了' : '被咬住了'}</b>` + (drag ? '<small>正被拖進坑底</small>' : by ? `<small>${by}</small>` : '') + (press ? '<span class="ct"></span>' : '');
    sp.append(hd);
    if (press) { const bar = el('div', 'sbar'); for (let i = 0; i < Math.min(g.need, 30); i++) bar.append(el('i')); sp.append(bar); }
    else { const tb = el('div', 'tbar'); tb.append(el('i')); sp.append(tb); }
    const keys = el('div', 'keys');
    keys.innerHTML = grab ? `<em>${lifted ? '快被丟出去了——' : ''}自己掙不開</em>` : coil || press ? `<em>連按</em><kbd>${kd}</kbd><kbd>${ki}</kbd><kbd>${ka}</kbd>` : `<em>按</em><kbd>${kd}</kbd><em>閃開，或反擊打牠</em>`;
    keys.append(el('span', 'nt', grab ? '隊友打牠一下，牠就會放手' : '隊友打牠，牠也會鬆開')); sp.append(keys);
  }
  sp.hidden = false;
  if (press) {
    const n = clamp(g.n | 0, 0, g.need), cells = sp.querySelectorAll('.sbar i'), m = Math.min(g.need, 30), on = Math.round(n / g.need * m);
    cells.forEach((c, i) => c.classList.toggle('on', i < on));
    const ct = sp.querySelector('.ct'); if (ct) ct.textContent = `${n} / ${g.need}`;
  } else {
    const f = sp.querySelector('.tbar i'); if (f) f.style.width = (clamp(g.tmax > 0 ? 1 - g.t / g.tmax : 0, 0, 1) * 100).toFixed(1) + '%';
  }
  if (drag) { const r = sp.querySelector('.d8ring'); setArc(r, drag.dur > 0 ? drag.t / drag.dur : 0); const b = r.querySelector('b'), tx = Math.max(0, drag.t).toFixed(1); if (b.textContent !== tx) b.textContent = tx; }
}

/* ========================= 懸賞告示 ========================= */
const TROPHY = {      // 戰利品 → 野獸資料（D.bounties() 沒給的欄位用這裡補；名稱照 story08）
  trophy_frost: { name: '霜背的獠牙', sil: 'wolf', area: '鏡池西南、狼丘、長灣東岸', sub: '狼群跟在身邊' },
  trophy_scar: { name: '老疤的爪', sil: 'bear', area: '低語森林西側深處', sub: '出手前一定先站起來吼' },
  trophy_shadow: { name: '影牙的尾', sil: 'tiger', area: '斷牙峽谷東側、採石場、白鹽臺', sub: '不先動，等人轉身' },
  trophy_bison: { name: '狂牛的斷角', sil: 'bull', area: '鹽原一帶', sub: '帶著兩頭牛走動' },
  trophy_python: { name: '大蟒的毒牙', sil: 'python', area: '舊飼育場最深的那個坑', sub: '纏住就往坑裡拖' },
  trophy_irontooth: { name: '鐵牙的項圈', sil: 'dog', area: '運鐵坡道一帶', sub: '帶著兩隻護衛巡邏' },
  trophy_blackridge: { name: '黑脊的獠牙', sil: 'boar', area: '南湖濕原一帶', sub: '不惹不打，背上一排黑鬃' },
  trophy_whitecrest: { name: '白冠的鹿角', sil: 'deer', area: '林緣獵場與巨木林邊', sub: '帶著一群鹿' },
  trophy_croc: { name: '巨鱷的鱗', sil: 'croc', area: '沼林的鱷潭', sub: '咬住了要連按掙脫' },
  trophy_whiteback: { name: '白背的毛皮', sil: 'ape', area: '北境霜林', sub: '會抓人舉起來' },
  trophy_warden: { name: '半截舊鑰匙', sil: 'dog', area: '關前高地一帶', sub: '帶著兩隻看守犬' },
  trophy_cliffhorn: { name: '斷崖角', sil: 'ibex', area: '北緣稜線', sub: '沿崖邊衝撞' },
};
TROPHY.trophy_bull = TROPHY.trophy_bison;      // stub08 早期寫成 trophy_bull
const SAME = { bison: 'bull' };
const PH = {      // 圖示（ui-i 的 icons08 還沒有時的佔位）
  /* ui-fin 第二輪：照 icons08 的新狂牛圖示（深灰斷左角、粉米色斷口、三道爪痕、橘褐鬃毛、不放鹽晶）縮小的備用圖 */
  trophy_bison: '<svg viewBox="0 0 20 20"><path d="M2.250 14.750h15.500v2.600c0 .6-.45 1.050-1.050 1.050H3.300c-.6 0-1.050-.45-1.050-1.050z" fill="#8a6038" stroke="#1c140c" stroke-width="1"/><path d="M4 15.250C2.400 10.500 4 5.500 8.500 3.400L9.650 4.300 10.400 2.800 11.500 4.200 12.900 3.300C12 5.500 10.250 6.500 10.600 10.500C10.800 12.750 11.500 14 12.750 15.250z" fill="#4a4440" stroke="#1c140c" stroke-width="1.100" stroke-linejoin="round"/><path d="M2.300 15c.5-2.200 1.500-2.600 2.200-4.300.5 1.500 1.200 1.500 1.700 2.800.7-.8 1.300-.6 1.600-1.700.4 1.400.3 2.300.1 3.200z" fill="#c9741f" stroke="#6a3a12" stroke-width=".5"/><path d="M5.250 6.250l2.250 3.500M6.750 5.600l2.250 3.500M4 8.750l2 3" fill="none" stroke="#d9877a" stroke-width=".9" stroke-linecap="round"/><path d="M8.700 3.500l.95.8.75-1.500 1.100 1.400 1.400-.9c-.3.9-.75 1.650-1.350 2.100-1.400.3-2.600-.15-3.300-1.400z" fill="#e3c4aa" stroke="#1c140c" stroke-width=".6"/></svg>',
  trophy_python: '<svg viewBox="0 0 20 20"><path d="M10 2C13 6 13 12 10 18C7 12 7 6 10 2Z" fill="#f4eed8" stroke="#1c140c" stroke-width="1.2"/><path d="M10 12V17" stroke="#c8b078" stroke-width="2"/></svg>',
  trophy_irontooth: '<svg viewBox="0 0 20 20"><ellipse cx="10" cy="8.5" rx="7" ry="5" fill="none" stroke="#5a3a1c" stroke-width="2.6"/><rect x="7.2" y="11.6" width="5.6" height="6.2" rx="1" fill="#8d949a" stroke="#1c140c" stroke-width="1"/><path d="M8.8 14.6h2.4" stroke="#1c140c" stroke-width=".9"/></svg>',
};
PH.trophy_bull = PH.trophy_bison;
let noIcon = '';
function itemName(id) { const it = ITEMS[id] || (ITEMS06 && ITEMS06[id]) || (ITEMS07 && ITEMS07[id]); return (it && it.name) || (TROPHY[id] && TROPHY[id].name) || id; }
function trophyIcon(id) {
  const s = el('span', 'ic');
  let svg = ''; try { if (!noIcon) noIcon = H.iconSvg('__e8_none__'); svg = H.iconSvg(id); } catch (e) { svg = ''; }
  s.innerHTML = svg && svg !== noIcon ? svg : PH[id] || PH.trophy_irontooth;      // 找不到（回傳的是灰圓預設）就用自己的佔位
  return s;
}
function bountyOf(q) {
  const b = ((D.bounties && D.bounties()) || []).find(x => x.q === q.id); if (!b) return null;
  const q8 = q.bounty || {}, tid = b.trophy || q8.trophy || '', T = TROPHY[tid] || {};
  return {
    target: b.target || T.name || q.name, lv: b.lv || q.lv, sub: b.sub || T.sub || '', area: b.area || q8.area || T.area || '',
    gold: b.gold != null ? b.gold : (q.rewards && q.rewards.gold) || q.gold || 0, trophy: tid, trophyName: b.trophyName || itemName(tid),
    sil: SAME[b.crest] || b.sil || (tid === 'trophy_bison' || tid === 'trophy_bull' ? 'bull' : b.crest) || q8.crest || T.sil || 'dog',
    giver: b.giver || '', signer: b.signer || b.giver || '', done: b.state === 'done',
  };
}
function poster(b, done) {
  const p = el('div', 'b8poster' + (done ? ' done' : ''));
  p.append(el('h5', '', '懸賞'), el('div', 'rl'), html('div', 'pic', silSvg(b.sil)), el('p', 'nm', b.target), el('p', 'sub', `${b.lv} 級${b.sub ? '　' + b.sub : ''}`));
  const dl = el('dl'); dl.append(el('dt', '', '出沒'), el('dd', '', b.area), el('dt', '', '賞金'), html('dd', '', `<b>${b.gold}</b> 金幣`));
  const dd = el('dd'); dd.append(trophyIcon(b.trophy), document.createTextNode(`${b.trophyName}（持有也算完成）`)); dl.append(el('dt', '', '證明'), dd); p.append(dl);
  if (b.signer) p.append(el('p', 'sign', `—— ${b.signer}`));
  if (b.giver) p.append(el('span', 'seal', b.giver.replace(/^.*[・ ]/, '')[0] || b.giver[0]));
  if (done) p.append(el('span', 'stamp', '已除名'));
  return p;
}
function mini(b, done) {
  const p = el('div', 'b8mini' + (done ? ' done' : ''));
  const r = el('div'); r.append(el('h5', '', '懸賞'), el('div', 'nm', b.target), el('p', '', `${b.lv} 級　出沒：${b.area}`));
  const g = el('p'); g.innerHTML = `賞金 <b>${b.gold}</b> 金幣　`; g.append(trophyIcon(b.trophy), document.createTextNode(`${b.trophyName}`)); r.append(g);
  p.append(html('div', 'pic', silSvg(b.sil)), r); if (done) p.append(el('span', 'stamp', '已除名')); return p;
}
function onCard(card, q, done) {
  const b = bountyOf(q); if (!b) return;
  for (const o of card.querySelectorAll('.b8poster')) o.remove();
  card.classList.add('b8');
  const p = poster(b, !!done || b.done), anchor = card.querySelector('.qobj, .objs, .qkeys, .qrew'), h4 = card.querySelector('h4');
  if (anchor) card.insertBefore(p, anchor); else if (h4) h4.after(p); else card.append(p);
}
function onDetail(box, q, status) {
  const b = bountyOf(q); if (!b) return;
  for (const o of box.querySelectorAll('.b8mini')) o.remove();
  const p = mini(b, b.done || status === 'done'), anchor = box.querySelector('.qgiver'), h3 = box.querySelector('h3');
  if (anchor) anchor.after(p); else if (h3) box.insertBefore(p, h3); else box.append(p);
}

/* ========================= 啟動 ========================= */
export function init(h, d) {
  H = h; D = d;
  window.__ui8struggle = true;      // beastai07 的綠條看到這個就不畫（介面08 v1.3）
  if (!document.getElementById('e8css')) { const st = document.createElement('style'); st.id = 'e8css'; st.textContent = CSS; document.head.appendChild(st); }
  if (typeof D.on === 'function') D.on('cast', onCast);
  if (typeof H.onDlgCard === 'function') H.onDlgCard(onCard);          // ui.js 的掛鉤（介面總監補丁）；沒有就不換告示，其他功能照常
  if (typeof H.onQuestDetail === 'function') H.onQuestDetail(onDetail);
  let last = performance.now();
  H.onTick(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      const mons = D.mons() || [];
      for (const v of mons) {
        const tg = v.tag; if (!tg || !tg.el) continue;
        const shown = tg.el.style.display !== 'none';
        if (shown && v.elite) { const info = D.eliteInfo(v); if (info) plate(v, tg, info); }
        castFrame(v, tg, shown, dt);
        const s = S.get(tg.el); if (s && s.pop) popTick(s, dt);
      }
      dragFrame(); struggleFrame();
    } catch (e) { if (errN++ < 5) console.error('ui08e', e); }
  });
}
