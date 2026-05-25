/**
 * Type-level tests for TseRenderContext#render typed-partial overloads (Story 5.8).
 */
import { describe, it, expectTypeOf } from "vitest";
import type { SafeBuffer } from "@blazetrails/activesupport";
import { TseRenderContextImpl } from "@blazetrails/actionview";
import type { TemplateRegistry } from "@blazetrails/actionview";

// Registry keys are formatless (generator strips extension): "users/user" not "users/user.html".
declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "users/user": { user: string; role?: string };
  }
}

describe("TseRenderContext#render — typed locals (Story 5.8)", () => {
  const ctx = new TseRenderContextImpl();

  it("render returns SafeBuffer for registered and dynamic partials", () => {
    const r1 = ctx.render({ partial: "users/user", locals: { user: "Alice" } });
    expectTypeOf(r1).toMatchTypeOf<SafeBuffer>();

    const name: string = "any/partial";
    const r2 = ctx.render({ partial: name, locals: { x: 1 } });
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
});
