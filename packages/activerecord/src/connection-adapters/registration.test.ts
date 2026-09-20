import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import type { AbstractAdapter } from "./abstract-adapter.js";

type ConnectionAdaptersModule = typeof import("../connection-adapters.js");
type ErrorsModule = typeof import("../errors.js");
type FakeAdapterModule = typeof import("../support/fake-adapter.js");

describe("RegistrationTest", () => {
  let ConnectionAdapters: ConnectionAdaptersModule;
  let AdapterNotFound: ErrorsModule["AdapterNotFound"];
  let FakeActiveRecordAdapter: FakeAdapterModule["FakeActiveRecordAdapter"];
  let fakeAdapterPath: string;

  beforeEach(async () => {
    vi.resetModules();
    ConnectionAdapters = await import("../connection-adapters.js");
    ({ AdapterNotFound } = await import("../errors.js"));
    ({ FakeActiveRecordAdapter } = await import("../support/fake-adapter.js"));
    fakeAdapterPath = "./support/fake-adapter.js";
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

    ConnectionAdapters.register(
      "fake",
      "FakeActiveRecordAdapter",
      fakeAdapterPath,
      async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter,
    );

    expect((await ConnectionAdapters.resolve("fake")).name).toBe("FakeActiveRecordAdapter");
  });

  it("#register allows for symbol key", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake"),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register(
      "fake",
      "FakeActiveRecordAdapter",
      fakeAdapterPath,
      async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter,
    );

    expect((await ConnectionAdapters.resolve("fake")).name).toBe("FakeActiveRecordAdapter");
  });

  it("#resolve allows for symbol key", async () => {
    const exception = await assertRaises([AdapterNotFound], {}, () =>
      ConnectionAdapters.resolve("fake"),
    );

    expect(exception.message).toMatch(
      /Database configuration specifies nonexistent 'fake' adapter\. Available adapters are:/,
    );

    ConnectionAdapters.register(
      "fake",
      "FakeActiveRecordAdapter",
      fakeAdapterPath,
      async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter,
    );

    expect((await ConnectionAdapters.resolve("fake")).name).toBe("FakeActiveRecordAdapter");
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
      "config/database.yml and that you've added the necessary adapter package to your " +
      "package.json if it's not in the list of available adapters.";

    expect(exception.message).toBe(expectedMessage);
  });
});
