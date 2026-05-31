import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { generateModel } from "./generate-model.js";
import { generateMigration } from "./generate-migration.js";
import { destroyMigration, destroyModel } from "./destroy.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

describe("ArDestroyMigrationTest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-destroy-migration-"));
  });

  it("deletes the matching migration", async () => {
    const { path } = await generateMigration(dir, "AddEmailToUsers", [], "20240101120000");
    const result = await destroyMigration(dir, "AddEmailToUsers", []);
    expect(result.deleted).toBe(true);
    expect(result.path).toBe(path);
    expect(await fileExists(path)).toBe(false);
  });

  it("returns deleted:false when no migration matches", async () => {
    const result = await destroyMigration(dir, "NonExistent", []);
    expect(result.deleted).toBe(false);
  });

  it("returns ambiguous list when multiple migrations match", async () => {
    const migrateDir = join(dir, "db", "migrate");
    await mkdir(migrateDir, { recursive: true });
    await writeFile(join(migrateDir, "20240101120000_add_email_to_users.ts"), "// a");
    await writeFile(join(migrateDir, "20240101120001_add_email_to_users.ts"), "// b");
    const result = await destroyMigration(dir, "AddEmailToUsers", []);
    expect(result.deleted).toBe(false);
    expect(result.ambiguous).toHaveLength(2);
  });

  it("refuses modified file without --force and returns diff", async () => {
    const { path } = await generateMigration(dir, "CreatePosts", [], "20240101120000");
    await writeFile(path, "// hand-edited\n");
    const result = await destroyMigration(dir, "CreatePosts", []);
    expect(result.deleted).toBe(false);
    expect(result.modified).toBeTruthy();
    expect(await fileExists(path)).toBe(true);
  });

  it("deletes modified file with --force", async () => {
    const { path } = await generateMigration(dir, "CreatePosts", [], "20240101120000");
    await writeFile(path, "// hand-edited\n");
    const result = await destroyMigration(dir, "CreatePosts", [], { force: true });
    expect(result.deleted).toBe(true);
    expect(await fileExists(path)).toBe(false);
  });
});

describe("ArDestroyModelTest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-destroy-model-"));
  });

  it("deletes model and migration, regenerates manifest", async () => {
    const { modelPath, migrationPath } = await generateModel(dir, "Article", [], "20240101120000");
    const result = await destroyModel(dir, "Article", []);
    expect(result.deleted).toBe(true);
    expect(await fileExists(modelPath)).toBe(false);
    expect(await fileExists(migrationPath)).toBe(false);
    const manifest = await readFile(join(dir, "app", "models", "index.ts"), "utf8");
    expect(manifest).not.toContain("Article");
  });

  it("returns deleted:false and diff when model was hand-edited", async () => {
    const { modelPath } = await generateModel(dir, "Post", [], "20240101120000");
    await writeFile(modelPath, "// hand-edited\n");
    const result = await destroyModel(dir, "Post", []);
    expect(result.deleted).toBe(false);
    expect(result.modified).toBeTruthy();
  });

  it("deletes hand-edited files with --force", async () => {
    const { modelPath, migrationPath } = await generateModel(dir, "Tag", [], "20240101120000");
    await writeFile(modelPath, "// hand-edited\n");
    const result = await destroyModel(dir, "Tag", [], { force: true });
    expect(result.deleted).toBe(true);
    expect(await fileExists(modelPath)).toBe(false);
    expect(await fileExists(migrationPath)).toBe(false);
  });

  it("dry-run reports deleted:true without removing files", async () => {
    const { modelPath, migrationPath } = await generateModel(dir, "Widget", [], "20240101120000");
    const result = await destroyModel(dir, "Widget", [], { dryRun: true });
    expect(result.deleted).toBe(true);
    expect(await fileExists(modelPath)).toBe(true);
    expect(await fileExists(migrationPath)).toBe(true);
  });
});
