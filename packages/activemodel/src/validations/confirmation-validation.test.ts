import { describe, it, expect } from "vitest";
import { Model, I18n } from "../index.js";

describe("ConfirmationValidationTest", () => {
  it("validates confirmation of with boolean attribute", () => {
    class Person extends Model {
      static {
        this.attribute("password", "string");
        this.validates("password", { confirmation: true });
      }
    }
    const p = new Person({ password: "secret", passwordConfirmation: "wrong" });
    expect(p.isValid()).toBe(false);
  });

  it("validates confirmation of for ruby class", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "a@b.com", emailConfirmation: "a@b.com" });
    expect(p.isValid()).toBe(true);
  });

  it("does not override confirmation reader if present", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "test@test.com" });
    expect(p.isValid()).toBe(true);
  });

  it("does not override confirmation writer if present", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    const p = new Person({ email: "test@test.com" });
    expect(p.isValid()).toBe(true);
  });

  it("no title confirmation", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "A", titleConfirmation: "B" });
    expect(p.isValid()).toBe(false);
    expect(p.errors.get("titleConfirmation")).toContain("doesn't match Title");
  });

  it("title confirmation", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "A", titleConfirmation: "A" });
    expect(p.isValid()).toBe(true);
  });

  it("title confirmation with case sensitive option true", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: true } });
      }
    }
    const p = new Person({ title: "Hello" });
    p._attributes.set("titleConfirmation", "hello");
    expect(p.isValid()).toBe(false);
  });

  it("title confirmation with case sensitive option false", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    const p = new Person({ title: "Hello" });
    p._attributes.set("titleConfirmation", "hello");
    expect(p.isValid()).toBe(true);
  });

  it("title confirmation with i18n attribute", () => {
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
    expect(p.isValid()).toBe(false);
    expect(p.errors.get("titleConfirmation")[0]).toBe("doesn't match Custom Title");
    I18n.reset();
  });

  it("setup! auto-defines confirmation attribute", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    expect(Person._attributeDefinitions.has("emailConfirmation")).toBe(true);
    const p = new Person({ email: "a@b.com", emailConfirmation: "x@y.com" });
    expect(p.isValid()).toBe(false);
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
