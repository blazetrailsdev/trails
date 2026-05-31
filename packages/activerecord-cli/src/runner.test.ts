import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "@blazetrails/activerecord";
import { arRunner } from "./runner.js";

const DB_CONFIG = `export default { development: { adapter: "sqlite3", database: ":memory:" } };\n`;
async function scaffoldProject(dir: string) {
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), DB_CONFIG, "utf8");
}

describe("ArRunnerTest", () => {
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

  it("returns 1 when no script path is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-runner-noarg-"));
    const code = await arRunner(dir, []);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("runner requires a script path");
  });

  it("returns 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-runner-noconfig-"));
    const code = await arRunner(dir, ["script.ts"]);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("config/database.ts");
  });

  it("runs a script with Base importable, --flag forwarded, --env after script stripped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-runner-script-"));
    await scaffoldProject(dir);
    await writeFile(
      join(dir, "check.ts"),
      `import { Base } from "@blazetrails/activerecord";\nif (!Base) throw new Error("no Base");\nconst a = (globalThis as any).__ARGV__;\nif (a[0] !== "hello" || a[1] !== "--flag") throw new Error("ARGV mismatch: " + JSON.stringify(a));\nif (a.includes("--env") || a.includes("test")) throw new Error("--env leaked");\n`,
      "utf8",
    );
    const code = await arRunner(dir, ["check.ts", "hello", "--flag", "--env", "test"]);
    expect(code).toBe(0);
  });

  it("returns 1 when the script throws", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-runner-throw-"));
    await scaffoldProject(dir);
    await writeFile(join(dir, "boom.ts"), `throw new Error("intentional");\n`, "utf8");
    const code = await arRunner(dir, ["--env", "test", "boom.ts"]);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("intentional");
  });
});
