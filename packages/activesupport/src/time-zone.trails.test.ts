import { describe, expect, it } from "vitest";

import { TimeZone } from "./values/time-zone.js";

describe("TimeZoneTest", () => {
  it("clear resets the memos", () => {
    const before = TimeZone.all();
    const usBefore = TimeZone.usZones();
    const moscowBefore = TimeZone.find("Moscow");

    TimeZone.clear();

    const after = TimeZone.all();
    expect(after).not.toBe(before);
    expect(after.map((zone) => zone.name)).toEqual(before.map((zone) => zone.name));
    expect(TimeZone.usZones()).not.toBe(usBefore);
    expect(TimeZone.find("Moscow")).not.toBe(moscowBefore);
    expect(TimeZone.find("Moscow")!.name).toBe("Moscow");
  });
});
