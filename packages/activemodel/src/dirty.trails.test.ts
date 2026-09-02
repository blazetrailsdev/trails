/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

describe("Dirty across dup", () => {
  class Topic extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("title", "string");
      this.attribute("body", "string");
    }

    declare title: string | null;
    declare body: string | null;
  }
  interface Topic extends Attributes, Dirty {}

  it("dup carries the source's pending changes", () => {
    const t = new Topic({ title: "A" });
    t.changesApplied();
    t.title = "B";

    const duped = t.dup();

    expect(duped.changes).toEqual(t.changes);
    expect(duped.changes).toEqual({ title: ["A", "B"] });
    expect(duped.isChanged).toBe(true);
    expect(duped.attributeWas("title")).toEqual("A");
    expect(duped.previousChanges).toEqual(t.previousChanges);
  });

  it("writing to the dup does not dirty the source", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    duped.body = "new";

    expect(duped.changes).toEqual({ title: [null, "A"], body: [null, "new"] });
    expect(t.changes).toEqual({ title: [null, "A"] });
    expect(t.isChanged).toBe(true);
    expect(t.body).toBeNull();
  });

  it("writing to the source does not dirty the dup", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    t.body = "new";

    expect(t.changes).toEqual({ title: [null, "A"], body: [null, "new"] });
    expect(duped.changes).toEqual({ title: [null, "A"] });
    expect(duped.body).toBeNull();
  });

  it("dup of a frozen model is writable", () => {
    const t = new Topic({ title: "A" });
    t.freeze();

    const duped = t.dup();

    expect(Object.isFrozen(duped)).toBe(false);
    expect(duped.title).toBe("A");
    duped.title = "B";
    expect(duped.title).toBe("B");
    expect(duped.isChanged).toBe(true);
  });
});

describe("DirtyTest extras", () => {
  class DirtyPerson extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("color", "string");
    }
  }
  interface DirtyPerson extends Attributes, Dirty {}

  it("attributeChange returns null when attribute is unchanged", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p.changesApplied();
    expect(p.attributeChange("name")).toBeNull();
  });
});

describe("Dirty Tracking", () => {
  class Person extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }
  interface Person extends Attributes, Dirty {}

  it("not changed initially", () => {
    const p = new Person({ name: "dean", age: 30 });
    p.changesApplied();
    expect(p.isChanged).toBe(false);
    expect(p.changed).toEqual([]);
  });

  it("setting attribute will result in change", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    expect(p.isChanged).toBe(true);
    expect(p.changed).toContain("name");
  });

  it("attributeWas returns original value", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    expect(p.attributeWas("name")).toBe("dean");
  });

  it("changes to attribute values", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    expect(p.attributeChange("name")).toEqual(["dean", "sam"]);
  });

  it("list of changed attribute keys", () => {
    const p = new Person({ name: "dean", age: 30 });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    p._writeAttribute("age", 31);
    expect(p.changes).toEqual({
      name: ["dean", "sam"],
      age: [30, 31],
    });
  });

  it("setting color to same value should not result in change being recorded", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "dean");
    expect(p.isChanged).toBe(false);
  });

  it("resetting attribute", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    expect(p.isChanged).toBe(true);
    p._writeAttribute("name", "dean");
    expect(p.isChanged).toBe(false);
  });

  it("changing the same attribute multiple times retains the correct original value", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    p._writeAttribute("name", "bob");
    expect(p.attributeChange("name")).toEqual(["dean", "bob"]);
  });

  it("restore_attributes should restore all previous data", () => {
    const p = new Person({ name: "dean", age: 30 });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    p._writeAttribute("age", 99);
    p.restoreAttributes();
    expect(p._readAttribute("name")).toBe("dean");
    expect(p._readAttribute("age")).toBe(30);
    expect(p.isChanged).toBe(false);
  });

  it("saving should preserve previous changes", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    p.changesApplied();
    expect(p.isChanged).toBe(false);
    expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
  });

  it("setting new attributes should not affect previous changes", () => {
    const p = new Person({ name: "dean" });
    p.changesApplied();
    p._writeAttribute("name", "sam");
    p.changesApplied();
    p._writeAttribute("name", "bob");
    expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
    expect(p.changes).toEqual({ name: ["sam", "bob"] });
  });

  it("cast-value-aware: same cast value = no change", () => {
    class Sized extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("size", "integer");
      }
    }
    interface Sized extends Attributes, Dirty {}
    const s = new Sized({ size: "2" });
    s.changesApplied();
    s._writeAttribute("size", "2.3");
    expect(s.isChanged).toBe(false);
    s._writeAttribute("size", "5.1");
    expect(s.isChanged).toBe(true);
  });
});
describe("attributeBeforeTypeCast", () => {
  it("returns the raw value before type casting", () => {
    class Price extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("amount", "integer");
      }
    }
    interface Price extends Attributes {}

    const price = new Price({ amount: "42" });
    expect(price._readAttribute("amount")).toBe(42);
    expect(price._attributes.getAttribute("amount").valueBeforeTypeCast).toBe("42");
  });

  it("tracks raw values on writeAttribute", () => {
    class Price extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("amount", "integer");
      }
    }
    interface Price extends Attributes {}

    const price = new Price({ amount: 10 });
    price._writeAttribute("amount", "99");
    expect(price._readAttribute("amount")).toBe(99);
    expect(price._attributes.getAttribute("amount").valueBeforeTypeCast).toBe("99");
  });
});

describe("clearChangesInformation", () => {
  it("clear_changes_information should reset all changes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes, Dirty {}

    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied();
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    expect(Object.keys(p.previousChanges).length).toBeGreaterThan(0);

    p._writeAttribute("age", 31);
    expect(p.isChanged).toBe(true);

    p.clearChangesInformation();
    expect(p.isChanged).toBe(false);
    expect(Object.keys(p.previousChanges).length).toBe(0);
  });
});
describe("clearAttributeChanges clears forced-dirty state", () => {
  it("force-dirtied attribute is no longer dirty after clearAttributeChanges — forced flag must not leak", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m.attributeWillChangeBang("ratio");
    expect(m.changed).toContain("ratio");

    m.clearAttributeChanges(["ratio"]);
    m._writeAttribute("ratio", NaN);
    expect(m.changed).not.toContain("ratio");
  });
});

describe("clearAttributeChanges", () => {
  it("clears changes for specific attributes only", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes, Dirty {}

    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied();
    p._writeAttribute("name", "Bob");
    p._writeAttribute("age", 31);
    expect(p.changed).toContain("name");
    expect(p.changed).toContain("age");

    p.clearAttributeChanges(["name"]);
    expect(p.changed).not.toContain("name");
    expect(p.changed).toContain("age");
  });
});

describe("attributeChanged with from/to options", () => {
  it("returns true when from/to match the change", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    expect(u.attributeChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
  });

  it("returns false when from does not match", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    expect(u.attributeChanged("name", { from: "Charlie", to: "Bob" })).toBe(false);
  });

  it("returns false when to does not match", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    expect(u.attributeChanged("name", { from: "Alice", to: "Charlie" })).toBe(false);
  });

  it("supports only from option", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    expect(u.attributeChanged("name", { from: "Alice" })).toBe(true);
    expect(u.attributeChanged("name", { from: "Wrong" })).toBe(false);
  });

  it("supports only to option", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    expect(u.attributeChanged("name", { to: "Bob" })).toBe(true);
    expect(u.attributeChanged("name", { to: "Wrong" })).toBe(false);
  });
});

describe("attributePreviouslyChanged / attributePreviouslyWas", () => {
  it("attributePreviouslyChanged returns true for attributes changed in last save", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    u.changesApplied();
    expect(u.attributePreviouslyChanged("name")).toBe(true);
  });

  it("attributePreviouslyChanged supports from/to options", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    u.changesApplied();
    expect(u.attributePreviouslyChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(u.attributePreviouslyChanged("name", { to: "Charlie" })).toBe(false);
  });

  it("attributePreviouslyWas returns value before last save", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u._writeAttribute("name", "Bob");
    u.changesApplied();
    expect(u.attributePreviouslyWas("name")).toBe("Alice");
  });
});

describe("numeric type.isChanged integration via dirty tracking", () => {
  it("integer attribute set to non-numeric string still appears in changes — number_to_non_number? path", () => {
    class Item extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Item extends Attributes, Dirty {}
    Item.attribute("count", "integer");

    const item = new Item({ count: 10 });
    item.changesApplied();
    item._writeAttribute("count", "abc");
    expect(item.changed).toContain("count");
  });

  it("force-change is cleared by restoreAttributes — forced flag must not survive restore", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m.attributeWillChangeBang("ratio");
    expect(m.changed).toContain("ratio");

    m.restoreAttributes();
    m._writeAttribute("ratio", NaN);
    expect(m.changed).not.toContain("ratio");
  });

  it("force-change is cleared by changesApplied — forced state must not leak across save boundaries", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m.attributeWillChangeBang("ratio");
    expect(m.changed).toContain("ratio");

    m.changesApplied();
    m._writeAttribute("ratio", NaN);
    expect(m.changed).not.toContain("ratio");
  });

  it("force-change survives a subsequent type-equal write — NaN-to-NaN case", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m.attributeWillChangeBang("ratio");
    m._writeAttribute("ratio", NaN);
    expect(m.changed).toContain("ratio");
    expect(m.changes["ratio"]).toEqual([NaN, NaN]);
  });

  it("float attribute NaN-to-NaN does NOT appear in changes — equal_nan? exemption", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m._writeAttribute("ratio", NaN);
    expect(m.changed).not.toContain("ratio");
    expect(m.changes).not.toHaveProperty("ratio");
  });

  it("integer same-cast-value write via boolean raw is still dirty — number_to_non_number? path at model level", () => {
    class Item extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Item extends Attributes, Dirty {}
    Item.attribute("count", "integer");

    const item = new Item({ count: 1 });
    item.changesApplied();
    item._writeAttribute("count", true);
    expect(item.changed).toContain("count");
  });

  it("float attribute NaN → non-NaN → NaN clears dirty state on revert", () => {
    class Metric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface Metric extends Attributes, Dirty {}
    Metric.attribute("ratio", "float");

    const m = new Metric({ ratio: NaN });
    m.changesApplied();
    m._writeAttribute("ratio", 1.0);
    expect(m.changed).toContain("ratio");
    m._writeAttribute("ratio", NaN);
    expect(m.changed).not.toContain("ratio");
  });
});

describe("Dirty readers do not resolve attribute aliases", () => {
  class Pirate extends Model {
    declare static attribute: AttributesClassHalf["attribute"];
    declare static aliasAttribute: (newName: string, oldName: string) => void;
    declare nomChanged: () => boolean;

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("name", "string");
      this.aliasAttribute("nom", "name");
    }
    constructor(attrs: Record<string, unknown> = {}) {
      super(attrs);
    }
  }
  interface Pirate extends Attributes, Dirty {}

  it("attributeChanged does not resolve an alias, while the generated reader does", () => {
    const pirate = new Pirate();
    pirate._writeAttribute("name", "Blackbeard");

    expect(pirate.attributeChanged("name")).toBe(true);
    expect(pirate.attributeChanged("nom")).toBe(false);
    expect(pirate.nomChanged()).toBe(true);
  });
});
