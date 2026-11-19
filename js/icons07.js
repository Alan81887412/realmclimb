// 0.7 新物品與介面的圖示（程式畫的 SVG，40×40）。畫法和 icons06／ui.js 一致：大塊面、深色描邊、一道高光
// 介面（照 BRIEF-0.7-w1）：icon07(id, size) → data URL｜icon07Svg(id, size) → SVG 字串｜has07(id)｜icon07Canvas(id, size)｜ICON07_IDS
// 形狀語言：魚＝同一個「頭朝右的魚」輪廓換顏色與花紋（主＝背後一個金色圓、加上牠的特徵：白鬚／王冠／冰晶）｜釣竿＝同一支竿斜放、逐階換材質＋右下角階數菱形（跟武器階級一樣）｜
//           魚料理＝冒熱氣（和 0.6 的料理同一種木碗、木盤）｜藥劑＝方肩長瓶（和 0.6 的藥劑同一種瓶子）｜地圖＝羊皮紙｜委託卡的六種＝同一張釘在板上的紙、換中間的符號
const IK = '#1c140c', IO = `stroke="${IK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`, CR = '#fff3d6';
const ln = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const out = (d, col, w) => ln(d, IK, w + 2.6) + ln(d, col, w);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${IO} ${extra}/>`;                 // 有描邊的色塊
const F = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;                        // 沒描邊的色塊（陰影、花紋）
const C = (x, y, r, fill, o = true) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${o ? IO : ''}/>`;
const E = (x, y, rx, ry, fill, rot = 0, o = true) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${rot ? `transform="rotate(${rot} ${x} ${y})"` : ''} ${o ? IO : ''}/>`;
const HL = (d, w = 1.7, op = 0.75) => ln(d, '#fff', w, `opacity="${op}"`);                           // 高光
const STEAM = ln('M13.500 9.500c-2-2 2-3.500 0-6M20 8c-2-2 2-3.500 0-6M26.500 9.500c-2-2 2-3.500 0-6', '#fff', 1.5, 'opacity=".75"');
const BOWL = (top, extra = '') => P('M4.500 19.500h31c0 9-6.500 15-15.500 15s-15.500-6-15.500-15z', '#8a5a36') + F('M20 34.500c9 0 15.500-6 15.500-15h-5c0 7-4 12-10.500 15z', IK, 'opacity=".25"') + E(20, 19.5, 15.5, 4.6, top) + extra;
const BOTTLE = (liq, mark) => P('M15.500 9.500h9v4l4.500 4.500v15c0 1.700-1.300 3-3 3h-12c-1.700 0-3-1.300-3-3v-15l4.500-4.500z', '#dfeaec') + F('M12.600 21.500q3.700 1.800 7.400 0t7.400 0v11.500c0 .9-.7 1.600-1.600 1.600h-11.600c-.9 0-1.600-.7-1.600-1.600z', liq) + `<rect x="14.300" y="4" width="11.400" height="6" rx="1.500" fill="#b07c44" ${IO}/><rect x="14.500" y="23.500" width="11" height="8.500" rx="1" fill="#f3ead4" stroke="${IK}" stroke-width="1.200"/>` + mark + HL('M14 19.500v-1l2-2', 1.6, 0.7);
const CHARM = piece => ln('M20 9v5', '#8a5a36', 1.8) + `<circle cx="20" cy="6" r="3.300" fill="none" stroke="${IK}" stroke-width="3.600"/><circle cx="20" cy="6" r="3.300" fill="none" stroke="#f2c54a" stroke-width="1.700"/>` + piece + C(20, 14.2, 2.7, '#d9483a') + C(19.2, 13.4, 0.8, '#fff', false);
const SPARK = (x, y, s, col = '#fff3b0') => `<path d="M${x} ${y - s}l${s * 0.28} ${s * 0.72} ${s * 0.72} ${s * 0.28}-${s * 0.72} ${s * 0.28}-${s * 0.28} ${s * 0.72}-${s * 0.28}-${s * 0.72}-${s * 0.72}-${s * 0.28} ${s * 0.72}-${s * 0.28}z" fill="${col}" stroke="${IK}" stroke-width="1" stroke-linejoin="round"/>`;
const PIPS = n => Array.from({ length: n }, (_, i) => `<path d="M${35.5 - i * 5.2} 31.500l2.300 2.800-2.300 2.800-2.300-2.800z" fill="#f2c54a" stroke="${IK}" stroke-width="1.100" stroke-linejoin="round"/>`).join('');
// ---- 魚：頭朝右，身體、背、腹、鰭、眼睛（大眼、壓低的眉＝和 3D 的魚一樣有脾氣）；pat 是畫在身上的花紋（在身體的剪裁範圍內） ----
const BODY = 'M8 20.500c3-6.500 11-9.500 19-8c4 .8 7 3.200 9 6.500c-2 3.300-5 5.700-9 6.500c-8 1.500-16-1.500-19-5z';
let clipN = 0;
const FISH = o => { const id = 'fc' + (clipN++), sc = o.scale || 1, tf = `<g transform="translate(20 22.500) scale(${sc}) translate(-20 -20)">`;      // 魚的輪廓在 y 8–26，往下移一點置中
  return (o.disc ? `<circle cx="20" cy="20" r="17.500" fill="${o.disc}" opacity=".55"/>` : '') + tf
    + P(o.tail || 'M9.500 20.500L2.500 13c1.300 4.800 1.300 10 0 15z', o.fin) + P(o.dorsal || 'M15 13.300c2-4 6-5.500 10-5c-1 2-1.500 3.500-1 5z', o.fin) + (o.pre || '')
    + `<clipPath id="${id}"><path d="${BODY}"/></clipPath>` + P(BODY, o.side)
    + `<g clip-path="url(#${id})">` + F('M6 18c4-6 14-9 30-1v-9h-30z', o.back) + F('M6 23c6 3 18 4 30-2v12h-30z', o.belly) + (o.pat || '') + '</g>'
    + `<path d="${BODY}" fill="none" ${IO}/>` + P('M23.500 21c-1 2.500-3 4-5.500 4.500c1-2 1.500-3.500 1-5z', o.fin)
    + ln('M27 15c-1.500 3-1.500 7 0 10', IK, 1.2, 'opacity=".45"') + C(30.400, 18, 2.600, o.eye || '#f2c54a') + C(30.800, 18.300, 1.300, IK, false) + C(29.900, 17.200, .6, '#fff', false) + ln('M27.800 14.700l4.800 1.300', IK, 1.7) + ln('M35.700 20.700l-2.200.5', IK, 1.2)
    + HL('M14 15.500c3-1.800 6-2.400 9-2.200', 1.6, 0.6) + (o.post || '') + '</g>'; };
const dotsP = (pts, r, col, op = 1) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}"/>`).join('');
const SCALES = col => Array.from({ length: 12 }, (_, i) => { const x = 11 + (i % 6) * 3.4, y = 16 + Math.floor(i / 6) * 4 + (i % 2) * 1.5; return `<path d="M${x} ${y}a2.200 2.200 0 0 1 0 4.400" fill="none" stroke="${col}" stroke-width="1"/>`; }).join('');
const BARS = col => [12, 16.500, 21, 25.500].map(x => `<path d="M${x} 10c-1 5-1 9 .5 13" fill="none" stroke="${col}" stroke-width="2.300"/>`).join('');
const BAND = col => F('M8 20.500c8 1.500 18 1.500 28-1.500v2.300c-10 2.800-20 2.800-28 1z', col);
const WHISK = (col = '#2a2e1a', long = 1) => ln(`M34.500 21.500c2 1.500 2.500 ${3 * long} 1.500 ${5 * long}M33 22.500c.5 2 0 ${4 * long}-1.500 ${5.500 * long}`, col, 1.1);
const MOTTLE = (c1, c2) => dotsP([[12, 16], [17, 14.500], [22, 16], [27, 14], [14, 21], [20, 20], [25, 22]], 2.200, c1, 0.75) + dotsP([[15, 18], [24, 18.500], [19, 23]], 1.600, c2, 0.7);
const F07 = {
  fish_crucian: FISH({ side: '#c9a54c', back: '#55603a', belly: '#f3e8c6', fin: '#d08a44', pat: SCALES('#7a5a24') }),
  fish_startrout: FISH({ side: '#8aa8c0', back: '#1d3a56', belly: '#eef2f0', fin: '#4a6a88', eye: '#e8e0a0', pat: BAND('#d6789a') + dotsP([[13, 15], [18, 13.500], [23, 15], [28, 13.500], [16, 18], [21, 17.500]], .95, '#fff3a0'), post: SPARK(9, 9, 2.6) }),
  fish_catfish: FISH({ side: '#6a753c', back: '#343c22', belly: '#cfc49c', fin: '#4a5030', eye: '#d8c040', pat: MOTTLE('#1e2414', '#8a9a48'), post: WHISK() }),
  fish_loach: FISH({ scale: 0.9, side: '#97784a', back: '#5a4228', belly: '#e0d0a6', fin: '#8a6a40', tail: 'M9.500 20.500c-3-3-6-3-7.500-1c1.500 2.500 4.500 3 7.500 1z', dorsal: 'M17 13.500c1.500-2.500 4-3 6-2.700c-.6 1-.8 2-.6 3z', pat: dotsP([[13, 19], [17, 18.500], [21, 19], [25, 18.500], [15, 22], [22, 22]], 1.1, '#d6ff5a'), post: WHISK('#8a6a40', 0.5) + SPARK(9, 10, 2.4, '#e8ff9a') }),
  fish_perch: FISH({ side: '#a8b84c', back: '#34502a', belly: '#f0ead0', fin: '#e8562a', dorsal: 'M13 13.500l1-5.500 2 3 1.500-3.500 1.500 3 2-3.500 1 3 2-2.500v6z', eye: '#f2a020', pat: BARS('#22301a') }),
  fish_carp: FISH({ side: '#d9a23c', back: '#6a4a1e', belly: '#f4e2b2', fin: '#e6803e', dorsal: 'M12 13.300c1-3.500 4-5 12-5c-.5 2-.5 3.500 0 5z', pat: SCALES('#8a5418') + SCALES('#8a5418').replace(/M(\d+\.?\d*) (\d+\.?\d*)/g, (m, x, y) => `M${+x + 1.7} ${+y - 3.5}`), post: WHISK('#d89a50', 0.6) }),
  fish_falltrout: FISH({ side: '#bcc6a8', back: '#2c4a38', belly: '#f6f0e0', fin: '#7a8a68', pat: BAND('#e0587a') + ln('M12 14c1 2 2 2 3 0s2-2 3 0 2 2 3 0 2-2 3 0', '#d8e0c0', 1.1) + dotsP([[14, 17.500], [19, 17], [24, 17.500], [29, 16.500]], .8, '#16201a') }),
  fish_stonecarp: FISH({ side: '#8c8e8a', back: '#45484a', belly: '#d2cec2', fin: '#6a6c6e', dorsal: 'M12 13.300c1-3.500 4-5 12-5c-.5 2-.5 3.500 0 5z', eye: '#e0b040', pat: SCALES('#2c2e30') + dotsP([[13, 15], [16, 19], [20, 14.500], [23, 20], [26, 16], [18, 22], [29, 19]], .7, '#2a2c2e') + dotsP([[15, 16], [22, 17], [25, 21]], .6, '#d8d8d0') }),
  fish_frosttrout: FISH({ side: '#c6dcec', back: '#355a7e', belly: '#fafcff', fin: '#b8d4ea', eye: '#c8f0ff', pat: BAND('#9ad0f0') + dotsP([[13, 15], [18, 13.800], [23, 15], [28, 13.800]], .9, '#2a4a70'), post: SPARK(8, 9, 2.4, '#eaffff') }),
  fish_boss_beard: FISH({ disc: '#f2c54a', side: '#4a4536', back: '#26241e', belly: '#a89c80', fin: '#3a382c', eye: '#ffb020', pat: MOTTLE('#14120c', '#4e6a2a'), post: ln('M34 21.500c3 2 4 6 1 10M33 22.500c.5 3 0 7-3 9M31.500 23c-1 2.500-2.500 4.500-4.500 6', '#ece4d0', 1.6) + ln('M27.600 14.200l5 1.600', '#e8e0cc', 2.2) }),
  fish_boss_mirror: FISH({ disc: '#f2c54a', side: '#c4b48a', back: '#9a7420', belly: '#f6eedc', fin: '#e0a020', eye: '#ff5a3a', dorsal: 'M13 13l1-4.500 2 2.500 2-4 2 4 2-2.500 1 4.500z', pat: [[13, 15.500], [18, 15], [23, 15.500], [15.500, 20], [20.500, 19.500], [25.500, 20]].map(([x, y]) => `<rect x="${x - 2}" y="${y - 1.800}" width="4" height="3.600" rx="1" fill="#eef4ff" stroke="#6a5020" stroke-width=".8"/><path d="M${x - 1.200} ${y + .8}l2.200-2.200" stroke="#fff" stroke-width=".8"/>`).join(''), post: C(20, 7.300, 1.200, '#ff3a3a') }),
  fish_boss_frost: FISH({ disc: '#9ad8ff', side: '#8eb4d4', back: '#1c3456', belly: '#f4faff', fin: '#cfe8ff', eye: '#b8ffff', dorsal: 'M13.500 13.500l1.500-6 1.500 4 2-6 1.500 5 2-4.500 1 5.500z', pat: ln('M11 15c2 1 3 0 4-1s3-1 4 0 3 1 4 0 3-1 4 0', '#e8f6ff', 1.2) + BAND('#7ad0ff'), post: SPARK(7, 10, 2.8, '#eaffff') + SPARK(34, 9, 2.2, '#eaffff') }),
};
// ---- 釣竿三階：同一支竿斜放，逐階換材質；右下角的菱形是階數 ----
const ROD = o => (o.disc ? `<circle cx="20" cy="20" r="16.500" fill="${o.disc}" opacity=".45"/>` : '') + ln('M33 5c1.500 6 2 13 0 20', '#f4f0e0', 0.9, 'opacity=".9"') + out('M7.500 33.500L33 5', o.pole, 2.6) + (o.nodes || '') + out('M5 36l5.500-5.500', o.grip, 4) + (o.reel || '') + C(33.500, 25.500, 1.700, '#e8281e') + (o.post || '');
const NODES = (col, n = 5) => Array.from({ length: n }, (_, i) => { const t = (i + 1) / (n + 1), x = 7.500 + 25.500 * t, y = 33.500 - 28.500 * t; return ln(`M${x - 1.300} ${y - 1.100}l2.600 2.200`, col, 1.6); }).join('');
const REEL = (rim, hub) => C(13.500, 29.500, 3.600, rim) + C(13.500, 29.500, 1.500, hub) + ln('M13.500 29.500l2.400-2.400', IK, 1.300);
const R07 = {
  rod_1: ROD({ pole: '#c8c060', nodes: NODES('#7a7a28'), grip: '#c8b090' }) + PIPS(1),
  rod_2: ROD({ disc: '#e0b070', pole: '#7a4a28', nodes: NODES('#ffc050', 4), grip: '#3a2416', reel: REEL('#a07040', '#e8d8b8') }) + PIPS(2),
  rod_3: ROD({ disc: '#9ab8d8', pole: '#6a8aa8', nodes: NODES('#ffffff', 4), grip: '#3a3e48', reel: REEL('#9aa8b8', '#f0f6ff'), post: SPARK(9, 9, 3, '#eaffff') }) + PIPS(3),
};
// ---- 魚素材：魚鱗（三片疊在一起的亮鱗）、魚膽（深綠的水滴形小囊）、魚鰾（半透明的兩節氣囊） ----
const M07 = {
  scale: P('M20 6c6 3 9 9 7 16c-2 5-5 7-7 8c-2-1-5-3-7-8c-2-7 1-13 7-16z', '#d8dce0') + F('M20 6c6 3 9 9 7 16c-2 5-5 7-7 8c4-6 5-14 0-24z', '#8a96a8', 'opacity=".6"') + P('M11 14c4 2 6 6 5 11c-1 3-3 5-5 6c-1.500-1-3.500-3-4.500-6c-1-5 1-9 4.500-11z', '#e6c46a') + P('M29 16c4 2 6 6 5 11c-1 3-3 5-5 6c-1.500-1-3.500-3-4.500-6c-1-5 1-9 4.500-11z', '#c8d4e0') + HL('M17 10c2-1 4-1 5 1', 1.6) + SPARK(30, 9, 2.6),
  fgall: P('M20 5c5 6 10 12 10 19a10 10 0 0 1-20 0c0-7 5-13 10-19z', '#3a7a3a') + F('M24 9c3 5 6 10 6 15a10 10 0 0 1-10 10c6-3 8-12 4-25z', IK, 'opacity=".3"') + E(16, 22, 2.500, 4, '#9ad89a', -20, false) + ln('M20 5c-1-1-3-1.500-4-1', '#c8b090', 1.600),
  bladder: P('M13 8c5 0 8 4 8 9s-3 8-8 8-8-3-8-8 3-9 8-9z', '#f2e8d0', 'opacity=".95"') + P('M26 16c5 0 9 4 9 9.500S31 35 26 35s-9-4-9-9.500S21 16 26 16z', '#f2e8d0', 'opacity=".95"') + ln('M19 21.500l3 1.500', '#c8a878', 2.200) + HL('M9 12c1-1.500 2.500-2 4-2', 1.6) + HL('M21 21c1-1.500 3-2.500 5-2.500', 1.6),
};
// ---- 魚料理（和 0.6 的料理同一種木碗／木盤、冒熱氣） ----
const PLATE = top => P('M3.500 25c0 5 7.500 8.500 16.500 8.500S36.500 30 36.500 25z', '#8a5a36') + E(20, 25, 16.500, 4.500, '#b07c4a') + top;
const FD07 = {
  food_fish: STEAM + PLATE(out('M6 27L34 15', '#b07c44', 1.600) + `<g transform="translate(20 21) rotate(-22) scale(.62) translate(-20 -20)">` + FISH({ side: '#c0762c', back: '#7a3e14', belly: '#e8b060', fin: '#9a4a1a', eye: '#f6e8c8' }) + '</g>' + ln('M14 18l2 3M19 16.500l2 3M24 15l2 3', '#5a2a10', 1.300)),
  food_fishsoup: STEAM + BOWL('#e8dcc0', P('M24 14l5-5c.5 2.500 0 5-1 6.500z', '#c9a54c') + E(14, 19.500, 2.200, 1.300, '#6cc24a', 0, false) + E(26, 20, 2, 1.200, '#6cc24a', 0, false) + E(19.500, 18.800, 2.500, 1.300, '#f6f0e0', 0, false)),
  food_smoked: ln('M20 4c-2 2 2 4 0 6M26 6c-2 2 2 4 0 6', '#c8c0b0', 1.5, 'opacity=".8"') + PLATE(`<g transform="translate(20 21) scale(.7) translate(-20 -20)">` + FISH({ side: '#a8582a', back: '#5a2a12', belly: '#d89a50', fin: '#6a3014', eye: '#e8d0a0' }) + '</g>' + E(30, 27, 2.400, 1.400, '#f6f6f0', 0, true)),
  food_fishfeast: STEAM + PLATE(`<g transform="translate(20 20.500) scale(.86) translate(-20 -20)">` + FISH({ side: '#c4762e', back: '#6a3a14', belly: '#e8b868', fin: '#9a4a1a', eye: '#f6e8c8' }) + '</g>' + E(8, 26.500, 2.200, 1.400, '#6cc24a') + E(32, 27, 2, 1.300, '#e8c040') + C(13, 28.500, 1.300, '#d84a2a') + C(28, 29, 1.200, '#d84a2a')) + SPARK(34, 8, 2.600),
};
// ---- 四種新藥劑（和 0.6 的藥劑同一種方肩長瓶，瓶身貼一張小標籤畫符號） ----
const T07 = {
  tonic_trout: BOTTLE('#d8484a', `<g transform="translate(20 27.800) scale(.24) translate(-20 -20)">` + FISH({ side: '#d8484a', back: '#8a1a1a', belly: '#f8c0b0', fin: '#a82a2a' }) + '</g>'),
  tonic_glue: BOTTLE('#e0a030', C(18.500, 27, 1.300, '#e0a030') + C(21.800, 28.800, 1.100, '#e0a030') + C(20.800, 25.800, .8, '#e0a030')),
  tonic_moss: BOTTLE('#3ac0a8', P('M20 31.500c-3.500-1-4-5-1-8c3 3 3.500 6 1 8z', '#5d9a3c')) + C(26, 14, 1.200, '#9affea', false) + C(13, 16, .9, '#9affea', false),
  tonic_swift: BOTTLE('#7ac8f0', ln('M16.500 27.500h5M17.500 25.500h5M16.500 29.500h4', '#3a6a9a', 1.200) + P('M22 24.500l2.500 3-2.500 3z', '#3a6a9a')),
};
// ---- 鏡鱗飾（獸飾：金環＋紅珠掛著一片亮晶晶的鏡鱗） ----
const C07 = { charm_scale: CHARM(P('M20 16c5 2 7 6.500 6 11.500c-1 3.500-3.500 6-6 7.500c-2.500-1.500-5-4-6-7.500c-1-5 1-9.500 6-11.500z', '#e6eef8') + F('M20 16c5 2 7 6.500 6 11.500c-1 3.500-3.500 6-6 7.500c3-5 4-12 0-19z', '#8aa0c0', 'opacity=".55"') + HL('M17 21l3-2', 1.6) + SPARK(28, 22, 2.600)) };
// ---- 地圖：空白地圖（捲起來的羊皮紙）、大張空白地圖（更粗、綁紅繩）、手繪地圖（攤開、褐墨線、紅 ✕）；天賦球：測繪（綠球上的羅盤） ----
const PARCH = '#ead6a6', INKB = '#6a4424';
const MP07 = {
  map_blank: P('M8 12h24v18H8z', PARCH) + P('M5.500 10.500a3 3 0 0 1 3-3h0a3 3 0 0 1 0 6h-0z', '#d8c08a') + P('M8.500 7.500h23.500a3 3 0 0 1 0 6H8.500z', '#e8d2a0') + P('M8 30a3 3 0 0 0 0 4.500h24a3 3 0 0 0 0-4.500z', '#d8c08a') + HL('M11 10h14', 1.4, 0.7),
  map_big: P('M5 11h30v19H5z', PARCH) + P('M3 9h34a3.500 3.500 0 0 1 0 7H3a3.500 3.500 0 0 1 0-7z', '#e8d2a0') + P('M3 28h34a3.500 3.500 0 0 1 0 7H3a3.500 3.500 0 0 1 0-7z', '#d8c08a') + out('M20 9v26', '#c8281e', 1.800) + C(20, 22, 2.400, '#c8281e') + HL('M6 11.500h12', 1.4, 0.7),
  map_drawn: P('M4.500 8l10 3 11-3 10 3v21l-10-3-11 3-10-3z', PARCH) + F('M14.500 11v21l11-3V8z', IK, 'opacity=".08"') + ln('M7 26c4-3 5-8 10-9s6-6 11-5', INKB, 1.400) + ln('M8 13c5 2 10 6 14 12s6 4 10 3', INKB, 1.100, 'stroke-dasharray="2 1.800"') + E(27, 22.500, 3.500, 2.300, '#8ab0c0', 0, false) + ln('M23 15l2-3 2 3M29 18l2-3 2 3', INKB, 1.100) + ln('M10.500 18.500l2.600 2.600M13.100 18.500l-2.600 2.600', '#c8281e', 1.700),
  orb_survey: C(20, 20, 14.500, '#3a8a7a') + F('M33 26.500a14.500 14.500 0 0 1-23.500 3.500a16 16 0 0 0 23.500-3.500z', IK, 'opacity=".3"') + C(20, 20.500, 8.500, '#ead6a6') + P('M20 12.500l2.200 8-2.200 8-2.200-8z', '#c8281e') + F('M20 20.500l2.200 0-2.200 8z', '#f6f0e0') + ln('M11.500 20.500h2M26.500 20.500h2', INKB, 1.200) + `<ellipse cx="14.500" cy="12.500" rx="5" ry="2.600" transform="rotate(-35 14.500 12.500)" fill="#fff" opacity=".65"/>`,
};
// ---- 委託卡的六種（狩獵、採集、下廚、送貨、測繪、釣魚）：同一張用圖釘釘著的紙，中間換符號 ----
const CARD = sym => P('M8 5.500h24v29H8z', '#f4ead0', 'transform="rotate(-4 20 20)"') + C(20, 6.500, 2, '#b8b8c0') + `<g transform="rotate(-4 20 20)">${sym}</g>`;
const K07 = {
  card_hunt: CARD(P('M14 14l12 12M26 14L14 26', 'none') + out('M13.500 27l13-13', '#8a8c90', 2.200) + P('M24 12l5-1-1 5z', '#c8ccd4') + out('M13.500 13l13 13', '#8a8c90', 2.200) + P('M10.500 25.500l3.500.5-.5 3.500z', '#6a4a2a')),
  card_gather: CARD(P('M20 28c-6-1-8-7-6-13c5 2 7 7 6 13z', '#4fae5a') + P('M20 28c6-1 8-7 6-13c-5 2-7 7-6 13z', '#7fd06a') + out('M20 21v9', '#2f7a3a', 1.400)),
  card_cook: CARD(STEAM.replace(/opacity="\.75"/, 'opacity=".9"').replace(/#fff/g, '#8a8a8a') + P('M10 21h20c0 5-4.500 8-10 8s-10-3-10-8z', '#5a5e68') + E(20, 21, 10, 2.600, '#d8823a')),
  card_deliver: CARD(P('M11 15h18v13H11z', '#b07c4a') + ln('M11 15l9 6 9-6', IK, 1.200) + out('M20 15v13', '#c8281e', 1.400)),
  card_survey: CARD(C(20, 20, 8, '#ead6a6') + P('M20 13l2 7-2 7-2-7z', '#c8281e') + F('M20 20h2l-2 7z', '#f6f0e0')),
  card_fish: CARD(`<g transform="translate(20 20) scale(.6) translate(-20 -20)">` + FISH({ side: '#c9a54c', back: '#55603a', belly: '#f3e8c6', fin: '#d08a44' }) + '</g>' + ln('M27 9c1 2 1 4 0 6', '#8a8c90', 1)),
  trap_mark: ln('M10 10l20 20M30 10L10 30', IK, 7) + ln('M10 10l20 20M30 10L10 30', '#d8281e', 4),      // 地圖上的陷阱 ✕
};
export const ICON07_BODY = Object.assign({}, F07, R07, M07, FD07, T07, C07, MP07, K07);
const ALIAS = { gall_fish: 'fgall', fish_scale: 'scale', fish_bladder: 'bladder' };
export const ICON07_IDS = Object.keys(ICON07_BODY);
export const has07 = id => !!(ICON07_BODY[id] || ICON07_BODY[ALIAS[id]]);
export function icon07Svg(id, size) { const body = ICON07_BODY[id] || ICON07_BODY[ALIAS[id]]; if (!body) return null; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"${size ? ` width="${size}" height="${size}"` : ''} aria-hidden="true">${body}</svg>`; }
const urlCache = new Map();
export function icon07(id, size = 40) { const k = id + '@' + size; let u = urlCache.get(k); if (u === undefined) { const s = icon07Svg(id, size); u = s ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s) : null; urlCache.set(k, u); } return u; }
export function icon07Canvas(id, size = 40) { const cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px'; const u = icon07(id, size * dpr); if (u) { const im = new Image(); im.onload = () => cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); im.src = u; } return cv; }
