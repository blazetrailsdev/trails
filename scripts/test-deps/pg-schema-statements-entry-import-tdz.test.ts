import { SchemaStatements } from "../../packages/activerecord/src/connection-adapters/postgresql/schema-statements.js";
import { describe, it, expect } from "vitest";

describe("postgresql schema-statements entry circular-init", () => {
  it("imports SchemaStatements (value) without a TDZ ReferenceError", () => {
    expect(SchemaStatements).toBeDefined();
  });
});
