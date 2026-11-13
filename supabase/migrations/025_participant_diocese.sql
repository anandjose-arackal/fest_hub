-- Retain a participant's source diocese when no shakha is supplied.
alter table public.participants
  add column if not exists diocese_id uuid references public.dioceses(id);

create index if not exists participants_diocese_id_idx
  on public.participants (diocese_id);
