import { describe, expect, it } from "vitest";
import type { PairSeedRow, RubyTestManifest } from "./ledger.js";
import { planStories, refSlug, renderStory, type StoryInput } from "./stories.js";

const row = (pkg: string, rubyFile: string, rubyName: string): PairSeedRow => ({
  package: pkg,
  rubyFile,
  rubyName,
  kind: "drift",
  from: "v1",
  to: "v2",
});

const tests = (pkg: string, file: string, paths: string[]): RubyTestManifest => ({
  packages: {
    [pkg]: {
      files: [
        {
          file,
          testCases: paths.map((p) => ({ path: p, description: p, file })),
        },
      ],
    },
  },
});

const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  source: "gem",
  from: "v1",
  to: "v2",
  rfc: "0000-gem-burn-down",
  pairRows: [row("core", "a/x.rb", "foo"), row("core", "b/y.rb", "bar"), row("web", "z.rb", "baz")],
  testRows: [],
  fromTests: tests("core", "a/x_test.rb", ["XTest > old", "XTest > kept"]),
  toTests: tests("core", "a/x_test.rb", ["XTest > kept", "XTest > new"]),
  tsFileOf: new Map([["core a/x.rb", "a/x.ts"]]),
  tsTestFileOf: new Map(),
  missing: new Map(),
  libDir: (pkg, ref) => `vendor/gem/${ref}/${pkg}/lib`,
  testDir: (pkg, ref) => `vendor/gem/${ref}/${pkg}/test`,
  order: ["web", "core"],
  subsystems: {},
  fileDeps: {},
  splitThreshold: Infinity,
  trailsPackage: { core: "gem-core" },
  ...over,
});

describe("burn-down stories", () => {
  it("writes one story per package, chained in the given order", () => {
    const stories = planStories(input());
    expect(stories.map((s) => [s.id, s.deps])).toEqual([
      ["gem-2-web", []],
      ["gem-2-core", ["gem-2-web"]],
    ]);
    const core = stories[1];
    expect([...core.libFiles.keys()]).toEqual(["a/x.rb", "b/y.rb"]);
    expect(core.testFiles.get("a/x_test.rb")).toEqual({
      added: ["XTest > new"],
      removed: ["XTest > old"],
      changed: [],
    });
  });

  it("splits a package over the threshold along its subsystems", () => {
    const stories = planStories(
      input({
        splitThreshold: 1,
        subsystems: { core: [{ name: "alpha", prefixes: ["a/"] }] },
        fileDeps: { "core b/y.rb": ["other-rfc-story"] },
      }),
    );
    expect(stories.map((s) => [s.id, s.deps])).toEqual([
      ["gem-2-web", []],
      ["gem-2-core-alpha", ["gem-2-web"]],
      ["gem-2-core-other", ["gem-2-web", "other-rfc-story"]],
    ]);
    expect([...stories[1].testFiles.keys()]).toEqual(["a/x_test.rb"]);
  });

  it("renders the diff command, TS file and pin criterion per Ruby file", () => {
    const i = input();
    const md = renderStory(i, planStories(i)[1], "burn-down");
    expect(md).toContain(
      "git diff --no-index vendor/gem/v1/core/lib/a/x.rb vendor/gem/v2/core/lib/a/x.rb",
    );
    expect(md).toContain("TS: `a/x.ts`");
    expect(md).toContain("body-pins.ts --pin b/y.rb --package core");
    expect(md).toContain("- `XTest > new`");
    expect(md).toMatch(/^deps:\n {2}- gem-2-web$/m);
    expect(md).toContain('packages: ["gem-core"]');
  });

  it("drops an added test the comparer matches and keeps a same-path test in another file", () => {
    const stories = planStories(
      input({
        fromTests: tests("core", "a/x_test.rb", ["T > a"]),
        toTests: {
          packages: {
            core: {
              files: [
                {
                  file: "a/x_test.rb",
                  testCases: [{ path: "T > b", description: "b", file: "a/x_test.rb" }],
                },
                {
                  file: "a/y_test.rb",
                  testCases: [
                    { path: "T > a", description: "a", file: "a/y_test.rb" },
                    { path: "T > c", description: "c", file: "a/y_test.rb" },
                  ],
                },
              ],
            },
          },
        },
        testRows: [
          {
            package: "core",
            rubyFile: "a/x_test.rb",
            path: "T > a",
            toPath: "T > b",
            kind: "moved",
            from: "v1",
            to: "v2",
          },
        ],
        missing: new Map([["core a/y_test.rb", new Set(["a"])]]),
      }),
    );
    const core = stories.find((s) => s.package === "core")!;
    expect(core.testFiles.get("a/y_test.rb")!.added).toEqual(["T > a"]);
    expect(core.testFiles.get("a/x_test.rb")!.removed).toEqual([]);
  });

  it("slugs a ref", () => {
    expect(refSlug("v8.0.5.2")).toBe("8-0-5-2");
  });
});
