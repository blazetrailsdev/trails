import type { AdapterName } from "../../lib/connection-adapters/abstract-adapter.js";

export function typeRegistryKeyFor(adapter: { adapterName: string }): AdapterName | null {
  const name = adapter.adapterName.toLowerCase();
  if (name.includes("postgres")) return "postgresql";
  if (name.includes("mysql")) return "mysql2";
  if (name.includes("sqlite")) return "sqlite3";
  return null;
}
