import { describe, it, expect } from "vitest";
import { Coder } from "./coder.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { deflate, inflate } from "../gzip.js";

// Port of Rails' CacheCoderTest (test/cache/cache_coder_test.rb). The custom
// Serializer/Compressor mirror the Rails test doubles; the fidelity `coder`
// (coder.ts) stands in for Marshal. Serializer#dump round-trips both Entries
// (legacy/no-signature path) and bare values (Coder's framed path), tagged so
// load can tell them apart — Marshal does this implicitly in Rails.
const Serializer = {
  dump(value: unknown): string {
    return value instanceof Entry ? "E" + coder.dump(value.pack()) : "V" + coder.dump(value);
  },
  dumpCompressed(): string {
    return "via Serializer#dumpCompressed";
  },
  load(dumped: string): unknown {
    const body = dumped.slice(1);
    return dumped[0] === "E" ? Entry.unpack(coder.load(body) as unknown[]) : coder.load(body);
  },
};

const Compressor = { deflate, inflate };

const STRING = "x".repeat(100);
const COMPRESSIBLE_VALUES: unknown[] = [{ string: STRING }, STRING];
const VALUES: unknown[] = [null, true, 1, "", "ümlaut", ...COMPRESSIBLE_VALUES];
const VERSIONS: (string | null)[] = [null, "", "ümlaut", "x".repeat(256)];
const EXPIRIES: (number | null)[] = [null, 0, 100 * 365 * 24 * 3600];

const ENTRIES = VALUES.flatMap((value) =>
  VERSIONS.flatMap((version) =>
    EXPIRIES.map((expiresIn) => new Entry(value, { version, expiresIn })),
  ),
);

const COMPRESSIBLE_ENTRIES = ENTRIES.filter((entry) => COMPRESSIBLE_VALUES.includes(entry.value));

function assertEntry(expected: Entry, actual: Entry): void {
  expect([actual.value, actual.version, actual.expiresAt]).toEqual([
    expected.value,
    expected.version,
    expected.expiresAt,
  ]);
}

describe("CacheCoderTest", () => {
  const c = new Coder(Serializer, Compressor);

  it("roundtrips entry", () => {
    for (const entry of ENTRIES) {
      assertEntry(entry, c.load(c.dump(entry)) as Entry);
    }
  });

  it("roundtrips entry when using compression", () => {
    for (const entry of ENTRIES) {
      assertEntry(entry, c.load(c.dumpCompressed(entry, 1)) as Entry);
    }
  });

  it("compresses values that are larger than the threshold", () => {
    for (const entry of COMPRESSIBLE_ENTRIES) {
      const dumped = c.dump(entry);
      const compressed = c.dumpCompressed(entry, 1);
      expect(compressed.length).toBeLessThan(dumped.length);
    }
  });

  it("does not compress values that are smaller than the threshold", () => {
    for (const entry of COMPRESSIBLE_ENTRIES) {
      const dumped = c.dump(entry);
      const notCompressed = c.dumpCompressed(entry, 1_000_000);
      expect(notCompressed).toBe(dumped);
    }
  });

  it("does not apply compression to incompressible values", () => {
    for (const entry of ENTRIES.filter((e) => !COMPRESSIBLE_VALUES.includes(e.value))) {
      const dumped = c.dump(entry);
      const notCompressed = c.dumpCompressed(entry, 1);
      expect(notCompressed).toBe(dumped);
    }
  });

  it("loads dumped entries from original serializer", () => {
    for (const entry of ENTRIES) {
      assertEntry(entry, c.load(Serializer.dump(entry)) as Entry);
    }
  });

  it("matches output of original serializer when legacy_serializer: true", () => {
    const legacy = new Coder(Serializer, Compressor, { legacySerializer: true });
    for (const entry of ENTRIES) {
      expect(legacy.dump(entry)).toBe(Serializer.dump(entry));
      expect(legacy.dumpCompressed(entry, 1)).toBe(Serializer.dumpCompressed());
    }
  });

  it("dumps bare strings with reduced overhead when possible", () => {
    // Rails compares supported vs unsupported string encodings; JS strings carry
    // no encoding, so trails collapses all strings onto one fast path. The
    // equivalent saving: a bare string skips the serializer that an object pays.
    const unoptimized = c.dump(new Entry({ s: "" }));
    const optimized = c.dump(new Entry(""));
    expect(optimized.length).toBeLessThan(unoptimized.length);
  });

  it("lazily deserializes values", () => {
    const serializer = {
      dump: () => "",
      load: () => {
        throw new Error("LOAD!");
      },
    };
    const lazy = new Coder(serializer, Compressor);
    const entry = new Entry([], { version: "abc", expiresIn: 123 });
    const roundtripped = lazy.load(lazy.dump(entry)) as Entry;

    expect(roundtripped.version).toBe(entry.version);
    expect(roundtripped.expiresAt).toBe(entry.expiresAt);
    expect(() => roundtripped.value).toThrow("LOAD!");
  });

  it("lazily decompresses values", () => {
    const compressor = {
      deflate: () => "",
      inflate: () => {
        throw new Error("INFLATE!");
      },
    };
    const lazy = new Coder(Serializer, compressor);

    for (const value of [[STRING], STRING]) {
      const entry = new Entry(value, { version: "abc", expiresIn: 123 });
      const roundtripped = lazy.load(lazy.dumpCompressed(entry, 1)) as Entry;

      expect(roundtripped.version).toBe(entry.version);
      expect(roundtripped.expiresAt).toBe(entry.expiresAt);
      expect(() => roundtripped.value).toThrow("INFLATE!");
    }
  });
});
