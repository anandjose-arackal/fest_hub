-- Seed the Madampam, Rajapuram, Perikkalloor and Changalery meghalas and
-- their shakhas (names converted from Malayalam to English; "Perikkallloor"
-- in the source list corrected to match the meghala's own spelling,
-- "Perikkalloor"). Colors cycle through the same extended 12-swatch palette
-- as 004_shakhas_perambra.sql, continuing its cycle from swatch index 12 so
-- the shakha color sequence stays consistent across migrations. Meghala
-- colors reuse the first four swatches of DEFAULT_COLORS (see
-- src/app/admin/meghalas/page.tsx), matching how the admin picker itself
-- cycles colors by row index.
--
-- Also switches org_settings.hierarchy_level from 'shakha' to 'meghala' (only
-- if it is still at its default) so these meghalas actually surface in the
-- HierarchyPicker/ScopePicker cascades instead of sitting unused — revert via
-- /admin/org-settings if that's not wanted.
--
-- Idempotent: safe to re-run.

insert into meghalas (name, slug, color) values
  ('Madampam',     'madampam',     '#6B46FF'),
  ('Rajapuram',    'rajapuram',    '#0F766E'),
  ('Perikkalloor', 'perikkalloor', '#B45309'),
  ('Changalery',   'changalery',   '#BE185D')
on conflict (name) do nothing;

insert into shakhas (name, slug, meghala_id, color) values
  -- Madampam
  ('Sreepuram',           'sreepuram',          (select id from meghalas where slug = 'madampam'), '#6B46FF'),
  ('Kozhikode',           'kozhikode',          (select id from meghalas where slug = 'madampam'), '#0F766E'),
  ('Madampam',            'madampam',           (select id from meghalas where slug = 'madampam'), '#B45309'),
  ('Thiroor',             'thiroor',            (select id from meghalas where slug = 'madampam'), '#BE185D'),
  ('Mankuzhy',            'mankuzhy',           (select id from meghalas where slug = 'madampam'), '#1D4ED8'),
  ('Kanamvayal',          'kanamvayal',         (select id from meghalas where slug = 'madampam'), '#15803D'),
  ('Chandhanakkampara',   'chandhanakkampara',  (select id from meghalas where slug = 'madampam'), '#B91C1C'),
  ('Manjakadu',           'manjakadu',          (select id from meghalas where slug = 'madampam'), '#4338CA'),
  ('Peringala',           'peringala',          (select id from meghalas where slug = 'madampam'), '#0891B2'),
  ('Payyavoor Town',      'payyavoor-town',     (select id from meghalas where slug = 'madampam'), '#C2410C'),
  ('Arayangad',           'arayangad',          (select id from meghalas where slug = 'madampam'), '#9D174D'),
  ('Pothukuzhy',          'pothukuzhy',         (select id from meghalas where slug = 'madampam'), '#065F46'),
  ('Panniyal',            'panniyal',           (select id from meghalas where slug = 'madampam'), '#6B46FF'),
  ('Michaelgiri',         'michaelgiri',        (select id from meghalas where slug = 'madampam'), '#0F766E'),
  ('Payyavoor',           'payyavoor',          (select id from meghalas where slug = 'madampam'), '#B45309'),
  ('Alex Nagar',          'alex-nagar',         (select id from meghalas where slug = 'madampam'), '#BE185D'),
  ('Kottoorvayal',        'kottoorvayal',       (select id from meghalas where slug = 'madampam'), '#1D4ED8'),
  ('Chamathachal',        'chamathachal',       (select id from meghalas where slug = 'madampam'), '#15803D'),
  ('Nuchiyad',            'nuchiyad',           (select id from meghalas where slug = 'madampam'), '#B91C1C'),

  -- Rajapuram
  ('Rajapuram',           'rajapuram',          (select id from meghalas where slug = 'rajapuram'), '#4338CA'),
  ('Malakkallu',          'malakkallu',         (select id from meghalas where slug = 'rajapuram'), '#0891B2'),
  ('Malom',               'malom',              (select id from meghalas where slug = 'rajapuram'), '#C2410C'),
  ('Kallar',              'kallar',             (select id from meghalas where slug = 'rajapuram'), '#9D174D'),
  ('Airode',              'airode',             (select id from meghalas where slug = 'rajapuram'), '#065F46'),
  ('Chullikara',          'chullikara',         (select id from meghalas where slug = 'rajapuram'), '#6B46FF'),
  ('Pookayam',            'pookayam',           (select id from meghalas where slug = 'rajapuram'), '#0F766E'),
  ('Ranipuram',           'ranipuram',          (select id from meghalas where slug = 'rajapuram'), '#B45309'),
  ('Kottody',             'kottody',            (select id from meghalas where slug = 'rajapuram'), '#BE185D'),
  ('Kanhangad',           'kanhangad',          (select id from meghalas where slug = 'rajapuram'), '#1D4ED8'),
  ('Odayamchal',          'odayamchal',         (select id from meghalas where slug = 'rajapuram'), '#15803D'),

  -- Perikkalloor
  ('Perikkalloor',        'perikkalloor',       (select id from meghalas where slug = 'perikkalloor'), '#B91C1C'),
  ('Thettamala',          'thettamala',         (select id from meghalas where slug = 'perikkalloor'), '#4338CA'),
  ('Pulinjal',            'pulinjal',           (select id from meghalas where slug = 'perikkalloor'), '#0891B2'),
  ('Eachome',             'eachome',            (select id from meghalas where slug = 'perikkalloor'), '#C2410C'),
  ('Kottathara',          'kottathara',         (select id from meghalas where slug = 'perikkalloor'), '#9D174D'),
  ('Christ Nagar',        'christ-nagar',       (select id from meghalas where slug = 'perikkalloor'), '#065F46'),
  ('Puthussery',          'puthussery',         (select id from meghalas where slug = 'perikkalloor'), '#6B46FF'),
  ('Kappiset',            'kappiset',           (select id from meghalas where slug = 'perikkalloor'), '#0F766E'),
  ('Pius Nagar',          'pius-nagar',         (select id from meghalas where slug = 'perikkalloor'), '#B45309'),

  -- Changalery
  ('Changalery',          'changalery',         (select id from meghalas where slug = 'changalery'), '#BE185D'),
  ('Attapady',            'attapady',           (select id from meghalas where slug = 'changalery'), '#1D4ED8'),
  ('Amarambalam',         'amarambalam',        (select id from meghalas where slug = 'changalery'), '#15803D'),
  ('Chulliyode',          'chulliyode',         (select id from meghalas where slug = 'changalery'), '#B91C1C'),
  ('Munderi',             'munderi',            (select id from meghalas where slug = 'changalery'), '#4338CA'),
  ('Mangalagiri',         'mangalagiri',        (select id from meghalas where slug = 'changalery'), '#0891B2'),
  ('Kanthalam',           'kanthalam',          (select id from meghalas where slug = 'changalery'), '#C2410C'),
  ('Mylampully',          'mylampully',         (select id from meghalas where slug = 'changalery'), '#9D174D')
on conflict (name) do nothing;

update org_settings set hierarchy_level = 'meghala' where hierarchy_level = 'shakha';
