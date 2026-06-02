import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ events: { start_date: "date" } });
});
describe("DateTest", () => {
  it("date with time value", async () => {
    class Event extends Base {
      static {
        this.attribute("start_date", "date");
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
      }
    }
    const e = await Event.create({ start_date: "2024-01-15" });
    const reloaded = await Event.find(e.id);
    const val = reloaded.start_date as Temporal.PlainDate;
    expect(val).toBeInstanceOf(Temporal.PlainDate);
    expect(val.year).toBe(2024);
  });

  it("assign valid dates", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
      }
    }

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
