import { describe, expect, it } from "vitest";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";
import { OutputBuffer, RawOutputBuffer, RawStreamingBuffer, StreamingBuffer } from "./buffers.js";

describe("OutputBuffer", () => {
  it("initializes from a string", () => {
    const buf = new OutputBuffer("hello");
    expect(buf.toStr()).toBe("hello");
    expect(buf.length).toBe(5);
  });

  it("initializes from a SafeBuffer", () => {
    const buf = new OutputBuffer(htmlSafe("<b>hi</b>"));
    expect(buf.toStr()).toBe("<b>hi</b>");
  });

  it("calls toString on values via concat (number example from Rails docs)", () => {
    const buf = new OutputBuffer("hello");
    buf.concat(5);
    expect(buf.toStr()).toBe("hello5");
  });

  it("escapes unsafe strings on concat", () => {
    const buf = new OutputBuffer();
    buf.concat("<script>");
    expect(buf.toStr()).toBe("&lt;script&gt;");
  });

  it("does not escape SafeBuffer values on concat", () => {
    const buf = new OutputBuffer();
    buf.concat(htmlSafe("<b>bold</b>"));
    expect(buf.toStr()).toBe("<b>bold</b>");
  });

  it("skips nil/undefined on concat", () => {
    const buf = new OutputBuffer("x");
    buf.concat(null);
    buf.concat(undefined);
    expect(buf.toStr()).toBe("x");
  });

  it("safeConcat bypasses escaping", () => {
    const buf = new OutputBuffer();
    buf.safeConcat("<b>unsafe</b>");
    expect(buf.toStr()).toBe("<b>unsafe</b>");
  });

  it("safeConcat throws on nil (Rails parity)", () => {
    expect(() => new OutputBuffer().safeConcat(null)).toThrow(TypeError);
    expect(() => new OutputBuffer().safeConcat(undefined)).toThrow(TypeError);
  });

  it("safeExprAppend skips nil and appends raw otherwise", () => {
    const buf = new OutputBuffer("x");
    buf.safeExprAppend(null);
    buf.safeExprAppend(undefined);
    expect(buf.toStr()).toBe("x");
    buf.safeExprAppend("<b>");
    expect(buf.toStr()).toBe("x<b>");
  });

  it("rawBuffer getter exposes underlying string", () => {
    const buf = new OutputBuffer("hello");
    expect(buf.rawBuffer).toBe("hello");
  });

  it("toString returns a SafeBuffer", () => {
    const buf = new OutputBuffer("hi");
    const s = buf.toString();
    expect(s).toBeInstanceOf(SafeBuffer);
    expect(s.htmlSafe).toBe(true);
    expect(s.toString()).toBe("hi");
  });

  it("isHtmlSafe always returns true", () => {
    expect(new OutputBuffer().isHtmlSafe()).toBe(true);
  });

  it("isEmpty/isBlank reflect underlying buffer", () => {
    expect(new OutputBuffer().isEmpty()).toBe(true);
    expect(new OutputBuffer("   ").isBlank()).toBe(true);
    expect(new OutputBuffer("x").isBlank()).toBe(false);
  });

  it("capture swaps the buffer and restores it", () => {
    const buf = new OutputBuffer("before-");
    const captured = buf.capture(() => {
      buf.concat("inside");
    });
    expect(captured.toString()).toBe("inside");
    expect(captured.htmlSafe).toBe(true);
    expect(buf.toStr()).toBe("before-");
  });

  it("capture restores the buffer when the callback throws", () => {
    const buf = new OutputBuffer("kept");
    expect(() =>
      buf.capture(() => {
        buf.concat("lost");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(buf.toStr()).toBe("kept");
  });

  it("equals compares raw contents and type", () => {
    expect(new OutputBuffer("a").equals(new OutputBuffer("a"))).toBe(true);
    expect(new OutputBuffer("a").equals(new OutputBuffer("b"))).toBe(false);
    expect(new OutputBuffer("a").equals("a")).toBe(false);
  });
});

describe("RawOutputBuffer", () => {
  it("appends to the wrapped buffer without escaping", () => {
    const buf = new OutputBuffer();
    const raw = buf.raw();
    expect(raw).toBeInstanceOf(RawOutputBuffer);
    raw.concat("<unsafe>");
    expect(buf.toStr()).toBe("<unsafe>");
  });

  it("skips nil values", () => {
    const buf = new OutputBuffer("x");
    buf.raw().concat(null);
    expect(buf.toStr()).toBe("x");
  });

  it("raw() returns self", () => {
    const raw = new OutputBuffer().raw();
    expect(raw.raw()).toBe(raw);
  });
});

describe("StreamingBuffer", () => {
  it("streams concat through the block, escaping unsafe values", () => {
    const chunks: string[] = [];
    const buf = new StreamingBuffer((v) => chunks.push(v));
    buf.concat("<unsafe>");
    buf.concat(htmlSafe("<safe>"));
    expect(chunks).toEqual(["&lt;unsafe&gt;", "<safe>"]);
  });

  it("safeConcat bypasses escaping", () => {
    const chunks: string[] = [];
    new StreamingBuffer((v) => chunks.push(v)).safeConcat("<x>");
    expect(chunks).toEqual(["<x>"]);
  });

  it("concat passes nil through as empty string (Rails parity)", () => {
    const chunks: string[] = [];
    new StreamingBuffer((v) => chunks.push(v)).concat(null);
    expect(chunks).toEqual([""]);
  });

  it("safeConcat passes nil through as empty string (Rails parity)", () => {
    const chunks: string[] = [];
    const buf = new StreamingBuffer((v) => chunks.push(v));
    buf.safeConcat(null);
    buf.safeConcat(undefined);
    expect(chunks).toEqual(["", ""]);
  });

  it("concat/safeConcat accept an OutputBuffer without throwing", () => {
    const chunks: string[] = [];
    const buf = new StreamingBuffer((v) => chunks.push(v));
    const ob = new OutputBuffer("<x>");
    buf.concat(ob);
    buf.safeConcat(ob);
    expect(chunks).toEqual(["<x>", "<x>"]);
  });

  it("capture swaps the sink and restores it", () => {
    const chunks: string[] = [];
    const buf = new StreamingBuffer((v) => chunks.push(v));
    const captured = buf.capture(() => buf.safeConcat("inside"));
    expect(captured).toBeInstanceOf(SafeBuffer);
    expect(captured.toString()).toBe("inside");
    expect(chunks).toEqual([]);
    buf.safeConcat("after");
    expect(chunks).toEqual(["after"]);
  });

  it("htmlSafe()/isHtmlSafe() report safe", () => {
    const buf = new StreamingBuffer(() => {});
    expect(buf.isHtmlSafe()).toBe(true);
    expect(buf.htmlSafe()).toBe(buf);
  });

  it("exposes block via reader", () => {
    const block = () => {};
    expect(new StreamingBuffer(block).block).toBe(block);
  });
});

describe("RawStreamingBuffer", () => {
  it("writes through without escaping", () => {
    const chunks: string[] = [];
    const buf = new StreamingBuffer((v) => chunks.push(v));
    const raw = buf.raw();
    expect(raw).toBeInstanceOf(RawStreamingBuffer);
    raw.concat("<unsafe>");
    expect(chunks).toEqual(["<unsafe>"]);
  });

  it("skips nil values", () => {
    const chunks: string[] = [];
    new StreamingBuffer((v) => chunks.push(v)).raw().concat(null);
    expect(chunks).toEqual([]);
  });

  it("raw() returns self", () => {
    const raw = new StreamingBuffer(() => {}).raw();
    expect(raw.raw()).toBe(raw);
  });
});
