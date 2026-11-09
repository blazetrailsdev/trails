import { describe, expect, it } from "vitest";
import {
  planTestMoves,
  registerLibTestPackage,
  rewriteSpecifiers,
  type PlanInput,
} from "./plan-test-moves.js";

const fixture = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  pkg: "activerecord",
  libDir: "src",
  files: [
    "relation.ts",
    "relation/where.test.ts",
    "relation/where.trails.test.ts",
    "relation/predicate-builder.test.ts",
    "trailtie.test.ts",
    "test-helpers/models/topic.ts",
    "test-helpers/fixtures/topics.ts",
    "test-helpers/models/index.ts",
    "support/config.ts",
    "__fixtures__/blob.txt.ts",
  ],
  libImported: new Set(["support/config.ts"]),
  comparison: [
    {
      package: "activerecord",
      files: [
        {
          rubyFile: "relation/where_test.rb",
          conventionTsFile: "relation/where.test.ts",
          tsFileExists: true,
        },
        { rubyFile: "railtie_test.rb", conventionTsFile: "trailtie.test.ts", tsFileExists: true },
        { rubyFile: "absent_test.rb", conventionTsFile: "absent.test.ts", tsFileExists: false },
      ],
    },
    {
      package: "arel",
      files: [{ rubyFile: "x_test.rb", conventionTsFile: "x.test.ts", tsFileExists: true }],
    },
  ],
  ...overrides,
});

describe("planTestMoves", () => {
  it("places name-matched tests at their Rails path, siblings beside them, the rest by lib path", () => {
    const plan = planTestMoves(fixture());
    expect(plan.moves).toEqual([
      ["src/__fixtures__/blob.txt.ts", "test/fixtures/blob.txt.ts"],
      ["src/relation/predicate-builder.test.ts", "test/cases/relation/predicate-builder.test.ts"],
      ["src/relation/where.test.ts", "test/cases/relation/where.test.ts"],
      ["src/relation/where.trails.test.ts", "test/cases/relation/where.trails.test.ts"],
      ["src/test-helpers/fixtures/topics.ts", "test/fixtures/topics.ts"],
      ["src/test-helpers/models/index.ts", "test/models/index.ts"],
      ["src/test-helpers/models/topic.ts", "test/models/topic.ts"],
      ["src/trailtie.test.ts", "test/cases/trailtie.test.ts"],
    ]);
    expect(plan.flagged).toEqual(["src/support/config.ts"]);
    expect(plan.collisions).toEqual([]);
  });

  it("uses a flat test/ for a gem without a main test subdirectory, and the lib root after the rename", () => {
    const plan = planTestMoves(
      fixture({
        pkg: "arel",
        libDir: "lib",
        files: ["x.test.ts", "y.test.ts", "cache/behaviors/store-behavior.ts", "cache/store.ts"],
        comparison: [],
      }),
    );
    expect(plan.moves).toEqual([
      ["lib/cache/behaviors/store-behavior.ts", "test/cache/behaviors/store-behavior.ts"],
      ["lib/x.test.ts", "test/x.test.ts"],
      ["lib/y.test.ts", "test/y.test.ts"],
    ]);
  });

  it("reports two files landing on one path", () => {
    const plan = planTestMoves(
      fixture({ files: ["test-helpers/support/a.ts", "support/a.ts"], libImported: new Set() }),
    );
    expect(plan.collisions).toEqual(["test/support/a.ts"]);
  });

  it("places a test under a lib test-helpers dir by rule 3, not as support", () => {
    const plan = planTestMoves(
      fixture({
        pkg: "actionpack",
        libDir: "lib",
        files: [
          "action-dispatch/testing/test-helpers/page-dump-helper.ts",
          "action-dispatch/testing/test-helpers/page-dump-helper.trails.test.ts",
        ],
        libImported: new Set(),
        comparison: [],
      }),
    );
    expect(plan.moves).toEqual([
      [
        "lib/action-dispatch/testing/test-helpers/page-dump-helper.trails.test.ts",
        "test/action-dispatch/testing/test-helpers/page-dump-helper.trails.test.ts",
      ],
      [
        "lib/action-dispatch/testing/test-helpers/page-dump-helper.ts",
        "test/support/page-dump-helper.ts",
      ],
    ]);
  });

  it("resolves an aliased compare package against its own prefix", () => {
    const plan = planTestMoves(
      fixture({
        pkg: "actionview",
        files: ["rails-dom-testing/assertions/selector-assertions.test.ts"],
        libImported: new Set(),
        comparison: [
          {
            package: "actionview",
            files: [
              {
                rubyFile: "selector_assertions_test.rb",
                conventionTsFile: "rails-dom-testing/assertions/selector-assertions.test.ts",
                tsFileExists: true,
              },
            ],
          },
          {
            package: "rails-dom-testing",
            files: [
              {
                rubyFile: "selector_assertions_test.rb",
                conventionTsFile: "selector-assertions.test.ts",
                tsFileExists: true,
              },
            ],
          },
        ],
      }),
    );
    expect(plan.moves).toEqual([
      [
        "src/rails-dom-testing/assertions/selector-assertions.test.ts",
        "test/rails-dom-testing/assertions/selector-assertions.test.ts",
      ],
    ]);
  });

  it("keeps the gem's own test directories and helper.ts", () => {
    const plan = planTestMoves(
      fixture({
        pkg: "activejob",
        files: [
          "test-helpers/jobs/hello-job.ts",
          "test-helpers/adapters/inline.ts",
          "test-helpers/helper.ts",
          "test-helpers/other.ts",
        ],
        libImported: new Set(),
        comparison: [],
        railsTestDirs: new Set(["jobs", "adapters", "cases"]),
      }),
    );
    expect(plan.moves).toEqual([
      ["src/test-helpers/adapters/inline.ts", "test/adapters/inline.ts"],
      ["src/test-helpers/helper.ts", "test/helper.ts"],
      ["src/test-helpers/jobs/hello-job.ts", "test/jobs/hello-job.ts"],
      ["src/test-helpers/other.ts", "test/support/other.ts"],
    ]);
  });
});

describe("planTestMoves assets", () => {
  it("moves a non-.ts file beside its one referencing test, and flags a shared or library one", () => {
    const plan = planTestMoves(
      fixture({
        pkg: "ruby-compat",
        libDir: "lib",
        files: ["marshal.ts", "marshal.trails.test.ts", "a/x.test.ts", "b/y.test.ts"],
        libImported: new Set(),
        comparison: [],
        assetRefs: new Map([
          ["marshal.fixtures.json", ["marshal.trails.test.ts"]],
          ["shared.json", ["a/x.test.ts", "b/y.test.ts"]],
          ["data.json", ["marshal.ts"]],
          ["unused.txt", []],
        ]),
      }),
    );
    expect(plan.moves).toContainEqual(["lib/marshal.fixtures.json", "test/marshal.fixtures.json"]);
    expect(plan.flagged).toEqual(["lib/data.json", "lib/shared.json"]);
    expect(plan.moves.map(([from]) => from)).not.toContain("lib/unused.txt");
  });
});

describe("registerLibTestPackage", () => {
  it("adds the package to LIB_TEST_PACKAGES, sorted", () => {
    const source =
      'export const LIB_TEST_PACKAGES: ReadonlySet<string> = new Set<string>([\n  "zeitwerk",\n  "arel",\n]);\n';
    expect(registerLibTestPackage(source, "mail")).toBe(
      'export const LIB_TEST_PACKAGES: ReadonlySet<string> = new Set<string>([\n  "arel",\n  "mail",\n  "zeitwerk",\n]);\n',
    );
  });
});

describe("rewriteSpecifiers", () => {
  it("re-points a moved test's library, helper, side-effect and declare module specifiers", () => {
    const moved = new Map([
      ["src/relation/where.test.ts", "test/cases/relation/where.test.ts"],
      ["src/test-helpers/models/topic.ts", "test/models/topic.ts"],
    ]);
    const source = [
      'import { Relation } from "../relation.js";',
      'import { Topic } from "../test-helpers/models/topic.js";',
      'import "../test-setup.js";',
      'declare module "../relation.js" {}',
      'vi.mock("../relation.js");',
      'const m = await import("./sibling.js");',
    ].join("\n");
    expect(
      rewriteSpecifiers(
        source,
        "src/relation/where.test.ts",
        "test/cases/relation/where.test.ts",
        moved,
      ),
    ).toBe(
      [
        'import { Relation } from "../../../src/relation.js";',
        'import { Topic } from "../../models/topic.js";',
        'import "../../../src/test-setup.js";',
        'declare module "../../../src/relation.js" {}',
        'vi.mock("../../../src/relation.js");',
        'const m = await import("../../../src/relation/sibling.js");',
      ].join("\n"),
    );
  });
});
