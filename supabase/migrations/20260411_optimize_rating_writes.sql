-- Deduplicate ratings before adding uniqueness constraints.
with ranked as (
  select
    id,
    row_number() over (
      partition by movie_id, category, user_id
      order by id desc
    ) as rn
  from public.ratings
  where movie_id is not null
    and category is not null
    and user_id is not null
)
delete from public.ratings r
using ranked
where r.id = ranked.id
  and ranked.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by trailer_id, user_id
      order by id desc
    ) as rn
  from public.trailer_ratings
  where trailer_id is not null
    and user_id is not null
)
delete from public.trailer_ratings tr
using ranked
where tr.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists ratings_movie_category_user_uidx
  on public.ratings (movie_id, category, user_id);

create index if not exists ratings_movie_category_idx
  on public.ratings (movie_id, category);

create unique index if not exists trailer_ratings_trailer_user_uidx
  on public.trailer_ratings (trailer_id, user_id);

create index if not exists trailer_ratings_trailer_idx
  on public.trailer_ratings (trailer_id);

create or replace function public.submit_movie_rating(
  p_target_id bigint,
  p_target_type text,
  p_rating numeric,
  p_user_id text,
  p_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := lower(trim(coalesce(p_target_type, 'movie')));
  v_category text;
  v_existing_id bigint;
  v_previous_rating numeric(10, 2);
  v_delta numeric(10, 2);
  v_count_delta integer := 0;
  v_updated_existing boolean := false;
  v_movie_row public.movies%rowtype;
  v_game_row public.games%rowtype;
begin
  if p_target_id is null or p_target_id <= 0 then
    raise exception 'Invalid target_id';
  end if;

  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'Invalid user_id';
  end if;

  if p_rating is null or p_rating < 0 or p_rating > 11 then
    raise exception 'Invalid rating';
  end if;

  if v_target_type = 'order' then
    v_category := 'MovieOrder';
  elsif v_target_type = 'game' then
    v_category := 'Games';
  else
    v_target_type := 'movie';
    v_category := 'Movie';
  end if;

  select id, rating
  into v_existing_id, v_previous_rating
  from public.ratings
  where movie_id = p_target_id
    and category = v_category
    and user_id = left(btrim(p_user_id), 255)
  for update;

  if found then
    update public.ratings
    set rating = round(p_rating::numeric, 2),
        title = left(nullif(btrim(coalesce(p_title, '')), ''), 500)
    where id = v_existing_id;

    v_delta := round(p_rating::numeric, 2) - coalesce(v_previous_rating, 0);
    v_updated_existing := true;
  else
    insert into public.ratings (
      movie_id,
      rating,
      source,
      category,
      title,
      user_id
    )
    values (
      p_target_id,
      round(p_rating::numeric, 2),
      'user',
      v_category,
      left(nullif(btrim(coalesce(p_title, '')), ''), 500),
      left(btrim(p_user_id), 255)
    );

    v_delta := round(p_rating::numeric, 2);
    v_count_delta := 1;
  end if;

  if v_target_type = 'movie' then
    update public.movies
    set rating_sum = coalesce(rating_sum, 0) + v_delta,
        rating_count = greatest(coalesce(rating_count, 0) + v_count_delta, 0)
    where id = p_target_id
    returning * into v_movie_row;

    return jsonb_build_object(
      'ok', true,
      'updatedExisting', v_updated_existing,
      'movie', to_jsonb(v_movie_row)
    );
  end if;

  if v_target_type = 'game' then
    update public.games
    set game_rating_sum = coalesce(game_rating_sum, 0) + v_delta,
        game_rating_count = greatest(coalesce(game_rating_count, 0) + v_count_delta, 0)
    where id = p_target_id
    returning * into v_game_row;

    return jsonb_build_object(
      'ok', true,
      'updatedExisting', v_updated_existing,
      'game', to_jsonb(v_game_row)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'updatedExisting', v_updated_existing
  );
end;
$$;

create or replace function public.submit_trailer_rating(
  p_trailer_id bigint,
  p_rating numeric,
  p_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id bigint;
  v_previous_rating numeric(10, 2);
  v_delta numeric(10, 2);
  v_count_delta integer := 0;
  v_updated_existing boolean := false;
  v_trailer_row public.trailer_watchlist%rowtype;
begin
  if p_trailer_id is null or p_trailer_id <= 0 then
    raise exception 'Invalid trailer_id';
  end if;

  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'Invalid user_id';
  end if;

  if p_rating is null or p_rating < 0 or p_rating > 11 then
    raise exception 'Invalid rating';
  end if;

  select id, rating
  into v_existing_id, v_previous_rating
  from public.trailer_ratings
  where trailer_id = p_trailer_id
    and user_id = left(btrim(p_user_id), 255)
  for update;

  if found then
    update public.trailer_ratings
    set rating = round(p_rating::numeric, 2)
    where id = v_existing_id;

    v_delta := round(p_rating::numeric, 2) - coalesce(v_previous_rating, 0);
    v_updated_existing := true;
  else
    insert into public.trailer_ratings (
      trailer_id,
      rating,
      user_id,
      source
    )
    values (
      p_trailer_id,
      round(p_rating::numeric, 2),
      left(btrim(p_user_id), 255),
      'user'
    );

    v_delta := round(p_rating::numeric, 2);
    v_count_delta := 1;
  end if;

  update public.trailer_watchlist
  set viewer_rating_sum = coalesce(viewer_rating_sum, 0) + v_delta,
      viewer_rating_count = greatest(coalesce(viewer_rating_count, 0) + v_count_delta, 0)
  where id = p_trailer_id
  returning * into v_trailer_row;

  return jsonb_build_object(
    'ok', true,
    'updatedExisting', v_updated_existing,
    'trailer', to_jsonb(v_trailer_row)
  );
end;
$$;

revoke all on function public.submit_movie_rating(bigint, text, numeric, text, text) from public;
revoke all on function public.submit_trailer_rating(bigint, numeric, text) from public;
