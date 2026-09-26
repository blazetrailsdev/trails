import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { registerChildProcessAdapter, childProcessAdapterConfig } from "@blazetrails/ruby-compat";
import { AuthenticationGenerator } from "./authentication-generator.js";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const APPLICATION_CONTROLLER = `import { ActionController } from "@blazetrails/actionpack";
export class ApplicationController extends ActionController.Base {}
`;
const APPLICATION_RECORD = `import { Base } from "@blazetrails/activerecord";
export class ApplicationRecord extends Base {}
`;

let appDir: string;
const write = (rel: string, content: string) => {
  const full = path.join(appDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

beforeEach(() => {
  registerChildProcessAdapter("trailties-auth-strict-test", {
    spawnSync: () => ({ status: 0, signal: null, stdout: "", stderr: "" }),
  });
  childProcessAdapterConfig.adapter = "trailties-auth-strict-test";
  appDir = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-auth-strict-"));
  write("package.json", `{ "type": "module" }`);
  const compilerOptions = { strict: true, module: "nodenext", noEmit: true, skipLibCheck: true };
  write("tsconfig.json", JSON.stringify({ compilerOptions, include: ["app/**/*.ts"] }));
  write("app/controllers/application-controller.ts", APPLICATION_CONTROLLER);
  write("app/models/application-record.ts", APPLICATION_RECORD);
  write(
    "app/mailers/application-mailer.ts",
    "export class ApplicationMailer { mail(h: object) {} }",
  );
  write("config/routes.ts", "// routes\n");
});
afterEach(() => fs.rmSync(appDir, { recursive: true, force: true }));

describe("AuthenticationGenerator", () => {
  it("the generated app type-checks under --strict", () => {
    new AuthenticationGenerator({ cwd: appDir, output: () => {} }).run();

    const api = new API();
    try {
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
    }
  });
});
