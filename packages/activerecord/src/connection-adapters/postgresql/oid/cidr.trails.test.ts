import { describe, expect, it } from "vitest";

import { IPAddr } from "@blazetrails/ruby-compat";

import { Cidr } from "./cidr.js";

describe("PostgreSQL::OID::Cidr", () => {
  it("type_cast_for_schema quotes the address, eliding /32 and /128", () => {
    const type = new Cidr();
    expect(type.typeCastForSchema(new IPAddr("192.168.1.0/24"))).toBe('"192.168.1.0/24"');
    expect(type.typeCastForSchema(new IPAddr("192.168.1.1/32"))).toBe('"192.168.1.1"');
    expect(type.typeCastForSchema(new IPAddr("::1/128"))).toBe('"::1/128"');
    expect(type.typeCastForSchema(new IPAddr("2001:db8::/32"))).toBe('"2001:db8::"');
  });

  it("castValue is the public Rails-named hook", () => {
    const type = new Cidr();
    const result = type.castValue("192.168.1.1");
    expect(result).toBeInstanceOf(IPAddr);
    expect(result?.toString()).toBe("192.168.1.1");
    expect(result?.prefix).toBe(32);

    const cidr = type.castValue("192.168.1.0/24");
    expect(cidr?.toString()).toBe("192.168.1.0");
    expect(cidr?.prefix).toBe(24);

    expect(type.castValue("not-an-ip")).toBeNull();
    expect(type.castValue(null)).toBeNull();

    const ip = new IPAddr("10.0.0.1/32");
    expect(type.castValue(ip)).toBe(ip);
  });

  it("isChanged uses canonical form so textual variants don't mark dirty", () => {
    const type = new Cidr();
    const a = type.castValue("2001:DB8::1");
    const b = type.castValue("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(type.isChanged(a, b)).toBe(false);
    const c = type.castValue("2001:db8::1/64");
    expect(type.isChanged(a, c)).toBe(true);
    const d = type.castValue("0:0:0:0:0:ffff:192.168.0.1");
    const e = type.castValue("::ffff:192.168.0.1");
    expect(type.isChanged(d, e)).toBe(false);
    const f = type.castValue("::ffff:c0a8:1");
    expect(type.isChanged(e, f)).toBe(false);
  });

  it("serialize emits the canonical form", () => {
    const type = new Cidr();
    const ip = type.castValue("2001:0DB8:0:0:0:0:0:1");
    expect(type.serialize(ip)).toBe("2001:db8::1/128");
    const ip2 = type.castValue("::ffff:192.168.0.1");
    expect(type.serialize(ip2)).toBe("::ffff:192.168.0.1/128");
  });
});
