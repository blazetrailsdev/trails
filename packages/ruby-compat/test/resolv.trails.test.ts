import { describe, expect, it } from "vitest";
import { Resolv } from "../lib/resolv.js";

describe("Resolv", () => {
  it("IPv4::Regex matches a dotted quad and nothing wider", () => {
    expect(Resolv.IPv4.Regex.test("127.0.0.1")).toBe(true);
    expect(Resolv.IPv4.Regex.test("255.255.255.255")).toBe(true);
    expect(Resolv.IPv4.Regex.test("256.0.0.1")).toBe(false);
    expect(Resolv.IPv4.Regex.test("1.2.3.4/8")).toBe(false);
    expect(Resolv.IPv4.Regex.test("example.com")).toBe(false);
  });

  it("IPv6::Regex matches full, compressed, mapped and link-local forms", () => {
    expect(Resolv.IPv6.Regex.test("2001:db8:0:0:0:0:0:1")).toBe(true);
    expect(Resolv.IPv6.Regex.test("::1")).toBe(true);
    expect(Resolv.IPv6.Regex.test("::ffff:127.0.0.1")).toBe(true);
    expect(Resolv.IPv6.Regex.test("fe80::1%eth0")).toBe(true);
    expect(Resolv.IPv6.Regex.test("localhost")).toBe(false);
  });
});
