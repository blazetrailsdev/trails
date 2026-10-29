const defaults = {
  adapter: "sqlite3",
  maxConnections: Number(process.env.RAILS_MAX_THREADS ?? 5),
  timeout: 5000,
};

export default {
  development: {
    ...defaults,
    database: "storage/development.sqlite3",
  },
  test: {
    ...defaults,
    database: "storage/test.sqlite3",
  },
  production: {
    ...defaults,
    database: process.env.SQLITE_PATH,
    pragmas: {
      mmap_size: 536870912,
      cache_size: -65536,
    },
  },
};
