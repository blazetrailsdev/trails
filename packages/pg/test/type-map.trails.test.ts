import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  rbCFalseClass,
  rbCInteger,
  rbCNumeric,
  rbCTrueClass,
} from "@blazetrails/ruby-compat";
import { PG } from "../lib/index.js";

describe("PG::TypeMapByClass", () => {
  it("looks up a coder by the value's class, then its ancestors", () => {
    const map = new PG.TypeMapByClass();
    const int = new PG.TextEncoder.Integer();
    const bool = new PG.TextEncoder.Boolean();
    expect(map.set(rbCInteger, int)).toBe(int);
    map.set(rbCTrueClass, bool);
    map.set(rbCFalseClass, bool);
    expect(map._lookupKlass(3)).toBe(int);
    expect(map._lookupKlass(true)).toBe(bool);
    expect(map._lookupKlass("x")).toBeNull();
    expect(map._lookupKlass(1.5)).toBeNull();
    map.set(rbCInteger, null);
    map.set(rbCNumeric, int);
    expect(map._lookupKlass(3)).toBe(int);
  });
});

describe("PG::TextEncoder", () => {
  it("encodes integers and booleans as the gem does", () => {
    expect(new PG.TextEncoder.Integer().encode(-42)).toBe("-42");
    expect(new PG.TextEncoder.Integer().encode(12345678901234567890n)).toBe("12345678901234567890");
    const bool = new PG.TextEncoder.Boolean();
    expect([true, false, 0, 1, 7].map((v) => bool.encode(v))).toEqual(["t", "f", "0", "1", "7"]);
  });
});

describe("PG::TypeMapByOid", () => {
  class Upcase extends PG.SimpleDecoder {
    decode(string: string): unknown {
      return string.toUpperCase();
    }
  }

  it("adds coders by format and oid, and falls through to the default type map", () => {
    const inner = new PG.TypeMapByOid();
    const coder = new Upcase(null, { oid: 25, name: "text" });
    expect(inner.addCoder(coder)).toBe(inner);
    expect(coder.toH()).toEqual({ oid: 25, format: 0, flags: 0, name: "text" });
    const outer = new PG.TypeMapByOid();
    outer.defaultTypeMap = inner;
    expect(outer._lookupOid(0, 25)).toBe(coder);
    expect(outer._lookupOid(1, 25)).toBeNull();
    expect(() => inner.addCoder(new Upcase(null, { oid: 1, format: 2 }))).toThrow(ArgumentError);
  });
});

describe("PG::TypeMap", () => {
  it("defaults a DefaultTypeMappable map's default_type_map to the frozen all-strings map", () => {
    const byOid = new PG.TypeMapByOid();
    const byClass = new PG.TypeMapByClass();
    expect(byOid).toBeInstanceOf(PG.TypeMap);
    expect(new PG.TypeMapAllStrings()).toBeInstanceOf(PG.TypeMap);
    expect(byOid.defaultTypeMap).toBeInstanceOf(PG.TypeMapAllStrings);
    expect(byOid.defaultTypeMap).toBe(byClass.defaultTypeMap);
    expect(Object.isFrozen(byOid.defaultTypeMap)).toBe(true);
    expect(byOid._lookupOid(0, 20)).toBeNull();
    expect(byClass._lookupKlass(3)).toBeNull();
    const inner = new PG.TypeMapByOid();
    expect(byOid.withDefaultTypeMap(inner)).toBe(byOid);
    expect(byOid.defaultTypeMap).toBe(inner);
  });
});
