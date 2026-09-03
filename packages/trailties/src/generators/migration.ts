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

// Mirrors railties/lib/rails/generators/migration.rb. ERB template rendering
// is supplied by the caller (a render callback) until PR 1.12c lands the
// template pipeline. Filesystem and path access come from the activesupport
// adapter registry.
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

// Rails source: railties/lib/rails/generators/migration.rb#create_migration.
// The action runs immediately rather than queuing through a Thor action stack.
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

// Rails source: railties/lib/rails/generators/migration.rb#migration_template.
// Rails' `source` is an ERB template path it reads and renders inline; here
// the same slot is a callback that receives the migration assigns (so the
// EJS/template pipeline can be swapped in later without changing this
// dispatch). Argument order follows Rails: source, destination, config.
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
  // assigns.migrationFileName is the single source of truth for the
  // CreateMigration action's existence checks. Wrap the host so the action
  // can't drift from the just-computed assigns even if the host's own
  // migrationFileName field hasn't been synced.
  const wrapped: CreateMigrationHost = { ...host, migrationFileName: assigns.migrationFileName };
  return createMigration(wrapped, numbered, () => source(assigns), config);
}
