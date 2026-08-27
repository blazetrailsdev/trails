import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { Table, Visitors } from "../index.js";

describe("MathTest", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);

  it("average should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").average().multiply(2)))).toBe(
      mustBeLike(`
        AVG("users"."id") * 2
      `),
    );
  });

  it("count should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").count().multiply(2)))).toBe(
      mustBeLike(`
        COUNT("users"."id") * 2
      `),
    );
  });

  it("maximum should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").maximum().multiply(2)))).toBe(
      mustBeLike(`
        MAX("users"."id") * 2
      `),
    );
  });

  it("minimum should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").minimum().multiply(2)))).toBe(
      mustBeLike(`
        MIN("users"."id") * 2
      `),
    );
  });

  it("attribute node should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").multiply(2)))).toBe(
      mustBeLike(`
        "users"."id" * 2
      `),
    );
  });

  it("average should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").average().add(2)))).toBe(
      mustBeLike(`
        (AVG("users"."id") + 2)
      `),
    );
  });

  it("count should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").count().add(2)))).toBe(
      mustBeLike(`
        (COUNT("users"."id") + 2)
      `),
    );
  });

  it("maximum should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").maximum().add(2)))).toBe(
      mustBeLike(`
        (MAX("users"."id") + 2)
      `),
    );
  });

  it("minimum should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").minimum().add(2)))).toBe(
      mustBeLike(`
        (MIN("users"."id") + 2)
      `),
    );
  });

  it("attribute node should be compatible with ", () => {
    const table = new Table("users");
    expect(mustBeLike(visitor.compile(table.get("id").add(2)))).toBe(
      mustBeLike(`
        ("users"."id" + 2)
      `),
    );
  });
});
