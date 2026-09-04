import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { RACK_SESSION, RACK_SESSION_OPTIONS, ResponseRaw } from "@blazetrails/rack";
import { StringIO } from "@blazetrails/ruby-compat";
import { Request } from "@blazetrails/rack";
import { setVerbose } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";

import type { PersistedRequest, PersistedSession } from "../index.js";
import {
  DEFAULT_OPTIONS,
  Persisted,
  PersistedSecure,
  SecureSessionHash,
  SessionHash,
  SessionId,
} from "../index.js";

function stubRequest(): PersistedRequest {
  return {
    env: {},
    cookies: {},
    params: {},
    getHeader: () => undefined as unknown as PersistedSession,
    setHeader: () => {},
    sessionOptions: {},
  };
}

function stubStore(
  id: unknown = "id",
  session: Record<string, unknown> = { foo: ":bar", baz: ":qux", x: { y: 1 } },
): Persisted {
  return {
    loadSession: () => [id, session],
    sessionExists: () => true,
  } as unknown as Persisted;
}

describe("Rack::Session::SessionId", () => {
  it("private_id is versioned and hashed", () => {
    const sid = new SessionId("a".repeat(32));
    expect(sid.privateId).toMatch(/^2::[0-9a-f]{64}$/);
  });

  it("cookie_value and to_s answer the public id", () => {
    const sid = new SessionId("abc");
    expect(sid.cookieValue).toBe("abc");
    expect(String(sid)).toBe("abc");
  });

  it("empty? is always false", () => {
    expect(new SessionId("").isEmpty()).toBe(false);
  });
});

describe("Rack::Session::Abstract::Persisted", () => {
  it("deletes key, cookie_only and same_site out of the default options", () => {
    const store = new Persisted(undefined, { key: "_sid", sameSite: "lax" });
    expect(store.key).toBe("_sid");
    expect(store.sameSite).toBe("lax");
    expect(store.defaultOptions).not.toHaveProperty("key");
    expect(store.defaultOptions).not.toHaveProperty("cookieOnly");
    expect(store.defaultOptions).not.toHaveProperty("sameSite");
    expect(store.defaultOptions.path).toBe(DEFAULT_OPTIONS.path);
  });

  it("find_session is not implemented", () => {
    expect(() => new Persisted().findSession(stubRequest(), null)).toThrow(
      "#find_session not implemented.",
    );
  });
});

describe("Rack::Session::Abstract::PersistedSecure", () => {
  it("generate_sid wraps the hex sid in a SessionId", () => {
    const sid = new PersistedSecure().generateSid();
    expect(sid).toBeInstanceOf(SessionId);
    expect(sid.publicId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generate_sid takes the rand arm when :secure_random is false", () => {
    const store = new PersistedSecure(undefined, { secureRandom: false });
    expect(store.generateSid().publicId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("extract_session_id answers the falsy public id itself", () => {
    const store = new PersistedSecure(undefined, { cookieOnly: true });
    expect(store.extractSessionId(stubRequest())).toBeNull();
  });

  it("cookie_value reads cookie_value off the written data", () => {
    const sid = new SessionId("xyz");
    expect(new PersistedSecure().cookieValue(sid)).toBe("xyz");
  });
});

describe("Rack::Session::Abstract::SessionHash", () => {
  function sessionHash(session: Record<string, unknown> = { foo: ":bar" }): SessionHash {
    return new SessionHash(stubStore("id", session), null as unknown as PersistedRequest);
  }

  it("fetch answers a stored null rather than the default", () => {
    expect(sessionHash({ foo: null }).fetch("foo", ":default")).toBeNull();
  });

  it("fetch reads an explicitly passed undefined default as a default, not an omission", () => {
    expect(sessionHash().fetch("unknown", undefined)).toBeUndefined();
  });

  it("inspect renders the not-yet-loaded form until the store is read", () => {
    const hash = sessionHash();
    expect(hash.inspect()).toMatch(
      /^#<Rack::Session::Abstract::SessionHash:0x[0-9a-f]+ not yet loaded>$/,
    );
    hash.loadBang();
    expect(hash.inspect()).toBe('{"foo"=>:bar}');
  });

  it("id memoizes the seat, so a null extracted id is asked for once", () => {
    let calls = 0;
    const store = {
      extractSessionId: () => {
        calls += 1;
        return null;
      },
    } as unknown as Persisted;
    const hash = new SessionHash(store, null as unknown as PersistedRequest);
    expect(hash.id()).toBeNull();
    expect(hash.id()).toBeNull();
    expect(calls).toBe(1);
  });
});

describe("Rack::Session::Abstract::Persisted", () => {
  it("session_class answers SessionHash, and SecureSessionHash on PersistedSecure", () => {
    expect(new Persisted().sessionClass()).toBe(SessionHash);
    expect(new PersistedSecure().sessionClass()).toBe(SecureSessionHash);
    expect(PersistedSecure.SecureSessionHash).toBe(SecureSessionHash);
  });
});

describe("Rack::Session::Abstract::PersistedSecure::SecureSessionHash", () => {
  it("inspect names the subclass's own full constant path", () => {
    const hash = new SecureSessionHash(stubStore(), null as unknown as PersistedRequest);
    expect(hash.inspect()).toMatch(
      /^#<Rack::Session::Abstract::PersistedSecure::SecureSessionHash:0x[0-9a-f]+ not yet loaded>$/,
    );
  });
});

describe("Rack::Session::Abstract::Persisted#call", () => {
  class TestStore extends Persisted {
    written: Array<[unknown, Record<string, unknown>]> = [];

    override findSession(): [unknown, Record<string, unknown>] {
      return ["sid", { counter: 1 }];
    }

    override writeSession(
      _req: PersistedRequest,
      sid: unknown,
      session: Record<string, unknown>,
    ): unknown {
      this.written.push([sid, session]);
      return sid;
    }

    override deleteSession(): unknown {
      return this.generateSid();
    }
  }

  const app = async (env: RackEnv): Promise<RackResponse> => {
    (env["rack.session"] as SessionHash).set("counter", 2);
    return [200, {}, bodyFromString("")];
  };

  it("commits the session through the plain options hash the request seats", async () => {
    const store = new TestStore(app, { expireAfter: 60 });
    const [status, headers] = await store.call({ HTTP_COOKIE: "rack.session=sid" });

    expect(status).toBe(200);
    expect(store.written).toEqual([["sid", { counter: 2 }]]);
    expect(String(headers["set-cookie"])).toMatch(/rack\.session=sid/);
  });

  it("merges the options through to_hash, the way cookie.merge! converts", async () => {
    const store = new TestStore(app);
    const seat = {
      delegate: { path: "/deep", id: "stored" } as Record<string, unknown>,
      toHash(): Record<string, unknown> {
        return { ...this.delegate };
      },
    };
    const cookies: Array<Record<string, unknown>> = [];
    store.setCookie = (_req, _res, cookie) => {
      cookies.push(cookie);
    };
    const req = store.makeRequest({ HTTP_COOKIE: "rack.session=sid" });
    store.prepareSession(req);
    req.setHeader(RACK_SESSION_OPTIONS, seat);
    (req.getHeader(RACK_SESSION) as unknown as SessionHash).set("counter", 2);
    store.commitSession(req, new ResponseRaw(200, {}));

    expect(cookies[0]?.["path"]).toBe("/deep");
    expect(cookies[0]?.["id"]).toBe("stored");
  });

  it("skips the commit when the session options carry skip", async () => {
    const store = new TestStore(app, { skip: true });
    await store.call({ HTTP_COOKIE: "rack.session=sid" });
    expect(store.written).toEqual([]);
  });

  describe("commit_session deferral notice", () => {
    afterEach(() => {
      setVerbose(false);
    });

    function deferredCommit(): StringIO {
      const errors = new StringIO();
      const env: Record<string, unknown> = { "rack.errors": errors };
      const req = new Request(env) as unknown as PersistedRequest;
      const store = new Persisted(undefined, { defer: true });
      store.writeSession = () => "data";
      const backing = {
        loadSession: () => ["sid", {}],
        sessionExists: () => true,
      } as unknown as Persisted;
      const session = (env["rack.session"] = new SessionHash(backing, req));
      session.set("foo", "bar");
      req.setHeader(RACK_SESSION_OPTIONS, { defer: true });
      store.commitSession(req, new ResponseRaw(200, {}));
      errors.rewind();
      return errors;
    }

    it("stays silent while $VERBOSE is false", () => {
      expect(deferredCommit().read()).toBe("");
    });

    it("writes to rack.errors while $VERBOSE is true", () => {
      setVerbose(true);
      expect(deferredCommit().read()).toBe("Deferring cookie for sid\n");
    });
  });
});
