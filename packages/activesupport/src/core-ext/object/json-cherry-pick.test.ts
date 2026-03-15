import { describe, expect, it } from "vitest";

describe("JsonCherryPickTest", () => {
  it("time as json", () => {
    const t = new Date("2023-06-15T12:30:00Z");
    expect(JSON.stringify(t)).toBe('"2023-06-15T12:30:00.000Z"');
    expect(t.toJSON()).toBe("2023-06-15T12:30:00.000Z");
  });

  it("date as json", () => {
    const d = new Date("2023-06-15T00:00:00Z");
    const json = JSON.parse(JSON.stringify({ date: d }));
    expect(json.date).toContain("2023-06-15");
  });

  it("datetime as json", () => {
    const dt = new Date("2023-06-15T14:30:45.123Z");
    expect(dt.toJSON()).toBe("2023-06-15T14:30:45.123Z");
  });
});
