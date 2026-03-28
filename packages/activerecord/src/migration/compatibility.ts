/**
 * Migration compatibility — versioned migration behavior.
 *
 * Mirrors: ActiveRecord::Migration::Compatibility
 *
 * Each version class preserves the migration behavior from that version.
 * Old migrations continue to work as originally written even as the
 * migration DSL evolves.
 *
 * Usage:
 *   class CreateUsers extends Migration.forVersion(1.0) {
 *     async change() { ... }
 *   }
 *
 * The current version can be obtained via currentVersion() / CURRENT_VERSION
 * and used with Migration.forVersion(currentVersion()).
 */

import type { Migration } from "../migration.js";

export type MigrationClass =
  | (abstract new (...args: any[]) => Migration)
  | (new (...args: any[]) => Migration);

const CURRENT_VERSION = "1.0";

const versionRegistry = new Map<string, MigrationClass>();

/**
 * Normalize a version input to a canonical string key.
 * Ensures numeric 1.0 becomes "1.0" (not "1").
 */
function normalizeVersion(version: string | number): string {
  if (typeof version === "number") {
    const str = String(version);
    return str.includes(".") ? str : `${str}.0`;
  }
  return version;
}

/**
 * Parse a version string into [major, minor] for comparison.
 */
function parseVersion(v: string): [number, number] {
  const parts = v.split(".");
  return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0];
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin] = parseVersion(a);
  const [bMaj, bMin] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aMin - bMin;
}

/**
 * Register a migration version class.
 */
export function registerVersion(version: string, klass: MigrationClass): void {
  versionRegistry.set(normalizeVersion(version), klass);
}

/**
 * Reset the version registry (for testing only).
 */
export function resetVersionRegistry(): void {
  versionRegistry.clear();
}

/**
 * Look up the migration base class for a given version.
 * Returns the exact version if registered, or the nearest lower version.
 *
 * Mirrors: ActiveRecord::Migration::Compatibility.find(version)
 */
export function findVersion(version: string | number): MigrationClass {
  const key = normalizeVersion(version);
  const exact = versionRegistry.get(key);
  if (exact) return exact;

  // Find nearest lower version using proper version comparison
  let best: MigrationClass | undefined;
  let bestKey = "";

  for (const [v, klass] of versionRegistry) {
    if (compareVersions(v, key) <= 0) {
      if (!best || compareVersions(v, bestKey) > 0) {
        bestKey = v;
        best = klass;
      }
    }
  }

  if (best) return best;

  const sorted = [...versionRegistry.keys()].sort(compareVersions).join(", ");
  const err = new Error(`Unknown migration version: ${version}. Registered versions: ${sorted}`);
  err.name = "MigrationError";
  throw err;
}

/**
 * Get the current (latest) migration version string.
 */
export function currentVersion(): string {
  return CURRENT_VERSION;
}

/**
 * Mirrors: ActiveRecord::Migration::Compatibility
 */
export interface Compatibility {
  version: string;
}

export { CURRENT_VERSION };
