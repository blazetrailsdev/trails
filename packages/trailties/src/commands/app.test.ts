import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appTemplateCommand } from "./app.js";

describe("AppCommandTest", () => {
  it("app:template applies a template that calls the route DSL", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-app-cmd-"));
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      fs.mkdirSync(path.join(tmpDir, "config"));
      fs.writeFileSync(path.join(tmpDir, "config/routes.rb"), "App.routes.draw do\nend\n");
      const tmpl = path.join(tmpDir, "template.mjs");
      fs.writeFileSync(tmpl, "export default (g) => g.route('root \"welcome#index\"');\n");
      await appTemplateCommand().parseAsync(["node", "app:template", tmpl]);
      expect(fs.readFileSync(path.join(tmpDir, "config/routes.rb"), "utf-8")).toContain(
        'root "welcome#index"',
      );
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
