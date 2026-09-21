-- supabase/migrations/0001_leaderboard.sql
-- Circle TD replay-verified leaderboard schema (Plan 3B).
-- Run MANUALLY in the Supabase SQL editor (Dashboard → SQL) — no CLI/MCP
-- this session. HASH + SCORE ONLY: no full replay/commands column is
-- stored (owner decision). The client submits the command log; the route
-- re-simulates and persists only the resulting hashes + score/wave/initials.

create table if not exists public.game_scores (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  game_slug    text        not null,
  sim_version  integer     not null,
  mode         text        not null check (mode in ('daily','free')),
  seed         text        not null,                    -- canonical: int daily seed as text
  daily_date   date,                                    -- the UTC day this run's seed belongs to
  initials     text        not null check (initials ~ '^[A-Z]{3}$'),
  score        integer     not null check (score >= 0),
  wave         integer     not null check (wave >= 0),
  hash         text        not null,                    -- FNV-1a state hash from runReplay
  replay_hash  text        not null,                    -- FNV-1a hash of the command log (dedupe)
  constraint daily_needs_date check (mode <> 'daily' or daily_date is not null),
  -- Dedupe: one verified run (same log, same seed/version) can't carpet the
  -- board under many initials — initials is deliberately NOT in the key.
  unique (game_slug, sim_version, seed, replay_hash)
);

-- Daily board: rank within one day's seed.
create index if not exists game_scores_daily_rank
  on public.game_scores (daily_date, score desc, created_at asc)
  where mode = 'daily';

-- All-time board: rank across all daily rows for a sim_version.
create index if not exists game_scores_alltime_rank
  on public.game_scores (game_slug, sim_version, score desc, created_at asc)
  where mode = 'daily';

-- Column-limited public read surface: excludes seed + both hashes.
-- security_invoker=false (definer) so anon reads this view even though the
-- base table's SELECT is revoked below — the view is the ONLY public read
-- path, and RLS on the base table is evaluated as the (superuser) owner here.
create or replace view public.game_scores_public
  with (security_invoker = false) as
  select id, created_at, game_slug, sim_version, mode, daily_date, initials, score, wave
  from public.game_scores;

alter table public.game_scores enable row level security;
-- No anon/authenticated policy exists → RLS denies all client access to the
-- base table. service_role bypasses RLS and is the ONLY writer/full reader.
revoke all on public.game_scores from anon, authenticated;
grant  select on public.game_scores_public to anon, authenticated;

-- --- Per-IP rate limiting (no new dependency; atomic in one upsert) ---
create table if not exists public.rate_limits (
  bucket       text primary key,          -- salted hash of ip + window label (zero-PII)
  count        integer     not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;   -- no policy → no client access

create or replace function public.hit_rate_limit(
  p_bucket text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
    values (p_bucket, 1, now())
  on conflict (bucket) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1 end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start end
  returning rl.count into v_count;
  return v_count <= p_limit;   -- true = allowed
end;
$$;

revoke all on function public.hit_rate_limit(text,integer,integer) from public, anon, authenticated;
grant  execute on function public.hit_rate_limit(text,integer,integer) to service_role;
