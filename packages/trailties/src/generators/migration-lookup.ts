import { Dir } from "@blazetrails/ruby-compat";

// Shared migration-file lookup helpers. Lives in its own module so that
// `actions/create-migration.ts` can use `migrationExists` without pulling
// in the rest of `migration.ts` (which itself depends on CreateMigration —
// a cycle).

export function migrationLookupAt(dirname: string): string[] {
  return Dir.glob(`${dirname}/[0-9]*_*.{ts,js,rb}`);
}

export function migrationExists(dirname: string, fileName: string): string | undefined {
  const re = new RegExp(`\\d+_${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(ts|js|rb)$`);
  return migrationLookupAt(dirname).find((f) => re.test(f));
}
