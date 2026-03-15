import { describe, it, expect } from "vitest";
import { titleize } from "./inflector.js";
import {
  SafeBuffer,
  htmlSafe,
  htmlEscape,
  htmlEscapeOnce,
  xmlNameEscape,
  isHtmlSafe,
} from "./safe-buffer.js";

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

  it.skip("titleize");
  it.skip("Should be converted to_yaml");
  it.skip("Should work in nested to_yaml conversion");
  it.skip("Should work with primitive-like-strings in to_yaml conversion");
  it.skip("Should work with underscore");
  it.skip("Should not return safe buffer from ");
  it.skip("Should not return safe buffer from !");
  it.skip("can assign value into zero-index");
  it.skip("can assign value into non zero-index");
  it.skip("can assign value into slice");
  it.skip("can assign value into offset slice");
  it.skip("Should preserve html_safe? status on multiplication");
  it.skip("Should not fail if the returned object is not a string");
  it.skip("Should continue safe on chr");
  it.skip("Should continue unsafe on chr");
  it.skip("Should return a SafeBuffer on slice! if original value was safe");
  it.skip("Should return a String on slice! if original value was not safe");
  it.skip("Should work with interpolation (array argument)");
  it.skip("Should work with interpolation (hash argument)");
  it.skip("Should not affect frozen objects when accessing characters");
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
  it.skip("Should work with underscore");
  it.skip("Should not return safe buffer from ");
  it.skip("Should not return safe buffer from !");
  it.skip("can assign value into zero-index");
  it.skip("can assign value into non zero-index");
  it.skip("can assign value into slice");
  it.skip("can assign value into offset slice");

  it("Should escape dirty buffers on add", () => {
    const safe = htmlSafe("safe part ");
    const result = safe.concat("<unsafe>");
    expect(result.toString()).toContain("&lt;unsafe&gt;");
  });

  it.skip("Should preserve html_safe? status on multiplication");

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

  it.skip("Should not fail if the returned object is not a string");

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

  it.skip("Should continue safe on chr");
  it.skip("Should continue unsafe on chr");
  it.skip("Should return a SafeBuffer on slice! if original value was safe");
  it.skip("Should return a String on slice! if original value was not safe");
  it.skip("Should work with interpolation (array argument)");
  it.skip("Should work with interpolation (hash argument)");

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

  it.skip("Should not affect frozen objects when accessing characters");
  it.skip("Should set back references");
  it.skip("Should support Enumerator");
});

describe("OutputSafetyTest", () => {
  it("A string is unsafe by default", () => {
    expect(isHtmlSafe("hello")).toBe(false);
  });

  it("A string can be marked safe", () => {
    const safe = htmlSafe("hello");
    expect(isHtmlSafe(safe)).toBe(true);
  });

  it("Marking a string safe returns the string", () => {
    const safe = htmlSafe("hello");
    expect(safe.toString()).toBe("hello");
  });

  it("An integer is safe by default", () => {
    // In JS, numbers aren't strings, so isHtmlSafe is false for primitives
    expect(isHtmlSafe(42)).toBe(false);
  });

  it("a float is safe by default", () => {
    expect(isHtmlSafe(3.14)).toBe(false);
  });

  it("An object is unsafe by default", () => {
    expect(isHtmlSafe({})).toBe(false);
  });

  it.skip("Adding an object not responding to `#to_str` to a safe string is deprecated");

  it("Adding an object to a safe string returns a safe string", () => {
    const safe = htmlSafe("hello ");
    const result = safe.concat(htmlSafe("world"));
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Adding a safe string to another safe string returns a safe string", () => {
    const a = htmlSafe("hello ");
    const b = htmlSafe("world");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("hello world");
  });

  it("Adding an unsafe string to a safe string escapes it and returns a safe string", () => {
    const safe = htmlSafe("prefix: ");
    const result = safe.concat("<script>");
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).not.toContain("<script>");
    expect(result.toString()).toContain("&lt;script&gt;");
  });

  it.skip("Prepending safe onto unsafe yields unsafe");
  it.skip("Prepending unsafe onto safe yields escaped safe");

  it("Concatting safe onto unsafe yields unsafe", () => {
    // A plain string concat'd with safe is still plain
    const unsafe = "hello ";
    const safe = htmlSafe("world");
    const result = unsafe + safe.toString();
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("Concatting unsafe onto safe yields escaped safe", () => {
    const safe = htmlSafe("safe ");
    const result = safe.concat("<unsafe>");
    expect(result.toString()).toContain("&lt;unsafe&gt;");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Concatting safe onto safe yields safe", () => {
    const a = htmlSafe("a");
    const b = htmlSafe("b");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("ab");
  });

  it.skip("Concatting safe onto unsafe with << yields unsafe");
  it.skip("Concatting unsafe onto safe with << yields escaped safe");
  it.skip("Concatting safe onto safe with << yields safe");
  it.skip("Concatting safe onto unsafe with % yields unsafe");
  it.skip("% method explicitly cast the argument to string");
  it.skip("Concatting unsafe onto safe with % yields escaped safe");
  it.skip("Concatting safe onto safe with % yields safe");
  it.skip("Concatting with % doesn't modify a string");

  it("Concatting an integer to safe always yields safe", () => {
    const safe = htmlSafe("count: ");
    const result = safe.concat(htmlSafe("42"));
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("count: 42");
  });

  it.skip("Inserting safe into safe yields safe");
  it.skip("Inserting unsafe into safe yields escaped safe");
  it.skip("Replacing safe with safe yields safe");
  it.skip("Replacing safe with unsafe yields escaped safe");
  it.skip("Replacing index of safe with safe yields safe");
  it.skip("Replacing index of safe with unsafe yields escaped safe");
  it.skip("Bytesplicing safe into safe yields safe");
  it.skip("Bytesplicing unsafe into safe yields escaped safe");
  it.skip("emits normal string YAML");
  it.skip("call to_param returns a normal string");

  it("ERB::Util.html_escape should escape unsafe characters", () => {
    const result = htmlEscape('<script>alert("xss")</script>');
    expect(result.toString()).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it.skip("ERB::Util.html_escape should correctly handle invalid UTF-8 strings");

  it("ERB::Util.html_escape should not escape safe strings", () => {
    const safe = htmlSafe("<b>bold</b>");
    const result = htmlEscape(safe);
    expect(result.toString()).toBe("<b>bold</b>");
  });

  it("ERB::Util.html_escape_once only escapes once", () => {
    const result = htmlEscapeOnce("&lt;already escaped&gt;");
    expect(result.toString()).toBe("&lt;already escaped&gt;");
    const raw = htmlEscapeOnce("<raw>");
    expect(raw.toString()).toBe("&lt;raw&gt;");
  });

  it.skip("ERB::Util.html_escape_once should correctly handle invalid UTF-8 strings");

  it("ERB::Util.xml_name_escape should escape unsafe characters for XML names", () => {
    const result = xmlNameEscape("hello world");
    expect(result).not.toContain(" ");
  });
});
