import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class MultiDbRakeTest extends TestCase {}
include(MultiDbRakeTest, Isolation);
registerSpecType(/^MultiDbRakeTest$/, MultiDbRakeTest);

describe("MultiDbRakeTest", { timeout: 600_000 }, () => {
  let t: Generation;
  let output: string;

  beforeEach(async () => {
    t = new MultiDbRakeTest("test") as unknown as Generation;
    await t.buildApp({ multiDb: true });
    output = await t.trails("generate", "scaffold", "Pet", "name:string", "--database=animals");
  });

  afterEach(() => t.teardownApp());

  it("generate scaffold creates abstract model", () => {
    expect(output).toMatch(/app\/models\/pet\.ts/);
    expect(output).toMatch(/app\/models\/animals-record\.ts/);
  });

  it("destroy scaffold doesnt remove abstract model", async () => {
    const destroyOutput = await t.trails("destroy", "scaffold", "Pet", "--database=animals");

    expect(destroyOutput).toMatch(/app\/models\/pet\.ts/);
    expect(destroyOutput).not.toMatch(/app\/models\/animals-record\.ts/);
  });

  it("creates a directory for migrations", () => {
    expect(output).toMatch(/db\/animals_migrate\//);
  });

  it("migrations paths takes first", async () => {
    await t.appFile(
      "config/database.ts",
      `const defaults = { adapter: "sqlite3", pool: 5, timeout: 5000, variables: { statement_timeout: 1000 } };
export default {
  development: {
    primary: { ...defaults, database: "storage/development.sqlite3" },
    animals: {
      ...defaults,
      database: "storage/development_animals.sqlite3",
      migrationsPaths: ["db/animals_migrate", "db/common"],
    },
  },
};
`,
    );

    const dogOutput = await t.trails(
      "generate",
      "scaffold",
      "Dog",
      "name:string",
      "--database=animals",
    );
    expect(dogOutput).toMatch(/db\/animals_migrate\//);
    expect(dogOutput).not.toMatch(/db\/common\//);
  });
});
