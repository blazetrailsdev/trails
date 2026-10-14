import { beforeEach, describe, it, expect } from "vitest";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { Date } from "./date.js";
import { Time } from "./time.js";

describe("Psych::TestScalarScanner", () => {
  let ss: Psych.ScalarScanner;

  beforeEach(() => {
    ss = new Psych.ScalarScanner(new Psych.ClassLoader());
  });

  it("scan time", () => {
    const cases: [string, Time][] = [
      ["2001-12-15T02:59:43.1Z", Time.utc(2001, 12, 15, 2, 59, 43, 100000)],
      ["2001-12-14t21:59:43.10-05:00", Time.utc(2001, 12, 15, 2, 59, 43, 100000)],
      ["2001-12-14 21:59:43.10 -5", Time.utc(2001, 12, 15, 2, 59, 43, 100000)],
      ["2001-12-15 2:59:43.10", Time.utc(2001, 12, 15, 2, 59, 43, 100000)],
      ["2011-02-24 11:17:06 -0800", Time.utc(2011, 2, 24, 19, 17, 6)],
    ];
    for (const [timeStr, time] of cases) {
      const token = ss.tokenize(timeStr);
      expect(token).toBeInstanceOf(Time);
      expect(time.eql(token), timeStr).toBe(true);
    }
  });

  it("scan bad time", () => {
    for (const timeStr of [
      "2001-12-15T02:59:73.1Z",
      "2001-12-14t90:59:43.10-05:00",
      "2001-92-14 21:59:43.10 -5",
      "2001-12-15 92:59:43.10",
      "2011-02-24 81:17:06 -0800",
    ]) {
      expect(ss.tokenize(timeStr)).toBe(timeStr);
    }
  });

  it("scan bad dates", () => {
    let x = "2000-15-01";
    expect(ss.tokenize(x)).toBe(x);

    x = "2000-10-51";
    expect(ss.tokenize(x)).toBe(x);

    x = "2000-10-32";
    expect(ss.tokenize(x)).toBe(x);
  });

  it("scan good edge date", () => {
    const x = "2000-1-31";
    expect(
      Date.strptime(x, "%Y-%m-%d").equals(ss.tokenize(x) as ReturnType<typeof Date.strptime>),
    ).toBe(true);
  });

  it("scan bad edge date", () => {
    const x = "2000-11-31";
    expect(ss.tokenize(x)).toBe(x);
  });

  it("scan date", () => {
    const date = "1980-12-16";
    const token = ss.tokenize(date) as ReturnType<typeof Date.strptime>;
    expect(token.year).toBe(1980);
    expect(token.month).toBe(12);
    expect(token.day).toBe(16);
  });
});
