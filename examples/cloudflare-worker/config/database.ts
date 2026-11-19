import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";

const db = { adapter: "postgresql", url: "postgres://trails:trails@localhost:5432/trails" };
export default { development: db, test: db, production: db };
