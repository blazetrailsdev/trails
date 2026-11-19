import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";

/**
 * Read by the Node-side tooling (`trails build`, `trails-tsc-views`, `bin/trails`). The Worker uploads no
 * `config/database.ts`, so there the configuration is `DATABASE_URL`, seated from the Hyperdrive binding in
 * `worker/index.ts`.
 */
const db = { adapter: "postgresql", url: "postgres://trails:trails@localhost:5432/trails" };
export default { development: db, test: db, production: db };
