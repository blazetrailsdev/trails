// node:sqlite ships inside Electron's Node, so the desktop build needs no
// native module rebuilt against Electron's ABI. electron/main.ts points
// BOOKMARKS_DATABASE at the user's app-data directory.
const defaults = { adapter: "node-sqlite", maxConnections: 1, timeout: 5000 };

export default {
  development: { ...defaults, database: "storage/development.sqlite3" },
  test: { ...defaults, database: "storage/test.sqlite3" },
  production: {
    ...defaults,
    database: process.env.BOOKMARKS_DATABASE ?? "storage/production.sqlite3",
  },
};
