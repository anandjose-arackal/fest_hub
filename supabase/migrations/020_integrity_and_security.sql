-- Security and data-integrity fixes from the repo audit.
--
--   1. Self sign-ups no longer get a profile (and with it a role). Only users
--      the app creates (/setup, /api/admin/create-user) are provisioned; they
--      write their own profile row, so the trigger only fills in the rest.
--   2. participants / participant_registrations / feast_reg_counters are
--      written only by server actions (service role) — the anon key could
--      insert registrations directly, skipping auth, caps and photo checks.
--   3. insert_capped_registrations(): the per-scope item cap is checked and
--      written under one lock, so two admins can't both take the last slot.
--   4. rebuild_shakha_standings(): standings summed in SQL, serialized per
--      fest, so two publishes at once can't save stale totals. Pages the
--      whole shakha list (no 1000-row API cap).
--   5. publish_item_results() / unpublish_item_results(): every write of a
--      publish or unpublish in one transaction — all or nothing.
--
-- Idempotent: create or replace / drop if exists throughout.

-- ── 1. Sign-ups ───────────────────────────────────────────────────────────
-- Accounts the app creates carry app_metadata.fh_provisioned = true, which a
-- browser sign-up cannot set (only user_metadata is client-writable).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'fh_provisioned', '') <> 'true' then
    return new;
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A profile row that somehow appears without a role is a branch admin with
-- no branch (can do nothing), never a full admin.
alter table profiles alter column role set default 'sa_admin';

-- ── 2. Server-only writes ─────────────────────────────────────────────────
drop policy if exists "participants_public_insert" on participants;
drop policy if exists "registrations_public_insert" on participant_registrations;
drop policy if exists "feast_reg_counters_auth_all" on feast_reg_counters;

revoke execute on function public.next_reg_number(uuid) from public, anon, authenticated;
grant execute on function public.next_reg_number(uuid) to service_role;

-- ── 3. Capped registration insert ─────────────────────────────────────────
-- p_scope_shakha_ids is the cap scope from resolveCapScopeShakhaIds (one
-- shakha, or every shakha in its meghala/diocese). The lock key is the item
-- plus the scope's smallest shakha id, which every shakha in the scope shares.
create or replace function public.insert_capped_registrations(
  p_participant_id uuid,
  p_fc_ids uuid[],
  p_scope_shakha_ids uuid[],
  p_default_cap int
)
returns table (id uuid, feast_competition_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_fc uuid;
  v_cap int;
  v_count int;
  v_scope_key text := (select min(s::text) from unnest(p_scope_shakha_ids) s);
begin
  for v_fc in select distinct u from unnest(p_fc_ids) u order by 1 loop
    perform pg_advisory_xact_lock(hashtext('reg-cap:' || v_fc || ':' || coalesce(v_scope_key, '')));
    select coalesce(c.max_per_shakha, p_default_cap) into v_cap
      from feast_competitions f join competitions c on c.id = f.competition_id
      where f.id = v_fc;
    select count(*) into v_count
      from participant_registrations pr join participants p on p.id = pr.participant_id
      where pr.feast_competition_id = v_fc
        and p.shakha_id = any(p_scope_shakha_ids)
        and pr.participant_id <> p_participant_id;
    if v_count >= coalesce(v_cap, p_default_cap) then
      raise exception 'registration_cap_reached' using errcode = 'P0001';
    end if;
  end loop;

  return query
    insert into participant_registrations as pr (participant_id, feast_competition_id)
    select p_participant_id, u from unnest(p_fc_ids) u
    on conflict (participant_id, feast_competition_id) do nothing
    returning pr.id, pr.feast_competition_id;
end;
$$;

-- ── 4. Standings ──────────────────────────────────────────────────────────
-- Same rules as the TypeScript it replaces: points per category bucket plus
-- team points, medal and grade counts, ranked by total, 1st places, A grades,
-- junior points, then name. An external fest's standings are entered by hand,
-- so this is a no-op for one.
create or replace function public.rebuild_shakha_standings(p_feast_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select is_external from feasts where id = p_feast_id), false) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('standings:' || p_feast_id));

  with agg as (
    select
      s.id as shakha_id,
      s.name,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'sub_junior'), 0)::int   as sub_junior_points,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'junior'), 0)::int       as junior_points,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'senior'), 0)::int       as senior_points,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'super_senior'), 0)::int as super_senior_points,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'elder'), 0)::int        as elder_points,
      coalesce(sum(l.total_points) filter (where l.category_slug = 'team'), 0)::int         as team_points,
      (count(*) filter (where l.position = 1))::int as first_place_count,
      (count(*) filter (where l.position = 2))::int as second_place_count,
      (count(*) filter (where l.position = 3))::int as third_place_count,
      (count(*) filter (where l.grade = 'A'))::int  as a_grade_count,
      (count(*) filter (where l.grade = 'B'))::int  as b_grade_count,
      (count(*) filter (where l.grade = 'C'))::int  as c_grade_count
    from shakhas s
    left join shakha_point_ledger l on l.shakha_id = s.id and l.feast_id = p_feast_id
    group by s.id, s.name
  ),
  totals as (
    select *, sub_junior_points + junior_points + senior_points + super_senior_points + elder_points + team_points as grand_total
    from agg
  ),
  ranked as (
    select *, row_number() over (
      order by grand_total desc, first_place_count desc, a_grade_count desc, junior_points desc, name
    )::int as rank
    from totals
  )
  insert into shakha_feast_standings (
    feast_id, shakha_id, sub_junior_points, junior_points, senior_points, super_senior_points, elder_points,
    team_points, grand_total, first_place_count, second_place_count, third_place_count,
    a_grade_count, b_grade_count, c_grade_count, rank, updated_at
  )
  select
    p_feast_id, shakha_id, sub_junior_points, junior_points, senior_points, super_senior_points, elder_points,
    team_points, grand_total, first_place_count, second_place_count, third_place_count,
    a_grade_count, b_grade_count, c_grade_count, rank, now()
  from ranked
  on conflict (feast_id, shakha_id) do update set
    sub_junior_points   = excluded.sub_junior_points,
    junior_points       = excluded.junior_points,
    senior_points       = excluded.senior_points,
    super_senior_points = excluded.super_senior_points,
    elder_points        = excluded.elder_points,
    team_points         = excluded.team_points,
    grand_total         = excluded.grand_total,
    first_place_count   = excluded.first_place_count,
    second_place_count  = excluded.second_place_count,
    third_place_count   = excluded.third_place_count,
    a_grade_count       = excluded.a_grade_count,
    b_grade_count       = excluded.b_grade_count,
    c_grade_count       = excluded.c_grade_count,
    rank                = excluded.rank,
    updated_at          = excluded.updated_at;
end;
$$;

-- ── 5. Publish / unpublish ────────────────────────────────────────────────
-- Grades, positions and points are still worked out in TypeScript
-- (src/lib/result-calculator.ts); these functions only write them, together.
-- p_kind: 'individual' (competition_results) or 'team' (team_results).
create or replace function public.publish_item_results(
  p_fc_id uuid,
  p_kind text,
  p_results jsonb,
  p_ledger jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feast uuid;
begin
  select feast_id into v_feast from feast_competitions where id = p_fc_id for update;
  if v_feast is null then
    raise exception 'Competition not found';
  end if;

  if p_kind = 'team' then
    insert into team_results (feast_competition_id, team_registration_id, score, grade, grade_points, position, position_points, total_points, published_at)
    select feast_competition_id, team_registration_id, score, grade, grade_points, position, position_points, total_points, published_at
    from jsonb_populate_recordset(null::team_results, p_results)
    on conflict (team_registration_id) do update set
      score = excluded.score, grade = excluded.grade, grade_points = excluded.grade_points,
      position = excluded.position, position_points = excluded.position_points,
      total_points = excluded.total_points, published_at = excluded.published_at, updated_at = now();
  else
    insert into competition_results (feast_competition_id, participant_registration_id, score, grade, grade_points, position, position_points, total_points, published_at)
    select feast_competition_id, participant_registration_id, score, grade, grade_points, position, position_points, total_points, published_at
    from jsonb_populate_recordset(null::competition_results, p_results)
    on conflict (participant_registration_id) do update set
      score = excluded.score, grade = excluded.grade, grade_points = excluded.grade_points,
      position = excluded.position, position_points = excluded.position_points,
      total_points = excluded.total_points, published_at = excluded.published_at, updated_at = now();
  end if;

  delete from shakha_point_ledger where feast_competition_id = p_fc_id;
  insert into shakha_point_ledger (
    feast_id, feast_competition_id, participant_registration_id, participant_id, team_registration_id,
    shakha_id, category_slug, score, grade, position, grade_points, position_points, total_points
  )
  select
    feast_id, feast_competition_id, participant_registration_id, participant_id, team_registration_id,
    shakha_id, category_slug, score, grade, position, grade_points, position_points, total_points
  from jsonb_populate_recordset(null::shakha_point_ledger, p_ledger);

  update feast_competitions set result_status = 'published', comp_status = 'published' where id = p_fc_id;
  perform rebuild_shakha_standings(v_feast);
end;
$$;

create or replace function public.unpublish_item_results(p_fc_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feast uuid;
begin
  select feast_id into v_feast from feast_competitions where id = p_fc_id for update;
  if v_feast is null then
    raise exception 'Competition not found';
  end if;

  if p_kind = 'team' then
    update team_results
      set grade = null, grade_points = 0, position = null, position_points = 0, total_points = 0, published_at = null, updated_at = now()
      where feast_competition_id = p_fc_id;
  else
    update competition_results
      set grade = null, grade_points = 0, position = null, position_points = 0, total_points = 0, published_at = null, updated_at = now()
      where feast_competition_id = p_fc_id;
  end if;

  delete from shakha_point_ledger where feast_competition_id = p_fc_id;
  -- Anything printed for these results is stale: back to "not printed".
  delete from feast_competition_prints where feast_competition_id = p_fc_id;
  update feast_competitions set result_status = 'draft', comp_status = 'completed' where id = p_fc_id;
  perform rebuild_shakha_standings(v_feast);
end;
$$;

-- SECURITY DEFINER functions are executable by PUBLIC by default; these are
-- for the server (service role) only.
revoke execute on function public.insert_capped_registrations(uuid, uuid[], uuid[], int) from public, anon, authenticated;
revoke execute on function public.rebuild_shakha_standings(uuid) from public, anon, authenticated;
revoke execute on function public.publish_item_results(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.unpublish_item_results(uuid, text) from public, anon, authenticated;
grant execute on function public.insert_capped_registrations(uuid, uuid[], uuid[], int) to service_role;
grant execute on function public.rebuild_shakha_standings(uuid) to service_role;
grant execute on function public.publish_item_results(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.unpublish_item_results(uuid, text) to service_role;
