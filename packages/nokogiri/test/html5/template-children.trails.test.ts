import { describe, expect, it } from "vitest";
import { HTML5 } from "../../lib/index.js";

describe("HTML5 template children", () => {
  it("reads a template's content as its children", () => {
    const fragment = HTML5.DocumentFragment.parse("<template><p>a</p>text<b>x</b></template>");
    const template = fragment.at("template")!;
    expect(template.children.map((child) => child.name)).toEqual(["p", "text", "b"]);
    expect(template.elementChildren.map((child) => child.name)).toEqual(["p", "b"]);
  });
});
