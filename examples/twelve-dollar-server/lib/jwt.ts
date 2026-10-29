import { createHmac, timingSafeEqual } from "node:crypto";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

class DecodeError extends Error {}

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
  const payload = decodeSegment(payloadSegment) as Record<string, unknown>;
  if (verify) {
    if (header?.alg !== options.algorithm) throw new DecodeError("Expected a different algorithm");
    const expected = createHmac("sha256", key)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest();
    const signature = Buffer.from(signatureSegment, "base64url");
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      throw new DecodeError("Signature verification failed");
    }
    const now = Date.now() / 1000;
    if (typeof payload?.exp !== "number" || payload.exp <= now) {
      throw new DecodeError("Signature has expired");
    }
    if ("nbf" in payload && (typeof payload.nbf !== "number" || payload.nbf > now)) {
      throw new DecodeError("Signature nbf has not been reached");
    }
  }
  return [payload, header];
}

export const JWT = { DecodeError, decode };
