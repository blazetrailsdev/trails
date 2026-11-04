import { createHmac, timingSafeEqual } from "node:crypto";
import { ArgumentError, Base64, toI } from "@blazetrails/ruby-compat";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

class DecodeError extends Error {}
/** Hierarchy from jwt-3.3.0 `lib/jwt/error.rb:15-50`, the version the submission pins. */
class TokenError extends DecodeError {}
class MalformedTokenError extends TokenError {}
class Base64DecodeError extends MalformedTokenError {}
class SignatureError extends TokenError {}
class VerificationError extends SignatureError {}
class ClaimValidationError extends TokenError {}
class ExpiredSignature extends ClaimValidationError {}
class ImmatureSignature extends ClaimValidationError {}

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function urlDecode(str: string): Buffer {
  try {
    return Buffer.from(Base64.urlsafeDecode64(str), "latin1");
  } catch (e) {
    if (!(e instanceof ArgumentError) || e.message !== "invalid base64") throw e;
    throw new Base64DecodeError("Invalid base64 encoding");
  }
}

function decodeSegment(segment: string): unknown {
  const raw = urlDecode(segment);
  try {
    return JSON.parse(UTF8.decode(raw));
  } catch {
    throw new DecodeError("Invalid segment encoding");
  }
}

/** `SignatureError` on a missing key is jwt-3.3.0 `lib/jwt/decode.rb:54`. */
function decode(
  token: string,
  key: string | null | undefined,
  verify: boolean,
  options: { algorithm: "HS256" },
): [unknown, Record<string, unknown>] {
  const segments = token.split(".");
  if (segments.length !== 3) throw new DecodeError("Not enough or too many segments");
  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = decodeSegment(headerSegment) as Record<string, unknown>;
  const payload = decodeSegment(payloadSegment);
  if (verify) {
    if (header?.alg !== options.algorithm) throw new DecodeError("Expected a different algorithm");
    if (key == null) throw new SignatureError("No verification key available");
    const expected = createHmac("sha256", key)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest();
    const signature = urlDecode(signatureSegment);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      throw new VerificationError("Signature verification failed");
    }
    if (isHash(payload) && Object.hasOwn(payload, "exp")) {
      if (toI(payload.exp) <= Math.trunc(Date.now() / 1000)) {
        throw new ExpiredSignature("Signature has expired");
      }
    }
    if (isHash(payload) && Object.hasOwn(payload, "nbf")) {
      if (toI(payload.nbf) > Math.trunc(Date.now() / 1000)) {
        throw new ImmatureSignature("Signature nbf has not been reached");
      }
    }
  }
  return [payload, header];
}

export const JWT = {
  DecodeError,
  ExpiredSignature,
  ImmatureSignature,
  Base64DecodeError,
  SignatureError,
  VerificationError,
  decode,
};
