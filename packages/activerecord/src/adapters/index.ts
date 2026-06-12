// Only the abstract base is re-exported here: it pulls in no client library, so
// importing this barrel never eagerly loads an optional SQLite driver. The
// concrete, driver-bound subclasses (BetterSQLite3Adapter / NodeSQLiteAdapter /
// ExpoSQLiteAdapter) are reachable via their own
// `./connection-adapters/<x>-adapter.js` export entries, which is where the
// optional `better-sqlite3` / `expo-sqlite` peer dep actually gets loaded.
export { AbstractSQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
export { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
export { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
