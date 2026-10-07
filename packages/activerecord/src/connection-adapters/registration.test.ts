import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";

type ConnectionAdaptersModule = typeof import("../connection-adapters.js");
type ErrorsModule = typeof import("../errors.js");

describe("RegistrationTest", () => {
  let ConnectionAdapters: ConnectionAdaptersModule;
  let AdapterNotFound: ErrorsModule["AdapterNotFound"];
  let fakeAdapterPath: string;

  beforeEach(async () => {
    vi.resetModules();
    ConnectionAdapters = await import("../connection-adapters.js");
    ({ AdapterNotFound } = await import("../errors.js"));
    fakeAdapterPath = new URL("../support/fake-adapter.ts", import.meta.url).href;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("#register registers a new database adapter and #resolve can find it and raises if it cannot", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake"),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register("fake", "FakeActiveRecordAdapter", fakeAdapterPath);

    await ConnectionAdapters.load("fake");
    expect(ConnectionAdapters.resolve("fake").name).toBe("FakeActiveRecordAdapter");
  });

  it("#register allows for symbol key", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake"),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register("fake", "FakeActiveRecordAdapter", fakeAdapterPath);

    await ConnectionAdapters.load("fake");
    expect(ConnectionAdapters.resolve("fake").name).toBe("FakeActiveRecordAdapter");
  });

  it("#resolve allows for symbol key", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake"),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register("fake", "FakeActiveRecordAdapter", fakeAdapterPath);

    await ConnectionAdapters.load("fake");
    expect(ConnectionAdapters.resolve("fake").name).toBe("FakeActiveRecordAdapter");
  });
});

describe("RegistrationIsolatedTest", () => {
  let ConnectionAdapters: ConnectionAdaptersModule;
  let AdapterNotFound: ErrorsModule["AdapterNotFound"];

  beforeEach(async () => {
    vi.resetModules();
    ConnectionAdapters = await import("../connection-adapters.js");
    ({ AdapterNotFound } = await import("../errors.js"));
    (await import("../support/fake-adapter.js")).registerFakeAdapter();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("#resolve raises if the adapter is using the pre 7.2 adapter registration API", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake_legacy"),
    );

    const expectedMessage =
      "Database configuration specifies nonexistent 'fake_legacy' adapter. " +
      "Available adapters are: expo-sqlite, fake, libsql, libsql-remote, libsql-replica, mysql2, " +
      "node-sqlite, postgresql, sqlite3. Ensure that the adapter is spelled correctly in " +
      "config/database.yml and that you've added the necessary adapter gem to your " +
      "Gemfile if it's not in the list of available adapters.";

    expect(exception.message).toBe(expectedMessage);
  });
});
