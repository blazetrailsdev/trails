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
    const rel = Post.all().with(
      "recent_posts",
      "SELECT * FROM posts WHERE created_at > '2024-01-01'",
    );
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
  });
});
