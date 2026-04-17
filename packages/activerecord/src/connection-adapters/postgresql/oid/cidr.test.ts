import { describe, expect, it } from "vitest";

import { Cidr } from "./cidr.js";

describe("PostgreSQL::OID::Cidr", () => {
  it("type_cast_for_schema quotes the address, eliding /32 and /128", () => {
    // Rails branches on `value.prefix == 32` (or /128 for IPv6) to
    // omit the host-prefix. We carry the prefix inline on the string,
    // so strip it before quoting to match Rails' schema output.
    const type = new Cidr();
    expect(type.typeCastForSchema("192.168.1.0/24")).toBe('"192.168.1.0/24"');
    expect(type.typeCastForSchema("192.168.1.1")).toBe('"192.168.1.1"');
    expect(type.typeCastForSchema("192.168.1.1/32")).toBe('"192.168.1.1"');
    expect(type.typeCastForSchema("::1")).toBe('"::1"');
    expect(type.typeCastForSchema("::1/128")).toBe('"::1"');
    // Non-host prefixes are preserved.
    expect(type.typeCastForSchema("2001:db8::/32")).toBe('"2001:db8::/32"');
  });

  it("castValue is the public Rails-named hook", () => {
    const type = new Cidr();
    expect(type.castValue("192.168.1.1")).toBe("192.168.1.1");
    expect(type.castValue("not-an-ip")).toBeNull();
  });
});
