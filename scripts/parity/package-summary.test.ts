import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SOURCES } from "../../vendor/sources.js";
import { TS_ONLY_PACKAGES } from "../api-compare/config.js";
import {
  ROOT_DIR,
  apiExcludedReasonOf,
  testsExcludedReasonOf,
  compareKeysOf,
  githubAnchor,
  main,
  railsCounterpartOf,
  summarize,
} from "./package-summary.js";

let root: string;

async function write(rel: string, text: string): Promise<void> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, text);
}

const ROOT_CLAUDE = [
  "# guide",
  "",
  "## Ruby Strings are JS string primitives (no mutable String carrier)",
  "",
  "A Ruby `String` is a mutable object",
  "with identity.",
  "",
  "More prose.",
  "",
  "```md",
  "## not a heading",
  "```",
  "",
  "### Notes",
  "",
  "First notes.",
  "",
  "### Notes",
  "",
  "Second notes.",
].join("\n");

const SOURCE = [
  "/**",
  " * A reader; prose naming @noRailsEquivalent mid-line is not a tag.",
  " * @noRailsEquivalent PERMANENT",
  " * @internal",
  " */",
  "export function reader(): void {}",
  "",
  'const s = "/** @noRailsEquivalent PERMANENT */";',
  "",
  "export class Klass {",
  "  /**",
  " * @inventedArm if — CONVERGEABLE some-story",
  " * @perf 2x — PERMANENT",
  "   */",
  "  method(): void {}",
  "",
  "  /** @noRailsEquivalent CONVERGEABLE other-story */",
  "  constructor() {}",
  "}",
  "",
  '/** @missingRailsCall foo — CLAUDE.md, "Ruby Strings are JS string primitives" */',
  "export const value = 1;",
  "",
  'rbFSend(recv, "name");',
].join("\n");

const TEST = [
  'describe("x", () => {',
  '  // PERMANENT-SKIP: reads `String#encoding`; CLAUDE.md, "Ruby Strings are JS string',
  '  // primitives".',
  '  it.skip("reads the encoding", () => {});',
  "  // PERMANENT-SKIP: no reason cited.",
  '  it.skip("other", () => {});',
  "});",
].join("\n");

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "package-summary-"));
  await write("CLAUDE.md", ROOT_CLAUDE);
  await write("packages/activerecord/package.json", JSON.stringify({ description: "ORM layer" }));
  await write("packages/activerecord/CLAUDE.md", "## Local rule\n\nLocal lede.\n");
  await write("packages/activerecord/lib/a.ts", SOURCE);
  await write("packages/activerecord/test/cases/a.test.ts", TEST);
  await write(
    "packages/activerecord/lib/b.ts",
    'import { Module } from "@blazetrails/ruby-compat";\nnew Module();\n',
  );
  await write("packages/vitest-matchers/package.json", "{}");
  await write("packages/minitest/package.json", '{"description":"Minitest for Trails"}');
  await write("packages/not-a-package/README.md", "");
  await write(
    "scripts/api-compare/call-mismatches-exclude/activerecord/a.json",
    JSON.stringify([
      { package: "activerecord", tsFile: "a.ts" },
      { package: "activerecord", tsFile: "a.ts", kind: "args" },
      { package: "activerecord", tsFile: "a.ts", kind: "rubyCompat" },
      { package: "sqlite3", tsFile: "s.ts" },
    ]),
  );
  await write(
    "scripts/api-compare/extra-surface-mark.json",
    JSON.stringify({ activerecord: { novel: 2, total: 5 }, sqlite3: { novel: 1, total: 1 } }),
  );
  await write(
    "scripts/api-compare/output/api-comparison.json",
    JSON.stringify({
      results: [
        {
          package: "activerecord",
          paramNames: { compared: 10 },
          predicatesCompared: 4,
          predicateKindMismatches: [{}],
          files: [
            {
              rubyFile: "base.rb",
              expectedTsFile: "base.ts",
              tsFileExists: true,
              matched: 5,
              missing: 1,
            },
            {
              rubyFile: "core.rb",
              expectedTsFile: "core.ts",
              tsFileExists: false,
              matched: 0,
              missing: 3,
            },
            {
              rubyFile: "lonely.rb",
              expectedTsFile: "lonely.ts",
              tsFileExists: true,
              matched: 2,
              missing: 0,
            },
          ],
        },
        {
          package: "actiondispatch",
          files: [
            {
              rubyFile: "routing.rb",
              expectedTsFile: "routing.ts",
              tsFileExists: true,
              matched: 1,
              missing: 1,
            },
          ],
        },
        {
          package: "sqlite3",
          paramNames: { compared: 2 },
          predicatesCompared: 0,
          predicateKindMismatches: [],
        },
      ],
    }),
  );
  await write(
    "scripts/test-compare/output/convention-comparison.json",
    JSON.stringify({
      results: [
        {
          package: "activerecord",
          files: [
            {
              rubyFile: "base_test.rb",
              conventionTsFile: "base.test.ts",
              rubyTestCount: 8,
              matched: 6,
            },
            {
              rubyFile: "core_test.rb",
              conventionTsFile: "core.test.ts",
              rubyTestCount: 4,
              matched: 0,
            },
            {
              rubyFile: "base/more_test.rb",
              conventionTsFile: "base.test.ts",
              rubyTestCount: 2,
              matched: 1,
            },
            {
              rubyFile: "routing_test.rb",
              conventionTsFile: "routing.test.ts",
              conventionTsPackage: "actionpack",
              rubyTestCount: 3,
              matched: 2,
            },
          ],
        },
      ],
    }),
  );
  await write(
    "scripts/api-compare/output/param-name-mismatches.json",
    JSON.stringify({
      packages: ["activerecord"],
      mismatches: [
        { package: "activerecord", rubyFile: "a.rb", rubyName: "x" },
        { package: "activerecord", rubyFile: "a.rb", rubyName: "x" },
        { package: "sqlite3", rubyFile: "s.rb", rubyName: "y" },
      ],
    }),
  );
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("package-summary", () => {
  it("spells GitHub's heading anchors", () => {
    expect(githubAnchor("Method visibility is compile-time only (`Module#private`, `pub`)")).toBe(
      "method-visibility-is-compile-time-only-moduleprivate-pub",
    );
  });

  it("emits one entry per package.json with its metadata", async () => {
    const { packages } = await summarize(root);
    expect(packages.map((p) => p.name)).toEqual(["activerecord", "minitest", "vitest-matchers"]);
    const [ar, , vm] = packages;
    expect(ar.railsCounterpart).toBe("activerecord");
    expect(ar.description).toBe("ORM layer");
    expect(ar.claudeMd).toBe("packages/activerecord/CLAUDE.md");
    expect(vm.railsCounterpart).toBeNull();
    expect(vm.description).toBeNull();
    expect(vm.claudeMd).toBeNull();
    expect(vm.params).toBeNull();
    expect(vm.marks.extraSurfaceNovel).toBeNull();
  });

  it("appends why parity:api skips a package to its description", async () => {
    const minitest = (await summarize(root)).packages.find((p) => p.name === "minitest")!;
    expect(minitest.railsCounterpart).toBe("minitest");
    expect(minitest.description).toContain(
      `Minitest for Trails (Not in parity:api: ${apiExcludedReasonOf("minitest")})`,
    );
    expect(apiExcludedReasonOf("minitest")).toContain("no packages/minitest");
    expect(apiExcludedReasonOf("date")).toBeNull();
    expect(apiExcludedReasonOf("activerecord")).toBeNull();
  });

  it("appends why parity:test skips a package to its description", async () => {
    const minitest = (await summarize(root)).packages.find((p) => p.name === "minitest")!;
    expect(minitest.description).toBe(
      `Minitest for Trails (Not in parity:api: ${apiExcludedReasonOf("minitest")}) (Not in parity:test: ${testsExcludedReasonOf("minitest")})`,
    );
    expect(testsExcludedReasonOf("minitest")).toContain("map-vendored-minitest");
    expect(testsExcludedReasonOf("activerecord")).toBeNull();
  });

  it("pairs tse-compiler with erubi", () => {
    expect(railsCounterpartOf("tse-compiler")).toBe("erubi");
    expect(compareKeysOf("tse-compiler")).toEqual(["erubi"]);
  });

  it("names a counterpart for every package but the trails-only ones", async () => {
    const dirs = (await fs.readdir(path.join(ROOT_DIR, "packages"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const tooling = ["activerecord-cli", "trails-tsc", "vitest-matchers", "website"];
    expect(
      dirs.filter((dir) => railsCounterpartOf(dir) === null).sort(),
      "a new package that ports no gem belongs in `tooling` here; a gem port needs a vendor/sources.ts entry",
    ).toEqual([...TS_ONLY_PACKAGES, ...tooling].sort());
  });

  it("enrolls every parity:test package in parity:api or records why not", () => {
    const unexplained = SOURCES.flatMap((s) => s.packages)
      .filter((p) => p.testPath && p.compareTests !== false)
      .filter((p) => p.compareApi === false && !p.apiExcludedReason)
      .map((p) => p.name);
    expect(unexplained).toEqual([]);
  });

  it("lists the compare keys that fold onto a package directory", () => {
    expect(compareKeysOf("actionpack").sort()).toEqual([
      "abstractcontroller",
      "actioncontroller",
      "actiondispatch",
      "actionpackversion",
    ]);
    expect(compareKeysOf("vitest-matchers")).toEqual(["vitest-matchers"]);
  });

  it("counts line-leading JSDoc tags only, split by receipt", async () => {
    const { packages, tagSites } = await summarize(root);
    const { tags } = packages[0];
    expect(tags.noRailsEquivalent).toEqual({ PERMANENT: 1, CONVERGEABLE: 1, none: 0 });
    expect(tags.internal).toEqual({ PERMANENT: 0, CONVERGEABLE: 0, none: 1 });
    expect(tags.inventedArm).toEqual({ PERMANENT: 0, CONVERGEABLE: 1, none: 0 });
    expect(tags.perf).toEqual({ PERMANENT: 1, CONVERGEABLE: 0, none: 0 });
    expect(tags.missingRailsCall).toEqual({ PERMANENT: 0, CONVERGEABLE: 0, none: 1 });
    expect(tags.missingRailsArgs).toEqual({ PERMANENT: 0, CONVERGEABLE: 0, none: 0 });
    expect(tagSites).toHaveLength(6);
    expect(tagSites.find((s) => s.declaration === "constructor")).toMatchObject({
      tag: "noRailsEquivalent",
      receipt: "CONVERGEABLE",
      file: "packages/activerecord/lib/a.ts",
      line: 17,
    });
    expect(tagSites.find((s) => s.tag === "missingRailsCall")).toMatchObject({
      declaration: "value",
      citedSection: "CLAUDE.md#ruby-strings-are-js-string-primitives-no-mutable-string-carrier",
    });
  });

  it("counts marks and baselines, folding api-compare keys onto their directory", async () => {
    const [ar] = (await summarize(root)).packages;
    expect(ar.marks).toEqual({
      callMismatchesExclude: 2,
      callArgsBaseline: 1,
      rubyCompatBaseline: 1,
      extraSurfaceNovel: 3,
      extraSurfaceTotal: 6,
      modules: { newModule: 1, superMethod: 0, moduleImport: 1 },
      sends: 1,
    });
  });

  it("reports params and predicates as matched / total", async () => {
    const [ar] = (await summarize(root)).packages;
    expect(ar.params).toEqual({ matched: 10, total: 12 });
    expect(ar.predicates).toEqual({ matched: 3, total: 4 });
  });

  it("groups PERMANENT-SKIP tests by the section they cite", async () => {
    const [ar] = (await summarize(root)).packages;
    expect(ar.permanentSkips).toEqual({
      "CLAUDE.md#ruby-strings-are-js-string-primitives-no-mutable-string-carrier": [
        {
          file: "packages/activerecord/test/cases/a.test.ts",
          line: 2,
          testName: "reads the encoding",
        },
      ],
      "": [{ file: "packages/activerecord/test/cases/a.test.ts", line: 5, testName: "other" }],
    });
  });

  it("lists every ## and ### heading with its anchor and lede", async () => {
    const { claudeSections } = await summarize(root);
    expect(claudeSections).toEqual([
      {
        file: "CLAUDE.md",
        heading: "Ruby Strings are JS string primitives (no mutable String carrier)",
        anchor: "ruby-strings-are-js-string-primitives-no-mutable-string-carrier",
        lede: "A Ruby `String` is a mutable object with identity.",
      },
      { file: "CLAUDE.md", heading: "Notes", anchor: "notes", lede: "First notes." },
      { file: "CLAUDE.md", heading: "Notes", anchor: "notes-1", lede: "Second notes." },
      {
        file: "packages/activerecord/CLAUDE.md",
        heading: "Local rule",
        anchor: "local-rule",
        lede: "Local lede.",
      },
    ]);
  });

  it("fails on a citation no heading resolves", async () => {
    await write(
      "packages/activerecord/test/cases/c.test.ts",
      '// PERMANENT-SKIP: CLAUDE.md, "No such section".\nit.skip("x", () => {});\n',
    );
    await expect(summarize(root)).rejects.toThrow(/cites CLAUDE.md, "No such section"/);
  });

  it("joins each api-compare file to the test file mapped onto its TS path", async () => {
    const { files } = await summarize(root);
    expect(files).toEqual([
      {
        package: "activerecord",
        rubyFile: "base.rb",
        tsFile: "base.ts",
        methodsMatched: 5,
        methodsMissing: 1,
        testsMatched: 7,
        testsTotal: 10,
      },
      {
        package: "activerecord",
        rubyFile: "core.rb",
        tsFile: null,
        methodsMatched: 0,
        methodsMissing: 3,
        testsMatched: 0,
        testsTotal: 4,
      },
      {
        package: "activerecord",
        rubyFile: "lonely.rb",
        tsFile: "lonely.ts",
        methodsMatched: 2,
        methodsMissing: 0,
        testsMatched: 0,
        testsTotal: 0,
      },
      {
        package: "actionpack",
        rubyFile: "routing.rb",
        tsFile: "routing.ts",
        methodsMatched: 1,
        methodsMissing: 1,
        testsMatched: 2,
        testsTotal: 3,
      },
    ]);
  });

  it("writes the summary file", async () => {
    expect(await main(root)).toMatch(/3 packages, 6 tag sites, 4 files, 4 CLAUDE.md sections/);
    const out = JSON.parse(
      await fs.readFile(path.join(root, "scripts/parity/output/package-summary.json"), "utf-8"),
    );
    expect(Object.keys(out)).toEqual(["packages", "tagSites", "files", "claudeSections"]);
  });
});
