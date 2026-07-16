import { describe, it, expect } from "vitest";
import { Model, I18n } from "../index.js";

describe("ConfirmationValidationTest", () => {
  it("validates confirmation of with boolean attribute", async () => {
    class Person extends Model {
      static {
        this.attribute("password", "string");
        this.validates("password", { confirmation: true });
      }
    }
    const p = new Person({ password: "secret", passwordConfirmation: "wrong" });
    expect(await p.isValid()).toBe(false);
  });

  it("validates confirmation of for ruby class", async () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "a@b.com", emailConfirmation: "a@b.com" });
    expect(await p.isValid()).toBe(true);
  });

  it("does not override confirmation reader if present", async () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "test@test.com" });
    expect(await p.isValid()).toBe(true);
  });

  it("does not override confirmation writer if present", async () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "test@test.com" });
    expect(await p.isValid()).toBe(true);
  });

  it("no title confirmation", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "A", titleConfirmation: "B" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("titleConfirmation")).toContain("doesn't match Title");
  });

  it("title confirmation", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "A", titleConfirmation: "A" });
    expect(await p.isValid()).toBe(true);
  });

  it("title confirmation with case sensitive option true", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: true } });
      }
    }
    const p = new Person({ title: "Hello" });
    p._attributes.set("titleConfirmation", "hello");
    expect(await p.isValid()).toBe(false);
  });

  it("title confirmation with case sensitive option false", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    const p = new Person({ title: "Hello" });
    p._attributes.set("titleConfirmation", "hello");
    expect(await p.isValid()).toBe(true);
  });

  it("title confirmation with i18n attribute", async () => {
    I18n.storeTranslations("en", {
      activemodel: {
        attributes: {
          person: {
            title: "Custom Title",
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "We the People" });
    p._attributes.set("titleConfirmation", "We the Robots");
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("titleConfirmation")[0]).toBe("doesn't match Custom Title");
    I18n.reset();
  });

  it("setup! auto-defines confirmation attribute", async () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    expect(Person._attributeDefinitions.has("emailConfirmation")).toBe(true);
    const p = new Person({ email: "a@b.com", emailConfirmation: "x@y.com" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("emailConfirmation")).toContain("doesn't match Email");
  });

  it("setup! does not override explicitly declared confirmation attribute", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.attribute("emailConfirmation", "string");
        this.validates("email", { confirmation: true });
      }
    }
    expect(Person._attributeDefinitions.has("emailConfirmation")).toBe(true);
  });
});
describe("ConfirmationValidator caseSensitive", () => {
  it("title confirmation with case sensitive option true", async () => {
    class User extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const u = new User({ title: "Alice" });
    u._attributes.set("titleConfirmation", "alice");
    expect(await u.isValid()).toBe(false);
  });

  it("title confirmation with case sensitive option false", async () => {
    class User extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    const u = new User({ title: "Alice" });
    u._attributes.set("titleConfirmation", "alice");
    expect(await u.isValid()).toBe(true);
  });

  it("still fails when values differ with caseSensitive: false", async () => {
    class User extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    const u = new User({ title: "alice" });
    u._attributes.set("titleConfirmation", "bob");
    expect(await u.isValid()).toBe(false);
  });
});

describe("confirmation options pass-through", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class User extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", {
          confirmation: { message: "must match %{kind}", kind: "original" },
        });
      }
    }
    const u = new User({ title: "alice" });
    u._attributes.set("titleConfirmation", "bob");
    await u.isValid();
    expect(u.errors.get("titleConfirmation")).toContain("must match original");
  });

  it("reserved key caseSensitive does not appear in error options", async () => {
    class User extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    const u = new User({ title: "alice" });
    u._attributes.set("titleConfirmation", "bob");
    await u.isValid();
    expect(u.errors.count).toBeGreaterThan(0);
    expect(
      u.errors.objects.find((d) => d.attribute === "titleConfirmation")?.options?.caseSensitive,
    ).toBeUndefined();
  });
});
