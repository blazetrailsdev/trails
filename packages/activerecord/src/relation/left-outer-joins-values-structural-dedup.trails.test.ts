import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Author } from "../test-helpers/models/author.js";

interface JoinValueHost {
  leftOuterJoinsValues: unknown[];
  joinsValues: unknown[];
  toSql(): string;
}

const asHost = (rel: unknown): JoinValueHost => rel as JoinValueHost;

describe("join value union structural dedup", () => {
  fixtures({});

  it("emits a single LEFT OUTER JOIN for a structurally-equal Hash spec joined twice", () => {
    const rel = Author.leftJoins({ ":posts": ":comments" }).leftJoins({ ":posts": ":comments" });
    expect(asHost(rel).leftOuterJoinsValues).toHaveLength(1);
    const sql = asHost(rel).toSql();
    expect((sql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2);
  });

  it("emits a single INNER JOIN for a structurally-equal Hash spec joined twice", () => {
    const rel = Author.joins({ ":posts": ":comments" }).joins({ ":posts": ":comments" });
    expect(asHost(rel).joinsValues).toHaveLength(1);
    const sql = asHost(rel).toSql();
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(2);
  });

  it("keeps distinct Hash specs as separate joins", () => {
    const rel = Author.leftJoins({ ":posts": ":comments" }).leftJoins({ ":posts": ":author" });
    expect(asHost(rel).leftOuterJoinsValues).toHaveLength(2);
  });

  it("folds a structurally-equal Hash spec across a same-klass merge", () => {
    const rel = Author.joins({ ":posts": ":comments" }).merge(
      Author.joins({ ":posts": ":comments" }),
    );
    expect(asHost(rel).joinsValues).toHaveLength(1);
  });
});
