import { describe, it, expect, beforeEach } from "vitest";

import { ArgumentError } from "@blazetrails/ruby-compat";

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

class Plane {
  static readonly modelName = { paramKey: "airplane" };

  readonly modelName = Plane.modelName;

  private _toKey: unknown[] | null = null;

  toKey(): unknown[] | null {
    return this._toKey;
  }

  save(): void {
    this._toKey = [1];
  }
}

describe("RecordIdentifierWithoutActiveModelTest", () => {
  let record: Plane;

  beforeEach(() => {
    record = new Plane();
  });

  it("test_dom_id_with_new_class", () => {
    expect(domId(Plane)).toBe("new_airplane");
  });

  it("test_dom_id_with_new_record", () => {
    expect(domId(record)).toBe("new_airplane");
  });

  it("test_dom_id_with_new_record_and_prefix", () => {
    expect(domId(record, "custom_prefix")).toBe("custom_prefix_airplane");
  });

  it("test_dom_id_with_saved_record", () => {
    record.save();
    expect(domId(record)).toBe("airplane_1");
  });

  it("test_dom_id_with_prefix", () => {
    record.save();
    expect(domId(record, "edit")).toBe("edit_airplane_1");
  });

  it("test_dom_id_raises_useful_error_when_passed_nil", () => {
    expect(() => domId(null)).toThrow(ArgumentError);
  });

  it("test_dom_class", () => {
    expect(domClass(record)).toBe("airplane");
  });

  it("test_dom_class_with_prefix", () => {
    expect(domClass(record, "custom_prefix")).toBe("custom_prefix_airplane");
  });

  it("test_dom_id_as_singleton_method", () => {
    record.save();
    expect(domId(record)).toBe("airplane_1");
  });

  it("test_dom_class_as_singleton_method", () => {
    expect(domClass(record)).toBe("airplane");
  });
});
