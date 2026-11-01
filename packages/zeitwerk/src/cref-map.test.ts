import { beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Map } from "./cref/map.js";

describe("TestCrefMap", () => {
  let map: Map<unknown>;
  const m = {};
  const n = {};
  const crefMx = new Cref(m, "X");
  const crefMy = new Cref(m, "Y");
  const crefNx = new Cref(n, "X");
  const crefNy = new Cref(n, "Y");

  beforeEach(() => {
    map = new Map();
  });

  function initializeMap() {
    map.set(crefMx, "mx");
    map.set(crefMy, "my");
    map.set(crefNx, "nx");
    map.set(crefNy, "ny");
  }

  it("initially empty", () => {
    expect(map.isEmpty()).toBe(true);
  });

  it("[]= sets a value, [] reads it back", () => {
    initializeMap();

    expect(map.get(crefMx)).toBe("mx");
    expect(map.get(crefMy)).toBe("my");
    expect(map.get(crefNx)).toBe("nx");
    expect(map.get(crefNy)).toBe("ny");
  });

  it("[] returns nil if the value does not exist", () => {
    expect(map.get(crefMx)).toBeNull();
  });

  it("get_or_set returns the value if the key exists", () => {
    map.set(crefMx, "mx");

    expect(map.getOrSet(crefMx, () => "not-mx")).toBe("mx");
  });

  it("get_or_set sets the value if the key does not exist", () => {
    expect(map.getOrSet(crefMx, () => false)).toBe(false);
    expect(map.get(crefMx)).toBe(false);
  });

  it("delete removes and returns an existing value", () => {
    initializeMap();

    expect(map.delete(crefMx)).toBe("mx");
    expect(map.get(crefMx)).toBeNull();
    expect(map.delete(crefMy)).toBe("my");
    expect(map.get(crefMy)).toBeNull();
    expect(map.delete(crefNx)).toBe("nx");
    expect(map.get(crefNx)).toBeNull();
    expect(map.delete(crefNy)).toBe("ny");
    expect(map.get(crefNy)).toBeNull();

    expect(map.isEmpty()).toBe(true);
  });

  it("delete returns nil if the cref is not present", () => {
    map.set(crefMx, "mx");

    expect(map.delete(crefMy)).toBeNull();
    expect(map.delete(crefNx)).toBeNull();
  });

  it("delete_mod_cname removes and returns an existing value", () => {
    map.set(crefMx, "mx");

    expect(map.deleteModCname(m, "X")).toBe("mx");
    expect(map.isEmpty()).toBe(true);
  });

  it("delete_mod_cname returns nil if the cref is not present", () => {
    expect(map.deleteModCname(m, "X")).toBeNull();
  });

  it("delete_by_value removes all cnames with the given value", () => {
    map.set(crefMx, 0);
    map.set(crefMy, 1);
    map.set(crefNx, 0);
    map.set(crefNy, 1);

    map.deleteByValue(0);

    expect(map.get(crefMx)).toBeNull();
    expect(map.get(crefMy)).toBe(1);
    expect(map.get(crefNx)).toBeNull();
    expect(map.get(crefNy)).toBe(1);
  });

  it("each_key does not yield if the map is empty", () => {
    let yielded = false;
    map.eachKey(() => {
      yielded = true;
    });
    expect(yielded).toBe(false);
  });

  it("each_key yields all keys in an undefined order", () => {
    initializeMap();

    const keys: [object, string][] = [];
    map.eachKey((key) => keys.push([key.mod, key.cname]));

    expect(keys).toHaveLength(4);

    expect(keys.some(([k, c]) => k === m && c === "X")).toBe(true);
    expect(keys.some(([k, c]) => k === m && c === "Y")).toBe(true);
    expect(keys.some(([k, c]) => k === n && c === "X")).toBe(true);
    expect(keys.some(([k, c]) => k === n && c === "Y")).toBe(true);
  });

  it("clear empties the map", () => {
    initializeMap();

    map.clear();
    expect(map.isEmpty()).toBe(true);
  });

  it("the map is robust to hash overrides", () => {
    const hash = (_: unknown) => null;
    const mm = { hash };
    const nn = { hash };

    const map = new Map<number>();
    const crefM = new Cref(mm, "X");
    const crefN = new Cref(nn, "X");

    map.set(crefM, 0);
    map.set(crefN, 1);

    expect(map.get(crefM)).toBe(0);
    expect(map.get(crefN)).toBe(1);
  });
});
