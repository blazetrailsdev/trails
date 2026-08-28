import { describe, it, expect } from "vitest";
import * as ConnectionAdapters from "../connection-adapters.js";
import { AdapterNotFound } from "../errors.js";

class FakeActiveRecordAdapter {}

describe("RegistrationTest", () => {
  it("#register registers a new database adapter and #resolve can find it and raises if it cannot", async () => {
    const name = "fake_reg_a";
    const err = await ConnectionAdapters.resolve(name).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterNotFound);
    expect((err as AdapterNotFound).message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_a' adapter\. Available adapters are:/,
    );
    ConnectionAdapters.register(name, async () => FakeActiveRecordAdapter as any);
    const klass = await ConnectionAdapters.resolve(name);
    expect(klass.name).toBe("FakeActiveRecordAdapter");
  });

  it("#register allows for symbol key", async () => {
    const name = "fake_reg_b";
    const err = await ConnectionAdapters.resolve(name).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterNotFound);
    expect((err as AdapterNotFound).message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_b' adapter\. Available adapters are:/,
    );
    ConnectionAdapters.register(name, async () => FakeActiveRecordAdapter as any);
    const klass = await ConnectionAdapters.resolve(name);
    expect(klass.name).toBe("FakeActiveRecordAdapter");
  });

  it("#resolve allows for symbol key", async () => {
    const name = "fake_reg_c";
    const err = await ConnectionAdapters.resolve(name).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterNotFound);
    expect((err as AdapterNotFound).message).toMatch(
      /Database configuration specifies nonexistent 'fake_reg_c' adapter\. Available adapters are:/,
    );
    ConnectionAdapters.register(name, async () => FakeActiveRecordAdapter as any);
    const klass = await ConnectionAdapters.resolve(name);
    expect(klass.name).toBe("FakeActiveRecordAdapter");
  });
});

describe("RegistrationIsolatedTest", () => {
  it("#resolve raises if the adapter is using the pre 7.2 adapter registration API", async () => {
    const err = await ConnectionAdapters.resolve("fake_legacy").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterNotFound);
    expect((err as AdapterNotFound).message).toMatch(
      /Database configuration specifies nonexistent 'fake_legacy' adapter\. Available adapters are:/,
    );
  });
});
