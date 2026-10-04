-- Registration numbers are now "F" || n with no feast prefix
-- (formatRegNumber() in src/lib/feast-data.ts) — previously
-- "F5848-1405", with a slice of the feast uuid. registration_number is
-- unique across all feasts, so n comes from one counter shared by every
-- feast: the highest next_number of any feast. The advisory lock serializes
-- allocation so two feasts open at the same time can't hand out the same n.
-- Idempotent: safe to re-run.

create or replace function next_reg_number(p_feast_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  result int;
begin
  perform pg_advisory_xact_lock(hashtext('next_reg_number'));

  select coalesce(max(next_number), 1111) into result from feast_reg_counters;

  insert into feast_reg_counters (feast_id, next_number)
  values (p_feast_id, result + 1)
  on conflict (feast_id) do update
    set next_number = excluded.next_number,
        updated_at  = now();

  return result;
end;
$$;

grant execute on function next_reg_number(uuid) to anon, authenticated;
