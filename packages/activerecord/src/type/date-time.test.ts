import { describe, it, expect, afterAll, vi } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateTime } from "./date-time.js";
import { Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
fixtures([]);
describe("DateTimeTest", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("datetime seconds precision applied to timestamp", async () => {
    class Task extends Base {
      static override tableName = "tasks";
      static {
        this.attribute("starting", "datetime");
      }
    }

    const starting = Temporal.Instant.from("2001-02-03T04:05:06.789012Z");
    const p = await (Task as any).create({ starting });
    const reloaded = await (Task as any).find(p.id);
    expect(reloaded.starting.epochMicroseconds).toBe(p.starting.epochMicroseconds);
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new DateTime({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
