import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bestBundle,
  editFrontmatter,
  Index,
  listFiltered,
  nextBundle,
  parseFlags,
  ready,
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
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => editFrontmatter(file, { deps: "[a, b, c]" })).toThrow(/exit 1/);
    expect(errSpy.mock.calls[0]?.[0]).toMatch(/refusing to edit list-valued/);
    exit.mockRestore();
    errSpy.mockRestore();
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
