const defaults = { adapter: "node-sqlite", maxConnections: 1, timeout: 5000 };

export default {
  development: { ...defaults, database: "storage/development.sqlite3" },
  test: { ...defaults, database: "storage/test.sqlite3" },
  production: {
    ...defaults,
    database: process.env.BOOKMARKS_DATABASE ?? "storage/production.sqlite3",
  },
};
