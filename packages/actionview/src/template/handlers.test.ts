import { afterEach, describe, expect, it } from "vitest";
import { TemplateHandlers, type TemplateHandler } from "./handlers.js";
import { Raw } from "./handlers/raw.js";

function makeHandler(): TemplateHandler {
  return {
    call: (_template, source) => `return ${JSON.stringify(source)};`,
  };
}

describe("Template::Handlers", () => {
  afterEach(() => TemplateHandlers.clear());

  it("registers a handler for multiple extensions variadically", () => {
    const h = makeHandler();
    TemplateHandlers.registerTemplateHandler("tsx", "jsx", h);

    expect(TemplateHandlers.registeredTemplateHandler("tsx")).toBe(h);
    expect(TemplateHandlers.registeredTemplateHandler("jsx")).toBe(h);
  });

  it("registerTemplateHandler throws when no extension is supplied", () => {
    expect(() =>
      (TemplateHandlers.registerTemplateHandler as unknown as (h: TemplateHandler) => void)(
        makeHandler(),
      ),
    ).toThrow(/Extension is required/);
  });

  it("registers and looks up handlers by extension", () => {
    const h = makeHandler();
    TemplateHandlers.registerTemplateHandler("tse", h);

    expect(TemplateHandlers.registeredTemplateHandler("tse")).toBe(h);
    expect(TemplateHandlers.handlerForExtension("tse")).toBe(h);
  });

  it("returns undefined for unknown extensions when no default registered", () => {
    expect(TemplateHandlers.registeredTemplateHandler("missing")).toBeUndefined();
    expect(TemplateHandlers.handlerForExtension("missing")).toBeUndefined();
  });

  it("registeredTemplateHandler returns undefined for nullish input", () => {
    expect(TemplateHandlers.registeredTemplateHandler(null)).toBeUndefined();
    expect(TemplateHandlers.registeredTemplateHandler(undefined)).toBeUndefined();
  });

  it("registerDefaultTemplateHandler falls back for unknown extensions", () => {
    const raw = new Raw();
    TemplateHandlers.registerDefaultTemplateHandler("raw", raw);

    expect(TemplateHandlers.handlerForExtension("raw")).toBe(raw);
    expect(TemplateHandlers.handlerForExtension("anything")).toBe(raw);
    expect(TemplateHandlers.registeredTemplateHandler("anything")).toBeUndefined();
  });

  it("unregisterTemplateHandler removes handlers and clears default", () => {
    const raw = new Raw();
    TemplateHandlers.registerDefaultTemplateHandler("raw", raw);
    TemplateHandlers.unregisterTemplateHandler("raw");

    expect(TemplateHandlers.registeredTemplateHandler("raw")).toBeUndefined();
    expect(TemplateHandlers.handlerForExtension("anything")).toBeUndefined();
  });

  it("templateHandlerExtensions is sorted", () => {
    TemplateHandlers.registerTemplateHandler("tse", makeHandler());
    TemplateHandlers.registerTemplateHandler("raw", makeHandler());
    TemplateHandlers.registerTemplateHandler("builder", makeHandler());

    expect(TemplateHandlers.templateHandlerExtensions()).toEqual(["builder", "raw", "tse"]);
  });

  it("extensions memoizes and invalidates on register/unregister", () => {
    TemplateHandlers.registerTemplateHandler("tse", makeHandler());
    const first = TemplateHandlers.extensions();
    expect(TemplateHandlers.extensions()).toBe(first);

    TemplateHandlers.registerTemplateHandler("raw", makeHandler());
    expect(TemplateHandlers.extensions()).not.toBe(first);
    expect(TemplateHandlers.extensions()).toEqual([":tse", ":raw"]);
  });
});

describe("Template::Handlers::Raw", () => {
  it("returns the source verbatim", () => {
    expect(new Raw().call(null, "hello")).toBe('return htmlSafe("hello");');
  });
});
