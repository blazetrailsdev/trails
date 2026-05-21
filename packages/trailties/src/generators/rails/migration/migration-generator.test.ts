import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationGenerator } from "./migration-generator.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-migration-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("MigrationGeneratorTest", () => {
  it("generate migration", () => {
    const gen = new MigrationGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "add_title_to_posts",
      attributes: ["title:string", "body:text"],
    });
    const files = gen.run();
    expect(files[0]).toMatch(/^db\/migrate\/\d+_add_title_to_posts\.ts$/);
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), "utf-8");
    expect(content).toContain('t.column("title", "string");');
    expect(content).toContain('t.column("body", "text");');
  });

  it("exit on failure", () => {
    expect(MigrationGenerator.exitOnFailure()).toBe(true);
  });
});
