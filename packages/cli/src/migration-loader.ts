import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { MigrationProxy } from "@blazetrails/activerecord";

const MIGRATION_FILE_PATTERN = /^(\d+)-(.+)\.(ts|js)$/;

/**
 * Discover migration files from a directory and return MigrationProxy objects
 * compatible with the Migrator class.
 *
 * Supports both .ts and .js migration files. When both exist for the same
 * migration, .ts is preferred (source of truth over compiled output).
 *
 * Files match: {timestamp}-{name}.ts or .js (e.g., 20260318120000-create-users.ts)
 */
export async function discoverMigrations(migrationsDir: string): Promise<MigrationProxy[]> {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const rawFiles = fs.readdirSync(migrationsDir).filter((f) => MIGRATION_FILE_PATTERN.test(f));

  // Deduplicate by basename (version-name), preferring .ts over .js
  const byBasename = new Map<string, string>();
  for (const file of rawFiles) {
    const ext = path.extname(file);
    const basename = file.slice(0, -ext.length);
    const existing = byBasename.get(basename);

    if (!existing) {
      byBasename.set(basename, file);
      continue;
    }

    // Prefer .ts (source) over .js (compiled)
    if (path.extname(existing) === ".js" && ext === ".ts") {
      byBasename.set(basename, file);
    }
  }

  const files = Array.from(byBasename.values()).sort();
  const proxies: MigrationProxy[] = [];

  for (const file of files) {
    const match = file.match(MIGRATION_FILE_PATTERN);
    if (!match) continue;

    const version = match[1];
    const name = match[2];
    const filePath = path.join(migrationsDir, file);

    proxies.push({
      version,
      name,
      filename: filePath,
      migration: () => {
        const loader = {
          async up(adapter: import("@blazetrails/activerecord").DatabaseAdapter): Promise<void> {
            const MigrationClass = await loadMigrationClass(filePath);
            const instance = new MigrationClass();
            await instance.run(adapter, "up");
          },
          async down(adapter: import("@blazetrails/activerecord").DatabaseAdapter): Promise<void> {
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
