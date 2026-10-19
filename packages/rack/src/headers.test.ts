import { describe, it, expect, beforeEach } from "vitest";
import {
  block,
  dup,
  eachKey,
  eachValue,
  KeyError,
  rbEqual,
  rbInspect,
} from "@blazetrails/ruby-compat";
import { Headers } from "./headers.js";

describe("RackHeadersTest", () => {
  let h: Headers;
  let fh: Headers;

  beforeEach(() => {
    h = new Headers();
    fh = Headers.get({ AB: "1", cd: "2", "3": "4" });
  });

  it("class aref", () => {
    const empty = Headers.get();
    expect(empty.size).toBe(0);

    const h1 = Headers.get({ A: "2" });
    expect(h1.get("a")).toBe("2");

    const h2 = Headers.get({ A: "2", B: "4" });
    expect(h2.get("a")).toBe("2");
    expect(h2.get("b")).toBe("4");

    expect(() => Headers.get("A")).toThrow(/odd number/);
  });

  it("default values", () => {
    expect(fh.default()).toBeUndefined();
    expect(fh.defaultProc()).toBeUndefined();
    expect(fh.get("55")).toBeUndefined();

    const h3 = new Headers("3");
    expect(h3.default()).toBe("3");
    expect(h3.defaultProc()).toBeUndefined();
    expect(h3.get("1")).toBe("3");

    fh.setDefault("4");
    expect(fh.default()).toBe("4");
    expect(fh.defaultProc()).toBeUndefined();
    expect(fh.get("55")).toBe("4");

    const h5 = new Headers("5");
    expect(h5.default()).toBe("5");
    expect(h5.get("55")).toBe("5");

    const hProc = new Headers((_h, _k) => "1234");
    expect(hProc.default()).toBeUndefined();
    expect(hProc.defaultProc()).toBeDefined();
    expect(hProc.get("55")).toBe("1234");
  });

  it("store and retrieve", () => {
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
    expect(fh.length()).toBe(3);
    fh.clear();
    expect(fh.length()).toBe(0);
  });

  it("delete", () => {
    expect(fh.length()).toBe(3);
    expect(fh.delete("aB")).toBe("1");
    expect(fh.length()).toBe(2);
    expect(fh.delete("Ab")).toBeUndefined();
    expect(fh.length()).toBe(2);
  });

  it("delete if and reject", () => {
    const rejected = fh.reject((k, _v) => k === "ab" || k === "cd");
    expect(rejected.length()).toBe(1);
    expect(rejected.get("3")).toBe("4");
    expect(fh.length()).toBe(3);

    fh.deleteIf((k, _v) => k === "ab" || k === "cd");
    expect(fh.length()).toBe(1);
    expect(fh.get("3")).toBe("4");

    expect(fh.rejectBang((k, _v) => k === "ab" || k === "cd")).toBeNull();
    const result = fh.rejectBang((k, _v) => k === "3");
    expect(result).not.toBeNull();
    expect(fh.length()).toBe(0);
  });

  it("each", () => {
    let i = 0;
    h.each(() => {
      i++;
    });
    expect(i).toBe(0);

    const items: [string, string][] = [
      ["ab", "1"],
      ["cd", "2"],
      ["3", "4"],
    ];
    const found: [string, string][] = [];
    fh.each((k, v) => {
      found.push([k, v]);
    });
    expect(found.length).toBe(3);
    for (const item of items) {
      expect(found).toContainEqual(item);
    }
  });

  it("each key", () => {
    let i = 0;
    eachKey(h, () => {
      i++;
    });
    expect(i).toBe(0);

    const keys: string[] = [];
    eachKey(fh, (k) => {
      keys.push(k);
    });
    expect(keys.sort()).toEqual(["3", "ab", "cd"]);
  });

  it("each value", () => {
    let i = 0;
    eachValue(h, () => {
      i++;
    });
    expect(i).toBe(0);

    const values: string[] = [];
    eachValue(fh, (v) => {
      values.push(v);
    });
    expect(values.sort()).toEqual(["1", "2", "4"]);
  });

  it("empty", () => {
    expect(h.isEmpty()).toBe(true);
    expect(fh.isEmpty()).toBe(false);
  });

  it("fetch", () => {
    expect(() => h.fetch("1")).toThrow(KeyError);
    h.setDefault("33");
    expect(() => h.fetch("1")).toThrow(KeyError);
    h.set("1", "8");
    expect(h.fetch("1")).toBe("8");
    expect(h.fetch("2", "3")).toBe("3");
    expect(
      h.fetch(
        "2",
        block((k: string) => k.repeat(3)),
      ),
    ).toBe("222");
    expect(fh.fetch("Ab")).toBe("1");
    expect(fh.fetch("cD", "3")).toBe("2");
    expect(fh.fetch("3", "notused")).toBe("4");
  });

  it("has key", () => {
    expect(h.hasKey("1")).toBe(false);
    expect(fh.hasKey("Ab")).toBe(true);
    expect(fh.hasKey("cD")).toBe(true);
    expect(fh.hasKey("3")).toBe(true);
    expect(fh.hasKey("ab")).toBe(true);
    expect(fh.hasKey("CD")).toBe(true);
  });

  it("has value", () => {
    expect(h.hasValue("1")).toBe(false);
    expect(fh.hasValue("1")).toBe(true);
    expect(fh.hasValue("2")).toBe(true);
    expect(fh.hasValue("4")).toBe(true);
    expect(fh.hasValue("3")).toBe(false);
  });

  it("inspect", () => {
    expect(rbInspect(h)).toBe("{}");
    const str = rbInspect(fh);
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

  it("length", () => {
    expect(h.length()).toBe(0);
    expect(h.size).toBe(0);
    expect(fh.length()).toBe(3);
    expect(fh.size).toBe(3);
  });

  it("merge and update", () => {
    expect(h.merge({}).size).toBe(0);
    expect(rbEqual(fh.merge({}), fh)).toBe(true);

    const merged = h.merge({ ab: "55" });
    expect(merged.get("ab")).toBe("55");
    expect(h.size).toBe(0);

    h.update({ ab: "55" });
    expect(h.get("ab")).toBe("55");

    const merged2 = fh.merge({ ab: "55" });
    expect(merged2.get("ab")).toBe("55");
    expect(fh.get("ab")).toBe("1");

    fh.update({ ab: "55" });
    expect(fh.get("ab")).toBe("55");

    const merged3 = fh.merge({ ab: "ss" }, (k, ov, nv) => [k, nv, ov].join(""));
    expect(merged3.get("ab")).toBe("abss55");
    expect(fh.get("ab")).toBe("55");

    fh.update({ ab: "ss" }, (k, ov, nv) => [k, nv, ov].join(""));
    expect(fh.get("ab")).toBe("abss55");
  });

  it("replace", () => {
    const h1 = dup(h);
    const fh1 = dup(fh);
    const result = fh1.replace(h1);
    expect(result).toBe(fh1);
    expect(fh1.size).toBe(0);

    const result2 = h1.replace(fh);
    expect(result2).toBe(h1);
    expect(rbEqual(h1, fh)).toBe(true);
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
    const arr = fh.toA();
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
    expect(h.toA().sort()).toEqual([]);
    const sorted = Headers.get("CD", "4", "AB", "1", "EF", "2").toA().sort();
    expect(sorted).toEqual([
      ["ab", "1"],
      ["cd", "4"],
      ["ef", "2"],
    ]);
  });

  it("to a", () => {
    expect(h.toA()).toEqual([]);
    const arr = fh.toA();
    expect(arr).toContainEqual(["ab", "1"]);
    expect(arr).toContainEqual(["cd", "2"]);
    expect(arr).toContainEqual(["3", "4"]);
  });

  it("to hash", () => {
    expect(h.toHash()).toBe(h);
    const hash = fh.toHash() as Headers;
    expect(hash.get("ab")).toBe("1");
    expect(hash.get("cd")).toBe("2");
    expect(hash.get("3")).toBe("4");
  });

  it("values", () => {
    expect(h.values()).toEqual([]);
    const vals = Headers.get({ aB: "f", "1": "c" }).values();
    expect(vals).toContain("f");
    expect(vals).toContain("c");
  });

  it("values at", () => {
    expect(h.valuesAt()).toEqual([]);
    expect(fh.valuesAt("AB")).toEqual(["1"]);
    expect(fh.valuesAt("CD", "Ab")).toEqual(["2", "1"]);
  });

  it("assoc", () => {
    expect(h.assoc("1")).toBeNull();
    expect(fh.assoc("Ab")).toEqual(["ab", "1"]);
    expect(fh.assoc("CD")).toEqual(["cd", "2"]);
    expect(fh.assoc("4")).toBeNull();
    expect(fh.assoc("3")).toEqual(["3", "4"]);
  });

  it("default proc=", () => {
    h.setDefaultProc((_h, k) => k.repeat(2));
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

  it("keep if", () => {
    expect(h.keepIf(() => true).size).toBe(0);
    expect(fh.keepIf(() => true).size).toBe(3);
    const fhDup = dup(fh);
    fhDup.keepIf(() => false);
    expect(fhDup.size).toBe(0);
    const result = fh.keepIf((k) => k === "ab");
    expect(result.size).toBe(1);
    expect(result.get("ab")).toBe("1");
  });

  it("key", () => {
    expect(h.key("1")).toBeNull();
    expect(fh.key("1")).toBe("ab");
    expect(fh.key("2")).toBe("cd");
    expect(fh.key("3")).toBeNull();
    expect(fh.key("4")).toBe("3");
  });

  it("rassoc", () => {
    expect(h.rassoc("1")).toBeNull();
    expect(fh.rassoc("1")).toEqual(["ab", "1"]);
    expect(fh.rassoc("2")).toEqual(["cd", "2"]);
    expect(fh.rassoc("3")).toBeNull();
    expect(fh.rassoc("4")).toEqual(["3", "4"]);
  });

  it("select!", () => {
    expect(h.selectBang(() => true)).toBeNull();
    expect(fh.selectBang(() => true)).toBeNull();
    const fhDup = dup(fh);
    expect(fhDup.selectBang(() => false)).toBe(fhDup);
    expect(fhDup.size).toBe(0);
    const result = fh.selectBang((k) => k === "ab");
    expect(result).toBe(fh);
    expect(fh.size).toBe(1);
  });

  it("compare by identity", () => {
    expect(() => fh.compareByIdentity()).toThrow(TypeError);
  });

  it("compare by identity?", () => {
    expect(fh.isCompareByIdentity()).toBe(false);
  });

  it("to h", () => {
    expect(h.toH()).toEqual({});
    expect(fh.toH()).toEqual({ "3": "4", ab: "1", cd: "2" });
  });

  it("dig", () => {
    expect(fh.dig("AB")).toBe("1");
    expect(fh.dig("Cd")).toBe("2");
    expect(fh.dig("3")).toBe("4");
    expect(fh.dig("4")).toBeUndefined();
    expect(() => fh.dig("AB", 1)).toThrow(TypeError);
  });

  it("fetch values", () => {
    expect(fh.fetchValues("AB")).toEqual(["1"]);
    expect(fh.fetchValues("AB", "Cd", "3")).toEqual(["1", "2", "4"]);
    expect(() => fh.fetchValues("AB", "cD", "4")).toThrow(KeyError);
  });

  it("to proc", () => {
    const pr = fh.toProc();
    expect(pr("AB")).toBe("1");
    expect(pr("cD")).toBe("2");
    expect(pr("3")).toBe("4");
    expect(pr("4")).toBeUndefined();
  });

  it("compact", () => {
    expect(rbEqual(fh.compact(), fh)).toBe(true);
    expect(fh.compact()).not.toBe(fh);
  });

  it("compact!", () => {
    expect(fh.compactBang()).toBeNull();
  });

  it("transform values", () => {
    const tv = fh.transformValues((v) => v.repeat(2));
    expect(fh.get("aB")).toBe("1");
    expect(tv.get("Ab")).toBe("11");
    expect(tv.get("cD")).toBe("22");
    expect(tv.get("3")).toBe("44");
  });

  it("transform values!", () => {
    fh.transformValuesBang((v) => v.repeat(2));
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

  it("transform keys", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    const dhBefore = dup(fh);
    const tk = fh.transformKeys((k) => map[k]);
    expect(rbEqual(fh, dhBefore)).toBe(true);
    expect(tk.get("xY")).toBe("1");
    expect(tk.get("Dc")).toBe("2");
    expect(tk.get("5")).toBe("4");
  });

  it("transform keys!", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    fh.transformKeysBang((k) => map[k]);
    expect(fh.get("xY")).toBe("1");
    expect(fh.get("DC")).toBe("2");
    expect(fh.get("5")).toBe("4");
  });

  it("filter!", () => {
    expect(h.selectBang(() => true)).toBeNull();
    expect(fh.selectBang(() => true)).toBeNull();
    const fhDup = dup(fh);
    fhDup.selectBang(() => false);
    expect(fhDup.size).toBe(0);
    const result = fh.selectBang((k) => k === "ab");
    expect(result).toBe(fh);
    expect(fh.size).toBe(1);
  });

  it("except", () => {
    fh = Headers.get({ AB: "1", Cd: "2", "3": "4" });
    expect(rbEqual(fh, fh.except())).toBe(true);
    expect(rbEqual(Headers.get({ cD: "2", "3": "4" }), fh.except("AB", "5"))).toBe(true);
    expect(rbEqual(Headers.get({ AB: "1" }), fh.except("cD", "3"))).toBe(true);
  });

  it("dup and clone", () => {
    const d = dup(h);
    d.set("A", "2");
    expect(h.size).toBe(0);
    expect(d.get("a")).toBe("2");
  });

  it("public interface", () => {
    const h = new Headers();
    expect(typeof h.get).toBe("function");
    expect(typeof h.set).toBe("function");
    expect(typeof h.delete).toBe("function");
    expect(typeof h.hasKey).toBe("function");
    expect(typeof h.each).toBe("function");
    expect(typeof h.merge).toBe("function");
    expect(typeof h.keys).toBe("function");
    expect(typeof h.values).toBe("function");
    expect(typeof h.toHash).toBe("function");
  });

  it("deconstruct keys", () => {
    expect(rbEqual(fh.deconstructKeys([]), fh.toHash())).toBe(true);
    expect(fh.deconstructKeys([]).constructor).toBe(Headers);
  });
});
