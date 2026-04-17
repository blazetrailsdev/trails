// AssociationRelation — writes on a relation produced by a collection
// association should route through the owner so the foreign key, inverse,
// and loaded target stay wired up. Mirrors Rails'
// ActiveRecord::AssociationRelation behavior.

import { describe, it, expect, beforeEach } from "vitest";
import { Base, association, registerModel, AssociationRelation } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("AssociationRelation", () => {
  let adapter: DatabaseAdapter;

  class ArBlog extends Base {
    declare name: string;
    static {
      this.attribute("name", "string");
    }
  }

  class ArPost extends Base {
    declare ar_blog_id: number | null;
    declare title: string;
    declare published: boolean;
    static {
      this.attribute("title", "string");
      this.attribute("published", "boolean", { default: false });
      this.attribute("ar_blog_id", "integer");
    }
  }

  ArBlog.hasMany("arPosts", { className: "ArPost" });

  beforeEach(() => {
    adapter = createTestAdapter();
    ArBlog.adapter = adapter;
    ArPost.adapter = adapter;
    registerModel(ArBlog);
    registerModel(ArPost);
  });

  async function freshBlog(): Promise<ArBlog> {
    const blog = new ArBlog({ name: "Dev" });
    await blog.save();
    return blog;
  }

  it("returns an AssociationRelation from the collection proxy", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const scope = proxy.where({ published: true });
    expect(scope).toBeInstanceOf(AssociationRelation);
  });

  it("preserves AssociationRelation through chained query methods", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const chained = proxy.where({ published: true }).order("title").limit(5);
    expect(chained).toBeInstanceOf(AssociationRelation);
  });

  it("create on an association relation sets the owner's foreign key", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const post = await proxy.where({ published: true }).create({ title: "Hello" });
    expect(post.ar_blog_id).toBe(blog.id);
    expect(post.title).toBe("Hello");
    expect(post.published).toBe(true);
    expect(post.isPersisted()).toBe(true);
  });

  it("build on an association relation sets the FK without saving", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const post = proxy.where({ published: true }).build({ title: "Draft" });
    expect(post.ar_blog_id).toBe(blog.id);
    expect(post.title).toBe("Draft");
    expect(post.published).toBe(true);
    expect(post.isNewRecord()).toBe(true);
  });

  it("pushes built records onto the loaded target", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    proxy.where({ published: true }).build({ title: "x" });
    expect(proxy.target.length).toBe(1);
    expect(proxy.target[0].title).toBe("x");
  });

  it("propagates the association reference through long chains", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const deep = proxy.where({ published: true }).order("title").limit(10).offset(0);
    const post = await deep.create({ title: "Chained" });
    expect(post.ar_blog_id).toBe(blog.id);
    expect(post.published).toBe(true);
  });

  it("exposes the owner and reflection via proxyAssociation", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    const scope = proxy.where({ published: true }) as unknown as AssociationRelation<ArPost>;
    expect(scope.proxyAssociation.owner).toBe(blog);
    expect(scope.proxyAssociation.reflection.name).toBe("arPosts");
    expect(scope.proxyAssociation.reflection.type).toBe("hasMany");
  });

  it("equals compares against a loaded array of records", async () => {
    const blog = await freshBlog();
    const proxy = association<ArPost>(blog, "arPosts");
    await proxy.create({ title: "A", published: true });
    await proxy.create({ title: "B", published: true });
    await proxy.create({ title: "C", published: false });

    const scope = proxy
      .where({ published: true })
      .order("title") as unknown as AssociationRelation<ArPost>;
    const records = await scope.toArray();
    expect(await scope.equals(records)).toBe(true);
    expect(await scope.equals([])).toBe(false);
  });

  it("createBang throws RecordInvalid via the association on validation failure", async () => {
    class ArValidatedPost extends Base {
      declare ar_blog_id: number | null;
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("ar_blog_id", "integer");
        this.validates("title", { presence: true });
      }
    }
    class ArValidatedBlog extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    ArValidatedBlog.hasMany("arValidatedPosts", { className: "ArValidatedPost" });
    ArValidatedPost.adapter = adapter;
    ArValidatedBlog.adapter = adapter;
    registerModel(ArValidatedBlog);
    registerModel(ArValidatedPost);

    const blog = new ArValidatedBlog({ name: "v" });
    await blog.save();
    const proxy = association<ArValidatedPost>(blog, "arValidatedPosts");
    const scope = proxy.where({}) as unknown as AssociationRelation<ArValidatedPost>;
    await expect(scope.createBang({ title: "" })).rejects.toThrow(/title/i);
  });

  it("marks loaded records strict-loading when the reflection opts in", async () => {
    class ArStrictBlog extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    class ArStrictPost extends Base {
      declare ar_strict_blog_id: number | null;
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("ar_strict_blog_id", "integer");
      }
    }
    ArStrictBlog.hasMany("arStrictPosts", {
      className: "ArStrictPost",
      strictLoading: true,
    });
    ArStrictBlog.adapter = adapter;
    ArStrictPost.adapter = adapter;
    registerModel(ArStrictBlog);
    registerModel(ArStrictPost);

    const blog = new ArStrictBlog({ name: "s" });
    await blog.save();
    const proxy = association<ArStrictPost>(blog, "arStrictPosts");
    await proxy.create({ title: "x" });

    const scope = proxy.where({}) as unknown as AssociationRelation<ArStrictPost>;
    const [post] = await scope.toArray();
    expect((post as any)._strictLoading).toBe(true);
  });

  it("sets inverse_of on records loaded through the relation", async () => {
    class ArInvBlog extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    class ArInvPost extends Base {
      declare ar_inv_blog_id: number | null;
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("ar_inv_blog_id", "integer");
        this.belongsTo("arInvBlog", { className: "ArInvBlog" });
      }
    }
    ArInvBlog.hasMany("arInvPosts", { className: "ArInvPost", inverseOf: "arInvBlog" });
    ArInvBlog.adapter = adapter;
    ArInvPost.adapter = adapter;
    registerModel(ArInvBlog);
    registerModel(ArInvPost);

    const blog = new ArInvBlog({ name: "inv" });
    await blog.save();
    const proxy = association<ArInvPost>(blog, "arInvPosts");
    await proxy.create({ title: "P1" });

    const scope = proxy.where({}) as unknown as AssociationRelation<ArInvPost>;
    const [post] = await scope.toArray();
    const cache = (post as any)._cachedAssociations as Map<string, unknown> | undefined;
    expect(cache?.get("arInvBlog")).toBe(blog);
  });
});
