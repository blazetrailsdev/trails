import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AuthenticationGenerator } from "./authentication-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

// prettier-ignore
const TS_EMIT = ["app/models/session.ts","app/models/user.ts","app/models/current.ts","app/controllers/sessions-controller.ts","app/controllers/concerns/authentication.ts","app/controllers/passwords-controller.ts","app/channels/application-cable/connection.ts","app/mailers/passwords-mailer.ts","test/mailers/previews/passwords-mailer-preview.ts"];
// prettier-ignore
const VIEWS = ["app/views/passwords-mailer/reset.html.tse","app/views/passwords-mailer/reset.text.tse"];
const APP_CTRL_PATH = "app/controllers/application-controller.ts";
const APP_CTRL_EMPTY = `import { ActionController } from "@blazetrails/actionpack";\n\nexport class ApplicationController extends ActionController.Base {\n}\n`;

let tmpDir: string;
const read = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(tmpDir, rel));
const makeGen = () => new AuthenticationGenerator({ cwd: tmpDir, output: () => {} });

const write = (rel: string, content: string) => {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const writeAC = (find: string, replace: string) =>
  write(APP_CTRL_PATH, APP_CTRL_EMPTY.replace(find, replace));
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-auth-"));
  write("tsconfig.json", "{}");
  write(APP_CTRL_PATH, APP_CTRL_EMPTY);
  write("config/routes.ts", "// routes\n");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("AuthenticationGenerator", () => {
  it("emits the full file set; each .ts file parses + carries no Ruby source", () => {
    makeGen().run({ skipMailer: false, skipActionCable: false });
    for (const rel of VIEWS) expect(exists(rel), rel).toBe(true);
    const combined: string[] = [];
    for (const rel of TS_EMIT) {
      const src = read(rel);
      expect(parseTs(src).diagnostics, `diagnostics for ${rel}`).toEqual([]);
      assertNoRubySource(src);
      combined.push(`=== ${rel} ===\n${src}`);
    }
    expect(combined.join("\n")).toMatchSnapshot();
  });

  it("--skip-mailer drops mailer/preview/views; --api keeps mailer but drops views", () => {
    makeGen().run({ skipMailer: true });
    expect(exists("app/mailers/passwords-mailer.ts")).toBe(false);
    expect(exists(VIEWS[0])).toBe(false);
    expect(exists("test/mailers/previews/passwords-mailer-preview.ts")).toBe(false);
    makeGen().run({ api: true, skipMailer: false });
    expect(exists("app/mailers/passwords-mailer.ts")).toBe(true);
    expect(exists(VIEWS[0])).toBe(false);
  });

  it("skips the mailer and channel files while their packages are unported", () => {
    makeGen().run();
    expect(exists("app/mailers/passwords-mailer.ts")).toBe(false);
    expect(exists("test/mailers/previews/passwords-mailer-preview.ts")).toBe(false);
    for (const rel of VIEWS) expect(exists(rel), rel).toBe(false);
    expect(exists("app/channels/application-cable/connection.ts")).toBe(false);
  });

  it("injects inside the class even when ApplicationController has a body", () => {
    writeAC("{\n}", "{\n  async preexisting(): Promise<void> { return; }\n}");
    makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(parseTs(ac).diagnostics).toEqual([]);
    expect(ac.indexOf("include(this, Authentication)")).toBeLessThan(ac.indexOf("preexisting"));
  });

  it("no-op for missing application-controller / routes; throws clearly in JS projects", () => {
    fs.unlinkSync(path.join(tmpDir, APP_CTRL_PATH));
    fs.unlinkSync(path.join(tmpDir, "config/routes.ts"));
    expect(() => makeGen().run()).not.toThrow();
    expect(exists("app/models/user.ts")).toBe(true);
    fs.unlinkSync(path.join(tmpDir, "tsconfig.json"));
    expect(() => makeGen().run()).toThrow(/TypeScript only/);
  });

  it("partial pre-existing config: missing pieces filled, no duplicates", () => {
    // Pre-existing token-less passwords route, session route, extensionless import.
    write(
      "config/routes.ts",
      `// routes\n  router.resources("passwords");\n  router.resource("session");\n`,
    );
    writeAC(
      "\n\nexport",
      `\nimport { Authentication } from "./concerns/authentication";\n\nexport`,
    );
    makeGen().run();
    const routes = read("config/routes.ts");
    expect(routes.match(/router\.resources\("passwords"/g)).toHaveLength(1);
    expect(routes.match(/router\.resource\("session"\)/g)).toHaveLength(1);
    const ac = read(APP_CTRL_PATH);
    expect(ac.match(/import\s+\{\s*Authentication\b/g)).toHaveLength(1);
    expect(ac).toContain("include(this, Authentication);");
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("repairs partial config: mixin present but import missing (and vice versa)", () => {
    writeAC("{\n}", "{\n  static {\n    include(this, Authentication);\n  }\n}");
    makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(ac).toContain('import { Authentication } from "./concerns/authentication.js";');
    expect(ac.match(/include\(this, Authentication\)/g)).toHaveLength(1);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("does not clobber a pre-existing application-cable Connection", () => {
    write("app/channels/application-cable/connection.ts", "// user\n");
    makeGen().run({ skipActionCable: false });
    expect(read("app/channels/application-cable/connection.ts")).toBe("// user\n");
  });

  it("is idempotent — re-running yields byte-identical injected files", () => {
    makeGen().run();
    const [ac, rt] = [read(APP_CTRL_PATH), read("config/routes.ts")];
    makeGen().run();
    expect([read(APP_CTRL_PATH), read("config/routes.ts")]).toEqual([ac, rt]);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("emits working method bodies, not comment stubs", () => {
    makeGen().run({ skipMailer: false, skipActionCable: false });
    // A body whose only statement is a comment is the shape this used to emit.
    for (const rel of TS_EMIT) expect(read(rel), rel).not.toMatch(/\{\s*\/\/[^\n]*\n\s*\}/);
    expect(read("app/controllers/sessions-controller.ts")).toContain("User.authenticateBy(");
    expect(read("app/controllers/concerns/authentication.ts")).toContain("Session.findBy(");
  });

  it("emits create_users and create_sessions migrations", () => {
    const created = makeGen().run();
    const migrations = created.filter((f) => f.startsWith("db/migrate/"));
    expect(migrations).toHaveLength(2);
    expect(migrations.map((f) => f.replace(/^db\/migrate\/\d+_/, ""))).toEqual([
      "create_users.ts",
      "create_sessions.ts",
    ]);
    expect(read(migrations[0])).toContain("email_address");
    expect(read(migrations[1])).toContain("user_agent");
  });

  it("does not silently overwrite an existing file", () => {
    write("app/models/user.ts", "// mine\n");
    makeGen().run();
    expect(read("app/models/user.ts")).toBe("// mine\n");
    expect(read("app/models/session.ts")).toContain("class Session");
  });
});
