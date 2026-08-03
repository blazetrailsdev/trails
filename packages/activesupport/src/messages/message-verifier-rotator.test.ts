import { describe, expect, it } from "vitest";
import { MessageVerifier } from "../message-verifier.js";

const DATA = [{ a_boolean: true, a_number: 123, a_string: "abc" }];

function makeCodec(options: Record<string, unknown> = {}): MessageVerifier {
  return new MessageVerifier("secret", options);
}

function assertRotate(current: Record<string, unknown>, ...old: Record<string, unknown>[]): void {
  const currentCodec = makeCodec(current);

  for (const oldOptions of old) {
    currentCodec.rotate(oldOptions);
    const oldMessage = makeCodec(oldOptions).generate(DATA);

    expect(currentCodec.verified(oldMessage)).toEqual(DATA);
  }
}

describe("MessageVerifierRotatorTest", () => {
  it("rotate digest", () => {
    assertRotate({ digest: "SHA256" }, { digest: "SHA1" }, { digest: "MD5" });
  });
});
