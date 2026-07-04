import { describe, it, expect } from "vitest";
import { getId } from "./primary-key.js";

// Unit tests for the `id` accessor's bigint normalization. On PG the driver
// returns a table's default `bigint` id as a JS `bigint`, while `integer`-typed
// FK columns cast to `number`; the accessor collapses a safe-range `bigint` id
// to `number` so `child.fk === parent.id` holds cross-adapter. SQLite/MySQL
// already hand ids back as `number`, so this behavior is only observable when a
// `bigint` reaches the accessor — simulated here with a stubbed `_readAttribute`.
describe("PrimaryKey#id bigint normalization", () => {
  function host(pk: string | string[], value: unknown) {
    return {
      constructor: { primaryKey: pk },
      _readAttribute: (_name: string) => value,
      _writeAttribute: () => {},
    };
  }

  it("collapses a safe-range bigint id to number", () => {
    const record = host("id", 42n);
    expect(getId.call(record)).toBe(42);
    expect(typeof getId.call(record)).toBe("number");
  });

  it("leaves a number id untouched (sqlite/mysql path)", () => {
    const record = host("id", 42);
    expect(getId.call(record)).toBe(42);
    expect(typeof getId.call(record)).toBe("number");
  });

  it("preserves a bigint beyond MAX_SAFE_INTEGER to avoid precision loss", () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const record = host("id", big);
    expect(getId.call(record)).toBe(big);
    expect(typeof getId.call(record)).toBe("bigint");
  });

  it("passes through a null primary key", () => {
    const record = host("id", null);
    expect(getId.call(record)).toBeNull();
  });

  it("normalizes each component of a composite primary key", () => {
    const record = {
      constructor: { primaryKey: ["shop_id", "id"] },
      _readAttribute: (name: string) => (name === "shop_id" ? 7n : 99n),
      _writeAttribute: () => {},
    };
    expect(getId.call(record)).toEqual([7, 99]);
  });
});
