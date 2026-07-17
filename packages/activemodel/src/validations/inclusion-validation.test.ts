import { describe, it, expect } from "vitest";
import { makeRange } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { InclusionValidator } from "./inclusion.js";

describe("InclusionValidationTest", () => {
  it("validates inclusion of with within option", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with lambda without arguments", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with array value", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user", "editor"] } });
      }
    }
    expect(await new Person({ role: "editor" }).isValid()).toBe(true);
  });

  it("validates inclusion of date time range", async () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["active", "inactive"] } });
      }
    }
    const p = new Person({ status: "active" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates inclusion of beginless numeric range", async () => {
    class Topic extends Model {
      static {
        this.attribute("price", "integer");
        this.validates("price", { inclusion: { in: makeRange(null, 1000) } });
      }
    }
    expect(await new Topic({ price: -100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 0 }).isValid()).toBe(true);
    expect(await new Topic({ price: 100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 2000 }).isValid()).toBe(false);
    expect(await new Topic({ price: 1000 }).isValid()).toBe(true);
  });

  it("validates inclusion of endless numeric range", async () => {
    class Topic extends Model {
      static {
        this.attribute("price", "integer");
        this.validates("price", { inclusion: { in: makeRange(0, null) } });
      }
    }
    expect(await new Topic({ price: -1 }).isValid()).toBe(false);
    expect(await new Topic({ price: -100 }).isValid()).toBe(false);
    expect(await new Topic({ price: 100 }).isValid()).toBe(true);
    expect(await new Topic({ price: 2000 }).isValid()).toBe(true);
    expect(await new Topic({ price: 0 }).isValid()).toBe(true);
  });

  it("validates inclusion of", async () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
      }
    }
    expect(await new Person({ karma: "ow" }).isValid()).toBe(true);
    expect(await new Person({ karma: "other" }).isValid()).toBe(false);
  });

  it("validates inclusion of with allow nil", async () => {
    // Mirrors Rails inclusion_validation_test.rb:100-106 — allow_nil: true
    // skips nil; non-nil values still validate against the set.
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"], allowNil: true } });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
    expect(await new Person({ karma: "nope" }).isValid()).toBe(false);
  });

  it("validates inclusion of with formatted message", async () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow"], message: "is not allowed" } });
      }
    }
    const p = new Person({ karma: "other" });
    await p.isValid();
    expect(p.errors.get("karma")).toContain("is not allowed");
  });

  it("validates inclusion of with lambda", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"], allowNil: false } });
      }
    }
    const p = new Person({ role: "admin" });
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ role: "hacker" });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates inclusion of range", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { inclusion: { in: makeRange("aaa", "bbb") } });
      }
    }
    expect(await new Topic({ title: "bbc" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aa" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aaab" }).isValid()).toBe(false);
    expect(await new Topic({ title: "aaa" }).isValid()).toBe(true);
    expect(await new Topic({ title: "abc" }).isValid()).toBe(true);
    expect(await new Topic({ title: "bbb" }).isValid()).toBe(true);
  });

  it("validates inclusion of time range", async () => {
    // Use array of specific time values
    const times = ["morning", "afternoon", "evening"];
    class Schedule extends Model {
      static {
        this.attribute("period", "string");
        this.validates("period", { inclusion: { in: times } });
      }
    }
    expect(await new Schedule({ period: "morning" }).isValid()).toBe(true);
    expect(await new Schedule({ period: "midnight" }).isValid()).toBe(false);
  });

  it("validates inclusion of date range", async () => {
    const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    class Schedule extends Model {
      static {
        this.attribute("day", "string");
        this.validates("day", { inclusion: { in: validDays } });
      }
    }
    expect(await new Schedule({ day: "monday" }).isValid()).toBe(true);
    expect(await new Schedule({ day: "saturday" }).isValid()).toBe(false);
  });

  it("validates inclusion of for ruby class", async () => {
    class Person extends Model {}
    Person.attribute("role", "string");
    Person.validates("role", { inclusion: { in: ["admin", "user"] } });
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "hacker" }).isValid()).toBe(false);
  });

  it("validates inclusion of with symbol", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with within alias", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { within: ["admin", "user"] } });
      }
    }
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of array value checks all elements", () => {
    class Item extends Model {
      static {
        this.attribute("tags", "string");
      }
    }
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
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => new Set(["admin", "user"]) } });
      }
    }
    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "guest" }).isValid()).toBe(false);
  });
});
describe("inclusion allowNil", () => {
  it("validates inclusion of with allow nil", async () => {
    // Mirrors Rails inclusion_validation_test.rb#test_validates_inclusion_of_with_allow_nil
    // which sets `allow_nil: true` explicitly.
    class WithNil extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["a", "b"], allowNil: true } });
      }
    }
    expect(await new WithNil({}).isValid()).toBe(true);
  });

  it("validates nil when allowNil is false", async () => {
    class NoNil extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["a", "b"], allowNil: false } });
      }
    }
    expect(await new NoNil({}).isValid()).toBe(false);
  });
});
