import { describe, expect, it } from "vitest";
import { planTestMoves, type PlanInput } from "./plan-test-moves.js";

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
      fixture({ pkg: "arel", libDir: "lib", files: ["x.test.ts", "y.test.ts"], comparison: [] }),
    );
    expect(plan.moves).toEqual([
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
});
