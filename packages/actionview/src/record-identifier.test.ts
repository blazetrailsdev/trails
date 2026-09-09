import { describe, it, expect, beforeEach } from "vitest";

import { domClass, domId } from "./record-identifier.js";

class Comment {
  static readonly modelName = { paramKey: "comment" };

  readonly modelName = Comment.modelName;

  id: number | null = null;

  save(): void {
    this.id = 1;
  }

  toKey(): unknown[] | null {
    return this.id == null ? null : [this.id];
  }
}

class CpkBook {
  readonly modelName = { paramKey: "cpk_book" };

  constructor(private readonly id: unknown[]) {}

  toKey(): unknown[] {
    return this.id;
  }
}

describe("RecordIdentifierTest", () => {
  const singular = "comment";
  let record: Comment;

  beforeEach(() => {
    record = new Comment();
  });

  it("test_dom_id_with_class", () => {
    expect(domId(Comment)).toBe(`new_${singular}`);
  });

  it("test_dom_id_with_new_record", () => {
    expect(domId(record)).toBe(`new_${singular}`);
  });

  it("test_dom_id_with_new_record_and_prefix", () => {
    expect(domId(record, "custom_prefix")).toBe(`custom_prefix_${singular}`);
  });

  it("test_dom_id_with_saved_record", () => {
    record.save();
    expect(domId(record)).toBe(`${singular}_1`);
  });

  it("test_dom_id_with_composite_primary_key_record", () => {
    expect(domId(new CpkBook([1, 123]))).toBe("cpk_book_1_123");
  });

  it("test_dom_id_with_prefix", () => {
    record.save();
    expect(domId(record, "edit")).toBe(`edit_${singular}_1`);
  });

  it("test_dom_class", () => {
    expect(domClass(record)).toBe(singular);
  });

  it("test_dom_class_with_prefix", () => {
    expect(domClass(record, "custom_prefix")).toBe(`custom_prefix_${singular}`);
  });
});
