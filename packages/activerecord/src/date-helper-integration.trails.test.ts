import { describe, it, expect } from "vitest";
import { timeAgoInWords, distanceOfTimeInWords } from "@blazetrails/actionview";
import { fixtures } from "./test-fixtures.js";

describe("DateHelperTest", () => {
  const { topics } = fixtures(["topics"]);

  it("takes an ActiveRecord datetime column with no conversion at the call site", async () => {
    const topic = await topics("first");
    const writtenOn = (topic as unknown as { written_on: { epochMilliseconds: number } })
      .written_on;
    expect(typeof writtenOn.epochMilliseconds).toBe("number");

    const anHourLater = new Date(writtenOn.epochMilliseconds + 60 * 60 * 1000);
    expect(distanceOfTimeInWords(writtenOn, anHourLater)).toBe("about 1 hour");
    expect(timeAgoInWords(writtenOn)).toMatch(/years$/);
  });
});
