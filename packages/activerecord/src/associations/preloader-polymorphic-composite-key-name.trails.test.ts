/**
 * `Preloader::Association#association_key_name` resolves the associated key
 * against the CONCRETE class of the records being preloaded:
 *
 *   def association_key_name
 *     reflection.join_primary_key(klass)
 *   end
 *
 * (`preloader/association.rb:160-162`), and `join_primary_key(klass = nil)` is
 * `polymorphic? ? association_primary_key(klass) : association_primary_key`
 * (`reflection.rb:944-946`). Dropping the `klass` argument makes a polymorphic
 * preload key on the reflection's own guess instead of the target's real
 * primary key — for `Cpk::Post` (`primary_key: [:title, :author]`,
 * schema.rb:263) that is the difference between the composite key and a
 * non-existent `id` column.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import type { CpkPost } from "../test-helpers/models/cpk.js";

describe("Preloader::Association#associationKeyName — polymorphic CPK target", () => {
  fixtures([]);

  beforeAll(async () => {
    const cpk = await import("../test-helpers/models/cpk.js");
    registerModel("CpkPost", cpk.CpkPost);
    registerModel("CpkComment", cpk.CpkComment);
  });

  it("preloads a polymorphic belongs_to whose target has a composite primary key", async () => {
    const cpk = await import("../test-helpers/models/cpk.js");
    const post = await cpk.CpkPost.create({
      title: "cpk polymorphic post",
      author: "the_author",
    });
    await cpk.CpkComment.create({
      commentable_title: post.title,
      commentable_author: post.author,
      commentable_type: cpk.CpkPost.polymorphicName(),
      text: "great post!",
    });

    const comments = await cpk.CpkComment.where({
      commentable_title: post.title,
    }).includes(":commentable");

    expect(comments.length).toBe(1);
    const commentable = comments[0].commentable as CpkPost | null;
    expect(commentable).not.toBeNull();
    expect(commentable!.title).toBe(post.title);
    expect(commentable!.author).toBe(post.author);
  });
});
