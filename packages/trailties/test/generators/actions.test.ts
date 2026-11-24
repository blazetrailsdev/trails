import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  childProcessAdapterConfig,
  Dir,
  env as ENV,
  File,
  FileUtils,
  registerChildProcessAdapter,
  setEnv,
  StandardError,
  type ChildProcessAdapter,
  stderr,
  SystemExit,
} from "@blazetrails/ruby-compat";
import {
  assertEqual,
  assertMatch,
  assertRaises,
} from "@blazetrails/activesupport/testing/assertions";
import {
  assertCalled,
  assertMock,
  assertNotCalled,
  Mock,
} from "@blazetrails/activesupport/testing/method-call-assertions";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/trailties/active-record.js";
import "../../lib/test-unit/trailtie.js";
import { Base } from "../../lib/generators/base.js";
import * as Assertions from "../../lib/generators/testing/assertions.js";

class TestGenerator extends Base {}
class ActionsTestApp extends Application {}

let mock: Mock | null;
let previousAdapter: string | null;
let root: string;

const testAdapter: ChildProcessAdapter = {
  spawnSync() {
    throw new Error("unexpected spawnSync");
  },
  async system(command, env, args) {
    mock!.call(args == null ? command : [command, ...args].join(" "), {
      env: { TRAILS_ENV: env.TRAILS_ENV },
      capture: false,
    });
    return { pid: 1, status: 0, signal: null };
  },
  async capture2e(command, env, args) {
    mock!.call(args == null ? command : [command, ...args].join(" "), {
      env: { TRAILS_ENV: env.TRAILS_ENV },
      capture: true,
    });
    return ["", { pid: 1, status: 0, signal: null }];
  },
};

const draw = "Trails.application.routes().draw(function () {\n";

beforeEach(() => {
  mock = null;
  Trails.application = ActionsTestApp.instance();
  registerChildProcessAdapter("trailties-actions-test", testAdapter);
  previousAdapter = childProcessAdapterConfig.adapter;
  childProcessAdapterConfig.adapter = "trailties-actions-test";
  root = Dir.mktmpdir("trailties-actions-");
  FileUtils.mkdirP(File.join(root, "config/environments"));
  File.write(
    File.join(root, "config/application.ts"),
    "export class Application extends Trails.Application {\n  static {\n  }\n}\n",
  );
  File.write(
    File.join(root, "config/environments/development.ts"),
    "Trails.application.configure(function () {\n});\n",
  );
  File.write(File.join(root, "config/routes.ts"), `${draw}});\n`);
});

afterEach(() => {
  Trails.application = null;
  childProcessAdapterConfig.adapter = previousAdapter;
  FileUtils.rmRf(root);
});

function generator(options: { quiet?: boolean; behavior?: "invoke" | "revoke" } = {}) {
  const { behavior, ...rest } = options;
  return new TestGenerator([], rest, { destinationRoot: root, behavior });
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

function assertInitializer(
  name: string,
  ...contents: Array<string | RegExp | ((read: string) => unknown)>
) {
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

async function withTrailsEnv<T>(
  trailsEnv: string | undefined,
  block: () => Promise<T>,
): Promise<T> {
  const previous = ENV.TRAILS_ENV;
  setEnv("TRAILS_ENV", trailsEnv);
  try {
    return await block();
  } finally {
    setEnv("TRAILS_ENV", previous);
  }
}

async function withFailingSystem(block: () => Promise<unknown>): Promise<void> {
  const { system } = testAdapter;
  testAdapter.system = async () => ({ pid: 1, status: 1, signal: null });
  try {
    await block();
  } finally {
    testAdapter.system = system;
  }
}

describe("ActionsTest", () => {
  it("environment should include data in environment initializer block", async () => {
    const autoloadPaths = 'config.autoloadPaths.push("app/extras");';
    await makeGen().environment(autoloadPaths);
    await assertFile(
      "config/application.ts",
      new RegExp(
        ` extends Trails\\.Application \\{\\n  static \\{\\n    ${escape(autoloadPaths)}\\n`,
      ),
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

  it("vendor should write data to file with block in vendor", async () => {
    const code =
      '      console.log("one");\n      console.log("two");\n      console.log("three");\n';
    await makeGen().vendor("vendor-file.ts", null, () => code);
    await assertFile(
      "vendor/vendor-file.ts",
      'console.log("one");\nconsole.log("two");\nconsole.log("three");\n',
    );
  });

  it("lib should write data to file in lib", async () => {
    await makeGen().lib("my-library.ts", "export class MyLibrary");
    await assertFile("lib/my-library.ts", "export class MyLibrary\n");
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

  it("rakefile should write date to file with block in lib tasks", async () => {
    const code =
      '      task("rock", ["environment"], () => {\n        console.log("Rockin\'");\n      });\n';
    await makeGen().rakefile("myapp.ts", null, () => code);
    await assertFile(
      "lib/tasks/myapp.ts",
      'task("rock", ["environment"], () => {\n  console.log("Rockin\'");\n});\n',
    );
  });

  it("initializer should write date to file with block in config initializers", async () => {
    const code = "      MyLib.configure((config) => {\n        config.value = 123;\n      });\n";
    await makeGen().initializer("constants.ts", null, () => code);
    await assertInitializer("constants.ts", (content: string) => {
      assertEqual(content, "MyLib.configure((config) => {\n  config.value = 123;\n});\n");
    });
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

  it("trails_command with inline option", async () => {
    await assertNotCalled(testAdapter, "system", null, async () => {
      await makeGen().trailsCommand("generate model MyModel", { inline: true });
    });
    await assertFile("app/models/my-model.js", /MyModel/);
  });

  it("trails_command with inline option should raise on failure", async () => {
    const error = await assertRaises([StandardError], {}, () =>
      makeGen().trailsCommand("generate model 1234567890", { inline: true }),
    );
    assertMatch(/1234567890/, error.message);
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

  it("generate", async () => {
    await assertRuns("bin/trails generate model MyModel", null, () =>
      makeGen().generate("model", "MyModel"),
    );
  });

  it("generate should raise on failure", async () => {
    const { system } = testAdapter;
    testAdapter.system = async (command, _env, args) => {
      stderr.write(`${[command, ...(args ?? [])].join(" ")}\n`);
      return { pid: 1, status: 1, signal: null };
    };
    try {
      const message = await capture("stderr", () =>
        assertRaises([SystemExit], {}, () => makeGen().generate("model", "1234567890")),
      );
      assertMatch(/1234567890/, message);
    } finally {
      testAdapter.system = system;
    }
  });

  it("generate with inline option", async () => {
    await assertNotCalled(testAdapter, "system", null, async () => {
      await makeGen().generate("model", "MyModel", { inline: true });
    });
    await assertFile("app/models/my-model.js", /MyModel/);
  });

  it("generate with inline option should raise on failure", async () => {
    const error = await assertRaises([StandardError], {}, () =>
      makeGen().generate("model", "1234567890", { inline: true }),
    );
    assertMatch(/1234567890/, error.message);
  });

  function action(quiet: boolean, ...args: unknown[]): Promise<string> {
    const gen = generator({ quiet });
    return capture("stdout", () => gen.log(...args));
  }

  it("readme", async () => {
    File.write(File.join(root, "README.md"), "Get your application up and running.\n");
    const gen = generator();
    await assertCalled(TestGenerator, "sourceRoot", null, { times: 2, returns: root }, async () => {
      expect(await capture("stdout", () => gen.readme("README.md"))).toMatch(
        "application up and running",
      );
    });
  });

  it("readme with quiet", async () => {
    File.write(File.join(root, "README.md"), "Get your application up and running.\n");
    const gen = generator({ quiet: true });
    await assertCalled(TestGenerator, "sourceRoot", null, { times: 2, returns: root }, async () => {
      expect(await capture("stdout", () => gen.readme("README.md"))).not.toMatch(
        "application up and running",
      );
    });
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

  it("add source adds source to gemfile", async () => {
    File.write(File.join(root, ".npmrc"), "");
    await capture("stdout", () => makeGen().addSource("http://gems.github.com"));
    await assertFile(".npmrc", /registry=http:\/\/gems\.github\.com\n/);
  });

  it("gem should put gem dependency in gemfile", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", () => makeGen().gem("will-paginate"));
    await assertFile("package.json", /"will-paginate": "\*"\n/);
  });

  it("gem with version should include version in gemfile", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gem("rspec", ">= 2.0.0.a5");
      await gen.gem("RedCloth", ">= 4.1.0", "< 4.2.0");
      await gen.gem("nokogiri", { version: ">= 1.4.2" });
      await gen.gem("faker", { version: [">= 0.1.0", "< 0.3.0"] });
    });

    await assertFile("package.json", (content: string) => {
      assertMatch(/"rspec": ">= 2\.0\.0\.a5"/, content);
      assertMatch(/"RedCloth": ">= 4\.1\.0 < 4\.2\.0"/, content);
      assertMatch(/"nokogiri": ">= 1\.4\.2"/, content);
      assertMatch(/"faker": ">= 0\.1\.0 < 0\.3\.0"/, content);
    });
  });

  it("gem group should wrap gems in a group", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gemGroup("development", "test", () => gen.gem("rspec-rails"));
      await gen.gemGroup("test", () => gen.gem("fakeweb"));
    });

    await assertFile(
      "package.json",
      /"devDependencies": \{\n {4}"rspec-rails": "\*",\n {4}"fakeweb": "\*"\n {2}\}\n/,
    );
  });

  it("gem should include options", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", () =>
      makeGen().gem("rspec", { github: "dchelimsky/rspec", tag: "1.2.9.rc1" }),
    );
    await assertFile("package.json", /"rspec": "github:dchelimsky\/rspec#1\.2\.9\.rc1"/);
  });

  it("gem with non string options", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gem("rspec", { require: false });
      await gen.gem("rspec-rails", { group: ["development", "test"] });
    });
    await assertFile("package.json", /"dependencies": \{\n {4}"rspec": "\*"\n/);
    await assertFile("package.json", /"devDependencies": \{\n {4}"rspec-rails": "\*"\n/);
  });

  it("gem falls back to inspect if string contains single quote", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", () => makeGen().gem("rspec", ">=2.0.0"));
    await assertFile("package.json", /"rspec": ">=2\.0\.0"/);
  });

  it("gem works even if frozen string is passed as argument", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", () => makeGen().gem("frozen_gem", "1.0.0"));
    await assertFile("package.json", /"frozen_gem": "1\.0\.0"/);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("add source with block adds source to gemfile with gem", async () => {
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.addSource("http://gems.github.com", {}, () => gen.gem("rspec-rails"));
    });
    await assertFile(
      "Gemfile",
      /\n\nsource "http:\/\/gems\.github\.com" do\n {2}gem "rspec-rails"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("add source with block adds source to gemfile after gem", async () => {
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gem("will-paginate");
      await gen.addSource("http://gems.github.com", {}, () => gen.gem("rspec-rails"));
    });
    await assertFile(
      "Gemfile",
      /\ngem "will-paginate"\n\nsource "http:\/\/gems\.github\.com" do\n {2}gem "rspec-rails"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("add source should create newline between blocks", async () => {
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.addSource("http://gems.github.com", {}, () => gen.gem("rspec-rails"));
      await gen.addSource("http://gems2.github.com", {}, () => gen.gem("fakeweb"));
    });
    await assertFile(
      "Gemfile",
      /\n\nsource "http:\/\/gems\.github\.com" do\n {2}gem "rspec-rails"\nend\n\nsource "http:\/\/gems2\.github\.com" do\n {2}gem "fakeweb"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem should insert on separate lines", async () => {
    File.write(
      File.join(root, "Gemfile"),
      `${File.read(File.join(root, "Gemfile"))}# Some content...`,
    );
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gem("rspec");
      await gen.gem("rspec-rails");
    });
    await assertFile("Gemfile", /^gem "rspec"$/m);
    await assertFile("Gemfile", /^gem "rspec-rails"$/m);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem should put the comment before gem declaration", async () => {
    await capture("stdout", () => makeGen().gem("rspec", { comment: "Use RSpec" }));
    await assertFile("Gemfile", /# Use RSpec\ngem "rspec"/);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem should support multiline comments", async () => {
    await capture("stdout", () =>
      makeGen().gem("rspec", { comment: "Use RSpec\nReplaces minitest" }),
    );
    await assertFile("Gemfile", /# Use RSpec\n# Replaces minitest\ngem "rspec"/);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem group should indent comments", async () => {
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gemGroup("test", () => gen.gem("fakeweb", { comment: "Fake requests" }));
    });
    await assertFile(
      "Gemfile",
      /\n\ngroup :test do\n {2}# Fake requests\n {2}gem "fakeweb"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem group should indent multiline comments", async () => {
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gemGroup("test", () =>
        gen.gem("fakeweb", { comment: "Fake requests\nNeeded in tests" }),
      );
    });
    await assertFile(
      "Gemfile",
      /\n\ngroup :test do\n {2}# Fake requests\n {2}# Needed in tests\n {2}gem "fakeweb"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem with gemfile without newline at the end", async () => {
    File.write(
      File.join(root, "Gemfile"),
      `${File.read(File.join(root, "Gemfile"))}gem "rspec-rails"`,
    );
    await capture("stdout", () => makeGen().gem("will-paginate"));
    await assertFile("Gemfile", /gem "rspec-rails"\ngem "will-paginate"\n$/);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("gem group with gemfile without newline at the end", async () => {
    File.write(
      File.join(root, "Gemfile"),
      `${File.read(File.join(root, "Gemfile"))}gem "rspec-rails"`,
    );
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gemGroup("test", () => gen.gem("fakeweb"));
    });
    await assertFile("Gemfile", /gem "rspec-rails"\n\ngroup :test do\n {2}gem "fakeweb"\nend\n$/);
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("add source with gemfile without newline at the end", async () => {
    File.write(
      File.join(root, "Gemfile"),
      `${File.read(File.join(root, "Gemfile"))}gem "rspec-rails"`,
    );
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.addSource("http://gems.github.com", {}, () => gen.gem("fakeweb"));
    });
    await assertFile(
      "Gemfile",
      /gem "rspec-rails"\n\nsource "http:\/\/gems\.github\.com" do\n {2}gem "fakeweb"\nend\n$/,
    );
  });

  // PERMANENT-SKIP: trailties CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)"
  it.skip("github with gemfile without newline at the end", async () => {
    File.write(
      File.join(root, "Gemfile"),
      `${File.read(File.join(root, "Gemfile"))}gem "rspec-rails"`,
    );
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.github("user/repo", {}, () => gen.gem("fakeweb"));
    });
    await assertFile(
      "Gemfile",
      /gem "rspec-rails"\n\ngithub "user\/repo" do\n {2}gem "fakeweb"\nend\n$/,
    );
  });

  it("github should create an indented block", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.github("user/repo", {}, async () => {
        await gen.gem("foo");
        await gen.gem("bar");
        await gen.gem("baz");
      });
    });
    await assertFile(
      "package.json",
      /"foo": "github:user\/repo",\n {4}"bar": "github:user\/repo",\n {4}"baz": "github:user\/repo"\n/,
    );
  });

  it("github should create an indented block with options", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.github("user/repo", { a: "correct", other: true }, () => gen.gem("foo"));
      await gen.github("user/repo2", { branch: "main" }, () => gen.gem("bar"));
    });
    await assertFile(
      "package.json",
      /"foo": "github:user\/repo",\n {4}"bar": "github:user\/repo2#main"\n/,
    );
  });

  it("github should create newline between blocks", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.github("user/repo", { a: "correct", other: true }, () => gen.gem("foo"));
      await gen.github("user/repo2", { a: "correct", other: true }, () => gen.gem("bar"));
    });
    await assertFile(
      "package.json",
      /"foo": "github:user\/repo",\n {4}"bar": "github:user\/repo2"\n/,
    );
  });

  it("github should create an indented block within a group", async () => {
    File.write(File.join(root, "package.json"), '{\n  "name": "app"\n}\n');
    await capture("stdout", async () => {
      const gen = makeGen();
      await gen.gemGroup("test", async () => {
        await gen.github("user/repo", { a: "correct", other: true }, () => gen.gem("foo"));
        await gen.github("user/repo2", { a: "correct", other: true }, () => gen.gem("bar"));
      });
    });
    await assertFile(
      "package.json",
      /"devDependencies": \{\n {4}"foo": "github:user\/repo",\n {4}"bar": "github:user\/repo2"\n/,
    );
  });

  it("invoke other generator with shortcut", async () => {
    await makeGen().invoke("model", ["my_model"]);
    await assertFile("app/models/my-model.js", /MyModel/);
  });

  it("invoke other generator with full namespace", async () => {
    await makeGen().invoke("trails:model", ["my_model"]);
    await assertFile("app/models/my-model.js", /MyModel/);
  });

  it("create file should write data to file path", async () => {
    await makeGen().createFile("lib/test-file.ts", "here's test data");
    await assertFile("lib/test-file.ts", "here's test data");
  });

  it("create file should write block contents to file path", async () => {
    await makeGen().createFile("lib/test-file.ts", () => "here's block data");
    await assertFile("lib/test-file.ts", "here's block data");
  });

  it("environment with block should include block contents with multiline data in environment initializer block", async () => {
    const data = '      this.config.encoding = "utf-8";\n      this.config.timeZone = "UTC";\n';
    await makeGen().environment(null, {}, () => data);
    await assertFile(
      "config/application.ts",
      new RegExp(
        ` extends Trails\\.Application \\{\\n  static \\{\\n${escape(data.replace(/^ {6}/gm, "    "))}`,
      ),
    );
  });

  it("environment should include block contents with multiline data in environment initializer block with env option", async () => {
    const data = '      this.config.encoding = "utf-8";\n      this.config.timeZone = "UTC";\n';
    await makeGen().environment(null, { env: "development" }, () => data);
    await assertFile(
      "config/environments/development.ts",
      new RegExp(
        `Trails\\.application\\.configure\\(function \\(\\) \\{\\n${escape(data.replace(/^ {6}/gm, "  "))}`,
      ),
    );
  });

  it("rake with TRAILS_ENV set should run rake with the TRAILS_ENV environment", async () => {
    await assertRuns("rake log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      withTrailsEnv("production", () => makeGen().rake("log:clear")),
    );
  });

  it("rake with env option and TRAILS_ENV set should run rake with the env environment", async () => {
    await assertRuns("rake log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      withTrailsEnv("staging", () => makeGen().rake("log:clear", { env: "production" })),
    );
  });

  it("rake with abort_on_failure option should raise on failure", async () => {
    await capture("stderr", () =>
      withFailingSystem(() =>
        assertRaises([SystemExit], {}, () => makeGen().rake("invalid", { abortOnFailure: true })),
      ),
    );
  });

  it("trails_command should run trails with the default environment", async () => {
    await assertRuns("trails log:clear", { env: { TRAILS_ENV: "development" } }, () =>
      withTrailsEnv(undefined, () => makeGen().trailsCommand("log:clear")),
    );
  });

  it("trails_command with env option should run trails with the env environment", async () => {
    await assertRuns("trails log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      makeGen().trailsCommand("log:clear", { env: "production" }),
    );
  });

  it("trails_command with TRAILS_ENV set should run trails with the TRAILS_ENV environment", async () => {
    await assertRuns("trails log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      withTrailsEnv("production", () => makeGen().trailsCommand("log:clear")),
    );
  });

  it("trails_command with env option and TRAILS_ENV set should run trails with the env environment", async () => {
    await assertRuns("trails log:clear", { env: { TRAILS_ENV: "production" } }, () =>
      withTrailsEnv("staging", () => makeGen().trailsCommand("log:clear", { env: "production" })),
    );
  });

  it("trails_command with sudo option should run trails with sudo", async () => {
    await assertRuns("sudo trails log:clear", null, () =>
      withTrailsEnv(undefined, () => makeGen().trailsCommand("log:clear", { sudo: true })),
    );
  });

  it("trails_command with capture option should run trails with capture", async () => {
    await assertRuns("trails log:clear", { capture: true }, () =>
      withTrailsEnv(undefined, () => makeGen().trailsCommand("log:clear", { capture: true })),
    );
  });

  it("trails_command with abort_on_failure option should raise on failure", async () => {
    await capture("stderr", () =>
      withFailingSystem(() =>
        assertRaises([SystemExit], {}, () =>
          makeGen().trailsCommand("invalid", { abortOnFailure: true }),
        ),
      ),
    );
  });

  it("route should indent routing code", async () => {
    const routeCommands = ['this.get("foo");', 'this.get("bar");', 'this.get("baz");'];
    await makeGen().route(routeCommands.join("\n"));
    await assertRoutes(...routeCommands);
  });

  it("route with namespace option array should deeply nest route", async () => {
    await makeGen().route('this.get("foo");\nthis.get("bar");', { namespace: ["baz", "qux"] });
    await assertRoutes(
      'this.namespace("baz", () => {\n  this.namespace("qux", () => {\n    this.get("foo");\n    this.get("bar");\n  });\n});',
    );
  });
});
