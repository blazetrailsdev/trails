/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { AcceptanceValidator } from "./acceptance.js";
import { ConfirmationValidator } from "./confirmation.js";

describe("ConfirmationValidationTest (trails-only)", () => {
  it("setup! auto-defines confirmation attribute", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("email", "string");
        this.validates("email", { confirmation: true });
      }
    }
    interface Person extends Attributes {}

    expect(Object.getOwnPropertyDescriptor(Person.prototype, "emailConfirmation")?.set).toBeTypeOf(
      "function",
    );
    const p = new Person({ email: "a@b.com", emailConfirmation: "x@y.com" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("emailConfirmation")).toContain("doesn't match Email");
  });

  it("setup! does not override explicitly declared confirmation attribute", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("email", "string");
        this.attribute("emailConfirmation", "string");
        this.validates("email", { confirmation: true });
      }
    }
    interface Person extends Attributes {}

    expect(Person.attributeNames()).toContain("emailConfirmation");
  });
});

describe("ConfirmationValidator caseSensitive", () => {
  it("still fails when values differ with caseSensitive: false", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    interface User extends Attributes {}

    const u = new User({ title: "alice" });
    (u as any).titleConfirmation = "bob";
    expect(await u.isValid()).toBe(false);
  });
});

describe("confirmation options pass-through", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", {
          confirmation: { message: "must match %{kind}", kind: "original" },
        });
      }
    }
    interface User extends Attributes {}

    const u = new User({ title: "alice" });
    (u as any).titleConfirmation = "bob";
    await u.isValid();
    expect(u.errors.messagesFor("titleConfirmation")).toContain("must match original");
  });

  it("reserved key caseSensitive does not appear in error options", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { confirmation: { caseSensitive: false } });
      }
    }
    interface User extends Attributes {}

    const u = new User({ title: "alice" });
    (u as any).titleConfirmation = "bob";
    await u.isValid();
    expect(u.errors.count).toBeGreaterThan(0);
    expect(
      u.errors.objects.find((d) => d.attribute === "titleConfirmation")?.options?.caseSensitive,
    ).toBeUndefined();
  });
});

describe("ConfirmationValidator and AcceptanceValidator defaults", () => {
  it("merges the defaults into options in initialize", () => {
    class Person extends Model {}
    expect(new ConfirmationValidator({ attributes: ["email"], class: Person }).options).toEqual({
      caseSensitive: true,
    });
    expect(
      new ConfirmationValidator({ attributes: ["email"], class: Person, caseSensitive: false })
        .options,
    ).toEqual({ caseSensitive: false });
    expect(new AcceptanceValidator({ attributes: ["terms"], class: Person }).options).toEqual({
      allowNil: true,
      accept: ["1", true],
    });
  });

  it("folds only ASCII letters when case_sensitive is false, as String#casecmp does", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("email", "string");
        this.validates("email", { confirmation: { caseSensitive: false } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ email: "ÉA", emailConfirmation: "Éa" }).isValid()).toBe(true);
    expect(await new Person({ email: "ÉA", emailConfirmation: "éa" }).isValid()).toBe(false);
  });
});
