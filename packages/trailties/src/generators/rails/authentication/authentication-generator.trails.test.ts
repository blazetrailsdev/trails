import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { registerChildProcessAdapter, childProcessAdapterConfig } from "@blazetrails/ruby-compat";
import { AuthenticationGenerator } from "./authentication-generator.js";
import { Application } from "../../../application.js";
import { Trails } from "../../../rails.js";
import "../../../trailties/active-record.js";

class AuthenticationGeneratorApp extends Application {}

beforeEach(() => {
  Trails.application = AuthenticationGeneratorApp.instance();
});

afterEach(() => {
  Trails.application = null;
});

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const compilerOptions = { strict: true, module: "nodenext", noEmit: true, skipLibCheck: true };
const APP_FILES: Record<string, string> = {
  "package.json": `{ "type": "module" }`,
  "tsconfig.json": JSON.stringify({ compilerOptions, include: ["app/**/*.ts"] }),
  "app/controllers/application-controller.ts": `import { ActionController } from "@blazetrails/actionpack";\nexport class ApplicationController extends ActionController.Base {}\n`,
  "app/models/application-record.ts": `import { Base } from "@blazetrails/activerecord";\nexport class ApplicationRecord extends Base {}\n`,
  "app/mailers/application-mailer.ts": "export class ApplicationMailer { mail(h: object) {} }",
  "config/routes.ts": "export function drawRoutes(mapper: Mapper): void {\n}\n",
};

describe("AuthenticationGenerator", () => {
  it("the generated app type-checks under --strict", async () => {
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
      await new AuthenticationGenerator({ cwd: appDir, output: () => {} }).run();

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

describe("AuthenticationGenerator pending generators", () => {
  it("re-running replaces create_users and create_sessions without a conflict", async () => {
    registerChildProcessAdapter("trailties-auth-rerun-test", {
      spawnSync: () => ({ status: 0, signal: null, stdout: "", stderr: "" }),
    });
    childProcessAdapterConfig.adapter = "trailties-auth-rerun-test";
    const appDir = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-auth-rerun-"));
    try {
      for (const [rel, content] of Object.entries(APP_FILES)) {
        fs.mkdirSync(path.dirname(path.join(appDir, rel)), { recursive: true });
        fs.writeFileSync(path.join(appDir, rel), content);
      }
      const generate = () => new AuthenticationGenerator({ cwd: appDir, output: () => {} }).run();
      await generate();
      await expect(generate()).resolves.toBeDefined();

      const migrations = fs.readdirSync(path.join(appDir, "db/migrate"));
      expect(migrations.filter((f) => f.endsWith("_create_users.ts"))).toHaveLength(1);
      expect(migrations.filter((f) => f.endsWith("_create_sessions.ts"))).toHaveLength(1);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});
