import { describe, expect, it } from "vitest";

import { Cidr, IPAddr } from "./cidr.js";

describe("PostgreSQL::OID::Cidr", () => {
  it("type_cast_for_schema quotes the address, eliding /32 and /128", () => {
    // Rails: if value.prefix == 32 then "\"#{value}\"" else "\"#{value}/#{value.prefix}\""
    // "#{value}" calls IPAddr#to_s which returns just the address.
    // Rails only checks prefix == 32 (not 128); /128 IPv6 keeps its suffix.
    const type = new Cidr();
    expect(type.typeCastForSchema(new IPAddr("192.168.1.0", 24))).toBe('"192.168.1.0/24"');
    expect(type.typeCastForSchema(new IPAddr("192.168.1.1", 32))).toBe('"192.168.1.1"');
    expect(type.typeCastForSchema(new IPAddr("::1", 128))).toBe('"::1/128"');
    // Rails checks prefix == 32 for any IP version, so IPv6 /32 is also elided.
    expect(type.typeCastForSchema(new IPAddr("2001:db8::", 32))).toBe('"2001:db8::"');
  });

  it("castValue is the public Rails-named hook", () => {
    // Rails cast_value returns an IPAddr object (or nil on ArgumentError).
    const type = new Cidr();
    const result = type.castValue("192.168.1.1");
    expect(result).toBeInstanceOf(IPAddr);
    expect(result?.address).toBe("192.168.1.1");
    expect(result?.prefixLength).toBe(32);

    const cidr = type.castValue("192.168.1.0/24");
    expect(cidr?.address).toBe("192.168.1.0");
    expect(cidr?.prefixLength).toBe(24);

    expect(type.castValue("not-an-ip")).toBeNull();
    expect(type.castValue(null)).toBeNull();

    // Pass-through for existing IPAddr (Rails: `else value`).
    const ip = new IPAddr("10.0.0.1", 32);
    expect(type.castValue(ip)).toBe(ip);
  });

  it("canonicalizes IPv6 to RFC 5952 form on cast (matches Ruby IPAddr#to_s)", () => {
    const type = new Cidr();
    // Lowercase hex + leading-zero stripping.
    expect(type.castValue("2001:DB8::1")?.address).toBe("2001:db8::1");
    expect(type.castValue("2001:0DB8:0000:0000:0000:0000:0000:0001")?.address).toBe("2001:db8::1");
    // Longest run of zeros compressed; leftmost run wins on ties.
    expect(type.castValue("2001:db8:0:0:1:0:0:1")?.address).toBe("2001:db8::1:0:0:1");
    // Edge cases.
    expect(type.castValue("::1")?.address).toBe("::1");
    expect(type.castValue("::")?.address).toBe("::");
    expect(type.castValue("0:0:0:0:0:0:0:0")?.address).toBe("::");
    // IPv4-tailed forms convert to all-hex (Ruby IPAddr#to_s behavior).
    expect(type.castValue("::ffff:192.168.0.1")?.address).toBe("::ffff:c0a8:1");
    // Single zero groups are not compressed (RFC 5952: run must be ≥ 2).
    expect(type.castValue("2001:db8:0:1:1:1:1:1")?.address).toBe("2001:db8:0:1:1:1:1:1");
  });

  it("isChanged uses canonical form so textual variants don't mark dirty", () => {
    const type = new Cidr();
    const a = type.castValue("2001:DB8::1");
    const b = type.castValue("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(type.isChanged(a, b)).toBe(false);
    // Different prefix is still a change.
    const c = type.castValue("2001:db8::1/64");
    expect(type.isChanged(a, c)).toBe(true);
  });

  it("serialize emits the canonical form", () => {
    const type = new Cidr();
    const ip = type.castValue("2001:0DB8:0:0:0:0:0:1");
    expect(type.serialize(ip)).toBe("2001:db8::1/128");
  });
});
