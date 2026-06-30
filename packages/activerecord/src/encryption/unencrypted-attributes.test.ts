import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  assertEncryptedAttribute,
  assertNotEncryptedAttribute,
  withoutEncryption,
} from "./test-helpers.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import type { EncryptedPost as EncryptedPostType } from "../test-helpers/models/post-encrypted.js";
import { Configurable } from "./configurable.js";
import { Decryption as DecryptionError } from "./errors.js";

// EncryptedPost's `body` key provider (MutableDerivedSecretKeyProvider) derives
// its key eagerly at class-initialization, so encryption config must be set
// before the model is imported — load it lazily after configureEncryption().
let EncryptedPost: typeof EncryptedPostType;

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  configureEncryption();
  ({ EncryptedPost } = await import("../test-helpers/models/post-encrypted.js"));
  await defineSchema({ posts: TEST_SCHEMA.posts });
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

    // It will encrypt on saving
    await post.update({ title: "Other title" });
    await assertEncryptedAttribute(await EncryptedPost.find(post.id), "title", "Other title");
  });

  it("when :support_unencrypted_data is on, it won't work with unencrypted attributes", async () => {
    Configurable.config.supportUnencryptedData = false;

    const post = await withoutEncryption(() =>
      EncryptedPost.create({ title: "The Starfleet is here!", body: "take cover!" }),
    );

    expect(() => post.title).toThrow(DecryptionError);
  });
});
