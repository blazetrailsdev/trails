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

  it("Base.where().not(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where().not(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
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
