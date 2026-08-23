import { describe, expect, it } from "vitest";

import { actsLikeDate, actsLikeTime } from "./acts-like.js";
import { Date, DateTime } from "./date.js";
import { Time } from "./time.js";

describe("acts_like", () => {
  it("Date#acts_like_date?", () => {
    expect(actsLikeDate(Date.parse("2005-02-21"))).toBe(true);
    expect(actsLikeTime(Date.parse("2005-02-21"))).toBe(false);
  });

  it("DateTime#acts_like_date?", () => {
    expect(actsLikeDate(DateTime.parse("2005-02-21T10:11:12"))).toBe(true);
    expect(actsLikeDate(DateTime.parse("2005-02-21T10:11:12+01:00"))).toBe(true);
  });

  it("DateTime#acts_like_time?", () => {
    expect(actsLikeTime(DateTime.parse("2005-02-21T10:11:12"))).toBe(true);
    expect(actsLikeTime(DateTime.parse("2005-02-21T10:11:12+01:00"))).toBe(true);
  });

  it("Time#acts_like_time?", () => {
    expect(actsLikeTime(Time.now())).toBe(true);
    expect(actsLikeDate(Time.now())).toBe(false);
  });
});
