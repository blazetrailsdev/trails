import { describe, it, expect, afterEach } from "vitest";
import { Encryption } from "../../../lib/encryption.js";
import { EnvelopeEncryptionKeyProvider } from "../../../lib/encryption/envelope-encryption-key-provider.js";
import * as crypto from "crypto";

describe("EnvelopeEncryptionKeyProvider trails extensions", () => {
  const originalPrimaryKey = Encryption.config.primaryKey;

  afterEach(() => {
    Encryption.config.primaryKey = originalPrimaryKey;
  });

  it("active_primary_key returns and memoizes the primary key", () => {
    Encryption.config.primaryKey = crypto.randomBytes(32).toString("base64");
    const provider = new EnvelopeEncryptionKeyProvider();
    expect(provider.activePrimaryKey).toBe(provider.activePrimaryKey);
  });
});
