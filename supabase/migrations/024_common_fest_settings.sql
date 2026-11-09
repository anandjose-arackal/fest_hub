alter table public.feasts add column if not exists include_in_overall boolean not null default true;
alter table public.feasts add column if not exists requires_dob boolean not null default true;
alter table public.feasts add column if not exists house_label text not null default 'House Name';
alter table public.shakha_feast_standings add column if not exists common_points integer not null default 0;

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
      coalesce(sum(l.total_points) filter (where l.category_slug = 'common'), 0)::int as common_points,
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
    select *, sub_junior_points + junior_points + senior_points + super_senior_points + elder_points + team_points + common_points as grand_total
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
    team_points, common_points, grand_total, first_place_count, second_place_count, third_place_count,
    a_grade_count, b_grade_count, c_grade_count, rank, updated_at
  )
  select
    p_feast_id, shakha_id, sub_junior_points, junior_points, senior_points, super_senior_points, elder_points,
    team_points, common_points, grand_total, first_place_count, second_place_count, third_place_count,
    a_grade_count, b_grade_count, c_grade_count, rank, now()
  from ranked
  on conflict (feast_id, shakha_id) do update set
    sub_junior_points   = excluded.sub_junior_points,
    junior_points       = excluded.junior_points,
    senior_points       = excluded.senior_points,
    super_senior_points = excluded.super_senior_points,
    elder_points        = excluded.elder_points,
    team_points         = excluded.team_points,
    common_points = excluded.common_points,
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
