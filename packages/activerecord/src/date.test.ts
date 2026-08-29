import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("DateTest", () => {
  fixtures(["topics"]);

  beforeAll(async () => {
    await Topic.loadSchema();
  });

  it("date with time value", async () => {
    const timeValue = Temporal.PlainDateTime.from({
      year: 2016,
      month: 5,
      day: 11,
      hour: 19,
    });
    const topic = await Topic.create({ last_read: timeValue });
    const found = await Topic.findBy({ last_read: timeValue });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(topic.id);
  });

  it("date with string value", async () => {
    const stringValue = "2016-05-11 19:00:00";
    const topic = await Topic.create({ last_read: stringValue });
    const found = await Topic.findBy({ last_read: stringValue });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(topic.id);
  });

  it("assign valid dates", () => {
    const validDates: Array<[number, number, number]> = [
      [2007, 11, 30],
      [1993, 2, 28],
      [2008, 2, 29],
    ];

    const invalidDates: Array<[[number, number, number], [number, number, number]]> = [
      [
        [2007, 11, 31],
        [2007, 12, 1],
      ],
      [
        [1993, 2, 29],
        [1993, 3, 1],
      ],
      [
        [2007, 2, 29],
        [2007, 3, 1],
      ],
    ];

    for (const [y, m, d] of validDates) {
      const topic = Topic.new({
        "last_read(1i)": String(y),
        "last_read(2i)": String(m),
        "last_read(3i)": String(d),
      });
      expect(topic.last_read.equals(Temporal.PlainDate.from({ year: y, month: m, day: d }))).toBe(
        true,
      );
    }

    for (const [[y, m, d], [ey, em, ed]] of invalidDates) {
      const topic = Topic.new({
        "last_read(1i)": String(y),
        "last_read(2i)": String(m),
        "last_read(3i)": String(d),
      });
      expect(
        topic.last_read.equals(Temporal.PlainDate.from({ year: ey, month: em, day: ed })),
      ).toBe(true);
    }
  });
});
