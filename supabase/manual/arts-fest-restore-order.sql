-- Puts the arts fest's competitions back in their original display_order
-- (0–39), as it was before arts-fest-stages.sql renumbered them by stage.
-- Run in the Supabase SQL editor of the project you want to restore.
update feast_competitions fc
   set display_order = o.ord
  from (values
    ('30a4469e-4e11-4c40-bacd-8d7e1a1ce335'::uuid, 0),  -- Kathaprasangam Sub Junior
    ('ed0f0d32-d25c-48a3-9ab8-c5786306ef6f'::uuid, 1),  -- Kathaprasangam Junior
    ('4dbfa0de-e531-408a-a080-fdd0174588da'::uuid, 2),  -- Kathaprasangam Senior
    ('637b8f15-0d13-417b-a181-29e4694d9f54'::uuid, 3),  -- Folk Dance Sub Junior Girls
    ('909cdb0c-3838-40d3-8d97-3d7593507804'::uuid, 4),  -- Folk Dance Junior Girls
    ('f2290574-379d-49f5-8504-c27fb15b977b'::uuid, 5),  -- Parichamuttukali
    ('a70faded-64d1-4947-a3eb-c8a3a21065ca'::uuid, 6),  -- Speech Sub Junior Boys
    ('189b566e-a693-4f96-b378-d4de8245f7ca'::uuid, 7),  -- Speech Sub Junior Girls
    ('2d2cfb90-e711-4c5b-a65d-58105082ad2b'::uuid, 8),  -- Speech Junior Boys
    ('a8521279-df19-4885-b406-34237a0e008f'::uuid, 9),  -- Speech Junior Girls
    ('88a90051-6f17-47a7-ba66-705453c75819'::uuid, 10), -- Speech Senior Boys
    ('34084c3f-28a5-44a0-8e70-34a30fca9d29'::uuid, 11), -- Speech Senior Girls
    ('a95d84ba-ad6d-499f-b6ce-d5fa8ab4dc0b'::uuid, 12), -- Speech Super Senior Boys
    ('8f1f609e-61df-4f83-a3d8-c1946710716b'::uuid, 13), -- Speech Super Senior Girls
    ('c323b485-6308-433d-8b37-ccd8af6d616b'::uuid, 14), -- Speech Elder Men
    ('e6d200b1-f0b2-4255-9c2b-c7b6a2cdb534'::uuid, 15), -- Speech Elder Women
    ('773c4804-9cda-4a55-9b01-b750cd5f00da'::uuid, 16), -- Bible Tableau
    ('ac9e77e6-039f-4a79-8e37-5b5009d0472e'::uuid, 17), -- Bible Reading Sub Junior Boys
    ('b31a7e82-137f-4815-a90a-0fac83ec5cab'::uuid, 18), -- Bible Reading Sub Junior Girls
    ('fa39bf6c-19e3-43dc-b42d-dd8c2e41df35'::uuid, 19), -- Margamkali
    ('e06060cc-8463-4e5c-bd2e-7b4e6b038890'::uuid, 20), -- Mission Anthem
    ('6d7ad7f7-9db0-4978-b839-a2132acaa0e6'::uuid, 21), -- Mission Quiz Junior Boys
    ('a74d6dc0-3de9-4465-8fcb-b27d7d84516b'::uuid, 22), -- Mission Quiz Junior Girls
    ('421ad693-f779-4cbe-8851-d4db52eee20e'::uuid, 23), -- Mission Quiz Senior Boys
    ('c2fe9c8f-97f9-49f1-aded-9c92ce67627a'::uuid, 24), -- Mission Quiz Senior Girls
    ('f7387fb2-eab8-44a5-9b35-013f3bbc33ee'::uuid, 25), -- Mission Quiz Super Senior Boys
    ('974916ea-13bd-40e2-bebc-3c5754fec143'::uuid, 26), -- Mission Quiz Super Senior Girls
    ('9634357e-abfb-4dc5-9cd5-b6e814c389d3'::uuid, 27), -- Mission Quiz Elder Men
    ('6ecad345-960b-49fc-930d-378edd5b598f'::uuid, 28), -- Mission Quiz Elder Women
    ('f156a5be-5d4b-4731-af5a-63f36d4336a1'::uuid, 29), -- Solo Song Sub Junior Boys
    ('a8565138-500f-45e3-8c8c-b071917cf701'::uuid, 30), -- Solo Song Sub Junior Girls
    ('65fa86be-c5e4-4594-b91a-9452486d69f1'::uuid, 31), -- Solo Song Junior Boys
    ('ef8eb6ac-7a56-47c2-9422-58c14009a26b'::uuid, 32), -- Solo Song Junior Girls
    ('6fb643da-980b-4f7f-83f8-6c1f2482c5c5'::uuid, 33), -- Solo Song Senior Boys
    ('b9ceb7fa-860e-4649-bb55-3b10da2e901b'::uuid, 34), -- Solo Song Senior Girls
    ('2cae4e3f-e57e-4627-8d2c-194e70306360'::uuid, 35), -- Solo Song Super Senior Boys
    ('351d2df2-eac9-486c-ae2c-3bc6d1c13148'::uuid, 36), -- Solo Song Super Senior Girls
    ('241ae272-d054-42e6-a9bf-74992470adbb'::uuid, 37), -- Solo Song Elder Men
    ('280c1f3e-df53-4424-a6b3-caae5f23bdd9'::uuid, 38), -- Solo Song Elder Women
    ('b0db5e74-5a6c-4f03-b65f-fbc21e2f870f'::uuid, 39)  -- Group Song
  ) as o(id, ord)
 where fc.id = o.id;
