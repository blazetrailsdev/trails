import { describe, expect, it } from "vitest";
import { LoadError } from "@blazetrails/ruby-compat";
import { Handler } from "../lib/handler.js";

class Lobster {}
Object.assign(Handler, { Lobster });
class RockLobster {}

describe("Rackup::Handler", () => {
  // PERMANENT-SKIP: Rackup::Handler::CGI and ::WEBrick are unported, RFC 0217-rackup-gem-port § "Non-goals".
  it.skip("has registered default handlers", async () => {
    expect(await Handler.get("cgi")).toBe(Handler.aref("CGI"));
    expect(await Handler.get("webrick")).toBe(Handler.aref("WEBrick"));
  });

  it("raise LoadError if handler doesn't exist", async () => {
    await expect(Handler.get("boom")).rejects.toThrow(LoadError);

    await expect(Handler.get("Object")).rejects.toThrow(LoadError);
  });

  it("get unregistered, but already required, handler by name", async () => {
    expect(await Handler.get("Lobster")).toBe(Lobster);
  });

  it("register custom handler", async () => {
    Handler.register("rock_lobster", RockLobster);
    expect(await Handler.get("rock_lobster")).toBe(RockLobster);
  });

  it("not need registration for properly coded handlers even if not already required", async () => {
    const path = {
      "rack/handler/unregistered": () =>
        import("./support/unregistered-handler/rack/handler/unregistered.js"),
      "rack/handler/unregistered_long_one": () =>
        import("./support/unregistered-handler/rack/handler/unregistered-long-one.js"),
    };
    try {
      Object.assign(Handler.loadPath, path);
      const unregistered = await Handler.get("Unregistered");
      const { Unregistered } =
        await import("./support/unregistered-handler/rack/handler/unregistered.js");
      expect(unregistered).toBe(Unregistered);
      await expect(Handler.get("UnRegistered")).rejects.toThrow(LoadError);
      const unregisteredLongOne = await Handler.get("UnregisteredLongOne");
      const { UnregisteredLongOne } =
        await import("./support/unregistered-handler/rack/handler/unregistered-long-one.js");
      expect(unregisteredLongOne).toBe(UnregisteredLongOne);
    } finally {
      for (const feature of Object.keys(path)) delete Handler.loadPath[feature];
    }
  });

  it("allow autoloaded handlers to be registered properly while being loaded", async () => {
    const path = {
      "rack/handler/registering_myself": () =>
        import("./support/registering-handler/rack/handler/registering-myself.js"),
    };
    try {
      Object.assign(Handler.loadPath, path);
      const registeringMyself = await Handler.get("registering_myself");
      const { RegisteringMyself } =
        await import("./support/registering-handler/rack/handler/registering-myself.js");
      expect(registeringMyself).toBe(RegisteringMyself);
    } finally {
      for (const feature of Object.keys(path)) delete Handler.loadPath[feature];
    }
  });
});
