const sqlite = globalThis.__expoSqlite;
export const openDatabaseAsync = (...args) => sqlite.openDatabaseAsync(...args);
export default { openDatabaseAsync };
