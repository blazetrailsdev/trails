import { describe, it, expect, afterEach } from "vitest";
import { Range } from "@blazetrails/activesupport";
import { Model, NoMethodError } from "../index.js";

class Person extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("limit", "integer");
  }

  minLength(): number {
    return 3;
  }
}

describe("LengthValidator (trails)", () => {
  afterEach(() => {
    Person.clearValidatorsBang();
  });

  it("accepts :within as a range object { begin, end }", async () => {
    Person.validatesLengthOf("title", { within: new Range(3, 10) });
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghij" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghijk" }).isValid()).toBe(false);
  });

  it("accepts :in as a range object with excludeEnd", async () => {
    Person.validatesLengthOf("title", { in: new Range(3, 5, true) });
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcde" }).isValid()).toBe(false);
  });

  it("resolves a Proc maximum against the record", async () => {
    Person.validatesLengthOf("title", {
      maximum: (r: Person) => r._readAttribute("limit") as number,
    });
    expect(await new Person({ title: "abc", limit: 5 }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdef", limit: 5 }).isValid()).toBe(false);
  });

  it("resolves a Symbol maximum against the record", async () => {
    Person.validatesLengthOf("title", { minimum: ":minLength" });
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
  });

  it("raises NoMethodError when a Symbol names a method the record lacks", async () => {
    Person.validatesLengthOf("title", { maximum: ":nonexistent" });
    await expect(new Person({ title: "abc" }).isValid()).rejects.toThrow(NoMethodError);
  });

  it("does not leak reserved keys into errors.add options (minimum/maximum path)", async () => {
    Person.validatesLengthOf("title", { in: new Range(3, 5) });
    const p = new Person({ title: "ab" });
    await p.isValid();
    const err = p.errors.objects[0];
    expect(err).toBeDefined();
    expect(err.options).not.toHaveProperty("minimum");
    expect(err.options).not.toHaveProperty("maximum");
    expect(err.options).not.toHaveProperty("tooShort");
    expect(err.options).not.toHaveProperty("tooLong");
    expect(err.options).not.toHaveProperty("within");
    expect(err.options).not.toHaveProperty("is");
    expect(err.options).toHaveProperty("count");
  });

  it("does not leak reserved keys into errors.add options (is path)", async () => {
    Person.validatesLengthOf("title", { is: 5, wrongLength: "bad length!" });
    const p = new Person({ title: "abc" });
    await p.isValid();
    const err = p.errors.objects[0];
    expect(err).toBeDefined();
    expect(err.options).not.toHaveProperty("minimum");
    expect(err.options).not.toHaveProperty("maximum");
    expect(err.options).toHaveProperty("count");
  });

  it("allowBlank: false with only maximum forces minimum of 1", async () => {
    Person.validatesLengthOf("title", { maximum: 10, allowBlank: false });
    expect(await new Person({ title: "" }).isValid()).toBe(false);
    expect(await new Person({ title: "a" }).isValid()).toBe(true);
  });

  it("throws at definition time when the range is empty", () => {
    expect(() => Person.validatesLengthOf("title", { in: new Range(1, 1, true) })).toThrow(
      /:minimum must be a non-negative Integer/,
    );
  });

  it("throws at definition time when :in is not a Range", () => {
    expect(() => Person.validatesLengthOf("title", { in: "3..10" })).toThrow(
      /:in and :within must be a Range/,
    );
  });

  it("throws at definition time when constraint is a non-integer", () => {
    expect(() => Person.validatesLengthOf("title", { minimum: 2.5 })).toThrow(
      /:minimum must be a non-negative Integer/,
    );
  });

  it("throws at definition time when constraint is negative", () => {
    expect(() => Person.validatesLengthOf("title", { minimum: -1 })).toThrow(
      /:minimum must be a non-negative Integer/,
    );
  });
});
