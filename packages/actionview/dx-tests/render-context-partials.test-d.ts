/**
 * Type-level tests for TseRenderContext#render typed-partial overloads.
 *
 * These tests verify the TemplateRegistry → typed-locals contract introduced
 * in Story 5.8. They do not exercise runtime behavior — only compile-time types.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { SafeBuffer } from "@blazetrails/activesupport";
import { TseRenderContextImpl } from "@blazetrails/actionview";
import type { TemplateRegistry } from "@blazetrails/actionview";

// Augment the registry with a test partial for type assertions below.
declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "users/user.html": (_ctx: unknown, locals: { user: string; role?: string }) => unknown;
  }
}

describe("TseRenderContext#render — typed locals (Story 5.8)", () => {
  const ctx = new TseRenderContextImpl();

  it("render returns SafeBuffer for a registered partial", () => {
    const result = ctx.render({ partial: "users/user.html", locals: { user: "Alice" } });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });

  it("render returns SafeBuffer for a dynamic string partial", () => {
    const name: string = "some/partial";
    const result = ctx.render({ partial: name, locals: { anything: true } });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });

  it("locals type for a registered key is the declared locals type", () => {
    type Locals = Parameters<TemplateRegistry["users/user.html"]>[1];
    expectTypeOf<Locals>().toMatchTypeOf<{ user: string; role?: string }>();
  });

  it("collection option is accepted on a registered partial", () => {
    const result = ctx.render({ partial: "users/user.html", collection: ["a", "b"] });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });

  it("as option is accepted", () => {
    const result = ctx.render({ partial: "users/user.html", collection: ["a"], as: "person" });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });

  it("spacerTemplate option is accepted", () => {
    const result = ctx.render({
      partial: "users/user.html",
      collection: ["a", "b"],
      spacerTemplate: "shared/divider",
    });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });

  it("dynamic string partial accepts any Record<string, unknown> locals", () => {
    const name: string = "any/partial";
    const result = ctx.render({ partial: name, locals: { x: 1, y: "hello", z: true } });
    expectTypeOf(result).toMatchTypeOf<SafeBuffer>();
  });
});
