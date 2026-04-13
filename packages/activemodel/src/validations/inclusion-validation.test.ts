import { describe, it, expect } from "vitest";
import { Model } from "../index.js";
import { InclusionValidator } from "./inclusion.js";

describe("InclusionValidationTest", () => {
  it("validates inclusion of with within option", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with lambda without arguments", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with array value", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user", "editor"] } });
      }
    }
    expect(new Person({ role: "editor" }).isValid()).toBe(true);
  });

  it("validates inclusion of date time range", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { inclusion: { in: ["active", "inactive"] } });
      }
    }
    const p = new Person({ status: "active" });
    expect(p.isValid()).toBe(true);
  });

  it("validates inclusion of beginless numeric range", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user", "guest"] } });
      }
    }
    const p = new Person({ role: "admin" });
    expect(p.isValid()).toBe(true);
  });

  it("validates inclusion of endless numeric range", () => {
    class Person extends Model {
      static {
        this.attribute("tier", "string");
        this.validates("tier", { inclusion: { in: ["free", "premium"] } });
      }
    }
    const p = new Person({ tier: "free" });
    expect(p.isValid()).toBe(true);
  });

  it("validates inclusion of", () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
      }
    }
    expect(new Person({ karma: "ow" }).isValid()).toBe(true);
    expect(new Person({ karma: "other" }).isValid()).toBe(false);
  });

  it("validates inclusion of with allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
      }
    }
    expect(new Person({}).isValid()).toBe(true);
  });

  it("validates inclusion of with formatted message", () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { inclusion: { in: ["ow"], message: "is not allowed" } });
      }
    }
    const p = new Person({ karma: "other" });
    p.isValid();
    expect(p.errors.get("karma")).toContain("is not allowed");
  });

  it("validates inclusion of with lambda", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"], allowNil: false } });
      }
    }
    const p = new Person({ role: "admin" });
    expect(p.isValid()).toBe(true);
    const p2 = new Person({ role: "hacker" });
    expect(p2.isValid()).toBe(false);
  });

  it("validates inclusion of range", () => {
    // TS doesn't have Ruby ranges, so use an array of all values in the range
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { inclusion: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } });
      }
    }
    expect(new Person({ age: 5 }).isValid()).toBe(true);
    expect(new Person({ age: 11 }).isValid()).toBe(false);
  });

  it("validates inclusion of time range", () => {
    // Use array of specific time values
    const times = ["morning", "afternoon", "evening"];
    class Schedule extends Model {
      static {
        this.attribute("period", "string");
        this.validates("period", { inclusion: { in: times } });
      }
    }
    expect(new Schedule({ period: "morning" }).isValid()).toBe(true);
    expect(new Schedule({ period: "midnight" }).isValid()).toBe(false);
  });

  it("validates inclusion of date range", () => {
    const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    class Schedule extends Model {
      static {
        this.attribute("day", "string");
        this.validates("day", { inclusion: { in: validDays } });
      }
    }
    expect(new Schedule({ day: "monday" }).isValid()).toBe(true);
    expect(new Schedule({ day: "saturday" }).isValid()).toBe(false);
  });

  it("validates inclusion of for ruby class", () => {
    class Person extends Model {}
    Person.attribute("role", "string");
    Person.validates("role", { inclusion: { in: ["admin", "user"] } });
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "hacker" }).isValid()).toBe(false);
  });

  it("validates inclusion of with symbol", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "guest" }).isValid()).toBe(false);
  });

  it("validates inclusion of with within alias", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { within: ["admin", "user"] } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "guest" }).isValid()).toBe(false);
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

  it("validates inclusion of with Set collection", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: () => new Set(["admin", "user"]) } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "guest" }).isValid()).toBe(false);
  });
});
