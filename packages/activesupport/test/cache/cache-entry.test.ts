import { describe, expect, it } from "vitest";

import { Time } from "@blazetrails/date";
import { Entry } from "../../lib/cache/entry.js";
import { assertNot, assertPredicate } from "../../lib/testing/assertions.js";
import { stub } from "../../lib/testing/method-call-assertions.js";

describe("CacheEntryTest", () => {
  it("expired", async () => {
    let entry = new Entry("value");
    assertNot(entry.isExpired(), "entry not expired");
    entry = new Entry("value", { expiresIn: 60 });
    assertNot(entry.isExpired(), "entry not expired");
    await stub(Time, "now", Time.at(entry.expiresAt! + 1), [], () => {
      assertPredicate(entry, (e: Entry) => e.isExpired(), "entry is expired");
    });
  });

  it("initialize with expires at", () => {
    const entry = new Entry("value", { expiresIn: 60 });
    const clone = new Entry("value", { expiresAt: entry.expiresAt });
    expect(clone.expiresAt).toBe(entry.expiresAt);
  });

  it("bytesize of a compressed Array includes Marshal framing overhead", () => {
    const value = Array.from({ length: 200 }, (_, i) => i % 10);
    const compressed = new Entry(value).compressed(1);

    expect(compressed.isCompressed()).toBe(true);
    const payloadBytes = (compressed as unknown as { _value: string })._value.length;
    const lengthBytes = payloadBytes <= 122 ? 1 : payloadBytes <= 255 ? 2 : 3;
    expect(compressed.bytesize()).toBe(2 + 1 + lengthBytes + payloadBytes);
    expect(compressed.bytesize()).toBeGreaterThan(payloadBytes);
  });

  it("bytesize of a compressed String is the raw payload byte count", () => {
    const value = "a".repeat(500);
    const compressed = new Entry(value).compressed(1);

    expect(compressed.isCompressed()).toBe(true);
    const payloadBytes = (compressed as unknown as { _value: string })._value.length;
    expect(compressed.bytesize()).toBe(payloadBytes);
  });
});
