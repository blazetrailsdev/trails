import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Types } from "../index.js";
import { assertNil } from "@blazetrails/activesupport";

describe("DateTest", () => {
  const type = new Types.DateType();

  it("type cast date", () => {
    assertNil(type.cast(null));
    assertNil(type.cast(""));
    assertNil(type.cast(" "));
    assertNil(type.cast("ABC"));
    assertNil(type.cast(" ".repeat(129)));

    const now = Temporal.Now.instant().toZonedDateTimeISO("UTC");
    const valuesHash = { 1: now.year, 2: now.month, 3: now.day };
    const dateString = now.toPlainDate().toString();
    expect((type.cast(dateString) as Temporal.PlainDate).toString()).toEqual(dateString);
    expect((type.cast(valuesHash) as Temporal.PlainDate).toString()).toEqual(dateString);
  });

  it("returns correct year", () => {
    const time = new Temporal.PlainDateTime(1, 1, 1).toZonedDateTime("UTC");
    const date = new Temporal.PlainDate(time.year, time.month, time.day);

    const valuesHashForMultiparameterAssignment = { 1: 1, 2: 1, 3: 1 };

    expect(type.cast(valuesHashForMultiparameterAssignment)).toEqual(date);
  });
});
