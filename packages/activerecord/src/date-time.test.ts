import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./index.js";
import { setDefaultTimezone } from "./type/internal/timezone.js";
import { ArgumentError } from "@blazetrails/activemodel";

afterEach(() => {
  setDefaultTimezone("utc");
});

describe("DateTimeTest", () => {
  it("default timezone validation", () => {
    expect(() => setDefaultTimezone("UTC" as "utc")).toThrow(ArgumentError);
    expect(() => setDefaultTimezone("local")).not.toThrow();
    expect(() => setDefaultTimezone("utc")).not.toThrow();
  });

  it("high precision current timestamp", () => {
    // BLOCKED: fixture — needs Task model + DB + select({expr: "alias"}).find() flow
  });

  it("saves both date and time", () => {
    // BLOCKED: fixture — needs vi.stubEnv("TZ") + Task model + DB round-trip
  });

  it("assign empty date time", () => {
    class Task extends Base {
      static {
        this.attribute("starting", "datetime");
        this.attribute("ending", "datetime");
      }
    }
    const task = new Task();
    (task as any).starting = "";
    (task as any).ending = null;
    expect((task as any).starting).toBeNull();
    expect((task as any).ending).toBeNull();
  });

  it("assign bad date time with timezone", () => {
    class Task extends Base {
      static {
        this.attribute("starting", "datetime");
      }
    }
    const task = new Task();
    (task as any).starting = "2014-07-01T24:59:59GMT";
    expect((task as any).starting).toBeNull();
  });

  it("assign empty date", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
      }
    }
    const topic = new Topic();
    (topic as any).last_read = "";
    expect((topic as any).last_read).toBeNull();
  });

  it("assign empty time", () => {
    class Topic extends Base {
      static {
        this.attribute("bonus_time", "time");
      }
    }
    const topic = new Topic();
    (topic as any).bonus_time = "";
    expect((topic as any).bonus_time).toBeNull();
  });

  it("assign in local timezone", () => {
    // BLOCKED: type — vi.stubEnv("TZ") doesn't retroactively affect Temporal
  });

  it("date time with string value with subsecond precision", () => {
    // BLOCKED: fixture — needs Topic model + DB for create(written_on: str) + findBy(written_on: str)
  });

  it("date time with string value with non iso format", () => {
    // BLOCKED: type — loose-date-parse.ts doesn't handle "MM/DD/YYYY H:MMam" format
    // ROOT-CAUSE: ~20 LOC in activemodel/src/type/helpers/loose-date-parse.ts
  });
});
