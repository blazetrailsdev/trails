import { describe, it, expect } from "vitest";
import { defaultTimezone } from "./active-record.js";
import { currentTimeFromProperTimezone, type TimestampHost } from "./timestamp.js";
import { Toy } from "./test-helpers/models/toy.js";
import { fixtures } from "./test-fixtures.js";

describe("current_time_from_proper_timezone", () => {
  fixtures(["toys"]);

  it("follows the default_timezone of the connection with_connection yields", async () => {
    expect(defaultTimezone()).toBe("utc");
    expect((await Toy.currentTimeFromProperTimezone()).isUtc()).toBe(true);

    const host = {
      withConnection: <T>(fn: (c: { defaultTimezone: string }) => T) =>
        Promise.resolve(fn({ defaultTimezone: "local" })),
    } as TimestampHost;
    expect((await currentTimeFromProperTimezone.call(host)).isUtc()).toBe(false);
  });
});
