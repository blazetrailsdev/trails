import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { CpkBook } from "../test-helpers/models/cpk.js";

type Selectable = { select(column: string): { eagerLoad(name: string): { toSql(): string } } };

describe("JoinDependency#aliases with a composite root primary key", () => {
  fixtures(["cpkBooks", "cpkAuthors"]);

  it("aliases the whole key as one column when the relation has select values", () => {
    const sql = (CpkBook as unknown as Selectable)
      .select("cpk_books.*")
      .eagerLoad("chapters")
      .toSql();

    expect(sql).toMatch(/\[.*author_id.*, .*id.*\].{1,3} AS t0_r0/);
    expect(sql).not.toMatch(/AS t0_r1/);
  });
});
