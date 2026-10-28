import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationGenerator, emitMigrationSource } from "./migration-generator.js";
import { assertNoRubySource, parseTs } from "../../../template-builder/testing.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-migration-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function generate(name: string): Promise<string[]> {
  const gen = new MigrationGenerator([name], {}, { destinationRoot: tmpDir });
  await gen.createMigrationFile();
  return gen.getCreatedFiles();
}

describe("MigrationGeneratorTest", () => {
  it("migration", async () => {
    const files = await generate("add_title_to_posts");
    expect(files[0]).toMatch(/^db\/migrate\/\d+_add_title_to_posts\.ts$/);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain("class AddTitleToPosts extends Migration.get(8.0)");
    expect(content).toContain("async change(): Promise<void>");
  });

  it("migrations generated simultaneously", async () => {
    const a = await generate("first");
    const b = await generate("second");
    expect(a[0]).not.toBe(b[0]);
  });

  it("migration with invalid file name", async () => {
    await expect(generate("x:y")).rejects.toThrow(/Illegal name/);
  });

  it("exit on failure", () => {
    expect(MigrationGenerator.exitOnFailure()).toBe(true);
  });

  it("emits valid TS (snapshot + parse + no-Ruby)", () => {
    const out = emitMigrationSource("AddTitleToPosts", "20260521120000");
    expect(out).toMatchSnapshot();
    expect(parseTs(out).diagnostics).toEqual([]);
    assertNoRubySource(out);
  });
});
