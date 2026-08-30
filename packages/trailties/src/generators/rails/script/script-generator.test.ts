import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScriptGenerator } from "./script-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-script-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ScriptGeneratorTest", () => {
  it("generate_script", () => {
    const gen = new ScriptGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "my_script",
    });
    const files = gen.run();
    expect(files).toContain("script/my_script.ts");
    const content = fs.readFileSync(path.join(tmpDir, "script/my_script.ts"), "utf-8");
    expect(content).toMatch(/"\.\.\/config\/environment\.js"/);
  });

  it("generate_script_with_folder", () => {
    const gen = new ScriptGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "my_folder/my_script",
    });
    gen.run();
    const content = fs.readFileSync(path.join(tmpDir, "script/my_folder/my_script.ts"), "utf-8");
    expect(content).toMatch(/"\.\.\/\.\.\/config\/environment\.js"/);
  });
});
