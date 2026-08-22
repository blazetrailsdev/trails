import { DateTime, Date as RubyDate, Time } from "@blazetrails/date";
import { afterEach, describe, expect, it } from "vitest";

import { travelBack, travelTo } from "./time-helpers.js";

/**
 * `travel_to` stubs `Time.now`, `Date.today` and `DateTime.now`
 * (active_support/testing/time_helpers.rb:177-190). trails has no Rails test
 * that reads those receivers, so the coverage lives here.
 */
describe("TimeHelpersStubbedReceivers", () => {
  afterEach(() => {
    travelBack();
  });

  it("stubs Time.now", () => {
    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));

    expect(Time.now().getutc().toS()).toBe("2004-11-24 01:04:44 UTC");
  });

  it("stubs Date.today", () => {
    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));

    expect(RubyDate.today().toString()).toBe(Time.now().toDate().toString());
  });

  it("stubs DateTime.now", () => {
    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));

    const now = DateTime.now();
    expect(now.year).toBe(Time.now().year);
    expect(now.hour).toBe(Time.now().hour);
    expect(now.minute).toBe(Time.now().min);
    expect(now.second).toBe(Time.now().sec);
  });

  it("restores the real receivers on travel_back", () => {
    const realNow = Time.now;
    const realToday = RubyDate.today;
    const realDateTimeNow = DateTime.now;

    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));
    travelBack();

    expect(Time.now).toBe(realNow);
    expect(RubyDate.today).toBe(realToday);
    expect(DateTime.now).toBe(realDateTimeNow);
  });
});

describe("TimeHelpersStubbedTimeNew", () => {
  afterEach(() => {
    travelBack();
  });

  it("stubs Time.new with no arguments", () => {
    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));

    expect(Time.new().getutc().toS()).toBe("2004-11-24 01:04:44 UTC");
  });

  it("passes arguments through to the original Time.new", () => {
    travelTo(Time.utc(2004, 11, 24, 1, 4, 44));

    expect(Time.new(1999, 12, 31, 23, 59, 59).toS()).toBe(
      Time.local(1999, 12, 31, 23, 59, 59).toS(),
    );
  });
});
