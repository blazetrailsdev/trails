import { describe, expect, it } from "vitest";

import { deepMergeBang, deepSymbolizeKeys, except } from "./utils.js";

describe("I18nUtilsTest", () => {
  it(".deep_symbolize_keys", () => {
    const hash = { foo: { bar: { baz: "bar" } } };
    const expected = { foo: { bar: { baz: "bar" } } };
    expect(deepSymbolizeKeys(hash)).toEqual(expected);
  });

  it("#deep_symbolize_keys with numeric keys", () => {
    const hash = { 1: { 2: { 3: "bar" } } };
    const expected = { 1: { 2: { 3: "bar" } } };
    expect(deepSymbolizeKeys(hash)).toEqual(expected);
  });

  it("#except", () => {
    const hash = { foo: "bar", baz: "bar" };
    const expected = { foo: "bar" };
    expect(except(hash, "baz")).toEqual(expected);
  });

  it("#deep_merge!", () => {
    const hash = { foo: { bar: { baz: "bar" } }, baz: "bar" };
    deepMergeBang(hash, { foo: { bar: { baz: "foo" } } });

    const expected = { foo: { bar: { baz: "foo" } }, baz: "bar" };
    expect(hash).toEqual(expected);
  });
});
