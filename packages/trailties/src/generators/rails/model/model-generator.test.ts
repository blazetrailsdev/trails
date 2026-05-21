import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";
import { ModelHelpers } from "../../model-helpers.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-model-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  ModelHelpers.skipWarn = false;
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ModelGeneratorTest", () => {
  it("generate model", () => {
    const gen = new ModelGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "Post",
      attributes: ["title:string", "views:integer"],
    });
    const files = gen.run();
    expect(files).toContain("app/models/post.ts");
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), "utf-8");
    expect(content).toContain("export class Post extends Model");
    expect(content).toContain("title!: string;");
    expect(content).toContain("views!: number;");
  });

  it("plural model name is singularized", () => {
    const gen = new ModelGenerator({ cwd: tmpDir, output: () => {}, name: "posts" });
    expect(gen.run()).toContain("app/models/post.ts");
  });
});
