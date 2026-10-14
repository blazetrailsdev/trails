import { describe, it, expect } from "vitest";
import type { RackEnv } from "@blazetrails/rack";
import {
  KEY,
  FlashHash,
  type FlashRequestHost,
  commitFlash,
  RequestMethods,
  resetSession,
} from "./flash.js";

function makeSession(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  let enabled = true;
  let loaded = true;
  return {
    isEnabled: () => enabled,
    isLoaded: () => loaded,
    isKey: (k: string) => store.has(k),
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

function makeHost(initial: Record<string, unknown> = {}): FlashRequestHost &
  RequestMethods & {
    session: ReturnType<typeof makeSession>;
  } {
  const env: RackEnv = {};
  return Object.setPrototypeOf(
    {
      env,
      getHeader: (k: string) => env[k],
      setHeader: (k: string, v: unknown) => (env[k] = v),
      session: makeSession(initial),
    },
    RequestMethods.prototype,
  );
}

describe("Flash::RequestMethods", () => {
  it("flash builds from session on first access", () => {
    const host = makeHost({ flash: { flashes: { notice: "hi" }, discard: [] } });
    const f = host.flash!;
    expect(f.get("notice")).toBe("hi");
    expect(host.env[KEY]).toBe(f);
  });

  it("flash setter stores the value and a subsequent get returns it (no session rebuild)", () => {
    const host = makeHost({ flash: { flashes: { stale: "old" }, discard: [] } });
    const fresh = new FlashHash({ notice: "fresh" });
    host.flash = fresh;
    expect(host.flash).toBe(fresh);
    expect(host.flash.get("notice")).toBe("fresh");
  });

  it("flashHash returns null when flash has not been touched", () => {
    const host = makeHost();
    expect(host.flashHash()).toBeNull();
  });

  it("commitFlash writes toSessionValue into the session and replaces the cache with a dup", () => {
    const host = makeHost();
    const f = new FlashHash({ notice: "hi", drop: "x" });
    f.discard("drop");
    host.flash = f;

    commitFlash.call(host);

    expect(host.session._store.get("flash")).toEqual({ discard: [], flashes: { notice: "hi" } });
    const cached = host.flashHash();
    expect(cached).not.toBe(f);
    expect(cached!.get("notice")).toBe("hi");
  });

  it("commitFlash deletes session['flash'] when the projected hash is empty", () => {
    const host = makeHost({ flash: { flashes: { gone: "x" } } });
    const f = host.flash!;
    f.discard("gone");

    commitFlash.call(host);

    expect(host.session._store.has("flash")).toBe(false);
  });

  it("commitFlash is a no-op when session is disabled", () => {
    const host = makeHost();
    host.session._setEnabled(false);
    const f = new FlashHash({ notice: "hi" });
    host.flash = f;

    commitFlash.call(host);

    expect(host.session._store.has("flash")).toBe(false);
  });

  it("resetSession clears the cached flash hash", () => {
    const host = makeHost();
    host.flash = new FlashHash({ notice: "hi" });
    resetSession.call(host);
    expect(host.env[KEY]).toBeNull();
  });
});
