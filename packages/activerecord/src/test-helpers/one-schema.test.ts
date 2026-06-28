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
});
