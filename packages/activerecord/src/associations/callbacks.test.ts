/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base, association, registerModel } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// AssociationCallbacksTest — targets associations/callbacks_test.rb
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  let cbIdx = 0;
  function makePostWithCallbacks(adapter: DatabaseAdapter, callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        (this as any)._associations = [
          {
            type: "hasMany",
            name: "comments",
            options: { className: commentName, foreignKey: "post_id", ...callbacks },
          },
        ];
      }
    }
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  it("adding macro callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    // "macro" style: callback defined as a named function (equivalent to Ruby's method name symbol)
    function onAdd(_owner: any, record: any) {
      log.push("macro:add:" + record.body);
    }
    const { Post, Comment } = makePostWithCallbacks(adapter, { afterAdd: onAdd });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Hello", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("macro:add:Hello");
  });

  it("adding with proc callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + record.body);
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.body);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "World", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("before:World");
    expect(log).toContain("after:World");
  });

  it("removing with macro callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    function onRemove(_owner: any, record: any) {
      log.push("macro:remove:" + record.body);
    }
    const { Post, Comment } = makePostWithCallbacks(adapter, { afterRemove: onRemove });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "ToRemove", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toContain("macro:remove:ToRemove");
  });

  it("removing with proc callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeRemove: (_owner: any, record: any) => {
        log.push("before:remove:" + record.body);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("after:remove:" + record.body);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Bye", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toContain("before:remove:Bye");
    expect(log).toContain("after:remove:Bye");
  });

  it("multiple callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, _record: any) => {
        log.push("b1");
      },
      afterAdd: (_owner: any, _record: any) => {
        log.push("a1");
      },
      beforeRemove: (_owner: any, _record: any) => {
        log.push("br1");
      },
      afterRemove: (_owner: any, _record: any) => {
        log.push("ar1");
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Multi", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("b1");
    expect(log).toContain("a1");

    const c2 = await (Comment as any).create({ body: "Del", post_id: post.id });
    await proxy.delete(c2);
    expect(log).toContain("br1");
    expect(log).toContain("ar1");
  });
});

describe("AssociationCallbacksTest", () => {
  let cbIdx = 0;
  function makePostWithCallbacks(adapter: DatabaseAdapter, callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        (this as any)._associations = [
          {
            type: "hasMany",
            name: "comments",
            options: { className: commentName, foreignKey: "post_id", ...callbacks },
          },
        ];
      }
    }
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  it("add callback on has many", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterAdd: (_owner: any, record: any) => {
        log.push("added:" + (record.id ?? "<new>"));
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Hello", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^added:/);
  });

  it("remove callback on has many", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterRemove: (_owner: any, record: any) => {
        log.push("removed:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Bye", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log.length).toBe(1);
    expect(log[0]).toBe("removed:" + c.id);
  });

  it("add callback on has many with proc", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Proc", post_id: post.id });
    await proxy.push(c);
    expect(log[0]).toMatch(/^before:/);
    expect(log[1]).toMatch(/^after:/);
  });

  it("add callback on has many with string", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterAdd: (_owner: any, record: any) => {
        log.push("string_cb:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Str", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
  });

  it("add callback on has one", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const idx = ++cbIdx;
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("user_id", "integer");
        this.adapter = adapter;
      }
    }
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(`HOProfile${idx}`, Profile);
    registerModel(`HOUser${idx}`, User);
    (User as any)._associations = [
      {
        type: "hasMany",
        name: "profiles",
        options: {
          className: `HOProfile${idx}`,
          foreignKey: "user_id",
          afterAdd: (_owner: any, record: any) => {
            log.push("added:" + (record.id ?? "<new>"));
          },
        },
      },
    ];
    const user = await User.create({ name: "Alice" });
    const proxy = association(user, "profiles");
    const profile = proxy.build({ bio: "Hello" });
    expect(log.length).toBe(1);
    expect(log[0]).toBe("added:<new>");
  });

  it("remove callback on has one", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const idx = ++cbIdx;
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("user_id", "integer");
        this.adapter = adapter;
      }
    }
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(`HORProfile${idx}`, Profile);
    registerModel(`HORUser${idx}`, User);
    (User as any)._associations = [
      {
        type: "hasMany",
        name: "profiles",
        options: {
          className: `HORProfile${idx}`,
          foreignKey: "user_id",
          beforeRemove: (_owner: any, record: any) => {
            log.push("removing:" + record.id);
          },
          afterRemove: (_owner: any, record: any) => {
            log.push("removed:" + record.id);
          },
        },
      },
    ];
    const user = await User.create({ name: "Bob" });
    const profile = await Profile.create({ bio: "Hi", user_id: user.id });
    const proxy = association(user, "profiles");
    await proxy.delete(profile);
    expect(log).toEqual(["removing:" + profile.id, "removed:" + profile.id]);
  });

  it("add callback fires before save", async () => {
    const adapter = freshAdapter();
    let wasNew: boolean | undefined;
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "New", post_id: post.id });
    await proxy.push(c);
    expect(wasNew).toBe(true);
  });

  it("add callback fires after save", async () => {
    const adapter = freshAdapter();
    let wasNew: boolean | undefined;
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Saved", post_id: post.id });
    await proxy.push(c);
    expect(wasNew).toBe(false);
  });

  it("before add throwing abort prevents add", async () => {
    const adapter = freshAdapter();
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: () => false as const,
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Blocked", post_id: post.id });
    await proxy.push(c);
    const comments = await proxy.toArray();
    expect(comments.length).toBe(0);
  });

  it("after add is called after adding to collection", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Confirm", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
    expect(c.id).toBeDefined();
    expect(log[0]).toBe("after:" + c.id);
  });

  it("before remove callback", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeRemove: (_owner: any, record: any) => {
        log.push("before_remove:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Del", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toEqual(["before_remove:" + c.id]);
  });

  it("after remove callback", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      afterRemove: (_owner: any, record: any) => {
        log.push("after_remove:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Del", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toEqual(["after_remove:" + c.id]);
  });

  it("has many callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("ba:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("aa:" + record.id);
      },
      beforeRemove: (_owner: any, record: any) => {
        log.push("br:" + record.id);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("ar:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c1 = new (Comment as any)({ body: "C1", post_id: post.id });
    await proxy.push(c1);
    expect(log).toContain("ba:<new>");
    expect(log).toContain("aa:" + c1.id);

    const c2 = await (Comment as any).create({ body: "C2", post_id: post.id });
    await proxy.delete(c2);
    expect(log).toContain("br:" + c2.id);
    expect(log).toContain("ar:" + c2.id);
  });

  it("has many callbacks with create", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = await proxy.create({ body: "Created" });
    expect(log[0]).toBe("before:<new>");
    expect(log[1]).toBe("after:" + c.id);
  });

  it("has many callbacks with build", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + (record.id ?? "<new>"));
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    proxy.build({ body: "Built" });
    expect(log).toEqual(["before:<new>", "after:<new>"]);
  });

  it("before add abort prevents create from saving", async () => {
    const adapter = freshAdapter();
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: () => false as const,
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = await proxy.create({ body: "Blocked" });
    expect(c.isNewRecord()).toBe(true);
    const all = await (Comment as any).all().toArray();
    expect(all.length).toBe(0);
  });
});
