-- Age-category cut-offs: super_senior now starts 1986-01-01, elder ends
-- 1985-12-31 (matches the Mananthavady databank). Idempotent.

update competition_categories set min_dob = '1986-01-01'
where slug = 'super_senior' and min_dob is distinct from '1986-01-01';

update competition_categories set max_dob = '1985-12-31'
where slug = 'elder' and max_dob is distinct from '1985-12-31';
