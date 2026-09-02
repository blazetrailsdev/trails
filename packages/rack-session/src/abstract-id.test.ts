import type { RackEnv } from "@blazetrails/rack";
import { Request } from "@blazetrails/rack";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import type { PersistedRequest } from "./index.js";
import { ID } from "./index.js";

const request = (env: Record<string, unknown> = {}): PersistedRequest =>
  new Request(env) as unknown as PersistedRequest;

describe("Rack::Session::Abstract::ID", () => {
  it("use securerandom", () => {
    expect(ID.DEFAULT_OPTIONS["secureRandom"]).toBe(SecureRandom);

    const id = new ID(undefined);
    expect(id.sidSecure).toBe(SecureRandom);
  });

  it("allow to use another securerandom provider", () => {
    const secureRandom = class {
      hex(..._args: unknown[]): string {
        return "fake_hex";
      }
    };
    const id = new ID(undefined, { secureRandom: new secureRandom() });
    expect(id.generateSid()).toBe("fake_hex");
  });

  it.skip("should warn when subclassing", () => {
    // PERMANENT-SKIP: Ruby's `self.inherited` hook fires when a subclass is defined; JS has no such hook
  });

  it("#find_session should find session in request", () => {
    const id = new ID(undefined);
    (id as unknown as { getSession: unknown }).getSession = (env: RackEnv) => [
      env["rack.session"],
      id.generateSid(),
    ];
    const req = request({ "rack.session": {} });
    const [session, sid] = id.findSession(req, null);
    expect(session).toEqual({});
    expect(sid).toMatch(/^[0-9a-fA-F]+$/);
  });

  it("#write_session should write session to request", () => {
    const id = new ID(undefined);
    (id as unknown as { setSession: unknown }).setSession = (
      env: RackEnv,
      sid: unknown,
      session: unknown,
      options: unknown,
    ) => [env, sid, session, options];
    const req = new Request({});
    expect(id.writeSession(req as unknown as PersistedRequest, 1, 2 as never, 3 as never)).toEqual([
      {},
      1,
      2,
      3,
    ]);
  });

  it("#delete_session should remove session from request", () => {
    const id = new ID(undefined);
    (id as unknown as { destroySession: unknown }).destroySession = (
      env: RackEnv,
      sid: unknown,
      options: unknown,
    ) => [env, sid, options];
    const req = new Request({});
    expect(id.deleteSession(req as unknown as PersistedRequest, 1, 2 as never)).toEqual([{}, 1, 2]);
  });
});
