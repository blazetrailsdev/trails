import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadParity, packagePage, percent } from "./parity.js";

let root: string;

async function write(rel: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), text);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "website-parity-"));
  await write("packages/arel/package.json", JSON.stringify({ description: "SQL AST" }));
  await write("packages/website/package.json", JSON.stringify({ private: true }));
  await write(
    "vendor/sources.lock.json",
    JSON.stringify({ sources: { rails: { ref: "v8.0.2" } } }),
  );
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("loadParity", () => {
  it("renders a dash for every figure when the summary is missing", async () => {
    const data = await loadParity(root);
    expect(data.measuredAt).toBeNull();
    expect(data.packages.map((p) => p.name)).toEqual(["arel"]);
    expect(percent(data.packages[0].api)).toBe("—");
    const page = packagePage(data, "arel");
    expect(page).toContain("| Measured at | — |");
    expect(page).toContain("| Ruby files ported | — |");
    expect(page).toContain("## Gaps by file\n\n—");
    expect(page).toContain("## Missing methods\n\n—");
    expect(page).toContain("## Deviation receipts\n\n—");
    expect(page).toContain("tree/main/packages/arel");
  });

  it("renders a dash when the summary is unreadable", async () => {
    await write("scripts/parity/output/package-summary.json", "{not json");
    const data = await loadParity(root);
    expect(data.summary).toBeNull();
  });

  it("sums file rows and lists own and cited CLAUDE.md sections", async () => {
    const section = (file: string, heading: string, anchor: string) => ({
      file,
      heading,
      anchor,
      lede: `Rule for <${anchor}>, see [doc](docs/x.md), [here](#own) and \`<code>\`.`,
    });
    await write(
      "scripts/parity/output/package-summary.json",
      JSON.stringify({
        packages: [
          {
            name: "arel",
            railsCounterpart: "activerecord",
            tags: {
              noRailsEquivalent: { PERMANENT: 2, CONVERGEABLE: 1, none: 0 },
              perf: { PERMANENT: 0, CONVERGEABLE: 0, none: 0 },
            },
            permanentSkips: {
              "CLAUDE.md#cited": [
                { file: "packages/arel/test/a.test.ts", line: 7, testName: "skipped one" },
              ],
              "CLAUDE.md#stub": [],
            },
          },
        ],
        tagSites: [],
        files: [
          {
            package: "arel",
            rubyFile: "small.rb",
            rubyUrl: "https://github.com/rails/rails/blob/v8.0.2/activerecord/lib/arel/small.rb",
            tsFile: "small.ts",
            tsPath: "packages/arel/lib/small.ts",
            methodsMatched: 3,
            methodsMissing: 1,
            missingMethods: ["lone"],
            testsMatched: 1,
            testsTotal: 2,
          },
          {
            package: "arel",
            rubyFile: "big.rb",
            rubyUrl: null,
            tsFile: "big.ts",
            tsPath: "packages/arel/lib/big.ts",
            methodsMatched: 3,
            methodsMissing: 1,
            missingMethods: ["a?", "b!"],
            testsMatched: 1,
            testsTotal: 2,
          },
          {
            package: "arel",
            rubyFile: "gone.rb",
            rubyUrl: null,
            tsFile: null,
            tsPath: null,
            methodsMatched: 0,
            methodsMissing: 0,
            missingMethods: ["unported_only"],
            testsMatched: 0,
            testsTotal: 0,
          },
        ],
        claudeSections: [
          section("CLAUDE.md", "Cited `rule`", "cited"),
          section("CLAUDE.md", "Uncited rule", "uncited"),
          section("packages/arel/CLAUDE.md", "Own rule", "own"),
          section("packages/activerecord/CLAUDE.md", "Moved rule", "moved"),
          {
            file: "CLAUDE.md",
            heading: "Moved rule",
            anchor: "stub",
            lede: "Moved to [packages/activerecord/CLAUDE.md](packages/activerecord/CLAUDE.md#moved); unchanged.",
          },
        ],
      }),
    );
    await write("scripts/parity/output/package-summary.sha", "abcdef0123456789\n");
    await write("scripts/parity/output/build.sha", "fedcba\n");
    const data = await loadParity(root);
    const arel = data.packages[0];
    expect(percent(arel.api)).toBe("75%");
    expect(percent(arel.tests)).toBe("50%");
    expect(arel.railsVersion).toBe("v8.0.2");
    const page = packagePage(data, "arel");
    expect(page).toContain("| Measured at | abcdef0123 |");
    expect(page).toContain("### Cited `rule`");
    expect(page).toContain("### Own rule");
    expect(page).not.toContain("Uncited rule");
    expect(page).not.toContain("Moved to");
    expect(page).toContain("blob/fedcba/packages/activerecord/CLAUDE.md#moved");
    expect(page).toContain(
      "[here](https://github.com/blazetrailsdev/trails/blob/fedcba/CLAUDE.md#own)",
    );
    expect(page).toContain("Rule for &lt;cited>");
    expect(page).toContain("`<code>`");
    expect(page).toContain("](https://github.com/blazetrailsdev/trails/blob/fedcba/docs/x.md)");
    expect(page).toContain("blob/fedcba/packages/arel/CLAUDE.md#own");
    expect(page).toContain("| API methods matched | 75% (6 of 8) |");
    expect(page).toContain("| Ruby files ported | 2 |");
    expect(page).toContain("| Ruby files unported | 1 |");
    expect(page.indexOf("| `big.rb` | [`big.ts`]")).toBeGreaterThan(0);
    expect(page.indexOf("| `big.rb` |")).toBeLessThan(page.indexOf("| [`small.rb`]"));
    expect(page).toContain(
      "| [`small.rb`](https://github.com/rails/rails/blob/v8.0.2/activerecord/lib/arel/small.rb) | [`small.ts`](https://github.com/blazetrailsdev/trails/blob/fedcba/packages/arel/lib/small.ts) | 1 | 1 / 2 |",
    );
    expect(page).toContain("<summary><code>big.rb</code>: 2 missing</summary>\n\n`a?`, `b!`");
    expect(page).toContain("- `gone.rb` (0 methods)");
    expect(page).not.toContain("unported_only");
    expect(page).toContain("| `@noRailsEquivalent` | 2 | 1 | 0 |");
    expect(page).not.toContain("`@perf`");
    expect(page).toContain("<summary>Cited <code>rule</code> (1)</summary>");
    expect(page).toContain(
      "[skipped one](https://github.com/blazetrailsdev/trails/blob/fedcba/packages/arel/test/a.test.ts#L7)",
    );
    expect(page).toContain("tree/fedcba/packages/arel)");
  });
});
