import { afterEach, describe, it, expect } from "vitest";
import { LookupContext } from "./lookup-context.js";
import { TemplateHandlers } from "./template/handlers.js";

describe("LookupContext", () => {
  afterEach(() => {
    const registered = LookupContext.registeredDetails as string[];
    const idx = registered.indexOf("foo");
    if (idx >= 0) registered.splice(idx, 1);
    if (LookupContext.Accessors.DEFAULT_PROCS.foo) {
      delete LookupContext.Accessors.DEFAULT_PROCS.foo;
      LookupContext.Accessors.removeMethod("defaultFoo", "foo");
    }
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

  it("register_detail defines the <name> reader and writer for a later detail", () => {
    LookupContext.registerDetail("foo", () => [":bar"]);
    const ctx = new LookupContext([]) as LookupContext & { foo: unknown };
    expect(ctx.foo).toEqual([":bar"]);
    const key = ctx.detailsKey();
    ctx.foo = ":baz";
    expect(ctx.foo).toEqual([":baz"]);
    expect(ctx.detailsKey()).not.toBe(key);
    ctx.foo = null;
    expect(ctx.foo).toEqual([":bar"]);
  });

  it("the <name> writer keeps the details key when the value is unchanged", () => {
    const ctx = new LookupContext([], { variants: [":phone"] });
    const key = ctx.detailsKey();
    ctx.variants = [":phone"];
    expect(ctx.detailsKey()).toBe(key);
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
