import { camelize, getPath } from "@blazetrails/activesupport";
import {
  CreateMigration,
  type CreateMigrationConfig,
  type CreateMigrationHost,
  type MigrationRenderer,
} from "./actions/create-migration.js";
import { migrationLookupAt } from "./migration-lookup.js";

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

export async function currentMigrationNumber(dirname: string): Promise<number> {
  const path = getPath();
  let max = 0;
  for (const f of await migrationLookupAt(dirname)) {
    const n = parseInt(path.basename(f).split("_")[0]!, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

export class NotImplementedError extends Error {}
export function nextMigrationNumber(): never {
  throw new NotImplementedError("nextMigrationNumber must be implemented");
}

export function buildMigrationAssigns(destination: string, nextNumber: string): MigrationAssigns {
  const base = getPath()
    .basename(destination)
    .replace(/\.(ts|js|rb)$/, "");
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
// The Rails version reads the ERB source and renders it inline; here the
// caller supplies a `render` callback that receives the migration assigns
// (so the EJS/template pipeline can be swapped in later without changing
// this dispatch).
export async function migrationTemplate(
  host: MigrationTemplateHost,
  destination: string,
  render: (assigns: MigrationAssigns) => string | Promise<string>,
  config: CreateMigrationConfig = {},
): Promise<string> {
  const path = getPath();
  // Per PathAdapter contract: when isAbsolute is undefined, any path is
  // treated as already absolute; only join with destinationRoot when the
  // adapter declares the destination is relative.
  const resolved =
    path.isAbsolute && !path.isAbsolute(destination)
      ? path.join(host.destinationRoot, destination)
      : destination;
  const dir = path.dirname(resolved);
  const nextNumber = String(await host.nextMigrationNumber(dir));
  const assigns = buildMigrationAssigns(resolved, nextNumber);
  host.setMigrationAssigns(assigns);
  const numbered = path.join(dir, `${nextNumber}_${path.basename(resolved)}`);
  // assigns.migrationFileName is the single source of truth for the
  // CreateMigration action's existence checks. Wrap the host so the action
  // can't drift from the just-computed assigns even if the host's own
  // migrationFileName field hasn't been synced.
  const wrapped: CreateMigrationHost = { ...host, migrationFileName: assigns.migrationFileName };
  return createMigration(wrapped, numbered, () => render(assigns), config);
}
