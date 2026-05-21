import { camelize, type FsAdapter, type PathAdapter } from "@blazetrails/activesupport";

// Mirrors railties/lib/rails/generators/migration.rb. `migration_template`
// (ERB rendering) is deferred to PR 1.12c where generators are reworked to
// consume templates.
export interface MigrationAssigns {
  migrationNumber: string;
  migrationFileName: string;
  migrationClassName: string;
}

const MIGRATION_FILE_RE = /^[0-9].*_.*\.(ts|js|rb)$/;

export async function migrationLookupAt(
  fs: FsAdapter,
  path: PathAdapter,
  dirname: string,
): Promise<string[]> {
  if (!(await fs.exists(dirname))) return [];
  if (!fs.readdir) throw new Error("FsAdapter.readdir is required");
  return (await fs.readdir(dirname))
    .filter((e) => MIGRATION_FILE_RE.test(e))
    .map((e) => path.join(dirname, e));
}

export async function migrationExists(
  fs: FsAdapter,
  path: PathAdapter,
  dirname: string,
  fileName: string,
): Promise<string | undefined> {
  const re = new RegExp(`\\d+_${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(ts|js|rb)$`);
  return (await migrationLookupAt(fs, path, dirname)).find((f) => re.test(f));
}

export async function currentMigrationNumber(
  fs: FsAdapter,
  path: PathAdapter,
  dirname: string,
): Promise<number> {
  let max = 0;
  for (const f of await migrationLookupAt(fs, path, dirname)) {
    const n = parseInt(path.basename(f).split("_")[0]!, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

export class NotImplementedError extends Error {}
export function nextMigrationNumber(): never {
  throw new NotImplementedError("nextMigrationNumber must be implemented");
}

export function buildMigrationAssigns(
  path: PathAdapter,
  destination: string,
  nextNumber: string,
): MigrationAssigns {
  const base = path.basename(destination).replace(/\.(ts|js|rb)$/, "");
  return {
    migrationNumber: nextNumber,
    migrationFileName: base,
    migrationClassName: camelize(base),
  };
}
