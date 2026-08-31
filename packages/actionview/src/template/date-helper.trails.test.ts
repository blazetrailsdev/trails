import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { distanceOfTimeInWords, timeAgoInWords } from "../helpers/date-helper.js";

// Rails has no counterpart: an ActiveRecord datetime reads back as an
// `ActiveSupport::TimeWithZone`, which `to_time` normalizes. trails' AR
// returns a `Temporal.Instant`, so the normalizer takes its own arm.
describe("DateHelperTest", () => {
  it("accepts the Temporal.Instant ActiveRecord returns for a datetime column", () => {
    const from = Temporal.Instant.fromEpochMilliseconds(Date.UTC(2004, 5, 6, 21, 45, 0));
    const to = Temporal.Instant.fromEpochMilliseconds(Date.UTC(2004, 5, 6, 22, 45, 0));
    expect(distanceOfTimeInWords(from, to)).toBe("about 1 hour");
    expect(timeAgoInWords(Temporal.Instant.fromEpochMilliseconds(Date.now() - 60_000))).toBe(
      "1 minute",
    );
  });
});
