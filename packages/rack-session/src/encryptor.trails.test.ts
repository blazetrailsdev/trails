import { Base64, SecureRandom } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { Encryptor } from "./index.js";

describe("Rack::Session::Encryptor (trails)", () => {
  const secret = SecureRandom.randomBytes(64);

  it("round-trips non-ASCII under serialize_json", () => {
    for (const padSize of [32, null]) {
      const encryptor = new Encryptor(secret, { serializeJson: true, padSize });
      const message = encryptor.encrypt({ foo: "€ café 😀" });
      expect(encryptor.decrypt(message)).toEqual({ foo: "€ café 😀" });
    }
  });

  it("decrypts a cookie Ruby's Rack::Session::Encryptor wrote", () => {
    const encryptor = new Encryptor("x".repeat(64), { serializeJson: true, purpose: "cookie" });
    const message =
      "AT8AU-ZgwldWlH1qSxMhPCRWPTT2X48C13lAvvm3KJ29RvbcIyTisONm4OFdm-VVMvOB4cnhxoLUaFxU1PJ2blcUOufERgTYSaGSkIv6ccM3OwexiRY5WA5rGRJxT_L-dDF7MGbKKPLh6gPvLcdZTd8=";
    expect(encryptor.decrypt(message)).toEqual({ foo: "bar" });
  });

  it("raises InvalidMessage for a message shorter than the signature", () => {
    const encryptor = new Encryptor(secret);
    expect(() => encryptor.decrypt(Base64.urlsafeEncode64("short"))).toThrow(
      Encryptor.InvalidMessage,
    );
  });

  it("treats a false purpose as no purpose", () => {
    const message = new Encryptor(secret).encrypt({ foo: "bar" });
    expect(() => new Encryptor(secret, { purpose: false }).decrypt(message)).not.toThrow();
  });
});
