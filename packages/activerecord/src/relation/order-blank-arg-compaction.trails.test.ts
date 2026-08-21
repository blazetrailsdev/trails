import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { UnknownAttributeReference } from "../errors.js";

/**
 * Locks where blank order args are compacted.
 *
 * Rails runs `compact_blank!` inside `order` / `reorder`'s
 * `check_if_method_has_arguments!` (query_methods.rb:656-660/752-756), NOT
 * inside `order!`. So `order("")` is a no-op, while `order!("")` reaches
 * `preprocess_order_args` and raises from `disallow_raw_sql!` — the blank
 * string never matches the column-name-with-order matcher.
 *
 * trails previously swallowed the blank inside `orderBang`, which made the bang
 * method silently lenient where Rails raises.
 */
describe("order blank arg compaction", () => {
  fixtures([]);

  it("compacts a blank order arg in order", () => {
    expect(Post.all().order("").toSql()).not.toContain("ORDER BY");
  });

  it("raises from the bang method, which does not compact", () => {
    const rel = Post.all() as unknown as { orderBang(arg: string): unknown };
    expect(() => rel.orderBang("")).toThrow(UnknownAttributeReference);
  });
});
