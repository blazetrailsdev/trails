import type { DatabaseAdapter } from "./adapter.js";

/** Detect adapter type from an adapter instance. */
export function detectAdapterName(
  adapter: DatabaseAdapter | null | undefined,
): "sqlite" | "postgres" | "mysql" {
  const name = adapter?.constructor?.name ?? "";
  if (name.includes("Postgres")) return "postgres";
  if (name.includes("Mysql") || name.includes("Maria")) return "mysql";
  if (name === "SchemaAdapter") {
    if (process.env.PG_TEST_URL) return "postgres";
    if (process.env.MYSQL_TEST_URL) return "mysql";
    return "sqlite";
  }
  return "sqlite";
}
