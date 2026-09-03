import { describe, expect, it } from "vitest";
import { assertNot, assertRaises } from "./testing/assertions.js";

import { getCrypto } from "@blazetrails/ruby-compat";
import { ActiveSupportJSON } from "./json.js";
import { Encoding } from "./json/encoding.js";
import { base58 } from "./core-ext/securerandom.js";
import { InvalidSignature, MessageVerifier } from "./message-verifier.js";
import type { MessageSerializer } from "./messages/codec.js";
import { ArgumentError } from "./messages/serializer-with-fallback.js";
import { Temporal } from "@blazetrails/date";
import { currentTimeInstant } from "./time-travel.js";

const JSONSerializer: MessageSerializer = {
  dump(value: unknown): string {
    return ActiveSupportJSON.encode(value);
  },

  load(value: string): unknown {
    return ActiveSupportJSON.decode(value);
  },
};

describe("MessageVerifierTest", () => {
  const verifier = new MessageVerifier("Hey, I'm a secret!");
  /**
   * Rails' `@data` also carries a `Time.utc(2010)` under `"now"`; a temporal
   * value does not survive the `:json` serializer as a temporal (it decodes
   * back as a string), so it is dropped here — same reason the shared
   * `messages/message-metadata-tests.ts` `DATA` drops its `Time.local(2004)`.
   */
  const data = { some: "data" };
  const secret = Buffer.from(getCrypto().randomBytes(32));

  it("valid message", () => {
    const [encoded, hash] = verifier.generate(data).split("--") as [string, string];
    assertNot(verifier.validMessage(null as unknown as string));
    assertNot(verifier.validMessage(""));
    assertNot(verifier.validMessage("\xff")); // invalid encoding
    assertNot(verifier.validMessage(`${[...encoded].reverse().join("")}--${hash}`));
    assertNot(verifier.validMessage(`${encoded}--${[...hash].reverse().join("")}`));
    assertNot(verifier.validMessage("purejunk"));
  });

  it("simple round tripping", () => {
    const message = verifier.generate(data);
    expect(verifier.verified(message)).toEqual(data);
    expect(verifier.verify(message)).toEqual(data);
  });

  it("round tripping nil", () => {
    const message = verifier.generate(null);
    expect(verifier.verified(message)).toBeNull();
    expect(verifier.verify(message)).toBeNull();
  });

  it("verified returns false on invalid message", () => {
    expect(verifier.verified("purejunk")).toBeFalsy();
  });

  it("verify exception on invalid message", () => {
    expect(() => verifier.verify("purejunk")).toThrow(InvalidSignature);
  });

  it("supports URL-safe encoding", () => {
    const urlSafeVerifier = new MessageVerifier(secret, { url_safe: true, serializer: "json" });

    // To verify that the message payload uses a URL-safe encoding (i.e. does not
    // use "+" or "/"), the unencoded bytes should have a 6-bit aligned
    // occurrence of `0b111110` or `0b111111`.  Also, to verify that the message
    // payload is unpadded, the number of unencoded bytes should not be a
    // multiple of 3.
    //
    // The JSON serializer adds quotes around strings, adding 1 byte before and
    // 1 byte after the input string.  So we choose an input string of "??",
    // which is serialized as:
    //   00100010 00111111 00111111 00100010
    // Which is 6-bit aligned as:
    //   001000 100011 111100 111111 001000 10xxxx
    const payload = "??";
    const message = urlSafeVerifier.generate(payload);

    expect(urlSafeVerifier.verified(message)).toEqual(payload);
    expect(encodeURIComponent(message)).toEqual(message);
    expect(
      message.slice(0, message.lastIndexOf("--")).length % 4,
      "Unable to assert that the message payload is unpadded, because it does not require padding",
    ).not.toEqual(0);
  });

  it("URL-safe and URL-unsafe can decode each other messages", () => {
    const safeVerifier = new MessageVerifier(secret, { url_safe: true, serializer: "json" });
    const unsafeVerifier = new MessageVerifier(secret, { url_safe: false, serializer: "json" });

    const payload = "??";

    expect(safeVerifier.generate(payload)).toEqual(safeVerifier.generate(payload));
    expect(safeVerifier.generate(payload)).not.toEqual(unsafeVerifier.generate(payload));

    expect(unsafeVerifier.verify(safeVerifier.generate(payload))).toEqual(payload);
    expect(safeVerifier.verify(unsafeVerifier.generate(payload))).toEqual(payload);

    for (let i = 0; i < 50; i++) {
      const random = base58(10 + Math.floor(Math.random() * 41));
      expect(unsafeVerifier.verify(safeVerifier.generate(random))).toEqual(random);
      expect(safeVerifier.verify(unsafeVerifier.generate(random))).toEqual(random);
    }
  });

  it("alternative serialization method", () => {
    const prev = Encoding.useStandardJsonTimeFormat;
    Encoding.useStandardJsonTimeFormat = true;
    try {
      const jsonVerifier = new MessageVerifier("Hey, I'm a secret!", {
        serializer: JSONSerializer,
      });
      const message = jsonVerifier.generate({
        foo: 123,
        bar: Temporal.Instant.from("2010-01-01T00:00:00Z"),
      });
      const exp = { foo: 123, bar: "2010-01-01T00:00:00.000Z" };
      expect(jsonVerifier.verified(message)).toEqual(exp);
      expect(jsonVerifier.verify(message)).toEqual(exp);
    } finally {
      Encoding.useStandardJsonTimeFormat = prev;
    }
  });

  it("verify with parse json times", () => {
    // Rails brackets this with `ActiveSupport.parse_json_times = true` and
    // `Time.zone = "UTC"`; trails has neither knob — `parseExpiry` always
    // parses the metadata timestamp itself, in UTC.
    expect(
      verifier.verify(
        verifier.generate("hi", { expiresAt: currentTimeInstant().add({ seconds: 10 }) }),
      ),
    ).toEqual("hi");
  });

  it("raise error when secret is nil", async () => {
    const exception = await assertRaises([ArgumentError], {}, () => {
      new MessageVerifier(null as unknown as string);
    });

    expect(exception.message).toEqual("Secret should not be nil.");
  });

  // Ruby's `inspect` is a core value-protocol method with no TypeScript
  // analogue — see SKIP_GROUPS in scripts/api-compare/conventions.ts.
  it.skip("inspect does not show secrets");
});
