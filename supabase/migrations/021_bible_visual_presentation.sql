-- The competition seeded as "Bible Tableau" is called "Bible Visual
-- Presentation" at the fest (its Malayalam name, ബൈബിൾ ദൃശ്യാവതരണം, already
-- says so). Rename the English name. Idempotent: matches only the old name.
update competitions
   set name_en = 'Bible Visual Presentation'
 where name_en = 'Bible Tableau';
