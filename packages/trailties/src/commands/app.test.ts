import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appTemplateCommand } from "./app.js";
import { Application } from "../application.js";
import { Trails } from "../trails.js";

class AppCommandTestApp extends Application {}
Trails.application = AppCommandTestApp.instance();

describe("AppCommandTest", () => {
  it("app:template runs a template's generate in line", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-app-cmd-"));
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      const tmpl = path.join(tmpDir, "template.mjs");
      fs.writeFileSync(
        tmpl,
        'export default (g) => g.generate("helper", "Post", { inline: true });\n',
      );
      await appTemplateCommand().parseAsync(["node", "app:template", tmpl]);
      expect(fs.existsSync(path.join(tmpDir, "app/helpers/post-helper.ts"))).toBe(true);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
