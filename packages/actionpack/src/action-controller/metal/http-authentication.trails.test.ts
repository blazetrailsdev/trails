import { describe, expect, it } from "vitest";
import { HttpAuthentication } from "./http-authentication.js";

describe("HttpAuthentication::Basic", () => {
  it("encode_credentials encodes non-ASCII credentials as UTF-8", () => {
    expect(HttpAuthentication.Basic.encodeCredentials("josé", "ñ☃")).toBe("Basic am9zw6k6w7HimIM=");
  });
});
