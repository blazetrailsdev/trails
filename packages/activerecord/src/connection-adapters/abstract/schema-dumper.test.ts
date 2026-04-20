import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";

const emptySource: SchemaSource = {
  tables: () => [],
  columns: () => [],
  indexes: () => [],
};

describe("SchemaDumper", () => {
  it("create returns a SchemaDumper instance", () => {
    const dumper = SchemaDumper.create(emptySource);
    expect(dumper).toBeInstanceOf(SchemaDumper);
  });

  it("create accepts options", () => {
    const dumper = SchemaDumper.create(emptySource, { tableNamePrefix: "app_" });
    expect(dumper).toBeInstanceOf(SchemaDumper);
  });

  it("DEFAULT_DATETIME_PRECISION is 6", () => {
    expect(SchemaDumper.DEFAULT_DATETIME_PRECISION).toBe(6);
  });
});
