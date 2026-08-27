import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { JoinDependency } from "../associations/join-dependency.js";
import { Nodes } from "@blazetrails/arel";
import "../associations/collection-proxy.js";
import "../association-relation.js";

describe("CpkBook eager pluck / cache_version over a composite-FK collection", () => {
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) => registerModel(m));
  });

  async function seedBooks(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkAuthor.create({ id: 2, name: "Author Two" });
    await CpkBook.create({ id: [1, 1], title: "Alpha", revision: 1 });
    await CpkBook.create({ id: [1, 2], title: "Beta", revision: 2 });
    await CpkBook.create({ id: [2, 3], title: "Gamma", revision: 3 });
    await CpkChapter.create({ id: [1, 10], book_id: 1, title: "ch-1" });
  }

  it("eagerLoad('chapters') builds a composite FK↔PK tuple JOIN node", () => {
    const jd = new JoinDependency(
      CpkBook as unknown as typeof Base,
      null,
      "chapters",
      Nodes.OuterJoin,
    );
    const nodes = (jd as unknown as { nodes: { assocName: string }[] }).nodes;
    expect(nodes.map((n) => n.assocName)).toEqual(["chapters"]);
  });

  it("eagerLoad('order') builds a composite-FK belongsTo JOIN node", () => {
    const jd = new JoinDependency(
      CpkBook as unknown as typeof Base,
      null,
      "order",
      Nodes.OuterJoin,
    );
    const joins = jd.joinConstraints([]);
    const node = jd.nodes.find((n) => n.assocName === "order");
    expect(node).not.toBeNull();
    const outerJoin = joins[0] as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const and = on.expr as Nodes.And;
    expect(and.children).toHaveLength(2);
    type Attr = { name: string; relation: { name: string } };
    const [c0, c1] = and.children as Nodes.Equality[];
    const c0l = c0.left as unknown as Attr;
    const c0r = c0.right as unknown as Attr;
    const c1l = c1.left as unknown as Attr;
    const c1r = c1.right as unknown as Attr;
    expect(c0l.name).toBe("shop_id");
    expect(c0l.relation.name).toBe("cpk_orders");
    expect(c0r.name).toBe("shop_id");
    expect(c0r.relation.name).toBe("cpk_books");
    expect(c1l.name).toBe("id");
    expect(c1r.name).toBe("order_id");
  });

  it("pluck over eagerLoad('chapters') joins the composite-FK collection", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad(":chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck over eagerLoad('chapters') can project the joined table's column", async () => {
    await seedBooks();
    const chapterTitles = await CpkBook.eagerLoad(":chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("cpk_chapters.title");
    expect(chapterTitles).toEqual(["ch-1", null, null]);
  });

  it("pluck over multiple eager specs joins both", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad(":author", ":chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck over eagerLoad('chapters') with a limit materializes the composite primary keys", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad(":chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .limit(2)
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta"]);
  });

  it("pluck of a nested-hash spec's inner composite-FK belongsTo joins both segments", async () => {
    await seedBooks();
    const jd = new JoinDependency(
      CpkBook as unknown as typeof Base,
      null,
      { chapters: "book" },
      Nodes.OuterJoin,
    );
    const nodes = (jd as unknown as { nodes: { assocName: string }[] }).nodes;
    expect(nodes.map((n) => n.assocName)).toEqual(["chapters", "chapters.book"]);

    const titles = await CpkBook.eagerLoad({ ":chapters": ":book" })
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("cpk_chapters.title");
    expect(titles).toEqual(["ch-1", null, null]);
  });
});
