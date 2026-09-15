import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { asJson } from "./json.js";

describe("JsonCherryPickTest", () => {
  it("time as json", () => {
    const expected = new Date(2004, 6, 25);
    const actual = new Date(asJson(expected) as string);
    expect(actual.getTime()).toEqual(expected.getTime());
  });

  it("date as json", () => {
    const expected = Temporal.PlainDate.from({ year: 2004, month: 7, day: 25 });
    const actual = Temporal.PlainDate.from(asJson(expected) as string);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("datetime as json", () => {
    const expected = Temporal.PlainDateTime.from({ year: 2004, month: 7, day: 25 });
    const actual = Temporal.PlainDateTime.from(asJson(expected) as string);
    expect(actual.toString()).toEqual(expected.toString());
  });
});
