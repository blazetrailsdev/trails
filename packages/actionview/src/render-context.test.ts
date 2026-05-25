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

  describe("#render (partials)", () => {
    class SpyContext extends TseRenderContextImpl {
      calls: Array<{ partial: string; localName: string; locals: Record<string, unknown> }> = [];
      protected override _renderPartial(
        partial: string,
        localName: string,
        locals: Record<string, unknown>,
      ) {
        this.calls.push({ partial, localName, locals });
        return super._renderPartial(partial, localName, locals);
      }
    }

    let spy: SpyContext;
    beforeEach(() => {
      spy = new SpyContext();
    });

    it("single partial: passes locals, derives localName, returns SafeBuffer", () => {
      const result = spy.render({ partial: "users/user", locals: { name: "Alice" } });
      expect(isHtmlSafe(result)).toBe(true);
      expect(spy.calls[0]).toMatchObject({ localName: "user", locals: { name: "Alice" } });
      spy.render({ partial: "users/user" });
      expect(spy.calls[1].locals).toEqual({});
    });

    it("collection: calls _renderPartial per element with element, counter, and iteration", () => {
      spy.render({ partial: "users/user", collection: ["Alice", "Bob"] });
      expect(spy.calls).toHaveLength(2);
      expect(spy.calls[0].locals).toMatchObject({
        user: "Alice",
        user_counter: 0,
        user_iteration: { index: 0, first: true, last: false },
      });
      expect(spy.calls[1].locals).toMatchObject({
        user: "Bob",
        user_counter: 1,
        user_iteration: { index: 1, first: false, last: true },
      });
    });

    it("collection: as: overrides local name and counter key", () => {
      spy.render({ partial: "shared/item", collection: ["x"], as: "entry" });
      expect(spy.calls[0].locals).toMatchObject({ entry: "x", entry_counter: 0 });
    });

    it("collection: merges extra locals; strips _prefix and extension from localName", () => {
      spy.render({ partial: "shared/_form.html", collection: [{}], locals: { role: "admin" } });
      expect(spy.calls[0].localName).toBe("form");
      expect(spy.calls[0].locals).toMatchObject({ role: "admin", form: {}, form_counter: 0 });
    });

    it("collection: empty → no calls, returns empty SafeBuffer", () => {
      const result = spy.render({ partial: "users/user", collection: [] });
      expect(result.toString()).toBe("");
      expect(isHtmlSafe(result)).toBe(true);
      expect(spy.calls).toHaveLength(0);
    });

    it("spacerTemplate: N-1 spacer calls between items, none for single-item", () => {
      spy.render({
        partial: "users/user",
        collection: ["a", "b", "c"],
        spacerTemplate: "shared/divider",
      });
      expect(spy.calls.filter((c) => c.partial === "shared/divider")).toHaveLength(2);
      spy.calls = [];
      spy.render({ partial: "users/user", collection: ["only"], spacerTemplate: "shared/hr" });
      expect(spy.calls.filter((c) => c.partial === "shared/hr")).toHaveLength(0);
    });
  });
});
