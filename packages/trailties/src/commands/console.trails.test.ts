import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { REPLServer } from "node:repl";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, isPlainObject } from "@blazetrails/activesupport";
import { Dir, registerReplAdapter, replAdapterConfig } from "@blazetrails/ruby-compat";
import { invoke } from "../command.js";
import { Console } from "./console.js";

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
  await vi.waitFor(() => expect(io.output.slice(before)).toContain("> "));
}

function startConsole(): Promise<void> {
  const app = { sandbox: null, config: {}, name: () => "app", loadConsole() {} };
  return Console.start(app);
}

describe("ConsoleCommand (trails)", () => {
  it("--help reaches Thor's help through Rails::Command.invoke", async () => {
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
    vi.spyOn(Dir, "pwd").mockReturnValue(root);
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
      delete g.ConsolePipedPost;
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
});
