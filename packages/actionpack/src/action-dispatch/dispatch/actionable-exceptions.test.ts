/**
 * Mirrors actionpack/test/dispatch/actionable_exceptions_test.rb.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ActionableError, NonActionable } from "@blazetrails/activesupport";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ActionableExceptions } from "../middleware/actionable-exceptions.js";

const Actions: string[] = [];

class ActionError extends ActionableError {}
ActionError.action("Successful action", () => {
  Actions.push("Action!");
});
ActionError.action("Failed action", () => {
  throw new Error("Inaction!");
});

const noop = async (): Promise<RackResponse> => [200, {}, (async function* () {})()];

function postEnv(params: Record<string, string>, headers: Record<string, unknown> = {}): RackEnv {
  const body = new URLSearchParams(params).toString();
  return {
    REQUEST_METHOD: "POST",
    PATH_INFO: ActionableExceptions.endpoint,
    CONTENT_TYPE: "application/x-www-form-urlencoded",
    "rack.input": body,
    ...headers,
  };
}

describe("ActionableExceptionsTest", () => {
  beforeEach(() => {
    Actions.length = 0;
  });

  it("dispatches an actionable error", async () => {
    const mw = new ActionableExceptions(noop);
    const res = await mw.call(
      postEnv(
        { error: ActionError.name, action: "Successful action", location: "/" },
        { "action_dispatch.show_detailed_exceptions": true },
      ),
    );

    expect(Actions).toEqual(["Action!"]);
    expect(res[0]).toBe(302);
    expect(res[1]["location"]).toBe("/");
  });

  it("cannot dispatch errors if not allowed", async () => {
    const mw = new ActionableExceptions(noop);
    await mw.call(
      postEnv(
        { error: ActionError.name, action: "Successful action", location: "/" },
        { "action_dispatch.show_detailed_exceptions": false },
      ),
    );
    expect(Actions).toEqual([]);
  });

  it("dispatched action can fail", async () => {
    const mw = new ActionableExceptions(noop);
    await expect(
      mw.call(
        postEnv(
          { error: ActionError.name, action: "Failed action", location: "/" },
          { "action_dispatch.show_detailed_exceptions": true },
        ),
      ),
    ).rejects.toThrow("Inaction!");
  });

  it("cannot dispatch non-actionable errors", async () => {
    const mw = new ActionableExceptions(noop);
    await expect(
      mw.call(
        postEnv(
          { error: "RuntimeError", action: "Inexistent action", location: "/" },
          { "action_dispatch.show_detailed_exceptions": true },
        ),
      ),
    ).rejects.toBeInstanceOf(NonActionable);
  });

  it("cannot dispatch Inexistent errors", async () => {
    const mw = new ActionableExceptions(noop);
    await expect(
      mw.call(
        postEnv(
          { error: "", action: "Inexistent action", location: "/" },
          { "action_dispatch.show_detailed_exceptions": true },
        ),
      ),
    ).rejects.toBeInstanceOf(NonActionable);
  });

  it("catches invalid redirections", async () => {
    const mw = new ActionableExceptions(noop);
    const res = await mw.call(
      postEnv(
        { error: ActionError.name, action: "Successful action", location: "wss://example.com" },
        { "action_dispatch.show_detailed_exceptions": true },
      ),
    );
    expect(res[0]).toBe(400);
  });
});
