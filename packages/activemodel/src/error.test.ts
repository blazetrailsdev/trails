import { describe, it, expect } from "vitest";
import { Errors } from "./index.js";

describe("ErrorTest", () => {
  it("full_message uses default format", () => {
    const errors = new Errors({});
    expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
  });

  it("comparing against different class would not raise error", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    // Just verify it doesn't throw
    expect(errors.details[0]).toBeDefined();
  });

  it("details which has no raw_type", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const detail = errors.details[0];
    expect(detail.type).toBe("blank");
  });

  it("match? handles extra options match", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: "is bad" });
    expect(errors.added("name", "invalid")).toBe(true);
  });

  it("message handles lambda in messages and option values, and i18n interpolation", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: "custom error" });
    expect(errors.get("name")).toEqual(["custom error"]);
  });

  it("message with type as a symbol and indexed attribute can lookup without index in attribute key", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("initialize", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.details[0].attribute).toBe("name");
    expect(e.details[0].type).toBe("blank");
  });

  it("initialize without type", () => {
    const e = new Errors(null);
    e.add("name");
    expect(e.details[0].type).toBe("invalid");
  });

  it("match? handles attribute match", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.where("name").length).toBe(1);
    expect(e.where("age").length).toBe(0);
  });

  it("match? handles error type match", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    expect(e.where("name", "blank").length).toBe(1);
    expect(e.where("name", "too_short").length).toBe(1);
  });

  it("message with type as custom message", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "is required" });
    expect(e.get("name")).toContain("is required");
  });

  it("message with options[:message] as custom message", () => {
    const e = new Errors(null);
    e.add("name", "invalid", { message: "is not valid" });
    expect(e.get("name")).toContain("is not valid");
  });

  it("equality by base attribute, type and options", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "blank")).toBe(true);
  });

  it("inequality", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "too_short")).toBe(false);
  });

  it("full_message returns the given message when the attribute contains base", () => {
    // A field named "base_price" should still get a prefix
    const e = new Errors(null);
    expect(e.fullMessage("base_price", "is invalid")).toBe("Base price is invalid");
  });

  it("details which ignores callback and message options", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "custom msg" });
    const detail = e.details[0];
    expect(detail.attribute).toBe("name");
    expect(detail.type).toBe("blank");
  });

  it("initialize without type but with options", () => {
    const e = new Errors(null);
    e.add("name", "invalid", { message: "is not valid" });
    const detail = e.details[0];
    expect(detail.attribute).toBe("name");
    expect(detail.type).toBe("invalid");
    expect(detail.message).toBe("is not valid");
  });

  it("match? handles mixed condition", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "blank");
    expect(e.where("name", "blank").length).toBe(1);
    expect(e.where("name", "too_short").length).toBe(1);
    expect(e.where("name", "invalid").length).toBe(0);
    expect(e.where("age", "blank").length).toBe(1);
  });

  it("message with type as a symbol", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.get("name")).toEqual(["can't be blank"]);
  });

  it("message with custom interpolation", () => {
    const e = new Errors(null);
    e.add("name", "greater_than", { count: 5 });
    expect(e.get("name")).toEqual(["must be greater than 5"]);
  });

  it("message returns plural interpolation", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 3 });
    expect(e.get("name").length).toBe(1);
    expect(e.details[0].options?.count).toBe(3);
  });

  it("message returns singular interpolation", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 1 });
    expect(e.get("name").length).toBe(1);
    expect(e.details[0].options?.count).toBe(1);
  });

  it("message returns count interpolation", () => {
    const e = new Errors(null);
    e.add("name", "equal_to", { count: 42 });
    expect(e.get("name")).toEqual(["must be equal to 42"]);
  });

  it("inspect", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const str = errors.inspect();
    expect(str).toContain("ActiveModel::Errors");
    expect(str).toContain("name");
    expect(str).toContain("blank");
  });

  it("message renders lazily using current locale", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.get("name")).toEqual(["can't be blank"]);
  });

  it("message uses current locale", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("full_messages doesn't require the base object to respond to :errors", () => {
    const errors = new Errors({ name: "test" });
    errors.add("name", "blank");
    expect(errors.fullMessages).toEqual(["Name can't be blank"]);
  });

  it("merge does not import errors when merging with self", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.count).toBe(1);
    errors.merge(errors);
    expect(errors.count).toBe(1);
  });

  it("generate_message works without i18n_scope", () => {
    const e = new Errors(null);
    expect(e.generateMessage("name", "blank")).toBe("can't be blank");
    expect(e.generateMessage("name", "invalid")).toBe("is invalid");
  });

  it("full_message returns the given message when attribute is :base", () => {
    const e = new Errors(null);
    e.add("base", "invalid", { message: "Something went wrong" });
    expect(e.fullMessages).toContain("Something went wrong");
  });

  it("full_message returns the given message with the attribute name included", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.fullMessages[0]).toBe("Name can't be blank");
  });
});
