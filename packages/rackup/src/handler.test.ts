import { describe, expect, it } from "vitest";
import { LoadError } from "@blazetrails/ruby-compat";
import { Handler } from "./handler.js";

class RockLobster {}

describe("Rackup::Handler", () => {
  it("raise LoadError if handler doesn't exist", async () => {
    await expect(Handler.get("boom")).rejects.toThrow(LoadError);

    await expect(Handler.get("Object")).rejects.toThrow(LoadError);
  });

  it("register custom handler", async () => {
    Handler.register("rock_lobster", RockLobster);
    expect(await Handler.get("rock_lobster")).toBe(RockLobster);
  });
});
