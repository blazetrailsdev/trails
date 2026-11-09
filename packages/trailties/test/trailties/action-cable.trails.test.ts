import { describe, expect, it } from "vitest";
import { getPath } from "@blazetrails/ruby-compat";
import { Engine } from "../../lib/trailties/action-cable.js";

describe("ActionCable::Engine", () => {
  it("is rooted at the actioncable package, as Rails roots it at the actioncable gem", () => {
    expect(Engine.instance().root()).toBe(
      getPath().resolve(import.meta.dirname, "../../../actioncable"),
    );
  });

  it("finds no lib/tasks files under its root", async () => {
    expect(await Engine.instance().paths().get("lib/tasks")!.existent()).toEqual([]);
  });
});
