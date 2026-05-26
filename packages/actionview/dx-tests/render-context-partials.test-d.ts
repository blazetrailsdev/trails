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

    const r2 = ctx.render({ partial: "users/user", collection: ["a"], as: "person" });
    expectTypeOf(r2).toMatchTypeOf<SafeBuffer>();

    const r3 = ctx.render({
      partial: "users/user",
      collection: ["a", "b"],
      spacerTemplate: "shared/divider",
    });
    expectTypeOf(r3).toMatchTypeOf<SafeBuffer>();
  });

  it("collection renders with typed locals accept valid keys and reject unknown keys", () => {
    ctx.render({ partial: "users/user", collection: ["a"], locals: { role: "admin" } });

    // @ts-expect-error — 'bogus' is not a key on the registered locals type
    ctx.render({ partial: "users/user", collection: ["a"], locals: { bogus: 1 } });
  });
});
