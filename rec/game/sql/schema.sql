-- ============================================================================
-- 登界 0.8：Supabase 資料庫設定（玩家存檔、角色名、流水號）
-- 用法：Supabase 後台 → SQL Editor → New query → 整份貼上 → Run。
-- 可以重複執行（已經有的東西會略過或更新），不會弄丟已存的玩家資料。
-- 這份只有資料表、權限（RLS）與函式；不含任何金鑰。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 資料表
-- ---------------------------------------------------------------------------

-- 玩家存檔：一個玩家（auth.users 的一筆）一列，存檔整包放 data（jsonb）。
-- 上限 65536 位元組（64 KB）；目前的存檔約 5–6 KB。
create table if not exists public.players (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint players_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint players_data_size check (octet_length(data::text) <= 65536)
);

-- 角色名登記（key = 'n' + 小寫名字的 UTF-8 十六進位，和遊戲的 names/n<hex> 一樣）。
-- 只能透過下面的函式讀寫（前端不能直接碰）。
create table if not exists public.names (
  key          text primary key,
  owner        uuid references auth.users (id) on delete cascade,
  name         text,
  lease_holder uuid,
  lease_until  timestamptz,
  created_at   timestamptz not null default now(),
  constraint names_key_format check (key ~ '^n[0-9a-f]{2,96}$'),
  constraint names_name_len check (name is null or char_length(name) between 1 and 24)
);
create index if not exists names_owner_idx on public.names (owner) where owner is not null;
create index if not exists names_stale_lease_idx on public.names (lease_until) where owner is null;

-- 流水號（UID #001、#002 …）：每個玩家固定一個，由伺服器原子配發。
create sequence if not exists public.player_serial_seq as integer start 1;
create table if not exists public.serials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  serial  integer not null unique default nextval('public.player_serial_seq')
);

-- updated_at 一律由伺服器填
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists players_touch on public.players;
create trigger players_touch before insert or update on public.players
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 權限（RLS）
--    players：登入者（含匿名登入）都能讀；只有本人能新增、修改；沒有人能刪。
--    names、serials：前端完全不能直接讀寫，只能透過函式。
-- ---------------------------------------------------------------------------
revoke all on public.players from public, anon, authenticated;
revoke all on public.names   from public, anon, authenticated;
revoke all on public.serials from public, anon, authenticated;
revoke all on sequence public.player_serial_seq from public, anon, authenticated;
grant select, insert, update on public.players to authenticated;

alter table public.players enable row level security;
alter table public.names   enable row level security;
alter table public.serials enable row level security;

drop policy if exists players_read on public.players;
create policy players_read on public.players
  for select to authenticated using (true);

drop policy if exists players_insert_self on public.players;
create policy players_insert_self on public.players
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists players_update_self on public.players;
create policy players_update_self on public.players
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. 函式（RPC）。前端只用 supabase.rpc('函式名', {...}) 呼叫這幾個。
--    player_*：security invoker（用呼叫者的權限跑，受上面 RLS 約束）。
--    name_*、next_serial：security definer（要碰前端不能碰的表），
--    每個都先驗 auth.uid()、驗參數格式、固定 search_path、所有 SQL 都帶參數（無字串拼接）。
-- ---------------------------------------------------------------------------

-- 讀自己的存檔；沒有存檔回 null
create or replace function public.player_get() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select data from public.players where user_id = auth.uid();
$$;

-- 整份覆蓋自己的存檔（沒有就新增）
create or replace function public.player_set(p_data jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad_data'; end if;
  insert into public.players (user_id, data) values (v, p_data)
  on conflict (user_id) do update set data = excluded.data;
end $$;

-- 淺合併進自己的存檔（頂層欄位覆蓋；值為 null 的欄位保留為 null）
create or replace function public.player_update(p_patch jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad_data'; end if;
  update public.players set data = data || p_patch where user_id = v;
  if not found then raise exception 'not_found'; end if;
end $$;

-- 查角色名：已登記回 {owner, name}，否則 null
create or replace function public.name_get(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_key is null or p_key !~ '^n[0-9a-f]{2,96}$' then raise exception 'bad_key'; end if;
  select jsonb_build_object('owner', owner, 'name', name) into r
    from public.names where key = p_key and owner is not null;
  return r;
end $$;

-- 搶名字的短租約（1–60 秒）。取得回 true；別人持有且未過期回 false。
create or replace function public.name_acquire(p_key text, p_ttl_ms integer default 5000) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := auth.uid(); ttl integer; n integer;
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if p_key is null or p_key !~ '^n[0-9a-f]{2,96}$' then raise exception 'bad_key'; end if;
  ttl := least(greatest(coalesce(p_ttl_ms, 5000), 1000), 60000);
  delete from public.names where owner is null and lease_until < now() - interval '10 minutes';
  insert into public.names (key, lease_holder, lease_until)
  values (p_key, v, now() + ttl * interval '1 millisecond')
  on conflict (key) do update
    set lease_holder = v, lease_until = excluded.lease_until
    where public.names.lease_holder is null
       or public.names.lease_holder = v
       or public.names.lease_until is null
       or public.names.lease_until < now();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 登記角色名（owner 一定是呼叫者自己）。已被別人用、或別人持有未過期租約 → name_taken。
-- 每個玩家最多登記 20 個名字（匯入存檔改名也算）。
create or replace function public.name_claim(p_key text, p_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := auth.uid(); r public.names%rowtype;
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if p_key is null or p_key !~ '^n[0-9a-f]{2,96}$' then raise exception 'bad_key'; end if;
  if p_name is null or char_length(p_name) not between 1 and 24 then raise exception 'bad_data'; end if;
  select * into r from public.names where key = p_key for update;
  if found then
    if r.owner is not null and r.owner <> v then raise exception 'name_taken'; end if;
    if r.owner is null and r.lease_holder is not null and r.lease_holder <> v and r.lease_until > now() then
      raise exception 'name_taken';
    end if;
    if r.owner is null and (select count(*) from public.names where owner = v) >= 20 then
      raise exception 'name_limit';
    end if;
    update public.names set owner = v, name = p_name, lease_holder = null, lease_until = null where key = p_key;
  else
    if (select count(*) from public.names where owner = v) >= 20 then raise exception 'name_limit'; end if;
    insert into public.names (key, owner, name) values (p_key, v, p_name);
  end if;
exception when unique_violation then
  raise exception 'name_taken';
end $$;

-- 取自己的流水號（固定一個，重複呼叫回同一個）
create or replace function public.next_serial() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := auth.uid(); s integer;
begin
  if v is null then raise exception 'not_signed_in'; end if;
  select serial into s from public.serials where user_id = v;
  if s is null then
    insert into public.serials (user_id) values (v) on conflict (user_id) do nothing;
    select serial into s from public.serials where user_id = v;
  end if;
  return s;
end $$;

-- 函式預設誰都能呼叫，改成只有登入者（匿名登入也算登入）
revoke all on function public.player_get()                    from public, anon;
revoke all on function public.player_set(jsonb)               from public, anon;
revoke all on function public.player_update(jsonb)            from public, anon;
revoke all on function public.name_get(text)                  from public, anon;
revoke all on function public.name_acquire(text, integer)     from public, anon;
revoke all on function public.name_claim(text, text)          from public, anon;
revoke all on function public.next_serial()                   from public, anon;
revoke all on function public.touch_updated_at()              from public, anon, authenticated;
grant execute on function public.player_get()                 to authenticated;
grant execute on function public.player_set(jsonb)            to authenticated;
grant execute on function public.player_update(jsonb)         to authenticated;
grant execute on function public.name_get(text)               to authenticated;
grant execute on function public.name_acquire(text, integer)  to authenticated;
grant execute on function public.name_claim(text, text)       to authenticated;
grant execute on function public.next_serial()                to authenticated;

-- 讓 API 立刻認得新函式
notify pgrst, 'reload schema';
