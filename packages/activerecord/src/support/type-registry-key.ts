import type { AdapterName } from "../connection-adapters/abstract-adapter.js";

export function typeRegistryKeyFor(adapter: { adapterName: string }): AdapterName | null {
  const name = adapter.adapterName.toLowerCase();
  if (name.includes("postgres")) return "postgresql";
  if (name.includes("mysql") || name.includes("maria") || name.includes("trilogy")) return "mysql2";
  if (name.includes("sqlite")) return "sqlite3";
  return null;
}
