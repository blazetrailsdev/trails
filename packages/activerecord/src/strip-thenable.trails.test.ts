import { describe, it, expect } from "vitest";
import { presence, stripThenable } from "@blazetrails/activesupport";
import { Relation } from "./relation.js";
import { Base } from "./index.js";
import { DisableJoinsAssociationRelation } from "./disable-joins-association-relation.js";
import { UniquenessValidator } from "./validations/uniqueness.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { Author } from "./test-helpers/models/author.js";

class SecretRelation extends Relation<InstanceType<typeof Post>> {
  #secret = "kept";
  get secret() {
    return this.#secret;
  }
}

class SecretDisableJoinsRelation extends DisableJoinsAssociationRelation<
  InstanceType<typeof Post>
> {
  #secret = "kept";
  get secret() {
    return this.#secret;
  }
}

describe("stripThenable callers hand on the original object", () => {
  fixtures(["authors", "posts"]);

  it("Relation#load and #reload resolve to the relation itself", async () => {
    const relation = new SecretRelation(Post);
    const loaded = await relation.load();
    expect(loaded).toBe(relation);
    expect((loaded as SecretRelation).secret).toBe("kept");
    const reloaded = await relation.reload();
    expect(reloaded).toBe(relation);
    expect(Array.isArray(await relation)).toBe(true);
  });

  it("DisableJoinsAssociationRelation#load resolves to the relation itself", async () => {
    const relation = new SecretDisableJoinsRelation(Post, "id", [1]);
    const loaded = await relation.load();
    expect(loaded).toBe(relation);
    expect((loaded as SecretDisableJoinsRelation).secret).toBe("kept");
  });

  it("CollectionProxy#push, #clear and #reload resolve to the proxy itself", async () => {
    const author = await Author.first();
    const posts = author!.posts as any;
    expect(await posts.reload()).toBe(posts);
    expect(await posts.push()).toBe(posts);
    expect(await posts.clear()).toBe(posts);
  });

  it("inBatches yields the relation it built", async () => {
    const yielded: unknown[] = [];
    await (Post.all() as any).inBatches({ of: 1 }, async (batch: unknown) => {
      yielded.push(await Promise.resolve(batch));
      return batch;
    });
    expect(yielded.length).toBeGreaterThan(0);
    for (const batch of yielded) expect(batch).toBeInstanceOf(Relation);
  });

  it("applyJoinDependency resolves to a relation, not its records", async () => {
    const relation = await (Post.all() as any).applyJoinDependency();
    expect(relation).toBeInstanceOf(Relation);
  });

  it("UniquenessValidator#scopeRelation resolves to the relation it was given", async () => {
    const validator = new UniquenessValidator({ attributes: ["title"], class: Post }) as any;
    const relation = new SecretRelation(Post);
    const scoped = await validator.scopeRelation(new Post(), relation);
    expect(scoped).toBe(relation);
    expect(scoped.secret).toBe("kept");
    expect(await validator.buildRelation(Post, "title", "x")).toBeInstanceOf(Relation);
  });

  it("presence resolves a present relation to itself", async () => {
    const relation = new SecretRelation(Post);
    const present = (await presence(relation)) as SecretRelation;
    expect(present).toBe(relation);
    expect(present.secret).toBe("kept");
  });

  it("withRoleAndShard loads a relation the block returns and settles to it", async () => {
    const sync = new SecretRelation(Post);
    const fromSync = await Base.connectedTo({ role: "writing" }, () => sync);
    expect(fromSync).toBe(sync);
    expect((fromSync as unknown as SecretRelation).secret).toBe("kept");
    expect(sync.isLoaded).toBe(true);

    const async = new SecretRelation(Post);
    const fromAsync = await Base.connectedTo({ role: "writing" }, async () => stripThenable(async));
    expect(fromAsync).toBe(async);
    expect(async.isLoaded).toBe(true);

    expect(Base.connectedTo({ role: "writing" }, () => 7)).toBe(7);
    expect(await Base.connectedTo({ role: "writing" }, async () => 7)).toBe(7);
  });

  it("CollectionProxy#concat resolves to the proxy itself", async () => {
    const author = await Author.first();
    const posts = author!.posts as any;
    expect(await posts.concat()).toBe(posts);
  });
});
