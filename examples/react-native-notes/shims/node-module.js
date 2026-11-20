function toJava(value) {
  return typeof value === "bigint" ? Number(value) : value;
}

function convertParams(params) {
  if (params == null) return params;
  if (Array.isArray(params)) return params.map(toJava);
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, toJava(v)]));
}

function wrapStatement(statement) {
  return {
    executeAsync: (params) => statement.executeAsync(convertParams(params)),
    executeForRawResultAsync: (params) => statement.executeForRawResultAsync(convertParams(params)),
    getColumnNamesAsync: () => statement.getColumnNamesAsync(),
    finalizeAsync: () => statement.finalizeAsync(),
  };
}

function wrapDatabase(db) {
  return {
    prepareAsync: async (sql) => wrapStatement(await db.prepareAsync(sql)),
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params) => db.runAsync(sql, convertParams(params)),
    getAllAsync: (sql, params) => db.getAllAsync(sql, convertParams(params)),
    getFirstAsync: (sql, params) => db.getFirstAsync(sql, convertParams(params)),
    closeAsync: () => db.closeAsync(),
  };
}

function expoSqlite() {
  const expo = require("expo-sqlite");
  return {
    ...expo,
    openDatabaseAsync: async (name, options) =>
      wrapDatabase(await expo.openDatabaseAsync(name, options)),
  };
}

function createRequire() {
  return function shimRequire(id) {
    if (id === "expo-sqlite") return expoSqlite();
    const error = new Error(`Cannot find module '${id}'`);
    error.code = "MODULE_NOT_FOUND";
    throw error;
  };
}

module.exports = { createRequire };
