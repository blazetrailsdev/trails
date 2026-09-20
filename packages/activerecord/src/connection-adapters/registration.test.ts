import { describe, it, expect } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import * as ConnectionAdapters from "../connection-adapters.js";
import { AdapterNotFound } from "../errors.js";

class FakeActiveRecordAdapter {}

describe("RegistrationIsolatedTest", () => {
  it("#resolve raises if the adapter is using the pre 7.2 adapter registration API", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake_legacy"),
    );

    const expectedMessage =
      "Database configuration specifies nonexistent 'fake_legacy' adapter. " +
      "Available adapters are: expo-sqlite, fake, libsql, libsql-remote, libsql-replica, mysql2, " +
      "node-sqlite, postgresql, sqlite3. Ensure that the adapter is spelled correctly in " +
      "config/database.yml and that you've added the necessary adapter package to your " +
      "package.json if it's not in the list of available adapters.";

    expect(exception.message).toBe(expectedMessage);
  });
});

describe("RegistrationTest", () => {
  it("#register registers a new database adapter and #resolve can find it and raises if it cannot", async () => {
    const name = "fake_reg_a";
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve(name),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_a' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register(
      name,
      "FakeActiveRecordAdapter",
      "./fake-active-record-adapter.js",
      async () => FakeActiveRecordAdapter as any,
    );

    expect((await ConnectionAdapters.resolve(name)).name).toBe("FakeActiveRecordAdapter");
  });

  it("#register allows for symbol key", async () => {
    const name = "fake_reg_b";
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve(name),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_b' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register(
      name,
      "FakeActiveRecordAdapter",
      "./fake-active-record-adapter.js",
      async () => FakeActiveRecordAdapter as any,
    );

    expect((await ConnectionAdapters.resolve(name)).name).toBe("FakeActiveRecordAdapter");
  });

  it("#resolve allows for symbol key", async () => {
    const name = "fake_reg_c";
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve(name),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_c' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register(
      name,
      "FakeActiveRecordAdapter",
      "./fake-active-record-adapter.js",
      async () => FakeActiveRecordAdapter as any,
    );

    expect((await ConnectionAdapters.resolve(name)).name).toBe("FakeActiveRecordAdapter");
  });
});
