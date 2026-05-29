/**
 * Connection config — the analog of Rails' `config/database.yml`. Keyed by
 * environment; `TRAILS_ENV` selects the entry (default "development").
 *
 * `Base.establishConnection()` with no arguments reads this file, exactly
 * like Rails reads `database.yml`. To use Postgres or MySQL, change the
 * `adapter`/`database`/`host` here — the model code is adapter-agnostic.
 *
 * We key on `TRAILS_ENV`, not `NODE_ENV`: the JS ecosystem treats `NODE_ENV`
 * as a build-time hint ("production" vs "development" bundling), so reusing it
 * to pick a database silently selects the wrong one in many setups. `NODE_ENV`
 * is honored only as a fallback.
 */
const config = {
  development: { adapter: "sqlite3", database: "db/development.sqlite3", pool: 5 },
  test: { adapter: "sqlite3", database: ":memory:", pool: 1 },
  production: { adapter: "sqlite3", database: "db/production.sqlite3", pool: 5 },
};

export default config;
