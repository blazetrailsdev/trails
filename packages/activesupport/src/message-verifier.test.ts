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
  const data = { some: "data" };
  const secret = Buffer.from(getCrypto().randomBytes(32));

  it("valid message", () => {
    const [encoded, hash] = verifier.generate(data).split("--") as [string, string];
    assertNot(verifier.validMessage(null as unknown as string));
    assertNot(verifier.validMessage(""));
    assertNot(verifier.validMessage("\xff"));
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

  it.skip("inspect does not show secrets");
});
