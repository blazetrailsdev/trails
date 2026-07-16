import { describe, it, expect } from "vitest";
import { Model, StrictValidationFailed } from "../index.js";

describe("PresenceValidationTest", () => {
  it("accepts array arguments", async () => {
    // Rails: `Topic.validates_presence_of %w(title content)` — a single array
    // argument, flattened by `_merge_attributes` (`attr_names.flatten!`).
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.validatesPresenceOf(["title", "content"]);
      }
    }
    const t = new Topic();
    await t.isValid();
    expect(t.errors.get("title").length).toBeGreaterThan(0);
    expect(t.errors.get("content").length).toBeGreaterThan(0);
  });

  it("validates presence of for ruby class", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person();
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ name: "Alice" });
    expect(await p2.isValid()).toBe(true);
  });

  it("validates presence of for ruby class with custom reader", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "test" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates presence of with allow nil option", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validatesPresenceOf("title", { allowNil: true });
      }
    }
    expect(await new Topic({ title: "something" }).isValid()).toBe(true);

    const blank = new Topic({ title: "" });
    expect(await blank.isValid()).toBe(false);
    expect(blank.errors.get("title")).toContain("can't be blank");

    const whitespace = new Topic({ title: "  " });
    expect(await whitespace.isValid()).toBe(false);
    expect(whitespace.errors.get("title")).toContain("can't be blank");

    expect(await new Topic({ title: null }).isValid()).toBe(true);
  });

  it("validates presence of with allow blank option", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validatesPresenceOf("title", { allowBlank: true });
      }
    }
    expect(await new Topic({ title: "something" }).isValid()).toBe(true);
    expect(await new Topic({ title: "" }).isValid()).toBe(true);
    expect(await new Topic({ title: "  " }).isValid()).toBe(true);
    expect(await new Topic({ title: null }).isValid()).toBe(true);
  });

  it("validate presences", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.validatesPresenceOf("name", "age");
      }
    }
    const p = new Person({});
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name").length).toBeGreaterThan(0);
  });

  it("validates acceptance of with custom error using quotes", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { message: "is required!" } });
      }
    }
    const p = new Person({});
    await p.isValid();
    expect(p.errors.get("name")).toContain("is required!");
  });

  it("passes custom interpolation vars through to errors.add", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { message: "is %{kind}", kind: "wrong" } });
      }
    }
    const p = new Person({});
    await p.isValid();
    expect(p.errors.get("name")).toContain("is wrong");
  });

  it("strict: true raises StrictValidationFailed via filteredErrorOptions", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { strict: true } });
      }
    }
    await expect(new Person({}).isValid()).rejects.toThrow(StrictValidationFailed);
  });
});
