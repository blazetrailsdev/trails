import { describe, it, expect, beforeEach } from "vitest";
import { Model } from "../model.js";
import { resetI18n } from "../test-helpers/i18n.js";

class Person extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("karma", "string");
    this.attribute("salary", "integer");
    this.attribute("gender", "string");
  }
}

describe("I18nGenerateMessageValidationTest", () => {
  let person: Person;

  beforeEach(() => {
    resetI18n();
    Person.clearValidatorsBang();
    person = new Person({});
  });

  it("generate message inclusion with default message", () => {
    expect(person.errors.generateMessage("title", ":inclusion", { value: "title" })).toEqual(
      "is not included in the list",
    );
  });

  it("generate message inclusion with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":inclusion", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toEqual("custom message title");
  });

  it("generate message exclusion with default message", () => {
    expect(person.errors.generateMessage("title", ":exclusion", { value: "title" })).toEqual(
      "is reserved",
    );
  });

  it("generate message exclusion with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":exclusion", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toEqual("custom message title");
  });

  it("generate message invalid with default message", () => {
    expect(person.errors.generateMessage("title", ":invalid", { value: "title" })).toEqual(
      "is invalid",
    );
  });

  it("generate message invalid with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":invalid", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toEqual("custom message title");
  });

  it("generate message confirmation with default message", () => {
    expect(person.errors.generateMessage("title", ":confirmation")).toEqual("doesn't match Title");
  });

  it("generate message confirmation with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":confirmation", { message: "custom message" }),
    ).toEqual("custom message");
  });

  it("generate message accepted with default message", () => {
    expect(person.errors.generateMessage("title", ":accepted")).toEqual("must be accepted");
  });

  it("generate message accepted with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":accepted", { message: "custom message" }),
    ).toEqual("custom message");
  });

  it("generate message empty with default message", () => {
    expect(person.errors.generateMessage("title", ":empty")).toEqual("can't be empty");
  });

  it("generate message empty with custom message", () => {
    expect(person.errors.generateMessage("title", ":empty", { message: "custom message" })).toEqual(
      "custom message",
    );
  });

  it("generate message blank with default message", () => {
    expect(person.errors.generateMessage("title", ":blank")).toEqual("can't be blank");
  });

  it("generate message blank with custom message", () => {
    expect(person.errors.generateMessage("title", ":blank", { message: "custom message" })).toEqual(
      "custom message",
    );
  });

  it("generate message too long with default message plural", () => {
    expect(person.errors.generateMessage("title", ":too_long", { count: 10 })).toEqual(
      "is too long (maximum is 10 characters)",
    );
  });

  it("generate message too long with default message singular", () => {
    expect(person.errors.generateMessage("title", ":too_long", { count: 1 })).toEqual(
      "is too long (maximum is 1 character)",
    );
  });

  it("generate message too long with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":too_long", {
        message: "custom message %{count}",
        count: 10,
      }),
    ).toEqual("custom message 10");
  });

  it("generate message too short with default message plural", () => {
    expect(person.errors.generateMessage("title", ":too_short", { count: 10 })).toEqual(
      "is too short (minimum is 10 characters)",
    );
  });

  it("generate message too short with default message singular", () => {
    expect(person.errors.generateMessage("title", ":too_short", { count: 1 })).toEqual(
      "is too short (minimum is 1 character)",
    );
  });

  it("generate message too short with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":too_short", {
        message: "custom message %{count}",
        count: 10,
      }),
    ).toEqual("custom message 10");
  });

  it("generate message wrong length with default message plural", () => {
    expect(person.errors.generateMessage("title", ":wrong_length", { count: 10 })).toEqual(
      "is the wrong length (should be 10 characters)",
    );
  });

  it("generate message wrong length with default message singular", () => {
    expect(person.errors.generateMessage("title", ":wrong_length", { count: 1 })).toEqual(
      "is the wrong length (should be 1 character)",
    );
  });

  it("generate message wrong length with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":wrong_length", {
        message: "custom message %{count}",
        count: 10,
      }),
    ).toEqual("custom message 10");
  });

  it("generate message not a number with default message", () => {
    expect(person.errors.generateMessage("title", ":not_a_number", { value: "title" })).toEqual(
      "is not a number",
    );
  });

  it("generate message not a number with custom message", () => {
    expect(
      person.errors.generateMessage("title", ":not_a_number", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toEqual("custom message title");
  });

  it("generate message greater than with default message", () => {
    expect(
      person.errors.generateMessage("title", ":greater_than", { value: "title", count: 10 }),
    ).toEqual("must be greater than 10");
  });

  it("generate message greater than or equal to with default message", () => {
    expect(
      person.errors.generateMessage("title", ":greater_than_or_equal_to", {
        value: "title",
        count: 10,
      }),
    ).toEqual("must be greater than or equal to 10");
  });

  it("generate message equal to with default message", () => {
    expect(
      person.errors.generateMessage("title", ":equal_to", { value: "title", count: 10 }),
    ).toEqual("must be equal to 10");
  });

  it("generate message less than with default message", () => {
    expect(
      person.errors.generateMessage("title", ":less_than", { value: "title", count: 10 }),
    ).toEqual("must be less than 10");
  });

  it("generate message less than or equal to with default message", () => {
    expect(
      person.errors.generateMessage("title", ":less_than_or_equal_to", {
        value: "title",
        count: 10,
      }),
    ).toEqual("must be less than or equal to 10");
  });

  it("generate message odd with default message", () => {
    expect(person.errors.generateMessage("title", ":odd", { value: "title", count: 10 })).toEqual(
      "must be odd",
    );
  });

  it("generate message even with default message", () => {
    expect(person.errors.generateMessage("title", ":even", { value: "title", count: 10 })).toEqual(
      "must be even",
    );
  });
});
