import { describe, it } from "vitest";

import { MessageVerifier } from "../message-verifier.js";
import { extractOptionsBang } from "../hash-utils.js";
import {
  assertRotate,
  messageRotatorTests,
  type RotatorCodecHooks,
} from "./message-rotator-tests.js";

describe("MessageVerifierRotatorTest", () => {
  const secret = (key: string): string => key;

  const hooks: RotatorCodecHooks<MessageVerifier> = {
    secret,

    makeCodec(...args: unknown[]): MessageVerifier {
      const [positional, options] = extractOptionsBang(args);
      return new MessageVerifier((positional[0] as string) ?? secret("secret"), options);
    },

    encode(data: unknown, verifier: MessageVerifier, options = {}): string {
      return verifier.generate(data, options);
    },

    decode(message: string, verifier: MessageVerifier, options = {}): unknown {
      return verifier.verified(message, options);
    },
  };

  messageRotatorTests(hooks);

  it("rotate digest", () => {
    assertRotate(hooks, [{ digest: "SHA256" }], [[{ digest: "SHA1" }], [{ digest: "MD5" }]]);
  });
});
