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
    const date = new Date(2024, 0, 15);
    const e = await Event.create({ start_date: date });
    const reloaded = await Event.find(e.id);
    const val = reloaded.readAttribute("start_date");
    expect(val).not.toBeNull();
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
    const val = reloaded.readAttribute("start_date");
    expect(val).not.toBeNull();
    expect(String(val)).toContain("2024");
  });

  it("assign valid dates", () => {
    const adapter = createTestAdapter();
    class Event extends Base {
      static {
        this.attribute("start_date", "date");
        this.adapter = adapter;
      }
    }
    const e = new Event();
    e.writeAttribute("start_date", "2024-06-15");
    expect(e.readAttribute("start_date")).not.toBeNull();
    e.writeAttribute("start_date", new Date(2024, 5, 15));
    expect(e.readAttribute("start_date")).not.toBeNull();
  });
});
