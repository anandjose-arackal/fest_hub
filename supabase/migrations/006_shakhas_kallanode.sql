-- Kallanode shows up as a parish/shakha across the CML literature-fest
-- result sheets but was missing from the 12 shakhas seeded in 004. No parent
-- meghala (top-level / unassigned, matching the rest of 004). Color picked
-- from the same DEFAULT_COLORS palette, distinct from the existing 12.
-- Idempotent: safe to re-run.

insert into shakhas (name, slug, meghala_id, color) values
  ('Kallanode', 'kallanode', null, '#7C3AED')
on conflict (name) do nothing;
