import { describe, expect, it } from "vitest";
import { ParameterHash } from "./parameter-hash.js";

describe("Mail::ParameterHash", () => {
  it("should return the values in the hash", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ value1: "one", value2: "two" });
    expect([...hash.keys()]).toContain("value1");
    expect([...hash.keys()]).toContain("value2");
    expect([...hash.values()]).toContain("one");
    expect([...hash.values()]).toContain("two");
  });

  it("should return the values in the hash regardless of symbol or string", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ value1: "one", value2: "two" });
    expect(hash.get("value1")).toEqual("one");
    expect(hash.get("value2")).toEqual("two");
    expect(hash.get("value1")).toEqual("one");
    expect(hash.get("value2")).toEqual("two");
  });

  it("should return the values in the hash using case-insensitive key matching", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ value1: "one", VALUE2: "two" });
    expect(hash.get("VALUE1")).toEqual("one");
    expect(hash.get("vAlUe2")).toEqual("two");
    expect(hash.get("VaLuE1")).toEqual("one");
    expect(hash.get("value2")).toEqual("two");
  });

  it("should return the correct value if they are not encoded", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ value1: "one", value2: "two" });
    expect(hash.get("value1")).toEqual("one");
    expect(hash.get("value2")).toEqual("two");
  });

  it("should return a name list concatenated", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ "value*1": "one", "value*2": "two" });
    expect(hash.get("value")).toEqual("onetwo");
  });

  it("should return a name list concatenated and unencoded", () => {
    const hash = new ParameterHash();
    hash.mergeBang({
      "value*0*": "us-ascii'en'This%20is%20even%20more%20",
      "value*1*": "%2A%2A%2Afun%2A%2A%2A%20",
      "value*2": "isn't it",
    });
    expect(hash.get("value")).toEqual("This is even more ***fun*** isn't it");
  });

  it("allows for blank language", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ "value*": "us-ascii''Hello%20there" });
    expect(hash.get("value")).toEqual("Hello there");
  });

  it("allows for blank charset", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ "value*": "'en'Hello%20there" });
    expect(hash.get("value")).toEqual("Hello there");
  });

  it("allows for blank charset and language", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ "value*": "''Hello%20there" });
    expect(hash.get("value")).toEqual("Hello there");
  });

  it("converts from specified encoding to utf-8", () => {
    const hash = new ParameterHash();
    hash.mergeBang({ "value*": "iso-8859-1'en'H%EBll%F3%20there" });
    expect(hash.get("value")).toEqual("Hëlló there");
  });

  it("should allow us to add a value", () => {
    const hash = new ParameterHash();
    hash.set("value", "bob");
    expect(hash.get("value")).toEqual("bob");
  });

  it("should return an encoded value", () => {
    const hash = new ParameterHash();
    hash.mergeBang({
      "value*0*": "us-ascii'en'This%20is%20even%20more%20",
      "value*1*": "%2A%2A%2Afun%2A%2A%2A%20",
      "value*2": "isn't it",
    });
    expect(hash.encoded()).toEqual(
      "value*0*=us-ascii'en'This%20is%20even%20more%20;\r\n value*1*=%2A%2A%2Afun%2A%2A%2A%20;\r\n value*2=\"isn't it\"",
    );
  });
});
