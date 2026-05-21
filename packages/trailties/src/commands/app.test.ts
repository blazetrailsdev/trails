import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appTemplateCommand } from "./app.js";

describe("AppCommandTest", () => {
  it("app:template drains pendingGenerators from a template that calls generate", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-app-cmd-"));
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      const tmpl = path.join(tmpDir, "template.mjs");
      fs.writeFileSync(tmpl, 'export default (g) => g.generate("model", "Post");\n');
      await appTemplateCommand().parseAsync(["node", "app:template", tmpl]);
      expect(fs.existsSync(path.join(tmpDir, "src/app/models/post.ts"))).toBe(true);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
