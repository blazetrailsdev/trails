import { describe, expect, it, vi } from "vitest";

describe("ActionText::TagHelper FormHelper reopen", () => {
  it("reaches a class that included FormHelper before the reopen, and keeps its own override", async () => {
    vi.resetModules();
    const { include } = await import("@blazetrails/ruby-compat");
    const { FormHelper } = await import("@blazetrails/actionview/helpers/form-helper.js");
    const { Base } = await import("@blazetrails/actionview/base.js");
    class Earlier {}
    include(Earlier, FormHelper);
    const own = (): string => "own";
    class Overriding {}
    Object.defineProperty(Overriding.prototype, "richTextarea", { value: own, writable: true });
    include(Overriding, FormHelper);

    await import("../lib/app/helpers/action-text/tag-helper.js");

    const earlier = Earlier.prototype as Record<string, unknown>;
    expect(earlier.richTextarea).toBe(
      (FormHelper.prototype as Record<string, unknown>).richTextarea,
    );
    expect(earlier.richTextArea).toBeTypeOf("function");
    expect((Base.prototype as Record<string, unknown>).richTextarea).toBeTypeOf("function");
    expect((Overriding.prototype as Record<string, unknown>).richTextarea).toBe(own);
  });
});
