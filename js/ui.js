// 介面：HUD、懷錶式羅盤、面板、捏角色、開始流程、音效、輸入
import { TAU, clamp, WORLD, ZONES, zoneAt, gameHour, MST, MON, ITEMS, LV_CAP, expNeed, STAT_KEYS, STATS, derive, SKILLS, COMBOS, DODGES, meetsReq, RATINGS, QTYPES, ZONE_AT, MOVESET, MOVE_SLOTS, BASIC_SKILLS, FAM_NAME, skillFits, SPRINT, edgeAt } from './core.js';
import { LORE } from './story.js';
import * as STORY from './story.js';      // 0.6：PLACE_NOTES（地名與一句說明）；用命名空間匯入，舊的 story.js 沒有這個匯出也照常開機
import { PLACES06, CAMPS, FISH_SPOTS } from './places06.js'; import { PLACES08 } from './places08.js';      /* 0.8 X7：大地圖的釣點、新地標 */
import { W, mapRGB, setQuality, Hgt } from './world.js';
import { BODIES, BODY_KEYS, WEAPONS, HATS, CAPES, CAPE_COLORS, HUE_N, hueCss, parseLook, lookStr, randomLook, project } from './actors.js';
import { GROUPS, SLIDERS, PARAMS, CHOICES, PRESETS, MAXV, MID, defaultFace, randomFace, similarFace } from './face.js';
import { setForceHour } from './world.js';
import { ui, input, P, D, me, mons, remotes, npcs, Net, Store, tryAttack, tryHeavy, tryDodge, toggleLock, cycleLock, lockTarget, aiming, interact, quickHeal, useItem, allocate, setLook, say, buy, sell, castSkill, learnOrb, equipSkill, pickGift, setOf, getClock, QUESTS, NPCS, PLACES, qStatus, objProg, acceptQuest, turnInQuest, trackQuest, talkTo, seenIntro } from './game.js';
import { ACTIONS, actionOf, rebind, resetBinds, keyOf, RESERVED } from './keys.js';
import * as GA from './audio.js';
import { Ars, Craft, Needs, deriveAll } from './game.js';
import { party, answerInvite, leaveTeam, allyOf, inviteIn } from './game.js';      // 0.6 對打與組隊
import { SERVICES, SHOP, USE, NEEDS, RECIPES } from './data06.js';
import * as Fish from './fish07.js';      // 0.7 釣魚：米洛收魚、哈根做釣竿
import * as M7 from './maps07.js'; import * as S7 from './save07.js';      // 0.7（w7-map）：褐墨抄本、地圖記號、繪圖桌、手繪地圖、存檔代碼
import * as UI6 from './ui06.js'; import * as UB7 from './ui07b.js';      // 0.6 的視窗與 HUD（製作、整備、披肩、武器架、飽食與精力）；0.7 委託板的視窗在 board07.js
import * as B7 from './board07.js';
import * as UI7 from './ui07.js'; import * as UI8 from './ui08.js'; import * as H8 from './hooks08.js'; /* 0.8 介面中間層（d8-ui R3）：戰績簿、結果卡、菁英名牌、施法條、掙脫條、懸賞、試煉與對決 HUD、被盯上、雨；H8 給角色面板讀三條上限 */      // 0.7 介面（d7-ui）：0.7 視窗美化、追蹤欄與任務日誌的委託、釣魚紀錄、地圖畫法、陷阱提示

export const VERSION = '試玩版 0.7';
export const perf = { fps: 0 };
const $ = id => document.getElementById(id);
const SET_KEY = 'wanshou-settings-v2';
const settings = { q: 'high', vol: 80, vSfx: 90, vAmb: 60, vMus: 50, view: 'tps', sens: 100, invY: false, win: {}, tips: {} };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} };
export const getQuality = () => (['high', 'medium', 'low'].includes(settings.q) ? settings.q : 'high');

/* ============================== 音效 ============================== */
// 實錄音效、環境音與音樂在 audio.js（GA）；這裡的 Sfx 是合成音，當後備：GA 沒有對應、音檔還沒載好或載入失敗時用
// 新事件名稱 → 沒有音檔時用哪個合成音頂著（沒列到、合成音裡也沒有的事件就是不出聲）；SFX_GAP：同一個事件最短隔幾秒（菁英現身的樂句不要連著響）
const SFX_A7 = { trap: 'block', bell: 'parry', disarm: 'unlock', free: 'unlock', splash: 'dodge' }, SFX_ALIAS = { drink: 'heal', wanted: 'quest', invite: 'quest', buy: 'loot', sell: 'loot', coin: 'loot', confirm: 'heal', tab: 'click', page: 'click', win: 'click', learn: 'levelup', dead: 'hurt', charge: 'draw', gather: 'loot', mine: 'block', craft: 'heal', forge: 'parry', equip: 'click', sit: 'click', eat: 'loot', counter: 'perfect', armor: 'block', break: 'parry', stumble: 'dodge' }, SFX_GAP = { danger: 20 };
const Sfx = {
  ctx: null, out: null, armed: false, last: {},
  // 第一次點擊或按鍵：解鎖實錄音效。合成音自己的 AudioContext 等真的要用到（make）才建立
  init() { GA.unlock(); this.armed = true; if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  make() { if (this.ctx || !this.armed) return; try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = volOf('vol') * volOf('vSfx'); this.out.connect(this.ctx.destination); } } catch (e) { this.ctx = null; } },
  tone(f0, f1, dur, gain, type, delay = 0) { this.make(); if (!this.ctx) return; try { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay; o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02); } catch (e) {} },
  noise(f0, f1, dur, gain) { this.make(); if (!this.ctx) return; try { const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime; s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f).connect(g).connect(this.out); s.start(t); } catch (e) {} },
  // o：{ x, z 聲音的位置, wp 武器編號, tag 標籤 }（見 audio.js 的 play）
  play(name, a, o) {
    if (name in SFX_GAP) { const t = performance.now() / 1000; if (t - (this.last[name] || -99) < SFX_GAP[name]) return; this.last[name] = t; }
    if (GA.play(name, a, o)) return;
    if (o && o.x != null && Math.hypot(o.x - me.x, o.z - me.z) > 30) return;      // 合成音不會隨距離變小：遠處的不播
    if (name === 'arrow' && a === 'hit') { if (o && o.tag === 'dirt') return; name = 'hit'; a = 0; }      // 箭射中野獸：合成音用命中聲；落空不出聲
    name = SFX_ALIAS[name] || SFX_A7[name] || name;
    if (window.__sfxLog) window.__sfxLog.push(name);
    switch (name) {
      case 'swing': this.noise(a ? 700 : 1100, 260, a ? 0.2 : 0.13, 0.16); break;
      case 'hit': this.tone(a ? 170 : 210, 60, 0.11, 0.3, 'triangle'); this.noise(2400, 500, 0.06, 0.22); break;
      case 'hurt': this.tone(260, 90, 0.22, 0.26, 'sawtooth'); break;
      case 'dodge': this.noise(a === 'roll' ? 420 : 700, 180, a === 'roll' ? 0.26 : 0.14, 0.12); break;
      case 'block': this.tone(320, 180, 0.08, 0.2, 'square'); this.noise(1800, 700, 0.07, 0.16); break;
      case 'parry': this.tone(1320, 1320, 0.16, 0.16, 'triangle'); this.tone(1980, 1980, 0.26, 0.1, 'sine', 0.03); this.noise(3200, 1500, 0.06, 0.14); break;
      case 'break': this.tone(150, 55, 0.3, 0.3, 'sawtooth'); this.noise(900, 200, 0.2, 0.2); break;
      case 'perfect': this.tone(880, 1320, 0.12, 0.12, 'sine'); this.tone(1760, 1760, 0.2, 0.08, 'sine', 0.08); break;
      case 'charged': this.tone(660, 990, 0.1, 0.1, 'triangle'); break;
      case 'cast': this.tone(a === 'fire' || a === 'heal' ? 440 : 240, a === 'fire' || a === 'heal' ? 880 : 330, 0.22, 0.08, a === 'fire' || a === 'heal' ? 'sine' : 'triangle'); break;
      case 'fire': this.noise(900, 300, 0.3, 0.14); this.tone(300, 120, 0.2, 0.08, 'sawtooth'); break;
      case 'boom': this.tone(a ? 90 : 120, 38, a ? 0.4 : 0.28, 0.32, 'sine'); this.noise(500, 90, a ? 0.34 : 0.22, 0.24); break;
      case 'kill': this.tone(660, 660, 0.09, 0.13, 'triangle'); this.tone(990, 990, 0.16, 0.13, 'triangle', 0.09); break;
      case 'growl': { const f = a === 'bear' ? 70 : a === 'tiger' ? 95 : a === 'boar' ? 130 : a === 'deer' ? 210 : 110; this.tone(f, f * 0.62, a === 'bear' ? 0.45 : 0.3, 0.13, 'sawtooth'); break; }
      case 'heal': this.tone(520, 780, 0.18, 0.12, 'sine'); this.tone(780, 1040, 0.22, 0.1, 'sine', 0.1); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.34, 0.16, 'triangle', i * 0.11)); this.tone(1568, 1568, 0.6, 0.07, 'sine', 0.44); break;
      case 'bite8': this.noise(7000, 2200, a === 'miss' ? 0.02 : 0.03, 0.2); this.tone(3100, 2400, a === 'miss' ? 0.02 : 0.03, 0.07, 'square'); if (a !== 'miss') this.tone(140, 80, 0.06, 0.16, 'sine'); if (a === 'hit') this.noise(2600, 500, 0.1, 0.2); break;      /* 0.8 咬合特效的後備合成音：牙齒碰撞的「喀」＋（咬中）短促的咬肉聲 */
      case 'click': this.tone(880, 660, 0.04, 0.06, 'square'); break;
      case 'loot': this.tone(1200, 1500, 0.07, 0.07, 'sine'); break;
      case 'deny': this.tone(180, 140, 0.12, 0.1, 'square'); break;
      case 'lock': this.tone(990, 1320, 0.07, 0.09, 'triangle'); this.tone(1480, 1480, 0.1, 0.05, 'sine', 0.05); break;
      case 'unlock': this.tone(740, 520, 0.09, 0.07, 'triangle'); break;
      case 'draw': this.noise(420, 760, 0.16, 0.05); break;
      case 'arrow': this.noise(2800, 900, 0.1, 0.15); this.tone(520, 170, 0.07, 0.1, 'triangle'); break;
      case 'quest': this.tone(659, 659, 0.16, 0.13, 'triangle'); this.tone(988, 988, 0.3, 0.13, 'triangle', 0.14); break;
    }
  }
};

const VOLS = [['vol', 'vol', 'master'], ['volSfx', 'vSfx', 'sfx'], ['volAmb', 'vAmb', 'ambient'], ['volMus', 'vMus', 'music']];      // 滑桿、設定欄位、audio.js 的組別
const volOf = k => clamp(+settings[k] || 0, 0, 100) / 100;
function applyVol() { for (const [, k, g] of VOLS) GA.setVolume(g, volOf(k)); if (Sfx.out) Sfx.out.gain.value = volOf('vol') * volOf('vSfx'); }
applyVol();

/* ============================== 圖示（程式畫的 SVG，40×40） ============================== */
// 風格：大塊面、深色描邊、一道高光。物品畫在深色方格上，技能畫在技能顏色的圓底上，天賦球是裝著技能符號的玻璃球
const IK = '#1c140c', IO = `stroke="${IK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`, CR = '#fff3d6';
const ln = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const out = (d, col, w) => ln(d, IK, w + 2.6) + ln(d, col, w);       // 有描邊的粗線
const hide = (base, extra) => {      // 攤開的獸皮：畫右半邊再鏡射
  const R = [[20, 7.5], [23.5, 4.5], [25.5, 8.5], [24.5, 11.5], [31.5, 8.5], [35.5, 13], [30, 18], [28, 22], [35, 25.5], [33.5, 32], [27.5, 29.5], [23, 31.5], [22, 36], [20, 37]], L = R.slice(1, -1).reverse().map(p => [40 - p[0], p[1]]);
  return `<polygon points="${R.concat(L).map(p => p.join(',')).join(' ')}" fill="${base}" ${IO}/>${extra || ''}`;
};
const EMB = {      // 技能符號（奶油色）
  cleave: ln('M8 13a17 17 0 0 1 21 21', CR, 3, 'opacity=".55"') + `<path d="M33 6l-2.200 9.200-11.600 11.600-5-5 11.600-11.600z" fill="${CR}" ${IO}/>` + out('M12.5 20.500l7 7', '#c9a35a', 2.4) + out('M14 26l-6 6', '#8a5a36', 2.6),
  dash: ln('M6 14h9M4 20h12M6 26h9', CR, 2.8, 'opacity=".7"') + `<path d="M19 9l15 11-15 11 4.500-11z" fill="${CR}" ${IO}/>`,
  wall: `<path d="M20 5.500l11.500 4v9.500c0 8-5 13-11.500 15.500c-6.500-2.500-11.500-7.500-11.500-15.500v-9.500z" fill="${CR}" ${IO}/><path d="M20 9.500l7.500 2.700v7c0 5.600-3.200 9.200-7.500 11.300z" fill="${IK}" opacity=".22"/>`,
  blade: `<path d="M7.500 24a13.500 13.500 0 0 1 25-9.500c-5.500-3.500-12.500-2-14.500 3.500s1.500 10.500 7 11.500a13.500 13.500 0 0 1-17.500-5.500z" fill="${CR}" ${IO}/>` + ln('M29 24l4 2M27 28.500l3 3', CR, 2.2, 'opacity=".7"'),
  fire: `<path d="M20 4.500c1.500 6.500 9.500 9.500 9.500 18a9.500 9.500 0 0 1-19 0c0-4 2-6.500 4-9.500c.8 3 1.800 4.200 3 4.500c1-4.500-.5-8.500 2.500-13z" fill="${CR}" ${IO}/><path d="M20 19c2.200 2.800 4 4.500 4 7.200a4 4 0 0 1-8 0c0-2.700 1.800-4.400 4-7.200z" fill="#f08a2c"/>`,
  heal: `<path d="M16 7h8v9h9v8h-9v9h-8v-9H7v-8h9z" fill="${CR}" ${IO}/>` + ln('M19 10v20', '#7fd6c4', 2, 'opacity=".8"'),
  warcry: `<path d="M4.500 25c9.500 1 17-3.500 20.500-13.500l8 4.500c-4.500 12.500-14.500 20-27.500 17.500z" fill="${CR}" ${IO}/>` + ln('M11.500 25.500l1 8M24 13.500l7.500 4.500', IK, 1.5, 'opacity=".55"') + ln('M28.500 7.500l1.500-4M33 10l3.500-3M35.500 14.500l4-.5', CR, 2.6),
  quake: `<path d="M16.500 5h7v9h5.500l-9 10.500-9-10.500h5.500z" fill="${CR}" ${IO}/>` + out('M4.500 28.500h7.500l3.500 4.500 4.500-7 4.500 7 3.500-4.500h7.500', CR, 2.4),
  pierce: ln('M5 23l6-6M13 35l6-6', CR, 2.4, 'opacity=".6"') + out('M25 15L9 31', '#c9a35a', 2.6) + `<path d="M35 5l-4 12-8-8z" fill="${CR}" ${IO}/>`,
  missile: ln('M25 14c-6 3-10 8-12.500 15.500', CR, 2.6, 'opacity=".65"') + ln('M27 26.500c-5 1-9 3-12 7', CR, 2.2, 'opacity=".65"') + ln('M14.500 12c-3 3-5 7-6 11.500', CR, 2.2, 'opacity=".65"') + `<circle cx="28.500" cy="11.500" r="5" fill="${CR}" ${IO}/><circle cx="30" cy="25.500" r="3.800" fill="${CR}" ${IO}/><circle cx="16.500" cy="9.500" r="3.500" fill="${CR}" ${IO}/>`,
  triple: [[8, 33, 30, 11], [5, 25, 21, 9], [16, 35, 32, 19]].map(([x0, y0, x1, y1], i) => out(`M${x0} ${y0}L${x1} ${y1}`, i ? '#e6d7b5' : CR, i ? 2 : 2.6) + `<path d="M${x1 + 3.5} ${y1 - 3.5}l-1.500 7.500-6-6z" fill="${CR}" ${IO}/>`).join(''),
  flurry: ln('M7 13.500a21 21 0 0 1 26 2', CR, 3) + ln('M5 21.500a23 23 0 0 1 30 1', CR, 3.8) + ln('M8 30a21 21 0 0 1 25-2', CR, 3) + ln('M30 9l4 5M31 28l3.500-4', IK, 1.4, 'opacity=".4"'),
  nova: `<circle cx="20" cy="20" r="4.500" fill="${CR}" ${IO}/>` + ln('M20 9.500a10.500 10.500 0 1 1-.1 0', CR, 2.6) + ln('M20 3.500a16.500 16.500 0 0 1 14.300 8.300M36.500 20a16.500 16.500 0 0 1-8.300 14.300M20 36.500a16.500 16.500 0 0 1-14.300-8.300M3.500 20a16.500 16.500 0 0 1 8.300-14.300', CR, 2.2, 'opacity=".7"'),
  backshot: ln('M24 15c-4-7.500-12.500-7.500-16.500-1', CR, 2.6) + `<path d="M4.500 9.500l1 8 6.500-4z" fill="${CR}" stroke="${CR}" stroke-width="1" stroke-linejoin="round"/>` + out('M12 27h17', CR, 2.8) + `<path d="M36 27l-8.500 5v-10z" fill="${CR}" ${IO}/>` + ln('M12 24v6M15.500 24.500v5', '#c9564a', 1.8),
  kick: `<path d="M9 9.500h8l1 10.500 10 4.500c2 1 2 5.500-1 5.500H9.500c-1.500 0-2-1.500-2-3z" fill="${CR}" ${IO}/><path d="M7.500 27.500h22c.4 1.300-.4 2.500-1.800 2.500H9.500c-1.500 0-2-1-2-2.500z" fill="${IK}" opacity=".3"/>` + ln('M33 16.500l4-2.500M34.500 22h4.500M33 27.500l4 2.500', CR, 2.6),
  blink: ln('M12.500 31.500a6 6 0 1 1 .1 0', CR, 2.2, 'stroke-dasharray="2.600 3.200" opacity=".8"') + ln('M12 14.500c5-7.500 13-7.500 17-1', CR, 2.6) + `<path d="M31.500 8.500l-.5 7.500-6.500-3.500z" fill="${CR}" stroke="${CR}" stroke-width="1" stroke-linejoin="round"/><path d="M27.500 17.500l5.500 8-5.500 9-5.500-9z" fill="${CR}" ${IO}/>`
};
const ICON = {
  potion: `<rect x="16.800" y="6.500" width="6.400" height="11" fill="#dfeaec" ${IO}/><circle cx="20" cy="25" r="10.500" fill="#dfeaec" ${IO}/><rect x="17.700" y="13" width="4.600" height="4.500" fill="#dfeaec"/><path d="M10.600 24a9.500 9.500 0 1 0 18.800 0q-2.350 1.500-4.700 0t-4.700 0-4.700 0-4.700 0z" fill="#d9483a"/><rect x="15.800" y="3.500" width="8.400" height="4.600" rx="1.300" fill="#b07c44" ${IO}/>` + ln('M13.500 26a7 7 0 0 0 3 5.500', '#fff', 1.8, 'opacity=".7"'),
  meat: out('M9.500 29.500l-3.500 3.500M30.500 10.500l3.500-3.500', '#f3ead4', 3.2) + `<circle cx="5" cy="31.500" r="2.300" fill="#f3ead4" ${IO}/><circle cx="8.500" cy="35" r="2.300" fill="#f3ead4" ${IO}/><circle cx="35" cy="8.500" r="2.300" fill="#f3ead4" ${IO}/><circle cx="31.500" cy="5" r="2.300" fill="#f3ead4" ${IO}/><ellipse cx="20" cy="20" rx="12.500" ry="8.800" transform="rotate(-45 20 20)" fill="#b4532e" ${IO}/><ellipse cx="22" cy="22" rx="8" ry="4.800" transform="rotate(-45 22 22)" fill="#8f3d22" opacity=".55"/>` + ln('M11.500 19.500c1.500-4 4.500-7 8.500-8.500', '#ee9a6c', 2.4),
  tusk: `<path d="M8.500 30c.5-12 8.500-21.500 23-24c-7 5.500-10 13-9.500 24z" fill="#f1e8d0" ${IO}/><path d="M12.500 28c.8-8 5-14.500 12-18.500" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".8"/><path d="M7 28.500c4.500 1.800 12 1.800 16.500 0l.5 5c-5 2-12.500 2-17.500 0z" fill="#8a5a36" ${IO}/>`,
  pelt_wolf: hide('#8f989f', ln('M15.500 14.500l4.500 3.500 4.500-3.500M16 20.500l4 3 4-3M17 26l3 2.200 3-2.200', '#596168', 2.2) + ln('M12 14l-2.500-1M28 14l2.500-1', '#c3cbd1', 1.8)),
  pelt_bear: hide('#6b4a30', `<path d="M20 12c3.500 2.500 5 6.500 5 11s-1.500 6.500-5 7.500c-3.500-1-5-3-5-7.500s1.500-8.500 5-11z" fill="#8c6844"/>` + ln('M11 13.500l1.500 2M29 13.500l-1.500 2M10 27.500l2 .5M30 27.500l-2 .5', '#3f2a1a', 1.8)),
  pelt_tiger: hide('#e88f2c', `<path d="M20 11c2 3 2.800 7 2.800 11s-.8 6-2.800 8c-2-2-2.800-4-2.800-8s.8-8 2.800-11z" fill="#f8e0b0"/>` + ln('M12.500 14.500h4.500M11.500 19.500h5M12 24.500h5M27.500 14.500h-4.500M28.500 19.500h-5M28 24.500h-5M29 11.500l2.500 2M11 11.500l-2.500 2M30.500 27l2 2M9.500 27l-2 2M20 31.500v3', '#2a1c12', 2.2)),
  pelt_deer: hide('#c79457', `<g fill="#fff6e2"><circle cx="16.500" cy="15" r="1.600"/><circle cx="23.500" cy="15" r="1.600"/><circle cx="14.500" cy="21.500" r="1.700"/><circle cx="25.500" cy="21.500" r="1.700"/><circle cx="20" cy="19" r="1.500"/><circle cx="18" cy="26" r="1.500"/><circle cx="22.500" cy="26.500" r="1.500"/><path d="M21.200 33l.8 3-2 1-2-1 .8-3z"/></g>`),
  gall: out('M20 5.500v5', '#c9a35a', 2) + `<path d="M20 9.500c7.500 6 10.500 11 10.500 16a10.500 10.500 0 0 1-21 0c0-5 3-10 10.500-16z" fill="#4f9d5d" ${IO}/><path d="M20 15c4.500 4 6.500 7.500 6.500 10.500a6.500 6.500 0 0 1-6.500 6.500z" fill="#2f6f3f" opacity=".5"/>` + ln('M14 24.500a6 6 0 0 0 2.500 5.500', '#c9f0cf', 1.8) + out('M16 10.500h8', '#c9a35a', 2.2),
  fang: `<path d="M13 10.500c0 9.500 2.500 18 7 25c4.500-7 7-15.500 7-25z" fill="#f6f0df" ${IO}/><path d="M20 12v21.500c3-6 5-13 5-21.500z" fill="#cfc4a6" opacity=".7"/><path d="M11 8c0-4.500 18-4.500 18 0c0 3-2 5-9 5s-9-2-9-5z" fill="#c9564a" ${IO}/>`,
  antler: out('M11 35c0-11 3.500-19.500 13-28M14.800 22.500l-8-5M18.500 15l-5.500-7.500M24 7l9-2.500M17 19l11 1', '#e6d7b5', 4) + `<ellipse cx="11" cy="34.500" rx="5" ry="2.400" fill="#8a5a36" ${IO}/>`,
  trophy_frost: ln('M7 9.500c7-6 19-6 26 0', '#7a5c28', 2.2) + `<path d="M12 9c6.500-2.500 13.500-.5 15.500 4c1 8.500-3.500 16.500-13 22.500c2.500-9.500.5-17.500-2.500-26.500z" fill="#cdeaf8" ${IO}/><path d="M12 9c6.500-2.500 13.500-.5 15.500 4c.2 2-.1 4-.7 6c-4-3-9-3.500-12.500-2.500z" fill="#fff" opacity=".85"/>` + ln('M30.500 23v8M26.500 27h8M27.700 24.200l5.600 5.600M33.300 24.200l-5.600 5.600', '#eaf8ff', 1.5),
  trophy_scar: [0, 8.5, 17].map(dx => `<path d="M${5.5 + dx} 31c0-11 4.500-19.500 13-24c-4.500 7-6 14.500-5.500 24z" fill="#3a2f28" ${IO}/>` + ln(`M${8.5 + dx} 28c.5-6.500 2.500-11.500 6-15.500`, '#8a7a6c', 1.5)).join('') + `<rect x="3.500" y="28.500" width="28" height="6.500" rx="2" fill="#8a6038" ${IO}/>` + ln('M8 31.800h3M14.500 31.800h3M21 31.800h3M27 31.800h1.500', '#e8c58a', 1.6),
  trophy_shadow: out('M9 34c13 1.500 21.500-3.500 21.500-11.500s-10-8-10-15.500', '#8d72c4', 5.2) + ln('M14.500 31.500l1.500 5M21.500 30l2.500 4.500M26.500 25.500l5 2M26 19l5.500-1.500M20.500 14.500l5.500-2.500M18 9l5.500-.5', '#2a2036', 2.2) + `<circle cx="20.500" cy="6.500" r="3" fill="#2a2036"/>`,
  gold: `<circle cx="20" cy="20" r="12.500" fill="#f2c54a" ${IO}/><circle cx="20" cy="20" r="8.500" fill="none" stroke="#b9862a" stroke-width="1.600"/><circle cx="20" cy="20" r="4" fill="#c9952f" stroke="${IK}" stroke-width="1.400"/>` + ln('M11.500 17a9.500 9.500 0 0 1 6-6', '#fff', 1.8, 'opacity=".8"'),
  heavy: ln('M6 8l5 3M12 3.500l2 5.500M3.500 15.500l5.500 1', '#ffd76a', 2.6) + `<path d="M35 5l-2 12.500-13.500 13.500-8.500-8.500 13.500-13.500z" fill="#f1d28a" ${IO}/><path d="M35 5l-2 12.500-13.500 13.500-4.200-4.200z" fill="#c9952f" opacity=".75"/>` + out('M8.500 19l12.500 12.500', '#c9a35a', 3) + out('M12 28l-6 6', '#8a5a36', 3.2) + `<circle cx="5.500" cy="34.500" r="2.600" fill="#c9a35a" ${IO}/>`,
  attack: `<path d="M34 5.500l-2.500 10-13 13-5.500-5.500 13-13z" fill="#e3eaee" ${IO}/><path d="M34 5.500l-2.500 10-13 13-2.700-2.700z" fill="#9fb0ba" opacity=".7"/>` + out('M11 19.500l9.500 9.500', '#c9a35a', 2.6) + out('M13.500 26.500l-6 6', '#8a5a36', 2.8) + `<circle cx="6.500" cy="33.500" r="2.400" fill="#c9a35a" ${IO}/>`,
  guard: `<path d="M20 4.500l12.500 4.300v10.200c0 8.500-5.500 14-12.500 16.500c-7-2.500-12.500-8-12.500-16.500V8.800z" fill="#c9a35a" ${IO}/><path d="M20 8.500l8.800 3v8c0 6-3.800 10-8.800 12.200c-5-2.200-8.800-6.200-8.800-12.200v-8z" fill="#5d7f9f" stroke="${IK}" stroke-width="1.300"/><path d="M20 8.500l8.800 3v8c0 6-3.800 10-8.800 12.200z" fill="#3f5f7f" opacity=".7"/>` + ln('M13.500 13.500v6', '#fff', 1.6, 'opacity=".6"'),
  dodge: ln('M5 15h8M3.500 21h7M6 27h6', '#e8dcc0', 2.4, 'opacity=".75"') + `<path d="M17 9.500h7.500l1 10.500 9 4.500c1.500 1 1.500 5-1 5H16.500c-1.500 0-2-1.500-2-3z" fill="#b07c44" ${IO}/><path d="M14.500 27.500h20.200c.4 1.200-.2 2-1.200 2h-17c-1.500 0-2-.8-2-2z" fill="#5a3d22"/>` + ln('M18 13.500h6.500', '#e8c58a', 1.8)
};
// 回傳 SVG 字串。id：物品代號、gold、attack／guard／dodge、orb_<技能>、sk_<技能>
export function iconSvg(id) {
  let body = ICON[id];
  if (!body && id.startsWith('sk_')) body = EMB[id.slice(3)];
  if (!body && id.startsWith('orb_')) { const S = SKILLS[id.slice(4)], e = EMB[id.slice(4)]; if (S && e) body = (S.rare ? `<circle cx="20" cy="20" r="17.300" fill="none" stroke="#f0d79a" stroke-width="1.600" stroke-dasharray="3 2.500"/>` : '') + `<circle cx="20" cy="20" r="14.500" fill="${S.color}" ${IO}/><path d="M33 26.500a14.500 14.500 0 0 1-23.500 3.500a16 16 0 0 0 23.500-3.500z" fill="${IK}" opacity=".3"/><g transform="translate(20 21) scale(.56) translate(-20 -20)">${e}</g><ellipse cx="14.500" cy="12.500" rx="5" ry="2.600" transform="rotate(-35 14.500 12.500)" fill="#fff" opacity=".65"/>`; }
  if (!body && icon06Svg) { const s6 = icon06Svg(id); if (s6) return s6; }      // 0.6：美術的 icons06.js（物品、增益、飽食與精力的圖示）
  if (!body && ITEMS[id] && ITEMS[id].glyph) { const it = ITEMS[id]; body = `<rect x="4.5" y="4.5" width="31" height="31" rx="7" fill="${it.color}" ${IO}/><text x="20" y="27" text-anchor="middle" font-size="19" font-weight="700" fill="${IK}" font-family="'Noto Serif TC',serif">${it.glyph}</text>`; }      // 0.6 的新物品：美術的圖示到位前，用底色加一個字佔位
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${body || `<circle cx="20" cy="20" r="9" fill="#8a8576" ${IO}/>`}</svg>`;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// 美術的 icons06.js 到位後（main.js 動態載入）：0.6 的物品改用 icon06(id, size) 的圖（canvas 或 data URL）；沒有的照舊用 iconSvg
let icon06 = null, icon06Svg = null; const icon06Url = new Map();
export function setIcon06(fn, svgFn) { icon06 = typeof fn === 'function' ? fn : null; icon06Svg = typeof svgFn === 'function' ? svgFn : null; icon06Url.clear(); ui.dirty = true; document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = iconSvg(e.dataset.ic); }); healS.pick = ''; }      // svgFn（icon06Svg）有的話優先用：和 iconSvg 同格式，所有用到圖示的地方都會換
function iconUrl(id) { if (!icon06 || icon06Svg || ICON[id]) return null; if (!icon06Url.has(id)) { let a = null; try { a = icon06(id, 80); } catch (e) {} icon06Url.set(id, a ? (typeof a === 'string' ? a : a.toDataURL ? a.toDataURL() : null) : null); } return icon06Url.get(id); }
const ic = (id, cls) => { const s = el('span', 'ic' + (cls ? ' ' + cls : '')), u = iconUrl(id); if (u) { const im = new Image(); im.src = u; im.alt = ''; s.appendChild(im); } else s.innerHTML = iconSvg(id); return s; };
const skIc = S => { const s = ic('sk_' + S.id, 'sk'); s.style.background = S.color; return s; };

/* ============================== 訊息類 ============================== */
let toastT = 0, bannerT = 0, hurtT = 0, tipT = 0, lastZone = '', lastPrompt = '';
// 新手提示：每種情況只出現一次（記在這台瀏覽器）。同時寫進左下角的紀錄，但直接算舊訊息（打開聊天才看得到），不和畫面上的提示重複
// 同時來好幾則（例如打倒一隻狼同時撿到肉和皮）：排隊一則一則出來，前一則至少顯示 5 秒
const tipQ = [];
function tip(id, text) { if (!settings.tips) settings.tips = {}; if (settings.tips[id]) return; settings.tips[id] = 1; saveSettings(); addLine(p => { p.textContent = '提示：' + text; }, 'sys old'); if (tipT > 4) tipQ.push(text); else showTip(text); }
function showTip(text) { const e = $('tip'); e.lastElementChild.textContent = text; e.classList.add('on'); tipT = 9; }
let moveT = 0;
function moveName(t) { const e = $('moveName'); e.textContent = t; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); moveT = 1.1; }
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); toastT = 2.4; }
function addLine(build, cls) { const log = $('chatLog'), p = document.createElement('p'); if (cls) p.className = cls; build(p); log.appendChild(p); while (log.children.length > 40) log.firstChild.remove(); if (!/\bold\b/.test(p.className)) { setTimeout(() => p.classList.add('fade'), 10000); setTimeout(() => p.classList.add('old'), 11000); } else p.classList.add('fade'); }      // 舊訊息：先淡出再收起來（不佔位置）；打開聊天時全部看得到
function chat(name, text, color) { addLine(p => { const b = document.createElement('b'); b.textContent = name + '　'; b.style.color = color || ''; p.append(b, document.createTextNode(text)); }); }
function log(text) { addLine(p => { p.textContent = text; }, 'sys'); }
function loot(text, icons) { const f = $('feed'), p = document.createElement('p'); if (icons) for (const id of icons.slice(0, 7)) p.appendChild(ic(id, 'bare')); p.append(text); f.appendChild(p); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => { p.style.opacity = '0'; setTimeout(() => p.remove(), 650); }, 4600); Sfx.play('loot'); }
const zoneSeen8 = new Set();
function zoneBanner(k, Z) {      /* 0.8 X7：22 區的名牌。北境的名字拆成小標「北境」＋大字；新地小標「新地」；第一次進入（這次上線）多一句區域說明 */
  const ring = Z.ring || '', lv0 = parseInt(Z.lv, 10), lo = !Z.safe && lv0 > 0 && P.lv < lv0 - 2, lz = STORY.LORE && STORY.LORE.zones;
  const desc = ring && !zoneSeen8.has(k) && lz && lz[k] ? lz[k] : ''; zoneSeen8.add(k);
  banner(Z.name.replace(/^北境・/, ''), Z.sub + (lo ? `　你現在 ${P.lv} 級` : ''), { kick: ring === 'N' ? '北　境' : ring === 'A' ? '新　地' : '', desc, ring, warn: lo });
}
function banner(title, sub, o) { const b = $('banner'); o = o || {}; /* 0.8 X7：區域名牌（新地、北境多一行小標與一句說明；等級不夠時建議等級變色） */ let kk = b.querySelector('em.bk8'), dd = b.querySelector('small.bd8'); if (!kk) { kk = el('em', 'bk8'); b.prepend(kk); dd = el('small', 'bd8'); b.append(dd); }
  kk.textContent = o.kick || ''; kk.hidden = !o.kick; dd.textContent = o.desc || ''; dd.hidden = !o.desc; b.classList.toggle('n8', o.ring === 'N'); b.classList.toggle('a8', o.ring === 'A'); b.classList.toggle('lo8', !!o.warn);
  b.querySelector('b').textContent = title; b.querySelector('span').textContent = sub || ''; b.classList.add('on'); bannerT = o.desc ? 5 : 3.2; narrGap = Math.max(narrGap, 0.7); if (narrT > 0) { narrQ.unshift({ t: $('narr').textContent, again: 1 }); $('narr').classList.remove('on'); narrT = 0; } }      // 區域名稱和旁白用同一個位置：旁白先讓開，等名稱退掉再接著講
function levelUp(lv) { const e = $('lvup'); e.lastElementChild.textContent = lv >= LV_CAP ? `等級 ${lv}　已達第一層的上限（${LV_CAP} 級）　獲得 10 點能力點數` : `等級 ${lv}　獲得 10 點能力點數　按 ${keyOf('char')} 分配`; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); Sfx.play('levelup'); log(`等級提升到 ${lv}，生命與體力完全恢復。`); if (lv % 5 === 1 && lv > 1) log(`進入第${TIER_N[(lv - 1) / 5] || (lv - 1) / 5 + 1}級距（${lv}–${lv + 4} 級）：野獸與任務給的經驗、升級需要的經驗都大幅提高。`); ui.dirty = true; }
/* ---------- 0.6 對打：全場公告、組隊邀請、隊伍列表 ---------- */
// 公告（通緝、討伐）：畫面上方中央，每則 7 秒，最多疊 3 則；同時寫進對話紀錄（紅字）。顯示時區域名稱的大字往下讓
const noticeQ = [];
function notice(text, kind) {
  const box = $('notice'), p = el('p', kind === 'hunt' ? 'hunt' : 'kill'), m = /^(【通緝】)?(.*)$/.exec(text);
  if (m[1]) p.append(el('b', '', m[1])); p.append(m[2]); box.appendChild(p); while (box.children.length > 3) box.firstChild.remove();
  noticeQ.push({ p, t: 7 }); document.body.classList.add('noticing'); addLine(q => { q.textContent = text; }, 'sys ' + (kind === 'hunt' ? 'hunt' : 'kill')); Sfx.play('wanted');      // 通緝與討伐的公告共用音效成員的 wanted
}
// 組隊邀請：Y 接受、N 拒絕（也可以點按鈕；背後視角鎖著滑鼠時按住 Alt 放出游標）。到期自己收掉
let inv = null;
function showInvite(v) {
  inv = v; const e = $('invite'); e.hidden = !v; if (!v) return;
  $('invWho').textContent = v.name; $('invLv').textContent = 'Lv' + (v.lv || 1); $('invFill').style.transform = 'scaleX(1)';
}
// 隊伍列表（左側、角色狀態下方）：名字、等級、血條；暫離、倒下另外標。只有自己時不顯示
let partyKey = '';
function renderParty() {
  const box = $('party'), m = party(); box.hidden = !m.length; if (!m.length) { partyKey = ''; return; }
  const key = m.map(r => r.peer + r.name + r.lv).join('|');
  if (key !== partyKey) { partyKey = key; const list = $('partyList'); list.textContent = ''; for (const r of m) { const row = el('div', 'pm'); row.dataset.peer = r.peer; const top = el('div', 'pmTop'); top.append(el('b', '', r.name), el('small', 'pmLv', 'Lv' + r.lv), el('em', 'pmSt')); const bar = el('div', 'pmBar'); bar.appendChild(el('i')); row.append(top, bar); list.appendChild(row); } $('partyN').textContent = `${m.length + 1} / 5`; }
  for (const row of $('partyList').children) { const r = m.find(o => o.peer === row.dataset.peer); if (!r) continue; row.querySelector('.pmBar i').style.transform = `scaleX(${clamp(r.hp / 100, 0, 1)})`; const st = r.away ? '暫離' : !r.alive ? '倒下' : r.inSafe ? '城內' : ''; const se = row.querySelector('.pmSt'); if (se.textContent !== st) se.textContent = st; row.classList.toggle('off', !!r.away || !r.alive); row.classList.toggle('ol', !!r.ol); }
}
function dead(loss, gold, grace) { const e = $('dead'); if (loss === -1) { e.classList.remove('on'); return; } Sfx.play('dead'); $('deadText').textContent = (grace ? '五分鐘內再次倒下，不重複扣除經驗與金幣' : loss > 0 ? `失去 ${loss} 點經驗` : '沒有失去經驗') + (gold > 0 ? `，${gold} 金幣遺落在倒下的地方（15 分鐘內只有你能撿回）` : '') + '。即將在鐵環城甦醒。'; e.classList.add('on'); if (gold > 0) log(`${gold} 金幣遺落在倒下的地方，地圖上有標記。`); }

/* ============================== 視窗 ============================== */
const WINS = { char: 'winChar', bag: 'winBag', map: 'winMap', set: 'winSet', shop: 'winShop', skill: 'winSkill', quest: 'winQuest', craft: 'winCraft', forge: 'winForge', cloak: 'winCloak', draw7: 'winDraw7', maps7: 'winMaps7', save7: 'winSave7' };
const isOpen = k => !$(WINS[k]).hidden;
let zTop = 21;
const front = w => { w.style.zIndex = ++zTop; };
function placeWin(w) { const p = settings.win && settings.win[w.id]; if (!p) return; w.style.left = clamp(p[0], 60 - w.offsetWidth, innerWidth - 60) + 'px'; w.style.top = clamp(p[1], 0, innerHeight - 36) + 'px'; w.style.right = 'auto'; w.style.transform = 'none'; }
function setWin(k, on) {
  if (!input.started || input.creator) return;
  const w = $(WINS[k]); const was = w.hidden; w.hidden = !on; if (was === on) Sfx.play('win', on ? 'open' : 'close', { tag: k }); if (on) { placeWin(w); front(w); }      // 真的開或關才出聲（一次關掉全部視窗時不會連響好幾聲）
  if (k === 'char') { if (!on) resetPend(); renderChar(); } if (k === 'bag' && on) renderBag(); if (k === 'map' && on) drawBigMap(); if (k === 'set' && on) renderSet(); if (k === 'shop' && on) renderShop(); if (k === 'skill' && on) renderSkills(); if (k === 'quest' && on) renderQuests(); if (k === 'craft') { if (on) UI6.renderCraft(); else UI6.closeCraft(); } if (k === 'forge' && on) UI6.renderForge(); if (k === 'cloak' && on) UI6.renderCloak(); if (k === 'draw7' && on) M7.renderDraw(); if (k === 'maps7' && on) M7.renderMaps(); if (k === 'save7' && on) S7.render();
  if (!on && dlg && dlg.shop === k) { dlg.shop = false; $('dialog').hidden = false; dlgMenu(dlg.N.greet[0]); }      // 買賣完回到對話
  $('tip').style.visibility = isOpen('map') ? 'hidden' : '';      // 0.7（d7-ui）：大地圖開著時提示框收起來（地圖視窗會壓到它）
  if (anyOpen()) unlock(); else { zTop = 21; lock(); }
}
// 視窗可以抓著標題列拖動，點到的視窗會浮到最上層，位置會記住
function bindDrag() {
  let d = null;
  document.addEventListener('mousedown', e => { const w = e.target.closest('.win'); if (!w || w.id === 'creator') return; front(w); if (e.button !== 0 || !e.target.closest('header') || e.target.closest('button')) return; const r = w.getBoundingClientRect(); d = { w, dx: e.clientX - r.left, dy: e.clientY - r.top }; w.style.left = r.left + 'px'; w.style.top = r.top + 'px'; w.style.right = 'auto'; w.style.transform = 'none'; e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (!d) return; d.w.style.left = clamp(e.clientX - d.dx, 60 - d.w.offsetWidth, innerWidth - 60) + 'px'; d.w.style.top = clamp(e.clientY - d.dy, 0, innerHeight - 36) + 'px'; });
  window.addEventListener('mouseup', () => { if (!d) return; if (!settings.win) settings.win = {}; settings.win[d.w.id] = [parseFloat(d.w.style.left), parseFloat(d.w.style.top)]; saveSettings(); d = null; });
}
/* ---------- 滑鼠鎖定與視角 ---------- */
let lockFails = 0, lockFailAt = 0, selfUnlock = false, freeCursor = false, restFree = false;
const wantLock = () => input.started && !input.creator && !input.talk && input.cam.mode === 'tps' && !anyOpen() && !freeCursor && !restFree;
const restCursor = on => { restFree = !!on; if (on) unlock(); else lock(); };      // 0.6：坐在營火旁時放開滑鼠
function lock() { const cv = $('scene'); if (!wantLock() || input.cam.locked || lockFails >= 3 || !cv.requestPointerLock) return; try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(lockFail); } catch (e) { lockFail(); } }
function unlock() { if (document.pointerLockElement) { selfUnlock = true; try { document.exitPointerLock(); } catch (e) {} } }
function lockFail() { const now = performance.now(); if (now - lockFailAt < 400) return; lockFailAt = now; lockFails++; if (lockFails >= 2 && !input.cam.noLock) { input.cam.noLock = true; toast('這個環境不能鎖定滑鼠：按住右鍵拖曳來轉動視角。'); renderSet(); } }
function setView(mode, quiet) { input.cam.mode = mode; settings.view = mode; saveSettings(); document.body.classList.toggle('tps', mode === 'tps'); if (mode === 'top') unlock(); else lock(); renderSet(); if (!quiet) toast(mode === 'tps' ? '背後視角' : '俯視視角'); }
const toggleWin = k => setWin(k, !isOpen(k));
const anyOpen = () => Object.keys(WINS).some(isOpen);
const closeAll = () => { for (const k in WINS) if (isOpen(k)) setWin(k, false); };

/* ---------- 角色與配點 ---------- */
const pend = { str: 0, agi: 0, acc: 0, int: 0, luk: 0, end: 0 }, rows = {};
const pendSum = () => STAT_KEYS.reduce((s, k) => s + pend[k], 0);
const resetPend = () => { for (const k of STAT_KEYS) pend[k] = 0; };
const pct = v => Math.round(v * 100) + '%';
const DERIVED = [['生命上限', d => d.maxHp, 1], ['體力上限', d => d.maxSt, 1], ['魔力上限', d => d.maxMp, 1], ['魔力回復', d => d.mpRegen.toFixed(1) + ' /秒', 1, d => d.mpRegen], ['法術威力', d => pct(d.spellMul), 1, d => d.spellMul], ['近戰傷害', d => pct(d.dmgMul), 1, d => d.dmgMul], ['弓箭與投擲', d => pct(d.throwMul), 1, d => d.throwMul], ['攻擊速度', d => pct(d.atkSpeed), 1, d => d.atkSpeed], ['移動速度', d => pct(d.speedMul), 1, d => d.speedMul], ['暴擊率', d => pct(d.crit), 1, d => d.crit], ['失手率', d => pct(d.miss), -1, d => d.miss], ['體力消耗', d => pct(d.stCost), -1, d => d.stCost], ['受到的傷害', d => pct(d.defMul), -1, d => d.defMul], ['掉寶與金幣', d => pct(d.luck), 1, d => d.luck], ['不能動縮短', () => capTxt('immob'), 1], ['被纏咬縮短', () => capTxt('hold'), 1], ['掙脫次數減', () => capTxt('escape'), 1]];
/* 0.8 三條上限（介面08 9c；ui-s S3）：immob 挑飛／擊倒／踉蹌、hold 被纏／咬／拖（和 immob 分開算）、escape 掙脫次數。值由 P7 的 mod(k) 加總、hooks08 的 capped(k) 套上限；P7 沒進來時是 0%。寫法照整備視窗的減傷那列；名稱縮成五個字，角色面板兩欄排得下（不能動縮短＝挑飛、擊倒、踉蹌；被纏咬縮短＝纏、咬、拖） */
const capTxt = k => { const cap = (H8.CAPS && H8.CAPS[k]) || 0, raw = +(H8.fn && H8.fn.mod ? H8.fn.mod(k) : 0) || 0, v = H8.capped ? H8.capped(k) : Math.min(cap, raw); return raw > cap + 1e-6 ? `${pct(v)}（已達上限）` : cap > 0 && raw >= cap - 1e-6 ? `${pct(v)}（已達上限）` : `${pct(v)}（上限${pct(cap)}）`; };
function buildChar() {
  const box = $('statRows');
  for (const k of STAT_KEYS) {
    const r = document.createElement('div'); r.className = 'stat';
    r.innerHTML = `<span class="nm">${STATS[k].name}</span><span class="val"></span><span class="eff">${STATS[k].eff}</span><span class="btns"><button data-k="${k}" data-d="-1" aria-label="減少${STATS[k].name}" title="減少${STATS[k].name}：按住可連減，Shift＋點一次 10 點" style="touch-action:none">−</button><button data-k="${k}" data-d="1" aria-label="增加${STATS[k].name}" title="增加${STATS[k].name}：按住可連加，Shift＋點一次 10 點" style="touch-action:none">＋</button></span><span class="note"></span>`;
    box.appendChild(r); rows[k] = { val: r.querySelector('.val'), note: r.querySelector('.note'), minus: r.querySelector('[data-d="-1"]'), plus: r.querySelector('[data-d="1"]') };
  }
  // 0.7 使用者意見：「＋」「－」可以按住連加。按下立刻 1 點；按住 0.4 秒起每 0.15 秒 1 點、按住 1.5 秒起每 0.1 秒 1 點（一次只動 1 點、不補點，不會跳；70 點約 7.5 秒，最快每秒 10 點，放開時最多多跑 1–2 點）。使用者 21:26：原本 70 點 3 秒太快。
  // 放開、游標離開按鈕、視窗失焦、角色視窗關掉、點數用完（減到底）立刻停。Shift＋點一下＝10 點（不夠就全部）。每一點都走 bump（同原本的上限與暫存規則），按確認才寫入。
  // 滑鼠與觸控走 pointer 事件；pointer 已處理過的那次 click 不再加（鍵盤 Enter／空白鍵的 click 的 detail 是 0，照舊每次 1 點）。連加中只更新數字與按鈕狀態，整個視窗每 0.25 秒與放開時才重畫。
  const bump = (k, d) => { const v = clamp(pend[k] + d, 0, pend[k] + P.pts - pendSum()); if (v === pend[k]) return false; pend[k] = v; return true; };
  const lite = () => { const used = pendSum(), left = P.pts - used; $('ptsN').textContent = left; for (const k of STAT_KEYS) { const r = rows[k]; r.val.textContent = P.stats[k] + pend[k]; if (pend[k]) { const i = document.createElement('i'); i.textContent = '+' + pend[k]; r.val.appendChild(i); } r.minus.disabled = pend[k] <= 0; r.plus.disabled = left <= 0; } $('ptsOk').disabled = used <= 0; $('ptsReset').disabled = used <= 0; };
  const holdGap = t => t < 1500 ? 150 : 100;      // 按住 t 毫秒時，下一點要隔多久
  let hold = null, ptrClick = false;
  const stopHold = () => { if (!hold) return; clearTimeout(hold.tm); hold = null; renderChar(); };
  const tick = () => { const h = hold; if (!h) return; if (!isOpen('char') || !h.b.isConnected || h.b.disabled) return stopHold(); const t = performance.now() - h.t0;
    if (!bump(h.k, h.d)) return stopHold(); h.n++;
    if (t - h.snd >= 90) { h.snd = t; Sfx.play('click'); } if (t - h.full >= 250) { h.full = t; renderChar(); } else lite(); if (h.d > 0 ? P.pts - pendSum() <= 0 : pend[h.k] <= 0) return stopHold();
    h.tm = setTimeout(tick, holdGap(t)); };
  box.addEventListener('pointerdown', e => { const b = e.target.closest('button[data-k]'); if (!b || b.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return; ptrClick = true; stopHold(); const k = b.dataset.k, d = +b.dataset.d;
    if (b.hasPointerCapture && b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId);      // 觸控預設會把指標鎖在按鈕上：放掉，手指滑出按鈕才收得到 pointerleave
    if (e.shiftKey) { for (let i = 0; i < 10 && bump(k, d); i++); Sfx.play('click'); renderChar(); return; }
    if (!bump(k, d)) return; Sfx.play('click'); renderChar(); if (d > 0 ? P.pts - pendSum() <= 0 : pend[k] <= 0) return;
    hold = { k, d, b, id: e.pointerId, t0: performance.now(), n: 1, full: 0, snd: 0 }; hold.tm = setTimeout(tick, 400); });
  box.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('pointerleave', () => { if (hold && hold.b === b) stopHold(); }));
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, e => { if (hold && e.pointerId === hold.id) stopHold(); }, true);
  window.addEventListener('blur', stopHold); document.addEventListener('visibilitychange', () => { if (document.hidden) stopHold(); });
  box.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; if (ptrClick && e.detail > 0) { ptrClick = false; return; } const k = b.dataset.k, d = +b.dataset.d; for (let i = 0, n = e.shiftKey ? 10 : 1; i < n && bump(k, d); i++); Sfx.play('click'); renderChar(); });
  $('ptsReset').onclick = () => { resetPend(); renderChar(); };
  $('ptsOk').onclick = () => { if (allocate(Object.assign({}, pend))) { resetPend(); Sfx.play('confirm'); toast('配點完成'); } renderChar(); };
}
function renderChar() {
  $('charDot').hidden = !(P.pts > 0); const pb = $('ptsBtn'); pb.hidden = !(P.pts > 0); if (P.pts > 0) pb.textContent = `有 ${P.pts} 點能力點數可以分配　C`;
  if (!isOpen('char')) return;
  UI6.renderRack();      // 0.6：「武器架與狀態」分頁
  const st2 = {}; for (const k of STAT_KEYS) st2[k] = P.stats[k] + pend[k];
  const D2 = deriveAll(st2, P.lv), used = pendSum(), left = P.pts - used;
  const head = $('charHead'); head.textContent = ''; const nm = document.createElement('b'); nm.textContent = P.name; head.append(nm, document.createTextNode(`等級 ${P.lv} / ${LV_CAP}　` + (P.lv >= LV_CAP ? '已達第一層的上限' : `經驗 ${nf(P.exp)} / ${nf(expNeed(P.lv))}`)));      /* 0.8 X7：等級上限跟著 LV_CAP（20），經驗加千分位 */
  $('ptsN').textContent = left;
  for (const k of STAT_KEYS) {
    const r = rows[k], S = STATS[k], sup = STATS[S.sup].name, need = Math.ceil(st2[k] / 2), have = st2[S.sup];
    r.val.textContent = st2[k]; if (pend[k]) { const i = document.createElement('i'); i.textContent = '+' + pend[k]; r.val.appendChild(i); }
    r.minus.disabled = pend[k] <= 0; r.plus.disabled = left <= 0;
    const bad = D2.deficit[k] > 0;
    r.note.className = 'note' + (bad ? ' bad' : '');
    r.note.textContent = k === 'luk' ? (bad ? `${sup}不足（需要 ${need}，目前 ${have}）：超出的幸運不生效，實際只算 ${D2.lukEff}` : `由「${sup}」支撐。${sup}低於${S.name}的一半時，超出的部分不生效。`) : (bad ? `${sup}不足（需要 ${need}，目前 ${have}）：${S.side}` : `由「${sup}」支撐。${sup}低於${S.name}的一半時：${S.side}`);
  }
  const dl = $('derived'); dl.textContent = '';
  for (const [label, fmt, dir, raw] of DERIVED) {
    const a = fmt(D), b = fmt(D2), div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label;
    if (a === b) dd.textContent = a; else { const va = raw ? raw(D) : a, vb = raw ? raw(D2) : b, i = document.createElement('i'); i.textContent = b; if ((vb - va) * dir < 0) i.className = 'dn'; dd.append(document.createTextNode(a + ' → '), i); }
    div.append(dt, dd); dl.appendChild(div);
  }
  $('ptsOk').disabled = used <= 0; $('ptsReset').disabled = used <= 0;
  // 狩獵紀錄：每種野獸（與三隻菁英）擊敗過幾頭、是否已經首次擊敗（第一次擊敗有額外經驗；規則在 core.js，這裡只講結果）
  const hb = $('hunt'), list = Object.keys(MON).map(t => [MON[t].name, P.kc[t] || 0, false]); for (const v of mons) if (v.elite) list.push([v.name, P.kc[v.drop || 'e' + v.id] || 0, true]);
  hb.textContent = ''; for (const [name, n, elite] of list) { const r = el('div', 'hrow' + (n ? '' : ' new')); r.append(el('b', elite ? 'el' : '', name), el('span', '', n ? `${n} ${elite ? '次' : '頭'}` : '—'), el('small', n ? 'ok' : '', n ? '✓ 已首次擊敗' : '還沒擊敗')); hb.appendChild(r); }
}

/* ---------- 背包 ---------- */
let selItem = null;
function renderBag() {
  if (!isOpen('bag')) return;
  $('goldN').textContent = P.gold;
  const grid = $('grid'); grid.textContent = ''; const ids = Object.keys(ITEMS).filter(id => P.inv[id] > 0); if (selItem && !ids.includes(selItem)) selItem = null;
  for (let i = 0, n = Math.max(25, Math.ceil(ids.length / 5) * 5); i < n; i++) {      // 0.6：東西變多，格子不夠就往下加（可以捲動）
    const id = ids[i], c = document.createElement('button'); c.className = 'cell' + (id && id === selItem ? ' sel' : ''); c.disabled = !id;
    if (id) { const it = ITEMS[id], n = document.createElement('em'); n.textContent = P.inv[id]; c.append(ic(id), n); c.title = it.name; c.onclick = () => { selItem = id; Sfx.play('click'); renderBag(); }; }
    grid.appendChild(c);
  }
  const info = $('itemInfo'); info.textContent = '';
  if (!selItem) { info.textContent = ids.length ? '點選道具查看說明。' : '背包是空的。擊敗野獸會掉落素材與獸肉。'; return; }
  const it = ITEMS[selItem], b = document.createElement('b'); b.textContent = `${it.name}　×${P.inv[selItem]}`; info.append(b, document.createTextNode(it.desc));
  if (it.heal || it.regen || (USE[selItem] && USE[selItem].act) || it.kind === 'recipe' || it.kind === 'cloak' || it.passive) { const u = document.createElement('button'); u.textContent = it.kind === 'cloak' ? (P.cloak === selItem ? '收起來' : '披上') : it.kind === 'recipe' || it.passive ? '學習' : it.kind === 'food' || it.kind === 'ration' ? '吃' : '使用'; u.style.display = 'block'; u.onclick = () => { useItem(selItem); renderBag(); }; info.appendChild(u); }
  if (it.orb) { const S = SKILLS[it.orb], known = P.skills.includes(it.orb), r = document.createElement('div'); r.className = 'reqline'; r.append('學習門檻：', ...reqSpans(S.req)); const u = document.createElement('button'); u.textContent = known ? '已經學會' : '學習'; u.disabled = known || !meetsReq(S.req, P.stats); u.style.display = 'block'; u.onclick = () => { learnOrb(it.orb); renderBag(); }; info.append(r, u); }
}

/* ---------- 技能與天賦球、招式表 ---------- */
const reqSpans = req => Object.keys(req).map((k, i) => { const sp = document.createElement('span'); sp.className = P.stats[k] >= req[k] ? 'ok' : 'no'; sp.textContent = (i ? '、' : '') + STATS[k].name + ' ' + req[k] + (P.stats[k] >= req[k] ? '' : `（目前 ${P.stats[k]}）`); return sp; });
const costText = S => `魔力 ${S.cost.mp}　冷卻 ${S.cd} 秒`;
function skillCard(S, right, orb) {
  const r = document.createElement('div'), g = orb ? ic('orb_' + S.id) : skIc(S), t = document.createElement('div'), fit = skillFits(S, setOf(me.avatar)); r.className = 'skrow' + (S.rare ? ' rare' : '') + (fit ? '' : ' unfit'); t.className = 'txt';
  const b = document.createElement('b'); b.textContent = S.name; const tag = document.createElement('i'); tag.textContent = (S.rare ? '稀有　' : S.basic ? '基礎　' : '') + S.kind + '　' + costText(S); b.appendChild(tag);
  if (S.wp) { const w = document.createElement('em'); w.className = 'wp' + (fit ? '' : ' no'); w.textContent = '限' + FAM_NAME[S.wp]; b.appendChild(w); }
  const d = document.createElement('small'); d.textContent = S.desc; t.append(b, d); r.append(g, t, ...right); return r;
}
let skTab = 'skill';
// 招式的特性（招式表右邊那一欄）
function moveNote(A) {
  const n = []; if (A.hits && A.hits.length > 1) n.push(A.hits.length + ' 段'); if (A.twice) n.push('雙手各一下'); if (A.fan) n.push(A.fan[0] + ' 發扇形'); if (A.nova) n.push('以自己為中心'); else if (A.arc >= 3) n.push('掃一整圈');
  if (A.lunge && !A.arrow && !A.bolt) n.push('突進'); if (A.hop) n.push('躍起'); if (A.pierce) n.push('貫穿'); if (A.boom) n.push('命中後爆開'); if (A.wave) n.push(A.waveAt ? '蓄滿時震裂地面' : '落地震波');
  if (A.push) n.push('打斷並推開'); else if (A.heavy || A.stag) n.push('能打斷'); if (A.crit) n.push('容易暴擊'); if (A.behind) n.push('從背後打更痛'); return n.join('、');
}
function renderMoves() {
  const set = setOf(me.avatar), M = MOVESET[set], L = keyOf('attack'), H = keyOf('heavy'), box = $('skMoves'); box.textContent = '';
  const kb = t => `<kbd>${t}</kbd>`, row = (keys, A, extra) => { const r = el('div', 'mvrow'), k = el('span', 'keys'), nm = el('b', '', A.name), nt = el('small', '', [extra, moveNote(A)].filter(Boolean).join('　')); k.innerHTML = keys; r.append(k, nm, nt); box.appendChild(r); };
  $('skMoveHead').textContent = `目前的武器：${M.name}　${M.note}`;
  { const r = el('div', 'mvrow'), k = el('span', 'keys'), nm = el('b', 'sm', [...new Set(M.light.map(a => a.name))].join('・')), nt = el('small', '', '輕攻擊連段' + (M.light[M.light.length - 1].twice ? '，最後一下雙手齊出' : M.light[M.light.length - 1].heavy ? '，最後一下能打斷' : '')); k.innerHTML = kb(L) + ' 連按 ' + M.light.length + ' 下'; r.append(k, nm, nt); box.appendChild(r); }
  row(kb(L) + ' ' + kb(H), (!WEAPONS[me.avatar.look.wp].show.some(n => /Shield/.test(n)) && M.a2) || M.a, '輕攻擊一下後接');
  row(kb(L) + ' ' + kb(L) + ' ' + kb(H), M.b, '輕攻擊兩下以上後接');
  row('按住 ' + kb(H), M.heavy, `放開出招，輕點是不蓄力的版本；按住 ${L} 也能蓄`);
  row(kb(keyOf('sprint')) + '＋' + kb(L), M.sprint, '衝刺中');
  row(kb(keyOf('dodge')) + ' → ' + kb(L), M.dodge, '翻滾或快閃一結束');
  row(kb(keyOf('dodge')) + ' → ' + kb(L), M.back, '後撤步一結束');
}
function renderSkills() {
  $('skillDot').hidden = !(P.gift || Object.keys(P.inv).some(id => ITEMS[id] && ITEMS[id].orb && !P.skills.includes(ITEMS[id].orb) && meetsReq(SKILLS[ITEMS[id].orb].req, P.stats)));
  if (!isOpen('skill')) return;
  for (const b of $('skTabs').children) b.classList.toggle('on', b.dataset.t === skTab); $('skPageSkill').hidden = skTab !== 'skill'; $('skPageMove').hidden = skTab !== 'move';
  const gift = $('skGift'), known = $('skKnown'), orbs = $('skOrbs'), basic = $('skBasic'); gift.textContent = ''; known.textContent = ''; orbs.textContent = ''; basic.textContent = ''; $('skGiftWrap').hidden = !P.gift;
  { const bar = $('skBar'); bar.textContent = ''; bar.appendChild(el('small', '', '技能欄：戰鬥中按這四個鍵施放。點一下拿下來；下面每個技能右邊的四顆按鍵是「放到哪一格」。'));      // 目前裝了哪四個：一眼看得到
    for (let i = 0; i < 4; i++) { const id = P.slots[i], S = SKILLS[id], b = el('button', 'sb' + (S ? '' : ' empty')); b.append(el('kbd', '', keyOf('skill' + (i + 1)))); if (S) b.append(skIc(S), el('span', '', S.name), el('i', '', '×')); else b.append(el('span', '', '空的')); b.disabled = !S; b.title = S ? `${S.name}：點一下從技能欄拿下來` : '空的：在下面的清單點技能右邊的按鍵，放進這一格'; b.onclick = () => { equipSkill(null, i); Sfx.play('click'); renderSkills(); }; bar.appendChild(b); } }
  if (P.gift) for (const id of P.gift) { const S = SKILLS[id], b = document.createElement('button'); b.textContent = '選這顆'; b.onclick = () => { pickGift(id); Sfx.play('quest', 'gift'); renderSkills(); }; const row = skillCard(S, [b], true), r = document.createElement('div'); r.className = 'reqline'; r.append('學習門檻：', ...reqSpans(S.req)); row.querySelector('.txt').appendChild(r); gift.appendChild(row); }
  for (const id of P.skills) { const S = SKILLS[id], seg = document.createElement('div'); seg.className = 'slotseg'; for (let i = 0; i < 4; i++) { const b = document.createElement('button'); b.textContent = keyOf('skill' + (i + 1)); b.title = `放到技能欄第 ${i + 1} 格`; if (P.slots[i] === id) b.className = 'on'; b.onclick = () => { equipSkill(P.slots[i] === id ? null : id, i); Sfx.play('click'); renderSkills(); }; seg.appendChild(b); } const row = skillCard(S, [seg]); if (P.slots.includes(id)) row.classList.add('eq'); known.appendChild(row); }
  if (!P.skills.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '還沒有學會任何技能。升到 2 級就會領悟第一批基礎技能；天賦球則來自任務獎勵、菁英野獸，以及一般野獸極少數的掉落。'; known.appendChild(p); }
  const later = BASIC_SKILLS.filter(id => !P.skills.includes(id)); $('skBasicWrap').hidden = !later.length;
  for (const id of later) { const S = SKILLS[id], lv = el('span', 'lvreq', `等級 ${S.lv} 領悟`); basic.appendChild(skillCard(S, [lv])); }
  const ids = Object.keys(ITEMS).filter(id => ITEMS[id].orb && P.inv[id] > 0);
  for (const id of ids) { const S = SKILLS[ITEMS[id].orb], kn = P.skills.includes(S.id), b = document.createElement('button'); b.textContent = kn ? '已學會' : '學習'; b.disabled = kn || !meetsReq(S.req, P.stats); b.onclick = () => { learnOrb(S.id); renderSkills(); }; const row = skillCard(S, [b], true), r = document.createElement('div'); r.className = 'reqline'; r.append(`持有 ${P.inv[id]} 顆　學習門檻：`, ...reqSpans(S.req)); row.querySelector('.txt').appendChild(r); orbs.appendChild(row); }
  if (!ids.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '背包裡沒有天賦球。'; orbs.appendChild(p); }
  renderMoves();
  $('skGuide').innerHTML = `<li><b>輕攻擊與重攻擊</b>　<kbd>${keyOf('attack')}</kbd> 輕攻擊可以連按成連段；<kbd>${keyOf('heavy')}</kbd> 重攻擊按住能蓄力。連段打到一半改按重攻擊，會接出不同的收尾招。</li><li><b>鎖定</b>　<kbd>${keyOf('lock')}</kbd> 或 <kbd>${keyOf('lock2')}</kbd> 鎖定準心附近的野獸，再按一次解除。鎖定中鏡頭跟著目標，移動變成繞著牠走；<kbd>${keyOf('lockNext')}</kbd> 或滾輪換目標。目標倒下時，旁邊還有正在攻擊你的野獸會自動改鎖牠。</li><li><b>閃避</b>　<kbd>${keyOf('dodge')}</kbd>。沒鎖定：朝按著的方向${DODGES.roll.name}；鎖定中：朝按著的方向${DODGES.step.name}一小步（省體力、面向不變）；不按方向一律是${DODGES.back.name}。在攻擊命中的瞬間閃開是完美閃避，下一擊必定暴擊。</li><li><b>衝刺</b>　按住 <kbd>${keyOf('sprint')}</kbd> 跑得更快，會持續消耗體力；衝刺中按攻擊是衝刺攻擊。</li><li><b>格擋</b>　按住 <kbd>${keyOf('guard')}</kbd>，正面的傷害大幅減少但消耗體力；衝撞、拍地、飛撲這類重擊擋不住。在命中前一瞬間才舉起是精準格擋。</li><li><b>體力與魔力</b>　攻擊、閃避、格擋、衝刺用體力（黃）；技能只用魔力（藍）。魔力會慢慢回復，普通攻擊打中也會回一點。</li><li><b>預警</b>　野獸出招前地上會出現紅色範圍，填滿的那一刻命中：長條是衝撞與撲咬，扇形是揮爪，圓形是拍地與飛撲的落點。黃色圓圈是棕熊的地盤。</li>`;
}

/* ---------- 雜貨商 ---------- */
function shopRow(id, right) { const it = ITEMS[id], r = document.createElement('div'), g = ic(id), t = document.createElement('div'); r.className = 'srow'; t.className = 'txt'; const b = document.createElement('b'); b.textContent = it.name + (P.inv[id] ? `　×${P.inv[id]}` : ''); const d = document.createElement('small'); d.textContent = it.desc; t.append(b, d); r.append(g, t, ...right); return r; }
const btn = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => { fn(); renderShop(); }; return b; };
function renderShop() {
  if (!isOpen('shop')) return;
  $('shopGold').textContent = P.gold;
  const bb = $('shopBuy'), sb = $('shopSell'); bb.textContent = ''; sb.textContent = '';
  for (const id of SHOP.merchant) { const it = ITEMS[id], own = (it.once && P.inv[id] > 0) || (it.teach && Craft.knows(it.teach)), b = btn(own ? (it.teach ? '已經學會' : '已經有了') : `購買　${it.buy} 金`, () => buy(id)); b.disabled = own || P.gold < it.buy; if (!own && b.disabled) b.title = '金幣不夠'; bb.appendChild(shopRow(id, [b])); }      // 0.6：賣什麼看 data06.js 的 SHOP；礦鎬買一次就夠、食譜學會就不再賣
  const ids = Object.keys(ITEMS).filter(id => ITEMS[id].sell && P.inv[id] > 0 && !ITEMS[id].buy);
  for (const id of ids) sb.appendChild(shopRow(id, [btn(`賣 1　+${ITEMS[id].sell}`, () => sell(id, false)), btn(`全賣　+${ITEMS[id].sell * P.inv[id]}`, () => sell(id, true))]));
  if (!ids.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '背包裡沒有可以賣的素材。擊敗野獸會掉落毛皮、獠牙與獸肉。'; sb.appendChild(p); }
  { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '採集來的東西和料理，商店不收。'; sb.appendChild(p); }
}

/* ---------- 任務日誌與追蹤欄 ---------- */
const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q])), ACT_NAME = Object.fromEntries(ACTIONS.map(a => [a[0], a[1]]));
let qTab = 'active', qSel = null, hints = [];
const rbadge = r => { const R = RATINGS[r] || RATINGS[0], i = el('i', 'rb', R.name); i.style.background = R.color; i.style.color = R.ink; return i; };
const giverText = q => NPCS[q.giver].title + ' ' + NPCS[q.giver].name;
const hintText = o => o.hint.zone ? ZONES[o.hint.zone].name : '地圖上的虛線圈一帶';
function questLists() {
  const L = { active: [], open: [], done: [] };
  for (const q of QUESTS) { const s = qStatus(q); if (s === 'active' || s === 'ready') L.active.push(q); else if (s === 'open' && q.type !== 'hidden') L.open.push(q); else if (s === 'done') L.done.push(q); }
  L.active.sort((a, b) => (qStatus(b) === 'ready') - (qStatus(a) === 'ready')); return L;
}
function rewardRow(q, done) {
  const R = q.rewards, box = el('div', 'qrew'), add = (icon, text) => { const s = el('span'); if (icon) s.appendChild(ic(icon, 'bare')); s.append(text); box.appendChild(s); };
  add(null, `經驗 ${R.exp}`); if (R.gold) add('gold', `${R.gold} 金幣`); for (const id in R.items) add(id, `${ITEMS[id].name} ×${R.items[id]}`);
  const orbs = R.orbChoice || []; if (orbs.length === 1) add('orb_' + orbs[0], ITEMS['orb_' + orbs[0]].name); else if (orbs.length > 1) add('orb_' + orbs[0], `天賦球 ${orbs.length} 選 1（${orbs.map(o => SKILLS[o].name).join('、')}）`);
  // 0.6：配方。teach＝接下任務就教（回報結果的卡片上不再寫）；rewards.recipes＝回報時學會（接下就教過的不重複列）
  const rn = id => ITEMS[id].name, T = done ? [] : (q.teach || []).filter(id => RECIPES[id] && ITEMS[id]), RC = (R.recipes || []).filter(id => RECIPES[id] && ITEMS[id] && !(q.teach || []).includes(id));
  if (T.length) add('recipe', '接下就教：' + T.map(rn).join('、')); if (RC.length) add('recipe', '配方：' + RC.map(rn).join('、'));
  return box;
}
// live：顯示目前進度（還沒接的任務只列出目標）
function objList(q, live) {
  const ul = el('ul', 'qobj'), rows = q.objectives.map((o, i) => { const [n, m] = objProg(q, i); return { o, n, m, ok: live && n >= m }; });
  // 指引：同一個區域只寫一次。還沒完成的目標都指向同一區就寫在清單最後一行；不只一區時寫在第一個用到它的目標下面
  const hs = q.type === 'hidden' ? [] : [...new Set(rows.filter(r => r.o.hint && !r.ok).map(r => hintText(r.o)))], used = new Set();
  for (const { o, n, m, ok } of rows) {
    const li = el('li', ok ? 'ok' : ''), sp = el('span', '', o.label), notes = [];
    if (o.cond && LORE.conds[o.cond]) notes.push('條件：' + LORE.conds[o.cond].label);
    if (hs.length > 1 && o.hint && !ok && !used.has(hintText(o))) { used.add(hintText(o)); notes.push('指引：' + hintText(o)); }
    if (notes.length) sp.appendChild(el('small', '', notes.join('　'))); li.append(el('i', '', ok ? '✓' : ''), sp); if (live && (m > 1 || o.kind === 'collect')) li.appendChild(el('em', '', `${n} / ${m}`)); ul.appendChild(li);
  }
  if (hs.length === 1) ul.appendChild(el('li', 'hint', '指引：' + hs[0]));
  return ul;
}
// 會用到的操作（任務日誌與接任務的卡片共用）
function keysRow(q) { if (!q.keys || !q.keys.length) return null; const p = el('p', 'qkeys', '會用到的操作：'); q.keys.forEach(k => { if (ACT_NAME[k]) p.append(el('kbd', '', keyOf(k)), ACT_NAME[k] + '　'); }); return p; }
function renderQuests() {
  const L = questLists(); $('questDot').hidden = !(L.active.some(q => qStatus(q) === 'ready') || UB7.anyReady());
  if (!isOpen('quest')) return;
  const TAB = { active: '進行中', open: '可接', done: '已完成' };
  for (const b of $('qTabs').children) { const t = b.dataset.t; if (t === 'board') { UB7.tabLabel(b, qTab === 'board'); continue; } b.classList.toggle('on', t === qTab); b.textContent = `${TAB[t]} ${L[t].length}`; }
  if (qTab === 'board') { UB7.renderLog($('qList'), $('qDetail')); return; }
  const list = L[qTab], box = $('qList'); box.textContent = ''; if (!list.some(q => q.id === qSel)) qSel = list.length ? list[0].id : null;
  for (const q of list) { const s = qStatus(q), b = el('button', 'qi' + (q.id === qSel ? ' on' : '') + (s === 'ready' ? ' ready' : '')); b.append(rbadge(q.rating), el('span', 'nm', q.name), el('small', '', s === 'ready' ? '可以回報' : `${QTYPES[q.type]}　建議等級 ${q.lv}` + (P.q.tr.includes(q.id) ? '　追蹤中' : ''))); b.onclick = () => { qSel = q.id; Sfx.play('click'); renderQuests(); }; box.appendChild(b); }
  if (!list.length) box.appendChild(el('p', 'empty', { active: '目前沒有進行中的任務。到「可接」看看誰有事找你。', open: '目前沒有新的任務。有些任務要先完成前一個才會出現；也有些不會寫在這裡，要靠打聽與探索。', done: '還沒有完成任何任務。' }[qTab]));
  const d = $('qDetail'), q = QBY[qSel]; d.textContent = ''; if (!q) { d.appendChild(el('p', 'empty', '選一個任務查看內容。')); return; }
  const s = qStatus(q), g = NPCS[q.giver], meta = el('div', 'qmeta'), h3 = t => el('h3', '', t);
  meta.append(el('i', 'qt ' + q.type, QTYPES[q.type]), rbadge(q.rating), el('span', P.lv < q.lv && s !== 'done' ? 'low' : '', `建議等級 ${q.lv}` + (P.lv < q.lv && s !== 'done' ? `（你現在 ${P.lv} 級）` : '')));
  if (s === 'done') { d.append(el('h4', '', q.name), meta); questStory(d, q, g); UI8.questDetail(d, q, s); return; } /* 0.8：已完成的懸賞也放縮小告示 */    /* 11/17 製作人：已完成的任務以故事為主（使用者要求：留存的是緣由） */
  d.append(el('h4', '', q.name), meta, el('p', 'qrate', `「${RATINGS[q.rating].name}」${LORE.ratings[q.rating].text}`), el('p', 'qdesc', q.desc), el('p', 'qgiver', `發任務的人：${g.title} ${g.name}（${g.spot.near}）`));
  if (s === 'ready') d.appendChild(el('p', 'qnote', `目標都完成了，回去找${g.name}回報。`)); else if (s === 'open') d.appendChild(el('p', 'qnote dim', `去找${g.name}談談，就能接下這個任務。`)); else if (s === 'done') d.appendChild(el('p', 'qnote dim', '這個任務已經完成。'));
  d.append(h3('目標'), objList(q, s !== 'open'));
  if (q.type === 'hidden') d.appendChild(el('p', 'qnote dim', '隱藏任務沒有指引。線索在城裡居民的傳聞裡。'));
  { const kr = s !== 'done' && keysRow(q); if (kr) d.appendChild(kr); }
  d.append(h3(s === 'done' ? '拿到的獎勵' : '獎勵'), rewardRow(q, s === 'done'));
  if (s === 'active' || s === 'ready') { const on = P.q.tr.includes(q.id), b = el('button', on ? 'on' : '', on ? '追蹤中（點一下取消）' : '在畫面左側追蹤'); b.id = 'qTrack'; b.onclick = () => { trackQuest(q.id, !on); Sfx.play('click'); renderQuests(); }; d.appendChild(b); } UI8.questDetail(d, q, s); /* 0.8：懸賞的縮小告示（ui08e） */
}
/* 已完成任務的故事頁：緣由（接任務時他說的）→ 途中（路上看到、聽到的）→ 結果（回報時他說的）→ 紀錄（目標、獎勵，縮小放最後） */
function questStory(d, q, g) {
  const T = q.text || {}, who = `${g.title} ${g.name}`;
  const lines = a => (Array.isArray(a) ? a : []).filter(x => typeof x === 'string' && x);
  const quote = (by, a) => { const b = el('div', 'qsay'); if (by) b.appendChild(el('b', '', by)); for (const t of a) b.appendChild(el('p', '', t)); return b; };
  const sec = (t, node) => { d.append(el('h3', 'qsh', t), node); };
  const off = lines(T.offer);
  if (off.length) sec('緣由', quote(who, off)); else d.appendChild(el('p', 'qdesc', q.desc));
  const mid = [];
  for (const o of q.objectives || []) { const a = lines(sayLines(o)); if (!a.length) continue; const n = o.kind === 'talk' && NPCS[o.target]; mid.push(quote(n ? `${n.title} ${n.name}` : '', a)); }
  if (mid.length) { const box = el('div', 'qmid'); mid.forEach(x => box.appendChild(x)); sec('途中', box); }
  const dn = lines(doneLines(q));      /* 0.8 X7：結果照當時聽到的（doneAlt／doneIf） */
  if (dn.length) sec('結果', quote(who, dn));
  const rec = el('div', 'qrec');
  rec.append(el('h3', '', '紀錄'), el('p', 'qgiver', `發任務的人：${who}（${g.spot.near}）`), el('p', 'qgiver', '當時的交代：' + q.desc), objList(q, true), el('p', 'qgiver', '拿到的獎勵：'), rewardRow(q, true));
  d.appendChild(rec);
}
function renderTracker() {
  const box = $('tracker'), ids = P.q.tr.filter(id => P.q.a[id]), L = questLists(); box.textContent = '';
  for (const id of ids) {
    const q = QBY[id], rd = qStatus(q) === 'ready', d = el('div', 'tq' + (rd ? ' ready' : '')), b = el('b'); b.append(rbadge(q.rating), q.name); d.appendChild(b);
    if (rd) d.appendChild(el('em', '', `回去找${giverText(q)}回報`));
    else { const used = new Set(); q.objectives.forEach((o, i) => { const [n, m] = objProg(q, i), sp = el('span', n >= m ? 'ok' : '', o.label + (m > 1 || o.kind === 'collect' ? `　${n} / ${m}` : '')); if (n < m && o.hint && q.type !== 'hidden' && o.hint.zone !== 'town' && !used.has(hintText(o))) { used.add(hintText(o)); sp.appendChild(el('small', '', hintText(o))); } d.appendChild(sp); }); }      // 同一個區域只寫一次
    box.appendChild(d);
  }
  // 下一個主線還沒接：提醒去找誰（只說大概在哪）
  const nx = L.open.find(q => q.type === 'main') || (!L.active.length ? L.open[0] : null);
  if (nx && ids.length < 3) { const g = NPCS[nx.giver], d = el('div', 'tq new'); d.append(el('b', '', nx.type === 'main' ? '新的主線任務' : '新的任務'), el('em', '', `找${g.title} ${g.name}談談`), el('em', '', g.spot.near)); box.appendChild(d); }
  box.hidden = !(UB7.tracker(box), box.children.length);
  // 指引：追蹤中任務還沒完成的目標（區域或大圈），以及可以回報的對象
  hints = []; const seen = new Set();
  for (const id of ids) {
    const q = QBY[id];
    if (qStatus(q) === 'ready') { const n = npcs.find(n => n.id === q.giver); if (n) hints.push({ q, npc: n }); continue; }
    q.objectives.forEach((o, i) => { const [n, m] = objProg(q, i), h = o.hint; if (n >= m || !h || q.type === 'hidden') return; const k = q.id + (h.zone || h.x + ',' + h.z); if (!seen.has(k)) { seen.add(k); hints.push({ q, h }); } });
  }
}

/* ---------- NPC 對話 ---------- */
// 開始交談後鏡頭看著對方（main.js 讀 input.talk）、移動與攻擊鎖住。版面：下方一條對白（最多兩行，一頁一頁播），左邊一欄放選項、任務卡與回報結果；
// 對方由鏡頭取景在對白條的正上方，所以介面不會蓋到他（dlgFrame 把版面量給鏡頭）
let dlg = null;
const dlgSeq = {}, seqLine = (list, key) => { const i = dlgSeq[key] || 0; dlgSeq[key] = i + 1; return list[i % list.length]; };
const pagesOf = list => list.map(t => ({ t }));
/* 0.8 X7（R6）：story08 的條件台詞。doneIf／sayIf＝{ 任務: [句子] }，做過那個任務就插在最後一頁之前；doneAlt＝q.alt 的事件在任務期間發生過（s11 栗子被打倒）就換成另一套；
   NPC 的 when＝[{ need, idle, rumors }]，條件成立才加進閒聊與傳聞（條件由 UI8.need8 判斷）。quest08 記下了 s11 的結局（debug08x.S.alt） */
let Q8 = null; import('./quest08.js').then(m => { Q8 = m; }).catch(() => {});
const ifPages = (a, map) => { a = Array.isArray(a) ? a.slice() : []; if (!map || !a.length) return a; for (const id in map) if (qDone(id) && Array.isArray(map[id])) a.splice(a.length - 1, 0, ...map[id]); return a; };
const altHit = q => !!(q.alt && Q8 && Q8.debug08x && Q8.debug08x.S && (q.alt === 'doChestnut:kill' ? Q8.debug08x.S.alt : false));
const doneLines = q => { const T = q.text || {}; return ifPages(altHit(q) && Array.isArray(T.doneAlt) && T.doneAlt.length ? T.doneAlt : T.done, T.doneIf); };
const sayLines = o => ifPages(o.say, o.sayIf);
const whenLines = (N, k) => { const out = []; for (const w of N.when || []) if (w && Array.isArray(w[k]) && UI8.need8 && UI8.need8(w.need)) out.push(...w[k]); return out; };
const talkList = (N, k) => (N[k] || []).concat(whenLines(N, k));
// 量版面給對話鏡頭：u＝對白條中心的水平位置、v＝對白條上緣的高度（佔視窗的比例）
function dlgFrame() { const r = $('dlgBox').getBoundingClientRect(); if (r.width) input.talkFrame = { u: clamp((r.left + r.right) / 2 / innerWidth, 0.3, 0.7), v: clamp(r.top / innerHeight, 0.6, 0.95) }; }
function startTalk(n) {
  const N = NPCS[n.id]; if (dlg || !N || !me.alive) return;
  freeCursor = true; closeAll(); freeCursor = false; releaseAll(); input.talk = n; unlock(); document.body.classList.add('talking'); ui.prompt('');
  dlg = { n, N, pages: [], i: 0, then: null, opts: [], t0: getClock(), gift: false, shop: false };
  $('dlgName').textContent = N.name; $('dlgTitle').textContent = N.title; $('dlgCard').hidden = true; $('dlgOpts').textContent = ''; $('dialog').hidden = false;
  const pages = []; for (const r of talkTo(n.id)) { if (r.note) pages.push({ t: r.note, note: 1 }); else if (r.pages) { const o = r.q && (r.q.objectives || []).find(x => x.say === r.pages); pages.push(...pagesOf(o && o.sayIf ? sayLines(o) : r.pages)); } }      /* 0.8：sayIf */
  if (pages.length) dlgPlay(pages, () => dlgMenu()); else dlgMenu(seqLine(N.greet, n.id + 'g'));
  dlgFrame();
}
function dlgText(t, note) { const e = $('dlgText'); e.textContent = t; e.classList.toggle('note', !!note); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; }
function dlgShow() { const p = dlg.pages[dlg.i]; dlgText(p.t, p.note); $('dlgOpts').textContent = ''; dlg.opts = []; $('dlgCard').hidden = true; $('dlgNext').textContent = (dlg.pages.length > 1 ? `${dlg.i + 1} / ${dlg.pages.length}　` : '') + `按 ${keyOf('interact')}、空白鍵或點一下繼續 ▼`; }
function dlgPlay(pages, then) { dlg.pages = pages; dlg.i = 0; dlg.then = then; dlgShow(); }
function dlgNext() { if (!dlg || dlg.shop || !dlg.pages.length) return; Sfx.play('page'); if (++dlg.i < dlg.pages.length) { dlgShow(); return; } const th = dlg.then; dlg.pages = []; dlg.then = null; if (th) th(); }
function dlgPick(i) { if (!dlg || dlg.shop || dlg.pages.length || !dlg.opts[i]) return; Sfx.play('click'); dlg.opts[i][2](); }
// 選項：[樣式, 文字, 動作, 評級（任務才有）]。row：並排（任務卡底下的接受／先不要），否則在左欄直排
function dlgOptions(opts, tip, row) {
  const box = $('dlgOpts'); box.textContent = ''; box.classList.toggle('row', !!row); dlg.opts = opts; dlg.pages = [];
  opts.forEach(([cls, text, , rating], i) => { const b = el('button', cls); b.append(el('kbd', '', String(i + 1))); if (rating != null) b.append(rbadge(rating)); b.append(el('span', '', text)); b.onclick = e => { e.stopPropagation(); dlgPick(i); }; box.appendChild(b); });
  $('dlgNext').textContent = tip || '按數字鍵或點選左邊的選項　Esc 離開';
}
function dlgMenu(line, note) {
  const { n, N } = dlg, A = [], B = [], C = []; $('dlgCard').hidden = true; if (line != null) dlgText(line, note);
  for (const q of QUESTS) { if (q.giver !== n.id) continue; const s = qStatus(q); if (s === 'ready') A.push(['go', `回報：${q.name}`, () => dlgTurnIn(q), q.rating]); else if (s === 'open') B.push(['q', `任務：${q.name}`, () => dlgOffer(q), q.rating]); else if (s === 'active') C.push(['', `進度：${q.name}`, () => dlgPlay(pagesOf(q.text.progress), () => dlgMenu()), q.rating]); }
  const opts = A.concat(B, C); if (n.id === 'merchant') opts.push(['', '買賣', dlgShop]);
  for (const [k, text, o] of SERVICES[n.id] || []) { if (o && o.need && QBY[o.need] && qStatus(o.need) !== 'done') continue; opts.push(['', text, () => service(k)]); }      // 0.6：料理、調藥、整備、披肩、歇一會……（data06.js 的 SERVICES）
  opts.push(...UI8.npcOptions(n.id).map(([t8, f8]) => ['', t8, f8]), ['', '閒聊', () => dlgMenu(seqLine(talkList(N, 'idle'), n.id + 'i'))]); /* 0.8：中間層登記的選項（巴索的「戰績簿」）放在閒聊前；when 條件句（X7） */ if (talkList(N, 'rumors').length) opts.push(['', '打聽消息', () => dlgMenu(seqLine(talkList(N, 'rumors'), n.id + 'r'))]); opts.push(['quiet', '離開', endTalk]);
  dlgOptions(opts);
}
// 左欄的卡片：任務內容（接之前）或回報結果
function dlgCard(q, done) {
  const c = $('dlgCard'), meta = el('div', 'qmeta'); c.textContent = ''; c.hidden = false; c.scrollTop = 0; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  if (done) { c.append(el('div', 'dcDone', '任務完成'), el('h4', '', q.name), rewardRow(q, true)); UI8.dlgCard(c, q, true); return; } /* 0.8：回報完成那張也給懸賞告示蓋「已除名」 */
  meta.append(el('i', 'qt ' + q.type, QTYPES[q.type]), rbadge(q.rating), el('span', P.lv < q.lv ? 'low' : '', `建議等級 ${q.lv}` + (P.lv < q.lv ? `（你現在 ${P.lv} 級）` : '')));
  c.append(meta, el('h4', '', q.name), el('p', 'dcDesc', q.desc), objList(q, false)); const kr = keysRow(q); if (kr) c.appendChild(kr); c.appendChild(rewardRow(q)); UI8.dlgCard(c, q, false); /* 0.8：懸賞告示（ui08e） */
}
function dlgOffer(q) {
  dlgPlay(pagesOf(q.text.offer), () => {
    dlgCard(q);
    dlgOptions([['go', '接受', () => { acceptQuest(q.id); dlgPlay(pagesOf(q.text.accept), () => dlgMenu()); }], ['quiet', '先不要', () => dlgMenu('（你搖了搖頭。這個任務之後還可以回來接。）', 1)]], '按 1 接受、2 先不要　Esc 離開', true);
  });
}
function dlgTurnIn(q) {
  dlgPlay(pagesOf(doneLines(q)), () => { const r = turnInQuest(q.id); if (!r) { dlgMenu(); return; } if (r.gift) dlg.gift = true; dlgMenu(`（完成任務「${q.name}」。` + (r.gift ? '離開對話後，在技能視窗挑一顆天賦球。' : '') + '）', 1); dlgCard(q, true); });
}
// 對話中開一個視窗（買賣、製作、整備、披肩）：對白條先收起來，關掉視窗回到對話
function dlgWin(k, open) { dlg.shop = k; $('dialog').hidden = true; if (open) open(); else setWin(k, true); }
const dlgShop = () => dlgWin('shop');
function service(k) {
  const { n, N } = dlg;
  if (k === 'board7') dlgWin('board7', () => B7.open());
  else if (k === 'brew' || k === 'cook') dlgWin('craft', () => UI6.openCraft(k, { npc: n }));
  else if (k === 'forge') dlgWin('forge', () => UI6.openForge());
  else if (k === 'cloak') dlgWin('cloak', () => UI6.openCloak());
  else if (k === 'rest') dlgMenu(Needs.tavernRest() ? '（你在爐邊的長椅上歇了一會，精神都回來了。）' : '（你現在精神很好，不用歇。）', 1);
  else if (k === 'stew') dlgMenu(Needs.tavernStew() ? '（熱騰騰的一碗下肚，吃得很飽。）' : P.gold < NEEDS.stewFee ? '（錢不夠。）' : '（你現在還很飽。）', 1);
  else if (k === 'teach') { const got = Craft.teach(n.id), rest = Craft.teachList(n.id); dlgMenu(got.length ? `（${N.name}教了你：${got.join('、')}。到${n.id === 'apothecary' ? '藥草架' : '大鍋或營火'}就能做。）` : rest.length ? '（' + rest.map(r => `「${r.name}」——${r.why}`).join('；') + '。）' : `（${N.name}會的，你都學會了。）`, 1); }
  else if (M7.service(k, { n, N, win: dlgWin, menu: dlgMenu })) { /* 0.7：芬恩的繪圖桌 */ }
  else if (k === 'trial') dlgMenu('（競技場場地裡的武器架上 12 種都能免費拿來打木靶，帶不出競技場。走進場地，打開角色面板的「武器架與狀態」分頁選一把。）', 1);
  else { const t = Fish.service(k, n.id); if (t) dlgMenu(t, 1); }      // 0.7：米洛收魚、哈根做釣竿（fish07.js）
}
function endTalk() {
  if (!dlg) return; const d = dlg; dlg = null; if (d.shop && isOpen(d.shop)) setWin(d.shop, false);
  input.talk = null; $('dialog').hidden = true; document.body.classList.remove('talking'); releaseAll(); ui.dirty = true;
  if (d.gift) { setWin('skill', true); toast('任務獎勵：在技能視窗挑一顆天賦球。'); } else lock();
}
// 旁白：抵達地點、發現線索、開場白。一句一句淡入，同時寫進左下角的紀錄
const narrQ = []; let narrT = 0, narrGap = 0;
function narrate(lines) { for (const t of lines) narrQ.push(t); }

/* ---------- 設定與診斷 ---------- */
const QN = { high: '高', medium: '中', low: '低' };
function renderSet() {
  for (const b of $('qSeg').children) b.classList.toggle('on', b.dataset.q === W.quality); for (const [id, k] of VOLS) { $(id).value = settings[k]; $(id + 'N').textContent = settings[k]; } $('diagBtn').firstChild.textContent = $('diag').hidden ? '顯示 ' : '隱藏 ';
  const C = input.cam; for (const b of $('viewSeg').children) b.classList.toggle('on', b.dataset.view === C.mode); $('sens').value = settings.sens; $('invY').checked = !!settings.invY;
  $('viewHint').textContent = C.mode === 'top' ? `俯視視角：滑鼠指向哪裡，角色就朝哪裡攻擊。按 ${keyOf('camera')} 可以切回背後視角。` : C.noLock ? '這個環境不能鎖定滑鼠：按住右鍵拖曳來轉動視角，跑動時鏡頭會慢慢轉回角色背後。' : `背後視角：點一下畫面後，移動滑鼠就能轉動視角。按住 ${keyOf('cursor')} 或開啟任何視窗會放開滑鼠；按 ${keyOf('camera')} 切換成俯視視角。`;
  renderKeys();
}
/* ---------- 按鍵設定 ---------- */
const KEY_SHOWN = new Set(['up', 'down', 'left', 'right', 'attack', 'heavy', 'guard', 'dodge', 'sprint', 'lock', 'lock2', 'lockNext', 'heal', 'skill1', 'skill2', 'skill3', 'skill4', 'interact', 'camera', 'cursor', 'char', 'bag', 'map', 'quest', 'skills', 'chat']);
let capture = null; const held = new Set();
function renderKeys() { const box = $('keyList'); box.textContent = ''; for (const [a, name] of ACTIONS) { if (!KEY_SHOWN.has(a)) continue; const sp = document.createElement('span'), b = document.createElement('button'); sp.textContent = name; b.textContent = keyOf(a); b.onclick = () => { capture = a; $('keyCap').hidden = false; $('keyCap').querySelector('b').textContent = name; Sfx.play('click'); }; box.append(sp, b); } }
function endCapture(code) { if (code) { if (RESERVED.has(code)) { toast('這個鍵保留給系統使用'); return; } rebind(capture, code); held.clear(); input.keys.clear(); input.atkHeld = false; input.heavyHeld = false; input.sprint = false; input.guard = false; Sfx.play('click'); } capture = null; $('keyCap').hidden = true; renderKeys(); keyHints(); }
function keyHints() { document.querySelectorAll('[data-key]').forEach(e => { e.textContent = keyOf(e.dataset.key); }); ui.dirty = true; $('chatIn').placeholder = `按 ${keyOf('chat')} 說話`; $('watchCase').title = `點一下開啟地圖（${keyOf('map')}）`; }
export function applyQuality(q, auto) { settings.q = q; if (!auto) saveSettings(); setQuality(q); renderSet(); }
// 聲音的狀態（發布後出問題時看這一行）：音檔載好幾個、音樂播哪一首、有沒有錯誤
function audioDiag() {
  const s = GA.stats(), sp = Object.values(s.sprites), e = s.stat.errors;
  if (s.state !== 'ready') return s.state === 'failed' ? '音效包載入失敗，使用合成音' + (e.length ? '（' + e[0] + '）' : '') : '載入中';
  return `${s.ctx === 'running' ? '播放中' : s.unlocked ? '暫停' : '等待第一次點擊'}　音效檔 ${sp.filter(x => x.st === 'ready').length}/${sp.length}　音樂 ${s.music.key || '—'}${s.music.blocked ? '（被瀏覽器擋下）' : ''}` + (e.length ? `　錯誤 ${e.length}：${e[e.length - 1]}` : '');
}
function diagRows() {
  const r = Net.rtts.length ? [...Net.rtts].sort((a, b) => a - b)[Net.rtts.length >> 1] : null;
  return [
    ['身分', Net.room ? (Net.guestSelf ? '受邀訪客' : '成員') : '單人（此環境沒有連線功能）'],
    ['連線', Net.fatal ? '中斷：' + Net.fatal : Net.room ? (Net.connected ? `已連線，同場 ${1 + remotes.size} 人${awayN() ? `（暫離 ${awayN()}）` : ''}` : '連線中') : '—'],
    ...(remotes.size ? [['其他玩家', [...remotes.values()].map(r => `${r.name || '玩家'}：${r.away ? '暫離，' : ''}${((r.age || 0) / 1000).toFixed(1)} 秒前`).join('　')]] : []),
    ['同步資料', `${presBytes()} 位元組${Net.errors ? `　送出失敗 ${Net.errors} 次（${Net.lastErr || '?'}）` : ''}`], ['顯示卡', gpuName()],
    ['怪物主控', Net.hostName], ['延遲', r != null ? Math.round(r) + ' ms' : '—'], ['同步頻率', Net.rxRate ? Net.rxRate.toFixed(1) + ' 次/秒' : '—'],
    ['存檔', Store.label()[0]], ['畫面', `${perf.fps} FPS　畫質${QN[W.quality]}`], ['視角', input.cam.mode === 'top' ? '俯視' : '背後視角，滑鼠' + (input.cam.locked ? '已鎖定' : input.cam.noLock ? '無法鎖定（右鍵拖曳）' : '未鎖定')], ['視窗', `${window.innerWidth}×${window.innerHeight}`],
    ['位置', `${Math.round(me.x)}, ${Math.round(me.z)}　${ZONES[me.zone].name}`], ['聲音', audioDiag()], ['版本', VERSION]
  ];
}
// 0.5d：F3 的診斷（暫離人數、自己送出的同步資料大小、顯示卡）
const awayN = () => { let n = 0; for (const r of remotes.values()) if (r.away) n++; return n; };
const presBytes = () => { let n = 2; for (const k in Net.sent) if (Net.sent[k] !== 'null') n += k.length + Net.sent[k].length + 4; return n; };
let gpuCache = null;
export function gpuName() { if (gpuCache) return gpuCache; try { const gl = W.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpuCache = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 90); } catch (e) { gpuCache = '不明'; } return gpuCache; }
export const softGpu = () => /swiftshader|llvmpipe|software|basic render|softpipe/i.test(gpuName());
function renderDiag() { const dl = $('diagList'); dl.textContent = ''; for (const [k, v] of diagRows()) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; if (k === '存檔') dd.className = Store.label()[1]; dl.append(dt, dd); } }
function toggleDiag() { $('diag').hidden = !$('diag').hidden; if (!$('diag').hidden) renderDiag(); renderSet(); }

/* ============================== 懷錶式羅盤與大地圖 ============================== */
const N1 = WORLD.GRID + 1, SIZE = WORLD.SIZE, CELL = SIZE / WORLD.GRID, EX = WORLD.FOG, EXS = WORLD.FOG_SIZE;      // 迷霧格網：EX 格、涵蓋 EXS 公尺（比地形略小，置中）
let fogVer = 0, baseCv = null, fogCv = null, fogCtx = null, miniCtx = null, bigCtx = null;
function buildMaps() {
  baseCv = document.createElement('canvas'); baseCv.width = baseCv.height = N1; const cx = baseCv.getContext('2d'), id = cx.createImageData(N1, N1);
  for (let i = 0; i < N1 * N1; i++) { id.data[i * 4] = mapRGB[i * 3]; id.data[i * 4 + 1] = mapRGB[i * 3 + 1]; id.data[i * 4 + 2] = mapRGB[i * 3 + 2]; id.data[i * 4 + 3] = 255; }
  cx.putImageData(id, 0, 0);
  fogCv = document.createElement('canvas'); fogCv.width = fogCv.height = EX; fogCtx = fogCv.getContext('2d');
  miniCtx = $('mini').getContext('2d'); bigCtx = $('bigMap').getContext('2d'); bigMapCtl();
  // 錶面刻度
  const svg = $('watchTicks'), NS = 'http://www.w3.org/2000/svg'; let h = '';
  for (let i = 0; i < 60; i++) { if (i % 15 === 0) continue; const a = i / 60 * TAU, major = i % 5 === 0, r0 = major ? 79.5 : 83.5, r1 = 87; h += `<line x1="${98 + Math.sin(a) * r0}" y1="${98 - Math.cos(a) * r0}" x2="${98 + Math.sin(a) * r1}" y2="${98 - Math.cos(a) * r1}" stroke="${major ? '#f0d79a' : '#8a7a54'}" stroke-width="${major ? 1.6 : 0.9}"/>`; }
  [['北', 0], ['東', 1], ['南', 2], ['西', 3]].forEach(([t, i]) => { const a = i / 4 * TAU; h += `<text x="${98 + Math.sin(a) * 82.5}" y="${98 - Math.cos(a) * 82.5 + 3.6}" text-anchor="middle" font-size="10" font-weight="700" fill="${i === 0 ? '#f2a24a' : '#f0d79a'}" font-family="Noto Serif TC,serif">${t}</text>`; });
  svg.innerHTML = h; void NS;
}
/* 0.8 X7：大地圖的縮放鈕、滾輪、拖曳。拖曳超過 4 像素才算拖（點一下照舊顯示地名說明） */
function bigMapCtl() {
  const cv = $('bigMap'); if (!cv || $('mapZoom8')) return; const box = el('div'); box.id = 'mapZoom8';
  for (const [k, t, tt] of [['fit', '全圖', '照你走過的範圍裁切'], ['me', '我附近', '放大到你附近'], ['in', '＋', '放大（滾輪也可以）'], ['out', '－', '縮小']]) { const b = el('button', '', t); b.dataset.z = k; b.title = tt; b.onclick = e => { e.stopPropagation(); Sfx.play('click'); if (k === 'fit') mapView(); else if (k === 'me') mapView(me.x, me.z, 300); else zoomMap(k === 'in' ? 0.7 : 1 / 0.7); }; box.appendChild(b); }
  cv.parentElement.appendChild(box);
  const cpos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height, r.width / cv.width]; };
  cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = cpos(e); zoomMap(e.deltaY > 0 ? 1.18 : 1 / 1.18, x, y); }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; const v = curView(); drag = { x: e.clientX, y: e.clientY, cx: v.cx, cz: v.cz, span: v.span, k: cpos(e)[2], moved: false }; });
  window.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; cv.style.cursor = 'grabbing'; const m = drag.span / 900 / drag.k; mapView(drag.cx - dx * m, drag.cz - dy * m, drag.span); });
  window.addEventListener('pointerup', () => { if (drag && drag.moved) { cv.style.cursor = ''; cv.dataset.dragged = '1'; setTimeout(() => { delete cv.dataset.dragged; }, 0); } drag = null; });
}
function drawFog() { const id = fogCtx.createImageData(EX, EX), ex = P.explored; for (let i = 0; i < EX * EX; i++) { id.data[i * 4] = 16; id.data[i * 4 + 1] = 18; id.data[i * 4 + 2] = 13; id.data[i * 4 + 3] = ex[i] || M7.ink(i) ? 0 : 255; } fogCtx.putImageData(id, 0, 0); me.exploredDirty = false; M7.fogDone(); fogVer++; }
const explored = (x, z) => { const gx = Math.floor((x + EXS / 2) / EXS * EX), gz = Math.floor((z + EXS / 2) / EXS * EX); return gx >= 0 && gz >= 0 && gx < EX && gz < EX && (P.explored[gz * EX + gx] === 1 || M7.copyAt(x, z)); };
function mapLayer(cx, ox, oz, s) {      // ox, oz：世界原點在畫布上的位置；s：每公尺像素
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(baseCv, ox - (SIZE / 2 + CELL / 2) * s, oz - (SIZE / 2 + CELL / 2) * s, N1 * CELL * s, N1 * CELL * s);
  M7.inkLayer(cx, ox, oz, s);      // 0.7：別人送的手繪地圖（抄本）畫成褐墨
  cx.drawImage(fogCv, ox - EXS / 2 * s, oz - EXS / 2 * s, EXS * s, EXS * s);
}
const pCol = r => (allyOf(r) ? '#8fe38a' : r.ol ? '#ff5a4a' : '#7fc4ff');      // 0.6：其他玩家的點——隊友綠、通緝犯紅、其他藍
const dot = (cx, x, y, r, col, ring) => { cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fillStyle = col; cx.fill(); if (ring) { cx.lineWidth = ring; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.stroke(); } };
function arrow(cx, x, y, f, r) { cx.beginPath(); cx.moveTo(x + Math.sin(f) * r * 1.25, y + Math.cos(f) * r * 1.25); cx.lineTo(x + Math.sin(f + 2.5) * r, y + Math.cos(f + 2.5) * r); cx.lineTo(x - Math.sin(f) * r * 0.3, y - Math.cos(f) * r * 0.3); cx.lineTo(x + Math.sin(f - 2.5) * r, y + Math.cos(f - 2.5) * r); cx.closePath(); cx.fillStyle = '#f2a24a'; cx.fill(); cx.lineWidth = r * 0.22; cx.strokeStyle = '#241a0c'; cx.stroke(); }
function drawMini() {
  if (me.exploredDirty) drawFog();
  const cx = miniCtx, R = 150, range = 54, s = R / range, ox = R - me.x * s, oz = R - me.z * s;
  cx.save(); cx.clearRect(0, 0, 300, 300); cx.beginPath(); cx.arc(R, R, R, 0, TAU); cx.clip(); cx.fillStyle = '#10120d'; cx.fillRect(0, 0, 300, 300);
  mapLayer(cx, ox, oz, s); M7.marks(cx, ox, oz, s, 1);      // 0.7：採集片、陷阱 ✕
  // 城牆輪廓
  cx.beginPath(); cx.arc(ox, oz, WORLD.TOWN_R * s, 0, TAU); cx.lineWidth = 3; cx.strokeStyle = 'rgba(240,215,154,.75)'; cx.stroke();
  for (const H of hints) if (H.h && H.h.r) hintCircle(cx, ox + H.h.x * s, oz + H.h.z * s, H.h.r * s, 4.5);
  for (const n of npcs) if (explored(n.x, n.z)) npcDot(cx, ox + n.x * s, oz + n.z * s, n, 4.2, 8.5, 13);
  for (const v of mons) { if (v.st === MST.DEAD) continue; const dx = v.x - me.x, dz = v.z - me.z; if (dx * dx + dz * dz > 52 * 52) continue; const calm = MON[v.type].temper === 'timid' || (MON[v.type].temper === 'neutral' && v.st === MST.IDLE); dot(cx, ox + v.x * s, oz + v.z * s, v.elite ? 6.5 : calm ? 3 : 3.6, v.elite ? '#ff7b5a' : calm ? '#d8c690' : v.st === MST.IDLE || v.st === MST.WARN ? '#c9665a' : '#ff4d3a', v.elite ? 1.6 : 1); }
  if (P.bag) dot(cx, ox + P.bag.x * s, oz + P.bag.z * s, 5, '#ffd76a', 1.6);
  for (const r of remotes.values()) dot(cx, ox + r.x * s, oz + r.z * s, allyOf(r) ? 5.5 : 5, pCol(r), 1.6);
  if (input.cam.mode === 'tps') { const y = input.cam.yaw, a0 = Math.atan2(Math.cos(y), Math.sin(y)); cx.beginPath(); cx.moveTo(R, R); cx.arc(R, R, 46, a0 - 0.5, a0 + 0.5); cx.closePath(); cx.fillStyle = 'rgba(255,255,255,.13)'; cx.fill(); }
  arrow(cx, R, R, me.f, 11);
  // 邊緣指標：城鎮方向與遺落的金幣
  const edge = (x, z, col) => { const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz); if (d < range * 0.94) return; const ex = R + dx / d * (R - 9), ez = R + dz / d * (R - 9); dot(cx, ex, ez, 6, col, 1.6); };
  if (!me.inSafe) edge(0, 0, '#f0d79a'); if (P.bag) edge(P.bag.x, P.bag.z, '#ffd76a'); for (const r of remotes.values()) edge(r.x, r.z, pCol(r));
  // 任務的方向標（三角形）：只指向區域或大圈，不指向確切位置；可以回報時指向發任務的人
  const used = [], rim = (x, z, col) => { const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz); if (d < range * 0.9) return; const ang = Math.atan2(dx, dz); if (used.some(a => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < 0.3)) return; used.push(ang); const ux = dx / d, uz = dz / d, bx = R + ux * (R - 26), bz = R + uz * (R - 26); cx.beginPath(); cx.moveTo(bx + ux * 17, bz + uz * 17); cx.lineTo(bx - uz * 10, bz + ux * 10); cx.lineTo(bx + uz * 10, bz - ux * 10); cx.closePath(); cx.fillStyle = col; cx.fill(); cx.lineWidth = 2.4; cx.strokeStyle = '#241a0c'; cx.stroke(); };
  for (const H of hints) { if (H.npc) { if (explored(H.npc.x, H.npc.z)) rim(H.npc.x, H.npc.z, MARK_COL.turnin); } else if (H.h.zone) { if (me.zone !== H.h.zone) rim(ZONE_AT[H.h.zone][0], ZONE_AT[H.h.zone][1], '#f2a24a'); } else if (Math.hypot(H.h.x - me.x, H.h.z - me.z) > H.h.r) rim(H.h.x, H.h.z, '#f2a24a'); }
  cx.restore();
}
const QLAB = { town: [0, 24], meadow: [-56, 98], forest: [-176, -22], canyon: [150, -54], lair: [0, -166], bend: [-30, 222], oldwood: [-300, 2], quarry: [258, -36], wings: [124, -238] };      // 大地圖上任務名稱寫在哪（避開地名）；0.6 外環四區也有。沒列到的區域用 core.js 的 ZONE_AT
const MARK_COL = { offer: '#ffd76a', turnin: '#8fe38a', talk: '#bfe3ff' }, MARK_TXT = { offer: '!', turnin: '?', talk: '…' };
// NPC 的點；有任務標記時放大並寫上符號（只有隱藏任務可接的不標）
function npcDot(cx, x, y, n, r, R2, font) { const m = MARK_COL[n.mark]; if (!m) { dot(cx, x, y, r, '#e8c25c', 1.4); return; } dot(cx, x, y, R2, m, 2); cx.save(); cx.font = `900 ${font}px "Noto Serif TC",serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#1c140c'; cx.fillText(MARK_TXT[n.mark], x, y + (n.mark === 'talk' ? -font * 0.22 : 1)); cx.restore(); }
function hintCircle(cx, x, y, r, w) { cx.save(); cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fillStyle = 'rgba(242,162,74,.14)'; cx.fill(); cx.setLineDash([w * 3, w * 2.2]); cx.lineWidth = w + 2; cx.strokeStyle = 'rgba(0,0,0,.65)'; cx.stroke(); cx.lineWidth = w; cx.strokeStyle = '#ffb45c'; cx.stroke(); cx.restore(); }
// 整個區域的斜線遮罩（任務只給到「哪一區」時用）
const zoneMasks = {};
function zoneMask(zone) {
  if (zoneMasks[zone]) return zoneMasks[zone];
  const n = Math.round(180 * SIZE / 560), cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d'), id = c.createImageData(n, n), Z = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const wx = (x + 0.5) / n * SIZE - SIZE / 2, wz = (z + 0.5) / n * SIZE - SIZE / 2; Z[z * n + x] = (Math.hypot(wx, wz) < WORLD.R - 8 ? 1 : edgeAt(wx, wz) > 1) && zoneAt(wx, wz) === zone ? 1 : 0; }      /* 0.8 X7：舊世界照舊（R − 8），新地問可走邊界 edgeAt */
  for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) { const i = z * n + x; if (!Z[i]) continue; const edge = !(Z[i - 1] && Z[i + 1] && Z[i - n] && Z[i + n]); id.data[i * 4] = 242; id.data[i * 4 + 1] = 162; id.data[i * 4 + 2] = 74; id.data[i * 4 + 3] = edge ? 235 : (x + z) % 5 === 0 ? 120 : 34; }
  c.putImageData(id, 0, 0); return zoneMasks[zone] = cv;
}
// 地名：區域（大字，五個舊區＋0.6 外環四區）與地點（小字，標在實際位置旁）。都要走過（霧散開）才寫出來。菁英出沒的地方不標（使用者的決定：自己找）
const LABELS = [['鐵環城', 0, 0, 0, 'town'], ['風吹草原', 0, 150, 0, 'meadow'], ['低語森林', -160, 30, 0, 'forest'], ['斷牙峽谷', 150, -84, 0, 'canyon'], ['獸王巢穴', 0, -170, 0, 'lair'], ['河灣草場', -22, 252, 1, 'bend'], ['古木林', -286, 98, 1, 'oldwood'], ['採石場與鹽臺', 292, 22, 1, 'quarry'], ['獸欄兩翼', 0, -238, 1, 'wings']];
/* 0.8 X7：新地 13 區的區域名（第 4 欄 2＝新地，c07 不會提早揭開；第 5 欄是區域代號，滑過時的說明用 LORE.zones）。位置照 ZONE_AT，北境的名字去掉「北境・」、改用冷色字 */
/* ZONE_AT 常常就在營火或地標上（X0b 選的是走得到的點），區域大字會蓋到營火的字：離營火、地標 32 公尺內的就往北、南、西、東挪，挪到的點還要在同一區、走得到 */
const LABEL_FREE = (x, z) => !CAMPS.some(c => Math.hypot(c.x - x, c.z - z) < 32) && !Object.values(PLACES08).some(p => p && Math.hypot(p.x - x, p.z - z) < 26);
for (const k of ['southlake', 'edgewood', 'giantwood', 'marshwood', 'floodpen', 'backhill', 'orecliff', 'saltflat', 'redslope', 'frostwood', 'northrim', 'gatehigh', 'oldroad']) { if (!ZONES[k] || !ZONE_AT[k]) continue; const [x0, z0] = ZONE_AT[k];
  const at = [[0, 0], [0, -45], [0, 45], [-55, 0], [55, 0], [0, -80], [0, 80], [-40, -40], [40, -40], [-40, 40], [40, 40]].map(([dx, dz]) => [x0 + dx, z0 + dz]).find(([x, z]) => LABEL_FREE(x, z) && zoneAt(x, z) === k && edgeAt(x, z) > 4) || [x0, z0];
  LABELS.push([ZONES[k].name.replace(/^北境・/, ''), at[0], at[1], 2, k]); }
// 地點：story.js 的 PLACE_NOTES（20 個新地點＋幾個舊地標，每個一句說明）；沒有那張表時退回 places06.js 的 PLACES06。營火的位置以 places06.js 的 CAMPS 為準
// reveal：那個任務完成後，就算沒走過也標出地名（c07「四面的營火」）
const qDone = id => !!QBY[id] && qStatus(QBY[id]) === 'done';
let placeList = null, mapHits = [];
function mapPlaces() {
  if (placeList) return placeList; const NT = STORY.PLACE_NOTES || {}, src = Object.keys(NT).length ? NT : PLACES06, cid = {}, cpl = {};
  for (const c of CAMPS) { cid[c.id] = c; if (c.place) cpl[c.place] = c; }
  placeList = Object.keys(src).map(k => { const N = src[k], P6 = PLACES06[k] || {}, c = (N.camp && cid[N.camp]) || cpl[k]; return { t: N.name, note: N.note || N.desc || '', x: c ? c.x : N.x != null ? N.x : P6.x, z: c ? c.z : N.z != null ? N.z : P6.z, camp: c || null, reveal: N.reveal || null }; }).filter(p => p.x != null && p.z != null);
  for (const c of CAMPS) if (!placeList.some(p => p.camp === c)) placeList.push({ t: c.name, note: '', x: c.x, z: c.z, camp: c, reveal: null });
  for (const k in PLACES08) { const L = PLACES08[k]; if (!L || L.x == null) continue; const p = placeList.find(q => q.t === L.name); if (p) { if (!p.camp) p.lm = 1; continue; } if (cpl[k]) continue; placeList.push({ t: L.name, note: (NT[k] && NT[k].note) || L.desc || '', x: L.x, z: L.z, camp: null, reveal: null, lm: 1 }); }      /* 0.8 X7：新地的 30 處地標（劇情沒寫說明的用 places08 的一句），畫成立石記號 */
  return placeList;
}
// 營火的記號：一小團火
function flame(cx, x, y, r) { cx.beginPath(); cx.moveTo(x, y - r * 1.25); cx.bezierCurveTo(x + r * 0.95, y - r * 0.2, x + r * 0.9, y + r, x, y + r); cx.bezierCurveTo(x - r * 0.9, y + r, x - r * 0.95, y - r * 0.2, x, y - r * 1.25); cx.closePath(); cx.fillStyle = '#ff9a3c'; cx.fill(); cx.lineWidth = r * 0.32; cx.strokeStyle = '#1c140c'; cx.stroke(); cx.beginPath(); cx.arc(x, y + r * 0.35, r * 0.4, 0, TAU); cx.fillStyle = '#ffe08a'; cx.fill(); }
/* 0.8 X7：大地圖照世界外框裁切＋可以縮放平移。
   「全圖」＝走過（含抄本）的範圍外加一圈，最小是舊世界那一圈（0.7 的比例）、最大是世界外框（可走範圍的外接方框）；新地沒走過的人看到的和 0.7 一樣大，走得越遠圖才越大。
   滾輪縮放（以游標為中心）、拖曳平移；右上角三顆鈕：全圖、我附近、放大／縮小。BMV.span＝畫面涵蓋幾公尺，cx、cz＝畫面中心的世界座標 */
const FRAME = { x0: -604, x1: 596, z0: -602, z1: 556 }, FIT_MIN = 2 * (WORLD.R - 2), SPAN_MIN = 150;      /* 世界外框：可走範圍（edgeAt ≥ 0）的外接方框再加 6 公尺；FIT_MIN 696＝舊世界直徑（0.6 的地圖約 760 公尺寬） */
const BMV = { mode: 'fit', cx: 0, cz: 0, span: FIT_MIN, fit: null, fitT: -1 };
function fitView() {
  if (BMV.fit && BMV.fitT === fogVer) return BMV.fit;
  let x0 = -FIT_MIN / 2, x1 = FIT_MIN / 2, z0 = -FIT_MIN / 2, z1 = FIT_MIN / 2; const ex = P.explored, C = EXS / EX;
  for (let i = 0; i < EX * EX; i++) { if (!(ex[i] || M7.ink(i))) continue; const x = ((i % EX) + 0.5) * C - EXS / 2, z = (((i / EX) | 0) + 0.5) * C - EXS / 2; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  x0 = Math.max(FRAME.x0, x0 - 40); x1 = Math.min(FRAME.x1, x1 + 40); z0 = Math.max(FRAME.z0, z0 - 40); z1 = Math.min(FRAME.z1, z1 + 40);
  const span = Math.max(FIT_MIN, x1 - x0, z1 - z0); BMV.fitT = fogVer; return BMV.fit = clampView({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span });
}
function clampView(v) {      /* 不讓畫面跑出世界外框（外框比畫面小的那一邊置中） */
  const span = clamp(v.span, SPAN_MIN, Math.max(FRAME.x1 - FRAME.x0, FRAME.z1 - FRAME.z0)), h = span / 2, k = (a0, a1, c) => (a1 - a0 <= span ? (a0 + a1) / 2 : clamp(c, a0 + h, a1 - h));
  return { cx: k(FRAME.x0, FRAME.x1, v.cx), cz: k(FRAME.z0, FRAME.z1, v.cz), span };
}
function curView() { return BMV.mode === 'fit' ? fitView() : BMV; }
export function mapView(cx, cz, span) { if (cx == null) { BMV.mode = 'fit'; } else { Object.assign(BMV, clampView({ cx, cz, span: span || BMV.span }), { mode: 'free' }); } if (isOpen('map')) drawBigMap(); return curView(); }      /* 測試與按鈕用：mapView() 回全圖；mapView(x, z, 公尺) 看某一塊 */
function zoomMap(k, px, py) {      /* px、py：畫布座標（縮放時這一點不動）；沒給就以中心縮放 */
  const v = curView(), S = 900, s0 = S / v.span, wx = px == null ? v.cx : v.cx + (px - S / 2) / s0, wz = py == null ? v.cz : v.cz + (py - S / 2) / s0, span = v.span * k, s1 = S / clampView({ cx: 0, cz: 0, span }).span;
  mapView(wx - (px == null ? 0 : (px - S / 2) / s1), wz - (py == null ? 0 : (py - S / 2) / s1), span);
}
/* 地標（0.8 的 30 處：望門石、獵臺、石像列柱……）：一根立石＋小旗；釣點：一尾魚＋水波。都和營火一樣走過才畫 */
function landmark(cx, x, y, r) { cx.save(); cx.lineJoin = 'round'; cx.beginPath(); cx.moveTo(x - r * 0.55, y + r); cx.lineTo(x - r * 0.38, y - r * 0.55); cx.lineTo(x, y - r * 0.95); cx.lineTo(x + r * 0.38, y - r * 0.55); cx.lineTo(x + r * 0.55, y + r); cx.closePath(); cx.fillStyle = '#d9cfb8'; cx.fill(); cx.lineWidth = r * 0.3; cx.strokeStyle = '#1c140c'; cx.stroke(); cx.beginPath(); cx.moveTo(x - r * 0.2, y - r * 0.2); cx.lineTo(x + r * 0.22, y - r * 0.2); cx.moveTo(x - r * 0.25, y + r * 0.3); cx.lineTo(x + r * 0.28, y + r * 0.3); cx.lineWidth = r * 0.16; cx.strokeStyle = '#8a7a62'; cx.stroke(); cx.restore(); }
function fishMark(cx, x, y, r) { cx.save(); cx.beginPath(); cx.ellipse(x - r * 0.15, y, r * 0.78, r * 0.42, 0, 0, TAU); cx.moveTo(x + r * 0.55, y); cx.lineTo(x + r * 1.05, y - r * 0.45); cx.lineTo(x + r * 1.05, y + r * 0.45); cx.closePath(); cx.fillStyle = '#9fd3ef'; cx.fill(); cx.lineWidth = r * 0.28; cx.strokeStyle = '#1c140c'; cx.stroke(); cx.beginPath(); cx.arc(x - r * 0.55, y - r * 0.08, r * 0.12, 0, TAU); cx.fillStyle = '#1c140c'; cx.fill(); cx.beginPath(); cx.moveTo(x - r * 0.9, y + r * 0.85); cx.quadraticCurveTo(x - r * 0.3, y + r * 0.6, x + r * 0.2, y + r * 0.85); cx.quadraticCurveTo(x + r * 0.7, y + r * 1.1, x + r * 1.1, y + r * 0.85); cx.lineWidth = r * 0.2; cx.strokeStyle = '#d6efff'; cx.stroke(); cx.restore(); }
function drawBigMap() {
  if (me.exploredDirty) drawFog();
  const v = curView(), cx = bigCtx, S = 900, s = S / v.span, ox = S / 2 - v.cx * s, oz = S / 2 - v.cz * s; M7.deco.view = { ox, oz, s };
  cx.fillStyle = '#10120d'; cx.fillRect(0, 0, S, S); mapLayer(cx, ox, oz, s); M7.marks(cx, ox, oz, s, 0);      // 0.7：採集片、陷阱 ✕
  const zs = [...new Set(hints.filter(H => H.h && H.h.zone).map(H => H.h.zone))]; for (const z of zs) cx.drawImage(zoneMask(z), ox - SIZE / 2 * s, oz - SIZE / 2 * s, SIZE * s, SIZE * s);      // 任務區域：斜線
  cx.beginPath(); cx.arc(ox, oz, WORLD.TOWN_R * s, 0, TAU); cx.lineWidth = 2.5; cx.strokeStyle = 'rgba(240,215,154,.8)'; cx.stroke();
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  // 地名：先放區域名，再把地點名放在記號的右、左、上、下，和已經放好的字重疊就換一邊，四邊都放不下就不寫（營火的記號照畫）。每個字的範圍記在 mapHits，滑過或點一下顯示那個地方的一句說明
  const boxes = [], free = (x0, y0, x1, y1) => !boxes.some(b => x0 < b[2] && b[0] < x1 && y0 < b[3] && b[1] < y1), word = (t, x, y, font, col, lw) => { if (M7.deco.word && M7.deco.word(cx, t, x, y, font, lw, [ox, oz], s)) return; cx.font = font; cx.lineWidth = lw; cx.strokeStyle = 'rgba(0,0,0,.72)'; cx.strokeText(t, x, y); cx.fillStyle = col; cx.fillText(t, x, y); };
  const places = mapPlaces(), c07 = qDone('c07'), seen = p => explored(p.x, p.z) || (p.reveal && qDone(p.reveal)); mapHits = [];
  const zk = clamp(s / (900 / FIT_MIN), 0.82, 1.15);      /* 縮得比舊世界小時區域名的字也小一點 */
  for (const [t, x, z, outer, zk8] of LABELS) { const ring = ZONES[zk8] && ZONES[zk8].ring; if (!explored(x, z) && !(outer === 1 && c07)) continue; const X = ox + x * s, Y = oz + z * s - (t === '鐵環城' ? 84 * Math.min(1, s / (900 / FIT_MIN)) : 0); if (X < -60 || X > S + 60 || Y < -30 || Y > S + 30) continue; const px = Math.round((outer ? 22 : 24) * zk), f = `900 ${px}px "Noto Serif TC",serif`; cx.font = f; const w = cx.measureText(t).width, bx = [X - w / 2 - 4, Y - px * 0.62, X + w / 2 + 4, Y + px * 0.62]; boxes.push(bx); word(t, X, Y, f, ring === 'N' ? '#e4eef6' : outer ? '#efe2c4' : '#f4ecd9', 5);
    const same = places.find(p => p.t === t), lz = STORY.LORE && STORY.LORE.zones; mapHits.push({ b: bx, t, note: same ? same.note : (lz && lz[zk8]) || '', zone: 1 }); }
  for (const p of places) { if (!seen(p) || LABELS.some(l => l[0] === p.t)) continue; const X = ox + p.x * s, Y = oz + p.z * s; if (X < -20 || X > S + 20 || Y < -20 || Y > S + 20) continue; const f = '700 16px "Noto Sans TC",sans-serif'; cx.font = f; const w = cx.measureText(p.t).width, h = 18, mk = p.camp ? 8 : p.lm ? 6.5 : 4.5; let at = null;
    if (free(X - mk, Y - mk, X + mk, Y + mk) || p.camp) for (const [dx, dy] of [[mk + 4 + w / 2, 0], [-(mk + 4 + w / 2), 0], [0, -(mk + 3 + h / 2)], [0, mk + 3 + h / 2]]) { let b = [X + dx - w / 2 - 2, Y + dy - h / 2, X + dx + w / 2 + 2, Y + dy + h / 2]; /* ui-fin：標籤超出畫布邊緣（右上角的北關、門前空地、石像列柱）就整個往裡推；推完若壓到自己的記號就換下一邊 */ const sx = b[0] < 2 ? 2 - b[0] : b[2] > S - 2 ? S - 2 - b[2] : 0, sy = b[1] < (b[2] > 640 ? 46 : 2) ? (b[2] > 640 ? 46 : 2) - b[1] : /* 畫布右上角有「全圖／我附近／＋／－」按鈕，標籤的上緣要在按鈕下面（46） */ b[3] > S - 2 ? S - 2 - b[3] : 0; b = [b[0] + sx, b[1] + sy, b[2] + sx, b[3] + sy]; if (!free(...b)) continue; if ((sx || sy) && b[0] < X + mk && X - mk < b[2] && b[1] < Y + mk && Y - mk < b[3]) continue; at = [X + dx + sx, Y + dy + sy, b]; break; }
    if (!at && !p.camp) continue; const mb = [X - mk, Y - mk, X + mk, Y + mk]; boxes.push(mb); if (p.camp) flame(cx, X, Y, 7); else if (p.lm) landmark(cx, X, Y, 6.5); else dot(cx, X, Y, 3.6, '#e8dcc0', 1.6);
    if (at) { boxes.push(at[2]); word(p.t, at[0], at[1], f, p.camp ? '#ffd9a8' : '#e6dcc6', 4); }
    mapHits.push({ b: at ? [Math.min(mb[0], at[2][0]), Math.min(mb[1], at[2][1]), Math.max(mb[2], at[2][2]), Math.max(mb[3], at[2][3])] : mb, t: p.t, note: p.note, camp: !!p.camp }); }
  for (const f of FISH_SPOTS) { if (!explored(f.x, f.z)) continue; const X = ox + f.x * s, Y = oz + f.z * s; if (X < -10 || X > S + 10 || Y < -10 || Y > S + 10) continue; fishMark(cx, X, Y, 6); mapHits.push({ b: [X - 7, Y - 6, X + 8, Y + 8], t: f.name, note: '釣點：帶釣竿站在水邊，對著水面按住攻擊拋竿。', fish: 1 }); }
  // 0.6：菁英不標示在地圖上（自己找；傳聞只說牠常出沒的三個地方）
  for (const H of hints) if (H.h && H.h.r) hintCircle(cx, ox + H.h.x * s, oz + H.h.z * s, H.h.r * s, 4.5);
  for (const n of npcs) if (explored(n.x, n.z)) npcDot(cx, ox + n.x * s, oz + n.z * s, n, 4, 9, 14);
  // 任務名稱寫在區域或大圈上
  const lab = {}; for (const H of hints) if (H.h) { const k = H.h.zone || H.h.x + ',' + H.h.z; (lab[k] = lab[k] || { h: H.h, names: [] }).names.push(H.q.name); }
  for (const k in lab) { const h = lab[k].h, at = h.zone ? QLAB[h.zone] || ZONE_AT[h.zone] || [0, 0] : [h.x, h.z], x = ox + at[0] * s, y = oz + at[1] * s; [...new Set(lab[k].names)].forEach((t, i) => { const yy = y - i * 20; cx.font = '700 15px "Noto Sans TC",sans-serif'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.8)'; cx.strokeText('◆ ' + t, x, yy); cx.fillStyle = '#ffc98a'; cx.fillText('◆ ' + t, x, yy); }); }
  if (P.bag) dot(cx, ox + P.bag.x * s, oz + P.bag.z * s, 8, '#ffd76a', 2);
  for (const r of remotes.values()) { dot(cx, ox + r.x * s, oz + r.z * s, 7, pCol(r), 2); cx.font = '500 14px "Noto Sans TC",sans-serif'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(r.name, ox + r.x * s, oz + r.z * s - 16); cx.fillStyle = '#d6ecff'; cx.fillText(r.name, ox + r.x * s, oz + r.z * s - 16); }
  { const X = ox + me.x * s, Y = oz + me.z * s; if (X > -6 && X < S + 6 && Y > -6 && Y < S + 6) arrow(cx, X, Y, me.f, 13); else { const a = Math.atan2(X - S / 2, Y - S / 2), ex = S / 2 + Math.sin(a) * (S / 2 - 18), ey = S / 2 + Math.cos(a) * (S / 2 - 18); arrow(cx, clamp(ex, 18, S - 18), clamp(ey, 18, S - 18), a, 11); } }      /* 自己在畫面外：邊緣一個箭頭指過去 */
  /* 比例尺（左下）：一段 100 或 200 公尺 */
  { const m = s * 200 > 140 ? 100 : 200, L = m * s, x0 = 22, y0 = S - 24; cx.save(); cx.lineWidth = 6; cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + L, y0); cx.stroke(); cx.lineWidth = 2.4; cx.strokeStyle = '#f0d79a'; cx.beginPath(); cx.moveTo(x0, y0 - 5); cx.lineTo(x0, y0); cx.lineTo(x0 + L, y0); cx.lineTo(x0 + L, y0 - 5); cx.stroke(); cx.font = '600 14px "Noto Sans TC",sans-serif'; cx.textAlign = 'left'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(m + ' 公尺', x0 + L + 8, y0 - 1); cx.fillStyle = '#f0d79a'; cx.fillText(m + ' 公尺', x0 + L + 8, y0 - 1); cx.restore(); }
  const bz = document.getElementById('mapZoom8'); if (bz) { bz.querySelector('[data-z="fit"]').classList.toggle('on', BMV.mode === 'fit'); }
}


/* ============================== 捏角色 ============================== */
// 做法比照魂系遊戲：先選基礎臉，再依部位用滑桿直接改變 3D 臉型；身體與服裝另有分頁
const CR_TABS = [['base', '基本']].concat(GROUPS, [['body', '身體'], ['gear', '服裝與武器']]);
const FACE_TABS = new Set(GROUPS.map(g => g[0]).concat(['base']));
const BODY_SL = [['h', '身高', 85, 115], ['hs', '頭部大小', 80, 125], ['chest', '上身寬', 0, 100], ['belly', '腹部', 0, 100], ['arm', '手臂粗細', 0, 100], ['leg', '腿部粗細', 0, 100]];
let cur = null, crTab = 'base', crFirst = false, onCreatorDone = null, crPending = false;
const applyLook = () => { if (crPending) return; crPending = true; requestAnimationFrame(() => { crPending = false; setLook(cur); }); };
function crSlider(box, label, get, set, min, max, mid) {
  const row = document.createElement('label'), sp = document.createElement('span'), inp = document.createElement('input'), out = document.createElement('output'); row.className = 'sl'; sp.textContent = label; inp.type = 'range'; inp.min = min; inp.max = max; inp.value = get();
  const show = () => { out.textContent = mid != null ? (inp.value - mid > 0 ? '+' : '') + (inp.value - mid) : inp.value; }; show();
  inp.addEventListener('input', () => { set(+inp.value); show(); applyLook(); }); row.append(sp, inp, out); box.appendChild(row);
}
function crChoice(box, title, names, isOn, pick, swatch) {
  const h = document.createElement('h3'); h.textContent = title; const wrap = document.createElement('div'); wrap.className = swatch ? 'sw' : 'opts';
  names.forEach((t, i) => { const b = document.createElement('button'); if (swatch) { b.style.background = swatch(i) || 'linear-gradient(135deg,#888,#ccc)'; b.setAttribute('aria-label', title + ' ' + (i + 1)); b.title = t || ''; } else b.textContent = t; if (isOn(i)) b.className = 'on'; b.onclick = () => { pick(i); Sfx.play('click'); applyLook(); renderCreator(); }; wrap.appendChild(b); });
  box.append(h, wrap);
}
function renderCreator() {
  const tabs = $('crTabs'), body = $('crBody'), F = cur.face; tabs.textContent = ''; body.textContent = '';
  for (const [id, name] of CR_TABS) { const b = document.createElement('button'); b.textContent = name; if (id === crTab) b.className = 'on'; b.onclick = () => { crTab = id; Sfx.play('tab'); renderCreator(); }; tabs.appendChild(b); }
  input.creatorFocus = FACE_TABS.has(crTab) ? 'face' : 'body';
  const T = crTab;
  const choices = grp => { for (const [k, g2, title, list, sw] of CHOICES) if (g2 === grp) crChoice(body, title, list, i => F[k] === i, i => { F[k] = i; }, sw ? i => list[i] : null); };
  if (T === 'base') {
    crChoice(body, '體型', ['男性體型', '女性體型'], i => cur.g === i, i => { if (cur.g === i) return; cur.g = i; const d = defaultFace(i); for (const k of ['hair', 'lash', 'lipc', 'blush', 'brow']) F[k] = d[k]; if (i) F.beard = 0; });
    crChoice(body, '基礎臉（整張臉的搭配）', PRESETS.map(p => p[0]), () => false, i => { Object.assign(F, PRESETS[i][1]); for (const [id] of SLIDERS) F.s[id] = MID; Object.assign(F.s, PRESETS[i][2]); });
    choices('base');
    const p = document.createElement('p'); p.className = 'hint'; p.textContent = '先選一張基礎臉，再到各部位的分頁換造型：每個部位先挑造型，再用滑桿調大小、高低、間距、角度。「相似的臉」會保留造型、只小幅改變滑桿；「隨機」則整張重來。'; body.appendChild(p);
  } else if (T === 'body') {
    for (const [k, name, lo, hi] of BODY_SL) crSlider(body, name, () => cur[k], v => { cur[k] = v; }, lo, hi, k === 'h' || k === 'hs' ? 100 : 50);
  } else if (T === 'gear') {
    crChoice(body, '服裝', BODY_KEYS.map(k => BODIES[k].name), i => cur.body === i, i => { cur.body = i; });
    crChoice(body, '服裝色調', Array.from({ length: HUE_N }, (_, i) => i ? '' : '原色'), i => cur.hue === i, i => { cur.hue = i; }, i => hueCss(i));
    if (crFirst || !Ars.count()) crChoice(body, '第一把武器（之後的武器向鐵匠布蘿娜訂做）', WEAPONS.map(w => w.name), i => cur.wp === i, i => { cur.wp = i; });      // 0.6：武器是擁有的東西，只有創角能選第一把
    else { const p = document.createElement('p'); p.className = 'hint'; p.textContent = '武器：到角色面板的「武器架」換；別種武器向鐵匠布蘿娜訂做。穿著獸皮披肩時，這裡選的披風不會顯示。'; body.appendChild(p); }
    crChoice(body, '頭飾', HATS.map(h => h.name), i => cur.hat === i, i => { cur.hat = i; });
    crChoice(body, '披風', CAPES.map(c => c.name), i => cur.cape === i, i => { cur.cape = i; });
    if (cur.cape) crChoice(body, '披風顏色', CAPE_COLORS, i => cur.cc === i, i => { cur.cc = i; }, i => CAPE_COLORS[i]);
  } else {
    choices(T);
    for (const [id, grp, name] of SLIDERS) if (grp === T) crSlider(body, name, () => F.s[id], v => { F.s[id] = v; }, 0, MAXV, MID);
  }
}
function resetTab() {
  const F = cur.face, T = crTab;
  if (T === 'body') for (const [k] of BODY_SL) cur[k] = k === 'h' || k === 'hs' ? 100 : 50;
  else for (const [id, grp] of SLIDERS) if (grp === T) F.s[id] = MID;
  applyLook(); renderCreator();
}
export function openCreator(first, done) {
  freeCursor = true; closeAll(); cur = parseLook(P.look); crFirst = first; onCreatorDone = done || null; crTab = 'base'; input.creator = true; freeCursor = false; unlock(); releaseAll(); me.f = 0.3; setForceHour(10.5);
  for (const id of ['creator', 'creatorTitle', 'creatorHint']) $(id).hidden = false; document.body.classList.remove('playing'); renderCreator();
}
function closeCreator() { for (const id of ['creator', 'creatorTitle', 'creatorHint']) $(id).hidden = true; setLook(cur); input.creator = false; input.cam.yaw = Math.PI; setForceHour(null); /* N5：me.f 不在這裡一次轉成面向南門（單幀轉 180 度）；由 main.js 的創角鏡頭過渡在 0.9 秒內轉過去 */ Store.dirty = true; if (onCreatorDone) onCreatorDone(); else { document.body.classList.add('playing'); lock(); } }
function buildCreator() {
  $('crRandom').onclick = () => { const keep = { body: cur.body, hue: cur.hue, wp: cur.wp, hat: cur.hat, cape: cur.cape, g: cur.g }; cur.face = randomFace(cur.g); Sfx.play('click'); applyLook(); renderCreator(); void keep; };
  $('crSimilar').onclick = () => { cur.face = similarFace(cur.face, 3); Sfx.play('click'); applyLook(); renderCreator(); };
  $('crReset').textContent = '滑桿歸零'; $('crReset').onclick = () => { Sfx.play('click'); resetTab(); };
  $('crDone').onclick = () => { Sfx.play('confirm'); closeCreator(); };
}

/* ============================== 開始流程 ============================== */
export function uiProgress(p, text) { $('loadBar').firstElementChild.style.transform = `scaleX(${clamp(p, 0, 1)})`; if (text) $('loadText').textContent = text + '…'; }
export function uiFatal(err) { const d = document.createElement('div'); d.id = 'fatal'; const pre = document.createElement('pre'); pre.textContent = '載入時發生問題。把下面這段訊息貼給 Claude 就能查原因。\n\n' + (err && (err.stack || err.message) || String(err)); d.appendChild(pre); document.body.appendChild(d); }
export function uiReady() {
  $('start').classList.remove('loading'); $('loading').hidden = true; $('entry').hidden = false;
  const [label, cls] = Store.label(), note = $('entryNote');
  note.textContent = ''; const s = document.createElement('span'); s.className = cls; s.textContent = '存檔位置：' + label; note.append(s, document.createElement('br'), document.createTextNode(Net.room ? '已接上連線功能，同時開著這一頁的受邀玩家會出現在同一個世界。' : '目前是單人模式。'));
  if (Store.has) { $('entryLead').textContent = `歡迎回來，${P.name}。`; $('enterBtn').textContent = Store.needCreator ? '塑造外觀' : '進入萬獸原野'; }
  else { $('entryLead').textContent = '為你的冒險者取個名字（2 到 12 個字，之後每週可以改一次）。'; $('nameIn').hidden = false; $('enterBtn').textContent = '建立角色'; setTimeout(() => $('nameIn').focus(), 50); }
  $('enterBtn').onclick = enter; $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) enter(); });
}
let entering = false;
async function enter() {
  if (entering) return; Sfx.init();
  if (!Store.has) {
    const name = $('nameIn').value.trim(), msg = $('entryMsg');
    if (!/^[\p{L}\p{N}_・ー]{2,12}$/u.test(name)) { msg.textContent = '名字需要 2 到 12 個字，只能用文字、數字與底線。'; return; }
    entering = true; $('enterBtn').disabled = true; msg.textContent = '註冊中…';
    const r = await Store.register(name); entering = false; $('enterBtn').disabled = false;
    if (!r.ok) { msg.textContent = r.msg; return; } msg.textContent = ''; Store.has = true;
  }
  $('start').classList.add('out'); setTimeout(() => { $('start').hidden = true; }, 700);
  if (Store.needCreator) { Store.needCreator = false; openCreator(true, begin); } else begin();
}
function begin() {
  input.started = true; document.body.classList.add('playing'); $('scene').focus(); ui.dirty = true; lastZone = '';
  log('歡迎來到鐵環城。城門外就是風吹草原。'); log(`${keyOf('char')} 配點，${keyOf('bag')} 背包，${keyOf('quest')} 任務，${keyOf('skills')} 技能，${keyOf('map')} 地圖，${keyOf('camera')} 切換視角，Esc 設定（可以改按鍵）。`); log(`戰鬥：${keyOf('attack')} 輕攻擊，${keyOf('heavy')} 重攻擊（按住蓄力），${keyOf('guard')} 按住格擋，${keyOf('dodge')} 閃避，${keyOf('sprint')} 衝刺，${keyOf('lock')} 鎖定目標。野獸出招前地上會有紅色預警。`);
  if (input.cam.mode === 'tps') log('背後視角：點一下畫面後用滑鼠轉動視角。'); lock();
  if (P.pts > 0) toast(`有 ${P.pts} 點能力點數還沒分配，按 ${keyOf('char')} 開啟角色面板。`);
  if (!seenIntro()) narrate(LORE.intro);
}

/* ============================== 輸入 ============================== */
let dragX = null, rdrag = null, wheelAt = 0;
function doPress(a) {
  if (dlg) { if (a === 'attack' || a === 'interact') dlgNext(); return; }      // 交談中：只有「下一頁」
  if (held.has(a)) return; held.add(a);
  switch (a) {
    case 'up': case 'down': case 'left': case 'right': input.keys.add(a); break;
    case 'attack': input.atkHeld = true; tryAttack(); break;
    case 'heavy': input.heavyHeld = true; tryHeavy(); break;
    case 'sprint': input.sprint = true; break;
    case 'lock': case 'lock2': toggleLock(); break;
    case 'lockNext': cycleLock(1); break;
    case 'guard': input.guard = true; break;
    case 'skill1': case 'skill2': case 'skill3': case 'skill4': castSkill(+a.slice(5) - 1); break;
    case 'skills': toggleWin('skill'); break;
    case 'dodge': tryDodge(); break;
    case 'heal': quickHeal(); break;
    case 'interact': input.useHeld = true; interact(); break;
    case 'camera': setView(input.cam.mode === 'tps' ? 'top' : 'tps'); break;
    case 'cursor': freeCursor = true; unlock(); break;
    case 'char': case 'bag': case 'map': case 'quest': toggleWin(a); break;
    case 'chat': $('chatIn').focus(); break;
  }
}
function doRelease(a) {
  if (!held.delete(a)) return;
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') input.keys.delete(a); else if (a === 'attack') input.atkHeld = false; else if (a === 'interact') input.useHeld = false; else if (a === 'heavy') input.heavyHeld = false; else if (a === 'sprint') input.sprint = false; else if (a === 'guard') input.guard = false; else if (a === 'cursor') { freeCursor = false; lock(); }
}
const releaseAll = () => { for (const a of [...held]) doRelease(a); input.keys.clear(); input.useHeld = false; input.atkHeld = false; input.heavyHeld = false; input.sprint = false; input.guard = false; };
function bindInput() {
  const canvas = $('scene'), chatIn = $('chatIn');
  const typing = () => document.activeElement === chatIn || document.activeElement === $('nameIn');
  window.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (capture) { e.preventDefault(); e.stopPropagation(); endCapture(e.code === 'Escape' ? null : e.code); return; }
    if (typing()) { if (document.activeElement === chatIn) { if (e.key === 'Enter') { const t = chatIn.value.trim(); chatIn.value = ''; chatIn.blur(); if (t) say(t); } else if (e.key === 'Escape') { chatIn.value = ''; chatIn.blur(); } } return; }
    if (e.code === 'F3') { e.preventDefault(); toggleDiag(); return; }
    if (!input.started || input.creator) return;
    if (dlg && !dlg.shop) { e.preventDefault(); if (e.repeat) return; const a = actionOf(e.code); if (e.code === 'Escape') endTalk(); else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) dlgPick(+e.code.slice(-1) - 1); else if (e.code === 'Space' || e.code === 'Enter' || a === 'interact' || a === 'attack') dlgNext(); return; }
    if (inv && (e.code === 'KeyY' || e.code === 'KeyN') && !e.repeat) { e.preventDefault(); answerInvite(e.code === 'KeyY'); return; }      // 0.6：組隊邀請 Y 接受、N 拒絕（邀請出現時優先）
    if (e.code === 'Escape') { if (anyOpen()) closeAll(); else setWin('set', true); return; }
    if (UI6.resting() && (e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) { e.preventDefault(); UI6.restCook(); return; }      // 0.6：坐在營火旁，1＝料理
    const a = actionOf(e.code); if (!a) return;
    if (!e.ctrlKey && !e.metaKey) e.preventDefault();
    if (!e.repeat) doPress(a);
  }, true);
  window.addEventListener('keyup', e => { const a = actionOf(e.code); if (a) { if (e.code.startsWith('Alt')) e.preventDefault(); doRelease(a); } });
  window.addEventListener('blur', () => { releaseAll(); dragX = null; rdrag = null; });
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => Sfx.init(), true);      // 瀏覽器要有使用者操作才能出聲：任何一次點擊或按鍵都解鎖（或恢復被暫停的）音訊
  chatIn.addEventListener('focus', () => { input.typing = true; releaseAll(); $('chat').classList.add('open'); });
  chatIn.addEventListener('blur', () => { input.typing = false; $('chat').classList.remove('open'); });
  document.addEventListener('pointerlockchange', () => {
    const on = document.pointerLockElement === canvas; input.cam.locked = on; document.body.classList.toggle('locked', on);
    if (on) { lockFails = 0; if (input.cam.noLock) { input.cam.noLock = false; renderSet(); } }
    else { if (!selfUnlock && input.started && !input.creator && !anyOpen() && !freeCursor && input.cam.mode === 'tps') setWin('set', true); selfUnlock = false; }     // 瀏覽器用 Esc 解除鎖定時，等同按下 Esc 開設定
  });
  document.addEventListener('pointerlockerror', lockFail);
  window.addEventListener('mousemove', e => {
    input.aim.sx = e.clientX; input.aim.sy = e.clientY;
    if (dragX != null && input.creator) { me.f += (e.clientX - dragX) * 0.012; dragX = e.clientX; return; }
    const C = input.cam; if (C.mode !== 'tps' || input.creator || input.talk || !input.started) return;
    let dx = 0, dy = 0;
    if (C.locked) { dx = e.movementX || 0; dy = e.movementY || 0; if (Math.abs(dx) > 500 || Math.abs(dy) > 500) return; }     // 鎖定瞬間偶爾會送來一次很大的位移
    else if (rdrag) { dx = e.clientX - rdrag.x; dy = e.clientY - rdrag.y; if (!rdrag.moved && Math.hypot(dx, dy) < 5) return; if (!rdrag.moved) { rdrag.moved = true; if (rdrag.down) { doRelease(rdrag.a); rdrag.down = false; } } rdrag.x = e.clientX; rdrag.y = e.clientY; }
    else return;
    const k = 0.0024 * settings.sens / 100; if (!lockTarget()) C.yaw -= dx * k; C.pitch = clamp(C.pitch + dy * k * (settings.invY ? -1 : 1), -0.5, 1.35); C.manual = performance.now();
  });
  canvas.addEventListener('mousedown', e => {
    Sfx.init(); if (document.activeElement && document.activeElement !== canvas && document.activeElement.blur) document.activeElement.blur();
    if (input.creator) { if (e.button === 0) dragX = e.clientX; return; }
    if (!input.started) return; if (e.button === 1) e.preventDefault();
    const a = actionOf('Mouse' + e.button), C = input.cam;
    if (C.mode === 'tps' && !C.locked) {
      lock();
      // 沒有鎖定滑鼠時：右鍵拖曳是轉視角；按著不動或點一下才算右鍵綁定的動作
      if (e.button === 2) { rdrag = { x: e.clientX, y: e.clientY, moved: false, a, down: false, timer: setTimeout(() => { if (rdrag && !rdrag.moved && rdrag.a) { rdrag.down = true; doPress(rdrag.a); } }, 150) }; return; }
    }
    if (a) doPress(a);
  });
  window.addEventListener('mouseup', e => {
    dragX = null;
    if (rdrag && e.button === 2) { const r = rdrag; rdrag = null; clearTimeout(r.timer); if (r.a) { if (r.down) doRelease(r.a); else if (!r.moved) { doPress(r.a); doRelease(r.a); } } return; }
    const a = actionOf('Mouse' + e.button); if (a) doRelease(a);
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (input.creator) return; if (lockTarget()) { if (performance.now() - wheelAt > 220) { wheelAt = performance.now(); cycleLock(e.deltaY > 0 ? 1 : -1); } return; } if (input.cam.mode === 'tps') input.cam.dist = clamp(input.cam.dist + Math.sign(e.deltaY) * 0.7, 2.6, 12); else input.zoom = clamp(input.zoom + Math.sign(e.deltaY) * 0.07, 0.5, 1.3); }, { passive: false });
  window.addEventListener('contextmenu', e => e.preventDefault());
  $('keyCap').addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); if (capture) endCapture('Mouse' + e.button); });
  $('viewSeg').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view, true); });
  $('sens').addEventListener('input', e => { settings.sens = +e.target.value; saveSettings(); });
  $('invY').addEventListener('change', e => { settings.invY = e.target.checked; saveSettings(); });
  $('keyReset').onclick = () => { resetBinds(); releaseAll(); renderKeys(); keyHints(); Sfx.play('click'); };
  $('menu').addEventListener('click', e => { const b = e.target.closest('button[data-win]'); if (b) { toggleWin(b.dataset.win); b.blur(); } });
  document.addEventListener('click', e => { const x = e.target.closest('[data-close]'); if (x) { const w = x.closest('.win'); for (const k in WINS) if (WINS[k] === w.id) setWin(k, false); } });
  $('dlgBox').addEventListener('click', e => { if (!e.target.closest('button') && !e.target.closest('#dlgCard')) dlgNext(); });
  $('skTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { skTab = b.dataset.t; Sfx.play('tab'); renderSkills(); } });
  $('qTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { qTab = b.dataset.t; qSel = null; Sfx.play('tab'); renderQuests(); } });
  { const cv = $('bigMap'), tipE = $('mapTip'), at = e => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * cv.width, y = (e.clientY - r.top) / r.height * cv.height; return mapHits.find(h => x >= h.b[0] - 3 && x <= h.b[2] + 3 && y >= h.b[1] - 3 && y <= h.b[3] + 3); };
    const show = e => { const h = at(e); if (!h || (!h.note && !h.camp)) { tipE.hidden = true; cv.style.cursor = ''; return; } cv.style.cursor = 'help'; tipE.textContent = ''; tipE.append(el('b', '', h.t)); if (h.camp) tipE.append(el('i', '', '營火')); tipE.append(el('span', '', h.note || '坐下休息回精力，也能料理。')); tipE.hidden = false; const r = cv.getBoundingClientRect(), pr = tipE.parentElement.getBoundingClientRect(), x = e.clientX - pr.left, y = e.clientY - pr.top; tipE.style.left = clamp(x + 14, 4, pr.width - tipE.offsetWidth - 4) + 'px'; tipE.style.top = (y + 16 + tipE.offsetHeight > r.bottom - pr.top ? y - tipE.offsetHeight - 10 : y + 16) + 'px'; };      // 0.6：地名的一句說明（PLACE_NOTES）
    cv.addEventListener('mousemove', e => { if (!(e.buttons & 1)) show(e); }); cv.addEventListener('click', e => { if (!cv.dataset.dragged) show(e); });      /* 0.8 X7：拖曳地圖時不跳說明 */ cv.addEventListener('mouseleave', () => { tipE.hidden = true; }); }
  $('watchCase').onclick = () => toggleWin('map'); $('ptsBtn').onclick = () => setWin('char', true); document.querySelectorAll('#slotHeal .hc').forEach(e => { e.onclick = () => { const id = e.dataset.item; if (!(P.inv[id] > 0)) toast('沒有' + ITEMS[id].name); else useItem(id); }; }); $('healGlyph').innerHTML = iconSvg('potion'); $('meatGlyph').innerHTML = iconSvg('meat'); $('tip').onclick = () => { tipT = 0.01; };
  document.querySelectorAll('#slots .skill').forEach((e, i) => { e.onclick = () => { if (P.slots[i]) castSkill(i); else setWin('skill', true); }; });
  $('qSeg').addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (b) applyQuality(b.dataset.q); });
  for (const [id, k] of VOLS) { const e = $(id); e.value = settings[k]; e.addEventListener('input', () => { settings[k] = +e.value; $(id + 'N').textContent = e.value; applyVol(); saveSettings(); }); if (id === 'vol' || id === 'volSfx') e.addEventListener('change', () => Sfx.play('confirm')); }      // 放開滑桿時響一聲，聽得出音效現在多大聲（環境音與音樂本來就一直在響）
  $('reCreate').onclick = () => { openCreator(false); };
  $('diagBtn').onclick = toggleDiag;
  $('diagCopy').onclick = () => { const text = diagRows().map(r => r[0] + '：' + r[1]).join('\n'), b = $('diagCopy'); const ok = () => { b.textContent = '已複製'; setTimeout(() => { b.textContent = '複製這份資訊'; }, 1600); }; try { navigator.clipboard.writeText(text).then(ok, () => { b.textContent = '複製失敗，請手動選取'; }); } catch (e) { b.textContent = '複製失敗，請手動選取'; } };
}

/* ============================== 建立與每幀 ============================== */
export function initUI() {
  // ui.craft：game.js 在營火坐下時呼叫 ui.craft('cook', { camp })、起身時 ui.craft(null)。0.6 第二波改成坐下先開休息面板，按「料理」才開料理視窗
  ui.win7 = (k, on) => setWin(k, on); Object.assign(ui, { toast, log, chat, banner, loot, levelUp, dead, notice, invite: showInvite, hurt: () => { $('vignette').classList.add('on'); hurtT = 0.12; }, shop: on => setWin('shop', on), skills: on => setWin('skill', on), tip, talk: startTalk, narrate, narrFront: lines => { narrQ.unshift(...lines); }, narrDrop: f => { let n = 0; for (let i = narrQ.length - 1; i >= 0; i--) if (f(narrQ[i].t || narrQ[i])) { narrQ.splice(i, 1); n++; } return n; }, move: moveName, craft: (st, where) => { if (!st) { UI6.onStand(); UI6.openCraft(null); } else if (where && where.camp) UI6.onSit(where.camp); else UI6.openCraft(st, where); }, forge: () => UI6.openForge(), cloak: () => UI6.openCloak(), prompt: t => { if (t === lastPrompt) return; lastPrompt = t; const e = $('prompt'); e.textContent = t; e.classList.toggle('on', !!t); }, sfx: (n, a, o) => Sfx.play(n, a, o) });
  input.cam.mode = settings.view === 'top' ? 'top' : 'tps'; document.body.classList.toggle('tps', input.cam.mode === 'tps');
  window.addEventListener('resize', () => { if (dlg && !dlg.shop) dlgFrame(); });
  $('invYes').onclick = () => answerInvite(true); $('invNo').onclick = () => answerInvite(false); $('partyLeave').onclick = () => { leaveTeam(); renderParty(); };      // 0.6 組隊
  buildChar(); buildCreator(); bindInput(); bindDrag(); keyHints(); UI6.init({ $, el, ic, toast, sfx: (n, a, o) => Sfx.play(n, a, o), setWin, isOpen, tip, cursor: restCursor }); B7.initUI({ $, el, ic, toast, sfx: (n, a, o) => Sfx.play(n, a, o), setWin, isOpen, tip, WINS }); UI7.init({ $, el, ic, iconSvg, toast, log, tip, sfx: (n, a, o) => Sfx.play(n, a, o), setWin, isOpen, WINS, renderChar, renderQuests, renderTracker, dlg: () => dlg, dlgWin, dlgMenu, keyOf }) /* 0.8 */; UI8.init({ $, el, ic, iconSvg, toast, log, tip, sfx: (n, a, o) => Sfx.play(n, a, o), setWin, isOpen, WINS, keyOf, renderChar, renderQuests, renderTracker, dlg: () => dlg, dlgWin, dlgMenu }); document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = iconSvg(e.dataset.ic); });
}
export function initMaps() { buildMaps(); drawFog(); }
const PERIOD = h => h < 5 ? '深夜' : h < 7 ? '黎明' : h < 11 ? '上午' : h < 13 ? '正午' : h < 17 ? '午後' : h < 19 ? '黃昏' : h < 23 ? '夜晚' : '深夜';
const TIER_N = ['一', '二', '三', '四'], nf = n => Number(n || 0).toLocaleString('en-US');      /* 0.8 X7：16–20 級是第四級距；經驗數字加千分位 */
let miniT = 0, slowT = 0, partyT = 0, lastHp = '', lastMp = '', lastSun = -1, lastBuff = '', lastLock = '';
const healS = { pick: 'potion', pot: 'potion', id: null, ct: '', lb: '回復', brk: 0 };
const healPot = () => (P.inv.potion > 0 || !(P.inv.potion_strong > 0) ? 'potion' : 'potion_strong');      // 和 game.js 的 quickHeal 同一條規則：先喝治療藥水，沒有了才喝強效的
const skEl = [], SHORT_CD = 1.6;      // 不到這麼長的冷卻當作「共用冷卻」（放了別的技能後短暫不能用）：整格淺色遮罩很快退掉、不顯示秒數，才不會閃一下數字
export function updateUI(dt) {
  UI7.tick(dt); UI8.tick(dt); /* 0.8 介面中間層 */      // 0.7 介面（d7-ui）
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) $('vignette').classList.remove('on'); }
  for (let i = noticeQ.length - 1; i >= 0; i--) { const q = noticeQ[i]; if ((q.t -= dt) <= 0.6) q.p.classList.add('out'); if (q.t <= 0) { q.p.remove(); noticeQ.splice(i, 1); if (!noticeQ.length) document.body.classList.remove('noticing'); } }      // 0.6 公告
  if (inv) { const v = inviteIn(); if (v !== inv) showInvite(v); else $('invFill').style.transform = `scaleX(${clamp(v.t / 30, 0, 1)})`; }
  if (tipT > 0 && !isOpen('map') && !UI8.holdTip()) { /* 0.8：試煉／對決中提示框先停（ui08h 把它藏起來），結束再接著倒數 */ tipT -= dt; if (tipQ.length && tipT <= 4) showTip(tipQ.shift()); else if (tipT <= 0) $('tip').classList.remove('on'); }
  if (!input.started) return;
  if (dlg && (!me.alive || me.lastCombat > dlg.t0 || Math.hypot(dlg.n.x - me.x, dlg.n.z - me.z) > 6)) endTalk();      // 走遠、被打、倒下都會結束交談
  if (narrT > 0) { narrT -= dt; if (narrT <= 0) { $('narr').classList.remove('on'); narrGap = 0.8; } } else if (narrQ.length && !dlg && bannerT <= 0 && (narrGap -= dt) <= 0) { const it = narrQ.shift(), t = it.t || it, e = $('narr'); e.textContent = t; e.classList.add('on'); narrT = 2.8 + t.length * 0.12; if (!it.again) addLine(p => { p.textContent = '〔' + t + '〕'; }, 'sys old'); }
  // 生命、體力
  $('hpFill').style.transform = `scaleX(${clamp(me.hp / D.maxHp, 0, 1)})`; $('stFill').style.transform = `scaleX(${clamp(me.st / D.maxSt, 0, 1)})`;
  const hpT = Math.ceil(me.hp) + ' / ' + D.maxHp; if (hpT !== lastHp) { lastHp = hpT; $('hpText').textContent = hpT; }
  $('mpFill').style.transform = `scaleX(${clamp(me.mp / D.maxMp, 0, 1)})`; const mpT = Math.floor(me.mp) + ' / ' + D.maxMp; if (mpT !== lastMp) { lastMp = mpT; $('mpText').textContent = mpT; }
  $('stBar').classList.toggle('guard', me.guard); $('stBar').classList.toggle('low', me.st < 14); $('mpBar').classList.toggle('low', me.mp < 8);
  UI6.updateHud();      // 0.6：飽食與精力、增益、採集與製作的進度
  // 技能欄：冷卻、資源不足
  if (!skEl.length) document.querySelectorAll('#slots .skill').forEach(e => skEl.push({ e, cd: e.querySelector('.cd'), n: e.querySelector('em'), g: e.querySelector('span'), id: undefined }));
  const wset = setOf(me.avatar);
  for (let i = 0; i < 4; i++) { const id = P.slots[i], S = SKILLS[id], k = skEl[i]; if (k.id !== id) { k.id = id; k.fit = undefined; k.e.classList.toggle('empty', !S); k.g.innerHTML = S ? iconSvg('sk_' + id) : ''; k.g.style.background = S ? S.color : ''; k.e.title = S ? `${S.name}：${S.desc}` : '空的技能欄（點一下開啟技能視窗）'; k.e.querySelector('small').textContent = S ? S.name : '技能'; } if (!S) { k.cd.style.transform = 'scaleY(0)'; k.n.textContent = ''; continue; } const cd = me.cds[id] || 0; if (cd <= 0) k.max = 0; else if (!k.max || cd > k.last + 0.05) k.max = cd; k.last = cd; const short = k.max > 0 && k.max <= SHORT_CD; k.cd.style.transform = `scaleY(${clamp(cd / (short ? k.max : S.cd), 0, 1)})`; const t = !short && cd > 0.95 ? String(Math.ceil(cd)) : ''; if (k.n.textContent !== t) k.n.textContent = t; if (k.short !== short) { k.short = short; k.e.classList.toggle('gcd', short); } const fit = skillFits(S, wset); k.e.classList.toggle('lack', me.mp < S.cost.mp || !fit); if (k.fit !== fit) { k.fit = fit; k.e.title = `${S.name}：${S.desc}` + (fit ? '' : `（要拿${FAM_NAME[S.wp]}才能用）`); } }
  // 狀態：反擊（完美閃避、精準格擋、影步之後）、戰吼、鐵壁
  const bf = (P.pk > 0 ? `通緝 ${Math.floor(P.pk / 60)}:${String(Math.floor(P.pk % 60)).padStart(2, '0')}　` : '') + (me.counter > 0 ? '反擊 ' + Math.ceil(me.counter) + '　' : '') + (me.buff.warcry > 0 ? '戰吼 ' + Math.ceil(me.buff.warcry) + '　' : '') + (me.buff.wall > 0 ? '鐵壁 ' + Math.ceil(me.buff.wall) + '　' : '') + (me.drink ? (me.drink.label || (me.drink.id === 'potion' ? '喝藥中' : '進食中')) : me.charge ? (me.charge.k >= 1 ? '蓄力完成' : '蓄力中') : me.stun > 0 ? '破防' : me.sprinting ? '衝刺' : me.regenLeft > 0 ? '回復中' : ''); if (bf !== lastBuff) { lastBuff = bf; $('buffs').textContent = bf; }
  // 鎖定標記（畫在目標身上）、弓的準心（蓄力時收攏）、招式名
  { const L = lockTarget(), e = $('lockMark'), s2 = L && !input.talk ? project(L.x, Hgt(L.x, L.z) + MON[L.type].body * L.size * 1.05 + 0.25, L.z) : null; if (s2) { e.style.display = 'block'; e.style.transform = `translate3d(${s2[0] | 0}px,${s2[1] | 0}px,0)`; } else if (e.style.display !== 'none') e.style.display = 'none';
    const lt = L ? L.name : ''; if (lt !== lastLock) { lastLock = lt; document.body.classList.toggle('locking', !!L); }
    const c = $('cross'), am = aiming() && !L; if (am !== c.classList.contains('aim')) c.classList.toggle('aim', am); if (am) c.style.setProperty('--k', String(me.charge ? 1 - me.charge.k : 0.35)); }
  if (moveT > 0) { moveT -= dt; if (moveT <= 0) $('moveName').classList.remove('on'); }
  $('lowhp').style.opacity = me.alive && me.hp < D.maxHp * 0.3 ? String(0.55 + Math.sin(performance.now() / 260) * 0.25) : '0';
  // 回復格：Q 現在會用哪一個（和 game.js 的 quickHeal 同一條規則：戰鬥中喝藥水，平時先吃肉）、喝的那 0.8 秒、兩格共用的冷卻
  // 0.6：治療藥水用完了改喝強效治療藥水——藥水那一格跟著換成實際會喝的那種（圖示、數量、說明）
  { const potId = healPot(), pot = P.inv[potId] || 0, meat = P.inv.meat || 0, pick = pot > 0 && (getClock() - me.lastCombat < 6 || !meat) ? 'potion' : meat > 0 ? 'meat' : 'potion', box = $('slotHeal'), dk = me.drink, id = dk ? dk.id : null, prog = k => box.querySelector(k === 'meat' ? '.hc.meat .prog' : '.hc.pot .prog');
    if (potId !== healS.pot) { healS.pot = potId; const hc = box.querySelector('.hc.pot'); hc.dataset.item = potId; $('healGlyph').innerHTML = iconSvg(potId); ui.dirty = true; }
    if (pick !== healS.pick) { healS.pick = pick; box.classList.toggle('pick-potion', pick === 'potion'); box.classList.toggle('pick-meat', pick === 'meat'); }
    $('healCd').style.transform = `scaleY(${me.potCdMax > 0 ? clamp(me.potCd / me.potCdMax, 0, 1) : clamp(me.itemCd / 4, 0, 1)})`; const ct = me.potCd > 0.05 ? String(Math.ceil(me.potCd)) : ''; if (ct !== healS.ct) { healS.ct = ct; $('healT').textContent = ct; }
    if (id !== healS.id) {      // 開始喝／喝完／被打斷（沒喝完也沒進冷卻：閃紅、寫「中斷」）
      if (healS.id) { const pe = prog(healS.id); if (pe) pe.style.transform = 'scaleY(0)'; box.classList.remove('drinking'); if (!(me.potCd > 0) && me.alive) { box.classList.add('brk'); healS.brk = 0.9; } }
      if (id) { box.classList.add('drinking'); box.classList.remove('brk'); healS.brk = 0; } healS.id = id;
    }
    if (dk) { const pe = prog(id); if (pe) pe.style.transform = `scaleY(${clamp(dk.t / (dk.dur || 1), 0, 1)})`; }
    if (healS.brk > 0 && (healS.brk -= dt) <= 0) box.classList.remove('brk');
    const lb = dk ? (dk.label || (/^potion/.test(id) ? '喝藥中' : '進食中')) : healS.brk > 0 ? '中斷' : me.regenLeft > 0 ? '回復中' : '回復'; if (lb !== healS.lb) { healS.lb = lb; $('healLbl').textContent = lb; } }
  if (me.zone !== lastZone) { lastZone = me.zone; const Z = ZONES[me.zone]; $('zoneName').textContent = Z.name; zoneBanner(me.zone, Z); }
  if (ui.dirty) {
    ui.dirty = false; $('pName').textContent = P.name; $('pUid').textContent = P.serial != null ? 'UID #' + String(P.serial).padStart(3, '0') : ''; $('lvNum').textContent = P.lv;
    const need = expNeed(P.lv), cap = P.lv >= LV_CAP; $('xpFill').style.transform = `scaleX(${cap ? 1 : clamp(P.exp / need, 0, 1)})`; { const xt = $('xpText'), tier = Math.floor((P.lv - 1) / 5); xt.textContent = cap ? `等級 ${P.lv}　已達第一層的上限（${LV_CAP} 級）` : `等級 ${P.lv}　經驗 ${nf(P.exp)} / ${nf(need)}`; if (!cap && tier > 0) xt.appendChild(el('i', '', `　第${TIER_N[tier] || tier + 1}級距（${tier * 5 + 1}–${tier * 5 + 5} 級）`)); }
    { const pid = healPot(), pot = P.inv[pid] || 0, meat = P.inv.meat || 0, hc = document.querySelectorAll('#slotHeal .hc'); $('healN').textContent = pot; $('meatN').textContent = meat; hc[0].classList.toggle('empty', !pot); hc[1].classList.toggle('empty', !meat); hc[0].classList.toggle('strong', pid === 'potion_strong'); hc[0].title = `${ITEMS[pid].name} ×${pot}：${ITEMS[pid].desc.split('。')[0]}。戰鬥中按 ${keyOf('heal')} 用這個` + (pid === 'potion_strong' ? '（治療藥水用完了，改喝強效的）' : (P.inv.potion_strong > 0 ? `；用完會改喝強效治療藥水（${P.inv.potion_strong}）` : '')); hc[1].title = `獸肉 ×${meat}：${ITEMS.meat.desc.split('。')[0]}。不在戰鬥時按 ${keyOf('heal')} 先用這個`; }
    renderChar(); renderBag(); renderShop(); renderSkills(); renderQuests(); renderTracker(); UI6.renderCraft(); UI6.renderForge(); UI6.renderCloak(); UI6.invTips();
  }
  miniT -= dt; if (miniT <= 0) { miniT = 0.07; drawMini(); }
  partyT -= dt; if (partyT <= 0) { partyT = 0.2; renderParty(); const pb = Math.round($('plate').getBoundingClientRect().bottom) + 8, pa = $('party'), tr = $('tracker'); if (pa.dataset.top !== String(pb)) { pa.dataset.top = pb; pa.style.top = pb + 'px'; } const tt = Math.max(150, pa.hidden ? pb : Math.round(pa.getBoundingClientRect().bottom) + 8); if (tr.dataset.top !== String(tt)) { tr.dataset.top = tt; tr.style.top = tt + 'px'; } }      // 0.6：隊伍列表在角色狀態下方，任務欄再往下
  slowT -= dt; if (slowT <= 0) {
    slowT = 0.5; const h = W.hour = (typeof window.__hour === 'number' ? window.__hour : gameHour()), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $('zoneSub').textContent = `${PERIOD(h)} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}　${ZONES[me.zone].safe ? '安全區' : '建議等級 ' + ZONES[me.zone].lv}`;
    const deg = Math.round((h - 12) / 24 * 360); if (deg !== lastSun) { lastSun = deg; $('sunArm').style.transform = `rotate(${deg}deg)`; $('sunDot').classList.toggle('moon', h < 5.6 || h > 19.4); }
    // 名牌依等級差標示：比自己高兩級以上是橘紅色加 ▲（打你更痛、你打牠更不痛）；低三級以上變灰加 ▽（幾乎學不到東西）。記號不只靠顏色
    { let warn = false; for (const v of mons) { if (!v.tag) continue; const d = v.lv - P.lv, c = v.tag.el.classList, hi = d >= 2, lo = d <= -3 && !v.elite; if (c.contains('lvhi') !== hi) c.toggle('lvhi', hi); if (c.contains('lvlo') !== lo) c.toggle('lvlo', lo); if (hi && v.st !== MST.DEAD && !me.inSafe && Math.hypot(v.x - me.x, v.z - me.z) < 20) warn = true; }
      if (warn) tip('lvhi', '名字後面有 ▲ 的野獸比你高兩級以上：牠打你更痛，你打牠更不痛。打不過不丟臉，先去做別的任務再回來。'); }
    if (!$('diag').hidden) renderDiag(); if (isOpen('map')) drawBigMap(); renderTracker();      // 夜間才出現的任務、蒐集數量會隨時間與背包變動
    if (isOpen('shop')) { const m = npcs.find(n => n.id === 'merchant'); if (!m || Math.hypot(m.x - me.x, m.z - me.z) > 7 || !me.alive) setWin('shop', false); }
  }
}
