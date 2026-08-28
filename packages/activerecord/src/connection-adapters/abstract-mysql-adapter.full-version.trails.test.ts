import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { Version } from "./abstract-adapter.js";

describe("Mysql2Adapter#full_version", () => {
  function adapterWith(version: Version): Mysql2Adapter {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    (adapter as unknown as { getDatabaseVersion: () => Version }).getDatabaseVersion = () =>
      version;
    return adapter;
  }

  it("answers the full version string the Version carries", async () => {
    expect(await adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB")).fullVersion()).toBe(
      "5.5.5-10.6.5-MariaDB",
    );
    expect(await adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB")).isMariadb()).toBe(true);
  });

  it("answers nil, not an empty string, when the Version carries none", async () => {
    expect(await adapterWith(new Version("10.6.5")).fullVersion()).toBeNull();
    expect(await adapterWith(new Version("10.6.5")).isMariadb()).toBe(false);
  });
});
