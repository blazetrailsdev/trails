import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  assertEncryptedAttribute,
  assertNotEncryptedAttribute,
  Encryption,
} from "./test-helpers.js";
import { fixtures } from "../test-fixtures.js";
import type { EncryptedPost as EncryptedPostType } from "../test-helpers/models/post-encrypted.js";
import { Decryption } from "./errors.js";

let EncryptedPost: typeof EncryptedPostType;

fixtures([]);
beforeAll(async () => {
  configureEncryption();
  ({ EncryptedPost } = await import("../test-helpers/models/post-encrypted.js"));
  await EncryptedPost.loadSchema();
});

describe("ActiveRecord::Encryption::UnencryptedAttributesTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Encryption.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("when :support_unencrypted_data is off, it works with unencrypted attributes normally", async () => {
    Encryption.config.supportUnencryptedData = true;

    const post = await Encryption.withoutEncryption(() =>
      EncryptedPost.create({ title: "The Starfleet is here!", body: "take cover!" }),
    );
    assertNotEncryptedAttribute(post, "title", "The Starfleet is here!");

    await post.update({ title: "Other title" });
    await post.reload();
    await assertEncryptedAttribute(post, "title", "Other title");
  });

  it("when :support_unencrypted_data is on, it won't work with unencrypted attributes", async () => {
    Encryption.config.supportUnencryptedData = false;

    const post = await Encryption.withoutEncryption(() =>
      EncryptedPost.create({ title: "The Starfleet is here!", body: "take cover!" }),
    );

    expect(() => post.title).toThrow(Decryption);
  });
});
