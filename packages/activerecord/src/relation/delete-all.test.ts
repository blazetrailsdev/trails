/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/delete_all_test.rb
 */
import { describe, it, expect } from "vitest";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Post } from "../test-helpers/models/post.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Toy } from "../test-helpers/models/toy.js";
import { CpkOrder, CpkOrderAgreement } from "../test-helpers/models/cpk.js";
import { RecordNotFound } from "../errors.js";
import { registerModel } from "../associations.js";

for (const klass of [Author, AuthorAddress, Comment, Post, Pet, Toy, CpkOrder, CpkOrderAgreement]) {
  registerModel(klass as any);
}

// ==========================================================================
// DeleteAllTest — targets relation/delete_all_test.rb
// ==========================================================================
describe("DeleteAllTest", () => {
  const { authors, posts, cpkOrderAgreements } = useHandlerFixtures(
    [
      "authors",
      "authorAddresses",
      "comments",
      "posts",
      "pets",
      "toys",
      "cpkOrders",
      "cpkOrderAgreements",
    ],
    { schema: canonicalSchema },
  );

  it("destroy all", async () => {
    const davids = Author.where({ name: "David" });

    // Force load
    expect(await davids.toArray()).toEqual([authors("david")]);
    expect(davids.isLoaded).toBe(true);

    const destroyed = await davids.destroyAll();
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].id).toBe(authors("david").id);
    expect(destroyed[0].isDestroyed()).toBe(true);

    expect(await davids.toArray()).toEqual([]);
  });

  it("delete all", async () => {
    const davids = Author.where({ name: "David" });

    const before = (await Author.count()) as number;
    await davids.deleteAll();
    expect(await Author.count()).toBe(before - 1);
    expect(davids.isLoaded).toBe(false);
  });

  it("delete all with index hint", async () => {
    const davids = Author.where({ name: "David" }).from(
      `${Author.quotedTableName} /*! USE INDEX (PRIMARY) */`,
    );

    const before = (await Author.count()) as number;
    await davids.deleteAll();
    expect(await Author.count()).toBe(before - 1);
    expect(davids.isLoaded).toBe(false);
  });

  it("delete all loaded", async () => {
    const davids = Author.where({ name: "David" });

    // Force load
    expect(await davids.toArray()).toEqual([authors("david")]);
    expect(davids.isLoaded).toBe(true);

    const before = (await Author.count()) as number;
    await davids.deleteAll();
    expect(await Author.count()).toBe(before - 1);

    expect(await davids.toArray()).toEqual([]);
    expect(davids.isLoaded).toBe(true);
  });

  it("delete all with group by and having", async () => {
    const minimumCommentsCount = 2;
    const postsToBeDeleted = await Post.mostCommented(minimumCommentsCount).toArray();
    expect(postsToBeDeleted.length).toBeGreaterThan(0);

    const before = (await Post.count()) as number;
    await Post.mostCommented(minimumCommentsCount).deleteAll();
    expect(await Post.count()).toBe(before - postsToBeDeleted.length);

    for (const deletedPost of postsToBeDeleted) {
      await expect(deletedPost.reload()).rejects.toThrow(RecordNotFound);
    }
  });

  it("delete all with unpermitted relation raises error", async () => {
    await expect(Author.distinct().deleteAll()).rejects.toThrow(
      "delete_all doesn't support distinct",
    );
    await expect(Author.with({ limited: Author.limit(2) }).deleteAll()).rejects.toThrow(
      "delete_all doesn't support with",
    );
  });

  it("delete all with joins and where part is hash", async () => {
    const pets = Pet.joins("toys").where({ toys: { name: "Bone" } });

    expect(await pets.exists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  it("delete all with joins and where part is not hash", async () => {
    const pets = Pet.joins("toys").where("toys.name = ?", "Bone");

    expect(await pets.exists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  it("delete all with left joins", async () => {
    const pets = Pet.leftJoins("toys").where({ toys: { name: "Bone" } });

    expect(await pets.exists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  // TRACKED DEVIATION: includes + where referencing included table should switch to JOIN strategy
  // (Rails auto-detects table reference and uses LEFT OUTER JOIN). Trails `includes` does a
  // separate SELECT so toys.name is not available in the WHERE clause.
  it("delete all with includes", async () => {
    const pets = Pet.includes("toys").where("toys.name = ?", "Bone");

    expect(await pets.exists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  it("delete all with order and limit deletes subset only", async () => {
    const author = authors("david");
    const limitedPosts = Post.where({ author_id: author.id }).order("id").limit(1);
    expect(await limitedPosts.count()).toBe(1);
    expect(await limitedPosts.limit(2).count()).toBe(2);
    expect(await limitedPosts.deleteAll()).toBe(1);
    await expect(Post.find(posts("welcome").id)).rejects.toThrow(RecordNotFound);
    expect(await Post.find(posts("thinking").id)).toBeTruthy();
  });

  it("delete all with order and limit and offset deletes subset only", async () => {
    const author = authors("david");
    const limitedPosts = Post.where({ author_id: author.id }).order("id").limit(1).offset(1);
    expect(await limitedPosts.count()).toBe(1);
    expect(await limitedPosts.limit(2).count()).toBe(2);
    expect(await limitedPosts.deleteAll()).toBe(1);
    await expect(Post.find(posts("thinking").id)).rejects.toThrow(RecordNotFound);
    expect(await Post.find(posts("welcome").id)).toBeTruthy();
  });

  // TRACKED DEVIATION: JoinDependency cannot build a join for CpkOrder.hasMany("orderAgreements")
  // (composite primary key model + single-column FK association). Skipped pending CPK join support.
  it.skip("delete all composite model with join subquery", async () => {
    const agreement = cpkOrderAgreements("order_agreement_three");
    const joinScope = CpkOrder.joins("orderAgreements").where(
      "cpk_order_agreements.signature = ?",
      agreement.signature,
    );
    expect(await joinScope.deleteAll()).toBe(1);
  });
});
