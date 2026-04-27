import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("DateTest", () => {
  it("date with time value", async () => {
    const adapter = createTestAdapter();
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
    const adapter = createTestAdapter();
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

  it.skip("assign valid dates", () => {});
});
