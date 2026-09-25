import { describe, it, expect } from "vitest";
import { assertDifference, assertRaise } from "@blazetrails/activesupport";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { adapterType } from "../test-adapter.js";
import { captureSql } from "../testing/sql-capture.js";
import { quoteTableName } from "../support/quote-regex.js";
import { fixtures } from "../test-fixtures.js";
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

describe("DeleteAllTest", () => {
  const { authors, posts, cpkOrderAgreements } = fixtures([
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "pets",
    "toys",
    "cpkOrders",
    "cpkOrderAgreements",
  ]);

  it("destroy all", async () => {
    const davids = Author.where({ name: "David" });

    expect(await davids).toEqual([authors("david")]);
    expect(davids.isLoaded).toBeTruthy();

    await assertDifference(
      () => Author.count() as Promise<number>,
      -1,
      null,
      async () => {
        const destroyed = await davids.destroyAll();
        expect(destroyed.map((r) => r.id)).toEqual([authors("david").id]);
        expect(destroyed[0].isFrozen()).toBeTruthy();
      },
    );

    expect(await davids).toEqual([]);
    expect(davids.isLoaded).toBeTruthy();
  });

  it("delete all", async () => {
    const davids = Author.where({ name: "David" });

    await assertDifference(
      () => Author.count() as Promise<number>,
      -1,
      null,
      () => davids.deleteAll(),
    );
    expect(davids.isLoaded).toBeFalsy();
  });

  it("delete all with index hint", async () => {
    const davids = Author.where({ name: "David" }).from(
      `${Author.quotedTableName} /*! USE INDEX (PRIMARY) */`,
    );

    await assertDifference(
      () => Author.count() as Promise<number>,
      -1,
      null,
      () => davids.deleteAll(),
    );
    expect(davids.isLoaded).toBeFalsy();
  });

  it("delete all loaded", async () => {
    const davids = Author.where({ name: "David" });

    expect(await davids).toEqual([authors("david")]);
    expect(davids.isLoaded).toBeTruthy();

    await assertDifference(
      () => Author.count() as Promise<number>,
      -1,
      null,
      () => davids.deleteAll(),
    );

    expect(await davids).toEqual([]);
    expect(davids.isLoaded).toBeTruthy();
  });

  it("delete all with group by and having", async () => {
    const minimumCommentsCount = 2;
    const postsToBeDeleted = await Post.mostCommented(minimumCommentsCount);
    expect(postsToBeDeleted.length).toBeGreaterThan(0);

    await assertDifference(
      () => Post.count() as Promise<number>,
      -postsToBeDeleted.length,
      null,
      () => Post.mostCommented(minimumCommentsCount).deleteAll(),
    );

    for (const deletedPost of postsToBeDeleted) {
      await assertRaise([RecordNotFound], {}, () => deletedPost.reload());
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
    const pets = Pet.joins(":toys").where({ toys: { name: "Bone" } });

    expect(await pets.isExists()).toBe(true);
    const sqls = await captureSql(async () => {
      const count = await pets.count();
      expect(await pets.deleteAll()).toBe(count);
    });

    if (adapterType === "mysql") {
      expect(sqls[sqls.length - 1]).not.toMatch(
        new RegExp(`SELECT DISTINCT ${regexpEscape(quoteTableName("pets.pet_id"))}`),
      );
    } else {
      expect(sqls[sqls.length - 1]).toMatch(
        new RegExp(`SELECT ${regexpEscape(quoteTableName("pets.pet_id"))}`),
      );
    }
  });

  it("delete all with joins and where part is not hash", async () => {
    const pets = Pet.joins(":toys").where("toys.name = ?", "Bone");

    expect(await pets.isExists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  it("delete all with left joins", async () => {
    const pets = Pet.leftJoins(":toys").where({ toys: { name: "Bone" } });

    expect(await pets.isExists()).toBe(true);
    const countBefore = await pets.count();
    expect(await pets.deleteAll()).toBe(countBefore);
  });

  it("delete all with includes", async () => {
    const pets = Pet.includes(":toys").where({ toys: { name: "Bone" } });

    expect(await pets.isExists()).toBe(true);
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

  it("delete all composite model with join subquery", async () => {
    const agreement = cpkOrderAgreements("order_agreement_three");
    const joinScope = CpkOrder.joins(":orderAgreements").where({
      orderAgreements: { signature: agreement.signature },
    });
    expect(await joinScope.deleteAll()).toBe(1);
  });
});
