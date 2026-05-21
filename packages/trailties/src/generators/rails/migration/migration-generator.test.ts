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

describe("MigrationGeneratorTest", () => {
  it("migration", () => {
    const files = new MigrationGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "add_title_to_posts",
    }).run();
    expect(files[0]).toMatch(/^db\/migrations\/\d+-add-title-to-posts\.ts$/);
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), "utf-8");
    expect(content).toContain("class AddTitleToPosts extends Migration");
    expect(content).toContain("async change(): Promise<void>");
  });

  it("migrations generated simultaneously", () => {
    const a = new MigrationGenerator({ cwd: tmpDir, output: () => {}, name: "first" }).run();
    const b = new MigrationGenerator({ cwd: tmpDir, output: () => {}, name: "second" }).run();
    expect(a[0]).not.toBe(b[0]);
  });

  it("migration with invalid file name", () => {
    expect(() =>
      new MigrationGenerator({ cwd: tmpDir, output: () => {}, name: "x:y" }).run(),
    ).toThrow(/Illegal name/);
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
