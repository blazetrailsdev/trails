import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Topic } from "./test-helpers/models/topic.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: TEST_SCHEMA.topics });
  await Topic.loadSchema();
});

describe("DateTest", () => {
  it("date with time value", async () => {
    const timeValue = Temporal.PlainDateTime.from({
      year: 2016,
      month: 5,
      day: 11,
      hour: 19,
    });
    const topic = await Topic.create({ last_read: timeValue });
    const found = await Topic.findBy({ last_read: timeValue });
    expect(found!.id).toBe(topic.id);
  });

  it("date with string value", async () => {
    const stringValue = "2016-05-11 19:00:00";
    const topic = await Topic.create({ last_read: stringValue });
    const found = await Topic.findBy({ last_read: stringValue });
    expect(found!.id).toBe(topic.id);
  });

  it("assign valid dates", () => {
    const validDates: Array<[number, number, number]> = [
      [2007, 11, 30],
      [1993, 2, 28],
      [2008, 2, 29],
    ];

    // Rails: invalid multiparameter dates roll over the way Time does
    // (Date.new raises → rescued → instantiate_time_object(...).to_date),
    // so Nov 31 → Dec 1 and Feb 29 in a common year → Mar 1.
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
      }) as unknown as { last_read: Temporal.PlainDate };
      expect(topic.last_read.equals(Temporal.PlainDate.from({ year: y, month: m, day: d }))).toBe(
        true,
      );
    }

    for (const [[y, m, d], [ey, em, ed]] of invalidDates) {
      const topic = Topic.new({
        "last_read(1i)": String(y),
        "last_read(2i)": String(m),
        "last_read(3i)": String(d),
      }) as unknown as { last_read: Temporal.PlainDate };
      expect(
        topic.last_read.equals(Temporal.PlainDate.from({ year: ey, month: em, day: ed })),
      ).toBe(true);
    }
  });
});
