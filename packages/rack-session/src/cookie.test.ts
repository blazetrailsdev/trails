import { describe, it } from "vitest";

describe("Rack::Session::Cookie", () => {
  it.skip("warns if no secret is given", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("abort if secret is too short", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("doesn't warn if coder is configured to handle encoding", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("still warns if coder is not set", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("uses a coder", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("creates a new cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("passes through same_site option to session cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("allows using a lambda to specify same_site option, because some browsers require different settings", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("loads from a cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("renew session id", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("destroys session", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("survives broken cookies", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("barks on too big cookies", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("loads from a cookie with encryption", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("loads from a cookie with accept-only integrity hash for graceful key rotation", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("loads from a legacy hmac cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("ignores tampered session cookies", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("rejects session cookie with different purpose", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("adds to RACK_ERRORS on encryptor errors", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("ignores tampered with legacy hmac cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("supports custom digest instance for legacy hmac cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("can handle Rack::Lint middleware", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("can handle middleware that inspects the env", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("returns the session id in the session hash", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("does not return a cookie if set to secure but not using ssl", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("does not return a cookie if cookie was not read/written", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("does not return a cookie if cookie was not written (only read)", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("returns even if not read/written if :expire_after is set", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("returns no cookie if no data was written and no session was created previously, even if :expire_after is set", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("exposes :secrets in env['rack.session.option']", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("exposes :coder in env['rack.session.option']", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("exposes correct :coder when a secrets is used", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("allows passing in a hash with session data from middleware in front", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("allows modifying session data with session data from middleware in front", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("allows more than one '--' in the cookie when calculating legacy digests", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  it.skip("allows for non-strict encoded cookie", () => {
    // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
  });
  describe("Base64", () => {
    it.skip("uses base64 to encode", () => {
      // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
    });
    it.skip("uses base64 to decode", () => {
      // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
    });
    it.skip("handles non-strict base64 encoding", () => {
      // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
    });
    describe("Marshal", () => {
      it.skip("marshals and base64 encodes", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("marshals and base64 decodes", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("rescues failures on decode", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
    });
    describe("JSON", () => {
      it.skip("JSON and base64 encodes", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("JSON and base64 decodes", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("rescues failures on decode", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
    });
    describe("ZipJSON", () => {
      it.skip("jsons, deflates, and base64 encodes", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("base64 decodes, inflates, and decodes json", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
      it.skip("rescues failures on decode", () => {
        // PERMANENT-SKIP: RFC 0133 non-goal — Rails CookieStore subclasses AbstractSecureStore, not Rack::Session::Cookie
      });
    });
  });
});
