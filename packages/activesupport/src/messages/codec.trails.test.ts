import { describe, expect, it } from "vitest";

import { MessageEncryptor } from "../message-encryptor.js";
import { MessageVerifier } from "../message-verifier.js";

describe("Messages::Codec (trails)", () => {
  // trails-only: MessageEncryptor/MessageVerifier override `defaultSerializer`
  // to `:json` (Rails leaves both on Codec's `:marshal`) so existing signed and
  // encrypted payloads stay readable. See the comment at each override.
  it("subclasses default to the json serializer", () => {
    expect(MessageEncryptor.defaultSerializer).toBe("json");
    expect(MessageVerifier.defaultSerializer).toBe("json");
  });
});
