-- Add reading pace columns to activities table
-- 1) Colonnes de vitesse/pace (par session)
alter table public.activities
  add column if not exists reading_speed_pph numeric,              -- pages per hour
  add column if not exists reading_pace_min_per_page numeric,      -- min per page
  add column if not exists reading_speed_wpm integer,              -- words per minute
  add column if not exists words_per_page integer;                 -- base used for WPM

-- 2) Index utile (stats + weekly queries)
create index if not exists idx_activities_user_created_at
  on public.activities (user_id, created_at desc);

-- (optionnel) si tu veux éviter des valeurs négatives
alter table public.activities
  add constraint if not exists chk_activities_reading_stats_nonneg
  check (
    (reading_speed_pph is null or reading_speed_pph >= 0) and
    (reading_pace_min_per_page is null or reading_pace_min_per_page >= 0) and
    (reading_speed_wpm is null or reading_speed_wpm >= 0) and
    (words_per_page is null or words_per_page >= 0)
  );

