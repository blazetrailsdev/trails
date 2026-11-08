import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { REPLServer } from "node:repl";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, isPlainObject } from "@blazetrails/activesupport";
import {
  Kernel,
  TopLevel,
  autoloadDelete,
  constSet,
  getProcessAdapter,
  rbAutoloadStr,
  rbArgv,
  rbModRemoveConst,
  registerReplAdapter,
  replAdapterConfig,
} from "@blazetrails/ruby-compat";
import { invoke } from "../command.js";
import { Trails } from "../trails.js";
import { Console, ConsoleCommand } from "./console.js";

const io = vi.hoisted(() => ({ server: null as REPLServer | null, output: "", piped: "" }));

const actual = await import("node:repl");
registerReplAdapter("test", {
  start(options) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.on("data", (chunk) => (io.output += String(chunk)));
    io.server = actual.start({ ...options, input, output, terminal: false });
    setImmediate(() => input.write(io.piped));
    return io.server;
  },
});
replAdapterConfig.adapter = "test";

async function evaluate(line: string): Promise<void> {
  const before = io.output.length;
  io.server!.input.emit("data", `${line}\n`);
  await vi.waitFor(() => expect(io.output.length).toBeGreaterThan(before));
}

function startConsole(): Promise<void> {
  vi.spyOn(getProcessAdapter(), "exit").mockImplementation((() => undefined) as never);
  const app = { sandbox: null, config: {}, name: () => "app", loadConsole() {} };
  return Console.start(app);
}

describe("ConsoleCommand (trails)", () => {
  it("starts a --sandbox console, which promises the rollback the AR console block installs", async () => {
    let sandbox: unknown;
    const started = { value: false };
    Trails.application = {
      sandbox: null,
      config: { console: { start: () => (started.value = true) } },
      name: () => "app",
      async loadConsole() {
        sandbox = (this as { sandbox: unknown }).sandbox;
      },
    } as never;
    const command = new ConsoleCommand([], ["--sandbox"]);
    command.bootApplicationBang = async () => {};
    try {
      const printed = await capture(":stdout", () => command.perform());
      expect(printed).toContain("Any modifications you make will be rolled back on exit");
      expect(sandbox).toBe(true);
      expect(started.value).toBe(true);
    } finally {
      Trails.application = null;
    }
  });

  it("offers helper and controller at the prompt", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    class ApplicationController {
      static helpers() {
        return { truncate: (s: string) => `${s.slice(0, 27)}...` };
      }
    }
    constSet(TopLevel, "ApplicationController", ApplicationController);
    const g = globalThis as Record<string, unknown>;
    io.server = null;
    const started = startConsole();
    await vi.waitFor(() => expect(io.server).not.toBeNull());
    try {
      await evaluate(
        `globalThis.consoleHelperText = helper().truncate("Once upon a time in a world far far away")`,
      );
      await evaluate(`globalThis.consoleControllerName = controller().constructor.name`);
      await evaluate(`globalThis.consoleSameController = controller() === controller()`);
      expect(g.consoleHelperText).toBe("Once upon a time in a world...");
      expect(g.consoleControllerName).toBe("ApplicationController");
      expect(g.consoleSameController).toBe(true);
    } finally {
      io.server!.close();
      await started;
      delete g.consoleHelperText;
      delete g.consoleControllerName;
      delete g.consoleSameController;
      rbModRemoveConst(TopLevel, "ApplicationController");
      vi.restoreAllMocks();
    }
  });

  it("leaves only options after -- in ARGV", () => {
    expect(new ConsoleCommand([], ["-s", "--", "x"]).options.sandbox).toBe(true);
    expect(rbArgv()).toEqual(["x"]);
  });

  it("--help reaches Thor's help through Trails::Command.invoke", async () => {
    const printed = await capture(":stdout", () => invoke("console", ["--help"]));
    expect(printed).toContain("--sandbox");
  });

  it("evaluates input in the main realm and keeps bindings across lines", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const globalsBefore = new Set(Reflect.ownKeys(globalThis));
    io.server = null;
    const started = startConsole();
    await vi.waitFor(() => expect(io.server).not.toBeNull());
    const g = globalThis as Record<string, unknown>;
    try {
      await evaluate(`const consoleRealmPost = await Promise.resolve({ title: "x" })`);
      await evaluate(`globalThis.consoleRealmHash = consoleRealmPost`);
      expect(g.consoleRealmHash).toEqual({ title: "x" });
      expect(isPlainObject(g.consoleRealmHash)).toBe(true);
    } finally {
      io.server!.close();
      await started;
      for (const key of Reflect.ownKeys(globalThis)) {
        if (!globalsBefore.has(key)) Reflect.deleteProperty(globalThis, key);
      }
      vi.restoreAllMocks();
    }
  });

  it("loads app/models before the REPL reads piped input", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = await mkdtemp(join(tmpdir(), "trails-console-"));
    await mkdir(join(root, "app", "models"), { recursive: true });
    await writeFile(
      join(root, "app", "models", "console_piped_post.js"),
      `export class ConsolePipedPost { static first() { return Promise.resolve({ title: "Hello" }); } }\n`,
    );
    const prevRequire = Kernel.require;
    Kernel.require = async (feature) => {
      autoloadDelete(Object, "ConsolePipedPost");
      const mod = (await import(feature)) as Record<string, unknown>;
      constSet(TopLevel, "ConsolePipedPost", mod.ConsolePipedPost);
      return true;
    };
    rbAutoloadStr(Object, "ConsolePipedPost", join(root, "app", "models", "console_piped_post.js"));
    io.piped = "globalThis.consolePipedTitle = ConsolePipedPost.first().then((p) => p.title)\n";
    const g = globalThis as Record<string, unknown>;
    io.server = null;
    const started = startConsole();
    try {
      await vi.waitFor(() => expect(io.server).not.toBeNull());
      await vi.waitFor(() => expect(g.consolePipedTitle).toBeDefined());
      expect(await g.consolePipedTitle).toBe("Hello");
    } finally {
      io.piped = "";
      io.server!.close();
      await started;
      delete g.consolePipedTitle;
      Kernel.require = prevRequire;
      autoloadDelete(Object, "ConsolePipedPost");
      rbModRemoveConst(TopLevel, "ConsolePipedPost");
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
});
