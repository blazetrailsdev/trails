/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Range, include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { InclusionValidator } from "./inclusion.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("InclusionValidationTest", () => {
  it("validates inclusion of with within option", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with lambda without arguments", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with array value", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user", "editor"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "editor" }).isValid()).toBe(true);
  });

  it("validates inclusion of date time range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["active", "inactive"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ status: "active" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates inclusion of beginless numeric range", async () => {
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("price", "integer");
        this.validates("price", { inclusion: { in: new Range(null, 1000) } });
      }
    }
    interface Topic extends Attributes {}

    expect(await new Topic({ price: -100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 0 }).isValid()).toBe(true);
    expect(await new Topic({ price: 100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 2000 }).isValid()).toBe(false);
    expect(await new Topic({ price: 1000 }).isValid()).toBe(true);
  });

  it("validates inclusion of endless numeric range", async () => {
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("price", "integer");
        this.validates("price", { inclusion: { in: new Range(0, null) } });
      }
    }
    interface Topic extends Attributes {}

    expect(await new Topic({ price: -1 }).isValid()).toBe(false);
    expect(await new Topic({ price: -100 }).isValid()).toBe(false);
    expect(await new Topic({ price: 100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 2000 }).isValid()).toBe(true);
    expect(await new Topic({ price: 0 }).isValid()).toBe(true);
  });

  it("validates inclusion of", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ karma: "ow" }).isValid()).toBe(true);
    expect(await new Person({ karma: "other" }).isValid()).toBe(false);
  });

  it("validates inclusion of with allow nil", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"], allowNil: true } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(true);
    expect(await new Person({ karma: "nope" }).isValid()).toBe(false);
  });

  it("validates inclusion of with formatted message", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow"], message: "is not allowed" } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ karma: "other" });
    await p.isValid();
    expect(p.errors.messagesFor("karma")).toContain("is not allowed");
  });

  it("validates inclusion of with lambda", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"], allowNil: false } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ role: "admin" });
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ role: "hacker" });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates inclusion of range", async () => {
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { inclusion: { in: new Range("aaa", "bbb") } });
      }
    }
    interface Topic extends Attributes {}

    expect(await new Topic({ title: "bbc" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aa" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aaab" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aaa" }).isValid()).toBe(true);
    expect(await new Topic({ title: "abc" }).isValid()).toBe(true);
    expect(await new Topic({ title: "bbb" }).isValid()).toBe(true);
  });

  it("validates inclusion of time range", async () => {
    const times = ["morning", "afternoon", "evening"];
    class Schedule extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("period", "string");
        this.validates("period", { inclusion: { in: times } });
      }
    }
    interface Schedule extends Attributes {}

    expect(await new Schedule({ period: "morning" }).isValid()).toBe(true);
    expect(await new Schedule({ period: "midnight" }).isValid()).toBe(false);
  });

  it("validates inclusion of date range", async () => {
    const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    class Schedule extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("day", "string");
        this.validates("day", { inclusion: { in: validDays } });
      }
    }
    interface Schedule extends Attributes {}

    expect(await new Schedule({ day: "monday" }).isValid()).toBe(true);
    expect(await new Schedule({ day: "saturday" }).isValid()).toBe(false);
  });

  it("validates inclusion of for ruby class", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
      }
    }
    interface Person extends Attributes {}
    Person.attribute("role", "string");
    Person.validates("role", { inclusion: { in: ["admin", "user"] } });
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "hacker" }).isValid()).toBe(false);
  });

  it("validates inclusion of with symbol", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with within alias", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { within: ["admin", "user"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of array value checks all elements", () => {
    class Item extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("tags", "string");
      }
    }
    interface Item extends Attributes {}

    const validator = new InclusionValidator({ in: ["a", "b", "c"], attributes: ["tags"] });
    const r1 = new Item();
    validator.validateEach(r1, "tags", ["a", "b"]);
    expect(r1.errors.size).toBe(0);
    const r2 = new Item();
    validator.validateEach(r2, "tags", ["a", "z"]);
    expect(r2.errors.size).toBeGreaterThan(0);
  });

  it("validates inclusion of with Set collection", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => new Set(["admin", "user"]) } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });
});
describe("inclusion allowNil", () => {
  it("validates inclusion of with allow nil", async () => {
    class WithNil extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["a", "b"], allowNil: true } });
      }
    }
    interface WithNil extends Attributes {}

    expect(await new WithNil({}).isValid()).toBe(true);
  });

  it("validates nil when allowNil is false", async () => {
    class NoNil extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["a", "b"], allowNil: false } });
      }
    }
    interface NoNil extends Attributes {}

    expect(await new NoNil({}).isValid()).toBe(false);
  });
});
