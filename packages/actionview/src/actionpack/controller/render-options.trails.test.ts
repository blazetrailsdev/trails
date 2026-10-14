import { describe, expect, it } from "vitest";
import type { ActionController } from "@blazetrails/actionpack";

declare module "@blazetrails/actionpack" {
  interface RenderOptions {
    csv?: readonly unknown[];
  }
}

describe("Renderers.add render option types", () => {
  it("accepts a renderer key an app merges into RenderOptions", () => {
    const typed = (controller: ActionController.Base): void => {
      controller.render({ csv: ["c", "s", "v"], status: "ok" });
      controller.render("index", { csv: [] });
      // @ts-expect-error the merged key keeps its declared type
      controller.render({ csv: "c,s,v" });
      // @ts-expect-error a renderer key nobody declared
      controller.render({ tsv: [] });
    };
    expect(typed).toBeTypeOf("function");
  });
});
