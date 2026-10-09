import { describe, it, expect } from "vitest";
import { defaultTimezone } from "./active-record.js";
import { Toy } from "./test-helpers/models/toy.js";
import { fixtures } from "./test-fixtures.js";

describe("current_time_from_proper_timezone", () => {
  fixtures(["toys"]);

  it("follows the default_timezone of the connection with_connection yields", async () => {
    expect(defaultTimezone()).toBe("utc");
    expect((await Toy.currentTimeFromProperTimezone()).isUtc()).toBe(true);

    await Toy.withConnection(async (c) => {
      const connection = c as unknown as { _defaultTimezone?: string };
      const was = connection._defaultTimezone;
      connection._defaultTimezone = "local";
      try {
        expect(c.defaultTimezone).toBe("local");
        expect((await Toy.currentTimeFromProperTimezone()).isUtc()).toBe(false);
      } finally {
        connection._defaultTimezone = was;
      }
    });
  });
});
