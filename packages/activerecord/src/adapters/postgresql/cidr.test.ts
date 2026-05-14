/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/cidr_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Cidr, IPAddr } from "../../connection-adapters/postgresql/oid/cidr.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("CidrTest", () => {
    it.skip("cidr column", async () => {
      // BLOCKED: adapter-pg — requires live schema with cidr column
    });
    it.skip("cidr type cast", async () => {
      // BLOCKED: adapter-pg — requires live DB round-trip
    });
    it.skip("cidr invalid", async () => {
      // BLOCKED: adapter-pg — requires live DB
    });

    it("type casting IPAddr for database", async () => {
      const type = new Cidr();
      const ip = new IPAddr("255.0.0.0", 8);
      const ip2 = new IPAddr("127.0.0.1", 32);

      expect(type.serialize(ip)).toBe("255.0.0.0/8");
      expect(type.serialize(ip2)).toBe("127.0.0.1/32");
    });

    it("casting does nothing with non-IPAddr objects", async () => {
      const type = new Cidr();

      expect(type.serialize("foo")).toBe("foo");
    });

    it("changed? with nil values", async () => {
      const type = new Cidr();

      expect(type.isChanged(null, null, "")).toBe(false);
      expect(type.isChanged("192.168.0.0/24", null, "")).toBe(true);
      expect(type.isChanged(null, "192.168.0.0/24", "")).toBe(true);
      expect(type.isChanged("192.168.0.0/24", "192.168.0.0/25", "")).toBe(true);
      expect(type.isChanged(new IPAddr("192.168.0.0", 24), null, "")).toBe(true);
      expect(type.isChanged(null, new IPAddr("192.168.0.0", 24), "")).toBe(true);
      expect(type.isChanged(new IPAddr("192.168.0.0", 24), new IPAddr("192.168.0.0", 25), "")).toBe(
        true,
      );

      expect(type.isChanged(new IPAddr("0.0.0.0", 32), null, "")).toBe(true);
      expect(type.isChanged(null, new IPAddr("0.0.0.0", 32), "")).toBe(true);
      expect(type.isChanged(new IPAddr("::", 128), null, "")).toBe(true);
      expect(type.isChanged(null, new IPAddr("::", 128), "")).toBe(true);
    });
  });
});
