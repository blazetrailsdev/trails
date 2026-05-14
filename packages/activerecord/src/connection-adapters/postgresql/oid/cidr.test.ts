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
});
