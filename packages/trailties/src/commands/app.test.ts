import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appCommand } from "./app.js";

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-app-cmd-"));
  origCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("AppCommandTest", () => {
  it("app:template applies a template that calls the gem DSL", async () => {
    const templatePath = path.join(tmpDir, "template.mjs");
    fs.writeFileSync(
      templatePath,
      'export default function (gen) { gen.gem("rspec-rails", { group: "test" }); }\n',
    );

    const program = appCommand();
    await program.parseAsync(["node", "app", "template", templatePath]);

    const gemfile = fs.readFileSync(path.join(tmpDir, "Gemfile"), "utf-8");
    expect(gemfile).toContain('gem "rspec-rails", group: "test"');
  });

  it("app:template rejects a template that does not export a function", async () => {
    const templatePath = path.join(tmpDir, "bad.mjs");
    fs.writeFileSync(templatePath, "export default 42;\n");

    const program = appCommand();
    await expect(program.parseAsync(["node", "app", "template", templatePath])).rejects.toThrow(
      /does not export a function/,
    );
  });
});
