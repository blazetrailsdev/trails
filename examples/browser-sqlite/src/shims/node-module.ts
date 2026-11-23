export function createRequire(_url: string) {
  return function require(id: string): unknown {
    if (id === "expo-sqlite") {
      const sqlite = (globalThis as { __expoSqlite?: unknown }).__expoSqlite;
      if (sqlite) return sqlite;
    }
    throw Object.assign(new Error(`Cannot find module '${id}'`), { code: "MODULE_NOT_FOUND" });
  };
}
export default { createRequire };
