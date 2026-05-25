import { describe, it, expect, beforeEach } from "vitest";
import { isHtmlSafe, htmlSafe } from "@blazetrails/activesupport";
import { TseRenderContextImpl } from "./render-context.js";
import { OutputBuffer } from "./buffers.js";

describe("TseRenderContextImpl", () => {
  let ctx: TseRenderContextImpl;

  beforeEach(() => {
    ctx = new TseRenderContextImpl();
  });

  describe("#capture", () => {
    it("redirects inner writes to a fresh buffer and returns them as SafeBuffer", () => {
      ctx.outputBuffer.safeAppend("outer-before");
      const captured = ctx.capture(() => {
        ctx.outputBuffer.safeAppend("inner");
      });
      ctx.outputBuffer.safeAppend("outer-after");

      expect(captured.toString()).toBe("inner");
      expect(isHtmlSafe(captured)).toBe(true);
      expect(ctx.outputBuffer.toStr()).toBe("outer-beforeouter-after");
    });

    it("restores the previous buffer even when the callback throws", () => {
      const original = ctx.outputBuffer;
      expect(() =>
        ctx.capture(() => {
          throw new Error("oops");
        }),
      ).toThrow("oops");
      expect(ctx.outputBuffer).toBe(original);
    });

    it("supports nested captures", () => {
      ctx.outputBuffer.safeAppend("a");
      const outer = ctx.capture(() => {
        ctx.outputBuffer.safeAppend("b");
        const inner = ctx.capture(() => {
          ctx.outputBuffer.safeAppend("c");
        });
        expect(inner.toString()).toBe("c");
        ctx.outputBuffer.safeAppend("d");
      });
      ctx.outputBuffer.safeAppend("e");

      expect(outer.toString()).toBe("bd");
      expect(ctx.outputBuffer.toStr()).toBe("ae");
    });
  });

  describe("#concat", () => {
    it("appends to the active buffer with HTML escaping", () => {
      ctx.concat("<script>");
      expect(ctx.outputBuffer.toStr()).toBe("&lt;script&gt;");
    });

    it("appends SafeBuffer content without escaping", () => {
      ctx.concat(htmlSafe("<b>safe</b>"));
      expect(ctx.outputBuffer.toStr()).toBe("<b>safe</b>");
    });

    it("writes to the capture buffer when called inside capture", () => {
      const result = ctx.capture(() => {
        ctx.concat("hello");
      });
      expect(result.toString()).toBe("hello");
      expect(ctx.outputBuffer.toStr()).toBe("");
    });
  });

  describe("#raw", () => {
    it("returns a SafeBuffer without escaping", () => {
      const result = ctx.raw("<b>bold</b>");
      expect(result.toString()).toBe("<b>bold</b>");
      expect(isHtmlSafe(result)).toBe(true);
    });

    it("coerces non-strings via String()", () => {
      expect(ctx.raw(42).toString()).toBe("42");
      expect(ctx.raw(null).toString()).toBe("");
      expect(ctx.raw(undefined).toString()).toBe("");
    });

    it("passes SafeBuffer through unchanged", () => {
      const safe = htmlSafe("<em>safe</em>");
      expect(ctx.raw(safe)).toBe(safe);
    });

    it("handles OutputBuffer without coercion error (OutputBuffer.toString() is non-primitive)", () => {
      const buf = new OutputBuffer();
      buf.safeAppend("<b>buf</b>");
      const result = ctx.raw(buf);
      expect(result.toString()).toBe("<b>buf</b>");
      expect(isHtmlSafe(result)).toBe(true);
    });
  });

  describe("partial inheritance pattern", () => {
    it("a child context sharing the parent outputBuffer writes to the same buffer", () => {
      const parent = new TseRenderContextImpl();
      parent.outputBuffer.safeAppend("parent-before");

      const child = new TseRenderContextImpl(parent.outputBuffer);
      child.outputBuffer.safeAppend("child");

      parent.outputBuffer.safeAppend("parent-after");

      expect(parent.outputBuffer.toStr()).toBe("parent-beforechildparent-after");
    });
  });
});
