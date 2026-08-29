import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  assertEncryptedAttribute,
  assertNotEncryptedAttribute,
  withoutEncryption,
} from "./test-helpers.js";
import { fixtures } from "../test-fixtures.js";
import type { EncryptedPost as EncryptedPostType } from "../test-helpers/models/post-encrypted.js";
import { Configurable } from "./configurable.js";
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
    Configurable.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("when :support_unencrypted_data is off, it works with unencrypted attributes normally", async () => {
    Configurable.config.supportUnencryptedData = true;

    const post = await withoutEncryption(() =>
      EncryptedPost.create({ title: "The Starfleet is here!", body: "take cover!" }),
    );
    assertNotEncryptedAttribute(post, "title", "The Starfleet is here!");

    await post.update({ title: "Other title" });
    await post.reload();
    await assertEncryptedAttribute(post, "title", "Other title");
  });

  it("when :support_unencrypted_data is on, it won't work with unencrypted attributes", async () => {
    Configurable.config.supportUnencryptedData = false;

    const post = await withoutEncryption(() =>
      EncryptedPost.create({ title: "The Starfleet is here!", body: "take cover!" }),
    );

    expect(() => post.title).toThrow(Decryption);
  });
});
