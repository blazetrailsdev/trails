import { describe, expect, it } from "vitest";

import { Request } from "../../request.js";
import { Session as RequestSession } from "../../request/session.js";
import {
  AbstractSecureStore,
  AbstractStore,
  Compatibility,
  Persisted,
  PersistedSecure,
  SessionId,
  SessionObject,
  SessionRestoreError,
  StaleSessionCheck,
} from "./abstract-store.js";

describe("ActionDispatch::Session::AbstractStore", () => {
  describe("Compatibility", () => {
    it("defaults the cookie key to _session_id", () => {
      const opts: Record<string, unknown> = {};
      Compatibility.initialize.call(new Persisted(), () => {}, opts);
      expect(opts.key).toBe("_session_id");
    });

    it("does not override an explicit key", () => {
      const opts: Record<string, unknown> = { key: "_app_sid" };
      Compatibility.initialize.call(new Persisted(), () => {}, opts);
      expect(opts.key).toBe("_app_sid");
    });

    it("generates a 32-char hex SID", () => {
      expect(Compatibility.generateSid.call({})).toMatch(/^[0-9a-f]{32}$/);
    });

    it("initializeSid strips deprecated keys from default options", () => {
      const host = new Persisted();
      host.defaultOptions.sidbits = 128;
      host.defaultOptions.secureRandom = 1;
      Compatibility.initializeSid.call(host);
      expect(host.defaultOptions).toEqual({});
    });

    it("makeRequest builds an ActionDispatch::Request from env", () => {
      const env = { foo: "bar" };
      const req = Compatibility.makeRequest.call(null, env);
      expect(req).toBeInstanceOf(Request);
      expect(req.env.foo).toBe("bar");
    });
  });

  describe("SessionRestoreError", () => {
    it("wraps an inner exception's class + message", () => {
      const inner = new TypeError("undefined class/module Foo::Bar");
      const err = new SessionRestoreError(inner);
      expect(err).toBeInstanceOf(SessionRestoreError);
      expect(err.message).toContain("Foo::Bar");
      expect(err.message).toContain("TypeError");
    });
  });

  describe("StaleSessionCheck.staleSessionCheckBang", () => {
    it("passes through the block return value", () => {
      expect(StaleSessionCheck.staleSessionCheckBang(() => 42)).toBe(42);
    });

    it("re-raises non-class errors unchanged", () => {
      const err = new Error("some other failure");
      expect(() =>
        StaleSessionCheck.staleSessionCheckBang(() => {
          throw err;
        }),
      ).toThrow(err);
    });

    it("wraps undefined-class errors in SessionRestoreError", () => {
      expect(() =>
        StaleSessionCheck.staleSessionCheckBang(() => {
          throw new ArgumentErrorLike("undefined class/module Acme::Missing");
        }),
      ).toThrow(SessionRestoreError);
    });
  });

  describe("AbstractStore", () => {
    it("includes the three Rails mixins on its prototype", () => {
      const proto = AbstractStore.prototype as unknown as Record<string, unknown>;
      for (const name of [
        "initialize",
        "generateSid",
        "initializeSid",
        "makeRequest",
        "loadSession",
        "extractSessionId",
        "staleSessionCheckBang",
        "commitSession",
        "prepareSession",
        "loadedSession",
      ]) {
        expect(typeof proto[name]).toBe("function");
      }
    });

    it("setCookie writes to the request cookie jar at @key", () => {
      const store = new AbstractStore();
      const req = { cookieJar: {} as Record<string, unknown> };
      store.setCookie(req, null, "abc");
      expect(req.cookieJar._session_id).toBe("abc");
    });

    it("commitSession invokes commitCsrfToken on the request", () => {
      const store = new AbstractStore();
      let called = false;
      const req = {
        commitCsrfToken: () => {
          called = true;
        },
      };
      expect(() => (store as any).commitSession(req, null)).toThrow(/commitSession/);
      expect(called).toBe(true);
    });

    it("prepareSession wraps in ActionDispatch::Request::Session", () => {
      const store = new AbstractStore() as unknown as {
        prepareSession: (req: { env: Record<string, unknown> }) => RequestSession;
        sessionExists: (env: Record<string, unknown>) => boolean;
        loadSession: (env: Record<string, unknown>) => [unknown, Record<string, unknown>];
        deleteSession: (
          env: Record<string, unknown>,
          id: unknown,
          options: Record<string, unknown>,
        ) => unknown;
      };
      store.sessionExists = () => false;
      store.loadSession = () => [null, {}];
      store.deleteSession = () => null;
      const session = store.prepareSession({ env: {} });
      expect(session).toBeInstanceOf(RequestSession);
    });
  });

  describe("AbstractSecureStore", () => {
    it("includes the three Rails mixins on its prototype", () => {
      const proto = AbstractSecureStore.prototype as unknown as Record<string, unknown>;
      expect(typeof proto.loadSession).toBe("function");
      expect(typeof proto.commitSession).toBe("function");
      expect(typeof proto.makeRequest).toBe("function");
    });

    it("generateSid wraps the hex SID in a SessionId", () => {
      const sid = new AbstractSecureStore().generateSid();
      expect(sid).toBeInstanceOf(SessionId);
      expect(sid.publicId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("extends PersistedSecure", () => {
      expect(new AbstractSecureStore()).toBeInstanceOf(PersistedSecure);
    });
  });

  describe("SessionObject.loadedSession", () => {
    it("returns true for non-Session inputs", () => {
      expect(SessionObject.loadedSession.call({}, {})).toBe(true);
    });
  });
});

class ArgumentErrorLike extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ArgumentError";
  }
}
