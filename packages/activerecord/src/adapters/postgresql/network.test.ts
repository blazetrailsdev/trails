/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/network_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlNetworkTest", () => {
    it.skip("inet column", async () => {});
    it.skip("inet type cast", async () => {});
    it.skip("inet write", async () => {});
    it.skip("inet where", async () => {});
    it.skip("cidr column", async () => {});
    it.skip("cidr type cast", async () => {});
    it.skip("macaddr column", async () => {});
    it.skip("macaddr type cast", async () => {});
    it.skip("network types", async () => {});
    it.skip("invalid network address", async () => {});
    it.skip("cidr change prefix", async () => {});
    it.skip("mac address change case does not mark dirty", async () => {});
  });
});
