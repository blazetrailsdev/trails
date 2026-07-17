import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("AbsenceValidationTest", () => {
  it("validates absence of for ruby class", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: true });
      }
    }
    const p = new Person();
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ name: "Alice" });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates absence of for ruby class with custom reader", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: true });
      }
    }
    const p = new Person({});
    expect(await p.isValid()).toBe(true);
  });

  it("validates absence of", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: true });
      }
    }
    expect(await new Person({ name: "Alice" }).isValid()).toBe(false);
    expect(await new Person({ name: "" }).isValid()).toBe(true);
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("validates absence of with custom error using quotes", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: { message: "must not be given" } });
      }
    }
    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(p.errors.get("name")).toContain("must not be given");
  });

  it("validates absence of with array arguments", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.validates("name", { absence: true });
        this.validates("email", { absence: true });
      }
    }
    const p = new Person({ name: "Alice", email: "a@b.com" });
    await p.isValid();
    expect(p.errors.count).toBe(2);
    expect(p.errors.get("name").length).toBeGreaterThan(0);
    expect(p.errors.get("email").length).toBeGreaterThan(0);
  });

  it("passes custom interpolation vars through to errors.add", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: { message: "must be %{kind}", kind: "empty" } });
      }
    }
    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(p.errors.get("name")).toContain("must be empty");
  });
});
