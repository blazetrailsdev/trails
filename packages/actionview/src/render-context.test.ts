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

  describe("#yield", () => {
    it("returns empty SafeBuffer by default (no layout content set)", () => {
      const result = ctx.yield();
      expect(result.toString()).toBe("");
      expect(isHtmlSafe(result)).toBe(true);
    });

    it("returns the inner template output set via setDefaultYield", () => {
      ctx.setDefaultYield(htmlSafe("<p>inner</p>"));
      expect(ctx.yield().toString()).toBe("<p>inner</p>");
      expect(isHtmlSafe(ctx.yield())).toBe(true);
    });

    it("returns empty SafeBuffer for an unknown named section", () => {
      const result = ctx.yield("title");
      expect(result.toString()).toBe("");
      expect(isHtmlSafe(result)).toBe(true);
    });

    it("returns named section content captured via contentFor", () => {
      ctx.contentFor("title", () => {
        ctx.outputBuffer.safeAppend("My Title");
      });
      expect(ctx.yield("title").toString()).toBe("My Title");
    });

    it("multiple contentFor calls with same name concatenate", () => {
      ctx.contentFor("sidebar", () => {
        ctx.outputBuffer.safeAppend("first");
      });
      ctx.contentFor("sidebar", () => {
        ctx.outputBuffer.safeAppend(" second");
      });
      expect(ctx.yield("sidebar").toString()).toBe("first second");
    });

    it("different sections are independent", () => {
      ctx.contentFor("title", () => {
        ctx.outputBuffer.safeAppend("Title");
      });
      ctx.contentFor("footer", () => {
        ctx.outputBuffer.safeAppend("Footer");
      });
      expect(ctx.yield("title").toString()).toBe("Title");
      expect(ctx.yield("footer").toString()).toBe("Footer");
    });
  });

  describe("#contentFor", () => {
    it("does not write to the outer buffer", () => {
      ctx.outputBuffer.safeAppend("outer");
      ctx.contentFor("aside", () => {
        ctx.outputBuffer.safeAppend("inside");
      });
      expect(ctx.outputBuffer.toStr()).toBe("outer");
    });

    it("HTML-escapes unsafe content written via concat inside callback", () => {
      ctx.contentFor("title", () => {
        ctx.concat("<script>");
      });
      expect(ctx.yield("title").toString()).toBe("&lt;script&gt;");
    });
  });
});
