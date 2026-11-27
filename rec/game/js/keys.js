// 按鍵設定：每個動作綁一個鍵盤鍵或滑鼠鍵，可在設定裡改，存在這台瀏覽器
export const ACTIONS = [
  ['up', '前進', 'KeyW'], ['down', '後退', 'KeyS'], ['left', '向左', 'KeyA'], ['right', '向右', 'KeyD'],
  ['attack', '輕攻擊', 'Mouse0'], ['heavy', '重攻擊（按住蓄力）', 'KeyF'], ['guard', '格擋', 'Mouse2'], ['dodge', '閃避', 'Space'], ['sprint', '衝刺（按住）', 'ShiftLeft'],
  ['lock', '鎖定／解除目標', 'Tab'], ['lock2', '鎖定／解除目標（第二鍵）', 'Mouse1'], ['lockNext', '切換鎖定目標', 'KeyR'],
  ['heal', '使用回復道具', 'KeyQ'], ['interact', '互動／交談', 'KeyE'],
  ['skill1', '技能一', 'Digit1'], ['skill2', '技能二', 'Digit2'], ['skill3', '技能三', 'Digit3'], ['skill4', '技能四', 'Digit4'],
  ['camera', '切換視角', 'KeyV'], ['cursor', '釋放滑鼠游標', 'AltLeft'], ['char', '角色面板', 'KeyC'], ['bag', '背包', 'KeyI'], ['map', '地圖', 'KeyM'], ['quest', '任務日誌', 'KeyJ'], ['skills', '技能與天賦', 'KeyK'], ['chat', '說話', 'Enter']
];
const KEY = 'wanshou-keys-v1', DEF = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));
export const binds = Object.assign({}, DEF);
// 舊的設定沒有新動作：新動作用預設鍵；預設鍵已經被玩家自己改過的動作佔用時，新動作先不綁（設定裡顯示「未設定」）
try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'), used = new Set(); for (const k in s) if (k in DEF && typeof s[k] === 'string') { binds[k] = s[k]; used.add(s[k]); } if (used.size) for (const k in DEF) if (!(k in s) && used.has(DEF[k])) binds[k] = ''; } catch (e) {}
let rev = null; const build = () => { rev = {}; for (const k in binds) if (binds[k]) rev[binds[k]] = k; };
export const actionOf = code => { if (!rev) build(); return rev[code] || null; };
const save = () => { build(); try { localStorage.setItem(KEY, JSON.stringify(binds)); } catch (e) {} };
export const RESERVED = new Set(['Escape', 'F3', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);
export function rebind(action, code) { if (!(action in DEF) || RESERVED.has(code)) return false; const other = actionOf(code); if (other && other !== action) binds[other] = binds[action]; binds[action] = code; save(); return true; }
export function resetBinds() { Object.assign(binds, DEF); save(); }
const NAMES = { Space: '空白', Enter: 'Enter', Mouse0: '左鍵', Mouse1: '中鍵', Mouse2: '右鍵', Mouse3: '側鍵一', Mouse4: '側鍵二', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl', AltLeft: '左 Alt', AltRight: '右 Alt', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', CapsLock: 'Caps', Backspace: '退格' };
export const codeName = code => !code ? '未設定' : NAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, '數字鍵 ');
export const keyOf = action => codeName(binds[action]);
