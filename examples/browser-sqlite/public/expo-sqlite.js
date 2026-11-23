// `@blazetrails/sqlite3`'s expo-sqlite engine loads `expo-sqlite` with a
// computed `import()`, which no bundler rewrites; runtime.html's import map
// points it here, at the sql.js-backed module the runtime installed.
const sqlite = globalThis.__expoSqlite;
export const openDatabaseAsync = (...args) => sqlite.openDatabaseAsync(...args);
export default { openDatabaseAsync };
