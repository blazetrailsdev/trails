import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ValidationsContextTest", () => {
  it("with a class that adds errors on create and validating a new model with no arguments", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, on: "create" });
      }
    }
    // No context specified, so validation with on: "create" is skipped
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("with a class that adds errors on create and validating a new model", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, on: "create" });
      }
    }
    expect(await new Person({}).isValid("create")).toBe(false);
  });

  it("with a class that adds errors on update and validating a new model", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, on: "update" });
      }
    }
    expect(await new Person({}).isValid("create")).toBe(true);
    expect(await new Person({}).isValid("update")).toBe(false);
  });

  it("with a class that adds errors on multiple contexts and validating a new model", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.validates("name", { presence: true, on: "create" });
        this.validates("email", { presence: true, on: "update" });
      }
    }
    // On create: only name validation fires
    const p1 = new Person({});
    expect(await p1.isValid("create")).toBe(false);
    expect(p1.errors.get("name").length).toBeGreaterThan(0);

    const p2 = new Person({ name: "Alice" });
    expect(await p2.isValid("create")).toBe(true);
  });

  it("with a class that validating a model for a multiple contexts", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, on: "create" });
      }
    }
    // Without context, validation is skipped
    expect(await new Person({}).isValid()).toBe(true);
    // With matching context, validation runs
    expect(await new Person({}).isValid("create")).toBe(false);
    // With non-matching context, validation is skipped
    expect(await new Person({}).isValid("update")).toBe(true);
  });
});
