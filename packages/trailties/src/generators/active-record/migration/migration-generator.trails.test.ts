import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationGenerator } from "./migration-generator.js";

describe("MigrationGenerator (JavaScript project)", () => {
  let jsTmpDir: string;

  beforeEach(() => {
    jsTmpDir = Dir.mktmpdir("trails-js-test-");
  });

  afterEach(() => {
    FileUtils.rmRf(jsTmpDir);
  });

  function makeJsGen() {
    return {
      run: async (name: string, args: string[]) => {
        const gen = new MigrationGenerator([name, ...args], {}, { destinationRoot: jsTmpDir });
        await gen.createMigrationFile();
        return Dir.children(File.join(jsTmpDir, "db/migrate")).map((f) => `db/migrate/${f}`);
      },
    };
  }

  function readJsMigration(files: string[]): string {
    return File.read(File.join(jsTmpDir, files[0]));
  }

  it("generates .js file extension", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    expect(files[0]).toMatch(/\.js$/);
    expect(files[0]).not.toMatch(/\.ts$/);
  });

  it("uses ESM imports", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain('import { Migration } from "@blazetrails/activerecord"');
    expect(content).not.toContain("require(");
  });

  it("uses export class", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain("export class CreateUsers");
    expect(content).not.toContain("module.exports");
  });

  it("omits TypeScript return type annotations", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("async change()");
  });

  it("preserves migration body for JS output", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateBooks", ["title:string", "body:text"]);
    const content = readJsMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
  });
});
