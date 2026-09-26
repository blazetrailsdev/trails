import { afterEach, describe, it, expect } from "vitest";
import { LookupContext } from "./lookup-context.js";
import { TemplateHandlers } from "./template/handlers.js";

describe("LookupContext", () => {
  afterEach(() => {
    const registered = LookupContext.registeredDetails as string[];
    const idx = registered.indexOf("foo");
    if (idx >= 0) registered.splice(idx, 1);
    delete LookupContext._defaultProcs().foo;
    delete (LookupContext.prototype as unknown as Record<string, unknown>).defaultFoo;
  });

  it("defines a default_<name> reader for each registered detail", () => {
    const ctx = new LookupContext([]);
    expect(ctx.defaultLocale()).toEqual([":en"]);
    expect(ctx.defaultFormats()).toEqual([":html", ":text", ":js", ":css", ":xml", ":json"]);
    expect(ctx.defaultVariants()).toEqual([]);
    expect(ctx.defaultHandlers()).toEqual(TemplateHandlers.extensions());
  });

  it("register_detail defines default_<name> for a later detail", () => {
    LookupContext.registerDetail("foo", () => [":bar"]);
    const ctx = new LookupContext([]) as LookupContext & { defaultFoo(): string[] };
    expect(ctx.defaultFoo()).toEqual([":bar"]);
  });

  it("falls back to default_<name> when a detail is set blank", () => {
    const ctx = new LookupContext([], { variants: [":phone"], handlers: [":tse"] });
    const defaults = { defaultVariants: [":tablet"], defaultHandlers: [":builder"] };
    Object.assign(ctx, {
      defaultVariants: () => defaults.defaultVariants,
      defaultHandlers: () => defaults.defaultHandlers,
      defaultFormats: () => [":json"],
      defaultLocale: () => [":da"],
    });
    ctx.variants = [];
    ctx.handlers = null;
    ctx.formats = null;
    ctx.locale = null;
    expect(ctx.variants).toEqual([":tablet"]);
    expect(ctx.handlers).toEqual([":builder"]);
    expect(ctx.formats).toEqual([":json"]);
    expect(ctx.locale).toBe(":da");
  });
});
