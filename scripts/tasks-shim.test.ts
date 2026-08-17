import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIM = join(REPO_ROOT, "scripts", "tasks", "tasks.sh");

const scratch: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

// Stands in for a tasks checkout's bin/tasks, recording what the shim handed it.
function recordingCheckout(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, "handoff.txt");
  writeFileSync(
    join(bin, "tasks"),
    "#!/usr/bin/env bash\n" +
      `printf 'TASKS_DIR=[%s]\\nRFCS_DIR=[%s]\\nargs=[%s]\\n' ` +
      `"\${TASKS_DIR-<unset>}" "\${RFCS_DIR-<unset>}" "$*" > ${JSON.stringify(log)}\n`,
  );
  chmodSync(join(bin, "tasks"), 0o755);
  return log;
}

function runShim(args: string[], cwd: string, env: Record<string, string | undefined> = {}) {
  return spawnSync(SHIM, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TASKS_DIR: undefined, RFCS_DIR: undefined, ...env },
  });
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pnpm tasks shim", () => {
  it("is the package.json tasks script and is executable", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.tasks).toBe("scripts/tasks/tasks.sh");
    expect(() => accessSync(SHIM, constants.X_OK)).not.toThrow();
  });

  it("delegates to bin/tasks in the cwd's tasks checkout, forwarding arguments", () => {
    const cwd = tempDir("tasks-shim-");
    const log = recordingCheckout(join(cwd, "tasks"));

    const run = runShim(["claim", "some-story", "--pr", "1"], cwd);

    expect(run.status).toBe(0);
    expect(readFileSync(log, "utf8")).toContain("args=[claim some-story --pr 1]");
  });

  it("leaves TASKS_DIR and RFCS_DIR unset so the CLI resolves the working tree from cwd", () => {
    const cwd = tempDir("tasks-shim-");
    const log = recordingCheckout(join(cwd, "tasks"));

    expect(runShim(["ready"], cwd).status).toBe(0);

    const handoff = readFileSync(log, "utf8");
    expect(handoff).toContain("TASKS_DIR=[<unset>]");
    expect(handoff).toContain("RFCS_DIR=[<unset>]");
  });

  it("prefers an explicit TASKS_DIR over the cwd's tasks checkout", () => {
    const cwd = tempDir("tasks-shim-");
    const localLog = recordingCheckout(join(cwd, "tasks"));
    const explicit = tempDir("tasks-shim-explicit-");
    const explicitLog = recordingCheckout(explicit);

    expect(runShim(["ready"], cwd, { TASKS_DIR: explicit }).status).toBe(0);

    expect(readFileSync(explicitLog, "utf8")).toContain("args=[ready]");
    expect(() => readFileSync(localLog, "utf8")).toThrow();
  });

  it("fails loudly when no reachable checkout carries bin/tasks", () => {
    const cwd = tempDir("tasks-shim-empty-");

    const run = runShim(["ready"], cwd, { HOME: cwd });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no tasks checkout with bin/tasks found");
  });
});
