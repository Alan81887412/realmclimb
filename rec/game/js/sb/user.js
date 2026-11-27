/* user 轉接：和 window.claude.use('user') 同介面。
   id()：Supabase auth 的 user.id（匿名登入，session 存在 localStorage，同一個瀏覽器固定同一個 id）。
   GitHub Pages 版每個玩家都是自己資料的擁有者，save07.js 的 role() 要看到「可寫（editor）」：canEdit()＝true。 */
import { ensureSession, withTimeout } from './client.js';

export function createUser() {
  const id = async () => (await withTimeout(ensureSession(), 8000, 'user.id')).id; /* 逾時會拋 timeout；Store.init 接住後改用本機存檔 */
  return {
    id,
    async me() { return { id: await id(), isOwner: false, canEdit: true, isAnonymous: true }; },
    async isOwner() { return false; },
    async canEdit() { return true; },
  };
}
