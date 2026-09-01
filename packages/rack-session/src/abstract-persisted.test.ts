import { StringIO } from "@blazetrails/activesupport";
import { Request, ResponseRaw } from "@blazetrails/rack";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";

import type { PersistedRequest, PersistedSession } from "./index.js";
import { Persisted, SessionHash } from "./index.js";

const request = (env: Record<string, unknown> = {}): PersistedRequest =>
  new Request(env) as unknown as PersistedRequest;

describe("Rack::Session::Abstract::Persisted", () => {
  let klass: typeof Persisted;
  let pers: Persisted;

  beforeEach(() => {
    klass = Persisted;
    pers = new klass(undefined);
  });

  it("#generated_sid generates a session identifier", () => {
    expect(pers.generateSid()).toMatch(/^[0-9a-fA-F]+$/);
    expect(pers.generateSid(null)).toMatch(/^[0-9a-fA-F]+$/);

    const obj = {
      hex(_: number): string {
        throw new NotImplementedError();
      },
    };
    expect(pers.generateSid(obj)).toMatch(/^[0-9a-fA-F]+$/);
  });

  it("#commit_session? returns false if :skip option is given", () => {
    expect(pers.isCommitSession(request(), {} as unknown as PersistedSession, { skip: true })).toBe(
      false,
    );
  });

  it("#commit_session writes to rack.errors if session cannot be written", () => {
    pers = new klass(undefined);
    pers.writeSession = () => undefined;
    const errors = new StringIO();
    const env: Record<string, unknown> = { "rack.errors": errors };
    const req = request(env);
    const store = {
      loadSession: () => ["id", {}],
      sessionExists: () => true,
    } as unknown as Persisted;
    const session = (env["rack.session"] = new SessionHash(store, req));
    session.set("foo", "bar");
    pers.commitSession(req, new ResponseRaw(200, {}));
    errors.rewind();
    expect(errors.read()).toBe(
      "Warning! Rack::Session::Abstract::Persisted failed to save session. Content dropped.\n",
    );
  });

  it("#cookie_value returns its argument", () => {
    const obj = {};
    expect(pers.cookieValue(obj)).toBe(obj);
  });

  it("#session_class returns the default session class", () => {
    expect(pers.sessionClass()).toBe(SessionHash);
  });

  it("#find_session raises", () => {
    expect(() => pers.findSession(null as never, null)).toThrow(Error);
  });

  it("#write_session raises", () => {
    expect(() => pers.writeSession(null as never, null, null as never, null as never)).toThrow(
      Error,
    );
  });

  it("#delete_session raises", () => {
    expect(() => pers.deleteSession(null as never, null, null as never)).toThrow(Error);
  });

  describe("#security_matches?", () => {
    it("#security_matches? returns true if secure cookie is off", () => {
      expect(pers.isSecurityMatches(new Request({}) as unknown as PersistedRequest, {})).toBe(true);
    });

    it("#security_matches? returns true if ssl is on", () => {
      const req = new Request({});
      req.setHeader("HTTPS", "on");
      expect(pers.isSecurityMatches(req as unknown as PersistedRequest, { secure: true })).toBe(
        true,
      );
    });

    it("#security_matches? returns true if assume_ssl option is set", () => {
      const req = request();
      const persWithPersist = new klass(undefined, { assumeSsl: true });
      expect(persWithPersist.isSecurityMatches(req, { secure: true })).toBe(true);
    });

    it("#security_matches? returns false if secure cookie is on, but not ssl or assume_ssl", () => {
      expect(pers.isSecurityMatches(request(), { secure: true })).toBe(false);
    });
  });
});
