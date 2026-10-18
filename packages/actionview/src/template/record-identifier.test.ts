import { describe, it, expect, beforeEach } from "vitest";

import { ArgumentError } from "@blazetrails/ruby-compat";

import { RecordIdentifier, domClass, domId } from "../record-identifier.js";
import { Comment, Cpk, Plane } from "../test-helpers/fake-models.js";

describe("RecordIdentifierTest", () => {
  const singular = "comment";
  let record: Comment;

  beforeEach(() => {
    record = new Comment();
  });

  it("dom id with class", () => {
    expect(domId(Comment)).toBe(`new_${singular}`);
  });

  it("dom id with new record", () => {
    expect(domId(record)).toBe(`new_${singular}`);
  });

  it("dom id with new record and prefix", () => {
    expect(domId(record, "custom_prefix")).toBe(`custom_prefix_${singular}`);
  });

  it("dom id with saved record", () => {
    record.save();
    expect(domId(record)).toBe(`${singular}_1`);
  });

  it("dom id with composite primary key record", () => {
    expect(domId(new Cpk.Book({ id: [1, 123] }))).toBe("cpk_book_1_123");
  });

  it("dom id with prefix", () => {
    record.save();
    expect(domId(record, "edit")).toBe(`edit_${singular}_1`);
  });

  it("dom class", () => {
    expect(domClass(record)).toBe(singular);
  });

  it("dom class with prefix", () => {
    expect(domClass(record, "custom_prefix")).toBe(`custom_prefix_${singular}`);
  });

  it("dom id as singleton method", () => {
    record.save();
    expect(RecordIdentifier.domId(record)).toBe(`${singular}_1`);
  });

  it("dom class as singleton method", () => {
    expect(RecordIdentifier.domClass(record)).toBe(singular);
  });
});

describe("RecordIdentifierWithoutActiveModelTest", () => {
  let record: Plane;

  beforeEach(() => {
    record = new Plane();
  });

  it("dom id with new class", () => {
    expect(domId(Plane)).toBe("new_airplane");
  });

  it("dom id with new record", () => {
    expect(domId(record)).toBe("new_airplane");
  });

  it("dom id with new record and prefix", () => {
    expect(domId(record, "custom_prefix")).toBe("custom_prefix_airplane");
  });

  it("dom id with saved record", () => {
    record.save();
    expect(domId(record)).toBe("airplane_1");
  });

  it("dom id with prefix", () => {
    record.save();
    expect(domId(record, "edit")).toBe("edit_airplane_1");
  });

  it("dom id raises useful error when passed nil", () => {
    expect(() => RecordIdentifier.domId(null)).toThrow(ArgumentError);
  });

  it("dom class", () => {
    expect(domClass(record)).toBe("airplane");
  });

  it("dom class with prefix", () => {
    expect(domClass(record, "custom_prefix")).toBe("custom_prefix_airplane");
  });

  it("dom id as singleton method", () => {
    record.save();
    expect(RecordIdentifier.domId(record)).toBe("airplane_1");
  });

  it("dom class as singleton method", () => {
    expect(RecordIdentifier.domClass(record)).toBe("airplane");
  });
});
