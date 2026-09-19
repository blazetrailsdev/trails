import { describe, it, expect, afterEach } from "vitest";
import { assertRaises, assertInDelta } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { Task } from "./test-helpers/models/task.js";
import { Topic } from "./test-helpers/models/topic.js";
import { withTimezoneConfig } from "./test-helper.js";
import { Base } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { setDefaultTimezone } from "./active-record.js";

afterEach(() => {
  setDefaultTimezone("utc");
});

describe("DateTimeTest", () => {
  fixtures({});

  it("default timezone validation", async () => {
    await assertRaises([ArgumentError], {}, () => {
      setDefaultTimezone("UTC" as "utc");
    });

    setDefaultTimezone("local");
    setDefaultTimezone("utc");
  });

  it("high precision current timestamp", async () => {
    const currentTimestamp = await Task.withConnection((conn) =>
      conn.highPrecisionCurrentTimestamp(),
    );

    let task = await Task.createBang();
    task = await Task.select({ [currentTimestamp.toString()]: "starting" }).find(task.id);

    assertInDelta(RubyTime.now().toF(), (task.starting as RubyTime).toF(), 1);
  });

  it("saves both date and time", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      const now = RubyTime.utc(1807, 2, 10, 15, 30, 45);

      const task = new Task();
      task.starting = now;
      await task.saveBang();

      expect((await Task.find(task.id)).starting).toEqual(now);
    });
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

  it("assign in local timezone", async () => {
    const now = RubyTime.utc(2017, 3, 1, 12, 0, 0);
    await withTimezoneConfig({ default: "local" }, () => {
      const task = new Task({ starting: now });
      expect(task.starting).toEqual(now);
    });
  });

  it("date time with string value with subsecond precision", async () => {
    const stringValue = "2017-07-04 14:19:00.5";
    const topic = await Topic.create({ written_on: stringValue });
    expect(topic.equals(await Topic.findBy({ written_on: stringValue }))).toBe(true);
  });

  it("date time with string value with non iso format", async () => {
    const stringValue = "04/07/2017 2:19pm";
    const topic = await Topic.create({ written_on: stringValue });
    expect(topic.equals(await Topic.findBy({ written_on: stringValue }))).toBe(true);
  });
});
