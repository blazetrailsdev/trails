import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import type { DatabaseAdapter } from "./adapter.js";

let adapter: DatabaseAdapter;

beforeAll(() => {
  adapter = createTestAdapter();
});
beforeEach(async () => {
  await defineSchema(adapter, { events: { start_date: "date" } });
});
afterAll(async () => {
  await dropAllTables(adapter);
});

describe("DateTest", () => {
  it("date with time value", async () => {
    class Event extends Base {
      static {
        this.attribute("start_date", "date");
        this.adapter = adapter;
      }
    }
    const e = await Event.create({ start_date: "2024-01-15" });
    const reloaded = await Event.find(e.id);
    expect(reloaded.start_date).toBeInstanceOf(Temporal.PlainDate);
  });

  it("date with string value", async () => {
    class Event extends Base {
      static {
        this.attribute("start_date", "date");
        this.adapter = adapter;
      }
    }
    const e = await Event.create({ start_date: "2024-01-15" });
    const reloaded = await Event.find(e.id);
    const val = reloaded.start_date as Temporal.PlainDate;
    expect(val).toBeInstanceOf(Temporal.PlainDate);
    expect(val.year).toBe(2024);
  });

  it.skip("assign valid dates", () => {
    // BLOCKED: type — date/time precision type gap in date
    // ROOT-CAUSE: type/date-time.ts or type/time.ts#precision not fully matching Rails cast/serialize behavior
    // SCOPE: ~30 LOC fix in type/date-time.ts or type/time.ts; affects ~8–18 tests in date.test.ts
  });
});
