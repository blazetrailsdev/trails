import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Comment } from "./test-helpers/models/comment.js";

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
    const record = (
      await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id")
    )[0] as Comment & { bumped_id: unknown };
    expect(record.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(record.bumped_id).not.toBeUndefined();
    await record.reload();
    expect(record.bumped_id).toBeUndefined();
    expect(record.id).toEqual(record.readAttribute("id"));
  });
});
