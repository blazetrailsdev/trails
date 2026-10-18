import { describe, it, expect, beforeEach } from "vitest";

import { ArgumentError } from "@blazetrails/ruby-compat";

import { domClass, domId } from "../record-identifier.js";

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
    expect(domId(new CpkBook([1, 123]))).toBe("cpk_book_1_123");
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
    expect(domId(record)).toBe(`${singular}_1`);
  });

  it("dom class as singleton method", () => {
    expect(domClass(record)).toBe(singular);
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
    expect(() => domId(null)).toThrow(ArgumentError);
  });

  it("dom class", () => {
    expect(domClass(record)).toBe("airplane");
  });

  it("dom class with prefix", () => {
    expect(domClass(record, "custom_prefix")).toBe("custom_prefix_airplane");
  });

  it("dom id as singleton method", () => {
    record.save();
    expect(domId(record)).toBe("airplane_1");
  });

  it("dom class as singleton method", () => {
    expect(domClass(record)).toBe("airplane");
  });
});
