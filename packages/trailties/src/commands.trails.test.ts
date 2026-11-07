import { describe, expect, it } from "vitest";
import { aliases } from "./commands.js";

describe("trails/commands aliases", () => {
  it("maps every short name, db to dbconsole", () => {
    expect(aliases).toEqual({
      g: "generate",
      d: "destroy",
      c: "console",
      s: "server",
      db: "dbconsole",
      r: "runner",
      t: "test",
    });
  });
});
