import { describe, it, expect } from "vitest";
import { SerializerWithFallback, KeyError } from "./serializer-with-fallback.js";
import { Entry } from "./entry.js";
import { Store } from "./index.js";

const FORMATS = Object.keys(SerializerWithFallback.SERIALIZERS);
const LEGACY_FORMATS = ["passthrough", "marshal_7_0"];
const NON_LEGACY_FORMATS = FORMATS.filter((f) => !LEGACY_FORMATS.includes(f));

function serializer(format: string) {
  return SerializerWithFallback.get(format);
}

function makeEntry() {
  return new Entry([{ a_boolean: false, a_number: 123, a_string: "x".repeat(40) }], {
    expiresIn: 100,
    version: "v42",
  });
}

function assertEntry(expected: Entry, actual: unknown) {
  const e = expected;
  const a = actual as Entry;
  expect([a.value, a.version, a.expiresAt]).toEqual([e.value, e.version, e.expiresAt]);
}

describe("CacheSerializerWithFallbackTest", () => {
  for (const loader of FORMATS) {
    for (const dumper of NON_LEGACY_FORMATS) {
      it(`${JSON.stringify(loader)} serializer can load ${JSON.stringify(dumper)} dump`, () => {
        const entry = makeEntry();
        const dumped = serializer(dumper).dump(entry.value);
        expect(serializer(loader).load(dumped)).toEqual(entry.value);
      });
    }
  }

  for (const loader of FORMATS) {
    for (const dumper of LEGACY_FORMATS) {
      it(`${JSON.stringify(loader)} serializer can load ${JSON.stringify(dumper)} dump`, () => {
        const entry = makeEntry();
        const dumped = serializer(dumper).dump(entry);
        assertEntry(entry, serializer(loader).load(dumped));
      });
    }
  }

  for (const format of FORMATS) {
    it(`${JSON.stringify(format)} serializer handles unrecognized payloads gracefully`, () => {
      expect(serializer(format).load({})).toBeNull();
      expect(serializer(format).load("")).toBeNull();
    });

    it(`${JSON.stringify(format)} serializer logs unrecognized payloads`, () => {
      const messages: string[] = [];
      const logger = { warn: (msg: string) => messages.push(msg) };

      Store.with({ logger }, () => serializer(format).load({}));
      expect(messages.some((m) => /unrecognized/i.test(m))).toBe(true);

      messages.length = 0;
      Store.with({ logger }, () => serializer(format).load(""));
      expect(messages.some((m) => /unrecognized/i.test(m))).toBe(true);
    });
  }

  for (const format of LEGACY_FORMATS) {
    it(`${JSON.stringify(format)} serializer can compress entries`, () => {
      const entry = makeEntry();
      const compressed = serializer(format).dumpCompressed!(entry, 1);
      const uncompressed = serializer(format).dumpCompressed!(entry, 100_000);

      const byteSize = (v: unknown) => (v instanceof Entry ? v.bytesize() : (v as string).length);

      expect(byteSize(compressed)).toBeLessThan(byteSize(uncompressed));
      assertEntry(entry, serializer(format).load(compressed));
      assertEntry(entry, serializer(format).load(uncompressed));
    });
  }

  it(":message_pack serializer handles missing class gracefully", () => {
    class FakeClass {
      static fromMsgpackExt(_s: string) {
        return new FakeClass();
      }
      toMsgpackExt() {
        return "";
      }
    }

    const dumped = serializer("message_pack").dump(new FakeClass());
    expect(dumped).not.toBeNull();
    expect(serializer("message_pack").load(dumped)).toBeNull();
  });

  it("raises on invalid format name", () => {
    expect(() => SerializerWithFallback.get("invalid_format")).toThrow(KeyError);
  });
});
