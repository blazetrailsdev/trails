import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { REPLServer, ReplOptions } from "node:repl";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPlainObject } from "@blazetrails/activesupport";
import { Dir } from "@blazetrails/ruby-compat";
import { createProgram } from "../cli.js";

const io = vi.hoisted(() => ({ server: null as REPLServer | null, output: "", piped: "" }));

vi.mock("node:repl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:repl")>();
  const start = (options: ReplOptions) => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.on("data", (chunk) => (io.output += String(chunk)));
    io.server = actual.start({ ...options, input, output, terminal: false });
    setImmediate(() => input.write(io.piped));
    return io.server;
  };
  return { ...actual, default: { ...actual, start }, start };
});

async function evaluate(line: string): Promise<void> {
  const before = io.output.length;
  io.server!.input.emit("data", `${line}\n`);
  await vi.waitFor(() => expect(io.output.slice(before)).toContain("trails> "));
}

describe("ConsoleCommand (trails)", () => {
  it("evaluates input in the main realm and keeps bindings across lines", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const globalsBefore = new Set(Reflect.ownKeys(globalThis));
    await createProgram().parseAsync(["node", "trails", "console"]);
    const g = globalThis as Record<string, unknown>;
    try {
      await evaluate(`const consoleRealmPost = await Promise.resolve({ title: "x" })`);
      await evaluate(`globalThis.consoleRealmHash = consoleRealmPost`);
      expect(g.consoleRealmHash).toEqual({ title: "x" });
      expect(isPlainObject(g.consoleRealmHash)).toBe(true);
    } finally {
      io.server!.close();
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
    try {
      await createProgram().parseAsync(["node", "trails", "console"]);
      await vi.waitFor(() => expect(g.consolePipedTitle).toBeDefined());
      expect(await g.consolePipedTitle).toBe("Hello");
    } finally {
      io.piped = "";
      io.server!.close();
      delete g.consolePipedTitle;
      delete g.ConsolePipedPost;
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
});
