import { describe, it } from "vitest";
import { MessageEncryptor } from "./message-encryptor.js";

describe("MessageEncryptorTest", () => {
  const secret = "a".repeat(32);
  const encryptor = new MessageEncryptor(secret);

  it.skip("inspect does not show secrets");
});
