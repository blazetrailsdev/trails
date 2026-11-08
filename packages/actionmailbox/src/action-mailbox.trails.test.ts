import { describe, expect, it } from "vitest";
import { ActionMailbox, VERSION, deprecator, version } from "./index.js";

describe("ActionMailbox", () => {
  it("declares the action_mailbox.rb accessors at their defaults", () => {
    expect(ActionMailbox.ingress).toBeNull();
    expect(ActionMailbox.incinerate).toBe(true);
    expect(ActionMailbox.incinerateAfter.inDays()).toBe(30);
    expect(ActionMailbox.queues).toEqual({});
    expect(ActionMailbox.storageService).toBeNull();
  });

  it("answers its version and a memoized deprecator", () => {
    expect(VERSION.STRING).toBe("8.0.2");
    expect(version().toString()).toBe("8.0.2");
    expect(ActionMailbox.deprecator()).toBe(deprecator());
  });
});
