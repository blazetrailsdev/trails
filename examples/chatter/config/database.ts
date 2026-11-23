const defaults = {
  adapter: "mysql2",
  encoding: "utf8mb4",
  pool: Number(process.env.TRAILS_MAX_THREADS ?? 5),
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME ?? "root",
  password: process.env.DB_PASSWORD,
};

export default {
  development: { ...defaults, database: "chatter_development" },
  test: { ...defaults, database: "chatter_test" },
  // `dokku mysql:link` sets DATABASE_URL, which Active Record merges over this entry.
  production: { ...defaults, database: "chatter_production", url: process.env.DATABASE_URL },
};
