import { describe, expect, it } from "vitest";
import { HTML5 } from "../../lib/index.js";

describe("Nokogiri::Gumbo.fragment context (trails)", () => {
  it("finds a form ancestor of a non-element context", () => {
    const doc = HTML5.parse("<form>hello</form>");
    const text = doc.at("form")!.children.toA()[0];
    expect(text.isElement()).toBe(false);
    const fragment = new HTML5.DocumentFragment(doc, "<form><input></form>", text);
    expect(fragment.children.map((child) => child.name)).toEqual(["input"]);
  });

  it("parses an annotation-xml context with its encoding", () => {
    const doc = HTML5.parse('<math><annotation-xml encoding="text/html"></annotation-xml></math>');
    const ctx = doc.at("annotation-xml")!;
    const fragment = new HTML5.DocumentFragment(doc, "<foo></foo>", ctx);
    expect(fragment.at("foo")!.namespace?.href ?? null).toBeNull();
  });
});
