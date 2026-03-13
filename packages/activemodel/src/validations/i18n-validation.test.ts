import { describe, it, expect, beforeEach } from "vitest";
import { Model } from "../model.js";
import { I18n } from "../i18n.js";

describe("ActiveModel", () => {
  describe("I18nValidationTest (ported)", () => {
    beforeEach(() => {
      I18n.reset();
    });

    it("errors add on base generates message", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.errors.add("base", "blank");
      expect(p.errors.fullMessages).toContain("can't be blank");
    });

    it("errors add on base generates message with custom prefix", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            format: "%{attribute}: %{message}",
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
      expect(p.errors.fullMessages).toContain("Name: can't be blank");
    });

    it("validates presence with i18n message", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("can't be blank");
    });

    it("validates length too short with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 5 } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("is too short (minimum is 5 characters)");
    });

    it("validates length too short with count 1", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 1 } });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("is too short (minimum is 1 character)");
    });

    it("validates length too long with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: 3 } });
        }
      }
      const p = new Person({ name: "toolong" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("is too long (maximum is 3 characters)");
    });

    it("validates length wrong length with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { is: 5 } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("is the wrong length (should be 5 characters)");
    });

    it("validates numericality not an integer with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("age", "string");
          this.validates("age", { numericality: { onlyInteger: true } });
        }
      }
      const p = new Person({ age: "1.5" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("age")).toContain("must be an integer");
    });

    it("validates confirmation with humanized attribute", () => {
      class Person extends Model {
        static {
          this.attribute("email_address", "string");
          this.validates("email_address", { confirmation: true });
        }
      }
      const p = new Person({ email_address: "a@b.com", email_addressConfirmation: "x@y.com" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("email_address")).toContain("doesn't match Email address");
    });

    it("full_message uses i18n format", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.errors.add("name", "blank");
      expect(p.errors.fullMessages).toContain("Name can't be blank");
    });

    it("full_message with custom format", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            format: "%{attribute} - %{message}",
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
      expect(p.errors.fullMessages).toContain("Name - can't be blank");
    });

    it("custom model-level message", () => {
      I18n.storeTranslations("en", {
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
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("is required");
    });

    it("human_attribute_name with i18n translation", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          attributes: {
            person: {
              name: "Full Name",
            },
          },
        },
      });
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(Person.humanAttributeName("name")).toBe("Full Name");
    });

    it("human_attribute_name falls back to humanize", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("store_translations deep merges", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            messages: {
              blank: "custom blank",
            },
          },
        },
      });
      expect(I18n.t("activemodel.errors.messages.blank")).toBe("custom blank");
      expect(I18n.t("activemodel.errors.messages.invalid")).toBe("is invalid");
    });

    it("reset restores defaults", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            messages: {
              blank: "overridden",
            },
          },
        },
      });
      expect(I18n.t("activemodel.errors.messages.blank")).toBe("overridden");
      I18n.reset();
      expect(I18n.t("activemodel.errors.messages.blank")).toBe("can't be blank");
    });

    it("I18n.t returns key when not found", () => {
      expect(I18n.t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("I18n.t with defaultValue", () => {
      expect(I18n.t("nonexistent.key", { defaultValue: "fallback" })).toBe("fallback");
    });

    it("I18n.t with defaults array", () => {
      const result = I18n.t("nonexistent.key", {
        defaults: [{ key: "also.missing" }, { message: "found it" }],
      });
      expect(result).toBe("found it");
    });

    it("I18n.t with pluralization", () => {
      expect(I18n.t("activemodel.errors.messages.too_short", { count: 1 })).toBe(
        "is too short (minimum is 1 character)",
      );
      expect(I18n.t("activemodel.errors.messages.too_short", { count: 5 })).toBe(
        "is too short (minimum is 5 characters)",
      );
    });

    it("I18n.t with interpolation", () => {
      expect(I18n.t("activemodel.errors.messages.greater_than", { count: 10 })).toBe(
        "must be greater than 10",
      );
    });

    it("validates inclusion with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user"] } });
        }
      }
      const p = new Person({ role: "other" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("role")).toContain("is not included in the list");
    });

    it("validates exclusion with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("username", "string");
          this.validates("username", { exclusion: { in: ["admin", "root"] } });
        }
      }
      const p = new Person({ username: "admin" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("username")).toContain("is reserved");
    });

    it("validates acceptance with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: true });
        }
      }
      const p = new Person({ terms: "no" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("terms")).toContain("must be accepted");
    });

    it("validates absence with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }
      const p = new Person({ name: "present" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toContain("must be blank");
    });

    it("validates numericality greater_than with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { greaterThan: 18 } });
        }
      }
      const p = new Person({ age: 10 });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("age")).toContain("must be greater than 18");
    });

    it("validates numericality odd with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("count", "integer");
          this.validates("count", { numericality: { odd: true } });
        }
      }
      const p = new Person({ count: 4 });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("count")).toContain("must be odd");
    });

    it("validates numericality even with i18n", () => {
      class Person extends Model {
        static {
          this.attribute("count", "integer");
          this.validates("count", { numericality: { even: true } });
        }
      }
      const p = new Person({ count: 3 });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("count")).toContain("must be even");
    });
  });
});
