import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { HashConfig } from "../database-configurations/hash-config.js";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";

const tasks = new SQLiteDatabaseTasks(
  new HashConfig("development", "primary", { adapter: "sqlite3", database: ":memory:" }),
) as unknown as { runCmd(cmd: string, args: string[], out: string): Promise<void> };
const runCmd = (cmd: string, args: string[], out: string) => tasks.runCmd(cmd, args, out);

describe("SQLiteDatabaseTasks run_cmd output redirect", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  function tmpOutPath(): string {
    const out = path.join(os.tmpdir(), `trails-run-cmd-${process.pid}-${randomUUID()}.out`);
    created.push(out);
    return out;
  }

  it("writes the child's stdout bytes verbatim", async () => {
    const out = tmpOutPath();
    await runCmd("printf", ["\\377\\n"], out);
    expect(Array.from(fs.readFileSync(out))).toEqual([0xff, 0x0a]);
  });

  it("truncates an existing output file", async () => {
    const out = tmpOutPath();
    fs.writeFileSync(out, "stale contents that are longer than the new output");
    await runCmd("printf", ["ok"], out);
    expect(fs.readFileSync(out, "utf8")).toBe("ok");
  });

  it("raises run_cmd_error for a failed command", async () => {
    const out = tmpOutPath();
    await expect(runCmd("sh", ["-c", "exit 3"], out)).rejects.toThrow(
      "failed to execute:\nsh -c exit 3\n\n" +
        "Please check the output above for any errors and make sure that `sh` is installed in your PATH and has proper permissions.\n\n",
    );
  });
});
