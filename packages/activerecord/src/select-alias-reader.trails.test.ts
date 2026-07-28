import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Comment } from "./test-helpers/models/comment.js";

// trails-specific: Rails exposes a `SELECT ... AS post_count` alias on a loaded
// record via method_missing / attribute_missing (gated on `@attributes.key?`).
// trails has no method_missing, so it installs per-instance own-property getters
// and reconciles them on every attribute-set swap (load / dup / reload). These
// tests lock that lifecycle; the from-alias parity tests live in relations.test.ts.
describe("select alias dynamic reader (trails)", () => {
  fixtures(["posts", "comments"]);

  it("exposes a non-column aggregate select alias via property access", async () => {
    const record = (
      await Comment.group("type").select("COUNT(post_id) AS post_count, type")
    )[0] as Comment & { post_count: unknown };
    expect(record.post_count).toEqual(record.readAttribute("post_count"));
    expect(record.post_count).not.toBeUndefined();
  });

  it("drops the alias reader on reload once the fresh row lacks it", async () => {
    // A per-row alias on a full-row select keeps the primary key, so the record
    // is reloadable — the aggregate group/select rows above have no id.
    const record = (
      await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id")
    )[0] as Comment & { bumped_id: unknown };
    expect(record.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(record.bumped_id).not.toBeUndefined();
    await record.reload();
    // A plain reload re-fetches every column but not the computed alias, so the
    // stale getter is removed — Rails' `@attributes.key?` gate raises
    // NoMethodError here; the trails analog is a plain `undefined`.
    expect(record.bumped_id).toBeUndefined();
    // Sanity: the record itself is intact after reload.
    expect(record.id).toEqual(record.readAttribute("id"));
  });
});
