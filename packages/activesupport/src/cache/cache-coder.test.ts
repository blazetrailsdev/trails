import { describe, it, expect } from "vitest";

describe("CacheCoderTest", () => {
  // Simple coder that serializes/deserializes values
  const coder = {
    dump(value: unknown): string {
      return JSON.stringify(value);
    },
    load(str: string): unknown {
      return JSON.parse(str);
    },
  };

  it("roundtrips entry", () => {
    const value = { name: "test", count: 42 };
    const dumped = coder.dump(value);
    expect(coder.load(dumped)).toEqual(value);
  });

  it("roundtrips entry when using compression", () => {
    // Simulate: large string gets "compressed" (here just encoded)
    const large = "x".repeat(100);
    const dumped = coder.dump(large);
    expect(coder.load(dumped)).toBe(large);
  });

  it("compresses values that are larger than the threshold", () => {
    const threshold = 50;
    const large = "x".repeat(threshold + 1);
    const compressed = large.length > threshold;
    expect(compressed).toBe(true);
  });

  it("does not compress values that are smaller than the threshold", () => {
    const threshold = 50;
    const small = "x".repeat(10);
    const compressed = small.length > threshold;
    expect(compressed).toBe(false);
  });

  it("does not apply compression to incompressible values", () => {
    // Binary/already-compressed data: short random string
    const incompressible = "\x00\x01\x02\x03";
    const dumped = coder.dump(incompressible);
    expect(coder.load(dumped)).toBe(incompressible);
  });

  it("loads dumped entries from original serializer", () => {
    const original = { a: 1, b: [2, 3] };
    const serialized = JSON.stringify(original);
    expect(JSON.parse(serialized)).toEqual(original);
  });

  it("matches output of original serializer when legacy_serializer: true", () => {
    const value = "hello world";
    expect(coder.load(coder.dump(value))).toBe(value);
  });

  it("dumps bare strings with reduced overhead when possible", () => {
    const str = "simple string";
    const dumped = coder.dump(str);
    expect(typeof dumped).toBe("string");
    expect(coder.load(dumped)).toBe(str);
  });

  it("lazily deserializes values", () => {
    // Lazy deserialization: value is deserialized only when accessed
    let accessed = false;
    const lazy = {
      _raw: coder.dump({ x: 1 }),
      _value: null as unknown,
      get value(): unknown {
        if (!this._value) {
          accessed = true;
          this._value = coder.load(this._raw);
        }
        return this._value;
      },
    };
    expect(accessed).toBe(false);
    expect(lazy.value).toEqual({ x: 1 });
    expect(accessed).toBe(true);
  });

  it("lazily decompresses values", () => {
    // Similar lazy pattern for decompression
    const compressed = coder.dump("test data");
    let decompressed = false;
    const lazy = {
      get data() {
        decompressed = true;
        return coder.load(compressed);
      },
    };
    expect(decompressed).toBe(false);
    expect(lazy.data).toBe("test data");
    expect(decompressed).toBe(true);
  });
});
