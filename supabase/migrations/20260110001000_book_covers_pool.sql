/*
  Book covers pool (deterministic by book_key)
  - Storage bucket: book-covers (public read)
  - Table: public.book_covers (1 row per book_key)
  - RLS: public read, auth insert, owner update/delete, service_role bypass
  - updated_at trigger
  - Storage policies: public read, auth insert, owner update/delete
*/

-- 0) Extensions (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) Storage bucket: book-covers (public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  10485760, -- 10MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public;

-- 2) Table: public.book_covers (create or repair)
create table if not exists public.book_covers (
  id uuid primary key default gen_random_uuid(),
  book_key text not null,
  storage_path text not null,
  source text not null default 'user', -- 'user'|'openlibrary'|'google'|'manual'
  width int null,
  height int null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table existed but was missing columns, add them
alter table public.book_covers
  add column if not exists book_key text,
  add column if not exists storage_path text,
  add column if not exists source text not null default 'user',
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Ensure NOT NULL where needed (only if column exists and currently nullable)
-- (Postgres will error if there are nulls; so we do a safe backfill first)
update public.book_covers set book_key = coalesce(book_key, '') where book_key is null;
update public.book_covers set storage_path = coalesce(storage_path, '') where storage_path is null;

alter table public.book_covers alter column book_key set not null;
alter table public.book_covers alter column storage_path set not null;

-- 2b) Unique constraint on book_key (deterministic pool)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'book_covers_book_key_unique'
      and conrelid = 'public.book_covers'::regclass
  ) then
    alter table public.book_covers
      add constraint book_covers_book_key_unique unique (book_key);
  end if;
end $$;

-- 2c) Indexes (optional but useful)
create index if not exists idx_book_covers_created_by on public.book_covers(created_by);
create index if not exists idx_book_covers_source on public.book_covers(source);
create index if not exists idx_book_covers_created_at_desc on public.book_covers(created_at desc);

-- 3) RLS
alter table public.book_covers enable row level security;

drop policy if exists "Public can read book covers" on public.book_covers;
create policy "Public can read book covers"
on public.book_covers
for select
to public
using (true);

drop policy if exists "Authenticated can insert book covers" on public.book_covers;
create policy "Authenticated can insert book covers"
on public.book_covers
for insert
to authenticated
with check (
  created_by = auth.uid()
  or auth.role() = 'service_role'
);

drop policy if exists "Owner can update book covers" on public.book_covers;
create policy "Owner can update book covers"
on public.book_covers
for update
to authenticated
using (
  created_by = auth.uid()
  or auth.role() = 'service_role'
)
with check (
  created_by = auth.uid()
  or auth.role() = 'service_role'
);

drop policy if exists "Owner can delete book covers" on public.book_covers;
create policy "Owner can delete book covers"
on public.book_covers
for delete
to authenticated
using (
  created_by = auth.uid()
  or auth.role() = 'service_role'
);

-- 4) updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_book_covers_set_updated_at on public.book_covers;
create trigger trg_book_covers_set_updated_at
before update on public.book_covers
for each row
execute function public.set_updated_at();

-- 5) Storage policies on storage.objects for bucket book-covers
-- Note: storage.objects has an "owner" column. We enforce owner = auth.uid() for updates/deletes.

-- Public read (usually bucket public=true is enough, but keep policy explicit)
drop policy if exists "Public can read book-covers bucket" on storage.objects;
create policy "Public can read book-covers bucket"
on storage.objects
for select
to public
using (bucket_id = 'book-covers');

-- Authenticated insert into bucket
drop policy if exists "Authenticated can upload book covers" on storage.objects;
create policy "Authenticated can upload book covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book-covers'
  and owner = auth.uid()
);

-- Owner can update files
drop policy if exists "Owner can update book covers files" on storage.objects;
create policy "Owner can update book covers files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'book-covers'
  and owner = auth.uid()
)
with check (
  bucket_id = 'book-covers'
  and owner = auth.uid()
);

-- Owner can delete files
drop policy if exists "Owner can delete book covers files" on storage.objects;
create policy "Owner can delete book covers files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'book-covers'
  and owner = auth.uid()
);

