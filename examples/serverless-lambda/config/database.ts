const db = process.env.PGHOST
  ? {
      adapter: "postgresql",
      host: process.env.PGHOST,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE ?? "trails",
      // pg reads sslmode only from a connection string; RDS rejects a non-TLS connection.
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
      maxConnections: 1,
    }
  : {
      adapter: process.env.SPIKE_ADAPTER ?? "node-sqlite",
      database: process.env.SQLITE_PATH ?? "db/spike.sqlite3",
      maxConnections: 1,
    };
export default { development: db, test: db, production: db };
