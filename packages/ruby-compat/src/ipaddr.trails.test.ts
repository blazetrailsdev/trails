import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { IPAddr } from "./ipaddr.js";

describe("IPAddr (trails)", () => {
  it("matches Ruby's to_s and prefix", () => {
    const cases: [string, string, number][] = [
      ["192.168.1.5/24", "192.168.1.0", 24],
      ["10.0.0.1", "10.0.0.1", 32],
      ["::1", "::1", 128],
      ["::", "::", 128],
      ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1", 128],
      ["2001:db8::/32", "2001:db8::", 32],
      ["::ffff:192.168.1.1", "::ffff:192.168.1.1", 128],
      ["fe80::1:0:0:1", "fe80::1:0:0:1", 128],
      ["1:0:0:2:0:0:0:3", "1:0:0:2::3", 128],
      ["[::1]", "::1", 128],
    ];
    for (const [input, s, prefix] of cases) {
      const ip = new IPAddr(input);
      expect([input, ip.toString(), ip.prefix]).toEqual([input, s, prefix]);
    }
  });

  it("raises an ArgumentError on an invalid address", () => {
    for (const bad of ["", "foo", "1.2.3.256", "1.2.3.4/33", "1::2::3", "1:2:3:4:5:6:7:8:9"]) {
      expect(() => new IPAddr(bad), bad).toThrow(ArgumentError);
    }
  });

  it("compares with == and eql?", () => {
    expect(new IPAddr("10.0.0.0/8").equals(new IPAddr("10.0.0.0/16"))).toBe(true);
    expect(new IPAddr("10.0.0.0/8").eql(new IPAddr("10.0.0.0/16"))).toBe(false);
    expect(new IPAddr("10.0.0.0/8").eql(new IPAddr("10.1.2.3/8"))).toBe(true);
    expect(new IPAddr("::1").equals("::1")).toBe(true);
    expect(new IPAddr("0.0.0.1").equals(1)).toBe(true);
    expect(new IPAddr("0.0.0.1").equals(1.5)).toBe(true);
    expect(new IPAddr("0.0.0.0").equals(null)).toBe(false);
  });
});
