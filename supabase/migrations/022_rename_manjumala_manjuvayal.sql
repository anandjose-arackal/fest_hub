-- Rename shakha "Manjumala" (Kodenchery meghala, Thamarassery diocese) to its correct name "Manjuvayal".
-- Idempotent: no-op once renamed, or where the shakha doesn't exist.
UPDATE public.shakhas s
SET name = 'Manjuvayal'
FROM public.meghalas m
JOIN public.dioceses d ON d.id = m.diocese_id
WHERE s.meghala_id = m.id
  AND s.name = 'Manjumala'
  AND m.name = 'Kodenchery'
  AND d.name = 'Thamarassery'
  AND NOT EXISTS (
    SELECT 1 FROM public.shakhas x WHERE x.meghala_id = m.id AND x.name = 'Manjuvayal'
  );
