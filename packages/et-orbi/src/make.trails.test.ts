import { describe, expect, it } from "vitest";
import { EtOrbi } from "./et-orbi.js";

describe("EtOrbi.parse of a pre-reform date", () => {
  it("reads DateTime's Julian civil date as its absolute day", () => {
    expect(Number(EtOrbi.parse("196-05-25 UTC").toF())).toBe(-55969574400);
    expect(Number(EtOrbi.parse("988-09-08 UTC").toF())).toBe(-30966796800);
    expect(Number(EtOrbi.parse("993-06-01 UTC").toF())).toBe(-30817584000);
    expect(Number(EtOrbi.parse("1582-10-04 UTC").toF())).toBe(-12219379200);
    expect(Number(EtOrbi.parse("1582-10-15 UTC").toF())).toBe(-12219292800);
    expect(Number(EtOrbi.parse("993-06-01 12:30:30 America/Chicago").toF())).toBe(-30817517934);
  });
});
