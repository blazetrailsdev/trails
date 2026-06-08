import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// commitAndPush() shells out to git via execFileSync. Mock the whole
// child_process module so the retry/success/failure paths are testable
// without a real git repo. Pure tests in this file don't call
// execFileSync, so the mock is inert for them. Use vi.hoisted so the
// mock fn is available inside vi.mock's hoisted factory.
const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn<(file: string, args: string[]) => string>(),
}));
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

afterEach(() => {
  execFileSyncMock.mockReset();
  vi.restoreAllMocks();
});

import {
  bestBundle,
  buildStoryContent,
  checkPrNotOpen,
  claimState,
  commitAndPush,
  editFrontmatter,
  Index,
  listFiltered,
  newStory,
  nextBundle,
  numberFlag,
  parseFlags,
  ready,
  removeFrontmatterKey,
  stringFlag,
  StoryEntry,
} from "./cli.ts";

function story(over: Partial<StoryEntry>): StoryEntry {
  return {
    id: "x",
    rfc: "0001-r",
    title: null,
    status: "ready",
    cluster: "c1",
    deps: [],
    deps_rfc: [],
    est_loc: 100,
    updated: null,
    pr: null,
    priority: null,
    claim: null,
    assignee: null,
    blocked_by: null,
    file_path: "0001-r/stories/x.md",
    ...over,
  };
}

function index(stories: StoryEntry[]): Index {
  return {
    generated_at: "now",
    rfcs: [
      {
        id: "0001-r",
        title: "R",
        status: "active",
        owner: "@x",
        packages: [],
        clusters: ["c1", "c2"],
        file_path: "0001-r/README.md",
      },
      {
        id: "0002-r",
        title: "R2",
        status: "closed",
        owner: "@x",
        packages: [],
        clusters: ["c3"],
        file_path: "0002-r/README.md",
      },
    ],
    stories,
  };
}

describe("ready", () => {
  it("filters out non-ready, unmet story deps, and unmet rfc deps", () => {
    const idx = index([
      story({ id: "a", status: "ready" }),
      story({ id: "b", status: "draft" }),
      story({ id: "c", status: "ready", deps: ["b"] }),
      story({ id: "d", status: "ready", deps_rfc: ["0001-r"] }), // 0001-r is active, not closed
      story({ id: "e", status: "ready", deps_rfc: ["0002-r"] }), // 0002-r is closed → ok
    ]);
    expect(
      ready(idx)
        .map((s) => s.id)
        .sort(),
    ).toEqual(["a", "e"]);
  });

  it("honors --rfc filter", () => {
    const idx = index([
      story({ id: "a", rfc: "0001-r" }),
      story({ id: "b", rfc: "0002-r", cluster: "c3" }),
    ]);
    expect(ready(idx, { rfc: "0001-r" }).map((s) => s.id)).toEqual(["a"]);
  });
});

describe("bestBundle (0/1 knapsack)", () => {
  it("picks the optimal subset, not just the greedy largest-first", () => {
    const items = [
      story({ id: "big", est_loc: 200 }),
      story({ id: "a", est_loc: 100 }),
      story({ id: "b", est_loc: 80 }),
      story({ id: "c", est_loc: 70 }),
    ];
    // Greedy desc would pick [200]; optimum is [100,80,70] = 250.
    const result = bestBundle(items, 250)
      .map((s) => s.id)
      .sort();
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("returns [] for empty input or zero budget", () => {
    expect(bestBundle([], 100)).toEqual([]);
    expect(bestBundle([story({ id: "x", est_loc: 50 })], 0)).toEqual([]);
  });
});

describe("nextBundle", () => {
  it("picks the best-filling cluster", () => {
    const idx = index([
      story({ id: "a1", cluster: "c1", est_loc: 100 }),
      story({ id: "a2", cluster: "c1", est_loc: 100 }),
      story({ id: "b1", cluster: "c2", est_loc: 240 }),
    ]);
    const bundle = nextBundle(idx, { maxLoc: 250 });
    // c1 bundles 200, c2 bundles 240 → c2 wins
    expect(bundle.map((s) => s.id)).toEqual(["b1"]);
  });

  it("excludes stories with null est_loc", () => {
    const idx = index([story({ id: "a", est_loc: null }), story({ id: "b", est_loc: 50 })]);
    expect(nextBundle(idx, { maxLoc: 250 }).map((s) => s.id)).toEqual(["b"]);
  });

  it("never mixes a real cluster named '_none' with unclustered stories", () => {
    // A story with cluster: null must stay separate from a story whose
    // cluster literally equals "_none" — bundles are same-cluster only.
    // Patch the parent RFC's clusters so the literal "_none" passes validation.
    const idx = index([
      story({ id: "u", cluster: null, est_loc: 100 }),
      story({ id: "n", cluster: "_none", est_loc: 100 }),
    ]);
    const bundle = nextBundle(idx, { maxLoc: 250 });
    // Both clusters tie at 100; either may win, but never both together.
    expect(bundle.length).toBe(1);
  });
});

describe("listFiltered", () => {
  it("composes rfc + status + cluster filters", () => {
    const idx = index([
      story({ id: "a", rfc: "0001-r", status: "draft", cluster: "c1" }),
      story({ id: "b", rfc: "0001-r", status: "ready", cluster: "c1" }),
      story({ id: "c", rfc: "0001-r", status: "ready", cluster: "c2" }),
    ]);
    const rows = listFiltered(idx, { rfc: "0001-r", status: "ready", cluster: "c2" });
    expect(rows.map((s) => s.id)).toEqual(["c"]);
  });
});

describe("editFrontmatter", () => {
  function writeStory(body: string): string {
    const dir = mkdtempSync(join(tmpdir(), "rfcs-cli-"));
    const file = join(dir, "story.md");
    writeFileSync(file, body);
    return file;
  }

  it("updates an existing scalar key in place", () => {
    const file = writeStory(`---\nstatus: ready\nclaim: null\n---\nbody\n`);
    editFrontmatter(file, { status: "claimed", claim: `"2026-01-01T00:00:00Z"` });
    const out = readFileSync(file, "utf8");
    expect(out).toContain(`status: claimed`);
    expect(out).toContain(`claim: "2026-01-01T00:00:00Z"`);
    expect(out).toContain(`body`);
  });

  it("appends a key that is not yet present (e.g. first-time priority)", () => {
    const file = writeStory(`---\nstatus: ready\n---\nbody\n`);
    editFrontmatter(file, { priority: "3" });
    expect(readFileSync(file, "utf8")).toContain(`priority: 3`);
  });

  it("refuses to edit a list-valued key", () => {
    const file = writeStory(`---\ndeps:\n  - a\n  - b\nstatus: ready\n---\nbody\n`);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => editFrontmatter(file, { deps: "[a, b, c]" })).toThrow(/exit 1/);
    expect(errSpy.mock.calls[0]?.[0]).toMatch(/refusing to edit list-valued/);
    // afterEach restores all mocks; no manual restore needed.
  });
});

describe("claimState (idempotent re-claim discriminator)", () => {
  it("reports an unclaimed story as available", () => {
    expect(claimState(`---\nstatus: ready\nclaim: null\nassignee: null\n---\n`, "dean")).toBe(
      "available",
    );
  });

  it("treats a re-claim by the same assignee as owned (idempotent)", () => {
    const fm = `---\nstatus: claimed\nclaim: "2026-01-01T00:00:00Z"\nassignee: "dean"\n---\n`;
    expect(claimState(fm, "dean")).toBe("owned");
  });

  it("treats a claim held by someone else as taken (a real race)", () => {
    const fm = `---\nstatus: claimed\nclaim: "2026-01-01T00:00:00Z"\nassignee: "alice"\n---\n`;
    expect(claimState(fm, "dean")).toBe("taken");
  });

  it("matches an assignee value that contains spaces", () => {
    const fm = `---\nclaim: "2026-01-01T00:00:00Z"\nassignee: "Dean Marano"\n---\n`;
    expect(claimState(fm, "Dean Marano")).toBe("owned");
  });

  it("falls back to taken when a claimed story has no assignee line", () => {
    expect(claimState(`---\nstatus: claimed\nclaim: "2026-01-01T00:00:00Z"\n---\n`, "dean")).toBe(
      "taken",
    );
  });

  it("ignores a `claim: null` line in the Markdown body", () => {
    const fm =
      `---\nstatus: claimed\nclaim: "2026-01-01T00:00:00Z"\nassignee: "alice"\n---\n` +
      `Reset with \`claim: null\` if needed.\n`;
    expect(claimState(fm, "dean")).toBe("taken");
  });

  it("ignores an `assignee:` line in the Markdown body", () => {
    const fm =
      `---\nstatus: claimed\nclaim: "2026-01-01T00:00:00Z"\nassignee: "alice"\n---\n` +
      `assignee: "dean"\n`;
    expect(claimState(fm, "dean")).toBe("taken");
  });
});

describe("removeFrontmatterKey (priority --clear)", () => {
  function writeStory(body: string): string {
    const dir = mkdtempSync(join(tmpdir(), "rfcs-cli-"));
    const file = join(dir, "story.md");
    writeFileSync(file, body);
    return file;
  }

  it("deletes a scalar key, leaving the rest of the frontmatter intact", () => {
    const file = writeStory(`---\nstatus: ready\npriority: 3\nest_loc: 80\n---\nbody\n`);
    removeFrontmatterKey(file, "priority");
    const out = readFileSync(file, "utf8");
    expect(out).not.toContain("priority");
    expect(out).toContain("status: ready");
    expect(out).toContain("est_loc: 80");
    expect(out).toContain("body");
  });

  it("is a no-op when the key is already absent", () => {
    const body = `---\nstatus: ready\n---\nbody\n`;
    const file = writeStory(body);
    removeFrontmatterKey(file, "priority");
    expect(readFileSync(file, "utf8")).toBe(body);
  });

  it("refuses to remove a list-valued key", () => {
    const file = writeStory(`---\ndeps:\n  - a\n  - b\nstatus: ready\n---\nbody\n`);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => removeFrontmatterKey(file, "deps")).toThrow(/exit 1/);
    expect(errSpy.mock.calls[0]?.[0]).toMatch(/refusing to remove list-valued/);
  });
});

describe("parseFlags", () => {
  it("parses --key value, --bool, and positional args", () => {
    const { flags, rest } = parseFlags(["foo", "--rfc", "0001-x", "--json", "bar"]);
    expect(flags).toEqual({ rfc: "0001-x", json: true });
    expect(rest).toEqual(["foo", "bar"]);
  });

  it("treats the next token as boolean when it starts with --", () => {
    const { flags } = parseFlags(["--json", "--rfc", "0001-x"]);
    expect(flags).toEqual({ json: true, rfc: "0001-x" });
  });
});

describe("numberFlag / stringFlag (value-flag validation)", () => {
  it("numberFlag returns null when value-flag was parsed as bare boolean", () => {
    // `--pr` with no following value becomes `pr: true`; Number(true) === 1.
    // numberFlag must reject this so callers don't silently dispatch as PR #1.
    expect(numberFlag({ pr: true }, "pr")).toBeNull();
    expect(numberFlag({}, "pr")).toBeNull();
    expect(numberFlag({ pr: "abc" }, "pr")).toBeNull();
    expect(numberFlag({ pr: "2552" }, "pr")).toBe(2552);
  });

  it("stringFlag returns undefined for bare boolean or missing", () => {
    expect(stringFlag({ reason: true }, "reason")).toBeUndefined();
    expect(stringFlag({}, "reason")).toBeUndefined();
    expect(stringFlag({ reason: "broken" }, "reason")).toBe("broken");
  });
});

describe("commitAndPush (git mutation flow)", () => {
  function setup() {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    execFileSyncMock.mockImplementation((_file, args) => {
      const sub = (args ?? []).find((a) => !a.startsWith("-") && a !== "git") ?? "";
      // Use the first non-flag token after `-C <dir>` to label the call.
      const label = args && args.length >= 3 ? args[2] : sub;
      // The branch guard probes the current branch; the canonical checkout is on
      // main. Answer without recording so the seen[] flow assertions are unaffected.
      if (label === "symbolic-ref") return "main" as never;
      seen.push(label);
      return "" as never;
    });
    return { exit, seen };
  }

  it("happy path: pull → add → commit → push, no retry", () => {
    const { seen } = setup();
    let mutatorCalls = 0;
    commitAndPush({
      message: "test",
      fileToStage: "/some/file.md",
      mutator: () => mutatorCalls++,
      raceMessage: "shouldn't be reached",
      raceExitCode: 99,
    });
    expect(mutatorCalls).toBe(1);
    // One leading `checkout` per generated file restores loadIndex()'s
    // regenerated artifacts so the pull --rebase runs against a clean tree.
    expect(seen).toEqual(["checkout", "checkout", "checkout", "pull", "add", "commit", "push"]);
  });

  // Mimic execFileSync's failure shape: attach .stderr to the error so
  // commitAndPush's race-vs-real-failure discriminator can inspect it.
  function pushError(stderr: string): Error {
    const e = new Error("Command failed") as Error & { stderr?: string };
    e.stderr = stderr;
    return e;
  }

  it("retries once on push failure, succeeds on second attempt", () => {
    const { seen } = setup();
    let push = 0;
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      if (label === "symbolic-ref") return "main" as never;
      seen.push(label);
      if (label === "push" && push++ === 0) {
        throw pushError("! [rejected]        main -> main (non-fast-forward)");
      }
      return "" as never;
    });
    let mutatorCalls = 0;
    commitAndPush({
      message: "test",
      fileToStage: "/some/file.md",
      mutator: () => mutatorCalls++,
      raceMessage: "no",
      raceExitCode: 99,
    });
    expect(mutatorCalls).toBe(2);
    // Pre-loop: one checkout per generated file restores them.
    // First attempt: pull, add, commit, push(throws), reset.
    // Second attempt: pull, add, commit, push(ok).
    expect(seen).toEqual([
      "checkout",
      "checkout",
      "checkout",
      "pull",
      "add",
      "commit",
      "push",
      "reset",
      "pull",
      "add",
      "commit",
      "push",
    ]);
  });

  it("exits with raceExitCode after two consecutive push failures", () => {
    const { seen, exit } = setup();
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      if (label === "symbolic-ref") return "main" as never;
      seen.push(label);
      if (label === "push") throw pushError("! [rejected] non-fast-forward");
      return "" as never;
    });
    expect(() =>
      commitAndPush({
        message: "test",
        fileToStage: "/some/file.md",
        mutator: () => {},
        raceMessage: "lost race",
        raceExitCode: 3,
      }),
    ).toThrow(/exit 3/);
    expect(exit).toHaveBeenCalledWith(3);
    // Two attempts, each: pull, add, commit, push(throws), reset.
    expect(seen.filter((l) => l === "push").length).toBe(2);
    expect(seen.filter((l) => l === "reset").length).toBe(2);
  });

  it("surfaces non-race push failures verbatim and exits 1 (no reset, no retry)", () => {
    const { seen, exit } = setup();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      if (label === "symbolic-ref") return "main" as never;
      seen.push(label);
      if (label === "push") {
        throw pushError("fatal: Authentication failed for 'https://...'");
      }
      return "" as never;
    });
    expect(() =>
      commitAndPush({
        message: "test",
        fileToStage: "/some/file.md",
        mutator: () => {},
        raceMessage: "should not be reached",
        raceExitCode: 3,
      }),
    ).toThrow(/exit 1/);
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen.filter((l) => l === "push").length).toBe(1);
    expect(seen.filter((l) => l === "reset").length).toBe(0);
    expect(errSpy.mock.calls.at(-1)?.[0]).toMatch(/Authentication failed/);
  });

  // loadIndex() may rewrite the tracked index.md/index.json/search.json in
  // the working tree; a dirty tree aborts `git pull --rebase`. commitAndPush
  // must restore each generated file to HEAD, individually, before pulling.
  it("restores each generated index file individually before the first pull", () => {
    setup();
    const fullArgs: string[][] = [];
    execFileSyncMock.mockImplementation((_file, args) => {
      if (args && args[2] === "symbolic-ref") return "main" as never;
      fullArgs.push(args ?? []);
      return "" as never;
    });
    commitAndPush({
      message: "test",
      fileToStage: "/some/file.md",
      mutator: () => {},
      raceMessage: "no",
      raceExitCode: 4,
    });
    // One checkout per file (NOT a single multi-path checkout, which git fails
    // atomically if any path is unknown), each preceding the pull.
    expect(fullArgs.slice(0, 3).map((a) => a.slice(2))).toEqual([
      ["checkout", "--", "index.md"],
      ["checkout", "--", "index.json"],
      ["checkout", "--", "search.json"],
    ]);
    expect(fullArgs[3]?.[2]).toBe("pull");
  });

  // Partial restore: one unknown path (e.g. a checkout predating search.json)
  // must not block restoring the others, nor abort the mutation. This is why
  // the restore is per-file — `git checkout -- a b c` would fail atomically.
  it("restores the other files when one generated path is unknown to git", () => {
    const { seen } = setup();
    const restored: string[] = [];
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      if (label === "symbolic-ref") return "main" as never;
      if (label === "checkout") {
        const path = args[args.length - 1];
        if (path === "index.json") throw new Error("pathspec 'index.json' did not match");
        restored.push(path);
        return "" as never;
      }
      seen.push(label);
      return "" as never;
    });
    let mutatorCalls = 0;
    commitAndPush({
      message: "test",
      fileToStage: "/some/file.md",
      mutator: () => mutatorCalls++,
      raceMessage: "no",
      raceExitCode: 4,
    });
    // index.md and search.json still restored despite index.json failing...
    expect(restored).toEqual(["index.md", "search.json"]);
    // ...and the mutation proceeded normally.
    expect(mutatorCalls).toBe(1);
    expect(seen).toEqual(["pull", "add", "commit", "push"]);
  });

  // The canonical checkout pushes a bare `main` ref, which pushes the LOCAL
  // `main` branch — not HEAD. If the checkout is parked on another branch, that
  // push is rejected non-fast-forward forever and looks like a lost race. Guard
  // it: bail with exit 1 before pulling/committing, never touching the tree.
  it("refuses a bare-branch push when the checkout is on the wrong branch", () => {
    const { seen, exit } = setup();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      if (label === "symbolic-ref") return "rfc-some-feature" as never;
      seen.push(label);
      return "" as never;
    });
    let mutatorCalls = 0;
    expect(() =>
      commitAndPush({
        message: "claim: x",
        fileToStage: "/some/file.md",
        mutator: () => mutatorCalls++,
        raceMessage: "lost claim race",
        raceExitCode: 3,
      }),
    ).toThrow(/exit 1/);
    expect(exit).toHaveBeenCalledWith(1);
    // The guard fires before the mutation loop: it never restores generated
    // files, pulls, runs the mutator, commits, or pushes — the tree is untouched.
    expect(seen).toEqual([]);
    expect(mutatorCalls).toBe(0);
    // And it exits 1 (a real config error), NOT the raceExitCode (a lost race) —
    // the whole point is to stop masquerading a stuck checkout as a lost claim.
    expect(exit).not.toHaveBeenCalledWith(3);
    const msg = errSpy.mock.calls.at(-1)?.[0] as string;
    expect(msg).toMatch(/is on branch "rfc-some-feature", not "main"/);
    // The actionable recovery command is part of the contract — lock it so a
    // refactor can't silently drop the one line an operator needs to copy.
    expect(msg).toMatch(/checkout main && .*pull --ff-only origin main/);
  });

  it("reports a detached HEAD (symbolic-ref exits non-zero) and still exits 1", () => {
    const { seen, exit } = setup();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    execFileSyncMock.mockImplementation((_file, args) => {
      const label = args && args.length >= 3 ? args[2] : "";
      // `git symbolic-ref --quiet HEAD` exits non-zero on a detached HEAD; the
      // git() helper surfaces that as a throw, which the guard must swallow.
      if (label === "symbolic-ref") throw new Error("fatal: ref HEAD is not a symbolic ref");
      seen.push(label);
      return "" as never;
    });
    expect(() =>
      commitAndPush({
        message: "claim: x",
        fileToStage: "/some/file.md",
        mutator: () => {},
        raceMessage: "lost claim race",
        raceExitCode: 3,
      }),
    ).toThrow(/exit 1/);
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen).toEqual([]);
    expect(errSpy.mock.calls.at(-1)?.[0]).toMatch(/is on branch "\(detached HEAD\)", not "main"/);
  });

  // refine commits in an agent worktree (on a feature branch) and must push
  // HEAD:main and run git in that worktree, not the canonical checkout.
  it("honors cwd and pushRefspec overrides (the refine path)", () => {
    setup();
    const fullArgs: string[][] = [];
    execFileSyncMock.mockImplementation((_file, args) => {
      fullArgs.push(args ?? []);
      return "" as never;
    });
    commitAndPush({
      message: "refine: story-x",
      fileToStage: "/wt/story.md",
      mutator: () => {},
      raceMessage: "no",
      raceExitCode: 4,
      cwd: "/wt",
      pushRefspec: "HEAD:main",
    });
    // Every git call targets the worktree via `-C /wt`.
    for (const a of fullArgs) {
      expect(a.slice(0, 2)).toEqual(["-C", "/wt"]);
    }
    const push = fullArgs.find((a) => a[2] === "push");
    expect(push).toEqual(["-C", "/wt", "push", "--quiet", "origin", "HEAD:main"]);
  });
});

describe("buildStoryContent", () => {
  it("generates minimal story with defaults", () => {
    const content = buildStoryContent("0005-gaps", "my-story", { date: "2026-06-08" });
    expect(content).toContain(`title: "my-story"`);
    expect(content).toContain(`status: draft`);
    expect(content).toContain(`rfc: "0005-gaps"`);
    expect(content).toContain(`cluster: null`);
    expect(content).toContain(`deps: []`);
    expect(content).toContain(`deps-rfc: []`);
    expect(content).toContain(`est-loc: null`);
    expect(content).toContain(`priority: null`);
    expect(content).toContain(`updated: 2026-06-08`);
    expect(content).toContain(`pr: null`);
    expect(content).toContain(`claim: null`);
    expect(content).toContain(`## Context`);
    expect(content).toContain(`## Acceptance criteria`);
  });

  it("applies all flags", () => {
    const content = buildStoryContent("0005-gaps", "my-story", {
      title: "My custom title",
      cluster: "type-system",
      estLoc: 120,
      deps: ["story-a", "story-b"],
      priority: 5,
      date: "2026-06-08",
    });
    expect(content).toContain(`title: "My custom title"`);
    expect(content).toContain(`cluster: type-system`);
    expect(content).toContain(`deps: ["story-a", "story-b"]`);
    expect(content).toContain(`est-loc: 120`);
    expect(content).toContain(`priority: 5`);
  });

  it("uses story slug as title when no title given", () => {
    const content = buildStoryContent("0001-r", "add-foo-support", { date: "2026-06-08" });
    expect(content).toContain(`title: "add-foo-support"`);
  });

  it("escapes double-quotes in title", () => {
    const content = buildStoryContent("0005-gaps", "x", {
      title: 'foo "bar" baz',
      date: "2026-06-08",
    });
    expect(content).toContain(`title: "foo \\"bar\\" baz"`);
  });
});

describe("checkPrNotOpen (done merge-state guard)", () => {
  function setupExit() {
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("succeeds silently when PR is merged", () => {
    execFileSyncMock.mockReturnValueOnce(JSON.stringify({ state: "MERGED" }) as never);
    expect(() => checkPrNotOpen(123)).not.toThrow();
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "gh",
      ["pr", "view", "123", "--json", "state"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it("succeeds silently when PR is closed (spike / moot-audit)", () => {
    execFileSyncMock.mockReturnValueOnce(JSON.stringify({ state: "CLOSED" }) as never);
    expect(() => checkPrNotOpen(42)).not.toThrow();
  });

  it("exits 1 when PR is open (work unfinished)", () => {
    setupExit();
    execFileSyncMock.mockReturnValueOnce(JSON.stringify({ state: "OPEN" }) as never);
    expect(() => checkPrNotOpen(42)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/still open/i));
  });

  it("exits 1 when gh fails (not authenticated / no network)", () => {
    setupExit();
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error("Command failed"), {
        stderr: "could not resolve to a Repository",
      });
    });
    expect(() => checkPrNotOpen(42)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/could not query PR #42/));
  });

  it("exits 1 when gh returns JSON without a state field (API regression)", () => {
    setupExit();
    execFileSyncMock.mockReturnValueOnce(JSON.stringify({}) as never);
    expect(() => checkPrNotOpen(42)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/could not read PR #42 state/),
    );
  });
});

describe("newStory validation paths", () => {
  function setupExit() {
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("exits 1 when rfcSlug contains path traversal characters", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    expect(() => newStory("../../outside", "my-story", {}, dir)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/rfcSlug.*lowercase slug/));
  });

  it("exits 1 when storySlug contains path traversal characters", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    expect(() => newStory("0005-gaps", "../../outside", {}, dir)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/storySlug.*lowercase slug/));
  });

  it("exits 1 when cluster contains YAML-significant characters", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    expect(() => newStory("0005-gaps", "my-story", { cluster: "type: system" }, dir)).toThrow(
      /exit 1/,
    );
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/cluster.*lowercase slug/));
  });

  it("exits 1 when tasksDir is not a git repo", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    // No .git dir — expect the git-repo guard to fire.
    expect(() => newStory("0005-gaps", "my-story", {}, dir)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/not a git repo/));
  });

  it("exits 1 when the RFC directory does not exist", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    mkdirSync(join(dir, ".git"));
    // No rfcs/missing-rfc subdir — expect the RFC-not-found guard to fire.
    expect(() => newStory("missing-rfc", "my-story", {}, dir)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/not found/));
  });

  it("exits 1 when the story file already exists", () => {
    setupExit();
    const dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "rfcs", "0005-gaps", "stories"), { recursive: true });
    writeFileSync(join(dir, "rfcs", "0005-gaps", "stories", "existing.md"), "---\ntitle: x\n---\n");
    expect(() => newStory("0005-gaps", "existing", {}, dir)).toThrow(/exit 1/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/already exists/));
  });
});
