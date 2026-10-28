import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  childProcessAdapterConfig,
  Dir,
  env as ENV,
  File,
  FileUtils,
  registerChildProcessAdapter,
  setEnv,
  type ChildProcessAdapter,
} from "@blazetrails/ruby-compat";
import { GeneratorBase } from "./base.js";

class TestGenerator extends GeneratorBase {}

interface RunCall {
  command: string;
  env: Record<string, string | undefined>;
  capture: boolean;
}

let calls: RunCall[];
let nextStatus: number;
let previousAdapter: string | null;
let root: string;

const testAdapter: ChildProcessAdapter = {
  spawnSync() {
    throw new Error("unexpected spawnSync");
  },
  async system(command, env) {
    calls.push({ command, env, capture: false });
    return { pid: 1, status: nextStatus, signal: null };
  },
  async capture2e(command, env) {
    calls.push({ command, env, capture: true });
    return ["", { pid: 1, status: nextStatus, signal: null }];
  },
};

const draw = "Trails.application.routes().draw(function () {\n";

beforeEach(() => {
  calls = [];
  nextStatus = 0;
  registerChildProcessAdapter("trailties-actions-test", testAdapter);
  previousAdapter = childProcessAdapterConfig.adapter;
  childProcessAdapterConfig.adapter = "trailties-actions-test";
  root = Dir.mktmpdir("trailties-actions-");
  FileUtils.mkdirP(File.join(root, "config/environments"));
  File.write(
    File.join(root, "config/application.ts"),
    "export class Application extends Application {\n  static {\n  }\n}\n",
  );
  File.write(
    File.join(root, "config/environments/development.ts"),
    "Trails.application.configure(function () {\n});\n",
  );
  File.write(File.join(root, "config/routes.ts"), `${draw}});\n`);
});

afterEach(() => {
  childProcessAdapterConfig.adapter = previousAdapter;
  FileUtils.rmRf(root);
});

function generator(options: { quiet?: boolean; behavior?: "invoke" | "revoke" } = {}) {
  const lines: string[] = [];
  const gen = new TestGenerator({ cwd: root, output: (m) => lines.push(`${m}\n`), ...options });
  return { gen, lines };
}

function makeGen(): TestGenerator {
  return generator().gen;
}

function read(path: string): string {
  return File.read(File.join(root, path));
}

function routes(code: string): string {
  return `${draw}${code.replace(/^/gm, "  ")}\n});\n`;
}

describe("ActionsTest", () => {
  it("environment should include data in environment initializer block", async () => {
    const autoloadPaths = 'config.autoloadPaths.push("app/extras");';
    await makeGen().environment(autoloadPaths);
    expect(read("config/application.ts")).toContain(
      ` extends Application {\n  static {\n    ${autoloadPaths}\n`,
    );
  });

  it("environment should include data in environment initializer block with env option", async () => {
    const autoloadPaths = 'config.autoloadPaths.push("app/extras");';
    await makeGen().environment(autoloadPaths, { env: "development" });
    expect(read("config/environments/development.ts")).toContain(
      `configure(function () {\n  ${autoloadPaths}\n`,
    );
  });

  it("environment with block should include block contents in environment initializer block", async () => {
    await makeGen().environment(null, {}, () => "// This will be added");
    expect(read("config/application.ts")).toMatch(/\/\/ This will be added/);
  });

  it("git with symbol should run command using git scm", async () => {
    await makeGen().git("init");
    expect(calls.map((c) => c.command)).toEqual(["git init"]);
  });

  it("git with hash should run each command using git scm", async () => {
    await makeGen().git({ rm: "README", add: "." });
    expect(calls.map((c) => c.command)).toEqual(["git rm README", "git add ."]);
  });

  it("vendor should write data to file in vendor", async () => {
    await makeGen().vendor("vendor-file.ts", "// vendor data");
    expect(read("vendor/vendor-file.ts")).toBe("// vendor data\n");
  });

  it("lib should write data to file with block in lib", async () => {
    const code = "      export class MyLib {\n        static MY_CONSTANT = 123;\n      }\n";
    await makeGen().lib("my-library.ts", null, () => code);
    expect(read("lib/my-library.ts")).toBe(
      "export class MyLib {\n  static MY_CONSTANT = 123;\n}\n",
    );
  });

  it("rakefile should write date to file in lib tasks", async () => {
    await makeGen().rakefile("myapp.ts", "task run");
    expect(read("lib/tasks/myapp.ts")).toBe("task run\n");
  });

  it("initializer should write date to file in config initializers", async () => {
    await makeGen().initializer("constants.ts", "export const MY_CONSTANT = 42;");
    expect(read("config/initializers/constants.ts")).toBe("export const MY_CONSTANT = 42;\n");
  });

  it("rake should run rake with the default environment", async () => {
    const previous = ENV.TRAILS_ENV;
    setEnv("TRAILS_ENV", undefined);
    try {
      await makeGen().rake("log:clear");
    } finally {
      setEnv("TRAILS_ENV", previous);
    }
    expect(calls[0].command).toBe("bin/rake log:clear");
    expect(calls[0].env.TRAILS_ENV).toBe("development");
  });

  it("rake with env option should run rake with the env environment", async () => {
    await makeGen().rake("log:clear", { env: "production" });
    expect(calls[0].env.TRAILS_ENV).toBe("production");
  });

  it("rake with sudo option should run rake with sudo", async () => {
    await makeGen().rake("log:clear", { sudo: true });
    expect(calls[0].command).toBe("sudo bin/rake log:clear");
  });

  it("rake with capture option should run rake with capture", async () => {
    await makeGen().rake("log:clear", { capture: true });
    expect(calls[0].capture).toBe(true);
  });

  it("route should add route", async () => {
    const routeCommands = ['this.get("foo");', 'this.get("bar");', 'this.get("baz");'];
    const gen = makeGen();
    for (const routeCommand of routeCommands) await gen.route(routeCommand);
    expect(read("config/routes.ts")).toBe(routes([...routeCommands].reverse().join("\n")));
  });

  it("route should be idempotent", async () => {
    const gen = makeGen();
    await gen.route('this.root("welcome#index");');
    const content = read("config/routes.ts");
    await gen.route('this.root("welcome#index");');
    expect(read("config/routes.ts")).toBe(content);
  });

  it("route with namespace option should nest route", async () => {
    await makeGen().route('this.get("foo");\nthis.get("bar");', { namespace: "baz" });
    expect(read("config/routes.ts")).toBe(
      routes('this.namespace("baz", () => {\n  this.get("foo");\n  this.get("bar");\n});'),
    );
  });

  it("route with namespace option injects into existing namespace blocks", async () => {
    const gen = makeGen();
    await gen.route('this.get("foo1");', { namespace: ["baz", "qux"] });
    await gen.route('this.get("foo2");', { namespace: ["baz", "hoge"] });
    expect(read("config/routes.ts")).toBe(
      routes(
        'this.namespace("baz", () => {\n  this.namespace("hoge", () => {\n    this.get("foo2");\n  });\n  this.namespace("qux", () => {\n    this.get("foo1");\n  });\n});',
      ),
    );
  });

  it("route with namespace option revokes route without breaking existing namespace blocks", async () => {
    await makeGen().route(
      'this.namespace("baz", () => {\n  this.get("foo1");\n  this.namespace("qux", () => {\n    this.get("foo2");\n  });\n});',
    );
    await generator({ behavior: "revoke" }).gen.route('this.get("foo2");', {
      namespace: ["baz", "qux"],
    });
    expect(read("config/routes.ts")).toBe(
      routes('this.namespace("baz", () => {\n  this.get("foo1");\n});'),
    );
  });

  it("generate should queue a sub-generator invocation", () => {
    const gen = makeGen();
    gen.generate("scaffold", "Post", "title:string");
    expect(gen.pendingGenerators).toEqual([{ what: "scaffold", args: ["Post", "title:string"] }]);
  });

  function action(quiet: boolean, ...args: unknown[]): string {
    const { gen, lines } = generator({ quiet });
    gen.log(...args);
    return lines.join("");
  }

  it("log", () => {
    expect(action(false, "YES")).toBe("YES\n");
  });

  it("log with status", () => {
    expect(action(false, "yes", "YES")).toBe("         yes  YES\n");
  });

  it("log with quiet", () => {
    expect(action(true, "YES")).toBe("");
  });

  it("log with status with quiet", () => {
    expect(action(true, "yes", "YES")).toBe("");
  });
});
