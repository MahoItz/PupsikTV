import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const apiUrl = new URL('../api/admin.js', import.meta.url);
const context = vm.createContext({
  require: createRequire(apiUrl),
  module: { exports: {} },
  process,
});
vm.runInContext(readFileSync(apiUrl, 'utf8'), context);

for (const kind of ['Movie', 'Game']) {
  test(`${kind} promotion uses one RPC and preserves its response`, async () => {
    const calls = [];
    const response = { ok: true, row: { id: 17 } };
    const supabase = {
      rpc: async (...args) => {
        calls.push(args);
        return { data: response, error: null };
      },
    };
    const payload = {
      orderId: 3,
      [kind.toLowerCase()]: { title: 'Title', id: 999, unknown: true },
    };
    const result = await context[`promote${kind}Order`](supabase, payload);
    assert.equal(result.body, response);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `promote_${kind.toLowerCase()}_order`);
    assert.equal(
      JSON.stringify(calls[0][1]),
      JSON.stringify({
        p_order_id: 3,
        p_changes: { title: 'Title' },
      })
    );
    const error = new Error('Database transaction failed');
    await assert.rejects(
      context[`promote${kind}Order`](
        {
          rpc: async () => ({ data: null, error }),
        },
        payload
      ),
      error
    );
    const invalid = await context[`promote${kind}Order`](supabase, {
      ...payload,
      orderId: 0,
    });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 1);
  });
}

// Run with PGLITE_MODULE pointing at an installed @electric-sql/pglite module.
// The fixture database is isolated; no production connection is used.
test(
  'database promotions roll back failures and return receipts on retry',
  {
    skip: !process.env.PGLITE_MODULE,
  },
  async () => {
    const { PGlite } = await import(process.env.PGLITE_MODULE);
    const db = new PGlite();
    try {
      await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.movies (
        id bigserial primary key, title text, year integer default 2026,
        rating_sum numeric default 0, rating_count bigint default 0
      );
      create table public.games (
        id bigserial primary key, title text,
        game_rating_sum numeric default 0, game_rating_count bigint default 0
      );
      create table public."Movie_Orders" (id bigint primary key);
      create table public."Game_Orders" (id bigint primary key);
      create table public.ratings (
        id bigserial primary key, movie_id bigint, category text, rating numeric,
        title text, source text, user_id text,
        unique(movie_id, category, user_id)
      );
    `);
      await db.exec(
        readFileSync(
          new URL(
            '../supabase/migrations/20261007_atomic_order_promotions.sql',
            import.meta.url
          ),
          'utf8'
        )
      );
      await db.exec(`
      insert into public."Movie_Orders" values (3);
      insert into public."Game_Orders" values (3);
      select public.submit_movie_rating(3, 'order', 8, 'alice', 'Old');
      select public.submit_movie_rating(3, 'order', 6, 'bob', 'Old');
      create function public.fail_delete() returns trigger language plpgsql as $$
      begin raise exception 'Injected failure'; end; $$;
      create trigger fail_movie before delete on public."Movie_Orders"
        for each row execute function public.fail_delete();
      create trigger fail_game before delete on public."Game_Orders"
        for each row execute function public.fail_delete();
    `);
      for (const kind of ['movie', 'game']) {
        const promote = (id, title = 'New') =>
          db.query(
            `select public.promote_${kind}_order($1, $2::jsonb) as response`,
            [id, JSON.stringify({ title })]
          );
        const table = kind === 'movie' ? 'movies' : 'games';
        const orderTable = kind === 'movie' ? 'Movie_Orders' : 'Game_Orders';
        await assert.rejects(promote(3), /Injected failure/);
        assert.equal(
          (await db.query(`select count(*)::int as n from public.${table}`))
            .rows[0].n,
          0
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from public."${orderTable}"`
            )
          ).rows[0].n,
          1
        );
        assert.equal(
          (
            await db.query(
              'select count(*)::int as n from public.order_promotions'
            )
          ).rows[0].n,
          kind === 'movie' ? 0 : 1
        );
        if (kind === 'movie') {
          assert.equal(
            (
              await db.query(
                "select count(*)::int as n from public.ratings where category = 'MovieOrder'"
              )
            ).rows[0].n,
            2
          );
        }
        await db.exec(`drop trigger fail_${kind} on public."${orderTable}"`);
        const first = (await promote(3)).rows[0].response;
        assert.deepEqual(
          (await promote(3, 'Retry with different title')).rows[0].response,
          first
        );
        assert.equal(
          (await db.query(`select count(*)::int as n from public.${table}`))
            .rows[0].n,
          1
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from public."${orderTable}"`
            )
          ).rows[0].n,
          0
        );
        await assert.rejects(promote(999), /Order not found/);
        if (kind === 'movie') {
          assert.equal(first.pendingRatingSum, 14);
          assert.equal(first.pendingRatingCount, 2);
          assert.equal(first.row.rating_sum, 14);
          assert.equal(first.row.year, 2026);
          await assert.rejects(
            db.query(
              "select public.submit_movie_rating(3, 'order', 9, 'late', 'Old')"
            ),
            /Order not found/
          );
          assert.equal(
            (
              await db.query(
                "select count(*)::int as n from public.ratings where category = 'MovieOrder'"
              )
            ).rows[0].n,
            0
          );
        }
      }
      await db.exec('set role authenticated');
      await assert.rejects(
        db.query(
          'select public.promote_movie_order(3, \'{"title":"Unauthorized"}\')'
        ),
        /permission denied/
      );
    } finally {
      await db.close();
    }
  }
);
