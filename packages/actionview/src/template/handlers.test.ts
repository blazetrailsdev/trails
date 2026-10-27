import { beforeEach, describe, expect, it } from "vitest";
import { Handlers, type TemplateHandler } from "./handlers.js";
import { Template } from "../template.js";
import { Raw } from "./handlers/raw.js";

function makeHandler(): TemplateHandler {
  return {
    call: (_template, source) => `return ${JSON.stringify(source)};`,
  };
}

describe("Template::Handlers", () => {
  beforeEach(() => Template.unregisterTemplateHandler(...Template.templateHandlerExtensions()));

  it("registers a handler for multiple extensions variadically", () => {
    const h = makeHandler();
    Template.registerTemplateHandler("tsx", "jsx", h);

    expect(Template.registeredTemplateHandler("tsx")).toBe(h);
    expect(Template.registeredTemplateHandler("jsx")).toBe(h);
  });

  it("registerTemplateHandler throws when no extension is supplied", () => {
    expect(() =>
      (Template.registerTemplateHandler as unknown as (h: TemplateHandler) => void)(makeHandler()),
    ).toThrow(/Extension is required/);
  });

  it("registers and looks up handlers by extension", () => {
    const h = makeHandler();
    Template.registerTemplateHandler("tse", h);

    expect(Template.registeredTemplateHandler("tse")).toBe(h);
    expect(Template.handlerForExtension("tse")).toBe(h);
  });

  it("returns undefined for unknown extensions when no default registered", () => {
    expect(Template.registeredTemplateHandler("missing")).toBeUndefined();
    expect(Template.handlerForExtension("missing")).toBeUndefined();
  });

  it("registeredTemplateHandler returns undefined for nullish input", () => {
    expect(Template.registeredTemplateHandler(null)).toBeUndefined();
    expect(Template.registeredTemplateHandler(undefined)).toBeUndefined();
  });

  it("registerDefaultTemplateHandler falls back for unknown extensions", () => {
    const raw = new Raw();
    Template.registerDefaultTemplateHandler("raw", raw);

    expect(Template.handlerForExtension("raw")).toBe(raw);
    expect(Template.handlerForExtension("anything")).toBe(raw);
    expect(Template.registeredTemplateHandler("anything")).toBeUndefined();
  });

  it("unregisterTemplateHandler removes handlers and clears default", () => {
    const raw = new Raw();
    Template.registerDefaultTemplateHandler("raw", raw);
    Template.unregisterTemplateHandler("raw");

    expect(Template.registeredTemplateHandler("raw")).toBeUndefined();
    expect(Template.handlerForExtension("anything")).toBeUndefined();
  });

  it("templateHandlerExtensions is sorted", () => {
    Template.registerTemplateHandler("tse", makeHandler());
    Template.registerTemplateHandler("raw", makeHandler());
    Template.registerTemplateHandler("builder", makeHandler());

    expect(Template.templateHandlerExtensions()).toEqual(["builder", "raw", "tse"]);
  });

  it("extensions memoizes and invalidates on register/unregister", () => {
    Template.registerTemplateHandler("tse", makeHandler());
    const first = Handlers.extensions();
    expect(Handlers.extensions()).toBe(first);

    Template.registerTemplateHandler("raw", makeHandler());
    expect(Handlers.extensions()).not.toBe(first);
    expect(Handlers.extensions()).toEqual([":tse", ":raw"]);
  });
});

describe("Template::Handlers::Raw", () => {
  it("returns the source verbatim", () => {
    expect(new Raw().call(null, "hello")).toBe('return htmlSafe("hello");');
  });
});
