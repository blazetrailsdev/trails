/**
 * Trails-specific unit coverage for Serialized change detection.
 *
 * Rails' Type::Value#changed? compares old/new with Ruby `!=`, which for Hash
 * is the order-insensitive Hash#==. canonicalKey drives that comparison here,
 * so two content-equal hashes built with keys in a different insertion order
 * must not report as changed.
 */
import { describe, it, expect } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Serialized, type Coder } from "./serialized.js";

const jsonCoder: Coder = {
  dump: (value) => (value == null ? null : JSON.stringify(value)),
  load: (value) => (value == null ? {} : typeof value === "string" ? JSON.parse(value) : value),
};

describe("Serialized#isChanged", () => {
  const type = new Serialized(new StringType(), jsonCoder);

  it("treats same key/value pairs in a different insertion order as unchanged", () => {
    expect(type.isChanged({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
    expect(type.isChanged({ a: 1, b: 2 }, { b: 3, a: 1 })).toBe(true);
  });

  it("normalizes nested object key order", () => {
    const oldValue = { outer: { x: 1, y: 2 }, list: [{ p: 1, q: 2 }] };
    const newValue = { list: [{ q: 2, p: 1 }], outer: { y: 2, x: 1 } };
    expect(type.isChanged(oldValue, newValue)).toBe(false);
  });

  it("normalizes key order through HashWithIndifferentAccess toHash unwrap", () => {
    const oldValue = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const newValue = new HashWithIndifferentAccess({ b: 2, a: 1 });
    expect(type.isChanged(oldValue, newValue)).toBe(false);
  });

  it("treats two value-equal Dates as unchanged, matching Ruby Date#==", () => {
    expect(type.isChanged(new Date("2026-07-08"), new Date("2026-07-08"))).toBe(false);
    expect(type.isChanged(new Date("2026-07-08"), new Date("2026-07-09"))).toBe(true);
  });

  it("dispatches to an explicit equals method, honoring cross-class value equality", () => {
    // Mirrors ActiveSupport::TimeWithZone#== comparing by UTC instant across
    // Date/Time-like kinds via its own equality method.
    class Instant {
      constructor(readonly ms: number) {}
      equals(other: unknown) {
        return other instanceof Date ? this.ms === other.getTime() : false;
      }
    }
    expect(type.isChanged(new Instant(100), new Date(100))).toBe(false);
    expect(type.isChanged(new Instant(100), new Date(200))).toBe(true);
  });

  it("does not equate unrelated classes that yield the same valueOf primitive", () => {
    class Cents {
      valueOf() {
        return 100;
      }
    }
    const cents = new Cents();
    const sameMillis = new Date(100);
    expect(type.isChanged(cents, sameMillis)).toBe(true);
  });

  it("reports changed (not throws) for a null-prototype hash vs a Date", () => {
    const nullProto = Object.assign(Object.create(null), { a: 1 });
    expect(type.isChanged(nullProto, new Date(100))).toBe(true);
  });

  it("distinguishes NaN, undefined, and null Hash values, matching Ruby Hash#==", () => {
    // JSON.stringify collapses NaN/undefined to null (and drops undefined
    // object keys), which would make these compare equal; the sentinel encoding
    // keeps them distinct, mirroring Ruby where nil, Float::NAN, and a missing
    // key are all unequal.
    expect(type.isChanged({ a: NaN }, { a: null })).toBe(true);
    expect(type.isChanged({ a: undefined }, { a: null })).toBe(true);
    expect(type.isChanged({ a: NaN }, { a: undefined })).toBe(true);
    expect(type.isChanged({ a: Infinity }, { a: null })).toBe(true);
    expect(type.isChanged([NaN], [null])).toBe(true);
    // A dropped undefined key must not collapse onto an object missing that key.
    expect(type.isChanged({ a: undefined }, {})).toBe(true);
    // Same distinct value on both sides still compares equal.
    expect(type.isChanged({ a: undefined }, { a: undefined })).toBe(false);
  });

  it("reports changed for two distinct NaN Hash values, matching Ruby NaN non-reflexivity", () => {
    // Ruby's Float::NAN == Float::NAN is false, so {a: Float::NAN} == {a:
    // Float::NAN} is false and reports changed. Structural deep-equal compares
    // leaf primitives with ===, so NaN is never equal to itself. Only manifests
    // in-memory since JSON coders cannot round-trip NaN.
    expect(type.isChanged({ a: NaN }, { a: NaN })).toBe(true);
    expect(type.isChanged([NaN], [NaN])).toBe(true);
    expect(type.isChanged({ a: { b: NaN } }, { a: { b: NaN } })).toBe(true);
    // A finite number at the same key is still order-insensitively equal.
    expect(type.isChanged({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  it("falls back to reference equality for identity-== object_class instances", () => {
    class Custom {}
    const oldValue = new Custom();
    const newValue = new Custom();
    expect(type.isChanged(oldValue, newValue)).toBe(true);
    expect(type.isChanged(oldValue, oldValue)).toBe(false);
  });
});
