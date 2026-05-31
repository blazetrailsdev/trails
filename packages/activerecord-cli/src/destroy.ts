import { readdir, unlink, readFile } from "fs/promises";
import { join } from "path";
import { camelize, pluralize } from "@blazetrails/activesupport";
import { normalizeSnakeName, renderMigration } from "./generate-migration.js";
import { renderModel } from "./generate-model.js";
import { generateManifest } from "./generate-manifest.js";
import type { FieldSpec } from "./generate-migration.js";

export interface DestroyOptions {
  force?: boolean;
  dryRun?: boolean;
}

export interface DestroyMigrationResult {
  path: string;
  deleted: boolean;
  modified?: string;
  /** Set when multiple migration files match the name suffix. */
  ambiguous?: string[];
}

export interface DestroyModelResult {
  modelPath: string;
  migrationPath: string | undefined;
  deleted: boolean;
  modified?: string;
  /** Set when multiple create migrations match and the target is ambiguous. */
  ambiguous?: string[];
  /** False when the model file was absent (migration-only cleanup). */
  modelDeleted: boolean;
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

async function findMigrations(migrateDir: string, snakeName: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(migrateDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const suffix = `_${snakeName}.ts`;
  return entries
    .filter((e) => e.endsWith(suffix))
    .sort()
    .map((e) => join(migrateDir, e));
}

function checkModified(actual: string, expected: string): string | undefined {
  if (actual === expected) return undefined;
  const el = expected.split("\n"),
    al = actual.split("\n");
  const out: string[] = [];
  for (let i = 0; i < Math.max(el.length, al.length); i++) {
    if (el[i] !== al[i]) {
      if (el[i] !== undefined) out.push(`- ${el[i]}`);
      if (al[i] !== undefined) out.push(`+ ${al[i]}`);
    }
  }
  return out.join("\n");
}

async function safeUnlink(path: string): Promise<void> {
  await unlink(path).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  });
}

/** `ar destroy:migration <Name>` — deletes `*_<snake_name>.ts`. */
export async function destroyMigration(
  root: string,
  name: string,
  fields: FieldSpec[],
  options: DestroyOptions = {},
): Promise<DestroyMigrationResult> {
  const snakeName = normalizeSnakeName(name);
  const migrateDir = join(root, "db", "migrate");
  const matches = await findMigrations(migrateDir, snakeName);

  if (matches.length === 0) {
    return { path: join(migrateDir, `*_${snakeName}.ts`), deleted: false };
  }
  if (matches.length > 1) {
    return { path: join(migrateDir, `*_${snakeName}.ts`), deleted: false, ambiguous: matches };
  }

  const filePath = matches[0];
  if (!options.force) {
    const actual = await readIfPresent(filePath);
    if (actual !== undefined) {
      const diff = checkModified(actual, renderMigration(snakeName, fields));
      if (diff !== undefined) return { path: filePath, deleted: false, modified: diff };
    }
  }

  if (!options.dryRun) await unlink(filePath);
  return { path: filePath, deleted: true };
}

/** `ar destroy:model <Name>` — deletes model + migration, re-runs manifest. */
export async function destroyModel(
  root: string,
  name: string,
  fields: FieldSpec[],
  options: DestroyOptions = {},
): Promise<DestroyModelResult> {
  const snakeName = normalizeSnakeName(name);
  const className = camelize(snakeName);
  const modelPath = join(root, "app", "models", `${snakeName}.ts`);
  const migrateDir = join(root, "db", "migrate");
  const migrationSuffix = `create_${pluralize(snakeName)}`;
  const migrationMatches = await findMigrations(migrateDir, migrationSuffix);
  if (migrationMatches.length > 1) {
    return {
      modelPath,
      migrationPath: undefined,
      deleted: false,
      modelDeleted: false,
      ambiguous: migrationMatches,
    };
  }
  const migrationPath = migrationMatches.length === 1 ? migrationMatches[0] : undefined;

  const actualModel = await readIfPresent(modelPath);
  const modelPresent = actualModel !== undefined;
  if (!modelPresent && migrationPath === undefined) {
    return { modelPath, migrationPath, deleted: false, modelDeleted: false };
  }

  if (!options.force) {
    if (actualModel !== undefined) {
      const diff = checkModified(actualModel, renderModel(className, fields));
      if (diff !== undefined)
        return { modelPath, migrationPath, deleted: false, modelDeleted: false, modified: diff };
    }
    if (migrationPath !== undefined) {
      const actualMigration = await readIfPresent(migrationPath);
      if (actualMigration !== undefined) {
        const diff = checkModified(actualMigration, renderMigration(migrationSuffix, fields));
        if (diff !== undefined)
          return { modelPath, migrationPath, deleted: false, modelDeleted: false, modified: diff };
      }
    }
  }

  if (!options.dryRun) {
    if (modelPresent) await safeUnlink(modelPath);
    if (migrationPath !== undefined) await safeUnlink(migrationPath);
    // Regenerate manifest when the model was present (models dir guaranteed to
    // exist) OR when the manifest already exists (stale import after manual
    // model deletion). Skipping both avoids the plain Error generateManifest
    // throws when the models dir doesn't exist at all (migration-only project).
    const modelsDir = join(root, "app", "models");
    const manifestExists = (await readIfPresent(join(modelsDir, "index.ts"))) !== undefined;
    if (modelPresent || manifestExists) {
      await generateManifest(modelsDir);
    }
  }

  return { modelPath, migrationPath, deleted: true, modelDeleted: modelPresent };
}
