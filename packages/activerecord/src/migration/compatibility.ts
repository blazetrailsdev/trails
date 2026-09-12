import { MigrationError } from "../migration.js";
import { VERSION } from "../gem-version.js";
import type { Migration } from "../migration.js";

export type MigrationClass =
  | (abstract new (...args: any[]) => Migration)
  | (new (...args: any[]) => Migration);

const CURRENT_VERSION = `${VERSION.MAJOR}.${VERSION.MINOR}`;

const versionRegistry = new Map<string, MigrationClass>();

function normalizeVersion(version: string | number): string {
  if (typeof version === "number") {
    const str = String(version);
    return str.includes(".") ? str : `${str}.0`;
  }
  return version;
}

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

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export function registerVersion(version: string, klass: MigrationClass): void {
  versionRegistry.set(normalizeVersion(version), klass);
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export function resetVersionRegistry(): void {
  versionRegistry.clear();
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export function findVersion(version: string | number): MigrationClass {
  const key = normalizeVersion(version);
  const exact = versionRegistry.get(key);
  if (exact) return exact;

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
  throw new MigrationError(`Unknown migration version: ${version}. Registered versions: ${sorted}`);
}

export { CURRENT_VERSION };
