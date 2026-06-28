import { describe, it, expect } from "vitest";
import { assertCanonicalSchema, OneSchemaViolation } from "./one-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";

describe("assertCanonicalSchema", () => {
  it("accepts the full canonical schema", () => {
    expect(() => assertCanonicalSchema(TEST_SCHEMA)).not.toThrow();
  });

  it("accepts a subset of canonical tables", () => {
    expect(() => assertCanonicalSchema({ topics: TEST_SCHEMA.topics })).not.toThrow();
  });

  it("accepts a subset of a canonical table's columns", () => {
    expect(() => assertCanonicalSchema({ topics: { title: "string" } })).not.toThrow();
  });

  it("accepts an under-specified column (omitting canonical options)", () => {
    // Canonical topics.title is { type: "string", limit: 250 }; the bare
    // "string" form is compatible — the real column keeps its limit.
    expect(() => assertCanonicalSchema({ topics: { title: "string" } })).not.toThrow();
  });

  it("rejects a table not in canonical", () => {
    expect(() => assertCanonicalSchema({ not_a_real_table: { x: "string" } })).toThrow(
      OneSchemaViolation,
    );
  });

  it("rejects a column not on the canonical table", () => {
    expect(() => assertCanonicalSchema({ topics: { score: "integer" } })).toThrow(
      OneSchemaViolation,
    );
  });

  it("rejects a column whose type conflicts with canonical", () => {
    // Canonical topics.title is a string; declaring it an integer conflicts.
    expect(() => assertCanonicalSchema({ topics: { title: "integer" } })).toThrow(
      OneSchemaViolation,
    );
  });

  it("rejects a column whose option value conflicts with canonical", () => {
    expect(() =>
      assertCanonicalSchema({ topics: { title: { type: "string", limit: 99 } } }),
    ).toThrow(OneSchemaViolation);
  });

  it("rejects an unwrapped request against a composite-PK canonical table", () => {
    // toys is `primaryKey: ["toy_id"]`; an unwrapped request implies a default
    // `id` column, a different PK shape than canonical.
    expect(() => assertCanonicalSchema({ toys: { name: "string" } })).toThrow(OneSchemaViolation);
  });

  it("accepts a wrapped request that declares the canonical composite PK", () => {
    expect(() =>
      assertCanonicalSchema({ toys: { columns: { name: "string" }, primaryKey: ["toy_id"] } }),
    ).not.toThrow();
  });

  it("accepts a matching auto-named index", () => {
    expect(() =>
      assertCanonicalSchema({
        citations: { columns: { book1_id: "big_integer" }, indexes: [{ columns: "book1_id" }] },
      }),
    ).not.toThrow();
  });

  it("rejects an index declared with a name the canonical index lacks", () => {
    // citations' canonical index on book1_id is auto-named; a custom name is a
    // genuinely different index (Rails passes options[:name] through add_index).
    expect(() =>
      assertCanonicalSchema({
        citations: {
          columns: { book1_id: "big_integer" },
          indexes: [{ columns: "book1_id", name: "custom_name" }],
        },
      }),
    ).toThrow(OneSchemaViolation);
  });
});
