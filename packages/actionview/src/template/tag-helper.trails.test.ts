/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  tag as _tag,
  TagBuilder,
  tagBuilder as _tagBuilder,
  safeJoin,
  toSentence,
} from "../helpers/tag-helper.js";
import { Base } from "../base.js";

const view = new (Base.withEmptyTemplateCache())(null, {}, null);
const tag = _tag.bind(view);
const tagBuilder = _tagBuilder.bind(view);

describe("TagHelperTest", () => {
  describe("TagBuilder", () => {
    it("constructor stores view context", () => {
      const builder = new TagBuilder(view);
      expect(builder.viewContext).toBe(view);
    });

    it("tagString builds a content tag", () => {
      const builder = new TagBuilder(view);
      expect(builder.tagString("p", "Hi").toString()).toBe("<p>Hi</p>");
      expect(builder.tagString("p", null, { class: "x" }).toString()).toBe('<p class="x"></p>');
      expect(builder.tagString("p", null, undefined, { block: () => "Yo" }).toString()).toBe(
        "<p>Yo</p>",
      );
    });

    it("generates prototype methods for Rails' element list", () => {
      for (const name of ["div", "br", "circle", "animate_motion"]) {
        expect(Object.prototype.hasOwnProperty.call(TagBuilder.prototype, name)).toBe(true);
      }
      const t = tag() as any;
      expect(t.div).toBe(TagBuilder.prototype.div);
      expect(t.br).toBe(TagBuilder.prototype.br);
      expect(t.circle).toBe(TagBuilder.prototype.circle);
      expect(Object.prototype.hasOwnProperty.call(TagBuilder.prototype, "svg")).toBe(false);
      expect(t.svg().toString()).toBe("<svg></svg>");
    });

    it("defineVoidElement registers a void element", () => {
      TagBuilder.defineVoidElement("custom-void");
      const t = tag() as any;
      expect(t["custom-void"]().toString()).toBe("<custom-void>");
    });

    it("defineSelfClosingElement registers a self-closing element", () => {
      TagBuilder.defineSelfClosingElement("custom-selfclose");
      const t = tag() as any;
      expect(t["custom-selfclose"]().toString()).toBe("<custom-selfclose />");
    });

    it("defineElement with methodName aliases", () => {
      TagBuilder.defineElement("my-elem", { methodName: "my_alias" });
      const t = tag() as any;
      expect(t.my_alias("x").toString()).toBe("<my-elem>x</my-elem>");
    });
  });

  describe("tagBuilder()", () => {
    it("returns the shared TagBuilder proxy", () => {
      const b = tagBuilder() as any;
      expect(b.span("hi").toString()).toBe("<span>hi</span>");
    });
  });

  describe("OutputSafetyHelper re-exports", () => {
    it("safeJoin", () => {
      expect(safeJoin(["a", "b"], "-").toString()).toBe("a-b");
    });
    it("toSentence", () => {
      expect(toSentence(["a", "b", "c"]).toString()).toBe("a, b, and c");
    });
  });
});
