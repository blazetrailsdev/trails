import { describe, it, expect, vi } from "vitest";
import { Base } from "./index.js";
import { Type, UserProvidedDefault } from "@blazetrails/activemodel";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("DefineAttributeTest", () => {
  it("define_attribute registers a type object directly", () => {
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({ score: "42" });
    expect(p.readAttribute("score")).toBe(42);
  });

  it("define_attribute with default value", () => {
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("rating", intType, { default: 5 });
      }
    }
    const p = new Post({});
    expect(p.readAttribute("rating")).toBe(5);
  });

  it("define_attribute preserves existing default when no default given", () => {
    const strType = Type.lookup("string");
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", strType, { default: "10" });
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({});
    expect(p.readAttribute("score")).toBe(10);
  });

  it("define_attribute with userProvidedDefault false uses database cast", () => {
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("views", intType, { default: "0", userProvidedDefault: false });
      }
    }
    const p = new Post({});
    expect(p.readAttribute("views")).toBe(0);
  });

  it("define_attribute builds a UserProvidedDefault when the default is user-provided", () => {
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", intType, { default: "5" });
      }
    }
    expect(Post._defaultAttributes().getAttribute("score")).toBeInstanceOf(UserProvidedDefault);
    expect(Post._defaultAttributes().getAttribute("score").originalAttribute).toBeNull();
  });

  it("define_attribute writes into the memoized _defaultAttributes", () => {
    const strType = Type.lookup("string");
    const intType = Type.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", strType);
      }
    }
    const before = Post._defaultAttributes();
    Post.defineAttribute("score", intType);
    expect(Post._defaultAttributes()).toBe(before);
    expect(before.getAttribute("score").type!.type()).toBe("integer");
    expect(Post.typeForAttribute("score")!.type()).toBe("integer");
  });
});

describe("DefaultAttributesTest", () => {
  it("_default_attributes returns an AttributeSet", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    const defaults = Post._defaultAttributes();
    expect(typeof defaults.fetchValue).toBe("function");
  });

  it("_default_attributes includes declared attributes", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string", { default: "Untitled" });
      }
    }
    const defaults = Post._defaultAttributes();
    expect(defaults.fetchValue("title")).toBe("Untitled");
  });

  it("_default_attributes is cached", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post._defaultAttributes()).toBe(Post._defaultAttributes());
  });

  it("_default_attributes cache is invalidated when attribute is defined", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    const first = Post._defaultAttributes();
    Post.attribute("body", "string");
    const second = Post._defaultAttributes();
    expect(first).not.toBe(second);
    expect(second.fetchValue("body")).toBeNull();
  });

  it("new record attributes are seeded from _default_attributes", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("status", "string", { default: "draft" });
      }
    }
    const p = new Post({});
    expect(p.status).toBe("draft");
  });

  it("_defaultAttributes seeds schema columns via fromDatabase then replays user pending queue", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("title", "string", { default: "untitled" });
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      views: { name: "views", default: 0 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("views").value()).toBe(0);
    expect(defaults.getAttribute("title").value()).toBe("untitled");
  });

  it("user attribute() declaration overrides schema column type via pending queue", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("score", "string");
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 0 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("score").type!.type()).toBe("string");
  });

  it("resetDefaultAttributes reloads the schema from cache", () => {
    class Post extends Base {
      declare status: string;
    }
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 5 },
    };
    (Post as unknown as { _schemaLoaded?: boolean })._schemaLoaded = true;

    Post.resetDefaultAttributes();

    expect((Post as unknown as { _columnsHash?: unknown })._columnsHash).toBeUndefined();
    expect((Post as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBe(false);
  });

  it("attribute() overriding only type preserves the schema default", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("score", "string");
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 5 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("score").type!.type()).toBe("string");
    expect(defaults.getAttribute("score").value()).toBe("5");
  });
});

describe("DefineAttributeSTITest", () => {
  it("defineAttribute on STI subclass stays on the subclass", () => {
    const intType = Type.lookup("integer");
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.inheritanceColumn = "type";
      }
    }
    class Dog extends Animal {}
    Dog.defineAttribute("legs", intType, { default: 4 });
    expect(Dog._defaultAttributes().isKey("legs")).toBe(true);
    expect(Animal._defaultAttributes().isKey("legs")).toBe(false);
    const d = new Dog({});
    expect(d.readAttribute("legs")).toBe(4);
  });

  it("_defaultAttributes is memoized per class, not shared with the STI base", () => {
    class Vehicle extends Base {
      static {
        this.attribute("speed", "integer", { default: 60 });
      }
    }
    class Car extends Vehicle {}
    const baseDefaults = Vehicle._defaultAttributes();
    const subDefaults = Car._defaultAttributes();
    expect(subDefaults).not.toBe(baseDefaults);
    expect(subDefaults.keys()).toEqual(baseDefaults.keys());
    expect(subDefaults.fetchValue("speed")).toBe(60);
  });

  it("defineAttribute for id does not install an accessor", () => {
    const strType = Type.lookup("string");
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    Post.defineAttribute("id", strType);
    const ownDesc = Object.getOwnPropertyDescriptor(Post.prototype, "id");
    expect(ownDesc).toBeUndefined();
  });
});

describe("ResetDefaultAttributesCascadeTest", () => {
  it("adding an attribute to a superclass invalidates an AR subclass _defaultAttributes cache", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    class SpecialPost extends Post {}

    const before = SpecialPost._defaultAttributes();
    expect(before.keys()).toContain("title");
    expect(before.keys()).not.toContain("score");

    Post.attribute("score", "integer", { default: 0 });

    const after = SpecialPost._defaultAttributes();
    expect(after.keys()).toContain("score");
    expect(after.getAttribute("score").value()).toBe(0);
  });
});
