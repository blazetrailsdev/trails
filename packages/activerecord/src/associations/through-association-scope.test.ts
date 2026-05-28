/**
 * Preloader::ThroughAssociation#through_scope fidelity.
 *
 * Pins the parts of Rails' `through_scope`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb)
 * that our preloader can honour without the single-query JOIN strategy:
 *
 *   - `annotate(...)` on the through reflection's own scope is carried onto
 *     the through (intermediate) query rather than being silently dropped.
 *   - a strict-loading preload scope cascades to the through query.
 *
 * The `where_clause`/`includes`/`joins` JOIN branch of `through_scope` is a
 * single-query strategy; our preloader applies target-table conditions at the
 * source-preloader stage instead, so that branch is exercised by the
 * join-based eager-loading tests, not here.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { Preloader } from "./preloader.js";
import { ThroughAssociation } from "./preloader/through-association.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA: Schema = {
  tsa_authors: { name: "string" },
  tsa_posts: { tsa_author_id: "integer", title: "string" },
  tsa_comments: { tsa_post_id: "integer", body: "string" },
};

describe("Preloader::ThroughAssociation#through_scope", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  class TsaAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class TsaPost extends Base {
    static {
      this.attribute("tsa_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class TsaComment extends Base {
    static {
      this.attribute("tsa_post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
    registerModel(TsaAuthor);
    registerModel(TsaPost);
    registerModel(TsaComment);
  });

  beforeEach(() => {
    (TsaAuthor as any)._associations = [];
    (TsaPost as any)._associations = [];
    (TsaComment as any)._associations = [];
    Associations.hasMany.call(TsaAuthor, "posts", {
      className: "TsaPost",
      foreignKey: "tsa_author_id",
    });
    Associations.hasMany.call(TsaPost, "comments", {
      className: "TsaComment",
      foreignKey: "tsa_post_id",
    });
    Associations.hasMany.call(TsaAuthor, "annotatedComments", {
      className: "TsaComment",
      through: "posts",
      source: "comments",
      scope: (rel: any) => rel.annotate("preload-through"),
    });
  });

  function throughLoader(owners: Base[], name: string, scope?: any): ThroughAssociation {
    const loaders = new Preloader({
      records: owners,
      associations: [name],
      scope,
      associateByDefault: false,
    }).loaders;
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader as ThroughAssociation;
  }

  it("carries annotate from the through reflection scope onto the through query", async () => {
    const author = await TsaAuthor.create({ name: "Bob" });
    const post = await TsaPost.create({ tsa_author_id: author.id, title: "P" });
    await TsaComment.create({ tsa_post_id: post.id, body: "C" });

    const loader = throughLoader([author], "annotatedComments");
    const scope = (loader as any)._buildThroughScope();
    expect(scope.toSql()).toContain("preload-through");

    const authors = await TsaAuthor.all().preload("annotatedComments").toArray();
    const comments = (authors[0] as any)._preloadedAssociations?.get("annotatedComments") ?? [];
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("C");
  });

  it("cascades strict loading from the preload scope onto the through query", async () => {
    const author = await TsaAuthor.create({ name: "Ann" });

    const loader = throughLoader([author], "annotatedComments", TsaComment.all().strictLoading());
    const scope = (loader as any)._buildThroughScope();
    expect(scope.isStrictLoading).toBe(true);
  });
});
