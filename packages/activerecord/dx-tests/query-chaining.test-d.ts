import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, Relation } from "@blazetrails/activerecord";

// Scenario: building a search endpoint — users chain scopes, filters, order,
// and pagination, then `await` the result.

class Post extends Base {
  declare title: string;
  declare published: boolean;
  declare created_at: Date;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.attribute("created_at", "datetime");
  }
}

describe("query chaining DX", () => {
  it("a Relation<Post> is awaitable and resolves to Post[]", async () => {
    const rel = {} as Relation<Post>;
    const rows = await rel;
    expectTypeOf(rows).toEqualTypeOf<Post[]>();
  });

  it("Relation is PromiseLike (then/catch/finally)", () => {
    const rel = {} as Relation<Post>;
    assertType<Relation<Post>["then"]>(rel.then);
    assertType<Relation<Post>["catch"]>(rel.catch);
    assertType<Relation<Post>["finally"]>(rel.finally);
  });

  it("Relation finder methods preserve T through the generic", async () => {
    const rel = {} as Relation<Post>;
    expectTypeOf(await rel.first()).toEqualTypeOf<Post | null>();
    expectTypeOf(await rel.firstBang()).toEqualTypeOf<Post>();
    expectTypeOf(await rel.last()).toEqualTypeOf<Post | null>();
    expectTypeOf(await rel.sole()).toEqualTypeOf<Post>();
    expectTypeOf(await rel.take(5)).toEqualTypeOf<Post[]>();
    expectTypeOf(await rel.findBy({ published: true })).toEqualTypeOf<Post | null>();
  });

  it("Relation ordinal finders (second..fortyTwo) return T | null", async () => {
    const rel = {} as Relation<Post>;
    expectTypeOf(await rel.second()).toEqualTypeOf<Post | null>();
    expectTypeOf(await rel.third()).toEqualTypeOf<Post | null>();
    expectTypeOf(await rel.fortyTwo()).toEqualTypeOf<Post | null>();
    expectTypeOf(await rel.secondToLast()).toEqualTypeOf<Post | null>();
  });

  it("find(id) vs find([ids]) — overload picks scalar vs array", async () => {
    const rel = {} as Relation<Post>;
    expectTypeOf(await rel.find(1)).toEqualTypeOf<Post>();
    expectTypeOf(await rel.find([1, 2, 3])).toEqualTypeOf<Post[]>();
  });

  it("findOrCreateByBang / createOrFindByBang return T", async () => {
    const rel = {} as Relation<Post>;
    expectTypeOf(await rel.findOrCreateByBang({ title: "x" })).toEqualTypeOf<Post>();
    expectTypeOf(await rel.createOrFindByBang({ title: "x" })).toEqualTypeOf<Post>();
  });

  it("KNOWN GAP: Post.where returns `any` — ideally Relation<Post>", () => {
    const chain = Post.where({ published: true });
    expectTypeOf(chain).toBeAny();
  });

  it("hand-typed chain via `as Relation<Post>` preserves T through await", async () => {
    const rel = Post.where({ published: true }) as Relation<Post>;
    const rows = await rel;
    expectTypeOf(rows).toEqualTypeOf<Post[]>();
  });

  it("Post.where accepts a Record or a SQL-string + binds", () => {
    assertType(Post.where({ title: "x" }));
    assertType(Post.where("title = ?", "x"));
    assertType(Post.whereNot({ published: false }));
  });
});
