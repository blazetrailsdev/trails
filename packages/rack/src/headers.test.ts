import { describe, it, expect, beforeEach } from "vitest";
import { Headers } from "./headers.js";

describe("Rack::Headers", () => {
  let h: Headers;
  let fh: Headers;

  beforeEach(() => {
    h = new Headers();
    fh = Headers.from({ AB: "1", cd: "2", "3": "4" });
  });

  it("class aref creates from key-value pairs", () => {
    const empty = Headers.from();
    expect(empty.size).toBe(0);

    const h1 = Headers.from({ A: "2" });
    expect(h1.get("a")).toBe("2");

    const h2 = Headers.from({ A: "2", B: "4" });
    expect(h2.get("a")).toBe("2");
    expect(h2.get("b")).toBe("4");

    expect(() => Headers.from("A")).toThrow(/odd number/);
  });

  it("default values", () => {
    expect(fh.default).toBeUndefined();
    expect(fh.defaultProc).toBeUndefined();
    expect(fh.get("55")).toBeUndefined();

    const h3 = new Headers("3");
    expect(h3.default).toBe("3");
    expect(h3.defaultProc).toBeUndefined();
    expect(h3.get("1")).toBe("3");

    fh.default = "4";
    expect(fh.default).toBe("4");
    expect(fh.defaultProc).toBeUndefined();
    expect(fh.get("55")).toBe("4");

    const h5 = new Headers("5");
    expect(h5.default).toBe("5");
    expect(h5.get("55")).toBe("5");

    const hProc = new Headers((_h, _k) => "1234");
    expect(hProc.default).toBeUndefined();
    expect(hProc.defaultProc).toBeDefined();
    expect(hProc.get("55")).toBe("1234");
  });

  it("store and retrieve case-insensitively", () => {
    expect(h.get("a")).toBeUndefined();
    h.set("A", "2");
    expect(h.get("a")).toBe("2");
    expect(h.get("A")).toBe("2");
    h.set("a", "3");
    expect(h.get("a")).toBe("3");
    expect(h.get("A")).toBe("3");
    h.set("AB", "5");
    expect(h.get("ab")).toBe("5");
    expect(h.get("AB")).toBe("5");
    expect(h.get("aB")).toBe("5");
    expect(h.get("Ab")).toBe("5");
    h.store("C", "8");
    expect(h.get("c")).toBe("8");
    expect(h.get("C")).toBe("8");
  });

  it("clear", () => {
    expect(fh.length).toBe(3);
    fh.clear();
    expect(fh.length).toBe(0);
  });

  it("delete", () => {
    expect(fh.length).toBe(3);
    expect(fh.delete("aB")).toBe("1");
    expect(fh.length).toBe(2);
    expect(fh.delete("Ab")).toBeUndefined();
    expect(fh.length).toBe(2);
  });

  it("delete_if and reject", () => {
    const rejected = fh.reject((k, v) => k === "ab" || k === "cd");
    expect(rejected.length).toBe(1);
    expect(rejected.get("3")).toBe("4");
    expect(fh.length).toBe(3);

    fh.deleteIf((k, v) => k === "ab" || k === "cd");
    expect(fh.length).toBe(1);
    expect(fh.get("3")).toBe("4");

    expect(fh.rejectInPlace((k, v) => k === "ab" || k === "cd")).toBeNull();
    const result = fh.rejectInPlace((k, v) => k === "3");
    expect(result).not.toBeNull();
    expect(fh.length).toBe(0);
  });

  it("each", () => {
    let i = 0;
    h.each(() => { i++; });
    expect(i).toBe(0);

    const items: [string, string][] = [["ab", "1"], ["cd", "2"], ["3", "4"]];
    const found: [string, string][] = [];
    fh.each((k, v) => { found.push([k, v]); });
    expect(found.length).toBe(3);
    for (const item of items) {
      expect(found).toContainEqual(item);
    }
  });

  it("each_key", () => {
    let i = 0;
    h.eachKey(() => { i++; });
    expect(i).toBe(0);

    const keys: string[] = [];
    fh.eachKey((k) => { keys.push(k); });
    expect(keys.sort()).toEqual(["3", "ab", "cd"]);
  });

  it("each_value", () => {
    let i = 0;
    h.eachValue(() => { i++; });
    expect(i).toBe(0);

    const values: string[] = [];
    fh.eachValue((v) => { values.push(v); });
    expect(values.sort()).toEqual(["1", "2", "4"]);
  });

  it("empty", () => {
    expect(h.empty).toBe(true);
    expect(fh.empty).toBe(false);
  });

  it("fetch", () => {
    expect(() => h.fetch("1")).toThrow(/IndexError/);
    h.default = "33";
    expect(() => h.fetch("1")).toThrow(/IndexError/); // default doesn't affect fetch
    h.set("1", "8");
    expect(h.fetch("1")).toBe("8");
    expect(h.fetch("2", "3")).toBe("3");
    expect(h.fetch("2", (k: string) => k.repeat(3))).toBe("222");
    expect(fh.fetch("Ab")).toBe("1");
    expect(fh.fetch("cD", "3")).toBe("2");
    expect(fh.fetch("3", "notused")).toBe("4");
  });

  it("has_key (include?)", () => {
    expect(h.has("1")).toBe(false);
    expect(fh.has("Ab")).toBe(true);
    expect(fh.has("cD")).toBe(true);
    expect(fh.has("3")).toBe(true);
    expect(fh.has("ab")).toBe(true);
    expect(fh.has("CD")).toBe(true);
  });

  it("has_value (value?)", () => {
    expect(h.hasValue("1")).toBe(false);
    expect(fh.hasValue("1")).toBe(true);
    expect(fh.hasValue("2")).toBe(true);
    expect(fh.hasValue("4")).toBe(true);
    expect(fh.hasValue("3")).toBe(false);
  });

  it("inspect", () => {
    expect(h.inspect()).toBe("{}");
    // Keys are stored lowercase
    const str = fh.inspect();
    expect(str).toContain('"ab"=>"1"');
    expect(str).toContain('"cd"=>"2"');
    expect(str).toContain('"3"=>"4"');
  });

  it("invert", () => {
    expect(h.invert().size).toBe(0);
    const inv = fh.invert();
    expect(inv.get("1")).toBe("ab");
    expect(inv.get("2")).toBe("cd");
    expect(inv.get("4")).toBe("3");
  });

  it("keys", () => {
    expect(h.keys()).toEqual([]);
    expect(fh.keys().sort()).toEqual(["3", "ab", "cd"]);
  });

  it("length and size", () => {
    expect(h.length).toBe(0);
    expect(h.size).toBe(0);
    expect(fh.length).toBe(3);
    expect(fh.size).toBe(3);
  });

  it("merge and update", () => {
    expect(h.merge({}).size).toBe(0);
    expect(fh.merge({}).equals(fh)).toBe(true);

    const merged = h.merge({ ab: "55" });
    expect(merged.get("ab")).toBe("55");
    expect(h.size).toBe(0); // original unchanged

    h.update({ ab: "55" });
    expect(h.get("ab")).toBe("55");

    const merged2 = fh.merge({ ab: "55" });
    expect(merged2.get("ab")).toBe("55");
    expect(fh.get("ab")).toBe("1"); // original unchanged

    fh.mergeInPlace({ ab: "55" });
    expect(fh.get("ab")).toBe("55");

    // With block
    const merged3 = fh.merge({ ab: "ss" }, (k, ov, nv) => [k, nv, ov].join(""));
    expect(merged3.get("ab")).toBe("abss55");
    expect(fh.get("ab")).toBe("55"); // original unchanged

    fh.update({ ab: "ss" }, (k, ov, nv) => [k, nv, ov].join(""));
    expect(fh.get("ab")).toBe("abss55");
  });

  it("replace", () => {
    const h1 = h.dup();
    const fh1 = fh.dup();
    const result = fh1.replace(h1);
    expect(result).toBe(fh1);
    expect(fh1.size).toBe(0);

    const result2 = h1.replace(fh);
    expect(result2).toBe(h1);
    expect(h1.equals(fh)).toBe(true);
  });

  it("select", () => {
    expect(h.select(() => true).size).toBe(0);
    expect(fh.select(() => true).size).toBe(3);
    expect(fh.select(() => false).size).toBe(0);
    const selected = fh.select((k) => k.startsWith("c"));
    expect(selected.size).toBe(1);
    expect(selected.get("cd")).toBe("2");
  });

  it("shift", () => {
    expect(h.shift()).toBeUndefined();
    const arr = fh.toArray();
    let i = 3;
    while (i > 0) {
      const kv = fh.shift();
      expect(kv).toBeDefined();
      expect(arr).toContainEqual(kv);
      i--;
    }
    expect(fh.shift()).toBeUndefined();
    expect(fh.size).toBe(0);
  });

  it("sort", () => {
    expect(h.sort()).toEqual([]);
    const sorted = Headers.from("CD", "4", "AB", "1", "EF", "2").sort();
    expect(sorted).toEqual([["ab", "1"], ["cd", "4"], ["ef", "2"]]);
  });

  it("to_a", () => {
    expect(h.toArray()).toEqual([]);
    const arr = fh.toArray();
    expect(arr).toContainEqual(["ab", "1"]);
    expect(arr).toContainEqual(["cd", "2"]);
    expect(arr).toContainEqual(["3", "4"]);
  });

  it("to_hash", () => {
    expect(h.toHash()).toEqual({});
    const hash = fh.toHash();
    expect(hash["ab"]).toBe("1");
    expect(hash["cd"]).toBe("2");
    expect(hash["3"]).toBe("4");
  });

  it("values", () => {
    expect(h.values()).toEqual([]);
    const vals = Headers.from({ aB: "f", "1": "c" }).values();
    expect(vals).toContain("f");
    expect(vals).toContain("c");
  });

  it("values_at", () => {
    expect(h.valuesAt()).toEqual([]);
    expect(fh.valuesAt("AB")).toEqual(["1"]);
    expect(fh.valuesAt("CD", "Ab")).toEqual(["2", "1"]);
  });

  it("assoc", () => {
    expect(h.assoc("1")).toBeUndefined();
    expect(fh.assoc("Ab")).toEqual(["ab", "1"]);
    expect(fh.assoc("CD")).toEqual(["cd", "2"]);
    expect(fh.assoc("4")).toBeUndefined();
    expect(fh.assoc("3")).toEqual(["3", "4"]);
  });

  it("default_proc=", () => {
    h.defaultProc = (_h, k) => k.repeat(2);
    expect(h.get("A")).toBe("aa");
    h.set("Ab", "2");
    expect(h.get("aB")).toBe("2");
  });

  it("flatten", () => {
    expect(h.flatten()).toEqual([]);
    const flat = fh.flatten();
    expect(flat.length).toBe(6);
    expect(flat).toContain("ab");
    expect(flat).toContain("1");
  });

  it("keep_if", () => {
    expect(h.keepIf(() => true).size).toBe(0);
    expect(fh.keepIf(() => true).size).toBe(3);
    const fhDup = fh.dup();
    fhDup.keepIf(() => false);
    expect(fhDup.size).toBe(0);
    const result = fh.keepIf((k) => k === "ab");
    expect(result.size).toBe(1);
    expect(result.get("ab")).toBe("1");
  });

  it("key", () => {
    expect(h.key("1")).toBeUndefined();
    expect(fh.key("1")).toBe("ab");
    expect(fh.key("2")).toBe("cd");
    expect(fh.key("3")).toBeUndefined();
    expect(fh.key("4")).toBe("3");
  });

  it("rassoc", () => {
    expect(h.rassoc("1")).toBeUndefined();
    expect(fh.rassoc("1")).toEqual(["ab", "1"]);
    expect(fh.rassoc("2")).toEqual(["cd", "2"]);
    expect(fh.rassoc("3")).toBeUndefined();
    expect(fh.rassoc("4")).toEqual(["3", "4"]);
  });

  it("select!", () => {
    expect(h.selectInPlace(() => true)).toBeNull();
    expect(fh.selectInPlace(() => true)).toBeNull();
    const fhDup = fh.dup();
    expect(fhDup.selectInPlace(() => false)).toBe(fhDup);
    expect(fhDup.size).toBe(0);
    const result = fh.selectInPlace((k) => k === "ab");
    expect(result).toBe(fh);
    expect(fh.size).toBe(1);
  });

  it("compare_by_identity raises", () => {
    expect(() => fh.compareByIdentity()).toThrow(TypeError);
  });

  it("compare_by_identity? returns false", () => {
    expect(fh.compareByIdentityQ).toBe(false);
  });

  it("to_h", () => {
    expect(h.toH()).toEqual({});
    const hash = fh.toH();
    expect(hash["ab"]).toBe("1");
  });

  it("dig", () => {
    expect(fh.dig("AB")).toBe("1");
    expect(fh.dig("Cd")).toBe("2");
    expect(fh.dig("3")).toBe("4");
    expect(fh.dig("4")).toBeUndefined();
    expect(() => fh.dig("AB", 1)).toThrow(TypeError);
  });

  it("fetch_values", () => {
    expect(fh.fetchValues("AB")).toEqual(["1"]);
    expect(fh.fetchValues("AB", "Cd", "3")).toEqual(["1", "2", "4"]);
    expect(() => fh.fetchValues("AB", "cD", "4")).toThrow(/KeyError/);
  });

  it("to_proc", () => {
    const pr = fh.toProc();
    expect(pr("AB")).toBe("1");
    expect(pr("cD")).toBe("2");
    expect(pr("3")).toBe("4");
    expect(pr("4")).toBeUndefined();
  });

  it("compact", () => {
    expect(fh.compact().equals(fh)).toBe(true);
    expect(fh.compact()).not.toBe(fh);
  });

  it("compact!", () => {
    expect(fh.compactInPlace()).toBeNull();
  });

  it("transform_values", () => {
    const tv = fh.transformValues((v) => v.repeat(2));
    expect(fh.get("aB")).toBe("1"); // original unchanged
    expect(tv.get("Ab")).toBe("11");
    expect(tv.get("cD")).toBe("22");
    expect(tv.get("3")).toBe("44");
  });

  it("transform_values!", () => {
    fh.transformValuesInPlace((v) => v.repeat(2));
    expect(fh.get("AB")).toBe("11");
    expect(fh.get("aB")).toBe("11");
  });

  it("slice", () => {
    const sliced = fh.slice("aB", "Cd", "3");
    expect(sliced.size).toBe(3);
    expect(sliced.get("Ab")).toBe("1");
    expect(sliced.get("CD")).toBe("2");

    const sliced2 = fh.slice("Ab", "CD");
    expect(sliced2.size).toBe(2);

    const sliced3 = fh.slice("ad");
    expect(sliced3.size).toBe(0);
  });

  it("transform_keys", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    const dhBefore = fh.dup();
    const tk = fh.transformKeys((k) => map[k]);
    expect(fh.equals(dhBefore)).toBe(true); // original unchanged
    expect(tk.get("xY")).toBe("1");
    expect(tk.get("Dc")).toBe("2");
    expect(tk.get("5")).toBe("4");
  });

  it("transform_keys!", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    fh.transformKeysInPlace((k) => map[k]);
    expect(fh.get("xY")).toBe("1");
    expect(fh.get("DC")).toBe("2");
    expect(fh.get("5")).toBe("4");
  });

  it("filter!", () => {
    expect(h.selectInPlace(() => true)).toBeNull();
    expect(fh.selectInPlace(() => true)).toBeNull();
    const fhDup = fh.dup();
    fhDup.selectInPlace(() => false);
    expect(fhDup.size).toBe(0);
    const result = fh.selectInPlace((k) => k === "ab");
    expect(result).toBe(fh);
    expect(fh.size).toBe(1);
  });

  it("except", () => {
    expect(fh.except().equals(fh)).toBe(true);
    const ex1 = fh.except("AB");
    expect(ex1.size).toBe(2);
    expect(ex1.has("ab")).toBe(false);

    const ex2 = fh.except("cD", "3");
    expect(ex2.size).toBe(1);
    expect(ex2.get("AB")).toBe("1");
  });

  it("dup and clone", () => {
    const dup = h.dup();
    dup.set("A", "2");
    expect(h.size).toBe(0);
    expect(dup.get("a")).toBe("2");
  });

  it("public interface", () => {
    // Headers should expose all Hash-like methods
    const h = new Headers();
    expect(typeof h.get).toBe("function");
    expect(typeof h.set).toBe("function");
    expect(typeof h.delete).toBe("function");
    expect(typeof h.has).toBe("function");
    expect(typeof h.each).toBe("function");
    expect(typeof h.merge).toBe("function");
    expect(typeof h.keys).toBe("function");
    expect(typeof h.values).toBe("function");
    expect(typeof h.toHash).toBe("function");
  });

  it("deconstruct keys", () => {
    const dk = fh.deconstructKeys();
    expect(dk.get("ab")).toBe("1");
    expect(dk).not.toBe(fh);
  });

  it("equals compares contents", () => {
    const h1 = Headers.from({ a: "1", b: "2" });
    const h2 = Headers.from({ A: "1", B: "2" });
    expect(h1.equals(h2)).toBe(true);
  });
});
