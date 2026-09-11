import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Customer } from "../test-helpers/models/customer.js";
import { Company } from "../test-helpers/models/company.js";
import { Contract } from "../test-helpers/models/contract.js";

describe("Relation#where — composite-key form", () => {
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter, Post, Comment, Customer, Company, Contract].forEach(
      (m) => registerModel(m),
    );
  });

  it("compiles `where(['c1','c2'], [[v1a,v1b], [v2a,v2b]])` to OR-of-AND of column equalities", async () => {
    await CpkBook.create({ id: [1, 100], title: "match-1" });
    await CpkBook.create({ id: [2, 200], title: "match-2" });
    await CpkBook.create({ id: [1, 999], title: "no-match" });

    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["match-1", "match-2"]);
  });

  it("returns no rows when all tuples are filtered (empty after null-strip → none())", async () => {
    await CpkBook.create({ id: [1, 100], title: "exists" });
    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched).toEqual([]);
  });

  it("filters null/undefined-bearing tuples instead of emitting IS NULL (SQL tuple-equality semantics)", async () => {
    await CpkBook.create({ id: [1, 100], title: "valid" });
    await CpkBook.create({ id: [2, 200], title: "also-valid" });
    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, null],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["also-valid"]);
  });

  it("single-column case (cols.length === 1) still works (degenerate composite)", async () => {
    await CpkBook.create({ id: [1, 100], title: "a" });
    await CpkBook.create({ id: [1, 200], title: "b" });
    const matched = await (CpkBook as any).where(["author_id"], [[1]]).toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["a", "b"]);
  });

  it("composite tuple values dereference a record to its id (predicate_builder.rb:58)", async () => {
    const author: any = await (CpkAuthor as any).create({ name: "deref" });
    await CpkBook.create({ id: [author.id, 100], title: "by-record" });
    const matched = await (CpkBook as any).where(["author_id", "id"], [[author, 100]]).toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["by-record"]);
  });

  it("Relation#where(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).all().where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Relation#whereNot(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).all().where().not(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("Base.where(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Base.where().not(cols, tuples) routes through Relation#whereNot composite form", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude" });
    await CpkBook.create({ id: [2, 200], title: "keep" });
    const matched = await (CpkBook as any)
      .where()
      .not(["author_id", "id"], [[1, 100]])
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("Base.where().not(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where().not(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("whereNot(mixed-type cols, tuples) routes to sanitize (symmetric with where), not a bogus composite", () => {
    expect(() =>
      (CpkBook as any)
        .all()
        .where()
        .not(["author_id", 5], [[1, 2]]),
    ).toThrow(/wrong number of bind variables/);
    expect(() => (CpkBook as any).where().not(["author_id", 5], [[1, 2]])).toThrow(
      /wrong number of bind variables/,
    );
  });

  it("whereNot(cols, tuples) negates the OR-of-AND grouping", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude-me" });
    await CpkBook.create({ id: [2, 200], title: "exclude-me-2" });
    await CpkBook.create({ id: [3, 300], title: "keep" });

    const matched = await (CpkBook as any)
      .all()
      .where()
      .not(
        ["author_id", "id"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("whereNot(cols, tuples) on all-filtered tuples is a no-op (matches Rails' empty-hash behavior)", async () => {
    await CpkBook.create({ id: [1, 100], title: "a" });
    await CpkBook.create({ id: [2, 200], title: "b" });
    const matched = await (CpkBook as any)
      .all()
      .where()
      .not(
        ["author_id", "id"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["a", "b"]);
  });

  it("Hash form with an Array key resolves each member through attribute_aliases", async () => {
    await CpkOrder.create({ id: [1, 100], status: "aliased" });
    await CpkOrder.create({ id: [2, 200], status: "other" });

    const matched = await (CpkOrder as any)
      .where(new Map([[[":shop_id", ":id_value"], [[1, 100]]]]))
      .toArray();
    expect(matched.map((r: any) => r.status)).toEqual(["aliased"]);
  });

  it("Hash form with an Array key builds the OR-of-AND grouping over both members", async () => {
    await CpkOrder.create({ id: [1, 100], status: "first" });
    await CpkOrder.create({ id: [2, 200], status: "second" });
    await CpkOrder.create({ id: [3, 300], status: "third" });

    const matched = await (CpkOrder as any)
      .where(
        new Map([
          [
            ["shop_id", "id_value"],
            [
              [1, 100],
              [2, 200],
            ],
          ],
        ]),
      )
      .toArray();
    expect(matched.map((r: any) => r.status).sort()).toEqual(["first", "second"]);
  });

  it("Hash form with a scalar key keeps its single alias lookup", async () => {
    await CpkOrder.create({ id: [1, 100], status: "scalar" });
    const matched = await (CpkOrder as any).where({ ":id_value": 100 }).toArray();
    expect(matched.map((r: any) => r.status)).toEqual(["scalar"]);
  });

  it("Hash form with an Array key raises when a value is not an Array", async () => {
    expect(() =>
      (CpkOrder as any).where(
        new Map([
          [
            ["shop_id", "id_value"],
            [1, 100],
          ],
        ]),
      ),
    ).toThrow(/to be an Array/);
  });
});
