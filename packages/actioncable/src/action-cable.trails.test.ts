import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { rbObjIvarSet } from "@blazetrails/ruby-compat";
import { ActionCable } from "./index.js";

describe("ActionCable", () => {
  it("INTERNAL carries the wire strings under camelCase keys", () => {
    expect(ActionCable.INTERNAL.messageTypes.confirmation).toBe("confirm_subscription");
    expect(ActionCable.INTERNAL.disconnectReasons.serverRestart).toBe("server_restart");
    expect(ActionCable.INTERNAL.defaultMountPath).toBe("/cable");
    expect(Object.isFrozen(ActionCable.INTERNAL.protocols)).toBe(true);
    expect(Object.isFrozen(ActionCable.INTERNAL)).toBe(false);
  });

  it("is seated on TopLevel with its namespaces", () => {
    expect(TopLevel.ActionCable).toBe(ActionCable);
    expect(ActionCable.Server.name).toBe("ActionCable::Server");
    expect(ActionCable.SubscriptionAdapter.name).toBe("ActionCable::SubscriptionAdapter");
  });

  it("memoizes server in @server, and clearing it builds a new one", () => {
    class Base {}
    ActionCable.Server.Base = Base;
    try {
      const first = ActionCable.server();
      expect(first).toBeInstanceOf(Base);
      expect(ActionCable.server()).toBe(first);
      rbObjIvarSet(ActionCable, "@server", null);
      expect(ActionCable.server()).not.toBe(first);
    } finally {
      rbObjIvarSet(ActionCable, "@server", null);
      delete (ActionCable.Server as { Base?: unknown }).Base;
    }
  });
});
