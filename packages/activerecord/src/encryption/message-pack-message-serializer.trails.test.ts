import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import * as Encryption from "./index.js";

describe("EncryptionMessagePackMessageSerializerTrailsTest", () => {
  it("test_encryption_entry_does_not_load_active_support_message_pack", () => {
    expect(Object.keys(Encryption).length).toBeGreaterThan(0);
    expect(TopLevel.ActiveSupport?.MessagePack).toBeUndefined();
  });

  it("test_encryption_entry_does_not_export_message_pack_message_serializer", () => {
    expect("MessagePackMessageSerializer" in Encryption).toBe(false);
  });

  it("test_the_serializer_module_still_carries_the_class", async () => {
    const { MessagePackMessageSerializer } = await import("./message-pack-message-serializer.js");

    expect(typeof MessagePackMessageSerializer).toBe("function");
    expect(TopLevel.ActiveSupport?.MessagePack).toBeDefined();
  });
});
