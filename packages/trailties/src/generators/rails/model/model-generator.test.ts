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
  it("invokes default orm", () => {
    const files = new ModelGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "Post",
      attributes: ["title:string", "views:integer"],
    }).run();
    expect(files).toContain("app/models/post.ts");
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), "utf-8");
    expect(content).toContain("export class Post extends Base");
    expect(content).toContain("title!: string;");
    expect(content).toContain("views!: number;");
  });

  it("plural names are singularized", () => {
    const gen = new ModelGenerator({ cwd: tmpDir, output: () => {}, name: "posts" });
    expect(gen.run()).toContain("app/models/post.ts");
  });

  it("model with namespace", () => {
    const gen = new ModelGenerator({ cwd: tmpDir, output: () => {}, name: "admin/user" });
    const files = gen.run();
    expect(files).toContain("app/models/admin/user.ts");
    expect(fs.readFileSync(path.join(tmpDir, files[0]!), "utf-8")).toContain(
      "export class AdminUser extends Base",
    );
  });
});
