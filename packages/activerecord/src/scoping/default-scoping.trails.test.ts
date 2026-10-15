import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import type { HasManyAssociation } from "../associations/has-many-association.js";
import type { HasOneAssociation } from "../associations/has-one-association.js";
import { Comment, SpecialComment, VerySpecialComment } from "../test-helpers/models/comment.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Default } from "./default.js";
import { defaultExtensions } from "./named.js";
import {
  Developer,
  DeveloperOrderedBySalary,
  ClassMethodDeveloperCalledDavid,
} from "../test-helpers/models/developer.js";

registerModel(Developer);
registerModel(Comment);
registerModel(SpecialComment);
registerModel(VerySpecialComment);
registerModel(Post);
registerModel(SpecialPost);

describe("DefaultScopingTest", () => {
  const { posts } = fixtures(["developers", "posts", "comments"]);

  it("default scope as class method runs on create", async () => {
    expect(new ClassMethodDeveloperCalledDavid().readAttribute("name")).toBe("David");
    const dev = await ClassMethodDeveloperCalledDavid.create();
    expect(dev.readAttribute("name")).toBe("David");
  });

  it("sti association write paths use the declaring-class foreign key", async () => {
    const post = posts("thinking");
    expect(post.constructor.name).toBe("SpecialPost");

    await SpecialComment.unscoped(async () => {
      const built = post.specialComments.build({ body: "built sti comment" });
      expect(Number(built._readAttribute("post_id"))).toBe(Number(post.id));

      const assoc = post.association("specialComments") as HasManyAssociation;
      const fresh = new SpecialComment({ body: "fresh sti comment" });
      assoc.setOwnerAttributes(fresh);
      expect(Number(fresh._readAttribute("post_id"))).toBe(Number(post.id));

      expect(Object.keys(assoc.nullifiedOwnerAttributes())).toEqual(["post_id"]);

      const pushed = new SpecialComment({ body: "pushed sti comment" });
      await post.specialComments.push(pushed);
      expect(Number(pushed._readAttribute("post_id"))).toBe(Number(post.id));
      expect(pushed.isNewRecord()).toBe(false);
    });
  });

  it("sti has_one read build and assign paths use the declaring-class foreign key", async () => {
    const post = posts("thinking");
    expect(post.constructor.name).toBe("SpecialPost");

    await Comment.unscoped(async () => {
      const reader = await SpecialPost.create({ title: "sti reader", body: "x" });
      const comment = await Comment.create({
        type: "VerySpecialComment",
        body: "sti has_one comment",
        post_id: reader.id,
      });
      const loaded = await reader.verySpecialComment;
      expect(loaded!.id).toBe(comment.id);

      const assigned = new VerySpecialComment({ body: "assigned sti has_one" });
      await (
        post as unknown as { setVerySpecialComment(record: VerySpecialComment): Promise<void> }
      ).setVerySpecialComment(assigned);
      expect(Number(assigned._readAttribute("post_id"))).toBe(Number(post.id));

      const builder = await SpecialPost.create({ title: "sti builder", body: "x" });
      const built = await (builder.association("verySpecialComment") as HasOneAssociation).build({
        body: "built sti has_one",
      });
      expect(Number(built!._readAttribute("post_id"))).toBe(Number(builder.id));
    });
  });
});

describe("scopeAttributes?", () => {
  it("is false for a model with no default scope and no current scope", () => {
    expect(Developer.isScopeAttributes()).toBe(false);
  });

  it("is true for a model with a macro default scope", () => {
    expect(DeveloperOrderedBySalary.isScopeAttributes()).toBe(true);
  });

  it("is true for a model with a method-form default scope", () => {
    expect(ClassMethodDeveloperCalledDavid.isScopeAttributes()).toBe(true);
  });

  it("is true inside a scoping block", async () => {
    await Developer.where({ name: "David" }).scoping(async () => {
      expect(Developer.isScopeAttributes()).toBe(true);
    });
    expect(Developer.isScopeAttributes()).toBe(false);
  });
});

describe("default_scope_override", () => {
  it("is true for a subclass that redefines default_scope, and for its own subclasses", () => {
    class Inheriting extends ClassMethodDeveloperCalledDavid {}

    Default.buildDefaultScope.call(ClassMethodDeveloperCalledDavid);
    Default.buildDefaultScope.call(Inheriting);

    expect(ClassMethodDeveloperCalledDavid.defaultScopeOverride).toBe(true);
    expect(Inheriting.defaultScopeOverride).toBe(true);
    expect(Inheriting.isScopeAttributes()).toBe(true);
  });

  it("is false for a model that only inherits the mixed-in default_scope", () => {
    Default.buildDefaultScope.call(DeveloperOrderedBySalary);

    expect(DeveloperOrderedBySalary.defaultScopeOverride).toBe(false);
  });
});

describe("build_default_scope", () => {
  it("defaults its relation to the model's own relation", () => {
    const withDefault = Default.buildDefaultScope.call(DeveloperOrderedBySalary);
    const withExplicit = Default.buildDefaultScope.call(
      DeveloperOrderedBySalary,
      DeveloperOrderedBySalary.relation(),
    );

    expect(withDefault.toSql()).toBe(withExplicit.toSql());
    expect(withDefault.toSql()).toMatch(/ORDER BY/);
  });
});

describe("default_extensions", () => {
  const extensions = [{ one: () => 1 }];

  it("answers the association scope's extensions", () => {
    const host = {
      currentScope: () => ({ isEmptyScope: true }),
      relation: () => ({ extensions }),
    };

    expect(defaultExtensions.call(host)).toBe(extensions);
  });

  it("falls back to the default scope, then to no extensions", () => {
    const host = {
      isAbstractClass: () => true,
      currentScope: () => ({ isEmptyScope: true }),
      relation: () => undefined,
    };

    expect(defaultExtensions.call(host)).toEqual([]);
  });
});
