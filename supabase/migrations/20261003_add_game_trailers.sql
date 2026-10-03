begin;

alter table public.trailer_watchlist
  add column if not exists media_type text not null default 'film',
  add column if not exists igdb_id bigint,
  add column if not exists game_data jsonb,
  add column if not exists game_cached_at timestamptz;

alter table public.trailer_watchlist
  add constraint trailer_watchlist_media_type_check check (media_type in ('film', 'game')),
  add constraint trailer_watchlist_catalog_check check (
    (media_type = 'film' and igdb_id is null and game_data is null and game_cached_at is null)
    or (media_type = 'game' and kinopoisk_id is null and kinopoisk_data is null and kinopoisk_cached_at is null)
  ),
  add constraint trailer_watchlist_igdb_id_check check (igdb_id is null or igdb_id > 0);

create index if not exists trailer_watchlist_igdb_idx
  on public.trailer_watchlist (igdb_id) where igdb_id is not null;

commit;
