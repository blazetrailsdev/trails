import { describe, it, expect } from "vitest";
import { titleize, underscore } from "./inflector.js";
import { SafeBuffer, htmlSafe, htmlEscape, isHtmlSafe } from "./safe-buffer.js";

describe("SafeBufferTest", () => {
  it("Should look like a string", () => {
    const buf = htmlSafe("hello");
    expect(buf.toString()).toBe("hello");
    expect(String(buf)).toBe("hello");
  });

  it("Should escape a raw string which is passed to them", () => {
    const safe = htmlSafe("");
    const result = safe.concat("<script>alert('xss')</script>");
    expect(result.toString()).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(result.htmlSafe).toBe(true);
  });

  it("Should NOT escape a safe value passed to it", () => {
    const safe = htmlSafe("Hello ");
    const alsoSafe = htmlSafe("<b>World</b>");
    const result = safe.concat(alsoSafe);
    expect(result.toString()).toBe("Hello <b>World</b>");
    expect(result.htmlSafe).toBe(true);
  });

  it("Should not mess with an innocuous string", () => {
    const safe = htmlSafe("hello world");
    expect(safe.toString()).toBe("hello world");
  });

  it("Should not mess with a previously escape test", () => {
    const escaped = htmlEscape("<b>bold</b>");
    const safe = htmlSafe("");
    const result = safe.concat(escaped);
    expect(result.toString()).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("Should be considered safe", () => {
    const buf = htmlSafe("test");
    expect(buf.htmlSafe).toBe(true);
    expect(isHtmlSafe(buf)).toBe(true);
  });

  it("Should return a safe buffer when calling to_s", () => {
    const buf = htmlSafe("test");
    expect(buf.toString()).toBe("test");
  });

  it("Should escape dirty buffers on add", () => {
    const safe = htmlSafe("prefix: ");
    const unsafe = new SafeBuffer("<danger>", false);
    const result = safe.concat(unsafe);
    expect(result.toString()).toContain("&lt;danger&gt;");
    expect(result.htmlSafe).toBe(true);
  });

  it("Should concat as a normal string when safe", () => {
    const a = htmlSafe("hello ");
    const b = htmlSafe("world");
    const result = a.concat(b);
    expect(result.toString()).toBe("hello world");
  });

  it("Should preserve html_safe? status on copy", () => {
    const buf = htmlSafe("test");
    expect(buf.htmlSafe).toBe(true);
  });

  it("Can call html_safe on a safe buffer", () => {
    const buf = htmlSafe("test");
    const again = buf.htmlSafeBuffer();
    expect(again.htmlSafe).toBe(true);
    expect(again.toString()).toBe("test");
  });

  it("Should return safe buffer when added with another safe buffer", () => {
    const a = htmlSafe("foo");
    const b = htmlSafe("bar");
    const result = a.concat(b);
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("foobar");
  });

  it("Should raise an error when safe_concat is called on unsafe buffers", () => {
    const unsafe = new SafeBuffer("test", false);
    expect(() => unsafe.safeConcat("more")).toThrow();
  });

  it("Should be safe when sliced if original value was safe", () => {
    const buf = htmlSafe("hello world");
    const sliced = buf.slice(0, 5);
    expect(sliced.htmlSafe).toBe(true);
    expect(sliced.toString()).toBe("hello");
  });

  it("Should continue unsafe on slice", () => {
    const buf = new SafeBuffer("hello world", false);
    const sliced = buf.slice(0, 5);
    expect(sliced.htmlSafe).toBe(false);
  });

  it("Should continue safe on slice", () => {
    const buf = htmlSafe("hello world");
    const sliced = buf.slice(6);
    expect(sliced.htmlSafe).toBe(true);
    expect(sliced.toString()).toBe("world");
  });

  it("Should escape unsafe interpolated args", () => {
    const safe = htmlSafe("Hello, ");
    const result = safe.concat("<b>World</b>");
    expect(result.toString()).toBe("Hello, &lt;b&gt;World&lt;/b&gt;");
  });

  it("Should not escape safe interpolated args", () => {
    const safe = htmlSafe("Hello, ");
    const result = safe.concat(htmlSafe("<b>World</b>"));
    expect(result.toString()).toBe("Hello, <b>World</b>");
  });

  it("Should interpolate to a safe string", () => {
    const safe = htmlSafe("prefix");
    const result = safe.concat(htmlSafe(" suffix"));
    expect(result.htmlSafe).toBe(true);
  });

  it("titleize", () => {
    const buf = htmlSafe("foo");
    expect(titleize(buf.toString())).toBe("Foo");
  });

  it.skip("Should be converted to_yaml");
  it.skip("Should work in nested to_yaml conversion");
  it.skip("Should work with primitive-like-strings in to_yaml conversion");

  it("Should work with underscore", () => {
    const buf = htmlSafe("MyTest");
    expect(underscore(buf.toString())).toBe("my_test");
  });

  it.skip("Should not return safe buffer from ");
  it.skip("Should not return safe buffer from !");

  it("can assign value into zero-index", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(0, "<");
    expect(buffer.toString()).toBe("&lt;12345");
  });

  it("can assign value into non zero-index", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(2, "<");
    expect(buffer.toString()).toBe("01&lt;345");
  });

  it("can assign value into slice", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(0, "<", 3);
    expect(buffer.toString()).toBe("&lt;345");
  });

  it("can assign value into offset slice", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(1, "<", 3);
    expect(buffer.toString()).toBe("0&lt;45");
  });

  it("Should preserve html_safe? status on multiplication", () => {
    const safe = htmlSafe("<br />");
    const repeated = safe.repeat(2);
    expect(repeated.htmlSafe).toBe(true);
    expect(repeated.toString()).toBe("<br /><br />");

    const unsafe = new SafeBuffer("<>", false);
    const repeatedUnsafe = unsafe.repeat(2);
    expect(repeatedUnsafe.htmlSafe).toBe(false);
  });

  it("Should not fail if the returned object is not a string", () => {
    const buf = htmlSafe("");
    const result = buf.slice(0, 0);
    expect(result).toBeDefined();
  });

  it("Should continue safe on chr", () => {
    const safe = htmlSafe("<div>foo</div>");
    expect(safe.htmlSafe).toBe(true);
    expect(safe.chr().htmlSafe).toBe(true);
  });

  it("Should continue unsafe on chr", () => {
    const unsafe = new SafeBuffer("<div>foo</div>", false);
    expect(unsafe.htmlSafe).toBe(false);
    expect(unsafe.chr().htmlSafe).toBe(false);
  });

  it("Should return a SafeBuffer on slice! if original value was safe", () => {
    const safe = htmlSafe("<div>foo</div>");
    const sliced = safe.slice(0, 1);
    expect(sliced instanceof SafeBuffer).toBe(true);
  });

  it("Should return a String on slice! if original value was not safe", () => {
    const unsafe = new SafeBuffer('<script>alert("XSS");</script>', false);
    const sliced = unsafe.slice(0, 1);
    expect(sliced instanceof SafeBuffer).toBe(true);
    expect(sliced.htmlSafe).toBe(false);
  });

  it("Should work with interpolation (array argument)", () => {
    const buf = htmlSafe("foo %s bar");
    const result = buf.format(["qux"]);
    expect(result.toString()).toBe("foo qux bar");
  });

  it("Should work with interpolation (hash argument)", () => {
    const buf = htmlSafe("foo %{x} bar");
    const result = buf.format({ x: "qux" });
    expect(result.toString()).toBe("foo qux bar");
  });

  it("Should not affect frozen objects when accessing characters", () => {
    const x = htmlSafe("Hello");
    expect(x.slice(0, 1).toString()).toBe("H");
  });

  it.skip("Should set back references");
  it.skip("Should support Enumerator");
});
describe("SafeBufferTest", () => {
  it("titleize", () => {
    expect(titleize("hello world")).toBe("Hello World");
    expect(titleize("foo_bar")).toBe("Foo Bar");
  });

  it("Should look like a string", () => {
    const buf = htmlSafe("hello");
    expect(buf.toString()).toBe("hello");
    expect(String(buf)).toBe("hello");
  });

  it("Should escape a raw string which is passed to them", () => {
    const buf = htmlSafe("");
    const result = buf.concat("<script>");
    expect(result.toString()).toContain("&lt;");
  });

  it("Should NOT escape a safe value passed to it", () => {
    const safe = htmlSafe("<b>bold</b>");
    const buf = htmlSafe("");
    const result = buf.concat(safe);
    expect(result.toString()).toContain("<b>bold</b>");
  });

  it("Should not mess with an innocuous string", () => {
    const buf = htmlSafe("hello world");
    expect(buf.toString()).toBe("hello world");
  });

  it("Should not mess with a previously escape test", () => {
    const buf = htmlSafe("&lt;script&gt;");
    expect(buf.toString()).toBe("&lt;script&gt;");
  });

  it("Should be considered safe", () => {
    const buf = htmlSafe("safe");
    expect(isHtmlSafe(buf)).toBe(true);
  });

  it("Should return a safe buffer when calling to_s", () => {
    const buf = htmlSafe("hello");
    expect(buf.toString()).toBe("hello");
    expect(isHtmlSafe(buf)).toBe(true);
  });

  it.skip("Should be converted to_yaml");
  it.skip("Should work in nested to_yaml conversion");
  it.skip("Should work with primitive-like-strings in to_yaml conversion");

  it("Should work with underscore", () => {
    const buf = htmlSafe("MyTest");
    expect(underscore(buf.toString())).toBe("my_test");
  });

  it.skip("Should not return safe buffer from ");
  it.skip("Should not return safe buffer from !");

  it("can assign value into zero-index", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(0, "<");
    expect(buffer.toString()).toBe("&lt;12345");
  });

  it("can assign value into non zero-index", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(2, "<");
    expect(buffer.toString()).toBe("01&lt;345");
  });

  it("can assign value into slice", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(0, "<", 3);
    expect(buffer.toString()).toBe("&lt;345");
  });

  it("can assign value into offset slice", () => {
    const buffer = new SafeBuffer("012345", true);
    buffer.set(1, "<", 3);
    expect(buffer.toString()).toBe("0&lt;45");
  });

  it("Should escape dirty buffers on add", () => {
    const safe = htmlSafe("safe part ");
    const result = safe.concat("<unsafe>");
    expect(result.toString()).toContain("&lt;unsafe&gt;");
  });

  it("Should preserve html_safe? status on multiplication", () => {
    const safe = htmlSafe("<br />");
    const repeated = safe.repeat(2);
    expect(repeated.htmlSafe).toBe(true);
  });

  it("Should concat as a normal string when safe", () => {
    const buf = htmlSafe("hello ");
    const safe = htmlSafe("world");
    const result = buf.concat(safe);
    expect(result.toString()).toBe("hello world");
  });

  it("Should preserve html_safe? status on copy", () => {
    const buf = htmlSafe("test");
    expect(isHtmlSafe(buf)).toBe(true);
  });

  it("Can call html_safe on a safe buffer", () => {
    const buf = htmlSafe("already safe");
    expect(isHtmlSafe(buf)).toBe(true);
  });

  it("Should return safe buffer when added with another safe buffer", () => {
    const a = htmlSafe("hello ");
    const b = htmlSafe("world");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("hello world");
  });

  it("Should raise an error when safe_concat is called on unsafe buffers", () => {
    const buf = new SafeBuffer("not safe"); // unsafe by default
    expect(() => buf.safeConcat("<unsafe>")).toThrow();
  });

  it("Should not fail if the returned object is not a string", () => {
    const buf = htmlSafe("");
    const result = buf.slice(0, 0);
    expect(result).toBeDefined();
  });

  it("Should be safe when sliced if original value was safe", () => {
    const buf = htmlSafe("hello world");
    const sliced = buf.slice(0, 5);
    expect(sliced.toString()).toBe("hello");
    expect(isHtmlSafe(sliced)).toBe(true);
  });

  it("Should continue unsafe on slice", () => {
    const buf = new SafeBuffer("abcdef"); // unsafe
    const sliced = buf.slice(2, 4);
    expect(sliced.toString()).toBe("cd");
  });

  it("Should continue safe on slice", () => {
    const buf = htmlSafe("hello");
    const sliced = buf.slice(0, 3);
    expect(isHtmlSafe(sliced)).toBe(true);
  });

  it("Should continue safe on chr", () => {
    const safe = htmlSafe("<div>foo</div>");
    expect(safe.chr().htmlSafe).toBe(true);
  });

  it("Should continue unsafe on chr", () => {
    const unsafe = new SafeBuffer("<div>foo</div>", false);
    expect(unsafe.chr().htmlSafe).toBe(false);
  });

  it("Should return a SafeBuffer on slice! if original value was safe", () => {
    const safe = htmlSafe("<div>foo</div>");
    const sliced = safe.slice(0, 1);
    expect(sliced instanceof SafeBuffer).toBe(true);
  });

  it("Should return a String on slice! if original value was not safe", () => {
    const unsafe = new SafeBuffer('<script>alert("XSS");</script>', false);
    const sliced = unsafe.slice(0, 1);
    expect(sliced instanceof SafeBuffer).toBe(true);
    expect(sliced.htmlSafe).toBe(false);
  });

  it("Should work with interpolation (array argument)", () => {
    const buf = htmlSafe("foo %s bar");
    const result = buf.format(["qux"]);
    expect(result.toString()).toBe("foo qux bar");
  });

  it("Should work with interpolation (hash argument)", () => {
    const buf = htmlSafe("foo %{x} bar");
    const result = buf.format({ x: "qux" });
    expect(result.toString()).toBe("foo qux bar");
  });

  it("Should escape unsafe interpolated args", () => {
    const unsafe = "<script>alert(1)</script>";
    const escaped = htmlEscape(unsafe);
    expect(escaped.toString()).not.toContain("<script>");
  });

  it("Should not escape safe interpolated args", () => {
    const safe = htmlSafe("<b>bold</b>");
    expect(safe.toString()).toBe("<b>bold</b>");
  });

  it("Should interpolate to a safe string", () => {
    const result = htmlEscape("hello");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Should not affect frozen objects when accessing characters", () => {
    const x = htmlSafe("Hello");
    expect(x.slice(0, 1).toString()).toBe("H");
  });

  it.skip("Should set back references");
  it.skip("Should support Enumerator");
});
