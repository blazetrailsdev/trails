import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "start-worktree.sh");

// The script derives MAIN_REPO from its own location (--git-common-dir), not
// from cwd, so it must be run from a copy inside the sandbox repo. Running the
// checked-out copy would operate on the real trails checkout.
let sandboxScript: string;

let sandbox: string;
let mainRepo: string;
let originRepo: string;
let worktreesRoot: string;
let stubBin: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  }).trim();
}

/**
 * Run start-worktree.sh against the sandbox. `pnpm` is stubbed so the test
 * exercises argument handling and the checkout, not a real install: the
 * `--print-paths` call returns nothing, which empties the vendor loop.
 */
function runScript(args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync("bash", [sandboxScript, ...args], {
      cwd: mainRepo,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
        HOME: sandbox,
        WORKTREES_ROOT: worktreesRoot,
        TASKS_WORKTREES_ROOT: path.join(sandbox, "tasks-worktrees"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "start-worktree-"));
  originRepo = path.join(sandbox, "origin.git");
  mainRepo = path.join(sandbox, "trails");
  worktreesRoot = path.join(sandbox, "worktrees");

  // A bare origin with one commit on main, cloned into the "main worktree".
  const seed = path.join(sandbox, "seed");
  fs.mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(seed, "package.json"), "{}\n");
  git(seed, "add", "package.json");
  git(seed, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  git(sandbox, "clone", "-q", "--bare", seed, originRepo);
  git(sandbox, "clone", "-q", originRepo, mainRepo);

  // link_source ".claude/skills" is required — without it the script exits 1.
  fs.mkdirSync(path.join(mainRepo, ".claude", "skills"), { recursive: true });

  fs.mkdirSync(path.join(mainRepo, "scripts"), { recursive: true });
  sandboxScript = path.join(mainRepo, "scripts", "start-worktree.sh");
  fs.copyFileSync(SCRIPT, sandboxScript);

  stubBin = path.join(sandbox, "bin");
  fs.mkdirSync(stubBin);
  fs.writeFileSync(path.join(stubBin, "pnpm"), "#!/usr/bin/env bash\nexit 0\n");
  fs.chmodSync(path.join(stubBin, "pnpm"), 0o755);
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("start-worktree.sh --branch", () => {
  it("checks out an existing local branch instead of cutting a new one", () => {
    const head = git(mainRepo, "rev-parse", "HEAD");
    git(mainRepo, "branch", "fix/package-files-field");

    const { status, output } = runScript(["--branch", "fix/package-files-field"]);
    // Guard the sandbox itself: the script resolves MAIN_REPO from its own
    // path, so a copy left outside the sandbox would silently create branches
    // in the real checkout.
    expect(output).toContain(`Fetching origin/main at ${mainRepo}`);
    expect(output).toContain("existing branch 'fix/package-files-field'");
    expect(status).toBe(0);

    // The slash must flatten into the directory name, not nest a directory.
    const target = path.join(worktreesRoot, "fix-package-files-field");
    expect(fs.existsSync(target)).toBe(true);
    expect(git(target, "rev-parse", "--abbrev-ref", "HEAD")).toBe("fix/package-files-field");
    // The commits are the branch's, not a fresh cut of origin/main.
    expect(git(target, "rev-parse", "HEAD")).toBe(head);
  });

  it("accepts an explicit worktree name alongside the branch", () => {
    git(mainRepo, "branch", "fix/package-files-field");

    const { status } = runScript(["--branch", "fix/package-files-field", "pr-7645"]);
    expect(status).toBe(0);
    expect(fs.existsSync(path.join(worktreesRoot, "pr-7645"))).toBe(true);
  });

  it("checks out a branch that exists only on origin, tracking it", () => {
    // Publish a branch to origin, then drop the local ref so only the
    // remote-tracking one remains — the state after a worktree is reaped.
    git(mainRepo, "branch", "remote-only");
    git(mainRepo, "push", "-q", "origin", "remote-only");
    git(mainRepo, "branch", "-D", "remote-only");

    const { status } = runScript(["--branch", "remote-only"]);
    expect(status).toBe(0);
    const target = path.join(worktreesRoot, "remote-only");
    expect(git(target, "rev-parse", "--abbrev-ref", "HEAD")).toBe("remote-only");
  });

  it("refuses a branch that exists nowhere rather than inventing one", () => {
    const { status, output } = runScript(["--branch", "never-existed"]);
    expect(status).not.toBe(0);
    expect(output).toContain("exists neither locally nor on origin");
    expect(fs.existsSync(path.join(worktreesRoot, "never-existed"))).toBe(false);
  });

  it("keeps the existing branch when setup fails partway", () => {
    git(mainRepo, "branch", "keep-me");
    // A failing `pnpm install` trips the EXIT trap, which must remove the
    // worktree but must NOT delete a branch that carries an open PR's work.
    fs.writeFileSync(path.join(stubBin, "pnpm"), "#!/usr/bin/env bash\nexit 1\n");
    fs.chmodSync(path.join(stubBin, "pnpm"), 0o755);

    const { status, output } = runScript(["--branch", "keep-me"]);
    expect(status).not.toBe(0);
    expect(output).toContain("keeping existing branch keep-me");
    expect(git(mainRepo, "branch", "--list", "keep-me")).toContain("keep-me");
  });

  it("rejects a branch name that could be read as a git flag", () => {
    const { status, output } = runScript(["--branch", "--force"]);
    expect(status).toBe(2);
    expect(output).toContain("Invalid branch name");
  });

  it("still cuts a new branch off origin/main without --branch", () => {
    const { status } = runScript(["brand-new-work"]);
    expect(status).toBe(0);
    const target = path.join(worktreesRoot, "brand-new-work");
    expect(git(target, "rev-parse", "--abbrev-ref", "HEAD")).toBe("brand-new-work");
  });
});
