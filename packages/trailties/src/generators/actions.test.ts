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
import { assertEqual, assertMock, capture, Mock } from "@blazetrails/activesupport";
import { GeneratorBase } from "./base.js";
import * as Assertions from "./testing/assertions.js";

class TestGenerator extends GeneratorBase {}

let mock: Mock | null;
let previousAdapter: string | null;
let root: string;

const testAdapter: ChildProcessAdapter = {
  spawnSync() {
    throw new Error("unexpected spawnSync");
  },
  async system(command, env) {
    mock!.call(command, { env: { TRAILS_ENV: env.TRAILS_ENV }, capture: false });
    return { pid: 1, status: 0, signal: null };
  },
  async capture2e(command, env) {
    mock!.call(command, { env: { TRAILS_ENV: env.TRAILS_ENV }, capture: true });
    return ["", { pid: 1, status: 0, signal: null }];
  },
};

const draw = "Trails.application.routes().draw(function () {\n";

beforeEach(() => {
  mock = null;
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
  return new TestGenerator({ cwd: root, ...options });
}

function makeGen(): TestGenerator {
  return generator();
}

function assertFile(
  relative: string,
  ...contents: Array<string | RegExp | ((read: string) => unknown)>
) {
  return Assertions.assertFile.call({ destinationRoot: root }, relative, ...contents);
}

function assertInitializer(name: string, ...contents: Array<string | RegExp>) {
  return Assertions.assertInitializer.call({ destinationRoot: root }, name, ...contents);
}

function read(path: string): string {
  return File.read(File.join(root, path));
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertRuns(
  commands: string | string[],
  config: Record<string, unknown> | null,
  block: () => Promise<unknown>,
): Promise<void> {
  const configMatcher =
    config &&
    ((actualConfig: Record<string, unknown>) => {
      assertEqual(config, Object.fromEntries(Object.keys(config).map((k) => [k, actualConfig[k]])));
      return true;
    });

  mock = new Mock();

  for (const command of ([] as string[]).concat(commands)) {
    const commandMatcher = escape(command).replace(/^sudo /, "^sudo .*");
    const args = [new RegExp(`${commandMatcher}$`), configMatcher ?? (() => true)];
    mock.expect("call", null, args);
  }

  await block();

  assertMock(mock);
}

function assertRoutes(...routeCommands: string[]): Promise<void> {
  const routeRegexps = routeCommands.map(
    (routeCommand) =>
      new RegExp(
        `^${escape(draw)}(?:[ ]{2}.+\\n|\\n)*${escape(routeCommand.replace(/^/gm, "  "))}\\n(?:[ ]{2}.+\\n|\\n)*\\}\\);\\n`,
      ),
  );
  return assertFile("config/routes.ts", ...routeRegexps);
}

describe("ActionsTest", () => {
  it("environment should include data in environment initializer block", async () => {
    const autoloadPaths = 'config.autoloadPaths.push("app/extras");';
    await makeGen().environment(autoloadPaths);
    await assertFile(
      "config/application.ts",
      new RegExp(` extends Application \\{\\n  static \\{\\n    ${escape(autoloadPaths)}\\n`),
    );
  });

  it("environment should include data in environment initializer block with env option", async () => {
    const autoloadPaths = 'config.autoloadPaths.push("app/extras");';
    await makeGen().environment(autoloadPaths, { env: "development" });
    await assertFile(
      "config/environments/development.ts",
      new RegExp(`configure\\(function \\(\\) \\{\\n  ${escape(autoloadPaths)}\\n`),
    );
  });

  it("environment with block should include block contents in environment initializer block", async () => {
    await makeGen().environment(null, {}, () => {
      void "// This won't be added";
      return "// This will be added";
    });
    await assertFile("config/application.ts", (content) => {
      expect(content).toMatch(/\/\/ This will be added/);
      expect(content).not.toMatch(/\/\/ This won't be added/);
    });
  });

  it("git with symbol should run command using git scm", async () => {
    await assertRuns("git init", null, () => makeGen().git("init"));
  });

  it("git with hash should run each command using git scm", async () => {
    await assertRuns(["git rm README", "git add ."], null, () =>
      makeGen().git({ rm: "README", add: "." }),
    );
  });

  it("vendor should write data to file in vendor", async () => {
    await makeGen().vendor("vendor-file.ts", "// vendor data");
    await assertFile("vendor/vendor-file.ts", "// vendor data\n");
  });

  it("lib should write data to file with block in lib", async () => {
    const code = "      export class MyLib {\n        static MY_CONSTANT = 123;\n      }\n";
    await makeGen().lib("my-library.ts", null, () => code);
    await assertFile("lib/my-library.ts", "export class MyLib {\n  static MY_CONSTANT = 123;\n}\n");
  });

  it("rakefile should write date to file in lib tasks", async () => {
    await makeGen().rakefile("myapp.ts", "task run");
    await assertFile("lib/tasks/myapp.ts", "task run\n");
  });

  it("initializer should write date to file in config initializers", async () => {
    await makeGen().initializer("constants.ts", "export const MY_CONSTANT = 42;");
    await assertInitializer("constants.ts", "export const MY_CONSTANT = 42;\n");
  });

  it("rake should run rake with the default environment", async () => {
    const previous = ENV.TRAILS_ENV;
    await assertRuns("rake log:clear", { env: { TRAILS_ENV: "development" } }, async () => {
      setEnv("TRAILS_ENV", undefined);
      try {
        await makeGen().rake("log:clear");
      } finally {
        setEnv("TRAILS_ENV", previous);
      }
    });
  });

  it("rake with env option should run rake with the env environment", async () => {
    await assertRuns("rake log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      makeGen().rake("log:clear", { env: "production" }),
    );
  });

  it("rake with sudo option should run rake with sudo", async () => {
    await assertRuns("sudo rake log:clear", null, () =>
      makeGen().rake("log:clear", { sudo: true }),
    );
  });

  it("rake with capture option should run rake with capture", async () => {
    await assertRuns("rake log:clear", { capture: true }, () =>
      makeGen().rake("log:clear", { capture: true }),
    );
  });

  it("route should add route", async () => {
    const routeCommands = ['this.get("foo");', 'this.get("bar");', 'this.get("baz");'];
    const gen = makeGen();
    for (const routeCommand of routeCommands) await gen.route(routeCommand);
    await assertRoutes(...routeCommands);
  });

  it("route should be idempotent", async () => {
    const gen = makeGen();
    const routeCommand = 'this.root("welcome#index");';
    await gen.route(routeCommand);
    await assertRoutes(routeCommand);
    const content = read("config/routes.ts");
    await gen.route(routeCommand);
    await assertFile("config/routes.ts", content);
  });

  it("route with namespace option should nest route", async () => {
    await makeGen().route('this.get("foo");\nthis.get("bar");', { namespace: "baz" });
    await assertRoutes(
      'this.namespace("baz", () => {\n  this.get("foo");\n  this.get("bar");\n});',
    );
  });

  it("route with namespace option injects into existing namespace blocks", async () => {
    const gen = makeGen();
    await gen.route('this.get("foo1");', { namespace: ["baz", "qux"] });
    await gen.route('this.get("foo2");', { namespace: ["baz", "hoge"] });
    await assertRoutes(
      'this.namespace("baz", () => {\n  this.namespace("hoge", () => {\n    this.get("foo2");\n  });\n  this.namespace("qux", () => {\n    this.get("foo1");\n  });\n});',
    );
  });

  it("route with namespace option revokes route without breaking existing namespace blocks", async () => {
    await makeGen().route(
      'this.namespace("baz", () => {\n  this.get("foo1");\n  this.namespace("qux", () => {\n    this.get("foo2");\n    this.namespace("hoge", () => {\n      this.get("foo3");\n    });\n  });\n  this.get("bar1");\n});',
    );
    const revoke = generator({ behavior: "revoke" });
    await revoke.route('this.get("foo2");', { namespace: ["baz", "qux"] });
    await assertRoutes(
      'this.namespace("baz", () => {\n  this.get("foo1");\n  this.namespace("qux", () => {\n    this.namespace("hoge", () => {\n      this.get("foo3");\n    });\n  });\n  this.get("bar1");\n});',
    );
    await revoke.route('this.get("foo3");', { namespace: ["baz", "qux", "hoge"] });
    await assertRoutes(
      'this.namespace("baz", () => {\n  this.get("foo1");\n  this.get("bar1");\n});',
    );
  });

  it("generate should queue a sub-generator invocation", () => {
    const gen = makeGen();
    gen.generate("scaffold", "Post", "title:string");
    expect(gen.pendingGenerators).toEqual([{ what: "scaffold", args: ["Post", "title:string"] }]);
  });

  function action(quiet: boolean, ...args: unknown[]): Promise<string> {
    const gen = generator({ quiet });
    return capture("stdout", () => gen.log(...args));
  }

  it("readme", async () => {
    File.write(File.join(root, "README.md"), "Get your application up and running.\n");
    TestGenerator.sourceRoot(root);
    const gen = generator();
    expect(await capture("stdout", () => gen.readme("README.md"))).toMatch(
      "application up and running",
    );
  });

  it("readme with quiet", async () => {
    File.write(File.join(root, "README.md"), "Get your application up and running.\n");
    TestGenerator.sourceRoot(root);
    const gen = generator({ quiet: true });
    expect(await capture("stdout", () => gen.readme("README.md"))).not.toMatch(
      "application up and running",
    );
  });

  it("log", async () => {
    expect(await action(false, "YES")).toBe("YES\n");
  });

  it("log with status", async () => {
    expect(await action(false, "yes", "YES")).toBe("         yes  YES\n");
  });

  it("log with quiet", async () => {
    expect(await action(true, "YES")).toBe("");
  });

  it("log with status with quiet", async () => {
    expect(await action(true, "yes", "YES")).toBe("");
  });
});
