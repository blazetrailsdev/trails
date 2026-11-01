import { describe, expect, it } from "vitest";
import { CommentsField } from "./comments-field.js";

describe("Mail::CommentsField", () => {
  it("should initialize", () => {
    expect(() => new CommentsField("this is a comment")).not.toThrow();
  });
  it("should accept a string with the field name", () => {
    const t = new CommentsField("this is a comment");
    expect(t.name).toEqual("Comments");
    expect(t.value).toEqual("this is a comment");
  });
});
