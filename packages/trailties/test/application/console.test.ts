import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { REPLServer } from "node:repl";
import { RouteSet } from "@blazetrails/actionpack";
import { File } from "@blazetrails/ruby-compat/file";
import { constSet, include } from "@blazetrails/ruby-compat/include";
import { STDIN, STDOUT } from "@blazetrails/ruby-compat/io";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { setEnv, getProcessAdapter } from "@blazetrails/ruby-compat/process-adapter";
import {
  TSREPL,
  registerReplAdapter,
  replAdapterConfig,
} from "@blazetrails/ruby-compat/repl-adapter";
import { constGet, rbModRemoveConst } from "@blazetrails/ruby-compat/variable";
import { Console, ConsoleCommand } from "../../lib/commands/console.js";
import { Trails } from "../../lib/trails.js";
import { Reloader } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { ActiveRecord, AbstractAdapter } from "@blazetrails/activerecord";
import { Application } from "../../lib/application.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

interface Primary {
  output: string;
  read: number;
  server: REPLServer | null;
  input: PassThrough | null;
}

const primary = vi.hoisted((): Primary => ({ output: "", read: 0, server: null, input: null }));

const actual = await import("node:repl");
registerReplAdapter("full-stack-console", {
  start(options) {
    const input = new PassThrough();
    const output = new PassThrough();
    input.on("data", (chunk) => (primary.output += String(chunk)));
    output.on("data", (chunk) => (primary.output += String(chunk)));
    primary.input = input;
    primary.server = actual.start({ ...options, input, output, terminal: false });
    return primary.server;
  },
});

async function assertOutput(expected: string, io: Primary, timeout = 10): Promise<void> {
  let output = "";
  await vi
    .waitFor(
      () => {
        output = io.output.slice(io.read);
        if (!output.includes(expected)) throw new Error("waiting");
      },
      { timeout: timeout * 1000, interval: 10 },
    )
    .catch(() => {});
  expect(output, `${JSON.stringify(expected)} expected, but got:\n\n${output}`).toContain(expected);
  io.read += output.indexOf(expected) + expected.length;
}

let started: Promise<void> | null = null;
let previousAdapter: string | undefined;
let previousEnv: string;
const spawnedEnv: string[] = [];

async function spawnConsole(
  options: string,
  {
    waitForPrompt = true,
    env = {},
  }: { waitForPrompt?: boolean; env?: Record<string, string> } = {},
): Promise<void> {
  env = { TERM: "dumb", ...env };
  TSREPL._existingRcNameGenerators = null;
  for (const [key, value] of Object.entries(env)) setEnv(key, value);
  spawnedEnv.push(...Object.keys(env));
  const { environment } = new ConsoleCommand([], options.split(" ")).options;
  if (environment != null) Trails.env = environment;
  started = Console.start(
    Trails.application as never,
    new ConsoleCommand([], options.split(" ")).options,
  );

  if (waitForPrompt) {
    await assertOutput("> ", primary, 30);
  }
}

async function writePrompt(
  command: string,
  expectedOutput: string | null = null,
  { prompt = "> " } = {},
): Promise<void> {
  primary.input!.write(`${command}\n`);
  await assertOutput(command, primary);
  if (expectedOutput) await assertOutput(expectedOutput, primary, 100);
  await assertOutput(prompt, primary);
}

describe("FullStackConsoleTest", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(STDIN, "isTty").mockReturnValue(true);
    vi.spyOn(STDOUT, "puts").mockImplementation((...args) => {
      primary.output += `${args.join("\n")}\n`;
      return null;
    });
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((() => undefined) as never);
    class ApplicationController {
      static helpers() {
        return { truncate: (s: string) => `${s.slice(0, 27)}...` };
      }
    }
    constSet(TopLevel, "ApplicationController", ApplicationController);
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("foo", { to: "foo#index" });
    });
    previousEnv = String(Trails.env);
    Trails.application = {
      sandbox: null,
      config: {},
      reloader: Reloader,
      name: () => "app-template",
      loadConsole: async () => {},
      reloadRoutesUnlessLoaded: async () => true,
      routes: () => routes,
    } as never;
    previousAdapter = replAdapterConfig.adapter;
    replAdapterConfig.adapter = "full-stack-console";
    Object.assign(primary, { output: "", read: 0, server: null, input: null });
  });

  afterEach(async () => {
    primary.server?.close();
    await started;
    replAdapterConfig.adapter = previousAdapter!;
    Trails.application = null;
    Trails.env = previousEnv;
    for (const key of spawnedEnv.splice(0)) setEnv(key, undefined);
    rbModRemoveConst(TopLevel, "ApplicationController");
    vi.restoreAllMocks();
  });

  function addToConfig(config: Record<string, unknown>): void {
    Object.assign((Trails.application as unknown as { config: object }).config, config);
  }

  it("sandbox when sandbox is disabled", async () => {
    addToConfig({ disableSandbox: true });
    const puts = vi.mocked(STDOUT.puts);

    await Console.new(Trails.application as never, new ConsoleCommand([], ["--sandbox"]).options);

    expect(puts.mock.calls.flat().join("\n")).toContain("sandbox mode is disabled");
    expect(vi.mocked(getProcessAdapter().exit).mock.calls[0][0]).toBe(1);
  });

  it("sandbox by default", async () => {
    addToConfig({ sandboxByDefault: true });

    const options = "-e production -- --verbose";
    await spawnConsole(options);

    await writePrompt("Trails.application.sandbox", "true");
  });

  it("sandbox by default with no sandbox", async () => {
    addToConfig({ sandboxByDefault: true });

    const options = "-e production --no-sandbox -- --verbose";
    await spawnConsole(options);

    await writePrompt("Trails.application.sandbox", "false");
  });

  it("sandbox by default with development environment", async () => {
    addToConfig({ sandboxByDefault: true });

    const options = "-- --verbose";
    await spawnConsole(options);

    await writePrompt("Trails.application.sandbox", "false");
  });

  it("prompt is properly set", async () => {
    const options = "-e test -- --verbose";
    await spawnConsole(options);

    await writePrompt("a = 1", "1", { prompt: "app-template(test)>" });
  });

  it("prompt allows changing irb name", async () => {
    const options = "-e test -- --verbose";
    await spawnConsole(options);

    await writePrompt("TSREPL.conf.MAIN_CONTEXT.irbName = 'foo'");
    await writePrompt("a = 1", "1", { prompt: "foo(test)>" });
  });

  it("environment option and irb option", async () => {
    const options = "-e test -- --verbose";
    await spawnConsole(options);

    await writePrompt("a = 1", "1");
    await writePrompt("String(Trails.env)", "'test'");
  });

  it("production console prompt", async () => {
    const options = "-e production";
    await spawnConsole(options);

    await writePrompt("123", null, { prompt: "app-template(prod)>" });
  });

  it("development console prompt", async () => {
    const options = "-e development";
    await spawnConsole(options);

    await writePrompt("123", null, { prompt: "app-template(dev)> " });
  });

  it("test console prompt", async () => {
    const options = "-e test";
    await spawnConsole(options);

    await writePrompt("123", null, { prompt: "app-template(test)> " });
  });

  it("helper helper method", async () => {
    await spawnConsole("-e development");

    await writePrompt(
      "helper().truncate('Once upon a time in a world far far away')",
      "Once upon a time in a world...",
    );
  });

  it("controller helper method", async () => {
    await spawnConsole("-e development");

    await writePrompt("controller().constructor.name", "ApplicationController");
  });

  it("new session helper method", async () => {
    await spawnConsole("-e development");

    await writePrompt("(await newSession()).constructor.name", "Session");
  });

  it("app helper method", async () => {
    await spawnConsole("-e development");

    await writePrompt("(await app()).fooPath()", "/foo");
  });

  it("app routes are loaded", async () => {
    await spawnConsole("-e development");

    await writePrompt("'fooPath' in (await app())", "true");
  });

  it("reload command fires preparation and cleanup callbacks", async () => {
    const options = "-e development";
    await spawnConsole(options);

    await writePrompt("a = b = c = null");
    await writePrompt("ActiveSupport.Reloader.toComplete(() => { a = b = c = 1 })");
    await writePrompt("ActiveSupport.Reloader.toComplete(() => { b = c = 2 })");
    await writePrompt("ActiveSupport.Reloader.toPrepare(() => { c = 3 })");
    await writePrompt("await reloadBang()", "Reloading...\n");
    await writePrompt("a", "1");
    await writePrompt("b", "2");
    await writePrompt("c", "3");
    for (const name of ["a", "b", "c"]) delete (globalThis as Record<string, unknown>)[name];
  });

  it("console respects user defined irb name", async () => {
    const irbrc = `${import.meta.dirname}/irbrc-${Date.now()}.mjs`;
    try {
      await File.writeAsync(
        irbrc,
        `import { TSREPL } from "@blazetrails/ruby-compat";\nTSREPL.conf.TSREPL_NAME = "jarretts-irb";\n`,
      );

      const options = "-e test";
      await spawnConsole(options, { env: { TSREPLRC: irbrc } });

      await writePrompt("123", null, { prompt: "jarretts-irb(test)" });
    } finally {
      await File.deleteAsync(irbrc);
    }
  });

  it("console respects user defined prompt mode", async () => {
    const irbrc = `${import.meta.dirname}/irbrc-${Date.now()}.mjs`;
    try {
      await File.writeAsync(
        irbrc,
        `import { TSREPL } from "@blazetrails/ruby-compat";\nTSREPL.conf.PROMPT_MODE = "SIMPLE";\n`,
      );

      const options = "-e test";
      await spawnConsole(options, { env: { TSREPLRC: irbrc } });

      await writePrompt("123", null, { prompt: ">> " });
    } finally {
      await File.deleteAsync(irbrc);
    }
  });

  it("console disables IRB auto completion in non local", async () => {
    const options = "-e production -- --verbose";
    await spawnConsole(options);

    await writePrompt("TSREPL.conf.USE_AUTOCOMPLETE", "false");
  });

  it("console accepts override on IRB auto completion flag", async () => {
    const options = "-e production -- --verbose";
    await spawnConsole(options, { env: { TSREPL_USE_AUTOCOMPLETE: "true" } });

    await writePrompt("TSREPL.conf.USE_AUTOCOMPLETE", "true");
  });

  it("console doesnt disable IRB auto completion in local", async () => {
    const options = "-e development -- --verbose";
    await spawnConsole(options);

    await writePrompt("TSREPL.conf.USE_AUTOCOMPLETE", "true");
  });
});

class FullStackConsoleTest extends TestCase {}
include(FullStackConsoleTest, Isolation);
registerSpecType(/^FullStackConsoleTest$/, FullStackConsoleTest);

describe("FullStackConsoleTest", { timeout: 300_000 }, () => {
  let t: Generation;
  let callbacks: unknown;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(STDIN, "isTty").mockReturnValue(true);
    vi.spyOn(STDOUT, "puts").mockImplementation((...args) => {
      primary.output += `${args.join("\n")}\n`;
      return null;
    });
    callbacks = (AbstractAdapter as unknown as { __callbacks: unknown }).__callbacks;
    previousEnv = String(Trails.env);
    previousAdapter = replAdapterConfig.adapter;
    replAdapterConfig.adapter = "full-stack-console";
    Object.assign(primary, { output: "", read: 0, server: null, input: null });

    t = new FullStackConsoleTest("test") as unknown as Generation;
    await t.buildApp();
    await t.appFile(
      "app/models/post.ts",
      `
import { Base } from "@blazetrails/activerecord";
export class Post extends Base {}
`,
    );
  });

  afterEach(async () => {
    primary.server?.close();
    await started;
    await ActiveRecord.Base.connectionHandler.clearAllConnectionsBang();
    (AbstractAdapter as unknown as { __callbacks: unknown }).__callbacks = callbacks;
    replAdapterConfig.adapter = previousAdapter!;
    for (const key of spawnedEnv.splice(0)) setEnv(key, undefined);
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
    Trails.env = previousEnv;
    vi.restoreAllMocks();
  });

  async function bootApp(): Promise<void> {
    await t.bootTrails();
    const Post = constGet(TopLevel, "Post") as typeof ActiveRecord.Base;
    await (await Post.leaseConnection()).createTable("posts");
    ActiveRecord.Base.connectionHandler.clearActiveConnectionsBang();
  }

  async function quit(): Promise<void> {
    primary.server!.close();
    await started;
    await ActiveRecord.Base.connectionHandler.clearAllConnectionsBang();
    Object.assign(primary, { output: "", read: 0, server: null, input: null });
  }

  it("sandbox", async () => {
    await bootApp();
    const options = "--sandbox";
    await spawnConsole(options);

    await writePrompt("await Post.count()", "0");
    await writePrompt("await Post.create()");
    await writePrompt("await Post.count()", "1");
    await quit();

    await spawnConsole(options);

    await writePrompt("await Post.count()", "0");
    await writePrompt(
      "await Post.transaction(async () => { await Post.create(); throw new Error(); })",
    );
    await writePrompt("await Post.count()", "0");
    await quit();
  });

  it("reload command reload constants", async () => {
    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  name: unknown = null;
}
`,
    );
    await bootApp();

    const options = "-e development";
    await spawnConsole(options);

    await writePrompt("'age' in new User()", "false");

    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  name: unknown = null;
  age: unknown = null;
}
`,
    );

    await writePrompt("await reloadBang()", "Reloading...\n");
    await writePrompt("'age' in new User()", "true");
  });
});
