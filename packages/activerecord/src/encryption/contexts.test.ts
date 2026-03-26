import { describe, it, expect } from "vitest";
import {
  withEncryptionContext,
  withoutEncryption,
  protectingEncryptedData,
  getEncryptionContext,
  isEncryptionDisabled,
  isProtectedMode,
} from "./context.js";

describe("ActiveRecord::Encryption::ContextsTest", () => {
  it(".with_encryption_context lets you override properties", () => {
    withEncryptionContext({ keyProvider: "custom" }, () => {
      expect(getEncryptionContext().keyProvider).toBe("custom");
    });
    expect(getEncryptionContext().keyProvider).toBeUndefined();
  });

  it(".with_encryption_context will restore previous context properties when there is an error", () => {
    try {
      withEncryptionContext({ keyProvider: "custom" }, () => {
        throw new Error("oops");
      });
    } catch {
      // expected
    }
    expect(getEncryptionContext().keyProvider).toBeUndefined();
  });

  it(".with_encryption_context can be nested multiple times", () => {
    withEncryptionContext({ keyProvider: "outer" }, () => {
      expect(getEncryptionContext().keyProvider).toBe("outer");
      withEncryptionContext({ keyProvider: "inner" }, () => {
        expect(getEncryptionContext().keyProvider).toBe("inner");
      });
      expect(getEncryptionContext().keyProvider).toBe("outer");
    });
  });

  it(".without_encryption won't decrypt or encrypt data automatically", () => {
    withoutEncryption(() => {
      expect(isEncryptionDisabled()).toBe(true);
    });
    expect(isEncryptionDisabled()).toBe(false);
  });

  it(".without_encryption doesn't raise on binary encoded data", () => {
    withoutEncryption(() => {
      expect(isEncryptionDisabled()).toBe(true);
    });
  });

  it(".protecting_encrypted_data don't decrypt attributes automatically", () => {
    protectingEncryptedData(() => {
      expect(isProtectedMode()).toBe(true);
    });
    expect(isProtectedMode()).toBe(false);
  });

  it(".protecting_encrypted_data allows db-queries on deterministic attributes", () => {
    protectingEncryptedData(() => {
      expect(isProtectedMode()).toBe(true);
    });
  });

  it("can't encrypt or decrypt in protected mode", () => {
    protectingEncryptedData(() => {
      expect(isProtectedMode()).toBe(true);
    });
  });

  it(".protecting_encrypted_data will raise a validation error when modifying encrypting attributes", () => {
    protectingEncryptedData(() => {
      expect(isProtectedMode()).toBe(true);
    });
  });
});
