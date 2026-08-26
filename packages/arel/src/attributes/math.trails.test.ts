import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Visitors } from "../index.js";

// TS-only exhaustive coverage. Rails' math_test.rb
// (activerecord/test/cases/arel/attributes/math_test.rb:8-42, 44-78) loops
// `%i[* /]` and `%i[+ - & | ^ << >>]` and interpolates the operator into the
// test name, so its ten test bodies already cover every operator; the mirrored
// names in math.test.ts are the interpolation-stripped ones. These cases pin
// one operator each against its exact SQL and have no Rails counterpart.
describe("MathTest (trails)", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const table = new Table("users");

  it("average should be compatible with *", () => {
    expect(visitor.compile(table.get("id").average().multiply(2))).toBe('AVG("users"."id") * 2');
  });

  it("count should be compatible with *", () => {
    expect(visitor.compile(table.get("id").count().multiply(2))).toBe('COUNT("users"."id") * 2');
  });

  it("maximum should be compatible with *", () => {
    expect(visitor.compile(table.get("id").maximum().multiply(2))).toBe('MAX("users"."id") * 2');
  });

  it("minimum should be compatible with *", () => {
    expect(visitor.compile(table.get("id").minimum().multiply(2))).toBe('MIN("users"."id") * 2');
  });

  it("attribute node should be compatible with *", () => {
    expect(visitor.compile(table.get("id").multiply(2))).toBe('"users"."id" * 2');
  });

  it("average should be compatible with /", () => {
    expect(visitor.compile(table.get("id").average().divide(2))).toBe('AVG("users"."id") / 2');
  });

  it("count should be compatible with /", () => {
    expect(visitor.compile(table.get("id").count().divide(2))).toBe('COUNT("users"."id") / 2');
  });

  it("maximum should be compatible with /", () => {
    expect(visitor.compile(table.get("id").maximum().divide(2))).toBe('MAX("users"."id") / 2');
  });

  it("minimum should be compatible with /", () => {
    expect(visitor.compile(table.get("id").minimum().divide(2))).toBe('MIN("users"."id") / 2');
  });

  it("attribute node should be compatible with /", () => {
    expect(visitor.compile(table.get("id").divide(2))).toBe('"users"."id" / 2');
  });

  it("average should be compatible with +", () => {
    expect(visitor.compile(table.get("id").average().add(2))).toBe('(AVG("users"."id") + 2)');
  });

  it("count should be compatible with +", () => {
    expect(visitor.compile(table.get("id").count().add(2))).toBe('(COUNT("users"."id") + 2)');
  });

  it("maximum should be compatible with +", () => {
    expect(visitor.compile(table.get("id").maximum().add(2))).toBe('(MAX("users"."id") + 2)');
  });

  it("minimum should be compatible with +", () => {
    expect(visitor.compile(table.get("id").minimum().add(2))).toBe('(MIN("users"."id") + 2)');
  });

  it("attribute node should be compatible with +", () => {
    expect(visitor.compile(table.get("id").add(2))).toBe('("users"."id" + 2)');
  });

  it("average should be compatible with -", () => {
    expect(visitor.compile(table.get("id").average().subtract(2))).toBe('(AVG("users"."id") - 2)');
  });

  it("count should be compatible with -", () => {
    expect(visitor.compile(table.get("id").count().subtract(2))).toBe('(COUNT("users"."id") - 2)');
  });

  it("maximum should be compatible with -", () => {
    expect(visitor.compile(table.get("id").maximum().subtract(2))).toBe('(MAX("users"."id") - 2)');
  });

  it("minimum should be compatible with -", () => {
    expect(visitor.compile(table.get("id").minimum().subtract(2))).toBe('(MIN("users"."id") - 2)');
  });

  it("attribute node should be compatible with -", () => {
    expect(visitor.compile(table.get("id").subtract(2))).toBe('("users"."id" - 2)');
  });

  it("average should be compatible with &", () => {
    expect(visitor.compile(table.get("id").average().bitwiseAnd(2))).toBe(
      '(AVG("users"."id") & 2)',
    );
  });

  it("count should be compatible with &", () => {
    expect(visitor.compile(table.get("id").count().bitwiseAnd(2))).toBe(
      '(COUNT("users"."id") & 2)',
    );
  });

  it("maximum should be compatible with &", () => {
    expect(visitor.compile(table.get("id").maximum().bitwiseAnd(2))).toBe(
      '(MAX("users"."id") & 2)',
    );
  });

  it("minimum should be compatible with &", () => {
    expect(visitor.compile(table.get("id").minimum().bitwiseAnd(2))).toBe(
      '(MIN("users"."id") & 2)',
    );
  });

  it("attribute node should be compatible with &", () => {
    expect(visitor.compile(table.get("id").bitwiseAnd(2))).toBe('("users"."id" & 2)');
  });

  it("average should be compatible with |", () => {
    expect(visitor.compile(table.get("id").average().bitwiseOr(2))).toBe('(AVG("users"."id") | 2)');
  });

  it("count should be compatible with |", () => {
    expect(visitor.compile(table.get("id").count().bitwiseOr(2))).toBe('(COUNT("users"."id") | 2)');
  });

  it("maximum should be compatible with |", () => {
    expect(visitor.compile(table.get("id").maximum().bitwiseOr(2))).toBe('(MAX("users"."id") | 2)');
  });

  it("minimum should be compatible with |", () => {
    expect(visitor.compile(table.get("id").minimum().bitwiseOr(2))).toBe('(MIN("users"."id") | 2)');
  });

  it("attribute node should be compatible with |", () => {
    expect(visitor.compile(table.get("id").bitwiseOr(2))).toBe('("users"."id" | 2)');
  });

  it("average should be compatible with ^", () => {
    expect(visitor.compile(table.get("id").average().bitwiseXor(2))).toBe(
      '(AVG("users"."id") ^ 2)',
    );
  });

  it("count should be compatible with ^", () => {
    expect(visitor.compile(table.get("id").count().bitwiseXor(2))).toBe(
      '(COUNT("users"."id") ^ 2)',
    );
  });

  it("maximum should be compatible with ^", () => {
    expect(visitor.compile(table.get("id").maximum().bitwiseXor(2))).toBe(
      '(MAX("users"."id") ^ 2)',
    );
  });

  it("minimum should be compatible with ^", () => {
    expect(visitor.compile(table.get("id").minimum().bitwiseXor(2))).toBe(
      '(MIN("users"."id") ^ 2)',
    );
  });

  it("attribute node should be compatible with ^", () => {
    expect(visitor.compile(table.get("id").bitwiseXor(2))).toBe('("users"."id" ^ 2)');
  });

  it("average should be compatible with <<", () => {
    expect(visitor.compile(table.get("id").average().bitwiseShiftLeft(2))).toBe(
      '(AVG("users"."id") << 2)',
    );
  });

  it("count should be compatible with <<", () => {
    expect(visitor.compile(table.get("id").count().bitwiseShiftLeft(2))).toBe(
      '(COUNT("users"."id") << 2)',
    );
  });

  it("maximum should be compatible with <<", () => {
    expect(visitor.compile(table.get("id").maximum().bitwiseShiftLeft(2))).toBe(
      '(MAX("users"."id") << 2)',
    );
  });

  it("minimum should be compatible with <<", () => {
    expect(visitor.compile(table.get("id").minimum().bitwiseShiftLeft(2))).toBe(
      '(MIN("users"."id") << 2)',
    );
  });

  it("attribute node should be compatible with <<", () => {
    expect(visitor.compile(table.get("id").bitwiseShiftLeft(2))).toBe('("users"."id" << 2)');
  });

  it("average should be compatible with >>", () => {
    expect(visitor.compile(table.get("id").average().bitwiseShiftRight(2))).toBe(
      '(AVG("users"."id") >> 2)',
    );
  });

  it("count should be compatible with >>", () => {
    expect(visitor.compile(table.get("id").count().bitwiseShiftRight(2))).toBe(
      '(COUNT("users"."id") >> 2)',
    );
  });

  it("maximum should be compatible with >>", () => {
    expect(visitor.compile(table.get("id").maximum().bitwiseShiftRight(2))).toBe(
      '(MAX("users"."id") >> 2)',
    );
  });

  it("minimum should be compatible with >>", () => {
    expect(visitor.compile(table.get("id").minimum().bitwiseShiftRight(2))).toBe(
      '(MIN("users"."id") >> 2)',
    );
  });

  it("attribute node should be compatible with >>", () => {
    expect(visitor.compile(table.get("id").bitwiseShiftRight(2))).toBe('("users"."id" >> 2)');
  });
});
