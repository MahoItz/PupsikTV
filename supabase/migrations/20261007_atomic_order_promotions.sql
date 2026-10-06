-- Keep receipts after the source order is deleted, including the original response.
create table public.order_promotions (
  kind text not null check (kind in ('movie', 'game')),
  order_id bigint not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (kind, order_id)
);
alter table public.order_promotions enable row level security;
revoke all on public.order_promotions from public, anon, authenticated;

create function public.promote_order(p_kind text, p_order_id bigint, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_table text;
  v_order_table text;
  v_columns text;
  v_values text;
  v_row jsonb;
  v_response jsonb;
  v_sum numeric;
  v_count bigint;
begin
  if p_kind not in ('movie', 'game') or p_kind is null
     or p_order_id is null or p_order_id <= 0
     or jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb then
    raise exception 'Invalid order promotion payload';
  end if;

  -- Serialize retries even after the order row has disappeared.
  perform pg_advisory_xact_lock(hashtextextended('promote:' || p_kind || ':' || p_order_id, 0));
  select response into v_response from public.order_promotions
  where kind = p_kind and order_id = p_order_id;
  if found then
    return v_response;
  end if;

  v_table := case p_kind when 'movie' then 'movies' else 'games' end;
  v_order_table := case p_kind when 'movie' then 'Movie_Orders' else 'Game_Orders' end;

  execute format('select id from public.%I where id = $1 for update', v_order_table)
    into v_count using p_order_id;
  if v_count is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  -- The exclusive source-row lock also waits for order rating submissions,
  -- which hold a shared lock on this row until their transaction commits.


  -- Select only supplied columns, preserving database defaults for omitted fields.
  -- Identity/generated columns cannot be supplied, even by a direct RPC caller.
  if exists (
    select 1 from jsonb_object_keys(p_changes) k(key)
    where not exists (
      select 1 from pg_attribute a
      where a.attrelid = format('public.%I', v_table)::regclass
        and a.attname = k.key and a.attnum > 0 and not a.attisdropped
        and a.attname <> 'id' and a.attgenerated = '' and a.attidentity = ''
    )
  ) then
    raise exception 'Invalid promotion columns';
  end if;
  select string_agg(format('%I', key), ', ' order by key),
         string_agg(format('r.%I', key), ', ' order by key)
  into v_columns, v_values from jsonb_object_keys(p_changes) k(key);
  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) r returning to_jsonb(%I.*)',
    v_table, v_columns, v_values, v_table, v_table
  ) into v_row using p_changes;

  if p_kind = 'movie' then
    update public.ratings
    set movie_id = (v_row->>'id')::bigint, category = 'Movie', title = v_row->>'title'
    where movie_id = p_order_id and category = 'MovieOrder';
    select coalesce(sum(rating), 0), count(*) into v_sum, v_count
    from public.ratings where movie_id = (v_row->>'id')::bigint and category = 'Movie';
    update public.movies set rating_sum = v_sum, rating_count = v_count
    where id = (v_row->>'id')::bigint returning to_jsonb(movies.*) into v_row;
    v_response := jsonb_build_object('ok', true, 'row', v_row,
      'pendingRatingSum', v_sum, 'pendingRatingCount', v_count);
  else
    v_response := jsonb_build_object('ok', true, 'row', v_row);
  end if;

  execute format('delete from public.%I where id = $1', v_order_table) using p_order_id;
  insert into public.order_promotions(kind, order_id, response)
  values (p_kind, p_order_id, v_response);
  return v_response;
end;
$$;

create function public.promote_movie_order(p_order_id bigint, p_changes jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.promote_order('movie', p_order_id, p_changes); $$;

create function public.promote_game_order(p_order_id bigint, p_changes jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.promote_order('game', p_order_id, p_changes); $$;

revoke all on function public.promote_order(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.promote_movie_order(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.promote_game_order(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.promote_movie_order(bigint, jsonb) to service_role;
grant execute on function public.promote_game_order(bigint, jsonb) to service_role;

-- Coordinate order rating submissions with promotion.
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
    -- Use the same source-row lock as promotion before touching ratings.
    -- A rating submitted after promotion must not recreate orphan order ratings.
    perform id from public."Movie_Orders" where id = p_target_id for share;
    if not found then
      raise exception 'Order not found' using errcode = 'P0002';
    end if;
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
