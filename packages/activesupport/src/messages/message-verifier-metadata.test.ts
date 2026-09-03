import { describe, expect, it } from "vitest";

import { InvalidSignature, MessageVerifier } from "../message-verifier.js";
import { Temporal } from "@blazetrails/date";
import { currentTimeInstant } from "../time-travel.js";
import type { MessageSerializer } from "./codec.js";
import type { Format } from "./serializer-with-fallback.js";
import {
  eachScenario as eachSerializerScenario,
  freezeTime,
  messageMetadataTests,
  usingMessageSerializerForMetadata,
} from "./message-metadata-tests.js";

describe("MessageVerifierMetadataTest", () => {
  const makeCodec = (serializer: Format | MessageSerializer): MessageVerifier =>
    new MessageVerifier("secret", { serializer });

  messageMetadataTests<MessageVerifier>({
    makeCodec,
    encode: (data, verifier, options) => verifier.generate(data, options),
    decode: (message, verifier, options) => verifier.verified(message, options),
  });

  const eachScenario = (block: (data: unknown, verifier: MessageVerifier) => void): void =>
    eachSerializerScenario(makeCodec, block);

  it("#verify raises when :purpose does not match", () => {
    eachScenario((data, verifier) => {
      expect(verifier.verify(verifier.generate(data, { purpose: "x" }), { purpose: "x" })).toEqual(
        data,
      );

      expect(() =>
        verifier.verify(verifier.generate(data, { purpose: "x" }), { purpose: "y" }),
      ).toThrow(InvalidSignature);

      expect(() => verifier.verify(verifier.generate(data), { purpose: "y" })).toThrow(
        InvalidSignature,
      );

      expect(() => verifier.verify(verifier.generate(data, { purpose: "x" }))).toThrow(
        InvalidSignature,
      );
    });
  });

  it("#verify raises when message is expired via :expires_at", () => {
    freezeTime((travel) => {
      eachScenario((data, verifier) => {
        const message = verifier.generate(data, {
          expiresAt: currentTimeInstant().add({ seconds: 1 }),
        });

        travel({ milliseconds: 500 });
        expect(verifier.verify(message)).toEqual(data);

        travel({ milliseconds: 500 });
        expect(() => verifier.verify(message)).toThrow(InvalidSignature);
      });
    });
  });

  it("#verify raises when message is expired via :expires_in", () => {
    freezeTime((travel) => {
      eachScenario((data, verifier) => {
        const message = verifier.generate(data, { expiresIn: 1 });

        travel({ milliseconds: 500 });
        expect(verifier.verify(message)).toEqual(data);

        travel({ milliseconds: 500 });
        expect(() => verifier.verify(message)).toThrow(InvalidSignature);
      });
    });
  });

  it("messages are readable by legacy versions when use_message_serializer_for_metadata = false", () => {
    const legacyMessage =
      "eyJfcmFpbHMiOnsibWVzc2FnZSI6IklteGxaMkZqZVNJPSIsImV4cCI6IjMwMDAtMDEtMDFUMDA6MDA6MDAuMDAwWiIsInB1ciI6InRlc3QifX0=--81b11c317dba91cedd86ab79b7d7e68de8d290b3";

    const verifier = new MessageVerifier("secret", { serializer: "json" });

    usingMessageSerializerForMetadata(false, () => {
      expect(
        verifier.generate("legacy", {
          purpose: "test",
          expiresAt: Temporal.Instant.from("3000-01-01T00:00:00Z"),
        }),
      ).toEqual(legacyMessage);
    });
  });

  it("messages are readable by legacy versions when force_legacy_metadata_serializer is true", () => {
    const legacyMessage =
      "eyJfcmFpbHMiOnsibWVzc2FnZSI6IklteGxaMkZqZVNJPSIsImV4cCI6IjMwMDAtMDEtMDFUMDA6MDA6MDAuMDAwWiIsInB1ciI6InRlc3QifX0=--81b11c317dba91cedd86ab79b7d7e68de8d290b3";

    usingMessageSerializerForMetadata(true, () => {
      const verifier = new MessageVerifier("secret", {
        serializer: "json",
        forceLegacyMetadataSerializer: true,
      });

      expect(
        verifier.generate("legacy", {
          purpose: "test",
          expiresAt: Temporal.Instant.from("3000-01-01T00:00:00Z"),
        }),
      ).toEqual(legacyMessage);
    });
  });

  it("messages keep the old format when use_message_serializer_for_metadata is false", () => {
    const legacyMessage =
      "eyJfcmFpbHMiOnsibWVzc2FnZSI6IklteGxaMkZqZVNJPSIsImV4cCI6bnVsbCwicHVyIjoidGVzdCJ9fQ==--53b1fc02f5b89b2da8c6ce94efa95f5cb656d975";

    const verifier = new MessageVerifier("secret", { serializer: "json" });

    usingMessageSerializerForMetadata(false, () => {
      expect(verifier.generate("legacy", { purpose: "test" })).toEqual(legacyMessage);
    });
  });
});
