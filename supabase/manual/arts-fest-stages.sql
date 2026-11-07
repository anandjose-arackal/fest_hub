-- Arts fest (slug 'arts-fest'): stages 1–10 and each stage's running order.
-- One-off data, not a schema migration: run it once in the Supabase SQL
-- editor. Safe to re-run — stages are upserted by (feast_id, number) and each
-- competition is pointed at its stage again.
--
-- display_order = stage × 100 + position, so competitions sort by stage then
-- running order everywhere display_order is used.
--
-- Not here: Stage 3 #4 "Sisters' Hrudaya Lilli" and Stage 5 #4 "Hrudaya Lilli"
-- belong to a separate Hrudaya Lilli fest.
-- Stage 8 lists Senior, Elder, Junior, Super Senior; each has a boys' and a
-- girls' quiz, held together: both get the same position in the order.
-- "Light Music" is the fest's Solo Song (സംഗീതം) competition; "Bible Visual
-- Presentation" is the old Bible Tableau (renamed by migration 021); "Parichamuttu" is Parichamuttukali.

do $$
declare
  fid uuid;
begin
  select id into fid from feasts where slug = 'arts-fest';
  if fid is null then raise exception 'feast arts-fest not found'; end if;

  insert into stages (feast_id, number, title) values
    (fid,  1, 'Speech'),
    (fid,  2, 'Speech & Bible Reading'),
    (fid,  3, 'Speech'),
    (fid,  4, 'Kathaprasangam & Bible Reading'),
    (fid,  5, 'Light Music'),
    (fid,  6, 'Light Music'),
    (fid,  7, 'Light Music & Group Song'),
    (fid,  8, 'Mission Quiz'),
    (fid,  9, 'Folk Dance'),
    (fid, 10, 'Main Stage')
  on conflict (feast_id, number) do update set title = excluded.title;

  -- (stage number, position, feast_competitions.id)
  update feast_competitions fc
     set stage_id = s.id,
         display_order = o.stage * 100 + o.pos
    from (values
      -- Stage 1 – Speech
      (1, 1, 'a70faded-64d1-4947-a3eb-c8a3a21065ca'::uuid), -- Sub Junior Boys
      (1, 2, 'a8521279-df19-4885-b406-34237a0e008f'::uuid), -- Junior Girls
      (1, 3, 'c323b485-6308-433d-8b37-ccd8af6d616b'::uuid), -- Elder Men
      (1, 4, 'a95d84ba-ad6d-499f-b6ce-d5fa8ab4dc0b'::uuid), -- Super Senior Boys
      -- Stage 2 – Speech & Bible Reading
      (2, 1, '189b566e-a693-4f96-b378-d4de8245f7ca'::uuid), -- Sub Junior Girls Speech
      (2, 2, 'ac9e77e6-039f-4a79-8e37-5b5009d0472e'::uuid), -- Sub Junior Boys Bible Reading
      (2, 3, '88a90051-6f17-47a7-ba66-705453c75819'::uuid), -- Senior Boys Speech
      (2, 4, '8f1f609e-61df-4f83-a3d8-c1946710716b'::uuid), -- Super Senior Girls Speech
      -- Stage 3 – Speech
      (3, 1, '2d2cfb90-e711-4c5b-a65d-58105082ad2b'::uuid), -- Junior Boys
      (3, 2, '34084c3f-28a5-44a0-8e70-34a30fca9d29'::uuid), -- Senior Girls
      (3, 3, 'e6d200b1-f0b2-4255-9c2b-c7b6a2cdb534'::uuid), -- Elder Women
      -- Stage 4 – Kathaprasangam & Bible Reading
      (4, 1, 'ed0f0d32-d25c-48a3-9ab8-c5786306ef6f'::uuid), -- Kathaprasangam Junior
      (4, 2, 'b31a7e82-137f-4815-a90a-0fac83ec5cab'::uuid), -- Bible Reading Sub Junior Girls
      (4, 3, '30a4469e-4e11-4c40-bacd-8d7e1a1ce335'::uuid), -- Kathaprasangam Sub Junior
      (4, 4, '4dbfa0de-e531-408a-a080-fdd0174588da'::uuid), -- Kathaprasangam Senior
      -- Stage 5 – Light Music
      (5, 1, 'a8565138-500f-45e3-8c8c-b071917cf701'::uuid), -- Sub Junior Girls
      (5, 2, '65fa86be-c5e4-4594-b91a-9452486d69f1'::uuid), -- Junior Boys
      (5, 3, '351d2df2-eac9-486c-ae2c-3bc6d1c13148'::uuid), -- Super Senior Girls
      -- Stage 6 – Light Music
      (6, 1, 'ef8eb6ac-7a56-47c2-9422-58c14009a26b'::uuid), -- Junior Girls
      (6, 2, '2cae4e3f-e57e-4627-8d2c-194e70306360'::uuid), -- Super Senior Boys
      (6, 3, '241ae272-d054-42e6-a9bf-74992470adbb'::uuid), -- Elder Men
      (6, 4, 'b9ceb7fa-860e-4649-bb55-3b10da2e901b'::uuid), -- Senior Girls
      -- Stage 7 – Light Music & Group Song
      (7, 1, 'f156a5be-5d4b-4731-af5a-63f36d4336a1'::uuid), -- Sub Junior Boys
      (7, 2, '280c1f3e-df53-4424-a6b3-caae5f23bdd9'::uuid), -- Elder Women
      (7, 3, '6fb643da-980b-4f7f-83f8-6c1f2482c5c5'::uuid), -- Senior Boys
      (7, 4, 'b0db5e74-5a6c-4f03-b65f-fbc21e2f870f'::uuid), -- Group Song
      (7, 5, 'e06060cc-8463-4e5c-bd2e-7b4e6b038890'::uuid), -- Mission Anthem
      -- Stage 8 – Mission Quiz: each category's boys and girls together (same position)
      (8, 1, '421ad693-f779-4cbe-8851-d4db52eee20e'::uuid), -- Senior Boys
      (8, 1, 'c2fe9c8f-97f9-49f1-aded-9c92ce67627a'::uuid), -- Senior Girls
      (8, 2, '9634357e-abfb-4dc5-9cd5-b6e814c389d3'::uuid), -- Elder Men
      (8, 2, '6ecad345-960b-49fc-930d-378edd5b598f'::uuid), -- Elder Women
      (8, 3, '6d7ad7f7-9db0-4978-b839-a2132acaa0e6'::uuid), -- Junior Boys
      (8, 3, 'a74d6dc0-3de9-4465-8fcb-b27d7d84516b'::uuid), -- Junior Girls
      (8, 4, 'f7387fb2-eab8-44a5-9b35-013f3bbc33ee'::uuid), -- Super Senior Boys
      (8, 4, '974916ea-13bd-40e2-bebc-3c5754fec143'::uuid), -- Super Senior Girls
      -- Stage 9 – Folk Dance
      (9, 1, '909cdb0c-3838-40d3-8d97-3d7593507804'::uuid), -- Junior Girls
      (9, 2, '637b8f15-0d13-417b-a181-29e4694d9f54'::uuid), -- Sub Junior Girls
      -- Stage 10
      (10, 1, 'fa39bf6c-19e3-43dc-b42d-dd8c2e41df35'::uuid), -- Margamkali
      (10, 2, 'f2290574-379d-49f5-8504-c27fb15b977b'::uuid), -- Parichamuttukali
      (10, 3, '773c4804-9cda-4a55-9b01-b750cd5f00da'::uuid)  -- Bible Visual Presentation
    ) as o(stage, pos, fc_id)
    join stages s on s.feast_id = fid and s.number = o.stage
   where fc.id = o.fc_id and fc.feast_id = fid;
end $$;

-- Check: every arts-fest competition now has a stage (expect 0 rows).
select c.name_en, fc.id
  from feast_competitions fc join competitions c on c.id = fc.competition_id
 where fc.feast_id = (select id from feasts where slug = 'arts-fest') and fc.stage_id is null;
