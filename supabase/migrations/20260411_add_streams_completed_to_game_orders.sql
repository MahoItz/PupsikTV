alter table public."Game_Orders"
add column if not exists streams_completed integer not null default 0;

update public."Game_Orders"
set streams_completed = 0
where streams_completed is null;

alter table public."Game_Orders"
drop constraint if exists game_orders_streams_completed_check;

alter table public."Game_Orders"
add constraint game_orders_streams_completed_check
check (streams_completed >= 0 and streams_completed <= 3);
