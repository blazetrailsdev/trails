import { NotImplementedError } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import {
  CreateMigration,
  type CreateMigrationConfig,
  type CreateMigrationHost,
  type MigrationRenderer,
} from "./actions/create-migration.js";
import { migrationLookupAt } from "./migration-lookup.js";

export { NotImplementedError };
export { migrationLookupAt, migrationExists } from "./migration-lookup.js";

export interface MigrationAssigns {
  migrationNumber: string;
  migrationFileName: string;
  migrationClassName: string;
}

export function currentMigrationNumber(dirname: string): number {
  let max = 0;
  for (const file of migrationLookupAt(dirname)) {
    const n = parseInt(File.basename(file).split("_")[0], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}
export function nextMigrationNumber(): never {
  throw new NotImplementedError("nextMigrationNumber must be implemented");
}

export function buildMigrationAssigns(destination: string, nextNumber: string): MigrationAssigns {
  const base = File.basename(destination).replace(/\.(ts|js|rb)$/, "");
  return {
    migrationNumber: nextNumber,
    migrationFileName: base,
    migrationClassName: camelize(base),
  };
}

export async function createMigration(
  host: CreateMigrationHost,
  destination: string,
  data: MigrationRenderer,
  config: CreateMigrationConfig = {},
): Promise<string> {
  return new CreateMigration(host, destination, data, config).invoke();
}

export interface MigrationTemplateHost extends CreateMigrationHost {
  destinationRoot: string;
  nextMigrationNumber(dirname: string): Promise<string> | string;
  setMigrationAssigns(assigns: MigrationAssigns): void;
}

export async function migrationTemplate(
  host: MigrationTemplateHost,
  source: (assigns: MigrationAssigns) => string | Promise<string>,
  destination: string,
  config: CreateMigrationConfig = {},
): Promise<string> {
  const resolved = File.expandPath(destination, host.destinationRoot);
  const dir = File.dirname(resolved);
  const nextNumber = String(await host.nextMigrationNumber(dir));
  const assigns = buildMigrationAssigns(resolved, nextNumber);
  host.setMigrationAssigns(assigns);
  const numbered = File.join(dir, `${nextNumber}_${File.basename(resolved)}`);
  const wrapped: CreateMigrationHost = { ...host, migrationFileName: assigns.migrationFileName };
  return createMigration(wrapped, numbered, () => source(assigns), config);
}
