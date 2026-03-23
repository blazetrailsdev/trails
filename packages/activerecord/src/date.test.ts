import { describe, it, expect } from "vitest";
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
    const date = new Date(2024, 0, 15, 10, 30, 0);
    const e = await Event.create({ start_date: date });
    const reloaded = await Event.find(e.id);
    const val = reloaded.start_date;
    expect(val).toBeInstanceOf(Date);
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
    const val = reloaded.start_date;
    expect(val).toBeInstanceOf(Date);
    expect((val as Date).getFullYear()).toBe(2024);
  });

  it.skip("assign valid dates", () => {});
});
