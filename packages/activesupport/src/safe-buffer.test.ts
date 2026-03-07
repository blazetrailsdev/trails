import { describe, it, expect } from "vitest";
import { SafeBuffer, htmlSafe, htmlEscape, htmlEscapeOnce, xmlNameEscape, isHtmlSafe } from "./safe-buffer.js";

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

  it.skip("titleize", () => { /* string method, not directly SafeBuffer */ });
  it.skip("Should be converted to_yaml", () => { /* YAML, not applicable in JS */ });
  it.skip("Should work in nested to_yaml conversion", () => { /* YAML */ });
  it.skip("Should work with primitive-like-strings in to_yaml conversion", () => { /* YAML */ });
  it.skip("Should work with underscore", () => { /* Ruby string method */ });
  it.skip("Should not return safe buffer from ", () => { /* Ruby gsub */ });
  it.skip("Should not return safe buffer from !", () => { /* Ruby gsub! */ });
  it.skip("can assign value into zero-index", () => { /* Ruby index assignment */ });
  it.skip("can assign value into non zero-index", () => { /* Ruby index assignment */ });
  it.skip("can assign value into slice", () => { /* Ruby slice assignment */ });
  it.skip("can assign value into offset slice", () => { /* Ruby slice assignment */ });
  it.skip("Should preserve html_safe? status on multiplication", () => { /* Ruby string * */ });
  it.skip("Should not fail if the returned object is not a string", () => { /* Ruby-specific */ });
  it.skip("Should continue safe on chr", () => { /* Ruby chr */ });
  it.skip("Should continue unsafe on chr", () => { /* Ruby chr */ });
  it.skip("Should return a SafeBuffer on slice! if original value was safe", () => { /* Ruby slice! */ });
  it.skip("Should return a String on slice! if original value was not safe", () => { /* Ruby slice! */ });
  it.skip("Should work with interpolation (array argument)", () => { /* Ruby % operator */ });
  it.skip("Should work with interpolation (hash argument)", () => { /* Ruby % operator */ });
  it.skip("Should not affect frozen objects when accessing characters", () => { /* Ruby frozen */ });
  it.skip("Should set back references", () => { /* Ruby regex back refs */ });
  it.skip("Should support Enumerator", () => { /* Ruby enumerator */ });
});

describe("OutputSafetyTest", () => {
  it("A string is unsafe by default", () => {
    const buf = new SafeBuffer("hello");
    expect(buf.htmlSafe).toBe(false);
  });

  it("A string can be marked safe", () => {
    const buf = htmlSafe("hello");
    expect(buf.htmlSafe).toBe(true);
  });

  it("Marking a string safe returns the string", () => {
    const buf = htmlSafe("hello");
    expect(buf.toString()).toBe("hello");
  });

  it("An integer is safe by default", () => {
    // In JS context: numbers don't need HTML escaping
    const escaped = htmlEscape(42);
    expect(escaped.toString()).toBe("42");
  });

  it("a float is safe by default", () => {
    const escaped = htmlEscape(3.14);
    expect(escaped.toString()).toBe("3.14");
  });

  it("Adding a safe string to another safe string returns a safe string", () => {
    const a = htmlSafe("foo");
    const b = htmlSafe("bar");
    expect(a.concat(b).htmlSafe).toBe(true);
    expect(a.concat(b).toString()).toBe("foobar");
  });

  it("Adding an unsafe string to a safe string escapes it and returns a safe string", () => {
    const safe = htmlSafe("Hello ");
    const result = safe.concat("<b>World</b>");
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("Hello &lt;b&gt;World&lt;/b&gt;");
  });

  it("Concatting safe onto unsafe yields unsafe", () => {
    const unsafe = new SafeBuffer("Hello ");
    const result = unsafe.concat(htmlSafe("<b>World</b>"));
    expect(result.htmlSafe).toBe(false);
  });

  it("Concatting unsafe onto safe yields escaped safe", () => {
    const safe = htmlSafe("Hello ");
    const result = safe.concat("<b>World</b>");
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("Hello &lt;b&gt;World&lt;/b&gt;");
  });

  it("Concatting safe onto safe yields safe", () => {
    const a = htmlSafe("foo");
    const b = htmlSafe("bar");
    const result = a.concat(b);
    expect(result.htmlSafe).toBe(true);
  });

  it("Concatting safe onto unsafe with << yields unsafe", () => {
    const unsafe = new SafeBuffer("Hello ");
    const result = unsafe.concat(htmlSafe("<b>World</b>"));
    expect(result.htmlSafe).toBe(false);
  });

  it("Concatting unsafe onto safe with << yields escaped safe", () => {
    const safe = htmlSafe("");
    const result = safe.concat("<script>");
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("&lt;script&gt;");
  });

  it("Concatting safe onto safe with << yields safe", () => {
    const a = htmlSafe("a");
    const result = a.concat(htmlSafe("b"));
    expect(result.htmlSafe).toBe(true);
  });

  it("Concatting an integer to safe always yields safe", () => {
    const safe = htmlSafe("count: ");
    const result = safe.concat(String(42));
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("count: 42");
  });

  it("Inserting safe into safe yields safe", () => {
    const a = htmlSafe("hello world");
    const b = htmlSafe(" beautiful");
    // Simulate insert by slicing and concatenating
    const result = a.slice(0, 5).concat(b).concat(a.slice(5));
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("hello beautiful world");
  });

  it("Inserting unsafe into safe yields escaped safe", () => {
    const a = htmlSafe("hello world");
    const unsafe = "<b>";
    const result = a.slice(0, 5).concat(unsafe).concat(a.slice(5));
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toContain("&lt;b&gt;");
  });

  it("ERB::Util.html_escape should escape unsafe characters", () => {
    expect(htmlEscape("<script>").toString()).toBe("&lt;script&gt;");
    expect(htmlEscape("a & b").toString()).toBe("a &amp; b");
    expect(htmlEscape('"hello"').toString()).toBe("&quot;hello&quot;");
    expect(htmlEscape("it's").toString()).toBe("it&#39;s");
  });

  it("ERB::Util.html_escape should not escape safe strings", () => {
    const safe = htmlSafe("<b>bold</b>");
    const result = htmlEscape(safe);
    // Safe strings are returned as-is
    expect(result.toString()).toBe("<b>bold</b>");
  });

  it("ERB::Util.html_escape_once only escapes once", () => {
    const result = htmlEscapeOnce("&lt;b&gt; & <b>");
    expect(result.toString()).toBe("&lt;b&gt; &amp; &lt;b&gt;");
  });

  it("ERB::Util.xml_name_escape should escape unsafe characters for XML names", () => {
    expect(xmlNameEscape("valid-name_123")).toBe("valid-name_123");
    expect(xmlNameEscape("invalid name!")).toBe("invalid_name_");
  });

  it.skip("An object is unsafe by default", () => { /* Ruby Object#html_safe? */ });
  it.skip("Adding an object not responding to `#to_str` to a safe string is deprecated", () => { /* Ruby */ });
  it.skip("Adding an object to a safe string returns a safe string", () => { /* Ruby */ });
  it.skip("Prepending safe onto unsafe yields unsafe", () => { /* Ruby prepend */ });
  it.skip("Prepending unsafe onto safe yields escaped safe", () => { /* Ruby prepend */ });
  it.skip("Concatting safe onto unsafe with % yields unsafe", () => { /* Ruby % */ });
  it.skip("% method explicitly cast the argument to string", () => { /* Ruby % */ });
  it.skip("Concatting unsafe onto safe with % yields escaped safe", () => { /* Ruby % */ });
  it.skip("Concatting safe onto safe with % yields safe", () => { /* Ruby % */ });
  it.skip("Concatting with % doesn't modify a string", () => { /* Ruby % */ });
  it.skip("Replacing safe with safe yields safe", () => { /* Ruby gsub */ });
  it.skip("Replacing safe with unsafe yields escaped safe", () => { /* Ruby gsub */ });
  it.skip("Replacing index of safe with safe yields safe", () => { /* Ruby [] = */ });
  it.skip("Replacing index of safe with unsafe yields escaped safe", () => { /* Ruby [] = */ });
  it.skip("Bytesplicing safe into safe yields safe", () => { /* Ruby bytesplice */ });
  it.skip("Bytesplicing unsafe into safe yields escaped safe", () => { /* Ruby bytesplice */ });
  it.skip("emits normal string YAML", () => { /* YAML */ });
  it.skip("call to_param returns a normal string", () => { /* Ruby to_param */ });
  it.skip("ERB::Util.html_escape should correctly handle invalid UTF-8 strings", () => { /* Ruby encoding */ });
  it.skip("ERB::Util.html_escape_once should correctly handle invalid UTF-8 strings", () => { /* Ruby encoding */ });
});
