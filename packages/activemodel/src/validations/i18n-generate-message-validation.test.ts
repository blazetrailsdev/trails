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

describe("I18nGenerateMessageValidationTest", () => {
  beforeEach(() => {
    I18n.reset();
  });

  it("generate message inclusion with default message", () => {
    const p = new Person({ name: "z" });
    const msg = p.errors.generateMessage("name", "inclusion");
    expect(msg).toBe("is not included in the list");
  });

  it("generate message inclusion with custom message", () => {
    const p = new Person({ name: "z" });
    const msg = p.errors.generateMessage("name", "inclusion", {
      message: "custom inclusion",
    });
    expect(msg).toBe("custom inclusion");
  });

  it("generate message exclusion with default message", () => {
    const p = new Person({ name: "admin" });
    const msg = p.errors.generateMessage("name", "exclusion");
    expect(msg).toBe("is reserved");
  });

  it("generate message exclusion with custom message", () => {
    const p = new Person({ name: "admin" });
    const msg = p.errors.generateMessage("name", "exclusion", {
      message: "custom exclusion",
    });
    expect(msg).toBe("custom exclusion");
  });

  it("generate message invalid with default message", () => {
    const p = new Person({ name: "test" });
    const msg = p.errors.generateMessage("name", "invalid");
    expect(msg).toBe("is invalid");
  });

  it("generate message invalid with custom message", () => {
    const p = new Person({ name: "test" });
    const msg = p.errors.generateMessage("name", "invalid", { message: "custom invalid" });
    expect(msg).toBe("custom invalid");
  });

  it("generate message confirmation with default message", () => {
    const p = new Person({ title: "Mr" });
    const msg = p.errors.generateMessage("title", "confirmation", { attribute: "Title" });
    expect(msg).toBe("doesn't match Title");
  });

  it("generate message confirmation with custom message", () => {
    const p = new Person({ title: "Mr" });
    const msg = p.errors.generateMessage("title", "confirmation", {
      message: "custom confirmation",
    });
    expect(msg).toBe("custom confirmation");
  });

  it("generate message accepted with default message", () => {
    const p = new Person({});
    const msg = p.errors.generateMessage("name", "accepted");
    expect(msg).toBe("must be accepted");
  });

  it("generate message accepted with custom message", () => {
    const p = new Person({});
    const msg = p.errors.generateMessage("name", "accepted", { message: "custom accepted" });
    expect(msg).toBe("custom accepted");
  });

  it("generate message empty with default message", () => {
    const p = new Person({});
    const msg = p.errors.generateMessage("name", "empty");
    expect(msg).toBe("can't be empty");
  });

  it("generate message empty with custom message", () => {
    const p = new Person({});
    const msg = p.errors.generateMessage("name", "empty", { message: "custom empty" });
    expect(msg).toBe("custom empty");
  });

  it("generate message blank with default message", () => {
    const p = new Person({ name: "" });
    const msg = p.errors.generateMessage("name", "blank");
    expect(msg).toBe("can't be blank");
  });

  it("generate message blank with custom message", () => {
    const p = new Person({ name: "" });
    const msg = p.errors.generateMessage("name", "blank", { message: "custom blank" });
    expect(msg).toBe("custom blank");
  });

  it("generate message too long with default message plural", () => {
    const p = new Person({ name: "abcdefghijk" });
    const msg = p.errors.generateMessage("name", "too_long", { count: 10 });
    expect(msg).toBe("is too long (maximum is 10 characters)");
  });

  it("generate message too long with default message singular", () => {
    const p = new Person({ name: "ab" });
    const msg = p.errors.generateMessage("name", "too_long", { count: 1 });
    expect(msg).toBe("is too long (maximum is 1 character)");
  });

  it("generate message too long with custom message", () => {
    const p = new Person({ name: "abcdefghijk" });
    const msg = p.errors.generateMessage("name", "too_long", {
      message: "custom too long",
      count: 10,
    });
    expect(msg).toBe("custom too long");
  });

  it("generate message too short with default message plural", () => {
    const p = new Person({ name: "ab" });
    const msg = p.errors.generateMessage("name", "too_short", { count: 3 });
    expect(msg).toBe("is too short (minimum is 3 characters)");
  });

  it("generate message too short with default message singular", () => {
    const p = new Person({ name: "" });
    const msg = p.errors.generateMessage("name", "too_short", { count: 1 });
    expect(msg).toBe("is too short (minimum is 1 character)");
  });

  it("generate message too short with custom message", () => {
    const p = new Person({ name: "ab" });
    const msg = p.errors.generateMessage("name", "too_short", {
      message: "custom too short",
      count: 3,
    });
    expect(msg).toBe("custom too short");
  });

  it("generate message wrong length with default message plural", () => {
    const p = new Person({ name: "abc" });
    const msg = p.errors.generateMessage("name", "wrong_length", { count: 5 });
    expect(msg).toBe("is the wrong length (should be 5 characters)");
  });

  it("generate message wrong length with default message singular", () => {
    const p = new Person({ name: "ab" });
    const msg = p.errors.generateMessage("name", "wrong_length", { count: 1 });
    expect(msg).toBe("is the wrong length (should be 1 character)");
  });

  it("generate message wrong length with custom message", () => {
    const p = new Person({ name: "abc" });
    const msg = p.errors.generateMessage("name", "wrong_length", {
      message: "custom wrong length",
      count: 5,
    });
    expect(msg).toBe("custom wrong length");
  });

  it("generate message not a number with default message", () => {
    const p = new Person({ name: "abc" });
    const msg = p.errors.generateMessage("name", "not_a_number");
    expect(msg).toBe("is not a number");
  });

  it("generate message not a number with custom message", () => {
    const p = new Person({ name: "abc" });
    const msg = p.errors.generateMessage("name", "not_a_number", {
      message: "custom not a number",
    });
    expect(msg).toBe("custom not a number");
  });

  it("generate message greater than with default message", () => {
    const p = new Person({ age: 5 });
    const msg = p.errors.generateMessage("age", "greater_than", { count: 10 });
    expect(msg).toBe("must be greater than 10");
  });

  it("generate message greater than or equal to with default message", () => {
    const p = new Person({ age: 5 });
    const msg = p.errors.generateMessage("age", "greater_than_or_equal_to", { count: 10 });
    expect(msg).toBe("must be greater than or equal to 10");
  });

  it("generate message equal to with default message", () => {
    const p = new Person({ age: 5 });
    const msg = p.errors.generateMessage("age", "equal_to", { count: 10 });
    expect(msg).toBe("must be equal to 10");
  });

  it("generate message less than with default message", () => {
    const p = new Person({ age: 15 });
    const msg = p.errors.generateMessage("age", "less_than", { count: 10 });
    expect(msg).toBe("must be less than 10");
  });

  it("generate message less than or equal to with default message", () => {
    const p = new Person({ age: 15 });
    const msg = p.errors.generateMessage("age", "less_than_or_equal_to", { count: 10 });
    expect(msg).toBe("must be less than or equal to 10");
  });

  it("generate message odd with default message", () => {
    const p = new Person({ age: 4 });
    const msg = p.errors.generateMessage("age", "odd");
    expect(msg).toBe("must be odd");
  });

  it("generate message even with default message", () => {
    const p = new Person({ age: 3 });
    const msg = p.errors.generateMessage("age", "even");
    expect(msg).toBe("must be even");
  });
});
