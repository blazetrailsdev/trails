/**
 * The comparison outputs main's CI wrote for a commit, which an only-shrink
 * gate compares the PR's own outputs against (RFC 0127). Nothing is committed:
 * main's `Rails API/Test Comparison` job uploads its outputs as the artifact
 * `parity-outputs-<sha>`, laid out at their repo paths, and a gate on a PR
 * downloads the one for its base. When main has no artifact for that commit
 * (expired, or the run has not finished), the outputs are recomputed on a
 * detached worktree of the base.
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

function run(cmd: string, args: string[], cwd: string, env: Env, inherit = false): Promise<string> {
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

export function baseSha(rootDir: string, env: Env): Promise<string> {
  return run("git", ["rev-parse", env.CI ? "HEAD^1" : "origin/main"], rootDir, env);
}

/** Download main's artifact for `sha` into `dir`; false when there is none. */
export async function downloadArtifact(
  sha: string,
  dir: string,
  rootDir: string,
  env: Env,
): Promise<boolean> {
  const name = artifactName(sha);
  let runId: string;
  try {
    runId = await run(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/actions/artifacts?name=${name}&per_page=1`,
        "--jq",
        ".artifacts[] | select(.expired | not) | .workflow_run.id",
      ],
      rootDir,
      env,
    );
    if (runId === "") return false;
    await run("gh", ["run", "download", runId.split("\n")[0], "-n", name, "-D", dir], rootDir, env);
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
): Promise<void> {
  await run("git", ["worktree", "add", "--detach", dir, sha], rootDir, env);
  const shared = ["node_modules"];
  for (const source of await fs.readdir(path.join(rootDir, "vendor"), { withFileTypes: true })) {
    if (!source.isDirectory()) continue;
    for (const version of await fs.readdir(path.join(rootDir, "vendor", source.name))) {
      shared.push(path.join("vendor", source.name, version));
    }
  }
  for (const rel of shared) {
    const target = path.join(dir, rel);
    if (
      await fs.stat(target).then(
        () => true,
        () => false,
      )
    )
      continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.symlink(path.join(rootDir, rel), target);
  }
  const [cmd, ...args] = command;
  await run(cmd, args, dir, env, true);
}

/**
 * The directory holding main's outputs for the base commit, at their repo
 * paths, and a `dispose` that removes it.
 */
export async function baseOutputs(
  command: string[],
  rootDir: string,
  env: Env,
): Promise<{ sha: string; dir: string; dispose: () => Promise<void> }> {
  const sha = await baseSha(rootDir, env);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parity-base-"));
  let worktree = false;
  if (!(await downloadArtifact(sha, dir, rootDir, env))) {
    console.log(`main-artifact: recomputing the outputs for ${sha} on a base worktree…`);
    await fs.rm(dir, { recursive: true, force: true });
    worktree = true;
    await recomputeOnWorktree(sha, dir, command, rootDir, env);
  }
  const dispose = async (): Promise<void> => {
    if (worktree) await run("git", ["worktree", "remove", "--force", dir], rootDir, env);
    await fs.rm(dir, { recursive: true, force: true });
  };
  return { sha, dir, dispose };
}
