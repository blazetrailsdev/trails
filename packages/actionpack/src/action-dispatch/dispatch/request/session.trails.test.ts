import { describe, it, expect, vi } from "vitest";
import { DisabledSessionError, Options, Session } from "../../request/session.js";

function makeReq(): { env: Record<string, unknown> } {
  return { env: {} };
}

// ==========================================================================
// No Rails counterpart: session_test.rb exercises `Session` only through a
// store-backed session, so the `enabled?` arms of `destroy` / `load_for_write!`
// (request/session.rb:97-108, :257-263) and `Session.delete` (:43-45) have no
// Rails test of their own.
// ==========================================================================
describe("Session::Options", () => {
  it("answers the Hash-shaped reads Rack::Session::Abstract::Persisted makes", () => {
    const options = new Options(null, { skip: true, expireAfter: 60 });

    expect(options["skip"]).toBe(true);
    expect(["maxAge", "renew", "drop", "defer", "expireAfter"].map((k) => options[k])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      60,
    ]);
    expect({ ...options }).toEqual({ skip: true, expireAfter: 60 });
    expect(options.get("skip")).toBe(true);
  });
});

describe("Session", () => {
  it("destroy on a disabled session touches no store", () => {
    const req = makeReq();
    const session = Session.disabled(req);
    session.destroy();
    expect(session.isEmpty()).toBe(true);
  });

  it("write to a disabled session raises DisabledSessionError", () => {
    const req = makeReq();
    const session = Session.disabled(req);
    expect(() => session.set("foo", "bar")).toThrow(DisabledSessionError);
  });

  it("destroy deletes the session through the store and reloads the new sid", () => {
    const req = makeReq();
    const deleteSession = vi.fn().mockReturnValue(2);
    const store = {
      loadSession: () => [1, { foo: "bar" }] as [unknown, Record<string, unknown>],
      sessionExists: () => true,
      deleteSession,
      extractSessionId: () => 1,
    };
    const session = Session.create(store, req, { key: "_session_id" });

    session.destroy();

    expect(deleteSession).toHaveBeenCalledWith(req, 1, Options.find(req));
    expect(session.isLoaded()).toBe(true);
  });

  it("update raises TypeError for a value that does not convert to a Hash", () => {
    const req = makeReq();
    const store = {
      loadSession: () => [1, {}] as [unknown, Record<string, unknown>],
      sessionExists: () => true,
      deleteSession: () => null,
      extractSessionId: () => 1,
    };
    const session = Session.create(store, req, {});

    expect(() => session.update(null)).toThrow("no implicit conversion of NilClass into Hash");
    expect(() => session.update([1, 2])).toThrow("no implicit conversion of Array into Hash");
  });

  it("delete removes the session from the request", () => {
    const req = makeReq();
    Session.disabled(req);
    expect(Session.find(req)).toBeNull();

    Session.set(req, Session.disabled(req));
    expect(Session.find(req)).not.toBeNull();

    Session.delete(req);
    expect(Session.find(req)).toBeNull();
  });

  it("inspect reports a not yet loaded session without loading it", () => {
    const req = makeReq();
    const loadSession = vi.fn(() => [1, {}] as [unknown, Record<string, unknown>]);
    const store = {
      loadSession,
      sessionExists: () => true,
      deleteSession: () => null,
      extractSessionId: () => 1,
    };
    const session = Session.create(store, req, {});

    expect(session.inspect()).toMatch(
      /^#<ActionDispatch::Request::Session:0x[0-9a-f]+ not yet loaded>$/,
    );
    expect(loadSession).not.toHaveBeenCalled();
    expect(session.isLoaded()).toBe(false);

    session.get("foo");
    expect(session.inspect()).toMatch(/^#<ActionDispatch::Request::Session:0x[0-9a-f]+>$/);
  });
});
