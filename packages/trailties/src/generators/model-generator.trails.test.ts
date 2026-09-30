import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { GeneratorError } from "./generated-attribute.js";
import { ModelGenerator } from "./model-generator.js";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";
import "../test-unit/trailtie.js";

class ModelGeneratorApp extends Application {}

beforeEach(async () => {
  Trails.application = ModelGeneratorApp.instance();
  await Trails.application.loadGenerators();
});

afterEach(() => {
  Trails.application = null;
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ModelGenerator({ cwd: tmpDir, output: () => {} });
}

describe("ModelGeneratorTest", () => {
  it("password digest attribute adds has secure password as the last line", async () => {
    await makeGen().run("User", ["account:references", "token:token", "password:digest"]);
    const content = fs.readFileSync(path.join(tmpDir, "app/models/user.ts"), "utf-8");
    expect(content).toContain(
      '    this.belongsTo("account");\n    this.hasSecureToken();\n    this.hasSecurePassword();\n  }',
    );
  });

  it("password digest attribute creates password_digest string column", async () => {
    const files = await makeGen().run("User", ["name", "password:digest"]);
    const migFile = files.find((f) => f.startsWith("db/migrate/"));
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain('t.string("password_digest");');
    expect(content).not.toContain("t.digest");
  });

  it("digest attribute not named password does not add has secure password", async () => {
    await makeGen().run("User", ["recovery:digest"]);
    const content = fs.readFileSync(path.join(tmpDir, "app/models/user.ts"), "utf-8");
    expect(content).not.toContain("hasSecurePassword");
  });

  it("unknown attribute type raises GeneratedAttribute's error", async () => {
    await expect(makeGen().run("User", ["name:unknown"])).rejects.toThrow(
      new GeneratorError("Could not generate field 'name' with unknown type 'unknown'."),
    );
  });

  it("unknown attribute index raises GeneratedAttribute's error", async () => {
    await expect(makeGen().run("User", ["name:string:unknown"])).rejects.toThrow(
      new GeneratorError("Could not generate field 'name' with unknown index 'unknown'."),
    );
  });

  it("writes a namespaced model's unit test and fixture under its class path, importing test/test-helper", async () => {
    await makeGen().run("admin/account", ["name:string"]);
    const unitTest = fs.readFileSync(
      path.join(tmpDir, "test/models/admin/account.test.ts"),
      "utf-8",
    );
    expect(unitTest).toContain('import "../../test-helper.js";');
    expect(unitTest).toContain('describe("AdminAccountTest"');
    expect(fs.existsSync(path.join(tmpDir, "test/fixtures/admin/accounts.yml"))).toBe(true);
  });
});
