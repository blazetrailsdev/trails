import { createHmac, timingSafeEqual } from "node:crypto";
import { toI } from "@blazetrails/ruby-compat";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

class DecodeError extends Error {}
class ExpiredSignature extends DecodeError {}
class ImmatureSignature extends DecodeError {}

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new DecodeError("Invalid segment encoding");
  let json: unknown;
  try {
    json = JSON.parse(UTF8.decode(Buffer.from(segment, "base64url")));
  } catch {
    throw new DecodeError("Invalid segment encoding");
  }
  return json;
}

function decode(
  token: string,
  key: string,
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
    const expected = createHmac("sha256", key)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest();
    const signature = Buffer.from(signatureSegment, "base64url");
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      throw new DecodeError("Signature verification failed");
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

export const JWT = { DecodeError, ExpiredSignature, ImmatureSignature, decode };
