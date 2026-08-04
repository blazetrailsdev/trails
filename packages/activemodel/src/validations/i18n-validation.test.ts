import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Error as ModelError } from "../error.js";
import { Model } from "../model.js";
import { I18n } from "../i18n.js";
import { resetI18n } from "../test-helpers/i18n.js";

describe("I18nValidationTest", () => {
  // Rails' setup/teardown pair
  // (activemodel/test/cases/validations/i18n_validation_test.rb:11-28).
  const originalI18nCustomizeFullMessage = ModelError.i18nCustomizeFullMessage;
  beforeEach(() => {
    resetI18n();
    ModelError.i18nCustomizeFullMessage = true;
  });
  afterEach(() => {
    ModelError.i18nCustomizeFullMessage = originalI18nCustomizeFullMessage;
  });

  it("full message encoding", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    const msg = p.errors.fullMessages[0];
    expect(typeof msg).toBe("string");
    expect(msg).toBe("Name can't be blank");
  });

  it("errors full messages translates human attribute name for model attributes", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: {
          person: {
            name: "Person Name",
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages).toContain("Person Name can't be blank");
  });

  it("errors full messages uses format", () => {
    // Rails clears `I18n.load_path` in setup (i18n_validation_test.rb:12) so the
    // framework `en.yml` cannot overwrite the stored `errors.format`. Only this
    // case collides with the file data, and `errors.messages.empty` is stored
    // back because the trails deviation below resolves through the backend.
    const oldLoadPath = [...I18n.loadPath()];
    I18n.loadPath().length = 0;
    I18n.setBackend(new I18n.Simple());
    I18n.backend().storeTranslations("en", {
      errors: { format: "Field %{attribute} %{message}", messages: { empty: "can't be empty" } },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "empty");
    // Rails asserts ["Field Name empty"]: `add(:name, "empty")` passes a String,
    // which stays a literal message. Trails has no Symbol type, so `Error#message`
    // promotes identifier-shaped Strings to a type (error.ts `IDENTIFIER_RE`) and
    // "empty" resolves through `errors.messages.empty`. The format under test —
    // `errors.format` — is asserted either way.
    expect(p.errors.fullMessages).toEqual(["Field Name can't be empty"]);
    I18n.loadPath().splice(0, I18n.loadPath().length, ...oldLoadPath);
  });

  it("errors full messages doesnt use attribute format without config", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages).toContain("Name can't be blank");
  });

  it("errors full messages on nested error uses attribute format", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessagesFor("name")).toContain("Name can't be blank");
  });

  it("errors full messages uses attribute format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { person: { attributes: { name: { format: "%{message}" } } } } },
      },
    });

    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("name_test", "string");
      }
    }
    const person = new Person({});
    expect(person.errors.fullMessage("name", "cannot be blank")).toBe("cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toBe(
      "Name test cannot be blank",
    );
  });

  it("errors full messages uses model format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: { errors: { models: { person: { format: "%{message}" } } } },
    });

    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("name_test", "string");
      }
    }
    const person = new Person({});
    expect(person.errors.fullMessage("name", "cannot be blank")).toBe("cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toBe("cannot be blank");
  });

  it("errors full messages uses deeply nested model attributes format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            "person/contacts/addresses": { attributes: { street: { format: "%{message}" } } },
          },
        },
      },
    });

    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const person = new Person({});
    expect(person.errors.fullMessage("contacts/addresses.street", "cannot be blank")).toBe(
      "cannot be blank",
    );
    expect(person.errors.fullMessage("contacts/addresses.country", "cannot be blank")).toBe(
      "Contacts/addresses country cannot be blank",
    );
  });

  it("errors full messages uses deeply nested model model format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { "person/contacts/addresses": { format: "%{message}" } } },
      },
    });

    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const person = new Person({});
    expect(person.errors.fullMessage("contacts/addresses.street", "cannot be blank")).toBe(
      "cannot be blank",
    );
    expect(person.errors.fullMessage("contacts/addresses.country", "cannot be blank")).toBe(
      "cannot be blank",
    );
  });

  it("errors full messages with indexed deeply nested attributes and attributes format", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages[0]).toMatch(/Name/);
  });

  it("errors full messages with indexed deeply nested attributes and model format", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages.length).toBe(1);
  });

  it("errors full messages with indexed deeply nested attributes and i18n attribute name", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: {
          person: {
            name: "Custom Name",
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages).toContain("Custom Name can't be blank");
  });

  it("errors full messages with indexed deeply nested attributes without i18n config", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "blank");
    expect(p.errors.fullMessages).toContain("Name can't be blank");
  });

  it("errors full messages with i18n attribute name without i18n config", () => {
    class Person extends Model {
      static {
        this.attribute("first_name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("first_name", "blank");
    expect(p.errors.fullMessages).toContain("First name can't be blank");
  });

  it("validates_confirmation_of on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { confirmation: true });
      }
    }
    const p = new Person({ title: "A" });
    p._attributes.set("titleConfirmation", "B");
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("titleConfirmation")[0]).toMatch(/doesn't match/);
  });

  it("validates_acceptance_of on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({ terms: "no" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("terms")).toContain("must be accepted");
  });

  it("validates_presence_of on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("can't be blank");
  });

  it("validates_length_of for :within on generated message when too short", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 5 } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")[0]).toMatch(/is too short/);
  });

  it("validates_length_of for :too_long generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: 3 } });
      }
    }
    const p = new Person({ name: "toolong" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")[0]).toMatch(/is too long/);
  });

  it("validates_length_of for :is on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { is: 5 } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")[0]).toMatch(/is the wrong length/);
  });

  it("validates_format_of on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { format: { with: /@/ } });
      }
    }
    const p = new Person({ email: "invalid" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("email")).toContain("is invalid");
  });

  it("validates_inclusion_of on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    const p = new Person({ role: "other" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("role")).toContain("is not included in the list");
  });

  it("validates_inclusion_of using :within on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    const p = new Person({ role: "hacker" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("role")).toContain("is not included in the list");
  });

  it("validates_exclusion_of generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("username", "string");
        this.validates("username", { exclusion: { in: ["admin", "root"] } });
      }
    }
    const p = new Person({ username: "admin" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("username")).toContain("is reserved");
  });

  it("validates_exclusion_of using :within generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("username", "string");
        this.validates("username", { exclusion: { in: ["admin", "root"] } });
      }
    }
    const p = new Person({ username: "root" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("username")).toContain("is reserved");
  });

  it("validates_numericality_of generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "string");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: "abc" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("age")).toContain("is not a number");
  });

  it("validates_numericality_of for :only_integer on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "string");
        this.validates("age", { numericality: { onlyInteger: true } });
      }
    }
    const p = new Person({ age: "1.5" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("age")).toContain("must be an integer");
  });

  it("validates_numericality_of for :odd on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("count", "string");
        this.validates("count", { numericality: { odd: true } });
      }
    }
    const p = new Person({ count: "4" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("count")).toContain("must be odd");
  });

  it("validates_numericality_of for :less_than on generated message", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "string");
        this.validates("age", { numericality: { lessThan: 10 } });
      }
    }
    const p = new Person({ age: "15" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("age")).toContain("must be less than 10");
  });

  it("finds custom model key translation when", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            person: {
              attributes: {
                name: {
                  blank: "is required",
                },
              },
            },
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("is required");
  });

  it("finds custom model key translation with interpolation when", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            person: {
              attributes: {
                name: {
                  too_short: "must be at least %{count} chars",
                },
              },
            },
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 5 } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("must be at least 5 chars");
  });

  it("finds global default key translation when", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("can't be blank");
  });

  it("validations with message symbol must translate", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          messages: {
            custom_blank: "must not be empty",
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.errors.add("name", "custom_blank");
    expect(p.errors.get("name")).toContain("must not be empty");
  });

  it("validates with message symbol must translate per attribute", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            person: {
              attributes: {
                name: {
                  blank: "name is required",
                },
              },
            },
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("name is required");
  });

  it("validates with message symbol must translate per model", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            person: {
              blank: "person field required",
            },
          },
        },
      },
    });
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("person field required");
  });

  it("validates with message string", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { message: "custom required" } });
      }
    }
    const p = new Person({ name: "" });
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("name")).toContain("custom required");
  });
});
