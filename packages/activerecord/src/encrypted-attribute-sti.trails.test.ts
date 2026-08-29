import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Company } from "./test-helpers/models/company.js";
import { fixtures } from "./test-fixtures.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./encryption/test-helpers.js";

class EncryptedCompany extends Company {}
class OtherEncryptedCompany extends Company {}
class ReflectedEncryptedCompany extends Company {}

const defTypeFor = (klass: typeof Company, name: string) => klass.typeForAttribute(name);

const encryptedAttributesOf = (klass: typeof Company) =>
  (klass as unknown as { encryptedAttributes?: Set<string> }).encryptedAttributes ??
  new Set<string>();

describe("STI subclass encrypts", () => {
  fixtures([]);

  const snapshot = snapshotEncryptionConfig();
  beforeAll(() => configureEncryption());
  afterAll(() => restoreEncryptionConfig(snapshot));

  it("does not leak the encrypted cast type onto the STI base or siblings", async () => {
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

    expect((await EncryptedCompany.find(encrypted.id)).description).toBe(secret);
    expect(encrypted.ciphertextFor("description")).not.toBe(secret);

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

    void ReflectedEncryptedCompany.resetColumnInformation();
    await Company.loadSchema();
    await ReflectedEncryptedCompany.loadSchema();

    expect(defTypeFor(ReflectedEncryptedCompany, "description")).toBeInstanceOf(
      EncryptedAttributeType,
    );
    expect(defTypeFor(Company, "description")).not.toBeInstanceOf(EncryptedAttributeType);
  });
});
