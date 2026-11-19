import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";

// Read by `trails build`, `trails-tsc-views` and `bin/trails` under Node. A Worker's filesystem holds no
// `config/database.ts`, so there the configuration is `DATABASE_URL`, seated from the Hyperdrive binding.
const db = { adapter: "postgresql", url: "postgres://trails:trails@localhost:5432/trails" };
export default { development: db, test: db, production: db };
