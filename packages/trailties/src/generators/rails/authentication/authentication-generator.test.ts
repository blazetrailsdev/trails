import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { registerChildProcessAdapter, childProcessAdapterConfig } from "@blazetrails/ruby-compat";
import { TopLevel } from "@blazetrails/activesupport";
import { AuthenticationGenerator } from "./authentication-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

// prettier-ignore
const TS_EMIT = ["app/models/session.ts","app/models/user.ts","app/models/current.ts","app/controllers/sessions-controller.ts","app/controllers/concerns/authentication.ts","app/controllers/passwords-controller.ts","app/channels/application-cable/connection.ts","app/mailers/passwords-mailer.ts","test/mailers/previews/passwords-mailer-preview.ts"];
// prettier-ignore
const VIEWS = ["app/views/passwords-mailer/reset.html.tse","app/views/passwords-mailer/reset.text.tse"];
// prettier-ignore
const TEMPLATE_ENGINE_VIEWS = ["app/views/passwords/new.html.tse","app/views/passwords/edit.html.tse","app/views/sessions/new.html.tse"];
const APP_CTRL_PATH = "app/controllers/application-controller.ts";
const APP_CTRL_EMPTY = `import { ActionController } from "@blazetrails/actionpack";\n\nexport class ApplicationController extends ActionController.Base {\n}\n`;

let tmpDir: string;
const read = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(tmpDir, rel));
const makeGen = (options: { api?: boolean } = {}) =>
  new AuthenticationGenerator({ cwd: tmpDir, output: () => {}, ...options });
const withActionCableEngine = async (block: () => Promise<unknown>) => {
  const oldValue = TopLevel.ActionCable;
  TopLevel.ActionCable = { Engine: class Engine {} };
  try {
    await block();
  } finally {
    TopLevel.ActionCable = oldValue;
  }
};

const write = (rel: string, content: string) => {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const writeAC = (find: string, replace: string) =>
  write(APP_CTRL_PATH, APP_CTRL_EMPTY.replace(find, replace));
let spawned: string[][];
beforeEach(() => {
  spawned = [];
  registerChildProcessAdapter("trailties-auth-test", {
    spawnSync: (cmd, args) => {
      spawned.push([cmd, ...args]);
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  });
  childProcessAdapterConfig.adapter = "trailties-auth-test";
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-auth-"));
  write("tsconfig.json", "{}");
  write(APP_CTRL_PATH, APP_CTRL_EMPTY);
  write("config/routes.ts", "export function drawRoutes(mapper: Mapper): void {\n}\n");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("AuthenticationGenerator", () => {
  it("emits the full file set; each .ts file parses + carries no Ruby source", async () => {
    await withActionCableEngine(() => makeGen().run());
    for (const rel of [...VIEWS, ...TEMPLATE_ENGINE_VIEWS]) expect(exists(rel), rel).toBe(true);
    const combined: string[] = [];
    for (const rel of TS_EMIT) {
      const src = read(rel);
      expect(parseTs(src).diagnostics, `diagnostics for ${rel}`).toEqual([]);
      assertNoRubySource(src);
      combined.push(`=== ${rel} ===\n${src}`);
    }
    expect(combined.join("\n")).toMatchSnapshot();
  });

  it("--api still templates the mailer, its views and its preview", async () => {
    await AuthenticationGenerator.start(["--api"], { cwd: tmpDir, output: () => {} });
    expect(exists("app/mailers/passwords-mailer.ts")).toBe(true);
    for (const rel of VIEWS) expect(exists(rel), rel).toBe(true);
    for (const rel of TEMPLATE_ENGINE_VIEWS) expect(exists(rel), rel).toBe(false);
    expect(exists("test/mailers/previews/passwords-mailer-preview.ts")).toBe(true);
  });

  it("connection_class_skipped_without_action_cable", async () => {
    const oldValue = TopLevel.ActionCable;
    TopLevel.ActionCable = {};
    try {
      await makeGen().run();
    } finally {
      TopLevel.ActionCable = oldValue;
    }

    expect(exists("app/channels/application-cable/connection.ts")).toBe(false);
  });

  it("injects inside the class even when ApplicationController has a body", async () => {
    writeAC("{\n}", "{\n  async preexisting(): Promise<void> { return; }\n}");
    await makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(parseTs(ac).diagnostics).toEqual([]);
    expect(ac.indexOf("include(this, Authentication)")).toBeLessThan(ac.indexOf("preexisting"));
  });

  it("no-op for missing application-controller / routes; throws clearly in JS projects", async () => {
    fs.unlinkSync(path.join(tmpDir, APP_CTRL_PATH));
    await expect(makeGen().run()).resolves.toBeDefined();
    expect(exists("app/models/user.ts")).toBe(true);
    fs.unlinkSync(path.join(tmpDir, "config/routes.ts"));
    await expect(makeGen().run()).rejects.toThrow(/routes\.ts/);
    fs.unlinkSync(path.join(tmpDir, "tsconfig.json"));
    await expect(makeGen().run()).rejects.toThrow(/TypeScript only/);
  });

  it("partial pre-existing config: missing pieces filled, no duplicates", async () => {
    write(
      "config/routes.ts",
      `export function drawRoutes(mapper: Mapper): void {\n  mapper.resources("passwords", { param: "token" });\n  mapper.resource("session");\n}\n`,
    );
    writeAC(
      "\n\nexport",
      `\nimport { Authentication } from "./concerns/authentication";\n\nexport`,
    );
    await makeGen().run();
    const routes = read("config/routes.ts");
    expect(routes.match(/mapper\.resources\("passwords"/g)).toHaveLength(1);
    expect(routes.match(/mapper\.resource\("session"\)/g)).toHaveLength(1);
    const ac = read(APP_CTRL_PATH);
    expect(ac.match(/import\s+\{\s*Authentication\b/g)).toHaveLength(1);
    expect(ac).toContain("include(this, Authentication);");
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("repairs partial config: mixin present but import missing (and vice versa)", async () => {
    writeAC("{\n}", "{\n  static {\n    include(this, Authentication);\n  }\n}");
    await makeGen().run();
    const ac = read(APP_CTRL_PATH);
    expect(ac).toContain(
      'import { Authentication, type ClassMethods } from "./concerns/authentication.js";',
    );
    expect(ac.match(/include\(this, Authentication\)/g)).toHaveLength(1);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("does not clobber a pre-existing application-cable Connection", async () => {
    write("app/channels/application-cable/connection.ts", "// user\n");
    await withActionCableEngine(() => makeGen().run());
    expect(read("app/channels/application-cable/connection.ts")).toBe("// user\n");
  });

  it("is idempotent — re-running yields byte-identical injected files", async () => {
    await makeGen().run();
    const [ac, rt] = [read(APP_CTRL_PATH), read("config/routes.ts")];
    await makeGen().run();
    expect([read(APP_CTRL_PATH), read("config/routes.ts")]).toEqual([ac, rt]);
    expect(parseTs(ac).diagnostics).toEqual([]);
  });

  it("emits working method bodies, not comment stubs", async () => {
    await withActionCableEngine(() => makeGen().run());
    for (const rel of TS_EMIT) expect(read(rel), rel).not.toMatch(/\{\s*\/\/[^\n]*\n\s*\}/);
    expect(read("app/controllers/sessions-controller.ts")).toContain("User.authenticateBy(");
    expect(read("app/controllers/concerns/authentication.ts")).toContain("Session.findBy(");
  });

  it("emits create_users and create_sessions migrations", async () => {
    const migrations = (await makeGen().run()).filter((f) => f.startsWith("db/migrate/"));
    const names = migrations.map((f) => f.replace(/^db\/migrate\/\d+_/, ""));
    expect(names).toEqual(["create_users.ts", "create_sessions.ts"]);
    expect(read(migrations[0])).toContain("email_address");
    expect(read(migrations[1])).toContain("user_agent");
  });

  it("adds bcryptjs to the application's dependencies and installs it", async () => {
    write("package.json", '{ "dependencies": { "@blazetrails/activerecord": "*" } }');
    await makeGen().run();
    expect(JSON.parse(read("package.json")).dependencies.bcryptjs).toBe("*");
    expect(spawned).toContainEqual(["pnpm", "install", "--silent"]);
  });

  it("does not silently overwrite an existing file", async () => {
    write("app/models/user.ts", "// mine\n");
    await makeGen().run();
    expect(read("app/models/user.ts")).toBe("// mine\n");
  });
});
