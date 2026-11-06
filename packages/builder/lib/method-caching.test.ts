import { StandardError } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { XmlBase } from "./xmlbase.js";
import { XmlMarkup } from "./xmlmarkup.js";

describe("TestMethodCaching", () => {
  afterEach(() => {
    XmlBase.cacheMethodCalls = true;
  });

  it("caching does not break weird symbols", () => {
    const xml = new XmlMarkup();
    xml["work-order"](1);
    expect(xml.targetBang()).toBe("<work-order>1</work-order>");
  });

  it("method call caching", () => {
    const xml = new XmlMarkup();
    xml.cache_me();
    xml.methodMissing = () => {
      throw new StandardError("SHOULD NOT BE CALLED");
    };
    expect(() => xml.cache_me()).not.toThrow();
  });

  it("method call caching disabled", () => {
    XmlBase.cacheMethodCalls = false;
    const xml = new XmlMarkup();
    xml.do_not_cache_me();
    xml.methodMissing = () => {
      throw new StandardError("SHOULD BE CALLED");
    };
    expect(() => xml.do_not_cache_me()).toThrow(StandardError);
  });
});
