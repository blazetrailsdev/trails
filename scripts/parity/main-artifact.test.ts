import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  artifactName,
  baseOutputs,
  baseSha,
  downloadArtifact,
  type Runner,
} from "./main-artifact.js";

let root: string;
let calls: string[][];

function fakeRunner(answers: Record<string, string | Error>): Runner {
  return async (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = Object.keys(answers).find((k) => [cmd, ...args].join(" ").startsWith(k));
    const answer = key === undefined ? "" : answers[key];
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "main-artifact-"));
  await fs.mkdir(path.join(root, "vendor"));
  calls = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("baseSha", () => {
  it("reads the merge commit's first parent under CI", async () => {
    await baseSha(root, { CI: "true" }, fakeRunner({}));
    expect(calls).toEqual([["git", "rev-parse", "HEAD^1"]]);
  });

  it("reads origin/main locally", async () => {
    await baseSha(root, {}, fakeRunner({}));
    expect(calls).toEqual([["git", "rev-parse", "origin/main"]]);
  });
});

describe("downloadArtifact", () => {
  it("downloads the first live artifact's run", async () => {
    const runner = fakeRunner({ "gh api": "42" });
    expect(await downloadArtifact("abc", root, root, {}, runner)).toBe(true);
    expect(calls[1]).toEqual([
      "gh",
      "run",
      "download",
      "42",
      "-n",
      artifactName("abc"),
      "-D",
      root,
    ]);
  });

  it("answers false when no live artifact exists", async () => {
    expect(await downloadArtifact("abc", root, root, {}, fakeRunner({ "gh api": "" }))).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("answers false when gh fails", async () => {
    const runner = fakeRunner({ "gh api": new Error("no auth") });
    expect(await downloadArtifact("abc", root, root, {}, runner)).toBe(false);
  });
});

describe("baseOutputs", () => {
  it("uses the downloaded artifact without a worktree", async () => {
    const runner = fakeRunner({ "git rev-parse": "abc", "git rev-list": "abc", "gh api": "42" });
    const base = await baseOutputs(["pnpm", "x"], root, { CI: "1" }, runner);
    expect(base.sha).toBe("abc");
    expect(calls.some((c) => c[1] === "worktree")).toBe(false);
    await base.dispose();
    await expect(fs.stat(base.dir)).rejects.toThrow();
  });

  it("falls back to the nearest ancestor's artifact", async () => {
    let n = 0;
    const runner: Runner = async (cmd, args, cwd, env, inherit) => {
      if (cmd === "git" && args[0] === "rev-list") return "abc\ndef";
      if (cmd === "gh" && args[0] === "api") return ++n === 2 ? "7" : "";
      return fakeRunner({ "git rev-parse": "abc" })(cmd, args, cwd, env, inherit);
    };
    const base = await baseOutputs(["pnpm", "x"], root, {}, runner);
    expect(calls).toContainEqual([
      "gh",
      "run",
      "download",
      "7",
      "-n",
      artifactName("def"),
      "-D",
      base.dir,
    ]);
    await base.dispose();
  });

  it("recomputes on a base worktree when no artifact exists", async () => {
    const runner = fakeRunner({ "git rev-parse": "abc", "gh api": "" });
    const base = await baseOutputs(["pnpm", "x"], root, {}, runner);
    expect(calls).toContainEqual(["git", "worktree", "add", "--detach", base.dir, "abc"]);
    expect(calls).toContainEqual(["pnpm", "x"]);
    await base.dispose();
    expect(calls).toContainEqual(["git", "worktree", "remove", "--force", base.dir]);
  });

  it("removes the worktree when the recompute fails", async () => {
    const runner = fakeRunner({ "git rev-parse": "abc", "gh api": "", pnpm: new Error("boom") });
    await expect(baseOutputs(["pnpm", "x"], root, {}, runner)).rejects.toThrow("boom");
    expect(calls.at(-1)?.slice(0, 3)).toEqual(["git", "worktree", "remove"]);
  });
});
