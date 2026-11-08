import { Hash } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { deepMergeBang, deepSymbolizeKeys, except } from "./utils.js";

function h(...pairs: [unknown, unknown][]): Hash<unknown, unknown> {
  const hash = new Hash<unknown, unknown>();
  for (const [k, v] of pairs) hash.set(k, v);
  return hash;
}

describe("I18nUtilsTest", () => {
  it(".deep_symbolize_keys", () => {
    const hash = h(["foo", h(["bar", h(["baz", "bar"])])]);
    const expected = h([":foo", h([":bar", h([":baz", "bar"])])]);
    expect(deepSymbolizeKeys(hash)).toEqual(expected);
  });

  it("#deep_symbolize_keys with numeric keys", () => {
    const hash = h([1, h([2, h([3, "bar"])])]);
    const expected = h([1, h([2, h([3, "bar"])])]);
    expect(deepSymbolizeKeys(hash)).toEqual(expected);
  });

  it("#except", () => {
    const hash = h([":foo", "bar"], [":baz", "bar"]);
    const expected = h([":foo", "bar"]);
    expect(except(hash, ":baz")).toEqual(expected);
  });

  it("#deep_merge!", () => {
    const hash = h([":foo", h([":bar", h([":baz", "bar"])])], [":baz", "bar"]);
    deepMergeBang(hash, h([":foo", h([":bar", h([":baz", "foo"])])]));

    const expected = h([":foo", h([":bar", h([":baz", "foo"])])], [":baz", "bar"]);
    expect(hash).toEqual(expected);
  });
});
