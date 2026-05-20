import { describe, it, expect } from "vitest";
import type { RackEnv } from "@blazetrails/rack";
import {
  FLASH_KEY,
  FlashHash,
  type FlashRequestHost,
  commitFlash,
  flash,
  flashHash,
  resetSession,
} from "./flash.js";

function makeSession(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  let enabled = true;
  let loaded = true;
  return {
    isEnabled: () => enabled,
    isLoaded: () => loaded,
    hasKey: (k: string) => store.has(k),
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => {
      store.set(k, v);
    },
    delete: (k: string) => {
      store.delete(k);
    },
    _store: store,
    _setEnabled: (v: boolean) => {
      enabled = v;
    },
    _setLoaded: (v: boolean) => {
      loaded = v;
    },
  };
}

function makeHost(initial: Record<string, unknown> = {}): FlashRequestHost & {
  session: ReturnType<typeof makeSession>;
} {
  const env: RackEnv = {};
  return { env, session: makeSession(initial) };
}

describe("Flash::RequestMethods", () => {
  it("flash builds from session on first access", () => {
    const host = makeHost({ flash: { flashes: { notice: "hi" }, discard: [] } });
    const f = flash.call(host)!;
    expect(f.get("notice")).toBe("hi");
    expect(host.env[FLASH_KEY]).toBe(f);
  });

  it("flash setter stores the value and a subsequent get returns it (no session rebuild)", () => {
    const host = makeHost({ flash: { flashes: { stale: "old" }, discard: [] } });
    const fresh = new FlashHash({ notice: "fresh" });
    flash.call(host, fresh);
    expect(flash.call(host)).toBe(fresh);
    expect(flash.call(host)!.get("notice")).toBe("fresh");
  });

  it("flashHash returns null when flash has not been touched", () => {
    const host = makeHost();
    expect(flashHash.call(host)).toBeNull();
  });

  it("commitFlash writes flashesForSession into the session and replaces the cache with a dup", () => {
    const host = makeHost();
    const f = new FlashHash({ notice: "hi", drop: "x" });
    f.discard("drop");
    flash.call(host, f);

    commitFlash.call(host);

    expect(host.session._store.get("flash")).toEqual({ notice: "hi" });
    const cached = flashHash.call(host);
    expect(cached).not.toBe(f);
    expect(cached!.get("notice")).toBe("hi");
  });

  it("commitFlash deletes session['flash'] when the projected hash is empty", () => {
    const host = makeHost({ flash: { flashes: { gone: "x" } } });
    // Mark gone for discard so flashesForSession returns {}
    const f = flash.call(host)!;
    f.discard("gone");

    commitFlash.call(host);

    expect(host.session._store.has("flash")).toBe(false);
  });

  it("commitFlash is a no-op when session is disabled", () => {
    const host = makeHost();
    host.session._setEnabled(false);
    const f = new FlashHash({ notice: "hi" });
    flash.call(host, f);

    commitFlash.call(host);

    expect(host.session._store.has("flash")).toBe(false);
  });

  it("resetSession clears the cached flash hash", () => {
    const host = makeHost();
    flash.call(host, new FlashHash({ notice: "hi" }));
    resetSession.call(host);
    expect(host.env[FLASH_KEY]).toBeNull();
  });
});
