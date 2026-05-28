import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  commitAndPush,
  editFrontmatter,
  Index,
  listFiltered,
  nextBundle,
  numberFlag,
  parseFlags,
  ready,
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
    pr: null,
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
    expect(seen).toEqual(["pull", "add", "commit", "push"]);
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
    // First attempt: pull, add, commit, push(throws), reset.
    // Second attempt: pull, add, commit, push(ok).
    expect(seen).toEqual([
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
});
