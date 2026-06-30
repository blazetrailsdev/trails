/**
 * Mirrors: activerecord/test/cases/date_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { defineSchema } from "./test-helpers/define-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("DateTest", () => {
  // `useHandlerFixtures` wires `setupHandlerSuite` internally, so no separate call.
  // Rails date_test.rb declares no `fixtures`; wiring the canonical `topics`
  // table (and recreating its shape via `{ schema }`) lets the file ride the
  // shared Topic model with a real `last_read` date column instead of an inline
  // scratch table that collided under parallel forks.
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  // Force-recreate the canonical `topics` table to its full shape. Under
  // vitest's per-file module isolation the signature/schema caches reset to
  // canonical each file, so `useHandlerFixtures`' own `{ schema }` `defineSchema`
  // sees a cache-hit and skips the repair — leaving a reduced `topics` shape
  // (e.g. `attribute-methods.test.ts` / `finder.test.ts` both declare a bespoke
  // `topics` with NO `last_read` column) that a sibling handler-suite file
  // co-scheduled earlier in the same fork wrote to the shared worker DB. The
  // date cases below `Topic.create({ last_read })` then fail with a missing
  // `last_read` column — the documented PG flake. `dropExisting` drops +
  // recreates `topics` unconditionally so the column is always present.
  // Registered after `useHandlerFixtures` so this `beforeAll` runs last and wins.
  beforeAll(async () => {
    await defineSchema({ topics: canonicalSchema.topics }, { dropExisting: true });
    // Eagerly resolve the `last_read` date type (Rails loads schema at boot). The
    // `assign valid dates` case below builds `Topic.new` synchronously, so without
    // a warmed type registry the multiparameter assembler can't see `last_read` is
    // a date column — on MariaDB it then yields a non-PlainDate.
    await Topic.loadSchema();
  });

  // Rails: test_date_with_time_value
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

  // Rails: test_date_with_string_value
  it("date with string value", async () => {
    const stringValue = "2016-05-11 19:00:00";
    const topic = await Topic.create({ last_read: stringValue });
    const found = await Topic.findBy({ last_read: stringValue });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(topic.id);
  });

  // Rails: test_assign_valid_dates
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
