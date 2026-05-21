import { getFs, getPath } from "@blazetrails/activesupport";

// Shared migration-file lookup helpers. Lives in its own module so that
// `actions/create-migration.ts` can use `migrationExists` without pulling
// in the rest of `migration.ts` (which itself depends on CreateMigration —
// a cycle).

const MIGRATION_FILE_RE = /^[0-9].*_.*\.(ts|js|rb)$/;

export async function migrationLookupAt(dirname: string): Promise<string[]> {
  const fs = getFs();
  if (!(await fs.exists(dirname))) return [];
  if (!fs.readdir) throw new Error("FsAdapter.readdir is required");
  const path = getPath();
  return (await fs.readdir(dirname))
    .filter((e) => MIGRATION_FILE_RE.test(e))
    .map((e) => path.join(dirname, e));
}

export async function migrationExists(
  dirname: string,
  fileName: string,
): Promise<string | undefined> {
  const re = new RegExp(`\\d+_${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(ts|js|rb)$`);
  return (await migrationLookupAt(dirname)).find((f) => re.test(f));
}
