// 0.8 介面：巴索的戰績簿、天賦球三選一、結果卡（試煉／百場連戰／對決）、百場連戰斷糧確認（ui-a）
// 只靠 init(H, D) 給的東西；可 import ./core.js（純資料）與 ./sil08.js（野獸剪影）。不碰 game.js、ui.js、index.html。
// 視窗代號 arena8（H.addWin('arena8', 'winArena8')）；巴索選單用 H.addNpcOption('keeper', '戰績簿', …)。
import { SKILLS, ITEMS } from './core.js';
import { ITEMS06 } from './data06.js';
import { ITEMS07 } from './data07.js';
import { silSvg } from './sil08.js';
import { P } from './game.js';      /* 0.8 X7：稀有天賦球箱三顆都有時的挑選框要看背包與已學的技能 */

const SWORDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke-linecap="round"><path d="M5 4l12.5 12.5M19 4L6.5 16.5" stroke="#f0d79a" stroke-width="2.4"/><path d="M14.6 18.8l4.2-4.2M9.4 18.8l-4.2-4.2" stroke="#c9a35a" stroke-width="2.2"/><path d="M18.4 18.4l2 2M5.6 18.4l-2 2" stroke="#7a5c28" stroke-width="2.6"/></g></svg>';
const LOCK = '<svg viewBox="0 0 10 11" aria-hidden="true"><rect x="1" y="4.6" width="8" height="6" rx="1" fill="#8a3a2a"/><path d="M2.8 4.8V3.4a2.2 2.2 0 0 1 4.4 0v1.4" fill="none" stroke="#8a3a2a" stroke-width="1.3"/></svg>';
const BOOK = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 6.5C8 5 11.5 5.4 14 7.4 16.5 5.4 20 5 24 6.5V22c-4-1.4-7.5-1-10 1-2.5-2-6-2.4-10-1z" fill="#efe2c0" stroke="#1c140c" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 7.4V23" stroke="#1c140c" stroke-width="1.3"/><path d="M6.6 10.5c2.2-.5 4-.3 5.4.5M6.6 13.5c2.2-.5 4-.3 5.4.5M16 11c1.4-.8 3.2-1 5.4-.5" stroke="#8a6a3a" stroke-width="1" fill="none"/><path d="M18 5.6v8.2l1.6-1.3 1.6 1.3V5.4" fill="#a8392f" stroke="#1c140c" stroke-width="1"/></svg>';
const BOX = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="7.5" width="15" height="9.5" rx="1" fill="#7a5530" stroke="#1c140c" stroke-width="1.2"/><path d="M2 5.5h16v3H2z" fill="#93683a" stroke="#1c140c" stroke-width="1.2"/><path d="M4 8.6h12" stroke="#ffe3a0" stroke-width="1.4" opacity=".9"/><rect x="8.6" y="4.6" width="2.8" height="5" fill="#e0b85c" stroke="#1c140c" stroke-width=".8"/></svg>';


const CSS = `
body #winArena8{left:max(330px,calc(50vw - 330px));--t:max(calc(var(--plateB,150px) + 8px),calc(50vh - 300px));top:var(--t);transform:none;width:min(660px,calc(100vw - 346px));max-height:calc(100vh - var(--t) - 16px)}
body #winArena8 header h2{display:flex;align-items:baseline;gap:12px}
body #winArena8 header h2 small{font-family:var(--font-body);font-size:12px;letter-spacing:.1em;color:var(--ink-dim);font-weight:400}
body #winArena8 .hic svg{width:26px;height:26px}
body #winArena8 .a8duel{font-size:12.5px;color:var(--ink-dim);margin-right:4px;white-space:nowrap} body #winArena8 .a8duel b{font-family:var(--font-display);font-size:14px;color:var(--brass-light);margin:0 1px 0 5px}
body #winArena8 .body{display:flex;flex-direction:column;gap:9px;padding:8px 14px 12px}
body #winArena8 .a8rule{margin:0;font-size:12px;color:var(--ink-dim)}
body #winArena8 .a8ledger{display:grid;grid-template-columns:86px repeat(3,minmax(0,1fr));gap:7px;padding:8px;background:linear-gradient(#6b4a2c,#5a3d24);border:1px solid #3b2716;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(255,220,160,.08),inset 0 2px 8px rgba(0,0,0,.35)}
body #winArena8 .a8tier{display:flex;flex-direction:column;justify-content:center;gap:1px;padding:6px 6px 6px 9px;border-left:2px solid var(--brass);border-radius:0 4px 4px 0;background:rgba(0,0,0,.3);color:var(--ink)}
body #winArena8 .a8tier b{font-family:var(--font-display);font-size:15px;letter-spacing:.12em}
body #winArena8 .a8tier small{font-size:11px;color:var(--ink-dim)}
body #winArena8 .a8orb{display:flex;align-items:center;gap:3px;margin-top:5px} body #winArena8 .a8orb i{width:9px;height:9px;border-radius:50%;border:1px solid var(--brass);background:rgba(0,0,0,.35)} body #winArena8 .a8orb i.on{background:radial-gradient(circle at 35% 35%,#fff1c4,#c9a35a 70%)}
body #winArena8 .a8orb + small{margin-top:1px;color:var(--brass-light)}
body #winArena8 .a8card{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0;padding:7px 9px 6px;background:#efe2c0;color:#2e2216;border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.45),inset 0 0 16px rgba(120,80,30,.16);transform:rotate(var(--tilt,0deg));cursor:pointer}
body #winArena8 .a8card .hd{display:flex;align-items:baseline;gap:6px;min-width:0}
body #winArena8 .a8card .id{font:700 11px/1 var(--font-body);color:#7a5c28;letter-spacing:.04em}
body #winArena8 .a8card .hd b{font-family:var(--font-display);font-size:14.5px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body #winArena8 .a8card .duo{margin-left:auto;padding:0 4px;border:1px solid #8a6a3a;border-radius:2px;font-size:10.5px;line-height:15px;color:#5a3d24;white-space:nowrap}
body #winArena8 .a8card .foe{display:flex;align-items:center;gap:2px;font-size:11.5px;color:#4a3826;white-space:nowrap} body #winArena8 .a8card .foe svg{width:25px;height:16px;color:#3a2a1c}
body #winArena8 .a8card .foe span{margin:0 5px 0 2px}
body #winArena8 .a8card .cond{padding-left:6px;border-left:2px solid #b8955a;font-size:12px;line-height:1.35}
body #winArena8 .a8card .ft{margin-top:3px;font-size:11.5px;color:#6b5236;font-variant-numeric:tabular-nums} body #winArena8 .a8card .ft b{font-family:var(--font-display);font-size:13px;color:#6e3f12}
body #winArena8 .a8card .stamp{position:absolute;right:5px;bottom:3px;width:34px;height:34px;border-radius:50%;opacity:.72;border:2px solid rgba(160,52,40,.72);box-shadow:inset 0 0 0 2px #efe2c0,inset 0 0 0 3.2px rgba(160,52,40,.55);color:rgba(160,52,40,.82);font:900 11.5px/30px var(--font-display);text-align:center;letter-spacing:.04em;transform:rotate(-14deg);pointer-events:none}
body #winArena8 .a8card.lock{background:#d8ccae;color:#5e4e3a} body #winArena8 .a8card.lock .ft{color:#8a3a2a} body #winArena8 .a8card.lock .ft svg{width:10px;height:11px;margin-right:4px;vertical-align:-1px}
body #winArena8 .a8card.sel{box-shadow:0 0 0 2px var(--ember),0 3px 12px rgba(0,0,0,.55),inset 0 0 16px rgba(120,80,30,.16)}
body #winArena8 .a8sel{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 14px;align-items:center;padding:9px 12px;border:1px solid var(--brass-dark);border-left:3px solid var(--brass);border-radius:5px;background:rgba(0,0,0,.25)}
body #winArena8 .a8sel h4{margin:0;font-family:var(--font-display);font-size:16px;letter-spacing:.05em} body #winArena8 .a8sel h4 small{margin-left:8px;font-family:var(--font-body);font-size:12px;font-weight:400;color:var(--ink-dim);letter-spacing:0}
body #winArena8 .a8sel p{margin:0;font-size:12px;line-height:1.55;color:var(--ink-dim)} body #winArena8 .a8sel p b{font-weight:600;color:var(--brass-light)} body #winArena8 .a8sel p .ic{width:14px;height:14px;vertical-align:-2px;margin:0 2px 0 6px}
body #winArena8 .a8btns{grid-row:1/4;grid-column:2;display:flex;flex-direction:column;gap:6px}
body #winArena8 .a8gaunt{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px 16px;align-items:center;padding:8px 16px;border-radius:5px;border:1px solid #2c2318;background:linear-gradient(rgba(58,50,40,.96),rgba(33,29,24,.96));box-shadow:inset 0 0 0 1px rgba(201,163,90,.38),inset 0 1px 0 rgba(255,230,180,.12),0 3px 10px rgba(0,0,0,.45)}
body #winArena8 .a8gaunt::before{content:"";position:absolute;inset:5px;pointer-events:none;background:radial-gradient(circle,#e8c47c 0 1.5px,#6b4f22 2.1px,transparent 2.7px) left top/7px 7px no-repeat,radial-gradient(circle,#e8c47c 0 1.5px,#6b4f22 2.1px,transparent 2.7px) right top/7px 7px no-repeat,radial-gradient(circle,#e8c47c 0 1.5px,#6b4f22 2.1px,transparent 2.7px) left bottom/7px 7px no-repeat,radial-gradient(circle,#e8c47c 0 1.5px,#6b4f22 2.1px,transparent 2.7px) right bottom/7px 7px no-repeat}
body #winArena8 .a8gaunt h4{margin:0;font-family:var(--font-display);font-size:19px;letter-spacing:.2em;color:var(--brass-light);white-space:nowrap} body #winArena8 .a8gaunt h4 small{display:block;margin-top:2px;font-family:var(--font-body);font-size:11.5px;letter-spacing:.06em;font-weight:400;color:var(--ink-dim)}
body #winArena8 .a8gaunt ul{list-style:none;margin:0;padding:0;font-size:12px;line-height:1.6;color:var(--ink)} body #winArena8 .a8gaunt li{position:relative;padding-left:12px} body #winArena8 .a8gaunt li::before{content:"";position:absolute;left:1px;top:7px;width:5px;height:5px;transform:rotate(45deg);background:var(--brass)}
body #winArena8 .a8gaunt .rec{text-align:right;white-space:nowrap} body #winArena8 .a8gaunt .rec small{display:block;font-size:11px;color:var(--ink-dim)} body #winArena8 .a8gaunt .rec b{font-family:var(--font-display);font-size:23px;color:var(--brass-light);font-variant-numeric:tabular-nums}
body #winArena8 .a8gaunt li svg{width:16px;height:16px;vertical-align:-3px;margin-right:4px}
body #winArena8 .a8gaunt .rec .s8btn{margin-left:10px;min-width:0;vertical-align:3px}

body .s8btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:128px;padding:5px 12px;border-radius:3px;font-size:13px;border:1px solid #3b2716;background:linear-gradient(#6e4e2e,#563a20);color:#f6ead0;box-shadow:inset 0 1px 0 rgba(255,225,170,.18),0 1px 3px rgba(0,0,0,.4);cursor:pointer}
body .s8btn.go{border-color:#b08a4a;background:linear-gradient(#8f6c33,#6a4e22);color:#fff4d8;font-weight:700}
body .s8btn small{font-size:11px;font-weight:400;opacity:.8}
body .s8btn:hover{filter:brightness(1.1)}
/* ---------- 改進（正式版）：列容器、蓋章不蓋字、尚未開放、可領天賦球 ---------- */
body #winArena8 .a8ledger{display:flex;flex-direction:column;gap:7px}
body #winArena8 .a8row{position:relative;display:grid;grid-template-columns:86px repeat(3,minmax(0,1fr));gap:7px}
body #winArena8 .a8row.closed .a8tier,body #winArena8 .a8row.closed .a8card{opacity:.34;filter:grayscale(.65);pointer-events:none}
body #winArena8 .a8row .a8soon{position:absolute;left:93px;right:0;top:50%;transform:translateY(-50%);z-index:2;display:flex;align-items:center;justify-content:center;gap:9px;margin:0 auto;width:max-content;max-width:calc(100% - 110px);padding:7px 16px;border-radius:4px;background:linear-gradient(rgba(58,50,40,.97),rgba(33,29,24,.97));box-shadow:inset 0 0 0 1px rgba(201,163,90,.55),0 3px 10px rgba(0,0,0,.55);font-size:13px;letter-spacing:.04em;color:var(--ink);pointer-events:none} body #winArena8 .a8soon b{font-family:var(--font-display);color:var(--brass-light);font-weight:600} body #winArena8 .a8soon svg{width:14px;height:15px}
body #winArena8 .a8row{--g:0} body #winArena8 .a8row.closed{min-height:70px}
body #winArena8 .a8card .hd,body #winArena8 .a8card .foe,body #winArena8 .a8card .cond,body #winArena8 .a8card .ft{position:relative;z-index:1}
body #winArena8 .a8card .stamp{z-index:0;right:4px;bottom:2px;width:31px;height:31px;font-size:10.5px;line-height:27px;opacity:.6;mix-blend-mode:multiply}
body #winArena8 .a8card.done .ft{min-height:27px;padding-right:32px;display:flex;align-items:center;gap:4px}
body #winArena8 .a8card .ft .ic{width:13px;height:13px;vertical-align:-2px}
body #winArena8 .a8card.sel{outline:0}
body #winArena8 .a8card .duo{flex:none}
body #winArena8 .a8tier.ready{cursor:pointer;border-left-color:#f0d79a;background:linear-gradient(rgba(125,92,34,.78),rgba(86,62,24,.82));box-shadow:0 0 0 1px rgba(240,215,154,.55),inset 0 0 12px rgba(240,215,154,.18)}
body #winArena8 .a8tier.ready:hover{background:linear-gradient(rgba(150,110,40,.85),rgba(104,76,30,.88))}
body #winArena8 .a8tier .go8{margin-top:3px;display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#fff1c4} body #winArena8 .a8tier .go8 .ic{width:17px;height:17px;flex:none}
body #winArena8 .a8tier.got small.fin{color:var(--ok,#8fd08a)}
body #winArena8 .a8sel .lk{margin-left:12px;font-size:12px;color:#d0a080} body #winArena8 .a8sel .lk svg{width:10px;height:11px;margin-right:4px;vertical-align:-1px}
body #winArena8 .s8btn.dim{opacity:.55;filter:saturate(.6)}
body #winArena8 .a8gaunt.closed{opacity:.55;filter:grayscale(.5)}
body #winArena8 .a8gaunt .pips{display:flex;gap:3px;margin-top:6px} body #winArena8 .a8gaunt .pips i{width:8px;height:8px;transform:rotate(45deg);border:1px solid var(--brass-dark);background:rgba(0,0,0,.4)} body #winArena8 .a8gaunt .pips i.on{background:var(--brass);border-color:var(--brass-light)}
body #winArena8 .a8gaunt .rec .duoGo{display:block;margin:5px 0 0 auto;border:0;background:none;padding:0;font-size:11.5px;color:var(--ink-dim);text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer} body #winArena8 .a8gaunt .rec .duoGo:hover{color:var(--brass-light)}
body #winArena8 .a8gaunt li.got{color:var(--ink-dim)}

/* ---------- 共用的小面板（天賦球、斷糧確認、結果卡） ---------- */
body .a8pan{position:fixed;left:50%;top:calc(50vh - 130px);transform:translateX(-50%);box-sizing:border-box;width:min(440px,calc(100vw - 32px));z-index:23;padding:14px 18px 14px;border-radius:7px;background:linear-gradient(#2a251d,#1f1b15);border:1px solid var(--brass-dark);border-top:2px solid var(--brass);box-shadow:0 12px 36px rgba(0,0,0,.62),inset 0 0 0 1px rgba(0,0,0,.5);color:var(--ink)}
body #arena8Orb,body #arena8Carry{box-shadow:0 0 0 100vmax rgba(8,6,3,.5),0 12px 36px rgba(0,0,0,.62),inset 0 0 0 1px rgba(0,0,0,.5)}
body .a8pan[hidden]{display:none}
body .a8pan h3{margin:0 0 2px;font-family:var(--font-display);font-size:18px;letter-spacing:.1em;color:var(--brass-light)}
body .a8pan .sub{margin:0 0 9px;font-size:12px;line-height:1.5;color:var(--ink-dim)}
body .a8pan .btns{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}
body .a8pan .btns .s8btn{min-width:110px}
body .a8pan .s8btn{padding:6px 14px}
body .a8pan .s8btn[disabled]{opacity:.5}
/* 天賦球三選一 */
body #arena8Orb{top:calc(50vh - 150px);width:min(470px,calc(100vw - 32px))}
body #arena8Orb .row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:0 12px;align-items:center;padding:7px 10px;margin-bottom:5px;border:1px solid var(--line);border-left:3px solid var(--brass-dark);border-radius:4px;background:rgba(0,0,0,.24);cursor:pointer}
body #arena8Orb .row:hover{background:rgba(201,163,90,.1)}
body #arena8Orb .row.on{border-color:var(--brass);border-left-color:var(--ember);background:rgba(201,163,90,.16);box-shadow:0 0 0 1px rgba(240,215,154,.35)}
body #arena8Orb .row .ic{width:40px;height:40px} body #arena8Orb .row b{display:block;font-family:var(--font-display);font-size:15px;letter-spacing:.05em} body #arena8Orb .row b em{margin-left:7px;font-style:normal;font-size:10.5px;padding:0 5px;border:1px solid var(--brass);border-radius:2px;color:var(--brass-light);letter-spacing:.1em}
body #arena8Orb .row span.d{display:block;font-size:12px;line-height:1.45;color:var(--ink-dim)}
body #arena8Orb .row i.dot{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--brass-dark);box-sizing:border-box} body #arena8Orb .row.on i.dot{border-color:var(--brass-light);background:radial-gradient(circle,#fff1c4 0 30%,#c9a35a 35%)}
body #arena8Orb .none{padding:10px 0 4px;font-size:13.5px;text-align:center;color:var(--ink)}
/* 斷糧確認 */
body #arena8Carry{width:min(500px,calc(100vw - 32px))} body #arena8Carry .btns .s8btn{white-space:nowrap}
body #arena8Carry .grid{display:flex;flex-wrap:wrap;gap:7px;margin:4px 0 2px}
body #arena8Carry .it{position:relative;display:flex;align-items:center;gap:6px;padding:4px 9px 4px 5px;border:1px solid var(--line);border-radius:4px;background:rgba(0,0,0,.26);font-size:12.5px} body #arena8Carry .it .ic{width:26px;height:26px} body #arena8Carry .it b{font-family:var(--font-display);font-size:14px;color:var(--brass-light);font-variant-numeric:tabular-nums}
body #arena8Carry .keep{margin:8px 0 0;font-size:12.5px;line-height:1.55;color:var(--ink)} body #arena8Carry .keep svg{width:17px;height:17px;vertical-align:-4px;margin-right:5px}
/* 結果卡（440×250 以內） */
body #arena8Result{top:calc(50vh - 125px);padding:0;max-height:250px;overflow:hidden;border-top-width:3px}
body #arena8Result .top{display:flex;align-items:center;gap:14px;padding:11px 18px 8px;border-bottom:1px solid var(--line);background:linear-gradient(rgba(201,163,90,.12),transparent)}
body #arena8Result .v{font:900 30px/1 var(--font-display);letter-spacing:.14em;color:var(--brass-light);text-shadow:0 2px 3px rgba(0,0,0,.6);white-space:nowrap}
body #arena8Result .v.no{color:#c4b9a2} body #arena8Result .v.draw{color:#d6d0bd}
body #arena8Result .who{min-width:0;margin-left:auto;text-align:right;font-size:12px;line-height:1.4;color:var(--ink-dim)} body #arena8Result .who b{display:block;font-family:var(--font-display);font-size:14.5px;letter-spacing:.05em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body #arena8Result .mid{padding:8px 18px 0}
body #arena8Result .why{margin:0 0 6px;font-size:12.5px;line-height:1.5;color:var(--ink)}
body #arena8Result .tms{display:flex;align-items:baseline;gap:18px;font-size:12px;color:var(--ink-dim)} body #arena8Result .tms b{font-family:var(--font-display);font-size:21px;color:var(--brass-light);margin-left:5px;font-variant-numeric:tabular-nums} body #arena8Result .tms em{margin-left:7px;font-style:normal;font-size:11px;padding:1px 6px;border-radius:2px;background:linear-gradient(#8f6c33,#6a4e22);color:#fff4d8;letter-spacing:.12em;vertical-align:3px}
body #arena8Result .rw{display:flex;flex-wrap:wrap;align-items:center;gap:3px 12px;margin-top:6px;font-size:12px;color:var(--ink-dim)} body #arena8Result .rw .ic{width:17px;height:17px;vertical-align:-4px;margin:0 2px 0 0} body #arena8Result .rw b{color:var(--brass-light);font-weight:600;font-variant-numeric:tabular-nums}
body #arena8Result .rw.hint{color:var(--brass-light)}
body #arena8Result .ret{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:5px;font-size:12px;color:var(--ink-dim)} body #arena8Result .ret .ic{width:22px;height:22px} body #arena8Result .ret span.i{display:inline-flex;align-items:center;gap:1px} body #arena8Result .ret span.i b{font-size:11.5px;color:var(--ink);margin-left:1px}
body #arena8Result svg{width:17px;height:17px;vertical-align:-4px;margin-right:3px} body #arena8Result .ic svg{width:100%;height:100%;margin:0;vertical-align:baseline}
body #arena8Result .pips{display:flex;justify-content:flex-end;gap:4px;margin-top:5px} body #arena8Result .pips i{width:9px;height:9px;transform:rotate(45deg);border:1px solid var(--brass-dark);background:rgba(0,0,0,.4)} body #arena8Result .pips i.on{background:var(--brass);border-color:var(--brass-light)}
body #arena8Result .hps{display:grid;grid-template-columns:42px minmax(0,1fr) 38px;align-items:center;gap:3px 8px;font-size:12px;color:var(--ink-dim)} body #arena8Result .hps .b{height:9px;border-radius:2px;background:rgba(0,0,0,.6);box-shadow:0 0 0 1px #2a2416,0 0 0 2px rgba(201,163,90,.3);overflow:hidden} body #arena8Result .hps .b i{display:block;height:100%;background:linear-gradient(#e47c64,#b4432f)} body #arena8Result .hps .b.me i{background:linear-gradient(#e8c47c,#b98a3c)} body #arena8Result .hps u{text-decoration:none;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}
body #arena8Result .rec8{margin-top:5px;font-size:11.5px;color:var(--ink-faint,#8d8472)} body #arena8Result .rec8 b{color:var(--brass-light);margin:0 1px 0 4px;font-family:var(--font-display)}
body #arena8Result .btns{margin:0;padding:8px 18px 11px}
`;

const NAME = { boar: '野豬', wolf: '灰狼', bear: '棕熊', tiger: '猛虎', bison: '野牛', python: '沼蟒', dog: '鬥犬', bull: '野牛', deer: '野鹿', croc: '鱷魚', ape: '猩猩', ibex: '岩羊' };
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const html = (t, c, h) => { const e = el(t, c); e.innerHTML = h; return e; };
const fmt = s => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmt1 = s => s == null ? '' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const num = n => Number(n || 0).toLocaleString('en-US');
const isOk = r => r === 'ok' || r === true;
const itemName = id => (ITEMS[id] || ITEMS06[id] || ITEMS07[id] || {}).name || id;
const tierOf = id => parseInt(String(id).split('-')[0], 10) || 1;

/* 0.8 X7（R6）：結果卡的 reason 是玩法的代號，玩家看到的換成中文；cond（條件沒達成）照最後一刻的條件面板說是哪一條 */
const REASON = { away: '離開畫面太久（10 秒以上沒有回應），這一場算沒過。', down: '倒下了。', leave: '你離開了沙地。', cancel: '組長那邊取消了這一場。', lost: '和組長的連線斷了，這一場算沒過。', time: '時間到了。' };
let lastCond = null;
function reasonText(r) {
  const k = r && r.reason; if (!k) return '這次沒有達成條件。';
  if (k === 'down') return r.kind === 'gauntlet' ? '倒下就結束；下次從第一波重新開始。' : (lastCond && lastCond.duo ? '兩個人都倒下了。' : '倒下了。');
  if (k === 'cond') { const L = lastCond && lastCond.id === r.id ? lastCond.cond : null, f = L && (L.find(c => c.fail) || L.find(c => !c.ok)); return f ? (f.fail ? `「${f.label}」沒守住。` : `「${f.label}」沒做到` + (f.m > 1 ? `（${f.n || 0} / ${f.m}）。` : '。')) : '條件沒有達成。'; }
  return REASON[k] || (/^[a-z_]+$/.test(k) ? '這次沒有達成條件。' : k);
}
let H, D, win, selId = null, sig = '', lastMode = {}, orbTier = 0, orbPick = null, resultT = 0, resHost = null;

/* ================= 初始化 ================= */
export function init(h, d) {
  H = h; D = d;
  if (document.getElementById('a8css')) return;
  const st = document.createElement('style'); st.id = 'a8css'; st.textContent = CSS; document.head.appendChild(st);
  win = el('section', 'win'); win.id = 'winArena8'; win.hidden = true; document.body.appendChild(win);
  win.addEventListener('click', e => { if (e.target.closest('.x')) H.setWin('arena8', false); });
  if (H.addWin) H.addWin('arena8', 'winArena8'); else if (H.WINS) H.WINS.arena8 = 'winArena8';
  H.addNpcOption('keeper', '戰績簿', () => openBook()); wrapChest(); setTimeout(wrapChest, 0);
  if (D.on) D.on('result', r => { try { showResult(r); } catch (e) { console.error('ui08a result', e); } });
  H.onTick(dt => {
    if (!win.hidden) { sig2 = (sig2 + dt); if (sig2 > 0.4) { sig2 = 0; const s = signature(); if (s !== sig) render(); } }
    if (resHost && !resHost.hidden && resultT > 0 && (resultT -= dt) <= 0) hideResult();
    { const st = D.trialState && D.trialState(); if (st && st.phase !== 'done' && Array.isArray(st.cond)) lastCond = { id: st.id, cond: st.cond, duo: !!st.partner }; }      /* 結果卡用：最後一刻的條件 */
  });
}
let sig2 = 0;
const signature = () => { try { return JSON.stringify([D.trials(), D.tiers(), D.gauntlet(), D.duelRec(), D.partner()]); } catch (e) { return ''; } };

export function openBook(id) { if (id) selId = id; H.setWin('arena8', true); render(); }

/* ================= ① 戰績簿 ================= */
function render() {
  sig = signature();
  const T = D.trials(), Ti = D.tiers(), g = D.gauntlet(), p = D.partner(), r = D.duelRec();
  if (!selId || !T.find(x => x.id === selId)) { const can = x => !x.lock && Ti[x.tier - 1]?.open !== false; const x = T.find(x => can(x) && !x.cleared) || T.find(can) || T.find(x => !x.cleared && Ti[x.tier - 1]?.open !== false) || T[0]; selId = x && x.id; }      /* 0.8 X7（R6）：預設選能玩的（沒上鎖、這一級有開）而且還沒過的那一個 */
  const keepScroll = win.querySelector('.body')?.scrollTop || 0;
  win.textContent = '';
  const hd = el('header'); hd.append(html('span', 'hic', BOOK), html('h2', '', '戰績簿<small>競技場記錄官 巴索</small>'));
  hd.append(html('span', 'a8duel', `對決<b>${r.win}</b>勝<b>${r.lose}</b>負<b>${r.draw}</b>平`));
  const x = el('button', 'x', '×'); x.setAttribute('data-close', ''); hd.append(x);
  const body = el('div', 'body');
  body.append(el('p', 'a8rule', '每個試煉第一次過關有一份獎勵，之後只記你的最佳時間。沒有期限，隨時可以再來。'));
  const L = el('div', 'a8ledger'); let k = 0;
  for (const t of Ti) {
    const open = t.open !== false, row = el('div', 'a8row' + (open ? '' : ' closed'));
    const orb0 = t.orb || (t.done >= t.need ? 'ready' : 'locked'), orb = orb0 === 'ready' && !(D.orbChoices(t.tier) || []).length ? 'all' : orb0;      /* 0.8 X7（R6）：三個都過、但一般天賦球都學會了＝沒有球可領（all） */
    const tl = el('div', 'a8tier' + (orb === 'ready' ? ' ready' : orb === 'claimed' || orb === 'all' ? ' got' : '')); tl.append(el('b', '', t.name), el('small', '', `建議 ${t.lv} 級`));
    const o = el('div', 'a8orb'); for (let i = 0; i < t.need; i++) o.append(el('i', i < t.done || orb !== 'locked' ? 'on' : '')); tl.append(o);
    if (orb === 'ready') {
      tl.append(html('div', 'go8', '<span class="ic"></span>可以領了'), el('small', '', '點一下領取'));
      tl.querySelector('.go8 .ic').replaceWith(H.ic('orb_' + (D.orbChoices(t.tier)[0] || 'dash')));
      tl.addEventListener('click', () => openOrb(t.tier));
    } else if (orb === 'claimed') tl.append(el('small', 'fin', '天賦球已領'), el('small', '', '天賦球三選一'));
    else if (orb === 'all') { tl.append(el('small', 'fin', '三個都過了'), el('small', '', '一般天賦球你都學會了')); tl.title = '這一級的天賦球三選一裡，一般天賦球你都已經有了，沒有新的可以領。'; }
    else tl.append(el('small', '', '三個都過'), el('small', '', '天賦球三選一'));
    row.append(tl);
    for (const q of T.filter(q => q.tier === t.tier)) {
      const c = el('div', 'a8card' + (q.lock ? ' lock' : '') + (q.cleared ? ' done' : '') + (q.id === selId ? ' sel' : '')); c.style.setProperty('--tilt', [-0.5, 0.3, -0.2, 0.45, -0.35, 0.2, 0.35, -0.45, 0.15][k++ % 9] + 'deg');
      const h = el('div', 'hd'); h.append(el('span', 'id', q.id), el('b', '', q.name)); if (q.mode === 'duo') h.append(el('span', 'duo', '兩人組'));
      const f = el('div', 'foe'); for (const fo of q.foes) { f.insertAdjacentHTML('beforeend', silSvg(fo.type)); f.append(el('span', '', `${NAME[fo.type] || fo.type}×${fo.n}`)); } f.append(el('span', '', `Lv${q.foes[0].lv}`));
      const ft = el('div', 'ft');
      if (q.lock) ft.innerHTML = LOCK + q.lock; else if (q.cleared) ft.innerHTML = `最佳 <b>${fmt(q.best)}</b>`; else ft.textContent = `第一次過關：金幣 ${q.reward.gold}`;
      c.append(h, f, el('div', 'cond', q.cond), ft); if (q.cleared) c.append(el('span', 'stamp', '過關'));
      c.addEventListener('click', () => { selId = q.id; render(); });
      row.append(c);
    }
    if (!open) row.append(html('div', 'a8soon', LOCK + '<span><b>巴索：</b>這一級還在整理，晚一點再來。</span>'));
    L.append(row);
  }
  body.append(L);
  const s = T.find(x => x.id === selId), sel = el('div', 'a8sel'), tOpen = Ti[s.tier - 1]?.open !== false;
  const duoBlocked = s.mode === 'duo' && !p, block = !tOpen || (s.lock && !(s.mode === 'duo' && p));
  sel.append(html('h4', '', `${s.id}　${s.name}<small>${s.foes.map(f => (NAME[f.type] || f.type) + '×' + f.n).join('、')}　Lv${s.foes[0].lv}</small>`));
  sel.append(html('p', '', `條件：<b>${s.cond}</b>`));
  const why = !tOpen ? '這一級還在整理，還不能挑戰' : (s.lock && !(s.mode === 'duo' && p)) ? s.lock : '';
  sel.append(html('p', '', (s.cleared ? `最佳 <b>${fmt1(s.best)}</b>　第一次的獎勵已領過` : `第一次過關：經驗 <b>${num(s.reward.exp)}</b>${H.ic('gold').outerHTML}<b>${num(s.reward.gold)}</b>`) + (why ? `<span class="lk">${LOCK}${why}</span>` : s.cleared ? '' : '　還沒過關')));
  const bt = el('div', 'a8btns');
  if (s.mode !== 'duo') { const b = el('button', 's8btn go' + (block ? ' dim' : ''), '單人挑戰'); b.onclick = () => begin('trial', s.id, 'solo'); bt.append(b); }
  else { const b = el('button', 's8btn dim', '單人挑戰<small>要兩人組</small>'); b.innerHTML = '單人挑戰<small>要兩人組</small>'; b.onclick = () => H.toast('這個試煉要兩人組才能打'); bt.append(b); }
  if (s.mode !== 'solo') { const b = html('button', 's8btn' + (s.mode === 'duo' ? ' go' : '') + (block || !p ? ' dim' : ''), p ? `和 ${p.name} 一起<small>Lv${p.lv}・${p.near === false ? '不在附近' : '在附近'}</small>` : '和隊友一起<small>附近沒有隊友</small>'); b.onclick = () => begin('trial', s.id, 'duo'); bt.append(b); }
  sel.append(bt); body.append(sel);
  // 百場連戰鐵牌
  const open = g.open !== false, G = el('div', 'a8gaunt' + (open ? '' : ' closed'));
  const gh = html('h4', '', `百場連戰<small>${g.waves} 波・波間休息 15 秒</small>`); G.append(gh);
  G.append(html('ul', '', `<li>斷糧：藥水與料理交給巴索代管，出場自動還你</li><li>倒下就結束；單人或兩人都行（兩人時每隻野獸血量較厚）</li><li class="${g.boxClaimed ? 'got' : ''}">${BOX}${g.boxClaimed ? '稀有天賦球箱已領過（每個角色一次）' : '第一次打完十波：稀有天賦球箱（每個角色一次）'}</li>`));
  const rec = el('div', 'rec'); rec.append(html('small', '', open ? '你最遠打到' : '還在整理'));
  if (open) {
    rec.insertAdjacentHTML('beforeend', `第 <b>${g.best || 0}</b> 波`); const b = el('button', 's8btn go', '挑戰'); b.onclick = () => startGauntlet(); rec.append(b);
  } else rec.insertAdjacentHTML('beforeend', '<b>—</b>');
  G.append(rec); body.append(G);
  win.append(hd, body); body.scrollTop = keepScroll; return win;
}

export function book(id) { openBook(id); return win; }

function begin(kind, id, mode) {
  lastMode[id] = mode;
  const r = D.start(kind, id, mode);
  if (isOk(r)) { H.setWin('arena8', false); hideResult(); return true; }
  H.toast(typeof r === 'string' ? r : '現在不能開始'); return false;
}

/* ================= 天賦球三選一 ================= */
const orbCode = c => String(c).replace(/^orb_/, '');
function orbInfo(c) {
  const S = SKILLS[orbCode(c)] || {}; const d = (S.desc || '').split('。')[0];
  return { name: S.name || orbCode(c), desc: d ? d + '。' : '', rare: !!S.rare };
}
export function openOrb(tier) {
  let ch = []; try { ch = D.orbChoices(tier) || []; } catch (e) { }
  orbTier = tier; orbPick = null;
  let p = document.getElementById('arena8Orb'); if (!p) { p = el('div', 'a8pan'); p.id = 'arena8Orb'; document.body.appendChild(p); }
  p.hidden = false; p.textContent = '';
  const nm = (D.tiers()[tier - 1] || {}).name || `第${tier}級`;
  p.append(el('h3', '', `${nm}　天賦球三選一`));
  const btns = el('div', 'btns');
  if (!ch.length) {
    p.append(el('p', 'sub', '三個試煉都過了。'), el('div', 'none', '這一級的球你都有了。'));
    const b = el('button', 's8btn go', '知道了'); b.onclick = () => closeOrb(); btns.append(b);
  } else {
    p.append(el('p', 'sub', '三個試煉都過了，巴索讓你挑一顆。只能領一顆，挑好再按「領這一顆」。'));
    const rows = [];
    const ok = el('button', 's8btn go', '領這一顆'); ok.disabled = true;
    for (const c of ch) {
      const i = orbInfo(c), row = el('div', 'row'); row.append(H.ic('orb_' + orbCode(c)), html('div', '', `<b>${i.name}${i.rare ? '<em>稀有</em>' : ''}</b><span class="d">${i.desc}</span>`), el('i', 'dot'));
      row.onclick = () => { orbPick = orbCode(c); rows.forEach(r => r.classList.toggle('on', r === row)); ok.disabled = false; };
      rows.push(row); p.append(row);
    }
    ok.onclick = () => {
      if (!orbPick) return; const r = D.claimOrb(orbTier, orbPick);
      if (isOk(r)) { H.toast(`領到了「${orbInfo(orbPick).name}」天賦球`); closeOrb(); render(); } else H.toast(typeof r === 'string' ? r.replace(/（[^）]*由數值定）/, '') : '現在領不了');
    };
    const no = el('button', 's8btn', '再想想'); no.onclick = () => closeOrb(); btns.append(no, ok);
  }
  p.append(btns); return p;
}
/* ================= 稀有天賦球箱：三顆都有了 → 自己挑一顆（製作人 11/17；邏輯在 num08.openChest(id, want)，這裡只包一層挑選框） ================= */
const RARE8 = ['warcry', 'quake', 'blink'];
function wrapChest() {
  const it = ITEMS.chest_rare; if (!it || !it.open8 || it.open8.ui8) return;
  const orig = it.open8, wrap = (id = 'chest_rare') => {
    const orbs = RARE8.filter(k => SKILLS[k] && ITEMS['orb_' + k]), has = k => P.skills.includes(k) || P.inv['orb_' + k] > 0;
    if (!orbs.length || orbs.some(k => !has(k)) || !(P.inv[id] > 0)) return orig(id);      /* 還有沒拿到的：照舊隨機給一顆 */
    chestPick(id, orbs, orig); return true;
  }; wrap.ui8 = 1; it.open8 = wrap;
}
export function chestPick(id, orbs, orig) {
  let p = document.getElementById('arena8Orb'); if (!p) { p = el('div', 'a8pan'); p.id = 'arena8Orb'; document.body.appendChild(p); }
  p.hidden = false; p.textContent = ''; let pick = null;
  p.append(el('h3', '', '稀有天賦球箱　自己挑一顆'), el('p', 'sub', '戰吼、震地踏、影步你都有了。挑一顆你想多留一顆的（可以交易或送人）。'));
  const ok = el('button', 's8btn go', '拿這一顆'); ok.disabled = true; const rows = [];
  for (const c of orbs) { const i = orbInfo(c), row = el('div', 'row'), n = P.inv['orb_' + c] || 0; row.append(H.ic('orb_' + c), html('div', '', `<b>${i.name}<em>稀有</em></b><span class="d">${P.skills.includes(c) ? '已學會' : ''}${n ? `${P.skills.includes(c) ? '・' : ''}背包裡有 ${n} 顆` : ''}</span>`), el('i', 'dot'));
    row.onclick = () => { pick = c; rows.forEach(r => r.classList.toggle('on', r === row)); ok.disabled = false; }; rows.push(row); p.append(row); }
  const btns = el('div', 'btns'), no = el('button', 's8btn', '先不開'); no.onclick = () => closeOrb();
  ok.onclick = () => { if (!pick) return; closeOrb(); orig(id, pick); }; btns.append(no, ok); p.append(btns); return p;
}
export function closeOrb() { const p = document.getElementById('arena8Orb'); if (p) p.hidden = true; }

/* ================= 百場連戰：斷糧確認 ================= */
function startGauntlet(mode) {
  let list = []; try { list = (D.carry() || []).filter(x => x && x.n > 0); } catch (e) { }
  const p = D.partner();
  if (!list.length && !(p && !mode)) { begin('gauntlet', 'g100', mode || 'solo'); return; }      // 沒東西要代管、也沒有隊友可選：直接開始
  carryConfirm(list, mode);
}
export function carryConfirm(list = D.carry(), mode) {
  let p = document.getElementById('arena8Carry'); if (!p) { p = el('div', 'a8pan'); p.id = 'arena8Carry'; document.body.appendChild(p); }
  p.hidden = false; p.textContent = '';
  const pt = D.partner();
  p.append(el('h3', '', list.length ? '斷糧挑戰' : '百場連戰'), el('p', 'sub', list.length ? '百場連戰不能喝藥、不能吃料理。下面這些先交給巴索代管。' : '單人或兩人都行；兩人一起時每隻野獸的血量較厚。'));
  const g = el('div', 'grid'); for (const x of list) { const it = el('span', 'it'); it.append(H.ic(x.id), html('span', '', `${itemName(x.id)}<b>×${x.n}</b>`)); g.append(it); } p.append(g);
  if (list.length) p.append(html('p', 'keep', GATE_ICON + '出場時（過關、倒下、離開都一樣）自動全部還給你，一個都不少。'));
  const btns = el('div', 'btns'), no = el('button', 's8btn', '先不要'), pre = list.length ? '交給巴索，' : '';
  no.onclick = () => { p.hidden = true; }; btns.append(no);
  const mk = (t, m, go) => { const b = el('button', 's8btn' + (go ? ' go' : ''), t); b.onclick = () => { p.hidden = true; begin('gauntlet', 'g100', m); }; btns.append(b); };
  if (mode) mk(pre + (mode === 'duo' && pt ? `和 ${pt.name} 開始` : '開始'), mode, true);
  else { mk(pre + '單人開始', 'solo', !pt); if (pt) mk(pre + `和 ${pt.name} 開始`, 'duo', true); }
  p.append(btns); return p;
}
const GATE_ICON = BOX;

/* ================= 結果卡 ================= */
function host() { if (!resHost) { resHost = el('div', 'a8pan'); resHost.id = 'arena8Result'; resHost.hidden = true; document.body.appendChild(resHost); } return resHost; }
export function hideResult() { if (resHost) resHost.hidden = true; resultT = 0; H.onBodyClass('arena8-card', false); }
const rewardLine = (rw, first) => {
  const bits = [];
  if (rw && rw.exp) bits.push(`經驗 <b>${num(rw.exp)}</b>`);
  if (rw && rw.gold) bits.push(`${H.ic('gold').outerHTML}<b>${num(rw.gold)}</b>`);
  if (rw && rw.box) bits.push(`${BOX}稀有天賦球箱 <b>×1</b>`);
  if (rw && rw.orb) bits.push(`天賦球 <b>${orbInfo(rw.orb).name}</b>`);
  return bits.length ? `<div class="rw">${first ? '第一次過關：' : ''}${bits.join('')}</div>` : '';
};
const retLine = ret => { if (!ret || !ret.length) return ''; const s = el('div', 'ret'); s.append(el('span', '', '代管的東西已經還給你')); for (const x of ret) { const i = el('span', 'i'); i.append(H.ic(x.id), el('b', '', '×' + x.n)); s.append(i); } return s.outerHTML; };

export function showResult(r) {
  if (!r) return; const h = host(); h.textContent = ''; if (!win.hidden) H.setWin('arena8', false);
  const kind = r.kind || (r.res ? 'duel' : 'trial'); closeOrb();
  if (kind === 'duel') duelCard(h, r); else if (kind === 'gauntlet') gauntletCard(h, r); else trialCard(h, r);
  h.hidden = false; H.onBodyClass('arena8-card', true);
  resultT = kind === 'duel' ? 25 : 0; return h;
}
const top = (cls, v, who, sub) => html('div', 'top', `<span class="v ${cls}">${v}</span><span class="who"><b>${who}</b>${sub}</span>`);

function trialCard(h, r) {
  const T = D.trials().find(x => x.id === r.id) || { name: '', cond: '' }, ok = !!r.ok, tier = tierOf(r.id), ti = D.tiers()[tier - 1] || {};
  h.append(top(ok ? '' : 'no', ok ? '過關' : '沒過', `${r.id}　${T.name}`, T.cond || ''));
  const m = el('div', 'mid');
  if (!ok) m.append(el('p', 'why', reasonText(r)));
  let tm = ''; if (r.time != null) tm += `<span>這次<b>${fmt1(r.time)}</b></span>`;
  if (r.best != null) tm += `<span>最佳<b>${fmt1(r.best)}</b>${r.newBest ? '<em>新紀錄</em>' : ''}</span>`;
  if (tm) m.append(html('div', 'tms', tm));
  if (ok && r.reward) m.insertAdjacentHTML('beforeend', rewardLine(r.reward, true));
  if (ok && ti.orb === 'ready') { const hn = html('div', 'rw hint', '<span class="ic"></span>這一級三個都過了——到巴索那裡領天賦球三選一'); hn.querySelector('.ic').replaceWith(H.ic('orb_' + (D.orbChoices(tier)[0] || 'dash'))); m.append(hn); }
  h.append(m); const btns = el('div', 'btns');
  const again = el('button', 's8btn go', '再來一次'), out = el('button', 's8btn', '離開沙地');
  again.onclick = () => { if (begin('trial', r.id, lastMode[r.id] || (T.mode === 'duo' ? 'duo' : 'solo'))) hideResult(); };
  out.onclick = () => leave(); btns.append(out, again); h.append(btns);
}
function gauntletCard(h, r) {
  const ok = !!r.ok, w = r.wave || 0, W = r.waves || 10;
  let pips = ''; for (let i = 0; i < W; i++) pips += `<i class="${i < (ok ? W : Math.max(0, w - 1)) ? 'on' : ''}"></i>`;
  h.append(top(ok ? '' : 'no', ok ? '十波全過' : '倒下了', '百場連戰', `<div class="pips">${pips}</div>`));
  const m = el('div', 'mid');
  m.append(html('div', 'tms', `<span>${ok ? '這次' : '倒在'}<b>第 ${ok ? W : w} 波</b></span>${r.best ? `<span>最遠<b>第 ${r.best} 波</b>${r.newBest ? '<em>新紀錄</em>' : ''}</span>` : ''}${r.time != null ? `<span>用時<b>${fmt(r.time)}</b></span>` : ''}`));
  if (!ok && r.reason) m.append(el('p', 'why', reasonText(r)));
  if (r.reward && (r.reward.box || r.reward.gold || r.reward.exp)) m.insertAdjacentHTML('beforeend', rewardLine(r.reward, true));
  m.insertAdjacentHTML('beforeend', retLine(r.returned)); h.append(m);
  const btns = el('div', 'btns'), again = el('button', 's8btn go', '再來一次'), out = el('button', 's8btn', '離開沙地');
  again.onclick = () => { hideResult(); startGauntlet(lastMode.g100 || 'solo'); }; out.onclick = () => leave(); btns.append(out, again); h.append(btns);
}
function duelCard(h, r) {
  const res = r.res || 'draw', vs = r.vs || {}, name = vs.name || '對手', hp = r.hpPct || [Math.round((r.me?.hp01 ?? 0) * 100), Math.round((vs.hp01 ?? 0) * 100)];
  const W = { win: '勝', lose: '負', draw: '平手' }[res] || '平手';
  const why = {
    win: { down: `${name} 先倒下了`, time: '時間到，你的剩餘生命比較多', leave: `${name} 離開了沙地`, drop: `${name} 斷線了` },
    lose: { down: '你先倒下了', time: '時間到，對手的剩餘生命比較多', leave: '你離開了沙地', drop: '連線中斷' },
    draw: { down: '兩人幾乎同時倒下（相差不到 0.5 秒），算平手', time: '時間到，剩餘生命一樣多，算平手', leave: '兩人都離開了沙地', drop: '連線中斷，算平手' },
  }[res][r.by] || '';
  h.append(top(res === 'win' ? '' : res === 'lose' ? 'no' : 'draw', W, `對決　${name}`, vs.lv ? `Lv${vs.lv}` : ''));
  const m = el('div', 'mid'); m.append(el('p', 'why', why));
  m.append(html('div', 'hps', `<span>你</span><span class="b me"><i style="width:${Math.max(0, Math.min(100, hp[0]))}%"></i></span><u>${hp[0]}%</u><span>${name}</span><span class="b"><i style="width:${Math.max(0, Math.min(100, hp[1]))}%"></i></span><u>${hp[1]}%</u>`));
  try { const rc = D.duelRec(); m.append(html('div', 'rec8', `戰績　<b>${rc.win}</b>勝<b>${rc.lose}</b>負<b>${rc.draw}</b>平`)); } catch (e) { }
  h.append(m); const btns = el('div', 'btns'), ok = el('button', 's8btn go', '知道了'); ok.onclick = () => hideResult(); btns.append(ok); h.append(btns);
}
function leave() { try { D.leaveSand && D.leaveSand(); } catch (e) { } hideResult(); }
