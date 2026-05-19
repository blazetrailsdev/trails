import { afterEach, describe, expect, it } from "vitest";
import { TemplateHandlers, type TemplateHandler } from "./handlers.js";
import { Raw } from "./handlers/raw.js";

function makeHandler(extensions: string[]): TemplateHandler {
  return {
    extensions,
    render: (source) => source,
  };
}

describe("Template::Handlers", () => {
  afterEach(() => TemplateHandlers.clear());

  it("registers a handler for multiple extensions variadically", () => {
    const h = makeHandler(["tsx", "jsx"]);
    TemplateHandlers.registerTemplateHandler("tsx", "jsx", h);

    expect(TemplateHandlers.registeredTemplateHandler("tsx")).toBe(h);
    expect(TemplateHandlers.registeredTemplateHandler("jsx")).toBe(h);
  });

  it("registerTemplateHandler throws when no extension is supplied", () => {
    expect(() =>
      (TemplateHandlers.registerTemplateHandler as unknown as (h: TemplateHandler) => void)(
        makeHandler([]),
      ),
    ).toThrow(/Extension is required/);
  });

  it("registers and looks up handlers by extension", () => {
    const h = makeHandler(["ejs"]);
    TemplateHandlers.registerTemplateHandler("ejs", h);

    expect(TemplateHandlers.registeredTemplateHandler("ejs")).toBe(h);
    expect(TemplateHandlers.handlerForExtension("ejs")).toBe(h);
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
    TemplateHandlers.registerTemplateHandler("ejs", makeHandler(["ejs"]));
    TemplateHandlers.registerTemplateHandler("raw", makeHandler(["raw"]));
    TemplateHandlers.registerTemplateHandler("builder", makeHandler(["builder"]));

    expect(TemplateHandlers.templateHandlerExtensions()).toEqual(["builder", "ejs", "raw"]);
  });

  it("extensions memoizes and invalidates on register/unregister", () => {
    TemplateHandlers.registerTemplateHandler("ejs", makeHandler(["ejs"]));
    const first = TemplateHandlers.extensions;
    expect(TemplateHandlers.extensions).toBe(first);

    TemplateHandlers.registerTemplateHandler("raw", makeHandler(["raw"]));
    expect(TemplateHandlers.extensions).not.toBe(first);
    expect(TemplateHandlers.extensions).toEqual(["ejs", "raw"]);
  });
});

describe("Template::Handlers::Raw", () => {
  it("returns the source verbatim", async () => {
    const raw = new Raw();
    const out = await raw.render("hello", {}, { controller: "x", action: "y", format: "html" });
    expect(out).toBe("hello");
  });

  it("declares passthrough extensions", () => {
    expect(new Raw().extensions).toContain("raw");
    expect(new Raw().extensions).toContain("txt");
    expect(new Raw().extensions).toContain("html");
  });
});
