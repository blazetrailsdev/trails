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
import { Console, ConsoleCommand } from "../commands/console.js";
import { Trails } from "../trails.js";

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

async function spawnConsole(options: string, { waitForPrompt = true } = {}): Promise<void> {
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
  let previousAdapter: string | undefined;

  beforeEach(() => {
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
    Object.assign(primary, { output: "", read: 0, server: null, input: null });
  });

  afterEach(async () => {
    primary.server?.close();
    await started;
    replAdapterConfig.adapter = previousAdapter!;
    Trails.application = null;
    rbModRemoveConst(TopLevel, "ApplicationController");
    vi.restoreAllMocks();
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
});
