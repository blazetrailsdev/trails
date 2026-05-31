import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "@blazetrails/activerecord";
import { arConsole } from "./console.js";

function makeReplStub() {
  const server = {
    context: {} as Record<string, unknown>,
    on(event: string, cb: () => void) {
      // Fire the exit handler immediately so arConsole resolves in tests.
      if (event === "exit") setImmediate(cb);
      return server;
    },
  };
  return server;
}

const DB_CONFIG = `export default { development: { adapter: "sqlite3", database: ":memory:" } };\n`;
async function scaffoldProject(dir: string) {
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), DB_CONFIG, "utf8");
}

describe("ArConsoleTest", () => {
  let err: string[];

  beforeEach(() => {
    err = [];
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["TRAILS_ENV"];
    DatabaseTasks.databaseConfiguration = null;
  });

  it("launches REPL, puts Base in context, resolves 0 on exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-"));
    await scaffoldProject(dir);
    const stub = makeReplStub();
    const code = await arConsole(dir, ["--env", "test"], { startRepl: () => stub });
    expect(code).toBe(0);
    expect(stub.context["Base"]).toBeDefined();
  });

  it("loads models into REPL context when app/models/index.ts is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-models-"));
    await scaffoldProject(dir);
    await mkdir(join(dir, "app", "models"), { recursive: true });
    await writeFile(
      join(dir, "app", "models", "index.ts"),
      `export const Sentinel = "sentinel-value";\n`,
      "utf8",
    );
    const stub = makeReplStub();
    await arConsole(dir, ["--env", "test"], { startRepl: () => stub });
    expect(stub.context["Sentinel"]).toBe("sentinel-value");
  });

  it("returns 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-noconfig-"));
    const code = await arConsole(dir, []);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("config/database.ts");
  });
});
