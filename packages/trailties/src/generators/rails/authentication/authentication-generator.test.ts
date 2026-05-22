import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AuthenticationGenerator } from "./authentication-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

// prettier-ignore
const TS_EMIT = ["src/app/models/session.ts","src/app/models/user.ts","src/app/models/current.ts","src/app/controllers/sessions-controller.ts","src/app/controllers/concerns/authentication.ts","src/app/controllers/passwords-controller.ts","src/app/channels/application-cable/connection.ts","src/app/mailers/passwords-mailer.ts","test/mailers/previews/passwords-mailer-preview.ts"];
// prettier-ignore
const VIEWS = ["src/app/views/passwords-mailer/reset.html.tse","src/app/views/passwords-mailer/reset.text.tse"];
const APP_CTRL_PATH = "src/app/controllers/application-controller.ts";
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
  write("src/config/routes.ts", "// routes\n");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("AuthenticationGenerator", () => {
  it("emits the full file set; each .ts file parses + carries no Ruby source", () => {
    makeGen().run();
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
    expect(exists("src/app/mailers/passwords-mailer.ts")).toBe(false);
    expect(exists(VIEWS[0]!)).toBe(false);
    expect(exists("test/mailers/previews/passwords-mailer-preview.ts")).toBe(false);
    makeGen().run({ api: true });
    expect(exists("src/app/mailers/passwords-mailer.ts")).toBe(true);
    expect(exists(VIEWS[0]!)).toBe(false);
  });

  it("injects inside the class even when ApplicationController has a body", () => {
    writeAC("{\n}", "{\n  async preexisting(): Promise<void> { return; }\n}");
    makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(parseTs(ac).diagnostics).toEqual([]);
    expect(ac.indexOf("Authentication.includeInto")).toBeLessThan(ac.indexOf("preexisting"));
  });

  it("no-op for missing application-controller / routes; throws clearly in JS projects", () => {
    fs.unlinkSync(path.join(tmpDir, APP_CTRL_PATH));
    fs.unlinkSync(path.join(tmpDir, "src/config/routes.ts"));
    expect(() => makeGen().run()).not.toThrow();
    expect(exists("src/app/models/user.ts")).toBe(true);
    fs.unlinkSync(path.join(tmpDir, "tsconfig.json"));
    expect(() => makeGen().run()).toThrow(/TypeScript only/);
  });

  it("partial pre-existing config: missing pieces filled, no duplicates", () => {
    // Pre-existing token-less passwords route, session route, extensionless import.
    write(
      "src/config/routes.ts",
      `// routes\n  router.resources("passwords");\n  router.resource("session");\n`,
    );
    writeAC(
      "\n\nexport",
      `\nimport { Authentication } from "./concerns/authentication";\n\nexport`,
    );
    makeGen().run();
    const routes = read("src/config/routes.ts");
    expect(routes.match(/router\.resources\("passwords"/g)).toHaveLength(1);
    expect(routes.match(/router\.resource\("session"\)/g)).toHaveLength(1);
    const ac = read(APP_CTRL_PATH);
    expect(ac.match(/import\s+\{\s*Authentication\b/g)).toHaveLength(1);
    expect(ac).toContain("Authentication.includeInto(this);");
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("repairs partial config: mixin present but import missing (and vice versa)", () => {
    writeAC("{\n}", "{\n  static {\n    Authentication.includeInto(this);\n  }\n}");
    makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(ac).toContain('import { Authentication } from "./concerns/authentication.js";');
    expect(ac.match(/Authentication\.includeInto\(this\)/g)).toHaveLength(1);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("does not clobber a pre-existing application-cable Connection", () => {
    write("src/app/channels/application-cable/connection.ts", "// user\n");
    makeGen().run();
    expect(read("src/app/channels/application-cable/connection.ts")).toBe("// user\n");
  });

  it("is idempotent — re-running yields byte-identical injected files", () => {
    makeGen().run();
    const [ac, rt] = [read(APP_CTRL_PATH), read("src/config/routes.ts")];
    makeGen().run();
    expect([read(APP_CTRL_PATH), read("src/config/routes.ts")]).toEqual([ac, rt]);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });
});
