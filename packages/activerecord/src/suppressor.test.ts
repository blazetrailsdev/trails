/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    posts: { title: "string" },
    comments: { body: "string" },
    users: { name: "string" },
    widgets: { name: "string" },
    holdables: { name: "string" },
    concurrent_alphas: { name: "string" },
    concurrent_betas: { name: "string" },
    gizmos: { name: "string" },
  });
});

describe("SuppressorTest", () => {
  it("suppresses create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.suppress(async () => {
      await Post.create({ title: "suppressed" });
    });
    expect(await Post.count()).toBe(0);
  });

  it("suppresses update", async () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const widget = await Widget.create({ name: "original" });
    await Widget.suppress(async () => {
      widget.name = "changed";
      await widget.save();
    });
    const found = await Widget.find(widget.id);
    expect(found.name).toBe("original");
  });

  it("suppresses create in callback", async () => {
    class Gizmo extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.afterCreate(async function (this: any) {
          await Gizmo.suppress(async () => {
            await Gizmo.create({ name: "auto-gizmo" });
          });
        });
      }
    }
    await Widget.create({ name: "hello" });
    expect(await Gizmo.count()).toBe(0);
  });

  it("resumes saving after suppression complete", async () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Widget.suppress(async () => {
      await Widget.create({ name: "suppressed" });
    });
    await Widget.create({ name: "not suppressed" });
    expect(await Widget.count()).toBe(1);
  });

  it("suppresses validations on create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
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
    class Post extends Base {
      static {
        this.attribute("title", "string");
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
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
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
    class Widget extends Base {
      static {
        this.attribute("name", "string");
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
    class Holdable extends Base {
      static {
        this.attribute("name", "string");
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
    class ConcurrentAlpha extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ConcurrentBeta extends Base {
      static {
        this.attribute("name", "string");
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
    class Gizmo extends Base {
      static {
        this.attribute("name", "string");
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
