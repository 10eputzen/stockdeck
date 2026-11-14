-- Rate limit for MCP tool calls: a fixed one-minute window per user.
-- Only the mcp function (service role) touches it; RLS without policies blocks everyone else.
create table public.mcp_rate (
  user_id uuid primary key references auth.users on delete cascade,
  window_start timestamptz not null,
  calls int not null
);
alter table public.mcp_rate enable row level security;

-- Counts one call and says whether the user is still within p_limit calls this minute.
create or replace function public.mcp_take_call(p_user uuid, p_limit int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.mcp_rate as r (user_id, window_start, calls)
  values (p_user, date_trunc('minute', now()), 1)
  on conflict (user_id) do update set
    calls = case when r.window_start = date_trunc('minute', now()) then r.calls + 1 else 1 end,
    window_start = date_trunc('minute', now())
  returning calls <= p_limit;
$$;

revoke all on function public.mcp_take_call(uuid, int) from public, anon, authenticated;
grant execute on function public.mcp_take_call(uuid, int) to service_role;
