import { describe, it, expect } from "vitest";
import { Session, type SessionStore } from "./session.js";

function makeStore(opts: { exists?: boolean; data?: Record<string, unknown> } = {}): SessionStore {
  const exists = opts.exists ?? true;
  const data = opts.data ?? {};
  return {
    loadSession() {
      return [1, { ...data }];
    },
    sessionExists() {
      return exists;
    },
    deleteSession() {
      return 123;
    },
  };
}

function makeReq(): { env: Record<string, unknown> } {
  return { env: {} };
}

// ==========================================================================
// dispatch/request/session_test.rb
// ==========================================================================
describe("Request", () => {
  describe("SessionTest", () => {
    it("create adds itself to env", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      expect(s).toBe(req.env["rack.session"]);
    });

    it("to hash", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("foo", "bar");
      expect(s.get("foo")).toBe("bar");
      expect(s.toHash()).toEqual({ foo: "bar" });
      expect(s.toH()).toEqual({ foo: "bar" });
    });

    it("create merges old", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("foo", "bar");

      const s1 = Session.create(makeStore(), req);
      expect(s1).not.toBe(s);
      expect(s1.get("foo")).toBe("bar");
    });

    it("find", () => {
      const req = makeReq();
      expect(Session.find(req)).toBeNull();

      const s = Session.create(makeStore(), req);
      expect(Session.find(req)).toBe(s);
    });

    it("destroy", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.destroy();
      expect(s.empty).toBe(true);
    });

    it("store", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.store_value("foo", "bar");
      expect(s.get("foo")).toBe("bar");
    });

    it("keys", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.keys).toEqual(["rails", "adequate"]);
    });

    it("keys with deferred loading", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ data: { sample_key: "sample_value" } }), req);
      expect(s.keys).toEqual(["sample_key"]);
    });

    it("values", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.values).toEqual(["ftw", "awesome"]);
    });

    it("values with deferred loading", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ data: { sample_key: "sample_value" } }), req);
      expect(s.values).toEqual(["sample_value"]);
    });

    it("clear", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      s.clear();
      expect(s.values).toEqual([]);
    });

    it("update", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.update({ rails: "awesome" });
      expect(s.keys).toEqual(["rails"]);
      expect(s.get("rails")).toBe("awesome");
    });

    it("delete", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("rails", "ftw");
      s.delete("rails");
      expect(s.keys).toEqual([]);
    });

    it("fetch", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("one", "1");
      expect(s.fetch("one")).toBe("1");
      expect(s.fetch("two", "2")).toBe("2");
      expect(s.fetch("two", null)).toBeNull();
      expect(s.fetch("three", (el: string) => el.toString())).toBe("three");
      expect(() => s.fetch("three")).toThrow();
    });

    it("dig", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("one", { two: "3" });
      expect(s.dig("one", "two")).toBe("3");
      expect(s.dig("three", "two")).toBeUndefined();
      expect(s.dig("one", "three")).toBeUndefined();
    });

    it("id was for new session that does not exist", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req);
      expect(s.idWas).toBeNull();
    });

    it("id was for session that does not exist after writing", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req);
      s.set("one", "1");
      expect(s.idWas).toBeNull();
    });

    it("id was for session that does not exist after destroying", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req);
      s.destroy();
      expect(s.idWas).toBeNull();
    });

    it("id was for existing session", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      expect(s.idWas).toBe(1);
    });

    it("id was for existing session after write", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.set("one", "1");
      expect(s.idWas).toBe(1);
    });

    it("id was for existing session after destroy", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req);
      s.destroy();
      expect(s.idWas).toBe(1);
    });
  });
});
