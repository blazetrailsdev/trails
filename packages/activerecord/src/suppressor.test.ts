/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("SuppressorTest", () => {
  it("suppresses create", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.suppress(async () => {
      await Post.create({ title: "suppressed" });
    });
    expect(await Post.count()).toBe(0);
  });

  it("suppresses update", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = await Post.create({ title: "original" });
    await Post.suppress(async () => {
      post.title = "changed";
      await post.save();
    });
    const found = await Post.find(post.id);
    expect(found.title).toBe("original");
  });

  it("suppresses create in callback", async () => {
    const adapter = freshAdapter();
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.afterCreate(async function (this: any) {
          await Comment.suppress(async () => {
            await Comment.create({ body: "auto-comment" });
          });
        });
      }
    }
    await Post.create({ title: "hello" });
    expect(await Comment.count()).toBe(0);
  });

  it("resumes saving after suppression complete", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.suppress(async () => {
      await Post.create({ title: "suppressed" });
    });
    await Post.create({ title: "not suppressed" });
    expect(await Post.count()).toBe(1);
  });

  it("suppresses validations on create", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.validates("title", { presence: true });
      }
    }
    await Post.suppress(async () => {
      // Even with invalid data, suppress should not persist
      await Post.create({ title: "" });
    });
    expect(await Post.count()).toBe(0);
  });

  it("suppresses when nested multiple times", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.suppress(async () => {
      await Post.suppress(async () => {
        await Post.create({ title: "nested" });
      });
    });
    expect(await Post.count()).toBe(0);
  });
});

describe("suppress()", () => {
  it("prevents records from being persisted to database", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.suppress(async () => {
      const user = await User.create({ name: "Ghost" });
      // Record appears saved locally
      expect(user.isNewRecord()).toBe(false);
    });

    // But nothing in the database
    const all = await User.all().toArray();
    expect(all.length).toBe(0);
  });
});

describe("Suppressor.registry", () => {
  it("returns the suppression registry", () => {
    const registry = Base.registry;
    expect(registry).toBeDefined();
    expect(typeof registry).toBe("object");
  });

  it("registry reflects active suppression by class name", async () => {
    const adapter = freshAdapter();
    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(Base.registry.Widget).toBeFalsy();

    await Widget.suppress(async () => {
      expect(Base.registry.Widget).toBeTruthy();
    });

    expect(Base.registry.Widget).toBeFalsy();
  });

  it("returns the same object on consecutive calls in the same scope", () => {
    // Outside any suppress scope: fallback registry — same identity.
    expect(Base.registry).toBe(Base.registry);
  });

  it("a held reference inside the scope observes the active suppression", async () => {
    const adapter = freshAdapter();
    class Holdable extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Holdable.suppress(async () => {
      // Reference captured *inside* the scope — sees the scope's registry.
      const reg = Base.registry;
      expect(reg.Holdable).toBe(true);
    });
    expect(Base.registry.Holdable).toBeFalsy();
  });

  it("isolates registry state across concurrent suppress blocks", async () => {
    const adapter = freshAdapter();
    class ConcurrentAlpha extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class ConcurrentBeta extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(Base.registry.ConcurrentAlpha).toBeFalsy();
    expect(Base.registry.ConcurrentBeta).toBeFalsy();

    await Promise.all([
      ConcurrentAlpha.suppress(async () => {
        await Promise.resolve();
        expect(Base.registry.ConcurrentAlpha).toBe(true);
        expect(Base.registry.ConcurrentBeta).toBeFalsy();
      }),
      ConcurrentBeta.suppress(async () => {
        await Promise.resolve();
        expect(Base.registry.ConcurrentBeta).toBe(true);
        expect(Base.registry.ConcurrentAlpha).toBeFalsy();
      }),
    ]);

    expect(Base.registry.ConcurrentAlpha).toBeFalsy();
    expect(Base.registry.ConcurrentBeta).toBeFalsy();
  });

  it("registry stays truthy across nested suppress blocks", async () => {
    const adapter = freshAdapter();
    class Gizmo extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await Gizmo.suppress(async () => {
      expect(Base.registry.Gizmo).toBeTruthy();
      await Gizmo.suppress(async () => {
        expect(Base.registry.Gizmo).toBeTruthy();
      });
      expect(Base.registry.Gizmo).toBeTruthy();
    });
    expect(Base.registry.Gizmo).toBeFalsy();
  });
});
