-- Seed shakhas with no parent meghala (top-level / unassigned in the org
-- hierarchy). Names converted from Malayalam to English; meghala_id is left
-- at its default NULL. Colors drawn from the same palette as the
-- /admin/shakhas picker (DEFAULT_COLORS in src/app/admin/shakhas/page.tsx),
-- extended with 4 more swatches in the same style so all 12 are distinct.
-- Idempotent: safe to re-run.

insert into shakhas (name, slug, meghala_id, color) values
  ('Perambra',         'perambra',         null, '#6B46FF'),
  ('Chakkittapara',    'chakkittapara',    null, '#0F766E'),
  ('Narinada',         'narinada',         null, '#B45309'),
  ('Koorachundu',      'koorachundu',      null, '#BE185D'),
  ('Kulathuvayal',     'kulathuvayal',     null, '#1D4ED8'),
  ('Muthukad',         'muthukad',         null, '#15803D'),
  ('Peruvannamuzhi',   'peruvannamuzhi',   null, '#B91C1C'),
  ('Kattulamala',      'kattulamala',      null, '#4338CA'),
  ('Pathippara',       'pathippara',       null, '#0891B2'),
  ('Karikandanpara',   'karikandanpara',   null, '#C2410C'),
  ('Kariyathumpara',   'kariyathumpara',   null, '#9D174D'),
  ('Kakkayam',         'kakkayam',         null, '#065F46')
on conflict (name) do nothing;
