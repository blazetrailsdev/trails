import { describe, it } from "vitest";

describe("RenderLayoutTest", () => {
  it.skip("rendering a normal template, but using the implicit layout", () => {});
  it.skip("rendering a normal template, but using an implicit NAMED layout", () => {});
  it.skip("rendering a renderable object, using the implicit layout", () => {});
  it.skip("rendering a renderable object, using the override layout", () => {});
  it.skip("overriding an implicit layout with render :layout option", () => {});
});

describe("LayoutOptionsTest", () => {
  it.skip("rendering with :layout => false leaves out the implicit layout", () => {});
});

describe("MismatchFormatTest", () => {
  it.skip("if XML is selected, an HTML template is not also selected", () => {});
  it.skip("if XML is implicitly selected, an HTML template is not also selected", () => {});
  it.skip("a layout for JS is ignored even if explicitly provided for HTML", () => {});
});

describe("FalseLayoutMethodTest", () => {
  it.skip("access false layout returned by a method/proc", () => {});
});
