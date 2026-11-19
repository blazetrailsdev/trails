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
    expect(packagePage(data, "arel")).toContain("| Measured at | — |");
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
      lede: `Rule for <${anchor}>, see [doc](docs/x.md) and \`<code>\`.`,
    });
    await write(
      "scripts/parity/output/package-summary.json",
      JSON.stringify({
        packages: [
          { name: "arel", railsCounterpart: "arel", permanentSkips: { "CLAUDE.md#cited": [] } },
        ],
        tagSites: [],
        files: [
          { package: "arel", methodsMatched: 3, methodsMissing: 1, testsMatched: 1, testsTotal: 2 },
          { package: "arel", methodsMatched: 3, methodsMissing: 1, testsMatched: 1, testsTotal: 2 },
        ],
        claudeSections: [
          section("CLAUDE.md", "Cited rule", "cited"),
          section("CLAUDE.md", "Uncited rule", "uncited"),
          section("packages/arel/CLAUDE.md", "Own rule", "own"),
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
    expect(page).toContain("### Cited rule");
    expect(page).toContain("### Own rule");
    expect(page).not.toContain("Uncited rule");
    expect(page).toContain("Rule for &lt;cited>");
    expect(page).toContain("`<code>`");
    expect(page).toContain("](https://github.com/blazetrailsdev/trails/blob/fedcba/docs/x.md)");
    expect(page).toContain("blob/fedcba/packages/arel/CLAUDE.md#own");
  });
});
