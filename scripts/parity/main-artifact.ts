/**
 * The comparison outputs main's CI wrote for a commit, which an only-shrink
 * gate compares the PR's own outputs against (RFC 0127). Nothing is committed:
 * main's `Rails API/Test Comparison` job uploads its outputs as the artifact
 * `parity-outputs-<sha>`, laid out at their repo paths, and a gate on a PR
 * downloads the one for its base, or for the nearest first-parent ancestor
 * that has one. When none does (expired, or the run has not finished), the
 * outputs are recomputed on a detached worktree of the base.
 *
 * The base is the merge commit's first parent under CI (main as the merge ref
 * was built, so a stale branch cannot undo a sibling's convergence) and
 * `origin/main` locally — the shape `parity:lint:counts` uses (trails#9135).
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export type Env = Record<string, string | undefined>;

export function artifactName(sha: string): string {
  return `parity-outputs-${sha}`;
}

/** Runs a command and resolves its trimmed stdout; injectable so tests can fake `git` and `gh`. */
export type Runner = (
  cmd: string,
  args: string[],
  cwd: string,
  env: Env,
  inherit?: boolean,
) => Promise<string>;

export function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: Env,
  inherit = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", inherit ? "inherit" : "pipe", "inherit"],
    });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`\`${cmd} ${args.join(" ")}\` exited with ${signal ?? code}`));
    });
  });
}

export function baseSha(rootDir: string, env: Env, runner: Runner = run): Promise<string> {
  return runner("git", ["rev-parse", env.CI ? "HEAD^1" : "origin/main"], rootDir, env);
}

/** Download main's artifact for `sha` into `dir`; false when there is none. */
export async function downloadArtifact(
  sha: string,
  dir: string,
  rootDir: string,
  env: Env,
  runner: Runner = run,
): Promise<boolean> {
  const name = artifactName(sha);
  let runId: string;
  try {
    runId = await runner(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/actions/artifacts?name=${name}&per_page=100`,
        "--jq",
        "first(.artifacts[] | select(.expired | not) | .workflow_run.id) // empty",
      ],
      rootDir,
      env,
    );
    if (runId === "") return false;
    await runner("gh", ["run", "download", runId, "-n", name, "-D", dir], rootDir, env);
  } catch (e) {
    console.error(`main-artifact: no ${name} (${(e as Error).message})`);
    return false;
  }
  return true;
}

/**
 * Recompute the outputs at `sha` on a detached worktree inside `dir`, sharing
 * this checkout's installed `node_modules` and fetched vendor clones, by running
 * `command` there. The worktree is `dir` itself, so the outputs land at the
 * same repo paths a downloaded artifact has.
 */
export async function recomputeOnWorktree(
  sha: string,
  dir: string,
  command: string[],
  rootDir: string,
  env: Env,
  runner: Runner = run,
): Promise<void> {
  await runner("git", ["worktree", "prune"], rootDir, env);
  await runner("git", ["worktree", "add", "--detach", dir, sha], rootDir, env);
  const shared = ["node_modules"];
  for (const source of await fs.readdir(path.join(rootDir, "vendor"), { withFileTypes: true })) {
    if (!source.isDirectory()) continue;
    for (const version of await fs.readdir(path.join(rootDir, "vendor", source.name))) {
      shared.push(path.join("vendor", source.name, version));
    }
  }
  for (const rel of shared) {
    const target = path.join(dir, rel);
    const exists = await fs.lstat(target).then(
      () => true,
      () => false,
    );
    if (exists) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.symlink(path.join(rootDir, rel), target);
  }
  const [cmd, ...args] = command;
  await runner(cmd, args, dir, env, true);
}

/**
 * How far back main's first-parent history is searched for an artifact. A main
 * commit the `changes` filter judged comparison-neutral skips the comparison
 * job and uploads nothing; its outputs are its parent's, so the nearest
 * ancestor's artifact stands in for it. CI checks out this deep.
 */
export const SEARCH_DEPTH = 30;

/**
 * The directory holding main's outputs for the base commit (or its nearest
 * first-parent ancestor carrying an artifact), at their repo paths, and a
 * `dispose` that removes it. A failed recompute disposes before
 * rethrowing, so no temp dir or registered worktree outlives it.
 */
export async function baseOutputs(
  command: string[],
  rootDir: string,
  env: Env,
  runner: Runner = run,
): Promise<{ sha: string; dir: string; dispose: () => Promise<void> }> {
  const sha = await baseSha(rootDir, env, runner);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parity-base-"));
  let worktree = false;
  const dispose = async (): Promise<void> => {
    if (worktree) {
      await runner("git", ["worktree", "remove", "--force", dir], rootDir, env).catch(() => "");
    }
    await fs.rm(dir, { recursive: true, force: true });
  };
  try {
    const ancestors = (
      await runner(
        "git",
        ["rev-list", "--first-parent", `--max-count=${SEARCH_DEPTH}`, sha],
        rootDir,
        env,
      )
    ).split("\n");
    let found = false;
    for (const ancestor of ancestors) {
      if (ancestor === "") continue;
      if (await downloadArtifact(ancestor, dir, rootDir, env, runner)) {
        if (ancestor !== sha)
          console.log(`main-artifact: ${sha} has no artifact; using ${ancestor}'s.`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`main-artifact: recomputing the outputs for ${sha} on a base worktree…`);
      await fs.rm(dir, { recursive: true, force: true });
      worktree = true;
      await recomputeOnWorktree(sha, dir, command, rootDir, env, runner);
    }
  } catch (e) {
    await dispose();
    throw e;
  }
  return { sha, dir, dispose };
}
