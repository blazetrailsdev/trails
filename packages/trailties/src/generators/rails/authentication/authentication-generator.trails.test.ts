import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { registerChildProcessAdapter, childProcessAdapterConfig } from "@blazetrails/ruby-compat";
import { AuthenticationGenerator } from "./authentication-generator.js";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const compilerOptions = { strict: true, module: "nodenext", noEmit: true, skipLibCheck: true };
const APP_FILES: Record<string, string> = {
  "package.json": `{ "type": "module" }`,
  "tsconfig.json": JSON.stringify({ compilerOptions, include: ["app/**/*.ts"] }),
  "app/controllers/application-controller.ts": `import { ActionController } from "@blazetrails/actionpack";\nexport class ApplicationController extends ActionController.Base {}\n`,
  "app/models/application-record.ts": `import { Base } from "@blazetrails/activerecord";\nexport class ApplicationRecord extends Base {}\n`,
  "app/mailers/application-mailer.ts": "export class ApplicationMailer { mail(h: object) {} }",
  "config/routes.ts": "// routes\n",
};

describe("AuthenticationGenerator", () => {
  it("the generated app type-checks under --strict", () => {
    registerChildProcessAdapter("trailties-auth-strict-test", {
      spawnSync: () => ({ status: 0, signal: null, stdout: "", stderr: "" }),
    });
    childProcessAdapterConfig.adapter = "trailties-auth-strict-test";
    const appDir = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-auth-strict-"));
    const api = new API();
    try {
      for (const [rel, content] of Object.entries(APP_FILES)) {
        fs.mkdirSync(path.dirname(path.join(appDir, rel)), { recursive: true });
        fs.writeFileSync(path.join(appDir, rel), content);
      }
      new AuthenticationGenerator({ cwd: appDir, output: () => {} }).run();

      const configPath = path.join(appDir, "tsconfig.json");
      const program = api
        .createSnapshot({ openProjects: [configPath] })
        .getConfiguredProject(configPath)!.program;
      const diagnostics = [
        ...program.getSyntacticDiagnostics(),
        ...program.getSemanticDiagnostics(),
      ].map((d) => `${path.relative(appDir, d.fileName ?? "")}: TS${d.code}`);

      expect(diagnostics).toEqual(["app/controllers/passwords-controller.ts: TS2571"]);
    } finally {
      api.close();
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});
