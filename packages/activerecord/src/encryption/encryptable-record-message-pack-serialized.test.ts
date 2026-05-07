import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::EncryptableRecordMessagePackSerializedTest", () => {
  it.skip("binary data can be serialized with message pack", () => {
    // BLOCKED: encryption — encryption subsystem gap in encryptable-record-message-pack-serialized
    // ROOT-CAUSE: encryption/encryptable-record-message-pack-serialized.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in encryption/encryptable-record-message-pack-serialized.ts; affects ~6–28 tests in encryptable-record-message-pack-serialized.test.ts
  });
  it.skip("binary data can be encrypted uncompressed and serialized with message pack", () => {
    // BLOCKED: encryption — encryption subsystem gap in encryptable-record-message-pack-serialized
    // ROOT-CAUSE: encryption/encryptable-record-message-pack-serialized.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in encryption/encryptable-record-message-pack-serialized.ts; affects ~6–28 tests in encryptable-record-message-pack-serialized.test.ts
  });
  it.skip("text columns cannot be serialized with message pack", () => {
    // BLOCKED: encryption — encryption subsystem gap in encryptable-record-message-pack-serialized
    // ROOT-CAUSE: encryption/encryptable-record-message-pack-serialized.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in encryption/encryptable-record-message-pack-serialized.ts; affects ~6–28 tests in encryptable-record-message-pack-serialized.test.ts
  });
});
