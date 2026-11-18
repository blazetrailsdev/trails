const db = {
  adapter: process.env.SPIKE_ADAPTER ?? "node-sqlite",
  database: process.env.SQLITE_PATH ?? "db/spike.sqlite3",
  maxConnections: 1,
};
export default { development: db, test: db, production: db };
