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

  it("falls back to reference equality for identity-== object_class instances", () => {
    class Custom {}
    const oldValue = new Custom();
    const newValue = new Custom();
    expect(type.isChanged(oldValue, newValue)).toBe(true);
    expect(type.isChanged(oldValue, oldValue)).toBe(false);
  });
});
