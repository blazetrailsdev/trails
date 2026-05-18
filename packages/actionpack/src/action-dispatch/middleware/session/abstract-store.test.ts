import { describe, expect, it } from "vitest";

import {
  AbstractSecureStore,
  AbstractStore,
  Compatibility,
  SessionObject,
  SessionRestoreError,
  StaleSessionCheck,
} from "./abstract-store.js";

describe("ActionDispatch::Session::AbstractStore", () => {
  describe("Compatibility", () => {
    it("defaults the cookie key to _session_id", () => {
      const opts: Record<string, unknown> = {};
      Compatibility.initialize.call({ key: "", defaultOptions: {} }, () => {}, opts);
      expect(opts.key).toBe("_session_id");
    });

    it("does not override an explicit key", () => {
      const opts: Record<string, unknown> = { key: "_app_sid" };
      Compatibility.initialize.call({ key: "", defaultOptions: {} }, () => {}, opts);
      expect(opts.key).toBe("_app_sid");
    });

    it("generates a 32-char hex SID", () => {
      const sid = Compatibility.generateSid.call({});
      expect(sid).toMatch(/^[0-9a-f]{32}$/);
    });

    it("initializeSid strips deprecated keys from default options", () => {
      const host = { key: "_session_id", defaultOptions: { sidbits: 128, secureRandom: 1 } };
      Compatibility.initializeSid.call(host);
      expect(host.defaultOptions).toEqual({});
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

  describe("classes", () => {
    it("AbstractStore.setCookie writes to the request cookie jar at @key", () => {
      const store = new AbstractStore();
      const req = { env: {}, cookieJar: {} as Record<string, unknown> };
      store.setCookie(req, null, "abc");
      expect(req.cookieJar._session_id).toBe("abc");
    });

    it("AbstractSecureStore.generateSid returns a 32-char hex string", () => {
      const sid = new AbstractSecureStore().generateSid();
      expect(typeof sid).toBe("string");
      expect(sid as string).toMatch(/^[0-9a-f]{32}$/);
    });

    it("SessionObject.loadedSession returns true for non-Session inputs", () => {
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
