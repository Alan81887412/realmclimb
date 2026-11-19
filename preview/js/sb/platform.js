/* 平台轉接層：sbPlatform() → { use(name) }，和 window.claude 同介面；沒設定 Supabase（也沒有 ?sbfake）→ null。
   use('user'|'db')：本檔提供；use('room')：M3 的 js/sb/room.js（匯出 createRoom()；檔案不存在或載入失敗 → null，遊戲照單機跑）。 */
import { configured, ensureSession } from './client.js';
import { createUser } from './user.js';
import { createDb } from './db.js';

export async function sbPlatform() {
  if (!configured()) return null;
  const user = createUser(), db = createDb();
  ensureSession().catch(() => {}); /* 先暖機：匿名登入跟載入遊戲同時進行 */
  let roomP = null;
  const loadRoom = () => roomP || (roomP = import('./room.js').then(m => { const f = m.createRoom || m.default; return typeof f === 'function' ? f() : (m.room || null); }).catch(() => null));
  return {
    sb: true,
    use(name) {
      if (name === 'user') return user;
      if (name === 'db') return db;
      if (name === 'room') return loadRoom();
      return null;
    },
  };
}
