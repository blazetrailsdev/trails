import { afterEach, describe, expect, it } from "vitest";
import { Template } from "./template.js";
import { TemplateError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";

const echo: TemplateHandler = {
  extensions: ["txt"],
  render: (source, locals) => `${source}::${JSON.stringify(locals)}`,
};

describe("ActionView::Template (smoke)", () => {
  afterEach(() => TemplateHandlers.clear());

  it("stores Rails-named attrs and derives variable from virtualPath", () => {
    const t = new Template({
      source: "hi",
      identifier: "posts/_form",
      virtualPath: "posts/_form.html.tse",
      format: "html",
      variant: "phone",
      extension: "tse",
      locals: ["a"],
    });
    expect(t.identifier).toBe("posts/_form");
    expect(t.format).toBe("html");
    expect(t.variant).toBe("phone");
    expect(t.variable).toBe("form");
    expect(t.isPartial).toBe(true);
    expect(t.locals).toEqual(["a"]);
  });

  it("strict_locals! strips the magic comment and memoizes the signature", () => {
    const t = new Template({
      source: "<%# locals: (headline:, alerts: []) %>\nbody",
      identifier: "x",
    });
    expect(t.strictLocalsBang()).toBe("headline:, alerts: []");
    expect(t.source).not.toMatch(/locals:/);
    expect(t.strictLocalsQ()).toBe(true);
    expect(t.locals).toBeNull();

    const afterFirst = t.source;
    expect(t.strictLocalsBang()).toBe("headline:, alerts: []");
    expect(t.source).toBe(afterFirst);
  });

  it("render delegates to the handler and wraps non-TemplateError failures", async () => {
    TemplateHandlers.registerTemplateHandler("txt", echo);
    const t = new Template({ source: "hi", identifier: "x", extension: "txt" });
    expect(await t.render({ name: "ada" })).toBe(`hi::${JSON.stringify({ name: "ada" })}`);

    TemplateHandlers.clear();
    TemplateHandlers.registerTemplateHandler("txt", {
      extensions: ["txt"],
      render: () => {
        throw new Error("boom");
      },
    });
    await expect(t.render()).rejects.toBeInstanceOf(TemplateError);
  });

  it("render throws a helpful error when no handler is registered", async () => {
    const t = new Template({ source: "x", identifier: "x", extension: "nope" });
    await expect(t.render()).rejects.toThrow(/No template handler registered for ".nope"/);
  });

  it("asLayout returns a copy with isLayout flipped on", () => {
    const t = new Template({ source: "<html/>", identifier: "layouts/app", extension: "tse" });
    const wrapped = t.asLayout();
    expect(wrapped.isLayout).toBe(true);
    expect(t.isLayout).toBe(false);
    expect(wrapped).not.toBe(t);
  });

  it("exposes Template.Error for the Rails-spelled nesting", () => {
    expect(Template.Error).toBe(TemplateError);
  });
});
