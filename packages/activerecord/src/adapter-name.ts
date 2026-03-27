import type { DatabaseAdapter } from "./adapter.js";

/** Detect adapter type from an adapter instance. */
export function detectAdapterName(
  adapter: DatabaseAdapter | null | undefined,
): "sqlite" | "postgres" | "mysql" {
  const nameLower = (adapter?.constructor?.name ?? "").toLowerCase();
  if (nameLower.includes("postgres")) return "postgres";
  if (nameLower.includes("mysql") || nameLower.includes("maria")) return "mysql";
  if (nameLower === "schemaadapter") {
    if (process.env.PG_TEST_URL) return "postgres";
    if (process.env.MYSQL_TEST_URL) return "mysql";
    return "sqlite";
  }
  return "sqlite";
}
