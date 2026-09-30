/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { CodeGenerator } from "@blazetrails/activesupport";
import {
  tag as _tag,
  TagBuilder,
  tagBuilder as _tagBuilder,
  safeJoin,
  toSentence,
} from "../helpers/tag-helper.js";
import { Base } from "../base.js";
import { submitTag as _submitTag } from "../helpers/form-tag-helper.js";
import { Hash } from "@blazetrails/ruby-compat";

const view = new (Base.withEmptyTemplateCache())(null, {}, null);
const tag = _tag.bind(view);
const tagBuilder = _tagBuilder.bind(view);
const submitTag = _submitTag.bind(view as any);

const hashOf = (entries: Record<string, unknown>): Hash<string, unknown> => {
  const hash = new Hash<string, unknown>();
  for (const [key, value] of Object.entries(entries)) hash.set(key, value);
  return hash;
};

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
      const t = tag() as any;
      for (const name of ["div", "br", "circle", "animate_motion"]) {
        expect(Object.getOwnPropertyDescriptor(TagBuilder.prototype, name)?.enumerable).toBe(false);
        expect(t[name]).toBe(TagBuilder.prototype[name]);
      }
      expect("svg" in TagBuilder.prototype).toBe(false);
      expect(t.svg().toString()).toBe("<svg></svg>");
    });

    it("defineVoidElement registers a void element", () => {
      CodeGenerator.batch(TagBuilder, "", 0, (codeGenerator) =>
        TagBuilder.defineVoidElement("custom-void", { codeGenerator }),
      );
      const t = tag() as any;
      expect(t["custom-void"]().toString()).toBe("<custom-void>");
    });

    it("defineSelfClosingElement registers a self-closing element", () => {
      CodeGenerator.batch(TagBuilder, "", 0, (codeGenerator) =>
        TagBuilder.defineSelfClosingElement("custom-selfclose", { codeGenerator }),
      );
      const t = tag() as any;
      expect(t["custom-selfclose"]().toString()).toBe("<custom-selfclose />");
    });

    it("defineElement with methodName aliases", () => {
      CodeGenerator.batch(TagBuilder, "", 0, (codeGenerator) =>
        TagBuilder.defineElement("my-elem", { codeGenerator, methodName: "my_alias" }),
      );
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

  describe("tag_options walks a ruby-compat Hash (tag_helper.rb:248-290)", () => {
    it("expands a Hash under data:", () => {
      expect(String(tag("div", { data: hashOf({ foo: "bar" }) }))).toBe('<div data-foo="bar" />');
    });

    it("expands a Hash under aria:", () => {
      expect(String(tag("div", { aria: hashOf({ label: "Search" }) }))).toBe(
        '<div aria-label="Search" />',
      );
    });

    it("renders a Hash passed as the whole options", () => {
      expect(String(tag("div", hashOf({ id: "x", data: hashOf({ foo: "bar" }) }) as any))).toBe(
        '<div id="x" data-foo="bar" />',
      );
    });

    it("submit_tag renders a data: Hash (form_tag_helper.rb:1060-1073)", () => {
      expect(String(submitTag("Save", hashOf({ data: hashOf({ disable_with: "x" }) })))).toBe(
        '<input type="submit" name="commit" value="Save" data-disable-with="x" />',
      );
    });
  });
});
