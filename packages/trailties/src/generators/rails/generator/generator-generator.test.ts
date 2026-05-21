import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { GeneratorGenerator } from "./generator-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-gen-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GeneratorGeneratorTest", () => {
  it("generator_skeleton_is_created", () => {
    const gen = new GeneratorGenerator({ cwd: tmpDir, output: () => {}, name: "awesome" });
    gen.run();
    for (const p of [
      "lib/generators/awesome/USAGE",
      "lib/generators/awesome/templates/.keep",
      "lib/generators/awesome/awesome-generator.ts",
    ]) {
      expect(fs.existsSync(path.join(tmpDir, p))).toBe(true);
    }
    const src = fs.readFileSync(
      path.join(tmpDir, "lib/generators/awesome/awesome-generator.ts"),
      "utf-8",
    );
    expect(src).toMatch(/class AwesomeGenerator extends NamedBase/);
  });

  it("namespaced_generator_skeleton", () => {
    const gen = new GeneratorGenerator({ cwd: tmpDir, output: () => {}, name: "rails/awesome" });
    gen.run();
    const src = fs.readFileSync(
      path.join(tmpDir, "lib/generators/rails/awesome/awesome-generator.ts"),
      "utf-8",
    );
    expect(src).toMatch(/class AwesomeGenerator extends NamedBase/);
  });

  it("generator_skeleton_is_created_without_file_name_namespace", () => {
    const gen = new GeneratorGenerator({ cwd: tmpDir, output: () => {}, name: "awesome" });
    gen.run({ namespace: false });
    expect(fs.existsSync(path.join(tmpDir, "lib/generators/awesome-generator.ts"))).toBe(true);
  });
});
