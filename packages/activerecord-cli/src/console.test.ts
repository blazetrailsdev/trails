import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Base, DatabaseTasks } from "@blazetrails/activerecord";
import { arConsole } from "./console.js";

function makeReplStub() {
  const server = {
    context: {} as Record<string, unknown>,
    on(event: string, cb: () => void) {
      if (event === "exit") setImmediate(cb);
      return server;
    },
  };
  return server;
}

const DB_CONFIG = `export default { development: { adapter: "sqlite3", database: ":memory:" }, test: { adapter: "sqlite3", database: ":memory:" } };\n`;
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
    Base.configurations({});
  });

  it("launches REPL, puts Base in context, resolves 0 on exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-"));
    await scaffoldProject(dir);
    const stub = makeReplStub();
    const code = await arConsole(dir, ["--env", "test"], { startRepl: () => stub });
    expect(code).toBe(0);
    expect(stub.context["Base"]).toBeDefined();
  });

  it("loads models into REPL context when .trails/models/index.ts is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-models-"));
    await scaffoldProject(dir);
    await mkdir(join(dir, ".trails", "models"), { recursive: true });
    await writeFile(
      join(dir, ".trails", "models", "index.ts"),
      `export const Sentinel = "sentinel-value";\n`,
      "utf8",
    );
    const stub = makeReplStub();
    await arConsole(dir, ["--env", "test"], { startRepl: () => stub });
    expect(stub.context["Sentinel"]).toBe("sentinel-value");
  });

  it("regenerates the gitignored manifest from app/models before loading it", async () => {
    const dir = await mkdtemp(join(import.meta.dirname, "..", ".tmp-console-"));
    try {
      await scaffoldProject(dir);
      await mkdir(join(dir, "app", "models"), { recursive: true });
      await writeFile(
        join(dir, "app", "models", "widget.ts"),
        `import { Base } from "@blazetrails/activerecord";\nexport class Widget extends Base {}\n`,
        "utf8",
      );
      const stub = makeReplStub();
      expect(await arConsole(dir, ["--env", "test"], { startRepl: () => stub })).toBe(0);
      expect(stub.context["Widget"]).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-noconfig-"));
    const code = await arConsole(dir, []);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("config/database.ts");
  });

  it("returns 1 when no database configuration found for environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-console-emptyenv-"));
    await mkdir(join(dir, "config"), { recursive: true });
    await writeFile(
      join(dir, "config", "database.ts"),
      `export default { development: { adapter: "sqlite3", database: ":memory:" } };\n`,
      "utf8",
    );
    const code = await arConsole(dir, ["--env", "production"], { startRepl: () => makeReplStub() });
    expect(code).toBe(1);
    expect(err.join("\n")).toContain(
      'no database configuration found for environment "production"',
    );
  });
});
