import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ExclusionValidationTest", () => {
  it("validates exclusion of with lambda without arguments", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: () => ["banned"] } });
      }
    }
    expect(new Person({ role: "admin" }).isValid()).toBe(true);
    expect(new Person({ role: "banned" }).isValid()).toBe(false);
  });

  it("validates exclusion of beginless numeric range", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: ["banned"] } });
      }
    }
    const p = new Person({ role: "user" });
    expect(p.isValid()).toBe(true);
  });

  it("validates exclusion of endless numeric range", () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: ["banned"] } });
      }
    }
    const p = new Person({ role: "admin" });
    expect(p.isValid()).toBe(true);
  });

  it("validates exclusion of with time range", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: ["deleted", "archived"] } });
      }
    }
    const p = new Person({ status: "active" });
    expect(p.isValid()).toBe(true);
  });

  it("validates exclusion of", () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { exclusion: { in: ["ow", "ar"] } });
      }
    }
    expect(new Person({ karma: "ow" }).isValid()).toBe(false);
    expect(new Person({ karma: "other" }).isValid()).toBe(true);
  });

  it("validates exclusion of with formatted message", () => {
    class Person extends Model {
      static {
        this.attribute("karma", "string");
        this.validates("karma", { exclusion: { in: ["ow"], message: "is not allowed" } });
      }
    }
    const p = new Person({ karma: "ow" });
    p.isValid();
    expect(p.errors.get("karma")).toContain("is not allowed");
  });

  it("validates exclusion of with lambda", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: () => ["banned", "suspended"] } });
      }
    }
    const p = new Person({ status: "banned" });
    expect(p.isValid()).toBe(false);
    const p2 = new Person({ status: "active" });
    expect(p2.isValid()).toBe(true);
  });

  it("validates exclusion of with within option", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { exclusion: { within: ["banned", "suspended"] } });
      }
    }
    expect(new Person({ status: "active" }).isValid()).toBe(true);
    expect(new Person({ status: "banned" }).isValid()).toBe(false);
  });

  it("validates exclusion of for ruby class", () => {
    class Person extends Model {}
    Person.attribute("username", "string");
    Person.validates("username", { exclusion: { in: ["admin", "root"] } });
    expect(new Person({ username: "dean" }).isValid()).toBe(true);
    expect(new Person({ username: "admin" }).isValid()).toBe(false);
  });

  it("validates exclusion of with range", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: ["deleted", "banned", "suspended"] } });
      }
    }
    expect(new Person({ status: "active" }).isValid()).toBe(true);
    expect(new Person({ status: "deleted" }).isValid()).toBe(false);
  });

  it("validates inclusion of with symbol", () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: () => ["banned"] } });
      }
    }
    expect(new Person({ status: "active" }).isValid()).toBe(true);
    expect(new Person({ status: "banned" }).isValid()).toBe(false);
  });
});
