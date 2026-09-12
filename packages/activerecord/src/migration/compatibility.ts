import { ArgumentError } from "@blazetrails/activemodel";
import { rbInspect } from "@blazetrails/ruby-compat";
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
  const name = normalizeVersion(version);
  const klass = versionRegistry.get(name);
  if (klass === undefined) {
    const versions = [...versionRegistry.keys()].map((v) => rbInspect(v)).sort();
    throw new ArgumentError(
      `Unknown migration version ${rbInspect(name)}; expected one of ${versions.join(", ")}`,
    );
  }
  return klass;
}

export { CURRENT_VERSION };
