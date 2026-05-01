import type { DatabaseAdapter } from "./adapter.js";

/** Detect adapter type from an adapter instance. */
export function detectAdapterName(
  adapter: DatabaseAdapter | null | undefined,
): "sqlite" | "postgres" | "mysql" {
  if (adapter?.adapterName) {
    const name = adapter.adapterName.toLowerCase();
    if (name.includes("postgres")) return "postgres";
    if (name.includes("mysql") || name.includes("maria")) return "mysql";
    return "sqlite";
  }
  // Fallback for adapters without adapterName (e.g. test doubles)
  const ctorName = (adapter?.constructor?.name ?? "").toLowerCase();
  if (ctorName.includes("postgres")) return "postgres";
  if (ctorName.includes("mysql") || ctorName.includes("maria")) return "mysql";
  if (ctorName === "schemaadapter") {
    if (process.env.PG_TEST_URL) return "postgres";
    if (process.env.MYSQL_TEST_URL) return "mysql";
    return "sqlite";
  }
  return "sqlite";
}
