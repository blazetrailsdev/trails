import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import * as Encryption from "./index.js";

describe("EncryptionMessagePackMessageSerializerTrailsTest", () => {
  it("test_encryption_entry_does_not_load_active_support_message_pack", () => {
    expect(Encryption.Encryptor).toBeDefined();

    expect(TopLevel.ActiveSupport?.MessagePack).toBeUndefined();
  });

  it("test_encryption_entry_does_not_export_message_pack_message_serializer", () => {
    expect("MessagePackMessageSerializer" in Encryption).toBe(false);
  });
});
