import { describe, expect, it } from "vitest";
import { aliases } from "./commands.js";

describe("rails/commands aliases", () => {
  it("maps every short name but db, which is still the commander db command", () => {
    expect(aliases).toEqual({
      g: "generate",
      d: "destroy",
      c: "console",
      s: "server",
      r: "runner",
      t: "test",
    });
  });
});
