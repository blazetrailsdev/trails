import { beforeEach, describe, expect, it } from "vitest";

import type { PersistedRequest } from "./index.js";
import { Persisted, SecureSessionHash, SessionId } from "./index.js";

describe("Rack::Session::Abstract::PersistedSecure::SecureSessionHash", () => {
  let hash: SecureSessionHash;

  function store(id: unknown, session: Record<string, unknown>): Persisted {
    return {
      loadSession: () => [id, session],
      sessionExists: () => true,
    } as unknown as Persisted;
  }

  beforeEach(() => {
    hash = new SecureSessionHash(
      store(new SessionId("id"), { foo: ":bar", baz: ":qux" }),
      null as unknown as PersistedRequest,
    );
  });

  it("returns keys", () => {
    expect(hash.keys()).toEqual(["foo", "baz"]);
  });

  it("returns values", () => {
    expect(hash.values()).toEqual([":bar", ":qux"]);
  });

  describe("#[]", () => {
    it("returns value for a matching key", () => {
      expect(hash.get("foo")).toBe(":bar");
    });

    it("returns value for a 'session_id' key", () => {
      expect(hash.get("session_id")).toBe("id");
    });

    it("returns nil value for missing 'session_id' key", () => {
      hash = new SecureSessionHash(store(null, {}), null as unknown as PersistedRequest);
      expect(hash.get("session_id")).toBeNull();
    });

    it("returns value for non SessionId 'session_id' key", () => {
      hash = new SecureSessionHash(store("id", {}), null as unknown as PersistedRequest);
      expect(hash.get("session_id")).toBe("id");
    });
  });

  describe("#fetch", () => {
    it("returns value for a matching key", () => {
      expect(hash.fetch("foo")).toBe(":bar");
    });

    it("works with a default value", () => {
      expect(hash.fetch("unknown", ":default")).toBe(":default");
    });

    it("works with a block", () => {
      expect(hash.fetch("unknown", undefined, () => ":default")).toBe(":default");
    });

    it("it raises when fetching unknown keys without defaults", () => {
      expect(() => hash.fetch("unknown")).toThrow('key not found: "unknown"');
    });
  });

  describe("#stringify_keys", () => {
    it("returns hash or session hash with keys stringified", () => {
      expect(hash.stringifyKeys(hash)).toEqual({ foo: ":bar", baz: ":qux" });
    });
  });
});
