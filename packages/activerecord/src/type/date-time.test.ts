import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { DateTime } from "./date-time.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { dropAllTables } from "../test-helpers/drop-all-tables.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("DateTimeTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, { tasks: { starting: "datetime" } });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
    vi.unstubAllEnvs();
  });

  it.skip("datetime seconds precision applied to timestamp", async () => {
    // BLOCKED: datetime deserialization — reload() returns null for datetime column
    // ROOT-CAUSE: test-adapter doesn't deserialize datetime strings back to Date/Temporal
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new DateTime({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
