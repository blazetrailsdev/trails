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
import { Generators } from "../generators.js";

export { NotImplementedError };
export { migrationLookupAt, migrationExists } from "./migration-lookup.js";

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

export async function createMigration(
  host: CreateMigrationHost,
  destination: string,
  data: MigrationRenderer,
  config: CreateMigrationConfig = {},
): Promise<string | undefined> {
  const instance = new CreateMigration(host, destination, data, config);
  return host.behavior === "revoke" ? instance.revoke() : instance.invoke();
}

export interface MigrationTemplateHost extends CreateMigrationHost {
  destinationRoot: string;
  constructor: { nextMigrationNumber(dirname: string): string };
  migrationNumber: string;
  migrationClassName: string;
}

export function setMigrationAssigns(this: MigrationTemplateHost, destination: string): void {
  destination = File.expandPath(destination, this.destinationRoot);
  const migrationDir = File.dirname(destination);
  this.migrationNumber = this.constructor.nextMigrationNumber(migrationDir);
  this.migrationFileName = File.basename(destination).replace(/\.(ts|js|rb)$/, "");
  this.migrationClassName = camelize(this.migrationFileName);
}

/** @missingRailsCall find_in_source_paths — CONVERGEABLE migration-template-expands-the-source-template-path */
export async function migrationTemplate(
  host: MigrationTemplateHost,
  source: () => string | Promise<string>,
  destination: string,
  config: CreateMigrationConfig = {},
): Promise<string | undefined> {
  setMigrationAssigns.call(host, destination);
  const resolved = File.expandPath(destination, host.destinationRoot);
  const [dir, base] = [File.dirname(resolved), File.basename(resolved)];
  const numberedDestination = File.join(dir, [host.migrationNumber, base].join("_"));
  const file = await createMigration(host, numberedDestination, source, config);
  return Generators.addGeneratedFile(file!);
}
