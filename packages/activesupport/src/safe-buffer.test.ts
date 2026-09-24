import { beforeEach, describe, it, expect } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { titleize, underscore } from "./inflector.js";
import { SafeBuffer, htmlSafe, isHtmlSafe } from "./core-ext/string/output-safety.js";
import { htmlEscape } from "./core-ext/tse/util.js";
import {
  assert,
  assertNot,
  assertNotPredicate,
  assertPredicate,
  assertRaise,
  assertNotNil,
} from "./testing/assertions.js";

describe("SafeBufferTest", () => {
  let buffer: SafeBuffer;

  beforeEach(() => {
    buffer = new SafeBuffer();
  });

  it("titleize", () => {
    expect(titleize(htmlSafe("foo").toStr())).toEqual("Foo");
  });

  it("Should look like a string", () => {
    assert(typeof buffer.toStr() === "string");
    expect(buffer.toString()).toEqual("");
  });

  it("Should escape a raw string which is passed to them", () => {
    buffer.concat("<script>");
    expect(buffer.toString()).toEqual("&lt;script&gt;");
  });

  it("Should NOT escape a safe value passed to it", () => {
    buffer.concat(htmlSafe("<script>"));
    buffer.concat(htmlSafe("hello &amp; goodbye"));
    expect(buffer.toString()).toEqual("<script>hello &amp; goodbye");
  });

  it("Should not mess with an innocuous string", () => {
    buffer.concat("Hello");
    expect(buffer.toString()).toEqual("Hello");
  });

  it("Should not mess with a previously escape test", () => {
    buffer.concat(htmlEscape("<script>"));
    expect(buffer.toString()).toEqual("&lt;script&gt;");
  });

  it("Should be considered safe", () => {
    assertPredicate(buffer, isHtmlSafe);
  });

  it("Should return a safe buffer when calling to_s", () => {
    const newBuffer = buffer.toS();
    expect(newBuffer.constructor).toEqual(SafeBuffer);
  });

  it.skip("Should be converted to_yaml");
  it.skip("Should work in nested to_yaml conversion");
  it.skip("Should work with primitive-like-strings in to_yaml conversion");

  it("Should work with underscore", () => {
    const str = underscore(htmlSafe("MyTest").toStr());
    expect(str).toEqual("my_test");
  });

  it("can assign value into zero-index", () => {
    const buffer = new SafeBuffer("012345");

    buffer.set(0, "<");

    expect(buffer.toString()).toEqual("&lt;12345");
  });

  it("can assign value into non zero-index", () => {
    const buffer = new SafeBuffer("012345");

    buffer.set(2, "<");

    expect(buffer.toString()).toEqual("01&lt;345");
  });

  it("can assign value into slice", () => {
    const buffer = new SafeBuffer("012345");

    buffer.set(0, 3, "<");

    expect(buffer.toString()).toEqual("&lt;345");
  });

  it("can assign value into offset slice", () => {
    const buffer = new SafeBuffer("012345");

    buffer.set(1, 3, "<");

    expect(buffer.toString()).toEqual("0&lt;45");
  });

  it("Should escape dirty buffers on add", () => {
    const clean = htmlSafe("hello");
    buffer = new SafeBuffer("<>", false);
    expect(clean.plus(buffer).toString()).toEqual("hello&lt;&gt;");
  });

  it("Should preserve html_safe? status on multiplication", () => {
    const multipliedSafeBuffer = htmlSafe("<br />").repeat(2);
    assertPredicate(multipliedSafeBuffer, isHtmlSafe);

    const multipliedUnsafeBuffer = new SafeBuffer("<>", false).repeat(2);
    assertNotPredicate(multipliedUnsafeBuffer, isHtmlSafe);
  });

  it("Should concat as a normal string when safe", () => {
    const clean = htmlSafe("hello");
    buffer = new SafeBuffer("<>", false);
    expect(buffer.plus(clean).toString()).toEqual("<>hello");
  });

  it("Should preserve html_safe? status on copy", () => {
    buffer = new SafeBuffer("<>", false);
    assertNotPredicate(buffer.dup(), isHtmlSafe);
  });

  it("Can call html_safe on a safe buffer", () => {
    buffer = htmlSafe("hello");
    const extraSafe = buffer.htmlSafeBuffer();
    expect(extraSafe.toString()).toEqual("hello");
    assertPredicate(extraSafe, isHtmlSafe);
  });

  it("Should return safe buffer when added with another safe buffer", () => {
    const clean = htmlSafe("<script>");
    const resultBuffer = buffer.plus(clean);
    assertPredicate(resultBuffer, isHtmlSafe);
    expect(resultBuffer.toString()).toEqual("<script>");
  });

  it("Should raise an error when safe_concat is called on unsafe buffers", async () => {
    buffer = new SafeBuffer("<>", false);
    await assertRaise([SafeBuffer.SafeConcatError], {}, () => buffer.safeConcat("BUSTED"));
  });

  it("Should not fail if the returned object is not a string", () => {
    expect(buffer.slice("chipchop")).toBeNull();
  });

  it("Should be safe when sliced if original value was safe", () => {
    const newBuffer = buffer.get(0, 0);
    assertNotNil(newBuffer);
    assertPredicate(newBuffer, isHtmlSafe, "should be safe");
  });

  it("Should continue unsafe on slice", () => {
    const safeString = new SafeBuffer('<script>alert("lolpwnd");</script>oo', false);

    assertNot(isHtmlSafe(safeString), "should not be safe");

    assertNot(isHtmlSafe(safeString.get(new Range(0, -1))), "should not be safe");
    assertNot(isHtmlSafe(safeString.slice(new Range(0, -1))), "should not be safe");
    assertNot(isHtmlSafe(safeString.sliceBang(new Range(0, -1))), "should not be safe");
    assertNot(isHtmlSafe(safeString), "should not be safe");
  });

  it("Should continue safe on slice", () => {
    const safeString = htmlSafe("<div>foo</div>");

    assertPredicate(safeString, isHtmlSafe);

    assertPredicate(safeString.get(new Range(0, -1)), isHtmlSafe);
    assertPredicate(safeString.slice(new Range(0, -1)), isHtmlSafe);
    assertPredicate(safeString.sliceBang(new Range(0, 1, true)), isHtmlSafe);

    assertPredicate(safeString, isHtmlSafe);
  });

  it("Should continue safe on chr", () => {
    const safeString = htmlSafe("<div>foo</div>");

    assertPredicate(safeString, isHtmlSafe);
    assertPredicate(safeString.chr(), isHtmlSafe);
  });

  it("Should continue unsafe on chr", () => {
    const safeString = "<div>foo</div>";

    assertNot(isHtmlSafe(safeString), "should not be safe");
    assertNot(isHtmlSafe(safeString.charAt(0)), "should not be safe");
  });

  it("Should return a SafeBuffer on slice! if original value was safe", () => {
    const safeString = htmlSafe("<div>foo</div>");

    assert(safeString.sliceBang(new Range(0, 1, true)) instanceof SafeBuffer);
  });

  it("Should return a String on slice! if original value was not safe", () => {
    const unsafeString = new SafeBuffer('<script>alert("XSS");</script>', false);

    const slicedString = unsafeString.sliceBang(new Range(0, 1, true));
    assertNot(slicedString instanceof SafeBuffer);
    assert(typeof slicedString === "string");
  });

  it("Should work with interpolation (array argument)", () => {
    const x = htmlSafe("foo %s bar").format(["qux"]);
    expect(x.toString()).toEqual("foo qux bar");
  });

  it("Should work with interpolation (hash argument)", () => {
    const x = htmlSafe("foo %{x} bar").format({ x: "qux" });
    expect(x.toString()).toEqual("foo qux bar");
  });

  it("Should escape unsafe interpolated args", () => {
    const x = htmlSafe("foo %{x} bar").format({ x: "<br/>" });
    expect(x.toString()).toEqual("foo &lt;br/&gt; bar");
  });

  it("Should not escape safe interpolated args", () => {
    const x = htmlSafe("foo %{x} bar").format({ x: htmlSafe("<br/>") });
    expect(x.toString()).toEqual("foo <br/> bar");
  });

  it("Should interpolate to a safe string", () => {
    const x = htmlSafe("foo %{x} bar").format({ x: "qux" });
    assertPredicate(x, isHtmlSafe, "should be safe");
  });

  it("Should not affect frozen objects when accessing characters", () => {
    const x = htmlSafe("Hello");
    expect(x.get(/a/, 1)).toBeNull();
  });

  it.skip("Should set back references");
  it.skip("Should support Enumerator");
});
