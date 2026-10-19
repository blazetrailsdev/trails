import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Date as RubyDate } from "@blazetrails/date";
import {
  selectDate,
  distanceOfTimeInWords,
  distanceOfTimeInWordsToNow,
  timeAgoInWords,
} from "../helpers/date-helper.js";

const SECOND = 1000;

describe("DateHelperTest", () => {
  it("accepts the Temporal.Instant ActiveRecord returns for a datetime column", () => {
    const from = Temporal.Instant.fromEpochMilliseconds(Date.UTC(2004, 5, 6, 21, 45, 0));
    const to = Temporal.Instant.fromEpochMilliseconds(Date.UTC(2004, 5, 6, 22, 45, 0));
    expect(distanceOfTimeInWords(from, to)).toBe("about 1 hour");
    expect(timeAgoInWords(Temporal.Instant.fromEpochMilliseconds(Date.now() - 60_000))).toBe(
      "1 minute",
    );
  });

  it("aliases distance_of_time_in_words_to_now to time_ago_in_words", () => {
    const past = new Date(Date.now() - 15 * SECOND);
    expect(distanceOfTimeInWordsToNow(past, { includeSeconds: true })).toBe("less than 20 seconds");
  });

  it("supports custom scope via I18n lookup", () => {
    expect(distanceOfTimeInWords(0, 60, { scope: "datetime.distance_in_words" })).toBe("1 minute");
  });

  it("selects a Date class instance with discard_day", () => {
    const date = new RubyDate(2004, 6, 15);
    const discarded = String(selectDate(date, { discardDay: true }));
    expect(discarded).toContain('name="date[day]" value="1"');
    expect(discarded).toContain('<option value="6" selected="selected">June</option>');
  });
});
