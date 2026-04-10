alter table public.movies
  add column if not exists watch_source text not null default 'stream'
  check (watch_source in ('stream', 'discord'));

alter table public."Movie_Orders"
  add column if not exists watch_source text not null default 'stream'
  check (watch_source in ('stream', 'discord'));

update public.movies
set watch_source = 'stream'
where watch_source is null;

update public."Movie_Orders"
set watch_source = 'stream'
where watch_source is null;
