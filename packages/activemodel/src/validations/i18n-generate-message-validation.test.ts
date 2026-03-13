import { describe, it, expect, beforeEach } from "vitest";
import { Model } from "../model.js";
import { I18n } from "../i18n.js";

class Person extends Model {
  static {
    this.attribute("name", "string");
    this.attribute("title", "string");
    this.attribute("age", "integer");
  }
}

describe("ActiveModel", () => {
  describe("I18nGenerateMessageValidationTest (ported)", () => {
    beforeEach(() => {
      I18n.reset();
    });

    it("generate_message_blank_with_default_message", () => {
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "blank");
      expect(msg).toBe("can't be blank");
    });

    it("generate_message_invalid_with_default_message", () => {
      const p = new Person({ name: "test" });
      const msg = p.errors.generateMessage("name", "invalid");
      expect(msg).toBe("is invalid");
    });

    it("generate_message_too_short_with_default_message", () => {
      const p = new Person({ name: "ab" });
      const msg = p.errors.generateMessage("name", "too_short", { count: 3 });
      expect(msg).toBe("is too short (minimum is 3 characters)");
    });

    it("generate_message_too_short_with_count_1", () => {
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "too_short", { count: 1 });
      expect(msg).toBe("is too short (minimum is 1 character)");
    });

    it("generate_message_too_long_with_default_message", () => {
      const p = new Person({ name: "abcdefghijk" });
      const msg = p.errors.generateMessage("name", "too_long", { count: 10 });
      expect(msg).toBe("is too long (maximum is 10 characters)");
    });

    it("generate_message_too_long_with_count_1", () => {
      const p = new Person({ name: "ab" });
      const msg = p.errors.generateMessage("name", "too_long", { count: 1 });
      expect(msg).toBe("is too long (maximum is 1 character)");
    });

    it("generate_message_wrong_length_with_default_message", () => {
      const p = new Person({ name: "abc" });
      const msg = p.errors.generateMessage("name", "wrong_length", { count: 5 });
      expect(msg).toBe("is the wrong length (should be 5 characters)");
    });

    it("generate_message_wrong_length_with_count_1", () => {
      const p = new Person({ name: "ab" });
      const msg = p.errors.generateMessage("name", "wrong_length", { count: 1 });
      expect(msg).toBe("is the wrong length (should be 1 character)");
    });

    it("generate_message_not_a_number_with_default_message", () => {
      const p = new Person({ name: "abc" });
      const msg = p.errors.generateMessage("name", "not_a_number");
      expect(msg).toBe("is not a number");
    });

    it("generate_message_not_an_integer_with_default_message", () => {
      const p = new Person({ name: "1.5" });
      const msg = p.errors.generateMessage("name", "not_an_integer");
      expect(msg).toBe("must be an integer");
    });

    it("generate_message_greater_than_with_default_message", () => {
      const p = new Person({ age: 5 });
      const msg = p.errors.generateMessage("age", "greater_than", { count: 10 });
      expect(msg).toBe("must be greater than 10");
    });

    it("generate_message_greater_than_or_equal_to_with_default_message", () => {
      const p = new Person({ age: 5 });
      const msg = p.errors.generateMessage("age", "greater_than_or_equal_to", { count: 10 });
      expect(msg).toBe("must be greater than or equal to 10");
    });

    it("generate_message_less_than_with_default_message", () => {
      const p = new Person({ age: 15 });
      const msg = p.errors.generateMessage("age", "less_than", { count: 10 });
      expect(msg).toBe("must be less than 10");
    });

    it("generate_message_less_than_or_equal_to_with_default_message", () => {
      const p = new Person({ age: 15 });
      const msg = p.errors.generateMessage("age", "less_than_or_equal_to", { count: 10 });
      expect(msg).toBe("must be less than or equal to 10");
    });

    it("generate_message_equal_to_with_default_message", () => {
      const p = new Person({ age: 5 });
      const msg = p.errors.generateMessage("age", "equal_to", { count: 10 });
      expect(msg).toBe("must be equal to 10");
    });

    it("generate_message_other_than_with_default_message", () => {
      const p = new Person({ age: 10 });
      const msg = p.errors.generateMessage("age", "other_than", { count: 10 });
      expect(msg).toBe("must be other than 10");
    });

    it("generate_message_odd_with_default_message", () => {
      const p = new Person({ age: 4 });
      const msg = p.errors.generateMessage("age", "odd");
      expect(msg).toBe("must be odd");
    });

    it("generate_message_even_with_default_message", () => {
      const p = new Person({ age: 3 });
      const msg = p.errors.generateMessage("age", "even");
      expect(msg).toBe("must be even");
    });

    it("generate_message_inclusion_with_default_message", () => {
      const p = new Person({ name: "z" });
      const msg = p.errors.generateMessage("name", "inclusion");
      expect(msg).toBe("is not included in the list");
    });

    it("generate_message_exclusion_with_default_message", () => {
      const p = new Person({ name: "admin" });
      const msg = p.errors.generateMessage("name", "exclusion");
      expect(msg).toBe("is reserved");
    });

    it("generate_message_confirmation_with_default_message", () => {
      const p = new Person({ title: "Mr" });
      const msg = p.errors.generateMessage("title", "confirmation", { attribute: "Title" });
      expect(msg).toBe("doesn't match Title");
    });

    it("generate_message_accepted_with_default_message", () => {
      const p = new Person({});
      const msg = p.errors.generateMessage("name", "accepted");
      expect(msg).toBe("must be accepted");
    });

    it("generate_message_taken_with_default_message", () => {
      const p = new Person({ name: "taken" });
      const msg = p.errors.generateMessage("name", "taken");
      expect(msg).toBe("has already been taken");
    });

    it("generate_message_present_with_default_message", () => {
      const p = new Person({ name: "something" });
      const msg = p.errors.generateMessage("name", "present");
      expect(msg).toBe("must be blank");
    });

    it("generate_message_with_custom_message", () => {
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "blank", { message: "custom message" });
      expect(msg).toBe("custom message");
    });

    it("generate_message_with_custom_translation_for_model", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            models: {
              person: {
                attributes: {
                  name: {
                    blank: "is required for Person",
                  },
                },
              },
            },
          },
        },
      });
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "blank");
      expect(msg).toBe("is required for Person");
    });

    it("generate_message_with_model_level_translation", () => {
      I18n.storeTranslations("en", {
        activemodel: {
          errors: {
            models: {
              person: {
                blank: "must not be empty",
              },
            },
          },
        },
      });
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "blank");
      expect(msg).toBe("must not be empty");
    });

    it("generate_message_with_global_errors_messages_fallback", () => {
      I18n.storeTranslations("en", {
        errors: {
          messages: {
            blank: "global blank message",
          },
        },
      });
      const p = new Person({ name: "" });
      const msg = p.errors.generateMessage("name", "blank");
      expect(msg).toBe("can't be blank");
    });

    it("generate_message_too_short_interpolates_count", () => {
      const p = new Person({ name: "a" });
      const msg = p.errors.generateMessage("name", "too_short", { count: 5 });
      expect(msg).toBe("is too short (minimum is 5 characters)");
    });

    it("generate_message_too_long_interpolates_count", () => {
      const p = new Person({ name: "abcdef" });
      const msg = p.errors.generateMessage("name", "too_long", { count: 3 });
      expect(msg).toBe("is too long (maximum is 3 characters)");
    });

    it("generate_message_wrong_length_interpolates_count", () => {
      const p = new Person({ name: "abc" });
      const msg = p.errors.generateMessage("name", "wrong_length", { count: 5 });
      expect(msg).toBe("is the wrong length (should be 5 characters)");
    });
  });
});
