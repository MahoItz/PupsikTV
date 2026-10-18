-- Expand the existing counter without changing saved values or RLS policies.
alter table public."Game_Orders"
drop constraint game_orders_streams_completed_check,
add constraint game_orders_streams_completed_check
check (streams_completed >= 0 and streams_completed <= 10);
