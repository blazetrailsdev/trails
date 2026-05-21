import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { MigrationProxy } from "@blazetrails/activerecord";

// Rails uses `<timestamp>_<name>` (railties/lib/rails/generators/migration.rb).
// trailties scaffolds in TS/JS, so the extension set is `ts|js` (no `rb`).
// The pre-1.12c hyphen form is accepted as a transitional alias so apps
// generated against earlier PRs still load.
const MIGRATION_FILE_PATTERN = /^(\d+)[_-](.+)\.(ts|js)$/;

/**
 * Discover migration files from a directory and return MigrationProxy objects
 * compatible with the Migrator class.
 *
 * Supports both .ts and .js migration files. When both exist for the same
 * migration, .ts is preferred (source of truth over compiled output).
 *
 * Files match: {timestamp}_{name}.ts or .js (Rails-faithful underscore form;
 * the hyphen form is accepted as a pre-1.12c transitional alias).
 */
export async function discoverMigrations(migrationsDir: string): Promise<MigrationProxy[]> {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  // Sort the directory listing so dedupe is deterministic regardless of
  // readdir order. Precedence inside the dedupe loop is: extension first
  // (.ts beats .js), then separator (underscore beats hyphen alias) when
  // the extensions are equal.
  const rawFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => MIGRATION_FILE_PATTERN.test(f))
    .sort();

  // Deduplicate by canonical version_name (underscore form), preferring
  // .ts over .js. The hyphen alias is transitional; we collapse `-` and
  // `_` variants of the same migration so a rename doesn't double-load.
  const byBasename = new Map<string, string>();
  for (const file of rawFiles) {
    const ext = path.extname(file);
    const m = file.match(MIGRATION_FILE_PATTERN)!;
    // Canonicalize both the separator and the name segment: pre-1.12c
    // generated dasherized names ("change-title-body-from-posts") while
    // post-1.12c uses underscored names ("change_title_body_from_posts"),
    // so collapsing `-` to `_` in the name keeps a renamed migration
    // from double-loading.
    const basename = `${m[1]}_${m[2].replace(/-/g, "_")}`;
    const existing = byBasename.get(basename);

    if (!existing) {
      byBasename.set(basename, file);
      continue;
    }

    const existingExt = path.extname(existing);
    const existingSep = existing.match(/^\d+([_-])/)![1];
    const fileSep = file.match(/^\d+([_-])/)![1];
    // Prefer .ts (source) over .js (compiled); at equal extension,
    // prefer the canonical underscore separator over the hyphen alias.
    if (existingExt === ".js" && ext === ".ts") {
      byBasename.set(basename, file);
    } else if (existingExt === ext && existingSep === "-" && fileSep === "_") {
      byBasename.set(basename, file);
    }
  }

  const files = Array.from(byBasename.values()).sort();
  const proxies: MigrationProxy[] = [];

  for (const file of files) {
    const match = file.match(MIGRATION_FILE_PATTERN);
    if (!match) continue;

    const version = match[1];
    // Canonicalize the proxy name to the underscore form so
    // Migrator.validate()'s duplicate-name check sees hyphen-alias and
    // underscore-form migrations as the same logical name.
    const name = match[2]!.replace(/-/g, "_");
    const filePath = path.join(migrationsDir, file);

    proxies.push({
      version,
      name,
      filename: filePath,
      migration: () => {
        const loader: import("@blazetrails/activerecord").MigrationLike = {
          connection: undefined,
          async up(): Promise<void> {
            const adapter = loader.connection;
            if (!adapter)
              throw new Error(
                "migration-loader: migration.connection must be set before calling up()",
              );
            const MigrationClass = await loadMigrationClass(filePath);
            const instance = new MigrationClass();
            await instance.run(adapter, "up");
          },
          async down(): Promise<void> {
            const adapter = loader.connection;
            if (!adapter)
              throw new Error(
                "migration-loader: migration.connection must be set before calling down()",
              );
            const MigrationClass = await loadMigrationClass(filePath);
            const instance = new MigrationClass();
            await instance.run(adapter, "down");
          },
        };
        return loader;
      },
    });
  }

  return proxies;
}

function isMigrationClass(value: unknown): boolean {
  if (typeof value !== "function") return false;
  const proto = (value as any).prototype;
  return proto && typeof proto.run === "function";
}

async function loadMigrationClass(
  filePath: string,
): Promise<new () => { run(adapter: any, direction: "up" | "down"): Promise<void> }> {
  let mod: any;
  try {
    mod = await import(pathToFileURL(filePath).href);
  } catch (error: any) {
    if (path.extname(filePath) === ".ts") {
      const enhanced = new Error(
        `Failed to load TypeScript migration "${filePath}". ` +
          `Ensure a TypeScript loader (tsx, ts-node) is configured, ` +
          `or use compiled .js migrations instead.`,
      );
      (enhanced as any).cause = error;
      throw enhanced;
    }
    throw error;
  }

  if (isMigrationClass(mod.default)) {
    return mod.default;
  }

  for (const value of Object.values(mod)) {
    if (isMigrationClass(value)) {
      return value as any;
    }
  }

  throw new Error(
    `No migration class found in ${filePath}. ` +
      `Expected a class extending Migration with a run(adapter, direction) method.`,
  );
}
