import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "../../../lib/connection-adapters/mysql2-adapter.js";
import { Version } from "../../../lib/connection-adapters/abstract-adapter.js";

describe("Mysql2Adapter#full_version", () => {
  async function adapterWith(version: Version): Promise<Mysql2Adapter> {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    (adapter as unknown as { getDatabaseVersion: () => Version }).getDatabaseVersion = () =>
      version;
    await adapter.databaseVersion;
    return adapter;
  }

  it("answers the full version string the Version carries", async () => {
    expect((await adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB"))).fullVersion()).toBe(
      "5.5.5-10.6.5-MariaDB",
    );
    expect((await adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB"))).isMariadb()).toBe(
      true,
    );
  });

  it("answers nil, not an empty string, when the Version carries none", async () => {
    expect((await adapterWith(new Version("10.6.5"))).fullVersion()).toBeNull();
    expect((await adapterWith(new Version("10.6.5"))).isMariadb()).toBe(false);
  });

  it("an async supports_* predicate warms the version before reading mariadb?", async () => {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    (adapter as unknown as { getDatabaseVersion: () => Promise<Version> }).getDatabaseVersion =
      async () => new Version("10.5.2", "5.5.5-10.5.2-MariaDB");
    expect(await adapter.supportsRenameColumn()).toBe(true);
    expect(adapter.isMariadb()).toBe(true);
    expect(adapter.supportsInsertReturning()).toBe(true);
  });
});
