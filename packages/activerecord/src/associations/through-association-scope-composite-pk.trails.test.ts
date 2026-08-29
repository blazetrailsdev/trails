import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Preloader } from "./preloader.js";
import { ThroughAssociation } from "./preloader/through-association.js";
import { CpkOrder, CpkOrderTag, CpkTag } from "../test-helpers/models/cpk.js";

registerModel([CpkOrder, CpkOrderTag, CpkTag]);

CpkOrder.hasMany(
  "tagsWithMixedCondition",
  (rel) => rel.where("cpk_order_tags.order_id > 0 AND cpk_tags.name = 'Digital product'"),
  {
    className: "CpkTag",
    through: "orderTags",
    source: "tag",
  },
);

interface ThroughScopeProbe {
  throughScope(): { toSql(): string };
}

describe("Preloader::ThroughAssociation#through_scope composite-PK through", () => {
  const { cpkOrders } = fixtures(["cpkOrders", "cpkTags", "cpkOrderTags"]);

  async function throughLoader(owners: CpkOrder[], name: string): Promise<ThroughAssociation> {
    const loaders = await new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders();
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("JOINs the source and copies a mixed through+source predicate onto the composite-PK through query", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const loader = await throughLoader([order], "tagsWithMixedCondition");
    const sql = (loader as unknown as ThroughScopeProbe).throughScope().toSql();
    expect(sql).toContain("cpk_order_tags.order_id > 0");
    expect(sql).toContain("cpk_tags.name = 'Digital product'");
    expect(sql).toMatch(/JOIN .*cpk_tags/);
  });

  it("preloads a scoped source through a composite-PK model without orphaning the source predicate", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const [row] = await CpkOrder.where({
      shop_id: order.shop_id,
      id: order.readAttribute("id"),
    }).preload(":tagsWithMixedCondition");
    const tags = (row.association("tagsWithMixedCondition").target ?? []) as CpkTag[];
    expect(tags.map((t) => t.name)).toEqual(["Digital product"]);
  });
});
