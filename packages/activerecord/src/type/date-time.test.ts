import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateTime } from "./date-time.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { dropAllTables } from "../test-helpers/drop-all-tables.js";
import { Base } from "../index.js";

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

  it("datetime seconds precision applied to timestamp", async () => {
    class Task extends Base {
      static override tableName = "tasks";
      static {
        this.attribute("starting", "datetime");
        this.adapter = adapter;
      }
    }

    const starting = Temporal.Instant.from("2001-02-03T04:05:06.789012Z");
    const p = await (Task as any).create({ starting });
    const reloaded = await (Task as any).find(p.id);
    expect((reloaded as any).starting.epochMicroseconds).toBe(
      (p as any).starting.epochMicroseconds,
    );
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new DateTime({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
