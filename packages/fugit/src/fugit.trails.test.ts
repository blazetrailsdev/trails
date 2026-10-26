import { describe, expect, it } from "vitest";
import { ZeroDivisionError } from "@blazetrails/ruby-compat";
import { EoTime, EtOrbi } from "@blazetrails/et-orbi";
import { Fugit } from "./fugit.js";
import { isostamp } from "./misc.js";

describe("differential fuzz against fugit 1.11.1", () => {
  it("keeps a Float remainder a Float when deflating", () => {
    expect(Fugit.parseDuration("3.65m")!.deflate().toPlainS()).toBe("3m39.0s");
  });

  it("adds a Float duration to an EoTime", () => {
    const t = Fugit.parseDuration("1.5h")!.add(new EoTime(1700000000, "UTC")) as EoTime;
    expect(Number(t.toF())).toBe(1700005400);
  });

  it("writes a negative fraction below one as 0 in to_long_s", () => {
    expect(Fugit.parseDuration("-0.8M 111w -0M")!.toLongS()).toBe("0 month, and 111 weeks");
  });

  it("isostamps the microseconds of an EoTime", () => {
    const t = EtOrbi.parse("2019-01-01 12:34:56.123456 Europe/Berlin");
    expect(t.usec).toBe(123456);
    expect(isostamp(true, true, true, t)).toBe("2019-01-01T12:34:56.123456");
  });

  it("raises ZeroDivisionError for a zero step", () => {
    expect(() => Fugit.parseCron("0 0 * 5/0 *")).toThrow(ZeroDivisionError);
  });
});
