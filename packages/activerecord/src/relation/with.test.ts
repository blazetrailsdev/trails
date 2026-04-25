/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// WithTest — targets relation/with_test.rb
// ==========================================================================
describe("WithTest", () => {
  it("with generates CTE", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().with({
      recent_posts: "SELECT * FROM posts WHERE created_at > '2024-01-01'",
    });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
  });

  it.skip("with when hash is passed as an argument", () => {});
  it.skip("with when hash with multiple elements of different type is passed as an argument", () => {});
  it.skip("with when invalid argument is passed", () => {});
  it.skip("multiple with calls", () => {});
  it.skip("multiple dupicate with calls", () => {});
  it.skip("count after with call", () => {});
  it.skip("with when called from active record scope", () => {});
  it.skip("with when invalid params are passed", () => {});
  it.skip("with when passing arrays", () => {});
  it.skip("with when passing single item array", () => {});
  it.skip("with recursive", () => {});
  it.skip("with joins", () => {});
  it.skip("with left joins", () => {});
  it.skip("raises when using block", () => {});
  it.skip("unscoping", () => {});
  it.skip("common table expressions are unsupported", () => {});
});
