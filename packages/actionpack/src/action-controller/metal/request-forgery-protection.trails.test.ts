import { describe, expect, it } from "vitest";

import { CookieJar, cookieJar } from "../../action-dispatch/middleware/cookies.js";
import { Session } from "../../action-dispatch/request/session.js";
import {
  NullCookieJar,
  NullSession,
  NullSessionHash,
  type NullSessionRequest,
} from "./request-forgery-protection.js";

function buildRequest(): NullSessionRequest {
  const env: Record<string, unknown> = {};
  return {
    env,
    getHeader: (name: string) => env[name],
    hasHeader: (name: string) => name in env,
    cookies: {},
    session: undefined,
    flash: { note: "hi" },
    sessionOptions: {},
  } as unknown as NullSessionRequest;
}

describe("NullSession", () => {
  it("handle_unverified_request writes the null session, flash, options and cookie jar onto the request", () => {
    const request = buildRequest();
    new NullSession({ request }).handleUnverifiedRequest();

    expect(request.session).toBeInstanceOf(NullSessionHash);
    expect(request.flash).toBeNull();
    expect(request.sessionOptions).toEqual({ skip: true });
    expect(cookieJar.call(request)).toBeInstanceOf(NullCookieJar);
  });

  it("NullSessionHash is a loaded, existing, disabled session that ignores destroy", () => {
    const hash = new NullSessionHash(buildRequest());

    expect(hash).toBeInstanceOf(Session);
    expect(hash.isLoaded()).toBe(true);
    expect(hash.isExists()).toBe(true);
    expect(hash.isEnabled()).toBe(false);
    expect(() => hash.destroy()).not.toThrow();
  });

  it("NullCookieJar writes nothing", () => {
    const jar = NullCookieJar.build(buildRequest(), {});
    jar.set("user_name", "david");

    expect(jar).toBeInstanceOf(CookieJar);
    jar.write();
    expect(jar.getSetCookieHeaders()).toEqual([]);
  });
});
