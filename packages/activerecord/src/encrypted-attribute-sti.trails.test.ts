/**
 * trails-only: `encrypts` declared on an STI subclass must wrap the cast type
 * for that subclass only. Rails keeps this per-class (`encrypted_attributes` is
 * a `class_attribute` and `_default_attributes` replays only the class's own
 * pending decorators — see
 * `activerecord/lib/active_record/encryption/encryptable_record.rb` and
 * `activemodel/lib/active_model/attribute_registration.rb`), but `Base.encrypts`
 * deliberately routed an STI subclass declaration to the STI base, so the base
 * and every sibling subclass saw the `EncryptedAttributeType`.
 *
 * Mirrors the `normalizes` guard in `normalized-attribute.trails.test.ts`: the
 * leak only reproduces when the SUBCLASS drives the first reflection of the STI
 * table, so this file must own that first reflection — do not add a test above
 * that reflects `Company` (or another subclass) first, or the guard silently
 * stops guarding.
 *
 * Encrypts `description` rather than `name`: `name` is a restricted attribute
 * (no dirty tracking), which would muddy the persistence round-trip below.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Company } from "./test-helpers/models/company.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./encryption/test-helpers.js";

class EncryptedCompany extends Company {}
class OtherEncryptedCompany extends Company {}
class ReflectedEncryptedCompany extends Company {}

// Resolve through typeForAttribute — Rails' single lookup surface. The eager
// `_attributeDefinitions` back-compat view this used to read is retired.
const defTypeFor = (klass: typeof Company, name: string) => klass.typeForAttribute(name);

const encryptedAttributesOf = (klass: typeof Company) =>
  (klass as unknown as { _encryptedAttributes?: Set<string> })._encryptedAttributes ??
  new Set<string>();

describe("STI subclass encrypts", () => {
  fixtures([]);

  // Encryption must be configured before any declaration runs — buildScheme has
  // no lazy fallback.
  const snapshot = snapshotEncryptionConfig();
  beforeAll(() => configureEncryption());
  afterAll(() => restoreEncryptionConfig(snapshot));

  it("does not leak the encrypted cast type onto the STI base or siblings", async () => {
    // The subclass must drive the FIRST reflection of the STI table — that is
    // the path that used to install the base's map as an own property.
    await EncryptedCompany.loadSchema();
    await Company.loadSchema();

    EncryptedCompany.encrypts("description");

    expect(defTypeFor(EncryptedCompany, "description")).toBeInstanceOf(EncryptedAttributeType);
    expect(defTypeFor(Company, "description")).not.toBeInstanceOf(EncryptedAttributeType);
    expect(defTypeFor(OtherEncryptedCompany, "description")).not.toBeInstanceOf(
      EncryptedAttributeType,
    );

    expect(encryptedAttributesOf(EncryptedCompany)).toContain("description");
    expect(encryptedAttributesOf(Company)).not.toContain("description");
    expect(encryptedAttributesOf(OtherEncryptedCompany)).not.toContain("description");
  });

  it("encrypts at rest for the subclass while the base stores plaintext", async () => {
    const secret = "a confidential description";

    const encrypted = await EncryptedCompany.create({ name: "enc", description: secret });
    const plain = await Company.create({ name: "plain", description: secret });

    // Decrypts transparently on read-back through the declaring subclass.
    expect((await EncryptedCompany.find(encrypted.id)).description).toBe(secret);
    expect(encrypted.ciphertextFor("description")).not.toBe(secret);

    // The base never had the decoration, so it round-trips plaintext — and the
    // stored bytes really are plaintext, which is what the leak would have changed.
    const reloadedPlain = await Company.find(plain.id);
    expect(reloadedPlain.description).toBe(secret);
    expect(reloadedPlain.encryptedAttribute("description")).toBe(false);
  });

  it("keeps the subclass decoration across a schema reset and re-reflection", async () => {
    await ReflectedEncryptedCompany.loadSchema();
    await Company.loadSchema();

    ReflectedEncryptedCompany.encrypts("description");
    expect(defTypeFor(ReflectedEncryptedCompany, "description")).toBeInstanceOf(
      EncryptedAttributeType,
    );

    // Rails re-seeds `_default_attributes` from `columns_hash` and replays the
    // pending-decorator chain on every rebuild, so reflection must not revert
    // (or drop) the subclass's encrypted definition — it has to survive on the
    // `_pendingEncryptions` replay buffer plus copy-on-write.
    ReflectedEncryptedCompany.resetColumnInformation();
    await Company.loadSchema();
    await ReflectedEncryptedCompany.loadSchema();

    expect(defTypeFor(ReflectedEncryptedCompany, "description")).toBeInstanceOf(
      EncryptedAttributeType,
    );
    expect(defTypeFor(Company, "description")).not.toBeInstanceOf(EncryptedAttributeType);
  });
});
