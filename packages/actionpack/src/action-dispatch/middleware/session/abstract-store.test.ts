import { describe, expect, it } from "vitest";

import { ResponseRaw } from "@blazetrails/rack";

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
      expect(host.defaultOptions).not.toHaveProperty("sidbits");
      expect(host.defaultOptions).not.toHaveProperty("secureRandom");
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
        "isLoadedSession",
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
      const req: any = new Request({});
      req.commitCsrfToken = () => {
        called = true;
      };
      (store as any).prepareSession(req);
      (store as any).commitSession(req, { setCookie: () => {} });
      expect(called).toBe(true);
    });

    it("commitSession expires the cookie at Time.now + expire_after", () => {
      let cookie: any;
      class WritingStore extends AbstractStore {
        override findSession(): [unknown, Record<string, unknown>] {
          return [new SessionId("abc"), {}];
        }
        override writeSession(): unknown {
          return { ok: true };
        }
        override setCookie(_req: any, _res: any, c: any): void {
          cookie = c;
        }
      }
      const store = new WritingStore(undefined, { expireAfter: 60 });
      const req: any = new Request({});
      (store as any).prepareSession(req);
      req.session.set("user", 1);

      (store as any).commitSession(req, { setCookie: () => {} });

      expect(cookie.expires).toBeInstanceOf(Date);
      const deltaMs = (cookie.expires as Date).getTime() - Date.now();
      expect(deltaMs).toBeGreaterThan(55_000);
      expect(deltaMs).toBeLessThanOrEqual(60_000);
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

  describe("security_matches?", () => {
    const calls: Array<[unknown, unknown]> = [];

    class SecureWritingStore extends AbstractStore {
      override findSession(): [unknown, Record<string, unknown>] {
        return [new SessionId("abc"), {}];
      }
      override writeSession(): unknown {
        return "written";
      }
      override setCookie(_request: any, response: unknown, cookie: unknown): void {
        calls.push([response, cookie]);
      }
    }

    async function runOver(urlScheme: string): Promise<void> {
      calls.length = 0;
      const store = new SecureWritingStore(undefined, { secure: true });
      await (store as any).context({ "rack.url_scheme": urlScheme }, async (env: any) => {
        env["rack.session"].set("user", 1);
        return [200, {}, []];
      });
    }

    it("commits the session over https", async () => {
      await runOver("https");
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBeInstanceOf(ResponseRaw);
    });

    it("does not commit the session over http", async () => {
      await runOver("http");
      expect(calls.length).toBe(0);
    });

    it("set_cookie writes the session cookie onto the response headers", () => {
      const headers: Record<string, string> = {};
      const res = new ResponseRaw(200, headers);
      Persisted.prototype.setCookie.call(new Persisted(), { cookies: {} }, res, {
        value: "abc",
        path: "/",
        httponly: true,
      });
      expect(headers["set-cookie"]).toBe("rack.session=abc; path=/; httponly");
    });
  });

  describe("SessionObject.isLoadedSession", () => {
    it("returns true for non-Session inputs", () => {
      expect(SessionObject.isLoadedSession.call({}, {})).toBe(true);
    });
  });
});

class ArgumentErrorLike extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ArgumentError";
  }
}
