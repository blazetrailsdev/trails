import { describe, expect, it } from "vitest";

import { MessageEncryptor } from "../message-encryptor.js";
import { MessageVerifier } from "../message-verifier.js";

describe("Messages::Codec (trails)", () => {
  it("subclasses default to the json serializer", () => {
    expect(MessageEncryptor.defaultSerializer).toBe("json");
    expect(MessageVerifier.defaultSerializer).toBe("json");
  });
});
