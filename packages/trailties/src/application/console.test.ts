import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { REPLServer } from "node:repl";
import { RouteSet } from "@blazetrails/actionpack";
import {
  TopLevel,
  constSet,
  rbModRemoveConst,
  registerReplAdapter,
  replAdapterConfig,
} from "@blazetrails/ruby-compat";
import { Console } from "../commands/console.js";
import { Trails } from "../trails.js";

const io = vi.hoisted(() => ({ server: null as REPLServer | null, output: "" }));

const actual = await import("node:repl");
registerReplAdapter("full-stack-console", {
  start(options) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.on("data", (chunk) => (io.output += String(chunk)));
    io.server = actual.start({ ...options, input, output, terminal: false });
    return io.server;
  },
});

const g = globalThis as Record<string, unknown>;

async function writePrompt(command: string): Promise<unknown> {
  const before = io.output.length;
  io.server!.input.emit("data", `globalThis.consolePromptResult = await (${command})\n`);
  await vi.waitFor(() => expect(io.output.slice(before)).toContain("> "));
  return g.consolePromptResult;
}

describe("FullStackConsoleTest", () => {
  let started: Promise<void>;
  let previousAdapter: string | undefined;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
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
    Trails.application = {
      sandbox: null,
      config: {},
      name: () => "app",
      loadConsole: async () => {},
      reloadRoutesUnlessLoaded: async () => true,
      routes: () => routes,
    } as never;
    previousAdapter = replAdapterConfig.adapter;
    replAdapterConfig.adapter = "full-stack-console";
    io.server = null;
    started = Console.start(Trails.application, { environment: "development" });
    await vi.waitFor(() => expect(io.server).not.toBeNull());
  });

  afterEach(async () => {
    io.server!.close();
    await started;
    replAdapterConfig.adapter = previousAdapter!;
    Trails.application = null;
    rbModRemoveConst(TopLevel, "ApplicationController");
    delete g.consolePromptResult;
    vi.restoreAllMocks();
  });

  it("helper helper method", async () => {
    expect(await writePrompt(`helper().truncate('Once upon a time in a world far far away')`)).toBe(
      "Once upon a time in a world...",
    );
  });

  it("controller helper method", async () => {
    expect(await writePrompt(`controller().constructor.name`)).toBe("ApplicationController");
  });

  it("new session helper method", async () => {
    expect(await writePrompt(`newSession().then((s) => s.constructor.name)`)).toBe("Session");
  });
});
