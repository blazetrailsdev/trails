/**
 * Type-level tests for TseRenderContext#render conditional-generic signature.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { SafeBuffer } from "@blazetrails/activesupport";
import { TseRenderContextImpl } from "@blazetrails/actionview";
import type { TemplateRegistry } from "@blazetrails/actionview";

declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "users/user": { user: string; role?: string };
    "shared/banner": { title?: string };
    "items/item": { item: unknown; item_counter: number; item_iteration: object; label: string };
  }
}

describe("TseRenderContext#render — conditional generic (Story 5.8 + follow-up)", () => {
  const ctx = new TseRenderContextImpl();

  it("known partial with correct locals compiles", () => {
    const r = ctx.render({ partial: "users/user", locals: { user: "Alice" } });
    expectTypeOf(r).toMatchTypeOf<SafeBuffer>();
  });

  it("known partial with optional role compiles", () => {
    const r = ctx.render({ partial: "users/user", locals: { user: "Alice", role: "admin" } });
    expectTypeOf(r).toMatchTypeOf<SafeBuffer>();
  });

  it("known partial with missing required local errors", () => {
    // @ts-expect-error — 'user' is required in the registry
    ctx.render({ partial: "users/user" });

    // @ts-expect-error — locals present but missing required 'user'
    ctx.render({ partial: "users/user", locals: { role: "admin" } });
  });

  it("known partial with all-optional locals allows omitting locals", () => {
    const r = ctx.render({ partial: "shared/banner" });
    expectTypeOf(r).toMatchTypeOf<SafeBuffer>();
  });

  it("dynamic string name does not error (permissive fallback)", () => {
    const name: string = "any/partial";
    const r = ctx.render({ partial: name, locals: { x: 1 } });
    expectTypeOf(r).toMatchTypeOf<SafeBuffer>();

    const r2 = ctx.render({ partial: name });
    expectTypeOf(r2).toMatchTypeOf<SafeBuffer>();
  });

  it("locals type for a registered key matches the declared shape", () => {
    type Locals = TemplateRegistry["users/user"];
    expectTypeOf<Locals>().toMatchTypeOf<{ user: string; role?: string }>();
  });

  it("collection, as, and spacerTemplate options are accepted", () => {
    const r1 = ctx.render({ partial: "users/user", collection: ["a", "b"] });
    expectTypeOf(r1).toMatchTypeOf<SafeBuffer>();

    const r2 = ctx.render({ partial: "users/user", collection: ["a"], as: "user" });
    expectTypeOf(r2).toMatchTypeOf<SafeBuffer>();

    const r3 = ctx.render({
      partial: "users/user",
      collection: ["a", "b"],
      spacerTemplate: "shared/divider",
    });
    expectTypeOf(r3).toMatchTypeOf<SafeBuffer>();
  });

  it("as literal narrows auto-injected keys — matching name compiles", () => {
    ctx.render({ partial: "users/user", collection: ["a"], as: "user" });
  });

  it("as literal narrows auto-injected keys — mismatched name errors", () => {
    // @ts-expect-error — as: "wrong" does not strip "user" from auto-keys, so "user" is required
    ctx.render({ partial: "users/user", collection: ["a"], as: "wrong" });
  });

  it("as literal narrows auto-injected keys — mismatched name with locals compiles", () => {
    ctx.render({
      partial: "users/user",
      collection: ["a"],
      as: "person",
      locals: { user: "Alice" },
    });
  });

  it("collection renders with typed locals accept valid keys and reject unknown keys", () => {
    ctx.render({ partial: "users/user", collection: ["a"], locals: { role: "admin" } });

    // @ts-expect-error — 'bogus' is not a key on the registered locals type
    ctx.render({ partial: "users/user", collection: ["a"], locals: { bogus: 1 } });
  });

  it("collection render omits auto-injected keys from locals requirement", () => {
    // "items/item" has { item, item_counter, item_iteration, label } — the first
    // three are auto-injected by the collection iterator, so only `label` should
    // be required from the caller.
    ctx.render({ partial: "items/item", collection: [1, 2], locals: { label: "x" } });

    // @ts-expect-error — 'label' is required and not auto-injected
    ctx.render({ partial: "items/item", collection: [1, 2] });
  });

  it("collection render of partial with only auto-injected keys allows omitting locals", () => {
    const r = ctx.render({ partial: "users/user", collection: ["a", "b"] });
    expectTypeOf(r).toMatchTypeOf<SafeBuffer>();
  });
});
