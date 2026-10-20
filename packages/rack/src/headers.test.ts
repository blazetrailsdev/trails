import { describe, it, expect, beforeEach } from "vitest";
import {
  ArgumentError,
  block,
  eachKey,
  eachValue,
  Hash,
  KeyError,
  publicInstanceMethods,
  rbEqual,
  rbInspect,
  rbObjClone,
  rbObjDup,
  rbObjFrozenP,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import { Headers } from "./headers.js";

describe("RackHeadersTest", () => {
  let h: Headers;
  let fh: Headers;

  beforeEach(() => {
    h = new Headers();
    fh = Headers.get("AB", "1", "cd", "2", "3", "4");
  });

  it.skip("public interface", () => {
    // BLOCKED: ruby-compat-hash-answers-rack-headers-public-interface
    const headersMethods = publicInstanceMethods(Headers).sort();
    const hashMethods = publicInstanceMethods(Hash).sort();
    expect(headersMethods.filter((m) => !hashMethods.includes(m))).toHaveLength(0);
    expect(hashMethods.filter((m) => !headersMethods.includes(m))).toHaveLength(0);
  });

  it("class aref", () => {
    expect(rbEqual(new Hash(), Headers.get())).toBe(true);
    const a = new Hash<string, string>();
    a.set("a", "2");
    expect(rbEqual(a, Headers.get({ A: "2" }))).toBe(true);
    const ab = new Hash<string, string>();
    ab.set("a", "2");
    ab.set("b", "4");
    expect(rbEqual(ab, Headers.get({ A: "2", B: "4" }))).toBe(true);
    expect(rbEqual(ab, Headers.get("A", "2", "B", "4"))).toBe(true);
    expect(() => Headers.get("A")).toThrow(ArgumentError);
    expect(() => Headers.get("A", 2, "B")).toThrow(ArgumentError);
  });

  it("default values", () => {
    let hh: Hash<string, string> = new Hash();
    let ch = new Headers();
    expect(rbEqual(hh, ch)).toBe(true);
    hh = new Hash("1");
    ch = new Headers("1");
    expect(rbEqual(hh, ch)).toBe(true);
    expect(ch.get("3")).toBe(hh.get("3"));
    hh.set("a", "2");
    ch.set("A", "2");
    expect(ch.get("a")).toBe(hh.get("a"));
    hh = new Hash((_h, k) => k.repeat(2));
    ch = new Headers((_h, k) => k.repeat(2));
    expect(ch.get("3")).toBe(hh.get("3"));
    hh.set("c", "2");
    ch.set("C", "2");
    expect(ch.get("c")).toBe(hh.get("c"));
    expect(() => new Headers("1", (_hash, _k) => "")).toThrow(ArgumentError);

    expect(fh.default()).toBeUndefined();
    expect(fh.defaultProc()).toBeUndefined();
    expect(fh.get("55")).toBeUndefined();
    expect(new Headers("3").default()).toBe("3");
    expect(new Headers("3").defaultProc()).toBeUndefined();
    expect(new Headers("3").get("1")).toBe("3");

    fh.setDefault("4");
    expect(fh.default()).toBe("4");
    expect(fh.defaultProc()).toBeUndefined();
    expect(fh.get("55")).toBe("4");

    h = new Headers("5");
    expect(h.default()).toBe("5");
    expect(h.defaultProc()).toBeUndefined();
    expect(h.get("55")).toBe("5");

    h = new Headers((_hash, _key) => "1234");
    expect(h.default()).toBeUndefined();
    expect(h.defaultProc()).not.toBe(null);
    expect(h.get("55")).toBe("1234");

    h = new Headers((hash, key) => {
      hash.set(key, "1234");
      return null as unknown as string;
    });
    expect(h.default()).toBeUndefined();
    expect(h.defaultProc()).not.toBe(null);
    expect(h.get("Ac")).toBeNull();
    expect(h.get("aC")).toBe("1234");
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
    expect(rbEqual(new Hash(), fh)).toBe(true);
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
    const h34 = new Hash<string, string>();
    h34.set("3", "4");
    expect(fh.length()).toBe(3);
    let hash: Headers | null = fh.reject((key, _value) => key === "ab" || key === "cd");
    expect(hash.length()).toBe(1);
    expect(rbEqual(h34, hash)).toBe(true);
    expect(fh.length()).toBe(3);
    hash = fh.deleteIf((key, _value) => key === "ab" || key === "cd");
    expect(hash.length()).toBe(1);
    expect(rbEqual(h34, hash)).toBe(true);
    expect(fh.length()).toBe(1);
    expect(rbEqual(h34, fh)).toBe(true);
    expect(fh.rejectBang((key, _value) => key === "ab" || key === "cd")).toBeNull();
    hash = fh.rejectBang((key, _value) => key === "3")!;
    expect(hash.length()).toBe(0);
    expect(rbEqual(new Hash(), hash)).toBe(true);
    expect(fh.length()).toBe(0);
    expect(rbEqual(new Hash(), fh)).toBe(true);
  });

  it("dup and clone", () => {
    rbObjSingletonClass(h).prototype.foo = () => 1;
    const h2 = rbObjDup(h);
    const h3 = rbObjClone(h);
    h2.set("A", "2");
    h3.set("B", "3");
    expect(rbEqual(Headers.get(), h)).toBe(true);
    expect(() => (h2 as any).foo()).toThrow(TypeError);
    expect((h3 as any).foo()).toBe(1);
    expect(h2.get("a")).toBe("2");
    expect(h3.get("b")).toBe("3");
  });

  it("each", () => {
    let i = 0;
    h.each(() => {
      i += 1;
    });
    expect(i).toBe(0);
    let items: [string, string][] = [
      ["ab", "1"],
      ["cd", "2"],
      ["3", "4"],
    ];
    fh.each((k, v) => {
      expect(items.some(([ik, iv]) => ik === k && iv === v)).toBeTruthy();
      items = items.filter(([ik, iv]) => !(ik === k && iv === v));
    });
    expect(items).toEqual([]);
  });

  it("each key", () => {
    let i = 0;
    h.each(() => {
      i += 1;
    });
    expect(i).toBe(0);
    let keys = ["ab", "cd", "3"];
    eachKey(fh, (k: string) => {
      expect(keys.includes(k)).toBeTruthy();
      expect(rbObjFrozenP(k)).toBeTruthy();
      keys = keys.filter((x) => x !== k);
    });
    expect(keys).toEqual([]);
  });

  it("each value", () => {
    let i = 0;
    h.each(() => {
      i += 1;
    });
    expect(i).toBe(0);
    let values = ["1", "2", "4"];
    eachValue(fh, (v: string) => {
      expect(values.includes(v)).toBeTruthy();
      values = values.filter((x) => x !== v);
    });
    expect(values).toEqual([]);
  });

  it("empty", () => {
    expect(h.isEmpty()).toBeTruthy();
    expect(!fh.isEmpty()).toBeTruthy();
  });

  it("fetch", () => {
    expect(() => (h.fetch as any)("1", "2", "3")).toThrow(ArgumentError);
    expect(() =>
      (h.fetch as any)(
        "1",
        "2",
        "3",
        block(() => "4"),
      ),
    ).toThrow(ArgumentError);
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
    expect(fh.fetch("3", 3)).toBe("4");
    expect(
      fh.fetch(
        "3",
        block((k: string) => k.repeat(3)),
      ),
    ).toBe("4");
    expect(() => new Headers(() => "34").fetch("1")).toThrow(KeyError);
  });

  it("has key", () => {
    for (const meth of ["isInclude", "hasKey"] as const) {
      expect(!h[meth]("1")).toBeTruthy();
      expect(fh[meth]("Ab")).toBeTruthy();
      expect(fh[meth]("cD")).toBeTruthy();
      expect(fh[meth]("3")).toBeTruthy();
      expect(fh[meth]("ab")).toBeTruthy();
      expect(fh[meth]("CD")).toBeTruthy();
      expect(fh[meth]("3")).toBeTruthy();
      expect(!fh[meth]("1")).toBeTruthy();
    }
  });

  it("has value", () => {
    for (const meth of ["hasValue"] as const) {
      expect(!h[meth]("1")).toBeTruthy();
      expect(fh[meth]("1")).toBeTruthy();
      expect(fh[meth]("2")).toBeTruthy();
      expect(fh[meth]("4")).toBeTruthy();
      expect(!fh[meth]("3")).toBeTruthy();
    }
  });

  it("inspect", () => {
    expect(rbInspect(h)).toBe("{}");
    expect(rbInspect(fh)).toBe('{"ab"=>"1", "cd"=>"2", "3"=>"4"}');
  });

  it("invert", () => {
    expect(h.invert()).toBeInstanceOf(Headers);
    expect(rbEqual(new Hash(), h.invert())).toBe(true);
    expect(rbEqual(Headers.get("1", "ab", "2", "cd", "4", "3"), fh.invert())).toBe(true);
    expect(rbEqual(Headers.get({ cd: "ab" }), Headers.get({ AB: "CD" }).invert())).toBe(true);
    expect(rbEqual(Headers.get({ cd: "xy" }), Headers.get({ AB: "Cd", xY: "cD" }).invert())).toBe(
      true,
    );
  });

  it("keys", () => {
    expect(h.keys()).toEqual([]);
    expect(fh.keys()).toEqual(["ab", "cd", "3"]);
  });

  it("length", () => {
    expect(h.length()).toBe(0);
    expect(fh.length()).toBe(3);
  });

  it("merge and update", () => {
    const join = (k: string, ov: string, nv: string) => [k, nv, ov].join("");
    expect(rbEqual(h, h.merge({}))).toBe(true);
    expect(rbEqual(fh, fh.merge({}))).toBe(true);
    expect(rbEqual(Headers.get({ ab: "55" }), h.merge({ ab: "55" }))).toBe(true);
    expect(rbEqual(Headers.get(), h)).toBe(true);
    expect(rbEqual(Headers.get({ ab: "55" }), h.update({ ab: "55" }))).toBe(true);
    expect(rbEqual(Headers.get({ ab: "55" }), h)).toBe(true);
    const fh55 = Headers.get({ ab: "55", cd: "2", "3": "4" });
    expect(rbEqual(fh55, fh.merge({ ab: "55" }))).toBe(true);
    expect(rbEqual(Headers.get({ ab: "1", cd: "2", "3": "4" }), fh)).toBe(true);
    expect(rbEqual(fh55, fh.update({ ab: "55" }))).toBe(true);
    expect(rbEqual(fh55, fh)).toBe(true);
    const fhAbss55 = Headers.get({ ab: "abss55", cd: "2", "3": "4" });
    expect(rbEqual(fhAbss55, fh.merge({ ab: "ss" }, join))).toBe(true);
    expect(rbEqual(fh55, fh)).toBe(true);
    expect(rbEqual(fhAbss55, fh.update({ ab: "ss" }, join))).toBe(true);
    expect(rbEqual(fhAbss55, fh)).toBe(true);
    const fhAbssabss55 = Headers.get({ ab: "abssabss55", cd: "2", "3": "4" });
    expect(rbEqual(fhAbssabss55, fh.update({ ab: "ss" }, join))).toBe(true);
    expect(rbEqual(fhAbssabss55, fh)).toBe(true);
  });

  it("replace", () => {
    const h0 = rbObjDup(h);
    const fh0 = rbObjDup(fh);
    const h1 = fh0.replace(h);
    expect(rbEqual(h, h1)).toBe(true);
    expect(h1).toBe(fh0);

    const h2 = h0.replace(fh);
    expect(rbEqual(fh, h2)).toBe(true);
    expect(h2).toBe(h0);

    expect(rbEqual(h, fh0.replace({}))).toBe(true);
    expect(rbEqual(fh, h0.replace(Headers.get("AB", "1", "cd", "2", "3", "4")))).toBe(true);
  });

  it("select", () => {
    expect(
      rbEqual(
        new Hash(),
        h.select(() => true),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        new Hash(),
        h.select(() => false),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ "3": "4", ab: "1", cd: "2" }),
        fh.select(() => true),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        new Hash(),
        fh.select(() => false),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ cd: "2" }),
        fh.select((k, _v) => k.startsWith("c")),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ "3": "4" }),
        fh.select((_k, v) => v === "4"),
      ),
    ).toBe(true);
  });

  it("shift", () => {
    expect(h.shift()).toBeUndefined();
    let array = fh.toA();
    let i = 3;
    for (;;) {
      expect(i >= 0).toBeTruthy();
      const kv = fh.shift();
      if (kv === undefined) {
        // eslint-disable-next-line vitest/no-conditional-expect -- spec_headers.rb:299 asserts in this branch
        expect(array).toEqual([]);
        break;
      } else {
        i -= 1;
        // eslint-disable-next-line vitest/no-conditional-expect -- spec_headers.rb:303 asserts in this branch
        expect(array.some((e) => rbEqual(e, kv))).toBeTruthy();
        array = array.filter((e) => !rbEqual(e, kv));
      }
    }
    expect(array).toEqual([]);
    expect(i).toBe(0);
  });

  it("sort", () => {
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    expect(h.toA().sort()).toEqual([]);
    expect(h.toA().sort((a, b) => cmp(String(a), String(b)))).toEqual([]);
    expect(Headers.get("CD", "4", "AB", "1", "EF", "2").toA().sort()).toEqual([
      ["ab", "1"],
      ["cd", "4"],
      ["ef", "2"],
    ]);
    expect(fh.toA().sort(([ak], [bk]) => cmp(ak, bk))).toEqual([
      ["3", "4"],
      ["ab", "1"],
      ["cd", "2"],
    ]);
  });

  it("to a", () => {
    expect(h.toA()).toEqual([]);
    expect(fh.toA()).toEqual([
      ["ab", "1"],
      ["cd", "2"],
      ["3", "4"],
    ]);
  });

  it("to hash", () => {
    const expected = new Hash<string, string>();
    for (const [k, v] of [
      ["3", "4"],
      ["ab", "1"],
      ["cd", "2"],
    ])
      expected.set(k, v);
    expect(rbEqual(new Hash(), h.toHash())).toBe(true);
    expect(rbEqual(expected, fh.toHash())).toBe(true);
  });

  it("values", () => {
    expect(h.values()).toEqual([]);
    expect(Headers.get("aB", "f", "1", "c").values()).toEqual(["f", "c"]);
  });

  it("values at", () => {
    expect(h.valuesAt()).toEqual([]);
    expect(h.valuesAt("1")).toEqual([undefined]);
    expect(h.valuesAt("1", "1")).toEqual([undefined, undefined]);
    expect(fh.valuesAt()).toEqual([]);
    expect(fh.valuesAt("AB")).toEqual(["1"]);
    expect(fh.valuesAt("CD", "Ab")).toEqual(["2", "1"]);
    expect(fh.valuesAt("CD", "32", "aB")).toEqual(["2", undefined, "1"]);
    expect(fh.valuesAt("3", "CD", "32", "ab")).toEqual(["4", "2", undefined, "1"]);
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
    expect(fh.flatten()).toEqual(["ab", "1", "cd", "2", "3", "4"]);
    fh.set("X", "56");
    expect(fh.flatten()).toEqual(["ab", "1", "cd", "2", "3", "4", "x", "56"]);
    expect(fh.flatten(2)).toEqual(["ab", "1", "cd", "2", "3", "4", "x", "56"]);
  });

  it("keep if", () => {
    expect(
      rbEqual(
        h,
        h.keepIf((_k, _v) => true),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        fh,
        fh.keepIf((_k, _v) => true),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        h,
        rbObjDup(fh).keepIf((_k, _v) => false),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ AB: "1" }),
        fh.keepIf((k, _v) => k === "ab"),
      ),
    ).toBe(true);
  });

  it("key", () => {
    expect(h.key("1")).toBeNull();
    expect(fh.key(1 as unknown as string)).toBeNull();
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
    expect(h.selectBang((_k, _v) => true)).toBeNull();
    expect(fh.selectBang((_k, _v) => true)).toBeNull();
    expect(
      rbEqual(
        h,
        rbObjDup(fh).selectBang((_k, _v) => false),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ AB: "1" }),
        fh.selectBang((k, _v) => k === "ab"),
      ),
    ).toBe(true);
  });

  it("compare by identity", () => {
    expect(() => fh.compareByIdentity()).toThrow(TypeError);
  });

  it("compare by identity?", () => {
    expect(fh.isCompareByIdentity()).toBe(false);
  });

  it("to h", () => {
    const expected = new Hash<string, string>();
    for (const [k, v] of [
      ["3", "4"],
      ["ab", "1"],
      ["cd", "2"],
    ])
      expected.set(k, v);
    expect(rbEqual(new Hash(), h.toH())).toBe(true);
    expect(rbEqual(expected, fh.toH())).toBe(true);
  });

  it("dig", () => {
    expect(fh.dig("AB")).toBe("1");
    expect(fh.dig("Cd")).toBe("2");
    expect(fh.dig("3")).toBe("4");
    expect(fh.dig("4")).toBeUndefined();

    expect(() => fh.dig("AB", 1)).toThrow(TypeError);
    expect(() => fh.dig("cd", 2)).toThrow(TypeError);
    expect(() => fh.dig("3", 3)).toThrow(TypeError);
    expect(fh.dig("4", 5)).toBeNull();
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
    expect(fh.compact() === fh).toBe(false);
    expect(rbEqual(fh, fh.compact())).toBe(true);
    const nil = null as unknown as string;
    expect(rbEqual(Headers.get({ Ab: 1 }), Headers.get({ aB: 1, cd: nil }).compact())).toBe(true);
  });

  it("compact!", () => {
    const fh0 = rbObjDup(fh);
    expect(fh.compactBang()).toBeNull();
    expect(rbEqual(fh0, fh)).toBe(true);

    h = Headers.get({ Ab: 1, cd: null });
    expect(rbEqual(Headers.get({ aB: 1 }), h.compactBang())).toBe(true);
    expect(rbEqual(Headers.get({ AB: 1 }), h)).toBe(true);
  });

  it("transform values", () => {
    const fh0 = fh.transformValues((v) => String(v).repeat(2));
    expect(fh.get("aB")).toBe("1");
    expect(rbEqual(Headers.get({ AB: "11", cD: "22", "3": "44" }), fh0)).toBe(true);
    expect(fh0.get("Ab")).toBe("11");
  });

  it("transform values!", () => {
    fh.transformValuesBang((v) => String(v).repeat(2));
    expect(fh.get("AB")).toBe("11");
    expect(rbEqual(Headers.get({ Ab: "11", CD: "22", "3": "44" }), fh)).toBe(true);
    expect(fh.get("aB")).toBe("11");
  });

  it("slice", () => {
    expect(rbEqual(Headers.get({ Ab: "1", cD: "2", "3": "4" }), fh.slice("aB", "Cd", "3"))).toBe(
      true,
    );
    expect(rbEqual(Headers.get({ AB: "1", CD: "2" }), fh.slice("Ab", "CD"))).toBe(true);
    expect(rbEqual(Headers.get(), fh.slice("ad"))).toBe(true);
    expect(fh.slice("AB", "cd").get("Ab")).toBe("1");
  });

  it("transform keys", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    const dh = rbObjDup(fh);
    const fh0 = fh.transformKeys((k) => map[k]);
    expect(rbEqual(dh, fh)).toBe(true);
    expect(fh0.get("xY")).toBe("1");
    expect(fh0.get("Dc")).toBe("2");
    expect(fh0.get("5")).toBe("4");
  });

  it("transform keys!", () => {
    const map: Record<string, string> = { ab: "Xy", cd: "dC", "3": "5" };
    const dh = rbObjDup(fh);
    fh.transformKeysBang((k) => map[k]);
    expect(rbEqual(dh, fh)).toBe(false);
    expect(fh.get("xY")).toBe("1");
    expect(fh.get("DC")).toBe("2");
    expect(fh.get("5")).toBe("4");
  });

  it("filter!", () => {
    expect(h.selectBang((_k, _v) => true)).toBeNull();
    expect(fh.selectBang((_k, _v) => true)).toBeNull();
    expect(
      rbEqual(
        h,
        rbObjDup(fh).selectBang((_k, _v) => false),
      ),
    ).toBe(true);
    expect(
      rbEqual(
        Headers.get({ AB: "1" }),
        fh.selectBang((k, _v) => k === "ab"),
      ),
    ).toBe(true);
  });

  it("deconstruct keys", () => {
    expect(rbEqual(fh.toHash(), fh.deconstructKeys([]))).toBe(true);
    expect(fh.deconstructKeys([]).constructor).toBe(Headers);
  });

  it("except", () => {
    fh = Headers.get("AB", "1", "Cd", "2", "3", "4");
    expect(rbEqual(fh, fh.except())).toBe(true);
    expect(rbEqual(Headers.get({ cD: "2", "3": "4" }), fh.except("AB", "5"))).toBe(true);
    expect(rbEqual(Headers.get({ AB: "1" }), fh.except("cD", "3"))).toBe(true);
  });
});
